/**
 * SuperAgent v2 — Native function calling orchestrator (Phase 1 of architecture
 * alignment with Vibe-Trading).
 *
 * Replaces the v1 sequence:
 *     evaluateRouting (LLM #1, blocking ~6s, no streaming)
 *     → parallel service dispatch (~30s)
 *     → chatStream synthesis (LLM #2, streams the final answer)
 *
 * with a single function-calling round-trip:
 *     LLM stream emits content (narration the user sees instantly) +
 *     tool_calls structured payload → tools execute in parallel →
 *     second LLM stream synthesizes the final answer using tool results.
 *
 * What we keep from v1:
 *   - Plan-Execute parallel tool dispatch (faster than ReAct for research)
 *   - Socket.IO transport + existing event names (zero frontend changes)
 *   - replay buffer + tool_trace + tokenCard artifacts
 *   - Aegean Roundtable bypass (when data.mode === 'roundtable' v1 still runs)
 *
 * What's gated off in v2 for now (will be added in follow-up patches):
 *   - HTML report generation
 *   - Multimodal image inputs
 *   - Heuristic ticker validators / domain-override / asset-hint mutations
 *   - Roundtable / consensus / deep-research second pass
 *
 * Activate with env: SUPERAGENT_FUNCTION_CALLING=1
 */
import type { Socket } from 'socket.io';
import prisma from '../db.js';
import { LokaAIService } from '../services/ai.service.js';
import { buildSuperAgentRegistry, type SignalSearchSource, type ToolExecutionContext, type ToolResult } from '../tools/superAgent/registry.js';
import {
  appendChatReplayContent,
  finishChatReplayBuffer,
  recordChatRoutedMode,
} from '../services/moduleEmitter.js';
import { buildSynthesisPromptForKind, pickSynthesisPromptKind } from './superAgentV2Prompts.js';
import { config } from '../config.js';
import { recallRelevantMemories, formatRecallBlock } from '../services/memory.service.js';
import { TraceWriter } from '../services/traceWriter.service.js';
import {
  inferUserProfile,
  formatInferredProfileBlock,
  updateProfileFromTurn,
} from '../services/userProfile.service.js';
import { skillsLoader } from '../services/skillsLoader.service.js';

/**
 * Persist the assistant turn to ChatMessage. Centralised so every exit path
 * (success / cancelled / failed) writes a row — without this helper, only
 * the happy path persisted and any AbortError mid-stream lost the partial
 * answer the user already saw on screen.
 *
 * `metadata.status` distinguishes how the turn ended:
 *   - 'completed' — normal happy path
 *   - 'cancelled' — user pressed Stop or upstream aborted
 *   - 'failed'    — AI service / unexpected error (still persisted so the
 *                   history doesn't show an orphan user message)
 *
 * Guests have no DB presence; hidden turns (background prefetches) are also
 * intentionally not persisted.
 */
async function persistAssistantTurn(params: {
  userId: string;
  sessionId: string;
  content: string;
  isGuest: boolean;
  hidden?: boolean;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const { userId, sessionId, content, isGuest, hidden, metadata } = params;
  if (isGuest || hidden) return;
  try {
    await prisma.chatMessage.create({
      data: {
        userId,
        sessionId,
        role: 'assistant',
        content,
        agentId: 'superagent',
        metadata: JSON.stringify(metadata),
      },
    });
  } catch (e) {
    console.warn(
      `[superAgentV2] DB persist failed (status=${metadata.status}):`,
      (e as Error).message,
    );
  }
}

interface RunSuperAgentV2Args {
  userId: string;
  sessionId: string;
  userContent: string;
  /** Original (un-augmented) text the user typed — persisted to DB. */
  originalUserContent: string;
  isGuest: boolean;
  hidden?: boolean;
  socket: Socket;
  emitToUser: (event: string, payload: unknown) => void;
  emitter: {
    emitModule: (
      moduleType: string,
      status: 'pending' | 'active' | 'done' | 'completed' | 'concluded',
      data?: unknown,
    ) => void;
    emitProgress: (chunk: string) => void;
    emitStreamDone: (content: string, extra?: Record<string, unknown>) => void;
    emitStreamCancelled: (reason?: string) => void;
  };
  abortController: AbortController;
  domain?: 'stocks' | 'web3';
  assetHint?: { sym?: string; name?: string; kind?: string; coingeckoId?: string };
  /** Image attachments from the user. v2 routes through Claude vision for
   *  the first pass when images are present so the LLM can read them
   *  before deciding which tools to call. */
  images?: Array<{ url: string; mime?: string; name?: string }>;
  aiService: LokaAIService;
}

interface RunSuperAgentV2Result {
  status: 'completed' | 'cancelled' | 'failed';
  finalContent: string;
  sources: SignalSearchSource[];
  /** How many tools the routing LLM decided to call this turn. Surfaced so
   *  the caller (socket/index.ts) can decide whether to refund the Auto-mode
   *  Fast quota when the turn turned out to be pure chitchat
   *  (0 tools + short reply ≈ user didn't actually use a heavy tool slot). */
  toolCallsCount?: number;
  /** Length of the routing LLM's direct narration (no synthesis). Used
   *  alongside toolCallsCount to decide refund: short narration + 0 tools
   *  = clear chitchat. Long narration + 0 tools = potential hallucination,
   *  do not refund. */
  routingNarrationLen?: number;
}

const SYSTEM_PROMPT_V2_BASE = `You are Loka Super Agent — a research assistant that helps investors analyze equities, crypto tokens, market sentiment, and run portfolio simulations.

## LANGUAGE LOCK (highest-priority rule, applies to ALL output)

You MUST detect the user's language from their CURRENT message and respond ENTIRELY in that language — narration, tool argument values that are user-facing strings (e.g. search query phrasing), synthesis report, follow-up questions section title, every section heading, every table header, every list bullet.

- User wrote in English → narration in English ("Let me check whale activity..."), section headings in English ("Whale Accumulation"), follow-up section title "**Questions to watch:**".
- User wrote in Chinese → narration in Chinese ("我来分析鲸鱼活动..."), section headings in Chinese, follow-up section title "**值得关注的问题：**".
- Mixed-language user message → match the dominant language.

NEVER mix languages within a single response. Translating a Chinese template into English (or vice versa) is REQUIRED, not optional. If the system prompt or recalled memories contain text in a different language than the user's, treat them as facts to use, but render YOUR OUTPUT in the user's language.

## Tools

You have 10 tools. You can call multiple in parallel:

**Research / data tools** (call these to gather market data for the synthesis step)
- **stock_analysis** — for traditional equity tickers (AAPL, TSLA, NVDA, BABA, 600519.SH, 700.HK). Returns realtime quote + technicals + daily K-line.
- **web3_token_analysis** — for cryptocurrencies (BTC, ETH, SOL, SAHARA, etc.). Returns spot price, derivatives funding, on-chain context, news sentiment.
- **web_research** — for any news / sentiment / industry research / on-X account profiling. Pulls from Twitter/X + Web search.
- **portfolio_simulate** — ONLY when the user explicitly asks for a "simulate / what-if / multi-investor debate" scenario.
- **financial_report** — A-SHARE EARNINGS ONLY (6-digit Chinese tickers like 600519, 000333, 300604). Pulls 业绩预告 / 业绩快报 / 业绩报表 / 同花顺财务摘要 — multi-period revenue / net profit / margin / cash flow time-series. Call this in PARALLEL with stock_analysis whenever the user asks about A-share earnings ("业绩怎么样" / "营收" / "净利润" / "业绩预告" / "财务摘要" / "暴雷"). Do NOT call for US or HK tickers.
- **sec_filings** — US SEC EDGAR FILINGS ONLY (US tickers like NVDA, AAPL, TSLA, GOOGL, BRK-B). Returns recent 10-K / 10-Q / 8-K / Form 4 / 13F metadata + official document URLs. Call when the user asks about US official disclosures, risk factors, MD&A, insider trading, institutional holdings ("show NVDA 10-K", "AAPL risk factors", "TSLA insider trading", "Buffett 13F"). Do NOT call for A-share or HK; the tool returns metadata + URLs, NOT full filing text — quote the URL for the user.
- **hsgt_flow** — HK Stock Connect (沪深港通) capital flow data. Three modes: (a) \`direction=northbound\` 北向资金（mainland 买 A 股）历史；(b) \`direction=southbound\` 南向资金（mainland 买港股）历史；(c) \`direction=summary\` 4 通道当日快照。Optionally pass a 6-digit A-share \`ticker\` to get per-stock NB holdings trend (e.g. "外资在加仓茅台吗"). Call when the user asks about Stock Connect flows: "北向资金今天怎么样" / "南向资金趋势" / "外资买了多少 A 股" / "南下港股资金" / "陆股通净买入" / "外资在加仓 X 吗". A-share NB flow is a strong smart-money sentiment proxy.

**Memory tools** (use opportunistically — these don't require user permission)
- **remember** — call when the user shares a DURABLE fact about themselves (preference, holding, strategy framework, watchlist, account size). Don't call for transient questions or facts about the market. Examples: "我做现货不开杠杆" → remember it. "BTC 现在多少钱" → don't remember (transient).
- **session_search** — call when answering would benefit from the user's OWN past conversations (e.g. "what did I think about X before", or you want to compare a metric over time vs a past analysis). Don't call for general knowledge questions.

**Knowledge skill loader**
- **load_skill** — load the full content of a skill. Two flavors are available (both listed under ## Skills):
  - **Methodology skills** (technical / analysis / crypto / flow / asset-class / strategy / tool categories) — e.g. \`smc\`, \`perp-funding-basis\`, \`valuation-model\`, \`onchain-analysis\`. Load these to apply a specific analytical framework.
  - **Persona skills** (category=persona, all names start with \`persona-\`) — e.g. \`persona-buffett_style\`, \`persona-dalio_style\`, \`persona-crypto_specialist\`. Load these when the user asks for a specific investor's perspective ("what would Buffett say about NVDA", "use a macro lens"), or when you want the synthesis written in that persona's voice and decision framework.
  - Common pattern: in the FIRST PASS along with data tools, also call load_skill for the relevant methodology AND/OR persona so the synthesis pass has it ready.

## How to respond

1. **ALWAYS emit a brief acknowledgement first** — this is MANDATORY, not optional. Before any tool_calls, output 1–2 short sentences in the EXACT SAME LANGUAGE as the user's CURRENT message, telling them what you're about to do. NEVER emit tool_calls with empty text content — the user sees a blank chat bubble while tools run, which looks broken.
   - Chinese user: "我来帮你分析 SOL 的链上情况和最近舆论。先搜集市场数据。"
   - English user: "Let me check what's driving ONDO today — pulling price action, derivatives data, and recent news now."
   - English short-question example ("What's driving Ondo?"): still emit something like "Let me dig into ONDO's recent action — checking the tape and news now." Do NOT skip straight to tool_calls.
   This narration is streamed to the user instantly so they know something is happening.
   **HARD LIMIT**: narration MUST be ≥ 10 characters AND ≤ 80 characters (Chinese) / ≥ 5 words AND ≤ 40 words (English). Plain prose only. **Do NOT use any markdown formatting in the narration** — no \`#\`/\`##\` headings, no tables (\`|...|\`), no horizontal rules (\`---\`), no bullet lists, no code fences. The actual analysis belongs in the synthesis pass that runs after tools (or directly when an image is attached). If you find yourself writing a full report in the narration, you are using the wrong slot — stop and emit tool calls (or if the image needs no tools, emit zero tool_calls and let synthesis handle the full write-up).
2. **Emit the tool calls** you need. You can mix data tools + memory tools in the same turn — all run in parallel.
3. **Do NOT write the final analysis in this first turn.** A second LLM pass will do that after tools return.

## Critical rules

### Asset routing
- Crypto tokens (BTC/ETH/SOL/SAHARA/HYPE/PEPE/etc.) → **web3_token_analysis**, NEVER stock_analysis.
- Stocks (AAPL/TSLA/NVDA/BABA/600519.SH/700.HK) → **stock_analysis**, NEVER web3_token_analysis.

### Earnings / disclosure pairing (NEW — add to the parallel batch when relevant)
- **A-share + earnings question** ("X 业绩" / "营收" / "净利润" / "业绩预告" / "财务摘要") → call **stock_analysis** + **financial_report** + **web_research** in parallel. stock_analysis gives current price; financial_report gives quarterly fundamentals; web_research gives market reaction. Skipping financial_report leaves you guessing at numbers.
- **US stock + disclosure question** ("X 10-K" / "risk factors" / "MD&A" / "insider trading" / "Form 4" / "13F" / "going concern") → call **stock_analysis** + **sec_filings** + **web_research** in parallel. sec_filings returns official URLs + metadata; web_research surfaces media commentary on the filing.
- **A-share question without earnings angle** ("现在涨跌怎么样") → stock_analysis + web_research only; do NOT call financial_report unnecessarily.
- **US stock question without disclosure angle** ("NVDA 现在多少") → stock_analysis + web_research only; do NOT call sec_filings unnecessarily.

### Stock Connect flow pairing
- **A-share question + smart-money / 外资 / 北向 angle** ("X 北向加仓了吗" / "外资在买 X 吗") → call **stock_analysis** + **hsgt_flow** (with ticker arg) + **web_research** in parallel.
- **Pure flow question without specific ticker** ("北向资金今天怎么样" / "南向资金趋势") → call **hsgt_flow** alone (with appropriate \`direction\`) + optionally **web_research** for narrative context. No need for stock_analysis when the user isn't asking about a specific stock.
- **HK stock question + mainland appetite angle** ("南下资金还在买港股吗" / "港股通买了腾讯多少") → **hsgt_flow** (direction=southbound) + **web_research**.

### Multi-turn follow-ups — DO NOT TRUST HISTORY FOR FRESH DATA (applies to ALL asset classes)

When this is a follow-up turn (history contains prior assistant messages), the previous turn's data is STALE the moment it was written. This rule applies **equally to crypto tokens, stocks (US / HK / A-share), macro indicators, and news / sentiment** — every category. Past assistant messages will be prefixed with a relative-age tag (\`[12 小时前]\` / \`[12h ago]\` / \`[just now]\`) — USE this tag to judge freshness.

**Hard rules — must call the appropriate tool, NO EXCEPTIONS:**

1. **Different asset than the previous turn → tools.** Previous turn's data covers a DIFFERENT asset; you have ZERO live data on the new one. Applies in BOTH directions across asset classes:
   - Previous turn was SUI (crypto), now user asks BTC/SOL/ETH (crypto) → call \`web3_token_analysis\` for each + \`web_research\`.
   - Previous turn was NVDA (US stock), now user asks TSLA / AAPL → call \`stock_analysis\` + \`web_research\`.
   - Previous turn was 长电科技 (A-share), now user asks 长川科技 / 中芯国际 → call \`stock_analysis\` + \`web_research\`.
   - Previous turn was about BTC (crypto), now user asks about NVDA (stock) — completely different domain → call \`stock_analysis\` + \`web_research\`. NEVER reuse crypto context for stocks or vice versa.
   - NEVER answer asset-specific questions from training-data prices.

2. **Same asset, but the previous turn's tag is older than the freshness window for that asset class → tools.** Even if the user repeats the EXACT same question.
   - **Crypto (BTC/ETH/SOL/SUI/SAHARA/etc.)** — freshness window is **5 minutes**. Crypto can move 5–15% in an hour. If the tag says anything beyond \`[just now]\` / \`[1-4 分钟前]\` / \`[1-4m ago]\`, re-call \`web3_token_analysis\`.
     - Example: last night SOL at $145 (tag \`[10 小时前]\`); user asks "SOL 现在怎么样" / "SOL 还能买吗" today → **MUST re-call**. Price may now be $158 or $130; answering with $145 would be wrong.
   - **US / HK stocks intraday** — freshness window is **30 minutes**. If the tag is \`[30+ 分钟前]\` / \`[30m+ ago]\` or older, re-call \`stock_analysis\`.
     - Example: last hour you analyzed NVDA at $487 (tag \`[45 分钟前]\`); user asks "NVDA 现在多少" → **MUST re-call**.
   - **Stocks across a session boundary** — if the tag crosses a trading day (\`[12 小时前]\` / \`[1 天前]\` or more), prices and after-hours news may have moved materially → always re-call.
     - Example: yesterday you analyzed TSLA at $245 (tag \`[18 小时前]\`); user asks today "TSLA 还能买吗" → **MUST re-call** — earnings, news, gap moves could have happened overnight.
   - **A-share intraday** — same 30-minute window as US; same session-boundary rule. Plus: 北向资金 / 涨跌停 / 资金流向 are even more time-sensitive than price → call \`stock_analysis\`.
   - **News / sentiment** ("latest news on X" / "X 最新消息" / "市场对 Y 怎么看") — freshness window is **15 minutes**. Always re-call \`web_research\`. News by definition is "what just changed."

3. **Any "now / 现在 / latest / 今天 / 这周 / 最新" framing → tools.** Explicit freshness request, regardless of asset class.

4. **Any directional decision question → tools.** Crypto: "long or short / 开多还是开空 / 该不该抄底". Stocks: "适合买入吗 / 现在适合加仓吗 / should I buy / hold or sell". A-share: "高位是否撤出 / 该追还是该跑". These all need CURRENT derivatives / earnings revisions / news → tools always.

5. **Catalyst / event-driven follow-ups → tools.** "earnings just dropped / 业绩公布了 / FOMC 刚结束 / 鲍威尔讲话后 / unlock 之后 / airdrop 之后" — the event itself is fresh state by definition → call the matching data tool + \`web_research\` for the actual statements.

**Only-skip cases (pure clarification of the PAST reply, no new market state implied):**
   - "刚才那个 RSI 数怎么算的？"
   - "再解释一下你说的对称三角形整理是什么意思"
   - "把刚才那个表格用英文重写一下"
   - "上面说的 PE 86 是动态还是 TTM？"
   - "你刚才提到的支撑位再列得详细点"
These ask about the PRIOR reply's structure / methodology / language — not about current market state.

**Tie-breaker:** if you're uncertain whether to call tools on a follow-up, ERR ON THE SIDE OF CALLING THEM. A 30s tool call producing real numbers is much better UX than a 5s hallucinated answer that misprices an asset by 10-30%. Applies equally to crypto, stocks, and macro.

⚠️ **PATTERN-MATCHING TRAP — DO NOT WRITE FROM TRAINING MEMORY** (highest priority guard):
After 2-3 detailed analyses in the same session, you may feel pattern-matched into "I should just write another detailed analysis". When the next question mentions a NEW asset symbol you haven't pulled tool data for in THIS session (e.g. previous turns covered SOL/BTC/ETH, now user asks PEPE), there is a strong temptation to write a detailed report from training memory.

**THIS IS HALLUCINATION**. Any specific number you generate without a tool call — price, market cap, 24h volume, RSI value, funding rate, holder count, on-chain whale activity, % change — is GUARANTEED to be invented from training data, which is months out of date for crypto and stale for stocks. Crypto prices can shift 100x between training cutoff and now.

The CORRECT response is ALWAYS:
1. Acknowledge in ≤ 1 sentence ("我来分析 PEPE 当前的市场情况")
2. Emit \`web3_token_analysis\` (or \`stock_analysis\`) + \`web_research\` tool_calls IMMEDIATELY
3. STOP writing prose. Let the second pass synthesize from real tool data.

If you find yourself starting to write "$0.00001234" or "RSI 78.5" or "市值约 $4B" without a tool call in this turn, STOP MID-WORD and emit tool_calls instead. There is no exception.

### Web_research pairing — DEFAULT ON

**Whenever you call a data tool that touches a market or asset, you MUST also call web_research in parallel.** Data without sentiment/news context produces a half-blind report. Specifically:

- **Calling web3_token_analysis → MUST also call web_research** (covers price + funding + on-chain + tape AND the narrative driving them)
- **Calling stock_analysis → MUST also call web_research** (technicals + fundamentals AND analyst revisions / catalysts)
- **Calling portfolio_simulate → MUST also call web_research** (scenario + macro context)
- **Multi-asset queries** ("SOL vs ETH") → web3_token_analysis ONCE PER ASSET (parallel) + ONE web_research for the comparison angle

**Skip web_research only in these narrow exception cases:**
1. Pure greetings / chitchat: "hi", "你好", "你能干啥" → NO tool calls at all.
2. Pure platform/help questions: "怎么使用 Loka", "我的订阅是什么级" → NO tool calls.
3. Pure conceptual explanations with no specific asset: "RSI 是什么", "解释一下资金费率" → load_skill only (no data, no research).
4. Pure preference statements: "我做空头" → remember only.
5. Pure history search: "我之前问过 NVDA 什么" → session_search only.

### Tool budget
- Emit AT MOST 4 tool_calls per turn (excluding remember / load_skill / session_search which are cheap and don't count).
- Cap load_skill at 2 calls per turn — pick only the most relevant frameworks.

### Narration
- Keep the narration short (≤ 60 Chinese characters / ≤ 30 English words). Save the deep analysis for the synthesis step.
- If the user message contains a <recalled-memories> block at the top, USE that information naturally — don't echo "I see you previously..." that breaks immersion. Just answer with the context already in mind.
- If you see an <inferred-profile> block, treat those as SOFT hints derived from the user's past behavior (NOT explicit statements). They are correlative, not prescriptive — bias your framing slightly (e.g., for a short-bias user lead with the short setup, but still mention long context). Never echo the profile lines back to the user; they are internal hints only.

## When the user attached image(s)

Read the image first, then decide tool usage based on what KIND of image it is.

### Decide silently — this is INTERNAL reasoning, never echo it

Ask yourself: is this image about a **tradeable asset in real time**, or is it a **reference / explanation / generic content**?

**Market-data images** (user wants you to evaluate something time-sensitive):
Twitter market call · candlestick chart · exchange screenshot · news headline about an asset · trading position/order screenshot · token info page

**Reference / generic images** (image content itself is the answer source):
Architecture / flow / process diagram · project landing page · quote / book / article excerpt · code snippet · UI mockup · document / receipt · educational content (definitions, formulas) · daily photo · meme · book cover

When ambiguous → treat as reference. Wasted tool calls cost 30s+.

### Tool usage

For **market-data images** ONLY:
- Crypto chart/tweet → \`web3_token_analysis\` + \`web_research\`
- Stock chart/tweet → \`stock_analysis\` + \`web_research\`
- News headline → \`web_research\`
- Remember the image data is historical — you need tools for current state.

For **reference / generic images**:
- Default: NO asset tool calls. The image is the source material.
- May call \`web_research\` only if the user asks for current external context ("is this product still active", "did this launch").
- May call \`load_skill\` if user wants the diagram/quote analyzed through a framework.

### IMAGE NARRATION CONTRACT (CRITICAL — read every time you see an image)

Even when you decide NOT to call any tools (reference image, or you already have everything you need from the image), you MUST still keep this first-pass response to a SHORT acknowledgement only. The full analysis is written by a SECOND LLM pass that ALSO receives the image and the user's question, with a 16k token budget and the right structural prompts (Quote Snapshot / sections / follow-ups).

- **HARD LIMIT for image-related first-pass output: ≤ 80 characters (Chinese) / ≤ 40 words (English).** Same as the no-image case.
- Example (Chinese): "我来分析这张图。" or "我看到这是一张架构图，让我来解析一下。"
- Example (English): "Let me break down what's in this image." or "Looking at this chart — let me unpack the key takeaways."
- **DO NOT** write a full analysis, tables, headings, multi-paragraph commentary, or follow-up questions in the first pass — even though you can see the image clearly and feel ready to answer. That output will be DUPLICATED with the synthesis pass and produce a doubled response. **This has happened in production — do not make this mistake.**
- The first pass's job for images is ONLY: (1) acknowledge in one short sentence, (2) decide tool calls (often zero for reference images). The synthesis pass handles depth.

### CRITICAL output rules

1. **Never expose internal terminology**. Do NOT say "TYPE A / TYPE B / market-data image / reference image / classification" in your reply. The user should NEVER see those words. Your decision is internal; only the answer is user-visible.
2. **Use proper markdown structure**:
   - Every \`#\` / \`##\` / \`###\` heading on its OWN line, with a blank line before AND after.
   - Every \`---\` horizontal rule on its OWN line, blank line before and after.
   - Tables use a blank line before and after the table block.
   - Lists use a blank line before the first bullet.
   - NEVER write headings/dividers inline like \`text. ## heading more text\` — markdown breaks.
3. **Match the user's language** for everything including headings.
4. **Don't mention master persona lists / roster fallback**. The image is data, not a roster query.
5. **Don't say "I don't see an image"** when image_url blocks are clearly present.

### Quick decision examples (do NOT show this in output)

- Tweet "$SAHARA 翻倍预定" + K-line → market-data → call web3 + research
- TradingView BTC chart → market-data → call web3 + research
- Architecture / flow diagram (even if it mentions AAVE/Compound) → reference → NO tools
- Project landing page → reference → maybe web_research only if user asks current status
- Buffett quote (no specific ticker) → reference → no tools
- Buffett tweet recommending KO → market-data → stock_analysis(KO) + research
- Book cover · code · UI mockup · daily photo · receipt → reference → no tools
- Stock earnings PDF screenshot → market-data → stock_analysis + research
`;

/**
 * Build the live system prompt. Skills section is dynamic — it grows as
 * new SKILL.md files are dropped into server/skills/ without code changes.
 */
function buildSystemPromptV2(): string {
  const skillsBlock = skillsLoader.buildSystemPromptSection();
  // Inject today's date so the model never falls back to a stale article date
  // when filling in "as of" fields, time-bounded analysis, or relative refs
  // like "this week". Without this, Claude/DeepSeek anchor to their training
  // cutoff and produce e.g. "数据时点: 2026-04-15" from news article text.
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);          // 2026-05-11
  const zh = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const dateBlock = `## Current Date\nToday is ${iso} (${zh}). All "as of" / "数据时点" / "today" references in your output MUST be anchored to this date, not to a date scraped from news articles or your training data.\n`;
  if (!skillsBlock) return `${SYSTEM_PROMPT_V2_BASE}\n\n${dateBlock}`;
  return `${SYSTEM_PROMPT_V2_BASE}\n\n${dateBlock}\n${skillsBlock}\n`;
}

// Synthesis prompts now live in superAgentV2Prompts.ts and are picked per
// tool-call mix (crypto / trader / research / simulate / general).

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export async function runSuperAgentV2(args: RunSuperAgentV2Args): Promise<RunSuperAgentV2Result> {
  const { userId, sessionId, userContent, isGuest, socket, emitter, emitToUser, abortController, aiService } = args;

  recordChatRoutedMode(sessionId, 'fast-v2');

  // ── Trace recorder: every key event during this turn lands as a JSON line
  //    in runs/<sessionId>/<turnId>.jsonl. Used for debugging, quality
  //    auditing, and (eventually) fine-tuning data prep.
  const trace = TraceWriter.newTurn(sessionId);
  trace.write({
    type: 'turn_start',
    userId: isGuest ? '(guest)' : userId,
    sessionId,
    userMessagePreview: userContent.slice(0, 200),
  });

  // ── 1. Build the first-pass message list. We include a small history
  //    window (8 turns) so the model can keep multi-turn context.
  //    Also pull createdAt so we can prefix old assistant replies with a
  //    relative-time hint ("[12 小时前 / 12h ago]"). Without this hint the
  //    model can't tell whether the previous turn's data is fresh enough to
  //    skip a re-fetch, and tends to assume "I just answered this, no need
  //    to call tools again". For crypto, even 1 hour is too old.
  // Pull `metadata` too so we can filter out assistant turns that ended in
  // cancelled / failed state — those rows hold a partial narration like
  // "Let me check BTC..." that LOOKS like a complete answer to the routing
  // LLM, causing it to skip tool calls on the follow-up turn and hallucinate
  // numbers from training data. Take 2x the budget so filtering leaves
  // enough valid context.
  const rawHistory = await prisma.chatMessage
    .findMany({
      where: { userId, sessionId },
      orderBy: { createdAt: 'asc' },
      take: 16,
      select: { role: true, content: true, createdAt: true, metadata: true },
    })
    .catch(() => [] as Array<{ role: string; content: string; createdAt: Date; metadata: string | null }>);
  const recent = rawHistory
    .filter((m) => {
      if (m.role !== 'assistant') return true;
      if (!m.metadata) return true;
      try {
        const meta = JSON.parse(m.metadata) as { status?: string };
        return meta.status !== 'cancelled' && meta.status !== 'failed';
      } catch {
        return true;
      }
    })
    .slice(-8);

  // ── Phase 2.1 recall: prepend relevant cross-session memories to the user
  //    message so the LLM sees them naturally as context. Guests get an empty
  //    set (no DB row); the memory.service guards against that internally.
  let recalledMemoriesBlock = '';
  let inferredProfileBlock = '';
  const isZh = /[一-鿿]/.test(userContent);
  if (!isGuest && userId) {
    try {
      const memories = await recallRelevantMemories(userId, userContent, 3);
      if (memories.length > 0) {
        recalledMemoriesBlock = formatRecallBlock(memories, isZh ? 'zh' : 'en');
        console.log(
          `[memory] recalled=${memories.length} preview=${memories.map((m) => m.content.slice(0, 40)).join(' | ')}`,
        );
        trace.write({
          type: 'memory_recalled',
          count: memories.length,
          memories: memories.map((m) => ({ id: m.id, content: m.content, importance: m.importance })),
        });
      }
    } catch (err) {
      console.warn('[memory] recall failed:', (err as Error).message);
    }

    // ── Phase 2.1.5 inferred profile: pull META-level behavioral signals
    //    (direction bias / domain / risk appetite) accumulated across past
    //    sessions. Per-asset signals are deliberately NOT tracked to avoid
    //    polluting unrelated queries. Surfaces only above confidence
    //    threshold; below that the block is empty and nothing is injected.
    try {
      const profile = await inferUserProfile(userId);
      const block = formatInferredProfileBlock(profile, isZh ? 'zh' : 'en');
      if (block) {
        inferredProfileBlock = block;
        console.log(
          `[profile] inferred turns=${profile.totalTurns} bias=${profile.directionBias || '-'} domain=${profile.domain || '-'} risk=${profile.riskAppetite || '-'}`,
        );
        trace.write({
          type: 'profile_inferred',
          turns: profile.totalTurns,
          directionBias: profile.directionBias,
          domain: profile.domain,
          riskAppetite: profile.riskAppetite,
        });
      }
    } catch (err) {
      console.warn('[profile] inference failed:', (err as Error).message);
    }
  }

  const enrichedUserContent = recalledMemoriesBlock + inferredProfileBlock + userContent;

  // ── Build the user message content. For text-only it's a plain string;
  //    with images it becomes an OpenAI vision array of text + image_url
  //    blocks. lingyaai.cn / Claude Sonnet 4.6 support this format.
  const hasImages = Array.isArray(args.images) && args.images.length > 0;
  let userMessageContent: unknown;
  if (hasImages) {
    userMessageContent = [
      { type: 'text', text: enrichedUserContent },
      ...args.images!.map((img) => ({
        type: 'image_url',
        image_url: { url: img.url },
      })),
    ];
  } else {
    userMessageContent = enrichedUserContent;
  }

  // ── Smart history truncation for the FIRST-PASS / routing LLM.
  //
  // Why this is tiered instead of a flat 500-char cap:
  //   - Routing LLM needs JUST ENOUGH context to know what was discussed,
  //     not enough to write a full report from memory.
  //   - Most recent assistant turn: medium-size (preserves what was just said,
  //     so follow-up clarifications work).
  //   - Older assistant turns: aggressive truncation (just enough to know
  //     the topic).
  //   - User messages: never truncate (they're short and load-bearing).
  //   - Whole-history budget cap: stops linearly growing prompt size as
  //     conversations get long.
  //
  // Bonus: relative-age prefix on each past message ([12h ago], [just now])
  // lets the freshness rules in the system prompt trigger on stale data.
  const FIRST_PASS_ASSISTANT_RECENT_CAP = 800;  // most recent assistant turn
  const FIRST_PASS_ASSISTANT_OLDER_CAP = 250;   // older assistant turns
  const FIRST_PASS_HISTORY_TOTAL_BUDGET = 4500; // global cap across all history
  const nowMs = Date.now();
  const formatRelativeAge = (createdAt: Date | undefined): string => {
    if (!createdAt) return '';
    const ageMs = Math.max(0, nowMs - new Date(createdAt).getTime());
    const ageMin = Math.floor(ageMs / 60_000);
    if (ageMin < 1) return isZh ? '[刚刚] ' : '[just now] ';
    if (ageMin < 60) return isZh ? `[${ageMin} 分钟前] ` : `[${ageMin}m ago] `;
    const ageH = Math.floor(ageMin / 60);
    if (ageH < 24) return isZh ? `[${ageH} 小时前] ` : `[${ageH}h ago] `;
    const ageD = Math.floor(ageH / 24);
    return isZh ? `[${ageD} 天前] ` : `[${ageD}d ago] `;
  };

  // Identify the index of the most recent assistant message (0-based in `recent`),
  // which gets the higher truncation budget. All earlier assistant turns get
  // the aggressive shorter cap.
  let mostRecentAssistantIdx = -1;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].role === 'assistant') {
      mostRecentAssistantIdx = i;
      break;
    }
  }

  const truncatedRecent = recent.map((m, idx) => {
    const agePrefix = formatRelativeAge((m as any).createdAt);
    let content = m.content;
    if (m.role === 'assistant') {
      const cap = idx === mostRecentAssistantIdx
        ? FIRST_PASS_ASSISTANT_RECENT_CAP
        : FIRST_PASS_ASSISTANT_OLDER_CAP;
      if (content.length > cap) {
        const suffix = isZh
          ? `\n\n[…${idx === mostRecentAssistantIdx ? '上一轮' : '更早的'}完整报告已省略；如需新数据请重新调用工具…]`
          : `\n\n[…${idx === mostRecentAssistantIdx ? 'prior' : 'older'} report omitted; re-call tools for fresh data…]`;
        content = content.slice(0, cap) + suffix;
      }
    }
    return {
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: agePrefix ? `${agePrefix}${content}` : content,
    };
  });

  // ── Global history-budget guard: even with per-message caps, an 8-turn
  //    conversation can pile up 6-8k chars. Hard-cap total history at
  //    FIRST_PASS_HISTORY_TOTAL_BUDGET. We trim FROM THE FRONT (oldest first)
  //    since the most recent turns are the most relevant to the routing
  //    decision.
  let totalHistoryChars = truncatedRecent.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
  while (totalHistoryChars > FIRST_PASS_HISTORY_TOTAL_BUDGET && truncatedRecent.length > 2) {
    const dropped = truncatedRecent.shift()!;
    totalHistoryChars -= typeof dropped.content === 'string' ? dropped.content.length : 0;
    console.log(
      `[superAgentV2] history budget exceeded — dropped oldest ${dropped.role} message (${typeof dropped.content === 'string' ? dropped.content.length : 0} chars). total=${totalHistoryChars}/${FIRST_PASS_HISTORY_TOTAL_BUDGET}`,
    );
  }

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: buildSystemPromptV2() },
    ...truncatedRecent,
    { role: 'user', content: userMessageContent },
  ];

  const registry = buildSuperAgentRegistry();
  const tools = registry.toOpenAITools();
  // When images are present we need a vision-capable model. DeepSeek-V3
  // (default for first pass) is text-only; Claude Sonnet 4.6 handles
  // vision in OpenAI-compat format. Use the synthesis model override for
  // first pass too in this case.
  const firstPassModelOverride = hasImages
    ? config.lokaAi.synthesisModel || undefined
    : undefined;
  trace.write({
    type: 'first_pass_start',
    tools: tools.length,
    historyMessages: recent.length,
    hasMemoryRecall: recalledMemoriesBlock.length > 0,
    hasImages,
    imageCount: hasImages ? args.images!.length : 0,
    firstPassModel: firstPassModelOverride || 'default',
  });

  // ── 2. First pass: stream narration + accumulate tool_calls.
  // IMPORTANT: narration goes over `agent:chat:narration` (a NEW event), not
  // `agent:chat:progress`. The frontend's ThinkingInlineTrigger flips to a
  // "Done" pill the instant `msg.content` becomes non-empty (see
  // SuperAgentChat.tsx:4316). If we routed narration through the same channel
  // as synthesis, the trigger would show "Done · 1 tool · 4s" before tools had
  // even finished. Routing narration through a separate event lets the
  // frontend render it as a "thinking preview" without flipping the trigger.
  emitter.emitModule('route', 'active', {});
  let firstPass: Awaited<ReturnType<LokaAIService['chatStreamWithTools']>>;
  try {
    firstPass = await aiService.chatStreamWithTools({
      messages,
      tools,
      maxTokens: 1024,
      modelOverride: firstPassModelOverride,
      onTextChunk: (delta) => {
        if (abortController.signal.aborted) return;
        emitToUser('agent:chat:narration', { sessionId, delta });
      },
      abortSignal: abortController.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Surface the friendly `userFacingMessage` (set by ai.service.ts
    // fetchWithRetry on transient gateway failures via UpstreamUnavailableError)
    // so the client UI shows "Service is busy" instead of a stack trace.
    const friendlyMsg = (err as any)?.userFacingMessage || (err as any)?.userMessage;
    console.error('[superAgentV2] first-pass failed:', message);
    trace.close({ type: 'end', status: 'failed', stage: 'first_pass', error: message });
    emitter.emitStreamCancelled(friendlyMsg || 'AI service error. Please retry.');
    await persistAssistantTurn({
      userId,
      sessionId,
      content: friendlyMsg || 'AI service error. Please retry.',
      isGuest,
      hidden: args.hidden,
      metadata: { v: 'v2', status: 'failed', stage: 'first_pass', error: message },
    });
    // Mark the replay buffer as 'done' — otherwise clients reconnecting via
    // `agent:chat:replay` will see status='running' and re-enter the spinner.
    finishChatReplayBuffer(sessionId);
    return { status: 'failed', finalContent: '', sources: [] };
  }

  if (abortController.signal.aborted) {
    trace.close({ type: 'end', status: 'cancelled', stage: 'after_first_pass' });
    emitter.emitStreamCancelled('user_stop');
    await persistAssistantTurn({
      userId,
      sessionId,
      content: firstPass.narration,
      isGuest,
      hidden: args.hidden,
      metadata: { v: 'v2', status: 'cancelled', stage: 'after_first_pass' },
    });
    finishChatReplayBuffer(sessionId);
    return { status: 'cancelled', finalContent: firstPass.narration, sources: [] };
  }

  trace.write({
    type: 'first_pass_done',
    narrationLen: firstPass.narration.length,
    toolCalls: firstPass.toolCalls.map((tc) => ({ name: tc.name, argsLen: tc.arguments.length })),
  });

  // Safety net: if the routing LLM emitted tool_calls with ZERO narration text
  // (DeepSeek-V3 sometimes does this on short English queries, even though the
  // system prompt says narration is mandatory), inject a generic placeholder so
  // the user doesn't stare at an empty bubble while tools run for 30s+. We
  // detect the user's language from their message and pick a matching string.
  if (firstPass.toolCalls.length > 0 && firstPass.narration.trim().length === 0) {
    const isZhUser = /[一-鿿]/.test(userContent || '');
    const fallback = isZhUser
      ? '我来帮你研究一下，先调用工具收集最新数据。'
      : "Let me dig into this — pulling the latest data now.";
    firstPass.narration = fallback;
    emitToUser('agent:chat:narration', { sessionId, delta: fallback });
    console.log(`[superAgentV2] narration fallback injected (lang=${isZhUser ? 'zh' : 'en'}, ${fallback.length} chars)`);
  }

  // ── Hallucination guard: catch the "no tools but wrote a detailed asset
  //    analysis from training data" failure mode. Symptoms:
  //      - tool_calls.length === 0
  //      - narration is long (> 200 chars) AND contains specific market
  //        numbers (prices like $0.0000102, percent like +210%, etc)
  //      - user's question references a tradable asset
  //
  //    This happens when multi-turn history poisoning makes the routing
  //    LLM think "I already have enough crypto context, I'll just answer".
  //    The numbers it generates are pure hallucination from training data.
  //
  //    Recovery: retry the first pass with an EMPHATIC system message
  //    appended telling the model it MUST call tools for this asset query.
  const looksLikeAssetQuery = (q: string): boolean => {
    if (!q) return false;
    // Detect any 6-digit A-share ticker, US ticker (1-5 caps), HK 4-5 digit,
    // common crypto symbols, or Chinese asset keywords. Loose but covers the
    // typical case where we should have called tools.
    if (/\b(BTC|ETH|SOL|SAHARA|PEPE|HYPE|DOGE|SHIB|ADA|XRP|BNB|LINK|MATIC|TRX|AVAX|DOT|LTC|UNI|ATOM|TON|NEAR|APT|ARB|OP|SUI|TIA|JTO|WIF|INJ|SEI|RUNE|FIL|MKR|AAVE|COMP|SNX|CRV|LDO|RPL|BLUR|JUP)\b/i.test(q)) return true;
    if (/\b[A-Z]{2,5}(\.HK|\.SS|\.SH|\.SZ|\.US)?\b/.test(q) && !/^(I|AM|PM|HK|US)$/.test(q.trim())) return true;
    if (/\b\d{6}(\.(SH|SZ))?\b/.test(q)) return true;
    if (/\b\d{4,5}(\.HK)?\b/.test(q)) return true;
    if (/(股票|股价|币|代币|开多|开空|抄底|追涨|加仓|减仓|建仓|套牢|多头|空头|memecoin|altcoin|stablecoin)/i.test(q)) return true;
    return false;
  };
  const looksFabricated = (text: string): boolean => {
    // Lowered from 200 → 100 chars: real-world hallucinations as short as
    // 195 chars were slipping through (e.g. "SOL 站稳 $140 可试多 / 止损 $135
    // / 资金费率 -0.000018 / 置信度 55%" — 5 fabricated numbers in 195 chars).
    if (!text || text.length < 100) return false;
    let signals = 0;
    // Specific prices / numbers
    if (/\$[0-9]+(\.[0-9]+)?[KMB]?/.test(text)) signals++;
    if (/\$0\.0+\d/.test(text)) signals++;  // crypto sub-cent prices
    if (/[+\-]\d+(\.\d+)?%/.test(text)) signals++;  // percent changes
    if (/RSI\s*\(?14\)?[:：\s]*\d/.test(text)) signals++;
    if (/资金费率|funding rate/i.test(text) && /\d+\.?\d*%/.test(text)) signals++;
    if (/(持币地址|holders?|未平仓|open interest)/i.test(text) && /\d/.test(text)) signals++;
    return signals >= 2;
  };

  const hallucinationDetected =
    firstPass.toolCalls.length === 0 &&
    firstPass.narration.length > 100 &&
    looksLikeAssetQuery(userContent) &&
    looksFabricated(firstPass.narration);

  if (hallucinationDetected) {
    console.warn(
      `[superAgentV2] hallucination guard triggered: tools=0 but query="${userContent.slice(0, 60)}" + narration_len=${firstPass.narration.length} contains asset numbers. Retrying with stricter prompt.`,
    );
    trace.write({
      type: 'hallucination_guard',
      reason: 'no_tools_but_asset_analysis',
      narrationLen: firstPass.narration.length,
    });
    // Wipe the bad narration on the client side BEFORE retrying so the user
    // doesn't briefly see the fabricated answer.
    emitToUser('agent:chat:narration_reset', { sessionId });
    // Build a stricter retry. Append a hard user-side message that overrides
    // history-driven inertia and tells the model "TOOLS, NOW".
    const isZhUser = /[一-鿿]/.test(userContent || '');
    const stricterMessages = [
      ...messages,
      {
        role: 'assistant',
        content: firstPass.narration,
      },
      {
        role: 'user',
        content: isZhUser
          ? `[系统强制]你刚才的回复违反了规则——你写出了具体的市场数据（价格 / 涨跌幅 / RSI / 资金费率 等），但你**完全没有调用任何工具**。这意味着那些数字是你从训练数据里编出来的，是 hallucination，会严重误导用户。\n\n现在请按以下步骤重做：(1) 不要再凭记忆写任何具体数字；(2) 立即调用 \`web3_token_analysis\`（如果是加密货币）或 \`stock_analysis\`（如果是股票）+ \`web_research\` 来获取真实当前数据；(3) 等工具返回后再写最终报告。\n\n用户的原始问题是："${userContent}"。请只输出"我马上重新查询"作为 narration，然后立即 emit tool_calls，不要再凭记忆写分析。`
          : `[SYSTEM FORCED] Your previous response violated rules — you wrote specific market data (prices / percent changes / RSI / funding rates / etc.) WITHOUT calling any tools. Those numbers are hallucinated from training data and will severely mislead the user.\n\nRedo as follows: (1) Do NOT write any specific numbers from memory; (2) Immediately call \`web3_token_analysis\` (for crypto) or \`stock_analysis\` (for stocks) + \`web_research\` to get real current data; (3) Wait for tool results before writing the final report.\n\nUser's original question: "${userContent}". Output only "Let me re-query right now" as narration, then immediately emit tool_calls.`,
      },
    ];
    try {
      const retry = await aiService.chatStreamWithTools({
        messages: stricterMessages,
        tools,
        maxTokens: 1024,
        modelOverride: firstPassModelOverride,
        onTextChunk: (delta) => {
          if (abortController.signal.aborted) return;
          emitToUser('agent:chat:narration', { sessionId, delta });
        },
        abortSignal: abortController.signal,
      });
      if (retry.toolCalls.length > 0) {
        console.log(
          `[superAgentV2] hallucination retry succeeded: tools=[${retry.toolCalls.map((t) => t.name).join(', ')}]`,
        );
        firstPass = retry;
      } else {
        console.warn(
          `[superAgentV2] hallucination retry STILL produced no tools (narration_len=${retry.narration.length}). Falling back to original output.`,
        );
        // Keep the original output — at least the user gets something. The
        // hallucination guard already logged the warning for ops to inspect.
      }
    } catch (err) {
      console.error(
        `[superAgentV2] hallucination retry failed: ${(err as Error).message}. Keeping original output.`,
      );
    }
  }

  emitter.emitModule('route', 'completed', { tools: firstPass.toolCalls.map((t) => t.name) });

  // ── 3. If no tools requested...
  //    Two sub-cases:
  //    (a) Pure text + no tools → greeting / platform Q&A. Narration IS the answer.
  //    (b) Image + no tools     → user wants vision-only analysis (architecture
  //                                diagram, quote, code, etc). Narration alone is
  //                                NOT the answer — first-pass max_tokens=1024
  //                                would truncate it (finish_reason=length). We
  //                                fall through to synthesis with the image
  //                                attached and the full 16k token budget.
  if (firstPass.toolCalls.length === 0 && !hasImages) {
    if (firstPass.narration) {
      appendChatReplayContent(sessionId, firstPass.narration);
      emitter.emitProgress(firstPass.narration);
    }
    await persistAssistantTurn({
      userId,
      sessionId,
      content: firstPass.narration,
      isGuest,
      hidden: args.hidden,
      metadata: { v: 'v2', status: 'completed', stage: 'no_tools' },
    });
    emitter.emitModule('done', 'completed', {});
    emitter.emitStreamDone(firstPass.narration);
    finishChatReplayBuffer(sessionId);
    trace.close({ type: 'end', status: 'success', stage: 'no_tools', answerLen: firstPass.narration.length });
    return {
      status: 'completed',
      finalContent: firstPass.narration,
      sources: [],
      toolCallsCount: 0,
      routingNarrationLen: firstPass.narration.length,
    };
  }

  // ── 4. Execute all tool calls in parallel.
  const toolCtx: ToolExecutionContext = {
    userId,
    sessionId,
    socket,
    isGuest,
    abortSignal: abortController.signal,
    emitToUser,
    emitter,
    domain: args.domain,
    assetHint: args.assetHint,
  };

  const toolStartedAt = Date.now();
  const toolResults: Array<{ id: string; name: string; result: ToolResult }> = await Promise.all(
    firstPass.toolCalls.map(async (tc) => {
      const argsObj = safeJsonParse(tc.arguments || '{}');
      trace.write({ type: 'tool_call_start', name: tc.name, args: argsObj });
      const result = await registry.execute(tc.name, argsObj, toolCtx);
      trace.write({
        type: 'tool_call_done',
        name: tc.name,
        ok: result.ok,
        durationMs: result.durationMs,
        contentLen: result.content.length,
        sourcesCount: (result.sources || []).length,
        error: result.error,
      });
      return { id: tc.id, name: tc.name, result };
    }),
  );
  // Freeze the tools-phase duration BEFORE the synthesis LLM call. v1 ships
  // this exact field as `toolsPhaseDurationS` and the SuperAgentChat trigger
  // pill prefers it over `done.duration` for the "Done · X tools · Y sources
  // · Zs" badge. If we measured at persist-time (after synthesis) the figure
  // would balloon by 30-90s of LLM streaming and disagree with the live
  // pill (which freezes the moment synthesis starts).
  const toolsPhaseDurationS = Math.round((Date.now() - toolStartedAt) / 1000);
  console.log(
    `[superAgentV2] tools_done elapsed_ms=${Date.now() - toolStartedAt} ` +
      toolResults
        .map((r) => {
          // Surface load_skill's chosen skill name in the summary line so
          // we can verify which methodology the LLM pulled.
          let suffix = '';
          if (r.name === 'load_skill') {
            const argsObj = safeJsonParse(
              firstPass.toolCalls.find((tc) => tc.id === r.id)?.arguments || '{}',
            );
            const skillName = String((argsObj as any).name || 'unknown');
            suffix = `[${skillName}]`;
          }
          return `${r.name}${suffix}=${r.result.ok ? 'ok' : 'fail'}(${r.result.durationMs}ms)`;
        })
        .join(', '),
  );

  if (abortController.signal.aborted) {
    trace.close({ type: 'end', status: 'cancelled', stage: 'after_tools' });
    emitter.emitStreamCancelled('user_stop');
    await persistAssistantTurn({
      userId,
      sessionId,
      content: firstPass.narration,
      isGuest,
      hidden: args.hidden,
      metadata: {
        v: 'v2',
        status: 'cancelled',
        stage: 'after_tools',
        tools: toolResults.map((r) => ({ name: r.name, ok: r.result.ok, ms: r.result.durationMs })),
      },
    });
    finishChatReplayBuffer(sessionId);
    return { status: 'cancelled', finalContent: firstPass.narration, sources: [] };
  }

  // Aggregate sources + artifacts surfaced to the final UI footer.
  const allSources: SignalSearchSource[] = [];
  let collectedTokenCard: unknown = undefined;
  let collectedQuoteCard: unknown = undefined;
  for (const r of toolResults) {
    if (r.result.sources) allSources.push(...r.result.sources);
    if (r.result.artifacts && (r.result.artifacts as any).tokenCard) {
      collectedTokenCard = (r.result.artifacts as any).tokenCard;
    }
    if (r.result.artifacts && (r.result.artifacts as any).quoteCard) {
      collectedQuoteCard = (r.result.artifacts as any).quoteCard;
    }
  }
  // Dedupe by url (or domain+title fallback). Drop entries that lack the
  // three fields the frontend needs (favicon/title/domain) — those would
  // crash the SuperAgentChat renderer at the source-pill `.slice()` call.
  const seen = new Set<string>();
  const dedupedSources = allSources.filter((s) => {
    if (!s || (!s.favicon && !s.domain)) return false;
    const key = s.url || `${s.domain}::${s.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── 5. Second pass: synthesis. Pick a domain-specific prompt based on
  //    which tools fired (crypto / trader / research / simulate / general).
  //    Each prompt produces sharper, more on-target output than a single
  //    generic one and uses the exact follow-up section format the frontend
  //    regex expects (so they render as clickable pills, not plain bullets).
  const promptKind = pickSynthesisPromptKind(toolResults.map((r) => r.name));
  const synthesisSystemPrompt = buildSynthesisPromptForKind(promptKind);
  console.log(`[superAgentV2] synthesis prompt kind=${promptKind}`);
  trace.write({ type: 'synthesis_start', promptKind, toolsPhaseDurationS });

  // ── Build synthesis message as ONE big user message (v1-style).
  //   v1 packs the cryptoMemoPrompt + user question + full context into a
  //   single user message and gets noticeably richer output. The OpenAI
  //   `role: tool` protocol works but DeepSeek treats those as "reference
  //   material" rather than "must-read context", producing shorter reports.
  //   By dumping the same data into the user message we recover the v1
  //   density without abandoning function calling on the first pass.
  // Use neutral section headings so the synthesis LLM doesn't mistakenly
  // cite the TOOL NAME as a data source. e.g. previously "### web3_token_analysis"
  // would get attributed verbatim as "(数据来源：web3_token_analysis)" — but
  // those are internal tool names, not real sources. Real sources live INSIDE
  // each block (OKX / CoinGecko / x.com/handle / domain.com). The LLM now
  // sees opaque labels and is forced to look for actual citations.
  const toolHeadingMap: Record<string, string> = {
    web3_token_analysis: 'Crypto market data (CoinGecko / OKX / on-chain)',
    web_research: 'Social + web research (X / news sites / blog posts)',
    stock_analysis: 'Equity research data (technical + fundamental)',
    portfolio_simulate: 'Portfolio simulation results',
    load_skill: 'Methodology / framework reference',
    financial_report: 'A-share earnings (同花顺财务摘要 / 东方财富业绩预告)',
    sec_filings: 'US SEC EDGAR official filings (10-K / 10-Q / 8-K / Form 4 / 13F)',
    hsgt_flow: 'HK Stock Connect capital flow (北向 / 南向 / 4-channel snapshot)',
  };
  const contextString = toolResults
    .map((r, i) => {
      const friendly = toolHeadingMap[r.name] || r.name;
      const heading = `### Block ${i + 1}: ${friendly}` + (r.result.ok ? '' : ` (FAILED: ${r.result.error || 'unknown'})`);
      return `${heading}\n\n${r.result.content || ''}`;
    })
    .join('\n\n---\n\n');

  const historyContext = recent
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-4)
    .map((m) => `[${m.role === 'user' ? 'User' : 'Assistant'}]: ${(m.content || '').slice(0, 400)}`)
    .join('\n');

  // Today's date — anchor "as of" / "数据时点" / "this week" references so the
  // synthesis model doesn't fall back to a stale date from news article text
  // (e.g. citing an April 15 article and stamping the QuoteCard "2026-04-15"
  // when today is actually May 11). The realtime quote tool's output is fresh;
  // the model just needs to know the wall-clock date.
  const todayDate = new Date();
  const todayIso = todayDate.toISOString().slice(0, 10);
  const todayZh = `${todayDate.getFullYear()}年${todayDate.getMonth() + 1}月${todayDate.getDate()}日`;

  const packedSynthesisPrompt =
    `${synthesisSystemPrompt}\n\n` +
    `=== CURRENT DATE ===\n\n` +
    `Today is ${todayIso} (${todayZh}). Anchor every "as of" / "数据时点" / "today" / "this week" reference to THIS date. Do NOT pull dates from news article text in the Context block for the QuoteCard's As-of field — those are publication dates of articles, not the trading day you're reporting on.\n\n` +
    `=== INPUT ===\n\n` +
    `User question: ${userContent}\n\n` +
    (historyContext ? `Recent conversation:\n${historyContext}\n\n` : '') +
    `Context (raw research from tools — every datum below is fair game; cite specific numbers; if a claim's number is missing, write "(no data)" rather than fabricating):\n\n` +
    `${contextString}\n\n` +
    `=== OUTPUT REQUIREMENTS ===\n\n` +
    `Write the analysis NOW, in the user's language. Be thorough — hit the higher end of the word budget (use the full 1500-2000 words for deep questions, not the lower bound). The user is paying for depth, NOT a summary.\n\n` +
    `MUST INCLUDE:\n` +
    `- 4-6 ## sections (the structure-rules above describe what; you invent the wording).\n` +
    `- At least 5 distinct numerical citations from the Context block, each with (source) attribution.\n` +
    `- A markdown table for any numerical comparison (price/funding/OI/RSI vs peer or vs history).\n` +
    `- The follow-up section EXACTLY in the format specified (bold heading + 4-6 questions ending with ? or ？).\n\n` +

    `=== MARKDOWN FORMATTING (STRICT) ===\n` +
    `- Every # / ## / ### heading goes on its OWN line, with a blank line BEFORE and AFTER it.\n` +
    `- Every --- horizontal rule on its OWN line, blank line before and after.\n` +
    `- Every table preceded and followed by a blank line. Header row, separator row, then data rows.\n` +
    `- Every bulleted list preceded by a blank line.\n` +
    `- NEVER write headings or dividers inline like "...some text. ## heading more text..." — renderers will treat the # as literal characters and the layout will collapse.\n` +
    `- Use a blank line between paragraphs.\n` +
    `- The first line of your reply should NOT be a heading; lead with a short summary sentence or two.\n` +
    `- **NO emojis in headings or section titles.** Plain text headings only — \`## 整体分层架构解读\` is correct; \`## 🏗️ 整体分层架构解读\` or \`## 🔵 第一层\` is WRONG. Emojis in headings look unprofessional and clutter the table of contents.\n` +
    `- Emojis are fine sparingly inside body prose (e.g., a single ✓ in a bullet) but NEVER in heading text.\n\n` +

    `=== CITATION RULES (STRICT) ===\n` +
    `1. NEVER cite internal block labels like "Block 1", "Block 2", "web3_token_analysis", "web_research", "stock_analysis", or any tool name as a source. Those are internal organizers, NOT publishable sources.\n` +
    `2. Real sources are ONE OF:\n` +
    `   - A data provider name: OKX, CoinGecko, Binance, Exa, Bird\n` +
    `   - A website domain: coindesk.com, coingecko.com, aibc.world, etc.\n` +
    `   - An X/Twitter handle with full URL: [@username](https://x.com/username/status/...)\n` +
    `3. EVERY inline citation MUST be a markdown link \`[Display Name](https://real-url)\`. The URL MUST appear verbatim somewhere in the Context block above — copy/paste it. NEVER invent URLs (no example.com, no placeholder.com).\n` +
    `4. If you have a fact but no URL for it, write the fact WITHOUT a citation — do NOT write empty parens like "(数据来源：)" or "(source: )" or a plain-text placeholder. Empty parens or bare-text sources look broken in the UI.\n` +
    `5. CRITICAL — don't wrap a markdown link in parens-with-prefix: do \`Fact. [CoinDesk](url).\` NOT \`Fact (来源：[CoinDesk](url)).\` — the latter renders as empty "(来源：)" + standalone pill, which looks broken.\n` +
    `6. Acceptable inline formats:\n` +
    `   - "BTC funding 0.005%/8h ([OKX](https://...))"\n` +
    `   - "Whale accumulation reached 1.23M BTC, the largest since 2013 [CoinDesk](https://...)"\n` +
    `   - "@trader_x called for $90K target ([@trader_x](https://x.com/trader_x/status/...))"\n` +
    `7. UNACCEPTABLE — these will look broken in UI:\n` +
    `   - "(数据来源：web3_token_analysis)" — tool name as source\n` +
    `   - "(来源：)" with nothing after — empty parens\n` +
    `   - "(数据来源：CoinGecko)" — bare text, no URL → no pill rendered\n` +
    `   - "(source: 衍生品数据)" — generic placeholder, not a real source`;

  // If the original turn included image(s), forward them to the synthesis
  // pass too. Otherwise the synthesis LLM only sees the text-packed context
  // and tool results, and questions like "what did this person say?" become
  // unanswerable ("you didn't attach any tweet/screenshot…") even though the
  // first pass already read the image and ran the right tools.
  const synthesisUserContent: unknown = hasImages
    ? [
        { type: 'text', text: packedSynthesisPrompt },
        ...args.images!.map((img) => ({
          type: 'image_url',
          image_url: { url: img.url },
        })),
      ]
    : packedSynthesisPrompt;

  const synthesisMessages: Array<Record<string, unknown>> = [
    { role: 'user', content: synthesisUserContent },
  ];

  emitter.emitModule('synthesis', 'active', {});
  let synthFullContent = '';
  try {
    // Use the dedicated synthesis model (defaults to LOKA_AI_SYNTHESIS_MODEL,
    // typically claude-sonnet-4-6) instead of the routing/first-pass model
    // (deepseek-v3). Claude produces denser, better-structured analysis at
    // the same prompt; this single model swap is the biggest factor in
    // matching v1's report quality.
    const synthesisModelOverride = config.lokaAi.synthesisModel || undefined;
    const synth = await aiService.chatStreamWithTools({
      messages: synthesisMessages,
      // Empty tools list disables further function calls — second pass is text-only.
      tools: [],
      // Bumped to 16k to accommodate the 1500-2000 word reports allowed by
      // the new word-budget rules + <details> raw-data appendix.
      maxTokens: 16384,
      modelOverride: synthesisModelOverride,
      onTextChunk: (delta) => {
        if (abortController.signal.aborted) return;
        synthFullContent += delta;
        appendChatReplayContent(sessionId, delta);
        emitter.emitProgress(delta);
      },
      abortSignal: abortController.signal,
    });
    if (!synthFullContent && synth.narration) {
      synthFullContent = synth.narration;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[superAgentV2] synthesis failed:', message);
    // Prefer the friendly user-facing message (set on UpstreamUnavailableError)
    // when surfaced via fetchWithRetry. Otherwise show a generic notice.
    const friendlyMsg =
      (err as any)?.userFacingMessage ||
      (err as any)?.userMessage ||
      'AI synthesis temporarily unavailable. Showing raw tool results below.';
    // Fallback: surface tool results raw so the user gets *something*, with
    // a clean banner instead of a stack-trace dump.
    synthFullContent =
      `> ⚠️ ${friendlyMsg}\n\n---\n\n` +
      toolResults
        .map((r) => `### ${r.name}\n\n${r.result.content || `(${r.result.error || 'no output'})`}`)
        .join('\n\n---\n\n');
    emitter.emitProgress(synthFullContent);
  }

  emitter.emitModule('synthesis', 'completed', {});

  if (abortController.signal.aborted) {
    trace.close({ type: 'end', status: 'cancelled', stage: 'during_synthesis', partialAnswerLen: synthFullContent.length });
    emitter.emitStreamCancelled('user_stop');
    // Persist the PARTIAL stream content the user already saw on screen.
    // Without this, the assistant bubble vanishes on refresh and the user
    // is left with their question but no trace of the half-answer.
    await persistAssistantTurn({
      userId,
      sessionId,
      content: synthFullContent,
      isGuest,
      hidden: args.hidden,
      metadata: {
        v: 'v2',
        status: 'cancelled',
        stage: 'during_synthesis',
        partial: true,
        tools: toolResults.map((r) => ({ name: r.name, ok: r.result.ok, ms: r.result.durationMs })),
        sources: dedupedSources,
      },
    });
    finishChatReplayBuffer(sessionId);
    return { status: 'cancelled', finalContent: synthFullContent, sources: dedupedSources };
  }

  // ── 6. Persist + finalise.
  // Safety net for the image+no-tools doubling bug: when there are images and
  // zero tool calls, the first-pass model sometimes ignores the "narration
  // must be short" rule and writes a FULL 1500-char analysis in the narration
  // slot. Synthesis then ALSO writes a full analysis (also seeing the image),
  // and naive concatenation produces a duplicated response. If narration is
  // suspiciously long (> 200 chars) and we have synthesis content, drop the
  // narration from the final content — the synthesis version is authoritative.
  // (We still streamed the narration live, so the user saw an instant preview;
  // we just don't persist the duplicated text.)
  const narrationLooksOversized = firstPass.narration.length > 200;
  const droppedDuplicatedNarration =
    hasImages && firstPass.toolCalls.length === 0 && narrationLooksOversized && synthFullContent.length > 0;
  if (droppedDuplicatedNarration) {
    console.log(
      `[superAgentV2] dropping oversized first-pass narration (${firstPass.narration.length} chars) to avoid duplication with synthesis (${synthFullContent.length} chars)`,
    );
  }
  const finalContent = droppedDuplicatedNarration
    ? synthFullContent.trim()
    : `${firstPass.narration}\n\n${synthFullContent}`.trim();

  // Build the thinkingFlow.modules array the SuperAgentChat UI uses to render
  // the "Done · X tools · Y sources · Zs" header and the Process panel.
  // Crucially: ThinkingInlineTrigger.toolsCount counts web3 *stages* and adds
  // +1 per search/analysis/simulation module — so we must pass the full
  // stages array on the web3 module's data, otherwise the count drops to 1.
  const flowModules: Array<{ type: string; status: string; data?: Record<string, unknown> }> = [
    { type: 'route', status: 'completed', data: { tools: toolResults.map((r) => r.name) } },
  ];

  // Combine all web3_token_analysis results into ONE 'web3' flowModule entry
  // (with stages concatenated). The frontend `onModule` dedupes by moduleType
  // string, so two web3 entries here would never both render — and worse, the
  // live "X tools" count would disagree with the persisted count on reload.
  // Backend tags each tool instance's stages with a unique prefix, so dedup
  // by stage ID is safe and preserves both calls' work.
  const web3Results = toolResults.filter((r) => r.name === 'web3_token_analysis');
  if (web3Results.length > 0) {
    const combinedStages: unknown[] = [];
    const seenStageIds = new Set<string>();
    let totalMs = 0;
    for (const r of web3Results) {
      const stages = ((r.result.artifacts as any)?.web3Stages || []) as Array<{
        stage?: string;
        dedupKey?: string;
      }>;
      for (const s of stages) {
        if (!s) continue;
        const key = typeof s.dedupKey === 'string' ? s.dedupKey : typeof s.stage === 'string' ? s.stage : null;
        if (key && !seenStageIds.has(key)) {
          seenStageIds.add(key);
          combinedStages.push(s);
        }
      }
      totalMs += r.result.durationMs || 0;
    }
    flowModules.push({
      type: 'web3',
      status: 'completed',
      data: {
        variant: 'coingecko_mcp',
        label: 'CoinGecko MCP',
        stages: combinedStages,
        ms: totalMs,
      },
    });
  }

  for (const r of toolResults) {
    if (r.name === 'web3_token_analysis') {
      // Already handled above as a single combined entry — skip the per-result
      // push here so we don't double-count.
      continue;
    } else if (r.name === 'web_research') {
      flowModules.push({
        type: 'search',
        status: 'completed',
        data: {
          variant: 'web_x',
          label: 'Web + X research',
          sources: r.result.sources || [],
          ms: r.result.durationMs,
        },
      });
    } else if (r.name === 'stock_analysis') {
      flowModules.push({
        type: 'analysis',
        status: 'completed',
        data: { ms: r.result.durationMs, ok: r.result.ok },
      });
    } else if (r.name === 'portfolio_simulate') {
      flowModules.push({
        type: 'simulation',
        status: 'completed',
        data: { ms: r.result.durationMs, ok: r.result.ok },
      });
    } else {
      flowModules.push({
        type: r.name,
        status: 'completed',
        data: { ms: r.result.durationMs, ok: r.result.ok },
      });
    }
  }
  flowModules.push({ type: 'synthesis', status: 'completed' });
  flowModules.push({
    type: 'done',
    status: 'completed',
    // Fallback duration for ancient replays — same value as the toolsPhase
    // figure so the trigger pill stays consistent regardless of which
    // priority branch picks it up.
    data: { duration: toolsPhaseDurationS },
  });

  await persistAssistantTurn({
    userId,
    sessionId,
    content: finalContent,
    isGuest,
    hidden: args.hidden,
    metadata: {
      v: 'v2',
      status: 'completed',
      thinkingFlow: {
        modules: flowModules,
        isActive: false,
        route: 'Super Agent (v2)',
        // tools-only duration (frozen before synthesis), matching v1.
        toolsPhaseDurationS,
      },
      tools: toolResults.map((r) => ({ name: r.name, ok: r.result.ok, ms: r.result.durationMs })),
      sources: dedupedSources,
      ...(collectedTokenCard ? { tokenCard: collectedTokenCard } : {}),
      ...(collectedQuoteCard ? { quoteCard: collectedQuoteCard } : {}),
    },
  });

  // `done.duration` is the FALLBACK time field for old sessions that lack
  // toolsPhaseDurationS. Send the same tools-phase value so older replays
  // and the current pill agree. (v1 sends total run time here, but for v2
  // we want the trigger pill to show identical numbers live and on reload.)
  emitter.emitModule('done', 'completed', { duration: toolsPhaseDurationS });
  emitter.emitStreamDone(finalContent, { sources: dedupedSources });

  trace.close({
    type: 'end',
    status: 'success',
    stage: 'completed',
    answerLen: finalContent.length,
    sourcesCount: dedupedSources.length,
    toolsPhaseDurationS,
    promptKind,
  });

  // ── Phase 2.1.5 post-turn profile update.
  // Fire-and-forget background extraction so it never blocks the user — the
  // response is already streamed by now. Errors are swallowed inside the
  // service and logged.
  if (!isGuest && userId) {
    void updateProfileFromTurn(
      userId,
      userContent,
      toolResults.map((r) => r.name),
    );
  }
  finishChatReplayBuffer(sessionId);

  return {
    status: 'completed',
    finalContent,
    sources: dedupedSources,
    toolCallsCount: firstPass.toolCalls.length,
    routingNarrationLen: firstPass.narration.length,
  };
}
