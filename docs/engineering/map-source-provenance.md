# Map Source Provenance（外部源码可追溯规则）

状态：P0 冻结（2026-08-29）
归属：G2.4 世界书约束型 Living Atlas / 地图平台 v2

## 1. 四级使用级别

| 级别 | 定义 | 当前成员 | 要求 |
|---|---|---|---|
| Dependency | 包管理器直接依赖 | `ol@10.10.0`（锁定） | 锁版本、保留许可证、依赖审计 |
| Adapted source | 复制并改写相对独立源码 | Azgaar coastline/border/state-label/relief/zoom-policy（待移植）；Mapgen4 river/terrain（可选，未移植） | 文件头记录 upstream、commit、license、修改摘要；本文件登记 |
| Algorithm reference | 按思想重写，不复制表达 | Hinterland stable streams；Sovereign chunk cache | 设计文档注明来源，不保留外部全局合同 |
| Visual reference only | 只研究外观与任务 | Nortantis（AGPL，禁止复制源码/纹理/art pack） | 不进入仓库任何文件 |

## 2. Adapted source 登记表

每个 adapted 文件移植时在此追加一行。文件头模板：

```ts
/**
 * Adapted from Azgaar Fantasy Map Generator (MIT)
 * upstream: modules/xxx.js @ fa5016a6982167f1ae169f0cdb203e281498bee7 (1.122.12)
 * modifications: 去 globals/DOM；输入输出改为显式参数；其余差异逐条列出
 * license: MIT — Copyright (c) Azgaar; 原声明保留于本文件头
 */
```

| Pinax 文件 | 上游路径 | upstream commit | 许可证 | 修改摘要 | 移植日期 |
|---|---|---|---|---|---|
| （暂无——P4 首批移植时登记） | | | | | |

## 3. 验收 Gate

- 合并里程碑前运行 provenance 检查：所有 `generators/azgaar/**`、
  `generators/mapgen4/**` 文件必须有 §2 登记 + 文件头声明；
- `THIRD_PARTY_NOTICES.md` 与本表不一致视为 Gate 失败；
- 任何复制进来的纹理/图标/art 资产（即使 MIT）必须单独列出作者与许可。

## 4. 地图写入点清单（P0 工作项）

列出当前所有地图相关写入点，并按四类 effect 标注。本清单随阶段更新。

| 写入点 | 文件 | effect 类别 | v2 去向 |
|---|---|---|---|
| 生成地图（worker 完成） | `src/components/geography/WorldMapVoronoi.vue`（`generateMapInWorker` 回调） | UI state（暂存） | P2：generator receipt → MapAssetRepository |
| 保存 mapConfigJSON | `src/stores/geographyStore.js` `persistMapData()` | canonical（现状）+ UI state | P2：拆分 recipe / asset / view state |
| marker CRUD | `geographyStore.addMarker/replaceMarkers` 等 | canonical（marker 真源） | P2+：MapBinding v2 事务 |
| 世界书绑定写入 | `src/services/ai/worldbookMapBridge.js` | binding | P6：bind-worldbook-place 事务 + receipt |
| 设为当前场 | Authoring 场景锚点（Authoring 轨道所有） | scene | P6：set-scene-place（revision-guarded） |
| Experience 运行时地点 | `src/services/playableWorldEntry.js` 等读取 | runtime（只读消费） | 不变；地图浏览不得写入（§P6 退出条件） |
| 版本切换 | `geographyStore` revision 选择 | UI state | P2：view state 按 projectId+mapAssetId 保存 |

effect 四类定义（计划 §P0）：UI select（纯选择状态）、binding（世界书+地图版本
事务）、scene（Authoring revision-guarded 锚点）、runtime（仅 Experience 运行时）。

## 5. 与 Authoring 的共享文件冻结（§7.3）

以下文件 P0–P5 阶段地图轨道一律不改；P6 预约单一 owner 集成窗口：

`package.json` / `package-lock.json`（本 worktree 已例外登记 ol 依赖）、
`src/router/index.js`、`src/config/workbenchNav.js`、
`src/stores/workspaceTabsStore.js`、`src/stores/worldStore.js`、
`src/services/worldbook/worldbookContextBuilder.js`、`docs/STATUS.md` / `docs/PLAN.md`。
