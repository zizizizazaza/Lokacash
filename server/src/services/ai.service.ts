import { config } from '../config.js';
import { CRYPTO_SYMBOLS_FOR_PROMPT } from '../constants/cryptoAssets.js';

export function getGlobalTimeContext(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'long',
    hour: '2-digit', minute: '2-digit',
    timeZoneName: 'short'
  });
  const formattedTime = formatter.format(now);
  return `\n\n<SYSTEM_OVERRIDE_REALITY_ANCHOR>\n[VERIFIED_SYSTEM_CLOCK]: ${formattedTime}\n\nATTENTION: The above is the absolute, system-injected true present time. You are strictly prohibited from adopting any historical timeline (e.g., 2024 or 2025) as the current context.\nWhen analyzing predictions, odds, or market data for future events (e.g., the 2028 US Election, future interest rate cuts), you MUST evaluate them from the vantage point of the specific [VERIFIED_SYSTEM_CLOCK] above. Treat anything prior to this exact timestamp as immutable history. Do not use past years in titles or summaries as if they are the present.\n</SYSTEM_OVERRIDE_REALITY_ANCHOR>\n\n`;
}

export interface ChatMessage {
  role: string;
  content: string;
  agentId?: string | null;
  images?: Array<{
    url: string;
    mime?: string;
    name?: string;
  }>;
}

export interface AIResponse {
  content: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

type OpenAIContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

const LOKA_SYSTEM_PROMPT = `You are Loka Agent — the research assistant for Loka, a multi-agent AI research platform for investors and research teams.

## Your Role
Help users research assets and topics, understand market signals, compare options, and navigate the platform. You are a research partner, not a trader or personalized financial advisor. Never tell a user what to buy or sell with certainty — frame directional takes as research perspectives.

## Product Overview
Loka lets users ask in natural language and get multi-agent AI analysis backed by live data. Coverage includes:
- Equities: US, HK, and A-shares — fundamentals, filings, technicals
- Crypto: BTC, ETH, SOL, and long-tail memecoins — on-chain data (CoinGecko, OKX spot + derivatives, funding, open interest)
- Macro and sectors: rates, regimes, cross-asset flows, industry trends
- News and sentiment: X/Twitter, aggregated crypto/finance news
- Competitive and general research: "compare Figma vs Sketch", "research this company", "evaluate a $5k position"
- Multi-agent debate for contested or high-stakes questions

## Chat Modes (user picks in the mode selector above the input box)
- Auto — default, unlimited. For simple questions you answer directly; for substantive research queries Auto semantically routes to Fast or Roundtable using the user's paid quota.
- Fast — single-agent analysis with search + on-chain + synthesis. ~1-2 min. Charges 1 Fast credit.
- Roundtable — multi-agent debate producing a deep research report. ~3-5 min. Charges 1 Roundtable credit. Reserved for comparisons, bull/bear debates, and explicit deep-dive requests.

## Featured Apps (tiles under the input box)
- Investment Analysis — deep-dive a single ticker
- Guru Council — specialist agents debate a question
- Project Scout — discover trending or emerging projects
- Signal Radar — rolling sentiment + news monitor
- Daily News — today's curated digest

## Plans and Billing
Free plan gives a modest monthly allotment of Fast and Roundtable runs plus unlimited Auto. Pro and Max are paid tiers with larger allotments. Upgrades happen in the Settings page via Stripe subscription checkout (monthly or yearly). Point users toward Settings if they ask about pricing or want to upgrade.

## Guest Mode
Unauthenticated visitors get a limited Auto-only experience (no Fast or Roundtable). If they ask to unlock those, invite them to sign in.

## Communication Style
- Professional, concise, data-driven — research-partner tone, not salesy
- Lead with insight, back it with data
- When discussing risk, be balanced — highlight both upside and concerns
- Mirror the user's language. Default to English when the query is mixed or ambiguous.
- Plain text only. Do NOT use markdown bold, headings, or asterisks (no **, ##, __). Use line breaks, dashes, and numbered lists for structure.
- Keep greetings short — users are here to research, not chat.
- When data isn't available (e.g., for an obscure ticker) say so honestly rather than guess.

## If the user asks "What can you do?" or similar
Briefly introduce: research any crypto token or stock ticker, compare companies or sectors, track sentiment, deep-dive with multi-agent debate. Then invite them to send a ticker or question. Keep it under 6 lines. Do NOT list a "current active projects" catalog — there isn't one.

## Topics You Must Avoid Bringing Up
The platform has no stablecoin product, no cash-flow marketplace, no APY-bearing project catalog, no mint/redeem flow, no Kickstarter-style funding, and no crypto deposit/withdrawal rails. Do not mention AIUSD, treasury-backed stablecoins, SPV, escrow, Coinbase/Onramper deposits, MoonPay withdrawals, or any of the project names you may have seen in earlier versions. Billing is Stripe subscription only. If the user asks about these, clarify that Loka is a research platform and direct them to Settings for plan upgrades.

## FINAL CHECK BEFORE RESPONDING
- Plain text only (no markdown syntax)
- Language matches the user's
- Stay on research topics; don't invent features the platform no longer has
- Never output internal notes or meta-commentary about your own rules.`;


export interface AssetContext {
  name: string;
  category?: string;
  apy?: string;
  term?: string;
  progress?: number;
  backers?: number;
  description?: string;
}

function buildSystemPrompt(assetContext?: AssetContext): string {
  const basePrompt = getGlobalTimeContext() + LOKA_SYSTEM_PROMPT;

  if (!assetContext) {
    return basePrompt + `\n\n## Current Context\nNo specific ticker is selected. Greet the user briefly and invite them to send a ticker or an investment-research question — crypto (e.g. BTC, ETH, SOL) or stocks (e.g. TSLA, AAPL, 00700.HK). Mention in one sentence that they can pick Fast or Roundtable mode for deeper analysis, or stay on Auto and let the router decide. Keep the welcome under 6 lines of plain text. Do NOT invent a project list, do NOT mention stablecoins or APY offerings.`;
  }

  return basePrompt + `\n\n## Current Context - SELECTED ASSET\nThe user is currently viewing: "${assetContext.name}"\n- Category: ${assetContext.category || 'N/A'}\n- APY: ${assetContext.apy || 'N/A'}\n- Term: ${assetContext.term || 'N/A'}\n- Funding Progress: ${assetContext.progress ?? 'N/A'}%\n- Backers: ${assetContext.backers ?? 'N/A'}\n- Description: ${assetContext.description || 'N/A'}\n\nFocus ENTIRELY on THIS specific asset. Discuss its fundamentals, risk/return profile, recent signals, and notable events. Stay on this asset unless the user clearly pivots to another topic.`;
}

function toApiContent(message: ChatMessage): string | OpenAIContentBlock[] {
  const images = (message.images || [])
    .map((img) => (typeof img?.url === 'string' ? img.url.trim() : ''))
    .filter((url) => url.length > 0);

  if (!images.length) {
    return message.content;
  }

  const blocks: OpenAIContentBlock[] = [];
  if (message.content.trim()) {
    blocks.push({ type: 'text', text: message.content });
  }
  for (const url of images) {
    blocks.push({ type: 'image_url', image_url: { url } });
  }
  return blocks;
}


export type QueryType = 'investment-analysis' | 'research' | 'market-brief' | 'guru-council' | 'general';

export interface OrchestratorPlan {
  isSimpleChat: boolean;
  queryType: QueryType;
  /** Text-only image understanding produced before routing/tools. */
  imageDigest?: string;
  capabilities: {
    analysis: { needed: boolean; tickers?: string[] };
    /** showXAccountProfile: true when the user wants research/analysis where Twitter/X is a primary lens (official @handle, project CT presence, founder account, "on X" due diligence). Omit or false for generic research where social is incidental. */
    search: { needed: boolean; query?: string; showXAccountProfile?: boolean };
    simulate: { needed: boolean; tickers?: string[] };
    /** CoinGecko MCP / Web3 on-chain & market data (crypto only, not equities). */
    web3: { needed: boolean; query?: string };
  };
}

/** When the router model returns `{}` / invalid JSON, avoid running synthesis with zero tools. */
function heuristicOrchestratorPatch(query: string): Partial<OrchestratorPlan> {
  const q = (query || '').trim();
  if (q.length < 2) return {};

  const lower = q.toLowerCase();
  const hasZh = /[\u4e00-\u9fff]/.test(q);

  const looksGreeting =
    /^(hi|hello|hey|yo|sup|gm|good\s+(morning|afternoon|evening))\b/i.test(lower) ||
    /^(你好|您好|嗨|哈喽|在吗|在么|早上好|下午好|晚上好)[\s!！?？。,，]*$/u.test(q.trim());

  if (looksGreeting && q.length <= 24) {
    return { isSimpleChat: true, queryType: 'general' };
  }

  const cryptoHints =
    /\b(btc|eth|sol|bnb|xrp|doge|usdt|usdc|defi|nft|gas|dex|token|airdrop|staking)\b/i.test(lower) ||
    /链上|钱包|合约|代币|加密|比特币|以太坊|nft|defi/i.test(q);
  const socialHints =
    /\b(x\b|twitter|tweet|reddit)\b/i.test(lower) ||
    /推特|微博|小红书|抖音|discord|telegram|论坛|社区|舆论|舆情|讨论|大家在说|都在说|怎么看|sentiment/i.test(q);
  const xPrimaryLens =
    /\b(twitter|tweet)\b/i.test(lower) ||
    /\bx\.com\b/i.test(lower) ||
    /推特|推文|微博客/i.test(q);

  const wantsSim =
    /模拟|仿真|沙盘|情景|假设|what\s+if|simulate|simulation|forecast|预测走势|走势预测/i.test(q);

  const searchQuery =
    socialHints && hasZh
      ? `${q} Twitter X sentiment discussion (translate to English search terms)`
      : hasZh
        ? `${q} (translate to concise English search query)`
        : q;

  const web3Query = hasZh ? `${q} (crypto token / on-chain market context)` : q;

  const caps: OrchestratorPlan['capabilities'] = {
    analysis: { needed: false },
    search: {
      needed: socialHints || !cryptoHints,
      query: searchQuery,
      showXAccountProfile: xPrimaryLens && (socialHints || !cryptoHints),
    },
    simulate: { needed: wantsSim, tickers: undefined },
    web3: { needed: cryptoHints, query: web3Query },
  };

  // If it's clearly crypto + social, prefer both pipelines.
  if (cryptoHints && socialHints) {
    caps.search = { needed: true, query: searchQuery, showXAccountProfile: xPrimaryLens };
    caps.web3 = { needed: true, query: web3Query };
  }

  return {
    isSimpleChat: false,
    queryType: 'research',
    capabilities: caps,
  };
}

function mergeOrchestratorPlan(base: OrchestratorPlan, patch: Partial<OrchestratorPlan>): OrchestratorPlan {
  const merged: OrchestratorPlan = {
    ...base,
    ...patch,
    capabilities: {
      analysis: { ...base.capabilities.analysis, ...(patch.capabilities?.analysis || {}) },
      search: { ...base.capabilities.search, ...(patch.capabilities?.search || {}) },
      simulate: { ...base.capabilities.simulate, ...(patch.capabilities?.simulate || {}) },
      web3: { ...base.capabilities.web3, ...(patch.capabilities?.web3 || {}) },
    },
  };

  // Rule from router prompt: simple chat must be general and all capabilities false.
  if (merged.isSimpleChat) {
    merged.queryType = 'general';
    merged.capabilities = {
      analysis: { needed: false },
      search: { needed: false },
      simulate: { needed: false },
      web3: { needed: false },
    };
  }

  return merged;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function tryParseJsonObjectLoose(raw: string): Record<string, unknown> | null {
  const text = (raw || '').trim();
  if (!text) return null;

  const directCandidates = [text];
  const fenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (fenced && fenced !== text) directCandidates.push(fenced);
  const extracted = extractFirstJsonObject(text);
  if (extracted && !directCandidates.includes(extracted)) directCandidates.push(extracted);

  for (const candidate of directCandidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // try repaired parse below
    }

    const repaired = candidate
      .replace(/^\uFEFF/, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/,\s*([}\]])/g, '$1')
      .trim();
    try {
      const parsed = JSON.parse(repaired);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // continue to next candidate
    }
  }

  return null;
}

export class LokaAIService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private imageDigestModel: string;

  constructor() {
    this.apiKey = config.lokaAi.apiKey;
    this.baseUrl = config.lokaAi.baseUrl;
    this.model = config.lokaAi.model;
    this.imageDigestModel = config.lokaAi.imageDigestModel || this.model;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.baseUrl);
  }

  async analyzeImagesForRouting(userText: string, images: ChatMessage['images'] = []): Promise<string> {
    const safeImages = Array.isArray(images) ? images.filter((img) => typeof img?.url === 'string' && img.url.trim()) : [];
    if (!this.isConfigured || safeImages.length === 0) return '';

    const isZh = /[\u4e00-\u9fff]/.test(userText || '');
    const digestPrompt = `You are a routing preprocessor for a multimodal research assistant.
Analyze the attached image(s) once and convert them into compact routing-friendly text.

Return JSON only:
{"imageDigest":"..."}

Rules:
- Write imageDigest in ${isZh ? 'Chinese' : 'English'}.
- Focus on concrete, decision-relevant facts only: visible entities, logos/brands, OCR text, chart/topic, scene, meme intent, and what the user is likely asking about.
- If the image is a screenshot/post, capture the main claim and any important text.
- If the image is noisy or ambiguous, say what is uncertain briefly.
- Keep it concise: 80-260 characters preferred, hard cap 500 characters.
- Do not include chain-of-thought.

User text:
${userText || '(empty)'}`;

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.imageDigestModel,
        messages: [
          {
            role: 'user',
            content: toApiContent({ role: 'user', content: digestPrompt, images: safeImages }),
          },
        ],
        max_tokens: 300,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Routing image digest failed (${response.status}): ${errorText.slice(0, 300)}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw = (data.choices?.[0]?.message?.content || '').trim();
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw) as { imageDigest?: string };
      return typeof parsed.imageDigest === 'string' ? parsed.imageDigest.trim().slice(0, 500) : '';
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return '';
      try {
        const parsed = JSON.parse(match[0]) as { imageDigest?: string };
        return typeof parsed.imageDigest === 'string' ? parsed.imageDigest.trim().slice(0, 500) : '';
      } catch {
        return '';
      }
    }
  }

  async chat(messages: ChatMessage[], agentId?: string, assetContext?: AssetContext, modelOverride?: string): Promise<AIResponse> {
    if (!this.isConfigured) {
      return {
        content: '🔧 Loka AI is not yet configured. Please set LOKA_AI_API_KEY and LOKA_AI_BASE_URL in the server .env file.',
        agentId: agentId || 'system',
      };
    }

    // Build message array with dynamic system prompt
    const apiMessages = [
      { role: 'system', content: buildSystemPrompt(assetContext) },
      ...messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: toApiContent(m),
      })),
    ];

    const selectedModel = modelOverride?.trim() || this.model;
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: apiMessages,
        max_tokens: 2048,
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI API error (${response.status}):`, errorText);
      throw new Error(`AI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string; role?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

    return {
      content,
      agentId: agentId || 'loka-agent',
    };
  }

  /** Streaming chat — returns a ReadableStream for SSE */
  async chatStream(messages: ChatMessage[], agentId?: string, assetContext?: AssetContext, maxTokens?: number, modelOverride?: string): Promise<ReadableStream<Uint8Array>> {
    if (!this.isConfigured) {
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          const msg = '🔧 Loka AI is not yet configured.';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: msg } }] })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
    }

    const apiMessages = [
      { role: 'system', content: buildSystemPrompt(assetContext) },
      ...messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: toApiContent(m),
      })),
    ];

    const selectedModel = modelOverride?.trim() || this.model;
    const requestBody = {
        model: selectedModel,
        messages: apiMessages,
        max_tokens: maxTokens || 2048,
        temperature: 0.5,
        stream: true,
      };
    console.log(`[AI chatStream] model=${selectedModel}, max_tokens=${requestBody.max_tokens}, messages=${apiMessages.length}, inputLen=${JSON.stringify(apiMessages).length}`);

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI chatStream] ERROR ${response.status}: ${errorText.slice(0, 500)}`);
      throw new Error(`AI API error (${response.status}): ${errorText}`);
    }

    console.log(`[AI chatStream] Response OK, status=${response.status}`);
    return response.body!;
  }

  /**
   * Intelligently routes queries acting as a Map-Reduce SuperAgent Orchestrator.
   * Understands what sub-agents are needed to satisfy a query in parallel.
   */
  async evaluateRouting(query: string): Promise<OrchestratorPlan> {
    if (!this.isConfigured) {
      return {
        isSimpleChat: true,
        queryType: 'general',
        capabilities: {
          analysis: { needed: false },
          search: { needed: false },
          simulate: { needed: false },
          web3: { needed: false },
        }
      };
    }

    const routerPrompt = `You are the Coordinator for a Super Agent. Your job is to analyze the user's query and decide which underlying specialist agents must be triggered in parallel, AND classify the query type for output template routing.
Output JSON only, no markdown.

JSON SCHEMA:
{
  "isSimpleChat": boolean, // True ONLY if the query is a greeting, basic platform Q&A, or simple chat (e.g., "hi", "how are you", "what can you do"). If it requires real world data, searching, or analysis, set false.
  "queryType": "investment-analysis" | "research" | "market-brief" | "guru-council" | "general",
  "capabilities": {
    "analysis": { "needed": boolean, "tickers": ["..."] }, // Stock/asset PRICE analysis tool. SET TRUE ONLY when the user wants quantitative financial data: stock price movements, technical indicators (K-line, MA, RSI), fundamental metrics (PE, PB, revenue), or explicit buy/sell/hold advice on a tradeable ticker. Requires valid tickers. Do NOT use for: market research, competitive landscape, industry analysis, business strategy questions, or general "what do people think" questions — those are search tasks.
    "search": { "needed": boolean, "query": "...", "showXAccountProfile": boolean }, // Deep Web/Social Search tool. SET TRUE for: market sentiment, news, public opinion, competitive analysis, industry research, market landscape questions, business strategy, macro context, or any question requiring recent real-world information. Provide a concise English search query. showXAccountProfile: TRUE when the user is doing project/company/account research where Twitter/X is a primary source of truth (official handle, startup social presence, "on X", CT/account narrative). FALSE when X is only incidental. If unsure and the topic is a named product/startup, prefer TRUE when they want social/on-X context.
    "simulate": { "needed": boolean, "tickers": ["..."] }, // AI Hedge Fund Simulation. SET TRUE ONLY when the user explicitly asks for a simulation, prediction, multi-investor debate, or "what if" scenarios (e.g., "Simulate Fed cuts on tech stocks", "What would Buffett do"). Extract tickers, or ["QQQ", "SPY"] if it's a broad market macro simulation.
    "web3": { "needed": boolean, "query": "..." } // Web3 / crypto data via CoinGecko MCP. SET TRUE when the user asks about cryptocurrency spot price, market cap, volume, token metadata, on-chain/DEX context, trending coins, NFT floor, gas, or crypto-only research. NOT for US stocks (AAPL) or traditional equities — use "analysis" for those. For "BTC price now" set web3 true and search false unless they also ask sentiment/news.
  }
}

QUERY TYPE CLASSIFICATION (decide in this order, first match wins):
1. "general" — greeting, chitchat, simple Q&A, translation, platform questions. Must have isSimpleChat=true.
2. "guru-council" — user explicitly names famous investors (Buffett/巴菲特, Dalio/达里奥, Lynch/林奇, Munger/芒格, Soros/索罗斯, etc.) AND asks to analyze a target from their perspective/framework. Just mentioning a name is NOT enough (e.g. "巴菲特最近买了什么" → research). Must be "evaluate X using their investment framework".
3. "investment-analysis" — buy/sell/hold decision on a specific tradeable asset with ticker. Questions about price targets, valuation, technical analysis, position sizing, entry/exit. The user wants a TRADE DECISION.
4. "market-brief" — time-sensitive market overview, multi-asset wrap-up, news digest. Keywords: today/今天/本周/market wrap/涨跌/财报日历/要闻/板块轮动. Focus is "what happened" not "deep analysis of one topic".
5. "research" — everything else that needs depth: industry research, competitive analysis, supply chain, business model comparison, startup due diligence, technology trends, non-tradeable company evaluation.

RULES:
1. "isSimpleChat": When true, ALL capabilities must be false AND queryType must be "general".
2. "analysis": Stock Analysis tool — for PRICE and FINANCIAL DATA queries only. Needs tradeable tickers. Questions about companies as businesses (competitive position, strategy, market share) are NOT analysis — they are search.
3. "search": Deep Web/Social Search — for ANY question needing real-world information: sentiment, news, market research, competitive landscape, industry trends, business analysis. Set search.showXAccountProfile=true when the intent is explicitly or strongly about understanding a project/brand/person *as seen on Twitter/X* (including any language).
4. "simulate": AI Hedge Fund Simulation — only when user asks for forecasting or simulating scenarios.
5. "web3": Crypto / on-chain market data (CoinGecko). Use for BTC/ETH/SOL price, altcoins, DeFi tokens, DEX, gas, NFT collections, trending crypto. Provide a concise English "query" echoing user intent (e.g. "current Bitcoin BTC spot price USD").
6. A user can trigger multiple!
8. **CRYPTO vs STOCK (CRITICAL)**: The following are known cryptocurrency tokens — NEVER put them in analysis.tickers. Always use web3 for them instead: ${CRYPTO_SYMBOLS_FOR_PROMPT}. Example: "analyze SOL risk-reward" → web3.needed=true, analysis.needed=false (SOL is Solana crypto, NOT a stock). "BNB price" → web3 only. "XRP buy or sell" → web3 only. Only set analysis.needed=true for traditional equities (AAPL, TSLA, NVDA, BABA, etc.). "分析苹果基本面，并且看看最近舆论" -> analysis (AAPL) + search (Apple sentiment). Both true.
7. **MULTI-TURN — LATEST MESSAGE ONLY (CRITICAL)**: If the input has 【Conversation Context】 plus 【Latest User Message】, you MUST set queryType and ALL capability fields (**analysis.tickers**, **search.query**, **simulate.tickers**, **web3.query**) from **【Latest User Message】 alone**. Use prior turns ONLY when the latest message clearly continues the same subject (e.g. "继续上面的", "same as before", "那它呢", "还是这个币"). If the user **switches** asset or topic (e.g. chat was about RAVE, latest asks about **hype / HYPE / 多空 / 开多开空** in crypto), **never** carry over old tickers or old entity names into this JSON — refresh everything for the new intent. Note: Chinese **"hype"** in trading context usually means **Hyperliquid (HYPE)**, not a prior unrelated token.

Examples:
Query: "hi, 你能干啥" -> {"isSimpleChat":true,"queryType":"general","capabilities":{"analysis":{"needed":false},"search":{"needed":false},"simulate":{"needed":false}}}
Query: "从巴菲特和达里奥的视角分析NVDA" -> {"isSimpleChat":false,"queryType":"guru-council","capabilities":{"analysis":{"needed":true,"tickers":["NVDA"]},"search":{"needed":true,"query":"Nvidia NVDA latest news fundamentals"},"simulate":{"needed":true,"tickers":["NVDA"]}}}
Query: "NVDA 值得买吗" -> {"isSimpleChat":false,"queryType":"investment-analysis","capabilities":{"analysis":{"needed":true,"tickers":["NVDA"]},"search":{"needed":true,"query":"Nvidia NVDA stock buy sell analysis"},"simulate":{"needed":false}}}
Query: "今天美股怎么样" -> {"isSimpleChat":false,"queryType":"market-brief","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"US stock market today summary top movers"},"simulate":{"needed":false}}}
Query: "今日加密市场要闻" -> {"isSimpleChat":false,"queryType":"market-brief","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"crypto market news today highlights"},"simulate":{"needed":false}}}
Query: "台积电CoWoS封装产能分配是否向NVDA倾斜" -> {"isSimpleChat":false,"queryType":"research","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"TSMC CoWoS packaging capacity allocation Nvidia"},"simulate":{"needed":false}}}
Query: "调研东南亚的外卖市场" -> {"isSimpleChat":false,"queryType":"research","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"Southeast Asian food delivery market competitive landscape","showXAccountProfile":false},"simulate":{"needed":false}}}
Query: "Evaluate Midjourney as an investment — team, revenue, growth" -> {"isSimpleChat":false,"queryType":"research","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"Midjourney AI company revenue team growth investment","showXAccountProfile":false},"simulate":{"needed":false}}}
Query: "Research Minara AI on X — who runs it and how big is their account" -> {"isSimpleChat":false,"queryType":"research","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"Minara AI Twitter X account followers team","showXAccountProfile":true},"simulate":{"needed":false}}}
Query: "分析一下推特上的 Minara AI 项目" -> {"isSimpleChat":false,"queryType":"research","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"Minara AI Twitter project analysis","showXAccountProfile":true},"simulate":{"needed":false}}}
Query: "深度分析一下阿里和腾讯的投资价值" -> {"isSimpleChat":false,"queryType":"investment-analysis","capabilities":{"analysis":{"needed":true,"tickers":["BABA","TCEHY"]},"search":{"needed":true,"query":"Alibaba Tencent investment value comparison"},"simulate":{"needed":false}}}
Query: "巴菲特最近买了什么股票" -> {"isSimpleChat":false,"queryType":"research","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"Warren Buffett recent stock purchases portfolio"},"simulate":{"needed":false}}}
Query: "模拟：如果第三季度降息50个基点对科技股有什么影响" -> {"isSimpleChat":false,"queryType":"investment-analysis","capabilities":{"analysis":{"needed":true,"tickers":["QQQ"]},"search":{"needed":true,"query":"Fed 50bps rate cut impact on tech sector"},"simulate":{"needed":true,"tickers":["QQQ"]}}}
Multi-turn: [User]: ...RAVE token... [Assistant]: ... [User]: "hype现在适合开多还是开空？" -> {"isSimpleChat":false,"queryType":"investment-analysis","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"Hyperliquid HYPE perpetual long short sentiment funding"},"simulate":{"needed":false},"web3":{"needed":true,"query":"Hyperliquid HYPE token price funding rate"}}}  // do NOT output RAVE from prior turn
Query: "Analyze the risk-reward of buying SOL at current price" -> {"isSimpleChat":false,"queryType":"investment-analysis","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"Solana SOL risk reward analysis current price"},"simulate":{"needed":false},"web3":{"needed":true,"query":"Solana SOL current price market cap risk reward"}}}  // SOL is crypto → web3 only, analysis=false

Query: "${query}"`;
    const compactRouterPrompt = `You are the routing coordinator for a Super Agent.
Return ONLY one valid JSON object (no markdown, no explanation) using this schema:
{
  "isSimpleChat": boolean,
  "queryType": "investment-analysis" | "research" | "market-brief" | "guru-council" | "general",
  "capabilities": {
    "analysis": { "needed": boolean, "tickers": ["..."] },
    "search": { "needed": boolean, "query": "...", "showXAccountProfile": boolean },
    "simulate": { "needed": boolean, "tickers": ["..."] },
    "web3": { "needed": boolean, "query": "..." }
  }
}

Rules:
- If greeting/chitchat/platform Q&A only: isSimpleChat=true, queryType="general", all capabilities false.
- analysis=true only for tradeable ticker investment analysis (price/valuation/buy-sell-hold).
- search=true for news/sentiment/research requiring real-world info. search.showXAccountProfile=true when the user wants on-X / Twitter-native context for a project or account (any language).
- simulate=true only for explicit simulation/what-if/debate requests.
- web3=true only for crypto/on-chain requests.
- It is allowed to enable multiple capabilities.
- **Multi-turn**: If input has 【Latest User Message】, derive tickers and search/web3 queries from that message only unless the user clearly continues the previous topic. On topic switch, never reuse prior tickers (e.g. after RAVE, "hype多空" → Hyperliquid HYPE, not RAVE).

User query:
${query}`;

    try {
      const buildSafePlan = (parsed: any): { safePlan: OrchestratorPlan; shouldHeuristicFallback: boolean } => {
        const validQueryTypes = ['investment-analysis', 'research', 'market-brief', 'guru-council', 'general'] as const;
        const rawQT = parsed.queryType;
        const queryType: QueryType = validQueryTypes.includes(rawQT) ? rawQT : (parsed.isSimpleChat ? 'general' : 'research');

        const safePlan: OrchestratorPlan = {
          isSimpleChat: Boolean(parsed.isSimpleChat),
          queryType,
          capabilities: {
            analysis: {
              needed: Boolean(parsed.capabilities?.analysis?.needed),
              tickers: parsed.capabilities?.analysis?.tickers || undefined,
            },
            search: {
              needed: Boolean(parsed.capabilities?.search?.needed),
              query: parsed.capabilities?.search?.query || undefined,
              showXAccountProfile:
                typeof parsed.capabilities?.search?.showXAccountProfile === 'boolean'
                  ? parsed.capabilities.search.showXAccountProfile
                  : undefined,
            },
            simulate: {
              needed: Boolean(parsed.capabilities?.simulate?.needed),
              tickers: parsed.capabilities?.simulate?.tickers || undefined,
            },
            web3: {
              needed: Boolean(parsed.capabilities?.web3?.needed),
              query: parsed.capabilities?.web3?.query || undefined,
            },
          }
        };

        const anyCapabilityNeeded =
          safePlan.capabilities.analysis.needed ||
          safePlan.capabilities.search.needed ||
          safePlan.capabilities.simulate.needed ||
          safePlan.capabilities.web3.needed;

        const parsedCapabilitiesIsObject = parsed && typeof parsed === 'object' && 'capabilities' in parsed;
        const parsedCapabilitiesLooksEmpty =
          !parsedCapabilitiesIsObject ||
          !parsed.capabilities ||
          typeof parsed.capabilities !== 'object' ||
          Object.keys(parsed.capabilities).length === 0;

        const parsedLooksEmptyObject = parsed && typeof parsed === 'object' && Object.keys(parsed).length === 0;

        const shouldHeuristicFallback =
          parsedLooksEmptyObject ||
          parsedCapabilitiesLooksEmpty ||
          (!safePlan.isSimpleChat && !anyCapabilityNeeded);

        return { safePlan, shouldHeuristicFallback };
      };

      const requestRouterPlan = async (prompt: string, label: 'primary' | 'retry') => {
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 256,
            temperature: 0,
            response_format: { type: "json_object" }
          }),
          signal: AbortSignal.timeout(25000),
        });

        if (!response.ok) {
          console.warn(`evaluateRouting HTTP not ok (${label}):`, response.status, await response.text().catch(() => ''));
          return null;
        }

        const data = await response.json() as any;
        const resultText = (data.choices?.[0]?.message?.content || '{}').trim();
        const parsed: any = tryParseJsonObjectLoose(resultText) || {};
        if (Object.keys(parsed).length === 0 && resultText && resultText !== '{}') {
          console.warn(`[evaluateRouting] Router raw output (${label}) could not be parsed cleanly. rawPreview=`, resultText.slice(0, 240));
        }
        console.log(`[evaluateRouting] Orchestrator Plan (${label}):`, JSON.stringify(parsed, null, 2));
        const built = buildSafePlan(parsed);
        return { parsed, ...built };
      };

      const marker = '【Latest User Message】';
      const heuristicText =
        typeof query === 'string' && query.includes(marker)
          ? query.slice(query.lastIndexOf(marker) + marker.length).trim()
          : query;

      const primary = await requestRouterPlan(routerPrompt, 'primary');
      if (primary && !primary.shouldHeuristicFallback) {
        return primary.safePlan;
      }

      if (primary) {
        console.warn('[evaluateRouting] Primary routing produced empty/invalid JSON; retrying with compact prompt...');
        const retried = await requestRouterPlan(compactRouterPrompt, 'retry');
        if (retried && !retried.shouldHeuristicFallback) {
          console.log('[evaluateRouting] Retry routing recovered with valid plan.');
          return retried.safePlan;
        }
        const fallbackParsed = retried?.parsed ?? primary.parsed;
        const fallbackPlan = retried?.safePlan ?? primary.safePlan;
        console.warn(
          '[evaluateRouting] Invalid/empty orchestrator JSON from model; applying heuristic fallback. parsedKeys=',
          fallbackParsed && typeof fallbackParsed === 'object' ? Object.keys(fallbackParsed as any).join(',') : typeof fallbackParsed,
        );
        return mergeOrchestratorPlan(fallbackPlan, heuristicOrchestratorPatch(heuristicText));
      }
    } catch (err) {
      console.warn('evaluateRouting failed, fallback to fast:', err);
    }
    
    // Fallback if AI fails or network timeout
    return {
      isSimpleChat: true,
      queryType: 'general',
      capabilities: {
        analysis: { needed: false },
        search: { needed: false },
        simulate: { needed: false },
        web3: { needed: false },
      }
    };
  }
}