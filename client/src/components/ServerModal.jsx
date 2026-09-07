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
    onToast?.(`Custom server endpoint set to: ${active}`, 'success');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Server size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Server Architecture & Endpoint
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose between the integrated local backend or a custom remote server
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
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          
          {/* ACTIVE ENVIRONMENT ARCHITECTURE BANNER */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-sky-500/10 to-purple-500/10 border border-indigo-500/20 text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                <Globe size={14} className="text-indigo-500 shrink-0" />
                <span>Active Deployment:</span>
                <span className="text-indigo-600 dark:text-indigo-400">{envInfo.name}</span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0 ${envInfo.badgeColor}`}>
                {envInfo.badgeText}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
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
              className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between relative ${
                selectedMode === 'default'
                  ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30 shadow-md shadow-indigo-500/5 ring-1 ring-indigo-500/20'
                  : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${envInfo.badgeColor}`}>
                    <Laptop size={11} /> {envInfo.badgeText}
                  </span>
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                    selectedMode === 'default'
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}>
                    {selectedMode === 'default' && <Check size={11} strokeWidth={3} />}
                  </div>
                </div>

                <div className="text-sm font-black text-slate-900 dark:text-slate-100 pt-0.5">
                  Default / Built-in
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  {envInfo.defaultOptionDesc}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/50 flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
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
              className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between relative ${
                selectedMode === 'custom'
                  ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30 shadow-md shadow-indigo-500/5 ring-1 ring-indigo-500/20'
                  : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    <Zap size={11} /> Advanced Mode
                  </span>
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                    selectedMode === 'custom'
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}>
                    {selectedMode === 'custom' && <Check size={11} strokeWidth={3} />}
                  </div>
                </div>

                <div className="text-sm font-black text-slate-900 dark:text-slate-100 pt-0.5">
                  Custom Remote Host
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  For advanced users who want to offload video encoding to an external VPS, home lab server, or private cloud instance to save local battery & CPU.
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/50 flex items-center gap-1.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                <Cpu size={12} />
                <span>Remote CPU & Bandwidth</span>
              </div>
            </div>

          </div>

          {/* ACTIVE STATUS & LATENCY PING BAR */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-500 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                Target Endpoint:
              </span>
              <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[280px]">
                {selectedMode === 'default'
                  ? envInfo.targetEndpoint
                  : (inputUrl || 'Not specified')}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/50 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {isTesting ? (
                  <>
                    <RefreshCw size={13} className="text-indigo-500 animate-spin" />
                    <span className="text-slate-500">Pinging server endpoint...</span>
                  </>
                ) : testResult?.success ? (
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Online • {testResult.latency}ms latency (v{testResult.data?.version || '2.6.2'})
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
                transition={{ duration: 0.2 }}
                className="space-y-3 pt-1 overflow-hidden"
              >
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Custom Server URL:
                  </label>
                  <input
                    type="text"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="https://my-backend-server.com or http://192.168.1.50:3000"
                    className="w-full text-xs font-mono px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>

                {/* PRESETS */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-400">Quick Presets:</span>
                  <button
                    type="button"
                    onClick={() => handlePreset('http://localhost:3000')}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    Localhost (3000)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePreset(DEFAULT_RENDER_SERVER)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    Cloud Render
                  </button>
                </div>

                {/* VPS / SELF-HOSTING CARD */}
                <div className="p-3.5 rounded-2xl bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-950 dark:text-indigo-200">
                    <Terminal size={14} className="text-indigo-500" />
                    How to spin up your own remote backend:
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 text-slate-200 font-mono text-[10px] space-y-1">
                    <div className="text-emerald-400">git clone https://github.com/AryansDevStudios/UniExtract.git</div>
                    <div>npm install && npm start</div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Set <code>HOST=0.0.0.0</code> in <code>.env</code> on your remote machine, then enter its public IP/domain above.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={handleReset}
            disabled={selectedMode === 'default' && !currentCustomUrl}
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
              {selectedMode === 'default' ? 'Use Default Server' : 'Apply Custom Server'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

