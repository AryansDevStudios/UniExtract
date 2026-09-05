import React from 'react';
import { Sun, Moon } from 'lucide-react';

export default function Header({ isDark, toggleTheme }) {
  return (
    <header className="max-w-5xl mx-auto mb-4 md:mb-6 flex justify-between items-center px-2 md:px-4 mt-4">
      <div className="flex items-center gap-3">
        <img src="/favicon.ico" className="w-10 h-10 md:w-12 md:h-12 rounded-xl shadow-md" alt="Logo" />
        <div>
          <h1 className="text-2xl md:text-3xl text-brand" style={{ fontFamily: "'Pacifico', cursive" }}>
            Universal Media Extractor
          </h1>
          <p className="text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 md:mt-1">
            Multi-Platform Supported
          </p>
        </div>
      </div>
      <button 
        onClick={toggleTheme} 
        className="p-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:scale-110 transition text-slate-700 dark:text-slate-300"
      >
        {isDark ? <Sun size={20} /> : <Moon size={20} />}
      </button>
    </header>
  );
}
