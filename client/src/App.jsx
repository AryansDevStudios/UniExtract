import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import SearchBox from './components/SearchBox';
import CompactResultPanel from './components/CompactResultPanel';
import RecentHistory from './components/RecentHistory';
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
  
  const [downloadJob, setDownloadJob] = useState(null);
  const [progress, setProgress] = useState('0%');
  const [jobStatus, setJobStatus] = useState('');
  const pollIntervalRef = useRef(null);

  const [toasts, setToasts] = useState([]);

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

  const handleAnalyze = async (url) => {
    if (!url) return showToast("Please paste a URL first.", "error");
    
    setIsAnalyzing(true);
    setMetadata(null);
    setDownloadJob(null);
    setProgress('0%');
    setJobStatus('');
    
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);
      
      setMetadata({ ...data, url });
      
      setHistory(prev => {
        const filtered = prev.filter(r => r.url !== url);
        const next = [{ title: data.title, thumb: data.thumbnail, url }, ...filtered];
        return next.slice(0, 8); // Keep compact history
      });
      
      const vList = data.formats.filter(f => f.vcodec).sort((a,b) => (b.height - a.height) || ((a.size || Infinity) - (b.size || Infinity)));
      const aList = data.formats.filter(f => f.acodec && !f.vcodec).sort((a,b) => (b.size || 0) - (a.size || 0));
      
      if (vList.length > 0) setSelectedVideo({ id: vList[0].id, size: vList[0].size, label: vList[0].label });
      else setSelectedVideo({ id: '', size: 0, label: 'NoVideo' });
      
      if (aList.length > 0) setSelectedAudio({ id: aList[0].id, size: aList[0].size, label: aList[0].label });
      else setSelectedAudio({ id: '', size: 0, label: 'PreMerged' });

    } catch (e) {
      showToast(e.message || "Network error.", "error");
    } finally {
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

  const startDownload = async () => {
    if (!selectedVideo.id && !selectedAudio.id) return showToast("Choose a stream.", "error");

    setJobStatus('downloading');
    setProgress('0%');
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
          title: metadata.title
        })
      });
      
      const { jobId } = await res.json();

      pollIntervalRef.current = setInterval(async () => {
        try {
          const s = await (await fetch(`/api/status/${jobId}`)).json();
          if (s.progress) setProgress(s.progress);
          
          if (s.status === 'completed') {
            clearInterval(pollIntervalRef.current);
            setJobStatus('completed');
            setProgress('100%');
            showToast("File ready! Downloading...", "success");
            window.location.href = `/api/file/${jobId}/${encodeURIComponent(metadata.title)}`;
            setTimeout(() => setDownloadJob(null), 3000);
          } else if (s.status === 'error') {
            clearInterval(pollIntervalRef.current);
            setJobStatus('error');
            showToast("Processing failed.", "error");
          }
        } catch(e) {}
      }, 1000);

    } catch (e) {
      setJobStatus('error');
      showToast("Request failed.", "error");
    }
  };

  useEffect(() => {
    return () => {
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

      <Header isDark={isDark} toggleTheme={() => setIsDark(!isDark)} />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-8 flex flex-col items-center justify-center -mt-10 py-20">
        
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full"
        >
          <SearchBox onAnalyze={handleAnalyze} isLoading={isAnalyzing} />
        </motion.div>

        <AnimatePresence mode="wait">
          {metadata && (
            <CompactResultPanel
              key="result-panel"
              metadata={metadata}
              selectedVideo={selectedVideo}
              setSelectedVideo={setSelectedVideo}
              selectedAudio={selectedAudio}
              setSelectedAudio={setSelectedAudio}
              onDownloadThumb={handleDownloadThumbnail}
              onDownloadMedia={startDownload}
              isDownloading={!!downloadJob}
              progress={progress}
              status={jobStatus}
            />
          )}
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
    </div>
  );
}

export default App;
