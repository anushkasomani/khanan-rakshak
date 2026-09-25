import { Router, Response } from 'express';
import { AuthenticatedRequest, AuthUser, canSeeMine, mineFilter, actorRole } from '../middleware/auth';
import { roleLevel, ROLE_LEVEL } from '../roles';
import { shiftDate } from '../shifts';
import { AuditService } from '../services/auditService';
import { prisma } from '../db';

const router = Router();

export const WORK_TYPES = ['MDO', 'OB_REMOVAL', 'COAL_TRANSPORT', 'SUPPORT_WORK', 'MACHINERY_HIRE', 'CIVIL', 'ELECTRICAL', 'OTHER'];
const STATUSES = ['ACTIVE', 'SUSPENDED', 'ENDED'];
const DAY = 86400000;
const TRAINING_WARNING_DAYS = 30;

const INCLUDE = {
  contractor: true,
  district: { select: { id: true, name: true } },
  mine: { select: { id: true, name: true, shiftStartHour: true } },
} as const;

/** Anyone from the Overman up (and DGMS) can look; the managers and the owner issue and change contracts. */
const canView = (u: AuthUser) => u.isAdmin || roleLevel(u.role) >= ROLE_LEVEL.OVERMAN;
const canManage = (u: AuthUser) => u.isAdmin || (roleLevel(u.role) >= ROLE_LEVEL.ASSISTANT_MANAGER && u.role !== 'DGMS');

type TrainingState = 'OK' | 'EXPIRING' | 'EXPIRED' | 'MISSING';
const trainingState = (until: Date | null, now = Date.now()): TrainingState =>
  !until ? 'MISSING' : until.getTime() < now ? 'EXPIRED' : until.getTime() < now + TRAINING_WARNING_DAYS * DAY ? 'EXPIRING' : 'OK';

async function notify(userIds: string[], title: string, message: string, type = 'INFO') {
  if (userIds.length) await prisma.notification.createMany({ data: userIds.map((userId) => ({ userId, title, message, type })) });
}

/** Workers, who is on site this shift, training problems and open incidents for each contract. */
async function summarise(contracts: { id: string; mineId: string; mine: { shiftStartHour: number } }[]) {
  const ids = contracts.map((c) => c.id);
  const [workers, incidents] = await Promise.all([
    prisma.user.findMany({
      where: { contractId: { in: ids }, status: 'APPROVED' },
      select: { id: true, contractId: true, shift: true, trainingValidUntil: true, attendance: { select: { date: true }, orderBy: { date: 'desc' }, take: 1 } },
    }),
    prisma.incident.groupBy({ by: ['contractId'], where: { contractId: { in: ids }, status: { notIn: ['RESOLVED', 'CLOSED'] } }, _count: { _all: true } }),
  ]);
  const openIncidents = new Map(incidents.map((i) => [i.contractId, i._count._all]));
  return new Map(
    contracts.map((c) => {
      const mine = workers.filter((w) => w.contractId === c.id);
      const states = mine.map((w) => trainingState(w.trainingValidUntil));
      return [
        c.id,
        {
          workers: mine.length,
          presentNow: mine.filter((w) => w.attendance[0]?.date === shiftDate(w.shift, new Date(), c.mine.shiftStartHour)).length,
          trainingExpired: states.filter((s) => s === 'EXPIRED' || s === 'MISSING').length,
          trainingExpiring: states.filter((s) => s === 'EXPIRING').length,
          openIncidents: openIncidents.get(c.id) || 0,
        },
      ];
    })
  );
}

// GET /api/contracts?mineId=&status=  (Overman and above, DGMS: every contract they can see)
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!canView(req.user!)) return res.status(403).json({ error: 'Only the Overman and above see contracts.' });
  const scope = mineFilter(req, req.query.mineId);
  const status = STATUSES.includes(String(req.query.status)) ? String(req.query.status) : undefined;
  const contracts = await prisma.contract.findMany({
    where: { ...(scope ? { mineId: scope } : {}), ...(status ? { status } : {}) },
    include: INCLUDE,
    orderBy: [{ status: 'asc' }, { endDate: 'asc' }],
  });
  const stats = await summarise(contracts);
  return res.json(contracts.map((c) => ({ ...c, stats: stats.get(c.id) })));
});

// GET /api/contracts/contractors  (for the picker when issuing a contract)
router.get('/contractors', async (req: AuthenticatedRequest, res: Response) => {
  if (!canView(req.user!)) return res.status(403).json({ error: 'Only the Overman and above see contracts.' });
  return res.json(await prisma.contractor.findMany({ orderBy: { name: 'asc' } }));
});

// GET /api/contracts/:id  (with its workers, their training and today's check-in, and incidents)
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  if (!canView(req.user!)) return res.status(403).json({ error: 'Only the Overman and above see contracts.' });
  const contract = await prisma.contract.findUnique({ where: { id: String(req.params.id) }, include: INCLUDE });
  if (!contract || !canSeeMine(req, contract.mineId)) return res.status(404).json({ error: 'Contract not found.' });

  const [workers, incidents, stats] = await Promise.all([
    prisma.user.findMany({
      where: { contractId: contract.id, status: 'APPROVED' },
      select: {
        id: true,
        name: true,
        role: true,
        trade: true,
        specialistType: true,
        shift: true,
        phone: true,
        badgeNumber: true,
        trainingValidUntil: true,
        district: { select: { name: true } },
        attendance: { select: { date: true, checkInAt: true, checkOutAt: true }, orderBy: { date: 'desc' }, take: 1 },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.incident.findMany({
      where: { contractId: contract.id },
      select: { id: true, incidentType: true, severity: true, location: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    summarise([contract]),
  ]);

  return res.json({
    ...contract,
    stats: stats.get(contract.id),
    workers: workers.map(({ attendance, ...w }) => {
      const last = attendance[0];
      const onShift = last && last.date === shiftDate(w.shift, new Date(), contract.mine.shiftStartHour);
      return { ...w, training: trainingState(w.trainingValidUntil), today: onShift ? { checkInAt: last.checkInAt, checkOutAt: last.checkOutAt } : null };
    }),
    incidents,
    canManage: canManage(req.user!),
  });
});

type ContractInput = {
  mineId?: string;
  contractorId?: string;
  title?: string;
  workType?: string;
  reference?: string | null;
  districtId?: string | null;
  startDate?: Date;
  endDate?: Date;
};

async function parseContract(body: any, creating: boolean): Promise<{ data?: ContractInput; error?: string }> {
  const data: ContractInput = {};
  if (creating || body.title !== undefined) {
    const title = String(body.title || '').trim();
    if (title.length < 3) return { error: 'Say what the work is.' };
    data.title = title;
  }
  if (creating || body.workType !== undefined) {
    if (!WORK_TYPES.includes(body.workType)) return { error: 'Choose the type of work.' };
    data.workType = body.workType;
  }
  if (body.reference !== undefined) data.reference = String(body.reference || '').trim() || null;
  for (const key of ['startDate', 'endDate'] as const) {
    if (creating || body[key] !== undefined) {
      const d = new Date(body[key]);
      if (!body[key] || Number.isNaN(d.getTime())) return { error: key === 'startDate' ? 'Choose the start date.' : 'Choose the end date.' };
      data[key] = d;
    }
  }
  if (data.startDate && data.endDate && data.endDate < data.startDate) return { error: 'The contract ends before it starts.' };
  if (body.districtId !== undefined) data.districtId = body.districtId || null;
  return { data };
}

// POST /api/contracts  { mineId, contractorId | newContractor: { name, contactName, phone }, title, workType, reference, districtId, startDate, endDate }
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const mineId = String(req.body?.mineId || u.mineId || '');
  if (!canManage(u) || !mineId || !canSeeMine(req, mineId)) {
    return res.status(403).json({ error: 'Only the assistant manager, mine manager or owner can issue contracts at their mine.' });
  }
  const { data, error } = await parseContract(req.body, true);
  if (error) return res.status(400).json({ error });
  if (data!.districtId) {
    const d = await prisma.district.findUnique({ where: { id: data!.districtId } });
    if (!d || d.mineId !== mineId) return res.status(400).json({ error: 'That district is not part of this mine.' });
  }

  let contractorId = String(req.body?.contractorId || '');
  const fresh = req.body?.newContractor;
  if (!contractorId && fresh) {
    const name = String(fresh.name || '').trim();
    if (name.length < 2) return res.status(400).json({ error: "Enter the contractor's name." });
    const existing = await prisma.contractor.findUnique({ where: { name } });
    contractorId = (
      existing ||
      (await prisma.contractor.create({
        data: { name, contactName: String(fresh.contactName || '').trim() || null, phone: String(fresh.phone || '').trim() || null },
      }))
    ).id;
  }
  if (!contractorId || !(await prisma.contractor.findUnique({ where: { id: contractorId } }))) {
    return res.status(400).json({ error: 'Choose the contractor.' });
  }

  const id = `CON-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
  const contract = await prisma.contract.create({
    data: {
      id,
      mineId,
      contractorId,
      title: data!.title!,
      workType: data!.workType!,
      reference: data!.reference ?? null,
      districtId: data!.districtId ?? null,
      startDate: data!.startDate!,
      endDate: data!.endDate!,
      createdByName: u.name,
    },
    include: INCLUDE,
  });
  await AuditService.recordEvent({
    recordType: 'CONTRACT',
    recordId: id,
    action: 'CREATED',
    performedByRole: actorRole(req),
    data: { id, mineId, contractor: contract.contractor.name, title: contract.title, workType: contract.workType, from: contract.startDate, to: contract.endDate },
  });
  return res.status(201).json(contract);
});

// PATCH /api/contracts/:id  { ...fields, status?, statusNote? }  (suspending or ending it stops its workers checking in)
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const u = req.user!;
  const existing = await prisma.contract.findUnique({ where: { id: String(req.params.id) }, include: INCLUDE });
  if (!existing || !canSeeMine(req, existing.mineId)) return res.status(404).json({ error: 'Contract not found.' });
  if (!canManage(u)) return res.status(403).json({ error: 'Only the assistant manager, mine manager or owner can change contracts.' });

  const { data, error } = await parseContract(req.body, false);
  if (error) return res.status(400).json({ error });
  const start = data!.startDate || existing.startDate;
  const end = data!.endDate || existing.endDate;
  if (end < start) return res.status(400).json({ error: 'The contract ends before it starts.' });

  const status = req.body?.status;
  const statusNote = String(req.body?.statusNote || '').trim();
  if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const statusChanging = status !== undefined && status !== existing.status;
  if (statusChanging && status !== 'ACTIVE' && statusNote.length < 3) return res.status(400).json({ error: 'Say why.' });

  const contract = await prisma.contract.update({
    where: { id: existing.id },
    data: { ...data!, ...(statusChanging ? { status, statusNote: statusNote || null } : {}) },
    include: INCLUDE,
  });

  if (statusChanging) {
    await AuditService.recordEvent({
      recordType: 'CONTRACT',
      recordId: existing.id,
      action: 'STATUS_CHANGED',
      performedByRole: actorRole(req),
      data: { id: existing.id, from: existing.status, to: status, note: statusNote || null },
    });
    const workers = await prisma.user.findMany({ where: { contractId: existing.id, status: 'APPROVED' }, select: { id: true } });
    await notify(
      workers.map((w) => w.id),
      status === 'ACTIVE' ? `Work restarts: ${existing.title}` : `Work stopped: ${existing.title}`,
      status === 'ACTIVE'
        ? `${existing.contractor.name}'s contract is active again. You can check in as usual.`
        : `${u.name} ${status === 'SUSPENDED' ? 'suspended' : 'ended'} this contract: ${statusNote}. You can't check in under it until it is active again.`,
      status === 'ACTIVE' ? 'INFO' : 'WARNING'
    );
  }
  return res.json(contract);
});

export default router;
