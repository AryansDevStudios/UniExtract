import React from 'react';
import { X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function RecentHistory({ history, onSelect, onDelete }) {
  if (!history || history.length === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full mt-12 flex flex-col items-center"
    >
      <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest mb-4">
        <Clock size={12} /> Recent
      </div>
      <div className="flex flex-wrap justify-center gap-3 w-full">
        <AnimatePresence>
          {history.map((item) => (
            <motion.div
              key={item.url}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              layout
              onClick={() => onSelect(item.url)}
              className="flex items-center gap-3 p-2 pr-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md rounded-full shadow-sm border border-slate-200/50 dark:border-slate-700/50 cursor-pointer hover:bg-white dark:hover:bg-slate-800 hover:shadow-md transition-all duration-300 group max-w-[200px]"
            >
              <img src={item.thumb} alt="thumb" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              <h4 className="font-medium text-xs text-slate-700 dark:text-slate-300 truncate w-full group-hover:text-indigo-500 transition-colors">
                {item.title}
              </h4>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.url);
                }} 
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all flex-shrink-0"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
