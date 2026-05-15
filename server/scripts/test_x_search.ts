import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const HARDCODED_XAI_API_KEY =
  'xai-LfgkuNzzb6PAPGzwduJN5MCjQuIVnWxvsKwgck2MfgpdNTMOpzlX7ipLreNL8qngo0oWQfrn48uCryDO';

type XaiToolCall = {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type XaiChoice = {
  message?: {
    role?: string;
    content?: string | null;
    tool_calls?: XaiToolCall[];
  };
  finish_reason?: string;
};

type XaiResponse = {
  id?: string;
  model?: string;
  choices?: XaiChoice[];
  error?: unknown;
};

async function main() {
  const apiKey = HARDCODED_XAI_API_KEY || process.env.XAI_API_KEY || process.env.XAI_API_KEY_TEST;
  if (!apiKey) {
    console.error('Missing XAI_API_KEY (or XAI_API_KEY_TEST).');
    process.exit(1);
  }

  const query =
    process.argv.slice(2).join(' ').trim() ||
    '最近 Twitter 上关于 asksurf.ai 的讨论有哪些？请用中文总结主要观点和社区情绪。';
  const body = {
    model: process.env.XAI_MODEL || 'grok-4',
    messages: [{ role: 'user', content: query }],
    tools: [
      {
        type: 'function',
        function: {
          name: 'x_search',
          description: 'Search for posts on X (Twitter)',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query or keywords',
              },
              limit: {
                type: 'integer',
                default: 10,
                description: 'Number of posts to return',
              },
            },
            required: ['query'],
          },
        },
      },
    ],
    tool_choice: 'auto',
    temperature: 0.2,
  };

  const startedAt = Date.now();
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const elapsedMs = Date.now() - startedAt;

  const rawText = await res.text();
  if (!res.ok) {
    console.error(`[x_search_test] HTTP ${res.status} elapsed_ms=${elapsedMs}`);
    console.error(rawText);
    process.exit(1);
  }

  let parsed: XaiResponse;
  try {
    parsed = JSON.parse(rawText) as XaiResponse;
  } catch {
    console.error('[x_search_test] Response is not JSON:');
    console.log(rawText);
    process.exit(1);
    return;
  }

  const msg = parsed.choices?.[0]?.message;
  const content = msg?.content?.trim();
  const toolCalls = msg?.tool_calls ?? [];

  console.log(`[x_search_test] OK elapsed_ms=${elapsedMs} model=${parsed.model || 'unknown'}`);
  console.log(`[x_search_test] finish_reason=${parsed.choices?.[0]?.finish_reason || 'unknown'}`);

  if (content) {
    console.log('\n=== model content ===\n');
    console.log(content);
  } else {
    console.log('\n=== model content ===\n(empty)');
  }

  if (toolCalls.length > 0) {
    console.log(`\n=== tool_calls (${toolCalls.length}) ===\n`);
    for (const c of toolCalls) {
      console.log(`tool=${c.function?.name || 'unknown'} args=${c.function?.arguments || '{}'}`);
    }
  } else {
    console.log('\n=== tool_calls ===\n(none)');
  }
}

main().catch((err) => {
  console.error('[x_search_test] Fatal:', err?.message || err);
  process.exit(1);
});
