import { Router, Response } from 'express';
import { AuthenticatedRequest, AuthUser, requireLevel, canSeeMine } from '../middleware/auth';
import { ROLES, roleLevel } from '../roles';
import { distanceMeters, isDateString, recentDates } from '../geo';
import { shiftDate, currentShift, shiftLabel, isShift } from '../shifts';
import { prisma } from '../db';

const router = Router();

const MAX_ACCURACY_M = 200; // readings less precise than this can't prove someone is on site

// Temporary testing aid: ATTENDANCE_RADIUS_OVERRIDE_M in .env widens every mine's check-in area (e.g. 10000 = 10 km).
const effectiveRadius = (radius: number) => Math.max(radius, Number(process.env.ATTENDANCE_RADIUS_OVERRIDE_M) || 0);
// A reading may be off by up to a tenth of the check-in area, and is never held to better than 200 m.
const maxAccuracyFor = (radius: number) => Math.max(MAX_ACCURACY_M, radius / 10);
const MAX_OFFLINE_AGE_MS = 12 * 3600 * 1000; // queued check-ins older than a shift are rejected
const LATE_SYNC_MS = 5 * 60 * 1000;

const PERSON_SELECT = {
  id: true,
  name: true,
  role: true,
  officerType: true,
  trade: true,
  specialistType: true,
  shift: true,
  districtId: true,
  district: { select: { id: true, name: true } },
  contract: { select: { id: true, title: true, contractor: { select: { name: true } } } },
  trainingValidUntil: true,
  badgeNumber: true,
  phone: true,
} as const;
const RECORD_SELECT = {
  id: true,
  date: true,
  checkInAt: true,
  checkInDistance: true,
  checkInAccuracy: true,
  checkOutAt: true,
  checkOutDistance: true,
  syncedLate: true,
  source: true,
  markedById: true,
  markedByName: true,
  note: true,
} as const;

/** A person can be marked present by someone above them in the hierarchy (or an admin), never by themselves. */
const canMark = (actor: AuthUser, target: { id: string; role: string | null }) =>
  actor.id !== target.id && (actor.isAdmin || roleLevel(actor.role) > roleLevel(target.role));

type Person = {
  role: string | null;
  districtId?: string | null;
  shift?: string | null;
  contractId?: string | null;
  trainingValidUntil?: Date | null;
};

/**
 * Contract workers can work only while their contract is active and their vocational training is valid.
 * The owner and manager stay responsible for them, so the app checks this the same way for every contractor.
 */
export async function employmentProblem(person: Person, now: Date = new Date()) {
  if (!person.contractId) return null;
  const contract = await prisma.contract.findUnique({ where: { id: person.contractId }, include: { contractor: true } });
  if (!contract) return null;
  const endOfLastDay = new Date(contract.endDate.getTime() + 86400000);
  if (contract.status !== 'ACTIVE' || now < contract.startDate || now >= endOfLastDay) {
    return `The ${contract.contractor.name} contract "${contract.title}" is not active right now, so its workers can't be checked in. Ask the contractor or the mine office.`;
  }
  if (!person.trainingValidUntil) {
    return 'Your vocational training certificate is not on record. Contract workers need it before they can work. Ask your contractor to send it to the mine office.';
  }
  if (person.trainingValidUntil < now) {
    return `Your vocational training certificate expired on ${person.trainingValidUntil.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Get it renewed before working.`;
  }
  return null;
}

/**
 * A worker can start work only after the Sirdar of their district has done the pre-shift inspection
 * for that shift and not declared the district unsafe. Returns the reason they can't, or null.
 */
export async function clearanceProblem(person: Person, date: string) {
  if (person.role !== 'WORKER' || !person.districtId || !person.shift) return null;
  const report = await prisma.shiftReport.findUnique({
    where: { districtId_date_shift: { districtId: person.districtId, date, shift: person.shift } },
    include: { district: { select: { name: true } }, sirdar: { select: { name: true } } },
  });
  if (!report) {
    const district = await prisma.district.findUnique({ where: { id: person.districtId }, select: { name: true } });
    return `The Sirdar has not cleared ${district?.name || 'your district'} for ${shiftLabel(person.shift)} yet. Wait for the pre-shift inspection.`;
  }
  if (report.status === 'UNSAFE') {
    return `${report.sirdar.name} has declared ${report.district.name} unsafe for this shift. Do not go in. Wait for instructions.`;
  }
  return null;
}

type Reading = { lat: number; lng: number; accuracy: number | null; capturedAt: Date; syncedLate: boolean };

function parseReading(body: any, maxAccuracy = MAX_ACCURACY_M): { reading?: Reading; error?: string } {
  const lat = Number(body?.latitude);
  const lng = Number(body?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: 'Location is missing. Turn on GPS and try again.' };
  }
  const accuracy = body?.accuracy == null ? null : Number(body.accuracy);
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy > maxAccuracy)) {
    return { error: `GPS signal is too weak (±${Math.round(accuracy)} m). Move to an open area and try again.` };
  }

  const now = Date.now();
  let capturedAt = new Date(now);
  if (body?.capturedAt) {
    const t = new Date(body.capturedAt).getTime();
    if (!Number.isFinite(t) || t > now + 2 * 60 * 1000) return { error: 'Your phone clock looks wrong. Fix the time and try again.' };
    if (now - t > MAX_OFFLINE_AGE_MS) return { error: 'This check-in was saved too long ago to be accepted.' };
    capturedAt = new Date(t);
  }
  return { reading: { lat, lng, accuracy, capturedAt, syncedLate: now - capturedAt.getTime() > LATE_SYNC_MS } };
}

async function mineFor(req: AuthenticatedRequest) {
  if (!req.user?.mineId) return null;
  const mine = await prisma.mine.findUnique({
    where: { id: req.user.mineId },
    select: { id: true, name: true, latitude: true, longitude: true, radiusMeters: true, shiftStartHour: true },
  });
  return mine && { ...mine, radiusMeters: effectiveRadius(mine.radiusMeters) };
}

// GET /api/attendance/me  (today's record, recent history and the geofence to check against)
router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  const mine = await mineFor(req);
  const history = await prisma.attendance.findMany({
    where: { userId: req.user!.id },
    select: RECORD_SELECT,
    orderBy: { date: 'desc' },
    take: 30,
  });
  const today = shiftDate(req.user!.shift, new Date(), req.user!.shiftStartHour);
  return res.json({ date: today, mine, today: history.find((r) => r.date === today) || null, history });
});

// POST /api/attendance/check-in
router.post('/check-in', async (req: AuthenticatedRequest, res: Response) => {
  const mine = await mineFor(req);
  if (!mine) return res.status(400).json({ error: 'You are not assigned to a mine yet.' });
  if (mine.latitude == null || mine.longitude == null) {
    return res.status(400).json({ error: 'Your mine has no location set. Ask the admin to place it on the map.' });
  }

  const { reading, error } = parseReading(req.body, maxAccuracyFor(mine.radiusMeters));
  if (error) return res.status(400).json({ error });
  const r = reading!;

  const distance = Math.round(distanceMeters(r.lat, r.lng, mine.latitude, mine.longitude));
  if (distance > mine.radiusMeters) {
    return res.status(422).json({
      error: `You are ${distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`} from ${mine.name}. Check in from inside the mine area.`,
      distance,
      radiusMeters: mine.radiusMeters,
    });
  }

  const date = shiftDate(req.user!.shift, r.capturedAt, mine.shiftStartHour);
  const existing = await prisma.attendance.findUnique({ where: { userId_date: { userId: req.user!.id, date } }, select: RECORD_SELECT });
  if (existing) return res.status(200).json(existing);

  const blocked = (await employmentProblem(req.user!, r.capturedAt)) || (await clearanceProblem(req.user!, date));
  if (blocked) return res.status(409).json({ error: blocked });

  const record = await prisma.attendance.create({
    data: {
      userId: req.user!.id,
      mineId: mine.id,
      date,
      checkInAt: r.capturedAt,
      checkInLat: r.lat,
      checkInLng: r.lng,
      checkInAccuracy: r.accuracy,
      checkInDistance: distance,
      syncedLate: r.syncedLate,
    },
    select: RECORD_SELECT,
  });
  return res.status(201).json(record);
});

// POST /api/attendance/check-out  (location is recorded but not enforced, people leave the site to check out)
router.post('/check-out', async (req: AuthenticatedRequest, res: Response) => {
  const own = await mineFor(req);
  const { reading, error } = parseReading(req.body, maxAccuracyFor(own?.radiusMeters ?? 0));
  if (error) return res.status(400).json({ error });
  const r = reading!;

  const date = shiftDate(req.user!.shift, r.capturedAt, req.user!.shiftStartHour);
  const existing = await prisma.attendance.findUnique({ where: { userId_date: { userId: req.user!.id, date } } });
  if (!existing) return res.status(400).json({ error: 'You have not checked in for this shift.' });
  if (existing.checkOutAt) {
    return res.json(await prisma.attendance.findUnique({ where: { id: existing.id }, select: RECORD_SELECT }));
  }

  const mine = await prisma.mine.findUnique({ where: { id: existing.mineId } });
  const distance =
    mine?.latitude != null && mine?.longitude != null
      ? Math.round(distanceMeters(r.lat, r.lng, mine.latitude, mine.longitude))
      : null;

  const record = await prisma.attendance.update({
    where: { id: existing.id },
    data: { checkOutAt: r.capturedAt, checkOutLat: r.lat, checkOutLng: r.lng, checkOutDistance: distance },
    select: RECORD_SELECT,
  });
  return res.json(record);
});

// POST /api/attendance/mark  { userId, note }  (Sirdar or above marks someone present without GPS, e.g. phone died)
router.post('/mark', requireLevel('SIRDAR'), async (req: AuthenticatedRequest, res: Response) => {
  const actor = req.user!;
  const note = String(req.body?.note || '').trim();
  if (note.length < 3) return res.status(400).json({ error: 'Give a reason, for example "phone battery dead".' });
  if (note.length > 200) return res.status(400).json({ error: 'Keep the reason under 200 characters.' });

  const target = await prisma.user.findUnique({ where: { id: String(req.body?.userId || '') }, include: { mine: { select: { shiftStartHour: true } } } });
  if (!target || target.status !== 'APPROVED' || !target.mineId) return res.status(404).json({ error: 'Person not found.' });
  if (!canSeeMine(req, target.mineId)) return res.status(403).json({ error: 'This person works at another mine.' });
  if (!canMark(actor, target)) return res.status(403).json({ error: 'You can only mark people below you in the hierarchy.' });

  const date = shiftDate(target.shift, new Date(), target.mine?.shiftStartHour);
  const existing = await prisma.attendance.findUnique({ where: { userId_date: { userId: target.id, date } }, select: RECORD_SELECT });
  if (existing) return res.status(409).json({ error: `${target.name} is already checked in for this shift.` });
  const blocked = (await employmentProblem(target)) || (await clearanceProblem(target, date));
  if (blocked) return res.status(409).json({ error: blocked });

  const record = await prisma.attendance.create({
    data: {
      userId: target.id,
      mineId: target.mineId,
      date,
      checkInAt: new Date(),
      source: 'MANUAL',
      markedById: actor.id,
      markedByName: actor.name,
      note,
    },
    select: RECORD_SELECT,
  });
  await prisma.notification.create({
    data: { userId: target.id, title: 'Marked present', message: `${actor.name} marked you present today: ${note}`, type: 'INFO' },
  });
  return res.status(201).json(record);
});

// DELETE /api/attendance/mark/:id  (undo a manual mark from today)
router.delete('/mark/:id', requireLevel('SIRDAR'), async (req: AuthenticatedRequest, res: Response) => {
  const record = await prisma.attendance.findUnique({ where: { id: String(req.params.id) }, include: { user: true, mine: { select: { shiftStartHour: true } } } });
  if (!record) return res.status(404).json({ error: 'Record not found.' });
  if (record.source !== 'MANUAL') return res.status(400).json({ error: 'Only manual marks can be undone. GPS check-ins stay on record.' });
  if (record.date !== shiftDate(record.user.shift, new Date(), record.mine.shiftStartHour)) return res.status(400).json({ error: 'Only marks from the current shift can be undone.' });
  if (!canSeeMine(req, record.mineId) || !canMark(req.user!, record.user)) {
    return res.status(403).json({ error: 'You cannot change this record.' });
  }
  await prisma.attendance.delete({ where: { id: record.id } });
  return res.json({ ok: true });
});

// GET /api/attendance/mine/:mineId?date=YYYY-MM-DD&shift=&districtId=  (Sirdar and above; own mine unless DGMS or admin)
router.get('/mine/:mineId', requireLevel('SIRDAR'), async (req: AuthenticatedRequest, res: Response) => {
  const mineId = String(req.params.mineId);
  if (!canSeeMine(req, mineId)) return res.status(403).json({ error: 'You can only view attendance for your own mine.' });
  const mine = await prisma.mine.findUnique({
    where: { id: mineId },
    select: { id: true, name: true, latitude: true, longitude: true, radiusMeters: true, shiftStartHour: true },
  });
  if (!mine) return res.status(404).json({ error: 'Mine not found' });

  const today = currentShift(new Date(), mine.shiftStartHour).date;
  const date = isDateString(req.query.date) ? req.query.date : today;
  const shift = isShift(req.query.shift) ? req.query.shift : undefined;
  const districtId = req.query.districtId ? String(req.query.districtId) : undefined;
  // A shift filter keeps the people without a shift (officers, managers) out; a district filter keeps only that crew.
  const staffWhere = { mineId, status: 'APPROVED', role: { not: null }, ...(shift ? { shift } : {}), ...(districtId ? { districtId } : {}) };

  const trendDates = recentDates(7, new Date(`${date}T12:00:00+05:30`));
  const [staff, records, trendRows] = await Promise.all([
    prisma.user.findMany({ where: staffWhere, select: PERSON_SELECT }),
    prisma.attendance.findMany({ where: { mineId, date }, select: { ...RECORD_SELECT, userId: true } }),
    prisma.attendance.groupBy({ by: ['date'], where: { mineId, date: { in: trendDates }, user: staffWhere }, _count: { _all: true } }),
  ]);

  const byUser = new Map(records.map(({ userId, ...rec }) => [userId, rec]));
  const order = (role: string | null) => ROLES.indexOf(role as any);
  const people = staff
    .map((p) => ({ ...p, attendance: byUser.get(p.id) || null }))
    .sort((a, b) => order(a.role) - order(b.role) || a.name.localeCompare(b.name));
  const counts = new Map(trendRows.map((t) => [t.date, t._count._all]));

  return res.json({
    date,
    today,
    mine,
    people,
    summary: { total: people.length, present: people.filter((p) => p.attendance).length },
    trend: trendDates.map((d) => ({ date: d, present: counts.get(d) || 0 })),
  });
});

export default router;
