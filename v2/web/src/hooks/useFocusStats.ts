import { useEffect } from 'react';
import { create } from 'zustand';
import { api } from '../lib/api';
import { addDays, todayKey } from '../lib/dates';
import { useData } from '../store/data';

interface StatsState {
  byDate: Record<string, number>;
  loadedAt: number;
  loading: boolean;
}

const useStats = create<StatsState>()(() => ({ byDate: {}, loadedAt: 0, loading: false }));

async function load() {
  if (useStats.getState().loading) return;
  useStats.setState({ loading: true });
  try {
    const res = await api<{ focus: { date: string; sec: number }[] }>('stats', { query: { from: addDays(todayKey(), -371), to: addDays(todayKey(), 1) } });
    useStats.setState({ byDate: Object.fromEntries(res.focus.map((f) => [f.date, f.sec])), loadedAt: Date.now(), loading: false });
  } catch {
    useStats.setState({ loading: false });
  }
}

/** Focus seconds per local date (last ~year). Refreshes when a focus session changes. */
export function useFocusStats(): Record<string, number> {
  const focusKey = useData((s) => (s.focus ? `${s.focus.uid}:${s.focus.version}:${s.focus.status}` : ''));
  const byDate = useStats((s) => s.byDate);
  useEffect(() => {
    const t = setTimeout(load, 800);
    return () => clearTimeout(t);
  }, [focusKey]);
  return byDate;
}
