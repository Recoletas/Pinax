# U 线验证回执

- vitest 全量：200/200（20 文件，预算内）
- `npm run verify:full`：exit 0（vitest + Vite build + diff check + VitePress build）
- journey 矩阵（BASE=127.0.0.1:5173，隔离 provider mock）：12/14 通过
  - J9 失败：compositionend 后 waitForFunction 4s 超时（组合态快照语义，需编辑器专项）
  - J11 失败：SearchPanel 打开抑制选区浮条 + 关闭点击走全局清理（A2-5 产品决策待定）
  - J1 右键焦点间歇失败大幅改善（同步恢复 + view.focus + DOM 选区回写），长矩阵偶发仍存在
- rollout-acceptance：19/19
- rollout-v2-check：5/5（探索定位已适配 IdeaShelf）
- 改动文件：Authoring.vue、Authoring.block-native.css、WritingNotebookEditor.vue、narrativeAgentOrchestrator.js、narrativeKernel.js、narrativeKernelExecutor.js、AuthoringSceneCuration.vue（前会话）、AuthoringIdeaShelf.vue（前会话）、journey harness 选择器同步
- 未跟踪新文件：scripts/authoring-ui/rollout-*.mjs（V2/V5/acceptance/baseline/audit Gate 脚本）
