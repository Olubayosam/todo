import { useEffect, useState } from 'react';
import { ChevronDown, CloudRain, Droplets, FolderOpen, Library, Link2, Music2, Pause, Play, SkipBack, SkipForward, Square, Volume2, Waves, Wind, X, MonitorPlay } from 'lucide-react';
import { AMBIENT_LABEL, folderSupported, loadFolderInfo, next, pause, pickFolder, play, playYouTubeLink, prev, setAmbient, setSource, setVolume, stop, usePlayer, type MusicSource } from './player';
import { useData } from '../store/data';
import { useYouTube } from './youtube';
import { setPrefs } from '../sync/actions';
import { Popover } from '../components/ui/bits';
import type { AmbientKind } from './audio';

const SOURCES: { key: MusicSource; label: string; icon: typeof Music2 }[] = [
  { key: 'folder', label: 'My folder', icon: FolderOpen },
  { key: 'library', label: 'Library', icon: Library },
  { key: 'youtube', label: 'YouTube', icon: MonitorPlay },
  { key: 'ambient', label: 'Ambient', icon: Waves },
];
const NO_LINKS: { url: string; title?: string }[] = [];
const AMBIENTS: { key: AmbientKind; icon: typeof Music2 }[] = [
  { key: 'rain', icon: CloudRain },
  { key: 'stream', icon: Droplets },
  { key: 'brown', icon: Wind },
  { key: 'waves', icon: Waves },
];

/** Paste-a-link form plus the saved links list (synced across devices). */
function YouTubePicker({ onPlayed }: { onPlayed?: () => void }) {
  const savedLinks = useData((s) => s.prefs.youtubeLinks);
  const saved = savedLinks ?? NO_LINKS;
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const playUrl = async (link: string) => {
    setBusy(true);
    const ok = await playYouTubeLink(link);
    setBusy(false);
    if (!ok) return;
    setUrl('');
    onPlayed?.();
    const without = saved.filter((s) => s.url !== link);
    setPrefs({ youtubeLinks: [{ url: link, title: saved.find((s) => s.url === link)?.title }, ...without].slice(0, 20) });
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) void playUrl(url.trim());
        }}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-black/30 pl-3 pr-1 focus-within:ring-2 focus-within:ring-cyan/40"
      >
        <Link2 size={14} className="shrink-0 text-ivory/40" />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/youtu/.test(text)) {
              e.preventDefault();
              void playUrl(text.trim());
            }
          }}
          placeholder="Paste a YouTube link"
          className="min-w-0 flex-1 bg-transparent text-xs text-ivory outline-none placeholder:text-ivory/35"
          aria-label="YouTube link"
        />
        <button type="submit" disabled={!url.trim() || busy} className="h-7 rounded-full bg-ivory px-3 text-xs font-semibold text-carbon disabled:opacity-40">
          Play
        </button>
      </form>
      {saved.length > 0 && (
        <Popover
          side="top"
          className="w-72"
          trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs ${open ? 'bg-white/15 text-ivory' : 'text-ivory/60 hover:text-ivory'}`} aria-label="Saved links">
              Saved <ChevronDown size={12} />
            </button>
          )}
        >
          {(close) => (
            <ul className="max-h-64 overflow-y-auto">
              {saved.map((s) => (
                <li key={s.url} className="group flex items-center gap-1 rounded-lg hover:bg-hover">
                  <button type="button" onClick={() => (close(), void playUrl(s.url))} className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm text-fg-2 group-hover:text-fg">
                    {s.title || s.url.replace(/^https?:\/\/(www\.)?/, '')}
                  </button>
                  <button type="button" onClick={() => setPrefs({ youtubeLinks: saved.filter((x) => x.url !== s.url) })} className="grid size-7 shrink-0 place-items-center rounded-md text-fg-3 opacity-0 hover:text-fg group-hover:opacity-100" aria-label="Remove saved link">
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover>
      )}
    </div>
  );
}

export function MusicBar() {
  const p = usePlayer();
  const ytActive = useYouTube((s) => s.active);
  const ytCurrent = useYouTube((s) => s.current);
  const saved = useData((s) => s.prefs.youtubeLinks);
  const libraryCount = useData((s) => Object.keys(s.music).length);
  const [changingLink, setChangingLink] = useState(false);
  useEffect(() => void loadFolderInfo(), []);
  const sources = SOURCES.filter((s) => s.key !== 'folder' || folderSupported);

  // Remember the video's real title next to its saved link
  useEffect(() => {
    if (p.source !== 'youtube' || !p.title || p.title === 'Loading…' || !ytCurrent || !saved) return;
    const entry = saved.find((s) => s.url === ytCurrent.url);
    if (entry && entry.title !== p.title) setPrefs({ youtubeLinks: saved.map((s) => (s.url === ytCurrent.url ? { ...s, title: p.title! } : s)) });
  }, [p.source, p.title, ytCurrent, saved]);

  const showPicker = p.source === 'youtube' && (!ytActive || changingLink);
  const controlsDisabled = p.source === 'youtube' && !ytActive;

  return (
    <div className="flex w-[min(56rem,96vw)] flex-col gap-2 rounded-3xl bg-white/6 p-2 backdrop-blur-xl lg:flex-row lg:items-center">
      <div className="flex shrink-0 items-center gap-1 rounded-full bg-black/25 p-1">
        {sources.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => (setSource(s.key), setChangingLink(false))}
            className={`flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium transition-colors lg:flex-none ${p.source === s.key ? 'bg-ivory text-carbon' : 'text-ivory/60 hover:text-ivory'}`}
            aria-pressed={p.source === s.key}
          >
            <s.icon size={13} className="hidden xl:block" /> {s.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
        {showPicker ? (
          <>
            <YouTubePicker onPlayed={() => setChangingLink(false)} />
            {changingLink && (
              <button type="button" onClick={() => setChangingLink(false)} className="grid size-8 shrink-0 place-items-center rounded-full text-ivory/50 hover:text-ivory" aria-label="Cancel">
                <X size={15} />
              </button>
            )}
          </>
        ) : (
          <>
            {p.source === 'ambient' ? (
              <div className="flex items-center gap-1">
                {AMBIENTS.map((a) => (
                  <button key={a.key} type="button" onClick={() => setAmbient(a.key)} title={AMBIENT_LABEL[a.key]} aria-label={AMBIENT_LABEL[a.key]} aria-pressed={p.ambient === a.key} className={`grid size-8 place-items-center rounded-full ${p.ambient === a.key ? 'bg-white/15 text-ivory' : 'text-ivory/50 hover:text-ivory'}`}>
                    <a.icon size={15} />
                  </button>
                ))}
              </div>
            ) : (
              <button type="button" onClick={prev} disabled={!p.playing} className="grid size-8 place-items-center rounded-full text-ivory/60 hover:text-ivory disabled:opacity-30" aria-label="Previous track">
                <SkipBack size={15} fill="currentColor" />
              </button>
            )}
            <button type="button" disabled={controlsDisabled} onClick={() => (p.playing ? pause() : void play())} className="grid size-10 shrink-0 place-items-center rounded-full bg-ivory text-carbon transition-transform active:scale-95 disabled:opacity-40" aria-label={p.playing ? 'Pause music' : 'Play music'}>
              {p.playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
            </button>
            {p.source !== 'ambient' && (
              <button type="button" onClick={next} disabled={!p.playing} className="grid size-8 place-items-center rounded-full text-ivory/60 hover:text-ivory disabled:opacity-30" aria-label="Next track">
                <SkipForward size={15} fill="currentColor" />
              </button>
            )}
            <button type="button" onClick={() => stop(0.6)} disabled={!p.playing && !p.title} className="grid size-8 place-items-center rounded-full text-ivory/50 hover:text-ivory disabled:opacity-30" aria-label="Stop music">
              <Square size={12} fill="currentColor" />
            </button>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-xs text-ivory/85">
                {p.error ??
                  p.title ??
                  (p.source === 'folder'
                    ? p.folderName
                      ? `Folder: ${p.folderName}`
                      : 'Choose a folder of music on this computer'
                    : p.source === 'library'
                      ? libraryCount
                        ? `${libraryCount} uploaded ${libraryCount === 1 ? 'track' : 'tracks'}`
                        : 'Upload tracks in Settings'
                      : p.source === 'youtube'
                        ? 'YouTube'
                        : AMBIENT_LABEL[p.ambient])}
              </p>
              {p.source === 'folder' && (
                <button type="button" onClick={() => void pickFolder()} className="text-[0.68rem] text-gold/80 hover:text-gold">
                  {p.folderName ? 'Change folder' : 'Choose folder'}
                </button>
              )}
              {p.source === 'youtube' && (
                <button type="button" onClick={() => setChangingLink(true)} className="text-[0.68rem] text-gold/80 hover:text-gold">
                  Change link
                </button>
              )}
            </div>
          </>
        )}
        <label className="hidden shrink-0 items-center gap-1.5 pr-1 text-ivory/50 sm:flex" title="Volume">
          <Volume2 size={14} />
          <input type="range" min={0} max={1} step={0.01} value={p.volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-16 accent-[#4fd1c5] xl:w-20" aria-label="Volume" />
        </label>
      </div>
      {p.source === 'youtube' && showPicker && p.error && <p className="px-3 pb-1 text-xs text-[#f37f79] lg:max-w-48 lg:pb-0">{p.error}</p>}
    </div>
  );
}
