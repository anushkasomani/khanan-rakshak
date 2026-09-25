import { Router, Response } from 'express';
import { AuthenticatedRequest, AuthUser, canSeeMine, actorRole } from '../middleware/auth';
import { roleLevel, ROLE_LEVEL, SHIFT_ROLES } from '../roles';
import { shiftDate, currentShift, previousShift, nextShift, shiftLabel, isShift } from '../shifts';
import { isDateString } from '../geo';
import { AuditService } from '../services/auditService';
import { prisma } from '../db';

const router = Router();

export const CHECKS = ['GAS', 'ROOF', 'VENTILATION', 'EQUIPMENT'] as const;
const STATUSES = ['SAFE', 'RESTRICTED', 'UNSAFE'];
const STATUS_WORD: Record<string, string> = { SAFE: 'safe', RESTRICTED: 'safe with restrictions', UNSAFE: 'unsafe' };

const REPORT_INCLUDE = {
  district: { select: { id: true, name: true, location: true } },
  sirdar: { select: { id: true, name: true, phone: true } },
  mine: { select: { shiftStartHour: true } },
} as const;

const parse = <T>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};

type ReportRow = NonNullable<Awaited<ReturnType<typeof loadReport>>>;
const loadReport = (id: string) => prisma.shiftReport.findUnique({ where: { id }, include: REPORT_INCLUDE });
const present = ({ checks, history, ...r }: ReportRow) => ({ ...r, checks: parse(checks, {}), history: parse(history, []) });

const isOvermanOrAbove = (u: AuthUser) => u.isAdmin || roleLevel(u.role) >= ROLE_LEVEL.OVERMAN;
/** People in the mine's own chain who can act on a report. DGMS inspects and reads, but doesn't run the shift. */
const canActOnReports = (u: AuthUser) => isOvermanOrAbove(u) && u.role !== 'DGMS';

async function notify(userIds: string[], title: string, message: string, type = 'INFO') {
  const ids = [...new Set(userIds)];
  if (ids.length) await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, title, message, type })) });
}

/** Workers and Sirdars of one district and shift. */
const crewWhere = (mineId: string, districtId: string, shift: string) => ({ mineId, districtId, shift, status: 'APPROVED' });

/** Overmen of that shift plus the people above them who follow the whole mine. */
async function shiftLeads(mineId: string, shift: string, alsoManagers = false) {
  const people = await prisma.user.findMany({
    where: {
      mineId,
      status: 'APPROVED',
      OR: [
        { role: 'OVERMAN', shift },
        ...(alsoManagers ? [{ role: { in: ['ASSISTANT_MANAGER', 'MINE_MANAGER'] } }, { role: 'OFFICER', officerType: 'SAFETY' }] : []),
      ],
    },
    select: { id: true },
  });
  return people.map((p) => p.id);
}

// GET /api/shifts/me  (your shift today: the district, the Sirdar's report, and for a Sirdar the crew and the handover)
router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  if (!u.role || !SHIFT_ROLES.includes(u.role) || !u.shift) return res.json(null);
  const date = shiftDate(u.shift, new Date(), u.shiftStartHour);
  const base = { shift: u.shift, shiftLabel: shiftLabel(u.shift, u.shiftStartHour), date };
  if (!u.districtId || !u.mineId) return res.json({ ...base, district: null, report: null });

  const [district, report] = await Promise.all([
    prisma.district.findUnique({ where: { id: u.districtId }, select: { id: true, name: true, location: true } }),
    prisma.shiftReport.findUnique({ where: { districtId_date_shift: { districtId: u.districtId, date, shift: u.shift } }, include: REPORT_INCLUDE }),
  ]);
  if (u.role !== 'SIRDAR') {
    const sirdars = await prisma.user.findMany({
      where: { ...crewWhere(u.mineId, u.districtId, u.shift), role: 'SIRDAR' },
      select: { id: true, name: true, phone: true },
    });
    return res.json({ ...base, district, report: report && present(report), sirdars });
  }

  const prev = previousShift(u.shift, date);
  const [previous, crew, attendance, mine] = await Promise.all([
    prisma.shiftReport.findUnique({ where: { districtId_date_shift: { districtId: u.districtId, ...prev } }, include: REPORT_INCLUDE }),
    prisma.user.findMany({
      where: { ...crewWhere(u.mineId, u.districtId, u.shift), role: 'WORKER' },
      select: { id: true, name: true, role: true, trade: true, badgeNumber: true, phone: true, trainingValidUntil: true, contract: { select: { id: true, title: true, contractor: { select: { name: true } } } } },
      orderBy: { name: 'asc' },
    }),
    prisma.attendance.findMany({ where: { mineId: u.mineId, date }, select: { userId: true, id: true, checkInAt: true, checkOutAt: true, source: true, markedByName: true, note: true, syncedLate: true, date: true, checkInDistance: true } }),
    prisma.mine.findUnique({ where: { id: u.mineId }, select: { name: true } }),
  ]);
  const byUser = new Map(attendance.map(({ userId, ...a }) => [userId, a]));
  return res.json({
    ...base,
    mineName: mine?.name,
    district,
    report: report && present(report),
    previous: previous && { ...present(previous), shiftLabel: shiftLabel(previous.shift, u.shiftStartHour) },
    checkedIn: byUser.has(u.id),
    crew: crew.map((p) => ({ ...p, attendance: byUser.get(p.id) || null })),
  });
});

function parseChecks(body: any): { checks?: Record<string, { ok: boolean; note: string | null }>; error?: string } {
  const out: Record<string, { ok: boolean; note: string | null }> = {};
  for (const key of CHECKS) {
    const c = body?.checks?.[key];
    if (!c || typeof c.ok !== 'boolean') return { error: 'Answer every check.' };
    const note = String(c.note || '').trim();
    if (!c.ok && note.length < 3) return { error: 'Say what is wrong for every check that is not OK.' };
    out[key] = { ok: c.ok, note: note || null };
  }
  return { checks: out };
}

function parseStatus(status: unknown, restrictions: string, note: string, anyProblem: boolean): string | null {
  if (!STATUSES.includes(String(status))) return 'Say whether the district is safe to work.';
  if (status === 'SAFE' && anyProblem) return 'A check is not OK, so the district cannot be marked fully safe. Choose restricted or unsafe.';
  if (status === 'RESTRICTED' && restrictions.length < 3) return 'Say which places are fenced off.';
  if (status === 'UNSAFE' && note.length < 3) return 'Say why the district is unsafe.';
  return null;
}

// POST /api/shifts/reports  (Sirdar: pre-shift inspection of their own district for their current shift)
router.post('/reports', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  if (u.role !== 'SIRDAR' || !u.districtId || !u.shift || !u.mineId) {
    return res.status(403).json({ error: 'Only the Sirdar of a district can submit its pre-shift inspection.' });
  }
  const date = shiftDate(u.shift, new Date(), u.shiftStartHour);
  if (!(await prisma.attendance.findUnique({ where: { userId_date: { userId: u.id, date } } }))) {
    return res.status(409).json({ error: 'Check in first, so the report shows you were on site.' });
  }
  if (await prisma.shiftReport.findUnique({ where: { districtId_date_shift: { districtId: u.districtId, date, shift: u.shift } } })) {
    return res.status(409).json({ error: 'The pre-shift inspection for this shift is already submitted.' });
  }

  const { checks, error } = parseChecks(req.body);
  if (error) return res.status(400).json({ error });
  const restrictions = String(req.body?.restrictions || '').trim();
  const notes = String(req.body?.notes || '').trim();
  if (restrictions.length > 500 || notes.length > 1000) return res.status(400).json({ error: 'Keep the notes shorter.' });
  const anyProblem = Object.values(checks!).some((c) => !c.ok);
  const statusProblem = parseStatus(req.body?.status, restrictions, notes, anyProblem);
  if (statusProblem) return res.status(400).json({ error: statusProblem });
  const methane = req.body?.methanePct;
  const methanePct = methane === undefined || methane === null || methane === '' ? null : Number(methane);
  if (methanePct !== null && (!Number.isFinite(methanePct) || methanePct < 0 || methanePct > 100)) {
    return res.status(400).json({ error: 'Enter the methane reading as a percentage, for example 0.3.' });
  }

  const created = await prisma.shiftReport.create({
    data: {
      mineId: u.mineId,
      districtId: u.districtId,
      date,
      shift: u.shift,
      sirdarId: u.id,
      status: req.body.status,
      checks: JSON.stringify(checks),
      methanePct,
      restrictions: restrictions || null,
      notes: notes || null,
    },
    include: REPORT_INCLUDE,
  });

  const block = await AuditService.recordEvent({
    recordType: 'SHIFT_REPORT',
    recordId: created.id,
    action: 'CREATED',
    performedByRole: actorRole(req),
    data: { id: created.id, district: created.district.name, date, shift: u.shift, status: created.status, checks, methanePct },
  });
  if (block) await prisma.shiftReport.update({ where: { id: created.id }, data: { recordHash: block.currentHash } });

  const crew = await prisma.user.findMany({ where: { ...crewWhere(u.mineId, u.districtId, u.shift), role: 'WORKER' }, select: { id: true } });
  const where = `${created.district.name}, ${shiftLabel(u.shift, u.shiftStartHour)}`;
  if (created.status === 'UNSAFE') {
    await notify(crew.map((c) => c.id), `Do not go in: ${created.district.name}`, `${u.name} found the district unsafe: ${notes}`, 'WARNING');
    await notify(await shiftLeads(u.mineId, u.shift, true), `Unsafe: ${where}`, `${u.name}: ${notes}`, 'WARNING');
  } else {
    await notify(
      crew.map((c) => c.id),
      `${created.district.name} cleared. You can check in.`,
      created.status === 'RESTRICTED' ? `Keep out of: ${restrictions}` : `${u.name} has inspected the district.`
    );
    await notify(await shiftLeads(u.mineId, u.shift), `Pre-shift report: ${where}`, `${u.name} marked it ${STATUS_WORD[created.status]}.`);
  }
  return res.status(201).json(present({ ...created, recordHash: block?.currentHash ?? null }));
});

async function reportFor(req: AuthenticatedRequest, res: Response) {
  const report = await loadReport(String(req.params.id));
  if (!report) {
    res.status(404).json({ error: 'Report not found.' });
    return null;
  }
  if (!canSeeMine(req, report.mineId)) {
    res.status(403).json({ error: 'This report is from another mine.' });
    return null;
  }
  return report;
}

// PATCH /api/shifts/reports/:id/status  { status, restrictions?, note }  (the Sirdar, or Overman and above)
// Used mid-shift: pull everyone out (UNSAFE), or clear the district again after re-inspecting.
router.patch('/reports/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const report = await reportFor(req, res);
  if (!report) return;
  if (report.sirdarId !== u.id && !canActOnReports(u)) return res.status(403).json({ error: 'Only the Sirdar or someone above can change this.' });

  const note = String(req.body?.note || '').trim();
  const restrictions = String(req.body?.restrictions ?? report.restrictions ?? '').trim();
  if (note.length < 3) return res.status(400).json({ error: 'Say what changed.' });
  // Clearing the district again is a fresh judgement after re-inspecting, so the original checks don't block it.
  const problem = parseStatus(req.body?.status, restrictions, note, false);
  if (problem) return res.status(400).json({ error: problem });
  if (req.body.status === report.status && req.body.status !== 'RESTRICTED') return res.status(409).json({ error: `It is already marked ${STATUS_WORD[report.status]}.` });

  const history = [...parse<any[]>(report.history, []), { at: new Date().toISOString(), by: u.name, from: report.status, status: req.body.status, note }];
  const updated = await prisma.shiftReport.update({
    where: { id: report.id },
    data: { status: req.body.status, restrictions: req.body.status === 'RESTRICTED' ? restrictions : report.restrictions, history: JSON.stringify(history) },
    include: REPORT_INCLUDE,
  });
  await AuditService.recordEvent({
    recordType: 'SHIFT_REPORT',
    recordId: report.id,
    action: 'STATUS_CHANGED',
    performedByRole: actorRole(req),
    data: { id: report.id, from: report.status, to: updated.status, note },
  });

  const crew = await prisma.user.findMany({ where: { ...crewWhere(report.mineId, report.districtId, report.shift), role: 'WORKER' }, select: { id: true } });
  const where = `${report.district.name}, ${shiftLabel(report.shift, report.mine.shiftStartHour)}`;
  if (updated.status === 'UNSAFE') {
    await notify(crew.map((c) => c.id), `Leave ${report.district.name} now`, `${u.name}: ${note}`, 'SOS');
    await notify(await shiftLeads(report.mineId, report.shift, true), `Workers withdrawn: ${where}`, `${u.name}: ${note}`, 'WARNING');
  } else {
    await notify(crew.map((c) => c.id), `${report.district.name} is ${STATUS_WORD[updated.status]} again`, `${u.name}: ${note}`);
    await notify(await shiftLeads(report.mineId, report.shift), `${where} is ${STATUS_WORD[updated.status]}`, `${u.name}: ${note}`);
  }
  return res.json(present(updated));
});

// POST /api/shifts/reports/:id/seen  { note? }  (Overman or above confirms they read it)
router.post('/reports/:id/seen', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const report = await reportFor(req, res);
  if (!report) return;
  if (!canActOnReports(u) || report.sirdarId === u.id) return res.status(403).json({ error: 'Only the Overman or someone above can sign this off.' });
  const note = String(req.body?.note || '').trim();
  if (note.length > 500) return res.status(400).json({ error: 'Keep the note under 500 characters.' });

  const updated = await prisma.shiftReport.update({
    where: { id: report.id },
    data: { seenById: u.id, seenByName: u.name, seenAt: new Date(), seenNote: note || null },
    include: REPORT_INCLUDE,
  });
  await AuditService.recordEvent({
    recordType: 'SHIFT_REPORT',
    recordId: report.id,
    action: 'VERIFIED',
    performedByRole: actorRole(req),
    data: { id: report.id, seenBy: u.name, note: note || null },
  });
  await notify([report.sirdarId], `${u.name} read your report`, note || `${report.district.name}, ${shiftLabel(report.shift, report.mine.shiftStartHour)}`);
  return res.json(present(updated));
});

// POST /api/shifts/reports/:id/handover  { note }  (the Sirdar, at the end of the shift, for the next Sirdar)
router.post('/reports/:id/handover', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const report = await reportFor(req, res);
  if (!report) return;
  if (report.sirdarId !== u.id && !canActOnReports(u)) return res.status(403).json({ error: 'Only the Sirdar of this shift can write the handover.' });
  const note = String(req.body?.note || '').trim();
  if (note.length < 3) return res.status(400).json({ error: 'Write what the next shift needs to know.' });
  if (note.length > 1000) return res.status(400).json({ error: 'Keep the handover under 1000 characters.' });

  const updated = await prisma.shiftReport.update({
    where: { id: report.id },
    data: { handoverNote: note, handoverAt: new Date() },
    include: REPORT_INCLUDE,
  });
  const next = nextShift(report.shift, report.date);
  const nextSirdars = await prisma.user.findMany({
    where: { ...crewWhere(report.mineId, report.districtId, next.shift), role: 'SIRDAR' },
    select: { id: true },
  });
  await notify(
    [...nextSirdars.map((s) => s.id), ...(await shiftLeads(report.mineId, next.shift))],
    `Handover for ${report.district.name}`,
    `From ${report.sirdar.name}: ${note}`
  );
  return res.json(present(updated));
});

// GET /api/shifts/board?mineId=&date=&shift=  (Overman and above: every district of the mine for one shift)
router.get('/board', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  if (!isOvermanOrAbove(u)) return res.status(403).json({ error: 'Only the Overman and above see every district.' });
  const mineId = String(req.query.mineId || u.mineId || '');
  if (!mineId || !canSeeMine(req, mineId)) return res.status(403).json({ error: 'You can only see your own mine.' });

  const mine = await prisma.mine.findUnique({ where: { id: mineId }, select: { id: true, name: true, shiftStartHour: true } });
  if (!mine) return res.status(404).json({ error: 'Mine not found' });
  const now = currentShift(new Date(), mine.shiftStartHour);
  const own = u.role === 'OVERMAN' && u.shift && u.mineId === mineId ? { shift: u.shift, date: shiftDate(u.shift, new Date(), mine.shiftStartHour) } : now;
  const shift = isShift(req.query.shift) ? req.query.shift : own.shift;
  const date = isDateString(req.query.date) ? req.query.date : own.date;

  const [districts, reports, people, attendance, hazards] = await Promise.all([
    prisma.district.findMany({ where: { mineId }, orderBy: { name: 'asc' } }),
    prisma.shiftReport.findMany({ where: { mineId, date, shift }, include: REPORT_INCLUDE }),
    prisma.user.findMany({
      where: { mineId, shift, status: 'APPROVED', role: { in: ['WORKER', 'SIRDAR'] } },
      select: { id: true, name: true, phone: true, role: true, districtId: true },
    }),
    prisma.attendance.findMany({ where: { mineId, date }, select: { userId: true } }),
    prisma.safetyReport.groupBy({ by: ['districtId'], where: { mineId, status: { not: 'RESOLVED' } }, _count: { _all: true } }),
  ]);
  const presentIds = new Set(attendance.map((a) => a.userId));
  const openHazards = new Map(hazards.map((h) => [h.districtId, h._count._all]));
  const overmen = await prisma.user.findMany({ where: { mineId, shift, role: 'OVERMAN', status: 'APPROVED' }, select: { id: true, name: true, phone: true } });

  return res.json({
    mine,
    date,
    shift,
    shiftLabel: shiftLabel(shift, mine.shiftStartHour),
    current: now,
    overmen,
    districts: districts.map((d) => {
      const report = reports.find((r) => r.districtId === d.id);
      const crew = people.filter((p) => p.districtId === d.id && p.role === 'WORKER');
      return {
        id: d.id,
        name: d.name,
        location: d.location,
        report: report ? present(report) : null,
        sirdars: people.filter((p) => p.districtId === d.id && p.role === 'SIRDAR').map(({ id, name, phone }) => ({ id, name, phone })),
        crew: { total: crew.length, present: crew.filter((p) => presentIds.has(p.id)).length },
        openHazards: openHazards.get(d.id) || 0,
      };
    }),
  });
});

export default router;
