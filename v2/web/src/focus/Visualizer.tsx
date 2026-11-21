import { useEffect, useRef } from 'react';
import { getAnalyser } from './audio';
import { usePlayer } from './player';

/**
 * Ambient abstract visual for the focus page: drifting light fields and a
 * slowly morphing ring whose outline breathes with the music's energy.
 * Falls back to a gentle idle "breath" when nothing is playing.
 */
export function Visualizer({ mode, intensity = 1 }: { mode: 'work' | 'break' | 'paused'; intensity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext('2d')!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const bins = new Uint8Array(128);
    let energy = 0;
    let bass = 0;
    let warm = modeRef.current === 'break' ? 1 : 0; // 0 = cyan (work), 1 = gold (break)
    const start = performance.now();

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const mix = (c1: number[], c2: number[], t: number, a: number) => `rgba(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))},${a})`;
    const CYAN = [79, 209, 197];
    const GOLD = [201, 162, 77];
    const TEAL = [38, 92, 104];

    const frame = (nowMs: number) => {
      const t = ((nowMs - start) / 1000) * (reduced ? 0.25 : 1);
      const analyser = getAnalyser();
      let e = 0;
      let b = 0;
      if (analyser) {
        analyser.getByteFrequencyData(bins);
        for (let i = 0; i < 64; i++) e += bins[i];
        for (let i = 1; i < 8; i++) b += bins[i];
        e = e / (64 * 255);
        b = b / (7 * 255);
      }
      // YouTube audio plays inside its own (cross-origin) frame and can't be analysed,
      // so give the shape a soft, music-like pulse instead.
      const pl = usePlayer.getState();
      if (pl.playing && pl.source === 'youtube') {
        e = 0.22 + 0.08 * Math.sin(t * 1.9) + 0.05 * Math.sin(t * 3.7 + 1) + 0.03 * Math.sin(t * 7.3);
        b = 0.3 + 0.12 * Math.max(0, Math.sin(t * 2.2)) ** 3;
        for (let i = 0; i < 48; i++) bins[i] = 90 + 60 * Math.sin(t * (1.3 + i * 0.07) + i * 0.9) * Math.sin(t * 0.4 + i * 0.3);
      }
      const paused = modeRef.current === 'paused';
      energy = lerp(energy, paused ? 0 : e, 0.08);
      bass = lerp(bass, paused ? 0 : b, 0.12);
      warm = lerp(warm, modeRef.current === 'break' ? 1 : 0, 0.02);
      const breath = 0.5 + 0.5 * Math.sin(t * 0.6);

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#0b0b0c';
      g.fillRect(0, 0, w, h);

      // Drifting light fields
      g.globalCompositeOperation = 'lighter';
      const m = Math.min(w, h);
      const fields: [number, number, number, number[], number][] = [
        [0.5 + 0.28 * Math.sin(t * 0.07), 0.45 + 0.22 * Math.cos(t * 0.05), 0.55, warm > 0.5 ? GOLD : CYAN, 0.16],
        [0.3 + 0.2 * Math.cos(t * 0.045), 0.7 + 0.15 * Math.sin(t * 0.06), 0.5, warm > 0.5 ? CYAN : GOLD, 0.1],
        [0.75 + 0.15 * Math.sin(t * 0.038 + 2), 0.3 + 0.2 * Math.sin(t * 0.052 + 1), 0.6, TEAL, 0.22],
      ];
      for (const [fx, fy, fr, col, a] of fields) {
        const r = m * fr * (1 + bass * 0.35 * intensity);
        const grad = g.createRadialGradient(fx * w, fy * h, 0, fx * w, fy * h, r);
        grad.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a * (0.75 + breath * 0.25 + energy * 0.6)})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
      }

      // Morphing ring
      const cx = w / 2;
      const cy = h / 2;
      const R = m * 0.27 * (1 + 0.025 * breath + bass * 0.08 * intensity);
      const N = 160;
      for (let ring = 0; ring < 3; ring++) {
        g.beginPath();
        for (let i = 0; i <= N; i++) {
          const th = (i / N) * Math.PI * 2;
          const bin = bins[Math.floor((((i % (N / 2)) / (N / 2)) * 48) | 0)] / 255;
          const wobble =
            0.035 * Math.sin(3 * th + t * 0.5 + ring) +
            0.025 * Math.sin(5 * th - t * 0.35 + ring * 2) +
            0.015 * Math.sin(8 * th + t * 0.8) +
            (!paused ? bin * 0.09 * intensity : 0);
          const r = R * (1 + wobble) * (1 + ring * 0.07);
          const x = cx + Math.cos(th) * r;
          const y = cy + Math.sin(th) * r;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.strokeStyle = mix(CYAN, GOLD, warm, ring === 0 ? 0.55 + energy * 0.4 : 0.16 - ring * 0.03);
        g.lineWidth = ring === 0 ? 1.4 : 1;
        g.stroke();
        if (ring === 0) {
          const fill = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.1);
          fill.addColorStop(0, mix(CYAN, GOLD, warm, 0.05 + energy * 0.12));
          fill.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = fill;
          g.fill();
        }
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intensity]);

  return <canvas ref={ref} className="absolute inset-0 size-full" aria-hidden />;
}
