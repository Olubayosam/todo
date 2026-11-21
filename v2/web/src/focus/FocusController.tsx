import { useEffect, useRef } from 'react';
import { useData } from '../store/data';
import { serverNow } from '../lib/api';
import { isActive, simulate } from '../lib/focusEngine';
import { formatDuration } from '../lib/dates';
import { focusAction } from '../sync/actions';
import { chime } from './audio';
import { showNotification } from './notify';
import { stop as stopMusic, usePlayer } from './player';
import { toast } from '../store/ui';

/**
 * Headless: watches the focus session and, at each phase boundary,
 * chimes + notifies (one tab per browser, via a Web Lock), marks the session
 * complete when work time is used up, and stops the music when it ends.
 * Uses the same notification tags as server push, so the two never duplicate.
 */
let notifier = false;
if (typeof navigator !== 'undefined' && 'locks' in navigator) {
  void navigator.locks.request('todo-v2-notifier', () => {
    notifier = true;
    return new Promise<void>(() => {}); // hold for the life of the tab
  });
} else notifier = true;

export function FocusController() {
  const focus = useData((s) => s.focus);
  const tasks = useData((s) => s.tasks);
  const fired = useRef(new Set<string>());
  const lastStatus = useRef<string | null>(null);

  // Stop music when a session ends (here or on another device)
  useEffect(() => {
    const st = focus ? `${focus.uid}:${focus.status}` : null;
    if (lastStatus.current && st !== lastStatus.current && focus && !isActive(focus) && usePlayer.getState().playing) stopMusic(3);
    lastStatus.current = st;
  }, [focus]);

  useEffect(() => {
    if (!focus || focus.status !== 'running') return;
    let timer: ReturnType<typeof setTimeout>;
    const names = focus.taskUids.map((u) => tasks[u]?.text).filter(Boolean) as string[];
    const label = names.length ? (names.length > 1 ? `${names[0]} +${names.length - 1} more` : names[0]) : 'your focus session';

    const tick = () => {
      const now = serverNow();
      const snap = simulate(focus, now);
      if (snap.completed) {
        const key = `${focus.uid}-done`;
        if (!fired.current.has(key)) {
          fired.current.add(key);
          if (notifier) {
            chime('done');
            void showNotification('Focus session complete', `You focused for ${formatDuration(focus.workSec)}. Well done.`, `focus-${focus.uid}-done`);
          }
          toast('Focus session complete — well done', 'success');
          if (notifier) focusAction({ type: 'complete' });
        }
        return;
      }
      const next = snap.events[0];
      if (!next) return;
      const wait = Math.max(0, next.at - now);
      timer = setTimeout(() => {
        const key = `${focus.uid}-${next.tag}`;
        if (!fired.current.has(key) && next.type !== 'done') {
          fired.current.add(key);
          if (notifier) {
            if (next.type === 'break') {
              chime('break');
              void showNotification('Time for a break', `Step away for ${formatDuration(next.breakSec ?? 0)}. ${formatDuration(next.workLeftSec ?? 0)} of focus left.`, `focus-${focus.uid}-${next.tag}`);
            } else {
              chime('work');
              void showNotification('Break is over', `Back to ${label}.`, `focus-${focus.uid}-${next.tag}`);
            }
          }
        }
        tick();
      }, Math.min(wait + 30, 2 ** 31 - 1));
    };
    tick();
    // Background tabs throttle timers; re-check when the tab becomes visible
    const onVis = () => {
      clearTimeout(timer);
      tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [focus, tasks]);

  return null;
}
