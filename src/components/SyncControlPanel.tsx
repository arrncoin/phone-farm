import React, { useState } from 'react';
import {
  CheckSquare,
  Square,
  Play,
  RotateCcw,
  Send,
  Zap,
  Globe,
  Smartphone,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Clock,
  Layers,
  XCircle,
  Crown,
  Eye,
  Check,
  Flame,
  Music2,
} from 'lucide-react';
import {
  DeviceInfo,
  DeviceInputCommand,
  SyncExecutionResponse,
} from '../types/index.ts';

interface SyncControlPanelProps {
  devices: DeviceInfo[];
  selectedDeviceIds: string[];
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSelectOnlineOnly: () => void;
  onToggleDevice: (id: string) => void;
  onExecuteSync: (action: DeviceInputCommand, maxConcurrency?: number) => Promise<SyncExecutionResponse | void>;
  isExecuting: boolean;
  lastSyncResponse: SyncExecutionResponse | null;
  onClose: () => void;
}

export const SyncControlPanel: React.FC<SyncControlPanelProps> = ({
  devices,
  selectedDeviceIds,
  onSelectAll,
  onDeselectAll,
  onSelectOnlineOnly,
  onToggleDevice,
  onExecuteSync,
  isExecuting,
  lastSyncResponse,
  onClose,
}) => {
  const [inputText, setInputText] = useState('');
  const [concurrency, setConcurrency] = useState<number>(5);
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null);

  // Master device selection: pick the first online device or pixel-01 by default
  const [masterDeviceId, setMasterDeviceId] = useState<string>(() => {
    const online = devices.find((d) => d.status === 'online');
    return online ? online.id : devices[0]?.id || 'pixel-01';
  });

  const masterDevice = devices.find((d) => d.id === masterDeviceId) || devices[0];

  const handleSelectMaster = (id: string) => {
    setMasterDeviceId(id);
    if (!selectedDeviceIds.includes(id)) {
      onToggleDevice(id); // auto-select master into sync targets
    }
  };

  const selectedCount = selectedDeviceIds.length;
  const onlineCount = devices.filter((d) => d.status === 'online').length;

  // Master Screen touch handler: taps directly on the master display and broadcasts normalized touch
  const handleMasterScreenClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (selectedCount === 0 || isExecuting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const normX = Number(Math.max(0, Math.min(1, clickX / rect.width)).toFixed(3));
    const normY = Number(Math.max(0, Math.min(1, clickY / rect.height)).toFixed(3));

    setTouchPos({ x: normX, y: normY });

    onExecuteSync(
      {
        type: 'tap',
        x: normX,
        y: normY,
      },
      concurrency,
    );
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || selectedCount === 0) return;
    onExecuteSync(
      {
        type: 'text',
        text: inputText.trim(),
      },
      concurrency,
    );
    setInputText('');
  };

  const handleKeySync = (keycode: string) => {
    if (selectedCount === 0 || isExecuting) return;
    onExecuteSync(
      {
        type: 'key',
        keycode,
      },
      concurrency,
    );
  };

  const handleSwipeSync = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (selectedCount === 0 || isExecuting) return;
    const coords = {
      up: { startX: 0.5, startY: 0.8, endX: 0.5, endY: 0.2 },
      down: { startX: 0.5, startY: 0.2, endX: 0.5, endY: 0.8 },
      left: { startX: 0.8, startY: 0.5, endX: 0.2, endY: 0.5 },
      right: { startX: 0.2, startY: 0.5, endX: 0.8, endY: 0.5 },
    }[direction];

    onExecuteSync(
      {
        type: 'swipe',
        ...coords,
        durationMs: 300,
      },
      concurrency,
    );
  };

  const handleAppLaunchSync = (packageName: string) => {
    if (selectedCount === 0 || isExecuting) return;
    onExecuteSync(
      {
        type: 'launch',
        packageName,
      },
      concurrency,
    );
  };

  return (
    <div className="border-b border-amber-500/40 bg-zinc-950/95 backdrop-blur-md px-4 py-3 shadow-2xl">
      <div className="max-w-7xl mx-auto space-y-3">
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Crown className="w-4 h-4 fill-amber-400/20" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-100 flex items-center gap-1.5">
                  SYNC MASTER CONTROLLER
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1">
                  <Crown className="w-3 h-3 text-amber-400" />
                  Master: {masterDevice?.name || 'Pixel 7 Pro #01'}
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {selectedCount} Targets Active
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Layar Master di bawah menampilkan tampilan langsung perangkat master. Semua sentuhan &amp; gesture pada layar master langsung disinkronkan ke seluruh target!
              </p>
            </div>
          </div>

          {/* Quick Selection Buttons */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            <button
              onClick={onSelectAll}
              className="px-2.5 py-1 text-xs font-medium rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
            >
              Select All (10)
            </button>
            <button
              onClick={onSelectOnlineOnly}
              className="px-2.5 py-1 text-xs font-medium rounded hover:bg-zinc-800 text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Select Online ({onlineCount})
            </button>
            <button
              onClick={onDeselectAll}
              className="px-2.5 py-1 text-xs font-medium rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Concurrency Selector */}
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-zinc-400 text-[11px]">Concurrency:</span>
            <select
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-200 text-xs font-mono focus:outline-none"
            >
              <option value={1}>1 (Sequential)</option>
              <option value={3}>3 Workers</option>
              <option value={5}>5 Workers (Recommended)</option>
              <option value={10}>10 Workers (Max Parallel)</option>
            </select>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Close Sync Panel"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Device Badges: Highlight Master Device with Crown */}
        <div className="flex flex-wrap items-center gap-1.5 py-1 bg-zinc-900/40 p-2 rounded-xl border border-zinc-850">
          <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider mr-1">
            Target Devices:
          </span>
          {devices.map((d) => {
            const isMaster = d.id === masterDeviceId;
            const isSelected = selectedDeviceIds.includes(d.id);
            const isOnline = d.status === 'online';
            return (
              <button
                key={d.id}
                onClick={() => onToggleDevice(d.id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-mono transition-all border ${
                  isMaster
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 ring-2 ring-amber-500/30 font-bold shadow-md shadow-amber-950/30'
                    : isSelected
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                    : isOnline
                    ? 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                    : 'bg-zinc-950 text-zinc-600 border-zinc-900 opacity-60'
                }`}
                title={isMaster ? 'Master Device (Click to toggle sync participation)' : 'Click to toggle device in Sync Group'}
              >
                {isMaster ? (
                  <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                ) : (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isOnline ? 'bg-emerald-400' : 'bg-zinc-600'
                    }`}
                  />
                )}
                <span>{d.name.replace('Pixel 7 Pro #', 'P7P-')}</span>
                {isMaster && <span className="text-[9px] bg-amber-400/20 px-1 rounded text-amber-300">MASTER</span>}
              </button>
            );
          })}
        </div>

        {/* Master Controller Screen & Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
          {/* Col 1: Real Interactive Master Device Screen (Col 4) */}
          <div className="md:col-span-4 bg-zinc-900/90 border-2 border-amber-500/50 rounded-2xl p-3 flex flex-col items-center shadow-xl shadow-amber-950/20 relative">
            {/* Master Header & Selector */}
            <div className="w-full flex items-center justify-between mb-2 pb-1.5 border-b border-zinc-800">
              <div className="flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-300">
                  Master Device Screen
                </span>
              </div>

              {/* Master Dropdown Picker */}
              <div className="flex items-center gap-1 bg-zinc-950 border border-amber-500/40 rounded-lg px-2 py-0.5">
                <span className="text-[9px] text-zinc-500 font-semibold uppercase">PILIH:</span>
                <select
                  value={masterDeviceId}
                  onChange={(e) => handleSelectMaster(e.target.value)}
                  className="bg-transparent text-amber-300 font-mono text-[11px] font-bold focus:outline-none cursor-pointer"
                  title="Ganti Master Device"
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id} className="bg-zinc-900 text-zinc-100">
                      {d.name} {d.status === 'online' ? '●' : '○'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sub-header info */}
            <div className="w-full flex items-center justify-between text-[10px] text-zinc-400 mb-2 px-1">
              <span className="truncate flex items-center gap-1 text-zinc-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                App: <strong className="text-white">{masterDevice?.currentAppName || 'Pixel Launcher'}</strong>
              </span>
              {touchPos ? (
                <span className="font-mono text-amber-400 font-bold">
                  X:{touchPos.x} Y:{touchPos.y}
                </span>
              ) : (
                <span className="font-mono text-zinc-500">Tap screen to Sync</span>
              )}
            </div>

            {/* Interactive Phone Frame with Live Master Screen */}
            <div className="relative w-full max-w-[200px]">
              {/* Bezel */}
              <div className="relative p-1.5 rounded-[36px] bg-zinc-950 border-2 border-amber-500/60 shadow-xl shadow-amber-500/10">
                {/* Ear Notch */}
                <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto mb-1" />

                {/* Display Canvas with LIVE Master Device SVG */}
                <div
                  onClick={handleMasterScreenClick}
                  className={`relative w-full aspect-[9/19.5] rounded-3xl overflow-hidden bg-black border border-zinc-800 shadow-inner cursor-crosshair select-none ${
                    selectedCount === 0 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  title="Klik di layar Master untuk mengirim Tap yang disinkronkan ke semua perangkat!"
                >
                  {masterDevice?.thumbnailSvg ? (
                    <div
                      className="w-full h-full pointer-events-none select-none"
                      dangerouslySetInnerHTML={{ __html: masterDevice.thumbnailSvg }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 text-xs">
                      <Smartphone className="w-8 h-8 text-zinc-700 mb-2" />
                      <span>Master Screen Offline</span>
                    </div>
                  )}

                  {/* Animated Tap Ripple on Master Display */}
                  {touchPos && (
                    <div
                      className="absolute w-5 h-5 rounded-full bg-amber-400 border-2 border-white shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-1/2 animate-ping"
                      style={{ left: `${touchPos.x * 100}%`, top: `${touchPos.y * 100}%` }}
                    />
                  )}

                  {/* Master Floating Badge */}
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/85 backdrop-blur-sm border border-amber-500/50 text-[9px] font-mono text-amber-300 font-bold flex items-center gap-1 pointer-events-none shadow">
                    <Crown className="w-2.5 h-2.5 text-amber-400 fill-amber-400/40" />
                    MASTER: {masterDevice?.name.replace('Pixel 7 Pro #', '#')}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action: Sync Master App to Slaves */}
            <div className="w-full mt-2 pt-2 border-t border-zinc-800 flex items-center gap-2">
              <button
                onClick={() => handleAppLaunchSync(masterDevice.currentApp)}
                disabled={selectedCount === 0 || isExecuting}
                className="w-full py-1.5 px-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
                title="Buka aplikasi yang sedang aktif di Master ke seluruh perangkat terpilih"
              >
                <Zap className="w-3 h-3 text-amber-400" />
                <span>Sync Buka App ({masterDevice.currentAppName}) ke Target</span>
              </button>
            </div>
          </div>

          {/* Col 2: Sync Hardware Keys & Swipes (Col 4) */}
          <div className="md:col-span-4 bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 flex flex-col justify-between gap-3">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block mb-2">
                Sync Navigation Keys (Kirim ke Target)
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleKeySync('BACK')}
                  disabled={selectedCount === 0 || isExecuting}
                  className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs text-zinc-200 font-semibold border border-zinc-700 transition-colors"
                >
                  ◀ Sync Back
                </button>
                <button
                  onClick={() => handleKeySync('HOME')}
                  disabled={selectedCount === 0 || isExecuting}
                  className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs text-zinc-200 font-semibold border border-zinc-700 transition-colors"
                >
                  ● Sync Home
                </button>
                <button
                  onClick={() => handleKeySync('RECENTS')}
                  disabled={selectedCount === 0 || isExecuting}
                  className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs text-zinc-200 font-semibold border border-zinc-700 transition-colors"
                >
                  ■ Sync Recents
                </button>
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block mb-2">
                Sync Swipes (Geser Layar Serentak)
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  onClick={() => handleSwipeSync('up')}
                  disabled={selectedCount === 0 || isExecuting}
                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs text-zinc-300 font-medium"
                >
                  ▲ Up
                </button>
                <button
                  onClick={() => handleSwipeSync('down')}
                  disabled={selectedCount === 0 || isExecuting}
                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs text-zinc-300 font-medium"
                >
                  ▼ Down
                </button>
                <button
                  onClick={() => handleSwipeSync('left')}
                  disabled={selectedCount === 0 || isExecuting}
                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs text-zinc-300 font-medium"
                >
                  ◄ Left
                </button>
                <button
                  onClick={() => handleSwipeSync('right')}
                  disabled={selectedCount === 0 || isExecuting}
                  className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs text-zinc-300 font-medium"
                >
                  ► Right
                </button>
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block mb-2">
                Sync Launch Apps
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleAppLaunchSync('com.google.android.youtube')}
                  disabled={selectedCount === 0}
                  className="px-2.5 py-1 rounded bg-red-950/60 hover:bg-red-900/80 text-white font-bold border border-red-500/50 text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  YouTube
                </button>
                <button
                  onClick={() => handleAppLaunchSync('com.zhiliaoapp.musically')}
                  disabled={selectedCount === 0}
                  className="px-2.5 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-200 font-bold border border-cyan-400/50 text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <Music2 className="w-3 h-3 text-cyan-400" />
                  TikTok
                </button>
                <button
                  onClick={() => handleAppLaunchSync('com.android.chrome')}
                  disabled={selectedCount === 0}
                  className="px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium"
                >
                  Chrome
                </button>
                <button
                  onClick={() => handleAppLaunchSync('com.android.launcher')}
                  disabled={selectedCount === 0}
                  className="px-2.5 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-medium"
                >
                  Launcher
                </button>
                <button
                  onClick={() => handleAppLaunchSync('com.android.settings')}
                  disabled={selectedCount === 0}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
                >
                  Settings
                </button>
                <button
                  onClick={() => handleAppLaunchSync('com.termux')}
                  disabled={selectedCount === 0}
                  className="px-2.5 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-medium"
                >
                  Termux
                </button>
              </div>
            </div>
          </div>

          {/* Col 3: Sync Text Broadcast & Operation Results (Col 4) */}
          <div className="md:col-span-4 bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 flex flex-col justify-between gap-3">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block mb-2">
                Sync Text / URL Broadcast (adb input text)
              </span>
              <form onSubmit={handleSendText} className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={selectedCount === 0}
                  placeholder={selectedCount > 0 ? 'Type text to send to all targets...' : 'Select devices first'}
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={selectedCount === 0 || !inputText.trim() || isExecuting}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-bold text-xs flex items-center gap-1 transition-colors"
                >
                  <Send className="w-3 h-3" />
                  <span>Sync</span>
                </button>
              </form>
            </div>

            {/* Live Progress / Latency Result */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Hasil Sync Terakhir:</span>
                {isExecuting ? (
                  <span className="text-amber-400 animate-pulse font-mono font-medium">
                    Broadcasting...
                  </span>
                ) : lastSyncResponse ? (
                  <span className="text-emerald-400 font-mono font-medium">
                    {lastSyncResponse.successCount}/{lastSyncResponse.totalTargets} Sukses ({lastSyncResponse.avgLatencyMs}ms)
                  </span>
                ) : (
                  <span className="text-zinc-600 font-mono">Siap Sinkron</span>
                )}
              </div>

              {lastSyncResponse && (
                <div className="max-h-24 overflow-y-auto space-y-1 pt-1 border-t border-zinc-850">
                  {lastSyncResponse.results.map((r) => (
                    <div
                      key={r.deviceId}
                      className="flex items-center justify-between text-[10px] font-mono"
                    >
                      <span className="text-zinc-300 flex items-center gap-1">
                        {r.deviceId === masterDeviceId && <Crown className="w-2.5 h-2.5 text-amber-400" />}
                        {r.deviceName}
                      </span>
                      <span
                        className={
                          r.status === 'success'
                            ? 'text-emerald-400'
                            : r.status === 'offline'
                            ? 'text-zinc-500'
                            : 'text-rose-400'
                        }
                      >
                        {r.status.toUpperCase()} ({r.latencyMs}ms)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
