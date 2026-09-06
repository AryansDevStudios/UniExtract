import React, { useMemo } from 'react';
import { Scissors, Clock3, AlertTriangle, ArrowLeftRight, RotateCcw } from 'lucide-react';

const pad = (n) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

export const formatClock = (seconds) => {
  if (seconds === null || seconds === undefined || isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
    return '00:00:00';
  }
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
};

export const toSeconds = (value) => {
  if (!value || typeof value !== 'string') return 0;
  const clean = value.trim();
  if (!clean) return 0;

  if (/^\d+(\.\d+)?$/.test(clean)) {
    return Math.max(0, Math.floor(Number(clean)));
  }

  const parts = clean.split(':').map((p) => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });

  if (parts.length === 3) {
    return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  if (parts.length === 2) {
    return Math.max(0, parts[0] * 60 + parts[1]);
  }
  if (parts.length === 1) {
    return Math.max(0, parts[0]);
  }
  return 0;
};

export default function ClipPanel({ clipStart, setClipStart, clipEnd, setClipEnd, metadata }) {
  const totalDuration = metadata?.duration && metadata.duration > 0 ? metadata.duration : 600;

  const startSec = useMemo(() => toSeconds(clipStart), [clipStart]);
  const endSec = useMemo(() => {
    if (!clipEnd) return totalDuration;
    return toSeconds(clipEnd);
  }, [clipEnd, totalDuration]);

  const hasActiveClip = Boolean((clipStart && clipStart !== '00:00:00') || (clipEnd && clipEnd !== formatClock(totalDuration)));
  const isInverted = clipStart && clipEnd && startSec >= endSec;
  const clipDuration = Math.max(0, endSec - startSec);
  const clipPercent = totalDuration > 0 ? Math.min(100, Math.round((clipDuration / totalDuration) * 100)) : 100;

  const handleInputChange = (type, rawVal) => {
    const clean = rawVal.replace(/[^\d:]/g, '').slice(0, 8);
    if (type === 'start') {
      setClipStart(clean);
    } else {
      setClipEnd(clean);
    }
  };

  const handleBlur = (type) => {
    if (type === 'start') {
      if (!clipStart || clipStart.trim() === '') {
        setClipStart('00:00:00');
      } else {
        const sec = toSeconds(clipStart);
        setClipStart(formatClock(sec));
      }
    } else {
      if (!clipEnd || clipEnd.trim() === '') {
        setClipEnd(formatClock(totalDuration));
      } else {
        const sec = toSeconds(clipEnd);
        setClipEnd(formatClock(sec));
      }
    }
  };

  const nudgeTime = (type, delta) => {
    if (type === 'start') {
      const current = toSeconds(clipStart);
      const updated = Math.max(0, Math.min(current + delta, endSec - 1));
      setClipStart(formatClock(updated));
    } else {
      const current = toSeconds(clipEnd) || totalDuration;
      const updated = Math.min(totalDuration, Math.max(current + delta, startSec + 1));
      setClipEnd(formatClock(updated));
    }
  };

  const handleSwapAndFix = () => {
    const newStart = Math.min(startSec, endSec);
    const newEnd = Math.max(startSec, endSec);
    if (newStart === newEnd) {
      setClipStart(formatClock(0));
      setClipEnd(formatClock(Math.max(10, newEnd)));
    } else {
      setClipStart(formatClock(newStart));
      setClipEnd(formatClock(newEnd));
    }
  };

  const applyPreset = (preset) => {
    if (preset === 'full') {
      setClipStart('00:00:00');
      setClipEnd(formatClock(totalDuration));
    } else if (preset === 'first30') {
      setClipStart('00:00:00');
      setClipEnd(formatClock(Math.min(30, totalDuration)));
    } else if (preset === 'first60') {
      setClipStart('00:00:00');
      setClipEnd(formatClock(Math.min(60, totalDuration)));
    } else if (preset === 'last60') {
      setClipStart(formatClock(Math.max(0, totalDuration - 60)));
      setClipEnd(formatClock(totalDuration));
    }
  };

  const handleSliderStart = (e) => {
    const val = Number(e.target.value);
    const targetSec = Math.round((val / 1000) * totalDuration);
    if (targetSec < endSec) {
      setClipStart(formatClock(targetSec));
    }
  };

  const handleSliderEnd = (e) => {
    const val = Number(e.target.value);
    const targetSec = Math.round((val / 1000) * totalDuration);
    if (targetSec > startSec) {
      setClipEnd(formatClock(targetSec));
    }
  };

  const startPercent = totalDuration > 0 ? (startSec / totalDuration) * 100 : 0;
  const endPercent = totalDuration > 0 ? (endSec / totalDuration) * 100 : 100;

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/40 p-4 backdrop-blur-md shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300">
          <Scissors size={15} className="text-indigo-500" /> Trim & Clip
        </div>

        <div className="flex items-center gap-2">
          {hasActiveClip && !isInverted && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 shadow-xs">
              <Clock3 size={12} /> {formatClock(clipDuration)} ({clipPercent}%)
            </span>
          )}

          {hasActiveClip && (
            <button
              type="button"
              onClick={() => applyPreset('full')}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex items-center gap-1"
              title="Reset to full video"
            >
              <RotateCcw size={12} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Modern Interactive Visual Scrubber Bar */}
      <div className="mb-4 pt-2">
        <div className="relative h-6 flex items-center">
          <div className="absolute inset-x-0 h-2 rounded-full bg-slate-200 dark:bg-slate-700/60 overflow-hidden">
            {!isInverted && (
              <div
                className="absolute top-0 bottom-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-75 shadow-xs"
                style={{
                  left: `${Math.max(0, Math.min(100, startPercent))}%`,
                  width: `${Math.max(0, Math.min(100, endPercent - startPercent))}%`
                }}
              />
            )}
          </div>

          {/* Dual Range Sliders */}
          <input
            type="range"
            min="0"
            max="1000"
            value={totalDuration > 0 ? (startSec / totalDuration) * 1000 : 0}
            onChange={handleSliderStart}
            className="absolute inset-x-0 w-full opacity-0 cursor-pointer pointer-events-auto h-6 z-20"
            title="Drag to adjust start time"
          />
          <input
            type="range"
            min="0"
            max="1000"
            value={totalDuration > 0 ? (endSec / totalDuration) * 1000 : 1000}
            onChange={handleSliderEnd}
            className="absolute inset-x-0 w-full opacity-0 cursor-pointer pointer-events-auto h-6 z-30"
            title="Drag to adjust end time"
          />

          {/* Visual Handles */}
          <div
            className="absolute -translate-x-1/2 w-4 h-4 rounded-full bg-white dark:bg-indigo-400 border-2 border-indigo-600 shadow-md pointer-events-none z-10 transition-all duration-75"
            style={{ left: `${Math.max(0, Math.min(100, startPercent))}%` }}
          />
          <div
            className="absolute -translate-x-1/2 w-4 h-4 rounded-full bg-white dark:bg-purple-400 border-2 border-purple-600 shadow-md pointer-events-none z-10 transition-all duration-75"
            style={{ left: `${Math.max(0, Math.min(100, endPercent))}%` }}
          />
        </div>

        {/* Timeline markers */}
        <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
          <span>00:00:00</span>
          <span className="font-semibold text-slate-500 dark:text-slate-400">Total: {formatClock(totalDuration)}</span>
          <span>{formatClock(totalDuration)}</span>
        </div>
      </div>

      {/* Fail-Proof Error Banner if Inverted */}
      {isInverted && (
        <div className="mb-3 rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between gap-2 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="flex-shrink-0 text-amber-500" />
            <span>
              <strong>Invalid Range:</strong> Start time cannot be after End time.
            </span>
          </div>
          <button
            type="button"
            onClick={handleSwapAndFix}
            className="px-2.5 py-1 rounded-lg bg-amber-500 text-white font-bold text-[10px] uppercase tracking-wider hover:bg-amber-600 transition-colors flex items-center gap-1 flex-shrink-0"
          >
            <ArrowLeftRight size={12} /> Swap & Fix
          </button>
        </div>
      )}

      {/* Time inputs with fine stepper nudges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* START TIME */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/90 p-2.5 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Start Time
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => nudgeTime('start', -5)}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800"
                title="-5 seconds"
              >
                -5s
              </button>
              <button
                type="button"
                onClick={() => nudgeTime('start', 1)}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800"
                title="+1 second"
              >
                +1s
              </button>
              <button
                type="button"
                onClick={() => nudgeTime('start', 5)}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800"
                title="+5 seconds"
              >
                +5s
              </button>
            </div>
          </div>
          <input
            type="text"
            value={clipStart}
            onChange={(e) => handleInputChange('start', e.target.value)}
            onBlur={() => handleBlur('start')}
            placeholder="00:00:00"
            className={`w-full rounded-lg px-2.5 py-1.5 text-sm font-mono font-semibold tracking-wider outline-none transition-colors ${
              isInverted
                ? 'border border-amber-400 bg-amber-500/5 text-amber-700 dark:text-amber-300'
                : 'border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-100 focus:border-indigo-500'
            }`}
          />
        </div>

        {/* END TIME */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/90 p-2.5 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              End Time
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => nudgeTime('end', -5)}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800"
                title="-5 seconds"
              >
                -5s
              </button>
              <button
                type="button"
                onClick={() => nudgeTime('end', -1)}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800"
                title="-1 second"
              >
                -1s
              </button>
              <button
                type="button"
                onClick={() => nudgeTime('end', 5)}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800"
                title="+5 seconds"
              >
                +5s
              </button>
            </div>
          </div>
          <input
            type="text"
            value={clipEnd}
            onChange={(e) => handleInputChange('end', e.target.value)}
            onBlur={() => handleBlur('end')}
            placeholder={formatClock(totalDuration)}
            className={`w-full rounded-lg px-2.5 py-1.5 text-sm font-mono font-semibold tracking-wider outline-none transition-colors ${
              isInverted
                ? 'border border-amber-400 bg-amber-500/5 text-amber-700 dark:text-amber-300'
                : 'border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-100 focus:border-indigo-500'
            }`}
          />
        </div>
      </div>

      {/* Presets Row */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
          Presets:
        </span>
        <button
          type="button"
          onClick={() => applyPreset('first30')}
          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-2xs active:scale-95"
        >
          First 30s
        </button>
        <button
          type="button"
          onClick={() => applyPreset('first60')}
          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-2xs active:scale-95"
        >
          First 1m
        </button>
        {totalDuration > 90 && (
          <button
            type="button"
            onClick={() => applyPreset('last60')}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-2xs active:scale-95"
          >
            Last 1m
          </button>
        )}
        <button
          type="button"
          onClick={() => applyPreset('full')}
          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-2xs active:scale-95"
        >
          Full Video
        </button>
      </div>
    </div>
  );
}
