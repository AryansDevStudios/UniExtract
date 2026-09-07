import React, { useMemo, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, Package, Server, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return 'Size unavailable';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / Math.pow(1024, index)).toFixed(1))} ${units[index]}`;
}

function getPlatform(name = '') {
  const value = name.toLowerCase();
  if (value.includes('win') || value.endsWith('.exe') || value.endsWith('.bat')) return 'Windows';
  if (value.includes('mac') || value.endsWith('.dmg')) return 'macOS';
  if (value.includes('linux') || value.endsWith('.appimage') || value.endsWith('.deb') || value.endsWith('.yml')) return 'Linux';
  if (value.includes('docker') || value.includes('blockmap')) return 'Other';
  return 'Other';
}

export default function DownloadPage({ updateInfo, onBack }) {
  const [platform, setPlatform] = useState('All');
  const assets = updateInfo?.assets || [];
  const latestVersion = updateInfo?.latestVersion || updateInfo?.currentVersion || 'latest';
  const releaseUrl = updateInfo?.releaseUrl || 'https://github.com/AryansDevStudios/UniExtract/releases';
  const filteredAssets = useMemo(() => (
    platform === 'All' ? assets : assets.filter(asset => getPlatform(asset.name) === platform)
  ), [assets, platform]);

  const platforms = ['All', 'Windows', 'macOS', 'Linux', 'Other'];

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-6xl mx-auto px-0 sm:px-6 md:px-8 py-6 sm:py-8 md:py-12"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-cyan-400 transition-colors mb-4"
          >
            <ArrowLeft size={15} /> Back to extractor
          </button>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700 dark:text-cyan-400">UniExtract Cloud Downloads</p>
          <h2 className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white">Download UniExtract</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Get the latest desktop packages for offline media extraction, hardware acceleration, and local processing.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          <ShieldCheck size={16} /> Release v{latestVersion}
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-2">
        {platforms.map(item => (
          <button
            key={item}
            type="button"
            onClick={() => setPlatform(item)}
            className={`rounded-lg border px-3.5 py-2 text-xs font-bold transition-colors ${platform === item
              ? 'border-teal-600 bg-teal-700 text-white dark:border-cyan-400 dark:bg-cyan-500'
              : 'border-slate-200 bg-white text-slate-600 hover:border-teal-400 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-cyan-400 dark:hover:text-cyan-300'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {filteredAssets.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredAssets.map((asset, index) => (
            <a
              key={`${asset.name}-${index}`}
              href={asset.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center justify-between gap-4 rounded-none sm:rounded-xl border-x-0 sm:border-x border-y border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-cyan-400"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-teal-700 dark:bg-slate-800 dark:text-cyan-400">
                  <Package size={19} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-200">{asset.name}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{getPlatform(asset.name)} · {formatBytes(asset.size)}</p>
                </div>
              </div>
              <Download size={18} className="shrink-0 text-slate-400 transition-colors group-hover:text-teal-700 dark:group-hover:text-cyan-400" />
            </a>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-none sm:rounded-2xl border-x-0 sm:border-x border-y border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900/60">
          <Package className="mx-auto text-slate-400" size={28} />
          <h3 className="mt-3 text-base font-bold text-slate-800 dark:text-slate-200">Release packages are loading</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Open the official release page to browse the latest files.</p>
          <a href={releaseUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400">
            View GitHub Releases <ExternalLink size={14} />
          </a>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-none sm:rounded-xl border-x-0 sm:border-x border-y border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <Download size={18} className="text-teal-700 dark:text-cyan-400" />
          <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">Direct packages</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Download installers and portable archives directly from the release source.</p>
        </div>
        <div className="rounded-none sm:rounded-xl border-x-0 sm:border-x border-y border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <Server size={18} className="text-teal-700 dark:text-cyan-400" />
          <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">Local processing</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Desktop builds keep extraction and transcoding on your own machine.</p>
        </div>
        <div className="rounded-none sm:rounded-xl border-x-0 sm:border-x border-y border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <ShieldCheck size={18} className="text-teal-700 dark:text-cyan-400" />
          <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">Verified releases</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Use the signed packages and checksums supplied with each release.</p>
        </div>
      </div>
    </motion.section>
  );
}
