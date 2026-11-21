import { ChevronRight, Coffee, EyeOff, Maximize2, Pause, PictureInPicture2, Play, Target } from 'lucide-react';
import { useFocusSnapshot } from './useFocus';
import { useData } from '../store/data';
import { setMiniTimerHidden, useUI } from '../store/ui';
import { formatClock, formatDuration } from '../lib/dates';
import { focusAction } from '../sync/actions';
import { ProgressRing } from '../components/ui/bits';
import { openPip, pipSupported, usePip } from './pip';

/** Shared body for the floating card and the Picture-in-Picture window. */
export function MiniTimerBody({ variant }: { variant: 'card' | 'pip' }) {
  const { focus, snap, active } = useFocusSnapshot();
  const tasks = useData((s) => s.tasks);
  const pipOpen = usePip((s) => s.open);
  if (!active || !focus || !snap) {
    return variant === 'pip' ? <div className="grid h-screen place-items-center bg-carbon font-sans text-sm text-ivory/60">No active session</div> : null;
  }
  const paused = focus.status === 'paused';
  const isBreak = snap.phase === 'break';
  const accent = isBreak ? 'var(--gold)' : 'var(--cyan)';
  const names = focus.taskUids.map((u) => tasks[u]?.text).filter(Boolean) as string[];
  const progress = snap.phaseTotalSec ? 1 - snap.phaseRemainingSec / snap.phaseTotalSec : 0;

  const body = (
    <div className="flex items-center gap-3.5">
      <ProgressRing value={progress} size={variant === 'pip' ? 64 : 52} stroke={3} color={accent} track="rgb(255 255 255 / 0.1)">
        {isBreak ? <Coffee size={variant === 'pip' ? 20 : 17} style={{ color: accent }} /> : <Target size={variant === 'pip' ? 20 : 17} style={{ color: accent }} />}
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em]" style={{ color: paused ? 'rgb(250 249 246 / 0.5)' : accent }}>
          {paused ? 'Paused' : isBreak ? 'Break' : 'Focus'}
        </p>
        <p className={`font-light leading-none tracking-tight tabular text-ivory ${variant === 'pip' ? 'text-4xl' : 'text-[1.9rem]'}`}>{formatClock(snap.phaseRemainingSec)}</p>
        <p className="mt-1 truncate text-xs text-ivory/55">
          {isBreak ? `${formatDuration(snap.workRemainingSec)} focus left` : names.length ? (names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0]) : `${formatDuration(snap.workRemainingSec)} left`}
        </p>
      </div>
      <button type="button" onClick={() => focusAction({ type: paused ? 'resume' : 'pause' })} className="grid size-10 shrink-0 place-items-center rounded-full bg-ivory text-carbon transition-transform active:scale-95" aria-label={paused ? 'Resume' : 'Pause'}>
        {paused ? <Play size={16} fill="currentColor" className="ml-0.5" /> : <Pause size={16} fill="currentColor" />}
      </button>
    </div>
  );

  if (variant === 'pip') {
    return <div className="flex h-screen flex-col justify-center bg-carbon px-5 font-sans text-ivory">{body}</div>;
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-carbon/95 p-3.5 pr-3 text-ivory shadow-lg backdrop-blur-xl">
      {body}
      <div className="mt-3 flex items-center gap-1 border-t border-white/10 pt-2.5">
        <button type="button" onClick={() => useUI.getState().navigate({ name: 'focus' })} className="btn h-8 flex-1 rounded-full bg-white/8 px-3 text-xs text-ivory/85 hover:bg-white/15">
          <Maximize2 size={13} /> Focus mode
        </button>
        {pipSupported && (
          <button type="button" onClick={() => void openPip()} className={`grid size-8 place-items-center rounded-full hover:bg-white/10 ${pipOpen ? 'text-cyan' : 'text-ivory/60'}`} aria-label="Pop out timer (always on top)" title="Pop out — stays on top of other tabs and apps">
            <PictureInPicture2 size={15} />
          </button>
        )}
        <button type="button" onClick={() => setMiniTimerHidden(true)} className="grid size-8 place-items-center rounded-full text-ivory/60 hover:bg-white/10" aria-label="Hide timer card" title="Hide">
          <EyeOff size={15} />
        </button>
      </div>
    </div>
  );
}

export function FocusMiniCard() {
  const { focus, snap, active } = useFocusSnapshot();
  const hidden = useUI((s) => s.miniTimerHidden);
  const route = useUI((s) => s.route.name);
  if (!active || !focus || !snap || route === 'focus') return null;
  const isBreak = snap.phase === 'break';

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setMiniTimerHidden(false)}
        className="fixed bottom-24 right-0 z-40 flex items-center gap-2 rounded-l-full border border-r-0 border-white/10 bg-carbon/95 py-2 pl-3 pr-2.5 text-ivory shadow-lg backdrop-blur-xl transition-transform hover:-translate-x-0.5 sm:bottom-6"
        aria-label="Show timer card"
      >
        <span className={`size-2 rounded-full ${focus.status === 'paused' ? 'bg-ivory/40' : isBreak ? 'bg-gold' : 'bg-cyan animate-breathe'}`} />
        <span className="text-sm font-medium tabular">{formatClock(snap.phaseRemainingSec)}</span>
        <ChevronRight size={14} className="rotate-180 text-ivory/50" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-3 z-40 w-[min(21rem,calc(100vw-1.5rem))] animate-fade-up sm:bottom-6 sm:right-6">
      <MiniTimerBody variant="card" />
    </div>
  );
}
