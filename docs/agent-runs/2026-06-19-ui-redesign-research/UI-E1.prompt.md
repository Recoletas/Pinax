你是 Claude Code Worker UI-E1。你只负责 Experience / 体验页强视觉方向研究，不实现。

背景：上一轮 Experience 右栏卷宗方向局部可用，但页面仍有大面积空白、右栏内部 dashboard 残留、输入区普通聊天工具感，且曾经因为 CSS scope 导致页面加载回归。用户现在要求不是微调，而是出效果。

Repo: `/home/recoletas/jiuguan/text-game-framework`

必须阅读：
- `docs/agent-runs/current.md`
- `docs/engineering/visual-alignment-workflow.md`
- `src/pages/Experience.vue`
- `src/components/GamePanel.vue`
- `src/components/InputArea.vue`
- `src/components/StatusBar.vue`
- `src/components/geography/GeographyPanel.vue`
- `src/components/QuestLog.vue`
- `src/styles/themes/kao.css`
- `docs/agent-runs/2026-06-19-ui-redesign-research/experience-baseline-1280.png`
- `docs/demo/exp-v2-archive-binder-20260619_001.png`
- `docs/demo/pass2-screenshots/experience-1280.png`

视觉目标：
- 体验页必须像“现场记录/跑团桌面/案卷推进台”，不是聊天 SaaS。
- 不允许把 `/opening` 开场页逻辑塞回 `/experience`。
- 不允许再用容易污染全局的 CSS escape；必须给出作用域策略。

必须回答：
1. 当前 Experience 截图为什么失败：至少 12 条，按主对话区、输入区、右栏、角色/地理/QuestLog 内部、背景、空白利用分。
2. 给出 3 个强方案：
   - A. 现场记录本：主区像打开的记录页，输入区像行动签。
   - B. 调查桌面：主区、右栏和输入区像摆在桌上的案卷/便签/地点卡。
   - C. 对话舞台：对话区更像视觉小说记录，右栏降为可抽出的档案夹。
3. 每个方案必须包含：
   - 主区如何处理空白
   - 输入区如何去聊天工具感
   - 右栏内部 dashboard 残留如何分期处理
   - 需要改哪些文件
   - 不碰哪些文件
   - CSS scope 安全策略
   - 截图验收标准
4. 推荐一个方案，并写成下一轮 implementation brief。

禁止：
- 不许重引入 `/opening` entry remnants。
- 不许改 store/generation/worldbookContextBuilder。
- 不许只改右栏边框。
- 不许改代码。

输出：`docs/agent-runs/2026-06-19-ui-redesign-research/UI-E1.report.md`

最后必须有 `IMPLEMENTER BRIEF DRAFT`，中文，能直接给下一个 Claude 改 Experience。

