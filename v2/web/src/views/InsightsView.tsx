import { useMemo, useState } from 'react';
import { CheckCircle2, Flame, Timer, TrendingUp } from 'lucide-react';
import { useData } from '../store/data';
import { useFocusStats } from '../hooks/useFocusStats';
import { addDays, formatDay, formatDuration, fromKey, startOfWeek, toKey, todayKey } from '../lib/dates';

function Card({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm text-fg-3">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular">{value}</div>
      {sub && <div className="mt-1 text-xs text-fg-3">{sub}</div>}
    </div>
  );
}

/** Yearly focus heatmap — 53 weeks x 7 days, cyan scale. */
function Heatmap({ byDate }: { byDate: Record<string, number> }) {
  const [hover, setHover] = useState<string | null>(null);
  const today = todayKey();
  const start = addDays(startOfWeek(today), -52 * 7);
  const weeks = Array.from({ length: 53 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const level = (sec: number) => (sec <= 0 ? 0 : sec < 1800 ? 1 : sec < 3600 * 1.5 ? 2 : sec < 3600 * 3 ? 3 : 4);
  const fills = ['var(--sunken)', 'color-mix(in oklab, var(--cyan) 28%, var(--surface))', 'color-mix(in oklab, var(--cyan) 52%, var(--surface))', 'color-mix(in oklab, var(--cyan) 78%, var(--surface))', 'var(--cyan)'];
  const months: { label: string; col: number }[] = [];
  weeks.forEach((w, i) => {
    const m = w[0].slice(5, 7);
    if (i === 0 || weeks[i - 1][0].slice(5, 7) !== m) months.push({ label: formatDay(w[0], { month: 'short' }), col: i });
  });
  return (
    <div>
      <div className="no-scrollbar overflow-x-auto">
        <svg viewBox={`0 0 ${53 * 13 + 24} ${7 * 13 + 18}`} className="min-w-[640px]" role="img" aria-label="Focus time per day over the last year">
          {months.map((m) => (
            <text key={m.col} x={24 + m.col * 13} y={9} fontSize={8} fill="var(--fg-3)">
              {m.label}
            </text>
          ))}
          {['M', '', 'W', '', 'F', '', ''].map((l, i) => (
            <text key={i} x={0} y={18 + i * 13 + 9} fontSize={8} fill="var(--fg-3)">
              {l}
            </text>
          ))}
          {weeks.map((w, wi) =>
            w.map((d, di) =>
              d > today ? null : (
                <rect
                  key={d}
                  x={24 + wi * 13}
                  y={14 + di * 13}
                  width={10}
                  height={10}
                  rx={2.5}
                  fill={fills[level(byDate[d] ?? 0)]}
                  stroke={d === today ? 'var(--gold)' : 'none'}
                  onMouseEnter={() => setHover(d)}
                  onMouseLeave={() => setHover(null)}
                >
                  <title>{`${formatDay(d, { day: 'numeric', month: 'short' })}: ${formatDuration(byDate[d] ?? 0)}`}</title>
                </rect>
              ),
            ),
          )}
        </svg>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-fg-3">
        <span>{hover ? `${formatDay(hover, { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatDuration(byDate[hover] ?? 0)}` : 'Hover a day'}</span>
        <span className="flex items-center gap-1">
          Less
          {fills.map((f, i) => (
            <span key={i} className="size-2.5 rounded-[3px]" style={{ background: f }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

export function InsightsView() {
  const focus = useFocusStats();
  const tasks = useData((s) => s.tasks);
  const today = todayKey();

  const stats = useMemo(() => {
    const completedByDate: Record<string, number> = {};
    for (const t of Object.values(tasks)) {
      if (t.done && t.completedAt) {
        const k = toKey(new Date(t.completedAt));
        completedByDate[k] = (completedByDate[k] ?? 0) + 1;
      }
    }
    const weekStart = startOfWeek(today);
    let weekFocus = 0;
    let weekDone = 0;
    let lastWeekFocus = 0;
    for (let i = 0; i < 7; i++) {
      weekFocus += focus[addDays(weekStart, i)] ?? 0;
      weekDone += completedByDate[addDays(weekStart, i)] ?? 0;
      lastWeekFocus += focus[addDays(weekStart, i - 7)] ?? 0;
    }
    // Streak: consecutive days (ending today or yesterday) with focus or completions
    const active = (d: string) => (focus[d] ?? 0) >= 60 || (completedByDate[d] ?? 0) > 0;
    let streak = 0;
    let d = active(today) ? today : addDays(today, -1);
    while (active(d) && streak < 1000) {
      streak++;
      d = addDays(d, -1);
    }
    let best = 0;
    let run = 0;
    for (let i = 370; i >= 0; i--) {
      const k = addDays(today, -i);
      run = active(k) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    const last14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).map((k) => ({ date: k, focus: focus[k] ?? 0, done: completedByDate[k] ?? 0 }));
    const topTasks = Object.values(tasks)
      .filter((t) => t.trackedSec >= 60)
      .sort((a, b) => b.trackedSec - a.trackedSec)
      .slice(0, 6);
    const yearTotal = Object.values(focus).reduce((a, b) => a + b, 0);
    return { weekFocus, weekDone, lastWeekFocus, streak, best, last14, topTasks, yearTotal };
  }, [tasks, focus, today]);

  const maxFocus = Math.max(3600, ...stats.last14.map((d) => d.focus));
  const delta = stats.lastWeekFocus ? Math.round(((stats.weekFocus - stats.lastWeekFocus) / stats.lastWeekFocus) * 100) : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-32 pt-5 sm:px-8 sm:pt-10">
      <header className="mb-6">
        <p className="mb-1 text-sm text-fg-3">How the work is going</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight sm:text-[2rem]">Insights</h1>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card icon={<Timer size={15} />} label="Focus this week" value={formatDuration(stats.weekFocus)} sub={delta === null ? undefined : `${delta >= 0 ? '+' : ''}${delta}% vs last week`} />
        <Card icon={<CheckCircle2 size={15} />} label="Done this week" value={String(stats.weekDone)} sub="tasks completed" />
        <Card icon={<Flame size={15} />} label="Streak" value={`${stats.streak} ${stats.streak === 1 ? 'day' : 'days'}`} sub={`Best: ${stats.best} days`} />
        <Card icon={<TrendingUp size={15} />} label="Past year" value={formatDuration(stats.yearTotal)} sub="total focus" />
      </div>

      <section className="mb-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Last 14 days</h2>
        <div className="flex h-44 items-end gap-1.5 sm:gap-2.5" role="img" aria-label="Daily focus time and completed tasks for the last 14 days">
          {stats.last14.map((d) => {
            const h = (d.focus / maxFocus) * 100;
            const isToday = d.date === today;
            return (
              <div key={d.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${formatDay(d.date, { weekday: 'short', day: 'numeric' })}: ${formatDuration(d.focus)} focus, ${d.done} done`}>
                <span className="text-[0.65rem] text-fg-3 opacity-0 tabular transition-opacity group-hover:opacity-100">{d.focus >= 60 ? formatDuration(d.focus, { compact: true }) : ''}</span>
                <div className="relative w-full max-w-9 rounded-md bg-sunken" style={{ height: `${Math.max(h, 2)}%` }}>
                  <div className="absolute inset-0 rounded-md" style={{ background: isToday ? 'var(--gold)' : 'var(--cyan)', opacity: d.focus ? 1 : 0 }} />
                </div>
                <span className="text-[0.65rem] tabular text-fg-3">{fromKey(d.date).getDate()}</span>
                <span className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.6rem] font-semibold tabular ${d.done ? 'bg-ink text-on-ink' : 'text-fg-3'}`}>{d.done || '·'}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-fg-3">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-cyan" /> Focus time
          </span>
          <span className="flex items-center gap-1.5">
            <span className="grid size-3.5 place-items-center rounded-full bg-ink text-[0.5rem] text-on-ink">3</span> Tasks done
          </span>
        </div>
      </section>

      <section className="mb-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Focus over the year</h2>
        <Heatmap byDate={focus} />
      </section>

      {stats.topTasks.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">Where your focus went</h2>
          <ul className="flex flex-col gap-2.5">
            {stats.topTasks.map((t) => (
              <li key={t.uid} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm">{t.text}</span>
                <div className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-sunken sm:block">
                  <div className="h-full rounded-full bg-cyan" style={{ width: `${(t.trackedSec / stats.topTasks[0].trackedSec) * 100}%` }} />
                </div>
                <span className="w-16 text-right text-sm tabular text-fg-2">{formatDuration(t.trackedSec, { compact: true })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
