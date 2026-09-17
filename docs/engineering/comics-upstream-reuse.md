# 漫画线上游源码复用记录（2026-09-16 夜间 B 线）

上游：[yuanbw2025/storyforge](https://github.com/yuanbw2025/storyforge)，冻结版本 `cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed`（2026-09-16 `git ls-remote` 与 GitHub recursive tree 一致）。根许可证 MIT，`Copyright (c) 2026 yuanbw2025`（[LICENSE 原文](https://github.com/yuanbw2025/storyforge/blob/cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed/LICENSE)）。

## 实际移植范围

| Pinax 文件 | 上游来源（相对仓库根，同一冻结 SHA） | 移植内容 | 适配说明 |
| --- | --- | --- | --- |
| `src/services/media/comicRequestGuard.js` | `src/lib/comic/image-request-guard.ts` | 「发送前登记请求、同 hash 未决结果拦截重发、结果未知分类」的策略语义（claim / outcome-unknown） | 去除了上游的 Agent conversation / 数据库依赖，改为纯函数；`canSendComicRequest`、`comicRequestIntentHash`、`classifyOrphanedComicRequest` 按本仓库共享合同风格重写，非逐行复制 |

其余漫画改动（页目录、selection owner、晚返回围栏、持久化重试、导出快照、未知结果恢复 UI）均为 Pinax 既有服务（`comicPageStore` / `comicProductionService`）上的原地实现，参考了上游 `durable-production.ts` / `media-service.ts` / `qa.ts` / `renderers.ts` 的**设计语义**（候选冻结与采用围栏、expectedRevision、图片候选与采用分离、导出冻结 manifest），但未复制其代码：上游实现依赖 React/Zustand/数据库 Harness，与 Pinax 的 Vue + localStorage/IndexedDB 结构不同。

上游 UI（ComicStudio.tsx 等）只借了交互组织方式（对象工作区、页目录 + 画布 + 检查器三栏），未移植任何 React/样式代码，未引入新依赖；本线新增的唯一 import（`autosize`）是仓库已有依赖（世界书字段在用）。上游样例漫画图片、封面、人物图一律未随本仓库发布。

## 许可留档

当前发行也保留来源与许可，不延后到独立抽库：统一登记见 `THIRD_PARTY_NOTICES.md`，完整 MIT 文本随 `public/third-party/storyforge-LICENSE.txt` 进入构建。原作者代码版权不被 Pinax 根许可证替代。
