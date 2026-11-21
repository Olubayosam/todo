import type { Priority, RecurrenceRule } from './types';
import { addDays, fromKey, toKey, todayKey } from './dates';

export interface ParsedTask {
  text: string;
  /** undefined = not mentioned (use the current view's day); null = explicitly undated */
  date?: string | null;
  priority?: Priority;
  tags: string[];
  estimateMin?: number;
  dueTime?: string;
  rule?: RecurrenceRule;
  tokens: { kind: 'date' | 'time' | 'priority' | 'tag' | 'estimate' | 'repeat'; label: string }[];
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WD_RE = '(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|sday|nesday|rsday|urday)?';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';

function weekdayIndex(word: string): number {
  const w = word.toLowerCase().slice(0, 3);
  return WEEKDAYS.findIndex((d) => d.startsWith(w));
}

function nextWeekday(dow: number, today: string, includeToday = false): string {
  const cur = fromKey(today).getDay();
  let delta = (dow - cur + 7) % 7;
  if (delta === 0 && !includeToday) delta = 7;
  return addDays(today, delta);
}

function monthDay(month: number, day: number, today: string): string | undefined {
  const t = fromKey(today);
  let d = new Date(t.getFullYear(), month, day, 12);
  if (d.getMonth() !== month) return undefined;
  if (toKey(d) < today) d = new Date(t.getFullYear() + 1, month, day, 12);
  return toKey(d);
}

function to24h(h: number, m: number, ampm?: string): string | undefined {
  if (ampm) {
    const pm = ampm.toLowerCase().startsWith('p');
    if (h < 1 || h > 12) return undefined;
    h = (h % 12) + (pm ? 12 : 0);
  }
  if (h > 23 || m > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseTask(input: string, today = todayKey()): ParsedTask {
  let s = ` ${input} `;
  const out: ParsedTask = { text: '', tags: [], tokens: [] };

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = s.match(re);
    if (!m || m.index === undefined) return;
    if (fn(m) === false) return;
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
  };

  // Priority: !urgent !high !medium !low  or !1..!4 / !p1..!p4
  take(/\s!(urgent|u|p1|1|high|h|p2|2|medium|med|m|p3|3|low|l|p4|4)(?=\s)/i, (m) => {
    const v = m[1].toLowerCase();
    out.priority = ['urgent', 'u', 'p1', '1'].includes(v) ? 'urgent' : ['high', 'h', 'p2', '2'].includes(v) ? 'high' : ['medium', 'med', 'm', 'p3', '3'].includes(v) ? 'medium' : 'low';
    out.tokens.push({ kind: 'priority', label: out.priority[0].toUpperCase() + out.priority.slice(1) });
  });

  // Tags: #deep-work
  for (let i = 0; i < 10; i++) {
    const before = s;
    take(/\s#([\p{L}\p{N}_-]{1,40})(?=\s)/u, (m) => {
      out.tags.push(m[1]);
      out.tokens.push({ kind: 'tag', label: `#${m[1]}` });
    });
    if (s === before) break;
  }

  // Estimate: ~30m ~1h ~1h30 ~1.5h ~90
  take(/\s~(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)?(?:\s*(\d+)\s*m?)?(?=\s)/i, (m) => {
    const n = parseFloat(m[1]);
    const unit = (m[2] || 'm').toLowerCase();
    let min = unit.startsWith('h') ? n * 60 : n;
    if (m[3]) min += parseInt(m[3], 10);
    if (!min || min > 1440) return false;
    out.estimateMin = Math.round(min);
    out.tokens.push({ kind: 'estimate', label: `~${out.estimateMin >= 60 ? `${Math.floor(out.estimateMin / 60)}h${out.estimateMin % 60 ? ` ${out.estimateMin % 60}m` : ''}` : `${out.estimateMin}m`}` });
  });

  // Repeat: every day / daily / weekdays / every mon, wed / every 2 weeks / monthly
  take(new RegExp(`\\s(?:every\\s+(\\d+\\s+)?(day|days|weekday|weekdays|week|weeks|month|months|(?:${WD_RE}(?:\\s*(?:,|and|&)\\s*${WD_RE})*))|(daily|weekly|monthly|weekdays))(?=\\s)`, 'i'), (m) => {
    const n = m[1] ? parseInt(m[1], 10) : 1;
    const word = (m[2] || m[m.length - 1] || '').toLowerCase();
    let rule: RecurrenceRule;
    if (/^(day|days|daily)$/.test(word)) rule = { freq: 'daily', interval: n };
    else if (/^weekdays?$/.test(word)) rule = { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] };
    else if (/^(week|weeks|weekly)$/.test(word)) rule = { freq: 'weekly', interval: n, byDay: [fromKey(today).getDay()] };
    else if (/^(month|months|monthly)$/.test(word)) rule = { freq: 'monthly', interval: n };
    else {
      const days = [...word.matchAll(new RegExp(WD_RE, 'gi'))].map((x) => weekdayIndex(x[0])).filter((x) => x >= 0);
      if (!days.length) return false;
      rule = { freq: 'weekly', interval: n, byDay: [...new Set(days)] };
    }
    out.rule = rule;
    out.tokens.push({ kind: 'repeat', label: 'Repeats' });
  });

  // Time: 7am, 7:30pm, at 19:30
  take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s)|\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/i, (m) => {
    const t = m[1] ? to24h(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0, m[3]) : to24h(parseInt(m[4], 10), parseInt(m[5], 10));
    if (!t) return false;
    out.dueTime = t;
    out.tokens.push({ kind: 'time', label: t });
  });

  // Dates
  const setDate = (d: string | null | undefined, label: string) => {
    if (d === undefined) return false;
    out.date = d;
    out.tokens.push({ kind: 'date', label });
    return true;
  };
  const dateRules: [RegExp, (m: RegExpMatchArray) => boolean][] = [
    [/\s(?:on\s+)?(today|tonight)(?=\s)/i, () => setDate(today, 'Today')],
    [/\s(?:on\s+)?(tomorrow|tmrw|tmr)(?=\s)/i, () => setDate(addDays(today, 1), 'Tomorrow')],
    [/\s(someday|no date)(?=\s)/i, () => setDate(null, 'Inbox')],
    [/\snext\s+week(?=\s)/i, () => setDate(nextWeekday(1, today), 'Next week')],
    [/\sin\s+(\d{1,3})\s+(day|days|week|weeks)(?=\s)/i, (m) => {
      const n = parseInt(m[1], 10) * (m[2].toLowerCase().startsWith('w') ? 7 : 1);
      return setDate(addDays(today, n), `In ${m[1]} ${m[2]}`);
    }],
    [/\s(\d{4})-(\d{2})-(\d{2})(?=\s)/, (m) => setDate(`${m[1]}-${m[2]}-${m[3]}`, `${m[3]}/${m[2]}`)],
    [new RegExp(`\\s(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON_RE}(?=\\s)`, 'i'), (m) => {
      const mi = MONTHS.indexOf(m[2].toLowerCase().slice(0, 3));
      return setDate(monthDay(mi, parseInt(m[1], 10), today), `${m[1]} ${m[2].slice(0, 3)}`);
    }],
    [new RegExp(`\\s(?:on\\s+)?${MON_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?=\\s)`, 'i'), (m) => {
      const mi = MONTHS.indexOf(m[1].toLowerCase().slice(0, 3));
      return setDate(monthDay(mi, parseInt(m[2], 10), today), `${m[2]} ${m[1].slice(0, 3)}`);
    }],
    [/\s(\d{1,2})\/(\d{1,2})(?=\s)/, (m) => setDate(monthDay(parseInt(m[2], 10) - 1, parseInt(m[1], 10), today), `${m[1]}/${m[2]}`)],
    [new RegExp(`\\s(?:on\\s+|this\\s+|next\\s+)?${WD_RE}(?=\\s)`, 'i'), (m) => {
      const i = weekdayIndex(m[1]);
      if (i < 0) return false;
      return setDate(nextWeekday(i, today), WEEKDAYS[i][0].toUpperCase() + WEEKDAYS[i].slice(1, 3));
    }],
  ];
  if (!out.rule) {
    for (const [re, fn] of dateRules) {
      let matched = false;
      take(re, (m) => (matched = fn(m)));
      if (matched) break;
    }
  }

  out.text = s.replace(/\s+/g, ' ').trim();
  return out;
}
