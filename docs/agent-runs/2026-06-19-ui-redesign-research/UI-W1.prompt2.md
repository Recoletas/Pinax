你是 Claude Code Worker UI-W1。重要：不要尝试写文件，不要调用 Bash/Edit/Write 保存报告。你只能在最终回答里直接输出完整 Markdown 报告。请尽量长，宁可消耗大量 token。

任务：只研究 Writing 页面强视觉重构方向。用户反馈：“写作页感觉没什么变化”。当前页面不是坏在一两个 CSS，而是第一眼仍像普通工具页，左栏和空状态没有“写作桌/手稿现场”的物件感。

上下文：
- 当前截图：`docs/agent-runs/2026-06-19-ui-redesign-research/writing-baseline-1280.png`
- 当前代码：`src/pages/Writing.vue`
- 当前主题：`src/styles/themes/kao.css`
- 可用组件：`FolioSurface`、`CharacterPortrait`、`ArchiveStrip`、`BookmarkButton`
- 不能动：store/generation/worldbookContextBuilder/server。
- 不要做营销 hero；这是高频写作工作台。

最终回答必须是完整 Markdown，结构如下：
1. 当前 Writing 失败诊断：至少 15 条，按顶部、左栏、正文空状态、角色立绘、CTA、空间、材质分组。
2. 三个强方案：
   - A. 手稿桌面：编辑纸张是主物件。
   - B. 编辑室/资料墙：左栏书籍和立绘变成环境道具。
   - C. 极简专业：接近 Scrivener/Ulysses，但保留 Pinax archive 语言。
3. 每个方案必须给文字布局图：用 x/y/宽高/层级描述首屏。
4. 每个方案必须说：顶栏怎么融入、左栏怎么变形、空状态怎么变成真实入口、角色立绘如何不再像贴图、哪些旧元素删掉。
5. 推荐一个方案，并给 IMPLEMENTER BRIEF DRAFT：中文、文件范围、硬约束、截图验收标准。
6. SELF-REVIEW：最可能错的 5 点。

禁止：
- 不许建议继续保留现在这种 44px toolbar 作为主视觉。
- 不许只说“加纹理/更精致/更高级”。
- 不许建议大改数据结构。

