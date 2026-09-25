import { Router, Response } from 'express';
import { optionalAuthenticate, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../db';

const router = Router();

// GET /api/recognition/leaderboard
router.get('/leaderboard', async (_req, res) => {
  // Top workers by points
  const topWorkers = await prisma.user.findMany({
    where: { role: 'WORKER' },
    select: {
      id: true,
      name: true,
      badgeNumber: true,
      points: true,
      department: true,
      mine: { select: { name: true, code: true } },
      badges: true
    },
    orderBy: { points: 'desc' },
    take: 10
  });

  // Top mines by compliance
  const topMines = await prisma.mine.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      complianceScore: true,
      activeWorkers: true,
      region: true
    },
    orderBy: { complianceScore: 'desc' },
    take: 5
  });

  // System Badge Definitions
  const availableBadges = [
    { code: 'SAFETY_CHAMPION', title: 'Safety Champion', icon: '🏆', description: 'Awarded for continuous zero-violation shifts and 25+ verified safety contributions' },
    { code: 'HAZARD_HUNTER', title: 'Hazard Hunter', icon: '🛡️', description: 'Reported 5+ verified early-stage physical or environmental hazards' },
    { code: 'COMPLIANCE_LEADER', title: 'Compliance Leader', icon: '⭐', description: 'Maintains 100% completion on weekly safety checklists and PPE audits' },
    { code: 'EARLY_RISK_REPORTER', title: 'Early Risk Reporter', icon: '🚨', description: 'Spotted critical mechanical or gas hazards preventing emergency shutdown' },
    { code: 'ZERO_PENDING_ACTIONS', title: 'Zero Pending Actions', icon: '🏅', description: 'Closed all assigned corrective actions before scheduled statutory deadlines' },
  ];

  return res.json({
    topWorkers,
    topMines,
    availableBadges
  });
});

// GET /api/recognition/my-points
router.get('/my-points', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      mine: true,
      badges: true,
      pointsHistory: { orderBy: { createdAt: 'desc' }, take: 20 }
    }
  });

  if (!user) return res.status(404).json({ error: 'User not found' });

  return res.json({
    totalPoints: user.points,
    badges: user.badges,
    history: user.pointsHistory,
    tier: user.points > 200 ? 'Gold Safety Master' : user.points > 100 ? 'Silver Guardian' : 'Bronze Scout',
    nextMilestone: user.points > 200 ? 500 : user.points > 100 ? 200 : 100
  });
});

export default router;
