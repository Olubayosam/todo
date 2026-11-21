import { useEffect, useState } from 'react';
import { useData } from '../store/data';
import { serverNow } from '../lib/api';
import { isActive, simulate, type FocusSnapshot } from '../lib/focusEngine';
import type { FocusState } from '../lib/types';

/** Live snapshot of the current focus session, re-rendering ~4x a second while active. */
export function useFocusSnapshot(): { focus: FocusState | null; snap: FocusSnapshot | null; active: boolean } {
  const focus = useData((s) => s.focus);
  const active = isActive(focus);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active || focus?.status !== 'running') return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [active, focus?.status]);
  return { focus, snap: focus ? simulate(focus, serverNow()) : null, active };
}
