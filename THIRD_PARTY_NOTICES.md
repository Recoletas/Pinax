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

## Production dependencies（2026-09-14 按 package-lock 实装版本核验）

以下为 `dependencies`（进入发行包）的直接依赖与其实装许可证；devDependencies 不随源码/产物分发，
未逐项列出。版本以 lockfile 实装为准；升级依赖时同步更新本表。

| 组件 | 实装版本 | 许可证 | 用途 |
|---|---|---|---|
| vue / vue-router / pinia | 3.5.33 / 4.6.4 / 2.3.1 | MIT | UI 框架、路由、状态 |
| @tiptap/*（starter-kit、vue-3、pm、extension-unique-id） | 3.29.2 | MIT | 正文编辑器 |
| express / cors / ws | 4.22.1 / 2.8.6 / 8.21.0 | MIT | 本地服务端、WS |
| better-sqlite3 | 12.11.1 | MIT | 服务端 SQLite（原生模块） |
| axios | 1.15.2 | MIT | HTTP 客户端 |
| comlink | 4.4.2 | Apache-2.0 | Worker RPC |
| dompurify | 3.4.7 | (MPL-2.0 OR Apache-2.0) | 富文本净化 |
| mammoth | 1.12.1 | BSD-2-Clause | DOCX 导入 |
| marked / turndown | 18.0.3 / 7.2.4 | MIT | Markdown 双向转换 |
| pdfjs-dist | 6.2.108 | Apache-2.0 | PDF 导入 |
| mem0ai | 3.0.3 | Apache-2.0 | 记忆服务客户端 |
| graphology / graphology-shortest-path | 0.26.0 / 2.1.0 | MIT | 设定图谱 |
| d3-hierarchy / delaunator | 3.1.2 / 5.1.0 | ISC | 地图层级/三角剖分 |
| ol（OpenLayers） | 10.10.0 | BSD-2-Clause | 地图视口（见上节） |
| lucide-vue-next | 0.468.0 | ISC | 图标 |
| alea | 1.0.1 | MIT | 种子随机 |

## 仓库内资产权属清单（B02 盘点，2026-09-14）

以下清单覆盖首屏与发行包高可见素材。**unknown 表示来源/授权未登记，公开前需作者确认或替换**；
本清单不删除任何文件，仅标注公开阻断候选。

| 资产 | 位置 | 分类 | 状态 |
|---|---|---|---|
| LXGW WenKai（霞鹜文楷）子集 woff2 | `src/assets/fonts/LXGWWenKai-Regular.woff2` | 字体 | 已登记：SIL OFL 1.1，`src/assets/fonts/OFL.txt` 为完整许可文本 |
| kao-archive 系列角色档案图（6 张 webp） | `src/assets/characters/kao-archive-*.webp` | 美术（随应用分发） | **unknown**：源自社交媒体视频画面的衍生/再创作（对应 `docs/demo/kao.jpg` 截屏，含平台水印痕迹）。公开前需确认授权、替换或下架 |
| authoring-image-style-presets.webp | `src/assets/media/` | 美术（随应用分发） | **unknown**：AI 生成图，生成工具与可授权性未登记 |
| docs/demo 演示截图（welcome/experience/n5c/exp-v2/writing 等 11 张） | `docs/demo/` | 产品截图 | 截图本身为本项目产物；其中嵌入上述 kao-archive 美术，公开时继承同一权属问题 |
| docs/demo/kao.jpg | `docs/demo/` | 第三方平台截屏 | **unknown**：小红书视频截屏（含平台账号水印），建议公开前删除或获授权 |
| docs/demo/pinax-welcome-ak / -p5r jpg | `docs/demo/` | 概念图 | **unknown**：AI 生成概念图（画面文字为无意义生成物），来源未登记 |
| docs/demo/border-kingdom-adventure.md | `docs/demo/` | 演示手测稿 | 原创合成内容；含内部流程用语，公开前可做一次措辞清理（非阻断） |
| docs/engineering/map-p1-assets、authoring-c1-assets | `docs/engineering/` | 引擎渲染/产品截图 | 本项目生成，无第三方权属 |
| stub-silhouette.svg | `src/assets/characters/` | 占位美术 | 本项目产物 |
