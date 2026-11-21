import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { MiniTimerBody } from './FocusMiniCard';

/**
 * Document Picture-in-Picture (Chrome / Edge desktop): an always-on-top mini
 * timer that stays visible over other tabs and apps. It must be opened from a
 * click. Other browsers fall back to notifications + the in-app card.
 */
interface DocPip {
  requestWindow(o: { width: number; height: number; disallowReturnToOpener?: boolean }): Promise<Window>;
  window: Window | null;
}
const docPip = (typeof window !== 'undefined' ? (window as unknown as { documentPictureInPicture?: DocPip }).documentPictureInPicture : undefined) ?? null;
export const pipSupported = !!docPip;

export const usePip = create<{ open: boolean; win: Window | null }>()(() => ({ open: false, win: null }));

function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join('\n');
      const style = target.createElement('style');
      style.textContent = css;
      target.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = target.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        target.head.appendChild(link);
      }
    }
  }
}

export async function openPip() {
  if (!docPip) return;
  if (usePip.getState().win) {
    usePip.getState().win!.focus();
    return;
  }
  try {
    const win = await docPip.requestWindow({ width: 340, height: 176 });
    copyStyles(win.document);
    win.document.documentElement.dataset.theme = 'dark';
    win.document.title = 'Focus';
    win.document.body.style.margin = '0';
    win.document.body.style.background = '#0e0e0e';
    win.addEventListener('pagehide', () => usePip.setState({ open: false, win: null }));
    usePip.setState({ open: true, win });
  } catch {
    /* user gesture required or unsupported */
  }
}

export function closePip() {
  usePip.getState().win?.close();
  usePip.setState({ open: false, win: null });
}

export function PipHost({ active }: { active: boolean }) {
  const win = usePip((s) => s.win);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active && win) closePip();
  }, [active, win]);
  // The opener tab may be hidden (and its timers throttled); the PiP window is
  // visible, so tick from its own timer to keep the countdown smooth.
  useEffect(() => {
    if (!win) return;
    const id = win.setInterval(() => setTick((t) => t + 1), 500);
    return () => win.clearInterval(id);
  }, [win]);
  if (!win || !active) return null;
  return createPortal(<MiniTimerBody variant="pip" />, win.document.body);
}
