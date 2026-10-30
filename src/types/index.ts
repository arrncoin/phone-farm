export type DeviceStatus = 'online' | 'starting' | 'offline' | 'error';
export type DeviceOrientation = 'portrait' | 'landscape';

export interface DeviceResolution {
  width: number;
  height: number;
}

export interface AppInfo {
  id: string;
  name: string;
  packageName: string;
  icon: string;
  color: string;
}

export interface InstalledPackage {
  packageName: string;
  name: string;
  version: string;
  icon: string;
  color: string;
  installDate: string;
  sizeMb: number;
  isSystem: boolean;
  category: string;
}

export interface DeviceInfo {
  id: string; // e.g. 'pixel-01'
  name: string; // e.g. 'Pixel 7 Pro #01'
  model: string; // 'Google Pixel 7 Pro'
  codename: string; // 'cheetah'
  buildFingerprint: string;
  status: DeviceStatus;
  ip: string;
  adbPort: number;
  resolution: DeviceResolution;
  orientation: DeviceOrientation;
  batteryLevel: number;
  isCharging: boolean;
  cpuUsage: number;
  ramUsageMb: number;
  totalRamMb: number;
  currentApp: string;
  currentAppName: string;
  installedPackages: InstalledPackage[];
  uptimeSeconds: number;
  lastPing: number;
  activeColor: string;
  inputQueueLength: number;
  serialNumber: string;
  androidVersion: string;
  apiLevel: number;
  thumbnailSvg?: string;
  highResFrame?: string;
}

export interface InstallApkRequest {
  targetDeviceIds: string[];
  packageName: string;
  appName: string;
  version?: string;
  icon?: string;
  color?: string;
  apkBase64?: string;
  sizeMb?: number;
}

export interface InstallApkResponse {
  opId: string;
  timestamp: number;
  appName: string;
  packageName: string;
  totalTargets: number;
  successCount: number;
  failureCount: number;
  results: {
    deviceId: string;
    deviceName: string;
    status: 'success' | 'failed' | 'offline';
    latencyMs: number;
    error?: string;
  }[];
}

export type InputCommandType =
  | 'tap'
  | 'swipe'
  | 'key'
  | 'text'
  | 'launch'
  | 'rotate'
  | 'screenshot'
  | 'reboot';

export interface DeviceInputCommand {
  type: InputCommandType;
  x?: number; // normalized 0..1
  y?: number; // normalized 0..1
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  durationMs?: number;
  keycode?: 'BACK' | 'HOME' | 'RECENTS' | 'POWER' | 'VOLUME_UP' | 'VOLUME_DOWN' | string;
  text?: string;
  packageName?: string;
  orientation?: DeviceOrientation;
}

export interface DeviceExecutionResult {
  deviceId: string;
  deviceName: string;
  status: 'success' | 'failed' | 'timeout' | 'offline';
  latencyMs: number;
  error?: string;
}

export interface SyncExecutionRequest {
  targetDeviceIds: string[];
  action: DeviceInputCommand;
  batchLabel?: string;
  maxConcurrency?: number;
}

export interface SyncExecutionResponse {
  opId: string;
  timestamp: number;
  action: DeviceInputCommand;
  totalTargets: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  results: DeviceExecutionResult[];
}

export interface SystemStats {
  cpuPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  onlineCount: number;
  totalCount: number;
  activeStreams: number;
  totalOpsExecuted: number;
  averageLatencyMs: number;
  uptime: number;
  networkRxKb: number;
  networkTxKb: number;
}

export interface ResourceProfile {
  id: 'lightweight' | 'balanced' | 'high';
  name: string;
  resolution: string;
  vCpuPerDevice: number;
  ramPerDeviceMb: number;
  fpsLimit: number;
  streamQuality: 'low' | 'medium' | 'high';
  estimatedRamTotalMb: number;
  compatibleWithCurrentHost: boolean;
  notes: string;
}

export interface EnvironmentAuditReport {
  timestamp: string;
  hostOs: string;
  kernel: string;
  arch: string;
  kvmSupported: boolean;
  kvmPathFound: boolean;
  cpuCores: number;
  totalRamMb: number;
  freeRamMb: number;
  isGvisor: boolean;
  androidRuntimeEnabled: boolean;
  executionEngine: 'virtual_container_fallback' | 'kvm_accelerated_qemu';
  dockerAvailable: boolean;
  adbAvailable: boolean;
  feasibility10Devices: {
    status: 'supported' | 'warning' | 'constrained';
    summary: string;
    ramHeadroomMb: number;
  };
  recommendations: string[];
  profiles: ResourceProfile[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  deviceId?: string;
  source: 'adb' | 'sync' | 'system' | 'ngrok' | 'security';
  message: string;
  data?: any;
}

export interface NgrokConfig {
  enabled: boolean;
  hasToken: boolean;
  maskedToken: string;
  status: 'online' | 'offline' | 'error' | 'not_configured';
  publicUrl?: string;
  region: string;
  protocol: string;
  error?: string;
  activeTunnelsCount: number;
}

export type WebSocketServerMessage =
  | { type: 'INIT_STATE'; devices: DeviceInfo[]; stats: SystemStats; ngrok: NgrokConfig }
  | { type: 'DEVICE_UPDATED'; device: DeviceInfo }
  | { type: 'ALL_DEVICES'; devices: DeviceInfo[] }
  | { type: 'STATS_TICK'; stats: SystemStats }
  | { type: 'LOG_ENTRY'; log: AuditLogEntry }
  | { type: 'SYNC_PROGRESS'; opId: string; progress: number; currentDevice: string }
  | { type: 'SYNC_FINISHED'; response: SyncExecutionResponse }
  | { type: 'AUTH_EXPIRED' }
  | { type: 'SCREEN_FRAME'; deviceId: string; frameSvg: string; frameBase64?: string };

export type WebSocketClientMessage =
  | { type: 'SUBSCRIBE_DEVICE'; deviceId: string }
  | { type: 'UNSUBSCRIBE_DEVICE'; deviceId: string }
  | { type: 'DIRECT_INPUT'; deviceId: string; command: DeviceInputCommand }
  | { type: 'HEARTBEAT'; timestamp: number };
