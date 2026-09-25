import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

// GET /api/compliance/dashboard (KPIs & Metrics)
router.get('/dashboard', async (req, res) => {
  const { mineId } = req.query;
  const whereMine = mineId ? { mineId: String(mineId) } : {};

  // Aggregate stats
  const [
    totalReports,
    resolvedReports,
    resolvedRows,
    criticalReports,
    allActions,
    allInspections,
    mines,
    incidents,
    activeSos
  ] = await Promise.all([
    prisma.safetyReport.count({ where: whereMine }),
    prisma.safetyReport.count({ where: { ...whereMine, status: 'RESOLVED' } }),
    prisma.safetyReport.findMany({ where: { ...whereMine, status: 'RESOLVED' }, select: { updatedAt: true } }),
    prisma.safetyReport.count({ where: { ...whereMine, severity: 'CRITICAL' } }),
    prisma.correctiveAction.findMany(),
    prisma.inspection.findMany({ where: whereMine }),
    prisma.mine.findMany({ where: mineId ? { id: String(mineId) } : {}, include: { _count: { select: { safetyReports: true, incidents: true } } } }),
    prisma.incident.findMany({ where: whereMine }),
    prisma.sosAlert.count({ where: { ...whereMine, status: { in: ['ALERT_TRIGGERED', 'ACKNOWLEDGED', 'TEAM_ASSIGNED', 'RESPONDING'] } } })
  ]);

  const pendingActions = allActions.filter(a => a.status === 'PENDING' || a.status === 'IN_PROGRESS').length;
  const overdueActions = allActions.filter(a => a.status !== 'COMPLETED' && new Date(a.deadline) < new Date()).length;
  const openViolations = allInspections.reduce((acc, curr) => acc + (curr.status !== 'COMPLETED' ? curr.violationsCount : 0), 0);

  // Overall compliance score calculation
  const avgCompliance = mines.length
    ? Math.round((mines.reduce((acc, m) => acc + m.complianceScore, 0) / mines.length) * 10) / 10
    : null;

  const inspectionCompleted = allInspections.filter(i => i.status === 'COMPLETED').length;
  const inspectionRate = allInspections.length ? Math.round((inspectionCompleted / allInspections.length) * 100) : null;

  // Category breakdown for charts
  const categoriesRaw = await prisma.safetyReport.groupBy({
    by: ['category'],
    _count: { id: true },
    where: whereMine
  });
  const categoryBreakdown = categoriesRaw.map(c => ({
    name: c.category,
    count: c._count.id
  }));

  // Severity breakdown
  const severityRaw = await prisma.safetyReport.groupBy({
    by: ['severity'],
    _count: { id: true },
    where: whereMine
  });
  const severityBreakdown = severityRaw.map(s => ({
    name: s.severity,
    count: s._count.id
  }));

  const monthlyTrends = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const next = new Date(date);
    next.setMonth(next.getMonth() + 1);
    const inspections = allInspections.filter((i) => i.createdAt >= date && i.createdAt < next);
    const monthlyIncidents = incidents.filter((i) => i.createdAt >= date && i.createdAt < next).length;
    const monthlyResolved = resolvedRows.filter((r) => r.updatedAt >= date && r.updatedAt < next).length;
    return { month: date.toLocaleString('en', { month: 'short' }), inspectionCompletionRate: inspections.length ? Math.round((inspections.filter((i) => i.status === 'COMPLETED').length / inspections.length) * 100) : null, incidents: monthlyIncidents, resolvedReports: monthlyResolved };
  });

  return res.json({
    kpis: {
      overallCompliance: avgCompliance,
      openViolations,
      criticalViolations: criticalReports,
      pendingCorrectiveActions: pendingActions,
      overdueCorrectiveActions: overdueActions,
      totalSafetyReports: totalReports,
      resolvedSafetyReports: resolvedReports,
      inspectionCompletionRate: inspectionRate,
      averageResponseTimeHours: null,
      activeSosCount: activeSos
    },
    categoryBreakdown,
    severityBreakdown,
    monthlyTrends,
  });
});

// GET /api/compliance/corporate-summary (Multi-Mine Comparison Table)
router.get('/corporate-summary', async (_req, res) => {
  const mines = await prisma.mine.findMany({
    include: {
      safetyReports: { select: { id: true, severity: true, status: true } },
      incidents: { select: { id: true, severity: true } },
      inspections: { select: { id: true, violationsCount: true, status: true } },
      sosAlerts: { select: { id: true, status: true } }
    },
    orderBy: { complianceScore: 'desc' }
  });

  const summary = mines.map((m) => {
    const openReports = m.safetyReports.filter(r => r.status !== 'RESOLVED').length;
    const criticalReports = m.safetyReports.filter(r => r.severity === 'CRITICAL' && r.status !== 'RESOLVED').length;
    const activeSos = m.sosAlerts.filter(s => s.status !== 'RESOLVED').length;
    const totalViolations = m.inspections.reduce((acc, curr) => acc + curr.violationsCount, 0);

    // Dynamic response time based on compliance
    const responseTime = null;

    return {
      id: m.id,
      name: m.name,
      code: m.code,
      region: m.region,
      state: m.state,
      complianceScore: m.complianceScore,
      activeWorkers: m.activeWorkers,
      status: m.status,
      openIssues: openReports,
      criticalIssues: criticalReports,
      totalIncidents: m.incidents.length,
      totalViolations,
      activeSos,
      averageResponseTime: responseTime
    };
  });

  return res.json(summary);
});

export default router;
