import { useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { BarChart3, CalendarRange, CheckCircle2, Circle, Grid3x3, Inbox, Keyboard, MoonStar, Play, Plus, Settings, SunMoon, Sunrise } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { useUI } from '../store/ui';
import { useData } from '../store/data';
import { relativeDay, todayKey } from '../lib/dates';
import { createTasksFromText } from '../sync/actions';
import { PRIORITY_COLOR } from './ui/bits';
import { isActive } from '../lib/focusEngine';

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  const set = useUI((s) => s.set);
  const navigate = useUI((s) => s.navigate);
  const openTask = useUI((s) => s.openTask);
  const tasks = useData((s) => s.tasks);
  const focusActive = useData((s) => isActive(s.focus));
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    return Object.values(tasks)
      .filter((t) => t.text.toLowerCase().includes(needle) || t.notes?.toLowerCase().includes(needle))
      .sort((a, b) => Number(a.done) - Number(b.done) || (b.date ?? '9').localeCompare(a.date ?? '9'))
      .slice(0, 20);
  }, [tasks, q]);

  const close = () => {
    set({ paletteOpen: false });
    setQ('');
  };
  const run = (fn: () => void) => {
    close();
    fn();
  };

  const item = 'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-fg-2 data-[selected=true]:bg-hover data-[selected=true]:text-fg';
  const group = '[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3';

  return (
    <Dialog open={open} onClose={close} variant="center" label="Search and commands" className="sm:mt-[12vh] sm:self-start">
      <Command label="Search and commands" shouldFilter={true} loop className="flex min-h-0 flex-col">
        <Command.Input value={q} onValueChange={setQ} autoFocus placeholder="Search tasks or type a command…" className="h-14 border-b border-line bg-transparent px-5 text-[0.95rem] outline-none placeholder:text-fg-3" />
        <Command.List className="scroll-thin max-h-[min(60vh,28rem)] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-fg-3">No matches.</Command.Empty>
          {q.trim().length > 1 && (
            <Command.Group heading="Create" className={group}>
              <Command.Item value={`create ${q}`} onSelect={() => run(() => createTasksFromText(q, { date: todayKey() }))} className={item}>
                <Plus size={16} className="text-gold-fg" /> Add “{q.trim()}” to today
              </Command.Item>
            </Command.Group>
          )}
          {results.length > 0 && (
            <Command.Group heading="Tasks" className={group}>
              {results.map((t) => (
                <Command.Item
                  key={t.uid}
                  value={`task ${t.text} ${t.uid}`}
                  onSelect={() =>
                    run(() => {
                      navigate(t.date ? { name: 'day', date: t.date } : { name: 'inbox' });
                      openTask(t.uid);
                    })
                  }
                  className={item}
                >
                  {t.done ? <CheckCircle2 size={16} className="text-cyan-fg" /> : <Circle size={16} style={{ color: PRIORITY_COLOR[t.priority] }} />}
                  <span className={`min-w-0 flex-1 truncate ${t.done ? 'line-through opacity-60' : ''}`}>{t.text}</span>
                  <span className="text-xs text-fg-3">{t.date ? relativeDay(t.date) : 'Inbox'}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          <Command.Group heading="Go to" className={group}>
            <Command.Item onSelect={() => run(() => navigate({ name: 'day', date: todayKey() }))} className={item}>
              <Sunrise size={16} /> Today <span className="kbd ml-auto">T</span>
            </Command.Item>
            <Command.Item onSelect={() => run(() => navigate({ name: 'inbox' }))} className={item}>
              <Inbox size={16} /> Inbox <span className="kbd ml-auto">I</span>
            </Command.Item>
            <Command.Item onSelect={() => run(() => navigate({ name: 'week', date: todayKey() }))} className={item}>
              <CalendarRange size={16} /> Week <span className="kbd ml-auto">W</span>
            </Command.Item>
            <Command.Item onSelect={() => run(() => navigate({ name: 'month', date: todayKey() }))} className={item}>
              <Grid3x3 size={16} /> Month <span className="kbd ml-auto">M</span>
            </Command.Item>
            <Command.Item onSelect={() => run(() => navigate({ name: 'insights' }))} className={item}>
              <BarChart3 size={16} /> Insights
            </Command.Item>
            <Command.Item onSelect={() => run(() => navigate({ name: 'settings' }))} className={item}>
              <Settings size={16} /> Settings
            </Command.Item>
          </Command.Group>
          <Command.Group heading="Actions" className={group}>
            <Command.Item onSelect={() => run(() => useUI.getState().openQuickAdd(todayKey()))} className={item}>
              <Plus size={16} /> New task <span className="kbd ml-auto">N</span>
            </Command.Item>
            <Command.Item onSelect={() => run(() => (focusActive ? navigate({ name: 'focus' }) : set({ focusSetupOpen: true, focusSetupTasks: [] })))} className={item}>
              <Play size={16} /> {focusActive ? 'Open focus mode' : 'Start focus session'} <span className="kbd ml-auto">F</span>
            </Command.Item>
            <Command.Item onSelect={() => run(() => set({ planDayOpen: true }))} className={item}>
              <Sunrise size={16} /> Plan the day
            </Command.Item>
            <Command.Item onSelect={() => run(() => set({ reviewOpen: true }))} className={item}>
              <MoonStar size={16} /> Review the day
            </Command.Item>
            <Command.Item
              onSelect={() =>
                run(() => {
                  const ui = useUI.getState();
                  ui.setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
                })
              }
              className={item}
            >
              <SunMoon size={16} /> Toggle dark mode
            </Command.Item>
            <Command.Item onSelect={() => run(() => set({ shortcutsOpen: true }))} className={item}>
              <Keyboard size={16} /> Keyboard shortcuts <span className="kbd ml-auto">?</span>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </Dialog>
  );
}
