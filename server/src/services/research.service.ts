import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { sourcesFromLast30DaysCompact, type SignalSearchSource } from './signalRadarThinking.js';
import { stripInternalResearchCitations } from '../utils/researchCitations.js';

const __filename = fileURLToPath(import.meta.url);

/** Parsed from last30days compact output [INTERNAL_X_PROFILES] JSON (X/Twitter author stats). */
export type XProfileSnapshot = {
  handle: string;
  followers?: number;
  following?: number;
  joinedRaw?: string;
  joinedDisplay?: string;
};

const INTERNAL_X_PROFILE_RE = /\[INTERNAL_X_PROFILES\]\s*([\s\S]*?)\s*\[\/INTERNAL_X_PROFILES\]/i;

export function extractXProfilesFromResearchStdout(raw: string): XProfileSnapshot[] {
  const m = raw.match(INTERNAL_X_PROFILE_RE);
  if (!m?.[1]) return [];
  try {
    const parsed = JSON.parse(m[1].trim()) as { profiles?: XProfileSnapshot[] };
    return Array.isArray(parsed.profiles) ? parsed.profiles : [];
  } catch {
    return [];
  }
}

function stripInternalXProfileBlock(raw: string): string {
  return raw.replace(INTERNAL_X_PROFILE_RE, '\n').trim();
}
const __dirname = path.dirname(__filename);

const LAST30DAYS_PATH = path.join(__dirname, '../../tools/last30days-skill');

function estimateTokenCount(text: string): number {
  // Coarse estimate for observability: 1 token ~= 4 chars.
  return Math.max(1, Math.ceil((text || '').length / 4));
}

/** OpenAI-compatible chat completions streaming (SSE). Returns full text + streaming usage estimate. */
async function streamChatCompletion(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  onToken: (chunk: string) => void,
  timeoutMs: number,
): Promise<{ content: string; completionChars: number; completionTokensEst: number }> {
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
  let completionChars = 0;
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
          completionChars += piece.length;
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
          completionChars += piece.length;
          onToken(piece);
        }
      } catch {
        /* ignore */
      }
    }
  }

  return {
    content: full.trim(),
    completionChars,
    completionTokensEst: estimateTokenCount(full),
  };
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
    options: { deep?: boolean; days?: number; searchSources?: string; skipInnerSynthesis?: boolean } = {},
    progress?: DeepResearchProgress,
  ) {
    const args = [
      path.join(LAST30DAYS_PATH, 'scripts', 'last30days.py'),
      topic,
      options.deep ? '--deep' : '--quick',
      options.days ? `--days=${options.days}` : '--days=30',
    ].filter(Boolean) as string[];

    // last30days --sources: unset/empty → default `x` (skip Reddit; good for X-only testing).
    // Set LAST30DAYS_SOURCES=auto to restore Reddit + X heuristics, or both / reddit / x explicitly.
    const rawSources = process.env.LAST30DAYS_SOURCES;
    const last30daysSources =
      rawSources === undefined || String(rawSources).trim() === ''
        ? 'x'
        : String(rawSources).trim().toLowerCase();
    if (last30daysSources !== 'auto') {
      args.push('--sources', last30daysSources);
    }

    if (process.env.EXA_API_KEY) {
      args.push('--include-web');
    }
    const searchSources = typeof options.searchSources === 'string' ? options.searchSources.trim() : '';
    if (searchSources) {
      args.push('--search', searchSources);
    }

    return new Promise<{
      summary: string;
      topic: string;
      timestamp: string;
      extractedSources: SignalSearchSource[];
      rawStdout: string;
      xProfiles: XProfileSnapshot[];
    }>((resolve, reject) => {
      const runStartedAt = Date.now();
      const spawnStartedAt = Date.now();
      const asSeconds = (ms: number) => (ms / 1000).toFixed(3);
      const sinceStart = () => Date.now() - runStartedAt;
      const isWin = process.platform === 'win32';
      const pythonExe = isWin ? 'python' : 'python3';

      const emitResearchLine = (line: string) => {
        if (line.includes('[TIMING]')) {
          console.log(`[researchService:inner] ${line}`);
        }
        if (line.includes('[SourcePlan]')) {
          console.log(`[researchService:plan] ${line}`);
        }
        // last30days X/Twitter diagnostics from Python stderr
        if (line.includes('[XDiag]') || line.includes('[X/SC]')) {
          console.log(`[researchService:x] ${line}`);
        }
        if (line.includes('[Bird]') || line.includes('[BirdRaw]') || line.includes('[BirdPreview]')) {
          console.log(`[researchService:bird] ${line}`);
        }
        if (
          line.includes('[Exa]') ||
          line.includes('[WebSearch]') ||
          line.includes('[Tavily]') ||
          line.includes('[TOKENS]')
        ) {
          console.log(`[researchService:web] ${line}`);
        }
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
      const spawnedAt = Date.now();

      let stdoutData = '';
      let stderrData = '';
      let stderrLineBuf = '';
      let stdoutChunks = 0;
      let stderrChunks = 0;
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let stderrLines = 0;
      let firstStdoutAt: number | null = null;
      let firstStderrAt: number | null = null;
      let firstAnyOutputAt: number | null = null;
      let lastOutputAt: number | null = null;

      const logPythonRunBreakdown = (tag: 'close' | 'timeout' | 'child_error') => {
        const now = Date.now();
        const baseEnd = tag === 'close' ? now : now;
        const firstOutAt = firstAnyOutputAt;
        const startupToSpawn = spawnedAt - spawnStartedAt;
        const startupToFirstOut = firstOutAt ? firstOutAt - spawnedAt : null;
        const startupToFirstStdout = firstStdoutAt ? firstStdoutAt - spawnedAt : null;
        const startupToFirstStderr = firstStderrAt ? firstStderrAt - spawnedAt : null;
        const streamWindow =
          firstOutAt && lastOutputAt && lastOutputAt >= firstOutAt ? lastOutputAt - firstOutAt : null;
        const quietTail = lastOutputAt ? baseEnd - lastOutputAt : null;

        console.log(
          `[researchService:timing] python_run_breakdown tag=${tag} topic="${topic}"` +
            ` spawn_boot_s=${asSeconds(startupToSpawn)}` +
            ` first_output_s=${startupToFirstOut != null ? asSeconds(startupToFirstOut) : 'n/a'}` +
            ` first_stdout_s=${startupToFirstStdout != null ? asSeconds(startupToFirstStdout) : 'n/a'}` +
            ` first_stderr_s=${startupToFirstStderr != null ? asSeconds(startupToFirstStderr) : 'n/a'}` +
            ` stream_window_s=${streamWindow != null ? asSeconds(streamWindow) : 'n/a'}` +
            ` quiet_tail_s=${quietTail != null ? asSeconds(quietTail) : 'n/a'}` +
            ` stdout_chunks=${stdoutChunks} stdout_bytes=${stdoutBytes}` +
            ` stderr_chunks=${stderrChunks} stderr_bytes=${stderrBytes} stderr_lines=${stderrLines}`,
        );
      };

      child.stdout.on('data', (data) => {
        const now = Date.now();
        const text = data.toString();
        stdoutData += text;
        stdoutChunks += 1;
        stdoutBytes += Buffer.byteLength(text);
        if (!firstStdoutAt) firstStdoutAt = now;
        if (!firstAnyOutputAt) firstAnyOutputAt = now;
        lastOutputAt = now;
      });

      child.stderr.on('data', (data) => {
        const now = Date.now();
        const text = data.toString();
        stderrData += text;
        stderrLineBuf += text;
        stderrChunks += 1;
        stderrBytes += Buffer.byteLength(text);
        if (!firstStderrAt) firstStderrAt = now;
        if (!firstAnyOutputAt) firstAnyOutputAt = now;
        lastOutputAt = now;
        const parts = stderrLineBuf.split(/\r?\n/);
        stderrLineBuf = parts.pop() ?? '';
        for (const raw of parts) {
          const line = raw.trim();
          if (line) {
            stderrLines += 1;
            emitResearchLine(line);
          }
        }
      });

      // 5 minutes hard timeout
      const timeoutSec = options.deep ? 300 : 180;
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        logPythonRunBreakdown('timeout');
        reject(new Error(`Timeout after ${timeoutSec} seconds`));
      }, timeoutSec * 1000);

      child.on('close', async (code) => {
        const childClosedAt = Date.now();
        clearTimeout(timer);
        if (stderrLineBuf.trim()) {
          emitResearchLine(stderrLineBuf.trim());
          stderrLineBuf = '';
        }
        console.log(
          `[researchService:timing] python_run_s=${asSeconds(childClosedAt - runStartedAt)} total_s=${asSeconds(
            sinceStart(),
          )} topic="${topic}"`,
        );
        logPythonRunBreakdown('close');
        if (code !== 0) {
          console.error('[researchService] Execution error:', stderrData);
          return reject(new Error(`Script exited with code ${code}:\n${stderrData}`));
        }

        const parseStartedAt = Date.now();
        const xProfiles = extractXProfilesFromResearchStdout(stdoutData);
        let finalSummary = stripInternalXProfileBlock(stdoutData.trim());
        const extractedSources = sourcesFromLast30DaysCompact(stdoutData);
        const extractedPreview = extractedSources
          .slice(0, 3)
          .map((s) => `${s.domain}|${(s.title || '').slice(0, 60)}|${s.url || ''}`)
          .join(' || ');
        console.log(
          `[researchService:timing] parse_output_s=${asSeconds(Date.now() - parseStartedAt)} total_s=${asSeconds(
            sinceStart(),
          )} topic="${topic}" sources=${extractedSources.length} stdout_len=${stdoutData.length}`,
        );
        if (extractedPreview) {
          console.log(`[researchService:sources] extraction_preview=${extractedPreview}`);
        }

        // Optional AI synthesis — tokens go to emitSynthToken only (main chat stream); status lines → research log
        const aiApiKey = process.env.LOKA_AI_API_KEY;
        const aiBaseUrl = process.env.LOKA_AI_BASE_URL;
        const aiModel = process.env.LOKA_AI_MODEL;
        const shouldRunInnerSynthesis = !options.skipInnerSynthesis && Boolean(aiApiKey && aiBaseUrl && aiModel);
        if (shouldRunInnerSynthesis && aiApiKey && aiBaseUrl && aiModel) {
          const aiSynthesisStartedAt = Date.now();
          try {
            emitResearchLine('⏳ AI Synthesis：Generating final report…');

            let apiUrl = aiBaseUrl.replace(/\/$/, '');
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
            const synthesisPromptChars = synthesisMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
            const synthesisPromptTokensEst = estimateTokenCount(
              synthesisMessages.map((m) => m.content || '').join('\n'),
            );
            console.log(
              `[researchService:tokens] stage=ai_synthesis mode=${wantStream ? 'stream' : 'nonstream'} prompt_chars=${synthesisPromptChars} prompt_tokens_est=${synthesisPromptTokensEst} topic="${topic}"`,
            );

            const runNonStreamSynthesis = async () => {
              const nonStreamStartedAt = Date.now();
              const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${aiApiKey}`,
                },
                body: JSON.stringify({
                  model: aiModel,
                  messages: synthesisMessages,
                  temperature: 0.3,
                }),
                signal: AbortSignal.timeout(120000),
              });
              if (response.ok) {
                const data = (await response.json()) as any;
                if (data.choices && data.choices[0]?.message?.content) {
                  finalSummary = data.choices[0].message.content.trim();
                  const completionChars = finalSummary.length;
                  const usagePromptTokens = Number(data?.usage?.prompt_tokens || 0);
                  const usageCompletionTokens = Number(data?.usage?.completion_tokens || 0);
                  const usageTotalTokens = Number(data?.usage?.total_tokens || 0);
                  console.log(
                    `[researchService:tokens] stage=ai_synthesis mode=nonstream prompt_tokens=${usagePromptTokens || 'n/a'} completion_tokens=${usageCompletionTokens || 'n/a'} total_tokens=${usageTotalTokens || 'n/a'} completion_chars=${completionChars} completion_tokens_est=${estimateTokenCount(
                      finalSummary,
                    )} topic="${topic}"`,
                  );
                  emitResearchLine('✓ AI Synthesis：Report generated (non-streaming)');
                  console.log(
                    `[researchService:timing] ai_nonstream_s=${asSeconds(
                      Date.now() - nonStreamStartedAt,
                    )} total_s=${asSeconds(sinceStart())} topic="${topic}"`,
                  );
                  return true;
                }
              } else {
                const errText = await response.text();
                console.error('[researchService] AI Synthesis API error:', errText);
                emitResearchLine(`❌ AI Synthesis API Error (${response.status}). Using original search results.`);
              }
              console.log(
                `[researchService:timing] ai_nonstream_s=${asSeconds(
                  Date.now() - nonStreamStartedAt,
                )} total_s=${asSeconds(sinceStart())} topic="${topic}" success=false`,
              );
              return false;
            };

            if (wantStream) {
              const streamStartedAt = Date.now();
              try {
                const streamResult = await streamChatCompletion(
                  apiUrl,
                  aiApiKey,
                  aiModel,
                  synthesisMessages,
                  0.3,
                  (chunk) => emitSynthToken(chunk),
                  120000,
                );
                finalSummary = streamResult.content;
                console.log(
                  `[researchService:tokens] stage=ai_synthesis mode=stream prompt_tokens_est=${synthesisPromptTokensEst} completion_chars=${streamResult.completionChars} completion_tokens_est=${streamResult.completionTokensEst} topic="${topic}"`,
                );
                emitResearchLine('✓ AI Synthesis：Streaming generation completed');
                console.log(
                  `[researchService:timing] ai_stream_s=${asSeconds(
                    Date.now() - streamStartedAt,
                  )} total_s=${asSeconds(sinceStart())} topic="${topic}"`,
                );
              } catch (streamErr: any) {
                console.warn('[researchService] AI Synthesis streaming failed, using non-stream:', streamErr?.message);
                console.log(
                  `[researchService:timing] ai_stream_s=${asSeconds(
                    Date.now() - streamStartedAt,
                  )} total_s=${asSeconds(sinceStart())} topic="${topic}" fallback=nonstream`,
                );
                await runNonStreamSynthesis();
              }
            } else {
              await runNonStreamSynthesis();
            }
            console.log(
              `[researchService:timing] ai_synthesis_total_s=${asSeconds(
                Date.now() - aiSynthesisStartedAt,
              )} total_s=${asSeconds(sinceStart())} topic="${topic}"`,
            );
          } catch (err: any) {
            console.error('[researchService] AI Synthesis exception:', err);
            emitResearchLine('❌ AI Synthesis network error, using original search results.');
            console.log(
              `[researchService:timing] ai_synthesis_total_s=${asSeconds(
                Date.now() - aiSynthesisStartedAt,
              )} total_s=${asSeconds(sinceStart())} topic="${topic}" error=true`,
            );
          }
        } else if (options.skipInnerSynthesis) {
          emitResearchLine('ℹ️ AI Synthesis skipped (SuperAgent will synthesize with all tools later).');
        }

        const finalCleanStartedAt = Date.now();
        const cleanedSummary = stripInternalResearchCitations(finalSummary);
        console.log(
          `[researchService:timing] finalize_summary_s=${asSeconds(
            Date.now() - finalCleanStartedAt,
          )} total_s=${asSeconds(sinceStart())} topic="${topic}" final_len=${cleanedSummary.length}`,
        );

        resolve({
          summary: cleanedSummary,
          topic,
          timestamp: new Date().toISOString(),
          extractedSources,
          rawStdout: stdoutData,
          xProfiles,
        });
      });
      
      child.on('error', (err) => {
        clearTimeout(timer);
        console.log(
          `[researchService:timing] child_error_after_s=${asSeconds(sinceStart())} topic="${topic}"`,
        );
        logPythonRunBreakdown('child_error');
        reject(err);
      });
    });
  }
};
