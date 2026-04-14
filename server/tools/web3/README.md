# Loka Web3 Tool（CoinGecko MCP）

Node 子进程：通过 `@modelcontextprotocol/sdk` 的 **Streamable HTTP** 连接 CoinGecko 托管 MCP（默认公共端点），在失败时 **回退到 CoinGecko 公开 REST**（`simple/price`）。

## 环境变量

| 变量 | 说明 |
|------|------|
| `COINGECKO_MCP_URL` | 可选。默认无 Key 时为 `https://mcp.api.coingecko.com/mcp`；有 Pro Key 时为 `https://mcp.pro-api.coingecko.com/mcp`（也可手动覆盖）。 |
| `COINGECKO_PRO_API_KEY` | 可选。设置后自动改用 Pro MCP 端点并在请求头携带 `Authorization: Bearer …`。 |

官方说明见 [CoinGecko MCP Server](https://docs.coingecko.com/docs/mcp-server)。

## 构建

在 `server` 目录执行（已接入 `npm run build`）：

```bash
npm run build:web3
```

开发时若未构建 `dist/`，`web3Research.service` 会尝试用仓库根 `server/node_modules/tsx` 直接执行 `src/cli.ts`。

## 与 Super Agent 的衔接

路由模型在 `evaluateRouting` 中输出 `capabilities.web3`；`socket/index.ts` 并行调用本 CLI，将 `【WEB3 REPORT】` 拼入合成上下文。
