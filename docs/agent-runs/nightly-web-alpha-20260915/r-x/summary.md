# R-X 线 summary · Experience 架构迁移（三 worker 波次 · 第三 worker）

- 基线：`e69a8a8`（O0 数字一致；工作树干净）
- 分支：`night/refactor-experience`，冻结 HEAD **`7337948`**
- 提交序列：`bcb4c4a`(R-X1 四 owner) → `ce22352`(R-X3 机制投影) → `7337948`(共享测试最小补丁)
- 实际时间：单会话连续执行；按提交时间戳可核，不折算工时

## 主包状态

| 包 | 状态 | 说明 |
|---|---|---|
| R-X0 边界冻结 | **done** | fault matrix 20/20；state 73 / actions 137 冻结（脚本可复现） |
| R-X1 四会话迁出 | **partial（行为完成、硬指标差 53 行 / 9 import）** | `useExperienceAutoAdvance/CodexWorkspace/SessionWorkflow/QuickCapture` 四 owner 迁出，含联机绑定与收进写作书；页面 4,439→**3,603** 行（-836）、import 37；页面不再持有 auto timer / codex detail stack / session CRUD / quick-note persistence / writing collect |
| R-X2 涌现+冒险 coordinator | **not-started** | 涌现/冒险触发与 Pinia runtime 深耦合（15+ 动作），按 B-R2 同标准需要 snapshot+adapter 分解，赶工会产生行为风险，未动 |
| R-X3 机制投影 | **partial** | `experienceMechanismProjection.js` 完成（机制触发/对话机制/说话人纯检测，规则逐字一致）；`gameBranchWorkflow.js`（分支事务计划）not-started |

## before / after（实测）

| 项 | before | after | limit |
|---|---|---|---|
| Experience.vue | 4,439 行 / 37 import-from | **3,603 / 37** | 3,550 / 28 |
| gameStore.js | 2,990 行 / 38 import-from | **2,869 / 41**（机制投影 +import） | 2,300 / 30 |
| 存档 shape | WRITING_SESSIONS v1 | 不变 | 不变 |

## 验证（最终 HEAD 7337948 实测）

- `node scripts/experience-session-fault-matrix.mjs`：**20/20**
- `node scripts/experience-store-api-surface.mjs e69a8a8 WORKTREE`：73 keys / 137 actions 零增删
- `npx vitest run`：**200/200**；`npm run verify:full`：**exit 0**（20/20 files、双 build、diff、docs）
- `npx eslint src/pages/Experience.vue`：0 errors / 2 warnings（**均为基线 e69a8a8 遗留**，实测基线同 2 条；归 H0）

## 供 O 复核的两处

1. **共享测试补丁（O 写锁）**：`uiControlContract.test.js` 的 Experience 接线断言读取面从单文件扩为"页面+四 owner"并集；Escape 链 quickNote 断言对齐实际注入接线（`isQuickNoteOpen()`）。行为断言（关闭顺序、焦点恢复）不变。按"静态测试绑定旧文件位置时改为验证实际模块接线"规则执行。
2. **行数/import 指标未达**：R-X1 按 partial 处理。剩余到 3,550/28 的合法路径是 R-X2/X3 后配合 C8 式组件化收口（codex sheet 模板块约 80 行、SVG/图标行为局部化），不是删注释或挪 CSS。

## 未做项

- R-X2 gameEmergenceCoordinator / adventureTriggerCoordinator（not-started，涌现在 434-824、冒险在 882-1167，需 snapshot+adapter 分解）
- R-X3 gameBranchWorkflow（not-started，分支事务计划在 1974-2340 区域）
- Experience.vue 836 行净减已完成，但距 889 行目标差 53 行
