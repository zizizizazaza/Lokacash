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

function serverRootFromHere(): string {
  return path.join(__dirname, '../..');
}

/**
 * Runs the CoinGecko MCP CLI (`tools/web3`) and returns markdown-ish report text for Super Agent synthesis.
 */
export async function runWeb3ResearchQuery(userQuery: string): Promise<string> {
  const q = (userQuery || '').trim();
  if (!q) {
    return '## Web3\n(空查询)';
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
    return (
      `## Web3\n未找到 \`tools/web3/dist/cli.js\`（且无法回退到 tsx）。请在 \`server\` 目录执行：\`npm run build:web3\`。`
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(execPath, args, {
      cwd: WEB3_ROOT,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
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
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `web3 cli exited ${code}`));
        return;
      }
      try {
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? stdout.trim();
        const parsed = JSON.parse(line) as {
          ok?: boolean;
          report?: string;
          error?: string;
          resolvedId?: string;
          spotPriceUsd?: number;
          via?: 'mcp' | 'rest';
          resolver?: string;
        };
        if (!parsed.ok) {
          reject(new Error(parsed.error || 'web3 tool returned ok:false'));
          return;
        }
        console.log(
          `[web3Research] query="${q}" resolved_id=${parsed.resolvedId || 'n/a'} spot_usd=${parsed.spotPriceUsd ?? 'n/a'} via=${parsed.via || 'n/a'} resolver=${parsed.resolver || 'n/a'}`,
        );
        resolve(parsed.report || '');
      } catch (e) {
        reject(new Error(`Invalid web3 CLI JSON: ${(e as Error).message} | stderr=${stderr.slice(0, 500)}`));
      }
    });
  });
}

export const web3ResearchService = {
  runQuery: runWeb3ResearchQuery,
};
