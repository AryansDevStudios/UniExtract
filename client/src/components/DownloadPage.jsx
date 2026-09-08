import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api';
import { AlertCircle, ArrowLeft, Boxes, Check, ChevronRight, Cpu, Download, ExternalLink, GitBranch, HelpCircle, Laptop, Package, Server, ShieldCheck, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.8.2';

function formatBytes(bytes) {
  if (!bytes) return 'Size unavailable';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / Math.pow(1024, index)).toFixed(1))} ${units[index]}`;
}

function getPlatform(name = '') {
  const value = name.toLowerCase();
  if (value.includes('win') || value.endsWith('.exe') || value.endsWith('.bat')) return 'Windows';
  if (value.includes('mac') || value.endsWith('.dmg')) return 'macOS';
  if (value.includes('linux') || value.endsWith('.appimage') || value.endsWith('.deb')) return 'Linux';
  return 'Other';
}

function getArchitecture(asset = {}) {
  const value = `${asset.arch || ''} ${asset.name || ''}`.toLowerCase();
  if (value.includes('arm64') || value.includes('aarch64')) return 'ARM64';
  if (value.includes('x64') || value.includes('amd64') || value.includes('x86_64')) return 'x64';
  return 'Universal';
}

function getPackageKind(asset = {}) {
  const value = `${asset.type || ''} ${asset.name || ''}`.toLowerCase();
  if (value.includes('blockmap') || value.endsWith('.yml') || value.endsWith('.yaml')) return 'Release metadata';
  if (value.includes('portable') || value.includes('appimage')) return 'Portable';
  if (value.includes('archive') || value.endsWith('.zip') || value.endsWith('.tar.gz')) return 'Archive';
  if (value.endsWith('.deb') || value.endsWith('.dmg') || value.endsWith('.exe')) return 'Installer';
  return 'Package';
}

function createStaticReleaseAssets(version = APP_VERSION) {
  const cleanVersion = String(version || '2.8.2').replace(/^v/i, '');
  const tag = `v${cleanVersion}`;
  const base = `https://github.com/AryansDevStudios/UniExtract/releases/download/${tag}`;
  return [
    { name: `UniExtract-${cleanVersion}-x64-Setup.exe`, size: 135214320, url: `${base}/UniExtract-${cleanVersion}-x64-Setup.exe`, type: 'windows-installer', arch: 'x64' },
    { name: `UniExtract-Portable-${cleanVersion}-x64.exe`, size: 134919096, url: `${base}/UniExtract-Portable-${cleanVersion}-x64.exe`, type: 'windows-portable', arch: 'x64' },
    { name: `UniExtract-${cleanVersion}-arm64-Setup.exe`, size: 129645880, url: `${base}/UniExtract-${cleanVersion}-arm64-Setup.exe`, type: 'windows-installer', arch: 'arm64' },
    { name: `UniExtract-Portable-${cleanVersion}-arm64.exe`, size: 129351104, url: `${base}/UniExtract-Portable-${cleanVersion}-arm64.exe`, type: 'windows-portable', arch: 'arm64' },
    { name: `UniExtract-${cleanVersion}-Setup.exe`, size: 264097800, url: `${base}/UniExtract-${cleanVersion}-Setup.exe`, type: 'windows-installer', arch: 'universal' },
    { name: `UniExtract-Portable-${cleanVersion}.exe`, size: 263802752, url: `${base}/UniExtract-Portable-${cleanVersion}.exe`, type: 'windows-portable', arch: 'universal' },
    { name: `UniExtract-${cleanVersion}-x86_64.AppImage`, size: 190446590, url: `${base}/UniExtract-${cleanVersion}-x86_64.AppImage`, type: 'linux-appimage', arch: 'x64' },
    { name: `UniExtract-${cleanVersion}-amd64.deb`, size: 156414404, url: `${base}/UniExtract-${cleanVersion}-amd64.deb`, type: 'linux-deb', arch: 'x64' },
    { name: `UniExtract-${cleanVersion}-arm64.AppImage`, size: 190672809, url: `${base}/UniExtract-${cleanVersion}-arm64.AppImage`, type: 'linux-appimage', arch: 'arm64' },
    { name: `UniExtract-${cleanVersion}-x64.dmg`, size: 174608436, url: `${base}/UniExtract-${cleanVersion}-x64.dmg`, type: 'macos-dmg', arch: 'x64' },
    { name: `UniExtract-${cleanVersion}-x64.zip`, size: 174271886, url: `${base}/UniExtract-${cleanVersion}-x64.zip`, type: 'archive-zip', arch: 'x64' },
    { name: `UniExtract-${cleanVersion}-arm64.dmg`, size: 169581002, url: `${base}/UniExtract-${cleanVersion}-arm64.dmg`, type: 'macos-dmg', arch: 'arm64' },
    { name: `UniExtract-${cleanVersion}-arm64.zip`, size: 169196522, url: `${base}/UniExtract-${cleanVersion}-arm64.zip`, type: 'archive-zip', arch: 'arm64' },
    { name: `AryansDevStudios.cer`, size: 894, url: `${base}/AryansDevStudios.cer`, type: 'other', arch: 'universal' },
    { name: `trust-publisher.bat`, size: 1286, url: `${base}/trust-publisher.bat`, type: 'other', arch: 'universal' },
    { name: `latest.yml`, size: 673, url: `${base}/latest.yml`, type: 'other', arch: 'universal' },
    { name: `latest-mac.yml`, size: 814, url: `${base}/latest-mac.yml`, type: 'other', arch: 'universal' },
    { name: `latest-linux.yml`, size: 543, url: `${base}/latest-linux.yml`, type: 'other', arch: 'universal' },
    { name: `latest-linux-arm64.yml`, size: 384, url: `${base}/latest-linux-arm64.yml`, type: 'other', arch: 'universal' }
  ];
}

function getCachedRelease(channel) {
  try {
    const raw = localStorage.getItem(`umx_download_cache_${channel}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function setCachedRelease(channel, data) {
  try {
    localStorage.setItem(`umx_download_cache_${channel}`, JSON.stringify(data));
  } catch (e) {}
}

function normalizeAssets(rawAssets = []) {
  return rawAssets.map(a => {
    let type = a.type || 'other';
    let arch = a.arch || 'universal';
    const nameLower = (a.name || '').toLowerCase();
    if (!a.arch) {
      if (nameLower.includes('arm64') || nameLower.includes('aarch64')) arch = 'arm64';
      else if (nameLower.includes('x64') || nameLower.includes('amd64') || nameLower.includes('x86_64')) arch = 'x64';
    }

    if (!a.type || a.type === 'other') {
      if (nameLower.endsWith('.exe')) {
        type = nameLower.includes('portable') ? 'windows-portable' : 'windows-installer';
      } else if (nameLower.endsWith('.dmg')) {
        type = 'macos-dmg';
      } else if (nameLower.endsWith('.appimage')) {
        type = 'linux-appimage';
      } else if (nameLower.endsWith('.deb')) {
        type = 'linux-deb';
      } else if (nameLower.endsWith('.zip')) {
        type = 'archive-zip';
      }
    }

    return {
      name: a.name,
      size: a.size,
      url: a.browser_download_url || a.url,
      type,
      arch
    };
  });
}

const CHANNELS = [
  { id: 'stable', label: 'Latest release', description: 'Recommended for everyday use', icon: ShieldCheck },
  { id: 'beta', label: 'Pre-release', description: 'Preview upcoming changes', icon: Sparkles }
];
const PLATFORMS = ['All', 'Windows', 'macOS', 'Linux', 'Other'];
const ARCHITECTURES = ['All', 'x64', 'ARM64', 'Universal'];
const PACKAGE_KINDS = ['All', 'Installer', 'Portable', 'Archive', 'Release metadata'];

export default function DownloadPage({ updateInfo, onBack }) {
  const initialRelease = useMemo(() => {
    if (updateInfo?.assets?.length > 0) return updateInfo;
    const cached = getCachedRelease('stable');
    if (cached?.assets?.length > 0) return cached;
    return {
      channel: 'stable',
      latestVersion: APP_VERSION,
      latestTag: `v${APP_VERSION}`,
      releaseUrl: `https://github.com/AryansDevStudios/UniExtract/releases/tag/v${APP_VERSION}`,
      assets: normalizeAssets(createStaticReleaseAssets(APP_VERSION)),
      isFallback: true
    };
  }, [updateInfo]);

  const [channel, setChannel] = useState(updateInfo?.channel || 'stable');
  const [release, setRelease] = useState(initialRelease);
  const [platform, setPlatform] = useState('All');
  const [architecture, setArchitecture] = useState('All');
  const [packageKind, setPackageKind] = useState('All');
  const [isLoadingRelease, setIsLoadingRelease] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const fetchReleaseData = async (targetChannel, force = false) => {
    setIsLoadingRelease(true);
    setFetchError(null);

    let resolvedData = null;

    // 1. Try local or proxied backend /api/updates first
    try {
      const response = await apiFetch(`/api/updates?channel=${targetChannel}${force ? '&force=true' : ''}`);
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.assets) && data.assets.length > 0) {
          resolvedData = {
            ...data,
            assets: normalizeAssets(data.assets)
          };
          setCachedRelease(targetChannel, resolvedData);
        }
      }
    } catch (e) {
      console.warn('[DownloadPage] Backend /api/updates unreachable, falling back to GitHub API direct:', e.message);
    }

    // 2. Direct client-side GitHub API fallback (CORS enabled) if backend returned no assets or is offline
    if (!resolvedData) {
      try {
        const ghUrl = targetChannel === 'beta'
          ? 'https://api.github.com/repos/AryansDevStudios/UniExtract/releases?per_page=10'
          : 'https://api.github.com/repos/AryansDevStudios/UniExtract/releases/latest';

        const ghRes = await fetch(ghUrl, {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
        });

        if (ghRes.ok) {
          const raw = await ghRes.json();
          const rel = Array.isArray(raw) ? (raw[0] || {}) : raw;
          const latestTag = rel.tag_name || rel.name || '';
          const latestClean = latestTag.replace(/^v/i, '');

          resolvedData = {
            channel: targetChannel,
            latestVersion: latestClean,
            latestTag,
            releaseUrl: rel.html_url || 'https://github.com/AryansDevStudios/UniExtract/releases',
            assets: normalizeAssets(rel.assets || [])
          };
          setCachedRelease(targetChannel, resolvedData);
        } else {
          const is403 = ghRes.status === 403;
          const msg = is403
            ? `GitHub API rate limit exceeded for your IP (status 403). Direct download mirrors for v${APP_VERSION} are active below.`
            : `GitHub API returned status ${ghRes.status}. Showing direct download mirrors for v${APP_VERSION}.`;
          setFetchError(msg);
        }
      } catch (err) {
        console.error('[DownloadPage] Direct GitHub API fetch error:', err);
        setFetchError(`Network error reaching GitHub API. Showing direct download mirrors for v${APP_VERSION}.`);
      }
    }

    // 3. Fallback: If both backend and direct GitHub API failed to return assets, use deterministic static manifest
    if (!resolvedData) {
      const cached = getCachedRelease(targetChannel);
      if (cached?.assets?.length > 0) {
        resolvedData = cached;
      } else {
        resolvedData = {
          channel: targetChannel,
          latestVersion: APP_VERSION,
          latestTag: `v${APP_VERSION}`,
          releaseUrl: `https://github.com/AryansDevStudios/UniExtract/releases/tag/v${APP_VERSION}`,
          assets: normalizeAssets(createStaticReleaseAssets(APP_VERSION)),
          isFallback: true
        };
      }
    }

    if (resolvedData) {
      setRelease(resolvedData);
    }
    setIsLoadingRelease(false);
  };

  // Automatically fetch on mount if no assets are loaded yet, or when channel updates
  useEffect(() => {
    if (!release || !Array.isArray(release.assets) || release.assets.length === 0 || release.isFallback) {
      fetchReleaseData(channel, false);
    }
  }, [channel]);

  const selectChannel = (nextChannel) => {
    if (nextChannel === channel && release?.assets?.length > 0 && !release.isFallback) return;
    setChannel(nextChannel);
    fetchReleaseData(nextChannel, false);
  };

  const resetFilters = () => {
    setPlatform('All');
    setArchitecture('All');
    setPackageKind('All');
  };

  const assets = release?.assets || [];
  const latestVersion = release?.latestVersion || release?.currentVersion || APP_VERSION;
  const releaseUrl = release?.releaseUrl || `https://github.com/AryansDevStudios/UniExtract/releases/tag/v${latestVersion}`;
  const filteredAssets = useMemo(() => assets.filter(asset => (
    (platform === 'All' || getPlatform(asset.name) === platform) &&
    (architecture === 'All' || getArchitecture(asset) === architecture) &&
    (packageKind === 'All' || getPackageKind(asset) === packageKind)
  )), [assets, platform, architecture, packageKind]);
  const groupedAssets = useMemo(() => filteredAssets.reduce((groups, asset, index) => {
    const key = getPlatform(asset.name);
    if (!groups[key]) groups[key] = [];
    groups[key].push({ asset, index });
    return groups;
  }, {}), [filteredAssets]);

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-6xl mx-auto px-0 sm:px-6 md:px-8 py-5 sm:py-8 md:py-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-0 pb-6">
        <div>
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-cyan-400 transition-colors mb-4"><ArrowLeft size={15} /> Back to extractor</button>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700 dark:text-cyan-400">UniExtract release center</p>
          <h2 className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white">Download UniExtract</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">Choose a release channel, platform, and processor architecture before downloading the right package.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"><GitBranch size={16} /> v{latestVersion}</div>
      </div>

      <div className="mt-5 px-4 sm:px-0">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"><GitBranch size={14} /> 1. Choose release channel</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CHANNELS.map(item => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => selectChannel(item.id)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${channel === item.id ? 'border-teal-600 bg-teal-50 text-teal-800 dark:border-cyan-400 dark:bg-cyan-500/10 dark:text-cyan-200' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-cyan-400'}`}><Icon size={18} className="shrink-0" /><span className="min-w-0"><strong className="block text-sm">{item.label}</strong><span className="block text-xs opacity-70">{item.description}</span></span>{channel === item.id && <Check size={16} className="ml-auto shrink-0" />}</button>; })}
        </div>
      </div>

      {fetchError && (
        <div className="mt-4 mx-4 sm:mx-0 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="truncate">{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchReleaseData(channel, true)}
            className="shrink-0 font-bold text-amber-700 underline hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mt-5 border-y border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/40 sm:rounded-xl sm:border sm:px-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"><Laptop size={14} /> 2. Choose platform</div>
        <div className="flex flex-wrap gap-2">{PLATFORMS.map(item => <button key={item} type="button" onClick={() => setPlatform(item)} className={`rounded-lg border px-3.5 py-2 text-xs font-bold transition-colors ${platform === item ? 'border-teal-600 bg-teal-700 text-white dark:border-cyan-400 dark:bg-cyan-500' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-cyan-400'}`}>{item}</button>)}</div>
        <div className="mt-4 mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"><Cpu size={14} /> 3. Choose processor architecture</div>
        <div className="flex flex-wrap gap-2">{ARCHITECTURES.map(item => <button key={item} type="button" onClick={() => setArchitecture(item)} className={`rounded-lg border px-3.5 py-2 text-xs font-bold transition-colors ${architecture === item ? 'border-teal-600 bg-teal-700 text-white dark:border-cyan-400 dark:bg-cyan-500' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-cyan-400'}`}>{item}</button>)}</div>
      </div>

      <div className="mt-5 px-4 sm:px-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Boxes size={14} /> 4. Choose package type
          </div>
          <div className="flex items-center gap-3">
            {(platform !== 'All' || architecture !== 'All' || packageKind !== 'All') && (
              <button type="button" onClick={resetFilters} className="text-xs font-bold text-teal-700 hover:underline dark:text-cyan-400">
                Reset filters
              </button>
            )}
            <span className="text-xs text-slate-500 dark:text-slate-400">{filteredAssets.length} available files</span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {PACKAGE_KINDS.map(item => (
            <button key={item} type="button" onClick={() => setPackageKind(item)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${packageKind === item ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300'}`}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {isLoadingRelease ? (
        <div className="mt-6 flex items-center justify-center gap-2 border-y border-slate-200 px-4 py-12 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <Sparkles size={17} className="animate-pulse" /> Loading {channel} packages...
        </div>
      ) : Object.entries(groupedAssets).length > 0 ? (
        <div className="mt-6 space-y-6">
          {Object.entries(groupedAssets).map(([group, groupAssets]) => (
            <section key={group}>
              <div className="flex items-center gap-2 px-4 sm:px-0">
                <Laptop size={16} className="text-teal-700 dark:text-cyan-400" />
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">{group}</h3>
                <span className="text-xs text-slate-500">{groupAssets.length} files</span>
              </div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                {groupAssets.map(({ asset, index }) => (
                  <a key={`${asset.name}-${index}`} href={asset.url} target="_blank" rel="noreferrer" className="group flex items-center justify-between gap-4 rounded-none sm:rounded-xl border-x-0 sm:border-x border-y border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-cyan-400">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-teal-700 dark:bg-slate-800 dark:text-cyan-400">
                        <Package size={19} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-200">{asset.name}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{getArchitecture(asset)} · {getPackageKind(asset)} · {formatBytes(asset.size)}</p>
                      </div>
                    </div>
                    <Download size={18} className="shrink-0 text-slate-400 transition-colors group-hover:text-teal-700 dark:group-hover:text-cyan-400" />
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-none sm:rounded-2xl border-x-0 sm:border-x border-y border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900/60">
          <Package className="mx-auto text-slate-400" size={28} />
          <h3 className="mt-3 text-base font-bold text-slate-800 dark:text-slate-200">
            {assets.length > 0 ? 'No matching packages for selected filters' : 'No packages available right now'}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {assets.length > 0
              ? 'Try changing or clearing your platform, architecture, or package type filters.'
              : (fetchError || 'Unable to load packages from GitHub API. You can retry or download directly from GitHub Releases.')}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {assets.length > 0 ? (
              <button type="button" onClick={resetFilters} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400">
                Reset All Filters
              </button>
            ) : (
              <button type="button" onClick={() => fetchReleaseData(channel)} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400">
                <Sparkles size={14} /> Retry Fetching
              </button>
            )}
            <a href={releaseUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
              View GitHub Releases <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 sm:px-0"><div className="rounded-none sm:rounded-xl border-x-0 sm:border-x border-y border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60"><Download size={18} className="text-teal-700 dark:text-cyan-400" /><p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">Direct packages</p><p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Installers and portable builds for end users.</p></div><div className="rounded-none sm:rounded-xl border-x-0 sm:border-x border-y border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60"><Server size={18} className="text-teal-700 dark:text-cyan-400" /><p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">Self-hosting</p><p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Run the full repository or backend-only deployment.</p></div><div className="rounded-none sm:rounded-xl border-x-0 sm:border-x border-y border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60"><ShieldCheck size={18} className="text-teal-700 dark:text-cyan-400" /><p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">Verified releases</p><p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Use signed packages and release metadata.</p></div></div>

      <div className="mt-8 border-y border-slate-200 px-4 py-5 dark:border-slate-800 sm:rounded-xl sm:border sm:px-5"><div className="flex items-start gap-3"><HelpCircle size={19} className="mt-0.5 shrink-0 text-teal-700 dark:text-cyan-400" /><div><h3 className="text-sm font-black text-slate-800 dark:text-slate-200">Repository or backend-only deployment</h3><p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Use the full repository for PWA, Electron, or all-in-one local installs. For Render, Railway, VPS, or Docker, use only the backend package with server.js, package.json, scripts, yt-dlp.conf, and public assets as documented.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><a href="https://github.com/AryansDevStudios/UniExtract" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-cyan-400">Full repository <ChevronRight size={14} /></a><a href="https://github.com/AryansDevStudios/UniExtract/blob/main/docs/DEPLOYMENT_MODES.md" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-cyan-400">Backend-only instructions <ChevronRight size={14} /></a><a href={releaseUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-cyan-400">All release artifacts <ChevronRight size={14} /></a><a href="https://raw.githubusercontent.com/AryansDevStudios/UniExtract/main/server.js" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-cyan-400">Fetch server.js <ChevronRight size={14} /></a></div></div></div></div>
    </motion.section>
  );
}
