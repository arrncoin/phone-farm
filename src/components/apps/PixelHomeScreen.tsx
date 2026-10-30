import React from 'react';
import { DeviceInfo } from '../../types/index.ts';
import { Play, Music2, Globe, Settings, Terminal, Download, Phone, Camera, Search, Folder, ShieldCheck } from 'lucide-react';

interface PixelHomeScreenProps {
  device: DeviceInfo;
  onLaunchApp: (pkg: string) => void;
}

export const PixelHomeScreen: React.FC<PixelHomeScreenProps> = ({ device, onLaunchApp }) => {
  const userInstalledApps = (device.installedPackages || []).filter((p) => !p.isSystem);

  return (
    <div className="relative w-full h-full bg-[#141a18] text-white flex flex-col font-sans select-none overflow-hidden justify-between p-4 bg-gradient-to-b from-[#182320] via-[#121816] to-[#0d1210]">
      {/* Top Section: Pixel At A Glance Widget */}
      <div className="space-y-1 pt-6">
        <div className="text-3xl font-light tracking-tight text-zinc-100">14:32</div>
        <div className="text-xs font-medium text-emerald-200/90 flex items-center gap-1.5">
          <span>Wed, Oct 28</span>
          <span>•</span>
          <span>24°C Sunny ☀️</span>
        </div>
        <div className="pt-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Google Tensor G2 • {device.installedPackages?.length || 7} Apps Active</span>
          </div>
        </div>
      </div>

      {/* Main Apps Grid */}
      <div className="grid grid-cols-4 gap-y-5 gap-x-2 my-auto px-1">
        {/* Real App 1: YouTube */}
        <button
          onClick={() => onLaunchApp('com.google.android.youtube')}
          className="flex flex-col items-center gap-1.5 group cursor-pointer"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#FF0000] border border-red-400/40 flex items-center justify-center text-white shadow-lg shadow-red-950/40 group-hover:scale-105 group-active:scale-95 transition-transform">
            <Play className="w-6 h-6 fill-white ml-0.5" />
          </div>
          <span className="text-[11px] font-medium text-zinc-200 group-hover:text-white truncate">
            YouTube
          </span>
        </button>

        {/* Real App 2: TikTok */}
        <button
          onClick={() => onLaunchApp('com.zhiliaoapp.musically')}
          className="flex flex-col items-center gap-1.5 group cursor-pointer"
        >
          <div className="w-12 h-12 rounded-2xl bg-black border-2 border-[#00F2FE] flex items-center justify-center text-[#FE2C55] shadow-lg shadow-cyan-950/40 group-hover:scale-105 group-active:scale-95 transition-transform relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-[#00F2FE]/20 to-[#FE2C55]/20 pointer-events-none" />
            <Music2 className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-medium text-zinc-200 group-hover:text-white truncate">
            TikTok
          </span>
        </button>

        {/* Real App 3: Google Chrome */}
        <button
          onClick={() => onLaunchApp('com.android.chrome')}
          className="flex flex-col items-center gap-1.5 group cursor-pointer"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#34A853] border border-emerald-400/30 flex items-center justify-center text-white shadow-lg shadow-emerald-950/40 group-hover:scale-105 group-active:scale-95 transition-transform">
            <Globe className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-medium text-zinc-200 group-hover:text-white truncate">
            Chrome
          </span>
        </button>

        {/* Real App 4: Settings */}
        <button
          onClick={() => onLaunchApp('com.android.settings')}
          className="flex flex-col items-center gap-1.5 group cursor-pointer"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#374151] border border-zinc-600 flex items-center justify-center text-zinc-200 shadow-lg group-hover:scale-105 group-active:scale-95 transition-transform">
            <Settings className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-medium text-zinc-200 group-hover:text-white truncate">
            Settings
          </span>
        </button>

        {/* Real App 5: Termux */}
        <button
          onClick={() => onLaunchApp('com.termux')}
          className="flex flex-col items-center gap-1.5 group cursor-pointer"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#022c22] border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-mono font-bold text-base shadow-lg group-hover:scale-105 group-active:scale-95 transition-transform">
            &gt;_
          </div>
          <span className="text-[11px] font-medium text-zinc-200 group-hover:text-white truncate">
            Termux
          </span>
        </button>

        {/* Real App 6: F-Droid */}
        <button
          onClick={() => onLaunchApp('org.fdroid.fdroid')}
          className="flex flex-col items-center gap-1.5 group cursor-pointer"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#0284c7] border border-sky-400/40 flex items-center justify-center text-white shadow-lg group-hover:scale-105 group-active:scale-95 transition-transform">
            <Download className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-medium text-zinc-200 group-hover:text-white truncate">
            F-Droid
          </span>
        </button>

        {/* Dynamic User Installed APKs */}
        {userInstalledApps.slice(0, 6).map((app) => (
          <button
            key={app.packageName}
            onClick={() => onLaunchApp(app.packageName)}
            className="flex flex-col items-center gap-1.5 group cursor-pointer"
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg group-hover:scale-105 group-active:scale-95 transition-transform"
              style={{ backgroundColor: app.color || '#3B82F6' }}
            >
              {app.name.charAt(0)}
            </div>
            <span className="text-[11px] font-medium text-zinc-200 group-hover:text-white truncate max-w-[60px]">
              {app.name}
            </span>
          </button>
        ))}
      </div>

      {/* Bottom Section: Google Search Bar & Dock */}
      <div className="space-y-3 pt-2">
        {/* Google Pixel Search Pill Bar */}
        <button
          onClick={() => onLaunchApp('com.android.chrome')}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-full bg-[#2d3732]/90 border border-emerald-500/20 text-xs text-zinc-400 hover:border-emerald-500/40 transition-colors shadow-lg"
        >
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[#4285F4] text-sm">G</span>
            <span className="text-[11px] text-zinc-400">Search Pixel or web...</span>
          </div>
          <Search className="w-3.5 h-3.5 text-zinc-400" />
        </button>

        {/* Bottom App Dock (Phone, Chrome, YouTube, TikTok, Camera) */}
        <div className="flex items-center justify-around py-1.5 px-2 bg-black/40 backdrop-blur-md rounded-3xl border border-zinc-800">
          <button
            onClick={() => onLaunchApp('com.google.android.youtube')}
            className="w-10 h-10 rounded-xl bg-[#FF0000] flex items-center justify-center text-white shadow hover:scale-105 transition-transform"
            title="Launch YouTube"
          >
            <Play className="w-5 h-5 fill-white ml-0.5" />
          </button>
          <button
            onClick={() => onLaunchApp('com.zhiliaoapp.musically')}
            className="w-10 h-10 rounded-xl bg-black border border-[#00F2FE] flex items-center justify-center text-[#FE2C55] shadow hover:scale-105 transition-transform"
            title="Launch TikTok"
          >
            <Music2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => onLaunchApp('com.android.chrome')}
            className="w-10 h-10 rounded-xl bg-[#34A853] flex items-center justify-center text-white shadow hover:scale-105 transition-transform"
            title="Launch Google Chrome"
          >
            <Globe className="w-5 h-5" />
          </button>
          <button
            onClick={() => onLaunchApp('com.android.settings')}
            className="w-10 h-10 rounded-xl bg-zinc-700 flex items-center justify-center text-zinc-200 shadow hover:scale-105 transition-transform"
            title="Launch Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
