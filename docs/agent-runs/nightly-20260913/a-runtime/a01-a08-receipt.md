# A 线回执 · A01–A08 + A10（首夜）

分支 `night/sf-runtime-20260913`，检查点 `d46efbf` → `fd3b9a8` → `015a58b`（基线 `main@5152aad`）。
worktree `/home/recoletas/jiuguan/pinax-night-sf-a-20260913`。

## 状态一览

| 包 | 状态 | 说明 |
|---|---|---|
| A01 人物身份与入场时点 | **complete** | ref 主键、姓名唯一命中、同名歧义可处理、planned 无台词权、enteringRefs 授权入场（提交后生效） |
| A02 两类后果贯通 | **complete** | shared 合同归一化（server+client 同源）、quote 逐字强校验、needs-review 整批拒绝 |
| A03 不可变分支账本 | **complete** | 提交步深冻结、fork 深复制值隔离、同 id 不重复、非法批次不留半套 |
| A04 知情与第二步承接 | **complete（协议层）** | 请求带本路累计知识视图与承诺延续；真实模型承接待 A08 解阻 |
| A05 对照与 needs-review | **complete** | compareRouteConsequences 纯函数（learned/declared-unaware/unrecorded 三态）、issueKey 同文对齐 |
| A06 选路冻结 | **complete（模块 + api-ready）** | buildRehearsalDraftSource + isRehearsalDraftSourceCurrent；Authoring.vue 接线归 C |
| A07 故障恢复与预算 | **complete** | 取消/迟到/失败保留草稿与路线、一击一请求、refreshSettings；无新增 watcher/全局态 |
| A08 三场真实模型 | **blocked-external** | 本机无 `server/.env` MINIMAX_API_KEY、无环境变量；**0 attempts**。采样脚本已完成后果取证升级，凭据就绪即可运行 |
| A09 分线自审与封板 | **complete** | `verify:full` exit 0；生产接线审查见下 |
| A10 物品与位置后果 | **complete（两片合一提交 015a58b）** | items 声明式授权+交付/拒收；location 离场/回归+回应资格联动；对照新增持有差异与在场差异 |
| A11 记忆候选 | **blocked-local** | 需 O 释放 memory owner 写锁 + C13 确认入口，未满足，未单边 enqueue |
| A12 受限 tool call | **blocked-local** | 条件包：需 O 确认统一工具执行器边界，本夜未启动 |
| A13 节奏实验 | **blocked-external** | 需 A08 基准样本与剩余模型预算，无凭据未启动 |

## 实现落点

- 新增 `shared/authoringRehearsalConsequenceContract.js`：冻结条件（factKey 应用生成、声明不知情、assumption 标记）、归一化（每步≤2条、版本、来源引文、承诺 key 应用分配/议题锚定作者行动原文）、`projectRouteConsequenceState`、`compareRouteConsequences`、`buildRehearsalRequestPlan`、`parseRehearsalResponse`。
- `src/services/agents/authoring/authoringRehearsal.js` 收敛为薄传输层（信封构建 + 发送 + 兼容再导出）。
- `src/composables/useAuthoringRehearsal.js`：路线账本（冻结/克隆/代次）、`freezeConditions`（空路线升级，非空旧路只读）、`lastRejected`、`compareRoutes`、`createDraftSource`、`refreshSettings`。
- 服务端 `openclawService.js`（输出模板 + `rehearsalVerification` prompt 剥离）、`advisorTaskService.js`（rehearsal 分支共享合同归一化）。
- `authoringRehearsalDraftSource.js`：routeId/stepIds/prefix/state 指纹/目标冻结。

## 上限三件套（实测）

含两条完整后果的合法样本序列化 931 字符，上界 ≈700 tokens < 现有 max_tokens 1200，**未调 provider 上限**（极端 600 字回应由既有 retry +600 兜底）。`maxOutputChars` 与整份序列化上限统一为 `REHEARSAL_MAX_OUTPUT_CHARS=2400`，客户端 parse 强制执行。三者独立，不互相替代。

## 验证

- `npm run verify:full`：**exit 0**（20/20 files / 200/200 tests 预算顶格合规、Vite、diff、VitePress 全绿）。
- `node scripts/authoring-rehearsal-consequence-matrix.mjs`：**16/16**（归一化反例矩阵、投影幂等、对照矩阵、请求装配、解析、服务端 buildAdvisorResult 贯通端到端、composable 分支账本/needs-review/代次/draftSource/故障旅程、A10 物品/位置）。
- **真实浏览器 Gate（本 worktree 5211 dev 服务 + 新生成的 fixture 13/13）**：
  - `rehearsal-panel-check.mjs`：**304/304**（含 6 个视口；期间发现并修正一处问题文本措辞破坏 Gate 精确断言，见下）；
  - `settings-linkage-check.mjs`：**20/20**。
- 顶格预算说明：核心 vitest 无余量（基线即 200/200），新断言全部落在 scripts/ 显式 eval，符合 testing-verification skill。

## A09 自审发现与处理

- **生产接线确认**：Authoring.vue 的 `useAuthoringRehearsal` 未覆盖 `step`，默认 `requestRehearsalStep` 即生产路径；面板 `advance(buildIntent())` 的姓名意图走唯一命中解析。
- **行为收紧（给 C 注明）**：同名人物现在被明确拦截（此前按姓名集合存在即放行），面板需提供按人（ref）选择；`planRehearsalRequest().participants` 可直接作选择器数据源。
- **Gate 措辞回归**：我把写作规则第 3 条改成「名单之外与未入场的人物…」破坏面板 Gate 的精确子串断言；已改回原文精确措辞，未入场/离场约束由单独提示行与同条后续句承载，未改 C 的 Gate 脚本。
- **零正式写入复核**：新增模块无 storage/worldbook/memory 引用；后果只存在于会话内存。
- **schema 下游**：`agentCapabilityContract.js` rehearsal 行未改动（后果版本在 `result.rehearsal.consequenceVersion` 段内），无下游影响。

## A08 解阻条件与记账

- 需要：`server/.env` 写入 `MINIMAX_API_KEY`（或进程注入）后重启后端；建议在 O 组合树 5210 运行（execution.md §5）。
- 脚本已就绪：三场（同文守门/同文共享对照 + 歧义检查）×两路×两步；wire 层直接记录 `consequences/consequenceStatus/issueKey` 与知情视图，不依赖 C 面板渲染；同文请求自动核对 issueKey 对齐。
- 预算：≤30 attempts，A 单一记账；当前 **0**。
- 限制声明：未声明冻结条件前（C06 入口未接线），真实样本只能验证**承诺**链路（物品/知识需条件入口后的 items/facts 声明）；知识（knowledge）与物品链路已由矩阵做协议级验证。单模型读到作者秘密的越界风险仍只能约束不能证明隔离。

## 给 O/C 的接口（api-ready）

读模型：`rehearsal.routeState`（`{ facts, commitments, enteredRefs, stateFingerprint }`）、`rehearsal.conditions`、`rehearsal.lastRejected`、`rehearsal.compareRoutes(otherId?)`、`rehearsal.createDraftSource()`、`rehearsal.draftSourceIsCurrent(source)`、`rehearsal.freezeConditions({facts:[{text,knowerRefs,unawareRefs}], commitments?})`、`rehearsal.discardRejected()`、`rehearsal.refreshSettings()`。详见 contract-proposal-a.md。

## 2026-09-14 集成闭环与 A08 纠正

- C06 已接入：右栏起点可声明一条本次事实及知情/不知情人物（稳定 ref）；每步“局面变化”显示已验证的结构化后果；走法对照先显示最多三条真正不同的后果；写成试稿使用冻结 `draftSource`，生成与采用前都会复核原路线。
- needs-review 不再只剩重试：原回应就地可读，作者可明确选择“保留回应，不登记后果”或弃掉；降级步骤不写入任何结构化后果，不会静默吞错。
- A08 已真实执行：MiniMax `12/12` 单步请求返回；其中结构化后果 `8/12` 直接通过，`4/12` 因模型从 choices 复制并不存在于 response 的引文而被正确拒绝，均通过显式无后果降级继续。两份真实试稿完成（850/975 字符），第三份两次各等待 300 秒仍未返回。
- 因而 A08 状态改为 **partial**：真实渠道与完整路线可用，严格后果门禁有效；MiniMax 后果遵约率和长流式试稿稳定性仍未达到发布绿灯。原始合成样本保存在本机 `/tmp/pinax-a08-final-20260914/`，未含密钥或真实作品。
- 集成复验：后果矩阵 16/16、右栏 Gate 304/304、`verify:full` 20/20 文件 / 200/200 用例及双 build 全绿。
