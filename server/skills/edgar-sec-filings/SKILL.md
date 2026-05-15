---
name: edgar-sec-filings
description: 美股 SEC EDGAR 文件检索与解读框架（10-K/10-Q/8-K/Form 4/13F），用于挖掘官方披露中的关键披露、风险因素、内部人交易、机构持仓。
category: analysis
---
# SEC EDGAR 文件检索与解读

## 何时使用

当用户问到以下场景时调用 `sec_filings` 工具（搭配 `stock_analysis` 和 `web_research`）：

- "show me NVDA's latest 10-K" / "show AAPL's risk factors"
- "did TSLA file an 8-K recently?" / "any material events at META?"
- "TSLA insider trading" / "who's selling at NVDA?" (Form 4)
- "13F holdings of Berkshire" / "what does Buffett hold now?"
- "AMZN MD&A" / "GOOG segment revenue"
- "TSLA going concern" / "TSLA litigation disclosure"

中文等价场景：
- "NVDA 最新 10-K"、"AAPL 风险因素"、"特斯拉 8-K"、"内部人交易"

## SEC 五种主流文件类型

### 1. 10-K — 年度报告（最重要）

每年发一次，深度最高。**必读章节：**

| Item | 内容 | 解读价值 |
|------|------|----------|
| **Item 1** Business | 业务描述（产品、客户、供应商、地理分布） | 商业模式画像 |
| **Item 1A** Risk Factors | 风险因素列表 | 公司自己说的"我可能死法" — 极高价值 |
| **Item 2** Properties | 主要资产/物业 | 资产分布 |
| **Item 3** Legal Proceedings | 诉讼披露 | 潜在大额赔款 |
| **Item 7** MD&A | 管理层讨论与分析 | 季度业绩解读、guidance |
| **Item 7A** Quantitative Risk | 量化风险（汇率/利率/商品） | 敏感度分析 |
| **Item 8** Financial Statements | 完整三大报表 + 附注 | 财务真相 |
| **Item 9A** Controls | 内控有效性 | 内控缺陷 = 红旗 |

**速读技巧：**
- 第一年读 10-K：从头到尾
- 已经读过的公司：每年只读 **Item 1A 风险因素的 diff**（新增/删除哪几条）+ Item 7 MD&A 关键段落

### 2. 10-Q — 季度报告

季度发，比 10-K 简洁。**注意：** Q4 不发 10-Q（直接发年报 10-K）。

**重点读：**
- 三大报表 → 营收 / 净利润 / 现金流的 QoQ + YoY
- MD&A → 管理层对该季的解释（"这季度营收下滑因为 …"）
- 新增的法律诉讼、重大合同

### 3. 8-K — 实时事件披露

只要发生"重大事件"就 24-48 小时内必须发。常见触发：
- **Item 1.01** 重大合同签订
- **Item 2.02** 业绩发布（earnings release）
- **Item 5.02** 高管变动（CEO/CFO 离职是大事）
- **Item 7.01** Reg FD 公开信息
- **Item 8.01** 其他重大事件

**信号价值：**
- 接连发布 5+ 份 8-K → 公司正在发生大事
- Item 5.02 CFO 突然离职 → 警惕财务问题
- Item 4.02 之前财报"不可依赖" → 严重利空

### 4. Form 4 — 内部人交易

董事 / 高管 / 持股 10% 以上股东买卖股票，2 个工作日内必须申报。

**信号价值：**
- 集中卖出（多个内部人同时减持）→ 卖方信号
- CEO 公开市场买入 → 强买方信号（很罕见）
- 注意区分：行权 + 立即出售（中性，避税操作）vs 自有资金买入（强信号）

### 5. 13F-HR — 机构持仓季度报告

资管规模 > $100M 的机构每季度公布持仓（持仓日后 45 天内）。

**用法：**
- Berkshire 13F → 巴菲特持仓变动
- 看顶级对冲基金（Bridgewater / Tiger Global / Renaissance）季度 rotation
- 注意延迟：13F 反映的是 45 天前的快照，可能已经平仓

## 工具返回内容

`sec_filings` 返回**文件元数据 + 官方 URL**，不返回正文（10-K 经常 200+ 页，单次拉不动）。返回字段：

- 文件类型 (10-K / 10-Q / 8-K / 等)
- 申报日期（filing date）
- 报告期（report date）
- 申报号（accession number）
- 主文档 URL（点击直达 SEC EDGAR 原文）
- 文件大小 / 描述

## 分析框架

### 当用户问"X 的 10-K 风险因素"

1. 调 `sec_filings(ticker=X, form_types=["10-K"], limit=2)` 拿最近两份年报
2. 在答复里提供两份年报的 URL（让用户自己点击查看 Item 1A 全文）
3. 用 `web_research(query="X 10-K risk factors summary 2026")` 拉媒体 / 卖方对该公司风险的解读
4. 综合写：'NVDA 最新 10-K（filed 2026-MM-DD, [doc](url)）— 该年报新增了 X、Y、Z 三项风险，去除了 W 风险。[CoinDesk / Bloomberg / Reuters 解读：…]'

### 当用户问"X 业绩出来了吗"

1. 调 `sec_filings(ticker=X, form_types=["8-K","10-Q"], limit=3)` — 8-K Item 2.02 通常是 earnings release，10-Q 是完整数字
2. 用 `stock_analysis(tickers=[X])` 拿当下股价反应
3. 用 `web_research(query="X earnings reaction Q4 2025")` 拉市场解读

### 当用户问"X 内部人在卖吗"

1. 调 `sec_filings(ticker=X, form_types=["4"], limit=15)`
2. 看最近 30 天 Form 4 提交频率 + 净买卖金额
3. 标注每条 Form 4 的"是否伴随行权"（用 web_research 验证）

### 当用户问"巴菲特最新持仓"

1. 直接调 `sec_filings(ticker="BRK-B", form_types=["13F-HR"], limit=2)` 拿 Berkshire 最近两期 13F
2. 提供 13F 文档 URL（让用户在 EDGAR 上看完整持仓表）
3. 用 `web_research(query="Berkshire 13F latest holdings changes")` 拉 dataroma / whalewisdom 等第三方汇总

## 输出格式建议

```
## SEC Filings — TICKER (Company Name)

最近 N 份相关文件：

### 10-K Annual Reports

- **2026-MM-DD** (X days ago) — Form 10-K
  - 报告期: 2025-12-31
  - 主文档: [link]
  
### 10-Q Quarterly Reports

- **...**

### 8-K Material Events

- **...**

---

## 解读

[基于 web_research 拿到的市场解读 + 自己的 framework]
```

## 注意事项

- SEC EDGAR API **完全免费**，但要求 User-Agent header 标识请求方（已在底层处理）
- 限速 10 req/s — 我们不会触达
- 10-K 全文不通过此工具返回（文件太大），需要用户点链接打开
- 报告期（reportDate）≠ 申报日期（filingDate）：10-K 报告期是上年 12 月 31 日，但通常 2-3 月才提交
- 加密相关披露：搜 "digital assets" / "cryptocurrency" / "blockchain" 关键词在 Item 1A 中
- 跨境上市公司（如中概股的 ADR）：用 Form 20-F 替代 10-K（年报），用 Form 6-K 替代 8-K（不定期披露）— 调用时改 form_types
- 本框架仅用于研究分析，不构成投资建议
