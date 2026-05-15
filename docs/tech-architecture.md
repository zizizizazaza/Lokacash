# LOKA — 技术架构文档

> **最后更新：** 2026-03-31
> **对应 PRD：** v6.0

---

## 1. 系统概览

Loka 采用前后端分离架构，客户端同时支持 Web 和移动端（通过 Capacitor 打包）。

```
┌─────────────────────────────────┐
│         客户端 (React)          │
│  Web (Vite) / iOS / Android     │
└──────────┬──────────────────────┘
           │ REST API + WebSocket
┌──────────▼──────────────────────┐
│         服务端 (Express 5)      │
│  路由 → 业务服务 → Prisma ORM   │
└──────────┬──────────────────────┘
           │
     ┌─────┴─────┐
     │  SQLite    │  (开发期，生产切 PostgreSQL)
     └───────────┘

外部依赖：
  - lingyaai.cn (OpenAI 兼容 API) → AI 分析 / Multi-Agent 共识
  - TrustMR API → 初创项目数据同步
  - AWS S3 → 文件上传存储
  - Privy → 第三方认证 (Google/Apple/X)
```

---

## 2. 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| **前端框架** | React 19 + TypeScript | SPA，Vite 构建 |
| **路由** | react-router-dom v7 | 客户端路由 |
| **图表** | Recharts + Chart.js + D3 | 数据可视化 |
| **3D** | Three.js + React Three Fiber | Landing 页等视觉效果 |
| **移动端** | Capacitor 8 | 同一套代码打包 iOS/Android |
| **实时通信** | Socket.IO | 群聊消息、Agent 状态推送 |
| **后端框架** | Express 5 + TypeScript | RESTful API |
| **ORM** | Prisma 6 | 类型安全的数据库操作 |
| **数据库** | SQLite (dev) | 生产环境可切 PostgreSQL |
| **校验** | Zod | 请求参数校验 |
| **认证** | JWT + Privy | 自有 Token + 第三方 OAuth |
| **文件存储** | AWS S3 + Multer | 头像、附件上传 |
| **AI** | lingyaai.cn + deepseek-v3 | SSE 流式输出 |

---

## 3. 项目结构

```
loka-aiusd-dashboard/
├── src/                         # 前端源码
│   ├── App.tsx                  # 主应用（路由 + 全局状态）
│   ├── components/              # 页面组件
│   │   ├── SuperAgentChat.tsx   # Super Agent 对话界面
│   │   ├── Market.tsx           # Market 页（公司列表）
│   │   ├── Groups.tsx           # 群组管理
│   │   ├── Chat.tsx             # 聊天界面
│   │   ├── Portfolio.tsx        # 个人中心
│   │   ├── Landing.tsx          # 落地页
│   │   └── ...                  # 其他页面组件
│   ├── services/
│   │   ├── api.ts               # HTTP 请求封装
│   │   └── socket.ts            # WebSocket 连接管理
│   ├── hooks/                   # 自定义 Hooks
│   ├── types.ts                 # 全局类型定义
│   └── constants.tsx            # 常量与配置
│
├── server/                      # 后端源码
│   ├── src/
│   │   ├── app.ts               # Express 应用（路由挂载、中间件）
│   │   ├── index.ts             # 服务启动入口（HTTP + WebSocket）
│   │   ├── config.ts            # 环境变量配置
│   │   ├── db.ts                # Prisma 客户端实例
│   │   ├── routes/              # API 路由（19 个模块）
│   │   ├── services/            # 业务逻辑层
│   │   ├── middleware/          # 限流、错误处理、鉴权
│   │   └── socket/              # WebSocket 事件处理
│   └── prisma/
│       ├── schema.prisma        # 数据模型定义（~620 行）
│       ├── seed.ts              # 种子数据
│       └── migrations/          # 数据库迁移记录
│
├── ios/                         # Capacitor iOS 壳
├── android/                     # Capacitor Android 壳
└── docs/                        # 产品文档
```

---

## 4. API 路由

| 路由 | 模块 | 说明 |
|---|---|---|
| `/api/auth` | 认证 | 登录/注册/Token 刷新（严格限流） |
| `/api/users` | 用户 | 用户信息 CRUD |
| `/api/projects` | 项目 | 项目列表/详情（含 TrustMR 数据） |
| `/api/chat` | AI 对话 | Super Agent 会话，SSE 流式返回 |
| `/api/groups` | 群组 | 群聊管理、成员、消息 |
| `/api/community` | 社交 | 好友关系、私信 (DM)、发现 |
| `/api/portfolio` | 持仓 | 用户收藏、分析历史 |
| `/api/credit` | 信用分 | 查询/变更/历史 |
| `/api/governance` | 治理 | 提案 CRUD、投票 |
| `/api/apply` | 入驻申请 | 公司入驻表单提交/审核 |
| `/api/trustmrr` | TrustMR | 外部项目数据同步 |
| `/api/invitation` | 邀请 | 邀请码生成/核销 |
| `/api/upload` | 文件 | S3 上传（头像、附件） |
| `/api/notifications` | 通知 | 站内通知 |
| `/api/admin` | 管理 | 后台管理接口 |

> 历史遗留路由（`/api/trade`, `/api/repayment`, `/api/liquidation`, `/api/treasury`）属于 v4.0 募资功能，当前版本不再使用，后续清理。

---

## 5. 数据模型（核心）

### 5.1 现有模型

| 模型 | 用途 | 状态 |
|---|---|---|
| **User** | 用户信息 + 信用分 + 认证 | ✅ 在用 |
| **InvitationCode** | 邀请码体系 | ✅ 在用 |
| **ChatMessage** | Super Agent 对话记录（含 sessionId 会话分组） | ✅ 在用 |
| **GroupChat / GroupMember / GroupMessage** | 群组聊天 | ✅ 在用 |
| **Poll / PollOption / PollVote** | 群内投票 | ✅ 在用 |
| **Friendship** | 好友关系 | ✅ 在用 |
| **Conversation / DirectMessage** | 私信 DM | ✅ 在用 |
| **CreditScoreHistory / CreditScoreEvent** | 信用分变更记录 | ✅ 在用 |
| **GovernanceProposal / GovernanceVote** | 治理提案投票 | ✅ 在用 |
| **EnterpriseVerification / ProposedApplication** | 公司入驻验证 | ✅ 在用 |
| **Notification** | 站内通知 | ✅ 在用 |
| **Project / Investment / TradeOrder** | v4.0 募资功能 | ⚠️ 遗留，待清理 |
| **RepaymentSchedule / Collateral / LiquidationEvent** | v4.0 还款清算 | ⚠️ 遗留，待清理 |
| **TreasurySnapshot / RedemptionQueue / Transaction** | v4.0 资金管理 | ⚠️ 遗留，待清理 |

### 5.2 关键关系

```
User ─┬─ ChatMessage (Super Agent 对话)
      ├─ GroupMember → GroupChat → GroupMessage
      ├─ Friendship (好友)
      ├─ ConversationParticipant → Conversation → DirectMessage (私信)
      ├─ CreditScoreEvent / CreditScoreHistory (信用分)
      ├─ GovernanceVote → GovernanceProposal (治理)
      ├─ InvitationCode (邀请)
      └─ Notification (通知)
```

---

## 6. AI 系统

### 6.1 基础架构

- **API 提供商**：lingyaai.cn（OpenAI 兼容接口）
- **模型**：deepseek-v3
- **通信方式**：SSE (Server-Sent Events) 流式输出
- **服务层**：`server/src/services/ai.service.ts`

### 6.2 Multi-Agent 共识机制

Super Agent 的 Multi-Agent 共识流程：

```
用户输入
    ↓
Orchestrator 解析意图，选择参与的 Agent 类型
    ↓
┌─────────────────────────────────────┐
│       多轮共识讨论（N 轮）          │
│                                     │
│  分析 Agent → 发表初始观点          │
│  风险 Agent → 指出风险              │
│  新闻 Agent → 补充最新动态          │
│       ↓                             │
│  各 Agent 交叉验证、质疑            │
│       ↓                             │
│  收敛为共识结论                     │
└─────────────────────────────────────┘
    ↓
输出结构化报告（SSE 流式推送到前端）
```

### 6.3 Agent 职能

| 类别 | 职责 |
|---|---|
| 数据分析 | 量化分析、估值、趋势 |
| 项目分析 | 基本面、团队、商业模式 |
| 产品分析 | 竞品对比、功能拆解 |
| 风险评估 | 风险识别、评分 |
| 新闻搜集 | 实时新闻、舆情 |

---

## 7. 实时通信

### 7.1 WebSocket (Socket.IO)

- **用途**：群聊消息实时推送、Agent 工作状态推送、在线状态
- **客户端**：`src/services/socket.ts`
- **服务端**：`server/src/socket/`

### 7.2 事件类型

| 事件 | 方向 | 说明 |
|---|---|---|
| `group:message` | 双向 | 群聊消息收发 |
| `group:join` / `group:leave` | Client→Server | 进入/离开群聊房间 |
| `dm:message` | 双向 | 私信收发 |
| `agent:status` | Server→Client | Agent 工作进度推送 |
| `notification` | Server→Client | 站内通知推送 |

---

## 8. 认证与安全

### 8.1 认证流程

- **第三方 OAuth**：通过 Privy SDK（支持 Google / Apple / X 登录）
- **JWT Token**：登录后服务端签发 JWT，客户端每次请求携带
- **钱包连接**：支持嵌入式钱包（Privy Embedded Wallet）

### 8.2 安全中间件

| 中间件 | 说明 |
|---|---|
| **Helmet** | HTTP 安全头 |
| **CORS** | 白名单域名控制 |
| **Rate Limiter** | 三级限流：通用 API / Auth / 敏感操作 |
| **Request ID** | 每个请求分配唯一 ID，便于追踪 |
| **Idempotency** | 关键操作幂等性保障（数据库记录） |
| **Zod Validation** | 请求参数类型校验 |

---

## 9. 部署

### 9.1 前端

- **构建**：`vite build` → 输出到 `dist/`
- **托管**：Vercel（`vercel.json` 已配置 API 代理）
- **移动端**：`npm run build:mobile` → Capacitor 同步到 iOS/Android 壳

### 9.2 后端

- **开发**：`tsx watch src/index.ts`（热重载）
- **生产**：`tsc` 编译后 `node dist/index.js`
- **数据库迁移**：`prisma migrate dev`（开发）/ `prisma migrate deploy`（生产）

### 9.3 环境变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | SQLite/PostgreSQL 连接串 |
| `JWT_SECRET` | JWT 签名密钥 |
| `LINGYAAI_API_KEY` | AI API 密钥 |
| `LINGYAAI_BASE_URL` | AI API 地址 |
| `TRUSTMRR_API_KEY` | TrustMR 数据 API 密钥 |
| `AWS_*` | S3 存储配置 |
| `PRIVY_*` | Privy 认证配置 |

---

## 10. 待清理项（v4.0 遗留）

以下模块属于 v4.0 募资/清算业务，在 v6.0 中不再使用，需在后续迭代中清理：

| 模块 | 涉及文件 | 说明 |
|---|---|---|
| 募资投资 | `routes/trade.ts`, `Project/Investment` 模型 | 认购、份额交易 |
| 还款 | `routes/repayment.ts`, `RepaymentSchedule` 模型 | 定期还款 |
| 清算 | `routes/liquidation.ts`, `Collateral/LiquidationEvent` 模型 | 抵押品、清算 |
| 资金管理 | `routes/treasury.ts`, `TreasurySnapshot/RedemptionQueue` 模型 | TVL、赎回队列 |
