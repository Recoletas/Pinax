# K0 合成 fixture 清单（inventory）

日期：2026-09-05。两套 fixture 刻意描述**同一个故事场景**，差异只在数据丰富度，便于 eval 分开统计 supported/unsupported。

- `legacySnapshot.js`：**只含当前生产 schema 存在的字段**（main f03e40f）。
- `richSnapshot.js`：在同样场景上加入 `RICH-ONLY` 标注的**拟议**字段。它证明的是"数据存在时模型能回答什么"，**不代表现有存档已具备这些数据**。

## 场景要素（任务书要求逐项）

| 要素 | legacy | rich |
| --- | --- | --- |
| 两个项目共用世界书 | `book_a_001`/`book_b_001` 都绑 `wb_legacy_001`，各自 snapshot 独立、runtime 事实不同（`controlled-by` 值相反） | 单项目（共用语义已由 legacy 覆盖） |
| 同名人物 | 世界书两个同名 entry `entry_ch_001`(女官)/`entry_ch_002`(剑客) + runtime `char_shen_qingwu`，三个身份互不合并 | 沿用 entry 同名结构 |
| 旧地点 alias | `place:wb_legacy_001:map_linjiang:site-lincheng` 仅经 geoHistory `placeRefs`+`entryBindings` 显式映射到 `entry_loc_001` | 不涉及（显式映射语义由 legacy 覆盖） |
| 两段时间 | geoHistory 三纪元节点（`age-expansion`/`age-strife`/`age-present`），但 **无结构化 validDuring** | `fact_r_taxguild`(拓张纪元12年→动荡纪元前，独占端) 与 `fact_r_taxmanor`(动荡纪元起，open 端) 不冲突 |
| 未采纳试稿 | `ghost_001`（writing-ghost-candidate，status pending） | 不涉及 |

## 字段来源标记（legacy = 现有生产数据）

- worldbook/entry：`worldStore.js` normalizeWorldbook/addEntry 字段原样（id/name/content/keys/keysSecondary/type/injection/relations/metadata/aliases/mapBinding/metadata.place）。
- 删除：仅 `structuredCharacterTombstones`（`entry_ch_deleted`）；常规 entry 删除为物理 splice，fixture 用"缺失+条目不存在"表达。
- geoHistory：`historyGenerator.buildNode` + `attachPlaceRefsToGeoHistory` 原样（ages/nodes/links/entryBindings/placeRefs；`link_orphan` 指向不存在节点，`link_cycle_back` 构成环）。
- runtime：`gameStore` normalizeEncounteredCharacters/characterStates/placeStates + `runtimeEvents.createRuntimeEvent`（v1 信封，cap 200）。
- canonicalFacts：`runtimeEvents.hasValidCanonicalFactRecord` 允许的字段（subjectId/predicate/value/status/confidence/sourceRefs）。**没有** validDuring/visibility —— 时间与可见性均无证据。
- 试稿：`writingGhostCandidate` 原样（status:'pending'）。
- memories：`memoryCandidates` v2（active 一条、stale 一条；无实体绑定字段）。
- research：`worldbookResearchClaims`（C1 ready / C2 stale，经 `entry.metadata.claimIds` 显式关联条目）。

## 字段来源标记（rich = 拟议，非现有数据）

| 拟议字段 | 位置 | 用途 |
| --- | --- | --- |
| `revision.author` / `revision.manuscript` | snapshot | 作者版本/稿件截止的唯一 tip；旧版本 → unsupported |
| `timeline`（显式纪元梯） | snapshot | 声明式时间比较；legacy 无声明 → 时间问题 unknown |
| `canonicalFacts[*].validDuring` | runtime 事实 | 半开区间故事时间；`endSemantic:'unknown'` ≠ `'open'` |
| `canonicalFacts[*].visibility` | runtime 事实 | public / private / known-by 角色视角 |
| `knowledgeAssertions[]` | snapshot | 角色对某条目/事实的知识依据（basis: self/told/member） |
| `entry.visibility` | worldbook 条目 | 条目级公开性（角色视角可读依据） |

## 嵌入角色秘密的问答对照（eval 用）

- rich：`fact_r_secret_alliance`（沈青梧 ↔ 密约残部）——作者可见；白鹭经 assertion 可见；文行无依据 → **诚实 unknown（不知道是否知道）**，不得答"不知道"也不得泄露。
- legacy：同一问题 → 无可见性/知识依据 → `character-knowledge-unrecorded`，**不能冒称现有存档能回答角色秘密**。
