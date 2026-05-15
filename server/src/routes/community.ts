import { Router } from 'express';
import prisma from '../db.js';
import { authRequired, type AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { emitToUser } from '../socket/index.js';

const router = Router();

// ════════════════════════════════════════════════
//  FRIENDS
// ════════════════════════════════════════════════

// ── Send friend request ──
router.post('/friends/request', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const { userId: targetId } = z.object({ userId: z.string() }).parse(req.body);
    const me = req.userId!;
    if (targetId === me) throw new AppError('Cannot friend yourself', 400);

    // Check if friendship already exists in either direction
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: me, addresseeId: targetId },
          { requesterId: targetId, addresseeId: me },
        ],
      },
    });
    if (existing) {
      if (existing.status === 'accepted') throw new AppError('Already friends', 400);
      if (existing.status === 'pending') throw new AppError('Friend request already pending', 400);
      throw new AppError('Cannot send request', 400);
    }

    const friendship = await prisma.friendship.create({
      data: { requesterId: me, addresseeId: targetId },
      include: { requester: { select: { id: true, name: true, avatar: true } } },
    });

    // Notify the target user via WebSocket
    emitToUser(targetId, 'friend:request', friendship);

    res.status(201).json(friendship);
  } catch (err) { next(err); }
});

// ── Accept friend request ──
router.post('/friends/accept', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const { friendshipId } = z.object({ friendshipId: z.string() }).parse(req.body);
    const me = req.userId!;

    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new AppError('Request not found', 404);
    if (friendship.addresseeId !== me) throw new AppError('Not your request to accept', 403);
    if (friendship.status !== 'pending') throw new AppError('Request already handled', 400);

    const updated = await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'accepted' },
      include: {
        requester: { select: { id: true, name: true, avatar: true } },
        addressee: { select: { id: true, name: true, avatar: true } },
      },
    });

    // Notify requester
    emitToUser(friendship.requesterId, 'friend:accepted', updated);

    res.json(updated);
  } catch (err) { next(err); }
});

// ── Reject friend request ──
router.post('/friends/reject', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const { friendshipId } = z.object({ friendshipId: z.string() }).parse(req.body);
    const me = req.userId!;

    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new AppError('Request not found', 404);
    if (friendship.addresseeId !== me) throw new AppError('Not your request to reject', 403);

    await prisma.friendship.delete({ where: { id: friendshipId } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Remove friend ──
router.delete('/friends/:userId', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const me = req.userId!;
    const targetId = req.params.userId as string;

    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: me, addresseeId: targetId },
          { requesterId: targetId, addresseeId: me },
        ],
      },
    });
    if (!friendship) throw new AppError('Not friends', 404);

    await prisma.friendship.delete({ where: { id: friendship.id } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── List accepted friends ──
router.get('/friends', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const me = req.userId!;
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ requesterId: me }, { addresseeId: me }],
      },
      include: {
        requester: { select: { id: true, name: true, avatar: true, email: true } },
        addressee: { select: { id: true, name: true, avatar: true, email: true } },
      },
    });

    // Normalize: always return "the other person"
    const friends = friendships.map(f => ({
      friendshipId: f.id,
      user: f.requesterId === me ? f.addressee : f.requester,
      since: f.updatedAt,
    }));

    res.json(friends);
  } catch (err) { next(err); }
});

// ── Pending friend requests (received) ──
router.get('/friends/requests', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const me = req.userId!;
    const requests = await prisma.friendship.findMany({
      where: { addresseeId: me, status: 'pending' },
      include: {
        requester: { select: { id: true, name: true, avatar: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════════
//  CONVERSATIONS (DM + Groups unified list)
// ════════════════════════════════════════════════

// ── List all conversations ──
router.get('/conversations', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const me = req.userId!;

    // 1. DM conversations
    const dmConversations = await prisma.conversation.findMany({
      where: { participants: { some: { userId: me } } },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, createdAt: true, attachmentType: true, sender: { select: { id: true, name: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const dmList = dmConversations.map(c => {
      const other = c.participants.find(p => p.userId !== me);
      const lastMsg = c.messages[0] || null;
      const myParticipant = c.participants.find(p => p.userId === me);
      // Count unread: messages after my lastReadAt
      return {
        id: c.id,
        type: 'dm' as const,
        name: other?.user?.name || 'Unknown',
        avatar: other?.user?.avatar || (other?.user?.name?.charAt(0) || 'U'),
        lastMsg: lastMsg ? `${lastMsg.sender.name}: ${lastMsg.content || (lastMsg.attachmentType === 'image' ? '📷 Photo' : lastMsg.attachmentType === 'video' ? '🎬 Video' : lastMsg.attachmentType === 'file' ? '📎 File' : '')}` : '',
        lastMsgAt: lastMsg?.createdAt || c.createdAt,
        isGroup: false,
        otherUserId: other?.userId || null,
      };
    });

    // 2. Group conversations (from existing GroupChat)
    const groups = await prisma.groupChat.findMany({
      where: { members: { some: { userId: me } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, createdAt: true, attachmentType: true, user: { select: { name: true } } },
        },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const groupList = groups.map(g => {
      const lastMsg = g.messages[0] || null;
      return {
        id: g.id,
        type: 'group' as const,
        name: g.name,
        avatar: g.avatar || g.name.charAt(0),
        lastMsg: lastMsg ? `${lastMsg.user.name}: ${lastMsg.content || (lastMsg.attachmentType === 'image' ? '📷 Photo' : lastMsg.attachmentType === 'video' ? '🎬 Video' : lastMsg.attachmentType === 'file' ? '📎 File' : '')}` : '',
        lastMsgAt: lastMsg?.createdAt || g.createdAt,
        isGroup: true,
        memberCount: g._count.members,
        groupMembers: g.members.map(m => ({
          id: m.userId,
          name: m.user.name,
          avatar: m.user.avatar,
          role: m.role,
        })),
      };
    });

    // 3. Merge & sort by last activity
    const all = [...dmList, ...groupList].sort(
      (a, b) => new Date(b.lastMsgAt).getTime() - new Date(a.lastMsgAt).getTime()
    );

    res.json(all);
  } catch (err) { next(err); }
});

// ── Create DM conversation (or return existing) ──
router.post('/conversations', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const { userId: targetId } = z.object({ userId: z.string() }).parse(req.body);
    const me = req.userId!;
    if (targetId === me) throw new AppError('Cannot message yourself', 400);

    // Check if DM conversation already exists between these two users
    const existing = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: me } } },
          { participants: { some: { userId: targetId } } },
        ],
      },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
      },
    });

    if (existing) {
      res.json(existing);
      return;
    }

    // Create new
    const conversation = await prisma.conversation.create({
      data: {
        participants: {
          create: [{ userId: me }, { userId: targetId }],
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
      },
    });

    res.status(201).json(conversation);
  } catch (err) { next(err); }
});

// ── Create Community Group conversation ──
router.post('/groups', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const { name, bio, avatar, memberIds = [] } = z.object({
      name: z.string().min(1),
      bio: z.string().optional(),
      avatar: z.string().optional(),
      memberIds: z.array(z.string().or(z.number())).optional(),
    }).parse(req.body);

    const me = req.userId!;
    
    // Ensure the creator is essentially in the list
    const allMemberIds = Array.from(new Set([me, ...memberIds.map(String)]));
    
    const group = await prisma.groupChat.create({
      data: {
        name,
        bio,
        avatar,
        members: {
          create: allMemberIds.map(id => ({ userId: id, role: id === me ? 'creator' : 'member' }))
        }
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, avatar: true } } }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, createdAt: true }
        }
      }
    });

    // Notify added members
    allMemberIds.forEach(id => {
      if (id !== me) emitToUser(String(id), 'group:joined', { groupId: group.id });
    });

    res.status(201).json(group);
  } catch (err) { next(err); }
});

// ── Add members to an existing group ──
router.post('/groups/:groupId/members', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const groupId = req.params.groupId as string;
    const { userIds } = z.object({ userIds: z.array(z.string()).min(1) }).parse(req.body);
    const me = req.userId!;

    // Verify the caller is a member of this group
    const myMembership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: me } },
    });
    if (!myMembership) throw new AppError('You are not a member of this group', 403);

    // Find which users are already members
    const existing = await prisma.groupMember.findMany({
      where: { groupId, userId: { in: userIds } },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((e: { userId: string }) => e.userId));
    const newIds = userIds.filter(id => !existingIds.has(id));

    if (newIds.length > 0) {
      await prisma.groupMember.createMany({
        data: newIds.map(userId => ({ groupId, userId, role: 'member' })),
      });

      // Notify the newly added members to refresh their UI
      newIds.forEach(id => {
        emitToUser(id, 'group:joined', { groupId });
      });
    }

    // Return updated member list
    const updatedMembers = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });

    res.json({
      added: newIds.length,
      members: updatedMembers.map((m: any) => ({
        id: m.userId,
        name: m.user.name,
        avatar: m.user.avatar,
        role: m.role,
      })),
    });
  } catch (err) { next(err); }
});

// ── Remove a member from a group (Kick / Leave) ──
router.delete('/groups/:groupId/members/:memberId', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const groupId = req.params.groupId as string;
    const memberId = req.params.memberId as string;
    const me = req.userId!;

    // Verify caller is member
    const myMembership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: me } },
    });
    if (!myMembership) throw new AppError('You are not a member', 403);

    // If kicking someone else, verify caller is creator or admin
    if (me !== memberId) {
      if (myMembership.role !== 'creator' && myMembership.role !== 'admin') {
        throw new AppError('Permission denied', 403);
      }
    }

    // Execute removal
    await prisma.groupMember.deleteMany({
      where: { groupId, userId: memberId },
    });

    // Notify the removed member so they drop the group
    emitToUser(memberId, 'group:removed', { groupId });

    // Notify remaining members so UI updates
    const updatedMembers = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
    
    // Convert to response format
    const formatted = updatedMembers.map((m: any) => ({
        id: m.userId,
        name: m.user.name,
        avatar: m.user.avatar,
        role: m.role,
    }));
    
    // Pinging remaining members using group:joined triggers `loadConvs` and silently refreshes their member list
    formatted.forEach((m: any) => emitToUser(m.id, 'group:joined', { groupId }));

    res.json({ members: formatted });
  } catch(err) { next(err); }
});

// ── Dissolve (delete) a group entirely ──
router.delete('/groups/:groupId', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const groupId = req.params.groupId as string;
    const me = req.userId!;

    // Only the creator can dissolve a group
    const myMembership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: me } },
    });
    if (!myMembership || myMembership.role !== 'creator') {
      throw new AppError('Only the group creator can dissolve this group', 403);
    }

    // Collect all member IDs before deletion (for WebSocket notification)
    const allMembers = await prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true },
    });
    const memberIds = allMembers.map((m: { userId: string }) => m.userId);

    // Cascade delete: messages → members → group
    await prisma.groupMessage.deleteMany({ where: { groupId } });
    await prisma.groupMember.deleteMany({ where: { groupId } });
    await prisma.groupChat.delete({ where: { id: groupId } });

    // Notify all former members via WebSocket
    memberIds.forEach(id => {
      emitToUser(id, 'group:dissolved', { groupId });
    });

    res.json({ deleted: true, groupId });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════════
//  MESSAGES
// ════════════════════════════════════════════════

// ── Get messages for a conversation (DM or Group) ──
router.get('/conversations/:id/messages', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const convId = req.params.id as string;
    const me = req.userId!;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    // Check if this is a DM conversation
    const dmConv = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: convId, userId: me } },
    });

    if (dmConv) {
      // DM messages
      const messages = await prisma.directMessage.findMany({
        where: { conversationId: convId },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { sender: { select: { id: true, name: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      // Update lastReadAt
      await prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId: convId, userId: me } },
        data: { lastReadAt: new Date() },
      });

      res.json({
        messages: messages.reverse(),
        nextCursor: messages.length === limit ? messages[messages.length - 1].id : null,
        hasMore: messages.length === limit,
      });
      return;
    }

    // Check if this is a Group conversation
    const groupMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: convId, userId: me } },
    });

    if (groupMember) {
      const messages = await prisma.groupMessage.findMany({
        where: { groupId: convId },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { user: { select: { id: true, name: true, avatar: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      // Update lastReadAt for group
      await prisma.groupMember.update({
        where: { groupId_userId: { groupId: convId, userId: me } },
        data: { lastReadAt: new Date() },
      });

      res.json({
        messages: messages.reverse().map((m: any) => ({
          id: m.id,
          conversationId: convId,
          senderId: m.userId,
          content: m.content,
          attachmentUrl: m.attachmentUrl,
          attachmentType: m.attachmentType,
          createdAt: m.createdAt,
          sender: m.user,
        })),
        nextCursor: messages.length === limit ? messages[messages.length - 1].id : null,
        hasMore: messages.length === limit,
      });
      return;
    }

    throw new AppError('Not a member of this conversation', 403);
  } catch (err) { next(err); }
});

// ── Mark conversation as read (DM or Group) ──
router.post('/conversations/:id/read', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const convId = req.params.id as string;
    const me = req.userId!;

    // DM
    const dm = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: convId, userId: me } },
    });
    if (dm) {
      await prisma.conversationParticipant.update({
        where: { id: dm.id },
        data: { lastReadAt: new Date() }
      });
      return res.json({ success: true });
    }

    // Group
    const groupMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: convId, userId: me } },
    });
    if (groupMember) {
      await prisma.groupMember.update({
        where: { groupId_userId: { groupId: convId, userId: me } },
        data: { lastReadAt: new Date() }
      });
      return res.json({ success: true });
    }

    throw new AppError('Conversation not found', 404);
  } catch (err) { next(err); }
});

// ── Send a message (DM or Group) ──
router.post('/conversations/:id/messages', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const convId = req.params.id as string;
    const me = req.userId!;
    const { content, attachmentUrl, attachmentType } = z.object({ 
      content: z.string().max(5000),
      attachmentUrl: z.string().optional(),
      attachmentType: z.string().optional(),
    }).refine(data => data.content.trim() !== '' || !!data.attachmentUrl, {
      message: 'Message must contain either text or an attachment'
    }).parse(req.body);

    // Try DM first
    const dmParticipant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: convId, userId: me } },
    });

    if (dmParticipant) {
      const message = await prisma.directMessage.create({
        data: { conversationId: convId, senderId: me, content, attachmentUrl, attachmentType },
        include: { sender: { select: { id: true, name: true, avatar: true } } },
      });

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: convId },
        data: { updatedAt: new Date() },
      });

      // Notify other participants via WebSocket
      const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId: convId, userId: { not: me } },
      });
      for (const p of participants) {
        emitToUser(p.userId, 'dm:message', { conversationId: convId, message });
      }

      res.status(201).json(message);
      return;
    }

    // Try Group
    const groupMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: convId, userId: me } },
    });

    if (groupMember) {
      const message = await prisma.groupMessage.create({
        data: { groupId: convId, userId: me, content, attachmentUrl, attachmentType, role: groupMember.role },
        include: { user: { select: { id: true, name: true, avatar: true, role: true } } },
      });

      // Broadcast to group via WebSocket (reuse existing infrastructure)
      const { emitToGroup } = await import('../socket/index.js');
      emitToGroup(convId, 'group:message', message);

      res.status(201).json({
        id: message.id,
        conversationId: convId,
        senderId: me,
        content: message.content,
        attachmentUrl: message.attachmentUrl,
        attachmentType: message.attachmentType,
        createdAt: message.createdAt,
        sender: message.user,
      });
      return;
    }

    throw new AppError('Not a member of this conversation', 403);
  } catch (err) { next(err); }
});

// ── Search users (for Add Friend & Group Creation) ──
router.get('/users/search', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const q = (req.query.q as string || '').trim();

    const users = await prisma.user.findMany({
      where: {
        id: { not: req.userId! },
        ...(q ? {
          OR: [
            { name: { contains: q } },
            { email: { contains: q } },
          ],
        } : {})
      },
      select: { id: true, name: true, avatar: true, email: true },
      take: 20,
    });
    res.json(users);
  } catch (err) { next(err); }
});
// ── Unread count (for badge) ──
router.get('/unread-count', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const me = req.userId!;

    // Count unread DM messages: messages created after lastReadAt for my conversations
    const myParticipations = await prisma.conversationParticipant.findMany({
      where: { userId: me },
      select: { conversationId: true, lastReadAt: true },
    });

    let dmUnread = 0;
    for (const p of myParticipations) {
      const count = await prisma.directMessage.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: me },
          createdAt: { gt: p.lastReadAt },
        },
      });
      dmUnread += count;
    }

    // Count pending friend requests
    const friendReqs = await prisma.friendship.count({
      where: { addresseeId: me, status: 'pending' },
    });

    res.json({ unread: dmUnread + friendReqs, dmUnread, friendRequests: friendReqs });
  } catch (err) { next(err); }
});

// ── Create Poll (group only) ──
router.post('/groups/:groupId/polls', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const groupId = req.params.groupId as string;
    const me = req.userId!;

    // Verify membership
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: me } },
    });
    if (!member) throw new AppError('Not a member of this group', 403);

    const { question, options, duration } = z.object({
      question: z.string().min(1),
      options: z.array(z.string().min(1)).min(2),
      duration: z.string().default('1 day'),
    }).parse(req.body);

    // Calculate expiry
    const durationMs: Record<string, number> = {
      '1h': 3600000, '12h': 43200000, '1 day': 86400000, '3 days': 259200000
    };
    const expiresAt = new Date(Date.now() + (durationMs[duration] || 86400000));

    const poll = await prisma.poll.create({
      data: {
        groupId,
        userId: me,
        question,
        duration,
        expiresAt,
        options: {
          create: options.map((text, i) => ({ text, order: i })),
        },
      },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        options: { orderBy: { order: 'asc' } },
        votes: true,
      },
    });

    const payload = {
      id: poll.id,
      groupId: poll.groupId,
      question: poll.question,
      duration: poll.duration,
      expiresAt: poll.expiresAt,
      createdAt: poll.createdAt,
      creator: poll.creator,
      options: poll.options.map(o => ({ id: o.id, text: o.text, votes: 0 })),
      total: 0,
    };

    // Also create a GroupMessage so the poll appears in conversation history & sidebar preview
    const message = await prisma.groupMessage.create({
      data: {
        groupId,
        userId: me,
        content: `📊 Poll: ${question}`,
        attachmentType: 'poll',
        role: member.role,
      },
      include: { user: { select: { id: true, name: true, avatar: true, role: true } } },
    });

    // Broadcast both the message (for sidebar/history) and the poll (for poll UI)
    const { emitToGroup } = await import('../socket/index.js');
    emitToGroup(groupId, 'group:message', message);
    emitToGroup(groupId, 'group:poll', payload);

    res.status(201).json(payload);
  } catch (err) { next(err); }
});

// ── Vote on a Poll ──
router.post('/polls/:pollId/vote', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const pollId = req.params.pollId as string;
    const me = req.userId!;
    const { optionId } = z.object({ optionId: z.string() }).parse(req.body);

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true },
    });
    if (!poll) throw new AppError('Poll not found', 404);

    // Verify membership
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: poll.groupId, userId: me } },
    });
    if (!member) throw new AppError('Not a member of this group', 403);

    // Check expiry
    if (new Date() > poll.expiresAt) throw new AppError('Poll has expired', 400);

    // Check if option belongs to this poll
    if (!poll.options.some(o => o.id === optionId)) throw new AppError('Invalid option', 400);

    // Upsert vote (ensures one vote per user)
    await prisma.pollVote.upsert({
      where: { pollId_userId: { pollId, userId: me } },
      create: { pollId, optionId, userId: me },
      update: { optionId },
    });

    // Fetch updated vote counts
    const updatedOptions = await prisma.pollOption.findMany({
      where: { pollId },
      orderBy: { order: 'asc' },
      include: { votes: true },
    });
    const totalVotes = await prisma.pollVote.count({ where: { pollId } });

    const payload = {
      pollId,
      groupId: poll.groupId,
      options: updatedOptions.map(o => ({ id: o.id, text: o.text, votes: o.votes.length })),
      total: totalVotes,
      voterId: me,
      votedOptionId: optionId,
    };

    // Broadcast updated results to group
    const { emitToGroup } = await import('../socket/index.js');
    emitToGroup(poll.groupId, 'group:poll-vote', payload);

    res.json(payload);
  } catch (err) { next(err); }
});

// ── Get Polls for a group ──
router.get('/groups/:groupId/polls', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const groupId = req.params.groupId as string;
    const me = req.userId!;

    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: me } },
    });
    if (!member) throw new AppError('Not a member of this group', 403);

    const polls = await prisma.poll.findMany({
      where: { groupId },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        options: {
          orderBy: { order: 'asc' },
          include: { votes: true },
        },
        votes: { where: { userId: me } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(polls.map(p => ({
      id: p.id,
      groupId: p.groupId,
      question: p.question,
      duration: p.duration,
      expiresAt: p.expiresAt,
      createdAt: p.createdAt,
      creator: p.creator,
      options: p.options.map(o => ({ id: o.id, text: o.text, votes: o.votes.length })),
      total: p.options.reduce((sum, o) => sum + o.votes.length, 0),
      voted: p.votes[0]?.optionId || null,
    })));
  } catch (err) { next(err); }
});

export default router;
