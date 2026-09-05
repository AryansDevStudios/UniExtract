import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ListMusic, 
  CheckSquare, 
  Square, 
  DownloadCloud, 
  Loader2, 
  ChevronDown, 
  Check, 
  X, 
  Search, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Sparkles,
  Music,
  Video
} from 'lucide-react';

const QUALITY_PRESETS = [
  { id: '1080p', label: '1080p FHD (or max available)', desc: 'Full HD with auto-fallback to 720p', isAudio: false },
  { id: '720p', label: '720p HD (Balanced)', desc: 'Fast & sharp high definition', isAudio: false },
  { id: '480p', label: '480p SD (Data Saver)', desc: 'Compact file size', isAudio: false },
  { id: 'best', label: 'Best Video (Maximum Quality)', desc: 'Highest available bitrate & resolution', isAudio: false },
  { id: 'audio', label: 'MP3 Audio Only (320kbps)', desc: 'High quality audio + ID3 metadata', isAudio: true }
];

export default function PlaylistView({ playlist, onToast }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(playlist.items.map(item => item.id)));
  const [masterQuality, setMasterQuality] = useState('1080p');
  const [overrides, setOverrides] = useState({}); // { [videoId]: '720p' | 'audio' | ... }
  const [searchQuery, setSearchQuery] = useState('');
  
  // Batch Execution State
  const [batchState, setBatchState] = useState({
    isDownloading: false,
    activeVideoId: null,
    activeJobId: null,
    currentProgress: '0%',
    overallIndex: 0,
    totalCount: 0,
    completedCount: 0,
    failedCount: 0
  });

  // Per-item status dictionary: { [videoId]: { status: 'queued'|'downloading'|'completed'|'error', progress: '0%', jobId?: string } }
  const [itemStatuses, setItemStatuses] = useState({});

  const isCancelledRef = useRef(false);
  const activeJobIdRef = useRef(null);
  const pollTimerRef = useRef(null);

  // Clean up timers on unmount
  useEffect(() => {
    const handleUnload = () => {
      const jobId = activeJobIdRef.current;
      if (jobId) {
        navigator.sendBeacon(`/api/cancel/${jobId}`);
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Filtered items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return playlist.items;
    const q = searchQuery.toLowerCase();
    return playlist.items.filter(item => 
      item.title.toLowerCase().includes(q) || 
      (item.uploader && item.uploader.toLowerCase().includes(q))
    );
  }, [playlist.items, searchQuery]);

  // Selection helpers
  const toggleSelectAll = () => {
    if (selectedIds.size === playlist.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(playlist.items.map(i => i.id)));
    }
  };

  const toggleItem = (id) => {
    if (batchState.isDownloading) return; // Prevent selection changes during active download
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setItemOverride = (id, quality) => {
    setOverrides(prev => {
      if (!quality || quality === 'inherit') {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: quality };
    });
  };

  // Trigger browser file download
  const triggerDownload = (jobId, title) => {
    const downloadUrl = `/api/file/${jobId}/${encodeURIComponent(title)}`;
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = downloadUrl;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) document.body.removeChild(a);
    }, 1500);
  };

  // Cancel Batch execution
  const cancelBatch = async () => {
    isCancelledRef.current = true;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    const currentJobId = activeJobIdRef.current;
    activeJobIdRef.current = null;

    if (currentJobId) {
      try {
        await fetch(`/api/cancel/${currentJobId}`, { method: 'POST' });
      } catch (e) {}
    }

    setBatchState(prev => ({
      ...prev,
      isDownloading: false,
      activeVideoId: null,
      activeJobId: null
    }));

    onToast('Batch download stopped. In-flight jobs cancelled.', 'info');
  };

  // Execute Batch Download
  const startBatchDownload = async () => {
    const queue = playlist.items.filter(item => selectedIds.has(item.id));
    if (queue.length === 0) {
      return onToast('Please select at least one video to download.', 'error');
    }

    isCancelledRef.current = false;
    let completedCount = 0;
    let failedCount = 0;

    // Reset status of selected items to queued
    const initialStatuses = {};
    queue.forEach(item => {
      initialStatuses[item.id] = { status: 'queued', progress: '0%' };
    });
    setItemStatuses(prev => ({ ...prev, ...initialStatuses }));

    setBatchState({
      isDownloading: true,
      activeVideoId: queue[0].id,
      activeJobId: null,
      currentProgress: '0%',
      overallIndex: 1,
      totalCount: queue.length,
      completedCount: 0,
      failedCount: 0
    });

    onToast(`Starting batch download of ${queue.length} videos...`, 'info');

    for (let i = 0; i < queue.length; i++) {
      if (isCancelledRef.current) break;

      const item = queue[i];
      const quality = overrides[item.id] || masterQuality;

      setBatchState(prev => ({
        ...prev,
        activeVideoId: item.id,
        currentProgress: '0%',
        overallIndex: i + 1
      }));

      setItemStatuses(prev => ({
        ...prev,
        [item.id]: { status: 'downloading', progress: '0%' }
      }));

      try {
        // Step 1: Initiate download on server
        const res = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: item.url,
            title: item.title,
            qualityPreset: quality
          })
        });

        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const { jobId } = await res.json();
        
        if (isCancelledRef.current) {
          await fetch(`/api/cancel/${jobId}`, { method: 'POST' });
          break;
        }

        activeJobIdRef.current = jobId;
        setBatchState(prev => ({ ...prev, activeJobId: jobId }));

        // Step 2: Poll status until finished or error
        const jobResult = await new Promise((resolve) => {
          pollTimerRef.current = setInterval(async () => {
            if (isCancelledRef.current) {
              clearInterval(pollTimerRef.current);
              return resolve({ status: 'cancelled' });
            }

            try {
              const statusRes = await fetch(`/api/status/${jobId}`);
              const data = await statusRes.json();

              if (data.status === 'cancelled') {
                clearInterval(pollTimerRef.current);
                return resolve({ status: 'cancelled' });
              }

              if (data.progress) {
                setBatchState(prev => ({ ...prev, currentProgress: data.progress }));
                setItemStatuses(prev => ({
                  ...prev,
                  [item.id]: { status: 'downloading', progress: data.progress }
                }));
              }

              if (data.status === 'completed') {
                clearInterval(pollTimerRef.current);
                return resolve({ status: 'completed', jobId });
              }

              if (data.status === 'error') {
                clearInterval(pollTimerRef.current);
                return resolve({ status: 'error' });
              }
            } catch (err) {
              // Network blip, will retry next poll
            }
          }, 1000);
        });

        activeJobIdRef.current = null;

        if (isCancelledRef.current || jobResult.status === 'cancelled') {
          break;
        }

        if (jobResult.status === 'completed') {
          completedCount++;
          setItemStatuses(prev => ({
            ...prev,
            [item.id]: { status: 'completed', progress: '100%', jobId }
          }));
          triggerDownload(jobId, item.title);
        } else {
          failedCount++;
          setItemStatuses(prev => ({
            ...prev,
            [item.id]: { status: 'error', progress: '0%' }
          }));
        }

      } catch (e) {
        failedCount++;
        setItemStatuses(prev => ({
          ...prev,
          [item.id]: { status: 'error', progress: '0%' }
        }));
      }

      setBatchState(prev => ({
        ...prev,
        completedCount,
        failedCount
      }));

      // Small pause between items to allow browser download manager to register cleanly
      if (i < queue.length - 1 && !isCancelledRef.current) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    setBatchState(prev => ({
      ...prev,
      isDownloading: false,
      activeVideoId: null,
      activeJobId: null
    }));

    if (!isCancelledRef.current) {
      onToast(`Batch complete! (${completedCount} downloaded, ${failedCount} errors)`, completedCount > 0 ? 'success' : 'error');
    }
  };

  const selectedCount = selectedIds.size;
  const totalItems = playlist.items.length;
  const isAllSelected = selectedCount === totalItems && totalItems > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 md:p-8 backdrop-blur-xl shadow-2xl space-y-6"
    >
      {/* 1. PLAYLIST HEADER BANNER */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 border-b border-slate-200/60 dark:border-slate-800/80 pb-6">
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0 shadow-lg border border-slate-200/50 dark:border-slate-700/50">
            {playlist.thumbnail ? (
              <img src={playlist.thumbnail} alt={playlist.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                <ListMusic size={32} />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <span className="absolute bottom-1.5 left-2 text-[10px] font-black text-white px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-sm">
              {totalItems} VIDEOS
            </span>
          </div>

          <div className="space-y-1 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                <ListMusic size={11} /> YouTube Playlist
              </span>
              <span className="text-xs text-slate-400 font-medium">
                by {playlist.uploader || 'Creator'}
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-snug line-clamp-2">
              {playlist.title}
            </h2>
          </div>
        </div>

        {/* Master Quality Preset Picker */}
        <div className="w-full md:w-auto flex flex-col gap-1.5 min-w-[240px]">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles size={12} className="text-indigo-500" /> Master Quality Preset
          </label>
          <div className="relative">
            <select
              value={masterQuality}
              disabled={batchState.isDownloading}
              onChange={(e) => setMasterQuality(e.target.value)}
              className="w-full bg-slate-100/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer disabled:opacity-50"
            >
              {QUALITY_PRESETS.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {QUALITY_PRESETS.find(p => p.id === masterQuality)?.desc}
          </span>
        </div>
      </div>

      {/* 2. TOOLBAR: Selection Controls & Search & Main Download Action */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-50/60 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={batchState.isDownloading}
            onClick={toggleSelectAll}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-500/50 active:scale-95 transition-all shadow-sm disabled:opacity-50"
          >
            {isAllSelected ? (
              <>
                <CheckSquare size={16} className="text-indigo-500" /> Deselect All
              </>
            ) : (
              <>
                <Square size={16} className="text-slate-400" /> Select All ({totalItems})
              </>
            )}
          </button>

          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
            <span className="text-indigo-600 dark:text-indigo-400">{selectedCount}</span> of {totalItems} selected
          </span>
        </div>

        {/* Search within playlist */}
        <div className="flex-1 max-w-xs relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search in playlist..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Action Button */}
        <div>
          {!batchState.isDownloading ? (
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={startBatchDownload}
              className="w-full md:w-auto px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl text-sm transition-all hover:shadow-lg hover:shadow-indigo-500/25 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              <DownloadCloud size={17} /> Download Selected ({selectedCount})
            </button>
          ) : (
            <div className="flex items-center gap-3 bg-slate-900 text-white px-4 py-2 rounded-xl shadow-lg border border-slate-700">
              <Loader2 size={16} className="animate-spin text-indigo-400" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                  Downloading {batchState.overallIndex} of {batchState.totalCount}
                </span>
                <span className="text-xs font-mono font-bold text-white">
                  {batchState.currentProgress}
                </span>
              </div>
              <button
                type="button"
                onClick={cancelBatch}
                title="Cancel batch download"
                className="ml-2 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white text-xs font-bold transition-colors flex items-center gap-1"
              >
                <X size={12} /> Stop
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. SCROLLABLE VIDEO LIST WITH PER-VIDEO FORMAT OVERRIDES */}
      <div className="space-y-2 max-h-[540px] overflow-y-auto custom-scroll pr-1">
        {filteredItems.map((item) => {
          const isSelected = selectedIds.has(item.id);
          const currentOverride = overrides[item.id] || '';
          const effectiveQuality = currentOverride || masterQuality;
          const statusObj = itemStatuses[item.id];
          const isCurrentActive = batchState.activeVideoId === item.id;

          return (
            <div
              key={item.id}
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl transition-all border ${
                isCurrentActive
                  ? 'bg-indigo-500/10 border-indigo-500/40 shadow-md ring-1 ring-indigo-500/20'
                  : isSelected
                  ? 'bg-white/90 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300'
                  : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200/40 dark:border-slate-800/50 opacity-60'
              }`}
            >
              {/* Left: Checkbox, Index, Thumbnail, Title */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <button
                  type="button"
                  disabled={batchState.isDownloading}
                  onClick={() => toggleItem(item.id)}
                  className="flex-shrink-0 text-slate-400 hover:text-indigo-500 transition-colors"
                >
                  {isSelected ? (
                    <CheckSquare size={19} className="text-indigo-600 dark:text-indigo-400" />
                  ) : (
                    <Square size={19} className="text-slate-300 dark:text-slate-600" />
                  )}
                </button>

                <span className="text-xs font-mono font-bold text-slate-400 w-6 text-right flex-shrink-0">
                  #{item.index}
                </span>

                <div className="relative w-20 h-12 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800 flex-shrink-0 shadow-sm">
                  <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                  {item.durationText && (
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono font-bold bg-black/70 text-white px-1 rounded">
                      {item.durationText}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1 pr-2">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs md:text-sm font-bold text-slate-800 dark:text-slate-100 hover:text-indigo-500 transition-colors line-clamp-1 flex items-center gap-1.5"
                    title={item.title}
                  >
                    {item.title}
                    <ExternalLink size={11} className="opacity-0 hover:opacity-100 flex-shrink-0" />
                  </a>
                  <p className="text-[11px] text-slate-400 truncate">
                    {item.uploader || playlist.uploader}
                  </p>
                </div>
              </div>

              {/* Right: Format Override Dropdown & Progress/Status Badge */}
              <div className="flex items-center gap-2.5 sm:flex-shrink-0 self-end sm:self-center">
                {/* Status Indicator */}
                {statusObj?.status === 'downloading' ? (
                  <div className="flex items-center gap-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-lg text-xs font-mono font-bold">
                    <Loader2 size={13} className="animate-spin" />
                    <span>{statusObj.progress || '0%'}</span>
                  </div>
                ) : statusObj?.status === 'completed' ? (
                  <div className="flex items-center gap-1.5 text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-lg text-xs font-bold">
                    <CheckCircle2 size={14} />
                    <span>Done</span>
                  </div>
                ) : statusObj?.status === 'error' ? (
                  <div className="flex items-center gap-1.5 text-red-500 bg-red-500/10 px-2.5 py-1 rounded-lg text-xs font-bold">
                    <AlertCircle size={14} />
                    <span>Failed</span>
                  </div>
                ) : statusObj?.status === 'queued' ? (
                  <span className="text-[11px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                    Queued
                  </span>
                ) : null}

                {/* Per-video Format Override */}
                <div className="flex items-center gap-1">
                  <select
                    value={currentOverride}
                    disabled={batchState.isDownloading}
                    onChange={(e) => setItemOverride(item.id, e.target.value)}
                    className={`text-xs rounded-xl px-2.5 py-1.5 border font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer ${
                      currentOverride
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <option value="">Default ({masterQuality.toUpperCase()})</option>
                    <option value="1080p">1080p FHD</option>
                    <option value="720p">720p HD</option>
                    <option value="480p">480p SD</option>
                    <option value="best">Best Video</option>
                    <option value="audio">Audio Only (MP3)</option>
                  </select>
                </div>
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">
            No videos found matching "{searchQuery}"
          </div>
        )}
      </div>
    </motion.div>
  );
}
