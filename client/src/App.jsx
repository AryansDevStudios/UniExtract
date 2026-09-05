import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import SearchBox from './components/SearchBox';
import MediaCard from './components/MediaCard';
import FormatSelector from './components/FormatSelector';
import DownloadProgress from './components/DownloadProgress';
import RecentHistory from './components/RecentHistory';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  
  const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem('umx_recent') || '[]'));
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [advancedMode, setAdvancedMode] = useState(false);
  
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
        return next.slice(0, 20);
      });
      
      // Auto select defaults will be handled by FormatSelector via empty string initially or we can preselect
      // To mirror previous behavior, we'll let FormatSelector render and the user clicks.
      // Wait, we need to preselect the first available if not advanced.
      const vList = data.formats.filter(f => f.vcodec).sort((a,b) => (b.height - a.height) || (b.size - a.size));
      const aList = data.formats.filter(f => f.acodec && !f.vcodec).sort((a,b) => b.size - a.size);
      
      if (vList.length > 0) setSelectedVideo({ id: vList[0].id, size: vList[0].size, label: vList[0].label });
      else setSelectedVideo({ id: '', size: 0, label: 'NoVideo' });
      
      if (aList.length > 0) setSelectedAudio({ id: aList[0].id, size: aList[0].size, label: aList[0].label });
      else setSelectedAudio({ id: '', size: 0, label: 'PreMerged' });

      showToast("Analysis Complete", "success");
    } catch (e) {
      showToast(e.message || "Network error.", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownloadThumbnail = () => {
    if (!metadata?.thumbnail) return showToast("No thumbnail available", "error");
    showToast("Converting high-res thumbnail to PNG...", "info");
    const url = `/api/thumbnail?imgUrl=${encodeURIComponent(metadata.thumbnail)}&title=${encodeURIComponent(metadata.title)}`;
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const startDownload = async () => {
    if (!selectedVideo.id && !selectedAudio.id) return showToast("Selection invalid. Choose a stream.", "error");

    showToast("Task Started: Processing media...", "info");
    setJobStatus('downloading');
    setProgress('0%');

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
      setDownloadJob(jobId);

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
            showToast("Processing failed. Check server logs.", "error");
          }
        } catch(e) {}
      }, 1000);

    } catch (e) {
      setJobStatus('error');
      showToast("Download request failed.", "error");
    }
  };

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const totalSize = (selectedVideo.size || 0) + (selectedAudio.size || 0);

  return (
    <div className="pb-10 font-sans">
      
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 z-50 flex flex-col gap-2 pointer-events-none md:max-w-sm">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div 
              key={t.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={`px-6 py-4 rounded-2xl text-white font-black text-sm shadow-2xl flex items-center gap-3 ${
                t.type === 'error' ? 'bg-red-500' : t.type === 'success' ? 'bg-green-500' : 'bg-brand'
              }`}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <Header isDark={isDark} toggleTheme={() => setIsDark(!isDark)} />

      <main className="max-w-5xl mx-auto bg-white dark:bg-slate-900 shadow-2xl rounded-3xl md:rounded-[2.5rem] border border-slate-200 dark:border-slate-800 relative z-10 flex flex-col">
        <SearchBox onAnalyze={handleAnalyze} isLoading={isAnalyzing} />

        <AnimatePresence mode="wait">
          {metadata && (
            <motion.div
              key="content"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <MediaCard metadata={metadata} onDownloadThumb={handleDownloadThumbnail} />
              
              <FormatSelector 
                formats={metadata.formats}
                advancedMode={advancedMode}
                onToggleAdvanced={setAdvancedMode}
                selectedVideo={selectedVideo}
                selectedAudio={selectedAudio}
                setSelectedVideo={setSelectedVideo}
                setSelectedAudio={setSelectedAudio}
              />

              <DownloadProgress 
                isDownloading={!!downloadJob}
                progress={progress}
                status={jobStatus}
                totalSize={totalSize}
                onStart={startDownload}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <RecentHistory 
        history={history} 
        onSelect={handleAnalyze} 
        onDelete={(url) => setHistory(prev => prev.filter(h => h.url !== url))} 
      />

      <footer className="text-center text-sm mt-12 mb-6 space-y-1">
        <div className="text-slate-800 dark:text-slate-200">
          © 2026 
          <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent font-black tracking-wide ml-1">
            AryansDevStudios
          </span>
        </div>
        <div className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">
          <a href="https://github.com/AryansDevStudios/Universal-Media-Extractor" target="_blank" rel="noreferrer" className="hover:text-brand transition-colors underline decoration-transparent hover:decoration-brand underline-offset-4">
            Open-source & free to use
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;
