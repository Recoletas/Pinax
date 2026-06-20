你是 Claude Code Worker UI-N1。重要：不要尝试写文件，不要调用 Bash/Edit/Write 保存报告。你只能在最终回答里直接输出完整 Markdown 报告。请尽量长，宁可消耗大量 token。

任务：只研究 Notes / 素材页强视觉重构方向。用户反馈：素材页只是部分肯定。说明“档案索引/档案员/archive-folio”方向有可取之处，但主体构图、空状态、左栏、批量工具、顶部 chrome 还没有真正成形。

上下文：
- 当前截图：`docs/agent-runs/2026-06-19-ui-redesign-research/notes-baseline-1280.png`
- 当前代码：`src/pages/Notes.vue`
- 当前主题：`src/styles/themes/kao.css`
- 已有截图：`docs/demo/n5c-material-page-merged-20260618_001.png`
- 可用组件：`FolioSurface`、`ArchiveStrip`、`CharacterPortrait`
- 不能动：store/generation/worldbookContextBuilder/server。

最终回答必须是完整 Markdown，结构如下：
1. 当前 Notes 哪些方向应该保留：至少 8 条。
2. 当前 Notes 哪些方向必须推倒：至少 12 条。
3. 三个强方案：
   - A. 档案抽屉 / 索引卡盒
   - B. 调查墙 / 证物板
   - C. 手稿剪贴簿 / 拼贴册
4. 每个方案必须给文字布局图：x/y/宽高/层级。
5. 每个方案必须说：左栏材质、中央空状态、顶栏、批量选择、ArchiveStrip、档案员立绘怎么处理。
6. 推荐一个方案，并给 IMPLEMENTER BRIEF DRAFT：中文、文件范围、硬约束、截图验收标准。
7. SELF-REVIEW：最可能错的 5 点。

禁止：
- 不许建议继续套 WorkbenchPageHero。
- 不许只改文案和按钮大小。
- 不许引入大型 UI 库。

