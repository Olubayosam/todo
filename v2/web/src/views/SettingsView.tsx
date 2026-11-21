import { useEffect, useRef, useState } from 'react';
import { Bell, Download, FolderOpen, Loader2, Music2, RefreshCw, Tag as TagIcon, Trash2, Upload, User } from 'lucide-react';
import { useData } from '../store/data';
import { useUI, toast, type Theme } from '../store/ui';
import { setPrefs } from '../sync/actions';
import { bootstrap, dispatch, pendingCount } from '../sync/engine';
import { api, uid as newUid } from '../lib/api';
import { enableNotifications, pushStatus, sendTestPush } from '../focus/notify';
import { folderSupported, forgetFolder, loadFolderInfo, pickFolder, usePlayer } from '../focus/player';
import { TAG_HEX } from '../components/ui/bits';
import type { MusicTrack, TagColor } from '../lib/types';
import { SyncDot } from '../components/layout/Nav';
import { useInstallPrompt } from '../app/install';

function Section({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sunken text-fg-2">{icon}</span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {desc && <p className="text-sm text-fg-3">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function NotificationsSection() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof pushStatus>> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => void pushStatus().then(setStatus), []);
  const label = {
    unsupported: 'Not supported in this browser.',
    blocked: 'Blocked — allow notifications for this site in your browser settings.',
    off: 'Off on this device.',
    local: 'On while the app is open in a tab.',
    on: 'On — break alerts reach this device even when the app is closed.',
  };
  return (
    <Section icon={<Bell size={17} />} title="Break alerts" desc="Get told when to take a break, when it's over, and when a session ends.">
      <p className="mb-3 text-sm text-fg-2">{status ? label[status] : 'Checking…'}</p>
      <div className="flex flex-wrap gap-2">
        {status !== 'on' && status !== 'unsupported' && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await enableNotifications();
              toast(r.message, r.ok ? 'success' : 'error');
              setStatus(await pushStatus());
              setBusy(false);
            }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />} Turn on for this device
          </button>
        )}
        {(status === 'on' || status === 'local') && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={async () => {
              try {
                const r = await sendTestPush();
                toast(r.results.length ? `Test sent to ${r.results.length} device(s)` : 'No devices registered for push yet', r.results.length ? 'success' : 'info');
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
          >
            Send a test
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-fg-3">On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), then turn alerts on from there.</p>
    </Section>
  );
}

function MusicSection() {
  const music = useData((s) => s.music);
  const folderName = usePlayer((s) => s.folderName);
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  useEffect(() => void loadFolderInfo(), []);
  const tracks = Object.values(music).sort((a, b) => a.position - b.position);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const [i, f] of Array.from(files).entries()) {
      setUploading(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
      const fd = new FormData();
      fd.append('files[]', f);
      try {
        const res = await api<{ tracks: MusicTrack[] }>('music/upload', { method: 'POST', body: fd });
        useData.setState((s) => ({ music: { ...s.music, ...Object.fromEntries(res.tracks.map((t) => [t.uid, t])) } }));
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`, 'error');
      }
    }
    setUploading(null);
    if (input.current) input.current.value = '';
  };

  return (
    <Section icon={<Music2 size={17} />} title="Focus music" desc="Plays in order and repeats until your session ends.">
      {folderSupported && (
        <div className="mb-5 rounded-xl bg-sunken p-4">
          <p className="mb-1 text-sm font-medium">Music folder on this computer</p>
          <p className="mb-3 text-xs text-fg-3">Recommended on desktop: nothing is uploaded. The app reads the folder directly (Chrome / Edge), and asks again for permission after a browser restart.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void pickFolder()}>
              <FolderOpen size={15} /> {folderName ? 'Change folder' : 'Choose folder'}
            </button>
            {folderName && (
              <>
                <span className="text-sm text-fg-2">
                  Using <strong>{folderName}</strong>
                </span>
                <button type="button" className="btn btn-ghost" onClick={() => void forgetFolder()}>
                  Forget
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <p className="mb-1 text-sm font-medium">Uploaded library</p>
      <p className="mb-3 text-xs text-fg-3">Available on every device, including your phone. Files are stored on your server and streamed only to you.</p>
      <input ref={input} type="file" accept="audio/*,.mp3,.m4a,.ogg,.opus,.wav,.flac" multiple hidden onChange={(e) => void upload(e.target.files)} />
      <button type="button" className="btn btn-outline mb-3" disabled={!!uploading} onClick={() => input.current?.click()}>
        {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Upload tracks
      </button>
      {uploading && <p className="mb-2 text-xs text-fg-3">{uploading}</p>}
      <p className="mt-4 rounded-xl bg-sunken px-3 py-2.5 text-xs text-fg-3">
        <strong className="text-fg-2">YouTube:</strong> in focus mode choose <em>YouTube</em> and paste any video, YouTube Music or playlist link. It plays in a small corner player
        (YouTube requires the player to stay visible) and keeps playing while you work. Links you play are saved and synced to your other devices.
      </p>
      {tracks.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {tracks.map((t, i) => (
            <li key={t.uid} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-5 text-right text-xs text-fg-3 tabular">{i + 1}</span>
              <input
                defaultValue={t.title}
                onBlur={(e) => e.target.value.trim() && e.target.value !== t.title && dispatch({ type: 'music.update', data: { uid: t.uid, title: e.target.value.trim() } })}
                className="min-w-0 flex-1 bg-transparent outline-none"
                aria-label="Track title"
              />
              <span className="text-xs text-fg-3 tabular">{(t.size / 1048576).toFixed(1)} MB</span>
              <button type="button" className="icon-btn size-8 hover:text-urgent-fg" onClick={() => dispatch({ type: 'music.delete', data: { uid: t.uid } })} aria-label={`Delete ${t.title}`}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function TagsSection() {
  const tags = useData((s) => s.tags);
  const [name, setName] = useState('');
  const list = Object.values(tags).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const colors = Object.keys(TAG_HEX) as TagColor[];
  return (
    <Section icon={<TagIcon size={17} />} title="Tags" desc="Type #tag when adding a task to create one.">
      <ul className="mb-3 flex flex-col gap-1">
        {list.map((t) => (
          <li key={t.uid} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-hover">
            <div className="flex gap-1">
              {colors.map((c) => (
                <button key={c} type="button" onClick={() => dispatch({ type: 'tag.upsert', data: { ...t, color: c } })} className={`size-4 rounded-full transition-transform ${t.color === c ? 'scale-110 ring-2 ring-fg/30 ring-offset-1 ring-offset-surface' : 'opacity-50 hover:opacity-100'}`} style={{ background: TAG_HEX[c] }} aria-label={`Colour ${c}`} />
              ))}
            </div>
            <input defaultValue={t.name} onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && dispatch({ type: 'tag.upsert', data: { ...t, name: e.target.value.trim() } })} className="ml-2 min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="Tag name" />
            <button type="button" className="icon-btn size-8 hover:text-urgent-fg" onClick={() => dispatch({ type: 'tag.delete', data: { uid: t.uid } })} aria-label={`Delete tag ${t.name}`}>
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          dispatch({ type: 'tag.upsert', data: { uid: newUid(), name: name.trim(), color: colors[list.length % colors.length], position: list.length } });
          setName('');
        }}
        className="flex gap-2"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag" className="field" aria-label="New tag name" />
        <button type="submit" className="btn btn-outline">
          Add
        </button>
      </form>
    </Section>
  );
}

function SyncSection() {
  const lastSyncedAt = useData((s) => s.lastSyncedAt);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const tick = () => void pendingCount().then(setPending);
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);
  return (
    <Section icon={<RefreshCw size={17} />} title="Sync" desc="Changes appear on your other devices within a second or two.">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <SyncDot withLabel />
        <span className="text-fg-3">{pending ? `${pending} change(s) waiting to send` : 'Everything saved'}</span>
        {lastSyncedAt && <span className="text-fg-3">Last update {new Date(lastSyncedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}
        <button
          type="button"
          className="btn btn-outline ml-auto"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await bootstrap();
              toast('Up to date', 'success');
            } catch {
              toast("Couldn't reach the server", 'error');
            }
            setBusy(false);
          }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh now
        </button>
      </div>
    </Section>
  );
}

export function SettingsView() {
  const prefs = useData((s) => s.prefs);
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  const install = useInstallPrompt();
  const capacityH = (prefs.dailyCapacityMin ?? 360) / 60;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-5 sm:px-8 sm:pt-10">
      <header className="mb-6">
        <p className="mb-1 text-sm text-fg-3">Make it yours</p>
        <h1 className="text-[1.75rem] font-semibold tracking-tight sm:text-[2rem]">Settings</h1>
      </header>
      <div className="flex flex-col gap-4">
        <Section icon={<User size={17} />} title="You">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1.5 block text-fg-2">Name for greetings</span>
              <input className="field" defaultValue={prefs.name ?? ''} placeholder="e.g. Sam" onBlur={(e) => e.target.value !== (prefs.name ?? '') && setPrefs({ name: e.target.value.trim() })} />
            </label>
            <label className="text-sm">
              <span className="mb-1.5 block text-fg-2">Daily focus capacity</span>
              <span className="flex items-center gap-2">
                <input type="number" min={1} max={16} step={0.5} className="field w-24" defaultValue={capacityH} onBlur={(e) => setPrefs({ dailyCapacityMin: Math.round(Math.max(1, Math.min(16, Number(e.target.value) || 6)) * 60) })} />
                <span className="text-fg-3">hours — you'll be warned when you plan more</span>
              </span>
            </label>
            <div className="text-sm sm:col-span-2">
              <span className="mb-1.5 block text-fg-2">Appearance (this device)</span>
              <div className="flex gap-2">
                {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                  <button key={t} type="button" onClick={() => setTheme(t)} className={`chip h-9 px-4 text-sm capitalize ${theme === t ? 'bg-ink text-on-ink' : 'bg-sunken text-fg-2 hover:text-fg'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>
        <NotificationsSection />
        <MusicSection />
        <TagsSection />
        {install.available && (
          <Section icon={<Download size={17} />} title="Install the app" desc="Open it from your dock or home screen, in its own window, and use it offline.">
            <button type="button" className="btn btn-primary" onClick={install.prompt}>
              <Download size={15} /> Install
            </button>
          </Section>
        )}
        <SyncSection />
      </div>
    </div>
  );
}
