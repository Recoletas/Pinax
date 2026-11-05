# 旧 Core 抽取副本（保留 WIP，不再供宿主运行）

2026-11-05：Web 与离线 SQLite Catalog 的应用导入已切到独立 `@pinax/core` v0.8.0，消费方式见 [固定产物说明](../../vendor/core/README.md)。本目录不再是运行依赖或发布源；业务修改进入独立仓库 `Recoletas/pinax-core`。

暂未删除的原因：

- 此副本比独立 v0.8.0 多大纲边端点存在性校验，涉及 `contracts/errors.js`、`usecases/outlineEdgeService.js`、`usecases/syncOutlineEdgeService.js`。这是已有未验证 WIP，需单独移交独立仓库、升级版本后再消费，不能在切包时丢弃或伪装已发布。
- `test:core`、`lint:core` 和现有 Vitest include 仍针对本目录的历史合同用例；通过这些用例不能证明宿主实际依赖包通过。独立 Core 的合同测试应由独立仓库维护，之后再统一 CI 责任。

本轮不删除其他会话的源码/用例，不调整测试预算，不运行测试、构建或门禁。`npm run core:pack -- /path/to/pinax-core` 已只接受独立来源；`core:smoke` 改为使用宿主固定的包产物。
