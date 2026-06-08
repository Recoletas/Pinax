# 测例与基准状态

> 只记录当前验证基线和会影响后续判断的测试事实。完整测试文件清单以 `src/__tests__/` 为准。

## 最近验证

最后更新：2026-06-08 21:26 CST

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `npm run test:run` | 通过：81 files / 559 tests | 输出中仍有既有地图模板合同告警、jsdom/canvas not implemented 警告；测试退出码为 0 |
| `npm run test:run -- src/__tests__/visual-verification.test.js` | 通过：1 file / 12 tests | headless 地图视觉 / 性能验收 |
| `npm run build` | 通过 | Vite production build |
| `npm run docs:build` | 通过 | VitePress 文档站构建 |
| `git diff --check` | 通过 | 无空白错误 |

## 必跑命令

| 场景 | 命令 |
| --- | --- |
| 提交前通用验证 | `npm run test:run` + `npm run build` |
| UI / 渲染相关改动 | 追加 `npm run test:run -- src/__tests__/visual-verification.test.js` |
| 架构边界改动 | 追加 `npm run test:arch` |
| 文档站改动 | 追加 `npm run docs:build` |

`npm run verify` 等价于 `npm run test:run && npm run build`。

## 覆盖面摘要

- 地图引擎：高程图、板块、海岸、河流、聚落、国家、省份、道路、边界、渲染 preset、worker 桥、视觉/性能基线。
- 世界书 / 设定：种子世界导入、上下文构建、地图桥接、结构化设定、字段生成和草稿预览。
- 记忆 / 上下文：Mem0 scope、记忆候选、同步、压缩和服务端代理边界。
- 体验 / 生成：体验机制、生成服务、重试、顾问任务和文本渲染。
- 素材 / 写作 / 画布：叙事资产、素材删除与画布引用清理、分镜 store、关系画布和导出链路。
- UI 契约：欢迎页、可玩的世界书入口、导航、页面切换、素材批量操作、设定字段控件和 a11y 基线。

## 已知非阻断输出

- 地图测试会输出 `generateHeightmap template contract NOT met` 的软合同诊断；当前全量测试仍通过。
- jsdom 环境会对部分 axe/canvas 用例输出 `getComputedStyle` 或 `HTMLCanvasElement.getContext` not implemented；当前全量测试仍通过。

出现新的失败时，先更新 [known-issues.md](./known-issues.md)，再决定是否进入 RFC / plan。
