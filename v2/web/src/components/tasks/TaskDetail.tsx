import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Clock, Flag, Hash, Inbox, ListChecks, Play, Plus, Repeat, RotateCw, StickyNote, Timer, Trash2, X } from 'lucide-react';
import { useData } from '../../store/data';
import { useUI } from '../../store/ui';
import { useSubtasks, useTask } from '../../hooks/useTasks';
import { addDays, diffDays, formatDuration, relativeDay, startOfWeek, todayKey } from '../../lib/dates';
import { describeRule } from '../../lib/recurrence';
import { PRIORITIES, PRIORITY_META, type RecurrenceRule, type Task } from '../../lib/types';
import { addSubtask, deleteSubtask, deleteTask, ensureTags, moveTask, setRecurrenceForTask, syncSeries, toggleDone, updateSubtask, updateTask } from '../../sync/actions';
import { Checkbox, PRIORITY_COLOR, TagChip } from '../ui/bits';

function AutoTextarea({ value, onCommit, className, placeholder, label }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; label: string }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [v]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={v}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && label === 'Task title') {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      className={`w-full resize-none outline-none placeholder:text-fg-3 ${className?.includes('bg-') ? '' : 'bg-transparent'} ${className}`}
    />
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-3 py-2">
      <div className="flex items-center gap-2 pt-1.5 text-sm text-fg-3">
        {icon}
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const ESTIMATES = [15, 30, 45, 60, 90, 120, 180];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function RepeatEditor({ task }: { task: Task }) {
  const rec = useData((s) => (task.recurrenceUid ? s.recurrences[task.recurrenceUid] : undefined));
  const rule = rec?.rule;
  const kind = !rule ? 'none' : rule.freq === 'weekly' && rule.byDay?.length === 5 && [1, 2, 3, 4, 5].every((d) => rule.byDay!.includes(d)) ? 'weekdays' : rule.freq;
  const baseDow = new Date((task.date ?? todayKey()) + 'T12:00').getDay();
  const setRule = (r: RecurrenceRule | null) => setRecurrenceForTask(task, r);
  return (
    <div className="flex flex-col gap-2">
      <select
        className="field h-9 py-1"
        value={kind}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'none') setRule(null);
          else if (v === 'daily') setRule({ freq: 'daily', interval: 1 });
          else if (v === 'weekdays') setRule({ freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] });
          else if (v === 'weekly') setRule({ freq: 'weekly', interval: 1, byDay: [baseDow] });
          else if (v === 'monthly') setRule({ freq: 'monthly', interval: 1 });
        }}
      >
        <option value="none">Doesn't repeat</option>
        <option value="daily">Every day</option>
        <option value="weekdays">Every weekday</option>
        <option value="weekly">Weekly on…</option>
        <option value="monthly">Monthly</option>
      </select>
      {rule?.freq === 'weekly' && kind !== 'weekdays' && (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const on = rule.byDay?.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  const next = on ? (rule.byDay ?? []).filter((x) => x !== d) : [...(rule.byDay ?? []), d];
                  if (next.length) setRule({ ...rule, byDay: next });
                }}
                className={`size-8 rounded-full text-xs font-semibold transition-colors ${on ? 'bg-ink text-on-ink' : 'bg-sunken text-fg-3 hover:text-fg'}`}
                aria-pressed={on}
              >
                {DOW[d]}
              </button>
            );
          })}
        </div>
      )}
      {rule && <p className="text-xs text-fg-3">{describeRule(rule)} · edits to title or priority apply to future repeats</p>}
    </div>
  );
}

function TagEditor({ task }: { task: Task }) {
  const tags = useData((s) => s.tags);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const available = useMemo(
    () => Object.values(tags).filter((t) => !task.tagUids.includes(t.uid) && t.name.toLowerCase().includes(q.toLowerCase())),
    [tags, task.tagUids, q],
  );
  const add = (tagUid: string) => {
    const tagUids = [...task.tagUids, tagUid];
    updateTask(task, { tagUids });
    syncSeries(task, { tagUids });
    setQ('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {task.tagUids.map(
        (u) =>
          tags[u] && (
            <TagChip
              key={u}
              tag={tags[u]}
              onRemove={() => {
                const tagUids = task.tagUids.filter((x) => x !== u);
                updateTask(task, { tagUids });
                syncSeries(task, { tagUids });
              }}
            />
          ),
      )}
      <div className="relative">
        <input
          value={q}
          onChange={(e) => (setQ(e.target.value), setOpen(true))}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q.trim()) {
              e.preventDefault();
              const exact = Object.values(tags).find((t) => t.name.toLowerCase() === q.trim().toLowerCase());
              add(exact?.uid ?? ensureTags([q.trim()])[0]);
            }
          }}
          placeholder="Add tag"
          aria-label="Add tag"
          className="h-7 w-24 rounded-full bg-sunken px-3 text-xs outline-none focus:w-36 focus:ring-2 focus:ring-cyan/40 transition-[width]"
        />
        {open && (available.length > 0 || q.trim()) && (
          <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-xl border border-line bg-raised p-1 shadow-lg">
            {available.slice(0, 6).map((t) => (
              <button key={t.uid} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(t.uid)} className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm hover:bg-hover">
                <TagChip tag={t} />
              </button>
            ))}
            {q.trim() && !Object.values(tags).some((t) => t.name.toLowerCase() === q.trim().toLowerCase()) && (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(ensureTags([q.trim()])[0])} className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-fg-2 hover:bg-hover">
                Create “{q.trim()}”
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Subtasks({ task }: { task: Task }) {
  const subs = useSubtasks(task.uid);
  const [text, setText] = useState('');
  return (
    <div className="flex flex-col">
      {subs.map((s) => (
        <div key={s.uid} className="group flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-hover">
          <Checkbox size={16} checked={s.done} onChange={() => updateSubtask(s, { done: !s.done })} label={`Toggle ${s.text}`} />
          <input
            defaultValue={s.text}
            onBlur={(e) => e.target.value.trim() && e.target.value !== s.text && updateSubtask(s, { text: e.target.value.trim() })}
            className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${s.done ? 'text-fg-3 line-through' : ''}`}
            aria-label="Subtask"
          />
          <button type="button" onClick={() => deleteSubtask(s)} className="opacity-0 group-hover:opacity-100 text-fg-3 hover:text-urgent-fg" aria-label="Delete subtask">
            <X size={14} />
          </button>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (task.virtual) return;
          addSubtask(task.uid, text);
          setText('');
        }}
        className="flex items-center gap-2.5 px-1 py-1.5"
      >
        <Plus size={16} className="text-fg-3" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={task.virtual ? 'Edit the task first to add steps' : 'Add a step'} disabled={task.virtual} className="flex-1 bg-transparent text-sm outline-none placeholder:text-fg-3" aria-label="New subtask" />
      </form>
    </div>
  );
}

export function TaskDetail({ uid, virtualTask, onClose }: { uid: string; virtualTask?: Task; onClose: () => void }) {
  const stored = useTask(uid);
  const task = stored ?? virtualTask ?? null;
  const set = useUI((s) => s.set);
  const openTask = useUI((s) => s.openTask);
  if (!task) return null;
  const today = todayKey();
  const carried = task.originalDate && task.date ? diffDays(task.originalDate, task.date) : 0;

  const patch = (p: Partial<Task>) => {
    const newUid = updateTask(task, p);
    syncSeries(task, p);
    if (newUid !== task.uid) openTask(newUid);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div className="flex items-center gap-2 text-sm text-fg-3">
          {task.date ? <CalendarDays size={15} /> : <Inbox size={15} />}
          {task.date ? relativeDay(task.date) : 'Inbox'}
          {task.virtual && <span className="chip bg-sunken">Upcoming repeat</span>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-gold h-8 px-3 text-xs" onClick={() => set({ focusSetupOpen: true, focusSetupTasks: [task.uid] })} disabled={task.done || task.virtual}>
            <Play size={13} fill="currentColor" /> Focus
          </button>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="pt-1.5">
            <Checkbox checked={task.done} priority={task.priority} onChange={() => toggleDone(task)} label="Toggle complete" size={22} />
          </div>
          <AutoTextarea label="Task title" value={task.text} onCommit={(v) => v.trim() && patch({ text: v.trim() })} className={`text-xl font-semibold leading-snug tracking-tight ${task.done ? 'text-fg-3 line-through' : ''}`} />
        </div>

        {carried > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-gold-soft px-3 py-2 text-sm text-gold-fg">
            <RotateCw size={14} />
            Carried over {carried} {carried === 1 ? 'day' : 'days'} — first planned for {relativeDay(task.originalDate!)}
          </div>
        )}

        <div className="mt-4 divide-y divide-line">
          <Row icon={<Flag size={15} />} label="Priority">
            <div className="flex flex-wrap gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => patch({ priority: p })}
                  className={`chip h-8 px-3 text-xs transition-colors ${task.priority === p ? 'ring-1' : 'bg-sunken text-fg-3 hover:text-fg'}`}
                  style={task.priority === p ? { color: 'var(--fg)', background: `color-mix(in oklab, ${PRIORITY_COLOR[p]} 18%, transparent)`, ['--tw-ring-color' as string]: PRIORITY_COLOR[p] } : undefined}
                  aria-pressed={task.priority === p}
                >
                  <Flag size={12} fill={PRIORITY_COLOR[p]} color={PRIORITY_COLOR[p]} />
                  {PRIORITY_META[p].label}
                </button>
              ))}
            </div>
          </Row>
          <Row icon={<CalendarDays size={15} />} label="Date">
            <div className="flex flex-wrap items-center gap-1.5">
              <input type="date" className="field h-9 w-auto py-1" value={task.date ?? ''} onChange={(e) => moveTask(task, e.target.value || null)} aria-label="Date" />
              {[
                ['Today', today],
                ['Tomorrow', addDays(today, 1)],
                ['Next week', addDays(startOfWeek(today), 7)],
              ].map(([label, d]) => (
                <button key={label} type="button" onClick={() => moveTask(task, d)} className={`chip h-8 px-3 text-xs ${task.date === d ? 'bg-ink text-on-ink' : 'bg-sunken text-fg-2 hover:text-fg'}`}>
                  {label}
                </button>
              ))}
              <button type="button" onClick={() => moveTask(task, null)} className={`chip h-8 px-3 text-xs ${task.date === null ? 'bg-ink text-on-ink' : 'bg-sunken text-fg-2 hover:text-fg'}`}>
                Inbox
              </button>
            </div>
          </Row>
          <Row icon={<Clock size={15} />} label="Time">
            <div className="flex items-center gap-2">
              <input type="time" className="field h-9 w-auto py-1" value={task.dueTime ?? ''} onChange={(e) => patch({ dueTime: e.target.value || null })} aria-label="Due time" />
              {task.dueTime && (
                <button type="button" className="text-xs text-fg-3 hover:text-fg" onClick={() => patch({ dueTime: null })}>
                  Clear
                </button>
              )}
            </div>
          </Row>
          <Row icon={<Timer size={15} />} label="Estimate">
            <div className="flex flex-wrap gap-1.5">
              {ESTIMATES.map((m) => (
                <button key={m} type="button" onClick={() => patch({ estimateMin: task.estimateMin === m ? null : m })} className={`chip h-8 px-2.5 text-xs ${task.estimateMin === m ? 'bg-ink text-on-ink' : 'bg-sunken text-fg-2 hover:text-fg'}`}>
                  {formatDuration(m * 60, { compact: true })}
                </button>
              ))}
            </div>
            {task.trackedSec > 0 && <p className="mt-2 text-xs text-cyan-fg">{formatDuration(task.trackedSec)} focused so far</p>}
          </Row>
          <Row icon={<Repeat size={15} />} label="Repeat">
            <RepeatEditor task={task} />
          </Row>
          <Row icon={<Hash size={15} />} label="Tags">
            <TagEditor task={task} />
          </Row>
        </div>

        <div className="mt-5">
          <div className="mb-1 flex items-center gap-2 text-sm text-fg-3">
            <ListChecks size={15} /> Steps
          </div>
          <Subtasks task={task} />
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-fg-3">
            <StickyNote size={15} /> Notes
          </div>
          <AutoTextarea label="Notes" value={task.notes ?? ''} onCommit={(v) => patch({ notes: v.trim() ? v : null })} placeholder="Links, context, thoughts…" className="min-h-24 rounded-xl bg-sunken p-3 text-sm leading-relaxed" />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-fg-3">
        <span>{task.createdAt ? `Created ${new Date(task.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}</span>
        <button
          type="button"
          className="btn btn-ghost h-8 px-2.5 text-xs hover:text-urgent-fg"
          onClick={() => {
            deleteTask(task);
            onClose();
          }}
        >
          <Trash2 size={14} /> {task.virtual ? 'Skip occurrence' : 'Delete'}
        </button>
      </div>
    </div>
  );
}
