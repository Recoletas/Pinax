# F2 资料目录（catalog）逐字段签实 — K21

日期：2026-09-06。依据源码：`src/services/agents/authoring/authoringKnowledgeQuerySession.js`（catalog 构建器）、`authoringKnowledgeAnswerContract.js`（证据合同）、`src/services/agents/context/authoringRunContextReaders.js`（revision）。这是**现有生产行为**的签实，不是拟议合同；K23 桥接按本表映射。

## 1. evidence 项统一形状（normalizeAuthoringEvidence 签实）

| 字段 | 类型/限制 | 谁填 | 签实 |
| --- | --- | --- | --- |
| `sourceRef` | ≤240 字符，**必须等于 `sourceRefForAuthoringEvidenceLocator(locator)`** | 各构建器 | 格式与 locator 强耦合，前缀替换过不了 normalize |
| `projectId` | 与 envelope projectId 一致 | 构建器传入 | 不匹配 → normalize 拒绝 |
| `authority` | `manuscript/worldbook/outline/history/scene/memory/suggestion` 七类 | 各构建器 | 无第八类；桥接不得造新 authority |
| `label` | ≤120 | 构建器 | 展示用 |
| `excerpt` | 归一空白后 ≤1200 字符，**必填** | 构建器 | 证据是裁剪后的材料，不是全量对象 |
| `revision` | ≤240 字符串 | 见 §3 | 字符串比较即 stale 判定 |
| `locator` | kind ∈ 七类同名词 | 构建器 | normalize 逐 kind 校验必填字段 |

目录去重（normalizeCatalog）：同 sourceRef 且 revision/locator 不一致 → **整个 sourceRef 从目录删除**（冲突不裁决）。同 ref 同内容 → 保留一份。

## 2. 七类 authority 逐类签实（读取→sourceRef→locator→revision→时间/视角）

| authority | 读取源（谁读） | sourceRef / locator | revision（谁算） | 项目/世界书归属 | 时间/视角 |
| --- | --- | --- | --- | --- | --- |
| `manuscript` | book.chapters → 章节 editorDocument → writingUnit → node 纯文本（≤1200） | `node:<chapterId>:<nodeId>` / locator `{kind:'manuscript', documentId, chapterId, unitId, nodeId}` | `manuscript-<hash(chapterId, documentRevision, unit/unitNode id+rev, rawNodeText, chapterOrderRevision)>` | chapter 归 book（projectId 即 bookId）；book.worldbookId 记绑定 | 无故事时间；有 through-target 时序裁剪（positionIndex），不是时间语义 |
| `worldbook` | readBoundAuthoringWorldbook(projectId, worldbookId) → entries（`enabled===false` 跳过） | `worldbook-entry:<entryId>` / `{kind:'worldbook-entry', worldbookId, entryId}` | `worldbookRunRevision(entry)`（entry 内容+注入参数+metadata 指纹） | 绑定三重核对：book.worldbookId、binding.worldbookId、worldbook.id | 无；`belongsToProject` 只信 entry 自报 projectId/bookId（旧档通常无 → 视为归属） |
| `outline` | projectOutlineRepository listOutlineNodes/Edges | `outline-node:<nodeId>` / `{kind:'outline-node', nodeId}` | `fingerprintOutline([node], relatedEdges)`（含因果/伏笔边） | node 自报 projectId（可空） | 无 |
| `history` | **worldbook.geoHistory.nodes（kind world-history）+ geoHistory.playerNodes（kind player-history）** | `history-node:<id>` / `{kind:'history', historyId}`；id 回退 `node.id \|\| node.nodeId \|\| history-<序号>` | `history-<hash(worldbookId, kind, node)>` | 归属绑定世界书；playerNodes 与 nodes **可能同 id** | `yearLabel/ageId` 只在 excerpt 文本里，无结构化时间 |
| `scene` | 章节 sceneAnchors（status 必须为空）+ 可选 live scene projection | `scene-anchor:<id>` 或 `scene-projection:<ch>:<unit>` / `{kind:'scene', chapterId, unitId, anchorId?}` | anchor 指纹+被引 entry revision；projection 用 projectionFingerprint | anchor.worldbookId 必须等于绑定 worldbookId | 无 |
| `memory` | readAuthoringMemories(projectId, {status:'active'}) | `memory:<id>` / `{kind:'memory-source', memoryId, sourceRef?}`（sourceRef 仅当已在本项目目录验证过） | `memoryRunRevision(memory)` | scope==='project' 且 scopeId===projectId，**跨项目记忆不入目录** | 无 |
| `suggestion` | listExplorationDocuments(projectId) | `exploration:<docId>` / `{kind:'exploration', documentId}` | `doc-r<revision>`（数字 revision ≥0） | 文档自报 projectId | 无；速记/素材，claim 只能 partial |

## 3. 已知坑位（K21 场景直接对应）

1. **重复历史 ID**：geoHistory.nodes 与 playerNodes 同 id 且内容不同 → 目录层 sourceRef 冲突 → 该 ref **从目录消失**；后续 `requiredSourceRefs` 引用它的 prepare 直接 `knowledge-required-source-missing`。桥接必须同策略：拒绝歧义，不挑一份。
2. **历史 id 回退序号**：`history-<index+1>` 依赖数组顺序，重排后漂移；这类 ref 只作展示，不得当长期身份。
3. **worldbook entry 归属靠自报**：`belongsToProject` 在旧档（entry 无 projectId 字段）时默认归属当前项目；只有显式写了他项目 id 才拒绝。
4. **未绑定/换绑**：book.worldbookId 为空 → worldbook/history/scene 三类全无来源；换绑后 `collectCurrentRevisions` 里 `bindingChanged` 直接丢弃 worldbook/history/scene 的 revision（等价 source-missing → stale）。
5. **liveSource**：页面可注入"本次打开的一个编辑面"未保存正文；必须过项目/角色/documentId/revision/schema 五重校验，否则整个 prepare fail-closed。
6. **重复 sourceRef 的合法重复**：同一世界书 entry 同时被 worldbook 证据与 memory locator 引用，是两个不同 sourceRef，各自独立，不算重复。

## 4. K 桥接映射结论（K23 实现依据）

| F2 authority | K 目标 | 映射方式 |
| --- | --- | --- |
| `worldbook` | K snapshot.worldbook.entries 子集 | locator.worldbookId 必须等于桥接绑定 worldbookId（防只换前缀）；K entry 由证据 label/excerpt 合成 |
| `history` | K snapshot.geoHistory.nodes 子集 | historyId 必须能定位到唯一节点来源；同 id 歧义 → typed 拒绝 |
| `memory` | K snapshot.memories 子集 | memoryId 直映射 |
| `manuscript/scene/outline/suggestion` | **typed 拒绝** | K v1 无对应适配器；拒绝并给原因，不伪装成 worldbook-entry |

回映射：K excerpt → 原 F2 sourceRef/locator/**revision 原样带回**（映射表直通，保证 `reconcileAuthoringKnowledgeAnswer` 的 stale 判定与旧 F2 完全一致）。K unknown/不足 → F2 `missingInformation` 文本。facts/hypotheses 在桥接快照中不存在；若出现按 typed 异常报告，不混排。

时间/视角能力：**F2 目录不含时间或角色知识数据**，桥接查询全部按"无时间声明/无知识依据"诚实 unknown（round-1 合同行为），rich 能力不因桥接出现。
