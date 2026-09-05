import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Image as ImageIcon, Video, Music, DownloadCloud, Loader2 } from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes) return '-- MB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
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
  if (!metadata) return null;

  // Filter and sort formats compactly
  const vFormats = useMemo(() => {
    let list = metadata.formats.filter(f => f.vcodec).sort((a, b) => (b.height - a.height) || (b.size - a.size));
    const seen = new Set();
    return list.filter(f => {
      if (seen.has(f.resolution)) return false;
      seen.add(f.resolution);
      return true;
    });
  }, [metadata]);

  const aFormats = useMemo(() => {
    return metadata.formats.filter(f => f.acodec && !f.vcodec).sort((a, b) => b.size - a.size);
  }, [metadata]);

  const totalSize = (selectedVideo.size || 0) + (selectedAudio.size || 0);
  const sizeText = totalSize > 0 ? formatBytes(totalSize) : 'Unknown Size';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -15, scale: 0.98 }}
      className="mt-6 w-full bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-3xl p-2 shadow-lg overflow-hidden flex flex-col md:flex-row"
    >
      {/* LEFT: THUMBNAIL */}
      <div className="relative w-full md:w-48 lg:w-56 aspect-video md:aspect-square flex-shrink-0 group rounded-2xl overflow-hidden bg-black/5">
        <img src={metadata.thumbnail} alt="Thumbnail" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
          <button onClick={onDownloadThumb} className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-xs font-medium px-4 py-2 rounded-full flex items-center gap-2 transition-colors">
            <ImageIcon size={14} /> Get Cover
          </button>
        </div>
      </div>

      {/* RIGHT: DETAILS & CONTROLS */}
      <div className="flex-1 p-4 md:p-6 flex flex-col justify-between">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug">
            {metadata.title}
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
            {/* VIDEO DROPDOWN */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Video size={12} /> Video Quality
              </label>
              <div className="relative">
                <select 
                  className="w-full appearance-none bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                  value={selectedVideo.id}
                  onChange={(e) => {
                    if (e.target.value === '') {
                      setSelectedVideo({ id: '', size: 0, label: 'NoVideo' });
                    } else {
                      const f = vFormats.find(x => x.id === e.target.value);
                      if (f) setSelectedVideo({ id: f.id, size: f.size, label: f.label });
                    }
                  }}
                >
                  <option value="">None (Audio Only)</option>
                  {vFormats.map(f => (
                    <option key={f.id} value={f.id}>{f.resolution} • {formatBytes(f.size)}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
            </div>

            {/* AUDIO DROPDOWN */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Music size={12} /> Audio Track
              </label>
              <div className="relative">
                <select 
                  className="w-full appearance-none bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                  value={selectedAudio.id}
                  onChange={(e) => {
                    if (e.target.value === '') {
                      setSelectedAudio({ id: '', size: 0, label: 'NoAudio' });
                    } else {
                      const f = aFormats.find(x => x.id === e.target.value);
                      if (f) setSelectedAudio({ id: f.id, size: f.size, label: f.label });
                    }
                  }}
                >
                  {aFormats.length > 0 ? (
                    <>
                      <option value="">None (Mute Video)</option>
                      {aFormats.map(f => (
                        <option key={f.id} value={f.id}>{f.abr || 'High Quality'} • {formatBytes(f.size)}</option>
                      ))}
                    </>
                  ) : (
                    <option value="">Included in Video</option>
                  )}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
          <div className="flex flex-col">
            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Est. Size</span>
            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{sizeText}</span>
          </div>

          {!isDownloading ? (
            <button 
              onClick={onDownloadMedia}
              disabled={!selectedVideo.id && !selectedAudio.id}
              className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold rounded-xl text-sm transition-transform active:scale-95 flex items-center gap-2 shadow-md disabled:opacity-50"
            >
              <DownloadCloud size={16} /> Download
            </button>
          ) : (
            <div className="flex items-center gap-3 w-48">
              <Loader2 size={16} className="animate-spin text-indigo-500 flex-shrink-0" />
              <div className="flex-1 w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <motion.div 
                  className={`h-full ${status === 'error' ? 'bg-red-500' : 'bg-indigo-500'}`}
                  initial={{ width: '0%' }}
                  animate={{ width: progress }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <span className="text-xs font-bold text-slate-500 w-8 text-right">{progress}</span>
            </div>
          )}
        </div>

      </div>
    </motion.div>
  );
}
