# LOKA AIUSD — 开发指南

> 快速上手指南：环境搭建、日常开发、联调流程、常见问题。

---

## 1. 环境要求

| 工具 | 版本要求 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 18 | 推荐 20 LTS |
| npm | ≥ 9 | 随 Node 安装 |
| 系统 | macOS / Linux / Windows | 全平台兼容 |

> 无需安装数据库，开发环境使用 SQLite（文件数据库）。

---

## 2. 首次启动

### 2.1 前端

```bash
cd loka-aiusd-dashboard
npm install
npm run dev          # Vite dev server → http://localhost:3000
```

### 2.2 后端

```bash
cd loka-aiusd-dashboard/server
npm install
npx prisma generate   # 生成 Prisma Client
npx prisma db push    # 创建 SQLite 表结构
npm run db:seed        # 填充种子数据 (7 项目, 1 用户, 国库, 持仓)
npm run dev            # Express server → http://localhost:3002
```

### 2.3 验证

```bash
# 后端健康检查
curl http://localhost:3002/api/health
# → {"status":"ok","timestamp":"..."}

# 前端访问
open http://localhost:3000
```

---

## 3. 常用命令

### 前端 (根目录)

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 (port 3000) |
| `npm run build` | 生产构建到 dist/ |
| `npm run preview` | 预览构建产物 |

### 后端 (server/ 目录)

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动带 watch 的开发服务器 |
| `npx tsx src/index.ts` | 单次启动（不 watch） |
| `npm run db:generate` | 重新生成 Prisma Client |
| `npm run db:push` | 推送 schema 变更到 DB |
| `npm run db:migrate` | 创建迁移文件 |
| `npm run db:studio` | 打开 Prisma Studio (数据库 GUI) |
| `npm run db:seed` | 运行种子脚本 |

---

## 4. 前后端联调

### 4.1 代理配置

Vite 开发服务器自动代理请求到后端：

```
前端 http://localhost:3000/api/* → 后端 http://localhost:3002/api/*
前端 ws://localhost:3000/ws     → 后端 ws://localhost:3002
```

配置在 `vite.config.ts` 中，前端代码直接用 `/api/xxx` 相对路径即可。

### 4.2 登录流程

前端 Chat.tsx 组件有自动登录逻辑：
1. 页面加载时检查 `sessionStorage` 中的 token
2. 没有 token 则自动调用 `POST /api/auth/login/email` (demo@loka.finance)
3. 获取 token 后存入 `sessionStorage('loka_token')`
4. 后续所有请求自动携带 `Authorization: Bearer <token>`

### 4.3 手动测试 API

```bash
# 1. 获取 Token
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login/email \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@loka.finance"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 2. 带 Token 请求
curl -s http://localhost:3002/api/projects -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 3. 测试 AI 聊天（非流式）
curl -s -X POST http://localhost:3002/api/chat/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"content":"What is AIUSD?"}' | python3 -m json.tool

# 4. 测试 AI 聊天（流式 SSE）
curl -N -X POST http://localhost:3002/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"content":"Tell me about ComputeDAO"}'
```

---

## 5. 数据库操作

### 5.1 查看数据

```bash
cd server
npx prisma studio    # 浏览器打开 http://localhost:5555
```

### 5.2 重置数据

```bash
cd server
rm prisma/dev.db              # 删除数据库文件
npx prisma db push            # 重建表结构
npm run db:seed               # 重新填充种子数据
```

### 5.3 修改 Schema

1. 编辑 `server/prisma/schema.prisma`
2. 运行 `npx prisma db push`（开发时直接推送）
3. 运行 `npx prisma generate`（重新生成 Client 类型）
4. 需要时更新 `seed.ts` 并重新 seed

### 5.4 种子数据概览

| 数据 | 数量 | 说明 |
| --- | --- | --- |
| 用户 | 1 | demo@loka.finance |
| 项目 | 7 | ComputeDAO, DataPipeline, ArtBot, NeuralCloud, EdgeAI, TokenLogic, PromptPay |
| 月收入 | 每项目 6 条 | 近 6 个月数据 |
| 国库快照 | 1 | TVL $128.5M |
| 持仓 | 2 | AIUSD + USDC |
| 交易记录 | 4 | MINT/DEPOSIT/INTEREST |
| 群组 | 3 | ComputeDAO/DataPipeline/ArtBot 投资者群 |

---

## 6. 添加新功能指南

### 6.1 新增 API 端点

1. **创建路由文件**（如有需要）：`server/src/routes/xxx.ts`
2. **定义 Zod schema** 做请求校验
3. **使用认证中间件**（`authRequired` / `authOptional`）
4. **挂载路由** 到 `server/src/app.ts`：
   ```typescript
   import xxxRoutes from './routes/xxx.js';
   app.use('/api/xxx', xxxRoutes);
   ```
5. **更新前端 API 客户端** `src/services/api.ts` 添加对应方法
6. **更新 API.md** 文档

### 6.2 新增前端页面

1. **创建组件** `src/components/XxxPage.tsx`
2. **添加 Page enum** 到 `src/types.ts`
3. **在 App.tsx 添加**：
   - import 组件
   - `renderPage()` 中添加 case
   - 侧边栏 / 底部栏添加导航项

### 6.3 新增数据库表

1. **编辑 schema**：`server/prisma/schema.prisma`
2. **推送变更**：`npx prisma db push`
3. **生成 Client**：`npx prisma generate`
4. **（可选）更新 seed**：`server/prisma/seed.ts`

---

## 7. 项目约定

### 7.1 代码风格

- TypeScript 严格模式（后端）
- 函数式组件 + Hooks（前端）
- Zod 做所有外部输入校验
- 错误使用 `AppError` 类抛出

### 7.2 文件命名

- 组件：`PascalCase.tsx`（如 `Dashboard.tsx`）
- 路由/服务：`camelCase.ts`（如 `ai.service.ts`）
- 类型：`camelCase.ts`（如 `types.ts`）

### 7.3 Git 忽略

已在 `.gitignore` 中配置：
- `node_modules/`、`dist/`、`*.local`
- 后端 `.env` 和 `dev.db` 需手动确认是否忽略

---

## 8. 常见问题

### 端口被占用

```bash
# 查找并杀掉占用端口的进程
lsof -ti:3002 | xargs kill -9    # 后端
lsof -ti:3000 | xargs kill -9    # 前端
```

### Prisma Client 过期

修改 schema.prisma 后如果报类型错误：
```bash
cd server && npx prisma generate
```

### AI 聊天不响应

1. 确认 `server/.env` 中 `LOKA_AI_API_KEY` 已配置
2. 确认网络可访问 `api.lingyaai.cn`
3. 查看后端控制台错误日志

### 前端请求 401

1. 检查 `sessionStorage` 中是否有 `loka_token`
2. Token 可能过期（7 天），清除后刷新页面会自动重新登录
3. 确认后端正在运行且端口正确

---

## 9. 文档索引

| 文档 | 路径 | 用途 |
| --- | --- | --- |
| PRD v3.0 | `docs/requirement.md` | 唯一权威需求文档 |
| 信用分设计 | `docs/Loka_Credit_System.md` | 信用分详细规则参考 |
| 架构文档 | `docs/ARCHITECTURE.md` | 技术架构 + 设计决策 |
| API 文档 | `docs/API.md` | 完整接口参考 |
| 开发指南 | `docs/DEVELOPMENT.md` | 本文档 |
| README | `README.md` | 项目概览 + Quick Start |
