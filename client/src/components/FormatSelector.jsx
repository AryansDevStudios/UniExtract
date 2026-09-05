import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

function formatBytes(bytes) {
  if (!bytes) return 'Unknown Size';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function StreamOption({ type, id, main, sub, badge, isSelected, rawSize, onSelect }) {
  const sizeStr = rawSize > 0 ? formatBytes(rawSize) : (id === '' ? '' : 'Unknown Size');
  
  return (
    <label className={`flex items-center justify-between p-3 md:p-4 rounded-xl md:rounded-2xl border-2 cursor-pointer transition ${isSelected ? 'border-brand bg-brand/5 dark:bg-brand/10' : 'border-transparent bg-white dark:bg-slate-900 hover:border-brand/40'}`}>
      <div className="flex items-center gap-3">
        <input 
          type="radio" 
          name={type} 
          value={id} 
          checked={isSelected} 
          onChange={() => onSelect({ id, size: rawSize || 0, label: main })}
          className="w-4 h-4 md:w-5 md:h-5 accent-brand" 
        />
        <div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="font-black text-xs md:text-sm uppercase text-slate-800 dark:text-slate-100">{main}</span>
            <span className={`text-[8px] md:text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${badge}`}>{sub}</span>
          </div>
        </div>
      </div>
      <div className="text-[9px] md:text-[10px] font-black text-brand italic">{sizeStr}</div>
    </label>
  );
}

export default function FormatSelector({ formats, advancedMode, onToggleAdvanced, selectedVideo, selectedAudio, setSelectedVideo, setSelectedAudio }) {
  
  const vFormats = useMemo(() => {
    let list = formats.filter(f => f.vcodec).sort((a, b) => (b.height - a.height) || (b.size - a.size));
    if (!advancedMode) {
      const seen = new Set();
      list = list.filter(f => {
        if (seen.has(f.resolution)) return false;
        seen.add(f.resolution);
        return true;
      });
    }
    return list;
  }, [formats, advancedMode]);

  const aFormats = useMemo(() => {
    const list = formats.filter(f => f.acodec && !f.vcodec).sort((a, b) => b.size - a.size);
    if (!advancedMode && list.length > 0) {
      return [list[0]]; // best audio
    }
    return list;
  }, [formats, advancedMode]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-6 pb-6"
    >
      <div className="flex justify-end mb-3">
        <label className="flex items-center gap-2 cursor-pointer text-xs font-black uppercase tracking-widest text-slate-500 hover:text-brand transition">
          <div className="relative">
            <input type="checkbox" className="peer sr-only" checked={advancedMode} onChange={(e) => onToggleAdvanced(e.target.checked)} />
            <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:bg-brand transition-colors"></div>
            <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
          </div>
          Show All Codecs
        </label>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 md:gap-8">
        <div className="bg-slate-50 dark:bg-slate-950/50 p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-slate-200 dark:border-slate-800">
          <h3 className="font-black text-sm md:text-xl mb-4 text-brand italic">VIDEO STREAM</h3>
          <div className="space-y-2.5 max-h-[350px] overflow-y-auto custom-scroll pr-2">
            <StreamOption 
              type="v" id="" main="No Video" sub="SKIP VISUALS" badge="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              isSelected={selectedVideo.id === ''}
              rawSize={0}
              onSelect={setSelectedVideo}
            />
            {vFormats.map((f) => {
              let badge = 'bg-slate-500 text-white';
              if (f.label === '8K') badge = 'badge-8k';
              else if (f.label === '4K') badge = 'badge-4k';
              else if (['2K', 'FHD', 'HD'].includes(f.label)) badge = 'badge-hd';
              
              return (
                <StreamOption 
                  key={f.id} type="v" id={f.id} main={f.resolution} sub={`${f.label} • ${f.codec_info}`} badge={badge}
                  isSelected={selectedVideo.id === f.id}
                  rawSize={f.size}
                  onSelect={setSelectedVideo}
                />
              );
            })}
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-950/50 p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-slate-200 dark:border-slate-800">
          <h3 className="font-black text-sm md:text-xl mb-4 text-green-500 italic">AUDIO TRACK</h3>
          <div className="space-y-2.5 max-h-[350px] overflow-y-auto custom-scroll pr-2">
            {aFormats.length > 0 ? (
              <>
                <StreamOption 
                  type="a" id="" main="No Audio" sub="SKIP SOUND" badge="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  isSelected={selectedAudio.id === ''}
                  rawSize={0}
                  onSelect={setSelectedAudio}
                />
                {aFormats.map((f) => (
                  <StreamOption 
                    key={f.id} type="a" id={f.id} main={f.abr || 'HQ'} sub={f.label} badge="bg-green-500 text-white"
                    isSelected={selectedAudio.id === f.id}
                    rawSize={f.size}
                    onSelect={setSelectedAudio}
                  />
                ))}
              </>
            ) : (
              <StreamOption 
                type="a" id="" main="Audio Included" sub="PRE-MERGED" badge="bg-green-500 text-white"
                isSelected={true}
                rawSize={0}
                onSelect={() => {}}
              />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
