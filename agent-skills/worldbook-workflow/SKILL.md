---
name: worldbook-workflow
description: Use when modifying worldbook, worldbook imports, or context builder code - matches work to the canonical worldbook workflow doc and guards project identity/async race ownership
---

# worldbook-workflow

Workflow guardrail for worldbook subsystem work.

1. **Read first**: `docs/guides/worldbook-workflow.md` — canonical reference for all worldbook work. If a guide passage contradicts current implementation, fix only the passage this change touches and hand the edit to the integration owner; do not rewrite the whole spec opportunistically.
2. **Classify the surface** of the change: quick import (`/experience/worldbook` 普通入口) / advanced editor (`/experience/worldbook/advanced` 高级设置) / SillyTavern import-export / context injection（guide §4）/ structured settings（guide §5）。Each surface has its own conventions; do not mix them. Verify the affected paths **plus the shared boundary they ride on**（如激活写入口径）；不要机械重跑与本次无关的导入全流程。
3. **项目身份优先于 active 回退**：跨页读写世界书时以 bookId→book.worldbookId 的项目绑定为准；activeWorldbook 只能作为显式声明的回退，禁止让一个慢加载的 active 世界书反向覆盖已确定的项目世界书。显式传入的全局 worldbookId 也必须被精确加载，不得静默换页。Evidence: `docs/agent-runs/settings-linkage-closure-20260912.md`（active 慢请求反向覆盖、显式全局 ID 未加载，两例均由独立验收抓出）。
4. **异步竞争保护落在副作用 owner**：页面级请求令牌不能证明安全——激活/写入的真实 owner 必须在写入前复核「仍是这本书/这张图/这个 revision」，过期响应拒绝而不是覆盖。判断方法：顺着调用链找到唯一执行 `setItem/updateWorldbook/activate` 的模块，在那里加复核；页面令牌只做展示层防抖。Evidence: 同上回执；另见 `docs/agent-runs/nightly-20260913/c-ux-20260914/`（stale 回应不覆盖新素材/新章）。
5. **删除/失效联动**：删除被引用的世界书/条目后，消费方（引用选择器、冻结推演、地图绑定）必须在下一次请求前拒收或显式失效，不等到渲染时报错；冻结推演对正文/设定变更保持 stale 语义，不得把过期结果当 fresh 继续。Evidence: settings-linkage Gate 20/20 中的删除失效与推演 stale 用例。
6. **Verify** the affected paths: import preview, conflict handling, active-worldbook selection. If context injection changed, run one generation smoke test——先声明它证明什么：离线合同 smoke 证明结构接线，不证明模型质量；真实渠道调用是独立决定，不因 skill 提到 smoke 就自动发起付费请求或读取更多凭据。
6.5. **同名冲突策略**（guide §3）：替换 / 重命名 / 同名新建三选一时必须显式选，禁止默认行为；覆盖前显示现有 vs 导入的条目数变化。
7. **Three import paths** must remain working: preset import, novel-text import, AI-driven (说明驱动) generation. If any is broken, the change is not done.
8. Update `docs/STATUS.md` when workflow or behavior changed (delegate to `docs-status-handoff`).
