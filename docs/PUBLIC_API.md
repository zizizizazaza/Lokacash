# Lokacash Public API

> 对外提供的统一技术参考。两层 API、一份文档、不分 toB/toC——参考 Anthropic / 智谱 / OpenAI 的行业最佳实践。

**Last updated**: 2026-05-07
**Status**: 内测期（无鉴权 / 无配额 / 无计费）

---

## 目录

1. [总览](#总览)
2. [Base URL](#base-url)
3. [认证状态](#认证状态)
4. [Skill API（推荐入口）](#skill-api推荐入口)
5. [Advanced API（高级用户）](#advanced-api高级用户)
6. [SSE 流式格式](#sse-流式格式)
7. [安全模型](#安全模型)
8. [错误约定](#错误约定)
9. [完整调用示例](#完整调用示例)
10. [路线图（待实现）](#路线图待实现)

---

## 总览

Loka 对外提供三层 API，**端点一致、文档统一、用户类型不分**：

```
┌────────────────────────────────────────────────────────┐
│  ① OpenAI 兼容  /api/v1/chat/completions               │
│  → 通用聊天，兼容 OpenAI 协议（火山引擎/Coze/Dify…）    │
│  → 适合"把 Loka 当一个模型接进来"的接入方               │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  ② Skill API     /api/skill/v1/*                       │
│  → 任务化、白标、开箱即用                              │
│  → 适合 80% 接入方（toC 工具 / 标准 toB 集成）         │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  ③ Advanced API  /api/advanced/v1/*                    │
│  → 原语级、自定义群组与权重、流式辩论                   │
│  → 适合 20% 接入方（深度 toB 集成）                    │
└────────────────────────────────────────────────────────┘
```

差异化（toB vs toC）通过营销页、控制台、合同、SLA 实现，**API 本身保持一份**。

---

## Base URL

| 环境 | URL |
|---|---|
| 生产 | `https://nftkashai.online/lokacash` |
| 本地开发 | `http://localhost:3002` |

下文所有路径都是相对 Base URL 的，例如 `/api/skill/v1/info` 完整地址是 `https://nftkashai.online/lokacash/api/skill/v1/info`。

---

## 认证状态

**当前所有 `/api/skill/*` 和 `/api/advanced/*` 端点公开、无需认证。**

这是**内测期权宜方案**，正式对外接入前必须加：
- API Key（`Authorization: Bearer <key>`）
- 按 key 配额 / 限流 / 计费

详见 [路线图](#路线图待实现)。

---

## OpenAI 兼容层（通用聊天接入）

把 Loka 当成一个 OpenAI 兼容的模型接进任何 BYO-model 平台（火山引擎、Coze、Dify、LangChain、Cline、Cursor…），改一行 base URL 即可：

```python
from openai import OpenAI
client = OpenAI(
    base_url="http://localhost:3002/api/v1",
    api_key="sk-anything",   # 内测期任意值
)
resp = client.chat.completions.create(
    model="auto",       # auto / fast / roundtable
    messages=[{"role": "user", "content": "BTC 现在能买吗？"}],
    stream=True,
)
for chunk in resp:
    print(chunk.choices[0].delta.content or "", end="")
```

### `POST /api/v1/chat/completions`

完全兼容 OpenAI Chat Completions 协议。

**Body**（标准 OpenAI 字段，多余字段忽略）：
```json
{
  "model": "auto",
  "messages": [
    {"role": "user", "content": "你的问题"}
  ],
  "stream": true,
  "max_tokens": 2048,
  "temperature": 0.5
}
```

**模型选择**（通过 `model` 字段路由）：

| `model` | 走的内部模式 | 用途 |
|---|---|---|
| `auto`（默认） | Auto 路由 | 通用对话，由路由器自动选合适流程 |
| `fast` | Fast 模式 | 直接 LLM 回答，不调外部工具 |
| `roundtable` | Roundtable 模式 | 多 agent 圆桌共识，返回综合判断 |

**响应**：

- `stream: false` → 标准 `chat.completion` JSON
- `stream: true` → `text/event-stream` 的 `chat.completion.chunk` 事件流，以 `data: [DONE]\n\n` 结尾

### `GET /api/v1/models`

列出可选 model（兼容 OpenAI 探测）：
```json
{
  "object": "list",
  "data": [
    {"id":"auto","object":"model","owned_by":"lokacash"},
    {"id":"fast","object":"model","owned_by":"lokacash"},
    {"id":"roundtable","object":"model","owned_by":"lokacash"}
  ]
}
```

### 实时数据注入

**关键**：当 `auto` 或 `fast` 模式检测到查询里含加密符号时，会**自动**先调用 web3 路由器拉真实行情（CoinGecko + OKX），再把数据作为 system context 喂给 LLM。这是为了避免 LLM 拿训练数据里的旧价格瞎答（典型现象："BTC 现在 $63,420"）。

触发条件（满足任一即触发）：
- `$TICKER` 语法：`$BTC`、`$ETH`
- 主流 ticker 字面量：`BTC` / `ETH` / `SOL` / `BNB` / `XRP` / `ADA` / `DOGE` / `AVAX` / `DOT` / `MATIC` / `LINK` / `UNI` / `LTC` / `ATOM` / `ARB` / `OP` / `TIA` / `SEI` / `JUP` / `PYTH` / `ONDO` / `PENGU` / `SHIB` / `PEPE` / `WIF` / `BONK`
- 中文关键词：比特币、以太坊、加密、代币、山寨、主流币、永续、合约

如果 web3 拉取失败（API quota 用完、网络问题），会**静默降级**到纯 LLM——比阻塞用户好。

**不触发的查询**（如"AAPL 当前估值"、"什么是 RAG"）走纯 LLM 路径，跟 OpenAI 行为一致。

### 当前限制

| 功能 | 状态 |
|---|---|
| `messages` 数组（system/user/assistant） | ✅ |
| `stream` 流式（auto/fast 真流式，roundtable 行级伪流式） | ✅ |
| `max_tokens` / `temperature` | ✅ |
| 加密查询自动注入实时行情 | ✅ |
| 股票查询自动注入实时数据 | ❌ 待补（目前股票走纯 LLM，可能出错价） |
| 通用网页搜索（Tavily/Exa）| ❌ 待补 |
| `tool_calls` / Function Calling | ❌ 暂不支持（auto/fast 内部用工具但不暴露给客户端） |
| 多模态 vision（content[] 块） | ❌ 暂不支持 |
| `response_format` / `json_mode` / `seed` / `logprobs` | ❌ 接受但忽略 |
| `usage` token 统计 | ⚠️ 返回零（待 API Key + 计费阶段补齐） |

---

## Skill API（推荐入口）

任务导向、JSON 进 JSON 出、单次请求拿结果。响应为白标格式（不暴露下游 OKX / CoinGecko / Tavily / aegean 等）。

### 能力发现

```
GET /api/skill/v1/info
```

返回当前可用端点清单和版本。

---

### Research（多领域研究）

#### `POST /api/skill/v1/research/consensus`

跑一次多 agent 圆桌共识。

**Body**:
```json
{
  "question": "BTC 短期能否突破 $80k？",
  "mode": "roundtable"      // 可选: "roundtable" | "collaborate"
}
```

**返回**: 共识结果（多数判断 + 每个 agent 立场 + 辩论关键点）。

#### `POST /api/skill/v1/research/deep`

深度网络 + 社交研究合成报告。

**Body**:
```json
{
  "topic": "Hetu Protocol 最近的进展和市场反应是什么？",
  "days": 30
}
```

字段：
- `topic`（必填）— 研究话题
- `days`（可选，默认 30）— 时间窗口，1-90

**返回**: Markdown 报告 + 来源列表。

---

### Crypto

#### `POST /api/skill/v1/crypto/deep-research`

加密专属深研：合成市场 + 情绪 + 新闻。

**Body**:
```json
{
  "query": "现在该不该加仓 ETH？"
}
```

注意字段名是 `query`，不是 `question`。

#### `POST /api/skill/v1/crypto/portfolio-analysis`

多 analyst 对持仓做 BUY/SELL/HOLD 决策（含数量与置信度）。

**Body**:
```json
{
  "tickers": ["BTC", "ETH", "SOL"],
  "analysts": ["buffett_style", "munger_style"],
  "showReasoning": true
}
```

字段：
- `tickers`（必填）— 1-3 个 ticker 数组（更多会被拒，避免延迟超 5 分钟）
- `analysts`（可选）— 指定 analyst persona id 列表，最多 10
- `showReasoning`（可选，默认 true）— 是否在返回里包含每位 analyst 的推理过程

#### `GET /api/skill/v1/crypto/sentiment/:symbol`

单币情绪 + 催化新闻。例：`/api/skill/v1/crypto/sentiment/BTC`

#### `GET /api/skill/v1/crypto/market/:symbol`

现货价 + 24h + 7D 历史。

#### `GET /api/skill/v1/crypto/derivatives/:symbol`

永续资金费率 + OI + 盘口深度。

#### `GET /api/skill/v1/crypto/events?limit=10`

即将发生的加密催化事件（解锁、协议升级、CPI 公布等）。

#### `GET /api/skill/v1/crypto/trending`

当下热搜币榜单（CoinMarketCap + CoinGecko 综合）。

#### `GET /api/skill/v1/crypto/pulse-meta`

Crypto Pulse 大盘元信息。

#### `GET /api/skill/v1/crypto/pulse-trending`

Pulse 视图的 trending list。

#### `GET /api/skill/v1/crypto/pulse-prices?symbols=BTC,ETH,SOL`

批量取实时价格。

---

### Stock

#### `GET /api/skill/v1/stock/analysis/:ticker`

完整股票分析：基本面 + 技术面 + 估值 + 资讯整合。例：`/api/skill/v1/stock/analysis/AAPL`

---

## Advanced API（高级用户）

直接代理 [aegean-consensus](../server/tools/aegean-consensus/) 的原语 API，不做 schema 转换——返回 aegean 的原始结构。适合需要：

- 自定义 agent 阵容
- 自定义投票权重
- 流式订阅辩论过程
- 多次调用复用同一群组

### 能力发现

```
GET /api/advanced/info
```

---

### Investment Analysis（`/api/advanced/v1/investment/*`）

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/analyze` | 同步跑一次投资分析 |
| POST | `/analyze/stream` | **SSE 流式跑分析** ⭐ |
| POST | `/analyses` | 创建异步分析任务 |
| GET | `/analyses/{id}` | 拿任务结果 |
| GET | `/analyses/{id}/status` | 查任务状态 |
| GET | `/analyses/{id}/stream` | 订阅已存在任务的事件流 |
| GET | `/analyses/{id}/timeline` | 执行时间线 |
| GET | `/analyses/{id}/discussion` | 辩论 trace（多 agent 对话过程） |
| GET | `/analyses/{id}/agents` | 参与的 agent 面板 |
| GET | `/analyses/{id}/policy-overrides` | 策略覆盖配置 |
| GET | `/analyses/{id}/risk-gate` | 风险门结果 |

#### 同步分析示例

```http
POST /api/advanced/v1/investment/analyze
Content-Type: application/json

{
  "symbol": "AAPL",
  "market": "US"
}
```

#### 流式分析示例

```http
POST /api/advanced/v1/investment/analyze/stream
Content-Type: application/json
Accept: text/event-stream

{
  "symbol": "BTC",
  "market": "crypto"
}
```

返回 `text/event-stream`，每个事件是一段 JSON。详见 [SSE 流式格式](#sse-流式格式)。

---

### Custom Groups & Consensus（`/api/advanced/v1/groups/*`）

完整的"自己组队 + 跑共识"原语。

#### 群组管理

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/` | 创建群组 |
| ~~GET~~ | ~~`/`~~ | ❌ **已禁用**（跨租户泄露，详见[安全模型](#安全模型)） |
| GET | `/{group_id}` | 群组详情（需提供 ID） |
| DELETE | `/{group_id}` | 删除群组 |
| GET | `/agents` | 列可用 agent 池（**公共目录，非用户数据**） |

#### 成员管理

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/{gid}/members` | 加成员 |
| DELETE | `/{gid}/members/{aid}` | 移除成员 |
| GET | `/{gid}/members` | 成员列表 |
| PUT | `/{gid}/members/{aid}` | 调整成员权重 |

#### 讨论 / 共识

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/{gid}/messages` | 发消息 |
| GET | `/{gid}/messages` | 消息历史 |
| POST | `/{gid}/consensus` | 执行共识（同步） |
| POST | `/{gid}/consensus/stream` | **流式共识** ⭐ |
| GET | `/{gid}/consensus/history` | 群组的共识历史 |
| GET | `/consensus/{cid}` | 拿单次共识结果 |
| POST | `/{gid}/consensus/{cid}/auto-verify` | 自动验证 |

#### 可视化数据

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/consensus/{cid}/agent-graph` | Agent 关系图 |
| GET | `/consensus/{cid}/knowledge-graph` | 知识图谱 |
| GET | `/consensus/{cid}/discussion` | 辩论轮次详情 |
| GET | `/{gid}/weights-summary` | 权重汇总 |

#### 评分 / 反馈

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/agents/{aid}/global-stats` | Agent 全局表现 |
| GET | `/{gid}/agent-stats/{aid}` | 群组内 agent 表现 |
| POST | `/{gid}/agent-feedback` | 提交反馈 |

#### 创建群组示例

```http
POST /api/advanced/v1/groups/
Content-Type: application/json

{
  "group_name": "btc-roundtable",
  "description": "BTC 短期辩论团",
  "created_by": "dev",
  "mode": "consensus",
  "initial_members": [
    {"agent_id": "buffett_style", "capability_weight": 1.0},
    {"agent_id": "munger_style", "capability_weight": 1.0},
    {"agent_id": "lynch_style", "capability_weight": 1.0}
  ]
}
```

返回里的 `group_id` 是后续所有调用的凭证——**请妥善保管**（详见[安全模型](#安全模型)）。

---

### Risk Assessment（`/api/advanced/v1/risk/*`）

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/evaluate` | 跑 VAN-pipeline 风险评估 |
| POST | `/challenge/{cid}/respond` | 应答挑战并重新评估 |
| ~~GET~~ | ~~`/sessions`~~ | ❌ **已禁用**（跨租户泄露） |
| GET | `/sessions/{sid}` | 单个会话详情 |
| GET | `/stats` | 验证器 + 会话统计（聚合数据，非个人） |
| POST | `/seed` | seed 知识库 |

---

## SSE 流式格式

流式端点（路径名带 `/stream`）返回 `text/event-stream`，每条事件是：

```
data: {"type":"agent_message","agent_id":"buffett_style","content":"...","round":1}

data: {"type":"round_complete","round":1,"verdict":"BULLISH","confidence":0.72}

...

data: {"type":"final_result","consensus_id":"<uuid>","result":{...}}
```

事件类型由下游服务定义，详见 [`server/src/services/consensus.service.ts`](../server/src/services/consensus.service.ts) 中的 `runConsensusEngine` 实现。

**JS 客户端建议用 `EventSource` 或 `fetch` + `ReadableStream`**：

```js
const res = await fetch('/api/advanced/v1/groups/<gid>/consensus/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: 'BTC 短期？' }),
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  console.log(chunk);  // 解析 SSE 行
}
```

---

## 安全模型

**当前 API 全公开，但 Advanced API 关闭了"跨租户枚举"端点**：

| 操作 | 状态 |
|---|---|
| 创建资源（POST groups / analyses 等） | ✅ 任何人 |
| 读取自己创建的资源（凭 UUID） | ✅ 知者得之，UUID 即权限凭证 |
| 列举所有资源（`GET /groups/`、`GET /risk/sessions`） | ❌ **403 endpoint_disabled** |
| 公共目录（`GET /groups/agents`） | ✅ 公开 |

**这是 GitHub Gist / Pastebin 的同款模型**：

> 资源不可枚举，UUID 不可猜，丢了 UUID 就找不回。

接入方应该**自己保管所有 `group_id` / `consensus_id` / `analysis_id`**——server 不会"列出我创建的"。

正式对外（接火山引擎那种平台）前必须切到 API Key + 真租户隔离，详见[路线图](#路线图待实现)。

---

## 错误约定

所有错误响应统一格式：

```json
{
  "ok": false,
  "error": "<stable_code>",
  "message": "<human-readable description>"
}
```

| 状态码 | 典型 `error` code | 含义 |
|---|---|---|
| 400 | `missing_question`, `invalid_symbol` | 入参不对 |
| 403 | `endpoint_disabled` | Advanced API 跨租户端点被禁 |
| 404 | `not_found` | 资源 ID 不存在 |
| 502 | `upstream_failed`, `upstream_unreachable` | 下游 OKX/aegean 不可达 |
| 504 | `upstream_timeout` | 下游超时（默认 5 分钟） |
| 500 | `<service>_failed` | 服务内部异常 |

Skill API 成功响应：`{ "ok": true, "data": {...} }`
Advanced API 成功响应：直接返回 aegean 原始 JSON（无 `ok` wrapper）

---

## 完整调用示例

### 例 1：跑一次圆桌共识（Skill API）

```bash
curl -X POST http://localhost:3002/api/skill/v1/research/consensus \
  -H "Content-Type: application/json" \
  -d '{"question":"BTC 短期能否突破 $80k？","mode":"roundtable"}'
```

### 例 2：自定义阵容跑共识（Advanced API）

```bash
# 1. 创建群组（指定 5 位 agent）
GID=$(curl -s -X POST http://localhost:3002/api/advanced/v1/groups/ \
  -H "Content-Type: application/json" \
  -d '{
    "group_name": "btc-team",
    "created_by": "dev",
    "initial_members": [
      {"agent_id":"buffett_style"},
      {"agent_id":"munger_style"},
      {"agent_id":"lynch_style"},
      {"agent_id":"sentiment_focus"},
      {"agent_id":"macro_focus"}
    ]
  }' | jq -r '.group_id')

# 2. 流式跑共识
curl -N -X POST "http://localhost:3002/api/advanced/v1/groups/$GID/consensus/stream" \
  -H "Content-Type: application/json" \
  -d '{"question":"BTC 能否在 Q3 突破 80k？"}'
```

### 例 3：股票分析（Skill API）

```bash
curl http://localhost:3002/api/skill/v1/stock/analysis/AAPL
```

### 例 4：投资分析流式（Advanced API）

```bash
curl -N -X POST http://localhost:3002/api/advanced/v1/investment/analyze/stream \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTC","market":"crypto"}'
```

### 例 5：OpenAI 兼容流式（通用聊天）

```bash
curl -N -X POST http://localhost:3002/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role":"user","content":"BTC 现在适合买入吗？"}],
    "stream": true
  }'
```

切换 roundtable 共识模式：把 `model` 改成 `roundtable` 即可。

---

## 路线图（待实现）

正式对外前必须做的事：

### 阶段 1：API Key + 配额（**必做**）

- 数据库新增 `ApiKey` 表（owner、scopes、monthly_quota、rps_limit）
- 中间件：`Authorization: Bearer <key>` 鉴权
- 用量记录到 `ApiUsage` 表（key_id、endpoint、latency、ok、ts）
- 控制台增加 "API Keys" 页面（生成 / 撤销 / 看用量）

预计工作量：1-2 天

### 阶段 2：OpenAI 协议兼容层（**已完成 v1**）

✅ `POST /api/v1/chat/completions` 已上线，三个 model id（`auto` / `fast` / `roundtable`）覆盖现有路由模式，stream/sync 都支持。

**v1 → v2 待补**：
- `tool_calls` 增量字段（让接入方看到 web 搜索 / web3 工具的调用过程）
- 多模态 `content[]` 块（接入图片识别）
- 真实 `usage` token 统计

### 阶段 3：真租户隔离（**对外卖之前必做**）

- API Key 绑定 tenant_id
- aegean 调用全部强制注入 `created_by = tenant_id`
- 读取所有资源时校验 owner
- 删除全量 deny-list（因为不再需要——每个 key 只看到自己的资源）

预计工作量：1 天（aegean 端可能需要轻改）

### 阶段 4：生产化加固

- aegean 自身加鉴权 + 移到 VPC
- 限流 + 配额降级
- 多区域 CDN
- Trust Center / Status Page / SLA 文档

---

## 参考实现

| 文件 | 角色 |
|---|---|
| [`server/src/routes/openaiCompat.ts`](../server/src/routes/openaiCompat.ts) | OpenAI 兼容层（chat completions + models） |
| [`server/src/routes/skill.ts`](../server/src/routes/skill.ts) | Skill API 实现（13 个端点） |
| [`server/src/routes/advanced.ts`](../server/src/routes/advanced.ts) | Advanced API 代理层（含 SSE 转发 + deny-list） |
| [`server/src/services/skillMapper.ts`](../server/src/services/skillMapper.ts) | aegean → 白标 schema 映射 |
| [`server/src/services/consensus.service.ts`](../server/src/services/consensus.service.ts) | aegean SSE 客户端（内部消费用） |
| [`server/tools/aegean-consensus/`](../server/tools/aegean-consensus/) | Python FastAPI 共识引擎（端口 8100 / 生产 8000） |

---

## 反馈

发现 schema 不匹配 / 端点行为异常 / 文档过时？提 issue 或直接联系平台团队。
