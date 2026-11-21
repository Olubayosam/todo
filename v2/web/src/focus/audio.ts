// Shared Web Audio graph: everything that makes sound goes through `master`
// and an analyser that drives the focus page's visualiser.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let analyser: AnalyserNode | null = null;

export function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    master.connect(analyser);
    analyser.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, master: master!, analyser: analyser! };
}

export function getAnalyser(): AnalyserNode | null {
  return analyser;
}

/** Unlocks audio on the first user gesture so later chimes can play in the background. */
export function primeAudioOnGesture() {
  const unlock = () => {
    audio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/** Soft two-tone bell. `kind` changes the interval so break / back-to-work sound different. */
export function chime(kind: 'break' | 'work' | 'done' = 'break') {
  try {
    const { ctx: c } = audio();
    const now = c.currentTime;
    const notes = kind === 'break' ? [659.25, 987.77] : kind === 'work' ? [783.99, 1046.5] : [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      const t = now + i * 0.18;
      for (const [mult, vol] of [
        [1, 0.16],
        [2.01, 0.04],
        [3.02, 0.015],
      ] as const) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'sine';
        o.frequency.value = f * mult;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
        o.connect(g).connect(c.destination);
        o.start(t);
        o.stop(t + 2.5);
      }
    });
  } catch {
    /* audio unavailable */
  }
}

// ---------------------------------------------------------------------------
// Generated ambience
// ---------------------------------------------------------------------------

export type AmbientKind = 'rain' | 'brown' | 'waves';

function noiseBuffer(c: AudioContext, kind: 'white' | 'brown', seconds = 6): AudioBuffer {
  const len = c.sampleRate * seconds;
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        data[i] = last * 3.2;
      } else data[i] = w;
    }
  }
  return buf;
}

export interface AmbientHandle {
  stop: (fadeSec?: number) => void;
  setVolume: (v: number) => void;
}

export function startAmbient(kind: AmbientKind, volume = 0.6): AmbientHandle {
  const { ctx: c, master: m } = audio();
  const out = c.createGain();
  out.gain.value = 0;
  out.connect(m);
  const nodes: AudioScheduledSourceNode[] = [];

  const loop = (buf: AudioBuffer) => {
    const s = c.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    nodes.push(s);
    return s;
  };

  if (kind === 'brown') {
    const s = loop(noiseBuffer(c, 'brown'));
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    s.connect(lp).connect(out);
    s.start();
  } else if (kind === 'rain') {
    const s = loop(noiseBuffer(c, 'white'));
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 600;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    const g = c.createGain();
    g.gain.value = 0.22;
    s.connect(hp).connect(lp).connect(g).connect(out);
    s.start();
    // low rumble bed
    const b = loop(noiseBuffer(c, 'brown'));
    const blp = c.createBiquadFilter();
    blp.type = 'lowpass';
    blp.frequency.value = 400;
    const bg = c.createGain();
    bg.gain.value = 0.5;
    b.connect(blp).connect(bg).connect(out);
    b.start();
  } else {
    // waves: brown noise swelling slowly
    const s = loop(noiseBuffer(c, 'brown'));
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    const swell = c.createGain();
    swell.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = c.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth).connect(swell.gain);
    lfo.start();
    nodes.push(lfo);
    s.connect(lp).connect(swell).connect(out);
    s.start();
  }

  out.gain.setTargetAtTime(volume, c.currentTime, 0.8);
  return {
    stop: (fade = 1.2) => {
      out.gain.setTargetAtTime(0, c.currentTime, fade / 3);
      setTimeout(() => {
        nodes.forEach((n) => {
          try {
            n.stop();
          } catch {
            /* already stopped */
          }
        });
        out.disconnect();
      }, fade * 1000 + 200);
    },
    setVolume: (v) => out.gain.setTargetAtTime(v, c.currentTime, 0.2),
  };
}
