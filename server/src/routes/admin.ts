import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authRequired, type AuthRequest } from '../middleware/auth.js';
import { adminRequired } from '../middleware/adminGuard.js';
import { notify } from '../services/notification.service.js';
import { applyPlan, type PlanTier } from '../services/subscription.service.js';

const router = Router();

// All admin routes require auth + admin role
router.use(authRequired, adminRequired);

// ---- Users ----

// List users (paginated)
router.get('/users', async (req: AuthRequest, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = req.query.search as string | undefined;

    const where = search
      ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, name: true, avatar: true, role: true,
          kycStatus: true, creditScore: true, riskAccepted: true, createdAt: true,
          _count: { select: { investments: true, transactions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

// Update user role
const roleSchema = z.object({ role: z.enum(['user', 'investor', 'issuer', 'admin']) });
router.patch('/users/:id/role', async (req: AuthRequest, res, next) => {
  try {
    const { role } = roleSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// Set subscription plan for any user (admin only — no payment required)
const planSchema = z.object({ plan: z.enum(['free', 'pro', 'max']) });
router.patch('/users/:id/plan', async (req: AuthRequest, res, next) => {
  try {
    const { plan } = planSchema.parse(req.body);
    const updated = await applyPlan(req.params.id as string, plan as PlanTier, {
      billingCycle: plan === 'free' ? null : 'monthly',
    });
    res.json({ ok: true, userId: req.params.id, plan: updated.plan, resetAt: updated.resetAt });
  } catch (err) {
    next(err);
  }
});

// Ban / disable user (set role to 'banned')
router.post('/users/:id/ban', async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { role: 'banned' },
      select: { id: true, email: true, role: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ---- Project Applications ----

// List all pending applications
router.get('/applications', async (_req: AuthRequest, res, next) => {
  try {
    const apps = await prisma.proposedApplication.findMany({
      where: { status: { in: ['submitted', 'in_review'] } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        enterprise: { select: { companyName: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(apps);
  } catch (err) {
    next(err);
  }
});

// Approve application → create real Project
const reviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().max(1000).optional(),
});

router.post('/applications/:id/review', async (req: AuthRequest, res, next) => {
  try {
    const { action, notes } = reviewSchema.parse(req.body);
    const app = await prisma.proposedApplication.findUnique({ where: { id: req.params.id as string } });
    if (!app) { res.status(404).json({ error: 'Application not found' }); return; }
    if (!['submitted', 'in_review'].includes(app.status)) {
      res.status(400).json({ error: 'Application already reviewed' }); return;
    }

    if (action === 'reject') {
      await prisma.proposedApplication.update({
        where: { id: app.id },
        data: { status: 'rejected', reviewNotes: notes || 'Rejected by admin' },
      });
      await notify({
        userId: app.userId,
        type: 'system',
        title: 'Application Rejected',
        body: `Your project "${app.projectName}" was not approved.${notes ? ' Reason: ' + notes : ''}`,
        refType: 'application',
        refId: app.id,
      });
      res.json({ status: 'rejected' });
      return;
    }

    // Approve → create project
    const project = await prisma.$transaction(async (tx: any) => {
      await tx.proposedApplication.update({
        where: { id: app.id },
        data: { status: 'approved', reviewNotes: notes || 'Approved by admin' },
      });

      return tx.project.create({
        data: {
          title: app.projectName,
          subtitle: app.description || '',
          category: app.category || 'SaaS',
          issuer: app.projectName,
          faceValue: 100,
          askPrice: 100 - (app.proposedApy || 15) * ((app.durationDays || 90) / 365),
          apy: app.proposedApy || 15,
          durationDays: app.durationDays || 90,
          creditScore: 700,
          status: 'Fundraising',
          targetAmount: app.requestedAmount || 100000,
          raisedAmount: 0,
          backersCount: 0,
          remainingCap: app.requestedAmount || 100000,
          coverageRatio: 1.0,
          verifiedSource: app.revenueSource || '',
          description: app.description || '',
          useOfFunds: '',
          coverImage: '',
          issuerLogo: '',
        },
      });
    });

    await notify({
      userId: app.userId,
      type: 'system',
      title: 'Application Approved!',
      body: `Your project "${app.projectName}" is now live for fundraising.`,
      refType: 'project',
      refId: project.id,
    });

    res.json({ status: 'approved', projectId: project.id });
  } catch (err) {
    next(err);
  }
});

// ---- Enterprise Verification ----

// List pending enterprise verifications
router.get('/enterprises', async (_req: AuthRequest, res, next) => {
  try {
    const enterprises = await prisma.enterpriseVerification.findMany({
      where: { status: { in: ['pending', 'in_review'] } },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(enterprises);
  } catch (err) {
    next(err);
  }
});

// ---- Platform Stats ----

router.get('/stats', async (_req: AuthRequest, res, next) => {
  try {
    const [users, projects, investments, totalInvested] = await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.investment.count(),
      prisma.investment.aggregate({ _sum: { amount: true } }),
    ]);

    res.json({
      users,
      projects,
      investments,
      totalInvested: totalInvested._sum.amount || 0,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
