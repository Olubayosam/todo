import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown } from 'lucide-react';
import { PRIORITIES, PRIORITY_META, type Priority, type Task } from '../../lib/types';
import { useSubtaskCounts } from '../../hooks/useTasks';
import { reorderTasks, updateTask } from '../../sync/actions';
import { PRIORITY_COLOR } from '../ui/bits';
import { TaskItem } from './TaskItem';

/** Cards share one height; each takes the width its title needs (capped), and rows fill out evenly. */
const CARD_CELL = 'w-full sm:w-auto sm:min-w-56 sm:max-w-[26rem] sm:grow';
const containerClass = (variant: 'row' | 'card') => (variant === 'card' ? 'flex flex-wrap gap-3' : 'flex flex-col gap-2');

function GroupHeader({ color, label, count, children }: { color: string; label: string; count: number; children?: React.ReactNode }) {
  return (
    <header className="mb-2.5 flex items-center gap-2.5">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      <h3 className="label">{label}</h3>
      <span className="text-xs text-fg-3 tabular">{count}</span>
      <span className="h-px flex-1 bg-line" aria-hidden />
      {children}
    </header>
  );
}

function SortableTask({ task, variant, showDate, counts }: { task: Task; variant: 'row' | 'card'; showDate?: boolean; counts: ReturnType<typeof useSubtaskCounts> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.uid, data: { priority: task.priority }, disabled: !!task.virtual });
  return (
    <div ref={setNodeRef} className={variant === 'card' ? CARD_CELL : undefined}>
      <TaskItem
        task={task}
        variant={variant}
        showDate={showDate}
        subtaskCount={counts[task.uid]}
        dragHandle={task.virtual ? undefined : { ...attributes, ...listeners }}
        dragging={isDragging}
        style={{ transform: CSS.Translate.toString(transform), transition }}
      />
    </div>
  );
}

function Group({ priority, tasks, variant, showDate, counts, active }: { priority: Priority; tasks: Task[]; variant: 'row' | 'card'; showDate?: boolean; counts: ReturnType<typeof useSubtaskCounts>; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${priority}`, data: { priority } });
  return (
    <section ref={setNodeRef} className={`-m-2 rounded-2xl p-2 transition-colors ${active && isOver ? 'bg-cyan-soft/50' : ''}`} aria-label={`${PRIORITY_META[priority].label} priority`}>
      <GroupHeader color={PRIORITY_COLOR[priority]} label={PRIORITY_META[priority].label} count={tasks.length} />
      <SortableContext items={tasks.map((t) => t.uid)} strategy={variant === 'card' ? rectSortingStrategy : verticalListSortingStrategy}>
        <div className={containerClass(variant)}>
          {tasks.map((t) => (
            <SortableTask key={t.uid} task={t} variant={variant} showDate={showDate} counts={counts} />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

export function TaskList({ tasks, variant, showDate, grouped = true }: { tasks: Task[]; variant: 'row' | 'card'; showDate?: boolean; grouped?: boolean }) {
  const counts = useSubtaskCounts();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(true);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const open = useMemo(() => tasks.filter((t) => !t.done), [tasks]);
  const done = useMemo(() => tasks.filter((t) => t.done), [tasks]);
  const groups = useMemo(() => PRIORITIES.map((p) => ({ priority: p, tasks: open.filter((t) => t.priority === p) })).filter((g) => g.tasks.length), [open]);
  const active = activeId ? tasks.find((t) => t.uid === activeId) : undefined;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const task = tasks.find((t) => t.uid === a.id);
    if (!task) return;
    const targetPriority: Priority = (over.data.current?.priority as Priority) ?? task.priority;
    const groupTasks = open.filter((t) => t.priority === targetPriority && !t.virtual);
    let ordered: string[];
    if (targetPriority === task.priority) {
      const ids = groupTasks.map((t) => t.uid);
      const from = ids.indexOf(task.uid);
      const to = ids.indexOf(String(over.id));
      if (from < 0 || to < 0) return;
      ordered = arrayMove(ids, from, to);
    } else {
      const ids = groupTasks.map((t) => t.uid);
      const at = ids.indexOf(String(over.id));
      ids.splice(at < 0 ? ids.length : at, 0, task.uid);
      ordered = ids;
      updateTask(task, { priority: targetPriority });
    }
    reorderTasks(ordered);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="flex flex-col gap-8 sm:pl-3">
        {grouped ? (
          groups.map((g) => <Group key={g.priority} priority={g.priority} tasks={g.tasks} variant={variant} showDate={showDate} counts={counts} active={!!activeId} />)
        ) : (
          <SortableContext items={open.map((t) => t.uid)} strategy={verticalListSortingStrategy}>
            <div className={containerClass(variant)}>
              {open.map((t) => (
                <SortableTask key={t.uid} task={t} variant={variant} showDate={showDate} counts={counts} />
              ))}
            </div>
          </SortableContext>
        )}
        {done.length > 0 && (
          <section aria-label="Completed">
            <GroupHeader color="var(--cyan)" label="Completed" count={done.length}>
              <button type="button" onClick={() => setShowDone((v) => !v)} className="-mr-1 grid size-7 place-items-center rounded-lg text-fg-3 hover:bg-hover hover:text-fg" aria-expanded={showDone} aria-label={showDone ? 'Hide completed' : 'Show completed'}>
                <ChevronDown size={15} className={`transition-transform ${showDone ? '' : '-rotate-90'}`} />
              </button>
            </GroupHeader>
            {showDone && (
              <div className={containerClass(variant)}>
                {done.map((t) => (
                  <div key={t.uid} className={variant === 'card' ? CARD_CELL : undefined}>
                    <TaskItem task={t} variant={variant} showDate={showDate} subtaskCount={counts[t.uid]} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
      {/* Rendered on <body>: an animated ancestor (page fade-in) would otherwise
          become the containing block for the fixed overlay and offset it from the pointer. */}
      {createPortal(
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
          {active && (
            <div className="h-full rotate-[0.6deg] rounded-2xl shadow-lg">
              <TaskItem task={active} variant={variant} showDate={showDate} subtaskCount={counts[active.uid]} />
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
