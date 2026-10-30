import {
  DeviceInfo,
  DeviceInputCommand,
  SyncExecutionRequest,
  SyncExecutionResponse,
  SystemStats,
  EnvironmentAuditReport,
  AuditLogEntry,
  NgrokConfig,
  WebSocketServerMessage,
  WebSocketClientMessage,
} from '../types/index.ts';

const API_BASE = '/api';

export async function fetchHealth(): Promise<{
  status: 'healthy';
  timestamp: string;
  uptime: number;
  devicesOnline: number;
  totalDevices: number;
  kvmSupported: boolean;
  executionEngine: 'virtual_container_fallback' | 'kvm_accelerated_qemu';
  authEnabled: boolean;
  androidRuntime: 'android-emulator' | 'simulator';
  emulatorCapacity: {
    maxDevices: number;
    memoryLimitMb: number;
    cpuLimitCores: number;
    reason?: string;
  };
}> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Failed to fetch health');
  return res.json();
}

export async function fetchAuditReport(): Promise<EnvironmentAuditReport> {
  const res = await fetch(`${API_BASE}/audit-report`);
  if (!res.ok) throw new Error('Failed to fetch environment audit');
  return res.json();
}

export async function fetchDevices(): Promise<DeviceInfo[]> {
  const res = await fetch(`${API_BASE}/devices`);
  if (!res.ok) throw new Error('Failed to fetch devices');
  return res.json();
}

export async function fetchDevice(id: string): Promise<DeviceInfo> {
  const res = await fetch(`${API_BASE}/devices/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch device ${id}`);
  return res.json();
}

export async function startDevice(id: string): Promise<DeviceInfo> {
  const res = await fetch(`${API_BASE}/devices/${id}/start`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to start device ${id}`);
  const data = await res.json();
  return data.device;
}

export async function stopDevice(id: string): Promise<DeviceInfo> {
  const res = await fetch(`${API_BASE}/devices/${id}/stop`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to stop device ${id}`);
  const data = await res.json();
  return data.device;
}

export async function restartDevice(id: string): Promise<DeviceInfo> {
  const res = await fetch(`${API_BASE}/devices/${id}/restart`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to restart device ${id}`);
  const data = await res.json();
  return data.device;
}

export async function sendDeviceInput(id: string, command: DeviceInputCommand): Promise<any> {
  const res = await fetch(`${API_BASE}/devices/${id}/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Failed to send input to ${id}`);
  return res.json();
}

export async function executeSync(request: SyncExecutionRequest): Promise<SyncExecutionResponse> {
  const res = await fetch(`${API_BASE}/sync/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error('Sync execution failed');
  return res.json();
}

export async function fetchSystemStats(): Promise<SystemStats> {
  const res = await fetch(`${API_BASE}/system/stats`);
  if (!res.ok) throw new Error('Failed to fetch system stats');
  return res.json();
}

export async function fetchLogs(deviceId?: string, level?: string): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams();
  if (deviceId) params.append('deviceId', deviceId);
  if (level) params.append('level', level);
  const res = await fetch(`${API_BASE}/logs?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch logs');
  return res.json();
}

export async function clearLogs(): Promise<void> {
  await fetch(`${API_BASE}/logs/clear`, { method: 'POST' });
}

export async function fetchNgrokConfig(): Promise<NgrokConfig> {
  const res = await fetch(`${API_BASE}/ngrok/config`);
  if (!res.ok) throw new Error('Failed to fetch Ngrok config');
  return res.json();
}

export async function authenticateDashboard(password: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error('Authentication failed');
  return res.json();
}

// --- APK PACKAGE MANAGEMENT & ADB DEVICE CONNECTION ---
export async function fetchApkCatalog(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/apk/catalog`);
  if (!res.ok) throw new Error('Failed to fetch APK catalog');
  return res.json();
}

export async function installApk(payload: any): Promise<any> {
  const res = await fetch(`${API_BASE}/apk/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to install APK');
  return res.json();
}

export async function uninstallPackage(deviceId: string, packageName: string): Promise<any> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/uninstall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packageName }),
  });
  if (!res.ok) throw new Error(`Failed to uninstall ${packageName}`);
  return res.json();
}

export async function openPlayStoreListing(deviceId: string, packageName: string): Promise<void> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}/play-store/${encodeURIComponent(packageName)}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || 'Failed to open Google Play');
  }
}

export async function connectAdbDevice(host: string, port: number): Promise<any> {
  const res = await fetch(`${API_BASE}/adb/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host, port }),
  });
  if (!res.ok) throw new Error(`Failed to connect to ${host}:${port}`);
  return res.json();
}

// --- WEBSOCKET CLIENT WITH RECONNECT & PUB/SUB ---
export type WebSocketListener = (msg: WebSocketServerMessage) => void;

export async function fetchDashboardSession(): Promise<{ authenticated: boolean; authEnabled: boolean }> {
  const res = await fetch(`${API_BASE}/auth/session`);
  if (!res.ok && res.status !== 401) throw new Error('Failed to check dashboard session');
  return res.json();
}

export async function logoutDashboard(): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to log out');
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Set<WebSocketListener> = new Set();
  private subscribedDevices: Set<string> = new Set();
  private pendingMessages: WebSocketClientMessage[] = [];
  private isConnecting = false;
  private reconnectTimeout: any = null;
  public isConnected = false;

  public connect() {
    if (this.ws || this.isConnecting) return;
    this.isConnecting = true;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.isConnected = true;
        this.isConnecting = false;
        this.subscribedDevices.forEach((deviceId) => {
          socket.send(JSON.stringify({ type: 'SUBSCRIBE_DEVICE', deviceId }));
        });
        this.pendingMessages.splice(0).forEach((message) => socket.send(JSON.stringify(message)));
        console.log('[WS] Connected to Phone Farm gateway');
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket) return;
        try {
          const msg = JSON.parse(event.data);
          this.listeners.forEach((listener) => listener(msg));
        } catch (e) {
          // ignore
        }
      };

      socket.onclose = (event) => {
        if (this.ws !== socket) return;
        this.isConnected = false;
        this.isConnecting = false;
        this.ws = null;
        if (event.code === 4001) {
          this.listeners.forEach((listener) => listener({ type: 'AUTH_EXPIRED' }));
          return;
        }
        this.scheduleReconnect();
      };

      socket.onerror = () => {
        if (this.ws !== socket) return;
        this.isConnected = false;
        socket.close();
      };
    } catch (e) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.listeners.size === 0) return;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, 2000);
  }

  public subscribe(listener: WebSocketListener): () => void {
    this.listeners.add(listener);
    if (!this.ws && !this.isConnecting) {
      this.connect();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
        this.ws?.close();
        this.ws = null;
        this.isConnected = false;
        this.isConnecting = false;
      }
    };
  }

  public send(msg: WebSocketClientMessage) {
    if (msg.type === 'SUBSCRIBE_DEVICE') this.subscribedDevices.add(msg.deviceId);
    if (msg.type === 'UNSUBSCRIBE_DEVICE') this.subscribedDevices.delete(msg.deviceId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else if (msg.type !== 'SUBSCRIBE_DEVICE' && msg.type !== 'UNSUBSCRIBE_DEVICE') {
      this.pendingMessages.push(msg);
    }
  }
}

export const wsClient = new WebSocketClient();
