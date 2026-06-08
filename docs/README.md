# 文档导航

> 当前文档分两层：`docs/src/` 记录仓库当前事实与已接受决策；其余目录保留用户手册、运维说明和历史计划。

## 快速入口

| 文档 | 用途 | 状态 |
| --- | --- | --- |
| [src/index.md](./src/index.md) | 项目内文档框架入口 | 当前主入口 |
| [src/code-map.md](./src/code-map.md) | 代码库地图和 owning surface | 持续维护 |
| [src/known-issues.md](./src/known-issues.md) | 当前活跃问题与已接受限制 | 持续维护 |
| [src/test-status.md](./src/test-status.md) | 测例与基准通过情况 | 跑测后更新 |
| [src/decisions/](./src/decisions/) | 已接受决策记录（ADR） | 稳定事实 |
| [src/rfcs/](./src/rfcs/) | 仍需评审或保留上下文的设计草案 | 逐步收敛 |
| [user-manual/README.md](./user-manual/README.md) | 面向用户的说明书 | 持续维护 |
| [engineering/development-standards.md](./engineering/development-standards.md) | 开发与 UI 基线 | 持续维护 |
| [operations/troubleshooting.md](./operations/troubleshooting.md) | 运维与故障定位 | 持续维护 |

## 本地文档站

```bash
npm run docs:dev
npm run docs:build
```

VitePress 源码位于 [src/](./src/)，入口页必须是 [src/index.md](./src/index.md)。不要提交 `.vitepress/cache/` 或 `.vitepress/dist/` 生成产物。

## 历史材料

- [plan/](./plan/)：仍在本仓保留的迭代计划和状态记录。
- [superpowers/](./superpowers/)：历史 specs / plans / notes。已经迁移到 ADR / RFC 的内容不再作为当前事实入口。
- [LOG.md](./LOG.md) / [PLAN.md](./PLAN.md)：历史主线与开发日志，当前事实优先看 `docs/src/`。

## 维护规则

- 当前事实只写一处，其他地方链接过去。
- 已稳定的能力压缩成结果摘要，不保留长过程。
- 新问题先写到 [src/known-issues.md](./src/known-issues.md)，设计方案再进 [src/rfcs/](./src/rfcs/)。
- 每次跑全量测试后更新 [src/test-status.md](./src/test-status.md)。
