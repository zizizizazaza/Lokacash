import { BaseTool, type ToolExecutionContext, type ToolResult } from './types.js';
import { skillsLoader } from '../../services/skillsLoader.service.js';

/**
 * Phase 3.1 — Lets the LLM load a skill's full content on demand. The
 * system prompt only carries one-line skill descriptions; the body is
 * fetched here when the LLM thinks it's relevant.
 *
 * Typical use: synthesis time. Before writing the SOL technical analysis
 * the LLM calls `load_skill("smc")` to refresh on Smart Money Concepts
 * methodology, then weaves it into the report.
 */
export class LoadSkillTool extends BaseTool {
  readonly name = 'load_skill';
  readonly description =
    'Load the full content of a domain knowledge skill (technical methodology, ' +
    'fundamental framework, crypto/macro concept, etc.). Use this BEFORE writing ' +
    'analysis if the question maps to a specific framework — e.g. load smc before ' +
    'discussing institutional flow, load earnings-forecast before assessing earnings ' +
    'quality, load perp-funding-basis before reading derivatives signals. ' +
    'Skill names appear in the system prompt under ## Skills.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description:
          'Exact skill name (e.g. "smc", "earnings-forecast", "perp-funding-basis"). Must match a name listed under ## Skills.',
      },
    },
    required: ['name'],
    additionalProperties: false,
  };

  async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const name = String(args.name || '').trim();
    if (!name) {
      return { ok: false, content: '', error: 'load_skill: empty name' };
    }
    const skill = skillsLoader.load(name);
    if (!skill) {
      const available = skillsLoader.list().slice(0, 20).map((s) => s.name).join(', ');
      return {
        ok: false,
        content: '',
        error: `Unknown skill: "${name}". Available examples: ${available}${skillsLoader.list().length > 20 ? '...' : ''}`,
      };
    }
    ctx.emitter.emitModule('skill', 'completed', {
      action: 'loaded',
      name: skill.name,
      category: skill.category,
    });
    // Truncate at a generous bound — most SKILL.md are 2-5KB, but a few
    // technical skills can hit 15-20KB which is fine for a single load.
    const body = skill.body.slice(0, 24000);
    return {
      ok: true,
      content: `# Skill: ${skill.name}\n\n_${skill.description}_\n\n${body}`,
    };
  }
}
