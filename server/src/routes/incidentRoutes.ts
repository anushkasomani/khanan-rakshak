import { Router, Response } from 'express';
import { AuthenticatedRequest, requireLevel, actorRole, mineFilter, canSeeMine } from '../middleware/auth';
import { AuditService } from '../services/auditService';
import { prisma } from '../db';

const router = Router();

// GET /api/incidents
const INCIDENT_TYPES = ['METHANE_SPIKE', 'ROOF_FALL', 'EQUIPMENT_JAM', 'MINOR_INJURY', 'ELECTRICAL_SHORT', 'FIRE', 'INUNDATION', 'OTHER'];
const SEVERITIES = ['MINOR', 'SERIOUS', 'CRITICAL', 'FATALITY'];

router.get('/', async (req: AuthenticatedRequest, res) => {
  const { mineId, severity } = req.query;
  const where: any = {};
  const scope = mineFilter(req, mineId);
  if (scope) where.mineId = scope;
  if (severity) where.severity = String(severity);

  const incidents = await prisma.incident.findMany({
    where,
    include: {
      mine: { select: { id: true, name: true, code: true } },
      contract: { select: { id: true, title: true, contractor: { select: { name: true } } } }
    },
    orderBy: { createdAt: 'desc' }
  });
  return res.json(incidents);
});

// POST /api/incidents
router.post('/', requireLevel('SIRDAR'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mineId, incidentType, location, severity, description, peopleAffected, immediateResponse, rootCause, contractId } = req.body;

    if (!mineId || !incidentType || !location || !description) {
      return res.status(400).json({ error: 'Mine, incident type, location, and description are required' });
    }
    if (!canSeeMine(req, String(mineId))) return res.status(403).json({ error: 'You can only log incidents for your own mine.' });
    if (!INCIDENT_TYPES.includes(incidentType)) return res.status(400).json({ error: 'Choose an incident type.' });
    if (severity && !SEVERITIES.includes(severity)) return res.status(400).json({ error: 'Choose a severity.' });
    if (contractId) {
      const contract = await prisma.contract.findUnique({ where: { id: String(contractId) } });
      if (!contract || contract.mineId !== mineId) return res.status(400).json({ error: 'That contract is not at this mine.' });
    }

    const rand = Math.floor(10000 + Math.random() * 90000);
    const incId = `INC-2026-${rand}`;

    const incident = await prisma.incident.create({
      data: {
        id: incId,
        mineId,
        incidentType,
        location,
        severity: severity || 'SERIOUS',
        description,
        peopleAffected: peopleAffected ? parseInt(String(peopleAffected), 10) : 0,
        immediateResponse: immediateResponse || 'Not recorded',
        rootCause: rootCause || null,
        reportedById: req.user?.id,
        reportedByName: req.user?.name,
        contractId: contractId || null,
        status: 'INVESTIGATING'
      },
      include: { mine: true, contract: { include: { contractor: true } } }
    });

    const auditBlock = await AuditService.recordEvent({
      recordType: 'INCIDENT',
      recordId: incident.id,
      action: 'CREATED',
      performedByRole: actorRole(req),
      data: {
        id: incident.id,
        type: incident.incidentType,
        mine: incident.mine.name,
        severity: incident.severity,
        affected: incident.peopleAffected,
        contractor: incident.contract?.contractor.name || null
      }
    });

    return res.status(201).json({ incident, auditBlock });
  } catch (err: any) {
    console.error('Error logging incident:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
