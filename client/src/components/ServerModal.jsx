import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Server, 
  X, 
  Check, 
  Activity, 
  RefreshCw, 
  Globe, 
  Terminal, 
  Cpu, 
  ExternalLink,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { getCustomServerUrl, setCustomServerUrl, testServerConnection } from '../utils/api';

export default function ServerModal({ isOpen, onClose, onToast }) {
  const [currentCustomUrl, setCurrentCustomUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const active = getCustomServerUrl();
      setCurrentCustomUrl(active);
      setInputUrl(active);
      setTestResult(null);

      // Automatically run a health check on open
      runTest(active);
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
    const trimmed = inputUrl.trim();
    setCustomServerUrl(trimmed);
    const active = getCustomServerUrl();
    setCurrentCustomUrl(active);
    if (active) {
      onToast?.(`Custom server endpoint set to: ${active}`, 'success');
    } else {
      onToast?.('Switched back to Default Cloud Server (Render / Netlify proxy)', 'info');
    }
    onClose();
  };

  const handleReset = () => {
    setCustomServerUrl('');
    setInputUrl('');
    setCurrentCustomUrl('');
    runTest('');
    onToast?.('Reset to Default Cloud Server', 'info');
  };

  const handlePreset = (presetUrl) => {
    setInputUrl(presetUrl);
    runTest(presetUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Server size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Backend Server Endpoint
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Connect your personal backend server to bypass cloud/Render limits
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

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* CURRENT SERVER STATUS CARD */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Active Backend
              </span>
              {currentCustomUrl ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  Custom Endpoint
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                  Default (Render / Netlify Proxy)
                </span>
              )}
            </div>

            <div className="text-sm font-semibold font-mono text-slate-800 dark:text-slate-200 truncate">
              {currentCustomUrl ? currentCustomUrl : 'https://universal-media-extractor-vav8.onrender.com'}
            </div>

            {/* CONNECTION TEST STATUS */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/50 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {isTesting ? (
                  <>
                    <RefreshCw size={13} className="text-indigo-500 animate-spin" />
                    <span className="text-slate-500">Pinging server...</span>
                  </>
                ) : testResult?.success ? (
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Online • {testResult.latency}ms response
                  </div>
                ) : testResult ? (
                  <div className="flex items-center gap-1.5 text-red-500 font-medium">
                    <AlertCircle size={13} />
                    {testResult.error || 'Server unreachable'}
                  </div>
                ) : (
                  <span className="text-slate-400">Status unchecked</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => runTest(inputUrl)}
                disabled={isTesting}
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <Activity size={12} />
                Test Latency
              </button>
            </div>
          </div>

          {/* INPUT FORM */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Custom Server URL:
            </label>
            <div className="relative">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="http://localhost:3000 or https://your-server.com"
                className="w-full text-xs font-mono px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>

            {/* PRESETS */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] text-slate-400">Presets:</span>
              <button
                type="button"
                onClick={() => handlePreset('http://localhost:3000')}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
              >
                Localhost (http://localhost:3000)
              </button>
              <button
                type="button"
                onClick={() => handlePreset('')}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
              >
                Default Cloud
              </button>
            </div>
          </div>

          {/* SELF-HOSTING & BYPASS INSTRUCTIONS */}
          <div className="p-4 rounded-2xl bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 text-xs space-y-2.5">
            <div className="flex items-center gap-1.5 font-bold text-indigo-950 dark:text-indigo-200">
              <Cpu size={15} className="text-indigo-500" />
              Why use your own custom server?
            </div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Render's free cloud instance sleeps after 15 minutes of inactivity and has monthly bandwidth/CPU limits.
              Running your own backend locally or on a private VPS gives you <b>unlimited download speeds</b>, <b>zero queue limits</b>, and <b>instant startup</b>.
            </p>

            <div className="p-2.5 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] space-y-1">
              <div className="text-slate-400 font-sans text-[10px] uppercase font-bold flex items-center gap-1">
                <Terminal size={12} /> Run locally in 3 steps:
              </div>
              <div className="text-emerald-400">git clone https://github.com/AryansDevStudios/Universal-Media-Extractor.git</div>
              <div>npm install</div>
              <div className="text-amber-300">npm start</div>
            </div>
            <p className="text-[11px] text-slate-500">
              Then point your endpoint above to <code>http://localhost:3000</code>. Cross-Origin Resource Sharing (CORS) is enabled by default.
            </p>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={handleReset}
            disabled={!currentCustomUrl && !inputUrl}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            Reset to Default
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md hover:shadow-indigo-500/20 active:scale-95"
            >
              <Check size={15} />
              Save & Apply Endpoint
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
