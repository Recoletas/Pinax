# 设定页 ↔ Authoring 工作台联动闭环计划

日期：2026-09-12。状态：L0–L8 已执行并经独立复验修正；代码闭环与浏览器旅程通过（联动 Gate 20/20、推演 Gate 304/304、verify:full exit 0）；用户视觉确认与新一轮真实模型资料检查待验。回执见 [agent-runs](../agent-runs/settings-linkage-closure-20260912.md)。

归属：Pinax 产品整合主线 G1.2（世界书与结构化设定）、G1.3（Authoring 工作台）与 G2.4/G3（地点、地图、历史）的跨界面收口。目标是让作者围绕同一本书，在“正文—人物/设定—当前场—推演”之间往返，而不是把已有页面简单并排。本文不另建数据源、不重做设定页视觉、不扩展通用 Agent 工具系统。

当前实施基线为 `/home/recoletas/jiuguan/pinax-integration-20260906` 的 `main`。旧工作区 `/home/recoletas/jiuguan/text-game-framework` 保留历史 WIP，不作为本计划实现目录。执行前需重新确认当前分支和 C2 集成写锁；本计划会修改 `Authoring.vue`、路由与工作区标签合同，不得与另一会话同时编辑这些文件。

## 1. 要解决的真实问题

目前“数据共用”已经存在，但“产品联动”没有完全闭环：

- `book.worldbookId` 已是 Authoring 唯一世界书绑定；工作台右栏的人物与普通设定直接读写绑定世界书条目。
- 当前场、推演和生成使用 `boundWorldbook`，换书时会同步清空旧绑定，并在新绑定加载完成前阻止生成。
- 工作台可以打开高级条目页，但只传 `entryId`；高级页按全局 `activeWorldbook` 初始化，可能打开错资料库。
- `settings-structured` 在标签合同中是项目级 surface，但页面没有按 `bookId → book.worldbookId` 解析上下文。
- “设定 / 地图 / 条目”内部导航只传路由名，项目、世界书、对象和返回定位会丢失。
- 地图已有 Authoring 选区/滚动回程；结构化设定和高级条目没有同等回程。
- 同一页面内的工作台编辑会立即刷新 `boundWorldbook`；跨页面或另一个浏览器标签修改后，没有统一刷新/失效提示。
- 地点有稳定桥接；历史节点、结构化设定与来源档案进入当前场/推演的规则仍不统一。

因此本轮的完成定义不是“能点到另一个页面”，而是：

> 从正文中的具体人物、设定或地点出发，打开当前书绑定资料库中的同一对象，编辑后回到原书、原章和原落笔位置；工作台刷新后使用新资料，删除或换绑不会留下静默错误引用。

## 2. 冻结的数据与交互原则

### 2.1 数据真源

1. 当前书真源仍是 `bookId`；当前书的设定真源仍是 `book.worldbookId`。
2. 路由里的 `worldbookId` 是导航快照和一致性检查，不得覆盖书稿绑定。若它与书稿当前绑定不一致，页面必须提示并重新解析，不能静默打开路由快照。
3. `worldStore.activeWorldbook` 只承担设定工作区当前显示状态，不能成为 Authoring 生成链的回退来源。
4. 人物、普通设定和地点继续使用同一个 `worldbook.entries`；结构化字段继续由现有结构化设定 owner 保存，不复制进 Authoring 私有 store。
5. 当前场锚点只保存稳定 ID、作用范围和作者明确选择，不复制人物/地点全文。展示和生成时读取最新条目快照。
6. 返回定位（章节、writing unit、选区、滚动）是易失 UI 状态，只放 workspace session ledger；不得进入正文、世界书或长期备份。

### 2.2 联动语义

- “打开完整设定”必须打开当前书绑定世界书中的同一条目。
- “设定页切换世界书”只改变当前设定工作区，不自动给书稿换绑；换绑仍由 Authoring 的明确操作和影响确认负责。
- 设定更新后，工作台刷新目录、当前场投影和后续运行上下文；已冻结的推演不偷偷改资料，而是按既有 revision 规则标为过期或要求重开。
- 删除被当前场引用的条目时，不伪造替代对象：保留可理解的失效状态，让作者重新选择。
- 不是所有设定都自动进入当前场或模型。只有作者明确选入、正文精确命中、既有激活规则命中，或当前场稳定引用的内容才进入上下文。
- 地图和历史是设定的不同视图，不是第二套地点/历史数据。联动只传稳定引用和定位，不复制实体。

### 2.3 导航体验

- 正文中的人物/设定/地点入口默认在现有工作台标签中打开或聚焦对应 surface，不强制覆盖正文标签。
- 从项目上下文进入的结构化设定、地图和条目页都显示所属书稿与绑定世界书，避免只显示模糊的“当前世界”。
- 每个项目设定 surface 提供一致的“回到正文”；回程恢复原书、原章、writing unit、选区和滚动，恢复失败时至少回到正确章并给轻提示。
- 直接从首页或 URL 进入、没有 `bookId` 时，继续允许全局世界书工作流；不能为了项目联动破坏独立设定管理。

## 3. 范围与非目标

### 内测前必须完成（P0）

- 项目设定上下文解析与错库防护。
- Authoring → 结构化设定/高级条目/地图的精确导航。
- 三个设定分区切换不丢 `bookId/worldbookId`。
- 设定/条目 → Authoring 的精确回程。
- 返回工作台后的资料刷新，以及删除/换绑后的失效处理。
- 两本书、两个世界书之间的隔离旅程。

### 内测早期完成（P1）

- 地点、地图、历史节点之间的统一项目定位和回程。
- 结构化设定更新后进入目录、匹配器和推演 manifest 的可解释路径。
- 同浏览器多标签修改后的可见刷新或明确“资料已更新”提示。
- 低干扰的联动状态文案与窄屏往返优化。

### 本轮不做

- 不做云同步、多人同时编辑或跨设备实时协作。
- 不建立通用事件总线、CRDT 或第二套响应式世界书缓存。
- 不把全部结构化设定塞进每次生成。
- 不让推演结果自动改写正式人物、地点或历史；仍须显式采纳。
- 不重构整个 `worldStore`、`Authoring.vue` 或设定工作区视觉。
- 不实现完整 Utopia 式历史引擎；只闭合已有历史节点的定位和引用。
- 不以大量单元测试替代六条真实浏览器往返；核心测试数量继续受 20 文件/200 用例预算约束。

## 4. 目标上下文合同

建立一个薄的、可测试的项目设定上下文解析器，建议放在 `src/services/workspace/` 或现有 Authoring 世界书服务旁，不把逻辑散落进三个页面：

```js
{
  mode: 'project' | 'global',
  bookId: '',
  worldbookId: '',
  book: null,
  worldbook: null,
  source: 'book-binding' | 'explicit-global' | 'fallback-active',
  status: 'ready' | 'unbound' | 'missing-book' | 'missing-worldbook' | 'route-mismatch'
}
```

解析优先级：

1. 有合法 `bookId`：加载书稿，读取当前 `book.worldbookId`，这是唯一有效项目绑定。
2. 同时有 `worldbookId`：仅用于核对；不一致时采用当前书绑定并产生一次可读提示。
3. 没有 `bookId`、有显式 `worldbookId`：作为全局设定管理打开该世界书。
4. 两者都没有：保持现有 `activeWorldbook`/首本世界书行为。
5. 书不存在、未绑定或资料库已删除：进入明确空态，不回退到其他书的 active worldbook。

目标路由定位最小字段：

```text
bookId       所属书稿
worldbookId  导航时绑定快照，用于一致性检查
entryId      高级条目定位
placeId      地点定位
historyNodeId 历史节点定位
chapterId / focus  可持久化的回程粗定位
```

精确选区和滚动继续走现有 `volatileRestoreStateByKey`，不塞进 URL。

## 5. 执行波次与任务包

顺序为 L0 → L1 → L2 → L3 → L4 → L5 → L6 → L7 → L8。L0–L5 是同一条 P0 主链，不得做完入口就宣称联动完成；L6 是 P1 地点/历史，L7–L8 收口内测证据。

### L0 · 基线、写锁与六条复现（约 45–75 分钟）

目标：把已知缺口变成可重复旅程，避免按代码推测修完。

- 记录 `main` HEAD、dirty 状态、C2/其他 Authoring owner；若共享文件被占用，先在独立 worktree 做纯合同与 fixture，不并发改页面。
- 准备两本书 A/B，各自绑定世界书 WA/WB；同名人物与地点使用不同 ID 和不同内容，便于识别串库。
- 采集六条基线：
  1. A 正文人物 → 完整设定。
  2. A 结构化设定 → 条目 → 地图切换。
  3. 条目编辑 → 返回 A 正文。
  4. A/B 标签切换。
  5. 删除当前场引用。
  6. 设定更新后继续旧推演。
- 只保留能证明错库、丢 query、丢回程或陈旧资料的必要截图/状态，不拍大量装饰性截图。
- 输出一页基线表：期望 worldbook、实际 worldbook、返回章/选区、是否刷新、是否错误提示。

完成条件：至少复现“高级页可能错库”“分区切换丢上下文”“设定页无统一回程”三个当前缺口；不能复现的项降为风险而非伪缺陷。

### L1 · 项目设定上下文解析器（约 1–1.5 小时）

主要范围：书稿 repository、`worldStore.loadWorldbookForProject`、新薄服务、既有 `authoringWorldbookBinding` 测试项。

- 抽出上述 `resolveSettingsProjectContext()` 或等价纯合同。
- 复用 canonical 书稿 repository 读取 book，不从 workspace tab 的缓存标题反推绑定。
- 对 `missing-book`、`unbound`、`missing-worldbook`、`route-mismatch` 给稳定 reason；页面决定文案，服务不操作 router。
- 增加异步竞态令牌：快速切换 A/B 时，A 的慢加载不能覆盖 B。
- 保持全局入口兼容：无项目上下文仍可编辑 active worldbook。
- 不让解析器自动修改 `book.worldbookId` 或世界书 active 状态。

验收：两书交错加载始终得到各自绑定；错误/缺失不回退到另一资料库；现有 Authoring 生成边界不变。

### L2 · 路由与工作台标签统一（约 1.5–2 小时）

主要范围：`workspaceTabContract.js`、`workspaceTabsStore.js`、`workspaceRouteAdapter.js`、`SettingsSectionNav.vue`、必要 router 元数据。

- 明确同一路由的双重模式：
  - 带 `bookId` 的 `settings-structured`、`settings-world-map`、`settings-worldbook-advanced` 是项目 surface。
  - 不带 `bookId` 的高级条目/导入仍是全局 surface。
- 为项目高级条目确定稳定 surface 名（建议 `entries`），标签 key 为 `project:{bookId}:entries`；不能让 A/B 的高级条目共用一个全局标签。
- 调整 `resolveRouteIntent()`：缺 `bookId` 时允许继续判断全局模式，不能在项目映射中提前 `return null` 截断。
- `SettingsSectionNav` 构造 context-preserving route，只保留白名单字段，不盲传临时错误参数：
  - 全部分区保留 `bookId/worldbookId`。
  - 地图保留适用的 `placeId/historyNodeId/entryId`。
  - 条目页保留适用的 `entryId`。
  - 不适用的对象定位在跨分区时转换或清除，并保留返回 ledger。
- 标签标题表达“书名 · 设定/地图/条目”；全局设定仍显示全局标题。
- 直接 URL、浏览器前进后退、关闭标签邻居选择保持可用。

验收：A 的三个设定分区始终留在 A/WA；B 同时打开时产生独立标签；全局世界书管理不被项目标签吞掉。

### L3 · 三个设定页面按项目上下文初始化（约 1.5–2 小时）

主要范围：`StructuredSettings.vue`、`WorldBookEditor.vue`、`WorldMapPage.vue`、`SettingsContextBar.vue`；优先共用 composable，不复制三个 mounted 分支。

- 页面 mount 和 route query 变化时都调用统一解析器，不只在首次 mounted 读取 active worldbook。
- 项目模式按书绑定加载世界书，并锁定上下文标题；世界书选择器不能在无说明时把项目切到别的库。
- 项目模式若允许查看其他世界书，应明确是“查看”而非“更换书稿关联”；首片优先禁用选择并提供“回工作台更换关联”。
- 全局模式保留现有世界书选择器和创建/导入能力。
- 高级页先解析正确 worldbook，再处理 `entryId` watcher；避免 watcher 在错误库加载时提前判定条目不存在。
- query 指向已删除条目时显示“条目已不存在”，保留目录和回程，不静默选中第一项冒充目标。
- 页面切换期间显示轻量 loading；旧世界书内容立即隐藏，防止 A→B 瞬间闪现 A 内容。

验收：Authoring A 打开人物条目必达 WA 同一 ID；快速切 A/B 不闪错内容；缺失绑定显示正确空态。

### L4 · Authoring 出程与设定回程（约 1.5–2.5 小时）

主要范围：`Authoring.vue`、工作区 route adapter、三个设定页面的轻量回程入口。

- 统一 Authoring 出程 helper：在跳转前捕获 `bookId/worldbookId/chapterId/writingUnitId/documentRevision/selection/scroll`。
- 人物“打开完整设定”、普通设定“完整设定”、地点“在地图查看”全部走同一项目导航合同；不再单独 `router.push({ entryId })`。
- 对每类入口传正确对象定位：人物/普通设定传 `entryId`；地点传 `placeId`，需要时同时传 canonical `entryId`。
- 设定三个 surface 标题栏提供一致的“回到正文”；优先聚焦已有 Authoring 标签，不重复创建页面。
- 回程消费一次 volatile restore state：
  1. 核对项目仍存在。
  2. 打开原章节。
  3. revision 仍兼容则恢复选区；否则定位 writing unit。
  4. 恢复正文滚动并聚焦编辑器。
  5. 状态消费后删除，避免以后错误复播。
- 若用户在设定页停留期间正文被修改或章节被删，降级到正确书稿/现存章节并说明没有恢复精确光标。
- 窄屏回程入口保持 44px 命中，不引入常驻浮层。

验收：正文第 N 段 → 编辑完整人物 → 一键返回，仍是同一本书、同一章、同一段附近；正文未被设定页导航保存逻辑覆盖。

### L5 · 刷新、引用失效与冻结运行（约 2–2.5 小时）

主要范围：`Authoring.vue`、`createBoundWorldbookSync` 或薄刷新协调器、scene projection/运行 revision 既有入口；不重写 store。

- Authoring 在以下时机重新读取当前绑定世界书：
  - 从项目设定/地图/条目标签重新激活。
  - 页面重新获得可见性且 storage revision 已变化。
  - 收到同浏览器 `storage` 事件或轻量 repository 变更通知。
- 刷新必须继续使用当前 `book.worldbookId`，并带 token 防止旧请求覆盖新书。
- 对比刷新前后 revision，分级处理：
  - 仅名称/正文变化：目录、详情和 scene projection 更新。
  - 当前场引用条目删除：锚点保留可诊断的缺失 ID，但 UI 显示“人物/地点已删除，请重新选择”；生成 fail-closed。
  - 书稿换绑：沿用现有 rebind 确认和锚点迁移/清理，不静默迁移旧 ID。
  - 已冻结推演依赖资料变化：旧回应可回看，继续/转试稿前显示资料已变化并要求重开，不偷偷使用新旧混合上下文。
- 防止自动保存覆盖跨页面新值：Authoring 本地表单提交前核对 entry revision；发生冲突时刷新并提示，不用较旧快照覆盖。
- 不实现跨标签逐字段协同编辑；同一条目同时编辑时采用“检测变更—阻止旧写—刷新”的保守策略。

验收：设定页改名/改正文后返回立即可见；删除当前场人物后不会继续带入推演；旧推演不会无提示承接新设定。

### L6 · 地点、地图与历史的最小闭环（约 1.5–2.5 小时，P1）

主要范围：现有 `placeEntity`、地图 bridge、历史节点定位和 scene location bridge。触碰地图核心前必须另读 `map-engine-workflow`。

- 地点条目、地图实体和历史节点继续以现有稳定引用关联；不靠名称做正式 join。
- 结构化设定中的地点 → 地图：打开同一 `placeId`；地图 → 条目：打开同一 canonical entry；两边都保留项目上下文和正文回程。
- 历史节点入口只传 `historyNodeId + placeId`；地图聚焦相关地点/节点，返回时不改正文现场。
- 当前场选择地点后，检查器显示可追溯来源，并能打开地图/完整设定。
- 推演 manifest 只纳入当前场明确地点、在场人物及既有匹配证据；历史节点只有被当前场/作者明确引用时才进入，不全量注入历史。
- 若当前历史数据没有稳定节点→Authoring 选择合同，本轮只做到“可定位、可查看、可作为显式参考”，把“历史状态自动投影”留给 Living History 正式计划。

验收：正文地点 → 地图 → 历史节点/条目 → 正文全程不串项目；推演证据能解释为何包含某地点或历史引用。

### L7 · 指引、文案与响应式精修（约 45–90 分钟）

这是联动完成后的薄 UI 收口，不重新设计页面。

- 项目设定页明确显示“用于《书名》”；全局模式显示“世界书管理”，减少 active worldbook 与书稿绑定的混淆。
- 统一四类短文案：已关联、未关联、资料已更新、引用已失效。避免暴露 revision、storage key 和内部 ID。
- 世界书选择器在项目模式的行为必须显式；不出现看似可切换、实际不改变书稿的假控制。
- 1440/1024/390 检查标题、回程、长书名、长世界书名和空态；不让新增上下文条挤压正文或重复工作台标签信息。
- 遵循现有主题 token、焦点样式、触控和断点；执行时必须使用 `ui-style-check`。

验收：作者能回答“我正在改哪本书的哪个资料库”“如何回正文”“这次修改是否已经影响当前场”，且无需理解世界书内部术语。

### L8 · 浏览器 Gate、人工验收与交接（约 1.5–2 小时）

- 核心纯合同断言并入现有 `authoringWorldbookBinding.test.js`，不新增核心测试文件和无价值用例。
- 新增或扩展一个显式浏览器脚本，专测六条跨 surface 旅程；不要把全部视觉控件逐像素自动化。
- 运行以下最终矩阵：
  1. 人物往返：Authoring 新建人物 → 完整设定编辑 → 返回 → 当前场/人物面板显示新值。
  2. 普通设定往返：设定页新建/编辑条目 → Authoring 完整目录可见 → 正文精确命中后进入候选/manifest。
  3. 地点往返：当前场地点 → 地图 → 条目 → 原正文选区。
  4. 删除失效：删除在场人物或地点 → 返回 → 明确失效 → 重新选择后恢复。
  5. A/B 隔离：同名人物、不同内容，快速切换书稿和设定标签，零串库。
  6. 冻结运行：开始推演 → 修改参与人物资料 → 回来后旧回应可读、继续被安全阻止并可重开。
- 尺寸只选代表性 1440 和 390；720×450 只检查关键回程/错误提示不遮挡。无需为每条旅程重复所有尺寸。
- 人工检查一次真实作品：改一个人物动机、一个地点限制，返回后开启新推演，确认模型拿到新资料；这一步与自动 Gate 分开记录。
- 最终运行 `npm run verify:full`，必须是 exit 0，并报告 20/20 文件、200/200 用例、应用/文档 build 和 diff check。
- 更新 `docs/STATUS.md`、`docs/LOG.md` 和本计划状态；分别标记“代码闭环”“浏览器旅程通过”“用户视觉确认”“真实模型拿到更新资料”，不能相互冒充。

## 6. 验收矩阵

| 状态 | 页面应当表现 | 数据/生成行为 | 禁止行为 |
|---|---|---|---|
| 项目已绑定 | 显示书名与绑定世界书 | 精确加载 `book.worldbookId` | 使用其他 active worldbook |
| 项目未绑定 | 明确空态与回工作台关联 | 不读取/生成世界书上下文 | 自动绑定任意 active worldbook |
| 路由 worldbook 不一致 | 提示绑定已变化并使用当前绑定 | 不修改 book | 按旧 query 打开错误库 |
| 指定条目存在 | 直接定位同一 entry ID | 编辑写回同一条目 | 按同名选择其他条目 |
| 指定条目已删除 | 显示已不存在，可回目录/正文 | 不创建替代条目 | 静默选中第一条 |
| 设定保存后返回 | 工作台立即显示新值 | 新 run 使用新 revision | 旧快照覆盖新值 |
| 冻结推演期间资料变化 | 旧回应可回看，提示重开 | 继续/试稿 fail-closed | 混用新旧上下文 |
| A/B 快速切换 | 标签、标题、目录均对应当前书 | 慢返回被丢弃 | A 内容闪入或写入 B |
| 回程 revision 兼容 | 恢复原选区和滚动 | volatile state 消费一次 | 长期保存选区 |
| 回程 revision 不兼容 | 回到正确章/单元并说明降级 | 不覆盖新正文 | 强行恢复过期 Range |

## 7. 文件与所有权建议

| 领域 | 预计文件 | 约束 |
|---|---|---|
| 上下文合同 | `src/services/workspace/*`、`src/services/agents/authoring/authoringProjectWorldbook.js` | 纯解析、无 router 副作用 |
| 路由/标签 | `workspaceTabContract.js`、`workspaceTabsStore.js`、`workspaceRouteAdapter.js`、`router/index.js` | 维持项目/全局双模式 |
| 设定页 | `StructuredSettings.vue`、`WorldBookEditor.vue`、`WorldMapPage.vue`、共享 composable/context bar/nav | 不复制三套初始化逻辑 |
| Authoring | `Authoring.vue`、必要 scene/rehearsal reader | 只接统一 helper，不继续堆散落 router push |
| 世界书 store | `worldStore.js` | 仅补必要 revision/read API；不重构 store |
| 验证 | 既有 binding 核心用例、一个跨 surface browser gate | 不突破 20/200，不铺陈重复测试 |
| 文档 | 本计划、STATUS、LOG、最终 agent-run 回执 | 计划与实现状态分离 |

单一实施 owner 应负责 L1–L5，因为它们会同时触碰路由、页面初始化和 Authoring。L6 若涉及地图核心可在 L1–L5 合并后另开 worktree，但只能通过冻结的项目上下文合同接入。不要让两个 worker 同时修改 `SettingsSectionNav.vue`、`workspaceTabContract.js` 或 `Authoring.vue`。

## 8. 时间预算与夜间执行纪律

目标总量约 12–17 小时，分两次长程执行更稳妥：

- 第一段（约 8–10 小时）：L0–L5，关闭内测 P0 主链。
- 第二段（约 4–7 小时）：L6–L8，补地点/历史、UI 精修、真实浏览器与模型验收。

若只安排一个夜间窗口，最低合格交付是 L0–L5 全部完成并通过五条 P0 浏览器旅程；不能只完成解析器或路由后把计划标成完成。前 65% 时间用于实现，后 35% 必须保留给交叉旅程、竞态修复、窄屏检查和全量验证。

每个任务包结束记录：实际变更、实际耗时、剩余风险、验证证据。时间预算不是“必须耗够”，但两小时只做完入口和 query 传递只能报告部分完成，不能用大量单元断言冒充跨页面闭环。

## 9. 内测放行标准

满足以下条件，才可以把“设定 ↔ 工作台联动”列为首批 Web 内测已闭环：

1. 六条 L8 浏览器旅程全部通过，且 A/B 零串库。
2. 正文往返恢复至少到正确书、章和 writing unit；兼容 revision 下恢复选区/滚动。
3. 设定保存、删除、换绑都有可见且安全的 Authoring 结果。
4. 推演不会在资料变化后混用冻结快照和新世界书。
5. 项目模式与全局世界书模式在 UI 和路由上可区分。
6. 1440/390 无遮挡、横向溢出或不可达回程。
7. `npm run verify:full` exit 0，测试预算不超限。
8. 至少一次真实作品、真实模型的新资料读取检查通过；若未做，只能放行数据/导航内测，不能宣称 AI 联动质量通过。

## 10. 执行后的后续方向

完成本计划后再依证据决定：

- 如果作者频繁跨页编辑人物，可考虑在 Authoring 右栏补少量结构化字段，而不是继续增加路由往返。
- 如果历史节点确实能帮助推演，再进入 Living History 的“当前场显式历史状态”设计；不要提前做全量历史注入。
- 如果多人或多浏览器标签冲突成为真实问题，再设计 repository-level revision/event channel；首轮内测不提前建设协同编辑系统。
- 如果设定页仍显得与正文割裂，优先改善对象级入口、返回和来源说明，而不是合并成一个超大页面。

本计划的核心判断是：先保证“同一本书、同一资料、同一落笔位置”不会丢，再谈更复杂的设定数据库、历史系统和 Agent tool call。
