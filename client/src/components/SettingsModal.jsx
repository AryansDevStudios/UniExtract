import React, { useState, useEffect } from 'react';
import { 
 Settings, 
 X, 
 Github, 
 ExternalLink, 
 Heart, 
 Shield, 
 Sun, 
 Moon, 
 Server, 
 Cookie, 
 Sparkles, 
 Trash2, 
 Check, 
 Layers, 
 FileVideo, 
 Music, 
 Globe, 
 Subtitles,
 Cpu,
 Terminal,
 Info,
 ShieldCheck,
 Radio,
 Bell,
 BellOff,
 RefreshCw,
 Lock,
 Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getEnvironmentInfo } from '../utils/environment';
import { getCustomServerUrl } from '../utils/api';

export default function SettingsModal({
 isOpen,
 onClose,
 isDark,
 toggleTheme,
 history,
 onClearHistory,
 onOpenCookies,
 onOpenServer,
 onOpenUpdate,
 updateInfo,
 onToast
}) {
 const [activeTab, setActiveTab] = useState('preferences'); // 'preferences' | 'updates' | 'about'

 // Persistent user preferences
 const [defaultContainer, setDefaultContainer] = useState(() => localStorage.getItem('umx_pref_container') || 'default');
 const [defaultAudioLang, setDefaultAudioLang] = useState(() => localStorage.getItem('umx_pref_audio_lang') || 'default');
 const [defaultEmbedSubs, setDefaultEmbedSubs] = useState(() => localStorage.getItem('umx_pref_embed_subs') === 'true');
 const [defaultSplitChapters, setDefaultSplitChapters] = useState(() => localStorage.getItem('umx_pref_split_chapters') === 'true');
 const [rememberHistory, setRememberHistory] = useState(() => localStorage.getItem('umx_pref_remember_history') !== 'false');

 // Enterprise Update Settings
 const [updateChannel, setUpdateChannel] = useState(() => localStorage.getItem('umx_update_channel') || 'stable');
 const [autoDownload, setAutoDownload] = useState(() => localStorage.getItem('umx_update_auto_download') === 'true');
 const [checkCadence, setCheckCadence] = useState(() => localStorage.getItem('umx_update_cadence') || 'startup_and_interval');
 const [customFeedInput, setCustomFeedInput] = useState(() => localStorage.getItem('umx_update_custom_feed') || '');
 const [snoozeUntil, setSnoozeUntil] = useState(() => localStorage.getItem('umx_update_snooze_until'));
 const [isWipingCache, setIsWipingCache] = useState(false);

 const isElectron = !!window.electronAPI?.isElectron;

 // Sync state with Electron if available
 useEffect(() => {
 if (isElectron && window.electronAPI?.getUpdateState) {
 window.electronAPI.getUpdateState().then(state => {
 if (state?.policy) {
 if (state.policy.channel) setUpdateChannel(state.policy.channel);
 if (typeof state.policy.autoDownload === 'boolean') setAutoDownload(state.policy.autoDownload);
 if (state.policy.checkCadence) setCheckCadence(state.policy.checkCadence);
 if (state.policy.customFeedUrl) setCustomFeedInput(state.policy.customFeedUrl);
 }
 }).catch(() => {});
 }
 }, [isElectron]);

 const handleSavePref = (key, value, setter) => {
 setter(value);
 localStorage.setItem(key, value);
 if (onToast) onToast('Preference saved', 'success');
 };

 const handleClearHistory = () => {
 if (window.confirm('Are you sure you want to clear your recent extraction history?')) {
 if (onClearHistory) onClearHistory();
 if (onToast) onToast('Recent history cleared', 'info');
 }
 };

 // Enterprise Update Handlers
 const handleChannelChange = async (newChannel) => {
 setUpdateChannel(newChannel);
 localStorage.setItem('umx_update_channel', newChannel);
 if (isElectron && window.electronAPI?.setChannel) {
 await window.electronAPI.setChannel(newChannel);
 }
 window.dispatchEvent(new CustomEvent('umx-channel-changed', { detail: newChannel }));
 if (onToast) onToast(`Switched to ${newChannel === 'beta' ? 'Beta / Early Access' : 'Production Stable'} track`, 'info');
 };

 const handleAutoDownloadToggle = async () => {
 const nextVal = !autoDownload;
 setAutoDownload(nextVal);
 localStorage.setItem('umx_update_auto_download', nextVal.toString());
 if (isElectron && window.electronAPI?.setPolicy) {
 await window.electronAPI.setPolicy({ autoDownload: nextVal });
 }
 if (onToast) onToast(`Background auto-download ${nextVal ? 'enabled' : 'disabled'}`, 'info');
 };

 const handleCadenceChange = async (newCadence) => {
 setCheckCadence(newCadence);
 localStorage.setItem('umx_update_cadence', newCadence);
 if (isElectron && window.electronAPI?.setPolicy) {
 await window.electronAPI.setPolicy({ checkCadence: newCadence });
 }
 if (onToast) onToast('Update check frequency updated', 'success');
 };

 const handleSaveFeed = async () => {
 const clean = customFeedInput.trim();
 localStorage.setItem('umx_update_custom_feed', clean);
 if (isElectron && window.electronAPI?.setCustomFeed) {
 await window.electronAPI.setCustomFeed(clean);
 }
 if (onToast) onToast(clean ? 'Custom enterprise update mirror configured' : 'Reverted to official GitHub release feed', 'success');
 };

 const handleClearSnooze = () => {
 localStorage.removeItem('umx_update_snooze_until');
 setSnoozeUntil(null);
 window.dispatchEvent(new CustomEvent('umx-update-snoozed', { detail: null }));
 if (onToast) onToast('Update notifications resumed', 'success');
 };

 const handleWipeUpdaterCache = async () => {
 setIsWipingCache(true);
 try {
 if (isElectron && window.electronAPI?.clearUpdateCache) {
 const res = await window.electronAPI.clearUpdateCache();
 if (onToast) onToast(res?.success ? 'Update cache wiped clean' : 'Failed to wipe cache', res?.success ? 'success' : 'error');
 } else {
 localStorage.removeItem('umx_update_snooze_until');
 setSnoozeUntil(null);
 if (onToast) onToast('Update cache reset', 'info');
 }
 } finally {
 setIsWipingCache(false);
 }
 };

 if (!isOpen) return null;

 const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.8.5';
 const currentVersion = updateInfo?.currentVersion || appVersion;
 const envInfo = getEnvironmentInfo(getCustomServerUrl());
 const isSnoozed = snoozeUntil && Date.now() < Number(snoozeUntil);
 const handleOpenExternal = (e, url) => {
 if (typeof window !== 'undefined' && window.electronAPI?.openExternal) {
 e.preventDefault();
 window.electronAPI.openExternal(url);
 }
 };

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm sm:p-5 md:p-6">
 <motion.div 
 initial={{ opacity: 0, y: 4 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: 4 }}
 transition={{ duration: 0.15 }}
 className="w-full h-full max-w-none max-h-full glass-panel rounded-none border-x-0 border-y border-slate-700/80 shadow-[0_0_30px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col sm:h-auto sm:max-w-2xl sm:max-h-[92vh] sm:rounded-2xl sm:border-x sm:border-y"
 >
 {/* Header */}
 <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5 border-b border-slate-700/80 bg-slate-900/60">
 <div className="flex items-center gap-3">
 <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-inner">
 <Settings size={22} />
 </div>
 <div>
 <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-wider uppercase">
 Settings & Preferences
 </h2>
 <p className="text-xs text-slate-400 font-mono mt-0.5">
 Configure media defaults, enterprise update policies & credits
 </p>
 </div>
 </div>
 <button onClick={onClose}
  className="touch-manipulation p-2 text-slate-500 hover:text-cyan-400 rounded-lg hover:bg-slate-800 transition-colors"
 >
 <X size={20} />
 </button>
 </div>

 {/* Navigation Tabs */}
 <div className="flex overflow-x-auto border-b border-slate-700/80 px-3 sm:px-6 bg-slate-900/40 text-xs font-bold font-mono tracking-wider uppercase">
 <button
 onClick={() => setActiveTab('preferences')}
 className={`shrink-0 py-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-2 ${
 activeTab === 'preferences'
 ? 'border-cyan-400 text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]'
 : 'border-transparent text-slate-500 hover:text-slate-300'
 }`}
 >
 <Layers size={14} />
 Preferences & Controls
 </button>
 <button
 onClick={() => setActiveTab('updates')}
 className={`shrink-0 py-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-2 ${
 activeTab === 'updates'
 ? 'border-cyan-400 text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]'
 : 'border-transparent text-slate-500 hover:text-slate-300'
 }`}
 >
 <Sparkles size={14} />
 Updates & Policies
 </button>
 <button
 onClick={() => setActiveTab('about')}
 className={`shrink-0 py-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-2 ${
 activeTab === 'about'
 ? 'border-cyan-400 text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]'
 : 'border-transparent text-slate-500 hover:text-slate-300'
 }`}
 >
 <Info size={14} />
 About
 </button>
 </div>

 {/* Tab Content Body */}
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-6 sm:px-6 sm:py-5 sm:pb-8 space-y-6">
 {activeTab === 'preferences' && (
 <div className="space-y-5">


              {/* Default Container */}
 <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-700/80 space-y-3">
 <div className="flex items-center justify-between">
 <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
 <FileVideo size={16} className="text-cyan-400" />
 Default Media Container
 </label>
 <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider bg-indigo-500 px-2 py-0.5 rounded-md">
 {defaultContainer.toUpperCase()}
 </span>
 </div>
 <p className="text-[11px] text-slate-400">
 The initial format selected when analyzing video or audio streams.
 </p>
 <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
 {[
 { id: 'default', label: 'Auto' },
 { id: 'mp4', label: 'MP4' },
 { id: 'mkv', label: 'MKV' },
 { id: 'webm', label: 'WebM' },
 { id: 'mp3', label: 'MP3' },
 { id: 'm4a', label: 'M4A' },
 ].map((c) => (
 <button
 key={c.id}
 type="button"
 onClick={() => handleSavePref('umx_pref_container', c.id, setDefaultContainer)}
 className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all text-center border ${
 defaultContainer === c.id
 ? 'bg-cyan-500 text-white border-cyan-400 shadow-sm'
 : 'bg-slate-800/60 text-slate-300 border-slate-700/80 hover:border-zinc-300 dark:hover:border-zinc-600'
 }`}
 >
 {c.label}
 </button>
 ))}
 </div>
 </div>

 {/* Automation Controls */}
 <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-700/80 space-y-4">
 <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
 <Subtitles size={16} className="text-cyan-400" />
 Extraction Automation Controls
 </div>

 {/* Auto-embed subs */}
 <div className="flex items-center justify-between pt-1">
 <div className="space-y-0.5">
 <div className="text-xs font-semibold text-slate-300">
 Auto-Embed Subtitles
 </div>
 <div className="text-[11px] text-slate-400">
 Automatically activate subtitle muxing if available in source media
 </div>
 </div>
 <button
 type="button"
 onClick={() => handleSavePref('umx_pref_embed_subs', (!defaultEmbedSubs).toString(), () => setDefaultEmbedSubs(!defaultEmbedSubs))}
 className={`w-11 h-6 flex items-center rounded-full p-1 transition-all duration-200 ease-in-out border ${defaultEmbedSubs ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-slate-800 border-slate-700'}`}
 >
 <div
 className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${defaultEmbedSubs ? 'translate-x-5' : 'translate-x-0'}`}
 />
 </button>
 </div>

 {/* Auto-split chapters */}
 <div className="flex items-center justify-between border-t border-slate-700/80 pt-3">
 <div className="space-y-0.5">
 <div className="text-xs font-semibold text-slate-300">
 Auto-Split Chapters
 </div>
 <div className="text-[11px] text-slate-400">
 Split media into individual chapter tracks when chapters are present
 </div>
 </div>
 <button
 type="button"
 onClick={() => handleSavePref('umx_pref_split_chapters', (!defaultSplitChapters).toString(), () => setDefaultSplitChapters(!defaultSplitChapters))}
 className={`w-11 h-6 flex items-center rounded-full p-1 transition-all duration-200 ease-in-out border ${defaultSplitChapters ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-slate-800 border-slate-700'}`}
 >
 <div
 className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${defaultSplitChapters ? 'translate-x-5' : 'translate-x-0'}`}
 />
 </button>
 </div>

 {/* History Persistence */}
 <div className="flex items-center justify-between border-t border-slate-700/80 pt-3">
 <div className="space-y-0.5">
 <div className="text-xs font-semibold text-slate-300">
 Save History Locally
 </div>
 <div className="text-[11px] text-slate-400">
 Store recent analyzed links in your browser/app storage
 </div>
 </div>
 <button
 type="button"
 onClick={() => handleSavePref('umx_pref_remember_history', (!rememberHistory).toString(), () => setRememberHistory(!rememberHistory))}
 className={`w-11 h-6 flex items-center rounded-full p-1 transition-all duration-200 ease-in-out border ${rememberHistory ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-slate-800 border-slate-700'}`}
 >
 <div
 className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${rememberHistory ? 'translate-x-5' : 'translate-x-0'}`}
 />
 </button>
 </div>
 </div>

 {/* Data & Quick Management */}
 <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-700/80 space-y-3">
 <div className="text-xs font-bold text-slate-200">
 Quick Modals & Management
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
 <button
 type="button"
 onClick={() => { onClose(); onOpenServer(); }}
 className="flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/80 hover:border-cyan-400 text-xs font-semibold text-slate-300 transition-all shadow-sm group"
 title={envInfo.headerTooltip}
 >
 <Server size={14} className="text-cyan-400 shrink-0" />
 <span>Server</span>
 <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-cyan-900/10 text-cyan-400 font-medium">
 {envInfo.badgeText}
 </span>
 </button>
 <button
 type="button"
 onClick={() => { onClose(); onOpenCookies(); }}
 className="flex items-center justify-center gap-2 p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/80 hover:border-amber-500 text-xs font-semibold text-slate-300 transition-all shadow-sm"
 >
 <Cookie size={14} className="text-amber-500" />
 Media Cookies
 </button>
 <button
 type="button"
 onClick={() => { onClose(); onOpenUpdate(); }}
 className="flex items-center justify-center gap-2 p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/80 hover:border-emerald-500 text-xs font-semibold text-slate-300 transition-all shadow-sm"
 >
 <Sparkles size={14} className="text-emerald-500" />
 Check Updates
 </button>
 </div>

 {/* History Clear */}
 <div className="pt-2 flex items-center justify-between border-t border-slate-700/80">
 <span className="text-[11px] text-slate-400">
 History cache ({history?.length || 0} items)
 </span>
 <button
 type="button"
 onClick={handleClearHistory}
 disabled={!history?.length}
 className="touch-manipulation flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors disabled:opacity-40"
 >
 <Trash2 size={13} />
 Clear History
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Enterprise Updates & Channels Tab */}
 {activeTab === 'updates' && (
 <div className="space-y-5">
 {/* Active Snooze Alert if applicable */}
 {isSnoozed && (
 <div className="p-3.5 rounded-lg bg-amber-500 border border-amber-500 flex items-center justify-between gap-3 text-xs">
 <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
 <BellOff size={16} className="shrink-0 text-amber-500" />
 <span>
 <strong>Update notifications are snoozed</strong> until {new Date(Number(snoozeUntil)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
 </span>
 </div>
 <button
 onClick={handleClearSnooze}
 className="touch-manipulation px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors shrink-0"
 >
 Resume Notifications
 </button>
 </div>
 )}

 {/* Release Channel Selector */}
 <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-700/80 space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Radio size={16} className="text-cyan-400" />
 <span className="text-xs font-bold text-slate-200">Release Track / Ring</span>
 </div>
 <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
 updateChannel === 'beta'
 ? 'bg-amber-500 text-amber-600 dark:text-amber-400 border-amber-500'
 : 'bg-emerald-500 text-emerald-600 dark:text-emerald-400 border-emerald-500'
 }`}>
 {updateChannel === 'beta' ? 'Beta Track' : 'Production Stable'}
 </span>
 </div>
 <p className="text-[11px] text-slate-400">
 Select your deployment stream. Enterprise deployments typically remain on the Production Stable ring.
 </p>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
 <div
 onClick={() => handleChannelChange('stable')}
 className={`p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
 updateChannel === 'stable'
 ? 'border-cyan-400 bg-cyan-900/10 ring-1 ring-indigo-500/20'
 : 'border-slate-700/80 hover:border-zinc-300'
 }`}
 >
 <div className="flex items-center justify-between">
 <span className="text-xs font-bold text-slate-200">Stable (Production)</span>
 {updateChannel === 'stable' && <Check size={14} className="text-cyan-400" />}
 </div>
 <p className="text-[10px] text-slate-400 mt-1">
 Thoroughly validated releases. Best for general use and production workloads.
 </p>
 </div>

 <div
 onClick={() => handleChannelChange('beta')}
 className={`p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
 updateChannel === 'beta'
 ? 'border-cyan-400 bg-cyan-900/10 ring-1 ring-indigo-500/20'
 : 'border-slate-700/80 hover:border-zinc-300'
 }`}
 >
 <div className="flex items-center justify-between">
 <span className="text-xs font-bold text-slate-200">Beta / Preview</span>
 {updateChannel === 'beta' && <Check size={14} className="text-cyan-400" />}
 </div>
 <p className="text-[10px] text-slate-400 mt-1">
 Early access to newly released extractor features, fixes, and engine updates.
 </p>
 </div>
 </div>
 </div>

 {/* Automation & Background Download Policies */}
 <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-700/80 space-y-4">
 <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
 <Bell size={16} className="text-cyan-400" />
 Enterprise Automation & Cadence
 </div>

 {/* Auto-download in background */}
 <div className="flex items-center justify-between pt-1">
 <div className="space-y-0.5">
 <div className="text-xs font-semibold text-slate-300">
 Automatic Background Download
 </div>
 <div className="text-[11px] text-slate-400">
 Download installers quietly in the background without prompting. Disables on metered connections.
 </div>
 </div>
 <button
 type="button"
 onClick={handleAutoDownloadToggle}
 className={`w-11 h-6 flex items-center rounded-full p-1 transition-all duration-200 ease-in-out border ${autoDownload ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-slate-800 border-slate-700'}`}
 >
 <div
 className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${autoDownload ? 'translate-x-5' : 'translate-x-0'}`}
 />
 </button>
 </div>

 {/* Check Cadence */}
 <div className="border-t border-slate-700/80 pt-3 space-y-2">
 <div className="flex items-center justify-between">
 <span className="text-xs font-semibold text-slate-300">
 Check Cadence Frequency
 </span>
 <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase">
 {checkCadence === 'startup_and_interval' ? 'Every 4 Hours' : checkCadence === 'daily' ? 'Daily' : 'Manual'}
 </span>
 </div>
 <div className="grid grid-cols-3 gap-2">
 {[
 { id: 'startup_and_interval', label: 'Every 4 Hours' },
 { id: 'daily', label: 'Daily' },
 { id: 'manual', label: 'Manual Only' },
 ].map(cad => (
 <button
 key={cad.id}
 type="button"
 onClick={() => handleCadenceChange(cad.id)}
 className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all text-center border ${
 checkCadence === cad.id
 ? 'bg-cyan-500 text-white border-cyan-400 shadow-sm'
 : 'bg-slate-800/60 text-slate-300 border-slate-700/80 hover:border-zinc-300'
 }`}
 >
 {cad.label}
 </button>
 ))}
 </div>
 </div>
 </div>

 {/* Enterprise Custom Update Feed (Corporate Mirrors / Air-gap) */}
 <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-700/80 space-y-3">
 <div className="text-xs font-bold text-slate-200 flex items-center justify-between">
 <div className="flex items-center gap-1.5">
 <Globe size={16} className="text-cyan-400" />
 <span>Custom Enterprise Update Feed</span>
 </div>
 <span className="text-[10px] text-slate-500 font-normal">Optional</span>
 </div>
 <p className="text-[11px] text-slate-400">
 For air-gapped corporate intranets, private mirrors, or internal software distribution servers. Leave blank for official GitHub releases.
 </p>
 <div className="flex gap-2">
 <input
 type="text"
 value={customFeedInput}
 onChange={(e) => setCustomFeedInput(e.target.value)}
 placeholder="https://updates.internal.corp/uniextract or empty"
 className="flex-1 text-xs font-mono px-3.5 py-2.5 rounded-lg bg-white dark:bg-black/60 backdrop-blur-sm border border-slate-700/80 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
 />
 <button
 type="button"
 onClick={handleSaveFeed}
 className="touch-manipulation px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-colors"
 >
 Save
 </button>
 </div>
 </div>

 {/* Cryptographic Verification & Cache Diagnostics */}
 <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-700/80 flex items-center justify-between">
 <div className="space-y-0.5">
 <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
 <ShieldCheck size={14} className="text-emerald-500" />
 <span>Cryptographic Verification & Staging</span>
 </div>
 <div className="text-[11px] text-slate-400">
 Publisher: AryansDevStudios • Authenticode Signed • SHA-512 Enforced
 </div>
 </div>
 <button
 type="button"
 onClick={handleWipeUpdaterCache}
 disabled={isWipingCache}
 className="touch-manipulation px-3.5 py-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:text-red-500 bg-slate-800/60 border border-slate-700/80 rounded-lg transition-colors shadow-sm disabled:opacity-50"
 >
 {isWipingCache ? 'Wiping...' : 'Wipe Update Cache'}
 </button>
 </div>
 </div>
 )}

 {/* About & Credits Tab */}
 {activeTab === 'about' && (
 <div className="space-y-5">
 {/* Product Info Banner */}
 <div className="p-5 rounded-lg bg-slate-900/40 border border-slate-700/80 text-center space-y-3">
 <div className="inline-flex p-3 rounded-lg bg-slate-800/60 shadow-md shadow-sm border border-slate-700/80">
 <img src="/favicon.ico" alt="Logo" className="w-12 h-12 rounded-lg" />
 </div>
 <div>
 <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
 Uni <span className="text-cyan-400">Extract</span>
 </h3>
 <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-1 rounded-md text-[11px] font-bold bg-indigo-500 text-indigo-600 dark:text-indigo-300 border border-indigo-500">
 v{currentVersion} • Production Release
 </div>
 </div>
 <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
 A high-performance universal media extraction, video downloader, audio demuxer and stream transcoder engine.
 </p>
 </div>

 {/* Developer & Community Links */}
 <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-700/80 space-y-3">
 <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
 <Heart size={14} className="text-rose-500" />
 Author & Publisher Credit
 </div>
 <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/80">
 <div className="space-y-0.5">
 <div className="text-xs font-black text-cyan-400 font-bold">
 AryansDevStudios
 </div>
 <div className="text-[11px] text-slate-400">
 Engineering & Design • Open-Source Project
 </div>
 </div>
 <a
 href="https://github.com/AryansDevStudios"
 target="_blank"
 rel="noreferrer"
 onClick={(e) => handleOpenExternal(e, 'https://github.com/AryansDevStudios')}
 className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-400 text-slate-100 hover:text-cyan-300 transition-all shadow-sm"
 >
 <span>Developer Profile</span>
 <ExternalLink size={12} className="text-cyan-400" />
 </a>
 </div>
 </div>

 {/* Community and Documentation Links */}
 <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-700/80 space-y-3">
 <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
 <Github size={15} className="text-cyan-400" />
 GitHub Repository & Community
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
 <a
 href="https://github.com/AryansDevStudios/UniExtract"
 target="_blank"
 rel="noreferrer"
 onClick={(e) => handleOpenExternal(e, 'https://github.com/AryansDevStudios/UniExtract')}
 className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/80 hover:border-cyan-400 hover:bg-slate-800 transition-all text-xs group"
 >
 <div className="flex items-center gap-2">
 <Github size={16} className="text-slate-400 group-hover:text-cyan-400 transition-colors" />
 <span className="font-bold text-slate-200 group-hover:text-white">Main Repository</span>
 </div>
 <ExternalLink size={13} className="text-slate-500 group-hover:text-cyan-400 transition-colors" />
 </a>

 <a
 href="https://github.com/AryansDevStudios/UniExtract/releases"
 target="_blank"
 rel="noreferrer"
 onClick={(e) => handleOpenExternal(e, 'https://github.com/AryansDevStudios/UniExtract/releases')}
 className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/80 hover:border-cyan-400 hover:bg-slate-800 transition-all text-xs group"
 >
 <div className="flex items-center gap-2">
 <Sparkles size={16} className="text-slate-400 group-hover:text-cyan-400 transition-colors" />
 <span className="font-bold text-slate-200 group-hover:text-white">Releases & Builds</span>
 </div>
 <ExternalLink size={13} className="text-slate-500 group-hover:text-cyan-400 transition-colors" />
 </a>

 <a
 href="https://github.com/AryansDevStudios/UniExtract/issues"
 target="_blank"
 rel="noreferrer"
 onClick={(e) => handleOpenExternal(e, 'https://github.com/AryansDevStudios/UniExtract/issues')}
 className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/80 hover:border-cyan-400 hover:bg-slate-800 transition-all text-xs group"
 >
 <div className="flex items-center gap-2">
 <Shield size={16} className="text-slate-400 group-hover:text-cyan-400 transition-colors" />
 <span className="font-bold text-slate-200 group-hover:text-white">Report an Issue</span>
 </div>
 <ExternalLink size={13} className="text-slate-500 group-hover:text-cyan-400 transition-colors" />
 </a>

 <a
 href="https://github.com/AryansDevStudios/UniExtract/blob/main/LICENSE"
 target="_blank"
 rel="noreferrer"
 onClick={(e) => handleOpenExternal(e, 'https://github.com/AryansDevStudios/UniExtract/blob/main/LICENSE')}
 className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/80 hover:border-cyan-400 hover:bg-slate-800 transition-all text-xs group"
 >
 <div className="flex items-center gap-2">
 <Terminal size={16} className="text-slate-400 group-hover:text-cyan-400 transition-colors" />
 <span className="font-bold text-slate-200 group-hover:text-white">MIT Open-Source</span>
 </div>
 <ExternalLink size={13} className="text-slate-500 group-hover:text-cyan-400 transition-colors" />
 </a>
 </div>
 </div>

 {/* Core Engine Powered By */}
 <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-700/80 space-y-2.5">
 <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
 <Cpu size={14} className="text-cyan-400" />
 Powered by Open Source
 </div>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
 <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/80">
 <div className="font-black text-slate-200">yt-dlp</div>
 <div className="text-[10px] text-slate-500">Stream Extraction</div>
 </div>
 <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/80">
 <div className="font-black text-slate-200">FFmpeg</div>
 <div className="text-[10px] text-slate-500">Audio/Video Muxer</div>
 </div>
 <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/80">
 <div className="font-black text-slate-200">Electron</div>
 <div className="text-[10px] text-slate-500">Desktop Shell</div>
 </div>
 <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/80">
 <div className="font-black text-slate-200">React + Vite</div>
 <div className="text-[10px] text-slate-500">Fast Reactive UI</div>
 </div>
 </div>
 </div>
 </div>
 )}
 </div>

 {/* Footer Close Button */}
 <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-4 border-t border-slate-700/80 flex items-center justify-between gap-3 bg-slate-900/90">
 <div className="text-[11px] text-slate-400 font-mono">
 UniExtract v{currentVersion} • AryansDevStudios
 </div>
 <button
 type="button"
 onClick={onClose}
 className="touch-manipulation px-6 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 transition-all shadow-[0_0_15px_rgba(6,182,212,0.35)] active:scale-[0.98]"
 >
 Done
 </button>
 </div>
 </motion.div>
 </div>
 );
}
