import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  Download,
  Upload,
  Radio,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Layers,
  Terminal,
  Trash2,
  Play,
  RefreshCw,
  Search,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { DeviceInfo, InstalledPackage, InstallApkResponse } from '../types/index.ts';
import {
  fetchApkCatalog,
  installApk,
  uninstallPackage,
  connectAdbDevice,
  fetchDevices,
} from '../services/api.ts';

interface ApkManagerModalProps {
  devices: DeviceInfo[];
  onClose: () => void;
  onRefreshDevices: () => void;
  initialDeviceId?: string;
}

export const ApkManagerModal: React.FC<ApkManagerModalProps> = ({
  devices,
  onClose,
  onRefreshDevices,
  initialDeviceId,
}) => {
  const [activeTab, setActiveTab] = useState<'store' | 'upload' | 'adb' | 'packages'>('store');
  const [catalog, setCatalog] = useState<any[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string>('all'); // 'all' or specific device ID
  const [selectedDeviceForPackages, setSelectedDeviceForPackages] = useState<string>(
    initialDeviceId || devices[0]?.id || 'pixel-01'
  );
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<number>(0);
  const [lastInstallResult, setLastInstallResult] = useState<InstallApkResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'user' | 'system'>('all');

  // Custom APK Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [customAppName, setCustomAppName] = useState('');
  const [customPackageName, setCustomPackageName] = useState('');

  // ADB Connect state
  const [adbHost, setAdbHost] = useState('');
  const [adbPort, setAdbPort] = useState('5555');
  const [isConnectingAdb, setIsConnectingAdb] = useState(false);
  const [adbConnectMessage, setAdbConnectMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchApkCatalog()
      .then((data) => setCatalog(data))
      .catch((err) => console.error('Failed to load APK catalog', err));
  }, []);

  const handleInstallCatalogApp = async (app: any) => {
    setIsInstalling(true);
    setInstallProgress(15);
    setLastInstallResult(null);

    const targetDeviceIds =
      selectedTarget === 'all'
        ? devices.filter((d) => d.status === 'online').map((d) => d.id)
        : [selectedTarget];

    try {
      setInstallProgress(45);
      const res = await installApk({
        targetDeviceIds,
        packageName: app.packageName,
        appName: app.appName,
        version: app.version,
        icon: app.icon,
        color: app.color,
        sizeMb: app.sizeMb,
      });

      setInstallProgress(100);
      setLastInstallResult(res);
      onRefreshDevices();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const cleanName = file.name.replace(/\.apk$/i, '').replace(/[-_]/g, ' ');
      setCustomAppName(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
      const autoPkg = 'com.user.' + file.name.replace(/\.apk$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      setCustomPackageName(autoPkg);
    }
  };

  const handleInstallCustomApk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedFile || !customPackageName.trim() || !customAppName.trim()) return;

    setIsInstalling(true);
    setInstallProgress(25);
    setLastInstallResult(null);

    const targetDeviceIds =
      selectedTarget === 'all'
        ? devices.filter((d) => d.status === 'online').map((d) => d.id)
        : [selectedTarget];

    try {
      setInstallProgress(60);
      const res = await installApk({
        targetDeviceIds,
        packageName: customPackageName.trim(),
        appName: customAppName.trim(),
        version: '1.0.0',
        color: '#06B6D4',
        sizeMb: Math.round((uploadedFile.size / (1024 * 1024)) * 10) / 10 || 12,
      });

      setInstallProgress(100);
      setLastInstallResult(res);
      setUploadedFile(null);
      onRefreshDevices();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstall = async (deviceId: string, packageName: string) => {
    try {
      await uninstallPackage(deviceId, packageName);
      onRefreshDevices();
    } catch (err) {
      console.error(err);
    }
  };

  const handleConnectAdb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adbHost.trim()) return;
    setIsConnectingAdb(true);
    setAdbConnectMessage(null);

    try {
      const res = await connectAdbDevice(adbHost.trim(), parseInt(adbPort.trim() || '5555', 10));
      setAdbConnectMessage({
        type: 'success',
        text: `Berhasil terhubung ke ${adbHost}:${adbPort}! Perangkat ${res.device.name} telah ditambahkan ke Farm.`,
      });
      setAdbHost('');
      onRefreshDevices();
    } catch (err: any) {
      setAdbConnectMessage({
        type: 'error',
        text: `Gagal menghubungkan ke ${adbHost}:${adbPort}. Pastikan perangkat mengaktifkan 'adb tcpip ${adbPort}'.`,
      });
    } finally {
      setIsConnectingAdb(false);
    }
  };

  const filteredCatalog = catalog.filter(
    (app) =>
      app.appName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.packageName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeDeviceObj = devices.find((d) => d.id === selectedDeviceForPackages) || devices[0];
  const devicePackages = (activeDeviceObj?.installedPackages || []).filter((p) => {
    if (filterType === 'user') return !p.isSystem;
    if (filterType === 'system') return p.isSystem;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-850 bg-zinc-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-zinc-950 font-bold">
              <Package className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100">Android APK &amp; Package Manager</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  PIXEL 7 PRO (CHEETAH)
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Pasang dan kelola aplikasi Android pada 10 virtual container atau hubungkan perangkat ADB eksternal
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

        {/* Global Target Device Selector Bar */}
        <div className="px-6 py-2.5 bg-zinc-900/40 border-b border-zinc-850 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 font-medium">Target Instalasi:</span>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="bg-zinc-900 border border-zinc-750 text-zinc-200 rounded-lg px-3 py-1 font-mono text-xs focus:outline-none focus:border-emerald-500"
            >
              <option value="all">⚡ Sync Install ke Semua 10 Perangkat (Cluster)</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.status.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Google Tensor G2 Runtime • Android 14 (API 34)</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-zinc-850 bg-zinc-950">
          <button
            onClick={() => setActiveTab('store')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'store'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Curated APK Store</span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'upload'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Custom .APK</span>
          </button>

          <button
            onClick={() => setActiveTab('adb')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'adb'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>ADB Remote Bridge</span>
          </button>

          <button
            onClick={() => setActiveTab('packages')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'packages'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Installed Packages ({devicePackages.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Progress Banner */}
          {isInstalling && (
            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs text-emerald-300 font-medium">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Memasang APK via ADB Bridge ({selectedTarget === 'all' ? '10 Perangkat' : selectedTarget})...
                </span>
                <span className="font-mono">{installProgress}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${installProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Last Result Banner */}
          {lastInstallResult && (
            <div className="p-3.5 rounded-xl bg-zinc-900 border border-emerald-500/30 flex items-start justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-zinc-100">
                    Instalasi Berhasil: {lastInstallResult.appName} ({lastInstallResult.packageName})
                  </span>
                  <p className="text-zinc-400 text-[11px] mt-0.5">
                    {lastInstallResult.successCount} dari {lastInstallResult.totalTargets} perangkat berhasil dipasang.
                    Icon aplikasi kini aktif di Pixel Launcher home screen.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setLastInstallResult(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* TAB 1: CURATED APK STORE */}
          {activeTab === 'store' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari aplikasi APK (Termux, WhatsApp, F-Droid, NewPipe, Geekbench)..."
                  className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Grid of Curated APKs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredCatalog.map((app) => (
                  <div
                    key={app.packageName}
                    className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold shrink-0 shadow-md"
                        style={{ backgroundColor: app.color || '#10B981' }}
                      >
                        <Package className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-zinc-100 truncate">{app.appName}</h3>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {app.badge || 'Verified'}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-zinc-400 block truncate">
                          {app.packageName} • v{app.version}
                        </span>
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{app.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-xs">
                      <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
                        <span>Ukuran: <strong className="text-zinc-200">{app.sizeMb} MB</strong></span>
                        <span>•</span>
                        <span>{app.category}</span>
                      </div>

                      <button
                        onClick={() => handleInstallCatalogApp(app)}
                        disabled={isInstalling}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-zinc-950 font-bold text-xs shadow-sm shadow-emerald-500/20 transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Pasang Sekarang</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD CUSTOM .APK */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <form onSubmit={handleInstallCustomApk} className="space-y-4">
                {/* Drag and Drop Zone */}
                <div className="border-2 border-dashed border-zinc-800 hover:border-emerald-500/50 rounded-2xl p-8 text-center bg-zinc-900/30 transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    accept=".apk"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-200">
                        {uploadedFile ? uploadedFile.name : 'Pilih file .APK dari komputer Anda'}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {uploadedFile
                          ? `${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB • Siap dipasang ke Pixel 7 Pro`
                          : 'Tarik & letakkan file .apk ke sini, atau klik untuk memilih file'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Form fields for APK metadata */}
                {uploadedFile && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">
                        Nama Aplikasi
                      </label>
                      <input
                        type="text"
                        value={customAppName}
                        onChange={(e) => setCustomAppName(e.target.value)}
                        placeholder="Contoh: My Bot Automation"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">
                        Package Name
                      </label>
                      <input
                        type="text"
                        value={customPackageName}
                        onChange={(e) => setCustomPackageName(e.target.value)}
                        placeholder="com.example.myapp"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-zinc-400">
                    Target: <strong className="text-zinc-200">{selectedTarget === 'all' ? 'Semua 10 Perangkat' : selectedTarget}</strong>
                  </div>

                  <button
                    type="submit"
                    disabled={!uploadedFile || isInstalling}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-zinc-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition-all"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Jalankan Pasang APK ke Cluster</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: ADB REMOTE CONNECT */}
          {activeTab === 'adb' && (
            <div className="space-y-4">
              <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-2">
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  Hubungkan Perangkat Fisik / Redroid Eksternal via ADB TCP
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Gunakan bridge ini untuk menghubungkan HP Android fisik nyata melalui Wi-Fi ADB atau container emulator Redroid yang berjalan di mesin server lain.
                </p>
              </div>

              {adbConnectMessage && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    adbConnectMessage.type === 'success'
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {adbConnectMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{adbConnectMessage.text}</span>
                </div>
              )}

              <form onSubmit={handleConnectAdb} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">
                      Host IP / Domain
                    </label>
                    <input
                      type="text"
                      value={adbHost}
                      onChange={(e) => setAdbHost(e.target.value)}
                      placeholder="192.168.1.100 atau host.docker.internal"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">
                      ADB Port
                    </label>
                    <input
                      type="number"
                      value={adbPort}
                      onChange={(e) => setAdbPort(e.target.value)}
                      placeholder="5555"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-500 text-[11px]">Preset Cepat:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAdbHost('127.0.0.1');
                      setAdbPort('5555');
                    }}
                    className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-750 text-[11px] font-mono text-zinc-300"
                  >
                    127.0.0.1:5555
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdbHost('host.docker.internal');
                      setAdbPort('5555');
                    }}
                    className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-750 text-[11px] font-mono text-zinc-300"
                  >
                    host.docker.internal:5555
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isConnectingAdb || !adbHost.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-zinc-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition-all"
                  >
                    {isConnectingAdb ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                    <span>Hubungkan ke Perangkat (adb connect)</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 4: INSTALLED PACKAGES INSPECTOR */}
          {activeTab === 'packages' && (
            <div className="space-y-4">
              {/* Device Selector & Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl">
                <div className="flex items-center gap-2 text-xs">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span className="text-zinc-400">Pilih Perangkat:</span>
                  <select
                    value={selectedDeviceForPackages}
                    onChange={(e) => setSelectedDeviceForPackages(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-emerald-500"
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.installedPackages?.length || 7} paket)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    onClick={() => setFilterType('all')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      filterType === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Semua ({activeDeviceObj?.installedPackages?.length || 0})
                  </button>
                  <button
                    onClick={() => setFilterType('user')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      filterType === 'user' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    User APK ({activeDeviceObj?.installedPackages?.filter((p) => !p.isSystem).length || 0})
                  </button>
                  <button
                    onClick={() => setFilterType('system')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      filterType === 'system' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Sistem ({activeDeviceObj?.installedPackages?.filter((p) => p.isSystem).length || 0})
                  </button>
                </div>
              </div>

              {/* Package List */}
              <div className="space-y-2">
                {devicePackages.map((pkg) => (
                  <div
                    key={pkg.packageName}
                    className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-xl flex items-center justify-between gap-3 text-xs"
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
                          {pkg.isSystem && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
                              SYSTEM
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-zinc-500 block truncate">
                          {pkg.packageName} • {pkg.sizeMb} MB • {pkg.category}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!pkg.isSystem && (
                        <button
                          onClick={() => handleUninstall(activeDeviceObj.id, pkg.packageName)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs transition-colors"
                          title="Hapus aplikasi (pm uninstall)"
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
        </div>
      </div>
    </div>
  );
};
