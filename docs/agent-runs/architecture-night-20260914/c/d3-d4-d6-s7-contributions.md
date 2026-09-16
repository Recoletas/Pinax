# C 线文档供稿（D3 / D4 / D6 / S7 案例）

基线 `37e0679`，C 分支 `arch/notes-20260914`（21f0319 + fac4d8c）。以下供 O 合并公共文件；
事实均按当前实现核实，附代码位置。

## D3 · 用户导入 / 备份 / 自救（C 域事实）

素材（/materials）与书稿是两套数据，公开文档必须分开表述：

| 事实 | 依据 |
| --- | --- |
| 素材页新建/编辑的是「素材」（narrative asset），存于 localStorage `narrative_assets_v1`，不是书稿章节；历史上 UI 内部叫 chapters 是遗留命名 | `src/services/media/narrativeAssets.js`、C0 地图 |
| 书稿 TXT/Markdown 导入在写作/欢迎入口（自动识别 GB18030/UTF-8）；设定来源 DOCX/PDF 导入在世界书入口；素材页不承担这两类导入 | `src/services/writing/writingManuscriptImport.js`、`src/pages/Notes.vue`（无导入文件入口） |
| 作品 JSON 备份**包含素材正文/标题**（`narrative_assets_v1` 在备份键清单中），因此素材会随书稿备份走 | `src/utils/backupExport.js` 备份键清单 |
| 素材/画布的**图片二进制在 IndexedDB**（mediaAssetStore），JSON 备份不含二进制原件；含图素材恢复后图片引用可能失效，需要重新生成或重新关联 | `src/services/media/mediaAssetStore.js`、current-architecture §3 |
| 素材顾问（AI 精简/分类/拆分/关联）结果先成为候选，作者采用才写入素材；可撤销（receipt 快照），编辑后旧结果标 stale 不会覆盖 | `src/composables/useNotesMaterialAdvisor.js` |
| 自救入口：备份/诊断面板的「诊断导出」只含变量名/计数，不含正文、标题、素材 ID、密钥；素材保存失败时输入保留在编辑器（saveStatus=保存失败，输入已保留），可再次尝试保存或手动复制 | `src/utils/betaDiagnosticExport.js`、`useNotesAssetEditor.js` |

建议 README 措辞（供 O 采纳）：
“备份包含素材文字与画布结构；素材图片原件存于浏览器 IndexedDB，不随 JSON 备份导出。”

## D4 · 当前架构 C 域更新素材（供 O 合入 current-architecture.md §3/§7）

2026-09-14 C 线后 Notes 域 owner：

| 职责 | owner | 生产入口 |
| --- | --- | --- |
| 素材目录/排序/分组/勾选/批量状态/合并/删除后选择/画布交接反馈 | `src/composables/useNotesAssetCatalog.js` | 页面模板同名绑定 |
| 标题/正文编辑真源、模式切换、去抖保存、切换前保存、beforeunload/卸载冲刷、保存失败保留输入 | `src/composables/useNotesAssetEditor.js` | catalog.selectChapter / 模板事件 |
| 顾问结果采用/撤销（text-patch 与 material-* 事务两链的 revision/receipt 合同） | `src/composables/useNotesMaterialAdvisor.js` | AdvisorPanel @apply-result/@undo-result |
| markdown↔html/纯文本/图片描述符纯转换 | `src/services/notes/assetMarkdown.js` | editor + 页面插画域 |
| 插画 DOM 交互、图片版式、呈现计算 | 仍留在 Notes.vue 页面（下一刀 C7/C8） | 模板事件 |
| 正式写入边界（不变） | `narrativeAssets` 服务 + `relationCanvas` + 媒体桥 | — |

异步身份链：图片迁移（asset id + 内容双身份世代核对）、图片 hydrate（loadNotes 世代）、
媒体渲染 hydrate（revision 世代）、画布导入（C3：捕获发起素材 + 存在复核 + 仅停留时导航）、
顾问采用/撤销（baseText/revision + receipt 快照，C6）。

## D6 · C 域过期/易误导说明清单（供 O 审阅后修）

| 位置 | 问题 | 建议 |
| --- | --- | --- |
| `docs/src/code-map.md` 素材行 | 入口仍写 `src/pages/Notes.vue` 单点，未反映 catalog/editor/advisor owner | 更新为三 owner + 服务边界 |
| `docs/engineering/current-architecture.md` §6 | Notes.vue 行数会持续变化，写死 5,583 易过时 | 改为“规模以 git 统计为准”，保留热点判断 |
| README 能力表 | 未区分「素材」与「书稿」数据边界（D3 表） | 按 D3 措辞补一句 |
| 历史 LOG/agent-runs 中 UI-N6/N9/N10 编号注释 | 属历史证据，保留原文；不在公开入口引用 | 不动 |

## S7 · 两个“不应触发额外工作”案例（供 S7 桌面推演用）

1. **案例 A（文档一行事实纠偏）**：README 把素材图片写成“随备份导出”是错误事实。
   新规则要求：改正一行 + 引用 backupExport 键清单即可；**不该**触发真实模型验证、
   截图矩阵、多代理评审或全站链接工程。门禁按当时生效规则（本例 verify:full 已有证据可引用）。
2. **案例 B（已有规则未执行，而非缺规则）**：某次素材数据丢失若源于没跑 `npm run test:run`
   就交付——docs-status-handoff/testing-verification 已要求验证，属执行缺失；
   **不该**新增“务必每次都跑测试”的第二条规则，应按 S6 复核为何未触发。
