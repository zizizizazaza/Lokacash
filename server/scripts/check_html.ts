import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const sessions = ['b9c0ad77-739f-4f5a-a9ac-f728a864990d', 'd167e0ef-47c7-4525-b139-0d9d3019315a'];
for (const sid of sessions) {
  console.log(`\n--- Session: ${sid} ---`);
  const msgs = await p.chatMessage.findMany({ where: { sessionId: sid }, orderBy: { createdAt: 'asc' } });
  for (const [i, m] of msgs.entries()) {
    const meta = m.metadata ? JSON.parse(m.metadata as string) : {};
    const keys = Object.keys(meta);
    console.log(`  msg ${i}: role=${m.role}, metaKeys=[${keys.join(',')}], hasHtmlReport=${!!meta.htmlReport}, htmlLen=${meta.htmlReport?.length || 0}`);
  }
}
await p.$disconnect();
