import { config } from '../config.js';

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
  if (!assetContext) {
    return LOKA_SYSTEM_PROMPT + `\n\n## Current Context\nNo specific asset is selected. Give a general welcome that covers ALL platform capabilities — cash flow investments (primary focus, mention 2-3 top projects with APY) and AIUSD stablecoin. Lead with cash flow assets as the highlight, then briefly mention AIUSD. Also let the user know they can select any cash flow asset (using the @ button) for in-depth analysis — you can provide detailed risk/return profiles, yield comparisons, and investment guidance for any specific project. Keep it concise and natural.`;
  }

  return LOKA_SYSTEM_PROMPT + `\n\n## Current Context - SELECTED ASSET\nThe user is currently viewing: "${assetContext.name}"\n- Category: ${assetContext.category || 'N/A'}\n- APY: ${assetContext.apy || 'N/A'}\n- Term: ${assetContext.term || 'N/A'}\n- Funding Progress: ${assetContext.progress ?? 'N/A'}%\n- Backers: ${assetContext.backers ?? 'N/A'}\n- Description: ${assetContext.description || 'N/A'}\n\nFocus ENTIRELY on THIS specific asset. Do NOT mention other platform features (AIUSD minting, other projects). Only discuss this asset's risk/return profile, investment potential, and how to invest in it. If the user asks about other things, answer briefly then guide back to this asset.`;
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
  async chatStream(messages: ChatMessage[], agentId?: string, assetContext?: AssetContext): Promise<ReadableStream<Uint8Array>> {
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
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error (${response.status}): ${errorText}`);
    }

    return response.body!;
  }

  /**
   * Intelligently routes queries based on complexity and intent.
   * Extracts stock tickers if the user asks for stock or hedge fund analysis.
   */
  async evaluateRouting(query: string): Promise<{ mode: 'fast' | 'collaborate' | 'stockanalysis' | 'hedgefund', tickers?: string[] }> {
    if (!this.isConfigured) {
      return { mode: 'fast' };
    }

    const routerPrompt = `You are a query routing engine for a financial AI assistant.
Evaluate the user's query and output a JSON array of parameters. Do not output markdown code blocks. ONLY output raw JSON.

JSON SCHEMA:
{
  "mode": "fast" | "collaborate" | "stockanalysis" | "hedgefund", // See routing rules
  "tickers": ["SYMBOL1", "SYMBOL2"] // (Optional) exact stock market symbols/short names
}

ROUTING RULES:
1. "stockanalysis": If the user explicitly asks for stock data, price history, technical analysis or fundamental metrics for specific stocks (e.g. "分析一下腾讯", "AAPL today"). You MUST extract the tickers/names mentioned into the 'tickers' array.
2. "hedgefund": If the user explicitly asks to run an AI Hedge Fund analysis, deep institutional analysis, or speculative trading strategy for specific stocks.
3. "collaborate": If the query needs multi-agent reasoning, deep generic financial research, economic trend forecasting, or if they ask about markets but WITHOUT specific stocks.
4. "fast": If it's a greeting, casual chat, platform help, translation, or basic math.

Examples:
Query: "帮我分析腾讯和阿里的股票" -> {"mode":"stockanalysis","tickers":["腾讯","阿里"]}
Query: "用对冲基金模型看看 NVDA" -> {"mode":"hedgefund","tickers":["NVDA"]}
Query: "现在的降息预期对加密货币有什么影响？" -> {"mode":"collaborate"}

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
          max_tokens: 150,
          temperature: 0,
          response_format: { type: "json_object" }
        }),
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
        
        let validMode: any = 'fast';
        if (['fast', 'collaborate', 'stockanalysis', 'hedgefund'].includes(parsed.mode)) {
          validMode = parsed.mode;
        } else if (parsed.mode?.includes('collaborate')) {
          validMode = 'collaborate';
        }
        
        return {
          mode: validMode,
          tickers: Array.isArray(parsed.tickers) && parsed.tickers.length > 0 ? parsed.tickers : undefined
        };
      }
    } catch (err) {
      console.warn('evaluateRouting failed, fallback to fast:', err);
    }
    
    return { mode: 'fast' };
  }
}
