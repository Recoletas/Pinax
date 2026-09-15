# A0 行内写作助手:消费者与生命周期图(修正树,基线 37e0679)

Authoring.vue = 12,823 行(修正后 12,816);useWritingAgent.js = 702 行。
共同基线已完成 Block/推演/干预/校对/搜索/持久化/导航等 14 项 workflow 抽取(current-architecture.md 清单 1–13),行内助手编排仍按清单第 14 条留在页面——A1 缺口确认存在。

## 状态 owner 现状(基线 37e0679)

已由 useWritingAgent 拥有:timer/requestVersion/requestController/activeFingerprint/lastRequestedFingerprint/dismissedFingerprint/suggestions/cooldown/lastReceipt/composing/卸载清理(与错误基线版一致,该 composable 在两基线间无变化)。

仍由页面持有(本线迁移对象,行号为 37e0679 树):
- `copilotCursorPos`(L1931)、`syncCopilotCursorFromEditor`(L11018,含 cancelOnMove)
- `writingCompositionActive`(L2427)+ 组合三 handler(L10906-10985)
- suppress 散布:blur 模板 L506、historyUndo/Redo ×4(L7338-7567)、paste/scroll/command-menu(L10958-10982)、context-menu(L11294)、owner watch(L7006)
- `copilotCancel()` 散布 ×9:doc 关闭 L2259/2305、推演入口 L4193、Ghost staging L5704、干预 L6271、saveScope watcher L7677、参考清除 L8483、切章 L9466/9487/9509
- `schedulePassiveWritingSuggestion`(L10989)、`writingInteractionOwner` computed+watch(L6983)
- workflow 注入缝:`cancelCopilot: () => copilotCancel()`(L5408)

## 迁移后 owner(A1/A2/A6,提交 afca9c4)

| 状态/逻辑 | 新 owner |
|---|---|
| 光标状态与同步/cancelOnMove | host.syncCursor/setCursor |
| 组合状态机 | host.notifyCompositionStart/End/Aborted |
| 语义取消/抑制(12 类) | host.notify* / cancelForScopeChange / cancelForToolTakeover / notifyDismiss |
| 触发调度与 dwell 策略 | host.schedule / handleSelectionMoved / scheduleCursorDwell / notifyEditorInput |
| 互斥仲裁 | host.interactionOwner + 阻断 watch |
| 采纳提交顺序 | host.commitAdoption(peek 留页面,满足共享断言) |
| 显式续写参考 | useAuthoringReferenceSource(select/clear/clearIfScopeChanged/readForScope) |

四类生成边界(普通行内/Block/IF/干预)与主副栏身份:主栏专用由 AuthoringDualPane `:inline-suggestion-visible="false"` 显式表达;`cancelCopilot` 注入缝改走 host 工具接管语义,workflow 合同不变。
