import { indiaDate } from './geo';

export const SHIFTS = ['A', 'B', 'C'] as const;
export type Shift = (typeof SHIFTS)[number];

/** Shift A starts at the mine's start hour (India time); B and C follow, 8 hours each. */
export const DEFAULT_SHIFT_START = 6;

const HOUR = 3600000;

export const isShift = (v: unknown): v is Shift => typeof v === 'string' && (SHIFTS as readonly string[]).includes(v);

const midnight = (date: string) => Date.parse(`${date}T00:00:00+05:30`);
const addDays = (date: string, n: number) => indiaDate(new Date(midnight(date) + n * 86400000 + 12 * HOUR));

/** When a shift begins, as a timestamp. A shift belongs to the day it starts, even if it runs past midnight. */
const beginsAt = (date: string, shift: Shift, start: number) => midnight(date) + (start + 8 * SHIFTS.indexOf(shift)) * HOUR;

/**
 * The date a shift is filed under, for something done at time `t`: arriving up to 4 hours early
 * and checking out up to 4 hours late still count towards that shift.
 */
export function shiftDate(shift: string | null | undefined, t: Date = new Date(), start = DEFAULT_SHIFT_START): string {
  const today = indiaDate(t);
  if (!isShift(shift)) return today;
  for (const d of [addDays(today, -1), today, addDays(today, 1)]) {
    const b = beginsAt(d, shift, start);
    if (t.getTime() >= b - 4 * HOUR && t.getTime() < b + 12 * HOUR) return d;
  }
  return today;
}

/** The shift running at this moment, and the date it is filed under. */
export function currentShift(t: Date = new Date(), start = DEFAULT_SHIFT_START): { shift: Shift; date: string } {
  const today = indiaDate(t);
  for (const d of [addDays(today, -1), today]) {
    for (const s of SHIFTS) {
      const b = beginsAt(d, s, start);
      if (t.getTime() >= b && t.getTime() < b + 8 * HOUR) return { shift: s, date: d };
    }
  }
  return { shift: 'A', date: today };
}

const clock = (n: number) => {
  const h = ((n % 24) + 24) % 24;
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
};

export const shiftLabel = (s: string, start = DEFAULT_SHIFT_START) => {
  if (!isShift(s)) return s;
  const from = start + 8 * SHIFTS.indexOf(s);
  return `Shift ${s} (${clock(from)} – ${clock(from + 8)})`;
};

/** The shift that hands over to this one: A follows the previous day's C, B follows A, C follows B. */
export function previousShift(shift: string, date: string): { shift: Shift; date: string } {
  if (shift === 'A') return { shift: 'C', date: addDays(date, -1) };
  return { shift: shift === 'B' ? 'A' : 'B', date };
}

/** The shift that takes over from this one. */
export function nextShift(shift: string, date: string): { shift: Shift; date: string } {
  if (shift === 'C') return { shift: 'A', date: addDays(date, 1) };
  return { shift: shift === 'A' ? 'B' : 'C', date };
}
