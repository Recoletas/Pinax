你是 Claude Code Worker UI-R0。你是 Pinax 项目的视觉研究负责人，不是实现者。

目标：疯狂消耗 token 做充分调研，把 Pinax 当前 `/writing` `/notes` `/experience` 的视觉失败归因、参考拆解、跨页设计原则写成一份高质量研究报告。不要改代码。

Repo: `/home/recoletas/jiuguan/text-game-framework`

必须阅读：
- `docs/engineering/visual-alignment-workflow.md`
- `docs/engineering/agent-orchestration-workflow.md`
- `docs/agent-runs/current.md`
- `src/pages/Writing.vue`
- `src/pages/Notes.vue`
- `src/pages/Experience.vue`
- `src/styles/themes/kao.css`
- 当前截图：
  - `docs/agent-runs/2026-06-19-ui-redesign-research/writing-baseline-1280.png`
  - `docs/agent-runs/2026-06-19-ui-redesign-research/notes-baseline-1280.png`
  - `docs/agent-runs/2026-06-19-ui-redesign-research/experience-baseline-1280.png`
- 参考/灵感入口：
  - Reverse: 1999 home/main menu UI references
  - Arknights home screen / UI display references
  - `docs/demo/pinax-welcome-ak-20260612_001.jpg`
  - `docs/demo/pinax-welcome-p5r-20260612_001.jpg`
  - `docs/demo/n5c-material-page-merged-20260618_001.png`
  - `docs/demo/writing-v2-top-20260619_001.png`
  - `docs/demo/exp-v2-archive-binder-20260619_001.png`

Web/reference clues from Codex live search:
- Arknights home screen UI is documented at `https://arknights.wiki.gg/wiki/Home_Screen/UI`
- Arknights home screen overview: `https://arknights.wiki.gg/wiki/Home_Screen`
- Reverse 1999 home/login/main screen discussion/references exist across Reddit/YouTube/wiki; focus on composition lessons, not exact copying.

硬约束：
- 不许实现，不许改任何代码。
- 不许写“高级一点”“更精致”这种空话，必须翻译成可执行硬约束。
- 必须指出上一轮为什么只是微调：从 composition、hierarchy、surface ownership、asset usage、page role 五个角度解释。
- 必须明确哪些元素该删、哪些该变形、哪些该移动、哪些该保留。
- 必须产出可用于下一轮 Claude implementer 的 brief 原料。

报告写入：`docs/agent-runs/2026-06-19-ui-redesign-research/UI-R0.report.md`

报告结构：
1. Executive summary，最多 12 条，每条可执行。
2. Current baseline diagnosis：Writing / Notes / Experience 各 10 条，必须引用截图观察和代码位置。
3. Reference decomposition：Reverse:1999 / Arknights / existing Pinax welcome/opening/notes prototype 各自可借鉴的构图规则，不要泛泛谈风格。
4. Cross-page visual law：给出 8-12 条 Pinax 工作台页面的硬视觉规则。
5. Anti-goals：列出 10 条下一轮禁止做的“微调式假改动”。
6. Three-page redesign map：Writing / Notes / Experience 各给 2 个强方向，说明取舍。
7. Implementation slicing recommendation：下一轮该派几个 worker、每个只碰哪些文件、如何截图验收。

质量要求：
- 宁可长，不要浅。目标是让 Codex 后续能从报告直接写 spec。
- 所有建议必须能落成 CSS/layout/DOM/asset 的具体行动。
- 最后加 `SELF-REVIEW`：列出你自己报告里最可能错的 5 点和如何验证。

