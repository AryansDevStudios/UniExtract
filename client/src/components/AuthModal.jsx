import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Cookie, X, Upload, 
  CheckCircle2, AlertTriangle, Info, Sparkles, Eye, EyeOff
} from 'lucide-react';
import { apiFetch } from '../utils/api';

export default function AuthModal({ isOpen, onClose, cookieStatus, onCookieUpdated, onToast }) {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'paste'
  const [pastedContent, setPastedContent] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [password, setPassword] = useState(() => localStorage.getItem('umx_cookie_pwd') || '');
  const [showPassword, setShowPassword] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const processFile = (file) => {
    if (!file) return;
    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setPastedContent(event.target?.result || '');
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e) => {
    processFile(e.target.files?.[0]);
    if (e.target) e.target.value = null;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFile(e.dataTransfer.files?.[0]);
  };

  const handleSave = async () => {
    const content = pastedContent.trim();
    const pwd = password.trim();

    if (!content) {
      onToast?.('Please paste cookie content or select a file first.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (pwd) headers['x-cookie-password'] = pwd;

      const res = await apiFetch('/api/auth-tokens', {
        method: 'POST',
        headers,
        body: JSON.stringify({ content, password: pwd })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        onToast?.(data.error || 'Failed to save cookies.', 'error');
      } else {
        if (pwd) {
          localStorage.setItem('umx_cookie_pwd', pwd);
        }
        onToast?.(data.message || 'Cookies saved and filtered successfully!', 'success');
        setPastedContent('');
        setSelectedFileName('');
        await onCookieUpdated?.();
      }
    } catch (err) {
      onToast?.(`Network error: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Are you sure you want to clear stored media cookies?')) return;
    setIsProcessing(true);
    const pwd = password.trim();
    
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (pwd) headers['x-cookie-password'] = pwd;

      const res = await apiFetch('/api/auth-tokens', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onToast?.('Cookies cleared successfully.', 'info');
        setPastedContent('');
        setSelectedFileName('');
        await onCookieUpdated?.();
      } else {
        onToast?.(data.error || 'Failed to clear cookies.', 'error');
      }
    } catch (err) {
      onToast?.(`Network error: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm sm:p-5 md:p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.15 }}
        className="w-full h-full max-w-none max-h-full glass-panel rounded-none border-x-0 border-y border-slate-700/80 shadow-[0_0_30px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col sm:h-auto sm:max-w-2xl sm:max-h-[90vh] sm:rounded-2xl sm:border-x sm:border-y"
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5 border-b border-slate-700/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500 text-amber-500 border border-amber-500">
              <Cookie size={24} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Media Cookies & Authentication
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Manage credentials for YouTube, Instagram, Facebook, Snapchat & more
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-md hover:bg-slate-800 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="min-h-0 flex-1 overflow-y-auto px-0 py-3 pb-5 sm:px-6 sm:py-5 sm:pb-8 space-y-4 sm:space-y-6">
          {/* STATUS OVERVIEW CARD */}
          <div className="p-3 sm:p-4 rounded-none sm:rounded-lg border-x-0 sm:border-x bg-slate-900/40 border border-slate-700/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">
                Current Status
              </span>
              {cookieStatus?.isPortable && (
                <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-500 text-cyan-400 border border-indigo-500">
                  Portable Edition Mode
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {cookieStatus?.isYouTubeAuthed ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500 text-emerald-600 dark:text-emerald-400 border border-emerald-500 text-sm font-semibold">
                  <CheckCircle2 size={16} />
                  YouTube Authenticated
                </div>
              ) : cookieStatus?.count > 0 ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 text-amber-600 dark:text-amber-400 border border-amber-500 text-sm font-semibold">
                  <Info size={16} />
                  Cookies Loaded (Guest/Partial)
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-700 text-slate-400 text-sm font-semibold">
                  <AlertTriangle size={16} />
                  No Cookies Configured
                </div>
              )}

              {cookieStatus?.count > 0 && (
                <span className="text-sm text-slate-400 font-medium">
                  {cookieStatus.count} active cookie tokens
                </span>
              )}
            </div>

            {/* PLATFORM BADGES */}
            {cookieStatus?.domains?.length > 0 && (
              <div className="pt-3 border-t border-slate-700/80 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-zinc-500 mr-1">Platforms:</span>
                {cookieStatus.domains.map((dom) => (
                  <span
                    key={dom}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800/60 text-slate-300 border border-slate-700/80 capitalize shadow-xs"
                  >
                    {dom.replace('.com', '').replace('.net', '').replace('.tv', '')}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* SMART SANITIZER BANNER */}
          <div className="p-3 sm:p-4 rounded-none sm:rounded-lg border-x-0 sm:border-x bg-indigo-50 border border-indigo-300 dark:bg-indigo-500 dark:border-indigo-500 flex items-start gap-3">
            <Sparkles className="w-6 h-6 text-indigo-600 dark:text-cyan-200 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-semibold text-indigo-950 dark:text-white">
                Intelligent Cookie Sanitizer Active
              </p>
              <p className="text-indigo-800 dark:text-indigo-50 leading-relaxed">
                Paste any raw browser export! The built-in filter will automatically drop search engine trackers (Bing, MSN, Scorecard) and Google account risk cookies, retaining <b>only</b> required media tokens (YouTube, Instagram, Facebook, Snapchat, etc.).
              </p>
            </div>
          </div>

          {/* INPUT TABS */}
          <div className="space-y-4">
            <div className="flex border-b border-slate-700/80">
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`pb-2.5 px-4 text-sm font-bold border-b-2 transition-colors ${
                  activeTab === 'upload'
                    ? 'border-indigo-500 text-cyan-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                Upload cookies.txt / JSON
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`pb-2.5 px-4 text-sm font-bold border-b-2 transition-colors ${
                  activeTab === 'paste'
                    ? 'border-indigo-500 text-cyan-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                Paste Text
              </button>
            </div>

            {activeTab === 'upload' ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-all ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-500 dark:bg-indigo-500'
                    : 'border-slate-700/80 hover:border-zinc-300 dark:hover:border-zinc-700 bg-slate-900/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="mx-auto w-14 h-14 rounded-lg bg-indigo-500 text-cyan-400 flex items-center justify-center mb-4">
                  <Upload size={26} />
                </div>
                <p className="text-base font-semibold text-slate-200">
                  {selectedFileName ? selectedFileName : 'Click to select or drag & drop cookies file'}
                </p>
                <p className="text-sm text-slate-500 dark:text-zinc-500 mt-2">
                  Supports Netscape cookies.txt or browser extension JSON exports
                </p>
                {selectedFileName && (
                  <span className="inline-block mt-4 px-3 py-1.5 bg-emerald-500 text-emerald-600 dark:text-emerald-400 text-sm font-bold rounded-lg border border-emerald-500">
                    File Loaded • Ready to Apply
                  </span>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  rows={6}
                  value={pastedContent}
                  onChange={(e) => setPastedContent(e.target.value)}
                  placeholder="Paste your Netscape cookies.txt content or JSON cookie array here..."
                  className="w-full text-sm font-mono p-4 rounded-lg bg-zinc-50 dark:bg-black/60 backdrop-blur-sm border border-slate-700/80 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
                />
                <p className="text-xs text-slate-500">
                  {pastedContent.trim().length > 0
                    ? `${pastedContent.trim().split('\n').length} lines pasted`
                    : 'Paste tab-separated Netscape format or JSON export from your cookie manager.'}
                </p>
              </div>
            )}
          </div>

          {/* SERVER PASSWORD SECTION */}
          <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-300">
                Server Access Password
              </label>
              {cookieStatus?.requiresPassword ? (
                <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-500 text-amber-600 dark:text-amber-400 border border-amber-500">
                  Password Required
                </span>
              ) : (
                <span className="text-xs text-slate-500">
                  Optional (Local / Unsecured)
                </span>
              )}
            </div>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={cookieStatus?.requiresPassword ? "Enter server COOKIE_PASSWORD..." : "Leave blank if server has no password..."}
                className="w-full text-sm font-mono pl-4 pr-10 py-3 rounded-lg bg-white dark:bg-black/60 backdrop-blur-sm border border-slate-700/80 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-500">
              {cookieStatus?.requiresPassword 
                ? "This server requires the COOKIE_PASSWORD configured in its environment to save or delete cookies."
                : "If your backend server has COOKIE_PASSWORD set in its .env, provide it here."}
            </p>
          </div>

          {/* PORTABLE GUIDE & TIPS */}
          <div className="p-3 sm:p-4 rounded-none sm:rounded-lg border-x-0 sm:border-x bg-slate-800/60 text-xs text-slate-400 space-y-2">
            <div className="font-semibold text-slate-300">
              Portable & Export Tips
            </div>
            <p>
              • <b>Portable Edition:</b> Place <code>cookies.txt</code> in the same folder as the portable application (<code>.exe</code>) on your USB drive or folder for instant plug-and-play cookies anywhere.
            </p>
            <p>
              • <b>How to get cookies:</b> Use browser extensions like <i>"Get cookies.txt locally"</i> or <i>"Cookie-Editor"</i> while logged into YouTube, Instagram, or Snapchat.
            </p>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="shrink-0 px-3 py-3 sm:px-6 sm:py-5 border-t border-slate-700/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 bg-slate-900/90">
          <button
            type="button"
            onClick={handleClear}
            disabled={isProcessing || !cookieStatus?.count}
            className="self-start px-3 py-2 rounded-lg text-xs sm:text-sm font-bold text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-40 transition-colors"
          >
            Clear Cookies
          </button>

          <div className="flex w-full sm:w-auto items-center justify-end gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold text-slate-400 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isProcessing || !pastedContent.trim()}
              className="flex flex-1 sm:flex-none items-center justify-center px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider text-slate-950 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(6,182,212,0.35)] active:scale-[0.98]"
            >
              {isProcessing ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-md animate-spin" />
                  Filtering...
                </div>
              ) : (
                "Filter & Save Cookies"
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}