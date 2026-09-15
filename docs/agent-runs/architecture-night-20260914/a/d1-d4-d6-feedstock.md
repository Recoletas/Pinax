# A 线 D1/D4/D6 供稿(供 O 在集成树串行应用)

供稿树:`night/arch-a-20260914-fix` @ 修正提交(基线 37e0679)。公共文件在 O 写集,以下为建议补丁与事实依据。

## D4 current-architecture.md 更新(建议补丁)

文件:`docs/engineering/current-architecture.md`,清单第 14 条(≈L136),现文:

> 14. ⏭ 写作 Agent/inline suggestion:下一片整体迁出停驻触发、请求身份、取消/迟到响应、候选与失效状态,并保持 Ghost 采用和编辑器输入所有权边界。

建议替换为:

> 14. ✅ `useInlineWritingAgentHost` + `useAuthoringReferenceSource`:停驻/输入触发、光标与 IME 组合状态、互斥仲裁、语义取消(作用域/接管/历史/粘贴/滚动/菜单)、采纳提交顺序(peek→插入→信任 consume→不符回退)与显式续写参考(身份冻结/作用域绑定/请求前可用性)已收口为页面编排唯一 owner;`useWritingAgent` 只保留请求身份、timer 与候选内核;编辑器事务、原子历史与 Ghost 采用边界保持原 owner(2026-09-15)。

事实依据:提交 afca9c4;authoringAgentWorkflows.test.js host 合同用例(合并7例,含 A17 故障 8–10);rehearsal-panel Gate 304/304;f2 33/33。

## D4 code-map.md 更新(建议补丁)

文件:`docs/src/code-map.md` L66,现文:

> Authoring的方向规划、上下文冻结、Ghost采用与因果排演归 `src/services/agents/authoring/`；行内补全由Notebook的ProseMirror实现承担，不再使用已退役的悬浮补全组件。

建议替换为:

> Authoring的方向规划、上下文冻结、Ghost采用与因果排演归 `src/services/agents/authoring/`；行内补全的请求生命周期与候选内核在 `src/composables/useWritingAgent.js`，光标/IME/触发调度/互斥仲裁与采纳提交在 `src/composables/useInlineWritingAgentHost.js`，显式续写参考在 `src/composables/useAuthoringReferenceSource.js`；ProseMirror 编辑器只承担文本事务与插入，不再有悬浮补全组件。

## D1 README 能力表述核对(A 域事实)

- L54 能力表"导入(TXT/Markdown 编码识别、DOCX/PDF)|可用"建议拆两行:TXT/Markdown 为书稿导入(浏览器 Gate 证据);DOCX/PDF 为设定来源导入(证据不同),避免读者把 DOCX 当书稿导入。
- L41"导入与首章写作无需任何密钥"与实现一致(行内联想无凭据时静默跳过;手动触发给出可操作提示)。
- L55 备份/诊断行与实现一致;建议补一句"恢复前会展示备份内容与覆盖范围"。

## D6 过期说明清单(A 域)

| 文件 | 内容 | 状态 | 建议 |
|---|---|---|---|
| `docs/src/code-map.md:66` | "行内补全由Notebook的ProseMirror实现承担" | 已过时(本次迁移后归属失真) | 按 D4 补丁替换 |
| `docs/engineering/current-architecture.md` 清单 14 | "下一片整体迁出…" | 已实施 | 按 D4 补丁标记完成 |
