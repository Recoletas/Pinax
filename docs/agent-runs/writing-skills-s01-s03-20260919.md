# 助手写作 Skills S01–S03 实施回执

日期：2026-09-19。计划：[assistant-writing-skills-20260919](../plan/assistant-writing-skills-20260919.md)。
分支 `night/writing-skills-20260919`（worktree `pinax-writing-skills-20260919`，基 main@5e85379）。
本批交付 §7 队列的 S01、S02、S03 三个实施包；S04+ 未开工，见文末剩余队列。

## 交付内容

### S01 旅程与故障基线冻结（`scripts/authoring-ui/`）

- 新增 `writing-skills-baseline-check.mjs`（29/29 通过）：冻结既有校对采纳/撤销、
  按批注改写两条写入旅程及故障路径——校对批次全失败保留只读态并可重试、
  采纳后正文再改则撤销入口消失且建议转只读、改写失败可重试、进行中可停止、
  正文变化后候选自动过期且采用禁用。请求载荷/finding/正文前后文本写入
  `tmp/authoring-writing-baseline/baseline.json` 作为可复现 I/O 基线。
- 既有入口本轮实跑核实（不引用旧数字）：
  - `f2-knowledge-assistant-check.mjs` 46/46（含知识接缝浏览器运行时 6 项）；
  - `f2-review-search-history-check.mjs` 33/33。
- 对齐 20260917 UI 线（c445dd4）两处有意变更，journey 脚本此前无人发现已过时：
  1. 工具栏“历史”改开设置记忆页 → F2-6 的 history 段改走“批注工具 → 版本页签”；
  2. 助手快捷任务由按钮组改为“问答范围”下拉 → F2-4 相应断言改下拉选项、
     selectOption 切换与 390 命中区测量。
- 顺带修复 UI 线引入的可访问性回归：助手“问答范围”下拉未纳入 44px 移动端
  命中区规则（`AuthoringKnowledgeAssistant.vue`），390 实测从 31px 恢复 44px。

### S02 Oh Story 首个纯检测函数适配（`writingSkillChecks/`）

- 固定上游 `0ffe7db4fa02489f5d1989e58a22ce62d040a850`：
  - `scripts/writing-skills/upstream/check-degeneration.cjs` 逐字参照（仅加来源
    头、去 shebang），只作对照 fixture，应用代码禁止引用；
  - `public/third-party/oh-story-claudecode-LICENSE.txt` MIT 全文 + Pinax 改造说明。
- `src/services/agents/authoring/writingSkillChecks/checkDegeneration.js`：
  去 fs/path/process/CLI，字符串入/findings 出；findings 带 UTF-16 offset
  locator（start/end/exact 逐字切片）；检测语义（逐行/长句复读、截断、占位
  与元信息泄漏、引号遮蔽/剥离、tier1/tier2）与上游逐条一致。
- 对照 eval `scripts/writing-skills-degeneration-eval.mjs` 7/7：上游 CLI `--json`
  与适配模块同输入行/列/类型/严重度逐条相等；正例 4（含 CRLF offset）、
  反例 3（台词豁免、标题行豁免、front-matter/围栏跳过）双侧零命中。
- 来源清单 `scripts/writing-skills/SOURCES.md` 登记复制/改造/未复制边界。

### S03 shared 方法合同与前后端版本协商

- `shared/writingSkillMethodContract.js`：
  - 首批三个 goal-review 方法注册表（动机/行动因果、铺垫/兑现、节奏/冗余），
    精确 skillId+skillVersion 解析，不用“最新版”兜底；
  - 方法描述校验：禁带文件路径、shell、任意 JS、网络地址；
  - 冻结输入白名单（§5.2 字段集）：未知顶层/嵌套字段、taskKind 不符、缺
    scope.projectId、越权只读能力、非法锁定区间一律 typed 拒绝；
  - 预算顶格（§8.2）：3 目标/6000 字/8 批/批 2 补查/1 格式修复/2 候选/1 修复/
    单任务并发，只降不升；
  - `writingSkillAck` 协商回执（schema+skill 版本+输出 schema）。
- `server/routes/advisor.js`：请求携带 `options.writingSkill` 时校验，未知的
  版本/字段/能力返回 400 `WRITING_SKILL_REJECTED`（附 reason/failures）；
  通过后在响应 `meta.writingSkill` 回带回执。不含该字段的旧请求完全不进此分支。
- eval `scripts/writing-skills-method-contract-eval.mjs` 26/26：合同层 22 项 +
  真实 server 起进程验证未知版本/未知字段 typed 400、旧问答请求不受影响。

## 门禁与真实旅程

- `npm run verify:full` exit 0：20/20 测试文件、200/200 用例（预算顶格，本批
  新增验证全部走 scripts/eval，未占 Vitest 预算）、lint 增量干净、双 build、
  结构预算与 docs build 通过。
- 三条旅程 Gate：46/46、33/33、29/29；两条 eval：7/7、26/26。
- 运行方式：worktree 内 `npx vite --port 5219`，`BASE=http://127.0.0.1:5219
  node scripts/authoring-ui/<check>.mjs`；eval 直接 `node scripts/writing-skills-*.mjs`。

## 未做与边界

- 未合并前 main 在本分支创建后有新提交则需重放（当前 main 与分支基点一致，fast-forward 可并）。
- 真实 provider/真实稿件未跑：S12 的质量 Gate 保留未运行，本批不宣称方法有效。
- S02 只适配了 `check-degeneration.js`；`check-ai-patterns.js` 等仍未复制（见 SOURCES.md）。
- 客户端发送侧（`requestAdvisorTask` 携带 `options.writingSkill`）未接线——
  属 S04 review session 接入范围。

## 剩余队列（下一步）

- S04：review session 增加作者目标、scope、style resolution、coverage（依赖 S03 ✅）。
- S05：三个目标方法最小组合与检查器整合（依赖 S02 ✅ + S04）。
- S06：审稿窗口分批、预算/取消/失败批次/开放项（依赖 S04）。
- S07–S12：finding 引文/locator、助手任务选择薄协调器、意见→rewrite target、
  锁定区间 patch 校验、采纳持久化链路、S12 完整流程 Gate。
