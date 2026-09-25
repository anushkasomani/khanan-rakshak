import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAdmin } from '../middleware/auth';
import { ROLES } from '../roles';
import { ACTIVE_CONTRACTS } from './authRoutes';
import { prisma } from '../db';

const router = Router();

type StaffSummary = Record<string, number>;

async function staffByMine(): Promise<Record<string, StaffSummary>> {
  const rows = await prisma.user.groupBy({
    by: ['mineId', 'role'],
    where: { status: 'APPROVED', mineId: { not: null }, role: { not: null } },
    _count: { _all: true },
  });
  const out: Record<string, StaffSummary> = {};
  for (const r of rows) {
    const mineId = r.mineId as string;
    out[mineId] = out[mineId] || {};
    out[mineId][r.role as string] = r._count._all;
  }
  return out;
}

function parseMineInput(body: any): { data?: Record<string, any>; error?: string } {
  const { name, company, locality, state, region, latitude, longitude, radiusMeters, code, shiftStartHour } = body;
  const data: Record<string, any> = {};
  if (shiftStartHour !== undefined) {
    const h = Number(shiftStartHour);
    if (!Number.isInteger(h) || h < 0 || h > 23) return { error: 'Choose when the first shift starts.' };
    data.shiftStartHour = h;
  }
  if (company !== undefined) data.company = String(company).trim() || null;
  if (name !== undefined) {
    if (!String(name).trim()) return { error: 'Enter a mine name.' };
    data.name = String(name).trim();
  }
  if (locality !== undefined) data.locality = String(locality).trim() || null;
  if (state !== undefined) {
    if (!String(state).trim()) return { error: 'Enter the state.' };
    data.state = String(state).trim();
  }
  if (region !== undefined) data.region = String(region).trim() || data.state || '';
  if (code !== undefined && String(code).trim()) data.code = String(code).trim().toUpperCase();
  if (latitude !== undefined || longitude !== undefined) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return { error: 'Place the mine on the map.' };
    }
    data.latitude = lat;
    data.longitude = lng;
  }
  if (radiusMeters !== undefined) {
    const r = Math.round(Number(radiusMeters));
    if (!Number.isFinite(r) || r < 50 || r > 20000) return { error: 'Radius must be between 50 m and 20 km.' };
    data.radiusMeters = r;
  }
  return { data };
}

type DistrictInput = { id?: string; name: string; location: string | null };

/** Validates the districts list from the mine form. undefined means "leave districts alone". */
function parseDistricts(body: any): { districts?: DistrictInput[]; error?: string } {
  if (body.districts === undefined) return {};
  if (!Array.isArray(body.districts)) return { error: 'Districts must be a list.' };
  const districts: DistrictInput[] = [];
  for (const d of body.districts) {
    const name = String(d?.name || '').trim();
    if (!name) return { error: 'Every district needs a name.' };
    if (name.length > 60) return { error: 'Keep district names under 60 characters.' };
    districts.push({ id: d?.id ? String(d.id) : undefined, name, location: String(d?.location || '').trim() || null });
  }
  const names = districts.map((d) => d.name.toLowerCase());
  if (new Set(names).size !== names.length) return { error: 'Two districts have the same name.' };
  return { districts };
}

/** Creates, renames and removes districts to match the list. A district still in use cannot be removed. */
async function syncDistricts(mineId: string, list: DistrictInput[]): Promise<string | null> {
  const existing = await prisma.district.findMany({
    where: { mineId },
    include: { _count: { select: { users: true, safetyReports: true, sosAlerts: true, shiftReports: true } } },
  });
  const keep = new Set(list.map((d) => d.id).filter(Boolean));
  for (const d of existing.filter((e) => !keep.has(e.id))) {
    const c = d._count;
    if (c.users || c.safetyReports || c.sosAlerts || c.shiftReports) {
      return `${d.name} has people or records attached, so it can't be removed. Move the people to another district first.`;
    }
  }
  await prisma.$transaction([
    prisma.district.deleteMany({ where: { mineId, id: { notIn: [...keep] as string[] } } }),
    ...list.map((d) =>
      d.id && existing.some((e) => e.id === d.id)
        ? prisma.district.update({ where: { id: d.id }, data: { name: d.name, location: d.location } })
        : prisma.district.create({ data: { mineId, name: d.name, location: d.location } })
    ),
  ]);
  return null;
}

const DISTRICTS = { districts: { orderBy: { name: 'asc' as const } }, ...ACTIVE_CONTRACTS };

// GET /api/mines
router.get('/', async (_req, res) => {
  const [mines, staff] = await Promise.all([
    prisma.mine.findMany({ include: DISTRICTS, orderBy: { name: 'asc' } }),
    staffByMine(),
  ]);
  return res.json(mines.map((m) => ({ ...m, staff: staff[m.id] || {} })));
});

// GET /api/mines/:id  (includes the approved staff roster)
router.get('/:id', async (req, res) => {
  const mine = await prisma.mine.findUnique({
    where: { id: req.params.id },
    include: {
      ...DISTRICTS,
      users: {
        where: { status: 'APPROVED' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          officerType: true,
          trade: true,
          specialistType: true,
          shift: true,
          districtId: true,
          contractId: true,
          badgeNumber: true,
        },
        orderBy: { name: 'asc' },
      },
    },
  });
  if (!mine) return res.status(404).json({ error: 'Mine not found' });
  const order = (r: string | null) => ROLES.indexOf((r || 'WORKER') as any);
  mine.users.sort((a, b) => order(b.role) - order(a.role) || a.name.localeCompare(b.name));
  return res.json(mine);
});

// POST /api/mines  (admin)
router.post('/', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { data, error } = parseMineInput(req.body);
  const { districts, error: districtError } = parseDistricts(req.body);
  if (error || districtError) return res.status(400).json({ error: error || districtError });
  if (!data!.name || !data!.state || data!.latitude === undefined) {
    return res.status(400).json({ error: 'Name, state and map location are required.' });
  }
  const code = data!.code || `MINE-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  if (await prisma.mine.findUnique({ where: { code } })) {
    return res.status(409).json({ error: 'A mine with this code already exists.' });
  }
  const mine = await prisma.mine.create({
    data: {
      name: data!.name,
      company: data!.company ?? null,
      state: data!.state,
      region: data!.region || data!.state,
      locality: data!.locality ?? null,
      latitude: data!.latitude,
      longitude: data!.longitude,
      radiusMeters: data!.radiusMeters ?? 500,
      shiftStartHour: data!.shiftStartHour ?? 6,
      code,
      districts: { create: (districts || []).map((d) => ({ name: d.name, location: d.location })) },
    },
    include: DISTRICTS,
  });
  return res.status(201).json(mine);
});

// PATCH /api/mines/:id  (admin)
router.patch('/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.mine.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'Mine not found' });
  const { data, error } = parseMineInput(req.body);
  const { districts, error: districtError } = parseDistricts(req.body);
  if (error || districtError) return res.status(400).json({ error: error || districtError });
  if (districts) {
    const problem = await syncDistricts(existing.id, districts);
    if (problem) return res.status(409).json({ error: problem });
  }
  const mine = await prisma.mine.update({ where: { id: existing.id }, data: data!, include: DISTRICTS });
  return res.json(mine);
});

export default router;
