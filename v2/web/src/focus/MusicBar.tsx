import { useEffect } from 'react';
import { CloudRain, FolderOpen, Library, Music2, Pause, Play, SkipBack, SkipForward, Square, Volume2, Waves, Wind } from 'lucide-react';
import { AMBIENT_LABEL, folderSupported, loadFolderInfo, next, pause, pickFolder, play, prev, setAmbient, setSource, setVolume, stop, usePlayer, type MusicSource } from './player';
import { useData } from '../store/data';
import type { AmbientKind } from './audio';

const SOURCES: { key: MusicSource; label: string; icon: typeof Music2 }[] = [
  { key: 'folder', label: 'My folder', icon: FolderOpen },
  { key: 'library', label: 'Library', icon: Library },
  { key: 'ambient', label: 'Ambient', icon: Waves },
];
const AMBIENTS: { key: AmbientKind; icon: typeof Music2 }[] = [
  { key: 'rain', icon: CloudRain },
  { key: 'brown', icon: Wind },
  { key: 'waves', icon: Waves },
];

export function MusicBar() {
  const p = usePlayer();
  const libraryCount = useData((s) => Object.keys(s.music).length);
  useEffect(() => void loadFolderInfo(), []);
  const sources = SOURCES.filter((s) => s.key !== 'folder' || folderSupported);

  return (
    <div className="flex w-[min(50rem,96vw)] flex-col gap-2 rounded-3xl bg-white/6 p-2 backdrop-blur-xl md:flex-row md:items-center">
      <div className="flex items-center gap-1 rounded-full bg-black/25 p-1">
        {sources.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSource(s.key)}
            className={`flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors md:flex-none ${p.source === s.key ? 'bg-ivory text-carbon' : 'text-ivory/60 hover:text-ivory'}`}
            aria-pressed={p.source === s.key}
          >
            <s.icon size={13} /> {s.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
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
        <button type="button" onClick={() => (p.playing ? pause() : void play())} className="grid size-10 shrink-0 place-items-center rounded-full bg-ivory text-carbon transition-transform active:scale-95" aria-label={p.playing ? 'Pause music' : 'Play music'}>
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
        <div className="min-w-36 flex-1 text-left">
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
                  : AMBIENT_LABEL[p.ambient])}
          </p>
          {p.source === 'folder' && (
            <button type="button" onClick={() => void pickFolder()} className="text-[0.68rem] text-gold/80 hover:text-gold">
              {p.folderName ? 'Change folder' : 'Choose folder'}
            </button>
          )}
        </div>
        <label className="hidden items-center gap-1.5 text-ivory/50 sm:flex" title="Volume">
          <Volume2 size={14} />
          <input type="range" min={0} max={1} step={0.01} value={p.volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-20 accent-[#4fd1c5]" aria-label="Volume" />
        </label>
      </div>
    </div>
  );
}
