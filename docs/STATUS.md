# Status

<!-- 多 session 共享状态；长期历史写入 docs/LOG.md。 -->

## 当前安排

| Owner/session | Worktree | Branch | Scope |
|---|---|---|---|
| Codex | `/home/recoletas/jiuguan/text-game-framework` | `integration/online-agents-canvas-video-f` | A-F 集成、版本恢复与最终验证；不启动本地 dev server |

## In flight

- **地理 -> 历史 -> 冒险主线**：PlaceEntity、语义点逐项审阅和历史/条目逐项地图入口已贯通；继续推进浏览器 smoke、历史因果和受控状态变化。
- **测试基线收口**：核心与新增联机、Agent、画布、视频契约合计 23 files / 188 tests，视觉基线 12 tests，总量保持 200。
- **跨功能资产收口**：素材已补 `sourceRefs`、内容指纹、章节选区去重和同项目合并；下一步接写作/分镜来源账本。
- **媒体与联机专项完成首版接线**：URL 房间、服务端有序事件、房主生成叙事与受限运行时同步已接入现代体验页；MiniMax 视频已切到官方 `video_generation -> query -> files/retrieve` 协议，通用异步 HTTP adapter 继续保留。
- **A-F 执行包已集成**：Agent 基础契约、画布视口/连线调度、联机服务端与客户端、视频网关和页面接线已汇合；完整验证通过，等待用户在现有服务中做双浏览器与真实 provider smoke。
- **Round 2 可见性与工作流已集成**：体验 mast 提供联机常驻入口；画布顶栏直接提供视频生成，导出菜单只保留导出；节点拖动以瞬时坐标渲染并在结束时写回原始模型，牌堆空白拖动移动整堆；顾问和漫画生命周期已接入。
- **文档收口**：`docs/PLAN.md` 和 `docs/plan/pinax-integrated-product-roadmap.md` 是唯一产品计划入口，旧执行计划不再恢复。

## Recently done

- 2026-07-19：漫画制作保留独立 `/comics` 工作区，但入口和右侧模式导航均与素材页的“相关素材 / 插画生成 / 漫画制作”三联入口对齐，可带当前素材往返文字与插画模式。漫画页恢复素材页的 260/主区/340 三栏比例、左侧素材抽屉纸面和右侧副阅读台外观；素材选择只写入当前格 `continuityRefs`，不再自动填画面描述。单格生图改为连续性优先：MiniMax 不再把长负面词串拼回正向提示，而以原素材、全页视觉约定、上一镜锚点、当前剧情推进和摄影设计组成短提示；支持参考图的渠道仍复用上一格成图。`verify:full` 通过核心 188 + 视觉 12、Vite/VitePress build 和 diff check；900/1440px 浏览器回归通过，未启动 dev server。
- 2026-07-19：`integration/online-agents-canvas-video-f` 修复漫画批量补齐把单格画成多格拼贴的问题：提示词强制单幅当前瞬间、无边框且无任何文字，并纳入原素材、页级视觉规则、当前镜头和上一格视觉锚点；支持参考图的 provider 复用上一格成图，MiniMax Image 使用文本锚点降级。脚本对白/旁白不再自动进入预览和 PNG，改为可明确排入、添加、编辑、拖动和缩放的对白/心声/旁白/拟声文字对象。`verify:full` 通过核心 188 + 视觉 12、Vite/VitePress build 和 diff check；1440px 浏览器回归通过，未启动 dev server。
- 2026-07-19：漫画副工作台拆为“页面规划 / 分格制作”，默认将格序导航、模型和当前格制作前置；空白态真实支持 4/6 格，页面与格级编辑补齐阅读方向、视觉连续性、剧情 beat 和构图调度。修复 Notes 在 AppShell 内重复使用 `100vh` 导致右栏底部裁切的问题，900px 窄屏仍保留素材索引/主区/副工作台且无横向溢出；左侧斜放便签改为轻微错落、柔和纸影和压印选中态。`verify:full` 通过核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 和 diff check，总量 200；未启动 dev server。
- 2026-07-19：素材插画进入真实正文排版：资产主图和正文 Markdown/MediaAsset 图片统一为可编辑插画节点，支持嵌入、四周/紧密、上下和前后层；图片按原始比例无承托层显示，可拖动更新锚点/坐标并用右下角缩放，八种版式只在图片右键菜单出现。修复根节点 pointer capture 清除选中态和拖图遮挡落点检测；每张正文图片按媒体 ID 独立持久化构图。`verify:full` 通过核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 和 diff check，总量 200；浏览器回归覆盖主图及 Markdown 图片选中、右键、缩放、拖动和持久化；未启动 dev server。
- 2026-07-18：素材图片模型配置新增 MiniMax Image，接入 `image-01` / `image-01-live`、官方同步生图、标准画幅、base64 结果和业务错误识别；视频面板移除每次填写的 Key/地址/渠道表单，新增与图片配置一致的添加、编辑、测试、删除和持久选择流程，MiniMax 与自定义异步 HTTP 配置随备份导出。确认 MiniMax 图片接口允许本地 Vite 来源跨域携带鉴权。`verify:full` 通过核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 和 diff check，总量 200；未启动 dev server。
- 2026-07-18：卡片画布视频改为按当前镜头生成，不再把整版长文本截断后塞入一个 6 秒任务；生成面板增加镜头选择和可编辑最终提示词，纳入景别、MiniMax 运镜指令、转场、卡片关系、上一镜视觉锚点、色调、情绪、对白和环境表现。MiniMax 提示词自动改写默认关闭，归档补齐镜头参数。`verify:full` 通过核心 23 files / 188 tests、视觉 12 tests、Vite/VitePress build 和 diff check，总量 200；未启动 dev server。
- 2026-07-18：修复 MiniMax 视频任务首次进入 `running` 后，第二次 `Preparing` 轮询因非法 `running -> running` 自迁移而静默退出的问题；后续轮询改为原地更新进度，runner 保持活动直到成功、失败、取消或超时。创建日志改为结构化脱敏配置，并在 provider 状态变化时记录 `Preparing / Queueing / Processing / Success`。现有已卡住的本地任务无法自动恢复，需先查询上游任务或在加载新后端后重新提交。
- 2026-07-18：MiniMax 视频 adapter 从失效的旧模型和 `/video/generations` 假定切换到 `api.minimaxi.com/v1` 官方协议；支持 Hailuo 2.3/02、T2V-01 Director/T2V-01 的合法时长与分辨率组合、`base_resp` 业务错误、10 秒 provider 轮询和 `file_id` 下载地址解析。分镜视频面板的渠道下拉直接列出四个具体模型，前端内置官方模型表，旧后端返回的 `MiniMax-video-01` 不再覆盖新选项，并会被识别为旧协议而阻止测试/提交，避免误报上游 404；结果地址约一小时有效。测试总量保持 200，未启动 dev server。
- 2026-07-17：修复画布拖动修改布局副本导致回弹的问题；pointermove 只更新瞬时位置，pointerup 按节点 ID 写回原始模型，落点识别跳过被捕获节点，牌堆空白拖动改为移动整堆。视频生成升为画布顶栏常驻动作并从导出菜单移除；素材类型、画布导入、专业信息、节点纸片、关系工具和时间轴统一为档案工作台样式。未启动 dev server。
- 2026-07-17：按 A -> D 顺序集成 Round 2 四个独立分支，并在 Codex 审查中修复顾问无 runner 假 applied、漫画连续性/空白引用持久化、pointer cancel 回滚和 ComicPage schema 3 契约；随后补齐 Vite `/ws` 代理。联机聊天移到体验画面左下角，无消息时收为记忆按钮上方的透明 30px 入口；房间状态收为右侧顶栏下方的紧凑浮层。测试总量保持 200，未启动 dev server。

## Next up

1. 完成真实浏览器 smoke：地图重复生成、历史开局、冒险写回和状态回滚。
2. 把控制权、角色状态、年代冲突和下游 stale 标记接进 runtime 因果报告。
3. 将 `sourceRefs` 继续接入写作 context ledger、分镜版本和后续媒体任务。
4. 漫画进入 G4.4 M2：实现同一素材的多页改编候选、页级 beat/page-turn hook，并从角色、地点、已有插画建立可审阅的语义视觉圣经；M6 已有基础文字对象，但尾巴、字体、溢出/遮挡检查和 manifest 往返仍留在后续门禁。测试总量继续保持不超过 200。
5. 用已保存配置分别完成一张 MiniMax `image-01` 插画和一条 6 秒 / 768P 单镜头视频真实 smoke；确认图片归档、景别/运镜/衔接指令及临时视频地址处理。继续完成联机双浏览器 smoke。

## Working rules

- 不启动用户已经运行的 dev server，也不替用户处理后端 LLM 配置。
- 不回滚其他用户 WIP；修改共享文档时只保留当前事实和可执行下一步。
- 新功能先写入当前主计划对应 Gate，避免重新创建独立平行路线图。
