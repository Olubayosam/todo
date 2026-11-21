import { createStore, entries, del, set as idbSet } from 'idb-keyval';
import { api, ApiError, CLIENT_ID, getToken, streamUrl, updateServerClock } from '../lib/api';
import type { BootstrapPayload, Change, FocusState, Op, Task } from '../lib/types';
import { todayKey } from '../lib/dates';
import { useData } from '../store/data';
import { toast } from '../store/ui';

/**
 * Sync architecture
 * - Writes are applied optimistically, broadcast to sibling tabs, and queued in
 *   an IndexedDB outbox. Any tab may flush the outbox (serialised by a Web Lock),
 *   so writes made offline are sent as soon as the network is back.
 * - Reads: one "leader" tab per browser (Web Lock) holds a Server-Sent Events
 *   stream and relays changes to sibling tabs over a BroadcastChannel.
 *   If the host buffers SSE, the leader falls back to short polling.
 * - Echoes of this browser's own writes are skipped by client id.
 */

const outboxStore = createStore('todo-v2-outbox', 'ops');
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('todo-v2-sync') : null;
let seq = 0;

type Msg = { type: 'ops'; ops: Op[] } | { type: 'changes'; changes: Change[]; cursor: number } | { type: 'resync' } | { type: 'status'; status: SyncStatus };

export type SyncStatus = 'connecting' | 'live' | 'polling' | 'offline' | 'error';
let status: SyncStatus = 'connecting';
const statusListeners = new Set<(s: SyncStatus) => void>();
export function onSyncStatus(fn: (s: SyncStatus) => void) {
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}
function setStatus(s: SyncStatus, broadcast = true) {
  if (s === status) return;
  status = s;
  statusListeners.forEach((fn) => fn(s));
  if (broadcast) channel?.postMessage({ type: 'status', status: s } satisfies Msg);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function dispatch(...ops: Op[]) {
  if (!ops.length) return;
  useData.getState().applyOps(ops);
  channel?.postMessage({ type: 'ops', ops } satisfies Msg);
  const stamp = Date.now().toString().padStart(15, '0');
  Promise.all(ops.map((op) => idbSet(`${stamp}-${String(seq++).padStart(6, '0')}-${Math.random().toString(36).slice(2, 6)}`, op, outboxStore)))
    .then(() => scheduleFlush(0))
    .catch(() => scheduleFlush(0));
}

let flushTimer: ReturnType<typeof setTimeout> | undefined;
let backoff = 1000;
function scheduleFlush(delay = 0) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flushOutbox(), delay);
}

export async function pendingCount(): Promise<number> {
  try {
    return (await entries(outboxStore)).length;
  } catch {
    return 0;
  }
}

async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if ('locks' in navigator) return navigator.locks.request(name, fn) as Promise<T>;
  return fn();
}

export async function flushOutbox(): Promise<void> {
  if (!getToken()) return;
  if (!navigator.onLine) {
    setStatus('offline');
    return;
  }
  await withLock('todo-v2-outbox', async () => {
    for (let round = 0; round < 20; round++) {
      const items = (await entries(outboxStore)) as [IDBValidKey, Op][];
      if (!items.length) return;
      items.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      const batch = items.slice(0, 50);
      let res: { results: { ok: boolean; error?: string; conflict?: boolean; entity?: unknown; replacedUid?: string | null }[]; serverNow: number };
      const sentAt = Date.now();
      try {
        res = await api('mutate', { method: 'POST', body: JSON.stringify({ ops: batch.map(([, op]) => op) }) });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return;
        if (e instanceof ApiError && e.status >= 500) setStatus('error');
        scheduleFlush(backoff);
        backoff = Math.min(backoff * 2, 30000);
        return;
      }
      backoff = 1000;
      updateServerClock(res.serverNow, sentAt);
      let needsResync = false;
      for (let i = 0; i < batch.length; i++) {
        const [key, op] = batch[i];
        const r = res.results[i];
        await del(key, outboxStore);
        if (!r) continue;
        if (!r.ok) {
          toast(r.error ? `Couldn't save: ${r.error}` : "Couldn't save a change", 'error');
          needsResync = true;
        } else if (r.conflict && op.type === 'focus.set') {
          const server = r.entity as FocusState;
          useData.setState({ focus: server });
          const mine = op.data.state;
          const benign = server.status === mine.status && (mine.status === 'completed' || mine.status === 'cancelled');
          if (!benign) toast('The timer was changed on another device', 'info');
        } else if (r.replacedUid && r.entity) {
          useData.getState().replaceTask(r.replacedUid, r.entity as Task);
        }
      }
      if (needsResync) void bootstrap();
    }
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

let bootstrapping: Promise<void> | null = null;
let lastBootstrapDay = '';

export function bootstrap(): Promise<void> {
  if (bootstrapping) return bootstrapping;
  bootstrapping = (async () => {
    try {
      await flushOutbox();
      const sentAt = Date.now();
      const today = todayKey();
      const data = await api<BootstrapPayload>('bootstrap', { query: { today } });
      updateServerClock(data.serverNow, sentAt);
      // Writes queued while the request was in flight must survive the replace
      const pending = ((await entries(outboxStore)) as [IDBValidKey, Op][]).map(([, op]) => op);
      useData.getState().hydrate(data);
      if (pending.length) useData.getState().applyOps(pending);
      lastBootstrapDay = today;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && data.prefs.timezone !== tz) dispatch({ type: 'prefs.set', data: { prefs: { timezone: tz } } });
      setStatus(status === 'offline' || status === 'error' ? 'connecting' : status);
    } catch (e) {
      // 5xx = the server answered but is broken (e.g. missing .env): say so instead of 'Connecting…'
      if (e instanceof ApiError && e.status >= 500) setStatus('error');
      else if (!(e instanceof ApiError)) setStatus('offline');
      throw e;
    } finally {
      bootstrapping = null;
    }
  })();
  return bootstrapping;
}

function applyIncoming(changes: Change[], cursor: number) {
  const store = useData.getState();
  if (changes.length) store.applyChanges(changes, CLIENT_ID);
  store.setCursor(cursor);
}

let es: EventSource | null = null;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let helloTimer: ReturnType<typeof setTimeout> | undefined;
let mode: 'sse' | 'poll' = 'sse';
let sseFailures = 0;
let isLeader = false;

function openStream() {
  es?.close();
  clearTimeout(helloTimer);
  if (!getToken()) return;
  const source = new EventSource(streamUrl(useData.getState().cursor));
  es = source;
  setStatus('connecting');
  // If the host buffers the stream we never see "hello" promptly: fall back to polling
  helloTimer = setTimeout(() => {
    if (es === source && status !== 'live') {
      sseFailures++;
      if (sseFailures >= 2) switchToPolling();
    }
  }, 6000);

  source.addEventListener('hello', (e) => {
    clearTimeout(helloTimer);
    sseFailures = 0;
    const d = JSON.parse((e as MessageEvent).data);
    updateServerClock(d.serverNow, Date.now() - 50);
    setStatus('live');
  });
  source.addEventListener('ping', (e) => {
    const d = JSON.parse((e as MessageEvent).data);
    updateServerClock(d.serverNow, Date.now() - 50);
  });
  source.addEventListener('change', (e) => {
    const c = JSON.parse((e as MessageEvent).data) as Change;
    applyIncoming([c], c.id);
    channel?.postMessage({ type: 'changes', changes: [c], cursor: c.id } satisfies Msg);
  });
  source.addEventListener('resync', () => {
    source.close();
    void bootstrap().then(openStream);
    channel?.postMessage({ type: 'resync' } satisfies Msg);
  });
  source.onerror = () => {
    // EventSource reconnects by itself (server closes every ~25s by design).
    if (!navigator.onLine) setStatus('offline');
    else if (source.readyState === EventSource.CLOSED) {
      sseFailures++;
      if (sseFailures >= 3) switchToPolling();
      else setTimeout(openStream, 2000);
    }
  };
}

function switchToPolling() {
  es?.close();
  es = null;
  mode = 'poll';
  setStatus('polling');
  void poll();
}

async function poll() {
  clearTimeout(pollTimer);
  if (!isLeader || mode !== 'poll') return;
  try {
    const since = useData.getState().cursor;
    const sentAt = Date.now();
    const res = await api<{ changes?: Change[]; cursor?: number; resync?: boolean; serverNow: number }>('sync', { query: { since } });
    updateServerClock(res.serverNow, sentAt);
    if (res.resync) {
      await bootstrap();
      channel?.postMessage({ type: 'resync' } satisfies Msg);
    } else if (res.changes) {
      applyIncoming(res.changes, res.cursor ?? since);
      if (res.changes.length) channel?.postMessage({ type: 'changes', changes: res.changes, cursor: res.cursor ?? since } satisfies Msg);
    }
    setStatus('polling');
  } catch {
    if (!navigator.onLine) setStatus('offline');
  }
  pollTimer = setTimeout(poll, document.visibilityState === 'visible' ? 2500 : 20000);
}

/** Quick catch-up after waking (phones drop connections in the background). */
async function catchUp() {
  if (!getToken()) return;
  if (todayKey() !== lastBootstrapDay) {
    await bootstrap().catch(() => {});
    return;
  }
  try {
    const since = useData.getState().cursor;
    const res = await api<{ changes?: Change[]; cursor?: number; resync?: boolean; serverNow: number }>('sync', { query: { since } });
    if (res.resync) await bootstrap();
    else if (res.changes) applyIncoming(res.changes, res.cursor ?? since);
  } catch {
    /* offline */
  }
}

function becomeLeader(): Promise<void> {
  return new Promise<void>((release) => {
    isLeader = true;
    leaderRelease = release;
    if (mode === 'sse') openStream();
    else void poll();
  });
}
let leaderRelease: (() => void) | null = null;

let started = false;
let listenersBound = false;
export function startSync() {
  if (started) return;
  started = true;

  if ('locks' in navigator) {
    void navigator.locks.request('todo-v2-leader', () => becomeLeader());
  } else {
    void becomeLeader();
  }
  scheduleFlush(500);

  // Window/channel listeners are bound once per page, even across lock/unlock
  if (listenersBound) return;
  listenersBound = true;

  channel?.addEventListener('message', (e: MessageEvent<Msg>) => {
    if (!started) return;
    const m = e.data;
    if (m.type === 'ops') useData.getState().applyOps(m.ops);
    else if (m.type === 'changes') applyIncoming(m.changes, m.cursor);
    else if (m.type === 'resync') void bootstrap().catch(() => {});
    else if (m.type === 'status') setStatus(m.status, false);
  });

  window.addEventListener('online', () => {
    setStatus('connecting');
    void flushOutbox().then(catchUp);
    if (isLeader && mode === 'sse' && (!es || es.readyState === EventSource.CLOSED)) openStream();
  });
  window.addEventListener('offline', () => setStatus('offline'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    void flushOutbox();
    void catchUp();
    if (isLeader && mode === 'sse' && (!es || es.readyState === EventSource.CLOSED)) openStream();
    if (isLeader && mode === 'poll') void poll();
  });
  // Day rollover while the app is open
  setInterval(() => {
    if (started && todayKey() !== lastBootstrapDay && lastBootstrapDay) void bootstrap().catch(() => {});
  }, 60000);
}

export function stopSync() {
  es?.close();
  es = null;
  clearTimeout(pollTimer);
  leaderRelease?.();
  leaderRelease = null;
  isLeader = false;
  started = false;
}

export async function clearOutbox() {
  const items = await entries(outboxStore);
  await Promise.all(items.map(([k]) => del(k, outboxStore)));
}
