import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
 Cookie, 
 X, 
 Upload, 
 FileText, 
 ShieldCheck, 
 Trash2, 
 CheckCircle2, 
 AlertTriangle,
 Info,
 Sparkles,
 Lock,
 Eye,
 EyeOff
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

 const handleFileChange = (e) => {
 const file = e.target.files?.[0];
 if (!file) return;
 setSelectedFileName(file.name);
 const reader = new FileReader();
 reader.onload = (event) => {
 setPastedContent(event.target?.result || '');
 };
 reader.readAsText(file);
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
 const file = e.dataTransfer.files?.[0];
 if (!file) return;
 setSelectedFileName(file.name);
 const reader = new FileReader();
 reader.onload = (event) => {
 setPastedContent(event.target?.result || '');
 };
 reader.readAsText(file);
 };

 const handleSave = async () => {
 if (!pastedContent.trim()) {
 onToast?.('Please paste cookie content or select a file first.', 'error');
 return;
 }

 setIsProcessing(true);
 try {
 const headers = { 'Content-Type': 'application/json' };
 if (password.trim()) {
 headers['x-cookie-password'] = password.trim();
 }

 const res = await apiFetch('/api/auth-tokens', {
 method: 'POST',
 headers,
 body: JSON.stringify({ content: pastedContent, password: password.trim() })
 });

 const data = await res.json();
 if (!res.ok || !data.success) {
 onToast?.(data.error || 'Failed to save cookies.', 'error');
 } else {
 if (password.trim()) {
 localStorage.setItem('umx_cookie_pwd', password.trim());
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
 try {
 const headers = { 'Content-Type': 'application/json' };
 if (password.trim()) {
 headers['x-cookie-password'] = password.trim();
 }

 const res = await apiFetch('/api/auth-tokens', {
 method: 'DELETE',
 headers,
 body: JSON.stringify({ password: password.trim() })
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
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-5 md:p-6 bg-black/50 ">
 <motion.div
 initial={{ opacity: 0, scale: 0.95, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.95, y: 10 }}
 transition={{ duration: 0.15 }}
 className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg overflow-hidden flex flex-col max-h-[90vh]"
 >
 {/* MODAL HEADER */}
 <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100 dark:border-zinc-800">
 <div className="flex items-center gap-3">
 <div className="p-2.5 rounded-lg bg-amber-500 text-amber-500 border border-amber-500">
 <Cookie size={22} />
 </div>
 <div>
 <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
 Media Cookies & Authentication
 </h2>
 <p className="text-xs text-zinc-500 dark:text-zinc-400">
 Manage credentials for YouTube, Instagram, Facebook, Snapchat & more
 </p>
 </div>
 </div>
 <button
 onClick={onClose}
 className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
 >
 <X size={20} />
 </button>
 </div>

 {/* MODAL BODY */}
 <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
 {/* STATUS OVERVIEW CARD */}
 <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 space-y-3">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
 Current Status
 </span>
 {cookieStatus?.isPortable && (
 <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500 text-indigo-500 border border-indigo-500">
 Portable Edition Mode
 </span>
 )}
 </div>

 <div className="flex flex-wrap items-center gap-2.5">
 {cookieStatus?.isYouTubeAuthed ? (
 <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500 text-emerald-600 dark:text-emerald-400 border border-emerald-500 text-xs font-semibold">
 <CheckCircle2 size={14} />
 YouTube Authenticated
 </div>
 ) : cookieStatus?.count > 0 ? (
 <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500 text-amber-600 dark:text-amber-400 border border-amber-500 text-xs font-semibold">
 <Info size={14} />
 Cookies Loaded (Guest/Partial)
 </div>
 ) : (
 <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 text-xs font-semibold">
 <AlertTriangle size={14} />
 No Cookies Configured
 </div>
 )}

 {cookieStatus?.count > 0 && (
 <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
 {cookieStatus.count} active cookie tokens
 </span>
 )}
 </div>

 {/* PLATFORM BADGES */}
 {cookieStatus?.domains && cookieStatus.domains.length > 0 && (
 <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 flex flex-wrap items-center gap-1.5">
 <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mr-1">Platforms:</span>
 {cookieStatus.domains.map((dom) => (
 <span
 key={dom}
 className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 capitalize shadow-xs"
 >
 {dom.replace('.com', '').replace('.net', '').replace('.tv', '')}
 </span>
 ))}
 </div>
 )}
 </div>

 {/* SMART SANITIZER BANNER */}
 <div className="p-3.5 rounded-lg bg-indigo-500 dark:bg-indigo-500 border border-indigo-500 flex items-start gap-3">
 <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
 <div className="text-xs space-y-1">
 <p className="font-semibold text-indigo-950 dark:text-indigo-200">
 Intelligent Cookie Sanitizer Active
 </p>
 <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
 Paste any raw browser export! The built-in filter will automatically drop search engine trackers (Bing, MSN, Scorecard) and Google account risk cookies, retaining <b>only</b> required media tokens (YouTube, Instagram, Facebook, Snapchat, etc.).
 </p>
 </div>
 </div>

 {/* INPUT TABS */}
 <div className="space-y-3">
 <div className="flex border-b border-zinc-200 dark:border-zinc-800">
 <button
 type="button"
 onClick={() => setActiveTab('upload')}
 className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors ${
 activeTab === 'upload'
 ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
 : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
 }`}
 >
 <Upload size={15} />
 Upload cookies.txt / JSON
 </button>
 <button
 type="button"
 onClick={() => setActiveTab('paste')}
 className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors ${
 activeTab === 'paste'
 ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
 : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
 }`}
 >
 <FileText size={15} />
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
 : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50 dark:bg-zinc-800'
 }`}
 >
 <input
 ref={fileInputRef}
 type="file"
 accept=".txt,.json"
 onChange={handleFileChange}
 className="hidden"
 />
 <div className="mx-auto w-12 h-12 rounded-lg bg-indigo-500 text-indigo-500 flex items-center justify-center mb-3">
 <Upload size={22} />
 </div>
 <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
 {selectedFileName ? selectedFileName : 'Click to select or drag & drop cookies file'}
 </p>
 <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
 Supports Netscape cookies.txt or browser extension JSON exports
 </p>
 {selectedFileName && (
 <span className="inline-block mt-3 px-3 py-1 bg-emerald-500 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500">
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
 className="w-full text-xs font-mono p-3.5 rounded-lg bg-zinc-50 dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
 />
 <p className="text-[11px] text-zinc-400">
 {pastedContent.trim().length > 0
 ? `${pastedContent.trim().split('\n').length} lines pasted`
 : 'Paste tab-separated Netscape format or JSON export from your cookie manager.'}
 </p>
 </div>
 )}
 </div>

 {/* SERVER PASSWORD SECTION */}
 <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 space-y-2">
 <div className="flex items-center justify-between">
 <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
 <Lock size={14} className={cookieStatus?.requiresPassword ? "text-amber-500" : "text-zinc-400"} />
 Server Access Password
 </label>
 {cookieStatus?.requiresPassword ? (
 <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500 text-amber-600 dark:text-amber-400 border border-amber-500">
 Password Required
 </span>
 ) : (
 <span className="text-[10px] text-zinc-400">
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
 className="w-full text-xs font-mono pl-3.5 pr-10 py-2.5 rounded-lg bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
 />
 <button
 type="button"
 onClick={() => setShowPassword(!showPassword)}
 className="absolute right-3 top-1/2 -tranzinc-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
 title={showPassword ? "Hide password" : "Show password"}
 >
 {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
 </button>
 </div>
 <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
 {cookieStatus?.requiresPassword 
 ? "This server requires the COOKIE_PASSWORD configured in its environment to save or delete cookies."
 : "If your backend server has COOKIE_PASSWORD set in its .env, provide it here."}
 </p>
 </div>

 {/* PORTABLE GUIDE & TIPS */}
 <div className="p-3.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1.5">
 <div className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
 <Info size={14} className="text-indigo-400" />
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
 <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3 bg-zinc-50 dark:bg-zinc-900">
 <button
 type="button"
 onClick={handleClear}
 disabled={isProcessing || !cookieStatus?.count}
 className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-40 transition-colors"
 >
 <Trash2 size={14} />
 Clear Cookies
 </button>

 <div className="flex items-center gap-2.5">
 <button
 type="button"
 onClick={onClose}
 className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
 >
 Cancel
 </button>
 <button
 type="button"
 onClick={handleSave}
 disabled={isProcessing || !pastedContent.trim()}
 className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md hover:shadow-sm active:scale-[0.98]"
 >
 {isProcessing ? (
 <>
 <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-md animate-spin" />
 Filtering & Saving...
 </>
 ) : (
 <>
 <ShieldCheck size={15} />
 Filter & Save Cookies
 </>
 )}
 </button>
 </div>
 </div>
 </motion.div>
 </div>
 );
}
