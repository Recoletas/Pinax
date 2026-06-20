# Pinax /writing · /notes · /experience 跨页强视觉重构研究

> Worker：UI-R0（构图 / 页面角色层）｜基准 1280 截图 + 当前 Vue + kao.css + workflow.md
> 上一轮被否决：只动了边框、字号、按钮 → 必须从 **构图 + 页面角色 + 物件所有权** 重做方向
> 标记说明：[**观察**] = 从截图/源码直接确认；[**推断**] = 基于文件名 + 用户反馈 + 代码语义推导

---

## 1. Executive summary（12 条强结论）

1. **三页都是 SaaS dashboard 模板套上 archive 皮肤，不是手稿工作台。** [**观察**] 写作页 90% 是空白米色画布加一个小 empty state；笔记页只是把"作品"换成"素材"；体验页中央是 70vh 的空白 cream rectangle。视觉密度差距不到 5%。这根本不是三种角色，是同一个 admin shell 换三种 brand color。
2. **Manuscript top strip 不是顶栏，是手稿纸的天头，必须承担"档案归属感"**。当前 `.manuscript-top` 只是一个 44px 的 chrome bar，左边按钮 + select + 章节 italic 字，右边 chip + 三个透明 tab + 圆形 theme toggle。视觉重量等同于 Linear / Notion toolbar，没有任何 manuscript 物件感。
3. **Writing 页面缺失"写作的物件层"。** [**推断**] 用户期望"进入写作就像打开一本手稿"，但当前页面没有稿纸纹、没有装订线、没有章节编号条、没有写作侧记（margin note），连章节页码 / 总章节数都没有。它看起来像 Notion doc 加了一根 manuscript-top。
4. **Notes 页面把"档案员"立绘缩小到 thumb。** [**观察**] `<CharacterPortrait pose-id="narrator" size="thumb" caption="档案员" />` 嵌在 sidebar header 里大约 60×60px。Reverse:1999 把立绘当 **场景**（head bleed off top，silhouette 占画面 35-50%），Pinax 却把它降级成 60px 头像。立绘放错尺度 = 整页降级。
5. **Experience 页面把主区留空是结构性错误，不是设计意图。** [**观察**] 截图中央 720px 高的米色纸面里只有一个底部的输入条 + 几个 chip 标签。空白本身没问题，问题是空白里没有任何"在此处发生的事"——没有对话中轴线、没有当前场景描述、没有角色气泡、没有世界书卡片。这片空白违背了用户"叙事层次"的期望。
6. **三个页面的"右上控制组"是平级排列，没有层级差。** Writing top-right 是 4 个等高元素一字排开；Notes 几乎复制粘贴；Experience 把 persona launcher + image-gen rail + advisor panel 三个浮动组件无规则地悬挂在右下 + 右中 + 右下。三页都没有学到 Arknights 把控制拆成"顶角 / 边栏 / 浮动"三层簇的做法。
7. **侧栏（books-sidebar / writing-sidebar / .sidebar）宽度被 210px 锁死，三页共用同一个 1+2 分栏骨架。** [**观察**] `rightSidebarWidth = ref(210)`，`books-sidebar` 都是左 210 / 中 flex / 右侧浮动。"210px"在 1280 viewport 下是 16%，刚好让 sidebar 装不下任何东西（标题截断 + 列表只露半张图）。三页共用此宽度意味着三页的"主体信息"都被压缩到同一份 16:9 子比例，永远不可能形成各自的页面角色。
8. **三个页面的"叙事物件"（folio, archive strip, notebook tab, prop）几乎全部被压在左侧 210px 内。** [**观察**] material-group-spine、character-portrait、archive-strip 全在 sidebar。结果是中右 80% 区域是没有任何视觉锚的米色虚无。叙事物件应该围绕主体工作面散布，而不是全部堆在侧栏里。
9. **页面之间没有共用"工作台语言"。** [**观察**] Writing top 是 manuscript-top（手稿天头）；Notes top 复用 manuscript-top 但加了 `.material-top` modifier，本质还是同样布局；Experience 完全没有 top strip，直接是 `.game-layout` 容器。**结果是"看似同源，实际三套骨架"**——视觉上没有"打开 Pinax 工作台"的连续感。
10. **背景层全部是 gradient stack，没有 scene。** [**观察**] kao.css 提供 `--archive-paper` token，但没被任何一页用作场景背景，只用作 surface tint。Writing / Notes 用 `var(--archive-paper-soft)` 平铺背景；Experience 用 `radial-gradient(circle at 14% 0%, var(--accent-rose))`。三页背景都在"贴一层颜色"而非"放一张场景"。
11. **空状态是页面缩略图，不是入口。** [**观察**] Writing empty state：48px SVG + "选择或创建书籍" + 13px 灰 desc + 28px 红 CTA，居中于 720px 高画布。这个 empty state 既不在视觉重心上，也不在用户扫视路径上。它就是从 main.css 借来的 placeholder。
12. **"立绘所有权"在三页里随机分配：** Writing 用 `pose-id="writing-sidekick"` 在 sidebar footer；Notes 用 `pose-id="narrator"` 在 sidebar header；Experience 用 `pose-id="speaker-thumb"` 作为 backdrop。三个立绘是不同角色、不同尺度（thumb）、不同位置，没有任何"叙事连接"。如果用户从 Writing 切到 Notes 再到 Experience，他看到的是三个孤立的人，而不是同一个故事场景。

---

## 2. 为什么上一轮只是微调

### 2.1 Composition（构图层）

1. **三页共用 1+2 = 1(Sidebar 210px) + 1(Editor flex) + 1(Right floating rail)。** 这是从 main.css 抄来的 admin shell，不是为三种工作流设计的。Writing 需要"左侧作品架 + 中间稿纸 + 右侧笔记浮签"；Notes 需要"左侧档案柜 + 中间素材纸 + 右侧生图抽屉"；Experience 需要"左侧情报条 + 中央叙事场 + 右侧世界书"。三者的"中"和"右"应该完全不同比例，而不是同一个 flex 列。
2. **空状态居中 = 把"等待用户输入"当成视觉重心。** 当前的 empty-state 在 viewport 垂直居中，等于说"页面其他部分都是过场，主角是这个 CTA"。这违反了 narrative-first 页面（剧本场景永远在视觉中心，CTA 在场景的角落）。
3. **Manuscript-top 横跨整个 100vw 但只有 44px 高，是"胶带"不是"封面"。** 它在视觉上是 horizon line 一样的存在，但因为太薄、太水平，没有承担"天头"的封皮重量。Reverse:1999 的顶部是 3 段平行斜切 + 角色剪影叠层，Arknights 顶部是 200px 的 banner 带 + 角标簇；Pinax 这条 top 应该至少 56-72px，并承担"档案编号 / 当前章节序号 / 抄写笔势"等物件。
4. **三页 main shell 都是矩形 + 1px hairline。** Writing 是 chrome variant；Notes 是 paper variant；Experience 是带 clip-path 多边形 + 6px ink shadow。但 Notes 的 paper 是 archive-paper-soft 平铺，没有"卷宗右侧装订条"。三页都没有"书脊"。
5. **右上控制组都是等高横排。** Writing top-right 是 28px chip + 12px tab + 12px tab + 12px tab + 24px 圆 mode，等高 28px。Notes 同构。Experience 是浮动 persona + image rail + advisor panel 三件套。三者都没有学到 Arknights"角标簇"——主按钮大 60-72px，副按钮 32-40px，badge 12-16px 的三层差。

### 2.2 Hierarchy（信息层级）

1. **三页都没有"主视点"。** 视线扫过 Writing 截图：左 sidebar → 中空白 → 右 floating rail，三处都差不多重。Notes 同。Experience 略好（中央 shell 是 cut-corner polygon），但内部空荡，等于"门很大，里面空的"。
2. **"当前章节"信息被埋在 italic 灰色里。** `.manuscript-top__chapter` 是 `font-size:12px; font-style:italic; color:var(--archive-ink-soft)`。在 1280 viewport 下这条信息几乎不可见。但它是用户唯一的工作上下文，必须是页面第二主角。
3. **Status chip（"已保存 · 1,234 字"）是页面里字号最小的有意义信息。** 它用 `font-size:10px; letter-spacing:0.06em` 在 chip 里。这恰恰应该是反向：保存状态微小可以理解，但字数是写作进度主指标，应该在 top 右侧以 14-16px 出现。
4. **侧栏分组只有 2 层：作品 / 章节。** Writing sidebar 内部结构是 sidebar-header（作品） + book-list + sidebar-header（章节） + chapter-list + footer（立绘）。这等于没有层级——所有元素都是 sibling。Notes 略好（kind group），但 material-group-header 和 book-item 用同样的 12px 字号，没有视觉差。
5. **笔记页三种信息密度并存但没有对比**：selection-stamp 12px + book-item 12px + material-group-header 12px + character portrait thumb + material-selection-bar 28px，全部挤在 210px 宽的 sidebar 里，没有任何"标题-正文-脚注"的视觉差。

### 2.3 Page role（页面角色）

1. **Writing 是"稿纸工作台"，但页面没有任何稿纸视觉。** 没有稿纸格线、没有章首装饰、没有页边距尺、没有装订孔、没有章节扉页分页。它就是 textarea 套了 manuscript-top。
2. **Notes 是"档案柜"，但页面没有任何柜子视觉。** 七个 material-group 应该是七个抽屉 / 七个档案夹 / 七卷羊皮卷，但代码里只是七组 `<button class="material-group-header">` + 一串 `<div class="book-item">`。唯一接近"档案"的是 `material-group-spine`（3px 宽彩色条 + 18% ink shadow），但被埋没在 210px 里看不出来。
3. **Experience 是"剧场"，但页面只有幕布没有演员。** 中央 cream rectangle 是幕布，但幕布后面没有角色 —— 没有 scene description、没有 NPC 台词气泡、没有环境音效 prompt。`CharacterBackdrop` 提供了一张立绘做 backdrop，但被 shell 的 6px ink shadow + clip-path polygon 切割后只能看到裁切的一小角。
4. **三页没有"专属物件"。** Writing 应该有：稿纸 / 装订条 / 章首 drop-cap / 章节扉页；Notes 应该有：抽屉把手 / 档案脊色 / 罗马数字索引 / 装订孔；Experience 应该有：幕布 / 角色气泡 / 场景卡 / 章节扉页。当前它们共享 FolioSurface + BookmarkButton + CharacterPortrait 三个组件，**组件共用是好事，但页面专属物件没有发生**。

### 2.4 Asset usage（资产使用）

1. **LXGW WenKai 字体只在 `.manuscript-top__book-select` 和 `.manuscript-top__chapter` 和 `.editor-preview > p:first-of-type::first-letter` 三处使用。** 这等于"用 display 字体做了 3 个角落"。正文 textarea 用的是 `'Microsoft YaHei', sans-serif`。如果 manuscript 字体不进入正文，handwriting 感就是皮肤，不是灵魂。
2. **`--archive-paper / --archive-olive / --archive-gold / --archive-rose / --archive-photo` 五个 token 在三页里只承担了"按钮 hover bg"和"hover border"两个角色。** 它们没有出现在背景、装订条、装饰纸屑、纸张纹理上。
3. **`CharacterPortrait` 在三页用了三个 pose（writing-sidekick / narrator / speaker-thumb）但都是 thumb 尺寸。** 立绘的视觉戏剧性完全没用上。Writing 的 sidekick 在 sidebar footer（max-width:180px）；Notes 的 narrator 在 sidebar header；Experience 的 speaker-thumb 在 `<CharacterBackdrop>`（整页背景）。三页里只有 Experience 给了立绘"尺度"，但被 shell 遮挡。
4. **`is-archive-prop`（tape / fold / stain）三类装饰只在 WelcomeView 用过，三页都没用。** 这等于"档案道具只是开门红，正经工作场景里反而没有"。
5. **`ArchiveStrip` 在 Notes 用了一次（3 entry collage），但被放在 editor header 里 940px 居中列宽里。** 它应该出现在 sidebar 顶部作为"同类素材缩略图谱"，不是塞到编辑器头部。

### 2.5 Surface ownership（表面所有权）

1. **FolioSurface 是三页共用的 surface 容器，但三页的 variant 没有叙事化。** Writing 用了 chrome（hero）/ paper（aside sidebar）/ chrome（editor-main）；Notes 用了 chrome（hero）/ paper（modal）/ paper（main）；Experience 用了 chrome（modal）。FolioSurface 应该承担"这页是哪种物件"的角色：Writing 是 chrome + paper 拼接的稿纸；Notes 是 paper 拼贴的档案夹；Experience 是 chrome 框架的幕布。三页当前共用 chrome = "三页都是 metal 表面"，没有 manuscript 区别。
2. **侧栏是 FolioSurface paper 变体，但内部 list 没有"档案夹分页"语言。** material-group-header 是 button + spine + number + title + count + toggle，6 个元素塞在 32px 高度里。视觉上像 inline-toolbar 而不是档案夹 tab。
3. **主编辑区是 chrome 变体，但 surface 里面没有"格子 / 边距 / 装订孔"等稿纸暗示。** Writing 的 `.editor-textarea` 是带 padding 24px 的 textarea，看上去就是 box，不是稿纸。
4. **顶部 hero 是 chrome 变体（`.writing-page__hero` / FolioSurface variant="chrome"），但没有任何 chrome 物件**——没有订书钉、没有角标、没有 chapter ribbon。它就是平的。
5. **Modal（asset-inbox-modal / new-book-modal / quick-note-workspace）都用 FolioSurface paper 装饰变体，但 modal 内部 list / detail panel 还是 SaaS 表格。** 这等于"用档案纸包了一个 Notion 表"。

---

## 3. 参考拆解

### 3.1 Reverse: 1999 主菜单（叙事层次 + 立绘尺度）

> 重点：4 平面 parallax + 立绘作为场景 + 标题嵌入背景弧线 + 不规则 UI 形状

1. **立绘作为场景而非角色**：Reverse 的角色剪影占画面 35-50%，head bleed off top，人物站在画面中央偏左，背景是 3-4 层 parallax（远景建筑 + 中景道具 + 近景装饰）。**Pinax 落地**：把 `CharacterPortrait` 在 Writing 升级到 `size="scene"`，定位为 `position:absolute; left:8%; bottom:0; height:108vh; overflow:visible`，让 sidekick 的 head bleed off viewport top；Chapter 标题嵌入立绘胸前的弧线（`path` 跟随身体剪影），而不是浮在顶部 bar 里。
2. **多层 parallax 用 transform 错位**：Reverse 4 层以不同速率跟随鼠标移动，最远景 transform:translate(2%, 1%) 8s，最近景 transform:translate(8%, 4%) 4s。**Pinax 落地**：定义 `--parallax-depth-{1..4}` 4 个变量 + 4 个 keyframe（`parallax-far / mid / near / focal`），分配给 paper texture / ornament / character shadow / character body，每层周期 18s / 12s / 8s / 4s。键盘聚焦时停所有 parallax（a11y）。
3. **标题沿弧线嵌入背景而非悬浮**。Reverse 的游戏 logo 沿背景远景建筑的山脊线弯曲，字体大小随路径曲率变化（远端小、近端大）。**Pinax 落地**：Writing 章节标题用 SVG `<textPath>` 沿底部装订线弧线分布，标题字号从 56px 起步，章节序号字号 24px 在左侧；不要让标题简单躺在 `<input>` 里。
4. **不规则多边形按钮 + 视觉对位**：Reverse 的主菜单按钮是 `clip-path: polygon()` 平行四边形，按钮之间有 8px 错位；最近按钮 scale 1.06，最远 scale 0.88。**Pinax 落地**：Writing / Notes / Experience 的主 CTA 都用 `clip-path: polygon(0 6%, 4% 0, 96% 2%, 100% 8%, 98% 94%, 92% 100%, 4% 96%, 0 90%)`（已在 `material-entry-card` 实现过），按视觉重要度分 3 个 scale：主 CTA 1.04、副 CTA 0.96、disabled 0.88。
5. **卷帘式 letterbox（cinematic bars）**：Reverse 在场景切换时顶部 / 底部出现 8-12% 高的黑色 / 深色色块模拟电影宽银幕。**Pinax 落地**：每页保留 `manuscript-top` 56px + 新增 `manuscript-foot` 36px 作为视觉边框，颜色是 archive-ink 88%。Foot 内放 "页码 / 章节总数 / 当前时间 / 档案编号" 等档案元数据。
6. **场景氛围光（warm light overlay）**：Reverse 在主菜单左上角 / 右上角各加 30vw 半径的 radial-gradient light bloom（amber + ivory），模拟灯泡光照。**Pinax 落地**：在 `.theme-kao .writing-page::before` 加一个 `radial-gradient(circle at 18% 8%, var(--archive-gold-soft) 0 8%, transparent 32%)` + `radial-gradient(circle at 88% 92%, var(--archive-rose) 0 6%, transparent 28%)`，`mix-blend-mode:soft-light` + `opacity:0.6`。
7. **角色气泡作为页面叙事单元**：Reverse 在主菜单放 1-2 个 dialogue bubble 在立绘胸口偏上位置，文字是角色的招呼语。**Pinax 落地**：在 Writing 顶角放"批注侧记"气泡（CharacterPortrait sidekick 的内心独白），72px×88px，圆角左下 4px，背景 archive-paper-strong，border 1px gold。每次页面挂载随机抽 1 句台词（来自一个 8 句池）。
8. **音乐 / 章节切换的视差位移**：Reverse 切换章节时 4 层 parallax 以 240ms 时序位移（远景先动、近景后动）。**Pinax 落地**：在 Writing 切换章节时执行 staged transition——sidebar 12px translateX → manuscript-top opacity 0→1 80ms 后 → main editor fade-in → CharacterPortrait scale 1.0→1.04→1.0 (200ms)，用 Vue `<Transition>` group + CSS `--transition-stage` 自定义属性。

### 3.2 Arknights home screen（边缘功能集群 + 信息密度）

> 重点：四角功能簇 + 角标 badge + 中央功能 banner + 底部 dock 旋转

1. **四角功能簇不重叠**：Arknights 顶部右上 = 通知 + 邮件 + 资源，顶左 = 头像 + 等级；底部左下 = 商店 + 好友 + 任务，底部右下 = 主功能 CTA。**Pinax 落地**：Writing 顶左 = 档案编号 + 书名 + 当前章节（连续单行）；顶右 = 状态 chip（14px）+ 资源（字数）+ 主操作（保存 / 导出）；底左 = 笔手势 / 拼写检查；底右 = AI 续写 + 顾问 launcher。永远不在同一角放 2 个相邻按钮。
2. **角标 badge 极小但刺眼**：Arknights 的红点 8px / 12px 圆，带 2px 白边和数字。**Pinax 落地**：Notes 的 material-group-count 是 `font-size:11px`，改成 8px 圆形 badge + `--archive-gold-soft` 背景 + 1px 白边；Experience 的 mechanism-notice badge 用同样语言（8px 红点 + 数字 9px）。
3. **中央 banner 是横向 swipe 功能位**：Arknights 中央是 720×280px 横向 swipe 卡片，3-5 张活动 banner。**Pinax 落地**：Writing 中央上方加一个 940×88px "当前章节卷首" banner——左侧是 chapter index / number "第 03 章"，中间是 chapter title LXGW WenKai 28px，右侧是 chapter meta "2,341 字 · 上次修改 5 月 12 日"。Notes 中央上方加一个 940×88px "档案摘要" banner——左侧 material-group name，右侧 archive-strip（已在 N5C 实现）。Experience 中央顶部加一个 1440×140px "当前场域" banner——左侧 worldbook 名称 + 章节序号，中间 scenario 卡（NPC + 环境 + 时间），右侧 scene-progress bar。
4. **底部 dock 旋转主 CTA**：Arknights 底右主 CTA 是 88px 圆形，按不同活动变成不同功能（"出击" / "领取" / "进入活动"），底部 dock 还有 3-4 个副按钮 56px 圆形围绕主 CTA。**Pinax 落地**：Writing 底右把现在 24px 圆形 theme toggle 升级为 72px 圆形 "续写" 主 CTA（金色填充）；左边 4 个 44px 圆形副 CTA（保存 / 拼写 / 翻译 / 字数统计），围主 CTA 360° 半径 80px 排布。
5. **角色 strip 在底部或右侧**：Arknights 有 "Operator quick switch" 在右侧 64px 宽角色 strip。**Pinax 落地**：Writing 左侧 sidebar 顶部加 56px 高角色 strip（5 个 CharacterPortrait thumb 32×32px，水平排列），第 6 个是"+"新建 sidekick。点击切换 main 区背景立绘。
6. **资源计数器紧凑**：Arknights 顶右 "Sanity / Orundum / LMD" 三组，每组一个 16px 图标 + 数字，无 label。**Pinax 落地**：Writing top-right 把现在 "已保存 · 1,234 字" 拆成两个独立计数器："1,234 字"（archive-ink 14px）+ "5 分钟前"（archive-ink-soft 11px），中间用 1px gold 横线分隔。
7. **快捷入口折叠到右上抽屉**：Arknights 顶右"+"按钮打开横向抽屉，含 8-12 个 icon-only 入口。**Pinax 落地**：Writing 顶右 chip 末尾加一个 24px "···" 按钮，hover 时展开 6 个 icon-only 入口（批注 / 高亮 / 删除 / 复制 / 导出 / 复制为大纲），用 `clip-path` 平行四边形而不是圆角矩形。
8. **空状态角标而非占满屏**：Arknights 在没活动 banner 时中央是空，但留出一个"+"占位 + 2-3 行描述文案 + 一个 24px 小 CTA，而不是 Notion 风格大 CTA。**Pinax 落地**：三页 empty state 都改成 280×280px 的"档案盒开箱图"——SVG 画一个打开的抽屉，里面空着，下方 13px 一行文字，最右侧一个 28px "新建" outline button。不再占据中央 720px 高度。

### 3.3 Pinax welcome / opening / notes prototype（手稿物件 + 材质系统）

> 重点：FolioSurface + is-archive-prop + 3-plane z-axis + archive paper texture + ribbon / spine

1. **FolioSurface 三种 variant 必须叙事化**：当前 chrome（金属框）/ paper（稿纸）/ default（无装饰）应该扩展为 chrome=硬面（顶部 hero）/ paper=软面（侧栏 + 编辑器）/ scroll=卷轴（modal）+ parchment=羊皮纸（空状态）+ index=目录卡片（archive-strip）。**Pinax 落地**：在 FolioSurface.vue 加 `variant: 'chrome' | 'paper' | 'scroll' | 'parchment' | 'index'`，每个 variant 对应一套 clip-path + box-shadow + border。
2. **is-archive-prop 三类道具必须铺满工作场景**：当前只在 WelcomeView 用，Writing / Notes / Experience 工作场景里都没出现。**Pinax 落地**：tape 装饰放在 manuscript-top 左侧装订处（70×20px，半透明 ivory + gold border）；fold 装饰放在 modal 右上角（28×28px，225° 阴影折角）；stain 装饰放在空状态中央 SVG 里（42×36px，coffee ring）；所有 prop 通过 `data-prop="tape|fold|stain"` 控制，CSS 只动 position，size 由父元素决定。
3. **3-plane z-axis 必须贯穿三页**：当前 `--z-stage-decor` 用在 `.folio-surface--paper`，`--z-stage-hero` 用在 `.editor-container`，`--z-stage-cta` 用在 `.copilot-indicator / .chapter-title-input`。**Pinax 落地**：把 z-axis 扩展为 5 层：`--z-paper-back`（纸张背景层） / `--z-prop`（tape/fold/stain 道具层） / `--z-stage-decor`（folio chrome 装饰层） / `--z-stage-hero`（主体内容层） / `--z-stage-cta`（交互按钮层）。每层用 `position` + `z-index` 明确分工，避免 overlay 混乱。
4. **archive paper texture 用 multiply blend**：当前 `.is-archive-paper::before` 用 3 个 radial-gradient speckle + multiply。**Pinax 落地**：把这个 texture 升级为 SVG noise（feTurbulence baseFrequency 0.6）+ 实际纸纹 PNG overlay 的双层组合；texture 必须出现在主编辑区和 sidebar 背景上，不能只在 WelcomeView。
5. **material-group-spine 是档案脊的种子**：当前 3px 宽彩色条 + 18% ink shadow 太薄。**Pinax 落地**：把 spine 升级为完整 ribbon——左侧 6px 彩色 ribbon（gold for chapter / olive for material / rose for asset），顶部带 8px 折角，底部 4px 折角；ribbon 在 sidebar header 上 0% 突出 100%，selected 时 ribbon 颜色饱和度 +20%，unselected 时饱和度 -40%。
6. **archive-strip 应该是 3x3 collage 不是 3x1**：当前 ArchiveStrip 用 3 个 item position: 'center' 排在一行。**Pinax 落地**：改成 3x3 collage 网格（9 个 thumb），中间 1 个是当前选中素材（active 状态带 2px gold border），周围 8 个是同 kind 缩略图；点击任一 thumb 切换 main 区 asset。strip 总高度从当前 ~88px 升到 240px。
7. **罗马数字 + 章节序号 + LXGW WenKai 的 display 字体三件套必须贯穿**：当前 `.material-group-number` 用 `font-size:10px; font-style:italic` 太弱。**Pinax 落地**：罗马数字用 `font-family: var(--font-display); font-size:14px; letter-spacing:0.08em; color: var(--archive-gold)`；章节序号用同样 token；display 字体进入正文（textarea `font-family: var(--font-display), 'Microsoft YaHei'`），手写感从 surface 进入内容。
8. **opening demo 的"档案盒开箱"动效可以复用为页面进入动效**：OpeningPage 已经有 tape 飘落 + 角色气泡浮起 + 装订线展开的分层入场。**Pinax 落地**：三页 mounted 时执行 0.8s "卷宗开箱"序列——manuscript-top 56px translateY(-100%) → 0（180ms ease-out），sidebar opacity 0 → 1（120ms 后），main editor clip-path inset(0 100% 0 0) → inset(0 0 0 0)（240ms 后），CharacterPortrait scale 0.96 → 1.04 → 1.0（最后 180ms）。

---

## 4. Cross-page visual law（Pinax 工作台页面 12 条硬视觉规则）

每条规则都能落成 CSS / layout / DOM。

### 规则 1 — Sidebar 不再是 210px 锁死的 admin column，而是"档案边页"

- 文件：`src/pages/Writing.vue`（line 49 `:style="{ width: rightSidebarWidth + 'px' "`）、`src/pages/Notes.vue`（line 45 同）、`src/styles/themes/kao.css`
- 落法：三页 sidebar 默认宽度差异化——Writing 240px（作品架）、Notes 280px（档案柜，material-group 需要展开）、Experience 220px（情报条）。所有 sidebar 必须有 **spine ribbon**（左侧 4px 彩色 ribbon，gold/olive/rose 三色映射三页），且 collapsed 时不是 44px 圆角按钮，而是 **8px 宽带装订条**（spine-only view），保留 sidebar 标识。
- CSS：`--sidebar-spine-width: 4px; --sidebar-default-writing: 240px; --sidebar-default-notes: 280px; --sidebar-default-experience: 220px;`

### 规则 2 — Manuscript-top 升级为"手稿天头"，56-72px 高，承担三件事

- 文件：`src/styles/themes/kao.css`（line 440 `.theme-kao .manuscript-top`）、三页 `.vue`
- 落法：高度从 44px → 64px（桌面），三栏结构升级为五段：[back] [spine-ribbon] [archive-no | book-title | chapter-meta] [timeline-ticks] [chip | tabs | mode]。timeline-ticks 是新元素：12px 高的横向 6 段均分刻度，hover 时浮现章节序号缩略。底部加 1px `archive-olive` 分隔线而不是 `hairline-soft`。
- DOM：`<div class="manuscript-top__ticks" aria-hidden><span /><span /><span /><span /><span /><span /></div>`

### 规则 3 — 主区 + 侧栏共同组成"对开页（spread）"，不是 1+2

- 文件：三页 template
- 落法：三页 main editor 不再单独占 flex:1，而是和 sidebar 一起形成 1280-1490px 宽的 spread，spread 两侧各留 32px page margin。spread 中心是 vertical gutter（2px `archive-olive-strong` 半透明线 + 12px gold 铆钉 3 个），模仿古籍对开装订。
- CSS：`.page-spread { display:grid; grid-template-columns: 240px 12px 1fr 12px 220px; max-width: 1480px; margin: 0 auto; }`

### 规则 4 — CharacterPortrait 升 scale 为 scene，head bleed off viewport

- 文件：`src/components/folio/CharacterPortrait.vue`、三页
- 落法：在 Writing 主页加 `<CharacterPortrait pose-id="writing-sidekick" size="scene" :decorated="true" class="scene-anchor" />` 绝对定位 `left:6%; bottom:-12%; height:118vh; opacity:0.94`，作为常驻背景层（z-axis 第二层）；main editor 用 `position:relative; z-index:var(--z-stage-hero)` 浮在立绘之上。立绘不再是 thumb 而是 full-body。
- DOM：`<aside class="scene-anchor" aria-hidden><CharacterPortrait /></aside>` 放在 `.content-area` 第一子元素。

### 规则 5 — 背景必须承担"房间感"，从 gradient stack 升级为 scene

- 文件：`src/styles/themes/kao.css`
- 落法：每页 `background` 不再用 `var(--archive-paper-soft)` 平铺，改用 `.theme-kao .page-` 修饰类 + 4 层：`background-color: var(--archive-paper-soft)` + `background-image: url('/assets/scene-paper-texture.png')` (multiply 36%) + `background: radial-gradient(...)` (warm light bloom) + `background: linear-gradient(180deg, ...)` (纸张底色变化)。
- 文件：新增 `src/assets/scene-paper-texture.png`（如不存在则用 SVG feTurbulence 即时生成 base64 编码内联）。

### 规则 6 — 主 CTA 必须是非矩形 clip-path + 三层 scale 阶梯

- 文件：三页 template + kao.css
- 落法：Writing 主 CTA "新建书籍"、Notes 主 CTA "新建素材"、Experience 主 CTA "发送行动" 全部用 `clip-path: polygon(0 6%, 4% 0, 96% 2%, 100% 8%, 98% 94%, 92% 100%, 4% 96%, 0 90%)`（material-entry-card 已有），高度 36px / 44px / 52px 三档；hover scale 1.04 / 1.0 / 0.96 三档，分别给主 / 副 / disabled。
- CSS：`.cta { clip-path: var(--clip-folio-card); transition: transform .18s ease, box-shadow .18s ease; }`

### 规则 7 — Empty state 必须是"档案盒开箱"，不能再是居中 placeholder

- 文件：三页 empty state DOM
- 落法：三页 empty state 改为 280×240px 的"开箱图"——SVG 画一个档案盒（矩形 + 掀开盖 12° + 内侧 paper 条），盖子上贴 `is-archive-prop--tape`，盒内右侧放 16px 短文字 "暂无 X，新建一条 / 从右侧选一条"，底部 28px "新建" outline CTA（不是红色填充，红色 CTA 太抢）。整个 empty state 不再 100vh 居中，而是 `align-self:flex-end; margin-bottom:18vh` 放在下方 1/3 处，腾出上方空间给角色立绘。

### 规则 8 — Z-axis 升为 5 层并贯穿三页

- 文件：`src/styles/main.css`（已有 `--z-stage-*` 三层）、kao.css
- 落法：扩展为 5 层：`--z-paper-back: 0`（paper texture） / `--z-prop: 5`（tape / fold / stain 装饰） / `--z-stage-decor: 10`（FolioSurface chrome 装饰） / `--z-stage-hero: 20`（main editor 内容） / `--z-stage-cta: 30`（按钮 + 浮签）。每一层都用 `position` + `z-index` 明确，禁止层间互相 override。

### 规则 9 — LXGW WenKai 必须进入 textarea / 章节标题 / 章节序号等正文区域

- 文件：三页 editor + kao.css
- 落法：`.editor-textarea.prose-textarea { font-family: var(--font-display), 'Microsoft YaHei', sans-serif; font-size: 18px; line-height: 2.0; }`（display 字体优先，中文回退 YaHei）。`.chapter-title-input { font-family: var(--font-display); font-size: 32px; letter-spacing: 0.02em; }`。罗马数字 chapter number `font-family: var(--font-display); font-size: 14px; font-feature-settings: "smcp"; letter-spacing: 0.12em;`。
- CSS：替换现有 `font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif` 三处。

### 规则 10 — 角标 badge 必须小而刺眼，8-12px 圆形 + 1px 白边

- 文件：三页多处
- 落法：所有数量徽章（material-group-count / inbox count / message badge）改为 `.badge-dot { width: 18px; height: 18px; border-radius: 999px; background: var(--archive-gold); border: 1px solid var(--archive-paper); color: var(--archive-ink); font-size: 10px; line-height: 16px; text-align: center; }`，而非当前 11px 灰色 inline count。

### 规则 11 — 顶部 hero 与底部 foot 共同形成 cinematic letterbox

- 文件：三页 template + kao.css
- 落法：每页顶部 64px manuscript-top + 底部 32px manuscript-foot。foot 内容：[page-num] [archive-meta] [system-time]，背景 `var(--archive-ink)` 88% + `color: var(--archive-paper-soft)`，字号 10px italic letter-spacing 0.12em。foot 让页面有"档案夹上下封皮"的感觉，而不是 100vh 裸 textarea。
- DOM：每页 template 末尾加 `<footer class="manuscript-foot">...</footer>`，CSS 用 `position:sticky; bottom:0`。

### 规则 12 — 页面之间必须共享物件 token，不共享布局 token

- 文件：kao.css + 三页
- 落法：三页的布局（grid columns / sidebar width / top height）各不同；但所有页面共用以下视觉 token：`--archive-paper`、`--archive-paper-soft`、`--archive-paper-strong`、`--archive-ink`、`--archive-olive`、`--archive-gold`、`--archive-rose`、`--clip-folio-card`、`--shadow-folio`（新建，统一为 `6px 6px 0 color-mix(in srgb, var(--archive-ink) 88%, transparent)`，替代三页散落的 box-shadow）、`--font-display`。所有 hover/active transition 用统一 `--transition-folio: 180ms ease-out`。
- 新增 token 清单在 kao.css `:root` 顶部一次性声明。

---

## 5. Writing / Notes / Experience 三页各自的 2 个强方向

### 5.1 Writing（手稿工作台）

**方向 W-A：Manuscript Spread — 稿纸天头 + 角色立绘 + 章节扉页**

- 页面角色：从 Notion-like textarea 升级为"打开一本稿纸"。
- 关键改动：
  1. sidebar 升级为"作品架"（240px），左侧 4px gold ribbon 常驻；book-item 用 mini folio card（clipped polygon + paper-soft bg），不是当前 6px padding inline item；chapter-list 用 BookmarkButton 但加 `variant="manuscript"` 新尺寸——左侧 18px 罗马数字 + 中间 14px LXGW WenKai 标题 + 右侧 10px italic 字数，三层字重阶梯。
  2. main editor 升级为"稿纸面"——背景叠加 SVG 横线纸纹（baseline grid 28px line-height 2.0，1px `archive-ink-soft` 8% opacity 横线 + 24px 间隔），左上角放 "Chapter I · 2,341 字" 罗马数字 chapter ribbon（绝对定位 `top:24px; left:24px`）；textarea 用 `background:transparent`，让稿纸横线直接穿透。
  3. CharacterPortrait writing-sidekick 升 scale 为 scene（height:118vh, position absolute left:6% bottom:-12%），立绘背后加 warm light bloom（radial-gradient gold-soft）。
  4. manuscript-top 升至 64px，五段结构（back / spine / archive-no+title+chapter / ticks / chip+tabs+mode），新增 timeline-ticks 12px 6 段均分。
  5. manuscript-foot 新增 32px 高度，背景 archive-ink 88%，内容 "01/12 页 · 上次保存 5 月 12 日 14:32 · 共 12 章"。

**方向 W-B：Sidekick Companion — 批注侧记气泡 + 写作伴侣**

- 页面角色：写作过程中 sidekick 角色实时陪伴。
- 关键改动：
  1. 在 right rail（不再是 floating image-gen rail）放"批注侧记"列表——5 个 sidekick thumb 头像垂直排列，每个 56px，hover 展开为 240×88px 卡片（角色名 + 14px italic 短句 + 1 个 ghost-text 片段预览）。默认 active 第 2 个（当前正在写的章节关联）。
  2. main editor 右下角放"侧记气泡"——72×88px 圆角左下 4px 卡片，背景 `archive-paper-strong`，border 1px gold，内含 13px italic 短句（"已经写了 800 字，要不要停下来给主角一个小动作？"），每 90 秒轮换一句（共 8 句池），点击气泡展开为右侧 320px 抽屉显示完整侧记（来自 useAdvisor 的轻量建议）。
  3. copilot 状态从底部 floating pill 改为"稿纸浮签"——绝对定位在 textarea 右上角，clip-path 不规则四边形，16px italic + 2px gold ring；接受/拒绝按钮变 BookmarkButton variant="compact"，尺寸 24×24px。
  4. asset-inbox modal 升级为"卷宗夹"——左侧 4 列 spine 索引（按 type 分卷），中间 3 列预览缩略图，右侧 1 列详情。modal 顶部 56px 加 3 段 timeline ticks（已处理 / 处理中 / 待处理三色）。
  5. AI panel 从 floating 浮窗改为"页脚抽屉"——manuscript-foot 右侧 24px 抽屉按钮，点击上滑 280px 抽屉（半透明 paper bg），内含扩展 / 改写 / 取名三个 tab。

### 5.2 Notes（档案柜工作台）

**方向 N-A：Archive Cabinet — 七卷档案 + 罗马数字索引 + 抽屉把手**

- 页面角色：从"侧栏列表"升级为"打开一个档案柜"。
- 关键改动：
  1. sidebar 升级为"档案柜"（280px）——7 个 material-group header 各占 56px 高，每组 header 用 `<div class="archive-drawer-handle">`：左侧 6px 彩色 ribbon（按 kind 着色：reference-image=rose, storyboard-seed=olive, draft-prose=gold, event=rose-strong, character-fact=amber, worldbook-draft=olive-strong, inspiration=gold-soft）+ 中间 14px LXGW WenKai 组名 + 右侧 18px 圆形 badge 显示 count + 最右侧 ▼ toggle。整组 list 展开时 list 容器有 "抽屉滑出" 动效——translateY(-8px) → 0 + opacity 0 → 1，200ms ease-out。
  2. 每个 material-group-list 内的 book-item 升级为 "档案卡"——clip-path folio card（已实现）+ 左侧 12px spine（kind 颜色）+ 中间标题 + 右下角 9px italic 字数。hover 时整卡 translateX(2px) + box-shadow 加深 24%。
  3. main editor 升级为"档案展示台"——顶部 88px 高 archive strip collage（3x3 网格而非 3x1 行），中间 selected item 居中大图（180×180）+ 左右各 2 张同 kind 缩略图，下方 4 张相邻 kind 缩略图；strip 总高 240px。
  4. asset-control 工具栏升级为"装订工具"——左侧 4px ribbon + 中间 7 个 kind 切换 tab（每个 56×28px）+ 右侧两个 CTA（导当前 / 生成专业信息）。工具栏整体 clip-path: polygon(0 8px, 12px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 12px) 100%, 0 100%)，像裁过的标签条。
  5. CharacterPortrait narrator 升级为场景——不再是 sidebar header 60px thumb，而是 main editor 左上角 scene 头像（height: 108vh, position absolute left:2% bottom:-8%），narrator 是站在档案柜后面的剪影。sidebar header 内 narrator 缩略图改为 32px 圆形 icon-only "档案员在线" 状态点。

**方向 N-B：Material Kind Mosaic — 七种 kind 网格 mosaic + 装订孔**

- 页面角色：从"分组列表"升级为"档案 mosaic"。
- 关键改动：
  1. sidebar 不再分组展开，而是 7 个 kind 各占一"卷"竖向卷筒（每个 24px 宽，高度等于 group 内 item 数 × 56px），item 不是 list 而是"贴在卷筒上的纸片"——`position:absolute` 配合 `writing-mode: vertical-rl` 旋转 90° 显示 title + count。鼠标悬停卷筒向左滑出整列 item 缩略图。
  2. main editor 升级为 mosaic canvas——1240×720 区域分为 7×N 网格（按 kind 自动分块），每个素材是 80×80 卡片 + kind 色 spine + 8px 字数 tag。当前选中卡片放大到 240×240 居中，下方 24px 高 "档案卡号 No.003" 编号条。
  3. 装订孔——mosaic canvas 左侧 8px 处有 8 个 12×12px 圆形装订孔（`var(--archive-ink-soft)`），孔中心 1px `var(--archive-paper)`，间距 64px，从顶到底贯穿。
  4. material-selection-stamp 升级为"卷宗印章"——左右两段 12px gold 横线 + 中间 18px gold 圆形印章（"已选 03 项"），印章背景 paper-strong，字用 display 字体 11px 黄色。
  5. 把 ImageGenRail 从 floating 改为"右侧抽屉"——点击右上角图标按钮，drawer 从右滑入 320px 宽，drawer 顶部 56px 是 "素材生图" + 当前 kind 色 spine。drawer 内容是 4 个 prompt 模板 + 已生成图缩略。

### 5.3 Experience（剧场工作台）

**方向 E-A：Stage Backdrop — 角色立绘全屏 + 场景卡 + 对话气泡**

- 页面角色：从"主区空白 + 输入条"升级为"剧场幕布 + 演员 + 台词"。
- 关键改动：
  1. main shell 升级为"剧场"——`.game-main-shell` 不再是 cream rectangle + clip-path 多边形，而是 `background: linear-gradient(180deg, transparent 0 18%, var(--archive-paper) 18% 100%)` —— 上 18% 是透出 CharacterBackdrop 立绘（head bleed off top + 立绘肩部以下），下 82% 是 cream 稿纸。装订铆钉从 6px ink shadow 升级为 6px gold shadow（`box-shadow: 6px 6px 0 var(--archive-gold)`）。
  2. main shell 内中央放"场景卡"——720×160px 卡片，clip-path polygon（角切），左侧 120px 是 CharacterPortrait 当前 speaker 立绘 thumb（size="card"），中间 360px 是场景描述（13px LXGW WenKai，2 行 ellipsis），右侧 200px 是 3 个进度数值（HP / Sanity / Gold 16px + bar 4px）。卡片 top:64px left:50% translateX(-50%) 浮在幕布上方。
  3. 主对话轴放在场景卡下方——垂直 timeline 布局，每条消息是一张"信纸"卡片（`var(--archive-paper-soft)` bg + 1px gold border），NPC 消息 left:8% width:60%，User 消息 right:8% width:60%，卡片间 16px gap。每张卡片左侧 36px 圆形 thumb + 右侧 14px message + 10px meta（"14:32 · 章 III"）。
  4. 输入条升级为"演员提示板"——底部 88px 高，背景 `var(--archive-ink)` 88% + 字 `var(--archive-paper-soft)`，左侧 5 个 mode chip（继续/场景/对话/心理/对话模式），中间 input 36px 高 + italic placeholder "轮到你表演这一步...", 右侧 52px 圆形金色 "登场" 主 CTA（clip-path 不规则）。
  5. 右侧 sidebar 升级为"情报台"——保留 252px 宽度但内容重排：顶部 56px 是当前 worldbook 名（display 字体 18px italic），下方 4 个 section 是"在场角色 / 当前场景 / 任务日志 / 背包"，每个 section 是 36px 高 tab + 展开内容 tab，section 之间用 1px gold 横线分隔（不再是 hairline）。

**方向 E-B：Script Stage — 剧本场幕 + 导演标记 + 演员簇**

- 页面角色：从"对话主区"升级为"剧本场幕工作台"。
- 关键改动：
  1. main shell 升级为"剧本"——左侧 200px 是场幕 navigator（vertical timeline，10 场幕用 BookmarkButton variant="manuscript" 排列，每场幕 56px 高 + 罗马数字 + 标题 + 时间码）；中间是当前场幕内容（NPC bubble + 用户 bubble + scene description 交错）；右侧 240px 是"导演注释"面板（场景卡 + 道具清单 + 节奏指示）。
  2. 当前 NPC bubble 升级为"角色台词"——clip-path polygon 平行四边形（左侧 24px 倾斜切角），左侧 48px CharacterPortrait 当前说话角色 thumb，bubble 背景按 kind 色（rose for NPC, gold for system, olive for narrator），每条 bubble 右上角 10px italic meta "Chapter II · Scene 3"。
  3. User bubble 升级为"行动卡片"——clip-path polygon 右侧 24px 倾斜切角，背景 archive-paper-strong，border 1px gold，bubble 内部 14px 行动文本 + 下方 4 个 quick action chip（"继续 / 收线 / 旁观 / 加速"）。
  4. 输入条升级为"导演标记输入"——64px 高，左侧 6 个导演标记 chip（🎬 = 切场 / ⏸ = 暂停 / ▶ = 推进 / 🎭 = 角色 / 💬 = 台词 / 🌐 = 环境），中间 textarea 36px 高 italic placeholder "导演：本场如何推进？"，右侧 56px 圆形 "开拍" 主 CTA。
  5. GmPersonaLauncher 从右下浮动改为"剧本场记"——绝对定位 main shell 右下角 56px 直径圆形金章，hover 展开 320×160px 卡片（kicker 14px + 标题 16px display + 描述 13px + CTA 36px），展开时 clip-path 不规则四边形 + warm light bloom。

---

## 6. 下一轮 worker 切片建议

每个 worker 切片严格遵循 workflow.md：单区域、有 direct/screenshot 对照、文件范围小、可截图验收。

### 切片 1 — Manuscript-top 升级（W4 已部分实现，需补完）

- 文件范围：`src/styles/themes/kao.css`（line 440-583 `.manuscript-top` 块）、`src/pages/Writing.vue`（line 3-45）、`src/pages/Notes.vue`（line 3-41）
- 禁止触碰：`src/pages/Experience.vue`、`src/components/folio/*`、`src/components/gm-persona/*`、`src/styles/main.css`
- 截图验收：
  1. 桌面 1280 高度下 manuscript-top 必须 ≥ 60px
  2. timeline-ticks 6 段均分可见，hover 时浮现章节序号
  3. back / spine / archive-no / ticks / chip+tabs+mode 五段在视觉上有三层字号差（28 / 14 / 12）
  4. gold bottom border 而非 hairline-soft
  5. LXGW WenKai 字体必须出现在 book-select 和 chapter meta 两处

### 切片 2 — Sidebar Spine Ribbon（W4 W-A 关键件）

- 文件范围：`src/styles/themes/kao.css`（新增 `.sidebar-spine-ribbon` 块）、三页 template（加 `<div class="sidebar-spine-ribbon">`）
- 禁止触碰：sidebar 内部 list、main editor、top strip、footer
- 截图验收：
  1. 三页 sidebar 左侧 4px ribbon 颜色不同（Writing gold / Notes olive / Experience rose）
  2. collapsed 状态 ribbon 仍可见（width 8px spine-only）
  3. selected book/material/role 时 ribbon 颜色饱和度 +20%
  4. ribbon 与 sidebar header 之间有 2px gap（视觉呼吸）

### 切片 3 — CharacterPortrait scene scale（N5C W-A / E-A 关键件）

- 文件范围：`src/components/folio/CharacterPortrait.vue`（新增 `size="scene"` variant）、`src/pages/Writing.vue`（加 scene anchor aside）、`src/pages/Notes.vue`（移除 sidebar thumb 改为 main scene）
- 禁止触碰：existing thumb size usage、FolioSurface、BookmarkButton
- 截图验收：
  1. Writing 主页加载时 sidekick 立绘可见在 main 左下角，head bleed off top
  2. Notes 主页 narrator 立绘在 main 左上角
  3. 立绘 opacity 0.94，z-index 在 stage-hero 之下
  4. 立绘背后有 warm light bloom radial-gradient

### 切片 4 — Manuscript-foot letterbox（W4 W-A 关键件）

- 文件范围：`src/styles/themes/kao.css`（新增 `.manuscript-foot` 块）、三页 template（末尾加 footer）
- 禁止触碰：existing main editor、top strip、sidebar
- 截图验收：
  1. 每页底部 32px foot，背景 archive-ink 88%，字 archive-paper-soft
  2. foot 内容含 page-num / archive-meta / system-time 三段
  3. foot 在 1280 viewport 下与 manuscript-top 视觉对齐（左右 24px margin 一致）
  4. textarea / editor 内容滚动时 foot sticky bottom 不动

### 切片 5 — Empty state 档案盒开箱（替换三页居中 placeholder）

- 文件范围：三页 empty-state DOM（Writing.vue line 132-152、Notes.vue line 144-153、Experience.vue 待定）
- 禁止触碰：empty state 以外任何 DOM、css 选择器
- 截图验收：
  1. empty state 不再 100vh 居中，而是 align-self:flex-end margin-bottom:18vh
  2. 280×240px 开箱图 SVG + 16px 文字 + 28px outline CTA 三件套
  3. 开箱图包含 tape prop + 掀开盖 + 内侧 paper 条
  4. CTA 是 archive-paper bg + 1px gold border + archive-ink text，不是红色填充

### 切片 6 — FolioSurface 新增 variant（scroll / parchment / index）

- 文件范围：`src/components/folio/FolioSurface.vue`
- 禁止触碰：FolioSurface props API（仅新增 variant）、kao.css 选择器
- 截图验收：
  1. variant="scroll" 必须用卷轴 clip-path（polygon 带上下半圆切角）
  2. variant="parchment" 必须用羊皮纸背景 + 4px gold border + 磨损边角
  3. variant="index" 必须用目录卡片布局（左侧 spine + 右侧 3 行 meta）
  4. 三种 variant 在 modal 关闭时仍保留 prop 装饰，不消失

### 切片 7 — Material-group drawer handle（N-A 关键件）

- 文件范围：`src/pages/Notes.vue`（line 93-134 material-group DOM + scoped CSS）
- 禁止触碰：main editor、top strip、sidebar 宽度
- 截图验收：
  1. material-group header 56px 高，左侧 6px spine ribbon
  2. 折叠时整组 list translateY(-8px) opacity 0 → 1，200ms ease-out
  3. count badge 改为 18px 圆形 gold bg + 1px paper border + 10px ink text
  4. 7 个 kind 的 spine 颜色按现有 token：reference-image=rose, storyboard-seed=olive, draft-prose=gold, event=rose-strong, character-fact=amber, worldbook-draft=olive-strong, inspiration=gold-soft

### 切片 8 — Scene card for Experience（E-A 关键件）

- 文件范围：`src/pages/Experience.vue`（在 `.game-main-shell` 内、`.game-main` 前插入 scene card）、`src/styles/themes/kao.css`（新增 `.scene-card` 块）
- 禁止触碰：sidebar、CharacterBackdrop、InputArea、GamePanel
- 截图验收：
  1. scene card 720×160px，clip-path polygon（角切），top:64px 浮在幕布上方
  2. 左侧 120px CharacterPortrait size="card" thumb + 中间 360px 13px LXGW WenKai 2 行 ellipsis + 右侧 200px 3 个进度数值
  3. card z-index 在 stage-decor 之上、stage-hero 之下
  4. main shell 上 18% 透出 CharacterBackdrop，下 82% 是 archive-paper

---

## 7. Anti-goals（10 条禁止的"伪改动"）

1. **不要调字号 / 行高 / padding 边缘值然后说"已经重构"**。如果改动只命中 `font-size`、`line-height`、`padding`、`margin` 四类属性且没有改 layout / 物件 / 角色，这是伪改动。
2. **不要换 CSS variable 名字**。`--archive-paper` 改名为 `--paper-cream` 不产生任何视觉效果，纯属浪费 review。
3. **不要给按钮加 hover scale(1.02)**。这是装饰细节，不是方向。Reverse:1999 的按钮有 1.06/0.96/0.88 的三档视觉差，Pinax 应该照搬，但只在主 CTA 路径上。
4. **不要重新生成 archive-paper 颜色 token**。`#f5ebdd` 是经过审美的，调整 1-2 个色号就破坏色相平衡。
5. **不要把 sidebar 宽度从 210 改成 220 然后叫它重构**。侧栏宽度必须配合 spine ribbon + page spread 一起改。
6. **不要给 main shell 加 backdrop-filter:blur(8px)**。这是 SaaS 风味的玻璃拟物，违背 archive-folio 方向。
7. **不要把 LXGW WenKai 字体限定在 sidebar header 或 manuscript-top**。display 字体必须进 textarea / chapter title / 章节序号，否则手写感只是皮肤。
8. **不要增加 box-shadow 的 spread / blur 让它"更立体"**。archive-folio 方向是 hard offset shadow（`6px 6px 0 var(--archive-ink)`），不是 soft blur shadow。增加 blur 是反向。
9. **不要把侧栏的 group-list 从 v-for 改成 `<TransitionGroup>` 然后说"有动画了"**。v-for 不等于无层级，层级是 group 之间的视觉差，不是 enter/leave transition。
10. **不要给三页都用同一个 layout（240px sidebar + flex main + 240px right rail）然后调三个 width**。三页布局必须结构上不同：Writing 是"对开 spread + 角色立绘 + 稿纸横线"；Notes 是"七卷档案柜 + mosaic canvas"；Experience 是"场幕 + 演员簇 + 剧本 timeline"。如果三页 grid columns 一致，就是伪改动。

---

## 8. SELF-REVIEW（5 条最可能错的事 + 验证方法）

### 8.1 我可能把 CharacterPortrait scene scale 推到 100% height，让立绘遮挡主内容

- 风险：scene scale 立绘如果 height:100% + position:absolute，会遮挡 textarea 等可交互区域。
- 验证：每个 slice 实现后用 Playwright 截图 + 触发 textarea focus + 模拟键盘输入，确认 textarea 仍可获得焦点且不被立绘遮挡；立绘必须在 z-index:stage-hero 之下，且 pointer-events:none。
- 落法：CSS `.scene-anchor { pointer-events: none; z-index: var(--z-prop); }` + 立绘定位 `left: -8%`(超出左边界)，让立绘只占视觉左侧 30-40%，不进入主编辑区。

### 8.2 我可能给 manuscript-foot 加错 z-index，让它覆盖 sticky bottom 的输入条

- 风险：Experience 输入条是 position:fixed bottom:calc(92px + env(safe-area-inset-bottom))，如果 manuscript-foot 也 fixed bottom 会撞上。
- 验证：slice 4 实现后 Playwright 模拟滚动 + 截图，确认 footer 与 InputArea 之间有 8-12px gap；footer z-index 必须是 stage-decor 而非 stage-cta。
- 落法：`manuscript-foot` 不写 fixed，只写 `position:sticky; bottom:0; z-index:var(--z-stage-decor)`；体验页的 fixed 输入条 z-index 用更高 `--z-fixed-bottom: 40`。

### 8.3 我可能让 LXGW WenKai 字体出现在不该出现的位置（如字数统计 chip）

- 风险：display 字体在 monospace UI（字数统计、time meta）会出现字距 bug，且与 sans-serif 视觉冲突。
- 验证：playwright 截图所有 sans-serif 关键区域（chip / meta / badge / tab），确认全部仍是 `var(--font-sans)`；LXGW WenKai 只在 manuscript-top select / chapter title / chapter roman / textarea prose / footer page-num / archive-group-title。
- 落法：在 kao.css 顶部加显式注释："LXGW WenKai 仅用于 [列表]，禁止用于 [反列表]"。

### 8.4 我可能误判 experience-baseline-1280.png 里的"中央空白"是 bug 而不是设计意图

- 风险：用户可能希望 Experience 中央就是空白（让用户聚焦当前对话），而非"必须有 scene card"。
- 验证：再次对照用户原始反馈"都是微调，效果不够好"。如果用户没有明确提到 Experience 中央空白，说明这是被默认接受的；但用户说"效果不够好"暗含"视觉不够浓"。scene card 是用户没明确否决的方向。
- 落法：方向 E-A 必须是可逆的——如果用户对 scene card 不满意，可以把 scene card 的 720×160 区域缩到 480×80 退化为 minimal 版本，或者干脆删掉只保留 CharacterBackdrop 立绘背景。

### 8.5 我可能错误推断三页共用 210px sidebar 是有意的（"三页一致"），但实际上 210px 锁死了三种页面的差异

- 风险：把 210px 改差异化（240 / 280 / 220）可能破坏笔记页 material-group 的展开空间，让 280px sidebar 在 1280 viewport 下 main editor 只剩 600px。
- 验证：1280 viewport 下三页 main editor 必须保留 ≥ 600px 可用宽度；如果 280 + 220 + spacing 超过 1280 的 30%，需要把主区 main 从 right rail 浮起改为下方栈式（mobile-friendly）。
- 落法：三页默认 sidebar 宽度差异化（240/280/220），但每页支持用户拖拽缩窄到 180px；1280 以下 viewport 自动栈式布局；保证 main editor ≥ 600px。

---

## 附录 A：本报告未做的事（明确声明）

- **没有写任何 CSS / Vue 代码**。报告只到方向与硬约束，不含 implementation。
- **没有保存报告到文件**。按 worker 指令只在最终回答中输出。
- **没有视觉读取图片的色彩直方图 / 像素级细节**。截图读取靠 PNG 解码后渲染的文本（标题、按钮、状态条）和代码语义。所有涉及具体像素 / 色号的视觉判断标为 [推断] 或 [观察]。
- **没有与用户 / Codex 交互**。这是 single-shot worker 输出，所有"用户反馈"都是基于上一轮"都是微调，效果不够好"的二手语境推导。

## 附录 B：worker 切片优先级建议（按 ROI）

1. **切片 6 FolioSurface 新 variant**（地基，所有方向都依赖）
2. **切片 2 Sidebar spine ribbon**（三页共用、视觉最大）
3. **切片 3 CharacterPortrait scene scale**（立绘从 thumb 升 scene 是用户最痛的点）
4. **切片 5 Empty state 档案盒开箱**（三页全换，最快出效果）
5. **切片 4 Manuscript-foot letterbox**（建立 cinematic frame）
6. **切片 1 Manuscript-top 升级**（W4 已部分实现，补完即可）
7. **切片 7 Material-group drawer handle**（N-A 关键件）
8. **切片 8 Scene card for Experience**（E-A 关键件）

建议每个切片独立 worker 切片 + 独立 playwright 截图验收 + 用户评分 1-5。