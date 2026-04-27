# Surf API Test Rig

临时测试站,用来在接入 lokacash 主仓前先把 [asksurf.ai](https://asksurf.ai) 的
**全部 83 个 Data API 端点 + Chat API + 余额查询**逐一跑一遍,看输出质量、字段完整度、延迟、credits 消耗。

> **最新更新**:catalog 已按 [`docs/surf.md`](../../../docs/surf.md)(对照官方
> [docs.asksurf.ai](https://docs.asksurf.ai))逐条核对。所有路径、参数、枚举值
> 与官方文档一致,不再有"路径未核实"的猜测项。

## 架构

```
浏览器 ──/api/surf/*──► 本地 Express 代理 ──Bearer Key──► api.asksurf.ai
```

代理同时支持两个上游 base:

- **Data API**:`https://api.asksurf.ai/gateway/v1`(默认,代理自动加前缀)
- **Chat API**:`https://api.asksurf.ai`(通过 `X-Surf-Base-Override` header 切换)

实现:

- `server.js` — Node/Express 代理。**API key 只在 `.env` 里**,不进浏览器。
- `index.html` — 单页 UI。左侧 catalog 按 12 个 domain 分组,主区参数表单 + 响应面板。
- 所有响应都解析 `meta.credits_used`,顶部右上角累计计数。

## 第一次运行

```bash
cd server/tools/surf-test
cp .env.example .env
# 编辑 .env,把 SURF_API_KEY 改成你自己的 key
npm install
npm start
```

打开 http://localhost:3999

> **安全提示**:`.env` 在 `.gitignore` 里,但 key 仍按临时态对待 ——
> 测完建议在 asksurf.ai dashboard rotate 一次,正式接入用新 key 放 lokacash 主仓的 server `.env`。

## Catalog 一览(85 条)

| 分组 | 数量 | 说明 |
|------|-----:|------|
| 🔧 Sanity Check | 2 | `me/credit-balance` + `exchange/price`,验证 key + base URL |
| 🔥 Chat API | 1 | OpenAI 兼容的 `chat/completions`(走 `api.asksurf.ai/v1/...`) |
| 💱 Exchange · 交易所 | 7 | markets / price / depth / klines / perp / funding-history / long-short-ratio |
| 📈 Market · 市场 | 11 | price / ranking / futures / options / etf / price-indicator / onchain-indicator / fear-greed / liquidation/{chart,exchange-list,order} |
| 🪙 Token · 代币 | 4 | holders / transfers / dex-trades / tokenomics |
| 📊 Project · 项目 | 3 | detail / defi/metrics / defi/ranking |
| 📱 Social · 社交 | 11 | detail / mindshare / ranking / smart-followers/history / tweets / user / user/{posts,following,followers,replies} / tweet/replies |
| 📰 News · 新闻 | 2 | feed / detail |
| 💼 Wallet · 钱包 | 6 | detail / labels/batch / transfers / history / protocols / net-worth |
| ⛓️ Onchain · 链上 | 7 | tx / gas-price / query (POST) / sql (POST) / schema / bridge/ranking / yield/ranking |
| 🌐 Web · 网页 | 1 | fetch |
| 🔎 Search · 搜索 | 11 | project / social/posts / social/people / news / wallet / web / fund / polymarket / kalshi / events / airdrop |
| 💰 Fund · VC | 3 | detail / portfolio / ranking |
| 🎲 Prediction · 预测市场 | 17 | category-metrics + Polymarket 10 + Kalshi 7 |
| **合计** | **86** | (Sanity 2 个里 `exchange/price` 与 Exchange 域里那个是同一端点,实测仍是 85 条独立路径) |

每条都填好了合理默认参数(BTC、`vitalik.eth` 钱包、USDC 合约、a16z 基金等),点 **Send** 即可。

## Custom Endpoint

顶部的 **🎯 Custom Endpoint** 区域让你随时手动发任何 path。代理会自动:

- 补 `/gateway/v1` 前缀(如果你忘了带)
- 剥掉 `/gateway/v1` 前缀(如果你从文档复制了完整路径)
- 用 `X-Surf-Base-Override` header 路由到 Chat API base(预置端点已自动配)

## 怎么读结果

每次请求完成,响应面板显示:

- 🟢 绿色 = Surf 返回 2xx(成功)
- 🟡 黄色 = 401/403(key 无效 / 额度用尽 — 需要 rotate 或充值)
- 🔴 红色 = 4xx/5xx(参数错 / 服务端异常)

顶部 `meta` 行:

- `Roundtrip` — 浏览器端完整往返(proxy + Surf + 渲染)
- `Proxy→Surf` — 仅 Surf 响应耗时(proxy 记录)
- `Credits` — 本次消耗(红色,醒目;来自 `data.meta.credits_used`)
- `Cached` — Surf 是否返回了缓存结果

顶栏右侧 **查询余额** 按钮会调一次 `/me/credit-balance`,显示当前 key 剩多少 credits。

## 判定原则

测完后,针对每个端点问自己:

1. **字段完整?** —— 返回的 JSON 是不是真有 agent 能用的信息,还是只有一堆 ID?
2. **延迟可接受?** —— Proxy→Surf p50 在 300ms 内 = OK;> 2s 不能放 hot path
3. **credits 值不值?** —— 比如 wallet/detail ≈ 几 cr,一次 roundtable 消耗几个 cr 心里有数
4. **数据新鲜度?** —— 价格 / TVL 看 timestamp 字段,是不是近分钟?
5. **跟我们现有重叠吗?** —— 标了 `OVERLAP` 的(social/user/posts、search/social/posts、search/web)输出对比一下我们 Bird / Exa,决定要不要切换

## Badge 颜色含义

| 颜色 | 标签 | 含义 |
|------|------|------|
| 🟡 黄 | OVERLAP | 我们已有等价能力(Bird、Exa 等),用来对比是否要替换 |
| 🟢 绿 | NEW | lokacash 没有的全新能力,Roundtable / Surf intent 候选 |
| 🔵 蓝 | HEAVY | credits 消耗大,小心放 hot path,适合做缓存 / 异步 |
| 🌸 粉 | CHAT | 自然语言问答(Chat Completions API,OpenAI 兼容) |

## 通过后怎么接入主仓

测明白后,按这条路接:

1. 确认要接的端点集合(可能最终 15-25 个核心)
2. `server/tools/surf/` 下建正式 tools 子项目(对标现有 `server/tools/web3/`)
3. `server/src/services/surf.service.ts` 封装 REST client + 高层函数
4. 改 orchestrator prompt,加 web3 intent 到 `wallet_analysis` / `defi_position` / `prediction_market` 等
5. `web3Router.service.ts` 并行 fan-out 到 Surf,与 CoinGecko / OKX 互补

测试站用完可以整个 `server/tools/surf-test/` 目录删掉,或留着后续回归用。

## 参考

- 完整文档:[docs/surf.md](../../../docs/surf.md)(本仓库内,中文翻译版)
- 官方文档:<https://docs.asksurf.ai>
- OpenAPI 规范:<https://api.asksurf.ai/gateway/openapi.json>
- LLM 友好全文档:<https://docs.asksurf.ai/llms-full.txt>
