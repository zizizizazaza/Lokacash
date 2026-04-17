import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PUBLIC_MCP = 'https://mcp.api.coingecko.com/mcp';
const PRO_MCP = 'https://mcp.pro-api.coingecko.com/mcp';

function now() {
  return new Date().toISOString();
}

function ms(start: number): string {
  return ((Date.now() - start) / 1000).toFixed(3);
}

function pickTool(
  tools: { name: string; description?: string; inputSchema?: { properties?: Record<string, unknown> } }[],
): { name: string; args: Record<string, unknown> } | null {
  if (!tools.length) return null;

  const exact = tools.find((t) => t.name === 'get_id_coins');
  const tool = exact || tools.find((t) => /coin|id|price/i.test(t.name)) || tools[0];
  if (!tool) return null;

  const keys = Object.keys(tool.inputSchema?.properties ?? {});
  const args: Record<string, unknown> = {};

  if (keys.includes('id')) args.id = 'bitcoin';
  else if (keys.includes('ids')) args.ids = 'bitcoin';
  else if (keys.includes('coin_id')) args.coin_id = 'bitcoin';
  else if (keys.includes('query')) args.query = 'bitcoin';
  else if (keys.includes('q')) args.q = 'bitcoin';
  else if (keys.length > 0) args[keys[0]] = 'bitcoin';

  return { name: tool.name, args };
}

async function main() {
  const started = Date.now();
  const hasKey = Boolean(process.env.COINGECKO_PRO_API_KEY);
  const base = (process.env.COINGECKO_MCP_URL || (hasKey ? PRO_MCP : PUBLIC_MCP)).trim();

  const headers: Record<string, string> = { Accept: 'application/json, text/event-stream' };
  if (hasKey && process.env.COINGECKO_PRO_API_KEY) {
    headers.Authorization = `Bearer ${process.env.COINGECKO_PRO_API_KEY}`;
  }

  console.log(`[mcp-smoke] ${now()} start endpoint=${base} has_key=${hasKey}`);

  const transport = new StreamableHTTPClientTransport(new URL(base), {
    requestInit: { headers },
  });
  const client = new Client({ name: 'loka-web3-mcp-smoke', version: '0.1.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
    console.log(`[mcp-smoke] ${now()} connected in ${ms(started)}s`);

    const listStart = Date.now();
    const { tools } = await client.listTools();
    console.log(`[mcp-smoke] ${now()} tools=${tools.length} list_tools_s=${ms(listStart)}s`);

    const picked = pickTool(tools);
    if (!picked) {
      console.log(
        JSON.stringify({
          ok: false,
          stage: 'pick_tool',
          mcp: true,
          endpoint: base,
          hasKey,
          error: 'no_tool_available',
        }),
      );
      return;
    }

    const callStart = Date.now();
    const result = await client.callTool({ name: picked.name, arguments: picked.args });
    console.log(
      `[mcp-smoke] ${now()} call_ok tool=${picked.name} args=${JSON.stringify(picked.args)} call_tool_s=${ms(callStart)}s`,
    );

    const firstText =
      ((result as { content?: { type: string; text?: string }[] }).content || []).find((c) => c.type === 'text')?.text ||
      '';
    const preview = firstText.slice(0, 300);

    console.log(
      JSON.stringify({
        ok: true,
        mcp: true,
        endpoint: base,
        hasKey,
        tool: picked.name,
        args: picked.args,
        elapsed_s: ms(started),
        preview,
      }),
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        ok: false,
        mcp: true,
        endpoint: base,
        hasKey,
        elapsed_s: ms(started),
        error: (e as Error).message,
      }),
    );
  } finally {
    try {
      await transport.close();
    } catch {
      /* ignore */
    }
  }
}

main();
