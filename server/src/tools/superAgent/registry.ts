import { ToolRegistry } from './types.js';
import { Web3TokenTool } from './web3Tool.js';
import { WebResearchTool } from './researchTool.js';
import { StockAnalysisTool } from './stockAnalysisTool.js';
import { PortfolioSimulateTool } from './portfolioSimulateTool.js';
import { RememberTool } from './rememberTool.js';
import { SessionSearchTool } from './sessionSearchTool.js';
import { LoadSkillTool } from './loadSkillTool.js';
import { FinancialReportTool } from './financialReportTool.js';
import { SecFilingsTool } from './secFilingsTool.js';
import { HsgtFlowTool } from './hsgtFlowTool.js';

export { BaseTool, ToolRegistry } from './types.js';
export type { ToolExecutionContext, ToolResult, OpenAIToolSchema, SignalSearchSource } from './types.js';

let cached: ToolRegistry | null = null;

/**
 * Lazily build the SuperAgent v2 tool registry.
 *   - stock_analysis     — equity price + technicals + fundamentals
 *   - web3_token_analysis— crypto market data
 *   - web_research       — news / X / sentiment search
 *   - portfolio_simulate — multi-investor what-if scenarios
 *   - financial_report   — A-share earnings (业绩预告 / 快报 / 财务摘要)
 *   - sec_filings        — US SEC EDGAR official disclosures
 *   - hsgt_flow          — HK Stock Connect capital flow (北向 / 南向 / 4 通道汇总)
 *   - remember           — persist fact about the user across sessions
 *   - session_search     — search the user's prior chat history
 *   - load_skill         — load a methodology / persona skill
 */
export function buildSuperAgentRegistry(): ToolRegistry {
  if (cached) return cached;
  const reg = new ToolRegistry();
  reg.register(new StockAnalysisTool());
  reg.register(new WebResearchTool());
  reg.register(new PortfolioSimulateTool());
  reg.register(new Web3TokenTool());
  reg.register(new FinancialReportTool());
  reg.register(new SecFilingsTool());
  reg.register(new HsgtFlowTool());
  reg.register(new RememberTool());
  reg.register(new SessionSearchTool());
  reg.register(new LoadSkillTool());
  cached = reg;
  return reg;
}
