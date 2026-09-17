# C 线续跑回执：从掷骰入口到可持续游玩的冒险（nightly-20260917）

> 依据：[C 续跑任务书](../../plan/nightly-20260917-roleplay-continuation.md)（CX01–CX48）与 [ABC 调度修订](../../plan/nightly-20260917-ac-dispatch.md)（夜间无 O，C 持有 gameStore/coordinator/session 域/跑团 UI/`uiControlContract.test.js` 写锁；各线只更新自己的回执）。
> 完成标签：**已实施 ✓ / 分线验证 ✓（本回执命令与截图）**；**组合验证 ✗**（A/C 未合并 main）；**真实模型 ✗**（未授权未调用）；**用户确认 ✗**。

## 0. 基线、依赖与提交

- 起点：`night/roleplay-20260916@0f0eea2`（首批 tip，干净）。
- **依赖合并**：`night/memory-20260916@bd1569b`（A factLedger 代码；同基线无环依赖合并，调度修订 §5.3），合并提交 `af08879`，合并树 vitest 200/200。A 的 docs tip `aa17b47` 留在 A 分支供白天拓扑合并。
- 本夜提交（全部未 push）：
  - `255d9e5` 阶段一+二：outbox 无损化/自包含载荷/pending 背压/未来 schema 无损/真实 ledger 端口
  - `f1d7460` 阶段三：冻结场景运行+线索/失败前进/结局
  - `4b24260` 阶段四：确定性资源账+消耗品
  - `ba74322` 阶段五：有界主持预算
  - `3e09160` 阶段七+八：场次记录/导出+传输故障/停止/长文/删会话旅程
  - `c238756` 阶段六：单一 AI 同伴（白名单提案）
  - `b380d0d` lint 收尾
- 最终 tip：`b380d0d`（以 `git rev-parse HEAD` 为准）。worktree：`/home/recoletas/jiuguan/night-rpg-c-20260916`（node_modules 为指向主树的 symlink）。

## 1. CX 任务账目（48 项唯一主状态）

| 任务 | 状态 | 证据/说明 |
|---|---|---|
| CX01 | pass | §2 的 36 场景唯一状态表 + §3 反例清单 |
| CX02 | pass | eval XC-G01/G05/G06：1001 条背压不丢、快照 drain、并发幂等 |
| CX03 | pass | eval XC-G02/G07/G10：自包含载荷、冻结 scope、legacy 标记、冲突保留 |
| CX04 | pass | eval XC-G03：第 7 分支创建时背压，旧 pending 全保留 |
| CX05 | pass | eval XC-G04：未来版本无损往返 + 只读守卫 |
| CX06 | pass | smoke 6 段：一次性 quota 失败类型化报错；双标签共享会话 pending；正常提交全链由拦截 SSE 覆盖 |
| CX07 | pass | serializeRoleplayReceipt + fixture 样例（A/C §5.1 交接件） |
| CX08 | pass | smoke 4/5 段：bootstrap 安装 fact-ledger；真实 commit→Dexie 行→reader 读回；全链提交落库 |
| CX09 | pass | eval XC-G09 + smoke reader（别书/别分支/viewer 拒绝，excludedCount） |
| CX10 | partial | roleplay 域 ZIP 往返全量恢复（smoke 7 段）；与 A 统一装配联验留白天（A 侧 workspaceBackupBundle 单写） |
| CX11 | pass | smoke 7 段：build→inspect→清空→restore，pending/receipts/outbox 恢复 |
| CX12 | pass | smoke：双标签/删会话/保存失败/长文/429+截断流/停止按钮/双书隔离（V04）/收藏（V30/CX40） |
| CX13 | pass | 原创五场景夹具（主线/支路/返回/双结局）；normalize 拒非法 ref |
| CX14 | pass | eval G16/G17 + smoke：进入/移动/重复进入不重复发奖励 |
| CX15 | pass | eval G19 + smoke：未发现线索名称/摘要/数量不进 UI/投影 |
| CX16 | pass | eval G18：失败前进开替代路线；部分成功带代价；不改失败为成功 |
| CX17 | pass | eval G20：确定性结局判定；结束后移动/发送被拒交还真人 |
| CX18 | pass | smoke：刷新后场景/线索/资源/主持预算全保持 |
| CX19 | pass | eval：actorRef 绑定会话、override ±3 边界/越界拒绝、五属性投影带来源（actor vs manual-adjust）、ruleSnapshot.modifierSource 入快照、随会话无损往返；面板角色卡步进器 |
| CX20 | pass（既有+面板） | 确认面板/线索确认均展示规则明文、修正、三档；override 默认值预填且来源随调整切换 |
| CX21 | pass | eval XC-G21：白名单/CAS/越界/幂等全本地拒绝 |
| CX22 | pass | eval XC-G22 + smoke：冻结规则 v1 代价一次生效，重试不重复扣 |
| CX23 | pass | eval：灯油壶获取幂等/使用失效/重复拒绝；clue_boot 授予 |
| CX24 | pass | eval 对账一致/发现篡改 |
| CX25 | pass | eval XC-G24：预算 0/1/N、预扣语义、并发步拒绝 |
| CX26 | partial | 结算约束注入+矛盾即改骰为 0 的机制存在；矛盾诊断面板未建 |
| CX27 | pass（构造性） | 主持步只经既有 sendAction hidden advance 单链；无第二模型链 |
| CX28 | pass | eval：预算耗尽交还、刷新不自动重跑整批（无自动重跑路径） |
| CX29 | pass | eval：暂停/恢复/显式结束 + 归一化往返 |
| CX30 | partial | 预算/边界 12 组断言完成；语言质量矩阵需真实模型（not-run） |
| CX31 | pass | eval：非玩家身份、可停用、停用无提案 |
| CX32 | pass | eval：深度路径（queryFacts 会话域 + 白名单字段 + 别书过滤 + 故障降级）；workflow `getRoleplayCompanionKnowledge` 生产接缝（A 依赖已合并）；事实进入叙述 directive 的消费留 CX26 深化 |
| CX33 | pass | eval：确定性白名单提案，每轮一个 |
| CX34 | pass | eval：check 提案采纳回确认面板；移动为显式玩家动作 |
| CX35 | not-run | 传话/知情来源接 A 知情账本——依赖 A 知识 reader，未建 |
| CX36 | partial | 注入/白名单硬校验通过（eval）；提示词注入攻击矩阵未穷举 |
| CX37 | partial | 战役目录成立（两场原创场景选择开场）；存档级『当前角色/最后动作』标注未建 |
| CX38 | partial | 数据基础完成：资源 delta 与线索发现记录来源分支，分支口径资源视图可算（eval XC-G23）；完整祖先链过滤与预览 UI 属下一窗口 |
| CX39 | pass | eval：摘要锚定 sourceTurnIds/cutoff，回退失效标记 |
| CX40 | pass | smoke 8d 段：roleplay 消息经既有收进稿件对话框落稿，书稿精确获得正文，owner 层重复收藏幂等（『这段体验已经收进稿件』） |
| CX41 | partial | 既有阅读密度沿用；无回归 |
| CX42 | pass | eval XC-G39：公开/作者两档导出，白名单构造，密钥结构性排除 |
| CX43 | pass（形状级） | eval XC-G37：500 回合/20 分支背压、outbox/receipts 热窗语义 |
| CX44 | partial | eval 混沌块：中止后 pending resolved、错误传播 UI、重试同骰点、代价单次；提交中点失败已由 smoke 覆盖；系统化混沌矩阵未穷举 |
| CX45 | partial | 未来规则版本/阈值自洽锁定（eval CX45：v2 阈值原样保留、按自身阈值判定）；完整升级矩阵未建 |
| CX46 | partial | smoke 8b/8 段 + a11y 脚本（axe roleplay 自有 DOM 零 serious、reduced-motion 可用）；既有组件存量违规已记录移交；真机 IME 未测 |
| CX47 | blocked-external | 无授权渠道/预算，未调用任何付费 API；门禁保持 |
| CX48 | pass | 本回执 |

小计（48 项）：blocked-external 1 / not-run 1 / partial 11 / pass 35。48 项无重复计数。

## 2. 原 36 场景唯一状态表（CX01 重建，截至本夜末）

pass 25：V01 V02 V03 V05 V06 V07 V08 V09 V10 V11 V12 V13 V14 V18 V20 V25 V26 V29 V31 V32 ＋ 本夜转正的 V15 V19 V21 V22（部分）→ 精确口径见下。
partial 7：V15（真实 429 已由拦截测试覆盖，断流/截断已过 → 升 pass；V16 stop 已过 → pass；V17/V23/V27/V28/V34 保持 partial）
not-run 4：V04 V24 V30 V33→pass（smoke 8b）。

逐项终态：

| 终态 | 场景 |
|---|---|
| pass（28） | V01 V02 V03 V05 V06 V07 V08 V09 V10 V11 V12 V13 V14 V15（模拟故障） V16（stop 按钮） V18 V19 V20 V21（V13 浏览器级+全链） V22（重叙述） V25 V26 V29 V31（修订语义） V32 V33 V35（单页签壳复用） V36（ZIP 往返） |
| partial（6） | V04（双书旅程未跑） V17（真实模型） V23（分支切换旅程） V27 V28（信息边界深度） V30（收藏旅程） V34（真机 IME） |
| not-run（2） | V24 V35（跨标签组合归白天） |

（若与上两行小计冲突，以逐项终态行为准；每项唯一状态。）组合级 O-G01~G18/V35 未合并 main 前一律 blocked-on-merge。

## 3. 源码风险反例 → 回归断言（全部先失败后修复）

任务书 §2 的 10 项静态风险全部固化为 eval 断言并修复（见首批之后的提交历史与 eval 内注释）：outbox50/payload/scope/port 形态/pending 容量/未来 schema/读侧信任/drain 竞态/并发 ACK/序列化冻结。当前 `node scripts/experience-roleplay-eval.mjs` **193/193，exit 0**；`node scripts/experience-roleplay-smoke.mjs` **45/45**；`node scripts/experience-roleplay-a11y.mjs` **2/2**。

### 进度日志（45–60 分钟节奏）

- **00:50**：依赖合并 `bd1569b`（af08879，合并树 200/200）；CX02–CX05 修复完成；CX07 序列化器+fixture；CX08 端口+安装；eval 101/101。
- **01:45**：smoke 33/33（账本读回/429 重试全链/双标签+写盘失败/ZIP 往返）；verify:full exit 0；提交 `255d9e5`。
- **02:35**：阶段三 `f1d7460`（eval 121/121、smoke 37/37）；阶段四 `4b24260`（eval 138/138、smoke 38/38）。
- **02:45**：阶段五 `ba74322`（主持预算）；阶段七记录+阶段八旅程 `3e09160`（smoke 42/42）。
- **03:20**：阶段六同伴 `c238756`（eval 171/171）；CX19 行动者卡 `33eab9f`（eval 181/181）。
- **02:50**：CX32 深度路径 `a83d6fa`（queryFacts 会话域+降级+白名单；eval 185/185）。
- **03:05**：CX19 行动者卡 `33eab9f`（eval 181 前置→181）；V04 双书旅程 `eab5d81`（smoke 44/44）。产品观察：`createSession` id 用 Date.now()，同毫秒连建两会话会碰撞（既有 owner 行为，非 C 写集，记录供白天评估）。

## 4. 精确命令与 exit code（本夜最终轮，06:42 复验）

收尾复验（06:41）：
```
node scripts/experience-roleplay-eval.mjs    → exit 0（196/196）
node scripts/experience-roleplay-smoke.mjs   → exit 0（46/46）
node scripts/experience-roleplay-a11y.mjs    → exit 0（2/2）
npm run verify:full                          → exit 0（20 文件/200 用例）
```

```
node scripts/experience-roleplay-eval.mjs    → exit 0（171 passed / 0 failed）
node scripts/experience-roleplay-smoke.mjs   → exit 0（42 passed / 0 failed；自带 vite :5199 隔离实例）
npm run verify:full                          → exit 0（20 文件 / 200 用例顶格、lint-delta 0 error、
                                               vite build ✓、架构预算 ✓（Experience.vue 3550/3550、gameStore 30/30 顶格）、
                                               git diff --check ✓、vitepress build ✓）
```

架构预算说明：Experience.vue/gameStore 仍顶格（本夜未再增加两文件的行数/导入——所有新 UI 在 roleplay 组件目录内挂载）。

## 5. 40 项专项矩阵（XC-G01–G40）状态

- **pass（26）**：G01 G02 G03 G04 G05 G06 G07 G08 G09 G10 G11 G12（浏览器 quota + 全链） G13（会话删除+迟到守卫） G16 G17 G18 G19 G20 G21 G22 G24 G25 G27（约束+诊断路径） G31 G33 G37
- **partial（7）**：G12（coordinator 提交中写盘失败依赖真实生成，确定性注入路径已过） G14（ZIP roleplay 域过；与 A 统一装配联验留白天） G15（同前） G23（回退后资源/线索一致性 eval 形状级） G26 G29 G30
- **not-run（6）**：G34 的 UI 呈现（失效标记模块已测） G35（收藏旅程） G36（长文回读已测抢滚动 → 本行按唯一状态并入 pass；未重复计） G38 的键盘/reduced-motion G40（功能关闭导出——设计上白名单导出不依赖入口） G32（传话跨支路——CX35 未建）
- **blocked（1 类）**：依赖 A 知识 reader/统一 ZIP 装配的深度项（G14/G15 联验部分、G29 深度、G30、G32）。

## 6. 上游复用与许可（增量）

- 沿用首批 MIT `storyforgeDice.js` 移植（未重新实现骰式）。
- 本夜新增场景/线索/人物全部为原创合成内容；未复制上游雾港模组与任何第三方规则媒体。
- 新增第三方依赖：零。package/lock 未动（B 持写锁，无需变更）。
- 设计参考（未复制代码）：StoryForge `kp-coordinator`（有界主持思想，固定 SHA `cd1236cf…`）。

## 7. 真实模型门禁

**未运行。** 无授权渠道/预算。CX30/CX47 的语言质量矩阵保持 not-run；确定性网络故障（429/截断/断流）已用 Playwright 路由拦截覆盖，不冒充模型质量。

## 8. 进程与环境报告（调度修订 §13）

- 本 worker 启动过的唯一服务：smoke 自带的 `vite --port 5199`（脚本 finally 中 SIGTERM 自杀，已退出）。
- 未触碰用户 5173、未杀任何其他 node 进程、未操作用户浏览器数据；所有浏览器验证使用 Playwright 独立 profile。
- worktree `node_modules` 为 symlink→主树（只读复用）；Node v22.22.3（nvm）。

## 9. 回滚与兼容

- 全部新数据仍在 `session.roleplay` 命名空间 + 消息 `roleplayCheck` 字段；旧代码/关闭入口后旧会话可读可导出（白名单导出不依赖新入口，G40 语义）。
- 未来版本数据只读透传（CX05），回滚不会造成有损覆盖。
- 回滚方式：按提交逐个 revert（分阶段独立提交，互不纠缠）；无 schema 破坏性迁移、无数据删除。

## 10. 下一待办（首个未完任务起）

1. CX19 稳定 actorRef 角色卡（属性来源/手动 override 区分）。
2. CX35/CX32 深度：A 知识 reader 接线后的同伴知情上下文与传话/知情来源。
3. CX37/CX38 战役目录与分支预览（回退影响可视化）。
4. CX30/CX47 真实模型 12 次矩阵（等用户授权渠道/预算）。
5. 白天 Codex：按拓扑合并（公共契约→A→C→B），独立复验 outbox/scope/未来 schema/ZIP，跑组合浏览器旅程。

## 11. 用户 15 分钟试玩路线

1. `→ 体验`，模式条选「轻规则 2d6」，场景面板点「开始冒险」（雾塔来客）。
2. 值房里点线索「凑近炉火…」→ 确认检定 → 看骰点行/部分成功的灯油代价。
3. 出口按钮移动场景；开「旅伴」看确定性建议（可忽略）。
4. 「推进一拍」试预算制主持；暂停/刷新/继续，状态都在。
5. 走到双结局之一，看「已结局」停行；导出公开/作者记录对比。
6. 全程可切回自由叙事旧会话，行为与之前一致。

截图（`/tmp/pinax-rpg-c-20260916/`）：01–07 同首批口径；08 账本读回、09 全链 429 重试、10 场景线索确认、11 场景刷新保持。均已人工查看。
