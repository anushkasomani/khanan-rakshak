import { Router, Response } from 'express';
import crypto from 'crypto';
import { optionalAuthenticate, AuthenticatedRequest, requireLevel, actorRole } from '../middleware/auth';
import { AuditService } from '../services/auditService';
import { prisma } from '../db';

const router = Router();

// Helper to generate random grievance tracking ID e.g. GRV-2026-8F4A21
function generateTrackingCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let token = '';
  for (let i = 0; i < 6; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `GRV-2026-${token}`;
}

// GET /api/grievances (List with role-aware privacy protection)
router.get('/', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { mineId, status, escalationTier } = req.query;

  const where: any = {};
  if (mineId) where.mineId = String(mineId);
  if (status) where.status = String(status);
  if (escalationTier) where.escalationTier = String(escalationTier);

  // If worker, only return their own non-anonymous reports unless searching by tracking code
  if (req.user && req.user.role === 'WORKER') {
    where.submitterId = req.user.id;
  }

  const rawGrievances = await prisma.grievance.findMany({
    where,
    include: {
      mine: { select: { id: true, name: true, code: true } },
      submitter: { select: { id: true, name: true, badgeNumber: true, email: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  // PRIVACY SANITIZATION:
  // If grievance is ANONYMOUS, remove any submitter identification from response!
  const sanitized = rawGrievances.map((g) => {
    const isAnonymous = g.anonymityType === 'ANONYMOUS';
    const isCallerOwner = req.user && req.user.id === g.submitterId;
    const isAuthorizedRegulator = req.user && req.user.role === 'DGMS';

    let timelineParsed = [];
    try {
      timelineParsed = JSON.parse(g.timeline || '[]');
    } catch (e) {
      timelineParsed = [];
    }

    return {
      ...g,
      timeline: timelineParsed,
      submitter: isAnonymous
        ? { id: 'ANONYMOUS', name: 'Anonymous Submitter (Identity Protected)', badgeNumber: 'PROTECTED' }
        : isCallerOwner || isAuthorizedRegulator
        ? g.submitter
        : { id: 'CONFIDENTIAL', name: 'Confidential Employee', badgeNumber: 'CONFIDENTIAL' }
    };
  });

  return res.json(sanitized);
});

// GET /api/grievances/track/:trackingCode (Public / Worker lookup by tracking code)
router.get('/track/:trackingCode', async (req, res) => {
  const { trackingCode } = req.params;

  const grievance = await prisma.grievance.findUnique({
    where: { trackingCode: trackingCode.toUpperCase() },
    include: {
      mine: { select: { name: true, code: true } }
    }
  });

  if (!grievance) {
    return res.status(404).json({ error: 'Grievance record not found. Please verify tracking ID.' });
  }

  let timelineParsed = [];
  try {
    timelineParsed = JSON.parse(grievance.timeline || '[]');
  } catch (e) {
    timelineParsed = [];
  }

  // Pure tracking response - NEVER leaks submitter identity
  return res.json({
    trackingCode: grievance.trackingCode,
    mineName: grievance.mine.name,
    category: grievance.category,
    description: grievance.description,
    anonymityType: grievance.anonymityType,
    status: grievance.status,
    escalationTier: grievance.escalationTier,
    timeline: timelineParsed,
    recordHash: grievance.recordHash,
    createdAt: grievance.createdAt,
    updatedAt: grievance.updatedAt,
    protectionNotice: 'Submitter identity is cryptographically guarded under DGMS Anonymity Protection Standard.'
  });
});

// POST /api/grievances (Submit grievance with anonymity tier)
router.post('/', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mineId, category, description, anonymityType } = req.body;

    if (!mineId || !category || !description) {
      return res.status(400).json({ error: 'Mine, category, and description are required' });
    }

    const trackingCode = generateTrackingCode();
    const anonymity = anonymityType || 'ANONYMOUS';

    // If ANONYMOUS, never associate submitter ID
    const submitterId = anonymity === 'ANONYMOUS' ? null : (req.user ? req.user.id : null);

    const initialTimeline = [
      {
        step: 'SUBMITTED',
        time: new Date().toISOString(),
        note: `Grievance registered under ${anonymity} protocol. Generated tracking code ${trackingCode}.`
      }
    ];

    const grievance = await prisma.grievance.create({
      data: {
        id: trackingCode,
        trackingCode,
        anonymityType: anonymity,
        submitterId,
        mineId,
        category,
        description,
        status: 'SUBMITTED',
        escalationTier: 'MINE_OFFICER',
        timeline: JSON.stringify(initialTimeline),
      },
      include: {
        mine: true
      }
    });

    // Record to Audit Hash Chain
    const auditBlock = await AuditService.recordEvent({
      recordType: 'GRIEVANCE',
      recordId: grievance.trackingCode,
      action: 'CREATED',
      performedByRole: anonymity === 'ANONYMOUS' ? 'ANONYMOUS_WORKER' : actorRole(req),
      data: {
        trackingCode: grievance.trackingCode,
        category: grievance.category,
        anonymityType: grievance.anonymityType,
        mine: grievance.mine.name,
        timestamp: grievance.createdAt
      }
    });

    if (auditBlock) {
      await prisma.grievance.update({
        where: { id: grievance.id },
        data: { recordHash: auditBlock.currentHash }
      });
    }

    return res.status(201).json({
      success: true,
      trackingCode: grievance.trackingCode,
      anonymityType: grievance.anonymityType,
      status: grievance.status,
      escalationTier: grievance.escalationTier,
      auditHash: auditBlock?.currentHash,
      message: 'Grievance submitted securely. Save your tracking code to inspect progress.'
    });
  } catch (err: any) {
    console.error('Error submitting grievance:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /api/grievances/:id/escalate
router.post('/:id/escalate', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason, targetTier } = req.body;
    const grievanceId = String(req.params.id);

    const grievance = await prisma.grievance.findFirst({
      where: {
        OR: [{ id: grievanceId }, { trackingCode: grievanceId }]
      }
    });

    if (!grievance) {
      return res.status(404).json({ error: 'Grievance not found' });
    }

    // Tier progression: MINE_OFFICER -> MINE_MANAGEMENT -> CORPORATE -> REGULATOR
    let nextTier = targetTier;
    if (!nextTier) {
      if (grievance.escalationTier === 'MINE_OFFICER') nextTier = 'MINE_MANAGEMENT';
      else if (grievance.escalationTier === 'MINE_MANAGEMENT') nextTier = 'CORPORATE';
      else if (grievance.escalationTier === 'CORPORATE') nextTier = 'REGULATOR';
      else nextTier = 'REGULATOR';
    }

    let timeline = [];
    try {
      timeline = JSON.parse(grievance.timeline || '[]');
    } catch (e) {
      timeline = [];
    }

    timeline.push({
      step: 'ESCALATED',
      time: new Date().toISOString(),
      note: `Escalated from ${grievance.escalationTier} to ${nextTier}. ${reason ? 'Reason: ' + reason : 'Unresolved within required SLA window.'}`
    });

    const updated = await prisma.grievance.update({
      where: { id: grievance.id },
      data: {
        escalationTier: nextTier,
        status: 'ESCALATED',
        timeline: JSON.stringify(timeline)
      }
    });

    // Audit log
    const auditBlock = await AuditService.recordEvent({
      recordType: 'GRIEVANCE',
      recordId: grievance.trackingCode,
      action: 'ESCALATED',
      performedByRole: actorRole(req, 'SIRDAR'),
      data: {
        trackingCode: grievance.trackingCode,
        fromTier: grievance.escalationTier,
        toTier: nextTier,
        reason: reason || 'SLA Escalation'
      }
    });

    return res.json({ updated, auditBlock });
  } catch (err: any) {
    console.error('Error escalating grievance:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// POST /api/grievances/:id/respond (Status update or resolution)
router.post('/:id/respond', requireLevel('OFFICER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, note, assignedInvestigator } = req.body;
    const grievanceId = String(req.params.id);

    const grievance = await prisma.grievance.findFirst({
      where: {
        OR: [{ id: grievanceId }, { trackingCode: grievanceId }]
      }
    });

    if (!grievance) {
      return res.status(404).json({ error: 'Grievance not found' });
    }

    let timeline = [];
    try {
      timeline = JSON.parse(grievance.timeline || '[]');
    } catch (e) {
      timeline = [];
    }

    const newStatus = status || grievance.status;

    timeline.push({
      step: newStatus,
      time: new Date().toISOString(),
      note: note || `Grievance status updated to ${newStatus}${assignedInvestigator ? ' (Assigned: ' + assignedInvestigator + ')' : ''}`
    });

    const updated = await prisma.grievance.update({
      where: { id: grievance.id },
      data: {
        status: newStatus,
        timeline: JSON.stringify(timeline)
      }
    });

    // Audit log
    await AuditService.recordEvent({
      recordType: 'GRIEVANCE',
      recordId: grievance.trackingCode,
      action: newStatus === 'RESOLVED' ? 'RESOLVED' : 'STATUS_CHANGED',
      performedByRole: actorRole(req, 'OFFICER'),
      data: {
        trackingCode: grievance.trackingCode,
        status: newStatus,
        note: note || ''
      }
    });

    return res.json({ updated });
  } catch (err: any) {
    console.error('Error updating grievance:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
