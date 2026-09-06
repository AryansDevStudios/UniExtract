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
  Video,
  VolumeX,
  SlidersHorizontal
} from 'lucide-react';

const ALL_VIDEO_PRESETS = [
  { id: 'best', label: 'Best Available', badge: 'BEST', desc: 'Highest resolution across videos', minHeight: 0 },
  { id: '8k', label: '8K Ultra HD (4320p)', badge: '8K', desc: '8K with auto-fallback to 4K / 1080p', minHeight: 4320 },
  { id: '4k', label: '4K Ultra HD (2160p)', badge: '4K', desc: '4K with auto-fallback to 1080p / 720p', minHeight: 2000 },
  { id: '1440p', label: '2K Quad HD (1440p)', badge: '2K', desc: '1440p QHD with auto-fallback', minHeight: 1400 },
  { id: '1080p', label: '1080p Full HD (FHD)', badge: 'FHD', desc: 'Full HD with auto-fallback to 720p', minHeight: 1000 },
  { id: '720p', label: '720p High Def (HD)', badge: 'HD', desc: 'Crisp HD quality', minHeight: 700 },
  { id: '480p', label: '480p Standard (SD)', badge: 'SD', desc: 'Compact data saver', minHeight: 460 },
  { id: '360p', label: '360p Low Bandwidth', badge: '360p', desc: 'Minimal storage size', minHeight: 300 },
  { id: 'none', label: 'No Video (Audio Only)', badge: 'NO VIDEO', desc: 'Extract and download audio track only', minHeight: 0 }
];

const RESOLUTION_HEIGHT_MAP = {
  '8k': 4320,
  '4k': 2160,
  '1440p': 1440,
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
  '360p': 360,
  'none': 0,
  'best': 9999
};

const AUDIO_PRESETS = [
  { id: 'best', label: 'Best Available Audio', badge: 'BEST', desc: 'Original high-bitrate source audio' },
  { id: '320k', label: '320 kbps (Studio MP3 / High AAC)', badge: '320K', desc: 'Audiophile grade maximum fidelity' },
  { id: '256k', label: '256 kbps (High Quality)', badge: '256K', desc: 'Clean sound with low file size' },
  { id: '192k', label: '192 kbps (Standard Quality)', badge: '192K', desc: 'Standard high-definition audio' },
  { id: '128k', label: '128 kbps (Compact MP3)', badge: '128K', desc: 'Lightweight audio files' },
  { id: 'none', label: 'No Audio (Muted Video)', badge: 'NO AUDIO', desc: 'Video stream only without audio' }
];

const AUDIO_BITRATE_MAP = {
  '320k': 320,
  '256k': 256,
  '192k': 192,
  '128k': 128,
  'none': 0,
  'best': 9999
};

export default function PlaylistView({ playlist, onToast }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(playlist.items.map(item => item.id)));
  
  // Dynamic Format Capabilities & Enrichment Progress
  const [formatCapabilities, setFormatCapabilities] = useState(() => playlist.initialFormatData || {});
  const [maxPlaylistResolution, setMaxPlaylistResolution] = useState(() => playlist.maxPlaylistResolution || '1080p');
  const [maxPlaylistAudio, setMaxPlaylistAudio] = useState(() => playlist.maxPlaylistAudio || '320k');
  const [enrichmentStatus, setEnrichmentStatus] = useState({
    isDone: !!playlist.isFormatsComplete,
    completed: Object.keys(playlist.initialFormatData || {}).length,
    total: playlist.itemCount || playlist.items.length
  });

  // Master Quality Selectors
  const [masterVideo, setMasterVideo] = useState(() => playlist.maxPlaylistResolution || '1080p');
  const [masterAudio, setMasterAudio] = useState('best');
  const userSelectedMasterVideoRef = useRef(false);
  const userSelectedMasterAudioRef = useRef(false);
  
  // Per-video overrides: { [videoId]: { video?: string, audio?: string } }
  const [overrides, setOverrides] = useState({});
  const [searchQuery, setSearchQuery] = useState('');

  // Background polling for per-video format capabilities
  useEffect(() => {
    if (enrichmentStatus.isDone) return;
    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/playlist-formats/${playlist.id}`);
        const data = await res.json();
        if (!isMounted) return;

        if (data.items) {
          setFormatCapabilities(prev => ({ ...prev, ...data.items }));
        }
        if (data.maxPlaylistResolution) {
          setMaxPlaylistResolution(data.maxPlaylistResolution);
          if (!userSelectedMasterVideoRef.current) {
            setMasterVideo(data.maxPlaylistResolution);
          }
        }
        if (data.maxPlaylistAudio) {
          setMaxPlaylistAudio(data.maxPlaylistAudio);
          if (!userSelectedMasterAudioRef.current && data.maxPlaylistAudio === 'none') {
            setMasterAudio('none');
          }
        }
        setEnrichmentStatus({
          isDone: !!data.isDone,
          completed: data.completed || 0,
          total: data.total || playlist.items.length
        });
        if (data.isDone) {
          clearInterval(interval);
        }
      } catch (e) {}
    }, 1200);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [playlist.id, enrichmentStatus.isDone]);
  
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

  // Per-item status dictionary: { [videoId]: { status: 'queued'|'downloading'|'completed'|'error', progress: '0%', resolvedFormat?: string, jobId?: string } }
  const [itemStatuses, setItemStatuses] = useState({});

  const isCancelledRef = useRef(false);
  const activeJobIdRef = useRef(null);
  const pollTimerRef = useRef(null);

  // Clean up timers & abort on unmount or tab close
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

  // Available Master Video Presets filtered by maxPlaylistResolution
  const availableMasterVideoPresets = useMemo(() => {
    const maxAllowedHeight = RESOLUTION_HEIGHT_MAP[maxPlaylistResolution] || 1080;
    return ALL_VIDEO_PRESETS.filter(p => {
      if (p.id === 'best' || p.id === 'none') return true;
      return p.minHeight <= maxAllowedHeight;
    }).map(p => {
      if (p.id === 'best') {
        return { ...p, label: `Best Available (${maxPlaylistResolution.toUpperCase()})` };
      }
      return p;
    });
  }, [maxPlaylistResolution]);

  // Helper to get allowed video presets for an individual item
  const getItemVideoPresets = (itemId) => {
    const caps = formatCapabilities[itemId];
    if (!caps || !caps.videoResolutions || caps.videoResolutions.length === 0) {
      return availableMasterVideoPresets.filter(p => p.id !== 'best' && p.id !== 'none');
    }
    const supportedSet = new Set(caps.videoResolutions);
    return ALL_VIDEO_PRESETS.filter(p => {
      if (p.id === 'best' || p.id === 'none') return false;
      return supportedSet.has(p.id);
    });
  };

  // Available Master Audio Presets filtered by maxPlaylistAudio
  const availableMasterAudioPresets = useMemo(() => {
    if (maxPlaylistAudio === 'none') {
      return AUDIO_PRESETS.filter(p => p.id === 'none');
    }
    const maxAllowedAbr = AUDIO_BITRATE_MAP[maxPlaylistAudio] || 320;
    return AUDIO_PRESETS.filter(p => {
      if (p.id === 'best' || p.id === 'none') return true;
      return (AUDIO_BITRATE_MAP[p.id] || 0) <= maxAllowedAbr;
    }).map(p => {
      if (p.id === 'best') {
        const topBadge = maxPlaylistAudio && maxPlaylistAudio !== 'best' && maxPlaylistAudio !== 'none'
          ? ` (${maxPlaylistAudio.toUpperCase()})`
          : '';
        return { ...p, label: `Best Available Audio${topBadge}` };
      }
      return p;
    });
  }, [maxPlaylistAudio]);

  // Helper to get allowed audio presets for an individual item
  const getItemAudioPresets = (itemId) => {
    const caps = formatCapabilities[itemId];
    const audioCaps = caps?.audio;
    if (audioCaps && audioCaps.hasAudio === false) {
      return [];
    }
    if (!audioCaps || !audioCaps.audioQualities || audioCaps.audioQualities.length === 0) {
      return availableMasterAudioPresets.filter(p => p.id !== 'best' && p.id !== 'none');
    }
    const supportedSet = new Set(audioCaps.audioQualities);
    return AUDIO_PRESETS.filter(p => {
      if (p.id === 'best' || p.id === 'none') return false;
      return supportedSet.has(p.id);
    });
  };

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
    if (batchState.isDownloading) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setItemVideoOverride = (id, val) => {
    setOverrides(prev => {
      const cur = prev[id] || {};
      const next = { ...cur };
      if (!val || val === 'inherit') {
        delete next.video;
      } else {
        next.video = val;
      }
      if (Object.keys(next).length === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  };

  const setItemAudioOverride = (id, val) => {
    setOverrides(prev => {
      const cur = prev[id] || {};
      const next = { ...cur };
      if (!val || val === 'inherit') {
        delete next.audio;
      } else {
        next.audio = val;
      }
      if (Object.keys(next).length === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  };

  // Helper to determine effective configuration for an item
  const getEffectiveConfig = (itemId) => {
    const itemOv = overrides[itemId] || {};
    const caps = formatCapabilities[itemId];
    const itemMaxRes = caps?.maxRes || '1080p';
    const audioCaps = caps?.audio;
    const hasAudio = audioCaps ? audioCaps.hasAudio !== false : true;
    const itemMaxAudio = audioCaps?.maxAudioRes || '320k';

    let video = itemOv.video;
    if (!video) {
      if (masterVideo === 'none') {
        video = 'none';
      } else if (masterVideo === 'best') {
        video = itemMaxRes;
      } else {
        const masterH = RESOLUTION_HEIGHT_MAP[masterVideo] || 1080;
        const itemH = caps?.maxHeight || 1080;
        video = masterH > itemH ? itemMaxRes : masterVideo;
      }
    }

    let audio = itemOv.audio;
    if (!audio) {
      if (!hasAudio || masterAudio === 'none') {
        audio = 'none';
      } else if (masterAudio === 'best') {
        audio = itemMaxAudio;
      } else {
        const masterAbr = AUDIO_BITRATE_MAP[masterAudio] || 320;
        const itemAbr = AUDIO_BITRATE_MAP[itemMaxAudio] || 320;
        audio = masterAbr > itemAbr ? itemMaxAudio : masterAudio;
      }
    }

    return { video, audio };
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

    if (masterVideo === 'none' && masterAudio === 'none') {
      return onToast('Cannot download: Both Master Video and Audio are set to None.', 'error');
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
      const { video, audio } = getEffectiveConfig(item.id);

      if (video === 'none' && audio === 'none') {
        failedCount++;
        setItemStatuses(prev => ({
          ...prev,
          [item.id]: { status: 'error', progress: '0%' }
        }));
        continue;
      }

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
        const res = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: item.url,
            title: item.title,
            videoQuality: video,
            audioQuality: audio
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
                return resolve({ 
                  status: 'completed', 
                  jobId, 
                  resolvedFormat: data.resolvedFormat 
                });
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
            [item.id]: { 
              status: 'completed', 
              progress: '100%', 
              jobId, 
              resolvedFormat: jobResult.resolvedFormat 
            }
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
  const isBothNone = masterVideo === 'none' && masterAudio === 'none';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="w-full bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 md:p-8 backdrop-blur-xl shadow-2xl space-y-6"
    >
      {/* 1. PLAYLIST HEADER BANNER */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 border-b border-slate-200/60 dark:border-slate-800/80 pb-6">
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

          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                <ListMusic size={11} /> YouTube Playlist
              </span>
              <span className="text-xs text-slate-400 font-medium truncate">
                by {playlist.uploader || 'Creator'}
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-snug line-clamp-2">
              {playlist.title}
            </h2>
          </div>
        </div>

        {/* Master Quality Controls: Independent Video & Audio Selectors */}
        <div className="w-full lg:w-auto flex flex-col sm:flex-row gap-4 bg-slate-50/80 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
          {/* Master Video Selector */}
          <div className="flex-1 sm:w-56 space-y-1">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Video size={12} className="text-indigo-500" /> Master Video Quality
            </label>
            <select
              value={masterVideo}
              disabled={batchState.isDownloading}
              onChange={(e) => {
                userSelectedMasterVideoRef.current = true;
                const val = e.target.value;
                setMasterVideo(val);
                if (val === 'best') {
                  userSelectedMasterAudioRef.current = true;
                  setMasterAudio('best');
                }
              }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer disabled:opacity-50"
            >
              {availableMasterVideoPresets.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <span className="text-[9px] text-slate-400 block truncate">
              {availableMasterVideoPresets.find(p => p.id === masterVideo)?.desc || 'Max resolution across playlist'}
            </span>
          </div>

          {/* Master Audio Selector */}
          <div className="flex-1 sm:w-56 space-y-1">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Music size={12} className="text-purple-500" /> Master Audio Quality
            </label>
            <select
              value={masterAudio}
              disabled={batchState.isDownloading}
              onChange={(e) => {
                userSelectedMasterAudioRef.current = true;
                setMasterAudio(e.target.value);
              }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/40 cursor-pointer disabled:opacity-50"
            >
              {availableMasterAudioPresets.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <span className="text-[9px] text-slate-400 block truncate">
              {availableMasterAudioPresets.find(p => p.id === masterAudio)?.desc || 'Max audio quality across playlist'}
            </span>
          </div>
        </div>
      </div>

      {/* Media Format Codec Analysis Status Banner */}
      <div className="w-full">
        {!enrichmentStatus.isDone ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 px-4 py-2.5 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 rounded-2xl text-xs">
            <div className="flex items-center gap-2.5 text-indigo-700 dark:text-indigo-300 font-medium">
              <Loader2 size={15} className="animate-spin text-indigo-500 flex-shrink-0" />
              <span>
                Analyzing media streams & codecs for individual videos: <strong>{enrichmentStatus.completed} of {enrichmentStatus.total}</strong> verified
              </span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700">
                Max Video: {maxPlaylistResolution.toUpperCase()}
              </span>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-200 border border-purple-200 dark:border-purple-700">
                Max Audio: {maxPlaylistAudio.toUpperCase()}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 px-4 py-2 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 rounded-2xl text-xs">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-medium">
              <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
              <span>
                Exact video & audio format capabilities verified for all <strong>{enrichmentStatus.total}</strong> videos
              </span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
                Top Video: {maxPlaylistResolution.toUpperCase()}
              </span>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-200 border border-purple-200 dark:border-purple-700">
                Top Audio: {maxPlaylistAudio.toUpperCase()}
              </span>
            </div>
          </div>
        )}
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
              disabled={selectedCount === 0 || isBothNone}
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
      <div className="space-y-2.5 max-h-[560px] overflow-y-auto custom-scroll pr-1">
        {filteredItems.map((item) => {
          const isSelected = selectedIds.has(item.id);
          const itemOv = overrides[item.id] || {};
          const effectiveVideo = itemOv.video !== undefined ? itemOv.video : masterVideo;
          const effectiveAudio = itemOv.audio !== undefined ? itemOv.audio : masterAudio;
          const statusObj = itemStatuses[item.id];
          const isCurrentActive = batchState.activeVideoId === item.id;

          const caps = formatCapabilities[item.id];
          const itemMaxRes = caps?.maxRes || '1080p';
          const audioCaps = caps?.audio;
          const videoHasAudio = audioCaps ? audioCaps.hasAudio !== false : true;
          const itemMaxAudio = audioCaps?.maxAudioRes || '320k';

          // Clean, un-cluttered effective resolution and audio
          let computedVideo = itemOv.video;
          if (!computedVideo) {
            if (masterVideo === 'none') {
              computedVideo = 'none';
            } else if (masterVideo === 'best') {
              computedVideo = itemMaxRes;
            } else {
              const masterH = RESOLUTION_HEIGHT_MAP[masterVideo] || 1080;
              const itemH = caps?.maxHeight || 1080;
              computedVideo = masterH > itemH ? itemMaxRes : masterVideo;
            }
          }

          let computedAudio = itemOv.audio;
          if (!computedAudio) {
            if (!videoHasAudio || masterAudio === 'none') {
              computedAudio = 'none';
            } else if (masterAudio === 'best') {
              computedAudio = itemMaxAudio;
            } else {
              const masterAbr = AUDIO_BITRATE_MAP[masterAudio] || 320;
              const itemAbr = AUDIO_BITRATE_MAP[itemMaxAudio] || 320;
              computedAudio = masterAbr > itemAbr ? itemMaxAudio : masterAudio;
            }
          }

          const videoPreset = ALL_VIDEO_PRESETS.find(p => p.id === computedVideo);
          const defaultVideoLabel = videoPreset ? videoPreset.label : computedVideo.toUpperCase();

          const audioPreset = AUDIO_PRESETS.find(p => p.id === computedAudio);
          const defaultAudioLabel = !videoHasAudio 
            ? 'No Audio (Muted Video)'
            : (audioPreset ? audioPreset.label : computedAudio.toUpperCase());

          // Format Summary Tag (Clean, simple, no clutter)
          let formatTag = '';
          if (computedVideo === 'none' && computedAudio === 'none') {
            formatTag = '⚠️ No Media Selected';
          } else if (computedVideo === 'none') {
            const aBadge = audioPreset?.badge || computedAudio.toUpperCase();
            formatTag = `🎵 Audio (${aBadge})`;
          } else if (computedAudio === 'none' || !videoHasAudio) {
            const vBadge = videoPreset?.badge || computedVideo.toUpperCase();
            formatTag = `🎬 ${vBadge} (Muted)`;
          } else {
            const vBadge = videoPreset?.badge || computedVideo.toUpperCase();
            const aBadge = audioPreset?.badge || computedAudio.toUpperCase();
            formatTag = `🎬 ${vBadge} + 🎵 ${aBadge}`;
          }

          return (
            <div
              key={item.id}
              className={`flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 p-3.5 rounded-2xl transition-all border ${
                isCurrentActive
                  ? 'bg-indigo-50/10 border-indigo-500/40 shadow-md ring-1 ring-indigo-500/20'
                  : isSelected
                  ? 'bg-white/90 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300'
                  : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200/40 dark:border-slate-800/50 opacity-60'
              }`}
            >
              {/* Left: Checkbox, Index, Thumbnail, Title, Quality Badges */}
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

                <div className="relative w-24 h-14 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800 flex-shrink-0 shadow-sm">
                  <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                  {item.durationText && (
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono font-bold bg-black/75 text-white px-1 rounded">
                      {item.durationText}
                    </span>
                  )}
                  {(() => {
                    const badgeText = caps?.qualityBadge || item.qualityHint || 'HD';
                    const isHighEnd = badgeText.includes('8K') || badgeText.includes('4K');
                    return (
                      <div className="absolute top-1 left-1 flex items-center gap-1">
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm ${
                          isHighEnd
                            ? 'bg-amber-500 text-black font-extrabold'
                            : 'bg-indigo-600 text-white'
                        }`}>
                          {badgeText}
                        </span>
                        {!videoHasAudio && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm bg-red-500/90 text-white">
                            Muted
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="min-w-0 flex-1 pr-2 space-y-1">
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

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-slate-400 truncate">
                      {item.uploader || playlist.uploader}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {formatTag}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Individual Overrides (Video & Audio) & Status Badge */}
              <div className="flex items-center gap-2.5 flex-wrap lg:flex-nowrap sm:flex-shrink-0 self-end lg:self-center">
                {/* Status Indicator */}
                {statusObj?.status === 'downloading' ? (
                  <div className="flex items-center gap-1.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-lg text-xs font-mono font-bold">
                    <Loader2 size={13} className="animate-spin" />
                    <span>{statusObj.progress || '0%'}</span>
                  </div>
                ) : statusObj?.status === 'completed' ? (
                  <div className="flex items-center gap-1.5 text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap">
                    <CheckCircle2 size={14} />
                    <span>{statusObj.resolvedFormat || 'Done'}</span>
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

                {/* Per-Video Video Selector */}
                <div className="flex items-center gap-1">
                  <select
                    value={itemOv.video || ''}
                    disabled={batchState.isDownloading}
                    onChange={(e) => setItemVideoOverride(item.id, e.target.value)}
                    title={`Video Quality: ${defaultVideoLabel}`}
                    className={`text-xs rounded-xl px-2.5 py-1.5 border font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer ${
                      itemOv.video
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold'
                    }`}
                  >
                    {(() => {
                      const allowed = getItemVideoPresets(item.id);
                      return (
                        <>
                          <option value="">{defaultVideoLabel}</option>
                          {allowed.map(p => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                          ))}
                          <option value="none">No Video (Audio Only)</option>
                        </>
                      );
                    })()}
                  </select>
                </div>

                {/* Per-Video Audio Selector */}
                <div className="flex items-center gap-1">
                  <select
                    value={itemOv.audio || ''}
                    disabled={batchState.isDownloading || !videoHasAudio}
                    onChange={(e) => setItemAudioOverride(item.id, e.target.value)}
                    title={videoHasAudio ? `Audio Quality: ${defaultAudioLabel}` : 'This video stream has no audio tracks'}
                    className={`text-xs rounded-xl px-2.5 py-1.5 border font-medium focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors cursor-pointer ${
                      !videoHasAudio
                        ? 'bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                        : itemOv.audio
                        ? 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 font-bold'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold'
                    }`}
                  >
                    {!videoHasAudio ? (
                      <option value="">No Audio (Muted Video)</option>
                    ) : (
                      (() => {
                        const allowedAudio = getItemAudioPresets(item.id);
                        return (
                          <>
                            <option value="">{defaultAudioLabel}</option>
                            {allowedAudio.map(p => (
                              <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                            <option value="none">No Audio (Muted Video)</option>
                          </>
                        );
                      })()
                    )}
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
