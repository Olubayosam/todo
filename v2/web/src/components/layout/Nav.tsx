import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, CalendarRange, Grid3x3, Inbox, LogOut, Monitor, Moon, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Play, Plus, Search, Settings, Sun, Sunrise } from 'lucide-react';
import { useUI, type Route, type Theme } from '../../store/ui';
import { useData } from '../../store/data';
import { todayKey } from '../../lib/dates';
import { isActive } from '../../lib/focusEngine';
import { onSyncStatus, type SyncStatus } from '../../sync/engine';
import { Logo, MenuItem, Popover, Submark } from '../ui/bits';
import { logout } from '../../app/session';

interface NavItem {
  key: Route['name'];
  label: string;
  icon: typeof Sun;
  route: () => Route;
  count?: number;
}

function useNavItems(): NavItem[] {
  const tasks = useData((s) => s.tasks);
  return useMemo(() => {
    const today = todayKey();
    let todayCount = 0;
    let inboxCount = 0;
    for (const t of Object.values(tasks)) {
      if (t.done) continue;
      if (t.date === today) todayCount++;
      else if (t.date === null) inboxCount++;
    }
    return [
      { key: 'day', label: 'Today', icon: Sunrise, route: () => ({ name: 'day', date: todayKey() }), count: todayCount },
      { key: 'inbox', label: 'Inbox', icon: Inbox, route: () => ({ name: 'inbox' }), count: inboxCount },
      { key: 'week', label: 'Week', icon: CalendarRange, route: () => ({ name: 'week', date: todayKey() }) },
      { key: 'month', label: 'Month', icon: Grid3x3, route: () => ({ name: 'month', date: todayKey() }) },
      { key: 'insights', label: 'Insights', icon: BarChart3, route: () => ({ name: 'insights' }) },
    ];
  }, [tasks]);
}

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState<SyncStatus>('connecting');
  useEffect(() => {
    const off = onSyncStatus(setS);
    return () => void off();
  }, []);
  return s;
}

const STATUS_META: Record<SyncStatus, { label: string; color: string }> = {
  live: { label: 'Live sync', color: 'var(--cyan)' },
  polling: { label: 'Syncing', color: 'var(--cyan)' },
  connecting: { label: 'Connecting…', color: 'var(--gold)' },
  offline: { label: 'Offline — changes saved locally', color: 'var(--low)' },
  error: { label: 'Server problem — changes saved locally', color: 'var(--urgent)' },
};

export function SyncDot({ withLabel }: { withLabel?: boolean }) {
  const s = useSyncStatus();
  const m = STATUS_META[s];
  return (
    <span className="inline-flex items-center gap-2 text-xs text-fg-3" title={m.label}>
      <span className={`size-2 rounded-full ${s === 'connecting' ? 'animate-breathe' : ''}`} style={{ background: m.color }} />
      {withLabel && m.label}
    </span>
  );
}

function ThemeSwitch({ compact }: { compact?: boolean }) {
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  const opts: [Theme, typeof Sun, string][] = [
    ['light', Sun, 'Light'],
    ['dark', Moon, 'Dark'],
    ['system', Monitor, 'System'],
  ];
  if (compact) {
    const next: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    const Icon = opts.find((o) => o[0] === theme)![1];
    return (
      <button type="button" className="icon-btn" onClick={() => setTheme(next)} aria-label={`Theme: ${theme}`} title={`Theme: ${theme}`}>
        <Icon size={18} />
      </button>
    );
  }
  return (
    <div className="flex rounded-lg bg-sunken p-0.5" role="radiogroup" aria-label="Theme">
      {opts.map(([t, Icon, label]) => (
        <button key={t} type="button" role="radio" aria-checked={theme === t} aria-label={label} title={label} onClick={() => setTheme(t)} className={`grid h-7 flex-1 place-items-center rounded-md transition-colors ${theme === t ? 'bg-surface text-fg shadow-sm' : 'text-fg-3 hover:text-fg'}`}>
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}

/** Full sidebar, or an icon rail. `onToggle` (desktop) lets you fold/unfold it; tablet is always a rail. */
export function Sidebar({ rail, onToggle }: { rail: boolean; onToggle?: () => void }) {
  const route = useUI((s) => s.route);
  const navigate = useUI((s) => s.navigate);
  const set = useUI((s) => s.set);
  const items = useNavItems();
  const focusActive = useData((s) => isActive(s.focus));
  const isTodayRoute = route.name === 'day' && route.date === todayKey();

  return (
    <aside className={`sticky top-0 flex h-dvh shrink-0 flex-col border-r border-line bg-canvas transition-[width] duration-200 ${rail ? 'w-16 items-center px-2' : 'w-64 px-3'} py-4`}>
      <div className={`mb-6 flex ${rail ? 'flex-col items-center gap-3' : 'h-8 items-center justify-between pl-2'}`}>
        {rail ? <Submark className="h-6" /> : <Logo className="h-4.5" />}
        {onToggle && (
          <button type="button" onClick={onToggle} className="icon-btn size-8" aria-label={rail ? 'Expand menu' : 'Collapse menu'} title={rail ? 'Expand menu (Ctrl+\\)' : 'Collapse menu (Ctrl+\\)'}>
            {rail ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => useUI.getState().openQuickAdd(route.name === 'day' ? route.date : route.name === 'inbox' ? null : todayKey())}
        className={`btn btn-primary mb-2 ${rail ? 'size-10 p-0' : 'w-full justify-start'}`}
        aria-label="New task"
      >
        <Plus size={17} />
        {!rail && (
          <>
            <span>New task</span>
            <span className="kbd ml-auto border-white/15 bg-transparent text-on-ink/60">N</span>
          </>
        )}
      </button>
      <button
        type="button"
        onClick={() => set({ paletteOpen: true })}
        className={`btn btn-ghost mb-4 ${rail ? 'size-10 p-0' : 'w-full justify-start'}`}
        aria-label="Search and commands"
      >
        <Search size={17} />
        {!rail && (
          <>
            <span>Search</span>
            <span className="ml-auto flex gap-0.5">
              <span className="kbd">Ctrl</span>
              <span className="kbd">K</span>
            </span>
          </>
        )}
      </button>

      <nav className="flex w-full flex-col gap-0.5" aria-label="Main">
        {items.map((it) => {
          const active = it.key === 'day' ? isTodayRoute || route.name === 'day' : route.name === it.key;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => navigate(it.route())}
              aria-current={active ? 'page' : undefined}
              title={rail ? it.label : undefined}
              className={`group flex items-center gap-3 rounded-xl text-sm transition-colors ${rail ? 'size-10 justify-center' : 'h-9 px-3'} ${active ? 'bg-surface font-semibold text-fg shadow-sm ring-1 ring-line' : 'text-fg-2 hover:bg-hover hover:text-fg'}`}
            >
              <it.icon size={17} className={active ? 'text-gold' : ''} />
              {!rail && <span className="flex-1 text-left">{it.label}</span>}
              {!rail && !!it.count && <span className="text-xs text-fg-3 tabular">{it.count}</span>}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => (focusActive ? navigate({ name: 'focus' }) : set({ focusSetupOpen: true, focusSetupTasks: useUI.getState().selected }))}
        className={`btn mt-5 ${focusActive ? 'bg-cyan-soft text-cyan-fg' : 'btn-gold'} ${rail ? 'size-10 p-0' : 'w-full'}`}
        aria-label={focusActive ? 'Open focus session' : 'Start focus'}
      >
        <Play size={15} fill="currentColor" />
        {!rail && (focusActive ? 'Focus session' : 'Start focus')}
      </button>

      <div className="mt-auto flex w-full flex-col gap-2">
        {!rail && (
          <div className="px-2">
            <SyncDot withLabel />
          </div>
        )}
        {rail ? (
          <>
            <div className="grid place-items-center">
              <SyncDot />
            </div>
            <ThemeSwitch compact />
          </>
        ) : (
          <ThemeSwitch />
        )}
        <div className={`flex ${rail ? 'flex-col items-center' : 'items-center justify-between'} gap-1`}>
          <button type="button" className={rail ? 'icon-btn' : 'btn btn-ghost h-9 flex-1 justify-start px-3'} onClick={() => navigate({ name: 'settings' })} aria-label="Settings">
            <Settings size={17} />
            {!rail && 'Settings'}
          </button>
          <button type="button" className="icon-btn" onClick={() => void logout()} aria-label="Lock app" title="Lock">
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const route = useUI((s) => s.route);
  const navigate = useUI((s) => s.navigate);
  const set = useUI((s) => s.set);
  const focusActive = useData((s) => isActive(s.focus));
  const tab = (name: Route['name'], label: string, Icon: typeof Sun, r: () => Route) => {
    const active = route.name === name;
    return (
      <button type="button" onClick={() => navigate(r())} aria-current={active ? 'page' : undefined} className={`flex flex-1 flex-col items-center gap-1 py-2 text-[0.68rem] font-medium ${active ? 'text-fg' : 'text-fg-3'}`}>
        <Icon size={21} strokeWidth={active ? 2.2 : 1.8} className={active ? 'text-gold' : ''} />
        {label}
      </button>
    );
  };
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/90 backdrop-blur-xl" aria-label="Main">
      <div className="flex items-end px-2">
        {tab('day', 'Today', Sunrise, () => ({ name: 'day', date: todayKey() }))}
        {tab('week', 'Week', CalendarDays, () => ({ name: 'week', date: todayKey() }))}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={() => (focusActive ? navigate({ name: 'focus' }) : set({ focusSetupOpen: true, focusSetupTasks: useUI.getState().selected }))}
            className={`-mt-5 grid size-14 place-items-center rounded-full shadow-lg ring-4 ring-canvas transition-transform active:scale-95 ${focusActive ? 'bg-cyan text-carbon' : 'bg-gold text-carbon'}`}
            aria-label={focusActive ? 'Open focus session' : 'Start focus'}
          >
            <Play size={22} fill="currentColor" />
          </button>
        </div>
        {tab('inbox', 'Inbox', Inbox, () => ({ name: 'inbox' }))}
        <div className="flex flex-1 justify-center">
          <Popover
            side="top"
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} className={`flex flex-col items-center gap-1 py-2 text-[0.68rem] font-medium ${['month', 'insights', 'settings'].includes(route.name) ? 'text-fg' : 'text-fg-3'}`}>
                <MoreHorizontal size={21} />
                More
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={<Grid3x3 size={15} />} onClick={() => (close(), navigate({ name: 'month', date: todayKey() }))}>
                  Month
                </MenuItem>
                <MenuItem icon={<BarChart3 size={15} />} onClick={() => (close(), navigate({ name: 'insights' }))}>
                  Insights
                </MenuItem>
                <MenuItem icon={<Search size={15} />} onClick={() => (close(), set({ paletteOpen: true }))}>
                  Search
                </MenuItem>
                <MenuItem icon={<Settings size={15} />} onClick={() => (close(), navigate({ name: 'settings' }))}>
                  Settings
                </MenuItem>
                <div className="my-1 h-px bg-line" />
                <div className="px-2 py-1">
                  <ThemeSwitch />
                </div>
                <MenuItem icon={<LogOut size={15} />} onClick={() => (close(), void logout())}>
                  Lock
                </MenuItem>
              </>
            )}
          </Popover>
        </div>
      </div>
    </nav>
  );
}

export function MobileHeader() {
  return (
    <header className="safe-top sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/85 px-4 pb-3 backdrop-blur-xl [--safe-pt:1rem]">
      <Logo className="h-4" />
      <div className="flex items-center gap-1">
        <SyncDot />
        <button type="button" className="icon-btn" onClick={() => useUI.getState().set({ paletteOpen: true })} aria-label="Search">
          <Search size={19} />
        </button>
      </div>
    </header>
  );
}
