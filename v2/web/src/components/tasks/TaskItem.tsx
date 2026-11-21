import { memo, useRef, type CSSProperties, type HTMLAttributes } from 'react';
import { ArrowRight, CalendarDays, Clock, CornerDownRight, Flag, GripVertical, Inbox, ListChecks, MoreHorizontal, Play, RotateCw, StickyNote, Timer, Trash2 } from 'lucide-react';
import type { Task } from '../../lib/types';
import { PRIORITIES, PRIORITY_META } from '../../lib/types';
import { addDays, diffDays, formatDuration, formatTime, relativeDay, todayKey } from '../../lib/dates';
import { useData } from '../../store/data';
import { useUI } from '../../store/ui';
import { deleteTask, moveTask, toggleDone, updateTask } from '../../sync/actions';
import { Checkbox, MenuItem, Popover, PRIORITY_COLOR, PriorityChip, RepeatIcon, TagChip } from '../ui/bits';
import { isActive } from '../../lib/focusEngine';

export interface TaskItemProps {
  task: Task;
  variant: 'row' | 'card';
  showDate?: boolean;
  subtaskCount?: { done: number; total: number };
  dragHandle?: HTMLAttributes<HTMLButtonElement>;
  style?: CSSProperties;
  dragging?: boolean;
}

export const TaskItem = memo(function TaskItem({ task, variant, showDate, subtaskCount, dragHandle, style, dragging }: TaskItemProps) {
  const tags = useData((s) => s.tags);
  const focusTasks = useData((s) => (isActive(s.focus) ? s.focus.taskUids : null));
  const selecting = useUI((s) => s.selecting);
  const selected = useUI((s) => s.selected.includes(task.uid));
  const { openTask, toggleSelected, set } = useUI.getState();
  const inFocus = !!focusTasks?.includes(task.uid);
  const today = todayKey();
  const carried = task.originalDate && task.date && !task.done ? diffDays(task.originalDate, task.date) : 0;
  const overdue = !task.done && task.date && task.date < today;

  // Long-press (touch) enters multi-select
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const longPressed = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      navigator.vibrate?.(12);
      toggleSelected(task.uid);
    }, 450);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);

  const onClick = () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (selecting) toggleSelected(task.uid);
    else openTask(task.uid);
  };

  const meta = (
    <>
      {showDate && task.date && (
        <span className={`inline-flex items-center gap-1 ${overdue ? 'text-urgent-fg' : ''}`}>
          <CalendarDays size={12} />
          {relativeDay(task.date)}
        </span>
      )}
      {task.dueTime && (
        <span className="inline-flex items-center gap-1">
          <Clock size={12} />
          {formatTime(task.dueTime)}
        </span>
      )}
      {task.estimateMin && (
        <span className="inline-flex items-center gap-1">
          <Timer size={12} />
          {formatDuration(task.estimateMin * 60, { compact: true })}
          {task.trackedSec > 59 && <span className="text-cyan-fg">· {formatDuration(task.trackedSec, { compact: true })} done</span>}
        </span>
      )}
      {!task.estimateMin && task.trackedSec > 59 && (
        <span className="inline-flex items-center gap-1 text-cyan-fg">
          <Timer size={12} />
          {formatDuration(task.trackedSec, { compact: true })}
        </span>
      )}
      {subtaskCount && subtaskCount.total > 0 && (
        <span className="inline-flex items-center gap-1">
          <ListChecks size={12} />
          {subtaskCount.done}/{subtaskCount.total}
        </span>
      )}
      {task.recurrenceUid && <RepeatIcon />}
      {task.notes && <StickyNote size={12} aria-label="Has notes" />}
      {carried > 0 && (
        <span className="inline-flex items-center gap-1 text-gold-fg" title={`Planned for ${relativeDay(task.originalDate!)}`}>
          <RotateCw size={11} />
          {carried}d
        </span>
      )}
      {task.tagUids.map((u) => tags[u] && <TagChip key={u} tag={tags[u]} />)}
    </>
  );
  const hasMeta = !!(task.dueTime || task.estimateMin || task.trackedSec > 59 || subtaskCount?.total || task.recurrenceUid || task.notes || carried || task.tagUids.length || (showDate && task.date));

  const menu = (
    <Popover
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={`icon-btn size-8 ${open ? 'bg-hover text-fg' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100'}`}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-label="Task actions"
        >
          <MoreHorizontal size={16} />
        </button>
      )}
    >
      {(close) => (
        <div onClick={(e) => e.stopPropagation()}>
          <MenuItem
            icon={<Play size={14} />}
            onClick={() => {
              close();
              set({ focusSetupOpen: true, focusSetupTasks: [task.uid] });
            }}
          >
            Focus on this
          </MenuItem>
          <MenuItem
            icon={<CornerDownRight size={14} />}
            onClick={() => {
              close();
              openTask(task.uid);
            }}
          >
            Open details
          </MenuItem>
          <div className="my-1 h-px bg-line" />
          {task.date !== today && (
            <MenuItem icon={<CalendarDays size={14} />} onClick={() => (close(), moveTask(task, today))}>
              Move to today
            </MenuItem>
          )}
          <MenuItem icon={<ArrowRight size={14} />} onClick={() => (close(), moveTask(task, addDays(task.date && task.date > today ? task.date : today, 1)))}>
            {task.date && task.date > today ? 'Push a day' : 'Move to tomorrow'}
          </MenuItem>
          {task.date !== null && (
            <MenuItem icon={<Inbox size={14} />} onClick={() => (close(), moveTask(task, null))}>
              Move to Inbox
            </MenuItem>
          )}
          <div className="my-1 h-px bg-line" />
          <div className="flex items-center gap-1 px-2 py-1.5">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                title={PRIORITY_META[p].label}
                onClick={() => (close(), updateTask(task, { priority: p }))}
                className={`grid size-8 place-items-center rounded-lg hover:bg-hover ${task.priority === p ? 'bg-hover' : ''}`}
              >
                <Flag size={15} fill={PRIORITY_COLOR[p]} color={PRIORITY_COLOR[p]} />
              </button>
            ))}
          </div>
          <div className="my-1 h-px bg-line" />
          <MenuItem danger icon={<Trash2 size={14} />} onClick={() => (close(), deleteTask(task))}>
            {task.virtual ? 'Skip this occurrence' : 'Delete'}
          </MenuItem>
        </div>
      )}
    </Popover>
  );

  const check = selecting ? (
    <span
      className={`grid size-5 shrink-0 place-items-center rounded-md border-[1.75px] transition-colors ${selected ? 'border-gold bg-gold text-carbon' : 'border-line-strong'}`}
      aria-hidden
    >
      {selected && <span className="text-[11px] font-bold">✓</span>}
    </span>
  ) : (
    <Checkbox checked={task.done} priority={task.priority} onChange={() => toggleDone(task)} label={task.done ? `Mark "${task.text}" not done` : `Complete "${task.text}"`} />
  );

  const handle = dragHandle && (
    <button
      type="button"
      {...dragHandle}
      onClick={(e) => e.stopPropagation()}
      className="-ml-1 hidden cursor-grab touch-none rounded p-0.5 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing sm:block"
      aria-label="Drag to reorder"
    >
      <GripVertical size={14} />
    </button>
  );

  const ring = selected ? 'ring-2 ring-gold/70' : inFocus ? 'ring-1 ring-cyan/60' : '';

  if (variant === 'card') {
    return (
      <div
        style={style}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerMove={cancelPress}
        // Fixed height; width comes from the content (set by the wrapping cell in TaskList)
        className={`group relative flex h-34 w-full cursor-pointer flex-col rounded-2xl border p-4 transition-[box-shadow,border-color,background-color] ${task.done ? 'border-transparent bg-sunken/70' : 'border-line bg-surface shadow-sm hover:border-line-strong hover:shadow-md'} ${dragging ? 'opacity-40' : ''} ${task.virtual ? 'border-dashed' : ''} ${ring}`}
      >
        <span className="absolute inset-y-4 left-0 w-[3px] rounded-r-full" style={{ background: task.done ? 'var(--line-strong)' : PRIORITY_COLOR[task.priority] }} aria-hidden />
        <div className="flex items-start gap-3">
          {check}
          <p title={task.text} className={`line-clamp-2 flex-1 text-[0.94rem] font-medium leading-snug ${task.done ? 'text-fg-3 line-through' : ''}`}>
            {task.text}
          </p>
          <div className="-mr-2 -mt-1.5 flex shrink-0 items-center">
            {handle}
            {menu}
          </div>
        </div>
        <div className="mt-auto flex flex-nowrap items-center gap-x-3 overflow-hidden pt-3 text-xs text-fg-3 mask-[linear-gradient(to_right,black_88%,transparent)] *:shrink-0">
          <PriorityChip priority={task.priority} />
          {meta}
          {inFocus && <span className="chip bg-cyan-soft text-cyan-fg animate-breathe">In focus</span>}
        </div>
      </div>
    );
  }

  return (
    <div
      style={style}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerMove={cancelPress}
      className={`group relative flex cursor-pointer items-start gap-3 rounded-xl border py-3 pl-4 pr-3 transition-[border-color,box-shadow,background-color] ${task.done ? 'border-transparent bg-sunken/70' : 'border-line bg-surface shadow-sm hover:border-line-strong hover:shadow-md'} ${dragging ? 'opacity-40' : ''} ${task.virtual ? 'border-dashed opacity-75' : ''} ${ring}`}
    >
      {/* priority edge */}
      <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full" style={{ background: task.done ? 'var(--line-strong)' : PRIORITY_COLOR[task.priority] }} aria-hidden />
      {handle && <div className="absolute -left-5 top-3.5">{handle}</div>}
      <div className="pt-0.5">{check}</div>
      <div className="min-w-0 flex-1">
        <p className={`text-[0.92rem] leading-snug ${task.done ? 'text-fg-3 line-through decoration-fg-3/60' : 'text-fg'}`}>
          {task.text}
          {inFocus && <span className="chip ml-2 bg-cyan-soft align-middle text-cyan-fg animate-breathe">In focus</span>}
        </p>
        {hasMeta && <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3">{meta}</div>}
      </div>
      <div className="-my-1 -mr-1.5 flex items-center">{menu}</div>
    </div>
  );
});
