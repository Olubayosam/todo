import { api } from '../lib/api';
import { useData } from '../store/data';
import { dispatch } from '../sync/engine';

export const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window;
export const pushSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

/** Shows a notification through the service worker when possible (required on Android, and lets
 *  a later push with the same tag replace it instead of duplicating). */
export async function showNotification(title: string, body: string, tag: string) {
  if (!notificationsSupported || Notification.permission !== 'granted') return;
  const opts: NotificationOptions = { body, tag, icon: 'icon-192.png', badge: 'badge-96.png', data: { url: './#/focus' }, requireInteraction: false };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, opts);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    new Notification(title, opts);
  } catch {
    /* some mobile browsers only allow SW notifications */
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
}

/** Asks for permission and registers this device for Web Push. Returns a status message. */
export async function enableNotifications(): Promise<{ ok: boolean; message: string }> {
  if (!notificationsSupported) return { ok: false, message: 'This browser does not support notifications.' };
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, message: 'Notifications are blocked. Allow them in your browser’s site settings.' };
  if (!pushSupported) return { ok: true, message: 'Alerts will show while the app is open. (Push is not supported here — on iPhone, add the app to your Home Screen first.)' };
  const key = useData.getState().vapidPublicKey;
  if (!key) return { ok: true, message: 'Alerts will show while the app is open. (The server has no push key yet.)' };
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    dispatch({ type: 'push.subscribe', data: { endpoint: json.endpoint, keys: json.keys, device: deviceLabel() } });
    return { ok: true, message: 'Break alerts are on for this device, even when the app is closed.' };
  } catch (e) {
    return { ok: true, message: `Alerts will show while the app is open. Push setup failed: ${(e as Error).message}` };
  }
}

export async function pushStatus(): Promise<'unsupported' | 'blocked' | 'off' | 'on' | 'local'> {
  if (!notificationsSupported) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  if (!pushSupported) return 'local';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'on' : 'local';
  } catch {
    return 'local';
  }
}

export async function sendTestPush() {
  return api<{ results: number[] }>('push/test', { method: 'POST', body: '{}' });
}
