import type { FocusState } from './types';

/**
 * Deterministic focus timeline. Mirror of focus_simulate() in api/lib/focus.php
 * — keep both in sync so every device and the push scheduler agree.
 */
export interface FocusEvent {
  at: number;
  type: 'break' | 'work' | 'done';
  tag: string;
  breakSec?: number;
  workLeftSec?: number;
}

export interface FocusSnapshot {
  phase: 'work' | 'break';
  phaseRemainingSec: number;
  phaseTotalSec: number;
  workDoneSec: number;
  workSinceBreakSec: number;
  phaseElapsedSec: number;
  breaksTaken: number;
  completed: boolean;
  completedAt: number | null;
  events: FocusEvent[];
  workRemainingSec: number;
  /** Seconds of work until the next break, or null if no more breaks */
  nextBreakInSec: number | null;
  /** Estimated wall-clock end (server ms) */
  endsAt: number | null;
}

export function simulate(s: FocusState, now: number): FocusSnapshot {
  const workSec = s.workSec;
  const every = s.breakEverySec || 0;
  const breakSec = s.breakSec || 0;
  let phase = s.phase;
  let phaseElapsed = s.phaseElapsedSec || 0;
  let workDone = s.workDoneSec || 0;
  let sinceBreak = s.workSinceBreakSec || 0;
  let breaks = s.breaksTaken || 0;
  const running = s.status === 'running';
  let t = running ? Math.max(0, (now - s.anchorAt) / 1000) : 0;
  let clock = s.anchorAt;
  let completedAt: number | null = null;
  let current: Omit<FocusSnapshot, 'completed' | 'completedAt' | 'events' | 'workRemainingSec' | 'nextBreakInSec' | 'endsAt'> | null = null;
  const events: FocusEvent[] = [];
  const breaksOn = every > 0 && breakSec > 0;

  for (let i = 0; i < 2000; i++) {
    if (phase === 'work') {
      const remainingWork = Math.max(0, workSec - workDone);
      const blockLeft = breaksOn ? Math.min(remainingWork, Math.max(0, every - sinceBreak)) : remainingWork;
      if (current === null && t < blockLeft) {
        current = {
          phase: 'work',
          phaseRemainingSec: blockLeft - t,
          phaseTotalSec: phaseElapsed + blockLeft,
          workDoneSec: workDone + t,
          workSinceBreakSec: sinceBreak + t,
          phaseElapsedSec: phaseElapsed + t,
          breaksTaken: breaks,
        };
      }
      clock += blockLeft * 1000;
      if (current === null) t -= blockLeft;
      workDone += blockLeft;
      sinceBreak += blockLeft;
      if (workDone >= workSec - 0.001) {
        events.push({ at: Math.round(clock), type: 'done', tag: 'done' });
        if (current === null) completedAt = Math.round(clock);
        break;
      }
      events.push({ at: Math.round(clock), type: 'break', tag: `b${breaks + 1}`, breakSec, workLeftSec: workSec - workDone });
      phase = 'break';
      phaseElapsed = 0;
      sinceBreak = 0;
    } else {
      const left = Math.max(0, breakSec - phaseElapsed);
      if (current === null && t < left) {
        current = {
          phase: 'break',
          phaseRemainingSec: left - t,
          phaseTotalSec: phaseElapsed + left,
          workDoneSec: workDone,
          workSinceBreakSec: 0,
          phaseElapsedSec: phaseElapsed + t,
          breaksTaken: breaks,
        };
      }
      clock += left * 1000;
      if (current === null) t -= left;
      breaks++;
      events.push({ at: Math.round(clock), type: 'work', tag: `w${breaks}`, workLeftSec: workSec - workDone });
      phase = 'work';
      phaseElapsed = 0;
    }
  }

  const done = current === null;
  const cur = current ?? {
    phase: 'work' as const,
    phaseRemainingSec: 0,
    phaseTotalSec: 0,
    workDoneSec: workSec,
    workSinceBreakSec: 0,
    phaseElapsedSec: 0,
    breaksTaken: breaks,
  };
  const future = events.filter((e) => e.at > now);
  const doneEvent = events.find((e) => e.type === 'done');
  // When paused, events are relative to the anchor, so shift them to "now"
  const pausedShift = running ? 0 : now - s.anchorAt;
  const workRemainingSec = Math.max(0, workSec - cur.workDoneSec);
  let nextBreakInSec: number | null = null;
  if (cur.phase === 'work' && breaksOn && !done) {
    const untilBreak = every - cur.workSinceBreakSec;
    nextBreakInSec = untilBreak < workRemainingSec ? untilBreak : null;
  }
  return {
    ...cur,
    completed: done,
    completedAt,
    events: running ? future : events.map((e) => ({ ...e, at: e.at + pausedShift })),
    workRemainingSec,
    nextBreakInSec,
    endsAt: doneEvent ? doneEvent.at + pausedShift : null,
  };
}

/** Re-anchors the session at `now` so a change can be applied from the current position. */
export function anchorAt(s: FocusState, now: number): FocusState {
  const snap = simulate(s, now);
  return {
    ...s,
    anchorAt: now,
    phase: snap.phase,
    phaseElapsedSec: snap.phaseElapsedSec,
    workDoneSec: snap.workDoneSec,
    workSinceBreakSec: snap.workSinceBreakSec,
    breaksTaken: snap.breaksTaken,
  };
}

export type FocusAction =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'skipBreak' }
  | { type: 'breakNow' }
  | { type: 'addWork'; sec: number }
  | { type: 'extendBreak'; sec: number }
  | { type: 'setTasks'; taskUids: string[] }
  | { type: 'complete' }
  | { type: 'cancel' };

export function applyFocusAction(s: FocusState, action: FocusAction, now: number): FocusState {
  const a = anchorAt(s, now);
  switch (action.type) {
    case 'pause':
      return { ...a, status: 'paused' };
    case 'resume':
      return { ...a, status: 'running', anchorAt: now };
    case 'skipBreak':
      return a.phase === 'break' ? { ...a, phase: 'work', phaseElapsedSec: 0, workSinceBreakSec: 0, breaksTaken: a.breaksTaken + 1 } : a;
    case 'breakNow':
      return a.phase === 'work' && a.breakSec > 0 ? { ...a, phase: 'break', phaseElapsedSec: 0, workSinceBreakSec: 0 } : a;
    case 'addWork':
      return { ...a, workSec: Math.min(24 * 3600, a.workSec + action.sec) };
    case 'extendBreak':
      return a.phase === 'break' ? { ...a, phaseElapsedSec: a.phaseElapsedSec - action.sec } : a;
    case 'setTasks':
      return { ...a, taskUids: action.taskUids };
    case 'complete':
      return { ...a, status: 'completed', endedAt: now };
    case 'cancel':
      return { ...a, status: 'cancelled', endedAt: now };
  }
}

export function isActive(s: FocusState | null): s is FocusState {
  return !!s && (s.status === 'running' || s.status === 'paused');
}
