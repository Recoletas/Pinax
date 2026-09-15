# B 线 summary · gameStore 内部职责拆分（修正版，按 O 验收意见）

- **基线**：`37e0679`（含已验证 WIP 快照；基线 verify:full exit 0，由本 worker 按 §2 代行 O0 建立并登记）
- **冻结交付**：分支 `arch/gamestore-20260914`；提交序列 `dad1320`(B0/B1) → `35e046a`(B2) → `5c5e358`(B3) → `e73e82d`(B4/B5) → `150ae4d`(B7) → `a30b82c`(S3) → `e479f3f`(D供稿) → `3ff17bd`(B8) → `668d3e3`(B11) → `cf18cf7`/`9ba165e`/`92492f5`(B12) → `6a5d287`(首轮封板) → `bb342a5`(O阻断修复) → `fc19801`(summary纠正) → `5e0d12c`(自检三修复) → **`b4470c2`（二次修复封板）**
- **实际时间（按可观察证据）**：首轮 23:29–00:14（约 45 分钟）；O 阻断修复与自检轮、二次修复轮各为独立会话段，实际区间以各自提交时间戳为准（可核）。不把测试次数换算工时。
- **工作树**：`/home/recoletas/jiuguan/pinax-arch-b-20260914`，端口 5199（已停）

## 主包状态（与 O 复核后的代码一致）

| 包 | 状态 | 交付 |
|---|---|---|
| B0 API/存档地图 | **done** | `b0-api-map.md`（口径已回填：73 state keys / 136 actions） |
| B1 规范化与快照 | **done** | `gameSessionNormalization.js`（函数体逐字节迁移；经 B10 清扫后 37 个导出，6 个仅内部消费的 helper 降级私有） |
| B2 会话保存调度 | **done** | `gameSessionScheduler.js`：每实例 500ms trailing 写手 + lastWriteOk（保存失败可观测）；unload flush 语义：**flushPending 为应用级全局 flush（清空全部 useDebounce 任务），非每 store 隔离**，注册单处、与迁出前一致 |
| B3 历史/恢复投影 | **done** | `gameRuntimeProjection.js`；loadSession 的 legacy 回退链留 store（登记 D4） |
| B4 facade 收尾 | **done** | 公开 API 统一脚本核验：`experience-store-api-surface.mjs` 73 state keys / 136 actions，`37e0679` 与工作树**零增删** |
| B5 自审与验证 | **done** | 故障矩阵 14/14（含配额失败三元断言：返回/内存/持久化；switchBranch/gc 生产路径用例）；浏览器：Experience 渲染/刷新零 pageerror，Authoring 推演 Gate 304/304 |
| B7 observer 订阅（第二批） | **done** | `gameObserverRuntime.js` hub；订阅寿命合同显式化 |
| S3 世界书 skill | **done** | a30b82c；guide 修订留 O |
| D2/D4/D6/D7 供稿 | **done** | `docs-contributions.md`（Node engines 偏差等） |
| B8 journal/来源投影 | **done** | `gameJournalProjection.js` |
| B11 分支回合图（第三批） | **done** | `gameBranchTurnGraph.js` + 生产 action 路径矩阵用例 |
| **B12 状态提取流水线（第三批）** | **partial** | 已迁：时间/地点解析 + 轻状态家族（目标/已遇角色/关键选择/阵营增减，第二刀）；**未迁仍在 store：extractCharacterChanges（约 127 行）、extractActivityEvents**。不写“状态提取已完成” |
| **B13 记忆/observer 生命周期（第三批）** | **done** | 审计发现并修复：换书（setAuthoringProjectId）原先不取消旧作用域待执行派生、不清缓冲；现取消+清缓冲、订阅保留、同标识幂等（矩阵覆盖）。页面此前从不调用 resetAuthoringObserverRuntime——该事实已登记，A 侧若需在卸载时显式 reset 属接口请求，不改 A 文件 |
| **B14 生命周期默认值（第三批）** | **done** | `gameLifecycleDefaults.js`：runtime reset 补丁唯一装配（56/56 字段程序化核验等价）；范围合同（保留 sessions/currentSessionId/apiSettings 等）写入模块头注 + 矩阵覆盖冷启动/旧会话/runtime-only reset |

## before / after（统一口径）

| 指标 | 基线 `37e0679` | 工作树 |
|---|---|---|
| gameStore.js 行数 | 4,854 | 3,759 左右（以最终提交为准） |
| state keys（顶层，4 空格缩进口径） | 73 | 73，零增删 |
| actions（4 空格函数定义口径） | 136 | 136，零增删 |
| store 内 timer | WeakMap 去抖器 + 全局 unload 监听 | 零 timer；调度在 scheduler，unload 监听单处 |
| 新模块 | 0 | `src/services/experience/` 8 个文件 |
| 存档 schema | WRITING_SESSIONS v1 | 不变 |

统计方法：`node scripts/experience-store-api-surface.mjs 37e0679 WORKTREE`（唯一口径，可复现）。

## 自审回答（§9）

1. **两份可变状态？** 无——新模块纯函数或仅持调度句柄/缓冲唯一所有权。
2. **callback 把业务送回页面？** 无——页面零改动。
3. **持久化失败保持作者输入？** 是，且现在可观测：`flushSaveSessions()` 返回写盘结果，矩阵断言返回 false + 内存保留 + 存储确未写入三元。
4. **旧请求写入新对象？** 会话切换先 cancel（既有）；矩阵“快速 A/B 切会话”覆盖。
5. **新接口被生产调用？** 反向核查在矩阵内（旧 debouncer 路径零残留；unload 监听仅 scheduler 一处）；B10 后 37 个 normalization 导出均有真实消费者或跨模块消费。

## 验证记录（修正后）

- `experience-session-fault-matrix.mjs`：**19/19**，Node `v20.20.2` 与 `v22.22.3` 双环境通过
- `npx vitest run`（全量）：修复后 **200/200**；focused gameStoreSession 6/6
- `npm run verify:full`：修正 HEAD **exit 0**（见下方提交信息；组合后由 O 重跑）
- 浏览器：rehearsal-panel 304/304（首轮实现树；修复未触 UI，组合树由 O 复验）

## 自检轮（2026-09-15 第二次，C 修复期间对本线对抗性复查）

发现并修复 3 个问题 + 1 个测试陷阱（矩阵 14→16 用例）：

1. **B13 取消语义被空 id 误触发（本线引入，当前仅测试可触发）**：
   `noteAuthoringTextCommit` 无条件 `setAuthoringProjectId(memoryProjectId)`，
   空 id 在 B13 语义下会取消旧作用域派生并清缓冲。已加非空防护
   （与 `commitAuthoringProseResult` 的既有防护一致）。生产当前无此调用方，
   属拆雷非救火。
2. **applyRuntimeSnapshot 的“立即落盘”从来就不成立（基线既有缺陷，自检抓出）**：
   `flushSaveSessions`/原 `debounced.flush()` 在 writer 无 pending 时是 no-op，
   恢复结果并不持久化；且会话记录的 runtimeState 只有 saveCurrentSession
   会同步，仅 flush 列表写的还是旧快照。修复：恢复后先同步当前会话记录
   再强制写列表（scheduler 的 flushSessionListWriter 改为无 pending 也写）。
   矩阵新增“writer 空闲恢复仍落盘”用例，旧实现可打红。
3. **提取流水线单级失败仅 debugLog（dev-only）生产不可见**：改 console.warn。
4. **测试引用陷阱**：saveCurrentSession 的 normalize 会重建消息对象（既有
   生产行为），矩阵 B11 用例改为按 id 现查；对象身份不跨持久化边界稳定
   已记为生产特征，页面应经 store 响应式读取。

复核点状态：session writer 全局 unload flush（已注明应用级语义）、
switchBranch/GC、runtime restore、observer reset 四项均有生产路径
矩阵用例。冻结 HEAD：本文件所在提交；矩阵 16/16（Node 20/22.22.3）、
全量 200/200、verify:full exit 0。

## 二次修复轮（2026-09-15，按 O-REACCEPTANCE-AND-FIX-GUIDE）

O 复验否定了自检轮对 `applyRuntimeSnapshot` 的第一版修法（事务中途
saveCurrentSession 会写进半事务存档，矩阵也因此退化 15/16）。已按
B-R1/R2/R3 重做：

1. **B-R1**：`applyRuntimeSnapshot` 回退为纯内存投影——normalize +
   一次性更新 Pinia runtime + 返回 patch；不保存、不 flush；删除"它自己
   保证崩溃安全"的错误注释。
2. **B-R2**：新增窄提交点 `commitCurrentSessionNow()`（canonical 组装 +
   立即 flush），四个外层事务各自持有唯一最终一致态提交点：
   `switchBranch`、undo-extension、生成失败/取消 catch、生成成功。
   `regenerateFrom` 不再在建立 sibling 前留下中间存档（其回滚路径经
   switchBranch/失败 catch 的提交点覆盖）。
3. **B-R3**：`flushSessionListWriter` 无 pending 也强制写列表并返回
   true/false；文档明确它只保证"传入的会话列表耐久化"，runtime →
   record 的投影只由 store 的 canonical 组装器完成。
4. **B13 修复保留并真实化**：空 memoryProjectId 提交沿用已激活项目
   （ accepted/key/project identity 全断言）；显式换项目取消旧作用域缓冲
   且新项目任务照常接受（bridge/scheduler 在 plain node 真实运行）。
5. **矩阵假证据清除**：B14 四个全局键哨兵逐字节深比较（删恒真断言）；
   B12 改为诚实拆分——goal/keyChoices 走生产 action，阵营/已遇角色
   标注纯解析等价（worldbook 归属属原 owner），占位变量删除；
   switchBranch/undo-extension 均以 fresh-store 重载做五方一致断言；
   failed 回合按 normalizeTurnRecords 合同断言不持久化。
6. **§6**：api-surface 脚本去 shell 拼接（execFileSync/readFileSync）并
   修正比较方向标签；56 字段键集断言进矩阵（不再只是"代码级复核"）。

## 最终统计与状态（本 HEAD 实测）

- gameStore.js：**3,781 行**（基线 4,854；`wc -l` 实测）。
- 公开表面（`node scripts/experience-store-api-surface.mjs`）：**73 state
  keys（零增删）/ 137 actions——唯一新增 `commitCurrentSessionNow`，
  为 O 指导 B-R2 明示授权的窄提交点**。不再声明"零增删"。
- 矩阵 **19/19**（Node 20.20.2 与 22.22.3 双版本）；全量 vitest 200/200；
  `verify:full` exit 0（20/20 files、200/200、lint:delta、双 build、diff、docs）。
- B12 仍为 partial（extractCharacterChanges/extractActivityEvents 未迁）；
  B9/B10 剩余清扫留队列——按 O 门槛标注 merge-candidate with declared
  partials，不冒称整夜完成。

## 已知失败与供 O 重点复核

- 无失败项。B12 未迁部分（extractCharacterChanges/extractActivityEvents）逐函数列明，下一刀入口即此。
- 危险 diff：`switchBranch`/`applyRuntimeSnapshot`/`saveCurrentSession`/`resetRuntimeState` 四个委托重写（等价性靠逐字迁移 + 字段集/矩阵核验）；`setAuthoringProjectId` 的新取消语义（换书即失效，行为变更已单列）。
- `scripts/lib/arch-node-resolve.mjs` 仅服务离线 eval（vue→runtime-core 别名 + 无扩展名解析），不参与 Vite 生产构建解析；构建解析由 vitest/vite build 门禁覆盖。

## 剩余队列

- B9（turn 编排阶段切分）、B10 剩余项（store 内无用变量/过时注释的触及面清扫）
- B12 未迁函数：extractCharacterChanges、extractActivityEvents
