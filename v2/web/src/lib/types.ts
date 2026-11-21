export type Priority = 'urgent' | 'high' | 'medium' | 'low';

export interface Task {
  uid: string;
  text: string;
  done: boolean;
  /** Local YYYY-MM-DD, or null for Inbox (undated) */
  date: string | null;
  priority: Priority;
  position: number;
  notes: string | null;
  /** HH:MM */
  dueTime: string | null;
  estimateMin: number | null;
  trackedSec: number;
  /** Set when a task rolled over: the day it was first planned for */
  originalDate: string | null;
  recurrenceUid: string | null;
  completedAt: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  tagUids: string[];
  /** Client-only: a not-yet-materialised future occurrence of a recurring task */
  virtual?: boolean;
}

export interface Subtask {
  uid: string;
  taskUid: string;
  text: string;
  done: boolean;
  position: number;
}

export type TagColor = 'cyan' | 'gold' | 'rose' | 'violet' | 'green' | 'blue' | 'orange' | 'slate';

export interface Tag {
  uid: string;
  name: string;
  color: TagColor;
  position: number;
}

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly';
  interval: number;
  /** 0 = Sunday … 6 = Saturday */
  byDay?: number[];
}

export interface Recurrence {
  uid: string;
  text: string;
  priority: Priority;
  notes: string | null;
  dueTime: string | null;
  estimateMin: number | null;
  tagUids: string[];
  rule: RecurrenceRule;
  startDate: string;
  endDate: string | null;
  active: boolean;
}

export interface Skip {
  recurrenceUid: string;
  date: string;
}

export interface DailyNote {
  date: string;
  content: string | null;
  mood: number | null;
  reviewed: boolean;
}

export interface MusicTrack {
  uid: string;
  title: string;
  mime: string;
  size: number;
  position: number;
}

export interface FocusState {
  uid: string;
  taskUids: string[];
  workSec: number;
  breakEverySec: number;
  breakSec: number;
  status: 'running' | 'paused' | 'completed' | 'cancelled';
  anchorAt: number;
  phase: 'work' | 'break';
  phaseElapsedSec: number;
  workDoneSec: number;
  workSinceBreakSec: number;
  breaksTaken: number;
  startedAt: number;
  endedAt: number | null;
  note?: string | null;
  version: number;
}

export interface Prefs {
  name?: string;
  timezone?: string;
  dailyCapacityMin?: number;
  focusDefaults?: { workMin: number; breakEveryMin: number; breakMin: number };
  lastPlanDate?: string;
  view?: 'list' | 'cards';
  ambient?: 'rain' | 'brown' | 'waves' | 'none';
}

export interface Change {
  id: number;
  entity: 'task' | 'subtask' | 'tag' | 'recurrence' | 'skip' | 'note' | 'prefs' | 'focus' | 'music';
  key: string;
  op: 'upsert' | 'delete';
  data: unknown;
  clientId: string | null;
}

export interface BootstrapPayload {
  cursor: number;
  serverNow: number;
  tasks: Task[];
  subtasks: Subtask[];
  tags: Tag[];
  recurrences: Recurrence[];
  skips: Skip[];
  notes: DailyNote[];
  prefs: Prefs;
  focus: FocusState | null;
  music: MusicTrack[];
  vapidPublicKey: string | null;
}

export type Op =
  | { type: 'task.upsert'; data: Partial<Task> & { uid: string } }
  | { type: 'task.delete'; data: { uid: string } }
  | { type: 'task.reorder'; data: { uids: string[] } }
  | { type: 'subtask.upsert'; data: Partial<Subtask> & { uid: string; taskUid: string } }
  | { type: 'subtask.delete'; data: { uid: string } }
  | { type: 'tag.upsert'; data: Tag }
  | { type: 'tag.delete'; data: { uid: string } }
  | { type: 'recurrence.upsert'; data: Recurrence }
  | { type: 'recurrence.delete'; data: { uid: string } }
  | { type: 'recurrence.skip'; data: { uid: string; date: string } }
  | { type: 'note.upsert'; data: Partial<DailyNote> & { date: string } }
  | { type: 'prefs.set'; data: { prefs: Partial<Prefs> } }
  | { type: 'focus.set'; data: { state: FocusState; expectedVersion: number } }
  | { type: 'music.update'; data: { uid: string; title?: string; position?: number } }
  | { type: 'music.delete'; data: { uid: string } }
  | { type: 'push.subscribe'; data: { endpoint: string; keys: { p256dh: string; auth: string }; device: string } }
  | { type: 'push.unsubscribe'; data: { endpoint: string } };

export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low'];

export const PRIORITY_META: Record<Priority, { label: string; short: string; rank: number }> = {
  urgent: { label: 'Urgent', short: 'P1', rank: 0 },
  high: { label: 'High', short: 'P2', rank: 1 },
  medium: { label: 'Medium', short: 'P3', rank: 2 },
  low: { label: 'Low', short: 'P4', rank: 3 },
};
