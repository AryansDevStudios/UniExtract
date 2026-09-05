import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Video, Music, DownloadCloud, Loader2, ChevronDown, Check } from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes) return '-- MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB (${mb.toFixed(1)} MB)`;
  }
  return `${mb.toFixed(1)} MB`;
}

function CustomSelect({ label, icon: Icon, options, value, onChange, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const selectedOption = options.find(o => o.id === value) || { id: '', display: placeholder };

  return (
    <div className="space-y-1.5 w-full">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        <Icon size={12} /> {label}
      </label>
      <div 
        className="relative w-full"
        tabIndex={0}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setIsOpen(false);
        }}
      >
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-slate-200 cursor-pointer transition-colors shadow-sm"
        >
          <span className="truncate pr-2 font-medium">{selectedOption.display}</span>
          <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-500' : ''}`} />
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 5, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute z-50 mt-2 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden backdrop-blur-xl"
            >
              <div className="max-h-60 overflow-y-auto custom-scroll p-1.5 flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => { onChange(''); setIsOpen(false); }}
                  className={`flex items-center justify-between w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    value === '' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {placeholder}
                  {value === '' && <Check size={14} />}
                </button>
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => { onChange(opt.id); setIsOpen(false); }}
                    className={`flex items-center justify-between w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      value === opt.id ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span className="truncate">{opt.display}</span>
                    {value === opt.id && <Check size={14} className="flex-shrink-0 ml-2" />}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function CompactResultPanel({ 
  metadata, 
  selectedVideo, setSelectedVideo, 
  selectedAudio, setSelectedAudio, 
  onDownloadThumb, 
  onDownloadMedia,
  isDownloading,
  progress,
  status
}) {
  const [advancedMode, setAdvancedMode] = useState(false);

  if (!metadata) return null;

  const vFormats = useMemo(() => {
    // Sort by height descending, then size ASCENDING so standard users get the smallest, most efficient codec per resolution
    let list = metadata.formats
      .filter(f => f.vcodec)
      .sort((a, b) => (b.height - a.height) || ((a.size || Infinity) - (b.size || Infinity)));
    
    if (!advancedMode) {
      const seen = new Set();
      list = list.filter(f => {
        if (seen.has(f.resolution)) return false;
        seen.add(f.resolution);
        return true;
      });
    }

    return list.map(f => ({
      ...f,
      display: advancedMode 
        ? `${f.resolution} • ${f.codec_info || f.vcodec} • ${formatBytes(f.size)}`
        : `${f.resolution} • ${formatBytes(f.size)}`
    }));
  }, [metadata, advancedMode]);

  const aFormats = useMemo(() => {
    let list = metadata.formats
      .filter(f => f.acodec && !f.vcodec)
      .sort((a, b) => {
        const abrA = parseInt(a.abr) || 0;
        const abrB = parseInt(b.abr) || 0;
        if (abrA !== abrB) return abrB - abrA; // Highest bitrate first
        return (a.size || Infinity) - (b.size || Infinity); // Smallest file first for same bitrate
      });
    
    if (!advancedMode) {
      const seen = new Set();
      list = list.filter(f => {
        const key = f.abr || 'High Quality';
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    return list.map(f => ({
      ...f,
      display: advancedMode
        ? `${f.abr || 'High Quality'} • ${f.codec_info || f.acodec} • ${formatBytes(f.size)}`
        : `${f.abr || 'High Quality'} • ${formatBytes(f.size)}`
    }));
  }, [metadata, advancedMode]);

  const totalSize = (selectedVideo.size || 0) + (selectedAudio.size || 0);
  const sizeText = totalSize > 0 ? formatBytes(totalSize) : 'Unknown Size';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -15, scale: 0.98 }}
      className="mt-6 w-full bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-[2rem] p-3 md:p-4 shadow-xl flex flex-col md:flex-row gap-4 md:gap-6"
    >
      {/* LEFT: THUMBNAIL (Uncropped, natural aspect ratio, tight wrap) */}
      <div className="relative flex-shrink-0 group rounded-2xl md:rounded-3xl overflow-hidden shadow-inner self-start w-full md:w-fit mx-auto md:mx-0">
        <img 
          src={metadata.thumbnail} 
          alt="Thumbnail" 
          className="w-full md:w-auto h-auto md:max-w-[280px] lg:max-w-[320px] max-h-[360px] object-contain transition-transform duration-700 group-hover:scale-105 block" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-[2px]">
          <button 
            onClick={onDownloadThumb} 
            className="translate-y-4 group-hover:translate-y-0 bg-white/20 hover:bg-indigo-500 text-white backdrop-blur-md border border-white/30 font-semibold px-5 py-2.5 rounded-full flex items-center gap-2 transition-all duration-300 shadow-xl text-sm"
          >
            <ImageIcon size={16} /> Get Cover
          </button>
        </div>
      </div>

      {/* RIGHT: DETAILS & CONTROLS */}
      <div className="flex-1 flex flex-col justify-between py-2 md:py-4 md:pr-4">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug mb-4">
            {metadata.title}
          </h2>
          
          <div className="flex justify-end mb-3 relative z-10">
            <label className="flex items-center gap-2 cursor-pointer text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-500 transition-colors">
              <div className="relative">
                <input type="checkbox" className="peer sr-only" checked={advancedMode} onChange={(e) => setAdvancedMode(e.target.checked)} />
                <div className="w-7 h-4 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:bg-indigo-500 transition-colors"></div>
                <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-3 shadow-sm"></div>
              </div>
              Show All Codecs
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 relative z-10">
            {/* VIDEO DROPDOWN */}
            <CustomSelect 
              label="Video Quality"
              icon={Video}
              options={vFormats}
              value={selectedVideo.id}
              placeholder="None (Audio Only)"
              onChange={(id) => {
                if (!id) setSelectedVideo({ id: '', size: 0, label: 'NoVideo' });
                else {
                  const f = vFormats.find(x => x.id === id);
                  if (f) setSelectedVideo({ id: f.id, size: f.size, label: f.label });
                }
              }}
            />

            {/* AUDIO DROPDOWN */}
            <CustomSelect 
              label="Audio Track"
              icon={Music}
              options={aFormats}
              value={selectedAudio.id}
              placeholder={aFormats.length > 0 ? "None (Mute Video)" : "Included in Video"}
              onChange={(id) => {
                if (!id) setSelectedAudio({ id: '', size: 0, label: 'NoAudio' });
                else {
                  const f = aFormats.find(x => x.id === id);
                  if (f) setSelectedAudio({ id: f.id, size: f.size, label: f.label });
                }
              }}
            />
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="mt-8 flex items-center justify-between border-t border-slate-200/60 dark:border-slate-700/60 pt-5">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Est. Size</span>
            <span className="text-base md:text-lg font-black text-indigo-600 dark:text-indigo-400 leading-none">{sizeText}</span>
          </div>

          {!isDownloading ? (
            <button 
              onClick={onDownloadMedia}
              disabled={!selectedVideo.id && !selectedAudio.id}
              className="px-6 md:px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl md:rounded-2xl text-sm transition-all hover:-translate-y-0.5 active:scale-95 flex items-center gap-2 shadow-xl shadow-slate-900/10 dark:shadow-white/10 disabled:opacity-50 disabled:hover:translate-y-0"
            >
              <DownloadCloud size={18} /> Download
            </button>
          ) : (
            <div className="flex items-center gap-3 w-48 md:w-56 bg-slate-100 dark:bg-slate-800 p-2 pl-4 rounded-xl md:rounded-2xl shadow-inner">
              <Loader2 size={16} className="animate-spin text-indigo-500 flex-shrink-0" />
              <div className="flex-1 w-full bg-slate-200/50 dark:bg-slate-700/50 h-1.5 rounded-full overflow-hidden">
                <motion.div 
                  className={`h-full ${status === 'error' ? 'bg-red-500' : 'bg-indigo-500'}`}
                  initial={{ width: '0%' }}
                  animate={{ width: progress }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <span className="text-[10px] md:text-xs font-bold text-slate-500 w-8 text-right pr-2">{progress}</span>
            </div>
          )}
        </div>

      </div>
    </motion.div>
  );
}
