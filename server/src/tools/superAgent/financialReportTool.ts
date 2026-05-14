import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { BaseTool, type ToolExecutionContext, type ToolResult } from './types.js';
import { withPythonSlot } from '../../services/pythonSemaphore.service.js';

/**
 * Pulls A-share financial reports (业绩预告 / 业绩快报 / 业绩报表 / 同花顺财务摘要)
 * by spawning fetch_financial_report.py against the stock-analysis venv.
 *
 * Designed to complement `stock_analysis` (which gives realtime quote +
 * daily K-line) with the "what about earnings?" dimension that the agent
 * couldn't answer before.
 *
 * US / HK tickers are politely refused — those have their own pipelines
 * (FMP / Yfinance for fundamentals, edgar-sec-filings for full filings).
 */
export class FinancialReportTool extends BaseTool {
  readonly name = 'financial_report';
  readonly description =
    'Pull A-share earnings reports for a specific ticker: 业绩预告 (forecast) / 业绩快报 (preliminary) / 业绩报表 (official) / 同花顺财务摘要 (multi-period summary). ' +
    'Use this when the user asks about a Chinese stock\'s earnings ("业绩怎么样" / "业绩预告" / "营收" / "净利润" / "EPS" / "财务摘要"). ' +
    'Pair with `stock_analysis` (price + technicals) and `web_research` (news sentiment) for a complete picture. ' +
    'ONLY for A-share tickers (6 digits, with optional .SH/.SZ suffix). For US stocks use `sec_filings` instead; for HK stocks use `stock_analysis` financial fields.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      ticker: {
        type: 'string',
        description:
          'A-share ticker code. Accepts: "600519", "600519.SH", "000333", "000333.SZ". Suffix is optional.',
      },
      kinds: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['abstract', 'yjyg', 'yjkb', 'yjbb'],
        },
        description:
          'Which report kinds to pull. Default: all four. "abstract" = 同花顺财务摘要 multi-period series (best for trends). "yjyg" = 业绩预告 (earnings forecast). "yjkb" = 业绩快报 (preliminary). "yjbb" = 业绩报表 (official quarterly/annual).',
      },
      period: {
        type: 'string',
        description:
          'Optional reporting period in YYYYMMDD format (e.g. "20260331" = 2026 Q1). Defaults to the most recent quarter end.',
      },
    },
    required: ['ticker'],
    additionalProperties: false,
  };

  async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const ticker = String(args.ticker || '').trim();
    if (!ticker) {
      return { ok: false, content: '', error: 'financial_report: ticker is required' };
    }
    // A-share gate: 6 digits, optional .SH/.SZ. Soft-refuse non-A-share to
    // save the user a 5s python spawn that returns empty.
    if (!/^\d{6}(\.(SH|SZ|SS|BJ))?$/i.test(ticker)) {
      return {
        ok: false,
        content: '',
        error: `financial_report: ${ticker} is not an A-share ticker. Use sec_filings for US, stock_analysis for HK.`,
      };
    }

    const kinds = Array.isArray(args.kinds) && args.kinds.length > 0
      ? (args.kinds as unknown[]).map((k) => String(k)).join(',')
      : 'abstract,yjyg,yjkb,yjbb';
    const period = args.period ? String(args.period) : undefined;

    // Build a stage entry the frontend can render as a per-tool card. Same
    // shape as stockAnalysisTool / web3 stages: stage / title_en / title_zh /
    // state / argsData / rawData. The 'state' starts as 'active' and we emit
    // immediately so a spinning pill appears; on completion we re-emit with
    // 'completed' + rawData.
    const startTs = Date.now();
    type ToolStage = {
      stage: string;
      title_en: string;
      title_zh: string;
      state: 'active' | 'completed' | 'failed';
      durationMs?: number;
      argsData?: unknown;
      rawData?: unknown;
    };
    const stage: ToolStage = {
      stage: 'financial_report',
      title_en: 'Financial reports',
      title_zh: '财务报告',
      state: 'active',
      argsData: { ticker, kinds, period },
    };
    ctx.emitter.emitModule('analysis', 'active', {
      tickers: [ticker],
      toolStages: [stage],
    });

    try {
      const payload = await withPythonSlot(
        () => runPython(ticker, kinds, period, ctx.abortSignal),
        {
          tag: `financial_report:${ticker}`,
          timeoutMs: 60_000,
          onQueued: (position, etaMs) => {
            ctx.emitToUser('agent:chat:queued', {
              sessionId: ctx.sessionId,
              tool: 'financial_report',
              position,
              etaMs,
              message: `You're #${position} in queue — heavy data tool is busy. Starting in ~${Math.round(etaMs / 1000)}s.`,
            });
          },
        },
      );
      stage.state = 'completed';
      stage.durationMs = Date.now() - startTs;
      // Trim rawData for the card. The frontend renderer only needs:
      //   - ticker / period anchor
      //   - the abstract array (most recent 4-8 rows for table preview)
      //   - the latest yjyg/yjkb/yjbb if any
      // Pass through truncated to keep DB metadata bytes low.
      const abstractRows = Array.isArray(payload.abstract) ? payload.abstract : [];
      stage.rawData = {
        stock_code: payload.stock_code,
        period: payload.period,
        fetched_at: payload.fetched_at,
        abstract_count: abstractRows.length,
        abstract: abstractRows.slice(0, 8),
        yjyg: payload.yjyg ?? null,
        yjkb: payload.yjkb ?? null,
        yjbb: payload.yjbb ?? null,
        errors: payload.errors ?? [],
      };
      ctx.emitter.emitModule('analysis', 'completed', {
        tickers: [ticker],
        toolStages: [stage],
      });

      const content = formatPayloadForLLM(payload);
      return {
        ok: true,
        // Cap at 14k chars — abstract table can be wordy, but synthesis
        // model only needs the most recent 4-8 periods to write a useful
        // earnings paragraph.
        content: content.slice(0, 14000),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stage.state = 'failed';
      stage.durationMs = Date.now() - startTs;
      stage.rawData = { error: message };
      ctx.emitter.emitModule('analysis', 'completed', {
        tickers: [ticker],
        toolStages: [stage],
        error: message,
      });
      return { ok: false, content: '', error: `financial_report: ${message}` };
    }
  }
}

interface FinancialReportPayload {
  stock_code: string;
  period: string;
  fetched_at: string;
  abstract?: Array<Record<string, unknown>> | null;
  yjyg?: { period: string; row: Record<string, unknown> | null } | null;
  yjkb?: { period: string; row: Record<string, unknown> | null } | null;
  yjbb?: { period: string; row: Record<string, unknown> | null } | null;
  errors?: string[];
  elapsed_s?: number;
}

function getPythonPath(): string {
  const isWindows = process.platform === 'win32';
  const venvPath = path.join(process.cwd(), 'tools', 'stock-analysis', '.venv');
  if (fs.existsSync(venvPath)) {
    return isWindows
      ? path.join(venvPath, 'Scripts', 'python.exe')
      : path.join(venvPath, 'bin', 'python');
  }
  return isWindows ? 'python' : 'python3';
}

async function runPython(
  ticker: string,
  kinds: string,
  period: string | undefined,
  abortSignal: AbortSignal,
): Promise<FinancialReportPayload> {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath();
    const scriptPath = path.join(process.cwd(), 'tools', 'stock-analysis', 'fetch_financial_report.py');
    const scriptArgs = ['--stock-code', ticker, '--kinds', kinds];
    if (period) scriptArgs.push('--period', period);

    const proc = spawn(pythonPath, [scriptPath, ...scriptArgs], {
      cwd: path.join(process.cwd(), 'tools', 'stock-analysis'),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    const chunks: Buffer[] = [];
    let stderrAccum = '';

    proc.stdout.on('data', (data: Buffer) => chunks.push(data));
    proc.stderr.on('data', (data: Buffer) => {
      stderrAccum += data.toString('utf-8');
    });

    const abortHandler = () => {
      try { proc.kill('SIGTERM'); } catch { /* noop */ }
      reject(new Error('aborted'));
    };
    if (abortSignal.aborted) return abortHandler();
    abortSignal.addEventListener('abort', abortHandler, { once: true });

    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      abortSignal.removeEventListener('abort', abortHandler);
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) {
        reject(new Error(`empty output (exit=${code}); stderr=${stderrAccum.slice(0, 400)}`));
        return;
      }
      try {
        // The Python script writes ONE JSON object as a single line to stdout.
        // Take the substring from the first '{' to the last '}'. (Earlier I
        // used `lastIndexOf('{')` here which was wrong — it lands on a nested
        // object inside the `abstract` array and slices out incomplete JSON.)
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        if (firstBrace < 0 || lastBrace <= firstBrace) {
          reject(new Error(`no JSON object in output: ${raw.slice(0, 300)}`));
          return;
        }
        const candidate = raw.slice(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(candidate) as FinancialReportPayload;
        resolve(parsed);
      } catch (e: any) {
        reject(new Error(`JSON parse failed: ${e.message}; raw=${raw.slice(0, 300)}`));
      }
    });
  });
}

function formatPayloadForLLM(p: FinancialReportPayload): string {
  const sections: string[] = [];
  sections.push(`# 财务报告数据 — ${p.stock_code} (period anchor: ${p.period})`);
  sections.push(`_fetched: ${p.fetched_at}_`);

  if (p.abstract && p.abstract.length > 0) {
    sections.push('\n## 同花顺财务摘要（按报告期，最近 12 期）');
    // Render as a compact markdown table-ish text.
    sections.push('```json');
    sections.push(JSON.stringify(p.abstract, null, 2));
    sections.push('```');
  } else {
    sections.push('\n## 同花顺财务摘要\n\n(no data — akshare returned empty / API blocked)');
  }

  const renderPeriodicBlock = (label: string, key: 'yjyg' | 'yjkb' | 'yjbb') => {
    const block = p[key];
    if (!block || !block.row) {
      sections.push(`\n## ${label}\n\n(no row for this ticker in period ${p.period})`);
      return;
    }
    sections.push(`\n## ${label} (period: ${block.period})`);
    sections.push('```json');
    sections.push(JSON.stringify(block.row, null, 2));
    sections.push('```');
  };

  renderPeriodicBlock('业绩预告 (Earnings Forecast)', 'yjyg');
  renderPeriodicBlock('业绩快报 (Preliminary Results)', 'yjkb');
  renderPeriodicBlock('业绩报表 (Official Quarterly/Annual)', 'yjbb');

  if (p.errors && p.errors.length > 0) {
    sections.push('\n## Fetch errors (non-fatal)');
    for (const e of p.errors) sections.push(`- ${e}`);
  }

  // Count abstract rows to surface a per-payload directive — when 12 periods
  // are present the synthesis model has historically only rendered 1 in the
  // final report, wasting the data. Bake an explicit mandate into the tool
  // output so it's right next to the numbers when the model reads them.
  const abstractCount = Array.isArray(p.abstract) ? p.abstract.length : 0;
  sections.push('\n---\n');
  sections.push('## ⚠ MANDATORY SYNTHESIS RULES (READ BEFORE WRITING)\n');
  if (abstractCount >= 4) {
    sections.push(
      `1. **Multi-period trend table is REQUIRED.** The \`abstract\` array above contains ${abstractCount} reporting periods. Render a markdown table showing **at least 4** of the most recent rows (preferably 6-8). Columns to include: 报告期, 营业总收入 + YoY, 归母净利润 + YoY, 毛利率, 经营现金流. A single-quarter table is INSUFFICIENT.`,
    );
    sections.push(
      `2. The trend table MUST appear in the Fundamentals section BEFORE narrative analysis — the user paid for 12 periods of data; do not show only 1.`,
    );
    sections.push(
      `3. After the table, narrate inflection points (where did the trend turn?), quality vs quantity gap (营收 YoY vs 净利润 YoY 剪刀差), and cash-flow quality (经营现金流 vs 净利润 含金量). Cite specific quarters by name.`,
    );
  } else if (abstractCount >= 1) {
    sections.push(
      `1. The \`abstract\` array contains only ${abstractCount} period(s) — show whatever periods exist in a table, and note explicitly that "更早期数据未返回" so the reader knows the trend window is short.`,
    );
  } else {
    sections.push(
      `1. The \`abstract\` array is EMPTY. State explicitly in Fundamentals: "财报时间序列未返回，以下分析基于新闻摘录" — do NOT silently substitute news-article numbers as if they were tool data.`,
    );
  }
  sections.push(
    `4. Use these numbers verbatim. 营业收入 / 净利润 / 同比 / 扣非 ARE THE SOURCE OF TRUTH. Do NOT recompute YoY/QoQ yourself if it's already in the row.`,
  );
  sections.push(
    `5. Cite source as \`同花顺财务摘要\` / \`东方财富业绩预告\` as appropriate. Do NOT cite the tool name "financial_report".`,
  );

  return sections.join('\n');
}
