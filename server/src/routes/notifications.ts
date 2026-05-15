import { Router } from 'express';
import prisma from '../db.js';
import { authRequired, type AuthRequest } from '../middleware/auth.js';
import { getUnreadCount } from '../services/notification.service.js';

const router = Router();

// Get notifications (paginated)
router.get('/', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);
    const cursor = req.query.cursor as string | undefined;

    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = notifications.length > limit;
    if (hasMore) notifications.pop();

    const unread = await getUnreadCount(req.userId!);

    res.json({
      notifications,
      unread,
      nextCursor: hasMore ? notifications[notifications.length - 1]?.id : null,
    });
  } catch (err) {
    next(err);
  }
});

// Mark single notification as read
router.patch('/:id/read', authRequired, async (req: AuthRequest, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id as string, userId: req.userId! },
      data: { read: true },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Mark all notifications as read
router.post('/read-all', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const { count } = await prisma.notification.updateMany({
      where: { userId: req.userId!, read: false },
      data: { read: true },
    });
    res.json({ ok: true, marked: count });
  } catch (err) {
    next(err);
  }
});

// Get unread count
router.get('/unread-count', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const count = await getUnreadCount(req.userId!);
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

export default router;
