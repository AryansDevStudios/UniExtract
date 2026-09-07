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
        <LinkIcon className="h-5 w-5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
      </div>
      <input 
        type="text" 
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste YouTube, TikTok, or Instagram link..." 
        className="w-full pl-12 pr-[16rem] py-3.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus-within:border-indigo-500 dark:focus-within:border-indigo-500 rounded-xl text-base text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none transition-all shadow-sm"
      />

      <div className="absolute right-2 top-2 bottom-2 flex items-center gap-1.5">
        {url ? (
          <button
            type="button"
            onClick={handleClear}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Clear link"
          >
            <X size={16} />
          </button>
        ) : (
          <>
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-zinc-500 font-mono mr-1">⌘V to paste</span>
            <button
              type="button"
              onClick={handlePaste}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all touch-manipulation"
              title="Paste link from clipboard"
            >
              <Clipboard size={14} />
              <span>Paste</span>
            </button>
          </>
        )}

        <button 
          type="submit" 
          disabled={isLoading || !url}
          className="h-full px-4 sm:px-5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 disabled:text-zinc-500 dark:disabled:text-zinc-600 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors flex items-center gap-2 touch-manipulation"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Analyze'}
          {!isLoading && <ArrowRight size={16} />}
        </button>
      </div>
    </form>
  );
}
