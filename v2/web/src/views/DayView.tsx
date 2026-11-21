import { useMemo } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, List, ListChecks, MoonStar, RotateCw, Sunrise, Timer } from 'lucide-react';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import { useDayTasks, useRolledOver } from '../hooks/useTasks';
import { useFocusStats } from '../hooks/useFocusStats';
import { addDays, formatDay, formatDuration, greeting, relativeDay, todayKey } from '../lib/dates';
import { isActive, simulate } from '../lib/focusEngine';
import { serverNow } from '../lib/api';
import { TaskList } from '../components/tasks/TaskList';
import { QuickAdd } from '../components/tasks/QuickAdd';
import { ProgressRing } from '../components/ui/bits';
import { useLocalView } from '../hooks/useLocalView';

function Stat({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
      <div className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone === 'warn' ? 'bg-urgent-soft text-urgent-fg' : 'bg-sunken text-fg-2'}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-fg-3">{label}</div>
        <div className="truncate text-sm font-semibold tabular">
          {value}
          {sub && <span className="ml-1.5 font-normal text-fg-3">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

export function DayView({ date }: { date: string }) {
  const navigate = useUI((s) => s.navigate);
  const set = useUI((s) => s.set);
  const selecting = useUI((s) => s.selecting);
  const prefs = useData((s) => s.prefs);
  const focus = useData((s) => s.focus);
  const tasks = useDayTasks(date);
  const rolled = useRolledOver();
  const focusStats = useFocusStats();
  const [view, setView] = useLocalView();
  const today = todayKey();
  const isToday = date === today;

  const { done, total, plannedMin } = useMemo(() => {
    const real = tasks;
    return {
      done: real.filter((t) => t.done).length,
      total: real.length,
      plannedMin: real.filter((t) => !t.done).reduce((m, t) => m + (t.estimateMin ?? 0), 0),
    };
  }, [tasks]);

  const capacity = prefs.dailyCapacityMin ?? 360;
  const over = plannedMin > capacity;
  let focusedSec = focusStats[date] ?? 0;
  if (isToday && focus && isActive(focus)) {
    // The server logs work up to each anchor; add what's been done since
    focusedSec += Math.max(0, simulate(focus, serverNow()).workDoneSec - focus.workDoneSec);
  }
  const showPlanBanner = isToday && rolled.length > 0 && prefs.lastPlanDate !== today;
  const hour = new Date().getHours();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-5 sm:px-8 sm:pt-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-sm text-fg-3">{isToday ? `${greeting()}${prefs.name ? `, ${prefs.name}` : ''}` : relativeDay(date)}</p>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-[2rem]">{formatDay(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="icon-btn" onClick={() => navigate({ name: 'day', date: addDays(date, -1) })} aria-label="Previous day">
            <ChevronLeft size={18} />
          </button>
          {!isToday && (
            <button type="button" className="btn btn-outline h-9 px-3" onClick={() => navigate({ name: 'day', date: today })}>
              Today
            </button>
          )}
          <label className="icon-btn relative cursor-pointer" aria-label="Pick a date">
            <CalendarDays size={18} />
            <input type="date" value={date} onChange={(e) => e.target.value && navigate({ name: 'day', date: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
          <button type="button" className="icon-btn" onClick={() => navigate({ name: 'day', date: addDays(date, 1) })} aria-label="Next day">
            <ChevronRight size={18} />
          </button>
          <div className="mx-1 h-5 w-px bg-line" />
          <div className="flex rounded-lg bg-sunken p-0.5" role="radiogroup" aria-label="Layout">
            {(
              [
                ['list', List],
                ['cards', LayoutGrid],
              ] as const
            ).map(([v, Icon]) => (
              <button key={v} type="button" role="radio" aria-checked={view === v} aria-label={v === 'list' ? 'List' : 'Cards'} onClick={() => setView(v)} className={`grid size-8 place-items-center rounded-md transition-colors ${view === v ? 'bg-surface text-fg shadow-sm' : 'text-fg-3 hover:text-fg'}`}>
                <Icon size={15} />
              </button>
            ))}
          </div>
        </div>
      </header>

      {total > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <div className="col-span-2 flex items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm sm:col-span-1">
            <ProgressRing value={total ? done / total : 0} size={40}>
              <span className="text-[0.65rem] font-semibold tabular">{total ? Math.round((done / total) * 100) : 0}%</span>
            </ProgressRing>
            <div>
              <div className="text-xs text-fg-3">Progress</div>
              <div className="text-sm font-semibold tabular">
                {done} of {total} done
              </div>
            </div>
          </div>
          <Stat icon={<Timer size={17} />} label="Focused" value={formatDuration(focusedSec)} />
          <Stat
            icon={<ListChecks size={17} />}
            label="Planned"
            tone={over ? 'warn' : undefined}
            value={plannedMin ? formatDuration(plannedMin * 60) : '—'}
            sub={plannedMin ? `of ${formatDuration(capacity * 60, { compact: true })}` : undefined}
          />
        </div>
      )}
      {over && (
        <p className="-mt-2 mb-5 text-xs text-urgent-fg">You've planned {formatDuration((plannedMin - capacity) * 60)} more than your daily capacity. Consider moving something to tomorrow.</p>
      )}

      {showPlanBanner && (
        <button
          type="button"
          onClick={() => set({ planDayOpen: true })}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-gold/30 bg-gold-soft px-4 py-3 text-left transition-colors hover:border-gold/60"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-gold text-carbon">
            <RotateCw size={17} />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold">
              {rolled.length} unfinished {rolled.length === 1 ? 'task' : 'tasks'} carried over
            </span>
            <span className="block text-xs text-fg-2">Plan your day: keep, reschedule or let go.</span>
          </span>
          <span className="text-sm font-semibold text-gold-fg">Review</span>
        </button>
      )}

      <div className="mb-6">
        <QuickAdd date={date} />
      </div>

      {selecting && (
        <p className="mb-3 rounded-xl bg-gold-soft px-3 py-2 text-xs text-gold-fg">Tap tasks to select them for a focus session.</p>
      )}

      {total === 0 ? (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-sunken text-fg-3">{isToday && hour >= 18 ? <MoonStar size={24} /> : <Sunrise size={24} />}</div>
          <p className="font-medium">{isToday ? 'A clear day' : `Nothing planned for ${relativeDay(date).toLowerCase()}`}</p>
          <p className="mt-1 max-w-xs text-sm text-fg-3">Add what matters above. Press <span className="kbd">N</span> anywhere to capture a task.</p>
        </div>
      ) : (
        <TaskList tasks={tasks} variant={view === 'cards' ? 'card' : 'row'} />
      )}

      {isToday && total > 0 && hour >= 16 && (
        <div className="mt-10 flex justify-center">
          <button type="button" className="btn btn-outline" onClick={() => set({ reviewOpen: true })}>
            <MoonStar size={16} /> Review the day
          </button>
        </div>
      )}
    </div>
  );
}
