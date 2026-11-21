import { useCallback, useEffect, useRef } from 'react';
import { Maximize2, Pause, Play, Square } from 'lucide-react';
import { useYouTube } from './youtube';
import { pause, play, stop, usePlayer } from './player';
import { useUI } from '../store/ui';
import { useCollapsed } from '../hooks/useCollapsed';

/**
 * One persistent YouTube player for the whole app (moving an iframe in the DOM
 * reloads it, so it never moves — it's fixed-positioned instead):
 *  - on the focus page it sits exactly over a placeholder "slot";
 *  - elsewhere it docks as a small card so the music keeps playing.
 * YouTube's terms require the player to stay visible (min 200x200).
 */
export function YouTubeDock() {
  const active = useYouTube((s) => s.active);
  const slot = useYouTube((s) => s.slot);
  const title = useYouTube((s) => s.title);
  const playing = usePlayer((s) => s.playing && s.source === 'youtube');
  const route = useUI((s) => s.route.name);
  const [sidebarFolded] = useCollapsed('sidebar', false);
  const wrap = useRef<HTMLDivElement>(null);

  const hostRef = useCallback((el: HTMLDivElement | null) => {
    if (el && !useYouTube.getState().hostEl) useYouTube.setState({ hostEl: el });
  }, []);

  // Follow the slot's position while the focus page is showing
  useEffect(() => {
    const w = wrap.current;
    if (!w) return;
    if (!slot || !active) {
      w.style.left = '';
      w.style.top = '';
      return;
    }
    let raf = 0;
    let lastX = NaN;
    let lastY = NaN;
    const tick = () => {
      const r = slot.getBoundingClientRect();
      if (r.left !== lastX || r.top !== lastY) {
        w.style.left = `${r.left}px`;
        w.style.top = `${r.top}px`;
        lastX = r.left;
        lastY = r.top;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [slot, active]);

  const inSlot = active && !!slot;
  const docked = active && !slot;

  return (
    <div
      ref={wrap}
      className={
        inSlot
          ? 'fixed z-[55]'
          : docked
            ? 'fixed right-3 top-[4.25rem] z-40 rounded-2xl border border-white/10 bg-carbon/95 p-1.5 text-ivory shadow-lg backdrop-blur-xl animate-fade-up sm:right-auto sm:top-auto sm:bottom-6 sm:left-[5.5rem] ' + (sidebarFolded ? '' : 'lg:left-[17.5rem]')
            : // Not in use: parked off-screen (nothing is playing)
              'pointer-events-none fixed -left-[9999px] top-0 opacity-0'
      }
      aria-hidden={!active}
    >
      <div ref={hostRef} className="size-50 overflow-hidden rounded-xl bg-black [&_iframe]:size-50" />
      {docked && (
        <div className="flex w-50 items-center gap-1 pt-1.5">
          <p className="min-w-0 flex-1 truncate px-1 text-[0.7rem] text-ivory/70" title={title ?? undefined}>
            {title ?? 'YouTube'}
          </p>
          <button type="button" onClick={() => (playing ? pause() : void play())} className="grid size-7 place-items-center rounded-full bg-ivory text-carbon" aria-label={playing ? 'Pause music' : 'Play music'}>
            {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-px" />}
          </button>
          {route !== 'focus' && (
            <button type="button" onClick={() => useUI.getState().navigate({ name: 'focus' })} className="grid size-7 place-items-center rounded-full text-ivory/60 hover:bg-white/10" aria-label="Open focus mode">
              <Maximize2 size={12} />
            </button>
          )}
          <button type="button" onClick={() => stop(0.3)} className="grid size-7 place-items-center rounded-full text-ivory/60 hover:bg-white/10" aria-label="Stop YouTube">
            <Square size={10} fill="currentColor" />
          </button>
        </div>
      )}
    </div>
  );
}
