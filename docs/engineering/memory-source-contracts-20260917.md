# AC 跨线合同冻结（NC02 交付，2026-09-17 夜）

Status: **frozen for this night**。本文件冻结今晚 N-A（资料）与 N-C（记忆）之间的两个窄合同。按总计划 §4，这是交接编号而非新框架——全部落在既有模块上，没有新建平行存储。

## AC-SOURCE-v1：资料来源读取（C 消费、A 提供）

N-C 的提取管线消费来源时只依赖以下字段（`structuredExtraction.buildMemoryExtractionEnvelope` 的入参即该形状）：

```text
{
  sourceRef: string        // 稳定来源引用（如 'unit:<unitId>' / 'source-archive:<id>'），必填
  sourceText: string       // 冻结的原文文本，必填非空
  sourceRevision: string   // 来源版本（审计/失效用），必填
  knownIdentities?: [{ id, name, aliases? }]   // 可选：已知实体目录（用于消歧标记）
}
```

语义约束：

1. `sourceText` 是**冻结快照**：提取进行中来源被编辑，结果按 `sourceRevision` 对账（任务级 `source-changed`/指纹去重），不自动重提取。
2. `sourceRef` 必须可反查原件位置（A 的 archiveRef/chunk locator）；C 不解析 chunk，只透传。
3. 资料标题相同 ≠ 身份相同：身份只认 `sourceRef` + `sourceRevision`。
4. 来源删除不连带删除已有提案/事实（证据保留 quote，`sourceId` 反查可能失败——UI 显示"原来源不可用"，不静默清除）。
5. A 现状缺口（待 A 交付）：`WorldbookCreationWorkspace` 的确认函数尚未绑定当前 book（总计划 §1 静态核查第 1 条）。在 A 提供按书归属的 archive reader 之前，C 侧不对资料页做直接装配（NC15 的 A 侧依赖）。

## AC-EXTRACT-v1：提取任务（C 提供、A 消费）

任务存储与生命周期（`services/memory/extraction/extractionJobStore.js`）：

```text
job = {
  id, projectId(=bookId), sourceRefs[], sourceRevision, revisionSeq,
  fingerprint,            // 来源 revision + 内容指纹（去重键）
  blocks[] (≤8 段), truncated,
  status: queued|running|completed|partial|no-fact|failed|cancelled|source-changed,
  attempts(≤3), formatRepairs(≤1), nextAttemptAt(退避),
  proposalIds[], rejected[{reason,…}], unextractableReason, lastError
}
```

- 目标域 `setting` 与 `memory` 共用任务语义（状态机/预算/取消），**不共用结果 schema**：memory 产出走账本提案（claim+quote+evidence），setting 产出走既有设定候选审阅。A 的设定提取 adapter 继续用 `settings.*` 任务族；`memory.extraction` 只服务记忆域。
- 预算：单 job ≤8 块、单块格式修复 ≤1 次、自动会话 ≤20 次请求、并发 1。429/超时退避重试（30s 起步、10min 封顶）；401/403 不盲重试。
- 去重：同 `projectId+fingerprint+sourceRevision` 的已完成/排队任务不重复入队；拒绝抑制由账本 `rejectionMarks` 按 claim+来源版本负责（来源版本变化即重新可审）。
- 审阅唯一入口：memory 提案一律进事实账本审阅（origin='ai' + chapter-quote 证据），不写第二套候选；legacy 摘录候选带 `metadata.derivation='local-excerpt'` 且不参与事实召回。

## B-UI-v1（备忘）

N-B 尚未交付控件规范；C 本夜未新增自定义控件原语（决定分组/任务列表复用既有卡片与 details 样式）。B 交付规范后如需调整，改动限定在本线组件。
