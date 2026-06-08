# 开发日志

> 只记录近期用户可感知变化、验证结果和仍会影响后续判断的风险。过程性 UI 微调不再逐条保留。

## 当前摘要

- 产品主线正在从“文字游戏 + 写作工具集合”收口为“可玩的世界书”：进入世界、冒险、沉淀剧情，再写成作品或整理为分镜。
- 当前主要稳定链路：体验页 -> 世界书/设定 -> 素材 -> 卡片画布/分镜 -> 写作出口。
- 当前验证基线：`npm run test:run` 通过（81 files, 559 tests），`npm run build` 通过，视觉/性能验收通过（12 tests）。

## 2026-06-08 - 文档分层补完

状态：完成首轮

结果摘要：
- 新增 `docs/superpowers/README.md`，把设计草案、执行计划和 agent 基础设施材料单独收口，不再把 `superpowers/` 当作无边界目录。
- `docs/plan/README.md` 继续区分“当前主线专题 / 活跃技术专题 / 参考计划 / 历史背景”，减少把 `playable-worldbook-roadmap.md` 误读成归档材料的概率。
- `docs/README.md` 的文档导航同步收窄，明确哪里看当前事实，哪里只在考古或基础设施维护时再看。

验证：
- `npm run docs:build` 通过。
- `npm run test:run` 通过（81 files, 559 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-08 - 文档入口收口

状态：完成首轮

结果摘要：
- 文档入口改成“先看主线、再看当前事实、按需看专题路线图”的结构，不再把整个 `docs/plan/` 一概视为历史材料。
- `README.md`、`PLAN.md`、`docs/src/index.md`、`docs/src/test-status.md`、`docs/src/known-issues.md` 收口为当前主线、当前风险和当前验证基线。
- 新增 `docs/plan/README.md`，明确 `playable-worldbook-roadmap.md` 是当前主线专题；`docs/src/code-map.md` 改成更偏查表的 owning surface。

验证：
- `npm run docs:build` 通过。
- `npm run test:run` 通过（81 files, 559 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-08 - 可玩的世界书 Phase 1

状态：完成首轮

结果摘要：
- 新增“可玩的世界书”路线图，明确当前主线是选择世界、开始冒险、沉淀剧情、写成作品；生视频降级为分镜完成后的后置出口。
- 首页和体验页入口文案收口为“进入世界”，体验页增加“选择世界 -> 开始冒险 -> 写成作品”的启动带。
- 无世界书时，体验页不再只提示选择世界书，而是引导进入快速导入并使用种子世界冷启动。
- 快速导入的一键预设升级为 3 个可直接玩的种子世界：边境王国、都市异闻、近未来殖民地，并展示开场困境和创作出口。

验证：
- `npm run test:run` 通过（81 files, 559 tests）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-08 - 体验与设定导入修复

状态：完成首轮

结果摘要：
- Mem0 未配置时不再发起代理请求，服务端 Mem0 代理失败也不再把上游错误详情回显给浏览器；设置页 Mem0 key 保持密码输入。
- 体验页消息里的机制触发点现在可在关闭面板后再次点击，重新进入对话/回复机制。
- 小说段落导入改为 AI-first，多章节文本也会先走 AI 提炼，失败后才回退本地分段/提炼。
- 结构化设定页生成的草稿预览按世界书持久化，切换页面或重挂载后仍保留预览。

验证：
- `npm run test:run` 通过（81 files, 553 tests）。
- `npm run build` 通过。

## 2026-06-08 - 素材与工作区收口

状态：完成首轮

结果摘要：
- 素材页删除从归档改为永久删除；已导入画布的素材会同步清理节点、连线、时间轴和牌堆引用。
- 素材页左侧活动列表只显示待处理和已采纳素材；归档/拒绝素材仍保存在存储中，但不再停留在活动列表。
- 素材页勾选后统一显示批量导入、采纳、归档、删除；详情工具栏移除“待处理 / 采纳 / 归档”三联状态按钮。
- 快速导入预设升级为现代世界书结构，包含 `rule/style/forbidden` 常驻约束条目，并补齐世界描述、文风和禁写边界。
- 设定预设条目、页面切换动画、画布左侧详情/时间轴区分度完成一轮打磨。

验证：
- `npm run test:run` 通过（81 files, 558 tests）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-05-28 - 分镜版本状态前置

状态：完成首轮

结果摘要：
- 时间轴头部前置分镜版本状态和主动作，用户可以直接生成、更新或下载当前分镜版本。
- 分镜版本指纹纳入关系线类型和标签，调整连线后会提示版本需重建。
- 剪辑包构建下沉到导出服务，并直接下载 ZIP；包内包含 manifest 和可拆分文件清单。

验证：
- `npm run test:run -- src/__tests__/integration.test.js src/__tests__/relationCanvas.test.js` 通过。
- `npm run build` 通过。

## 2026-05-27 - 素材 / 画布 / 分镜链路收口

状态：完成首轮

结果摘要：
- 素材页定位为内容中转层和资产真源；卡片画布只引用素材并附加关系、位置和镜头参数，不复制长正文。
- 原散文卡片页收口为通用卡片关系画布；诗歌独立页面退场，保留必要兼容层。
- 分镜导出服务带出素材 ID、上一镜关系和参考图轻量引用，支持 Markdown、Premiere CSV、剪映草稿和 FCP XML。
- 画布关系线、时间轴、节点详情和右上图例完成多轮减重，主路径集中到“素材 -> 关系画布 -> 分镜输出”。

验证：
- 多轮 `npm run verify` / `npm run build` 通过。
- 多轮 `src/__tests__/relationCanvas.test.js`、`integration.test.js`、`storyboardStore.test.js` 回归通过。

## 历史展开

更早或更细的过程性记录不再保留在主日志。需要实现背景时优先看：

- [PLAN.md](./PLAN.md)
- [src/code-map.md](./src/code-map.md)
- [src/known-issues.md](./src/known-issues.md)
- [plan/](./plan/)
- [superpowers/specs/](./superpowers/specs/)
