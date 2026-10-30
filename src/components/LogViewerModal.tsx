import React, { useState } from 'react';
import {
  X,
  Terminal,
  Trash2,
  Download,
  Filter,
  Search,
  CheckCircle,
  AlertTriangle,
  Info,
  Bug,
} from 'lucide-react';
import { AuditLogEntry, DeviceInfo } from '../types/index.ts';

interface LogViewerModalProps {
  logs: AuditLogEntry[];
  devices: DeviceInfo[];
  onClose: () => void;
  onClearLogs: () => Promise<void>;
}

export const LogViewerModal: React.FC<LogViewerModalProps> = ({
  logs,
  devices,
  onClose,
  onClearLogs,
}) => {
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter((log) => {
    if (selectedDevice !== 'all' && log.deviceId !== selectedDevice) return false;
    if (selectedLevel !== 'all' && log.level !== selectedLevel) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        (log.deviceId && log.deviceId.toLowerCase().includes(q)) ||
        log.source.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const exportLogs = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `phone-farm-audit-logs-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Terminal className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-100">Live Audit Logs &amp; ADB Event Stream</h2>
                <span className="font-mono text-xs text-zinc-400">({filteredLogs.length} events)</span>
              </div>
              <p className="text-xs text-zinc-400">
                Synchronized actions, adbd commands, health telemetry, and security events
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
              title="Export as JSON"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
            <button
              onClick={onClearLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950/40 hover:text-rose-400 text-zinc-400 text-xs font-medium transition-colors"
              title="Clear Log History"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="px-5 py-2.5 border-b border-zinc-850 bg-zinc-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Device filter */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1">
              <span className="text-zinc-500 text-[11px]">Device:</span>
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="bg-transparent text-zinc-200 font-mono text-xs focus:outline-none"
              >
                <option value="all" className="bg-zinc-900">All Devices</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id} className="bg-zinc-900">
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Level filter */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1">
              <span className="text-zinc-500 text-[11px]">Level:</span>
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="bg-transparent text-zinc-200 font-mono text-xs focus:outline-none"
              >
                <option value="all" className="bg-zinc-900">All Levels</option>
                <option value="info" className="bg-zinc-900">INFO</option>
                <option value="warn" className="bg-zinc-900">WARN</option>
                <option value="error" className="bg-zinc-900">ERROR</option>
                <option value="debug" className="bg-zinc-900">DEBUG</option>
              </select>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by keyword..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Log Stream Output */}
        <div className="flex-1 overflow-y-auto p-4 bg-zinc-950 font-mono text-xs space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-zinc-600">
              No log entries match the selected filters.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const timeStr = new Date(log.timestamp).toLocaleTimeString();
              return (
                <div
                  key={log.id}
                  className="px-2.5 py-1.5 rounded hover:bg-zinc-900/60 transition-colors flex items-start gap-2 border-l-2 border-transparent hover:border-zinc-700"
                >
                  <span className="text-zinc-600 shrink-0 text-[11px]">{timeStr}</span>

                  <span
                    className={`px-1 rounded text-[10px] font-bold uppercase shrink-0 ${
                      log.level === 'info'
                        ? 'text-emerald-400 bg-emerald-500/10'
                        : log.level === 'warn'
                        ? 'text-amber-400 bg-amber-500/10'
                        : log.level === 'error'
                        ? 'text-rose-400 bg-rose-500/10'
                        : 'text-zinc-400 bg-zinc-800'
                    }`}
                  >
                    {log.level}
                  </span>

                  <span className="text-sky-400/90 shrink-0 text-[11px]">[{log.source.toUpperCase()}]</span>

                  {log.deviceId && (
                    <span className="text-purple-400 shrink-0 text-[11px]">
                      {log.deviceId}
                    </span>
                  )}

                  <span className="text-zinc-300 break-all flex-1">{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
