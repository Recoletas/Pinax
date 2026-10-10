// [RETIRED 2026-10-11] f2-dual-pane Gate 随「双栏」功能整体退役（W-B 创作台外壳重构）。
//
// 退役范围（docs/plan/agent-first-shell-20261010.md §3.2 / §5 待裁 3）：
//   - src/components/authoring/AuthoringDualPane.vue（删除）
//   - 右轨 AuthoringWorkspaceToolRail 的 dual 钮（右轨整体删除，工具入口迁顶栏
//     AuthoringInspectorToolbar，dual 不再迁移）
//   - useAuthoringInspectorState 的 dual 状态机分支、Authoring.vue 的全部
//     dual 管线（saveDual*/swapDual*/open*InDual/protectDualDestructiveEdit、
//     dualQuickWordDocument、dualCompositionActive、intervention ghost dual 槽等）
//   - uiControlContract.test.js 等钉双栏字符串的断言（按功能移除改写，commit
//     body 说明这是功能移除而非回归）
//
// 本文件保留为退役说明占位：原 Gate 是「双栏 + 移动 sheet」实机旅程
// （fixture 重放，产物写 /tmp/pinax-f2-dual），其「移动端检查器为全宽
// bottom sheet」的覆盖已由 f2-knowledge-assistant-check 的 390 段接续；
// 双栏专属旅程（副窗开第二章、主副交换、副窗快捷词/搜索/审稿）随功能
// 退役，不再有等价断言。新外壳旅程见 scripts/authoring-shell-check.mjs。
//
// 考古原脚本：git show 270c4a3:scripts/authoring-ui/f2-dual-pane-check.mjs
console.log('[retired] f2-dual-pane Gate: 双栏功能已于 2026-10-11 整体退役（W-B），本 Gate 无运行语义。')
process.exitCode = 0
