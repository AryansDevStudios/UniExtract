import React from 'react';
import { motion } from 'framer-motion';

export default function DownloadProgress({ isDownloading, progress, status, totalSize, onStart }) {
  const sizeText = totalSize > 0 ? `~${(totalSize / 1024 / 1024).toFixed(1)} MB` : 'Unknown Size';

  return (
    <div className="mt-6 md:mt-10 p-6 md:p-10 bg-slate-50 dark:bg-slate-950/80 rounded-b-3xl md:rounded-b-[2.5rem] flex flex-col items-center">
      
      <div className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-500 mb-6 bg-slate-200 dark:bg-slate-800 px-6 py-2 rounded-xl text-center w-full md:w-auto shadow-inner transition-colors">
        Estimated Size: <span className={`ml-1 text-sm ${totalSize > 0 ? 'text-brand' : 'text-slate-400'}`}>{sizeText}</span>
      </div>

      {!isDownloading ? (
        <button 
          onClick={onStart}
          className="w-full sm:w-auto bg-brand text-white px-8 md:px-16 py-4 md:py-5 rounded-xl md:rounded-2xl font-black text-base md:text-xl shadow-2xl hover:scale-105 active:scale-95 transition tracking-tighter"
        >
          START GENERATING
        </button>
      ) : (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <div className="flex justify-between text-[9px] md:text-[10px] font-black text-brand mb-2 md:mb-3 uppercase tracking-tighter">
            <span>{status === 'completed' ? 'Processing Complete' : (status === 'error' ? 'Failed' : 'Processing...')}</span>
            <span>{progress}</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 h-3 md:h-4 rounded-full p-0.5 border border-slate-300 dark:border-slate-700">
            <motion.div 
              className={`h-full rounded-full ${status === 'error' ? 'bg-red-500' : 'bg-brand'}`}
              initial={{ width: '0%' }}
              animate={{ width: progress }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </motion.div>
      )}
    </div>
  );
}
