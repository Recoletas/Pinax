# 已知问题与当前限制

> 用来区分新回归、已知缺口和已接受限制。纯 backlog 不放这里。

## 状态约定

- 🔴 **活跃问题**：当前正在处理或会影响近期验收。
- 🟡 **已知缺口**：暂不阻断，但后续工作必须看见。
- 🟢 **稳定限制**：已接受的边界，不按 bug 处理。

## 活跃问题

### 受控项目记忆系统外部门禁

- ✅ 2026-08-22：M0 记忆内核（schema v2、确定性 importance、可解释 lexical 排序、来源 revision 失效、receipt/软上限）与 M1 运行时/UI 接入（四类触发边界、observer 输出进候选 owner、facade memory reader、Authoring 低干扰审阅）代码侧完成；全量 34 文件 / 300 用例与 verify:full 通过。
- 🟡 **已知缺口**：live browser audit 未对本分支运行——本机仅有服务共享 checkout 旧代码的用户进程，按计划不重启用户服务，1440/1024/390 与 200% zoom 记为 not run。
- 🟡 **已知缺口**：真实 provider 3×3 矩阵未运行（`server/.env` 缺失）；正文提交产出有界 pending 候选、revision 变化拒绝迟到 observer 输出等六项行为验收留待外部凭据。
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
- ✅ 真实性 MVP 的 selected-speaker voice、world→politics 链和 detached shadow critic 已通过确定性合同与 smoke；critic 不改可见正文，也不落原文或内容指纹。
- 🟡 尚未运行真实 MiniMax、OpenAI-compatible、Anthropic-compatible 渠道上的 world→politics 与 critic timeout/invalid matrix。这是外部 provider 门禁，不是当前已确认的代码回归。
- 🟡 Experience voice editor 与“收进稿件”目的地弹窗尚未执行 1440/390 live browser audit；静态响应式合同、构建和键盘焦点合同已通过。
- 处理入口：[G4.6.13 单 transcript 工具运行时纠偏计划](../plan/pinax-integrated-product-roadmap.md#g4613-单-transcript-工具运行时纠偏计划r0-r8)。

### 地理-历史生产闭环

- ✅ 2026-07-15：地图页已能消费一次完整地图结果，经过 `extractMapSemantics()` 和 `generateGeoHistory()` 生成可审阅草案，并在用户确认后写入当前世界书的 `geoHistory`。
- ✅ 地图语义点已支持逐项审阅；历史节点、事件日志和结构化设定可通过统一 `placeId` 回到地图，`PlaceEntity` 已聚合地图引用、历史节点和世界书条目。
- ✅ 2026-07-15：历史开局写入 `historyNode / placeId`；剧情日志形成后会以稳定 ID 写回 `geoHistory.playerNodes`，并保存有限世界状态快照与审计事件；GM 上下文通过 `PlaceEntity` 按当前地点筛选历史节点和玩家经历。
- ✅ 受限 state delta、确认/拒绝/回滚、因果 v3 与冲突审阅已接通。
- 🟡 当前地图已把 confirmed 世界书地点及其明确关系编译为有限约束，并完成国家归属、同国/异国、沿河和显式道路的直接求解，以及候选地图、逐地点 remap 审阅、局部 stale guard、最近 5 版轻量快照和恢复。自动 remap 仍只使用名称/别名与约束报告，关系图和空间邻近尚未进入评分；父子区域和相邻关系仍以生成后核验为主。地理历史只接受最多 12 个真实命名、非重复锚点候选，水域约束不会创建陆上聚落；真实导入、定位、确认/解除、拖动、刷新、切换世界书和运行时回滚的完整 smoke 仍待执行。
- 🟡 地图画面仍允许引擎使用内置名称池和聚落端点组合道路名来保持地图可读；这些名字不是世界书事实，只有与世界书地点匹配或完成绑定后，才会进入历史和正式引用。若产品最终要求地图只显示作者地点，需要在后续 M4/M7 决定“隐藏未绑定预览”还是“保留并加预览标记”，不能把视觉标签直接写入世界书。
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

### 漫画生产工作台仍未形成闭环

- 🔴 当前漫画页已经直接具备格框、景别/机位/透视、制作阶段和视觉圣经字段，但用户能操作的仍主要是固定 4/6 格编辑器，尚无多页改编、自由格框画布、真实 rough/line/color 阶段、可编辑气泡和连续性质检工作台。
- 下一步直接在当前漫画页执行 M2 的改编分页与视觉圣经，再进入 M3 中央分镜画布，不增加单独迁移层。
- 计划入口：[Pinax 产品整合与演进主计划 G4.4](../plan/pinax-integrated-product-roadmap.md#g44-素材插画与漫画工作流)。

## 已知缺口

- 🟡 Windows x64 portable ZIP 已完成压缩完整性、ASAR、PE32+ 及真实 Linux package 激活后路由 smoke。Windows 实测发现的目录 `fsync` `EPERM` 与项目激活后 Web History 白屏均已修复并重建包，但仍需 clean-machine 复验新建、导入、刷新、OS 目录对话框、SQLite、锁与原子替换；host 证据不能替代该门禁。Squirrel installer 仍需 Windows runner，或在 Linux 安装 Wine/Mono 后再生成。
- 🟡 `desktop-project-empty/error/readonly` 已加入 UI audit mock state 和 1440/390 可运行配置，但当前 5173 服务属于另一 worktree。按“不启动或重启现有服务”约定，本分支 live browser audit 未执行；组件行为、初始焦点、键盘、共享 token 与 768px 合同测试已通过。
- 🟢 P1 只建立新桌面项目 repository/schema/bridge，不迁移现有 localStorage 项目记录，也不把 legacy key-value 数据伪装为 SQLite rows。迁移归 P2，plain-text editor 归 P3。
- 🟡 C3 场景素材板已有静态合同、单元测试和审计 fixture，但当前无开发服务，尚未执行 1440/390 live browser audit。此项是视觉/真实交互验收门禁，不是已确认的代码回归。
- 🟡 场景板可确定识别 linked/archived/detached/untracked；通用 stale 状态需要可比较的源 revision 或 content hash 基线，现有旧数据不具备该证据，因此本轮不根据时间或缺失字段猜测 stale。
- 🟡 `ProseEssay.vue` 仍直接持有画布编排状态；是否抽取 `useCanvasBoard` 留到场景板用户验收后决定，避免在交互边界未稳定时先制造新 owner。
- 🟡 MiniMax Image 的人物参考接口当前只接受公网图片 URL；Pinax 参考图库以本地/IndexedDB 图片为主，因此 MiniMax 配置当前先支持文生图，选择本地参考图时会明确阻止提交而不是静默忽略。后续需要对象存储或受控图片上传桥接。
- 🟡 MiniMax `files/retrieve` 返回的下载地址约一小时有效；当前 MediaAsset 会记录 `file_id`、到期时间和临时外链，但尚未把视频二进制自动转存到持久对象存储。真实 provider smoke 时需及时保存结果，后续持久化渠道接入不能把该外链当永久资产。
- 🟡 `moveCostForEdge` 已有 biome 缺省值兜底，但 caller 仍应避免传未声明 biome。
- 🟡 states 阶段性能仍有残留问题，见 [states-perf-residual-issue.md](../plan/states-perf-residual-issue.md)。
- 🟡 地图请求原先会把完整世界观、地点正文和冗长 JSON schema 一起发送，超过服务端通用输入预算后可能截掉 system prompt；当前已对地图上下文分段压缩并设置专用输入预算，真实渠道仍需用长世界书做一次浏览器生成 smoke。
- 🟢 世界书地点不再使用稳定随机 fallback，也不再作为随机聚落名称池。地图已停止消费地理概述正文，只读取正式地点条目、显式关系和 geo-history；正文解析仅在结构化设定的“从概述整理”中产生待审草稿。正式地点只对同类 burg、river、road、state 或满足明确地形条件的 cell 生成待确认候选。地图原生聚落可由用户逐项纳入世界书，未选择时仍只是地图事实。旧存档中的 fallback 标记会在重新同步世界书后移除。
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
