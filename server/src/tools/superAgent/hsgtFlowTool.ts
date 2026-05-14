import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { BaseTool, type ToolExecutionContext, type ToolResult } from './types.js';
import { withPythonSlot } from '../../services/pythonSemaphore.service.js';

/**
 * Pulls Shanghai/Shenzhen-Hong Kong Stock Connect (沪深港通) capital flow:
 *
 *   - 北向资金 (Northbound): foreign / mainland-via-HK money buying A-shares.
 *                            Two channels — 沪股通 (Shanghai HK Connect) and
 *                            深股通 (Shenzhen HK Connect).
 *   - 南向资金 (Southbound): mainland money buying HK stocks.
 *                            Two channels — 港股通沪 and 港股通深.
 *   - Today's snapshot across all 4 channels.
 *   - Per-A-share NB holdings change over time (when ticker provided).
 *
 * Northbound flow is one of the strongest sentiment signals for A-shares —
 * "smart money" buying pressure / outflow is widely watched by 私募 and
 * retail alike. Southbound flow proxies mainland appetite for HK exposure
 * (Tencent / Meituan / HSI ETFs).
 */
export class HsgtFlowTool extends BaseTool {
  readonly name = 'hsgt_flow';
  readonly description =
    'Get Hong Kong Stock Connect capital flow data: northbound (北向资金 — money INTO A-shares), southbound (南向资金 — money INTO HK stocks), or today\'s 4-channel snapshot. ' +
    'Use when the user asks about Stock Connect / mainland-HK flows: "北向资金今天怎么样" / "南向资金趋势" / "外资买了多少 A 股" / "南下港股资金" / "陆股通净买入". ' +
    'Optionally include a 6-digit A-share ticker to get per-stock NB holdings change over time (e.g. "外资在加仓茅台吗"). ' +
    'A-share northbound flow is a strong "smart money" sentiment proxy — sustained net inflow is bullish, sustained outflow is bearish.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      direction: {
        type: 'string',
        enum: ['northbound', 'southbound', 'summary', 'all'],
        description:
          'Which channel: "northbound" = 北向资金 (mainland buying A-share) history. "southbound" = 南向资金 (mainland buying HK) history. "summary" = today\'s snapshot across all 4 channels. "all" = both NB + SB histories. Default: summary.',
      },
      days: {
        type: 'integer',
        description: 'How many days of history to return (default 30, max 180). Ignored for direction=summary.',
      },
      ticker: {
        type: 'string',
        description:
          'Optional ticker for per-stock Stock Connect holdings change. ' +
          'Accepts either: (a) 6-digit A-share code ("600519", "000333.SZ") → returns 北向 (northbound) NB holdings ("外资在加仓 X 吗"), OR ' +
          '(b) 4-5-digit HK code ("0700", "00700", "9988", "0700.HK") → returns 南向 (southbound) SB holdings ("港股通买了 X 多少"). ' +
          'When given, takes precedence over direction= and the response focuses on that ticker\'s Stock Connect position trend.',
      },
    },
    required: [],
    additionalProperties: false,
  };

  async execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const direction = (args.direction && ['northbound', 'southbound', 'summary', 'all'].includes(String(args.direction)))
      ? String(args.direction)
      : 'summary';
    const days = Math.max(1, Math.min(180, typeof args.days === 'number' ? args.days : 30));
    const ticker = args.ticker ? String(args.ticker).trim() : undefined;

    // Accept BOTH A-share (6-digit, used for northbound per-stock holdings)
    // AND HK Stock Connect tickers (4-5 digit, used for southbound per-HK-stock
    // holdings — "港股通买了腾讯多少"). Python script routes to the right
    // akshare endpoint based on detected ticker type.
    const aShareRe = /^\d{6}(\.(SH|SZ|SS|BJ))?$/i;
    const hkRe = /^\d{4,5}(\.HK)?$|^HK\d{4,5}$/i;
    if (ticker && !aShareRe.test(ticker) && !hkRe.test(ticker)) {
      return {
        ok: false,
        content: '',
        error: `hsgt_flow: ticker "${ticker}" is neither a 6-digit A-share code (NB holdings) nor a 4-5-digit HK code (SB holdings). Examples: "600519", "000333.SZ", "0700.HK", "9988".`,
      };
    }

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
      stage: 'hsgt_flow',
      title_en: 'HK Stock Connect flow',
      title_zh: '沪深港通资金流向',
      state: 'active',
      argsData: { direction, days, ticker },
    };
    ctx.emitter.emitModule('analysis', 'active', {
      toolStages: [stage],
    });

    try {
      const payload = await withPythonSlot(
        () => runPython(direction, days, ticker, ctx.abortSignal),
        {
          tag: `hsgt_flow:${direction}${ticker ? `:${ticker}` : ''}`,
          timeoutMs: 60_000,
          onQueued: (position, etaMs) => {
            ctx.emitToUser('agent:chat:queued', {
              sessionId: ctx.sessionId,
              tool: 'hsgt_flow',
              position,
              etaMs,
              message: `You're #${position} in queue — heavy data tool is busy. Starting in ~${Math.round(etaMs / 1000)}s.`,
            });
          },
        },
      );
      stage.state = 'completed';
      stage.durationMs = Date.now() - startTs;
      // Trim history arrays to 14 most recent rows for the card preview.
      // The synthesis text still gets the full payload via content; only the
      // visual card payload is trimmed.
      const cardData: Record<string, unknown> = {
        direction,
        days,
        ticker: payload.ticker ?? null,
        stock_code: payload.stock_code,
        // Propagate ticker_type ('HK_southbound' / 'A_northbound') so the
        // frontend can render an HK-specific holdings snapshot view vs the
        // A-share NB time-series view. Without this the card defaults to
        // "北向持仓变动" labels even for HK SB queries.
        ticker_type: (payload as any).ticker_type ?? null,
        fetched_at: payload.fetched_at,
      };
      for (const key of [
        'history_沪股通',
        'history_深股通',
        'history_港股通沪',
        'history_港股通深',
      ]) {
        const rows = (payload as any)[key];
        if (Array.isArray(rows) && rows.length > 0) {
          cardData[key] = rows.slice(-14);
        }
      }
      if (payload.summary && Array.isArray(payload.summary.rows)) {
        cardData.summary = payload.summary.rows.slice(0, 8);
      }
      if (Array.isArray(payload.per_stock_holdings)) {
        cardData.per_stock_holdings = payload.per_stock_holdings.slice(-14);
      }
      if (payload.errors && payload.errors.length > 0) {
        cardData.errors = payload.errors;
      }
      stage.rawData = cardData;
      ctx.emitter.emitModule('analysis', 'completed', {
        toolStages: [stage],
      });
      const content = formatPayloadForLLM(payload, direction, days, ticker);
      return {
        ok: true,
        content: content.slice(0, 14000),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stage.state = 'failed';
      stage.durationMs = Date.now() - startTs;
      stage.rawData = { error: message };
      ctx.emitter.emitModule('analysis', 'completed', {
        toolStages: [stage],
        error: message,
      });
      return { ok: false, content: '', error: `hsgt_flow: ${message}` };
    }
  }
}

interface HsgtFlowPayload {
  direction: string;
  days: number;
  ticker?: string | null;
  fetched_at: string;
  stock_code?: string;
  per_stock_holdings?: Array<Record<string, unknown>> | null;
  summary?: { rows: Array<Record<string, unknown>> } | null;
  errors?: string[];
  elapsed_s?: number;
  [key: string]: unknown;  // history_沪股通, history_深股通, etc.
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
  direction: string,
  days: number,
  ticker: string | undefined,
  abortSignal: AbortSignal,
): Promise<HsgtFlowPayload> {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath();
    const scriptPath = path.join(process.cwd(), 'tools', 'stock-analysis', 'fetch_hsgt_flow.py');
    const scriptArgs = ['--direction', direction, '--days', String(days)];
    if (ticker) scriptArgs.push('--ticker', ticker);

    const proc = spawn(pythonPath, [scriptPath, ...scriptArgs], {
      cwd: path.join(process.cwd(), 'tools', 'stock-analysis'),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    const chunks: Buffer[] = [];
    let stderrAccum = '';
    proc.stdout.on('data', (data: Buffer) => chunks.push(data));
    proc.stderr.on('data', (data: Buffer) => { stderrAccum += data.toString('utf-8'); });

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
        // First '{' to last '}' — Python prints a single JSON object on one
        // line. lastIndexOf('{') would land on a nested object inside arrays
        // like history_沪股通 and slice out a broken fragment.
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        if (firstBrace < 0 || lastBrace <= firstBrace) {
          reject(new Error(`no JSON object in output: ${raw.slice(0, 300)}`));
          return;
        }
        const candidate = raw.slice(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(candidate) as HsgtFlowPayload;
        resolve(parsed);
      } catch (e: any) {
        reject(new Error(`JSON parse failed: ${e.message}; raw=${raw.slice(0, 300)}`));
      }
    });
  });
}

function formatPayloadForLLM(p: HsgtFlowPayload, direction: string, days: number, ticker: string | undefined): string {
  const sections: string[] = [];
  sections.push(`# 沪深港通资金流向 (HSGT Stock Connect Flow)`);
  sections.push(`_direction: ${direction}, days: ${days}${ticker ? `, ticker: ${ticker}` : ''}, fetched: ${p.fetched_at}_`);

  // Per-stock takes precedence in narrative. Two flavors:
  //   - A-share ticker (e.g. 600519)        → 北向持仓变动 time series
  //   - HK ticker (e.g. 0700 / 00700)       → 南向持仓快照 (today's holdings)
  const hasTickerData = Boolean(ticker && Array.isArray(p.per_stock_holdings));
  if (hasTickerData) {
    const tType = (p as any).ticker_type;
    const isSouthbound = tType === 'HK_southbound';
    const heading = isSouthbound
      ? `\n## ${p.stock_code} 南向持仓 (港股通买入该港股)  ⭐ THIS IS THE ONLY TICKER-SPECIFIC DATA`
      : `\n## ${p.stock_code} 北向持仓变动（最近 ${days} 期）  ⭐ THIS IS THE ONLY TICKER-SPECIFIC DATA`;
    sections.push(heading);
    if (!p.per_stock_holdings || p.per_stock_holdings.length === 0) {
      sections.push(
        isSouthbound
          ? '⚠️ **(no per-stock data returned)** — 该港股代码未出现在南向持仓表中，可能原因：(a) akshare 该接口当日数据未公开 / (b) 该 ticker 不是港股通标的 / (c) 接口返回格式变化。**ALL channel-level blocks below are NOT specific to this ticker — they cover ALL HK stocks combined. If you need ticker-specific data and it\'s unavailable, say so clearly, do NOT substitute channel-level numbers as if they applied to this single stock.**'
          : '⚠️ **(no per-stock data returned)** — 该 ticker 无北向持仓记录，可能不是 Stock Connect 标的。Do NOT use channel-level data below as a substitute.',
      );
    } else {
      sections.push('```json');
      sections.push(JSON.stringify(p.per_stock_holdings, null, 2));
      sections.push('```');
      if (isSouthbound) {
        sections.push(
          '\n> 注：南向 (港股通) 持仓数据通常是**当日快照**而非时间序列。akshare 的 stock_hsgt_hk_stock_statistics_em 接口返回的是某一天所有港股通标的的持仓排名快照，已过滤到该 ticker。要看历史变化趋势需多次拉取不同日期的快照。',
        );
      }
    }
  }

  // Channel-level histories. When the user asked about a SPECIFIC ticker,
  // these are noise (they cover the whole channel, not the requested stock)
  // and historically confuse the synthesis model into presenting channel
  // aggregates as if they were ticker-specific. Either omit them or wrap
  // them in a HUGE warning header so the model knows not to misuse them.
  const renderHistoryBlock = (channel: string) => {
    const key = `history_${channel}` as const;
    const rows = (p as any)[key] as Array<Record<string, unknown>> | undefined | null;
    if (!Array.isArray(rows)) return;
    const tickerSuffix = hasTickerData
      ? ` ⚠️ CHANNEL-WIDE AGGREGATE — NOT specific to ${p.stock_code || ticker}`
      : '';
    sections.push(`\n## ${channel}（最近 ${days} 个交易日）${tickerSuffix}`);
    if (rows.length === 0) {
      sections.push('(no data)');
      return;
    }
    sections.push('```json');
    sections.push(JSON.stringify(rows, null, 2));
    sections.push('```');
  };

  // When ticker is specified, ONLY render channel histories if user
  // explicitly asked for direction=all (multi-context). For default
  // direction=summary or direction=southbound/northbound, omit them so
  // the model can't mistake channel data for ticker data.
  const shouldRenderChannelHistories = !hasTickerData || direction === 'all';
  if (shouldRenderChannelHistories) {
    if (direction === 'northbound' || direction === 'all') {
      renderHistoryBlock('沪股通');
      renderHistoryBlock('深股通');
    }
    if (direction === 'southbound' || direction === 'all') {
      renderHistoryBlock('港股通沪');
      renderHistoryBlock('港股通深');
    }
  } else if (hasTickerData) {
    sections.push(
      `\n> Channel-level history blocks suppressed because ticker=${ticker} was requested. ` +
      `Pass direction="all" if you also want all-HK-stocks aggregate context, but be ` +
      `careful NOT to attribute channel totals to a single ticker.`,
    );
  }

  if (direction === 'summary' && p.summary && Array.isArray(p.summary.rows)) {
    sections.push(`\n## 今日 4 通道资金流向快照`);
    sections.push('```json');
    sections.push(JSON.stringify(p.summary.rows, null, 2));
    sections.push('```');
  }

  if (p.errors && p.errors.length > 0) {
    sections.push(`\n## Fetch errors (non-fatal)`);
    for (const e of p.errors) sections.push(`- ${e}`);
  }

  sections.push(
    '\n---\n\n' +
    '**For the synthesis model — READ THIS FIRST**: \n\n' +
    '⚠️ **RULE #1 — CHANNEL DATA ≠ TICKER DATA (CRITICAL — recent miss)**: \n' +
    'The "history_沪股通 / history_深股通 / history_港股通沪 / history_港股通深" blocks are **CHANNEL-WIDE AGGREGATES** — they sum across ALL stocks traded via that channel. ' +
    'They are NOT specific to any single ticker. Numbers like "历史累计净买额 3.02 万亿港元" or "持股市值 6.5 万亿" describe the ENTIRE channel\'s position across hundreds of HK stocks, not one stock. ' +
    'If the user asked about a specific ticker (e.g. 腾讯 0700.HK), the ONLY ticker-specific data is under the heading marked "⭐ THIS IS THE ONLY TICKER-SPECIFIC DATA". ' +
    '**Never present channel aggregates as if they were ticker-specific** (e.g. do NOT write "港股通沪对腾讯历史累计净买 3.02 万亿" — that\'s the whole port\'s number, not Tencent\'s). ' +
    'If per-stock data is unavailable for the requested ticker, say so clearly and pivot to qualitative analysis from web_research news, not invented numbers from channel data.\n\n' +
    '⚠️ **RULE #2 — NORTHBOUND DATA-AVAILABILITY CONTEXT (DO NOT FABRICATE)**: \n' +
    '沪深交易所于 **2024 年 8 月 18 日起永久取消了北向资金 (沪股通 / 深股通) 实时净买卖数据的公开披露**。' +
    '现在 akshare 返回的"当日成交净买额"、"当日资金流入"、"历史累计净买额"等北向字段持续为 null 或 0，是**制度性数据空缺**，不是某一天通道关闭。' +
    '在解读这些 null/0 时，**必须明确告知用户这一制度背景**——不要编造"今日港股假期"、"通道暂停"、"明日重开后"之类的临时性解释。' +
    '同样的限制不适用于**南向资金（港股通沪/港股通深）**——南向数据仍正常发布，可以按字面值解读。\n\n' +
    '**字段释义**：\n' +
    '- 交易状态字段含义不稳定，跨版本变化；不要凭状态码字面值推断"通道是否开放"——状态码 3 + 北向 0 净买额是 **2024-08 后的常态**，不是异常。\n' +
    '- 南向"当日成交净买额"正负仍有意义：正值 = 净买入港股，负值 = 净卖出港股。\n' +
    '- 南向累计净流入趋势仍是有效信号——人民币贬值预期 / 港股估值低位时南向通常增加。\n\n' +
    '**关于"5 日累计净流入超过 30 亿/日"这类阈值**：\n' +
    '- 历史上对**北向**适用，但 2024-08 后该指标已无法从公开数据观测。\n' +
    '- 对**南向**仍可使用（南向数据完整披露中）。\n\n' +
    '**引用规范**：数据来源标注 `东方财富沪深港通`。数据时点：T+0 当日盘后更新。\n' +
    '**如果北向字段全为 0/null，回复中应包含一段说明制度变化的段落，并将分析重心转移到：(1) 南向资金（数据正常）、(2) 价格行为 / 成交量 / 上涨下跌家数比这些替代信号、(3) 月末公开的累计持股市值快照（仍披露）。**'
  );

  return sections.join('\n');
}
