import { create } from 'zustand';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { musicUrl } from '../lib/api';
import { useData } from '../store/data';
import { audio, startAmbient, type AmbientHandle, type AmbientKind } from './audio';
import { loadYouTube, onYouTubeChange, parseYouTube, useYouTube, ytNext, ytPause, ytPlay, ytPrev, ytSetVolume, ytStop } from './youtube';

export type MusicSource = 'folder' | 'library' | 'youtube' | 'ambient';

interface Track {
  title: string;
  /** Resolves a playable URL (object URL for local files, API URL for uploads) */
  url: () => Promise<string>;
}

interface PlayerState {
  source: MusicSource;
  ambient: AmbientKind;
  playing: boolean;
  index: number;
  title: string | null;
  folderName: string | null;
  trackCount: number;
  volume: number;
  error: string | null;
}

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;
const FOLDER_KEY = 'todo_v2_music_folder';

export const folderSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

export const usePlayer = create<PlayerState>()(() => ({
  source: readPref<MusicSource>('musicSource', folderSupported ? 'folder' : 'ambient'),
  ambient: readPref<AmbientKind>('ambientKind', 'rain'),
  playing: false,
  index: 0,
  title: null,
  folderName: null,
  trackCount: 0,
  volume: Number(readPref('musicVolume', '0.7')) || 0.7,
  error: null,
}));

// Mirror YouTube's state into the shared player UI
onYouTubeChange(({ playing, title, error }) => {
  if (usePlayer.getState().source !== 'youtube') return;
  usePlayer.setState({ playing, title, error });
});

let el: HTMLAudioElement | null = null;
let gain: GainNode | null = null;
let ambientHandle: AmbientHandle | null = null;
let queue: Track[] = [];
let currentObjectUrl: string | null = null;

function ensureElement(): HTMLAudioElement {
  if (el) return el;
  el = new Audio();
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  const { ctx, master } = audio();
  gain = ctx.createGain();
  gain.gain.value = usePlayer.getState().volume;
  ctx.createMediaElementSource(el).connect(gain).connect(master);
  el.addEventListener('ended', () => void playIndex(usePlayer.getState().index + 1));
  el.addEventListener('error', () => {
    // skip unplayable files rather than stopping the session's music
    if (usePlayer.getState().playing && queue.length > 1) void playIndex(usePlayer.getState().index + 1);
  });
  return el;
}

// --- Local folder (File System Access API; Chrome / Edge desktop) ------------

type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>;
  queryPermission(o: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(o: { mode: 'read' }): Promise<PermissionState>;
};

async function collect(dir: DirHandle, depth = 0, prefix = ''): Promise<{ name: string; handle: FileSystemFileHandle }[]> {
  const out: { name: string; handle: FileSystemFileHandle }[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === 'file' && AUDIO_EXT.test(entry.name)) out.push({ name: prefix + entry.name, handle: entry as FileSystemFileHandle });
    else if (entry.kind === 'directory' && depth < 2) out.push(...(await collect(entry as DirHandle, depth + 1, `${prefix}${entry.name}/`)));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export async function pickFolder(): Promise<boolean> {
  if (!folderSupported) return false;
  try {
    const dir = (await (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker({ id: 'focus-music', mode: 'read', startIn: 'music' })) as DirHandle;
    await idbSet(FOLDER_KEY, dir);
    const files = await collect(dir);
    usePlayer.setState({ folderName: dir.name, trackCount: files.length, error: files.length ? null : 'No audio files found in that folder.' });
    setSource('folder');
    return true;
  } catch (e) {
    if ((e as DOMException).name !== 'AbortError') usePlayer.setState({ error: 'Could not open that folder.' });
    return false;
  }
}

export async function loadFolderInfo() {
  if (!folderSupported) return;
  try {
    const dir = (await idbGet(FOLDER_KEY)) as DirHandle | undefined;
    if (dir) usePlayer.setState({ folderName: dir.name });
  } catch {
    /* ignore */
  }
}

export async function forgetFolder() {
  await idbDel(FOLDER_KEY);
  usePlayer.setState({ folderName: null, trackCount: 0 });
}

async function folderQueue(): Promise<Track[]> {
  const dir = (await idbGet(FOLDER_KEY)) as DirHandle | undefined;
  if (!dir) throw new Error('Choose a music folder first.');
  // Permission must be re-granted after a restart; play() is a user gesture, so we can ask.
  if ((await dir.queryPermission({ mode: 'read' })) !== 'granted' && (await dir.requestPermission({ mode: 'read' })) !== 'granted') {
    throw new Error('Permission to read the music folder was not granted.');
  }
  const files = await collect(dir);
  usePlayer.setState({ folderName: dir.name, trackCount: files.length });
  return files.map((f) => ({
    title: f.name.replace(AUDIO_EXT, '').split('/').pop()!,
    url: async () => URL.createObjectURL(await f.handle.getFile()),
  }));
}

function libraryQueue(): Track[] {
  const tracks = Object.values(useData.getState().music).sort((a, b) => a.position - b.position);
  return tracks.map((t) => ({ title: t.title, url: async () => musicUrl(t.uid) }));
}

async function playIndex(i: number) {
  if (!queue.length) return;
  const index = ((i % queue.length) + queue.length) % queue.length; // wrap = repeat the folder
  const track = queue[index];
  const a = ensureElement();
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  const url = await track.url();
  currentObjectUrl = url.startsWith('blob:') ? url : null;
  a.src = url;
  usePlayer.setState({ index, title: track.title, playing: true, error: null });
  try {
    await a.play();
  } catch {
    usePlayer.setState({ playing: false, error: 'Playback was blocked — press play again.' });
  }
}

export async function play() {
  const s = usePlayer.getState();
  audio();
  if (s.source === 'youtube') {
    if (useYouTube.getState().active) ytPlay();
    else usePlayer.setState({ error: 'Paste a YouTube link first.' });
    return;
  }
  if (s.source === 'ambient') {
    ambientHandle?.stop(0.3);
    ambientHandle = startAmbient(s.ambient, s.volume * 0.8);
    usePlayer.setState({ playing: true, title: AMBIENT_LABEL[s.ambient], error: null });
    return;
  }
  if (el && el.src && queue.length && el.paused && s.title) {
    await el.play().catch(() => {});
    usePlayer.setState({ playing: true });
    return;
  }
  try {
    queue = s.source === 'folder' ? await folderQueue() : libraryQueue();
    if (!queue.length) {
      usePlayer.setState({ error: s.source === 'folder' ? 'No audio files in your music folder.' : 'Your library is empty — upload tracks in Settings.' });
      return;
    }
    await playIndex(0);
  } catch (e) {
    usePlayer.setState({ error: (e as Error).message, playing: false });
  }
}

export function pause() {
  if (usePlayer.getState().source === 'youtube') {
    ytPause();
    return;
  }
  el?.pause();
  ambientHandle?.stop(0.6);
  ambientHandle = null;
  usePlayer.setState({ playing: false });
}

export function next() {
  const src = usePlayer.getState().source;
  if (src === 'youtube') ytNext();
  else if (src !== 'ambient') void playIndex(usePlayer.getState().index + 1);
}

export function prev() {
  const src = usePlayer.getState().source;
  if (src === 'youtube') ytPrev();
  else if (src !== 'ambient') void playIndex(usePlayer.getState().index - 1);
}

/** Stops and resets the queue (fades out gently). */
export function stop(fadeSec = 1.5) {
  if (useYouTube.getState().active) ytStop();
  ambientHandle?.stop(fadeSec);
  ambientHandle = null;
  if (el && gain) {
    const { ctx } = audio();
    const g = gain;
    g.gain.setTargetAtTime(0, ctx.currentTime, fadeSec / 3);
    setTimeout(() => {
      el?.pause();
      if (el) el.removeAttribute('src');
      g.gain.value = usePlayer.getState().volume;
    }, fadeSec * 1000);
  }
  queue = [];
  usePlayer.setState({ playing: false, title: null, index: 0 });
}

export function setVolume(v: number) {
  usePlayer.setState({ volume: v });
  writePref('musicVolume', String(v));
  if (gain) gain.gain.value = v;
  ambientHandle?.setVolume(v * 0.8);
  ytSetVolume(v);
}

export function setSource(source: MusicSource) {
  const prevSource = usePlayer.getState().source;
  if (prevSource === source) return;
  const wasPlaying = usePlayer.getState().playing && source !== 'youtube';
  if (usePlayer.getState().playing) stop(0.4);
  if (prevSource === 'youtube') ytStop();
  writePref('musicSource', source);
  usePlayer.setState({ source, error: null });
  if (wasPlaying) setTimeout(() => void play(), 450);
}

export function setAmbient(kind: AmbientKind) {
  writePref('ambientKind', kind);
  usePlayer.setState({ ambient: kind });
  if (usePlayer.getState().playing && usePlayer.getState().source === 'ambient') void play();
}

export const AMBIENT_LABEL: Record<AmbientKind, string> = { rain: 'Soft rain', stream: 'Flowing stream', brown: 'Brown noise', waves: 'Ocean waves' };

/** Plays a YouTube link (switching the source to YouTube). */
export async function playYouTubeLink(url: string): Promise<boolean> {
  const ref = parseYouTube(url);
  if (!ref) {
    usePlayer.setState({ error: "That doesn't look like a YouTube link." });
    return false;
  }
  if (usePlayer.getState().source !== 'youtube') setSource('youtube');
  // stop any local audio first
  ambientHandle?.stop(0.4);
  ambientHandle = null;
  el?.pause();
  ytSetVolume(usePlayer.getState().volume);
  await loadYouTube(ref);
  return !useYouTube.getState().error;
}
