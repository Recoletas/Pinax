# Web Alpha 夜间计划组合验收 · 2026-09-16

## 结论

此前 partial 项已在 `integration/web-alpha-completion-20260916` 完成并重新组合验收；代码门禁达到任务书完成条件。真实外部 provider 和实体设备不在本次确定性验收环境中，明确记为未运行。

## 接收范围

| 范围 | 结果 | 证据 |
|---|---|---|
| A/B 试演工具、回执与记忆接缝 | accepted | 单工具运行器、manifest 授权、最小 receipt、右栏可读证据、adopted-text proposal 与 pending memory workflow |
| ZIP 导出、inspect、恢复、回滚、幂等 | accepted | 浏览器八步 Gate；失败注入后旧书稿/来源/媒体完整 |
| 压力恢复 | accepted | 100 章、20 世界书条目、128 来源 chunks（约 63 MB）、20 MB 媒体；ZIP 20.08 MB；恢复后 hash/字节一致 |
| Authoring | accepted | 12,193→10,832 行，149→111 imports；历史、插画、知识 reader、共同排演 owner 已迁出 |
| Notes / Prose / Experience | accepted | 1,530/18；2,785/18；3,547/21，均低于预算 |
| gameStore | accepted | 1,636/29；涌现、冒险、分支、观察器、机制投影均有 experience owner |
| services / import 图 | accepted | 根层 JS 14；production cycle 0；production→experimental 0；旧根路径 0 |
| H0/H2/H3 | accepted | ESLint 0 error / 0 warning；Authoring 1,448,098 bytes（上限 1,450,000）；重面板独立 lazy chunks；结构/build-size CI gate 已接入 |

## 组合修复

保留此前对来源写入计数、媒体新增记录回滚、localStorage 异常补偿、ZIP 原始路径穿越、manifest 域 schema/容量校验和归档 warnings 的修复。本次继续修正 narrative executor 的排除字段、迁移后的 UI 源码合同、插画 host 生命周期和页面 owner 接线。

## 验证边界

- 已运行：20 文件 / 200 用例、试演后果矩阵、试演真实页面 Gate 207/207、备份 Chromium 八步旅程、压力样本、叙事 stream/recovery smoke、Authoring smoke、Vite/VitePress build、精确 ESLint、Authoring build-size 与结构 enforce。
- 未运行：真实外部 provider、Windows 原生中文输入耐久、实体设备人工视觉确认。
