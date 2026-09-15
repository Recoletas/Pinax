# B 线文档供稿（D2/D4/D6/D7）

状态：供稿供 O 串行合并；公共文件本包未直接修改（写集合同）。
事实核对于 `arch/gamestore-20260914@a30b82c`，全部为本夜实测。

## D2 · 新开发者启动路径（B 核对运行时依赖）

实测事实：

1. `package.json` engines 为 `>=22.13.0 <23`；`.nvmrc` 为 `22.22.3`；README/CONTRIBUTING 声明 Node 22（≥22.13）。
2. **实测偏差**：本机 Node `v20.20.2` + npm 10.8.2 完成依赖安装并全量通过 `verify:full`（exit 0，20/200、双 build、diff、VitePress）。engines 为声明性约束（未开 engine-strict），实际下限未测出。
3. `npm run doctor` 存在（`scripts/doctor.mjs`），README 描述"只读环境自检"与实现一致。
4. 无 key 路径：`npm ci` → `npm run dev` 即可写作/导入/备份（与 README 声明一致）；后端 `npm run server` 可选。

建议（O/用户决策，非本包擅自修改）：
- README「需要 Node.js 22」处加一句实测说明：`仓库门禁在 Node 20.20/22.22 双版本实测通过；engines 声明以 22.13 为下限`，或收紧/放宽 engines 由作者定。
- 其余快速开始命令逐条核对无误，不需要改。

## D4 · 当前架构真源（B 域 gameStore 部分）

`docs/engineering/current-architecture.md` 需要更新的两处（O 应用）：

1. **§规模表（现第 110 行）**：
   `| gameStore.js | 4,854 行 | 体验会话、历史、生成与状态变化职责过宽 |`
   建议改为：
   `| gameStore.js | 4,094 行 | 会话规范化/保存调度/恢复投影/观察者订阅已拆至 services/experience/*（4 模块）；剩余：生成流程、状态提取、分支图、init/reset 生命周期 |`

2. **§D Experience 与 gameStore 隔离（现第 145-147 行附近）**：建议在"先把 provider transport、history projection、runtime delta 拆为独立 facade"后补注当前进度：
   `（2026-09-14 进度：session 规范化 gameSessionNormalization、保存调度 gameSessionScheduler、恢复投影 gameRuntimeProjection、observer 订阅 gameObserverRuntime 已各有 owner；store 公开 API 136 actions/state 73 keys 未变。下一刀：分支回合图与生成阶段编排。）`

新 owner 表（本夜落地，供架构图引用）：

| 新 owner | 职责 | 生产调用入口 |
|---|---|---|
| `src/services/experience/gameSessionNormalization.js` | 纯 normalize/clone/快照键（43 导出） | gameStore 全部会话/快照路径 |
| `src/services/experience/gameSessionScheduler.js` | 会话列表去抖写盘、unload flush、会话记录构造、标题派生 | `saveSessions/flushSaveSessions/createSession/saveCurrentSession/getLatestSessionForWorldbook` |
| `src/services/experience/gameRuntimeProjection.js` | 回合快照构建与恢复投影（纯） | `getRuntimeSnapshot/applyRuntimeSnapshot` |
| `src/services/experience/gameObserverRuntime.js` | observer 订阅/派发/异常隔离/缓冲/项目标识 | `subscribeAuthoringObserverResults` 及全部 `*AuthoringObserver*`/`*AuthoringMemory*` actions |

存储唯一写入者不变：会话列表仍是 `STORAGE_KEYS.WRITING_SESSIONS` 单 key、useStorage 单通道；Pinia 是唯一状态 owner，四个新模块零可变会话缓存。

## D6 · 过期说明（B 域清单）

| 文件 | 过期内容 | 建议处理 |
|---|---|---|
| `docs/src/known-issues.md`（第 70 行） | `gameStore.js 4,854 行`；"会话规范化/保存/历史"仍列为页面内职责 | 行数改为 4,094 并注明已拆出 services/experience 四模块；剩余职责改为"生成流程/状态提取/分支图/init-reset" |
| `docs/engineering/current-architecture.md`（第 110 行） | 同上 | 见 D4 表 |
| `docs/STATUS.md`（第 20 行） | `gameStore.js 4,854 行` | 同上（O 合并时按实际封板行数回填） |

未发现把旧 Opening/Kao 写成现状的 B 域残留；`/experience` 定位表述与实现一致。

## D7 · 贡献入口（B 供稿）

- `CONTRIBUTING.md` 的环境行（Node 22 ≥22.13 + doctor）与实际命令核对：`npm run doctor/test:run/verify:full` 均存在且可用；Node 版本实测偏差见 D2 第 2 条（同一决策项）。
- 建议给贡献者的"正确 owner"示例补一行（O 应用到 CONTRIBUTING 或 src/README）：
  `改体验会话/存档行为时：状态变更进 src/stores/gameStore.js 的 action（保持公开 API），纯规范化/保存调度/恢复投影在 src/services/experience/ 对应模块，不要在组件里直接读写 WRITING_SESSIONS。`
- 未新增规范文件，未改 AGENTS/skills（S3 的 worldbook skill 修订已在独立提交 a30b82c，属 §16–17 授权写集）。
