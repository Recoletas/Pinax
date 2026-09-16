# Pinax 成熟地图平台 v2 修订实施计划：上下文地图、语义缩放与地点闭环

日期：2026-08-29

状态：P0 + P1 已完成；技术与视觉 Gate 均通过；P1.7 及后续地图阶段暂停，先完成 Authoring 上下文闭环

来源分支：`feature/map-platform-v2`（P1 tip `95e9d29`）

集成目标：`integration/consolidation-20260823`（整支合入并通过门禁后回收来源 worktree）

归属：`G2.4 世界书约束型 Living Atlas`

前置证据：[游戏地图信息架构调研](../research/game-map-information-architecture-20260829.md)

## 0. 修订结论

P0 已冻结 MapDocument v2、MapBinding v2、生成器合同、来源规则和固定 fixtures；P1 已证明 OpenLayers 10.10 可以承接 Pinax 虚构平面视口、矢量命中、屏幕字号标签、连续缩放和生命周期。它们不重做。

P1 四张主题图同时证明原计划中这一条产品假设错误：

> “世界/区域档用数字 cluster，地方档解除 cluster 并显示全部标签”不能产生成熟地图，只会把同一份无层级地点数据换两种方式倾倒。

后续路线因此调整为：

```text
P0 合同与来源（已完成）
  -> P1 OpenLayers 技术 Gate（已完成）
    -> P1.5/P1.6 地点语义、默认态和世界档视觉校准 Gate（已完成）

暂停：先完成 Authoring C1 落笔上下文闭环

P1.7 region/local LOD（待重新排期）
  -> P2 持久资产与多尺度底图合同
    -> P3 正式视口、上下文投影和图层系统
      -> P4 成熟制图与主题收口
        -> P5 编辑、版本和审阅事务
          -> P6 Authoring 当前场闭环
            -> P7 生成质量与 child/floor map
              -> P8 旧实现退役和导出
```

产品目标不是“像某款游戏”，而是吸收《原神》《终末地》的信息减法：默认底图安静、点位按任务出现、范围先于细节、选择后才展开详情。Pinax 在此基础上增加“当前写作上下文”这一第一优先级。

本次集成只收口已经通过用户视觉验收的 P0/P1 全量分支，不启动 P1.7、P2 或 Authoring 地图接线。地图后续必须从新的整合基线重新开工，不能让地图阶段反过来阻塞 C1。

## 1. 已完成基线与不得返工项

### 1.1 P0 已完成

提交：`439d291 feat(world-map): freeze P0 contracts, provenance rules and fixed-seed fixtures`

已交付：

- `MapDocumentV2`、七类 feature collections 和 schema validation；
- `MapBindingV2`、稳定地点身份和 legacy alias；
- generator contract 与 migration projection；
- 固定 seed fixtures 与 P0 测量脚本；
- 第三方许可证/来源规则；
- 地图写入点和 effect 分类；
- 12 个模型/合同测试。

不得为了本轮视觉调整：

- 把 OpenLayers 对象写进 MapDocument；
- 把完整世界书 entry 塞进 feature；
- 重建平行地点 store；
- 恢复 `realism.level`；
- 让生成器直接写世界书、当前场或 Experience runtime。

### 1.2 P1 已完成的技术结论

提交：`50459eb feat(world-map): P1 OpenLayers viewport prototype gate`

反馈修订：`cb8eb43 feat(world-map): address gate feedback — dual-theme basemap and clustered place labels`

继续采用：

- `ol@10.10.0` 作为独立地图 lazy surface 的视口底座；
- fictional-plane pixel projection 与统一 y-axis adapter；
- terrain raster + semantic vector 的混合路线；
- OpenLayers 负责 view、hit、select、draw/modify/snap 和基础 declutter；
- 旧 Canvas renderer 保留到 P8 Gate；
- 正式视口必须完整 dispose map、interaction、source、listener 和 object URL。

P1 技术 Gate 证明视口可行；P1.5/P1.6 又完成世界档信息层级、地理优先底图和写作语义覆盖的用户视觉验收。region/local LOD 与完整 style pack 分别留给 P1.7/P4，不属于本次整合范围。

### 1.2.1 测试预算与整合门禁

P1.5 已把独立地图合同测试并入既有 `integration.test.js` 宿主，消除 21 个测试文件的历史超限。进入当前 Authoring 整合基线后，地图的 21 个 case 再按合同边界合成 8 个语义组，保留全部断言并把全项目预算锁在 `files <= 20 / tests <= 200`；最终计数和构建结果记录在 `docs/STATUS.md`。

### 1.3 P1 被废止的视觉策略

- 默认世界图不再显示大面积数字 cluster；
- 地方档不再一次性显示全部地点名称；
- `resolution <= 0.9` 不再同时控制解除聚合和全部标签；
- light/dark 不再只做同一底图 token 反相；
- 2,000 个同级作者地点不再作为默认视觉基准；
- “declutter 没重叠”不等于“信息架构正确”。

## 2. 冻结的产品心智模型

### 2.1 三种模式

#### 写作模式（默认）

回答：“当前写到哪里，这一段和哪些地方有关？”

显示：

- 当前场地点；
- 当前 writingUnit 光标之前明确提及的地点；
- 当前章节已经出现且与当前位置直接相关的地点；
- 少量区域、首都、主城和主河用于定位。

不显示：

- 全部世界书地点；
- 全部引擎聚落；
- 未审阅候选和 stale/conflict；
- 未来 writingUnit 或未进入上下文的章节地点。

#### 探索模式（用户主动进入）

回答：“这个世界还有哪些地点、路线和历史？”

用户按来源、种类和范围开启图层。只有这一模式允许对低优先级全量点使用 cluster；点击 cluster 必须 zoom-to-extent，重叠到最大缩放时展开成员或转到列表，不能只显示一个无后续动作的数字。

#### 审阅模式（任务驱动）

回答：“哪些地点需要落图、改绑或解决冲突？”

只显示本次任务候选、原绑定、目标绑定和 ghost placement。完成或取消后恢复进入前的模式、筛选和视口。

### 2.2 五类图层与 owner

| 图层 | 内容 | 默认 | 是否聚合 | 业务写入 |
|---|---|---|---|---|
| Base geography | 地形、海岸、水系、区域形状 | 开 | 否 | 否 |
| Reference | 国家/区域名、首都、主城、主河 | 开 | 否 | 否 |
| Writing context | 当前场、当前单元、当前章节相关地点 | 开 | 否 | 否 |
| On-demand | 世界书全部地点、引擎地点、历史/关系类别 | 关 | 可 | 否 |
| Task overlay | 搜索、选中、放置、冲突、审阅 | 按任务 | 否 | 仅 command 确认后 |

OpenLayers layer 只持有 render projection；世界书、章节和任务状态由 `mapContextProjection` 查询后产生最小 signal，不直接进入 OL feature 真源。

### 2.3 选择与详情

- 地图上同一时间只有一个 primary selection；
- hover 只提供临时名称或轮廓，不写 store；
- selection 固定打开右侧 inspector，地图不常驻铺开所有详情；
- 选中后非相关地点降低对比，当前场和直接关系仍保留；
- 列表选择、键盘选择和地图点选进入同一个 `MapSelectionController`；
- `select-map-object`、`bind-place`、`set-scene-place`、`enter-runtime-place` 继续保持四种独立 effect。

## 3. 地点语义与上下文合同

### 3.1 MapFeature 最小向后兼容扩展

在 schemaVersion 2 内增加可选字段；legacy 投影缺字段时使用保守派生，不伪造作者事实：

```ts
type MapPlaceKind =
  | 'capital'
  | 'city'
  | 'town'
  | 'village'
  | 'landmark'
  | 'site'
  | 'interior'

type MapPlaceScope = 'world' | 'region' | 'local' | 'site'

interface MapFeatureProperties {
  // 已有字段
  kind?: MapPlaceKind
  scope?: MapPlaceScope
  parentFeatureId?: string
}
```

规则：

- `kind/scope/parentFeatureId` 是地图空间语义，可以持久化；
- `displayPriority` 暂保留兼容，但正式渲染不单独信任它；
- 当前场/章节相关性、搜索命中、hover、selected 是 UI projection，不持久化；
- `bindingStatus` 继续只表示绑定摘要，不兼任地点种类或重要度；
- generated settlement 的 kind 从 capital/population/port 等已有证据确定；未知时降为 `town/local`，不能默认宏观地点。

### 3.2 上下文 signal

新增纯数据合同：

```ts
interface MapContextSignal {
  featureId: string
  reason:
    | 'selected'
    | 'current-scene'
    | 'current-unit'
    | 'chapter-reference'
    | 'search-result'
    | 'review-target'
  sourceRef?: string
  rank: number
}
```

`mapContextProjection` 只消费明确的 `worldbookEntryId / binding / chapter sourceRefs / scene anchor`；不得全文正则扫描整本书后自动把所有专名点亮。

### 3.3 最终渲染 rank

```text
selected
> current-scene
> current-unit explicit reference
> current-chapter confirmed reference
> search/review target
> author-confirmed macro place
> capital / major city / region label
> normal confirmed place
> generated native place
> candidate/stale/conflict outside review mode
```

rank 只决定“有资格竞争显示”，最终仍受 zoom scope、当前模式、视口范围和标签预算约束。

## 4. 语义缩放和标签规划

### 4.1 四档范围

| 档位 | 基础结构 | 常驻地点 | 上下文 | 1440×900 标签目标 |
|---|---|---|---|---|
| World | 大陆、国家/大区、主河 | 首都、极少宏观地点 | 当前场 + 3-8 个章节锚点 | 8-14 地理名 + 3-8 上下文名 |
| Region | 区域边界、主路、河流 | 首都、城市、作者确认地点 | 当前场 + 当前单元/章节 | 总计 16-24 |
| Local | 道路、水系、聚落轮廓 | 城镇/地标 icon | 当前场及相邻一跳 | 常驻文字 12-18，其余 icon-only |
| Site | child/floor map 结构 | 建筑、房间、局部锚点 | 本场人物/事件 | 独立预算 |

数量是截图校准目标，不写入业务合同；实际预算由地图可见面积、字体测量和优先级规划器计算。

### 4.2 标签选择顺序

```text
visible features in extent
  -> mode/source filter
  -> scope/zoom eligibility
  -> context rank
  -> duplicate-name disambiguation
  -> viewport label budget
  -> OpenLayers declutter
  -> selected/current-scene forced overlay
```

不能把所有 feature 先交给 declutter，再把“侥幸没有碰撞的标签”当作产品选择结果。

### 4.3 缩放稳定性

- 每档使用 enter/leave 双阈值，保留约 15%-25% hysteresis；
- 连续 wheel/pinch 期间只更新必要 icon，停止输入约 120-180ms 后执行有界 label plan；
- 当前选择和当前场不随阈值闪灭；
- 相邻档位的 label 数量渐进变化，不允许从 cluster 数字墙瞬间跳成全部地名；
- 字体 ready、theme change、ResizeObserver 只触发一次合并刷新。

### 4.4 同名、无效坐标和候选地点

- 同视口同名地点在 label 层显示父区域短名，列表和 inspector 展示完整路径；
- 地点落位校验使用 cell height/water mask、所属 region 和最小海岸距离，不只使用 coastline polygon containment；
- 生成器候选位置不满足约束时进入 review warning，不在地图上伪装成正常村落；
- candidate/stale/conflict 默认不进入写作模式；审阅模式使用形状和文字状态，不只用颜色。

## 5. 底图与主题策略

### 5.1 多尺度底图

固定 `width × height` terrain Canvas 只能满足世界/区域预览。P2 资产合同必须允许：

```ts
interface MapBaseAsset {
  width: number
  height: number
  terrainRef?: string
  thumbnailRef?: string
  levels?: Array<{
    id: string
    minResolution: number
    maxResolution: number
    assetRef: string
    width: number
    height: number
  }>
}
```

P2 只冻结和持久化该合同，不要求首轮生成全部 levels。P3 可以先使用世界/区域两级；地方细节不足时明确提示进入 child map，而不是无限 overzoom。

### 5.2 `atlas-clean` 浅色基准

- 海陆和区域形状先可读，地点 UI 不能盖过底图；
- 区域名大而淡，地点名小而清晰，两者不共用同一 halo；
- 城市、村落、地标和场所使用不同原创图形；
- 当前场使用单一定位环，当前章节引用使用钢青来源信号；
- 待确认矿物黄、冲突暗玫瑰，但状态同时有图形或文字；
- 选中后其他地点降噪，inspector 成为详情 owner。

### 5.3 深色主题后置

浅色 world + region/local 的信息层级未获用户确认前，不制作第二轮 dark 截图。深色主题必须重新平衡底图色阶、海岸和文字层，不接受简单反相。

## 6. 分阶段执行

## P1.5：地点信息架构与视觉校准 Gate（已完成，保留为历史执行合同）

### 目标

在不接正式路由、不写世界书、不改 Authoring 的前提下，证明“默认写作地图 + 按需探索 + 任务审阅”能在真实语义数据上成立。

### 工作项

1. 扩展 `MapFeatureProperties` 的 `kind/scope/parentFeatureId` 和 validation；
2. 更新 legacy migration：capital/city/town 等从已有证据保守派生；
3. 新增 `author-semantic` fixture：
   - 2-4 个国家/大区；
   - 3-6 个首都/主城；
   - 20-40 个普通聚落；
   - 12-24 个世界书地点，包含父子层级、同名、未落图、冲突；
   - 当前场 1 个、当前单元 2-4 个、当前章节 4-8 个引用；
4. 保留 `dense-2k`，但仅在探索模式主动开启全部作者地点后运行；
5. 在 spike 内实现纯函数 `selectVisibleMapFeatures()` 和 `planMapLabels()`；
6. 建立 writing/explore/review 三模式切换；
7. 默认 world 档移除数字 cluster；
8. explore dense 层实现 cluster 点击 zoom-to-extent；最大缩放重叠时展开成员或打开列表；
9. local 档改为 icon-first，只有预算内和上下文地点常驻文字；
10. 加入 enter/leave 双阈值与停止缩放后的合并 label refresh；
11. 先输出浅色 `world / region / local / selected` 四张 1440 截图；
12. 用户确认结构后，再补 1024/390/200% 和 dark 主题。

### 首轮视觉硬门槛

- world 截图数字 cluster 为 0；
- 默认写作模式中 candidate/stale/conflict 常驻数量为 0；
- 当前场始终可见，当前章节相关锚点不超过 8 个；
- world 地理名约 8-14 个，上下文名约 3-8 个；
- local 常驻地点文字约 12-18 个，其余 icon-only；
- 同视口重复裸名为 0；
- 明显水面村落为 0；
- selected 截图中只有一个 primary detail owner；
- world -> region -> local 连续缩放没有标签整屏闪现；
- dense-2k 仍达到 P1 性能基线，且退出 explore 后恢复干净默认态。

### Gate 失败止损

- 如果语义 fixture 仍依赖大量手工 `displayPriority` 才干净，停止调 CSS，回到 `kind/scope/context` 合同；
- 如果底图在 local 明显模糊，不继续增加文字细节，提前进入 P2 multi-level asset；
- 如果 cluster 交互仍无明确去向，dense 全量层改为列表/搜索，不强留地图 cluster。

## P2：地图资产、迁移与多尺度合同

### 工作项

- 建立 `MapAssetRepository`，保存 MapDocument、binary terrain、thumbnail、generator receipt 和 revision；
- staged write -> validate -> swap，失败保留旧资产；
- quota 预检、损坏隔离、孤儿 blob 清理；
- `mapConfigJSON` 迁移为 recipe + asset reference；
- 旧 map-scoped placeId 建 alias index；
- `MapBaseAsset.levels` 向后兼容；先保存 world/region level，child/site 允许为空；
- view state 按 `projectId + mapAssetId` 保存；
- refresh/reopen 不重新 generation；
- 生成中切书、关闭标签或取消时终止 worker，迟到结果不得落地。

### 退出条件

- 两本书快速切换不串 asset、worldbook、view state；
- 缓存地图刷新直接恢复；
- 损坏或 quota 失败时旧图仍可用；
- 单级旧资产可迁移，多级字段缺失不报假错误；
- 20 次 regenerate 后 worker/timer/heap 回落达到 P0 门槛。

P2 数据资产工作可与 P1.5 截图校准并行，但 P2 不修改 spike 视觉文件；P3 在两者 Gate 都通过后开始。

## P3：正式 OpenLayers 视口、上下文投影与图层系统

### 建议文件

```text
src/services/world-map/viewport/
  mapViewportController.ts
  mapLayerRegistry.ts
  mapSemanticZoom.ts
  mapLabelPlanner.ts
  mapSelectionController.ts
  mapViewState.ts

src/services/world-map/integration/
  mapContextProjection.ts

src/components/geography/map-v2/
  MapViewport.vue
  MapToolbar.vue
  MapToolRail.vue
  MapInspector.vue
  MapLayerPanel.vue
  MapReviewTray.vue
  MapStatusBar.vue
```

### 工作项

- 建立唯一 `MapViewportController`；
- layer registry 固定五类图层、z-order、LOD、visibility 和 exportability；
- `mapContextProjection` 把 scene/unit/chapter/search/review 投影为最小 signal；
- `mapSemanticZoom` 管理四档和 hysteresis；
- `mapLabelPlanner` 先做语义预算，再交给 OL declutter；
- cluster 只属于 On-demand explore layer；
- selection/hover/focus 分离，hover 不写 store；
- ResizeObserver、DPR、theme/font ready 使用有界刷新；
- dispose 时 `ClusterSource.setSource(null)`，再释放 cluster/source/listeners；
- 保留旧 `WorldMapVoronoi` feature flag，直到 P8。

### 退出条件

- 工具栏/inspector 固定，不随地图移动；
- 默认写作模式与 P1.5 批准截图一致；
- 切模式不改变 MapDocument 或世界书；
- 视口恢复不触发业务写入；
- pointer/touch/keyboard 都能选择和取消；
- mount/unmount 20 次无 listener/source/RAF 残留；
- console、ResizeObserver loop、detached node 无新增错误。

## P4：成熟制图与主题收口

### 工作项

- 第一批：coastline fractal、continuous border paths、state/region label paths；
- 第二批：river/route line labels、burg/author place icon family；
- 第三批：relief placement、scale bar 和必要的局部细节；
- adapted source 先去 globals/DOM，再进入纯输入输出层；
- `atlas-clean` 先完成浅色 world/region/local；
- 浅色获批后再编制 dark；
- `topographic` 和 `parchment` 不阻塞默认主题；
- 专门校对长中文地名、同名地点、群岛、狭长区域和密集城市。

### 退出条件

- 0.5x/1x/3x/8x 标签维持屏幕可读尺寸；
- world/region/local 的底图细节与地点密度匹配；
- 三套 style 不产生不同业务显隐结果；
- dark 不出现灰白海岸带和反相极地；
- 每个 adapted 文件可追踪 upstream/commit/license；
- 至少两轮截图校对和一次连续缩放用户验收。

## P5：编辑、版本和审阅事务

### 模式

- 浏览/选择；
- 放置或改绑世界书地点；
- 连接叙事路线；
- 测量。

### 工作项

- 模式互斥；双击空白只聚焦/放大，不创建实体；
- 使用 Select/Draw/Modify/Snap，不手写第二套 pointer 状态机；
- 编辑先产生 `MapEditSession` patch，确认后提交；
- 拖动地点前校验 land/water/region/parent 约束；
- stale revision 阻止覆盖，提供重放或放弃；
- undo/redo 只作用当前 session；提交后进入 revision history；
- Escape、切书、关闭 inspector、pointercancel、窗口失焦统一取消；
- review tray 承担原生地点提升、同名去重、父区域和绑定 diff。

### 退出条件

- 取消不改变 MapDocument；
- 提交失败保留 patch 与旧图；
- 快速点按、拖动切模式和窗口失焦不留 ghost；
- 无效水面地点无法静默提交；
- 原生地点不一键变成正式世界书事实。

## P6：世界书与 Authoring 当前场闭环

P6 前同步 Authoring 最新 `main`，预约 route/workspace/worldStore/context builder 的单一集成窗口。地图分支此前不得修改这些共享文件。

### 工作项

- 地图成为 `project:{bookId}:map` workspace surface；
- 实现 `OpenMapIntent`、return intent 和 binding receipt；
- 当前场候选显示已落图/未落图/需修复；
- 地点详情显示缓存缩略图、父区域、确认空间事实和来源；
- 未落图进入可取消 ghost placement；
- binding transaction 与 scene-anchor transaction 分开；
- 返回恢复 book/chapter/writingUnit/caret/scroll；
- revision 变化时只保留已确认 binding，不向过期 writingUnit 写 scene anchor；
- 写作模式由当前场和 Context Manifest 驱动，不读取未来单元；
- ledger 记录 `worldbookEntryId/mapAssetId/mapRevision/bindingStatus/evidence`。

### 退出条件

- 从前文任一 writingUnit 打开地图、落图、返回后位置准确；
- 两本书地图和当前场完全隔离；
- 普通地图浏览不改变 Experience runtime；
- 每个写作空间事实可追溯到世界书、binding 和 map revision；
- 当前场切换后地图上下文更新一次，不重复触发或闪烁。

## P7：生成质量、局部地图与上下文空间关系

### 工作项

- 先修 coastline、hydrology、route 和 settlement 质量；
- 只有截图证明必要时才接 Mapgen4 terrain refinement；
- Mapgen4 只修改 terrain stage，不改变国家、PlaceEntity 或确认地点；
- 地点落位使用真实 cell/region/coast constraint；
- remap 评分加入 parent/adjacent/route 与空间邻近；
- world feature 可挂 child map asset；
- 城市/建筑/复杂地形可以进入 local/site/floor map；
- 父子地图共用 PlaceIdentity、viewport 和 binding，不建第二套产品；
- 上下文只查询当前地点、父级和 confirmed 一跳关系，不发送整张地图。

### 退出条件

- 同 seed + config 输出确定；
- 局部地形重算不移动无关 confirmed 地点；
- 河流和道路没有明显错误；
- child/floor map 可返回父地图并保留选择；
- 世界图无需 overzoom 到模糊像素仍能进入场所详情；
- remap 能解释匹配原因和置信度。

## P8：导出、迁移收口与旧实现退役

### 工作项

- PNG 高分辨率导出；
- SVG 导出矢量语义层，明确字体/纹理限制；
- GeoJSON 标记 fictional-plane metadata，不伪装 WGS84；
- 导出遵循当前可见模式和筛选；
- 完成旧存档迁移、回滚和 downgrade 说明；
- 删除旧 marker hit-test、旧 rail、死 3D 和 placeholder；
- 拆 feature flag 前跑旧存档矩阵；
- 更新 code map、ADR、known issues、notices 和用户文档；
- 合并后回收 worktree、临时分支、截图和 clone。

### 退出条件

- 新视口经连续真实使用和用户确认；
- 旧地图可打开或明确报告迁移失败，不静默丢失；
- 仓库只有一个 active viewport、selection owner 和地点标签语义；
- 默认导出不包含用户未开启的全量地点；
- 临时资产和 worktree 已回收。

## 7. P1.5 具体任务包

### Task 0：偿还测试文件预算债务

文件：

- `src/__tests__/mapModelV2.test.js`
- 一个既有且语义相邻的地图/集成测试宿主（实施时先审计再选择）

动作：完整迁移 12 个地图合同用例到宿主文件，删除空的独立测试文件；用例数不得
减少。执行一次 `verify:full`，确认测试文件恢复到 20 以内后才进入 Task A/B。

### Task A：修正证据状态

文件：

- `docs/engineering/map-p1-gate-report.md`
- `docs/agent-runs/current.md`

动作：区分技术 Gate 与视觉 Gate；记录 P1.5 当前执行；不删除历史截图。

### Task B：扩展地点语义合同

文件：

- `src/services/world-map/model/mapFeature.ts`
- `src/services/world-map/model/mapMigration.ts`
- `src/services/world-map/model/mapDocumentV2.ts`
- `src/__tests__/mapModelV2.test.js`

动作：新增可选 `kind/scope/parentFeatureId`；验证合法枚举、父引用和 legacy 保守派生。先写合同测试，再实现；不新增独立测试文件。

### Task C：建立双 fixture

文件：

- `src/services/world-map/testing/fixtures.ts`
- `prototype/map-spike/main.js`

动作：

- `author-semantic` 成为视觉默认；
- `dense-2k` 保留为压力模式；
- fixture 明确当前场、当前单元、章节引用、同名和冲突；
- 视觉 fixture 不用机械序号分配所有状态和优先级。

### Task D：纯函数显隐与标签规划

建议文件：

- `prototype/map-spike/map-visibility-policy.js`
- `prototype/map-spike/map-label-plan.js`

动作：先完成模式筛选、scope、rank、预算、同名消歧和 hysteresis；不得先改颜色掩盖结构问题。

### Task E：浅色世界切片

只做：

- world 默认写作模式；
- 无数字 cluster；
- 当前场、章节锚点和地理基准；
- selected inspector/hint 最小状态。

输出一张 `p15-light-world-1440.png`，用户否决前不做 local/dark。

### Task F：浅色 region/local 切片

在 Task E 获批后：

- region 渐进增加城市/道路；
- local icon-first；
- hover/selection 才展开普通地点名称；
- 连续缩放验证 hysteresis；
- 输出 `p15-light-region-1440.png`、`p15-light-local-1440.png`、`p15-light-selected-1440.png`。

### Task G：探索压力与响应式

在结构获批后：

- 主动开启 dense-2k；
- cluster zoom-to-extent / expansion / list fallback；
- 1024/390/200%；
- 最后才做 dark。

## 8. 截图与真实旅程验收

### 8.1 证据分层

视觉方向阶段只保留：

- 当前切片 1 张基准图；
- 被否决时最多 2 张根因对照；
- 结构获批后再形成 world/region/local/selected 四图组。

中间截图、trace 和网页参考全部放 `/tmp`，结论落文档后清理。

### 8.2 必测旅程

1. 默认打开写作地图，当前场可见但没有全量地点墙；
2. 连续缩放 world -> region -> local，标签渐进出现；
3. 点击普通 icon，只展开该地点详情；
4. 打开探索模式并选择一个类别，关闭后恢复默认干净状态；
5. dense cluster 点击后 zoom/expand/list 有明确结果；
6. 搜索远方地点，临时提升并选中，清除搜索后恢复；
7. 进入审阅模式查看 stale/conflict，取消后无业务写入；
8. 切换当前场，上下文层更新且视口不重建；
9. 390px 用列表或地图完成选择和取消；
10. mount/unmount 20 次后 source/listener/RAF 无残留。

### 8.3 测试节奏

- 纯函数和合同完成后跑对应 map focused tests；
- 单纯颜色、字号、间距调整只截图，不重复全量门禁；
- 一个视觉切片获批后跑该切片的浏览器旅程；
- P1.5/P2/P3 等大阶段完成后跑地图测试与 build；
- 合并里程碑前才跑项目全量验证；
- 不用静态截图替代连续缩放、选择、取消和模式恢复。

## 9. 并发与文件所有权

当前 worktree 已隔离，不再创建第二个地图 worktree。地图轨道继续独占：

```text
src/services/world-map/**
src/components/geography/map-v2/**
prototype/map-spike/**
scripts/map-p*-spike.mjs
docs/engineering/map-*
docs/superpowers/plans/*map*
docs/superpowers/research/*map*
src/__tests__/map*.test.*
```

P1.5-P5 不修改：

```text
src/pages/Authoring*
src/components/authoring/**
src/components/writing/**
src/services/writing/**
src/router/index.js
src/stores/workspaceTabsStore.js
src/stores/worldStore.js
src/services/worldbook/worldbookContextBuilder.js
```

`package.json/package-lock.json/docs/STATUS.md/docs/PLAN.md` 仍为共享文件，只有明确预约的单一 owner 修改。当前 `ol` 已锁定，不需要再次触碰依赖文件。P6 前先同步主分支并重新审计共享接口。

## 10. 完成定义

地图平台 v2 只有同时满足以下条件才完成：

- 默认地图首先服务当前文本创作，而不是展示数据库规模；
- 世界、区域、地方和场所层级各自有稳定的信息预算；
- 作者地点、引擎地点、当前场、历史和待审状态来源可辨但不同时铺满；
- 地图、世界书、场景和 Experience 的状态 owner 清晰；
- 底图在对应缩放级别有足够细节，复杂地点可以进入 child/floor map；
- 真实页面完成搜索、选择、筛选、落图、返回、取消和恢复旅程；
- 两本书、stale revision、quota、损坏、取消和迟到 worker 均有恢复路径；
- 视觉经过逐切片截图、连续缩放和用户反复校对；
- 旧实现真正退役，没有长期双视口、双选择或双标签 owner；
- 第三方来源可追踪，临时截图、clone、worktree 和分支已回收。
