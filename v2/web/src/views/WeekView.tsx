import { useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useUI } from '../store/ui';
import { useTasksInRange } from '../hooks/useTasks';
import { addDays, formatDay, formatDuration, startOfWeek, todayKey, weekDays } from '../lib/dates';
import type { Task } from '../lib/types';
import { moveTask } from '../sync/actions';
import { Checkbox, PRIORITY_COLOR, RepeatIcon } from '../components/ui/bits';
import { toggleDone } from '../sync/actions';
import { QuickAdd } from '../components/tasks/QuickAdd';
import { useIsDesktop } from '../hooks/useMediaQuery';

function MiniTask({ task, overlay }: { task: Task; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.uid, disabled: !!task.virtual || overlay });
  const openTask = useUI((s) => s.openTask);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => openTask(task.uid)}
      className={`group flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-surface px-2.5 py-2 text-[0.82rem] leading-snug shadow-sm transition-[border-color,opacity] hover:border-line-strong ${isDragging ? 'opacity-30' : ''} ${task.virtual ? 'border-dashed opacity-75' : ''} ${overlay ? 'shadow-lg' : ''}`}
    >
      <div className="pt-px">
        <Checkbox size={16} checked={task.done} priority={task.priority} onChange={() => toggleDone(task)} label={`Toggle ${task.text}`} />
      </div>
      <span className={`min-w-0 flex-1 break-words ${task.done ? 'text-fg-3 line-through' : ''}`}>{task.text}</span>
      {task.recurrenceUid && <RepeatIcon />}
      {task.priority !== 'low' && !task.done && <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[task.priority] }} />}
    </div>
  );
}

function DayColumn({ date, tasks, desktop }: { date: string; tasks: Task[]; desktop: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  const navigate = useUI((s) => s.navigate);
  const [adding, setAdding] = useState(false);
  const today = todayKey();
  const isToday = date === today;
  const past = date < today;
  const open = tasks.filter((t) => !t.done).length;
  const est = tasks.filter((t) => !t.done).reduce((m, t) => m + (t.estimateMin ?? 0), 0);

  // Stacked layout (phone / tablet): empty days collapse to one compact row
  if (!desktop && tasks.length === 0 && !adding) {
    return (
      <section ref={setNodeRef} aria-label={formatDay(date, { weekday: 'long', day: 'numeric', month: 'long' })} className={`flex items-center gap-2 rounded-2xl px-2 py-1 transition-colors ${isOver ? 'bg-cyan-soft' : isToday ? 'bg-surface ring-1 ring-line' : ''}`}>
        <button type="button" onClick={() => navigate({ name: 'day', date })} className="flex items-baseline gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-hover">
          <span className={`w-9 text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-gold-fg' : 'text-fg-3'}`}>{formatDay(date, { weekday: 'short' })}</span>
          <span className={`text-lg font-semibold tabular ${past && !isToday ? 'text-fg-3' : ''}`}>{formatDay(date, { day: 'numeric' })}</span>
        </button>
        <span className="text-xs text-fg-3">Nothing planned</span>
        <button type="button" onClick={() => setAdding(true)} className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-fg-3 hover:bg-hover hover:text-fg">
          <Plus size={13} /> Add
        </button>
      </section>
    );
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={formatDay(date, { weekday: 'long', day: 'numeric', month: 'long' })}
      className={`flex min-w-0 flex-col rounded-2xl p-2 transition-colors ${isOver ? 'bg-cyan-soft' : isToday ? 'bg-surface ring-1 ring-line' : ''} ${desktop ? 'min-h-[60vh]' : ''}`}
    >
      <button type="button" onClick={() => navigate({ name: 'day', date })} className="mb-2 flex items-baseline gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-hover">
        <span className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-gold-fg' : 'text-fg-3'}`}>{formatDay(date, { weekday: 'short' })}</span>
        <span className={`text-lg font-semibold tabular ${past && !isToday ? 'text-fg-3' : ''}`}>{formatDay(date, { day: 'numeric' })}</span>
        <span className="ml-auto whitespace-nowrap text-xs text-fg-3 tabular" title={est > 0 ? `${formatDuration(est * 60)} planned` : undefined}>
          {open > 0 && open}
          {est > 0 && <span className={desktop ? 'hidden 2xl:inline' : ''}> · {formatDuration(est * 60, { compact: true })}</span>}
        </span>
      </button>
      <div className="flex flex-col gap-1.5">
        {tasks.map((t) => (
          <MiniTask key={t.uid} task={t} />
        ))}
      </div>
      {adding ? (
        <div className="mt-1.5">
          <QuickAdd date={date} autoFocus compact onDone={() => setAdding(false)} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-fg-3 opacity-70 hover:bg-hover hover:text-fg hover:opacity-100">
          <Plus size={13} /> Add
        </button>
      )}
    </section>
  );
}

export function WeekView({ date }: { date: string }) {
  const navigate = useUI((s) => s.navigate);
  const desktop = useIsDesktop();
  const days = weekDays(date);
  const byDate = useTasksInRange(days[0], days[6]);
  const [active, setActive] = useState<Task | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }));
  const thisWeek = startOfWeek(todayKey()) === days[0];

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    if (!e.over) return;
    const task = Object.values(byDate).flat().find((t) => t.uid === e.active.id);
    if (task) moveTask(task, String(e.over.id));
  };

  const rangeLabel = `${formatDay(days[0], { day: 'numeric', month: 'short' })} – ${formatDay(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-32 pt-5 sm:px-8 sm:pt-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-sm text-fg-3">{thisWeek ? 'This week' : 'Week'}</p>
          <h1 className="text-[1.75rem] font-semibold tracking-tight sm:text-[2rem]">{rangeLabel}</h1>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="icon-btn" onClick={() => navigate({ name: 'week', date: addDays(days[0], -7) })} aria-label="Previous week">
            <ChevronLeft size={18} />
          </button>
          {!thisWeek && (
            <button type="button" className="btn btn-outline h-9 px-3" onClick={() => navigate({ name: 'week', date: todayKey() })}>
              This week
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => navigate({ name: 'week', date: addDays(days[0], 7) })} aria-label="Next week">
            <ChevronRight size={18} />
          </button>
        </div>
      </header>
      <DndContext sensors={sensors} onDragStart={(e) => setActive(Object.values(byDate).flat().find((t) => t.uid === e.active.id) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className={desktop ? 'grid grid-cols-7 gap-2' : 'flex flex-col gap-3'}>
          {days.map((d) => (
            <DayColumn key={d} date={d} tasks={byDate[d] ?? []} desktop={desktop} />
          ))}
        </div>
        <DragOverlay>{active && <MiniTask task={active} overlay />}</DragOverlay>
      </DndContext>
      <p className="mt-6 text-center text-xs text-fg-3">Drag tasks between days to reschedule.</p>
    </div>
  );
}
