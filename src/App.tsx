import React, { useState, useEffect, useCallback } from 'react';
import {
  Smartphone,
  Layers,
  Activity,
  Zap,
  Globe,
  Terminal,
  Play,
  Square,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  Wifi,
  Sparkles,
} from 'lucide-react';
import {
  DeviceInfo,
  DeviceInputCommand,
  SyncExecutionResponse,
  SystemStats,
  EnvironmentAuditReport,
  AuditLogEntry,
  NgrokConfig,
  WebSocketServerMessage,
} from './types/index.ts';
import {
  fetchDevices,
  fetchSystemStats,
  fetchAuditReport,
  fetchLogs,
  clearLogs,
  fetchNgrokConfig,
  startDevice,
  stopDevice,
  restartDevice,
  sendDeviceInput,
  executeSync,
  authenticateDashboard,
  fetchDashboardSession,
  logoutDashboard,
  wsClient,
} from './services/api.ts';
import { Header } from './components/Header.tsx';
import { DeviceCard } from './components/DeviceCard.tsx';
import { DeviceDetailModal } from './components/DeviceDetailModal.tsx';
import { SyncControlPanel } from './components/SyncControlPanel.tsx';
import { EnvironmentAuditModal } from './components/EnvironmentAuditModal.tsx';
import { NgrokSettingsModal } from './components/NgrokSettingsModal.tsx';
import { LogViewerModal } from './components/LogViewerModal.tsx';
import { ApkManagerModal } from './components/ApkManagerModal.tsx';

export default function App() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [audit, setAudit] = useState<EnvironmentAuditReport | null>(null);
  const [ngrok, setNgrok] = useState<NgrokConfig | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [layoutCols, setLayoutCols] = useState<2 | 3 | 5>(3);
  const [syncMode, setSyncMode] = useState<boolean>(false);
  const [activeDetailDevice, setActiveDetailDevice] = useState<DeviceInfo | null>(null);

  // Modals
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isNgrokOpen, setIsNgrokOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isApkManagerOpen, setIsApkManagerOpen] = useState(false);
  const [targetDeviceIdForApk, setTargetDeviceIdForApk] = useState<string | undefined>(undefined);

  // Sync execution state
  const [isExecutingSync, setIsExecutingSync] = useState(false);
  const [lastSyncResponse, setLastSyncResponse] = useState<SyncExecutionResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [authState, setAuthState] = useState<'checking' | 'login' | 'authenticated' | 'error'>('checking');
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchDashboardSession()
      .then((session) => {
        if (cancelled) return;
        setAuthEnabled(session.authEnabled);
        setAuthState(session.authenticated ? 'authenticated' : 'login');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('Failed to check dashboard session', error);
        setAuthError('Unable to connect to the dashboard. Check the server and try again.');
        setAuthState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    try {
      await authenticateDashboard(authPassword);
      setAuthPassword('');
      setAuthState('authenticated');
    } catch (error) {
      console.error('Dashboard login failed', error);
      setAuthError('Login failed. Check your password and try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await logoutDashboard();
      setAuthState('login');
    } catch (error) {
      console.error('Dashboard logout failed', error);
      setAuthError('Unable to log out. Please try again.');
    }
  };

  // Fetch initial data
  const loadInitialData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [devs, st, aud, ngr, lg] = await Promise.all([
        fetchDevices().catch(() => []),
        fetchSystemStats().catch(() => null),
        fetchAuditReport().catch(() => null),
        fetchNgrokConfig().catch(() => null),
        fetchLogs().catch(() => []),
      ]);

      if (devs.length > 0) {
        setDevices(devs);
        // Default select all online devices for sync
        const onlineIds = devs.filter((d) => d.status === 'online').map((d) => d.id);
        setSelectedDeviceIds(onlineIds);
      }
      if (st) setStats(st);
      if (aud) setAudit(aud);
      if (ngr) setNgrok(ngr);
      if (lg) setLogs(lg);
    } catch (err) {
      console.error('Failed to load initial data', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authState !== 'authenticated') return;
    loadInitialData();

    // Subscribe to WebSocket real-time messages
    const unsubscribe = wsClient.subscribe((msg: WebSocketServerMessage) => {
      switch (msg.type) {
        case 'INIT_STATE':
          setDevices(msg.devices);
          setStats(msg.stats);
          setNgrok(msg.ngrok);
          break;
        case 'DEVICE_UPDATED':
          setDevices((prev) =>
            prev.map((d) => (d.id === msg.device.id ? msg.device : d)),
          );
          if (activeDetailDevice && activeDetailDevice.id === msg.device.id) {
            setActiveDetailDevice(msg.device);
          }
          break;
        case 'ALL_DEVICES':
          setDevices(msg.devices);
          if (activeDetailDevice) {
            const updated = msg.devices.find((d) => d.id === activeDetailDevice.id);
            if (updated) setActiveDetailDevice(updated);
          }
          break;
        case 'STATS_TICK':
          setStats(msg.stats);
          break;
        case 'LOG_ENTRY':
          setLogs((prev) => [msg.log, ...prev.slice(0, 300)]);
          break;
        case 'SYNC_FINISHED':
          setLastSyncResponse(msg.response);
          setIsExecutingSync(false);
          break;
        case 'SCREEN_FRAME':
          if (msg.frameBase64) {
            setDevices((prev) => prev.map((device) =>
              device.id === msg.deviceId
                ? { ...device, highResFrame: msg.frameBase64, lastPing: Date.now() }
                : device,
            ));
            setActiveDetailDevice((device) =>
              device?.id === msg.deviceId ? { ...device, highResFrame: msg.frameBase64 } : device,
            );
          }
          break;
        case 'AUTH_EXPIRED':
          setAuthError('Your session expired. Sign in again.');
          setAuthState('login');
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [authState, loadInitialData]);

  // Sync selection helpers
  const handleSelectAll = () => {
    setSelectedDeviceIds(devices.map((d) => d.id));
  };

  const handleDeselectAll = () => {
    setSelectedDeviceIds([]);
  };

  const handleSelectOnlineOnly = () => {
    setSelectedDeviceIds(devices.filter((d) => d.status === 'online').map((d) => d.id));
  };

  const handleToggleDevice = (id: string) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  // Device actions
  const handleStartDevice = async (id: string) => {
    try {
      const updated = await startDevice(id);
      setDevices((prev) => prev.map((d) => (d.id === id ? updated : d)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleStopDevice = async (id: string) => {
    try {
      const updated = await stopDevice(id);
      setDevices((prev) => prev.map((d) => (d.id === id ? updated : d)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestartDevice = async (id: string) => {
    try {
      const updated = await restartDevice(id);
      setDevices((prev) => prev.map((d) => (d.id === id ? updated : d)));
    } catch (err) {
      console.error(err);
    }
  };

  // Direct single-device input (e.g. quick tap or controls)
  const handleSendCommand = async (deviceId: string, command: DeviceInputCommand) => {
    try {
      await sendDeviceInput(deviceId, command);
      const updatedList = await fetchDevices();
      setDevices(updatedList);
      if (activeDetailDevice && activeDetailDevice.id === deviceId) {
        const current = updatedList.find((d) => d.id === deviceId);
        if (current) setActiveDetailDevice(current);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Execute Sync across all selected targets
  const handleExecuteSync = async (action: DeviceInputCommand, maxConcurrency = 5) => {
    if (selectedDeviceIds.length === 0) return;
    setIsExecutingSync(true);
    try {
      const resp = await executeSync({
        targetDeviceIds: selectedDeviceIds,
        action,
        maxConcurrency,
      });
      setLastSyncResponse(resp);
      const updatedList = await fetchDevices();
      setDevices(updatedList);
      return resp;
    } catch (err) {
      console.error(err);
    } finally {
      setIsExecutingSync(false);
    }
  };

  // Batch actions
  const handleStartAll = async () => {
    const offlineDevs = devices.filter((d) => d.status === 'offline');
    for (const d of offlineDevs) {
      handleStartDevice(d.id);
    }
  };

  const handleStopAll = async () => {
    const onlineDevs = devices.filter((d) => d.status === 'online');
    for (const d of onlineDevs) {
      handleStopDevice(d.id);
    }
  };

  // Grid column classes
  const gridClass =
    layoutCols === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : layoutCols === 5
      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  if (authState !== 'authenticated') {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
        <section className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <h1 className="text-xl font-semibold">Phone Farm Dashboard</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {authState === 'checking'
              ? 'Checking your secure session...'
              : authState === 'error'
                ? 'Dashboard connection unavailable.'
                : 'Sign in to manage connected devices.'}
          </p>
          {authState === 'login' && (
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <label className="block text-sm text-zinc-300" htmlFor="dashboard-password">
                Dashboard password
              </label>
              <input
                id="dashboard-password"
                type="password"
                autoComplete="current-password"
                required
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              {authError && <p role="alert" className="text-sm text-red-400">{authError}</p>}
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
              >
                Sign in
              </button>
            </form>
          )}
          {authState === 'error' && (
            <div className="mt-5">
              <p role="alert" className="text-sm text-red-400">{authError}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
              >
                Retry
              </button>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Header */}
      <Header
        stats={stats}
        audit={audit}
        ngrok={ngrok}
        layoutCols={layoutCols}
        setLayoutCols={setLayoutCols}
        syncMode={syncMode}
        setSyncMode={setSyncMode}
        selectedCount={selectedDeviceIds.length}
        onOpenAudit={() => setIsAuditOpen(true)}
        onOpenNgrok={() => setIsNgrokOpen(true)}
        onOpenLogs={() => setIsLogsOpen(true)}
        onOpenApkManager={() => {
          setTargetDeviceIdForApk(undefined);
          setIsApkManagerOpen(true);
        }}
        onRefresh={loadInitialData}
        isRefreshing={isRefreshing}
      />

      {/* Sync Control Drawer / Panel */}
      {syncMode && (
        <SyncControlPanel
          devices={devices}
          selectedDeviceIds={selectedDeviceIds}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onSelectOnlineOnly={handleSelectOnlineOnly}
          onToggleDevice={handleToggleDevice}
          onExecuteSync={handleExecuteSync}
          isExecuting={isExecutingSync}
          lastSyncResponse={lastSyncResponse}
          onClose={() => setSyncMode(false)}
        />
      )}

      {/* Main Dashboard Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-4">
        {/* Farm Sub-header with Batch Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/40 border border-zinc-850 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-zinc-300">PIXEL 7 PRO VIRTUAL INSTANCES</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">
              Android 14 (API 34) • Ultra-Lightweight 720x1560 Farm Profile
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleStartAll}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-medium transition-colors"
              title="Boot all offline devices"
            >
              <Play className="w-3 h-3" />
              <span>Start All</span>
            </button>
            <button
              onClick={handleStopAll}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-xs font-medium transition-colors"
              title="Power down all active devices"
            >
              <Square className="w-3 h-3" />
              <span>Stop All</span>
            </button>
          </div>
        </div>

        {/* 10 Devices Grid */}
        <div className={`grid gap-4 ${gridClass}`}>
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              isSelectedForSync={selectedDeviceIds.includes(device.id)}
              onToggleSelect={handleToggleDevice}
              onOpenDetail={(dev) => setActiveDetailDevice(dev)}
              onStart={handleStartDevice}
              onStop={handleStopDevice}
              onRestart={handleRestartDevice}
              onQuickTap={handleSendCommand}
            />
          ))}
        </div>
      </main>

      {/* Bottom Sticky Footer */}
      <footer className="border-t border-zinc-850 bg-zinc-950 px-4 py-2.5 text-xs text-zinc-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              {audit?.androidRuntimeEnabled
                ? 'Android Emulator · AVD data persisted'
                : 'Development simulator · state is temporary'}
            </span>
            <span className="text-zinc-700">•</span>
            <span className="text-[11px] text-zinc-400">
              Avg Sync Latency: <strong className="text-zinc-200 font-mono">{stats?.averageLatencyMs ?? 0}ms</strong>
            </span>
            <span className="text-zinc-700">•</span>
            <span className="text-[11px] text-zinc-400">
              Total Ops Executed: <strong className="text-zinc-200 font-mono">{stats?.totalOpsExecuted ?? 0}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <button
              onClick={() => setIsAuditOpen(true)}
              className="hover:text-zinc-200 transition-colors"
            >
              KVM &amp; Feasibility Report
            </button>
            <span>•</span>
            <button
              onClick={() => setIsNgrokOpen(true)}
              className="hover:text-zinc-200 transition-colors"
            >
              Ngrok Settings
            </button>
            <span>•</span>
            <button
              onClick={() => setIsLogsOpen(true)}
              className="hover:text-zinc-200 transition-colors"
            >
              System Logs ({logs.length})
            </button>
            <span>•</span>
            {authEnabled && (
              <button onClick={handleLogout} className="hover:text-zinc-200 transition-colors">
                Sign out
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Modals */}
      {activeDetailDevice && (
        <DeviceDetailModal
          device={activeDetailDevice}
          onClose={() => setActiveDetailDevice(null)}
          onSendCommand={handleSendCommand}
          onOpenApkManager={audit?.androidRuntimeEnabled ? undefined : (devId) => {
            setTargetDeviceIdForApk(devId);
            setIsApkManagerOpen(true);
          }}
        />
      )}

      {isApkManagerOpen && !audit?.androidRuntimeEnabled && (
        <ApkManagerModal
          devices={devices}
          initialDeviceId={targetDeviceIdForApk}
          onClose={() => setIsApkManagerOpen(false)}
          onRefreshDevices={loadInitialData}
        />
      )}

      {isAuditOpen && (
        <EnvironmentAuditModal
          audit={audit}
          onClose={() => setIsAuditOpen(false)}
        />
      )}

      {isNgrokOpen && (
        <NgrokSettingsModal
          ngrok={ngrok}
          onClose={() => setIsNgrokOpen(false)}
        />
      )}

      {isLogsOpen && (
        <LogViewerModal
          logs={logs}
          devices={devices}
          onClose={() => setIsLogsOpen(false)}
          onClearLogs={async () => {
            await clearLogs();
            setLogs([]);
          }}
        />
      )}
    </div>
  );
}
