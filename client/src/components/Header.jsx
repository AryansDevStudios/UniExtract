import React from 'react';
import { Sun, Moon } from 'lucide-react';

export default function Header({ isDark, toggleTheme }) {
  return (
    <header className="w-full flex justify-between items-center py-6 px-4 md:px-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
        </div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
          Universal <span className="font-light text-slate-400">Media Extractor</span>
        </h1>
      </div>
      <button 
        onClick={toggleTheme} 
        className="w-10 h-10 flex items-center justify-center rounded-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200 dark:border-slate-700 hover:scale-105 transition-all text-slate-600 dark:text-slate-300 shadow-sm"
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </header>
  );
}
