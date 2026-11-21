// All task dates are local calendar days as 'YYYY-MM-DD' strings.
// (The original app used toISOString(), which is UTC and could put tasks on
// the wrong day in the evening / early morning.)

export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // noon avoids DST edge cases
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function addMonths(key: string, n: number): string {
  const d = fromKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toKey(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86400000);
}

/** Monday-based week start */
export function startOfWeek(key: string): string {
  const d = fromKey(key);
  const dow = (d.getDay() + 6) % 7;
  return addDays(key, -dow);
}

export function startOfMonth(key: string): string {
  return key.slice(0, 8) + '01';
}

export function weekDays(key: string): string[] {
  const s = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

/** 6x7 grid covering the month (Monday first) */
export function monthGrid(key: string): string[] {
  const first = startOfWeek(startOfMonth(key));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = JSON.stringify(opts);
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, opts);
    fmtCache.set(k, f);
  }
  return f;
}

export function formatDay(key: string, opts: Intl.DateTimeFormatOptions): string {
  return fmt(opts).format(fromKey(key));
}

/** "Today", "Tomorrow", "Yesterday", weekday within a week, else "Mon 3 Dec" */
export function relativeDay(key: string, today = todayKey()): string {
  const n = diffDays(today, key);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return formatDay(key, { weekday: 'long' });
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return formatDay(key, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatDuration(sec: number, opts: { compact?: boolean } = {}): string {
  const m = Math.round(sec / 60);
  if (m < 60) return opts.compact ? `${m}m` : `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return h ? `${h}:${mm}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
}
