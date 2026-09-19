# 文本块、助手前端与生图：P00 基线核对回执

日期：2026-09-19。计划：[authoring-block-assistant-image-20260919](../../plan/authoring-block-assistant-image-20260919.md)。
分支 `night/block-assistant-image-20260919`（worktree `pinax-block-assistant-img-20260919`，基 main@5efd1d4，含验收返工 `c030793`）。

## HEAD 与代码基线

- 基线 `c030793`（计划核查基线）+ 本计划登记文档 `5efd1d4`，代码零差异。
- 写作 Skills S01–S05 已在本会话交付并返工验收（eval 8/8、41/41、31/31、13/13，
  verify:full exit 0，三条旅程 29/29、46/46、33/33）——该轮数字对本 HEAD 仍有效
  （其上仅文档提交）。旧 gate 不复制为本轮结果；B/A/I 各包完成后重跑。
- 主题机制：`app_theme`（light|dark，`themeStore`，html class `theme-light/dark`
  + `theme-legacy`）。编辑页亮暗切换按钮按用户既有要求隐藏，基线截图经
  localStorage 设定主题，不经 UI。

## 首屏基线截图（P00 交付物）

`screenshots/baseline/`：三域（block/assistant/illustrator）× 三视口（1440/900/390）
× 明暗成对，共 18 张，脚本 `scripts/authoring-ui/block-image-baseline-shots.mjs`
（隔离 context，fixture 《雾港纪事》，无页面错误）。

基线现状（截图核对，与计划 §2 一致）：

- **正文块**：当前块边界几乎不可见——无页边线，仅「推演下一段」悬浮卡暗示
  单元末尾；悬停横线 8px、当前块一行高竖线（源码 `WritingNotebookEditor.vue`）。
- **助手**：右栏以问答 thread 为主，快捷任务已是「问答范围」下拉；无审稿任务、
  无意见行、无候选入口（S06–S12 待接）。
- **生图**：宽抽屉可开（桌面工具栏「生图」/390 More 菜单），表单含风格缩略图、
  参考上传、比例数量负面提示与模型选择；结果区与参数列比例待 P01 原型验证。

## source / target / current-focus 术语登记（P00 要求）

三域共用，后续包一律按此口径，不混用：

| 术语 | 含义 | 冻结时机 | 失效表现 |
|---|---|---|---|
| **source（来源）** | 打开工具时捕获的活动编辑面快照：主/副栏、书/章/文档、选区或当前块、内存稿 revision。生图的「来源摘要」、块菜单的目标块都取自它 | 工具打开/pointerdown 时（`freeze*Source` 既有 owner） | 换书/换章/正文变化 → 任务标记过期，旧结果只读 |
| **target（目标）** | 任务真正作用的冻结范围：审稿的 scope（选区/块/章 + scopeNodeIds）、改写的 rewrite target（node/range/exact）、生图提交的参考与描述所依据的版本 | 请求发出前经合同归一化（`options.writingSkill` / rewrite request） | revision 对账失败 → 候选禁用、采用拒绝 |
| **current-focus（当前焦点）** | 作者当下的编辑/浏览位置：光标、选区、滚动、展开的意见。工具关闭或「回到原处」要恢复的就是它 | 不冻结，随交互流动 | 仅有 UX 影响：恢复失败是缺陷，但不冒充任务过期 |

规则：hover 他块只改变视觉提示（temporary），不触碰三者；冻结任务范围标记
（decoration）区别于 hover；「回到原文」恢复 current-focus，不重新冻结 target。

## 无虚构能力声明

截至本包：助手无审稿任务入口（只有问答）；生图无「专业风格/构图/身份控制」
声明（能力盘点归 I01）；validated-only 不会显示为审稿完成（A01 起接线时按此验收）。

## 下一包

P01：三个代表性视觉原型（当前块与块菜单、助手一条审稿意见、生图一张候选），
1440/900/390 截图供方向评审；冻结 §4 的 8 条约束与 token 对照。
