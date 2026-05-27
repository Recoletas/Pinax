> 归档说明：本文件为历史专题说明，当前不作为日常执行入口；仅在改动对应模块时按需查阅。

# 06 - 统一分镜输出层

状态：进行中

## 1. 在工具链中的位置

分镜系统不应再被理解为“诗歌页和散文页里各有一点页面内分镜功能”。

它应该成为工具链的统一结构化输出层：

```text
体验片段 / 素材 / 章节片段
	-> 卡片关系画布
	-> storyboard draft
	-> storyboard version
	-> 校验
	-> 导出
```

## 2. 为什么它是剩余最大块

此前诗歌和散文虽然已有分镜相关能力，但它们的问题是：

1. 数据结构仍偏页面私有。
2. 不同来源的文本无法稳定复用同一输出对象。
3. 版本、恢复和导出校验没有统一口径。

新的结论不是继续保留两个题材入口，而是把原散文卡片能力收口为统一关系画布，并让诗歌独立页面退出主线。

## 3. 目标对象模型

建议把统一分镜对象收口为三层：

```ts
type StoryboardDocument = {
	id: string
	schemaVersion: number
	projectId: string | null
	source: StoryboardSourceRef
	currentVersionId: string | null
	versions: StoryboardVersion[]
	createdAt: number
	updatedAt: number
}

type StoryboardVersion = {
	versionId: string
	createdAt: number
	taskType: string | null
	promptVersion: string | null
	parameters: Record<string, unknown>
	shots: StoryboardShot[]
	validation: StoryboardValidationResult
}

type StoryboardShot = {
	shotId: string
	order: number
	sourceText: string
	scene: string
	shotSize: string
	cameraMovement: string
	duration: number | null
	visual: string
	dialogue: string
	sound: string
	music: string
	transition: string
	emotion: string
	notes: string
	referenceImageId?: string
	referenceImagePrompt?: string
}

type StoryboardSourceRef = {
	sourceType: 'relation-card' | 'narrative-asset' | 'chapter' | 'manual' | 'prose-card' | 'poetry-tree'
	sourceId: string | null
	sourceVersionId: string | null
	title: string
	excerpt: string
}

type StoryboardValidationResult = {
	ok: boolean
	errors: StoryboardValidationIssue[]
	warnings: StoryboardValidationIssue[]
	checkedAt: number
}

type StoryboardValidationIssue = {
	shotId: string | null
	field: string | null
	code: string
	message: string
	severity: 'error' | 'warning'
}
```

字段细节可以先写协议，不要求第一版全部 UI 化：

- `shotSize`、`cameraMovement`、`transition` 先允许字符串，service 层保留枚举映射入口。
- `source` 必须保留来源指针，避免分镜版本变成孤立结果。
- `validation` 即使为空也要有默认结构，方便后续导出统一判断。
- `referenceImageId` 和 `referenceImagePrompt` 先作为可选元数据记录，不要求第一版导出真实图片文件。

## 4. 输入适配策略

后续所有来源都不应该直接生成“最终导出格式”，而是先适配成统一 storyboard 对象。

| 来源 | 适配策略 | 当前阶段 |
|------|----------|----------|
| 卡片关系画布 | 读取绑定素材的节点、关系和镜头顺序，映射到 shots | 首轮已接入，继续收口输出 |
| 体验素材 | 以 `storyboard-seed` 或片段摘要为输入生成 shots | 已接入 |
| 写作章节片段 | 以正文节选或章节纲要生成 shots | 已接入 |
| 旧散文分镜卡片 | 保留为迁移来源，转换为素材引用节点 | 已接入旧结构 |
| 旧诗歌分镜树 | 不再扩展；需要时一次性转素材/卡片节点 | 待退场 |

当前补充：

- `narrativeAssets` 保存内容，卡片关系画布保存引用和关系，`StoryboardVersion` 保存输出快照。
- 分镜卡片默认显示短标题、小预览图和关系标记；完整内容回到素材详情查看。
- 诗歌页新增功能停止实施，已有接线只作为迁移基础，不构成保留独立页面的理由。

## 5. 执行方案

### 5.1 S1 - schema 与 service 先行

目标：先把对象和存储服务定下来。

建议交付：

- `storyboard` 统一 schema。（已启动）
- `storyboardService` 或等价 service。（已启动，当前落在 `storyboardStore`）
- 基础增删改查。（已支持文档创建、列表、读取）
- 版本对象和版本切换接口。（已支持追加版本和恢复当前版本）

验收：

- 任一来源的分镜结果都能落到 `StoryboardDocument`。（旧 snapshot 保存已同步写入统一文档）
- 页面不需要自己维护一套导出前结构。（后续迁移旧页面适配）

当前进展：

- 新增 `STORYBOARD_DOCUMENTS` 存储键。
- `storyboardStore` 已支持 `StoryboardDocument`、`StoryboardVersion`、结构化 `StoryboardValidationResult`。
- 旧 `saveStoryboardSnapshot()` 仍保留兼容，但保存时会同步写入统一文档和版本。
- `useDirector` 已开始直接消费 `saveStoryboardVersion()` / `restoreStoryboardVersion()`，历史列表现在对应统一版本历史。
- 旧 `ProseEssay` 与 `PoetryLab` 导出均已能写入统一文档，这些能力只用于迁移和回归基础。
- 新画布优先复用现有卡片拖拽、连线、分组与时间轴能力，并改为绑定素材引用。
- 分镜态的可视差异从关系画布层做出来：突出关系线、镜头顺序、转场和紧凑预览图。
- 图片完整管理回到素材页；卡片节点只显示轻量缩略图，不扩展大图管理。
- 关系创建不放在详情面板选择目标节点；用户在画布图例选定线型后依次点击节点完成连接，并可在画布直接断线。
- 后续优先补导出校验和更细的规则收口，细节复杂的导出规则先写进计划，暂不在这一步展开。

### 5.2 S2 - 版本化与恢复

目标：同一来源多次生成分镜时保留历史版本，而不是覆盖旧结果。

建议交付：

- 新生成结果自动形成新版本。（已支持）
- 能切换当前版本。（已支持恢复指定版本为当前版本）
- 能恢复旧版本为当前版本。（已支持）
- 记录生成时间、来源、参数、任务类型。

验收：

- 重新生成后旧分镜仍可回看。
- 作者能明确知道当前正在使用哪个版本。

### 5.3 S3 - 校验与导出

目标：把“导出前发现问题”变成统一行为。

至少检查：

- 镜头顺序是否连续。
- 必填字段是否为空。
- 时长是否有效。
- 是否存在完全空白镜头。

导出要求：

- 导出失败要返回明确原因。
- 校验结果要能保存在版本对象里。

### 5.4 S4 - 旧能力适配迁移

目标：将旧页面能力迁到素材与关系画布，底层继续使用统一分镜对象。

迁移顺序建议：

1. 把散文 directing cards 转成关系画布的初始数据来源，后续节点落为 `assetId` 引用。
2. 给素材增加加入/定位卡片画布入口。
3. 从诗歌页迁出确实有价值的低成本生成动作，随后移除独立页面。
4. 体验素材和章节片段继续落入素材或卡片画布，再生成草稿导出。

原因：

- 卡片画布天然同时表达素材关系和 shot 顺序。
- 独立诗歌树重复了关系表达，却引入额外页面理解成本。
- 体验和章节先进入素材，来源边界更清晰。

### 5.5 S5 - 关系画布与分镜视图收口

目标：分镜应是关系画布上的制作视图，不能复制一套题材页面。

当前决策：

- 原散文页改为卡片关系画布，不再强调散文题材或长文字卡。
- 诗歌独立页面进入移除计划，不继续设计其模式切换。
- 切到分镜侧时，主动作应是“从当前关系和镜头顺序生成分镜草稿”。
- 没有分镜版本时，应显示空态和生成入口；已有版本时，应展示统一 `StoryboardVersion` 的版本卡片、镜头列表、校验状态和下载入口。
- 素材是内容真源，卡片画布是关系真源，最终分镜历史、校验和导出继续向分镜工作台收口。
- 节点只展示短标题、小预览图和必要镜头标记，景别、运镜、时长、声音和转场在选中详情中编辑。
- 纯文本分镜只作为导出结果，不作为主要编辑体验。

后续迁移：

1. 先精简素材页并补素材到卡片跳转。
2. 再将旧散文卡片改为素材引用节点和紧凑关系画布。
3. 迁出必要生成方式后删除诗歌独立页面。
4. 最后移除页面私有直接下载路径，统一走“保存版本 -> 用户确认 -> 下载”。

### 5.6 S6 - 导航与产品叙事收口

当前已经在一级导航和首页入口里体现为分镜工作台，后续继续把页面内的分镜视图从页面专属能力收口成工作台主能力。

方向：

- 卡片画布成为素材到分镜之间的明确工作区。
- 分镜成为卡片关系的输出视图。
- 诗歌不保留独立入口，散文不再作为页面定位。

## 6. 非目标

- 不做视频剪辑器。
- 不在第一阶段解决所有导出格式。
- 不先做大 UI 再补对象模型。

## 7. 验收标准

| 验收项 | 目标状态 |
|--------|----------|
| 素材、关系卡片、体验片段能生成同一结构 | 必须完成 |
| 历史版本可恢复 | 必须完成 |
| 导出前有统一校验 | 必须完成 |
| 导出失败有明确原因 | 必须完成 |
| 页面不再自带私有分镜 schema | 必须完成 |
| 诗歌独立页面退场后主路径无缺口 | 必须完成 |
