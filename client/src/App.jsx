import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import SearchBox from './components/SearchBox';
import CompactResultPanel from './components/CompactResultPanel';
import PlaylistView from './components/PlaylistView';
import RecentHistory from './components/RecentHistory';
import CookieModal from './components/CookieModal';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  
  const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem('umx_recent') || '[]'));
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [metadata, setMetadata] = useState(null);
  
  const [selectedVideo, setSelectedVideo] = useState({ id: '', size: 0, label: '' });
  const [selectedAudio, setSelectedAudio] = useState({ id: '', size: 0, label: '' });
  const [selectedContainer, setSelectedContainer] = useState('default');
  const [splitChapters, setSplitChapters] = useState(false);
  const [clipStart, setClipStart] = useState('00:00:00');
  const [clipEnd, setClipEnd] = useState('');
  const [audioLang, setAudioLang] = useState('default');
  const [embedSubs, setEmbedSubs] = useState(false);
  const [subLang, setSubLang] = useState('en');
  
  const [downloadJob, setDownloadJob] = useState(null);
  const [progress, setProgress] = useState('0%');
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const [downloadEta, setDownloadEta] = useState('');
  const [jobStatus, setJobStatus] = useState('');
  const pollIntervalRef = useRef(null);

  const [toasts, setToasts] = useState([]);
  const [cookieModalOpen, setCookieModalOpen] = useState(false);
  const [cookieStatus, setCookieStatus] = useState(null);

  const fetchCookieStatus = async () => {
    try {
      const res = await fetch('/api/cookies');
      if (res.ok) {
        const data = await res.json();
        setCookieStatus(data);
      }
    } catch (e) {
      console.error('Failed to load cookie status:', e);
    }
  };

  useEffect(() => {
    fetchCookieStatus();
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem('umx_recent', JSON.stringify(history));
  }, [history]);

  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const isAnalyzingRef = useRef(false);
  const sessionCacheRef = useRef(new Map());

  const applyMetadata = (data, url) => {
    setMetadata({ ...data, url });
    
    setHistory(prev => {
      const filtered = prev.filter(r => r.url !== url);
      const next = [{ title: data.title, thumb: data.thumbnail, url }, ...filtered];
      return next.slice(0, 8); // Keep compact history
    });
    
    if (data.isPlaylist) {
      return;
    }
    
    const vList = (data.formats || []).filter(f => f.vcodec).sort((a,b) => (b.height - a.height) || ((a.size || Infinity) - (b.size || Infinity)));
    const aList = (data.formats || []).filter(f => f.acodec && !f.vcodec).sort((a,b) => {
      const abrA = parseInt(a.abr) || 0;
      const abrB = parseInt(b.abr) || 0;
      if (abrA !== abrB) return abrB - abrA;
      return (a.size || Infinity) - (b.size || Infinity);
    });
    
    if (vList.length > 0) setSelectedVideo({ id: vList[0].id, size: vList[0].size, label: vList[0].label });
    else setSelectedVideo({ id: '', size: 0, label: 'NoVideo' });
    
    if (aList.length > 0) setSelectedAudio({ id: aList[0].id, size: aList[0].size, label: aList[0].label });
    else setSelectedAudio({ id: '', size: 0, label: 'PreMerged' });
    
    setSelectedContainer('default');
    setSplitChapters(false);
    setClipStart('00:00:00');
    setClipEnd('');
    setAudioLang('default');
    setEmbedSubs(false);
    setSubLang((data.subtitles && data.subtitles[0]?.lang) || 'en');
  };

  const handleAnalyze = async (url) => {
    if (!url) return showToast("Please paste a URL first.", "error");
    
    // SPAM PREVENTION: Ignore subsequent clicks if we are already analyzing
    if (isAnalyzingRef.current) return;
    
    setDownloadJob(null);
    setProgress('0%');
    setJobStatus('');

    // INSTANT CACHE HIT: If analyzed during this session, restore instantly!
    if (sessionCacheRef.current.has(url)) {
      applyMetadata(sessionCacheRef.current.get(url), url);
      return;
    }
    
    // NETWORK FETCH
    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    setMetadata(null); // Unmounts the current card, triggers loading UI
    
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);
      
      // Store in memory for instant reuse later
      sessionCacheRef.current.set(url, data);
      
      applyMetadata(data, url);

    } catch (e) {
      showToast(e.message || "Network error.", "error");
    } finally {
      isAnalyzingRef.current = false;
      setIsAnalyzing(false);
    }
  };

  const handleDownloadThumbnail = () => {
    if (!metadata?.thumbnail) return showToast("No thumbnail available", "error");
    showToast("Converting high-res thumbnail...", "info");
    const url = `/api/thumbnail?imgUrl=${encodeURIComponent(metadata.thumbnail)}&title=${encodeURIComponent(metadata.title)}`;
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const activeJobIdRef = useRef(null);

  const cancelDownload = async () => {
    const jobId = activeJobIdRef.current;
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    activeJobIdRef.current = null;
    setJobStatus('');
    setProgress('0%');
    setDownloadSpeed('');
    setDownloadEta('');
    setDownloadJob(null);

    if (jobId) {
      try {
        await fetch(`/api/cancel/${jobId}`, { method: 'POST' });
        showToast("Download cancelled. Server bandwidth freed.", "info");
      } catch (e) {}
    }
  };

  const startDownload = async () => {
    if (!selectedVideo.id && !selectedAudio.id) return showToast("Choose a stream.", "error");

    setJobStatus('downloading');
    setProgress('0%');
    setDownloadSpeed('');
    setDownloadEta('');
    setDownloadJob(true);

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: metadata.url,
          vId: selectedVideo.id,
          aId: selectedAudio.id,
          vLabel: selectedVideo.label || 'NoVideo',
          aLabel: selectedAudio.label || 'NoAudio',
          title: metadata.title,
          container: selectedContainer !== 'default' 
            ? selectedContainer 
            : (!selectedVideo.id ? (selectedAudio.id === 'm4a' ? 'm4a' : 'mp3') : undefined),
          splitChapters,
          clipStart: clipStart || '',
          clipEnd: clipEnd || '',
          audioLang,
          embedSubs,
          subLang
        })
      });
      
      const { jobId } = await res.json();
      activeJobIdRef.current = jobId;

      pollIntervalRef.current = setInterval(async () => {
        try {
          const s = await (await fetch(`/api/status/${jobId}`)).json();
          if (s.status === 'cancelled') {
            clearInterval(pollIntervalRef.current);
            activeJobIdRef.current = null;
            setJobStatus('');
            setDownloadSpeed('');
            setDownloadEta('');
            setDownloadJob(null);
            return;
          }

          if (s.progress) setProgress(s.progress);
          if (s.speed !== undefined) setDownloadSpeed(s.speed || '');
          if (s.eta !== undefined) setDownloadEta(s.eta || '');
          
          if (s.status === 'completed') {
            clearInterval(pollIntervalRef.current);
            activeJobIdRef.current = null;
            setJobStatus('completed');
            setProgress('100%');
            setDownloadSpeed('');
            setDownloadEta('');
            showToast("File ready! Downloading...", "success");
            const downloadUrl = `/api/file/${jobId}/${encodeURIComponent(metadata.title)}`;
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = downloadUrl;
            a.setAttribute('download', '');
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              if (document.body.contains(a)) document.body.removeChild(a);
              setDownloadJob(null);
            }, 3000);
          } else if (s.status === 'error') {
            clearInterval(pollIntervalRef.current);
            activeJobIdRef.current = null;
            setJobStatus('error');
            setDownloadSpeed('');
            setDownloadEta('');
            showToast(s.error ? `Failed: ${s.error}` : "Processing failed.", "error");
          }
        } catch(e) {}
      }, 1000);

    } catch (e) {
      activeJobIdRef.current = null;
      setJobStatus('error');
      showToast("Request failed.", "error");
    }
  };

  // Drop in-flight download immediately if user closes the tab or navigates away
  useEffect(() => {
    const handleUnload = () => {
      const jobId = activeJobIdRef.current;
      if (jobId) {
        navigator.sendBeacon(`/api/cancel/${jobId}`);
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen relative font-sans flex flex-col selection:bg-indigo-500/30 selection:text-indigo-900 dark:selection:text-indigo-100">
      
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-slate-50 dark:bg-slate-950 transition-colors duration-500" />
      <motion.div 
        className="fixed inset-0 pointer-events-none -z-10 opacity-40 dark:opacity-20"
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 0%, #6366f1 0%, transparent 50%), radial-gradient(circle at 100% 100%, #a855f7 0%, transparent 50%)',
          backgroundSize: '200% 200%'
        }}
      />

      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div 
              key={t.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`px-4 py-3 rounded-xl text-white font-medium text-xs md:text-sm shadow-xl flex items-center gap-2 backdrop-blur-md ${
                t.type === 'error' ? 'bg-red-500/90' : t.type === 'success' ? 'bg-emerald-500/90' : 'bg-slate-800/90'
              }`}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <Header 
        isDark={isDark} 
        toggleTheme={() => setIsDark(!isDark)} 
        cookieStatus={cookieStatus}
        onOpenCookies={() => setCookieModalOpen(true)}
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 md:px-8 flex flex-col items-center justify-center -mt-10 py-20">
        
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full"
        >
          <SearchBox onAnalyze={handleAnalyze} isLoading={isAnalyzing} />
        </motion.div>

        <AnimatePresence mode="wait">
          {isAnalyzing ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mt-16 flex flex-col items-center justify-center gap-4 text-slate-400 dark:text-slate-500"
            >
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                <div className="absolute inset-0 bg-indigo-500/10 blur-xl rounded-full animate-pulse" />
              </div>
              <span className="text-sm font-bold tracking-widest uppercase mt-2 text-indigo-500/70">Scanning Media...</span>
            </motion.div>
          ) : metadata ? (
            metadata.isPlaylist ? (
              <PlaylistView
                key="playlist-view"
                playlist={metadata}
                onToast={showToast}
              />
            ) : (
              <CompactResultPanel
                key="result-panel"
                metadata={metadata}
                selectedVideo={selectedVideo} setSelectedVideo={setSelectedVideo}
                selectedAudio={selectedAudio} setSelectedAudio={setSelectedAudio}
                selectedContainer={selectedContainer} setSelectedContainer={setSelectedContainer}
                splitChapters={splitChapters} setSplitChapters={setSplitChapters}
                clipStart={clipStart} setClipStart={setClipStart}
                clipEnd={clipEnd} setClipEnd={setClipEnd}
                audioLang={audioLang} setAudioLang={setAudioLang}
                embedSubs={embedSubs} setEmbedSubs={setEmbedSubs}
                subLang={subLang} setSubLang={setSubLang}
                onDownloadThumb={handleDownloadThumbnail}
                onDownloadMedia={startDownload}
                onCancelDownload={cancelDownload}
                isDownloading={!!downloadJob}
                progress={progress}
                status={jobStatus}
                downloadSpeed={downloadSpeed}
                downloadEta={downloadEta}
              />
            )
          ) : null}
        </AnimatePresence>

        <RecentHistory 
          history={history} 
          onSelect={handleAnalyze} 
          onDelete={(url) => setHistory(prev => prev.filter(h => h.url !== url))} 
        />
      </main>

      <footer className="w-full py-8 text-center flex flex-col items-center justify-center space-y-2 opacity-80 hover:opacity-100 transition-opacity">
        <div className="text-slate-800 dark:text-slate-300 text-xs font-medium">
          © 2026 
          <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent font-black tracking-wide ml-1.5">
            AryansDevStudios
          </span>
        </div>
        <a href="https://github.com/AryansDevStudios/Universal-Media-Extractor" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 text-[10px] uppercase tracking-widest font-bold transition-colors">
          Open-Source & Free
        </a>
      </footer>

      <CookieModal 
        isOpen={cookieModalOpen}
        onClose={() => setCookieModalOpen(false)}
        cookieStatus={cookieStatus}
        onCookieUpdated={fetchCookieStatus}
        onToast={showToast}
      />
    </div>
  );
}

export default App;
