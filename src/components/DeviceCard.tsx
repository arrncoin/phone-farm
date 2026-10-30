import React, { memo } from 'react';
import {
  Play,
  Square,
  RotateCw,
  Maximize2,
  Wifi,
  Battery,
  Layers,
  Cpu,
  CheckCircle2,
  Circle,
  AlertCircle,
  Clock,
  Music2,
} from 'lucide-react';
import { DeviceInfo, DeviceInputCommand } from '../types/index.ts';

interface DeviceCardProps {
  device: DeviceInfo;
  isSelectedForSync: boolean;
  onToggleSelect: (id: string) => void;
  onOpenDetail: (device: DeviceInfo) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onQuickTap: (id: string, command: DeviceInputCommand) => void;
}

export const DeviceCard: React.FC<DeviceCardProps> = memo(
  ({
    device,
    isSelectedForSync,
    onToggleSelect,
    onOpenDetail,
    onStart,
    onStop,
    onRestart,
    onQuickTap,
  }) => {
    const isOnline = device.status === 'online';
    const isStarting = device.status === 'starting';
    const isOffline = device.status === 'offline';

    // Handle direct click on thumbnail
    const handleScreenClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isOnline) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const normX = Math.max(0, Math.min(1, clickX / rect.width));
      const normY = Math.max(0, Math.min(1, clickY / rect.height));

      onQuickTap(device.id, {
        type: 'tap',
        x: Number(normX.toFixed(3)),
        y: Number(normY.toFixed(3)),
      });
    };

    return (
      <div
        className={`group relative rounded-xl border bg-zinc-900/90 transition-all duration-200 flex flex-col overflow-hidden shadow-md ${
          isSelectedForSync
            ? 'border-emerald-500/80 ring-2 ring-emerald-500/20 shadow-emerald-950/20'
            : isOnline
            ? 'border-zinc-800 hover:border-zinc-700'
            : 'border-zinc-850 opacity-80'
        }`}
      >
        {/* Card Header Bar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/80 bg-zinc-950/60">
          <div className="flex items-center gap-2">
            {/* Sync Checkbox */}
            <button
              onClick={() => onToggleSelect(device.id)}
              className="text-zinc-400 hover:text-emerald-400 transition-colors p-0.5 rounded focus:outline-none"
              title={isSelectedForSync ? 'Deselect from Sync' : 'Select for Sync'}
            >
              {isSelectedForSync ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
              ) : (
                <Circle className="w-4 h-4 text-zinc-600 hover:text-zinc-400" />
              )}
            </button>

            {/* Device Name */}
            <div>
              <span className="font-semibold text-xs text-zinc-100 flex items-center gap-1.5">
                {device.name}
                <span className="font-mono text-[10px] text-zinc-500">:{device.adbPort}</span>
              </span>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase ${
                isOnline
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : isStarting
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isOnline ? 'bg-emerald-400' : isStarting ? 'bg-amber-400' : 'bg-zinc-500'
                }`}
              />
              {device.status}
            </span>
          </div>
        </div>

        {/* Screen Preview Container */}
        <div className="relative p-2.5 flex-1 flex items-center justify-center bg-zinc-950/40">
          <div
            onClick={handleScreenClick}
            className={`relative w-full max-w-[210px] aspect-[9/19.5] rounded-xl overflow-hidden border border-zinc-800 shadow-inner bg-black cursor-crosshair group-hover:border-zinc-700 transition-all ${
              !isOnline ? 'cursor-not-allowed' : ''
            }`}
            title={isOnline ? 'Click anywhere on screen to Tap (Google Pixel 7 Pro)' : 'Device is offline'}
          >
            {/* SVG Screen Rendering */}
            {device.highResFrame ? (
              <img
                src={`data:image/png;base64,${device.highResFrame}`}
                alt={`${device.name} Android screen preview`}
                className="w-full h-full object-contain"
              />
            ) : device.thumbnailSvg ? (
              <div
                className="w-full h-full pointer-events-none select-none flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: device.thumbnailSvg }}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 p-4 text-center">
                <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-xs">No Display Buffer</span>
              </div>
            )}

            {/* Real App Active Badge on Screen */}
            {isOnline && (
              <div className="absolute top-2 left-2 z-10 flex items-center gap-1 pointer-events-none">
                {device.currentApp === 'com.google.android.youtube' && (
                  <span className="px-1.5 py-0.5 rounded bg-red-600/90 text-white font-bold text-[9px] flex items-center gap-1 shadow-sm border border-red-400/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    YouTube
                  </span>
                )}
                {device.currentApp === 'com.zhiliaoapp.musically' && (
                  <span className="px-1.5 py-0.5 rounded bg-cyan-600/90 text-black font-extrabold text-[9px] flex items-center gap-1 shadow-sm border border-cyan-300/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    TikTok
                  </span>
                )}
                {device.currentApp === 'com.android.chrome' && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-600/90 text-white font-bold text-[9px] flex items-center gap-1 shadow-sm">
                    Chrome
                  </span>
                )}
              </div>
            )}

            {/* Quick Touch Hint Overlay on hover */}
            {isOnline && (
              <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <span className="px-2 py-1 rounded bg-black/75 backdrop-blur-sm text-[10px] font-mono text-emerald-300 border border-emerald-500/20">
                  Tap to interact
                </span>
              </div>
            )}

            {/* Inspect / Fullscreen Button on Top Right */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail(device);
              }}
              className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 hover:bg-black/90 border border-zinc-700 text-zinc-300 hover:text-white transition-all shadow-md z-10"
              title="Open Fullscreen Device Control"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Mini Device Metadata & Resources */}
        <div className="px-3 py-2 border-t border-zinc-800/80 bg-zinc-950/70 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="truncate max-w-[140px] text-zinc-300 font-medium flex items-center gap-1">
              <span className="text-emerald-400">Google</span> {device.currentAppName || 'Pixel Launcher'}
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              {device.resolution.width}x{device.resolution.height}
            </span>
          </div>

          {/* CPU & RAM mini bars */}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="flex items-center gap-1.5 bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800">
              <Cpu className="w-3 h-3 text-emerald-400" />
              <span className="text-zinc-400">CPU</span>
              <span className="font-mono text-zinc-200 ml-auto">{isOnline ? `${device.cpuUsage}%` : '0%'}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800">
              <Layers className="w-3 h-3 text-sky-400" />
              <span className="text-zinc-400">RAM</span>
              <span className="font-mono text-zinc-200 ml-auto">
                {isOnline ? `${device.ramUsageMb}M` : '0M'}
              </span>
            </div>
          </div>
        </div>

        {/* Card Footer Quick Action Buttons */}
        <div className="px-2.5 py-1.5 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between gap-1">
          <div className="flex items-center gap-1">
            {isOnline ? (
              <button
                onClick={() => onStop(device.id)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-amber-400 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
                title="Power Off / Stop Emulator"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => onStart(device.id)}
                className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40 transition-colors"
                title="Start / Boot Virtual Device"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => onRestart(device.id)}
              disabled={isOffline}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 disabled:opacity-40 border border-transparent hover:border-zinc-800 transition-colors"
              title="Reboot Device"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            {isOnline && (
              <>
                <button
                  onClick={() => onQuickTap(device.id, { type: 'launch', packageName: 'com.google.android.youtube' })}
                  className="px-1.5 py-1 rounded bg-red-950/50 hover:bg-red-900/80 border border-red-500/40 text-[10px] font-bold text-red-300 transition-colors flex items-center gap-1"
                  title="Launch real YouTube on this device"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  YT
                </button>
                <button
                  onClick={() => onQuickTap(device.id, { type: 'launch', packageName: 'com.zhiliaoapp.musically' })}
                  className="px-1.5 py-1 rounded bg-cyan-950/50 hover:bg-cyan-900/80 border border-cyan-500/40 text-[10px] font-bold text-cyan-300 transition-colors flex items-center gap-1"
                  title="Launch real TikTok on this device"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  TikTok
                </button>
              </>
            )}

            <button
              onClick={() => onOpenDetail(device)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 transition-colors"
            >
              <span>Controls</span>
            </button>
          </div>
        </div>
      </div>
    );
  },
);
