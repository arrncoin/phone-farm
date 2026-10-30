import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { DeviceInputCommand } from '../types/index.ts';
import { calculateEmulatorCapacity, type EmulatorCapacity } from './capacity.ts';

const execFileAsync = promisify(execFile);
const SYSTEM_IMAGE = process.env.ANDROID_SYSTEM_IMAGE || 'system-images;android-35;google_apis_playstore;x86_64';
const AVD_NAME_PREFIX = 'Farmdroid_Pixel7Pro';

export interface AndroidRuntimeConfig {
  sdkRoot: string;
  dataDirectory: string;
  maxDevices: number;
  memoryPerDeviceMb: number;
  vcpusPerDevice: number;
  gpuMode: 'auto' | 'host' | 'swiftshader';
}

export interface RuntimeDevice {
  id: string;
  name: string;
  port: number;
  status: 'starting' | 'online' | 'offline' | 'error';
  error?: string;
}

export interface RuntimeDeviceMetadata {
  androidVersion: string;
  apiLevel: number;
  buildFingerprint: string;
  resolution: { width: number; height: number };
  orientation: 'portrait' | 'landscape';
  batteryLevel: number;
  currentApp: string;
  installedPackages: string[];
  systemPackages: string[];
  cpuUsage: number;
  ramUsageMb: number;
  totalRamMb: number;
}

function readCgroupNumber(filePath: string): number | undefined {
  try {
    const value = fs.readFileSync(filePath, 'utf8').trim();
    if (value === 'max') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function getCpuLimit(): number {
  const cpuset = (() => {
    try {
      return fs.readFileSync('/sys/fs/cgroup/cpuset.cpus.effective', 'utf8').trim();
    } catch {
      return '';
    }
  })();
  const cpusetCount = cpuset
    ? cpuset.split(',').reduce((count, range) => {
        const [start, end = start] = range.split('-').map(Number);
        return count + Math.max(0, end - start + 1);
      }, 0)
    : undefined;

  let quotaCount: number | undefined;
  try {
    const [quotaText, periodText] = fs.readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim().split(/\s+/);
    const quota = Number(quotaText);
    const period = Number(periodText);
    if (quotaText !== 'max' && quota > 0 && period > 0) quotaCount = quota / period;
  } catch {
    try {
      const quota = readCgroupNumber('/sys/fs/cgroup/cpu/cpu.cfs_quota_us');
      const period = readCgroupNumber('/sys/fs/cgroup/cpu/cpu.cfs_period_us');
      if (quota && period) quotaCount = quota / period;
    } catch {
      quotaCount = undefined;
    }
  }

  return Math.max(
    0,
    Math.floor(Math.min(os.cpus().length, cpusetCount ?? Infinity, quotaCount ?? Infinity)),
  );
}

export function detectEmulatorCapacity(config: Pick<AndroidRuntimeConfig, 'maxDevices' | 'memoryPerDeviceMb' | 'vcpusPerDevice'>): EmulatorCapacity {
  const cgroupMemoryLimit = readCgroupNumber('/sys/fs/cgroup/memory.max')
    ?? readCgroupNumber('/sys/fs/cgroup/memory/memory.limit_in_bytes');
  const totalMemoryMb = Math.floor(Math.min(os.totalmem(), cgroupMemoryLimit ?? Infinity) / 1024 / 1024);
  let kvmAvailable = false;
  if (process.platform === 'linux' && fs.existsSync('/dev/kvm')) {
    try {
      fs.accessSync('/dev/kvm', fs.constants.R_OK | fs.constants.W_OK);
      kvmAvailable = true;
    } catch {
      kvmAvailable = false;
    }
  }
  return calculateEmulatorCapacity({
    totalMemoryMb,
    cpuCores: getCpuLimit(),
    kvmAvailable,
    maxDevices: config.maxDevices,
    memoryPerDeviceMb: config.memoryPerDeviceMb,
    vcpusPerDevice: config.vcpusPerDevice,
  });
}

function configuredInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function loadConfig(): AndroidRuntimeConfig {
  const gpuMode = process.env.EMULATOR_GPU_MODE || 'swiftshader';
  if (gpuMode !== 'auto' && gpuMode !== 'host' && gpuMode !== 'swiftshader') {
    throw new Error('EMULATOR_GPU_MODE must be auto, host, or swiftshader');
  }
  return {
    sdkRoot: process.env.ANDROID_SDK_ROOT || '/opt/android-sdk',
    dataDirectory: process.env.ANDROID_DATA_DIR || '/data/android-devices',
    maxDevices: configuredInteger('MAX_DEVICES', 10, 1, 10),
    memoryPerDeviceMb: configuredInteger('EMULATOR_MEMORY_MB', 2048, 1024, 8192),
    vcpusPerDevice: configuredInteger('EMULATOR_VCPUS', 2, 1, 8),
    gpuMode,
  };
}

export class AndroidRuntimeManager {
  public readonly enabled = process.env.ANDROID_EMULATOR_ENABLED === 'true';
  public readonly capacity: EmulatorCapacity;
  private readonly config = loadConfig();
  private readonly processes = new Map<string, ChildProcess>();
  private readonly pendingStarts = new Map<string, Promise<void>>();
  private readonly framesInProgress = new Set<string>();
  private readonly orientations = new Map<string, 'portrait' | 'landscape'>();
  private readonly onStatusChange: (device: RuntimeDevice) => void;

  constructor(onStatusChange: (device: RuntimeDevice) => void = () => {}) {
    this.onStatusChange = onStatusChange;
    this.capacity = detectEmulatorCapacity(this.config);
  }

  private get sdkManager(): string {
    return path.join(this.config.sdkRoot, 'cmdline-tools', 'latest', 'bin', 'avdmanager');
  }

  private get emulatorBinary(): string {
    return path.join(this.config.sdkRoot, 'emulator', 'emulator');
  }

  private get adbBinary(): string {
    return path.join(this.config.sdkRoot, 'platform-tools', 'adb');
  }

  private getDeviceDirectory(id: string): string {
    if (!/^pixel-\d{2}$/.test(id)) throw new Error('Invalid emulator ID');
    return path.join(this.config.dataDirectory, id);
  }

  private getAvdName(id: string): string {
    return `${AVD_NAME_PREFIX}_${id.slice(-2)}`;
  }

  private getEnvironment(id: string): NodeJS.ProcessEnv {
    const deviceDirectory = this.getDeviceDirectory(id);
    return {
      ...process.env,
      ANDROID_HOME: this.config.sdkRoot,
      ANDROID_SDK_ROOT: this.config.sdkRoot,
      ANDROID_AVD_HOME: path.join(deviceDirectory, 'avd'),
      ANDROID_USER_HOME: path.join(deviceDirectory, '.android'),
      HOME: deviceDirectory,
    };
  }

  private async run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; timeout?: number } = {}) {
    return execFileAsync(command, args, {
      env: options.env ?? process.env,
      timeout: options.timeout ?? 15_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
  }

  private async getDisplaySize(port: number, id: string): Promise<{ width: number; height: number }> {
    const { stdout } = await this.run(this.adbBinary, ['-s', `emulator-${port}`, 'shell', 'wm', 'size']);
    const match = stdout.match(/Physical size:\s*(\d+)x(\d+)/);
    const physicalWidth = Number(match?.[1] || 720);
    const physicalHeight = Number(match?.[2] || 1560);
    return this.orientations.get(id) === 'landscape'
      ? { width: physicalHeight, height: physicalWidth }
      : { width: physicalWidth, height: physicalHeight };
  }

  private async runBinary(command: string, args: string[], timeout = 10_000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
      child.stdout.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > 16 * 1024 * 1024) {
          child.kill('SIGKILL');
          return;
        }
        chunks.push(chunk);
      });
      child.stderr.resume();
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(`Android screenshot command exited with code ${code}`));
        resolve(Buffer.concat(chunks));
      });
    });
  }

  private async provision(id: string, port: number): Promise<void> {
    const env = this.getEnvironment(id);
    const avdHome = env.ANDROID_AVD_HOME!;
    const avdName = this.getAvdName(id);
    const avdDirectory = path.join(avdHome, `${avdName}.avd`);
    const configPath = path.join(avdDirectory, 'config.ini');

    fs.mkdirSync(avdHome, { recursive: true });
    fs.mkdirSync(env.ANDROID_USER_HOME!, { recursive: true });
    if (!fs.existsSync(configPath)) {
      await this.run(this.sdkManager, [
        'create', 'avd', '--force', '--name', avdName, '--package', SYSTEM_IMAGE, '--path', avdDirectory,
      ], { env, timeout: 120_000 });
    }

    const settings = [
      'hw.device.name=Pixel 7 Pro',
      'hw.device.manufacturer=Google',
      'hw.lcd.width=720',
      'hw.lcd.height=1560',
      'hw.lcd.density=280',
      `hw.ramSize=${this.config.memoryPerDeviceMb}`,
      `hw.cpu.ncore=${this.config.vcpusPerDevice}`,
      'hw.keyboard=yes',
      'hw.gpu.enabled=yes',
      'showDeviceFrame=no',
      'fastboot.forceColdBoot=yes',
    ].join('\n');
    const existing = fs.readFileSync(configPath, 'utf8');
    const updated = existing
      .split(/\r?\n/)
      .filter((line) => !/^(hw\.device\.name|hw\.device\.manufacturer|hw\.lcd\.width|hw\.lcd\.height|hw\.lcd\.density|hw\.ramSize|hw\.cpu\.ncore|hw\.keyboard|hw\.gpu\.enabled|showDeviceFrame|fastboot\.forceColdBoot)=/.test(line))
      .filter(Boolean);
    fs.writeFileSync(configPath, `${updated.join('\n')}\n${settings}\n`, { mode: 0o600 });

    this.onStatusChange({ id, name: `Pixel 7 Pro (virtual) ${id.slice(-2)}`, port, status: 'starting' });
    const child = spawn(this.emulatorBinary, [
      '-avd', avdName,
      '-port', String(port),
      '-no-window',
      '-no-audio',
      '-no-boot-anim',
      '-no-snapshot',
      '-no-metrics',
      '-gpu', this.config.gpuMode,
      '-memory', String(this.config.memoryPerDeviceMb),
      '-cores', String(this.config.vcpusPerDevice),
    ], { env, stdio: 'ignore' });
    this.processes.set(id, child);

    child.once('error', (error) => {
      this.processes.delete(id);
      this.onStatusChange({
        id,
        name: `Pixel 7 Pro (virtual) ${id.slice(-2)}`,
        port,
        status: 'error',
        error: `Unable to launch emulator: ${error.message}`,
      });
    });
    child.once('exit', (code, signal) => {
      if (this.processes.get(id) !== child) return;
      this.processes.delete(id);
      this.onStatusChange({
        id,
        name: `Pixel 7 Pro (virtual) ${id.slice(-2)}`,
        port,
        status: code === 0 || signal ? 'offline' : 'error',
        error: code && !signal ? `Emulator exited with code ${code}` : undefined,
      });
    });
    void this.waitUntilBooted(id, port, child);
  }

  private async waitUntilBooted(id: string, port: number, child: ChildProcess): Promise<void> {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline && this.processes.get(id) === child) {
      try {
        const { stdout } = await this.run(this.adbBinary, [
          '-s', `emulator-${port}`, 'shell', 'getprop', 'sys.boot_completed',
        ], { timeout: 5000 });
        if (stdout.trim() === '1') {
          await this.run(this.adbBinary, [
            '-s', `emulator-${port}`, 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0',
          ], { timeout: 5000 });
          await this.run(this.adbBinary, [
            '-s', `emulator-${port}`, 'shell', 'settings', 'put', 'system', 'user_rotation', '0',
          ], { timeout: 5000 });
          this.orientations.set(id, 'portrait');
          this.onStatusChange({ id, name: `Pixel 7 Pro (virtual) ${id.slice(-2)}`, port, status: 'online' });
          return;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    if (this.processes.get(id) === child) {
      this.onStatusChange({
        id,
        name: `Pixel 7 Pro (virtual) ${id.slice(-2)}`,
        port,
        status: 'error',
        error: 'Android did not finish booting within 180 seconds.',
      });
      child.kill('SIGTERM');
    }
  }

  public async start(id: string, port: number): Promise<void> {
    if (!this.enabled) throw new Error('Android emulator runtime is disabled');
    if (this.capacity.maxDevices === 0) throw new Error(this.capacity.reason || 'Host cannot run an Android emulator');
    if (this.processes.has(id)) return;
    const existing = this.pendingStarts.get(id);
    if (existing) return existing;

    const pending = this.provision(id, port).finally(() => this.pendingStarts.delete(id));
    this.pendingStarts.set(id, pending);
    return pending;
  }

  public async stop(id: string, port: number): Promise<void> {
    const child = this.processes.get(id);
    if (!child) return;
    try {
      await this.run(this.adbBinary, ['-s', `emulator-${port}`, 'emu', 'kill'], { timeout: 10_000 });
    } catch {
      child.kill('SIGTERM');
    }
    await Promise.race([
      new Promise<void>((resolve) => child.once('exit', () => resolve())),
      new Promise<void>((resolve) => setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 10_000)),
    ]);
  }

  public async restart(id: string, port: number): Promise<void> {
    await this.stop(id, port);
    await this.start(id, port);
  }

  public async shutdown(): Promise<void> {
    const active = Array.from(this.processes.entries());
    await Promise.all(active.map(([id]) => this.stop(id, 5554 + (Number(id.slice(-2)) - 1) * 2)));
  }

  public async input(id: string, port: number, command: DeviceInputCommand): Promise<void> {
    const serial = `emulator-${port}`;
    const runAdb = (args: string[]) => this.run(this.adbBinary, ['-s', serial, ...args]);
    switch (command.type) {
      case 'tap': {
        const { width, height } = await this.getDisplaySize(port, id);
        await runAdb(['shell', 'input', 'tap',
          String(Math.round((command.x ?? 0.5) * width)),
          String(Math.round((command.y ?? 0.5) * height))]);
        break;
      }
      case 'swipe': {
        const { width, height } = await this.getDisplaySize(port, id);
        await runAdb(['shell', 'input', 'swipe',
          String(Math.round((command.startX ?? 0.5) * width)),
          String(Math.round((command.startY ?? 0.7) * height)),
          String(Math.round((command.endX ?? 0.5) * width)),
          String(Math.round((command.endY ?? 0.3) * height)),
          String(command.durationMs ?? 300)]);
        break;
      }
      case 'key': {
        const allowed = new Set(['BACK', 'HOME', 'RECENTS', 'POWER', 'VOLUME_UP', 'VOLUME_DOWN']);
        const key = command.keycode || 'HOME';
        if (!allowed.has(key)) throw new Error('Unsupported key code');
        if (key === 'HOME') {
          await runAdb(['shell', 'am', 'start', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.HOME']);
        } else {
          await runAdb(['shell', 'input', 'keyevent', `KEYCODE_${key}`]);
        }
        break;
      }
      case 'text': {
        const text = (command.text || '').replace(/[^a-zA-Z0-9 ._/:@-]/g, '').replace(/ /g, '%s');
        await runAdb(['shell', 'input', 'text', text]);
        break;
      }
      case 'launch': {
        const packageName = command.packageName || 'com.google.android.youtube';
        if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName)) {
          throw new Error('Invalid Android package name');
        }
        if (packageName === 'com.android.launcher') {
          await runAdb(['shell', 'am', 'start', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.HOME']);
        } else {
          await runAdb(['shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
        }
        break;
      }
      case 'rotate':
        {
          const current = this.orientations.get(id) || 'portrait';
          const orientation = command.orientation || (current === 'portrait' ? 'landscape' : 'portrait');
          await runAdb(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
          await runAdb(['shell', 'settings', 'put', 'system', 'user_rotation', orientation === 'landscape' ? '1' : '0']);
          this.orientations.set(id, orientation);
        }
        break;
      case 'screenshot':
        await this.captureScreenshot(id, port);
        break;
      case 'reboot':
        await runAdb(['reboot']);
        break;
    }
  }

  public async installApk(id: string, port: number, filePath: string): Promise<void> {
    await this.run(this.adbBinary, ['-s', `emulator-${port}`, 'install', '-r', filePath], { timeout: 120_000 });
  }

  public async uninstallPackage(id: string, port: number, packageName: string): Promise<void> {
    if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName)) {
      throw new Error('Invalid Android package name');
    }
    await this.run(this.adbBinary, ['-s', `emulator-${port}`, 'uninstall', packageName], { timeout: 30_000 });
  }

  public async openPlayStoreListing(id: string, port: number, packageName: string): Promise<void> {
    const supportedPackages = new Set(['com.google.android.youtube', 'com.zhiliaoapp.musically']);
    if (!supportedPackages.has(packageName)) throw new Error('Only TikTok and YouTube Play Store listings are enabled');
    await this.run(this.adbBinary, [
      '-s', `emulator-${port}`, 'shell', 'am', 'start',
      '-a', 'android.intent.action.VIEW',
      '-d', `market://details?id=${packageName}`,
    ]);
  }

  public async getMetadata(id: string, port: number): Promise<RuntimeDeviceMetadata> {
    const serial = `emulator-${port}`;
    const [release, api, fingerprint, size, battery, foreground, packages, systemPackages, memory, cpu] = await Promise.all([
      this.run(this.adbBinary, ['-s', serial, 'shell', 'getprop', 'ro.build.version.release']),
      this.run(this.adbBinary, ['-s', serial, 'shell', 'getprop', 'ro.build.version.sdk']),
      this.run(this.adbBinary, ['-s', serial, 'shell', 'getprop', 'ro.build.fingerprint']),
      this.run(this.adbBinary, ['-s', serial, 'shell', 'wm', 'size']),
      this.run(this.adbBinary, ['-s', serial, 'shell', 'dumpsys', 'battery']),
      this.run(this.adbBinary, ['-s', serial, 'shell', 'dumpsys', 'activity', 'activities']),
      this.run(this.adbBinary, ['-s', serial, 'shell', 'pm', 'list', 'packages']),
      this.run(this.adbBinary, ['-s', serial, 'shell', 'pm', 'list', 'packages', '-s']),
      this.run(this.adbBinary, ['-s', serial, 'shell', 'cat', '/proc/meminfo']),
      this.run(this.adbBinary, ['-s', serial, 'shell', 'dumpsys', 'cpuinfo']),
    ]);
    const resolution = size.stdout.match(/(?:Physical|Override) size:\s*(\d+)x(\d+)/);
    const batteryLevel = battery.stdout.match(/level:\s*(\d+)/);
    const currentApp = foreground.stdout.match(/mResumedActivity.*?\s([A-Za-z0-9._]+)\//);
    const totalMemory = memory.stdout.match(/^MemTotal:\s*(\d+)/m);
    const availableMemory = memory.stdout.match(/^MemAvailable:\s*(\d+)/m);
    const cpuPercent = cpu.stdout.match(/TOTAL:\s*([\d.]+)%/);
    const installedPackages = packages.stdout
      .split(/\r?\n/)
      .map((line) => line.replace(/^package:/, '').trim())
      .filter((name) => name === 'com.google.android.youtube' || name === 'com.zhiliaoapp.musically');
    const systemPackageNames = new Set(systemPackages.stdout
      .split(/\r?\n/)
      .map((line) => line.replace(/^package:/, '').trim()));

    return {
      androidVersion: `${release.stdout.trim() || 'Android'} (Google Play emulator)`,
      apiLevel: Number(api.stdout.trim()) || 35,
      buildFingerprint: fingerprint.stdout.trim(),
      resolution: {
        width: Number(resolution?.[1] || 720),
        height: Number(resolution?.[2] || 1560),
      },
      orientation: this.orientations.get(id) || 'portrait',
      batteryLevel: Number(batteryLevel?.[1] || 100),
      currentApp: currentApp?.[1] || 'com.google.android.apps.nexuslauncher',
      installedPackages,
      systemPackages: [...systemPackageNames],
      cpuUsage: Number(cpuPercent?.[1] || 0),
      totalRamMb: Math.round(Number(totalMemory?.[1] || 0) / 1024),
      ramUsageMb: Math.max(
        0,
        Math.round((Number(totalMemory?.[1] || 0) - Number(availableMemory?.[1] || 0)) / 1024),
      ),
    };
  }

  public async captureScreenshot(id: string, port: number): Promise<Buffer> {
    if (this.framesInProgress.has(id)) throw new Error('Screenshot already in progress');
    this.framesInProgress.add(id);
    try {
      return await this.runBinary(this.adbBinary, ['-s', `emulator-${port}`, 'exec-out', 'screencap', '-p']);
    } finally {
      this.framesInProgress.delete(id);
    }
  }
}
