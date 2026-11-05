# 本地项目 SQLite 派生目录

2026-11-05：独立模块已写入，**未运行功能验证，也未接入正在运行的服务**。作者要求本轮不跑测试/门禁、不动助手、不刷新页面、不重启服务。下述命令是使用说明，不代表本轮已执行。

## 数据边界

`server/services/projectCatalogDb.js` 使用 Node 22.13+ 的内置 `node:sqlite`，不依赖 `better-sqlite3` 的原生 ABI。本机只探查过 Node 22.22.3 / SQLite 3.51.3 及 trigram 建表能力；完整同步、检索、失败回滚及 Electron 共库兼容均尚未实跑。

文件保持唯一事实源。模块只写显式指定项目的 `.pinax/project.sqlite` 中的 `catalog_*` 表。它不重写正文、世界书、大纲、项目标记，不读取浏览器 localStorage，也不迁移用户作品。桌面端 `project_items`、`file_transactions`、`schema_migrations` 均保留，目录使用独立 `catalog_meta.schema_version`，不冒充桌面第 3 版迁移。

当前没有路由、MCP 注册或自动 watcher。`openProjectCatalog(root)` 只初始化派生表，显式 `sync()` 才采集文件；`read/list/search` 不隐式同步。`readOnly:true` 必须已有目录，否则报 `CATALOG_NOT_INITIALIZED`。与普通 SQLite 只读连接一样，读取 WAL 数据库可能需要 SQLite 共享内存文件；不能把这个接口当作作者目录的零副作用指纹探针。

## 已实现的投影

| 文件来源 | kind | 身份 |
| --- | --- | --- |
| `正文/**/*.md|txt` | `chapter` | 相对路径，不伪造浏览器 chapter ID |
| `世界书/**/*.md|txt` | `worldbook-entry` | 复用世界书契约解析器的 entry ID；不合契约的辅助文本按 `document` 收录并给 warning |
| `大纲/outline.json` | `outline-node` / `outline-edge` | Core 规范化；旧边无 ID 时仅在投影中赋确定性索引 ID |
| `构思/**/*.md|txt` | `exploration` | 相对路径，不冒充全局笔记 |
| `资料/**/*.md|txt` | `material-file` | 相对路径，不冒充 narrative asset |
| `资料/归档/*.json` | `source-document` | `docId`；索引各 chunk 的原文并保留 meta |
| `约束/`、`规则/`、`文风/` 文本 | `rule` | 各自相对路径，旧新规则目录不合并去重 |

其余 JSON、二进制附件不收录。大纲概览文本可检索，但不从概览生成结构化节点。文件重命名对于无显式 ID 的文本是删除旧路径、加入新路径。重复世界书 ID、不合法的大纲/归档、缺失边端点、自环、重复有向同 kind 边会拒绝本次同步并回滚目录事务，保留旧目录；不自动修作者文件。

## 同步与检索

```bash
node scripts/project-catalog.mjs sync /absolute/project/path
node scripts/project-catalog.mjs status /absolute/project/path
node scripts/project-catalog.mjs search /absolute/project/path '码头夜谈'
node scripts/project-catalog.mjs sync /absolute/project/path --verify-content
```

只对调用方显式指定、含合法 `.pinax/project.json` 的本地文件项目工作。首次同步初始化目录；重复同步仍枚举路径与 stat，但按 dev/inode/size/mtimeNs/ctimeNs 指纹跳过未变文件的内容读取与解析。变化文件计算 SHA-256，内容未变仅刷新指纹；内容变更或删除与 FTS 更新在同一 SQLite 事务提交。`--verify-content` 强制重读哈希，不强制重新解析未变内容。来源扫描前后变化会拒绝并回滚；这不是文件系统快照，外部编辑器仍可能在最后一次检查之后改稿，下次 `status/sync` 会识别过期。

容量上限为 2000 个支持文件、单文件 16MB、合计 64MB、目录深度 12。符号链接、未完成镜像事务或项目身份变化一律拒绝。`sync()` 以同步文件 IO 和 `DatabaseSync` 实现，当前只供离线工具使用；后续在线接入应放 worker，避免占用 Express 事件循环。

全文检索是字面短语查询，参数绑定，用户字符串不直接作为 FTS 运算表达式。三个及以上 Unicode 字符走 FTS5 trigram；一/两个字符（常见中文词）走 `instr` 子串扫描，返回 `mode:'substring'`，不承诺该路径有 FTS 性能。结果包含来源路径、源文件哈希、文件投影 revision 与摘录，最多 100 条。查询针对上次同步快照；要判断磁盘新鲜度，先调用 `status()`。未做耗时基准，不承诺毫秒级性能。

目录不取代 Python RAG；现有 RAG 的输入范围、全项目 revision 编译及 MCP 工具行为均未改变。

## 后续接入边界

尚未实施六个 Core Store 的文件写入适配器、文件提交日志与崩溃恢复、MCP 优先读目录、project-bootstrap 状态卡接入或桌面 driver 迁移。当前不应把 `catalog_*` 的写入包装成 Core 正式数据保存：那会违反文件事实源。后续应先定章节稳定 ID、全局笔记与项目构思的映射、素材与资料归档的归属，再用隔离项目验证文件事务与重建等价性，最后接在线读路径。

Core 中已有的可选 `nodeStore` 边端点校验与本模块的 SQLite 外键约束分别负责用例入口和投影入库；只有注入 `nodeStore` 的服务才承诺跨表入口校验。独立 Core 仓库/npm 包的同步不是本轮交付内容。
