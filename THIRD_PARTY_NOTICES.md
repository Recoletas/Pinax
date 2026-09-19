# Third-Party Notices

本文件记录 Pinax 依赖或适配的第三方代码与其许可证。规则见
`docs/engineering/map-source-provenance.md`（Dependency / Adapted source /
Algorithm reference / Visual reference only 四级）。

## Dependency（包管理器直接依赖）

| 组件 | 版本 | 许可证 | 用途 | 上游 |
|---|---|---|---|---|
| Autosize (`autosize`) | 6.0.1 | MIT | 设定正文自适应高度，保留原生文本选择与输入；许可证随 npm 包分发 | https://github.com/jackmoore/autosize |
| Dexie (`dexie`) | 以 package-lock.json 为准 | Apache-2.0 | 记忆历史 IndexedDB schema、查询、批量操作及事务；复用上游数据库封装 | https://github.com/dexie/Dexie.js |
| OpenLayers (`ol`) | 10.10.0（锁定） | BSD-2-Clause | 地图视口、矢量图层、标签 declutter、选择/绘制/修改/吸附。只进入地图懒加载 chunk | https://github.com/openlayers/openlayers |

BSD-2-Clause 原文（摘要）：允许使用、复制、修改、分发与商用，须保留版权声明与免责声明。
完整许可证文本随 npm 包 `ol/LICENSE.md` 分发。

## Adapted source（复制并改写，逐文件登记）

### StoryForge 跑团与漫画（2026-09-17）

2026-09-19 追加移植：固定 `1935dab9670069f1336be0b09c096c1444bbada6` 的 run/hash、checkpoint 恢复分类与 KP 循环适配到 `src/services/experience/run/` 和 `roleplayKpCoordinator.js`；工具授权结构适配到 `toolExecutionAuthorization.js`。保留同一 MIT 许可与版权，数据库、同步摘要、预算和副作用 owner 按 Pinax 调整。

Utopia `ca4678084da46311c1d24cb65d05f340d8903e54` 的 `crates/utopia-store/src/temporal.rs` 算法适配到 `src/services/memory/ledger/temporalCoordinator.js`，Rust/Postgres 改为 JS 纯规划及 Dexie 确认事务，修改范围在源码头说明。Apache-2.0 许可随 [utopia-LICENSE.txt](./public/third-party/utopia-LICENSE.txt) 分发，上游该版本无 NOTICE 文件。

固定上游 [yuanbw2025/storyforge](https://github.com/yuanbw2025/storyforge/tree/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed)，MIT，Copyright (c) 2026 yuanbw2025。

- `src/services/experience/roleplay/third-party/storyforgeDice.js` 从 `src/lib/ttrpg/dice.ts` 移植闭合骰式解析、范围检查与 uint32 拒绝采样；去 TypeScript 类型及 SHA-256 V2 变体，保留来源。
- `src/services/media/comicRequestGuard.js` 参考 `src/lib/comic/image-request-guard.ts` 的请求登记/未知结果策略，按 Pinax owner 重写；不是逐行复制。其余漫画与场景代码按设计语义本地实现，未导入上游媒体或规则全文。
- [完整 MIT 文本](./public/third-party/storyforge-LICENSE.txt) 随 public 目录进入构建产物，不依赖压缩后可能被删除的源码注释。本仓库根许可证不替代该许可。

### Azgaar（原计划登记）

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

- Utopia（Apache-2.0），`deeplethe/utopia` commit `e879b7a1694c9e4eb78d2f048da361fe03905330`：
  `migrations/0003_graph.sql` 与 `0018_a_fact_awaiting_a_nod.sql` 的事实版本、记录时间与有效时间分离、未知时间、候选隔离及来源语义。
  本轮没有复制 Rust/PostgreSQL 服务或 SQL；数据库实现直接依赖 Dexie。Pinax 的小说纪年与同步旧接口恢复队列为本地适配。
  2026-09-17 事实账本新增参考 `60df635d6924127c9a57e98acbd99e43bdd92d08` 的集中记录轴与分表设计，仍无源码复制；见 `docs/engineering/memory-fact-ledger.md`。

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
| pinax-cover-fold.png | `public/` | 默认封面美术 | 2026-09-16 使用内置 imagegen 生成；非商业参考截图提取，提示词与用途见 `docs/engineering/home-workspace-design.md` |
| LXGW WenKai（霞鹜文楷）子集 woff2 | `src/assets/fonts/LXGWWenKai-Regular.woff2` | 字体 | 已登记：SIL OFL 1.1，`src/assets/fonts/OFL.txt` 为完整许可文本 |
| authoring-image-style-presets.webp | `src/assets/media/` | 美术（随应用分发） | **unknown**：AI 生成图，生成工具与可授权性未登记 |
| docs/demo/border-kingdom-adventure.md | `docs/demo/` | 演示手测稿 | 原创合成内容；含内部流程用语，公开前可做一次措辞清理（非阻断） |
| docs/engineering/map-p1-assets、authoring-c1-assets | `docs/engineering/` | 引擎渲染/产品截图 | 本项目生成，无第三方权属 |

2026-09-14 清理：Kao 六张角色美术、带水印参考图、14 张旧主题截图/概念图和占位剪影已从当前树删除；它们不再属于公开候选。历史提交仍保留原记录，若未来重写历史需另行决策。
