import React from 'react';
import { Sun, Moon } from 'lucide-react';

export default function Header({ isDark, toggleTheme }) {
  return (
    <header className="w-full flex justify-between items-center py-6 px-4 md:px-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 md:gap-4">
        <img src="/favicon.ico" className="w-10 h-10 md:w-12 md:h-12 rounded-xl shadow-md" alt="Logo" />
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
