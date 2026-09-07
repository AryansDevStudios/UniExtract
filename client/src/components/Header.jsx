import React, { useState, useEffect } from 'react';
import { Sun, Moon, Cookie, Server, Sparkles, Settings } from 'lucide-react';
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
    <header className="w-full flex justify-between items-center py-6 px-4 md:px-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 md:gap-4">
        <img src="/favicon.ico" className="w-10 h-10 md:w-12 md:h-12 rounded-xl shadow-md" alt="Logo" />
        <h1 className="text-lg font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
          Uni <span className="font-light text-zinc-400">Extract</span>
        </h1>
      </div>
      <div className="flex items-center gap-2.5">
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
        {showServerSelector && (
          <button
            onClick={onOpenServer}
            title={envInfo.headerTooltip}
            className="relative flex items-center gap-2 px-3 min-h-[44px] rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all text-zinc-600 dark:text-zinc-300 shadow-sm text-xs font-semibold"
          >
            <Server size={16} className={hasCustomServer ? 'text-indigo-500' : 'text-zinc-400'} />
            <span className="hidden sm:inline">{envInfo.headerPill}</span>
            <span
              className={`w-2 h-2 rounded-full ${
                hasCustomServer
                  ? 'bg-indigo-500'
                  : 'bg-emerald-500'
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
          className="relative flex items-center gap-2 px-3 min-h-[44px] rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all text-zinc-600 dark:text-zinc-300 shadow-sm text-xs font-semibold"
        >
          <Cookie size={16} className={hasCookies ? 'text-amber-500' : 'text-zinc-400'} />
          <span className="hidden sm:inline">Cookies</span>
          <span
            className={`w-2 h-2 rounded-full ${
              isYouTubeAuthed
                ? 'bg-emerald-500'
                : hasCookies
                ? 'bg-amber-500'
                : 'bg-zinc-400 dark:bg-zinc-600'
            }`}
          />
        </button>

        <button 
          onClick={toggleTheme} 
          className="w-11 h-11 flex items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all text-zinc-600 dark:text-zinc-300 shadow-sm touch-manipulation"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button 
          onClick={onOpenSettings} 
          className="w-11 h-11 flex items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all text-zinc-600 dark:text-zinc-300 shadow-sm group touch-manipulation"
          title="Settings, Preferences & Credits"
        >
          <Settings size={18} className="transition-transform duration-300" />
        </button>
      </div>
    </header>
  );
}
