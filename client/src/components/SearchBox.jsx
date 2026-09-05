import React, { useState } from 'react';
import { X, ClipboardPaste, ArrowRight } from 'lucide-react';

export default function SearchBox({ onAnalyze, isLoading }) {
  const [url, setUrl] = useState('');

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      if (text) onAnalyze(text);
    } catch (e) {
      // Clipboard access denied
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url) onAnalyze(url);
  };

  return (
    <div className="bg-brand p-6 md:p-10 text-center rounded-t-3xl md:rounded-t-[2.5rem]">
      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3 max-w-2xl mx-auto relative">
        <div className="relative flex-1 group w-full">
          <input 
            type="text" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste Video Link Here..." 
            className="w-full px-4 py-3 md:px-6 md:py-4 pr-24 rounded-2xl bg-white/10 border border-white/30 text-white placeholder-indigo-200 outline-none focus:ring-4 focus:ring-white/30 transition shadow-inner text-sm md:text-base"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-100 md:opacity-70 group-hover:opacity-100 transition">
            {url && (
              <button type="button" onClick={() => setUrl('')} className="p-1.5 md:p-2 hover:bg-white/20 rounded-xl transition text-white">
                <X size={18} />
              </button>
            )}
            <button type="button" onClick={handlePaste} className="p-1.5 md:p-2 hover:bg-white/20 rounded-xl transition text-white">
              <ClipboardPaste size={18} />
            </button>
          </div>
        </div>
        <button 
          type="submit" 
          disabled={isLoading}
          className="w-full md:w-auto bg-white text-brand px-6 py-3 md:px-8 md:py-4 rounded-2xl font-black hover:scale-105 transition active:scale-95 shadow-lg text-sm md:text-base disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          ) : (
            <>ANALYZE <ArrowRight size={18} /></>
          )}
        </button>
      </form>
      
      <div className="mt-4 md:mt-6 flex flex-wrap justify-center gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-white/80">
        <span className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20">YouTube</span>
        <span className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20">Instagram Reels</span>
        <span className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20">TikTok</span>
        <span className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20">Snapchat</span>                    
      </div>
    </div>
  );
}
