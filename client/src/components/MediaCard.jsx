import React from 'react';
import { DownloadCloud } from 'lucide-react';
import { motion } from 'framer-motion';

export default function MediaCard({ metadata, onDownloadThumb }) {
  if (!metadata) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col lg:flex-row gap-4 md:gap-8 mb-6 md:mb-10 items-center lg:items-start p-6"
    >
      <div className="flex flex-col gap-3 w-full lg:w-72 flex-shrink-0">
        <img 
          src={metadata.thumbnail} 
          alt="Thumbnail" 
          className="w-full rounded-2xl shadow-xl border-2 md:border-4 border-slate-100 dark:border-slate-800 object-cover aspect-video bg-slate-200 dark:bg-slate-800"
        />
        <button 
          onClick={onDownloadThumb}
          className="w-full bg-slate-200 dark:bg-slate-800 hover:bg-brand hover:text-white dark:hover:bg-brand text-slate-700 dark:text-slate-300 font-bold text-[10px] md:text-[11px] py-2.5 rounded-xl transition shadow-sm flex items-center justify-center gap-2 tracking-wider"
        >
          <DownloadCloud size={16} />
          DOWNLOAD THUMBNAIL
        </button>
      </div>
      <div className="text-center lg:text-left flex-1 relative w-full pt-2">
        <h2 className="text-lg md:text-2xl font-black mb-2 leading-tight px-1 text-slate-800 dark:text-slate-100">
          {metadata.title}
        </h2>
      </div>
    </motion.div>
  );
}
