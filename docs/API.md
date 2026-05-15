# LOKA AIUSD — API 接口文档

> 后端基础 URL：`http://localhost:3002`（开发环境通过 Vite proxy 在 `/api/*` 转发）
>
> 认证方式：`Authorization: Bearer <JWT>` header

---

## 认证状态说明

| 标记 | 含义 |
| --- | --- |
| 🔓 | 无需认证 |
| 🔒 | 需要 JWT (authRequired) |
| 🔒👤 | 需要 JWT 且查询用户 (authWithUser) |
| 🔑 | 可选认证 (authOptional) |

---

## 1. 健康检查

### `GET /api/health` 🔓

```json
// Response 200
{ "status": "ok", "timestamp": "2026-03-11T00:00:00.000Z" }
```

---

## 2. 认证 (Auth)

### `POST /api/auth/login/email` 🔓

Email 登录，用户不存在则自动创建。

```json
// Request Body
{
  "email": "demo@loka.finance",     // required, valid email
  "name": "Demo User"               // optional
}

// Response 200
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "clxxx...",
    "email": "demo@loka.finance",
    "name": "Demo User",
    "role": "user",
    "creditScore": 100,
    "riskAccepted": false,
    "createdAt": "..."
  }
}
```

### `POST /api/auth/login/oauth` 🔓

OAuth 登录（Google / Apple / X）。

```json
// Request Body
{
  "provider": "google",             // required: "google" | "apple" | "x"
  "id": "oauth-provider-id-123",    // required: provider user ID
  "email": "user@gmail.com",        // optional
  "name": "OAuth User"              // optional
}

// Response 200 — 同 email 登录
```

### `GET /api/auth/me` 🔒

获取当前登录用户信息。

```json
// Response 200
{
  "user": {
    "id": "clxxx...",
    "email": "demo@loka.finance",
    "name": "Demo User",
    "avatar": null,
    "walletAddress": null,
    "role": "user",
    "kycStatus": "none",
    "creditScore": 100,
    "riskAccepted": false,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### `POST /api/auth/accept-risk` 🔒

接受风险声明。

```json
// Response 200
{ "message": "Risk accepted" }
```

---

## 3. 用户 (Users)

### `GET /api/users/profile` 🔒

```json
// Response 200 — 完整 User 对象（同 /auth/me 中的 user）
```

### `PATCH /api/users/profile` 🔒

```json
// Request Body（所有字段可选）
{
  "name": "New Name",
  "avatar": "https://...",
  "walletAddress": "0x..."
}

// Response 200
{ "user": { /* updated user object */ } }
```

---

## 4. 项目 (Projects)

### `GET /api/projects` 🔑

列表查询，支持 category 和 status 筛选。

```
GET /api/projects
GET /api/projects?category=Compute
GET /api/projects?status=Fundraising
GET /api/projects?category=SaaS&status=Funded
```

```json
// Response 200
{
  "projects": [
    {
      "id": "clxxx...",
      "title": "ComputeDAO - GPU Expansion Batch #4",
      "subtitle": "Scaling H100 clusters...",
      "category": "Compute",
      "issuer": "ComputeDAO Solutions",
      "issuerLogo": null,
      "coverImage": null,
      "description": "...",
      "faceValue": 100,
      "askPrice": 96.5,
      "apy": 15.5,
      "durationDays": 60,
      "creditScore": 860,
      "status": "Fundraising",
      "targetAmount": 500000,
      "raisedAmount": 375000,
      "backersCount": 124,
      "remainingCap": 125000,
      "coverageRatio": 2.2,
      "verifiedSource": "Stripe Connect",
      "createdAt": "...",
      "updatedAt": "...",
      "monthlyRevenue": [
        { "id": "...", "month": "2025-07", "amount": 245000 }
      ],
      "_count": { "investments": 3 }
    }
  ]
}
```

### `GET /api/projects/:id` 🔑

```json
// Response 200
{
  "project": {
    /* 同上单个 project 对象，含完整 monthlyRevenue 数组 */
  }
}

// Response 404
{ "error": "Project not found" }
```

---

## 5. 国库 (Treasury)

### `GET /api/treasury/stats` 🔑

返回最新国库快照，无数据时返回 mock 默认值。

```json
// Response 200
{
  "stats": {
    "tvl": 128500000,
    "collateralRatio": 104.2,
    "treasuryRevenue": 2850000,
    "tBillsPercent": 90,
    "liquidityPercent": 7,
    "operationsPercent": 3,
    "lastPoR": "2025-12-01T00:00:00.000Z"
  }
}
```

---

## 6. 投资组合 (Portfolio)

### `GET /api/portfolio/holdings` 🔒

```json
// Response 200
{
  "holdings": [
    {
      "id": "...",
      "asset": "AIUSD",
      "amount": 50000,
      "avgCost": 1.0,
      "currentApy": 4.2
    }
  ]
}
```

### `GET /api/portfolio/history` 🔒

最近 50 条交易记录，按时间倒序。

```json
// Response 200
{
  "transactions": [
    {
      "id": "...",
      "type": "MINT",        // MINT | REDEEM | INTEREST | DEPOSIT | WITHDRAW
      "amount": 25000,
      "asset": "AIUSD",
      "status": "COMPLETED", // PENDING | COMPLETED | FAILED | QUEUED
      "txHash": "0x...",
      "createdAt": "..."
    }
  ]
}
```

### `GET /api/portfolio/investments` 🔒

```json
// Response 200
{
  "investments": [
    {
      "id": "...",
      "amount": 10000,
      "shares": 103,
      "status": "active",     // active | matured | sold | defaulted
      "createdAt": "...",
      "project": {
        "id": "...",
        "title": "ComputeDAO...",
        "apy": 15.5,
        "status": "Fundraising"
      }
    }
  ]
}
```

---

## 7. 交易 (Trade)

### `GET /api/trade` 🔒

```
GET /api/trade
GET /api/trade?projectId=clxxx
GET /api/trade?status=Listed
```

```json
// Response 200
{
  "orders": [
    {
      "id": "...",
      "projectId": "...",
      "sellerId": "...",
      "buyerId": null,
      "listPrice": 97.5,
      "originalPrice": 96.5,
      "shares": 50,
      "totalValue": 4875,
      "expectedReturn": 125,
      "expectedYield": 2.6,
      "status": "Listed",
      "listedAt": "...",
      "soldAt": null,
      "project": {
        "id": "...",
        "title": "...",
        "apy": 15.5
      }
    }
  ]
}
```

### `POST /api/trade` 🔒

创建卖单。

```json
// Request Body
{
  "projectId": "clxxx...",    // required
  "listPrice": 97.5,          // required, number
  "shares": 50                 // required, number > 0
}

// Response 201
{
  "order": {
    /* 完整 TradeOrder 对象 */
  }
}
```

**自动计算逻辑：**
- `originalPrice` = project.askPrice
- `totalValue` = listPrice × shares
- `expectedReturn` = (faceValue - listPrice) × shares
- `expectedYield` = ((faceValue - listPrice) / listPrice) × 100

---

## 8. 聊天 (Chat)

### `GET /api/chat/history` 🔒

最近 100 条消息，按时间升序。

```json
// Response 200
{
  "messages": [
    {
      "id": "...",
      "role": "user",           // "user" | "assistant"
      "content": "你好",
      "agentId": null,
      "metadata": null,
      "createdAt": "..."
    }
  ]
}
```

### `POST /api/chat/send` 🔒

非流式 AI 对话（较慢，建议用 stream）。

```json
// Request Body
{
  "content": "What is AIUSD?",   // required
  "agentId": "loka-main"          // optional
}

// Response 200
{
  "userMessage": { /* ChatMessage */ },
  "assistantMessage": { /* ChatMessage */ }
}
```

### `POST /api/chat/stream` 🔒

**SSE 流式 AI 对话**（推荐）。

```json
// Request Body
{
  "content": "Tell me about ComputeDAO",
  "agentId": null
}
```

**Response**: `Content-Type: text/event-stream`

```
data: {"choices":[{"delta":{"content":"ComputeDAO"},"finish_reason":null}]}

data: {"choices":[{"delta":{"content":" is a"},"finish_reason":null}]}

data: {"choices":[{"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**前端消费方式** (参考 Chat.tsx)：
```typescript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ content: message }),
});
const reader = response.body.getReader();
// 逐 chunk 解析 SSE 格式，拼接 delta.content
```

### `DELETE /api/chat/history` 🔒

```json
// Response 200
{ "message": "Chat history cleared" }
```

---

## 9. 群组 (Groups)

### `GET /api/groups` 🔒

```json
// Response 200
{
  "groups": [
    {
      "id": "...",
      "name": "ComputeDAO Investors",
      "projectId": "...",
      "fundedAmount": 375000,
      "apy": 15.5,
      "project": { "id": "...", "title": "...", "status": "Fundraising" },
      "members": [
        { "id": "...", "userId": "...", "role": "investor" }
      ],
      "_count": { "messages": 42 }
    }
  ]
}
```

### `GET /api/groups/:id/messages` 🔒

最近 100 条消息，按时间升序。

```json
// Response 200
{
  "messages": [
    {
      "id": "...",
      "content": "Welcome to the group!",
      "role": "issuer",
      "createdAt": "...",
      "user": {
        "id": "...",
        "name": "CEO Alice",
        "avatar": null
      }
    }
  ]
}
```

### `POST /api/groups/:id/messages` 🔒

```json
// Request Body
{
  "content": "Hello everyone!"   // required
}

// Response 201
{ "message": { /* GroupMessage + user */ } }

// Response 403
{ "error": "Not a member of this group" }
```

---

## 10. WebSocket 事件

连接地址：`ws://localhost:3002`（开发时通过 Vite proxy `/ws` 转发）

### 客户端 → 服务端

| 事件 | 数据 | 说明 |
| --- | --- | --- |
| `join` | `userId: string` | 加入用户房间 |
| `join-group` | `groupId: string` | 加入群组房间 |
| `leave-group` | `groupId: string` | 离开群组房间 |

### 服务端 → 客户端

通过辅助函数 `emitToUser(userId, event, data)` / `emitToGroup(groupId, event, data)` 推送。

目前主要用于群组消息实时推送，后续会扩展到：
- 融资进度实时更新
- 投资确认通知
- 还款到账通知

---

## 11. 错误响应格式

所有错误统一格式：

```json
// 400 Bad Request (Zod 校验失败)
{ "error": "Validation failed", "details": [...] }

// 401 Unauthorized
{ "error": "Access denied. No token provided." }

// 403 Forbidden
{ "error": "Not a member of this group" }

// 404 Not Found
{ "error": "Project not found" }

// 500 Internal Server Error
{ "error": "Something went wrong" }   // production
{ "error": "具体错误信息" }             // development
```

---

## 12. 数据库模型索引

| 模型 | 索引字段 | 唯一约束 |
| --- | --- | --- |
| User | email, walletAddress | email, walletAddress |
| Project | status, category | — |
| MonthlyRevenue | projectId | — |
| Investment | userId, projectId | — |
| TradeOrder | projectId, sellerId, status | — |
| Transaction | userId, type | — |
| PortfolioHolding | userId | [userId, asset] |
| GroupChat | — | projectId |
| GroupMember | groupId, userId | — |
