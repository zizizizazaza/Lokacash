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
      '--message', message,
      '--session-id', sessionId,
    ], {
      cwd: path.join(process.cwd(), 'tools', 'stock-analysis'),
      env: env as NodeJS.ProcessEnv,
    });

    let stdoutBuffer = '';

    // stdout: JSONL structured events (one JSON per line)
    pythonProcess.stdout.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString('utf-8');
      const lines = stdoutBuffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event: StepEvent = JSON.parse(trimmed);

          // Store in buffer for reconnection replay
          buffer.steps.push(event);

          if (event.type === 'done') {
            buffer.status = 'done';
            buffer.finalReport = event.content || '';
            onDone(event.content || '');
            this.scheduleCleanup(sessionId);
          } else if (event.type === 'error') {
            buffer.status = 'error';
            onError(event.message || 'Unknown error');
            this.scheduleCleanup(sessionId);
          } else {
            // Forward step events (thinking, tool_start, tool_done, generating)
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
      const logs = data.toString('utf-8').split('\n');
      for (const logLine of logs) {
        const clean = logLine.trim();
        if (clean && !clean.includes('Tushare Token') && !clean.includes('通知渠道')) {
          console.log(`[StockAnalysis Log] ${clean}`);
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
