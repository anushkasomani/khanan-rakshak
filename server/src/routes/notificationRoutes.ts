import { Router, Response } from 'express';
import { optionalAuthenticate, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../db';

const router = Router();

// GET /api/notifications
router.get('/', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  return res.json(notifications);
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req: AuthenticatedRequest, res: Response) => {
  const { count } = await prisma.notification.updateMany({
    where: { id: String(req.params.id), userId: req.user!.id },
    data: { read: true }
  });
  if (count === 0) return res.status(404).json({ error: 'Notification not found' });
  return res.json({ ok: true });
});

// GET /api/announcements
router.get('/announcements', async (req, res) => {
  const { mineId } = req.query;
  const where: any = {};
  if (mineId) where.mineId = String(mineId);

  const announcements = await prisma.announcement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  return res.json(announcements);
});

export default router;
