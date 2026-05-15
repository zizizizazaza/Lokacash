import prisma from '../db.js';
import { emitToUser } from '../socket/index.js';

export interface NotifyOpts {
  userId: string;
  type: 'investment' | 'repayment' | 'liquidation' | 'governance' | 'credit' | 'system';
  title: string;
  body: string;
  refType?: string;
  refId?: string;
}

/** Create an in-app notification and push via WebSocket */
export async function notify(opts: NotifyOpts) {
  const notification = await prisma.notification.create({
    data: {
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      refType: opts.refType,
      refId: opts.refId,
    },
  });

  // Real-time push
  emitToUser(opts.userId, 'notification', notification);

  return notification;
}

/** Notify multiple users (e.g. all investors of a project) */
export async function notifyMany(userIds: string[], base: Omit<NotifyOpts, 'userId'>) {
  const results = await Promise.allSettled(
    userIds.map(userId => notify({ ...base, userId }))
  );
  return results;
}

/** Get unread count for a user */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } });
}
