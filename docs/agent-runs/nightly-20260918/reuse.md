# 复用回执（nightly-20260918，A 线）

硬规则：先给上游文件/固定 SHA/许可/依赖闭包/移植范围，再动代码。本文件随领取逐项补齐。

## 已复用/重放（本轮实际动码）

### NC 提取管线补丁（选择重放）

- 上游：本仓库分支 `night/memory-quality-20260917`（提交 `7cde2a1`、`c01d209` 一系列），同项目 MIT/私有约定，无外部许可问题。
- 原路径 → 本地路径：同路径重放 `src/services/memory/extraction/extractionRunner.js`（单飞守卫）、`src/services/memory/extraction/extractionJobStore.js`（STORAGE_KEY 统一）、`src/composables/useStorage.js`（新增 `MEMORY_EXTRACTION_JOBS` 键，值仍 `memory_extraction_jobs_v1`，旧数据不受影响）。
- 改动原因：调研（maturity-research-20260918 §旧分支去重）指出这 2 文件差异未入 main 且无验证；本夜 G0 复验后选择性接入，不整分支合入。
- 对应测试：`scripts/extraction-singleflight-eval.mjs`（真实浏览器 + 真实模块；原提交无任何验证，此为本轮补齐）。键值不变，localStorage 迁移无需求。

## 复用评估中（未动码）

### Utopia `crates/utopia-store/src/temporal.rs`（M01–M05，已移植）

- 上游：`https://github.com/deeplethe/utopia` 固定 SHA `ca4678084da46311c1d24cb65d05f340d8903e54`，Apache-2.0，仓库无 NOTICE 文件（raw 404 已核）。
- 原路径：`crates/utopia-store/src/temporal.rs`（1802 行）→ 本地路径 `src/services/memory/ledger/temporalCoordinator.js`（纯算法核心，零内依）。
- 移植方式：适配移植。`desired_ends`/`arrive`/`Row`(key,is_open,recomputable,end_before,holds_at)/`same_value`/`End` 语义逐行对应；许可与修改说明在文件头。
- 不移植（记录原因）：Postgres 事务与咨询锁（单作者浏览器流用 Dexie 事务）；AUTO_CLOSE_MIN_CONFIDENCE 阈值（按计划"保留作者确认"，以 author/derived 权威为置信 analogue，低置信只记 needs-author 冲突）；双侧唯一时间线（Pinax 谓词合同 v1 无 inverse-functional 声明）。
- 写形状依据：上游头注「闭合走作废+改写而非原地改」直接指导 M05 的收口后继行设计（supersedesKind 派生标记 + revertTemporalClosure 只撤派生断言）。
- 对应测试：`scripts/memory-temporal-coordination-eval.mjs`（纯算法 10/10）、`memory-temporal-adoption-eval.mjs`、`memory-temporal-endpoints-eval.mjs`、`memory-temporal-revert-eval.mjs`（真实 IndexedDB 生产链）。

### StoryForge `src/lib/agent/run/`（G2a/T01，C 线交付、A 线复核）

- 上游：固定 SHA `1935dab9670069f1336be0b09c096c1444bbada6`，MIT（版权 2026 yuanbw2025）。
- 依赖闭包实测：`hash.ts`（canonicalize/canonicalStringify，依赖 sha256Text=WebCrypto 4 行，已从固定 SHA raw 核实）、`schema-utils.ts`（零依赖）、`checkpoint.ts`（依赖 db/types/event-store/workspace-scope，闭包过大）；`checkpoint.ts` 的 `recoveryPlan` 步骤分类（succeeded/有候选/confirmed-adopt/committed-adopt）可独立。
- 落地：C 线 `src/services/experience/run/runContract.js`（同步哈希适配 Pinax contentHash）；A 线复核满足计划冻结接口。

## 不复用（记录原因）

- Utopia 整库知识图谱/数据库层：Rust+Postgres 与本项目 Vue+Dexie 不同，无法直接导入；只移植纯算法。
- StoryForge 评测整套 React UI/产品数据库：只取可独立 fixture/断言。
- Pinax 既有领域模块（骰子、资源、outbox、账本、预算）：已存在且通过验证，不以"统一"为由替换第二实现。
