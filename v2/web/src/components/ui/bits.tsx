import { Check, Flag, Repeat } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PRIORITY_META, type Priority, type Tag, type TagColor } from '../../lib/types';

export const PRIORITY_COLOR: Record<Priority, string> = {
  urgent: 'var(--urgent)',
  high: 'var(--gold)',
  medium: 'var(--cyan)',
  low: 'var(--low)',
};

export const PRIORITY_TEXT: Record<Priority, string> = {
  urgent: 'var(--urgent-fg)',
  high: 'var(--gold-fg)',
  medium: 'var(--cyan-fg)',
  low: 'var(--fg-3)',
};

export const TAG_HEX: Record<TagColor, string> = {
  cyan: '#4fd1c5',
  gold: '#c9a24d',
  rose: '#e06c8b',
  violet: '#8b7cf6',
  green: '#4caf7d',
  blue: '#4c8df6',
  orange: '#e8894a',
  slate: '#8b8d92',
};

export function Checkbox({
  checked,
  priority = 'low',
  onChange,
  label,
  size = 20,
}: {
  checked: boolean;
  priority?: Priority;
  onChange: () => void;
  label: string;
  size?: number;
}) {
  const color = PRIORITY_COLOR[priority];
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className="group/check relative grid shrink-0 place-items-center rounded-full transition-[background-color,border-color,transform] duration-200 hover:scale-105"
      style={{
        width: size,
        height: size,
        border: `1.75px solid ${checked ? 'var(--cyan)' : color}`,
        background: checked ? 'var(--cyan)' : `color-mix(in oklab, ${color} 10%, transparent)`,
        animation: checked ? 'check-pop 0.3s var(--ease-out-soft)' : undefined,
      }}
    >
      <Check
        size={size * 0.62}
        strokeWidth={3}
        className={`text-carbon transition-opacity ${checked ? 'opacity-100' : 'opacity-0 group-hover/check:opacity-40'}`}
        style={checked ? undefined : { color }}
      />
    </button>
  );
}

export function PriorityChip({ priority, compact = false }: { priority: Priority; compact?: boolean }) {
  if (priority === 'low' && compact) return null;
  return (
    <span className="chip" style={{ color: PRIORITY_TEXT[priority], background: `color-mix(in oklab, ${PRIORITY_COLOR[priority]} 14%, transparent)` }}>
      <Flag size={11} strokeWidth={2.5} fill="currentColor" />
      {compact ? PRIORITY_META[priority].short : PRIORITY_META[priority].label}
    </span>
  );
}

export function TagChip({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  const c = TAG_HEX[tag.color] ?? TAG_HEX.slate;
  return (
    <span className="chip text-fg-2" style={{ background: `color-mix(in oklab, ${c} 13%, transparent)` }}>
      <span className="size-1.5 rounded-full" style={{ background: c }} />
      {tag.name}
      {onRemove && (
        <button type="button" onClick={onRemove} className="-mr-1 ml-0.5 text-fg-3 hover:text-fg" aria-label={`Remove tag ${tag.name}`}>
          ×
        </button>
      )}
    </span>
  );
}

export function RepeatIcon() {
  return <Repeat size={12} className="text-fg-3" aria-label="Repeats" />;
}

/** Lightweight anchored menu: closes on outside click, Escape or selection. */
export function Popover({
  trigger,
  children,
  align = 'end',
  side = 'bottom',
  className = '',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          className={`absolute z-50 min-w-48 rounded-xl border border-line bg-raised p-1 shadow-lg animate-fade-up ${align === 'end' ? 'right-0' : 'left-0'} ${side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5'} ${className}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  active,
  hint,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  hint?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-hover ${danger ? 'text-urgent-fg' : active ? 'text-fg font-medium' : 'text-fg-2'}`}
    >
      {icon && <span className="grid w-4 place-items-center">{icon}</span>}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-xs text-fg-3">{hint}</span>}
    </button>
  );
}

export function Logo({ className = 'h-5' }: { className?: string }) {
  return (
    <span className={`relative inline-block ${className}`} role="img" aria-label="Olubayosam">
      <img src="brand/wordmark-on-light.svg" alt="" className="h-full w-auto dark:hidden" />
      <img src="brand/wordmark-on-dark.svg" alt="" className="hidden h-full w-auto dark:block" />
    </span>
  );
}

export function Submark({ className = 'h-6' }: { className?: string }) {
  return <img src="brand/submark.svg" alt="" className={className} />;
}

export function ProgressRing({ value, size = 44, stroke = 3.5, color = 'var(--cyan)', track = 'var(--line)', children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          style={{ transition: 'stroke-dashoffset 0.6s var(--ease-out-soft)' }}
        />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  );
}
