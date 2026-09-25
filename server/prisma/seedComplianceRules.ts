import { prisma } from '../src/db';
import { evaluateCompliance } from '../src/services/complianceService';

// Idempotent, additive demo data. This is intentionally separate from seed.ts,
// which resets the development database before loading its full sample dataset.
const demoRules = [
  {
    code: 'DEMO-PERIODIC-INSPECTION',
    title: 'Configured periodic safety inspection',
    description: 'Configured example: record at least one completed inspection in each evaluation period.',
    category: 'INSPECTION',
    frequency: 'MONTHLY',
    severity: 'HIGH',
    evaluationType: 'INSPECTION_COUNT',
    configuration: JSON.stringify({ minimumCount: 1, acceptedStatus: 'COMPLETED' }),
    requiredEvidenceType: 'INSPECTION',
    sourceReference: 'DEMO / CONFIGURED — not a verified statutory citation',
    active: true,
  },
  {
    code: 'DEMO-CORRECTIVE-ACTION-CLOSURE',
    title: 'Configured corrective-action closure',
    description: 'Configured example: linked corrective actions due in a period should be completed by their recorded deadlines.',
    category: 'CORRECTIVE_ACTION',
    frequency: 'MONTHLY',
    severity: 'MEDIUM',
    evaluationType: 'CORRECTIVE_ACTION_DEADLINE',
    configuration: JSON.stringify({}),
    requiredEvidenceType: 'CORRECTIVE_ACTION',
    sourceReference: 'DEMO / CONFIGURED — uses application deadlines; not a verified statutory citation',
    active: true,
  },
];

async function main() {
  for (const rule of demoRules) {
    await prisma.complianceRule.upsert({
      where: { code: rule.code },
      create: rule,
      update: rule,
    });
  }

  // Two deliberately synthetic mines let an empty development database show
  // both successful and overdue outcomes after an admin evaluates the rules.
  // All fixture IDs/codes are DEMO-prefixed so they are easy to identify.
  const mines = [
    { id: 'DEMO-MINE-COMPLIANT', code: 'DEMO-KR-001', name: 'Demo Mine — North Ridge', region: 'Demo Region', state: 'Demo State', status: 'OPERATIONAL' },
    { id: 'DEMO-MINE-OVERDUE', code: 'DEMO-KR-002', name: 'Demo Mine — South Seam', region: 'Demo Region', state: 'Demo State', status: 'CAUTION' },
  ];
  for (const mine of mines) {
    await prisma.mine.upsert({ where: { code: mine.code }, create: mine, update: mine });
  }

  // Put the fixtures in the last completed calendar month so the monthly
  // evaluator can be exercised regardless of the day this seed is run.
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 12));
  const completedAt = new Date(periodStart.getTime() + 10 * 86400000);
  const dueAt = new Date(periodStart.getTime() + 20 * 86400000);
  const inspectionFixtures = [
    { id: 'INS-DEMO-001', mineId: mines[0].id, inspectorName: 'Demo Inspector', inspectionType: 'ROOF_SUPPORT_CHECK', checklistData: '[{"item":"Roof supports","checked":true}]', findings: 'Demo fixture: no critical findings.', violationsCount: 0, status: 'COMPLETED', createdAt: periodStart, completedAt },
    { id: 'INS-DEMO-002', mineId: mines[1].id, inspectorName: 'Demo Inspector', inspectionType: 'VENTILATION_AUDIT', checklistData: '[{"item":"Ventilation","checked":true}]', findings: 'Demo fixture: sample inspection in progress.', violationsCount: 1, status: 'SCHEDULED', createdAt: periodStart, completedAt: null },
  ];
  for (const inspection of inspectionFixtures) {
    await prisma.inspection.upsert({ where: { id: inspection.id }, create: inspection, update: inspection });
  }

  const safetyFixtures = [
    { id: 'SAFE-DEMO-001', mineId: mines[0].id, category: 'STRUCTURAL', severity: 'LOW', description: 'DEMO fixture: sample support observation for compliance evidence.', status: 'RESOLVED', createdAt: periodStart },
    { id: 'SAFE-DEMO-002', mineId: mines[1].id, category: 'VENTILATION', severity: 'MEDIUM', description: 'DEMO fixture: sample ventilation observation for compliance evidence.', status: 'UNDER_INVESTIGATION', createdAt: periodStart },
  ];
  for (const report of safetyFixtures) {
    await prisma.safetyReport.upsert({ where: { id: report.id }, create: report, update: report });
  }

  const actionFixtures = [
    { id: 'ACT-DEMO-001', issueId: 'SAFE-DEMO-001', issueType: 'SAFETY_REPORT', actionRequired: 'DEMO: verify and document the sample support observation.', responsiblePerson: 'Demo Supervisor', deadline: dueAt, priority: 'LOW', status: 'COMPLETED', completedAt: new Date(dueAt.getTime() - 86400000) },
    { id: 'ACT-DEMO-002', issueId: 'SAFE-DEMO-002', issueType: 'SAFETY_REPORT', actionRequired: 'DEMO: complete the sample ventilation follow-up.', responsiblePerson: 'Demo Supervisor', deadline: dueAt, priority: 'MEDIUM', status: 'PENDING', completedAt: null },
  ];
  for (const action of actionFixtures) {
    await prisma.correctiveAction.upsert({ where: { id: action.id }, create: action, update: action });
  }
  let checksGenerated = 0;
  for (const mine of mines) {
    const result = await evaluateCompliance(mine.id, 'SYSTEM-DEMO-SEED');
    checksGenerated += result.checks.length;
  }
  console.log(`Ensured ${demoRules.length} configured demo compliance rules, ${mines.length} demo mines, sample evidence records, and ${checksGenerated} persisted demo checks.`);
}

main()
  .catch((error) => { console.error('Could not seed demo compliance rules:', error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
