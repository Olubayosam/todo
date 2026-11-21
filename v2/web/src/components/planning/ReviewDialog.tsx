import { useEffect, useState } from 'react';
import { ArrowRight, MoonStar, X } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { useUI, toast } from '../../store/ui';
import { useData } from '../../store/data';
import { useDayTasks } from '../../hooks/useTasks';
import { useFocusStats } from '../../hooks/useFocusStats';
import { addDays, formatDuration, todayKey } from '../../lib/dates';
import { moveTask } from '../../sync/actions';
import { dispatch } from '../../sync/engine';

const MOODS = ['😣', '😕', '😐', '🙂', '😄'];

export function ReviewDialog() {
  const open = useUI((s) => s.reviewOpen);
  const set = useUI((s) => s.set);
  const today = todayKey();
  const tasks = useDayTasks(today).filter((t) => !t.virtual);
  const note = useData((s) => s.notes[today]);
  const focus = useFocusStats();
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setContent(note?.content ?? '');
      setMood(note?.mood ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const done = tasks.filter((t) => t.done);
  const left = tasks.filter((t) => !t.done);
  const close = () => set({ reviewOpen: false });
  const save = () => {
    dispatch({ type: 'note.upsert', data: { date: today, content: content.trim() || null, mood, reviewed: true } });
    toast('Day reviewed. Rest well.', 'success');
    close();
  };

  return (
    <Dialog open={open} onClose={close} label="Review the day">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-cyan-soft text-cyan-fg">
            <MoonStar size={20} />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Review the day</h2>
            <p className="text-sm text-fg-3">Close the loop, then switch off.</p>
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={close} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-sunken p-3">
            <div className="text-2xl font-semibold tabular">{done.length}</div>
            <div className="text-xs text-fg-3">done</div>
          </div>
          <div className="rounded-2xl bg-sunken p-3">
            <div className="text-2xl font-semibold tabular">{left.length}</div>
            <div className="text-xs text-fg-3">open</div>
          </div>
          <div className="rounded-2xl bg-sunken p-3">
            <div className="text-2xl font-semibold tabular">{formatDuration(focus[today] ?? 0, { compact: true })}</div>
            <div className="text-xs text-fg-3">focused</div>
          </div>
        </div>

        {left.length > 0 && (
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Still open</h3>
              <button type="button" className="text-xs font-medium text-gold-fg hover:underline" onClick={() => left.forEach((t) => moveTask(t, addDays(today, 1)))}>
                Move all to tomorrow
              </button>
            </div>
            <ul className="flex flex-col gap-1">
              {left.map((t) => (
                <li key={t.uid} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-hover">
                  <span className="min-w-0 flex-1 truncate">{t.text}</span>
                  <button type="button" className="chip h-7 bg-sunken px-2.5 text-xs text-fg-2 hover:text-fg" onClick={() => moveTask(t, addDays(today, 1))}>
                    Tomorrow <ArrowRight size={11} />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-fg-3">Anything you leave rolls over automatically.</p>
          </div>
        )}

        <h3 className="mb-2 text-sm font-semibold">How did today feel?</h3>
        <div className="mb-4 flex gap-2" role="radiogroup" aria-label="Mood">
          {MOODS.map((m, i) => (
            <button key={i} type="button" role="radio" aria-checked={mood === i + 1} onClick={() => setMood(i + 1)} className={`grid size-11 place-items-center rounded-2xl text-xl transition-[transform,background-color] ${mood === i + 1 ? 'scale-110 bg-gold-soft ring-1 ring-gold' : 'bg-sunken grayscale-[0.4] hover:grayscale-0'}`}>
              {m}
            </button>
          ))}
        </div>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="A win, a lesson, or what matters tomorrow…" className="field resize-none leading-relaxed" aria-label="Reflection" />
      </div>
      <div className="flex justify-end border-t border-line px-5 py-3.5">
        <button type="button" onClick={save} className="btn btn-primary">
          Save & close the day
        </button>
      </div>
    </Dialog>
  );
}
