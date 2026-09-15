# B 线修复后独立复验与二次修改指导（2026-09-15）

状态：**fix-required（首轮阻断已修；恢复快照的事务落盘仍不成立，当前工作树不可合并）**

首轮已提交复验对象：`arch/gamestore-20260914@fc19801`  
当前二次复验对象：`arch/gamestore-20260914@5e0d12c`  
共同基线：`37e0679`  
`5e0d12c` 已把验收期间出现的 WIP 和本指导首版一起提交；其中空 id 修复和 scheduler
强制落盘可保留，但 `applyRuntimeSnapshot()` 内部提前保存仍须按本指导重做。

## 1. 首轮修复中已经成立的部分

- Node 21+ 只读 `navigator` 不再被直接赋值；故障矩阵在 Node 22.22.3 和
  Node 20.20.2 均能启动并跑完原有 14 项。
- 保存配额失败现在有返回/内存/持久化三元证据：`flushSaveSessions()` 返回 false，
  内存会话保留，storage 未伪写；恢复后可重试。
- API 统计脚本以同一口径比较共同基线和工作树，得到 73 state keys、136 actions，零增删。
- B12 已诚实改为 partial；B13/B14 有实际生产接线，不再只写计划状态。
- 换书时显式取消旧 observer 调度、清理缓冲且保留订阅的方向正确；runtime reset patch
  与旧逐字段赋值从代码审查上等价。

## 2. P0：`applyRuntimeSnapshot()` 的“立即落盘”合同是假的

### 2.1 已提交 HEAD 的问题

`applyRuntimeSnapshot()` 只把投影 patch `Object.assign` 到 Pinia runtime，然后调用
`flushSaveSessions()`。后者只会写 `sessions` 数组；但数组中当前记录的 `runtimeState`
尚未同步，所以写入 storage 的仍是旧快照。

验收期间新增的最小回归路径已经真实打红：

1. 创建并落盘会话，让 writer 进入无 pending 状态；
2. `applyRuntimeSnapshot({ flags: { restored: 'yes' } })`；
3. 从 storage 重新读取当前 session；
4. `runtimeState.flags.restored` 为 `undefined`，不是 `yes`。

这证明原注释“assign 后立即落盘，崩溃/刷新不丢恢复结果”不成立；仅把 scheduler 改为
“无 pending 也强制 setItem”只能写得更勤，不能把未同步的 runtime 写进 session record。

### 2.2 当前未提交尝试也不能接受

当前 WIP 在 `applyRuntimeSnapshot()` 内先调用 `saveCurrentSession()` 再 flush。这样虽然能让
孤立测试落盘，却破坏外层事务原子性：

- `switchBranch()` 尚未更新 `superseded`、`activeBranchId`、`chatHistory` 时先保存；
- `undo-extension` 尚未移除 segment、归档 turn、重建聊天时先保存；
- 生成失败 catch 尚未 `rebuildChatHistory()`、清候选和 pending turn 时先保存；
- `regenerateFrom()` 尚未建立新 sibling branch 时先保存。

于是浏览器在两次保存间退出时，可能得到“目标分支 runtime + 旧分支消息/游标”或“已回滚
runtime + 尚未撤销的正文 segment”这种半事务存档。该尝试最初令 B11 旧对象引用断言退化为
15/16；执行者改为按 id 重读后当前 WIP 是 **16/16**，但新增断言只证明孤立
`applyRuntimeSnapshot()` 能落盘，仍未检查上述外层事务的中间存档，不能据此接受设计。

## 3. 必修设计：投影与事务提交分离

### B-R1：让低层投影只负责内存

`applyRuntimeSnapshot()`（或更清楚的新私有名）只做：

- normalize/project snapshot；
- 一次性更新 Pinia runtime；
- 返回明确 patch/result。

它不应自行保存 session，也不应 flush。删除“它自己保证崩溃安全”的错误注释。

### B-R2：由四个外层事务在最终一致态保存一次

为下面每条生产路径明确最终提交点：

- `switchBranch`：恢复 runtime → 更新消息可见性 → 更新 branch/turn 游标 → 重建
  chatHistory → `saveCurrentSession` → 立即 flush；
- `undo-extension`：恢复 runtime → 移除 segment/事件/turn 影响 → 重建 chatHistory →
  保存并立即 flush；
- generation failure/cancel：恢复 runtime → 移除 placeholder 或恢复扩展正文 → 重建
  chatHistory → 清 pending turn/归档候选 → 写失败状态 → 保存并立即 flush；
- `regenerateFrom`：不要在建立 sibling branch 之前留下中间存档；成功、失败恢复和无 AI
  三条出口各自只有一个一致态提交点。

可以增加一个窄的 `commitCurrentSessionNow()`，内部语义固定为“先用 canonical
`buildCurrentSessionFields` 同步当前 record，再 flush writer”，供这些事务末端复用。
不要让 scheduler 读取 store runtime，也不要把一半事务搬进 scheduler。

### B-R3：保留 scheduler 的真实边界

`flushSessionListWriter()` 可以修成 writer 空闲时仍强制写当前 sessions，并返回 true/false；
但文档必须写清：它只保证“传入的 session 列表耐久化”，不负责把 Pinia runtime 投影进
session record。该投影只由 store 的 canonical session assembler 完成。

## 4. B13 修复方向成立，但测试需要真实化

当前 WIP 把 `noteAuthoringTextCommit()` 改为只有显式非空 `memoryProjectId` 才调用
`setAuthoringProjectId()`，这是正确修复：省略 id 应沿用已激活项目，不能被解释成“切换到空
项目”并取消队列、清缓冲。

保留这项修复，并把矩阵补成两条清晰合同：

- 已激活 book-a 后，不传 id 的正文提交仍归 book-a，既有 pending/trigger 不被清空；
- 显式传 book-b 才取消 book-a 的 pending/in-flight，晚到结果为 stale，book-b 新任务不被
  旧取消误伤。

当前断言 `result.accepted !== false || result.reason !== 'agent-disabled'` 很弱，只排除了一个
特定组合；改为断言预期 accepted/key/project identity 和最终缓冲/settled 结果。

## 5. 修正故障矩阵中的假证据

继续使用同一个 `experience-session-fault-matrix.mjs`，不增加 Vitest 预算，但必须纠正：

1. B14 的
   `storageMap.has('writing_character') || storageMap.size >= 0` 永远为 true。先种下四个全局写作
   key 的哨兵值，runtime reset 前后逐项深比较。
2. B12 测试声明“经生产 action”，但阵营和人物命中实际直接调用 pure function，且留下
   `worldSpy`、`norm`、`void` 占位。要么通过 Pinia worldStore fixture 走生产 action，要么把
   名称诚实改成纯解析等价，不要伪装覆盖。
3. 新增/保留恢复落盘旅程时，不能只直接调用 `applyRuntimeSnapshot()`；至少覆盖：
   - `switchBranch` 后创建 fresh store 重载，核对 branch id、turn cursor、runtime、消息可见性、
     chatHistory 五者一致；
   - `undo-extension` 后 fresh reload，撤销的 segment 和对应 runtime 同时消失；
   - generation failure 或 cancel 选择一条可离线注入的生产路径，fresh reload 后无 placeholder、
     无失败正文、无半提交 runtime。
4. 断言对象不要缓存 `saveCurrentSession()` 归一化前的 message 引用；每次从当前
   `store.messages` 或 fresh store 重新定位，避免测试因旧对象引用产生假失败/假通过。

## 6. 脚本与回执质量修正

- `experience-store-api-surface.mjs` 不要把 argv 直接拼进 shell 命令。改用
  `readFileSync` 读取工作树、`execFileSync('git', ['show', ref + ':' + FILE])` 读取 git ref，
  避免本地脚本命令注入和带特殊字符路径失败。
- `summary.md` 必须写精确最终 SHA；“当前 HEAD 见 git log/以本文件所在提交为准”不是可冻结
  证据。当前已提交复验对象是 `fc19801`，下一轮以新提交替换。
- gameStore 实际为 3,764 行，不写“3,759 左右”；最终提交后重新 `wc -l`。
- “56/56 字段程序化核验”目前没有对应断言，只能写代码级逐字段复核。若保留该说法，就在
  现有矩阵内比较旧字段清单/冻结 fixture 与 patch 的完整键集和值。
- B12 继续标 partial，并保留 `extractCharacterChanges`、`extractActivityEvents` 未迁清单；B9、
  B10 剩余项继续留队列，不因本轮修复冒称整条夜间计划全部完成。

## 7. 本次独立验证证据

在 B worktree 重新执行：

| 对象 | 结果 |
| --- | --- |
| `fc19801`：Node 22.22.3 fault matrix | 原有 14/14，exit 0 |
| `fc19801`：Node 20.20.2 fault matrix | 原有 14/14，exit 0 |
| API surface | 73→73 state；136→136 actions；零增删 |
| focused | `gameStoreSession` + `authoringSceneRail`：2 文件、13/13，exit 0 |
| `fc19801` 的 `npm run verify:full` | exit 0；20/20 文件、200/200 用例、Vite/VitePress build、diff check |
| 验收中未提交 WIP + 新恢复断言 | 先后打红 B3 空闲 writer 与 B11 旧引用；按 id 重读后当前 **16/16，exit 0**，但尚无 fresh reload 外层事务断言 |
| `5e0d12c` 的 `npm run verify:full` | 独立复跑 exit 0；20/20 文件、200/200 用例、Vite/VitePress build、diff check；不代表未覆盖的事务原子性通过 |

因此“首轮修复比原交付更好”成立；当前局部矩阵与 full 虽绿，但事务级持久化合同仍无证据，
“B 线已完成/可合并”仍不成立。

## 8. 二次验收门槛

- 工作树 clean，final summary 写精确 SHA。
- 恢复投影不在外层事务中途自行保存；四条调用路径各只有一个最终一致态提交点。
- fresh-store 旅程证明 branch/runtime/messages/chatHistory/turnRecords 同时一致，不只看内存。
- 空项目 id 不取消旧作用域，显式换项目会取消且旧结果不能晚到污染。
- B14 全局素材断言不再恒真，B12 不再用占位变量冒充生产接线。
- fault matrix 在 Node 20 与 22 同项全绿；focused 和 `verify:full` 在最终 HEAD exit 0。

满足后可标 **merge-candidate with declared partials**：B12 剩余两类、B9 和 B10 剩余清扫可留
下一轮，不阻止本批架构成果合并，但必须继续明确为 partial/not-started。

## 9. 禁止动作

- 不为通过新测试把中间态保存塞回 `applyRuntimeSnapshot()`。
- 不删除 fresh reload 断言或退回只检查内存。
- 不扩测试预算，不新建第二套框架；扩充现有 matrix 即可。
- 不修改 A/C 写集，不 merge、不 push、不改 `server-version`。
