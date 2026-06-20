你是 Claude Code Worker UI-W1。你只负责 Writing 页面强视觉方向研究，不实现。

背景：用户明确说“写作页感觉没什么变化”。当前 Writing 去掉了大 hero，但只是变成细工具条，仍不像成熟的创作界面。你的任务是提出足够激进、可实现、能明显改变第一眼观感的方案。

Repo: `/home/recoletas/jiuguan/text-game-framework`

必须阅读：
- `docs/agent-runs/current.md`
- `docs/engineering/visual-alignment-workflow.md`
- `src/pages/Writing.vue`
- `src/styles/themes/kao.css`
- `src/components/folio/FolioSurface.vue`
- `src/components/folio/CharacterPortrait.vue`
- `docs/agent-runs/2026-06-19-ui-redesign-research/writing-baseline-1280.png`
- `docs/demo/writing-v2-top-20260619_001.png`
- `docs/demo/pinax-welcome-ak-20260612_001.jpg`
- `docs/demo/pinax-welcome-p5r-20260612_001.jpg`

视觉目标：
- 不是 toolbar 微调。必须让 Writing 第一眼从“工具页面”变成“写作桌 / 手稿编辑现场”。
- 仍然是高频工作界面，不能做营销 hero，也不能牺牲正文编辑效率。
- 可借鉴 Reverse:1999 的叙事性菜单层次、Arknights 的右侧/边缘功能集群和强视觉锚点，但不能做二游首页。

必须回答：
1. 当前 Writing 截图为什么失败：至少 12 条，按视觉层级、空间占比、左栏、编辑区空状态、顶栏、角色立绘、CTA、材质分。
2. 给出 3 个强方案：
   - A. 手稿桌面方案：编辑纸张是主物件。
   - B. 编辑室/资料墙方案：左侧书籍和角色立绘变成环境道具。
   - C. 极简专业方案：接近 Ulysses/Scrivener 但保留 Pinax archive 语言。
3. 每个方案必须包含：
   - 首屏布局草图（用文字网格描述：x/y/宽高/层级）
   - 顶栏如何消失或融入
   - 左栏如何处理
   - 空状态如何从“普通提示”变成真实写作入口
   - 角色立绘如何不再像贴图
   - 需要改哪些文件
   - 截图验收标准
4. 推荐一个方案，并写成下一轮 implementation brief。

禁止：
- 不许只说“加阴影/加纹理/更精致”。
- 不许建议继续保留现在这种一条 44px toolbar 作为主视觉。
- 不许要求大改 store 或生成链路。
- 不许改代码。

输出：`docs/agent-runs/2026-06-19-ui-redesign-research/UI-W1.report.md`

最后必须有 `IMPLEMENTER BRIEF DRAFT`，中文，能直接给下一个 Claude 改 Writing。

