import { serverNow, uid } from '../lib/api';
import { applyFocusAction, isActive, type FocusAction } from '../lib/focusEngine';
import { parseTask } from '../lib/parse';
import { ruleMatches } from '../lib/recurrence';
import { todayKey } from '../lib/dates';
import type { FocusState, Op, Prefs, Priority, Recurrence, Subtask, Tag, TagColor, Task } from '../lib/types';
import { useData } from '../store/data';
import { toast } from '../store/ui';
import { dispatch } from './engine';

const TAG_COLORS: TagColor[] = ['cyan', 'gold', 'violet', 'rose', 'green', 'blue', 'orange', 'slate'];

function nextPosition(date: string | null): number {
  const tasks = Object.values(useData.getState().tasks).filter((t) => t.date === date);
  return tasks.reduce((m, t) => Math.max(m, t.position), -1) + 1;
}

export function ensureTags(names: string[]): string[] {
  const tags = Object.values(useData.getState().tags);
  const ops: Op[] = [];
  const uids = names.map((name, i) => {
    const found = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (found) return found.uid;
    const tag: Tag = { uid: uid(), name, color: TAG_COLORS[(tags.length + i) % TAG_COLORS.length], position: tags.length + i };
    ops.push({ type: 'tag.upsert', data: tag });
    return tag.uid;
  });
  dispatch(...ops);
  return uids;
}

export interface NewTaskDefaults {
  date?: string | null;
  priority?: Priority;
  tagUids?: string[];
}

/** Creates one task per non-empty line, understanding quick-add syntax. */
export function createTasksFromText(input: string, defaults: NewTaskDefaults = {}): number {
  const lines = input.split('\n').map((l) => l.trim()).filter(Boolean);
  const ops: Op[] = [];
  let created = 0;
  let pos = -1;
  for (const line of lines) {
    const p = parseTask(line);
    if (!p.text) continue;
    const date = p.date !== undefined ? p.date : (defaults.date ?? null);
    const tagUids = [...new Set([...(defaults.tagUids ?? []), ...ensureTags(p.tags)])];
    const priority = p.priority ?? defaults.priority ?? 'low';
    if (p.rule) {
      const start = date ?? todayKey();
      const rec: Recurrence = {
        uid: uid(),
        text: p.text,
        priority,
        notes: null,
        dueTime: p.dueTime ?? null,
        estimateMin: p.estimateMin ?? null,
        tagUids,
        rule: p.rule,
        startDate: start,
        endDate: null,
        active: true,
      };
      ops.push({ type: 'recurrence.upsert', data: rec });
      const today = todayKey();
      if (start <= today && ruleMatches(rec.rule, rec.startDate, today)) {
        ops.push({ type: 'task.upsert', data: { ...fromRecurrence(rec, today), uid: uid() } });
      }
      created++;
      continue;
    }
    if (pos < 0) pos = nextPosition(date);
    ops.push({
      type: 'task.upsert',
      data: {
        uid: uid(),
        text: p.text,
        date,
        priority,
        dueTime: p.dueTime ?? null,
        estimateMin: p.estimateMin ?? null,
        tagUids,
        position: pos++,
        done: false,
      },
    });
    created++;
  }
  dispatch(...ops);
  return created;
}

function fromRecurrence(r: Recurrence, date: string): Omit<Task, 'uid' | 'virtual'> {
  return {
    text: r.text,
    done: false,
    date,
    priority: r.priority,
    position: 0,
    notes: r.notes,
    dueTime: r.dueTime,
    estimateMin: r.estimateMin,
    trackedSec: 0,
    originalDate: null,
    recurrenceUid: r.uid,
    completedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tagUids: r.tagUids,
  };
}

/** Turns a virtual recurring occurrence into a real task (on first edit). */
function materialize(task: Task, patch: Partial<Task>): string {
  const real = uid();
  const { virtual: _v, uid: _u, ...rest } = task;
  void _v;
  void _u;
  dispatch({ type: 'task.upsert', data: { ...rest, ...patch, uid: real } });
  return real;
}

export function updateTask(task: Task, patch: Partial<Task>): string {
  if (task.virtual) return materialize(task, patch);
  dispatch({ type: 'task.upsert', data: { uid: task.uid, ...patch } });
  return task.uid;
}

export function toggleDone(task: Task) {
  updateTask(task, { done: !task.done });
}

/** User-driven move to another day: clears the "rolled over" history. */
export function moveTask(task: Task, date: string | null) {
  if (task.date === date) return;
  updateTask(task, { date, originalDate: null, position: nextPosition(date) });
}

export function deleteTask(task: Task) {
  if (task.virtual && task.recurrenceUid && task.date) {
    dispatch({ type: 'recurrence.skip', data: { uid: task.recurrenceUid, date: task.date } });
    toast('Skipped this occurrence', 'info');
    return;
  }
  const subs = Object.values(useData.getState().subtasks).filter((s) => s.taskUid === task.uid);
  dispatch({ type: 'task.delete', data: { uid: task.uid } });
  toast('Task deleted', 'info', {
    label: 'Undo',
    run: () => {
      const { virtual: _v, ...rest } = task;
      void _v;
      dispatch(
        { type: 'task.upsert', data: rest },
        ...subs.map((s): Op => ({ type: 'subtask.upsert', data: s })),
      );
    },
  });
}

export function reorderTasks(uids: string[]) {
  dispatch({ type: 'task.reorder', data: { uids } });
}

export function addSubtask(taskUid: string, text: string) {
  const subs = Object.values(useData.getState().subtasks).filter((s) => s.taskUid === taskUid);
  const s: Subtask = { uid: uid(), taskUid, text: text.trim(), done: false, position: subs.length };
  if (!s.text) return;
  dispatch({ type: 'subtask.upsert', data: s });
}

export function updateSubtask(s: Subtask, patch: Partial<Subtask>) {
  dispatch({ type: 'subtask.upsert', data: { ...s, ...patch } });
}

export function deleteSubtask(s: Subtask) {
  dispatch({ type: 'subtask.delete', data: { uid: s.uid } });
}

export function setRecurrenceForTask(task: Task, rule: Recurrence['rule'] | null) {
  if (!rule) {
    if (task.recurrenceUid) dispatch({ type: 'recurrence.delete', data: { uid: task.recurrenceUid } });
    return;
  }
  const existing = task.recurrenceUid ? useData.getState().recurrences[task.recurrenceUid] : undefined;
  const rec: Recurrence = {
    uid: existing?.uid ?? uid(),
    text: task.text,
    priority: task.priority,
    notes: task.notes,
    dueTime: task.dueTime,
    estimateMin: task.estimateMin,
    tagUids: task.tagUids,
    rule,
    startDate: existing?.startDate ?? task.date ?? todayKey(),
    endDate: null,
    active: true,
  };
  const ops: Op[] = [{ type: 'recurrence.upsert', data: rec }];
  if (!task.virtual && task.recurrenceUid !== rec.uid) {
    ops.push({ type: 'task.upsert', data: { uid: task.uid, recurrenceUid: rec.uid, date: task.date ?? rec.startDate } });
  }
  dispatch(...ops);
}

/** Keeps the series template in step when the user edits a recurring task's text/priority. */
export function syncSeries(task: Task, patch: Partial<Task>) {
  if (!task.recurrenceUid) return;
  const rec = useData.getState().recurrences[task.recurrenceUid];
  if (!rec) return;
  const keys = ['text', 'priority', 'notes', 'dueTime', 'estimateMin', 'tagUids'] as const;
  const changed = keys.filter((k) => k in patch);
  if (!changed.length) return;
  const next = { ...rec };
  for (const k of changed) (next as Record<string, unknown>)[k] = patch[k];
  dispatch({ type: 'recurrence.upsert', data: next });
}

// ---------------------------------------------------------------------------
// Focus
// ---------------------------------------------------------------------------

export interface FocusPlan {
  workMin: number;
  breakEveryMin: number;
  breakMin: number;
}

export function startFocus(taskUids: string[], plan: FocusPlan) {
  const now = serverNow();
  // Materialise any virtual tasks so time can be tracked against them
  const tasks = useData.getState().tasks;
  const real = taskUids.filter((u) => tasks[u]);
  const state: FocusState = {
    uid: uid(),
    taskUids: real,
    workSec: Math.round(plan.workMin * 60),
    breakEverySec: Math.round(plan.breakEveryMin * 60),
    breakSec: Math.round(plan.breakMin * 60),
    status: 'running',
    anchorAt: now,
    phase: 'work',
    phaseElapsedSec: 0,
    workDoneSec: 0,
    workSinceBreakSec: 0,
    breaksTaken: 0,
    startedAt: now,
    endedAt: null,
    version: 0,
  };
  dispatch(
    { type: 'focus.set', data: { state, expectedVersion: 0 } },
    { type: 'prefs.set', data: { prefs: { focusDefaults: plan } } },
  );
}

export function focusAction(action: FocusAction) {
  const f = useData.getState().focus;
  if (!f) return;
  if (!isActive(f) && action.type !== 'setTasks') return;
  const next = applyFocusAction(f, action, serverNow());
  dispatch({ type: 'focus.set', data: { state: next, expectedVersion: f.version } });
}

export function setPrefs(prefs: Partial<Prefs>) {
  dispatch({ type: 'prefs.set', data: { prefs } });
}
