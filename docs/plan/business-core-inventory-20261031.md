# 共享业务内核 M0 盘点（2026-10-31）

> 目标：确认 Web / Pinix / Next 三端当前的业务 owner、重复实现和首个抽取边界。
> 本盘点只记录事实，不代表已完成迁移。

2026-11-06更新：Core0.15.0（c6fe1d9）完成资料归档与解析这一批：来源/分块/创建工作区、共享去重/引用/删除/恢复、编码/章节/导入报告、选段及EPUB spine规则进入Core；原Web/Pinix路径实际调用共享仓储和解析工厂。IndexedDB事务、PDF/Mammoth/JSZip加载和worker保留Host。Core仍余体验/跑团业务抽取；SQLite派生目录应用接线尚未启用，作为后续平台工作单列。本轮不改Next，未推送部署或重启用户服务。下表是10-31历史盘点，当前范围见统一计划。

## 1. 三端现状

| 端 | 业务代码位置 | 数据存储 | Agent/上下文 | 结论 |
|---|---|---|---|---|
| Web/main | `src/services/writing/*`、`src/services/worldbook/*`、`src/services/agents/*`、`src/pages/Authoring.vue` | localStorage `writing_books` 等 + 完整工作区 ZIP | 旧 Pinax authoring harness + 服务端 provider | 业务最完整，作为 Core 抽取源 |
| Pinix | 同一棵 Pinax 业务代码的复制树 + `src/platform/*` + `android/` | WebView localStorage + 原生双槽快照（恢复桥） | 同一套旧 harness；AI 走远程 Express origin | 移动 Host 参考；业务层不应继续独立维护 |
| Next | `next/carriers/*`、`next/runtime/*`、`next/fs/*` | 项目文件夹 + `.pinax` + git 历史 | 新建的 in-process runtime/tool loop | 极简 Host 候选；当前有平行业务实现 |

## 2. 重复实现

| 领域 | Web | Pinix | Next | 处理 |
|---|---|---|---|---|
| 章节/正文 | `writingBooksRepository`、`writingDocumentSchema`、`Authoring.vue` | 复制同一套 | `next/carriers/novel` | 先抽 Core 章节切片 |
| 大纲 | `projectOutlineRepository` | 复制同一套 | `next/carriers/outline` | 章节后抽取 |
| 构思 | `authoringDocumentRepository` | 复制同一套 | `next/carriers/notes` | 与章节共用文档端口 |
| 世界书 | `worldStore`、`worldbookFileRepository`、双写镜像 | 复制同一套 | `next/carriers/worldbook` | 下一批 Core 领域 |
| 资料/来源 | `sources`、IndexedDB source archive | 复制同一套 | `next/carriers/reference` | 先做文件轨，再迁 IndexedDB |
| 约束 | 约束目录 + 读取 | 复制同一套 | `next/carriers/setting` | 与世界书同批 |
| 候选/审阅/采用 | `authoringInterventionAdoption` 等 | 复制同一套 | `next/runtime/proposalStore` | 作为 Agent/Core 核心切片 |
| 上下文 | `src/services/agents/context/*` | 复制同一套 | `next/runtime/contextProfiles` | 统一 Core Agent 层 |
| 工具/会话 | 旧 harness | 复制同一套 | `next/runtime/toolLoop/sessionStore` | 统一 Core Agent 层 |
| 备份/迁移 | `workspaceBackupBundle` | 复制 + 原生快照等待 | `next/runtime/projectBackupService` | Core 迁移器统一 |

## 3. 首个纵切片：章节读写

已实现：

- `packages/core/`：`ChapterStore` 端口、章节 domain、`createChapterService`、内存 Store、合同测试。
- `src/services/writing/chapterCoreStore.js`：把 Core 映射到现有 `writing_books` 仓库。
- `src/services/writing/chapterCoreStore.test.js`：验证旧章节读取、创建、修订冲突、content-only 保存清理旧 `editorDocument`。
- `src/composables/useChapterCore.js`：Authoring 的“新建章/保存当前章/双栏保存/删除章/切章读取校验”均已通过 Core；保存使用与异步 Service 共用校验的同步 Service，页面保存仍走既有 `saveBooks`，失败会回滚页面章节列表。
- 验证：Core 测试 8/8、Web 侧测试 7/7、`lint:core` 0 问题；完整合同门禁 22/22 文件、215/215 用例（预算显式从 20/200 抬到 22/215），`architecture:check` 与 `npm run build` 均 exit 0，`lint:delta` 无新增 error。

## 4. 下一步

1. 章节 CRUD 已在 Web 接完；剩余章节排序、历史恢复、纲要同步等非内容 CRUD 路径另行处理。
2. Pinix 接入同一 Core，写 `NativeChapterStore`；Next 的 `novel` carrier 改为调用 Core。共享方式已选“独立 Core 包”：`core:pack` / `core:smoke` 已证明 tarball 可被另一个项目安装并运行章节 CRUD；两端应添加固定版本的 `@pinax/core` 依赖，而不是复制源码。
3. 再抽大纲/构思（共用文档端口），然后世界书/资料。
4. Agent/上下文/候选采用作为独立纵切片，避免与编辑器迁移混在一起。
