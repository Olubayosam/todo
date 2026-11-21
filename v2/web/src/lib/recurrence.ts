import type { Recurrence, RecurrenceRule, Task } from './types';
import { addDays, diffDays, fromKey, startOfWeek, todayKey } from './dates';

/** Mirror of rule_matches() in api/lib/data.php — keep both in sync. */
export function ruleMatches(rule: RecurrenceRule, start: string, date: string): boolean {
  if (date < start) return false;
  const interval = Math.max(1, rule.interval || 1);
  const days = diffDays(start, date);
  const d = fromKey(date);
  const s = fromKey(start);
  switch (rule.freq) {
    case 'daily':
      return days % interval === 0;
    case 'weekly': {
      const byDay = rule.byDay?.length ? rule.byDay : [s.getDay()];
      if (!byDay.includes(d.getDay())) return false;
      const weeks = Math.floor(diffDays(startOfWeek(start), startOfWeek(date)) / 7);
      return weeks % interval === 0;
    }
    case 'monthly': {
      const months = d.getFullYear() * 12 + d.getMonth() - (s.getFullYear() * 12 + s.getMonth());
      if (months % interval !== 0) return false;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return d.getDate() === Math.min(s.getDate(), last);
    }
  }
  return false;
}

/**
 * Virtual (not yet stored) occurrences for future days in [from, to].
 * Today and past instances are materialised by the server.
 */
export function virtualOccurrences(
  recs: Recurrence[],
  skips: Set<string>,
  existing: Set<string>,
  from: string,
  to: string,
): Task[] {
  const out: Task[] = [];
  const today = todayKey();
  const start = from > today ? from : addDays(today, 1);
  for (const r of recs) {
    if (!r.active) continue;
    for (let d = start; d <= to; d = addDays(d, 1)) {
      if (r.endDate && d > r.endDate) break;
      const key = `${r.uid}|${d}`;
      if (skips.has(key) || existing.has(key) || !ruleMatches(r.rule, r.startDate, d)) continue;
      out.push({
        uid: `virtual:${key}`,
        text: r.text,
        done: false,
        date: d,
        priority: r.priority,
        position: 0,
        notes: r.notes,
        dueTime: r.dueTime,
        estimateMin: r.estimateMin,
        trackedSec: 0,
        originalDate: null,
        recurrenceUid: r.uid,
        completedAt: null,
        createdAt: null,
        updatedAt: null,
        tagUids: r.tagUids,
        virtual: true,
      });
    }
  }
  return out;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeRule(rule: RecurrenceRule): string {
  const n = rule.interval > 1 ? rule.interval : 0;
  if (rule.freq === 'daily') return n ? `Every ${n} days` : 'Every day';
  if (rule.freq === 'monthly') return n ? `Every ${n} months` : 'Every month';
  const days = rule.byDay ?? [];
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  let label: string;
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) label = 'weekdays';
  else if (days.length === 7) label = 'day';
  else label = sorted.map((d) => DOW[d]).join(', ') || 'week';
  return n ? `Every ${n} weeks · ${label}` : `Every ${label}`;
}
