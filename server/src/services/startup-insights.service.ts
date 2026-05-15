/**
 * Startup Insights Service — AI-generated Value Proposition & Problem Solved
 *
 * Lazy generation: only generates when a detail page is viewed.
 * In-memory cache persists for the server lifetime; no DB needed.
 */

import { config } from '../config.js';

interface StartupInsight {
  valueProposition: string;
  problemSolved: string;
  generatedAt: number;
}

// ── In-memory cache (slug → insight) ──
const insightCache = new Map<string, StartupInsight>();
const inflightRequests = new Map<string, Promise<StartupInsight | null>>();

const PROMPT_TEMPLATE = (info: {
  name: string;
  description: string;
  category: string;
  targetAudience?: string | null;
  paymentProvider?: string;
  customers?: number;
  revenue?: { mrr: number; total: number };
}) => `You are a startup analyst. Based on the following startup information, generate TWO fields in JSON format:

1. "valueProposition": A concise, compelling one-sentence value proposition (what unique value this startup offers). Max 15 words.
2. "problemSolved": A clear one-sentence description of the specific problem this startup solves. Max 25 words.

Startup info:
- Name: ${info.name}
- Description: ${info.description}
- Category: ${info.category}
- Target Audience: ${info.targetAudience || 'General'}
${info.paymentProvider ? `- Payment Provider: ${info.paymentProvider}` : ''}
${info.customers ? `- Customers: ${info.customers.toLocaleString()}` : ''}
${info.revenue ? `- MRR: $${info.revenue.mrr.toLocaleString()}, Total Revenue: $${info.revenue.total.toLocaleString()}` : ''}

Respond with ONLY valid JSON, no markdown, no explanation:
{"valueProposition": "...", "problemSolved": "..."}`;

async function callAI(prompt: string, retries = 2): Promise<string> {
  const { apiKey, baseUrl, model } = config.lokaAi;

  if (!apiKey || !baseUrl) {
    throw new Error('AI service not configured');
  }

  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`AI API error (${response.status}): ${err}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      return data.choices?.[0]?.message?.content || '';
    } catch (err) {
      lastError = err;
      console.warn(`[StartupInsights] AI request failed (attempt ${i + 1}/${retries + 1}):`, err instanceof Error ? err.message : String(err));
      if (i < retries) {
        // exponential backoff
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
      }
    }
  }
  
  throw lastError;
}

function parseInsight(raw: string): StartupInsight | null {
  try {
    // Strip markdown fences if present
    const cleaned = raw.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    const obj = JSON.parse(cleaned);
    if (obj.valueProposition && obj.problemSolved) {
      return {
        valueProposition: obj.valueProposition,
        problemSolved: obj.problemSolved,
        generatedAt: Date.now(),
      };
    }
    return null;
  } catch {
    console.error('[StartupInsights] Failed to parse AI response:', raw);
    return null;
  }
}

// ── Public API ──

/**
 * Get or generate startup insights.
 * Returns cached result instantly, or generates via AI (with dedup).
 */
export async function getStartupInsight(info: {
  slug: string;
  name: string;
  description: string;
  category: string;
  targetAudience?: string | null;
  paymentProvider?: string;
  customers?: number;
  revenue?: { mrr: number; total: number };
}): Promise<StartupInsight | null> {
  // 1. Check cache
  const cached = insightCache.get(info.slug);
  if (cached) return cached;

  // 2. Skip generation if description is too short / empty
  if (!info.description || info.description.length < 5) return null;

  // 3. Dedup in-flight requests
  const existing = inflightRequests.get(info.slug);
  if (existing) return existing;

  // 4. Generate
  const promise = (async () => {
    try {
      const prompt = PROMPT_TEMPLATE(info);
      const raw = await callAI(prompt);
      const insight = parseInsight(raw);
      if (insight) {
        insightCache.set(info.slug, insight);
        console.log(`[StartupInsights] ✅ Generated for "${info.name}"`);
      }
      return insight;
    } catch (err) {
      console.error(`[StartupInsights] ❌ Generation failed for "${info.name}":`, err);
      return null;
    } finally {
      inflightRequests.delete(info.slug);
    }
  })();

  inflightRequests.set(info.slug, promise);
  return promise;
}

/** Cache stats for monitoring */
export function getInsightCacheStats() {
  return {
    cached: insightCache.size,
    inflight: inflightRequests.size,
  };
}
