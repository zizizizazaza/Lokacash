/**
 * Phase 3.1 — Skills loader (Progressive Disclosure pattern from Vibe-Trading).
 *
 * Skills are markdown documents with YAML frontmatter that bundle a specific
 * domain methodology — "how to read SMC structure", "how to score earnings
 * quality", "how to interpret crypto derivatives data". They live on disk
 * and are loaded lazily:
 *
 *   1. At server startup we scan `server/skills/` and parse each SKILL.md's
 *      frontmatter (name + description + category). The bodies stay on disk.
 *   2. The system prompt is augmented with a one-line description per skill
 *      so the LLM knows what's available — but doesn't see the content yet.
 *   3. When the LLM decides a skill is relevant, it calls the `load_skill`
 *      tool which returns the full body. That content joins the conversation
 *      and informs synthesis.
 *
 * Net effect: the system prompt stays small (one line per skill ≈ 50-100
 * tokens × ~30 skills = 2-3k tokens) instead of bloating to 50k+ tokens
 * with all bodies. Only relevant skills are paid for, per turn.
 *
 * Directory layout (mirrors Vibe-Trading for easy porting):
 *
 *   server/skills/<name>/SKILL.md   ← preferred (allows companion files)
 *   server/skills/<name>.md         ← also accepted (flat single-file)
 *
 * Frontmatter format:
 *   ---
 *   name: smc
 *   description: Smart Money Concepts — institutional flow via market structure...
 *   category: technical
 *   ---
 *
 *   # body markdown follows
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { syncPersonaSkillsToDisk } from './personaSkillSync.service.js';

const SKILLS_ROOT = process.env.SKILLS_ROOT?.trim() || path.join(process.cwd(), 'skills');

export interface SkillMeta {
  name: string;
  description: string;
  category: string;
  /** Absolute filesystem path of the SKILL.md, used to lazy-load the body. */
  filePath: string;
}

export interface SkillContent extends SkillMeta {
  body: string;
}

interface RawFrontmatter {
  name?: string;
  description?: string;
  category?: string;
  [key: string]: unknown;
}

function parseFrontmatter(text: string): { meta: RawFrontmatter; body: string } {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?/m.exec(text);
  if (!m) return { meta: {}, body: text };
  const yaml = m[1];
  const body = text.slice(m[0].length);
  const meta: RawFrontmatter = {};
  // Minimal YAML parse — only the three keys we need. Keeps deps to zero.
  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.trimEnd();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) meta[key] = val;
  }
  return { meta, body };
}

class SkillsLoader {
  private metas = new Map<string, SkillMeta>();
  private contentCache = new Map<string, SkillContent>();
  private loaded = false;

  /** Synchronous one-time scan at startup. Idempotent — safe to call again. */
  loadAll(): void {
    if (this.loaded) return;
    this.metas.clear();
    this.contentCache.clear();
    if (!fs.existsSync(SKILLS_ROOT)) {
      console.warn(`[skills] SKILLS_ROOT does not exist: ${SKILLS_ROOT} — no skills loaded`);
      this.loaded = true;
      return;
    }
    let total = 0;
    let skipped = 0;

    const tryLoadAt = (candidatePath: string): void => {
      try {
        const raw = fs.readFileSync(candidatePath, 'utf8');
        const { meta } = parseFrontmatter(raw);
        const name = (meta.name || '').toString().trim();
        if (!name) {
          skipped++;
          return;
        }
        if (this.metas.has(name)) {
          console.warn(`[skills] duplicate skill name "${name}" — keeping first, skipping ${candidatePath}`);
          skipped++;
          return;
        }
        this.metas.set(name, {
          name,
          description: (meta.description || '').toString().slice(0, 280),
          category: (meta.category || 'general').toString().trim() || 'general',
          filePath: candidatePath,
        });
        total++;
      } catch (err) {
        console.warn(`[skills] failed to read ${candidatePath}:`, (err as Error).message);
        skipped++;
      }
    };

    // Up-to-two-level scan: supports both layouts
    //   server/skills/<name>/SKILL.md          (top-level skill)
    //   server/skills/<group>/<name>/SKILL.md  (grouped, e.g. persona/buffett_style/SKILL.md)
    //   server/skills/<name>.md                (flat single-file fallback)
    //
    // The grouped layout lets us namespace persona skills under a single
    // folder without inflating the loader. Depth is capped at 2 so a
    // stray symlink or misplaced docs folder can't fork a deep crawl.
    const scan = (dir: string, depth: number): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (err) {
        console.warn(`[skills] readdir failed at ${dir}:`, (err as Error).message);
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const inner = path.join(dir, entry.name, 'SKILL.md');
          if (fs.existsSync(inner)) {
            tryLoadAt(inner);
          } else if (depth < 2) {
            // Treat as group folder and recurse one more level.
            scan(path.join(dir, entry.name), depth + 1);
          }
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md') && entry.name.toLowerCase() !== 'readme.md') {
          tryLoadAt(path.join(dir, entry.name));
        }
      }
    };

    scan(SKILLS_ROOT, 1);
    this.loaded = true;
    console.log(`[skills] loaded ${total} skill metas (skipped ${skipped}) from ${SKILLS_ROOT}`);
  }

  list(): SkillMeta[] {
    if (!this.loaded) this.loadAll();
    return [...this.metas.values()];
  }

  has(name: string): boolean {
    if (!this.loaded) this.loadAll();
    return this.metas.has(name);
  }

  /** Lazy body load — kept on disk until first request, then cached in memory. */
  load(name: string): SkillContent | null {
    if (!this.loaded) this.loadAll();
    const cached = this.contentCache.get(name);
    if (cached) return cached;
    const meta = this.metas.get(name);
    if (!meta) return null;
    try {
      const raw = fs.readFileSync(meta.filePath, 'utf8');
      const { body } = parseFrontmatter(raw);
      const full: SkillContent = { ...meta, body };
      this.contentCache.set(name, full);
      return full;
    } catch (err) {
      console.warn(`[skills] failed to load body for ${name}:`, (err as Error).message);
      return null;
    }
  }

  /**
   * Build the "## Skills" section for the system prompt.
   *
   * COMPACT MODE — list skills as comma-separated names grouped by category,
   * with no per-skill description. The LLM infers what each does from its
   * name (e.g. "smc" / "perp-funding-basis" are domain-obvious to a finance
   * model) and pulls full content via load_skill on demand. This keeps the
   * system prompt well under 1k tokens (vs ~3k tokens for the verbose mode)
   * which dramatically improves first-pass TTFB on prefill-heavy LLMs.
   *
   * If you need the verbose mode back, set SKILLS_VERBOSE=1.
   */
  buildSystemPromptSection(): string {
    if (!this.loaded) this.loadAll();
    if (this.metas.size === 0) return '';
    const byCategory = new Map<string, SkillMeta[]>();
    for (const m of this.metas.values()) {
      const arr = byCategory.get(m.category) || [];
      arr.push(m);
      byCategory.set(m.category, arr);
    }
    const verbose = process.env.SKILLS_VERBOSE === '1';
    const lines: string[] = ['## Skills (call `load_skill` with one of these names to read full content)'];
    const categories = [...byCategory.keys()].sort();
    for (const cat of categories) {
      lines.push('');
      const items = byCategory.get(cat)!.sort((a, b) => a.name.localeCompare(b.name));
      if (verbose) {
        lines.push(`### ${cat}`);
        for (const m of items) {
          lines.push(`- **${m.name}** — ${m.description.slice(0, 120)}`);
        }
      } else {
        // Compact: "**category**: name1, name2, name3, ..."
        const names = items.map((m) => m.name).join(', ');
        lines.push(`- **${cat}**: ${names}`);
      }
    }
    return lines.join('\n');
  }
}

export const skillsLoader = new SkillsLoader();

// Eager-load at module import so server startup logs surface the skill count.
// Without this the first scan only happens on the first user message, which
// makes "did skills wire up?" verification awkward in dev.
//
// Persona auto-sync runs FIRST so the on-disk persona/<id>/SKILL.md files are
// fresh before the loader scans them. analysts.ts stays the single source of
// truth for Roundtable + Aegean; the mirror just gives v2 the same content
// as load-able skills.
try {
  syncPersonaSkillsToDisk();
} catch (err) {
  console.warn('[persona-sync] skipped (will retry on next boot):', (err as Error).message);
}

try {
  skillsLoader.loadAll();
} catch (err) {
  console.warn('[skills] eager load failed (will retry on first use):', (err as Error).message);
}
