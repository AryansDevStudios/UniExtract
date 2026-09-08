import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Server, X, Check, Activity, RefreshCw, Globe, 
  Terminal, Cpu, Laptop, CheckCircle2, AlertCircle, 
  AlertTriangle, Lock, ShieldAlert, Sparkles, Zap, ArrowRight
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm sm:p-5 md:p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.15 }}
        className="w-full h-full max-w-none max-h-full glass-panel rounded-none border-x-0 border-y border-slate-700/80 shadow-[0_0_30px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col sm:h-auto sm:max-w-2xl sm:max-h-[92vh] sm:rounded-2xl sm:border-x sm:border-y"
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5 border-b border-slate-700/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500 text-cyan-400 border border-indigo-500">
              <Server size={24} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Server Architecture & Endpoint
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Choose between the integrated local backend or a custom remote server
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
        <div className="min-h-0 flex-1 overflow-y-auto px-0 py-3 pb-5 sm:px-6 sm:py-5 sm:pb-8 space-y-4 sm:space-y-5">
          
          {/* ACTIVE ENVIRONMENT ARCHITECTURE BANNER */}
          <div className="p-3 sm:p-4 rounded-none sm:rounded-lg border-x-0 sm:border-x bg-slate-900/40 border border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2 font-bold text-slate-200 text-sm">
                <Globe size={16} className="text-cyan-400 shrink-0" />
                <span>Active Deployment:</span>
                <span className="min-w-0 break-words text-cyan-400">{envInfo.name}</span>
              </div>
              <span className={`max-w-[45%] truncate px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border shrink-0 ${envInfo.badgeColor}`}>
                {envInfo.badgeText}
              </span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              {envInfo.serverMessage}
            </p>
          </div>

          {/* TWO ARCHITECTURAL CHOICES */}
          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
            
            {/* OPTION 1: DEFAULT SERVER (NORMAL & PWA) */}
            <div
              onClick={() => {
                setSelectedMode('default');
                runTest('');
              }}
              className={`p-3 sm:p-5 rounded-lg border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between relative ${
                selectedMode === 'default'
                  ? 'border-cyan-400 bg-cyan-900/10 shadow-md shadow-sm ring-1 ring-indigo-500/20'
                  : 'border-slate-700/80 hover:border-zinc-300 dark:hover:border-zinc-700 bg-slate-900/40'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${envInfo.badgeColor}`}>
                    <Laptop size={14} /> {envInfo.badgeText}
                  </span>
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                    selectedMode === 'default'
                      ? 'border-cyan-400 bg-cyan-500 text-white'
                      : 'border-slate-600'
                  }`}>
                    {selectedMode === 'default' && <Check size={14} strokeWidth={3} />}
                  </div>
                </div>

                <div className="text-base font-black text-slate-900 dark:text-white pt-1">
                  Default / Built-in
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {envInfo.defaultOptionDesc}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-700/80 flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={14} />
                <span>Zero setup required</span>
              </div>
            </div>

            {/* OPTION 2: CUSTOM REMOTE SERVER (ADVANCED) */}
            <div
              onClick={() => {
                setSelectedMode('custom');
                if (inputUrl) runTest(inputUrl);
              }}
              className={`p-3 sm:p-5 rounded-lg border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between relative ${
                selectedMode === 'custom'
                  ? 'border-cyan-400 bg-cyan-900/10 shadow-md shadow-sm ring-1 ring-indigo-500/20'
                  : 'border-slate-700/80 hover:border-zinc-300 dark:hover:border-zinc-700 bg-slate-900/40'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-300 dark:bg-purple-500 dark:text-purple-100 dark:border-purple-500">
                    <Zap size={14} /> Advanced Mode
                  </span>
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                    selectedMode === 'custom'
                      ? 'border-cyan-400 bg-cyan-500 text-white'
                      : 'border-slate-600'
                  }`}>
                    {selectedMode === 'custom' && <Check size={14} strokeWidth={3} />}
                  </div>
                </div>

                <div className="text-base font-black text-slate-900 dark:text-white pt-1">
                  Custom Remote Host
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  For advanced users who want to offload video encoding to an external VPS, home lab server, or private cloud instance to save local battery & CPU.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-700/80 flex items-center gap-2 text-xs font-semibold text-purple-400">
                <Cpu size={14} />
                <span>Remote CPU & Bandwidth</span>
              </div>
            </div>

          </div>

          {/* ACTIVE STATUS & LATENCY PING BAR */}
          <div className="p-3 sm:p-4 rounded-none sm:rounded-lg border-x-0 sm:border-x bg-slate-900/40 border border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-slate-400 text-xs uppercase tracking-wider">
                Target Endpoint:
              </span>
              <span className="font-mono text-sm font-semibold text-slate-200 truncate max-w-[320px]">
                {selectedMode === 'default'
                  ? envInfo.targetEndpoint
                  : (inputUrl || 'Not specified')}
              </span>
            </div>

            <div className="pt-3 border-t border-slate-700/80 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2.5">
                {isTesting ? (
                  <>
                    <RefreshCw size={16} className="text-cyan-400 animate-spin" />
                    <span className="text-zinc-400">Pinging server endpoint...</span>
                  </>
                ) : testResult?.success ? (
                  <div className="flex items-center gap-2 text-emerald-500 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online • {testResult.latency}ms latency (v{testResult.data?.version || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.8.4')})
                  </div>
                ) : testResult ? (
                  <div className="flex items-center gap-2 text-red-500 font-medium">
                    <AlertCircle size={16} />
                    {testResult.error || 'Server unreachable'}
                  </div>
                ) : (
                  <span className="text-slate-500">Status unchecked</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => runTest(selectedMode === 'custom' ? inputUrl : '')}
                disabled={isTesting}
                className="text-xs font-semibold text-cyan-400 hover:underline flex items-center gap-1.5"
              >
                <Activity size={14} />
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
                className="space-y-4 pt-2 overflow-hidden"
              >
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-300">
                    Custom Server URL:
                  </label>
                  <input
                    type="text"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder={isHttpsOrigin ? "https://my-backend-server.com or https://vps.mydomain.com:3000" : "http://localhost:3000 or https://my-backend-server.com"}
                    className="w-full text-sm font-mono px-4 py-3.5 rounded-lg bg-zinc-50 dark:bg-black/60 backdrop-blur-sm border border-slate-700/80 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>

                {/* WARNING: MIXED CONTENT RESTRICTION (HTTPS ORIGIN CALLING HTTP) */}
                {isHttpsOrigin && isHttpTarget && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 sm:p-4 rounded-none sm:rounded-lg border-x-0 sm:border-x bg-amber-500 border border-amber-500 text-sm space-y-3"
                  >
                    <div className="flex items-start gap-3 text-amber-950 dark:text-amber-950">
                      <AlertTriangle size={20} className="text-amber-900 shrink-0 mt-0.5" />
                      <div className="space-y-1.5">
                        <div className="font-bold flex items-center gap-2">
                          <span>Browser Mixed Content Restriction</span>
                          <span className="px-2 py-0.5 text-xs font-bold uppercase rounded-md bg-amber-600 text-amber-100">
                            HTTP Blocked
                          </span>
                        </div>
                        <p className="text-amber-900 leading-relaxed">
                          Because this web application is running over secure <strong>HTTPS</strong>, your web browser strictly forbids active network requests to unencrypted <code>http://</code> endpoints (like local devices or unencrypted remote servers).
                        </p>
                      </div>
                    </div>

                    <div className="pl-8 space-y-2 text-sm text-amber-950">
                      <div className="font-bold">Recommended solutions:</div>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <Laptop size={16} className="text-amber-700 shrink-0 mt-0.5" />
                          <span><strong>UniExtract Desktop App:</strong> Download the native desktop app for Windows/macOS/Linux to bypass all browser sandbox limits.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Zap size={16} className="text-amber-700 shrink-0 mt-0.5" />
                          <span><strong>Free HTTPS Tunnel:</strong> Run Cloudflare Tunnel (<code className="bg-amber-600/20 px-1 py-0.5 rounded">cloudflared tunnel --url http://localhost:3000</code>) or Pinggy to get an instant trusted <code>https://</code> address.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Lock size={16} className="text-amber-700 shrink-0 mt-0.5" />
                          <span><strong>Enable HTTPS on Server:</strong> Configure SSL certificates on your backend or reverse proxy.</span>
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
                    className="p-3 sm:p-4 rounded-none sm:rounded-lg border-x-0 sm:border-x bg-sky-500 border border-sky-500 text-sm space-y-2"
                  >
                    <div className="flex items-start gap-3 text-sky-950">
                      <Lock size={18} className="text-sky-900 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-bold flex items-center gap-1.5">
                          <span>Localhost on HTTPS Web</span>
                        </div>
                        <p className="leading-relaxed">
                          Public Certificate Authorities cannot issue signed SSL certificates for <code>localhost</code>. Unless your local machine has a locally trusted root certificate installed (e.g. via <code>mkcert</code>), browser security checks will reject the connection. For local extraction, using the native <strong>Desktop App</strong> or an <strong>HTTPS Tunnel</strong> is recommended.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* PRESETS */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400">Quick Presets:</span>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handlePreset('http://localhost:3000')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 ${
                        inputUrl === 'http://localhost:3000'
                          ? 'bg-cyan-900/10 text-cyan-400 border-indigo-300 dark:border-indigo-700'
                          : 'bg-slate-800/60 hover:bg-slate-700 text-slate-300 border-slate-700/80'
                      }`}
                    >
                      <Laptop size={14} />
                      <span>Localhost (3000)</span>
                      {isHttpsOrigin && (
                        <span className="text-xs font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500 text-amber-900">
                          HTTP
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreset(DEFAULT_RENDER_SERVER)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 ${
                        inputUrl === DEFAULT_RENDER_SERVER
                          ? 'bg-cyan-900/10 text-cyan-400 border-indigo-300 dark:border-indigo-700'
                          : 'bg-slate-800/60 hover:bg-slate-700 text-slate-300 border-slate-700/80'
                      }`}
                    >
                      <Globe size={14} />
                      <span>Cloud Render</span>
                      <span className="text-xs font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500 text-emerald-900">
                        HTTPS
                      </span>
                    </button>
                  </div>
                  {isHttpsOrigin && (
                    <p className="text-xs text-slate-500 dark:text-zinc-500 italic mt-1">
                      Note: On HTTPS web pages, connecting to Localhost (HTTP) directly will trigger browser mixed content blocks. Use the Desktop App or an HTTPS tunnel.
                    </p>
                  )}
                </div>

                {/* VPS / SELF-HOSTING & HTTPS CARD */}
                <div className="p-3 sm:p-4 rounded-none sm:rounded-lg border-x-0 sm:border-x bg-indigo-50 border border-indigo-200 dark:bg-indigo-500 dark:border-indigo-500 text-sm space-y-3">
                  <div className="flex items-center gap-2 font-bold text-indigo-950 dark:text-white">
                    <Terminal size={16} className="text-indigo-600 dark:text-cyan-200" />
                    How to self-host with HTTPS or Secure Tunnel:
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-semibold text-indigo-800 dark:text-indigo-100 mb-1.5">
                        Option 1: Cloudflare Quick Tunnel (Fastest & No Interstitial Warning Pages)
                      </div>
                      <div className="p-3 rounded-lg bg-zinc-900 text-zinc-200 font-mono text-xs space-y-1">
                        <div className="text-slate-500"># Start local backend server</div>
                        <div className="text-emerald-400">npm start</div>
                        <div className="text-slate-500 pt-1.5"># In a new terminal, launch Cloudflare tunnel (no account needed)</div>
                        <div className="text-sky-300">cloudflared tunnel --url http://localhost:3000</div>
                        <div className="text-slate-500 pt-1.5"># Or with built-in Windows OpenSSH (zero install):</div>
                        <div className="text-sky-300">ssh -p 443 -R0:localhost:3000 a.pinggy.io</div>
                      </div>
                      <p className="text-xs text-indigo-800 dark:text-indigo-100 mt-1.5">
                        Copy the generated <code>https://....trycloudflare.com</code> or Pinggy URL into the input field above.
                      </p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-indigo-800 dark:text-indigo-100 mb-1.5">
                        Option 2: Native HTTPS with SSL Certificates (VPS or Home Lab)
                      </div>
                      <div className="p-3 rounded-lg bg-zinc-900 text-zinc-200 font-mono text-xs space-y-1">
                        <div className="text-slate-500"># Pass certificates via environment variables</div>
                        <div className="text-emerald-400">HTTPS=true SSL_CERT=/path/to/server.crt SSL_KEY=/path/to/server.key npm start</div>
                      </div>
                      <p className="text-xs text-indigo-800 dark:text-indigo-100 mt-1.5">
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
        <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-5 border-t border-slate-700/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 bg-slate-900/90">
          <button
            type="button"
            onClick={handleReset}
            disabled={selectedMode === 'default' && !currentCustomUrl}
            className="self-start px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            Reset to Default
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
              className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider text-slate-950 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 transition-all shadow-[0_0_15px_rgba(6,182,212,0.35)] active:scale-[0.98]"
            >
              <Check size={18} strokeWidth={2.5} />
              {selectedMode === 'default' ? 'Use Default Server' : 'Apply Custom Server'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}