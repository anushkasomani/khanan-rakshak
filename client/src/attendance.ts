import { api, GpsReading } from './services/api';

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

export function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) return reject(new Error('Location needs a secure (https) connection.'));
    if (!navigator.geolocation) return reject(new Error("This device can't share its location."));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission is off. Allow location for this site in your browser settings.'
              : err.code === err.TIMEOUT
                ? 'Getting your location took too long. Try again.'
                : 'Could not find your location. Move to an open area and try again.'
          )
        ),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export const formatTime = (d: string | Date) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function formatDuration(from: string | Date, to: string | Date): string {
  const mins = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

// ---- Offline queue: check-ins captured without a connection are uploaded when it returns. ----

type QueuedAction = { userId: string; kind: 'in' | 'out'; reading: GpsReading };
const QUEUE_KEY = 'kr_attendance_queue';

const readQueue = (): QueuedAction[] => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
};
const writeQueue = (q: QueuedAction[]) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));

export const pendingFor = (userId: string) => readQueue().filter((a) => a.userId === userId);

export function enqueue(action: QueuedAction) {
  writeQueue([...readQueue().filter((a) => !(a.userId === action.userId && a.kind === action.kind)), action]);
}

export const isOfflineError = (e: unknown) =>
  !navigator.onLine || e instanceof TypeError || /Request failed \(50[234]\)/.test((e as Error)?.message || '');

/** Uploads this user's queued actions in order. Stops at the first network failure; drops ones the server rejects. */
export async function flushQueue(userId: string): Promise<{ synced: number; rejected: string[] }> {
  let synced = 0;
  const rejected: string[] = [];
  for (const action of pendingFor(userId)) {
    try {
      await (action.kind === 'in' ? api.checkIn(action.reading) : api.checkOut(action.reading));
      synced++;
    } catch (e) {
      if (isOfflineError(e)) break;
      rejected.push((e as Error).message);
    }
    writeQueue(readQueue().filter((a) => a !== action && !(a.userId === action.userId && a.kind === action.kind)));
  }
  return { synced, rejected };
}
