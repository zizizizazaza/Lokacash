import { ToolRegistry } from './types.js';
import { Web3TokenTool } from './web3Tool.js';
import { WebResearchTool } from './researchTool.js';
import { StockAnalysisTool } from './stockAnalysisTool.js';
import { PortfolioSimulateTool } from './portfolioSimulateTool.js';
import { RememberTool } from './rememberTool.js';
import { SessionSearchTool } from './sessionSearchTool.js';
import { LoadSkillTool } from './loadSkillTool.js';

export { BaseTool, ToolRegistry } from './types.js';
export type { ToolExecutionContext, ToolResult, OpenAIToolSchema, SignalSearchSource } from './types.js';

let cached: ToolRegistry | null = null;

/**
 * Lazily build the SuperAgent v2 tool registry. Phase 1 had 4 capability
 * tools; Phase 2 adds two cross-cutting ones:
 *   - remember        — persist a fact about the user across sessions
 *   - session_search  — search the user's prior chat history
 */
export function buildSuperAgentRegistry(): ToolRegistry {
  if (cached) return cached;
  const reg = new ToolRegistry();
  reg.register(new StockAnalysisTool());
  reg.register(new WebResearchTool());
  reg.register(new PortfolioSimulateTool());
  reg.register(new Web3TokenTool());
  reg.register(new RememberTool());
  reg.register(new SessionSearchTool());
  reg.register(new LoadSkillTool());
  cached = reg;
  return reg;
}
