import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';

// ── Step event types (matching Python run_agent_stream.py output) ──
export interface StepEvent {
  type: 'thinking' | 'tool_start' | 'tool_done' | 'generating' | 'done' | 'error';
  step?: number;
  tool?: string;
  displayName?: string;
  message?: string;
  success?: boolean;
  duration?: number;
  content?: string;
  totalSteps?: number;
  error?: string;
  ts: number;
}

export interface SessionEventBuffer {
  sessionId: string;
  userId: string;
  status: 'running' | 'done' | 'error';
  steps: StepEvent[];
  finalReport?: string;
  startedAt: number;
}

class StockAnalysisService extends EventEmitter {
  // ── Event buffer for reconnection support ──
  private sessionBuffers = new Map<string, SessionEventBuffer>();
  private cleanupTimers = new Map<string, NodeJS.Timeout>();

  // Buffer TTL: 5 minutes after completion
  private static BUFFER_TTL_MS = 5 * 60 * 1000;

  private parseEnvBool(value: string | undefined, defaultValue = false): boolean {
    if (typeof value !== 'string' || !value.trim()) return defaultValue;
    return /^(1|true|yes|on)$/i.test(value.trim());
  }

  private extractTickersFromMessage(message: string): string[] {
    const cleaned = String(message || '')
      .replace(/^analyze\s*:\s*/i, '')
      .replace(/\s+using\s+stock\s+analysis\s+agent.*$/i, '')
      .trim();

    if (!cleaned) return [];

    const rawParts = cleaned
      .split(/[\s,，;；、]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const candidates = rawParts.filter((part) => {
      if (part.length < 2 || part.length > 20) return false;
      return /[A-Za-z0-9]/.test(part);
    });

    return Array.from(new Set(candidates));
  }

  private getPythonPath(): string {
    const isWindows = process.platform === 'win32';
    const venvPath = path.join(process.cwd(), 'tools', 'stock-analysis', '.venv');
    
    if (fs.existsSync(venvPath)) {
      if (isWindows) {
        return path.join(venvPath, 'Scripts', 'python.exe');
      } else {
        return path.join(venvPath, 'bin', 'python');
      }
    }
    
    return isWindows ? 'python' : 'python3';
  }

  /**
   * Get the event buffer for a session (for reconnection replay).
   */
  public getSessionBuffer(sessionId: string): SessionEventBuffer | undefined {
    return this.sessionBuffers.get(sessionId);
  }

  public runStreamAnalysis(
    message: string,
    sessionId: string,
    userId: string,
    onStep: (event: StepEvent) => void,
    onDone: (report: string) => void,
    onError: (error: string) => void,
  ): void {
    console.log(`[StockAnalysis] Starting stream analysis for: "${message.slice(0, 50)}..."`);
    const startedAt = Date.now();

    // Initialize event buffer
    const buffer: SessionEventBuffer = {
      sessionId,
      userId,
      status: 'running',
      steps: [],
      startedAt: Date.now(),
    };
    this.sessionBuffers.set(sessionId, buffer);

    // Clear any existing cleanup timer
    const existingTimer = this.cleanupTimers.get(sessionId);
    if (existingTimer) clearTimeout(existingTimer);

    const pythonPath = this.getPythonPath();
    const scriptPath = path.join(process.cwd(), 'tools', 'stock-analysis', 'run_agent_stream.py');

    const rootEnvPath = path.resolve(process.cwd(), '.env');

    // Construct environment variables
    const env: Record<string, string | undefined> = {
      ...process.env,
      ENV_FILE: rootEnvPath,
      PYTHONIOENCODING: 'utf-8',
    };

    const disableSearxng = this.parseEnvBool(env.STOCK_ANALYSIS_DISABLE_SEARXNG, false);
    const disableSerpapi = this.parseEnvBool(env.STOCK_ANALYSIS_DISABLE_SERPAPI, false);
    if (disableSearxng) {
      env.SEARXNG_PUBLIC_INSTANCES_ENABLED = 'false';
      env.SEARXNG_BASE_URLS = '';
    }
    if (disableSerpapi) {
      env.SERPAPI_API_KEYS = '';
    }

    if (env.LOKA_AI_API_KEY) {
      env.AIHUBMIX_KEY = env.LOKA_AI_API_KEY;
      env.OPENAI_API_KEY = env.LOKA_AI_API_KEY;
    }
    if (env.LOKA_AI_MODEL) {
      env.OPENAI_MODEL = env.LOKA_AI_MODEL;
      env.LITELLM_MODEL = `openai/${env.LOKA_AI_MODEL}`;
    }
    if (env.LOKA_AI_BASE_URL) {
      const baseUrl = env.LOKA_AI_BASE_URL.replace('/chat/completions', '');
      env.OPENAI_API_BASE = baseUrl;
      env.OPENAI_BASE_URL = baseUrl;
    }

    const forceHeadless = this.parseEnvBool(env.STOCK_ANALYSIS_FORCE_HEADLESS, false);

    const searxBaseUrls = (env.SEARXNG_BASE_URLS || '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
    const searxPublicEnabled = this.parseEnvBool(env.SEARXNG_PUBLIC_INSTANCES_ENABLED, true);
    console.log(
      `[StockAnalysis] Search config: tavily=${Boolean(env.TAVILY_API_KEYS)} bocha=${Boolean(env.BOCHA_API_KEYS)} serpapi=${Boolean(env.SERPAPI_API_KEYS)} searxPublic=${searxPublicEnabled} searxSelfHosted=${searxBaseUrls.length} disableSearxng=${disableSearxng} disableSerpapi=${disableSerpapi} forceHeadless=${forceHeadless}`,
    );

    if (forceHeadless) {
      const tickers = this.extractTickersFromMessage(message);
      if (tickers.length === 0) {
        const errMsg = 'Headless mode requires at least one resolvable ticker in message.';
        console.warn(`[StockAnalysis] ${errMsg} message="${message.slice(0, 120)}"`);
        buffer.steps.push({
          type: 'error',
          step: 1,
          message: errMsg,
          error: errMsg,
          ts: Date.now(),
        });
        buffer.status = 'error';
        onError(errMsg);
        this.scheduleCleanup(sessionId);
        return;
      }

      const startStep: StepEvent = {
        type: 'tool_start',
        step: 1,
        tool: 'headless_pipeline',
        displayName: 'Running headless stock analysis',
        ts: Date.now(),
      };
      buffer.steps.push(startStep);
      onStep(startStep);
      console.log(`[StockAnalysis] Headless mode enabled. tickers=${tickers.join(', ')}`);

      let headlessReport = '';
      this.runAnalysis(
        { tickers },
        sessionId,
        undefined,
        (report) => {
          headlessReport = report || '';
        },
      ).then(() => {
        const doneStep: StepEvent = {
          type: 'tool_done',
          step: 1,
          tool: 'headless_pipeline',
          displayName: 'Running headless stock analysis',
          success: true,
          duration: Math.max(0, (Date.now() - startedAt) / 1000),
          ts: Date.now(),
        };
        buffer.steps.push(doneStep);
        onStep(doneStep);

        const doneEvent: StepEvent = {
          type: 'done',
          step: 1,
          totalSteps: 1,
          content: headlessReport || 'Headless analysis completed (empty report).',
          ts: Date.now(),
        };
        buffer.steps.push(doneEvent);
        buffer.status = 'done';
        buffer.finalReport = doneEvent.content;
        onDone(doneEvent.content || '');
        this.scheduleCleanup(sessionId);
      }).catch((err: any) => {
        const errorMsg = err?.message || 'Headless analysis failed';
        const failStep: StepEvent = {
          type: 'tool_done',
          step: 1,
          tool: 'headless_pipeline',
          displayName: 'Running headless stock analysis',
          success: false,
          duration: Math.max(0, (Date.now() - startedAt) / 1000),
          ts: Date.now(),
        };
        buffer.steps.push(failStep);
        onStep(failStep);
        buffer.steps.push({ type: 'error', step: 1, message: errorMsg, error: errorMsg, ts: Date.now() });
        buffer.status = 'error';
        onError(errorMsg);
        this.scheduleCleanup(sessionId);
      });
      return;
    }

    // Use a unique session ID per analysis to prevent conversation history pollution.
    // The Python agent's conversation_manager stores past turns keyed by session_id;
    // reusing the same ID causes old (tool-less) responses to contaminate the LLM context,
    // making it skip tool calls entirely.
    const analysisSessionId = `${sessionId}_analysis_${Date.now()}`;

    const pythonProcess = spawn(pythonPath, [
      scriptPath,
      '--message', message,
      '--session-id', analysisSessionId,
    ], {
      cwd: path.join(process.cwd(), 'tools', 'stock-analysis'),
      env: env as NodeJS.ProcessEnv,
    });

    let stdoutBuffer = '';
    let stdoutChunks = 0;
    let stdoutBytes = 0;
    let stderrChunks = 0;
    let stderrBytes = 0;
    let firstStdoutAt: number | null = null;
    let firstStderrAt: number | null = null;
    let providerListLogCount = 0;
    let providerListSuppressedCount = 0;
    let agentMaxStepSeen = 0;
    let agentTotalStepsFromDone: number | null = null;

    // stdout: JSONL structured events (one JSON per line)
    pythonProcess.stdout.on('data', (data: Buffer) => {
      stdoutChunks += 1;
      stdoutBytes += data.length;
      if (firstStdoutAt === null) firstStdoutAt = Date.now();
      stdoutBuffer += data.toString('utf-8');
      const lines = stdoutBuffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event: StepEvent = JSON.parse(trimmed);
          if (typeof event.step === 'number' && Number.isFinite(event.step)) {
            agentMaxStepSeen = Math.max(agentMaxStepSeen, event.step);
          }
          if (event.type === 'done' && typeof event.totalSteps === 'number' && Number.isFinite(event.totalSteps)) {
            agentTotalStepsFromDone = event.totalSteps;
          }

          const isUiMetadata = (e: StepEvent) =>
            e.type === 'generating' && e.message === '[UI_METADATA]';

          // Live UI：每个 token/chunk 都转发；缓冲：合并连续的 generating 正文，避免万级 JSONL 撑爆内存
          if (event.type === 'done') {
            buffer.steps.push(event);
            buffer.status = 'done';
            buffer.finalReport = event.content || '';
            onDone(event.content || '');
            this.scheduleCleanup(sessionId);
          } else if (event.type === 'error') {
            buffer.steps.push(event);
            buffer.status = 'error';
            onError(event.message || 'Unknown error');
            this.scheduleCleanup(sessionId);
          } else {
            if (
              event.type === 'generating' &&
              typeof event.content === 'string' &&
              event.content &&
              !isUiMetadata(event)
            ) {
              const last = buffer.steps[buffer.steps.length - 1];
              if (last?.type === 'generating' && !isUiMetadata(last)) {
                last.content = (last.content || '') + event.content;
                last.ts = event.ts;
              } else {
                buffer.steps.push({ ...event });
              }
            } else {
              buffer.steps.push(event);
            }
            onStep(event);
          }
        } catch (e) {
          // Not valid JSON — skip (could be Python startup noise)
          console.warn(`[StockAnalysis] Non-JSON stdout line: ${trimmed.slice(0, 100)}`);
        }
      }
    });

    // stderr: Python logs (for debugging, not forwarded to frontend)
    pythonProcess.stderr.on('data', (data: Buffer) => {
      stderrChunks += 1;
      stderrBytes += data.length;
      if (firstStderrAt === null) firstStderrAt = Date.now();
      const logs = data.toString('utf-8').split('\n');
      for (const logLine of logs) {
        const clean = logLine.trim();
        if (clean) {
          if (clean.includes('[UI_METADATA]')) {
             try {
                const jsonStr = clean.split('[UI_METADATA]')[1].trim();
                const metadata = JSON.parse(jsonStr);
                // Fire metadata generic StepEvent or specially handle it (added to buffer or callback)
                onStep({ type: 'generating', message: '[UI_METADATA]', content: jsonStr, ts: Date.now() });
             } catch(e) {}
             continue;
          }
          if (!clean.includes('Tushare Token') && !clean.includes('通知渠道')) {
            if (clean.startsWith('Provider List: https://docs.litellm.ai/docs/providers')) {
              providerListLogCount += 1;
              if (providerListLogCount > 1) {
                providerListSuppressedCount += 1;
                continue;
              }
            }
            console.log(`[StockAnalysis Log] ${clean}`);
          }
        }
      }
    });

    pythonProcess.on('close', (code) => {
      // Flush any remaining stdout
      if (stdoutBuffer.trim()) {
        try {
          const event: StepEvent = JSON.parse(stdoutBuffer.trim());
          buffer.steps.push(event);
          if (event.type === 'done') {
            buffer.status = 'done';
            buffer.finalReport = event.content || '';
            onDone(event.content || '');
          } else if (event.type === 'error') {
            buffer.status = 'error';
            onError(event.message || 'Unknown error');
          }
        } catch (_) {}
      }

      if (code !== 0 && buffer.status === 'running') {
        buffer.status = 'error';
        const errorMsg = `Process exited with code ${code}`;
        onError(errorMsg);
      }

      const elapsedMs = Date.now() - startedAt;
      const firstStdoutMs = firstStdoutAt ? firstStdoutAt - startedAt : -1;
      const firstStderrMs = firstStderrAt ? firstStderrAt - startedAt : -1;
      const agentRounds = forceHeadless
        ? 0
        : (agentTotalStepsFromDone ?? agentMaxStepSeen);
      console.log(
        `[StockAnalysis Timing] total_s=${(elapsedMs / 1000).toFixed(3)} first_stdout_s=${firstStdoutMs >= 0 ? (firstStdoutMs / 1000).toFixed(3) : 'n/a'} first_stderr_s=${firstStderrMs >= 0 ? (firstStderrMs / 1000).toFixed(3) : 'n/a'} stdout_chunks=${stdoutChunks} stdout_bytes=${stdoutBytes} stderr_chunks=${stderrChunks} stderr_bytes=${stderrBytes} provider_list_logs=${providerListLogCount} provider_list_suppressed=${providerListSuppressedCount} agent_rounds=${agentRounds} agent_rounds_source=${agentTotalStepsFromDone != null ? 'done.totalSteps' : 'max(step)'} exit_code=${code}`,
      );

      this.scheduleCleanup(sessionId);
    });

    pythonProcess.on('error', (err) => {
      console.error(`[StockAnalysis] Process error:`, err);
      buffer.status = 'error';
      onError(err.message);
      this.scheduleCleanup(sessionId);
    });
  }

  /**
   * Schedule cleanup of a session buffer after TTL.
   */
  private scheduleCleanup(sessionId: string): void {
    const existing = this.cleanupTimers.get(sessionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.sessionBuffers.delete(sessionId);
      this.cleanupTimers.delete(sessionId);
      console.log(`[StockAnalysis] Cleaned up buffer for session ${sessionId}`);
    }, StockAnalysisService.BUFFER_TTL_MS);

    this.cleanupTimers.set(sessionId, timer);
  }

  // ── Legacy method (kept for backward compatibility with AutoMode routing) ──
  public runAnalysis(options: { tickers: string[] }, sessionId: string, onProgress?: (log: string) => void, onDone?: (report: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[StockAnalysis] Starting legacy analysis for: ${options.tickers.join(', ')}`);
      
      const pythonPath = this.getPythonPath();
      const scriptPath = path.join(process.cwd(), 'tools', 'stock-analysis', 'run_headless.py');
      const tickersArg = options.tickers.join(',');
      
      const rootEnvPath = path.resolve(process.cwd(), '.env');
      
      const env: Record<string, string | undefined> = { 
        ...process.env, 
        ENV_FILE: rootEnvPath,
        PYTHONIOENCODING: 'utf-8'
      };
      
      if (env.LOKA_AI_API_KEY) {
        env.AIHUBMIX_KEY = env.LOKA_AI_API_KEY;
        env.OPENAI_API_KEY = env.LOKA_AI_API_KEY;
      }
      if (env.LOKA_AI_MODEL) {
        env.OPENAI_MODEL = env.LOKA_AI_MODEL;
        env.LITELLM_MODEL = `openai/${env.LOKA_AI_MODEL}`;
      }
      if (env.LOKA_AI_BASE_URL) {
        const baseUrl = env.LOKA_AI_BASE_URL.replace('/chat/completions', '');
        env.OPENAI_API_BASE = baseUrl;
        env.OPENAI_BASE_URL = baseUrl;
      }

      const pythonProcess = spawn(pythonPath, [
        scriptPath,
        '--tickers', tickersArg
      ], {
        cwd: path.dirname(scriptPath),
        env: env as NodeJS.ProcessEnv
      });

      const jsonChunks: Buffer[] = [];

      pythonProcess.stdout.on('data', (data: Buffer) => {
        jsonChunks.push(data);
      });

      pythonProcess.stderr.on('data', (data) => {
        const logs = data.toString().split('\n');
        for (const logLine of logs) {
          const cleanLog = logLine.trim();
          if (cleanLog) {
            if (cleanLog.includes('Tushare Token') || cleanLog.includes('通知渠道')) continue;
            console.log(`[StockAnalysis Log] ${cleanLog}`);
            if (onProgress) onProgress(cleanLog);
          }
        }
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`[StockAnalysis] Process exited with code ${code}`);
          reject(new Error(`Process exited with code ${code}`));
          return;
        }

        let jsonBuffer = '';
        try {
          jsonBuffer = Buffer.concat(jsonChunks).toString('utf-8');
          const jsonMatch = jsonBuffer.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON object found in output");
          
          const reportData = JSON.parse(jsonMatch[0]);
          let finalReport = "";
          for (const [ticker, data] of Object.entries((reportData as any))) {
             if ((data as any).markdown) {
                 finalReport += `\n${(data as any).markdown}\n`;
             } else if ((data as any).error) {
                 finalReport += `\n**⚠️ Error analyzing ${ticker}:** ${(data as any).error}\n`;
             }
          }
          
          console.log(`[StockAnalysis] Analysis complete for ${options.tickers.join(', ')}`);
          if (onDone) onDone(finalReport);
          resolve();
        } catch (e: any) {
          console.error(`[StockAnalysis] Failed to parse output! Error: ${e.message}`);
          reject(new Error(`Failed to parse AI output: ${e.message}`));
        }
      });

      pythonProcess.on('error', (err) => {
        console.error(`[StockAnalysis] Process error:`, err);
        reject(err);
      });
    });
  }
}

export const stockAnalysisService = new StockAnalysisService();
