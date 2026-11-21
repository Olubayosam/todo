import { useCallback, useSyncExternalStore } from 'react';

// Remembers which sections are folded, per device (localStorage), and keeps
// every component using the same key in step.
const PREFIX = 'collapsed:';
const listeners = new Set<() => void>();

function read(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

export function useCollapsed(key: string, defaultCollapsed: boolean): [boolean, (next?: boolean) => void] {
  const collapsed = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read(key, defaultCollapsed),
    () => defaultCollapsed,
  );
  const set = useCallback(
    (next?: boolean) => {
      const value = next ?? !read(key, defaultCollapsed);
      try {
        localStorage.setItem(PREFIX + key, value ? '1' : '0');
      } catch {
        /* storage unavailable: still update in-memory listeners */
      }
      listeners.forEach((l) => l());
    },
    [key, defaultCollapsed],
  );
  return [collapsed, set];
}
