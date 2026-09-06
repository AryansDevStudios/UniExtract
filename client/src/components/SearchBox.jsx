import React, { useState } from 'react';
import { ArrowRight, Link as LinkIcon, Loader2, Clipboard, X } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SearchBox({ onAnalyze, isLoading }) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url) onAnalyze(url);
  };

  const handlePaste = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setUrl(text.trim());
          onAnalyze(text.trim());
        }
      }
    } catch (e) {
      // Clipboard access denied or unsupported
    }
  };

  const handleClear = () => {
    setUrl('');
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
        className="w-full pl-12 pr-44 py-4 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-2xl text-sm md:text-base text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all shadow-sm"
      />

      <div className="absolute right-2 top-2 bottom-2 flex items-center gap-1.5">
        {url ? (
          <button
            type="button"
            onClick={handleClear}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Clear link"
          >
            <X size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePaste}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800/80 transition-all"
            title="Paste link from clipboard"
          >
            <Clipboard size={14} />
            <span>Paste</span>
          </button>
        )}

        <button 
          type="submit" 
          disabled={isLoading || !url}
          className="h-full px-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition-all flex items-center gap-2 shadow-md"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Analyze'}
          {!isLoading && <ArrowRight size={16} />}
        </button>
      </div>
    </form>
  );
}
