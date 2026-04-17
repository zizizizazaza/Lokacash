import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');

  // Create demo user
  const user = await prisma.user.upsert({
    where: { email: 'demo@loka.finance' },
    update: {},
    create: {
      email: 'demo@loka.finance',
      name: 'Demo User',
      authProvider: 'email',
      role: 'investor',
      kycStatus: 'verified',
      creditScore: 850,
      riskAccepted: true,
      walletAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    },
  });

  console.log(`  ✅ User: ${user.email}`);

  // Dev / 内测邀请码（登录后第二步校验用）；maxUses=0 表示不限制次数（见 invitation 路由逻辑）
  await prisma.invitationCode.upsert({
    where: { code: 'LOKA88' },
    update: { isActive: true, maxUses: 0 },
    create: {
      code: 'LOKA88',
      createdById: user.id,
      maxUses: 0,
      useCount: 0,
      isActive: true,
    },
  });
  console.log('  ✅ Invitation code: LOKA88 (attach to demo user, unlimited uses)');

  // Create projects based on TrustMRR verified startups
  const projects = [
    {
      title: 'Rezi - AI Resume Builder',
      subtitle: 'AI-Powered Career Platform',
      category: 'AI',
      issuer: 'Rezi Inc.',
      faceValue: 100,
      askPrice: 96,
      apy: 15.5,
      durationDays: 180,
      creditScore: 820,
      status: 'Funded',
      targetAmount: 800000,
      raisedAmount: 780000,
      backersCount: 12,
      remainingCap: 20000,
      coverageRatio: 2.1,
      verifiedSource: 'Stripe API',
      description: 'The best AI resume builder in the world with ~1M new users annually. Rezi Enterprise supports 300+ organizations including Fortune 500 companies and universities. $271K/mo verified Stripe revenue, $290K MRR, $8.6M total revenue.',
      useOfFunds: 'AI model training, enterprise sales expansion, job seeker marketplace',
      coverImage: '/covers/rezi.png',
      issuerLogo: '/logos/rezi.png',
      endDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // funded
    },
    {
      title: 'POST BRIDGE - Social Media',
      subtitle: 'Multi-Platform Content Publishing',
      category: 'SaaS',
      issuer: 'Post Bridge Inc.',
      faceValue: 100,
      askPrice: 97,
      apy: 18.2,
      durationDays: 270,
      creditScore: 790,
      status: 'Fundraising',
      targetAmount: 500000,
      raisedAmount: 325000,
      backersCount: 8,
      remainingCap: 175000,
      coverageRatio: 1.8,
      verifiedSource: 'Stripe API',
      description: 'Post your content to multiple social media platforms at the same time, all-in-one place. $29K/mo verified Stripe revenue, 1,507 active subscriptions, growing 66% MoM. 92% profit margin. Founded in Canada, ranked #181 on TrustMRR.',
      useOfFunds: 'Platform scaling, new social network integrations, marketing',
      coverImage: '/covers/postbridge.png',
      issuerLogo: '/logos/postbridge.png',
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'PxlSafe - Video Editor Tools',
      subtitle: 'AI-Powered Plugin Suite for Creators',
      category: 'SaaS',
      issuer: 'PxlSafe Studio',
      faceValue: 100,
      askPrice: 98,
      apy: 14.8,
      durationDays: 365,
      creditScore: 750,
      status: 'Fundraising',
      targetAmount: 300000,
      raisedAmount: 48000,
      backersCount: 5,
      remainingCap: 252000,
      coverageRatio: 1.4,
      verifiedSource: 'LemonSqueezy API',
      description: 'AI-powered plugin suite for video editors. $6.3K/mo verified revenue with 90+ subscribers across MVX AI (Premiere Pro) and AutoVFX (AI VFX generator). 1,600+ customers, 34K Instagram following. 90% profit margin.',
      useOfFunds: 'New plugin development, macOS app, marketing campaigns',
      coverImage: '/covers/pxlsafe.png',
      issuerLogo: '/logos/pxlsafe.png',
      endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'Deeptrue - AI Translation',
      subtitle: 'Real-time Meeting Translation Copilot',
      category: 'SaaS',
      issuer: 'Deeptrue Corp.',
      faceValue: 100,
      askPrice: 95,
      apy: 20.5,
      durationDays: 120,
      creditScore: 710,
      status: 'Fundraising',
      targetAmount: 250000,
      raisedAmount: 95000,
      backersCount: 4,
      remainingCap: 155000,
      coverageRatio: 1.6,
      verifiedSource: 'Stripe API',
      description: 'Real-time AI translation copilot for global meetings on Zoom, Meet, Teams. $2,022 verified Stripe revenue in last 30 days. MRR $2,001. +19% MoM. 80% profit margin. 61 active subscriptions. 30+ languages. Founded 2025.',
      useOfFunds: 'AI model training, language expansion, enterprise features',
      coverImage: '/covers/deeptrue.png',
      issuerLogo: '/logos/deeptrue.png',
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'Draftly - 3D Web Builder',
      subtitle: 'No-Code 3D Website Platform',
      category: 'SaaS',
      issuer: 'Draftly Space',
      faceValue: 100,
      askPrice: 97,
      apy: 16.0,
      durationDays: 240,
      creditScore: 730,
      status: 'Fundraising',
      targetAmount: 350000,
      raisedAmount: 273000,
      backersCount: 6,
      remainingCap: 77000,
      coverageRatio: 1.5,
      verifiedSource: 'DodoPayment API',
      description: 'Build 3D websites 10× faster. No-code platform with $6.6K/mo verified revenue, 100 active subscriptions. 28K+ monthly visitors. 85% profit margin. Founded in India.',
      useOfFunds: 'Template marketplace, 3D engine optimization, team growth',
      coverImage: '/covers/draftly.png',
      issuerLogo: '/logos/draftly.png',
      endDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'Comp AI - Compliance Automation',
      subtitle: 'AI Cybersecurity Compliance Engine',
      category: 'AI',
      issuer: 'Comp AI Ltd.',
      faceValue: 100,
      askPrice: 93,
      apy: 22.0,
      durationDays: 90,
      creditScore: 680,
      status: 'Failed',
      targetAmount: 400000,
      raisedAmount: 0,
      backersCount: 0,
      remainingCap: 400000,
      coverageRatio: 0.9,
      verifiedSource: 'Stripe API',
      description: 'The fastest way to get compliant with cybersecurity frameworks like SOC 2 and ISO 27001 using AI automation. $482K revenue in last 30 days, $8.7K MRR, $2M total revenue. Failed to reach fundraising target within deadline.',
      useOfFunds: 'AI compliance engine, framework expansion, enterprise onboarding',
      coverImage: '/covers/compai.png',
      issuerLogo: '/logos/compai.png',
      endDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // expired
    },
  ];

  for (const p of projects) {
    const project = await prisma.project.create({ data: p });

    // Add monthly revenue data
    const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];
    const baseRevenue = p.targetAmount * 0.05;
    for (const month of months) {
      await prisma.monthlyRevenue.create({
        data: {
          projectId: project.id,
          month,
          amount: baseRevenue + Math.random() * baseRevenue * 0.4,
        },
      });
    }

    console.log(`  ✅ Project: ${project.title}`);
  }

  // Create treasury snapshot
  await prisma.treasurySnapshot.create({
    data: {
      tvl: 128450000,
      collateralRatio: 104.2,
      treasuryRevenue: 2450000,
      tBillsPercent: 90,
      liquidityPercent: 7,
      operationsPercent: 3,
      lastPoR: new Date(),
    },
  });
  console.log('  ✅ Treasury snapshot');

  // (Skipped mock Portfolio holdings and Transactions for demo user)
  console.log('  ✅ Transactions');

  // ============ Repayment & Issuer Seed Data ============

  // Find funded projects for repayment schedules
  const allProjects = await prisma.project.findMany();
  const reziProject = allProjects.find(p => p.title === 'Rezi - AI Resume Builder')!;
  const postBridgeProject = allProjects.find(p => p.title === 'POST BRIDGE - Social Media')!;
  const draftlyProject = allProjects.find(p => p.title === 'Draftly - 3D Web Builder')!;

  // (Skipped mock investments for demo user)

  // --- Rezi AI: 6-month schedule, 4 paid + 1 overdue + 1 upcoming ---
  const now = new Date();
  const captureSchedule = [];
  for (let i = 1; i <= 6; i++) {
    const dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() - 6 + i);
    dueDate.setDate(15);
    const principalDue = 800000 / 6;
    const interestDue = (800000 * 0.155) / 6;
    const totalDue = principalDue + interestDue;

    let status = 'upcoming';
    let paidAmount = 0;
    let paidAt: Date | null = null;

    if (i <= 4) {
      status = 'paid';
      paidAmount = totalDue;
      paidAt = new Date(dueDate);
      paidAt.setDate(paidAt.getDate() - 2);
    } else if (i === 5) {
      status = 'overdue';
    }

    captureSchedule.push({
      projectId: reziProject.id,
      periodNumber: i,
      dueDate,
      principalDue: Math.round(principalDue * 100) / 100,
      interestDue: Math.round(interestDue * 100) / 100,
      totalDue: Math.round(totalDue * 100) / 100,
      paidAmount: Math.round(paidAmount * 100) / 100,
      status,
      paidAt,
    });
  }
  await prisma.repaymentSchedule.createMany({ data: captureSchedule });
  console.log('  ✅ Repayment: Rezi AI (4 paid, 1 overdue, 1 upcoming)');

  // --- POST BRIDGE: 9-month schedule, 3 paid + 6 upcoming (on track) ---
  const pbSchedule = [];
  for (let i = 1; i <= 9; i++) {
    const dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() - 3 + i);
    dueDate.setDate(1);
    const principalDue = 500000 / 9;
    const interestDue = (500000 * 0.182) / 9;
    const totalDue = principalDue + interestDue;

    let status = 'upcoming';
    let paidAmount = 0;
    let paidAt: Date | null = null;

    if (i <= 3) {
      status = 'paid';
      paidAmount = totalDue;
      paidAt = new Date(dueDate);
      paidAt.setDate(paidAt.getDate() + 1);
    }

    pbSchedule.push({
      projectId: postBridgeProject.id,
      periodNumber: i,
      dueDate,
      principalDue: Math.round(principalDue * 100) / 100,
      interestDue: Math.round(interestDue * 100) / 100,
      totalDue: Math.round(totalDue * 100) / 100,
      paidAmount: Math.round(paidAmount * 100) / 100,
      status,
      paidAt,
    });
  }
  await prisma.repaymentSchedule.createMany({ data: pbSchedule });
  console.log('  ✅ Repayment: POST BRIDGE (3 paid, 6 upcoming)');

  // --- Draftly: 12-month schedule, 2 paid + 10 upcoming (early stage) ---
  const drSchedule = [];
  for (let i = 1; i <= 12; i++) {
    const dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() - 2 + i);
    dueDate.setDate(20);
    const principalDue = 350000 / 12;
    const interestDue = (350000 * 0.16) / 12;
    const totalDue = principalDue + interestDue;

    let status = 'upcoming';
    let paidAmount = 0;
    let paidAt: Date | null = null;

    if (i <= 2) {
      status = 'paid';
      paidAmount = totalDue;
      paidAt = new Date(dueDate);
      paidAt.setDate(paidAt.getDate() - 1);
    }

    drSchedule.push({
      projectId: draftlyProject.id,
      periodNumber: i,
      dueDate,
      principalDue: Math.round(principalDue * 100) / 100,
      interestDue: Math.round(interestDue * 100) / 100,
      totalDue: Math.round(totalDue * 100) / 100,
      paidAmount: Math.round(paidAmount * 100) / 100,
      status,
      paidAt,
    });
  }
  await prisma.repaymentSchedule.createMany({ data: drSchedule });
  console.log('  ✅ Repayment: Draftly (2 paid, 10 upcoming)');

  // Create interest payment transactions for the demo user
  const interestTxs = [];
  for (const s of [...captureSchedule, ...pbSchedule, ...drSchedule].filter(s => s.status === 'paid')) {
    interestTxs.push({
      userId: user.id,
      type: 'INTEREST',
      amount: Math.round(s.interestDue * 0.02 * 100) / 100, // user's proportional share (~2%)
      asset: 'AIUSD',
      status: 'COMPLETED',
    });
  }
  if (interestTxs.length > 0) {
    await prisma.transaction.createMany({ data: interestTxs });
  }
  console.log(`  ✅ Interest transactions (${interestTxs.length} payouts)`);

  // ============ Issuer / Enterprise Seed Data ============

  // Create an issuer user (for enterprise tab)
  const issuer = await prisma.user.upsert({
    where: { email: 'issuer@rezi.ai' },
    update: {},
    create: {
      email: 'issuer@rezi.ai',
      name: 'Rezi Inc.',
      authProvider: 'email',
      role: 'issuer',
      kycStatus: 'verified',
      creditScore: 820,
      riskAccepted: true,
    },
  });
  console.log(`  ✅ Issuer: ${issuer.email}`);

  // Enterprise verification for issuer
  const enterprise = await prisma.enterpriseVerification.create({
    data: {
      userId: issuer.id,
      companyName: 'Rezi Inc.',
      country: 'United States',
      registrationNo: 'DE-2022-AI765',
      step: 4,
      status: 'verified',
      creditAwarded: 100,
      sbtMinted: true,
    },
  });
  console.log('  ✅ Enterprise verification');

  // Applications for the issuer
  await prisma.proposedApplication.create({
    data: {
      enterpriseId: enterprise.id,
      userId: issuer.id,
      projectName: 'Rezi - AI Resume Builder',
      category: 'AI',
      monthlyRevenue: 271000,
      requestedAmount: 800000,
      proposedApy: 15.5,
      durationDays: 180,
      status: 'approved',
      description: 'AI-powered resume builder platform',
      collateralType: 'deposit',
      collateralValue: 240000,
      revenueSource: 'Stripe API',
    },
  });
  console.log('  ✅ Proposed application (Market Maker AI)');

  // Add collateral for Market Maker AI
  await prisma.collateral.createMany({
    data: [
      { projectId: reziProject.id, type: 'deposit', description: 'USDC Security Deposit', value: 150000, status: 'pledged' },
      { projectId: reziProject.id, type: 'receivable', description: 'Q2 2026 SaaS Revenue Receivable', value: 90000, status: 'pledged' },
    ],
  });
  console.log('  ✅ Collateral (Market Maker AI)');

  console.log('✅ Seed complete!');
}

seed()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
