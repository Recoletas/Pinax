# 本地数据盘点与本地文件镜像（2026-10-06）

> 背景：作品数据目前全部存在浏览器（localStorage + IndexedDB）；协作双方确认「世界书、大纲、正文放本地」对用户习惯与 agent 读取都更友好（harness 对本地文件依赖高）。本文记录全量数据盘点、新增的本地镜像层设计与边界。实现：`server/services/localMirrorService.js` + `server/routes/localMirror.js` + `src/services/localMirrorService.js`。

## 一、数据盘点（全部用户内容所在）

### 1.1 正文 / 书籍 / 章节 —— localStorage `writing_books`
- 唯一读写边界：`src/services/writing/writingBooksRepository.js`（`loadWritingBooks` / `saveWritingBooksDurable`，写入后带 revision 的订阅 `subscribeWritingBooks`）。
- 书结构：`{ id, title, description, worldbookId, manuscriptLanguage, chapters[], explorationDocuments[], outlineNodes[], outlineEdges[] }`。
- 章节双轨：`chapter.content` = **markdown 字符串（镜像取这个）**；`chapter.editorDocument` = 自研 writingDocument schema v3 JSON（`writingDocumentSchema.js`，由 `persistChapterDocument` 保持同步，`getChapterMarkdown` 可取）。

### 1.2 世界书 / 设定 —— `worldbooks_index` + `worldbook_<id>`（每库一键）
- Pinia `src/stores/worldStore.js`；条目内容在 `entry.content`，分组在 `entry.injection.group`（+ `worldbook.groups`），`entry.keys` 为触发词。
- 读取快照 API：`readWorldbookSnapshot(worldbookId)`（worldStore.js:445）。
- 书籍绑定：`book.worldbookId` 唯一真源（`worldbookProjectSources.bindBookWorldbook`，重绑被拒）。

### 1.3 大纲 —— `writing_books` 内 `outlineNodes[]` + `outlineEdges[]`
- 仓库：`src/services/writing/projectOutlineRepository.js`；节点 `{title,intent,status,chapterRefs…}`，边 kind ∈ causes/foreshadows/alternative/parallel。

### 1.4 构思 / 速记
- 构思：`book.explorationDocuments[]`（`{id,title,content(md),outlineNodeIds,status…}`，`authoringDocumentRepository.saveExplorationDocument`）。
- 速记：localStorage `writing_notes`（`writingNotes.js`，md 内容）——**全局键，不分书**，v1 镜像未含（记录为后续可选）。

### 1.5 IndexedDB（v1 镜像未含，属二进制/派生层）
| 库 | 内容 |
|---|---|
| `pinax-memory-history` | 记忆修订 + 事实账本（ledger v1–v4） |
| `pinax-source-archive` | 世界书资料原件与解析 chunks（≤64MB） |
| `pinax-media` | 媒体二进制（`pinax-media://` 引用） |

另有 localStorage 辅助键（快照/恢复稿/媒体元数据/comic/storyboard 等），见 `src/services/storage/storageKeyPolicy.js` 分类。

### 1.6 资料/世界书的默认本地文件（仓库内置）
- **`src/services/worldbook/seedWorldbookPresets.js`**（30KB）——创作侧 3 个种子世界书（边境王国·雾潮暮湾 / 127 老档案 / 太阳岛殖民地），经 `WorldBookQuickImport.enterPresetWorld` 实例化为正式 `worldbook_<id>`。
- `server/data/worlds/*.json`（5 个）与 `server/data/events/*.json`（8 个）——**体验页游玩世界/事件池配置**，不是创作世界书，路由 `config.js`/`events.js` 只读。

### 1.7 服务端写盘先例
- 唯一运行时写盘：`openclawService.js` 设备身份文件（env 覆盖 + recursive mkdir + 0600）——本镜像的写盘模板；原子 tmp+rename 取自 `electron/projects/projectFiles.mjs`。
- `server/data/` 只读；媒体是字节管道不落盘；任务日志在 kit 侧。

## 二、本地文件镜像（已实现）

### 2.1 语义与位置
- **单向读拷贝**：浏览器是数据真源，服务端把内容**单向**写到本机；托管子目录每次同步整体重建，本地手改会被覆盖——供 agent/用户读取，不是双向同步。
- 位置：`PINAX_MIRROR_ROOT` env > `<homedir>/Documents/Pinax`（真机解析为 `C:\Users\Administrator\Documents\Pinax`）。**路径由服务端唯一决定**，浏览器不传路径（防注入）；`GET /api/localmirror/location` 可查。
- 前端设置字段（预留，无 UI）：`local_mirror_settings_v1`（`{enabled:true, customRoot:''}`，customRoot 仅未来展示用，不参与请求）；已登记 storageKeyPolicy（preference）与备份键清单。

### 2.2 触发
- 自动：`writing_books` 订阅 → 2.5s 去抖 → 全量书同步（`main.js` 安装 `installLocalMirrorAutoSync`）；失败静默退避 60s。
- 手动/程序：`POST /api/localmirror/sync`（payload：book + worldbook；上限 500 章/2000 条目/4M 字符，`express.json` 16mb 之内）。

### 2.3 落盘布局（@2，`<root>/<书名>-<bookId 尾 8>/`）
```
项目索引.json                # 根级：全部项目摘要（id/标题/章数/字数/条目数/updatedAt/目录）——POST /index 写入
<书名>-<id8>/
  meta.json                    # schema pinax-project-fs@2、bookId、时间、八类计数——最后写，= 本次同步完整标记
  正文/NNN-章节名.md           # chapter.content 原文
  大纲/大纲.md                 # 节点列表 + 关系（causes→导致 等可读标签）
  大纲/outline.json            # 结构化节点/边
  世界书/manifest.json         # 库元数据 + 条目索引
  世界书/<分组>/<条目名>.md     # frontmatter（name/type/group/keys/worldbook）+ entry.content
  构思/<标题>.md
  资料/sources.json            # sourceRefs/sourceDocuments → 工件索引
  资料/<S编号>-<标题>.md       # 文本工件（内联 content 或按 chunkIds 重组，≤50 个、单个 ≤50KB）
  日志/修订史/<章节>.json       # 每章最新 10 条快照（markdown 截断 2 万字符）+ 块级历史摘要 20 条
  日志/体验会话/<会话>.json     # writing_sessions 按会话 worldbookId 过滤，最新 20 场（单场截断）
  日志/助手对话/<projectId>.md  # authoring_assistant_conversation:<id> 转可读 md（末 60 条）
  日志/记忆台账.json           # memory_candidates 按 scopeId=projectId 过滤 + 状态统计
  媒体清单.json                # media_assets_v1 按 projectId 过滤（仅元数据，二进制仍 IndexedDB）
```
- 文件名消毒（Windows 非法字符/控制符/80 字符截断）+ 同名去重（-2/-3）；tmp+rename 原子写；payload 总量 ≤8M 字符。
- agent 读取捷径：`PINAX_MIRROR_ROOT` 指向 kit 的 `kernel.projectDir(<project>)`（workspace 内项目目录）即可让 fs_tree/fs_read/fs_grep **零改动**读到整套文件体系——两个根都是 env 可配，无需写代码。

### 2.4 验证
- `npm run smoke:local-mirror`（`scripts/local-mirror-check.mjs`）：16 项断言——布局/内容/frontmatter/清扫/消毒/去重/校验信封，全部通过；临时根注入，不触真实文档目录。
- 真机：`GET /location` 返回 `C:\Users\Administrator\Documents\Pinax`；经 3001 同步合成书后磁盘中文文件名/内容/frontmatter 逐字核对通过后清理。
- 注意：GBK 控制台下 `ls`/`curl` 显示中文为乱码是显示层现象；用 Node UTF-8 读取核对（浏览器 fetch 恒为 UTF-8，无此问题）。

## 三、边界与后续
- v1 未镜像：速记（`writing_notes`，全局键）、IndexedDB 三库（记忆账本/资料原件/媒体二进制）、世界书结构化 `structuredSettings`。
- Electron 打包时，镜像应切换为直写（`desktopProjectRepository` 已有 chooseDirectory/writeText 桥，可替代服务端路由）——接口已按「前端只组 payload、位置由宿主决定」预留。
- agent 读取：kit 任务面后续可用 fs 工具挂 `PINAX_MIRROR_ROOT`（能力清单已留 `capabilities.json` 机制）。

## 四、全局项目化路线（2026-10-06 定；范式见 [pinax-project-spec.md](./pinax-project-spec.md)）

**阶段一（已交付两步）**：① 项目文件体系 @2（浏览器真源、文件全量读拷贝）；② **项目标准范式 `pinax-project@1`**——项目 = 磁盘任意位置的自包含文件夹（`.pinax/project.json` 标记，Obsidian/VS Code 模式），应用侧注册表/索引存"代码安装位置附近"（`PINAX_APP_DATA` > `<server>/.pinax-app/`），sync 按 bookId 绑定落项目根，open/create 任意路径能力面被公网部署闸锁死（403）。kind 模板：novel/screenplay/generic。
**阶段二（Electron 文件为真源）**：原生对话框选目录（先例已有）；`shared/desktopProjectContract.js` schema v2 按范式放开 kind/目录/.md；`.pinax/` SQLite 内核与范式 marker 合并。
**阶段三（双向对账）**：文件手改回流（revision+hash 内核已备）+ 冲突策略。
