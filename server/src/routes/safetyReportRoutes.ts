import { Router, Response } from 'express';
import { optionalAuthenticate, AuthenticatedRequest, AuthUser, requireLevel, actorRole, mineFilter, canSeeMine } from '../middleware/auth';
import { AuditService } from '../services/auditService';
import { resolveHazard } from '../services/hazardService';
import { roleLevel, ROLE_LEVEL } from '../roles';
import { currentShift } from '../shifts';
import { prisma } from '../db';

const router = Router();

const INCLUDE = {
  mine: { select: { id: true, name: true, code: true } },
  district: { select: { id: true, name: true, location: true } },
  reporter: { select: { id: true, name: true, badgeNumber: true } },
} as const;

const shiftStart = async (mineId: string) => (await prisma.mine.findUnique({ where: { id: mineId }, select: { shiftStartHour: true } }))?.shiftStartHour;

async function notify(userIds: string[], title: string, message: string, type = 'INFO') {
  const ids = [...new Set(userIds)];
  if (ids.length) await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, title, message, type })) });
}

/** The people who act on a hazard: the district's Sirdar and the Overman on shift now, officers, and managers for serious ones. */
async function responders(mineId: string, districtId: string | null, serious: boolean) {
  const { shift } = currentShift(new Date(), await shiftStart(mineId));
  const people = await prisma.user.findMany({
    where: {
      mineId,
      status: 'APPROVED',
      OR: [
        ...(districtId ? [{ role: 'SIRDAR', districtId, shift }] : []),
        { role: 'OVERMAN', shift },
        { role: 'OFFICER' },
        ...(serious ? [{ role: { in: ['ASSISTANT_MANAGER', 'MINE_MANAGER'] } }] : []),
      ],
    },
    select: { id: true },
  });
  return people.map((p) => p.id);
}

// GET /api/safety-reports?mineId=&districtId=&severity=&status=&category=
router.get('/', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { mineId, districtId, severity, status, category, limit } = req.query;

  const where: any = {};
  const scope = mineFilter(req, mineId);
  if (scope) where.mineId = scope;
  if (districtId) where.districtId = String(districtId);
  if (severity) where.severity = String(severity);
  if (status) where.status = status === 'OPEN' ? { not: 'RESOLVED' } : String(status);
  if (category) where.category = String(category);

  const reports = await prisma.safetyReport.findMany({
    where,
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: limit ? parseInt(String(limit), 10) : 50,
  });
  return res.json(reports);
});

// POST /api/safety-reports
router.post('/', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { mineId, category, severity, description, immediateActionTaken, imageUrl } = req.body;
  if (!mineId || !category || !severity || !description) {
    return res.status(400).json({ error: 'Mine, category, severity, and description are required' });
  }
  if (req.user && !canSeeMine(req, String(mineId))) return res.status(403).json({ error: 'You can only report hazards at your own mine.' });

  // Default to the reporter's own district; they can pick another if they saw it elsewhere.
  const districtId = req.body.districtId || (req.user?.mineId === mineId ? req.user?.districtId : null) || null;
  if (districtId) {
    const district = await prisma.district.findUnique({ where: { id: String(districtId) } });
    if (!district || district.mineId !== mineId) return res.status(400).json({ error: 'That district is not part of this mine.' });
  }

  const id = `SAFE-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
  const report = await prisma.safetyReport.create({
    data: {
      id,
      reporterId: req.user?.id ?? null,
      mineId,
      districtId,
      category,
      severity,
      description,
      immediateActionTaken: immediateActionTaken || null,
      imageUrl: imageUrl || null,
      status: 'SUBMITTED',
    },
    include: INCLUDE,
  });

  const auditBlock = await AuditService.recordEvent({
    recordType: 'SAFETY_REPORT',
    recordId: report.id,
    action: 'CREATED',
    performedByRole: actorRole(req, 'ANONYMOUS_WORKER'),
    data: {
      id: report.id,
      category: report.category,
      severity: report.severity,
      mineId: report.mineId,
      district: report.district?.name || null,
      description: report.description,
      timestamp: report.createdAt,
    },
  });
  if (auditBlock) await prisma.safetyReport.update({ where: { id: report.id }, data: { recordHash: auditBlock.currentHash } });

  const serious = report.severity === 'CRITICAL' || report.severity === 'HIGH';
  await notify(
    (await responders(report.mineId, report.districtId, serious)).filter((uid) => uid !== req.user?.id),
    `Hazard: ${report.category.replace(/_/g, ' ').toLowerCase()}${report.district ? ` in ${report.district.name}` : ''}`,
    `[${report.severity}] ${report.description.slice(0, 140)}`,
    serious ? 'WARNING' : 'INFO'
  );

  return res.status(201).json({ report: { ...report, recordHash: auditBlock?.currentHash ?? null }, auditBlock });
});

async function load(req: AuthenticatedRequest, res: Response) {
  const report = await prisma.safetyReport.findUnique({ where: { id: String(req.params.id) }, include: INCLUDE });
  if (!report) {
    res.status(404).json({ error: 'Hazard report not found.' });
    return null;
  }
  if (!canSeeMine(req, report.mineId)) {
    res.status(403).json({ error: 'This report is from another mine.' });
    return null;
  }
  return report;
}

/** DGMS reviews hazards but the mine's own people handle them. */
function mineStaffOnly(req: AuthenticatedRequest, res: Response, next: () => void) {
  if (req.user?.role === 'DGMS') return res.status(403).json({ error: "DGMS can review hazards but the mine's own staff handle them." });
  next();
}

const fresh = (id: string) => prisma.safetyReport.findUniqueOrThrow({ where: { id }, include: INCLUDE });

/** Someone strictly above the person who fixed it (and never that person) confirms the fix. */
const canVerify = async (u: AuthUser, fixedById: string | null) => {
  if (u.id === fixedById) return false;
  if (u.isAdmin) return true;
  const fixer = fixedById ? await prisma.user.findUnique({ where: { id: fixedById }, select: { role: true } }) : null;
  return roleLevel(u.role) >= ROLE_LEVEL.OVERMAN && roleLevel(u.role) > roleLevel(fixer?.role);
};

// POST /api/safety-reports/:id/acknowledge  (Sirdar and above take it on)
router.post('/:id/acknowledge', requireLevel('SIRDAR'), mineStaffOnly, async (req: AuthenticatedRequest, res: Response) => {
  const report = await load(req, res);
  if (!report) return;
  if (report.status !== 'SUBMITTED') return res.status(409).json({ error: 'Someone has already taken this on.' });
  await prisma.safetyReport.update({ where: { id: report.id }, data: { status: 'ASSIGNED', assignedOfficer: req.user!.name } });
  await AuditService.recordEvent({
    recordType: 'SAFETY_REPORT',
    recordId: report.id,
    action: 'STATUS_CHANGED',
    performedByRole: actorRole(req),
    data: { id: report.id, status: 'ASSIGNED', by: req.user!.name },
  });
  if (report.reporterId && report.reporterId !== req.user!.id) {
    await notify([report.reporterId], `${req.user!.name} is handling your report`, report.description.slice(0, 140));
  }
  return res.json(await fresh(report.id));
});

// POST /api/safety-reports/:id/fixed  { note }  (Sirdar and above say the work is done; someone above then checks it)
router.post('/:id/fixed', requireLevel('SIRDAR'), mineStaffOnly, async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const report = await load(req, res);
  if (!report) return;
  if (report.status === 'RESOLVED' || report.status === 'FIXED') return res.status(409).json({ error: 'This is already marked fixed.' });
  const note = String(req.body?.note || '').trim();
  if (note.length < 3) return res.status(400).json({ error: 'Say what was done.' });
  if (note.length > 1000) return res.status(400).json({ error: 'Keep it under 1000 characters.' });

  await prisma.safetyReport.update({
    where: { id: report.id },
    data: {
      status: 'FIXED',
      assignedOfficer: report.assignedOfficer || u.name,
      fixedById: u.id,
      fixedByName: u.name,
      fixedAt: new Date(),
      fixNote: note,
      verifiedByName: null,
      verifiedAt: null,
      verifyNote: null,
    },
  });
  await AuditService.recordEvent({
    recordType: 'SAFETY_REPORT',
    recordId: report.id,
    action: 'STATUS_CHANGED',
    performedByRole: actorRole(req),
    data: { id: report.id, status: 'FIXED', by: u.name, note },
  });

  // Tell the people above the fixer who can confirm it.
  const { shift } = currentShift(new Date(), await shiftStart(report.mineId));
  const checkers = await prisma.user.findMany({
    where: {
      mineId: report.mineId,
      status: 'APPROVED',
      id: { not: u.id },
      OR: [{ role: 'OVERMAN', shift }, { role: { in: ['OFFICER', 'ASSISTANT_MANAGER'] } }],
    },
    select: { id: true, role: true },
  });
  await notify(
    checkers.filter((c) => roleLevel(c.role) > roleLevel(u.role)).map((c) => c.id),
    `Check a fix${report.district ? ` in ${report.district.name}` : ''}`,
    `${u.name} says it is fixed: ${note.slice(0, 120)}`
  );
  return res.json(await fresh(report.id));
});

// POST /api/safety-reports/:id/verify  { decision: CONFIRM | REOPEN, note }
router.post('/:id/verify', mineStaffOnly, async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const report = await load(req, res);
  if (!report) return;
  if (report.status !== 'FIXED') return res.status(409).json({ error: 'This is not waiting for a check.' });
  if (!(await canVerify(u, report.fixedById))) return res.status(403).json({ error: 'Only someone above the person who fixed it can confirm it.' });

  const { decision } = req.body || {};
  const note = String(req.body?.note || '').trim();
  if (decision !== 'CONFIRM' && decision !== 'REOPEN') return res.status(400).json({ error: 'Confirm the fix or send it back.' });
  if (decision === 'REOPEN' && note.length < 3) return res.status(400).json({ error: 'Say what is still wrong.' });

  if (decision === 'CONFIRM') {
    const { awardedPoints } = await resolveHazard(report.id, { name: u.name, role: actorRole(req) }, note || null);
    if (report.fixedById && report.fixedById !== u.id) await notify([report.fixedById], `Fix confirmed by ${u.name}`, report.description.slice(0, 140));
    return res.json({ report: await fresh(report.id), awardedPoints });
  }

  await prisma.safetyReport.update({
    where: { id: report.id },
    data: { status: 'ASSIGNED', verifiedByName: u.name, verifiedAt: new Date(), verifyNote: note },
  });
  await AuditService.recordEvent({
    recordType: 'SAFETY_REPORT',
    recordId: report.id,
    action: 'STATUS_CHANGED',
    performedByRole: actorRole(req),
    data: { id: report.id, status: 'REOPENED', by: u.name, note },
  });
  if (report.fixedById) await notify([report.fixedById], `Not fixed yet: ${report.id}`, `${u.name}: ${note}`, 'WARNING');
  return res.json({ report: await fresh(report.id), awardedPoints: 0 });
});

// POST /api/safety-reports/:id/inspection  { assignedToId, dueDate, note? }  (Overman and above send someone to check the fix)
router.post('/:id/inspection', requireLevel('OVERMAN'), mineStaffOnly, async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const report = await load(req, res);
  if (!report) return;
  if (report.status !== 'FIXED') return res.status(409).json({ error: 'Send an inspection once the hazard is marked fixed.' });
  if (report.inspectionId) {
    const open = await prisma.inspection.findUnique({ where: { id: report.inspectionId } });
    if (open && ['SCHEDULED', 'SUBMITTED', 'RETURNED'].includes(open.status)) {
      return res.status(409).json({ error: `${open.inspectorName} is already inspecting this.` });
    }
  }
  const person = await prisma.user.findUnique({ where: { id: String(req.body?.assignedToId || '') } });
  if (!person || person.status !== 'APPROVED' || person.mineId !== report.mineId) return res.status(400).json({ error: 'Choose someone at this mine.' });
  if (person.id === report.fixedById) return res.status(400).json({ error: 'The person who fixed it cannot inspect their own work.' });
  if (person.id === u.id) return res.status(400).json({ error: 'Choose someone else, or confirm the fix yourself.' });
  const due = new Date(req.body?.dueDate);
  if (Number.isNaN(due.getTime())) return res.status(400).json({ error: 'Choose a due date.' });

  const id = `INS-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
  const note = String(req.body?.note || '').trim();
  const title = `Check fix: ${report.description.slice(0, 60)}${report.description.length > 60 ? '…' : ''}`;
  await prisma.inspection.create({
    data: {
      id,
      mineId: report.mineId,
      inspectionType: report.category === 'STRUCTURAL' ? 'ROOF_SUPPORT_CHECK' : report.category === 'VENTILATION' || report.category === 'GAS' ? 'VENTILATION_AUDIT' : report.category === 'ELECTRICAL' ? 'ELECTRICAL_SAFETY' : report.category === 'MACHINERY' ? 'MACHINERY_CHECK' : 'ROUTINE',
      title,
      inspectorName: person.name,
      checklistData: '[]',
      findings: note,
      deadline: due,
      status: 'SCHEDULED',
      assignedToId: person.id,
      assignedById: u.id,
      assignedByName: u.name,
      hazardId: report.id,
    },
  });
  await prisma.safetyReport.update({ where: { id: report.id }, data: { inspectionId: id } });
  await notify(
    [person.id],
    `Inspection assigned: ${title}`,
    `${u.name} asked you to check this fix${report.district ? ` in ${report.district.name}` : ''} by ${due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.${note ? ` ${note}` : ''}`,
    'WARNING'
  );
  await AuditService.recordEvent({
    recordType: 'INSPECTION',
    recordId: id,
    action: 'CREATED',
    performedByRole: actorRole(req),
    data: { id, hazard: report.id, assignedTo: person.name, due: due.toISOString() },
  });
  return res.status(201).json(await fresh(report.id));
});

export default router;
