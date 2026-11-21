import { create } from 'zustand';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import type { BootstrapPayload, Change, DailyNote, FocusState, MusicTrack, Op, Prefs, Recurrence, Subtask, Tag, Task } from '../lib/types';

export interface DataState {
  ready: boolean;
  tasks: Record<string, Task>;
  subtasks: Record<string, Subtask>;
  tags: Record<string, Tag>;
  recurrences: Record<string, Recurrence>;
  /** keys "recurrenceUid|date" */
  skips: Record<string, true>;
  notes: Record<string, DailyNote>;
  prefs: Prefs;
  focus: FocusState | null;
  music: Record<string, MusicTrack>;
  cursor: number;
  vapidPublicKey: string | null;
  lastSyncedAt: number | null;
}

const empty: DataState = {
  ready: false,
  tasks: {},
  subtasks: {},
  tags: {},
  recurrences: {},
  skips: {},
  notes: {},
  prefs: {},
  focus: null,
  music: {},
  cursor: 0,
  vapidPublicKey: null,
  lastSyncedAt: null,
};

const byKey = <T,>(list: T[], key: (x: T) => string) => Object.fromEntries(list.map((x) => [key(x), x]));

function defaultTask(uid: string): Task {
  return {
    uid,
    text: '',
    done: false,
    date: null,
    priority: 'low',
    position: 0,
    notes: null,
    dueTime: null,
    estimateMin: null,
    trackedSec: 0,
    originalDate: null,
    recurrenceUid: null,
    completedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tagUids: [],
  };
}

/** Pure reducer mirroring the server's handling of each op (optimistic UI). */
export function reduceOp(s: DataState, op: Op): Partial<DataState> {
  switch (op.type) {
    case 'task.upsert': {
      const prev = s.tasks[op.data.uid] ?? defaultTask(op.data.uid);
      const next: Task = { ...prev, ...op.data, updatedAt: Date.now() };
      delete next.virtual;
      if ('done' in op.data) next.completedAt = op.data.done ? (op.data.completedAt ?? Date.now()) : null;
      return { tasks: { ...s.tasks, [next.uid]: next } };
    }
    case 'task.delete': {
      const t = s.tasks[op.data.uid];
      const tasks = { ...s.tasks };
      delete tasks[op.data.uid];
      const subtasks = Object.fromEntries(Object.entries(s.subtasks).filter(([, x]) => x.taskUid !== op.data.uid));
      const skips = t?.recurrenceUid && t.date ? { ...s.skips, [`${t.recurrenceUid}|${t.date}`]: true as const } : s.skips;
      return { tasks, subtasks, skips };
    }
    case 'task.reorder': {
      const tasks = { ...s.tasks };
      op.data.uids.forEach((uid, i) => {
        if (tasks[uid]) tasks[uid] = { ...tasks[uid], position: i };
      });
      return { tasks };
    }
    case 'subtask.upsert': {
      const prev = s.subtasks[op.data.uid] ?? { uid: op.data.uid, taskUid: op.data.taskUid, text: '', done: false, position: 0 };
      return { subtasks: { ...s.subtasks, [op.data.uid]: { ...prev, ...op.data } } };
    }
    case 'subtask.delete': {
      const subtasks = { ...s.subtasks };
      delete subtasks[op.data.uid];
      return { subtasks };
    }
    case 'tag.upsert':
      return { tags: { ...s.tags, [op.data.uid]: op.data } };
    case 'tag.delete': {
      const tags = { ...s.tags };
      delete tags[op.data.uid];
      const tasks = Object.fromEntries(
        Object.entries(s.tasks).map(([k, t]) => [k, t.tagUids.includes(op.data.uid) ? { ...t, tagUids: t.tagUids.filter((x) => x !== op.data.uid) } : t]),
      );
      return { tags, tasks };
    }
    case 'recurrence.upsert':
      return { recurrences: { ...s.recurrences, [op.data.uid]: op.data } };
    case 'recurrence.delete': {
      const recurrences = { ...s.recurrences };
      delete recurrences[op.data.uid];
      const tasks = Object.fromEntries(
        Object.entries(s.tasks).map(([k, t]) => [k, t.recurrenceUid === op.data.uid ? { ...t, recurrenceUid: null } : t]),
      );
      return { recurrences, tasks };
    }
    case 'recurrence.skip':
      return { skips: { ...s.skips, [`${op.data.uid}|${op.data.date}`]: true } };
    case 'note.upsert': {
      const prev = s.notes[op.data.date] ?? { date: op.data.date, content: null, mood: null, reviewed: false };
      return { notes: { ...s.notes, [op.data.date]: { ...prev, ...op.data } } };
    }
    case 'prefs.set':
      return { prefs: { ...s.prefs, ...op.data.prefs } };
    case 'focus.set':
      return { focus: { ...op.data.state, version: op.data.expectedVersion + 1 } };
    case 'music.update': {
      const prev = s.music[op.data.uid];
      if (!prev) return {};
      return { music: { ...s.music, [op.data.uid]: { ...prev, ...op.data } } };
    }
    case 'music.delete': {
      const music = { ...s.music };
      delete music[op.data.uid];
      return { music };
    }
    default:
      return {};
  }
}

/** Applies a server change (from SSE / polling / another tab). */
export function reduceChange(s: DataState, c: Change): Partial<DataState> {
  const del = c.op === 'delete';
  switch (c.entity) {
    case 'task': {
      const tasks = { ...s.tasks };
      if (del) {
        delete tasks[c.key];
        const subtasks = Object.fromEntries(Object.entries(s.subtasks).filter(([, x]) => x.taskUid !== c.key));
        return { tasks, subtasks };
      }
      tasks[c.key] = c.data as Task;
      return { tasks };
    }
    case 'subtask': {
      const subtasks = { ...s.subtasks };
      if (del) delete subtasks[c.key];
      else subtasks[c.key] = c.data as Subtask;
      return { subtasks };
    }
    case 'tag': {
      if (del) return reduceOp(s, { type: 'tag.delete', data: { uid: c.key } });
      return { tags: { ...s.tags, [c.key]: c.data as Tag } };
    }
    case 'recurrence': {
      if (del) {
        const recurrences = { ...s.recurrences };
        delete recurrences[c.key];
        return { recurrences };
      }
      return { recurrences: { ...s.recurrences, [c.key]: c.data as Recurrence } };
    }
    case 'skip':
      return { skips: { ...s.skips, [c.key]: true } };
    case 'note':
      return { notes: { ...s.notes, [c.key]: c.data as DailyNote } };
    case 'prefs':
      return { prefs: c.data as Prefs };
    case 'focus': {
      const f = c.data as FocusState;
      // Ignore stale versions (e.g. an old session finishing after a new one started)
      if (s.focus && s.focus.uid === f.uid && s.focus.version > f.version) return {};
      if (s.focus && s.focus.uid !== f.uid && (s.focus.status === 'running' || s.focus.status === 'paused') && f.startedAt < s.focus.startedAt) return {};
      return { focus: f };
    }
    case 'music': {
      const music = { ...s.music };
      if (del) delete music[c.key];
      else music[c.key] = c.data as MusicTrack;
      return { music };
    }
  }
  return {};
}

interface DataActions {
  hydrate: (p: BootstrapPayload) => void;
  applyOps: (ops: Op[]) => void;
  applyChanges: (changes: Change[], skipClientId?: string) => void;
  replaceTask: (oldUid: string, task: Task) => void;
  setCursor: (cursor: number) => void;
  reset: () => void;
}

export const useData = create<DataState & DataActions>()((set) => ({
  ...empty,
  hydrate: (p) =>
    set({
      ready: true,
      tasks: byKey(p.tasks, (t) => t.uid),
      subtasks: byKey(p.subtasks, (t) => t.uid),
      tags: byKey(p.tags, (t) => t.uid),
      recurrences: byKey(p.recurrences, (t) => t.uid),
      skips: Object.fromEntries(p.skips.map((k) => [`${k.recurrenceUid}|${k.date}`, true as const])),
      notes: byKey(p.notes, (n) => n.date),
      prefs: p.prefs ?? {},
      focus: p.focus,
      music: byKey(p.music, (m) => m.uid),
      cursor: p.cursor,
      vapidPublicKey: p.vapidPublicKey,
      lastSyncedAt: Date.now(),
    }),
  applyOps: (ops) =>
    set((s) => {
      let next: DataState = s;
      for (const op of ops) next = { ...next, ...reduceOp(next, op) };
      return next;
    }),
  applyChanges: (changes, skipClientId) =>
    set((s) => {
      let next: DataState = s;
      for (const c of changes) {
        if (c.id > next.cursor) next = { ...next, cursor: c.id };
        if (skipClientId && c.clientId === skipClientId) continue;
        next = { ...next, ...reduceChange(next, c) };
      }
      return { ...next, lastSyncedAt: Date.now() };
    }),
  replaceTask: (oldUid, task) =>
    set((s) => {
      const tasks = { ...s.tasks };
      delete tasks[oldUid];
      tasks[task.uid] = task;
      return { tasks };
    }),
  setCursor: (cursor) => set((s) => (cursor > s.cursor ? { cursor, lastSyncedAt: Date.now() } : { lastSyncedAt: Date.now() })),
  reset: () => set({ ...empty }),
}));

// --- Offline snapshot ---------------------------------------------------------
const SNAPSHOT_KEY = 'todo_v2_snapshot';
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export async function loadSnapshot(): Promise<boolean> {
  try {
    const snap = (await idbGet(SNAPSHOT_KEY)) as Partial<DataState> | undefined;
    if (!snap || !snap.tasks) return false;
    useData.setState({ ...snap, ready: true });
    return true;
  } catch {
    return false;
  }
}

export function startSnapshotPersistence() {
  return useData.subscribe((s) => {
    if (!s.ready) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { tasks, subtasks, tags, recurrences, skips, notes, prefs, focus, music, cursor, vapidPublicKey, lastSyncedAt } = useData.getState();
      idbSet(SNAPSHOT_KEY, { tasks, subtasks, tags, recurrences, skips, notes, prefs, focus, music, cursor, vapidPublicKey, lastSyncedAt }).catch(() => {});
    }, 400);
  });
}

export async function clearSnapshot() {
  try {
    await idbSet(SNAPSHOT_KEY, undefined);
  } catch {
    /* ignore */
  }
}

