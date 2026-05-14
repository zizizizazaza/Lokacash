下面把 SuperAgent V2 拆成 10 步详细讲，每步说做什么 → 为何这么做 → 好处 → 代价。引用的代码位置都是真实的文件路径，你可以直接点开对照。

Step 0：Socket.IO 连接 + 鉴权
做什么：客户端建立 Socket.IO 长连接，在 connect handshake 里带 JWT，服务端解析后挂在 socket.data.userId 上。(server/src/socket/index.ts)

为何这么做：

单次 chat 要发 N 个事件（started / module / progress / stream_done），HTTP/SSE 也行，但 Socket.IO 有 reconnect、room、ack 机制白送
WebSocket 双向通道允许客户端发 agent:chat:cancel 中途打断
好处：实时性 + reconnect 免费 + 服务端能主动 push 给特定 userId（emitToUser）

代价：

Socket.IO 单进程连接数有上限（默认无限，要靠 reverse proxy 限）
横向扩展时需要 Redis adapter，目前是单实例
Step 1：消息入口 + 闲聊正则检测
做什么：用户消息进 agent:chat 后，先跑一个 isLikelyChitchat() 正则匹配（长度≤25 + 问候词 / 平台问 / 短 emoji）。(server/src/socket/index.ts)

为何这么做：

大量用户首条消息是"你好"、"在吗"、"loka 是什么"，这些根本不需要扣 Fast quota
如果不拦：用户连发 3 句"你好"就用掉 3 个 quota，UX 差且不公平
好处：明显闲聊零成本（不消耗 quota，也不触发后置 refund）

代价：

正则覆盖不全 —— "讲个笑话"、"RSI 是什么意思" 都过不了入口检测
这是为什么后面 Step 8 还需要后置 refund 兜底
Step 2：Quota 扣减（先扣后退模型）
做什么：通过入口检测后，立刻 consumeQuota(userId, 'fast') 原子 +1。(server/src/services/subscription.service.ts:221)

为何这么做：

备选方案是"先跑完看花了多少再扣" —— 不行。因为如果途中用户断线、超时，扣不到，用户就白嫖了
"悲观先扣"是金融/计费系统的标准做法，宁可错扣再补退
好处：

原子性强：用 prisma.update({ data: { fastUsed: { increment: 1 } } }) 一条 SQL，并发安全
配额耗尽时立即拒绝，不浪费 LLM 调用
代价：

用户可能看到 quota 数字短暂 +1 又 -1（后置 refund 时）
跨窗口边界时刚 reset 完又 increment，需要小心 lazyReset 顺序（lazyReset:123 在 consume 之前已经处理过）
Step 3：Per-user 并发锁
做什么：维护 userInFlight: Map<userId, { sessionId, abortController }>，同一用户发新消息时立刻 abort 上一个 run。(server/src/socket/index.ts)

为何这么做：

用户在第一条没跑完时又点 send（不耐烦、误点、网络重试），如果不拦，后端会双跑双扣 quota
旧的还在烧 LLM token，但 UI 已经在等新的结果了，旧结果是浪费
好处：

避免双扣
节省 LLM 成本（旧请求立即 abort，AbortController 透传到上游 fetch）
代价：

强制串行：用户不能同时跑两个会话（实际上一般用户单 tab 也只发一条）
内存里 Map 单实例，多机时要 Redis 才能跨节点 abort
Step 4：Auto 模式路由决策
做什么：如果用户选了 "Auto"，先用便宜模型快速判断"这条消息需要 Fast 还是 Roundtable"。

为何这么做：

Fast 模式（~3-15s）适合简单查询，Roundtable（~60-120s）适合复杂研究
让用户每次手选很烦，让模型自己路由更顺
如果只用 Roundtable，简单问题也要等 1 分钟，体验崩
好处：

用户体验：默认 Auto，能用 Fast 就用 Fast
成本：避免简单问题走 Roundtable 的 5-10 倍 token
代价：

多一次 LLM 调用（即使便宜也要 ~500ms）
路由错了用户感知不到原因（"我这问题不复杂怎么跑了 1 分钟"）
Step 5：First Pass — Native Function Calling
做什么：把 ToolRegistry 里所有 tool 的 JSON Schema 一起交给 DeepSeek-V3，让它在一次 LLM 调用里返回结构化的 tool calls 数组 + 简短 narration。(server/src/socket/superAgentV2.ts)

为何用 Native FC 而不是 ReAct/Prompt 模式：

ReAct 风格（"Thought → Action → Observation"）要靠 prompt 解析，输出不结构化，容易格式错乱
Native FC 是 LLM 厂商内置的，JSON Schema 强制约束，参数类型保证
为何用 DeepSeek-V3 而不是 Claude 当路由：

DeepSeek-V3 价格只有 Claude 的 1/10，路由阶段不需要太强的写作能力
但 function calling 准确率足够
好处：

一次 LLM 调用决定所有工具，无 multi-turn 循环
输出确定性高，解析简单
工具可并行执行（FC 输出就是 array）
代价：

被 LLM 厂商的 FC 协议绑定（虽然主流都兼容 OpenAI 格式）
一次决定所有工具，不能根据中间结果调整（这是 LangGraph 的强项 —— 多步决策）
工具集大时 prompt 膨胀，LLM 选择困难
Step 6：并行工具执行 + Python Semaphore
做什么：把 FC 返回的 N 个 tool calls 用 Promise.all 并行跑。Python 工具（akshare / hsgt_flow）走自研 Semaphore(8)。(server/src/services/pythonSemaphore.service.ts)

为何并行：

工具之间一般无依赖（查 BTC 价格 + 查 BTC 新闻可同时跑）
串行的话总耗时 = sum，并行总耗时 = max，UX 差距悬殊
为何 Python 走 Semaphore：

Node 工具是 fetch / HTTP，单条很轻
Python 子进程重：每个进程吃 100-300MB 内存，启动 1s 起步
在 4 核 16GB（无 swap）机器上，>10 个 Python 进程同时跑会 OOM
好处：

并行带来吞吐
Semaphore 提供 FIFO 排队 + 队列长度 stats + 超时回收 + 英文 queue UI
代价：

工具内部不能假设独占资源（数据库连接、文件锁等）
工具失败需要单独 catch，不能让一个失败拉爆 Promise.all
单进程的 in-memory Semaphore 不能跨节点
Step 7：Synthesis Pass — Claude Sonnet 4.6
做什么：把工具结果 + 用户问题 + 历史对话拼成新 prompt，喂给 Claude Sonnet 4.6，stream 输出最终答案。

为何换 Claude 而不是继续 DeepSeek：

路由阶段要"准"，合成阶段要"写得好"
Claude 在结构化金融分析、Markdown 表格、风险免责声明上质量明显高
价格虽然贵 ~5 倍，但只在合成时用一次，整体可控
为何 stream 而不是一次返回：

1000 字的回答非 stream 要等 10-30s，stream 第 1 个字 1-2s 出
用户感知"快"，即使总时间一样
好处：

输出质量高
UX 极佳（看着文字往外蹦）
可以中途 abort（用户按 stop）
代价：

Claude 成本 5x DeepSeek
Stream 解析复杂：要处理 SSE chunk、unicode 半个字符、token usage 在结尾
错误处理难：stream 一半挂了，前端拿到半截回答怎么办（你目前没特别处理）
Step 8：后置 Chitchat Refund
做什么：synthesis 完成后看 toolCallsCount === 0 && routingNarrationLen < 800，命中就 refundQuota('fast') 退回 1 次配额。(server/src/services/subscription.service.ts:199)

为何这么做：

Step 1 的入口正则只能 cover 明显闲聊
"讲个笑话"、"RSI 是什么意思" 这种没工具调用 + 短篇回答的，实际等价于一次廉价 LLM 对话
入口拦不住，那就用 LLM 的实际行为作为"真闲聊"判断依据 —— 0 tools 就是没有进行研究
好处：

兜底所有未被正则匹配的闲聊
用 LLM 行为做判断比写更多正则可靠
用户感知公平（不在乎短暂的数字波动）
代价：

用户能看到 quota 数字跳一下（11 → 12 → 11）
阈值 800 字是经验值，可能误退（用户真问了复杂问题但 LLM 不调工具直接答了）
多一次 DB write
Step 9：Replay Buffer（持久化模块/工具事件）
做什么：内存里维护 chatReplayBuffers: Map<sessionId, ChatReplayBuffer>，每个 module / tool_trace / progress chunk 都 push 进去。(server/src/services/moduleEmitter.ts)

为何这么做：

Socket.IO 事件是 fire-and-forget，客户端断开就丢
用户切 tab、刷新页面、网络抖动后回来，必须能看到 Thinking Process 已经走到哪
不然用户回来只看到一片空白 + spinner，根本不知道发生了什么
好处：

UX 巨大改善（"我能继续追踪它在干什么"）
60s TTL 内 reconnect 拿到完整状态
后端唯一真相来源，前端是哑显示
代价：

内存占用：每个 session 几 KB，1000 个 in-flight ≈ MB 级别，可接受
但 buffer 泄露过（finish 钩子没触发就一直在），所以加了 lastTouchedAt + 10min stale cleanup cron
单进程 Map 不能跨节点（多机时要 Redis）
Step 10：完成清理 + 持久化对话
做什么：

finishChatReplayBuffer(sessionId) 标记 done，60s 后从 Map 移除
emitToUser('agent:chat:stream_done', { content, sources, ... }) 通知前端最终内容
把完整对话写进 prisma.chat.update（用户消息 + 助手回答 + 来源）
清理 userInFlight Map
为何这么做：

60s 是 reconnect 重试的合理上限，更长就浪费内存
持久化到 DB 是真正的对话历史（关页面后还能查）
必须清 userInFlight，不然下一条消息会被错误地 abort 前一条（其实是这条自己）
好处：

DB 历史是真相，buffer 只是优化
重启 server 后用户对话还在
代价：

一次 chat 涉及多张表写入（subscription + chat + message + chunk），事务一致性需要小心
DB 写在 stream 结束时，如果挂了，对话历史就没存到
整体设计哲学
把 lokacash 的 v2 抽象一下：


[入口拦截] → [扣费] → [并发锁] → [路由 LLM] → [并行工具]
                                                  ↓
[持久化] ← [清理] ← [兜底退费] ← [合成 LLM stream]
这个流程的核心思想：

悲观计费，事后纠正（先扣后退）—— 比"事前预估"可靠
结构化决策（Native FC）—— 比 prompt 解析稳
并行优先（Promise.all + Semaphore）—— 单条延迟优化
状态可恢复（Replay buffer + DB）—— UX 容错
整体最大的弱点：

单进程所有状态都在内存（in-flight、buffer、semaphore），扩展需要 Redis 化重写
LLM 上游故障容错只到了 retry，没有 fallback model（Claude 挂了能不能自动切 GPT-4）
工具失败没有 graceful degradation 的统一框架，每个工具自己处理
整体最大的优点：

单进程直调延迟低，没有 LangChain 那种 N 层抽象的 overhead
TypeScript 全栈类型贯通，前后端事件契约编译时就能查
业务逻辑可读性高 —— 一个 socket/index.ts 文件就能讲清整个生命周期
如果你想深入某一步具体看代码，告诉我哪步，我把对应函数贴出来逐行讲。