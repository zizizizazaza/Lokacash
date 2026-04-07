# LOKA — 产品需求文档 PRD v6.0

> **最后更新：** 2026-03-31

---

## 目录

1. [产品战略](#1-产品战略)
2. [技术架构](#2-技术架构)
3. [Super Agent](#3-super-agent)
4. [社交网络 (Chats)](#4-社交网络)
5. [Discover 与公司入驻](#5-discover-与公司入驻)
6. [信用分系统](#6-信用分系统)
7. [治理系统](#7-治理系统)
8. [附录](#8-附录)

---

## 1. 产品战略

### 1.1 产品定位

Loka 是一个 **AI Agent 协作平台**，让用户和 AI Agent 像同事一样协作完成各种知识工作。

平台有两个核心：
- **Super Agent**：一套 Multi-Agent 系统，用户用自然语言下达任务，多个专业 Agent 并行工作交付结果。能力覆盖投资分析、市场调研、竞品研究、任务管理等场景。
- **Chats（人机协作社交）**：参考 Teamily 模式，AI Agent 作为群组一等成员参与讨论和任务执行。不是 Bot 附属品，而是有名字、有记忆、有性格的协作伙伴。

**一句话说清楚：** Loka 是一个你和 AI Agent 一起工作的地方——做投资分析、调研竞品、推进团队任务，全在一个平台里完成。

### 1.2 解决什么问题

| 痛点 | 现状 | Loka 的解法 |
|---|---|---|
| **AI 工具用完即走** | ChatGPT 可以回答问题，但没有持续协作能力。问完一次下次还得从头讲背景 | Super Agent 有记忆，了解你的上下文，可以持续跟进任务 |
| **工具碎片化** | 研究用 Perplexity，讨论用 Telegram，任务管理用 Notion，AI 用 ChatGPT，每个工具之间没有联动 | 分析、讨论、任务在同一个平台，Agent 贯穿始终 |
| **群聊缺乏智能** | Telegram / 微信群全靠人发言，信噪比低，讨论效率低 | 群里有 AI Agent 实时参与，@一下就能出分析、做总结、推进任务 |
| **投资分析门槛高** | 普通人看不懂财报，不会做行业分析 | Super Agent 用自然语言降维，一句话就能出结构化报告 |

### 1.3 产品特色

**特色一：Super Agent 不只做投资**

投资分析是 Super Agent 的核心能力之一，但它同样能做竞品调研、行业分析、项目尽调、任务拆解与跟踪。用户对它说"帮我调研一下东南亚的外卖市场"或者"帮我比较一下 Figma 和 Sketch 的优劣势"，它都能调度多个专业 Agent 并行工作，交付一份结构化的研究报告。

**特色二：AI Agent 是群成员，不是 Bot**

参考 Teamily 的人机协作模式。在 Loka 的群聊中，AI Agent 有独立的名字、性格、记忆。你在 A 群里让 Agent 分析过的内容，到 B 群里它还记得。这跟 Telegram Bot 的"无状态应答"完全不同。Agent 是你的同事，不是你的工具。

**特色三：从分析到协作的闭环**

Super Agent 生成的分析报告可以一键分享到群聊，群里的同事和 Agent 可以接着讨论、追问、推进下一步。分析不是孤立的个人行为，而是协作的起点。

### 1.4 竞争分析

| 竞品类型 | 代表 | 目标用户 | 它们的强项 | Loka 的差异 |
|---|---|---|---|---|
| **通用 AI** | ChatGPT, Perplexity | 所有人 | 通用问答能力强 | 它们是"瑞士军刀"什么都不深。Loka 在分析和协作上做到更深的闭环，且 Agent 有跨会话记忆 |
| **AI 投研工具** | Surf AI, Genspark | 专业投资者、机构 | 垂类分析深度高 | 它们面向专业用户，纯工具无社交。Loka 门槛更低（自然语言即可），且分析是起点不是终点——后面还有群聊协作 |
| **投资社交** | Stocktwits, 雪球 | 散户 | UGC 社区活跃 | 内容全靠人工，信噪比低。Loka 通过 AI Agent 参与群聊注入专业分析能力，提升社区内容质量 |
| **人机协作 IM** | Teamily | 企业团队 | AI 作为群成员概念领先 | 通用协作工具，无垂类深度。Loka 以投资/研究分析切入，在垂直场景做更深 |
| **团队协作** | Slack, Notion | 企业团队 | 工作流成熟 | AI 只是插件级辅助，去掉 AI 产品依然成立。Loka 的 AI 是骨架——没有 Agent，产品就不成立 |


**Loka 的竞争定位：** 不跟通用 AI 拼"什么都能答"，不跟 Surf AI 拼"机构级研报"，不跟 Stocktwits 拼"社区规模"。Loka 做的是一个交叉地带——把 AI 深度分析能力和人机协作社交粘合在一起，面向"需要分析也需要讨论"的用户群体。投资场景是切入点，但平台能力不止于此。

### 1.5 市场策略 (Go-to-Market)

#### 阶段一：冷启动——解决"初期没有用户"的问题

**核心思路：** 初期不依赖用户生成内容，而是用 AI 自动生产高质量内容抢占搜索和社交流量。平台有没有用户，Super Agent 都能工作。

**1) AI 内容工厂（零用户即可启动）**
- 用 Super Agent 批量生成当下热点的投资分析报告（如"英伟达 Q4 财报解读""Polymarket 2026 大选预测市场分析"）。
- 将这些报告发布到 Twitter、LinkedIn、Medium、dev.to 等平台，署名 Loka，文末附平台链接。
- 报告质量必须高于市面上的通用 AI 输出（有图表、有数据引用、有结论），通过内容专业度建立品牌认知。
- **目标指标：** 每周产出 5-10 篇高质量分析报告，覆盖当周投资热点。

**2) 社交媒体矩阵运营**
- 建立 Loka 官方 Twitter 账号，日常发布 Super Agent 的分析片段（适合传播的截图/金句）。
- 在投资类话题（FinTwit、#investing、#stockmarket）下用专业观点互动，不做硬广，而是用分析质量吸引关注。
- 重点关注和互动 KOL（投资博主、分析师、科技评论人），争取被引用或转发。

**3) 种子用户直接触达**
- 在 Reddit（r/investing、r/stocks）、Discord 投资社区、ProductHunt 等平台发布产品，收集第一批种子用户。
- 提供内测邀请码机制，制造稀缺感。前 500 名注册用户永久解锁 Pro 功能。
- 直接私信 Twitter 上活跃的投资爱好者，邀请试用并给反馈。

**4) Founder 侧冷启动**
- 用 TrustMR API 预填充 Discover 页面，确保上线第一天就有内容可看，不出现空货架。
- 主动邀请 10-20 个种子 Founder 入驻，提供 "Listed on Loka" 认证徽章 + 免费 AI 分析报告作为激励。

#### 阶段二：增长期——内容飞轮 + 社交裂变

**1) 报告分享机制（产品驱动增长）**
- Super Agent 生成的 PDF 报告自带 Loka 品牌水印和平台链接。
- 用户分享报告到社交媒体 → 读者被报告质量吸引 → 点击链接注册使用 → 新用户生成自己的报告 → 继续分享。形成"内容即获客"的自然循环。

**2) 社交拉新**
- Chats 的群聊天然是拉新工具：用户想加朋友一起讨论，就得邀请对方注册。
- 信用分系统激励：邀请有效新用户 +30 分，500 分解锁高级功能，正向循环。

**3) SEO + 长内容沉淀**
- 将 AI 生成的高质量分析报告做成可被搜索引擎索引的公开页面。
- 用户搜索"XX 公司分析"或"XX 预测市场"时，Loka 的报告出现在搜索结果中，自然引流。

#### 阶段三：扩展期——从投资到通用协作

- 投资分析用户积累到一定量级后，逐步推出竞品调研、行业研究、团队任务协作等场景。
- 引入团队版（Team Plan），支持企业内多人 + Agent 协作工作空间。
- 建立 Agent 市场（Agent Marketplace），允许用户创建和分享自定义 Agent。

---

## 2. 技术架构

### 2.1 技术栈

| 层级 | 技术选型 | 说明 |
|---|---|---|
| **前端** | React 19 + TypeScript + Vite | SPA，Enum 路由（无 React Router），Capacitor 8 打包 iOS/Android |
| **样式** | Tailwind CSS + 自定义 CSS | Glass morphism 风格，渐变主题 |
| **图表** | Recharts + Chart.js + D3.js | D3 用于 Agent 协作知识图谱的力导向图 |
| **3D** | Three.js + React Three Fiber | Landing 页沉浸式场景 |
| **后端** | Express 5 + TypeScript | 19 个路由模块，JWT 认证，3 级限流 |
| **ORM** | Prisma 6 + SQLite（开发）→ PostgreSQL（生产） | 类型安全，零配置迁移 |
| **校验** | Zod | Schema 即文档，端到端类型共享 |
| **实时** | Socket.IO | 房间机制 `user:{id}` / `group:{id}`，支持群消息、通知、Agent 状态推送 |
| **AI** | lingyaai.cn（OpenAI 兼容）+ deepseek-v3 | SSE 流式输出，2048 max tokens，温度 0.5 |
| **外部数据** | TrustMR API | 初创项目数据同步 |
| **认证** | JWT（7 天有效期）+ Privy SDK | 邮箱 + Google/X OAuth |
| **移动端** | Capacitor 8 | iOS / Android 原生壳 |

### 2.2 系统拓扑

```
┌─────────────────────────────────┐
│   React 19 SPA (Vite + TS)     │
│   Web + iOS/Android (Capacitor) │
└──────────────┬──────────────────┘
               │ HTTP /api/* + WebSocket /ws
┌──────────────▼──────────────────┐
│   Express 5 + TypeScript        │
│   19 Route Modules · JWT Auth   │
│   3-Tier Rate Limiting · Zod    │
└──────┬───────┬──────────┬───────┘
       │       │          │
   [SQLite]  [Socket.IO] [lingyaai.cn]
   Prisma 6  Real-time   deepseek-v3
```

### 2.3 页面结构

| 页面 | 子页面 | 说明 |
|---|---|---|
| **Super Agent** | — | 默认首页。自然语言输入，调动多 Agent 完成分析和任务 |
| **Discover** | Agent | 浏览和发现平台上的 AI Agent |
| | People | 浏览平台用户，发现值得关注的人 |
| | Group | 浏览公开群组，加入感兴趣的讨论 |
| **Community** | — | 人机协作社交。群聊、私信，Agent 作为群成员参与 |
| **Market** | — | 公司列表。展示入驻公司与 TrustMR 同步项目，支持联系 Founder |
| **Portfolio** | — | 个人中心。收藏、分析历史、任务记录 |

### 2.4 核心 API 概览

| 模块 | 路由前缀 | 端点数 | 核心职责 |
|---|---|---|---|
| Auth | `/api/auth` | 5 | 邮箱/OAuth 登录、Token 刷新、风险确认 |
| Users | `/api/users` | 3 | Profile CRUD、信用等级查询 |
| Chat | `/api/chat` | 5 | AI 对话（SSE 流式）、历史会话、附件上传 |
| Groups | `/api/groups` | 6 | 群消息 CRUD（Cursor 分页）、投票系统 |
| Community | `/api/community` | 5 | 好友关系、私信 |
| Projects | `/api/projects` | 5 | 项目列表/详情、投资/撤资 |
| Portfolio | `/api/portfolio` | 6 | 持仓、收益计算、AIUSD Mint/Redeem |
| Trade | `/api/trade` | 4 | OTC 二级市场挂单/买入/取消 |
| Governance | `/api/governance` | 4 | 提案创建/投票/结果（加权投票） |
| Credit | `/api/credit` | 3 | 信用分/等级/事件日志 |
| Apply | `/api/apply` | 5 | 企业认证（4 步 KYC）、项目申请 |
| Notifications | `/api/notifications` | 3 | 通知列表/已读/删除 |

### 2.5 实时通信

Socket.IO 事件：

| 事件 | 方向 | 说明 |
|---|---|---|
| `group:message` | Server → Client | 群聊新消息推送 |
| `group:delete` | Server → Client | 消息删除广播 |
| `join-group` / `leave-group` | Client → Server | 加入/离开群聊房间 |
| `chat:message` | Server → Client | AI 聊天消息 |
| `agent:status` | Server → Client | Agent 工作进度实时更新 |
| `notification` | Server → Client | 投资确认、治理提醒、逾期通知等 |

---

## 3. Super Agent

### 3.1 机制

Super Agent 会根据意图调动多个专业 Agent 并行工作，交付结构化结果。即：

```
用户输入任务 -> SuperAgent 判断需要调用的能力 -> 调用相应 Agent 能力 -> 组合答案，输出结果
```

### 3.2 Agent 路由

| 类型 | 任务 | 调用类型 | 输出 |
|---|---|---|---|
| **通用类** | 简单通用对话，例如"hi" | 单 Agent 的通用能力 | 通用回复 |
| **搜索类** | 搜索市场情绪，例如"了解市场对某个股票的看法" | Signal Radar | |
| | 搜索资产概况信息，例如"某只股票今天情况" | Daily Agent | |
| **分析类** | 深度分析某个资产背景信息、项目情况 | 投资分析 Agent | |
| | 某个资产投资建议 | 投资分析 Agent | |
| **模拟预测类** | 模拟巴菲特投资、给出投资建议 | AI Hedge Fund | |
| | 模拟预测市场 | | |
| **交易类（待定）** | 交易股票、crypto、polymarket 资产 | | |

### 3.3 协作模式

- **Auto:** 自动路由，选择适合的模式
- **Fast:** 常规路由调用对应 Agent 能力
- **Roundtable:** 在调用 Agent 能力后，还要进行多 Agent 共识

### 3.4 资产类别

- 股票类
- Crypto 资产
- Polymarket

### 3.5 输出

#### a. 思考流

思考流为一个通用的模版，根据调用的 Agent 类型展示对应的模块，未调用就不显示。

**思考流 = 【搜索】+【分析】+【模拟】+【共识】+【完成】**

| 类型 | 调用 Agent | 思考流 |
|---|---|---|
| **通用类** | | 不显示 |
| **搜索类** | Signal Radar | 【搜索】模块：显示搜索社媒平台 |
| | Daily Agent | 【搜索】模块：显示数据获取，从各个平台或服务商获取数据 |
| **分析类** | 投资分析 Agent | 【分析】模块显示：<br>1. 基本面分析<br>2. 技术分析<br>3. 舆情分析<br>4. 决策 |
| **模拟预测类** | AI Hedge Fund | 【模拟】模块：<br>构建模拟小组 → 各个模拟的 Agent 运行 → 输出预测结果 |
| **多 Agent 共识模式** | | 【共识】模块：<br>1. 构建共识小组<br>2. 进行讨论、直到达成共识<br>3. 共识结论 |

#### b. 输出结果

| 类型 | 输出结果 |
|---|---|
| **通用类** | 常规文本，可复制 |
| **其他类** | 报告文本（Markdown 格式），可下载为 PDF，可查看目录 |

---

## 4. 社交网络 (Community)

### 4.1 定位

Community 是 Loka 的**第二卖点**。核心差异是 **AI Agent 作为群组一等成员**，参考 Teamily 的"人机共存"模式。

**用户为什么用 Loka Community 而不用 Telegram / 微信 / Slack：**

| 能力 | Loka Community | 传统 IM（即使接了 Bot） |
|---|---|---|
| AI Agent 作为群成员 | ✅ 有名字有角色，可被 @，主动参与讨论 | ❌ Bot 是附属工具，被动应答 |
| 群内执行任务 | ✅ @Agent 直接出分析报告、做调研、整理纪要 | ❌ 不支持 |
| 自动执行 | ✅ Agent 自动完成任务并输出结果，自动 @ 相关人员通知 | ❌ Bot 需要人手动触发 |
| 原生富交互 | ✅ 分析报告、数据卡片、图表直接在对话流中渲染 | ❌ 纯文本或简单 Markdown |
| 跨群记忆 | ✅ Agent 记得之前在别的群讨论过什么 | ❌ 无状态 |
| 分析报告联动 | ✅ Super Agent 报告一键转入群讨论 | ❌ 手动截图转发 |

### 4.2 群类型

| 类型 | 创建方式 | 场景 | 默认 Agent |
|---|---|---|---|
| **项目群** | 投资触发自动创建 | 围绕一个项目的投资者 + Founder + Agent 讨论 | Loka Analyst |
| **主题群** | 用户手动创建 | 特定话题（如 "Q2 投资策略""东南亚市场"） | 可选添加 |
| **自由群** | 用户手动创建 | 朋友间社交闲聊 | 无默认 |
| **私信** | 点击用户头像发起 | 1:1 对话（人↔人 或 人↔Agent） | — |

### 4.3 群成员角色

| 角色 | 标识 | 权限 |
|---|---|---|
| **Issuer**（发行方） | 金色徽标 | 项目群创建者，管理群设置，置顶消息，删除任意消息 |
| **Investor**（投资者） | 蓝色徽标 | 发消息、@Agent、投票、查看成员 |
| **Agent** | 紫色徽标 | AI 身份，被 @触发执行任务，可主动发言 |
| **Member**（普通成员） | 无徽标 | 发消息、投票 |

### 4.4 消息系统

#### 4.4.1 消息类型

| 消息类型 | 说明 |
|---|---|
| **文本消息** | 普通文字，支持 Markdown 渲染 |
| **附件消息** | 图片/文件上传 |
| **投票卡片** | 多选项投票，设定截止时间，实时统计 |
| **Agent 报告** | 群内 Agent 输出的结构化分析结果，富文本卡片 |
| **里程碑验证** | 项目里程碑文档验证消息 |
| **系统消息** | 成员加入/退出、Agent 添加/移除等系统通知 |

#### 4.4.2 消息功能

| 功能 | 说明 | 当前状态 |
|---|---|---|
| 实时推送 | Socket.IO `group:message` 事件广播 | ✅ 已实现 |
| 消息持久化 | GroupMessage 表存储 | ✅ 已实现 |
| Cursor 分页 | 游标分页加载历史消息（支持 cursor + limit） | ✅ 后端已实现 |
| 消息删除 | 发送者/管理员可删除，广播删除事件 | ✅ 已实现 |
| 投票系统 | 创建投票 + 多选项 + 实时计票 | ✅ 已实现 |
| 附件上传 | 图片/文件 | ⚠️ 后端有，前端待对接 |
| @Agent 触发 | @某 Agent 后触发分析任务 | ❌ 待开发 |
| 消息搜索 | 群内搜索历史消息 | ❌ 待开发 |
| 未读计数 | lastReadAt 时间戳对比 | ⚠️ 后端有，前端待优化 |

### 4.5 投票系统（Poll）

群内投票用于社区决策和项目治理讨论：

| 字段 | 说明 |
|---|---|
| 创建者 | 任何群成员均可发起投票 |
| 问题 | 投票主题（文本） |
| 选项 | 2+ 个选项，有序排列 |
| 时长 | 投票持续时间（带截止时间） |
| 投票 | 一人一票，不可修改 |
| 统计 | 实时显示各选项得票数和百分比 |

### 4.6 好友与私信系统

| 功能 | 端点 | 说明 |
|---|---|---|
| 发送好友请求 | `POST /api/community/friends/request` | 需要对方接受 |
| 接受好友请求 | `POST /api/community/friends/:id/accept` | 状态 pending → accepted |
| 好友列表 | `GET /api/community/friends` | 含状态 (pending/accepted/blocked) |
| 发送私信 | `POST /api/community/dm/:userId` | 自动创建 Conversation |
| 私信历史 | `GET /api/community/dm/:userId` | 获取会话消息列表 |

### 4.7 群内 Agent 能力

#### 4.7.1 Agent 目录

群主可从 Agent 目录（18+ 可用 Agent）中按类别浏览并添加到群组：

| 类别 | 包含 Agent | 群内用法示例 |
|---|---|---|
| **数据分析** | Market Analyst, Revenue Optimizer | "帮我看一下这个公司的收入趋势" |
| **项目分析** | Fundamental Analyst, Milestone Tracker | "这个项目的创始团队背景怎么样" |
| **产品分析** | Arbitrage Scanner | "帮我对比一下这两个竞品" |
| **风险评估** | Risk Assessor, Portfolio Risk Monitor, Fraud Detector | "这个投资有什么潜在风险" |
| **新闻搜集** | Sentiment Analyzer, Regulatory Monitor | "最近有什么相关的新闻" |
| **治理** | Governance Assistant | "总结一下最近的提案" |

#### 4.7.2 Loka Analyst（群组分析师 — 规划中）

Loka Analyst 是为投资社群设计的专属 Agent，集成两种工作模式：

| 模式 | 触发方式 | 功能 |
|---|---|---|
| **被动摘要模式** | 定时触发（每日/每周） | 自动汇总群内讨论精华、提取关键观点、生成情绪快照 |
| **主动分析模式** | `@Analyst` + 自然语言指令 | 实时执行研究任务：项目分析、数据验证、趋势查询 |

> 详细设计参见 `docs/Loka-Analyst-Agent.md`

### 4.8 功能需求明细

| 需求 ID | 功能 | 优先级 | 当前状态 | 说明 |
|---|---|---|---|---|
| CM-01 | 群组列表 | P0 | ✅ 已实现 | 按用户过滤 + 最后消息预览 |
| CM-02 | 实时消息 | P0 | ✅ 后端已实现 | WebSocket 广播，前端待对接真实 API |
| CM-03 | 消息持久化 | P0 | ✅ 已实现 | CRUD + 分页 + WS 广播 |
| CM-04 | 消息删除 | P1 | ✅ 已实现 | DELETE API + 权限控制 + 广播 |
| CM-05 | 群组成员管理 | P1 | ✅ 已实现 | 加入/退出/列表 API + 事件广播 |
| CM-06 | 投票系统 | P1 | ✅ 已实现 | 创建/投票/实时统计 |
| CM-07 | 投资自动建群 | P1 | ✅ 已实现 | `createGroupForProject()` 工具函数 |
| CM-08 | 好友系统 | P1 | ✅ 已实现 | 请求/接受/列表 |
| CM-09 | 私信 | P1 | ✅ 已实现 | Conversation + DirectMessage |
| CM-10 | 前端对接后端消息 API | P0 | ❌ 待开发 | 替代前端假数据 |
| CM-11 | 治理投票前端完善 | P1 | ❌ 待开发 | 投票结果展示 |
| CM-12 | @Agent 触发任务 | P1 | ❌ 待开发 | 群内 @ Agent 执行分析 |
| CM-13 | Loka Analyst 集成 | P2 | ❌ 待开发 | 被动摘要 + 主动分析 |
| CM-14 | 消息搜索 | P2 | ❌ 待开发 | 群内全文搜索 |
| CM-15 | 附件上传前端对接 | P2 | ❌ 待开发 | 图片/文件上传 UI |

---

## 5. Discover 与公司入驻

### 5.1 Discover（项目展示）

Discover 展示初创项目供用户浏览和研究。

**数据来源：**
1. **TrustMR API 同步**：以 Loka 品牌展示，不暴露数据源
2. **Founder 主动入驻**：可获得 "Listed on Loka" 徽章

**项目卡片信息：**

| 字段 | 来源 | 说明 |
|---|---|---|
| 公司名称 + Logo | TrustMR / Founder 填写 | 必填 |
| 行业 / 阶段 | TrustMR / Founder 填写 | SaaS / FinTech / … + Seed / Series A / … |
| 简介 | TrustMR / Founder 填写 | 一句话描述 |
| 月度收入 | TrustMR API | MonthlyRevenue 表 |
| 信用评级 | 平台计算 | 基于信用分系统 |
| 操作按钮 | — | "AI 分析"（调起 Super Agent）/ "联系 Founder" |

**项目详情页：**

| 区块 | 内容 |
|---|---|
| **概览** | 公司基本信息、阶段、官网链接 |
| **财务数据** | 月度收入图表（Recharts）、关键指标 |
| **AI 分析** | 一键调起 Super Agent 对该项目做分析 |
| **讨论** | 跳转到该项目的自动建群（Community） |

**列表功能：**

| 功能 | 说明 | 当前状态 |
|---|---|---|
| 分页浏览 | 支持 offset/limit 分页 | ✅ 已实现 |
| 筛选 | 按行业、阶段、评级筛选 | ✅ 已实现 |
| 排序 | 按收入、评级、最新上架排序 | ✅ 已实现 |
| 搜索 | 公司名称模糊搜索 | ✅ 已实现 |
| 实时数据 | WebSocket 推送投资进度变化 | ⚠️ 后端有，前端部分对接 |

> Discover 是平台的功能模块之一。平台核心价值在于 Super Agent 的通用分析能力和 Community 的协作体验。

### 5.2 公司入驻

Founder 将公司上架到 Loka，获得曝光和 AI 分析服务。

#### 5.2.1 企业认证流程（KYC）

分 4 步完成，每步 +25 信用分，总计 +100 达到 200 分（达标后可发起募资）：

| 步骤 | 内容 | 信用分 |
|---|---|---|
| Step 1 | 工商登记信息（公司名称、国家、注册号） | +25 |
| Step 2 | 营业执照/资质文件上传 | +25 |
| Step 3 | 股权结构披露 | +25 |
| Step 4 | UBO/创始人身份认证 | +25 |

**后端数据模型：** `EnterpriseVerification`（step 字段追踪进度，status: pending → approved）

#### 5.2.2 项目申请

通过企业认证后，Founder 可提交项目上架申请：

| 字段 | 必填 | 说明 |
|---|---|---|
| 项目名称 | ✅ | |
| 行业分类 | ✅ | 下拉选择 |
| 月度收入 | ✅ | 用于信用评估 |
| 募资金额 | ✅ | 目标金额 |
| 建议 APY | ✅ | 预期年化收益 |
| 融资期限（天） | ✅ | 募资持续天数 |
| Pitch Deck | 选填 | PDF 上传 |
| 团队介绍 | 选填 | 文本 |

**审核流程：** AI 预审（数据合规性检查）→ 人工复核（1-3 工作日）→ 上架展示

#### 5.2.3 Founder 联系路径

| 路径 | 说明 |
|---|---|
| 平台内私信 | 自动创建 Community 对话 |
| 外部联系方式 | Founder 可选择公开 Twitter/LinkedIn，可限制仅高信用分用户可见 |

### 5.3 功能需求明细

| 需求 ID | 功能 | 优先级 | 当前状态 | 说明 |
|---|---|---|---|---|
| DI-01 | 项目列表（分页/筛选/排序） | P0 | ✅ 已实现 | GET /api/projects |
| DI-02 | 项目详情 + 月度收入 | P0 | ✅ 已实现 | GET /api/projects/:id |
| DI-03 | 投资/撤资 | P0 | ✅ 已实现 | POST invest/revoke，原子事务 |
| DI-04 | 企业认证 API | P0 | ✅ 已实现 | 4 步 KYC + 信用分奖励 |
| DI-05 | 项目申请 API | P0 | ✅ 已实现 | 创建/列表 |
| DI-06 | 企业认证前端 UI | P1 | ❌ 待开发 | 4 步向导表单 |
| DI-07 | 项目申请前端 UI | P1 | ❌ 待开发 | 提交表单 + 状态追踪 |
| DI-08 | Stripe 收入验证对接 | P1 | ❌ 待开发 | Stripe Connect 验证月度收入 |
| DI-09 | KYC 服务对接 | P1 | ❌ 待开发 | Sumsub / Onfido 身份核验 |
| DI-10 | Founder 联系功能 | P2 | ⚠️ 私信已有 | 项目页 → 私信 Founder |

---

## 6. 信用分系统

信用分是 Loka 平台的**核心激励与风控机制**，贯穿用户活跃度激励、企业信用评级、治理权限分配三个维度。

### 6.1 双轨体系

平台对**投资者（个人用户）**和**项目发行方（企业）**采用两套独立的信用分规则。

### 6.2 投资者信用分

#### 6.2.1 初始分数

用户注册即获得 **100 分**（钱包连接）。可立即开始投资。

#### 6.2.2 积分规则

**平台使用类：**

| 行为 | 分数 | 条件 |
|---|---|---|
| 首次使用 SuperAgent | +20 | 一次性 |
| 完成 10 次分析任务 | +30 | 累计 |
| 首次联系 Founder | +15 | 一次性 |
| 关注 5 个项目 | +10 | 累计 |

**投资行为类：**

| 行为 | 分数 | 条件 |
|---|---|---|
| 首次投资 | +30 | 一次性 |
| Early Bird（项目上线 24h 内投资） | +20 | 每次 |
| 大额投资（≥$5,000） | +15 | 每次 |
| 参与高热度项目（>80% 已募） | +10 | 每次 |

**持有忠诚类：**

| 行为 | 分数 | 条件 |
|---|---|---|
| 持有 30 天 | +10 | — |
| 持有 90 天 | +25 | — |
| 持有 180 天 | +40 | — |
| 持有 365 天 | +80 | — |
| 全年未退出 | +50 | Long-term Badge |

**再投资类：**

| 行为 | 分数 | 条件 |
|---|---|---|
| 首次再投资 | +20 | 一次性 |
| 连续第二次再投资 | +35 | — |
| 连续第三次及以上 | +50 | — |

**社交参与类：**

| 行为 | 分数 | 条件 |
|---|---|---|
| 加入群并发言 | +10 | 一次性 |
| 首次 @Agent 执行任务 | +15 | 一次性 |
| 邀请有效新用户 | +30 | 每次 |
| 参与治理投票 | +5 | 月上限 25 |
| 投票与共识一致 | +10 | 月上限 30 |

**身份认证类：**

| 行为 | 分数 | 条件 |
|---|---|---|
| 邮箱验证 | +10 | 一次性 |
| Twitter 绑定 | +20 | 一次性 |
| LinkedIn 绑定 | +20 | 一次性 |
| KYC 认证 | +50 | 一次性 |

#### 6.2.3 投资者等级权益

| 等级 | 分数区间 | Early Access | 手续费 | 数据权限 | 分配额度 |
|---|---|---|---|---|---|
| **Explorer** | 100–499 | 标准 | 2% | 基础浏览 | 市场价 |
| **Believer** | 500–999 | 提前 6h | 1% | 详细财务数据 | 保证 $5K 额度 |
| **Legend** | 1000+ | 提前 24h | 0.5% | 完整尽调材料 | $50K 保留额度 |

### 6.3 企业发行方信用分

#### 6.3.1 初始分数与门槛

- 初始分：**100**（仅钱包连接）
- 发起募资门槛：**200 分**（需完成 4 步 KYC，每步 +25）

#### 6.3.2 企业等级体系

| 等级 | 信用分 | 保证金率 | 平台费率 |
|---|---|---|---|
| **Tier 1 新秀** | 200 | 30% | 5% |
| **Tier 2 成长** | 500 | 10% | 3% |
| **Tier 3 蓝筹** | 1000 | 10% | 1% |

#### 6.3.3 企业积分规则

**正向加分（还款类 — 主要）：**

| 行为 | 分数 |
|---|---|
| 首次按时还款 | +20 |
| 每月按时还款 | +15 |
| 连续 3 个月按时还款 | +30（额外奖励） |
| 连续 6 个月按时还款 | +50（额外奖励） |
| 提前还款（≥7 天） | +25 |
| 全额提前还款 | +40 |

**正向加分（其他）：**

| 行为 | 分数 |
|---|---|
| 完成首次募资 | +20 |
| 第二次募资 | +30 |
| 第三次及以上募资 | +40（每次） |
| 推荐注册并完成首次还款 | +30 |
| 参与平台治理 | +5/月（上限 15） |

**负面扣分：**

| 行为 | 分数 | 后果 |
|---|---|---|
| 逾期 1-7 天 | -30 | 黄色警告 |
| 逾期 8-30 天 | -80 | 暂停新募资 |
| 逾期 >30 天 | -150 | 触发清算 |
| 数据连接断开 | -100 | 暂停服务 |
| 数据造假 | -300 | 永久封禁 |

### 6.4 数据模型

| 模型 | 用途 |
|---|---|
| `CreditScoreHistory` | 信用分快照（userId, score, tier），定期记录 |
| `CreditScoreEvent` | 变更日志（userId, eventType, delta, reason, refId），每次加减分生成一条 |
| `User.creditScore` | 当前分数（实时字段） |

### 6.5 功能需求明细

| 需求 ID | 功能 | 优先级 | 当前状态 | 说明 |
|---|---|---|---|---|
| CS-01 | 信用分计算引擎（3 级体系） | P0 | ✅ 已实现 | 后端 10+ 评分规则 |
| CS-02 | 信用分查询 API | P0 | ✅ 已实现 | 当前分 + 等级 + 下一级要求 |
| CS-03 | 信用事件日志 API | P0 | ✅ 已实现 | 100 条最新事件 |
| CS-04 | 信用历史趋势 API | P1 | ✅ 已实现 | 50 条历史快照 |
| CS-05 | 信用分前端展示（Profile 页） | P1 | ❌ 待开发 | 分数 + 等级 + 进度条 + 历史趋势图 |
| CS-06 | 等级权益提示 | P2 | ❌ 待开发 | 用户升级提示 + 权益解锁通知 |

---

## 7. 治理系统

治理系统让社区成员参与平台决策，基于信用分的加权投票机制。

### 7.1 治理等级

| 信用分 | 等级 | 权限 |
|---|---|---|
| 100–149 | **观察员** | 浏览提案，无投票权 |
| 150–499 | **参与者** | 基础类投票（费率、规则、新发行方） |
| 500–999 | **治理者** | 全部投票 + 敏感议题（清算、争议）+ 评论提案 |
| 1000+ | **提案者** | 发起提案 + 全部投票 |

### 7.2 提案类型

| 类型 | 参与门槛 | 投票时长 | 特殊规则 |
|---|---|---|---|
| **参数变更**（费率、等级阈值） | 参与者+ | 7 天 | 全员投票 |
| **新发行方白名单** | 参与者+ | 7 天 | 全员投票 |
| **清算决策** | 治理者+ | 7 天 | 仅投资者可投票 |
| **紧急暂停** | 治理者+ | 24 小时 | 快速通道 |
| **争议仲裁** | 治理者+ | 14 天 | 当事方权重 ×2 |

### 7.3 投票机制

**加权公式：**

$$Weight = CreditScore \times RoleCoefficient \times InterestCoefficient$$

| 系数 | 值 | 说明 |
|---|---|---|
| RoleCoeff (投资者) | 1.0 | 基准 |
| RoleCoeff (发行方) | 0.8 | 略低以防利益冲突 |
| RoleCoeff (蓝筹发行方) | 1.0 | 高信用发行方恢复基准 |
| InterestCoeff (中立) | 1.0 | 与议题无直接利益关系 |
| InterestCoeff (持股方) | 1.5 | 持有相关项目股份 |
| InterestCoeff (发行方) | 0 | 自身项目议题回避投票 |

**投票规则：**
- 每个提案一人一票（for / against）
- 提案需达到 quorum（法定人数）才有效
- 投票结束后系统自动判定胜负并公告

### 7.4 治理奖励

| 行为 | 信用分 | 月上限 |
|---|---|---|
| 投票一次 | +5 | 25 |
| 投票与最终共识一致 | +10 | 30 |
| 提案评论获赞 Top | +15 | 15 |
| 成功发起提案 | +30 | 30（仅提案者） |
| 紧急治理响应 | +20 | 20 |

### 7.5 功能需求明细

| 需求 ID | 功能 | 优先级 | 当前状态 | 说明 |
|---|---|---|---|---|
| GV-01 | 提案列表 | P0 | ✅ 已实现 | GET /api/governance/proposals |
| GV-02 | 创建提案 | P0 | ✅ 已实现 | 需 1000+ 信用分 |
| GV-03 | 加权投票 | P0 | ✅ 已实现 | 信用分 × 角色 × 利益系数 |
| GV-04 | 投票结果自动判定 | P0 | ✅ 已实现 | quorum 机制 |
| GV-05 | 治理投票前端完善 | P1 | ❌ 待开发 | 结果展示 + 投票动画 |
| GV-06 | 提案评论 | P2 | ❌ 待开发 | 提案讨论区 |
| GV-07 | 紧急提案快速通道 | P2 | ❌ 待开发 | 24h 快速投票 |

---

## 8. 附录

### 8.1 关键实体

| 实体 | 用途 | 关键字段 |
|---|---|---|
| **User** | 用户核心 | id, email, name, walletAddress, authProvider, role, kycStatus, creditScore |
| **InvitationCode** | 邀请码系统 | code, createdById, usedById, maxUses, useCount, isActive, expiresAt |
| **ChatMessage** | AI 聊天消息 | userId, sessionId, role, content, agentId, metadata |
| **GroupChat** | 群组 | projectId, name, bio, avatar, fundedAmount, apy |
| **GroupMember** | 群成员 | groupId, userId, role (member/issuer/agent), lastReadAt |
| **GroupMessage** | 群消息 | groupId, userId, content, attachmentUrl, attachmentType, role |
| **Poll / PollOption / PollVote** | 投票系统 | question, duration, expiresAt; option text; userId vote |
| **Friendship** | 好友关系 | requesterId, addresseeId, status (pending/accepted/blocked) |
| **Conversation / DirectMessage** | 私信 | participants; senderId, content, attachmentUrl |
| **CreditScoreHistory** | 信用分快照 | userId, score, tier |
| **CreditScoreEvent** | 信用变更日志 | userId, eventType, delta, reason, refId |
| **GovernanceProposal** | 治理提案 | creatorId, title, category, status, forVotes, againstVotes, quorum, startsAt, endsAt |
| **GovernanceVote** | 投票记录 | proposalId, userId, vote (for/against), weight |
| **EnterpriseVerification** | 企业 KYC | companyName, country, registrationNo, licenseDoc, uboName, step, status |
| **ProposedApplication** | 项目申请 | enterpriseId, projectName, category, monthlyRevenue, requestedAmount, proposedApy |
| **Notification** | 通知 | userId, type, title, body, refType, refId, read |
| **Project** | 项目（Legacy） | 名称、行业、阶段、募资参数、月度收入 |
| **Investment** | 投资记录（Legacy） | projectId, userId, amount, status |

### 8.2 MVP 上线路径

**最小可上线集：** Auth + 部署 + AI Chat（仅聊天）+ Market（仅浏览）

| 阶段 | 内容 | 完成度 |
|---|---|---|
| Phase 0 | 基础设施（React + Express + Prisma + SQLite + JWT + WS） | ✅ 100% |
| Phase 1 | 认证 + AI 聊天 | ✅ 100% |
| Phase 2 | 前端对接 API（Market / Portfolio / Dashboard） | ✅ 95% |
| Phase 3 | 投资核心流程 | ✅ 100% |
| Phase 4 | AIUSD Mint/Redeem | ✅ 100% |
| Phase 5 | 企业认证 + 项目申请 | ⚠️ 75% |
| Phase 6-11 | 信用分 + 还款 + 治理 + 设置 + 前端优化 | ⚠️ 70-100% |
| Phase 12-14 | 部署 + 域名 + 合规 | ❌ 0% |

**上线阻塞项：** 生产服务器、域名、Privy 生产 App ID、真实项目数据

### 8.3 相关文档

| 文档 | 路径 | 说明 |
|---|---|---|
| 项目进度追踪 | `docs/TODO.md` | 模块级开发进度 |
| 技术架构 | `docs/ARCHITECTURE.md` | 系统拓扑与数据流 |
| API 文档 | `docs/API.md` | 完整 API 参考 |
| 信用分系统 | `docs/Loka_Credit_System.md` | 企业/投资者双轨信用分规则 |
| Loka Analyst Agent | `docs/Loka-Analyst-Agent.md` | 群组分析师 Agent 设计文档 |
| 设计系统 | `docs/design_system.md` | UI/UX 设计规范 |

