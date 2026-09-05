# Authoring 等价缺口收口实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐融合设计中已经承诺、但 Phase 4 只做了静态等价断言的自动上下文压缩、真实机制暂停信号和书籍/章节正文导出，并修复审阅中发现的显式回合指令未进入 Kernel 当前 user turn。

**Architecture:** 下一拍请求在进入 NarrativeKernel 前，从当前 schema-v3 稿件确定性构造有界 recent messages；长稿只把旧段落压成派生 scene summary，摘要不成为第二份正文真源。半自动从生成正文、当前机制状态和本拍新增 runtime events 解析真实机制信号。正文导出由纯服务读取 canonical chapter document，再由 Authoring 既有“更多”菜单触发浏览器下载。

**Tech Stack:** Vue 3、Pinia、Vitest、现有 NarrativeKernel / writingDocument schema / download utility。

---

### Task 1: 自动叙事上下文策略

**Files:**
- Create: `src/services/agents/authoring/authoringNarrativeContext.js`
- Modify: `src/services/agents/authoring/narrativeKernelExecutor.js`
- Modify: `src/services/agents/authoring/narrativeSceneWorkflow.js`
- Modify: `src/pages/Authoring.vue`
- Test: `src/__tests__/authoringParityClosure.test.js`

- [x] **Step 1: 写失败测试**：短稿返回有界原文消息且不生成摘要；超过 6000 字的旧段落生成 `sceneSummary`，只把最近四段传给 Kernel；同 revision 复用摘要；摘要不改写 document。
- [x] **Step 2: 验证 RED**：`npm run test:run -- src/__tests__/authoringParityClosure.test.js` 应因模块不存在失败。
- [x] **Step 3: 最小实现**：导出 `buildAuthoringNarrativeContext({ document, markdown, projectId, chapterId, revision, previousSummary })`；工作流透传 `narrativeContext`，executor 把其 `messages/sceneSummary` 交给 `buildNarrativeKernel()`；显式 `turn.instruction` 追加为当前 user message，类型/行动者/对象进入 turn block，避免“按此推进”退化成泛化续写。
- [x] **Step 4: 验证 GREEN**：focused 测试通过，并确认测试输入对象深冻结前后相同。

### Task 2: 真实机制暂停信号

**Files:**
- Create: `src/services/agents/authoring/authoringMechanismSignal.js`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/services/agents/authoring/authoringSemiAutoPolicy.js`
- Test: `src/__tests__/authoringParityClosure.test.js`
- Test: `src/__tests__/authoringSemiAuto.test.js`

- [x] **Step 1: 写失败测试**：正文检测结果、`activeMechanism`、非空 `mechanismContext`、本拍新增 `state_delta` 的 `mechanismContext` 操作均产生 typed `mechanism-trigger`；旧事件不触发；普通正文不触发。
- [x] **Step 2: 验证 RED**：focused 测试应因 resolver 缺失或页面仍含 `mechanismTrigger: false` 失败。
- [x] **Step 3: 最小实现**：每拍记录 runtime event 起点，正文成功后调用既有 `gameStore.detectMechanismTriggers()` 并合并 canonical 机制状态/新增事件；把布尔结果写入 `semiAutoLastBeat`，不新增顶部按钮或自动打开面板。
- [x] **Step 4: 验证 GREEN**：机制触发时 composer 停止后续拍，失败/stale 路径不制造信号。

### Task 3: 正式稿件导出

**Files:**
- Create: `src/services/writing/writingManuscriptExport.js`
- Modify: `src/pages/Authoring.vue`
- Modify: `src/__tests__/authoringFusionCleanup.test.js`
- Test: `src/__tests__/authoringParityClosure.test.js`

- [x] **Step 1: 写失败测试**：章节导出使用 schema-v3 Markdown 投影；整书按书内章节顺序输出标题与正文；空章保留标题；文件名过滤非法字符；输出不含批注、候选、prompt、分镜或来源元数据。
- [x] **Step 2: 验证 RED**：focused 测试应因导出服务和真实菜单动作缺失失败。
- [x] **Step 3: 最小实现**：导出 `buildChapterManuscriptExport()` / `buildBookManuscriptExport()`；Authoring 保存当前章后调用共享 `downloadTextFile()`；“更多”中增加“导出当前章节”“导出整本书”，分镜导出继续独立保留。
- [x] **Step 4: 验证 GREEN**：等价矩阵改为断言真正正文导出，不再用分镜导出冒充。

### Task 4: 文档与门禁

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/LOG.md`
- Modify: `docs/superpowers/plans/2026-08-23-authoring-experience-workspace-fusion-plan.md`

- [x] **Step 1:** 将三个缺口从 `Next up` 移到完成事实，并把等价矩阵对应项勾为真实实现。
- [x] **Step 2:** 运行 `npm run test:run -- src/__tests__/authoringParityClosure.test.js src/__tests__/authoringSemiAuto.test.js src/__tests__/authoringTurnRuntime.test.js src/__tests__/authoringFusionCleanup.test.js`。
- [x] **Step 3:** 运行 `npm run verify:full`、`npm run smoke:narrative-recovery`、`npm run smoke:narrative-production -- --dry-run`、`git diff --check`。
- [x] **Step 4:** 按 `ui-style-check` 复核：入口属于安静编辑器的既有“更多”菜单，无新 pill/卡片/颜色/断点；若无现有 dev server，记录 live audit 未运行。
