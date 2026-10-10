# 已知问题与当前限制

> 用来区分新回归、已知缺口和已接受限制。纯 backlog 不放这里。

## 状态约定

- 🔴 **活跃问题**：当前正在处理或会影响近期验收。
- 🟡 **已知缺口**：暂不阻断，但后续工作必须看见。
- 🟢 **稳定限制**：已接受的边界，不按 bug 处理。

## 活跃问题

### 真实生成的质量边界

- 2026-10-04 的实际巡检及后续修复见[实际使用记录](../agent-runs/user-journey-20261004.md)。地点提取已取得三条可审阅结果；漫画分页改用单次流式请求后，真实完成审阅、建页、刷新和切页制作。上游网络仍可能失败，失败不会伪装成已生成。
- 明确收束的写作要求和跑团行动权限已在发布前检查，最多修订一次；检查失败不提交正文。三类写作收束样本和失败检定样本通过；航海记录样本修订后仍有无依据推断，已阻断，不能记作生成质量通过。模型检查也会误判，本地终点与人物/行动断言检查仅覆盖明确规则，不能保证识别所有隐含越界。
- 记忆提取会保留完整来源句；未来、条件、否定、转述限定丢失时，候选退回带限定的原文记载。真实样本与接受后的账本投影已核对，作者仍需审阅候选；这不代表跨模型质量矩阵完成。
- 视频已支持自动转存原件、失败重试、本地播放与完整 ZIP 备份。单文件上限 64 MiB；保存失败会保留“仅链接”状态。浏览器数据被清除、旧链接过期且原件未保存时，不能保证找回。

### 写作工具运行时

- 2026-10-05 接入现有助手的“写作与修改”，并补完取消、续接、同站代理与采纳回执；合成流程和真实 MiniMax 首次/续接样本已核查，见[接入记录](../agent-runs/pr5-integration-20261005.md)。这不代表跨模型质量矩阵完成。
- 2026-10-07 统一模型漏斗（阶段一）+ 2026-10-08 直连全退役（用户裁定）：六路文本调用（讨论/审校/设定/agent-step/正文生成×2）与结构化生成**一律经 kit 任务面**（`/v1/pinax/complete`）以注册表模型出活；**直连已全面取消，原「自带 key 的自定义配置保持直连」作废**。用户 key 仅剩两个用途：设置页探测（`/models`、`/test`）与「选中即热切内核」（`/model` 热生效；公网部署 403）。「服务器模型」由 pi-agent 内核自持，浏览器不接触内容生成密钥；内核不可用统一报「未检测到可用模型。请先启动 pi-agent 任务面（serve:pinax），并在设置中选择模型。」。Anthropic 协议配置自 2026-10-08 起可作为全局模型（kit 内核接入 `anthropic-messages` 传输，设置页选中即热切）；该线不消费 `response_format`，结构化输出靠提示内显式 Schema 兜底。
- 需要服务器安装适配器依赖并启动 loopback runtime；本轮未部署公网。普通体验的开关默认关闭，严格推演仍保留原生发布前验收。
- 新增工具仅查本轮有限快照，不提供资料原件全文、外部数据库/RAG、自动替换正文或设定。任务记录不可用时需要显式重新开始任务，原对话仍保留。
- 🟡 2026-10-08 实测：kit 侧守护计划任务 `kit-guard`（每 5 分钟巡检 8421 内核 / 8431 协议面 / 30142 面板，启动器在 `storyflow-kit/scripts/ops/`）**当前不工作**——计划任务显示 State Ready、`LastTaskResult 0`，但三探针全 down（8451 存活），`%TEMP%\kit-core.log`（10-05 01:53）与 `kit-web.log`（10-06 05:37）两天多零增长。`LastTaskResult 0` 不能当巡检成功证据：`kit-guard.vbs` 用 `Run ..., 0, False`（第三参 False = 不等待），wscript 立刻退出、任务立刻报 0，`.bat` 作为孤儿继续跑，返回码与巡检结果完全解耦。三条候选根因（作业对象回收孤儿 / 计划任务上下文缺 PATH / `.vbs` 关联被改）均未确证，需用户亲手起长驻服务时复验。修好前 8421/8431 无人拉起，需要时手工启动；8451 由 Pinax 宿主 `storyAgentRuntime.js` spawn 监督，不受影响——监督拓扑见 [current-architecture](../engineering/current-architecture.md)。
- 🟡 8421 内核 HTTP 面 CORS 为全反射且无鉴权：`storyflow-kit/core/src/http.ts:21` `void app.register(cors, { origin: true })` 对任意来源放行。8451 任务面已在 2026-10-08 收为白名单；8421 当前仅 loopback 监听时实际风险有限，但只要被暴露（端口转发/公网）即全开——修复前不要将 8421 暴露到 loopback 之外。

### 受控项目记忆系统外部门禁

- ✅ 2026-08-22：M0 记忆内核（schema v2、确定性 importance、可解释 lexical 排序、来源 revision 失效、receipt/软上限）与 M1 运行时/UI 接入（四类触发边界、observer 输出进候选 owner、facade memory reader、Authoring 低干扰审阅）代码侧完成；全量 34 文件 / 300 用例与 verify:full 通过。
- 🟡 **已知缺口**：live browser audit 未对本分支运行——本机仅有服务共享 checkout 旧代码的用户进程，按计划不重启用户服务，1440/1024/390 与 200% zoom 记为 not run。
- 🟡 **已知缺口**：真实 provider 3×3 矩阵仍未完成（原验收时未配置渠道）；此前未测的提交/审阅链在 2026-10-04 有代表性实测：新章节切换触发提取 HTTP 200、查看引文、接受、撤回及决定记录通过；跨 provider、所有迟到/并发分支仍不能据此宣称通过。
- 处理入口：[受控记忆 handoff](../agent-runs/2026-08-22-controlled-project-memory/summary.md)。

### 统一创作工作区（Authoring）外部门禁

- ✅ 2026-08-22：`Writing.vue` 已演进为 `Authoring.vue` 并成为 canonical 创作路由 `/authoring`；`/writing` 与 `name: 'writing'` 兼容重定向，一级导航合并为单一“创作”。命令条、事务化 AI 插入 + 请求级撤销、低敏感上下文说明层和 typed exception 审阅已落地；旧体验会话经 `?sessionId=` 幂等投影进章节 writingUnit。
- 🟡 **已知缺口**：Experience 路由尚未下线。Task 8（offline Experience 重定向到 Authoring）的前置条件——parity artifact 含 1440/1024/390 截图与用户验收——未满足，gate 保持 pending；当前 `/experience` 原样可用，属有意保留而非回归。
- ✅ 2026-08-28：菜单、短 Ghost、可编辑长草稿、IME、粘贴和页面 Escape 已收敛到统一交互策略；cursor-dwell 使用文档/节点/光标指纹与 4.2 秒停驻，菜单/弹层/合成期间不再抢输入。
- ✅ 2026-08-28：长推演已从只读 decoration 改为正文版心内的可编辑草稿；草稿可删改/恢复，只有确认纳入才以单事务写正文。
- ✅ 2026-08-28：autosave 与语义观察已解耦；observer 使用 changed-unit delta 和 revision identity，重复排队、已执行 revision 与 exact duplicate 静默跳过，stale 在落库前复核。
- ✅ 2026-08-28：现场“以此推进”的 initialInstruction 已端到端传入 composer；大纲、现场详情、记忆/异常审阅主链的 props、emit 与关闭动作已接通。素材、画布等外围能力仍按文本核心边界冻结，不以新占位壳补齐工具数量。
- ✅ 2026-08-28：Authoring journey 的失败、harness error 与 timeout 现在均非零退出；核心断言不因 provider 不可用而 skip，失败证据受预算约束，成功产物可清理。
- 🟡 **外部门禁**：合成 composition 事件已有自动覆盖，但 Windows 原生中文输入法连续写作、回看前文、Space/`/`、批注与长草稿仍需 30 分钟人工耐久，不能由 synthetic event 代替。
- 🟡 **外部门禁**：真实 provider 的 Ghost/长推演 canary 尚未在本轮凭据环境执行；空返回必须作为渠道失败单列，不能回退为 UI journey 绿灯。
- 🟡 **视觉验收**：自动旅程已覆盖长文滚动、右键、visual viewport 和固定浮层关闭合同；2026-08-28 修复 1024px 右栏压窄正文与 390px 检查器方向错误。2026-08-29 又依据 2559px 用户实图确认并修复最终 Authoring 样式缺少结构所有权的问题：即使旧 scoped 样式在运行态/HMR 中整层缺失，顶栏、章节栏、稿面和工具 rail 也不再退化为满宽普通文档流；常规手机保持单行 chrome，仅 ≤240 CSS px 的 200% zoom 距离换行。12 状态截图为 0 console / 0 scenario failure，390px 200% zoom 四状态为 0 a11y failure。版心、密度与工具栏协调性仍需用户看代表界面确认。
- 处理入口：[Authoring 文本工作台 v3](../superpowers/plans/2026-08-25-authoring-text-workbench-v3.md) 与 [Authoring 前端可靠性/真实用户模拟计划](../superpowers/plans/2026-08-28-authoring-frontend-reliability-and-user-simulation.md)。

### 体验叙事工具协议兼容

- ✅ 单 transcript 工具运行时已完成：assistant tool call、tool result、调用 ID、provider content block、必要的 reasoning metadata 与最终正文保持在同一会话内；typed repair、超时、空/stale 结果与有界恢复已有确定性覆盖。
- ✅ 真实性 MVP 的 selected-speaker voice、world→politics 链和 detached shadow critic 已通过确定性合同与 smoke；普通任务的 shadow critic 不改可见正文，也不落原文或内容指纹。2026-10-04 新增明确要求与跑团权限的发布前检查；该路径不重复执行 shadow 检查。
- 🟡 尚未运行真实 MiniMax、OpenAI-compatible、Anthropic-compatible 渠道上的 world→politics 与 critic timeout/invalid matrix。这是外部 provider 门禁，不是当前已确认的代码回归。
- 🟡 Experience voice editor 与“收进稿件”目的地弹窗尚未执行 1440/390 live browser audit；静态响应式合同、构建和键盘焦点合同已通过。
- 处理入口：[G4.6.13 单 transcript 工具运行时纠偏计划](../plan/pinax-integrated-product-roadmap.md#g4613-单-transcript-工具运行时纠偏计划r0-r8)。

### 地理-历史生产闭环

- ✅ 2026-07-15：地图页已能消费一次完整地图结果，经过 `extractMapSemantics()` 和 `generateGeoHistory()` 生成可审阅草案，并在用户确认后写入当前世界书的 `geoHistory`。
- ✅ 地图语义点已支持逐项审阅；历史节点、事件日志和结构化设定可通过统一 `placeId` 回到地图，`PlaceEntity` 已聚合地图引用、历史节点和世界书条目。
- ✅ 2026-07-15：历史开局写入 `historyNode / placeId`；剧情日志形成后会以稳定 ID 写回 `geoHistory.playerNodes`，并保存有限世界状态快照与审计事件；GM 上下文通过 `PlaceEntity` 按当前地点筛选历史节点和玩家经历。
- ✅ 受限 state delta、确认/拒绝/回滚、因果 v3 与冲突审阅已接通。
- 🟡 当前地图已把 confirmed 世界书地点及其明确关系编译为有限约束，并完成国家归属、同国/异国、沿河和显式道路的直接求解，以及候选地图、逐地点 remap 审阅、局部 stale guard、最近 5 版轻量快照和恢复。自动 remap 仍只使用名称/别名与约束报告，关系图和空间邻近尚未进入评分；父子区域和相邻关系仍以生成后核验为主。地理历史只接受最多 12 个真实命名、非重复锚点候选，水域约束不会创建陆上聚落；真实导入、定位、确认/解除、拖动、刷新、切换世界书和运行时回滚的完整 smoke 仍待执行。
- 🟢 局部地图不再自动生成国家、城市和命名河流；正式地点保留作者命名，定位后还需确认。世界范围仍允许引擎名称池作为预览，这些名字不自动成为世界书事实。范围按当前世界书推断，作者可明确选择局部或世界。
- 🟢 明确的世界书地点现在可以在没有同名地图聚落时直接进入地理筛选；地图仍必须有有效 cell，且没有地点条目的世界书不会把自动生成城市伪装成历史事实。
- 计划入口：[G2.4 世界书约束型 Living Atlas](../plan/pinax-integrated-product-roadmap.md#g24-世界书约束型-living-atlas当前地图主计划) 与 [Gate 3](../plan/pinax-integrated-product-roadmap.md#gate-3历史融入与可解释涌现)。

### 地图生成可靠性压力验证

- ✅ 地图参数和 AI 配置现在只作为候选进入 Worker；新地图与临时 Canvas 完整成功后才持久化并交换。生成或 DPR 重渲染失败时旧地图、旧配置和交互继续可用，失败提示不再盖住旧图。
- ✅ 2026-07-15：`worker-bridge.ts` 超时后会终止当前 Worker，并确保下一次请求创建新 Worker；9 个 Worker bridge 契约测试覆盖超时销毁和超时后恢复。
- 🟡 map version/remap 的核心事务已完成，但尚未执行真实浏览器中的 20 次连续 regenerate、RAF/timer 计数和 heap 回落验证；这属于后续压力验收，不是当前已确认的普遍卡死根因。
- 计划入口：[Pinax 产品整合与演进主计划 Gate 0](../plan/pinax-integrated-product-roadmap.md#gate-0冻结基线与可靠性止血)。

### 地图引擎视觉残留

- 🟡 Round 2 后仍有地形真实感残留问题，但默认 topographic 已降低生态色饱和度与单元噪声，收细海岸、国界和国家标签；地图资料也已退出主舞台并进入可收起 rail。
- 已改善：模板选择和主世界 RNG 已隔离，当前大陆视觉快照保持确定性；`visual-cc1/cc4/cc6` 的实际陆地比例约为 `0.399/0.355/0.418`，差异主要来自最终极地边缘衰减，不再把高度图阶段的目标比例误读为最终可见比例。
- 已改善：极地冰川阈值与高山积雪混色已收紧，随机陆块不再因冰川、高海拔和近白配色叠加成“未渲染白块”；地图资料已支持切换多本世界书，活动世界书 ID 刷新恢复已修复。
- 仍需关注：极地边缘衰减会让多大陆样本的最终陆地比例低于 `landRatio` 目标；模板后处理重复 FBM、`reshapeCoasts` 大轮廓重塑不足、部分模板合同仍是 soft-fail 诊断。
- 处理边界：继续按 Round 2.1 小修推进 LOD、标签碰撞和聚类，不恢复 `realism.level`，不扩成完整 GIS 重写。

### 产品整合收口

- 🟢 2026-09-16 结构预算已进入 CI：`Authoring.vue` 10,832/111、`Notes.vue` 1,530/18、`Experience.vue` 3,547/21、`ProseEssay.vue` 2,785/18、`gameStore.js` 1,636/29；均低于夜间计划硬上限。数字格式为行数/import-from 边数。
- 🟢 `src/services/` 根层 JS 已由计划基线 42 降为 14；生产相对 import 图 0 cycle、production→experimental 0 边、旧根路径 0 引用。后续新增服务仍必须进入明确 domain。当前事实入口为[当前架构](../engineering/current-architecture.md)与 [PLAN.md](../PLAN.md)。

### 漫画与插画工作流收口

- 🟡 当前代码已有多页改编候选、视觉规则、格框画布、阶段图片生成/上传、独立文字气泡、质检定位及单页 PNG/WebP/PDF/条漫切片。此前“尚无这些能力”的描述已过时。
- 2026-10-01 已本地实施：手写空白格生成不再强制素材；阶段图片与直出候选统一当前图，气泡/字号用于预览与导出，溢出阻止成品导出；修按书资料、迟到请求、图库与媒体引用保护、正文/速记图片刷新显示，并统一 UI。[本轮回执](../agent-runs/visual-media-polish-20261001.md)记录检查证据与未运行项。
- 2026-10-03 已续修当前格任务、直接上传、换页保护、阶段失效与默认短句排字；桌面/手机实际上传至成品 PNG 路径、视频同任务恢复及全量门禁已核查，见[媒体续修回执](../agent-runs/media-core-20261003.md)。第二轮补了分页脚本编辑/指定页制作、整页缩放、按镜头视频历史以及素材交接保存保护，见[第二轮回执](../agent-runs/media-continuation-20261003.md)。2026-10-04 已实际查看三次漫画格图和两轮短视频，并复验真实分页建页；长序列连续性仍未验证。
- 序列批量导出、通用插画蒙版编辑和真实模型连续性/画质仍需后续验证与接入；供应商提供编辑能力不代表本地工作台已经接通。
- 计划入口：[Pinax 产品整合与演进主计划 G4.4](../plan/pinax-integrated-product-roadmap.md#g44-素材插画与漫画工作流)。

## 已知缺口

- 🟡 2026-10-10 实测（W4-A）：编辑台（`WorldBookEditor.vue`）页面本体在英文界面有 2 处缺词——tab 名「总览」「章回结算」在 EN 词典无对应，英文界面会直接落中文。与命名收口无关，是既有缺口，补译随 W4-B 的「世界书 → 知识」词表切换一并裁。
- 🟢 2026-10-10 重锚（W4-B-1，承 W4-A 登记的存量红）：`scripts/workspace-consistency-smoke.mjs` 已按当前界面重锚，并改成**可隔离直跑的仓库脚本**：base 走 `PINAX_SMOKE_BASE_URL`（缺省仍是 5173）、截图目录走 `PINAX_SMOKE_SHOT_DIR`。`:21` 的 kicker 不再钉死「关联资料」——`SettingsContextBar.vue` 的文案是「当前作品／关联资料／世界书」三态条件式，断言改钉「在位＋合法态集合」；`.settings-body` 已随控制台改版不存在（现仅 `WorldMapPage` 有），滚轮断言改按「最近可滚动祖先」取意图。隔离栈（自有端口 5365/3965、临时 `PINAX_APP_DATA`/`PINAX_MIRROR_ROOT`、`PINAX_STORYAGENT_ENABLED=0`）实测 exit 0、20 张截图产出，未碰 5173。
- 🟡 2026-10-10 实测（W2-A-2b 修英文冒烟时量到）：`src/components/settings/LocalizationCenter.vue` 的 30 个 `tr()` 字面量与另 3 处（「写作、助手、校对和设定生成共用当前模型…」「粘贴文字」「更多选项」）在 EN 词典无对应，英文界面会直接落中文。该面板含「湮灭浏览器缓存」等破坏性动作，未擅自代译，待作者裁定口径后再补；`scripts/english-settings-smoke.mjs` 已把这一组登记为已知缺口白名单，只对新出现的缺键报红。缺键告警只在 DEV 构建产生（`src/i18n/index.js:45`），跑 prod build 查不出问题。
- 🟡 Windows x64 portable ZIP 已完成压缩完整性、ASAR、PE32+ 及真实 Linux package 激活后路由 smoke。Windows 实测发现的目录 `fsync` `EPERM` 与项目激活后 Web History 白屏均已修复并重建包，但仍需 clean-machine 复验新建、导入、刷新、OS 目录对话框、SQLite、锁与原子替换；host 证据不能替代该门禁。Squirrel installer 仍需 Windows runner，或在 Linux 安装 Wine/Mono 后再生成。
- 🟡 `desktop-project-empty/error/readonly` 已加入 UI audit mock state 和 1440/390 可运行配置，但当前 5173 服务属于另一 worktree。按“不启动或重启现有服务”约定，本分支 live browser audit 未执行；组件行为、初始焦点、键盘、共享 token 与 768px 合同测试已通过。
- 🟢 P1 只建立新桌面项目 repository/schema/bridge，不迁移现有 localStorage 项目记录，也不把 legacy key-value 数据伪装为 SQLite rows。迁移归 P2，plain-text editor 归 P3。
- 🟡 C3 场景素材板在 2026-10-03 已以真实构建完成多尺寸截图及画布到视频交接核查；关系编辑全旅程和真实模型连续性仍不是本轮验证范围。
- 🟡 场景板可确定识别 linked/archived/detached/untracked；通用 stale 状态需要可比较的源 revision 或 content hash 基线，现有旧数据不具备该证据，因此本轮不根据时间或缺失字段猜测 stale。
- 🟡 `ProseEssay.vue` 仍直接持有画布编排状态；是否抽取 `useCanvasBoard` 留到场景板用户验收后决定，避免在交互边界未稳定时先制造新 owner。
- 🟡 MiniMax 官方人像参考已支持 JPG/PNG 的 Base64 Data URL（小于 10 MB）；本轮接入内置代理和自带密钥链。当前适配一次一张人物参考；构图编辑、风格参考、蒙版和漫画后续阶段不能由此视为已支持。部署与真实模型质量验证另行记录。
- 🟡 视频面板已支持重新查询、刷新恢复、内嵌播放与按镜头查看已保存历史；任务恢复记录限当前浏览器标签页，已保存历史来自本地媒体库，服务器任务仍在内存中，服务重启后不能保证找回。MiniMax V1 的“停止等待”不代表渠道已停止生成。`files/retrieve` 的结果是临时链接，实际期限由渠道决定；新结果会尝试保存原件到当前浏览器，历史结果可重试；只有显示“原件已保存”的结果可脱离临时链接播放并进入完整 ZIP。服务器重启不能找回未保存原件的旧任务。
- 🟡 `moveCostForEdge` 已有 biome 缺省值兜底，但 caller 仍应避免传未声明 biome。
- 🟡 states 阶段性能仍有残留问题，见 [states-perf-residual-issue.md](../plan/states-perf-residual-issue.md)。
- 🟡 地图请求原先会把完整世界观、地点正文和冗长 JSON schema 一起发送，超过服务端通用输入预算后可能截掉 system prompt；当前已对地图上下文分段压缩并设置专用输入预算，真实渠道仍需用长世界书做一次浏览器生成 smoke。
- 🟢 世界书地点不再使用稳定随机 fallback，也不再作为随机聚落名称池。自动绑定只读取正式地点条目、显式关系和 geo-history；AI 地图生成可读取当前世界书概述来选择范围与地形，不把概述直接当作正式地点。正文解析仅在结构化设定的“从概述整理”中产生待审草稿。正式地点只对同类 burg、river、road、state 或满足明确地形条件的 cell 生成待确认候选。地图原生聚落可由用户逐项纳入世界书，未选择时仍只是地图事实。旧存档中的 fallback 标记会在重新同步世界书后移除。
- 🟡 多页面仍有 `height: 100vh + overflow: hidden + fixed 浮层` 的组合风险，移动端和低分辨率下需要继续看遮挡、滚动锁死和热区重叠。
- 🟡 页面级断点策略仍不完全一致。
- 🟡 存储安全网已支持动态键发现、带 `schemaVersion` 的导出、无副作用恢复预览与确认后写入；损坏备份不会直接覆盖现有数据。Authoring 在正常刷新、关页和移动后台前会同步尝试保存并先留恢复副本，但浏览器进程被系统强杀时无法保证页面事件执行。当前 JSON 作品备份有意排除模型 API Key，且尚不包含 IndexedDB 中的来源/媒体原件；这些数据需另行迁移。配额耗尽时的恢复提示仍需继续打磨。

## 稳定限制

- 🟢 素材插画的紧密型环绕使用 CSS Shapes Level 1：透明图片可按 alpha 轮廓环绕，不透明图片退化为矩形；浏览器浮动排版只能让一行文字位于对象一侧，因此不提供与紧密型效果重复、却无法复现 Word 内部空洞排文的“穿越型”假选项。
- 🟢 地图管线不追求 100% 复现 Azgaar；目标是保留模板语义并提升本项目视觉真实感。
- 🟢 离线程地图生成通过 comlink 桥接，worker 边界需要 strip Vue reactive proxy。
- 🟢 VitePress 文档站入口为 `docs/src/index.md`；不要提交 `.vitepress/cache/` 或 `.vitepress/dist/`。
- 🟢 公开 API 详细说明不维护；当前文档层只记录仓库事实、风险和决策。

## 验证提示

地图、备份、存储和地理历史定向测试当前通过；全量测试已恢复通过。地图模板软合同和 jsdom/canvas 输出仍是非阻断诊断；以 [test-status.md](./test-status.md) 的当前验证结果为准。
