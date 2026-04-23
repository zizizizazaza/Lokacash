/**
 * sync-personas.ts — Export the Node ANALYST_CATALOG to the aegean
 * personas.json that main.py reads at startup.
 *
 * Run this whenever server/src/catalogs/analysts.ts changes:
 *   pnpm exec tsx server/scripts/sync-personas.ts
 * (or via npm script: `npm run sync:personas` if wired into package.json)
 *
 * The purpose is to keep the frontend display catalog (TS) and the aegean
 * runtime persona definitions (JSON) in lock-step without human copy-paste.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANALYST_CATALOG, SYSTEM_ANALYST_IDS } from '../src/catalogs/analysts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outPath = path.join(
  __dirname,
  '..',
  'tools',
  'aegean-consensus',
  'personas.json',
);

const payload = {
  version: 1,
  generated_at: new Date().toISOString(),
  source: 'server/src/catalogs/analysts.ts',
  system_analyst_ids: SYSTEM_ANALYST_IDS,
  personas: ANALYST_CATALOG.map((p) => ({
    id: p.id,
    display_name_zh: p.displayName.zh,
    display_name_en: p.displayName.en,
    category: p.category,
    system_prompt: p.systemPrompt,
    specialization: p.specialization,
  })),
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

console.log(
  `[sync-personas] ✓ wrote ${payload.personas.length} personas → ${outPath}`,
);
console.log(
  `[sync-personas]   system=${payload.personas.filter((p) => p.category === 'system').length} ` +
    `enhanced=${payload.personas.filter((p) => p.category === 'enhanced').length} ` +
    `master=${payload.personas.filter((p) => p.category === 'master').length}`,
);
