# Notes / 素材页强视觉重构研究报告

> Worker UI-N1 · 2026/06/19 · 基于 Notes.vue、Kao.css、FolioSurface/ArchiveStrip/CharacterPortrait 三件套的深度勘察

---

## 0. 调研摘要

`src/pages/Notes.vue` 当前属于 N5C (Material-folio) 二次迭代，已经把 WorkbenchPageHero SaaS 风格的工具条替换成 `manuscript-top` 手稿顶栏，把左侧改成 `material-group` 分组条目 + Roman 编号 + 彩色书脊条，把批量行换成 `material-selection-stamp` 票根。但页面"骨架"仍是一个典型的三段式 (左 aside + 主区) CMS 布局：260px 硬侧栏、FolioSurface 纸面包壳、editor-header 工具条 + textarea 三件套、空状态是无背景的居中 SVG + 按钮。这套结构和"档案柜/索引卡/证物板"的强视觉叙事差距极大，因此用户反馈"只是部分肯定"——保留材料层叙事，但主体构图还没有成形。

下文分四部分：(1) 哪些方向保留，(2) 哪些必须推翻，(3) 三个强方案 + 文字布局图，(4) 推荐方案的 IMPLEMENTER BRIEF 与 SELF-REVIEW。

---

## 1. 当前 Notes 哪些方向应该保留（≥8 条）

下列元素在视觉语言、信息密度、与 Kao/Archive-folio 主题契合度上都已过关，**不要在重构里碰掉**，只需要在新骨架里复用。

1. **分组的彩色书脊条 `.material-group-spine`** — 7 种 kind 颜色编码（`#5b8def` 正文候选、`#ef5350` 事件、`#f59e0b` 人物事实、`#66bb6a` 世界书、`#ab47bc` 灵感、`#26c6da` 分镜种子、`#ff7043` 参考图）作为分组最左边的 3px 长条 spine，已经把"档案类别色码"立住了。**保留作为三个方案的统一材质基础**，只是位置/厚度可随主视觉调整。

2. **Roman 编号 `GROUP_INDEX_ROMAN`（I–X）** — 用 `groupIndexLabel(idx)` 把每组前面打成 I / II / III / IV… 的西文罗马前缀。**这是档案语言最便宜的视觉投资**，替代枯燥的圆点；保留并把字号从 10px 微抬到 11px，颜色从 `--text-muted` 换成 `--archive-ink-soft`。

3. **`.material-action-btn` 的硬阴影 (18px 18px) + 无圆角 + paper-soft 底** — 这种"印章偏移投影"是 Kao/folio 视觉骨架里最成功的可复用 token，必须**整套搬到新主区的批量行**；不能因为重构换掉。

4. **`.material-selection-stamp` 票根带（dashed 上下轨 + 已选 N 项 · 批量）** — 是"票据/邮戳"叙事的最小可信物，与 archive-paper 主题吻合；保留并在新骨架里用作"选中态进入"的标准形态。

5. **LXGW WenKai 字体 + `--archive-paper-soft` 底色 + `--archive-ink` 墨色** — 三件套是 Kao 主题的全部资产，**新主体构图必须继续使用**，不要在中部换 sans-serif 或换冷色。

6. **`.manuscript-top` 顶栏的三段式（left: back + 素材 + 已选/章节；right: 状态 chip + 写作/新素材 + 主题）** — 用户认可 WorkbenchPageHero 被替换后的状态；**保留 right 区不动**（避免回到 SaaS），但允许把 back 按钮的 chevron 改成更"翻档案盒"的视觉。

7. **ArchiveStrip 三联拼贴** — 已绑定到当前选中 asset 的 kind，自动取前 3 条作为侧栏贴片。**保留作为中央编辑区上方的"小型参考目录"**，但要在新构图里重新决定它和主文是"上方带"还是"右下角浮卡"。

8. **CharacterPortrait (pose-id=narrator) 档案员立绘** — 已在 sidebar-header 下面挂载，caption "档案员"。**保留作为人格锚点**，在新主视觉里给它一个明确的"值班角落"位置（不能消失、也不能挡住阅读）。

9. **`is-archive-paper` 的颗粒叠层 (radial-gradient 三层 gold/ink/rose，opacity 0.42, mix-blend multiply)** — 这是 Kao 主题最贵的视觉特征，重构里**任何"主纸面"必须继续挂载**，否则失去识别度。

10. **`.material-entry-card` 的 tear-edge clip-path** — `polygon(0 6%, 4% 0, 96% 2%, 100% 8%, 98% 94%, 92% 100%, 4% 96%, 0 90%)` 的撕纸边已经能识别为"档案素材卡"。**保留作为缩略卡通用形状**，可以挪位置但不能丢。

11. **`.is-archive-strip` 的 `rotate(-3deg) translateX(8px)` 倾斜贴条** — 这个微旋转就是 Kao 主题"贴在墙上"的全部秘密；新方案里凡是涉及"贴在某处的小纸条/照片/票根"，**必须继承同一个 -3° 倾斜**以维持视觉一致性。

12. **ImageGenRail 的 left drawer 触发位** — 已在 `<ImageGenRail side="left">` 写死。生图 rail 钉在左侧抽屉是与画布/写作一致的入口；**保留位置不动**，新方案只允许把抽屉触发器改成"档案员旁边的胶卷/相机图标"以统一入口叙事。

---

## 2. 当前 Notes 哪些方向必须推倒（≥12 条）

下列结构/视觉是 CMS/SaaS 残留，是"还没有真正成形"的部分；重构时必须**整片删掉或重做**，不是微调。

1. **260px 硬侧栏 + 5px resize-handle** — `rightSidebarWidth` ref + `startResizeRight` / `onResizeRight` 是典型 CMS 行为。**必须删**。三个方案都不再用"可拖拽硬侧栏"，改用"档案盒抽屉（手风琴/抽屉开合）"或"展开卡片墙"。

2. **`sidebar-header` 的 40px `surface-raised` band** — 是 SaaS dashboard 阴影面板残留。**整段删**，新主视觉里"档案盒标签"或"抽屉把手"承担它的位置。

3. **空状态居中 SVG + 按钮（`<div class="empty-state"><svg width=48...>`）** — 这是当前最弱的视觉点。一段中性 SVG icon + "选择或创建素材" + "新建素材" 按钮是 0 叙事。**必须替换**为强构图叙事（详见下文三个方案）。

4. **`.asset-toolbar` 单一圆角矩形（border-radius: 8px + box-shadow: 0 2px 6px）** — 这是 Markdown 编辑器的 SaaS 工具条残留：类型 select + 画布 primary + 生成 secondary + 模式切换器，整行堆在 940px 居中。**必须重新设计**为"档案员的办公台面"或"贴在墙上的工序清单"。

5. **`.mode-switch` 的三按钮 编辑/Markdown/预览** — 看起来像 Word/Notion 模式切换。**必须从主视觉中去 SaaS 化**，改成手稿式的"打字的 / 看原版 / 看排版"暗示（图标+小字，不带边框 group）。

6. **`.editor-textarea` 940px 居中 + `border-radius: 8px` + `box-shadow: 0 10px 24px`** — 圆角 8 + 大阴影是 SaaS card 通用 token。**必须放弃圆角和大阴影**，用"在纸面上的手稿框"或"打字机滚筒"视觉替代。

7. **`showNewNoteModal` 居中模态弹窗 + `.modal-overlay` 半透明黑底** — `position: fixed; inset: 0; background: rgba(0,0,0,0.4)` 是通用 Modal。**必须替换**为"档案员从抽屉里抽出一张新卡"的就地交互（建议改成中央抽屉 pop-in 或 inline expand）。

8. **顶部 `.manuscript-top__book` 的 `border-left: 2px solid var(--accent)`（蓝色品牌色）** — 在 Kao 主题里用蓝色品牌 accent 是 1980s 编辑器残留。**改成 `var(--archive-gold)` 金色 spine**，否则左边色码会被破坏。

9. **`.manuscript-top__chapter` 的 `font-style: italic; color: text-secondary`** — 写"已选 N 项"用斜体是 Word 默认值。**改为 LXGW WenKai + `--archive-ink-soft` + 字间距 0.04em**，更接近边注。

10. **`<button class="manuscript-top__mode">` 的 24×24 圆形主题切换** — `border-radius: 50%` 与 Kao 主题"无圆角"原则冲突。**改成方形 22×22 带 dashed 边框**（"翻页"语义）。

11. **`selectChapter` 自动选中 `chapters[0]` 的默认行为** — `loadNotes` 会自动选第一条已有素材。**空状态下不要自动选**，否则"档案员打开抽屉发现空空如也"的叙事无法成立。空状态必须独立成立。

12. **`selectChapter` + `saveCurrentChapter` 切换时的瞬时无选中态** — 切换素材时短暂 selectChapterId 变化会让 UI 闪空态。**用 keep-alive 或延迟重置**避免闪烁（这是技术债，但要列入新方案约束）。

13. **`empty-hint` "暂无素材，点击上方 + 新建" 的浅灰小字** — 是 Material UI placeholder 残留。**必须删**，新主视觉的空态本身就是叙事，不需要 hint。

14. **`.image-asset-preview` 的圆角 8 + 260px 限高 + 灰色 bg** — 参考图缩略是 SaaS media card。**改成"贴在主稿纸上的照片"，四角用图钉/胶带，rotate -3°**，与 ArchiveStrip 视觉一致。

15. **`findResults` / `findReplace` / `nameGen` / `fontPanel` 等大量未挂载的 ref** — 这些声明在 `ref()` 但无 UI 入口，是 W3 之前的死代码。**重构里如果方案不需要，直接删**；避免给后续 reviewer 留下"为什么 ref 还在"的疑问。

16. **`toolbar-spacer` 1px 透明撑开元素** — 是从 WorkbenchPageHero 搬过来的 SaaS 布局技巧。**在 Kao 主视觉里改用 `margin-left: auto`** 或对称布局。

17. **`<textarea>` 的 wysiwyg/markdown/preview 三态切换** — 表面是"所见即所得"，实际 wysiwyg 仍然是 textarea + execCommand，**并没有 WYSIWYG**。这套假三态是技术债。**重构里要么真做 Wysiwyg (contenteditable + 自渲染)，要么改成"打字 / 校对"两态**，不要"假装三态"。

---

## 3. 三个强方案

### 方案 A：档案抽屉 / 索引卡盒（Archive Drawer / Card Catalog）

> 叙事：作者打开档案柜，先看到抽屉把手上的彩色标签；点开抽屉，索引卡像 Rolodex 一样翻出来；选一张卡，卡被推上"阅读台"放大；档案员在台面左侧值班。中央不放正文打字区，改成"卡盒阅读台"。

#### 3.A.1 文字布局图（1280×800）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◀ 素材 · 32 条 · 灵感 ─────────────── 已选 0 项  写作  新素材  ◐           │ ← manuscript-top  (y 0-44, h 44)
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────┬──────────────────────────────────────────────────────────┐ │
│ │              │  ╔══════════════════════════════════════════════════╗    │ │ ← 中央台面  y 56-740
│ │  档案员      │  ║  ▣ 索引卡 · 灵感 · 春夜灯下                       ║    │ │   x 260-960, w 700
│ │  立绘        │  ║ ┌──────────────────────────────────────────────┐ ║    │ │
│ │  (150×210)   │  ║ │ 卡片标题 (LXGW WenKai 28px gold drop-cap)  │ ║    │ │
│ │              │  ║ ├──────────────────────────────────────────────┤ ║    │ │
│ │  ── 卷宗 ──  │  ║ │ 正文 textarea (无圆角, paper-soft, 行高 2.0)│ ║    │ │
│ │  I  灵感 5   │  ║ │                                              │ ║    │ │
│ │  II 事件 3   │  ║ │                                              │ ║    │ │
│ │  III 正文 7  │  ║ │                                              │ ║    │ │
│ │  IV 人物 4   │  ║ │                                              │ ║    │ │
│ │  V  世界 6   │  ║ │                                              │ ║    │ │
│ │  VI 分镜 2   │  ║ │                                              │ ║    │ │
│ │  VII 图 5    │  ║ └──────────────────────────────────────────────┘ ║    │ │
│ │              │  ║  ◀ 上一张      共 5 张      下一张 ▶              ║    │ │
│ │  ⊞ 批量票根 │  ╚══════════════════════════════════════════════════╝    │ │
│ │   已选 0 项  │                          ┌──────────────┐                │ │
│ │              │                          │ ArchiveStrip │                │ │ ← 右下角浮卡 y 600-740
│ │              │                          │  3联贴片     │                │ │   x 980-1240, w 260
│ │              │                          └──────────────┘                │ │
│ └──────────────┴──────────────────────────────────────────────────────────┘ │
│                                                                              │
│  GmPersonaLauncher 右下                                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

层级 z（由下到上）：

- z-0  `FolioSurface[paper decorated]` —— 大幅纸面底
- z-1  `is-archive-paper` 颗粒叠层 —— 在纸面内
- z-2  左抽屉盒 `aside.material-drawer` —— 260px 抽屉柜
- z-3  中央台面 `section.reading-deck` —— 卡盒阅读台
- z-4  卡索引条目 `button.index-card` —— 抽屉内索引卡
- z-5  选中卡放大 `section.active-card` —— 阅读台上的"被推上来的卡"
- z-6  ArchiveStrip 浮卡 —— 3联贴片（右下）
- z-7  CharacterPortrait —— 档案员立绘（左抽屉内顶部）
- z-8  material-selection-stamp 票根 —— 批量态浮在抽屉上方
- z-9  ImageGenRail drawer —— 左侧生图抽屉
- z-10 GmPersonaLauncher —— 右下人格锚点

#### 3.A.2 各区域处理

- **左栏材质**：`aside.material-drawer` —— 一座打开的档案柜。每个 kind 分组做成一个"抽屉单元"（`section.drawer-unit`），顶部 28px 把手条 = `group-spine` 彩色条 + Roman + 标题；把手下方是手风琴抽屉盒（手风琴展开/折叠）；抽屉打开后里面是索引卡，每张卡是一个 `button.index-card`（高 64px，宽 240px），卡正面是标题 + 状态 chip + 入画布 ✓，卡背面（hover）展开摘要前 80 字。抽屉材质 = `is-archive-paper` 颗粒底 + 木纹暗影 `box-shadow: inset 4px 0 12px rgba(60,40,20,0.18)`。最顶部（120px 高）固定挂 CharacterPortrait 档案员立绘。

- **中央空状态**：当 `chapters.length === 0` 时，中央台面不渲染 card，而是渲染 `section.empty-archive` —— 一座 600×420 的"空档案柜俯瞰图"：12 个抽屉格全开但内部空白，中央叠一段手写体 "尚无卷宗" + 一张倾斜 -3° 的空白卡 + "档案员正在等你的第一条线索 · 新建素材" 按钮。**不再有居中 SVG**。背景用 `--archive-paper-strong` 加 1px dashed 金色网格（暗示"格位等待填满"）。

- **顶栏**：`manuscript-top` 保留三段式。`__book` 字段从 "素材 / 32 条" 改为 "档案柜 / 32 卷 · 7 类"，`border-left: 2px solid var(--archive-gold)`（覆盖原蓝色 accent）。右侧增加一个 `mode-toggle`（'卡盒 / 时间轴'，为后续 O-2 时间轴视图埋伏笔）。

- **批量选择**：从抽屉内每个 `button.index-card` 改为 "在卡片左上角露出一个小 checkbox"，checkbox 用 `var(--archive-gold)` 实心方块（非原生圆角）。任何一张卡被勾选 → 左抽屉顶部 `material-selection-stamp` 票根滑入（dashed 上下轨 + "已选 N 项 · 批量"），票根下方一行四个 `material-action-btn`（导入 / 采纳 / 归档 / 删除），沿用 `18px 18px` 硬阴影 + paper-soft 底 + 无圆角。**批量行的位置始终贴在抽屉把手之上，不下沉到抽屉内部**。

- **ArchiveStrip**：从 editor-header 内迁出到右下角 260×140 浮卡（`position: absolute; right: 24px; bottom: 24px`），沿用 3 联贴片 `rotate(-3deg) translateX(8px)`，外加一个 24×24 图钉 SVG 钉住左上角。

- **档案员立绘**：左抽屉最顶部 120px 高的 "档案员值班角"（`section.keeper-corner`），CharacterPortrait size="thumb" (150×210) + caption "档案员 · 值班中"（LXGW WenKai 11px）。档案员旁边挂一个 22×22 的"Inbox 收件箱"小箭头（暗示 ImageGenRail drawer 入口）。

---

### 方案 B：调查墙 / 证物板（Investigation Wall / Evidence Board）

> 叙事：作者来到调查室，正面是一面贴满线索、照片、红线、便利贴的 cork-board；左墙是档案柜提供原始素材；中墙是被选中素材的"放大审视"区；档案员站在墙的右下角举着手电筒。中央 = 整面 cork-board。

#### 3.B.1 文字布局图（1280×800）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◀ 调查墙 · 32 件证物 ──────────── 写作  新素材  ◐                            │ ← manuscript-top  (y 0-44)
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────┬──────────────────────────────────────────────────────────┐ │
│ │              │  ╔═══════ cork-board (深木纹 + 软木板纹理) ═══════╗     │ │
│ │  ▦ 档案柜    │  ║                                                ║     │ │
│ │  抽屉盒       │  ║   ┌────────┐  红线        ┌────────┐          ║     │ │
│ │  (210px)     │  ║   │ 卡片 A │ ─ ─ ─ ─ ─ ─ ─│ 卡片 B │          ║     │ │
│ │              │  ║   │ 春夜灯 │              │ 人物事实│          ║     │ │
│ │  I  灵感 5   │  ║   │ rotate │              │ rotate  │          ║     │ │
│ │  II 事件 3   │  ║   │ -3°    │              │ +4°     │          ║     │ │
│ │  III 正文 7  │  ║   │ 图钉钉 │              │ 胶带贴  │          ║     │ │
│ │  IV 人物 4   │  ║   └────────┘              └────────┘          ║     │ │
│ │  V  世界 6   │  ║                                                ║     │ │
│ │  VI 分镜 2   │  ║   ┌─────────────────┐    ┌────────────┐       ║     │ │
│ │  VII 图 5    │  ║   │  放大审视区     │    │ ArchiveStrip│       ║     │ │
│ │              │  ║   │  (中央主卡)     │    │  3联贴片   │       ║     │ │
│ │  ⊞ 批量票根 │  ║   │  800×420        │    │  rotate-3° │       ║     │ │
│ │              │  ║   │  图钉四角       │    └────────────┘       ║     │ │
│ │              │  ║   └─────────────────┘                         ║     │ │
│ │              │  ║                          👤 档案员 (右下角)   ║     │ │
│ │              │  ╚════════════════════════════════════════════════╝     │ │
│ └──────────────┴──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

层级 z：

- z-0  `--archive-photo` 深绿底色（调查墙的暗木纹基调）
- z-1  cork-board 软木纹理叠层 (repeating radial-gradient)
- z-2  卡片 A/B (z 2-5 不同 rotate 形成层次)
- z-3  红线 SVG 连接线（z 3，stroke 1.5px dashed var(--archive-rose)）
- z-4  中央放大审视区（"被钉住的主证物"）
- z-5  ArchiveStrip（贴片右下）
- z-6  CharacterPortrait 档案员（右下角阴影 -3°）
- z-7  material-selection-stamp（贴在 cork-board 上方）
- z-8  ImageGenRail drawer（左侧）
- z-9  GmPersonaLauncher

#### 3.B.2 各区域处理

- **左栏材质**：左 210px 是"档案柜原始档案"区，比方案 A 更窄，让中央 cork-board 更宽。每个 kind 分组仍然用 `material-group-spine` 彩色条 + Roman 编号，但条目不再是索引卡，而是"原始档案袋"（`button.archive-pouch`，`background: var(--archive-paper)`，`box-shadow: 2px 2px 0 var(--archive-ink)`，右侧开口处露出 4px 彩色折叠封条）。hover 时封条打开显示标题。

- **中央空状态**：当无素材时，cork-board 上是"干净的空墙" —— 浅木纹底 + 一段斜体 LXGW WenKai "墙上还空着" + 一张倾斜 -3° 的空白便利贴（100×100，浅黄 paper-strong）写着 "新证物" + 居中按钮 "钉第一张卡"。**完全没有 SVG icon**。

- **顶栏**：`manuscript-top` 保留。"调查墙 / 32 件证物"（替代"素材 / 32 条"）。`__book` 的 spine 改成 `var(--archive-rose)` 玫红色（呼应证物板的"红线"叙事）。

- **批量选择**：每个 cork-board 上的卡片左上角有图钉状 checkbox（12×12 金色实心圆，hover 时变成 ✕ 删除态）。勾选后所有被选卡片一起轻微浮起（`transform: translateY(-4px)`），并用 `var(--archive-rose)` 玫红虚线 1.5px 把它们连成一个多边形（暗示"证据组合"）。批量票根 `material-selection-stamp` 浮在 cork-board 顶部居中位置，宽度 480px，下方一行 4 个 `material-action-btn`（导入 / 采纳 / 归档 / 删除）。

- **ArchiveStrip**：右下角 220×120 浮贴，3 联卡片沿用 `rotate(-3deg) translateX(8px)`，每张卡左上角有一根胶带横条（10×60 半透明）。

- **档案员立绘**：右下角 140×200 CharacterPortrait size="thumb"，caption "档案员 · 持手电"。立绘旁边 24×24 图标："🗂" 收件箱入口（ImageGenRail drawer）。

---

### 方案 C：手稿剪贴簿 / 拼贴册（Manuscript Scrapbook / Collage Journal）

> 叙事：作者翻看一本硬壳剪贴簿，左页是分类索引（标签贴条），右页是当前选中的素材（剪贴到手稿纸上），剪贴簿脊背是档案员肖像。中央编辑区 = 右页手稿纸 + 各种拼贴元素（邮票、胶带、票根、便利贴）。

#### 3.C.1 文字布局图（1280×800）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◀ 剪贴簿 · 32 件 ──────────── 写作  新素材  ◐                                │ ← manuscript-top (y 0-44)
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌────────┬────────────────────────────────────────────────────────────────┐ │
│ │        │ ┌─ 左页 (340×720) ─┐  ┌─ 右页 (700×720) ─────────────────┐  │ │
│ │ 档案员 │ │  目录索引         │  │                                   │  │ │
│ │ 立绘   │ │                   │  │   ┌─────────────────────────────┐ │  │ │
│ │ 80×140 │ │  I  灵感 ─ 5     │  │   │ 标题 (LXGW WenKai 32px      │ │  │ │
│ │        │ │  II 事件 ─ 3     │  │   │ gold→rose drop-cap)         │ │  │ │
│ │ ────   │ │  III 正文 ─ 7    │  │   ├─────────────────────────────┤ │  │ │
│ │ 卷脊   │ │  IV 人物 ─ 4     │  │   │ 打字区 (无圆角, paper-soft, │ │  │ │
│ │ 彩色   │ │  V  世界 ─ 6     │  │   │ 行高 2.0, 940px 宽)         │ │  │ │
│ │ spine  │ │  VI 分镜 ─ 2     │  │   │                             │ │  │ │
│ │ 60px   │ │  VII 图  ─ 5     │  │   │                             │ │  │ │
│ │        │ │                   │  │   └─────────────────────────────┘ │  │ │
│ │        │ │  ╔═══════════════╗│  │                                   │  │ │
│ │        │ │  ║  ArchiveStrip ║│  │   ┌─────────┐  ┌─────────┐       │  │ │
│ │        │ │  ║  3 联贴片     ║│  │   │ 票根    │  │ 便利贴   │       │  │ │
│ │        │ │  ╚═══════════════╝│  │   │ 状态    │  │ 入画布✓ │       │  │ │
│ │        │ └────────────────────┘  │   └─────────┘  └─────────┘       │  │ │
│ │        │ ←── 装订线(中缝)  ──→   │                                   │  │ │
│ └────────┴───────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

层级 z：

- z-0  `--archive-paper-strong` 书皮底色（深纸纹）
- z-1  书脊 z-fold 阴影（`box-shadow: inset -8px 0 12px rgba(0,0,0,0.12)`）
- z-2  左页纸（`is-archive-paper` 颗粒底）
- z-3  右页纸（`is-archive-paper` 颗粒底，亮度比左页高 4%）
- z-4  中缝装订线（垂直 2px dashed `var(--archive-gold)`）
- z-5  卷脊 spine 条（左侧 60px 色码带）
- z-6  CharacterPortrait 档案员（书脊顶部）
- z-7  ArchiveStrip（左页下方贴片）
- z-8  票根 / 便利贴 / 邮票拼贴
- z-9  material-selection-stamp（横跨左页+右页）
- z-10 ImageGenRail drawer / GmPersonaLauncher

#### 3.C.2 各区域处理

- **左栏材质**：左栏不是"侧栏"，而是"剪贴簿的左页"。左页 340×720，纸面挂 `is-archive-paper` 颗粒底 + 顶部 64px 高的"目录标题"区（"目录 · INDEX" LXGW WenKai 18px gold 渐变）。下方是 7 个 kind 分组条目，每条以"卷贴标签"形式出现：`button.index-tab`（高度 40px，左侧 4px 彩色 spine + Roman + 标题 + 计数）。卷贴标签的右侧有"翻页箭头"，点开时整组 kind 翻到右页临时展开（实现 = CSS `:target` 或 sub-route）。左页底部 240px 是 ArchiveStrip 3 联贴片 + 档案员小立绘（80×140，pose-id="narrator"，caption "档案员 · 卷宗保管"）。**左页没有 checkbox 控件**，所有勾选通过右页大卡的"打钩图章"完成。

- **中央空状态**：当无素材时，右页手稿纸是空白的。整张右页中间贴一张 480×320 的"空白便利贴"（rotate -3°，paper-strong 底，左上角胶带横条），便利贴上 LXGW WenKai 22px "本卷尚无条目"，下方一行 "新建第一条" 按钮（`material-action-btn` primary）。背景手稿纸保留 24px 的"稿纸格"（非常浅的 dashed 网格，引导视觉但不喧宾夺主）。

- **顶栏**：`manuscript-top` 保留。"剪贴簿 / 32 件 · 7 类"。`__book` 字段加一个 `__spine-dot` 装饰：一个 8×8 金色实心方块（暗示书脊上的烫金点）。

- **批量选择**：右页大卡的右上角 24×24 区域是一个"图章按钮"（不是 checkbox），点击后盖一个圆形"已选"印章（dashed 玫红圆环 + 中央 ✓，rotate -8°）。任意 N 张卡被盖印章后，`material-selection-stamp` 横跨整本剪贴簿中缝（y=42px 高度，dashed 上下轨），下方四个 `material-action-btn` 沿用 18px 18px 硬阴影。

- **ArchiveStrip**：从右页底部迁到左页底部 240×140，与档案员立绘左右并列。

- **档案员立绘**：左页底部 80×140，与 ArchiveStrip 左右并列（拼贴感），caption "档案员 · 卷宗保管"。

---

## 4. 三方案对比一览

| 维度 | A 档案抽屉 | B 调查墙 | C 剪贴簿 |
|---|---|---|---|
| 左栏宽度 | 260 | 210 | 60 + 340 左页 |
| 中央主区叙事 | 卡盒阅读台 | cork-board 证物板 | 剪贴簿右页手稿纸 |
| 视觉识别度 | 中（柜子通用） | 高（红线+图钉+便利贴最强） | 中高（装订线+中缝） |
| 主体构图完整度 | 中（"阅读台"叙事可立） | 高（"调查"叙事最容易讲） | 中（剪贴簿易做得俗气） |
| 与 Kao 主题契合 | 高（继续用 paper tokens） | 高（玫红+金+墨色都齐） | 高（颗粒底+书脊 spine 复用） |
| ArchiveStrip 位置 | 右下浮卡 260×140 | 右下贴片 220×120 | 左页底部 240×140 |
| CharacterPortrait 位置 | 左抽屉顶部 150×210 | 右下角 140×200 | 左页底部 80×140 |
| 批量行位置 | 左抽屉顶部横条 | cork-board 顶部居中 480px | 横跨整本剪贴簿中缝 |
| 空状态叙事 | 空档案柜俯瞰 | 空 cork-board + 空白便利贴 | 右页空手稿 + 居中空白便利贴 |
| 实现难度 | 中 | 高（cork 纹理+红线 SVG 坐标计算） | 中 |
| 风险 | 抽屉动效在窄屏易抖 | 卡片乱飞易显杂 | 装订线在暗色主题下对比度低 |

---

## 5. 推荐方案：A 档案抽屉 / 索引卡盒（Archive Drawer / Card Catalog）

### 5.1 选择理由

1. **叙事与 Kao 主题契合度最高**："档案柜" 直接复用 `is-archive-paper` 颗粒底、`material-group-spine` 彩色条、Roman 编号、`material-action-btn` 硬阴影、material-selection-stamp 票根等全部已有 token，不引入新视觉资产。
2. **空状态叙事最容易讲清楚**：空档案柜俯瞰图 + 12 个抽屉格 + 倾斜 -3° 空白卡的复合构图，强于"居中 SVG + 按钮"。
3. **批量选择与左侧栏绑定**：票根贴在抽屉上方，4 个按钮天然继承 `18px 18px` 硬阴影，不需要为批量行再设计新位置。
4. **技术风险最低**：不依赖 cork 纹理贴图、红线 SVG 坐标计算、装订线 z-fold 阴影等高风险实现；纯 CSS + 现有 FolioSurface 即可落地。
5. **可扩展性最好**：未来加 "时间轴" tab（已在 manuscript-top 预留）时，档案柜抽屉天然支持"按时间维度展开"，而调查墙与剪贴簿的扩展性差。

### 5.2 IMPLEMENTER BRIEF DRAFT（中文）

#### 5.2.1 文件范围

- **修改**：`src/pages/Notes.vue`
  - 重构 `<template>` 中 `<aside class="sidebar books-sidebar">` → `<aside class="material-drawer">`
  - 重构 `<main class="editor-main">` 内部为空状态 / 卡片台面 / 翻页控件
  - 重构顶部 chrome 字段（`manuscript-top__book` 文案与 spine 颜色）
  - 调整 `<ArchiveStrip>` 位置（从 editor-header 内迁到右下角浮卡）
  - 调整 `<CharacterPortrait>` 位置（从 sidebar-header 下方迁到左抽屉顶部）
  - **删** `rightSidebarWidth` / `startResizeRight` / `onResizeRight` / `stopResizeRight` 整段 resize 逻辑
  - **删** `showNewNoteModal` + `.modal-overlay` + `.modal` + `.modal-header` + `.modal-body` + `.modal-footer` 相关代码（替换为 inline "抽出新卡"交互）
  - 保留所有现有 data/ref/computed/watcher 状态机；只在 template 与 style 层改写

- **修改**：`src/styles/themes/kao.css`
  - 新增 `.theme-kao .material-drawer` —— 左抽屉盒容器样式（260px 宽 + 木纹暗影 + 把手条 28px）
  - 新增 `.theme-kao .drawer-unit` —— 单个 kind 抽屉单元（手风琴展开/折叠）
  - 新增 `.theme-kao .index-card` —— 抽屉内索引卡（240×64 + 撕纸边 clip-path + 4° 微旋转 + 纸夹阴影）
  - 新增 `.theme-kao .reading-deck` —— 中央台面（700×680 + paper-soft 底 + `is-archive-paper` 颗粒层）
  - 新增 `.theme-kao .active-card` —— 被推上来的"阅读台主卡"（800×560 + 胶带顶 + 4° 微旋转反向）
  - 新增 `.theme-kao .empty-archive` —— 空档案柜俯瞰图（600×420 + 12 抽屉格 dashed 网格 + 倾斜 -3° 空白卡 + 标题/按钮）
  - 新增 `.theme-kao .archive-floating-pin` —— ArchiveStrip 浮卡钉子 SVG（24×24 金色实心方块）
  - 新增 `.theme-kao .keeper-corner` —— 档案员值班角（左抽屉顶部 120px 高 + 浅 wood-grain 底）
  - **调整** `.theme-kao .manuscript-top__book` —— spine 颜色 `var(--accent)` → `var(--archive-gold)`
  - **调整** `.theme-kao .manuscript-top__book` —— 文案 token（"素材 / N 条" → "档案柜 / N 卷 · N 类"）
  - **保留** `.theme-kao .material-action-btn` / `.material-selection-stamp` / `.material-group-spine` / `.material-entry-card` / `.is-archive-paper` 不动

- **不动**：`src/pages/Notes.vue` 中所有 `services/narrativeAssets`、`services/relationCanvas`、`services/professionalInfoGenerator`、`composables/useAdvisor`、`composables/useStorage`、`STORAGE_KEYS` 引用；以及 `<GmPersonaLauncher>` / `<AdvisorPanel>` / `<ImageGenRail>` 三个外挂组件的 props/事件契约。

- **不动**：`src/components/folio/FolioSurface.vue` / `ArchiveStrip.vue` / `CharacterPortrait.vue`（仅调整挂载位置与外层尺寸）。

#### 5.2.2 硬约束

1. **不重新引入 WorkbenchPageHero 或任何 SaaS hero**：manuscript-top 三段式是顶栏上限，不得扩展为 4 段 / 不得加入 kicker / 不得加入 description / 不得加入 CTA 主按钮。
2. **不引入任何第三方 UI 库**（Naive / Element / Ant Design 等）；所有新视觉必须由现有 Kao token + FolioSurface/ArchiveStrip/CharacterPortrait 三件套 + 原生 CSS 实现。
3. **不修改 store / generation / worldbookContextBuilder / server**：本重构是纯 template + scoped style + kao.css 的视觉层重构，状态机逻辑保持现状。
4. **不破坏可访问性**：
   - 所有 button / input 保持原生 `<button>` / `<input type="checkbox">` 语义
   - 焦点态沿用 `box-shadow: 0 0 0 2px var(--archive-gold), 0 0 0 4px rgba(183,138,52,0.3)` 双线金环
   - `prefers-reduced-motion: reduce` 下关闭所有 hover 旋转 / 抽屉展开动画
5. **不破坏窄屏**：min-width ≥ 1024px；1024px 以下仍允许但抽屉自动收起（不要做移动端专属布局）。
6. **颜色严格走 token**：所有新元素颜色必须从 `--archive-paper` / `--archive-paper-strong` / `--archive-paper-soft` / `--archive-ink` / `--archive-ink-soft` / `--archive-olive` / `--archive-gold` / `--archive-gold-soft` / `--archive-rose` / `--archive-photo` 中取，不得引入新 hex。
7. **typography 严格走 token**：所有正文用 `--font-display` (LXGW WenKai) 或 `--font-sans`；不得引入第三个字体族。
8. **保留 `material-selection-stamp` 票根**：批量态票根贴在左抽屉顶部，宽度 240px（贴合抽屉宽度），位置不得下沉到抽屉盒内部。
9. **保留 ArchiveStrip `rotate(-3deg) translateX(8px)`**：新位置（右下角浮卡 260×140）下旋转参数不变。
10. **保留 CharacterPortrait 在左抽屉顶部 150×210**：caption 文案统一为 "档案员 · 值班中"。

#### 5.2.3 截图验收标准

实现完成后，给以下 5 个场景各截 1 张 1280×800 图，存放 `docs/agent-runs/2026-06-19-ui-redesign-research/notes-redesign-A-{场景}.png`：

1. **notes-redesign-A-01-empty.png**
   - 验收点：左抽屉有 7 个空抽屉格（dashed 网格可见）；中央台面是"空档案柜俯瞰"构图，含 12 抽屉格 + 倾斜 -3° 空白卡 + "尚无卷宗" + "新建素材"按钮；右下方无 ArchiveStrip（空态不显示浮卡）；左抽屉顶部档案员立绘存在；顶栏 manuscript-top 显示 "档案柜 / 0 卷 · 0 类"。

2. **notes-redesign-A-02-list.png**
   - 验收点：左抽屉展开两个抽屉单元（如 I 灵感 5 + III 正文 7），索引卡清晰可见，每张卡左侧有彩色 spine（紫 / 蓝），卡有 -4° 微旋转；中央台面展示第一条素材的"放大卡"（含标题 + textarea + 翻页控件 ◀ 共 N 张 ▶）；右下角 ArchiveStrip 浮卡 260×140 可见，金色图钉 SVG 钉住左上角；档案员立绘在左抽屉顶部。

3. **notes-redesign-A-03-batch.png**
   - 验收点：左抽屉顶部 `material-selection-stamp` 票根滑入（dashed 上下轨 + "已选 N 项 · 批量"），下方 4 个 `material-action-btn`（导入 / 采纳 / 归档 / 删除）带 18px 18px 硬阴影；被选索引卡左上角金色 checkbox 为实心；非选中卡 checkbox 边框可见但未填充。

4. **notes-redesign-A-04-detail.png**
   - 验收点：中央台面渲染 active-card（含标题 + textarea + 翻页控件），textarea 无圆角 0 + paper-soft 底 + `is-archive-paper` 颗粒层；textarea 上方有 gold→rose drop-cap 首字；右下角 ArchiveStrip 3 联贴片与左侧档案员立绘视觉平衡（不互相遮挡）。

5. **notes-redesign-A-05-dark.png**
   - 验收点：与 04 同布局，主题切换为 `.theme-dark`；所有 archive-token 在暗色主题下重新映射（`--archive-paper: #eee3d2` / `--archive-ink: #17110d` 等）；金色 spine + 玫红印章在暗色下保持识别度；颗粒底纹理在暗色下不消失（opacity 可从 0.42 提到 0.55）。

每张截图验收清单（必须全部通过）：
- [ ] 左抽屉宽度 = 260px（不超 280，不少于 240）
- [ ] 中央台面宽度 ≥ 700px（不挤压翻页控件）
- [ ] 顶栏 `manuscript-top__book` spine = 金色（非蓝色）
- [ ] 顶栏 `manuscript-top__book` 文案 = "档案柜 / N 卷 · N 类"
- [ ] `material-action-btn` 圆角 = 0
- [ ] `material-action-btn` 阴影 = `18px 18px 0 var(--archive-ink 18%)`
- [ ] `material-selection-stamp` 票根位置 = 左抽屉顶部（不沉到抽屉盒内）
- [ ] `ArchiveStrip` 位置 = 右下角浮卡（不在 editor-header 内）
- [ ] `ArchiveStrip` rotate = -3° + translateX(8px)
- [ ] `CharacterPortrait` 位置 = 左抽屉顶部 150×210
- [ ] 中央编辑区无 `border-radius: 8px` 大圆角
- [ ] 中央编辑区无 `box-shadow: 0 10px 24px` SaaS 大阴影
- [ ] 所有颜色来自 archive-token（无新 hex）
- [ ] 所有正文走 LXGW WenKai 或 sans
- [ ] 焦点态双线金环可见
- [ ] `prefers-reduced-motion: reduce` 下无 hover 旋转动画

---

## 6. SELF-REVIEW：最可能错的 5 点

1. **最容易把"档案柜抽屉"做歪成"普通手风琴"** — 实现时容易直接把 `<button class="material-group-header">` 的 CSS 加 `max-height` 过渡就交差，但真正的"抽屉叙事"需要：
   - 抽屉把手 = 28px 高彩色条 + Roman + 标题（**不是单纯按钮**）
   - 抽屉盒 = `is-archive-paper` 颗粒底 + 木纹暗影 `box-shadow: inset 4px 0 12px rgba(60,40,20,0.18)`（**不是普通 surface-soft**）
   - 抽屉展开/折叠动效 = `transform: scaleY()` 而非 `height: auto`（后者动画不可用）
   - 索引卡 = `-4deg` 微旋转 + 4px 撕纸 clip-path（**不是单纯矩形 + hover 阴影**）
   - 抽屉收起时索引卡不应"塌掉"，应"叠起"（z-index 堆叠 + `transform: translateY(-2px)` 每张卡）
   错把"分组折叠"等同于"档案柜抽屉"会让叙事降级为普通 CMS sidebar。

2. **最容易把空状态做成"伪空状态"** — 空档案柜俯瞰图必须真的画出 12 个抽屉格的 dashed 网格 + 倾斜 -3° 空白便利贴 + LXGW WenKai 标题 + 主 CTA。如果只做"居中文案 + 按钮"（哪怕加了木纹背景），就还是 CMS 空态，叙事没立住。**验收时这张截图最容易 fail**，因为 review 时会盯着"有没有 12 个抽屉格"。

3. **最容易在中央台面引入新圆角/新阴影** — 写 CSS 时手会习惯写 `border-radius: 8px` / `box-shadow: 0 10px 24px`，但 Kao 主题要求 `border-radius: 0` + 硬阴影 `4px 4px 0` 或颗粒叠层。**这条要写进 reviewer checklist 前三条**，否则会在 PR review 时被反复要求"把所有 8px 圆角删掉"。

4. **最容易忽略"切换素材时的闪烁"** — 现在 `selectChapter` 切换时会先 `selectedChapterId = null` 再赋值，导致 UI 短暂闪空态。重构方案 A 用了 reading-deck 翻页动画（◀ 上一张 / 下一张 ▶），如果没有 keep-alive 或延迟重置，**翻页时中央台面会闪一下空态**。这是技术债，必须在新方案里明确处理（比如 `v-show` 永远不卸载 active-card，只 `transform: translateX` 推入推出）。

5. **最容易在批量行把"票根"做窄** — `material-selection-stamp` 当前宽度由 `flex: 1` 自然撑开，但抽屉宽度只有 260px 时，4 个 `material-action-btn` 横排会挤到按钮文字截断。**方案 A 必须验证**："已选 5 项 · 批量"在 240px 内能完整显示，4 个按钮（导入 / 采纳 / 归档 / 删除）能各自至少 56px 宽；否则要降级为 2×2 grid 或把票根延伸到抽屉外（`position: absolute; left: 100%; top: 0; width: 360px`）作为"抽屉右侧弹出的票据卡"。这一点在写 CSS 时容易漏掉，要写进 IMPLEMENTER BRIEF 的硬约束 #8 与截图验收清单。

---

> 报告结束。所有视觉建议均基于现有 Kao token + FolioSurface/ArchiveStrip/CharacterPortrait 三件套，未引入任何新依赖；所有推荐改动都限定在 `src/pages/Notes.vue` (template + scoped style) 与 `src/styles/themes/kao.css` 两个文件，未触碰 store / generation / worldbookContextBuilder / server。