# 工作区扩展接口

状态：2026-10-15 已本地实施，未提交或推送。当前用于可信、随仓库交付的工作台视图；不加载远程脚本、不提供在线插件安装。

## 当前入口

左侧活动栏为文件、搜索、书稿，扩展位于底部。首页提供作品与扩展入口。手机在目录标题的视图选择器切换。

扩展左栏显示可搜索列表，中间沿用已有标签与主区显示详情。创作工作台属于基础能力；漫画、视频、素材与插画可以启停。停用只阻止新开该扩展的视图，已打开内容仍可激活、保存和关闭，任务不会因此取消。启停是应用显示偏好，不是模型工具权限。

## 注册视图

实现位于 `src/services/workspace/workspaceExtensions.js`。扩展由 `workspaceExtensions.register()` 注册，宿主也提供同一对象 `host.extensions`。宿主、列表和视图解析共同使用这一份注册表。内置组件加载函数在`workspaceBuiltinViews.js`定义，由AppShell注入宿主；服务层注册表不反向导入界面。纯资源合同可在未装配组件时使用。

```js
// 示例：src/extensions/timeline.js；贡献者提供同目录 TimelineView.vue，
// 并在应用启动时导入此注册模块。
import { workspaceExtensions } from '../services/workspace/workspaceExtensions.js'

workspaceExtensions.register({
  id: 'pinax.timeline',
  title: '时间线',
  description: '查看当前作品的时间线。',
  icon: 'history',
  views: [{
    type: 'timeline-board',
    title: '时间线',
    icon: 'history',
    load: () => import('./TimelineView.vue')
  }]
})
```

| 字段 | 约定 |
| --- | --- |
| `id` | 稳定扩展标识；小写字母开头，可包含数字、点和短横线，最多80字符。不能重复。 |
| `title`、`description`、`icon` | 扩展列表和详情；图标使用现有 `WorkbenchIcon` 名称。 |
| `required` | 基础内置能力使用；不能停用。普通新增扩展省略。 |
| `views[].type` | 稳定资源类型；小写字母开头，可包含数字和短横线，最多80字符。不能与其他视图重复。 |
| `views[].title`、`icon` | 默认标签名称和图标。 |
| `views[].load` | 返回组件或组件模块的异步函数，通常直接 `import()` Vue 文件。 |

整批视图先校验再注册，失败不留下半份类型记录。应在宿主恢复布局前完成启动注册，刷新后仍需再次注册；启停偏好不会保存组件代码。

## 打开、保存和任务

```js
const host = useComposableWorkspace()
if (await host.directory.prepare() && await host.prepareOpen('main')) {
  await host.openAt({
    type: 'timeline-board',
    bookId,
    id: timelineId
  }, 'main') // 'side' 表示在旁边打开
}
```

视图接收 `resource` 与 `instanceId`；可通过 `title`、`icon` 事件更新标签。`resource` 沿用 `workspaceViewContract` 的作品／世界书／对象身份和定位白名单，不保存正文或任意执行参数。新内容类型仍需提供自己的领域存储与修订规则；目录和扩展注册表不建立正文副本。

- `host.directory.prepare()` 冲刷正文所有者并检查未处理草稿；`host.prepareOpen()` 检查当前工作页的离开守卫。
- 编辑视图用 `host.registerGuard(instanceId, handler)` 注册保存／离开检查，在卸载时释放。
- 长任务用 `host.registerTaskAdapter()` 接入现有摘要与关闭保护；移动和隐藏视图不等于取消任务。
- 资源打开受当前作品作用域约束，停用扩展不能绕过保存、任务或正式采用检查。
- 当前全局无作品视图仅包含扩展管理；普通新增内容视图需要作品或世界书作用域。

## Skill 与 Tool

写作技法列表读取当前助手实际使用的 `SKILL_PRESETS`，选择与应用仍在助手“参考与技法”中完成。模型设置和项目知识库配置打开原有设置分区。

当前注册接口接入工作区视图。Skill、Tool、MCP 等运行能力继续使用现有助手运行器、工具注册和执行授权；注册前端视图或启用工作台扩展不会自动授予这些权限。后续接入新的运行能力时，需要提供既有运行时适配，不能仅在此列表追加一个名字。

## 显示偏好与提示

扩展启停保存为 `pinax_workspace_extension_preferences_v1`，已纳入存储分类与备份；只有版本及停用标识，不包含模型配置或密钥。保存失败保留原启停状态。

写作和设定右侧工具轨只显示图标，保持原入口顺序、分组、待审圆点与可访问名称。`vWorkbenchTooltip` 配合唯一 `WorkbenchTooltip` 宿主提供悬停及键盘提示，浮层传送到body并钳制在视口内，支持界面缩放。触控点击使用面板标题和可访问名称识别，不留下悬浮提示。

## 本轮验证

隔离浏览器84项、英文85%缩放与空书8项exit0；亮暗及390px触控截图已实际查看。临时示例扩展真实完成注册、打开、停用后的新旧视图区分与关闭，没有留下产品示例或测试书。`verify:full` exit0：20/20文件、200/200用例，lint零错误／5存量警告，生产构建、结构、体积、同步、StoryAgent与文档构建通过。临时截图和脚本实看后清理。
