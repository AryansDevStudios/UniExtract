import React from 'react';
import { Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function RecentHistory({ history, onSelect, onDelete }) {
  if (!history || history.length === 0) return null;

  return (
    <div className="max-w-5xl mx-auto mt-6 md:mt-8 px-2 md:px-4 mb-12">
      <h3 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-500 mb-3 md:mb-4 px-2">Recent Searches</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <AnimatePresence>
          {history.map((item) => (
            <motion.div
              key={item.url}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              layout
              onClick={() => onSelect(item.url)}
              className="flex items-center gap-3 md:gap-4 p-3 md:p-4 bg-white dark:bg-slate-900 rounded-xl md:rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-brand dark:hover:border-brand transition group relative"
            >
              <img src={item.thumb} alt="thumb" className="w-12 h-12 md:w-14 md:h-14 object-cover rounded-lg shadow-sm bg-slate-100 dark:bg-slate-800" />
              <div className="flex-1 min-w-0 pr-8">
                <h4 className="font-bold text-xs md:text-sm truncate dark:text-slate-100 group-hover:text-brand transition">{item.title}</h4>
                <p className="text-[9px] md:text-[10px] text-slate-500 truncate mt-0.5">{item.url}</p>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.url);
                }} 
                className="absolute right-2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition"
                title="Remove from history"
              >
                <Trash2 size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
