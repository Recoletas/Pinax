# Azgaar 地图复用与 Authoring 地点闭环调研

日期：2026-08-29

状态：方向建议，尚未实施
归属：[G2.4 世界书约束型 Living Atlas](../../plan/pinax-integrated-product-roadmap.md#g24-世界书约束型-living-atlas当前地图主计划)

## 1. 结论先行

Pinax 不应继续扩写当前 1956 行的 Canvas 渲染器，也不应把 Azgaar 整个页面以 iframe、全局脚本或旧式弹窗直接嵌入。推荐路线是：

1. 保留 Pinax 已经形成的世界书地点真源、生成 Worker、地图版本事务、remap 审阅和历史引用；
2. 从本地 Azgaar `1.122.12` 源码中抽取成熟的纯几何与矢量表现模块，放到有明确版权声明的适配层；
3. 把现有单一 Canvas 改为“Canvas 基础地形 + SVG 语义图层 + DOM 工具/详情”的混合视口；
4. 先解决书、世界书、地图资产、地点条目和场景锚点的身份链，再做视觉替换；
5. 地图作为某本书的完整工作区标签页存在；Authoring 当前场只保留紧凑地点摘要、地图状态和深链动作，不把完整地图塞进写作右栏；
6. 生成地点、地图绑定、设为当前场都必须走可撤销/可审阅事务，不能互相静默改写。

一句话概括：不是“给现有地图换成 Azgaar 皮肤”，而是让 Pinax 的叙事数据合同驾驭 Azgaar 已验证的地图表现能力。

## 2. 调研范围与证据

### 2.1 本地 Azgaar 基线

- 路径：`/home/recoletas/jiuguan/azgaar/Fantasy-Map-Generator`
- 版本：`1.122.12`
- commit：`fa5016a6982167f1ae169f0cdb203e281498bee7`
- commit 日期：2026-06-01
- 许可证：MIT
- 主要依赖：D3 7.9、Delaunator 5、polylabel、Alea、lineclip

MIT 允许使用、修改、分发和商业使用，但复制或实质改写代码时必须保留版权与许可声明。Pinax 当前是 PolyForm Noncommercial，自身许可证不妨碍引入 MIT 代码，但仓库目前没有统一第三方声明文件。正式移植前必须新增 `THIRD_PARTY_NOTICES.md`，记录 Azgaar 版本、commit、来源文件、改写文件和 MIT 原文；仅在注释里写“faithful port”不够稳妥。

### 2.2 Pinax 当前关键体量

| 文件 | 行数 | 当前责任 |
|---|---:|---|
| `WorldMapPanel.vue` | 2079 | 顶栏、世界书切换、生成、绑定、版本、历史、地点实体和全部侧栏状态 |
| `WorldMapVoronoi.vue` | 1507 | Worker 调用、离屏 Canvas、缩放平移、标记编辑、参数、图例和导出 |
| `renderer.ts` | 1956 | 地形、河流、道路、边界、标签、图标、比例尺和多种占位图层 |
| `label-layout.ts` | 71 | 仅做矩形贪心碰撞 |
| `worldbookMapBridge.js` | 1087 | 地点读取、候选、约束、marker、绑定和名称处理 |
| `placeEntity.js` + `placeRefs.js` | 276 | 历史/运行时地点投影与 map-scoped placeId |

这不是单个渲染缺陷，而是页面责任、身份模型和表现层同时过载。

## 3. 当前地图为什么“功能很多但效果不好”

### 3.1 单 Canvas 把不同生命周期的内容烘焙在一起

当前基础地图先完整渲染到离屏 Canvas，视口缩放时再整体拉伸。国家名、城市名、边界、道路和地形一起缩放，因此：

- 字体和 marker 随地图一起变大或变小，没有稳定屏幕字号；
- 缩放不会重新计算可见标签，无法形成真正 LOD；
- 标签布局只在初次 render 时执行，视口变化后不重新避让；
- 交互命中只覆盖 `MapMarker`，国家、河流、道路、城市底图都不是可选择对象；
- 想编辑一个标签或路线，必须继续往 Canvas 手写命中、拖动和重绘逻辑。

Azgaar 的成熟之处不只在颜色，而在它把 coastline、rivers、routes、borders、labels、burg icons、markers、rulers 等拆成独立 SVG layer，并在 zoom 时单独重标定标签、marker、halo 和比例尺。

### 3.2 当前渲染器仍有明确占位层

`renderer.ts` 自己标明“新 layer 占位实现”，其中：

- `drawVolcanoes()` 是空函数；
- `drawFactionTexture()` 基本为空；
- 国家标签只是 cell 质心上的平直逐字排布；
- 城市标签只有四候选位 + 矩形贪心；
- 没有地形 relief icon、路径文字、marker 聚类、视口级标签重排；
- `stylePreset` 有六套，但多数只是在同一组自造图层上换参数，功能差异小。

继续在这个文件里补图标、曲线文字和可编辑对象，会重复 Azgaar 已经解决的工作，并让测试和交互继续集中在一个巨型模块。

### 3.3 页面信息架构按“数据来源”堆积，不按作者任务组织

当前“地图资料”抽屉顺序堆放：世界书来源、替换审阅、版本、约束、世界书绑定、地图原生地点、语义筛选、地理历史、地点实体。每项单独合理，但同时铺在一个滚动 rail 里会造成：

- 选择地图地点后没有唯一详情 owner；
- “我想把当前场放到地图上”需要理解绑定、marker、PlaceEntity 和历史多个内部概念；
- 普通浏览、地点落图、修复冲突、重新生成四种任务共享同一界面；
- 顶栏仍同时出现世界书、奇幻/死掉的 3D、AI 生成、历史、地图资料，主舞台被实现概念包围。

### 3.4 地图资产并未真正持久化

`geographyStore` 只把生成 config、markers、meta 和最多五个 revision 摘要放进世界节点的 `mapConfigJSON`，不保存完整 `VoronoiMapData`。`WorldMapVoronoi` 每次带 config 挂载都会重新走 Worker 生成与完整渲染。

后果：

- 从 Authoring 打开地图不是轻量定位，而是潜在的完整重算；
- 无法在当前场里安全显示缓存缩略图；
- 地图对象引用只能依赖同 seed 重算的偶然稳定；
- 版本记录更接近“生成配方 + 绑定快照”，不是可立即恢复的地图资产。

这应先按 G2.1 补齐 IndexedDB 地图资产与缩略图，再扩大矢量图层。

## 4. 当前地点链的根本断点

### 4.1 现在存在四种相近但不等价的身份

| 概念 | 当前值 | 生命周期 |
|---|---|---|
| Authoring 场景锚点 | `chapter.sceneAnchors[].locationId = worldbook entryId` | 随书稿和 writingUnit 稳定 |
| 世界书地点 | `worldbook.entries[].id` | 作者事实真源 |
| 地图绑定 | `entry.mapBinding.{mapId,mapRevision,mapObjectId,cellId,x,y}` | 随地图版本变化 |
| PlaceEntity | `place:{worldbookId}:{mapId}:{siteId}` | 当前实现把 mapId 写进 ID |

Authoring 当前场使用的是最稳定的世界书 entry ID；PlaceEntity 的 `placeId` 却包含 mapId，地图重生成后理论上会变化。把后者直接写回场景锚点会降低稳定性。

推荐把稳定叙事身份定义为：

```text
place identity = worldbookId + worldbookEntryId
spatial binding = mapAssetId + mapRevision + mapObjectRef/cell/geometry
scene occurrence = bookId + chapterId + writingUnitId + place identity
```

现有 `locationId` 先保持兼容，语义明确为 `worldbookEntryId`。PlaceEntity v2 以世界书地点为稳定主键，把一个或多个地图版本 binding 作为投影；旧 map-scoped placeId 作为 legacy alias 读取，不继续产生。

### 4.2 地图页的作用域与 Authoring 不一致

Authoring 明确以 `book.worldbookId` 为唯一设定源，不回退全局 active worldbook；地图页却读取和切换 `worldStore.activeWorldbook`。工作区标签又把 `settings-world-map` 注册成全局 surface。

因此从《书 A》的当前场跳地图，目前无法可靠表达：

```text
书 A -> 绑定世界书 B -> B 中地点 C -> 地图资产 D -> 回到章节 E / writingUnit F
```

地图应改为项目 surface：

```text
/settings/world-map
  ?bookId=book-a
  &worldbookId=wb-b
  &entryId=place-c
  &mapAssetId=atlas-d
  &returnChapterId=chapter-e
  &returnUnitId=unit-f
```

标签 key 应为 `project:{bookId}:map`。无 `bookId` 的旧设置入口可以选择最近项目或进入只读的世界书地图选择页，但不能继续和项目地图共用一个全局标签状态。

### 4.3 当前“进入地点”动作改写了 Experience 全局运行时

地图的 `handleEnterPlace()` 会写 `gameStore.worldMapState`、history node 和 runtime event。这个行为适合冒险运行时，不适合设置/创作地图中的普通选中。

必须拆成三个不同命令：

- `select-map-object`：只改变地图 UI 选择；
- `bind-place`：只提交世界书地点与地图对象的空间绑定事务；
- `set-scene-place`：仅在从 Authoring 带着 book/chapter/unit return intent 进入时，按文档 revision guard 更新场景锚点；
- `enter-runtime-place`：只在 Experience 明确调用时更新 game runtime。

不能再用一个“进入地点”跨越设置、写作和游戏三种状态 owner。

## 5. Azgaar 源码复用判断

### 5.1 建议直接抽取并适配

| Azgaar 模块 | 价值 | 适配方式 | 优先级 |
|---|---|---|---:|
| `renderers/coastline-fractal.ts` | 已是相对纯的海岸细化与 SVG path 生成 | vendor 到 `world-map/azgaar/geometry`，注入 RNG 和画布边界 | P0 |
| `renderers/draw-state-labels.ts` | 375 行射线、弧线评分、双行文字和区域内检查，远强于当前质心标签 | 抽成无 DOM 的 `computeStateLabelPaths(mapData)`，Vue/SVG 只消费结果 | P0 |
| `renderers/draw-borders.ts` | 沿 Voronoi vertices 追踪连续国界/省界 | 改写 globals 为参数，输出 path model，不直接操作全局 SVG | P0 |
| `renderers/draw-features.ts` | coastline/lake feature path、mask 与分组 | 复用 path 生成思想和 fractal helper，输出 SVG defs/paths 数据 | P0 |
| `renderers/draw-relief-icons.ts` | 按 biome/height 放置山脉、丘陵和植被符号 | 注入 RNG、图标目录和密度；只在相应 LOD 层生成 | P1 |
| `renderers/draw-scalebar.ts` | 比例尺长度、单位和视口适配成熟 | 提取纯计算，DOM 由 Pinax 组件渲染 | P1 |
| `renderers/draw-markers.ts` | marker shape 与 zoom-size 规则成熟 | 复用形状 path 和尺寸公式，数据仍用 Pinax MapMarker/PlaceEntity | P1 |
| `public/main.js` 的 active zooming 逻辑 | 标签、marker、halo、ruler 随 zoom 独立缩放 | 提炼为 Pinax viewport policy，不复制全局主程序 | P0 |
| `public/modules/ui/minimap.js` | 小地图和点击定位 | 只复用算法/视口矩形，重写 Vue 外壳 | P2 |
| `public/modules/ui/measurers.js` | 直尺、路径、面积测量模型 | 抽取数据模型和几何，延后到基础地点闭环之后 | P2 |

### 5.2 只借算法，不直接搬文件

| Azgaar 模块 | 原因 | 可借部分 |
|---|---|---|
| `river-generator.ts` | 573 行且深度依赖 `pack/grid/Lakes/Names` 全局 | discharge、basin、meander path、河宽公式 |
| `routes-generator.ts` | 722 行，依赖全局 burg/culture/temperature/name 系统 | 路径代价、路线层级、道路/小径/海路分类 |
| `states-generator.ts` | 704 行，依赖 DOM option、文化、纹章和全局 pack | 扩张 cost、pole、邻国/省份派生 |
| `burgs-generator.ts` | 672 行，依赖 Names/COA/options | 聚落评分、港口和首都规则 |
| `heightmap-generator.ts` | 615 行、78 处全局/DOM 依赖；Pinax 已有 14 模板 port 和 Worker 合同 | 仅对照行为，不重新引入第二套高度图 owner |
| `voronoi.ts` | 较纯，但 Pinax 已有 Delaunator 网格和稳定输出合同 | 类型与边界处理可对照，无替换收益 |

### 5.3 不直接复用

以下代码的视觉功能可以参考，但不应进入 Pinax 运行时：

- `public/modules/ui/layers.js`：1030 行、全局 DOM 和本地存储耦合；
- `burg/labels/routes/markers editor`：大量 jQuery UI dialog、全局选中态和直接 mutation；
- Azgaar 整页 `src/index.html`、`public/main.js`、service worker 和存档格式；
- 完整 3D、纹章、军事、宗教、文化编辑器；
- Azgaar 名称池自动写入世界书。

原因不是这些功能不好，而是它们会绕过 Vue/Pinia、地图版本事务、世界书审阅和项目标签作用域。直接嵌入会快速得到“看起来能用”的地图，却让地点链和撤销链再次分叉。

## 6. 推荐目标架构

```text
Authoring / Settings / Experience
          │ typed navigation + commands
          ▼
PlaceIdentityService
  worldbookEntryId -> stable place identity
          │
          ├── Worldbook entry（叙事事实真源）
          ├── Scene anchor（某 writingUnit 的当前场）
          ├── PlaceEntity v2（查询投影）
          └── MapBinding（版本化空间引用）
                         │
                         ▼
MapAssetRepository (IndexedDB)
  asset data + thumbnail + version + generation metadata
                         │
                         ▼
MapViewport
  Canvas base: terrain / biome / hillshade / fills
  SVG overlay: coast / rivers / routes / borders / labels / places
  DOM chrome: search / layers / mode / inspector / review tray
                         │
                         ▼
Azgaar adapters
  pure geometry / label paths / relief placement / zoom policy
```

### 6.1 为什么不是全 SVG

Pinax 已经有 Worker 和大批 TypedArray cell 数据。把每个地形 cell 都变成 SVG DOM 会放大节点量和主题/导出复杂度。基础地形继续 Canvas 性价比高；真正需要选择、编辑、保持字号和独立显隐的是矢量语义层。

### 6.2 为什么不是继续全 Canvas

标签、marker、路线和地点本身是作者操作对象，需要真实 DOM/SVG hit target、焦点、ARIA、独立样式和局部重排。继续手写 Canvas 命中会复制 Azgaar 的编辑工作，并使键盘替代入口更难实现。

### 6.3 图层合同

建议固定三类图层，不再让任意 preset 随意复制 owner：

- 基础地理：海陆、地貌、生态、山影；结构变化才重生成；
- 空间结构：海岸、河流、道路、国家/区域边界；可独立重渲染；
- 叙事语义：作者地点、当前场、历史事件、势力/危险、选中态；来自世界书和运行时投影。

风格 preset 只改变 token 和默认显隐，不改变数据含义，也不重新引入 `realism.level`。

## 7. 地图工作区应该怎样重排

### 7.1 可验证视觉硬约束

1. 地图占首屏至少 70% 可见面积，不能被配置卡片和资料列表切碎；
2. 顶部只保留地点搜索、图层、编辑模式、版本/生成入口和返回来源，死 3D 按钮移除；
3. 右侧 inspector 只展示当前选择或当前任务，绑定收件箱、生成参数、版本历史互斥切换，不在同一滚动流全部展开；
4. 普通浏览时工具沿边缘静止，地图独立平移缩放；只有选中对象的锚点工具跟随地图；
5. label 与 marker 维持屏幕可读尺寸，按 zoom tier 显隐和重新碰撞，不能整体被 Canvas 拉伸；
6. 作者确认地点和当前场高于地图原生预览地点，未绑定预览必须有统一、低干扰的视觉区别；
7. 390px 下地图保持可平移主舞台，详情降为 bottom sheet；搜索、返回和当前选择始终可达；
8. 不能用普通圆角卡片墙承载所有功能；地图、边缘工具和详情阅读台应形成连续空间。

### 7.2 LOD 建议

| 视口层级 | 常态显示 | 隐藏/聚合 |
|---|---|---|
| 世界 | 大陆海岸、国家、主河、确认的宏观地点 | 城镇、站点、次级道路聚合 |
| 区域 | 国家/区域、首都、主城、道路、确认地点 | 普通站点按密度选择 |
| 地方 | 城镇、站点、完整路线、地点关系 | 只对严重重叠项聚合 |

当前场、当前选中、冲突待修地点始终可见，但不能强制显示所有文字；可以用信号点 + hover/focus 名称代替。

### 7.3 交互模式

首版只需要四种：

- 浏览/选择；
- 放置或改绑世界书地点；
- 连接叙事路线；
- 测量。

双击空白不再默认创建 marker。创建只能由显式模式触发；双击用于聚焦/放大，避免误写地图状态。

## 8. Authoring 当前场与地图的完整闭环

### 8.1 在当前场选择地点

现有“调整当前场 -> 搜索世界书地点”可保留，但候选行需要增加地图状态：

- 已落图：显示所属区域和安静的定位图标；
- 未落图：显示“可放到地图”；
- stale/conflict：显示“需修复”；
- 地图资产尚未建立：显示“地图未建立”，不伪造坐标。

选择候选只更新本地现场草稿，保存后才写 scene anchor。它不应顺带改变地图 active marker 或 Experience 当前地点。

### 8.2 当前场地点详情

左栏仍是一行紧凑摘要。点击“地点”在右侧现场详情显示：

- 地点名、上级区域、地点类型；
- 来源世界书条目；
- 地图绑定状态和一张缓存缩略图；
- 本场可用的环境事实；
- `地图定位` / `放到地图` / `修复绑定`；
- `打开完整设定`。

当前详情里的“本场环境事实”“控制势力”现在是空值，应由 PlaceEntity v2 从世界书条目、确认 binding、有限历史/运行时状态投影，不能用空壳字段长期占位。

### 8.3 从 Authoring 打开地图

1. 捕获 `{bookId, chapterId, unitId, documentRevision, worldbookId, entryId}`；
2. 打开或聚焦 `project:{bookId}:map` 标签；
3. 已绑定地点直接 zoom/focus 并打开地点 inspector；
4. 未绑定地点进入“放置该地点”模式，地图显示可取消的 ghost anchor；
5. 用户选择地图对象或位置后先看到绑定 diff；
6. 确认后原子写 `entry.mapBinding` 和地图 revision receipt；
7. 若用户选择“同时设为当前场”，再用捕获的 documentRevision 提交 scene anchor；revision 已变化则只保留地图绑定并提示回 Authoring 重选，绝不写错单元。

### 8.4 从地图回到 Authoring

地图 inspector 的“用于当前场”仅在有有效 return intent 时出现。普通从设置页进入地图时不显示该动作。返回后：

- 聚焦原 book/chapter/unit；
- 保留地图标签和视口状态；
- 右侧现场详情显示最新 binding receipt；
- 正文光标和滚动位置由 Authoring restore state 恢复。

### 8.5 地图原生地点如何进入世界书

当前 `promoteNativePlace()` 一次点击就创建正式世界书条目并确认绑定，过于直接。推荐改为：

```text
选择地图原生地点
  -> 创建地点草稿（名称、kind、地图证据、候选关系）
  -> Review Tray 编辑/去重/选择父区域
  -> 确认
  -> 写正式 worldbook entry + confirmed map binding
```

这与结构化设定“生成内容先审阅”的规则一致，也避免把 Azgaar/引擎名称池误当作者事实。

## 9. 上下文接入边界

地图不应整张进入写作 prompt。当前场地点上下文只编译：

1. 当前世界书地点条目的有界事实；
2. parent/state 关系；
3. confirmed adjacent/river/route 的一跳关系；
4. 当前地图版本能证明的地形、邻近与路线事实；
5. 与当前章节/单元有关的历史或运行时变化。

不得注入：

- 未绑定地图原生名称；
- 未来 writingUnit 或后续章节的场景锚点；
- 整张地图的所有城镇/国家；
- 仅因坐标接近、但未确认的叙事关系。

不同章节是否进入上下文仍由 Authoring Context Manifest 决定。地图只提供可查询空间证据，不获得跨章上下文选择权。

## 10. 分阶段实施建议

### M0：身份、许可与资产边界

- 新增第三方声明和 Azgaar vendor 规则；
- 冻结 `PlaceIdentity v2`、`MapBinding v2`、legacy alias 与迁移策略；
- 把地图改为 project-scoped workspace surface；
- 地图只消费 route 对应 book 的 `book.worldbookId`，禁止全局 active worldbook 回退；
- 建立 IndexedDB `MapAssetRepository` 和缩略图，不再每次进页重生成。

退出条件：从两本书分别打开地图得到两个标签/上下文，不串世界书；刷新后不重算已有地图；旧 placeId 仍可解析。

### M1：视口骨架与第一块 Azgaar 复用

- 抽出 `MapViewport`、`MapCanvasBase`、`MapVectorOverlay`、`MapViewportController`；
- 先移植 coastline fractal、连续 border path 和 active zoom policy；
- 保留旧 Canvas labels/markers 作为 feature flag 回退；
- 完成 1440 一个代表地图的前后截图，不改资料 rail 全部业务。

退出条件：缩放中海岸/边界清晰，视口无双重滚动，旧地图数据可直接显示。

### M2：标签、marker 与选择

- 移植 state label path 算法；
- SVG 化国家、城市、作者地点和选中态；
- 实现三档 LOD、视口级碰撞、screen-size marker；
- 给国家、河流、道路、burg、作者地点统一 typed selection；
- 增加键盘/列表替代入口。

退出条件：缩放 0.5x/1x/3x/8x 都没有标签整体放大、密集糊成一团或完全失去作者地点。

### M3：地图工作区信息架构

- 顶栏收敛，删除死 3D；
- 右侧改为“当前选择 / 绑定收件箱 / 图层 / 版本生成”单 owner；
- 普通浏览、地点落图、remap 修复和重新生成分别有明确模式；
- 原有版本、约束、历史能力迁入对应任务页，不删除业务逻辑。

退出条件：用户不理解 `placeRefs`、marker 和 constraint report 也能完成定位、落图、改绑和恢复。

### M4：Authoring 地点闭环

- 当前场候选加入 map status；
- 地点详情补缓存缩略图、空间事实和深链；
- 实现 return intent、ghost placement、绑定 diff 和 revision-guarded scene anchor；
- map selection、scene update、runtime enter 三类命令彻底分离。

退出条件：从前文任一 writingUnit 打开地点、落图、返回，光标和场景锚点都准确；同时打开两本书不串状态。

### M5：地图原生地点审阅与空间上下文

- 原生地点进入世界书改为草稿审阅；
- parent/adjacent/river/route 一跳查询进入 PlaceEntity v2；
- 上下文 ledger 显示地图证据、map revision 和是否 confirmed；
- remap 评分加入关系图与空间邻近，但继续逐项确认。

退出条件：任何写作上下文中的地图事实都能回到世界书条目、确认 binding 和地图版本。

### M6：次级成熟能力

- relief icons；
- minimap；
- 路径/面积测量；
- 分层导出；
- 经过真实使用证明必要后，再评估路线编辑器和局部地貌编辑。

这些能力不能阻塞 M0-M5 的文本工作台地点闭环。

## 11. 截图与真实页面验收

每个 M1-M5 切片只在形成完整可操作闭环后跑一次聚焦验证和截图，不做每改一点就全量测试。截图使用固定 fixture，并及时清理多余产物。

代表性视口：

- 1440×900：完整地图 + 右侧地点详情；
- 1024×768：地图主舞台 + overlay inspector；
- 390×844：地图 + bottom sheet；
- 200% zoom：主要动作可达且无横向锁死。

每轮至少覆盖：

- 世界概览；
- 地区缩放；
- 当前场地点已绑定；
- 当前场地点未绑定进入 placement；
- stale/conflict 修复；
- 长名称/高密度标签；
- 两本书快速切换；
- 刷新恢复与重生成失败保留旧图。

视觉校对不是只看静态图，还要录下/检查缩放过程中标签、marker、工具和 inspector 的相对运动。

## 12. 不建议做的事情

- 不以 iframe 嵌 Azgaar；
- 不把 Azgaar `pack/grid` 设为第二份数据真源；
- 不复制它的 jQuery dialog 和 1000 行 layers UI；
- 不一次忠实 port rivers/states/routes/burgs 全生成管线；
- 不先做 3D、军事、宗教、纹章等外围能力；
- 不让地图原生名称自动写进世界书；
- 不让地图页通过全局 active worldbook 猜当前项目；
- 不用 map-scoped placeId 替换稳定的世界书地点身份；
- 不把完整地图塞入 Authoring 右栏，也不让地图反客为主成为文本工作台前置。

## 13. 推荐下一步

先做 M0 的设计/迁移 spike，再做 M1 的一个代表性视口原型。M1 只选择一个现有 fixture，对比：

1. 当前全 Canvas；
2. Canvas 基础地形 + Azgaar coastline/border SVG；
3. 再加入 state label path 和 zoom rescale。

三张同视口截图和一次连续缩放录制足以判断混合渲染方向，不需要先重写整页。方向通过后，再把 M2-M5 写成逐文件实施计划。
