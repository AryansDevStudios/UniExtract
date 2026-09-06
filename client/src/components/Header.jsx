import React from 'react';
import { Sun, Moon, Cookie, Server } from 'lucide-react';

export default function Header({ 
  isDark, 
  toggleTheme, 
  cookieStatus, 
  onOpenCookies, 
  onOpenServer, 
  customServerUrl,
  showServerSelector = false 
}) {
  const isYouTubeAuthed = cookieStatus?.isYouTubeAuthed;
  const hasCookies = (cookieStatus?.count || 0) > 0;
  const hasCustomServer = !!customServerUrl;

  return (
    <header className="w-full flex justify-between items-center py-6 px-4 md:px-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 md:gap-4">
        <img src="/favicon.ico" className="w-10 h-10 md:w-12 md:h-12 rounded-xl shadow-md" alt="Logo" />
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
          Universal <span className="font-light text-slate-400">Media Extractor</span>
        </h1>
      </div>
      <div className="flex items-center gap-2.5">
        {showServerSelector && (
          <button
            onClick={onOpenServer}
            title={hasCustomServer ? `Custom Server: ${customServerUrl}` : 'Default Built-in Server (Click to configure)'}
            className="relative flex items-center gap-2 px-3 py-2 rounded-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200 dark:border-slate-700 hover:scale-105 transition-all text-slate-600 dark:text-slate-300 shadow-sm text-xs font-semibold"
          >
            <Server size={16} className={hasCustomServer ? 'text-indigo-500' : 'text-slate-400'} />
            <span className="hidden sm:inline">{hasCustomServer ? 'Custom' : 'Server'}</span>
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
      </div>
    </header>
  );
}
