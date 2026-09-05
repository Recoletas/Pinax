# 项目工作台标签与创作上下文投影实施计划

**日期：** 2026-08-24  
**状态：** 调研与计划完成，待实施  
**范围：** AppShell、Authoring 多书会话、素材/画布/设定完整工作区及其创作页投影  
**前置计划：** `2026-08-25-authoring-text-workbench-v3.md`

## 1. 结论

Pinax 采用两层工作台，而不是继续把完整功能压进 `/authoring` 右栏：

1. **工作台标签层**承载可持续工作的完整页面：每本书的写作，以及该书的素材、画布、设定；全局能力单独成为全局标签。
2. **创作页上下文层**只显示当前书、章、writingUnit、光标前文和当前场相关的有限投影，提供就地轻动作，并可打开对应完整工作区。

标签是路由与项目上下文的可恢复视图，不是第二套数据真源。右栏和完整页面必须共享 repository/service，不复制状态。

## 2. 调研证据

### 2.1 作家助手本地安装

对 `/mnt/d/作家助手/yuewenedit/program/resources/app/authorwrite_5.15.0.asar` 的只读检查确认：

- 应用维护全局 `tabList` 和 `current`，书籍以 `type: "book"` 进入顶部标签；不同书可并列打开并切换。
- 写作页内部仍有大纲、角色、设定、灵感、章节、双栏等右侧上下文工具。
- 大纲、角色和设定还支持独立窗口，说明“完整工作面”与“写作伴随工具”是不同层级。
- 广场、书架和资料类目的属于应用级目的地，不与某一段正文共享右栏所有权。

Pinax 继承其“多任务标签 + 写作伴随工具”的层级，不复制品牌样式、社交功能或 Electron 窗口机制。

### 2.2 Pinax 当前实现

- `AppShell.vue` 当前是活动导航 + 单个 `RouterView`，没有动态标签 store；旧 `.shell-tab` CSS 不是运行中的标签模型。
- `/authoring`、`/materials`、`/prose-essay`、`/settings/*` 已是完整路由，可以成为工作区 surface。
- `Authoring.vue` 自己读取 `writing_books` 并拥有 `selectedBookId/selectedChapterId`；AppShell 不知道当前书。
- Authoring 已接受 `bookId/chapterId` query，但选择状态和路由尚未形成双向、可恢复合同。
- 素材已有 `projectId/sourceRefs`，但页面仍混合全局素材与项目素材。
- 画布的 edges、outline、timeline、piles、commits、branches 仍主要使用全局 localStorage key；直接开放多书画布会串书。
- 世界书以 `worldbookId` 为 owner，书通过 `book.worldbookId` 绑定；设定标签必须以书为工作上下文、以绑定世界书为数据 owner，不能把两者 ID 混用。

## 3. 产品边界

### 3.1 Surface 矩阵

| Surface | 标签身份 | 创作页紧凑投影 | 完整工作区 owner |
| --- | --- | --- | --- |
| 写作 | `project:{bookId}:authoring` | 不适用 | 章节、正文、当前场、右栏工具 |
| 素材 | `project:{bookId}:materials` | 与当前章/块/现场相关的素材；预览、引用、插入、送入画布 | 全库检索、采集、分类、批量整理、来源追踪 |
| 画布 | `project:{bookId}:canvas` | 当前场景板、当前节点及一跳邻域；加入/定位 | 自由画布、完整关系、节拍、时间线、导演与视频 |
| 设定 | `project:{bookId}:settings` | 落笔处命中、当前场约束、当前条目详情 | 结构化设定、世界书条目、来源、分组、冲突和地图入口 |
| 漫画 | `project:{bookId}:comics`，后续 | 当前章节已有分镜状态，只读摘要 | 完整漫画制作；首期不纳入标签闭环 |
| 广场/文档/设置 | `global:{surface}` | 不进入创作右栏 | 独立全局目的地；无真实业务时不造空壳广场 |

### 3.2 右栏允许与禁止

右栏允许：过滤后的索引、单条详情、引用/插入/定位/轻量编辑、打开完整页面。

右栏禁止：全库平铺、批量导入、分类维护、自由画布、复杂关系编辑、完整时间线、世界书全量 CRUD。任何完整功能都只能有一个 owner。

### 3.3 标签粒度

MVP 每本书每个 surface 最多一个标签：

```text
project:{bookId}:{surface}
global:{surface}
```

条目、素材、节点和章节通过标签内部 route query / selection 定位，不默认创建对象级标签。再次打开同一 key 时聚焦已有标签，并更新其定位意图。

## 4. 状态与路由合同

### 4.1 WorkspaceTab

```ts
type WorkspaceTab = {
  id: string
  key: string
  scope: 'project' | 'global'
  surface: 'authoring' | 'materials' | 'canvas' | 'settings' | 'comics' | string
  projectId: string | null
  worldbookId: string | null
  title: string
  route: { name: string; params?: object; query?: object }
  pinned: boolean
  dirty: boolean
  lastActiveAt: number
  restoreState?: {
    chapterId?: string
    objectId?: string
    scrollAnchor?: string
    inspectorTool?: string
  }
}
```

`worldbookId` 是派生快照，不参与 project tab key；换绑世界书后更新标签上下文，不另开一本“书”。

### 4.2 Store 动作

新增 `useWorkspaceTabsStore`，只负责视图会话：

- `hydrate()`：清洗版本、去除不存在的书、修正失效路由，确保至少有当前路由标签。
- `openOrFocus(intent)`：按 key 去重；已有标签更新 route/restoreState 后聚焦。
- `activate(tabId)`：先完成离开门禁，再 router push；不复制页面实例。
- `syncFromRoute(route)`：直接 URL、后退/前进和旧入口都能创建或聚焦正确标签。
- `updateContext(tabId, patch)`：更新标题、当前章、对象定位和 dirty 状态。
- `close(tabId)`：先选择确定性邻居，再关闭；最后一页回到欢迎页或固定首页。
- `closeProject(projectId)`：删除书时关闭该书所有 surface 标签。
- `replaceProjectTitle(projectId, title)`：重命名书后同步标签标题。

持久化只保存安全的导航状态，不保存正文、生成 ghost、未提交 Agent 结果或大型页面缓存。schema 使用版本键 `workspace_tabs_v1`，损坏时可丢弃重建。

### 4.3 路由合同

项目 surface 统一接受：

```text
bookId=<writing book id>
chapterId=<optional chapter id>
worldbookId=<derived compatibility hint>
focus=<entry/material/node id>
```

- `bookId` 是项目上下文真源；`worldbookId` 只用于无书入口或旧链接兼容。
- Authoring 选择书/章后以 `router.replace` 同步 query，避免每次光标/章节点击污染浏览器历史。
- 跨 surface 使用 `router.push` 并经 `openOrFocus`，保留浏览器后退语义。
- 页面刷新和直接深链必须在没有已恢复 tabList 时独立工作。
- 不用 `<KeepAlive>` 缓存整套 Authoring 页面；正文仍在既有持久层，视图恢复依赖显式状态，避免多实例 watcher 和 worldStore 全局 active 冲突。

## 5. 数据 owner 与迁移

### 5.1 书籍 repository

先从 `Authoring.vue` 抽出 `writingBooksRepository`：load/save/find/update/delete、订阅 revision。Authoring、AppShell 标签解析器和其他 surface 只通过该 repository 读取书标题与绑定。

首期仍以 `writing_books` 为持久化真源，不同时迁移 SQLite/schema；repository 是为后续桌面 adapter 留边界。

### 5.2 素材

- 完整素材页接收显式 `bookId`，默认过滤 `asset.projectId === bookId`。
- 全局/作者级素材通过明确的“全部资料”视角访问，不偷偷混入当前书结果。
- 右栏投影输入：当前 book/chapter/unit、caret 前文、sceneProjection、sourceRefs；只做确定性召回。
- 插入正文、作为 AI 参考、加入大纲、送入画布沿用既有事务函数，不能在投影组件内另写一套。

### 5.3 画布

新增 `projectCanvasRepository`，把以下状态纳入 `bookId` namespace：cards/positions、edges、outline、timeline、piles、commits、branches、scene board。

迁移策略：

1. 新项目只读写 project key。
2. 旧全局画布不自动复制给每本书。
3. 首次进入某书画布时，如仅存在 legacy 数据，显示一次归属选择：迁入当前书 / 保留为未归属 / 暂不处理。
4. 迁移写入新 key 成功后才记录 receipt；旧数据先保留，后续单独清理，不做破坏性自动删除。
5. 从素材/章节来源能确定唯一 projectId 的节点可确定性归属；混合来源必须人工确认。

### 5.4 设定

- `bookId -> book.worldbookId -> worldbook` 是唯一解析链。
- 无绑定时设定标签显示绑定/创建入口，不回退到全局 activeWorldbook 冒充该书设定。
- `worldStore.activeWorldbook` 继续兼容旧页面，但新投影和新 full-surface adapter 使用 `loadWorldbookForProject(worldbookId)` 返回值，不把全局 active 当并行标签的数据 owner。
- 换绑时当前书的设定/画布上下文失效并刷新；其他书标签不受影响。

## 6. UI 与交互规范

### 6.1 顶部工作台

- 顶栏第一层保留菜单/产品入口和全局状态，第二层为可横向滚动的工作标签；写作编辑工具仍紧贴正文，不搬进 AppShell。
- 标签显示 surface 图标、书名/页面名、dirty 点和关闭按钮；活动态依靠底边/短色条，不使用厚卡片或浏览器拟真阴影。
- 书写作标签优先显示书名；项目子 surface 显示 `书名 · 素材/画布/设定`。
- 同一书的相关标签视觉上通过相同项目短色条关联，但不使用大面积彩色背景。
- 标签溢出使用横向滚动和“全部标签”菜单；不把标签压缩到不可读。
- 键盘：`Ctrl/Cmd+W` 关闭当前标签（正文编辑原生语义冲突时不截获）、`Ctrl+Tab`/`Ctrl+Shift+Tab` 循环，Home/End 在标签列表定位，关闭后焦点进入新活动标签。

### 6.2 创作页入口

右栏素材、画布、设定详情头提供统一的“打开完整工作区”。点击时携带当前：

- `bookId/chapterId`
- 当前条目、素材或节点 ID
- 来源 writing target（unitId/nodeId/range）

完整页返回创作时聚焦原写作标签，并尽力恢复 selection bookmark；跨路由不持久化 ProseMirror bookmark，失败时退化为恢复 unit/node 并滚动定位。

### 6.3 响应式

- `>= 1180px`：显示完整标签文字；AppShell 标签和 Authoring 工具各守自己的层级。
- `760-1179px`：缩短为书名或 surface 名，溢出菜单承接其他标签；右栏继续使用现有单栏钻取/overlay。
- `< 760px`：顶部只显示当前标签 + 标签切换按钮；完整标签列表进入 sheet，不在一行挤压正文。
- 390px、200% zoom 下关闭按钮、dirty 状态和当前标签仍可访问；不得产生横向页面溢出。

### 6.4 失败与边界状态

- 标签指向已删除书：显示一次“项目已不存在”，关闭关联标签并回到欢迎/相邻标签。
- 标签指向已删除章：保留书标签，选择该书首章或空章节态。
- 世界书被删除/换绑：设定标签保留但进入未绑定态，不展示其他世界书数据。
- localStorage quota：标签持久化失败不阻止正文工作，只提示本次标签布局无法恢复。
- 当前页面存在未保存的非自动保存表单：surface 注册 `beforeClose` 门禁；正文自动保存只显示状态，不重复弹确认。
- 生成进行中切标签：允许切换但不销毁请求 owner；关闭对应标签需停止/保留后台任务的明确选择，首期默认阻止关闭并提供“停止后关闭”。

## 7. 实施任务

### Task 0：证据锁与原型约束

**文件：** 本计划；后续建立代表性截图目录。

- 冻结上述 surface 矩阵、标签 key、路由 query 和数据 owner。
- 首轮只以“两本书各开写作标签 + 当前书设定标签”为视觉原型，不先重写所有页面。
- 硬约束：标签不是活动导航换皮；书是一级页面；正文工具栏仍紧贴稿面；右栏不承载完整管理；移动端不压缩桌面标签；不造空壳广场。

### Task 1：抽取书籍 repository

**新增：** `src/services/writing/writingBooksRepository.js`  
**修改：** `src/pages/Authoring.vue`、必要的 Experience 写回适配  
**验证：** 书的 load/save/revision、创建/重命名/删除、旧数据兼容。

完成条件：AppShell 无需挂载 Authoring 即可解析书名和绑定；Authoring 不再私有实现同一套 load/save。

### Task 2：建立 workspace tab domain/store

**新增：** `src/services/workspace/workspaceTabContract.js`、`src/stores/workspaceTabsStore.js`  
**修改：** `src/composables/useStorage.js`、backup key policy  
**验证：** hydrate、去重、激活、关闭邻居、重命名、删除项目、损坏恢复、持久化失败。

完成条件：纯 store 可以在无 Vue 页面环境中表达两书多 surface，不依赖 `worldStore.activeWorldbook`。

### Task 3：路由同步适配器

**新增：** `src/services/workspace/workspaceRouteAdapter.js`  
**修改：** `src/router/index.js`、`src/layouts/AppShell.vue`、`src/pages/Authoring.vue`

- route -> tab 和 tab -> route 双向同步，带防循环 guard。
- Authoring 的 book/chapter 选择同步 query。
- 旧无 query 链接仍选择最近书或首书，并 replace 为 canonical URL。
- 浏览器 back/forward、刷新和直接 URL 保持一致。

### Task 4：顶部标签首个视觉切片

**新增：** `src/components/workbench/WorkspaceTabs.vue`、`WorkspaceTabOverflow.vue`  
**修改：** `src/layouts/AppShell.vue` 及主题 token（仅必要范围）

只完成两本书写作标签与一个设定标签的完整交互：打开、聚焦、关闭、溢出、键盘、dirty、390/1024/1440 重编排。切片完成后才运行一次 focused Gate 和截图审查。

### Task 5：多书 Authoring 会话闭环

**修改：** `src/pages/Authoring.vue`、必要的 writing selection/session service

- 切换书标签前保存旧书正文和视图锚点。
- 每书恢复 chapterId、unit/node、scroll、inspectorTool；不保存 ghost。
- 切换/删除/重命名/世界书换绑走既有 boundary 事务。
- 验收：A 书编辑未污染 B 书；来回切换位置稳定；刷新恢复活动标签。

### Task 6：设定完整标签与创作投影打通

**修改：** `AuthoringSettingContext/Detail`、设定页 context bar、route adapter  
**遵循：** `worldbook-workflow`

- “在完整设定中打开”复用/聚焦 `project:{bookId}:settings`，定位 entry/structured field。
- 完整设定页显示当前书与绑定世界书，并可返回来源 writing target。
- 无绑定、条目删除、换绑、stale 状态闭环。

### Task 7：素材完整标签与紧凑投影

**新增：** `authoringMaterialProjection.js`（如现有服务不足）  
**修改：** `Authoring` 素材工具、`Notes.vue`、素材 repository/filter

- 相关性范围固定为当前选区或光标前当前块 + 前若干 writingUnit、当前场、当前章 sourceRefs。
- 首屏有限结果；显式搜索才查当前项目全库。
- 预览、引用、插入、作为 AI 参考、加入画布共用既有事务。
- 完整素材标签默认项目视角，可显式切换“全部资料”。

### Task 8：画布 project namespace 与安全迁移

**新增：** `projectCanvasRepository.js`、legacy migration contract  
**修改：** `ProseEssay.vue`、`SceneMaterialBoard.vue`、`sceneMaterialBoard.js`、storage policy

- 先完成 repository 和迁移收据，再开放标签入口。
- 全部画布读写显式要求 bookId 或 `unassigned` owner。
- 混合旧数据不自动归书；迁移可取消、可重试、不删除 legacy。

### Task 9：画布创作投影

**新增/修改：** Authoring canvas compact panel、共享 scene board projection

- 只显示当前场景板、当前节点、一跳关系和未放置相关素材。
- 就地动作：定位、关联、加入当前场；完整布局/时间线/导演进入画布标签。
- 从完整画布返回时恢复写作来源锚点。

### Task 10：完整页面 close guard 与任务生命周期

**新增：** surface lifecycle registry  
**修改：** workspace store、设定草稿/画布编辑/生成任务 owner

- dirty 表单、进行中生成、持久化失败分别注册真实门禁。
- 切换不等于卸载数据 owner；关闭才执行清理。
- 不使用通用“是否保存”弹窗冒充所有页面状态。

### Task 11：活动导航收口与全局页面

- 左侧/抽屉活动导航保留“打开功能”的入口，但动作改为 openOrFocus，不与标签形成两套选中状态。
- 欢迎、文档、设置使用 global tab 或明确独立页策略。
- 广场只预留 `global` surface 类型；没有真实内容、身份、路由和数据 owner 前不实现 UI。

### Task 12：整轮收口与文档

- 更新用户手册中的多书、多标签、素材/画布/设定跳转和迁移说明。
- 更新 `docs/STATUS.md`、`docs/PLAN.md`、`docs/LOG.md` 和已知问题。
- 多个完整切片结束后才执行 full Gate，不逐小改跑全量测试。

## 8. 验证策略

遵循项目验证节奏：设计阶段不跑测试；每个足够大的行为切片完成后一次 focused Gate；多个切片收口后一次 full Gate。

### 8.1 合同测试（合并进既有核心测试，避免扩大预算）

- tab key/dedupe/hydrate/close neighbor/route back-forward。
- 两本书的章、scroll anchor、inspector 状态互不污染。
- 书删除/重命名/换绑传播。
- 素材 project filter 与全局素材显式边界。
- canvas project namespace、legacy migration receipt、混合来源不自动迁移。
- settings book -> worldbook 精确绑定，无 activeWorldbook 回退泄漏。
- dirty/generating close guard。

### 8.2 浏览器场景

1. 打开 A 书第 3 章并编辑，打开 B 书，往返后 A 的章与滚动位置恢复。
2. A 书右栏点击设定命中，完整设定标签打开正确条目；再次点击只聚焦。
3. B 书无世界书绑定时不显示 A 书设定。
4. A 书素材投影只显示相关项；完整素材页默认 A 项目，可显式看全部。
5. legacy 画布首次归属 A 后，B 画布为空且不会读取 A 数据。
6. 刷新、直接深链、浏览器后退/前进与标签活动态一致。
7. 删除当前书后所有关联标签关闭，其他书保持。
8. 生成中关闭写作标签出现真实阻断；切换标签不丢生成 owner。

### 8.3 视觉 Gate

视口：1440×900、1024×768、390×844、200% zoom。

- 顶部标签与 Authoring 编辑工具层级清楚但不割裂。
- 中间稿面仍是第一视觉中心，标签不抢高度。
- 同书相关 surface 可识别；不同书不会只靠颜色区分。
- 标签溢出、长书名、dirty、关闭 hover/focus、空标签列表均可读。
- 背景保持浅蓝白连续工作面；工具栏与内容区色差小，不堆卡片。
- 0 横向页面溢出；键盘焦点可见；reduced motion 生效。

## 9. 明确不做

- 不在首期实现任意重复标签、标签拖拽分组、分屏、多窗口同步。
- 不为了模仿作家助手创建没有真实业务的广场、推荐或好友页面。
- 不把整套 `ProseEssay.vue` 嵌入 Authoring 右栏。
- 不把所有 localStorage 一次性迁移到新数据库。
- 不让 AppShell 直接修改正文、世界书或素材业务数据。
- 不用 KeepAlive 掩盖缺失的显式会话状态。
- 不在每个任务后创建提交；多个完整切片收口后再按项目提交规范 squash。

## 10. 实施里程碑

- **M1 基座可用：** Task 1-5。两本书可作为独立写作标签稳定切换与恢复。
- **M2 参考闭环：** Task 6-7。设定、素材在创作投影与完整标签间往返。
- **M3 空间闭环：** Task 8-9。画布按书隔离并提供当前场紧凑投影。
- **M4 产品收口：** Task 10-12。生命周期、导航、响应式、文档和全量门禁完成。

M1 未通过前不并行铺开完整素材/画布 UI；M2 未通过前不宣称“上下文参考工作台”成立；M3 未通过前不开放多书画布默认入口。
