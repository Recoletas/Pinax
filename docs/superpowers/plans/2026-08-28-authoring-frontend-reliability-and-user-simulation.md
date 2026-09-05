# Authoring 前端可靠性与真实用户模拟计划

**日期：** 2026-08-28

**状态：** Slice 0–5 已完成代码与确定性浏览器闭环；Slice 6 外部门禁待真实环境

**上位计划：** [Authoring 文本工作台 v3](./2026-08-25-authoring-text-workbench-v3.md)

**产品边界：** 中央文本工作台是唯一核心；素材、画布、Experience 和独立记忆页不作为本轮前置
**视觉方法：** [视觉对齐工作流](../../engineering/visual-alignment-workflow.md)

## 0. 2026-08-28 执行结果

本文件以下问题分析与切片设计继续作为决策记录；当前实现结果如下：

- **Slice 0 / 验收工具**：Authoring journey 已能区分 PASS、FAIL、HARNESS-ERROR 与 TIMEOUT，失败会以非零状态退出并留下有预算的现场证据；成功产物按轮次清理，不再用 provider 不可用或伪造 Ghost 状态跳过核心断言。
- **Slice 1 / 交互所有权**：新增统一交互策略，菜单、短 Ghost、可编辑长草稿、IME、粘贴和页面级 Escape 按优先级互斥；光标联想保留 4.2 秒停驻语义，并以文档/节点/光标指纹去重。移动光标取消只表示目标变化，不再被误记为作者拒绝。
- **Slice 2 / 长推演**：长推演进入正文版心内的可编辑草稿，作者可先删改再一次性纳入；草稿编辑不写正文、不触发保存/observer/Ghost，采纳后才形成单一正文事务并恢复编辑焦点。
- **Slice 3 / 记忆安静化**：保存与语义观察解耦，observer 消费实际改动单元及 revision；重复排队、已执行 revision 和 exact duplicate 均静默跳过，通知只面向真实结果，stale/in-flight 写入在落库前复核 target identity。
- **Slice 4 / 工具真实性**：现场“以此推进”现把指令真实传入推演 composer；大纲、现场详情、记忆与异常审阅的 props/emit/关闭链已接通，公开入口不再以死动作假装可用。外围素材与画布仍按产品边界冻结，不为填满工具栏扩写新壳。
- **Slice 5 / 编辑与几何**：统一正文纯文本映射、writingUnit 拓扑守卫、批注双端点锚点、引文换行、撤销边界和 replace-all 语义；菜单/右键/打字机滚动按 visual viewport、缩放和真实 caret 定位，滚动时固定菜单关闭而不是漂移。

本地浏览器证据按旅程拆分：整组运行中的 J2–J5、J8、J10–J14 通过；J1 暴露脚本未固定选区/缩放事件，J9 暴露 fixture 未达到产品的 12 字联想门槛，修正 harness 后两条分别定向重跑通过。这里证明的是确定性交互与几何合同，不代替用户对视觉协调性的判断。

最终工作区门禁为 20/20 测试文件、188/188 用例，Vite build、`git diff --check` 与 VitePress build 全部通过。首轮门禁发现的两条失败均经生产链复核为过时测试合同：页面上下文函数新增冻结 target 参数，observer 队列键则有意细化到 writing unit；对应断言已按真实职责修正，没有把生产实现降级为旧语义。

尚未关闭的只有 Slice 6：真实 provider 的 Ghost/长推演 canary、Windows 原生中文输入法 30 分钟耐久，以及 1440/1024/390 代表界面的用户视觉确认。provider 空返回必须独立报渠道失败，不能重新变成应用旅程的“跳过即通过”。

## 1. 本轮决策

下一轮不再继续扩后台上下文、provider 或外围功能。先把 Authoring 从“数据链大体接通”推进到“作者可以连续使用而不被界面打断”。

现有 `smoke:authoring-journeys` 保留，但降级为基础流程巡检。它能证明建书、建章、切换、持久化等路径没有完全断开，不能证明以下核心体验可靠：

- 中文连续输入时 Ghost、Space、`/`、IME、Tab、Enter、Escape 不争抢；
- 光标浏览前文时不会频繁闪出“正在联想”或产生无效请求；
- 长推演可以先删改，再由作者确认纳入；
- 一字或一个标点的改动不会反复制造记忆候选和通知；
- 长文滚动、缩放和窄屏下，菜单、批注、候选、左右工具仍锚在正确位置；
- 每一个公开可点的工具都有真实内容和结果，而不是占位壳。

因此实施顺序冻结为：

```text
测试工具先能如实报红
→ 编辑器交互所有权
→ 可编辑的长推演草稿
→ 记忆派生静默与幂等
→ 公开组件真实性
→ 滚动/缩放/排版几何
→ 真实 provider canary 与人工耐久验收
```

后端逻辑审计仍保留，但只服务上述可见闭环，不再成为下一轮工作的主体。

## 2. 已由代码确认的事实

本节区分“代码已经证明的问题”和“必须浏览器复现的问题”。没有运行浏览器的结论不会被写成实弹结果。

### 2.1 编辑器没有统一交互 owner

`WritingNotebookEditor.vue` 内的空行命令菜单、短 Ghost、长候选分别注册 ProseMirror 键盘处理；`Authoring.vue` 又有章节抽屉、检查器、Zen 等全局 Escape 处理。它们没有共享状态机。

已确认：

1. 空段落会显示“按空格或 / 调出工具”，但光标停稳仍可调度 Ghost；
2. Space 或 `/` 打开菜单时不会取消已有或在途 Ghost；
3. 菜单不拥有 Tab，关闭后同一次按键可能继续被 Ghost 处理；
4. Ghost 处理没有统一检查 IME composition；
5. 多个 Escape handler 只 `preventDefault`，上层 handler 又不统一检查 `defaultPrevented`，一次 Escape 可能关闭多层；
6. 页面定义了 composition/paste 抑制函数，但 Notebook 模板没有完整绑定对应事件。

这不是插件排列顺序可以长期解决的问题。按键必须先由唯一 coordinator 判定 owner，具体插件只能执行 coordinator 已授权的动作。

### 2.2 光标触发与输入触发混在一起

当前自动联想有两条入口：正文输入停顿约 2.8 秒、光标移动停顿约 4.2 秒。这个方向符合此前“移动光标也要触发”的要求，但缺少意图与去重边界：

- 每次输入先取消当前候选或请求，再重新计时；
- 每次光标移动也重新计时；
- 资格判断只看全文长度、选区、冷却等，不看当前段是否为空、菜单/长候选/弹层是否打开；
- 没有 `(文档 revision, unit, node, caret, 触发类型)` 的一次性请求指纹；
- 被动请求的生成中、空返回和错误直接占据稿面，造成“突然正在续写，但最后没有文字”。

光标触发不应删除，而应改为“明确停驻触发”：连续移动只重置；在同一落笔处稳定足够时间后最多请求一次；离开即取消；空行、IME、菜单和其他编辑层期间不 armed。

### 2.3 长推演不是可编辑 Ghost

当前长候选是 `Decoration.widget` 生成的静态 DOM：

- `contentEditable=false`；
- 候选对象被 `Object.freeze`；
- 只有 Tab 整体采纳与 Escape 丢弃；
- 采纳时直接插入原始 `preview.text`；
- 候选出现后 composer 被卸载。

所以用户无法改一句、删一段或调整标点后再纳入。现有 J7 只证明“原样整段 Tab 纳入”偶尔可跑通，恰好绕过了用户指出的核心缺口。

### 2.4 记忆噪声是确定性结果，不是偶发

当前链路是：

```text
输入停止 1 秒
→ 自动保存整章
→ 每次保存都 noteAuthoringTextCommit(整章全文)
→ observer 再等 4 秒
→ 总是从全文前两句派生
→ exact duplicate 仍新增、持久化并广播 created
→ App、MemoryIndicator、Authoring 至少三处响应同一事件
```

进一步确认：

- 改章尾仍可能重复生成章首两句；
- exact duplicate 只是加 `duplicateOf`，并未跳过；
- similar 候选仍新增；
- 同 scope、scopeId、kind 的不同文本可能被过宽地判为冲突；
- 切章会先保存，再以不同 scheduler key 发 boundary，同 revision 可能执行两次；
- Authoring 的通知累计数不按书或提示周期清零；
- Authoring 审阅列表过滤掉普通 pending，通知的“查看”因此可能打开空面；
- 页面把已调度 event 近似映射为 `applied`，但真正的 derived result 尚未完成。

这会同时造成候选膨胀、编辑卡顿、重复提示和当前场投影失真。

### 2.5 公开工具确有空壳和死动作

右侧工具 rail 公开九个按钮，但只有部分有真实 base view：

| 工具 | 当前真实性 | 已确认问题 |
| --- | --- | --- |
| 批注 | 有主流程 | 与其他瞬态层缺少统一 Escape/focus owner |
| 大纲 | 半成品 | `project-edges` 未被组件声明；冲突“去审阅”无落点；项目节点不可打开 |
| 角色 | 空壳 | 只有兜底占位句 |
| 设定 | 有主流程 | 需纳入几何和作用域旅程 |
| 现场 | 只有详情路由 | 从左侧具体条目打开可用，直接点工具是占位 |
| 双栏 | 布局动作 | 与内容工具并列，能放大空壳 |
| 素材 | 空壳 | 只有兜底占位句 |
| AI 辅助 | 部分可用 | 记忆通知/审阅不同步 |
| 历史 | 有主流程 | 需验证焦点、滚动和跨文档作用域 |

左栏还有固定 `aria-pressed=true` 却无 handler 的“草稿”、没有数据 owner 的“第一卷”、探索行内嵌套 `<button>`、固定为 left 却仍保留的整套 right-tree 原型。`WritingInlineCompletion` 在当前 WYSIWYG 路径也永不展示。

另有几个明确接线错误：

- “以此推进”把文字写进 `blockComposer.initialInstruction`，但模板没有把它传给 `AuthoringBlockComposer`，所以修复尚未端到端成立；
- `AuthoringExceptionReview` 的关闭事件没有父级 listener；
- `AuthoringMemoryReview` 会 emit `merge`，却未声明该事件；
- 部分子组件样式写在父页面 scoped CSS 中，无法稳定拥有子组件内部节点。

### 2.6 视觉错位有结构根因

- 命令菜单只在打开和切换子菜单时算位置，没有随编辑区滚动、外层滚动、resize、字体变化和 zoom 持续更新或安全关闭；
- 主菜单位置只按 300px 宽计算，未把桌面子菜单总宽度纳入 viewport containment；
- 当前行 overlay 缺少完整 ResizeObserver/字体变化刷新；
- `.writing-notebook-editor__surface` 与 `.wall__dossier-scroll` 都存在成为滚动 owner 的 CSS；
- `Authoring.vue` 已达 8147 行，同时加载 `Writing.scoped.css`、`Writing.global.css`、`Authoring.block-native.css`；同一布局 selector 在三层中被多次定义，桌面、980、720 与 theme-legacy 规则互相覆盖。

因此“组件错位”不能只靠局部 `top/left` 微调。必须先冻结滚动 owner、坐标系和样式 owner。

### 2.7 现有浏览器旅程会产生假绿

现有脚本的主要问题：

- 全部使用 1440×900；
- 瞬时 `keyboard.type()` + 固定 sleep 不能覆盖真实输入节奏和 debounce 边界；
- 拖拽选区用固定 13px/字估算，且起始字符参数没有真正参与定位；
- J6 不测 Space、`/`、IME、Backspace、Enter；provider 错误会变成 WARN 并跳过核心断言；
- J7 不测候选编辑与真实 UI undo；
- 部分旅程收集 console/page/http 错误后直接丢弃；
- FAIL/HARNESS-ERROR 只打印 JSON，不设置失败退出码；
- watchdog 使用全局 `pkill`，可能误杀其他 Playwright 会话；
- `ui-audit` 的 ghost 状态并不会真的生成 Ghost，部分现场断言位于提前 return 之后；
- action scenario 失败未进入最终门禁；动作抛错时反而没有失败截图。

所以此前的“九条路径全绿”只能解释为流程存在性结果，不能继续写成前端质量结论。

## 3. 八条硬约束

1. **唯一按键 owner**：任意时刻只有一个状态可以消费 Space、`/`、Tab、Enter、Escape；消费后不得继续穿透给下一层。
2. **正文输入优先**：IME 组词、普通文字、Backspace、Enter 和选区修改不得被 AI 或工具意外采纳、阻止或重复执行。
3. **两类 Ghost 触发清楚**：输入停顿可触发；光标移动也可触发，但必须是非空上下文中的稳定停驻，连续浏览不请求，同一 target/revision 最多一次。
4. **短 Ghost 与命令菜单异或**：空行 Space/`/` 永远属于命令菜单；菜单打开、IME、长候选、composer、modal 期间短 Ghost 不生成、不显示、不采纳。
5. **长推演先成为可编辑草稿**：确认前正文和 canonical 数据零变化；作者可改字、删句、删段，再一次性纳入编辑稿；刷新与撤销保持原子。
6. **记忆自动派生静默且幂等**：单字/标点修正不产候选；exact duplicate 零新增、零事件、零通知；普通派生不弹 toast/面板，真实冲突才聚合提醒。
7. **公开即真实**：可见按钮必须有真实 owner、empty/loading/error/success 和可观察主动作；空壳隐藏或明确禁用并说明，不允许可点击占位。
8. **几何与证据有预算**：桌面只有正文滚动，左右栏独立；锚点在长文、缩放和窄屏下可验证。截图默认失败才保留，并受张数、单图大小、整轮容量和过期清理约束。

## 4. 目标交互模型

### 4.1 单一状态机

新增页面级交互 coordinator，最小状态如下：

```text
editing
├─ ime-composing
├─ command-menu
├─ inline-armed
├─ inline-requesting
├─ inline-review
├─ block-composer
├─ block-requesting
├─ block-review
└─ modal-or-sheet
```

优先级：

```text
IME > modal/sheet > command menu > long composer/review > short Ghost > editor > Zen
```

Zen 是页面展示模式，不是高优先级瞬态层。只有前面的状态都没有消费 Escape 时，Escape 才退出 Zen。

coordinator 拥有：

- 当前 owner；
- owner 打开/关闭原因；
- target fingerprint；
- 可消费的 key 集；
- 关闭后焦点/选区恢复目标；
- 是否允许 passive Ghost armed；
- 最近一次拒绝/采纳/失效 fingerprint。

各 ProseMirror plugin 不再通过加载顺序猜测优先级，只向 coordinator 查询 `canHandle(action)`。

### 4.2 按键矩阵

| 状态 | Space / `/` | Tab | Enter | Escape | 普通输入/删除 |
| --- | --- | --- | --- | --- | --- |
| IME | 交给输入法 | 交给输入法 | 交给输入法 | 交给输入法 | 正常组词，零 AI 请求 |
| 空行 editing | 打开命令菜单 | 正常焦点语义 | 新段/执行编辑器行为 | 若无上层才退 Zen | 正常输入；首字后菜单资格消失 |
| command-menu | 菜单自己的导航/关闭规则 | 不得采纳 Ghost | 执行选中命令 | 只关菜单 | 非菜单键关闭菜单后正常输入一次 |
| inline-requesting | 输入会取消请求并正常写字 | 不处理 | 正常换段 | 只取消请求 | 正常输入并重新建立 eligible revision |
| inline-review | 空行场景不存在；普通输入先取消 | 全量采纳 | 正常编辑 | 只丢弃 Ghost | 取消旧 Ghost，文字只写一次 |
| block-composer/review | 编辑草稿 | 在草稿内保持可预期焦点 | `Cmd/Ctrl+Enter` 或按钮确认 | 只关闭当前层 | 只改 draft，不改正文 |
| modal/sheet | 由当前控件处理 | 焦点圈定/顺序 | 当前主动作 | 只关最上层 | 不泄漏到正文 |

所有全局 handler 必须先检查 `event.defaultPrevented`，一次 Escape 只产生一个 owner transition。

### 4.3 短 Ghost 的两条触发通道

保留用户要求的光标触发，但把“经过”与“停驻”分开：

**输入触发**

- 真实正文 mutation 后开始约 2.8–3.2 秒静默期；
- 当前 selection collapsed；
- 当前 paragraph 非空；
- 不要求必须以 `。！？` 等句末符号结尾；
- 当前 owner 必须是 editing；
- revision/target fingerprint 未请求过或正文确有新 revision。

**光标停驻触发**

- mouse/方向键移动只取消旧候选并重置约 4.5–5 秒停驻计时；
- 同一 caret 连续稳定后才 armed；
- 当前段为空、存在选区、正在滚动导航、菜单或其他浮层打开时不 armed；
- 同一 `(document, revision, unit, node, caret, cursor-dwell)` 只请求一次；
- 继续移动立即 abort，沿途不显示“正在联想”。

**被动反馈**

- 请求开始前不显示假生成态；
- 短于约 500ms 的请求无需闪出“正在联想”；
- passive 空返回、取消和普通 provider 失败不在正文里常驻错误文字；
- 手动触发才提供明确重试错误；
- 候选被用户丢弃后，同一 fingerprint 不再次出现，直到正文或 caret 真正变化。

### 4.4 长推演的 editable review

长推演状态改为：

```text
closed → composing → generating → editable-review → adopting → persisted
                                      ├→ dismissed
                                      └→ stale
```

`editable-review` 持有独立 `draftText`：

- 视觉仍贴在目标 writing unit 下方，字体、行高、段距、首行缩进与正文一致；
- 使用轻量自适应文本编辑面，不建立第二套完整文档 repository；
- draft 编辑不触发正文 autosave、Ghost、observer 或记忆候选；
- 第一切片必须支持改字、删句、删段、撤销 draft 编辑、恢复原始生成稿；
- 主动作改为“采用编辑稿”，并提供“丢弃”；
- 当 draft 获得焦点时，Tab 不再作为隐蔽的整段采纳键，采用按钮或 `Cmd/Ctrl+Enter`；
- 未进入 draft 编辑焦点时，可保留清楚标注的快捷采纳，但不能与命令菜单/短 Ghost 共用同一按键 owner；
- 采用时只插入当前 `draftText` 一次，原模型结果只作低敏 provenance，不强迫原样采纳；
- 含 scene/outline delta 的候选首期仍整体提交，文本允许编辑，但采纳前重新校验 target 与 effect 依赖；
- “采用部分段落”不作为第一切片前置。删除不需要的段落后采用编辑稿，已经覆盖当前用户痛点。

composer 不再依赖可能被 decoration 重建替换的裸 `#authoring-block-gap` 生命周期；锚点丢失时应进入明确 stale/close，而不是留下 Teleport 空壳。

## 5. 记忆触发与通知重写

### 5.1 分离保存与语义观察

autosave 只负责保存，不再等价于“用户完成了一个值得提炼的语义边界”。观察入口只来自：

- writing unit 的有意义内容变更在较长静默期后完成；
- 离开当前 unit/章节时尚有未观察的有效 delta；
- AI 长候选成功采纳后的明确 prose commit；
- 用户显式“事实/记住”。

格式变化、focus、selection、undo/redo 次生事务、单字或纯标点修正不触发自动候选。

### 5.2 真 delta 与幂等键

observer 输入改为 changed units/ranges，不再每次传整章全文并取前两句。每次自动派生使用：

```text
projectId
+ sourceRef
+ sourceRevision
+ changedRange/contentHash
+ derivationKind
```

作为幂等键。

规则：

- exact duplicate：直接 `skipped: duplicate`，不写 storage，不 emit created；
- similar pending：更新原候选的来源/revision/内容，不新增一条；
- rejected 的同一 normalized claim 不重复弹回；
- prose-commit 与 boundary 命中同 revision/delta 时只能执行一次；
- conflict 必须比较同一事实主体和属性键，不能以“同 kind 但文字不同”判冲突；
- Authoring 读取 observer 的真实 completed result，不把 scheduled event 显示成 applied。

### 5.3 通知预算

- routine 自动派生：0 toast、0 自动展开面板，只更新安静 badge；
- exact/similar：0 可见反馈；
- 真实冲突或身份歧义：聚合为一次提示，每项目 15 分钟最多一次；
- 审阅列表只显示当前 book/project；
- 通知上的“查看”只有存在可打开目标时才显示；
- Ghost 开关与自动记忆开关分离，作者可以保留联想但关闭后台记忆；
- 任一通知不得改变 caret、selection、editor scrollTop 或工作面宽度。

## 6. 组件真实性与删减规则

### 6.1 本轮不补齐所有功能

本轮不会为了让九个图标看起来完整而临时造角色页、素材页或更多卡片。处理规则：

1. 有真实闭环的组件修复；
2. 只有详情但无 base view 的组件，只保留真实入口；
3. 无 owner 的公开入口先隐藏或禁用并说明；
4. 连续两轮没有用户价值且仍为空壳，默认从主界面删除。

### 6.2 首批处置

| 对象 | 处置 |
| --- | --- |
| 批注 | 保留；纳入 owner、focus、Escape、长文锚点旅程 |
| 大纲 | 修 `projectEdges`、冲突审阅、节点详情/编辑后保留；修复前不宣称完整 |
| 角色 | 暂时从 rail 隐藏；以后以“当前场人物/世界书人物”真实投影回归，不做空角色卡墙 |
| 设定 | 保留；验证当前落笔处范围、切章/切书和单条详情 |
| 现场 | 左侧简报 → 右侧具体详情保留；直接点 rail 若无 base view 则隐藏或打开真实概览，不显示占位 |
| 双栏 | 移到检查器头部，作为布局动作；只在当前面板支持时可用 |
| 素材 | 暂时从 rail 隐藏；素材页不参与本轮核心闭环 |
| AI 辅助 | 保留 Context/receipt；修正记忆通知真实性 |
| 历史 | 保留；加入跨章/探索作用域和恢复旅程 |
| 左栏假筛选/假卷 | 删除或接入真实数据；不能继续可点击无行为 |
| right-tree 原型 | 删除不可达模板/CSS，不花时间完善第二套布局 |
| 旧 `WritingInlineCompletion` | 当前路径无消费者则删除，避免双 Ghost 实现漂移 |

“以此推进”的 `initialInstruction` 接线、清空旧指令和端到端旅程放进组件真实性切片，不单独提交或单独跑全量测试。

### 6.3 存活标准

一个公开组件必须同时满足：

- 有明确数据 owner；
- 有真实 empty/loading/error/success；
- 主动作改变 canonical 数据、当前 draft 或进行明确导航；
- 切书、切章、切 exploration 后不会显示旧作用域内容；
- Escape、Tab、焦点归还和滚动可预测；
- 1440/1024/390 至少一条真实旅程覆盖；
- 不是只靠父页面 scoped CSS 偶然获得样式。

## 7. 布局、排版与坐标所有权

### 7.1 冻结滚动 owner

桌面：

- `.wall__dossier-scroll` 是正文唯一纵向滚动 owner；
- 左栏 manuscript、当前场区、右 inspector 各自只在内部溢出时滚动；
- tool rail 固定在网格列，不随正文滚动；
- Notebook surface 在桌面不再同时拥有第二套纵向滚动。

1024：右 inspector 作为覆盖/钻取层，正文仍保持自己的 scrollTop。

390：章节树、工具 rail、检查器为互斥 sheet；打开/关闭不重建正文、不丢 caret。

### 7.2 统一锚点几何

命令菜单、短 Ghost、选区条、批注、长候选共用同一组坐标事实：

- caret/range viewport rect；
- manuscript bounds；
- `visualViewport`；
- UI zoom / transform scale；
- 当前 scroll owner；
- overlay 实际测量宽高。

滚动、resize、字体/行高变化、zoom 变化时，组件只能二选一：重新定位到当前合法 anchor，或关闭并恢复焦点；不能停留在旧坐标。

桌面级联菜单必须按主菜单 + 子菜单总宽度做 containment，空间不足时翻转或纵向降级。

### 7.3 CSS owner 收敛

不先做全页 CSS 重写。按行为切片逐步收口：

1. 先建立 selector ownership 清单；
2. 当前 Authoring 主布局只保留一个 canonical owner；
3. 子组件样式回到各自 SFC，父级只拥有 grid/尺寸/token；
4. `Writing.global.css` 只保留真正跨组件的共享规则；
5. `Writing.scoped.css` 与 `Authoring.block-native.css` 中同 selector 的 theme/断点覆盖逐项消除；
6. theme 1 只做行为兼容，不参与本轮视觉重设计。

先改 Ghost/菜单/长候选所在的小区域截图确认，再扩到左右栏。禁止在方向未确认时整页换皮。

### 7.4 中文稿面基线

代表 fixture 必须同时检查：

- `第一章　章名` 的朴素展示，不加 `01`；
- 章节标题在稿面内部并与工具栏留出稳定呼吸区；
- 首行两字缩进按 CJK 字宽计算，标题/引文/列表不误缩进；
- 中文 `“”「」『』` 字形、行首行尾禁则与选区输入；
- 正文、Ghost、editable review 的 font/line-height/paragraph gap 一致；
- placeholder 与真实正文不争层级；
- 候选出现/消失后上下方向键的视觉行移动不跳变。

## 8. 新的真实用户模拟架构

### 8.1 三层门禁

#### A. 确定性交互 Gate（合并前必跑）

使用固定 provider 响应和固定合成书稿，验证状态、按键、正文、caret、请求计数和候选生命周期。它不依赖真实网络，因此任何核心断言都不能因 provider 不可用而 skip。

#### B. 视觉与几何 Gate（每个完整 UI 切片跑一次）

自动检查 bounding box、anchor distance、overlap、viewport containment、scroll owner 和 focus；截图只用于人工判断层级、排版协调和空壳，不用像素完全一致代替可用性。

#### C. 真实 provider canary（手动/夜间）

只验证网络、真实延迟、取消和响应形状。空返回是 `PROVIDER-FAIL/INCONCLUSIVE`，不能把 UI 核心断言当绿，也不能反过来阻塞确定性前端修复。

### 8.2 Harness 结构

保留 `scripts/authoring-journeys-smoke.mjs` 为兼容入口，将实现拆到专用目录，例如：

```text
scripts/authoring-ui/
  runner.mjs
  fixtures.mjs
  provider-stub.mjs
  human-input.mjs
  editor-actions.mjs
  assertions.mjs
  geometry.mjs
  artifacts.mjs
  scenarios/
```

要求：

- 每条 journey 独立 BrowserContext；
- fixture 直接建立稳定书/章/unit/node，不再重复用慢速 UI 建书掩盖核心场景；建书流程保留一条专门旅程；
- 文本选区优先调用编辑器可验证的 `selectText/findTextRange` 测试桥或 DOM Range，不再用 13px/字拖拽估算；
- 输入分为 `insertText`、带 delay 的真实键盘序列、composition 事件序列；
- Playwright clock 用于大部分 debounce 边界，另保留一条使用生产真实时长的 cadence canary；
- provider stub 拦截 `**/api/advisor/task`，按 taskType/请求序号返回固定两句 Ghost、固定两段长推演、空结果、延迟、abort 和错误；
- 记录脱敏诊断事件，不保存完整正文或 prompt。

建议增加只读诊断流：

```text
interaction-owner-changed
editor-input
ghost-armed/requested/shown/accepted/dismissed/stale
block-draft-opened/edited/adopted
autosave-started/completed
observer-scheduled/executed/skipped
memory-created/updated/deduped/notified
overlay-opened/closed
```

每条只记录 document key、revision、target id、reason、计数和耗时，不记录 API key、prompt 或用户原稿。

### 8.3 场景矩阵

| ID | 场景 | 真实动作 | 核心断言 | 关键截图 |
| --- | --- | --- | --- | --- |
| E01 | 连续中文输入 | 2 分钟等价节奏：输入、短停顿、Backspace、改字、Enter | 正文精确；caret 单调；无意外采纳；静默结束至多一次请求 | 无，失败才截 |
| E02 | 空行菜单冲突 | 非空段 Enter 到空行；跨 Ghost 延时后按 Space、`/`、Tab、Esc | 空行零 AI POST；菜单与 Ghost 异或；Tab 不纳入 Ghost；Esc 一次一层 | menu + caret 局部 |
| E03 | 光标停驻 | 在前文第 1/40/80 段快速移动，再稳定停 5 秒 | 经过位置零请求；最终位置一次；移动离开 abort；不出现空生成态 | 前文 Ghost 局部 |
| E04 | IME | compositionstart → 更新候选 → Tab/Enter/Esc → compositionend | composition 期间零 AI/菜单；最终正文只含已提交汉字；选区稳定 | 失败才截 |
| E05 | 短 Ghost | 固定两句；部分采纳第一句；继续手改；Undo | 只插第一句；剩余候选正确；手改取消且不立即重弹；Undo 不串写 | partial Ghost |
| E06 | Escape 层级 | Zen 中依次打开菜单、Ghost、composer、长 review、inspector | 每次只关闭最高层；Zen 最后退出；焦点回原位置 | 最复杂一层 |
| L01 | 长推演编辑 | 生成两段；改第二段、删短语、恢复/再改、采用 | 采用前正文/storage 零变；采用后只插编辑稿一次；刷新持久；Undo 原子 | editable review |
| L02 | 推演 stale | 生成中切章/改 target/删除 unit | 旧结果不进入新章；明确 stale；无 Teleport 空壳 | 失败才截 |
| M01 | 记忆幂等 | 同句标点改 5 次；每次停 6 秒 | 新候选 0；created event 0；toast 0 | 无 |
| M02 | 真 delta | 只改章尾，再写一个新事实 | 不复制章首；只观察 changed unit；候选来源指向正确 revision | 安静 badge |
| M03 | 冲突与跨书 | 写普通不同事实、再写真矛盾；保存后切书 | 普通事实冲突 0；真矛盾一条聚合；新书看不到旧书提示 | 冲突提示一张 |
| T01 | 工具真实性 | 顺序点击所有公开 rail 工具和主动作 | 0 placeholder；0 死按钮；空壳不得公开；焦点/滚动恢复 | rail + 右栏 |
| T02 | 当前场联动 | 左场景条选角色/地点/事件，编辑并“以此推进” | 同 projection；详情真实；instruction 精确预填且关闭后清空 | 左简报 + 右详情 |
| G01 | 长文几何 | 120 段；滚到 1/40/80/120；菜单、Ghost、选区、批注、review | 一个正文 scroll owner；锚点/containment/overlap 达标 | 1440 长文一张 |
| R01 | 响应式 | 同 fixture 在 1440/1024/390、zoom .85/1/1.25/2 | 无横溢出；pane 可达；正文不重建；标题/缩进/引号稳定 | 代表 5 张 |

### 8.4 计数 ledger

每条编辑旅程必须输出：

```text
editor mutations
→ autosave attempts / completed
→ Ghost armed / requested / shown / accepted / dismissed
→ observer scheduled / executed / skipped
→ memory created / updated / deduped
→ visible notices
→ overlay owner transitions
```

这样可以直接回答“改一个字为什么又弹了”，而不是只靠截图猜。

### 8.5 自动门禁阈值

- unexpected正文 mutation：0；
- 同一物理按键被两个 owner 消费：0；
- composition 期间 AI request：0；
- 空行 command-menu eligible 时 AI request：0；
- 同 target/revision/trigger 重复 request：0；
- exact duplicate：0 storage、0 created event、0 notice；
- 单字符/纯标点修正：0 自动候选；
- routine memory：0 toast、0 自动展开；
- 每个公开工具：0 placeholder、0 page error、0 console error；
- 主/子菜单、selection toolbar、review 全部在 viewport/manuscript bounds；
- caret/当前行 overlay 偏差目标不超过 2 CSS px；
- 滚轮一次只改变预定 scroll owner；
- provider empty：单独记为 provider failure，前端 suite 不得假绿。

## 9. 截图、trace 与清理

### 9.1 目录与命名

```text
tmp/authoring-journeys/
  20260828T103000Z_<short-sha>/
    manifest.json
    report.json
    e02/
      e02__1440x900-dpr1__s03-menu-conflict.jpg
      e02__caret-menu-clip.png
      events.jsonl
      state.json
      trace.zip
```

文件名必须包含 journey、完整 viewport、步骤和状态，禁止继续写固定 `/tmp/j2-rows.png` 互相覆盖。

### 9.2 成功评审截图预算

- 1440×900：普通稿面、命令菜单、短 Ghost、editable review、右栏真实详情、长文几何，共约 6–7 张；
- 1024×768：右栏覆盖、长候选与菜单重排，共约 3 张；
- 390×844：正文 Ghost、命令菜单、工具/检查器 sheet，共约 3 张；
- 整轮成功人工评审控制在 12–15 张。

普通 viewport 使用 JPEG quality 78、DPR 1，目标单张小于 350–600KB；文字、caret、anchor 细节使用局部 PNG clip。长文禁止 full-page 巨图。

### 9.3 默认保留规则

- 默认 `fail-only`：成功只留小型 `report.json`，过程图片在 finally 删除；
- `review` 模式才保留 12–15 张代表图，新一轮被确认后清理旧 review round；
- 失败保留 viewport JPEG、局部 PNG、events/state；trace 只在失败或显式 debug 模式保留；video 默认关闭；
- 每 journey 上限 30MB，整 run 上限 200MB；
- 本地只留最近 3 个失败 run 或 7 天，先到者为准；
- 清理脚本只能操作仓库专用 `tmp/authoring-journeys`，必须校验 realpath，拒绝空路径、根目录、workspace root 和符号链接越界；
- SIGINT、超时和异常都经 finally 清理成功产物并正常关闭本进程拥有的 browser；禁止 `pkill`；
- 只有用户明确批准的最终代表图才进入 `docs/demo`，过程截图不入 Git。

## 10. 实施切片

### Slice 0：让测试工具如实报红

**目标：** 先修 harness 的退出码、失败证据和 provider 隔离，但不借机改产品行为。

工作：

1. 拆分 runner/actions/assertions/artifacts；
2. FAIL、HARNESS-ERROR、TIMEOUT、action scenario failure 设置非零 exit；
3. 所有 journey 捕获 console/page/http；catch 也截图；
4. 移除全局 `pkill`；
5. 增加确定性 provider stub 与 E02/L01/M01 最小红灯；
6. 让 generic `ui-audit` 不再用空 fixture/假 ghost 代表 Authoring，Authoring 核心状态改由专用 suite 负责；
7. 固化 artifact manifest、预算与 prune dry-run。

Gate：人为注入一个失败断言时命令必为非零；失败现场存在；成功产物按策略清理；不会杀其他浏览器。

### Slice 1：交互 owner、IME 与短 Ghost

**主要文件：** `WritingNotebookEditor.vue`、`Authoring.vue`、`useWritingAgent.js`、新增或扩展交互 coordinator。

工作：

1. 建唯一状态机和按键授权；
2. 补齐 compositionstart/end、beforeinput、paste 的真实接线；
3. 空行/menu/inline 互斥；
4. 输入触发与 cursor-dwell 触发分开；
5. 请求指纹、dismiss suppression 和 passive feedback；
6. Escape 一层关闭与焦点/选区恢复；
7. 不顺带清理所有 unused，只删除与本切片争 owner 的死路径。

Gate：E01–E06 + 1440/390 的 Ghost/menu 代表截图。完成整个切片后只跑一次 focused Gate。

### Slice 2：可编辑长推演草稿

**主要文件：** `AuthoringBlockComposer.vue`、新的或重构后的 block review 组件、`WritingNotebookEditor.vue`、采纳事务现有 owner。

工作：

1. `blockPreview.text` 派生 `draftText`；
2. 原位可编辑 review、恢复原稿、采用编辑稿；
3. 草稿编辑零 autosave/observer/inline Ghost；
4. target/stale/切章/删除 unit；
5. 一次 adoption + refresh + undo；
6. Teleport anchor 生命周期收口；
7. UI 只做正文式候选，不做新卡片面板。

Gate：L01/L02 + 1440/1024/390 代表截图。当前方向经用户截图确认后再细修视觉。

### Slice 3：记忆安静化

**主要文件：** `Authoring.vue`、`gameStore.js`、observer scheduler/derivation、`memoryCandidates.js`、记忆通知/审阅组件。

工作：

1. autosave 与 derive 解耦；
2. changed-unit delta；
3. 幂等键、duplicate skip、similar update、rejected suppression；
4. prose/boundary 同 revision 合并；
5. claim-key 冲突；
6. completed result 真源与当前书过滤；
7. routine 静默、冲突聚合、通知有目标才可查看；
8. 自动记忆独立开关。

Gate：M01–M03。验收输出完整计数 ledger，不用新增大量截图。

### Slice 4：公开组件真实性

**主要文件：** tool rail、outline、scene detail、memory/exception review、左栏模板。

工作：

1. 按表隐藏/移动空壳入口；
2. 修复大纲 props、冲突审阅和项目节点动作；
3. 修复“以此推进”预填与关闭清空；
4. 修复 close/emit 接线；
5. 删除假筛选、假卷、嵌套 button、不可达 right tree；
6. 子组件收回自己的样式；
7. `Authoring.vue` unused 只按已删除路径成组处理，不做无收益大扫除。

Gate：T01/T02 + 一张 1440、一张 1024、一张 390 真实工具截图。

### Slice 5：几何、排版与 CSS owner

**主要文件：** Notebook/editor geometry helpers、Authoring 三层 CSS、toolbar/inspector/scene rail 样式。

工作：

1. 单 scroll owner；
2. overlay 共享坐标和 reflow/close 策略；
3. ResizeObserver、visualViewport、zoom；
4. 主/子菜单 containment；
5. 章节名、标题位置、首行缩进、引号、段距、Ghost/review 同版心；
6. 按 selector ownership 消除三层 CSS 冲突；
7. 只在完整行为切片后截图，不逐个样式跑测试。

Gate：G01/R01 + 12–15 张整轮评审图。用户确认后才扩散同类视觉修复。

### Slice 6：真实 provider 与耐久验收

工作：

1. 确定性 Gate 全绿后，桌面只跑 Ghost 与长推演两条真实 provider canary；
2. 记录 requestId、finish reason、latency、脱敏 response shape，不保存正文/prompt/key；
3. provider empty 独立报失败，不污染 UI Gate；
4. Windows 中文输入法做 30 分钟人工耐久：连续写作、回前文、上下移动、Space/`/`、批注、长草稿；
5. 记录可复现步骤和计数，不以“感觉没问题”收口。

Gate：没有文字损坏、无重复候选风暴、无浮层漂移；用户按代表截图和实际输入确认。

## 11. 验证、提交与并行约束

- 设计阶段（本文件）不运行测试；
- 每个 Slice 连续完成一个可操作闭环后，才跑一次 focused Gate 和代表截图；
- 多个切片收口准备交付时，才跑一次 `verify:full`；
- 不为单个函数、一个 CSS 值或一个文案反复跑全量；
- 不为每个小修创建提交；一个可独立验收的 Slice 才是候选提交边界；
- 当前工作区已有 `Authoring.vue` 未提交 WIP，实施前先审阅并保留，不得覆盖；
- `Authoring.vue`、Notebook 和核心 Authoring CSS 不允许多个 worker 同时编辑；可并行的只有 disjoint 的 harness/artifact 或只读审计；
- UI Slice 遵守 `ui-style-check`，行为/状态变化同步 `docs-status-handoff`，完成声明遵守 `testing-verification`，准备提交才使用 `commit-conventions`。

## 12. 明确不做

- 不扩素材页、画布、Experience 或新 Agent 功能；
- 不用更多卡片填补角色/素材空壳；
- 不先重写 8147 行 Authoring 再找问题；
- 不用真实 provider 替代确定性交互测试；
- 不用像素 diff 替代阅读和操作判断；
- 不保存用户真实长稿、prompt、API key 或完整 provider 输出到 artifact；
- 不把 console 为空、localStorage 有值或 build 通过写成前端体验已通过；
- 不再把“provider 返回空所以跳过断言”算作旅程绿灯。

## 13. 完成定义

本计划完成不是“脚本新增了若干场景”，而是作者可以：

1. 连续中文写作、回看前文和上下移动光标，不被 Ghost/菜单/通知抢走输入；
2. 在空行稳定使用 Space 或 `/`，不和短补全重合；
3. 对短 Ghost 部分采纳，对长推演先编辑再纳入；
4. 小修文本不产生重复记忆候选，真正冲突才被安静地聚合提示；
5. 只看到真实可用的左右工具；
6. 在长文、1440/1024/390 与常用缩放下，文本、标题、菜单、批注和候选保持同一版心与正确锚点；
7. 失败时自动化必报红并留下小而充分的证据，成功时不会堆积截图和 trace。
