你是 Claude Code Worker UI-R0。重要：不要尝试写文件，不要调用 Bash/Edit/Write 保存报告。你只能在最终回答里直接输出完整 Markdown 报告。请尽量长，宁可消耗大量 token。

任务：做 Pinax `/writing` `/notes` `/experience` 跨页强视觉重构研究。当前上一轮被用户评价为“都是微调，效果不够好”，所以你必须从构图和页面角色层面重做方向，而不是边框、字号、按钮的微调。

你必须基于这些上下文推理：
- 当前三页截图：
  - `docs/agent-runs/2026-06-19-ui-redesign-research/writing-baseline-1280.png`
  - `docs/agent-runs/2026-06-19-ui-redesign-research/notes-baseline-1280.png`
  - `docs/agent-runs/2026-06-19-ui-redesign-research/experience-baseline-1280.png`
- 当前页面代码：`src/pages/Writing.vue`、`src/pages/Notes.vue`、`src/pages/Experience.vue`、`src/styles/themes/kao.css`
- 已有工作流：`docs/engineering/visual-alignment-workflow.md`
- 已有方向：archive/folio、paper/olive/gold、真实立绘、不要 SaaS hero copy。
- 参考：Reverse:1999 主菜单的叙事层次；Arknights home screen 的边缘功能集群和可扫视信息组织；Pinax welcome/opening demo 图。

最终回答必须是完整 Markdown，结构如下：
1. Executive summary：12 条强结论。
2. 为什么上一轮只是微调：composition / hierarchy / page role / asset usage / surface ownership 各 6 条。
3. 参考拆解：Reverse:1999、Arknights、Pinax welcome/opening/notes prototype 各 8 条可执行规则。
4. Cross-page visual law：Pinax 工作台页面 12 条硬视觉规则，每条必须能落成 CSS/layout/DOM。
5. Writing / Notes / Experience 三页各自的 2 个强方向。
6. 下一轮 worker 切片建议：每个切片的文件范围、禁止触碰范围、截图验收标准。
7. Anti-goals：10 条禁止的“伪改动”。
8. SELF-REVIEW：你最可能错的 5 点和验证方法。

不要说“我不能访问图片”。如果不能视觉读取图片，就基于文件名、用户反馈和代码语义进行明确推断，但必须标注“推断”。不要泛泛说高级/精致，必须说位置、比例、层级、物件、删改对象。

