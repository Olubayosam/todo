import { ArrowRight, Check, Inbox, RotateCw, Sunrise, Trash2, X } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { useUI } from '../../store/ui';
import { useData } from '../../store/data';
import { useRolledOver } from '../../hooks/useTasks';
import { addDays, diffDays, relativeDay, todayKey } from '../../lib/dates';
import { deleteTask, moveTask, setPrefs, toggleDone, updateTask } from '../../sync/actions';
import { PRIORITY_COLOR } from '../ui/bits';

export function PlanDayDialog() {
  const open = useUI((s) => s.planDayOpen);
  const set = useUI((s) => s.set);
  const name = useData((s) => s.prefs.name);
  const rolled = useRolledOver();
  const today = todayKey();
  const close = () => set({ planDayOpen: false });
  const finish = () => {
    setPrefs({ lastPlanDate: today });
    close();
  };

  return (
    <Dialog open={open} onClose={close} label="Plan your day">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-gold-soft text-gold-fg">
            <Sunrise size={20} />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Plan your day{name ? `, ${name}` : ''}</h2>
            <p className="text-sm text-fg-3">These didn't get done. Decide what deserves today.</p>
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={close} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {rolled.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-fg-3">All carried-over tasks are sorted. Have a focused day.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rolled.map((t) => {
              const days = diffDays(t.originalDate!, today);
              return (
                <li key={t.uid} className="rounded-2xl border border-line bg-surface p-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[t.priority] }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t.text}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-gold-fg">
                        <RotateCw size={11} /> Carried {days} {days === 1 ? 'day' : 'days'} · from {relativeDay(t.originalDate!)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5 pl-5">
                    <button type="button" onClick={() => updateTask(t, { originalDate: null })} className="chip h-8 bg-ink px-3 text-xs text-on-ink">
                      <Check size={12} /> Keep for today
                    </button>
                    <button type="button" onClick={() => moveTask(t, addDays(today, 1))} className="chip h-8 bg-sunken px-3 text-xs text-fg-2 hover:text-fg">
                      <ArrowRight size={12} /> Tomorrow
                    </button>
                    <button type="button" onClick={() => moveTask(t, null)} className="chip h-8 bg-sunken px-3 text-xs text-fg-2 hover:text-fg">
                      <Inbox size={12} /> Inbox
                    </button>
                    <button type="button" onClick={() => toggleDone(t)} className="chip h-8 bg-cyan-soft px-3 text-xs text-cyan-fg">
                      Already done
                    </button>
                    <button type="button" onClick={() => deleteTask(t)} className="chip h-8 px-3 text-xs text-fg-3 hover:text-urgent-fg">
                      <Trash2 size={12} /> Let go
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
        <p className="text-xs text-fg-3">Anything left here stays on today.</p>
        <button type="button" onClick={finish} className="btn btn-primary">
          Start the day
        </button>
      </div>
    </Dialog>
  );
}
