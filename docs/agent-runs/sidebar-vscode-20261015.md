# 左栏组织与 VS Code 源码核对

日期：2026-10-15。仅本地修改；未提交、推送或重启服务。

## 参考与本轮边界

核对 Code - OSS 提交 `9ebdca5c15f666ab336ca0b0421f5ee25bf1cbe0`，并读取官方布局文档。没有运行 VS Code 原生客户端。

| 源码中的事实 | Pinax 本轮采用的行为 |
| --- | --- |
| ActivitybarPart 与 SidebarPart 分开；活动栏切容器，侧栏承载视图 | 文件、搜索、书稿放常驻窄栏，扩展位于底部；目录作为一个可收放、可调宽的区域 |
| 空工作区侧栏默认隐藏，已有工作区保存显隐状态 | 首次空首页可收起；按作者最新修订，进入文章展开，回首页保留宿主显隐 |
| Explorer 将资源交给 editorService 打开 | 目录继续调用现有 host.openAt 与保存守卫；收起目录不卸载编辑器 |
| 单一视图合并标题；树行紧凑、缩进统一、行操作按需出现 | 同类文字文件夹减少重复类型词，根／子项统一缩进，创建／筛选／刷新归标题动作 |

官方来源：[许可与源码说明](https://github.com/microsoft/vscode/tree/9ebdca5c15f666ab336ca0b0421f5ee25bf1cbe0)、[侧栏默认值](https://github.com/microsoft/vscode/blob/9ebdca5c15f666ab336ca0b0421f5ee25bf1cbe0/src/vs/workbench/browser/layout.ts#L3022)、[活动栏](https://github.com/microsoft/vscode/blob/9ebdca5c15f666ab336ca0b0421f5ee25bf1cbe0/src/vs/workbench/browser/parts/activitybar/activitybarPart.ts)、[侧栏](https://github.com/microsoft/vscode/blob/9ebdca5c15f666ab336ca0b0421f5ee25bf1cbe0/src/vs/workbench/browser/parts/sidebar/sidebarPart.ts)、[Explorer 注册](https://github.com/microsoft/vscode/blob/9ebdca5c15f666ab336ca0b0421f5ee25bf1cbe0/src/vs/workbench/contrib/files/browser/explorerViewlet.ts)、[资源打开](https://github.com/microsoft/vscode/blob/9ebdca5c15f666ab336ca0b0421f5ee25bf1cbe0/src/vs/workbench/contrib/files/browser/views/explorerView.ts#L599)、[布局文档](https://code.visualstudio.com/docs/configure/custom-layout)。

## 实施约束

1. 文件、搜索、书稿为常驻内容视图，扩展入口位于底部；左栏不重复正文／助手／设定等模块导航。
2. 点击当前活动入口收放目录，点击另一个入口切换并展开。
3. 桌面显隐与手机抽屉分别保存、分别操作；打开文件只关闭手机抽屉。
4. 进入文章自动展开文件／书稿目录；回首页不恢复另一份显隐快照。手动收起后普通切章不重新弹出，再从首页进入文章会展开。
5. 目录继续引用原件、按既有守卫打开；正文、设定与任务所有者保持原实例。
6. 内容树采用单行、统一缩进和悬停／焦点行操作；类型筛选按需展开，搜索保留。
7. 手机继续顶部目录入口和抽屉；支持关闭、Escape、焦点循环，退出后恢复入口焦点。专注模式同时收起活动栏与目录。
8. 只改共享工作台与首页这一片。旧独立路由保留各自导航，不显示没有目录 owner 的空侧栏。

## 状态归属

`useWorkspaceDirectory` 由唯一工作区宿主创建，管理模式、桌面显隐与宽度；`useAuthoringDirectory` 引用同一模式。搜索在左栏复用原查找owner，扩展列表与主区详情使用统一注册表，见[接口](../engineering/workspace-extensions.md)。`WorkspaceContentGroups` 负责入口、容器、宽度调整及手机抽屉。`ProjectDirectory` 继续管理内容树、选择和目录归档。`Authoring` 仍拥有书稿编辑、章节顺序和保存。

偏好沿用 `pinax-directory-mode:v1:<bookId>`，兼容旧的 `files`／`chapters` 字符串，写为模式、显隐与宽度对象。首页使用空作品键；正式书稿与目录存储不变。桌面默认248px，可在200–360px间调整；这些数值是 Pinax 的适配，并非复刻 VS Code。手机抽屉仍使用原 `state.directoryOpen`，不改桌面手动偏好。

## 验证

隔离浏览器78项检查exit0；实际查看1440px亮／暗、900px及390px触控截图。覆盖首页默认收起、作品首次展开、手动收起及刷新恢复、文件／章节切换、键盘与指针调宽及持久化、旧编辑器实例保留、按需筛选、键盘选章、设定打开、手机抽屉关闭与焦点返回；无pageerror或横向溢出。截图在`/tmp/pinax-sidebar-1015/`采集，实看后清理临时脚本及图片。浏览器使用隔离书库，未操作作者真实书稿、未调用模型。

现有uiControlContract用例内补充状态、跨作品偏好、旧字符串兼容与宽度边界断言，核心测试总量不增加。`npm run verify:full` exit0：20/20文件、200/200用例，lint零错误／5存量警告，生产构建、StoryAgent、结构、体积、同步、diff与文档构建全部通过。
