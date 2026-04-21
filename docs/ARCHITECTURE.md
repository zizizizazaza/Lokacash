# Loka Cash — 架构文档

> 本文档面向新 session / 新开发者，快速了解项目全局架构。
> 另见：[CHAIN_ARCHITECTURE.md](CHAIN_ARCHITECTURE.md)（链上/链下决策 + AIUSD 方案）

---

## 1. 项目定位

**Loka Cash** 是一个国债支持稳定币 + RWA 现金流市场平台。用户可以：
- 铸造/赎回 AIUSD 稳定币（底层 85% 链上国债 + 10% 赎回备用金 + 5% 运营）
- 投资现金流项目（通过 Stripe Connect 自动分账还款）
- 在 Base 链上交易代币（30+ 代币 Swap）
- 通过 AI 助手获取投资建议、执行交易
- 在群组中与项目方 / 其他投资者交流、参与治理投票

## 2. 技术总览

```
┌──────────────────────────────────────────────────────┐
│                    客户端 (port 3000)                  │
│  React 19 + TypeScript + Vite + Tailwind CSS         │
│  Recharts / Chart.js (图表)                           │
└──────────────┬──────────────────────┬────────────────┘
               │ HTTP /api/*          │ WebSocket /ws
               │ (Vite Proxy)         │ (Vite WS Proxy)
               ▼                      ▼
┌──────────────────────────────────────────────────────┐
│                    服务端 (port 3002)                  │
│  Express 5 + TypeScript                              │
│  Prisma ORM + SQLite (dev)                           │
│  Socket.IO (实时通信)                                 │
│  JWT (认证)                                           │
│  Zod (请求校验)                                       │
└──────────────┬──────────────────────┬────────────────┘
               │                      │
               ▼                      ▼
┌─────────────────────┐  ┌───────────────────────────┐
│   SQLite (dev.db)   │  │  Loka AI (lingyaai.cn)    │
│   14 张表            │  │  deepseek-v3              │
│   Prisma ORM 管理    │  │  SSE 流式响应              │
└─────────────────────┘  └───────────────────────────┘
```

## 3. 目录结构

```
loka-aiusd-dashboard/
├── src/                          前端源码
│   ├── index.tsx                 React 入口
│   ├── App.tsx                   根组件 (路由 + 布局 + 状态)
│   ├── types.ts                  共享 TypeScript 类型
│   ├── constants.tsx             设计系统 (颜色 + 图标 SVG)
│   ├── services/
│   │   └── api.ts                API 客户端 (单例, JWT 管理)
│   └── components/               UI 组件 (13 个)
│       ├── Dashboard.tsx         国库仪表盘 (TVL, 收入, 储备分配)
│       ├── Chat.tsx              AI 聊天 (SSE 流, 历史, 内联交易)
│       ├── Market.tsx            项目市场 (卡片流, 筛选, 详情)
│       ├── Portfolio.tsx         投资组合 (持仓, 历史, 投资)
│       ├── Trade.tsx             二级市场 (买卖挂单)
│       ├── Groups.tsx            群组聊天 (项目群, 成员角色)
│       ├── Swap.tsx              AIUSD 铸造/赎回
│       ├── AgentMode.tsx         Agent 模式介绍
│       ├── Landing.tsx           首页 (动画, 功能展示)
│       ├── AuthModal.tsx         登录弹窗 (Email + OAuth)
│       ├── RiskModal.tsx         风险声明弹窗
│       ├── TxModal.tsx           充值/提取弹窗
│       └── Settings.tsx          账户设置
├── server/                       后端源码
│   ├── src/
│   │   ├── index.ts              HTTP + WebSocket 启动
│   │   ├── app.ts                Express 中间件 + 路由挂载
│   │   ├── config.ts             环境变量配置
│   │   ├── db.ts                 Prisma 客户端实例
│   │   ├── routes/               API 路由 (15 个文件)
│   │   │   ├── auth.ts           登录/注册/风险声明
│   │   │   ├── users.ts          用户资料
│   │   │   ├── projects.ts       项目列表/详情/投资/撤销
│   │   │   ├── treasury.ts       国库统计快照
│   │   │   ├── portfolio.ts      持仓/历史/mint/redeem
│   │   │   ├── trade.ts          交易挂单
│   │   │   ├── chat.ts           AI 聊天 (含 SSE 流)
│   │   │   ├── groups.ts         群组消息
│   │   │   ├── apply.ts          项目申请
│   │   │   ├── admin.ts          企业认证管理
│   │   │   ├── credit.ts         信用评分
│   │   │   ├── governance.ts     治理提案/投票
│   │   │   ├── liquidation.ts    清算/抵押物
│   │   │   ├── repayment.ts      还款追踪
│   │   │   └── notifications.ts  通知
│   │   ├── services/
│   │   │   ├── ai.service.ts     Loka AI (deepseek-v3, 系统提示词, 流)
│   │   │   ├── credit.service.ts  信用评分计算
│   │   │   ├── scheduler.service.ts 定时任务(逾期检测/持仓奖励)
│   │   │   └── notification.service.ts 通知服务
│   │   ├── middleware/
│   │   │   ├── auth.ts           JWT 中间件 (required/withUser/optional)
│   │   │   └── errorHandler.ts   全局错误处理
│   │   └── socket/
│   │       └── index.ts          Socket.IO (用户房间 + 群组房间)
│   ├── prisma/
│   │   ├── schema.prisma         数据模型 (14 个表)
│   │   ├── seed.ts               种子数据 (7 项目, 1 用户, 国库, 组合)
│   │   └── dev.db                SQLite 数据库文件
│   ├── .env                      后端环境变量
│   ├── package.json              后端依赖
│   └── tsconfig.json             后端 TS 配置
├── docs/                         产品 & 技术文档
│   ├── requirement.md            PRD v3.0 (唯一权威需求文档)
│   ├── Loka_Credit_System.md     信用分设计（项目方+投资者+治理）
│   ├── ARCHITECTURE.md           ← 本文档（系统架构）
│   ├── CHAIN_ARCHITECTURE.md     链上/链下决策 + AIUSD 技术方案
│   ├── API.md                    API 接口参考
│   ├── TODO.md                   模块上线追踪
│   └── DEVELOPMENT.md            开发指南
├── index.html                    Vite HTML 入口
├── vite.config.ts                Vite 配置 (proxy → :3002)
├── tsconfig.json                 前端 TS 配置
├── package.json                  前端依赖
└── README.md                     项目概览
```

## 4. 前端架构

### 4.1 路由 & 状态

没有使用 React Router，而是用 **enum-based page switching**：

```typescript
enum Page {
  LANDING, CHAT, GROUPS, TRADE, PORTFOLIO, SETTINGS,
  DASHBOARD, SWAP, MARKET, AGENT_MODE
}
```

`App.tsx` 持有 `currentPage` state，通过 `setCurrentPage()` 切换。侧边栏（桌面）和底部 Tab（移动端）同时控制。

组件间通信使用 **Custom Events**：
- `loka-nav-chat` / `loka-nav-swap` / `loka-nav-groups` 等
- 子组件 `dispatchEvent(new CustomEvent('loka-nav-xxx'))` 触发页面切换

### 4.2 API 客户端

`src/services/api.ts` 是一个单例 `ApiClient`：
- JWT token 存在 `sessionStorage('loka_token')`
- 所有请求自动附带 `Authorization: Bearer <token>` header
- 前端通过 Vite proxy 访问 `/api/*`，无需关心后端端口

### 4.3 AI 聊天流

Chat.tsx 的 SSE 流式对话流程：
```
用户输入 → POST /api/chat/stream (fetch + ReadableStream)
         → 后端调用 lingyaai.cn API
         → 逐 chunk 解析 SSE data 字段
         → 前端实时拼接 assistantMessage
         → 流结束后后端保存完整消息到 DB
```

### 4.4 样式方案

- **Tailwind CSS** via CDN（`<script src="https://cdn.tailwindcss.com">`）
- **自定义 CSS** 在 `index.html` 的 `<style>` 标签中（动画、Glass 效果等）
- **设计 Token** 在 `constants.tsx` 的 `COLORS` 对象中
- 无 CSS 模块 / Styled Components

## 5. 后端架构

### 5.1 分层结构

```
Routes (路由 + 校验) → Middleware (认证) → Services (业务逻辑) → Prisma ORM (数据库)
```

### 5.2 认证机制

- **JWT**：7 天过期，secret 配置在 `.env`
- **三种中间件**：
  - `authRequired` — 解析 token，设置 `req.userId`，否则 401
  - `authWithUser` — 同上但额外查 DB 获取完整 User 对象
  - `authOptional` — 有 token 就解析，没有也放行
- **登录方式**：Email（自动创建）+ OAuth（Google/Apple/X）

### 5.3 AI 服务

`LokaAIService` 封装了 lingyaai.cn 的 OpenAI 兼容 API：
- **模型**：deepseek-v3
- **系统提示词** 包含完整的 Loka 平台知识（7 个项目数据、国库统计、功能列表）
- **上下文**：每次请求携带最近 20 条历史消息
- **两种模式**：
  - `chat()` — 非流式，返回完整响应
  - `chatStream()` — 返回 ReadableStream，前端通过 SSE 消费

### 5.4 WebSocket

Socket.IO 用于实时通信：
- 用户连接后加入 `user:{userId}` 房间
- 加入群组时加入 `group:{groupId}` 房间
- 辅助函数 `emitToUser()` / `emitToGroup()` 向特定房间推送事件

### 5.5 数据库

SQLite（开发环境），Prisma ORM 管理：
- **20+ 个表**：User, Project, MonthlyRevenue, Investment, TradeOrder, TreasurySnapshot, Transaction, PortfolioHolding, GroupChat, GroupMember, GroupMessage, ChatMessage, EnterpriseVerification, ProposedApplication, RepaymentSchedule, LiquidationEvent, Collateral, GovernanceProposal, Vote 等
- 种子数据包含 7 个 AI 项目、1 个 demo 用户、国库快照、持仓记录

## 6. 关键设计决策

| 决策 | 选择 | 原因 |
| --- | --- | --- |
| 前端路由 | Enum + state，非 React Router | 原型阶段简洁，无 URL 路由需求 |
| 样式 | Tailwind CDN | 快速原型，无构建步骤 |
| 数据库 | SQLite + Prisma | 开发期零配置，后续可迁移 PostgreSQL |
| AI API | lingyaai.cn (OpenAI 兼容) | 国内访问稳定，支持 deepseek-v3 |
| 认证 | JWT + sessionStorage | 简单实现，后续可升级至 httpOnly cookie |
| 实时通信 | Socket.IO | 成熟库，支持房间/广播/断线重连 |
| 请求校验 | Zod | TypeScript 原生，类型安全 |

## 7. 当前开发状态

> 详细模块追踪见 [TODO.md](TODO.md)

### ✅ 已完成（Phase 0-11）
- 后端基础设施（Express 5 + Prisma + JWT + WebSocket + 定时任务）
- 全部 15 组 API 路由
- AI 聊天（deepseek-v3 + SSE + 资产上下文 + 交易意图识别）
- 前端全部页面对接真实 API（Market / Portfolio / Trade / Dashboard）
- 投资核心流程（invest / revoke / 募资状态机 / WS 通知）
- AIUSD 铸造/赎回（后端逻辑完成，链上合约待对接）
- 信用评分系统（3 级体系 + 10+ 评分规则）
- 还款追踪 + 逾期检测（定时任务）
- 抵押品管理（4 种抵押类型 + 信用等级挂钩抵押率 10-30%）
- 清算机制（瀑布分配算法：Senior 90% → Unsecured 50% → Equity 20%）
- 治理系统（提案 / 投票 / 参数自动生效）
- Privy 认证（Email + Google + Twitter + 嵌入式钱包）
- 30+ Base 链代币交易支持

### 🔜 下一步
- **部署**：生产环境（PostgreSQL + PM2 + Nginx） — 需 👤 提供服务器
- **Stripe Connect**：投资支付 + 自动分账还款 — 需 👤 申请平台号
- **AIUSD 合约**：4 个合约 + 国债对接（Ondo OUSG）
- **KYC**：第三方身份认证接入 — 需 👤 选型

## 8. 端口 & 环境变量

| 服务 | 端口 | 说明 |
| --- | --- | --- |
| Vite Dev Server | 3000 | 前端开发服务器 |
| Express Backend | 3002 | API + WebSocket |

后端环境变量 (`server/.env`)：

| 变量 | 说明 |
| --- | --- |
| `PORT` | 后端端口 (3002) |
| `DATABASE_URL` | Prisma DB 连接字符串 |
| `JWT_SECRET` | JWT 签名密钥 |
| `JWT_EXPIRES_IN` | Token 过期时间 (7d) |
| `LOKA_AI_API_KEY` | lingyaai.cn API 密钥 |
| `LOKA_AI_BASE_URL` | AI API 地址 |
| `LOKA_AI_MODEL` | AI 模型名 (deepseek-v3) |
| `FRONTEND_URL` | 前端地址 (CORS) |
