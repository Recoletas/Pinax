# Pinax 当前架构与代码边界

核对日期：2026-10-16。实现基线为 main 的 `cb6ee525`，发布记录见 [2026-10-15 回执](../agent-runs/release-20261015.md)。本文描述代码职责；运行检查和模型质量证据见[验证状态](../src/test-status.md)。

## 1. 运行结构

Pinax 是 Vue 3 工作区、浏览器本地数据和 Express 服务的组合。文本模型由独立 Storyflow / pi-agent 运行器提供，图片和视频使用各自的渠道适配器。

```text
浏览器 Vue 工作区
  ├─ 书稿 / 设定 / 素材 owner → localStorage、IndexedDB
  ├─ 普通文本、推演 → Express → kitModelGateway → Storyflow 任务面
  ├─ 助手多轮工具 → /api/storyagent → Storyflow 任务面（loopback 8451）
  │                                       ↓ 提议 / planned 生成请求
  │                    浏览器复核授权、原文修订 → 正式写入 / 撤销
  ├─ 图片 / 视频 → Express 或已配置媒体适配器
  └─ 本机项目 → /api/localmirror、/api/knowledge（公网禁用）
```

普通文本调用和助手工具循环共享运行器与当前文本模型，但保留各自的任务协议和 UI。不是把所有功能都变成同一个聊天 Agent。运行器缺失时返回不可用，不回退成浏览器直连文本模型。

服务器部署需要前端 `dist`、后端生产依赖和编译后的运行包；只更新前端无法更新正在运行的工具。构建、启动和回滚见[运行包发布](./agent-runtime-deployment.md)。

## 2. 工作区、路由与视图

| 职责 | 当前入口 | 边界 |
| --- | --- | --- |
| 应用启动 | `src/main.js`、`src/App.vue` | 全局主题、路由、平台适配 |
| 工作区外壳 | `src/layouts/AppShell.vue`、`WorkspaceContentGroups` | 活动栏、目录、中央和旁区标签、视图挂载 |
| 资源与实例 | `workspaceViewContract`、`useComposableWorkspace` | 区分资源身份、视图实例、主/旁位置和当前选项 |
| 路由兼容 | `workspaceRouteAdapter`、`workspaceTabsStore` | 旧地址与导航恢复；不保存第二份书稿 |
| 左栏状态 | `useWorkspaceDirectory`、`useAuthoringDirectory` | 文件/搜索/书稿/扩展模式、桌面显隐和宽度 |
| 编辑与返回 | `useAuthoringWorkspaceNavigation`、`useAuthoringPersistence` | 选区、滚动、保存及离开检查 |
| 写作右栏 | `useAuthoringInspectorState`、`AuthoringDualPane` | 工具选择与原有可编辑双栏 |

中央使用一组内容标签，旁区可打开对照内容。章节主区复用原 Authoring 编辑会话；旁区的章节阅读视图不等于原可编辑双栏。后者继续保留，不能为简化布局而删除。

视图移动保留实例；同作品切换不应重新发送模型请求。关闭、换资源、切书仍需调用对应保存和任务守卫。布局最多保留 32 个视图，超限要求显式关闭，不自动淘汰未保存内容。任意嵌套分组、跨作品并行编辑和多个编辑组共享撤销尚未实现。

桌面进入文章或构思会展开目录；作者手动收起后普通切章不反复展开，回首页保留当前显隐。手机抽屉独立管理，不把选完文件后的关闭写成桌面偏好。

应用内文档通过 `useWorkspaceHost.bindDirectorySurface` 把章节/页内目录交给同一个左栏宿主，正文仍由 `DocsPage` 负责加载。目录模式与桌面显隐属于文档页，离开时解绑，不改作品的文件/书稿模式；宽度、手机抽屉和焦点管理复用工作区。

旧设定、资料、媒体和体验路由保留适配。`src/router/index.js` 是页面注册入口，不能靠删旧路由绕过保存检查。

### 项目目录

`ProjectDirectory` 从既有 owner 读取章节、构思、绑定世界书、来源、素材和漫画页。默认文件夹为正文、构思、设定、资料、素材、漫画；世界书下的人物等分类是派生视图。

`src/services/workspace/projectDirectory.js` 只保存文件夹、归档位置、排序和同书资源关联。持久键 `pinax-project-directory:v1:<bookId>` 及显示偏好已纳入备份。资源 ID 不由名称或路径生成；移动目录不改变章节叙事/导出顺序，也不改变资源类型和作品归属。移除文件夹把内容移到上一级，不删除原件。

项目文档仍是只读集合入口，并未把所有磁盘文件逐个注册成可写资源。漫画页用稳定 pageId 进入现有漫画编辑 owner；格、阶段、候选仍由漫画存储维护。跨作品移动和共享世界容器不能按普通目录节点处理。

### 内置扩展

`workspaceExtensions` 注册可信内置视图的类型、标题、图标和异步加载器。UI 加载器由 AppShell 注入，服务层不导入页面。启停影响新视图打开，已打开的视图和任务不因此销毁。

扩展列表不展示这些内置工作台，也不再允许通过旧禁用偏好关闭核心视图。当前没有第三方脚本市场或远程插件热加载。Skill、Tool 和工作区视图是不同能力；启用前端视图不授予工具读写权限。见[扩展接口](./workspace-extensions.md)。

## 3. 数据所有者

| 数据 | 唯一写入边界 | 保存与限制 |
| --- | --- | --- |
| 书稿、章节、writing units | `writingBooksRepository`，由编辑事务调用 | `writing_books`；页面不能维护平行书稿 store |
| 世界书与条目 | `worldStore` durable mutation owner | 浏览器缓存与绑定文件接缝并存；不能描述为全量磁盘唯一真源 |
| 世界书文件 | `worldbookFileRepository`、服务端 local mirror | 从 bookId 解析项目绑定；文件身份/解析错误阻断，合法空文件不回填 |
| 当前场、推演和干预 | `services/agents/authoring/` 会话与事务 | 正式场景有限持久化，草稿/运行状态不等于正式事实 |
| 助手对话 | 每书助手会话与 `authoring_assistant_conversation:` 存储 | 宿主持有运行会话，页面提供可释放编辑绑定 |
| 来源归档 | `worldbookSourceArchive` | IndexedDB 中解析内容和出处，不保证保存输入文件原始二进制 |
| 素材与媒体 | `narrativeAssets`、`mediaAssetStore` | 素材元数据与媒体 Blob 分域保存 |
| 记忆与事实 | 浏览器 memory/ledger owner | Dexie/IndexedDB 的事实、证据、决定、修订；不连接外部 Utopia 服务 |
| 画布 | `proseCanvasRepository` | 按作品保存；旧全局数据只做保守迁移 |
| 跑团 | `gameStore` 与 experience coordinator | 保留原存档和剧情 owner，不成为书稿真源 |
| 地图 | `geographyStore` 与 world-map 服务 | 地图几何、世界书地点与历史投影有各自边界 |
| 模型配置 | 文本/图片/视频配置 store；文本生效模型在运行器 | 本机选中文本配置经后端热切运行器；公网禁止修改 |
| 工作区布局 | workspace host、标签与目录状态 | 只存身份、定位、尺寸等，不存正文、授权或模型密钥 |

持久化使用 `durableMutationResult` 的 `{ ok, reason, retryable }` 合同。调用方须检查保存回执，不能先发布“成功”再异步补写。正文、世界书和画布已有失败回滚与恢复路径，不能另开直接数据库写入捷径。

推演通过 `generatedDraftRecovery` 按作品和文稿保留最新文字恢复副本，不持久化旧写入授权。关闭或切换不等于丢弃；采用后校验正文持久化结果再清除副本。助手采用继续走 `assistantEditJournal`，写入后读回核对再提交回执。恢复副本只是保稿，不是正式书稿或跨设备同步。

完整 ZIP 包含书稿、设定、来源归档、已落盘媒体及记忆历史；轻量 JSON 不含 IndexedDB 原件。模型密钥不进入两种备份。HTTP、HTTPS、主机或端口变化会切换浏览器存储来源；布局恢复也不是跨设备同步。

## 4. 设定、资料与知识检索

### 设定编辑

`WorldbookContentWorkspace` 由旧路由或 `WorkspaceSettingsView` 挂载，使用显式 bookId/worldbookId。中央编辑标题与自由正文；旧集中字段在创作基调。右侧提供同类、场景与经历、表格、关系和管理，关系图保留在右栏，默认显示当前条目和直接关联。

`EntryProfileEditor` 保留模板、自由字段和正文投影裁决。结构字段与手改正文冲突时，作者选择只存字段或覆盖正文；不得静默丢弃 profile、富关系、未知 frontmatter、来源指针、userTouched 或 tombstone。

`SettingUsagePanel` 按名称/别名派生正文提及；同名匹配不等于实体确证。插入动作经原编辑绑定在光标处插入名称，选区存在时不覆盖原选区，并支持正文撤销。

`settingContextModel` 读取正式章节场景锚点和当前世界书 geoHistory，按章节/单元顺序展示出现记录。字面提及、待审记忆和跑团全局状态不用于猜测人物当前位置。地图定位复用原地点与历史 ID，未新增每书独立地图存储。

### 三种资料能力

1. **浏览器来源归档**：导入浮窗解析文件，确认后保存来源与片段；提取出的设定仍需审阅。旧 sourceDocuments 迁移保留 archiveRef、sourceRefs、chunkIds 和 contentHash。
2. **助手快照检索**：读取本轮受限的作品目录、正文、绑定设定和来源。长章可能是标注过的节选，不保证任意中段都在上下文里。
3. **本机知识检索**：`/api/knowledge` 调用 `knowledgeRuntime`，在工作线程执行固定版本 Storyflow 知识内核；按注册项目生成派生索引并检查来源修订。需要独立知识运行包，公网关闭。

本机知识内核已接通，旧文档“完全未接 RAG”不再成立；它也不等于接了公网外部向量数据库。索引有摘要而缺原文时须报明确状态，不能补造原文。`assistantKnowledge: true` 只表示工具已装入，不证明运行包、项目绑定和查询依赖全部就绪。

## 5. 助手、推演与正式写入

助手的只读、审阅修改、自动修改决定能否提出及采用修改，并另有章节、设定和大纲范围。自动模式仍需有效授权、目标未变化和 durable 保存成功；模型没有直接写正式书稿的权限。范围菜单以当前章节、本作品两个快捷预设和可展开的自定义细选映射既有 scope/chapterIds/worldbook/outline 合同；本作品预设明确开启本书正文、设定、大纲，默认当前章节不扩权。当前章节 ID 由轻量 destination 取得，自定义初选不误用第一章。权限菜单只更新下一次发送的本地偏好，不调用 revoke/authorize；每次 ask 在首个异步准备前冻结权限与会话 ID，prepare/enrich/health/authorize/生成及自动采用均沿用本次快照。运行中更改显示“下次发送生效”，不使当前 SSE 断流；停止操作仍走显式 cancel。手动采用按采用时的偏好重新授权，自动采用按本次发送快照重新授权；采用前 `permissionContext()` 只取得作品/章节目标。权限菜单章节列表使用仅含 ID/标题的 `chapterOptions()`；正式发起助手请求仍由 `prepare()` 建立完整冻结上下文。

人物、设定和大纲的助手修改由 `useAssistantObjectEdits` 在原编辑组件内生成只读增删标记；原目录、字段和位置不被独立审阅层替代。待新建对象仅加入视图目录，不走普通自动保存。预览复用纯 `applyAssistantProposal` 计算小范围投影，实际采用仍调用既有授权／修订／durable 事务；投影不是正式数据。采用后“完成”只收起标记，“撤销本轮修改”沿用整轮回执撤销，不声称单对象撤销。作品／世界书绑定不符或已撤销时不投影；后续手工改动不应标为助手新增。


当前章节的续写/替换/插入通过 `generate_narrative_draft` 返回 planned 请求，浏览器继续调用 `AuthoringRunSession → narrativeKernelExecutor → runNarrativeAgentGeneration`，复用现场冻结、BeatPlan、连续性和任务边界检查。不是把聊天回答直接贴入正文。设定、大纲和标题沿原提议工具处理；未泛化成任意章节或新建章节的正文生成工具。

修改建议在原正文展示；采用/自动采用经事务保存并记录回执，撤销再次检查后续修订。页面绑定变化时自动提案转待审，返回原目标后复核。不会因切到新书而把旧结果写入当前选中文档。

局部改写通过 `rewriteText` 指定替换片段；前文继续参与上下文，但不要求模型重写保留部分。`rewrite-range` 使用冻结目标的场景投影校验，避免编辑器焦点变化误报场景过期。工具声明的 `inputSchema` 在 Express 转发时保留；Anthropic 强制工具选择由运行包适配，补全失败不能作为空成功返回。2026-10-18 已在本机更新；公网仍为 10-15 发布包。

推演默认写下一段，可空指令续写；情节试演在右侧比较走法，选定后再生成正文草稿。当前场识别在使用边界准备候选，作者确认后入场，不在每次输入时更新正式角色状态。

对话与运行任务分开：普通追问留在当前会话；编辑提问、重新生成和换参数重答保留原会话并保存最多 8 个问答版本；fork 始终另开对话。切版本不自动撤销已采用的正文。完整回答与工具完成摘要分开保存，不能用完成摘要覆盖流式全文。

取消、超时、迟到响应和原文变化均由所属 workflow 检查。模型生成失败会尽量保留可读内容，但不得把不完整或未通过检查的结果标成可采用。

## 6. 媒体、跑团与任务生命周期

漫画、编导及跑团通过既有工作台组件接入资源宿主，数据继续归原 Repository。移动视图不复制项目数据或重跑生成；没有后台能力的操作仍会阻止关闭，不应先删除 busy guard。

旧素材页面通过兼容壳转到正文画师或原素材阅读；正文选区收集后留在收件箱，编导工作台直接选素材。素材本身未迁移或删除。

漫画单张显示活动进度和计时，批量显示处理数；内置 MiniMax 批量最多两格并行，其余保留上一格参考依赖。请求结果核查只能用同一请求和目标的已归档图片解除占用。

视频任务区分提交、轮询、保存链接和保存原件。浏览器标签页记录可以续查已有任务，服务器内存任务不能保证跨重启恢复；只有已保存的原件能脱离临时链接播放和进入 ZIP。

单人跑团是常驻 `game-editor`；隐藏时暂停后续自动推进，已发起回合仍由原 owner 收尾。联机用完整 `online-editor` 持有连接。单人和联机不能同时创建 game owner；活跃房间须显式离开。布局持久化不承诺跨刷新恢复网络请求。

## 7. 公网与本机部署边界

公网浏览器只经 Express 访问运行器；8451 绑定 loopback。`PINAX_PUBLIC_ORIGINS` 配合来源校验、能力令牌、并发和预算限制；这些措施降低滥用，不等同于免登录环境无法被模拟请求。

公网禁用 `/api/localmirror`、本机知识能力和模型写接口。本机启用文件能力后仍须绑定项目；世界书提交校验修订和文件指纹，保留未托管文件，省略其他域不等于删除它们。

2026-10-15 公网已更新前后端与运行器，但 HTTPS 尚未配置完成。切换 HTTPS 需要同时处理用户原 HTTP 来源下的备份和恢复，不能直接跳转后误导用户以为稿件丢失。

## 8. 开发落点与验证

- 页面和组件负责展示、交互；任务、异步归属和取消放在既有 composable/workflow。
- 纯业务合同、事务与投影进入对应 `services/<domain>/`；不要再往 services 根层堆文件。
- shared 合同不能依赖 Vue/DOM；密钥和服务端代理放在 `server/`，不进入 `VITE_*`。
- 正式数据由表中 owner 写入；兼容路由、旧快照和派生索引不能成为第二个 owner。
- 结构预算、循环依赖和构建体积用实际命令确认，不把历史文件行数写成当前测量。

具体文件见[代码地图](../src/code-map.md)，标准门禁与最近实测见[验证状态](../src/test-status.md)，未完成的菜单设计等见[已知问题](../src/known-issues.md)。
