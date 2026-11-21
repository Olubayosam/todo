import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useUI } from '../store/ui';
import { useTasksInRange } from '../hooks/useTasks';
import { useFocusStats } from '../hooks/useFocusStats';
import { addMonths, formatDay, formatDuration, monthGrid, todayKey } from '../lib/dates';
import { PRIORITY_COLOR } from '../components/ui/bits';
import { useIsPhone } from '../hooks/useMediaQuery';
import { TaskList } from '../components/tasks/TaskList';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MonthView({ date }: { date: string }) {
  const navigate = useUI((s) => s.navigate);
  const phone = useIsPhone();
  const grid = monthGrid(date);
  const byDate = useTasksInRange(grid[0], grid[41]);
  const focus = useFocusStats();
  const today = todayKey();
  const month = date.slice(0, 7);
  const [picked, setPicked] = useState<string>(date.slice(0, 7) === today.slice(0, 7) ? today : `${month}-01`);
  const thisMonth = month === today.slice(0, 7);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-32 pt-5 sm:px-8 sm:pt-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-sm text-fg-3">Month</p>
          <h1 className="text-[1.75rem] font-semibold tracking-tight sm:text-[2rem]">{formatDay(`${month}-01`, { month: 'long', year: 'numeric' })}</h1>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="icon-btn" onClick={() => navigate({ name: 'month', date: addMonths(`${month}-01`, -1) })} aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          {!thisMonth && (
            <button type="button" className="btn btn-outline h-9 px-3" onClick={() => navigate({ name: 'month', date: today })}>
              This month
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => navigate({ name: 'month', date: addMonths(`${month}-01`, 1) })} aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="grid grid-cols-7 border-b border-line">
          {DOW.map((d) => (
            <div key={d} className="py-2 text-center text-[0.68rem] font-semibold uppercase tracking-wider text-fg-3">
              {phone ? d[0] : d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7" role="grid">
          {grid.map((d) => {
            const tasks = byDate[d] ?? [];
            const open = tasks.filter((t) => !t.done);
            const inMonth = d.slice(0, 7) === month;
            const isToday = d === today;
            const focusSec = focus[d] ?? 0;
            const allDone = tasks.length > 0 && open.length === 0;
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                onClick={() => (phone ? setPicked(d) : navigate({ name: 'day', date: d }))}
                className={`group relative flex flex-col border-b border-r border-line p-1.5 text-left transition-colors hover:bg-hover [&:nth-child(7n)]:border-r-0 ${phone ? 'aspect-square' : 'min-h-28'} ${inMonth ? '' : 'bg-sunken/60 text-fg-3'} ${phone && picked === d ? 'bg-hover' : ''}`}
                aria-label={`${formatDay(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${open.length} open tasks`}
              >
                <span className={`mb-1 grid size-6 place-items-center rounded-full text-xs font-semibold tabular ${isToday ? 'bg-gold text-carbon' : ''}`}>{formatDay(d, { day: 'numeric' })}</span>
                {phone ? (
                  <div className="mt-auto flex flex-wrap justify-center gap-0.5">
                    {open.slice(0, 4).map((t) => (
                      <span key={t.uid} className="size-1.5 rounded-full" style={{ background: PRIORITY_COLOR[t.priority] }} />
                    ))}
                    {allDone && <span className="size-1.5 rounded-full bg-cyan" />}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-0.5">
                      {open.slice(0, 3).map((t) => (
                        <span key={t.uid} className={`flex items-center gap-1.5 truncate rounded-md px-1 text-[0.72rem] leading-5 ${t.virtual ? 'opacity-60' : ''}`}>
                          <span className="size-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[t.priority] }} />
                          <span className="truncate">{t.text}</span>
                        </span>
                      ))}
                      {open.length > 3 && <span className="px-1 text-[0.7rem] text-fg-3">+{open.length - 3} more</span>}
                    </div>
                    <div className="mt-auto flex items-center gap-2 pt-1 text-[0.68rem] text-fg-3">
                      {allDone && <span className="text-cyan-fg">All done</span>}
                      {focusSec >= 60 && <span className="ml-auto tabular">{formatDuration(focusSec, { compact: true })}</span>}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {phone && (
        <div className="mt-6">
          <button type="button" onClick={() => navigate({ name: 'day', date: picked })} className="mb-3 flex w-full items-baseline justify-between px-1">
            <h2 className="text-lg font-semibold">{formatDay(picked, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            <span className="text-sm text-gold-fg">Open</span>
          </button>
          {(byDate[picked] ?? []).length ? <TaskList tasks={byDate[picked] ?? []} variant="row" grouped={false} /> : <p className="px-1 text-sm text-fg-3">Nothing planned.</p>}
        </div>
      )}
    </div>
  );
}
