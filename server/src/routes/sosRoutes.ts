import { Router, Response } from 'express';
import { optionalAuthenticate, AuthenticatedRequest, requireLevel, actorRole, mineScope, canSeeMine } from '../middleware/auth';
import { AuditService } from '../services/auditService';
import { prisma } from '../db';

const router = Router();

// Helper to generate SOS ID: SOS-2026-XXXXX
function generateSosId(): string {
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `SOS-2026-${rand}`;
}

// Attach the signed-in reporter's name and phone so responders can call back.
async function withReporters<T extends { triggeredById: string | null }>(alerts: T[]) {
  const ids = [...new Set(alerts.map((a) => a.triggeredById).filter(Boolean))] as string[];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, phone: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return alerts.map((a) => ({ ...a, reporter: (a.triggeredById && byId.get(a.triggeredById)) || null }));
}

const scoped = (req: AuthenticatedRequest) => {
  const scope = mineScope(req);
  return scope ? { mineId: scope } : {};
};

// GET /api/sos/active (Control Room Live Feeds)
router.get('/active', async (req: AuthenticatedRequest, res) => {
  const activeAlerts = await prisma.sosAlert.findMany({
    where: {
      ...scoped(req),
      status: {
        in: ['ALERT_TRIGGERED', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'RESPONDING']
      }
    },
    include: {
      mine: { select: { id: true, name: true, code: true } },
      district: { select: { id: true, name: true, location: true } }
    },
    orderBy: { triggeredAt: 'desc' }
  });
  return res.json(await withReporters(activeAlerts));
});

// GET /api/sos/history
router.get('/history', async (req: AuthenticatedRequest, res) => {
  const allAlerts = await prisma.sosAlert.findMany({
    where: scoped(req),
    include: {
      mine: { select: { id: true, name: true, code: true } },
      district: { select: { id: true, name: true, location: true } }
    },
    orderBy: { triggeredAt: 'desc' },
    take: 30
  });
  return res.json(await withReporters(allAlerts));
});

// POST /api/sos (Trigger Emergency Alert)
router.post('/', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mineId, emergencyType, workerIdentifier, locationNotes } = req.body;
    const districtId = req.body.districtId || (req.user?.mineId === mineId ? req.user?.districtId : null) || null;

    if (!mineId || !emergencyType) {
      return res.status(400).json({ error: 'Mine and emergency type are required' });
    }

    const sosId = generateSosId();
    const ident = workerIdentifier || (req.user ? `${req.user.name} (${req.user.badgeNumber || 'W-ID'})` : 'ANON-CREW-ALARM');

    const alert = await prisma.sosAlert.create({
      data: {
        id: sosId,
        mineId,
        districtId,
        emergencyType,
        workerIdentifier: ident,
        triggeredById: req.user?.id || null,
        status: 'ALERT_TRIGGERED',
        responderNotes: locationNotes ? `Location details: ${locationNotes}` : null
      },
      include: {
        mine: true,
        district: true
      }
    });

    // Record into Audit Chain
    const auditBlock = await AuditService.recordEvent({
      recordType: 'SOS_ALERT',
      recordId: alert.id,
      action: 'CREATED',
      performedByRole: actorRole(req),
      data: {
        sosId: alert.id,
        emergencyType: alert.emergencyType,
        mine: alert.mine.name,
        district: alert.district ? alert.district.name : 'Unspecified',
        timestamp: alert.triggeredAt
      }
    });

    // Create high-priority broadcast notification
    const officers = await prisma.user.findMany({
      where: {
        mineId: alert.mineId,
        status: 'APPROVED',
        role: { in: ['SIRDAR', 'OVERMAN', 'OFFICER', 'ASSISTANT_MANAGER', 'MINE_MANAGER'] }
      }
    });
    for (const officer of officers) {
      await prisma.notification.create({
        data: {
          userId: officer.id,
          title: `SOS: ${alert.emergencyType.replace(/_/g, ' ').toLowerCase()}`,
          message: `${ident} at ${alert.mine.name}${alert.district ? `, ${alert.district.name}` : ''}. Open SOS control to respond.`,
          type: 'SOS'
        }
      });
    }

    return res.status(201).json({ alert, auditBlock });
  } catch (err: any) {
    console.error('Error triggering SOS:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// PATCH /api/sos/:id/status (Transition Status in Control Room)
router.patch('/:id/status', requireLevel('SIRDAR'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, assignedTeams, responderNotes } = req.body;
    const sosId = String(req.params.id);

    const existing = await prisma.sosAlert.findUnique({
      where: { id: sosId },
      include: { mine: true }
    });

    if (!existing) {
      return res.status(404).json({ error: 'SOS alert not found' });
    }
    if (!canSeeMine(req, existing.mineId)) {
      return res.status(403).json({ error: 'This alert is at another mine.' });
    }

    const dataToUpdate: any = {
      status: status || existing.status,
    };
    if (assignedTeams) dataToUpdate.assignedTeams = assignedTeams;
    if (responderNotes) dataToUpdate.responderNotes = responderNotes;
    if (status === 'RESOLVED') dataToUpdate.resolvedAt = new Date();

    const updated = await prisma.sosAlert.update({
      where: { id: sosId },
      data: dataToUpdate,
      include: { mine: true, district: true }
    });

    // Record to Audit Chain
    const auditBlock = await AuditService.recordEvent({
      recordType: 'SOS_ALERT',
      recordId: sosId,
      action: status === 'RESOLVED' ? 'RESOLVED' : 'STATUS_CHANGED',
      performedByRole: actorRole(req, 'CONTROL_ROOM_OPERATOR'),
      data: {
        sosId,
        newStatus: status,
        assignedTeams: assignedTeams || existing.assignedTeams,
        notes: responderNotes || existing.responderNotes
      }
    });

    return res.json({ updated: (await withReporters([updated]))[0], auditBlock });
  } catch (err: any) {
    console.error('Error updating SOS status:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
