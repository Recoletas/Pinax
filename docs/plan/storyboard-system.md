# 06 - 统一分镜输出层

状态：进行中

## 1. 在工具链中的位置

分镜系统不应再被理解为“诗歌页和散文页里各有一点编导功能”。

它应该成为工具链的统一结构化输出层：

```text
体验片段 / 素材 / 章节片段 / 诗歌结构 / 散文卡片
	-> storyboard draft
	-> storyboard version
	-> 校验
	-> 导出
```

## 2. 为什么它是剩余最大块

当前诗歌和散文虽然已有分镜相关能力，但它们的问题是：

1. 数据结构仍偏页面私有。
2. 不同来源的文本无法稳定复用同一输出对象。
3. 版本、恢复和导出校验没有统一口径。

这正好也是“诗歌/散文退居入口，工具链升格为主轴”的关键一步。

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
}

type StoryboardSourceRef = {
	sourceType: 'prose-card' | 'poetry-tree' | 'narrative-asset' | 'chapter' | 'manual'
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

## 4. 输入适配策略

后续所有来源都不应该直接生成“最终导出格式”，而是先适配成统一 storyboard 对象。

| 来源 | 适配策略 | 当前阶段 |
|------|----------|----------|
| 散文分镜卡片 | 读取 directing cards，映射到 shots | 已接入 |
| 诗歌分镜树 | 读取诗歌 directing 输出，映射到 shots | 已接入 |
| 体验素材 | 以 `storyboard-seed` 或片段摘要为输入生成 shots | 已接入 |
| 写作章节片段 | 以正文节选或章节纲要生成 shots | 已接入 |

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
- `ProseEssay` 的直接导出现在会写入统一文档并先做结构校验，`PoetryLab` 编导模式的 Markdown 导出也已接入统一文档，体验和写作导出则统一走校验保存入口。
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

目标：让现有诗歌、散文和体验入口不丢功能，但底层改为统一分镜对象。

迁移顺序建议：

1. 散文 directing cards 已接入。
2. 诗歌 directing tree 已接入。
3. 体验素材和章节片段已接入草稿导出，后续继续补更细的校验和导出规则。

原因：

- 散文卡片天然更接近 shot 列表。
- 诗歌树更像层级结构，适配略复杂。
- 体验和章节涉及更多来源上下文，放到后面更稳。

### 5.5 S5 - 导航与产品叙事收口

当前已经在一级导航和首页入口里体现为分镜工作台，后续继续把“编导模式”从页面专属能力收口成工作台主能力。

方向：

- 分镜成为一级能力或明确工作区。
- 诗歌和散文保留为输入模式，而不是独占分镜出口。

## 6. 非目标

- 不做视频剪辑器。
- 不在第一阶段解决所有导出格式。
- 不先做大 UI 再补对象模型。

## 7. 验收标准

| 验收项 | 目标状态 |
|--------|----------|
| 诗歌、散文、体验片段能生成同一结构 | 必须完成 |
| 历史版本可恢复 | 必须完成 |
| 导出前有统一校验 | 必须完成 |
| 导出失败有明确原因 | 必须完成 |
| 页面不再自带私有分镜 schema | 必须完成 |
