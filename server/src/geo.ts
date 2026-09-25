const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two lat/lng points. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

const IST_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Calendar day (YYYY-MM-DD) in India time; attendance days roll over at IST midnight. */
export const indiaDate = (d: Date = new Date()) => IST_DATE.format(d);

export const isDateString = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The `count` India-time days ending at `end`, oldest first. */
export function recentDates(count: number, end: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(indiaDate(new Date(end.getTime() - i * 86400000)));
  return out;
}
