# A3 职责前后表(修正树 37e0679 → afca9c4)

| 职责 | 迁移前 owner(页面) | 迁移后 owner | 生产调用入口 |
|---|---|---|---|
| 触发(输入/停驻/dwell) | schedulePassiveWritingSuggestion + onNotebookInput 尾部 + selection handler 内联 | host.schedule/notifyEditorInput/handleSelectionMoved/scheduleCursorDwell | onNotebookInput、onNotebookSelectionChange |
| 取消(光标移动) | syncCopilotCursorFromEditor 两处内联 | host.cancelForCursorMove/syncCursor(cancelOnMove) | 选区/粘贴路径 |
| 取消(IME) | writingCompositionActive 页面双写 + 3 handler | host(注入 ref)+ notifyComposition* | onNotebookCompositionChange |
| 取消(作用域/接管/Esc) | copilotCancel ×9 散布 | host.cancelForScopeChange/ForToolTakeover/notifyDismiss | 各切换/接管/Esc 处 |
| 取消(历史/粘贴/滚动/菜单) | suppressWritingAgent ×10 散布 | host.notifyHistory/Paste/UserScroll/CommandMenu/ContextMenuOpen/Blur | 各事件处 |
| 互斥仲裁 | 页面 computed+watch(L6983) | host.interactionOwner | gate、模板、workflow signals |
| 采纳提交(插入→信任 consume→回退) | acceptWritingSuggestion 内联 + acceptingInlineSuggestion 页面标志 | host.commitAdoption + isAdoptionInFlight | acceptWritingSuggestion(编辑器路径) |
| 主来源读取 | getSnapshot 与调度 payload 两份 | 页面 readWritingAgentSource 窄接口共用 | host.buildAgentInput 注入 + agent.getSnapshot |
| 显式参考 | copilotReferenceAsset 裸 ref + 散点清除 | useAuthoringReferenceSource | select/clear 调用点、scope watcher、readForScope 两处装配 |
| 历史协调/Ghost 域/编辑器事务 | 原 owner(未动) | 同左;接缝经 commitAdoption hooks 显式参与 | — |

## 量化(37e0679 → afca9c4)

- Authoring.vue:12,823 → 12,816(净 -7;删除同步/调度函数体 -105,新增注入装配/hook 化采纳 +98;减行不是验收指标)
- services 死代码:writingAgentReferences.js + writingAgentContext.js 共 -1,014 行(重证明后删除)
- 页面行内请求直调点:cancel×9+suppress×10 → 0(host 注入对象内内核绑定除外)
- 页面采纳标志变量:acceptingInlineSuggestion 删除(host.isAdoptionInFlight 唯一)
- 新模块:useInlineWritingAgentHost(216 行)+ useAuthoringReferenceSource(57 行);反向调用页面 0

## 剩余最重领域与下一刀入口

1. getWritingAgentPageContext(≈110 行,上下文装配):先收敛 context-source 对象再迁出。
2. 跨工具关闭顺序散点(A12 partial 记录)。
3. quickWord fallback 光标读取(quickWord 域,与后续输入路由合并处理)。
