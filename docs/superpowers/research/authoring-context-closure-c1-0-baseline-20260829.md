# 落笔上下文闭环 P1：C1-0 真实基线与交接

**日期：** 2026-08-29

**状态：** C1-0 已收口；产品行为未改，下一步为 C1-1A 纯服务合同

**上位计划：** [Authoring 真实页面可见切片推进计划](../plans/2026-08-29-authoring-visible-slice-rollout.md)

## 1. 本切片结论

C1-0 只完成并发收口、固定验收数据、真实页面基线和断链审计，不修改 Authoring 产品交互。当前页面已有 writingUnit、当前场投影、世界书绑定、可编辑长 Ghost 和 Context Ledger 的部分基础，但尚未形成“选择来源 → 冻结预检 → 生成 → 编辑 Ghost → 单次采纳 → 实际参考回执”的统一闭环。

本轮基线身份为：

- 分支：`integration/consolidation-20260823`
- HEAD：`c55f3207f215ac86f434eaf54a690562b8755f61`
- 状态：HEAD 之上仍有跨会话未提交 WIP；不能只用 commit SHA 代表当前运行页。专用脚本会把运行时 fixture、页面报告和工作树快照写入 `tmp/authoring-context-closure/`。
- 服务：复用用户现有 `http://127.0.0.1:5173`，未启动、停止或重启开发服务。

## 2. 文件所有权锁

| 阶段/owner | 允许修改 | 本切片状态 |
| --- | --- | --- |
| C1-0 基线 | `scripts/authoring-ui/context-closure-*.mjs`、本报告及状态文档 | 已占用并收口 |
| C1-1A Context contract owner | 新 `authoringRunSession.js`、candidate/readers/compiler/lifecycle、memory adapter 与 focused tests | 下一刀；先不碰页面 |
| Kernel/receipt owner | `narrativeKernelExecutor.js`、`narrativeSceneWorkflow.js`、`narrativeKernel.js`、resource/tool index、`contextReceipt.js` | 等 C1-1A 合同冻结后进入 |
| Authoring integration owner | `Authoring.vue`、`useWritingAgent.js`、`AuthoringAiReference.vue`、`authoringNarrativeContext.js` | 当前冻结；只允许单 owner 在后续一次性接线 |
| C1-2 场景 owner | `AuthoringSceneCuration.vue`、`authoringSceneProjection.js` 及 scene fingerprint | 不与 C1-1A 并发改写 |
| 地图 worktree | 地图专属文件 | 可继续并行；P6 共享接口窗口前不碰上述 owner |

工作树中的 `Authoring.vue`、`AuthoringSceneCuration.vue`、`useWritingAgent.js`、`writingContextReaders.js` 和 scene projection 已存在其他 WIP。C1-0 没有覆盖、回退或格式化这些文件。

## 3. 固定验收 fixture

专用 fixture 为一本《雾港纪事·P1》，精确包含两章；目标为第二章中间 writingUnit，共三个语义 writingUnit。它通过正式 repository/store/schema 建立，而不是直接伪造页面 DOM。

| 来源 | 固定内容 |
| --- | --- |
| 当前场 | 角色“莉娜”、地点“旧港税务所”、时间“第七响之后 / 深夜” |
| 世界书 | 角色“莉娜”“艾德加”，地点“旧港税务所” |
| 速记/探索 | “第七响之后”，作为后续显式作者意图/灵感候选 |
| 叙事素材 | “潮水退账的意象”，`accepted` inspiration |
| 有效记忆 | 莉娜遇到异常先数数、不立刻触碰可疑物 |
| 过期记忆 | “艾德加已经离开旧港”，状态为 stale，带旧来源 revision |

脚本与临时证据：

- `scripts/authoring-ui/context-closure-fixture.mjs`
- `scripts/authoring-ui/context-closure-baseline.mjs`
- `tmp/authoring-context-closure/fixture-state.json`
- `tmp/authoring-context-closure/fixture-verification.json`
- `tmp/authoring-context-closure/baseline-report.json`

旧 `rollout-fixture.mjs` 不作为本阶段证据：它缺叙事素材和两类记忆，且旧 scene anchor 的 `status: confirmed` 不属于活动锚点，回放时人物、地点和时间均为空。

## 4. 真实页面基线

三张过程图只保存在 `tmp`，不进入 Git：

1. `tmp/authoring-context-closure/baseline/c1-0-current-page-1440.png`：目标章、三个 writingUnit、左侧当前场简报。
2. `tmp/authoring-context-closure/baseline/c1-0-scene-curation-1440.png`：当前场能看到莉娜、艾德加和旧港税务所，但动作仍是旧语义。
3. `tmp/authoring-context-closure/baseline/c1-0-ai-before-run-1440.png`：AI 面板只有“本次参考 1 项 / 等待生成”占位。

本次 1440 页面探针为 0 个 `pageerror` / console error。场景编辑动作实测只有：

```text
保存现场 / 保存并推演 / 取消 / 恢复沿用前文
```

## 5. 当前真实交互断链

| ID | 断链 | 真实证据 |
| --- | --- | --- |
| B1 | 三种场景意图混在旧保存动作里 | 页面没有“纠正当前 / 安排下一段 / 仅供本次参考”三个明确选择 |
| B2 | 没有 run-only“本次参考”选择器 | 当前场和推演区均不能从速记/素材最多选择三条 |
| B3 | 没有冻结的生成前预检 | 提交前看不到正文、场景、设定、作者参考和记忆的实际集合 |
| B4 | 旧 ledger 占位不等于“将参考” | “本次参考 1 项 / 等待生成”不列名称、来源、加入原因，也未绑定 FrozenContextManifest |
| B5 | 底层 reader 不代表产品已接通 | 探索和素材虽能形成部分候选，却没有显式选择、项目/版本和 usageRole 闭环 |
| B6 | 详情仍暴露开发术语 | profile、预算、candidateId 等不能作为默认作者预检语言 |
| B7 | 两类长任务未统一 | V4 的“推演下一段”已有可编辑 Ghost；“重写当前 writingUnit”未进入同一 run session |

同时记录一个已通过的相邻基线：打开当前场详情前后，正文 `scrollTop`、目标 unit、caret offset 和选区均保持不变；后续 C1-2 必须守住这一行为。

## 6. C1-1 必须先关闭的技术断链

1. 当前单元 reader 读取整个 writingUnit；短补全还在 manifest 外注入 caret 后内容，长推演另把当前章消息绕过 manifest 送入 Kernel。光标后正文目前不能被证明永不进入 provider。
2. Manifest 不是唯一上下文 owner。Kernel 仍独立装配 scene/projection/continuity，资源索引还能向工具开放完整世界书等来源；同一场景和设定可能重复或越权进入。
3. 长推演的冻结 manifest 实际没有受控记忆。旧 facade 能读记忆，但 narrative run 没消费其 envelope；executor 的 memory resolver 默认为空。
4. 页面只有共享的 last manifest/receipt/pin/exclude 状态，没有点击提交瞬间冻结 target、scene、三种意图、显式参考、memory 与 revisions 的一次性 `AuthoringRunSession`。
5. 普通速记会因 `alternative` 被正文任务排除；素材则被一律提升成 `fact`，且候选 projectId 使用当前页面项目，存在跨项目素材绕过门禁的风险。
6. 去重只按 candidateId，不按 canonical sourceRef；正文、当前场、世界书可从 manifest、旧 narrativeContext 和工具多路重复进入。
7. 依赖快照不覆盖全部 scene observation、memory 和 tool resource revision；素材校验还可能使用页面旧对象而非按 ID 重读真源。
8. receipt 只覆盖初始 manifest blocks，不覆盖旧 narrativeContext、runtime 与 tool evidence；逐调用回执没有完整传播到页面，短补全没有 ModelCallReceipt。
9. 跨章 reader 对所有旧章读取 facts/summary/尾段，范围宽于“前章有摘要或明确关联才加入”的 P1 策略。
10. 当前 pin/remove 是页面级共享状态，只在书、章或文档切换时清理；目标 writingUnit 改变时不会自动清除，因此也不能充当一次性 run session 的选择状态。

## 7. 下一刀：C1-1A 纯服务合同

下一小切片先不改 `Authoring.vue`，只建立可独立验证的内存合同：

1. 新增 `authoringRunSession.js`，同步冻结 runId、taskKind、project/document/chapter/unit/node/caret、各级 revision、scene intent、最多三条 `AuthoringRunReference`、candidates、manifest 与 receipt/outcome；不写 localStorage。
2. 当前 unit 只读 caret 前缀；此前 writingUnit 按距离而非文本长度优先；其他章节执行 P1 的克制策略。
3. 显式参考按 ID 重读 repository，校验项目、删除和 revision；探索映射为 intent/inspiration，只有明确事实素材才能成为 fact constraint。
4. 现有 memory reader 通过 adapter 进入统一 candidates，并携带 `memory:<id>`、自身 revision、来源依赖和冲突/过期状态。
5. 候选按 canonical primary sourceRef 去重；manifest excluded 项保留安全的 label/kind/sourceRefs；receipt 能覆盖 dependency issue、逐调用与 tool evidence。
6. 在 tool evidence amendment 尚未完成前，Authoring 的工具索引只能开放 manifest 已授权的世界书和记忆 ID。

Focused Gate 至少锁定：光标后永不出现、最近前文优先、速记显式进入、灵感不变事实、跨项目/删除/修改 fail-closed、有效与过期/冲突记忆、同 sourceRef 一次、target/projection 不一致 fail-closed、非 manifest 来源不能经工具进入、receipt 可追溯实际 evidence。

完成 C1-1A 后，才由唯一页面 owner 一次性接长推演、重写与短 Ghost；随后删除 narrative 路径上的旧 facade/`authoringNarrativeContext` 重复读取。

## 8. 验证记录

- 专用 fixture：真实 repository/store/schema 装载成功；13/13 数据与页面门禁通过（两章、三个 writingUnit、六类来源、当前场三轴、目标 unit 聚焦）。
- 真实页面基线：1440 三个状态均成功截图；0 console/page error；打开当前场详情保持正文 scroll/caret/selection。
- `node --check` 两个专用脚本：exit 0；定向 ESLint：exit 0。
- `npm run docs:build`：exit 0；`git diff --check`：exit 0。
- C1-0 没有修改产品代码，因此未把任一 P1 产品完成标准标为通过。
- 按 P1 明确的测试节奏，本阶段只执行脚本语法、fixture/页面探针、文档构建和 diff 检查；未运行 `verify:full`，它保留给 P1 最终交付。
