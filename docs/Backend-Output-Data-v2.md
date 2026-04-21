# Loka Super Agent — 后端输出数据手册

> 本文档梳理后端各模块返回给前端的完整数据结构与示例。所有示例均以自然语言描述。

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
| **简单聊天** | 路由判定为闲聊且不是圆桌模式 | 直接 LLM → 流式输出 |
| **多 Agent 编排** | 需要搜索 / 分析 / 模拟中的任意一个 | 并行 Agent → 合成 |
| **圆桌会议** | 用户选择 roundtable 模式 | 多 Agent → 合成 → 共识投票 |

---

## 2. 路由决策（Routing）

后端收到用户消息后，先由 AI 判断该走哪条路径。返回一个「编排计划」，包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| isSimpleChat | 布尔 | 是否为简单聊天（打招呼、平台问答等） |
| capabilities.analysis.needed | 布尔 | 是否需要调用股票分析工具 |
| capabilities.analysis.tickers | 字符串数组 | 需要分析的股票代码列表，如 `["NVDA", "TSLA"]` |
| capabilities.search.needed | 布尔 | 是否需要深度搜索 |
| capabilities.search.query | 字符串 | 搜索关键词，如 `"Nvidia NVDA stock news today"` |
| capabilities.simulate.needed | 布尔 | 是否需要对冲基金模拟 |
| capabilities.simulate.tickers | 字符串数组 | 需要模拟的股票代码列表 |

### 路由示例

**用户问**：`"今天英伟达怎么走的"`
> 判定为：不是简单聊天；需要分析（标的 NVDA）；需要搜索（关键词：Nvidia NVDA stock news today）；不需要模拟。

**用户问**：`"大家对特斯拉怎么看"`
> 判定为：不是简单聊天；不需要分析（用户没有问价格/技术指标）；需要搜索（关键词：Tesla TSLA market sentiment opinion）；不需要模拟。

**用户问**：`"hi, what can you do?"`
> 判定为：简单聊天；分析、搜索、模拟均不需要。

---

## 3. Socket 事件清单

| 事件名 | 方向 | 说明 |
|--------|------|------|
| `agent:chat:started` | 后端→前端 | 开始处理 |
| `agent:chat:routing` | 后端→前端 | 路由中（前端显示 "Routing..."） |
| `agent:chat:routed` | 后端→前端 | 路由完成，携带编排计划 |
| `agent:chat:module` | 后端→前端 | 模块状态更新（search / analysis / simulation / consensus / done） |
| `agent:chat:progress` | 后端→前端 | 流式文本片段（合成阶段逐字输出） |
| `agent:chat:content_replace` | 后端→前端 | 整体替换当前消息内容（用于剥离 "Questions to watch"） |
| `agent:chat:thinking_log` | 后端→前端 | 搜索模块实时日志 |
| `agent:chat:tool_trace` | 后端→前端 | 分析模块工具调用追踪（每一步工具开始/完成） |
| `agent:chat:consensus_done` | 后端→前端 | 共识引擎投票完成（仅圆桌模式） |
| `agent:chat:stream_done` | 后端→前端 | 全部完成，携带最终完整内容 |
| `agent:chat:error` | 后端→前端 | 出错 |
| `agent:chat:stop` | 前端→后端 | 用户点击停止按钮 |

---

## 4. 模块数据详解

---

### 4.1 Search 模块（搜索）

负责从多个数据源（Reddit、X/Twitter、YouTube、Bloomberg 等）抓取与用户问题相关的市场资讯和情绪。

#### 模块生命周期

| 阶段 | 状态 | 说明 |
|------|------|------|
| 启动 | search / active | 开始搜索，附带数据源列表 |
| 完成 | search / completed | 搜索完成，附带搜索结果列表 |

#### Active 时携带的数据

告诉前端正在搜索中，以及数据源有哪些：

| 字段 | 说明 | 示例值 |
|------|------|--------|
| variant | 搜索类型 | `"social"` |
| sources | 已找到的来源（初始为空） | 空数组 |
| providers | 数据提供商列表 | Yahoo Finance、Bloomberg API、Alpha Vantage、Polygon.io、CoinGecko、TradingView |

#### Completed 时携带的数据

搜索完成后返回一组信号来源：

| 字段 | 说明 | 示例值 |
|------|------|--------|
| sources[].favicon | 来源图标类型 | `"reddit"` / `"x"` / `"youtube"` / `"web"` / `"weibo"` / `"hackernews"` |
| sources[].title | 来源标题 | `"Tesla Q1 Earnings Discussion"` |
| sources[].domain | 域名 | `"reddit.com"` |
| sources[].url | 原始链接 | `"https://www.reddit.com/r/investing/comments/abc123"` |

#### 示例场景

> 用户问"特斯拉最近怎么样"，搜索完成后返回 8 条来源：包括一条 Reddit 上的特斯拉 Q1 财报讨论帖，一条 X 上的 TSLA 技术分析帖，一条 YouTube 视频"Tesla Stock Deep Dive - Why I'm Bullish"，以及 Bloomberg、Yahoo Finance 等的新闻报道。每条都附带标题、域名和完整链接。

#### 实时日志（Thinking Log）

搜索过程中会实时推送日志文本，如：
> `"[Last30Days] Searching Reddit for 'Tesla TSLA sentiment'..."`  
> `"[Last30Days] Found 12 relevant discussions across 4 platforms"`

---

### 4.2 Analysis 模块（股票分析）

调用 Python 工具 `stock-analysis`，按四个阶段依次获取实时行情、K 线数据、技术指标、新闻资讯，最终输出完整分析报告。

#### 模块生命周期

| 阶段 | 状态 | 说明 |
|------|------|------|
| 启动 | analysis / active | 开始分析，附带阶段列表 |
| 完成 | analysis / completed | 分析完成，附带各阶段结果 |

#### 工具调用追踪（Tool Trace）

分析过程中会逐步推送工具调用事件（通过 `agent:chat:tool_trace`）：

| 事件类型 | 说明 | 示例 |
|---------|------|------|
| thinking | Agent 正在思考 | `"Analyzing market context..."` |
| tool_start | 开始调用某工具 | 工具名：`get_realtime_quote`，显示名：`"获取实时行情"` |
| tool_done | 工具调用完成 | 成功/失败、耗时 245ms |
| generating | 正在生成内容 | 可能包含 UI 元数据（见下） |
| done | 全部完成 | 附带完整分析报告文本 |
| error | 出错 | 附带错误信息 |

#### 典型的工具调用顺序

1. 思考 → 调用 `get_realtime_quote` 获取实时行情（耗时 ~200ms）
2. 调用 `get_daily_history` 获取日 K 线（耗时 ~300ms）
3. 调用 `analyze_trend` 获取 MA / MACD / RSI 技术指标（耗时 ~180ms）
4. 调用 `search_stock_news` 搜索新闻资讯（耗时 ~900ms）
5. 生成最终报告

#### UI 元数据（嵌在工具调用事件中）

在 `generating` 事件中，如果 message 字段为 `"[UI_METADATA]"`，则 content 字段包含结构化指标数据：

| 分类 | 字段 | 示例值 |
|------|------|--------|
| 基本面 fundamental | PE | `15.5` |
| | PB | `2.3` |
| | Turnover | `5.2%` |
| 技术面 technical | MA_Alignment | `"Bullish"`（均线多头排列）/ `"Bearish"` |
| | Trend | `"Uptrend"` / `"Downtrend"` / `"Sideways"` |
| | Signal | `"Buy"` / `"Sell"` / `"Hold"` |
| 情绪 social | provider | `"Web"` |
| | results | 搜索结果数组（标题+链接） |

#### 分析完成时的 stages 数据

完成后返回三个分析阶段，每个阶段包含若干指标结果：

**基本面分析阶段**：
| 指标 | 值 | 颜色 |
|------|------|------|
| PE | 15.5x | 蓝色 |
| PB | 2.30x | 靛蓝色 |
| Turnover | 5.20% | 琥珀色 |

**技术面分析阶段**：
| 指标 | 值 | 颜色 |
|------|------|------|
| Trend | Uptrend | 绿色 |
| MA | Bullish | 绿色 |
| Signal | Buy | 绿色 |

**情绪分析阶段**：（无具体指标，仅标记完成状态）

#### Quote Snapshot（嵌在报告文本中）

分析报告的最开头会包含一个标的信息小节。中文示例：

> **标的信息**  
> 证券代码：600519.SH · 股票名称：贵州茅台 · 所属市场：A 股（上海证券交易所）  
> 最新价：¥1,856.00 · 涨跌幅：+1.23% · 成交额：35.6 亿 · 数据时点：2024-04-09 15:00

英文示例：

> **Quote Snapshot**  
> Symbol: TSLA (Tesla, Inc.) · Market: US (NASDAQ)  
> Last Price: $343.25 · Change: +0.59% (+$2.00) · Volume: 78.49M · As of: Latest trading session

---

### 4.3 Simulation 模块（对冲基金模拟）

调用 Python 工具 `ai-hedge-fund`，模拟多位知名投资人对特定股票的投资决策。

#### 模块生命周期

| 阶段 | 状态 | 说明 |
|------|------|------|
| 启动 | simulation / active | 开始模拟，显示"模拟中..." |
| 完成 | simulation / completed | 模拟完成，附带各投资人裁定 |

#### 对冲基金结果包含的字段

**整体决策**（每只股票一个决策）：

| 字段 | 说明 | 示例值 |
|------|------|--------|
| action | 操作方向 | `"BUY"` / `"SELL"` / `"HOLD"` / `"SHORT"` |
| quantity | 建议数量 | `100` 股 |
| confidence | 置信度（0~1） | `0.85` |
| reasoning | 决策理由 | `"Strong technical momentum with bullish MA alignment..."` |

**各分析师信号**（每位分析师对每只股票给出信号）：

| 字段 | 说明 | 示例值 |
|------|------|--------|
| signal | 方向信号 | `"BULLISH"` / `"BEARISH"` / `"NEUTRAL"` |
| confidence | 置信度（0~100） | `90` |
| reasoning | 分析理由 | `"Long-term value play with strong fundamentals..."` |

#### 示例场景

> 用户问"帮我模拟下 AAPL 的投资"，系统召集四位投资人：  
> - **Warren Buffett** 给出 BULLISH 信号（90% 置信度）：认为长期价值投资标的，基本面强劲，自由现金流充裕，护城河稳固。  
> - **Charlie Munger** 给出 BULLISH 信号（85% 置信度）：优质企业，定价权强，生态粘性高。  
> - **Cathie Wood** 给出 NEUTRAL 信号（60% 置信度）：创新节奏放缓，短期缺乏颠覆性催化剂。  
> - **David Tepper** 给出 BULLISH 信号（75% 置信度）：宏观环境有利，回购计划支撑股价。  
> 
> 最终综合决策：BUY AAPL 100 股，综合置信度 85%。

#### 模块 Completed 时的 panelists 数据

每位投资人作为一个「panelist」：

| 字段 | 说明 | 示例值 |
|------|------|--------|
| name | 投资人名字 | `"warren_buffett"` |
| avatar | 头像占位 | `"L"` |
| status | 状态 | `"done"` |
| verdict | 裁定方向 | `"BULLISH"` |
| confidence | 置信度 | `90` |

---

### 4.4 Synthesis 阶段（合成）

将所有 Agent 的原始报告拼接后交给 LLM 重写为一篇统一的分析报告，以流式方式逐字输出。

#### 合成报告的固定结构

| 段落 | 说明 |
|------|------|
| **标题** | 一句话新闻式标题，精准捕捉核心洞察 |
| **Key Takeaways** | 4-6 个要点，每个要点独立成立 |
| **主题分析段落 1** | 使用话题相关的标题（如"流动性危机：没人在谈的挤兑风险"），叙事式分析，引用数据并给出 "My take:" 直接判断 |
| **主题分析段落 2** | 继续分析，质疑假设，指出矛盾。如有多位分析师观点则用表格对比 |
| **风险段落** | 使用话题相关的标题（如"三颗随时可能引爆的雷"），列出具体风险 |
| **Bottom line** | 一段话结论，给出 Buy / Hold / Sell / Watch 建议及入场/出场信号 |
| **标签行** | 重要性等级（High/Medium/Low）+ 2-3 个分类标签 |
| **Questions to watch** | 3-4 个前瞻性问题 |

#### 示例场景

> 用户问"分析一下 TSLA"，合成报告如下：  
> 
> 标题："Tesla's Q1 Delivery Miss — A Speed Bump or the Start of a Slide?"  
> 
> 要点：特斯拉 Q1 交付 358K 台（低于预期 370K）；技术面强烈看空，MA5 < MA10 < MA20；Reddit 情绪偏多但 X 上偏空；RSI 39 处于超卖区间有反弹可能。  
>
> 分析段落讨论了交付数据、中国竞争（比亚迪份额增长）、宏观环境（美联储转向预期）。  
> 
> 如有模拟结果，则用表格展示各投资人的观点、证据、市场反应和判断。  
> 
> 风险包括：持续降价压缩利润率、FSD 监管不确定性、Elon 个人品牌风险。  
> 
> Bottom line：逢低买入但设好止损，关键支撑位 $330，突破 MA20 ($356) 再加仓。

---

### 4.5 Consensus 模块（Roundtable 专属）

仅在圆桌模式下触发。合成报告完成后，由 4 个预设专家角色进行共识投票。

#### 4 个专家角色

| 编号 | 名称 | 职责 |
|------|------|------|
| agent_0 | Fundamental Analyst | 基本面分析师 — 关注财务指标、估值、盈利能力 |
| agent_1 | Macro Strategist | 宏观策略师 — 关注利率、政策、地缘政治、行业周期 |
| agent_2 | Sentiment Engine | 情绪分析引擎 — 关注社交媒体、新闻情绪、RSI 等超买超卖 |
| agent_3 | Quant Tracker | 量化追踪器 — 关注技术指标、均线、MACD、量价关系 |

#### 模块生命周期

| 阶段 | 状态 | 说明 |
|------|------|------|
| 构建中 | consensus / active | 正在构建共识（最多 3 轮投票）|
| 讨论中 | consensus / active | 专家正在讨论 |
| 完成 | consensus / completed | 投票结束，附带裁定结果 |

#### Active 时携带的数据

| 字段 | 说明 | 示例值 |
|------|------|--------|
| status | 当前子状态 | `"building"` 或 `"discussing"` |
| round | 当前投票轮次 | `1` |
| maxRounds | 最大轮次 | `3` |

#### Completed 时携带的数据

| 字段 | 说明 | 示例值 |
|------|------|--------|
| status | 结论状态 | `"concluded"` |
| round | 实际使用轮次 | `2` |
| maxRounds | 最大轮次 | `3` |
| conclusion.verdict | 裁定结论 | `"Buy on dips above MA20 with strict stop-loss"` |
| conclusion.confidence | 共识置信度（0~1） | `0.78` |

#### 共识完成时的完整结果

包含最终裁定和每位专家的独立观点：

| 字段 | 说明 |
|------|------|
| finalAnswer | 最终裁定文本（一段完整的分析总结） |
| confidence | 整体置信度 |
| consensusReached | 是否达成共识（布尔值） |
| roundsUsed | 实际使用的投票轮次 |
| agentResponses | 4 位专家各自的回答数组 |

每位专家的回答包含：

| 字段 | 说明 | 示例值 |
|------|------|--------|
| agentId | 专家 ID | `"agent_0"` |
| answer | 分析意见 | 一段完整的文字分析 |
| confidence | 个人置信度（0~1） | `0.72` |

#### 示例场景

> 合成报告发送给专家委员会后，经过 2 轮投票达成共识（置信度 78%）：  
> 
> - **基本面分析师**（72% 置信度）：特斯拉 PE 45 倍偏高但 25% 营收增速可支撑，Q1 交付不达预期但大概率是单季度扰动，关键风险是降价带来的利润率压缩。  
> - **宏观策略师**（80% 置信度）：宏观环境有利，Q3 降息预期利好 EV 板块。但需关注中国市场竞争加剧，比亚迪市占率持续上升。  
> - **情绪引擎**（68% 置信度）：社交媒体情绪分裂，Reddit 偏多、X 偏空。新闻负面但已计入价格，RSI 39 表明短期超卖反弹概率大。  
> - **量化追踪器**（85% 置信度）：趋势看空（MA5 < MA10 < MA20），RSI 超卖，MACD 负向发散，量能中性。短期偏空但均值回归信号正在形成，$330 若守住则存在反弹机会。  
> 
> 最终裁定：逢低建仓，价格需站稳 MA20 上方，严格设置止损。

#### 输出到消息中的文本

专家意见**一致时**：只显示总结裁定，用 `## Expert Council Verdict` 标题。

专家意见**分歧时**：在总结裁定后附加每位专家的独立观点，格式为「专家名（置信度%）：分析文本」。

---

## 5. 简单聊天路径

当用户只是打招呼或问平台功能时触发。不调用任何 Agent，直接 LLM 生成回复。

#### 事件流程

1. 开始 → 2. 标记搜索模块已完成（快速跳过）→ 3. 流式输出回复文本 → 4. 标记完成

#### 示例

> 用户说"你好！你能做什么？"，直接返回一段介绍文本，如"你好！我是 Loka Super Agent，可以帮你分析股票、搜索市场资讯、模拟投资策略等。你想了解什么？"

---

## 6. 数据库存储结构

每条 AI 回复存为一条 `chatMessage` 记录：

| 字段 | 说明 | 示例值 |
|------|------|--------|
| userId | 用户 ID | `"user_123"` |
| sessionId | 会话 ID | UUID 字符串 |
| role | 角色 | `"assistant"` |
| content | 完整最终文本 | 含 Markdown 格式的完整分析报告 |
| agentId | Agent 标识 | `"superagent"` |
| metadata | 元数据（JSON 字符串） | 包含 thinkingFlow 对象 |

#### metadata 中的 thinkingFlow 结构

| 字段 | 说明 |
|------|------|
| modules | 数组 — 记录本次回复经过了哪些模块及其最终数据 |
| isActive | 是否仍在运行（存入 DB 时已为 false） |
| route | 路由标签，如 `"Super Agent Orchestrator"` |

modules 数组中的每个元素：

| 字段 | 说明 | 示例值 |
|------|------|--------|
| type | 模块类型 | `"search"` / `"analysis"` / `"simulation"` / `"done"` |
| status | 最终状态 | `"completed"` |
| data | 该模块的完成数据 | 对应各模块 completed 时的数据结构 |

---

## 7. 前端事件时序图

### 多 Agent 编排（Auto 模式）

```
① agent:chat:started       收到用户消息，开始处理
② agent:chat:routing        AI 正在判断该走哪条路径
③ agent:chat:routed         路由完成
④ agent:chat:module         search/active + analysis/active + simulation/active — 三个模块同时启动
   │
   │  并行执行阶段
   ├── agent:chat:thinking_log    搜索模块实时推送日志（多条）
   ├── agent:chat:tool_trace      分析模块逐步推送工具调用事件（多条）
   │
   ├── agent:chat:module          search/completed     搜索完成，带 sources
   ├── agent:chat:module          analysis/completed   分析完成，带 stages
   └── agent:chat:module          simulation/completed 模拟完成，带 panelists
   │
   │  合成阶段
   ├── agent:chat:progress        流式输出合成文本（大量 chunk）
   │
⑤ agent:chat:module         done/completed — 标记全部完成，附带总耗时
⑥ agent:chat:stream_done    流结束，附带完整最终文本
```

### 圆桌会议（Roundtable 模式）

```
   ... 同上，合成阶段结束后 ...
   │
   │  共识阶段（Roundtable 特有）
   ├── agent:chat:content_replace   替换消息内容（去掉 Questions to watch）
   ├── agent:chat:module            consensus/active（building → discussing）
   ├── agent:chat:progress          流式输出 "正在发送给专家委员会..."
   ├── agent:chat:progress          流式输出 Expert Council Verdict 文本
   ├── agent:chat:module            consensus/completed（附带裁定结论和置信度）
   ├── agent:chat:consensus_done    共识完成，附带完整投票结果
   │
⑤ agent:chat:module         done/completed
⑥ agent:chat:stream_done    流结束，附带完整最终文本（含 Verdict）
```
