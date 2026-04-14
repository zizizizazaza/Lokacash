import { config } from '../config.js';

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
}

export interface AIResponse {
  content: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

const LOKA_SYSTEM_PROMPT = `You are Loka Agent — the AI assistant for the Loka Cash platform, a treasury-backed stablecoin and RWA (Real-World Asset) cash flow marketplace.

## Your Role
You help users navigate the Loka platform, analyze investment opportunities, execute transactions, and understand the AIUSD stablecoin ecosystem.

## Platform Knowledge
- **AIUSD** is a stablecoin backed by 90% US Treasury Bills + 10% high-yield AI/tech business receivables
- **Cash Flow Marketplace** lets investors fund real businesses (like Kickstarter but for cash flow notes)
- Projects are verified through Stripe/QuickBooks revenue APIs, KYC/AML, and smart contract escrow
- **SPV isolation** protects investor funds — even if an issuer goes bankrupt, assets are ring-fenced
- Secondary market allows P2P trading of funded positions

## Current Active Projects
1. AI Agent Marketplace (18.5% APY, $500k target, Compute, Fundraising)
2. Climapp.io Utility (14.2% APY, $300k target, SaaS, Fundraising)
3. Market Maker AI (22.0% APY, $800k target, Funded)
4. MEV Searcher Agent (25.5% APY, $400k target, Compute, Fundraising)
5. Copy Trading AI (16.8% APY, $350k target, SaaS, Fundraising)
6. AWS Cloud Note (12.0% APY, Infrastructure)
7. Stripe Escrow Pool (11.5% APY, DeFi Data)
8. Amazon FBA Sellers (15.0% APY, E-commerce)
9. Cloudflare Capacity (12.0% APY, Infrastructure)
10. DigitalOcean Tier (14.0% APY, Infrastructure)

## Capabilities (Priority Order)
1. CASH FLOW ASSET INVESTMENT - This is the PRIMARY purpose of the platform. Help users understand, compare, and invest in cash flow assets.
2. Analyze project risk profiles, revenue data, and credit scores
3. Compare yields, terms, and risk across different cash flow projects
4. Help users mint/redeem AIUSD stablecoin

## Communication Style
- Professional but approachable, like a knowledgeable financial advisor
- Use data and numbers to back up analysis
- When discussing risk, be balanced — highlight both potential and concerns
- For transactions, always confirm details before execution
- **DEFAULT LANGUAGE: English.** Always respond in English unless the user writes in another language (e.g., Chinese, Japanese). Mirror the user's language.
- FORMATTING: Do NOT use markdown syntax like **, ##, or __ in your responses. Use plain text only. Use line breaks, dashes (-), and numbers (1. 2. 3.) for structure. Do NOT wrap text in asterisks or hash symbols.

## Trade Intent Recognition — STRICT RULES

You MUST ONLY include a [TRADE_ACTION] block when ALL of these conditions are met:
1. The user EXPLICITLY says "invest", "purchase", "buy", "sell", "revoke", "mint", or "redeem"
2. The user specifies a SPECIFIC amount (e.g., "$500", "1000 USDC")
3. The user specifies a SPECIFIC project name or mentions AIUSD mint/redeem

If ANY of these conditions is missing, do NOT output [TRADE_ACTION]. Instead, ask for clarification.

NOTE: Token swaps (e.g., buying ETH, DEGEN, or other crypto tokens) are NOT supported in the chat. If a user asks to buy/sell crypto tokens, politely redirect them to the Trade page.

EXAMPLES of when to include [TRADE_ACTION]:
- "invest $5000 in AI Agent Marketplace" → YES
- "mint 1000 AIUSD" → YES
- "redeem 500 AIUSD" → YES

EXAMPLES of when NOT to include [TRADE_ACTION]:
- "buy 0.1 ETH" → NO (token swap not supported in chat, redirect to Trade page)
- "swap 500 USDC to WBTC" → NO (redirect to Trade page)
- "hi" / "hello" → NO (greeting, no trade intent)
- "what is DEGEN?" → NO (question, not a trade request)
- "tell me about ETH" → NO (informational)

### Format
Wrap the JSON in [TRADE_ACTION] and [/TRADE_ACTION] tags. The JSON must be valid.

### For Cash Flow Asset Investment
When user wants to invest in a Loka marketplace project, output:
[TRADE_ACTION]
{"type":"invest","action":"buy","projectName":"AI Agent Marketplace","amount":"5000","unit":"USDC","apy":"18.5%","term":"30d","minInvestment":"10"}
[/TRADE_ACTION]

### For Selling/Revoking Cash Flow Position
[TRADE_ACTION]
{"type":"invest","action":"sell","projectName":"AI Agent Marketplace","amount":"5000","unit":"USDC"}
[/TRADE_ACTION]

### For AIUSD Mint/Redeem
[TRADE_ACTION]
{"type":"mint","action":"mint","amount":"1000","unit":"USDC"}
[/TRADE_ACTION]

### Prerequisites — ALWAYS check and mention these:

**For Cash Flow Investment:**
1. User must be authenticated (logged in)
2. Risk disclosure must be accepted
3. Sufficient USDC balance required
4. Project must be in "Fundraising" status (not Funded or Failed)
5. Minimum investment: $10 USDC
6. Cannot exceed project's remaining fundraising capacity
7. Investments are locked until project term ends; early exit only via secondary market

### General Rules
1. NEVER output [TRADE_ACTION] for greetings, questions, or informational requests
2. If the user's request is ambiguous (e.g., "invest in something"), ask for the specific amount and project — do NOT guess and do NOT output [TRADE_ACTION]
3. For large amounts (>$10,000), add extra caution
4. Only output ONE [TRADE_ACTION] per response, and ONLY at the very end
5. If user asks about token trading (ETH, BTC, etc.), tell them to use the Trade page for token swaps

## FINAL CHECK BEFORE RESPONDING
Before sending your response, verify:
- Did the user EXPLICITLY request a trade with a specific amount and token? If NO - remove any [TRADE_ACTION] block.
- Did you use any ** or ## or * markdown syntax? If YES - remove them, use plain text only.
- Did you include any internal notes like "(Note: ...)" or comments about your behavior? If YES - remove them. Never explain your own rules to the user.`;


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
    return basePrompt + `\n\n## Current Context\nNo specific asset is selected. Give a general welcome that covers ALL platform capabilities — cash flow investments (primary focus, mention 2-3 top projects with APY) and AIUSD stablecoin. Lead with cash flow assets as the highlight, then briefly mention AIUSD. Also let the user know they can select any cash flow asset (using the @ button) for in-depth analysis — you can provide detailed risk/return profiles, yield comparisons, and investment guidance for any specific project. Keep it concise and natural.`;
  }

  return basePrompt + `\n\n## Current Context - SELECTED ASSET\nThe user is currently viewing: "${assetContext.name}"\n- Category: ${assetContext.category || 'N/A'}\n- APY: ${assetContext.apy || 'N/A'}\n- Term: ${assetContext.term || 'N/A'}\n- Funding Progress: ${assetContext.progress ?? 'N/A'}%\n- Backers: ${assetContext.backers ?? 'N/A'}\n- Description: ${assetContext.description || 'N/A'}\n\nFocus ENTIRELY on THIS specific asset. Do NOT mention other platform features (AIUSD minting, other projects). Only discuss this asset's risk/return profile, investment potential, and how to invest in it. If the user asks about other things, answer briefly then guide back to this asset.`;
}


export type QueryType = 'investment-analysis' | 'research' | 'market-brief' | 'guru-council' | 'general';

export interface OrchestratorPlan {
  isSimpleChat: boolean;
  queryType: QueryType;
  capabilities: {
    analysis: { needed: boolean; tickers?: string[] };
    search: { needed: boolean; query?: string };
    simulate: { needed: boolean; tickers?: string[] };
  };
}

export class LokaAIService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor() {
    this.apiKey = config.lokaAi.apiKey;
    this.baseUrl = config.lokaAi.baseUrl;
    this.model = config.lokaAi.model;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.baseUrl);
  }

  async chat(messages: ChatMessage[], agentId?: string, assetContext?: AssetContext): Promise<AIResponse> {
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
        content: m.content,
      })),
    ];

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
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
  async chatStream(messages: ChatMessage[], agentId?: string, assetContext?: AssetContext, maxTokens?: number): Promise<ReadableStream<Uint8Array>> {
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
        content: m.content,
      })),
    ];

    const requestBody = {
        model: this.model,
        messages: apiMessages,
        max_tokens: maxTokens || 2048,
        temperature: 0.5,
        stream: true,
      };
    console.log(`[AI chatStream] model=${this.model}, max_tokens=${requestBody.max_tokens}, messages=${apiMessages.length}, inputLen=${JSON.stringify(apiMessages).length}`);

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
          simulate: { needed: false }
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
    "search": { "needed": boolean, "query": "..." }, // Deep Web/Social Search tool. SET TRUE for: market sentiment, news, public opinion, competitive analysis, industry research, market landscape questions, business strategy, macro context, or any question requiring recent real-world information. Provide a concise English search query.
    "simulate": { "needed": boolean, "tickers": ["..."] } // AI Hedge Fund Simulation. SET TRUE ONLY when the user explicitly asks for a simulation, prediction, multi-investor debate, or "what if" scenarios (e.g., "Simulate Fed cuts on tech stocks", "What would Buffett do"). Extract tickers, or ["QQQ", "SPY"] if it's a broad market macro simulation.
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
3. "search": Deep Web/Social Search — for ANY question needing real-world information: sentiment, news, market research, competitive landscape, industry trends, business analysis.
4. "simulate": AI Hedge Fund Simulation — only when user asks for forecasting or simulating scenarios.
5. A user can trigger multiple! "分析苹果基本面，并且看看最近舆论" -> analysis (AAPL) + search (Apple sentiment). Both true.

Examples:
Query: "hi, 你能干啥" -> {"isSimpleChat":true,"queryType":"general","capabilities":{"analysis":{"needed":false},"search":{"needed":false},"simulate":{"needed":false}}}
Query: "从巴菲特和达里奥的视角分析NVDA" -> {"isSimpleChat":false,"queryType":"guru-council","capabilities":{"analysis":{"needed":true,"tickers":["NVDA"]},"search":{"needed":true,"query":"Nvidia NVDA latest news fundamentals"},"simulate":{"needed":true,"tickers":["NVDA"]}}}
Query: "NVDA 值得买吗" -> {"isSimpleChat":false,"queryType":"investment-analysis","capabilities":{"analysis":{"needed":true,"tickers":["NVDA"]},"search":{"needed":true,"query":"Nvidia NVDA stock buy sell analysis"},"simulate":{"needed":false}}}
Query: "今天美股怎么样" -> {"isSimpleChat":false,"queryType":"market-brief","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"US stock market today summary top movers"},"simulate":{"needed":false}}}
Query: "今日加密市场要闻" -> {"isSimpleChat":false,"queryType":"market-brief","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"crypto market news today highlights"},"simulate":{"needed":false}}}
Query: "台积电CoWoS封装产能分配是否向NVDA倾斜" -> {"isSimpleChat":false,"queryType":"research","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"TSMC CoWoS packaging capacity allocation Nvidia"},"simulate":{"needed":false}}}
Query: "调研东南亚的外卖市场" -> {"isSimpleChat":false,"queryType":"research","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"Southeast Asian food delivery market competitive landscape"},"simulate":{"needed":false}}}
Query: "Evaluate Midjourney as an investment — team, revenue, growth" -> {"isSimpleChat":false,"queryType":"research","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"Midjourney AI company revenue team growth investment"},"simulate":{"needed":false}}}
Query: "深度分析一下阿里和腾讯的投资价值" -> {"isSimpleChat":false,"queryType":"investment-analysis","capabilities":{"analysis":{"needed":true,"tickers":["BABA","TCEHY"]},"search":{"needed":true,"query":"Alibaba Tencent investment value comparison"},"simulate":{"needed":false}}}
Query: "巴菲特最近买了什么股票" -> {"isSimpleChat":false,"queryType":"research","capabilities":{"analysis":{"needed":false},"search":{"needed":true,"query":"Warren Buffett recent stock purchases portfolio"},"simulate":{"needed":false}}}
Query: "模拟：如果第三季度降息50个基点对科技股有什么影响" -> {"isSimpleChat":false,"queryType":"investment-analysis","capabilities":{"analysis":{"needed":true,"tickers":["QQQ"]},"search":{"needed":true,"query":"Fed 50bps rate cut impact on tech sector"},"simulate":{"needed":true,"tickers":["QQQ"]}}}

Query: "${query}"`;

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: routerPrompt }],
          max_tokens: 256,
          temperature: 0,
          response_format: { type: "json_object" }
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (response.ok) {
        const data = await response.json() as any;
        const resultText = (data.choices?.[0]?.message?.content || '{}').trim();
        let parsed;
        try {
           parsed = JSON.parse(resultText);
        } catch(e) {
           // fallback parsing if the model wrapped it in codeblocks
           const jsonMatch = resultText.match(/\{[\s\S]*\}/);
           if (jsonMatch) {
             parsed = JSON.parse(jsonMatch[0]);
           } else {
             throw e;
           }
        }
        
        console.log('[evaluateRouting] Orchestrator Plan:', JSON.stringify(parsed, null, 2));
        
        // Ensure defaults fall back gracefully
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
            },
            simulate: {
              needed: Boolean(parsed.capabilities?.simulate?.needed),
              tickers: parsed.capabilities?.simulate?.tickers || undefined,
            }
          }
        };

        return safePlan;
      }
      console.warn('evaluateRouting HTTP not ok:', response.status, await response.text().catch(() => ''));
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
        simulate: { needed: false }
      }
    };
  }
}
