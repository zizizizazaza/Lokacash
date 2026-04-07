import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authRequired, type AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET current verification status
router.get('/verify-status', authRequired, async (req: AuthRequest, res, next) => {
  try {
    let verification = await prisma.enterpriseVerification.findFirst({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' }
    });

    if (!verification) {
      return res.json({ status: 'none', step: 0 });
    }

    res.json(verification);
  } catch (err) {
    next(err);
  }
});

// POST to update verification step
const verifyStepSchema = z.object({
  step: z.number().int().min(1).max(5),
  companyName: z.string().optional(),
  country: z.string().optional(),
  registrationNo: z.string().optional(),
  description: z.string().optional(),
  website: z.string().optional(),
  foundedYear: z.number().int().optional(),
  categories: z.string().optional(),
  companyLogo: z.string().optional(),
  licenseDoc: z.string().optional(),
  uboName: z.string().optional(),
  uboIdDoc: z.string().optional(),
});

router.post('/verify-step', authRequired, async (req: AuthRequest, res, next) => {
  try {
    const data = verifyStepSchema.parse(req.body);
    
    // Build update payload from all optional fields
    const updateFields: Record<string, any> = { step: data.step };
    const optionalKeys = [
      'companyName', 'country', 'registrationNo', 'description',
      'website', 'foundedYear', 'categories', 'companyLogo',
      'licenseDoc', 'uboName', 'uboIdDoc'
    ] as const;
    for (const key of optionalKeys) {
      if (data[key] !== undefined) updateFields[key] = data[key];
    }
    // Auto-verify at step 2 (MVP: 2-step wizard — Company Info + Stripe)
    if (data.step >= 2) updateFields.status = 'verified';

    // Find existing or create
    let verification = await prisma.enterpriseVerification.findFirst({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' }
    });

    if (!verification) {
      if (!data.companyName || !data.country) {
         return res.status(400).json({ error: 'Company Name and Country are required for first step' });
      }
      verification = await prisma.enterpriseVerification.create({
        data: {
          userId: req.userId as string,
          companyName: data.companyName,
          country: data.country,
          step: data.step,
          status: 'pending',
          ...(data.registrationNo ? { registrationNo: data.registrationNo } : {}),
          ...(data.description ? { description: data.description } : {}),
          ...(data.website ? { website: data.website } : {}),
          ...(data.foundedYear ? { foundedYear: data.foundedYear } : {}),
          ...(data.categories ? { categories: data.categories } : {}),
          ...(data.companyLogo ? { companyLogo: data.companyLogo } : {}),
          ...(data.licenseDoc ? { licenseDoc: data.licenseDoc } : {}),
        }
      });
    } else {
      verification = await prisma.enterpriseVerification.update({
        where: { id: verification.id },
        data: updateFields
      });
    }

    res.json(verification);
  } catch (err) {
    next(err);
  }
});

export default router;
