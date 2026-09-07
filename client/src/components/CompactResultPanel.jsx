import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Video, Music, DownloadCloud, Loader2, ChevronDown, Check, X, SlidersHorizontal } from 'lucide-react';
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

function CustomSelect({ label, icon: Icon, options, value, onChange, placeholder, dropUp = false }) {
 const [isOpen, setIsOpen] = useState(false);
 
 const selectedOption = options.find(o => o.id === value) || { id: '', display: placeholder };

 return (
 <div className="space-y-1.5 w-full">
 {label && (
 <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
 {Icon && <Icon size={12} />} {label}
 </label>
 )}
 <div 
 className="relative w-full"
 tabIndex={0}
 onBlur={(e) => {
 if (!e.currentTarget.contains(e.relatedTarget)) setIsOpen(false);
 }}
 >
 <div 
 onClick={() => setIsOpen(!isOpen)}
 className="w-full flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 rounded-lg px-3.5 py-3 text-sm text-zinc-700 dark:text-zinc-200 cursor-pointer transition-colors shadow-sm select-none"
 >
 <span className="truncate pr-1 font-medium">{selectedOption.display}</span>
 <ChevronDown size={16} className={`text-zinc-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180 text-indigo-500' : ''}`} />
 </div>

 <AnimatePresence>
 {isOpen && (
 <motion.div
 initial={{ opacity: 0, y: dropUp ? -4 : 4 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: dropUp ? -4 : 4 }}
 transition={{ duration: 0.15 }}
 className={`absolute z-50 ${dropUp ? 'bottom-full mb-2' : 'mt-2'} w-full min-w-[120px] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden `}
 >
 <div className="max-h-60 overflow-y-auto custom-scroll p-1.5 flex flex-col gap-0.5">
 {placeholder && value !== '' && options.some(o => o.id === '') === false && (
 <button
 type="button"
 onClick={() => { onChange(''); setIsOpen(false); }}
 className="flex items-center justify-between w-full text-left px-3 py-2 rounded-lg text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
 >
 {placeholder}
 </button>
 )}
 {options.map((opt) => (
 <button
 key={opt.id}
 type="button"
 onClick={() => { onChange(opt.id); setIsOpen(false); }}
 className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
 value === opt.id ? 'bg-indigo-50 dark:bg-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold' : 'hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200'
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

 return list.map(f => ({
 ...f,
 display: advancedMode 
 ? `${f.resolution} • ${f.codec_info || f.vcodec} • ${f.fps ? f.fps + 'fps • ' : ''}${formatBytes(f.size)}`
 : `${f.resolution} • ${formatBytes(f.size)}`
 }));
 }, [metadata, advancedMode]);

 const aFormats = useMemo(() => {
 // Filter out audio streams that have no bitrate and no filesize (e.g. invalid manifest fragments)
 let list = metadata.formats.filter(f => f.acodec && !f.vcodec && (f.abr || f.size > 0));
 
 if (!advancedMode) {
 // Normal mode: display all available distinct audio bitrates cleanly
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

 return list.map(f => {
 const abrVal = parseInt(f.abr);
 return {
 ...f,
 display: `${abrVal ? abrVal + ' kbps' : 'Audio'} • ${formatBytes(f.size || Math.round(160000 * dur / 8))}`
 };
 });
 } else {
 // Advanced mode: largest file per bitrate first (descending) with full stream details
 list = list.sort((a, b) => {
 const abrA = parseInt(a.abr) || 0;
 const abrB = parseInt(b.abr) || 0;
 if (abrA !== abrB) return abrB - abrA;
 return (b.size || 0) - (a.size || 0);
 });

 return list.map(f => {
 const channels = f.audio_channels === 6 ? '5.1 Surround' : f.audio_channels === 2 ? 'Stereo' : f.audio_channels ? `${f.audio_channels} Ch` : 'Stereo';
 const abrVal = parseInt(f.abr);
 return {
 ...f,
 display: `${f.codec_info || f.acodec} • ${abrVal || '??'} kbps • ${channels} • ${formatBytes(f.size)}`
 };
 });
 }
 }, [metadata, advancedMode, dur]);

 const containerOptions = useMemo(() => {
 const isVideoSelected = Boolean(selectedVideo.id);

 if (isVideoSelected) {
 // Containers for VIDEO (Video + Audio or Video Only)
 if (advancedMode) {
 return [
 { id: 'default', display: 'Auto (MP4)' },
 { id: 'mp4', display: 'MP4' },
 { id: 'mkv', display: 'MKV' },
 { id: 'webm', display: 'WebM' }
 ];
 }
 // Normal user with video has container dropdown hidden (defaults to MP4)
 return [];
 } else {
 // Containers for AUDIO ONLY
 if (advancedMode) {
 return [
 { id: 'mp3', display: 'MP3' },
 { id: 'm4a', display: 'M4A' },
 { id: 'opus', display: 'OPUS' },
 { id: 'flac', display: 'FLAC' },
 { id: 'wav', display: 'WAV' },
 { id: 'mkv', display: 'MKV' }
 ];
 }
 // Normal user in Audio Only mode
 return [
 { id: 'mp3', display: 'Most Supported (MP3)' },
 { id: 'm4a', display: 'High Quality (M4A)' }
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
      className="mt-6 relative z-50 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/50 rounded-xl p-6 sm:p-7 md:p-8 lg:p-10 shadow-lg flex flex-col"
    >
 {/* TOP: TITLE */}
 <div className="mb-5 md:mb-6 pr-2 w-full">
 <h2 className="text-xl md:text-2xl font-extrabold text-zinc-800 dark:text-zinc-100 line-clamp-2 leading-snug tracking-tight">
 {metadata.title}
 </h2>
 </div>

 {/* BOTTOM: ADAPTIVE ROW */}
 <div className="flex flex-col md:flex-row gap-6 md:gap-8 lg:gap-10 w-full items-center">
 
 {/* LEFT: THUMBNAIL (Uncropped, natural aspect ratio, tight wrap) */}
 <div className="relative flex-shrink-0 group rounded-lg md:rounded-lg overflow-hidden shadow-lg ring-1 ring-zinc-200/50 dark:ring-zinc-700/50 w-full md:w-fit mx-auto md:mx-0">
 <img 
 src={metadata.thumbnail} 
 alt="Thumbnail" 
 className="w-full md:w-auto h-auto md:max-w-[360px] lg:max-w-[420px] max-h-[420px] object-contain transition-transform duration-700 group-hover:bg-zinc-100 dark:hover:bg-zinc-800 block" 
 />
 <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
 <button 
 onClick={onDownloadThumb} 
 className="bg-white hover:bg-zinc-100 text-zinc-900 border border-zinc-200 font-semibold px-6 py-3 rounded-md flex items-center gap-2.5 transition-all duration-300 shadow-sm text-sm min-h-[44px]"
 >
 <ImageIcon size={18} /> Get Cover
 </button>
 </div>
 </div>

 {/* RIGHT: CONTROLS */}
 <div className="flex-1 w-full flex flex-col justify-center py-2">
 
 <div className="flex justify-end mb-3 relative z-10">
 <label className="flex items-center gap-2 cursor-pointer text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-indigo-500 transition-colors">
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
 <div className="w-7 h-4 bg-zinc-200 dark:bg-zinc-700 rounded-full peer peer-checked:bg-indigo-500 transition-colors"></div>
 <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-3 shadow-sm"></div>
 </div>
 Show All Codecs
 </label>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 relative z-10">
 {/* VIDEO DROPDOWN */}
 <CustomSelect 
 label="Video Quality"
 icon={Video}
 options={vFormats}
 value={selectedVideo.id}
 placeholder="None (Audio Only)"
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
 placeholder={aFormats.length > 0 ? (selectedVideo.id ?"None (Mute Video)" :"Select Audio Quality") :"Included in Video"}
 onChange={(id) => {
 if (!id) setSelectedAudio({ id: '', size: 0, label: 'NoAudio' });
 else {
 const f = aFormats.find(x => x.id === id);
 if (f) setSelectedAudio({ id: f.id, size: f.size, label: f.label || 'Audio' });
 }
 }}
 />
 </div>

 {metadata?.chapters && metadata.chapters.length > 0 && (
 <div className="mt-4 flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-700 bg-indigo-50 dark:bg-indigo-950 px-4 py-3">
 <span className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700 dark:text-indigo-300">✂️ Split by Chapters</span>
 <label className="relative inline-flex items-center cursor-pointer">
 <input
 type="checkbox"
 checked={splitChapters}
 onChange={(e) => setSplitChapters(e.target.checked)}
 className="sr-only peer"
 />
 <div className="w-11 h-6 bg-zinc-300 dark:bg-zinc-700 rounded-full peer-checked:bg-indigo-500 transition-colors" />
 <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
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
 setAudioLang={setAudioLang}
 embedSubs={embedSubs}
 setEmbedSubs={setEmbedSubs}
 subLang={subLang}
 setSubLang={setSubLang}
 isVideoSelected={Boolean(selectedVideo.id)}
 />

 {/* BOTTOM ACTION BAR */}
 <div className="mt-6 md:mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-zinc-200/60 dark:border-zinc-700/60 pt-5">
 <div className="flex flex-col gap-1.5">
 <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
 Est. Data Consumption
 </span>
 <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
 {selectedVideo.id && (
 <span className="text-zinc-500 dark:text-zinc-400 font-mono text-xs">Video ~{formatBytes(vSize)}</span>
 )}
 {selectedAudio.id && (
 <span className="text-zinc-500 dark:text-zinc-400 font-mono text-xs">Audio ~{formatBytes(aSize)}</span>
 )}
 <span className="text-zinc-500 dark:text-zinc-400 font-mono text-xs">Total ~{sizeText}</span>
 </div>
 </div>

 {!isDownloading ? (
 <div className="flex items-end gap-3 flex-shrink-0">
 {/* Format selection: shown for advanced users OR for normal users in audio-only mode */}
 {containerOptions.length > 0 && (
 <div className={advancedMode ?"w-28 sm:w-32" :"w-52 sm:w-60"}>
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
 className="w-full sm:w-auto px-6 md:px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 min-h-[44px]" touch-manipulation
 >
 <DownloadCloud size={18} /> Download
 </button>
 );
 })()}
 </div>
 ) : (
 <div className="flex items-center gap-3 w-64 md:w-[280px] bg-zinc-900 text-white p-2.5 pr-3 rounded-lg md:rounded-lg shadow-sm transition-all duration-300">
 <div className="relative flex items-center justify-center flex-shrink-0 pl-1">
 {status === 'error' ? (
 <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
 <div className="w-2 h-2 rounded-full bg-red-500" />
 </div>
 ) : (
 <>
 <Loader2 size={18} className="animate-spin text-indigo-400 relative z-10" />
 <div className="absolute inset-0 bg-indigo-500 blur-md rounded-full"></div>
 </>
 )}
 </div>
 
 <div className="flex-1 flex flex-col justify-center gap-1.5 w-full">
 <div className="flex justify-between items-center text-[9px] md:text-[10px] font-bold uppercase tracking-wider leading-none">
 <span className={status === 'error' ? 'text-red-400' : 'text-indigo-300'}>
 {status === 'error' ? 'Failed' : (downloadSpeed ? downloadSpeed : 'Downloading')}
 </span>
 <span className="text-zinc-300 font-mono tracking-tight">
 {progress}{downloadEta ? ` (${downloadEta})` : ''}
 </span>
 </div>
 <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden shadow-inner">
 <motion.div 
 className={`h-full relative overflow-hidden ${status === 'error' ? 'bg-red-500' : 'bg-indigo-600'}`}
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
