import { Router } from 'express';
import { AuthenticatedRequest, actorRole, canSeeMine } from '../middleware/auth';
import { AuditService } from '../services/auditService';
import { COMPLIANCE_CATEGORIES, COMPLIANCE_EVALUATORS, COMPLIANCE_FREQUENCIES, COMPLIANCE_STATUSES, complianceDashboard, createComplianceRule, evaluateCompliance, listComplianceChecks, listComplianceRules, setComplianceRuleActive } from '../services/complianceService';
import { prisma } from '../db';

const router = Router();
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const validEnum = (value: unknown, values: readonly string[]): value is string => typeof value === 'string' && values.includes(value);

async function validateMine(req: AuthenticatedRequest, mineId: string | undefined) {
  if (!mineId) return null;
  if (!canSeeMine(req, mineId)) return { status: 403, error: 'You cannot access compliance data for that mine.' };
  if (!await prisma.mine.findUnique({ where: { id: mineId }, select: { id: true } })) return { status: 404, error: 'Mine not found.' };
  return null;
}

router.get('/', async (req: AuthenticatedRequest, res) => {
  const mineId = typeof req.query.mineId === 'string' ? req.query.mineId : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const periodDays = Number(req.query.periodDays ?? 30);
  if (status && !validEnum(status, COMPLIANCE_STATUSES)) return res.status(400).json({ error: 'Invalid compliance status.' });
  if (category && !validEnum(category, COMPLIANCE_CATEGORIES)) return res.status(400).json({ error: 'Invalid compliance category.' });
  if (![7, 30, 90].includes(periodDays)) return res.status(400).json({ error: 'Period must be 7, 30, or 90 days.' });
  const mineError = await validateMine(req, mineId);
  if (mineError) return res.status(mineError.status).json({ error: mineError.error });
  try { return res.json(await complianceDashboard({ mineId, status, category, periodDays })); }
  catch (error) { console.error('Compliance dashboard failed:', error); return res.status(503).json({ error: 'Compliance data is temporarily unavailable.' }); }
});

router.get('/rules', async (req: AuthenticatedRequest, res) => {
  const mineId = typeof req.query.mineId === 'string' ? req.query.mineId : undefined;
  const mineError = await validateMine(req, mineId);
  if (mineError) return res.status(mineError.status).json({ error: mineError.error });
  try {
    const rules = await listComplianceRules();
    return res.json(mineId ? rules.filter((rule) => !rule.applicableMines.length || rule.applicableMines.some((mine) => mine.id === mineId)) : rules);
  } catch (error) { console.error('Compliance rules load failed:', error); return res.status(503).json({ error: 'Compliance rules are temporarily unavailable.' }); }
});

router.get('/checks', async (req: AuthenticatedRequest, res) => {
  const mineId = typeof req.query.mineId === 'string' ? req.query.mineId : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const periodDays = Number(req.query.periodDays ?? 30);
  if (status && !validEnum(status, COMPLIANCE_STATUSES)) return res.status(400).json({ error: 'Invalid compliance status.' });
  if (category && !validEnum(category, COMPLIANCE_CATEGORIES)) return res.status(400).json({ error: 'Invalid compliance category.' });
  if (![7, 30, 90].includes(periodDays)) return res.status(400).json({ error: 'Period must be 7, 30, or 90 days.' });
  const mineError = await validateMine(req, mineId);
  if (mineError) return res.status(mineError.status).json({ error: mineError.error });
  try { return res.json(await listComplianceChecks({ mineId, status, category, periodDays })); }
  catch (error) { console.error('Compliance checks load failed:', error); return res.status(503).json({ error: 'Compliance checks are temporarily unavailable.' }); }
});

router.post('/evaluate', async (req: AuthenticatedRequest, res) => {
  const mineId = typeof req.body?.mineId === 'string' && req.body.mineId ? req.body.mineId : undefined;
  const mineError = await validateMine(req, mineId);
  if (mineError) return res.status(mineError.status).json({ error: mineError.error });
  try { return res.json(await evaluateCompliance(mineId, req.user!.id)); }
  catch (error) {
    if ((error as Error)?.message === 'MINE_NOT_FOUND') return res.status(404).json({ error: 'Mine not found.' });
    console.error('Compliance evaluation failed:', error); return res.status(503).json({ error: 'Compliance evaluation is temporarily unavailable.' });
  }
});

router.post('/rules', async (req: AuthenticatedRequest, res) => {
  const body = req.body || {};
  const code = text(body.code, 80).toUpperCase();
  const title = text(body.title, 160);
  const description = text(body.description, 1000);
  const sourceReference = text(body.sourceReference, 240);
  const category = body.category;
  const frequency = body.frequency;
  const severity = body.severity;
  const evaluationType = body.evaluationType;
  const applicableMineIds = Array.isArray(body.applicableMineIds) ? [...new Set(body.applicableMineIds.filter((id: unknown) => typeof id === 'string'))] as string[] : [];
  const configuration = body.configuration && typeof body.configuration === 'object' && !Array.isArray(body.configuration) ? body.configuration as Record<string, unknown> : {};
  if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(code)) return res.status(400).json({ error: 'Rule code must use 3–80 letters, numbers, underscores, or hyphens.' });
  if (!title || !description || !sourceReference) return res.status(400).json({ error: 'Title, description, and source/configuration reference are required.' });
  if (!validEnum(category, COMPLIANCE_CATEGORIES) || !validEnum(frequency, COMPLIANCE_FREQUENCIES) || !validEnum(evaluationType, COMPLIANCE_EVALUATORS)) return res.status(400).json({ error: 'Choose a supported category, frequency, and deterministic evaluator.' });
  if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)) return res.status(400).json({ error: 'Invalid severity.' });
  if (evaluationType === 'INSPECTION_COUNT' && category !== 'INSPECTION') return res.status(400).json({ error: 'Inspection-count rules must use the INSPECTION category.' });
  if (evaluationType === 'CORRECTIVE_ACTION_DEADLINE' && category !== 'CORRECTIVE_ACTION') return res.status(400).json({ error: 'Corrective-action rules must use the CORRECTIVE_ACTION category.' });
  const minimumCount = Number(configuration.minimumCount ?? 1);
  if (evaluationType === 'INSPECTION_COUNT' && (!Number.isInteger(minimumCount) || minimumCount < 1 || minimumCount > 50)) return res.status(400).json({ error: 'Minimum inspection count must be between 1 and 50.' });
  if (applicableMineIds.length) {
    const mines = await prisma.mine.findMany({ where: { id: { in: applicableMineIds } }, select: { id: true } });
    if (mines.length !== applicableMineIds.length) return res.status(400).json({ error: 'One or more applicable mine IDs are invalid.' });
  }
  try {
    const rule = await createComplianceRule({ code, title, description, category, frequency, severity, evaluationType, configuration: evaluationType === 'INSPECTION_COUNT' ? { minimumCount } : {}, requiredEvidenceType: evaluationType === 'INSPECTION_COUNT' ? 'INSPECTION' : 'CORRECTIVE_ACTION', sourceReference, applicableMineIds });
    await AuditService.recordEvent({ recordType: 'COMPLIANCE_RULE_CREATED', recordId: rule.id, action: 'CREATED', performedByRole: actorRole(req, 'ADMIN'), data: { ruleId: rule.id, code: rule.code, category: rule.category, sourceReference: rule.sourceReference, applicableMineIds } });
    return res.status(201).json({ ...rule, configuration: JSON.parse(rule.configuration) });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'A compliance rule with this code already exists.' });
    console.error('Compliance rule create failed:', error); return res.status(503).json({ error: 'Could not create the compliance rule.' });
  }
});

router.patch('/rules/:id', async (req: AuthenticatedRequest, res) => {
  if (typeof req.body?.active !== 'boolean') return res.status(400).json({ error: 'Supply active as true or false.' });
  try {
    const ruleId = String(req.params.id);
    const current = await prisma.complianceRule.findUnique({ where: { id: ruleId }, select: { active: true, code: true } });
    if (!current) return res.status(404).json({ error: 'Compliance rule not found.' });
    const rule = await setComplianceRuleActive(ruleId, req.body.active);
    if (current.active !== rule.active) await AuditService.recordEvent({ recordType: 'COMPLIANCE_RULE_UPDATED', recordId: rule.id, action: 'STATUS_CHANGED', performedByRole: actorRole(req, 'ADMIN'), data: { ruleId: rule.id, code: rule.code, from: current.active, to: rule.active } });
    return res.json({ ...rule, configuration: JSON.parse(rule.configuration) });
  } catch (error) { console.error('Compliance rule update failed:', error); return res.status(503).json({ error: 'Could not update the compliance rule.' }); }
});

export default router;
