import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { config } from '../config.js';
import { authRequired, authOptional, type AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

function normalizeInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '').trim();
}

// ---- Helper: generate a human-readable code ----
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0,O,1,I to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ========== PUBLIC: Validate an invitation code ==========
const validateSchema = z.object({
  code: z.string().min(1).max(20),
});

router.post('/validate', async (req, res, next) => {
  try {
    const { code } = validateSchema.parse(req.body);
    const normalized = normalizeInviteCode(code);

    if (config.invitationGateDisabled && normalized.length > 0) {
      return res.json({ valid: true, code: normalized });
    }

    const invitation = await prisma.invitationCode.findUnique({
      where: { code: normalized },
    });

    if (!invitation) {
      return res.json({ valid: false, reason: 'Code not found' });
    }
    if (!invitation.isActive) {
      return res.json({ valid: false, reason: 'Code has been disabled' });
    }
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      return res.json({ valid: false, reason: 'Code has expired' });
    }
    if (invitation.maxUses > 0 && invitation.useCount >= invitation.maxUses) {
      return res.json({ valid: false, reason: 'Code has reached maximum uses' });
    }

    res.json({ valid: true, code: invitation.code });
  } catch (err) {
    next(err);
  }
});

// ========== PUBLIC: Use / redeem an invitation code (called during login) ==========
const useSchema = z.object({
  code: z.string().min(1).max(20),
});

router.post('/use', authOptional, async (req: AuthRequest, res, next) => {
  try {
    const { code } = useSchema.parse(req.body);
    const upperCode = normalizeInviteCode(code);

    if (config.invitationGateDisabled && upperCode.length > 0) {
      return res.json({ ok: true, code: upperCode });
    }

    const invitation = await prisma.invitationCode.findUnique({
      where: { code: upperCode },
    });

    if (!invitation || !invitation.isActive) {
      throw new AppError('Invalid invitation code', 400);
    }
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      throw new AppError('Invitation code has expired', 400);
    }
    if (invitation.maxUses > 0 && invitation.useCount >= invitation.maxUses) {
      throw new AppError('Invitation code has reached maximum uses', 400);
    }

    // Increment use count
    await prisma.invitationCode.update({
      where: { code: upperCode },
      data: {
        useCount: { increment: 1 },
        usedById: req.userId || null,
        usedAt: new Date(),
      },
    });

    // If user is logged in, mark their profile
    if (req.userId) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { invitedByCode: upperCode },
      });
    }

    res.json({ ok: true, code: upperCode });
  } catch (err) {
    next(err);
  }
});

// ========== AUTHED: Generate a new invitation code ==========
router.post('/generate', authRequired, async (req: AuthRequest, res, next) => {
  try {
    // Rate limit: max 5 codes per user
    const existingCount = await prisma.invitationCode.count({
      where: { createdById: req.userId },
    });
    if (existingCount >= 5) {
      throw new AppError('Maximum 5 invitation codes per user', 400);
    }

    // Generate unique code
    let code: string;
    let attempts = 0;
    do {
      code = generateCode();
      const existing = await prisma.invitationCode.findUnique({ where: { code } });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    const invitation = await prisma.invitationCode.create({
      data: {
        code,
        createdById: req.userId!,
        maxUses: 5, // each code can be used 5 times
      },
    });

    res.json({
      code: invitation.code,
      maxUses: invitation.maxUses,
      useCount: invitation.useCount,
      createdAt: invitation.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

// ========== AUTHED: List my invitation codes ==========
router.get('/my-codes', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const codes = await prisma.invitationCode.findMany({
      where: { createdById: req.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        code: true,
        maxUses: true,
        useCount: true,
        isActive: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    res.json(codes);
  } catch (err) {
    next(err);
  }
});

export default router;
