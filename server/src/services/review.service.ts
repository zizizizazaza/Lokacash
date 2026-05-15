/**
 * AI Review Agent — Automated project application screening
 * 
 * Uses the same AI service (deepseek-v3) with a specialized reviewer prompt
 * to score project applications on risk metrics.
 */

import { config } from '../config.js';

interface ApplicationData {
  projectName: string;
  category: string;
  description?: string | null;
  monthlyRevenue: number;
  requestedAmount: number;
  proposedApy: number;
  durationDays: number;
  collateralType?: string | null;
  collateralValue: number;
  revenueSource?: string | null;
  revenueVerified: boolean;
  companyName: string;
  country: string;
}

export interface ReviewResult {
  score: number;          // 0-100
  grade: string;          // AAA, AA, A, BBB, BB, B, C, D
  recommendation: 'approve' | 'review' | 'reject';
  strengths: string[];
  risks: string[];
  notes: string;
}

const REVIEWER_PROMPT = `You are the Loka Risk Reviewer Agent. You evaluate project funding applications for the Loka Cash platform — a cash flow marketplace.

Your job: Score the application from 0-100 and give a grade.

Scoring Criteria (weight):
1. Revenue Coverage (30%): monthlyRevenue × durationMonths vs requestedAmount. Coverage >= 2x is excellent.
2. APY Reasonableness (15%): 8-15% is normal; >20% is high risk; >30% is extreme.
3. Collateral (20%): collateralValue / requestedAmount >= 20% is good. No collateral = high risk.
4. Revenue Verification (15%): Stripe/QuickBooks verified is a strong positive.
5. Duration (10%): 30-90 days is standard; >180 days increases risk.
6. Category Health (10%): SaaS/Infrastructure is lower risk; Crypto/Meme is higher risk.

Grade Scale:
- 90-100: AAA (Auto-approve)
- 80-89: AA (Auto-approve)
- 70-79: A (Auto-approve)
- 60-69: BBB (Manual review recommended)
- 50-59: BB (Manual review required)
- 40-49: B (Likely reject)
- 30-39: C (Reject)
- 0-29: D (Reject)

Recommendation:
- score >= 70: "approve"
- 50 <= score < 70: "review"
- score < 50: "reject"

You MUST respond with ONLY valid JSON in this exact format, no markdown, no explanation:
{"score":85,"grade":"AA","recommendation":"approve","strengths":["High revenue coverage ratio 3.2x","Stripe verified revenue"],"risks":["Single geography risk"],"notes":"Strong application with verified recurring revenue."}`;

function buildReviewPrompt(app: ApplicationData): string {
  const coverageRatio = (app.monthlyRevenue * (app.durationDays / 30)) / app.requestedAmount;
  const collateralRatio = app.collateralValue / app.requestedAmount;

  return `Review this project application:

Project: ${app.projectName}
Category: ${app.category}
Description: ${app.description || 'Not provided'}
Company: ${app.companyName} (${app.country})

Financials:
- Monthly Revenue: $${app.monthlyRevenue.toLocaleString()}
- Requested Amount: $${app.requestedAmount.toLocaleString()}
- Revenue Coverage Ratio: ${coverageRatio.toFixed(2)}x
- Proposed APY: ${app.proposedApy}%
- Duration: ${app.durationDays} days

Collateral:
- Type: ${app.collateralType || 'None'}
- Value: $${app.collateralValue.toLocaleString()}
- Collateral Ratio: ${(collateralRatio * 100).toFixed(1)}%

Revenue Verification:
- Source: ${app.revenueSource || 'Not connected'}
- Verified: ${app.revenueVerified ? 'Yes' : 'No'}

Score this application (0-100) and respond with JSON only.`;
}

/** Run AI review on a project application */
export async function reviewApplication(app: ApplicationData): Promise<ReviewResult> {
  // If AI is not configured, use rule-based scoring
  if (!config.lokaAi.apiKey || !config.lokaAi.baseUrl) {
    return ruleBasedReview(app);
  }

  try {
    const response = await fetch(config.lokaAi.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.lokaAi.apiKey}`,
      },
      body: JSON.stringify({
        model: config.lokaAi.model,
        messages: [
          { role: 'system', content: REVIEWER_PROMPT },
          { role: 'user', content: buildReviewPrompt(app) },
        ],
        max_tokens: 500,
        temperature: 0.2, // Low temperature for consistent scoring
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[ReviewAgent] AI API returned ${response.status}, falling back to rule-based`);
      return ruleBasedReview(app);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return ruleBasedReview(app);

    // Parse JSON from AI response (may be wrapped in markdown code block)
    const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr) as ReviewResult;

    // Validate result structure
    if (typeof result.score !== 'number' || !result.grade || !result.recommendation) {
      return ruleBasedReview(app);
    }

    return result;
  } catch (err) {
    console.warn('[ReviewAgent] AI review failed, using rule-based:', (err as Error).message);
    return ruleBasedReview(app);
  }
}

/** Deterministic rule-based scoring fallback */
function ruleBasedReview(app: ApplicationData): ReviewResult {
  let score = 50; // base
  const strengths: string[] = [];
  const risks: string[] = [];

  // 1. Revenue Coverage (30 pts max)
  const coverageRatio = (app.monthlyRevenue * (app.durationDays / 30)) / app.requestedAmount;
  if (coverageRatio >= 3) { score += 30; strengths.push(`Excellent revenue coverage ${coverageRatio.toFixed(1)}x`); }
  else if (coverageRatio >= 2) { score += 22; strengths.push(`Good revenue coverage ${coverageRatio.toFixed(1)}x`); }
  else if (coverageRatio >= 1.5) { score += 15; }
  else if (coverageRatio >= 1) { score += 8; risks.push(`Thin revenue coverage ${coverageRatio.toFixed(1)}x`); }
  else { score -= 10; risks.push(`Revenue coverage below 1x (${coverageRatio.toFixed(1)}x)`); }

  // 2. APY Reasonableness (15 pts max)
  if (app.proposedApy <= 15) { score += 15; }
  else if (app.proposedApy <= 20) { score += 10; }
  else if (app.proposedApy <= 25) { score += 5; risks.push(`High APY ${app.proposedApy}% suggests elevated risk`); }
  else { score -= 5; risks.push(`Very high APY ${app.proposedApy}% — potential unsustainability`); }

  // 3. Collateral (20 pts max)
  const collateralRatio = app.collateralValue / app.requestedAmount;
  if (collateralRatio >= 0.3) { score += 20; strengths.push(`Strong collateral ${(collateralRatio * 100).toFixed(0)}%`); }
  else if (collateralRatio >= 0.15) { score += 12; }
  else if (collateralRatio > 0) { score += 5; risks.push('Low collateral coverage'); }
  else { score -= 5; risks.push('No collateral pledged'); }

  // 4. Revenue Verification (15 pts max)
  if (app.revenueVerified) { score += 15; strengths.push(`Revenue verified via ${app.revenueSource || 'API'}`); }
  else if (app.revenueSource) { score += 8; }
  else { risks.push('Revenue not verified — manual review needed'); }

  // 5. Duration (10 pts max)
  if (app.durationDays <= 90) { score += 10; }
  else if (app.durationDays <= 180) { score += 6; }
  else { score += 2; risks.push(`Long duration (${app.durationDays}d) increases uncertainty`); }

  // 6. Category (10 pts max)
  const lowRiskCategories = ['SaaS', 'Infrastructure', 'E-commerce'];
  if (lowRiskCategories.includes(app.category)) { score += 10; strengths.push(`${app.category} is a proven revenue model`); }
  else { score += 5; }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine grade
  let grade: string;
  if (score >= 90) grade = 'AAA';
  else if (score >= 80) grade = 'AA';
  else if (score >= 70) grade = 'A';
  else if (score >= 60) grade = 'BBB';
  else if (score >= 50) grade = 'BB';
  else if (score >= 40) grade = 'B';
  else if (score >= 30) grade = 'C';
  else grade = 'D';

  const recommendation = score >= 70 ? 'approve' : score >= 50 ? 'review' : 'reject';

  return {
    score,
    grade,
    recommendation: recommendation as ReviewResult['recommendation'],
    strengths,
    risks,
    notes: `Rule-based scoring. Coverage ratio: ${coverageRatio.toFixed(2)}x, Collateral: ${(collateralRatio * 100).toFixed(1)}%.`,
  };
}
