# Status

<!-- 多 session 共享状态；长期历史写入 docs/LOG.md。 -->

## 当前安排

| Owner/session | Worktree | Branch | Scope |
|---|---|---|---|
| Codex | `/home/recoletas/jiuguan/text-game-framework` | `main` | 地理、历史、运行时与跨功能整合；不启动本地 dev server |

## In flight

- **地理 -> 历史 -> 冒险主线**：PlaceEntity、语义点逐项审阅和历史/条目逐项地图入口已贯通；继续推进浏览器 smoke、历史因果和受控状态变化。
- **测试基线收口**：核心套件已收缩到 18 files / 200 tests，只保留主数据流、地理历史、运行时、记忆、素材、恢复和地图视觉基线。
- **跨功能资产收口**：素材已补 `sourceRefs`、内容指纹、章节选区去重和同项目合并；下一步接写作/分镜来源账本。
- **媒体与联机专项开始实施**：共享图片 provider/config store、MediaAsset 目录及 narrative/canvas/Markdown image bridge 已建立；插画已有独立参考图工作区。漫画 M1 已直接在现有漫画页补齐格框、方向、视觉圣经和制作阶段字段；下一步执行 M2 改编分页和视觉圣经。分镜视频和联机仍待后续切片。
- **并行实施包待启动**：联机服务端、联机客户端、Agent 基础统一、画布优化和视频任务网关已按互斥写集拆为 A-E 五个窗口，F 负责合并后的体验/分镜接线与 200 测试收口；提示词和冻结契约见 `docs/agent-runs/2026-07-16-online-agents-canvas-video/`，当前尚未声称任何窗口已实现。
- **文档收口**：`docs/PLAN.md` 和 `docs/plan/pinax-integrated-product-roadmap.md` 是唯一产品计划入口，旧执行计划不再恢复。

## Recently done

- 2026-07-16：完成漫画 G4.4 M1：沿用现有漫画页直接增加画布、视觉圣经、格框、方向和制作阶段字段；内容、构图、参考或视觉规则变化会标记阶段 stale。副工作台无素材时仍显示，空状态直接提供阅读方向、色制和“建立制作页”，不再展示旧的 4/6 格入口；进入制作页后分镜/制作字段默认展开。`verify:full` 通过 188 core + 12 visual tests、Vite/VitePress build 和 diff check，未启动 dev server。
- 2026-07-16：删除重复、局部和历史 UI 测试，核心回归收缩到 18 files / 200 tests；`verify:full` 也不再重复运行视觉套件。
- 2026-07-16 15:43 CST：完整 `npm run verify:full` 通过，核心段 17 files / 188 tests、视觉段 1 file / 12 tests；Vite build、VitePress docs build 和 `git diff --check` 均通过，未启动 dev server。
- 2026-07-16：抽出共享图片 provider/config store、MediaAsset 目录及 narrative/canvas image bridge；素材、分镜生成历史、`reference-image` 与画布附件成功归档后不再内嵌 base64，失败时保持原样；`verify:full` 通过 188 core + 12 visual tests。
- 2026-07-16：`ImageGenRail` 降级为兼容包装，业务实现迁入 `MediaGenerationDrawer`；素材页增加参考图/插画模式，Markdown 正文图片改存 MediaAsset 引用并迁移旧 data URL；`verify:full` 通过 188 core + 12 visual tests。
- 2026-07-16：素材页视觉工作流技术原型完成并重排入口：删除浮动抽屉，中央主卡显示图片/拼页，右侧副工作台承载生成操作。ComicPage 与 MediaAsset 分离持久化，支持失败隔离、版本保留、存为素材和 JSON manifest，但不再视作完整漫画排版。
- 2026-07-16：补齐素材视觉工作流细节：模型选择改为插画/漫画共用的选择、增改删与连通性弹层；参考图进入 MediaAsset 并由 SD WebUI、OpenAI Images、Stability 或通用 HTTP adapter 实际消费；漫画整页与对白层进入中央预览，右侧可切格、改格序和管理 take。
- 2026-07-16：素材页“参考图 / 插画”拆为不同工作区：参考图页只负责图库选择、上传和强度，插画页只保留生成表单并以摘要引用已选参考图；画幅和数量由九个按钮收为两个下拉项。单一参考图模式的旧页面继续保留原生成行为。
- 2026-07-16：`main` 上将插画生成与模型弹层改用素材页档案纸张、虚线分隔和轻量按钮语言；漫画工作台改为整页版式、页面缩略导航和当前格集中编辑，新增四格/六格强调版式、按格子比例生成、批量补齐未完成格及整页 PNG 导出，旧漫画页和候选图继续兼容。`verify:full` 通过 188 core + 12 visual tests、Vite/VitePress build 和 diff check。
- 2026-07-16：完成漫画专项复审与主计划重写；现有固定格数实现降级为 v1 原型，G4.4 新增八阶段制作管线、v2 数据模型、provider 能力降级、工作台信息架构、M0-M7 门禁和 200 测试上限策略。

## Next up

1. 完成真实浏览器 smoke：地图重复生成、历史开局、冒险写回和状态回滚。
2. 把控制权、角色状态、年代冲突和下游 stale 标记接进 runtime 因果报告。
3. 将 `sourceRefs` 继续接入写作 context ledger、分镜版本和后续媒体任务。
4. 漫画进入 G4.4 M2：实现同一素材的多页改编候选、页级 beat/page-turn hook，并从角色、地点、已有插画建立可审阅的语义视觉圣经；M2 门禁通过前不进入自由格框画布。测试总量继续保持不超过 200。
5. 用户可并行启动执行包 A-E；全部结果合并后再启动 F，禁止多个窗口同时修改 `server/index.js`、`Experience.vue` 或 `ProseEssay.vue`。

## Working rules

- 不启动用户已经运行的 dev server，也不替用户处理后端 LLM 配置。
- 不回滚其他用户 WIP；修改共享文档时只保留当前事实和可执行下一步。
- 新功能先写入当前主计划对应 Gate，避免重新创建独立平行路线图。
