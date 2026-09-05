# Pinax 受控项目记忆系统设计

**日期：** 2026-08-22
**状态：** 已确认，可进入实施计划
**上游调研：** `docs/superpowers/research/pinax-memory-system-deep-brief-20260822.md`
**从属架构：** `docs/superpowers/specs/2026-08-22-unified-agent-capability-architecture-design.md`

## 1. 目标

Pinax 需要让跨章节的人物状态、承诺、事件、约束和作者偏好在需要时稳定进入创作上下文，同时满足四个条件：

1. 错误提取不能自动成为正式事实；
2. 来源正文被改写、删除或换版本后，派生记忆必须失效；
3. 用户和调试工具能解释某条记忆为什么进入本次生成；
4. 不保存完整 prompt、重复正文、隐藏推理或无限增长的 Agent 运行记录。

成功标准不是“存储更多”，而是以更少、可追溯、当前有效的记忆支持跨章节连续性。

## 2. 核心取舍

### 2.1 采用受控派生记忆层

系统可以在明确事务边界自动提取 `pending` 候选；只有用户确认或确定性迁移事务可以把候选提升为 `active`。模型没有直接写正式设定、覆盖 active 记忆或修改相邻记忆的权限。

### 2.2 不新增 Agent 可编辑的 always-visible memory block

当前场景、当前角色状态、最近提交节拍和正在编辑的选区属于工作上下文，由 context profile 按任务装配；它们不是长期记忆。长期记忆只有在与当前任务相关且预算允许时才进入上下文。

### 2.3 保持 append-only 演化

已有记忆不做 A-MEM 式邻居原地改写。合并、替换和重新提炼产生新 revision，并通过 `supersedes[]` 指向旧条目；旧条目进入 `stale`。这样可以恢复、审计和解释冲突。

### 2.4 不引入 embedding

第一阶段使用中文词项、字符 bigram、实体/地点命中和 scope 约束计算相关度。内容 hash 只用于去重和稳定标识，不能被当作向量计算 cosine similarity。

### 2.5 访问不改变事实权威

召回可以更新低敏诊断字段 `lastRecalledAt`、`recallCount`，但它们不参与 authority、importance 或 relevance 的主评分。否则早期误命中会形成自我强化。访问统计只用于观测和最终同分排序。

## 3. 数据模型

现有 `memoryCandidates` 是唯一持久化 owner，schema 升至 v2，新增字段保持向后兼容：

```js
{
  id: 'mem_...',
  schemaVersion: 2,
  scope: 'global-author' | 'project' | 'session',
  scopeId: 'project-or-session-id',
  kind: 'author-preference' | 'project-fact' | 'character-state' |
        'plot-event' | 'style-sample' | 'constraint',
  content: '受限长度的记忆文本',
  status: 'pending' | 'active' | 'rejected' | 'stale',
  authority: 'accepted' | 'derived' | 'imported',
  importance: 0.0,
  sourceRefs: ['chapter:ch-1:node:n-7'],
  sourceRevision: 'sha256-or-document-revision',
  derivedBy: 'explicit' | 'prose-commit' | 'boundary' | 'migration',
  supersedes: [],
  contentHash: 'sha256_...',
  recallCount: 0,
  lastRecalledAt: null,
  createdAt: 0,
  updatedAt: 0,
  metadata: {}
}
```

规则：

- `pending` 默认为 `derived`；只有 active 条目可自动召回。
- `sourceRefs` 至少一项；只有 `global-author + explicit` 可使用用户操作 receipt 作为来源。
- `sourceRevision` 参与有效性检查，而不是只写进展示字段。
- `importance` 由 harness 确定性推导，用户置顶/降权以显式 override 保存。
- 新 hash 使用现有 content hash 抽象；如果 SHA-256 工具尚未在目标分支落地，先提供兼容 reader，禁止无迁移地替换旧 ID。
- 不保存完整来源正文；`content` 是短记忆，来源通过 ref 回看。

## 4. 权威与生命周期

权威顺序保持统一项目架构的规则：

```text
locked canon > canonical setting > accepted memory > current derived observation > imported evidence
```

生命周期：

```text
observer / explicit trigger
  -> pending
  -> active（用户确认或确定性迁移）
  -> stale（来源 revision 变化、被新条目 supersede、所属会话失效）

pending -> rejected（用户拒绝）
stale -> pending/active（仅来源恢复且 revision 再次匹配，或用户显式恢复）
```

普通重复候选静默去重；相似候选仅建立引用；与 active 条目冲突的候选进入异常审阅，不自动替换。

## 5. Importance 与检索

### 5.1 确定性 importance

基础重要度按 kind 和可观察信号计算：

```text
constraint 0.90
plot-event 0.78
character-state 0.72
project-fact 0.68
author-preference 0.62
style-sample 0.45
```

在 `[0, 1]` 内增加或减少：

- 明确承诺、不可逆事件、人物状态改变：`+0.10`
- 同一事实由两个独立 source ref 支持：`+0.08`
- 仅来自一次模型推断且没有显式证据：`-0.12`
- 用户置顶：override 为 `1.0`
- 用户降权：override 为 `0.25`

模型不能给自己的输出打 importance 分。

### 5.2 可解释排序

每条候选产生分项评分：

```text
final = 0.50 * relevance
      + 0.18 * importance
      + 0.14 * authority
      + 0.10 * recency
      + 0.08 * scopeFit
```

- `relevance`：查询词项、中文 bigram、人物/地点 ID 命中；
- `importance`：harness 值或用户 override；
- `authority`：accepted 高于 derived/imported；
- `recency`：以记忆事实更新时间计算的有界衰减；
- `scopeFit`：session 精确命中、project 精确命中、global-author 的顺序偏置。

空查询只用于显式“查看记忆”，不得把任意 active 记忆自动注入模型。生产检索默认总量 `topK=5`，单 scope 不超过 3，相关度低于阈值的条目记入 ledger 的 excluded 部分但不注入正文 prompt。

## 6. 触发边界

第一阶段只实现四类边界，不照搬调研中的七触发器：

1. **正文事务提交**：AI 正文落盘后立即调度；手工编辑在稳定保存/checkpoint 后调度。只检查 changed range。
2. **章节或会话切换**：对上一范围执行一次有界总结/失效处理，不对整个项目重扫。
3. **用户明确记住**：对当前选区或输入内容创建 pending；用户在同一操作中选择“确认记忆”时可直接 active，并保留显式 receipt。
4. **上下文解析前检索**：由 `ProjectKnowledgeFacade` 的 memory reader 自动执行，不依赖模型自愿调用工具。

模型仍可通过 `memory_lookup` 做第二轮按需读取，但工具读取与自动读取共享同一个 scope、revision、阈值、topK 和 ledger 规则。

## 7. 统一 Agent 接入

记忆不建立第二套上下文运行时：

```text
Authoring transaction / boundary / explicit action
  -> observer.memory.derive
  -> memory trigger harness
  -> memoryCandidates (pending/active/stale)

canonical authoring task
  -> ProjectKnowledgeFacade memory reader
  -> memory retrieval policy
  -> resolveAgentContext
  -> ContextLedger included/truncated/excluded
  -> NarrativeKernel / text workflow
```

硬依赖：Authoring 的 canonical task、provider capability、stale transaction 和真实 ContextLedger 纵向链路必须先通过集成测试。记忆计划不能绕过该链路直接在页面拼 prompt。

## 8. 用户体验

- 正常候选静默进入现有记忆候选入口，不弹阻断 modal。
- 顶部或编辑器附近只允许一次短暂提示，例如“提取了 2 条记忆候选”。
- 冲突、来源失效和歧义进入统一异常入口。
- 上下文检查器显示本次实际包含、截断和排除的记忆标题、scope、原因和 source ref；不展示原始 prompt。
- 用户可确认、拒绝、置顶、降权、合并、替换、恢复和跳回来源。
- 关闭 Agent 时不发生模型提取请求；显式“记住”仍可使用纯本地候选创建。

## 9. 存储、隐私和容量

- Web 阶段继续复用现有本地存储 owner；桌面阶段通过同一 facade 换成本地项目目录/SQLite adapter。
- 不持久化完整 prompt、模型 reasoning、流式碎片、重复章节正文或 shadow critic prose。
- receipt 仅保存 task、revision、sourceRefs、条目 ID、评分分项、included/excluded 原因和耗时。
- 每项目 active + pending 软上限 500；超过后只提示整理，不自动删除或自动 archive。
- rejected 和 stale 可按用户操作清理；自动清理不属于本阶段。
- Mem0 保持可选同步 adapter，不成为本地检索和正确性的依赖。

## 10. 错误与恢复

- observer 超时/失败不回滚正文，也不创建空候选；
- 返回时 target/source revision 已变化则丢弃为 stale result；
- 部分候选合法时保留合法项，并报告 rejected count；
- 本地存储失败显示可重试提示，不能假装已记住；
- reload 后 pending、active、stale 和 supersedes 链可恢复；
- 撤销正文事务会使该事务派生的记忆 stale，不静默删除；
- provider 不可用时，显式“记住”仍创建本地候选，自动语义提取则跳过。

## 11. 分阶段范围

### M0：记忆内核收口

- schema v2 与兼容迁移；
- provenance/revision/authority/supersedes；
- 确定性 importance；
- 可解释 lexical retrieval；
- 来源失效和冲突；
- 容量、隐私和 receipt。

### M1：统一工作区接入

- 四类触发边界；
- observer memory 输出接入候选 owner；
- ProjectKnowledgeFacade memory reader；
- ContextLedger 实际 included/truncated/excluded；
- Authoring 低干扰提示与异常审阅；
- 真实 provider、浏览器和恢复验收。

## 12. 明确不做

- embedding、向量数据库、HippoRAG/PPR；
- Self-RAG reflection token；
- Agent 自由编辑 core memory；
- A-MEM 邻居原地改写；
- 自动 reflection 后直接 active；
- 召回次数强化权威或 importance；
- 自动 archive/delete；
- 每个专家 Agent 独立记忆库；
- 桌面持久化和 Web 记忆逻辑同时重写。

## 13. 验收标准

1. 同一人物或事件跨章节可在相关任务中稳定召回。
2. 不相关项目、session、pending、rejected、stale 条目绝不进入上下文。
3. 来源 revision 变化后，相关派生记忆在下一次解析前失效。
4. 错误候选不会自动升级为事实或覆盖 locked/canonical 数据。
5. ledger 能解释每条记忆被包含、截断或排除的原因和评分分项。
6. 访问次数不会改变相同查询的主排序。
7. 正文提交不等待 observer；observer 失败不影响正文。
8. 关闭 Agent 后自动模型请求为零。
9. 不持久化完整 prompt、重复正文或隐藏推理。
10. 旧 schema 数据无损读取，并能在显式写操作时渐进升级。
