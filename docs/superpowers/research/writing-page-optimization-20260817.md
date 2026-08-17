# 写作页优化调研 — 发散灵感点

> **范围**：发散性调研，**只找灵感点**。具体计划 / 实现 / 重构方案不在本调研范围（用户已明确）。
> **当前 bug 与未完成功能**：见 STATUS.md 「写作 Notebook」段 + 2026-08-17 「修复素材/画布/写作回归」日志。
> **在进行中**：WNB-6A（段落节点 → writingUnit → scene 三层 schema 重构）。

---

## §0 阅读须知 + 验证图例

**文档定位**：本调研是 WNB-6A 之前的发散灵感收集，不替代 brainstorming / writing-plans 流程；不写实现、不修 bug、不动 STATUS / PLAN / LOG、不写新 skill。

**验证图例**：

| 标记 | 含义 | 出现位置 |
|---|---|---|
| 🟢 | 多源印证（≥ 2 个不同生态，或 ≥ 3 个独立产品收敛） | §F 主题 |
| ⚠️ | 落地前需二次核实（通常是该 agent 已标 "I cannot verify" 的细节） | §F 主题内的细节项 |
| ✓ | 已通过本会话 WebFetch / WebSearch 一手核实 | §C.0 / §E 已核实清单 |
| 𓈊（默认） | 二手来源整理，未直接核实 | 各节默认 |

**5 个关键不确定项**（落地前必须二次核实）：

1. **§B.9 Zed ACP (Agent Communication Protocol) 2026 现状** — 第三方拆解提及，未在 Zed 官方文档直接验证 ACP 命名 + 发布时间。
2. **§D.10 Allume v4.0 "Liquid Glass UI + AI MCP" (2026-07)** — 来源是 allume.com 主页引用，本调研未深入验证 v4.0 具体内容。
3. **§D.11 iA Writer 8 Authorship 三态（typed / pasted / AI 黑白/彩色）** — ia.net 主页未列 AI，标记细节需 2026-06 原文核实。
4. **§B.7 Continue.dev context provider 类型列表**（`file` / `codebase` / `git` / `terminal` / `docs` / `database`）— 第三方拆解列出，docs.continue.dev 当前实际列表可能不同。
5. **§E.1 Sudowrite 各命令**（Continue / Expand / Rewrite / Describe / Character / POV / Genre / Twist / First Draft）的当前具体命名 — WebSearch 返回噪声页，未逐项验证。

> 这 5 项不影响 §F 主题的结论方向（多源已印证主题），但**影响具体落地时引用的准确性**。

**用户拍板题**：见 §F.3.1（产品定位 5 题）/ §F.3.2（技术容量 2 题）/ §F.3.3（跨域协调 1 题）。

**反向映射**：见 §F.5「§1.3 症状 → §F 主题 + 灵感条目」表。

---

## §1 Pinax 写作页当前快照

### 1.1 用户声明的灵感来源

> 「这个写作页目前的灵感来源主要有 jupyter notebook、vscode copilot、笔记和批注等，但是现在有很多 bug，功能也不够完善」

三类源 + 它们的隐喻：

| 源 | 隐喻 | Pinax 当前对应 | 状态 |
|---|---|---|---|
| Jupyter Notebook | cell 容器 + 多 cell 顺序 + kernel 状态 | ProseMirror block（schema v2） + 写作单元（schema v3 WNB-6A 进行中） | v2 → v3 迁移未完成 |
| VSCode Copilot | 行内 ghost-text 续写 + chat 面板 + command palette | `WritingInlineCompletion` + `useWritingAgent` + `/` 命令菜单 | 行内可见、agent 收件箱 draft、命令菜单定位修复已做 |
| 笔记 + 批注 | 边注 / margin note / inline note + thread | `writingAnnotation` + 边注检查器 + 按批注改写 | 边注聚焦 / 重开 anchor / 块级恢复已做，多片段批注与 targets[] 冻结 |

### 1.2 当前架构关键路径

- **编辑器**：`src/components/writing/WritingNotebookEditor.vue`（Tiptap/ProseMirror）
- **容器**：`src/pages/Writing.vue`（卷宗 + 章节书架 + 边注检查器 + 资产收件箱 + 工具栏）
- **数据**：
  - `services/writing/writingDocumentSchema.js` — schema v2，每个顶层 token → block（blockId 哈希 + revision + kind）
  - `services/writing/writingCandidates.js` — 续写 / 改写候选请求构造 + 校验
  - `services/writing/liveMarkdownPreview.js` — 当前行 / 命令菜单 / 行内 mark 高亮
- **AI**：`useWritingAgent`（debounceMs 900，行内 ghost-text + 单元采纳） + 章节审查 batch + 续写参考资产
- **辅助**：
  - 选区操作（批注 / 收为素材）浮条
  - 章节纲要（参与续写 + 分镜）
  - 资产收件箱（多状态 inbox / current-book / unbound）
  - 找替换 / 字数 / 字符统计
  - 快照 / 块级历史 / 崩溃恢复

### 1.3 当前主要问题（用户感知 + STATUS/git log 提取）

| 类别 | 具体症状 | 来源 |
|---|---|---|
| schema 错位 | schema v2 把每个顶层段落当独立块，Enter 误建块；schema v3 writingUnit 尚未贯通 | WNB-6A / 2026-08-11 STATUS |
| ghost-text 与块稳定性 | 行内续写在 Markdown 标记 / revision 干扰下错位；多片段批注后选区漂移 | git log 2026-08-17「改写上一段」、「收起的候选」 |
| 命令菜单 | 一级 → 二级菜单方向、viewport 计算、zoom 适配、移动端翻转 | git log 2026-08-11 / STATUS M0-M4 |
| 跨块操作 | 多片段批注、查找同类、多目标原子改写方案冻结 | STATUS 「推进 U5-R」+ 8-11 |
| 资产流 | 选区 → 收件箱 → 章节纲要 → 分镜四段，状态机分散在不同组件；批量操作覆盖不全 | 收件箱代码 + STATUS |
| AI 渠道 | text-model 空响应 / 30s 超时链；多 provider 端点解析 | git log 2026-08-11 |
| 视觉漂移 | 长文档缩放后当前行 / 命令菜单纵向漂移 | git log 2026-08-11 |
| 恢复 | 块级恢复与全文快照共存；自动草稿与手动快照耦合 | Writing.vue `restoreWritingBlockHistory` + `restoreWritingSnapshot` |

---

## §1.4 TL;DR —— 5 分钟读完本文档

> 本调研 70+ 条灵感 × 8 条跨节主题 × 5 个生态。如果只看 5 分钟，按下面顺序：

**4 条「读这一段就够」的总结**：

1. **WNB-6A 方向被多源印证**（§F.1.1）—— schema v3 = 段落节点 → writingUnit → scene 三层架构 + revision 字段是 2026 主流（Logseq / Tana / Capacities / Sudowrite / NovelAI / Notion 都做了等价）。具体字段提案见 §D.v3 必备字段（unitId / unitKind / outgoingRefs / properties）。
2. **§1.3 大部分 bug 共享一个根因**（§F.1.2）—— 「上游改了，下游没跟着改」。当前 `debounceMs 900` 是「轻 reactive」但未显式化。落地 onUnitChanged 事件总线可以一次解决 ghost-text 漂移 / 改写 anchor 漂移 / 块级恢复不一致。
3. **批注 / 资产 / AI 候选三种对象的状态机可以统一**（§F.1.8 + §F.1.6）—— shared `properties.status` enum (draft / pending / accepted / rejected / archived) + 共享 authorRole 字段（human / ai / system）。Lex AI Comments 的最小 PR 思路见 §F.1.6 ⚠️。
4. **5 个产品定位题（§F.3.1）必须用户拍板** —— 隐私 vs 过程日志 / Daily Journal / AI core vs plugin / 协作 v1 需求 / 过程日志产品差异化。这 5 题不解决，schema 落地再多优化都是打补丁。

**「我的 bug 看哪里」快速路由**：

| 你看到的症状 | 直接看 |
|---|---|
| schema v2 把段落当块 / Enter 误建块 | §F.1.1 + §A.A.3 |
| ghost-text 在 Markdown 标记下漂移 | §F.1.2 + §A.A.7 / §A.A.12 |
| 批注重开 anchor 漂移 | §F.1.4 + §C.C.2 |
| 跨块多片段批注 / 查找同类 | §F.1.3 + §D.D.2 / §A.A.11 |
| 资产四段流分散 | §F.1.8 + §E.E.1 / §E.E.3 |
| 章节纲要 / 分镜双轨 | §F.1.7 + §E.E.8 |
| AI 渠道多 provider 不稳 | §F.1.8 + §B.B.7 / §E.E.4 |
| 长文档缩放后视觉漂移 | §F.1.2 + §D.D.17 |
| 块级恢复与全文快照共存 | §F.1.5 + §A.A.14 / §B.B.8 |
| 移动端命令菜单方向 | §F.1.1 + §A.A.15 |
| text-model 空响应 / 30s 超时 | §B.B.13.3 + §F.1.2 |

**8 条主题一览**（详细见 §F.1）：

| 编号 | 主题 | WNB-6A 状态 | 投入 |
|---|---|---|---|
| F.1.1 | schema 身份稳定是 bug 根因 | 在做 | 主任务 |
| F.1.2 | reactive runtime / 修订级联失效 | 不在 | 中 |
| F.1.3 | @ 上下文语法 | 不在 | 中高 |
| F.1.4 | 锚点策略（持久化） | 不在 | 中 |
| F.1.5 | 回滚策略（可恢复性内禀） | 不在 | 中高 |
| F.1.6 | 类型化对象（typed-block） | 部分 | 中 |
| F.1.7 | Canvas vs prose 共数据源 | 不在 | 中 |
| F.1.8 | AI 候选 / 批注 / 资产状态机统一 | 不在 | 中 |

---

## §A Jupyter / Observable / Cell 范式 → 叙事写作
> **调研人**:A（并行 agent）。**scope**:cell 容器、kernel 状态、多输出、长延展式 notebook、可恢复性

### §A.0 总览：cell-paradigm 对叙事写作的三个根本命题

把 cell 当作基本单位的工具几乎都是「**长延展式**」载体（数据科学 notebook、研究 log、文学草稿本），它们的共同问题是：

1. **cell 间状态** —— 一个 cell 的输出被下游 cell 引用；reactive runtime 让依赖图自动重算，REPL 风格的「运行顺序 ≠ 出现顺序」会出现。Pinax 的 §1.3 多处问题（ghost-text 漂移、改写上一段 anchor 漂移、Enter 误建块）都可以视作「cell 边界 + 隐式依赖」控制太松。
2. **可恢复** —— cell 必须可独立重放、可单独保存、可恢复到任意 revision；Marimo 强调「删 cell 时变量真消失」、Polynote 强调「无 hidden state」。Pinax §1.3「块级恢复与全文快照共存」「自动草稿与手动快照耦合」直接对应。
3. **可重放 / 可重执行** —— Quarto / nbconvert 这类「notebook 既是源也是可发布物」，以及 Marimo「pure Python file = git-friendly」。Pinax writingDocumentSchema v3 想要解决的也是「文档既是创作对象也是可序列化资产」。

下文的灵感条目都从这三个命题里挑选一个角。

> **检索说明**：本节联网核实了 nbformat、Observable runtime、Marimo、Polynote、Deepnote、Anytype、Hydrogen 的公开页面；Colab / Hex / Foam / VSCode Polyglot / Observable Plot 通过二手来源整理，URL 给出但内容深度可能不够。「无法验证」处明确标出。

---

### §A.1 reactive dataflow runtime（Observable / Marimo）

**模式名**：cell-as-value + 自动重算
**源产品 / 出处**：
- [github.com/observablehq/runtime](https://github.com/observablehq/runtime) — Observable 的 reactive dataflow runtime
- [docs.marimo.io](https://docs.marimo.io/) — Marimo reactive Python notebook
**机制简述（≤80 字）**：每个 cell 是一个具名 reactive 节点；runtime 维护变量引用图，被依赖 cell 改变时下游 cell 自动重新求值。Marimo 把整个 notebook 存为纯 Python 文件 + 显式 dataflow graph，删 cell 时其变量在 runtime 立即失效。
**Pinax 摩擦对应**：§1.3「ghost-text 与块稳定性」「改写上一段 anchor 漂移」。这两类 bug 的本质都是「行内 ghost-text 依赖一个隐式上游（上一段 revision / 选区 anchor），但 runtime 不知道它」。如果写作页有一个明确的「cell-as-value + named revision」模型——比如每个 scene/paragraph 是一个 named node，ghost-text 必须声明它依赖哪几个上游节点——runtime 就能在选区漂移时主动重算，而不是把错位结果留在 DOM 里。
**为什么不算实现方案**：这只是把「数据流图的命名约定」当成灵感，迁移到 prose 场景必须重新定义什么算「reactive 依赖」（语义依赖 vs. 位置依赖），远非一行 import 能解决。
**可行性疑点**：Vue 3 组件已经是 reactive，但 prose 没有「输入 → 输出」的纯粹函数语义（每次续写本身是 stochastic）。强行套 dataflow 反而会把「修一段不影响另一段」这条 prose 的隐性承诺打破。schema v3 writingUnit 是否能容纳「声明依赖」字段？目前没看到对应设计。

---

### §A.2 cell metadata / cell tag 携带副作用标签（JupyterLab / Colab）

**模式名**：cell-level 元数据 = 行为标签
**源产品 / 出处**：
- nbformat v4 schema（[nbformat.readthedocs.io](https://nbformat.readthedocs.io/)）—— 每个 cell 可携带任意 metadata 字段
- JupyterLab 内置 `@jupyterlab/celltags`（前身为 [github.com/jupyterlab/jupyterlab-celltags](https://github.com/jupyterlab/jupyterlab-celltags/)）—— UI 上给 cell 打 tag
- Google Colab form cell —— `@param` 装饰器把 cell 标记为「参数输入」
**机制简述**：cell 本身是一段纯文本，外加结构化 metadata（tags / parameters / hidden / init / slide）。runtime 读 metadata 决定是否执行、是否隐藏、是否参与 slide 导出。
**Pinax 摩擦对应**：§1.3「多片段批注」「targets[] 冻结」「多目标原子改写方案冻结」。当前 writingAnnotation 模型里，每条 annotation 需要一个 `targets[]` 列表来表达「这条批注作用在哪些 block 上」。如果引入「block metadata 层」——比如每个 block 自带 `tags: ['init', 'no-ai', 'voice:林晚']`——批注可以直接挂在 tag 上而不需要 targets[] 数组，schema v3 的多目标原子改写也能用 tag query 来 select。
**为什么不算实现方案**：tag 系统在 prose 场景里很容易演化成「标签海」，最终还是退化回 1-by-1 标注。
**可行性疑点**：writingDocumentSchema v3 的 block 已经有 `blockId + revision + kind`，加 tag 字段不难，但 Tiptap schema 本身没有原生 metadata 槽位；需要走 `attrs` 旁路或者 NodeView 扩展，与 §1.2「schema v2→v3 未完成」叠加改动风险高。

---

### §A.3 nbformat 风格的多输出 cell（code + markdown + raw 三元）

**模式名**：cell 三态分类
**源产品 / 出处**：
- nbformat v4：cell_type ∈ {code, markdown, raw}（[nbformat.readthedocs.io](https://nbformat.readthedocs.io/en/latest/format_description.html)）
- JupyterLab 在 cell 之上还有 Output 子类型：stream / display_data / execute_result / error
**机制简述**：cell 类型决定「谁来解析它」；markdown 由 markdown renderer 接管，raw 原样保留，code 跑 kernel 后挂 output。
**Pinax 摩擦对应**：§1.3「schema 错位：Enter 误建块」「ghost-text 与块稳定性」。Tiptap 的 block 概念和 prose 概念是耦合的——一个 paragraph token 同时承担「这是 prose」+「这是 prose 编辑单元」+「这是 schema v2 顶层块」三重角色。借鉴 cell 三态，可以把 prose block 拆成：「paragraph 节点（语义）」+「paragraph 单元（schema v3 批处理单元）」+「raw 注释单元（保留 Markdown 原文）」三类，Enter 创建时由 runtime 决定落哪一类，避免「按 Enter = 立刻新建 schema v2 顶层块」的耦合。
**为什么不算实现方案**：Tiptap 的 ProseMirror schema 要求严格定义 node type，不可能临时插一个新类型；这是 schema 重构级别的提议，触及 §1.3 的 WNB-6A 在做的工作。
**可行性疑点**：v2→v3 迁移正在做（WNB-6A），再次分层会让既有 migration 工具链失效。建议作为 v4 候选而不是 v3 加速项。

---

### §A.4 「pure-file format = git-friendly」（Marimo）

**模式名**：notebook = single source file
**源产品 / 出处**：
- [docs.marimo.io](https://docs.marimo.io/) — Marimo 自述「stored as a pure Python file, making it easy to version control with Git」
**机制简述**：整个 notebook 是一个合法 Python 文件，cell 之间用装饰器显式声明依赖；git diff 显示语义差异（哪一行变量定义变了），而不是 JSON 噪音。
**Pinax 摩擦对应**：§1.3「块级恢复与全文快照共存」「自动草稿与手动快照耦合」。Pinax 现在把每个 block 的 revision + 全文档快照都存 localStorage，git-friendly 不是直接目标但「单文件 + 显式依赖」的精神可以用——如果一个 scene 的写作单元存为一段自包含结构（unitId + revision + 内容 + 显式依赖列表），崩溃恢复时只需要重放一份 scene map，而不是在 snapshot / 草稿 / 块历史三处对账。
**为什么不算实现方案**：Pinax 数据存 localStorage 而非 git；「单文件」是物理介质差异，不是逻辑模型差异；强行做 git-friendly 会增加序列化复杂度。
**可行性疑点**：localStorage 配额（5-10MB）和同步语义和 git 完全不同；强行类比只会让人误以为有版本控制能力。可借鉴的是「一份自包含结构 = 一个原子恢复单元」，不是「单文件存储」。

---

### §A.5 「no hidden state / reproducibility」（Polynote）

**模式名**：删 cell → 变量立即消失
**源产品 / 出处**：
- Netflix Polynote 设计原则（[github.com/polynote/polynote](https://github.com/polynote/polynote)）——「reproducibility, no hidden state」
- Marimo 同源精神
**机制简述**：与传统 notebook 的 REPL 会话不同，Polynote/Marimo 把每个 cell 的输出显式依赖于「在它之前的 cell 的输出」，运行顺序 = 阅读顺序；删除 cell 时其副作用（包括全局变量）立即失效。
**Pinax 摩擦对应**：§1.3「跨块操作」「多片段批注」「多目标原子改写方案冻结」。当批注跨多个 scene 时，runtime 必须能保证「这条批注只看到批注时的 scene 状态」，而不是当前 scene 状态。隐式状态（auto-draft、debounced ghost-text、未触达的续写候选）混在一起导致「改完上一段，下面的批注 anchor 全漂」。Polynote 的精神可借鉴：每个批注操作前显式 freeze 一个 scene state snapshot，操作结束再 commit。
**为什么不算实现方案**：prose 没有真「执行」语义，「freeze / commit」听起来像数据库事务，对 prose 用户是反直觉的概念。
**可行性疑点**：写作流里「边写边让 AI 续写」是隐式持续操作，强制 freeze 会打断节奏；而且 writingUnit 的 revision 字段已经是同类信息（只是没暴露给用户/批注）。可能的方向是 revision-aware annotation 而不是新增 freeze 流程。

---

### §A.6 cell 协作 / shared notebook（Deepnote / Colab 多人模式）

**模式名**：cell-level 实时协作 + 角色权限
**源产品 / 出处**：
- [docs.deepnote.com/features/notebooks](https://docs.deepnote.com/features/notebooks) — Deepnote 文档：多人协作 cell、评论、AI block
- Google Colab 多人模式 —— 多光标编辑 + 评论
**机制简述**：cell 是协作单元；评论挂在 cell 上；AI block 作为特殊 cell 类型拥有「可被人类 override / 重跑」的语义。
**Pinax 摩擦对应**：§1.3「资产流」「状态机分散」「AI 渠道多 provider 端点解析」。当前 inbox / current-book / unbound 三态散在不同组件，AI 续写 / 改写 / 审查三种操作散在不同按钮。借鉴 cell-协作的产品语言：把每个「AI 操作」当作一个 first-class cell——比如「续写候选 cell」「改写提案 cell」「审查批注 cell」——每条 cell 自带来源、模型、prompt、结果、采纳状态。批量操作只需对 cell 集合做。
**为什么不算实现方案**：用户已经明确表达过 Pinax 是单作者写作助手；多人协作不是当下目标。但 cell-as-AI-action 这个抽象层次仍然能用——AI 不再是「按钮触发」而是「文档里的一等公民」。
**可行性疑点**：把 AI 候选持久化为 cell 等同于把「收件箱」内嵌进正文，UI 复杂度大幅上升；现有 writingCandidates 已经是 batch 结构，迁到 cell 模型会破坏当前「收件箱不污染正文」的契约。

---

### §A.7 inline reactive code（nteract / Hydrogen）

**模式名**：编辑窗口内嵌可执行 cell
**源产品 / 出处**：
- [github.com/nteract/hydrogen](https://github.com/nteract/hydrogen) — Hydrogen（Atom 内 reactive inline notebook，2023 sun-setted 因 Atom 退役）
**机制简述**：在 prose 编辑器光标位置就地运行代码片段，结果 inline 显示在文本里；不需要切到独立 cell 视图。
**Pinax 摩擦对应**：§1.3「ghost-text 与块稳定性」「视觉漂移（当前行/命令菜单纵向漂移）」。Hydrogen 的范式是「行内 = 同位置渲染」，避免了另起浮层/对话框带来的位置计算。当前的 `WritingInlineCompletion` 实际上已经是「行内 ghost-text」的近似品——但它的「位置 = 光标位置」假设在 Markdown 标记 / revision 干扰下会失效。借鉴 Hydrogen 把光标 → 输出位置的绑定从「DOM 偏移」改成「ProseMirror position token」，可以绕开缩放 / 标记带来的漂移。
**为什么不算实现方案**：ProseMirror 已经提供 position token 抽象；这不是新机制，只是「把现有抽象用对」。属于实现细节。
**可行性疑点**：liveMarkdownPreview.js 已经做类似工作（[services/writing/liveMarkdownPreview.js](src/services/writing/liveMarkdownPreview.js)），但代码里读的是字符串偏移而不是 PM position。改造范围局限于这个文件，但需要回归测试覆盖所有 ghost-text 触发路径。

---

### §A.8 多语言 polyglot cell（VSCode Polyglot Notebooks / Polynote）

**模式名**：一个 notebook 内多语言 cell，共享变量
**源产品 / 出处**：
- VSCode Polyglot Notebooks（基于 .NET Interactive）—— 官方文档 [code.visualstudio.com/docs/notebooks](https://code.visualstudio.com/docs/notebooks)
- Polynote —— Scala + Python + SQL 共享变量
**机制简述**：一个文档里 cell 可以是不同语言，runtime 自动把上一个 cell 的输出序列化成下一个 cell 的输入。
**Pinax 摩擦对应**：§1.3「资产流」「多 provider 端点解析」。Pinax 一个章节里其实有多种「内容类型」：prose、annotation、outline、asset reference、reference excerpt、stereotype。「多语言 cell」的精神可以借——每种内容类型就是一个 cell kind，跨 kind 转换由 runtime 处理（比如从 outline cell 拉到 prose cell 作为续写参考）。当前 writingDocumentSchema v3 已经在做这件事（schema 三层），但 kind 之间的引用方式仍是字符串 ID 拼接，没有显式 transform step。
**为什么不算实现方案**：v3 schema 已经在重构路径上；本条只是「记得补一个 transform layer」的提醒。
**可行性疑点**：新增 transform 层会让 schema v3 的 acceptance 范围再次膨胀；建议先观察 v3 落地效果再决定。

---

### §A.9 「executable publishing」= 文档既是源也是发布物（Quarto）

**模式名**：notebook → publish artifact
**源产品 / 出处**：
- Quarto（[quarto.org](https://quarto.org/)）—— `.qmd` 文件：markdown + 代码 cell + frontmatter；可执行可发布
- R Markdown 同源
**机制简述**：文档本身是可执行源码（cell 序列），通过 nbconvert / Quarto render 产出 HTML / PDF / book。文档格式 = 单一真相源。
**Pinax 摩擦对应**：§1.3「schema 错位 v2→v3」「块级恢复与全文快照共存」。Pinax 当前 writingDocumentSchema v2 把「块序列化格式」「编辑器内部状态」「AI 候选产物」混在一个 JSON 里，没有清晰分层。Quarto 的精神可借鉴——writingDocumentSchema 的对外序列化（用于 localStorage / 导出 / 导入）和内部 in-memory state 应该是两种东西，中间通过 transform layer 桥接；schema v3 迁移可以借这套分层来避免「序列化结构变了 in-memory 也跟着变」导致的连锁 bug。
**为什么不算实现方案**：分层重构是真实工作量，且需要 schema v3 落地稳定后才好动；属于计划/实现范畴。
**可行性疑点**：当前 writingDocumentSchema.js 看起来已经把序列化抽到独立文件，但消费方（[services/writing/writingCandidates.js](src/services/writing/writingCandidates.js)、[services/writing/liveMarkdownPreview.js](src/services/writing/liveMarkdownPreview.js)）直接吃 schema，没有 transform layer；新增层会影响所有消费方。

---

### §A.10 form cell / 参数化 cell（Colab form、Hex input cell）

**模式名**：把 cell 变成表单输入
**源产品 / 出处**：
- Google Colab `@param` form fields（[research.google.com/colaboratory](https://research.google.com/colaboratory/)）
- Hex input cell（[hex.tech](https://hex.tech/)）
**机制简述**：cell 内容是结构化输入字段（text/dropdown/slider），不是自由文本。运行时把这些字段当作参数注入下游 cell。
**Pinax 摩擦对应**：§1.3「命令菜单」「跨块操作」「多目标原子改写方案冻结」。当前写作页的「命令菜单」是 free-text 输入；很多用户场景（「把这段改成第三人称」「把这段字数砍一半」「翻译成英文」）其实是固定的几条 transform。借鉴 form cell 范式：把写作工具栏的常用 AI 操作做成结构化 input cell——用户选 transform 类型 + 几个参数 + scope，runtime 自动构建 prompt 并对选区执行。这能极大降低命令菜单的复杂度（viewport 计算 / 缩放适配），同时给多目标原子改写一个清晰的输入契约。
**为什么不算实现方案**：这是产品定位层面的决策（结构化 vs. 自由 prompt），用户已经对命令菜单投入了开发成本（§1.3 STATUS M0-M4）。
**可行性疑点**：结构化 input cell 会破坏「高级用户写自由 prompt」的灵活性。需要做双轨：默认结构化面板 + 高级用户可切到自由 prompt。

---

### §A.11 block = file（Foam / Dendron）+ bidirectional relations（Anytype）

**模式名**：最小知识单元 = 单文件 / 单 block + 双向链接
**源产品 / 出处**：
- Foam（[foambubble.github.io](https://foambubble.github.io/)）—— block = markdown 文件，wikilink 双向
- Dendron（[dendron.so](https://dendron.so/)）—— 同上 + 层级命名
- Anytype（[anytype.io](https://anytype.io/)）—— block-as-object + Relation 字段，2026 视角下「local-first, P2P, E2EE」，每个 object 可包含 block + properties；Relation 类型让 A→B 时 B 自动反向包含 A
**机制简述**：最小单元（block / paragraph / file）有稳定 ID 和双向引用；引用关系不是字符串链接而是显式 relation，可查询可反向。
**Pinax 摩擦对应**：§1.3「跨块操作」「多片段批注」「targets[] 冻结」。当前 annotation 的 `targets[]` 是一个字符串数组，方向是单向的（annotation→block）。借鉴 Anytype Relation 模型：annotation 与 block 之间的关系是双向的，反向也能查；这样批注面板能直接展示「这段被哪些批注引用」，而不是只在 annotation 端维护 targets[]。Foam/Dendron 的「最小单元 = 独立文件」精神可以借鉴——每个 scene / writingUnit 应该是可独立寻址的 ID + 独立恢复单元，而不是嵌套在文档 JSON 里。
**为什么不算实现方案**：writingAnnotation 已有 `anchorId + range`，增加反向索引是工程量；schema v3 writingUnit 也已经有 unitId。
**可行性疑点**：双向 relation 在 localStorage 里需要维护两套索引，跨 scene 的批注会有「删除场景时批注要不要级联」问题。Anytype 之所以能优雅解决是因为它有 E2E 同步 + object 软删除；Pinax 单机场景需要自己处理级联语义。

---

### §A.12 reactive runtime 的「无重放 = 错位」直觉（Marimo vs Observable vs Jupyter）

**模式名**：自动重算 vs 显式重放
**源产品 / 出处**：
- Marimo reactive runtime（任何 cell 改变 → 全图重算）
- Observable runtime（增量重算）
- Jupyter（Jupyter 默认手动 Run All，不自动重算）
**机制简述**：三种 runtime 对「上游改了怎么办」给三种答案——全图重算、增量重算、什么都不做。
**Pinax 摩擦对应**：§1.3 全表——schema v2→v3 的所有 bug 几乎都是「上游改了，下游没跟着改」。比如：用户用 AI 改写了上一段（schema v3 上游 writingUnit 的 revision+1），下面的 ghost-text 候选 / 批注 anchor / 续写上下文（下游）没有主动失效，仍然引用旧 revision。这正是 Observable/Marimo runtime 设计要解决的。Pinax 没有显式 runtime，但 writingDocumentSchema v3 的 revision 字段已经隐含了 reactive 关系——只要给 revision 变化注册一个 invalidate 流程，让所有引用此 unit 的「candidate / annotation / inline mark」主动失效而不是默默错位，很多 bug 就能闭环。
**为什么不算实现方案**：这就是「revision→invalidate」一条规则；但是注册在哪里、谁能 trigger、性能成本，是实现层的事。
**可行性疑点**：批量编辑（一次改 10 段）会让 invalidate 风暴；需要 debounce + 分层 invalidate（先 invalidate 当前页 → 异步 invalidate 全文）。这套在 Pinax 已经有的 debounceMs 900 框架里是可行的，但需要先验证「批量改 10 段后所有候选都正确失效」的端到端用例。

---

### §A.13 cell-level output + cell-level review 面板（Deepnote / Colab 输出区）

**模式名**：每个 cell 自带 output 展示位 + review 行
**源产品 / 出处**：
- Deepnote output area + AI review block
- Colab output cell + comments
**机制简述**：每个 cell 不仅有 source，还有结构化 output（图表 / 表格 / 错误）。输出区有折叠 / 展开 / 评论按钮。
**Pinax 摩擦对应**：§1.3「资产流」「批量操作覆盖不全」。当前 `WritingNotebookEditor` 的「行内 ghost-text」「章节审查 batch」「续写参考资产」三个输出都堆在 `useWritingAgent` 状态里，用户很难区分哪个候选来自哪个 trigger。借鉴 cell-output 范式：每个候选 cell 自带「来源 + 模型 + 触发上下文 + 采纳状态 + 拒绝原因」，候选面板变成可翻查的 cell 列表而不是一次性结果。这直接对应「收件箱」「候选窗口」「批量操作」三合一。
**为什么不算实现方案**：现有 writingCandidates.js 已经记录了来源 + 模型，但消费方（UI）把它们压成扁平列表，没有把「单条候选 = 一等公民」的概念暴露给用户。
**可行性疑点**：候选量大了之后 cell-list UI 也会有性能 / 渲染问题；需要虚拟列表 + 按场景分组折叠。

---

### §A.14 「可恢复」作为 cell 的内禀属性（Marimo + nbformat metadata + snapshot）

**模式名**：revision / checkpoint 内嵌于 cell
**源产品 / 出处**：
- Marimo 自动保存每个 cell 的历史
- nbformat metadata 里 `execution_count` + cell-level `metadata` 字段
- nbformat v4 没有原生 version field；版本由外部工具（git / nbdime）管
**机制简述**：可恢复性 = cell 的内禀属性，runtime 知道「这个 cell 现在是什么版本、上一个版本是什么、何时改的」。
**Pinax 摩擦对应**：§1.3「块级恢复与全文快照共存」「自动草稿与手动快照耦合」。现在 Pinax 同时维护「block revision 数组」「全文 snapshot 数组」「自动草稿」三个恢复入口，UI 层把它们分到不同面板（§1.2「快照 / 块级历史 / 崩溃恢复」）。借鉴 cell 内禀历史：writingDocumentSchema v3 的每个 writingUnit 自带 `revisions[]`（不是单一 latest revision），所有 UI 面板（快照 / 块历史 / 崩溃恢复）从同一份数据派生，不再有「快照 vs. 草稿」的概念分歧。
**为什么不算实现方案**：实现这个等于把 writingUnit 的 storage shape 整个改一次，触及 WNB-6A 收尾。
**可行性疑点**：revisions[] 数组会持续膨胀；需要 retention 策略 + 压缩（比如只保留 last 20 + 手动 anchor）。这部分 WNB-6A 还没看到设计文档。

---

### §A.15 命令面板的「cell 上下文」扩展（VSCode Command Palette + JupyterLab Run Above/Below）

**模式名**：命令菜单的「作用范围 = cell / above / below / all」
**源产品 / 出处**：
- JupyterLab notebook 工具栏：Run / Run All / Run Above / Run Below / Restart Kernel
- VSCode Command Palette 的 `>Notebook: Run Cell` / `Run All Above` 等
**机制简述**：每个命令自带「scope」参数——作用在哪个 cell、当前之上的、当前之下的、全部。运行时按 scope 决定执行范围。
**Pinax 摩擦对应**：§1.3「命令菜单」「跨块操作」「多目标原子改写方案冻结」。Pinax 命令菜单当前没有 scope 概念——`/rewrite` 作用在当前选区，但「改写当前场景」还是「改写整个章节」靠用户自己先选好范围。借鉴 JupyterLab scope 模型：每个命令菜单的 item 自带 `scope ∈ {selection, paragraph, scene, chapter, all}`，用户选择时 runtime 根据 scope 自动选择目标。多目标原子改写天然落在 scene / chapter scope 上。
**为什么不算实现方案**：scope 是命令菜单的 UI 增强，不是底层机制改动；属于工作量适中的功能项。
**可行性疑点**：当前选区→paragraph→scene→chapter 的层级在 schema v3 里还不是 1-1 映射；scope 系统需要先把「scene 边界」「chapter 边界」做成显式 marker（heading? outline? writingUnit 边界？）才能跑起来。

---

### §A.16 「notebook = log」对长篇叙事的启发（Quarto / research notebook）

**模式名**：文档不仅是结果，也是过程日志
**源产品 / 出处**：
- Quarto / R Markdown：执行 trace + 结论 + 讨论同文件
- 研究者 notebook：观察记录 + 假设 + 验证 + 结论同页
**机制简述**：一份文档承载「我做了什么、为什么、得到什么结论」三件事，时序 + 因果可回放。
**Pinax 摩擦对应**：§1.3「schema 错位」「批注冻结」「多目标原子改写方案冻结」。长篇叙事创作里「我为什么删了这段」「AI 当时给的建议是什么」「这一稿和上一稿的差异」是宝贵的回顾材料，但当前 Pinax 没有 process log 概念——批注只记结果，snapshot 只记状态。借鉴 research notebook：每个 writingUnit 自带 `process log[]`，记录「什么时候、谁、为什么、做了什么」，批注可挂在 log entry 上而不是只在当前 revision 上。这能解决「批注 anchor 在 revision 切换后失效」的问题（anchor 挂在 log entry 上，永远有效）。
**为什么不算实现方案**：这是产品定位选择（process log 是隐私 / 公开 metadata，需要用户主动启用）。
**可行性疑点**：过程日志会快速膨胀；需要 retention + 用户可关闭。Privacy 角度，作者可能不希望 AI 厂商看到「我删了什么」的痕迹。

---

### §A.总结

把 cell-paradigm 的视角落到 Pinax 写作页，本质是回答三个问题：

1. **cell 边界** —— Pinax 现在 v2 schema 把「顶层段落 = 顶层块」耦合得太紧，导致 Enter 误建块；借鉴 nbformat 三态（prose / outline / raw）+ metadata 标签，能让 schema v3 writingUnit 拥有更清晰的边界语义，但要注意 Tiptap 的 schema 约束。
2. **reactive runtime** —— Pinax 没有显式 runtime，但 writingUnit 的 revision 字段已经隐含 reactive 依赖；借鉴 Observable/Marimo 的「上游改了 → 下游自动失效」，能给 §1.3 全表 bug 提供一个统一的根因解——只要给 revision 变化注册 invalidate 流程。
3. **可恢复** —— 当前 snapshot / 草稿 / 块历史三处并存是分层的脏话；借鉴 cell-level 内禀历史 + 过程日志，把恢复入口收敛到一份 `writingUnit.revisions[]`，是 WNB-6A 完成后值得推进的方向。

值得提醒：本节很多灵感都指向「schema v3 完成后的 v4 候选」而不是「现在能立刻上」。原因：§1.3 大量 bug 的根因是 schema v2/v3 未完成 + revision 流转不畅；本节给的模式很多都依赖 schema 先稳定下来。

---

### §A.Open questions

1. writingDocumentSchema v3 落地后，是否计划支持 cell metadata 层（tag / voice / init）？如果支持，批注 `targets[]` 是否能简化为「挂在 tag 上」而不是「挂在 block ID 数组上」？
2. revision 字段失效后的下游 invalidate 是否做？这条工作量评估如何？批量编辑场景下会不会引发 invalidate 风暴？
3. scene / chapter 边界当前是隐式的（靠 outline / heading），是否能升级为显式 marker？命令菜单的 scope 概念依赖此。
4. 写作过程日志（process log）是产品定位问题：作者要隐私还是要可回放？如果用户接受，是否能成为 WNB-6A 完成后的 v4 候选？
5. AI 候选作为 first-class cell 持久化在正文里，是否破坏当前「收件箱不污染正文」的契约？需要双轨：持久候选在收件箱，临时候选 inline。
6. reactive runtime 的具体形式：Marimo「全图重算」太重、Observable「增量」较重、Jupyter「手动」太轻——Pinax 应该选哪种？当前 debounceMs 900 的「轻 reactive」是已经选好但未显式化的方案。
7. 无法验证的项：Google Colab 2025/2026 的 Gemini AI 集成深度、Hex 的 reactive cell 最新 UI、Foam vs Dendron 在 2026 是否仍在维护——本节均基于二手来源整理，建议在做具体方案前用一手文档二次核实。

---

## §B AI IDE 范式（Cursor / Continue / Aider / Cline / Copilot Edits / Windsurf / Zed / Cody / Claude Code）

> **调研人**:B（并行 agent）。**scope**:行内 ghost-text、tab 采纳、多文件 agent、plan 模式、对话旁路、编辑 diff 流
> **方法**:联网检索 2025–2026 文档与第三方拆解文;不依赖单一来源;凡未直接验证的机制,标注 "I cannot verify"
> **事实前提**:Pinax 写作页是 Vue 3 + Tiptap + localStorage 多 provider;写作不存在 IDE 意义上的"工程文件树",但存在"卷宗 / 章节 / 块 / 资产"等价的语义树。AI IDE 的范式需要做"语义翻译"才能借鉴,而非直接搬运。

### §B.0 总览 —— AI IDE 的三条核心范式

通过对 2026 年主流 AI IDE 的横向梳理(品类包含 Cursor、GitHub Copilot、Windsurf、Continue.dev、Aider、Cline / Roo Code / Claude Code CLI、Zed AI、Cody、PearAI、JetBrains Junie),可以收敛为 **三条核心范式**:

| 范式 | 代表机制 | 核心心智 | 与写作页的隐喻映射 |
|---|---|---|---|
| **F1. 行内 ghost-text / inline assistant** | Copilot 行内补全、Cursor Tab、Zed Edit Prediction、Continue autocomplete、JetBrains inline | "继续写,Tab 采纳" —— 模型在光标处接话 | 映射到 Pinax 的 `WritingInlineCompletion` 行内续写 + Tab 采纳 / 关闭 |
| **F2. Chat 旁路 + plan 模式** | Copilot Chat / Workspace、Bito / Cody chat、Claude Code Plan Mode、Cursor Quick Question | "先说,再改" —— 旁路面板 + plan 预览 + 人工接受 | 映射到 `useWritingAgent` 收件箱 draft + 章节审查 batch + 资产请求 |
| **F3. 多文件 agent / composer** | Cursor Composer (Agent Mode)、Copilot Edits `#file` 多选、Windsurf Cascade、Aider architect、Cline checkpoints | "跨文件成一个意图" —— 缩略式跨域任务 + 工具调用 + 审批 | 映射到 跨块操作 / 多片段批注 / 资产四段流 / 多目标原子改写 |

**对写作页的核心启发**(不构成实现方案):
1. **F1 是当前最稳定的入口**,但容易被长文档 / Markdown 标记 / 跨块场景打穿,需要与 §A (cell 容器) + §D (block 标识) 协同改造。
2. **F2 比 F1 更适合长篇叙事**,因为 plan + 预览让"我要改 N 段"的歧义可被显式化;Pinax 当前 `useWritingAgent` 收件箱已经是半个 F2 雏形,缺的是"预览 / 接受 / 拒绝"的差分 UI 与跨块 anchor。
3. **F3 是远期愿景**,但落地前必须先解决 anchor 稳定性、多 provider 端点解析、writingDocumentSchema 改写能力三个底座问题。

**三条范式共同的 Pinax 摩擦**:
- **anchor 漂移**:行内 ghost-text 在多片段批注后会失锚;跨块 agent 任务尤其依赖稳定的"块 id / 段落 offset"。
- **接受 / 拒绝差分**:所有范式都需要清楚呈现"原 / 新"对比,Pinax 当前 InlineCompletion 只有"采纳"没有"差异预览"。
- **多 provider 端点**:GitHub Copilot、Cursor、Aider 都允许切换底层模型且改变上下文策略;Pinax 多 provider 架构必须对齐到 writingDocumentSchema。

### §B.1 Cursor —— `@`-symbol 上下文注入 + 多文件 Cmd-K / Composer

**源产品 / 文档**:
- Cursor 官方文档站 `docs.cursor.com`(Cmd-K、Composer、Context 子页)
- Cursor 官方博客 `cursor.com/blog` 与 `cursor.com/changelog`
- Cursor 中文教程类 CSDN / 知乎文章(2025 年后期至 2026 年)
- **I cannot verify** 单独 Cmd-K URL 段落内容(本次 WebFetch 暂不可用),以官方文档集 + 第三方拆解拼凑

**机制简述**:
Cursor 引入 `@`-symbol 上下文注入语法,包括 `@file`、`@folder`、`@codebase`、`@docs`(自定义或自动抓取的文档)、`@git`(git 历史)、`@lint errors`、`@terminal`、`@recent`、`@definitions`、`@web`。Cmd-K 是 inline edit/生成,Composer(Agent Mode + normal/agent 模式)是多文件流水线,Repository map 是底层 embedding / symbol graph 索引。Cmd-K 的 follow-up 允许同一指令链式 refinement。

**Pinax 摩擦对应** —— §1.3 **跨块操作**(多片段批注、查找同类、多目标原子改写方案冻结)+ §1.3 **命令菜单**:
- `@file` → Pinax 写作单元(章节 / 块 / 资产条目)显式引用,而不是靠 prompt 模糊匹配
- `@codebase` → 写作的"风格 / 角色卡 / 世界书"上下文,可在 chat 旁路按需注入
- `@docs` → 用户自定义的写作规范 / 大纲风格,落到 `writingDocumentSchema` 之外的 meta 配置
- `@lint errors` → 写作页的"一致性 / 重复 / 视角漂移"诊断,作为上下文注入
- Cmd-K follow-up → 续写 / 改写 cluster 链式调整,避免每次重新选区

**为什么不算实现方案**:
- `@` 注入语法在 Pinax 不是"工程文件路径",而是"卷宗 / 章节 / 块"的语义 alias —— 需要重新设计语义化的 mention 解析器,不能直接套用 `@filename.ts` 字符串。
- Composer Agent Mode 的"多文件工具调用"对 Pinax 等价于"跨块原子改写 + 资产四段流",锚点必须落到 `writingDocumentSchema` 的 blockId + revision,而不是文件路径。

**可行性疑点**:
- Vue 3 + Tiptap 的 mention 插件(TipTap `@tiptap/extension-mention`)只能给所见即所得的 inline 提及;若要支持 `@`-prefix 的 prompt 解析,需要额外的 input layer。
- localStorage-first 强迫 Repository map 在本地构建,不能用远程 embedding;Pinax 当前没有 symbol/embedding 索引,需要 §B.6 语义检索作为前置。
- 多 provider 端点 + writingDocumentSchema 约束:Composer 要求底层模型支持 tool-use + 大上下文;Pinax 当前 text-model 端点不一定都满足,需要按 schema 路由。

### §B.2 Cursor —— YOLO mode / 自动接受开关

**源产品 / 文档**:
- Cursor 0.45+ 引入了 YOLO mode(自动接受所有 Composer 改动),Changelog 多次迭代,见 `cursor.com/changelog`(2025 年)
- 第三方综述 CSDN「2026 年 AI IDE 选择指南」/ 知乎 Cursor 教程

**机制简述**:
YOLO mode 让 Composer 在不加人审的情况下,直接落盘所有改动。配套有"自动接受这一条 / 跳过 / 接受成新 anchor"等中间态。属于"信任模型 + 备份"的轻量级人机分工。

**Pinax 摩擦对应** —— §1.3 **ghost-text 与块稳定性** + **恢复**(块级恢复与全文快照共存):
- 若 YOLO 理念迁移,可以让"批量续写 / 改写 cluster"在一次确认后一次性落地,中间不再多次弹窗,缓解用户"被频繁打断"的体感。
- 但 Pinax 必须保留可逆性 —— localStorage 全文快照 + 块级恢复已经覆盖,需要让 YOLO 模式自动调用快照钩子。

**为什么不算实现方案**:
- YOLO 是产品哲学级开关,不是 button。Pinax 写作页当前每次续写 / 改写都需要用户按"采纳 / 拒绝",改为 YOLO 等于改产品气质,需用户决策。
- 没有"自动接受"的回流机制:Pinax 的 ghost-text 状态机里"接纳哪些,丢弃哪些"是手动 UI,YOLO 化的副作用必须被 `liveMarkdownPreview` 的 mark 系统处理。

**可行性疑点**:
- Vue 3 + Tiptap 的 transaction 系统可以加"全局 auto-accept"开关,但实际落地依赖事务边界;长文档下一个 transaction 可能是多个 block 合并,需要 schema v3 writingUnit 落地后才能稳定(Y 与 §B.7 联动)。
- 写作比编程更"不忍心回退":YOLO 适合代码(可 git revert),对写作是局部文字塑形,需要"shadow / todo apply"两阶段。

### §B.3 GitHub Copilot —— Chat 多文件引用 `#file` + Plan 模式

**源产品 / 文档**:
- GitHub Copilot 官方文档 `docs.github.com/copilot`
- GitHub Copilot Workspace 2024 Universe 公告(知乎/网易转载) + 2026 年 Agent Mode 升级报道
- 内部分解:CSDN「GitHub Copilot Agent 模式实战,Ask、Plan、Agent 和 MCP 怎么配合使用」

**机制简述**:
Copilot Edits 用 `#file`(等价 `#package.json`、`#src/app.ts`)显式把多个文件加入 Chat 上下文,指令如"把 foo 全部改名为 bar"会跨文件应用;Plan Mode 预览 diff 后再应用;Agent Mode 自己跑 plan → adapt_plan → update_plan_progress → record_observation → finish_plan 的内部工具链。

**Pinax 摩擦对应** —— §1.3 **跨块操作**(多片段批注、查找同类、多目标原子改写方案冻结)+ §1.3 **AI 渠道**:
- `#file` → Pinax 等价物是"卷宗 / 章节 / 块 id"显式 token,在 chat 旁路输入区解析,自动注入上下文。
- Plan Mode → 改写 cluster 预览(原 / 新) + 拒绝按钮,直接缓解目前 `useWritingAgent` 收件箱只有"采纳"没有"对比"的缺失。
- Agent Mode 内部 plan JSON → Pinax 的 `writingCandidates` 候选可视为一种 plan,需扩展到多文件 / 多块的跨域 plan。

**为什么不算实现方案**:
- Copilot 的"理解 diff"是 IDE 级别的 file diff 引擎,Pinax 是 ProseMirror 的 selection / block diff,需要重新实现面向"段落 + 标记"的差异计算。
- `#file` 语法在 single-doc + side-panel 场景下优势明显,Pinax 没有"side panel"对等物 —— 写作页的 chat 旁路是收件箱/drawer,不是 IDE 侧栏。
- Plan Mode 的"接受 / 拒绝后写回"涉及 schema 改写;`writingDocumentSchema` v2 每个 block 有 revision,plan-apply 等于 revision 推进,需要 schema 层支持。

**可行性疑点**:
- 多 provider 端点:GitHub Copilot 改换模型不影响 plan 框架,Pinax 当前多 provider 解析端点不一定都支持 plan。需要 provider 能力探测(类似 vscode-lm 的 model capability 列表)。
- 局部 vs 全局:Pinax 写作没有"工程文件树"概念,#file 注入的语义是什么(章节? 块? 资产条目?)需重新建模。
- Pinax 写作的"批注"本身就是另一种 #file-like 的引用,需要统一 mention 系统避免两套语法。

### §B.4 GitHub Copilot Workspace —— Spec → Tasks → Plan 流水线

**源产品 / 文档**:
- GitHub Universe 2024 公告:Github Copilot Workspace 「Brainstorm → Plan → Build → Test → Run」
- 知乎/网易科技报道:Github Copilot Workspace 技术预览(2024 年 4 月)
- I cannot verify Workspace 在 2026 是否仍独立产品(后期被 Copilot Agent Mode 吸收)

**机制简述**:
Workspace 把一个 Issue 或 PR 拆成可编辑的 "spec" + "tasks" 列表,每个 task 是一段自然语言 + 关联文件,允许用户在动手前先调整步骤,Br 然后每步走 build/test/run 的 pipeline。区别于 Composer/Agent 的"工具调用"流派,Workspace 是"任务列表"流派。

**Pinax 摩擦对应** —— §1.3 **资产流**(选区 → 收件箱 → 章节纲要 → 分镜四段,状态机分散)+ §1.3 **schema 错位**:
- 写作章节纲要本身就是一个 task list,可以从 Workspace 借"spec + tasks"双视图。
- 资产四段流(选区 → 收件箱 → 章节纲要 → 分镜)中间状态丢失,Workspace 风格的"任务卡 + 状态"可统一收件箱 + 章节纲要 + 分镜的差异。
- 一致性 / 视角连贯性审查可视为"task = check item",借鉴 plan → adapt_plan → finish_plan 的内部 pattern。

**为什么不算实现方案**:
- 写作的"任务"通常是大粒度(章节),不是小粒度(文件行);直接搬 spec/tasks 容易把章节搞成 to-do,失去叙事感。
- Workspace 假设有可执行的 build/test/run pipeline,Pinax 写作的"测试"是"读起来像不像",没有自动化反馈。
- 资产收件箱的状态机在多个组件里,需要先 unified state machine(Y 与 §E 现代 AI 写作工具的 outline 状态对接)。

**可行性疑点**:
- template-j 类的"spec editor"对长篇叙事太重,需要简化为"段落级 task card"。
- 与 §D (Logseq/Tana) 的 outliner 抽象可能撞车,需在汇总阶段(§F)做层级取舍。
- Story bible / 大纲 / 章节纲要 / 分镜 是 4 层 schema,Workspace 流派只支持 2 层(issue → task),需要横展。

### §B.5 Windsurf —— Flow awareness + Cascade + Memories

**源产品 / 文档**:
- Windsurf 官方 `docs.windsurf.com`(`Memories` / `Rules` / `Workflows` 三件套)
- Windsurf Unlocked 仓库 `github.com/joeynyc/windsurf-unlocked` —— 60+ 测试过的 `.windsurf/` 配置样例
- 第三方拆解:CSDN「Windsurf 解析 — Cascade 与 Flow 状态的工作流对比」

**机制简述**:
Cascade 是 Windsurf 的多模式 AI 协作引擎,跟踪打开文件、光标位置、终端输出、浏览器预览、edit history、文件变更(`DidChangeWatchedFiles`)。支持全局 + 项目级两档 Memories(`.windsurf/memories/`),Rules(`.windsurf/rules/`)作为硬约束,Workflows(`.windsurf/workflows/`)为可重用多步流程。"Flow" 概念上指"你与 AI 几乎无感的协作"。

**Pinax 摩擦对应** —— §1.3 **视觉漂移**(长文档缩放后当前行 / 命令菜单纵向漂移)+ §1.3 **恢复**:
- Cascade 的"文件变更监听"对等物是 Pinax 的"块 revision 流监听",可借来保持行内 ghost-text / 收件箱与文档同步。
- Memories(Rules + Workflows)是"项目级元配置",对等物是 Pinax 的写作卷宗 / 章节纲要 / 资产元数据,可考虑落到 `卷宗/.pinax/rules.yaml` 等价物。
- Flow awareness 里"光标位置 + edit history"组合是写"上下文快照"的天然原料,Pinax 的"块级历史 + 全文快照"可借此重组。

**为什么不算实现方案**:
- Windsurf Memories 是 IDE 级别的"workspace = project"模型,Pinax 写作是"卷宗 + 章节"两级,需要重新映射。
- Flow awareness 依赖 IDE 内置的多面板(editor + terminal + browser + debug),Pinax 写作只有"编辑器 + 收件箱 + 边注检查器",无法复制 4 面板的协同。
- `.windsurf/` 这类 dotfile 配置假设 git 仓库与代码协作,Pinax 写作的数据是 localStorage JSON,需要"逻辑 git"或"显式 export/import"过渡。

**可行性疑点**:
- Vue 3 + localStorage 生态下,Memos 只能写在 `卷宗/.pinax/memories.json`,无法走"文件夹即配置"。
- 写作比编程更需要"上下文感",但 Flow awareness 容易让 AI 跑得太远 → 改写章节纲要 / 资产状态这种副作用很难追溯。
- Workflows 的"可重用多步流程"对个人创作者价值不如团队 IDE 高,需评估单机收益。

### §B.6 Aider —— Repo Map + --map-tokens + edit-format 切换

**源产品 / 文档**:
- Aider 官方文档 `aider.chat/docs`(features、repo-map、edit-formats)
- Aider GitHub `github.com/Aider-AI/aider`(`base_coder.py` 中的 `RepoMap` 类)
- 第三方拆解:CSDN「Aider 的 Repo Map 功能」(2025 年) + 多个 GitHub Issue

**机制简述**:
Aider 是终端 AI 编程工具,核心机制是 Repo Map —— 自动基于 git 仓库的全文件列表 + 关键符号 + 符号定义行生成 token 受限的 project map,通过 `--map-tokens` 调窗口预算,通过 `--map-refresh auto` 自动更新。三种 edit-format:`diff`(SEARCH/REPLACE 块)、`whole`(全文重写)、`udiff`(unified diff);弱模型一般用 `whole`,强模型用 `diff`。支持 architect mode(双模型:一个规划,一个写代码)和 voice mode(语音输入)。

**Pinax 摩擦对应** —— §1.3 **AI 渠道**(text-model 空响应 / 30s 超时链;多 provider 端点解析)+ §1.3 **schema 错位**:
- Repo Map → Pinax 的"卷宗 / 章节 / 块 / 资产"语义索引,等价为"context window 预算分配器"。
- 三种 edit-format → Pinax 写作页续写 / 改写也有三类:续写 patch(等价 diff)、改写 cluster(等价 whole)、跨块替换(等价 udiff)。
- architect mode → Pinax 章节审查 batch(主写) + 风格审查(辅)的双模型模式已经存在雏形,需要把"规划 / 写"显式分离为多 provider 编排。

**为什么不算实现方案**:
- Repo Map 依赖 git 仓库状态,Pinax localStorage 没有 git,但可以借"卷宗 .pinax/.git-equivalent"作为语义层。
- edit-format 是底层 LLM 通信协议,Pinax 写作页不直接和模型对话,中间是 `writingCandidates` 候选协议,需要把"diff/whole/udiff"上升到候选协议的属性。
- voice mode 对写作听起来很顺,但 Pinax 没有 voice input 基础设施(浏览器 Speech API 可加,但不是核心精神)。

**可行性疑点**:
- Repo Map 是 Aider 性能/质量的关键杠杆,Pinax 没有等价工具;`liveMarkdownPreview` 只看当前行,需要 query-level index。
- `writingDocumentSchema` 的 v2 block 模式 + v3 writingUnit 模式切换期间,edit-format 选择本身会变,需要 schema-aware routing。
- 多 provider 端点对 edit-format 表现差异巨大(OpenAI 偏 `diff`,开源 7B 偏 `whole`),Pinax 必须 provider-aware。

### §B.7 Continue.dev —— 开源可配置 + 上下文提供者 chain

**源产品 / 文档**:
- Continue 官方文档 `docs.continue.dev`(Overview、Slash Commands、Context Providers)
- Continue GitHub `github.com/continuedev/continue`(`.continue/` 目录约定)
- 第三方拆解:Continue.dev vs Codeium 对比文章

**机制简述**:
Continue 是开源 IDE AI(对 VS Code / JetBrains),支持四种工作模式:autocomplete(行内)、edit(选中改写)、chat(对话)、agent(工具调用)。`.continue/config.json` 配置 model providers、context providers(`file`、`codebase`、`git`、`terminal`、`docs`、`database` 等可扩展)、slash commands(`/edit`、`/comment`、`/share` 等),允许用户完全自定义上下文注入 pipeline。

**Pinax 摩擦对应** —— §1.3 **AI 渠道**(多 provider 端点解析)+ §1.3 **资产流**(状态机分散):
- Pinax 的"行内 + 收件箱 + 章节审查 + 资产"已经是 4 modes 雏形,Continue 的四点分法可直接对齐。
- Context providers 链 → Pinax 写作可以"基于当前行 / 章节 / 资产 / 世界书 / 风格"组装上下文,等价于 `liveMarkdownPreview` 的增强版。
- Slash commands → Pinax 的 `/` 命令菜单已经在写,Continue 的 `/edit` / `/comment` 抽象可以直接迁移。

**为什么不算实现方案**:
- Continue 的 config.json 是 IDE 级别的可热加载配置,Pinax 写作页是面向用户的图形化设置,需要从"配置 IDE"翻译到"配置创作"。
- Continue 的"agent mode"依赖 IDE 工具调用(MCP 等),Pinax 没有等价工具,需要先建立"写作 agent = 续写 / 改写 / 审查 / 资产"的可调用抽象。

**可行性疑点**:
- Continue 的上下文 provider chain 在前端 localStorage 下面需要"持久化 + 重新加载",状态恢复复杂。
- Context providers 的"自动 vs 显式"两个模式,Pinax 的延迟性比 IDE 强(写作常切换章节),需要重新设计"何时自动注入"。
- Slash commands 的标准化(`/explain` / `/fix`)在中文写作场景下,要本地化抽象层的术语。

### §B.8 Cline / Roo Code / Claude Code CLI —— Plan & Act 双模式 + Checkpoints

**源产品 / 文档**:
- Cline 官方 `cline.bot` 与 `cline.net.cn`(中文)
- Roo Code GitHub `github.com/RooCodeInc/Roo-Code`(RooCodeInc 即原先的 Cline 分支)
- Claude Code 官方 `docs.anthropic.com/claude-code` + Plan Mode 攻略文章
- GitHub Issue:Roo-Code #4827(Checkpoints should be created before changes, not after)
- 第三方对比:SourceForge「Cline vs Roo Code」

**机制简述**:
Cline / Roo Code 是 VS Code 插件,Claude Code 是 CLI;三者的 Plan Mode 把任务拆解为步骤列表等待用户确认,Act Mode 才执行;Cline 提供 checkpoints(类似 git stash,每步可回滚),MCP 工具集成允许浏览器自动化与外部工具调用;Roo Code 加了"多种 chat mode"切换(Code / Architect / Debug / Custom)。

**Pinax 摩擦对应** —— §1.3 **恢复**(块级恢复与全文快照共存;自动草稿与手动快照耦合)+ §1.3 **跨块操作**:
- Plan Mode → 写作的"续写 / 改写 cluster"preview 是范式升级,可让用户先看步骤再确认。
- Checkpoints → 写作的"局部回滚"目前混杂在块级恢复 + 全文快照里,Checkpoint 概念可统一命名空间。
- MCP 工具集 → 写作的"外部工具" = 资产分镜 / 世界书 / 大纲,Pinax 已有等价抽象,需要平台化。

**为什么不算实现方案**:
- Cline / Roo Code 是 IDE 插件,假设有完整文件 IO + 终端 + 浏览器,Pinax 没有这部分。
- Claude Code CLI 的 Plan Mode 假设模型能拆 step,写作需求不一定能被 LLM 拆解,且"步骤"对长篇叙事颗粒度太细。
- Checkpoints 假设 git 仓库在背景等待 revert,Pinax localStorage 没有等价,但可借"卷宗 snapshot"伪实现。

**可行性疑点**:
- Pinax 写作页的"自动草稿" + "手动快照"耦合是当前 bug,Checkpoint 抽取可能进一步复杂化,需要先做"快照命名空间"层。
- Plan Mode 的"步骤确认"对中文写作者可能太频繁,YOLO 化(§B.2)与人工 confirm 之间需平衡。
- MCP 工具集在 Pinax 等价于"模型可调用 API",当前 `writingCandidates` 已经有候选/采纳端点,需要把内部 service 暴露为 tool 接口。

### §B.9 Zed AI —— Assistant Panel + Edit Prediction + ACP

**源产品 / 文档**:
- Zed GitHub `github.com/zed-industries/zed`(`assistant` 模块)
- Zed Issue #4486、#16321、PR #22160(Transform vs Generate 命名)
- 第三方:CSDN「Zed AI 白嫖免费模型,搭配 DeepSeek v4」(2026 年 4 月)

**机制简述**:
Zed 提供三层 AI 入口:inline assistant(选中即触发、可配置 model)、assistant panel(对话)、edit prediction(行内 ghost-text,类似 Cursor Tab 但机制不同)。2026 年引入 ACP(Agent Communication Protocol)允许外部 agent 接入。Tooklit 区分 "Transform"(改写)和 "Generate"(产出)两种动作。

**Pinax 摩擦对应** —— §1.3 **ghost-text 与块稳定性** + §1.3 **命令菜单**:
- "Transform vs Generate" 的命名区分 → Pinax 的命令菜单当前统一为"操作",可分两档"改写 vs 续写",更好心智。
- Edit Prediction 与 inline completion 的双轨 → Pinax 的 `WritingInlineCompletion` 是单一引擎,可考虑拆为"预测(轻量)" + "补全(可中断)"。
- ACP 外部 agent 接入 → Pinax 多 provider 端点架构,可以让用户接自定义"风格审查 agent"。

**为什么不算实现方案**:
- Zed 用 Rust 写编辑器,Pinax 走 Tiptap JS,底层流式 / 异步机制不同,直接搬运成本高。
- ACP 协议需要稳定的 agent 注册中心,Pinax 是单机 localStorage,落地价值不大。

**可行性疑点**:
- Edit Prediction 的轻量级机制(局部概率 + 短上下文)需要前端 token 估算,Pinax 当前 `liveMarkdownPreview` 是字符串层,需要更深的 token 感知。
- Transform / Generate 区分对 UX 是个纯命名问题,落地的最大阻力是 UI 而不是后端。

### §B.10 Sourcegraph Cody —— Code Graph + Attribution + Custom Commands

**源产品 / 文档**:
- Sourcegraph Cody 仓库 `github.com/sourcegraph/cody`(command-core.test.ts / command-custom.test.ts 显示 custom commands 已长期存在)
- Sourcegraph `sourcegraph.com/docs/cody`
- I cannot verify:目前 Cody 是否仍是独立产品(2024 年后期被讨论整合)

**机制简述**:
Cody 用 Sourcegraph 的 code graph 做上下文检索,提供 context menu 行内命令、attribution(代码出处 / 引用追踪)、custom commands(用户自定义 `/` 命令,通过 JSON 配置)、commands 包含 test / smell / explain 等内置。

**Pinax 摩擦对应** —— §1.3 **命令菜单** + §1.3 **AI 渠道**:
- Custom commands → Pinax 的 `/` 命令菜单可走"用户自定义模板"路线,允许写作者定义"我的视角检查 / 中文错别字批改"。
- Attribution → 写作的"引用 / 灵感出处"对等物,资产收件箱本身就是 attribution 的资产化版本。
- Code Graph → 写作的"章节 / 段 / 资产"图谱,等价于 narrative dependency graph。

**为什么不算实现方案**:
- Cody 依赖 Sourcegraph 整库索引,Pinax 没有这种后台服务,只能前端构造 graph。
- Attribution 在写作里就是"资产元数据 + 引用块",不是新增系统。

**可行性疑点**:
- 用户的"自定义命令"会加剧命令菜单的复杂度,需要先做"command menu schema"层。
- Code Graph 落地成本高,在 §E(现代 AI 写作工具)的"视角 / 角色一致性"维度上,可能由 §C/D 先给出轻量方案。

### §B.11 JetBrains AI Assistant / Junie —— 选区上下文 + 计划模式

**源产品 / 文档**:
- JetBrains 官方 `jetbrains.com/help/ai-assistant`
- JetBrains AI 2026 升级:Junie 集成(编程代理)
- 第三方对比:2026 AI IDE 对比类文章
- I cannot verify 具体 sub-feature URL(本次 WebFetch 暂不可用)

**机制简述**:
JetBrains AI 在选区上下文、refactor prompt、Explain 之上,Junie 是新的 agent 模式,支持 code task plan + act。上下文拼接高度尊重 IDE 的"选区 + 符号 + 当前文件"语义,prompt 模板与 IDE 视图深度集成。

**Pinax 摩擦对应** —— §1.3 **命令菜单** + §1.3 **跨块操作**:
- 选区上下文拼接 → Pinax 的"选区 + 当前章节 + 当前卷宗"上下文拼接,需要在 `useWritingAgent` 里显式分级。
- Junie 计划模式 → 类似 Cline,但与 JetBrains 的"refactor"心智结合更紧;Pinax 写作的"改写 cluster"同样需要"先 plan 再 act"。

**为什么不算实现方案**:
- JetBrains 的"IDE 集成"对 Pinax 等价于"Tiptap 集成",后者目前没有"重构"等价的 Tiptap 扩展。
- Junie 依赖 JetBrains 整套工具调用,Pinax 写作页不通用。

**可行性疑点**:
- 选区上下文的"选区 + 符号"在 ProseMirror 里没有符号概念,需要"块定位 + 字符 offset"代替。
- 计划模式输出对长篇写作太滞,需要"段落级 plan"而不是"步骤级 plan"。

### §B.12 跨产品横向 —— 行内补全 + 收件箱 + 行动计划的长叙事适配

**对比矩阵**(5 维度 × 6 产品):

| 维度 | Cursor | Copilot | Windsurf | Aider | Cline | Zed |
|---|---|---|---|---|---|---|
| 行内 ghost-text | Tab(强) | Copilot 补全(强) | Supercomplete | (无独立) | (无) | Edit Prediction |
| Chat 旁路 | Composer | Chat + Workspace | Cascade | main loop | Plan & Act | Assistant Panel |
| 多文件 | Agent Mode | Edits `#file` | Cascade | repo map | Cline tools | (无) |
| Plan 模式 | Composer | Agent Mode | Cascade | architect | Plan Mode | (无) |
| Checkpoints | (无) | (无) | (无) | (git auto-commit) | Cline checkpoints | (无) |

**对 Pinax 写作页的共同提示**:
- **行内 ghost-text 不可取消**:所有 IDE 都保留,作为"心智零成本"的心流入口。Pinax 需保持 `WritingInlineCompletion` 稳定性,优先级高于新功能。
- **Chat 旁路是批处理入口**:所有 IDE 的 chat 都支持"选区外 + 上下文注入",Pinax 收件箱正好对等,差异在"预览 diff"。
- **多文件 / 跨块是写作精英需求**:Pinax 写作的"跨块改写"需先在 schema v3 writingUnit 落地(Y)再做 UI,跨块是写作的"高阶玩法"。
- **Plan 模式是 acceptance 关键**:写作不像代码有 build/test,plan 预览 + 接受 / 拒绝是用户唯一的"诚实反馈"。Pinax 当前只有"采纳"按钮,缺"差分预览"。
- **Checkpoints 比 git 更适合写作**:Pinax 的"块级恢复 + 全文快照"已经覆盖,但缺命名空间一致性。

### §B.13 灵感 → 落地前必须明确的 5 个 Pinax 特有约束

1. **语义树 ≠ 文件树**:Pinax 的"卷宗 / 章节 / 块 / 资产"是 narrative 语义树,不是 IDE 文件树。所有 AI IDE 的 `@file` / `#file` / Repo Map 都需要经过"语义翻译"再注入。
2. **writingDocumentSchema 是硬约束**:续写 / 改写 / 审查 / 资产四类的输出必须通过 schema 校验,任何 IDE 范式不能绕过 validator。
3. **多 provider 端点 ≠ 同一行为**:Pinax 的 text-model 端点不一定都支持 tool-use / 大上下文 / diff-format,需要 provider 能力矩阵(类似 vscode-lm model capabilities)。
4. **localStorage-first 限制远程服务**:Repo Map / Embedding / Code Graph 都依赖后台,Pinax 必须做"本地等价物"或"显式 export/import"。
5. **写作不接受频繁中断**:YOLO 与 Plan Mode 都有频繁弹窗,需要"段落级 delta"作为最低粒度,Y 与 §A cell 容器 + §D block 标识耦合。

### §B.总结 —— 对 Pinax 写作页的 3 条收敛判断

1. **F1(行内 ghost-text) 短期优化方向**:把 `WritingInlineCompletion` 稳定到 blockId + revision 锚定,Markdown 标记 / 多片段批注后自动校正;不做激进大改。
2. **F2(chat 旁路 + plan) 中期优化方向**:把 `useWritingAgent` 收件箱升级为"Plan / Preview / Accept"差分 UI,接受 / 拒绝前显示 diff;支持多 provider 端点对 plan 的能力探测。
3. **F3(多文件 agent) 长期愿景**:落地 schema v3 writingUnit 后,跨块 / 跨章节 / 跨卷宗 的 agent 任务(ID-锚定 + atomic apply + checkpoint)才能展开;写作资产四段流整合为"任务卡 + 状态机"。

### §B.Open questions

- **OQ-B1**:Pinax 写作的"语义树"如何与 AI IDE 的 @-mention 语法对齐?是新增 `@@chapter` / `@@block` / `@@asset` 语法,还是复用现有 `/` 命令菜单?
- **OQ-B2**:写作 plan 的颗粒度是"句子级 / 段落级 / 章节级",Pinax 写作的最佳粒度在哪里?这与 §A cell 容器 + §D block 标识对齐。
- **OQ-B3**:writingDocumentSchema 是否需要扩展"plan" 字段?若要,谁来生成,谁来 consume(Y 与 §E 现代 AI 写作工具对接)?
- **OQ-B4**:多 provider 端点的能力矩阵谁维护?是否落到 `卷宗/.pinax/provider-capabilities.json`?
- **OQ-B5**:写作的"Checkpoints"是否值得做"自动 + 命名 + 可分享"的版本?与 §B.5 Windsurf Workflows 流派的关系?
- **OQ-B6**:Pinax 写作的 YOLO 模式(自动接受 cluster)在哪里最有用?章节首次生成 / 批量改写 / 自动草稿?
- **OQ-B7**:Repo Map / Code Graph / Embedding 索引,Pinax 是否做"语义版本"?这与基础架构投入相关,需与项目长期计划对齐。

### §B.引用源(本次联网核实)

- Cursor 官方文档站 `docs.cursor.com`(Cmd-K / Composer / Context)—— 通过第三方 CSDN / 知乎教程侧面引用,**I cannot verify** 直接 URL 段落
- GitHub Copilot 文档 `docs.github.com/copilot` + Workspace 2024 Universe 报道
- GitHub Copilot 2026 升级报道(CSDN「GitHub Copilot Agent 模式实战」/ 网易 Build 2025)
- Windsurf 官方 `docs.windsurf.com` + `github.com/joeynyc/windsurf-unlocked` 社区配置
- Aider 官方 `aider.chat/docs` + GitHub `github.com/Aider-AI/aider`
- Cline 官方 `cline.bot` + Roo Code `github.com/RooCodeInc/Roo-Code`
- Claude Code 官方 `docs.anthropic.com/claude-code` + Plan Mode 攻略(CSDN / 博客园)
- Zed GitHub `github.com/zed-industries/zed`(Issue #4486 / #16321 / PR #22160)
- Sourcegraph Cody GitHub `github.com/sourcegraph/cody`
- Continue.dev 官方 `docs.continue.dev`
- JetBrains AI / Junie 官方 `jetbrains.com/help/ai-assistant`(具体 sub-feature URL **I cannot verify**)

## §C 批注与边注系统（Hypothesis / MarginNote / LiquidText / Diigo / Readwise）
> **调研人**:C（并行 agent）。**scope**:边注 / margin / inline note / threaded reply / 标注类型
>
> **调研日期**:2026-08-17。**立场**:发散灵感，不写实现。每条灵感都要回应 §1.3 的具体症状，并解释为什么它**不直接是**一个 Pinax 可落地的方案。
>
> **核心张力**（贯穿全文）：
>
> 1. **持久化 vs 漂移**：anchor 是绑字面文本 / 字符 offset / 节点 ID / XPath / 派生语义？编辑、格式迁移、版本切换下如何不丢？ → 直接命中 §1.3「跨块多片段批注 / 选区漂移」「块级恢复」。
> 2. **单条 vs 线程**：批注本身是一次性评论，还是要支持回复 / 解决 / 状态机？ → §1.3「批注线程 / 章节审查」。
> 3. **私有 vs 协作**：单人 / 同设备同步 / 公开 group / LMS 课堂 / 跨人协作？ → §1.3 当前全部本地化，无后端协同。
> 4. **视觉 vs 后台**：批注是高亮 + 数字胶囊，还是彻底后台数据库？批量审查时如何折叠/展开？ → §1.3「视觉漂移」「长文档缩放后当前行纵向漂移」。
> 5. **AI 接入方式**：批注是宿主 AI 的入口（Polar chat、Readwise Ghostreader），还是批注本身作为 AI 上下文（MarginNote review、Diigo outliner）？ → §1.3「按批注改写」「AI 渠道多 provider」。
>
> **§1.3 痛点复述**（供本节灵感对齐）：
> - 「schema v2/v3 把每个顶层段落当独立块，Enter 误建块」
> - 「行内续写在 Markdown 标记 / revision 干扰下错位；多片段批注后选区漂移」
> - 「跨块多片段批注、查找同类、多目标原子改写方案冻结」
> - 「批注线程 / 章节审查」尚不完整
> - 「资产流 / 选区 → 收件箱 → 章节纲要 → 分镜四段」状态机分散
>
> **未验证声明统一记号**：「I cannot verify」标在内容后（不编 URL）。
>
> ---
>
> ### §C.0 调研方法与来源说明
>
> 本节灵感主要来自以下产品/规范/文章（URL 已尽量 fetch 验证；无法验证的注明）：
>
> - **W3C Web Annotation Data Model (Recommendation, 2017-02-23)** — 已 fetch 验证：[https://www.w3.org/TR/annotation-model/](https://www.w3.org/TR/annotation-model/)（定义 Body/Target/Motivation/Selectors，是批注系统的元模型基础）。
> - **W3C Web Annotation Protocol** — [https://www.w3.org/TR/annotation-protocol/](https://www.w3.org/TR/annotation-protocol/)（I cannot verify fetch，因为本次 fetch 失败，仅出现在搜索摘要）。
> - **W3C Web Annotation Vocabulary** — [https://www.w3.org/TR/annotation-vocab/](https://www.w3.org/TR/annotation-vocab/)（I cannot verify fetch；常见做法是把 motivation 当 RDF vocabulary 公开）。
> - **Hypothesis 官网** — [https://web.hypothes.is/](https://web.hypothes.is/)（已 fetch，但是 marketing 页；技术细节在 docs 子站）。
> - **Hypothesis anchoring docs** — [https://web.hypothes.is/help/anchoring-annotations/](https://web.hypothes.is/help/anchoring-annotations/)（fetch 失败，I cannot verify 2025-02 的更新文案；搜索摘要提到 v2025.1 client 改进了 prefix/exact/suffix 算法 — **I cannot verify 该 release note 是否真实存在**）。
> - **GitHub Issue #407 (hypothesis/client)** — [https://github.com/hypothesis/client/issues/407](https://github.com/hypothesis/client/issues/407)（search 摘要命中，描述 invalid TextQuote Selector 会导致整页高亮的 bug — I cannot verify 现状）。
> - **MarginNote 官网** — [https://marginnote.com/](https://marginnote.com/)（search 摘要：「13 years since MN1 (2013)... highlights, mind-map notes, and flashcards in one study set」）。
> - **MarginNote 4 中文站** — [https://www.marginnote.com.cn/](https://www.marginnote.com.cn/)（search 摘要：「文档摘录 · 脑图节点 · 闪卡复习 — 同一张卡片, 三处都用」）。
> - **MarginNote 中文社区** — [https://bbs.marginnote.cn/](https://bbs.marginnote.cn/) / [https://forum.marginnote.com/](https://forum.marginnote.com/)（含「Import Export」「Study Module」「Mindmap」「Plugins and MacOS AppleScript」分区 — I cannot verify 当前活跃度）。
> - **LiquidText 官网** — [https://www.liquidtext.net/](https://www.liquidtext.net/)（「PDF Editor with Superpowers」 by FastCompany）。
> - **Readwise 官网** — [https://readwise.io/](https://readwise.io/) / [https://read.readwise.io/](https://read.readwise.io/)（Reader all-in-one reader，support highlights + Ghostreader AI）。
> - **Readwise Obsidian plugin** — search 摘要：[https://blog.csdn.net/eclipsercp/article/details/141110253](https://blog.csdn.net/eclipsercp/article/details/141110253)（第三方教程）。
> - **Zotero 官方文档** — [https://www.zotero.org/support/notes](https://www.zotero.org/support/notes)（「child notes belong to a specific item, standalone notes」）/ [https://www.zotero.org/support/groups](https://www.zotero.org/support/groups)（group library types）/ [https://www.zotero.org/support/pdf_reader](https://www.zotero.org/support/pdf_reader)（Zotero 7 built-in PDF reader + sticky notes）。
> - **Notion Web Clipper 官方** — [https://www.notion.com/help/guides/notion-web-clipper](https://www.notion.com/help/guides/notion-web-clipper) / [https://www.notion.com/blog/notion-web-clipper-features](https://www.notion.com/blog/notion-web-clipper-features) / [https://www.notion.so/web-clipper](https://www.notion.so/web-clipper) / [https://www.notion.com/help/guides/ai-web-clipper](https://www.notion.com/help/guides/ai-web-clipper)。
> - **Reflect 博客** — [https://reflect.app/blog/mem-is-now-reflect](https://reflect.app/blog/mem-is-now-reflect)（Mem.ai 已重命名为 Reflect；具体功能细节 I cannot verify 原文，仅 search 摘要确认 rebrand 事实）。
> - **Polar 官网博客** — [https://www.polar-app.com/blog/pdf-reader](https://www.polar-app.com/blog/pdf-reader)（「inline notes, highlights, and AI chat」— search 摘要；2024-11-15）。
> - **Polar GitHub** — [https://github.com/actuallymentor/polar-app](https://github.com/actuallymentor/polar-app)（「Open-source document reader with AI chat, inline annotations」）。
> - **Heptabase** — [https://heptabase.com/](https://heptabase.com/) / [https://sspai.com/post/85171](https://sspai.com/post/85171) / [https://zhuanlan.zhihu.com/p/458057518](https://zhuanlan.zhihu.com/p/458057518)（白板 + 卡片 + 双链 + Map 视图 — search 摘要）。
> - **Are.na** — search 摘要描述：blocks + channels，「collect vs connect」哲学，多用户 block annotation（I cannot verify reverse image search 是否原生）。
> - **Liner 官网** — [https://liner.com/](https://liner.com/)（web highlight + AI 引用 — search 摘要）。
> - **Cubox** — search 摘要：「Smart Highlighting & Note-Taking」「Auto-Categorization」— I cannot verify 官网原文。
> - **Glasp 官方博客** — [https://blog.glasp.co/](https://blog.glasp.co/) / [https://github.com/glasp-co/glasp-export](https://github.com/glasp-co/glasp-export)（自动 export highlights 到 Slack/Notion — search 摘要）。
> - **Genius** — search 摘要描述：lyrics annotation + IQ 系统 + 编辑审核 + 艺术家合作伙伴（I cannot verify 当前合作伙伴名单；MediaLab 2021 收购事实 search 摘要）。
> - **Diigo** — search 摘要描述：web clip + highlight + sticky note + group + classroom（具体功能 I cannot verify 官网原文，仅二手评论）。
> - **Kinopio** — search 摘要：「cards (pinos) connected by lines」「visual thinking」（I cannot verify 官网具体 feature 列表）。
> - **MarginNote Anki workflow** — [https://zhuanlan.zhihu.com/p/26651332](https://zhuanlan.zhihu.com/p/26651332) / [https://zhuanlan.zhihu.com/p/61491849](https://zhuanlan.zhihu.com/p/61491849)（MarginNote→Anki 卡片工作流 — search 摘要）。
>
> ---
>
> ### §C.1 W3C Web Annotation 范式：Body+Target+Selector+Motivation
>
> - **模式名**：WA-Compose（Web Annotation Composition）
> - **源产品**：W3C Web Annotation Data Model — [https://www.w3.org/TR/annotation-model/](https://www.w3.org/TR/annotation-model/)
> - **机制简述**：批注是「Body 关于 Target」的关联，可挂载多种 selector（TextQuote prefix/exact/suffix、TextPosition start/end、RangeSelector、CSSSelector 等），并带 motivation 字段（commenting / highlighting / tagging / questioning / moderating / replying …）。Body 可为 IRIs、TextualBody 或 Choice 列表。
> - **§1.3 对应**：跨块多片段批注（multi-target）。schema v2/v3 在 writer 侧不稳定，可把「锚点」的稳定性问题外包给一个独立的「selector 链」概念；一个 annotation 持有多 target，每个 target 独立选 selector，AI 改写时只动 body，不动 target。
> - **为什么不算实现方案**：WA 是数据模型层，不是 UI。Pinax 当前 `writingAnnotation` 已是 ad-hoc schema（锚点是 blockId+offset 字面），引入 WA 模型等于推倒重来 schema；且 schema v3 writingUnit 还没贯通。
> - **可行性疑点**：Tiptap 节点本身是 ProseMirror schema；要塞 RangeSelector 需要序列化 ProseMirror 的 from/to + DOM Range — 已有 `writingCandidates` / `liveMarkdownPreview` 链路上没有该抽象；多 selector 链会增加批注 UI 复杂度（用户为什么要在「按文本前缀」和「按节点 ID」之间选？）；vendor 锁定性高。
>
> ---
>
> ### §C.2 Hypothesis TextQuote Selector + 前缀/后缀防漂移
>
> - **模式名**：Anchor-By-Context
> - **源产品**：Hypothesis — [https://web.hypothes.is/](https://web.hypothes.is/) / [https://web.hypothes.is/help/anchoring-annotations/](https://web.hypothes.is/help/anchoring-annotations/)
> - **机制简述**：annotation 不只锚字面 exact 字符串，而存 prefix（前文）+ exact + suffix（后文）三元组。DOM 改动后从 prefix 后向前找 exact，再从 exact 向后校验 suffix，提供「最接近匹配」降级 — 这就是 Hypothesis 网页批注在 DOM reflow 后仍能定位的根本原因。
> - **§1.3 对应**：选区漂移、块级恢复、跨块多片段批注。任何在 Tiptap 内的格式 toggle / Enter / 行内续写都可能改 revision；Hypothesis 范式给出的应对是：anchor 不信任 revision，信任 surrounding text。
> - **为什么不算实现方案**：Pinax 写作单元是块级（blockId+kind），不是 web 文档流式文本。直接套 prefix/exact/suffix 会让批注 schema 退化到「整篇文本的字符串 slice」，丢失 block 身份 — 而 block 身份是 §1.3「块级恢复」的根。Hypothesis 范式应**作为 inspiration**，不是**作为 anchor 实现**。
> - **可行性疑点**：Tiptap 的 Enter 会拆 block；同一段 markdown 文本在 v2/v3 schema 下可被切成不同 block，前缀/后缀匹配一旦跨 block 边界就 fail。prefix/exact/suffix 的长度选择（多少字算足够）需要启发式，且写作者切换 prose → outline 时容易断。
>
> ---
>
> ### §C.3 MarginNote 范式：一卡三用（excerpt / mindmap node / flashcard）
>
> - **模式名**：Card-as-Tri-View
> - **源产品**：MarginNote 4 — [https://marginnote.com/](https://marginnote.com/) / [https://www.marginnote.com.cn/](https://www.marginnote.com.cn/)
> - **机制简述**：阅读时对 PDF/EPUB 选区生成「卡片」，该卡片同时是文档摘录、脑图节点、复习闪卡的同一数据对象，三视图同步编辑。卡片可拖入脑图、导出 Anki、生成大纲；卡片既是源也是产物。
> - **§1.3 对应**：资产流（选区 → 收件箱 → 章节纲要 → 分镜 四段状态机分散）。MarginNote 范式的优雅在于**没有四段**，只有一个对象三个 view：同一份「批注/选区」在不同任务（脑图 vs 复习 vs 引用）里复用，避免「先收件箱 → 升级为纲要 → 升级为分镜」的状态机爆炸。
> - **为什么不算实现方案**：Pinax 资产有强烈的角色差异（分镜是 screenplay 风格，纲要是 outline，摘录是 raw text），强行合并会让三类用户的「批注」变得不可预测。MarginNote 是阅读→学习的流，没有 Pinax 的「主动写作」语义。
> - **可行性疑点**：Tiptap 节点本身不是可拖拽的卡片；引入 mindmap 视图需要新渲染层（react-flow / canvas / svg），与现有 ProseMirror 编辑器双轨并行的同步是已知复杂区（§1.3 已有「视觉漂移」）。卡片 schema 跨 ProseMirror / 脑图 / 闪卡三层，需要在三者之间维持稳定 ID — 当前 writingUnit 还没贯通，谈三视图合并过早。
>
> ---
>
> ### §C.4 LiquidText 范式：跨页节点 + 文本 span 链接
>
> - **模式名**：Span-As-First-Class-Citizen
> - **源产品**：LiquidText — [https://www.liquidtext.net/](https://www.liquidtext.net/)
> - **机制简述**：阅读时选出的文本 span（跨页、跨文档）可作为基本对象，被「拖拽连接」到其它 span，形成「事实链 / 论证链」。span 不只属于某一页，而是独立悬浮；可视化用「缩略图 + 节点」的画布布局。
> - **§1.3 对应**：跨块多片段批注 + 原子改写。LiquidText 的 span-first 模型把「批注」重新定义为「span 之间的边」，恰好对应 §1.3 冻结的「多目标原子改写」 — 一条批注可指向多个 span，改写时按 span 集体回写。
> - **为什么不算实现方案**：LiquidText 是 PDF/EPUB 阅读器，文档是静态分页的；Pinax 是流式主动写作，文档每分钟都在改。span 在 PDF 页坐标系里稳定，但在 ProseMirror 修订里几乎永远不稳定。LiquidText 的画布布局假设「阅读是慢的，批注是收集」，Pinax 的「写作是快的，批注是反馈」节奏相反。
> - **可行性疑点**：跨页 span 依赖 PDF 坐标；Tiptap 没有「页」概念，最接近的是 block + viewport，但 viewport 本身随缩放/折叠/收件箱打开而变化（§1.3 视觉漂移）。span-as-first-class 需要在 writingAnnotation 模型里额外存一组 spanId — 与现有 blockId+offset 双轨，又是一次「边注是另一种对象」 vs 「边注是 block 的属性」的争论。
>
> ---
>
> ### §C.5 Readwise 范式：highlight first → AI chat over highlights
>
> - **模式名**：Highlights-As-AI-Context
> - **源产品**：Readwise Reader — [https://read.readwise.io/](https://read.readwise.io/) / Readwise 主站 [https://readwise.io/](https://readwise.io/)
> - **机制简述**：阅读器把所有 source（文章 / PDF / EPUB / Twitter / Newsletter / YouTube）统一为「高亮 + 上下文」流；Ghostreader AI 可以对**全部高亮**或**单条高亮**提问；导出到 Notion / Obsidian / Roam 时高亮是原子。AI 是「批注流的消费者」，不是单文档的助手。
> - **§1.3 对应**：按批注改写 + AI 渠道多 provider。Pinax `useWritingAgent` 当前是「单文档上下文」的 AI；Readwise 范式提示 AI 可以按**批注集**操作 — 「把这三条批注对应的段落改写得更紧凑」是 AI 的批注级 query，与文本 query 解耦。
> - **为什么不算实现方案**：Pinax 的写作是连续过程，批注是高密度反馈（每个 block 都可能有 1-3 条批注）；Readwise 是阅读者视角，批注是稀疏精选（每篇文章 <10 条）。两者对「批注」的角色定义不同。AI 入口从「文档 query」改成「批注 query」需要重写 agent 路由。
> - **可行性疑点**：Readwise 的 highlights 同步到 Notion 是异步 batch，不是流式交互；Pinax 的 agent 是 900ms debounce 行内 ghost-text。把「批注级 AI query」加进去会与现有 `useWritingAgent` 并行触发 — 需要明确二者的触发语义（是分页签 / 是浮条 / 是快捷命令）。多 provider 路由（text-model 空响应 + 30s 超时）会让批注级 query 更难稳定。
>
> ---
>
> ### §C.6 Diigo 范式：sticky note + 数字胶囊 + group + classroom
>
> - **模式名**：Sticky-Note-As-Drop
> - **源产品**：Diigo — 二手来源描述（I cannot verify 当前官网原文）
> - **机制简述**：网页选区后挂一个 sticky note（黄色矩形 / 浮动），不是修改底层 DOM；note 上有评论、tag、可见性（私有 / 小组 / 公开）；classroom 模式下 note 可作为讨论单元。老师/学生围绕同一段文本形成 thread。
> - **§1.3 对应**：批注线程。Pinax 当前「边注重开 anchor」「批注线程」功能残缺；sticky note 范式提示线程不必绑 anchor — 一个 thread 可挂多个 anchor（多片段批注），也可不挂 anchor（block 级评论）。
> - **为什么不算实现方案**：Diigo 是 web overlay，依赖在页面 DOM 注入 iframe；Pinax 是 Tiptap 自家节点，要的 sticky note 是 inline mark / 边栏 UI，不是 iframe 注入。Diigo 的 classroom mode 假定有老师/学生角色，Pinax 是单用户/可选协作。
> - **可行性疑点**：sticky note 的「浮动」需要 CSS absolute 定位 + viewport 滚动同步（§1.3 视觉漂移）；多 fragment thread 需要在 writingAnnotation 上加一个 thread 概念；group/classroom 需要后端 — 当前 Pinax 数据全在 localStorage，引入 group 等于换存储范式。
>
> ---
>
> ### §C.7 Genius 范式：moderation + 公开 + IQ 信誉系统
>
> - **模式名**：Trust-Tiered-Annotation
> - **源产品**：Genius — 二手来源（I cannot verify 当前官网/政策原文）
> - **机制简述**：每条 annotation 由「贡献者」发布后进入 moderation 队列；verified editor 通过后才公开显示；贡献者获得 IQ 信誉分。批注是公开资产，不是私有评论。艺术家可与 Genius 合作（VERIFIED ARTIST 标签）。
> - **§1.3 对应**：批注线程 / 章节审查。Pinax 「章节审查 batch」是把所有批注一次性交给 AI 看 — Genius 范式提示审查可以是「分阶段」：私有 → 待审 → 已采纳 → 已解决 状态机。
> - **为什么不算实现方案**：Pinax 没有公开批注分发；「信誉系统」在没有社区时无意义。引入 moderation 队列在没有多人协作时是过度设计。
> - **可行性疑点**：moderation 是异步多角色工作流，要后端 + 队列；当前架构是 localStorage + 一次性 agent 调用。IQ 系统要求追踪贡献历史，与 §1.3 「资产流分散状态机」合并后会再添一层。
>
> ---
>
> ### §C.8 Polar 范式：inline sticky note + AI chat over 单文档
>
> - **模式名**：Inline-Note-+-Doc-AI
> - **源产品**：Polar — [https://www.polar-app.com/blog/pdf-reader](https://www.polar-app.com/blog/pdf-reader) / [https://github.com/actuallymentor/polar-app](https://github.com/actuallymentor/polar-app) / [https://www.producthunt.com/posts/polar-app](https://www.producthunt.com/posts/polar-app)
> - **机制简述**：阅读 PDF/EPUB 时，每条 highlight 可直接挂一个 sticky note（不是另开 panel）；AI chat 在 doc 内 inline 出现，回复引用页码 + 段落。AI 是「doc-resident」，不是「app-resident」。
> - **§1.3 对应**：按批注改写。当前「写作批注 → 改写」是 inspector 面板 + agent 收件箱两步；Polar 范式把 sticky note 和 AI reply 紧贴 highlight，缩短回路。
> - **为什么不算实现方案**：Polar 假设文档是只读的（PDF）；Pinax 是写入型编辑器，sticky note 不能只是装饰 — 它要触发 doc mutation。inline AI reply 在 Tiptap 内是浮层（已有 `liveMarkdownPreview`），再加一层 sticky AI 会与 ghost-text 视觉竞争。
> - **可行性疑点**：inline sticky note 与边注检查器（`writingAnnotation` + inspector）的并存需要明确分工 — 是 sticky 是「快速反馈」，inspector 是「批量操作」？AI reply 内联在 note 内的成本是：每次 AI 输出要触发 Tiptap transaction，并发场景下与 ghost-text 撞车（§1.3 已记录 ghost-text 错位）。
>
> ---
>
> ### §C.9 Glasp / Liner / Cubox 范式：web 端轻量高亮 + 跨平台同步
>
> - **模式名**：Lightweight-Web-Highlight
> - **源产品**：Glasp [https://blog.glasp.co/](https://blog.glasp.co/) / [https://github.com/glasp-co/glasp-export](https://github.com/glasp-co/glasp-export) / Liner [https://liner.com/](https://liner.com/) / Cubox（I cannot verify 官网原文）
> - **机制简述**：浏览器扩展在任意 web 页面做高亮 + sticky note；高亮存云端；可批量导出到 Notion/Obsidian/Slack；社交属性（关注用户看到其高亮）。AI summarization 是 highlight 流的总结，而非逐句翻译。
> - **§1.3 对应**：批注持久化 + 跨文件。Glasp 范式提示批注可以**脱离单文档** — Pinax 当前批注绑死写作 notebook；Glasp 范式提醒可以有一个「批注 inbox」跨 notebook 收集，等用户决定它属于哪个 draft。
> - **为什么不算实现方案**：Pinax 写作是「单文档重」，跨文件批注对长篇小说写作者的价值是次要的（他们的素材散在世界书 / 大纲 / 卷宗，而不是任意 web）。Glasp 是 web 阅读 → 笔记流，Pinax 是文档内写作 → 批注流。两者锚点不同（web 任意位置 vs Tiptap 节点）。
> - **可行性疑点**：批注 inbox 与现有「资产收件箱」（多状态 inbox / current-book / unbound）合并？— 资产收件箱已经是 inbox，但语义偏「素材」不是「批注」。新增「批注 inbox」要重新设计分类 UI。
>
> ---
>
> ### §C.10 Notion Web Clipper 范式：clip + AI summary
>
> - **模式名**：Clip-+-AI-Summary
> - **源产品**：Notion Web Clipper — [https://www.notion.so/web-clipper](https://www.notion.so/web-clipper) / [https://www.notion.com/blog/notion-web-clipper-features](https://www.notion.com/blog/notion-web-clipper-features) / [https://www.notion.com/help/guides/ai-web-clipper](https://www.notion.com/help/guides/ai-web-clipper)
> - **机制简述**：把任意 web 页面整页或部分剪到 Notion；剪藏后立刻有 AI summary、action items、Q&A。AI 不只解释剪藏，还能「问剪藏」（用户对剪藏提问，AI 答）。
> - **§1.3 对应**：AI 渠道 + 批注作为 AI 入口。Notion 范式提示 AI 入口可以是「批注→提问」而不是「选区→提问」 — 用户先写下问题，AI 围绕问题读上下文。
> - **为什么不算实现方案**：Notion 假设剪藏是「写之前」，Pinax 是「写之中」。问题驱动 AI 在 Tiptap 内意味着 agent 调度从「位置驱动」切到「意图驱动」，是 agent 路由大改。
> - **可行性疑点**：意图驱动需要意图 schema（question / suggest / critique / expand），与 `writingCandidates` 的续写 / 改写分类不是同一抽象；当前 `useWritingAgent` 是 900ms debounce 的「隐式触发」，意图驱动需要显式触发 UI（按钮 / 命令菜单 / `liveMarkdownPreview` 的 `/` 命令）。
>
> ---
>
> ### §C.11 Reflect（原 Mem.ai）范式：auto-organize by similarity
>
> - **模式名**：Similarity-Auto-Organize
> - **源产品**：Reflect — [https://reflect.app/blog/mem-is-now-reflect](https://reflect.app/blog/mem-is-now-reflect)（rebrand 事实 search 摘要确认）
> - **机制简述**：所有 notes 进系统后，AI 自动按相似度聚类、推荐 backlink、生成 daily review。notes 之间不需要手动关联，AI 异步建立。
> - **§1.3 对应**：批注线程 / 资产流。Pinax 「收件箱 → 章节纲要 → 分镜」状态机是手动分类；Reflect 范式提示分类可以是 AI 后台持续跑的事，不阻塞写流程。
> - **为什么不算实现方案**：Reflect 假设「写完才是开始」，批注的分类是异步；Pinax 「写之中」分类是同步决策（用户当下决定这个素材去哪个章节）。异步分类若不阻塞，会让用户面对「AI 又把某条改到 X 分类」的 surprise，与 §1.3 「资产流分散」叠加产生新混乱。
> - **可行性疑点**：similarity auto-organize 依赖后台索引（embeddings）；Pinax 是 localStorage + 客户端 agent，embeddings 也要本地跑（web-worker + 内存预算）。每日 review / 推送需要 cron 替代（service worker / 启动时计算）。
>
> ---
>
> ### §C.12 Heptabase / Kinopio 范式：可视化卡片 + 空间布局作为批注
>
> - **模式名**：Spatial-Annotation-Canvas
> - **源产品**：Heptabase — [https://heptabase.com/](https://heptabase.com/) / [https://sspai.com/post/85171](https://sspai.com/post/85171) / Kinopio — 二手来源描述
> - **机制简述**：批注可被拖到白板，与其他卡片产生空间关系（位置 / 颜色 / 形状编码关系）。批注不是列表项，而是 canvas 上的节点 — 空间布局是「批注间的逻辑」。
> - **§1.3 对应**：章节审查。Pinax 「章节审查 batch」是一次性把批注交给 AI；Heptabase 范式提示审查可以是「空间遍历」 — 按卡片在白板上的位置 / 聚类分组 review。
> - **为什么不算实现方案**：Heptabase 是研究工具（输入是阅读 / 学习），Pinax 是写作工具（输出是小说 / 散文）。白板布局对小说写作者的价值不如对研究者 — 他们的「批注间关系」是情节线 / 人物线，已经在「章节纲要 + 分镜」里表达。
> - **可行性疑点**：引入可视化画布 = 引入 react-flow / tldraw 级别的 canvas 引擎；与 Tiptap 的双轨同步是已知复杂区（§1.3 视觉漂移）。卡片位置 / 颜色 schema 要单独设计，「什么颜色对应什么关系」是一套用户教育成本。
>
> ---
>
> ### §C.13 Zotero 范式：child note vs standalone note + tag + group library
>
> - **模式名**：Child-vs-Standalone-Note
> - **源产品**：Zotero — [https://www.zotero.org/support/notes](https://www.zotero.org/support/notes) / [https://www.zotero.org/support/groups](https://www.zotero.org/support/groups) / [https://www.zotero.org/support/pdf_reader](https://www.zotero.org/support/pdf_reader)
> - **机制简述**：Zotero 把笔记分为「child notes（属于某 item）」和「standalone notes（独立条目）」，可互相 relate，可加 tag；group library 同步到云端。Zotero 7 built-in PDF reader 支持 sticky notes（黄色矩形）挂在 PDF annotation 上。
> - **§1.3 对应**：批注持久化 / 跨块。Zotero 范式提示 Pinax 批注可以分为「锚定 block 的批注」和「独立批注（如 review 草稿 / 全章 note）」，前者是 child，后者是 standalone — 两者存储、检索、UI 都不同。
> - **为什么不算实现方案**：Zotero 的 child/standalone 是为了学术引用（笔记需要 cite item），Pinax 的批注主要是写作反馈（笔记改 block）。child/standalone 的强分离对「按批注改写」流程是 friction — 改写工具想直接拿 child note，但用户可能要写 standalone 综合 note。
> - **可行性疑点**：child vs standalone 要在 UI 上明确分组（当前 `writingAnnotation` 是一维列表）；group library 协作要求云端同步，与 localStorage 范式冲突。
>
> ---
>
> ### §C.14 灵感综合：批注流的「五个轴」梳理
>
> 不引用任何单产品，给 Pinax 的批注系统设计画一张「轴线图」（这是灵感梳理，不是方案）：
>
> 1. **持久化轴**（从弱到强）：
>    - 字符 offset（最脆弱，revision 变化即失效）
>    - blockId+offset（当前 Pinax 模式）
>    - prefix/exact/suffix（Hypothesis 模式，依赖 surrounding text）
>    - RangeSelector / XPath（依赖 DOM 结构稳定）
>    - 派生语义 embedding（最稳但不可读）
>    - 组合策略：写作者手动选 / 框架自动降级
> 2. **可见性轴**：私有 / 收件箱 / 当前卷宗 / 公开 group / 全平台
> 3. **视图轴**：inline mark / 边栏胶囊 / sticky note / 卡片 / 脑图节点 / canvas 节点
> 4. **生命周期轴**：新建 → 待处理 → 已采纳 → 已解决 → 归档；vs 单状态评论
> 5. **AI 接入轴**：
>    - 批注作为 AI 上下文（Readwise / Polar）
>    - 批注作为 AI 入口（Notion clipper / Reflect）
>    - 批注作为 AI 输出容器（MarginNote review / Diigo outliner）
>
> 这五个轴**正交**，意味着可以正交组合（不强制走 §C.3 MarginNote 三视图合一）。
>
> ---
>
> ### §C.15 与 §1.3 对齐的开放问题（不写方案，只列问题）
>
> 1. **「边注重开 anchor」的最终诉求是「永远能找回这条批注的原文」吗？**
>    - 若 yes → 锚点应该升级到 prefix/exact/suffix 模式（§C.2），但代价是 block 身份弱化。
>    - 若 no（用户其实想「回到这个 block 看上下文」）→ 锚点保持 blockId+offset，但需要在 UI 上区分「已挪动的批注」与「仍精准的批注」。
> 2. **「跨块多片段批注」是「一个 thread 指向多 block」还是「多 thread 共享标签」？**
>    - MarginNote / Genius 倾向于前者（thread 即 group），Reflect / Glasp 倾向于后者（AI 聚合）。
>    - 二者不可互换：前者依赖 anchor schema，后者依赖 tag/embedding。
> 3. **「按批注改写」是「AI 看单条批注」还是「AI 看批注集」？**
>    - Readwise 范式是后者（批注级 query），Polar 是前者（doc-resident sticky note）。
>    - 当前 Pinax `useWritingAgent` 是 doc-resident；批注级 query 要加在 agent 路由层。
> 4. **「批注线程」需要支持解决 / 关闭状态吗？**
>    - Genius moderation 是显式状态机，Diigo 是隐式（活跃 vs 归档）。
>    - §1.3 「章节审查 batch」需要状态机才能「一次性关闭所有」。
> 5. **「资产流分散」的根本原因是「批注 / 素材 / 纲要 / 分镜 是 4 个独立对象」吗？**
>    - MarginNote 范式（§C.3）建议合并 — 但合并的代价是角色模糊。
>    - 当前 Pinax 4 段状态机保留了角色清晰，代价是 state 爆炸。
> 6. **AI 接入应该走「批注上下文」（RAG over annotations）还是「批注驱动」（intent over annotations）？**
>    - 前者是 Notion / Readwise 范式；后者是 Reflect 范式。
>    - 二者可以并存：批注上下文做续写 ghost-text，批注驱动做「按批注改写」按钮。
> 7. **协作是 v1 的需求吗？**
>    - Hypothesis / Diigo / Zotero 都有协作，但都是公开 / 课堂 / 学术场景。
>    - Pinax 是单用户写作工具，协作需求不清晰。引入协作 = 换存储范式。
>
> ---
>
> ### §C.总结
>
> 13 个产品 / 规范被调研，按「持久化 / 协作 / 视图 / AI 接入」四个维度交叉。Pinax 当前 `writingAnnotation` 在「持久化」上 blockId+offset 单一、「视图」上边注胶囊 + 边栏、「AI 接入」上是 doc-resident agent。
>
> **灵感方向**（不是方案）：
>
> - **持久化**：从单一锚点走向「组合锚点」（prefix/exact/suffix + blockId + revision）+ UI 上「已挪动」状态显式化（§C.2 + §C.15 Q1）。
> - **视图**：在现有边注胶囊 + inspector 之上，加 sticky note 作为「快速反馈」通道（§C.6 + §C.8）。
> - **AI 接入**：在 doc-resident agent 之外加 batch-level「批注 query」（§C.5 + §C.10 + §C.15 Q3）。
> - **生命周期**：从单一状态批注走向「待处理 / 已采纳 / 已解决」状态机（§C.7 + §C.15 Q4）。
> - **资产流**：从四段状态机走向「批注 inbox + 章节纲要 + 分镜」三段简化，或反之保留四段但显式化（§C.3 + §C.15 Q5）。
>
> **不写实现方案**。本节为发散灵感，最终落地以 WNB-6A（writingUnit schema）贯通后再设计。

## §D Block 笔记 + 自由混合（Logseq / RemNote / Tana / Obsidian / Muse / Reflect）
> **调研人**:D（并行 agent）。**scope**:block 标识、bidirectional link、outliner 与 prose 混排、roam-style graph

### §D.0 总览：block-based outliner 对长篇叙事的三个根本命题

调研 12+ 个产品（Logseq、RemNote、Tana、Obsidian、Roam、Muse/Allume、Reflect、Capacities、Notion、Coda、iA Writer、Bear；另有 Anytype、Workflowy、Dynalist、Microsoft Loop 简评）后，三个根本命题浮现，与 §1.3 Pinax 症状一一对应。

**命题一：block as identity** — 每个 block 必须是 first-class、stable addressable unit（UUID 或等价），不是「文档里的一行」。这是 Logseq `:block/uuid` (https://raw.githubusercontent.com/logseq/logseq/master/libs/guides/db_query_guide.md)、Roam `((uid))`、Tana supertag、Obsidian `^block-id` (https://obsidian.md/help/links)、Notion synced block parent ID (https://developers.notion.com/reference/block) 共同的根。映射 Pinax：当前 v2 schema 把「每个顶层段落当独立块」(§1.3 schema 错位) 是因为 block identity 与 paragraph node 耦合了；v3 writingUnit 必须把 `unitId` 提升为文档级一等公民。

**命题二：block as query target** — 不仅要能 @ 引用，还要能被 declarative query 过滤（标签、状态、时间、角色、反向引用）。Logseq 的 Datalog 查询（`db_query_guide.md` §1）、Tana Search Node（https://outliner.tana.inc）、Obsidian Dataview DQL（https://blacksmithgu.github.io/obsidian-dataview/）、Notion relation+rollup（https://www.notion.com/help/guides/advanced-formulas）是同一套设计。映射 Pinax：v3 应提供「queryable store」语义（`findUnits({ kind:'scene', pov:'Mary', status:'draft' })`），writingCandidates.js 应从「ad-hoc JS 字面量」迁移到「Datalog 风格的 declarative API」。这解决 §1.3 「跨块操作」中「多片段批注 / 查找同类 / 多目标原子改写」三个症状。

**命题三：block as collaboration / atomic-write unit** — AI 续写 / 改写 / 批注 / 撤销应操作 block 而非整个文档。Logseq `logseq.DB.onBlockChanged` (`db_query_guide.md` §1)、Tana AI Fields、Reflect 的 GPT-4「Insert / Replace on selection」(https://reflect.app/)、Notion Autofill + AI blocks (https://www.notion.com/product/ai) 全部围绕「在哪个 block 上做事」展开。映射 Pinax：当前 §1.3「ghost-text 与块稳定性」「恢复」反映「AI 操作粒度 = 整文档」未拆分；v3 应把 `unitId` 当作所有 AI/批注/资产/历史操作的寻址单位，使事件总线变成「onUnitChanged」而非「onDocChanged」。

---

### §D.1 Logseq — UUID 块 + Datalog 查询 + Markdown Mirror

- **模式名**：UUID-first block 持久化 + DataScript in-memory + SQLite + Markdown Mirror
- **源产品**：Logseq (https://logseq.com / https://github.com/logseq/logseq)
- **机制简述**：每个 block 一律持 `:block/uuid` (UUID v4)，在内存中以 DataScript Datalog 表示，落地为 SQLite + Markdown Mirror，Markdown 文件首行 `id:: <uuid>` 标记该页 UUID，block 之间用 `[[Page]]` / `((uuid))` 反向索引存 `:block/refs` (https://raw.githubusercontent.com/logseq/logseq/master/libs/guides/db_query_guide.md、https://raw.githubusercontent.com/logseq/logseq/master/docs/logseq-markdown-syntax.md)。
- **Pinax 摩擦对应**：§1.3 schema 错位（v2 把段落当独立块）— 直接借鉴：v3 writingUnit 必须以 UUID 为锚、JSON envelope 持久化、Markdown 导出为镜像而非主存。
- **为什么不算实现方案**：数据模型层（DataScript Datalog）适合 Logseq 的「用户写无数碎卡」场景，Pinax 写长篇 prose 段落，更适合简单的 keyed map；但借鉴点是把「identity 永远先于内容」贯彻到底。
- **可行性疑点**：Tiptap blockId 与 writingUnit 双重身份如何并存（建议 unitId 权威，blockId 仅作 PM 节点 attr 缓存）。localStorage 容量对长文 + 索引（反向引用 Datalog 表）是潜在瓶颈，估测 50 万字 + refs 仍 < 10MB，可接受。v2→v3 migration 需一次性把存量块的「内容哈希 → UUID」映射建好。

---

### §D.2 Logseq — `((block-uuid))` block embed

- **模式名**：块级 transclusion（写作中「引用一整段去别处」）
- **源产品**：Logseq（`((block-uuid))` 语法，https://raw.githubusercontent.com/logseq/logseq/master/docs/logseq-markdown-syntax.md）+ Obsidian `![[Note#^block-id]]` (https://obsidian.md/help/links) + Roam `((block))` + Tana node reference
- **机制简述**：在行内以 `((uuid))` 或 `![[file#^id]]` 嵌入另一 block；编辑源 block 时所有嵌入点同步更新。Markdown 仍是纯文本（语法可见），但渲染层把锚解析为「引用 view」。
- **Pinax 摩擦对应**：§1.3 跨块操作 / 资产流 — 当前「选区 → 收件箱 → 章节纲要 → 分镜」是「拷贝文字」路线，没法在不复制的前提下「一处改，处处改」。Block embed 是这一系列问题的关键能力。
- **为什么不算实现方案**：它是 v3 schema 顶层的「行内节点」决策，需要 ProseMirror 注册新 node `blockEmbed`，并在 agent 候选请求里把「不复制、引用原 unitId」作为可选项。
- **可行性疑点**：Tiptap 节点插入新行内 node 时，会被写作编辑器 ghost-text 行内续写干扰（§1.3 ghost-text 错位）；需把 blockEmbed 设为「不可被 inline completion 修改」，否则 revision 错位。跨卷宗 unit 引用若 unitId 跨 localStorage 域（多本书）需要解决「跨域 unit 解析」问题。

---

### §D.3 Tana — Supertag 与 Schema-on-Block

- **模式名**：在 outliner 内把每个 block 自动赋予类型（schema）
- **源产品**：Tana Outliner (https://outliner.tana.inc)（注意：`tana.com` 已 301 到无关品牌；真实产品域名是 `outliner.tana.inc`）
- **机制简述**：给 block 打 supertag 即自动获得一组 typed fields（schema 模板）；所有同 supertag 的 block 自动形成「queryable collection」；fields 可继承（`Extend`）、schema 可审计。AI Fields 可在 prose 写完后自动回填字段（AI 抽 POV / 时间 / 角色）(https://outliner.tana.inc)。
- **Pinax 摩擦对应**：§1.3 schema v2→v3 漂移 — 当前 `writingUnit` 类型只有「scene」「unit」二分；Tana 模式建议 v3 把 supertag 拆细：`scene` / `scene.beat` / `scene.flashback` / `scene.dream` / `character.snapshot` / `world.location`，每个 tag 带自己的 fields。
- **为什么不算实现方案**：schema 设计是产品决定，不在调研范围；Tana 提供的是「typed outliner 让用户不必切换到 Airtable」的产品心智。
- **可行性疑点**：Pinax worldbook 已存在 `Character` / `Place` / `Faction` 对象（见 `worldbookSourceAdapters.js`、`worldbookSourceParser.js`），supertag 与世界书对象类型会有「双轨」风险——建议 writingUnit 的 supertag 与 worldbook object type 走同一 enum 来源。

---

### §D.4 Tana — Search Node 即节点

- **模式名**：query 是节点，不是命令
- **源产品**：Tana Outliner (https://outliner.tana.inc)
- **机制简述**：把「所有包含 X 的段落」作为一个可嵌入的节点（Search Node），它出现在大纲里像普通节点，可命名、可复用、可嵌套引用。
- **Pinax 摩擦对应**：§1.3 章节纲要 / 资产流 — 当前章节纲要需要用户手动拖拽场景卡；Search Node 模式让「参与这场戏的所有场景」自动随写作演化。
- **为什么不算实现方案**：具体 UI 形态（折叠侧栏 vs 嵌入式面板）需另行设计；这里只是引入「query as first-class block」的观念。
- **可行性疑点**：query 需要稳定 ID + 缓存失效策略；当前写作编辑器（PM doc + Writing.vue 卷宗 UI）都是「文档 = 完整快照」心智，需要先在 store 层把「live query results」与「snapshot」分离。

---

### §D.5 RemNote — Descriptor 与 Portal

- **模式名**：内联 typed fields（`key:: value`） + 跨位置 portal 嵌入
- **源产品**：RemNote (https://www.remnote.com)
- **机制简述**：在 bullet 后直接 `pov:: Mary`、`tense:: past`、`wordTarget:: 1500` 等 typed 字段；portal 是「同一份 rem 的多个实时实例」，一处编辑处处更新。（具体 descriptor 语法和 portal markup 在本次 fetches 中 404，仅第三方材料支持；落地前需用户手册级核实 https://www.remnote.com/help/what-are-rem-descriptors）
- **Pinax 摩擦对应**：§1.3 schema 错位 — 内联 descriptor 比「打开侧栏填表」更省步数，适合写作流场景。
- **为什么不算实现方案**：内联键值对的语法设计（`::`、`: `、`<>`、空格分隔）有无数变体，需要 Pinax 自行决定。
- **可行性疑点**：内联 descriptor 与 ProseMirror mark 的存储竞争：写作流里同时存在 `**bold**`、`*::Mary`、`<quote>` 三种标记，parser 容易混淆。建议 v3 把 descriptor 写为独立 node-attribute（`data-unit-pov="Mary"`），不污染 Markdown 文本流。

---

### §D.6 RemNote — Incremental Reading → 写

- **模式名**：研究材料（PDF / 网页 / 视频）→ bullets → scenes
- **源产品**：RemNote (https://www.remnote.com)，特性名「Learn Any PDF / Annotate PDF / Lecture Recorder」
- **机制简述**：把 PDF 高亮、YouTube 字幕、网页摘录自动切成 bullets + 闪卡；之后这些 bullets 可被「拖入」大纲成为引用素材。
- **Pinax 摩擦对应**：§1.3 资产流 — 当前「选区 → 收件箱 → 章节纲要 → 分镜」状态机分散在 `Writing.vue`、`writingCandidates.js`、资产收件箱；研究材料（PDF / 角色卡 / 设定条目）没有专门的 source 概念。
- **为什么不算实现方案**：PDF 解析 + 摘要 + 切 bullet 是一个产品功能，不在调研范围；但「source → bullet → scene」的范式值得记下。
- **可行性疑点**：worldbook 已提供 source（见新增的 `worldbookSourceAdapters.js`、`worldbookSourceParser.js`、`worldbookSourceArchive.js`、`worldbookSourceParser.worker.js`）；可以直接借这套把 worldbook 条目转为写作 scene 的 reference blocks。

---

### §D.7 Obsidian Bases — Frontmatter-as-Database

- **模式名**：用 frontmatter 字段做数据库视图
- **源产品**：Obsidian Bases (https://obsidian.md/help/bases)
- **机制简述**：1.9 内置插件；`.base` 文件声明 YAML 字段为列，Markdown 文件正文作为「行」；视图类型有 Table / List / Cards / Map；公式可读其他属性。Board/Kanban、Calendar 视图在本次 fetch 中未在核心页证实，**I cannot verify**。
- **Pinax 摩擦对应**：§1.3 章节纲要 — Pinax 写作文件本身可自带 frontmatter（status、pov、sceneKind、characters）；Bases 风格视图是「用场景 metadata 折叠 / 排序 / 分组」的低成本实现。
- **为什么不算实现方案**：是否真为 Pinax 加一个 Bases 风格面板是产品决定；这里只记录「frontmatter-as-database」是 2026 Obsidian 主流心智。
- **可行性疑点**：Bases 用 `.base` 文件声明视图，Pinax 是否要为每个章节生成 `.base` 视图需要 UI 设计；更轻量的路线是「章节纲要视图 = v3 章节数据驱动」，不引入额外 schema。

---

### §D.8 Obsidian — Unlinked Mentions 作 motif 检测

- **模式名**：自动扫描文档，列出「出现某字符串但未链接的位置」
- **源产品**：Obsidian (https://obsidian.md/help/plugins/backlinks)
- **机制简述**：开启 Unlinked Mentions 后，每条 note 的 backlinks 面板会显示「文档里出现此 note 名 / 别名 / 同义词的段落，但没显式 `[[link]]` 的位置」。对小说写作，这等价于「哪些段落提到了角色名但未建立正式引用」。
- **Pinax 摩擦对应**：§1.3 跨块操作 — 多片段批注当前只支持「显式选中后批注」，无法「自动发现『未批注但重复出现的主题』」。Unlinked Mentions 是 lazy worker 模式的灵感来源。
- **为什么不算实现方案**：实现细节（用 string-search / fuzzy match / embedding）需另行决定；这里只提出「扫描 + 候选批注」的 UX。
- **可行性疑点**：5k+ 文档才出现性能问题（juggl.io 经验），Pinax 写作单本可能 100-500 段，性能不是问题；但 false positive（人名歧义）需要忽略列表（block-level `noMentionsFor` attr）。

---

### §D.9 Obsidian Canvas — JSON Canvas 格式

- **模式名**：可序列化空间画布（Open JSON Canvas）
- **源产品**：Obsidian Canvas (https://obsidian.md/canvas)，格式标准 https://jsoncanvas.org
- **机制简述**：节点 = 卡片（text / md file / image / PDF / nested canvas），可嵌套、可连接、可分组、有颜色；JSON 序列化以便其他工具读取；可与文本节点互转（Convert text card to file）。
- **Pinax 摩擦对应**：§1.3 章节纲要 — 当前「章节书架 + 卷宗 UI」是树形列表；Canvas 模式建议场景地图可以是 spatial view（与已有 5B / 5C spatial 范式一致）。
- **为什么不算实现方案**：JSON Canvas 适配层是工程实现，不是灵感本身；用户已表示「立绘=背景集成，非插图」(`feedback_visual_integration_not_illustration.md`)，Canvas 风格「块在空间漂浮」恰好与此方向吻合。
- **可行性疑点**：Canvas 需明确「spatial view = text view 的投影」而非独立表达（否则双数据源矛盾）；这正是 `feedback_ui_orbits_character_art.md` 的 UI-orbits-art 第三层要求。stereo 5C v3.12 已是 basis，refine 不 pivot（`5c_state_20260616.md`）。

---

### §D.10 Muse / Allume — Cards + Connections，无画笔

- **模式名**：画布优先于文本
- **源产品**：Muse / Allume (https://allume.com，2026-07 发布的 v4.0 加入了 Liquid Glass UI 与 AI MCP 支持，https://allume.com/memos/2026-07-allume-v4/)
- **机制简述**：cards 容纳文字、scribbles、图片、视频、PDF、links；cards 之间画 connection；boards 嵌套 boards；显式不提供 drawing brushes、复杂文本格式、无穷 zoom/rotate。
- **Pinax 摩擦对应**：§1.3 资产流 — 「素材卡片 + 关系」是 scene 卡片化的天然模板。
- **为什么不算实现方案**：Allume 的「canvas-first」是把文本降到次要地位，与 Pinax「写作优先」冲突；借鉴点是把 card-as-node + explicit-connection 当作场景地图的最小骨架。
- **可行性疑点**：Allume 的卡片不像 ProseMirror block 那样可被 inline completion 修改，AI 写入需要先解决「card 内联编辑器」。

---

### §D.11 Reflect — Daily Note + GPT-4 Inline Actions

- **模式名**：每日 note + 选区级 GPT 操作菜单（Insert / Replace）
- **源产品**：Reflect (https://reflect.app)
- **机制简述**：网络化 daily notes（自动日期 / 时间）；GPT-4 + Whisper 集成；选中文本 → AI 菜单 → Re-run / Insert / Copy / Replace（Cmd+Enter）；端到端加密为卖点。
- **Pinax 摩擦对应**：§1.3 ghost-text 与块稳定性 + AI 渠道 — 当前 `useWritingAgent` 是行内 ghost-text；Reflect 模式建议增加「选区级 Replace」+「Cmd+Enter 重运行」+「上一结果保留」，避免「上一段改写 / 收起的候选」(2026-08-17 git log) 的 race condition。
- **为什么不算实现方案**：具体 ghost-text 渲染策略属于工程细节，不属于灵感层。
- **可行性疑点**：Reflect 是云端 + E2E；Pinax 是 localStorage，AI 端点可能不同；`textModelAgentProvider.js` / `toolCallingProviderAdapter.js` 多 provider 适配层（STATUS 中提到的 30s 超时链问题）必须先稳定，否则 inline action 体验反而更糟。

---

### §D.12 Capacities — Object-as-First-Class + Daily Note

- **模式名**：object-based note（typed entities with relations）
- **源产品**：Capacities (https://capacities.io)
- **机制简述**：内置对象类型 Person / Book / Project / Meeting + 自定义；daily note 是 inbox；对象间 relations 替代文件夹；EU 服务器 + GDPR + 加密；Pro 含 AI Assistant + queries + calendar (https://capacities.io/pricing、https://capacities.io/pro)。
- **Pinax 摩擦对应**：§1.3 schema v3 writingUnit 的 sibling — `writingUnit` + 世界书 `Character` / `Place` 已有 typed entity 雏形；Capacities 模式提示「让 typing 跨 worldbook / writing / scenes 统一」。
- **为什么不算实现方案**：统一 entity type registry 是产品 / schema 决定，不在调研范围。
- **可行性疑点**：worldbook 已有自己的对象层；新增 Capacities 风格的 unified type 需要 worldbook / writing / experience 三个域共同改造，影响范围超出 writing 页本身。I cannot verify Capacities AI Assistant 2026 详细能力（首页未列）。

---

### §D.13 Notion — Synced Block 同步陷阱

- **模式名**：跨位置同步 block（一处改，处处改）
- **源产品**：Notion (https://www.notion.com/help/synced-blocks)
- **机制简述**：选 block → Turn into → Synced block → 复制粘贴到任意位置；编辑源 block，所有 copies 同步；复制 10+ 份后 `Unsync all` 或删除 original 会永久删除所有 copies（Undo 不恢复）。
- **Pinax 摩擦对应**：§1.3 schema 漂移 — Pinax 的「多卷宗 + 多章节 + 多场景」会出现「同一 unit 跨多个引用」的需求，synced block 是参考形态。
- **为什么不算实现方案**：硬删级联 = 数据丢失灾难；Pinax 必须有 soft-delete / explicit-unlink 语义。
- **可行性疑点**：与 §D.2 block embed 的差异：synced block 是「双向同步」，block embed 是「单源引用」。若 Pinax 选 block embed（`((uuid))`），则 synced block 是更激进的版本，慎选。**Notion 10-copy 删除 trap 是必须避开的产品反例**。

---

### §D.14 Notion — Relation + Rollup + Formula

- **模式名**：typed relation + rollup aggregation
- **源产品**：Notion database (https://www.notion.com/help/guides/advanced-formulas)，https://www.notion.com/product/ai
- **机制简述**：database 间通过 relation 关联；rollup 从关联对象聚合一属性（如「Mary 出现的所有 scene 的总字数」）；formula 计算字段；Autofill 用 AI 自动填字段（https://www.notion.com/product/ai）。
- **Pinax 摩擦对应**：§1.3 资产流 / 章节纲要 — 章节层级（book → chapter → scene → beat）若以 relation 表达，可做「chapter 卷均字数」「Mary POV 总章节数」等聚合。
- **为什么不算实现方案**：rollup 实现需 v3 schema 完整定型后才有意义。
- **可行性疑点**：Notion 详细 2026 relation / rollup 行为本次 fetch 未能验证（guides 页只返回 intro），落地前需产品手册级 verify。I cannot verify 2026-specific changes.

---

### §D.15 Notion — Button + Variables

- **模式名**：可点击 button 触发操作链（变量 + formula 复用）
- **源产品**：Notion (https://www.notion.com/help/buttons)
- **机制简述**：button actions 含 Insert blocks / Add page to database / Edit pages / Send notification / Send mail / Send webhook（部分仅付费）；Define variables 让 mention + formula 跨 actions 复用。
- **Pinax 摩擦对应**：§1.3 资产流 / AI 渠道 — 写作工具需要「一键跑一段 agent pipeline」按钮（如「按本卷纲要生成 10 个场景草稿」「检查 POV 一致性」「把今日新增 beats 摘要到 daily journal」）；button + variable 是 UI 范式。
- **为什么不算实现方案**：button + variable 是 UI / 产品决定，不属于调研。
- **可行性疑点**：button 触发跨多 provider（textModel、tool-calling、嵌入式）的 pipeline，依赖 `textModelAgentProvider.js` 与 `toolCallingProviderAdapter.js` 的稳定性。

---

### §D.16 Coda — Doc + Table + AI Column + MCP

- **模式名**：doc / table / button 三件套 + MCP 集成
- **源产品**：Coda (https://coda.io)（2026 已 rebrand 为 Superhuman Docs，https://superhuman.com/docs）
- **机制简述**：doc + hub + tracker 三件套；600+ integrations + Pack Studio；AI column 自动生成内容；MCP 连接 ChatGPT / Claude / Cursor；800+ 集成（首页最新数据）。
- **Pinax 摩擦对应**：§1.3 资产流 — Coda 模式提示「场景表 + 大纲 doc」可分离。
- **为什么不算实现方案**：MCP 集成是工程能力，不属于灵感本身。
- **可行性疑点**：Coda Brain 详细功能 I cannot verify（首页未列细节）。Pinax 不需要 Coda 那么多 integration，但「让外部 AI 工具能 pin 自己数据」的 MCP 是值得规划的方向。

---

### §D.17 iA Writer — Outline + Search + Authorship

- **模式名**：outline view 整合到 search + authorship attribution
- **源产品**：iA Writer 8 (https://ia.net/topics/search-to-navigate，2026-06)
- **机制简述**：iA Writer 8 把 outline view 与 search 合并到 ⇧⌘O；search 同时搜当前文档与整个 library；command palette ⇧⌘P 统一 formatting / export；Authorship 区分「typed vs pasted vs AI」（黑白 / 彩色）。
- **Pinax 摩擦对应**：§1.3 ghost-text 与块稳定性 / 视觉漂移 — Authorship 区分可以解决「用户不知道哪些段落是 AI 生成的」焦虑（用户对 AI 协作透明度敏感）。
- **为什么不算实现方案**：Authorship 是 ProseMirror mark 层 + CSS 实现细节。
- **可行性疑点**：iA Writer 不暴露 AI 写作功能（https://ia.net/writer 主页未列），只有 authorship 标记。Pinax 仍需自建 AI 集成，Authorship 是 UX 补强。

---

### §D.18 Bear — Note-Granular 教训

- **模式名**：以 note 为粒度，无 block-ID
- **源产品**：Bear Notes (https://bear.app)
- **机制简述**：Markdown + 250+ tag icons + heading folding + inline sketches；不支持跨 note 的 block-level 引用。
- **Pinax 摩擦对应**：§1.3 schema v3 漂移 — Bear 是反例：一旦超过段落粒度的引用需求（如「复用一句话到多个章节」），note-only 模式就不够用。Pinax 应坚持 block-level 引用。
- **为什么不算实现方案**：反面案例，提醒 Pinax「不要退化到 note-only 模式」。
- **可行性疑点**：Bear 2026 路线图 I cannot verify（首页 footer © 2025）。

---

### §D.19 简评 — Athens / Workflowy / Dynalist / Loop / Anytype

- **Athens Research** (https://github.com/athensresearch/athens) — 「UPDATE: Athens is no longer being actively maintained」；repo 未 archive。第三方导出工具 `bshepherdson/athens-export` 可导出为 Logseq 兼容。I cannot verify 最近 stable release。
- **Workflowy** (https://workflowy.com) — 嵌套 bullet outliner；多视图（Note / Folder / Todo / Doc）；homepage footer 仅链到 AI terms，未展示 AI 详细能力（I cannot verify AI）；Pro $6.99/mo 年付。
- **Dynalist** (https://dynalist.io/pricing) — 嵌套 list；Free $0 / Pro $7.99-mo 或 $9.99-monthly；2026 主页 + pricing 页**均无 AI 提及**，搜索返回的 "Dynal AI" / "Ultra tier" 看似 hallucination，勿信。
- **Microsoft Loop** (https://www.microsoft.com/en-us/microsoft-loop) — 跨 Teams / Outlook / Word / OneNote 的可嵌入 Components；GA；Copilot in Loop co-creation。Loop 的「block = 跨 app 原语」直接预测 Pinax 未来方向：scene 作为 component 跨 Notes / Writing / Experience。
- **Anytype** (https://anytype.io, https://blog.anytype.io) — local-first + E2E + P2P；multi-space；collections / widgets / templates / memberships；open source via Any Association。Pricing 页本次 fetch 无可提取内容（I cannot verify 2026 tiers）。

**对 Pinax 的统一启示**：object-as-first-class 是 2026 共识（Capacities + Anytype + Tana 都独立收敛到此模型），验证 Pinax `writingUnit` 方向。

---

### §D.总结 + Open Questions

**跨产品共识（12+ 工具观察）**

1. **Object / typed-block 模型是 2026 主流**：Capacities、Anytype、Tana、Logseq DB graph、Obsidian Bases 都独立收敛到「typed entity with relations」。验证 Pinax `writingUnit` 方向。
2. **AI 是 2026 table stakes**：Reflect GPT-4、Capacities Pro AI、Allume MCP、RemNote AI Tutor、Notion AI / Agent、Coda AI Column / Brain。Obsidian 不在 core 推 AI。Pinax 应保持「local-first + opt-in AI」，与 Obsidian 哲学一致。
3. **Local-first + E2E 是卖点**：Reflect、Anytype、Capacities (EU 加密)、Allume 都主打；Pinax 是 localStorage（local-first by architecture），可借机宣传。
4. **Canvas vs prose 分叉**：Allume 是 canvas-first（cards + connections）；Capacities / Reflect / Anytype 是 page-first；Pinax 介于两者（scene cards + ProseMirror prose），是罕见的差异化定位。
5. **Block reference 是基本能力**：Logseq `((uuid))`、Obsidian `^block-id`、Roam `((block))`、Tana node ref、Notion synced block ——「一处编辑，处处更新」是块笔记的根。
6. **Daily note 是 capture 默认入口**：Reflect、Logseq、RemNote、Roam、Tana 全部以此为起点；Pinax 的「资产收件箱」可借 daily journal 心智。

**对 Pinax v3 writingUnit 的具体灵感映射**

- **v3 schema 必备字段**：`unitId`（UUID v4 / v7）+ `unitKind`（scene / beat / character.snapshot / world.location / journal-entry）+ `outgoingRefs: unitId[]`（反向索引，仿 Logseq `:block/refs`）+ `properties: { pov, tense, status, time, location, characters[] }`（typed，仿 Tana supertag）+ `journalDay?: YYYYMMDD`（仿 Logseq `:block/journal-day`）+ `revision` + `parentUnitId?`。
- **Block embed 必须做**：`((unitId))` 行内语法（PM `blockEmbed` node），至少在 unit 文档内可引用。这是 §1.3「跨块操作 / 资产流」的关键能力。
- **查询层**：薄薄的 declarative query helper（`queryUnits({ ... })`），不引入 Datalog；DataScript 风格 API 即可。
- **事件总线**：`onUnitChanged(unitId, cb)` + `onDocumentChanged(cb)`，所有 AI / 批注 / 资产流订阅 unit 级别事件。当前 `useWritingAgent` 是 document 级别，是 §1.3「ghost-text 错位」的根因之一。
- **视图层**：章节书架 = Query Unit 集合（`{kind:'chapter', ...}`）；分镜 = Query Unit 集合（`{kind:'scene', chapterId:X}`）；scene map = spatial projection（Canvas 格式，5C v3.12 refine）。
- **Authorship**：iA Writer 的 typed/pasted/AI 三态区分，是 ProseMirror mark 层的小成本大收益。

**Open Questions（交付主 session 决定）**

1. **是否引入 Daily Journal 一等公民？**（Logseq / Reflect / Tana 都做）这会影响「资产收件箱」是否升级为 journaling surface。
2. **是否实现 `((unitId))` block embed？**（§D.2）这是 v3 与 v2 的最大分水岭，决定 Pinax 是不是「真 block 笔记」而非「段落编辑器」。
3. **Notion synced block 同步陷阱如何避？**（§D.13）block embed 选单向引用，synced block 双向同步引入级联删除风险，需 soft-delete / explicit-unlink 语义保护。
4. **Tana supertag 与 worldbook object type 是合并？**（§D.3 + §D.12）这影响 writing / worldbook / experience 三域的 schema 协调。
5. **AI 在 core 还是 opt-in plugin？**（Obsidian 模式 vs Reflect 模式）Pinax 已有 `textModelAgentProvider.js` / `toolCallingProviderAdapter.js`，倾向 core；Authorship 标记（§D.17）应随之落地。
6. **localStorage 容量上限是否够长篇？**（5MB / 10MB / 50MB 视浏览器）logseq 50 万字 + refs 估 < 10MB，OK；但 v3 索引（反向 refs 表）翻倍，需要预估最坏场景下使用率。
7. **Canvas / spatial view 与 text view 是否共数据源？**（§D.9）任何 spatial 必须严格是 unit 的 projection，避免双数据源漂移。这与 `feedback_ui_orbits_character_art.md` 第三层要求一致。
8. **Block-level undo 的粒度？** 当前 `restoreWritingBlockHistory` 与 `restoreWritingSnapshot` 共存；Logseq 模式是「unit 级别时间机器」，Pinax 应明确是「unit 级别」还是「document 级别」颗粒度。

**关键 Pinax 文件落点**

- `src/services/writing/writingDocumentSchema.js` — 升 v3：加 `unitId` / `unitKind` / `outgoingRefs` / `properties` / `journalDay?`。
- `src/services/writing/writingCandidates.js` — ad-hoc 字面量 → declarative query helper。
- `shared/writingCandidateContract.js` — 增加 unit properties 的 typed schema。
- `src/components/writing/WritingNotebookEditor.vue` — 注册 PM `blockEmbed` 节点；订阅 `onUnitChanged`。
- 新增 `src/services/writing/writingGraph.js` — Sigma.js / Cytoscape 视图，filter chips。
- 新增 `src/services/writing/writingUnitEvents.js` — minimal event bus，暴露给 `OnlineChatOverlay.vue` / `OnlineRoomPanel.vue`。

**未验证 / 需用户进一步核实的事项**

- Logseq 默认 SR 算法（SM-2 vs FSRS）2026 现状。
- Logseq PDF 标注的 on-disk schema（block-per-highlight vs annotation array）。
- Logseq graph view 是否加入 3D（I cannot verify 当前 2D-only）。
- Roam Research 2026 产品状态（roamresearch.com 是 SPA，公开内容 fetch 不到，I cannot verify）。
- Tana supertag 完整 schema 规范（首页仅展示概念）。
- Capacities AI Assistant 2026 详细能力。
- Coda Brain 2026 详细功能。
- Bear 2026 路线图（首页 footer © 2025）。
- Anytype 2026 pricing tiers（pricing 页 fetch 无内容）。
- Notion Mail 2026 是否仍在运营（首页未列）。
- Dynalist AI tier 疑似 hallucination，勿信。

## §E 现代 AI 写作工具（Notion AI / Lex / Scrintal / Sudowrite / NovelAI / Novelcrafter / Atticus / Lex 2025+）
> **调研人**:E（并行 agent）。**scope**:AI 编辑 / 续写 / brainstorm / outline / 视角一致 / 长文结构

### §E.0 总览：现代 AI 写作工具的五个核心范式

把 2024–2026 公开报道过的 AI 写作产品聚类（按"AI 在编辑流程中扮演什么角色"切分），能抽出五个反复出现的范式：

1. **Story Bible / Persistent Context 范式**：以"长期世界条目 + 人物档案 + 关系 + 视角"作为每次续写的前置上下文，由 AI 在调用时按需拼接。代表：Sudowrite Story Bible、Novelcrafter Codex、NovelAI Lorebook + Memory + Author's Note、Scrivener metadata、Living Writer Story Bible、Plottr timeline、Atticus character/scene tags。
2. **Scene-Aware 范式**：把作品拆成 scene / chapter 节点，AI 工具绑定到具体 scene 而不是整篇。代表：Novelcrafter shelves + scene editor、Atticus scenes + plot grid、Scrivener corkboard、Living Writer Plot Points。
3. **Candidate-Eval 范式**：每个 AI 动作产出多份候选 + 文字级差异说明，用户在 inline 视图里挑一份或写"再来"。代表：Lex 多版本 drafts、Sudowrite Continue / Expand / Rewrite 多结果、Sudowrite Twist 多个走向、NovelAI 多采样。
4. **Prompt-Stack 范式**：用户可自定义"AI 工具栈"，每条命令是一条 prompt template + 上下文切片规则。代表：Lex Custom AI Prompts、Notion AI blocks + action items、Novelcrafter 自定义 AI 动作、Scrivener compile presets 类比。
5. **Versioned-Apply 范式**：每次 AI 修改保留版本树（谁、何时、哪一稿），可对比 / 合并 / 回滚。代表：Lex version history、Notion page history、Atticus revision marks、Novelcrafter AI rewrite 的 original-vs-rewrite 对照、Sudowrite "guide" 与正文分离。

这五个范式在 Pinax 写作页都不是"我直接抄过来"的实现方案；它们是**灵感坐标**——指出当前 §1.3 各项症状背后存在哪些已验证的产品策略。每一节下面给出 14 条具体灵感模式。

> 注：本节对每个产品都标了**已通过本会话联网核实** vs **I cannot verify**。可核实源全部用 markdown 链接列出；不能核实的部分明确写"本会话未能验证"。

---

### §E.1 Sudowrite「Story Bible」：长期世界条目按需注入上下文

- **模式名**：Story Bible — persistent context card → 按需拼接进续写 prompt
- **源产品**：Sudowrite — https://sudowrite.com/
- **本会话可核实的事实**：搜索结果只确认了"Sudowrite 是面向 fiction 的 AI 写作伙伴"这一层；具体到 Story Bible 的字段集、Continue/Expand/Rewrite/Describe/Character/POV/Genre/Twist/First Draft 的具体命名，**本会话未能逐项验证**（web search 多轮返回噪声页）。产品主站 https://sudowrite.com/ 在 2026-08 仍存在并展示定位。
- **机制简述**（基于 Sudowrite 公开定位）：为人物 / 地点 / 设定 / 风格 / 视角建立结构化条目卡片，每次续写按当前 scene 上下文从 bible 中筛选相关条目注入 prompt，用户可手动 pin / unpin 条目。
- **Pinax 摩擦对应**：§1.3「资产 → 续写参考」。当前写作页资产收件箱是松散的字符串片段；缺乏"按 scene 自动筛选相关条目"的机制。
- **为什么不算实现方案**：Pinax 已经存在 worldbook（worldBookEntry + quickImport），但 worldbook 是 LLM 上下文工程层，不是写作页 UI 层的 scene-aware bible。两者边界、注入时机、用户可见性都不同。
- **可行性疑点**：(1) writingDocumentSchema v3 的 writingUnit 还没贯通，要在 unit 之上再加 bible layer 复杂度激增；(2) localStorage-first → bible 是用户私有数据，必须保证切换 device / 浏览器不丢，与现有的 IndexedDB / quickImport 体系如何对齐；(3) 多 provider 场景下 bible 注入顺序会显著影响续写结果，需要用户可调的"pin 优先级"配置。

---

### §E.2 Sudowrite「Continue / Expand / Describe」：场景化命令菜单的范式参考

- **模式名**：Scene-aware AI tool menu — 每个命令绑定"对当前 scene 的哪种语义动作"
- **源产品**：Sudowrite（同上）
- **机制简述**（基于其"命令按动作分"的产品形态，未逐条验证）：菜单项不是"Ask AI / Rewrite"，而是"Continue from here / Expand this paragraph / Describe with senses / Rewrite with style / Brainstorm next scene / Twist direction"——每个动作对应不同的 prompt template + 不同的上下文切片（scene 开头 / scene 中段 / scene 末尾 / 上一章末 / 下一章首）。
- **Pinax 摩擦对应**：§1.3「命令菜单——一级 → 二级菜单方向 / viewport / zoom 适配 / 移动端翻转」。当前命令菜单是结构化输入触发器，而非"按写作意图分组的语义动作集"。
- **为什么不算实现方案**：Pinax 的 `/` 命令菜单已经按"action 类别"分组（M0-M4 fix）；但缺少"按场景位置触发的默认 prompt 切片"。
- **可行性疑点**：(1) prompt 切片需要在 writingAgent 端定义一组"动作族"，每族 prompt template + 上下文窗口策略不同；(2) writingDocumentSchema v3 writingUnit 节点之上是否要补一个"scene position"字段（首段 / 中段 / 末段）目前没设计；(3) mobile 翻转已修，但加入更多动作后菜单密度会再次成为瓶颈。

---

### §E.3 Novelcrafter「Codex + Scene Shelves」：场景级条目管理 vs 资产级

- **模式名**：Codex with shelves — scene-shelf 视图 + 条目卡片可拖拽入 scene
- **源产品**：NovelCrafter — https://www.novelcrafter.com/ ；评测描述见 https://thewritelife.net/novelcrafter-review/ 与 Reedsy 2025 综述 https://reedsy.com/discovery/blog/best-ai-writing-tools/
- **本会话可核实的事实**：搜索结果明确提到 NovelCrafter 包含 Codex（lore / 人物 / 世界管理）+ scene shelves（场景组织）+ AI rewrite + brainstorm 工具。这三层结构在 2024–2025 第三方评测中持续出现。
- **机制简述**：Codex 是结构化条目库（人物 / 地点 / 物品 / 时间线 / 风格），Shelves 是把 scene 按书架/标签分组；AI rewrite 操作绑定在 scene 级别，可选"是否注入 Codex 哪些条目"。
- **Pinax 摩擦对应**：§1.3「资产流 / 章节纲要 / 分镜」。当前 Pinax 收件箱是无差别 inbox，章节纲要独立维护，分镜更下游——三者间没有"以 scene 为锚的引用关系图"。
- **为什么不算实现方案**：shelves 是一个**视图层概念**（corkboard / Kanban），与 Pinax 当前卷宗 / 章节书架的 UI 形态有重叠，需要重新定义"shelf vs 卷宗 vs 章节书架"的语义边界。
- **可行性疑点**：(1) scene 维度在 writingDocumentSchema v3 中是隐式的（章节下挂 unit），引入 shelves 视图要回答"shelves 的存放粒度是 chapter、scene、还是 unit 集合"；(2) Codex 条目与现有 worldbook 的关系——是统一还是并列？是否复用 worldBookEntry 表结构；(3) "scene-shelf 上拖入 Codex 条目"是跨视图 UI 交互，目前 Vue 端跨视图拖拽没有基础组件。

---

### §E.4 NovelAI「Lorebook + Memory + Author's Note」：三层上下文分层注入

- **模式名**：Tiered context layers — lore（按 key 触发） + memory（始终在） + author note（指定位置插入）
- **源产品**：NovelAI（lorebook / memory / author's note / text adventure mode）
- **本会话可核实的事实**：搜索结果明确描述：Lorebook 存储世界条目由 AI 在生成时引用；Memory 是会话内持久上下文（token 上限内）；Author's Note 是指定位置的指令注入；Text Adventure 模式利用前三个做交互叙事。
- **机制简述**：三层结构清晰分层——lorebook 条目带 trigger key，命中后才注入；memory 是常驻会话级 KV；author's note 在 prompt 中固定位置（开头 / 中间 / 末尾）插入。Token 预算在三层间自动协调。
- **Pinax 摩擦对应**：§1.3「资产 → 续写参考」「行内 ghost-text 块稳定性」。当前 Pinax 续写只把光标前后 N token + 章节纲要 + 部分收件箱项目拼起来；没有"哪些是常驻、哪些是按需、哪些是临时指令"的清晰分层。
- **为什么不算实现方案**：NovelAI 是闭源服务 + SaaS；Pinax 是 localStorage-first + 多 provider。三层注入的 token 预算、调度逻辑必须在本地复现。
- **可行性疑点**：(1) writingAgent 当前的 prompt 构造在 `writingCandidates.js`，引入三层后调度复杂度上升；(2) 多 provider 下"author note"位置语义是否对齐（OpenAI / Anthropic / Google / 本地模型对 system/user/assistant 的容忍度不同）；(3) lorebook 已经存在于 worldbook 子系统，**与 writingAgent 是两套上下文工程**，合并的代价需要评估。

---

### §E.5 Lex「AI Comments + AI Prompts」：把 AI 嵌入批注流与 prompt 自定义

- **模式名**：AI-as-commenter + user-customizable prompt stack
- **源产品**：Lex — 官方公告 https://blog.lex.page/lex-ai-word-editor-adds-ai-comments-ai-prompts/ ；The New Stack 报道 https://thenewstack.io/the-ai-word-editor-lex-adds-customizable-ai-prompts-and-comments/ ；Medium 综述 https://medium.com/the-wordy-structurer/ai-in-lex-prompts-comments-d44b8ebea1b6
- **本会话可核实的事实**：2025 年 5 月 Lex 正式发布 **AI Comments**（AI 像人类编辑一样在文档里留反馈）与 **AI Prompts**（用户可自定义 AI 行为）。这些在 Lex 官方公告 + The New Stack 2025-05-20 报道 + Medium 多篇评测中均出现。
- **机制简述**：AI Comments 把 AI 输出伪装成批注——可作为侧栏 thread 出现，不直接污染正文；AI Prompts 允许用户保存自定义 prompt template（"以 Hemingway 风格重写" / "以编辑视角给反馈" / "给我 5 个开头版本"），按菜单触发。
- **Pinax 摩擦对应**：§1.3「按批注改写」「多片段批注与 targets[] 冻结」。Pinax 已有的边注（writingAnnotation）是"用户写给作者自己的边注"，Lex 的 AI Comments 是"AI 写给作者的边注"——方向相反但 UI 容器可复用。
- **为什么不算实现方案**：批注模型本质是 thread，AI Comments 是 thread 的一种特殊角色（system / ai），不是新概念；要回答的是"AI 留批注 → 用户采纳/否决 → 改写原文"的完整交互回路是否要新增 UI。
- **可行性疑点**：(1) writingAnnotation 当前 schema 是否能容纳 `authorRole: 'human' | 'ai'` 字段，迁移成本如何；(2) "AI 批注触发改写"会与现有的按批注改写（reviewForAnnotation）逻辑重叠，需要明确分工；(3) AI Prompts 的 storage 是 localStorage 字符串还是 IndexedDB，与现有 quickImport / 写作页设置如何统一。

---

### §E.6 Notion AI「AI Blocks + Q&A + Autofill + Meeting Notes + Research Mode」：嵌入式 AI 块范式

- **模式名**：Inline AI block as a first-class content type
- **源产品**：Notion AI — 见 The Verge / Notion 官方 changelog 多篇报道；本会话通过 WebSearch 摘要确认 2025 年 Notion AI 演进到 AI Agent Mode + Q&A 跨 workspace + Autofill 扩展到 CSV/PDF + AI Blocks（summarize/translate/extract action items/rewrite）+ AI Meeting Notes + Research Mode。
- **机制简述**：Notion 的 page 是 block tree，AI 块（AI block）是 block 树中的一种节点类型，可放在文档任何位置；点击触发对应动作，结果以 block 内容形式 inline 出现；可以再编辑/再生成。Q&A 是把整个 workspace 作为 RAG 源做问答；Autofill 用 AI 填 database 列。
- **Pinax 摩擦对应**：§1.3「Markdown 与块稳定性」「ghost-text 错位」。Pinax 的 writingDocumentSchema 把 block 作为一等公民（blockId + revision + kind），理论上 AI 生成内容可以是一种特殊 kind 的 block——而非 inline ghost-text 这种"临时浮在原文之上"的脆弱表示。
- **为什么不算实现方案**：把 AI 候选从"行内 ghost-text"提升到"独立 block"是**架构层决定**（schema 变更），不是新功能。会影响 ghost-text 采纳、撤销栈、块级历史全部路径。
- **可行性疑点**：(1) writingDocumentSchema v3 writingUnit 还没贯通，现在加 AI block kind 会进一步推迟 v3；(2) ProseMirror node 体系下"AI block"是 nodeSpec 的扩展，需要持久化 + 反序列化 + 渲染三层对齐；(3) localStorage 容量上限对"长文档频繁生成多个 AI block"是真实约束。

---

### §E.7 Scrintal「Visual canvas + AI card」：可视化卡片 AI 助手

- **模式名**：Visual card-as-AI-target — AI 助手把卡片当输入/输出单元
- **源产品**：Scrintal — 主页 https://www.scrintal.com/ ；AI features 页 https://www.scrintal.com/features/ai
- **本会话可核实的事实**：Scrintal 主页明确把自己定位为"无限画布 + 可视化笔记 + AI 助手"，AI features 页确认包含 brainstorming assistant、mind map from text、mind map from PDF、AI card grouping、AI assistant for writing tasks。
- **机制简述**：Scrintal 把 mind map、note、image、file 放在同一画布，AI 可以"基于卡片组生成内容"、"对一张卡片重写"、"把 PDF 转成 mind map"、"对一组卡片做 brainstorming"——AI 操作的边界是卡片而非整篇。
- **Pinax 摩擦对应**：§1.3「资产流 / 章节纲要 / 分镜」「跨块操作」。当前 Pinax 资产流是文本+缩略图线性流，没有"按卡片/分组组织"的视图层。
- **为什么不算实现方案**：Scrintal 的核心是**画布视图**，与 Pinax 当前的卷宗 + 写作页双视图是不同方向；除非重做收件箱为 canvas UI，否则只是"思想借鉴"（card group → AI target）。
- **可行性疑点**：(1) 引入 canvas 视图会改变整个收件箱的 UI 与交互；(2) Scrintal 是 SaaS，AI 推理在服务端，Pinax 要把卡片级 AI 操作映射到本地 multi-provider；(3) 卡片分组的状态机复杂度高，卷宗/书架的成熟状态机可能要被重写。

---

### §E.8 Scrivener「Corkboard + Outliner + Binder + Scrivenings + Split/Merge」：长文结构黄金范式

- **模式名**：Binder + corkboard + scrivenings + split/merge — 一个文档的多种视图
- **源产品**：Scrivener（长期业界标准写作工具，非 AI 工具）；本会话 WebSearch 关于 Scrivener 的查询**本会话未能获取到具体功能描述**（搜索引擎返回了大量噪声页）。以下基于 Scrivener 的公开长期认知，**I cannot verify** 2026 年的具体功能项。
- **机制简述**（基于 Scrivener 长期功能集）：一个项目包含 binder（树状文档结构）+ corkboard（卡片视图，索引卡可写摘要/标签/状态）+ outliner（大纲视图）+ scrivenings（多个文档拼成一个长视图编辑）+ split（文档二分）+ merge（合并）+ collections（跨树状结构的标签筛选）+ word count goals（按 section 设目标字数）。
- **Pinax 摩擦对应**：§1.3「章节纲要」「Markdown 与块稳定性」「单元 → scene 三层」「schema v2/v3」。Pinax 的卷宗 + 章节书架在 binder / corkboard 维度上是 Scrivener 的简化版，但缺少 outliner / scrivenings / split / collections。
- **为什么不算实现方案**：Scrivener 不含 AI，但它的**视图分离 + 块级操作 + 标签 collections** 是 Pinax 写作页可以直接借鉴的非 AI 范式。
- **可行性疑点**：(1) Scrivener 是桌面软件，Pinax 是 Web——split/merge 在 ProseMirror 节点层要重新设计；(2) collections 是基于 tag 的过滤，与现有的资产收件箱"状态机"是否冲突需要梳理；(3) word count goals 与现有字数统计是增强还是新功能，要看 WNB-6A 进度。

---

### §E.9 Atticus「Plot grid + scene-level AI assist」：场景网格 + AI 辅助

- **模式名**：Plot grid (scene × status × tags) with per-scene AI assist
- **源产品**：Atticus（https://www.weareatticus.com/）；本会话 WebSearch 关于 Atticus 的查询**本会话未能获取到具体功能描述**。以下基于 Atticus 长期公开定位，**I cannot verify** 2026 年具体功能。
- **机制简述**（基于 Atticus 公开长期功能集）：scene 是核心单位，每 scene 有 goal / conflict / outcome / POV 字段；plot grid 是 scene 的二维表格视图（按章节 × 视角 / 状态 / 时间）；AI assist 在 scene 级别触发（"重写这个 scene"、"扩写冲突"、"检查 outcome 是否闭环"）；支持 epub / print 导出。
- **Pinax 摩擦对应**：§1.3「单元 → scene 三层」「按批注改写」「章节纲要」。当前 Pinax unit 的 schema 还没稳定，scene 三层是 WNB-6A 目标态；atticus 的 goal/conflict/outcome 字段正是 unit 上应承载的语义。
- **为什么不算实现方案**：Atticus 的 plot grid 是一个**结构化字段视图**，与 Pinax 当前的卷宗 + 写作页没有重叠；引入需要新增"plot grid"独立视图。
- **可行性疑点**：(1) goal/conflict/outcome 是固定三字段还是自定义字段？与 worldbook / chapterReview 的字段集是否冲突；(2) plot grid 视图与卷宗 / 章节书架 / 写作页三视图的关系是同级还是嵌入；(3) AI assist 在 scene 级触发意味着 provider 调用粒度更细，debounce 与并发的策略要重新设计。

---

### §E.10 Notion AI「Meeting Notes」：跨应用上下文整合的灵感（非直接借鉴）

- **模式名**：Cross-app context aggregation for AI
- **源产品**：Notion AI Meeting Notes（2025 推出，连接 Google Calendar / Microsoft Teams 自动入会 + 笔记 + action items）
- **本会话可核实的事实**：本会话 WebSearch 摘要确认 Notion 在 2025 推出 AI Meeting Notes，最初面向 Plus / Business / Enterprise 计划。
- **机制简述**：AI 主动从外部数据源（Google Calendar / Teams / Slack / Drive / GitHub）拉取上下文，组合成 meeting notes，提取 action items。本质是 **AI 作为多源 context aggregator**。
- **Pinax 摩擦对应**：§1.3「资产 → 续写参考」。Pinax 当前续写参考的"资产"全部来自写作页内部（收件箱 / 章节纲要 / 分镜 / worldbook）。Notion Meeting Notes 提示一个长期方向：AI 能从卷宗外部（imageGenerationWorkbench 产出的图、世界书 quickImport 进来的内容）拉上下文。
- **为什么不算实现方案**：Pinax 没有连接外部 SaaS 的产品方向；这一节是**思想参考**——"AI 作为跨模块上下文聚合者"。
- **可行性疑点**：(1) localStorage-first 的边界意味着"跨应用"只能是"跨本应用模块"；(2) 跨模块上下文调度涉及明确的 user consent 与可审计性，需要新增 UI。

---

### §E.11 Wordtune / GrammarlyGO / Hemingway Editor「修订型 AI」：轻量 inline 修改范式

- **模式名**：Lightweight sentence-level rewrite as inline affordance
- **源产品**：Wordtune（Rewrite / Casual/Formal / Expand / Shorten）、GrammarlyGO（tone/length 调整）、Hemingway Editor（readability 标记）
- **本会话可核实的事实**：本会话 WebSearch 中关于这三家的查询**本会话未能获取到 2026 年最新功能列表**。以下基于 2023–2024 公开认知，**I cannot verify** 2026 年的具体功能项。
- **机制简述**：Wordtune 是句子级重写器，UI 是选中句子 → 浮窗多版本候选；GrammarlyGO 把 generative AI 加到 Grammarly 的语法检查 UI 上，提供 tone/length 调整；Hemingway Editor 主要是高亮复杂句/被动/副词，Pro 版（如果存在）有 AI 改写。
- **Pinax 摩擦对应**：§1.3「行内 ghost-text 块稳定性」「按批注改写」。Wordtune 的句子级浮窗候选是 Pinax 选区操作的相邻范式——但 Wordtune 不污染原文（采纳前都是候选），Pinax ghost-text 是"接受前已渲染在原文之上"。
- **为什么不算实现方案**：这是 UX 范式参考，不涉及 schema 改动。但浮窗多版本候选是 Lex / Sudowrite / GrammarlyGO 共同的范式，强度足够。
- **可行性疑点**：(1) Pinax 已有选区操作浮条（批注 / 收为素材），是否在同一条上挂"AI 候选"按钮需要决策；(2) 句子级重写在中文场景下分词边界与英文不同；(3) Hemingway 类的"高亮问题"要新增 lint 层，目前 Pinax 没有 inline lint。

---

### §E.12 Living Writer / Plottr / Squibler / Sassbook「Plot Points + Story Bible」轻量备选

- **模式名**：Story Bible + Plot Points lightweight — 比 Novelcrafter 更轻的版本
- **源产品**：Living Writer、Plottr、Squibler、Sassbook AI Writer、Novela、Raptor Write。本会话 WebSearch 关于这五家的查询**本会话未能获取到 2026 年具体功能描述**，以下基于长期公开认知，**I cannot verify** 2026 年具体功能。
- **机制简述**（基于长期公开认知）：Plottr 是时间线 + plot grid 双视图，可挂载 AI assist 续写；Living Writer 有 Story Bible + Plot Points + Scenes + AI Brainstorm + 字数目标；Squibler 是 script/novel 双模式 + AI；Sassbook 是 SaaS 自动续写 + SEO/营销文；Novela / Raptor Write 同类轻量 AI 写作。
- **Pinax 摩擦对应**：§1.3「资产 → 续写参考」「章节纲要」。Plottr 的 timeline 视图是章节纲要的**时序化变体**——比当前 Pinax 章节纲要的"列表式"更直观。
- **为什么不算实现方案**：Plottr 是桌面软件 + AI；timeline 视图在 Web 端是否能落地取决于是否引入 d3 / vis-timeline 等。
- **可行性疑点**：(1) timeline 视图是独立页面还是嵌入章节纲要页；(2) timeline 与卷宗 / 章节书架 / 写作页的关系是同级还是新视图；(3) Plottr 的 AI assist 与 writingAgent 的 prompt 构造是否合并。

---

### §E.13 Subtxt / Dramatica「叙事结构 AI」：故事理论驱动的 AI 提示

- **模式名**：Narrative theory-aware prompting — 用故事结构理论（Dramatica / Save the Cat / Hero's Journey）做 prompt scaffolding
- **源产品**：Subtxt（Dramatica 续作）。本会话 WebSearch 关于 Subtxt 的查询**本会话未能获取到 2026 年具体功能描述**，以下基于长期公开认知，**I cannot verify** 2026 年具体功能。
- **机制简述**（基于长期公开认知）：Subtxt 把 Dramatica 的故事结构模型（4 个 throughline × 4 个 story point × 12 stages）作为 prompt 的骨架；用户填入每个 stage 的内容，AI 按结构续写；输出被自动对回结构模型做一致性检查。
- **Pinax 摩擦对应**：§1.3「章节审查」「按批注改写」「章节纲要」。章节审查（chapterReview）目前是 LLM 评注式；Subtxt 提示**结构化审查**——按故事理论逐项核对（inciting incident 是否到位 / midpoint reversal 是否清晰 / climax 是否解决 conflict）。
- **为什么不算实现方案**：Dramatica 模型本身非常复杂，是否引入是产品决策，不是技术决策；本节是**理论参考**。
- **可行性疑点**：(1) Dramatica 的复杂度对普通用户是否友好需要评估；(2) 与现有 chapterReview 字段集如何对齐；(3) 是否复用 worldbook 还是另立结构层。

---

### §E.14 Scrivener「word count goals」与 Ulysses「sheet / outline」：目标与字数节奏

- **模式名**：Per-section word count goal + sheet/outline dual view
- **源产品**：Scrivener word count goals；Ulysses（sheet / outline / Markdown export）。本会话 WebSearch 关于 Ulysses 的查询**本会话未能获取到 2026 年具体功能描述**，以下基于长期公开认知，**I cannot verify** 2026 年具体功能。
- **机制简述**（基于长期公开认知）：Scrivener 允许在 binder 节点上设 word count goal，编辑器顶部进度条显示当前/目标；Ulysses 的 sheet 是 dashboard（每篇文档的字数/标题/标签/目标），outline 是层级大纲视图，导出 Markdown / PDF / ePub。
- **Pinax 摩擦对应**：§1.3「章节纲要」「字数统计」。当前 Pinax 章节纲要没显示每章目标/进度；字数统计是全局，没有 per-section goal。
- **为什么不算实现方案**：纯 UI 增强，不是新功能。但这种"目标感"对长篇小说写作是真实价值。
- **可行性疑点**：(1) per-section goal 字段加在哪——writingDocumentSchema 还是 chapter 元数据；(2) 进度计算需要定义"完成"的判定（已采纳 / 章节审查通过 / 字数达标）；(3) 与现有的卷宗"进度条"是否视觉冲突。

---

### §E.总结

把上面 14 条灵感聚拢到 §1.3 的 9 类症状上：

| §1.3 症状 | 相关灵感条目 |
|---|---|
| schema 错位 | §E.6（AI block kind）、§E.8（Scrivener binder）、§E.9（Atticus scene field） |
| ghost-text 与块稳定性 | §E.5（Lex AI Comments）、§E.6（AI block）、§E.11（Wordtune 浮窗候选） |
| 命令菜单 | §E.2（Sudowrite 动作族）、§E.12（Plottr timeline） |
| 跨块操作 | §E.7（Scrintal card group）、§E.8（Scrivener split/merge/collections） |
| 资产流 | §E.1（Sudowrite Story Bible）、§E.3（Novelcrafter shelves）、§E.10（Notion cross-app） |
| AI 渠道 | §E.4（NovelAI 三层上下文）、§E.5（Lex Prompts 自定义） |
| 视觉漂移 | §E.12（Plottr timeline）、§E.14（Scrivener goal progress） |
| 恢复 | §E.5（Lex version history 类比）、§E.6（Notion page history 类比）、§E.9（Atticus revision） |
| 章节纲要 | §E.2、§E.9、§E.12、§E.13、§E.14 |

### Open questions（留给主 session / 主线 review 时回）

1. **架构层问题**：writingDocumentSchema v3 writingUnit 还没贯通；如果要引入 §E.6 的"AI block kind"，是 v3 的一部分还是 v4 的事？
2. **视图层问题**：是否需要新增"plot grid"或"timeline"视图作为卷宗/书架/写作页之外的第四视图？
3. **上下文工程问题**：worldbook（LLM 层）与 writingAgent 的"Story Bible"（UI 层）是统一还是并列？是否复用 worldBookEntry 表？
4. **跨产品问题**：Pinax 多个产品分支（在线 agents / canvas / video-frame）的 AI 上下文策略是否统一？
5. **优先级问题**：哪些灵感是 0 成本能借鉴的（§E.5 AI Comments kind 字段）、哪些需要新 schema（§E.6 AI block）、哪些是新视图（§E.12 timeline）？

### 已核实 vs 未核实清单

- **本会话已核实**：
  - Notion AI 2025 包含 Q&A / Autofill / AI Blocks / Meeting Notes / Research Mode（WebSearch 摘要）
  - Lex 在 2025-05 发布 AI Comments + AI Prompts（Lex 官方公告 + The New Stack 2025-05-20 + Medium 多篇）
  - NovelAI 包含 lorebook / memory / author's note / text adventure mode（WebSearch 摘要）
  - NovelCrafter 包含 Codex + scene shelves + AI rewrite + brainstorm（The Write Life + Reedsy 2025）
  - Scrintal 主页与 AI features 页确认 brainstorming / mind map from text / PDF / card grouping（scrintal.com 主页 + features/ai 页）
  - Sudowrite 是 fiction AI 写作伙伴（sudowrite.com 主页）
- **本会话未能验证 / I cannot verify**：
  - Sudowrite 各命令（Continue / Expand / Rewrite / Describe / Character / POV / Genre / Twist / First Draft）的当前具体命名
  - Atticus 2026 年具体功能项（plot grid / AI assist / 导出格式）
  - Scrivener 2026 年具体 corkboard / outliner / scrivenings / split / merge / collections / word count goals 的当前 API
  - Ulysses 2026 年具体 sheet / outline / Markdown export 的当前 API
  - Wordtune / GrammarlyGO / Hemingway Editor / ProWritingAid 2026 年具体功能
  - Living Writer / Plottr / Squibler / Sassbook AI / Novela / Raptor Write 2026 年具体功能
  - Subtxt / Dramatica 2026 年具体功能
  - Lex 多版本 drafts 的具体交互
  - Notion AI 完整命令列表与触发快捷键

> 后续若要把 §E 的某条灵感落实到计划，建议先用 context7 / WebFetch 单独核实未验证产品的当前页面，再进入设计阶段。

---

## §F 跨节综合 —— 主 session 汇总

> **本节不写实现方案**。基于 §A-§E 五节 70+ 条灵感的交叉分析，按"被多源反复印证"的权重挑出 8 条跨节主题，并把每条映射到 §1.3 摩擦点 + WNB-6A / 当前 schema 路径。**用户明确：计划与实现不在本调研范围**。

### §F.0 方法说明

- 70+ 条灵感来自 5 个生态（Jupyter / AI IDE / 批注 / block 笔记 / AI 写作工具），每条均标注了源产品 + 机制 + §1.3 对应。
- 本节筛选标准：是否被 **≥ 2 个不同生态** 反复印证（说明不是某产品的偶发特性，是某种范式的内在张力）。
- 标 ⚠️ 的项意味着该方向在原 agent 中已经标 "I cannot verify"，落地前需二次核实。
- 标 🟢 的项表示已经被多源印证，但 **仍需用户判断是否属于"超出 WNB-6A 范围"**——本研究不替用户做这个判断。

---

### §F.1 八条跨节主题

#### §F.1.1 🟢 schema/block 身份稳定是 bug 的根因（§A / §B / §D / §E 四节共鸣）

**多源印证**：
- §A.总结：cell 边界（nbformat 三态）+ reactive runtime（Observable/Marimo 失效传播） + 可恢复性是 cell 的内禀属性
- §B.F1：行内 ghost-text 必须 blockId + revision 锚定
- §D.v3 schema 必备字段：unitId + unitKind + outgoingRefs + properties + journalDay? + revision + parentUnitId?
- §E.E.6 / §E.9：Notion AI block kind + Atticus scene field 都是 schema 层 metadata

**对应 §1.3 症状**（5 条全部相关）：
- schema 错位（v2 把顶层段落当块）
- ghost-text 与块稳定性（行内续写在 Markdown 标记下错位）
- 块级恢复（块历史 vs 全文快照共存）
- 多片段批注（跨 block 锚点）
- 命令菜单方向（依赖 cell 边界）

**与 WNB-6A 关系**：直接验证 schema v3 = 段落节点 → writingUnit → scene 的方向。具体字段被 §D 提案强化（unitId / outgoingRefs 反向索引 / typed properties / journalDay），这些是 WNB-6A 完成后可立刻对照的 v3 schema 决策清单。

⚠️ 字段名 unitKind / properties / journalDay 是 §D agent 的提案，不是 WNB-6A 当前定义，落地前需对照现有 contract。

---

#### §F.1.2 🟢 reactive runtime / 修订级联失效（§A / §B / §D 三节共鸣）

**多源印证**：
- §A.总结.2：Observable/Marimo「上游改了 → 下游自动失效」是 cell-paradigm 的核心
- §B.13.5：写作不接受频繁中断，需要「段落级 delta」最低粒度
- §D 事件总线：onUnitChanged / onDocumentChanged，所有 AI / 批注 / 资产订阅 unit 级别
- §B.F2：chat 旁路 + plan 接受前显示 diff（plan 与正文解耦是关键）

**对应 §1.3 症状**：
- ghost-text 与块稳定性
- 改写上一段 anchor 漂移
- 块级恢复（revision 流转不畅）
- 视觉漂移（长文档 zoom 后）

**与 WNB-6A 关系**：v3 writingUnit 的 `revision` 字段已经隐含 reactive 依赖。落地后是否做 onUnitChanged 事件总线是 schema 完成后的下一步。

⚠️ §A agent 已指出：Marimo「全图重算」太重 / Observable「增量」较重 / Jupyter「手动」太轻——Pinax 当前 `debounceMs 900` 是「轻 reactive」但未显式化。建议先把 contract 暴露成「轻 reactive event bus」，不要做全图重算。

---

#### §F.1.3 🟢 @ 上下文语法 = 「写作语义树」的 @-mention（§B / §D / §E 三节共鸣）

**多源印证**：
- §B.B.1 Cursor @-codes / §B.B.3 Copilot #file / §B.B.7 Continue context providers / §B.B.5 Windsurf Memories
- §D.D.5 Block reference 是基本能力（Logseq `((uuid))` / Obsidian `^block-id` / Roam `((block))` / Tana node ref / Notion synced block）
- §E.E.1 Sudowrite Story Bible 按需注入 + §E.E.3 Novelcrafter Codex 引用

**对应 §1.3 症状**：
- 选区 → 资产 → 章节纲要 → 分镜 四段流（缺少统一的"引用语法"）
- 命令菜单方向
- 批注的「块引用」目前是 blockId，没有用户可见语法

**与 WNB-6A 关系**：schema v3 落地后写作单元需要：
- 行内 `((unitId))` 嵌入语法（§D.2 / §D.5）
- 章节 / 块 / 资产 / 纲要的统一引用面（§B OQ-B1 `@@chapter` / `@@block` / `@@asset`）
- 避免 Notion synced block 同步陷阱（§D.13）——单向 embed 是更稳的选择

⚠️ 这是 v3 完成后 v4 的候选，不是 WNB-6A 范围内的必做项。但 schema 字段预留 `outgoingRefs` 是低成本决策。

---

#### §F.1.4 🟢 锚点策略 = 持久化锚点是 schema 一等公民（§A / §C / §D 三节共鸣）

> **本主题与 §F.1.5 的区别**：§F.1.4 是"批注如何稳定指向原文（不漂移）"；§F.1.5 是"状态如何回滚（恢复历史）"。两者都涉及 block 身份，但 §F.1.4 看 **forward direction**（annotation → block），§F.1.5 看 **temporal direction**（state[t] → state[t-1]）。

**多源印证**：
- §A.A.3 nbformat 多态 metadata + cell-level 结构化字段（kind / tag / voice）作为锚点携带者
- §C.总结：组合锚点（prefix/exact/suffix + blockId + revision）+ UI 显式化「已挪动」状态
- §D.v3 outgoingRefs 反向索引 + 反向 query schema

**对应 §1.3 症状**（集中在锚点漂移）：
- 批注重开 anchor 漂移（用户报告频繁）
- 跨块多片段批注
- 改写上一段 anchor 漂移

**与 WNB-6A 关系**：当前 `writingAnnotation.selector` 是单一锚点（blockId + offset）。§C 建议做组合锚点 `(prefix?, exact, suffix?, blockId, revision, hash)`，需要 schema 支持多 selector 链。这是 v3 后 v4 的批注 schema 升级方向，但 v3 可先预留字段槽位。

⚠️ §C agent 指出："若目标是『永远能找回原文』→ 升级组合锚点，代价 block 身份弱化；若目标是『回到 block 看上下文』→ 保持 blockId + offset，UI 显式『已挪动』状态"。这两个路径产品定位不同，需用户判断。

⚠️ §A.A.3 是 cell-paradigm 中少有的「anchor 不靠字符串偏移，靠结构化字段」的灵感来源，与 §F.1.1 联动。

---

#### §F.1.5 🟢 回滚策略 = 可恢复性是写作的内禀属性（§A / §B / §C / §D / §E 五节全共鸣）

> **本主题与 §F.1.4 的区别**：见 §F.1.4 顶部。§F.1.5 关注 **temporal direction** —— 当前状态如何回到过去的某个状态，以及"恢复"本身是否应是 schema 内禀属性（而非外挂功能）。

**多源印证**：
- §A.A.14 cell-level 内禀历史（revision 数组是 cell 自己的属性）+ §A.A.16 process log（写作过程时序回放）
- §B.B.8 Cline Checkpoints（每步可回滚的 git-stash-lite）/ §B.B.10 Cody attribution（代码出处可回溯）
- §C.总结：批注生命周期状态机（待处理 / 已采纳 / 已解决 / 归档）
- §D 总结：unit-level undo（Logseq `((uuid))` 级别时间机器）
- §E.E.5 Lex version history / §E.E.6 Notion page history / §E.E.9 Atticus revision marks / §E.E.8 Scrivener 快照集

**对应 §1.3 症状**（集中在恢复相关）：
- 块级恢复（与全文快照共存）
- 自动草稿与手动快照耦合
- 改写上一段 anchor 漂移后的回退
- schema v2 block 漂移后的回退

**与 WNB-6A 关系**：当前 `restoreWritingBlockHistory`（块级）与 `restoreWritingSnapshot`（全文）是两套并行机制。§D 建议收敛到 unit 级时间机器；§A.A.14 提议把 `revisions[]` 数组作为 cell 自身的内禀属性。两者不冲突——单元级 = 颗粒度，revisions 数组 = 存储形状。WNB-6A 完成后可推进。

⚠️ §A agent 已指出：「过程日志是产品定位问题（用户要隐私还是可回放？）」——这是 v3 完成后 v4 的 UX 决策。

⚠️ §D OQ-8：「Block-level undo 的粒度？」需要用户决定是 unit 级还是 document 级。两者各有先例（Logseq = unit，Notion = page）。

---

#### §F.1.6 🟢 类型化对象 = typed-block / supertag / object-as-first-class（§A / §D / §E 三节共鸣）

**多源印证**（修正：§A.A.2 实际是中等印证而非弱印证）：
- §D 总结.1：Capacities / Anytype / Tana / Logseq DB graph / Obsidian Bases 都收敛到「typed entity with relations」
- §E.E.1 Sudowrite Story Bible（typed character/place cards）/ §E.E.3 Novelcrafter Codex（typed entries）/ §E.E.9 Atticus plot grid（每 scene 带 typed fields: goal / conflict / outcome / POV）/ §E.E.5 Lex AI Comments（authorRole: 'human' | 'ai' 是 typed author 字段）
- §A.A.2 cell metadata / cell tag（cell 类型决定"行为标签"，是 typed-cell 的早期形式）

**对应 §1.3 症状**：
- 资产四段流（角色 / 物品 / 地点 等没有 typed，kind 是松散文本）
- 章节纲要（kind 字段是字符串）
- 世界书与世界条目统一（与 `worldbook-workflow` skill 约束相关）

**与 WNB-6A 关系**：schema v3 的 writingUnit 如果加 `unitKind`（scene / beat / character.snapshot / world.location / journal-entry）+ `properties`（typed：pov / tense / status / time / location / characters[]），就能与世界书条目（worldbook entry）形成 typed-first-class 体系。§D OQ-4 提出：Tana supertag 与 worldbook object type 是合并还是并列？这是写作与世界书两个域的 schema 协调决策。

⚠️ §E.E.5 Lex AI Comments 的 `authorRole` 字段提示**最小成本可借鉴**：writingAnnotation 加一个 author enum（human / ai / system）就能复用现有批注容器，无需新 schema。这与 WNB-6A 范围正交，可在 v3 稳定后作为小成本 PR。

⚠️ 与 `worldbook-workflow` skill 约束相关，落地前需对照世界书已有类型系统。

---

#### §F.1.7 🟢 Canvas vs prose 共数据源 = scene map / 分镜不能双数据源（§A / §D / §E 三节共鸣）

**多源印证**：
- §A.A.15 notebook-as-log + Canvas JSON 格式
- §D.D.9 JSON Canvas 格式 + §D.OQ-8 "Canvas / spatial view 与 text view 是否共数据源"
- §E.E.7 Scrintal visual canvas + AI card / §E.E.9 Atticus plot grid

**对应 §1.3 症状**：
- 章节纲要 vs 分镜（两个 UI 表示同一概念）
- scene map（5C v3.12 已在 refine 中）vs prose

**与 WNB-6A 关系**：v3 writingUnit 落地后，scene map / 分镜 / 章节书架都应该是 unit 的 projection（query unit collection），不是独立数据源。§D D.9 JSON Canvas 格式是公开标准，可作为分镜导出的格式之一。

⚠️ 与 `feedback_ui_orbits_character_art.md` 第三层「UI 围绕立绘编排」一致：任何 spatial view 必须是 unit 的 projection，不允许双数据源。

---

#### §F.1.8 🟢 AI 候选 / 批注 / 资产状态机统一（§B / §C / §E 三节共鸣）

**多源印证**：
- §B.F2 chat 旁路 + plan 接受前显示 diff（Plan / Preview / Accept 三态）
- §C.总结：批注生命周期 / 资产流合并（待处理 / 已采纳 / 已解决 状态机）
- §E.E.5 Lex AI Comments / §E.E.11 Wordtune 浮窗候选 / §E.E.6 Notion AI block

**对应 §1.3 症状**：
- AI 候选作为 first-class cell 持久化在正文里（§A.A.16 提示「破坏收件箱不污染正文」契约）
- 资产四段状态机分散
- 批注 / 素材 / 改写三个通道的"待处理"入口不统一

**与 WNB-6A 关系**：v3 schema `properties.status` 字段是 typed-first-class 之后，AI 候选、批注、资产三类对象都可以共享 status 枚举（draft / pending / accepted / rejected / archived）。这是 v3 完成后可推进的状态机收敛。

⚠️ §A OQ-5："AI 候选作为 first-class cell 持久化在正文里，是否破坏当前『收件箱不污染正文』的契约？需要双轨：持久候选在收件箱，临时候选 inline。"——这是 §F.1.1 的延续决策。

---

### §F.2 八条主题的依赖与优先级矩阵

| 主题 | WNB-6A 状态 | v3 完成后可推进？ | 强烈依赖 | 投入估算 |
|---|---|---|---|---|
| **F.1.1 schema 身份稳定** | 在做（WNB-6A 主任务） | — | — | 主任务本身 |
| **F.1.2 reactive runtime** | 不在 | ✅ 可立刻推进 | F.1.1（依赖 schema 稳定） | 中（事件总线 + 失效流程；debounceMs 900 框架已存在） |
| **F.1.3 @ 上下文语法** | 不在 | ⚠️ 部分（v3 预留 outgoingRefs 字段槽） | F.1.1 | 中高（PM 新 node + 行内语法） |
| **F.1.4 锚点策略** | 不在 | ⚠️ 部分（v3 预留 selector 链字段） | F.1.1 | 中（批注 schema 升级） |
| **F.1.5 回滚策略** | 不在 | ❌ 需 UX 决策先行（unit-level vs document-level） | F.1.1 / F.1.2 | 中高（unit 时间机器 UI + 隐私决策） |
| **F.1.6 类型化对象** | 部分（unitKind / properties 是 v3 提案） | ✅ 可推进 | F.1.1 + worldbook schema 协调 | 中 |
| **F.1.7 Canvas 共数据源** | 不在 | ✅ 可推进 | F.1.1 | 中（projection 视图，依赖 5C v3.12） |
| **F.1.8 状态机统一** | 不在 | ✅ 可推进 | F.1.1 + F.1.6 | 中（status 字段 + UI 收敛） |

**投入估算约定**：小 = 1-3 天单文件改动；中 = 1-2 周跨多文件；中高 = 跨多文件 + 涉及 schema；高 = 跨域（写作 + worldbook + experience）协调。

---

### §F.3 待用户拍板的题（按类别分组）

研究范围内发现但用户判断优先级的题。按"产品定位 / 技术容量 / 跨域协调"三档分类。

#### §F.3.1 产品定位题（5 题）—— 决定 Pinax 的产品气质

1. **「隐私 vs 过程日志」取舍**（§A.OQ-4 / §F.1.5）：日志可回放 vs 用户隐私。
2. **「过程日志」是否成为产品差异化卖点**（§A.OQ-4）：Quarto/Polynote 都有 notebook-as-publish 范式，Pinax 是否走这条路。
3. **「Daily Journal 一等公民」**（§D.OQ-1）：资产收件箱是否升级为 journaling surface。
4. **「AI 是 core 还是 opt-in plugin」**（§D.OQ-5）：Obsidian 模式 vs Reflect 模式。Pinax 已有 textModelAgentProvider，倾向 core，但需用户决定 UI 暴露度。
5. **「批注协作 是 v1 需求吗」**（§C OQ-7）：引入协作 = 换存储范式（localStorage → 后端同步）。

#### §F.3.2 技术容量题（2 题）—— 决定 Pinax 的可扩展性边界

6. **「localStorage 容量上限是否够长篇」**（§D.OQ-6）：v3 索引（反向 refs 表）翻倍，需评估最坏场景。
7. **「process log 持久候选 vs 临时候选」双轨**（§A.OQ-5）：AI 候选的存储策略，决定收件箱与正文契约。

#### §F.3.3 跨域协调题（1 题）—— 决定 Pinax 的 schema 一致性

8. **「worldbook object type 与 writingUnit typed properties 是合并还是并列」**（§D.OQ-4）：写作与世界书两个域的 schema 协调决策。

---

### §F.4 与现有约束的对齐情况

- **AGENTS.md 多 agent workflow**：本调研本身走的就是「Codex 派 5 个 Claude subagent 并行 + 汇集」的模式，符合 external Claude CLI worker pattern。
- **`docs/STATUS.md` WNB-6A 优先级**：F.1.1 / F.1.2 / F.1.6 直接验证 WNB-6A 方向；F.1.3 / F.1.4 / F.1.7 / F.1.8 是 v3 完成后的下一波候选。
- **`feedback_dont_overwrite_user_tuned_values.md`**：本研究只对 WNB-6A 的方向做"印证 + 字段强化"，不替换。
- **`feedback_research_before_artifacts.md`**：研究先于设计——本研究是设计前的发散阶段。
- **`feedback_no_doc_status_disclaimers.md`**：本节是内部调研，不是申报/公开文档，不需要状态 disclaimer。

---

### §F.5 反向映射表 —— 从 §1.3 症状找 §F 主题 + 灵感条目

> 用法：用户在 §1.3 看到症状 → 找本表 → 跳到对应 §F 主题 + 具体灵感条目。

| §1.3 症状 | 主要主题 | 次要主题 | 关键灵感条目 |
|---|---|---|---|
| **schema 错位（Enter 误建块、v2/v3 未贯通）** | F.1.1 | F.1.6 | §A.A.3（nbformat 三态）/ §D.D.1（Logseq UUID）/ §D.D.3（Tana supertag）/ §E.E.6（Notion AI block kind）/ §E.E.9（Atticus scene field） |
| **ghost-text 与块稳定性** | F.1.2 | F.1.4 / F.1.5 | §A.A.7（nteract inline）/ §A.A.12（reactive runtime）/ §B.B.1（Cursor Cmd-K）/ §D.D.11（Reflect Cmd+Enter Replace） |
| **命令菜单方向 / viewport / zoom / 移动端翻转** | F.1.1 | F.1.3 | §A.A.15（Jupyter scope）/ §B.B.10（Cody custom commands）/ §E.E.2（Sudowrite 动作族） |
| **跨块操作（多片段批注、查找同类、多目标原子改写冻结）** | F.1.3 | F.1.7 / F.1.4 | §A.A.11（Anytype relation）/ §C.C.4（LiquidText span）/ §D.D.2（Logseq `((uuid))` embed）/ §D.D.5（RemNote portal）/ §E.E.8（Scrivener split/merge/collections） |
| **资产流（选区 → 收件箱 → 章节纲要 → 分镜 四段分散）** | F.1.8 | F.1.7 / F.1.6 | §C.C.3（MarginNote 三视图合一）/ §E.E.1（Sudowrite Story Bible）/ §E.E.3（Novelcrafter Codex + Shelves）/ §D.D.12（Capacities object） |
| **AI 渠道（text-model 空响应 / 30s 超时 / 多 provider 端点解析）** | F.1.8 | F.1.6 | §B.B.6（Aider edit-format）/ §B.B.7（Continue context providers）/ §E.E.4（NovelAI 三层上下文）/ §E.E.5（Lex Prompts） |
| **视觉漂移（长文档缩放后当前行 / 命令菜单纵向漂移）** | F.1.2 | F.1.7 | §A.A.7（inline reactive）/ §D.D.17（iA Writer outline + search）/ §E.E.12（Plottr timeline） |
| **恢复（块级恢复 + 全文快照共存、自动草稿 + 手动快照耦合）** | F.1.5 | F.1.4 | §A.A.14（cell-level 内禀历史）/ §A.A.16（process log）/ §B.B.8（Cline Checkpoints）/ §E.E.5（Lex version history）/ §E.E.6（Notion page history） |
| **命令菜单的"语义翻译"——语义树 ≠ 文件树** | F.1.3 | F.1.6 | §B.B.1（Cursor @-codes）/ §B.B.3（Copilot #file）/ §B.B.7（Continue providers）/ §D.D.5（RemNote portal）/ §E.E.1（Sudowrite pin/unpin） |
| **schema v2 块身份弱化** | F.1.1 | F.1.6 | §A.A.3（nbformat）/ §D.D.1（Logseq UUID-first）/ §E.E.6（Notion AI block kind） |

**使用提示**：
- 同一症状可由多个主题交叉解决；优先级按"主要主题"列。
- 「关键灵感条目」列只是起点；每个条目有自己的 §X.Y 引用回溯链。
- 如果一个症状在表中找不到主主题，说明本调研未深挖该方向 —— 见 §A/B/C/D/E 各节 Open Questions。

---

### §F.6 总览（≤ 50 字）

8 条跨节主题，按"被多源反复印证的权重"排：schema 身份稳定 / reactive runtime / @ 上下文语法 / 组合锚点 / 可恢复性内禀 / typed-block / Canvas 共数据源 / 状态机统一。F.1.1 + F.1.2 是 WNB-6A 落地后立刻可对照的方向；F.1.3 / F.1.4 / F.1.7 / F.1.8 是 v3 完成后下一波候选；F.1.5 / F.1.6 涉及产品定位决策，需用户拍板。

---

> §F 写完。本调研文件 1769 行，覆盖 70+ 条灵感（5 节） + 8 条跨节综合（§F）+ §0 验证图例 + §1.4 TL;DR + §F.5 反向映射表。
>
> **3 轮深度审查 + 优化已完成**：
>
> 1. **Round 1**（§F 边界）：F.1.4 锚点策略（forward）与 F.1.5 回滚策略（temporal）拆开；F.1.6 引用强化；F.2 矩阵把 WNB-6A 状态从「是」改成「在做」；F.3 从单一列表重分类为产品定位 / 技术容量 / 跨域协调三档。
> 2. **Round 2**（导航辅助）：§0 阅读须知 + 验证图例；§1.4 TL;DR 5 分钟速查；§F.5 §1.3 症状 → §F 主题反向映射表。
> 3. **Round 3**（不确定性显式化）：5 个不确定项集中列出（Zed ACP / Allume v4.0 / iA Writer 8 Authorship / Continue provider 列表 / Sudowrite 命令命名），不冒充已核实。
>
> **未做的事（不在本调研范围）**：
>
> - 不写 WNB-6A 后的具体计划 / 实现方案 / 重构建议（用户明确）
> - 不修任何现有 bug（用户明确）
> - 不动 docs/STATUS.md / docs/PLAN.md（用户明确：本调研不写实现进度）
> - 不写新 skill（用户明确：本调研不发散到 skill 设计）
>
> **可继续的方向（由用户决定）**：
>
> - 把 §F.3 的 8 个产品定位问题交给用户拍板
> - 把 §F.1.1 + §F.1.2 的字段提案对照 `writingDocumentSchema.js` 现有 contract 二次核实
> - 用 `docs/superpowers/specs/...` 模板把某些灵感沉淀为 design doc（需 brainstorming → writing-plans 流程，本调研不触发）
> - 把某些 ⚠️ 项二次联网核实（如 Sudowrite 各命令当前命名、Atticus 2026 功能等）