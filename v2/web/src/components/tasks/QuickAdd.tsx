import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Clock, CornerDownLeft, Flag, Hash, Plus, Repeat, Timer } from 'lucide-react';
import { parseTask } from '../../lib/parse';
import { PRIORITIES, PRIORITY_META, type Priority } from '../../lib/types';
import { createTasksFromText } from '../../sync/actions';
import { relativeDay } from '../../lib/dates';
import { MenuItem, Popover, PRIORITY_COLOR } from '../ui/bits';
import { toast } from '../../store/ui';

const TOKEN_ICON = { date: CalendarDays, time: Clock, priority: Flag, tag: Hash, estimate: Timer, repeat: Repeat } as const;

export function QuickAdd({
  date,
  autoFocus,
  onDone,
  compact,
}: {
  /** Default date for tasks without a date in the text (null = Inbox) */
  date: string | null;
  autoFocus?: boolean;
  onDone?: () => void;
  compact?: boolean;
}) {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<Priority>('low');
  const [focused, setFocused] = useState(!!autoFocus);
  const ref = useRef<HTMLTextAreaElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(blurTimer.current), []);
  const firstLine = text.split('\n').find((l) => l.trim()) ?? '';
  const parsed = useMemo(() => parseTask(firstLine), [firstLine]);
  const lineCount = text.split('\n').filter((l) => l.trim()).length;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const submit = () => {
    if (!text.trim()) return;
    const n = createTasksFromText(text, { date, priority: priority === 'low' ? undefined : priority });
    if (n > 1) toast(`Added ${n} tasks`, 'success');
    setText('');
    setPriority('low');
    onDone?.();
  };

  const expanded = focused || !!text;

  return (
    <div
      className={`rounded-2xl border bg-surface transition-[border-color,box-shadow] ${expanded ? 'border-line-strong shadow-md' : 'border-line shadow-sm'}`}
      onClick={() => ref.current?.focus()}
    >
      <div className="flex items-start gap-3 px-4 pt-3">
        <Plus size={18} className={`mt-0.5 shrink-0 transition-colors ${expanded ? 'text-gold' : 'text-fg-3'}`} />
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            clearTimeout(blurTimer.current);
            setFocused(true);
          }}
          // Collapse after the click that caused the blur has completed, otherwise the
          // layout shift moves the list under the pointer and the click misses its target.
          onBlur={() => {
            blurTimer.current = setTimeout(() => setFocused(false), 220);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              setText('');
              (e.target as HTMLTextAreaElement).blur();
              onDone?.();
            }
          }}
          placeholder={compact ? 'Add a task…' : 'Add a task — try "Draft proposal tomorrow 9am !high #work ~45m"'}
          aria-label="New task"
          className="min-h-6 w-full resize-none bg-transparent pb-3 text-[0.95rem] leading-6 outline-none placeholder:text-fg-3"
        />
      </div>
      {expanded && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2" onMouseDown={(e) => e.preventDefault()}>
          {parsed.tokens.map((t, i) => {
            const Icon = TOKEN_ICON[t.kind];
            const label = t.kind === 'date' && parsed.date ? relativeDay(parsed.date) : t.label;
            return (
              <span key={i} className="chip bg-cyan-soft text-cyan-fg">
                <Icon size={11} />
                {label}
              </span>
            );
          })}
          {lineCount > 1 && <span className="chip bg-gold-soft text-gold-fg">{lineCount} tasks</span>}
          {!parsed.tokens.length && lineCount <= 1 && (
            <span className="hidden text-xs text-fg-3 md:inline">
              Dates, <span className="font-mono">9am</span>, <span className="font-mono">!high</span>, <span className="font-mono">#tag</span>, <span className="font-mono">~30m</span>, <span className="font-mono">every mon</span> · one task per line
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {!parsed.priority && (
              <Popover
                side="top"
                trigger={({ toggle }) => (
                  <button type="button" onClick={toggle} className="btn btn-ghost h-8 px-2.5 text-xs" aria-label="Priority">
                    <Flag size={14} fill={PRIORITY_COLOR[priority]} color={PRIORITY_COLOR[priority]} />
                    <span className="hidden sm:inline">{PRIORITY_META[priority].label}</span>
                  </button>
                )}
              >
                {(close) =>
                  PRIORITIES.map((p) => (
                    <MenuItem key={p} active={p === priority} icon={<Flag size={14} fill={PRIORITY_COLOR[p]} color={PRIORITY_COLOR[p]} />} onClick={() => (setPriority(p), close())}>
                      {PRIORITY_META[p].label}
                    </MenuItem>
                  ))
                }
              </Popover>
            )}
            <button type="button" onClick={submit} disabled={!text.trim()} className="btn btn-primary h-8 px-3 text-xs">
              Add <CornerDownLeft size={13} className="opacity-60" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
