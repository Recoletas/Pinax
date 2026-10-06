# Pinax 项目标准范式 `pinax-project@1`（2026-10-06）

> 模式：**Obsidian/VS Code**——项目是磁盘任意位置的自包含文件夹（可整体拷贝迁移），应用只维护「打开过哪些项目」的注册表（存在应用侧数据目录，靠近代码安装位置）。
> 实现：`server/services/localMirrorService.js`（createProjectAt/openProjectAt/listProjects/resolveBookDir）；桌面阶段（schema v2）由 `electron/projects` 内核采纳同一范式。

## 1. 文件夹契约

```
<任意位置>/<项目名>/
  .pinax/project.json     # 标记文件（marker）：{schemaVersion:1, spec:"pinax-project@1",
                          #  projectId:"proj_*", name, kind, createdAt, updatedAt}
  <kind 模板目录…>
```
- **marker 规则**：目录含可解析的 `.pinax/project.json` 且 `spec === "pinax-project@1"` 即为 pinax 项目；`open` 校验 marker，`create` 要求目标目录为空（或不存在）。
- **kind 注册机制**：`KIND_TEMPLATES`（localMirrorService.js）注册目录模板；新增项目类型 = 加一条模板 + spec 文档登记。
- 同步语义：托管内容子目录（正文/大纲/世界书/构思/资料/日志）每次同步整体重建；**kind 模板目录永不被清扫删除**（空目录保留）。

## 2. kind 模板

| kind | 目录 |
|---|---|
| `novel` 小说 | 正文/ 大纲/（大纲.md+outline.json） 世界书/（manifest.json+<分组>/*.md） 构思/ 资料/（sources.json+*.md） 日志/（修订史/ 体验会话/ 助手对话/ 记忆台账.json） 媒体清单.json |
| `screenplay` 剧本 | 剧本/（<集>/<场>.md，内容映射待扩展） 人物/ 场景/ 大纲/ 世界书/ 资料/ 日志/ 媒体清单.json |
| `generic` 通用 | 文档/ 资料/ 日志/ |

文件命名：Windows 非法字符消毒 + 80 字符截断 + 同名去重（-2/-3）；原子写（tmp+rename）。

## 3. 应用侧数据（"代码安装位置附近"）

位置：`PINAX_APP_DATA` env > Web 模式 `<server目录>/.pinax-app/`（gitignored）> 桌面阶段 Electron `userData`。
- `projects.registry.json` — 打开过的项目：`[{projectId, bookId, name, kind, rootPath, lastOpenedAt, lastSyncAt}]`（bookId 绑定 = 浏览器作品 ↔ 项目文件夹）。
- `index.json` — 项目索引（全部项目摘要），由 `POST /api/localmirror/index` 写入。

## 4. API（Web 模式）

| 端点 | 说明 |
|---|---|
| `POST /api/localmirror/projects/create` | `{path,name,kind,bookId?}` 任意空目录建库；**公网部署 403** |
| `POST /api/localmirror/projects/open` | `{path,bookId?}` 打开已有项目（校验 marker）；**公网部署 403** |
| `GET  /api/localmirror/projects` | 注册表列表 |
| `POST /api/localmirror/sync` | 落点 = 注册表按 bookId 绑定的项目根 > 文档根 `<homedir>/Documents/Pinax`（兼容旧行为） |
| `GET  /api/localmirror/appdata` | 查询应用侧数据目录 |

安全闸：open/create 是任意路径能力面，`PINAX_PUBLIC_ORIGINS` 非空（公网部署）一律 403 `ERR_LOCAL_ONLY`；绝对路径校验、建库要求空目录。

## 5. 阶段映射

- **阶段一（本轮）**：Web 模式，路径经 API 显式给出；文件为读拷贝（浏览器真源）。
- **阶段二（Electron 文件为真源）**：原生对话框选目录（`dialog.showOpenDialog` 先例已有）；`shared/desktopProjectContract.js` 现正则只认 `manuscript|reference` .txt，schema v2 需按本范式放开 kind/目录/扩展名（.md）；`.pinax/` 内核（SQLite 日志/锁/备份）与本范式的 marker 合并设计。
- **阶段三**：双向对账（revision+hash 内核已备）。
