import React, { useState, useEffect } from 'react';
import { Sun, Moon, Cookie, Server, Sparkles, Settings, Download } from 'lucide-react';
import { getEnvironmentInfo } from '../utils/environment';

export default function Header({ 
  isDark, 
  toggleTheme, 
  cookieStatus, 
  onOpenCookies, 
  onOpenServer, 
  customServerUrl,
  showServerSelector = false,
  updateInfo = null,
  onOpenUpdate,
  onOpenDownloads,
  showDownloadButton = false,
  onOpenSettings
}) {
  const isYouTubeAuthed = cookieStatus?.isYouTubeAuthed;
  const hasCookies = (cookieStatus?.count || 0) > 0;
  const hasCustomServer = !!customServerUrl;
  const envInfo = getEnvironmentInfo(customServerUrl);

  const [isSnoozed, setIsSnoozed] = useState(() => {
    const snooze = localStorage.getItem('umx_update_snooze_until');
    return Boolean(snooze && Date.now() < Number(snooze));
  });

  useEffect(() => {
    const handleSnooze = (e) => {
      const until = e.detail;
      setIsSnoozed(Boolean(until && Date.now() < Number(until)));
    };
    window.addEventListener('umx-update-snoozed', handleSnooze);
    return () => window.removeEventListener('umx-update-snoozed', handleSnooze);
  }, []);

  return (
    <header className="w-full flex flex-col sm:flex-row justify-between items-center gap-3 py-5 sm:py-6 px-4 md:px-8 max-w-5xl mx-auto">
      <div className="flex min-w-0 items-center gap-3 md:gap-4">
        <img src="/favicon.ico" className="w-10 h-10 md:w-12 md:h-12 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.4)]" alt="Logo" />
        <h1 className="min-w-0 text-xl md:text-2xl font-black tracking-tight flex items-center gap-2">
          <span className="text-cyan-500 dark:text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]">Uni</span> 
          <span className="font-light text-slate-800 dark:text-slate-300">Extract</span>
        </h1>
      </div>
      <div className="flex w-full sm:w-auto shrink-0 justify-center sm:justify-end items-center gap-1.5 sm:gap-2.5">
        {updateInfo?.updateAvailable && !isSnoozed && (
          <button
            onClick={onOpenUpdate}
            title={`New version available: v${updateInfo.latestVersion}${updateInfo.channel === 'beta' ? ' (Beta Track)' : ''} (Click for details)`}
            className="relative flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-500/30 hover:border-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all text-indigo-600 dark:text-indigo-400 shadow-sm text-xs font-semibold group"
          >
            <Sparkles size={14} className="text-indigo-500 transition-transform" />
            <span>v{updateInfo.latestVersion}</span>
            {updateInfo.channel === 'beta' && (
              <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold uppercase">
                Beta
              </span>
            )}
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
          </button>
        )}
        {showDownloadButton && (
          <button
            onClick={onOpenDownloads}
            title="Download UniExtract desktop packages"
            className="relative flex items-center gap-2 px-3 min-h-[44px] rounded-lg bg-teal-700 text-white hover:bg-teal-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 transition-all shadow-sm text-xs font-bold"
          >
            <Download size={15} />
            <span className="hidden sm:inline">Download</span>
          </button>
        )}
        {showServerSelector && (
          <button
            onClick={onOpenServer}
            title={envInfo.headerTooltip}
            className="relative flex items-center gap-2 px-3 min-h-[44px] rounded-lg glass-panel hover:border-cyan-500/50 transition-all text-slate-700 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-300 text-xs font-semibold group"
          >
            <Server size={16} className={hasCustomServer ? 'text-cyan-500 dark:text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]' : 'text-slate-400 dark:text-slate-500'} />
            <span className="hidden sm:inline">{envInfo.headerPill}</span>
            <span
              className={`w-2 h-2 rounded-full ${
                hasCustomServer
                  ? 'bg-cyan-500 dark:bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]'
                  : 'bg-emerald-600 dark:bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
              }`}
            />
          </button>
        )}

        <button
          onClick={onOpenCookies}
          title={
            isYouTubeAuthed
              ? `YouTube Authenticated (${cookieStatus.count} cookies)`
              : hasCookies
              ? `Cookies active (${cookieStatus.count})`
              : 'Configure media cookies'
          }
          className="relative flex items-center gap-2 px-3 min-h-[44px] rounded-lg glass-panel hover:border-violet-500/50 transition-all text-slate-700 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-300 text-xs font-semibold group"
        >
          <Cookie size={16} className={hasCookies ? 'text-violet-500 dark:text-violet-400 drop-shadow-[0_0_5px_rgba(139,92,246,0.8)]' : 'text-slate-400 dark:text-slate-500'} />
          <span className="hidden sm:inline">Cookies</span>
          <span
            className={`w-2 h-2 rounded-full ${
              isYouTubeAuthed
                ? 'bg-emerald-600 dark:bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                : hasCookies
                ? 'bg-violet-500 dark:bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.8)]'
                : 'bg-slate-400 dark:bg-slate-600'
            }`}
          />
        </button>

        <button 
          onClick={toggleTheme} 
          className="w-11 h-11 flex items-center justify-center rounded-lg glass-panel hover:border-cyan-500/50 transition-all text-slate-700 dark:text-slate-300 hover:text-amber-500 dark:hover:text-amber-400 touch-manipulation"
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button 
          onClick={onOpenSettings} 
          className="w-11 h-11 flex items-center justify-center rounded-lg glass-panel hover:border-slate-400 dark:hover:border-slate-600 transition-all text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white group touch-manipulation"
          title="Settings, Preferences & Credits"
        >
          <Settings size={18} className="transition-transform duration-300 group-hover:rotate-45" />
        </button>
      </div>
    </header>
  );
}
