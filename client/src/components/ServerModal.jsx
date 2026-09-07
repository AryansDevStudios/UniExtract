import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
 Server, 
 X, 
 Check, 
 Activity, 
 RefreshCw, 
 Globe, 
 Terminal, 
 Cpu, 
 Laptop,
 CheckCircle2,
 AlertCircle,
 AlertTriangle,
 Lock,
 ExternalLink,
 ShieldAlert,
 Sparkles,
 Zap,
 ArrowRight
} from 'lucide-react';
import { getCustomServerUrl, setCustomServerUrl, testServerConnection } from '../utils/api';
import { getEnvironmentInfo, DEFAULT_RENDER_SERVER } from '../utils/environment';

export default function ServerModal({ isOpen, onClose, onToast }) {
 const [selectedMode, setSelectedMode] = useState('default'); // 'default' | 'custom'
 const [currentCustomUrl, setCurrentCustomUrl] = useState('');
 const [inputUrl, setInputUrl] = useState('');
 const [isTesting, setIsTesting] = useState(false);
 const [testResult, setTestResult] = useState(null);

 const isHttpsOrigin = typeof window !== 'undefined' && window.location.protocol === 'https:';
 const cleanInput = inputUrl.trim().toLowerCase();
 const isHttpTarget = cleanInput.startsWith('http://');
 const isLocalhostTarget = cleanInput.includes('localhost') || cleanInput.includes('127.0.0.1') || cleanInput.includes('0.0.0.0');

 const envInfo = getEnvironmentInfo(selectedMode === 'custom' ? (inputUrl || currentCustomUrl) : '');

 useEffect(() => {
 if (isOpen) {
 const active = getCustomServerUrl();
 setCurrentCustomUrl(active);
 if (active) {
 setSelectedMode('custom');
 setInputUrl(active);
 runTest(active);
 } else {
 setSelectedMode('default');
 setInputUrl('');
 runTest('');
 }
 }
 }, [isOpen]);

 if (!isOpen) return null;

 const runTest = async (urlToTest) => {
 setIsTesting(true);
 setTestResult(null);
 try {
 const res = await testServerConnection(urlToTest);
 setTestResult(res);
 } catch (e) {
 setTestResult({ success: false, error: e.message });
 } finally {
 setIsTesting(false);
 }
 };

 const handleSave = () => {
 if (selectedMode === 'default') {
 setCustomServerUrl('');
 setCurrentCustomUrl('');
 onToast?.('Switched to Default Built-in Server', 'info');
 onClose();
 return;
 }

 const trimmed = inputUrl.trim();
 if (!trimmed) {
 onToast?.('Please enter a server URL or choose Default Server', 'error');
 return;
 }

 setCustomServerUrl(trimmed);
 const active = getCustomServerUrl();
 setCurrentCustomUrl(active);
 if (isHttpsOrigin && isHttpTarget) {
 onToast?.(`Custom server saved. Warning: Browsers block unencrypted HTTP calls from HTTPS sites.`, 'warning');
 } else {
 onToast?.(`Custom server endpoint set to: ${active}`, 'success');
 }
 onClose();
 };

 const handleReset = () => {
 setSelectedMode('default');
 setCustomServerUrl('');
 setInputUrl('');
 setCurrentCustomUrl('');
 runTest('');
 onToast?.('Reset to Default Built-in Server', 'info');
 };

 const handlePreset = (presetUrl) => {
 setSelectedMode('custom');
 setInputUrl(presetUrl);
 runTest(presetUrl);
 };

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-5 md:p-6 bg-black/50 ">
 <motion.div
 initial={{ opacity: 0, scale: 0.95, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.95, y: 10 }}
 transition={{ duration: 0.15 }}
 className="w-full max-w-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg overflow-hidden flex flex-col max-h-[92vh]"
 >
 {/* MODAL HEADER */}
 <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100 dark:border-zinc-800">
 <div className="flex items-center gap-3">
 <div className="p-2.5 rounded-lg bg-indigo-500 text-indigo-500 border border-indigo-500">
 <Server size={22} />
 </div>
 <div>
 <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
 Server Architecture & Endpoint
 </h2>
 <p className="text-xs text-zinc-500 dark:text-zinc-400">
 Choose between the integrated local backend or a custom remote server
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
 <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
 
 {/* ACTIVE ENVIRONMENT ARCHITECTURE BANNER */}
 <div className="p-4 rounded-lg /10 /10 /10 border border-indigo-500 text-xs space-y-2">
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-1.5 font-bold text-zinc-800 dark:text-zinc-200">
 <Globe size={14} className="text-indigo-500 shrink-0" />
 <span>Active Deployment:</span>
 <span className="text-indigo-600 dark:text-indigo-400">{envInfo.name}</span>
 </div>
 <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border shrink-0 ${envInfo.badgeColor}`}>
 {envInfo.badgeText}
 </span>
 </div>
 <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
 {envInfo.serverMessage}
 </p>
 </div>

 {/* TWO ARCHITECTURAL CHOICES */}
 <div className="grid sm:grid-cols-2 gap-3.5">
 
 {/* OPTION 1: DEFAULT SERVER (NORMAL & PWA) */}
 <div
 onClick={() => {
 setSelectedMode('default');
 runTest('');
 }}
 className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between relative ${
 selectedMode === 'default'
 ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950 shadow-md shadow-sm ring-1 ring-indigo-500/20'
 : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50 dark:bg-zinc-800'
 }`}
 >
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${envInfo.badgeColor}`}>
 <Laptop size={11} /> {envInfo.badgeText}
 </span>
 <div className={`w-4 h-4 rounded-md flex items-center justify-center border ${
 selectedMode === 'default'
 ? 'border-indigo-600 bg-indigo-600 text-white'
 : 'border-zinc-300 dark:border-zinc-600'
 }`}>
 {selectedMode === 'default' && <Check size={11} strokeWidth={3} />}
 </div>
 </div>

 <div className="text-sm font-black text-zinc-900 dark:text-zinc-100 pt-0.5">
 Default / Built-in
 </div>
 <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
 {envInfo.defaultOptionDesc}
 </p>
 </div>

 <div className="mt-3 pt-2.5 border-t border-zinc-200 dark:border-zinc-700 flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
 <CheckCircle2 size={12} />
 <span>Zero setup required</span>
 </div>
 </div>

 {/* OPTION 2: CUSTOM REMOTE SERVER (ADVANCED) */}
 <div
 onClick={() => {
 setSelectedMode('custom');
 if (inputUrl) runTest(inputUrl);
 }}
 className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between relative ${
 selectedMode === 'custom'
 ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950 shadow-md shadow-sm ring-1 ring-indigo-500/20'
 : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50 dark:bg-zinc-800'
 }`}
 >
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-500 text-purple-600 dark:text-purple-400 border border-purple-500">
 <Zap size={11} /> Advanced Mode
 </span>
 <div className={`w-4 h-4 rounded-md flex items-center justify-center border ${
 selectedMode === 'custom'
 ? 'border-indigo-600 bg-indigo-600 text-white'
 : 'border-zinc-300 dark:border-zinc-600'
 }`}>
 {selectedMode === 'custom' && <Check size={11} strokeWidth={3} />}
 </div>
 </div>

 <div className="text-sm font-black text-zinc-900 dark:text-zinc-100 pt-0.5">
 Custom Remote Host
 </div>
 <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
 For advanced users who want to offload video encoding to an external VPS, home lab server, or private cloud instance to save local battery & CPU.
 </p>
 </div>

 <div className="mt-3 pt-2.5 border-t border-zinc-200 dark:border-zinc-700 flex items-center gap-1.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
 <Cpu size={12} />
 <span>Remote CPU & Bandwidth</span>
 </div>
 </div>

 </div>

 {/* ACTIVE STATUS & LATENCY PING BAR */}
 <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 space-y-2">
 <div className="flex items-center justify-between text-xs">
 <span className="font-bold text-zinc-500 dark:text-zinc-400 text-[11px] uppercase tracking-wider">
 Target Endpoint:
 </span>
 <span className="font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate max-w-[280px]">
 {selectedMode === 'default'
 ? envInfo.targetEndpoint
 : (inputUrl || 'Not specified')}
 </span>
 </div>

 <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-between text-xs">
 <div className="flex items-center gap-2">
 {isTesting ? (
 <>
 <RefreshCw size={13} className="text-indigo-500 animate-spin" />
 <span className="text-zinc-500">Pinging server endpoint...</span>
 </>
 ) : testResult?.success ? (
 <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
 <span className="w-2 h-2 rounded-md bg-emerald-500 animate-pulse" />
 Online • {testResult.latency}ms latency (v{testResult.data?.version || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.6.2')})
 </div>
 ) : testResult ? (
 <div className="flex items-center gap-1.5 text-red-500 font-medium">
 <AlertCircle size={13} />
 {testResult.error || 'Server unreachable'}
 </div>
 ) : (
 <span className="text-zinc-400">Status unchecked</span>
 )}
 </div>

 <button
 type="button"
 onClick={() => runTest(selectedMode === 'custom' ? inputUrl : '')}
 disabled={isTesting}
 className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
 >
 <Activity size={12} />
 Ping Test
 </button>
 </div>
 </div>

 {/* CUSTOM SERVER CONFIGURATION (EXPANDED WHEN IN ADVANCED MODE) */}
 <AnimatePresence>
 {selectedMode === 'custom' && (
 <motion.div
 initial={{ opacity: 0, height: 0 }}
 animate={{ opacity: 1, height: 'auto' }}
 exit={{ opacity: 0, height: 0 }}
 transition={{ duration: 0.15 }}
 className="space-y-3 pt-1 overflow-hidden"
 >
 <div className="space-y-1.5">
 <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
 Custom Server URL:
 </label>
 <input
 type="text"
 value={inputUrl}
 onChange={(e) => setInputUrl(e.target.value)}
 placeholder={isHttpsOrigin ? "https://my-backend-server.com or https://vps.mydomain.com:3000" : "http://localhost:3000 or https://my-backend-server.com"}
 className="w-full text-xs font-mono px-4 py-3 rounded-lg bg-zinc-50 dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
 />
 </div>

 {/* WARNING: MIXED CONTENT RESTRICTION (HTTPS ORIGIN CALLING HTTP) */}
 {isHttpsOrigin && isHttpTarget && (
 <motion.div
 initial={{ opacity: 0, y: -4 }}
 animate={{ opacity: 1, y: 0 }}
 className="p-3.5 rounded-lg bg-amber-500 border border-amber-500 text-xs space-y-2.5"
 >
 <div className="flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
 <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
 <div className="space-y-1">
 <div className="font-bold flex items-center gap-2">
 <span>Browser Mixed Content Restriction</span>
 <span className="px-2 py-0.5 text-[9px] font-bold uppercase rounded-md bg-amber-500 text-amber-700 dark:text-amber-300 border border-amber-500">
 HTTP Blocked
 </span>
 </div>
 <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
 Because this web application is running over secure <strong className="text-zinc-800 dark:text-zinc-200">HTTPS</strong>, your web browser strictly forbids active network requests to unencrypted <code className="text-amber-600 dark:text-amber-400">http://</code> endpoints (like local devices or unencrypted remote servers).
 </p>
 </div>
 </div>

 <div className="pl-7 space-y-1.5 text-[11px]">
 <div className="font-semibold text-zinc-700 dark:text-zinc-300">Recommended solutions:</div>
 <ul className="space-y-1.5 text-zinc-600 dark:text-zinc-400">
 <li className="flex items-start gap-1.5">
 <Laptop size={13} className="text-indigo-500 shrink-0 mt-0.5" />
 <span><strong className="text-zinc-800 dark:text-zinc-200">UniExtract Desktop App:</strong> Download the native desktop app for Windows/macOS/Linux to bypass all browser sandbox limits.</span>
 </li>
 <li className="flex items-start gap-1.5">
 <Zap size={13} className="text-purple-500 shrink-0 mt-0.5" />
 <span><strong className="text-zinc-800 dark:text-zinc-200">Free HTTPS Tunnel:</strong> Run Cloudflare Tunnel (<code className="text-indigo-600 dark:text-indigo-400 bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">cloudflared tunnel --url http://localhost:3000</code>) or Pinggy to get an instant trusted <code className="text-indigo-600 dark:text-indigo-400">https://</code> address without warning splash screens.</span>
 </li>
 <li className="flex items-start gap-1.5">
 <Lock size={13} className="text-emerald-500 shrink-0 mt-0.5" />
 <span><strong className="text-zinc-800 dark:text-zinc-200">Enable HTTPS on Server:</strong> Configure SSL certificates on your backend or reverse proxy.</span>
 </li>
 </ul>
 </div>
 </motion.div>
 )}

 {/* NOTICE: LOCALHOST OR PRIVATE IP ON HTTPS ORIGIN */}
 {isHttpsOrigin && !isHttpTarget && isLocalhostTarget && (
 <motion.div
 initial={{ opacity: 0, y: -4 }}
 animate={{ opacity: 1, y: 0 }}
 className="p-3.5 rounded-lg bg-sky-500 border border-sky-500 text-xs space-y-1.5"
 >
 <div className="flex items-start gap-2.5 text-sky-950 dark:text-sky-200">
 <Lock size={16} className="text-sky-500 shrink-0 mt-0.5" />
 <div className="space-y-1">
 <div className="font-bold flex items-center gap-1.5">
 <span>Localhost on HTTPS Web</span>
 </div>
 <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
 Public Certificate Authorities cannot issue signed SSL certificates for <code className="text-sky-600 dark:text-sky-400">localhost</code>. Unless your local machine has a locally trusted root certificate installed (e.g. via <code>mkcert</code>), browser security checks will reject the connection. For local extraction, using the native <strong>Desktop App</strong> or an <strong>HTTPS Tunnel</strong> is recommended.
 </p>
 </div>
 </div>
 </motion.div>
 )}

 {/* PRESETS */}
 <div className="space-y-1.5">
 <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Quick Presets:</span>
 <div className="flex flex-wrap items-center gap-2">
 <button
 type="button"
 onClick={() => handlePreset('http://localhost:3000')}
 className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
 inputUrl === 'http://localhost:3000'
 ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700'
 : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
 }`}
 >
 <Laptop size={13} />
 <span>Localhost (3000)</span>
 {isHttpsOrigin && (
 <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-amber-500 text-amber-700 dark:text-amber-400">
 HTTP
 </span>
 )}
 </button>
 <button
 type="button"
 onClick={() => handlePreset(DEFAULT_RENDER_SERVER)}
 className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
 inputUrl === DEFAULT_RENDER_SERVER
 ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700'
 : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
 }`}
 >
 <Globe size={13} />
 <span>Cloud Render</span>
 <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-emerald-500 text-emerald-700 dark:text-emerald-400">
 HTTPS
 </span>
 </button>
 </div>
 {isHttpsOrigin && (
 <p className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">
 Note: On HTTPS web pages, connecting to Localhost (HTTP) directly will trigger browser mixed content blocks. Use the Desktop App or an HTTPS tunnel.
 </p>
 )}
 </div>

 {/* VPS / SELF-HOSTING & HTTPS CARD */}
 <div className="p-3.5 rounded-lg bg-indigo-500 dark:bg-indigo-500 border border-indigo-500 text-xs space-y-2.5">
 <div className="flex items-center gap-1.5 font-bold text-indigo-950 dark:text-indigo-200">
 <Terminal size={14} className="text-indigo-500" />
 How to self-host with HTTPS or Secure Tunnel:
 </div>
 
 <div className="space-y-2">
 <div>
 <div className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
 Option 1: Cloudflare Quick Tunnel (Fastest & No Interstitial Warning Pages)
 </div>
 <div className="p-2.5 rounded-lg bg-zinc-900 text-zinc-200 font-mono text-[10px] space-y-0.5">
 <div className="text-zinc-400"># Start local backend server</div>
 <div className="text-emerald-400">npm start</div>
 <div className="text-zinc-400 pt-1"># In a new terminal, launch Cloudflare tunnel (no account needed)</div>
 <div className="text-sky-300">cloudflared tunnel --url http://localhost:3000</div>
 <div className="text-zinc-400 pt-1"># Or with built-in Windows OpenSSH (zero install):</div>
 <div className="text-sky-300">ssh -p 443 -R0:localhost:3000 a.pinggy.io</div>
 </div>
 <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
 Copy the generated <code>https://....trycloudflare.com</code> or Pinggy URL into the input field above.
 </p>
 </div>

 <div>
 <div className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
 Option 2: Native HTTPS with SSL Certificates (VPS or Home Lab)
 </div>
 <div className="p-2.5 rounded-lg bg-zinc-900 text-zinc-200 font-mono text-[10px] space-y-0.5">
 <div className="text-zinc-400"># Pass certificates via environment variables</div>
 <div className="text-emerald-400">HTTPS=true SSL_CERT=/path/to/server.crt SSL_KEY=/path/to/server.key npm start</div>
 </div>
 <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
 Or place certificates in <code>certs/server.crt</code> and <code>certs/server.key</code> next to <code>server.js</code>.
 </p>
 </div>
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>

 </div>

 {/* MODAL FOOTER */}
 <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3 bg-zinc-50 dark:bg-zinc-900">
 <button
 type="button"
 onClick={handleReset}
 disabled={selectedMode === 'default' && !currentCustomUrl}
 className="px-3.5 py-2 rounded-lg text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
 >
 Reset to Default
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
 className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md hover:shadow-sm active:scale-[0.98]"
 >
 <Check size={15} />
 {selectedMode === 'default' ? 'Use Default Server' : 'Apply Custom Server'}
 </button>
 </div>
 </div>
 </motion.div>
 </div>
 );
}

