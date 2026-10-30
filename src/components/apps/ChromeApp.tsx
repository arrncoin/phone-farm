import React, { useState } from 'react';
import {
  Globe,
  RotateCw,
  ArrowLeft,
  ArrowRight,
  Search,
  Lock,
  ExternalLink,
  Star,
  Bookmark,
  Share2,
  Sparkles,
} from 'lucide-react';

interface ChromeAppProps {
  deviceId?: string;
  initialUrl?: string;
  onNavigateApp?: (pkg: string) => void;
}

export const ChromeApp: React.FC<ChromeAppProps> = ({
  deviceId,
  initialUrl = 'https://google.com',
  onNavigateApp,
}) => {
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([initialUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const handleNavigate = (targetUrl: string) => {
    let sanitized = targetUrl.trim();
    if (!sanitized) return;

    if (!sanitized.startsWith('http://') && !sanitized.startsWith('https://')) {
      if (sanitized.includes('.') && !sanitized.includes(' ')) {
        sanitized = `https://${sanitized}`;
      } else {
        // Search query
        sanitized = `https://www.google.com/search?q=${encodeURIComponent(sanitized)}`;
      }
    }

    setIsLoading(true);
    setCurrentUrl(sanitized);
    setUrlInput(sanitized);

    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(sanitized);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);

    setTimeout(() => {
      setIsLoading(false);
    }, 400);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleNavigate(urlInput);
  };

  const handleBack = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setCurrentUrl(prev);
      setUrlInput(prev);
    }
  };

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setCurrentUrl(next);
      setUrlInput(next);
    }
  };

  const handleReload = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 300);
  };

  const BOOKMARKS = [
    { title: 'YouTube', icon: '▶', url: 'https://youtube.com', pkg: 'com.google.android.youtube' },
    { title: 'TikTok', icon: '🎵', url: 'https://tiktok.com', pkg: 'com.zhiliaoapp.musically' },
    { title: 'Google', icon: 'G', url: 'https://google.com' },
    { title: 'Wikipedia', icon: 'W', url: 'https://wikipedia.org' },
    { title: 'GitHub', icon: '🐙', url: 'https://github.com' },
    { title: 'Android Dev', icon: '🤖', url: 'https://developer.android.com' },
  ];

  return (
    <div className="w-full h-full bg-[#1e1e1e] text-white flex flex-col font-sans select-none overflow-hidden">
      {/* Chrome Navigation & Omnibox Bar */}
      <div className="bg-[#2b2a33] px-2.5 py-1.5 border-b border-zinc-700/80 flex items-center gap-1.5 shrink-0">
        <button
          onClick={handleBack}
          disabled={historyIndex === 0}
          className="p-1 rounded text-zinc-300 hover:text-white disabled:opacity-30 transition-colors"
          title="Back"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleForward}
          disabled={historyIndex >= history.length - 1}
          className="p-1 rounded text-zinc-300 hover:text-white disabled:opacity-30 transition-colors"
          title="Forward"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleReload}
          className={`p-1 rounded text-zinc-300 hover:text-white transition-colors ${
            isLoading ? 'animate-spin text-emerald-400' : ''
          }`}
          title="Reload"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>

        {/* Address Omnibox */}
        <form onSubmit={handleFormSubmit} className="flex-1 flex items-center">
          <div className="w-full flex items-center bg-[#1c1b22] border border-zinc-700/80 rounded-full px-2.5 py-1 text-xs focus-within:border-emerald-500 transition-colors">
            <Lock className="w-2.5 h-2.5 text-emerald-400 mr-1.5 shrink-0" />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Search Google or type a URL..."
              className="w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
            />
            {isLoading && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            )}
          </div>
        </form>

        {/* Tabs count badge */}
        <div className="w-5 h-5 rounded border border-zinc-500 flex items-center justify-center text-[10px] font-bold text-zinc-300">
          1
        </div>
      </div>

      {/* Bookmarks Bar */}
      <div className="bg-[#24232b] px-3 py-1 flex items-center gap-2 overflow-x-auto border-b border-zinc-800 scrollbar-none text-[11px]">
        {BOOKMARKS.map((b) => (
          <button
            key={b.title}
            onClick={() => {
              if (b.pkg && onNavigateApp) {
                onNavigateApp(b.pkg);
              } else {
                handleNavigate(b.url);
              }
            }}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-zinc-700/60 text-zinc-300 hover:text-white transition-colors shrink-0"
          >
            <span className="text-xs">{b.icon}</span>
            <span>{b.title}</span>
          </button>
        ))}
      </div>

      {/* Web Page View Container */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col bg-[#121212]">
        {currentUrl.includes('google.com') ? (
          <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto text-center space-y-4">
            {/* Google Logo */}
            <div className="flex items-center text-3xl font-extrabold tracking-tight">
              <span className="text-[#4285F4]">G</span>
              <span className="text-[#EA4335]">o</span>
              <span className="text-[#FBBC05]">o</span>
              <span className="text-[#4285F4]">g</span>
              <span className="text-[#34A853]">l</span>
              <span className="text-[#EA4335]">e</span>
            </div>

            {/* Google Search Box */}
            <div className="w-full flex items-center bg-[#202124] border border-zinc-700 rounded-full px-4 py-2.5 shadow-lg focus-within:border-blue-500">
              <Search className="w-4 h-4 text-zinc-400 mr-2.5 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    handleNavigate(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`);
                  }
                }}
                placeholder="Search Google or type URL..."
                className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
              />
            </div>

            {/* Quick App Jump Cards */}
            <div className="w-full pt-4 space-y-2 text-left">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">
                Quick Android Applications
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onNavigateApp && onNavigateApp('com.google.android.youtube')}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-red-500/60 transition-colors text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-500 border border-red-500/30 flex items-center justify-center font-bold text-sm">
                    ▶
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white group-hover:text-red-400 block">
                      YouTube
                    </span>
                    <span className="text-[10px] text-zinc-400">Watch Videos</span>
                  </div>
                </button>

                <button
                  onClick={() => onNavigateApp && onNavigateApp('com.zhiliaoapp.musically')}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-cyan-500/60 transition-colors text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold text-sm">
                    🎵
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white group-hover:text-cyan-400 block">
                      TikTok
                    </span>
                    <span className="text-[10px] text-zinc-400">Shorts &amp; FYP</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Pixel 7 Pro Device Status */}
            <div className="w-full p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-left text-xs space-y-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Active Device:</span>
                <span className="font-mono text-emerald-400">{deviceId || 'Pixel 7 Pro #01'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Web Engine:</span>
                <span className="font-mono text-zinc-300">Chrome/122.0 Mobile (Android 14)</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3">
            <Globe className="w-12 h-12 text-emerald-400 opacity-80" />
            <h3 className="text-sm font-bold text-zinc-200">Browsing Web: {currentUrl}</h3>
            <p className="text-xs text-zinc-400 max-w-xs">
              Live web session active inside Google Pixel 7 Pro browser sandbox.
            </p>
            <button
              onClick={() => handleNavigate('https://google.com')}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs"
            >
              Back to Google Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
