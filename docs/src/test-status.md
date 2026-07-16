# 测例与基准状态

> 只记录当前验证基线和会影响后续判断的测试事实。完整测试文件清单以 `src/__tests__/` 为准。

## 最近验证

最后更新：2026-07-16 15:43 CST

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `npm run test:run` | 通过：18 files / 200 tests | 核心数据流、地图视觉、地理历史、运行时、世界书、记忆、素材与恢复回归 |
| `npm run verify:full` | 通过：17 files / 188 tests + 1 file / 12 visual tests | Vite build、VitePress docs build、`git diff --check` 通过；视觉仅执行一次 |

## Gate 0.1 主流程 Smoke 基线

这张表是后续自动测试、浏览器手测和 API 手测共用的验收口径。`基线` 只代表已经定义输入和恢复动作，不代表当前链路已经通过；真实 API、浏览器交互和清空后恢复仍需逐条执行。

| # | 主流程 | 固定输入 | 成功判据 | 预期数据副作用 | 失败恢复 | 当前状态 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 创建世界 | 新世界名 + 固定 preset `gate0-demo` | 进入设定页，当前世界书可见且可编辑 | `worldbook_<id>`、`active_worldbook_id` | 保留原世界书，删除新建空对象后重试 | 基线已定义，未跑 live |
| 2 | 导入设定 | preset、小说片段、说明驱动 AI 三路径各一组固定输入 | 预览可见，冲突有明确替换/重命名/新建选择，接受后条目和结构化字段可见 | 世界书条目、结构化设定、导入来源 | 拒绝草稿或恢复导入前快照，不覆盖旧世界 | 基线已定义，三路径未完整手测 |
| 3 | 生成地图 | seed `gate0-demo-001`，1200×800 默认配置；连续提交 A/B/C | 最终只显示 C；失败后可重试；超时后下一次请求无需刷新 | 地图配置、地理数据、地图生成元信息 | 保留上一张成功地图，终止当前任务后重试 | 自动契约通过，20 次 live 压测未跑 |
| 4 | 地图进入历史 | 从地图选择一个语义点，确认生成历史草稿并进入开场 | 草稿可审阅；地点、事件、参与者和历史节点引用一致 | `geoHistory`、history node、map binding | 拒绝草稿不改变正式世界书和 runtime | 基线已定义，生产链路未完整手测 |
| 5 | 冒险 8 轮 | 固定世界 + 8 条玩家输入，LLM 配置或明确本地 fallback | 每轮文本完成后再出现通知/事件；选项跟随剧情；会话可继续 | session messages、runtime events、plot journal、memory candidates | 单轮失败可重试，不重复写入或丢失已完成轮次 | 部分自动测试，live LLM 未跑 |
| 6 | 保存素材 | 从第 5 流程选择一段对话，保存为事件/角色/地点素材 | 素材有短摘要、来源引用和当前项目/会话信息 | narrative assets、source refs | 取消保存不产生半条素材；重复保存可识别 | 基线已定义，未跑 live |
| 7 | 写章节 | 用第 6 流程素材创建章节，写入一段固定正文并保存 | 章节切换、刷新后正文和来源仍在；未保存状态可见 | writing books/sessions、chapter outline、素材引用 | 保存失败保留编辑器内容并显示重试 | 基线已定义，未跑 live |
| 8 | 生成分镜 | 用章节/素材创建 3 个镜头，修改顺序并导出 | 镜头版本、关系和来源一致，导出包可解析 | storyboard documents/snapshots、asset refs | 导出失败不影响当前版本，可重新导出 | 自动导出测试通过，页面流程未跑 |
| 9 | 生成图片 | 使用测试供应商或未配置 API 两种状态各跑一次 | 任务成功有资产来源和状态；失败有可见原因和重试，不阻塞正文 | image model config、narrative asset metadata | 失败不写入半成品；取消后任务可清理 | 自动边界部分覆盖，供应商 live 未跑 |
| 10 | 备份恢复 | 含动态世界书键、brief、会话和素材的备份；先清空隔离存储 | 导出完整；恢复前能显示新增/覆盖/跳过/不兼容；确认后数量一致 | backup JSON、恢复后的各业务键 | 损坏或未来版本只生成错误，不覆盖现有数据 | 自动恢复写入、回滚和 UI 确认已覆盖；隔离浏览器手测仍未跑 |

## 必跑命令

| 场景 | 命令 |
| --- | --- |
| 提交前通用验证 | `npm run test:run` + `npm run build` |
| UI / 渲染相关改动 | 追加 `npm run test:run -- src/__tests__/visual-verification.test.js` |
| 文档站改动 | 追加 `npm run docs:build` |

`npm run verify` 当前走 `verify:full`；dirty worktree 下若 Vitest 先失败，需单独运行 `npm run verify:post` 和 `npm run docs:build` 获取构建与文档结果。

## 覆盖面摘要

- 数据与恢复：备份恢复、运行时事件、会话状态、玩家历史和因果报告。
- 地理历史：地图语义审阅、PlaceEntity、历史草案、运行时上下文与地图地点互跳。
- 世界书与创作：快速导入、上下文构建、记忆候选、素材来源/去重和章节选区保存。
- 视觉与并发：地图视觉/性能基线与 Worker 超时恢复。

## 已知非阻断输出

- 地图测试会输出 `generateHeightmap template contract NOT met` 的软合同诊断；地图定向套件仍通过。
- jsdom 环境会对部分 axe/canvas 用例输出 `getComputedStyle` 或 `HTMLCanvasElement.getContext` not implemented；这是非阻断输出，全量测试仍通过。

出现新的失败时，先更新 [known-issues.md](./known-issues.md)，再决定是否进入 RFC / plan。
