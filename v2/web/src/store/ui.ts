import { create } from 'zustand';
import { todayKey } from '../lib/dates';

export type Route =
  | { name: 'day'; date: string }
  | { name: 'week'; date: string }
  | { name: 'month'; date: string }
  | { name: 'inbox' }
  | { name: 'insights' }
  | { name: 'settings' }
  | { name: 'focus' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const date = parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) ? parts[1] : todayKey();
  switch (parts[0]) {
    case 'day':
      return { name: 'day', date };
    case 'week':
      return { name: 'week', date };
    case 'month':
      return { name: 'month', date };
    case 'inbox':
      return { name: 'inbox' };
    case 'insights':
      return { name: 'insights' };
    case 'settings':
      return { name: 'settings' };
    case 'focus':
      return { name: 'focus' };
    default:
      return { name: 'day', date: todayKey() };
  }
}

export function routeHash(r: Route): string {
  switch (r.name) {
    case 'day':
      return r.date === todayKey() ? '#/today' : `#/day/${r.date}`;
    case 'week':
    case 'month':
      return `#/${r.name}/${r.date}`;
    default:
      return `#/${r.name}`;
  }
}

export type Theme = 'system' | 'light' | 'dark';
export type ToastKind = 'info' | 'success' | 'error';
export interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
  action?: { label: string; run: () => void };
}

interface UIState {
  route: Route;
  /** Task open in the detail panel */
  openTaskUid: string | null;
  /** Multi-select for starting focus on several tasks */
  selecting: boolean;
  selected: string[];
  quickAddOpen: boolean;
  quickAddDate: string | null | undefined;
  paletteOpen: boolean;
  focusSetupOpen: boolean;
  focusSetupTasks: string[];
  planDayOpen: boolean;
  reviewOpen: boolean;
  shortcutsOpen: boolean;
  miniTimerHidden: boolean;
  theme: Theme;
  toasts: Toast[];
  navigate: (r: Route) => void;
  openTask: (uid: string | null) => void;
  setSelecting: (on: boolean) => void;
  toggleSelected: (uid: string) => void;
  clearSelection: () => void;
  openQuickAdd: (date?: string | null) => void;
  set: (p: Partial<UIState>) => void;
  setTheme: (t: Theme) => void;
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

function readBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function applyTheme(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

let toastId = 0;

export const useUI = create<UIState>()((set) => ({
  route: parseHash(location.hash),
  openTaskUid: null,
  selecting: false,
  selected: [],
  quickAddOpen: false,
  quickAddDate: undefined,
  paletteOpen: false,
  focusSetupOpen: false,
  focusSetupTasks: [],
  planDayOpen: false,
  reviewOpen: false,
  shortcutsOpen: false,
  miniTimerHidden: readBool('miniTimerHidden'),
  theme: readTheme(),
  toasts: [],
  navigate: (r) => {
    const h = routeHash(r);
    if (location.hash !== h) history.pushState(null, '', h);
    set({ route: r });
  },
  openTask: (uid) => set({ openTaskUid: uid }),
  setSelecting: (on) => set({ selecting: on, selected: on ? [] : [] }),
  toggleSelected: (uid) =>
    set((s) => ({ selected: s.selected.includes(uid) ? s.selected.filter((x) => x !== uid) : [...s.selected, uid], selecting: true })),
  clearSelection: () => set({ selected: [], selecting: false }),
  openQuickAdd: (date) => set({ quickAddOpen: true, quickAddDate: date }),
  set: (p) => set(p),
  setTheme: (t) => {
    try {
      if (t === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', t);
    } catch {
      /* ignore */
    }
    applyTheme(t);
    set({ theme: t });
  },
}));

window.addEventListener('popstate', () => useUI.setState({ route: parseHash(location.hash) }));
window.addEventListener('hashchange', () => useUI.setState({ route: parseHash(location.hash) }));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(useUI.getState().theme));

export function toast(text: string, kind: ToastKind = 'info', action?: Toast['action']) {
  const id = ++toastId;
  useUI.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind, action }] }));
  setTimeout(() => useUI.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), action ? 6000 : 3500);
}

export function setMiniTimerHidden(hidden: boolean) {
  try {
    localStorage.setItem('miniTimerHidden', hidden ? '1' : '0');
  } catch {
    /* ignore */
  }
  useUI.setState({ miniTimerHidden: hidden });
}
