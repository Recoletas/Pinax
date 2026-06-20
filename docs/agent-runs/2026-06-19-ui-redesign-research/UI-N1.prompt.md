你是 Claude Code Worker UI-N1。你只负责 Notes / 素材页强视觉方向研究，不实现。

背景：用户说素材页“只是部分肯定”，之前的档案索引、档案员、素材页方向有一部分是对的，但顶部冗余、主体构图、空状态和批量工具仍然不够强。

Repo: `/home/recoletas/jiuguan/text-game-framework`

必须阅读：
- `docs/agent-runs/current.md`
- `docs/engineering/visual-alignment-workflow.md`
- `src/pages/Notes.vue`
- `src/styles/themes/kao.css`
- `src/components/folio/ArchiveStrip.vue`
- `src/components/folio/CharacterPortrait.vue`
- `docs/agent-runs/2026-06-19-ui-redesign-research/notes-baseline-1280.png`
- `docs/demo/n5c-material-page-merged-20260618_001.png`
- `docs/demo/n5c-material-page-20260617_001.png`

视觉目标：
- 保留用户部分认可的“档案索引 / 档案员 / archive-folio”方向。
- 但必须从“左边有图 + 顶部小条 + 中间空”变成完整的资料库工作台。
- 素材页不能像 SaaS list editor，也不能像普通文件夹列表。

必须回答：
1. 哪些现有方向保留：至少 8 条，说明为什么。
2. 哪些现有方向必须推倒：至少 10 条，尤其是顶栏、空状态、左栏、按钮、素材卡、ArchiveStrip。
3. 给出 3 个强方案：
   - A. 档案抽屉 / 索引卡盒
   - B. 调查墙 / 证物板
   - C. 手稿剪贴簿 / 拼贴册
4. 每个方案必须包含：
   - 左栏材质与分组形态
   - 中央空状态如何成为可操作的物件
   - 顶部 chrome 如何低声量存在
   - 批量选择工具如何像“盖章/夹注/票据”而不是按钮行
   - 立绘和 ArchiveStrip 的真实位置
   - 需要改哪些文件
   - 截图验收标准
5. 推荐一个方案，并写成下一轮 implementation brief。

禁止：
- 不许建议继续套 WorkbenchPageHero。
- 不许只改文字和按钮大小。
- 不许引入未存在的大型 UI 库。
- 不许改代码。

输出：`docs/agent-runs/2026-06-19-ui-redesign-research/UI-N1.report.md`

最后必须有 `IMPLEMENTER BRIEF DRAFT`，中文，能直接给下一个 Claude 改 Notes。

