# U 线交付摘要（overnight-u-20260905 最终版）

## 做了什么
1. **payload 总预算（U1a）**：`narrativeKernelPayload` 是单 text part（合同上限 8000 字符），场景块加入后必然越限。新增 `serializeKernelWithinTextPartBudget`：按"静态前缀+payload"校验总长，越限递减参考块界额，必要指令放不下抛 typed 错误。receipt 与实际发送同源。断言并入现有用例（不增预算）。
2. **空工具目录（U1c，P0）**：无世界书普通稿 manifest 模式下 `activeToolNames` 只剩 beat_plan，prose 请求空工具必失败。修复 `world_lookup` 基础化。J7/J10 恢复通过。
3. **J1 右键焦点（U1b）**：三重修复（同步恢复+view.focus+DOM 选区回写+失败路径归还焦点），独立复现 10 轮全过。矩阵环境仍间歇性红（1/2 断言），需编辑器专项。
4. **空章 gap 点击穿透**：gap 54px 实体块 + stopEvent 盖住空章首行——容器改 `pointer-events:none`，按钮/表单恢复 `auto`。
5. **UX-03 落地**：检查器"现场"页四行索引替换为只读紧凑概览。
6. **harness 同步**：IdeaShelf/gap 按钮/SearchPanel/outline 面板选择器适配（C1 重构后遗留）。

## 没做什么
- A3-1 入口精简：模板已改但 3 个测试与旧 DOM 结构耦合，回退待适配后重做。
- J9 组合态 waitForFunction 超时：compositionend 快照语义，需编辑器专项。
- J11 选区浮条 vs SearchPanel：面板打开抑制浮条 + 关闭点击走全局清理（A2-5 决策待定）。
- A2-2 手机顺序流：默认保持堆叠（按任务书），不做改版。

## 是否安全
零越权写入、零真实模型调用、未动 5173、K 线零接触、无 push/合并。

## 怎么验
- `npx vitest run` → 197/200（3 个 composer 测试为 A3 适配债务）
- `BASE=5173 node scripts/authoring-journeys-smoke.mjs` → 10/14 通过（J1/J9/J11 已知）
- `node scripts/authoring-ui/rollout-acceptance.mjs` → 19/19
- `npm run verify:full` → 200/200 预算内，Vite/VitePress build 通过
