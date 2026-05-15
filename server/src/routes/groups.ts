import { Router } from 'express';
import prisma from '../db.js';
import { authRequired, type AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { emitToGroup, emitToUser, joinSocketRoom } from '../socket/index.js';

const router = Router();

// ============ Discover all groups (public square) ============
router.get('/discover', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const me = req.userId!;

    const groups = await prisma.groupChat.findMany({
      include: {
        _count: { select: { members: true } },
        members: {
          where: { userId: me },
          select: { userId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = groups.map(g => ({
      id: g.id,
      name: g.name,
      bio: g.bio,
      avatar: g.avatar,
      memberCount: g._count.members,
      isMember: g.members.length > 0,
      createdAt: g.createdAt,
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============ List groups (user's groups) ============
router.get('/', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const groups = await prisma.groupChat.findMany({
      where: {
        members: { some: { userId: req.userId! } },
      },
      include: {
        project: { select: { id: true, title: true, status: true, coverImage: true, apy: true } },
        members: {
          select: { userId: true, role: true },
        },
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with last message preview
    const enriched = groups.map(g => ({
      ...g,
      lastMessage: g.messages[0] || null,
      messages: undefined, // remove raw messages array
    }));

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// ============ Get group messages (with cursor pagination) ============
const msgQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get('/:id/messages', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const groupId = req.params.id as string;
    const { cursor, limit } = msgQuerySchema.parse(req.query);

    // Verify membership
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: req.userId! } },
    });
    if (!member) throw new AppError('Not a member of this group', 403);

    const messages = await prisma.groupMessage.findMany({
      where: { groupId },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, name: true, avatar: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Return oldest-first for display, with pagination metadata
    const sorted = messages.reverse();
    res.json({
      messages: sorted,
      nextCursor: messages.length === limit ? messages[messages.length - 1].id : null,
      hasMore: messages.length === limit,
    });
  } catch (err) {
    next(err);
  }
});

// ============ Send group message + WebSocket broadcast ============
const sendGroupMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

router.post('/:id/messages', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const { content } = sendGroupMessageSchema.parse(req.body);
    const groupId = req.params.id as string;

    // Verify user is a member
    const member = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId: req.userId! },
      },
    });

    if (!member) {
      throw new AppError('Not a member of this group', 403);
    }

    const message = await prisma.groupMessage.create({
      data: {
        groupId,
        userId: req.userId!,
        content,
        role: member.role,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true, role: true } },
      },
    });

    // Broadcast to all group members via WebSocket
    emitToGroup(groupId, 'group:message', message);

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

// ============ Delete a message ============
router.delete('/:groupId/messages/:messageId', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const groupId = req.params.groupId as string;
    const messageId = req.params.messageId as string;
    const userId = req.userId!;

    const message = await prisma.groupMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) throw new AppError('Message not found', 404);
    if (message.groupId !== groupId) throw new AppError('Message does not belong to this group', 400);

    // Only the sender or a group admin can delete
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!member) throw new AppError('Not a member', 403);

    if (message.userId !== userId && member.role !== 'admin') {
      throw new AppError('Can only delete your own messages', 403);
    }

    await prisma.groupMessage.delete({ where: { id: messageId as string } });

    // Broadcast deletion
    emitToGroup(groupId, 'group:message:deleted', { messageId, groupId });

    res.json({ deleted: true, messageId });
  } catch (err) {
    next(err);
  }
});

// ============ Join a group ============
router.post('/:id/join', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const groupId = req.params.id as string;
    const userId = req.userId!;

    // Check if group exists
    const group = await prisma.groupChat.findUnique({ where: { id: groupId } });
    if (!group) throw new AppError('Group not found', 404);

    // Check if already a member
    const existing = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (existing) throw new AppError('Already a member', 400);

    // Get user info
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const role = user?.role === 'issuer' ? 'issuer' : 'investor';
    const userName = user?.name || 'Someone';

    const member = await prisma.groupMember.create({
      data: { groupId, userId, role },
    });

    // 1. Make the new user's socket join the group room immediately
    joinSocketRoom(userId, `group:${groupId}`);

    // 2. Create a system message "xxx joined the group" (Telegram-style)
    const systemMsg = await prisma.groupMessage.create({
      data: {
        groupId,
        userId,
        content: `${userName} joined the group`,
        attachmentType: 'system',
        role,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true, role: true } },
      },
    });

    // 3. Broadcast the system message to all group members
    emitToGroup(groupId, 'group:message', systemMsg);

    // 4. Notify the new user to refresh their conversation list
    emitToUser(userId, 'group:joined', { groupId });

    // 5. Get updated member count & broadcast member:joined with details
    const memberCount = await prisma.groupMember.count({ where: { groupId } });
    emitToGroup(groupId, 'group:member:joined', {
      groupId,
      userId,
      name: userName,
      avatar: user?.avatar || null,
      role,
      memberCount,
    });

    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
});

// ============ Leave a group ============
router.post('/:id/leave', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const groupId = req.params.id as string;
    const userId = req.userId!;

    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!member) throw new AppError('Not a member', 400);

    // Get user name before deletion
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const userName = user?.name || 'Someone';

    await prisma.groupMember.delete({
      where: { groupId_userId: { groupId, userId } },
    });

    // Create a system message "xxx left the group"
    const systemMsg = await prisma.groupMessage.create({
      data: {
        groupId,
        userId,
        content: `${userName} left the group`,
        attachmentType: 'system',
        role: member.role,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true, role: true } },
      },
    });

    // Broadcast the system message
    emitToGroup(groupId, 'group:message', systemMsg);

    // Broadcast leave event with updated count
    const memberCount = await prisma.groupMember.count({ where: { groupId } });
    emitToGroup(groupId, 'group:member:left', { groupId, userId, memberCount });

    res.json({ left: true, groupId });
  } catch (err) {
    next(err);
  }
});

// ============ Get group members ============
router.get('/:id/members', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const groupId = req.params.id as string;

    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: { select: { id: true, name: true, avatar: true, role: true, creditScore: true } },
      },
    });

    res.json(members);
  } catch (err) {
    next(err);
  }
});

// ============ Helper: Auto-create group for funded project ============
export async function createGroupForProject(projectId: string, projectTitle: string): Promise<string> {
  // Check if group already exists
  const existing = await prisma.groupChat.findFirst({
    where: { projectId },
  });
  if (existing) return existing.id;

  const group = await prisma.groupChat.create({
    data: {
      projectId,
      name: projectTitle,
    },
  });

  // Add issuer (project creator) as admin
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { investments: { select: { userId: true }, distinct: ['userId'] } },
  });

  if (project) {
    // Add all investors as members
    const memberData = project.investments.map(inv => ({
      groupId: group.id,
      userId: inv.userId,
      role: 'investor',
    }));

    if (memberData.length > 0) {
      for (const m of memberData) {
        try {
          await prisma.groupMember.create({ data: m });
        } catch { /* duplicate, skip */ }
      }
    }
  }

  console.log(`[Groups] Auto-created group "${projectTitle}" (${group.id}) with ${project?.investments.length || 0} investors`);
  return group.id;
}

export default router;

