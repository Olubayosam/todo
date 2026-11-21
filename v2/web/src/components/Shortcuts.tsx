import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { useUI } from '../store/ui';
import { useData } from '../store/data';
import { addDays, addMonths, todayKey } from '../lib/dates';
import { isActive } from '../lib/focusEngine';
import { focusAction } from '../sync/actions';

const LIST: [string[], string][] = [
  [['N'], 'New task'],
  [['Ctrl', 'K'], 'Search & commands'],
  [['/'], 'Search'],
  [['T'], 'Today'],
  [['I'], 'Inbox'],
  [['W'], 'Week'],
  [['M'], 'Month'],
  [['[', ']'], 'Previous / next day or period'],
  [['F'], 'Start focus / open focus mode'],
  [['P'], 'Pause / resume focus'],
  [['S'], 'Select tasks for focus'],
  [['Esc'], 'Close panel / leave focus mode'],
  [['?'], 'This list'],
];

export function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState();
      const target = e.target as HTMLElement | null;
      const typing = !!target?.closest('input, textarea, select, [contenteditable="true"]');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.set({ paletteOpen: !ui.paletteOpen });
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      const r = ui.route;
      const focus = useData.getState().focus;
      switch (e.key) {
        case 'n':
        case 'N':
          e.preventDefault();
          ui.openQuickAdd(r.name === 'day' ? r.date : r.name === 'inbox' ? null : todayKey());
          break;
        case '/':
          e.preventDefault();
          ui.set({ paletteOpen: true });
          break;
        case 't':
          ui.navigate({ name: 'day', date: todayKey() });
          break;
        case 'i':
          ui.navigate({ name: 'inbox' });
          break;
        case 'w':
          ui.navigate({ name: 'week', date: r.name === 'day' ? r.date : todayKey() });
          break;
        case 'm':
          ui.navigate({ name: 'month', date: r.name === 'day' || r.name === 'week' ? r.date : todayKey() });
          break;
        case '[':
        case ']': {
          const dir = e.key === ']' ? 1 : -1;
          if (r.name === 'day') ui.navigate({ name: 'day', date: addDays(r.date, dir) });
          else if (r.name === 'week') ui.navigate({ name: 'week', date: addDays(r.date, dir * 7) });
          else if (r.name === 'month') ui.navigate({ name: 'month', date: addMonths(r.date.slice(0, 8) + '01', dir) });
          break;
        }
        case 'f':
          if (r.name === 'focus') break;
          if (isActive(focus)) ui.navigate({ name: 'focus' });
          else ui.set({ focusSetupOpen: true, focusSetupTasks: ui.selected });
          break;
        case 'p':
          if (isActive(focus)) focusAction({ type: focus.status === 'running' ? 'pause' : 'resume' });
          break;
        case 's':
          ui.setSelecting(!ui.selecting);
          break;
        case '?':
          ui.set({ shortcutsOpen: true });
          break;
        case 'Escape':
          if (ui.openTaskUid) ui.openTask(null);
          else if (ui.selecting) ui.clearSelection();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen);
  const set = useUI((s) => s.set);
  return (
    <Dialog open={open} onClose={() => set({ shortcutsOpen: false })} label="Keyboard shortcuts" variant="center">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
        <button type="button" className="icon-btn" onClick={() => set({ shortcutsOpen: false })} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <ul className="grid gap-x-6 gap-y-1 p-5 sm:grid-cols-2">
        {LIST.map(([keys, label]) => (
          <li key={label} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span className="text-fg-2">{label}</span>
            <span className="flex gap-1">
              {keys.map((k) => (
                <span key={k} className="kbd">
                  {k}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
