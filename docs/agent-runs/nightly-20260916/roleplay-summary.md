# C 线晨间回执：跑团闭环（nightly-20260916）

> 完成标签（互相不替代）：**计划完成**（任务书原有）；**已实施** ✓（本回执所述代码真实存在）；**分线验证** ✓（本回执命令与浏览器证据）；**组合验证** ✗（未合并 main，O 未复验）；**真实模型通过** ✗（未运行）；**用户确认** ✗（未试玩）。

## 1. 基线与最终 SHA

- 基线：`main@b5b2b56`（= `origin/main`，含三线任务书的提交；干净树，无未提交 WIP 混入）。
- 分支：`night/roleplay-20260916`；worktree：`/home/recoletas/jiuguan/night-rpg-c-20260916`。
- 最终提交：本分支 tip 的唯一功能提交 `feat(experience): add opt-in 2d6 roleplay loop with durable dice receipts`（27 文件 +2919/−8；amend 后哈希以 `git rev-parse HEAD` 为准，撰写时为 `9b68cbc`）。未 push、未合并 main、未触碰 `server-version` 与 C2。
- 并行线状态：A 线（记忆账本）已由另一 session 完成——`night/memory-20260916@bd1569b+aa17b47`（同基线 `b5b2b56`，未合并）；B 线（漫画）未启动。合并顺序按总计划 §8：共享合同 → A 账本 → C → B。
- 上游冻结：`yuanbw2025/storyforge@cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed`（任务书指定，未跟最新）。

## 2. 实际完成的 R 编号

- **完成**：R00–R12、R14–R23、R25（单线内可做的部分）、R26、R28、R29。
- **partial**：
  - R13（键盘/reduced-motion）：Escape/Enter 在确认面板与模式条内为受控行为；完整 IME/reduced-motion 矩阵未跑（实体设备门禁，沿用仓库惯例标外部门禁）。
  - R27（真实模型小矩阵）：未运行（见 §8）。
- **偏差说明**：任务书写集里的 `src/composables/useExperienceRoleplayWorkflow.js` 在实现中收敛为 `src/components/experience/roleplay/RoleplayWorkspaceBar.vue`（单挂载点），原因：Experience.vue 有 3550 行架构硬预算（详见 §6），独立 composable 会超行/导入预算且无第二个消费者；薄协调逻辑并入组件与 service 层，页面不再持有跑团状态。

## 3. 未完成 / blocked 清单（含原因）

| 项 | 状态 | 原因 |
|---|---|---|
| V17/V15 真实模型矛盾/429 样本 | blocked-external | 无用户授权渠道/预算；未调用任何付费 API |
| O-G07/O-G08/O-G09（A 账本接线、组合幂等） | blocked-on-O | A 线分支（`night/memory-20260916`）已具备 `appendCommittedTurnReceipt` 接口但未与本分支合并；C 侧注入点 `installRoleplayHistoryPort({ read, record })` 就绪，O 合并后桥接即可，C 域无需再改。端口不可用时如实显示"历史归档待重试" |
| O-G13/O-G14/V36（全域 ZIP 含 roleplay 域） | blocked-on-O | K4 统一 ZIP 由 O 接；`roleplay` 字段随会话记录天然入包，但恢复校验/补偿未单独验收 |
| V04 双书双世界 UI 旅程、V21 提交写盘失败、V33 长文回读、V34 IME、V35 跨标签 | not-run | 分线窗口内未构造对应旅程；均不依赖未交付接缝，留待组合验证 |
| V19 删除会话、V30 收藏素材 | not-run | 按设计复用现有 owner（状态随会话记录删除；收藏走既有 collectWriting），无新写路径，未另建断言 |

## 4. 文件列表

**C 独占新增（域逻辑与 UI）**
- `src/services/experience/roleplay/third-party/storyforgeDice.js`（移植，见 §5）
- `src/services/experience/roleplay/roleplayRules.js`（原创轻规则：2d6，10+/7–9/6-）
- `src/services/experience/roleplay/roleplayActionContract.js`（envelope/校验/幂等/状态机）
- `src/services/experience/roleplay/roleplayState.js`（会话级状态归一化 + 热窗口上限：pending 6/receipts 200/outbox 50）
- `src/services/experience/roleplay/roleplayProjection.js`（检定行投影/ScopeRef/TurnReceiptV1/叙述约束）
- `src/services/experience/roleplay/roleplayHistoryAdapter.js`（A 线只读端口 + 归档 outbox + drain）
- `src/services/experience/roleplay/roleplayWorkflow.js`（确认→一次性结算→durable→叙述编排；coordinator 回调）
- `src/components/experience/roleplay/RoleplayModeBar.vue`、`RoleplayConfirmPanel.vue`、`RoleplayCheckRow.vue`、`RoleplayPendingBar.vue`、`RoleplayWorkspaceBar.vue`
- `scripts/fixtures/roleplay/roleplay-scenes.fixture.json`（原创三场景：成功/代价/失败前进）
- `scripts/experience-roleplay-eval.mjs`、`scripts/experience-roleplay-smoke.mjs`

**共享文件窄补丁（O 复核点）**
- `src/stores/gameStore.js`：state 字段 `roleplaySession`、loadSession 恢复、saveCurrentSession 透传、sendAction 入口 `assertRoleplaySendAllowed` 门禁、`roleplayActionId` 透传 generateAIResponse（1 条 import，行/导入预算顶格内）
- `src/services/experience/gameSessionScheduler.js`：`buildCurrentSessionFields` 增加 `roleplay` 字段（同一次 durable 写入）
- `src/services/experience/experienceTurnCoordinator.js`：叙述绑定（provider 前）→ kernel 约束注入（authorNote 通道）→ committed 后落账（统一落盘前）→ 失败保持 resolved
- `src/services/experience/gameLifecycleDefaults.js`：runtime reset 归零 `roleplaySession`
- `src/components/GamePanel.vue`：user 消息上渲染 `<RoleplayCheckRow>`（3 行）
- `src/components/InputArea.vue`：骰子开关 + `<RoleplayConfirmPanel>` + pending 阻断发送（placeholder 改动态绑定，默认文案不变）
- `src/pages/Experience.vue`：`<RoleplayWorkspaceBar />` 单挂载点（1 组件 1 import，行数预算 3550/3550 顶格）
- `src/composables/useExperienceSessionWorkflow.js`：V03 修复——显式 sessionId 不存在且无显式世界书时停住开选择器，不再静默回退全库最近会话
- `src/__tests__/uiControlContract.test.js`：placeholder 断言随动态绑定做最小放宽（O 复核点）

**未触碰**：memory/history 数据库、漫画域、C2 协议/服务、server-version、根许可证、package.json/lock（零新依赖）。

## 5. 上游复用与许可清单

| 项 | 性质 | 来源 |
|---|---|---|
| `storyforgeDice.js` | **代码移植**（MIT） | `src/lib/ttrpg/dice.ts` @ `cd1236cf…`；原版权 `Copyright (c) 2026 yuanbw2025`，MIT 声明保留在文件头。修改：去 TS 类型与 type barrel、去掉 `sampleTtrpgDiceWithSha256V2`（crypto.subtle 变体，未引入）；闭合骰式语法/范围校验/uint32 拒绝采样/trace 结构原样保留 |
| 2d6 三档规则（10+/7–9/6-） | **机制借鉴**（规则思想，非文本复制） | 上游 `storyforge-rule-pack.ts` 证明该分档；`roleplayRules.js` 全部文案为本仓库原创，未复制其规则正文/属性资源系统/任何第三方规则媒体 |
| coordinator/检查点/恢复设计 | **设计参考** | `runtime-commands.ts`（commandId 幂等）、`kp-coordinator.ts`（有界主持——本夜未实现 AI KP）；未复制任何 React/DB 代码 |

- 未复制：上游样例漫画/模组/角色媒体、SRD 5.2.1 路径下任何内容、React 组件、数据库 schema。
- 许可边界：本仓库根许可证未改动；`THIRD_PARTY_NOTICES` 登记归 O（交接项：为 `storyforgeDice.js` 补一条 MIT 条目）。
- RNG 不经模型、不用 `eval`；本地可复现骰点不宣传为远程防作弊。

## 6. 精确命令与 exit code

```
node scripts/experience-roleplay-eval.mjs     → exit 0（74 passed / 0 failed）
node scripts/experience-roleplay-smoke.mjs    → exit 0（20 passed / 0 failed；自带 vite :5199 隔离实例）
npm run verify:full                           → exit 0
  ├─ vitest: 20/20 files / 200/200 tests（预算顶格未超）
  ├─ lint-delta: 无新增 error/warning（基线 0）
  ├─ vite build ✓ / git diff --check ✓ / vitepress build ✓
  └─ architecture:check ✓（Experience.vue 3550/3550 行、22/28 imports；gameStore 1656 行、30/30 imports——均顶格，O 合并时注意预算余量为零）
```

架构预算说明：为满足 Experience.vue 3550 行/gameStore 30 imports 顶格预算，做了两次收敛（挂载点合并为 `RoleplayWorkspaceBar`；gameStore 的 roleplay 导入合并为一条并经 `roleplayWorkflow` 再导出）。

## 7. 36 项离线矩阵状态

- **passed（26）**：V01、V02、V03、V05、V06、V07、V08、V09、V10、V11、V12、V13、V14、V18、V20、V22、V25、V26、V29、V31、V32（1440/900/390/暗色+无横向溢出）为自动化断言；V15、V16 为 store 级断言 + 浏览器真实失败路径（空 key 报错后 pending/骰点保持）；V23/V27/V28 为投影白名单/作用域守卫级断言（见 partial 说明）。
- **partial（5）**：V15/V16（真实 429/超时未测，属真实模型门禁）、V23（分支切换 UI 旅程未跑，分支归属逻辑已测）、V27/V28（单人无 GM 秘密字段，全量信息边界属后续）、V34（输入法实体设备门禁）。
- **not-run（5）**：V04、V19、V21、V30、V33、V35（见 §3）。
- **blocked-on-O（V36 及组合项）**：全域 ZIP/账本接线。

## 8. 真实模型门禁

**未运行。** 本轮没有授权渠道/预算输入，未调用任何付费 API（符合任务书 §11：请求执行不等于授权费用）。门禁保持外部：12 次最小样本方案（3 场景 × 2 档 × 2 延续）与硬门禁（结果反转 0/代答 0/泄密 0）已在任务书，待用户授权后执行。

## 9. 旧数据兼容与回滚证据

- 旧会话无 `roleplay` 字段 → `normalizeRoleplaySessionState(null) === null` → 自由叙事，无迁移弹窗（eval V02/R23 断言；smoke 夹具会话真实 loadSession 往返）。
- 非法/未来版本 `roleplay` 字段 → 归一化为 null，不阻塞会话加载（eval R23）。
- 新增数据只有两处：会话记录的 `roleplay` 字段、消息上的 `roleplayCheck` 投影（消息归一化保留未知字段）。回滚 = 关闭新入口（不挂载组件/不启用模式），旧会话仍可读、可导出；无 schema 破坏性迁移，无数据删除。
- 回滚演练五样本（已结算未叙述/已提交/双分支/归档失败/备份恢复）中，前四者在 eval/smoke 有等价断言；备份恢复样本属 O 的 ZIP 窗口。

## 10. 用户 15 分钟试玩路线

1. 打开 `→ 体验`，模式条选「轻规则 2d6」，输入本场目标（如：查明灯塔看守失踪的真相）。
2. 输入一条行动（例：凑近炉火，辨认值班日志最后一页的字迹）→ 点输入框右侧骰子图标 → 选属性/调修正 → 看规则明文 → 「确认检定」。
3. 观察骰点条（已结算、等待回应）与叙事回应；骰点行在玩家条目上方，明细可折叠。
4. 故意制造失败：设置里清空 API Key 或断网后再确认一次检定 → 出现「已检定、等待回应」条 → 刷新页面 → 骰点不变；「再次请求回应」不重掷；「放弃本次」清掉。
5. 回归确认：把模式切回/保持自由叙事的旧会话，行为与之前完全一致。
6. 视觉待确认点：确认面板密度、检定行三档配色（橄榄/金/玫红）、模式条常驻是否合适。

截图（`/tmp/pinax-rpg-c-20260916/`，隔离 profile 非私稿）：`01-mode-bar-1440-light`、`02-confirm-panel-1440-light`、`03-pending-after-fail-1440-light`（含错误态）、`04-check-row-1440-light`（含归档待重试与明细展开）、`05-confirm-900-light`、`06-confirm-390-light`、`07-confirm-1440-dark`。全部已人工查看。

## 11. 给 O 的交接清单

1. `appendCommittedTurnReceipt`（A 分支已交付、待合并）：与 `installRoleplayHistoryPort({ read, record })` 对接（`roleplayHistoryAdapter.js` 唯一接缝），outbox 自动 drain，无需改 C 域其他文件。
2. ZIP（K4）：`roleplay` 字段随会话记录走既有 sessions 域；如需独立域声明，归一化函数可直接复用。
3. 共享补丁复核点：gameStore/gameSessionScheduler/coordinator/lifecycle 五处窄补丁 + `uiControlContract.test.js` 断言放宽 + useExperienceSessionWorkflow 的 V03 行为变更（显式失效存档不再回退最近会话——该行为变更影响所有入口，建议 O 独立复验）。
4. 架构预算余量为零（Experience.vue 行数、gameStore imports），后续任何一方再动这两个文件需先协商。
