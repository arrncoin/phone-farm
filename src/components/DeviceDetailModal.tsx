import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  RotateCw,
  Smartphone,
  Send,
  Camera,
  Power,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  Terminal,
  Info,
  Maximize2,
  Wifi,
  Battery,
  Package,
  Trash2,
  Download,
  Music2,
  Globe,
} from 'lucide-react';
import { DeviceInfo, DeviceInputCommand } from '../types/index.ts';
import { openPlayStoreListing, uninstallPackage, wsClient } from '../services/api.ts';
import { YouTubeApp } from './apps/YouTubeApp.tsx';
import { TikTokApp } from './apps/TikTokApp.tsx';
import { ChromeApp } from './apps/ChromeApp.tsx';
import { PixelHomeScreen } from './apps/PixelHomeScreen.tsx';

interface DeviceDetailModalProps {
  device: DeviceInfo | null;
  onClose: () => void;
  onSendCommand: (deviceId: string, command: DeviceInputCommand) => void;
  onOpenApkManager?: (deviceId: string) => void;
}

export const DeviceDetailModal: React.FC<DeviceDetailModalProps> = ({
  device,
  onClose,
  onSendCommand,
  onOpenApkManager,
}) => {
  const [inputText, setInputText] = useState('');
  const [playStoreMessage, setPlayStoreMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'control' | 'apps' | 'logcat' | 'specs'>('control');
  const screenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!device) return;
    wsClient.send({ type: 'SUBSCRIBE_DEVICE', deviceId: device.id });
    return () => wsClient.send({ type: 'UNSUBSCRIBE_DEVICE', deviceId: device.id });
  }, [device?.id]);

  if (!device) return null;

  const isPortrait = device.orientation === 'portrait';
  const isVirtualAndroid = device.model.includes('(virtual AVD profile)');

  const handleOpenPlayStore = async (packageName: string) => {
    setPlayStoreMessage('');
    try {
      await openPlayStoreListing(device.id, packageName);
      setPlayStoreMessage('Google Play opened. Finish installing on the device screen.');
    } catch (error) {
      setPlayStoreMessage(error instanceof Error ? error.message : 'Unable to open Google Play.');
    }
  };

  // Handle direct click/touch on the high-res canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (device.status !== 'online') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const normX = Math.max(0, Math.min(1, clickX / rect.width));
    const normY = Math.max(0, Math.min(1, clickY / rect.height));

    onSendCommand(device.id, {
      type: 'tap',
      x: Number(normX.toFixed(3)),
      y: Number(normY.toFixed(3)),
    });
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendCommand(device.id, {
      type: 'text',
      text: inputText.trim(),
    });
    setInputText('');
  };

  const handleKeyevent = (code: string) => {
    onSendCommand(device.id, {
      type: 'key',
      keycode: code,
    });
  };

  const handleAppLaunch = (pkg: string) => {
    onSendCommand(device.id, {
      type: 'launch',
      packageName: pkg,
    });
  };

  const handleSwipe = (direction: 'up' | 'down' | 'left' | 'right') => {
    const coords = {
      up: { startX: 0.5, startY: 0.8, endX: 0.5, endY: 0.2 },
      down: { startX: 0.5, startY: 0.2, endX: 0.5, endY: 0.8 },
      left: { startX: 0.8, startY: 0.5, endX: 0.2, endY: 0.5 },
      right: { startX: 0.2, startY: 0.5, endX: 0.8, endY: 0.5 },
    }[direction];

    onSendCommand(device.id, {
      type: 'swipe',
      ...coords,
      durationMs: 300,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-100">{device.name}</h2>
                <span className="font-mono text-xs text-zinc-400">({device.ip}:{device.adbPort})</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                    device.status === 'online'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {device.status}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Active: {device.currentAppName} • {device.resolution.width}x{device.resolution.height} •{' '}
                {device.orientation}
              </p>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Split view (Screen on left, Controls & Logcat on right) */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Left Column: Interactive Phone Screen */}
          <div className="md:col-span-5 flex flex-col items-center">
            <div className="relative w-full max-w-[270px]">
              {/* Outer Pixel 7 Pro Phone Bezel */}
              <div className="relative p-2 rounded-[40px] bg-zinc-900 border-[3.5px] border-zinc-700 shadow-2xl">
                {/* Speaker Ear Notch */}
                <div className="w-14 h-1.5 bg-zinc-800 rounded-full mx-auto mb-1.5" />

                {/* Live Display Canvas */}
                <div
                  ref={screenRef}
                  className="relative w-full aspect-[9/19.5] rounded-3xl overflow-hidden bg-black border border-zinc-800 shadow-inner select-none"
                  title="Interactive touch screen (Google Pixel 7 Pro)"
                >
                  {device.status !== 'online' ? (
                    device.thumbnailSvg ? (
                      <div
                        className="w-full h-full pointer-events-none"
                        dangerouslySetInnerHTML={{ __html: device.thumbnailSvg }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                        Device Offline
                      </div>
                    )
                  ) : device.highResFrame ? (
                    <img
                      src={`data:image/png;base64,${device.highResFrame}`}
                      alt={`${device.name} live Android screen`}
                      onClick={handleCanvasClick}
                      className="w-full h-full object-contain cursor-crosshair"
                    />
                  ) : isVirtualAndroid ? (
                    <div className="w-full h-full flex items-center justify-center p-5 text-center text-xs text-zinc-400">
                      Waiting for the Android emulator screen...
                    </div>
                  ) : device.currentApp === 'com.google.android.youtube' ? (
                    <YouTubeApp deviceId={device.id} />
                  ) : device.currentApp === 'com.zhiliaoapp.musically' ? (
                    <TikTokApp deviceId={device.id} />
                  ) : device.currentApp === 'com.android.chrome' ? (
                    <ChromeApp deviceId={device.id} onNavigateApp={handleAppLaunch} />
                  ) : device.currentApp === 'com.android.launcher' ? (
                    <PixelHomeScreen device={device} onLaunchApp={handleAppLaunch} />
                  ) : device.thumbnailSvg ? (
                    <div
                      onClick={handleCanvasClick}
                      className="w-full h-full cursor-crosshair"
                      dangerouslySetInnerHTML={{ __html: device.thumbnailSvg }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                      No Video Signal
                    </div>
                  )}
                </div>

                {/* Bottom Navigation Bar Hardware Buttons */}
                <div className="mt-2.5 pt-1.5 pb-0.5 flex items-center justify-around border-t border-zinc-800">
                  <button
                    onClick={() => handleKeyevent('BACK')}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                    title="Back (KEYCODE_BACK)"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleKeyevent('HOME')}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                    title="Home (KEYCODE_HOME)"
                  >
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-400 hover:border-white" />
                  </button>
                  <button
                    onClick={() => handleKeyevent('RECENTS')}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                    title="Recents (KEYCODE_APP_SWITCH)"
                  >
                    <div className="w-3.5 h-3.5 rounded-sm border-2 border-zinc-400 hover:border-white" />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Swipe Gesture Pad */}
            <div className="w-full max-w-[280px] mt-4 p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-400 block mb-2 text-center">
                Swipe Gestures
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  onClick={() => handleSwipe('up')}
                  className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium transition-colors"
                >
                  ▲ Up
                </button>
                <button
                  onClick={() => handleSwipe('down')}
                  className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium transition-colors"
                >
                  ▼ Down
                </button>
                <button
                  onClick={() => handleSwipe('left')}
                  className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium transition-colors"
                >
                  ◄ Left
                </button>
                <button
                  onClick={() => handleSwipe('right')}
                  className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium transition-colors"
                >
                  ► Right
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Controls, Fast App Switcher, Text Input & Terminal */}
          <div className="md:col-span-7 flex flex-col gap-4">
            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-zinc-800 pb-2">
              <button
                onClick={() => setActiveTab('control')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'control'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Device Controls
              </button>
              <button
                onClick={() => setActiveTab('apps')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'apps'
                    ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Apps &amp; APKs ({device.installedPackages?.length || 0})</span>
              </button>
              <button
                onClick={() => setActiveTab('logcat')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'logcat'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Logcat Stream
              </button>
              <button
                onClick={() => setActiveTab('specs')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'specs'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Hardware Specs
              </button>
            </div>

            {activeTab === 'control' && (
              <div className="flex flex-col gap-4">
                {/* Hardware Keys Toolbar */}
                <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-400 block">
                    Hardware Control Keys
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => onSendCommand(device.id, { type: 'rotate' })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 font-medium border border-zinc-700 transition-colors"
                      title="Rotate Screen"
                    >
                      <RotateCw className="w-3.5 h-3.5 text-sky-400" />
                      Rotate
                    </button>
                    <button
                      onClick={() => handleKeyevent('POWER')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 font-medium border border-zinc-700 transition-colors"
                    >
                      <Power className="w-3.5 h-3.5 text-amber-400" />
                      Power Key
                    </button>
                    <button
                      onClick={() => handleKeyevent('VOLUME_UP')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 font-medium border border-zinc-700 transition-colors"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                      Vol +
                    </button>
                    <button
                      onClick={() => handleKeyevent('VOLUME_DOWN')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 font-medium border border-zinc-700 transition-colors"
                    >
                      <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
                      Vol -
                    </button>
                    <button
                      onClick={() => onSendCommand(device.id, { type: 'reboot' })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 font-medium border border-zinc-700 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                      Reboot
                    </button>
                  </div>
                </div>

                {/* Quick App Launcher */}
                <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-400 block">
                    Fast App Launcher (ADB monkey)
                  </span>
                  {isVirtualAndroid ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleAppLaunch('com.google.android.youtube')}
                          className="rounded-lg border border-red-500/40 bg-red-950/40 p-2 text-left text-xs font-semibold text-white"
                        >
                          Open YouTube
                        </button>
                        <button
                          onClick={() => handleAppLaunch('com.zhiliaoapp.musically')}
                          className="rounded-lg border border-cyan-500/40 bg-cyan-950/40 p-2 text-left text-xs font-semibold text-white"
                        >
                          Open TikTok
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          disabled={device.status !== 'online'}
                          onClick={() => void handleOpenPlayStore('com.google.android.youtube')}
                          className="rounded-lg border border-zinc-700 bg-zinc-800 p-2 text-xs text-zinc-200 disabled:opacity-50"
                        >
                          Install YouTube
                        </button>
                        <button
                          disabled={device.status !== 'online'}
                          onClick={() => void handleOpenPlayStore('com.zhiliaoapp.musically')}
                          className="rounded-lg border border-zinc-700 bg-zinc-800 p-2 text-xs text-zinc-200 disabled:opacity-50"
                        >
                          Install TikTok
                        </button>
                      </div>
                      {playStoreMessage && <p role="status" className="text-[11px] text-zinc-400">{playStoreMessage}</p>}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {/* YouTube Real App Button */}
                    <button
                      onClick={() => handleAppLaunch('com.google.android.youtube')}
                      className="flex items-center gap-2 p-2 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-left transition-colors shadow-sm"
                    >
                      <div className="w-6 h-6 rounded bg-[#FF0000] text-white flex items-center justify-center text-xs font-bold shrink-0">
                        <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
                      </div>
                      <span className="text-xs text-white font-bold truncate">YouTube</span>
                    </button>

                    {/* TikTok Real App Button */}
                    <button
                      onClick={() => handleAppLaunch('com.zhiliaoapp.musically')}
                      className="flex items-center gap-2 p-2 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/40 text-left transition-colors shadow-sm"
                    >
                      <div className="w-6 h-6 rounded bg-black border border-[#00F2FE] text-[#FE2C55] flex items-center justify-center text-xs font-bold shrink-0">
                        <Music2 className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs text-white font-bold truncate">TikTok</span>
                    </button>

                    {/* Chrome App Button */}
                    <button
                      onClick={() => handleAppLaunch('com.android.chrome')}
                      className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-left transition-colors"
                    >
                      <div className="w-6 h-6 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                        <Globe className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs text-zinc-200 font-medium truncate">Chrome</span>
                    </button>

                    {/* Pixel Launcher Home */}
                    <button
                      onClick={() => handleAppLaunch('com.android.launcher')}
                      className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-left transition-colors"
                    >
                      <div className="w-6 h-6 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">
                        ⌂
                      </div>
                      <span className="text-xs text-zinc-200 font-medium truncate">Launcher</span>
                    </button>

                    {/* Settings Button */}
                    <button
                      onClick={() => handleAppLaunch('com.android.settings')}
                      className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-left transition-colors"
                    >
                      <div className="w-6 h-6 rounded bg-zinc-700 text-zinc-300 flex items-center justify-center text-xs font-bold shrink-0">
                        ⚙
                      </div>
                      <span className="text-xs text-zinc-200 font-medium truncate">Settings</span>
                    </button>

                    {/* ADB Terminal */}
                    <button
                      onClick={() => handleAppLaunch('com.android.terminal')}
                      className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-left transition-colors"
                    >
                      <div className="w-6 h-6 rounded bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0">
                        &gt;_
                      </div>
                      <span className="text-xs text-zinc-200 font-medium truncate">ADB Shell</span>
                    </button>

                    <button
                      onClick={() => handleAppLaunch('com.android.dialer')}
                      className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-left transition-colors"
                    >
                      <div className="w-6 h-6 rounded bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">
                        📞
                      </div>
                      <span className="text-xs text-zinc-200 font-medium">Phone</span>
                    </button>

                    {/* Dynamic User Installed Packages */}
                    {device.installedPackages
                      ?.filter((p) => !p.isSystem)
                      .map((p) => (
                        <button
                          key={p.packageName}
                          onClick={() => handleAppLaunch(p.packageName)}
                          className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 text-left transition-colors"
                        >
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm"
                            style={{ backgroundColor: p.color || '#10B981' }}
                          >
                            {p.name.charAt(0)}
                          </div>
                          <span className="text-xs text-zinc-200 font-medium truncate">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Text & URL Input Box */}
                <form
                  onSubmit={handleSendText}
                  className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2"
                >
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-400 block">
                    Remote Text Input / URL Opener (adb shell input text)
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Type message or URL to inject..."
                      className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold rounded-lg text-xs transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'apps' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                  <div className="text-xs">
                    <span className="font-bold text-zinc-200 block">
                      Paket Terpasang pada {device.name}
                    </span>
                    <span className="text-zinc-500 text-[11px]">
                      {device.installedPackages?.length || 0} aplikasi (
                      {device.installedPackages?.filter((p) => !p.isSystem).length || 0} user APKs)
                    </span>
                  </div>
                  {onOpenApkManager && (
                    <button
                      onClick={() => onOpenApkManager(device.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs shadow-sm transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Pasang APK Baru</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-[380px] overflow-y-auto">
                  {(device.installedPackages || []).map((pkg) => (
                    <div
                      key={pkg.packageName}
                      className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shrink-0 text-xs shadow-sm"
                          style={{ backgroundColor: pkg.color || '#3B82F6' }}
                        >
                          {pkg.name ? pkg.name.charAt(0).toUpperCase() : 'A'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-100 truncate">{pkg.name}</span>
                            <span className="font-mono text-[10px] text-zinc-400">v{pkg.version}</span>
                            {pkg.isSystem ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
                                SYSTEM
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                APK
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-zinc-500 block truncate">
                            {pkg.packageName} • {pkg.sizeMb} MB
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleAppLaunch(pkg.packageName)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs transition-colors"
                          title="Buka aplikasi di layar"
                        >
                          <Play className="w-3 h-3 text-emerald-400" />
                          <span>Buka</span>
                        </button>
                        {!pkg.isSystem && (
                          <button
                            onClick={async () => {
                              await uninstallPackage(device.id, pkg.packageName);
                              // close or reload happens via WebSocket device update
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs transition-colors"
                            title="Copot APK (pm uninstall)"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Copot</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'logcat' && (
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-400">
                Live Android logcat streaming is not available yet. Device control and screenshots use
                the Android emulator runtime directly.
              </div>
            )}

            {activeTab === 'specs' && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-bold text-xs text-emerald-300">
                      {isVirtualAndroid ? 'Pixel 7 Pro display profile (virtual)' : 'Google Pixel 7 Pro simulator'}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    {isVirtualAndroid ? 'ANDROID EMULATOR' : 'SIMULATED PROFILE'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl text-xs">
                  <div>
                    <span className="text-zinc-500 block text-[10px]">DEVICE MODEL</span>
                    <span className="font-mono text-zinc-100 font-semibold">{device.model || 'Google Pixel 7 Pro'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">AVD ARCHITECTURE</span>
                    <span className="font-mono text-zinc-200">{device.codename}{isVirtualAndroid ? ' • x86_64 virtual CPU' : ''}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">SERIAL NUMBER</span>
                    <span className="font-mono text-zinc-200">{device.serialNumber}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">INTERNAL IP : ADB PORT</span>
                    <span className="font-mono text-zinc-200">{device.ip}:{device.adbPort}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">ANDROID OS BUILD</span>
                    <span className="font-mono text-zinc-200">{device.androidVersion} (API {device.apiLevel})</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">RESOLUTION &amp; DENSITY</span>
                    <span className="font-mono text-zinc-200">{device.resolution.width}x{device.resolution.height} @ 280dpi</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">EMULATOR RAM</span>
                    <span className="font-mono text-emerald-400 font-semibold">{device.ramUsageMb} MB / {device.totalRamMb} MB</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">UPTIME</span>
                    <span className="font-mono text-zinc-200">{Math.round(device.uptimeSeconds / 60)} minutes</span>
                  </div>
                </div>

                <div className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-lg text-[10px] font-mono text-zinc-400 break-all">
                  <span className="text-zinc-500 block mb-0.5">BUILD FINGERPRINT</span>
                  {device.buildFingerprint || 'Available after Android finishes booting'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
