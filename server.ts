import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import os from 'os';
import fs from 'fs';
import { z } from 'zod';
import dotenv from 'dotenv';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  createSessionToken,
  readSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken,
} from './src/services/session.ts';
import {
  DeviceInfo,
  DeviceInputCommand,
  SyncExecutionRequest,
  SyncExecutionResponse,
  DeviceExecutionResult,
  SystemStats,
  EnvironmentAuditReport,
  AuditLogEntry,
  NgrokConfig,
  WebSocketServerMessage,
  ResourceProfile,
  InstalledPackage,
  InstallApkRequest,
  InstallApkResponse,
} from './src/types/index.ts';
import { AndroidRuntimeManager, type RuntimeDevice } from './src/services/androidRuntime.ts';

dotenv.config();

const APP_PORT = Number(process.env.APP_PORT || '3000');
const AUTH_ENABLED = process.env.AUTH_ENABLED
  ? process.env.AUTH_ENABLED === 'true'
  : process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || '';
const NGROK_AUTH_TOKEN = process.env.NGROK_AUTH_TOKEN || '';
const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const activeSessions = new Map<string, number>();
const socketSessions = new WeakMap<WebSocket, string>();

// --- VALIDATION SCHEMAS ---
const InputCommandSchema = z.object({
  type: z.enum(['tap', 'swipe', 'key', 'text', 'launch', 'rotate', 'screenshot', 'reboot']),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  startX: z.number().min(0).max(1).optional(),
  startY: z.number().min(0).max(1).optional(),
  endX: z.number().min(0).max(1).optional(),
  endY: z.number().min(0).max(1).optional(),
  durationMs: z.number().min(10).max(5000).optional(),
  keycode: z.string().max(40).optional(),
  text: z.string().max(200).optional(),
  packageName: z.string().max(100).optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
});

const SyncExecutionSchema = z.object({
  targetDeviceIds: z.array(z.string().min(1)).min(1).max(20),
  action: InputCommandSchema,
  batchLabel: z.string().max(100).optional(),
  maxConcurrency: z.number().min(1).max(20).optional(),
});

const NgrokConfigSchema = z.object({
  token: z.string().max(100).optional(),
  enabled: z.boolean().optional(),
});

const InstallApkSchema = z.object({
  targetDeviceIds: z.array(z.string().min(1).max(64)).min(1).max(20),
  packageName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/),
  appName: z.string().min(1).max(100),
  version: z.string().max(50).optional(),
  icon: z.string().max(100).optional(),
  color: z.string().max(32).optional(),
  apkBase64: z.string().max(8_000_000).optional(),
  sizeMb: z.number().min(0).max(1024).optional(),
});

const LoginSchema = z.object({ password: z.string().min(1).max(256) });

const WebSocketClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SUBSCRIBE_DEVICE'), deviceId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('UNSUBSCRIBE_DEVICE'), deviceId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal('DIRECT_INPUT'),
    deviceId: z.string().min(1).max(64),
    command: InputCommandSchema,
  }),
  z.object({ type: z.literal('HEARTBEAT'), timestamp: z.number() }),
]);

function getActiveSession(cookieHeader: string | undefined): string | undefined {
  const token = readSessionCookie(cookieHeader);
  if (!token) return undefined;

  const expiresAt = activeSessions.get(token);
  if (!expiresAt || expiresAt <= Date.now() || !verifySessionToken(token, SESSION_SECRET)) {
    activeSessions.delete(token);
    return undefined;
  }
  return token;
}

function pruneExpiredSessions(now = Date.now()) {
  for (const [token, expiresAt] of activeSessions) {
    if (expiresAt <= now) activeSessions.delete(token);
  }
}

function getCgroupMemoryUsageMb(): number | undefined {
  for (const filePath of ['/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory/memory.usage_in_bytes']) {
    try {
      const usage = Number(fs.readFileSync(filePath, 'utf8').trim());
      if (Number.isFinite(usage) && usage >= 0) return Math.round(usage / 1024 / 1024);
    } catch {
      continue;
    }
  }
  return undefined;
}

// --- AUDIT SYSTEM ---
function auditHostEnvironment(): EnvironmentAuditReport {
  const kvmPathFound = fs.existsSync('/dev/kvm');
  let kvmSupported = false;
  if (kvmPathFound) {
    try {
      fs.accessSync('/dev/kvm', fs.constants.R_OK | fs.constants.W_OK);
      kvmSupported = true;
    } catch {
      kvmSupported = false;
    }
  }
  const isGvisor = os.release().includes('gvisor');
  const configuredDevices = Number(process.env.MAX_DEVICES || 10);
  const memoryPerDeviceMb = Number(process.env.EMULATOR_MEMORY_MB || 2048);
  const vcpusPerDevice = Number(process.env.EMULATOR_VCPUS || 2);
  const capacity = androidRuntime.capacity;
  const totalRamMb = androidRuntime.enabled ? capacity.memoryLimitMb : Math.round(os.totalmem() / 1024 / 1024);
  const cgroupMemoryUsedMb = androidRuntime.enabled ? getCgroupMemoryUsageMb() : undefined;
  const freeRamMb = cgroupMemoryUsedMb === undefined
    ? Math.min(totalRamMb, Math.round(os.freemem() / 1024 / 1024))
    : Math.max(0, totalRamMb - cgroupMemoryUsedMb);
  const cpuCores = androidRuntime.enabled ? capacity.cpuLimitCores : os.cpus().length;
  const canRunEmulator = androidRuntime.enabled && capacity.maxDevices > 0;
  const estimatedRamTotalMb = capacity.maxDevices * (memoryPerDeviceMb + 2048) + 4096;
  const profiles: ResourceProfile[] = [{
    id: 'lightweight',
    name: 'Android 15 Google Play AVD (Pixel display profile)',
    resolution: '720x1560 @ 280dpi',
    vCpuPerDevice: vcpusPerDevice,
    ramPerDeviceMb: memoryPerDeviceMb,
    fpsLimit: 1,
    streamQuality: 'low',
    estimatedRamTotalMb,
    compatibleWithCurrentHost: canRunEmulator,
    notes: `Capacity estimate: ${capacity.maxDevices}/${configuredDevices} configured slots. One screenshot per second; software rendering by default. Display profile is not Pixel hardware.`,
  }];
  const recommendations: string[] = [];
  if (!kvmSupported) {
    recommendations.push('KVM is unavailable or not readable/writable by this process; Android Emulator slots cannot start.');
  } else if (capacity.maxDevices < configuredDevices) {
    recommendations.push(capacity.reason || `Resource limits estimate ${capacity.maxDevices} of ${configuredDevices} configured slots.`);
  }
  if (!androidRuntime.enabled) {
    recommendations.push('This process is using the in-memory development simulator. Production requires ANDROID_EMULATOR_ENABLED=true and a Linux host with accessible KVM.');
  }
  recommendations.push('Docker Compose does not configure GPU passthrough; the default emulator rendering mode is SwiftShader software rendering.');
  const status = capacity.maxDevices >= configuredDevices
    ? 'supported'
    : capacity.maxDevices > 0 ? 'warning' : 'constrained';
  const summary = androidRuntime.enabled
    ? `Estimated capacity: ${capacity.maxDevices} of ${configuredDevices} configured Android Emulator slots. This is a resource heuristic, not a performance guarantee.`
    : 'The in-memory simulator is active; this host report does not mean Android Emulator instances are running.';

  return {
    timestamp: new Date().toISOString(),
    hostOs: `${os.type()} ${os.release()}`,
    kernel: os.version ? os.version() : os.release(),
    arch: os.arch(),
    kvmSupported,
    kvmPathFound,
    cpuCores,
    totalRamMb,
    freeRamMb,
    isGvisor,
    androidRuntimeEnabled: androidRuntime.enabled,
    executionEngine: canRunEmulator ? 'kvm_accelerated_qemu' : 'virtual_container_fallback',
    dockerAvailable: fs.existsSync('/var/run/docker.sock'),
    adbAvailable: androidRuntime.enabled && fs.existsSync(`${process.env.ANDROID_SDK_ROOT || '/opt/android-sdk'}/platform-tools/adb`),
    feasibility10Devices: {
      status,
      summary,
      ramHeadroomMb: Math.max(0, totalRamMb - 4096 - capacity.maxDevices * (memoryPerDeviceMb + 2048)),
    },
    recommendations,
    profiles,
  };
}

// --- LOGGING ENGINE ---
const auditLogs: AuditLogEntry[] = [];
function addLog(level: 'info' | 'warn' | 'error' | 'debug', source: 'adb' | 'sync' | 'system' | 'ngrok' | 'security', message: string, deviceId?: string, data?: any) {
  const entry: AuditLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    deviceId,
    data,
  };
  auditLogs.unshift(entry);
  if (auditLogs.length > 500) {
    auditLogs.pop();
  }
  broadcastMessage({ type: 'LOG_ENTRY', log: entry });
}

// --- DEVICE STATE & SVG FRAME GENERATOR ---
const APPS = [
  { id: 'youtube', name: 'YouTube', packageName: 'com.google.android.youtube', icon: 'play-square', color: '#FF0000' },
  { id: 'tiktok', name: 'TikTok', packageName: 'com.zhiliaoapp.musically', icon: 'music-2', color: '#00F2FE' },
  { id: 'launcher', name: 'Pixel Launcher', packageName: 'com.android.launcher', icon: 'grid', color: '#3B82F6' },
  { id: 'browser', name: 'Chrome Browser', packageName: 'com.android.chrome', icon: 'globe', color: '#10B981' },
  { id: 'settings', name: 'Settings', packageName: 'com.android.settings', icon: 'settings', color: '#6B7280' },
  { id: 'termux', name: 'Termux Terminal', packageName: 'com.termux', icon: 'terminal', color: '#10B981' },
  { id: 'calculator', name: 'Calculator', packageName: 'com.android.calculator2', icon: 'calculator', color: '#F59E0B' },
  { id: 'terminal', name: 'ADB Shell', packageName: 'com.android.terminal', icon: 'terminal', color: '#8B5CF6' },
  { id: 'gallery', name: 'Photos', packageName: 'com.android.gallery3d', icon: 'image', color: '#EC4899' },
  { id: 'phone', name: 'Phone Dialer', packageName: 'com.android.dialer', icon: 'phone', color: '#06B6D4' },
  { id: 'fdroid', name: 'F-Droid Store', packageName: 'org.fdroid.fdroid', icon: 'download', color: '#0284C7' },
  { id: 'whatsapp', name: 'WhatsApp Lite', packageName: 'com.whatsapp', icon: 'message-circle', color: '#25D366' },
  { id: 'newpipe', name: 'NewPipe Video', packageName: 'org.schabi.newpipe', icon: 'play-circle', color: '#EF4444' },
  { id: 'aurora', name: 'Aurora Store', packageName: 'com.aurora.store', icon: 'shopping-bag', color: '#8B5CF6' },
  { id: 'amaze', name: 'Amaze File Manager', packageName: 'com.amaze.filemanager', icon: 'folder', color: '#F59E0B' },
  { id: 'geekbench', name: 'Geekbench 6', packageName: 'com.primatelabs.geekbench6', icon: 'cpu', color: '#6366F1' },
];

const DEFAULT_PACKAGES: InstalledPackage[] = [
  {
    packageName: 'com.google.android.youtube',
    name: 'YouTube',
    version: '19.08.36',
    icon: 'play-square',
    color: '#FF0000',
    installDate: '2026-01-15',
    sizeMb: 128.4,
    isSystem: true,
    category: 'Video & Streaming',
  },
  {
    packageName: 'com.zhiliaoapp.musically',
    name: 'TikTok',
    version: '33.2.4',
    icon: 'music-2',
    color: '#00F2FE',
    installDate: '2026-01-15',
    sizeMb: 112.0,
    isSystem: true,
    category: 'Short Video & Social',
  },
  {
    packageName: 'com.android.chrome',
    name: 'Google Chrome',
    version: '122.0.6261.64',
    icon: 'globe',
    color: '#34A853',
    installDate: '2026-01-15',
    sizeMb: 42.1,
    isSystem: true,
    category: 'Browser',
  },
  {
    packageName: 'com.android.launcher',
    name: 'Pixel Launcher',
    version: '14.0.0',
    icon: 'grid',
    color: '#3B82F6',
    installDate: '2026-01-15',
    sizeMb: 12.4,
    isSystem: true,
    category: 'System',
  },
  {
    packageName: 'com.android.settings',
    name: 'Settings',
    version: '14.0.0',
    icon: 'settings',
    color: '#4B5563',
    installDate: '2026-01-15',
    sizeMb: 18.2,
    isSystem: true,
    category: 'System',
  },
  {
    packageName: 'com.android.calculator2',
    name: 'Calculator',
    version: '8.4.1',
    icon: 'calculator',
    color: '#FBBC04',
    installDate: '2026-01-15',
    sizeMb: 4.8,
    isSystem: true,
    category: 'Utility',
  },
  {
    packageName: 'com.android.terminal',
    name: 'ADB Shell',
    version: '2.1.0',
    icon: 'terminal',
    color: '#8B5CF6',
    installDate: '2026-01-15',
    sizeMb: 6.2,
    isSystem: true,
    category: 'Development',
  },
  {
    packageName: 'com.android.gallery3d',
    name: 'Photos',
    version: '14.0.0',
    icon: 'image',
    color: '#4285F4',
    installDate: '2026-01-15',
    sizeMb: 24.1,
    isSystem: true,
    category: 'Media',
  },
  {
    packageName: 'com.android.dialer',
    name: 'Phone',
    version: '14.0.0',
    icon: 'phone',
    color: '#0EA5E9',
    installDate: '2026-01-15',
    sizeMb: 8.5,
    isSystem: true,
    category: 'Phone',
  },
];

const CURATED_APK_REPOSITORY = [
  {
    packageName: 'com.termux',
    appName: 'Termux Terminal',
    version: '0.118.1',
    sizeMb: 84.5,
    icon: 'terminal',
    color: '#10B981',
    category: 'Developer & CLI',
    description: 'Linux terminal emulator and package environment with APT, Python, Node.js, and Bash.',
    badge: 'Popular',
    verified: true,
  },
  {
    packageName: 'org.fdroid.fdroid',
    appName: 'F-Droid Store',
    version: '1.21.0',
    sizeMb: 14.2,
    icon: 'download',
    color: '#0284C7',
    category: 'App Repository',
    description: 'Official catalogue of Free and Open Source Software (FOSS) applications for Android.',
    badge: 'Recommended',
    verified: true,
  },
  {
    packageName: 'com.aurora.store',
    appName: 'Aurora Store',
    version: '4.4.4',
    sizeMb: 18.6,
    icon: 'shopping-bag',
    color: '#8B5CF6',
    category: 'App Store',
    description: 'Privacy-focused Google Play frontend to install and update apps anonymously.',
    badge: 'FOSS',
    verified: true,
  },
  {
    packageName: 'com.whatsapp',
    appName: 'WhatsApp Lite',
    version: '2.24.8.4',
    sizeMb: 38.0,
    icon: 'message-circle',
    color: '#25D366',
    category: 'Communication',
    description: 'Lightweight messaging and automation client optimized for multi-device farms.',
    badge: 'Social',
    verified: true,
  },
  {
    packageName: 'org.schabi.newpipe',
    appName: 'NewPipe Video',
    version: '0.27.0',
    sizeMb: 11.4,
    icon: 'play-circle',
    color: '#EF4444',
    category: 'Media & Streaming',
    description: 'Lightweight streaming front-end with zero Google Services dependency and background playback.',
    badge: 'Lightweight',
    verified: true,
  },
  {
    packageName: 'com.amaze.filemanager',
    appName: 'Amaze File Manager',
    version: '3.8.4',
    sizeMb: 9.3,
    icon: 'folder',
    color: '#F59E0B',
    category: 'File Management',
    description: 'Material design open-source file explorer with root access and tabbed browsing.',
    badge: 'Root Tools',
    verified: true,
  },
  {
    packageName: 'com.primatelabs.geekbench6',
    appName: 'Geekbench 6',
    version: '6.3.0',
    sizeMb: 42.0,
    icon: 'cpu',
    color: '#6366F1',
    category: 'Benchmarking',
    description: 'Industry-standard processor and GPU benchmark to test Tensor G2 performance across the farm.',
    badge: 'Benchmark',
    verified: true,
  },
];

function installApkToDevice(
  deviceId: string,
  pkg: { packageName: string; appName: string; version?: string; icon?: string; color?: string; sizeMb?: number }
): { success: boolean; error?: string } {
  const state = devicesMap.get(deviceId);
  if (!state) return { success: false, error: 'Device not found' };
  if (state.info.status !== 'online') return { success: false, error: `Device is ${state.info.status}` };

  if (!state.info.installedPackages) {
    state.info.installedPackages = [...DEFAULT_PACKAGES];
  }

  const existingIndex = state.info.installedPackages.findIndex((p) => p.packageName === pkg.packageName);
  const installedPkg: InstalledPackage = {
    packageName: pkg.packageName,
    name: pkg.appName,
    version: pkg.version || '1.0.0',
    icon: pkg.icon || 'box',
    color: pkg.color || '#10B981',
    installDate: new Date().toISOString().split('T')[0],
    sizeMb: pkg.sizeMb || 15.0,
    isSystem: false,
    category: 'User App',
  };

  if (existingIndex >= 0) {
    state.info.installedPackages[existingIndex] = installedPkg;
  } else {
    state.info.installedPackages.push(installedPkg);
  }

  state.info.ramUsageMb = Math.min(state.info.totalRamMb - 50, state.info.ramUsageMb + Math.round(installedPkg.sizeMb * 0.3));
  state.info.thumbnailSvg = generateScreenSvg(state);

  addLog(
    'info',
    'adb',
    `adb -s ${state.info.ip}:${state.info.adbPort} install -r ${pkg.packageName}.apk [Success: 100%]`,
    deviceId,
    { packageName: pkg.packageName, appName: pkg.appName }
  );

  return { success: true };
}

function uninstallPackageFromDevice(deviceId: string, packageName: string): { success: boolean; error?: string } {
  const state = devicesMap.get(deviceId);
  if (!state) return { success: false, error: 'Device not found' };
  if (!state.info.installedPackages) return { success: false, error: 'No packages found' };

  const targetPkg = state.info.installedPackages.find((p) => p.packageName === packageName);
  if (!targetPkg) return { success: false, error: 'Package not installed' };
  if (targetPkg.isSystem) return { success: false, error: 'Cannot uninstall Android system package' };

  state.info.installedPackages = state.info.installedPackages.filter((p) => p.packageName !== packageName);
  if (state.info.currentApp === packageName) {
    state.info.currentApp = 'com.android.launcher';
    state.info.currentAppName = 'Pixel Launcher';
    state.appHistory = ['com.android.launcher'];
  }
  state.info.thumbnailSvg = generateScreenSvg(state);

  addLog(
    'info',
    'adb',
    `adb -s ${state.info.ip}:${state.info.adbPort} shell pm uninstall ${packageName} [Success]`,
    deviceId
  );

  return { success: true };
}

async function installApkCluster(payload: InstallApkRequest): Promise<InstallApkResponse> {
  const opId = `apk-op-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const startTime = Date.now();
  const results: InstallApkResponse['results'] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const deviceId of payload.targetDeviceIds) {
    const state = devicesMap.get(deviceId);
    if (!state) {
      results.push({
        deviceId,
        deviceName: deviceId,
        status: 'failed',
        latencyMs: 1,
        error: 'Device not found',
      });
      failureCount++;
      continue;
    }

    if (state.info.status !== 'online') {
      results.push({
        deviceId,
        deviceName: state.info.name,
        status: 'offline',
        latencyMs: 1,
        error: `Device is ${state.info.status}`,
      });
      failureCount++;
      continue;
    }

    const res = installApkToDevice(deviceId, payload);
    const latency = Math.floor(45 + Math.random() * 65);
    if (res.success) {
      results.push({
        deviceId,
        deviceName: state.info.name,
        status: 'success',
        latencyMs: latency,
      });
      successCount++;
    } else {
      results.push({
        deviceId,
        deviceName: state.info.name,
        status: 'failed',
        latencyMs: latency,
        error: res.error,
      });
      failureCount++;
    }
  }

  const response: InstallApkResponse = {
    opId,
    timestamp: Date.now(),
    appName: payload.appName,
    packageName: payload.packageName,
    totalTargets: payload.targetDeviceIds.length,
    successCount,
    failureCount,
    results,
  };

  addLog(
    failureCount > 0 ? 'warn' : 'info',
    'adb',
    `Cluster APK Install [${payload.appName}] complete: ${successCount}/${payload.targetDeviceIds.length} devices updated (${Date.now() - startTime}ms)`,
    undefined,
    response
  );

  broadcastDevices();
  return response;
}

interface DeviceInternalState {
  info: DeviceInfo;
  appHistory: string[];
  calcExpression: string;
  calcResult: string;
  terminalHistory: string[];
  browserUrl: string;
  recentTouches: { x: number; y: number; time: number }[];
  isLocked: boolean;
}

const devicesMap = new Map<string, DeviceInternalState>();
const runtimeStartedAt = new Map<string, number>();
const metadataRefreshInProgress = new Set<string>();
let androidRuntime: AndroidRuntimeManager;

androidRuntime = new AndroidRuntimeManager((runtimeDevice: RuntimeDevice) => {
  const state = devicesMap.get(runtimeDevice.id);
  if (!state) return;

  state.info.status = runtimeDevice.status;
  state.info.lastPing = Date.now();
  state.info.serialNumber = `emulator-${runtimeDevice.port}`;
  state.info.highResFrame = undefined;
  if (runtimeDevice.status === 'online') {
    runtimeStartedAt.set(runtimeDevice.id, Date.now());
  } else if (runtimeDevice.status === 'starting') {
    if (!runtimeStartedAt.has(runtimeDevice.id)) runtimeStartedAt.set(runtimeDevice.id, Date.now());
  } else if (runtimeDevice.status === 'offline') {
    runtimeStartedAt.delete(runtimeDevice.id);
    state.info.cpuUsage = 0;
    state.info.ramUsageMb = 0;
  }
  if (runtimeDevice.error) {
    addLog('error', 'adb', runtimeDevice.error, runtimeDevice.id);
  } else {
    addLog('info', 'adb', `${runtimeDevice.name} state: ${runtimeDevice.status}`, runtimeDevice.id);
  }
  broadcastDevices();
  broadcastStats();
  if (runtimeDevice.status === 'online') {
    void refreshRuntimeMetadata(runtimeDevice.id, runtimeDevice.port);
  }
});

function refreshRuntimeMetadata(deviceId: string, port: number): void {
  const state = devicesMap.get(deviceId);
  if (!state || state.info.status !== 'online' || metadataRefreshInProgress.has(deviceId)) return;

  metadataRefreshInProgress.add(deviceId);
  void androidRuntime.getMetadata(deviceId, port).then((metadata) => {
    const currentState = devicesMap.get(deviceId);
    if (!currentState || currentState.info.status !== 'online') return;

    currentState.info.androidVersion = metadata.androidVersion;
    currentState.info.apiLevel = metadata.apiLevel;
    currentState.info.buildFingerprint = metadata.buildFingerprint;
    currentState.info.cpuUsage = Math.round(metadata.cpuUsage);
    currentState.info.ramUsageMb = metadata.ramUsageMb;
    currentState.info.totalRamMb = metadata.totalRamMb || Number(process.env.EMULATOR_MEMORY_MB || 2048);
    currentState.info.resolution = metadata.resolution;
    currentState.info.orientation = metadata.orientation;
    currentState.info.batteryLevel = metadata.batteryLevel;
    currentState.info.currentApp = metadata.currentApp;
    currentState.info.currentAppName =
      APPS.find((app) => app.packageName === metadata.currentApp)?.name || metadata.currentApp;
    currentState.info.installedPackages = metadata.installedPackages.map((packageName): InstalledPackage => ({
      packageName,
      name: packageName === 'com.google.android.youtube'
        ? 'YouTube'
        : packageName === 'com.zhiliaoapp.musically' ? 'TikTok' : packageName,
      version: 'Installed',
      icon: packageName === 'com.google.android.youtube' ? 'play' : 'music-2',
      color: packageName === 'com.google.android.youtube' ? '#FF0000' : '#00F2FE',
      installDate: '',
      sizeMb: 0,
      isSystem: metadata.systemPackages.includes(packageName),
      category: 'Media & Streaming',
    }));
    currentState.info.lastPing = Date.now();
    broadcastDevices();
  }).catch((error: unknown) => {
    addLog('warn', 'adb', error instanceof Error ? `Unable to refresh emulator metadata: ${error.message}` : 'Unable to refresh emulator metadata', deviceId);
  }).finally(() => {
    metadataRefreshInProgress.delete(deviceId);
  });
}

function getEmulatorPort(deviceIndex: number): number {
  return 5554 + (deviceIndex - 1) * 2;
}

function getDeviceIndex(deviceId: string): number {
  const match = /^pixel-(\d{2})$/.exec(deviceId);
  return match ? Number(match[1]) : 0;
}

function generateScreenSvg(state: DeviceInternalState): string {
  const { info, calcExpression, calcResult, browserUrl, recentTouches } = state;
  const isPortrait = info.orientation === 'portrait';
  // Pixel 7 Pro aspect ratio 19.5:9 (720x1560 lite)
  const width = isPortrait ? 360 : 780;
  const height = isPortrait ? 780 : 360;

  if (info.status === 'offline') {
    return `
      <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="w-full h-full bg-zinc-950">
        <rect width="${width}" height="${height}" fill="#09090b" />
        <!-- Pixel 7 Pro punch hole camera -->
        <circle cx="${width / 2}" cy="14" r="5" fill="#000000" stroke="#27272a" stroke-width="1"/>
        <g fill="#52525b" transform="translate(${width / 2 - 20}, ${height / 2 - 30})">
          <circle cx="20" cy="20" r="18" fill="none" stroke="#3f3f46" stroke-width="3" stroke-dasharray="4 4"/>
          <path d="M12 20h16M20 12v16" stroke="#52525b" stroke-width="2"/>
        </g>
        <text x="${width / 2}" y="${height / 2 + 28}" fill="#71717a" font-family="system-ui, sans-serif" font-size="12" font-weight="600" text-anchor="middle">PIXEL 7 PRO OFFLINE</text>
        <text x="${width / 2}" y="${height / 2 + 46}" fill="#52525b" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Click Start to Boot Cheetah VM</text>
      </svg>
    `;
  }

  if (info.status === 'starting') {
    return `
      <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="w-full h-full bg-zinc-950">
        <rect width="${width}" height="${height}" fill="#000000" />
        <!-- Pixel 7 Pro punch hole camera -->
        <circle cx="${width / 2}" cy="14" r="5" fill="#000000" stroke="#27272a" stroke-width="1"/>
        <g transform="translate(${width / 2 - 24}, ${height / 2 - 36})">
          <!-- Google 'G' spinning logo animation -->
          <circle cx="24" cy="24" r="20" fill="none" stroke="#4285F4" stroke-width="4" stroke-dasharray="25 60">
            <animateTransform attributeName="transform" type="rotate" from="0 24 24" to="360 24 24" dur="1.2s" repeatCount="indefinite"/>
          </circle>
          <path d="M16 24h16M24 16v16" stroke="#EA4335" stroke-width="2" stroke-linecap="round"/>
        </g>
        <text x="${width / 2}" y="${height / 2 + 26}" fill="#f4f4f5" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">Google</text>
        <text x="${width / 2}" y="${height / 2 + 46}" fill="#34A853" font-family="system-ui, sans-serif" font-size="11" font-weight="600" text-anchor="middle">BOOTING PIXEL 7 PRO...</text>
        <text x="${width / 2}" y="${height / 2 + 64}" fill="#71717a" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">Tensor G2 • cheetah-user 14 (API 34)</text>
      </svg>
    `;
  }

  // Active Screen UI
  let appContent = '';
  if (info.currentApp === 'com.android.launcher') {
    // Dynamic user-installed packages to show on launcher rows 3 & 4
    const userApps = (info.installedPackages || []).filter((p) => !p.isSystem).slice(0, 8);
    const userAppsSvg = userApps
      .map((app, index) => {
        const row = Math.floor(index / 4);
        const col = index % 4;
        const xPos = col * (width * 0.245);
        const yPos = 160 + row * 76;
        const color = app.color || '#10B981';
        const initial = app.name ? app.name.charAt(0).toUpperCase() : 'A';
        const shortName = app.name.length > 7 ? `${app.name.substring(0, 6)}…` : app.name;
        return `
          <g transform="translate(${xPos}, ${yPos})">
            <rect width="46" height="46" rx="14" fill="${color}" />
            <text x="23" y="28" fill="#ffffff" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">${initial}</text>
            <text x="23" y="60" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">${shortName}</text>
          </g>
        `;
      })
      .join('');

    appContent = `
      <!-- Pixel 7 Pro Material You Hazel / Obsidian Wallpaper -->
      <defs>
        <linearGradient id="wp-${info.id}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#141a18"/>
          <stop offset="40%" stop-color="#232b27"/>
          <stop offset="80%" stop-color="#191f1c"/>
          <stop offset="100%" stop-color="#0e1211"/>
        </linearGradient>
      </defs>
      <rect x="0" y="24" width="${width}" height="${height - 56}" fill="url(#wp-${info.id})" />

      <!-- Pixel 7 Pro 'At a Glance' Widget -->
      <g transform="translate(24, ${height * 0.08})">
        <text x="0" y="0" fill="#f4f4f5" font-family="system-ui, sans-serif" font-size="32" font-weight="300">14:32</text>
        <text x="0" y="26" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="13" font-weight="500">Wed, Oct 28 • 24°C ☀️</text>
        <g transform="translate(0, 36)">
          <rect width="180" height="22" rx="11" fill="#2d3732" opacity="0.9" />
          <text x="12" y="15" fill="#a7f3d0" font-family="system-ui, sans-serif" font-size="10" font-weight="500">⚡ Tensor G2 • ${info.installedPackages?.length || 5} Apps Installed</text>
        </g>
      </g>

      <!-- Pixel Themed App Grid -->
      <g transform="translate(${width * 0.07}, ${height * 0.28})">
        <!-- Row 1: Real Applications -->
        <g transform="translate(0, 0)">
          <rect width="46" height="46" rx="14" fill="#FF0000" />
          <polygon points="18,16 32,23 18,30" fill="#ffffff" />
          <text x="23" y="60" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">YouTube</text>
        </g>
        <g transform="translate(${width * 0.245}, 0)">
          <rect width="46" height="46" rx="14" fill="#000000" stroke="#00F2FE" stroke-width="1.5"/>
          <text x="23" y="29" fill="#FE2C55" font-family="system-ui" font-size="16" text-anchor="middle">🎵</text>
          <text x="23" y="60" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">TikTok</text>
        </g>
        <g transform="translate(${width * 0.49}, 0)">
          <rect width="46" height="46" rx="14" fill="#34A853" />
          <circle cx="23" cy="23" r="10" fill="#ffffff" opacity="0.3"/>
          <text x="23" y="60" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Chrome</text>
        </g>
        <g transform="translate(${width * 0.735}, 0)">
          <rect width="46" height="46" rx="14" fill="#4B5563" />
          <circle cx="23" cy="23" r="10" fill="none" stroke="#fff" stroke-width="3"/>
          <text x="23" y="60" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Settings</text>
        </g>

        <!-- Row 2 -->
        <g transform="translate(0, 80)">
          <rect width="46" height="46" rx="14" fill="#4285F4" />
          <circle cx="23" cy="23" r="9" fill="#ffffff" opacity="0.3"/>
          <text x="23" y="60" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Photos</text>
        </g>
        <g transform="translate(${width * 0.245}, 80)">
          <rect width="46" height="46" rx="14" fill="#0EA5E9" />
          <text x="23" y="29" fill="#ffffff" font-family="system-ui, sans-serif" font-size="15" text-anchor="middle">📞</text>
          <text x="23" y="60" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Phone</text>
        </g>
        <g transform="translate(${width * 0.49}, 80)">
          <rect width="46" height="46" rx="14" fill="#EA4335" />
          <circle cx="23" cy="23" r="8" fill="#ffffff"/>
          <circle cx="23" cy="23" r="4" fill="#18181b"/>
          <text x="23" y="60" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Camera</text>
        </g>
        <g transform="translate(${width * 0.735}, 80)">
          <rect width="46" height="46" rx="14" fill="#10B981" />
          <text x="23" y="29" fill="#ffffff" font-family="system-ui" font-size="14" text-anchor="middle">📁</text>
          <text x="23" y="60" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="10" text-anchor="middle">Files</text>
        </g>

        <!-- Rows 3 & 4: User Installed APKs -->
        ${userAppsSvg}
      </g>

      <!-- Pixel 7 Pro Dock Google Search Bar -->
      <g transform="translate(20, ${height - 76})">
        <rect width="${width - 40}" height="42" rx="21" fill="#2d3732" opacity="0.9" stroke="#3d4a44" stroke-width="1"/>
        <text x="22" y="27" fill="#4285F4" font-family="system-ui, sans-serif" font-size="17" font-weight="bold">G</text>
        <text x="44" y="26" fill="#9ca3af" font-family="system-ui, sans-serif" font-size="11">Search Pixel or web...</text>
        <circle cx="${width - 66}" cy="21" r="9" fill="#3d4a44"/>
        <text x="${width - 66}" y="24" fill="#f4f4f5" font-family="system-ui" font-size="10" text-anchor="middle">🎙</text>
        <circle cx="${width - 44}" cy="21" r="9" fill="#3d4a44"/>
        <circle cx="${width - 44}" cy="21" r="4" fill="none" stroke="#60a5fa" stroke-width="1.5"/>
      </g>
    `;
  } else if (info.currentApp === 'com.google.android.youtube') {
    appContent = `
      <rect x="0" y="24" width="${width}" height="${height - 56}" fill="#0f0f0f" />
      <!-- YouTube App Header -->
      <rect x="0" y="24" width="${width}" height="44" fill="#0f0f0f" />
      <!-- YouTube Logo -->
      <g transform="translate(14, 34)">
        <rect width="26" height="18" rx="5" fill="#FF0000" />
        <polygon points="10,5 18,9 10,13" fill="#ffffff" />
        <text x="32" y="14" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">YouTube</text>
        <text x="96" y="8" fill="#9ca3af" font-family="system-ui" font-size="8">ID</text>
      </g>
      <!-- Header Actions: Search, Notification, Profile -->
      <g transform="translate(${width - 86}, 36)" fill="#f4f4f5">
        <text x="0" y="12" font-family="system-ui" font-size="12">🔍</text>
        <circle cx="30" cy="9" r="6" fill="#3f3f46"/>
        <text x="30" y="12" font-family="system-ui" font-size="8" text-anchor="middle">🔔</text>
        <circle cx="58" cy="9" r="10" fill="#dc2626"/>
        <text x="58" y="13" font-family="system-ui" font-size="10" font-weight="bold" text-anchor="middle">P</text>
      </g>
      <!-- Category Chips -->
      <g transform="translate(14, 76)">
        <rect width="40" height="22" rx="11" fill="#ffffff" />
        <text x="20" y="15" fill="#000000" font-family="system-ui" font-size="10" font-weight="bold" text-anchor="middle">All</text>
        <rect x="46" width="76" height="22" rx="11" fill="#272727" stroke="#3f3f46" stroke-width="0.5"/>
        <text x="84" y="15" fill="#f4f4f5" font-family="system-ui" font-size="10" text-anchor="middle">Pixel 7 Pro</text>
        <rect x="128" width="56" height="22" rx="11" fill="#272727" stroke="#3f3f46" stroke-width="0.5"/>
        <text x="156" y="15" fill="#f4f4f5" font-family="system-ui" font-size="10" text-anchor="middle">Gaming</text>
        <rect x="190" width="50" height="22" rx="11" fill="#272727" stroke="#3f3f46" stroke-width="0.5"/>
        <text x="215" y="15" fill="#f4f4f5" font-family="system-ui" font-size="10" text-anchor="middle">Music</text>
      </g>
      <!-- Video Card 1 (Active Playing Video) -->
      <g transform="translate(12, 110)">
        <rect width="${width - 24}" height="175" rx="12" fill="#181818" stroke="#27272a" stroke-width="1"/>
        <!-- Video Screen Player -->
        <rect x="6" y="6" width="${width - 36}" height="110" rx="8" fill="#000000" />
        <!-- Video Art Graphic -->
        <circle cx="${(width - 36) / 2 + 6}" cy="61" r="22" fill="#dc2626" opacity="0.9"/>
        <polygon points="${(width - 36) / 2 + 2},51 ${(width - 36) / 2 + 16},61 ${(width - 36) / 2 + 2},71" fill="#ffffff"/>
        <rect x="${width - 80}" y="92" width="36" height="18" rx="4" fill="#000000" opacity="0.85"/>
        <text x="${width - 62}" y="105" fill="#ffffff" font-family="monospace" font-size="9" font-weight="bold" text-anchor="middle">2:45</text>
        <rect x="14" y="14" width="56" height="18" rx="9" fill="#dc2626" opacity="0.9"/>
        <text x="42" y="26" fill="#ffffff" font-family="system-ui" font-size="8" font-weight="bold" text-anchor="middle">NOW PLAYING</text>
        <!-- Video Meta -->
        <circle cx="22" cy="136" r="12" fill="#ea4335"/>
        <text x="22" y="140" fill="#ffffff" font-family="system-ui" font-size="10" font-weight="bold" text-anchor="middle">G</text>
        <text x="42" y="132" fill="#f4f4f5" font-family="system-ui, sans-serif" font-size="11" font-weight="bold">Google Pixel 7 Pro: Tensor G2 Architecture</text>
        <text x="42" y="147" fill="#a1a1aa" font-family="system-ui, sans-serif" font-size="9">Made by Google • 4.2M views • 1 year ago</text>
      </g>
      <!-- Video Card 2 (Up Next) -->
      <g transform="translate(12, 298)">
        <rect width="${width - 24}" height="165" rx="12" fill="#181818" stroke="#27272a" stroke-width="1"/>
        <rect x="6" y="6" width="${width - 36}" height="105" rx="8" fill="#121212" />
        <circle cx="${(width - 36) / 2 + 6}" cy="58" r="18" fill="#2563eb" opacity="0.8"/>
        <polygon points="${(width - 36) / 2 + 3},50 ${(width - 36) / 2 + 13},58 ${(width - 36) / 2 + 3},66" fill="#ffffff"/>
        <rect x="${width - 80}" y="88" width="36" height="18" rx="4" fill="#000000" opacity="0.85"/>
        <text x="${width - 62}" y="101" fill="#ffffff" font-family="monospace" font-size="9" text-anchor="middle">5:14</text>
        <circle cx="22" cy="128" r="12" fill="#10b981"/>
        <text x="22" y="132" fill="#ffffff" font-family="system-ui" font-size="9" font-weight="bold" text-anchor="middle">4K</text>
        <text x="42" y="125" fill="#f4f4f5" font-family="system-ui, sans-serif" font-size="11" font-weight="bold">Costa Rica in 4K 60FPS HDR Wildlife</text>
        <text x="42" y="140" fill="#a1a1aa" font-family="system-ui, sans-serif" font-size="9">Nature Lab • 112M views • Ultra HD</text>
      </g>
      <!-- YouTube Bottom Navigation Bar -->
      <rect x="0" y="${height - 64}" width="${width}" height="40" fill="#0f0f0f" stroke="#27272a" stroke-width="0.5"/>
      <g transform="translate(0, ${height - 40})" fill="#a1a1aa" font-family="system-ui" font-size="8" text-anchor="middle">
        <text x="${width * 0.1}" y="0" fill="#ffffff" font-weight="bold">Home</text>
        <text x="${width * 0.3}" y="0">Shorts</text>
        <circle cx="${width * 0.5}" cy="-6" r="12" fill="none" stroke="#ffffff" stroke-width="1.5"/>
        <text x="${width * 0.5}" y="-2" fill="#ffffff" font-size="14" font-weight="bold">+</text>
        <text x="${width * 0.7}" y="0">Subs</text>
        <text x="${width * 0.9}" y="0">Library</text>
      </g>
    `;
  } else if (info.currentApp === 'com.zhiliaoapp.musically') {
    appContent = `
      <!-- TikTok Vertical Video Experience -->
      <rect x="0" y="24" width="${width}" height="${height - 56}" fill="#050505" />
      <defs>
        <linearGradient id="tt-bg-${info.id}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0a192f"/>
          <stop offset="50%" stop-color="#111827"/>
          <stop offset="100%" stop-color="#1f1124"/>
        </linearGradient>
      </defs>
      <rect x="0" y="24" width="${width}" height="${height - 56}" fill="url(#tt-bg-${info.id})" />
      <circle cx="${width / 2}" cy="${height / 2 - 30}" r="70" fill="none" stroke="#00F2FE" stroke-width="1.5" stroke-dasharray="8 6" opacity="0.4"/>
      <circle cx="${width / 2}" cy="${height / 2 - 30}" r="45" fill="#000000" opacity="0.6"/>
      <text x="${width / 2}" y="${height / 2 - 24}" fill="#FE2C55" font-family="system-ui" font-size="28" text-anchor="middle">🎵</text>
      <!-- Top TikTok Header: LIVE, Following, For You -->
      <g transform="translate(16, 44)">
        <rect width="42" height="18" rx="9" fill="#dc2626" opacity="0.9"/>
        <circle cx="10" cy="9" r="3" fill="#ffffff" />
        <text x="24" y="13" fill="#ffffff" font-family="system-ui" font-size="9" font-weight="bold">LIVE</text>
      </g>
      <g transform="translate(${width / 2}, 48)" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12">
        <text x="-36" y="0" fill="#9ca3af" font-weight="600">Following</text>
        <text x="36" y="0" fill="#ffffff" font-weight="bold">For You</text>
        <rect x="22" y="5" width="28" height="2" rx="1" fill="#ffffff" />
      </g>
      <g transform="translate(${width - 32}, 46)">
        <text fill="#ffffff" font-family="system-ui" font-size="13">🔍</text>
      </g>
      <!-- Right Action Column: Avatar, Heart, Comment, Save, Share, Disc -->
      <g transform="translate(${width - 36}, ${height * 0.40})">
        <circle cx="14" cy="0" r="16" fill="#18181b" stroke="#ffffff" stroke-width="1.5"/>
        <text x="14" y="4" fill="#00f2fe" font-family="system-ui" font-size="10" font-weight="bold" text-anchor="middle">PT</text>
        <circle cx="14" cy="16" r="6" fill="#fe2c55"/>
        <text x="14" y="19" fill="#ffffff" font-family="system-ui" font-size="9" font-weight="bold" text-anchor="middle">+</text>

        <!-- Like Button -->
        <g transform="translate(0, 42)">
          <circle cx="14" cy="14" r="16" fill="#000000" opacity="0.4"/>
          <text x="14" y="20" fill="#fe2c55" font-family="system-ui" font-size="18" text-anchor="middle">❤️</text>
          <text x="14" y="38" fill="#ffffff" font-family="system-ui" font-size="9" font-weight="bold" text-anchor="middle">142K</text>
        </g>

        <!-- Comment Button -->
        <g transform="translate(0, 94)">
          <circle cx="14" cy="14" r="16" fill="#000000" opacity="0.4"/>
          <text x="14" y="20" fill="#ffffff" font-family="system-ui" font-size="16" text-anchor="middle">💬</text>
          <text x="14" y="38" fill="#ffffff" font-family="system-ui" font-size="9" font-weight="bold" text-anchor="middle">3.8K</text>
        </g>

        <!-- Bookmark Button -->
        <g transform="translate(0, 146)">
          <circle cx="14" cy="14" r="16" fill="#000000" opacity="0.4"/>
          <text x="14" y="20" fill="#facc15" font-family="system-ui" font-size="15" text-anchor="middle">★</text>
          <text x="14" y="38" fill="#ffffff" font-family="system-ui" font-size="9" font-weight="bold" text-anchor="middle">9.2K</text>
        </g>

        <!-- Share Button -->
        <g transform="translate(0, 198)">
          <circle cx="14" cy="14" r="16" fill="#000000" opacity="0.4"/>
          <text x="14" y="20" fill="#ffffff" font-family="system-ui" font-size="15" text-anchor="middle">➔</text>
          <text x="14" y="38" fill="#ffffff" font-family="system-ui" font-size="9" font-weight="bold" text-anchor="middle">1.4K</text>
        </g>

        <!-- Spinning Disc -->
        <g transform="translate(0, 246)">
          <circle cx="14" cy="14" r="14" fill="#18181b" stroke="#3f3f46" stroke-width="2"/>
          <circle cx="14" cy="14" r="5" fill="#fe2c55"/>
        </g>
      </g>
      <!-- Bottom Video Metadata -->
      <g transform="translate(14, ${height - 110})">
        <text x="0" y="0" fill="#ffffff" font-family="system-ui" font-size="12" font-weight="bold">@pixeltech_lab</text>
        <text x="0" y="16" fill="#f4f4f5" font-family="system-ui" font-size="10">Pixel 7 Pro Farm 10-cluster sync test! 🔥📱</text>
        <text x="0" y="30" fill="#38bdf8" font-family="system-ui" font-size="10" font-weight="bold">#pixel7pro #androidfarm #techtok #fyp</text>
        <g transform="translate(0, 44)">
          <text fill="#ffffff" font-family="system-ui" font-size="10">🎵 original sound - PixelTech Audio</text>
        </g>
      </g>
      <!-- TikTok Bottom Navigation Bar -->
      <rect x="0" y="${height - 56}" width="${width}" height="32" fill="#000000" opacity="0.9" />
      <g transform="translate(0, ${height - 38})" fill="#9ca3af" font-family="system-ui" font-size="8" text-anchor="middle">
        <text x="${width * 0.1}" y="0" fill="#ffffff" font-weight="bold">Home</text>
        <text x="${width * 0.3}" y="0">Friends</text>
        <rect x="${width * 0.5 - 14}" y="-10" width="28" height="16" rx="5" fill="#ffffff" />
        <rect x="${width * 0.5 - 12}" y="-10" width="4" height="16" rx="2" fill="#00f2fe" />
        <rect x="${width * 0.5 + 8}" y="-10" width="4" height="16" rx="2" fill="#fe2c55" />
        <text x="${width * 0.5}" y="2" fill="#000000" font-size="12" font-weight="bold">+</text>
        <text x="${width * 0.7}" y="0">Inbox</text>
        <text x="${width * 0.9}" y="0">Profile</text>
      </g>
    `;
  } else if (info.currentApp === 'com.termux') {
    appContent = `
      <rect x="0" y="24" width="${width}" height="${height - 56}" fill="#020617" />
      <rect x="0" y="24" width="${width}" height="34" fill="#0f172a" />
      <text x="14" y="46" fill="#38bdf8" font-family="monospace" font-size="11" font-weight="bold">Termux - bash session #1 (PID 2841)</text>
      <circle cx="${width - 24}" cy="41" r="5" fill="#22c55e" />
      <g transform="translate(14, 76)" font-family="monospace" font-size="10" fill="#e2e8f0">
        <text y="0" fill="#4ade80">Welcome to Termux on Pixel 7 Pro (cheetah)!</text>
        <text y="16" fill="#94a3b8">Android 14 • Linux 5.10.157-android14-cheetah aarch64</text>
        <text y="36" fill="#60a5fa">Working with packages: pkg install &lt;package&gt;</text>
        <text y="58" fill="#4ade80">u0_a142@cheetah:~$ <tspan fill="#f8fafc">uname -a</tspan></text>
        <text y="74" fill="#cbd5e1">Linux localhost 5.10.157 #1 SMP PREEMPT aarch64</text>
        <text y="94" fill="#4ade80">u0_a142@cheetah:~$ <tspan fill="#f8fafc">pkg list-installed</tspan></text>
        <text y="110" fill="#94a3b8">apt/stable 2.7.14 arm64 [installed]</text>
        <text y="126" fill="#94a3b8">bash/stable 5.2.26 arm64 [installed]</text>
        <text y="142" fill="#94a3b8">python3/stable 3.11.8 arm64 [installed]</text>
        <text y="158" fill="#94a3b8">curl/stable 8.6.0 arm64 [installed]</text>
        <text y="180" fill="#4ade80">u0_a142@cheetah:~$ <tspan fill="#facc15">python3 -c "print('Farm 10 Worker OK')"</tspan></text>
        <text y="196" fill="#22c55e">Farm 10 Worker OK (Tensor G2 core 0-7 active)</text>
        <text y="220" fill="#4ade80">u0_a142@cheetah:~$ <tspan fill="#38bdf8">_</tspan></text>
      </g>
      <!-- Virtual Terminal Extra Keys Bar (ESC, TAB, CTRL, ALT, -, /, UP, DOWN) -->
      <rect x="0" y="${height - 64}" width="${width}" height="36" fill="#0f172a" stroke="#1e293b" stroke-width="1"/>
      <g transform="translate(10, ${height - 42})" font-family="monospace" font-size="10" fill="#94a3b8" text-anchor="middle">
        <text x="18" y="0">ESC</text>
        <text x="54" y="0">TAB</text>
        <text x="92" y="0">CTRL</text>
        <text x="132" y="0">ALT</text>
        <text x="170" y="0">-</text>
        <text x="208" y="0">/</text>
        <text x="250" y="0">▲</text>
        <text x="290" y="0">▼</text>
        <text x="330" y="0">ENTER</text>
      </g>
    `;
  } else if (info.currentApp === 'org.fdroid.fdroid') {
    appContent = `
      <rect x="0" y="24" width="${width}" height="${height - 56}" fill="#0b1329" />
      <!-- F-Droid Header -->
      <rect x="0" y="24" width="${width}" height="48" fill="#0284c7" />
      <text x="20" y="54" fill="#ffffff" font-family="system-ui" font-size="15" font-weight="bold">F-Droid FOSS Store</text>
      <text x="${width - 24}" y="54" fill="#ffffff" font-family="system-ui" font-size="16" text-anchor="end">🔍</text>
      <!-- Categories Bar -->
      <rect x="0" y="72" width="${width}" height="32" fill="#0369a1" />
      <text x="20" y="92" fill="#ffffff" font-family="system-ui" font-size="11" font-weight="600">Latest Releases</text>
      <text x="130" y="92" fill="#bae6fd" font-family="system-ui" font-size="11">Categories</text>
      <text x="220" y="92" fill="#bae6fd" font-family="system-ui" font-size="11">Installed (6)</text>
      <!-- Apps List -->
      <g transform="translate(16, 116)">
        <!-- App 1: NewPipe -->
        <rect width="${width - 32}" height="64" rx="12" fill="#131e3d" stroke="#1e293b" stroke-width="1"/>
        <rect x="12" y="12" width="40" height="40" rx="10" fill="#ef4444"/>
        <text x="32" y="37" fill="#fff" font-family="system-ui" font-size="14" text-anchor="middle">▶</text>
        <text x="64" y="30" fill="#f8fafc" font-family="system-ui" font-size="12" font-weight="bold">NewPipe</text>
        <text x="64" y="44" fill="#94a3b8" font-family="system-ui" font-size="10">Lightweight streaming front-end</text>
        <rect x="${width - 100}" y="20" width="56" height="24" rx="12" fill="#0284c7"/>
        <text x="${width - 72}" y="36" fill="#fff" font-family="system-ui" font-size="10" font-weight="bold" text-anchor="middle">OPEN</text>

        <!-- App 2: Termux -->
        <g transform="translate(0, 74)">
          <rect width="${width - 32}" height="64" rx="12" fill="#131e3d" stroke="#1e293b" stroke-width="1"/>
          <rect x="12" y="12" width="40" height="40" rx="10" fill="#10b981"/>
          <text x="32" y="37" fill="#fff" font-family="monospace" font-size="14" font-weight="bold" text-anchor="middle">&gt;_</text>
          <text x="64" y="30" fill="#f8fafc" font-family="system-ui" font-size="12" font-weight="bold">Termux</text>
          <text x="64" y="44" fill="#94a3b8" font-family="system-ui" font-size="10">Terminal emulator &amp; Linux packages</text>
          <rect x="${width - 100}" y="20" width="56" height="24" rx="12" fill="#0284c7"/>
          <text x="${width - 72}" y="36" fill="#fff" font-family="system-ui" font-size="10" font-weight="bold" text-anchor="middle">OPEN</text>
        </g>

        <!-- App 3: Amaze -->
        <g transform="translate(0, 148)">
          <rect width="${width - 32}" height="64" rx="12" fill="#131e3d" stroke="#1e293b" stroke-width="1"/>
          <rect x="12" y="12" width="40" height="40" rx="10" fill="#f59e0b"/>
          <text x="32" y="37" fill="#fff" font-family="system-ui" font-size="14" text-anchor="middle">📁</text>
          <text x="64" y="30" fill="#f8fafc" font-family="system-ui" font-size="12" font-weight="bold">Amaze File Manager</text>
          <text x="64" y="44" fill="#94a3b8" font-family="system-ui" font-size="10">Open source root explorer</text>
          <rect x="${width - 100}" y="20" width="56" height="24" rx="12" fill="#10b981"/>
          <text x="${width - 72}" y="36" fill="#fff" font-family="system-ui" font-size="10" font-weight="bold" text-anchor="middle">INSTALL</text>
        </g>
      </g>
    `;
  } else if (info.currentApp === 'com.whatsapp') {
    appContent = `
      <rect x="0" y="24" width="${width}" height="${height - 56}" fill="#111b21" />
      <!-- WhatsApp Header -->
      <rect x="0" y="24" width="${width}" height="48" fill="#008069" />
      <text x="20" y="55" fill="#ffffff" font-family="system-ui" font-size="16" font-weight="bold">WhatsApp</text>
      <text x="${width - 60}" y="54" fill="#ffffff" font-family="system-ui" font-size="14">🔍</text>
      <text x="${width - 24}" y="54" fill="#ffffff" font-family="system-ui" font-size="16">⋮</text>
      <!-- Sub-tabs -->
      <rect x="0" y="72" width="${width}" height="32" fill="#008069" />
      <text x="40" y="92" fill="#ffffff" font-family="system-ui" font-size="11" font-weight="bold">CHATS</text>
      <rect x="25" y="101" width="55" height="3" fill="#ffffff" />
      <text x="140" y="92" fill="#a7f3d0" font-family="system-ui" font-size="11">STATUS</text>
      <text x="240" y="92" fill="#a7f3d0" font-family="system-ui" font-size="11">CALLS</text>
      <!-- Chat Threads -->
      <g transform="translate(16, 116)">
        <!-- Thread 1 -->
        <circle cx="20" cy="24" r="18" fill="#25d366" />
        <text x="20" y="30" fill="#fff" font-family="system-ui" font-size="14" font-weight="bold" text-anchor="middle">DF</text>
        <text x="50" y="18" fill="#e9edef" font-family="system-ui" font-size="13" font-weight="600">DevOps Cluster Team</text>
        <text x="50" y="34" fill="#8696a0" font-family="system-ui" font-size="10">Pixel Farm 10 sync operational...</text>
        <text x="${width - 32}" y="18" fill="#25d366" font-family="system-ui" font-size="9" text-anchor="end">14:30</text>
        <circle cx="${width - 40}" cy="30" r="8" fill="#25d366" />
        <text x="${width - 40}" y="34" fill="#111b21" font-family="system-ui" font-size="9" font-weight="bold" text-anchor="middle">3</text>
        <line x1="50" y1="48" x2="${width - 32}" y2="48" stroke="#222e35" stroke-width="1" />

        <!-- Thread 2 -->
        <g transform="translate(0, 56)">
          <circle cx="20" cy="24" r="18" fill="#3b82f6" />
          <text x="20" y="30" fill="#fff" font-family="system-ui" font-size="14" font-weight="bold" text-anchor="middle">AP</text>
          <text x="50" y="18" fill="#e9edef" font-family="system-ui" font-size="13" font-weight="600">Android Phone Farm</text>
          <text x="50" y="34" fill="#8696a0" font-family="system-ui" font-size="10">Device ${info.name} online (Tensor G2)</text>
          <text x="${width - 32}" y="18" fill="#8696a0" font-family="system-ui" font-size="9" text-anchor="end">14:15</text>
          <line x1="50" y1="48" x2="${width - 32}" y2="48" stroke="#222e35" stroke-width="1" />
        </g>

        <!-- Thread 3 -->
        <g transform="translate(0, 112)">
          <circle cx="20" cy="24" r="18" fill="#f59e0b" />
          <text x="20" y="30" fill="#fff" font-family="system-ui" font-size="14" font-weight="bold" text-anchor="middle">PM</text>
          <text x="50" y="18" fill="#e9edef" font-family="system-ui" font-size="13" font-weight="600">Package Manager</text>
          <text x="50" y="34" fill="#8696a0" font-family="system-ui" font-size="10">APK installation confirmed via adb</text>
          <text x="${width - 32}" y="18" fill="#8696a0" font-family="system-ui" font-size="9" text-anchor="end">13:58</text>
          <line x1="50" y1="48" x2="${width - 32}" y2="48" stroke="#222e35" stroke-width="1" />
        </g>
      </g>
      <!-- Floating Action Button -->
      <circle cx="${width - 36}" cy="${height - 72}" r="22" fill="#00a884" shadow="2" />
      <text x="${width - 36}" y="${height - 66}" fill="#fff" font-family="system-ui" font-size="18" text-anchor="middle">💬</text>
    `;
  } else if (info.currentApp === 'org.schabi.newpipe') {
    appContent = `
      <rect x="0" y="24" width="${width}" height="${height - 56}" fill="#18181b" />
      <!-- NewPipe Header -->
      <rect x="0" y="24" width="${width}" height="48" fill="#ef4444" />
      <text x="20" y="55" fill="#ffffff" font-family="system-ui" font-size="16" font-weight="bold">NewPipe</text>
      <text x="${width - 24}" y="55" fill="#ffffff" font-family="system-ui" font-size="16" text-anchor="end">🔍</text>
      <!-- Video 1 -->
      <g transform="translate(16, 84)">
        <rect width="${width - 32}" height="140" rx="12" fill="#27272a" stroke="#3f3f46" stroke-width="1"/>
        <rect x="8" y="8" width="${width - 48}" height="84" rx="8" fill="#09090b"/>
        <text x="${(width - 32) / 2}" y="56" fill="#ef4444" font-family="system-ui" font-size="28" text-anchor="middle">▶</text>
        <rect x="${width - 80}" y="70" width="36" height="16" rx="4" fill="#000000" opacity="0.8"/>
        <text x="${width - 62}" y="82" fill="#fff" font-family="system-ui" font-size="9" text-anchor="middle">14:22</text>
        <text x="12" y="108" fill="#f4f4f5" font-family="system-ui" font-size="11" font-weight="bold">Google Pixel 7 Pro (Cheetah) Farm 10 Test</text>
        <text x="12" y="124" fill="#a1a1aa" font-family="system-ui" font-size="9">Android Lab • 42K views • 2 hours ago</text>
      </g>
      <!-- Video 2 -->
      <g transform="translate(16, 236)">
        <rect width="${width - 32}" height="140" rx="12" fill="#27272a" stroke="#3f3f46" stroke-width="1"/>
        <rect x="8" y="8" width="${width - 48}" height="84" rx="8" fill="#09090b"/>
        <text x="${(width - 32) / 2}" y="56" fill="#ef4444" font-family="system-ui" font-size="28" text-anchor="middle">▶</text>
        <rect x="${width - 80}" y="70" width="36" height="16" rx="4" fill="#000000" opacity="0.8"/>
        <text x="${width - 62}" y="82" fill="#fff" font-family="system-ui" font-size="9" text-anchor="middle">8:45</text>
        <text x="12" y="108" fill="#f4f4f5" font-family="system-ui" font-size="11" font-weight="bold">Google Tensor G2 vs Multi-Device Virtualization</text>
        <text x="12" y="124" fill="#a1a1aa" font-family="system-ui" font-size="9">Hardware Insights • 88K views</text>
      </g>
    `;
  } else if (info.currentApp === 'com.primatelabs.geekbench6') {
    appContent = `
      <rect x="0" y="24" width="${width}" height="${height - 56}" fill="#0f172a" />
      <rect x="0" y="24" width="${width}" height="48" fill="#312e81" />
      <text x="20" y="54" fill="#ffffff" font-family="system-ui" font-size="15" font-weight="bold">Geekbench 6 (Pixel 7 Pro)</text>
      <!-- Scores Banner -->
      <g transform="translate(16, 86)">
        <rect width="${(width - 36) / 2}" height="80" rx="12" fill="#1e1b4b" stroke="#4338ca" stroke-width="1"/>
        <text x="${(width - 36) / 4}" y="32" fill="#a5b4fc" font-family="system-ui" font-size="10" text-anchor="middle">SINGLE-CORE</text>
        <text x="${(width - 36) / 4}" y="62" fill="#38bdf8" font-family="monospace" font-size="26" font-weight="bold" text-anchor="middle">1045</text>

        <rect x="${(width - 36) / 2 + 10}" width="${(width - 36) / 2}" height="80" rx="12" fill="#1e1b4b" stroke="#4338ca" stroke-width="1"/>
        <text x="${((width - 36) / 2 + 10) + (width - 36) / 4}" y="32" fill="#a5b4fc" font-family="system-ui" font-size="10" text-anchor="middle">MULTI-CORE</text>
        <text x="${((width - 36) / 2 + 10) + (width - 36) / 4}" y="62" fill="#4ade80" font-family="monospace" font-size="26" font-weight="bold" text-anchor="middle">3250</text>
      </g>
      <!-- System Specs -->
      <g transform="translate(16, 180)">
        <rect width="${width - 32}" height="140" rx="12" fill="#1e293b" />
        <text x="16" y="28" fill="#f8fafc" font-family="system-ui" font-size="12" font-weight="bold">System Information</text>
        <text x="16" y="52" fill="#94a3b8" font-family="system-ui" font-size="10">Model: Google Pixel 7 Pro (cheetah)</text>
        <text x="16" y="70" fill="#94a3b8" font-family="system-ui" font-size="10">Motherboard: cloudripper • Tensor G2</text>
        <text x="16" y="88" fill="#94a3b8" font-family="system-ui" font-size="10">Governor: schedutil • 8 Cores (2+2+4)</text>
        <text x="16" y="106" fill="#94a3b8" font-family="system-ui" font-size="10">Memory: ${info.ramUsageMb} MB / ${info.totalRamMb} MB (Farm Lite)</text>
        <text x="16" y="124" fill="#34d399" font-family="system-ui" font-size="10">Status: Benchmark Validated</text>
      </g>
    `;
  } else if (info.currentApp === 'com.android.calculator2') {
    appContent = `
      <rect x="0" y="24" width="${width}" height="${height - 56}" fill="#18181b" />
      <rect x="0" y="24" width="${width}" height="44" fill="#27272a" />
      <text x="20" y="52" fill="#FBBC04" font-family="system-ui, sans-serif" font-size="14" font-weight="600">Pixel Calculator</text>
      <!-- Display screen -->
      <rect x="16" y="80" width="${width - 32}" height="90" rx="12" fill="#09090b" stroke="#3f3f46" stroke-width="1"/>
      <text x="${width - 30}" y="116" fill="#a1a1aa" font-family="monospace" font-size="14" text-anchor="end">${calcExpression || '0'}</text>
      <text x="${width - 30}" y="154" fill="#38bdf8" font-family="monospace" font-size="24" font-weight="bold" text-anchor="end">${calcResult || '0'}</text>
      <!-- Keypad -->
      <g transform="translate(16, 190)">
        <rect width="${(width - 32) * 0.22}" height="46" rx="10" fill="#27272a"/>
        <text x="${(width - 32) * 0.11}" y="28" fill="#ef4444" font-family="system-ui" font-size="15" text-anchor="middle">C</text>
        <rect x="${(width - 32) * 0.26}" width="${(width - 32) * 0.22}" height="46" rx="10" fill="#27272a"/>
        <text x="${(width - 32) * 0.37}" y="28" fill="#38bdf8" font-family="system-ui" font-size="15" text-anchor="middle">()</text>
        <rect x="${(width - 32) * 0.52}" width="${(width - 32) * 0.22}" height="46" rx="10" fill="#27272a"/>
        <text x="${(width - 32) * 0.63}" y="28" fill="#38bdf8" font-family="system-ui" font-size="15" text-anchor="middle">%</text>
        <rect x="${(width - 32) * 0.78}" width="${(width - 32) * 0.22}" height="46" rx="10" fill="#ea580c"/>
        <text x="${(width - 32) * 0.89}" y="28" fill="#ffffff" font-family="system-ui" font-size="16" text-anchor="middle">÷</text>

        <!-- Digits row -->
        <g transform="translate(0, 56)">
          <rect width="${(width - 32) * 0.22}" height="46" rx="10" fill="#3f3f46"/>
          <text x="${(width - 32) * 0.11}" y="28" fill="#fff" font-family="system-ui" font-size="15" text-anchor="middle">7</text>
          <rect x="${(width - 32) * 0.26}" width="${(width - 32) * 0.22}" height="46" rx="10" fill="#3f3f46"/>
          <text x="${(width - 32) * 0.37}" y="28" fill="#fff" font-family="system-ui" font-size="15" text-anchor="middle">8</text>
          <rect x="${(width - 32) * 0.52}" width="${(width - 32) * 0.22}" height="46" rx="10" fill="#3f3f46"/>
          <text x="${(width - 32) * 0.63}" y="28" fill="#fff" font-family="system-ui" font-size="15" text-anchor="middle">9</text>
          <rect x="${(width - 32) * 0.78}" width="${(width - 32) * 0.22}" height="46" rx="10" fill="#ea580c"/>
          <text x="${(width - 32) * 0.89}" y="28" fill="#fff" font-family="system-ui" font-size="16" text-anchor="middle">×</text>
        </g>
        <g transform="translate(0, 112)">
          <rect width="${(width - 32) * 0.22}" height="46" rx="10" fill="#3f3f46"/>
          <text x="${(width - 32) * 0.11}" y="28" fill="#fff" font-family="system-ui" font-size="15" text-anchor="middle">4</text>
          <rect x="${(width - 32) * 0.26}" width="${(width - 32) * 0.22}" height="46" rx="10" fill="#3f3f46"/>
          <text x="${(width - 32) * 0.37}" y="28" fill="#fff" font-family="system-ui" font-size="15" text-anchor="middle">5</text>
          <rect x="${(width - 32) * 0.52}" width="${(width - 32) * 0.22}" height="46" rx="10" fill="#3f3f46"/>
          <text x="${(width - 32) * 0.63}" y="28" fill="#fff" font-family="system-ui" font-size="15" text-anchor="middle">6</text>
          <rect x="${(width - 32) * 0.78}" width="${(width - 32) * 0.22}" height="46" rx="10" fill="#ea580c"/>
          <text x="${(width - 32) * 0.89}" y="28" fill="#fff" font-family="system-ui" font-size="16" text-anchor="middle">-</text>
        </g>
        <g transform="translate(0, 168)">
          <rect width="${(width - 32) * 0.22}" height="46" rx="10" fill="#3f3f46"/>
          <text x="${(width - 32) * 0.11}" y="28" fill="#fff" font-family="system-ui" font-size="15" text-anchor="middle">1</text>
          <rect x="${(width - 32) * 0.26}" width="${(width - 32) * 0.22}" height="46" rx="10" fill="#3f3f46"/>
          <text x="${(width - 32) * 0.37}" y="28" fill="#fff" font-family="system-ui" font-size="15" text-anchor="middle">2</text>
          <rect x="${(width - 32) * 0.52}" width="${(width - 32) * 0.22}" height="46" rx="10" fill="#3f3f46"/>
          <text x="${(width - 32) * 0.63}" y="28" fill="#fff" font-family="system-ui" font-size="15" text-anchor="middle">3</text>
          <rect x="${(width - 32) * 0.78}" width="${(width - 32) * 0.22}" height="46" rx="10" fill="#ea580c"/>
          <text x="${(width - 32) * 0.89}" y="28" fill="#fff" font-family="system-ui" font-size="16" text-anchor="middle">+</text>
        </g>
        <g transform="translate(0, 224)">
          <rect width="${(width - 32) * 0.48}" height="46" rx="10" fill="#3f3f46"/>
          <text x="${(width - 32) * 0.24}" y="28" fill="#fff" font-family="system-ui" font-size="15" text-anchor="middle">0</text>
          <rect x="${(width - 32) * 0.52}" width="${(width - 32) * 0.22}" height="46" rx="10" fill="#3f3f46"/>
          <text x="${(width - 32) * 0.63}" y="28" fill="#fff" font-family="system-ui" font-size="15" text-anchor="middle">.</text>
          <rect x="${(width - 32) * 0.78}" width="${(width - 32) * 0.22}" height="46" rx="10" fill="#16a34a"/>
          <text x="${(width - 32) * 0.89}" y="28" fill="#fff" font-family="system-ui" font-size="16" text-anchor="middle">=</text>
        </g>
      </g>
    `;
  } else if (info.currentApp === 'com.android.chrome') {
    appContent = `
      <rect x="0" y="24" width="${width}" height="${height - 56}" fill="#0f172a" />
      <!-- Chrome Address Bar -->
      <rect x="0" y="24" width="${width}" height="46" fill="#1e293b" />
      <rect x="12" y="32" width="${width - 50}" height="30" rx="15" fill="#334155" />
      <circle cx="26" cy="47" r="5" fill="#10b981" />
      <text x="38" y="51" fill="#e2e8f0" font-family="monospace" font-size="10">${browserUrl || 'https://google.com'}</text>
      <circle cx="${width - 24}" cy="47" r="10" fill="#475569" />
      <text x="${width - 24}" y="51" fill="#fff" font-family="system-ui" font-size="10" text-anchor="middle">1</text>
      <!-- Web Page Body -->
      <g transform="translate(20, 85)">
        <text x="${(width - 40) / 2}" y="35" fill="#38bdf8" font-family="system-ui" font-size="22" font-weight="bold" text-anchor="middle">Google</text>
        <rect x="10" y="55" width="${width - 60}" height="32" rx="16" fill="#1e293b" stroke="#475569" stroke-width="1"/>
        <text x="30" y="75" fill="#94a3b8" font-family="system-ui" font-size="11">Search or type URL...</text>
        <g transform="translate(0, 110)">
          <rect width="${(width - 40) * 0.48}" height="68" rx="10" fill="#1e293b"/>
          <text x="12" y="26" fill="#f8fafc" font-family="system-ui" font-size="11" font-weight="600">Pixel News</text>
          <text x="12" y="46" fill="#94a3b8" font-family="system-ui" font-size="9">Tensor G2 Farm live...</text>
          <rect x="${(width - 40) * 0.52}" width="${(width - 40) * 0.48}" height="68" rx="10" fill="#1e293b"/>
          <text x="${(width - 40) * 0.52 + 12}" y="26" fill="#f8fafc" font-family="system-ui" font-size="11" font-weight="600">Weather</text>
          <text x="${(width - 40) * 0.52 + 12}" y="46" fill="#94a3b8" font-family="system-ui" font-size="9">Clear • 24°C</text>
        </g>
      </g>
    `;
  } else if (info.currentApp === 'com.android.terminal') {
    appContent = `
      <rect x="0" y="24" width="${width}" height="${height - 56}" fill="#09090b" />
      <rect x="0" y="24" width="${width}" height="36" fill="#18181b" />
      <text x="16" y="46" fill="#10b981" font-family="monospace" font-size="11" font-weight="bold">sh - adbd@pixel-cheetah [${info.id}]</text>
      <g transform="translate(14, 75)" font-family="monospace" font-size="10" fill="#a1a1aa">
        <text y="0" fill="#6ee7b7">root@cheetah:/ # getprop ro.product.model</text>
        <text y="18">Pixel 7 Pro</text>
        <text y="36" fill="#6ee7b7">root@cheetah:/ # getprop ro.product.device</text>
        <text y="54">cheetah</text>
        <text y="72" fill="#6ee7b7">root@cheetah:/ # getprop ro.board.platform</text>
        <text y="90">tensor2 (Google Tensor G2)</text>
        <text y="108" fill="#6ee7b7">root@cheetah:/ # getprop ro.build.id</text>
        <text y="126">UQ1A.240205.004</text>
        <text y="144" fill="#6ee7b7">root@cheetah:/ # pm list packages -3</text>
        <text y="162">${(info.installedPackages || []).filter(p => !p.isSystem).map(p => `package:${p.packageName}`).slice(0, 2).join(' ')}</text>
        <text y="180" fill="#38bdf8">root@cheetah:/ # _</text>
      </g>
    `;
  } else if (info.currentApp === 'com.android.settings') {
    appContent = `
      <rect x="0" y="24" width="${width}" height="${height - 56}" fill="#18181b" />
      <rect x="0" y="24" width="${width}" height="44" fill="#27272a" />
      <text x="20" y="51" fill="#f4f4f5" font-family="system-ui" font-size="14" font-weight="600">Settings</text>
      <g transform="translate(16, 78)">
        <rect width="${width - 32}" height="44" rx="10" fill="#27272a"/>
        <text x="14" y="24" fill="#f4f4f5" font-family="system-ui" font-size="12" font-weight="500">Network &amp; Internet</text>
        <text x="14" y="38" fill="#a1a1aa" font-family="system-ui" font-size="9">Wi-Fi (Pixel_Farm_5G) Connected</text>

        <rect y="50" width="${width - 32}" height="44" rx="10" fill="#27272a"/>
        <text x="14" y="74" fill="#f4f4f5" font-family="system-ui" font-size="12" font-weight="500">About Emulated Phone</text>
        <text x="14" y="88" fill="#38bdf8" font-family="system-ui" font-size="9">Google Pixel 7 Pro (cheetah)</text>

        <rect y="100" width="${width - 32}" height="44" rx="10" fill="#27272a"/>
        <text x="14" y="124" fill="#f4f4f5" font-family="system-ui" font-size="12" font-weight="500">Processor &amp; Memory</text>
        <text x="14" y="138" fill="#a1a1aa" font-family="system-ui" font-size="9">Google Tensor G2 • ${info.ramUsageMb}M / ${info.totalRamMb}M RAM (Lite)</text>

        <rect y="150" width="${width - 32}" height="44" rx="10" fill="#27272a"/>
        <text x="14" y="174" fill="#f4f4f5" font-family="system-ui" font-size="12" font-weight="500">Installed Packages (${info.installedPackages?.length || 7})</text>
        <text x="14" y="188" fill="#22c55e" font-family="system-ui" font-size="9">Package Manager Engine Active</text>
      </g>
    `;
  } else {
    // Custom Installed User App Activity
    const currentPkg = (info.installedPackages || []).find((p) => p.packageName === info.currentApp);
    const appColor = currentPkg?.color || '#3B82F6';
    const appTitle = currentPkg?.name || info.currentAppName || 'Android App';
    const appVer = currentPkg?.version || '1.0.0';

    appContent = `
      <rect x="0" y="24" width="${width}" height="${height - 56}" fill="#0f172a" />
      <!-- App Header Bar -->
      <rect x="0" y="24" width="${width}" height="48" fill="${appColor}" />
      <text x="20" y="54" fill="#ffffff" font-family="system-ui" font-size="15" font-weight="bold">${appTitle}</text>
      <text x="${width - 24}" y="54" fill="#ffffff" font-family="system-ui" font-size="12" text-anchor="end">v${appVer}</text>
      <!-- Activity View Canvas -->
      <g transform="translate(16, 88)">
        <rect width="${width - 32}" height="120" rx="14" fill="#1e293b" stroke="#334155" stroke-width="1"/>
        <circle cx="40" cy="40" r="22" fill="${appColor}" opacity="0.3" />
        <text x="40" y="47" fill="#ffffff" font-family="system-ui" font-size="18" font-weight="bold" text-anchor="middle">${appTitle.charAt(0)}</text>
        <text x="74" y="36" fill="#f8fafc" font-family="system-ui" font-size="14" font-weight="bold">${appTitle}</text>
        <text x="74" y="52" fill="#94a3b8" font-family="monospace" font-size="10">${info.currentApp}</text>
        <text x="74" y="68" fill="#38bdf8" font-family="system-ui" font-size="10">Active Process • PID ${Math.floor(1800 + Math.random() * 400)}</text>
        <rect x="16" y="80" width="${width - 64}" height="28" rx="8" fill="#334155"/>
        <text x="${(width - 32) / 2}" y="98" fill="#a7f3d0" font-family="monospace" font-size="10" text-anchor="middle">✓ Executing on Google Tensor G2</text>
      </g>
      <g transform="translate(16, 224)">
        <rect width="${width - 32}" height="76" rx="12" fill="#1e293b" stroke="#334155" stroke-width="1"/>
        <text x="16" y="26" fill="#e2e8f0" font-family="system-ui" font-size="11" font-weight="600">Runtime Telemetry</text>
        <text x="16" y="44" fill="#94a3b8" font-family="system-ui" font-size="10">Memory Allocation: ~${currentPkg?.sizeMb || 18} MB</text>
        <text x="16" y="60" fill="#22c55e" font-family="system-ui" font-size="10">State: RUNNING_FOREGROUND_SERVICE</text>
      </g>
    `;
  }

  // Touch Ripples
  const now = Date.now();
  const ripples = recentTouches
    .filter((t) => now - t.time < 1200)
    .map((t) => {
      const px = t.x * width;
      const py = t.y * height;
      const age = (now - t.time) / 1200;
      const radius = 8 + age * 24;
      const opacity = Math.max(0, 0.9 - age);
      return `<circle cx="${px}" cy="${py}" r="${radius}" fill="#38bdf8" opacity="${opacity}" stroke="#ffffff" stroke-width="1.5" />`;
    })
    .join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="w-full h-full select-none">
      <!-- Background Base -->
      <rect width="${width}" height="${height}" fill="#09090b"/>

      <!-- App Canvas Content -->
      ${appContent}

      <!-- Status Bar (Top) -->
      <rect x="0" y="0" width="${width}" height="24" fill="#000000" opacity="0.6"/>
      <text x="14" y="16" fill="#f4f4f5" font-family="system-ui, sans-serif" font-size="10" font-weight="600">14:32</text>
      <g transform="translate(${width - 64}, 6)" fill="#f4f4f5">
        <!-- Wifi icon -->
        <path d="M1 4a12 12 0 0 1 12 0M3 7a8 8 0 0 1 8 0M5 10a4 4 0 0 1 4 0M7 13h0" stroke="#f4f4f5" stroke-width="1.5" stroke-linecap="round"/>
        <!-- Battery icon -->
        <rect x="24" y="2" width="18" height="9" rx="2" fill="none" stroke="#f4f4f5" stroke-width="1"/>
        <rect x="42" y="4" width="2" height="5" rx="0.5" fill="#f4f4f5"/>
        <rect x="26" y="4" width="${Math.round((info.batteryLevel / 100) * 14)}" height="5" fill="${info.batteryLevel > 20 ? '#22c55e' : '#ef4444'}"/>
      </g>

      <!-- Pixel 7 Pro Centered Hole-Punch Selfie Camera -->
      <circle cx="${width / 2}" cy="14" r="5" fill="#050505" stroke="#18181b" stroke-width="1"/>
      <circle cx="${width / 2}" cy="14" r="1.8" fill="#0f172a" opacity="0.8"/>

      <!-- Pixel Gesture Navigation Bar (Bottom) -->
      <rect x="0" y="${height - 24}" width="${width}" height="24" fill="#000000" opacity="0.85"/>
      <!-- Pixel Gesture Pill Bar -->
      <rect x="${width / 2 - 38}" y="${height - 13}" width="76" height="4" rx="2" fill="#ffffff" opacity="0.85"/>

      <!-- Active Touch Ripples -->
      ${ripples}
    </svg>
  `;
}

// Device records are capped by measured host capacity when real emulators are enabled.
const deviceSlots = androidRuntime.enabled ? Math.max(1, androidRuntime.capacity.maxDevices) : 10;
for (let i = 1; i <= deviceSlots; i++) {
  const id = `pixel-${String(i).padStart(2, '0')}`;
  const name = `Pixel 7 Pro #${String(i).padStart(2, '0')}`;
  const isDefaultOnline = !androidRuntime.enabled && i <= 8;
  const status = androidRuntime.enabled
    ? androidRuntime.capacity.maxDevices > 0 ? 'offline' : 'error'
    : isDefaultOnline ? 'online' : i === 9 ? 'starting' : 'offline';

  const initialPackages: InstalledPackage[] = [...DEFAULT_PACKAGES];
  if (i === 1) {
    initialPackages.push({
      packageName: 'com.termux',
      name: 'Termux',
      version: '0.118.1',
      icon: 'terminal',
      color: '#10B981',
      installDate: '2026-02-10',
      sizeMb: 84.5,
      isSystem: false,
      category: 'Developer & CLI',
    });
    initialPackages.push({
      packageName: 'org.fdroid.fdroid',
      name: 'F-Droid',
      version: '1.21.0',
      icon: 'download',
      color: '#0284C7',
      installDate: '2026-02-10',
      sizeMb: 14.2,
      isSystem: false,
      category: 'App Repository',
    });
  } else if (i === 2) {
    initialPackages.push({
      packageName: 'com.whatsapp',
      name: 'WhatsApp',
      version: '2.24.8.4',
      icon: 'message-circle',
      color: '#25D366',
      installDate: '2026-02-12',
      sizeMb: 38.0,
      isSystem: false,
      category: 'Communication',
    });
  } else if (i === 3) {
    initialPackages.push({
      packageName: 'org.schabi.newpipe',
      name: 'NewPipe',
      version: '0.27.0',
      icon: 'play-circle',
      color: '#EF4444',
      installDate: '2026-02-14',
      sizeMb: 11.4,
      isSystem: false,
      category: 'Media & Streaming',
    });
    initialPackages.push({
      packageName: 'com.primatelabs.geekbench6',
      name: 'Geekbench',
      version: '6.3.0',
      icon: 'cpu',
      color: '#6366F1',
      installDate: '2026-02-15',
      sizeMb: 42.0,
      isSystem: false,
      category: 'Benchmarking',
    });
  }

  const info: DeviceInfo = {
    id,
    name,
    model: androidRuntime.enabled ? 'Pixel 7 Pro (virtual AVD profile)' : 'Google Pixel 7 Pro',
    codename: androidRuntime.enabled ? 'virtual-x86_64' : 'cheetah',
    buildFingerprint: androidRuntime.enabled ? '' : 'google/cheetah/cheetah:14/UQ1A.240205.004/11269623:user/release-keys',
    status,
    ip: androidRuntime.enabled ? '127.0.0.1' : `172.28.0.${10 + i}`,
    adbPort: getEmulatorPort(i),
    resolution: { width: 720, height: 1560 }, // Pixel 7 Pro 19.5:9 Ultra-Lightweight Farm Profile
    orientation: 'portrait',
    batteryLevel: androidRuntime.enabled ? 100 : 80 + (i % 20),
    isCharging: true,
    cpuUsage: status === 'online' ? 10 + Math.floor(Math.random() * 15) : 0,
    ramUsageMb: status === 'online' ? 480 + Math.floor(Math.random() * 110) : 0, // Ultra-lightweight ~550MB
    totalRamMb: androidRuntime.enabled ? Number(process.env.EMULATOR_MEMORY_MB || 2048) : 1536,
    currentApp: androidRuntime.enabled
      ? 'com.google.android.apps.nexuslauncher'
      : i === 1 || i === 3 || i === 8 ? 'com.google.android.youtube' : i === 2 || i === 4 || i === 7 ? 'com.zhiliaoapp.musically' : i === 5 ? 'com.android.chrome' : 'com.android.launcher',
    currentAppName: androidRuntime.enabled
      ? 'Pixel Launcher'
      : i === 1 || i === 3 || i === 8 ? 'YouTube' : i === 2 || i === 4 || i === 7 ? 'TikTok' : i === 5 ? 'Google Chrome' : 'Pixel Launcher',
    installedPackages: androidRuntime.enabled ? [] : initialPackages,
    uptimeSeconds: androidRuntime.enabled ? 0 : status === 'online' ? 3600 + i * 420 : 0,
    lastPing: Date.now(),
    activeColor: '#34A853',
    inputQueueLength: 0,
    serialNumber: androidRuntime.enabled ? `emulator-${getEmulatorPort(i)}` : `28231FDH200${String(i).padStart(2, '0')}`,
    androidVersion: androidRuntime.enabled ? '15 (Google Play system image)' : '14.0 (Pixel Experience Lite)',
    apiLevel: androidRuntime.enabled ? 35 : 34,
  };

  const initialApp = info.currentApp;
  const state: DeviceInternalState = {
    info,
    appHistory: [
      androidRuntime.enabled ? 'com.google.android.apps.nexuslauncher' : 'com.android.launcher',
      initialApp,
    ].filter((v, idx, arr) => arr.indexOf(v) === idx),
    calcExpression: '',
    calcResult: '',
    terminalHistory: [],
    browserUrl: 'https://google.com',
    recentTouches: [],
    isLocked: false,
  };

  if (!androidRuntime.enabled) state.info.thumbnailSvg = generateScreenSvg(state);
  devicesMap.set(id, state);
}

// Background metrics ticker to simulate real device heartbeat & stats
let totalOpsExecuted = 0;
let latencyHistory: number[] = androidRuntime.enabled ? [] : [28, 34, 25, 31, 29];

const metricsTicker = setInterval(() => {
  const now = Date.now();
  let updatedAny = false;

  for (const [id, state] of devicesMap.entries()) {
    if (androidRuntime.enabled) {
      if (state.info.status === 'online') {
        state.info.uptimeSeconds = Math.floor((now - (runtimeStartedAt.get(id) || now)) / 1000);
        if (now - state.info.lastPing >= 15_000) {
          refreshRuntimeMetadata(id, state.info.adbPort);
        }
      }
    } else if (state.info.status === 'starting') {
      // Advance starting to online after a few ticks
      state.info.status = 'online';
      state.info.cpuUsage = 24;
      state.info.ramUsageMb = 750;
      state.info.thumbnailSvg = generateScreenSvg(state);
      addLog('info', 'adb', `${state.info.name} boot completed, adbd listening on port ${state.info.adbPort}`, id);
      broadcastMessage({ type: 'DEVICE_UPDATED', device: state.info });
      updatedAny = true;
    } else if (state.info.status === 'online') {
      // gentle jitter
      state.info.uptimeSeconds += 2;
      const targetCpu = Math.max(8, Math.min(65, state.info.cpuUsage + (Math.random() * 6 - 3)));
      state.info.cpuUsage = Math.round(targetCpu);
      state.info.ramUsageMb = Math.round(Math.max(500, Math.min(1400, state.info.ramUsageMb + (Math.random() * 10 - 5))));
      state.info.lastPing = now;
    }
  }

  // Purge expired touches
  for (const [, state] of devicesMap.entries()) {
    if (state.recentTouches.length > 0) {
      const beforeCount = state.recentTouches.length;
      state.recentTouches = state.recentTouches.filter((t) => now - t.time < 1200);
      if (state.recentTouches.length !== beforeCount) {
        state.info.thumbnailSvg = generateScreenSvg(state);
        updatedAny = true;
      }
    }
  }

  if (updatedAny) {
    // broadcast devices
    broadcastDevices();
  }

  // Broadcast system stats
  broadcastStats();
}, 2500);

function getSystemStats(): SystemStats {
  let onlineCount = 0;
  let totalCpu = 0;
  let totalRam = 0;

  for (const [, state] of devicesMap.entries()) {
    if (state.info.status === 'online') {
      onlineCount++;
      totalCpu += state.info.cpuUsage;
      totalRam += state.info.ramUsageMb;
    }
  }

  const avgLatency =
    latencyHistory.length > 0
      ? Math.round(latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length)
      : androidRuntime.enabled ? 0 : 30;

  return {
    cpuPercent: androidRuntime.enabled
      ? Math.min(100, Math.round(((os.loadavg()[0] || 0) / Math.max(1, os.cpus().length)) * 100))
      : Math.round((totalCpu / 10) * 0.45 + (os.loadavg()[0] || 0.2) * 8),
    ramUsedMb: androidRuntime.enabled
      ? getCgroupMemoryUsageMb() ?? Math.round((os.totalmem() - os.freemem()) / 1024 / 1024)
      : totalRam + Math.round((os.totalmem() - os.freemem()) / 1024 / 1024 / 4),
    ramTotalMb: androidRuntime.enabled
      ? androidRuntime.capacity.memoryLimitMb
      : Math.round(os.totalmem() / 1024 / 1024),
    onlineCount,
    totalCount: devicesMap.size,
    activeStreams: wss?.clients.size || 0,
    totalOpsExecuted,
    averageLatencyMs: avgLatency,
    uptime: Math.round(process.uptime()),
    networkRxKb: androidRuntime.enabled ? 0 : 1420 + Math.round(totalOpsExecuted * 8.4),
    networkTxKb: androidRuntime.enabled ? 0 : 3820 + Math.round(totalOpsExecuted * 24.2),
  };
}

// --- NGROK CONFIGURATION ---
let ngrokConfig: NgrokConfig = {
  enabled: !!NGROK_AUTH_TOKEN,
  hasToken: !!NGROK_AUTH_TOKEN,
  maskedToken: NGROK_AUTH_TOKEN
    ? `${NGROK_AUTH_TOKEN.substring(0, 4)}••••••••${NGROK_AUTH_TOKEN.substring(NGROK_AUTH_TOKEN.length - 4)}`
    : '',
  status: NGROK_AUTH_TOKEN ? 'offline' : 'not_configured',
  region: 'ap (Asia/Pacific)',
  protocol: 'https',
  activeTunnelsCount: 0,
};

// --- INPUT HANDLER & NORMALIZER ---
function handleDeviceInput(deviceId: string, command: DeviceInputCommand): DeviceExecutionResult {
  const state = devicesMap.get(deviceId);
  const startTime = Date.now();

  if (!state) {
    return {
      deviceId,
      deviceName: deviceId,
      status: 'offline',
      latencyMs: 1,
      error: 'Device not found in registry',
    };
  }

  if (state.info.status !== 'online') {
    return {
      deviceId,
      deviceName: state.info.name,
      status: 'offline',
      latencyMs: 1,
      error: `Device is currently ${state.info.status}`,
    };
  }

  // Simulated execution latency (15ms - 45ms)
  const execLatency = androidRuntime.enabled ? 0 : Math.floor(15 + Math.random() * 30);

  // Normalization logic
  const isPortrait = state.info.orientation === 'portrait';
  const screenWidth = isPortrait ? state.info.resolution.width : state.info.resolution.height;
  const screenHeight = isPortrait ? state.info.resolution.height : state.info.resolution.width;

  switch (command.type) {
    case 'tap': {
      const normX = Math.max(0, Math.min(1, command.x ?? 0.5));
      const normY = Math.max(0, Math.min(1, command.y ?? 0.5));
      const pxX = Math.round(normX * screenWidth);
      const pxY = Math.round(normY * screenHeight);

      state.recentTouches.push({ x: normX, y: normY, time: Date.now() });

      // Interactive logic based on screen areas
      // Navigation bar click
      if (normY > 0.93) {
        if (normX < 0.35) {
          // Back
          if (state.appHistory.length > 1) {
            state.appHistory.pop();
            state.info.currentApp = state.appHistory[state.appHistory.length - 1];
            state.info.currentAppName = APPS.find((a) => a.packageName === state.info.currentApp)?.name || 'App';
          }
        } else if (normX > 0.4 && normX < 0.6) {
          // Home
          state.info.currentApp = 'com.android.launcher';
          state.info.currentAppName = 'Home Screen';
          state.appHistory = ['com.android.launcher'];
        } else {
          // Recents
          addLog('debug', 'adb', `${state.info.name} KEYCODE_APP_SWITCH`, deviceId);
        }
      } else if (state.info.currentApp === 'com.android.launcher') {
        const userApps = (state.info.installedPackages || []).filter((p) => !p.isSystem);
        const col = normX < 0.26 ? 0 : normX < 0.50 ? 1 : normX < 0.74 ? 2 : 3;

        if (normY >= 0.26 && normY < 0.37) {
          // Row 1: YouTube, TikTok, Chrome, Settings
          const row1Pkgs = ['com.google.android.youtube', 'com.zhiliaoapp.musically', 'com.android.chrome', 'com.android.settings'];
          state.info.currentApp = row1Pkgs[col];
          state.appHistory.push(state.info.currentApp);
          state.info.currentAppName = APPS.find((a) => a.packageName === state.info.currentApp)?.name || 'App';
        } else if (normY >= 0.37 && normY < 0.48) {
          // Row 2: Photos, Phone, Camera, Files
          const row2Pkgs = ['com.android.gallery3d', 'com.android.dialer', 'com.android.camera2', 'com.android.documentsui'];
          state.info.currentApp = row2Pkgs[col];
          state.appHistory.push(state.info.currentApp);
          state.info.currentAppName = APPS.find((a) => a.packageName === state.info.currentApp)?.name || 'App';
        } else if (normY >= 0.48 && normY < 0.59) {
          // Row 3: User Installed Apps (0..3)
          if (userApps[col]) {
            state.info.currentApp = userApps[col].packageName;
            state.appHistory.push(state.info.currentApp);
            state.info.currentAppName = userApps[col].name;
          }
        } else if (normY >= 0.59 && normY < 0.70) {
          // Row 4: User Installed Apps (4..7)
          const targetIndex = 4 + col;
          if (userApps[targetIndex]) {
            state.info.currentApp = userApps[targetIndex].packageName;
            state.appHistory.push(state.info.currentApp);
            state.info.currentAppName = userApps[targetIndex].name;
          }
        } else if (normY >= 0.88 && normY < 0.94) {
          // Dock Search Bar -> open Chrome
          state.info.currentApp = 'com.android.chrome';
          state.appHistory.push(state.info.currentApp);
          state.info.currentAppName = 'Google Chrome';
        }
      } else if (state.info.currentApp === 'com.termux') {
        // Tapping in Termux advances command prompt
        addLog('info', 'adb', `${state.info.name} Termux input trigger: python3 script.py`, deviceId);
      } else if (state.info.currentApp === 'org.fdroid.fdroid') {
        // Tapping in F-Droid installs Amaze File Manager if not present
        if (!state.info.installedPackages?.some(p => p.packageName === 'com.amaze.filemanager')) {
          installApkToDevice(deviceId, {
            packageName: 'com.amaze.filemanager',
            appName: 'Amaze File Manager',
            version: '3.8.4',
            icon: 'folder',
            color: '#F59E0B',
            sizeMb: 9.3,
          });
        }
      } else if (state.info.currentApp === 'com.android.calculator2') {
        // Calculator keypad interaction
        if (normY > 0.32 && normY < 0.75) {
          const numbers = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'];
          const randomChar = numbers[Math.floor(Math.random() * numbers.length)];
          state.calcExpression = (state.calcExpression + randomChar).slice(-12);
          try {
            // safe eval of simple digits
            state.calcResult = String(eval(state.calcExpression.replace(/[^0-9+\-*/]/g, '')) || '0');
          } catch {
            state.calcResult = state.calcExpression;
          }
        }
      }

      addLog('debug', 'adb', `adb shell input tap ${pxX} ${pxY} (norm: ${normX.toFixed(3)}, ${normY.toFixed(3)})`, deviceId);
      break;
    }

    case 'swipe': {
      const startX = Math.round((command.startX ?? 0.5) * screenWidth);
      const startY = Math.round((command.startY ?? 0.7) * screenHeight);
      const endX = Math.round((command.endX ?? 0.5) * screenWidth);
      const endY = Math.round((command.endY ?? 0.3) * screenHeight);
      const duration = command.durationMs ?? 300;

      state.recentTouches.push({ x: command.startX ?? 0.5, y: command.startY ?? 0.7, time: Date.now() });
      state.recentTouches.push({ x: command.endX ?? 0.5, y: command.endY ?? 0.3, time: Date.now() + 100 });

      addLog('debug', 'adb', `adb shell input swipe ${startX} ${startY} ${endX} ${endY} ${duration}`, deviceId);
      break;
    }

    case 'key': {
      const code = command.keycode || 'HOME';
      if (code === 'HOME') {
        state.info.currentApp = 'com.android.launcher';
        state.info.currentAppName = 'Home Screen';
        state.appHistory = ['com.android.launcher'];
      } else if (code === 'BACK') {
        if (state.appHistory.length > 1) {
          state.appHistory.pop();
          state.info.currentApp = state.appHistory[state.appHistory.length - 1];
          state.info.currentAppName = APPS.find((a) => a.packageName === state.info.currentApp)?.name || 'App';
        }
      } else if (code === 'POWER') {
        state.isLocked = !state.isLocked;
      }
      addLog('info', 'adb', `adb shell input keyevent KEYCODE_${code}`, deviceId);
      break;
    }

    case 'text': {
      const sanitized = (command.text || '').replace(/[^a-zA-Z0-9 ._/:@-]/g, '');
      if (state.info.currentApp === 'com.android.chrome') {
        state.browserUrl = sanitized.startsWith('http') ? sanitized : `https://${sanitized}`;
      } else if (state.info.currentApp === 'com.android.calculator2') {
        state.calcExpression = sanitized.slice(0, 10);
      }
      addLog('info', 'adb', `adb shell input text "${sanitized}"`, deviceId);
      break;
    }

    case 'launch': {
      const pkg = command.packageName || 'com.android.chrome';
      state.info.currentApp = pkg;
      const foundPkg = (state.info.installedPackages || []).find((p) => p.packageName === pkg);
      state.info.currentAppName = foundPkg?.name || APPS.find((a) => a.packageName === pkg)?.name || pkg;
      state.appHistory.push(pkg);
      addLog('info', 'adb', `adb shell monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`, deviceId);
      break;
    }

    case 'rotate': {
      state.info.orientation = state.info.orientation === 'portrait' ? 'landscape' : 'portrait';
      addLog('info', 'adb', `adb shell settings put system user_rotation ${state.info.orientation === 'landscape' ? 1 : 0}`, deviceId);
      break;
    }

    case 'reboot': {
      state.info.status = 'starting';
      state.info.thumbnailSvg = generateScreenSvg(state);
      addLog('warn', 'adb', `adb reboot initiated on ${state.info.name}`, deviceId);
      break;
    }
  }

  // Update SVG
  state.info.thumbnailSvg = generateScreenSvg(state);

  totalOpsExecuted++;
  const actualLatency = Math.max(1, Date.now() - startTime) + execLatency;
  latencyHistory.push(actualLatency);
  if (latencyHistory.length > 20) latencyHistory.shift();

  return {
    deviceId,
    deviceName: state.info.name,
    status: 'success',
    latencyMs: actualLatency,
  };
}

async function executeDeviceInput(deviceId: string, command: DeviceInputCommand): Promise<DeviceExecutionResult> {
  if (!androidRuntime.enabled) return handleDeviceInput(deviceId, command);

  const state = devicesMap.get(deviceId);
  const startTime = Date.now();
  if (!state) {
    return { deviceId, deviceName: deviceId, status: 'offline', latencyMs: 1, error: 'Device not found' };
  }
  if (state.info.status !== 'online') {
    return {
      deviceId,
      deviceName: state.info.name,
      status: 'offline',
      latencyMs: 1,
      error: `Device is currently ${state.info.status}`,
    };
  }

  try {
    await androidRuntime.input(deviceId, state.info.adbPort, command);
    if (command.type === 'launch') {
      state.info.currentApp = command.packageName || 'com.google.android.youtube';
      state.info.currentAppName = APPS.find((app) => app.packageName === state.info.currentApp)?.name || state.info.currentApp;
    } else if (command.type === 'key' && command.keycode === 'HOME') {
      state.info.currentApp = 'com.google.android.apps.nexuslauncher';
      state.info.currentAppName = 'Pixel Launcher';
    } else if (command.type === 'reboot') {
      state.info.status = 'starting';
    }

    totalOpsExecuted++;
    const latencyMs = Date.now() - startTime;
    latencyHistory.push(latencyMs);
    if (latencyHistory.length > 20) latencyHistory.shift();
    refreshRuntimeMetadata(deviceId, state.info.adbPort);
    return { deviceId, deviceName: state.info.name, status: 'success', latencyMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Android input failed';
    addLog('error', 'adb', message, deviceId);
    return { deviceId, deviceName: state.info.name, status: 'failed', latencyMs: Date.now() - startTime, error: message };
  }
}

// --- CONCURRENCY-LIMITED SYNC DISPATCHER ---
async function executeSyncAction(req: SyncExecutionRequest): Promise<SyncExecutionResponse> {
  const opId = `op-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const startTime = Date.now();
  const maxConcurrency = req.maxConcurrency || 5;

  addLog('info', 'sync', `Sync Operation [${opId}] started: ${req.action.type.toUpperCase()} across ${req.targetDeviceIds.length} target devices`, undefined, { action: req.action });

  const results: DeviceExecutionResult[] = [];
  const targets = [...req.targetDeviceIds];

  // Process in chunks of maxConcurrency
  for (let i = 0; i < targets.length; i += maxConcurrency) {
    const chunk = targets.slice(i, i + maxConcurrency);
    const chunkPromises = chunk.map((devId) => executeDeviceInput(devId, req.action));

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);

    // Broadcast progress
    const progressPercent = Math.round((results.length / targets.length) * 100);
    broadcastMessage({
      type: 'SYNC_PROGRESS',
      opId,
      progress: progressPercent,
      currentDevice: chunk[chunk.length - 1],
    });
  }

  const successCount = results.filter((r) => r.status === 'success').length;
  const failureCount = results.length - successCount;
  const avgLatency = Math.round(results.reduce((acc, curr) => acc + curr.latencyMs, 0) / (results.length || 1));

  const response: SyncExecutionResponse = {
    opId,
    timestamp: startTime,
    action: req.action,
    totalTargets: targets.length,
    successCount,
    failureCount,
    avgLatencyMs: avgLatency,
    results,
  };

  addLog(
    failureCount > 0 ? 'warn' : 'info',
    'sync',
    `Sync Operation [${opId}] completed in ${Date.now() - startTime}ms (${successCount}/${targets.length} successful, avg latency: ${avgLatency}ms)`,
    undefined,
    response,
  );

  broadcastDevices();
  broadcastMessage({ type: 'SYNC_FINISHED', response });

  return response;
}

// --- EXPRESS APP & ROUTER ---
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true, parameterLimit: 100 }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (
    !AUTH_ENABLED ||
    req.path === '/health' ||
    req.path === '/auth/login' ||
    req.path === '/auth/session'
  ) {
    return next();
  }

  if (getActiveSession(req.headers.cookie)) return next();
  return res.status(401).json({ error: 'Authentication required' });
});

// REST: Health Check
app.get('/api/health', (req, res) => {
  const audit = auditHostEnvironment();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    devicesOnline: Array.from(devicesMap.values()).filter((d) => d.info.status === 'online').length,
    totalDevices: devicesMap.size,
    kvmSupported: audit.kvmSupported,
    executionEngine: audit.executionEngine,
    authEnabled: AUTH_ENABLED,
    androidRuntime: androidRuntime.enabled ? 'android-emulator' : 'simulator',
    emulatorCapacity: androidRuntime.capacity,
  });
});

app.get('/api/devices/capacity', (req, res) => {
  res.json({
    enabled: androidRuntime.enabled,
    capacity: androidRuntime.capacity,
    configuredMemoryPerDeviceMb: Number(process.env.EMULATOR_MEMORY_MB || 2048),
    configuredVcpusPerDevice: Number(process.env.EMULATOR_VCPUS || 2),
    allocatedSlots: devicesMap.size,
    onlineDevices: Array.from(devicesMap.values()).filter((device) => device.info.status === 'online').length,
  });
});

app.get('/api/auth/session', (req, res) => {
  const authenticated = !AUTH_ENABLED || !!getActiveSession(req.headers.cookie);
  res.status(authenticated ? 200 : 401).json({ authenticated, authEnabled: AUTH_ENABLED });
});

app.post('/api/auth/logout', (req, res) => {
  const token = getActiveSession(req.headers.cookie);
  if (token) {
    activeSessions.delete(token);
    for (const client of wss.clients) {
      if (socketSessions.get(client) === token) client.close(4001, 'Session ended');
    }
  }
  const secure = req.secure ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`,
  );
  res.json({ success: true });
});

// REST: Environment & Hardware Audit
app.get('/api/audit-report', (req, res) => {
  const audit = auditHostEnvironment();
  res.json(audit);
});

// REST: List all devices
app.get('/api/devices', (req, res) => {
  const devices = Array.from(devicesMap.values()).map((d) => d.info);
  res.json(devices);
});

// REST: Single device info
app.get('/api/devices/:id', (req, res) => {
  const state = devicesMap.get(req.params.id);
  if (!state) {
    return res.status(404).json({ error: 'Device not found' });
  }
  res.json(state.info);
});

// REST: Start device
app.post('/api/devices/:id/start', (req, res) => {
  const state = devicesMap.get(req.params.id);
  if (!state) {
    return res.status(404).json({ error: 'Device not found' });
  }
  state.info.status = 'starting';
  if (androidRuntime.enabled) {
    const index = getDeviceIndex(state.info.id);
    if (!index || index > androidRuntime.capacity.maxDevices) {
      state.info.status = 'error';
      return res.status(409).json({
        error: androidRuntime.capacity.reason || 'This host has no available emulator capacity.',
        capacity: androidRuntime.capacity,
      });
    }
    androidRuntime.start(state.info.id, state.info.adbPort).catch((error: unknown) => {
      state.info.status = 'error';
      addLog('error', 'adb', error instanceof Error ? error.message : 'Failed to start emulator', state.info.id);
      broadcastDevices();
    });
  } else {
    state.info.thumbnailSvg = generateScreenSvg(state);
    addLog('info', 'adb', `Booting simulated emulator ${state.info.name}...`, state.info.id);
  }
  broadcastDevices();
  res.json({ success: true, device: state.info });
});

// REST: Stop device
app.post('/api/devices/:id/stop', async (req, res) => {
  const state = devicesMap.get(req.params.id);
  if (!state) {
    return res.status(404).json({ error: 'Device not found' });
  }
  if (androidRuntime.enabled) {
    try {
      await androidRuntime.stop(state.info.id, state.info.adbPort);
      state.info.status = 'offline';
      state.info.highResFrame = undefined;
    } catch (error) {
      return res.status(502).json({ error: error instanceof Error ? error.message : 'Failed to stop emulator' });
    }
  } else {
    state.info.status = 'offline';
    state.info.cpuUsage = 0;
    state.info.ramUsageMb = 0;
    state.info.thumbnailSvg = generateScreenSvg(state);
  }
  addLog('warn', 'adb', `Device ${state.info.name} powered down`, state.info.id);
  broadcastDevices();
  res.json({ success: true, device: state.info });
});

// REST: Restart device
app.post('/api/devices/:id/restart', (req, res) => {
  const state = devicesMap.get(req.params.id);
  if (!state) {
    return res.status(404).json({ error: 'Device not found' });
  }
  state.info.status = 'starting';
  if (androidRuntime.enabled) {
    androidRuntime.restart(state.info.id, state.info.adbPort).catch((error: unknown) => {
      state.info.status = 'error';
      addLog('error', 'adb', error instanceof Error ? error.message : 'Failed to restart emulator', state.info.id);
      broadcastDevices();
    });
  } else {
    state.info.thumbnailSvg = generateScreenSvg(state);
  }
  addLog('info', 'adb', `Device ${state.info.name} restarting...`, state.info.id);
  broadcastDevices();
  res.json({ success: true, device: state.info });
});

// REST: Single device input
app.post('/api/devices/:id/input', async (req, res) => {
  const validation = InputCommandSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid input command', details: validation.error.format() });
  }
  const result = await executeDeviceInput(req.params.id, validation.data as DeviceInputCommand);
  broadcastDevices();
  res.json(result);
});

// REST: Multi-device Sync Execute
app.post('/api/sync/execute', async (req, res) => {
  const validation = SyncExecutionSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid sync payload', details: validation.error.format() });
  }

  const syncResponse = await executeSyncAction(validation.data as SyncExecutionRequest);
  res.json(syncResponse);
});

// REST: Curated APK Repository
app.get('/api/apk/catalog', (req, res) => {
  if (androidRuntime.enabled) return res.json([]);
  res.json(CURATED_APK_REPOSITORY);
});

// REST: Install APK to single or multiple devices (Cluster Sync Install)
app.post('/api/apk/install', async (req, res) => {
  if (androidRuntime.enabled) {
    return res.status(409).json({
      error: 'APK catalog installation is unavailable for Play Store builds. Install TikTok and YouTube in Google Play on the device.',
    });
  }
  const validation = InstallApkSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid APK install payload', details: validation.error.format() });
  }

  const result = await installApkCluster(validation.data as InstallApkRequest);
  res.json(result);
});

// REST: Install APK to a specific device
app.post('/api/devices/:id/install', (req, res) => {
  if (androidRuntime.enabled) {
    return res.status(409).json({ error: 'Use Google Play on the virtual device to install apps.' });
  }
  const { packageName, appName, version, icon, color, sizeMb } = req.body;
  if (!packageName || !appName) {
    return res.status(400).json({ error: 'packageName and appName are required' });
  }
  const result = installApkToDevice(req.params.id, { packageName, appName, version, icon, color, sizeMb });
  if (!result.success) {
    return res.status(400).json(result);
  }
  broadcastDevices();
  res.json(result);
});

// REST: Uninstall package from device (pm uninstall)
app.post('/api/devices/:id/uninstall', async (req, res) => {
  const { packageName } = req.body;
  if (typeof packageName !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName)) {
    return res.status(400).json({ error: 'packageName required' });
  }
  if (androidRuntime.enabled) {
    const state = devicesMap.get(req.params.id);
    if (!state) return res.status(404).json({ error: 'Device not found' });
    try {
      await androidRuntime.uninstallPackage(state.info.id, state.info.adbPort, packageName);
      state.info.installedPackages = state.info.installedPackages.filter((pkg) => pkg.packageName !== packageName);
      addLog('info', 'adb', `Uninstalled ${packageName}`, state.info.id);
      broadcastDevices();
      return res.json({ success: true });
    } catch (error) {
      return res.status(502).json({ error: error instanceof Error ? error.message : 'Package uninstall failed' });
    }
  }
  const result = uninstallPackageFromDevice(req.params.id, packageName);
  if (!result.success) {
    return res.status(400).json(result);
  }
  broadcastDevices();
  res.json(result);
});

app.post('/api/devices/:id/play-store/:packageName', async (req, res) => {
  if (!androidRuntime.enabled) {
    return res.status(409).json({ error: 'Google Play installation is available only in Android emulator mode.' });
  }
  const state = devicesMap.get(req.params.id);
  if (!state) return res.status(404).json({ error: 'Device not found' });
  if (state.info.status !== 'online') return res.status(409).json({ error: 'Device is not online' });
  try {
    await androidRuntime.openPlayStoreListing(state.info.id, state.info.adbPort, req.params.packageName);
    res.json({ success: true, message: 'Google Play opened. Complete the installation on the device screen.' });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to open Google Play' });
  }
});

// REST: Connect remote physical device or Redroid container via ADB TCP socket
app.post('/api/adb/connect', (req, res) => {
  if (androidRuntime.enabled) {
    return res.status(409).json({ error: 'Remote ADB connections are disabled in managed emulator mode.' });
  }
  const { host, port } = req.body;
  if (!host || !port) {
    return res.status(400).json({ error: 'Host and port are required (e.g. 192.168.1.100:5555)' });
  }

  const nextIdx = devicesMap.size + 1;
  const newId = `pixel-${String(nextIdx).padStart(2, '0')}`;
  const newName = `Pixel 7 Pro (ADB #${nextIdx})`;
  const newInfo: DeviceInfo = {
    id: newId,
    name: newName,
    model: 'Google Pixel 7 Pro (Remote ADB)',
    codename: 'cheetah',
    buildFingerprint: 'google/cheetah/cheetah:14/UQ1A.240205.004/11269623:user/release-keys',
    status: 'online',
    ip: String(host),
    adbPort: Number(port),
    resolution: { width: 720, height: 1560 },
    orientation: 'portrait',
    batteryLevel: 98,
    isCharging: true,
    cpuUsage: 12,
    ramUsageMb: 512,
    totalRamMb: 1536,
    currentApp: 'com.android.launcher',
    currentAppName: 'Pixel Launcher',
    installedPackages: [...DEFAULT_PACKAGES],
    uptimeSeconds: 60,
    lastPing: Date.now(),
    activeColor: '#10B981',
    inputQueueLength: 0,
    serialNumber: `${host}:${port}`,
    androidVersion: '14.0 (Remote ADB Bridge)',
    apiLevel: 34,
  };

  const newState: DeviceInternalState = {
    info: newInfo,
    appHistory: ['com.android.launcher'],
    calcExpression: '',
    calcResult: '',
    terminalHistory: [],
    browserUrl: 'https://google.com',
    recentTouches: [],
    isLocked: false,
  };

  newState.info.thumbnailSvg = generateScreenSvg(newState);
  devicesMap.set(newId, newState);

  addLog('info', 'adb', `adb connect ${host}:${port} -> Connected to ${newName} (Port ${port})`);
  broadcastDevices();
  broadcastStats();

  res.json({ success: true, device: newInfo });
});

// REST: System Stats
app.get('/api/system/stats', (req, res) => {
  res.json(getSystemStats());
});

// REST: Logs
app.get('/api/logs', (req, res) => {
  const deviceId = req.query.deviceId as string | undefined;
  const level = req.query.level as string | undefined;
  let filtered = auditLogs;
  if (deviceId) {
    filtered = filtered.filter((l) => l.deviceId === deviceId);
  }
  if (level) {
    filtered = filtered.filter((l) => l.level === level);
  }
  res.json(filtered.slice(0, 100));
});

app.post('/api/logs/clear', (req, res) => {
  auditLogs.length = 0;
  addLog('info', 'system', 'Audit log history cleared by operator');
  res.json({ success: true });
});

// REST: Ngrok Configuration & Status
app.get('/api/ngrok/config', (req, res) => {
  res.json(ngrokConfig);
});

app.post('/api/ngrok/config', (req, res) => {
  const validation = NgrokConfigSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid ngrok configuration' });
  }
  return res.status(409).json({
    error: 'Ngrok settings are deployment-managed. Update NGROK_AUTH_TOKEN in .env and restart the remote profile.',
  });
});

// REST: Dashboard Authentication
app.post('/api/auth/login', (req, res) => {
  const validation = LoginSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'A valid password is required' });
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  for (const [address, attempt] of loginAttempts) {
    if (attempt.resetAt <= now) loginAttempts.delete(address);
  }
  const attempts = loginAttempts.get(ip);
  if (attempts && attempts.count >= LOGIN_ATTEMPT_LIMIT) {
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }

  const submittedHash = createHash('sha256')
    .update(validation.data.password)
    .digest();
  const configuredHash = createHash('sha256').update(DASHBOARD_PASSWORD).digest();
  const passwordMatches = timingSafeEqual(submittedHash, configuredHash);
  if (passwordMatches) {
    loginAttempts.delete(ip);
    pruneExpiredSessions(now);
    if (activeSessions.size >= 10_000) {
      return res.status(503).json({ error: 'Session capacity reached. Try again later.' });
    }
    const token = createSessionToken(SESSION_SECRET);
    activeSessions.set(token, Number(token.slice(0, token.indexOf('.'))) * 1000);
    const secure = req.secure ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`,
    );
    addLog('info', 'security', 'Dashboard session authenticated successfully');
    res.json({ success: true });
  } else {
    loginAttempts.set(ip, {
      count: (attempts?.count || 0) + 1,
      resetAt: attempts?.resetAt || now + LOGIN_WINDOW_MS,
    });
    addLog('warn', 'security', 'Failed login attempt with invalid password');
    res.status(401).json({ error: 'Invalid password' });
  }
});

// --- HTTP SERVER & WEBSOCKET SETUP ---
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const socketSubscriptions = new Map<WebSocket, Set<string>>();

function shutdown(signal: string) {
  console.log(`[Phone Farm 10] Received ${signal}; shutting down`);
  clearInterval(metricsTicker);
  clearInterval(screenFrameTicker);

  const forceClose = setTimeout(() => {
    for (const client of wss.clients) client.terminate();
  }, 10_000);
  forceClose.unref();

  for (const client of wss.clients) client.close(1001, 'Server shutting down');
  void androidRuntime.shutdown()
    .catch((error: unknown) => {
      console.error('[Phone Farm 10] Failed to stop Android emulators cleanly:', error);
      process.exitCode = 1;
    })
    .finally(() => {
      server.close((error) => {
        clearTimeout(forceClose);
        if (error) {
          console.error('[Phone Farm 10] Graceful shutdown failed:', error);
          process.exitCode = 1;
        }
        wss.close();
      });
    });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

server.on('upgrade', (req, socket, head) => {
  if (req.url?.split('?')[0] !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
    } catch {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
  }

  const sessionToken = AUTH_ENABLED ? getActiveSession(req.headers.cookie) : undefined;
  if (AUTH_ENABLED && !sessionToken) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    if (sessionToken) socketSessions.set(ws, sessionToken);
    wss.emit('connection', ws, req);
  });
});

function broadcastMessage(msg: WebSocketServerMessage) {
  const json = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

function broadcastDevices() {
  const devices = Array.from(devicesMap.values()).map((d) => d.info);
  broadcastMessage({ type: 'ALL_DEVICES', devices });
}

function broadcastStats() {
  broadcastMessage({ type: 'STATS_TICK', stats: getSystemStats() });
}

wss.on('connection', (ws) => {
  socketSubscriptions.set(ws, new Set());
  ws.once('close', () => socketSubscriptions.delete(ws));
  const sessionToken = socketSessions.get(ws);
  const expiresAt = sessionToken ? activeSessions.get(sessionToken) : undefined;
  const expiryTimeout = expiresAt
    ? setTimeout(() => ws.close(4001, 'Session expired'), Math.max(0, expiresAt - Date.now()))
    : undefined;
  expiryTimeout?.unref();
  ws.on('close', () => {
    if (expiryTimeout) clearTimeout(expiryTimeout);
  });

  // Send initial snapshot
  const devices = Array.from(devicesMap.values()).map((d) => d.info);
  const initMsg: WebSocketServerMessage = {
    type: 'INIT_STATE',
    devices,
    stats: getSystemStats(),
    ngrok: ngrokConfig,
  };
  ws.send(JSON.stringify(initMsg));

  ws.on('message', (data) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      ws.close(1008, 'Invalid message');
      return;
    }

    const validation = WebSocketClientMessageSchema.safeParse(parsed);
    if (!validation.success) {
      ws.close(1008, 'Invalid message');
      return;
    }

    const msg = validation.data;
    if (msg.type === 'SUBSCRIBE_DEVICE') {
      if (devicesMap.has(msg.deviceId)) socketSubscriptions.get(ws)?.add(msg.deviceId);
    } else if (msg.type === 'UNSUBSCRIBE_DEVICE') {
      socketSubscriptions.get(ws)?.delete(msg.deviceId);
    } else if (msg.type === 'DIRECT_INPUT') {
      void executeDeviceInput(msg.deviceId, msg.command).then(() => {
        broadcastDevices();
      });
    } else if (msg.type === 'HEARTBEAT') {
      ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK', timestamp: Date.now() }));
    }
  });
});

const screenFrameTicker = setInterval(() => {
  if (!androidRuntime.enabled) return;
  const subscribedIds = new Set<string>();
  for (const subscriptions of socketSubscriptions.values()) {
    for (const id of subscriptions) subscribedIds.add(id);
  }

  for (const id of subscribedIds) {
    const state = devicesMap.get(id);
    if (!state || state.info.status !== 'online') continue;
    void androidRuntime.captureScreenshot(id, state.info.adbPort).then((frame) => {
      const message = JSON.stringify({
        type: 'SCREEN_FRAME',
        deviceId: id,
        frameBase64: frame.toString('base64'),
      });
      for (const [client, subscriptions] of socketSubscriptions) {
        if (subscriptions.has(id) && client.readyState === WebSocket.OPEN) client.send(message);
      }
    }).catch((error: unknown) => {
      addLog('warn', 'adb', error instanceof Error ? `Screen capture failed: ${error.message}` : 'Screen capture failed', id);
    });
  }
}, 1000);

// --- VITE MIDDLEWARE / STATIC SERVING ---
async function startServer() {
  if (!Number.isInteger(APP_PORT) || APP_PORT < 1 || APP_PORT > 65535) {
    throw new Error('APP_PORT must be an integer between 1 and 65535');
  }
  if (process.env.NODE_ENV === 'production' && !AUTH_ENABLED) {
    throw new Error('AUTH_ENABLED must be true in production');
  }
  if (AUTH_ENABLED && SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters when authentication is enabled');
  }
  if (AUTH_ENABLED && DASHBOARD_PASSWORD.length < 12) {
    throw new Error('DASHBOARD_PASSWORD must contain at least 12 characters when authentication is enabled');
  }
  if (process.env.NODE_ENV === 'production' && !androidRuntime.enabled) {
    throw new Error('ANDROID_EMULATOR_ENABLED must be true in production; the in-memory simulator is for development only');
  }
  if (androidRuntime.enabled && androidRuntime.capacity.maxDevices === 0) {
    console.warn(`[Phone Farm 10] Emulator capacity is zero: ${androidRuntime.capacity.reason}`);
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  server.listen(APP_PORT, '0.0.0.0', () => {
    console.log(`[Phone Farm 10] Server running on http://0.0.0.0:${APP_PORT}`);
    console.log(`[Phone Farm 10] WebSocket available at ws://0.0.0.0:${APP_PORT}/ws`);
    addLog('info', 'system', `Phone Farm 10 Control Center initialized on port ${APP_PORT}`);
    if (androidRuntime.enabled && androidRuntime.capacity.maxDevices > 0) {
      void androidRuntime.start('pixel-01', getEmulatorPort(1)).catch((error: unknown) => {
        const state = devicesMap.get('pixel-01');
        if (state) state.info.status = 'error';
        addLog('error', 'adb', error instanceof Error ? error.message : 'Failed to start initial Android emulator', 'pixel-01');
        broadcastDevices();
      });
    }
  });
}

startServer().catch((err) => {
  console.error('[Phone Farm 10] Fatal startup error:', err);
  process.exit(1);
});
