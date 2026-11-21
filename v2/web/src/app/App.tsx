import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useUI } from '../store/ui';
import { useData } from '../store/data';
import { useSession } from './session';
import { Login } from './Login';
import { MobileHeader, MobileNav, Sidebar } from '../components/layout/Nav';
import { DayView } from '../views/DayView';
import { WeekView } from '../views/WeekView';
import { MonthView } from '../views/MonthView';
import { InboxView } from '../views/InboxView';
import { FocusMiniCard } from '../focus/FocusMiniCard';
import { FocusController } from '../focus/FocusController';
import { FocusSetupDialog } from '../focus/FocusSetupDialog';
import { PipHost } from '../focus/pip';
import { YouTubeDock } from '../focus/YouTubeDock';
import { useCollapsed } from '../hooks/useCollapsed';
import { TaskDetail } from '../components/tasks/TaskDetail';
import { QuickAdd } from '../components/tasks/QuickAdd';
import { Dialog } from '../components/ui/Dialog';
import { Toasts } from '../components/ui/Toasts';
import { ShortcutsDialog, useGlobalShortcuts } from '../components/Shortcuts';
import { PlanDayDialog } from '../components/planning/PlanDayDialog';
import { ReviewDialog } from '../components/planning/ReviewDialog';
import { useIsDesktop, useIsPhone, useIsWide, useMediaQuery } from '../hooks/useMediaQuery';
import { relativeDay, todayKey } from '../lib/dates';
import { isActive } from '../lib/focusEngine';
import type { Task } from '../lib/types';
import { Submark } from '../components/ui/bits';

// Heavier, less frequently used screens load on demand (and are precached for offline)
const InsightsView = lazy(() => import('../views/InsightsView').then((m) => ({ default: m.InsightsView })));
const SettingsView = lazy(() => import('../views/SettingsView').then((m) => ({ default: m.SettingsView })));
const FocusPage = lazy(() => import('../focus/FocusPage').then((m) => ({ default: m.FocusPage })));
const CommandPalette = lazy(() => import('../components/CommandPalette').then((m) => ({ default: m.CommandPalette })));

function useResolvedTask(uid: string | null): Task | undefined {
  const recurrences = useData((s) => s.recurrences);
  return useMemo(() => {
    if (!uid?.startsWith('virtual:')) return undefined;
    const [recUid, date] = uid.slice(8).split('|');
    const r = recurrences[recUid];
    if (!r) return undefined;
    return {
      uid,
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
      createdAt: null,
      updatedAt: null,
      tagUids: r.tagUids,
      virtual: true,
    };
  }, [uid, recurrences]);
}

function DetailHost({ inline }: { inline: boolean }) {
  const uid = useUI((s) => s.openTaskUid);
  const openTask = useUI((s) => s.openTask);
  const virtualTask = useResolvedTask(uid);
  const exists = useData((s) => (uid ? !!s.tasks[uid] : false));
  const close = () => openTask(null);
  useEffect(() => {
    // the task was deleted (here or elsewhere)
    if (uid && !exists && !virtualTask) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, exists, virtualTask]);

  if (inline) {
    if (!uid) return null;
    return (
      <aside className="sticky top-0 h-dvh w-105 shrink-0 border-l border-line bg-raised animate-fade-up" aria-label="Task details">
        <TaskDetail key={uid} uid={uid} virtualTask={virtualTask} onClose={close} />
      </aside>
    );
  }
  return (
    <Dialog open={!!uid} onClose={close} variant="auto" label="Task details" className="sm:h-[min(44rem,85dvh)]">
      {uid && <TaskDetail key={uid} uid={uid} virtualTask={virtualTask} onClose={close} />}
    </Dialog>
  );
}

function QuickAddDialog() {
  const open = useUI((s) => s.quickAddOpen);
  const date = useUI((s) => s.quickAddDate);
  const set = useUI((s) => s.set);
  const d = date === undefined ? todayKey() : date;
  return (
    <Dialog open={open} onClose={() => set({ quickAddOpen: false })} label="New task" className="sm:mt-[14vh] sm:self-start">
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h2 className="text-sm font-semibold">New task · <span className="font-normal text-fg-3">{d ? relativeDay(d) : 'Inbox'}</span></h2>
        <button type="button" className="icon-btn size-8" onClick={() => set({ quickAddOpen: false })} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="p-3 pt-2">{open && <QuickAdd date={d} autoFocus onDone={() => set({ quickAddOpen: false })} />}</div>
    </Dialog>
  );
}

function SelectionBar() {
  const selecting = useUI((s) => s.selecting);
  const selected = useUI((s) => s.selected);
  const set = useUI((s) => s.set);
  const clear = useUI((s) => s.clearSelection);
  if (!selecting) return null;
  return (
    <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 sm:bottom-6">
      <div className="flex items-center gap-2 rounded-2xl bg-ink py-2 pl-4 pr-2 text-on-ink shadow-lg animate-fade-up">
        <span className="text-sm">{selected.length ? `${selected.length} selected` : 'Select tasks to focus on'}</span>
        <button type="button" disabled={!selected.length} onClick={() => set({ focusSetupOpen: true, focusSetupTasks: selected })} className="btn btn-gold h-9 px-3.5">
          Focus on {selected.length || ''}
        </button>
        <button type="button" onClick={clear} className="grid size-9 place-items-center rounded-xl text-on-ink/70 hover:bg-white/10" aria-label="Cancel selection">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/** Loads the palette the first time it's opened, then keeps it mounted for its close animation. */
function PaletteGate() {
  const open = useUI((s) => s.paletteOpen);
  const [loaded, setLoaded] = useState(open);
  if (open && !loaded) setLoaded(true);
  return loaded ? (
    <Suspense fallback={null}>
      <CommandPalette />
    </Suspense>
  ) : null;
}

function Main() {
  const route = useUI((s) => s.route);
  switch (route.name) {
    case 'day':
      return <DayView date={route.date} />;
    case 'week':
      return <WeekView date={route.date} />;
    case 'month':
      return <MonthView date={route.date} />;
    case 'inbox':
      return <InboxView />;
    case 'insights':
      return <InsightsView />;
    case 'settings':
      return <SettingsView />;
    case 'focus':
      return null;
  }
}

function Shell() {
  const phone = useIsPhone();
  const desktop = useIsDesktop();
  const wide = useIsWide();
  const tablet = useMediaQuery('(min-width: 640px)') && !desktop;
  const route = useUI((s) => s.route);
  const selecting = useUI((s) => s.selecting);
  const focusActive = useData((s) => isActive(s.focus));
  const openUid = useUI((s) => s.openTaskUid);
  // Desktop: foldable sidebar (remembered). Tablet: always the icon rail.
  const [sidebarFolded, toggleSidebar] = useCollapsed('sidebar', false);
  useGlobalShortcuts();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);

  // Keep the URL in sync on first load (e.g. "/#/" -> "#/today")
  useEffect(() => {
    if (!location.hash) history.replaceState(null, '', '#/today');
  }, []);

  return (
    <div className="flex min-h-dvh">
      {!phone && <Sidebar rail={tablet || sidebarFolded} onToggle={desktop ? () => toggleSidebar() : undefined} />}
      <div className="flex min-w-0 flex-1 flex-col">
        {phone && <MobileHeader />}
        <main key={route.name} className="flex-1 animate-fade-up">
          <Suspense fallback={null}>
            <Main />
          </Suspense>
        </main>
      </div>
      {wide && openUid && <DetailHost inline />}
      {!(wide && openUid) && <DetailHost inline={false} />}
      {phone && route.name !== 'focus' && <MobileNav />}
      {phone && route.name !== 'focus' && !selecting && !focusActive && (
        <button type="button" onClick={() => useUI.getState().openQuickAdd(route.name === 'day' ? route.date : route.name === 'inbox' ? null : todayKey())} className="fixed bottom-24 right-4 z-30 grid size-12 place-items-center rounded-2xl bg-ink text-on-ink shadow-lg active:scale-95" aria-label="New task">
          <Plus size={22} />
        </button>
      )}
      <Suspense fallback={<div className="fixed inset-0 z-50 bg-carbon" />}>{route.name === 'focus' && <FocusPage />}</Suspense>
      <FocusMiniCard />
      <SelectionBar />
      <PipHost active={focusActive} />
      <YouTubeDock />
      <QuickAddDialog />
      <FocusSetupDialog />
      <PlanDayDialog />
      <ReviewDialog />
      <PaletteGate />
      <ShortcutsDialog />
      <FocusController />
    </div>
  );
}

export function App() {
  const status = useSession((s) => s.status);
  return (
    <>
      {status === 'locked' ? (
        <Login />
      ) : status === 'starting' ? (
        <div className="grid min-h-dvh place-items-center bg-canvas">
          <Submark className="h-10 animate-breathe" />
        </div>
      ) : (
        <Shell />
      )}
      <Toasts />
    </>
  );
}
