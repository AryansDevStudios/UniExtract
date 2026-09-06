import React, { useState } from 'react';
import { Globe2, Languages, Download, FileText, Sparkles, Check, Loader2 } from 'lucide-react';

export default function LanguagePanel({
  metadata,
  audioLang,
  setAudioLang,
  embedSubs,
  setEmbedSubs,
  subLang,
  setSubLang,
  isVideoSelected = true
}) {
  const [isSubDownloading, setIsSubDownloading] = useState(false);
  const audioTracks = metadata?.audioTracks || [];
  const subtitles = metadata?.subtitles || [];

  const audioOptions = audioTracks.length > 1
    ? audioTracks.map(track => ({ id: track.id, display: `${track.language || 'Audio'}${track.label ? ` • ${track.label}` : ''}` }))
    : [];

  const subtitleOptions = subtitles.map(sub => {
    let tag = '';
    if (sub.isOrig || sub.lang.includes('orig')) tag = ' [Original]';
    else if (sub.isAuto) tag = ' [Auto]';
    return {
      id: sub.lang,
      display: `${sub.lang.toUpperCase()} • ${sub.name || 'Subtitle'}${tag}`
    };
  });

  const selectedSub = subtitles.find(s => s.lang === subLang) || subtitles[0];

  const [subFormat, setSubFormat] = useState('srt');

  const formatOptions = [
    { id: 'srt', label: 'SRT', desc: 'Universal' },
    { id: 'vtt', label: 'VTT', desc: 'Web & iOS' },
    { id: 'txt', label: 'TXT', desc: 'Transcript' },
    { id: 'ass', label: 'ASS', desc: 'Styled' },
    { id: 'lrc', label: 'LRC', desc: 'Lyrics' }
  ];

  const handleDownloadStandaloneSub = async () => {
    if (!metadata?.url) return;
    const targetLang = subLang || (subtitles[0]?.lang || 'en-orig');
    setIsSubDownloading(true);

    try {
      const downloadUrl = `/api/subtitle?url=${encodeURIComponent(metadata.url)}&lang=${encodeURIComponent(targetLang)}&format=${encodeURIComponent(subFormat)}&title=${encodeURIComponent(metadata.title || 'subtitle')}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', '');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Subtitle download error:', e);
    } finally {
      setTimeout(() => setIsSubDownloading(false), 2000);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/40 p-4 backdrop-blur-md shadow-sm">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300 mb-3">
        <Globe2 size={15} className="text-indigo-500" /> Language & Captions
      </div>

      {audioOptions.length > 1 && (
        <div className="mb-4">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Audio Language
            <select
              value={audioLang}
              onChange={(e) => setAudioLang(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500 shadow-2xs font-medium"
            >
              <option value="default">Default / Original</option>
              {audioOptions.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.display}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {subtitleOptions.length > 0 && (
        <div className="space-y-3.5">
          {/* Subtitle Language Selector */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Subtitle Language
              <select
                value={subLang}
                onChange={(e) => setSubLang(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500 shadow-2xs font-medium"
              >
                {subtitleOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.display}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Subtitle Format Selector */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Subtitle Format
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {formatOptions.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSubFormat(f.id)}
                  className={`py-1.5 px-1 rounded-xl text-center transition-all border ${
                    subFormat === f.id
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                      : 'border-slate-200 dark:border-slate-700/80 bg-white/70 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="text-xs font-mono font-bold leading-tight">.{f.label}</div>
                  <div className="text-[9px] opacity-70 leading-tight hidden sm:block">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Subtitle Action Row */}
          <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200/50 dark:border-slate-700/50 pt-3">
            {/* Embed Checkbox */}
            <label 
              className={`inline-flex items-center gap-2.5 text-sm font-medium select-none ${
                isVideoSelected 
                  ? 'text-slate-700 dark:text-slate-200 cursor-pointer' 
                  : 'text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60'
              }`}
              title={isVideoSelected ? "Embed subtitles into output video container" : "Subtitles can only be embedded into video formats. Use direct download to the right."}
            >
              <input
                type="checkbox"
                disabled={!isVideoSelected}
                checked={isVideoSelected && embedSubs}
                onChange={(e) => setEmbedSubs(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                <Languages size={14} className={isVideoSelected ? "text-indigo-500" : "text-slate-400"} /> 
                <span>Embed Subtitles into Video</span>
                {!isVideoSelected && (
                  <span className="text-[10px] font-normal text-slate-400 italic">(Video only)</span>
                )}
              </span>
            </label>

            {/* Direct Subtitle Download Button in Selected Format */}
            <button
              type="button"
              onClick={handleDownloadStandaloneSub}
              disabled={isSubDownloading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-indigo-300 dark:border-indigo-700/70 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold transition-all hover:-translate-y-0.5 active:scale-95 shadow-md shadow-indigo-500/20 disabled:opacity-50 disabled:hover:translate-y-0"
              title={`Download standalone .${subFormat} subtitle file`}
            >
              {isSubDownloading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              <span>Download Subtitle (.{subFormat.toUpperCase()})</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
