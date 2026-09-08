import React, { useState, useEffect } from 'react';
import { ArrowRight, Link as LinkIcon, Loader2, Clipboard, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SearchBox({ onAnalyze, isLoading, initialUrl = '' }) {
  const [url, setUrl] = useState(initialUrl || '');

  useEffect(() => {
    if (initialUrl && initialUrl !== url) {
      setUrl(initialUrl);
    }
  }, [initialUrl]);

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
    <motion.form 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      onSubmit={handleSubmit} 
      // Set a max-width to keep it compact
      className="w-full max-w-xl mx-auto relative group"
    >
      {/* Background Glow Effect - only visible on focus-within */}
      <div className="absolute -inset-1 bg-gradient-to-r from-fuchsia-600 via-purple-600 to-cyan-600 rounded-full blur-md opacity-0 group-focus-within:opacity-100 transition-opacity duration-500"></div>
      
      {/* Main Container */}
      <div className="relative flex items-center bg-white/95 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-full p-1 shadow-xl dark:shadow-2xl">
        
        {/* Left Icon with Gradient Accent */}
        <div className="pl-4 pr-2 flex items-center pointer-events-none">
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-400 dark:text-slate-500" />
          ) : (
            <div className="p-1.5 rounded-full bg-gradient-to-br from-fuchsia-500/20 via-purple-500/20 to-cyan-500/20">
                <LinkIcon className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />
            </div>
          )}
        </div>
        
        {/* Input */}
        <input 
          type="text" 
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste link..." 
          className="w-full py-3 bg-transparent text-base font-normal text-slate-900 dark:text-slate-100 focus:outline-none placeholder-slate-400 dark:placeholder-slate-600 px-2"
          autoFocus
        />

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 mr-1 flex-shrink-0">
          <AnimatePresence mode="wait">
            {url ? (
              <motion.button
                key="clear"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                type="button"
                onClick={handleClear}
                className="p-2 text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all touch-manipulation flex items-center justify-center"
                title="Clear link"
              >
                <X size={18} />
              </motion.button>
            ) : (
              <motion.button
                key="paste"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                type="button"
                onClick={handlePaste}
                className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium text-slate-500 hover:text-cyan-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-cyan-400 dark:hover:bg-slate-800 transition-all touch-manipulation"
                title="Paste link from clipboard"
              >
                <Clipboard size={14} />
                <span>Paste</span>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Submit Button - with a continuous gradient */}
          <button 
            type="submit" 
            disabled={isLoading || !url}
            className="flex items-center justify-center h-10 w-10 rounded-full bg-gradient-to-br from-fuchsia-500 via-purple-600 to-cyan-500 hover:from-fuchsia-400 hover:to-cyan-400 disabled:from-slate-200 dark:disabled:from-slate-800 disabled:to-slate-200 dark:disabled:to-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white transition-all shadow-md disabled:shadow-none flex-shrink-0 ml-1"
          >
            {isLoading ? (
                <Loader2 size={20} className="animate-spin" />
            ) : (
                <ArrowRight size={20} />
            )}
          </button>
        </div>
      </div>
    </motion.form>
  );
}