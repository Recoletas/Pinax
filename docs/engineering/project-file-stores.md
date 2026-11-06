# Core 正式文件 Store 与项目写入

2026-11-06：Node Host 已提供 Book、Chapter、WorldbookEntry、OutlineNode、Note、Material 六类 Store，以及 OutlineEdge Store。实现消费固定 Core 0.16.0；本批不改 Core 包、Pinix 或 Next。

这是文件 Host 的适配与本地应用接口。现有浏览器仍使用原保存模式，没有自动迁移作者数据，也没有把文件模式接成默认 UI。移动原生存储、桌面 driver 替换和跨设备写入另行接线。

## 唯一所有者

| 适配器 | 文件与职责 |
|---|---|
| `fileProjectStores.js` | 已绑定项目中的正文、设定、大纲节点与边；暴露 Store 和 Core Service |
| `fileBookStore.js` | 从原项目注册表定位作品，读取/创建作品元数据、改名、取消登记；不挑选目录或递归删除作者文件夹 |
| `fileCollectionStores.js` | Host 显式指定的全局笔记/素材 JSON 集合；不默认选路径，不将项目构思或来源归档转为集合 |
| `localMirrorTransaction.js` | 沿用的项目生成、指纹校验、staging、fsync、换树、回执与恢复 owner |
| `fileProjectCommands.js` | 本地应用命令、目标绑定、操作幂等及公开错误出口；不改变 MCP 的提案权限 |

Core 的内存参照适配器在这里是单次命令工作副本，复用既有 CRUD/修订规则。成功修改必须通过实际文件事务后才返回，不把这份临时副本或 SQLite 目录当成事实源。

项目 Store 固定绑定 root、projectId、bookId、worldbookId，不读取全局“当前作品”。只有已注册并绑定 bookId 的文件项目可以正式写入。桌面端持有 `.pinax/project.lock` 时不从这条通道写入。

## 文档身份与原文

Markdown 仍是正文和构思的内容来源。`meta.json` 新增 `documentSchema:1`、作品元数据及 filename→record/hash 的身份绑定；不在元数据里再保存一份 content。章节的 ID、修订、结构化侧车和其他富字段可往返，空章也可保留。

新生成文件沿用原来的行尾换行习惯，绑定记录说明是否添加了这一换行，读回时不会混入正文。已有手写文件保留实际路径和原文字节对应的空格、换行，不在保存另一章时替作者重排或额外复制一份。标题可与文件名不同；正文顺序与同名构思次序由绑定顺序保留。

外部改稿以实际 Markdown 为准：检测到内容哈希变化时，不继续采用旧 editorDocument；读取返回变化后的正文、修订和文件快照。真正保存同时要求章节修订与完整文件快照仍匹配。损坏、不完整或未知版本的身份记录报错，不按文件名偷偷重建 ID。外部移动/改名导致绑定找不到时会拒绝整域保存，由Host显式处理路径绑定，不静默删除原文。

旧目录没有身份绑定时继续以相对路径标识文档，不伪造浏览器章节 ID。已有内容不能通过空作品 create 接管；须由 Host 安排显式导入。MCP 章节列表/读取复用新标题与顺序。SQLite 同步读取元数据中的稳定 ID；仅标题或身份元数据变化也会使派生目录过期并重算相关投影。

## 项目端口与应用命令

```js
import { createFileProjectStores } from '../../server/services/fileProjectStores.js'

const reader = createFileProjectStores({ root, service })
const token = reader.snapshot()
const writer = createFileProjectStores({ root, service, expectedSnapshot: token })
const result = await writer.chapters.save(token.bookId, chapterId, {
  expectedRevision: chapterRevision,
  content: '作者确认的正文'
})
```

同一工厂还提供 `entries`、`nodes`、`edges` Core Service，以及四个对应 Store。状态不是活动全局指针。大纲边通过 Core 校验端点；删除仍有子节点或关系的节点会返回引用错误，不自动级联删除。

本地 HTTP：`POST /api/localmirror/core-operation`，支持已登记的 projectPath 或 projectId/bookId。公网禁用。

```json
{"projectId":"已绑定的作品ID","action":"snapshot"}
```

返回 `book` 和 `snapshot`。后续写入原样带回 snapshot，并使用稳定 operationId：

```json
{
  "projectId":"已绑定的作品ID",
  "entity":"chapter",
  "action":"save",
  "id":"章节ID",
  "input":{"content":"作者确认的正文","expectedRevision":2},
  "expectedSnapshot":{"projectId":"…","bookId":"…","worldbookId":"…","book":"…","worldbook":"…","revision":3},
  "operationId":"本次操作的稳定ID"
}
```

| entity | 操作 |
|---|---|
| chapter | list/read/create/save/remove |
| entry | list/read/create/update/remove |
| node | list/read/create/update/move/remove |
| edge | list/add/remove |

创建参数放 input；保存/删除章节与大纲节点仍按 Core 要求传 expectedRevision。成功结果为 Core 的 `{ok,value}` 与新 snapshot；冲突或保存失败不会伪装成成功。`recover` 是显式中断恢复操作，不混入普通读命令。

operationId 回执随同一次项目事务安装到 `.pinax/operations/`。相同请求重试返回原结果；同号不同请求拒绝。后续已有其他写入时，旧回执返回 `requiresReload:true`、snapshot 为 null，避免把旧结果附上新写入权限。

MCP `pinax_chapter_write` 仍只创建提案，未改为调用正式文件操作接口。权限与作者确认由现有应用写入 owner 负责，本批没有给模型新增直接任意文件写入工具。

## 全局集合与作品生命周期

`createFileNoteStore({file})`、`createFileMaterialStore({file})` 要求 Host 提供绝对路径。集合格式是 `pinax-file-collection@1`，kind 为 notes 或 materials。文件本身是该集合的正式数据，不与项目构思、参考资料或 source chunks 互换。

集合调用 Core 工作副本和共享 `createJournaledWriteStore`，经临时文件、fsync、rename、回读确认与恢复日志保存。错误保留可重试状态，不把 Promise 或计划中的写入当作成功。每个集合由一个 Host 写入 owner 管理；不承诺独立进程同时写同一集合的原子性。

BookStore 依赖 Host 先创建并绑定项目文件夹。create 不接受含已有稿件的目录作为空作品；rename 保存作品标题，保留项目内容；remove 仅从原注册表取消登记，磁盘项目仍保留，可由 Host 的重新打开/绑定流程恢复。

## 事务与验收边界

项目写入复用既有整目录镜像事务：渲染临时树、检查版本与来源哈希、保留未托管文件、fsync、安装新树并完成回执。新增提交前复核，拒绝准备期间发生的书稿/设定变化。中断前未提交恢复旧树，已提交完成清理；不把多次独立 Service 调用称为跨实体原子批次。

这是单一项目写入 owner 的 Node 文件参考实现。没有承诺独立外部编辑进程与最后一次文件系统检查之间的绝对隔离，也没有完成 Windows、移动设备或掉电硬件验收。当前实现会复制项目树，未做大型项目性能基准；平台优化必须保留同样的身份、回执和恢复语义。

`npm run smoke:file-stores` 已加入 CI，使用临时项目验证：真实文件和 HTTP 保存、各类Store的实际读写与重开、作品取消登记、空章/同名构思/富字段、修订与文件冲突、失败换树回滚、同操作重试、中断恢复、MCP 标题以及 SQLite 元数据依赖刷新。无真实模型调用，不操作作者目录。
