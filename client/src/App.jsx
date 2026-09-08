import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import SearchBox from './components/SearchBox';
import CompactResultPanel from './components/CompactResultPanel';
import PlaylistView from './components/PlaylistView';
import RecentHistory from './components/RecentHistory';
import AuthModal from './components/AuthModal';
import ServerModal from './components/ServerModal';
import UpdateModal from './components/UpdateModal';
import SettingsModal from './components/SettingsModal';
import DownloadPage from './components/DownloadPage';
import { apiUrl, apiFetch, getCustomServerUrl, shouldShowServerSelector } from './utils/api';
import { isOnlineFrontend } from './utils/environment';
import { 
  matchRoute, 
  getAutoAnalyzeUrl, 
  syncRouteToUrl, 
  ROUTE_HOME, 
  ROUTE_DOWNLOADS, 
  ROUTE_COOKIES, 
  ROUTE_SETTINGS, 
  ROUTE_SERVERS, 
  ROUTE_UPDATES 
} from './utils/routes';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const initialRoute = typeof window !== 'undefined' ? matchRoute(window.location.pathname) : 'home';

  const [isDark, setIsDark] = useState(() => {
    return localStorage.theme === 'dark' || (!localStorage.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
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
  const [cookieModalOpen, setCookieModalOpen] = useState(initialRoute === 'cookies');
  const [cookieStatus, setCookieStatus] = useState(null);
  const [serverModalOpen, setServerModalOpen] = useState(initialRoute === 'servers');
  const [customServerUrl, setCustomServerUrlState] = useState(() => getCustomServerUrl());
  const [updateModalOpen, setUpdateModalOpen] = useState(initialRoute === 'updates');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(initialRoute === 'settings');
  const [downloadsOpen, setDownloadsOpen] = useState(initialRoute === 'downloads');
  const [inputUrl, setInputUrl] = useState('');
  const showDownloadButton = isOnlineFrontend();

  const openRoute = (route) => {
    setDownloadsOpen(route === 'downloads');
    setCookieModalOpen(route === 'cookies');
    setSettingsModalOpen(route === 'settings');
    setServerModalOpen(route === 'servers');
    setUpdateModalOpen(route === 'updates');

    let targetPath = ROUTE_HOME;
    if (route === 'downloads') targetPath = ROUTE_DOWNLOADS;
    else if (route === 'cookies') targetPath = ROUTE_COOKIES;
    else if (route === 'settings') targetPath = ROUTE_SETTINGS;
    else if (route === 'servers') targetPath = ROUTE_SERVERS;
    else if (route === 'updates') targetPath = ROUTE_UPDATES;

    syncRouteToUrl(targetPath, inputUrl);
  };

  const fetchCookieStatus = async () => {
    try {
      const res = await apiFetch('/api/auth-tokens');
      if (res.ok) {
        const data = await res.json();
        setCookieStatus(data);
      }
    } catch (e) {
      console.error('Failed to load cookie status:', e);
    }
  };

  const fetchUpdateInfo = async (force = false) => {
    try {
      const channel = localStorage.getItem('umx_update_channel') || 'stable';
      const res = await apiFetch(`/api/updates?channel=${channel}${force ? '&force=true' : ''}`);
      if (res.ok) {
        const data = await res.json();
        setUpdateInfo(data);
      }
    } catch (e) {
      console.error('Failed to load update info:', e);
    }
  };

  // Browser back / forward button navigation synchronization
  useEffect(() => {
    const handlePopState = () => {
      const route = matchRoute(window.location.pathname);
      setDownloadsOpen(route === 'downloads');
      setCookieModalOpen(route === 'cookies');
      setSettingsModalOpen(route === 'settings');
      setServerModalOpen(route === 'servers');
      setUpdateModalOpen(route === 'updates');

      const autoUrl = getAutoAnalyzeUrl();
      if (autoUrl && autoUrl !== inputUrl) {
        setInputUrl(autoUrl);
        handleAnalyze(autoUrl);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [inputUrl]);

  // Deep-linking: Automatically analyze URL from query params (?url=...) on website load
  useEffect(() => {
    const autoUrl = getAutoAnalyzeUrl();
    if (autoUrl) {
      setInputUrl(autoUrl);
      handleAnalyze(autoUrl);
    }
  }, []);

  useEffect(() => {
    fetchCookieStatus();
    fetchUpdateInfo();

    const handleServerChange = () => {
      setCustomServerUrlState(getCustomServerUrl());
      fetchCookieStatus();
      fetchUpdateInfo(true);
    };
    const handleChannelChange = () => {
      fetchUpdateInfo(true);
    };

    window.addEventListener('umx-server-changed', handleServerChange);
    window.addEventListener('umx-channel-changed', handleChannelChange);

    // Periodic enterprise update check based on configured cadence
    const cadence = localStorage.getItem('umx_update_cadence') || 'startup_and_interval';
    let pollInterval = 4 * 60 * 60 * 1000; // 4 hours default
    if (cadence === 'daily') pollInterval = 24 * 60 * 60 * 1000;

    let updateTimer = null;
    if (cadence !== 'manual') {
      updateTimer = setInterval(() => fetchUpdateInfo(), pollInterval);
    }

    return () => {
      window.removeEventListener('umx-server-changed', handleServerChange);
      window.removeEventListener('umx-channel-changed', handleChannelChange);
      if (updateTimer) clearInterval(updateTimer);
    };
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
    
    if (localStorage.getItem('umx_pref_remember_history') !== 'false') {
      setHistory(prev => {
        const filtered = prev.filter(r => r.url !== url);
        const next = [{ title: data.title, thumb: data.thumbnail, url }, ...filtered];
        return next.slice(0, 8); // Keep compact history
      });
    }
    
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
    
    const prefContainer = localStorage.getItem('umx_pref_container') || 'default';
    const prefEmbedSubs = localStorage.getItem('umx_pref_embed_subs') === 'true';
    const prefSplitChapters = localStorage.getItem('umx_pref_split_chapters') === 'true';
    const prefAudioLang = localStorage.getItem('umx_pref_audio_lang') || 'default';

    setSelectedContainer(prefContainer);
    setSplitChapters(prefSplitChapters);
    setClipStart('00:00:00');
    setClipEnd('');
    setAudioLang(prefAudioLang);
    setEmbedSubs(prefEmbedSubs);
    setSubLang((data.subtitles && data.subtitles[0]?.lang) || 'en');
  };

  const handleAnalyze = async (rawUrl) => {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!url) return showToast("Please paste a URL first.", "error");

    setInputUrl(url);
    syncRouteToUrl(downloadsOpen ? ROUTE_DOWNLOADS : ROUTE_HOME, url, true);
    
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
      const res = await apiFetch('/api/analyze', {
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
    const url = apiUrl(`/api/thumbnail?imgUrl=${encodeURIComponent(metadata.thumbnail)}&title=${encodeURIComponent(metadata.title)}`);
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
        await apiFetch(`/api/cancel/${jobId}`, { method: 'POST' });
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
      const res = await apiFetch('/api/download', {
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
          const s = await (await apiFetch(`/api/status/${jobId}`)).json();
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
            const downloadUrl = apiUrl(`/api/file/${jobId}/${encodeURIComponent(metadata.title)}`);
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
        navigator.sendBeacon(apiUrl(`/api/cancel/${jobId}`));
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
      
      {/* Ambient Background (Light & Dark Mode) */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-slate-50 dark:bg-[#090b10] transition-colors duration-500">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-400/10 dark:bg-indigo-600/10 rounded-full blur-[120px] -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-400/10 dark:bg-cyan-600/10 rounded-full blur-[120px] -ml-20 -mb-20"></div>
      </div>

      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div 
              key={t.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
                className={`px-4 py-3 rounded-xl font-medium text-xs md:text-sm shadow-sm flex items-center gap-2 bg-white border border-slate-200 text-slate-800 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 ${
                t.type === 'error' ? 'border-l-4 border-l-red-500' : t.type === 'success' ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-indigo-500'
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
        onOpenCookies={() => openRoute('cookies')}
        onOpenServer={() => openRoute('servers')}
        customServerUrl={customServerUrl}
        showServerSelector={shouldShowServerSelector()}
        updateInfo={updateInfo}
        onOpenUpdate={() => openRoute('updates')}
        onOpenDownloads={() => openRoute('downloads')}
        showDownloadButton={showDownloadButton || downloadsOpen}
        onOpenSettings={() => openRoute('settings')}
      />

      {downloadsOpen ? (
        <main className="flex-1 w-full">
          <DownloadPage updateInfo={updateInfo} onBack={() => openRoute('home')} />
        </main>
      ) : (
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 md:px-8 flex flex-col items-center justify-center -mt-4 sm:-mt-10 py-8 sm:py-20">
        
        <motion.div 
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full space-y-3"
        >
          <SearchBox onAnalyze={handleAnalyze} isLoading={isAnalyzing} initialUrl={inputUrl} />
        </motion.div>

        <AnimatePresence mode="wait">
          {isAnalyzing ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mt-10 sm:mt-16 flex flex-col items-center justify-center gap-3 sm:gap-4 text-zinc-400 dark:text-zinc-500"
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-full border-2 border-zinc-800 border-t-indigo-500 animate-spin" />
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
      )}

      {/* Spacer replacing homepage footer credits */}
      <div className="w-full py-4" />

      <AuthModal 
        isOpen={cookieModalOpen}
        onClose={() => openRoute('home')}
        cookieStatus={cookieStatus}
        onCookieUpdated={fetchCookieStatus}
        onToast={showToast}
      />

      <ServerModal 
        isOpen={serverModalOpen}
        onClose={() => openRoute('home')}
        onToast={showToast}
      />

      <UpdateModal 
        isOpen={updateModalOpen}
        onClose={() => openRoute('home')}
        updateInfo={updateInfo}
        onRefreshUpdate={() => fetchUpdateInfo(true)}
        activeJobsCount={downloadJob ? 1 : (updateInfo?.activeJobsCount || 0)}
      />

      <SettingsModal 
        isOpen={settingsModalOpen}
        onClose={() => openRoute('home')}
        isDark={isDark}
        toggleTheme={() => setIsDark(!isDark)}
        history={history}
        onClearHistory={() => setHistory([])}
        onOpenCookies={() => openRoute('cookies')}
        onOpenServer={() => openRoute('servers')}
        onOpenUpdate={() => openRoute('updates')}
        updateInfo={updateInfo}
        onToast={showToast}
      />
    </div>
  );
}

export default App;
