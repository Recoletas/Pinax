# 本地项目 SQLite 派生目录

2026-11-06：已接入服务端 Worker、本地 HTTP 与 MCP。文件仍是事实源，目录用于跨正文、设定、构思、资料的字面检索；它不替代 RAG，也不是正式内容保存接口。

## 数据边界

`server/services/projectCatalogDb.js` 使用 Node 22.13+ 内置 `node:sqlite`，不依赖 `better-sqlite3` 的原生 ABI。`server/services/projectCatalogService.js` 在 Worker 中调用它，文件扫描与 `DatabaseSync` 不占 Express/MCP 主线程；每个请求持有并关闭自己的连接。

目录只写显式指定项目的 `.pinax/project.sqlite` 中的 `catalog_*` 表。不重写正文、世界书、大纲或项目标记，不读取浏览器 localStorage，也不迁移用户作品。Electron 的 `project_items`、`file_transactions`、`schema_migrations` 保留，目录使用自己的 `catalog_meta.schema_version`。

只服务含合法 `.pinax/project.json`（`pinax-project@1`、有效 projectId）的本地文件项目。按注册表 ID 访问时冻结目标项目 ID，Worker 打开数据库前再次核对。公网环境禁用本地 HTTP 与 MCP；仅设置能力标志不算检索已生效。

## 来源与身份

| 文件来源 | kind | 身份 |
| --- | --- | --- |
| `正文/**/*.md\|txt` | `chapter` | 相对路径，不伪造浏览器 chapter ID |
| `世界书/**/*.md\|txt` | `worldbook-entry` | 复用世界书契约 entry ID；辅助文本或不合契约的文本按 `document` 收录并给 warning |
| `大纲/outline.json` | `outline-node` / `outline-edge` | Core 规范化；旧边无 ID 时仅在投影中赋确定性索引 ID |
| `构思/**/*.md\|txt` | `exploration` | 相对路径，不冒充全局笔记 |
| `资料/**/*.md\|txt` | `material-file` | 相对路径，不冒充 narrative asset |
| `资料/归档/*.json` | `source-document` | docId，索引 chunk 原文并保留 meta |
| `约束/`、`规则/`、`文风/` 文本 | `rule` | 各自相对路径，不自动合并旧新规则目录 |

其余 JSON、二进制附件不收录。大纲概览文本可检索，不据此生成节点。无显式 ID 的文本改名时按删除旧路径、加入新路径处理。重复世界书 ID、不合法大纲/归档、缺失边端点、自环、重复有向同 kind 边会拒绝同步并回滚目录事务，保留旧目录，不自动修原文件。

## 应用入口

MCP 新增 `pinax_project_catalog`（服务版本 0.6.0，共20个工具）：

```json
{"projectPath":"/absolute/project/path","action":"status"}
{"projectPath":"/absolute/project/path","action":"sync"}
{"projectPath":"/absolute/project/path","action":"search","query":"城门"}
{"projectPath":"/absolute/project/path","action":"list","kind":"worldbook-entry"}
{"projectPath":"/absolute/project/path","action":"read","kind":"worldbook-entry","id":"从检索结果取得的ID","expectedRevision":"从检索结果取得的revision"}
```

`projectId`可代替路径，接受已登记项目 ID 或已绑定 bookId；浏览器缓存书不支持。现有 `pinax_project_context` 返回 `catalog` 就绪状态，不自动建库或同步。该工具包含 sync，因此 `readOnlyHint=false`；sync 只写派生数据。

本地 HTTP 使用同一操作合同：`POST /api/localmirror/catalog`，body 为上面的对象。它复用项目路由的公网禁用规则；请求断开会取消对应 Worker，不影响其他项目的任务。取消不承诺撤销已经提交的派生同步，下一次 status 可核对结果。

返回中包含 `initialized`、`stale`、目录 `revision`。查询命中附原文件路径、源文件哈希与文件投影修订。未建立返回 `CATALOG_NOT_INITIALIZED`；文件变化返回 `CATALOG_STALE`；`expectedRevision` 不符返回 `CATALOG_REVISION_MISMATCH`。HTTP 对这些状态返回409，不伪装成零命中。status 本身可报告未建立状态，不创建数据库。

读取前后都会检查文件新鲜度和目录版本。来源过期必须显式 sync 后重查，不自动更新，也不返回未标记的旧原文。文件仍可能在最后一次检查之后被外部编辑器修改，写入原件时仍须走正式保存的版本检查。

## 同步与字面检索

首次 sync 初始化派生表。重复同步枚举路径和 stat，按 dev/inode/size/mtimeNs/ctimeNs 指纹跳过未变文件的读取与解析。变化文件计算 SHA-256，内容未变仅刷新指纹；内容变更、删除与 FTS 更新在一个 SQLite 事务提交。`verifyContent:true` 强制重读哈希，但不重新解析内容未变的文件。符号链接、未完成镜像事务、项目身份变化和同步期间的来源变化均拒绝，不替作者恢复镜像。

沿用既有容量：2000个支持文件、单文件16MB、合计64MB、深度12；没有新增模型输出或任务时限。并发同步由 SQLite 写锁串行化；读取期间目录版本变化会要求重查。

三个及以上 Unicode 字符用 FTS5 trigram；一/两个字符用 `instr` 子串查询并返回 `mode:'substring'`。查询为参数绑定的字面短语，不把作者输入当 FTS 运算表达式。search 最多100条，list 每页最多1000条。没有做性能基准，不承诺固定毫秒延迟。

离线工具继续可用：

```bash
node scripts/project-catalog.mjs sync /absolute/project/path
node scripts/project-catalog.mjs status /absolute/project/path
node scripts/project-catalog.mjs search /absolute/project/path '城门'
node scripts/project-catalog.mjs sync /absolute/project/path --verify-content
```

离线 `openProjectCatalog` 的底层 read/list/search 仍允许读取上次同步快照；调用方应先看 status。在线 Worker 额外强制新鲜度与期望修订检查。

## 状态卡与验证范围

`project-bootstrap` 状态卡读取 `catalog_meta`、文件/条目数量、各 kind 计数、项目身份及新鲜度。WAL 非空时保持未核对，其他情况用 Python immutable 只读连接；它不建库、不同步。普通 SQLite 只读连接可能需要共享内存文件，不能代替严格的文件指纹探针。

`npm run smoke:project-catalog`已加入CI回归；本轮使用隔离合成项目，实际验证 Worker、HTTP、官方 MCP SDK 查询、显式同步、短词/FTS、过期与修订拒绝、失败回滚、并发同步、取消、公网拒绝及状态卡读前读后的文件哈希/mtime不变。它不调用真实模型，也没有操作作者项目。

尚未实施六个 Core Store 的正式文件写入适配、Electron driver 迁移或目录视图 UI。不要把 `catalog_*` 写入包装成正文/设定保存。这些属于后续平台工作；本批交付的是可实际调用的本地目录检索与同步入口。
