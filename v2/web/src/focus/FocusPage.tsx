import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Coffee, Expand, FastForward, Lightbulb, Minimize, Pause, PictureInPicture2, Play, Plus, Square, Target, X } from 'lucide-react';
import { useFocusSnapshot } from './useFocus';
import { useData } from '../store/data';
import { useUI, toast } from '../store/ui';
import { formatClock, formatDuration, todayKey } from '../lib/dates';
import { focusAction, createTasksFromText, toggleDone } from '../sync/actions';
import { Checkbox } from '../components/ui/bits';
import { Visualizer } from './Visualizer';
import { MusicBar } from './MusicBar';
import { openPip, pipSupported, usePip } from './pip';
import { serverNow } from '../lib/api';
import type { FocusState } from '../lib/types';
import { useDayTasks } from '../hooks/useTasks';

/** Work/break segments of the planned session, for the progress strip. */
function segments(focus: FocusState): { kind: 'work' | 'break'; sec: number }[] {
  const out: { kind: 'work' | 'break'; sec: number }[] = [];
  let left = focus.workSec;
  const every = focus.breakEverySec > 0 && focus.breakSec > 0 ? focus.breakEverySec : Infinity;
  while (left > 0 && out.length < 60) {
    const w = Math.min(every, left);
    out.push({ kind: 'work', sec: w });
    left -= w;
    if (left > 0) out.push({ kind: 'break', sec: focus.breakSec });
  }
  return out;
}

export function FocusPage() {
  const { focus, snap, active } = useFocusSnapshot();
  const tasks = useData((s) => s.tasks);
  const navigate = useUI((s) => s.navigate);
  const set = useUI((s) => s.set);
  const pipOpen = usePip((s) => s.open);
  const todayTasks = useDayTasks(todayKey());
  const [thought, setThought] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      if (e.code === 'Space' && active) {
        e.preventDefault();
        focusAction({ type: focus!.status === 'running' ? 'pause' : 'resume' });
      } else if (e.key === 'Escape' && !document.fullscreenElement) {
        navigate({ name: 'day', date: todayKey() });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, focus, navigate]);

  const segs = useMemo(() => (focus ? segments(focus) : []), [focus]);
  // Seconds elapsed along the planned timeline (work done + completed breaks + current break)
  const elapsed = focus && snap ? snap.workDoneSec + snap.breaksTaken * focus.breakSec + (snap.phase === 'break' ? Math.max(0, snap.phaseElapsedSec) : 0) : 0;

  const exit = () => navigate({ name: 'day', date: todayKey() });
  const phase = !active ? 'paused' : focus!.status === 'paused' ? 'paused' : snap!.phase;
  const focusTasks = focus ? focus.taskUids.map((u) => tasks[u]).filter(Boolean) : [];
  const addable = todayTasks.filter((t) => !t.done && !t.virtual && !focus?.taskUids.includes(t.uid));

  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* not allowed */
    }
  };

  return (
    <div className="dark fixed inset-0 z-50 flex flex-col overflow-hidden bg-carbon text-ivory" data-theme="dark">
      <Visualizer mode={phase as 'work' | 'break' | 'paused'} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.55)_100%)]" aria-hidden />

      {/* Top bar */}
      <header className="safe-top relative z-10 flex items-center justify-between px-4 py-3 sm:px-6">
        <button type="button" onClick={exit} className="btn h-10 rounded-full bg-white/5 px-4 text-ivory/80 backdrop-blur hover:bg-white/10" aria-label="Leave focus mode">
          <ArrowLeft size={16} /> <span className="hidden sm:inline">Back to tasks</span>
        </button>
        <div className="flex items-center gap-1.5">
          {active && pipSupported && (
            <button type="button" onClick={() => void openPip()} className={`grid size-10 place-items-center rounded-full backdrop-blur ${pipOpen ? 'bg-cyan/20 text-cyan' : 'bg-white/5 text-ivory/70 hover:bg-white/10'}`} aria-label="Pop out timer" title="Pop out timer (stays on top)">
              <PictureInPicture2 size={17} />
            </button>
          )}
          <button type="button" onClick={() => void toggleFs()} className="grid size-10 place-items-center rounded-full bg-white/5 text-ivory/70 backdrop-blur hover:bg-white/10" aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>
            {fullscreen ? <Minimize size={17} /> : <Expand size={17} />}
          </button>
        </div>
      </header>

      {/* Centre */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        {active && snap && focus ? (
          <>
            <p className={`mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] ${phase === 'break' ? 'text-gold' : phase === 'paused' ? 'text-ivory/50' : 'text-cyan'}`}>
              {phase === 'break' ? <Coffee size={14} /> : phase === 'paused' ? <Pause size={14} /> : <Target size={14} />}
              {phase === 'break' ? 'Break — step away' : phase === 'paused' ? 'Paused' : 'Deep work'}
            </p>
            <div className="text-[clamp(4rem,16vw,9.5rem)] font-extralight leading-none tracking-tight tabular" role="timer" aria-live="off">
              {formatClock(snap.phaseRemainingSec)}
            </div>
            <p className="mt-4 text-sm text-ivory/60">
              {formatDuration(snap.workRemainingSec)} of focus left
              {snap.nextBreakInSec !== null && phase === 'work' && <> · break in {formatDuration(snap.nextBreakInSec)}</>}
              {snap.endsAt && focus.status === 'running' && <> · done by {new Date(snap.endsAt - (serverNow() - Date.now())).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</>}
            </p>

            {segs.length > 0 && (
              <div className="mt-6 flex h-1.5 w-[min(28rem,80vw)] gap-1" aria-hidden>
                {(() => {
                  let acc = 0;
                  return segs.map((s, i) => {
                    const from = acc;
                    acc += s.sec;
                    const fill = Math.min(1, Math.max(0, (elapsed - from) / s.sec));
                    return (
                      <div key={i} className="relative h-full overflow-hidden rounded-full bg-white/10" style={{ flex: s.sec }}>
                        <div className={`absolute inset-y-0 left-0 rounded-full ${s.kind === 'break' ? 'bg-gold' : 'bg-cyan'}`} style={{ width: `${fill * 100}%` }} />
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* Controls */}
            <div className="mt-9 flex items-center gap-3">
              {phase === 'break' ? (
                <button type="button" onClick={() => focusAction({ type: 'skipBreak' })} className="btn h-11 rounded-full bg-white/8 px-4 text-ivory/80 backdrop-blur hover:bg-white/15">
                  <FastForward size={16} /> Skip break
                </button>
              ) : (
                <button type="button" onClick={() => focusAction({ type: 'addWork', sec: 300 })} className="btn h-11 rounded-full bg-white/8 px-4 text-ivory/80 backdrop-blur hover:bg-white/15" title="Add 5 minutes">
                  <Plus size={16} /> 5 min
                </button>
              )}
              <button
                type="button"
                onClick={() => focusAction({ type: focus.status === 'running' ? 'pause' : 'resume' })}
                className={`grid size-16 place-items-center rounded-full text-carbon shadow-lg transition-transform active:scale-95 ${phase === 'break' ? 'bg-gold' : 'bg-ivory'}`}
                aria-label={focus.status === 'running' ? 'Pause' : 'Resume'}
              >
                {focus.status === 'running' ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
              </button>
              {confirmEnd ? (
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => (focusAction({ type: 'cancel' }), setConfirmEnd(false))} className="btn h-11 rounded-full bg-urgent/80 px-4 text-white">
                    End now
                  </button>
                  <button type="button" onClick={() => setConfirmEnd(false)} className="grid size-11 place-items-center rounded-full bg-white/8 text-ivory/70" aria-label="Keep going">
                    <X size={16} />
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmEnd(true)} className="btn h-11 rounded-full bg-white/8 px-4 text-ivory/80 backdrop-blur hover:bg-white/15">
                  <Square size={14} fill="currentColor" /> End
                </button>
              )}
            </div>

            {/* Tasks */}
            <div className="mt-10 w-[min(30rem,90vw)]">
              <div className="flex flex-col gap-1.5">
                {focusTasks.map((t) => (
                  <div key={t.uid} className="group flex items-center gap-3 rounded-2xl bg-white/6 px-4 py-2.5 text-left backdrop-blur">
                    <Checkbox checked={t.done} priority={t.priority} onChange={() => toggleDone(t)} label={`Complete ${t.text}`} />
                    <span className={`min-w-0 flex-1 truncate text-sm ${t.done ? 'text-ivory/40 line-through' : 'text-ivory/90'}`}>{t.text}</span>
                    <button type="button" onClick={() => focusAction({ type: 'setTasks', taskUids: focus.taskUids.filter((u) => u !== t.uid) })} className="text-ivory/30 opacity-0 transition-opacity hover:text-ivory group-hover:opacity-100" aria-label={`Remove ${t.text} from session`}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              {adding ? (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-2xl bg-white/6 p-1 text-left backdrop-blur">
                  {addable.length ? (
                    addable.map((t) => (
                      <button key={t.uid} type="button" onClick={() => (focusAction({ type: 'setTasks', taskUids: [...focus.taskUids, t.uid] }), setAdding(false))} className="block w-full truncate rounded-xl px-3 py-2 text-left text-sm text-ivory/80 hover:bg-white/10">
                        {t.text}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-sm text-ivory/50">No other open tasks today.</p>
                  )}
                </div>
              ) : (
                <button type="button" onClick={() => setAdding(true)} className="mt-2 text-xs text-ivory/45 hover:text-ivory/80">
                  + Add a task to this session
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="max-w-sm">
            {focus && focus.status === 'completed' ? (
              <>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-cyan">Session complete</p>
                <p className="text-5xl font-extralight tracking-tight">{formatDuration(focus.workSec)}</p>
                <p className="mt-3 text-sm text-ivory/60">of deep work. Take a moment before the next thing.</p>
              </>
            ) : (
              <>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-ivory/50">Focus mode</p>
                <p className="text-3xl font-light tracking-tight">Ready when you are.</p>
              </>
            )}
            <button type="button" onClick={() => set({ focusSetupOpen: true, focusSetupTasks: [] })} className="btn btn-gold mt-8 h-12 rounded-full px-6">
              <Play size={16} fill="currentColor" /> Start a session
            </button>
          </div>
        )}
      </main>

      {/* Bottom: park a thought + music */}
      <footer className="safe-bottom relative z-10 flex flex-col items-center gap-3 px-4 pb-4 sm:px-6">
        {active && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!thought.trim()) return;
              createTasksFromText(thought, { date: null });
              setThought('');
              toast('Parked in your Inbox', 'success');
            }}
            className="flex w-[min(30rem,92vw)] items-center gap-2 rounded-full bg-white/6 px-4 backdrop-blur focus-within:bg-white/10"
          >
            <Lightbulb size={15} className="shrink-0 text-gold/80" />
            <input value={thought} onChange={(e) => setThought(e.target.value)} placeholder="Park a distracting thought for later…" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-ivory outline-none placeholder:text-ivory/35" aria-label="Park a thought" />
          </form>
        )}
        <MusicBar />
      </footer>
    </div>
  );
}
