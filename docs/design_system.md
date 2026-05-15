# Loka Design System

> **所有 UI 开发必须遵循本文档。** 参考标杆：Claude.ai / ChatGPT  
> 核心理念：**克制的空白 · 柔和的深度 · 清晰的信息层级 · 极少的视觉噪音**

---

## 一、设计原则

| 原则 | 说明 |
|------|------|
| **内容优先** | UI 元素不与内容竞争注意力；按钮、边框、色块只服务信息传递 |
| **呼吸感** | 宁可间距过多，不可过少；padding 宽松，行间距充足 |
| **柔和深度** | 卡片用 `hover:shadow-md`；默认 `border-gray-100`；不用 `shadow-lg/xl` |
| **色彩克制** | 黑白灰为主；绿色 `#00E676` 仅限每页最重要的**唯一** CTA |
| **层级清晰** | 每张卡片最多 3 层文字：标题 → 副标题 → 描述 |
| **无 emoji** | 所有图标用 SVG，禁止在 UI 中使用 emoji |

---

## 二、色彩系统

```
背景层
  页面背景:      #FFFFFF  bg-white
  侧边栏:        #F9F9F9  bg-gray-50
  卡片:          #FFFFFF
  筛选面板:      #F9F9F9  bg-gray-50
  hover 激活:    #F5F5F5  bg-gray-100

边框（优先用 shadow，border 仅必要时）
  默认:           border-gray-100   (#F0F0F0)
  hover/active:   border-gray-200   (#E5E5E5)

文字
  Hero 标题:     text-black        (#0A0A0A)
  卡片主标题:    text-gray-900     (#171717)
  描述/正文:     text-gray-400     (#A3A3A3)
  标签/辅助:     text-gray-400
  占位符:        text-gray-300

强调色
  主 CTA（唯一）: #00E676   bg-[#00E676] text-black
  次级按钮:       bg-gray-900 text-white
  危险/失败:      text-red-500 / text-red-600
  成功/APY:       text-[#00E676]

Tag 色板（徽章 badge 用，低饱和度）
  Top Investors:        text-emerald-700 bg-emerald-50 border-emerald-100
  Founders:             text-violet-700  bg-violet-50  border-violet-100
  Rising Stars:         text-amber-700   bg-amber-50   border-amber-100
  Active Contributors:  text-blue-700    bg-blue-50    border-blue-100
  Fundraising badge:    text-gray-700    bg-white      border-gray-200
  Funded badge:         text-emerald-700 bg-emerald-50 border-emerald-100
  Failed badge:         text-red-600     bg-red-50     border-red-100
```

---

## 三、字号规范（Typography Scale）

> **规则：** 每个层级只有一个字号。不允许自由发挥。

| 层级 | Tailwind | px | weight | color | 用途 |
|------|----------|----|--------|-------|------|
| **Hero** | `text-4xl` ~ `text-5xl` | 36-48 | 900 (font-black) | text-black | Invest. / Where would you like to invest? — serif |
| **页面标题** | `text-[22px]` | 22 | 600 (font-semibold) | text-gray-900 | Playground / Chats 等页眉 h1 |
| **卡片主标题** | `text-sm` = `text-[14px]` | 14 | 700 (font-bold) | text-black | AssetCard title |
| **卡片副标题** | `text-[13px]` | 13 | 600 (font-semibold) | text-gray-900 | Agent/People name |
| **描述正文** | `text-[11px]` | 11 | 500 (font-medium) | text-gray-400 | 卡片描述，line-clamp-2 |
| **数据值** | `text-[12px]` | 12 | 700 (font-bold) | text-black / #00E676 | Stats 数字 |
| **数据标签** | `text-[8px]` ~ `text-[9px]` | 8-9 | 700 (font-bold) | text-gray-400 | INVESTED / TARGET 等大写标签 tracking-widest |
| **按钮文字** | `text-xs` = `text-[12px]` | 12 | 700 (font-bold) | 视按钮类型 | 所有按钮统一 text-xs font-bold |
| **徽章/badge** | `text-[9px]` ~ `text-[10px]` | 9-10 | 700 (font-black) | 视类型 | Legend / Pro / tag |
| **辅助说明** | `text-[10px]` | 10 | 500 (font-medium) | text-gray-400 | 角色、所属机构、时间 |

### 字体族

```
大标题 (Hero):  font-family: Georgia, "Times New Roman", serif   font-weight: 900
正文 / UI:      system-ui, -apple-system, sans-serif
```

---

## 四、Tab 规范（统一为 2 种）

> **规则：目前代码里存在 4 种 tab 样式，必须统一为以下 2 种。**

---

### Tab Type A — Segment Control（页面级主导航 tab）

适用：Invest 顶层（Fundraising / Early Bird / People）、Opportunities（Farm / Tasks）

```
容器:   flex bg-gray-100 p-1 rounded-2xl
按钮:   px-5 py-2 rounded-xl text-xs font-bold transition-all
        flex items-center gap-1.5 whitespace-nowrap
激活:   bg-white text-black shadow-sm
非激活: text-gray-400 hover:text-black
带 SVG icon（w-3.5 h-3.5）
```

**代码模板：**
```jsx
<div className="flex bg-gray-100 p-1 rounded-2xl">
  {tabs.map(tab => (
    <button
      key={tab.key}
      onClick={() => setActiveTab(tab.key)}
      className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
        activeTab === tab.key
          ? 'bg-white text-black shadow-sm'
          : 'text-gray-400 hover:text-black'
      }`}
    >
      {tab.icon}
      {tab.label}
    </button>
  ))}
</div>
```

> ⚠️ 注意：之前 Invest 大 tab 是 `bg-gray-50/bg-black` 激活，统一改为 `bg-gray-100/bg-white`（更轻，更像 Claude/GPT）

---

### Tab Type B — Underline Tab（页面内容区二级 tab）

适用：Playground（Agents / Groups）、AssetDetail 详情（STORY / AGREEMENT / FINANCIALS）

```
容器:   flex items-center gap-6 border-b border-gray-100
按钮:   pb-2.5 text-sm font-medium border-b-2 transition-all -mb-px
激活:   border-gray-900 text-gray-900
非激活: border-transparent text-gray-400 hover:text-gray-600
不带 icon
```

**代码模板：**
```jsx
<div className="flex items-center gap-6 border-b border-gray-100">
  {tabs.map(t => (
    <button
      key={t}
      onClick={() => setActiveTab(t)}
      className={`pb-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
        activeTab === t
          ? 'border-gray-900 text-gray-900'
          : 'border-transparent text-gray-400 hover:text-gray-600'
      }`}
    >
      {t}
    </button>
  ))}
</div>
```

---

### Filter Pill（筛选胶囊，不是 Tab）

适用：Invest 状态筛选（All / Fundraising / Funded / Failed）、People 标签筛选

```
容器:   flex bg-white p-1 rounded-full border border-gray-100 shadow-sm
按钮:   px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all
激活:   bg-gray-900 text-white
非激活: text-gray-500 hover:text-gray-900 hover:bg-gray-50
```

> **注意：** Filter Pill 不是 Tab，用于过滤结果，不做页面切换用途。

---

## 五、间距单位

```
卡片内边距
  紧凑卡 (Agent / Group):    p-4  (16px)
  标准卡 (People / Invest):  p-4  (统一 p-4，原 p-5 改为 p-4)

页面布局
  内容区:    px-8 py-6
  Hero 区:   p-4 sm:p-8 md:p-12 lg:p-16

最大宽度
  标准内容页:  max-w-[960px] mx-auto
  宽布局:      max-w-[1600px] mx-auto

Grid gap
  紧:    gap-3
  默认:  gap-4
  宽松:  gap-6 (Invest Fundraising 卡片)
```

---

## 六、卡片规范

### DO / DON'T

```
✅ DO
  bg-white
  rounded-xl (12px)
  border border-gray-100
  hover:border-gray-200 hover:shadow-md
  transition-all
  p-4

❌ DON'T
  彩色大背景填充整卡（过重）
  shadow-lg / shadow-xl
  全宽纯黑大按钮作为主操作（除非唯一 CTA）
  在卡片内使用 emoji
  rounded-2xl/rounded-3xl（过圆，显得随意）→ 统一 rounded-xl
```

### Avatar / Letter Mark

```
尺寸:    w-9 h-9  (36px) — 标准
         w-10 h-10 (40px) — People 卡、稍大卡
形状:    rounded-xl（微圆角方形，不用圆形）
背景:    bg-gradient-to-br from-xxx to-yyy（渐变，不用纯色实心）
文字:    font-black text-sm text-white
```

### 操作按钮（卡片内）

```
行内轻量操作（推荐用于有两个操作的卡）:
  flex items-center gap-1 text-[11px] font-semibold text-gray-500
  hover:text-gray-900 transition-colors
  两个操作之间用 · 分隔

单一主操作（卡片底部唯一 CTA）:
  w-full py-2 rounded-xl text-xs font-bold
  bg-gray-900 text-white hover:bg-gray-800

页面级主 CTA（每页唯一，如 Apply / Notify Me）:
  bg-[#00E676] text-black rounded-xl font-bold
  hover:bg-[#00C853]
```

---

## 七、页面布局模板

### A — Hero 居中型（SuperAgent / Invest）

```jsx
<div className="space-y-8 p-4 sm:p-8 md:p-12 lg:p-16 max-w-[1600px] mx-auto">
  {/* Hero */}
  <div className="text-center space-y-4">
    <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 900 }}
        className="text-4xl sm:text-5xl text-black tracking-tight">
      Invest.
    </h2>
    <p className="text-gray-400 font-medium">副标题描述</p>
  </div>

  {/* Tab Type A */}
  <div className="flex justify-center">
    <div className="flex bg-gray-100 p-1 rounded-2xl">
      {/* ... */}
    </div>
  </div>
</div>
```

### B — 内容列表型（Playground / Chats）

```jsx
{/* 页眉 */}
<div className="px-8 pt-8 pb-0">
  <div className="max-w-[960px] mx-auto">
    <h1 className="text-[22px] font-semibold text-gray-900 mb-4">Playground</h1>
    {/* Tab Type B */}
    <div className="flex items-center gap-6 border-b border-gray-100">
      {/* ... */}
    </div>
  </div>
</div>

{/* 内容 */}
<div className="px-8 py-6">
  <div className="max-w-[960px] mx-auto">
    <div className="grid grid-cols-4 gap-3">
      {/* 卡片 */}
    </div>
  </div>
</div>
```

---

## 八、参考标杆对照

| 特征 | Claude.ai | ChatGPT | Loka 目标 |
|------|-----------|---------|-----------|
| 卡片边框 | 无/极淡 | 无/极淡 | border-gray-100 + hover:shadow-md |
| 主色 | 橙棕系 | 绿色 | #00E676（克制） |
| 大标题字体 | Serif | Sans | Serif (Georgia) |
| Tab 风格 | Segment（白底激活） | Segment（灰底激活） | Type A: bg-white激活，Type B: 下划线 |
| 图标 | SVG | SVG | SVG，禁止 emoji |
| 按钮字号 | text-sm | text-sm | **统一 text-xs font-bold** |
| 空白感 | 充足 | 充足 | px-8 py-6，gap-3~6 |

---

## 九、各页面执行状态

| 页面 | Tab 类型 | 字号对齐 | 状态 |
|------|----------|----------|------|
| SuperAgent | — | ✅ | ✅ 基准，勿改 |
| Invest — Fundraising | Type A + Filter Pill | ✅ | ✅ 左对齐，与 Playground 统一 |
| Invest — Early Bird | Type A | ✅ | ✅ |
| Invest — People | Type A + Filter Pill | ✅ | ✅ |
| Playground — Agents/Groups | Type B | ✅ | ✅ |
| Chats | Type B | 🟡 | 待下一轮细化 |
| Opportunities (Earn) | Type A | 🟡 | 待将 bg-white 激活改为 bg-gray-100 容器 |
| API | — | ✅ | ✅ |

---

## 十、迁移清单（存量代码需修改）

- [ ] **Invest 顶层 Tab**：容器从 `bg-gray-50` 改为 `bg-gray-100`；激活从 `bg-black text-white shadow-md` 改为 `bg-white text-black shadow-sm`
- [ ] **Opportunities Tab**：对齐 Type A 规范
- [ ] **AssetCard 圆角**：`rounded-3xl` → `rounded-xl`
- [ ] **Early Bird 卡片圆角**：`rounded-3xl` → `rounded-xl`
- [ ] **按钮字号全局检查**：统一 `text-xs font-bold`，消除 `text-[12px]` 散点写法
