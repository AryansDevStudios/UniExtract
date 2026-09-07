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
  Server as ServerIcon 
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
  const [activeTab, setActiveTab] = useState('overview'); // overview, downloads

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

  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.6.2';
  const currentVersion = updateInfo.currentVersion || appVersion;
  const latestVersion = updateInfo.latestVersion || appVersion;
  const releaseName = updateInfo.releaseName || `v${latestVersion}`;
  const releaseNotes = updateInfo.releaseNotes || 'No release notes provided.';
  const releaseUrl = updateInfo.releaseUrl || 'https://github.com/AryansDevStudios/UniExtract/releases';
  const assets = updateInfo.assets || [];

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

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  Update Center
                </h2>
                {updateInfo.updateAvailable ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    New Release
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                    Up to date
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Current: <span className="font-semibold text-slate-700 dark:text-slate-300">v{currentVersion}</span> • Latest: <span className="font-semibold text-indigo-600 dark:text-indigo-400">v{latestVersion}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onRefreshUpdate}
              title="Check for updates again"
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Traffic Status Safety Banner */}
        <div className="px-6 py-3 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-500" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Zero-Interruption Policy:
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              {activeJobsCount > 0 
                ? `${activeJobsCount} download(s) active. Updates will not interrupt media streams.`
                : 'Server idle. Safe to update anytime.'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-medium">
            <span className={`w-2 h-2 rounded-full ${activeJobsCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span className={activeJobsCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
              {activeJobsCount > 0 ? `${activeJobsCount} Active` : 'Idle'}
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-700 dark:text-slate-300">
          {/* Release Title */}
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
              <span>{releaseName}</span>
              <a
                href={releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-normal text-indigo-500 hover:text-indigo-600 flex items-center gap-1"
              >
                Release on GitHub <ExternalLink size={12} />
              </a>
            </h3>
            {updateInfo.publishedAt && (
              <p className="text-xs text-slate-400 mt-0.5">
                Published {new Date(updateInfo.publishedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </p>
            )}
          </div>

          {/* Electron In-App Auto-Updater Panel */}
          {isElectron && (
            <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Laptop size={16} className="text-indigo-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Desktop Auto-Update Engine
                  </span>
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {electronState.status === 'downloading' && `Downloading (${electronState.percent}%)`}
                  {electronState.status === 'downloaded' && 'Ready to Install'}
                  {electronState.status === 'waiting_for_idle' && 'Waiting for Downloads'}
                  {electronState.status === 'applying' && 'Restarting App...'}
                  {electronState.status === 'available' && 'Update Available'}
                </span>
              </div>

              {/* Progress bar if downloading */}
              {electronState.status === 'downloading' && (
                <div className="mb-3">
                  <div className="w-full bg-indigo-200 dark:bg-indigo-900/50 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-500 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${electronState.percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                    <span>Progress: {electronState.percent}%</span>
                    <span>Speed: {formatBytes(electronState.speed)}/s</span>
                  </div>
                </div>
              )}

              {/* Waiting for idle prompt */}
              {electronState.status === 'waiting_for_idle' && (
                <div className="flex items-center gap-2.5 p-3 mb-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs">
                  <Clock size={16} className="animate-spin text-amber-500 flex-shrink-0" />
                  <span>
                    <strong>Update staged safely!</strong> Application will restart automatically once the active download completes.
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                {electronState.status === 'available' && (
                  <button
                    onClick={handleDownloadUpdate}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-md shadow-indigo-600/20"
                  >
                    <Download size={14} />
                    Download Update in Background
                  </button>
                )}

                {electronState.status === 'downloaded' && (
                  <>
                    <button
                      onClick={() => handleApplyUpdate(false)}
                      disabled={isApplying}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-md shadow-emerald-600/20"
                    >
                      <CheckCircle2 size={14} />
                      {activeJobsCount > 0 ? 'Install When Downloads Finish (Safe)' : 'Restart & Install Now'}
                    </button>

                    {activeJobsCount > 0 && (
                      <button
                        onClick={() => handleApplyUpdate(true)}
                        className="px-3 py-2 rounded-xl border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition-colors"
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
          )}

          {/* Release Notes */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Release Notes & Changelog
            </h4>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 text-xs leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-slate-600 dark:text-slate-300">
              {releaseNotes}
            </div>
          </div>

          {/* Platform Direct Downloads */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Manual Installers & Platform Packages
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {assets.map((asset, idx) => (
                <a
                  key={idx}
                  href={asset.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 bg-white/50 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all text-xs group"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <Download size={14} className="text-slate-400 group-hover:text-indigo-500 transition-colors flex-shrink-0" />
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                      {asset.name}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 flex-shrink-0 ml-2">
                    {formatBytes(asset.size)}
                  </span>
                </a>
              ))}
            </div>

            {/* Docker quick pull instruction */}
            <div className="p-3 rounded-xl bg-slate-100/60 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <ServerIcon size={14} />
                <span>Docker: <code>ghcr.io/aryansdevstudios/uniextract:latest</code></span>
              </div>
              <button
                onClick={() => navigator.clipboard?.writeText('docker pull ghcr.io/aryansdevstudios/uniextract:latest')}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300"
              >
                Copy Pull
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
