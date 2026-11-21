import { create } from 'zustand';

/**
 * YouTube playback via the official IFrame Player API.
 * YouTube's terms require a visible player of at least 200x200, so the
 * player is shown (small) rather than hidden; we just don't need to look at it.
 */

export interface YtRef {
  videoId: string | null;
  listId: string | null;
  url: string;
}

const ID = /^[A-Za-z0-9_-]{11}$/;

/** Accepts youtube.com / youtu.be / music.youtube.com / shorts / embed / playlist links or a bare video id. */
export function parseYouTube(input: string): YtRef | null {
  const s = input.trim();
  if (!s) return null;
  if (ID.test(s)) return { videoId: s, listId: null, url: `https://youtu.be/${s}` };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let videoId: string | null = null;
  const listId = u.searchParams.get('list');
  if (host === 'youtu.be') videoId = u.pathname.slice(1).split('/')[0] || null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') videoId = u.searchParams.get('v');
    else videoId = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/)?.[1] ?? null;
  } else return null;
  if (videoId && !ID.test(videoId)) videoId = null;
  if (!videoId && !listId) return null;
  return { videoId, listId, url: s };
}

// --- Minimal typings for the IFrame API ------------------------------------
interface YTPlayer {
  loadVideoById(id: string): void;
  loadPlaylist(o: { list: string; listType: 'playlist'; index?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  nextVideo(): void;
  previousVideo(): void;
  setLoop(on: boolean): void;
  setVolume(v: number): void;
  getVideoData(): { title?: string; video_id?: string };
  getPlaylist(): string[] | null;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: object) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YtState {
  /** A video is loaded (player visible) */
  active: boolean;
  playing: boolean;
  title: string | null;
  current: YtRef | null;
  error: string | null;
  /** Where the player should sit on the focus page (null = docked card) */
  slot: HTMLElement | null;
  hostEl: HTMLDivElement | null;
  setSlot: (el: HTMLElement | null) => void;
}

export const useYouTube = create<YtState>()((set) => ({
  active: false,
  playing: false,
  title: null,
  current: null,
  error: null,
  slot: null,
  hostEl: null,
  setSlot: (el) => set({ slot: el }),
}));

type Listener = (s: { playing: boolean; title: string | null; error: string | null }) => void;
let listener: Listener = () => {};
/** The music player subscribes so the shared play/pause UI stays in step. */
export function onYouTubeChange(fn: Listener) {
  listener = fn;
}
function emit(p: Partial<Pick<YtState, 'playing' | 'title' | 'error'>>) {
  useYouTube.setState(p);
  const s = useYouTube.getState();
  listener({ playing: s.playing, title: s.title, error: s.error });
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("Couldn't load YouTube — check your connection."));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

let player: YTPlayer | null = null;
let creating: Promise<YTPlayer> | null = null;
let volume = 70;
let isPlaylist = false;

const ERRORS: Record<number, string> = {
  2: "That link doesn't look like a playable video.",
  5: "This video can't be played in the browser player.",
  100: 'That video was removed or is private.',
  101: "The owner doesn't allow this video to play outside YouTube.",
  150: "The owner doesn't allow this video to play outside YouTube.",
};

function ensurePlayer(): Promise<YTPlayer> {
  if (player) return Promise.resolve(player);
  creating ??= (async () => {
    const host = useYouTube.getState().hostEl;
    if (!host) throw new Error('Player not ready yet — try again.');
    const YT = await loadApi();
    return new Promise<YTPlayer>((resolve) => {
      const el = document.createElement('div');
      host.appendChild(el);
      const p = new YT.Player(el, {
        width: 200,
        height: 200,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1, origin: location.origin },
        events: {
          onReady: () => {
            player = p;
            p.setVolume(volume);
            resolve(p);
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === 1) emit({ playing: true, error: null, title: p.getVideoData().title || useYouTube.getState().title });
            else if (e.data === 2) emit({ playing: false });
            else if (e.data === 0) {
              // Single video: repeat it. Playlists loop via setLoop(true).
              if (!isPlaylist) {
                p.seekTo(0, true);
                p.playVideo();
              }
            }
          },
          onError: (e: { data: number }) => {
            if (isPlaylist && e.data !== 2) {
              p.nextVideo(); // skip unplayable items in a playlist
              return;
            }
            emit({ playing: false, error: ERRORS[e.data] ?? 'YouTube could not play this.' });
          },
        },
      });
    });
  })();
  return creating.catch((e) => {
    creating = null;
    throw e;
  });
}

export async function loadYouTube(ref: YtRef): Promise<void> {
  useYouTube.setState({ active: true, current: ref, error: null, title: null });
  emit({ error: null, title: 'Loading…' });
  try {
    const p = await ensurePlayer();
    isPlaylist = !!ref.listId && !ref.listId.startsWith('RD'); // auto "mixes" can't be loaded as playlists
    if (isPlaylist) {
      p.loadPlaylist({ list: ref.listId!, listType: 'playlist' });
      setTimeout(() => p.setLoop(true), 800);
    } else if (ref.videoId) {
      p.loadVideoById(ref.videoId);
    } else {
      throw new Error('That playlist type cannot be played here — try a single video link.');
    }
  } catch (e) {
    emit({ playing: false, error: (e as Error).message, title: null });
  }
}

export function ytPlay() {
  player?.playVideo();
}
export function ytPause() {
  player?.pauseVideo();
}
export function ytNext() {
  if (!player) return;
  if (isPlaylist) player.nextVideo();
  else player.seekTo(0, true);
}
export function ytPrev() {
  if (!player) return;
  if (isPlaylist) player.previousVideo();
  else player.seekTo(0, true);
}
export function ytStop() {
  player?.stopVideo();
  useYouTube.setState({ active: false });
  emit({ playing: false, title: null });
}
export function ytSetVolume(v: number) {
  volume = Math.round(v * 100);
  player?.setVolume(volume);
}
export function ytTitle(): string | null {
  return player?.getVideoData().title || null;
}
