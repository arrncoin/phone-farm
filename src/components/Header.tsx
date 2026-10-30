import React from 'react';
import {
  Smartphone,
  Cpu,
  Layers,
  Terminal,
  Activity,
  Globe,
  RefreshCw,
  Sliders,
  CheckSquare,
  Package,
} from 'lucide-react';
import { SystemStats, EnvironmentAuditReport, NgrokConfig } from '../types/index.ts';

interface HeaderProps {
  stats: SystemStats | null;
  audit: EnvironmentAuditReport | null;
  ngrok: NgrokConfig | null;
  layoutCols: 2 | 3 | 5;
  setLayoutCols: (cols: 2 | 3 | 5) => void;
  syncMode: boolean;
  setSyncMode: (val: boolean) => void;
  selectedCount: number;
  onOpenAudit: () => void;
  onOpenNgrok: () => void;
  onOpenLogs: () => void;
  onOpenApkManager: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  audit,
  ngrok,
  layoutCols,
  setLayoutCols,
  syncMode,
  setSyncMode,
  selectedCount,
  onOpenAudit,
  onOpenNgrok,
  onOpenLogs,
  onOpenApkManager,
  onRefresh,
  isRefreshing,
}) => {
  const onlineCount = stats?.onlineCount ?? 0;
  const totalCount = stats?.totalCount ?? 10;
  const cpuPercent = stats?.cpuPercent ?? 0;
  const ramUsed = stats?.ramUsedMb ?? 0;
  const ramTotal = stats?.ramTotalMb ?? 0;
  const ramPercent = Math.min(100, Math.round((ramUsed / (ramTotal || 1)) * 100));

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Brand & Status */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-black font-bold">
              <Smartphone className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-zinc-100">
                  FARM DROID <span className="text-emerald-400">ANDROID</span>
                </h1>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {audit?.androidRuntimeEnabled ? 'ANDROID EMULATOR' : 'DEV SIMULATOR'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {onlineCount}/{totalCount} Online
                </span>
                <span className="text-zinc-600">•</span>
                <button
                  onClick={onOpenAudit}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors text-left flex items-center gap-1 text-[11px]"
                  title="Click to view hardware virtualization status"
                >
                  <Activity className="w-3 h-3 text-sky-400" />
                  {audit?.androidRuntimeEnabled
                    ? audit.executionEngine === 'kvm_accelerated_qemu' ? 'KVM Emulator' : 'Emulator capacity unavailable'
                    : audit?.kvmSupported ? 'KVM Available' : 'KVM Unavailable'}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Refresh Button */}
          <button
            onClick={onRefresh}
            className="md:hidden p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Telemetry Resource Badges */}
        <div className="hidden lg:flex items-center gap-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl px-3.5 py-1.5">
          {/* Host CPU */}
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                <span>CPU Host</span>
                <span className="font-mono text-zinc-200">{cpuPercent}%</span>
              </div>
              <div className="w-20 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    cpuPercent > 80 ? 'bg-red-500' : cpuPercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${cpuPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="w-px h-6 bg-zinc-800" />

          {/* Host RAM */}
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                <span>RAM Total</span>
                <span className="font-mono text-zinc-200">
                  {Math.round(ramUsed / 1024 * 10) / 10} / {Math.round(ramTotal / 1024)}GB
                </span>
              </div>
              <div className="w-20 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    ramPercent > 85 ? 'bg-red-500' : ramPercent > 65 ? 'bg-amber-500' : 'bg-sky-500'
                  }`}
                  style={{ width: `${ramPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="w-px h-6 bg-zinc-800" />

          {/* Ngrok Gateway Status */}
          <button
            onClick={onOpenNgrok}
            className="flex items-center gap-2 text-left group hover:opacity-85 transition-opacity"
          >
            <Globe className="w-4 h-4 text-purple-400" />
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-400">Ngrok HTTPS</span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    ngrok?.status === 'online'
                      ? 'bg-emerald-400'
                      : ngrok?.status === 'error'
                      ? 'bg-red-400'
                      : 'bg-amber-400'
                  }`}
                />
                <span className="text-xs font-mono font-medium text-zinc-200">
                  {ngrok?.status === 'online' ? 'Online' : 'Configure'}
                </span>
              </div>
            </div>
          </button>
        </div>

        {/* Controls, Grid Switcher, Sync Toggle */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          {/* Layout Grid Buttons */}
          <div className="hidden sm:flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setLayoutCols(2)}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${
                layoutCols === 2 ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="2 Columns Grid"
            >
              2 Col
            </button>
            <button
              onClick={() => setLayoutCols(3)}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${
                layoutCols === 3 ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="3 Columns Grid (Default)"
            >
              3 Col
            </button>
            <button
              onClick={() => setLayoutCols(5)}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${
                layoutCols === 5 ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="5 Columns Grid (Compact 10 Overview)"
            >
              5 Col
            </button>
          </div>

          {!audit?.androidRuntimeEnabled && (
            <button
              onClick={onOpenApkManager}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all shadow-sm"
              title="Buka Android APK & Package Manager"
            >
              <Package className="w-3.5 h-3.5" />
              <span>Pasang APK</span>
            </button>
          )}

          {/* Sync Mode Toggle Button */}
          <button
            onClick={() => setSyncMode(!syncMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
              syncMode
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-zinc-950 font-bold shadow-emerald-500/20'
                : 'bg-zinc-900 border border-zinc-700 hover:border-zinc-600 text-zinc-200'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Sync Control</span>
            {selectedCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-black/20 text-[10px] font-mono">
                {selectedCount}
              </span>
            )}
          </button>

          {/* System Audit Button */}
          <button
            onClick={onOpenAudit}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-colors"
            title="System & KVM Environment Audit"
          >
            <Sliders className="w-4 h-4 text-sky-400" />
          </button>

          {/* Logs Button */}
          <button
            onClick={onOpenLogs}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-colors"
            title="Audit Logs & ADB Commands"
          >
            <Terminal className="w-4 h-4 text-emerald-400" />
          </button>

          {/* Desktop Refresh Button */}
          <button
            onClick={onRefresh}
            className="hidden md:flex p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
            title="Refresh All Devices"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
};
