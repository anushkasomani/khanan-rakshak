import { prisma } from '../db';

const OPEN_INCIDENT = { notIn: ['RESOLVED', 'CLOSED'] };
const ACTIVE_SOS = ['ALERT_TRIGGERED', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'RESPONDING'];

export type GovernancePeriod = 7 | 30 | 90;

export async function governanceAnalytics(options: { mineId?: string; periodDays?: GovernancePeriod; includeDetailedEvidence?: boolean } = {}) {
  const now = new Date();
  const periodDays = options.periodDays || 30;
  const currentStart = new Date(now.getTime() - periodDays * 86400000);
  const previousStart = new Date(now.getTime() - periodDays * 2 * 86400000);
  const allMines = await prisma.mine.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } });
  if (options.mineId && !allMines.some((mine) => mine.id === options.mineId)) throw new Error('MINE_NOT_FOUND');
  const mines = options.mineId ? allMines.filter((mine) => mine.id === options.mineId) : allMines;
  const mineIds = mines.map((mine) => mine.id);
  const inScope = { mineId: { in: mineIds } };
  const [hazards, actions, inspections, incidents, sos, grievances, complianceChecks] = await Promise.all([
    prisma.safetyReport.findMany({ where: inScope, select: { id: true, mineId: true, category: true, severity: true, status: true, districtId: true, createdAt: true, updatedAt: true, mine: { select: { name: true } }, district: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.correctiveAction.findMany({ select: { id: true, issueId: true, issueType: true, deadline: true, priority: true, status: true, createdAt: true, completedAt: true } }),
    prisma.inspection.findMany({ where: inScope, select: { id: true, mineId: true, inspectionType: true, status: true, violationsCount: true, createdAt: true, completedAt: true, deadline: true, mine: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.incident.findMany({ where: inScope, select: { id: true, mineId: true, incidentType: true, severity: true, status: true, createdAt: true, mine: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 1500 }),
    prisma.sosAlert.findMany({ where: inScope, select: { id: true, mineId: true, emergencyType: true, status: true, triggeredAt: true, resolvedAt: true, mine: { select: { name: true } } }, orderBy: { triggeredAt: 'desc' }, take: 1500 }),
    prisma.grievance.findMany({ where: inScope, select: { id: true, mineId: true } }),
    prisma.complianceCheck.findMany({ where: { mineId: { in: mineIds }, rule: { active: true } }, select: { id: true, mineId: true, ruleId: true, status: true, checkedAt: true }, orderBy: { checkedAt: 'desc' }, take: 5000 }),
  ]);

  const metrics: any[] = [];
  const risks: any[] = [];
  const recurring: any[] = [];
  const anomalies: any[] = [];
  const dataWarnings: any[] = [];
  const latestComplianceChecks = new Map<string, (typeof complianceChecks)[number]>();
  for (const check of complianceChecks) {
    const key = `${check.mineId}:${check.ruleId}`;
    if (!latestComplianceChecks.has(key)) latestComplianceChecks.set(key, check);
  }
  const complianceByMine = mines.map((mine) => {
    const checks = [...latestComplianceChecks.values()].filter((check) => check.mineId === mine.id);
    return { mineId: mine.id, mineName: mine.name, total: checks.length, compliant: checks.filter((check) => check.status === 'COMPLIANT').length, nonCompliant: checks.filter((check) => check.status === 'NON_COMPLIANT').length, overdue: checks.filter((check) => check.status === 'OVERDUE').length, partiallyCompliant: checks.filter((check) => check.status === 'PARTIALLY_COMPLIANT').length, insufficientData: checks.filter((check) => check.status === 'INSUFFICIENT_DATA').length };
  });
  const complianceSummary = { total: complianceByMine.reduce((sum, row) => sum + row.total, 0), evaluatedMines: complianceByMine.filter((row) => row.total > 0).length, compliant: complianceByMine.reduce((sum, row) => sum + row.compliant, 0), nonCompliant: complianceByMine.reduce((sum, row) => sum + row.nonCompliant, 0), overdue: complianceByMine.reduce((sum, row) => sum + row.overdue, 0), partiallyCompliant: complianceByMine.reduce((sum, row) => sum + row.partiallyCompliant, 0), insufficientData: complianceByMine.reduce((sum, row) => sum + row.insufficientData, 0), byMine: complianceByMine };

  for (const mine of mines) {
    const allMineHazards = hazards.filter((row) => row.mineId === mine.id);
    const openHazards = allMineHazards.filter((row) => row.status !== 'RESOLVED');
    const mineInspections = inspections.filter((row) => row.mineId === mine.id);
    const mineIncidents = incidents.filter((row) => row.mineId === mine.id);
    const mineSos = sos.filter((row) => row.mineId === mine.id);
    const issueKeys = new Set([
      ...allMineHazards.map((row) => `SAFETY_REPORT:${row.id}`),
      ...mineInspections.map((row) => `INSPECTION:${row.id}`),
      ...mineIncidents.map((row) => `INCIDENT:${row.id}`),
      ...grievances.filter((row) => row.mineId === mine.id).map((row) => `GRIEVANCE:${row.id}`),
    ]);
    const mineActions = actions.filter((row) => issueKeys.has(`${row.issueType}:${row.issueId}`));
    const overdue = mineActions.filter((row) => row.status !== 'COMPLETED' && row.deadline < now);
    const severeHazards = openHazards.filter((row) => ['HIGH', 'CRITICAL'].includes(row.severity));
    const openIncidents = mineIncidents.filter((row) => !['RESOLVED', 'CLOSED'].includes(row.status));
    const activeSos = mineSos.filter((row) => ACTIVE_SOS.includes(row.status));
    const periodInspections = mineInspections.filter((row) => row.createdAt >= currentStart);
    const periodHazards = allMineHazards.filter((row) => row.createdAt >= currentStart);
    const periodIncidents = mineIncidents.filter((row) => row.createdAt >= currentStart);
    const previousInspections = mineInspections.filter((row) => row.createdAt >= previousStart && row.createdAt < currentStart);
    const previousHazards = allMineHazards.filter((row) => row.createdAt >= previousStart && row.createdAt < currentStart);
    const previousIncidents = mineIncidents.filter((row) => row.createdAt >= previousStart && row.createdAt < currentStart);
    const periodViolations = periodInspections.reduce((sum, row) => sum + row.violationsCount, 0);
    const missedInspections = periodInspections.filter((row) => row.status === 'MISSED');

    const indicators = [
      ...(severeHazards.length ? [{ type: 'UNRESOLVED_SEVERE_HAZARD', description: 'Open high or critical hazards', count: severeHazards.length, evidenceIds: severeHazards.map((row) => row.id) }] : []),
      ...(overdue.length ? [{ type: 'OVERDUE_CORRECTIVE_ACTION', description: 'Open actions past deadline', count: overdue.length, evidenceIds: overdue.map((row) => row.id) }] : []),
      ...(openIncidents.length ? [{ type: 'OPEN_INCIDENT', description: 'Incidents not resolved or closed', count: openIncidents.length, evidenceIds: openIncidents.map((row) => row.id) }] : []),
      ...(activeSos.length ? [{ type: 'ACTIVE_SOS', description: 'SOS alerts awaiting resolution', count: activeSos.length, evidenceIds: activeSos.map((row) => row.id) }] : []),
      ...(missedInspections.length ? [{ type: 'MISSED_INSPECTION', description: `Inspections marked missed in the last ${periodDays} days`, count: missedInspections.length, evidenceIds: missedInspections.map((row) => row.id) }] : []),
      ...(periodViolations ? [{ type: 'INSPECTION_FINDINGS', description: `Inspection violations recorded in the last ${periodDays} days`, count: periodViolations, evidenceIds: periodInspections.filter((row) => row.violationsCount > 0).map((row) => row.id) }] : []),
    ];
    const score = activeSos.length * 10 + severeHazards.length * 3 + overdue.length * 2 + openIncidents.length * 2 + missedInspections.length + Math.min(periodViolations, 5);
    risks.push({ mineId: mine.id, mineName: mine.name, score, riskLevel: score >= 10 ? 'HIGH' : score >= 4 ? 'ELEVATED' : 'NORMAL', indicators });

    for (const [groupKey, group] of groupBy(periodHazards.filter((row) => row.status !== 'RESOLVED'), (row) => `${row.category}|${row.districtId || 'mine'}`)) {
      if (group.length >= 2) recurring.push({ mineId: mine.id, mineName: mine.name, issue: groupKey.split('|')[0], location: group[0].district?.name || 'Mine-wide', count: group.length, detection: 'same mine, category and district among open hazards in the selected period', evidenceIds: group.map((row) => row.id), firstSeen: group[group.length - 1].createdAt, lastSeen: group[0].createdAt });
    }

    if (previousInspections.length >= 2 && periodInspections.length <= previousInspections.length * 0.5) {
      anomalies.push({ mineId: mine.id, mineName: mine.name, metric: `inspections_created_${periodDays}d`, value: periodInspections.length, previousValue: previousInspections.length, status: 'anomaly', explanation: `Inspection creation fell by at least 50% compared with the previous ${periodDays}-day period.`, evidenceIds: [...periodInspections, ...previousInspections].map((row) => row.id) });
    }
    if (previousHazards.length >= 2 && periodHazards.length >= Math.max(4, previousHazards.length * 2)) {
      anomalies.push({ mineId: mine.id, mineName: mine.name, metric: `hazards_reported_${periodDays}d`, value: periodHazards.length, previousValue: previousHazards.length, status: 'anomaly', explanation: `Hazard reports increased to at least twice the previous ${periodDays}-day count.`, evidenceIds: [...periodHazards, ...previousHazards].map((row) => row.id) });
    }
    if (previousIncidents.length >= 1 && periodIncidents.length >= Math.max(2, previousIncidents.length * 2)) {
      anomalies.push({ mineId: mine.id, mineName: mine.name, metric: `incidents_reported_${periodDays}d`, value: periodIncidents.length, previousValue: previousIncidents.length, status: 'anomaly', explanation: `Incident reports increased to at least twice the previous ${periodDays}-day count.`, evidenceIds: [...periodIncidents, ...previousIncidents].map((row) => row.id) });
    }

    const currentClosures = mineActions.filter((row) => row.status === 'COMPLETED' && row.completedAt && row.completedAt >= currentStart);
    const previousClosures = mineActions.filter((row) => row.status === 'COMPLETED' && row.completedAt && row.completedAt >= previousStart && row.completedAt < currentStart);
    const closureDays = (rows: typeof currentClosures) => rows.map((row) => (row.completedAt!.getTime() - row.createdAt.getTime()) / 86400000).filter((n) => n >= 0);
    const currentDays = closureDays(currentClosures);
    const previousDays = closureDays(previousClosures);
    const avgCurrentDays = currentDays.length ? currentDays.reduce((sum, n) => sum + n, 0) / currentDays.length : null;
    const avgPreviousDays = previousDays.length ? previousDays.reduce((sum, n) => sum + n, 0) / previousDays.length : null;
    if (currentDays.length >= 2 && previousDays.length >= 2 && avgCurrentDays! > avgPreviousDays! * 1.5) {
      anomalies.push({ mineId: mine.id, mineName: mine.name, metric: `action_closure_days_${periodDays}d`, value: Math.round(avgCurrentDays! * 10) / 10, previousValue: Math.round(avgPreviousDays! * 10) / 10, status: 'anomaly', explanation: 'Average corrective-action closure time increased by more than 50% against the previous period.', evidenceIds: [...currentClosures, ...previousClosures].map((row) => row.id) });
    }

    const previousRecordCount = previousInspections.length + previousHazards.length + previousIncidents.length;
    const currentRecordCount = periodInspections.length + periodHazards.length + periodIncidents.length;
    const evidenceQuality = currentRecordCount >= 10 && previousRecordCount >= 5 ? 'HIGH' : currentRecordCount >= 4 || previousRecordCount >= 4 ? 'MODERATE' : 'LIMITED';
    const warningReasons: string[] = [];
    if (previousInspections.length < 2) warningReasons.push(`Only ${previousInspections.length} inspections in the previous ${periodDays}-day baseline.`);
    if (currentRecordCount + previousRecordCount < 4) warningReasons.push('Few operational records are available across the selected and comparison periods.');
    if (warningReasons.length) dataWarnings.push({ mineId: mine.id, mineName: mine.name, evidenceQuality, warnings: warningReasons });

    metrics.push({ mineId: mine.id, mineName: mine.name, period: `last ${periodDays} days`, inspectionCount: periodInspections.length, previousInspectionCount: previousInspections.length, incidentCount: periodIncidents.length, previousIncidentCount: previousIncidents.length, hazardCount: periodHazards.length, previousHazardCount: previousHazards.length, inspectionViolationCount: periodViolations, activeSosCount: activeSos.length, overdueActionCount: overdue.length, completedActionCount: currentClosures.length, meanActionClosureDays: avgCurrentDays === null ? null : Math.round(avgCurrentDays * 10) / 10, previousMeanActionClosureDays: avgPreviousDays === null ? null : Math.round(avgPreviousDays * 10) / 10, dataStatus: currentDays.length ? 'available' : 'insufficient_data', evidenceQuality, currentRecordCount, previousRecordCount });
  }

  const response = {
    generatedAt: now.toISOString(),
    filters: { mineId: options.mineId || null, periodDays },
    coverage: { mines: mines.length, hazards: hazards.length, openHazards: hazards.filter((row: any) => row.status !== 'RESOLVED').length, inspections: inspections.length, incidents: incidents.length, sosAlerts: sos.length, correctiveActions: actions.length },
    metrics,
    risks,
    recurringIssues: recurring.sort((a, b) => b.count - a.count),
    anomalies,
    dataWarnings,
    complianceSummary,
    evidence: {
      hazards: hazards.slice(0, 500).map((row: any) => ({ id: row.id, mineId: row.mineId, mineName: row.mine.name, category: row.category, severity: row.severity, status: row.status, district: row.district?.name || null, createdAt: row.createdAt, updatedAt: row.updatedAt })),
      inspections: inspections.slice(0, 500).map((row: any) => ({ id: row.id, mineId: row.mineId, mineName: row.mine.name, type: row.inspectionType, status: row.status, violationsCount: row.violationsCount, createdAt: row.createdAt, completedAt: row.completedAt, deadline: row.deadline })),
      incidents: incidents.slice(0, 500).map((row: any) => ({ id: row.id, mineId: row.mineId, mineName: row.mine.name, type: row.incidentType, severity: row.severity, status: row.status, createdAt: row.createdAt })),
      sos: sos.slice(0, 500).map((row: any) => ({ id: row.id, mineId: row.mineId, mineName: row.mine.name, type: row.emergencyType, status: row.status, triggeredAt: row.triggeredAt })),
      correctiveActions: actions.filter((row) => row.status !== 'COMPLETED' && row.deadline < now).map((row) => ({ id: row.id, issueId: row.issueId, issueType: row.issueType, priority: row.priority, status: row.status, deadline: row.deadline })),
    },
  };
  const aiEvidence = options.includeDetailedEvidence
    ? await buildAiEvidence({ mines, hazards, inspections, incidents, sos, actions, grievances, recurring, anomalies, currentStart, previousStart, now })
    : undefined;
  return { ...response, aiEvidence };
}

const MAX_EVIDENCE_PER_CATEGORY = 10;
const MAX_EVIDENCE_TEXT = 500;

function safeEvidenceText(value: string | null | undefined) {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, ' ').trim()
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email redacted]')
    .replace(/\b(?:\+?\d[\d ().-]{7,}\d)\b/g, '[phone redacted]');
  return compact.length > MAX_EVIDENCE_TEXT ? `${compact.slice(0, MAX_EVIDENCE_TEXT)}…` : compact;
}

function boundedRecords<T>(rows: T[], rank: (row: T) => number, date: (row: T) => Date, limit = MAX_EVIDENCE_PER_CATEGORY) {
  return rows.slice().sort((a, b) => rank(a) - rank(b) || date(b).getTime() - date(a).getTime()).slice(0, limit);
}

async function buildAiEvidence(input: {
  mines: { id: string; name: string }[]; hazards: any[]; inspections: any[]; incidents: any[]; sos: any[]; actions: any[]; grievances: any[];
  recurring: any[]; anomalies: any[]; currentStart: Date; previousStart: Date; now: Date;
}) {
  const mineNames = new Map(input.mines.map((mine) => [mine.id, mine.name]));
  const recurringIds = new Set(input.recurring.flatMap((row) => row.evidenceIds));
  const anomalyIds = new Set(input.anomalies.flatMap((row) => row.evidenceIds));
  const mineIssueKeys = new Map<string, { mineId: string; mineName: string }>();
  for (const row of input.hazards) mineIssueKeys.set(`SAFETY_REPORT:${row.id}`, { mineId: row.mineId, mineName: mineNames.get(row.mineId) || 'Mine' });
  for (const row of input.inspections) mineIssueKeys.set(`INSPECTION:${row.id}`, { mineId: row.mineId, mineName: mineNames.get(row.mineId) || 'Mine' });
  for (const row of input.incidents) mineIssueKeys.set(`INCIDENT:${row.id}`, { mineId: row.mineId, mineName: mineNames.get(row.mineId) || 'Mine' });
  for (const row of input.grievances) mineIssueKeys.set(`GRIEVANCE:${row.id}`, { mineId: row.mineId, mineName: mineNames.get(row.mineId) || 'Mine' });

  const hazards = boundedRecords(
    input.hazards.filter((row) => row.status !== 'RESOLVED' || recurringIds.has(row.id) || anomalyIds.has(row.id)),
    (row) => row.status !== 'RESOLVED' && ['HIGH', 'CRITICAL'].includes(row.severity) ? 0 : recurringIds.has(row.id) ? 1 : anomalyIds.has(row.id) ? 2 : 3,
    (row) => row.createdAt,
  ).map((row) => ({ id: row.id, mineId: row.mineId, mineName: row.mine.name, category: row.category, severity: row.severity, status: row.status, district: row.district?.name || null, createdAt: row.createdAt, updatedAt: row.updatedAt }));

  const incidents = boundedRecords(
    input.incidents.filter((row) => !['RESOLVED', 'CLOSED'].includes(row.status) || anomalyIds.has(row.id)),
    (row) => !['RESOLVED', 'CLOSED'].includes(row.status) ? 0 : anomalyIds.has(row.id) ? 1 : 2,
    (row) => row.createdAt,
  ).map((row) => ({ id: row.id, mineId: row.mineId, mineName: row.mine.name, type: row.incidentType, severity: row.severity, status: row.status, createdAt: row.createdAt }));

  const actions = boundedRecords(
    input.actions.filter((row) => {
      const owner = mineIssueKeys.get(`${row.issueType}:${row.issueId}`);
      return !!owner && (row.status !== 'COMPLETED' && row.deadline < input.now || anomalyIds.has(row.id) || recurringIds.has(row.issueId));
    }),
    (row) => row.status !== 'COMPLETED' && row.deadline < input.now ? 0 : anomalyIds.has(row.id) ? 1 : 2,
    (row) => row.createdAt,
  ).map((row) => {
    const owner = mineIssueKeys.get(`${row.issueType}:${row.issueId}`)!;
    return { id: row.id, ...owner, issueId: row.issueId, issueType: row.issueType, priority: row.priority, status: row.status, deadline: row.deadline, createdAt: row.createdAt, completedAt: row.completedAt };
  });

  const inspections = boundedRecords(
    input.inspections.filter((row) => row.violationsCount > 0 || row.status === 'MISSED' || anomalyIds.has(row.id) || row.createdAt >= input.previousStart),
    (row) => row.violationsCount > 0 ? 0 : row.status === 'MISSED' ? 1 : anomalyIds.has(row.id) ? 2 : 3,
    (row) => row.createdAt,
  ).map((row) => ({ id: row.id, mineId: row.mineId, mineName: row.mine.name, type: row.inspectionType, status: row.status, violationsCount: row.violationsCount, createdAt: row.createdAt, completedAt: row.completedAt, deadline: row.deadline }));

  const sos = boundedRecords(
    input.sos.filter((row) => ['ALERT_TRIGGERED', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'RESPONDING'].includes(row.status) || row.triggeredAt >= input.currentStart),
    (row) => ['ALERT_TRIGGERED', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'RESPONDING'].includes(row.status) ? 0 : 1,
    (row) => row.triggeredAt,
  ).map((row) => ({ id: row.id, mineId: row.mineId, mineName: row.mine.name, type: row.emergencyType, status: row.status, triggeredAt: row.triggeredAt, resolvedAt: row.resolvedAt }));

  // Retrieve free-text evidence only after candidate records have been ranked
  // and capped, avoiding loading large text columns for every queried row.
  const [hazardDetails, incidentDetails, actionDetails, inspectionDetails] = await Promise.all([
    hazards.length ? prisma.safetyReport.findMany({ where: { id: { in: hazards.map((row) => row.id) } }, select: { id: true, description: true } }) : Promise.resolve([]),
    incidents.length ? prisma.incident.findMany({ where: { id: { in: incidents.map((row) => row.id) } }, select: { id: true, description: true, rootCause: true } }) : Promise.resolve([]),
    actions.length ? prisma.correctiveAction.findMany({ where: { id: { in: actions.map((row) => row.id) } }, select: { id: true, actionRequired: true } }) : Promise.resolve([]),
    inspections.length ? prisma.inspection.findMany({ where: { id: { in: inspections.map((row) => row.id) } }, select: { id: true, findings: true } }) : Promise.resolve([]),
  ]);
  const hazardText = new Map(hazardDetails.map((row) => [row.id, row.description]));
  const incidentText = new Map(incidentDetails.map((row) => [row.id, { description: row.description, rootCause: row.rootCause }]));
  const actionText = new Map(actionDetails.map((row) => [row.id, row.actionRequired]));
  const inspectionText = new Map(inspectionDetails.map((row) => [row.id, row.findings]));
  const hazardsWithText = hazards.map((row) => ({ ...row, description: safeEvidenceText(hazardText.get(row.id)) }));
  const incidentsWithText = incidents.map((row) => {
    const text = incidentText.get(row.id);
    return { ...row, description: safeEvidenceText(text?.description), recordedRootCause: safeEvidenceText(text?.rootCause) };
  });
  const actionsWithText = actions.map((row) => ({ ...row, actionRequired: safeEvidenceText(actionText.get(row.id)) }));
  const inspectionsWithText = inspections.map((row) => ({ ...row, findings: safeEvidenceText(inspectionText.get(row.id)) }));

  return { maxRecordsPerCategory: MAX_EVIDENCE_PER_CATEGORY, maxTextCharactersPerField: MAX_EVIDENCE_TEXT, hazards: hazardsWithText, incidents: incidentsWithText, correctiveActions: actionsWithText, inspections: inspectionsWithText, sos };
}

function groupBy<T>(values: T[], key: (value: T) => string) {
  const result = new Map<string, T[]>();
  for (const value of values) { const k = key(value); result.set(k, [...(result.get(k) || []), value]); }
  return result;
}
