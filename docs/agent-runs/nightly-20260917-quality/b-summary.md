# N-B 回执：全产品图标、按钮与布局审查与优化（nightly-20260917）

> 遵循[总计划](../../plan/nightly-20260917-sources-ui-memory.md)与[分册](../../plan/nightly-20260917-track-b-ui.md)。
> 完成标签：**已实施 ✓ / 分线验证 ✓**（本回执命令与普查工具可复跑）；**组合验证 ✗**（N-A/N-C 树未合并）；**用户确认 ✗**。

## 0. 基线与范围

- 基线：`main@c445dd4`，分支 `night/ui-20260917`，worktree `/home/recoletas/jiuguan/pinax-night-ui-20260917`（node_modules 符号链接→主树；Node v22.22.3）。
- 写锁遵守：只改 N-B 写区（WorkspaceTabs/SettingsContextBar/SettingsSectionNav/全局 styles/共享控件、未被 A/C 占有的页面局部 UI、uiControlContract.test.js）；未碰 `services/worldbook`、`services/memory`、package/lock。
- N-A（`night/sources-20260917`）与 N-C（`pinax-night-memq-20260917`）由并行会话持有；本线未触碰其树。

## 1. 任务账目（NB01–NB12）

| 任务 | 状态 | 交付 |
| --- | --- | --- |
| NB01 普查清单 | pass | `scripts/ui-controls-audit.mjs`（12 路由 × 1440/390 × 亮暗自动普查）+ [审查清单](./b-review-inventory.md)（含 per-入口状态与 not-run 项） |
| NB02 证据矩阵 | pass（深核 3）| [证据矩阵](./b-evidence-matrix.md)：Fluent 一手复核、Carbon 完整获取（修复上夜超时）、W3C WCAG/WAI；Apple/Material JS 渲染未完成深核，如实记录 |
| NB03 B-UI-v1 | pass | 控件合同落地为代码：WorkspaceTabs 真实 button 化 + 关闭兄弟化 + aria-current + 滚层可聚焦；codex 触发器同构；对比度收口。代表片=标签带（全页共用）、codex 区块（体验页）、表单标注家族 |
| NB04 高严重度修复 | pass | 普查 20 条违规 → 0（aria-required-children 48 处、嵌套交互 4 家族、scrollable-region 12 处、select-name、file/paste 标注、对比度 20 条）；uiControlContract 断言随新合同更新 |
| NB05 图标语义收口 | not-run | 未开始（本夜优先 NB04） |
| NB06 按钮状态/尺寸收口 | partial | workbench-controls 新增 dark codex 主按钮状态；完整家族矩阵未做 |
| NB07 布局家族 | partial | 代表片（标签带/codex/表单标注）即布局收口的一部分；工具条/目录全面优化未做 |
| NB08 持锁公共接线 | blocked | A/C 的路由与历史入口需求未到（并行会话尚未提交接线）；本线保持标签/路由合同稳定可用 |
| NB09 页面局部修复 | partial | 漫画 textarea、世界书 selects、素材 sidekick 已修；地图/画布深层未入 |
| NB10 窄屏/缩放重排 | pass（普查级） | 普查含 390 × 亮暗全路由；200% 缩放与短屏人工复核未做 |
| NB11 与 A/C 共同视觉检查 | blocked | 等 A/C 生产接线提交 |
| NB12 全仓影响验证 | pass（本线） | verify:full exit 0（20 文件/200 用例、Experience.vue 3546/3550、gameStore 30/30）；全套普查 0 serious |

## 2. 精确命令与 exit code

```
node scripts/ui-controls-audit.mjs                    → exit 0（普查工具；修复前 20 条违规 → 修复后 0）
node scripts/ui-controls-audit.mjs --routes ...       → 分路由复跑（全程多次，见 git 历史）
npm run verify:full                                   → exit 0（20 文件/200 用例顶格、lint 0、双 build、
                                                        架构预算 Experience.vue 3546/3550、gameStore 30/30）
workspace-consistency-smoke                           → FAIL，但基线 c445dd4 同样失败（welcome 门
                                                        「打开工作区导航」按钮缺失）——既有基线漂移，
                                                        已用 git stash 基线对照证实，非 N-B 回归，移交白天
```

## 3. 关键发现与移交

1. **Experience 既有 a11y 违规（S1，非本夜引入）**：hero folio 案号对比度、codex 区块嵌套交互——本夜已修（NB04）。
2. **workspace-consistency-smoke 基线失败**：`打开工作区导航` 按钮缺失，基线即失败——需要产品侧确认 welcome 门预期形态（白天）。
3. **createSession 同毫秒 id 碰撞**（上夜 V04 发现）：Date.now() 基 id，同毫秒连建两会话重叠——既有 owner 行为，建议白天评估。
4. **tabs 重构回归由交互冒烟抓出并修复**（`3f135d6`）：绝对定位的关闭钮被激活标签 `z-index:1` 压住不可点——普查（DOM 语义）无法发现此类问题，印证分册「交互检查与看图不可替代」；冒烟固化为 `scripts/workspace-tabs-interaction-smoke.mjs`（5/5）。
5. **Experience.vue 行数预算**：NB04 规则初版 +11 行触发 3550 上限，控件家族规则按职责移入 `workbench-controls.css`（全局样式为 N-B 写区），预算回落 3546/3550。
4. **Apple HIG / Material 3 / Notion / Linear**：页面 JS 渲染无法静态取文，NB02 如实记「未完成深核」；白天可人工浏览器核对。
5. **NB05–NB07**：控件家族（图标语义、状态矩阵、密度）的全面收口按分册需逐家族实页证据，本夜完成合同与代表片，剩余按清单推进。

## 4. 提交

- `8a035af` feat(ui): NB01-NB04 control census, evidence matrix, contract and S0/S1 fixes（23 文件）
- （后续提交见 git log；每批以 verify:full exit 0 为前置）

## 5. 复验方式（白天 Codex）

1. `node scripts/ui-controls-audit.mjs` → 0 serious/critical（12×2×2 矩阵）。
2. `npm run verify:full` → exit 0。
3. 打开任意页 → 标签带键盘 ←→ 导航、Tab 聚焦、关闭钮可见；`/experience` codex 区块切换/查看详情均可键盘操作。
4. 对比截图：`/tmp/pinax-ui-controls-audit/report.md` 的修复前记录 vs 当前运行。
