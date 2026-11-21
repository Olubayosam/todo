import { useMemo } from 'react';
import { useData } from '../store/data';
import { virtualOccurrences } from '../lib/recurrence';
import { PRIORITY_META, type Task } from '../lib/types';
import { addDays, todayKey } from '../lib/dates';

export function compareTasks(a: Task, b: Task): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.done && b.done) return (b.completedAt ?? 0) - (a.completedAt ?? 0);
  const pr = PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
  if (pr) return pr;
  if (a.position !== b.position) return a.position - b.position;
  if (a.dueTime && b.dueTime && a.dueTime !== b.dueTime) return a.dueTime < b.dueTime ? -1 : 1;
  return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

/** Map of date -> tasks (real + virtual recurring) for [from, to]. */
export function useTasksInRange(from: string, to: string): Record<string, Task[]> {
  const tasks = useData((s) => s.tasks);
  const recurrences = useData((s) => s.recurrences);
  const skips = useData((s) => s.skips);
  return useMemo(() => {
    const out: Record<string, Task[]> = {};
    for (let d = from; d <= to; d = addDays(d, 1)) out[d] = [];
    const existing = new Set<string>();
    for (const t of Object.values(tasks)) {
      if (t.recurrenceUid && t.date) existing.add(`${t.recurrenceUid}|${t.date}`);
      if (t.date && t.date >= from && t.date <= to) out[t.date].push(t);
    }
    if (to > todayKey()) {
      const virt = virtualOccurrences(Object.values(recurrences), new Set(Object.keys(skips)), existing, from, to);
      for (const v of virt) out[v.date!]?.push(v);
    }
    for (const k of Object.keys(out)) out[k].sort(compareTasks);
    return out;
  }, [tasks, recurrences, skips, from, to]);
}

export function useDayTasks(date: string): Task[] {
  return useTasksInRange(date, date)[date] ?? [];
}

export function useInboxTasks(): Task[] {
  const tasks = useData((s) => s.tasks);
  return useMemo(() => Object.values(tasks).filter((t) => t.date === null).sort(compareTasks), [tasks]);
}

export function useTask(uid: string | null): Task | null {
  return useData((s) => (uid ? (s.tasks[uid] ?? null) : null));
}

export function useSubtasks(taskUid: string) {
  const subtasks = useData((s) => s.subtasks);
  return useMemo(() => Object.values(subtasks).filter((s) => s.taskUid === taskUid).sort((a, b) => a.position - b.position), [subtasks, taskUid]);
}

export function useSubtaskCounts(): Record<string, { done: number; total: number }> {
  const subtasks = useData((s) => s.subtasks);
  return useMemo(() => {
    const out: Record<string, { done: number; total: number }> = {};
    for (const s of Object.values(subtasks)) {
      const c = (out[s.taskUid] ??= { done: 0, total: 0 });
      c.total++;
      if (s.done) c.done++;
    }
    return out;
  }, [subtasks]);
}

/** Tasks that rolled over onto today and haven't been reviewed yet. */
export function useRolledOver(): Task[] {
  const tasks = useData((s) => s.tasks);
  return useMemo(() => {
    const today = todayKey();
    return Object.values(tasks)
      .filter((t) => t.date === today && !t.done && t.originalDate && t.originalDate < today)
      .sort(compareTasks);
  }, [tasks]);
}
