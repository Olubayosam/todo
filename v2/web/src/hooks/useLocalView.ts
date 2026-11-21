import { useState } from 'react';

/** List / cards preference, remembered per device (a phone may prefer list, a desktop cards). */
export function useLocalView(): ['list' | 'cards', (v: 'list' | 'cards') => void] {
  const [view, setView] = useState<'list' | 'cards'>(() => {
    try {
      return localStorage.getItem('taskView') === 'cards' ? 'cards' : 'list';
    } catch {
      return 'list';
    }
  });
  return [
    view,
    (v) => {
      setView(v);
      try {
        localStorage.setItem('taskView', v);
      } catch {
        /* ignore */
      }
    },
  ];
}
