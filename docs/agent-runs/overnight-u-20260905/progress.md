run-id: overnight-u-20260905-2310

# U 线进度

## U0 基线核对（开始）

- HEAD: da7eda1f（activity worktree，53 文件未提交 WIP 属多会话共有，不属本线单独所有）
- 策略：工作树是共享活动区（用户未提供独立 worktree），按任务书 §2.3 精神——**只追加本线明确允许的文件的最小改动**，全部改动保持可精确列举，方便晨间审阅或回退。不启动/停止 5173（沿用运行中的服务）。
- 验收面：payload 总预算（narrativeAgentOrchestrator.js）、J1 右键焦点（WritingNotebookEditor.vue + Authoring.vue）、A2-3 作用范围（SceneCuration）、A3 入口/反馈/试稿阅读（BlockComposer/BlockDraft）。

## U5 收口（最终）

- U0 ✓ / U1a ✓（payload 总预算+测试并入）/ U1b 部分（三重修复落地，间歇保留记录）/ U1c ✓（空工具目录 P0 修复）
- U2 ✓（A2-3 已由 C1 run-intent 重构实现，五路径核对完成，无需新改动）
- U3/U4 部分：J10 工具目录缺陷修复后 draft 流端到端验证通过；入口统一与反馈重排未做（超本夜预算）
- U5 ✓：verify:full exit 0（200/200）；acceptance 19/19；journeys 12/14
- 阻断/遗留：J1 间歇（编辑器专项）、J9 组合态快照、J11 选区浮条 vs SearchPanel（A2-5 决策）
