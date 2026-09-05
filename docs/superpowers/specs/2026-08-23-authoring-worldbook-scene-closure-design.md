# Authoring 世界书现场闭环与 UI 统一设计

**日期：** 2026-08-23
**状态：** 待用户复核
**前置设计：** `2026-08-23-authoring-experience-workspace-fusion-design.md`
**问题来源：** 融合代码已具备下一拍、现场条和按需详情，但真实页面仍存在版本错位、错误不可诊断、写作项目与世界书未绑定、现场依赖 Experience session、观察器未进入投影、新 UI 与写作页风格不统一等问题。

## 1. 目标

把已完成的 Authoring/Experience 融合从“功能已接线”收口为可连续使用的书稿工作流：

1. 写作项目是创作主容器，每本书显式绑定一个世界书。
2. 正常写作不创建、恢复或依赖隐藏的 Experience session。
3. 当前现场跟随光标所在的稳定 `writingUnit`，而不是把整章或最后一个体验会话视为唯一当前场。
4. 世界书、正文、场景锚点和观察器共同构建一份共享现场投影，左栏、Composer、右侧详情和 NarrativeKernel 只消费该投影。
5. 下一拍在提交时锁定目标 writingUnit，并在该单元之后原子插入一个新 writingUnit，不再无条件追加到章末。
6. 错误保留真实阶段和可操作原因；失败后保留输入与场景选择。
7. 新增 UI 回归 Authoring 既有的稿件索引、编辑工具栏和批注检查器语言，不再像嵌入的独立小应用。

## 2. 产品定位

### 2.1 从“持续会话”适配到“书稿编辑”

Experience 的基本单位是单一 session 中持续向前的当前场；Authoring 的基本单位是书、章节和可回到任意位置修改的 writingUnit。融合后的 Authoring 采用以下语义：

- **书**：项目边界，绑定世界书、记忆、素材与导出。
- **章节**：正文组织边界，不假定一章只有一个场景。
- **writingUnit**：稳定的落笔位置和 AI 正文事务边界。
- **场景锚点**：作者对某个 writingUnit 起点明确指定的地点、时间、视角和在场人物。
- **现场投影**：在当前光标位置，根据锚点、正文证据、观察器和世界书临时重建的只读视图。

旧 Experience session 只允许通过显式导入，把已提交回合转换为 writingUnit，并在首个导入单元留下来源和场景锚点。导入完成后，Authoring 不再读取该 session 作为日常现场真源。

### 2.2 UI 定位

- **Narrative role：** 安静的长篇写作工作台，不是聊天控制台。
- **Viewing distance：** 以笔记本/桌面长时间写作为主，兼顾 390px 移动编辑。
- **Visual temperature：** 克制、编辑性、连续稿面；AI 状态只是辅助反馈。
- **Capacity：** 左侧只提供可扫描索引，中央正文保持第一视觉中心，右侧只在用户点击后承载详情或设置。

## 3. 设计原则

1. **项目优先：** `book.id` 是 Authoring 的项目 ID；不得用当前全局世界书 ID 或 Experience session ID 替代。
2. **显式绑定：** 生成使用当前书绑定的世界书，不读取“最后一次打开的世界书”作为隐式替代。
3. **世界书提供身份，不证明在场：** 世界书可以证明人物是谁、关系如何、地点有什么，但不能仅因条目存在就把人物判定为当前在场。
4. **光标决定现场：** 当前投影以选择区起点所在 writingUnit 为定位；失焦时沿用最后一个有效 writingUnit。
5. **作者选择高于派生：** 明确场景锚点覆盖观察器推断；派生结果不得静默改写锚点。
6. **一个生成结果，一个单元：** 下一拍不落入聊天记录，也不混入当前手写单元。
7. **错误可解释：** 页面必须区分请求、协议、stale、插入和保存失败。
8. **局部视觉修复：** 不重做 Authoring 主题，不新增卡片墙、胶囊墙或新的通用设计系统。

## 4. 数据所有权

### 4.1 书与世界书绑定

现有 book 增加一个可选稳定字段：

```js
{
  id: 'book-1',
  title: '雾港',
  worldbookId: 'worldbook-harbor',
  chapters: []
}
```

规则：

- 一本书在同一时刻最多绑定一个世界书；一个世界书可以被多本书复用。
- 新建书时显示世界书选择，默认选中当前明确打开的世界书，但用户可以选择“暂不绑定”。
- 既有未绑定书不从全局 active worldbook 静默继承；首次进入下一拍或现场设置时显示低干扰“关联世界书”。
- 旧 Experience 导入若携带唯一 `worldbookId`，且目标书尚未绑定，可以在导入确认中预选该世界书；仍由用户确认。
- 更换绑定必须显示旧/新世界书名称以及受影响的场景锚点数量。旧锚点不删除；其 `worldbookId` 不匹配时标记为待协调，直到用户重新选择实体或恢复原绑定。
- 删除已绑定世界书后，书保留悬空 ID并显示“世界书已缺失”；下一拍暂停提交，直到用户重新绑定或显式解除绑定，不使用其他 active worldbook 代替。主动保持未绑定的书仍可使用章节正文与项目记忆生成，并持续显示低干扰提醒。

### 4.2 场景锚点

场景锚点是作者拥有的章节元数据，不是完整运行时快照：

```js
{
  schemaVersion: 1,
  id: 'scene-anchor-1',
  unitId: 'unit-42',
  worldbookId: 'worldbook-harbor',
  castMode: 'auto',
  presentCharacterIds: [],
  viewpointCharacterId: '',
  locationId: '',
  time: {
    label: '',
    period: ''
  },
  updatedAt: '2026-08-23T12:00:00.000Z'
}
```

语义：

- 锚点从 `unitId` 对应单元开始生效，直到后续出现新的有效锚点。
- `auto` 表示允许从正文证据和已确认观察结果推导在场人物；空数组不代表明确无人。
- `manual` 表示严格采用 `presentCharacterIds`；manual 空数组表示作者明确指定没有世界书 NPC 在场。
- 地点、视角和时间的空值表示未指定，不允许模型或 UI 伪造名称。
- 角色和地点 ID始终使用绑定世界书原始 entry ID；展示层可以派生 `char:<id>`，不得回写。
- 锚点随章节保存，与 `chapter.editorDocument` 同属项目数据；不写入 `gameStore.currentSession`。

### 4.3 writingUnit 位置与结构变化

- 编辑器 selection 必须继续上报稳定 `unitId`。
- 下一拍捕获提交瞬间的 `targetUnitId + unitRevision + documentRevision`。
- 成功结果插入到 `targetUnitId` 之后，并返回新 unit ID；不得固定插到文档末尾。
- 若目标单元或文档在请求期间变化，结果按 typed stale 丢弃，不尝试猜测新位置。
- unit split：原单元锚点保留在左侧单元；用户可在新单元显式新建锚点。
- unit merge：被移除单元上的锚点迁移到保留单元；同一目标出现多个锚点时，文档顺序靠后的锚点胜出，旧锚点作为一次可撤销迁移记录保留到事务完成。
- unit delete：锚点进入 stale，不注入生成；现场设置显示“来源段落已删除”，允许重新锚定或删除。

## 5. 共享现场投影

### 5.1 输入

```js
buildAuthoringSceneProjection({
  projectId,
  chapter,
  document,
  activeUnitId,
  worldbook,
  sceneAnchors,
  acceptedObservations,
  projectMemories,
  outlineItems,
  legacyImportRefs
})
```

Authoring 正常路径不再把完整 `gameStore` Experience runtime 当作必需输入。

### 5.2 来源优先级

从高到低：

1. 当前或最近前置 writingUnit 上的有效作者场景锚点。
2. 绑定到当前 unit/revision 且已确认的观察器结果。
3. 当前单元及其前面有限 writingUnit 的明确正文证据和 origin refs。
4. 当前章节纲要中的明确地点、人物或未决事件引用。
5. 上一章末尾可重建的现场，仅作为 `inheritedSuggestion`，不自动升级为本章事实。
6. 世界书实体详情和关系，只补全已选/已有证据实体，不扩大在场名单。

冲突规则：

- 作者锚点与观察器冲突时采用锚点，并把冲突作为低干扰待审项。
- 观察器结果引用旧 unit revision 时标 stale，不进入投影。
- 人物关系只在关系两端至少一端与当前在场人物有关时进入 `activeRelations`。
- 世界书找不到锚点 ID 时不伪造实体，返回 `missingRefs`。
- `observerState` 必须传入真实 `authoringObservations`，不得继续固定为 `null`。

### 5.3 输出

保留现有 schema，并增加定位与来源状态：

```js
{
  schemaVersion: 2,
  projectId,
  chapterId,
  activeUnitId,
  targetLabel: '当前落笔处',
  worldbookId,
  worldbookStatus: 'bound' | 'unbound' | 'missing',
  anchorId: null,
  anchorStatus: 'explicit' | 'derived' | 'inherited' | 'missing',
  viewpointCharacter: null,
  activeActor: null,
  dialogueTarget: null,
  location: null,
  time: null,
  presentCharacters: [],
  activeRelations: [],
  unresolvedEvents: [],
  emergenceCandidates: [],
  missingRefs: [],
  unreadChanges: {},
  sourceRefs: []
}
```

## 6. 生成链

一次下一拍执行：

```text
读取当前 book/chapter/selection
  → 解析 book.worldbookId 并加载明确绑定世界书
  → 按 activeUnitId 构建共享现场投影
  → 冻结 targetUnitId/unitRevision/documentRevision/projection
  → 构造行动、对话、心理或场景 intent
  → NarrativeKernel 生成
  → 控制文本与协议泄漏检查
  → revision/target unit stale 复检
  → 在 targetUnitId 后插入一个 writingUnit
  → 保存章节与场景锚点事务
  → 调度一次项目级观察器
  → 刷新共享投影
```

约束：

- `intent.instruction` 必须作为最后一个 user turn 进入 Kernel；空输入才是纯 continue。
- actor/target、导演注和 scene projection 进入有界控制上下文，不进入可见正文。
- 世界书读取必须使用 `book.worldbookId` 对应对象，禁止直接读取不匹配的 `worldStore.activeWorldbook`。
- 生成期间移动光标但不修改正文，不改变冻结目标；状态文案显示“正在为当前落笔处生成”。
- 生成期间修改正文或目标单元，结果 stale；保留 Composer 草稿。
- 保存成功后，光标进入新单元，左侧现场以新单元重建。

## 7. 错误与恢复合同

统一回执：

```js
{
  ok: false,
  phase: 'context' | 'provider' | 'protocol' | 'stale' | 'editor-write' | 'persist' | 'observer',
  code: 'AUTHORING_WORLDBOOK_MISSING',
  message: '已绑定的世界书不存在',
  retryable: true,
  generatedTextAvailable: false
}
```

页面规则：

| 阶段 | 页面反馈 | 正文行为 |
| --- | --- | --- |
| context | 指出未选章节、世界书缺失或人物引用失效 | 零写入 |
| provider | 显示渠道失败或超时，可重试 | 零写入 |
| protocol | 显示模型结果不可用，不展示控制文本 | 零写入 |
| stale | 显示目标已变化，允许在新位置重新提交 | 零写入 |
| editor-write | 明确“正文已生成但未插入” | 保留草稿，不伪称成功 |
| persist | 明确“已插入但保存失败”，提供再次保存 | 不重复生成 |
| observer | 正文保留，现场显示“状态待刷新” | 不回滚正文 |

模板不得再使用 `composerTurnFailure || authoringTaskError` 让泛化文案覆盖 typed 错误。UI 默认只显示低敏摘要；详细错误可展开查看 code、phase 和 request ID，不展示完整 prompt、世界书正文或 provider 密钥。

## 8. UI 统一

### 8.1 左侧“当前场”

现有 `AuthoringSceneRail` 从独立控制面板收敛为稿件索引的连续下半段：

```text
当前场                                      调整
旧港税务所 · 黄昏                         沿用锚点
莉娜（视角） · 艾德加
未决  伪造印章的来源                              +2
```

- 标题从“本章现场”改为“当前场”，辅助文字可显示“当前落笔处”“沿用上一章”或“未关联世界书”。
- 地点、时间、人物和事件使用与章节目录相同的文字、行高、hover 和活动线，不建立卡片边框。
- 删除每个人物行后的“行动者/对象”双按钮；人物点击只打开详情。
- 单一“调整”入口打开右侧现场设置；行动者和对象在 Composer 集中选择。
- 常显最多 4 个主要人物和 1 个未决事件；其余用 `+N`，不横向滚动。
- 世界书未绑定时显示一行“关联世界书”，不显示伪造人物和地点。

### 8.2 编辑器下沿“续写栏”

现有 `AuthoringTurnComposer` 改为编辑器的连续下沿，而不是独立 section 卡片：

- 与稿页正文同宽，共用 `editor-toolbar` 的分隔、字体、按钮高度和 focus token。
- 第一行只保留 `下一拍`、行动/对话/心理/场景文本切换、行动者/对象摘要和“更多”。
- 第二行是无额外外框的输入面与一个主动作；空输入为“继续下一拍”，有输入为“按此推进”，忙碌时同位变“停止”。
- actor/target 使用现有 popover/sheet 选择，不在左栏散布快捷按钮，不显示胶囊标签墙。
- 候选使用批注列表的连续行样式：正文在左，操作在 hover/focus 或移动端展开后出现。
- 导演注、半自动、参考摘要和导出进入同一个就地 disclosure，复用查找替换条/批注编辑器的层级，不创建浮动卡片。
- 失败状态紧贴输入下方，显示 phase 对应动作；重试不清空类型、文本、actor、target 和导演注。

### 8.3 右侧检查器

- 默认仍只有“批注 / 版本”两个常驻 tab。
- 人物、地点、事件和现场设置继续作为临时 route 原位替换 body，不新增 tab、modal 或并行抽屉。
- 详情标题、返回动作、section label、正文和 footer 操作复用 `writing-inspector__*` 现有结构。
- 删除新组件自建的左色条标题、虚线 footer、边框按钮和不一致的局部字体尺寸。
- 现场设置按“时间 → 地点 → 人物”纵向排列；不使用三 tab。
- 关闭或 Escape 恢复原批注 tab、滚动位置和左侧触发项焦点。

### 8.4 响应式与 Zen

- `>=1100px`：左栏当前场持续可见；Composer 两行；右侧按需详情。
- `760-1099px`：当前场随章节进入左抽屉；Composer 保留类型、人物摘要和主动作，低频项折叠。
- `<=759px`：左抽屉内连续显示稿件和当前场；现场详情/设置使用现有 inspector bottom sheet；Composer 聚焦后纵向展开，主按钮触摸高度至少 44px；零横向滚动。
- Zen：隐藏左右栏和非必要工具；保留一条折叠“下一拍”入口，聚焦展开；Escape 先关闭 disclosure，再退出 Zen。
- 所有颜色、间距、阴影和断点使用现有 token；不新增渐变、emoji 图标、圆角卡片或彩色左边框作为 AI 装饰。

## 9. 世界书接入

### 9.1 读取范围

绑定世界书为当前场提供：

- 人物目录、角色卡、声音样例和知识边界；
- 人物之间已确认的关系；
- 地点目录、地点关系与地图绑定；
- 组织、事实、规则、文风和禁写边界；
- 与当前正文、人物、地点和 intent 匹配的有界条目。

不会因为绑定世界书而：

- 把全部人物放入当前场；
- 把整个世界书塞入 prompt；
- 自动修改正式设定；
- 用候选或观察器结果覆盖 locked/canonical 条目。

### 9.2 人物与关系

- 当前 cast 先由场景锚点和正文证据确定，再从世界书补齐角色卡与口吻。
- `activeRelations` 从世界书正式关系和已确认项目记忆中选择；关系的行为约束进入 Kernel，但关系说明不机械复述进正文。
- actor/target 不在当前场时，行动模式可提示加入当前场；对话模式阻止提交并要求显式调整现场。
- 世界书人物删除或更换绑定后，悬空人物显示缺失状态，不按同名自动重绑。

### 9.3 地点与时间

- 地点只保存稳定 location entry ID；显示名称和地图信息每次从绑定世界书解析。
- 时间可以是作者文本 label 加有限 period；世界书不提供的信息不得猜测。
- 地点切换作为新场景锚点建议，不静默修改当前锚点。

## 10. 旧数据迁移

1. 既有 book 缺 `worldbookId` 时保持未绑定；不从 active worldbook 自动迁移。
2. 既有章节缺 `sceneAnchors` 时读取为空数组，由正文和观察器派生现场。
3. 旧 Experience 导入仍保持 writingUnit 幂等和来源回跳；导入确认增加目标书世界书绑定预览。
4. 导入会话的首个有效 assistant writingUnit 可建立一个 `legacy-import` 场景锚点，内容只取正式 session snapshot 中的稳定人物/地点/时间 ID。
5. 已有 `gameStore` Experience runtime 不删除，继续服务 `/experience`；Authoring 不再把它作为普通写作现场。
6. 备份导出、浏览器迁移包和桌面项目迁移必须保留 `book.worldbookId` 与 `chapter.sceneAnchors`。

## 11. 对既有现场策划设计的修订

本设计保留 `experience-cast-curation-design.md` 中以下内容：

- auto/manual cast 的明确语义；
- 原始 worldbook entry ID；
- `sceneCastResolver` 和完整目录候选；
- 右侧临时现场设置；
- manual 空数组不回退 auto；
- 取消零写入、保存可撤销。

对 Authoring 路径，以下部分由本设计取代：

- 场景策划不再提交到 `gameStore.currentSession`；改为当前章节的 writingUnit 场景锚点。
- Authoring 与 Experience 不再共享一个可写 session runtime；只共享纯 resolver 和投影格式。
- Experience 保持其 session 运行时，向 Authoring 只提供显式导入。
- Authoring 的地点、时间、人物编辑事务写入项目章节，并受 document/unit revision 门禁约束。

## 12. 验证策略

### 12.1 合同测试

- book/worldbook 显式绑定、未绑定、悬空、切换影响预览。
- scene anchor normalize、auto/manual 空数组、worldbook mismatch、stale unit。
- active unit 前置锚点解析、上一章继承建议、世界书不扩大在场名单。
- observer state 真正进入 projection，旧 revision 被排除。
- actor/target 与当前 cast 的对话门禁。
- typed failure phase 不被泛化文案覆盖。

### 12.2 编辑器事务

- selection 上报 unitId。
- 下一拍插入到捕获单元之后而不是章末。
- 光标移动但正文不变时仍插入捕获位置。
- 文档、目标 unit 或绑定世界书在请求中变化时零写入。
- split/merge/delete 后锚点迁移或 stale 行为确定。
- editor-write、persist、observer 三类失败分别可见且不重复生成。

### 12.3 集成测试

- 新建书并绑定世界书 → 选择章节 → 设置当前场 → 下一拍 → 新 unit → 保存 → 刷新恢复。
- 同一章两个场景锚点，移动光标后左栏、右侧和 Kernel 同步切换。
- 世界书人物关系进入 Kernel 和详情，但未选人物不进入 cast。
- 旧 Experience session 导入后关闭/删除 session，Authoring 仍可继续。
- 更换书时世界书、项目记忆、现场投影和观察器 projectId 同步切换。

### 12.4 UI 审计

宽度：1440、1024、900、390。
状态：regular、unbound-worldbook、scene-derived、scene-explicit、generating、provider-error、stale、persist-error、scene-detail、scene-edit、Zen。

门禁：

- 正文保持第一视觉中心；新增区不形成卡片墙。
- 左栏当前场与章节索引风格连续。
- Composer 与编辑器工具栏控件高度、边框和状态语言一致。
- 右侧详情与批注检查器风格一致。
- 390px 零横向溢出，输入、角色选择、重试和返回可用。
- 0 console error；键盘焦点恢复和 reduced-motion 通过。

### 12.5 真实链路

- 使用已配置 provider 完成至少一轮短章节和一轮长章节生成。
- 验证 SSE、显式 instruction、世界书关系、插入位置、保存刷新和请求撤销。
- 人为制造 stale、localStorage/save failure 和缺失 worldbook，页面必须显示不同阶段。
- 真实链路报告只保存 phase、code、耗时、usage 和 request ID，不保存正文、完整 prompt 或密钥。

## 13. 分阶段交付

### Phase A：基线与诊断

- 从最新整合提交创建干净工作树，并明确用户 dev server 的代码来源。
- 修复 typed failure 回执与页面遮蔽。
- 增加不保存正文的执行阶段诊断。

### Phase B：项目—世界书绑定

- book schema、创建/现有项目绑定 UI、打开书时加载明确世界书。
- 生成、记忆和观察器统一使用 book ID / bound worldbook ID。
- 备份与迁移保留绑定。

### Phase C：光标现场与场景锚点

- active unit 定位、章节锚点合同和继承建议。
- 场景设置从 session transaction 改为 project/chapter transaction。
- 下一拍插入捕获单元之后。

### Phase D：共享投影与世界书关系

- 世界书人物/地点/关系 adapter。
- 观察器真实接入投影。
- 左栏、Composer、右侧和 Kernel 单一投影门禁。

### Phase E：UI 风格收口

- 左侧当前场、续写栏、候选列表和右侧详情按本设计逐切片调整。
- 每个切片在 1440/390 截图复核后再推进下一个，避免整页重写。
- 完成中宽、Zen、键盘和错误态审计。

### Phase F：真实验收与交付

- provider、恢复、保存、刷新、旧会话导入和世界书切换矩阵。
- 更新 Experience 等价矩阵；本阶段不退役 `/experience`。

## 14. 明确不做

- 不建立第二份完整 scene transcript。
- 不把左栏改成完整世界书树或角色管理器。
- 不允许世界书候选自动成为在场事实。
- 不让观察器自动写正式世界书。
- 不在本轮实现多世界书同时绑定一本书。
- 不增加无限自动续写。
- 不重做 Authoring 整体主题或 Notebook 编辑器。
- 不在未完成真实验收前退役 `/experience`。
- 不把桌面项目 P3 的完整存储迁移并入本轮；只保证新增字段进入现有浏览器/桌面迁移合同。

## 15. 验收标准

1. 用户能看见当前书绑定的世界书，并能显式关联、切换或识别缺失状态。
2. 普通 Authoring 使用不创建也不要求 Experience session。
3. 同章存在两处场景时，移动光标会切换当前场，而不是始终显示章末状态。
4. 下一拍插入提交时捕获的 writingUnit 之后，不再固定追加章末。
5. 世界书补全当前人物的关系、口吻和地点信息，但不会把全部角色标为在场。
6. 观察器人物/关系/事件结果进入共享投影，stale 结果不进入。
7. 左栏、Composer、右侧详情和 Kernel 对相同位置使用同一 projection fingerprint。
8. 对话缺少在场说话人或对象时不能提交，并提供调整现场入口。
9. provider、protocol、stale、editor-write、persist 和 observer 失败具有不同可见反馈。
10. 失败后输入、类型、人物、对象和导演注保持不变。
11. 左侧新 UI 与章节索引连续，Composer 与 editor toolbar 连续，右侧详情与批注检查器连续。
12. 1440、1024、900、390 和 Zen 均无横向溢出、焦点丢失或遮挡。
13. 旧 Experience 导入后即使原 session 不再可用，导入正文仍可继续创作并保留来源。
14. 真实 provider 完成生成、定位插入、保存、刷新和撤销闭环后，才可声明本计划完成。
