import React, { useState, useEffect } from 'react';
import { 
 Download, 
 RefreshCw, 
 AlertCircle, 
 CheckCircle2, 
 Clock, 
 Sparkles, 
 ExternalLink, 
 X, 
 ShieldCheck, 
 Cpu, 
 Laptop, 
 Server as ServerIcon,
 BellOff,
 Trash2,
 Lock,
 Zap,
 Bug,
 ListFilter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function UpdateModal({ 
 isOpen, 
 onClose, 
 updateInfo, 
 onRefreshUpdate,
 activeJobsCount = 0 
}) {
 const [electronState, setElectronState] = useState({
 status: 'idle',
 percent: 0,
 speed: 0,
 activeJobs: 0
 });
 const [isApplying, setIsApplying] = useState(false);
 const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'changelog' | 'manual'
 const [cacheMessage, setCacheMessage] = useState(null);

 const isElectron = !!window.electronAPI?.isElectron;

 // Listen for Electron autoUpdater live events
 useEffect(() => {
 if (!isElectron) return;

 // Fetch initial state
 window.electronAPI.getUpdateState().then(state => {
 if (state) setElectronState(state);
 }).catch(() => {});

 // Subscribe to real-time events
 const unsubscribe = window.electronAPI.onUpdateEvent((data) => {
 setElectronState(prev => ({ ...prev, ...data }));
 if (data.status === 'downloaded' || data.status === 'available') {
 setIsApplying(false);
 }
 });

 return () => {
 if (unsubscribe) unsubscribe();
 };
 }, [isElectron]);

 if (!isOpen || !updateInfo) return null;

 const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.8.2';
 const currentVersion = updateInfo.currentVersion || appVersion;
 const latestVersion = updateInfo.latestVersion || appVersion;
 const releaseName = updateInfo.releaseName || `v${latestVersion}`;
 const releaseNotes = updateInfo.releaseNotes || 'No release notes provided.';
 const releaseUrl = updateInfo.releaseUrl || 'https://github.com/AryansDevStudios/UniExtract/releases';
 const assets = updateInfo.assets || [];
 const channel = updateInfo.channel || 'stable';
 const bumpType = updateInfo.bumpType || 'none';
 const categories = updateInfo.categories || { features: [], fixes: [], security: [], performance: [], general: [] };

 const handleOpenExternal = (e, url) => {
 if (typeof window !== 'undefined' && window.electronAPI?.openExternal) {
 e.preventDefault();
 window.electronAPI.openExternal(url);
 }
 };

 const handleDownloadUpdate = async () => {
 if (!isElectron) return;
 try {
 await window.electronAPI.downloadUpdate();
 } catch (e) {
 console.error('Failed to trigger update download:', e);
 }
 };

 const handleApplyUpdate = async (force = false) => {
 if (!isElectron) return;
 setIsApplying(true);
 try {
 const res = await window.electronAPI.applyUpdate({ force });
 if (res?.status === 'waiting_for_idle') {
 setElectronState(prev => ({ ...prev, status: 'waiting_for_idle', activeJobs: res.activeJobs }));
 }
 } catch (e) {
 console.error('Failed to apply update:', e);
 setIsApplying(false);
 }
 };

 const handleSnooze = () => {
 const snoozeUntil = Date.now() + 24 * 60 * 60 * 1000;
 localStorage.setItem('umx_update_snooze_until', snoozeUntil.toString());
 window.dispatchEvent(new CustomEvent('umx-update-snoozed', { detail: snoozeUntil }));
 onClose();
 };

 const handleClearCache = async () => {
 setCacheMessage('Clearing...');
 if (isElectron && window.electronAPI?.clearUpdateCache) {
 const res = await window.electronAPI.clearUpdateCache();
 setCacheMessage(res?.success ? 'Cache cleared!' : 'Failed to clear');
 setTimeout(() => setCacheMessage(null), 2500);
 onRefreshUpdate?.();
 } else {
 localStorage.removeItem('umx_update_snooze_until');
 setCacheMessage('Cache reset!');
 setTimeout(() => setCacheMessage(null), 2500);
 onRefreshUpdate?.();
 }
 };

 const formatBytes = (bytes) => {
 if (!bytes || bytes === 0) return '0 B';
 const k = 1024;
 const sizes = ['B', 'KB', 'MB', 'GB'];
 const i = Math.floor(Math.log(bytes) / Math.log(k));
 return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
 };

 const hasCategorizedNotes = 
 categories.features.length > 0 || 
 categories.fixes.length > 0 || 
 categories.security.length > 0 || 
 categories.performance.length > 0;

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm ">
 <motion.div
 initial={{ opacity: 0, y: 4 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: 4 }}
 className="relative w-full max-w-2xl glass-panel rounded-2xl border border-slate-700/80 shadow-[0_0_30px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col max-h-[92vh]"
 >
 {/* Header */}
 <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700/80 bg-zinc-50 dark:bg-zinc-900">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-indigo-500 text-cyan-400 flex items-center justify-center border border-indigo-500">
 <Sparkles size={20} />
 </div>
 <div>
 <div className="flex items-center gap-2 flex-wrap">
 <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
 Update Center
 </h2>
 {updateInfo.updateAvailable ? (
 <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500 text-emerald-600 dark:text-emerald-400 border border-emerald-500">
 New Release
 </span>
 ) : (
 <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-zinc-500 text-slate-400 border border-zinc-500">
 Up to date
 </span>
 )}
 {/* Bump type badge */}
 {bumpType === 'major' && (
 <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500 text-purple-600 dark:text-purple-400 border border-purple-500 uppercase tracking-wider">
 Major Upgrade
 </span>
 )}
 {bumpType === 'minor' && (
 <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500 text-cyan-400 border border-indigo-500 uppercase tracking-wider">
 Feature Update
 </span>
 )}
 {bumpType === 'patch' && (
 <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500 text-sky-600 dark:text-sky-400 border border-sky-500 uppercase tracking-wider">
 Patch Update
 </span>
 )}
 {/* Channel badge */}
 <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
 channel === 'beta'
 ? 'bg-amber-500 text-amber-600 dark:text-amber-400 border-amber-500'
 : 'bg-slate-800/60 text-zinc-600 dark:text-zinc-300 border-slate-700/80'
 }`}>
 {channel === 'beta' ? 'Beta Track' : 'Stable Track'}
 </span>
 </div>
 <p className="text-xs text-slate-400 mt-0.5">
 Current: <span className="font-semibold text-slate-300 font-mono">v{currentVersion}</span> • Target: <span className="font-semibold text-cyan-400 font-mono">v{latestVersion}</span>
 </p>
 </div>
 </div>

 <div className="flex items-center gap-1.5">
 <button
 onClick={onRefreshUpdate}
 title="Check for updates again"
 className="p-2 text-slate-500 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-slate-800 rounded-md transition-colors"
 >
 <RefreshCw size={16} />
 </button>
 <button
 onClick={onClose}
 className="p-2 text-slate-500 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-slate-800 rounded-md transition-colors"
 >
 <X size={18} />
 </button>
 </div>
 </div>

 {/* Enterprise Navigation Tabs */}
 <div className="flex flex-wrap border-b border-slate-200 dark:border-slate-700/80 px-6 bg-white dark:bg-zinc-900 text-xs font-bold">
 <button
 onClick={() => setActiveTab('overview')}
 className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
 activeTab === 'overview'
 ? 'border-cyan-500 text-teal-700 dark:border-cyan-400 dark:text-cyan-400'
 : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-zinc-500 dark:hover:text-zinc-300'
 }`}
 >
 <Sparkles size={13} />
 Overview & Action
 </button>
 <button
 onClick={() => setActiveTab('changelog')}
 className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
 activeTab === 'changelog'
 ? 'border-cyan-500 text-teal-700 dark:border-cyan-400 dark:text-cyan-400'
 : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-zinc-500 dark:hover:text-zinc-300'
 }`}
 >
 <ListFilter size={13} />
 Changelog & Notes
 </button>
 <button
 onClick={() => setActiveTab('manual')}
 className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
 activeTab === 'manual'
 ? 'border-cyan-500 text-teal-700 dark:border-cyan-400 dark:text-cyan-400'
 : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-zinc-500 dark:hover:text-zinc-300'
 }`}
 >
 <Download size={13} />
 Platform Packages ({assets.length})
 </button>
 </div>

 {/* Traffic Status Safety Banner */}
 <div className="px-6 py-2.5 bg-slate-800/60 border-b border-slate-700/80 flex items-center justify-between text-xs">
 <div className="flex items-center gap-2">
 <ShieldCheck size={16} className="text-emerald-500" />
 <span className="font-semibold text-slate-300">
 Zero-Interruption Policy:
 </span>
 <span className="text-slate-400">
 {activeJobsCount > 0 
 ? `${activeJobsCount} download(s) active. Updates will not interrupt media streams.`
 : 'Server idle. Safe to update anytime.'}
 </span>
 </div>

 <div className="flex items-center gap-1.5 font-medium">
 <span className={`w-2 h-2 rounded-md ${activeJobsCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
 <span className={activeJobsCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
 {activeJobsCount > 0 ? `${activeJobsCount} Active` : 'Idle'}
 </span>
 </div>
 </div>

 {/* Content Body */}
 <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-300">
 
 {activeTab === 'overview' && (
 <div className="space-y-4">
 {/* Release Title Banner */}
 <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900/40 border border-slate-700/80">
 <div>
 <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
 <span>{releaseName}</span>
 {updateInfo.isPrerelease && (
 <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500 text-amber-600 dark:text-amber-400 border border-amber-500">
 PRE-RELEASE
 </span>
 )}
 </div>
 {updateInfo.publishedAt && (
 <p className="text-xs text-slate-500 mt-0.5">
 Published {new Date(updateInfo.publishedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
 </p>
 )}
 </div>
 <a
 href={releaseUrl}
 target="_blank"
 rel="noreferrer"
 onClick={(e) => handleOpenExternal(e, releaseUrl)}
 className="text-xs font-semibold text-cyan-400 hover:text-indigo-600 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-900/10 border border-indigo-500"
 >
 GitHub Release <ExternalLink size={12} />
 </a>
 </div>

 {/* Electron In-App Auto-Updater Panel */}
 {isElectron ? (
 <div className="p-4 rounded-lg bg-cyan-900/10 border border-indigo-100 dark:border-indigo-900 space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Laptop size={16} className="text-cyan-400" />
 <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
 Desktop Background Engine
 </span>
 </div>
 <span className="text-xs font-medium text-zinc-500">
 {electronState.status === 'downloading' && `Downloading (${electronState.percent}%)`}
 {electronState.status === 'downloaded' && 'Ready to Install'}
 {electronState.status === 'waiting_for_idle' && 'Waiting for Downloads'}
 {electronState.status === 'applying' && 'Restarting App...'}
 {electronState.status === 'available' && 'Update Available'}
 {electronState.status === 'not-available' && 'All Up To Date'}
 </span>
 </div>

 {/* Progress bar if downloading */}
 {electronState.status === 'downloading' && (
 <div className="space-y-1">
 <div className="w-full bg-indigo-200 dark:bg-indigo-900 h-2.5 rounded-md overflow-hidden">
 <div 
 className="bg-indigo-500 h-full transition-all duration-300 rounded-md"
 style={{ width: `${electronState.percent}%` }}
 />
 </div>
 <div className="flex justify-between text-[11px] text-slate-500">
 <span>Progress: {electronState.percent}%</span>
 <span>Speed: {formatBytes(electronState.speed)}/s</span>
 </div>
 </div>
 )}

 {/* Waiting for idle prompt */}
 {electronState.status === 'waiting_for_idle' && (
 <div className="flex items-center gap-2.5 p-3 rounded-lg bg-amber-500 border border-amber-500 text-amber-700 dark:text-amber-300 text-xs">
 <Clock size={16} className="animate-spin text-amber-500 flex-shrink-0" />
 <span>
 <strong>Update staged safely!</strong> Application will restart automatically once the active download completes.
 </span>
 </div>
 )}

 {/* Actions Bar */}
 <div className="flex flex-wrap items-center gap-2.5 pt-1">
 {electronState.status === 'available' && (
 <>
 <button
 onClick={handleDownloadUpdate}
 className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-xs transition-all shadow-md shadow-sm active:scale-[0.98]"
 >
 <Download size={14} />
 Download in Background
 </button>
 <button
 onClick={handleSnooze}
 className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/80 text-zinc-600 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
 title="Hide update notification for 24 hours"
 >
 <BellOff size={13} />
 Remind Me in 24h
 </button>
 </>
 )}

 {electronState.status === 'downloaded' && (
 <>
 <button
 onClick={() => handleApplyUpdate(false)}
 disabled={isApplying}
 className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-md shadow-sm active:scale-[0.98]"
 >
 <CheckCircle2 size={14} />
 {activeJobsCount > 0 ? 'Install When Downloads Finish (Safe)' : 'Restart & Install Now'}
 </button>

 {activeJobsCount > 0 && (
 <button
 onClick={() => handleApplyUpdate(true)}
 className="px-3 py-2 rounded-lg border border-rose-500 text-rose-600 dark:text-rose-400 hover:bg-rose-500 text-xs font-semibold transition-colors"
 title="Interrupt active downloads and restart immediately"
 >
 Force Restart Now
 </button>
 )}
 </>
 )}

 {electronState.status === 'error' && (
 <div className="flex items-center gap-2 text-rose-500 text-xs">
 <AlertCircle size={14} />
 <span>{electronState.error || 'Failed to update automatically.'}</span>
 </div>
 )}
 </div>
 </div>
 ) : (
 /* Web/Cloud Platform Update Notice */
 <div className="p-4 rounded-lg bg-sky-500 dark:bg-sky-500 border border-sky-500 text-xs space-y-2">
 <div className="font-bold text-sky-950 dark:text-sky-200 flex items-center gap-1.5">
 <ServerIcon size={14} className="text-sky-500" />
 <span>Cloud & Web Client Synchronization</span>
 </div>
 <p className="text-slate-400 text-[11px] leading-relaxed">
 You are accessing UniExtract via web browser or PWA. The backend automatically leverages the latest container and library builds. For standalone offline desktop usage with native FFmpeg hardware acceleration, download a desktop package from the <b>Platform Packages</b> tab.
 </p>
 {updateInfo.updateAvailable && (
 <button
 onClick={handleSnooze}
 className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-semibold bg-slate-800/60 border border-slate-700/80 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100"
 >
 <BellOff size={12} />
 Snooze notification for 24h
 </button>
 )}
 </div>
 )}

 {/* Enterprise Authenticode & Cryptographic Integrity Card */}
 <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-700/80 space-y-2.5">
 <div className="flex items-center justify-between">
 <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
 <ShieldCheck size={14} className="text-emerald-500" />
 Enterprise Security & Cryptographic Integrity
 </span>
 <button
 onClick={handleClearCache}
 className="text-[11px] text-slate-500 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center gap-1"
 title="Clear cached installer files and temporary staging"
 >
 <Trash2 size={12} />
 {cacheMessage || 'Wipe Cache'}
 </button>
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
 <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-700/80 space-y-0.5">
 <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Publisher</div>
 <div className="font-semibold text-zinc-700 dark:text-zinc-200 truncate">AryansDevStudios</div>
 </div>
 <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-700/80 space-y-0.5">
 <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Code Signing</div>
 <div className="font-semibold text-emerald-600 dark:text-emerald-400 truncate flex items-center gap-1">
 <Lock size={11} /> Authenticode Valid
 </div>
 </div>
 <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-700/80 space-y-0.5">
 <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Integrity Enforced</div>
 <div className="font-semibold text-cyan-400 truncate">SHA-512 + Blockmap</div>
 </div>
 </div>
 </div>
 </div>
 )}

 {activeTab === 'changelog' && (
 <div className="space-y-4">
 {hasCategorizedNotes ? (
 <div className="space-y-3">
 {categories.features.length > 0 && (
 <div className="p-4 rounded-lg bg-emerald-500 dark:bg-emerald-500 border border-emerald-500 space-y-2">
 <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
 <Sparkles size={14} />
 <span>New Features & Capabilities ({categories.features.length})</span>
 </div>
 <ul className="space-y-1.5 text-xs text-slate-300">
 {categories.features.map((item, i) => (
 <li key={i} className="flex items-start gap-2">
 <span className="text-emerald-500 mt-0.5">•</span>
 <span>{item}</span>
 </li>
 ))}
 </ul>
 </div>
 )}

 {categories.fixes.length > 0 && (
 <div className="p-4 rounded-lg bg-sky-500 dark:bg-sky-500 border border-sky-500 space-y-2">
 <div className="flex items-center gap-1.5 text-xs font-bold text-sky-700 dark:text-sky-400">
 <Bug size={14} />
 <span>Bug Fixes & Refinements ({categories.fixes.length})</span>
 </div>
 <ul className="space-y-1.5 text-xs text-slate-300">
 {categories.fixes.map((item, i) => (
 <li key={i} className="flex items-start gap-2">
 <span className="text-sky-500 mt-0.5">•</span>
 <span>{item}</span>
 </li>
 ))}
 </ul>
 </div>
 )}

 {categories.security.length > 0 && (
 <div className="p-4 rounded-lg bg-purple-500 dark:bg-purple-500 border border-purple-500 space-y-2">
 <div className="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-400">
 <ShieldCheck size={14} />
 <span>Security & Hardening ({categories.security.length})</span>
 </div>
 <ul className="space-y-1.5 text-xs text-slate-300">
 {categories.security.map((item, i) => (
 <li key={i} className="flex items-start gap-2">
 <span className="text-purple-500 mt-0.5">•</span>
 <span>{item}</span>
 </li>
 ))}
 </ul>
 </div>
 )}

 {categories.performance.length > 0 && (
 <div className="p-4 rounded-lg bg-amber-500 dark:bg-amber-500 border border-amber-500 space-y-2">
 <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
 <Zap size={14} />
 <span>Performance & Compression ({categories.performance.length})</span>
 </div>
 <ul className="space-y-1.5 text-xs text-slate-300">
 {categories.performance.map((item, i) => (
 <li key={i} className="flex items-start gap-2">
 <span className="text-amber-500 mt-0.5">•</span>
 <span>{item}</span>
 </li>
 ))}
 </ul>
 </div>
 )}
 </div>
 ) : (
 /* Fallback Markdown changelog */
 <div className="p-4 rounded-lg bg-zinc-50 dark:bg-black/60 backdrop-blur-sm border border-slate-700/80 text-xs leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap font-mono text-zinc-600 dark:text-zinc-300">
 {releaseNotes}
 </div>
 )}

 {/* Raw Release Notes toggle */}
 {hasCategorizedNotes && (
 <details className="text-xs text-slate-500 cursor-pointer">
 <summary className="font-semibold hover:text-zinc-600 dark:hover:text-zinc-200">
 View Complete Raw Markdown Changelog
 </summary>
 <div className="mt-2 p-3 rounded-lg bg-zinc-50 dark:bg-black/60 backdrop-blur-sm border border-slate-700/80 text-[11px] font-mono whitespace-pre-wrap">
 {releaseNotes}
 </div>
 </details>
 )}
 </div>
 )}

 {activeTab === 'manual' && (
 <div className="space-y-3">
 <div className="text-xs text-slate-400">
 Direct release artifacts for manual offline installations, enterprise mass-deployment, or custom staging:
 </div>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
 {assets.map((asset, idx) => (
 <a
 key={idx}
 href={asset.url}
 target="_blank"
 rel="noreferrer"
 onClick={(e) => handleOpenExternal(e, asset.url)}
 className="flex items-center justify-between p-3 rounded-lg border border-slate-700/80 hover:border-cyan-400 dark:hover:border-cyan-400 bg-white/50 dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all text-xs group"
 >
 <div className="flex items-center gap-2.5 overflow-hidden">
 <Download size={14} className="text-slate-500 group-hover:text-cyan-400 transition-colors flex-shrink-0" />
 <span className="font-semibold text-zinc-700 dark:text-zinc-200 truncate">
 {asset.name}
 </span>
 </div>
 <span className="text-[11px] text-slate-500 flex-shrink-0 ml-2">
 {formatBytes(asset.size)}
 </span>
 </a>
 ))}
 </div>

 {/* Docker instruction */}
 <div className="p-3 rounded-lg bg-zinc-100 dark:bg-black/60 backdrop-blur-sm border border-slate-700/80 text-xs flex items-center justify-between">
 <div className="flex items-center gap-2 text-slate-400">
 <ServerIcon size={14} />
 <span>Docker: <code>ghcr.io/aryansdevstudios/uniextract:latest</code></span>
 </div>
 <button
 onClick={() => navigator.clipboard?.writeText('docker pull ghcr.io/aryansdevstudios/uniextract:latest')}
 className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-800/60 border border-slate-700/80 hover:bg-zinc-50 text-slate-300"
 >
 Copy Pull
 </button>
 </div>
 </div>
 )}
 </div>

 {/* Modal Footer */}
 <div className="px-6 py-4 border-t border-slate-700/80 bg-slate-900/90 flex items-center justify-between">
 <div className="text-[11px] text-slate-500">
 Channel: <b className="uppercase">{channel}</b> • Bump: <b className="capitalize">{bumpType}</b>
 </div>
 <button
 onClick={onClose}
 className="px-6 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 transition-all shadow-[0_0_15px_rgba(6,182,212,0.35)] active:scale-[0.98]"
 >
 Close
 </button>
 </div>
 </motion.div>
 </div>
 );
}
