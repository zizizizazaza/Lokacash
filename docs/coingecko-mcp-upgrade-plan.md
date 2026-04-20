# CoinGecko MCP 升级实施方案

## 1. 结论

结合当前代码和 CoinGecko 官方 MCP 文档，可以明确判断：

- 现在 `server/tools/web3/src/cli.ts` 只是“解析一个币 -> 从 MCP 工具列表里选一个最像的工具 -> 调一次 -> 输出一段 report”。
- 这会把 CoinGecko MCP 原本支持的能力压缩成“单币 + 单工具 + 单次回答”。
- 官方文档明确支持的能力远不止价格查询，还包括：
  - 实时市场数据
  - 历史价格 / OHLCV
  - Trending / New listings / Gainers / Losers
  - 分类赛道
  - GeckoTerminal 链上 DEX / 流动性数据
  - NFT 集合数据
  - 丰富元数据（logo、描述、社媒、合约地址、安全信息等）
- 因此，下一步不应该继续增强 `pickTool()` 这种“猜一个工具”的逻辑，而应该改成“能力路由 + 多工具链路 + 结构化输出 + 轻量总结层”。

参考文档：

- [CoinGecko MCP Server](https://docs.coingecko.com/docs/ai-agent-hub/mcp-server)
- [CoinGecko llms-full.txt](https://docs.coingecko.com/llms-full.txt)

## 2. 当前实现的主要问题

### 2.1 MCP 能力被降级成单工具调用

当前 `cli.ts` 的核心路径：

1. `resolveGeckoId(query)`
2. `client.listTools()`
3. `pickTool(tools, query, geckoId)`
4. `client.callTool(...)`
5. 输出 markdown report

问题：

- 一次只调一个工具，无法组合“价格 + 历史 + 元数据 + 趋势 + DEX”。
- 不同问题都落到同一个“最佳工具”，回答能力很不稳定。
- 工具选错时只能走 REST 兜底，无法做部分成功的链式回退。

### 2.2 返回值以长文本为主，不利于后续编排

当前 `web3Research.service.ts` 最终只接收：

- `report`
- `resolvedId`
- `spotPriceUsd`
- `via`

问题：

- 最终 SuperAgent 看到的是“大块文本”，不是结构化对象。
- 不能轻松增加轻量 reducer。
- 不能和 `researchService` 的 Twitter/X 数据做字段级融合。

### 2.3 只适合单币问答，不适合列表型和扫描型问题

当前实现天然更适合：

- `BTC price`
- `ETH market cap`

但对下面这些问题不友好：

- AI Agent 板块有哪些值得看？
- top 10 trending coins
- 最近涨幅最大的币
- 比较 BTC / ETH / SOL
- 某个赛道有哪些 token
- 某个链上热点币在 DEX 的流动性如何

### 2.4 没有中间压缩层

如果后续把更多 MCP 工具和 Twitter/Bird 都接进来，直接把所有原始文本丢给最终 agent，会出现：

- token 消耗大
- 噪音多
- 最终回答不稳定
- 多语言时模板容易漂移

## 3. 官方文档给出的设计启发

根据官方文档，当前设计应当注意以下几点：

### 3.1 不要只围绕“价格”设计

CoinGecko MCP 官方定位是完整 Crypto Data Hub，不只是 price API。

应把能力分成至少 6 类：

1. Token resolution
2. Spot / market snapshot
3. Historical / OHLC / chart
4. Metadata / project info
5. Discovery / trends / categories
6. Onchain / GeckoTerminal / NFT

### 3.2 Public / Demo / Pro 的能力和吞吐差异很大

文档明确说明：

- Public keyless：适合测试，受共享限流影响
- Demo：调用额度有限，工具有限
- Pro：工具更多、额度更高、历史更全

这意味着生产上要避免“全靠公共端点 + 高频 listTools + 多次工具调用”。

建议：

- 开发环境：保留 Public MCP
- 生产环境：优先 `COINGECKO_PRO_API_KEY`
- 重度查询：优先 Pro MCP / Pro REST

### 3.3 动态工具发现虽然灵活，但更慢

文档提到 Dynamic Tools 更灵活但更慢，Static 更快。

对你当前服务端实现来说，最优策略不是每次都完全动态发现，而是：

- 启动时或定时缓存一次工具清单
- 维护“能力 -> 候选工具名”的映射
- 查询时优先按能力选工具，而不是每次重新“猜最佳工具”

### 3.4 可以考虑 HTTP Streaming 主通道 + SSE 备份

文档提供两种远程端点：

- `/mcp`
- `/sse`

你现在只接了 streamable HTTP。后面可以增加：

- 首选 `/mcp`
- 连接失败或特定客户端兼容性问题时回退 `/sse`

## 4. 推荐目标架构

建议把 `web3` 升级成 4 层：

### 4.1 能力路由层

根据用户问题识别想要的是：

- 单币快照
- 单币深度分析
- 多币对比
- 趋势榜单
- 分类赛道
- 链上 DEX / 池子
- NFT

输出：

```json
{
  "intent": "token_deep_dive",
  "assets": ["bitcoin"],
  "wantsSocial": true,
  "wantsHistory": true,
  "wantsOnchain": false,
  "wantsRanking": false
}
```

### 4.2 数据采集层

按能力调用多个节点，而不是只调一个工具。

建议节点：

- `resolve_assets`
- `fetch_spot_snapshot`
- `fetch_market_detail`
- `fetch_history_or_ohlc`
- `fetch_metadata`
- `fetch_trending_or_category`
- `fetch_onchain_dex`
- `fetch_nft`
- `fetch_social_x`

### 4.3 轻量总结层

新增一个轻量 reducer，只做中间压缩，不直接面向用户聊天。

输入：

- market structured data
- social structured data
- user intent

输出：

```json
{
  "asset": "bitcoin",
  "market_snapshot": {},
  "trend_summary": "",
  "social_sentiment": {},
  "key_bull_points": [],
  "key_bear_points": [],
  "key_risks": [],
  "confidence": "medium",
  "missing_data": []
}
```

### 4.4 最终回答层

SuperAgent 只吃 reducer 结果，不直接吃大块原始 MCP 文本。

这样做的收益：

- token 更稳定
- 回答更一致
- 更容易做中英一致模板
- 更容易插入更多数据源

## 5. 下一步具体代码怎么改

## 5.1 修改 `server/tools/web3/src/cli.ts`

目标：从“单次工具调用器”改成“Web3 orchestrator”。

建议拆成这些函数：

- `classifyWeb3Intent(query)`
- `resolveAssets(query)`
- `loadToolCatalog(client)`
- `selectToolByCapability(capability, catalog)`
- `callToolSafe(client, capability, args)`
- `runTokenDeepDive(...)`
- `runMultiAssetCompare(...)`
- `runTrendingScan(...)`
- `runCategoryScan(...)`
- `runOnchainScan(...)`
- `reduceMarketPayload(...)`

关键改造点：

1. 保留当前 `resolveGeckoId()`，但升级成 `resolveAssets()`
   - 支持单币
   - 支持多币比较
   - 支持 category / trending / gainers / losers

2. 不再只返回 `report`
   - 改为返回结构化 JSON

建议输出格式：

```json
{
  "ok": true,
  "intent": "token_deep_dive",
  "via": "mcp",
  "assets": [
    {
      "id": "bitcoin",
      "symbol": "btc",
      "name": "Bitcoin"
    }
  ],
  "market": {
    "spot": {},
    "detail": {},
    "history": {},
    "metadata": {}
  },
  "discovery": {},
  "onchain": {},
  "nft": {},
  "report": "可选，给兼容旧逻辑用",
  "logs": []
}
```

3. 引入“能力映射”而不是 `scoreTool()`

例如：

- `token_resolve` -> `get_id_coins` / search 类工具
- `spot_price` -> price / simple / quote 类工具
- `market_detail` -> market / coins 类工具
- `history_ohlc` -> history / ohlc / chart 类工具
- `trending` -> trending 类工具
- `category` -> categories / sector 类工具
- `onchain` -> geckoterminal / pool / dex / liquidity 类工具
- `nft` -> nft 类工具

4. 增加部分失败容忍

不要“一步失败，整条链都回退”。

应改成：

- spot 成功，history 失败 -> 返回部分结果
- metadata 成功，onchain 失败 -> 返回部分结果
- 仅缺失节点写入 `missing_data`

5. 增加工具清单缓存

避免每次都 `listTools()` + 动态挑选。

建议：

- 进程内缓存 5~10 分钟
- 缓存字段：`name`、`description`、`inputSchema`

6. 增加 endpoint fallback

建议环境变量：

- `COINGECKO_MCP_URL`
- `COINGECKO_MCP_SSE_URL`
- `COINGECKO_PRO_API_KEY`
- `COINGECKO_TOOL_CACHE_TTL_MS`

## 5.2 修改 `server/src/services/web3Research.service.ts`

目标：不要只接收长文本 report，要接结构化结果。

建议：

1. 把返回类型从 `Promise<string>` 改成：

```ts
type Web3ResearchResult = {
  report: string;
  raw: {
    intent?: string;
    via?: 'mcp' | 'rest';
    assets?: Array<{ id?: string; symbol?: string; name?: string }>;
    market?: Record<string, unknown>;
    discovery?: Record<string, unknown>;
    onchain?: Record<string, unknown>;
    nft?: Record<string, unknown>;
    logs?: string[];
  };
};
```

2. 保留 `report`
   - 兼容当前 SuperAgent 汇总逻辑

3. 新增 `raw`
   - 给 reducer 和后续 richer UI 用

4. 增加日志
   - intent
   - asset count
   - 调用了哪些 capability
   - 哪些节点 fallback 到 REST

## 5.3 修改 `server/src/socket/index.ts`

目标：让 Web3 也走“原始结构化结果 -> 轻量总结 -> 最终 agent”的路径。

建议改法：

1. 当前：

- `web3ResearchService.runQuery(web3Q)` -> 直接把 report 给最终 agent

2. 改为：

- `web3ResearchService.runQuery(web3Q)` -> 返回结构化 market data
- 如果 `plan.capabilities.search.needed` 且问题和 crypto 社交有关：
  - 并行调用 `researchService.runDeepResearch(...)`
- 新增一个 reducer 步骤：
  - `buildCryptoIntermediateBrief({ marketRaw, socialRaw, userQuery })`
- 最终 agent 只使用 reducer 结果

3. UI 模块状态可以细分为：

- `web3_market`
- `web3_social`
- `web3_reduce`

这样用户能看到流程，不会误以为只是一个 CoinGecko 价格查询。

## 5.4 新增 `server/src/services/web3Reducer.service.ts`

建议新增一个 reducer service，专门做轻量总结。

职责：

- 压缩 MCP 原始结果
- 压缩 Twitter/Bird 结果
- 输出稳定 JSON 或短 markdown

建议 prompt：

```text
你是一名加密市场研究压缩器。你的任务不是直接回答用户，而是把上游市场数据与社交数据压缩成一份高信息密度、低冗余的中间摘要，供最终回答代理使用。

要求：
1. 优先保留事实、数字、时间范围和来源。
2. 明确区分“市场事实”和“社交叙事/情绪”。
3. 不要写空话，不要重复原始数据。
4. 将社交情绪归纳为 bullish / bearish / mixed / unclear。
5. 输出必须严格遵守指定 JSON 结构。
```

建议输出 schema：

```json
{
  "query_intent": "",
  "assets": [],
  "market_snapshot": [],
  "trend_summary": "",
  "social_sentiment": {
    "label": "bullish",
    "positive_ratio": 0,
    "negative_ratio": 0,
    "neutral_ratio": 0
  },
  "key_bull_points": [],
  "key_bear_points": [],
  "key_risks": [],
  "missing_data": [],
  "confidence": "medium"
}
```

## 5.5 复用 `researchService` 作为 Twitter 节点

不要把 Bird 逻辑硬塞进 `server/tools/web3/src/cli.ts`。

更好的做法：

- `cli.ts` 只负责 CoinGecko / REST / MCP 相关市场数据
- `researchService` 负责 X/Twitter 数据
- 在 `socket/index.ts` 或新的 orchestrator service 里并发合并

好处：

- 职责清晰
- 出问题容易定位
- 可单独控制开关和成本
- 未来还能把 Reddit / Web 一起加进 crypto brief

### 推荐的 Twitter 搜索策略

针对单币或项目，构造以下查询：

- `official project name + symbol + Twitter/X sentiment`
- `@official_handle`
- `token symbol + narrative`
- `project name + launch / listing / partnership / exploit / unlock`

### 基础情绪分析先做轻量版

第一阶段先做：

- 最近 N 条推文
- 去重
- 按互动量加权
- 轻量模型做三分类：positive / negative / neutral
- 归纳 bullish / bearish narratives

不要第一版就追求很重的情感模型。

## 6. 怎么避免“只有一个代币功能”

这是这次升级最关键的目标。

建议把 query intent 扩展成以下类型：

1. `token_quote`
   - 单币价格快照

2. `token_deep_dive`
   - 单币深度分析

3. `multi_asset_compare`
   - 比较 BTC / ETH / SOL 之类

4. `market_scan`
   - top gainers / losers / trending / recent listings

5. `category_scan`
   - AI Agent / DeFi / Meme / L1 等赛道

6. `onchain_scan`
   - 某链热点、池子、流动性、DEX

7. `nft_scan`
   - NFT floor / collection trend

也就是说，`web3.query` 不应再被理解成“某个币名”，而要理解成“一个 crypto intent”。

同时在 `ai.service.ts` 后续可以升级：

- 让 `capabilities.web3` 支持更多字段

例如：

```json
{
  "needed": true,
  "query": "top ai agent coins by market cap and 7d trend",
  "intent": "category_scan",
  "assets": ["virtual-protocol", "ai16z"],
  "wantsSocial": true,
  "wantsHistory": true
}
```

如果暂时不想大改 router，也可以先在 `cli.ts` 内部自己做 intent classification。

## 7. 优化建议

### 7.1 优先结构化输出，少输出大段自然语言

自然语言只保留：

- `report`
- 最终面向用户的回答

中间层一律尽量结构化。

### 7.2 对不同 query type 限制节点数量

例如：

- `token_quote`：只调 resolution + spot
- `token_deep_dive`：spot + market + history + metadata + social
- `market_scan`：trending / gainers / categories，不去跑单币深度历史

这样能显著降时延。

### 7.3 增加部分缓存

建议缓存：

- tool catalog
- token resolution
- trending / categories 短 TTL
- spot snapshot 超短 TTL

### 7.4 增加 observability

建议日志字段：

- `intent`
- `assets`
- `tool_catalog_hit`
- `capabilities_called`
- `mcp_calls`
- `rest_fallback_calls`
- `reduce_prompt_chars`
- `reduce_output_chars`
- `elapsed_ms`

## 8. 推荐实施顺序

### Phase 1

先把 `cli.ts` 升级成“多节点市场链路”，暂不接 Twitter：

- resolve assets
- spot
- market detail
- history
- metadata
- structured JSON output

### Phase 2

新增 `web3Reducer.service.ts`：

- 轻量总结市场数据
- 最终 agent 先只吃 reducer 结果

### Phase 3

接入 `researchService` 作为 crypto social 节点：

- X/Twitter
- 基础 sentiment
- social reducer

### Phase 4

扩展 query 类型：

- trending
- categories
- onchain
- NFT
- multi-asset compare

## 9. 最小可行改造方案

如果想先低成本验证，建议第一版只做这 4 件事：

1. `cli.ts`
   - 增加 intent classification
   - 增加多节点调用
   - 改成结构化 JSON 输出

2. `web3Research.service.ts`
   - 返回 `report + raw`

3. 新增 `web3Reducer.service.ts`
   - 用轻量模型压缩 market data

4. `socket/index.ts`
   - 最终 synthesis 前先插入 reducer

这样就已经能解决当前最明显的问题：

- 不再只有一个币种问价能力
- 不再只会调用一个工具
- 不再让最终 agent 直接吞大段原始文本

## 10. 建议新增的环境变量

```dotenv
# CoinGecko MCP
COINGECKO_MCP_URL=
COINGECKO_MCP_SSE_URL=
COINGECKO_PRO_API_KEY=
COINGECKO_TOOL_CACHE_TTL_MS=300000

# Web3 reducer
WEB3_REDUCER_MODEL=
WEB3_REDUCER_API_KEY=
WEB3_REDUCER_API_BASE_URL=

# Social integration
WEB3_ENABLE_SOCIAL=true
WEB3_SOCIAL_MAX_POSTS=30
```

## 11. 最终建议

这次升级不建议继续围绕“如何把 `pickTool()` 选得更准”去做微调。

正确方向是：

- 从单工具切到多能力链路
- 从长文本切到结构化输出
- 从单币问价切到多种 crypto intent
- 从最终 agent 直吃原始数据切到“轻量 reducer -> 最终 agent”
- 从单一 CoinGecko 节点扩展到“CoinGecko + Twitter/X”双通道

如果按这个方案落地，Web3 模块会从“价格插件”升级成“可扩展的 crypto research pipeline”。
