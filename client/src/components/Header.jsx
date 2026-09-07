import React from 'react';
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

  return (
    <header className="w-full flex justify-between items-center py-6 px-4 md:px-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 md:gap-4">
        <img src="/favicon.ico" className="w-10 h-10 md:w-12 md:h-12 rounded-xl shadow-md" alt="Logo" />
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
          Uni <span className="font-light text-slate-400">Extract</span>
        </h1>
      </div>
      <div className="flex items-center gap-2.5">
        {updateInfo?.updateAvailable && (
          <button
            onClick={onOpenUpdate}
            title={`New version available: v${updateInfo.latestVersion} (Click for details)`}
            className="relative flex items-center gap-1.5 px-3 py-2 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500 hover:scale-105 transition-all text-indigo-600 dark:text-indigo-400 shadow-sm text-xs font-semibold group"
          >
            <Sparkles size={14} className="text-indigo-500 group-hover:rotate-12 transition-transform" />
            <span>v{updateInfo.latestVersion}</span>
            <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.9)]" />
          </button>
        )}
        {showServerSelector && (
          <button
            onClick={onOpenServer}
            title={envInfo.headerTooltip}
            className="relative flex items-center gap-2 px-3 py-2 rounded-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200 dark:border-slate-700 hover:scale-105 transition-all text-slate-600 dark:text-slate-300 shadow-sm text-xs font-semibold"
          >
            <Server size={16} className={hasCustomServer ? 'text-indigo-500' : 'text-slate-400'} />
            <span className="hidden sm:inline">{envInfo.headerPill}</span>
            <span
              className={`w-2 h-2 rounded-full ${
                hasCustomServer
                  ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.9)]'
                  : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
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
          className="relative flex items-center gap-2 px-3 py-2 rounded-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200 dark:border-slate-700 hover:scale-105 transition-all text-slate-600 dark:text-slate-300 shadow-sm text-xs font-semibold"
        >
          <Cookie size={16} className={hasCookies ? 'text-amber-500' : 'text-slate-400'} />
          <span className="hidden sm:inline">Cookies</span>
          <span
            className={`w-2 h-2 rounded-full ${
              isYouTubeAuthed
                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]'
                : hasCookies
                ? 'bg-amber-500'
                : 'bg-slate-400 dark:bg-slate-600'
            }`}
          />
        </button>

        <button 
          onClick={toggleTheme} 
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200 dark:border-slate-700 hover:scale-105 transition-all text-slate-600 dark:text-slate-300 shadow-sm"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button 
          onClick={onOpenSettings} 
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200 dark:border-slate-700 hover:scale-105 transition-all text-slate-600 dark:text-slate-300 shadow-sm group"
          title="Settings, Preferences & Credits"
        >
          <Settings size={18} className="group-hover:rotate-45 transition-transform duration-300" />
        </button>
      </div>
    </header>
  );
}
