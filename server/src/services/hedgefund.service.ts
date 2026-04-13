import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server/src/services -> server/tools/ai-hedge-fund
const HEDGE_FUND_PATH = path.join(__dirname, '../../tools/ai-hedge-fund');

export interface HedgeFundOptions {
  tickers: string[];
  model?: string;
  provider?: string;
  analysts?: string[];
  startDate?: string;
  endDate?: string;
  initialCash?: number;
  showReasoning?: boolean;
}

export interface HedgeFundResult {
  tickers: string[];
  start_date: string;
  end_date: string;
  analysts: string[];
  model: string;
  decisions: Record<string, {
    action: string;
    quantity: number;
    confidence: number;
    reasoning: string;
  }>;
  analyst_signals: Record<string, Record<string, {
    signal: string;
    confidence: number;
    reasoning: string;
  }>>;
}

export const hedgefundService = {
  runAnalysis(
    options: HedgeFundOptions,
    onProgress?: (log: string) => void
  ): Promise<HedgeFundResult> {
    const args = [
      path.join(HEDGE_FUND_PATH, 'run_headless.py'),
      '--tickers', options.tickers.join(','),
    ];

    const model = options.model || process.env.LOKA_AI_MODEL || 'deepseek-chat';
    const provider = options.provider || process.env.LOKA_AI_PROVIDER || 'DeepSeek';

    args.push('--model', model);
    args.push('--provider', provider);
    if (options.analysts && options.analysts.length > 0) {
      args.push('--analysts', options.analysts.join(','));
    }
    if (options.startDate) {
      args.push('--start-date', options.startDate);
    }
    if (options.endDate) {
      args.push('--end-date', options.endDate);
    }
    if (options.initialCash) {
      args.push('--initial-cash', String(options.initialCash));
    }
    if (options.showReasoning) {
      args.push('--show-reasoning');
    }

    return new Promise<HedgeFundResult>((resolve, reject) => {
      const isWin = process.platform === 'win32';
      let pythonExe = isWin ? 'python' : 'python3';

      // Use local virtual environment if it exists (for automated server deployments)
      const venvPath = path.join(HEDGE_FUND_PATH, '.venv');
      if (fs.existsSync(venvPath)) {
        pythonExe = isWin
          ? path.join(venvPath, 'Scripts', 'python.exe')
          : path.join(venvPath, 'bin', 'python');
      }

      console.log(`[hedgefundService] Starting analysis for: ${options.tickers.join(', ')} (Executable: ${pythonExe})`);

      const child = spawn(pythonExe, args, {
        cwd: HEDGE_FUND_PATH,
        env: { 
          ...process.env, 
          PYTHONIOENCODING: 'utf-8', 
          PYTHONUTF8: '1',
          // Auto-map Loka's platform API key to standard provider keys so ai-hedge-fund can pick them up
          DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || process.env.LOKA_AI_API_KEY,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY || process.env.LOKA_AI_API_KEY,
          OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || (process.env.LOKA_AI_BASE_URL ? process.env.LOKA_AI_BASE_URL.replace('/chat/completions', '') : undefined),
          OPENAI_API_BASE: process.env.OPENAI_API_BASE || (process.env.LOKA_AI_BASE_URL ? process.env.LOKA_AI_BASE_URL.replace('/chat/completions', '') : undefined),
          DEEPSEEK_API_BASE: process.env.DEEPSEEK_API_BASE || (process.env.LOKA_AI_BASE_URL ? process.env.LOKA_AI_BASE_URL.replace('/chat/completions', '') : undefined),
        },
      });

      let stdoutData = '';
      let stderrData = '';

      child.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        stderrData += text;
        if (onProgress && text.trim()) {
          // Stream each line of stderr as a progress update
          text.trim().split('\n').forEach((line: string) => {
            if (line.trim()) onProgress(line.trim());
          });
        }
      });

      // 5 minutes hard timeout
      const timeoutSec = 300;
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Timeout after ${timeoutSec} seconds`));
      }, timeoutSec * 1000);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          console.error('[hedgefundService] Execution error:', stderrData);
          return reject(new Error(`AI Hedge Fund script exited with code ${code}:\n${stderrData}`));
        }

        try {
          const result = JSON.parse(stdoutData.trim());
          if (result.error) {
            return reject(new Error(result.error));
          }
          resolve(result as HedgeFundResult);
        } catch (parseErr) {
          console.error('[hedgefundService] Failed to parse output:', stdoutData.slice(0, 500));
          reject(new Error(`Failed to parse AI Hedge Fund output: ${(parseErr as Error).message}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  },

  /**
   * Format the raw result into a human-readable markdown report
   */
  formatReport(result: HedgeFundResult, fullReasoning = false): string {
    const lines: string[] = [];

    lines.push(`## AI Hedge Fund Analysis Report`);
    lines.push(`**Tickers:** ${result.tickers.join(', ')}  `);
    lines.push(`**Period:** ${result.start_date} → ${result.end_date}  `);
    lines.push(`**Model:** ${result.model}  `);
    lines.push(`**Analysts:** ${result.analysts.map(a => a.replace(/_/g, ' ')).map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(', ')}  `);
    lines.push('');

    // Trading Decisions
    if (result.decisions) {
      for (const [ticker, decision] of Object.entries(result.decisions)) {
        lines.push(`### ${ticker} — Trading Decision`);
        const actionEmoji = decision.action?.toUpperCase() === 'BUY' ? '🟢' :
                           decision.action?.toUpperCase() === 'SELL' ? '🔴' :
                           decision.action?.toUpperCase() === 'SHORT' ? '🔴' : '🟡';
        lines.push(`- **Action:** ${actionEmoji} ${(decision.action || 'N/A').toUpperCase()}`);
        lines.push(`- **Quantity:** ${decision.quantity ?? 'N/A'}`);
        lines.push(`- **Confidence:** ${decision.confidence != null ? decision.confidence.toFixed(1) + '%' : 'N/A'}`);
        if (decision.reasoning) {
          lines.push(`- **Reasoning:** ${decision.reasoning}`);
        }
        lines.push('');
      }
    }

    // Analyst Signals
    if (result.analyst_signals && Object.keys(result.analyst_signals).length > 0) {
      if (fullReasoning) {
        // Full format: each analyst gets a subsection with complete reasoning
        lines.push(`### Analyst Signals (Detailed)`);
        lines.push('');
        for (const [agent, signals] of Object.entries(result.analyst_signals)) {
          for (const [ticker, signal] of Object.entries(signals)) {
            const sigEmoji = signal.signal?.toUpperCase() === 'BULLISH' ? '🟢' :
                            signal.signal?.toUpperCase() === 'BEARISH' ? '🔴' : '🟡';
            lines.push(`**${agent}** — ${ticker}: ${sigEmoji} ${signal.signal} (${signal.confidence}%)`);
            if (signal.reasoning) {
              lines.push(signal.reasoning);
            }
            lines.push('');
          }
        }
      } else {
        // Compact table format with truncated reasoning
        lines.push(`### Analyst Signals`);
        lines.push('');
        lines.push('| Analyst | Ticker | Signal | Confidence | Key Reasoning |');
        lines.push('|---------|--------|--------|------------|---------------|');

        for (const [agent, signals] of Object.entries(result.analyst_signals)) {
          for (const [ticker, signal] of Object.entries(signals)) {
            const sigEmoji = signal.signal?.toUpperCase() === 'BULLISH' ? '🟢' :
                            signal.signal?.toUpperCase() === 'BEARISH' ? '🔴' : '🟡';
            const reasoning = signal.reasoning ? signal.reasoning.slice(0, 80) + (signal.reasoning.length > 80 ? '...' : '') : '';
            lines.push(`| ${agent} | ${ticker} | ${sigEmoji} ${signal.signal} | ${signal.confidence}% | ${reasoning} |`);
          }
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }
};
