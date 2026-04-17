import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** server/src/services → server/tools/web3 */
const WEB3_ROOT = path.join(__dirname, '../../tools/web3');
const CLI_JS = path.join(WEB3_ROOT, 'dist', 'cli.js');
const CLI_TS = path.join(WEB3_ROOT, 'src', 'cli.ts');

export type Web3ResearchResult = {
  report: string;
  raw: {
    intent?: string;
    via?: 'mcp' | 'rest' | 'hybrid';
    resolvedId?: string;
    spotPriceUsd?: number;
    resolver?: string;
    assets?: Array<{ id?: string; symbol?: string; name?: string }>;
    market?: Record<string, unknown>;
    discovery?: Record<string, unknown>;
    onchain?: Record<string, unknown>;
    nft?: Record<string, unknown>;
    logs?: string[];
    missingData?: string[];
  };
};

function serverRootFromHere(): string {
  return path.join(__dirname, '../..');
}

/**
 * Runs the CoinGecko web3 CLI (`tools/web3`) and returns report + structured payload.
 */
export async function runWeb3ResearchQuery(userQuery: string): Promise<Web3ResearchResult> {
  const q = (userQuery || '').trim();
  if (!q) {
    return {
      report: '## Web3\n(空查询)',
      raw: {
        intent: 'empty',
        via: 'rest',
        logs: ['empty_query'],
      },
    };
  }

  const serverRoot = serverRootFromHere();
  const tsxCli = path.join(serverRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const useCompiled = fs.existsSync(CLI_JS);
  const useTsx = !useCompiled && fs.existsSync(tsxCli) && fs.existsSync(CLI_TS);

  const execPath = process.execPath;
  const args: string[] = useCompiled
    ? [CLI_JS, q]
    : useTsx
      ? [tsxCli, CLI_TS, q]
      : [];

  if (args.length === 0) {
    return {
      report: `## Web3\n未找到 \`tools/web3/dist/cli.js\`（且无法回退到 tsx）。请在 \`server\` 目录执行：\`npm run build:web3\`。`,
      raw: {
        intent: 'build_missing',
        via: 'rest',
        logs: ['missing_cli_build'],
      },
    };
  }

  return new Promise((resolve, reject) => {
    const clip = (s: string, max: number) => {
      const t = s.replace(/\s+/g, ' ').trim();
      if (t.length <= max) return t;
      return `${t.slice(0, max)}…`;
    };

    const child = spawn(execPath, args, {
      cwd: WEB3_ROOT,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      console.warn(
        `[web3Research] timeout after 45s query="${clip(q, 120)}" cli=${useCompiled ? 'dist' : useTsx ? 'tsx' : 'none'}`,
      );
      child.kill('SIGTERM');
      reject(new Error('Web3 MCP tool timeout (45s)'));
    }, 45_000);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      console.warn(`[web3Research] spawn error query="${clip(q, 120)}" err=${(err as Error).message}`);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.warn(
          `[web3Research] cli non-zero exit code=${code} query="${clip(q, 120)}" stderr="${clip(stderr, 400)}"`,
        );
        reject(new Error(stderr.trim() || `web3 cli exited ${code}`));
        return;
      }
      let line = '';
      try {
        line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? stdout.trim();
        const parsed = JSON.parse(line) as {
          ok?: boolean;
          report?: string;
          error?: string;
          intent?: string;
          resolvedId?: string;
          spotPriceUsd?: number;
          via?: 'mcp' | 'rest' | 'hybrid';
          resolver?: string;
          assets?: Array<{ id?: string; symbol?: string; name?: string }>;
          market?: Record<string, unknown>;
          discovery?: Record<string, unknown>;
          onchain?: Record<string, unknown>;
          nft?: Record<string, unknown>;
          logs?: string[];
          missingData?: string[];
        };
        if (!parsed.ok) {
          console.warn(
            `[web3Research] cli ok:false query="${clip(q, 120)}" error="${clip(String(parsed.error || ''), 200)}"`,
          );
          reject(new Error(parsed.error || 'web3 tool returned ok:false'));
          return;
        }
        console.log(
          `[web3Research] query="${q}" intent=${parsed.intent || 'n/a'} asset_count=${parsed.assets?.length || 0} resolved_id=${parsed.resolvedId || 'n/a'} spot_usd=${parsed.spotPriceUsd ?? 'n/a'} via=${parsed.via || 'n/a'} resolver=${parsed.resolver || 'n/a'}`,
        );
        if (parsed.logs?.length) {
          console.log(`[web3Research:logs] ${parsed.logs.join(' | ')}`);
        }
        if (parsed.assets?.length) {
          const assetPreview = parsed.assets
            .slice(0, 5)
            .map((asset) => `${asset.name || asset.id || 'unknown'}(${asset.symbol || '-'})`)
            .join(', ');
          console.log(`[web3Research:assets] ${assetPreview}`);
        }
        if (parsed.missingData?.length) {
          console.log(`[web3Research:missing] ${parsed.missingData.join(',')}`);
        }
        resolve({
          report: parsed.report || '',
          raw: {
            intent: parsed.intent,
            via: parsed.via,
            resolvedId: parsed.resolvedId,
            spotPriceUsd: parsed.spotPriceUsd,
            resolver: parsed.resolver,
            assets: parsed.assets || [],
            market: parsed.market || {},
            discovery: parsed.discovery || {},
            onchain: parsed.onchain || {},
            nft: parsed.nft || {},
            logs: parsed.logs || [],
            missingData: parsed.missingData || [],
          },
        });
      } catch (e) {
        console.warn(
          `[web3Research] invalid JSON from cli query="${clip(q, 120)}" lastLine="${clip(line, 200)}" stdoutTail="${clip(stdout, 400)}" stderr="${clip(stderr, 400)}"`,
        );
        reject(new Error(`Invalid web3 CLI JSON: ${(e as Error).message} | stderr=${stderr.slice(0, 500)}`));
      }
    });
  });
}

export const web3ResearchService = {
  runQuery: runWeb3ResearchQuery,
};
