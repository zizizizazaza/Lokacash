# LOKA AIUSD Dashboard — 测试文档

> 按用户体验路径组织，覆盖全部功能场景。

---

## 目录

- [路径 1：登录、账户管理、登出](#路径-1登录账户管理登出)
- [路径 2：入金 → 出金](#路径-2入金--出金)
- [路径 3：聊天 → 咨询项目 → 通过聊天购买 → 语音聊天执行购买](#路径-3聊天--咨询项目--通过聊天购买--语音聊天执行购买)
- [路径 4：投资全流程（查找项目 → 投资 → 群组聊天 → 收款管理 → 二级市场）](#路径-4投资全流程)
- [路径 5：申请项目（企业认证 → 项目上线）](#路径-5申请项目)
- [附录 A：API 接口层](#附录-aapi-接口层)
- [附录 B：语音系统 (useVoice)](#附录-b语音系统-usevoice)
- [附录 C：类型定义 & Mock 数据](#附录-c类型定义--mock-数据)

---

## 路径 1：登录、账户管理、登出

> 用户首次访问 → 风险提示 → 选择登录方式 → 查看/修改账户 → 登出

### 1.1 应用加载 & 导航框架

| # | 测试点 | 预期结果 |
|---|---|---|
| 1.1.1 | 应用首次加载 | 显示 Landing 页面（`currentPage = Page.LANDING`） |
| 1.1.2 | 当 `showRiskModal = true` 时 | 渲染 RiskModal 遮罩层 |
| 1.1.3 | 当 `showAuthModal = true` 时 | 渲染 AuthModal 遮罩层 |
| 1.1.4 | 当 `showTxModal = true` 时 | 渲染 TxModal 遮罩层 |
| 1.1.5 | 页面枚举值 | LANDING, DASHBOARD, SWAP, MARKET, PORTFOLIO, AGENT, CHAT, GROUPS, SETTINGS, TRADE |
| 1.1.6 | 自定义事件 `loka-nav-chat` | `currentPage → Page.CHAT` |
| 1.1.7 | 自定义事件 `loka-nav-market` | `currentPage → Page.MARKET` |
| 1.1.8 | 自定义事件 `loka-nav-swap` | `currentPage → Page.SWAP` |
| 1.1.9 | 自定义事件 `loka-nav-groups` | `currentPage → Page.GROUPS` |
| 1.1.10 | 自定义事件 `loka-nav-trade` | `currentPage → Page.TRADE` |
| 1.1.11 | 导航到 Coming Soon 页面 | 显示 toast 提示 "Coming soon!" |

### 1.2 风险提示 (RiskModal)

| # | 测试点 | 预期结果 |
|---|---|---|
| 1.2.1 | Modal 标题 | "Important Disclosures" |
| 1.2.2 | 展示 8 条风险提示条目 | 每条有勾选图标 + 说明文字 |
| 1.2.3 | 底部说明文字 | "By clicking 'Agree & Continue', you acknowledge..." |
| 1.2.4 | "Agree & Continue" 按钮 | 点击 → 调用 `onAccept()`，记录到 `localStorage.loka_risk_accepted` |
| 1.2.5 | 关闭按钮 | 仅当提供 `onClose` prop 时渲染 |
| 1.2.6 | 点击关闭按钮 | 调用 `onClose()` |
| 1.2.7 | 点击遮罩层外部 | 不关闭（无 backdrop onClick） |

### 1.3 登录 (AuthModal)

| # | 测试点 | 预期结果 |
|---|---|---|
| 1.3.1 | Modal 结构 | 标题 "Welcome to Loka"，副标题 "Sign in to access..." |
| 1.3.2 | 三种登录方式 | Google OAuth、X (Twitter) OAuth、Email OTP |
| 1.3.3 | 关闭按钮 | 点击调用 `onClose()` |

#### 1.3a Google OAuth

| # | 测试点 | 预期结果 |
|---|---|---|
| 1.3a.1 | 点击 "Continue with Google" | 调用 `loginWithOAuth({ provider: 'google' })` |
| 1.3a.2 | 登录中状态 | 按钮显示 spinner + "Connecting..." |
| 1.3a.3 | 登录成功 | 使用 Privy user 信息调用 `api.loginOAuth(provider, providerId, email, name)` |
| 1.3a.4 | 成功后 | `setIsWalletConnected(true)` + 关闭 modal |

#### 1.3b X (Twitter) OAuth

| # | 测试点 | 预期结果 |
|---|---|---|
| 1.3b.1 | 点击 "Continue with X" | 调用 `loginWithOAuth({ provider: 'twitter' })` |
| 1.3b.2 | 登录流程 | 与 Google OAuth 相同的 loading / success 流程 |

#### 1.3c Email OTP

| # | 测试点 | 预期结果 |
|---|---|---|
| 1.3c.1 | 输入邮箱 | 更新 `email` state |
| 1.3c.2 | 点击 "Send Code" | 调用 `sendCode({ email })`，按钮禁用 + 显示 "Sending..." |
| 1.3c.3 | 发送成功 | 切换到 OTP 输入页面（`emailSent = true`） |
| 1.3c.4 | OTP 输入框 | 6 位 hidden input + 显示圆点 |
| 1.3c.5 | 输入验证码 | 调用 `loginWithCode({ code })`，显示 "Verifying..." |
| 1.3c.6 | 验证成功 | 同步服务端 `api.loginEmail(email)` → 设置 token → 关闭 modal |

#### 1.3d 错误处理

| # | 测试点 | 预期结果 |
|---|---|---|
| 1.3d.1 | OAuth 异常 | 显示红色错误消息 |
| 1.3d.2 | OTP 发送失败 | 显示错误消息，可重新发送 |
| 1.3d.3 | OTP 验证失败 | 显示错误消息，可重新输入 |
| 1.3d.4 | "Back" 按钮 (OTP 页面) | 返回登录方式选择页 |

### 1.4 认证门控

| # | 测试点 | 预期结果 |
|---|---|---|
| 1.4.1 | 未登录点击侧边栏 Profile | 打开 AuthModal |
| 1.4.2 | 未登录点击侧边栏 Deposit | 打开 AuthModal |
| 1.4.3 | 登录后访问 Portfolio | 正常显示内容 |
| 1.4.4 | Portfolio 未登录 | 显示 "Authentication Required" + 锁图标 + "Connect Wallet" 按钮 |
| 1.4.5 | 点击 "Connect Wallet" | 调用 `onConnect()` 打开 AuthModal |

### 1.5 账户设置 (Settings)

| # | 测试点 | 预期结果 |
|---|---|---|
| 1.5.1 | 入口 | Portfolio 页面点击齿轮图标 → `currentPage = Page.SETTINGS` |
| 1.5.2 | 返回按钮 | 调用 `onBack()` → 返回 Portfolio |
| 1.5.3 | 页面标题 | "Account Settings" |
| 1.5.4 | 加载 Profile | 页面挂载时调用 `api.getUserProfile()` |
| 1.5.5 | 显示名称输入 | 可编辑 display name + Save 按钮 |
| 1.5.6 | 保存名称 | 调用 `api.updateProfile({ name: editName.trim() })`，成功显示 "Saved!" |
| 1.5.7 | 空名称 | 不执行保存 |
| 1.5.8 | 保存失败 | 显示错误提示 |
| 1.5.9 | Email 显示 | 只读展示 |
| 1.5.10 | Wallet 地址 | 只读展示（如存在） |

#### 1.5a 已连接账户

| # | 测试点 | 预期结果 |
|---|---|---|
| 1.5a.1 | Google 账户 | 显示 "hello@moltcash.com" + 绿色已连接标记 |
| 1.5a.2 | X (Twitter) 账户 | 显示 "@moltcash" + 绿色已连接标记 |

#### 1.5b 钱包安全 — 助记词

| # | 测试点 | 预期结果 |
|---|---|---|
| 1.5b.1 | 默认状态 | 隐藏，显示 "Click reveal to view" |
| 1.5b.2 | 点击 "Reveal Phrase" | `showSeedMode = true`，显示 12 个单词的 4 列网格（带序号） |
| 1.5b.3 | 点击 "Copy" | `navigator.clipboard.writeText(seedWords.join(' '))` |
| 1.5b.4 | 点击 "Hide" | `showSeedMode = false`，恢复隐藏状态 |
| 1.5b.5 | 助记词内容 | apple butter crush drift eagle fossil guitar hover iron jungle karma lemon |

### 1.6 个人资料 (Portfolio — Personal Tab)

| # | 测试点 | 预期结果 |
|---|---|---|
| 1.6.1 | 头像 | 渐变色圆形 |
| 1.6.2 | Wallet 地址 | 前 6 位 + "..." + 后 4 位 |
| 1.6.3 | 无钱包时 | 显示 "Setting up wallet..." |
| 1.6.4 | 复制按钮 | `clipboard.writeText(walletAddress)` → 显示勾选图标 2 秒 |
| 1.6.5 | 加入时间 | "Joined Nov {year}" |
| 1.6.6 | 统计数据 | Net Worth ($12,450.88), Total Yield (+$340.00), Assets (4) |
| 1.6.7 | Credit Score | 850，可点击打开 credit modal |
| 1.6.8 | 时间问候 | 早上 (<12) Morning / 下午 (12-18) Afternoon / 晚上 (>18) Evening |

### 1.7 登出

| # | 测试点 | 预期结果 |
|---|---|---|
| 1.7.1 | 入口 | Portfolio 右上角红色退出图标 |
| 1.7.2 | 点击登出 | 调用 `onLogout()` |
| 1.7.3 | 登出后 | `isWalletConnected = false`，返回 Landing / Chat |

---

## 路径 2：入金 → 出金

> 用户通过法币或加密方式充值 → 查看余额 → 提现

### 2.1 打开入金/出金 Modal

| # | 测试点 | 预期结果 |
|---|---|---|
| 2.1.1 | 侧边栏 Deposit 按钮（已登录） | 派发 `loka-open-modal` detail='deposit' |
| 2.1.2 | 侧边栏 Deposit 按钮（未登录） | 打开 AuthModal |
| 2.1.3 | Portfolio Deposit 按钮 | 派发 `loka-open-modal` detail='deposit' |
| 2.1.4 | Portfolio Withdraw 按钮 | 派发 `loka-open-modal` detail='withdraw' |
| 2.1.5 | TxModal 监听 `loka-open-modal` | 打开对应模式 |
| 2.1.6 | 当 `modalAction === null` | Modal 不渲染（返回 null） |
| 2.1.7 | 打开 deposit | 标题 "Deposit" |
| 2.1.8 | 打开 withdraw | 标题 "Withdraw" |
| 2.1.9 | 点击遮罩层 | 关闭 modal（`modalAction = null`） |
| 2.1.10 | 点击关闭 (X) | 关闭 modal |
| 2.1.11 | 打开时重置状态 | 清空 amount, asset, method, provider, error |

### 2.2 资产类型切换

| # | 测试点 | 预期结果 |
|---|---|---|
| 2.2.1 | 两个切换按钮 | "🏦 Fiat (Bank/Card)" 和 "⛓️ Crypto (Web3)" |
| 2.2.2 | 点击 Fiat | `formAsset = 'USD'` |
| 2.2.3 | 点击 Crypto | `formAsset = 'USDC'` |
| 2.2.4 | 激活状态样式 | 白色背景 + 阴影 vs 灰色文字 |

### 2.3 法币入金 (Fiat Deposit)

| # | 测试点 | 预期结果 |
|---|---|---|
| 2.3.1 | 金额输入 | type=number 输入框 + 币种选择 (USD/EUR/CNY) |
| 2.3.2 | 转换显示 | `≈ {amount * 0.997} USDC` |
| 2.3.3 | 快捷金额 (USD/EUR) | $25, $50, $100, $500 |
| 2.3.4 | 快捷金额 (CNY) | ¥100, ¥500, ¥1000 |
| 2.3.5 | 点击快捷金额 | 填入 `formAmount`（去除非数字字符） |
| 2.3.6 | 默认支付方式 | 'card' |
| 2.3.7 | 支付方式选择器 | "Pay with card" 和 "Transfer from exchange" |
| 2.3.8 | 选择 exchange | `paymentMethod = 'exchange'` |
| 2.3.9 | Card Provider（仅 card 模式） | `paymentMethod === 'card'` 时可见 |
| 2.3.10 | 默认 Provider | 'coinbase' |
| 2.3.11 | Provider 选择器 | "Coinbase Onramp" 和 "Onramper (Custom)" |
| 2.3.12 | 提交按钮文字 (默认) | "Continue with Privy Onramp" |
| 2.3.13 | 提交按钮文字 (onramper) | "Continue with Onramper" |
| 2.3.14 | 提交禁用条件 | `!formAmount \|\| isSubmitting` |
| 2.3.15 | Coinbase 提交 | 调用 Privy `fundWallet()` |
| 2.3.16 | Onramper 提交 | 新窗口打开 `buy.onramper.dev` |
| 2.3.17 | 无钱包时提交 | 错误 "Please connect wallet first." |
| 2.3.18 | 无地址时提交 | 错误 "No wallet address found." |
| 2.3.19 | 提交中状态 | "Opening Privy onramp..." 或 "Opening Onramper..." |
| 2.3.20 | Privy 失败回退 | 重试 fundWallet 不带 options |

### 2.4 法币出金 (Fiat Withdraw)

| # | 测试点 | 预期结果 |
|---|---|---|
| 2.4.1 | 金额输入 | 显示 "USDC amount to withdraw" |
| 2.4.2 | 币种选择 | "Receive in" USD/EUR/CNY |
| 2.4.3 | 转换计算 | `amount * rate * 0.997`，CNY=7.1, EUR=0.92, USD=1.0 |
| 2.4.4 | 可用余额 | 显示 "12,300.00 USDC" |
| 2.4.5 | 点击余额 | 填入 `formAmount = '12300'` |
| 2.4.6 | 提交按钮 | "Submit Withdrawal" |

### 2.5 加密入金 (Crypto Deposit — USDC)

| # | 测试点 | 预期结果 |
|---|---|---|
| 2.5.1 | 未登录 | "Connect your wallet to receive USDC on Base." |
| 2.5.2 | 无地址 | "No wallet address found." |
| 2.5.3 | 已登录有地址 | 显示 QR 码 + 地址 + "Copy address" 按钮 |
| 2.5.4 | QR 码 URL | `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data={address}` |
| 2.5.5 | 地址显示 | 前 6 位加粗 + "..." + 后 4 位加粗 |
| 2.5.6 | 最低存款 | "0.5 USDC" |
| 2.5.7 | 警告信息 | "Only send USDC on Base" |
| 2.5.8 | Copy address | `navigator.clipboard.writeText(targetAddress)` |
| 2.5.9 | 网络标签 | "Base Network" |

### 2.6 加密出金 (Crypto Withdraw — USDC)

| # | 测试点 | 预期结果 |
|---|---|---|
| 2.6.1 | 金额输入 | 数字输入 + "USDC" 标签 |
| 2.6.2 | 目标地址输入 | `placeholder="Enter Web3 wallet address (0x...)"` |
| 2.6.3 | 网络标识 | "Base Network" |
| 2.6.4 | 可用余额 | 可点击填入 |
| 2.6.5 | 验证：无效金额 | "Please enter a valid amount." |
| 2.6.6 | 验证：空地址 | "Please enter destination wallet address." |
| 2.6.7 | 验证：非法以太坊地址 | "Invalid Ethereum address. Expected 0x followed by 40 hex characters." |
| 2.6.8 | 地址正则 | `/^0x[a-fA-F0-9]{40}$/` |
| 2.6.9 | 提交禁用 | `!formAmount \|\| !destinationAddress.trim() \|\| isSubmitting` |
| 2.6.10 | 提交按钮 | "Submit Withdrawal" / "Processing..." |

### 2.7 错误显示 & 钱包地址解析

| # | 测试点 | 预期结果 |
|---|---|---|
| 2.7.1 | `submitError` 存在时 | 提交按钮下方显示红色错误文字 |
| 2.7.2 | 每次提交 | 先清除之前的 error |
| 2.7.3 | 钱包地址优先级 | 优先使用 Privy 钱包 (`walletClientType === 'privy'`) |
| 2.7.4 | 降级 | 使用第一个有地址的钱包 |
| 2.7.5 | 无钱包 | 返回空字符串 |

### 2.8 查看余额 & 资产 (Portfolio Holdings)

| # | 测试点 | 预期结果 |
|---|---|---|
| 2.8.1 | 默认 Tab | "Holdings" 激活 |
| 2.8.2 | AIUSD 卡片 | 5.24% APY, $10,340.00, +$340.00, credit badge "120 pts" |
| 2.8.3 | AIUSD "Add" 按钮 | 派发 `loka-nav-swap` |
| 2.8.4 | AIUSD "Sell" 按钮 | 派发 `loka-nav-swap` |
| 2.8.5 | P/L 图表标题 | "+$340.00" |
| 2.8.6 | 时间维度切换 | 7D, 30D, 3M, ALL |
| 2.8.7 | 激活维度样式 | 白色背景 + 阴影 |
| 2.8.8 | 图表数据 | 90 天生成数据，AreaChart 绿色渐变 |
| 2.8.9 | Tooltip | 显示日期 + 金额 |
| 2.8.10 | 余额隐藏切换 | `isHidden` 切换余额显/隐 |

### 2.9 交易记录 (Portfolio Activity)

| # | 测试点 | 预期结果 |
|---|---|---|
| 2.9.1 | "Activity" Tab | 显示交易历史 |
| 2.9.2 | 记录条目 | "Daily Interest Payout" (AIUSD), "USDC Deposit", "Daily Interest Payout" (ComputeDAO) |
| 2.9.3 | 每条记录 | 标题、时间、来源、金额、类型标签 |
| 2.9.4 | 点击来源链接 | 导航到对应页面 |

### 2.10 API 数据加载

| # | 测试点 | 预期结果 |
|---|---|---|
| 2.10.1 | Holdings 加载 | 挂载时调用 `api.getHoldings()`，API 总额 > 0 时覆盖默认 balance |
| 2.10.2 | Investments 加载 | 挂载时调用 `api.getInvestments()` |
| 2.10.3 | History 加载 | 挂载时调用 `api.getHistory()` |

---

## 路径 3：聊天 → 咨询项目 → 通过聊天购买 → 语音聊天执行购买

> 用户打开 AI 聊天 → 浏览/咨询项目 → 通过聊天界面发起买卖 → 使用语音模式对话 → 完成交易

### 3.1 聊天初始状态 (Empty State)

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.1.1 | Loka AI 品牌 | 绿色 "L" 图标 + "Loka AI" 文字 |
| 3.1.2 | 输入框 | 带打字机动画 placeholder |
| 3.1.3 | placeholder 语句 | "Ask about any asset...", "Compare yields...", "Show me top performing...", "Analyze ComputeDAO...", "How much can I earn..." |
| 3.1.4 | 输入聚焦时 | placeholder 动画暂停 |
| 3.1.5 | 失焦后恢复 | 切换到下一条 placeholder |
| 3.1.6 | "Funding Projects" 区域 | 显示前 5 个 `cashFlowAssets` |
| 3.1.7 | 每个项目卡片 | 标题、分类、描述、进度条、APY、期限、投资人数 |
| 3.1.8 | 自动 Demo 登录 | 挂载时如 `!api.isAuthenticated` → 调用 `api.loginEmail('demo@loka.finance')` |

### 3.2 文字输入 & 发送

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.2.1 | 输入文字 | 更新 `inputText` |
| 3.2.2 | 按 Enter | 调用 `handleSend()` |
| 3.2.3 | 空文字按 Enter | 无反应 |
| 3.2.4 | 点击发送按钮 | 调用 `handleSend()` |
| 3.2.5 | 录音中禁用发送 | `voice.isRecording` 时发送按钮禁用 |
| 3.2.6 | 用户消息 | 添加到 `messages`，`role: 'user'` |
| 3.2.7 | 发送后 | 清空输入框 |
| 3.2.8 | 发送按钮样式 | 聚焦时绿色背景，非聚焦时 green-100 |

### 3.3 AI 流式响应

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.3.1 | 发送后 | 添加 `isStreaming: true` 的占位消息 |
| 3.3.2 | 流式方式 | SSE: `POST /api/chat/stream` |
| 3.3.3 | 解析 | `data: {content}` 行，累积 `fullContent` |
| 3.3.4 | 实时更新 | 更新最后一条 assistant 消息 |
| 3.3.5 | 完成标记 | `data: [DONE]` → 标记流式完成 |
| 3.3.6 | 降级方案 | 流式失败 → `api.sendChatMessage()` |
| 3.3.7 | 双重降级 | 全部失败 → "Sorry, failed to get a response." |
| 3.3.8 | AbortController | 中止时不显示错误 |
| 3.3.9 | 流式中禁止发送 | `isStreaming === true` 时不能发送新消息 |

### 3.4 咨询项目 — 项目卡片点击

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.4.1 | 空状态点击项目卡片 | 触发 `handleProjectClick(projectName)` |
| 3.4.2 | 添加用户消息 | "Analyze project: {projectName}" |
| 3.4.3 | 800ms 延迟后 | 添加 assistant 消息 `type: 'project_detail'` |
| 3.4.4 | 详情内容 | Background & Business Narrative, Entity Credit, Leadership, Agreement & Protections |
| 3.4.5 | 不同项目不同内容 | ComputeDAO vs Shopify 的 entity、registration、amounts 不同 |

### 3.5 咨询项目 — 顶部项目卡片

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.5.1 | 有消息时显示 | 聊天顶部显示紧凑项目卡片 |
| 3.5.2 | 卡片内容 | logo、标题、"VERIFIED" 标签、副标题 |
| 3.5.3 | 卡片统计 | APY、Raise target、Term、进度条 |
| 3.5.4 | 点击卡片（有匹配 MarketAsset） | 打开 `detailAsset` 覆盖层（真实 AssetDetail 组件） |
| 3.5.5 | 点击卡片（无匹配） | 切换 `projectCardExpanded` |

### 3.6 咨询项目 — Asset Detail 标签页

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.6.1 | Background 标签 | 公司信息、商业叙事、Leadership (Alex Chen, Sarah Li)、媒体图片 |
| 3.6.2 | Financial Health 标签 | Stripe API 监控器 (30d flow, coverage, MRR)、营收图表 (6 月 BarChart)、客户集中度、Loka AI 风险评分 (AAA, 98/100) |
| 3.6.3 | Rules 标签 | 募资机制 (3 步时间线)、成功/失败条件、资金流向图 (7 步)、关键权利 (4 项)、悬停显示解释 |

### 3.7 @Asset 选择

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.7.1 | 未选资产 | 显示 @Asset 按钮，点击导航到 Market |
| 3.7.2 | 已选资产 | 显示绿色药丸标签：资产图片 + 名称 + 关闭(X) |
| 3.7.3 | 点击资产标签 | 调用 `handleProjectClick(asset.title)` |
| 3.7.4 | 点击 X | `setSelectedAssetName(null)` |

### 3.8 通过聊天购买 — Action 菜单 (+)

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.8.1 | 点击 + 按钮 | 切换 `showActionMenu` |
| 3.8.2 | 打开时样式 | 按钮 bg-black text-white |
| 3.8.3 | 菜单选项 | "Buy Asset" 和 "Sell Asset" |
| 3.8.4 | 未选 @Asset | 警告 "Please select an asset first" |
| 3.8.5 | 按钮禁用样式 | text-gray-300, cursor-not-allowed |
| 3.8.6 | 点击 "Buy Asset"（有资产） | `setActiveForm('buy')`，关闭菜单 |
| 3.8.7 | 点击 "Sell Asset" | `setActiveForm('sell')`，关闭菜单 |

### 3.9 通过聊天购买 — 内联 Buy/Sell 表单

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.9.1 | 表单句式 | "I want to {buy/sell} [amount input] USDC of [agent name]." |
| 3.9.2 | 金额输入 | type=number, autofocus, 绿色下划线 |
| 3.9.3 | Enter 提交 | 调用 `handleInlineActionSubmit()` |
| 3.9.4 | 点击关闭 (X) | 重置 `activeForm = null, formAmount = ''` |
| 3.9.5 | 点击绿色箭头 | 提交表单 |
| 3.9.6 | 提交消息 | 创建用户消息："I want to buy 500 USDC of ComputeDAO GPU." |
| 3.9.7 | 提交后 | 重置表单并发送到 AI |
| 3.9.8 | 提交禁止 | `!formAmount \|\| isStreaming` |

### 3.10 交易确认

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.10.1 | Confirm | 添加 "Confirm" 用户消息 → 1 秒后 "Transaction executed" |
| 3.10.2 | Reject | 添加 "Reject" 用户消息，无后续 |
| 3.10.3 | 完成标记 | 消息设置 `actionCompleted: true` |

### 3.11 语音输入

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.11.1 | 点击麦克风按钮 | 调用 `voice.toggleRecording()` |
| 3.11.2 | 录音中样式 | 麦克风按钮显示紫色光环 + 脉冲指示器 |
| 3.11.3 | "Listening..." 文字 | 带动画省略号 |
| 3.11.4 | 输入框状态 | 录音中透明度为 0 (opacity-0) |
| 3.11.5 | 语音转文字 | `onTranscript` 回调更新 `inputText` |
| 3.11.6 | 录音结束 | 通过 `pendingVoiceSendRef` 自动发送消息 |
| 3.11.7 | 再次点击 | 停止录音 |

### 3.12 语音模式 (Voice Mode)

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.12.1 | 语音模式状态栏 | `voice.voiceMode === true` 时显示 |
| 3.12.2 | 状态栏显示 | 当前状态：Listening / Speaking / Active |
| 3.12.3 | "Exit" 按钮 | 调用 `voice.toggleVoiceMode()` |
| 3.12.4 | AI 响应自动播报 | 语音模式下 `voice.speak(fullContent)` |
| 3.12.5 | TTS 播放 | `handleSpeak(text)` 切换播放/停止 |
| 3.12.6 | 已在播放 | 停止当前语音 |
| 3.12.7 | 未播放 | 调用 `voice.speak(text)` 开始播报 |

### 3.13 Asset 详情点击

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.13.1 | 调用 `handleAssetClick(assetName)` | 添加用户消息 "View {assetName} details" |
| 3.13.2 | AIUSD 资产 | 显示摘要：APY 12.4%, TVL $42.5M, risk Low |
| 3.13.3 | 非 AIUSD | 显示 `hot_assets` 数组 4 项 |

### 3.14 聊天历史侧边栏

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.14.1 | 默认状态 | 收起 (`leftSidebarCollapsed = true`) |
| 3.14.2 | 收起时 | 显示切换按钮 (汉堡菜单图标) |
| 3.14.3 | 点击切换 | `leftSidebarCollapsed = false` |
| 3.14.4 | 历史列表 | 7 个 mock sessions，含标题和日期 |
| 3.14.5 | "New Chat" 按钮 | 清空消息 + 收起侧边栏 |
| 3.14.6 | 点击历史记录 | 通过 `handleProjectClick` 加载该会话的项目 |
| 3.14.7 | 收起按钮 | 侧边栏标题中的 chevron 图标 |

### 3.15 Credit Points Tooltip

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.15.1 | 悬停 credit 图标 | 显示赚取策略弹窗 |
| 3.15.2 | 三种策略 | Early Bird (+20 pts), High-Volume (+50 pts), Loyalty Stream (+10 pts) |

### 3.16 SessionStorage 集成

| # | 测试点 | 预期结果 |
|---|---|---|
| 3.16.1 | `pending_chat_project` | 触发 `handleProjectClick` 并移除 storage |
| 3.16.2 | `pending_chat_action` | 设置 activeForm (buy/sell) 或 formAsset (deposit/withdraw) |
| 3.16.3 | `pending_chat_agent` | 设置 activeAgent 和 selectedAssetName |

---

## 路径 4：投资全流程

> 查找项目 → 查看详情 → 投资 → 加入群组聊天 → 管理收款/还款 → 二级市场交易

### 4.1 Market 列表页

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.1.1 | "Back to Chat" 按钮 | 派发 `loka-nav-chat` |
| 4.1.2 | 标题 | "Cash Flow Market." |
| 4.1.3 | 副标题 | "Invest in the future cash flow of verified businesses." |
| 4.1.4 | 筛选标签 | All, Fundraising, Funded, Failed |
| 4.1.5 | 默认筛选 | 'All' |
| 4.1.6 | "Apply" 按钮 | 派发 `loka-nav-groups` |
| 4.1.7 | 数据来源 | 挂载时从 API 获取，失败降级用 MOCK_ASSETS（7项） |

### 4.2 筛选功能

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.2.1 | filter = 'All' | 显示全部资产 |
| 4.2.2 | filter = 'Fundraising' | 仅显示 Fundraising 状态 |
| 4.2.3 | filter = 'Funded' | 仅显示 Funded/Sold Out |
| 4.2.4 | filter = 'Failed' | 仅显示 Failed |
| 4.2.5 | 激活标签样式 | 黑色背景白色文字 |

### 4.3 资产卡片 (Asset Card)

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.3.1 | 封面图 | hover 缩放动画 (scale-110, duration 1000) |
| 4.3.2 | 状态标签 | 🔥 Fundraising / ✅ Funded / 🔒 Failed |
| 4.3.3 | 发行方信息 | logo、名称、badge (1000+ / 500+ / 200+) |
| 4.3.4 | 标题和副标题 | 正常显示 |
| 4.3.5 | 统计网格 | Target ($Xk), APY (X%), Term (Xd) |
| 4.3.6 | 进度条 | `(raisedAmount / targetAmount) * 100` |
| 4.3.7 | 底部 | 已筹金额、百分比、投资人数 |
| 4.3.8 | 点击卡片 | `setSelectedAsset(asset)` → 打开详情 |

### 4.4 资产详情页 (Asset Detail)

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.4.1 | 返回按钮 | "Cash Flow Market" → `setSelectedAsset(null)` |
| 4.4.2 | 标题区域 | logo、标题、副标题、Share 按钮、"Add to Chat" 按钮 |
| 4.4.3 | 进度区域 | 募资进度条、已筹百分比、当前金额、投资人数 |
| 4.4.4 | 指标网格 | All-time revenue, MRR (verified), Issuer Profile, Yield Rules (APY) |
| 4.4.5 | 三个标签页 | Background, Financial Health, Rules |

### 4.5 投资 (Invest Flow)

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.5.1 | 投资输入 | Fundraising/Ending Soon 项目显示投资金额输入框 |
| 4.5.2 | 空金额验证 | "Please enter a valid amount" |
| 4.5.3 | 低于下限 | "Minimum investment is $10" |
| 4.5.4 | 超过上限 | "Max available: $X" |
| 4.5.5 | 提交 | 调用 `api.investInProject(asset.id, amount)` |
| 4.5.6 | 成功 | "Successfully invested $X!" + 更新资产数据 |
| 4.5.7 | 失败 | 显示 `investError` |
| 4.5.8 | loading 状态 | `investing` 控制按钮禁用/loading |

### 4.6 撤回投资 (Revoke)

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.6.1 | 确认对话框 | "Are you sure you want to revoke your investment?" |
| 4.6.2 | 取消 | 无操作 |
| 4.6.3 | 确认 | 调用 `api.revokeInvestment(asset.id)` |
| 4.6.4 | 成功 | "Refunded $X" + 更新资产 |
| 4.6.5 | 失败 | 显示 `investError` |

### 4.7 Asset Detail — STORY 标签

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.7.1 | 发行方资料 | logo、名称、verified badge、社交链接 (Twitter, LinkedIn, GitHub) |
| 4.7.2 | 领导团队 | Alex Chen (CEO), Sarah Li (CTO) 及简介 |
| 4.7.3 | 商业叙事 | 描述 + 资金用途 |
| 4.7.4 | Enterprise Insights | Value Proposition, Target Audience, Problem Solved, Business Details |
| 4.7.5 | 标签 | AI, Marketplace, Productivity 等 |

### 4.8 Asset Detail — AGREEMENT 标签

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.8.1 | Campaign Rules | 3 步时间线（Fundraising → Success → Lock & Deploy） |
| 4.8.2 | 成功/失败条件 | 可视化卡片 |
| 4.8.3 | Fund Flow | 7 步图（Investors → Loka SPV → ... → Auto-Repay） |
| 4.8.4 | Key Rights | 4 张卡片（Seniority, Structure, Collateral, Smart Escrow） |
| 4.8.5 | 悬停权利卡片 | 显示通俗英语解释 |
| 4.8.6 | Verifiable Documents | 4 个 PDF（Loan Agreement, UCC-1, Legal Compliance, SPV Org） |

### 4.9 Asset Detail — FINANCIALS 标签

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.9.1 | 营收图表 | AreaChart 月度营收数据 |
| 4.9.2 | Stripe Connect API Monitor | 30d Gross Flow, Coverage Ratio, MRR |
| 4.9.3 | 还款进度（仅 funded 项目） | 彩色条形分段 |
| 4.9.4 | 分段颜色 | 绿=Paid, 琥珀=Due, 红=Overdue, 灰=Upcoming |
| 4.9.5 | 悬停分段 | tooltip 显示月份、到期日、金额、状态 |
| 4.9.6 | 逾期计数 | 红色 badge 显示 |
| 4.9.7 | 加载状态 | 还款数据 loading |
| 4.9.8 | API 调用 | `api.getRepaymentSchedule(asset.id)` |

### 4.10 Market → Chat 联动 ("Add to Chat")

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.10.1 | 点击 "Add to Chat" | 设置 `sessionStorage.pending_chat_agent = asset.title` |
| 4.10.2 | 导航 | 派发 `loka-nav-chat` + `loka-set-chat-agent` |
| 4.10.3 | Chat 接收 | 设置 `activeAgent` + `selectedAssetName` |
| 4.10.4 | 清空消息 | 为新上下文清空 messages |

### 4.11 群组聊天 (Groups)

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.11.1 | 3 个群组 | Project Verification & Setup (5人), ComputeDAO - GPU Expansion (7人), Shopify Merchant Cluster X (5人) |
| 4.11.2 | 群组列表 | 项目名称、状态、未读数、最后活动时间 |
| 4.11.3 | 未读标记 | unread > 0 时显示数量 badge |
| 4.11.4 | 点击群组 | `setSelectedGroup(group.id)` |
| 4.11.5 | 激活群组样式 | border-black/10 高亮 |

### 4.12 群组消息

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.12.1 | 消息展示 | 发送者名称、角色 badge、头像、时间戳 |
| 4.12.2 | 角色 badge | Issuer (蓝), AI Agent (紫), Investor (绿) |
| 4.12.3 | 自己的消息 | 右对齐 + 黑色背景 (`senderId === 'u3'`) |
| 4.12.4 | Agent 消息 | 紫/蓝渐变背景 |
| 4.12.5 | Issuer 消息 | 蓝色背景 |
| 4.12.6 | Markdown | `**bold**` 正常渲染 |
| 4.12.7 | 自动滚动 | 新消息自动滚到底部 |

### 4.13 群组发送消息

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.13.1 | 输入文字 | 更新 `inputValue` |
| 4.13.2 | 发送按钮 / Enter | 创建消息 `senderId: 'u3'`, `role: 'investor'` |
| 4.13.3 | 空输入 | 不发送 |
| 4.13.4 | Agent 自动回复 | 发送后 1200ms 延迟 |
| 4.13.5 | 发送后 | 清空输入 + 清除图片预览 |

### 4.14 Agent 自动回复规则 (非申请群组)

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.14.1 | "status" 或 "update" | 项目状态更新 |
| 4.14.2 | "risk" 或 "safe" | 风险评估 (LOW) |
| 4.14.3 | "revenue" 或 "earning" | 营收更新 ($12,400) |
| 4.14.4 | "when" 或 "payout" | 下次付款日期 (March 15, 2026) |
| 4.14.5 | 默认 | "monitoring 24/7" 通用回复 |

### 4.15 图片上传

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.15.1 | 点击图片按钮 | 打开文件选择 |
| 4.15.2 | 选择图片 | 读取 DataURL → 显示预览 |
| 4.15.3 | 文件类型 | 仅 `image/*` |
| 4.15.4 | 发送含图片消息 | 图片包含在消息中 |
| 4.15.5 | 发送后 | 清除预览 + 重置 file input |

### 4.16 投票系统 (Poll)

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.16.1 | 点击投票按钮 | 打开投票 modal |
| 4.16.2 | Modal 内容 | 问题输入 + 选项输入 (最少 2 个) |
| 4.16.3 | 添加选项 | 可增加更多投票选项 |
| 4.16.4 | 持续时间 | 默认 '1d' |
| 4.16.5 | 验证 | 需要问题 + 至少 2 个非空选项 |
| 4.16.6 | 提交 | 创建投票消息 |
| 4.16.7 | 投票显示 | 选项、票数、百分比 |
| 4.16.8 | 点击选项 | `handleVote(msgId, optionId)`（每人一票） |
| 4.16.9 | 投票后 | 显示百分比，领先选项显示 🏆 |
| 4.16.10 | 已投票 | 选项禁用 |
| 4.16.11 | 我的投票 | 蓝色边框高亮 |
| 4.16.12 | Mock 投票 | ComputeDAO 群组: "H100 vs A100 GPUs"，3 个选项 |

### 4.17 成员面板

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.17.1 | 切换成员面板 | 桌面端默认可见 |
| 4.17.2 | 成员列表 | 头像、名称、角色 badge |
| 4.17.3 | 在线指示器 | 绿色/灰色圆点 |
| 4.17.4 | 投资者信用分 | 显示分数 |
| 4.17.5 | "Add Agent" 按钮 | 打开 Agent 商城 modal |

### 4.18 Agent 商城

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.18.1 | Modal 内容 | 18 个 Agent，6 个分类 |
| 4.18.2 | 搜索 | 按名称/描述过滤 |
| 4.18.3 | 分类筛选 | 6 个分类标签 |
| 4.18.4 | Agent 卡片 | 图标、名称、描述、渐变色 |
| 4.18.5 | "Add to Group" | 添加到 `addedAgents[groupId]` |
| 4.18.6 | 已添加状态 | 显示 "Added" |

### 4.19 Portfolio 投资持仓

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.19.1 | ComputeDAO 卡片 | 15.5% APY · 60d, $5,000.00, +$387.50, "Funded" badge, "65 pts" |
| 4.19.2 | 点击 ComputeDAO | 派发 `loka-nav-market` → 100ms 后 `loka-open-asset` |
| 4.19.3 | Market 接收 | `loka-open-asset` → 打开匹配的资产详情 |

### 4.20 二级市场交易 (Trade)

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.20.1 | 标题 | "Marketplace" |
| 4.20.2 | 副标题 | "Trade shares of funded projects on the open market." |
| 4.20.3 | 状态筛选 | Listed (数量), Sold (数量) |
| 4.20.4 | 默认筛选 | 'Listed' |
| 4.20.5 | 项目下拉 | "All Projects" + 唯一项目名列表 |
| 4.20.6 | 选择下拉项 | 按 projectId 过滤 |
| 4.20.7 | 空状态 | "No orders found" + 上下文消息 |

### 4.21 交易订单卡片

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.21.1 | 封面图 + 状态标签 | Listed = 绿色点, Sold = 灰色 |
| 4.21.2 | Credit badge | +25/+15/+10 (按发行方) |
| 4.21.3 | 卖家地址 | 显示 |
| 4.21.4 | 项目信息 | issuer logo + name |
| 4.21.5 | 统计 | LIST PRICE, TOTAL, EST. RETURN |
| 4.21.6 | Listed 订单 | 绿色 "BUY NOW" 按钮 + 总额 |
| 4.21.7 | Sold 订单 | 买家地址 + 卖出日期，灰色显示 |
| 4.21.8 | 点击 Listed 卡片 | 打开 BuyModal |
| 4.21.9 | Sold 卡片样式 | 透明度 0.75 + 灰度图片 |

### 4.22 购买 Modal (BuyModal)

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.22.1 | 标题 | "PURCHASE ORDER" + 关闭按钮 |
| 4.22.2 | 订单详情 | 项目标题、卖家、issuer logo |
| 4.22.3 | 摘要 | Shares, Price/share, Original price, Remaining term, Expected return, Total cost |
| 4.22.4 | 勾选框 | "I understand this is a secondary market purchase..." |
| 4.22.5 | 确认按钮禁用 | 未勾选时不可点 |
| 4.22.6 | 按钮文字 | "CONFIRM PURCHASE · ${totalValue}" |
| 4.22.7 | 确认 | 调用 `api.buyTradeOrder(order.id)` |
| 4.22.8 | Processing 状态 | spinner + "PROCESSING..." |
| 4.22.9 | 成功状态 | ✓ + "Purchase Complete!" + expected return |
| 4.22.10 | 成功后 "DONE" | 关闭 modal |
| 4.22.11 | 错误状态 | 红色错误框 |
| 4.22.12 | 购买后 | `api.getTradeOrders()` 刷新列表 |
| 4.22.13 | 点击遮罩层 | 关闭 modal |

### 4.23 筛选联动

| # | 测试点 | 预期结果 |
|---|---|---|
| 4.23.1 | 状态计数 | 根据实际订单数据更新 |
| 4.23.2 | 项目下拉 | 从唯一项目列表自动填充 |
| 4.23.3 | 组合筛选 | 状态 + 项目同时生效 |

---

## 路径 5：申请项目

> 企业用户通过 6 步流程认证公司 → 提交项目 → 项目上线 Market

### 5.1 进入申请流程

| # | 测试点 | 预期结果 |
|---|---|---|
| 5.1.1 | Market "Apply" 按钮 | 派发 `loka-nav-groups` |
| 5.1.2 | Portfolio Enterprise Tab "New Project" 按钮 | 派发 `loka-nav-groups` |
| 5.1.3 | 申请群组 | 第一个群组 ID 为 `app_001`（Project Verification & Setup） |
| 5.1.4 | 群组成员 | 5 人（You + 4 个 AI Agent） |

### 5.2 Phase 1 — 公司认证 (Steps 0-2)

#### Step 0: Legal Entity Certification

| # | 测试点 | 预期结果 |
|---|---|---|
| 5.2.1 | 触发 | 步骤 0 "Legal Entity Certification" → 弹出实体表单 |
| 5.2.2 | 表单字段 | Company Name*, Country*, Registration No.*, Address*（全部必填） |
| 5.2.3 | 文件上传区 | Business License + Address Proof |
| 5.2.4 | 提交禁用 | 4 个必填字段未全部填写时禁用 |
| 5.2.5 | 提交 | 用户消息含公司数据 + KYC/AML Verifier 确认 |
| 5.2.6 | 步骤推进 | `applicationStep → 1` |

#### Step 1: KYC Identity Verification

| # | 测试点 | 预期结果 |
|---|---|---|
| 5.2.7 | 展示 | KYC 链接卡片 + 外部链接 (`kyc.loka.finance`) |
| 5.2.8 | 功能 | 提示跳转至 KYC 验证 |

#### Step 2: Review & Mint Issuer SBT

| # | 测试点 | 预期结果 |
|---|---|---|
| 5.2.9 | 展示 | 提示审核和 SBT 铸造流程 |
| 5.2.10 | Phase 1 完成 | "Company Verified! Phase 2 is now unlocked." |

### 5.3 Phase 2 — 项目申请 (Steps 3-5)

#### Step 3: Project Details & Financing Terms

| # | 测试点 | 预期结果 |
|---|---|---|
| 5.3.1 | 展示 | 提示输入项目信息 + 融资参数 |

#### Step 4: Revenue Account Verification

| # | 测试点 | 预期结果 |
|---|---|---|
| 5.3.2 | 展示 | 连接 Web2/Web3 收入账户 |

#### Step 5: Collateral & Cash Flow Takeover

| # | 测试点 | 预期结果 |
|---|---|---|
| 5.3.3 | 展示 | 配置抵押品 + 智能合约 |
| 5.3.4 | 全部完成 | "All steps completed! Your project is now live on the Market." |

### 5.4 Agent 自动回复规则（申请群组）

| # | 测试点 | 预期结果 |
|---|---|---|
| 5.4.1 | "license" / "upload" | 营业执照已收到，进入 UBO 检查 |
| 5.4.2 | "kyc" / "passport" / "shareholder" | KYC 通过，铸造 Verified Issuer SBT |
| 5.4.3 | "amount" / "target" / "apy" | 项目参数已记录，请求收入审核 |
| 5.4.4 | "connect" / "stripe" / "paypal" | 收入 API 已连接，请求抵押品 |
| 5.4.5 | "collateral" / "confirm" / "asset" | 申请完成，项目已上线 |
| 5.4.6 | 默认 | 引导完成各步骤 |

### 5.5 进度卡片 (Progress Card)

| # | 测试点 | 预期结果 |
|---|---|---|
| 5.5.1 | 标题 | 当前 Phase 名称 + 步骤计数 (X/6) |
| 5.5.2 | 点击标题 | 折叠/展开进度卡片 |
| 5.5.3 | 已完成步骤 | 绿色勾选标记 |
| 5.5.4 | 当前步骤 | 紫色边框 + "Start" 按钮 |
| 5.5.5 | 锁定步骤 | opacity-50 + 锁图标 |
| 5.5.6 | Phase 2 预览 | Phase 1 期间锁定显示 |

### 5.6 Enterprise Tab (Portfolio)

| # | 测试点 | 预期结果 |
|---|---|---|
| 5.6.1 | Tab 切换 | Personal / Enterprise |
| 5.6.2 | 公司信息 | "Loka Technologies Pte Ltd", Singapore, 注册号, 地址 |
| 5.6.3 | 认证标签 | "Verified Issuer" badge, SBT #1024 Active, KYC Verified, 2 Docs |
| 5.6.4 | 已提交项目 (3个) | ComputeDAO: Fundraising $375k/75%; Shopify: Under Review; Vercel: Completed fully repaid |
| 5.6.5 | 点击项目 | 派发 `loka-nav-market` → `loka-open-asset` (100ms delay) |
| 5.6.6 | "New Project" 按钮 | 派发 `loka-nav-groups` |
| 5.6.7 | 平台扣款区域 | 从项目收入自动扣款记录 |
| 5.6.8 | 空扣款 | "No deduction records yet" |
| 5.6.9 | 有扣款 | 显示项目名称、扣款期数、总金额 |
| 5.6.10 | 逾期警告 | 红色横幅 + 脉冲指示器 |

---

## 附录 A：API 接口层

### ApiClient 配置

| 配置项 | 值 |
|---|---|
| Base URL | `https://nftkashai.online/lokacash/api` |
| Token 存储 | `sessionStorage` key `loka_token` |
| Auth 头 | `Authorization: Bearer {token}` |

### 接口清单

| 方法 | 路径 | 参数 | 用途 |
|---|---|---|---|
| POST | `/auth/login/email` | `{ email, name? }` | 邮箱登录 |
| POST | `/auth/login/oauth` | `{ provider, providerId, email?, name? }` | OAuth 登录 |
| GET | `/auth/me` | — | 获取当前用户 |
| POST | `/auth/accept-risk` | — | 接受风险提示 |
| GET | `/projects` | `?category=&status=` | 项目列表 |
| GET | `/projects/:id` | — | 项目详情 |
| POST | `/projects/:id/invest` | `{ amount }` | 投资 |
| DELETE | `/projects/:id/revoke-investment` | — | 撤回投资 |
| GET | `/treasury/stats` | — | 金库统计 |
| GET | `/portfolio/holdings` | — | 持仓 |
| GET | `/portfolio/history` | — | 历史记录 |
| GET | `/portfolio/investments` | — | 投资记录 |
| GET | `/trade` | `?projectId=&status=` | 交易订单 |
| POST | `/trade` | `{ projectId, listPrice, shares }` | 创建订单 |
| POST | `/trade/:id/buy` | — | 购买订单 |
| POST | `/portfolio/mint` | `{ amount }` | 铸造 |
| POST | `/portfolio/redeem` | `{ amount }` | 赎回 |
| GET | `/chat/history` | — | 聊天历史 |
| POST | `/chat/send` | `{ content, agentId? }` | 发送消息 |
| DELETE | `/chat/history` | — | 清空聊天 |
| GET | `/groups` | — | 群组列表 |
| GET | `/groups/:id/messages` | — | 群组消息 |
| POST | `/groups/:id/messages` | `{ content }` | 发送群组消息 |
| GET | `/users/profile` | — | 用户资料 |
| PATCH | `/users/profile` | `{ name?, avatar?, walletAddress? }` | 更新资料 |
| GET | `/credit/score` | — | 信用分 |
| GET | `/credit/history` | — | 信用历史 |
| GET | `/credit/events` | — | 信用事件 |
| POST | `/apply/enterprise/submit` | `{ companyName, country, registrationNo? }` | 提交企业认证 |
| GET | `/apply/enterprise` | — | 企业申请列表 |
| POST | `/apply/enterprise/:id/advance` | — | 推进认证 |
| POST | `/apply/projects/apply` | `{ enterpriseId, projectName, ... }` | 项目申请 |
| GET | `/apply/projects/applications` | — | 项目申请列表 |
| GET | `/governance/proposals` | — | 治理提案 |
| POST | `/governance/proposals` | `{ title, description, category, durationDays? }` | 创建提案 |
| POST | `/governance/proposals/:id/vote` | `{ vote: 'for'\|'against' }` | 投票 |
| GET | `/repayment/:projectId/schedule` | — | 还款计划 |
| GET | `/liquidation/:projectId/collateral` | — | 抵押品 |
| GET | `/liquidation/:projectId/events` | — | 清算事件 |
| GET | `/liquidation/:projectId/summary` | — | 清算摘要 |

### 核心行为测试

| # | 测试点 | 预期结果 |
|---|---|---|
| A.1 | `setToken(token)` | 存入 sessionStorage |
| A.2 | `clearToken()` | 从 sessionStorage 移除 |
| A.3 | `isAuthenticated` | 返回 `Boolean(this.token)` |
| A.4 | 带 token 请求 | 包含 `Authorization: Bearer` 头 |
| A.5 | 无 token 请求 | 不包含 Authorization 头 |
| A.6 | 非 OK 响应 | 抛出 Error 含服务端错误消息 |
| A.7 | 非 JSON 错误响应 | 抛出 "Request failed" |
| A.8 | Login 接口 | 自动从响应设置 token |
| A.9 | 所有路径 | 通过 `encodeURIComponent` URL 编码 ID |
| A.10 | 查询字符串 | 正确构建 filter 参数 |
| A.11 | 单例导出 | `api` 实例全局共享 |

---

## 附录 B：语音系统 (useVoice)

### 状态

| 变量 | 类型 | 用途 |
|---|---|---|
| `isRecording` | boolean | 麦克风活跃 |
| `isSpeaking` | boolean | TTS 正在播放 |
| `voiceMode` | boolean | 连续语音对话 |
| `useFallback` | boolean | 使用 MediaRecorder 替代 Web Speech |

### 选项

| 选项 | 类型 | 默认值 | 用途 |
|---|---|---|---|
| `language` | string | `'en-US'` | ASR/TTS 语言 |
| `onTranscript` | `(text) => void` | — | 实时转录回调 |
| `onRecordingEnd` | `(text) => void` | — | 最终转录回调 |
| `autoSendOnSilence` | boolean | `true` | 静默 2 秒自动停止 |

### B.1 Web Speech API 路径

| # | 测试点 | 预期结果 |
|---|---|---|
| B.1.1 | 浏览器支持时 | 使用 `react-speech-recognition` |
| B.1.2 | 开始录音 | `SpeechRecognition.startListening({ continuous: true, language })` |
| B.1.3 | 停止录音 | `SpeechRecognition.stopListening()` |
| B.1.4 | 实时转录 | 触发 `onTranscript` 回调 |
| B.1.5 | 静默自动发送 | clearTimeout + 2 秒后触发 |
| B.1.6 | 监听停止 | 有 transcript 时调用 `onRecordingEnd` |

### B.2 MediaRecorder 降级路径

| # | 测试点 | 预期结果 |
|---|---|---|
| B.2.1 | 触发条件 | `!browserSupportsSpeechRecognition` |
| B.2.2 | 请求麦克风 | `navigator.mediaDevices.getUserMedia({ audio: true })` |
| B.2.3 | 编码格式 | `audio/webm;codecs=opus` 或 `audio/mp4` |
| B.2.4 | 数据采集间隔 | 250ms chunks |
| B.2.5 | 停止后 | 创建 Blob → 发送到后端 Whisper 转录 |
| B.2.6 | 过短音频 | < 1000 bytes 忽略 |
| B.2.7 | 麦克风拒绝 | `alert('Microphone access is required')` |

### B.3 后端转录

| # | 测试点 | 预期结果 |
|---|---|---|
| B.3.1 | 请求格式 | FormData 含 `audio` 文件和 `language` |
| B.3.2 | 认证头 | 如有 token 则带 `Authorization: Bearer` |
| B.3.3 | 响应 | 返回 `result.text` |
| B.3.4 | 错误 | 非 OK 响应抛出异常 |

### B.4 TTS (文字转语音)

| # | 测试点 | 预期结果 |
|---|---|---|
| B.4.1 | `speak(text)` | 取消当前 → 创建 SpeechSynthesisUtterance |
| B.4.2 | 语音选择优先级 | Google voice → remote voice → 任意匹配 |
| B.4.3 | 状态 | 开始 `isSpeaking = true`，结束 `false` |
| B.4.4 | 语音模式 | TTS 结束后 300ms 自动重启录音 |
| B.4.5 | `stopSpeaking()` | `speechSynthesis.cancel()` |

### B.5 语音模式 (连续对话)

| # | 测试点 | 预期结果 |
|---|---|---|
| B.5.1 | `toggleVoiceMode()` | 启用/禁用切换 |
| B.5.2 | 启用 | `voiceMode = true` + `startRecording()` |
| B.5.3 | 禁用 | `voiceMode = false` + 停止录音 + 停止播放 |
| B.5.4 | 完整流程 | 监听 → 发送 → AI 回复 → TTS 播报 → 自动重新监听 |

### B.6 返回值

| # | 测试点 | 预期结果 |
|---|---|---|
| B.6.1 | `isRecording` | boolean |
| B.6.2 | `transcript` | fallback 时为空，Web Speech 时为转录文本 |
| B.6.3 | `listening` | fallback 时为 isRecording，Web Speech 时为 listening 状态 |
| B.6.4 | `isSpeaking`, `speak`, `stopSpeaking` | TTS 控制 |
| B.6.5 | `voiceMode`, `toggleVoiceMode` | 语音模式控制 |
| B.6.6 | `startRecording`, `stopRecording`, `toggleRecording` | 录音控制 |
| B.6.7 | `hasSpeechRecognition`, `hasSpeechSynthesis`, `useFallback` | 浏览器能力检测 |

### B.7 清理

| # | 测试点 | 预期结果 |
|---|---|---|
| B.7.1 | 卸载时 | 清除 silence timer |
| B.7.2 | 卸载时 | 停止 MediaRecorder |
| B.7.3 | 卸载时 | 取消 speechSynthesis |

---

## 附录 C：类型定义 & Mock 数据

### 核心类型

```typescript
// 页面枚举
enum Page { LANDING, DASHBOARD, SWAP, MARKET, PORTFOLIO, AGENT, CHAT, GROUPS, SETTINGS, TRADE }

// MarketAsset
interface MarketAsset {
  id, title, subtitle,
  category: 'Compute' | 'SaaS' | 'E-commerce',
  issuer, faceValue, askPrice, apy, durationDays, creditScore,
  status: 'Fundraising' | 'Ending Soon' | 'Sold Out' | 'Failed' | 'Funded',
  targetAmount, raisedAmount, backersCount, remainingCap, coverageRatio,
  verifiedSource, description, useOfFunds, monthlyRevenue[],
  coverImage, issuerLogo
}

// TradeOrder
interface TradeOrder {
  id, projectId, projectTitle, projectCoverImage, projectIssuer,
  projectIssuerLogo, projectApy, projectDurationDays, seller,
  listPrice, originalPrice, shares, totalValue, expectedReturn,
  expectedYield, listedAt,
  status: 'Listed' | 'Sold',
  buyer?, soldAt?
}

// RepaymentSchedule
interface RepaymentSchedule {
  id, projectId, periodNumber, dueDate,
  principalDue, interestDue, totalDue, paidAmount,
  status: 'upcoming' | 'due' | 'paid' | 'overdue' | 'defaulted',
  paidAt, createdAt
}

// LiquidationSummary
interface LiquidationSummary {
  outstandingDebt, totalCollateralValue, totalRecoverable,
  recoveryRate, investorCount, totalInvested,
  waterfall[], collaterals[]
}

// HistoryItem
interface HistoryItem {
  timestamp,
  type: 'MINT' | 'REDEEM' | 'INTEREST' | 'DEPOSIT',
  amount, asset,
  status: 'COMPLETED' | 'PENDING' | 'QUEUED'
}
```

### Mock 数据：Market Assets (7 项)

| 项目 | 分类 | 状态 | APY | 目标 | 已筹 | 投资人 |
|---|---|---|---|---|---|---|
| AI Agent Marketplace | SaaS | Fundraising | 18.5% | $500k | $105k | 4 |
| Climapp.io Utility | SaaS | Fundraising | 14.2% | $300k | $6k | 2 |
| Market Maker AI | SaaS | Funded | 22.0% | $800k | $760k | 124 |
| MEV Searcher Agent | Compute | Fundraising | 25.5% | $400k | $160k | 18 |
| Copy Trading AI | SaaS | Fundraising | 16.8% | $350k | $273k | 56 |
| Cloudflare Capacity | Compute | Fundraising | 12.0% | $500k | $350k | 42 |
| DigitalOcean Tier | Compute | Fundraising | 14.0% | $400k | $240k | 37 |

### Mock 数据：Trade Orders (6 项)

| ID | 项目 | 价格 | 份额 | 状态 | 总额 |
|---|---|---|---|---|---|
| T001 | ComputeDAO #4 | $102.50 | 50 | Listed | $5,125 |
| T002 | ComputeDAO #4 | $99.80 | 20 | Listed | $1,996 |
| T003 | ComputeDAO #4 | $98.00 | 100 | Sold | $9,800 |
| T004 | Vercel Enterprise Flow | $980.00 | 5 | Listed | $4,900 |
| T005 | Shopify Merchant X | $492.00 | 10 | Sold | $4,920 |
| T006 | Vercel Enterprise Flow | $975.00 | 15 | Listed | $14,625 |

### Mock 数据：Chat Sessions (7 项)

| 标题 | 时间 |
|---|---|
| Analyze ComputeDAO GPU | Today |
| Buy AI Agent Marketplace | Today |
| Market Maker AI yield query | Yesterday |
| Compare pool performance | Yesterday |
| MEV Searcher risk analysis | Mar 7 |
| Portfolio rebalance strategy | Mar 6 |
| Shopify Merchant Cluster X | Mar 5 |

### Mock 数据：Chat cashFlowAssets (10 项)

| 项目 | 分类 | APY | 进度 | 期限 | 投资人 |
|---|---|---|---|---|---|
| AI Agent Marketplace | Platform | 18.5% | 21% | 30 Days | 4 |
| Climapp.io Utility | Software | 14.2% | 2% | 90 Days | 2 |
| Market Maker AI | Liquidity | 22.0% | 95% | 120 Days | 124 |
| MEV Searcher Agent | Infrastructure | 25.5% | 40% | 60 Days | 18 |
| Copy Trading AI | Social Trading | 16.8% | 78% | 45 Days | 56 |
| AWS Cloud Note | Infrastructure | 12.0% | 50% | 30 Days | 23 |
| Stripe Escrow Pool | DeFi Data | 11.5% | 90% | 30 Days | 89 |
| Cloudflare Capacity | Infrastructure | 12.0% | 70% | 30 Days | 42 |
| Amazon FBA Sellers | E-commerce | 15.0% | 85% | 30 Days | 115 |
| DigitalOcean Tier | Infrastructure | 14.0% | 60% | 30 Days | 37 |

### Mock 数据：Groups (3 个)

| ID | 名称 | 成员数 | 说明 |
|---|---|---|---|
| app_001 | Project Verification & Setup | 5 | You + 4 agents |
| g1 | ComputeDAO - GPU Expansion | 7 | 2 issuers + 4 investors + 1 agent |
| g2 | Shopify Merchant Cluster X | 5 | 1 issuer + 3 investors + 1 agent |

### Mock 数据：Groups Agent 商城 (18 个)

| 分类 | 数量 | Agent 名称 |
|---|---|---|
| Risk Management | 3 | Risk Assessor, Portfolio Risk Monitor, Fraud Detector |
| Investment Analysis | 4 | Yield Optimizer, Market Analyst, Fundamental Analyst, Arbitrage Scanner |
| Operations | 3 | Treasury Manager, Milestone Tracker, Report Generator |
| Compliance & Legal | 3 | KYC/AML Verifier, Regulatory Monitor, Smart Contract Auditor |
| DeFi & On-chain | 3 | Liquidity Monitor, Gas Optimizer, Bridge Monitor |
| Social & Community | 2 | Sentiment Analyzer, Governance Assistant |

### 外部依赖

| 依赖 | 用途 |
|---|---|
| `@privy-io/react-auth` | Auth (usePrivy, useLogout, useLoginWithOAuth, useLoginWithEmail, useFundWallet, useWallets) |
| `react-speech-recognition` | Web Speech API 封装 |
| `recharts` | 图表 (AreaChart, BarChart, ResponsiveContainer) |
| `sessionStorage.loka_token` | JWT token 存储 |
| `localStorage.loka_risk_accepted` | 风险提示已接受标记 |
| `VITE_ONRAMPER_API_KEY` | Onramper API Key (环境变量) |

---

## 测试用例统计

| 路径/附录 | 用例数 |
|---|---|
| 路径 1：登录、账户管理、登出 | ~55 |
| 路径 2：入金 → 出金 | ~50 |
| 路径 3：聊天 → 购买 → 语音 | ~65 |
| 路径 4：投资全流程 | ~85 |
| 路径 5：申请项目 | ~30 |
| 附录 A：API 接口层 | ~51 |
| 附录 B：语音系统 | ~30 |
| **合计** | **~366** |
