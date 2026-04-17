const HARDCODED_XAI_API_KEY =
  'xai-LfgkuNzzb6PAPGzwduJN5MCjQuIVnWxvsKwgck2MfgpdNTMOpzlX7ipLreNL8qngo0oWQfrn48uCryDO';

function extractTextFromResponses(resp) {
  if (typeof resp?.output_text === 'string' && resp.output_text.trim()) {
    return resp.output_text.trim();
  }

  const output = Array.isArray(resp?.output) ? resp.output : [];
  const chunks = [];

  for (const item of output) {
    if (item?.type !== 'message') continue;
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (typeof c?.text === 'string' && c.text.trim()) {
        chunks.push(c.text.trim());
      }
    }
  }

  return chunks.join('\n\n').trim();
}

function extractCitations(resp) {
  const citations = [];
  const output = Array.isArray(resp?.output) ? resp.output : [];

  for (const item of output) {
    if (item?.type !== 'message') continue;
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      const anns = Array.isArray(c?.annotations) ? c.annotations : [];
      for (const a of anns) {
        const url = a?.url || a?.source_url || a?.title_url;
        if (url) citations.push(url);
      }
    }
  }

  return [...new Set(citations)];
}

async function postJson(url, apiKey, body, timeoutMs = 90_000) {
  const startedAt = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const elapsedMs = Date.now() - startedAt;
  const rawText = await res.text();
  return { res, elapsedMs, rawText };
}

async function main() {
  const apiKey = HARDCODED_XAI_API_KEY || process.env.XAI_API_KEY || process.env.XAI_API_KEY_TEST;
  if (!apiKey) {
    console.error('Missing XAI_API_KEY (or XAI_API_KEY_TEST).');
    process.exit(1);
  }

  const query =
    // process.argv.slice(2).join(' ').trim() ||
    // '最近 Twitter 上关于 asksurf.ai 的讨论有哪些？请用中文总结主要观点和社区情绪。';
    // process.argv.slice(2).join(' ').trim() ||
    // '最近 Twitter 上有关这个 Dr.Hash“Wesley” 这个博主有什么话题嘛。';
    process.argv.slice(2).join(' ').trim() ||
    '最近 Twitter 上关于 rave代币有哪些新鲜事？请总结';

  const responsesBody = {
    model: 'grok-4-1-fast',
    input: [{ role: 'user', content: query }],
    tools: [
      {
        type: 'x_search',
      },
    ],
    stream: false,
  };

  let parsed = null;
  let rawText = '';
  let elapsedMs = 0;
  let endpoint = '/v1/responses';
  let mode = 'responses';
  let content = '';
  let citations = [];

  try {
    const first = await postJson('https://api.x.ai/v1/responses', apiKey, responsesBody);
    elapsedMs = first.elapsedMs;
    rawText = first.rawText;
    if (!first.res.ok) {
      throw new Error(`responses_http_${first.res.status}: ${first.rawText}`);
    }
    parsed = JSON.parse(first.rawText);
    content = extractTextFromResponses(parsed);
    citations = extractCitations(parsed);
  } catch (err) {
    // Compatibility fallback for environments where /responses may be blocked.
    const chatBody = {
      model: process.env.XAI_MODEL_CHAT || 'grok-4-1-fast',
      messages: [{ role: 'user', content: query }],
      tools: [{ type: 'x_search' }],
      tool_choice: 'auto',
      temperature: 0.2,
    };
    const second = await postJson('https://api.x.ai/v1/chat/completions', apiKey, chatBody);
    elapsedMs = second.elapsedMs;
    rawText = second.rawText;
    endpoint = '/v1/chat/completions';
    mode = 'chat_completions_fallback';

    if (!second.res.ok) {
      console.error(`[x_search_test] Both endpoints failed.`);
      console.error(`[x_search_test] responses_error=${err?.message || err}`);
      console.error(`[x_search_test] chat_http_${second.res.status}`);
      console.error(second.rawText);
      process.exit(1);
    }

    parsed = JSON.parse(second.rawText);
    content = parsed?.choices?.[0]?.message?.content?.trim() || '';
    const toolCalls = parsed?.choices?.[0]?.message?.tool_calls || [];
    if (!content && Array.isArray(toolCalls) && toolCalls.length > 0) {
      content = '[提示] 当前返回仍为 tool_calls。建议优先使用 /v1/responses 接口，或检查网络/代理后重试。';
    }
  }

  console.log(`[x_search_test] OK elapsed_ms=${elapsedMs} mode=${mode} endpoint=${endpoint}`);
  console.log(`[x_search_test] model=${parsed?.model || 'unknown'} response_id=${parsed?.id || 'unknown'}`);

  if (content) {
    console.log('\n=== model content ===\n');
    console.log(content);
  } else {
    console.log('\n=== model content ===\n(empty)');
    console.log('\n=== raw preview ===\n');
    console.log(rawText.slice(0, 1200));
  }

  if (citations.length > 0) {
    console.log(`\n=== citations (${citations.length}) ===\n`);
    for (const url of citations) {
      console.log(url);
    }
  } else {
    console.log('\n=== citations ===\n(none)');
  }
}

main().catch((err) => {
  console.error('[x_search_test] Fatal:', err?.message || err);
  process.exit(1);
});
