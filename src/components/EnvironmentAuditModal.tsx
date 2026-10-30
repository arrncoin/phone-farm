import React, { useState } from 'react';
import {
  X,
  Activity,
  AlertTriangle,
  CheckCircle,
  Cpu,
  Layers,
  Server,
  Terminal,
  ShieldCheck,
  Copy,
  Check,
} from 'lucide-react';
import { EnvironmentAuditReport } from '../types/index.ts';

interface EnvironmentAuditModalProps {
  audit: EnvironmentAuditReport | null;
  onClose: () => void;
}

export const EnvironmentAuditModal: React.FC<EnvironmentAuditModalProps> = ({
  audit,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!audit) return null;

  const copyDeployCommand = () => {
    const cmd = `cp .env.example .env\n# Set a strong DASHBOARD_PASSWORD and SESSION_SECRET in .env\ngetent group kvm\nls -l /dev/kvm\ndocker compose up -d --build`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100">
                Tahap 1 — Host Environment &amp; Virtualization Audit
              </h2>
              <p className="text-xs text-zinc-400">
                KVM access, CPU/RAM limits, and estimated emulator capacity
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Status Banner */}
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              audit.kvmSupported
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-950/20 border-amber-500/30 text-amber-300'
            }`}
          >
            {audit.kvmSupported ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <span className="font-bold text-sm block">
                {audit.androidRuntimeEnabled
                  ? audit.executionEngine === 'kvm_accelerated_qemu'
                    ? 'Android Emulator runtime capacity available'
                    : 'Android Emulator configured, but capacity is unavailable'
                  : audit.kvmSupported ? 'KVM available; development simulator is active' : 'KVM unavailable; development simulator is active'}
              </span>
              <p className="text-zinc-300 leading-relaxed">
                {audit.feasibility10Devices.summary}
              </p>
            </div>
          </div>

          {/* Hardware Spec Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-semibold uppercase">CPU Cores</span>
              </div>
              <span className="text-base font-bold font-mono text-zinc-100">
                {audit.cpuCores} vCPUs
              </span>
              <span className="text-[10px] text-zinc-500 block">{audit.arch}</span>
            </div>

            <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[10px] font-semibold uppercase">Host RAM</span>
              </div>
              <span className="text-base font-bold font-mono text-zinc-100">
                {Math.round(audit.totalRamMb / 1024 * 10) / 10} GB
              </span>
              <span className="text-[10px] text-zinc-500 block">
                Free: {Math.round(audit.freeRamMb / 1024 * 10) / 10} GB
              </span>
            </div>

            <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Server className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[10px] font-semibold uppercase">Kernel / OS</span>
              </div>
              <span className="text-xs font-mono text-zinc-200 truncate block">
                {audit.isGvisor ? 'gVisor Sandbox' : audit.hostOs}
              </span>
              <span className="text-[10px] text-zinc-500 block truncate">{audit.kernel}</span>
            </div>

            <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-semibold uppercase">/dev/kvm Device</span>
              </div>
              <span className={`text-xs font-bold font-mono block ${audit.kvmSupported ? 'text-emerald-400' : 'text-amber-400'}`}>
                {audit.kvmSupported ? 'Available (RW)' : audit.kvmPathFound ? 'Permission denied' : 'Not found'}
              </span>
              <span className="text-[10px] text-zinc-500 block">QEMU Accel</span>
            </div>
          </div>

          {/* Engineering Analysis & Honest Recommendations */}
          <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2">
            <h4 className="font-semibold text-zinc-200 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Android Emulator Capacity Estimate</span>
            </h4>
            <ul className="space-y-1.5 text-zinc-300 list-disc list-inside">
              {audit.recommendations.map((rec, i) => (
                <li key={i} className="leading-relaxed">
                  {rec}
                </li>
              ))}
            </ul>
          </div>

          {/* Resource Profiles */}
          <div className="space-y-2">
            <h4 className="font-semibold text-zinc-200">
              Configured Emulator Profile
            </h4>
            <div className="grid grid-cols-1 gap-3">
              {audit.profiles.map((p) => (
                <div
                  key={p.id}
                  className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-xl space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-200">{p.name.split(' ')[0]}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {p.resolution}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 space-y-0.5 font-mono">
                    <div>CPU: {p.vCpuPerDevice} vCPU / device</div>
                    <div>RAM: {p.ramPerDeviceMb} MB / device</div>
                    <div>Est. Total Host RAM: {Math.round(p.estimatedRamTotalMb / 1024)} GB</div>
                    <div>Screenshot stream: {p.fpsLimit} FPS maximum</div>
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-tight pt-1 border-t border-zinc-800">
                    {p.notes}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Bare-Metal Deployment Script */}
          <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-200 text-xs">
                Deploy Android Emulator Runtime (Docker Compose)
              </span>
              <button
                onClick={copyDeployCommand}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Commands'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-zinc-950 border border-zinc-850 font-mono text-[11px] text-emerald-400 overflow-x-auto leading-relaxed">
{`cp .env.example .env
# Set credentials and KVM_GID in .env; then verify KVM access
getent group kvm
ls -l /dev/kvm

# Build and start the configured emulator capacity
docker compose up -d --build`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
