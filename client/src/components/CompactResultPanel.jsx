import React, { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Video, Music, DownloadCloud, Loader2, ChevronDown, Check, X, SlidersHorizontal, VolumeX, VideoOff } from 'lucide-react';
import ClipPanel, { toSeconds } from './ClipPanel';
import LanguagePanel from './LanguagePanel';

function formatBytes(bytes) {
  if (!bytes) return '-- MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB (${mb.toFixed(1)} MB)`;
  }
  return `${mb.toFixed(1)} MB`;
}

function CustomSelect({ 
  label, 
  icon: Icon, 
  options, 
  value, 
  onChange, 
  placeholder, 
  dropUp = false,
  align = 'left' 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Robust click outside and Escape key handling
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption = options.find(o => o.id === value) || { 
    id: '', 
    title: placeholder || 'Select Option', 
    display: placeholder || 'Select Option', 
    isPlaceholder: true 
  };

  return (
    <div className="space-y-1.5 w-full" ref={containerRef}>
      {label && (
        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
          {Icon && <Icon size={12} className="text-cyan-500 dark:text-cyan-400" />} {label}
        </label>
      )}
      <div className={`relative w-full ${isOpen ? 'z-50' : 'z-10'}`}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className="w-full flex items-center justify-between gap-2 bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 hover:border-cyan-500/50 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-200 cursor-pointer transition-all shadow-xs select-none outline-none"
        >
          {/* Left: Badges & Title */}
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            {selectedOption.badge && (
              <span className={`text-[10px] font-mono font-black uppercase px-1.5 py-0.5 rounded flex-shrink-0 tracking-wider ${selectedOption.badgeClass || 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'}`}>
                {selectedOption.badge}
              </span>
            )}
            <span className="truncate font-mono font-medium text-xs sm:text-sm text-slate-900 dark:text-slate-100">
              {selectedOption.title || selectedOption.display}
            </span>
            {selectedOption.isOriginal && (
              <span className="text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:emerald-300 border border-emerald-500/30 flex-shrink-0">
                ORIGINAL
              </span>
            )}
          </div>

          {/* Right: File Size Pill & Chevron */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {selectedOption.sizeText && !selectedOption.isPlaceholder && (
              <span className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-300/60 dark:border-slate-700/60 whitespace-nowrap">
                {selectedOption.sizeText}
              </span>
            )}
            <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180 text-cyan-500 dark:text-cyan-400' : ''}`} />
          </div>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: dropUp ? -4 : 4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: dropUp ? -4 : 4, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className={`absolute z-50 ${dropUp ? 'bottom-full mb-2' : 'mt-2'} ${
                align === 'right' ? 'left-0 sm:left-auto sm:right-0' : 'left-0'
              } w-full min-w-full sm:min-w-[360px] md:min-w-[420px] max-w-[calc(100vw-2rem)] bg-white/95 dark:bg-[#0c1017]/95 border border-slate-200 dark:border-slate-700/90 rounded-2xl shadow-2xl shadow-slate-900/20 dark:shadow-black/90 overflow-hidden backdrop-blur-2xl`}
            >
              <div className="max-h-72 overflow-y-auto p-1.5 flex flex-col gap-1">
                {/* None / Mute placeholder button */}
                {placeholder && value !== '' && options.some(o => o.id === '') === false && (
                  <>
                    <button
                      type="button"
                      onClick={() => { onChange(''); setIsOpen(false); }}
                      className="flex items-center justify-between w-full text-left px-3 py-2 rounded-xl text-xs sm:text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-500 dark:text-slate-400 italic font-mono"
                    >
                      <span className="flex items-center gap-2 truncate">
                        {label?.toLowerCase().includes('video') ? <VideoOff size={14} className="text-slate-400 flex-shrink-0" /> : <VolumeX size={14} className="text-slate-400 flex-shrink-0" />}
                        <span>{placeholder}</span>
                      </span>
                      <span className="text-[11px] not-italic text-slate-400 font-mono">0 MB</span>
                    </button>
                    <div className="my-0.5 border-t border-slate-100 dark:border-slate-800" />
                  </>
                )}

                {/* Dropdown Options */}
                {options.map((opt) => {
                  const isSelected = value === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => { onChange(opt.id); setIsOpen(false); }}
                      className={`group flex items-center justify-between w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                        isSelected
                          ? 'bg-cyan-500/15 dark:bg-cyan-500/20 border border-cyan-500/40 text-cyan-950 dark:text-cyan-100 shadow-xs'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {/* Left: Badge + Title + Subtitle */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                        {opt.badge && (
                          <span className={`text-[10px] font-mono font-black uppercase px-1.5 py-0.5 rounded-md flex-shrink-0 tracking-wider ${opt.badgeClass || 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                            {opt.badge}
                          </span>
                        )}
                        <div className="flex flex-col min-w-0 leading-tight">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs sm:text-sm font-semibold truncate">
                              {opt.title || opt.display}
                            </span>
                            {opt.isOriginal && (
                              <span className="text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex-shrink-0">
                                ORIGINAL
                              </span>
                            )}
                          </div>
                          {opt.subtitle && (
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {opt.subtitle}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: File Size + Checkmark */}
                      <div className="flex items-center gap-2 flex-shrink-0 pl-2">
                        {opt.sizeText && (
                          <span className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/90 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700/60">
                            {opt.sizeText}
                          </span>
                        )}
                        {isSelected ? (
                          <Check size={16} className="text-cyan-600 dark:text-cyan-400 flex-shrink-0" />
                        ) : (
                          <div className="w-4 flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })}
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
 selectedContainer, setSelectedContainer,
 splitChapters, setSplitChapters,
 clipStart, setClipStart,
 clipEnd, setClipEnd,
 audioLang, setAudioLang,
 embedSubs, setEmbedSubs,
 subLang, setSubLang,
 onDownloadThumb, 
 onDownloadMedia,
 onCancelDownload,
 isDownloading,
 progress,
 status,
 downloadSpeed,
 downloadEta
}) {
 const [advancedMode, setAdvancedMode] = useState(false);

 if (!metadata) return null;

 // Video and Audio size calculation with duration fallback approximation
 const dur = metadata.duration && metadata.duration > 0 ? metadata.duration : 210;

  const vFormats = useMemo(() => {
    let list = metadata.formats.filter(f => f.vcodec);
    
    if (!advancedMode) {
      // Standard mode: smallest file per resolution
      list = list.sort((a, b) => (b.height - a.height) || ((a.size || Infinity) - (b.size || Infinity)));
      const seen = new Set();
      list = list.filter(f => {
        if (seen.has(f.resolution)) return false;
        seen.add(f.resolution);
        return true;
      });
    } else {
      // Advanced mode: largest file per resolution first (descending)
      list = list.sort((a, b) => (b.height - a.height) || ((b.size || 0) - (a.size || 0)));
    }

    return list.map(f => {
      const sizeStr = formatBytes(f.size);
      const codec = f.codec_info || (f.vcodec ? f.vcodec.split('.')[0] : '');
      const fpsStr = f.fps && f.fps > 30 ? `${f.fps}fps` : (f.fps ? `${f.fps}fps` : '');
      const qualityTag = f.label || (f.height >= 2160 ? '4K' : f.height >= 1440 ? '2K' : f.height >= 1080 ? 'FHD' : f.height >= 720 ? 'HD' : 'SD');

      let badgeClass = 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
      if (qualityTag === '8K' || f.height >= 4320) {
        badgeClass = 'bg-purple-500/20 text-purple-700 dark:purple-300 border border-purple-500/30';
      } else if (qualityTag === '4K' || f.height >= 2160) {
        badgeClass = 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30';
      } else if (qualityTag === '2K' || qualityTag === 'FHD' || f.height >= 1080) {
        badgeClass = 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30';
      } else if (qualityTag === 'HD' || f.height >= 720) {
        badgeClass = 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30';
      }

      const subtitleParts = [codec, fpsStr, f.ext ? f.ext.toUpperCase() : ''].filter(Boolean);

      return {
        ...f,
        badge: qualityTag,
        badgeClass,
        title: advancedMode && fpsStr ? `${f.resolution} (${fpsStr})` : f.resolution,
        subtitle: subtitleParts.join(' • '),
        sizeText: sizeStr,
        display: advancedMode 
          ? `${f.resolution} • ${codec} • ${fpsStr ? fpsStr + ' • ' : ''}${sizeStr}`
          : `${f.resolution} • ${sizeStr}`
      };
    });
  }, [metadata, advancedMode]);

  const aFormats = useMemo(() => {
    // Filter out audio streams that have no bitrate and no filesize (e.g. invalid manifest fragments)
    let list = metadata.formats.filter(f => f.acodec && !f.vcodec && (f.abr || f.size > 0));
    const audioTracks = metadata.audioTracks || [];

    if (!advancedMode) {
      // Normal mode:
      if (audioTracks.length > 1) {
        // Multi-language video: keep best quality stream per language
        const langMap = new Map();
        list.forEach(f => {
          const track = audioTracks.find(t => t.id === f.id);
          const langKey = track?.language || f.language || 'Default';
          const abrVal = parseInt(f.abr) || 0;
          const existing = langMap.get(langKey);
          if (!existing || abrVal > (parseInt(existing.abr) || 0)) {
            langMap.set(langKey, f);
          }
        });
        list = [...langMap.values()];
      } else {
        // Single-language video: display all available distinct audio bitrates cleanly
        list = list.sort((a, b) => {
          const abrA = parseInt(a.abr) || 0;
          const abrB = parseInt(b.abr) || 0;
          if (abrA !== abrB) return abrB - abrA;
          return (b.size || 0) - (a.size || 0);
        });

        const seen = new Set();
        list = list.filter(f => {
          const key = parseInt(f.abr) || Math.round(((f.size || 0) * 8) / (dur || 210) / 1000) || 'Audio';
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    } else {
      // Advanced mode: largest file per bitrate first (descending), original track prioritized
      list = list.sort((a, b) => {
        if (a.isOriginal && !b.isOriginal) return -1;
        if (!a.isOriginal && b.isOriginal) return 1;
        const abrA = parseInt(a.abr) || 0;
        const abrB = parseInt(b.abr) || 0;
        if (abrA !== abrB) return abrB - abrA;
        return (b.size || 0) - (a.size || 0);
      });
    }

    return list.map(f => {
      const track = audioTracks.find(t => t.id === f.id);
      const trackLang = f.language || track?.language || '';
      const isOriginal = Boolean(f.isOriginal || track?.isOriginal || (trackLang && trackLang.toLowerCase().includes('original')));
      const abrVal = parseInt(f.abr);
      const channels = f.audio_channels === 6 ? '5.1 Surround' : f.audio_channels === 2 ? 'Stereo' : f.audio_channels ? `${f.audio_channels} Ch` : 'Stereo';
      const codec = (f.codec_info || (f.acodec ? f.acodec.split('.')[0] : 'AUD')).toUpperCase();
      const sizeStr = formatBytes(f.size || Math.round((abrVal ? abrVal * 1000 : 160000) * dur / 8));

      // Title: Use track language if available, else bitrate
      const title = trackLang ? trackLang : (abrVal ? `${abrVal} kbps` : 'Audio Track');

      // Subtitle: Codec, bitrate (if title is language), channels
      const subParts = [];
      if (trackLang && abrVal) subParts.push(`${abrVal} kbps`);
      subParts.push(codec);
      if (advancedMode) subParts.push(channels);
      const subtitle = subParts.join(' • ');

      return {
        ...f,
        badge: codec,
        badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
        title,
        subtitle,
        sizeText: sizeStr,
        isOriginal,
        display: advancedMode 
          ? `${f.codec_info || f.acodec} • ${abrVal || '??'} kbps • ${channels} • ${sizeStr}`
          : `${title} • ${sizeStr}`
      };
    });
  }, [metadata, advancedMode, dur]);

  const containerOptions = useMemo(() => {
    const isVideoSelected = Boolean(selectedVideo.id);

    if (isVideoSelected) {
      // Containers for VIDEO (Video + Audio or Video Only)
      if (advancedMode) {
        return [
          { id: 'default', badge: 'AUTO', title: 'Auto (MP4)', subtitle: 'Original stream format', display: 'Auto (MP4)' },
          { id: 'mp4', badge: 'MP4', title: 'MP4 Container', subtitle: 'Universal compatibility', display: 'MP4' },
          { id: 'mkv', badge: 'MKV', title: 'MKV Container', subtitle: 'Supports multi-track audio & subs', display: 'MKV' },
          { id: 'webm', badge: 'WEBM', title: 'WebM Container', subtitle: 'Modern web format', display: 'WebM' }
        ];
      }
      // Normal user with video has container dropdown hidden (defaults to MP4)
      return [];
    } else {
      // Containers for AUDIO ONLY
      if (advancedMode) {
        return [
          { id: 'mp3', badge: 'MP3', title: 'MP3 (320 kbps)', subtitle: 'Universal compatibility', display: 'MP3' },
          { id: 'm4a', badge: 'M4A', title: 'AAC / M4A', subtitle: 'High quality streaming audio', display: 'M4A' },
          { id: 'opus', badge: 'OPUS', title: 'OPUS Audio', subtitle: 'Modern high-efficiency codec', display: 'OPUS' },
          { id: 'flac', badge: 'FLAC', title: 'FLAC Lossless', subtitle: 'Audiophile compression', display: 'FLAC' },
          { id: 'wav', badge: 'WAV', title: 'WAV Uncompressed', subtitle: 'Studio master audio', display: 'WAV' },
          { id: 'mkv', badge: 'MKV', title: 'MKV Audio', subtitle: 'Container for audio stream', display: 'MKV' }
        ];
      }
      // Normal user in Audio Only mode
      return [
        { id: 'mp3', badge: 'MP3', title: 'Most Supported (MP3)', subtitle: 'Universal playback on any device', display: 'Most Supported (MP3)' },
        { id: 'm4a', badge: 'M4A', title: 'High Quality (M4A)', subtitle: 'Better fidelity at smaller size', display: 'High Quality (M4A)' }
      ];
    }
  }, [advancedMode, selectedVideo.id]);

 const vSize = selectedVideo.id 
 ? (selectedVideo.size || Math.round((((parseInt(selectedVideo.label) || 1080) >= 1080 ? 2500000 : 1000000) * dur) / 8))
 : 0;

 const aSize = useMemo(() => {
 if (!selectedAudio.id) return 0;
 
 // When in audio-only mode, data consumption reflects the target format/container
 if (!selectedVideo.id) {
 if (selectedContainer === 'm4a') {
 return Math.round((140000 * dur) / 8);
 }
 if (selectedContainer === 'flac') {
 return Math.round((850000 * dur) / 8);
 }
 if (selectedContainer === 'wav') {
 return Math.round((1411200 * dur) / 8);
 }
 if (selectedContainer === 'opus') {
 return Math.round((160000 * dur) / 8);
 }
 // Default / MP3 320k audiophile
 return Math.round((320000 * dur) / 8);
 }
 
 // In video + audio mode, use selected audio stream size with bitrate fallback
 return selectedAudio.size || Math.round((160000 * dur) / 8);
 }, [selectedAudio, selectedVideo.id, selectedContainer, dur]);

 const totalSize = vSize + aSize;
 const sizeText = totalSize > 0 ? formatBytes(totalSize) : '0 MB';

 return (
 <motion.div 
 initial={{ opacity: 0, y: 4 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: 4 }}
      className="mt-4 sm:mt-6 relative z-50 -mx-4 w-[calc(100%+2rem)] sm:mx-0 sm:w-full glass-panel rounded-none sm:rounded-3xl border-x-0 sm:border-x p-4 sm:p-7 md:p-8 lg:p-10 flex flex-col"
    >
 {/* TOP: TITLE */}
 <div className="mb-5 md:mb-6 pr-2 w-full">
 <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white line-clamp-2 leading-snug tracking-tight">
 {metadata.title}
 </h2>
 </div>

 {/* BOTTOM: ADAPTIVE ROW */}
 <div className="flex flex-col md:flex-row gap-6 md:gap-8 lg:gap-10 w-full items-start">
 
 {/* LEFT: THUMBNAIL */}
 <div className="relative flex-shrink-0 group rounded-xl overflow-hidden shadow-md dark:shadow-[0_0_15px_rgba(0,0,0,0.5)] border border-slate-200 dark:border-slate-700/60 w-full md:w-fit mx-auto md:mx-0">
 <img 
 src={metadata.thumbnail} 
 alt="Thumbnail" 
 className="w-full md:w-auto h-auto md:max-w-[360px] lg:max-w-[420px] max-h-[420px] object-contain transition-transform duration-700 group-hover:bg-slate-100 dark:hover:bg-zinc-800 block" 
 />
 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-xs">
 <button 
  onClick={onDownloadThumb} 
  className="bg-white/90 dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-800 text-cyan-600 dark:text-cyan-300 border border-cyan-500/40 font-bold px-6 py-3 rounded-xl flex items-center gap-2.5 transition-all duration-300 shadow-md text-sm min-h-[44px]"
  >
  <ImageIcon size={18} className="text-cyan-500 dark:text-cyan-400" /> Get Cover
  </button>
 </div>
 </div>

 {/* RIGHT: CONTROLS */}
 <div className="flex-1 w-full flex flex-col justify-center py-2">
 
 <div className="flex justify-end mb-3 relative z-10">
 <label className="flex items-center gap-2 cursor-pointer text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-cyan-400 transition-colors font-mono">
 <div className="relative">
 <input 
 type="checkbox" 
 className="peer sr-only" 
 checked={advancedMode} 
 onChange={(e) => {
 const isAdv = e.target.checked;
 setAdvancedMode(isAdv);
 if (!isAdv) {
 setSelectedContainer('default');
 if (!selectedVideo.id) {
 setSelectedAudio({ id: 'mp3', size: Math.round(320000 * dur / 8), label: 'MP3' });
 }
 }
 }} 
 />
 <div className="w-7 h-4 bg-slate-800 border border-slate-700 rounded-full peer peer-checked:bg-cyan-500 transition-colors"></div>
 <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-3 shadow-sm"></div>
 </div>
 Show All Codecs
 </label>
 </div>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 relative z-30">
  {/* VIDEO DROPDOWN */}
  <CustomSelect 
    label="Video Quality"
    icon={Video}
    options={vFormats}
    value={selectedVideo.id}
    placeholder="None (Audio Only)"
    align="left"
    onChange={(id) => {
      if (!id) {
        setSelectedVideo({ id: '', size: 0, label: 'NoVideo' });
        // Switching to Audio Only: if current container is a video container, reset to audio format
        if (['default', 'mp4', 'webm'].includes(selectedContainer) || !selectedContainer) {
          setSelectedContainer('mp3');
        }
        if (!advancedMode) {
          setSelectedAudio({ id: 'mp3', size: Math.round(320000 * dur / 8), label: 'MP3' });
        }
      } else {
        const f = vFormats.find(x => x.id === id);
        if (f) {
          setSelectedVideo({ id: f.id, size: f.size, label: f.label });
          // Switching to Video: if current container is an audio container, reset to video container
          if (['mp3', 'm4a', 'flac', 'wav', 'opus'].includes(selectedContainer)) {
            setSelectedContainer('default');
          }
        }
      }
    }}
  />

  {/* AUDIO DROPDOWN */}
  <CustomSelect 
    label="Audio Track"
    icon={Music}
    options={aFormats}
    value={selectedAudio.id}
    placeholder={aFormats.length > 0 ? (selectedVideo.id ? "None (Mute Video)" : "Select Audio Quality") : "Included in Video"}
    align="right"
    onChange={(id) => {
      if (!id) setSelectedAudio({ id: '', size: 0, label: 'NoAudio' });
      else {
        const f = aFormats.find(x => x.id === id);
        if (f) {
          setSelectedAudio({ id: f.id, size: f.size, label: f.label || 'Audio' });
          if (setAudioLang && f.id) {
            setAudioLang(f.id);
          }
        }
      }
    }}
  />
  </div>

  {metadata?.chapters && metadata.chapters.length > 0 && (
    <div className="mt-4 flex items-center justify-between rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 shadow-[0_0_10px_rgba(139,92,246,0.1)]">
      <span className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">✂️ Split by Chapters</span>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={splitChapters}
          onChange={(e) => setSplitChapters(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-slate-800 border border-slate-700 rounded-full peer-checked:bg-violet-600 peer-checked:border-violet-500 transition-colors shadow-inner" />
        <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-slate-300 transition-transform peer-checked:translate-x-5 peer-checked:bg-white peer-checked:shadow-[0_0_5px_rgba(255,255,255,0.8)]" />
      </label>
    </div>
  )}

  <ClipPanel
    clipStart={clipStart}
    setClipStart={setClipStart}
    clipEnd={clipEnd}
    setClipEnd={setClipEnd}
    metadata={metadata}
  />

  <LanguagePanel
    metadata={metadata}
    audioLang={audioLang}
    setAudioLang={(newLangId) => {
      setAudioLang(newLangId);
      const matchedFmt = aFormats.find(f => f.id === newLangId);
      if (matchedFmt) {
        setSelectedAudio({ id: matchedFmt.id, size: matchedFmt.size, label: matchedFmt.label || 'Audio' });
      }
    }}
    embedSubs={embedSubs}
    setEmbedSubs={setEmbedSubs}
    subLang={subLang}
    setSubLang={setSubLang}
    isVideoSelected={Boolean(selectedVideo.id)}
  />

  {/* BOTTOM ACTION BAR */}
  <div className="mt-6 md:mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-700/60 pt-5">
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
        Est. Data Consumption
      </span>
      <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
        {selectedVideo.id && (
          <span className="text-cyan-600 dark:text-cyan-400/80 font-mono text-xs">Video ~{formatBytes(vSize)}</span>
        )}
        {selectedAudio.id && (
          <span className="text-violet-600 dark:text-violet-400/80 font-mono text-xs">Audio ~{formatBytes(aSize)}</span>
        )}
        <span className="text-slate-800 dark:text-slate-300 font-mono text-xs font-bold">Total ~{sizeText}</span>
      </div>
    </div>

    {!isDownloading ? (
      <div className="flex items-end gap-3 flex-shrink-0">
        {/* Format selection: shown for advanced users OR for normal users in audio-only mode */}
        {containerOptions.length > 0 && (
          <div className={advancedMode ? "w-28 sm:w-32" : "w-52 sm:w-60"}>
            <CustomSelect 
              label="Format" 
              icon={SlidersHorizontal} 
              options={containerOptions} 
              value={
                containerOptions.some(o => o.id === selectedContainer)
                  ? selectedContainer
                  : (containerOptions[0]?.id || 'default')
              } 
              onChange={setSelectedContainer} 
              dropUp={true} 
              align="right"
            />
          </div>
        )}

 {(() => {
 const isClipInverted = Boolean(clipStart && clipEnd && toSeconds(clipStart) >= toSeconds(clipEnd));
 return (
 <button 
 onClick={onDownloadMedia}
 disabled={(!selectedVideo.id && !selectedAudio.id) || isClipInverted}
 title={isClipInverted ?"Start time must be earlier than end time" :"Download"}
 className="w-full sm:w-auto px-6 md:px-8 py-3 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 text-white font-black uppercase tracking-wider rounded-xl text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:shadow-none disabled:opacity-50 min-h-[44px]" touch-manipulation
 >
 <DownloadCloud size={18} /> Download
 </button>
 );
 })()}
 </div>
 ) : (
 <div className="flex items-center gap-4 w-full sm:w-[360px] md:w-[420px] min-h-[84px] bg-white dark:bg-slate-900 border border-cyan-500/40 text-slate-900 dark:text-white p-4 pr-3 rounded-2xl shadow-[0_8px_24px_rgba(15,118,110,0.14)] dark:shadow-[0_0_18px_rgba(6,182,212,0.15)] transition-all duration-300">
 <div className="relative flex items-center justify-center flex-shrink-0 pl-1">
 {status === 'error' ? (
 <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.8)]">
 <div className="w-2 h-2 rounded-full bg-white" />
 </div>
 ) : (
 <>
 <Loader2 size={18} className="animate-spin text-cyan-400 relative z-10" />
 <div className="absolute inset-0 bg-cyan-500 blur-md rounded-full"></div>
 </>
 )}
 </div>
 
 <div className="flex-1 flex flex-col justify-center gap-2 w-full min-w-0">
 <div className="flex justify-between items-center text-[10px] md:text-[11px] font-bold uppercase tracking-wider leading-none font-mono">
 <span className={status === 'error' ? 'text-red-500' : 'text-teal-700 dark:text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]'}>
 {status === 'error' ? 'Failed' : (downloadSpeed ? downloadSpeed : 'Downloading')}
 </span>
 <span className="text-slate-600 dark:text-slate-300 font-mono tracking-tight whitespace-nowrap">
 {progress}{downloadEta ? ` (${downloadEta})` : ''}
 </span>
 </div>
 <div
 role="progressbar"
 aria-label="Download progress"
 aria-valuemin="0"
 aria-valuemax="100"
 aria-valuenow={Number.parseInt(progress, 10) || 0}
 className="w-full bg-slate-200 dark:bg-slate-800 h-3.5 rounded-full overflow-hidden shadow-inner border border-slate-300/80 dark:border-slate-700"
 >
 <motion.div 
 className={`h-full relative overflow-hidden rounded-full ${status === 'error' ? 'bg-red-500' : 'download-progress-fill'}`}
 initial={{ width: '0%' }}
 animate={{ width: progress }}
 transition={{ duration: 0.3, ease: 'easeOut' }}
 />
 </div>
 </div>

 {/* Cancel Button */}
 <button
 type="button"
 onClick={onCancelDownload}
 title="Cancel download & save bandwidth"
 className="flex-shrink-0 p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 active:scale-[0.98] transition-all"
 >
 <X size={15} />
 </button>
 </div>
 )}
 </div>
 </div>
 </div>
 </motion.div>
 );
}
