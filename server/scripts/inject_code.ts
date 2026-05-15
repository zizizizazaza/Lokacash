import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  let existing = await prisma.invitationCode.findFirst({ where: { isActive: true } });
  if (!existing) {
    const admin = await prisma.user.findFirst();
    if (!admin) throw new Error("No users found in database to attach the code to.");
    existing = await prisma.invitationCode.create({
      data: {
        code: 'LOKA2026',
        createdById: admin.id,
        maxUses: 9999
      }
    });
    console.log('Created new developer bypass code attached to:', admin.email);
  } else {
    await prisma.invitationCode.update({ where: { code: existing.code }, data: { maxUses: 9999 } });
  }
  console.log('====================================');
  console.log('YOUR INVITATION CODE IS: ' + existing.code);
  console.log('====================================');
}
main().catch(console.error).finally(() => prisma.$disconnect());
