🪙 A. Crypto 主线（web3_token_analysis + web_research）
测试问题	想验证什么	期望看到
BTC 现在多空怎么选	基础 crypto 流	TokenCard + price/funding/OI 表 + 多空建议
SOL 链上情况和最近舆论	链上 + 情绪	OnChain card + News sentiment card + X 帖子引用
SAHARA 这个项目怎么样	小币种解析	Token resolution + Project profile + 谨慎结论
BTC vs ETH vs SOL 谁更值得开多	多代币并行	3 个 TokenCard 并排 + 横向对比表
PEPE 这种 memecoin 还能追吗	高风险币	应该带强风险提示
RWA 板块最近怎么样	赛道/概念问题	不调 token_analysis，走 web_research + onchain
ETH 资金费率多少	单点数据问题	OKX derivatives card 突出
📈 B. 股票主线（stock_analysis + web_research）
B1. A 股
测试问题	验证点
分析一下宁德时代	标准 A 股流，QuoteCard 显示
中芯国际 600519 现在能买吗	6 位代码 + 美股代码命名混淆容错
贵州茅台和五粮液对比	多 ticker，2 张 QuoteCard
恒瑞医药今天跌怎么了	单日异动问题
万科 A 还能不能抄底	"抄底"是 directional 问题，应触发完整数据拉
B2. 美股
测试问题	验证点
NVDA 现在多少	简单实时报价
TSLA 和 AAPL 估值哪个更高	多 ticker 对比
PLTR 是不是涨过头了	高估值警示问题
META 财报后股价为什么跌	财报反应分析
B3. 港股
测试问题	验证点
腾讯 0700 现在该不该加仓	HK ticker 实时报价
美团比亚迪谁更值得买	多个 HK ticker
小米 1810 估值贵吗	估值分析
💰 C. 新工具 #1 — financial_report（A 股财报）
测试问题	期望调的工具	想验证
贵州茅台业绩怎么样	stock_analysis + financial_report + web_research	多期趋势表 + 拐点分析
比亚迪一季报	同上	yjbb 数据填充
宁德时代 2024 年报和 2025 一季报对比	同上	趋势表至少 4 期
中芯国际业绩预告出来了吗	financial_report 主导	yjyg 字段是否触发，没有时如何告知
茅台扣非净利润多少	financial_report	扣非比例 = 1.0 这种深度指标
药明康德盈利质量如何	financial_report + skill	财报四问框架
📄 D. 新工具 #2 — sec_filings（SEC EDGAR）
测试问题	期望调的工具	想验证
NVDA 最新 10-K 风险因素	sec_filings + web_research	10-K 文档链接 + 媒体解读
TSLA 内部人在卖吗	sec_filings(form_types=["4"])	Form 4 列表 + 数量金额
AAPL 最近发了什么 8-K	sec_filings(form_types=["8-K"])	8-K 事件清单
巴菲特 Q4 2025 持仓	sec_filings(BRK-B, form_types=["13F-HR"])	13F 文档链接
META 财报已经发了吗	sec_filings(form_types=["8-K","10-Q"])	earnings release 找得到
GOOGL 最近有没有诉讼	sec_filings + web_research	Item 3 法律诉讼线索
🌊 E. 新工具 #3 — hsgt_flow（沪深港通）
测试问题	期望调的工具	想验证
北向资金今天怎么样	hsgt_flow(direction=summary)	卡片正确 4 通道 + 北向 0 制度性说明
南向资金最近一周趋势	hsgt_flow(direction=southbound, days=7)	南向时间序列
外资在加仓茅台吗	stock_analysis + hsgt_flow(ticker=600519)	A 股 NB 持仓变动
港股通买了腾讯多少	hsgt_flow(ticker=0700.HK)	HK SB 持仓快照（可能拿不到数据，应优雅说明）
北向资金近30日累计净买入	hsgt_flow(direction=northbound, days=30)	制度性归零警示
🔄 F. 多轮对话 / freshness 校验
第 1 轮	第 2 轮	第 3 轮	验证
SOL 现在能买吗	SOL 还能买吗	—	第二轮 tag [X 分钟前]，应该重新调工具
分析 NVDA	那 TSLA 呢	—	跨 ticker，必须 stock_analysis
BTC 多还是空	刚才那个 RSI 是怎么算的	—	纯澄清问题，可以跳工具
茅台业绩怎么样	用英文重写一下	—	重写请求，跳工具
NVDA 今天涨跌	ETH 呢	回到 NVDA	跨域三连 + 回归
🖼️ G. 图片输入
上传图片类型	配合问题	验证
BTC K 线截图	这个图怎么看	TYPE A，调 web3_token_analysis + web_research
推特币圈 KOL 喊单	这个推特怎么样	TYPE A + 引用 X profile
项目架构图	这个项目讲的是什么	TYPE B，纯图分析不调资产工具
财报截图（PDF/图片）	帮我看下这季业绩	TYPE A 偏 stock
单纯日常照片 / 风景	这是什么	TYPE B，不调任何资产工具
关键验证：图片+无工具时，是否会触发我修过的"内容被复制两次" bug —— 应该不会了（IMAGE NARRATION CONTRACT + RULE #0 双保险）。

🧪 H. 边缘 / abuse 用例
测试问题	验证
你好	不调任何工具，纯 simple chat
Loka 是什么	平台问题，不调资产工具
RSI 是什么意思	概念问题，应该 load_skill 不调数据工具
我之前问过什么	session_search
我做现货不开杠杆	remember 触发（保存偏好）
北向资金详细数据	hsgt_flow + 应该说明 2024-08 数据空缺
不存在的代码 ZZZZ999	工具失败 / 优雅降级
Buffett 最新持仓	sec_filings(BRK-B, 13F) + web_research
🎯 I. 重点回归（验证我刚改过的东西）
场景	重点观察
任何股票/crypto 单股问题	没有重复报告（RULE #0 生效）
TSLA 内部人 / NVDA 10-K（无 stock_analysis）	Quote Snapshot 整段跳过（条件规则生效）
SEC filings 问题	不会硬塞多期趋势表（条件规则生效）
hsgt_flow summary	4 通道卡片正确区分 NB / SB（标签修复）
北向数据问题	模型解释 "2024-08 制度性数据空缺" 而非"今日通道关闭"
港股通买了腾讯多少	工具失败时，不会把渠道总量当腾讯专属（数据层过滤修复）
A 股财报多期	12 期数据按降序排列（2026Q1 在最上面，不是 1998 年）
🚀 J. 性能 / 压力（可选）
场景	验证
连续提 8 条问题	history 截断逻辑 + 时间戳前缀正确显示
同一会话 24 小时后再问同一标的	freshness 规则触发重新拉数据
故意网络断开重连	流式中断恢复 + replay buffer 工作
在 trending now 卡片连续点 5 个	不同 sessionId 独立，state 不串
推荐测试顺序
按这个优先级走 15 条左右就够：

回归类（5 条）：先确认上一轮 bug 都修了

贵州茅台业绩怎么样 → 多期表正确
NVDA 最新 10-K 风险因素 → 不重复
北向资金今天怎么样 → 卡片标签正确
港股通买了腾讯多少 → 不误用渠道数据
BTC 多还是空 → crypto 基础流
新工具覆盖（4 条）：

Buffett 最新持仓 → SEC 13F
比亚迪一季报 → financial_report
外资在加仓茅台吗 → hsgt_flow + ticker
TSLA 内部人在卖吗 → sec_filings(form 4)
多轮（3 条）：

同一会话连问 SOL 两次
跨 ticker（NVDA → TSLA）
纯澄清问题（应该跳工具）
图片（2 条）：

上传 K 线截图
上传架构图
edge case（2 条）：

你好 / 简单 chitchat
RSI 是什么 / 概念问题
测完这 16 条，基本所有路径都跑了一遍。重点观察控制台日志里的 tools_done 行 + 报告本身的"无重复 / 无空卡 / 无硬塞表"三个特征。

如果在哪一条上出问题了，把 trace.jsonl + 控制台日志贴过来，我接着诊。