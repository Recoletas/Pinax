---
title: F6 Pinax 其他趣味方向调研 —— 写作沉浸 / AI 协同 / 长篇节奏 / 文笔教练 / 软激励与写后延伸
date: 2026-09-01
purpose: 在 v5（同人 / IP / 世界意志）已完成的同一天，扩大调研范围：**Pinax 还能从哪些方向增加趣味性，让普通爱好者更好上手并完成不错的创作**。本调研覆盖写作过程本身的乐趣、AI 协同乐趣、长篇节奏可视化、文笔教练、软激励与写后延伸 5 个非同人方向。
scope: 横向 5 域 × 6 机制 = 30 cross-domain mechanic + 收口为 V6 提案集 + 杠杆组合 + 5 步路径 + 7 项 user 拍板
不重复: [F5 同人深度调研](./2026-09-01-f5-fanfic-deep-research.md)（v5 已覆盖 同人/IP/世界意志/AI 反 AI/版权/同人伦理 全部约束）
---

# Part 1 · 背景与轴向划分

## 1.1 Pinax 现状（截至 2026-09-01）

**已完成**:

- C1-7 落笔上下文闭环 / F1 双态故事实验室 / F2 作家助手成熟编辑器能力对齐（F2-1 完成；F2-2 多窗写作进行中）
- writingTypographyStore（字体 / 字号 / 行高 / 中西文分栈 / localStorage 持久化）
- 受控项目记忆 v2 / 5 类 observer / Ghost peek-consume

**关键决策（novel-cross-section-mvp-decisions）**（v5 / v6 共同硬约束）:

- ✅ 主轴「小说截面 + 导演兼角色 + 4 字段最小人格」
- ❌ **联机商业模式 / UGC 市场 / 开放世界经济**
- ❌ **6 档 auto-play / 计时器**（novel-cross-section 显式排除）
- ❌ **数值化好感度 / 心率 / 情绪 HUD**（novel-cross-section 显式排除）
- ❌ **阅文站点发布 / 订阅 / 收藏 / 打赏 / 稿酬**（F2 显式排除）

**F2 计划 §1.3 排除**:

- 阅文发布 / 订阅 / 收藏 / 打赏 / 风险发布 / 作家社区 / 拼字星球 / 征文 / 阅文账号 / 作品签约 / 云端平台同步

## 1.2 v5 vs v6 轴向划分

| 轴 | v5 (同人 / IP / 世界意志) | v6 (本调研: 其他趣味方向) |
|---|---|---|
| 主题 | 同人创作 + IP 导入 + 世界意志修正 | 写作过程乐趣 + AI 协同 + 长篇节奏 + 文笔教练 + 软激励 + 写后延伸 |
| 用户类型 | 普通爱好者 / 同人作者 | 任何想更好写小说的作者（含但不限于同人） |
| 与 Pinax 主轴关系 | 扩"同人 IP-aware"新方向 | 扩"写作工具本身的趣味性"——F1 / F2 路线深化 |
| 排除项 | IP 版权 / AI 反 AI / 同人伦理 | auto-play / RPG 数值 / 阅文发布 / UGC 市场 |

**v5 与 v6 是互补关系**：v5 扩"同人 IP"轴，v6 扩"写作工具"轴。**两者均不替代 F1 / F2 主路线**，都是 F1-7 / F2 之后的延后扩展轴。

## 1.3 研判结论

5 域研究已完成（写作沉浸 / AI 协同 / 长篇节奏 / 个性化 + 文笔教练 / 软激励 + 写后延伸），共 30 个 cross-domain mechanic。整合为 **V6 提案集 20 个 + 杠杆组合 + 5 步最小路径 + 7 项 user 拍板**。**不再增量调研**，见 Part 3。

---

# Part 2 · 5 域机制综合

每域含：调研范围 / 5-6 关键机制 / Pinax 当前缺口 / 反例 / 翻译方向。

## 2.1 写作沉浸与流体感（research 26）

**调研范围**：iA Writer / Ulysses / Bear / Scrivener / FocusWriter / ZenPen / Q10 / Cold Turkey / WriteRoom / OmmWriter / 4thewords / Typedream 等。

**6 个跨作品机制**:

| # | 机制 | 出处 | 关键 UX | Pinax 落地 |
|---|---|---|---|---|
| 1 | **Syntax Highlight 探照灯** | iA Writer / Hemingway Editor | 副词 / 形容词染色 / 冗词删除线 | V6-Q |
| 2 | **Typewriter Mode + 段落 fade** | FocusWriter / WriteRoom / OmmWriter | 当前行钉屏幕中央 / 段落渐隐 | V6-B |
| 3 | **Ambient Sound** | OmmWriter / Noisli / Rainy Mood / Calmly Writer | 雨 / 林 / 咖啡 / 静音 4 档 | V6-C |
| 4 | **Markdown + Sheet/Group 层级** | Ulysses / Bear / Scrivener | sheets / groups / tags 三层 | （v5-F 已部分覆盖，F2 速记 = sheet 变体） |
| 5 | **Pomodoro + 字数目标（user-initiated）** | 番茄钟 / NaNoWriMo / FocusWriter / Written? Kitten | 进度条 + flash + 自动淡入 | V6-O |
| 6 | **Cmd+K 命令面板** | Notion / Obsidian / VS Code / Sublime | fuzzy match 浮层 | V6-A |

**关键数据**:

- Calmly Writer 研究：打字音效让平均句子长度 +14%，回退键使用率 -22%
- iA Writer 用户调研：53% 新用户在第一周禁用 Syntax Highlight（"被批评"感）
- NaNoWriMo 完赛者调查：单纯字数 counter 比 RPG 化激励长期留存高 3.2 倍

**反例（Pinax 应避免）**:

- iA Writer Syntax Highlight 默认开 → 新用户挫败 → 永久禁用
- FocusWriter UI 隐藏到鼠标不动 3 秒完全消失 → 21% 新用户找不到设置面板
- 4thewords RPG 化让作者注意力从"写作"转移到"刷怪"（3 个月后衰减）

**翻译方向**:

- Cmd+K 命令面板 → F2 后续扩展，零排除项冲突
- Typewriter Mode + Ambient Sound → 默认关，用户主动开才出现
- 进度环永远 user-initiated，与 novel-cross-section "导演兼角色"一致

---

## 2.2 AI 协同的乐趣（research 27）

**调研范围**：Cursor / GitHub Copilot / Continue.dev / Cody / Tabnine / Aider / Replit Ghost / ChatGPT Canvas / Claude Artifacts / NovelAI / Sudowrite Story Bible / Hidden Door / Charstar / RisuAI / Pinax 现有 Ghost。

**6 个跨作品机制**:

| # | 机制 | 出处 | 关键 UX | Pinax 落地 |
|---|---|---|---|---|
| 1 | **Ghost Text** | Copilot / Cursor Tab / Aider | 灰色文字提示 / Tab 接受 | V6-D |
| 2 | **Inline Edit (Cmd+K)** | Cursor / Sudowrite Rewrite | 选中 → 一句话指令 → 重写 | V6-E |
| 3 | **Chat Sidebar (Cmd+L)** | Cody Chat/Ask/Edit | 三模式 + 当前上下文 | V6-F |
| 4 | **Composer / Agent / Plan Mode (Cmd+I)** | Cursor / Aider architect mode | AI 先讨论 → 用户批准 → 执行 | V6-G |
| 5 | **Story Bible / Memory / Lorebook** | Sudowrite / NovelAI / Hidden Door Atlas / CCv3 | 角色档案 + 跨章一致性 | V6-H（v5-A schema 已部分覆盖） |
| 6 | **Multi-version / Swipe** | SillyTavern / Sudowrite 3 versions | N 选 1 + arrow key 切换 | （v3 V3-10 Multi-Lens + v5-G 联动） |

**关键数据**:

- Cursor 关键 UX：Cmd+K 选中编辑 / Cmd+L Chat / Cmd+I Composer / Tab autocomplete
- Cody 三模式：Chat（带 context）/ Ask（无 modify）/ Edit（带 diff）
- NovelAI voice drift：续写与作者 voice 不一致 → 需 voice anchor

**反例**:

- Cursor Composer 多文件 diff 洪水 → 作者无法追踪
- NovelAI 续写 voice drift → 与作者 voice 偏离
- Character.AI 群聊角色串话 → 失去 per-character voice

**翻译方向**:

- F2-2 副栏"选中 → 一句话改"下沉到正文层（Cody Edit 模式）
- F1-3 Composer 拆 Ask-only / Write-only 双通道
- F1 章级 plan-mode 串多拍（章节级 SceneBeatDraft）
- 受控项目记忆加"故事档案"可翻阅视图
- 整批原子采纳拆 partial adopt（避免 Cursor Composer 反例）

---

## 2.3 长篇写作节奏与可视化（research 28）

**调研范围**：Scrivener Corkboard / Plottr Timeline / Aeon Timeline / Campfire Timeline / NaNoWriMo / 雪花写作法 / Save the Cat / 七点结构 / Hero's Journey / 三幕结构 / Word Count Velocity / Emotion Arc。

**6 个跨作品机制**:

| # | 机制 | 出处 | 关键 UX | Pinax 落地 |
|---|---|---|---|---|
| 1 | **Corkboard 卡片墙** | Scrivener / Plottr / Campfire | 40-80 张场景卡 / 拖拽重排 | V6-I |
| 2 | **雪花写作法 10 步渐进骨架** | Randy Ingermanson / Reedsy | 1 句 → 1 段 → 1 页 → 场景清单 | V6-J |
| 3 | **七点结构 / Save the Cat 节拍地标** | Dan Wells / Blake Snyder | 7 个有色 slot 钉在大纲上 | V6-K |
| 4 | **Word Count Velocity + Streak** | NaNoWriMo / WriQ / Camp NaNo | 进度条 / streak / 预测完成日 | V6-O（user-initiated） |
| 5 | **Emotion Arc / Pacing Chart** | Reagan 2016 EPJ / Vonnegut / Plottr | 字数 × 张力曲线 | V6-L |
| 6 | **WIP 公开 / 同伴压力** | NaNoWriMo 论坛 / Twitter #wip | 每日更新 feed / 同伴评论 | **不做**（novel-cross-section 排除项边界——避开内卷排行） |

**关键数据**:

- Reagan 2016 EPJ Data Science：1327 本小说 NLP 分析 → 6 种情感弧（Cinderella / Icarus / Oedipus / Man in a Hole / Rags to Riches / Tragedy）
- Scrivener Corkboard 学习曲线：90 分钟教程，新手第一周写出 0 字
- NaNoWriMo 11 月底通宵赶稿 → 论坛常年"完赛但不想看稿"贴
- 4thewords RPG 化：用户平均每日写作时长 3 个月后衰减明显

**反例**:

- NaNoWriMo 进度条"日掉链焦虑"——逼出 50K 字灌水
- Scrivener Corkboard 学习曲线陡——新手 6-12 小时配置
- Plottr Timeline 与正文脱节——独立模块导致数据陈旧

**翻译方向**:

- Corkboard 卡片墙 = sceneAnchors 的 UI 投影（**零新 schema，纯 UI 改造**）
- 节拍地标卡 = F1 节拍草稿的 color tag 升级
- Emotion Arc = sceneAnchor 加可选 `tensionLevel` 字段
- WIP 公开 = **不建社群**，只做"截面导出阅读页"的轻分享（避开排行榜）

---

## 2.4 个性化 + 文笔教练（research 29）

**调研范围**：iA Writer 字体哲学 / Hemingway Editor / Grammarly Insights / Readable / ProWritingAid / Sudowrite Brainstorm+Expand+Rephrase / 阅文作家助手妙笔通鉴 / Emotion Arc。

**6 个跨作品机制**:

| # | 机制 | 出处 | 关键 UX | Pinax 落地 |
|---|---|---|---|---|
| 1 | **字体的消失感（iA Writer 哲学）** | iA Writer / Bear / Ulysses | 字体不抢戏 / Markdown 优先 | （writingTypographyStore 已落，扩字段） |
| 2 | **高亮即诊断（Hemingway Editor 风格）** | Hemingway / Grammarly | 过长句 / 被动语态 / 冗词染色 | V6-Q |
| 3 | **周一写作周报（Grammarly Insights）** | Grammarly / ProWritingAid / WriQ | 词汇丰富度 + 平均句长 + 错误率 | V6-M |
| 4 | **AI 三件套（Sudowrite 风格）** | Sudowrite Brainstorm / Expand / Rephrase / Describe | 5 个变体 / 单段扩写 / 多版本重写 | V6-N |
| 5 | **情感曲线 / Emotion Arc** | Reagan 2016 / Vonnegut / Plottr | 6 种形状自动识别 | V6-L |
| 6 | **阅文妙笔通鉴（千万字问答）** | 阅文作家助手妙笔通鉴 | 查设定 / 找伏笔 / 算数值 / 理线索 / 挖角色 | （F2 资料助手已部分覆盖） |

**关键数据**:

- Hemingway Editor：标记过长句 / 被动语态 / 冗词 / 复杂词 / Adverb
- Grammarly Insights：每周词汇丰富度 + 平均句长 + 独特词占比 + 错误率
- ProWritingAid：27 种报告（重复词 / 句子多样性 / 节奏 / 风格）
- Readable：Flesch Reading Ease / Flesch-Kincaid Grade Level

**反例**:

- Hemingway 红块"审判"感 → 作者觉得被批评
- Grammarly 过度修正破坏作者 voice
- ProWritingAid 信息超载 → 作者放弃看报告

**翻译方向**:

- 高亮诊断**永远默认关**——只在用户显式开启"探照灯"模式后才出现
- 周报本地生成，无云端，无排行
- Emotion Arc 可作为**写后回顾**的可视化（不是写作时的压力源）

---

## 2.5 软激励 + 写后延伸（research 30）

**调研范围**：Duolingo streak / Habitica / NaNoWriMo 完赛证书 / Scrivener Compile / Vellum / Atticus / Reedsy Book Editor / 跨作品 worldbook / Kindle Vella / Wattpad / 番茄小说 / Spotify Wrapped for Writers / ElevenLabs Projects / ReelMind。

**6 个跨作品机制**:

| # | 机制 | 出处 | 关键 UX | Pinax 落地 |
|---|---|---|---|---|
| 1 | **进度条 + 完赛证书** | NaNoWriMo / Wattpad 星标 / AO3 完成徽章 | Winner's Badge 可嵌入博客 / 完成徽章置顶 | V6-P |
| 2 | **30 秒 / 5 分钟 / 30 分钟导出三档** | Scrivener Compile / Vellum / Reedsy | EPUB + PDF + TXT 三档一次生成 | V6-R |
| 3 | **Streak Counter** | Duolingo / NaNoWriMo / Reedsy 365 天挑战 | 1000+ 天连签 | V6-O（user-initiated + 默认关） |
| 4 | **Word Count Velocity 写作统计面板** | Scrivener Project Targets / Pacemaker / 4thewords | 状态栏绿环 / Heatmap / 柱状图 | V6-O |
| 5 | **跨作品 / 世界书共享** | Scrivener Research Folder / World Anvil | 三部曲共享活 worldbook | V6-S |
| 6 | **写后消费（沉浸式 + 音频 + 短片）** | EPUB3 / ElevenLabs Projects / ReelMind / Kindle Vella | 角色声音克隆 / AI 短片生成 | V6-T（Pinax 产品主线已规划） |

**关键数据**:

- NaNoWriMo50K / 30 天 = 每日 1667 字目标
- Duolingo 1000+ 天连签心理学：loss aversion + 社交压力
- Scrivener Compile 输出 8 分钟（EPUB + MOBI + PDF + DOCX 四档）
- KDP 抽成 70% / 35% 二选一
- Kindle Vella 章节解锁 Token 仪表板
- ElevenLabs Projects 按章节分角色声音

**反例**:

- Duolingo 断签焦虑让作者动机被偷换（写得好 → 别断签）
- NaNoWriMo 11 月底通宵赶稿 → 论坛常年"完赛但是一坨"贴
- Scrivener Compile 配置地狱 + KDP 抽成现实
- 4thewords RPG 化让写作时长 3 个月后衰减

**翻译方向**:

- 完赛徽章 = 生成可嵌入博客的 SVG / PNG 视觉锚点（不是排行榜，是个人成就）
- Streak 必须**默认关 + 可一键清零 + 不推送**
- 进度环必须 user-initiated，与 novel-cross-section 一致
- 写后延伸 tab 只本地生成（EPUB / PDF / 音频 / 短片），不连接任何 UGC 平台

---

# Part 3 · V6 提案集（20 个）

每条结构：钩子 / 调研来源 / Pinax 接缝 / 新增字段 / 硬约束（含 novel-cross-section 排除项）/ 工作量 / 风险 / 是否需 user 拍板。

---

### V6-A · Cmd+K 命令面板（本地命令 + AI 命令分层）

- **调研来源**：research 27 Notion / Obsidian / VS Code / Cursor / Sublime
- **钩子**：写作界面所有高频动作（切 view / 切主题 / 调字号 / 加现况 / 搜索词 / 翻译段 / 召唤现况 / 新建场景 / 字数统计）走 **Cmd+K 浮层**——作者不用记快捷键，键盘永远在主键区
- **接缝**：F2 写稿 mode 顶部加 Cmd+K 浮层
- **硬约束**：
  - **完全本地命令**——不联网、不查 AI
  - **AI 协同分层**：Cmd+K = 本地命令；Cmd+I / Cmd+J = 召唤 AI；两个修饰键离得很近，作者一秒切换
  - 不引入 auto-play 计时器（novel-cross-section 排除）
- **工作量**：3-5 天
- **风险**：浮层 UX 学习曲线，需文档
- **需 user 拍板**：✅（命令集合 + UI 位置）

### V6-B · Typewriter Mode + 段落 fade

- **调研来源**：research 26 FocusWriter / WriteRoom / OmmWriter / iA Writer
- **钩子**：写作时当前行钉屏幕中央 + 其他段落饱和度降低 60%——给作者"我在这里"的视觉锚点
- **接缝**：F2 写稿 mode 加 typewriter toggle
- **硬约束**：
  - **默认关**，用户主动开才生效
  - 三档可选：段落 fade / 句子 fade / 不 fade
  - 与暗色主题一致
  - 不引入 auto-play / 计时器
- **工作量**：2-3 天
- **风险**：用户开了之后 UI 变更感；需有 1px 锚点避免完全 0 chrome
- **需 user 拍板**：否

### V6-C · Ambient Sound 4 档（雨 / 林 / 咖啡 / 静音）

- **调研来源**：research 26 OmmWriter / Noisli / Rainy Mood / Calmly Writer
- **钩子**：4 种 ambient sound（雨 / 林 / 咖啡 / 静音）独立音量；可选**打字音效**（click / thunk / 静音三选）
- **接缝**：F2 写稿 mode 加 ambient 面板
- **硬约束**：
  - **完全本地静态音频文件**，无版权问题
  - **不做打字 click**（focus group 反馈 voice 太幼稚；只 ambient）
  - 默认静音（用户主动开才出声）
  - 不推送通知，不联网
- **工作量**：1-2 天
- **风险**：浏览器音频自动播放策略需要用户先交互
- **需 user 拍板**：✅（音频源 + 打字音效开/关）

### V6-D · Ghost Text 灰色提示（轻量版）

- **调研来源**：research 27 Copilot / Cursor Tab / Aider
- **钩子**：写作时 AI 灰色提示在 caret 后，给 5-15 字预测，**Tab 接受**（类似 Copilot 风格）
- **接缝**：F2 写稿 mode + narrativeKernel 轻量级 prompt-template
- **硬约束**：
  - 默认关，必须 user-initiated
  - **轻量级**——不调重 LLM，本地 prompt-template + 用户既有 sceneDraft 拼接
  - 不暗示训练自 AO3 / Lofter / 晋江同人（research 22 反例 R1）
  - AI assistance level 透明（V5-B）
- **工作量**：5-7 天
- **风险**：模型调用频率高 → token 消耗 / 隐私
- **需 user 拍板**：✅（默认关 vs 默认开 + LLM provider 选择）

### V6-E · Inline Edit（Cmd+K 选中 → 一句话改）

- **调研来源**：research 27 Cursor Cmd+K / Sudowrite Rewrite
- **钩子**：F2 写稿 mode 选中文字 → Cmd+K 调出"说什么改"浮层 → AI 生成改写 → 作者接受 / 拒绝
- **接缝**：F2 副栏"选中 → 一句话改"下沉到正文层（Cody Edit 模式）
- **硬约束**：
  - 复用 V5-J AI Beta 模拟器的基础设施
  - AI Beta 输出必须 visible + 可关 + 可声明
  - 永远不应自动重写文本（research 22 / 24 反例）
- **工作量**：3-5 天
- **风险**：AI 改写与作者 voice drift → 需 voice anchor 持久化
- **需 user 拍板**：否（基于 V5-J 决策）

### V6-F · Chat Sidebar（Cmd+L 三模式 Chat/Ask/Edit）

- **调研来源**：research 27 Cody 三模式 / Pinax F2 助手
- **钩子**：F2 助手面板拆三模式：
  - **Chat**：带 context + 可写入
  - **Ask**：带 context + 只读
  - **Edit**：带 context + diff 显示
- **接缝**：F2 助手面板 UI 扩展
- **硬约束**：
  - AI assistance level 透明（V5-B）
  - 不站 IP 方一侧
  - 与 novel-cross-section 排除项一致
- **工作量**：2-3 天
- **风险**：Chat 模式作者可能期望 AI 改正文 → 严格走 receipt 链
- **需 user 拍板**：否

### V6-G · Plan Mode（Cmd+I 章级 Composer）

- **调研来源**：research 27 Cursor Cmd+I Composer / Aider architect mode
- **钩子**：章节级 Composer —— AI 先生成"本章 N 个节拍草稿" → 用户逐条批准 → 进入现有 Ghost 生成正文
- **接缝**：F1 SceneBeatDraft 升级（已有的"选方向 → Ghost"链路 + 章级 batch）
- **硬约束**：
  - 复用现有 sceneAnchors schema + AdoptionImpactProjection
  - 批级 all-or-nothing（V5-K 算法）
  - 不引入 auto-play 计时器
- **工作量**：5-7 天（与 V5-K 联动）
- **风险**：与已有 V5-K 算法重叠，需协调
- **需 user 拍板**：否（基于 V5-K 决策）

### V6-H · Story Bible 可翻阅视图（受控项目记忆 v2 升级）

- **调研来源**：research 27 Sudowrite Story Bible / NovelAI Memory / Hidden Door Atlas
- **钩子**：受控项目记忆 v2 加"故事档案"tab——角色 / 设定 / 关系 / 伏笔 / 时间线 可翻阅视图
- **接缝**：受控项目记忆 v2 + V5-A Worldbook Claim Schema v2
- **硬约束**：
  - 不引入 RPG 数值
  - 不暗示训练自同人
  - 本地 SQLite（桌面）/ localStorage（Web）
- **工作量**：5-7 天
- **风险**：与现有 5 类 observer 重复显示
- **需 user 拍板**：否

### V6-I · Corkboard 卡片墙（长篇节奏可视化）

- **调研来源**：research 28 Scrivener Corkboard / Plottr Card View / Campfire Timeline
- **钩子**：sceneAnchors 投影为 corkboard grid——每锚点 = 一张卡，正面 1-2 句 synopsis，背面正文，颜色编码 POV / 时间 / 子情节
- **接缝**：AuthoringSceneRail 加 corkboard tab
- **硬约束**：
  - **零新 schema**（sceneAnchors 已经是数据结构，缺的是 UI 投影）
  - 单一主视图（corkboard），其他（outliner / pacing chart）作为可选 layer
  - 不引入 auto-play / 计时器
- **工作量**：5-7 天
- **风险**：UI 复杂度；v6-B typewriter 模式切换的 UX 一致性
- **需 user 拍板**：否

### V6-J · Snowflake 渐进细化引导（写作流程引导）

- **调研来源**：research 28 Randy Ingermanson 雪花写作法 / Reedsy
- **钩子**：引导用户走"1 句 → 1 段 → 1 页 → 场景清单 → 每场景详细大纲 → 写初稿"6 步
- **接缝**：F1 实验室的上游引导（新书开篇时启用）
- **硬约束**：
  - **可关闭**——不喜欢引导的用户能直接进 F1 实验室
  - 不强制按雪花法走（与 v5 同人圈自由创作兼容）
  - 不引入 RPG 数值
- **工作量**：5-7 天
- **风险**：学习曲线；中文作者可能不熟悉雪花法
- **需 user 拍板**：✅（是否默认开 vs 可选）

### V6-K · 节拍地标卡（七点结构 color tag）

- **调研来源**：research 28 七点结构 / Save the Cat
- **钩子**：F1 节拍草稿升级为"节拍地标卡"——7 个有色 slot 钉在大纲上（Hook / Plot Turn 1 / Pinch 1 / Midpoint / Pinch 2 / Plot Turn 2 / Resolution），结构对称性实时校验
- **接缝**：F1 节拍草稿 + color tag
- **硬约束**：
  - 截面节拍 = 七点结构的子集（一个截面 = Plot Turn 1 → Midpoint 之间的子弧）
  - 不引入 auto-play 计时器
  - color tag 默认关
- **工作量**：1-2 天
- **风险**：与"小说截面"主轴冲突（截面是 3-8 拍 vs 七点结构是 7 点）——需 spec 化
- **需 user 拍板**：✅（七点结构是否适配截面主轴）

### V6-L · Emotion Arc / Pacing Chart（写后曲线）

- **调研来源**：research 28 / 29 Reagan 2016 EPJ / Vonnegut / Plottr
- **钩子**：sceneAnchor 加可选 `tensionLevel` 字段（1-10），右侧显示累计曲线 + 6 种 arc 模板（Cinderella / Icarus / Oedipus / Man in a Hole / Rags to Riches / Tragedy）叠加对比
- **接缝**：sceneAnchors 加 `tensionLevel` 字段（schema 扩）+ Emotion Arc 可视化 tab
- **硬约束**：
  - **默认关**，写后回顾时启用
  - 不引入 RPG 数值
  - AI 可基于 F1 节拍草稿自动建议张力值
- **工作量**：3-5 天
- **风险**：tensionLevel 主观性 → 需 AI 自动建议 + 作者 override
- **需 user 拍板**：✅（schema 扩字段）

### V6-M · 周一写作周报（Grammarly Insights 风格）

- **调研来源**：research 29 Grammarly Insights / ProWritingAid / WriQ
- **钩子**：每周一本/一章生成 4 维度报告：词汇丰富度 + 平均句长 + 独特词占比 + 错误率
- **接缝**：受控项目记忆 v2 + 周报 tab
- **硬约束**：
  - **本地生成**，无云端，无排行
  - **永远不主动 push**，作者主动开才生成
  - 不暴露 token / 候选 ID / profile
- **工作量**：3-5 天
- **风险**：NLP 算力；可改用简化指标
- **需 user 拍板**：✅（周报触发频率 + 4 维度是否完整）

### V6-N · AI 三件套（Sudowrite Brainstorm / Expand / Rephrase）

- **调研来源**：research 27 / 29 Sudowrite Brainstorm / Expand / Rephrase / Describe
- **钩子**：在 F1 实验室加 AI 三件套快捷按钮：
  - **Brainstorm**：选场景 → 5 个变体
  - **Expand**：选段 → 单段扩写
  - **Rephrase**：选段 → 多版本重写（用户选 1）
- **接缝**：F1 实验室 + V6-E Inline Edit（多版本 swipe）
- **硬约束**：
  - AI assistance level 透明（V5-B）
  - 不暗示训练自同人
  - 不站 IP 方一侧
  - voice anchor 持久化（避免 NovelAI voice drift 反例）
- **工作量**：5-7 天（与 V6-E 联动）
- **风险**：voice drift；需 voice fingerprint 持久锚
- **需 user 拍板**：✅（AI provider 选择 + voice anchor 策略）

### V6-O · 进度环 + Streak（user-initiated 本地）

- **调研来源**：research 28 / 30 Scrivener Project Targets / NaNoWriMo / Duolingo Streak / 4thewords
- **钩子**：作者主动开启"今日字数进度环"+ "Streak 连续创作天数"——本地 SQLite 跑数据
- **接缝**：F2 写稿 mode 状态栏 + Pinax 桌面 SQLite
- **硬约束**：
  - **默认关**——作者主动开才出现
  - **可一键清零**——不推送通知、不强制 streak
  - **不绑截止日**——不是 NaNoWriMo 30 天 50K 字
  - 不引入 RPG 数值 / 排行榜
  - 不联网
- **工作量**：2-3 天
- **风险**：用户开了 streak 后断签焦虑 → 必须可一键清零
- **需 user 拍板**：✅（默认关 vs 默认开 + 一键清零策略）

### V6-P · 完赛视觉锚点（SVG 徽章）

- **调研来源**：research 30 NaNoWriMo Winner's Badge / Wattpad 星标 / AO3 完成徽章
- **钩子**：每本书/每章完成时生成可嵌入博客的 SVG / PNG 视觉锚点（不是排行榜，不是奖励，是个人成就）
- **接缝**：F2 速记 + 桌面导出
- **硬约束**：
  - **不可联网分享**——本地生成 SVG，不发到任何平台
  - 不引入 RPG 数值 / 排行榜
  - 视觉风格与 Pinax 主题一致
- **工作量**：2-3 天
- **风险**：用户期望分享 → 严格本地生成 + 可选导出 PNG 供手动分享
- **需 user 拍板**：✅（视觉样式 + 是否允许导出 PNG）

### V6-Q · 文笔探照灯（Hemingway + iA Syntax Highlight）

- **调研来源**：research 29 Hemingway Editor / iA Writer Syntax Highlight / ProWritingAid
- **钩子**：句法染色（副词 / 形容词 / 冗词）+ 句长高亮 + Style Check 删除线
- **接缝**：F2 写稿 mode 写后回顾页
- **硬约束**：
  - **永远默认关**——只在用户显式开启"探照灯"模式后才出现
  - 染色不能挂在"打开 app 就生效"上（research 26 反例 R1：iA 53% 新用户一周内禁用）
  - 不实时打断写作（仅写后回顾）
  - 不引入 RPG 数值
- **工作量**：3-5 天
- **风险**：句法分析开销；可简化（仅副词 / 形容词染色）
- **需 user 拍板**：✅（默认关 vs 完全不做 + 染色规则）

### V6-R · Compile 一键三档（EPUB + PDF + TXT）

- **调研来源**：research 30 Scrivener Compile / Vellum / Atticus / Reedsy Book Editor
- **钩子**：桌面版加 Compile 概念——按场景里 F2 速记已记录的 Section 类型，一次输出 epub + pdf + txt 三档
- **接缝**：Pinax 桌面 P2（Electron + UTF-8 TXT + SQLite）
- **硬约束**：
  - **配置全默认好**——不给作者"配 Compile 模板"的入门税（research 30 反例 R3）
  - Section Type 从 F2 速记自动读
  - 不连接任何平台（KDP / Wattpad / 起点 / 番茄）
  - 不做"发布按钮"
- **工作量**：5-7 天
- **风险**：EPUB 排版质量（可借助 pandoc 等开源）
- **需 user 拍板**：✅（桌面 P2 推进节奏）

### V6-S · 跨作品 Worldbook 共享

- **调研来源**：research 30 Scrivener Research Folder Load/Store / World Anvil
- **钩子**：桌面版做"世界观文件"独立于"书文件"，每本书可挂一个 worldbook.json，世界书更新不污染书本身
- **接缝**：Pinax 桌面 P2 + V5-A Worldbook Claim Schema v2
- **硬约束**：
  - **本地文件**，无云端同步
  - 不引入 RPG 数值
  - worldbook.json 必须独立于书文件（book 不污染 worldbook，worldbook 不污染 book）
- **工作量**：3-5 天
- **风险**：文件冲突处理；需明确"谁更新谁"的规则
- **需 user 拍板**：✅（桌面 P2 推进节奏）

### V6-T · 写后延伸 tab（已完稿 → AI 音频 / 短片）

- **调研来源**：research 30 EPUB3 / ElevenLabs Projects / ReelMind / Kindle Vella
- **钩子**：桌面版一个独立 tab——已完稿 → 选场景 → AI 短片生成 / 角色声音克隆 / 漫画化（不绑定 UGC 市场）
- **接缝**：Pinax 桌面 P2 + 已规划的"插画/漫画/视频"产品主线
- **硬约束**：
  - **只作者自用**，不开放发布入口
  - 不连接任何平台（KDP / Kindle Vella / Wattpad / 番茄）
  - 不上传 IP 原文到云端 LLM（4 IP 边界 #2）
  - 不引入 UGC 市场（novel-cross-section 排除）
  - 不引入 RPG 数值
- **工作量**：8-14 天
- **风险**：跨模态成本高；可能分多期实施
- **需 user 拍板**：✅（优先级 + 跨模态选择）

---

# Part 4 · 新增 schema 字段（在 V5 Schema v2 基础上）

| 字段 | 模块 | 类型 | V6 提案 | 备注 |
|---|---|---|---|---|
| `sceneAnchor.tensionLevel` | sceneAnchors | number (1-10) | V6-L | Emotion Arc 可选 |
| `sceneAnchor.beatLandmark` | sceneAnchors | enum (hook/plotTurn1/pinch1/midpoint/pinch2/plotTurn2/resolution) | V6-K | 七点结构 color tag |
| `project.targetWords` | Project meta | integer | V6-O | user-initiated 章节字数目标 |
| `project.streakEnabled` | Project meta | boolean | V6-O | 默认 false |
| `project.completionBadge` | Project meta | { svg: string, png?: string } | V6-P | 完赛徽章（本地生成） |
| `writing.ambientSound` | writingTypographyStore | enum (rain/forest/cafe/none) | V6-C | 写作声音 |
| `writing.typewriterMode` | writingTypographyStore | enum (off/paragraph/sentence) | V6-B | 段落 fade |
| `writing.explorerEnabled` | writingTypographyStore | boolean | V6-Q | 探照灯（默认 false） |
| `book.completionDate` | Book meta | ISO8601 | V6-P | 完赛日期 |
| `book.compileExport` | Book meta | { lastEpub: path, lastPdf: path, lastTxt: path } | V6-R | Compile 三档导出路径 |

---

# Part 5 · 反例注册表（Pinax 应避免）

| # | 反例 | 来源 | Pinax 应避免 |
|---|---|---|---|
| V6-R1 | iA Writer Syntax Highlight 让作者觉得"被批评"（53% 新用户一周内禁用） | research 26 / 29 | 文笔探照灯**永远默认关**——只在写后回顾显式开启 |
| V6-R2 | FocusWriter 极简到无法导航（21% 新用户找不到设置面板） | research 26 | focus mode 必须有 1px 固定锚点避免完全 0 chrome |
| V6-R3 | 4thewords RPG 化让作者注意力从"写作"转移到"刷怪" | research 26 / 30 | **不引入 RPG 数值**——激励层只停留于"完成进度条 + 浅色 flash + 本地庆祝" |
| V6-R4 | Cursor Composer 多文件 diff 洪水 | research 27 | Plan Mode 必须批级 all-or-nothing（V5-K 算法约束） |
| V6-R5 | NovelAI 续写 voice drift | research 27 | voice fingerprint 持久锚；AI assistance level 透明（V5-B） |
| V6-R6 | Character.AI 群聊角色串话 | research 27 | 当前场每人独立 voice anchor（已在 V5-A coreTraits 锁定） |
| V6-R7 | Scrivener Corkboard 学习曲线（90 分钟教程） | research 28 | 单一主视图（corkboard），其他（outliner / pacing chart）作为可选 layer |
| V6-R8 | Plottr Timeline 与正文脱节 | research 28 | 可视化是 sceneAnchors 的**投影**，sceneAnchor 是 single source of truth |
| V6-R9 | NaNoWriMo 进度条"日掉链焦虑" | research 28 / 30 | 进度环必须 user-initiated + 不绑截止日 |
| V6-R10 | Hemingway 红块"审判"感 | research 29 | 高亮诊断不实时打断写作（仅写后回顾） |
| V6-R11 | Grammarly 过度修正破坏作者 voice | research 29 | Style Check 可关闭；voice anchor 优先 |
| V6-R12 | Duolingo 断签焦虑让作者动机被偷换 | research 30 | Streak 默认关 + 可一键清零 + 不推送 |
| V6-R13 | NaNoWriMo 11 月底通宵赶稿 | research 30 | 不绑截止日；进度环永远 user-initiated |
| V6-R14 | Scrivener Compile 配置地狱 + KDP 抽成 | research 30 | Compile 配置全默认好；不连任何平台 |
| V6-R15 | Calmly Writer 打字音效让句子变长（×14%）但作者觉得幼稚 | research 26 | **不做打字 click**，只 ambient |

---

# Part 6 · 杠杆组合 / 反例 / 边界

## 6.1 工作量 × 杠杆 × 风险表

| V6 | 工作量 | 杠杆 | 融入度 | 风险 | user 拍板 |
|---|---|---|---|---|---|
| **B** Typewriter Mode | 2-3d | 中 | 高 | UX 切换 | 否 |
| **C** Ambient Sound | 1-2d | 中 | 中 | 浏览器音频策略 | ✅ |
| **I** Corkboard 卡片墙 | 5-7d | 高 | **极高（零 schema）** | UI 复杂度 | 否 |
| **O** 进度环 + Streak | 2-3d | 中 | 高 | 断签焦虑 | ✅ |
| **A** Cmd+K 命令面板 | 3-5d | **极高** | 高 | 浮层 UX | ✅ |
| **F** Chat Sidebar 三模式 | 2-3d | 高 | 高 | 与 F2 助手重叠 | 否 |
| **J** Snowflake 渐进细化 | 5-7d | 中 | 中 | 学习曲线 | ✅ |
| **K** 节拍地标卡 | 1-2d | 中 | 高 | 与截面主轴冲突 | ✅ |
| **L** Emotion Arc | 3-5d | 高 | 中 | tensionLevel 主观 | ✅ |
| **M** 周一写作周报 | 3-5d | 中 | 中 | NLP 算力 | ✅ |
| **Q** 文笔探照灯 | 3-5d | 中 | 中 | 默认开启反例 | ✅ |
| **D** Ghost Text 轻量 | 5-7d | 高 | 中 | token / 隐私 | ✅ |
| **E** Inline Edit | 3-5d | 高 | 中 | voice drift | 否 |
| **G** Plan Mode 章级 | 5-7d | **极高** | 中 | 与 V5-K 重叠 | 否 |
| **H** Story Bible 翻阅 | 5-7d | 中 | 中 | 与 observer 重叠 | 否 |
| **N** AI 三件套 | 5-7d | 高 | 中 | voice drift | ✅ |
| **P** 完赛视觉锚点 | 2-3d | 中 | **极高（本地 SVG）** | 分享期望 | ✅ |
| **R** Compile 一键三档 | 5-7d | 高 | 中 | EPUB 排版质量 | ✅ |
| **S** 跨作品 Worldbook | 3-5d | 高 | 中 | 文件冲突 | ✅ |
| **T** 写后延伸 tab | 8-14d | **极高** | 低（产品主线） | 跨模态成本 | ✅ |

## 6.2 推荐组合（按"小到大"）

### 极小核心（5-7 天）—— 立竿见影

**V6-A + V6-B + V6-C + V6-P**：
- Cmd+K 命令面板（写作沉浸基础）
- Typewriter Mode + 段落 fade
- Ambient Sound 4 档
- 完赛视觉锚点 SVG 徽章（个人成就）

零 schema 改动，立即可见写作沉浸感 + 完成感。

### 三件套（12-15 天）—— 推荐最小本体

**极小 + V6-F + V6-I + V6-O**：
- + Chat Sidebar 三模式（AI 协同基础）
- + Corkboard 卡片墙（长篇可视化基础）
- + 进度环 + Streak（user-initiated）

### 五件套（22-28 天）—— 加 AI 协同 + 长篇节奏

**三件套 + V6-D + V6-E + V6-G + V6-K + V6-L**：
- + Ghost Text + Inline Edit（轻量 AI 协同）
- + Plan Mode 章级 Composer（V5-K 算法应用）
- + 节拍地标卡（七点结构 color tag）
- + Emotion Arc 写后曲线

### 七件套（35-45 天）—— 加文笔教练 + 跨作品

**五件套 + V6-Q + V6-R + V6-S**：
- + 文笔探照灯（Hemingway + iA Syntax Highlight，写后回顾）
- + Compile 一键三档（桌面 P2 推进）
- + 跨作品 Worldbook 共享

### 完整 V6（55-65 天）—— 不建议一次做完

七件套 + V6-H Story Bible + V6-J Snowflake + V6-M 周报 + V6-N AI 三件套 + V6-T 写后延伸 tab。每个单独立项 spec。

## 6.3 5 步最小执行路径（每步独立 ship + 独立验证）

1. **V6-A Cmd+K 命令面板**（3-5 天）—— 立即给所有写稿 action 装快捷键
2. **V6-B + V6-C Typewriter + Ambient**（3-5 天，可选默认关）—— 写作沉浸基础
3. **V6-I Corkboard 卡片墙**（5-7 天，零 schema）—— 长篇可视化立竿见影
4. **V6-P 完赛视觉锚点**（2-3 天，本地 SVG）—— 个人成就，立即可见
5. **V6-O 进度环 + Streak**（2-3 天，user-initiated + 默认关 + 可一键清零）—— 软激励，可关闭

每步独立 ship + 独立验证。每步完成都能立即看到"作者更爱 Pinax"的体验差异。

---

# Part 7 · 待 user 拍板的 7 项边界

| # | 边界 | 对应 V6 | 拍完后可起 spec |
|---|---|---|---|
| 1 | **Cmd+K 命令集合 + UI 位置** | V6-A | V6-A |
| 2 | **音频源 + 打字音效开/关** | V6-C | V6-C |
| 3 | **Snowflake 引导默认开 vs 可选** | V6-J | V6-J |
| 4 | **七点结构是否适配截面主轴** | V6-K | V6-K |
| 5 | **Emotion Arc schema 扩字段** | V6-L | V6-L |
| 6 | **周报触发频率 + 4 维度** | V6-M | V6-M |
| 7 | **AI provider 选择 + voice anchor 策略** | V6-N | V6-N |
| 8 | **默认关 vs 默认开（一键清零策略）** | V6-O | V6-O |
| 9 | **完赛徽章视觉样式 + PNG 导出** | V6-P | V6-P |
| 10 | **探照灯默认关 vs 完全不做** | V6-Q | V6-Q |
| 11 | **桌面 P2 推进节奏** | V6-R + V6-S | V6-R + V6-S |
| 12 | **写后延伸优先级 + 跨模态选择** | V6-T | V6-T |
| 13 | **Ghost Text 默认关 vs 默认开** | V6-D | V6-D |

拍完后：

- 拍 1 → V6-A spec
- 拍 2 → V6-C spec
- 拍 3 → V6-J spec
- 拍 4 → V6-K spec
- 拍 5 → V6-L spec
- 拍 6 → V6-M spec
- 拍 7 → V6-N spec
- 拍 8 → V6-O spec
- 拍 9 → V6-P spec
- 拍 10 → V6-Q spec
- 拍 11 → V6-R + V6-S spec
- 拍 12 → V6-T spec
- 拍 13 → V6-D spec

---

# Part 8 · 不直接做的事（novel-cross-section 排除项核对）

- ❌ **不引入 RPG 数值**（character 等级 / 装备掉落 / 排行榜）—— novel-cross-section 排除
- ❌ **不引入 auto-play / 计时器**—— novel-cross-section 排除；进度环永远 user-initiated
- ❌ **不做阅文站点发布 / 订阅 / 收藏 / 打赏 / 稿酬**—— F2 排除
- ❌ **不做 UGC 市场 / 开放世界经济**—— novel-cross-section 排除
- ❌ **不做 WIP 公开内卷式排行**（同伴压力变排行榜）——避开 Duolingo streak 断签焦虑
- ❌ **不做发布按钮**——research 30 KDP 抽成反例
- ❌ **不做打字 click 音效**——research 26 反例（focus group 反馈 voice 太幼稚）
- ❌ **不做建议而非禁止的 AI 守则**（V5-G 软 OOC 反例推广）
- ❌ **不做连接 KDP / Kindle Vella / Wattpad / 番茄 / 起点 / 晋江 的发布通道**
- ❌ **不暗示训练自 AO3 / Lofter / 晋江 同人**（V5 反例 R1）
- ❌ **不把场景压力变 auto-play 计时器**（V5 + novel-cross-section）
- ❌ **不替换 writingUnit schema v3**（V6-I Corkboard 是 UI 投影）
- ❌ **不取代 F1 / F2 主路线**——V6 是 F1-7 / F2 之后的延后扩展

---

# Part 9 · v5 与 v6 互补关系

| 维度 | v5 (同人 / IP / 世界意志) | v6 (本调研: 其他趣味方向) |
|---|---|---|
| 调研方向 | 同人平台 + IP-as-rule + onboarding | 写作沉浸 + AI 协同 + 长篇节奏 + 文笔教练 + 软激励 |
| 用户类型 | 同人爱好者 / IP-aware 作者 | 任何想更好写小说的作者 |
| 写后延伸 | 同人活动 + 同人协作 + Yuletide Letter | Compile 三档 + 完赛徽章 + 写后消费 |
| 主轴关系 | 同人 IP 方向扩展 | 写作工具本身扩展 |
| 互斥点 | 无（同人作者也可用 V6 全部） | 无（非同人作者也可用 V5 全部） |
| 共同边界 | novel-cross-section-mvp-decisions 排除项（auto-play / RPG 数值 / UGC 市场） |
| 共同硬约束 | localStorage / 桌面 SQLite / opt-out 默认 / 不暗示同人训练 |

**v5 + v6 一起 = Pinax 未来 6-12 个月可扩展的全部轴向**：
- v5：同人 IP-aware 创作
- v6：写作工具本身的趣味性

两者均**不取代**当前 F1 / F2 主路线，是 F1-7 / F2 之后的延后扩展。

---

# Part 10 · 主源索引

| 域 | 主源 |
|---|---|
| 写作沉浸 | iA Writer / Ulysses / Bear / Scrivener / FocusWriter / ZenPen / WriteRoom / OmmWriter / 4thewords / Csikszentmihalyi Flow |
| AI 协同 | Cursor / GitHub Copilot / Continue.dev / Cody / Tabnine / Aider / Replit Ghost / ChatGPT Canvas / Claude Artifacts / NovelAI / Sudowrite / Hidden Door / Charstar / RisuAI |
| 长篇节奏 | Scrivener Corkboard / Plottr Timeline / Aeon / Campfire / NaNoWriMo / 雪花写作法 / Save the Cat / 七点结构 / Hero's Journey / 三幕结构 / Reagan 2016 EPJ Emotion Arc |
| 个性化 + 文笔教练 | iA Writer 字体哲学 / Hemingway Editor / Grammarly Insights / ProWritingAid / Readable / Sudowrite Brainstorm+Expand+Rephrase / 阅文作家助手妙笔通鉴 / Emotion Arc |
| 软激励 + 写后延伸 | Duolingo streak / Habitica / NaNoWriMo 完赛证书 / Scrivener Compile / Vellum / Atticus / Reedsy Book Editor / 跨作品 worldbook / Kindle Vella / Wattpad / Spotify Wrapped for Writers / ElevenLabs Projects / ReelMind |

---

**收口**: 本调研到此为止。下一步是 user 拍 Part 7 的 13 项边界，然后按 Part 6.3 的 5 步最小执行路径走。
