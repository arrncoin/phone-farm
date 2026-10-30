import React from 'react';
import {
  X,
  Globe,
  ExternalLink,
  Shield,
  Copy,
  Check,
} from 'lucide-react';
import { NgrokConfig } from '../types/index.ts';

interface NgrokSettingsModalProps {
  ngrok: NgrokConfig | null;
  onClose: () => void;
}

export const NgrokSettingsModal: React.FC<NgrokSettingsModalProps> = ({ ngrok, onClose }) => {
  const [copiedUrl, setCopiedUrl] = React.useState(false);

  const copyUrl = () => {
    if (ngrok?.publicUrl) {
      navigator.clipboard.writeText(ngrok.publicUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Globe className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100">Ngrok Remote Access Gateway</h2>
              <p className="text-xs text-zinc-400">
                Secure HTTPS tunnel for accessing the Phone Farm dashboard remotely
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
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Active Tunnel Status */}
          <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-[11px] font-semibold uppercase tracking-wider">
                Tunnel Status
              </span>
              <span
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                  ngrok?.status === 'online'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : ngrok?.status === 'error'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    ngrok?.status === 'online'
                      ? 'bg-emerald-400'
                      : ngrok?.status === 'error'
                      ? 'bg-rose-400'
                      : 'bg-zinc-500'
                  }`}
                />
                {ngrok?.status === 'online'
                  ? 'ONLINE (ACTIVE)'
                  : ngrok?.status === 'offline'
                    ? 'CONFIGURED / STATUS UNVERIFIED'
                    : ngrok?.status === 'error'
                      ? 'ERROR'
                      : 'NOT CONFIGURED'}
              </span>
            </div>

            {ngrok?.publicUrl && (
              <div className="space-y-1">
                <span className="text-zinc-400 text-[10px]">PUBLIC HTTPS ENDPOINT</span>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-emerald-400 text-xs">
                  <span className="truncate flex-1">{ngrok.publicUrl}</span>
                  <button
                    onClick={copyUrl}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                    title="Copy URL"
                  >
                    {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a
                    href={ngrok.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-zinc-400 text-[11px] pt-1 border-t border-zinc-850">
              <span>CONFIGURED TOKEN:</span>
              <span className="font-mono text-zinc-300">
                {ngrok?.hasToken ? ngrok.maskedToken : 'No token set'}
              </span>
            </div>
          </div>

          <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2">
            <p className="text-zinc-200 font-semibold">Deployment-managed configuration</p>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              Set <code>NGROK_AUTH_TOKEN</code> in the server&apos;s <code>.env</code>, then start the
              remote profile with <code>docker compose --profile remote up -d</code>. This dashboard
              does not store or apply tunnel credentials at runtime.
            </p>
            <a
              href="https://dashboard.ngrok.com/get-started/your-authtoken"
              target="_blank"
              rel="noreferrer"
              className="text-purple-400 hover:underline inline-flex items-center gap-1"
            >
              Get an ngrok token <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="p-4 bg-zinc-900/40 border border-zinc-800/80 rounded-xl space-y-2">
            <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-emerald-400" />
              Important production limitation
            </span>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              Tunnel status and its public URL are not yet checked against a live ngrok agent. Treat
              this panel as configuration guidance, not an availability monitor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
