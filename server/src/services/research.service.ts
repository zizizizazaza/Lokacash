import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { sourcesFromLast30DaysCompact, type SignalSearchSource } from './signalRadarThinking.js';
import { stripInternalResearchCitations } from '../utils/researchCitations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LAST30DAYS_PATH = path.join(__dirname, '../../tools/last30days-skill');

/** OpenAI-compatible chat completions streaming (SSE). Returns full text. */
async function streamChatCompletion(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  onToken: (chunk: string) => void,
  timeoutMs: number,
): Promise<string> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream: true,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Synthesis API error (${response.status}): ${errText.slice(0, 800)}`);
  }

  const body = response.body;
  if (!body) {
    throw new Error('Synthesis API returned empty body');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: string };
            message?: { content?: string };
          }>;
        };
        const choice = json.choices?.[0];
        const piece =
          choice?.delta?.content ??
          (typeof choice?.message?.content === 'string' ? choice.message.content : '');
        if (piece) {
          full += piece;
          onToken(piece);
        }
      } catch {
        /* ignore malformed SSE fragments */
      }
    }
  }

  const tail = buffer.trim();
  if (tail.startsWith('data:')) {
    const data = tail.slice(5).trim();
    if (data && data !== '[DONE]') {
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const piece = json.choices?.[0]?.delta?.content;
        if (piece) {
          full += piece;
          onToken(piece);
        }
      } catch {
        /* ignore */
      }
    }
  }

  return full.trim();
}

/** Legacy: single callback receives stderr lines (with \\n) + synthesis tokens. Structured: split research log vs chat stream. */
export type DeepResearchProgress =
  | ((chunk: string) => void)
  | {
      onResearchLine?: (line: string) => void;
      onSynthesisToken?: (chunk: string) => void;
    };

export const researchService = {
  runDeepResearch(
    topic: string,
    options: { deep?: boolean; days?: number } = {},
    progress?: DeepResearchProgress,
  ) {
    const args = [
      path.join(LAST30DAYS_PATH, 'scripts', 'last30days.py'),
      topic,
      options.deep ? '--deep' : '--quick',
      options.days ? `--days=${options.days}` : '--days=30',
    ].filter(Boolean) as string[];

    if (process.env.EXA_API_KEY) {
      args.push('--include-web');
    }

    return new Promise<{
      summary: string;
      topic: string;
      timestamp: string;
      extractedSources: SignalSearchSource[];
    }>((resolve, reject) => {
      const isWin = process.platform === 'win32';
      const pythonExe = isWin ? 'python' : 'python3';

      const emitResearchLine = (line: string) => {
        if (!progress) return;
        if (typeof progress === 'function') progress(line + '\n');
        else progress.onResearchLine?.(line);
      };
      const emitSynthToken = (chunk: string) => {
        if (!progress) return;
        if (typeof progress === 'function') progress(chunk);
        else progress.onSynthesisToken?.(chunk);
      };

      console.log(`[researchService] Starting deep research on: "${topic}"`);

      const child = spawn(pythonExe, args, {
        cwd: LAST30DAYS_PATH,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      });

      let stdoutData = '';
      let stderrData = '';
      let stderrLineBuf = '';

      child.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        stderrData += text;
        stderrLineBuf += text;
        const parts = stderrLineBuf.split(/\r?\n/);
        stderrLineBuf = parts.pop() ?? '';
        for (const raw of parts) {
          const line = raw.trim();
          if (line) emitResearchLine(line);
        }
      });

      // 5 minutes hard timeout
      const timeoutSec = options.deep ? 300 : 180;
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Timeout after ${timeoutSec} seconds`));
      }, timeoutSec * 1000);

      child.on('close', async (code) => {
        clearTimeout(timer);
        if (stderrLineBuf.trim()) {
          emitResearchLine(stderrLineBuf.trim());
          stderrLineBuf = '';
        }
        if (code !== 0) {
          console.error('[researchService] Execution error:', stderrData);
          return reject(new Error(`Script exited with code ${code}:\n${stderrData}`));
        }

        let finalSummary = stdoutData.trim();
        const extractedSources = sourcesFromLast30DaysCompact(stdoutData);

        // Optional AI synthesis — tokens go to emitSynthToken only (main chat stream); status lines → research log
        if (process.env.LOKA_AI_API_KEY && process.env.LOKA_AI_BASE_URL && process.env.LOKA_AI_MODEL) {
          try {
            emitResearchLine('⏳ AI Synthesis：Generating final report…');

            let apiUrl = process.env.LOKA_AI_BASE_URL.replace(/\/$/, '');
            if (!apiUrl.endsWith('/chat/completions')) {
              apiUrl += '/chat/completions';
            }

            const synthesisMessages = [
              {
                role: 'system',
                content: `You are an expert research analyst. I will provide you with a raw data report scraped from multiple sources (Reddit, YouTube, etc) about a specific topic.
Your job is to synthesize this raw data into a highly readable, professional, and well-structured briefing.
Rules:
1. Use clear, engaging headings regarding the topic.
2. Group related themes and summarize what people are actually saying.
3. Quote specific top comments or transcript highlights if they are particularly insightful, using block quotes (> ...).
4. Do NOT just list the sources one by one. Synthesize the narrative!
5. Include a "Key Patterns" section at the end with numbered insights. The numbering MUST start from 1 and be contiguous (1, 2, 3...).
6. Keep the formatting in clean Markdown. Use **bold** for emphasis, use headings (##) for sections.
7. NEVER invent data - strictly use ONLY what is present in the raw report.
8. Do NOT include a report title - the frontend will handle that.
9. Do NOT mention model names or generation metadata.
10. Keep it concise but insightful. Aim for 400-800 words.
11. When citing specific threads, posts, videos, or news pages, add Markdown links [short label](exact_url) using URLs that appear as plain https lines in the raw report — never invent URLs.
12. CITATIONS FOR END USERS: The raw data may contain internal IDs like R1, X2, W3 on source rows. These are NOT for readers. NEVER output parenthetical codes like (W1), (W7, W2, W8), (X3), or (R2) — users cannot interpret them. Instead: cite with readable Markdown links [Publication or site name](exact_url) using URLs from the raw report, and/or name the outlet in plain language (e.g. "GlobeNewswire reported…" with a link on the name). Multiple sources: use several short links or name 2–3 outlets in one sentence.`,
              },
              {
                role: 'user',
                content: `Here is the raw research report to synthesize for topic "${topic}":

(The lines like **W1** / **X2** / **R3** in the raw data are internal source labels. Do not repeat those codes in your answer; use links and publication names as instructed.)

---

${finalSummary}`,
              },
            ];

            const wantStream =
              process.env.LOKA_AI_STREAM !== 'false' && process.env.LOKA_AI_STREAM !== '0';

            const runNonStreamSynthesis = async () => {
              const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${process.env.LOKA_AI_API_KEY}`,
                },
                body: JSON.stringify({
                  model: process.env.LOKA_AI_MODEL,
                  messages: synthesisMessages,
                  temperature: 0.3,
                }),
                signal: AbortSignal.timeout(120000),
              });
              if (response.ok) {
                const data = (await response.json()) as any;
                if (data.choices && data.choices[0]?.message?.content) {
                  finalSummary = data.choices[0].message.content.trim();
                  emitResearchLine('✓ AI Synthesis：Report generated (non-streaming)');
                  return true;
                }
              } else {
                const errText = await response.text();
                console.error('[researchService] AI Synthesis API error:', errText);
                emitResearchLine(`❌ AI Synthesis API Error (${response.status}). Using original search results.`);
              }
              return false;
            };

            if (wantStream) {
              try {
                finalSummary = await streamChatCompletion(
                  apiUrl,
                  process.env.LOKA_AI_API_KEY,
                  process.env.LOKA_AI_MODEL!,
                  synthesisMessages,
                  0.3,
                  (chunk) => emitSynthToken(chunk),
                  120000,
                );
                emitResearchLine('✓ AI Synthesis：Streaming generation completed');
              } catch (streamErr: any) {
                console.warn('[researchService] AI Synthesis streaming failed, using non-stream:', streamErr?.message);
                await runNonStreamSynthesis();
              }
            } else {
              await runNonStreamSynthesis();
            }
          } catch (err: any) {
            console.error('[researchService] AI Synthesis exception:', err);
            emitResearchLine('❌ AI Synthesis network error, using original search results.');
          }
        }

        resolve({
          summary: stripInternalResearchCitations(finalSummary),
          topic,
          timestamp: new Date().toISOString(),
          extractedSources,
        });
      });
      
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
};
