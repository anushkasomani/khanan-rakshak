import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { generateToken, AuthenticatedRequest, authenticate } from '../middleware/auth';
import { adminEmails, validateProfile, profileFields } from '../roles';
import { prisma } from '../db';

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  officerType: true,
  trade: true,
  specialistType: true,
  shift: true,
  districtId: true,
  district: { select: { id: true, name: true, location: true } },
  contractId: true,
  contract: { select: { id: true, title: true, contractor: { select: { name: true } } } },
  trainingValidUntil: true,
  phone: true,
  isAdmin: true,
  status: true,
  reviewNote: true,
  badgeNumber: true,
  department: true,
  points: true,
  mineId: true,
  createdAt: true,
  mine: { select: { id: true, name: true, code: true, company: true, locality: true, state: true, shiftStartHour: true } },
} as const;

/** Returns an error message when the district is not part of the mine. */
export async function districtProblem(mineId: unknown, districtId: unknown): Promise<string | null> {
  if (!districtId) return null;
  const district = await prisma.district.findUnique({ where: { id: String(districtId) } });
  return district && district.mineId === mineId ? null : 'That district is not part of the chosen mine.';
}

/** Returns an error message when the contract is not at the mine. */
export async function contractProblem(mineId: unknown, contractId: unknown): Promise<string | null> {
  if (!contractId) return null;
  const contract = await prisma.contract.findUnique({ where: { id: String(contractId) } });
  return contract && contract.mineId === mineId ? null : 'That contract is not at the chosen mine.';
}

/** Active contracts at a mine, for the "employed by" choice when someone registers. */
export const ACTIVE_CONTRACTS = {
  contracts: {
    where: { status: 'ACTIVE' },
    select: { id: true, title: true, contractor: { select: { name: true } } },
    orderBy: { title: 'asc' as const },
  },
};

const fetchPublicUser = (id: string) => prisma.user.findUnique({ where: { id }, select: PUBLIC_USER_SELECT });

// POST /api/auth/login (seeded demo accounts only; the app itself signs in with Google)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  return res.json({ token: generateToken(user), user: await fetchPublicUser(user.id) });
});

// POST /api/auth/google
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Google credential required' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Invalid Google credential' });
  }
  if (!payload?.email || !payload.email_verified) {
    return res.status(401).json({ error: 'Google account email is not verified' });
  }

  const email = payload.email.toLowerCase();
  const bootstrapAdmin = adminEmails().includes(email);

  let user = await prisma.user.findFirst({ where: { OR: [{ googleId: payload.sub }, { email }] } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: payload.name || email,
        googleId: payload.sub,
        isAdmin: bootstrapAdmin,
        status: bootstrapAdmin ? 'APPROVED' : 'NEW',
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        googleId: user.googleId || payload.sub,
        ...(bootstrapAdmin && !user.isAdmin ? { isAdmin: true, status: 'APPROVED' } : {}),
      },
    });
  }

  return res.json({ token: generateToken(user), user: await fetchPublicUser(user.id) });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      ...PUBLIC_USER_SELECT,
      badges: true,
      pointsHistory: { take: 5, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
});

// GET /api/auth/onboarding/mines (needed before the account is approved)
router.get('/onboarding/mines', authenticate, async (_req, res) => {
  const mines = await prisma.mine.findMany({
    select: {
      id: true,
      name: true,
      locality: true,
      state: true,
      shiftStartHour: true,
      districts: { select: { id: true, name: true, location: true }, orderBy: { name: 'asc' } },
      ...ACTIVE_CONTRACTS,
    },
    orderBy: { name: 'asc' },
  });
  return res.json(mines);
});

// POST /api/auth/onboarding
router.post('/onboarding', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const current = req.user!;
  if (current.status === 'APPROVED') {
    return res.status(400).json({ error: 'Your account is already approved. Ask an admin to change your details.' });
  }

  const { name, phone, role, officerType, trade, specialistType, mineId, districtId, shift, contractId, trainingValidUntil, badgeNumber } = req.body;
  const problem =
    validateProfile({ role, officerType, trade, specialistType, mineId, districtId, shift, trainingValidUntil }) ||
    (await districtProblem(mineId, districtId)) ||
    (await contractProblem(mineId, contractId));
  if (problem) return res.status(400).json({ error: problem });
  if (!phone || String(phone).replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Enter a valid phone number.' });
  }
  if (mineId && !(await prisma.mine.findUnique({ where: { id: mineId } }))) {
    return res.status(400).json({ error: 'That mine does not exist.' });
  }

  await prisma.user.update({
    where: { id: current.id },
    data: {
      name: name ? String(name).trim() : undefined,
      phone: String(phone).trim(),
      role,
      ...profileFields(role, { officerType, trade, specialistType, mineId, districtId, shift, contractId, trainingValidUntil }),
      badgeNumber: badgeNumber ? String(badgeNumber).trim() : null,
      status: 'PENDING',
      reviewNote: null,
    },
  });

  return res.json(await fetchPublicUser(current.id));
});

export default router;
