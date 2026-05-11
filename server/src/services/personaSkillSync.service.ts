/**
 * Phase 3.1 Level 1 — Persona → Skill auto-sync.
 *
 * Single source of truth is still `catalogs/analysts.ts` (Roundtable +
 * Aegean both depend on it). At server boot we mirror each persona out to
 * `server/skills/persona/<id>/SKILL.md` so the v2 SkillsLoader can serve
 * the full prompt body to the LLM on demand via `load_skill("persona-<id>")`.
 *
 * Benefits:
 *   - One catalog, two consumers (Aegean reads TS object, v2 reads markdown).
 *   - The system prompt only carries one-line persona descriptions instead
 *     of 18 × ~2KB system prompts (~800 tokens saved on every turn).
 *   - Editing a persona in analysts.ts updates the skill on next reboot.
 *   - The LLM can naturally load Buffett's framework for a Buffett-style
 *     analysis without invoking the full Roundtable orchestration.
 *
 * The function is idempotent: if the generated content matches what's
 * already on disk it skips the write. Files for personas that no longer
 * exist in the catalog are NOT deleted automatically — manual cleanup
 * keeps surprise removals safer.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ANALYST_CATALOG, type AnalystPersona } from '../catalogs/analysts.js';

const SKILLS_ROOT = process.env.SKILLS_ROOT?.trim() || path.join(process.cwd(), 'skills');
const PERSONA_DIR = path.join(SKILLS_ROOT, 'persona');

function escapeFrontmatter(s: string): string {
  // Quote string if it contains characters that confuse the minimal YAML
  // parser in SkillsLoader (newlines, colons, leading/trailing space, hash).
  if (/^[\s#]|[\n:]|[\s#]$/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

function renderSkillMarkdown(p: AnalystPersona): string {
  // Description = short role tagline. Used as the one-line entry in the
  // ## Skills section of the system prompt. Keep under ~80 chars to fit
  // alongside the other 48 skill names compactly.
  const description =
    `${p.role.en} (${p.displayName.en}) — Roundtable persona, ${p.category} tier.`.slice(0, 200);

  // Tags help future smart-routing (e.g. "find a value persona" → look at
  // tags). Stay alphanumeric + dash to keep parser-friendly.
  const tags = [p.category, p.id.replace(/_/g, '-')].join(',');

  const lines: string[] = [
    '---',
    `name: persona-${p.id}`,
    `description: ${escapeFrontmatter(description)}`,
    'category: persona',
    `tags: ${escapeFrontmatter(tags)}`,
    `display_zh: ${escapeFrontmatter(p.displayName.zh)}`,
    `display_en: ${escapeFrontmatter(p.displayName.en)}`,
    `role_zh: ${escapeFrontmatter(p.role.zh)}`,
    `role_en: ${escapeFrontmatter(p.role.en)}`,
    `analyst_category: ${p.category}`,
    '---',
    '',
    `# ${p.displayName.en} (${p.displayName.zh})`,
    '',
    `**Role**: ${p.role.en} / ${p.role.zh}`,
    `**Tier**: ${p.category}`,
    '',
    '## When to load this persona',
    '',
    `Call \`load_skill("persona-${p.id}")\` when:`,
    '',
    ...buildWhenToLoad(p),
    '',
    '## Full persona system prompt',
    '',
    'When using this persona\'s framework in your synthesis, internalize the following voice and decision lens. Do NOT echo it verbatim — instead, write the analysis FROM this perspective.',
    '',
    '```',
    p.systemPrompt.trim(),
    '```',
    '',
    '## Specialization weights',
    '',
    'When this persona evaluates different task types, it carries these confidence weights (higher = more authoritative voice on this domain):',
    '',
    ...Object.entries(p.specialization)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `- **${k}**: ${v.toFixed(1)}`),
    '',
  ];
  return lines.join('\n') + '\n';
}

function buildWhenToLoad(p: AnalystPersona): string[] {
  // Top-2 specialization keys describe the natural use case for this persona.
  const topSpecs = Object.entries(p.specialization)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => k.replace(/_/g, ' '));
  const lines = [
    `- The user asks for a **${p.role.en}** angle on a specific asset or thesis.`,
  ];
  if (topSpecs.length > 0) {
    lines.push(`- The query touches **${topSpecs.join('** or **')}**.`);
  }
  if (p.category === 'master') {
    // Master-tier are named-investor personas. Trigger on name mentions too.
    const lc = p.displayName.en.toLowerCase();
    lines.push(`- The user explicitly mentions **${p.displayName.en}** or asks "what would ${lc.split(' ')[0]} say about X".`);
  } else if (p.category === 'system') {
    lines.push(`- Synthesis would benefit from a **mandatory baseline** ${p.role.en.toLowerCase()} perspective.`);
  } else {
    lines.push(`- The user requests a **${p.role.en.toLowerCase()}**-focused deep dive.`);
  }
  return lines;
}

/**
 * Mirror every persona in ANALYST_CATALOG out to disk.
 * Skips writes when the file content is already identical.
 * Returns { written, skipped, total } for boot-time logging.
 */
export function syncPersonaSkillsToDisk(): { written: number; skipped: number; total: number } {
  fs.mkdirSync(PERSONA_DIR, { recursive: true });
  let written = 0;
  let skipped = 0;
  for (const p of ANALYST_CATALOG) {
    const dir = path.join(PERSONA_DIR, p.id);
    const file = path.join(dir, 'SKILL.md');
    const content = renderSkillMarkdown(p);
    try {
      const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (existing === content) {
        skipped++;
        continue;
      }
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, content, 'utf8');
      written++;
    } catch (err) {
      console.warn(`[persona-sync] failed for ${p.id}:`, (err as Error).message);
    }
  }
  console.log(`[persona-sync] ${written} written, ${skipped} unchanged, ${ANALYST_CATALOG.length} total`);
  return { written, skipped, total: ANALYST_CATALOG.length };
}
