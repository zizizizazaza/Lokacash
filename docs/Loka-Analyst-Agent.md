# Loka Analyst — 投资群常驻分析师

> **最后更新：** 2026-04-01 · **状态：** 方案设计阶段

---

## 1. 定位

**一句话：** 群里的常驻分析师 — 平时帮你盯群、总结要点，@ 它就能出分析。

Loka Analyst 是投资社群群聊中的一等成员（非 Bot），具备：
- 名字和性格（专业但不冷冰冰的投资圈朋友）
- 跨群记忆（在 A 群分析过的项目，B 群它还记得）
- 主动参与能力（不只是被动应答）

### 为什么做这个

| 痛点 | 现状 | Loka Analyst 怎么解 |
|------|------|---------------------|
| 投资群信噪比低 | Telegram 群几百条消息，大部分无价值 | 每日/每周自动简报，只提炼有价值的信息 |
| 信息不对称 | 有人提了一个新项目，大家要自己去查 | 一个人 @Analyst 查项目，全群看到分析结果 |
| 死群 | 一旦没人活跃就冷下去 | Agent 检测到重要动态时主动发消息 |
| 回看成本高 | 几天没看群，不知道错过了什么 | "@Analyst 我错过了什么？" 根据 lastReadAt 个性化补充 |

---

## 2. 两种模式

### 2.1 旁听摘要模式（被动，不需要 @）

Agent 持续监听群消息，在合适的时机输出摘要。

#### 定时触发：每日/每周群聊简报

由群主/管理员配置频率（每天/每周/关闭）。

```
📋 群聊简报 (本周)

🔥 热议
• Polymarket 监管升级 — @张三 @李四 @王五 参与讨论，意见偏谨慎
• 新 GPU 算力项目 ComputeX — 3人看好，2人认为估值偏高

📌 项目动态
• ComputeDAO: issuer 确认 Q2 主网上线时间
• SolarFi: 发布月度收益报告，APY 12.3%

❓ 等待回复
• @李四: "合约审计结果什么时候出？"（3天前，issuer 未回复）
• @王五: "下一期额度什么时候开？"（2天前）

📊 群内氛围：整体偏谨慎（多人提到宏观不确定性）
```

#### 事件触发

| 触发条件 | Agent 行为 |
|---------|-----------|
| Issuer 发布重要更新 | 提炼一句话摘要 + 标记关键信息点 |
| 短时间内多人讨论同一话题 | "🔥 热门话题：XX，已有 N 人参与讨论" |
| 有人提问但长时间无人回复 | 尝试回答（如果有能力），或提醒 issuer |
| 群内长时间沉默 | **不做任何事**（不发无意义消息） |

### 2.2 按需分析模式（主动 @ 触发）

用户 `@Analyst` 后触发，分析结果**全群可见**。

| 用户说的 | Agent 调用 | 输出 |
|---------|-----------|------|
| "@Analyst 查一下 SolarFi" | Web Search + Risk Assessor | 融资背景、团队、核心指标、风险提示 |
| "@Analyst 这条新闻靠谱吗 [URL]" | Web Search 多源交叉核实 | 来源可信度 + 是否有矛盾信息 |
| "@Analyst 帮我比较 A 和 B" | Agent Council 多Agent共识 | 结构化对比表 + 结论 |
| "@Analyst 最近市场怎么样" | Market Analyst + Web Search | 近期热点 + 关键数据 + 社区情绪 |
| "@Analyst 这个地址 0x..." | 链上数据查询 | 持仓分布、交易历史、风险标记 |
| "@Analyst 总结一下今天的讨论" | 群消息读取 | 即时摘要（按话题分类） |
| "@Analyst 我错过了什么？" | 群消息 + 用户 lastReadAt | 个性化补充（只说你没看过的） |
| "@Analyst 之前群里聊 XX 时怎么说的？" | 群消息搜索 + 跨群记忆 | 历史回溯 |

#### 项目调研输出示例

```
🔍 项目调研：SolarFi

基本面
- 融资：Seed $2M (Multicoin, Coinbase Ventures) — 2025.11
- 团队：3人核心，CTO 前 Solana Labs
- TVL：$12M，近30天 +45%
- 审计：CertiK 已完成，1个 medium issue（已修复）

社区热度
- Twitter：18K followers，近30天互动率 3.2%
- 群内提及：本月被讨论 4 次，@张三 @王五 之前聊过

⚠️ 风险提示
- 代币 9 月有大额 unlock
- 竞品 MoonGrid 最近融了 $15M，赛道竞争加剧

来源：CoinGecko, DefiLlama, Twitter, CertiK
```

---

## 3. 性格设定

| 维度 | 设定 |
|------|------|
| 语言风格 | 专业但随和，像一个靠谱的投资圈朋友，不是机构研报腔调 |
| 主动程度 | 有价值时才说话，不参与闲聊，不刷屏 |
| 诚实度 | 不确定的事标注"⚠️ 未验证"，宁可说"我不确定"也不乱说 |
| 立场 | 有观点但有保留 — "从数据看偏积极，但要注意 XX 风险" |
| 记忆 | 记得群内讨论历史，记得每个成员的关注方向 |

---

## 4. 跨群记忆

PRD 中的核心差异点之一。Loka Analyst 不是无状态的 Bot。

- 用户在 A 群让 Analyst 分析过 SolarFi → 在 B 群问同样的项目，它记得之前的分析，能说"上次分析时 TVL 是 $8M，现在涨到 $12M"
- 记住群内每个成员的关注方向 — @张三 经常聊 GPU 算力，@李四 关注 RWA
- 分析报告跨群可引用 — "这个项目我在『DeFi 爱好者群』分析过，结论是..."

### 技术实现思路

```
AgentMemory {
  id          String @id
  agentId     String          // "loka-analyst"
  scope       String          // "global" | "group:{groupId}" | "user:{userId}"
  topic       String          // 项目名、赛道等
  content     String          // 分析结论、观察记录
  sourceGroupId String?       // 来自哪个群
  createdAt   DateTime
  updatedAt   DateTime
}
```

查询顺序：当前群 scope → 全局 scope → 其他群 scope（需要考虑隐私，不直接暴露其他群的具体讨论内容，只引用分析结论）。

---

## 5. 技术架构

### 5.1 消息处理流程

```
群消息进入
  ↓
Socket.IO: group:message 事件
  ↓
┌─ 包含 @Analyst？──→ 是 ──→ 意图解析 ──→ 路由到对应 Agent ──→ 生成分析 ──→ emitToGroup()
│                                │
│                                ├─ 项目调研 → Web Search + Risk Assessor
│                                ├─ 新闻核实 → Web Search 交叉验证
│                                ├─ 对比分析 → Agent Council 多Agent共识
│                                ├─ 市场概览 → Market Analyst
│                                ├─ 群聊总结 → 消息聚合 + AI 摘要
│                                └─ 链上查询 → Chain Data API
│
└─ 否 ──→ 被动监听 Pipeline
            │
            ├─ 消息写入缓冲区（用于简报生成）
            ├─ 关键词/意图检测（issuer更新、热议检测）
            └─ 定时任务触发时 → 生成简报 → emitToGroup()
```

### 5.2 现有架构复用

| 需要的能力 | 现状 | 工作量 |
|-----------|------|--------|
| Agent 发消息到群 | ✅ `emitToGroup()` + role="agent" | 0 |
| 读取群消息历史 | ✅ `GET /groups/:id/messages` | 0 |
| 获取成员列表 | ✅ `GET /groups/:id/members` | 0 |
| AI 意图理解 | ✅ Deepseek V3 via AI service | 0 |
| Agent Council 多Agent协作 | ✅ SuperAgentChat 已有 | 少量适配 |
| @提及检测 | ⚠️ Schema ready，逻辑需实现 | 小 |
| Agent 监听群消息 | ⚠️ Socket room 已有，需加监听钩子 | 小 |
| 定时任务（简报） | ❌ 需加 cron/scheduler | 中 |
| Agent memory store | ❌ 新建 | 中 |
| 链上数据查询 | ❌ 需接 API | 大（P2） |

### 5.3 新增组件

#### 1) Agent Message Hook（消息钩子）

```typescript
// server/src/services/agent-analyst.service.ts

interface AnalystTrigger {
  type: 'mention' | 'scheduled' | 'event';
  groupId: string;
  message?: GroupMessage;
}

async function onGroupMessage(groupId: string, message: GroupMessage) {
  // 1. 写入消息缓冲区（用于简报）
  messageBuffer.append(groupId, message);

  // 2. 检测是否 @Analyst
  if (isMentioningAnalyst(message.content)) {
    const intent = await parseIntent(message.content);
    const result = await routeToAgent(intent, groupId);
    emitToGroup(groupId, 'group:message', {
      senderId: 'loka-analyst',
      senderName: 'Loka Analyst',
      role: 'agent',
      content: result,
    });
  }

  // 3. 被动事件检测（issuer 更新、热议等）
  await passiveEventDetection(groupId, message);
}
```

#### 2) Intent Router（意图路由）

```typescript
type AnalystIntent =
  | { type: 'project_research'; project: string }
  | { type: 'news_verify'; url: string }
  | { type: 'compare'; itemA: string; itemB: string }
  | { type: 'market_overview' }
  | { type: 'chain_lookup'; address: string }
  | { type: 'summarize'; timeRange?: string }
  | { type: 'catch_up' }       // "我错过了什么"
  | { type: 'recall'; topic: string }  // "之前怎么说的"
  | { type: 'general'; query: string }

async function routeToAgent(intent: AnalystIntent, groupId: string): Promise<string> {
  switch (intent.type) {
    case 'project_research':
      return await projectResearch(intent.project, groupId);
    case 'compare':
      return await agentCouncilCompare(intent.itemA, intent.itemB);
    case 'summarize':
      return await generateSummary(groupId, intent.timeRange);
    case 'catch_up':
      return await generateCatchUp(groupId, getCurrentUserId());
    // ...
  }
}
```

#### 3) Scheduled Digest（定时简报）

```typescript
// 使用 node-cron 或类似方案
import cron from 'node-cron';

// 每天早上 9 点生成日报
cron.schedule('0 9 * * *', async () => {
  const groups = await getGroupsWithDigestEnabled();
  for (const group of groups) {
    const digest = await generateDigest(group.id, 'daily');
    emitToGroup(group.id, 'group:message', {
      senderId: 'loka-analyst',
      senderName: 'Loka Analyst',
      role: 'agent',
      content: digest,
    });
  }
});
```

---

## 6. 实现优先级

### P0：核心交互（1-2 周）

- [ ] @Analyst 提及检测（群消息中识别 @Analyst 或 @分析师）
- [ ] 意图解析（AI 理解用户想做什么）
- [ ] 路由到已有 Agent（Web Search、Risk Assessor、Market Analyst）
- [ ] 分析结果通过 `emitToGroup()` 全群可见回复
- [ ] 基础项目调研能力（融资、团队、指标、风险）

### P1：群聊简报（2-3 周）

- [ ] 消息缓冲区（存储群消息用于摘要）
- [ ] 定时任务框架（node-cron）
- [ ] 每日/每周简报生成（热议 + 项目动态 + 未答问题）
- [ ] 群主可配置简报频率
- [ ] 即时摘要（@Analyst 总结一下今天的讨论）
- [ ] 个性化 catch-up（基于 lastReadAt）

### P2：记忆与深度能力（3-4 周）

- [ ] Agent memory store（跨群、跨会话记忆）
- [ ] 链上地址查询（接入 Etherscan/DefiLlama API）
- [ ] 新闻交叉验证
- [ ] 成员兴趣画像（自动标记关注方向）

### P3：智能增强（后续迭代）

- [ ] 热点自动检测（不需要 @，检测群内话题升温）
- [ ] Issuer 承诺追踪（记录 issuer 说过的 deadline，到期提醒）
- [ ] 群内情绪指标
- [ ] 与 Super Agent 联动（群内调用完整的多Agent共识分析）

---

## 7. 与现有 Agent 的关系

Loka Analyst 不是一个全新的 AI，而是一个**调度层**，串联已有的专业 Agent：

```
                    ┌────────────────┐
    @Analyst ──→    │  Loka Analyst  │  ←── 定时任务
                    │  (调度 + 记忆)  │
                    └───────┬────────┘
                            │ 路由
            ┌───────┬───────┼───────┬───────┐
            ↓       ↓       ↓       ↓       ↓
         Risk    Market   Web     Agent   Chain
        Assessor Analyst  Search  Council  Data
```

- **Risk Assessor**：项目风险评估
- **Market Analyst**：市场数据分析
- **Web Search Agent**：新闻、社交媒体、公开信息搜集
- **Agent Council**：多 Agent 共识分析（对比、深度调研）
- **Chain Data**（新增）：链上数据查询

Loka Analyst 的独有价值是：**群聊感知 + 记忆 + 主动能力**。它知道群里在聊什么、谁关注什么、之前分析过什么。

---

## 8. 数据隐私考虑

- 跨群引用分析时，只引用**分析结论**，不暴露其他群的具体讨论内容
- Agent 记忆中的成员兴趣画像只在 Agent 内部使用，不对外展示
- 群主可关闭 Analyst 的被动监听功能
- 所有分析结果只在触发它的群内发送

---

## 9. 成功指标

| 指标 | 目标 |
|------|------|
| 群内 @Analyst 使用频率 | 平均每群每天 ≥ 3 次 |
| 简报打开/阅读率 | ≥ 40% 群成员阅读 |
| 群活跃度提升 | 引入 Analyst 后群消息量 +30% |
| 用户留存 | 有 Analyst 的群 7 日留存 ≥ 60% |
| 分析触发投资行为 | ≥ 10% 的项目调研后有成员进行投资 |
