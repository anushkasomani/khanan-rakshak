import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { USER_STATUSES, validateProfile, profileFields } from '../roles';
import { PUBLIC_USER_SELECT, districtProblem, contractProblem } from './authRoutes';
import { prisma } from '../db';

const router = Router();

const clean = (v: unknown) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

// GET /api/admin/users?status=PENDING&mineId=...
router.get('/users', async (req, res) => {
  const { status, mineId } = req.query;
  const users = await prisma.user.findMany({
    where: {
      ...(status ? { status: String(status) } : {}),
      ...(mineId ? { mineId: String(mineId) } : {}),
    },
    select: PUBLIC_USER_SELECT,
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });
  return res.json(users);
});

// POST /api/admin/users  (admin enrolls a person directly; they are approved immediately)
router.post('/users', async (req: AuthenticatedRequest, res: Response) => {
  const { email, name, phone, role, officerType, trade, specialistType, mineId, districtId, shift, contractId, trainingValidUntil, badgeNumber, isAdmin } = req.body;
  const normalizedEmail = clean(email)?.toLowerCase();
  if (!normalizedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Enter a valid email.' });
  }
  if (!clean(name)) return res.status(400).json({ error: 'Enter a name.' });
  const problem =
    validateProfile({ role, officerType, trade, specialistType, mineId, districtId, shift, trainingValidUntil }) ||
    (await districtProblem(mineId, districtId)) ||
    (await contractProblem(mineId, contractId));
  if (problem) return res.status(400).json({ error: problem });
  if (await prisma.user.findUnique({ where: { email: normalizedEmail } })) {
    return res.status(409).json({ error: 'Someone with this email is already registered.' });
  }

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: clean(name)!,
      phone: clean(phone),
      role,
      ...profileFields(role, { officerType, trade, specialistType, mineId, districtId, shift, contractId, trainingValidUntil }),
      badgeNumber: clean(badgeNumber),
      isAdmin: Boolean(isAdmin),
      status: 'APPROVED',
      reviewedAt: new Date(),
    },
    select: PUBLIC_USER_SELECT,
  });
  return res.status(201).json(user);
});

// PATCH /api/admin/users/:id  (edit details, approve / reject, toggle admin)
router.patch('/users/:id', async (req: AuthenticatedRequest, res: Response) => {
  const id = String(req.params.id);
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const { name, phone, role, officerType, trade, specialistType, mineId, districtId, shift, contractId, trainingValidUntil, badgeNumber, isAdmin, status, reviewNote } = req.body;

  if (status !== undefined && !(USER_STATUSES as readonly string[]).includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  if (id === req.user!.id && isAdmin === false) {
    return res.status(400).json({ error: 'You cannot remove your own admin access.' });
  }

  const nextRole = role !== undefined ? role : existing.role;
  const pick = <T,>(incoming: T | undefined, current: T) => (incoming !== undefined ? incoming : current);
  const next = {
    officerType: pick(officerType, existing.officerType),
    trade: pick(trade, existing.trade),
    specialistType: pick(specialistType, existing.specialistType),
    mineId: pick(mineId, existing.mineId),
    districtId: pick(districtId, existing.districtId),
    shift: pick(shift, existing.shift),
    contractId: pick(contractId, existing.contractId),
    trainingValidUntil: pick<unknown>(trainingValidUntil, existing.trainingValidUntil),
  };
  const profileChanging = [role, officerType, trade, specialistType, mineId, districtId, shift, contractId, trainingValidUntil].some((v) => v !== undefined);
  const approving = status === 'APPROVED';
  if ((profileChanging || approving) && (nextRole || !existing.isAdmin)) {
    const problem =
      validateProfile({ role: nextRole, ...next }) ||
      (await districtProblem(next.mineId, next.districtId)) ||
      (await contractProblem(next.mineId, next.contractId));
    if (problem) return res.status(400).json({ error: problem });
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: clean(name) || existing.name } : {}),
      ...(phone !== undefined ? { phone: clean(phone) } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(profileChanging ? profileFields(nextRole, next) : {}),
      ...(badgeNumber !== undefined ? { badgeNumber: clean(badgeNumber) } : {}),
      ...(isAdmin !== undefined ? { isAdmin: Boolean(isAdmin) } : {}),
      ...(status !== undefined ? { status, reviewedAt: new Date() } : {}),
      ...(reviewNote !== undefined ? { reviewNote: clean(reviewNote) } : {}),
    },
    select: PUBLIC_USER_SELECT,
  });

  if (status && status !== existing.status && (status === 'APPROVED' || status === 'REJECTED')) {
    await prisma.notification.create({
      data: {
        userId: id,
        title: status === 'APPROVED' ? 'Your account is approved' : 'Your registration needs changes',
        message: status === 'APPROVED' ? 'You now have access to Khanan Rakshak.' : clean(reviewNote) || 'Please review and resubmit your details.',
        type: 'INFO',
      },
    });
  }

  return res.json(user);
});

export default router;
