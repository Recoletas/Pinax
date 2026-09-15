# A7/A10/A11/A12 核验与证据(修正树 37e0679)

## A7 主副编辑面来源适配 — verified-existing

- 捕获时冻结身份 + TTL:`captureCurrentWritingSurface`/`consumePreparedIllustratorSource`(30s),且已作为能力注入 workflow(`captureWritingSurface:` L2494)。
- 按工具分发:助手/画师/校对/查找各有 dual→main 分支;只读副窗不借用被遮主栏。
- 迟到结果:task scope 门禁(getScopeKey=bookId|role|documentId)+ agent requestVersion。
- 读写分离:dualPane 只暴露只读 capture 能力;写入仅经主栏编辑器事务。
- 行内助手主栏专用:DualPane `:inline-suggestion-visible="false"`(grep=1)。

## A10 输入/选区/焦点路由 — absorbed by A1

agent 侧路由唯一(host);编辑器域(beforeinput 智能引号/通用组合守卫 isWritingCompositionKey)留原域。路由表见 a0 文档迁移后 owner 表。

## A11 书/章切换事务助手侧接缝 — verified-existing

selectChapter 顺序:块 composer 保护 → 保存失败拒切 → boundary 派生 → cancelChapterReview → host.cancelForScopeChange → resetRewriteState → clearCopilotReference → clearPendingPersist/dismissAuxiliary → scope 翻转(watcher 级联:二次取消幂等、referenceSource.clearIfScopeChanged、manifest/回执/pinned/excluded 清理、notebookSelection 清空)→ 载入新章 + loadChapterSnapshots。旧请求/旧 selection/旧 ledger/旧 Ghost/旧参考均随作用域失效;无双 controller。

## A12 右栏工具可见性与输入所有权 — partial(证据如下)

- 所有权语义已单源:`writingInteractionPolicy.js`(resolveWritingInteractionOwner/blocksPassiveInlineSuggestion);合法消费者=页面 gate、host 阻断 watch、Notebook 编辑器(L292/L960)。
- inspector 域互斥已集中:`selectInspectorTool`(dual prepareClose、scene-edit 重置、tab 绑定)。
- **未迁出**:各工具 open 函数内分散的关闭语句(谁关闭谁的顺序表)。入口=逐一把 open 函数的 closer 对照 interactionOwner signals 对齐后收敛为窄策略表;不为其制造新抽象。
