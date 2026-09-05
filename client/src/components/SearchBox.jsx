import React, { useState } from 'react';
import { ArrowRight, Link as LinkIcon, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SearchBox({ onAnalyze, isLoading }) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url) onAnalyze(url);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full relative group">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
        <LinkIcon className="h-5 w-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
      </div>
      <input 
        type="text" 
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste YouTube, TikTok, or Instagram link..." 
        className="w-full pl-12 pr-40 py-4 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-2xl text-sm md:text-base text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-sm"
      />
      {!url && (
        <div className="absolute right-36 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 pointer-events-none opacity-50">
          <kbd className="px-2 py-1 bg-slate-200 dark:bg-slate-800 rounded text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700 shadow-sm">Ctrl</kbd>
          <span className="text-slate-400 text-xs">+</span>
          <kbd className="px-2 py-1 bg-slate-200 dark:bg-slate-800 rounded text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700 shadow-sm">V</kbd>
        </div>
      )}
      <button 
        type="submit" 
        disabled={isLoading || !url}
        className="absolute right-2 top-2 bottom-2 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition-all flex items-center gap-2 shadow-md"
      >
        {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Analyze'}
        {!isLoading && <ArrowRight size={16} />}
      </button>
    </form>
  );
}
