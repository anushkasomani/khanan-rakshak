import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest, AuthUser, requireLevel, canSeeMine, actorRole } from '../middleware/auth';
import { Role, ROLE_LEVEL, ROLE_LABEL, roleLevel, isRole, OFFICER_TYPES } from '../roles';
import { placeCalls } from '../services/voiceAlerts';
import { AuditService } from '../services/auditService';
import { prisma } from '../db';

const router = Router();

const TARGETS: Role[] = ['OVERMAN', 'OFFICER', 'ASSISTANT_MANAGER', 'MINE_MANAGER', 'OWNER', 'DGMS'];
const RECIPIENT_SELECT = { id: true, name: true, role: true, officerType: true, phone: true, badgeNumber: true } as const;
const ESCALATION_INCLUDE = {
  fromUser: { select: { id: true, name: true, role: true, officerType: true, phone: true } },
  mine: { select: { id: true, name: true } },
} as const;

const humanize = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const targetLabel = (role: string, officerType?: string | null) =>
  role === 'OFFICER' && officerType ? `${humanize(officerType)} officer` : ROLE_LABEL[role as Role] || role;

type RecordInfo = { mineId: string; mineName: string; summary: string; severe: boolean };

async function loadRecord(type: string, id: string): Promise<RecordInfo | null> {
  if (type === 'INCIDENT') {
    const inc = await prisma.incident.findUnique({ where: { id }, include: { mine: true } });
    if (!inc) return null;
    return {
      mineId: inc.mineId,
      mineName: inc.mine.name,
      summary: `${humanize(inc.incidentType)} · ${inc.location}`,
      severe: inc.severity === 'CRITICAL' || inc.severity === 'FATALITY',
    };
  }
  if (type === 'SOS') {
    const sos = await prisma.sosAlert.findUnique({ where: { id }, include: { mine: true, district: true } });
    if (!sos) return null;
    return {
      mineId: sos.mineId,
      mineName: sos.mine.name,
      summary: `SOS: ${humanize(sos.emergencyType)}${sos.district ? ` · ${sos.district.name}` : ''}`,
      severe: true,
    };
  }
  return null;
}

/** Levels this user may escalate to: strictly above their own. Admins may pick any. */
const allowedTargets = (u: AuthUser) => (u.isAdmin ? TARGETS : TARGETS.filter((t) => ROLE_LEVEL[t] > roleLevel(u.role)));

/** Who an escalation reaches. DGMS covers every mine; an Owner covers every mine of the company. */
async function recipientsWhere(mineId: string, toRole: string, toOfficerType?: string | null): Promise<Prisma.UserWhereInput> {
  const base = { status: 'APPROVED', role: toRole };
  if (toRole === 'DGMS') return base;
  if (toRole === 'OWNER') {
    const company = (await prisma.mine.findUnique({ where: { id: mineId }, select: { company: true } }))?.company;
    return company ? { ...base, mine: { company } } : { ...base, mineId };
  }
  return { ...base, mineId, ...(toRole === 'OFFICER' && toOfficerType ? { officerType: toOfficerType } : {}) };
}

const isRecipient = (u: AuthUser, e: { toRole: string; mineId: string; toOfficerType: string | null }) =>
  u.role === e.toRole && (e.toRole === 'DGMS' || u.mineId === e.mineId || !!u.mineIds?.includes(e.mineId)) && (!e.toOfficerType || u.officerType === e.toOfficerType);

function parseTarget(u: AuthUser, toRole: unknown, officerType: unknown): { toRole?: Role; toOfficerType?: string | null; error?: string } {
  if (!isRole(toRole) || !TARGETS.includes(toRole)) return { error: 'Choose who to escalate to.' };
  if (!allowedTargets(u).includes(toRole)) return { error: 'You can only escalate to a level above your own.' };
  if (officerType && (toRole !== 'OFFICER' || !(OFFICER_TYPES as readonly unknown[]).includes(officerType))) {
    return { error: 'Invalid officer type.' };
  }
  return { toRole, toOfficerType: toRole === 'OFFICER' && officerType ? String(officerType) : null };
}

// GET /api/escalations/recipients?mineId=&toRole=&officerType=  (preview who will be notified)
router.get('/recipients', requireLevel('SIRDAR'), async (req: AuthenticatedRequest, res: Response) => {
  const mineId = String(req.query.mineId || '');
  if (!mineId || !canSeeMine(req, mineId)) return res.status(403).json({ error: 'You can only escalate within your own mine.' });
  const { toRole, toOfficerType, error } = parseTarget(req.user!, req.query.toRole, req.query.officerType);
  if (error) return res.status(400).json({ error });
  const people = await prisma.user.findMany({ where: await recipientsWhere(mineId, toRole!, toOfficerType), select: RECIPIENT_SELECT, orderBy: { name: 'asc' } });
  return res.json(people);
});

// POST /api/escalations  { recordType, recordId, toRole, toOfficerType?, reason }
router.post('/', requireLevel('SIRDAR'), async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const { recordType, recordId, reason } = req.body || {};
  const record = await loadRecord(String(recordType), String(recordId));
  if (!record) return res.status(404).json({ error: 'Incident or SOS not found.' });
  if (!canSeeMine(req, record.mineId)) return res.status(403).json({ error: 'You can only escalate within your own mine.' });

  const { toRole, toOfficerType, error } = parseTarget(u, req.body?.toRole, req.body?.toOfficerType);
  if (error) return res.status(400).json({ error });
  const why = String(reason || '').trim();
  if (why.length < 3) return res.status(400).json({ error: 'Say briefly why this needs attention.' });
  if (why.length > 500) return res.status(400).json({ error: 'Keep the reason under 500 characters.' });

  const duplicate = await prisma.escalation.findFirst({
    where: { recordType, recordId, toRole, toOfficerType: toOfficerType ?? null, status: 'OPEN' },
  });
  if (duplicate) {
    return res.status(409).json({ error: `Already escalated to ${targetLabel(toRole!, toOfficerType)} and waiting for them to acknowledge.` });
  }

  const recipients = await prisma.user.findMany({
    where: await recipientsWhere(record.mineId, toRole!, toOfficerType),
    select: RECIPIENT_SELECT,
    orderBy: { name: 'asc' },
  });

  const voiceMessage = `Khanan Rakshak alert. ${record.summary} at ${record.mineName}. Escalated by ${u.name}. ${why}`;
  const callStatus = record.severe ? await placeCalls(recipients.map((r) => ({ name: r.name, phone: r.phone || '' })), voiceMessage) : 'NONE';

  const escalation = await prisma.escalation.create({
    data: {
      recordType,
      recordId,
      mineId: record.mineId,
      summary: record.summary,
      severe: record.severe,
      fromUserId: u.id,
      toRole: toRole!,
      toOfficerType: toOfficerType ?? null,
      reason: why,
      recipientCount: recipients.length,
      callStatus,
    },
    include: ESCALATION_INCLUDE,
  });

  if (recipients.length) {
    await prisma.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        title: `Escalated to you: ${record.summary}`,
        message: `${u.name} (${targetLabel(u.role || 'ADMIN', u.officerType)}) at ${record.mineName}: ${why}`,
        type: recordType === 'SOS' ? 'SOS' : 'WARNING',
      })),
    });
  }

  await AuditService.recordEvent({
    recordType: recordType === 'SOS' ? 'SOS_ALERT' : 'INCIDENT',
    recordId,
    action: 'ESCALATED',
    performedByRole: actorRole(req),
    data: { recordId, to: targetLabel(toRole!, toOfficerType), reason: why, recipients: recipients.length },
  });

  return res.status(201).json({ escalation, recipients, callStatus });
});

// GET /api/escalations?recordType=&recordId=  (history for one record)
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const recordType = String(req.query.recordType || '');
  const recordId = String(req.query.recordId || '');
  const record = await loadRecord(recordType, recordId);
  if (!record) return res.status(404).json({ error: 'Incident or SOS not found.' });
  if (!canSeeMine(req, record.mineId)) return res.status(403).json({ error: 'Not available for your mine.' });
  const list = await prisma.escalation.findMany({ where: { recordType, recordId }, include: ESCALATION_INCLUDE, orderBy: { createdAt: 'desc' } });
  return res.json(list);
});

// GET /api/escalations/inbox  (escalations addressed to me, and ones I sent)
router.get('/inbox', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const forMeWhere: Prisma.EscalationWhereInput | null = u.isAdmin
    ? {}
    : u.role && TARGETS.includes(u.role as Role)
      ? {
          toRole: u.role,
          ...(u.role === 'DGMS' ? {} : { mineId: u.mineIds ? { in: u.mineIds } : u.mineId || 'NO_MINE' }),
          OR: [{ toOfficerType: null }, { toOfficerType: u.officerType || '' }],
        }
      : null;

  const [forMe, sent] = await Promise.all([
    forMeWhere
      ? prisma.escalation.findMany({ where: forMeWhere, include: ESCALATION_INCLUDE, orderBy: [{ status: 'desc' }, { createdAt: 'desc' }], take: 50 })
      : Promise.resolve([]),
    prisma.escalation.findMany({ where: { fromUserId: u.id }, include: ESCALATION_INCLUDE, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  return res.json({ forMe, sent, canReceive: forMeWhere !== null });
});

// POST /api/escalations/:id/acknowledge
router.post('/:id/acknowledge', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const existing = await prisma.escalation.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'Escalation not found.' });
  if (!u.isAdmin && !isRecipient(u, existing)) return res.status(403).json({ error: 'This escalation was not sent to you.' });
  if (existing.status === 'ACKNOWLEDGED') {
    return res.json(await prisma.escalation.findUnique({ where: { id: existing.id }, include: ESCALATION_INCLUDE }));
  }

  const escalation = await prisma.escalation.update({
    where: { id: existing.id },
    data: { status: 'ACKNOWLEDGED', acknowledgedById: u.id, acknowledgedByName: u.name, acknowledgedAt: new Date() },
    include: ESCALATION_INCLUDE,
  });
  await prisma.notification.create({
    data: {
      userId: existing.fromUserId,
      title: `Acknowledged: ${existing.summary}`,
      message: `${u.name} (${targetLabel(u.role || 'ADMIN', u.officerType)}) has seen your escalation.`,
      type: 'INFO',
    },
  });
  await AuditService.recordEvent({
    recordType: existing.recordType === 'SOS' ? 'SOS_ALERT' : 'INCIDENT',
    recordId: existing.recordId,
    action: 'STATUS_CHANGED',
    performedByRole: actorRole(req),
    data: { escalationId: existing.id, acknowledgedBy: u.name },
  });
  return res.json(escalation);
});

export default router;
