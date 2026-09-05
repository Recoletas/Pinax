# Third-Party Notices

本文件记录 Pinax 依赖或适配的第三方代码与其许可证。规则见
`docs/engineering/map-source-provenance.md`（Dependency / Adapted source /
Algorithm reference / Visual reference only 四级）。

## Dependency（包管理器直接依赖）

| 组件 | 版本 | 许可证 | 用途 | 上游 |
|---|---|---|---|---|
| OpenLayers (`ol`) | 10.10.0（锁定） | BSD-2-Clause | 地图视口、矢量图层、标签 declutter、选择/绘制/修改/吸附。只进入地图懒加载 chunk | https://github.com/openlayers/openlayers |

BSD-2-Clause 原文（摘要）：允许使用、复制、修改、分发与商用，须保留版权声明与免责声明。
完整许可证文本随 npm 包 `ol/LICENSE.md` 分发。

## Adapted source（复制并改写，逐文件登记）

来源：Azgaar Fantasy Map Generator `1.122.12`，commit
`fa5016a6982167f1ae169f0cdb203e281498bee7`，MIT，
本地镜像 `/home/recoletas/jiuguan/azgaar/Fantasy-Map-Generator`。

MIT 原文要求：在软件及其所有副本中保留上述版权声明与本许可声明。

计划适配的模块（尚未移植；移植时必须在 `docs/engineering/map-source-provenance.md`
登记每个文件的 upstream 路径、commit、修改摘要，并在文件头保留版权声明）：

| Pinax 目标文件 | 上游参考 | 修改方向 |
|---|---|---|
| `src/services/world-map/generators/azgaar/coastline.ts` | `modules/geometry.js` 等海岸线细化逻辑 | 去 globals/DOM，纯输入输出 |
| `src/services/world-map/generators/azgaar/borderPaths.ts` | state/province border 绘制路径 | 同上 |
| `src/services/world-map/generators/azgaar/stateLabelPaths.ts` | state labels 路径计算 | 只计算候选路径，显隐/碰撞交给 OpenLayers |
| `src/services/world-map/generators/azgaar/reliefPlacement.ts` | relief 图标布置 | 只取布置算法，不复制纹理/图标资产 |
| `src/services/world-map/generators/azgaar/zoomPolicy.ts` | zoom-based label/marker 显隐 | 改为 LOD policy 表 |

可选来源：Mapgen4，浅克隆 commit `c1d8cb018a11a8b9e17d59233c36c176429d37eb`，
Apache-2.0（https://github.com/redblobgames/mapgen4）。Apache-2.0 要求保留
NOTICE 与许可证副本；若实际移植 `riverGeometry` / `terrainPainting`，本文件与
provenance 登记同步更新。当前阶段（P0–P1）未复制其任何代码。

## Algorithm reference（按思想重写，不复制表达）

- Hinterland（MIT，commit `63f5825bc068882d8af13dcfc01202d121a6fd23`）：stable
  geology stream、provenance/派生历史分层思想。
- Sovereign（MIT）：typed arrays、Worker transfer、ImageBitmap chunk 缓存策略。
- Red Blob mapgen2（Apache-2.0）：可交换生成步骤与 noisy edges 基线。
- mewo2/terrain（MIT，已停止维护）：侵蚀/河流/标签思路。

## Visual reference only（不读入代码与资源，不进入产物）

- Nortantis（**AGPL-3.0**，https://github.com/jeheydorn/nortantis）：手绘外观与
  作者操作流程参考。禁止复制其源码、纹理、图标、art pack 任何部分进入本仓库；
  `parchment` style pack 只按观察重绘。
- Leaflet（BSD-2-Clause）：P1 对照基线，未采用为依赖。
- MapLibre GL JS（BSD-3-Clause）：调研对照，未采用。
- Town Forge（MIT，beta）：未来“地点详情地图”候选（P9），未采用。

## 未采用且明确排除

- 任何 AGPL/无许可证的美术资源；
- iframe / 全局脚本方式嵌入外部完整应用；
- 外部项目的存档格式、全局 DOM 结构或 jQuery dialog。
