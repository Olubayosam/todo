// Thin client for the PHP API. URLs are relative ("api/…") so the app works
// from any sub-folder; the Vite dev server proxies /api to XAMPP.

export const API_BASE = 'api/';

const TOKEN_KEY = 'todo_v2_token';
const CLIENT_KEY = 'todo_v2_client';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Stable per-browser id: lets the sync engine skip echoes of its own writes. */
export const CLIENT_ID: string = (() => {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  }
})();

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler = () => {};
export function setUnauthorizedHandler(fn: UnauthorizedHandler) {
  onUnauthorized = fn;
}

export async function api<T>(route: string, init: RequestInit & { query?: Record<string, string | number> } = {}): Promise<T> {
  const params = new URLSearchParams({ r: route });
  for (const [k, v] of Object.entries(init.query ?? {})) params.set(k, String(v));
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-Client-Id', CLIENT_ID);
  if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API_BASE}?${params}`, { ...init, headers, cache: 'no-store' });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (res.status === 401 && route !== 'auth/login') onUnauthorized();
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export function streamUrl(since: number): string {
  const p = new URLSearchParams({ token: getToken() ?? '', since: String(since), cid: CLIENT_ID });
  return `${API_BASE}stream.php?${p}`;
}

export function musicUrl(uid: string): string {
  const p = new URLSearchParams({ r: 'music/stream', uid, token: getToken() ?? '' });
  return `${API_BASE}?${p}`;
}

export function uid(): string {
  return crypto.randomUUID();
}

// --- Server clock -----------------------------------------------------------
// Focus timers use server time so every device shows the same countdown.
let offset = 0;
export function updateServerClock(serverNow: number, sentAt: number, receivedAt = Date.now()) {
  const rtt = receivedAt - sentAt;
  if (rtt > 5000) return; // too noisy to be useful
  const estimate = serverNow + rtt / 2 - receivedAt;
  offset = offset === 0 ? estimate : offset * 0.7 + estimate * 0.3;
}
export function serverNow(): number {
  return Date.now() + offset;
}
