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
  Info
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
  const [activeTab, setActiveTab] = useState('preferences'); // 'preferences' | 'about'

  // Persistent user preferences
  const [defaultContainer, setDefaultContainer] = useState(() => localStorage.getItem('umx_pref_container') || 'default');
  const [defaultAudioLang, setDefaultAudioLang] = useState(() => localStorage.getItem('umx_pref_audio_lang') || 'default');
  const [defaultEmbedSubs, setDefaultEmbedSubs] = useState(() => localStorage.getItem('umx_pref_embed_subs') === 'true');
  const [defaultSplitChapters, setDefaultSplitChapters] = useState(() => localStorage.getItem('umx_pref_split_chapters') === 'true');
  const [rememberHistory, setRememberHistory] = useState(() => localStorage.getItem('umx_pref_remember_history') !== 'false');

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

  if (!isOpen) return null;

  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.6.2';
  const currentVersion = updateInfo?.currentVersion || appVersion;
  const envInfo = getEnvironmentInfo(getCustomServerUrl());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Settings size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Settings & Preferences
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure media defaults, system preferences & credits
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200/80 dark:border-slate-800 px-6 bg-slate-50/30 dark:bg-slate-900/30 text-xs font-bold">
          <button
            onClick={() => setActiveTab('preferences')}
            className={`py-3 px-4 border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'preferences'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Layers size={14} />
            Preferences & Controls
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`py-3 px-4 border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'about'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Info size={14} />
            About & Credits
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {activeTab === 'preferences' && (
            <div className="space-y-5">
              {/* Appearance Mode */}
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isDark ? <Moon size={16} className="text-indigo-400" /> : <Sun size={16} className="text-amber-500" />}
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Interface Theme</span>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 transition-all text-slate-700 dark:text-slate-300 shadow-sm"
                  >
                    {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Toggle between high-contrast dark slate theme and clean modern daylight aesthetic.
                </p>
              </div>

              {/* Default Media Container */}
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <FileVideo size={16} className="text-indigo-500" />
                    Default Media Container
                  </label>
                  <span className="text-[10px] uppercase font-bold text-indigo-500 tracking-wider bg-indigo-500/10 px-2 py-0.5 rounded-md">
                    {defaultContainer.toUpperCase()}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  The initial format selected when analyzing video or audio streams.
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
                  {[
                    { id: 'default', label: 'Auto' },
                    { id: 'mp4', label: 'MP4' },
                    { id: 'mkv', label: 'MKV' },
                    { id: 'webm', label: 'WebM' },
                    { id: 'mp3', label: 'MP3' },
                    { id: 'm4a', label: 'M4A' }
                  ].map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => handleSavePref('umx_pref_container', fmt.id, setDefaultContainer)}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all text-center border ${
                        defaultContainer === fmt.id
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/20'
                          : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Extraction Options Toggles */}
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-700/60 space-y-4">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Subtitles size={16} className="text-indigo-500" />
                  Extraction Automation Controls
                </div>

                {/* Subtitles Toggle */}
                <div className="flex items-center justify-between pt-1">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Auto-Embed Subtitles
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Automatically activate subtitle muxing if available in source media
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSavePref('umx_pref_embed_subs', (!defaultEmbedSubs).toString(), () => setDefaultEmbedSubs(!defaultEmbedSubs))}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out ${
                      defaultEmbedSubs ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                        defaultEmbedSubs ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Split Chapters Toggle */}
                <div className="flex items-center justify-between border-t border-slate-200/60 dark:border-slate-700/50 pt-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Auto-Split Chapters
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Split media into individual chapter tracks when chapters are present
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSavePref('umx_pref_split_chapters', (!defaultSplitChapters).toString(), () => setDefaultSplitChapters(!defaultSplitChapters))}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out ${
                      defaultSplitChapters ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                        defaultSplitChapters ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* History Persistence Toggle */}
                <div className="flex items-center justify-between border-t border-slate-200/60 dark:border-slate-700/50 pt-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Save History Locally
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Store recent analyzed links in your browser/app storage
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSavePref('umx_pref_remember_history', (!rememberHistory).toString(), () => setRememberHistory(!rememberHistory))}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out ${
                      rememberHistory ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                        rememberHistory ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Data & Quick Management */}
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Quick Modals & Management
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => { onClose(); onOpenServer(); }}
                    className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-all shadow-sm group"
                    title={envInfo.headerTooltip}
                  >
                    <Server size={14} className="text-indigo-500 shrink-0" />
                    <span>Server</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-medium">
                      {envInfo.badgeText}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { onClose(); onOpenCookies(); }}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-amber-500 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-all shadow-sm"
                  >
                    <Cookie size={14} className="text-amber-500" />
                    Media Cookies
                  </button>
                  <button
                    type="button"
                    onClick={() => { onClose(); onOpenUpdate(); }}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-all shadow-sm"
                  >
                    <Sparkles size={14} className="text-emerald-500" />
                    Check Updates
                  </button>
                </div>

                {/* History Clear */}
                <div className="pt-2 flex items-center justify-between border-t border-slate-200/60 dark:border-slate-700/50">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    History cache ({history?.length || 0} items)
                  </span>
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    disabled={!history?.length}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                    Clear History
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-5">
              {/* Main Branding Card */}
              <div className="p-5 rounded-3xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/20 text-center space-y-3">
                <div className="inline-flex p-3 rounded-2xl bg-white dark:bg-slate-800 shadow-md shadow-indigo-500/10 border border-slate-200 dark:border-slate-700">
                  <img src="/favicon.ico" alt="Logo" className="w-12 h-12 rounded-xl" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                    Uni <span className="text-indigo-500">Extract</span>
                  </h3>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-1 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30">
                    v{currentVersion} • Production Release
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  A high-performance universal media extraction, video downloader, audio demuxer and stream transcoder engine.
                </p>
              </div>

              {/* Publisher & Credits */}
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Heart size={14} className="text-rose-500" />
                  Author & Publisher Credit
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80">
                  <div className="space-y-0.5">
                    <div className="text-xs font-black bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                      AryansDevStudios
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Engineering & Design • Open-Source Project
                    </div>
                  </div>
                  <a
                    href="https://github.com/AryansDevStudios"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    <span>Developer Profile</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {/* GitHub Links */}
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-700/60 space-y-3">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Github size={15} className="text-slate-700 dark:text-slate-300" />
                  GitHub Repository & Community
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <a
                    href="https://github.com/AryansDevStudios/UniExtract"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 transition-all text-xs group"
                  >
                    <div className="flex items-center gap-2">
                      <Github size={16} className="text-slate-500 group-hover:text-indigo-500 transition-colors" />
                      <span className="font-bold text-slate-700 dark:text-slate-200">Main Repository</span>
                    </div>
                    <ExternalLink size={13} className="text-slate-400" />
                  </a>

                  <a
                    href="https://github.com/AryansDevStudios/UniExtract/releases"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 transition-all text-xs group"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-slate-500 group-hover:text-indigo-500 transition-colors" />
                      <span className="font-bold text-slate-700 dark:text-slate-200">Releases & Builds</span>
                    </div>
                    <ExternalLink size={13} className="text-slate-400" />
                  </a>

                  <a
                    href="https://github.com/AryansDevStudios/UniExtract/issues"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 transition-all text-xs group"
                  >
                    <div className="flex items-center gap-2">
                      <Shield size={16} className="text-slate-500 group-hover:text-indigo-500 transition-colors" />
                      <span className="font-bold text-slate-700 dark:text-slate-200">Report an Issue</span>
                    </div>
                    <ExternalLink size={13} className="text-slate-400" />
                  </a>

                  <a
                    href="https://github.com/AryansDevStudios/UniExtract/blob/main/LICENSE"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 transition-all text-xs group"
                  >
                    <div className="flex items-center gap-2">
                      <Terminal size={16} className="text-slate-500 group-hover:text-indigo-500 transition-colors" />
                      <span className="font-bold text-slate-700 dark:text-slate-200">MIT Open-Source</span>
                    </div>
                    <ExternalLink size={13} className="text-slate-400" />
                  </a>
                </div>
              </div>

              {/* Core Engine Powered By */}
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-700/60 space-y-2.5">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Cpu size={14} className="text-indigo-500" />
                  Powered by Open Source
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/70">
                    <div className="font-black text-slate-800 dark:text-slate-200">yt-dlp</div>
                    <div className="text-[10px] text-slate-400">Stream Extraction</div>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/70">
                    <div className="font-black text-slate-800 dark:text-slate-200">FFmpeg</div>
                    <div className="text-[10px] text-slate-400">Audio/Video Muxer</div>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/70">
                    <div className="font-black text-slate-800 dark:text-slate-200">Electron</div>
                    <div className="text-[10px] text-slate-400">Desktop Shell</div>
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/70">
                    <div className="font-black text-slate-800 dark:text-slate-200">React + Vite</div>
                    <div className="text-[10px] text-slate-400">Fast Reactive UI</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Close Button */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="text-[11px] text-slate-400">
            UniExtract v{currentVersion} • AryansDevStudios
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition-all shadow-md active:scale-95"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}
