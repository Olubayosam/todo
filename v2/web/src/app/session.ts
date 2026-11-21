import { create } from 'zustand';
import { api, ApiError, getToken, setToken, setUnauthorizedHandler } from '../lib/api';
import { clearSnapshot, loadSnapshot, startSnapshotPersistence, useData } from '../store/data';
import { bootstrap, clearOutbox, startSync, stopSync } from '../sync/engine';

interface SessionState {
  status: 'starting' | 'locked' | 'ready';
  error: string | null;
}

export const useSession = create<SessionState>()(() => ({ status: getToken() ? 'starting' : 'locked', error: null }));

let stopPersist: (() => void) | null = null;

async function enter() {
  stopPersist ??= startSnapshotPersistence();
  const hadSnapshot = await loadSnapshot();
  if (hadSnapshot) useSession.setState({ status: 'ready' });
  try {
    await bootstrap();
    useSession.setState({ status: 'ready', error: null });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return; // handled by lock()
    if (!hadSnapshot) {
      useSession.setState({ status: 'locked', error: "Can't reach the server. Check your connection and try again." });
      return;
    }
  }
  startSync();
}

export async function startSession() {
  setUnauthorizedHandler(() => void lock('Your session ended. Enter your passcode to continue.'));
  if (!getToken()) {
    useSession.setState({ status: 'locked' });
    return;
  }
  await enter();
}

export async function login(passphrase: string): Promise<void> {
  const res = await api<{ token: string }>('auth/login', { method: 'POST', body: JSON.stringify({ passphrase }) });
  setToken(res.token);
  useSession.setState({ error: null });
  await enter();
}

async function lock(message: string | null = null) {
  stopSync();
  setToken(null);
  useData.getState().reset();
  await clearSnapshot();
  await clearOutbox().catch(() => {});
  useSession.setState({ status: 'locked', error: message });
}

export async function logout() {
  try {
    await api('auth/logout', { method: 'POST' });
  } catch {
    /* offline: still lock locally */
  }
  await lock();
}
