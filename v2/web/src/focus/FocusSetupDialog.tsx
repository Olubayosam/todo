import { useEffect, useMemo, useState } from 'react';
import { Bell, Coffee, Play, Target, X } from 'lucide-react';
import { Dialog } from '../components/ui/Dialog';
import { useUI } from '../store/ui';
import { useData } from '../store/data';
import { useDayTasks } from '../hooks/useTasks';
import { todayKey } from '../lib/dates';
import { startFocus } from '../sync/actions';
import { Checkbox, PRIORITY_COLOR } from '../components/ui/bits';
import { enableNotifications, notificationsSupported } from './notify';
import { toast } from '../store/ui';
import { isActive } from '../lib/focusEngine';

const WORK_PRESETS = [25, 50, 60, 90, 120, 180];
const EVERY_PRESETS = [25, 50, 60, 90];
const BREAK_PRESETS = [5, 10, 15, 20, 30];

function fmtMin(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

function Presets({ values, value, onChange, label }: { values: number[]; value: number; onChange: (v: number) => void; label: string }) {
  const custom = !values.includes(value);
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
      {values.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`chip h-9 px-3.5 text-sm transition-colors ${value === v ? 'bg-ink text-on-ink' : 'bg-sunken text-fg-2 hover:text-fg'}`}>
          {fmtMin(v)}
        </button>
      ))}
      <label className={`chip h-9 gap-1 px-2.5 text-sm ${custom ? 'bg-ink text-on-ink' : 'bg-sunken text-fg-2'}`}>
        <input
          type="number"
          min={1}
          max={720}
          value={custom ? value : ''}
          placeholder="Custom"
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (n > 0 && n <= 720) onChange(n);
          }}
          className="w-16 bg-transparent text-center outline-none placeholder:text-inherit [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          aria-label={`${label} in minutes`}
        />
        <span className="opacity-60">min</span>
      </label>
    </div>
  );
}

export function FocusSetupDialog() {
  const open = useUI((s) => s.focusSetupOpen);
  const preset = useUI((s) => s.focusSetupTasks);
  const set = useUI((s) => s.set);
  const navigate = useUI((s) => s.navigate);
  const allTasks = useData((s) => s.tasks);
  const defaults = useData((s) => s.prefs.focusDefaults);
  const active = useData((s) => isActive(s.focus));
  const today = useDayTasks(todayKey());

  const [chosen, setChosen] = useState<string[]>([]);
  const [workMin, setWorkMin] = useState(defaults?.workMin ?? 60);
  const [breaksOn, setBreaksOn] = useState((defaults?.breakEveryMin ?? 60) > 0);
  const [everyMin, setEveryMin] = useState(defaults?.breakEveryMin || 60);
  const [breakMin, setBreakMin] = useState(defaults?.breakMin || 15);
  const [perm, setPerm] = useState(notificationsSupported ? Notification.permission : 'denied');

  useEffect(() => {
    if (!open) return;
    setChosen(preset.filter((u) => allTasks[u]));
    if (defaults) {
      setWorkMin(defaults.workMin);
      setBreaksOn(defaults.breakEveryMin > 0);
      setEveryMin(defaults.breakEveryMin || 60);
      setBreakMin(defaults.breakMin || 15);
    }
    setPerm(notificationsSupported ? Notification.permission : 'denied');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const candidates = useMemo(() => {
    const list = today.filter((t) => !t.done && !t.virtual);
    for (const u of preset) if (allTasks[u] && !list.some((t) => t.uid === u)) list.unshift(allTasks[u]);
    return list;
  }, [today, preset, allTasks]);

  const breakCount = breaksOn && everyMin < workMin ? Math.ceil(workMin / everyMin) - 1 : 0;
  const totalMin = workMin + breakCount * breakMin;
  const endsAt = new Date(Date.now() + totalMin * 60000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const close = () => set({ focusSetupOpen: false });
  const start = () => {
    startFocus(chosen, { workMin, breakEveryMin: breaksOn ? everyMin : 0, breakMin: breaksOn ? breakMin : 0 });
    set({ focusSetupOpen: false, selecting: false, selected: [] });
    navigate({ name: 'focus' });
  };

  return (
    <Dialog open={open} onClose={close} label="Start a focus session">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Start a focus session</h2>
          <p className="text-sm text-fg-3">Choose what you're working on and how long.</p>
        </div>
        <button type="button" className="icon-btn" onClick={close} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {active && <p className="mb-4 rounded-xl bg-gold-soft px-3 py-2 text-sm text-gold-fg">Starting a new session will end the one in progress.</p>}

        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Target size={15} className="text-cyan-fg" /> Tasks
            </h3>
            <span className="text-xs text-fg-3">{chosen.length ? `${chosen.length} selected` : 'Optional'}</span>
          </div>
          {candidates.length ? (
            <div className="scroll-thin flex max-h-56 flex-col overflow-y-auto rounded-xl border border-line">
              {candidates.map((t) => {
                const on = chosen.includes(t.uid);
                return (
                  <label key={t.uid} className={`flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2.5 text-sm last:border-b-0 hover:bg-hover ${on ? 'bg-cyan-soft/60' : ''}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => setChosen((c) => (on ? c.filter((x) => x !== t.uid) : [...c, t.uid]))} />
                    <span className={`grid size-5 shrink-0 place-items-center rounded-md border-[1.75px] ${on ? 'border-cyan bg-cyan text-carbon' : 'border-line-strong'}`} aria-hidden>
                      {on && <span className="text-[11px] font-bold">✓</span>}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{t.text}</span>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[t.priority] }} />
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl bg-sunken px-3 py-3 text-sm text-fg-3">No open tasks today — you can still start a session.</p>
          )}
        </section>

        <section className="mb-6">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Play size={14} className="text-gold-fg" /> Focus time
          </h3>
          <Presets values={WORK_PRESETS} value={workMin} onChange={setWorkMin} label="Focus time" />
        </section>

        <section className="mb-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Coffee size={15} className="text-fg-2" /> Breaks
            </h3>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-2">
              <Checkbox size={18} checked={breaksOn} onChange={() => setBreaksOn((b) => !b)} label="Take breaks" />
              Take breaks
            </label>
          </div>
          {breaksOn && (
            <div className="flex flex-col gap-3 rounded-xl bg-sunken/70 p-3">
              <div>
                <p className="mb-1.5 text-xs text-fg-3">Break after every</p>
                <Presets values={EVERY_PRESETS} value={everyMin} onChange={setEveryMin} label="Break after every" />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-fg-3">Break length</p>
                <Presets values={BREAK_PRESETS} value={breakMin} onChange={setBreakMin} label="Break length" />
              </div>
            </div>
          )}
        </section>

        {notificationsSupported && perm === 'default' && (
          <button
            type="button"
            onClick={async () => {
              const r = await enableNotifications();
              setPerm(Notification.permission);
              toast(r.message, r.ok ? 'success' : 'error');
            }}
            className="mt-4 flex w-full items-center gap-3 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-left text-sm text-fg-2 hover:bg-hover"
          >
            <Bell size={16} className="text-gold-fg" /> Turn on break alerts so you're told when to rest
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
        <p className="text-sm text-fg-2">
          <span className="font-semibold text-fg">{fmtMin(workMin)}</span> focus
          {breakCount > 0 && (
            <>
              {' '}
              · {breakCount} × {fmtMin(breakMin)} break{breakCount > 1 ? 's' : ''}
            </>
          )}
          <span className="block text-xs text-fg-3">Ends around {endsAt}</span>
        </p>
        <button type="button" onClick={start} className="btn btn-gold h-11 px-5">
          <Play size={16} fill="currentColor" /> Start focus
        </button>
      </div>
    </Dialog>
  );
}
