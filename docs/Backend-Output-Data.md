# Loka Super Agent — 后端输出数据手册

> 本文档梳理后端各模块返回给前端的完整数据结构与示例。

---

## 目录

1. [执行路径总览](#1-执行路径总览)
2. [路由决策（Routing）](#2-路由决策routing)
3. [Socket 事件清单](#3-socket-事件清单)
4. [模块数据详解](#4-模块数据详解)
   - 4.1 [Search 模块](#41-search-模块搜索)
   - 4.2 [Analysis 模块](#42-analysis-模块股票分析)
   - 4.3 [Simulation 模块](#43-simulation-模块对冲基金模拟)
   - 4.4 [Synthesis 阶段](#44-synthesis-阶段合成)
   - 4.5 [Consensus 模块（Roundtable）](#45-consensus-模块roundtable-专属)
5. [简单聊天路径](#5-简单聊天路径)
6. [数据库存储结构](#6-数据库存储结构)
7. [前端事件时序图](#7-前端事件时序图)

---

## 1. 执行路径总览

| 路径 | 触发条件 | 涉及模块 |
|------|---------|---------|
| **简单聊天** | `plan.isSimpleChat === true` 且非 roundtable 模式 | 直接 LLM → 流式输出 |
| **多 Agent 编排** | search / analysis / simulate 任一 needed | 并行 Agent → 合成 |
| **圆桌会议** | 用户选择 roundtable 模式 | 多 Agent → 合成 → 共识投票 |

---

## 2. 路由决策（Routing）

由 `ai.service.ts → evaluateRouting()` 返回：

```typescript
interface OrchestratorPlan {
  isSimpleChat: boolean;
  capabilities: {
    analysis: { needed: boolean; tickers?: string[] };
    search:   { needed: boolean; query?: string };
    simulate: { needed: boolean; tickers?: string[] };
  };
}
```

### 示例

**用户问**：`"今天英伟达怎么走的"`
```json
{
  "isSimpleChat": false,
  "capabilities": {
    "analysis": { "needed": true, "tickers": ["NVDA"] },
    "search":   { "needed": true, "query": "Nvidia NVDA stock news today" },
    "simulate": { "needed": false }
  }
}
```

**用户问**：`"大家对特斯拉怎么看"`
```json
{
  "isSimpleChat": false,
  "capabilities": {
    "analysis": { "needed": false },
    "search":   { "needed": true, "query": "Tesla TSLA market sentiment opinion" },
    "simulate": { "needed": false }
  }
}
```

**用户问**：`"hi, what can you do?"`
```json
{
  "isSimpleChat": true,
  "capabilities": {
    "analysis": { "needed": false },
    "search":   { "needed": false },
    "simulate": { "needed": false }
  }
}
```

---

## 3. Socket 事件清单

| 事件名 | 方向 | 说明 |
|--------|------|------|
| `agent:chat:started` | S→C | 开始处理 |
| `agent:chat:routing` | S→C | 路由中（前端显示 "Routing..."） |
| `agent:chat:routed` | S→C | 路由完成，携带 plan |
| `agent:chat:module` | S→C | 模块状态更新（search/analysis/simulation/consensus/done） |
| `agent:chat:progress` | S→C | 流式文本 chunk（合成阶段） |
| `agent:chat:content_replace` | S→C | 整体替换当前消息内容（用于剥离 Questions to watch） |
| `agent:chat:thinking_log` | S→C | 搜索模块实时日志 |
| `agent:chat:tool_trace` | S→C | 分析模块工具调用追踪 |
| `agent:chat:consensus_done` | S→C | 共识引擎完成 |
| `agent:chat:stream_done` | S→C | 全部完成，携带最终内容 |
| `agent:chat:error` | S→C | 错误 |
| `agent:chat:stop` | C→S | 用户点击停止按钮 |

---

## 4. 模块数据详解

### 4.1 Search 模块（搜索）

**事件**：`agent:chat:module` + `agent:chat:thinking_log`

#### 模块状态变化

```
search/active → search/completed
```

#### Active 时携带数据

```json
{
  "sessionId": "uuid",
  "moduleType": "search",
  "status": "active",
  "data": {
    "variant": "social",
    "sources": [],
    "providers": [
      { "name": "Yahoo Finance" },
      { "name": "Bloomberg API" },
      { "name": "Alpha Vantage" },
      { "name": "Polygon.io" },
      { "name": "CoinGecko" },
      { "name": "TradingView" }
    ]
  }
}
```

#### Completed 时携带数据

```json
{
  "sessionId": "uuid",
  "moduleType": "search",
  "status": "completed",
  "data": {
    "variant": "social",
    "sources": [
      {
        "favicon": "reddit",
        "title": "Tesla Q1 Earnings Discussion",
        "domain": "reddit.com",
        "url": "https://www.reddit.com/r/investing/comments/abc123"
      },
      {
        "favicon": "x",
        "title": "TSLA Technical Analysis Thread",
        "domain": "x.com",
        "url": "https://x.com/analyst/status/123456"
      },
      {
        "favicon": "youtube",
        "title": "Tesla Stock Deep Dive - Why I'm Bullish",
        "domain": "youtube.com",
        "url": "https://www.youtube.com/watch?v=xyz"
      },
      {
        "favicon": "web",
        "title": "Tesla faces headwinds in Q2 deliveries",
        "domain": "bloomberg.com",
        "url": "https://www.bloomberg.com/news/articles/..."
      }
    ]
  }
}
```

#### SignalSearchSource 类型定义

```typescript
type SignalSearchSource = {
  favicon: string;   // 'reddit' | 'x' | 'youtube' | 'weibo' | 'web' | 'hackernews' | 'telegram' | 'discord'
  title: string;     // 来源标题
  domain: string;    // 域名
  url?: string;      // 原始链接
};
```

#### Thinking Log 实时日志

```json
{
  "sessionId": "uuid",
  "line": "[Last30Days] Searching Reddit for 'Tesla TSLA sentiment'..."
}
```

---

### 4.2 Analysis 模块（股票分析）

**事件**：`agent:chat:module` + `agent:chat:tool_trace`

由 Python 工具 `stock-analysis` 执行，通过 JSONL 流式输出步骤事件。

#### 模块状态变化

```
analysis/active → analysis/completed
```

#### StepEvent 类型定义

```typescript
interface StepEvent {
  type: 'thinking' | 'tool_start' | 'tool_done' | 'generating' | 'done' | 'error';
  step?: number;
  tool?: string;
  displayName?: string;
  message?: string;
  success?: boolean;
  duration?: number;       // 毫秒
  content?: string;
  totalSteps?: number;
  error?: string;
  ts: number;              // 时间戳
}
```

#### StepEvent 示例序列

```json
{"type":"thinking","step":1,"ts":1712345678900,"message":"Analyzing market context..."}
{"type":"tool_start","tool":"get_realtime_quote","displayName":"获取实时行情","step":1,"ts":1712345678950}
{"type":"tool_done","tool":"get_realtime_quote","success":true,"duration":245,"step":1,"ts":1712345679195}
{"type":"tool_start","tool":"get_daily_history","displayName":"获取日K线","step":2,"ts":1712345679200}
{"type":"tool_done","tool":"get_daily_history","success":true,"duration":312,"step":2,"ts":1712345679512}
{"type":"tool_start","tool":"analyze_trend","displayName":"技术指标分析","step":3,"ts":1712345679520}
{"type":"tool_done","tool":"analyze_trend","success":true,"duration":180,"step":3,"ts":1712345679700}
{"type":"tool_start","tool":"search_stock_news","displayName":"搜索新闻资讯","step":4,"ts":1712345679710}
{"type":"tool_done","tool":"search_stock_news","success":true,"duration":890,"step":4,"ts":1712345680600}
{"type":"generating","message":"[UI_METADATA]","content":"{\"fundamental\":{\"PE\":15.5,\"PB\":2.3,\"Turnover\":5.2},\"technical\":{\"MA_Alignment\":\"Bullish\",\"Trend\":\"Uptrend\",\"Signal\":\"Buy\"},\"social\":{\"provider\":\"Web\",\"results\":[]}}","ts":1712345680700}
{"type":"done","content":"### 标的信息\n- **证券代码**: TSLA\n- **股票名称**: Tesla, Inc.\n...完整分析报告...","ts":1712345681000}
```

#### UI Metadata 结构（嵌在 StepEvent 中）

```json
{
  "fundamental": {
    "PE": 15.5,
    "PB": 2.3,
    "Turnover": 5.2
  },
  "technical": {
    "MA_Alignment": "Bullish",
    "Trend": "Uptrend",
    "Signal": "Buy"
  },
  "social": {
    "provider": "Web",
    "results": [
      { "title": "Tesla Q1 earnings...", "url": "https://..." }
    ]
  }
}
```

#### Analysis 模块 Completed 数据

```json
{
  "sessionId": "uuid",
  "moduleType": "analysis",
  "status": "completed",
  "data": {
    "stages": [
      {
        "id": "fundamental",
        "label": "Fundamental analysis",
        "status": "completed",
        "result": [
          { "label": "PE", "value": "15.5x", "color": "text-blue-600" },
          { "label": "PB", "value": "2.30x", "color": "text-indigo-600" },
          { "label": "Turnover", "value": "5.20%", "color": "text-amber-600" }
        ]
      },
      {
        "id": "technical",
        "label": "Technical analysis",
        "status": "completed",
        "result": [
          { "label": "Trend", "value": "Uptrend", "color": "text-emerald-600" },
          { "label": "MA", "value": "Bullish", "color": "text-emerald-600" },
          { "label": "Signal", "value": "Buy", "color": "text-emerald-600" }
        ]
      },
      {
        "id": "sentiment",
        "label": "Sentiment analysis",
        "status": "completed"
      }
    ]
  }
}
```

#### Quote Snapshot（嵌在分析报告文本中）

中文格式：
```markdown
### 标的信息
- **证券代码**: 600519.SH
- **股票名称**: 贵州茅台
- **所属市场**: A股（上海证券交易所）
- **最新价**: ¥1,856.00
- **涨跌幅**: +1.23%
- **成交额**: 35.6亿
- **数据时点**: 2024-04-09 15:00
```

英文格式：
```markdown
### Quote Snapshot
- **Symbol**: TSLA (Tesla, Inc.)
- **Market**: US (NASDAQ)
- **Last Price**: $343.25
- **Change (%)**: +0.59% (+$2.00)
- **Volume**: 78.49M
- **As of**: Latest trading session
```

---

### 4.3 Simulation 模块（对冲基金模拟）

**事件**：`agent:chat:module`

由 Python 工具 `ai-hedge-fund` 执行。

#### 模块状态变化

```
simulation/active → simulation/completed
```

#### HedgeFundResult 类型定义

```typescript
interface HedgeFundResult {
  tickers: string[];
  start_date: string;
  end_date: string;
  analysts: string[];
  model: string;
  decisions: Record<string, {
    action: string;       // "BUY" | "SELL" | "HOLD" | "SHORT"
    quantity: number;
    confidence: number;   // 0-1
    reasoning: string;
  }>;
  analyst_signals: Record<string, Record<string, {
    signal: string;       // "BULLISH" | "BEARISH" | "NEUTRAL"
    confidence: number;   // 0-100
    reasoning: string;
  }>>;
}
```

#### HedgeFundResult 完整示例

```json
{
  "tickers": ["AAPL"],
  "start_date": "2024-03-01",
  "end_date": "2024-04-09",
  "analysts": ["warren_buffett", "charlie_munger", "cathie_wood", "david_tepper"],
  "model": "deepseek-chat",
  "decisions": {
    "AAPL": {
      "action": "BUY",
      "quantity": 100,
      "confidence": 0.85,
      "reasoning": "Strong technical momentum with bullish MA alignment and positive sentiment signals."
    }
  },
  "analyst_signals": {
    "warren_buffett": {
      "AAPL": {
        "signal": "BULLISH",
        "confidence": 90,
        "reasoning": "Long-term value play with strong fundamentals, robust FCF, and competitive moat."
      }
    },
    "charlie_munger": {
      "AAPL": {
        "signal": "BULLISH",
        "confidence": 85,
        "reasoning": "Quality business with pricing power and loyal ecosystem."
      }
    },
    "cathie_wood": {
      "AAPL": {
        "signal": "NEUTRAL",
        "confidence": 60,
        "reasoning": "Innovation pace slowing, limited disruption catalyst in near term."
      }
    },
    "david_tepper": {
      "AAPL": {
        "signal": "BULLISH",
        "confidence": 75,
        "reasoning": "Macro environment favorable, buyback program supports price."
      }
    }
  }
}
```

#### Simulation 模块 Completed 数据

```json
{
  "sessionId": "uuid",
  "moduleType": "simulation",
  "status": "completed",
  "data": {
    "panelists": [
      {
        "name": "warren_buffett",
        "avatar": "L",
        "status": "done",
        "verdict": "BULLISH",
        "confidence": 90
      },
      {
        "name": "charlie_munger",
        "avatar": "L",
        "status": "done",
        "verdict": "BULLISH",
        "confidence": 85
      },
      {
        "name": "cathie_wood",
        "avatar": "L",
        "status": "done",
        "verdict": "NEUTRAL",
        "confidence": 60
      },
      {
        "name": "david_tepper",
        "avatar": "L",
        "status": "done",
        "verdict": "BULLISH",
        "confidence": 75
      }
    ]
  }
}
```

---

### 4.4 Synthesis 阶段（合成）

**事件**：`agent:chat:progress`（流式 chunk）

将所有 Agent 报告拼接后交给 LLM 重写为统一的分析报告。

#### 合成报告固定格式

```markdown
# [一句话标题，类似新闻标题]

## Key Takeaways
- 要点 1
- 要点 2
- 要点 3
- 要点 4

## [主题相关标题 — 如 "流动性危机：没人在谈的挤兑风险"]
叙事式分析段落。数据配合解读。引用链接如 ([Bloomberg](https://...))。
用 "My take:" 给出直接判断。

## [第二个主题标题 — 如 "空头为什么这次错了"]
继续分析。质疑假设，指出矛盾之处。

| 观点 | 证据 | 市场反应 | 我的判断 |
|------|------|---------|---------|
| ... | ... | ... | ... |

## [风险标题 — 如 "三颗随时可能引爆的雷"]
具体风险分析，带严重程度。

**Bottom line:** [一段话 — 最清晰可操作的结论。给出 Buy/Hold/Sell/Watch 建议。]

Significance: High · Categories: Market Structure, Macro

---

**Questions to watch:**
- [会改变投资论点的前瞻性问题]
- [需要持续监测的数据指标]
- [可能暴雷的风险点]
```

#### 流式 chunk 示例

```json
// 每个 chunk 都是 agent:chat:progress 事件
{ "sessionId": "uuid", "content": "# " }
{ "sessionId": "uuid", "content": "Tesla's Q1 Miss" }
{ "sessionId": "uuid", "content": " — Why the Market" }
{ "sessionId": "uuid", "content": " Shrugged\n\n## Key" }
// ... 持续流式输出直到完成
```

---

### 4.5 Consensus 模块（Roundtable 专属）

**事件**：`agent:chat:module` + `agent:chat:consensus_done`

仅在 roundtable 模式下触发。4 个预设专家角色参与共识投票。

#### 专家角色

| ID | 名称 | 职责 |
|----|------|------|
| `agent_0` | Fundamental Analyst | 基本面分析师 |
| `agent_1` | Macro Strategist | 宏观策略师 |
| `agent_2` | Sentiment Engine | 情绪分析引擎 |
| `agent_3` | Quant Tracker | 量化追踪器 |

#### 模块状态变化

```
consensus/active(building) → consensus/active(discussing) → consensus/completed(concluded)
```

#### Active 状态数据

```json
{
  "sessionId": "uuid",
  "moduleType": "consensus",
  "status": "active",
  "data": {
    "status": "building",
    "round": 1,
    "maxRounds": 3
  }
}
```

```json
{
  "sessionId": "uuid",
  "moduleType": "consensus",
  "status": "active",
  "data": {
    "status": "discussing",
    "round": 1,
    "maxRounds": 3
  }
}
```

#### Completed 状态数据

```json
{
  "sessionId": "uuid",
  "moduleType": "consensus",
  "status": "completed",
  "data": {
    "status": "concluded",
    "round": 2,
    "maxRounds": 3,
    "conclusion": {
      "verdict": "Buy on dips above MA20 with strict stop-loss",
      "confidence": 0.78
    }
  }
}
```

#### consensus_done 事件完整数据

```json
{
  "sessionId": "uuid",
  "result": {
    "consensus": {
      "finalAnswer": "Based on our collective analysis, Tesla presents a cautious buy opportunity...\n\n**Verdict:** Buy on dips\n**Confidence:** 78%\n**Key Condition:** Price must hold above MA20 ($356)",
      "confidence": 0.78,
      "consensusReached": true,
      "roundsUsed": 2,
      "agentResponses": [
        {
          "agentId": "agent_0",
          "answer": "From a fundamental perspective, Tesla's PE at 45x remains elevated but justified by 25% revenue growth. The Q1 delivery miss is concerning but likely a one-quarter blip. Key risk: margin compression from price cuts.",
          "confidence": 0.72
        },
        {
          "agentId": "agent_1", 
          "answer": "Macro environment is supportive — Fed pivot expected in Q3. EV sector benefits from lower rates. However, China competition intensifying with BYD gaining share.",
          "confidence": 0.80
        },
        {
          "agentId": "agent_2",
          "answer": "Social sentiment is mixed. Reddit bullish, Twitter/X bearish. News flow negative on Q1 miss but priced in. RSI at 39 suggests near-term oversold bounce likely.",
          "confidence": 0.68
        },
        {
          "agentId": "agent_3",
          "answer": "Quant signals: bearish trend (MA5<MA10<MA20), but RSI oversold. Volume neutral. MACD negative diverging. Short-term bearish, but mean reversion setup forming if $330 holds.",
          "confidence": 0.85
        }
      ]
    }
  }
}
```

#### 最终流式输出文本（Expert Council Verdict）

当专家意见**一致**时：
```markdown

---

## Expert Council Verdict

Based on our collective analysis, Tesla presents a cautious buy opportunity...

**Verdict:** Buy on dips
**Confidence:** 78%
**Key Condition:** Price must hold above MA20 ($356)
```

当专家意见**分歧**时，额外附加：
```markdown

---

## Expert Council Verdict

Based on our collective analysis...

**Individual Expert Perspectives:**

**Fundamental Analyst** (72% confidence):
From a fundamental perspective, Tesla's PE at 45x remains elevated...

**Macro Strategist** (80% confidence):
Macro environment is supportive — Fed pivot expected in Q3...

**Sentiment Engine** (68% confidence):
Social sentiment is mixed. Reddit bullish, Twitter/X bearish...

**Quant Tracker** (85% confidence):
Quant signals: bearish trend (MA5<MA10<MA20), but RSI oversold...
```

---

## 5. 简单聊天路径

最简执行路径，无 Agent 参与。

#### 事件序列

```
agent:chat:started → agent:chat:module(search/active) → agent:chat:progress(chunks) → agent:chat:module(search/completed) → agent:chat:module(done/completed) → agent:chat:stream_done
```

#### stream_done 数据

```json
{
  "sessionId": "uuid",
  "content": "你好！我是 Loka Super Agent，可以帮你分析股票、搜索市场资讯、模拟投资策略等。你想了解什么？"
}
```

---

## 6. 数据库存储结构

每条回复存为 `chatMessage`：

```typescript
{
  userId: "user_123",
  sessionId: "session_uuid",
  role: "assistant",
  content: "# Tesla's Q1 Miss...\n\n## Key Takeaways\n- ...",  // 完整最终文本
  agentId: "superagent",
  metadata: JSON.stringify({
    thinkingFlow: {
      modules: [
        {
          type: "search",
          status: "completed",
          data: { variant: "social", sources: [/* SignalSearchSource[] */] }
        },
        {
          type: "analysis",
          status: "completed",
          data: { stages: [/* AnalysisStage[] */] }
        },
        {
          type: "simulation",
          status: "completed",
          data: { panelists: [/* Panelist[] */] }
        },
        {
          type: "done",
          status: "completed"
        }
      ],
      isActive: false,
      route: "Super Agent Orchestrator"
    }
  })
}
```

---

## 7. 前端事件时序图

### 多 Agent 编排（Auto 模式）

```
agent:chat:started  { sessionId, mode: "auto", route: "..." }
    │
agent:chat:routing  { sessionId }
    │
agent:chat:routed   { sessionId }
    │
    ├─── agent:chat:module     search/active
    ├─── agent:chat:module     analysis/active
    └─── agent:chat:module     simulation/active
    │
    │  [并行执行]
    ├─── agent:chat:thinking_log  { line: "[Last30Days] Searching..." }  ← 搜索日志
    ├─── agent:chat:tool_trace    { step: StepEvent }                   ← 分析工具调用
    │
    ├─── agent:chat:module     search/completed    { sources: [...] }
    ├─── agent:chat:module     analysis/completed  { stages: [...] }
    └─── agent:chat:module     simulation/completed { panelists: [...] }
    │
    │  [合成阶段]
    ├─── agent:chat:progress   "*Orchestrator synthesizing...*"
    ├─── agent:chat:progress   "# Tesla's Q1 Miss..."    ← 流式 chunk
    ├─── agent:chat:progress   "## Key Takeaways\n-..."  ← 流式 chunk
    │    ... (持续输出)
    │
agent:chat:module   done/completed  { duration: 45 }
agent:chat:stream_done  { sessionId, content: "完整最终文本" }
```

### 圆桌会议（Roundtable 模式）

```
    ... (同上，到合成阶段结束后)
    │
    │  [共识阶段]
    ├─── agent:chat:content_replace  { content: "去掉 Questions 的合成文本" }
    ├─── agent:chat:module     consensus/active  { status: "building", round: 1 }
    ├─── agent:chat:module     consensus/active  { status: "discussing", round: 1 }
    ├─── agent:chat:progress   "*Sending to Expert Council...*"
    ├─── agent:chat:progress   "\n\n---\n\n## Expert Council Verdict\n\n..."
    ├─── agent:chat:module     consensus/completed  { conclusion: { verdict, confidence } }
    ├─── agent:chat:consensus_done  { result: ConsensusResult }
    │
agent:chat:module   done/completed  { duration: 65 }
agent:chat:stream_done  { sessionId, content: "完整最终文本（含 Verdict）" }
```
