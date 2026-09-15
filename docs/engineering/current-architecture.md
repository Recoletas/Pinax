# Pinax 当前架构与代码边界

> 这是“当前代码实际上怎样运行”的工程真源，不是愿景图。路由清单以
> `src/router/index.js` 为准，阶段状态以 `docs/STATUS.md` 为准，产品路线以
> `docs/PLAN.md` 为准。

## 1. 一句话结构

Pinax 目前是一个 **Vue 单页工作台 + 本地优先浏览器数据 + 可选 Express AI/媒体代理 + 可选 Electron/协作适配器**：

```text
Vue route/page
  → page components / composables（交互会话）
  → domain services（合同、投影、事务、生成编排）
  → repository / Pinia owner（持久数据或跨页状态）
  → localStorage / IndexedDB / Electron bridge

AI request
  → evidence/session freeze
  → generationService / narrative orchestrator
  → src/services/api.js
  → Express route
  → configured provider
  → validate/reconcile
  → editable Ghost
  → explicit author adoption
```

核心原则不是“AI 自动改稿”，而是：资料有明确来源、生成先进入临时会话、正式数据只在作者确认后由唯一 owner 写入。

## 2. 运行时入口

| 层 | 当前入口 | 职责 |
| --- | --- | --- |
| Web bootstrap | `src/main.js` | 安装 Pinia/router、加载全局样式、安装 workspace route adapter |
| App root | `src/App.vue` | 主题/视口、全局通知、桌面项目门禁、router-view |
| Shell | `src/layouts/AppShell.vue` | 一级导航、工作台标签、侧栏和页面容器；不拥有稿件数据 |
| Router | `src/router/index.js` | 唯一页面注册表；旧 URL 只做显式 redirect |
| Server | `server/index.js` | Express、静态站点、AI/媒体/API 路由、WebSocket |
| Desktop | `electron/` | Electron host、项目目录/SQLite/IPC 与旧数据迁移 |
| Shared contracts | `shared/` | 前后端共同使用的 schema、限制与验证；不得依赖 Vue/DOM |

当前主要页面：

- `/authoring`：唯一正式写作工作台。
- `/experience`：保留的互动体验兼容面，不是写作前置。
- `/settings/structured`、`/settings/world-map`、`/settings/worldbook/advanced`：绑定世界书的设定面。
- `/materials`：素材与媒体。
- `/prose-essay`、`/comics`：画布和漫画实验面。
- `/opening`、`/writing` 等旧入口：只重定向，不再各维护一套页面。

## 3. 数据所有权

| 数据 | 唯一写入边界 / owner | 当前持久化 | 说明 |
| --- | --- | --- | --- |
| 书稿、章节、writing units | `src/services/writing/writingBooksRepository.js`；编辑事务由 Notebook/Authoring 发起 | `localStorage.writing_books` | 页面不得另造第二份长期书稿 store |
| 世界书、条目、结构化设定 | `src/stores/worldStore.js` | `worldbook_*` + index keys | 项目模式必须由 bookId 解析绑定 worldbookId |
| 工作台标签 | `src/stores/workspaceTabsStore.js` + `workspaceRouteAdapter` | 安全导航快照 | URL 是导航真源；selection/scroll 只存内存 ledger |
| 当前场、推演、干预 | `src/services/agents/authoring/` 中的 session/projection/transaction | 正式现场有限持久化；Ghost/session 多为内存 | provider 前后都要核对 revision |
| 素材 | `src/services/narrativeAssets.js` | localStorage | AI 输出先是候选，不直接成为正文/世界事实 |
| 来源文档、媒体二进制 | 对应 source archive / `src/services/media/mediaAssetStore.js` | IndexedDB | JSON 书稿备份目前不包含这些二进制 |
| 体验运行时 | `src/stores/gameStore.js` | localStorage | 兼容能力；不能反向成为 Authoring 的稿件真源 |
| 地图 | `src/stores/geographyStore.js` + `src/services/world-map/` | localStorage / worldbook projection | 地图生成事实与作者确认的世界事实分开 |
| UI 主题与排版 | `themeStore` / `writingTypographyStore` | localStorage | 当前只有一套 Pinax 视觉，保留亮暗与缩放 |

浏览器写入必须通过现有 repository/store。`src/composables/useStorage.js` 是兼容底层，不应成为新业务模块直接设计 schema 的理由。桌面适配通过 `src/services/storage/` 和 Electron bridge 逐步接管，不能在页面里判断文件系统路径。

## 4. AI 与推演边界

生成链分成四层：

1. **证据层**：从当前书、章、单元、现场、世界书和显式参考建立有限 envelope/manifest。
2. **会话层**：冻结身份与 revision，保存本轮意图；取消、切书或资料变化可使其 stale。
3. **运行层**：`generationService.js` 负责普通/流式生成入口，`services/agents/` 负责工具调用和 transcript 编排，`api.js` 只做传输适配。
4. **采用层**：模型结果先成为可编辑 Ghost；正式稿件、现场、后果和记忆分别由自己的事务 owner 写入。

禁止的捷径：

- 页面直接拼整本世界书并发给 provider。
- 模型响应直接改正文、设定或历史。
- 用显示文本、数组序号或当前 active store 猜项目/人物/走法身份。
- 在 UI component 内再实现一套 API retry、storage schema 或 revision 规则。

## 5. 目录放置规则

| 新代码是什么 | 放置位置 |
| --- | --- |
| 路由级编排 | `src/pages/`；页面只组合，不新增大段纯算法 |
| 多页面共用 UI | `src/components/<domain>/` |
| 单页复杂交互状态 | `src/composables/`，名称以 `use...` 开头 |
| 可纯测的业务合同/投影/事务 | `src/services/<domain>/` |
| 跨前后端 schema/limits | `shared/` |
| 跨页持久状态 | 已有 Pinia store 或 repository；新增前先证明没有 owner |
| Provider 密钥、代理、媒体处理 | `server/`，不得进入前端构建变量 |
| 一次性迁移兼容 | `src/services/migration/`，写清删除条件 |
| 浏览器旅程/故障矩阵 | `scripts/`；不反向成为生产依赖 |

不要继续往 `src/services/` 根目录增加无归属文件。若改动一个现有根文件，优先确认它属于 writing、worldbook、media、agents、workspace、storage 或 migration 中哪一域；移动必须单独成片并保持 import-only diff。

## 6. 当前结构健康度

静态生产 import 图（2026-09-14）没有发现循环依赖，这是当前架构仍可演进的重要基础。真正的问题是体量和所有权可见性：

| 热点 | 当前规模 | 判断 |
| --- | ---: | --- |
| `Authoring.vue` | 12,299 行 | 最大风险；主要生成工作流和批注/改写工作区已有独立 owner；页面仍集中书稿激活、编辑器事务、快捷工具与若干 DOM 定位适配 |
| `Notes.vue` | 4,405 行 | catalog/editor 生命周期已拆开；插画 DOM、拖拽/锚点、新建弹窗与 sidekick 仍在页面 |
| `Experience.vue` | 4,429 行 | 兼容运行时仍重，不能继续承接新写作功能 |
| `ProseEssay.vue` | 4,571 行 | 画布状态仍主要由页面持有 |
| `gameStore.js` | 3,656 行 | 会话、历史、runtime projection 与状态解析已分域；完整 turn 编排仍偏重 |
| `src/services/` 根层 | 67 个文件 | 域目录已经出现，但旧文件尚未迁完 |

本轮已经删除生产图完全不可达的旧 Writing wrapper、旧 Settings modal、旧 SidePanel、Kao/folio 残壳、旧 Authoring reference picker 和无人消费的体验素材 summarizer。仍只被测试引用的旧纯合同不在本轮硬删：它们需要先判断是迁移合同、未来能力还是废弃测试，不能用“没有页面 import”一刀切。

## 7. 后续重构顺序

### A. Authoring 按 owner 拆编排，不拆视觉（最高优先）

每次只抽一个边界，页面模板与用户行为保持不变：

1. ✅ `useAuthoringWorkspaceNavigation`：书/章/标签/设定出程与 selection/scroll 回程已在 2026-09-14 抽为唯一 owner；页面只注入书稿 refs、选择动作和滚动适配器。
2. ✅ `useAuthoringPersistence`：正文/标题 autosave、beforeunload/pagehide/visibilitychange、路由离场门禁、恢复副本 timer、保存反馈和失败自救已在 2026-09-14 收为唯一 owner；正式章节/探索文档事务仍由既有 repository 边界执行。
3. ✅ `useAuthoringInspectorState`：工具 rail 选择、检查器开关/固定、基础/详情页、双栏嵌套返回栈与焦点快照已在 2026-09-14 收为唯一状态 owner；页面仍作为编辑器 DOM/source 恢复适配器。
4. ✅ `useAuthoringSceneWorkflow`：当前场的可取消草稿、基线/dirty、人物地点搜索与候选、失效引用、作用域失效、scene-anchor 保存/回滚/撤销/恢复继承已收口；页面构造初始草稿并注入章节持久化适配器。
5. ✅ `useAuthoringRehearsalWorkflow`：普通推演的确定起点、正文试稿生成、作用域复核与稳定路线归属已从页面收口；既有 `useAuthoringRehearsal` 继续单独拥有路线状态机，页面只提供现场与 Ghost 适配器。
6. ✅ `useAuthoringInterventionState`：干预 session、证据/候选投影、审核计数、Ghost 批次资格、双栏归属和重置不变量已归为单一状态 owner。
7. ✅ `useAuthoringInterventionWorkflow`：prepare/rehearse/retry、资料变化 reconcile、取消令牌与迟到响应门禁已成为同一个生命周期 owner；页面只注入 session runner、Ghost 定位和关闭适配器。
8. ✅ `useAuthoringCharacterIfWorkflow`：A/B 行动规划、模型配置快照、独立分支草稿、切支/重试、依赖复核与 stale 全部归为一个会话 owner；不再借用普通场景实验室的请求版本。
9. ✅ `useAuthoringSceneLaboratoryWorkflow`：现场压力投影、prepare/retry/select/confirm、请求取消和正文 Ghost 交接已经整体迁出页面。
10. ✅ `useAuthoringBlockWorkflow`：composer/preview/draft/failure、请求世代、打开/关闭/恢复、turn 合同与执行、observer 失败隔离、留作构思和 adoption 互斥已成为单一 owner；页面仅提供当前书稿、世界书同步、Task runtime、编辑器焦点和通知适配器。
11. ✅ `useAuthoringGhostAdoptionWorkflow`：单组 Ghost 从 stale 与依赖复核、保护点、编辑器写入、scene/outline delta、失败回滚、保存重试回执，到 observer、Character IF 消费、撤销和采用回响，已成为一个原子协调器；页面只提供 editor/repository 适配。
12. ✅ `useAuthoringReviewWorkflow`：校对来源冻结、分批模型调用、取消/进度、live source reconcile、单项/批量采用、保护点、忽略和撤销已归入同一会话 owner。
13. ✅ `useAuthoringSearchWorkflow`：搜索来源冻结、四域检索、跨章定位/返回、replace plan、批量保护与全书原子持久化已成为一个会话 owner；页面只适配编辑器选择、保护快照与提交后刷新。
14. ✅ `useInlineWritingAgentHost` + `useAuthoringReferenceSource`：停驻触发、请求身份、IME/光标路由、取消/迟到响应、参考 scope、候选失效与采用接缝已迁出；页面只转发编辑器语义事件并提供事务 hooks。
15. ✅ `useAuthoringRewriteWorkflow` + `useAuthoringAnnotationSession`：改写请求代次/取消/候选/失效/采用状态，以及批注草稿、根项投影、创建/编辑/删除和作用域重置均已有唯一 owner。页面只注入批注集合、选区、滚动和正文提交适配；切章会同步清除旧 composer 上下文。
16. ✅ `useAuthoringAnnotationSelection` + `useAuthoringAnnotationLayout`：选区冻结、跨节点 range/selector、writing node descriptor 进入无状态 selection adapter；边注 lane 测量、ResizeObserver、窗口 resize、滚动恢复和卸载清理由 DOM layout owner 负责。切书、切章、进入/离开构思统一走 `resetAnnotationWorkspaceScope`，不会跨文档保留 composer 或改写候选；ProseMirror 实例和长期 annotations 仍只由页面/repository 提供。
17. ⏭ durable mutation result：统一仍以 boolean、异常和隐式 toast 混合表达的写盘结果；先盘点书稿、世界书、素材和 Notes 的高风险写入，再逐域迁移为可判定的 `{ ok, reason, retryable }`，不得一次改全仓 schema。
每片要求：减少页面自有状态/过渡逻辑与总行数，不以新增一个显式 composable import 伪装成退步；不得新增第二套 reactive snapshot；既有浏览器 Gate 保持同等行为覆盖。

### B. 根层 services 归域

先生成“文件 → 生产消费者 → owner”清单，再做纯移动。优先移动只有 1–3 个消费者、无循环风险的文件；`api.js`、`narrativeAssets.js`、`worldbookContextBuilder.js` 等高 fan-in 文件暂不移动。移动片不得同时改行为。

### C. 兼容/试验合同设退出条件

对仅被测试引用的模块逐个标记：`production`、`migration`、`experimental` 或 `retire`。只有 retire 项才连同对应测试删除；migration 项必须记录数据版本和最早删除日期；experimental 项不得由正式页面偷偷依赖。

### D. Experience 与 gameStore 隔离

停止向 `/experience` 增加 Authoring 功能。会话规范化/调度、history/runtime projection、branch graph、observer、journal、生命周期默认值和自由文本状态解析现位于 `src/services/experience/`；store 只保留应用 action。下一刀是把完整 turn 编排收成 coordinator，再决定体验页长期保留、插件化或退役；在真实存档迁移与用户验收前不删兼容数据。

## 8. 变更检查表

- 我改的是 UI 状态、业务事实，还是持久数据？owner 是否唯一？
- 页面是否只调用 service/composable，而没有新建 schema/retry/revision 规则？
- 模型输出是否仍先成为候选，且采用前重新核对来源？
- 新 service 是否进入正确 domain，而不是继续堆到根目录？
- 兼容代码是否写明入口、数据范围和删除条件？
- 是否跑了与改动对应的 focused Gate，最后再跑 `npm run verify:full`？
