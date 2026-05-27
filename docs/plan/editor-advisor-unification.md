> 归档说明：本文件为历史专题说明，当前不作为日常执行入口；仅在改动对应模块时按需查阅。

# 08 - 编辑器与统一智能顾问

状态：已落地

> 该专题记录的第一阶段方案已按当前代码落地，实际实现以 `/api/advisor/task`、`/api/advisor/advice`、`AdvisorPanel` 结果卡片和写作页结果应用为准。

## 1. 问题判断

当前写作页的“内联自动补全”问题，不是单纯换一个更强的编辑器库就能解决。

先看当前事实：

1. 写作页编辑器本体是原生 `textarea`，只是在上面叠了一层 ghost text 视觉层来显示建议。
2. 当前补全在用户输入停顿后高频触发，目标是“直接生成下一段正文”。
3. 顾问组件曾保留 AI / OpenClaw 双模式，后续已收口为统一 OpenClaw 顾问；当时页面调用没有真正接通，也说明顾问架构本身需要收口。

因此当前核心问题有两层：

- 编辑器交互层太脆弱，ghost overlay 对高频补全要求过高。
- 智能任务定义太重，把“局部建议”做成了“直接续写正文”。

## 2. 技术路线判断

### 2.1 ProseMirror

不选。

原因：

1. 项目现在的写作主数据仍是纯文本 / Markdown，而不是结构化富文本文档。
2. 当前最痛的不是富文本 schema，而是稳定的局部建议、纠错和收线。
3. ProseMirror 迁移会迫使整个写作页的选区、格式、Markdown 同步、素材插入、章节保存逻辑一起重构，成本过高。

适用前提：

- 只有在未来明确要把写作页升级成真正的富文本文档模型、块级编辑、复杂节点和协作式编辑时，才值得再评估。

### 2.2 CodeMirror 6

可以作为第二阶段备选，但不是第一步。

原因：

1. 它比 ProseMirror 更符合当前“文本编辑器”而不是“富文档编辑器”的定位。
2. 它能更稳定地提供 selection、transaction、decoration、inline widget、lint/gutter 这类能力。
3. 如果未来确实要做更强的行内标记、局部替换、高亮诊断和稳定 suggestion widget，CodeMirror 6 是正确方向。

为什么不现在就上：

1. 当前用户真正痛的是自动补全本身，而不是 textarea 无法显示彩色装饰。
2. 现在直接迁移 CodeMirror 6，会把“任务语义错误”和“编辑器实现弱”两个问题绑在一起，风险太大。
3. 第一阶段完全可以先保留 textarea，把智能任务改成更稳的顾问任务，先验证产品方向。

### 2.3 聊天补全 API / OpenClaw 智能顾问

这是当前应选主方案。

原因：

1. 你现在想要的能力重点，已经从“强内联续写”转成“自动收线与纠错”。
2. 这类任务更适合做成结构化顾问动作，而不是直接插一段 ghost prose。
3. OpenClaw 已有服务端接入基础，且天然适合做一个统一智能顾问，而不是继续保留双后端切换。

最终决策：

- 第一阶段：保留当前 textarea 编辑器，移除顾问 LLM 模式，统一到 OpenClaw 智能顾问。
- 第二阶段：若统一顾问落地后，仍明显受限于 textarea 的行内交互能力，再迁移到 CodeMirror 6。
- 不进入 ProseMirror 路线。

前置边界：

- OpenClaw 是统一顾问的目标后端，但它依赖本地或可访问的 Gateway。
- 第一阶段 UI 不再暴露 AI / OpenClaw 双模式切换；若 Gateway 不可用，应给出明确错误和降级说明。
- 是否保留内部 fallback 作为调试能力，可后续实现时再定，不在规划层继续暴露成用户选择。

## 3. 产品定位重写

新的定位不是“写作页有个 Copilot 自动补全，再加一个聊天顾问”。

而是：

```text
一个统一智能顾问
  -> 自动收线
  -> 纠错与局部修复
  -> 章节体检
  -> 低频轻续写
```

能力优先级改成：

1. 自动收线。
2. 纠错和局部修复。
3. 章节级审阅。
4. 轻量补全。

“自动补全”不再是主能力，只保留为辅助手段。

## 4. 当前代码现状对结论的影响

### 4.1 写作页现状

- 编辑器是 `textarea` + ghost layer，而不是 CodeMirror / ProseMirror。
- 触发方式是输入停顿后自动生成。
- 接受方式是 `Tab` 采纳，`Esc` 忽略。
- 当前上下文会拼章节标题、当前光标窗口、世界书命中项、参考素材和纲要上下文。

这说明：

- 当前系统更像一个“简化版补全文本框”，不适合继续把复杂纠错任务硬塞进 ghost suggestion。

### 4.2 顾问现状

- 顾问 UI 是全项目复用的浮层面板。
- `useAdvisor` 已去掉 `openai` / `openclaw` 两种 backend，统一走 `/api/advisor/task`。
- 页面调用已改成动作对象 + 结构化结果，不再各自手写 `fetch('/api/openclaw/advice')`。

这说明：

- 现在删掉 LLM 模式、统一到 OpenClaw，不只是产品收口，也是顺手修顾问调用链的结构裂缝。

## 5. 第一阶段目标

第一阶段不换编辑器，只换智能交互模型。

### 5.1 要达成的结果

1. 顾问只保留一个后端：OpenClaw。
2. 顾问只保留一条调用链，不再由页面各自拼 `fetch('/api/openclaw/advice')`。
3. 写作主链路默认不再做高频自动续写。
4. 智能交互改成结构化任务：纠错、收线、审阅、轻续写。

### 5.2 不做的事

1. 不在第一阶段迁移 ProseMirror。
2. 不在第一阶段迁移 CodeMirror 6。
3. 不继续强化 ghost 补全为写作主能力。

## 6. 统一智能顾问的任务设计

建议把顾问任务拆成以下几类：

| 任务 | 作用 | 默认输出 |
|------|------|----------|
| `advisor.fix.selection` | 修正选区文字 | replacement + reason |
| `advisor.fix.paragraph` | 修正当前段落 | replacement + issues |
| `advisor.close.thread` | 自动收当前线索 | closure options 或 replacement |
| `advisor.review.chapter` | 对当前章节做体检 | issue list + action list |
| `advisor.continue.light` | 轻续一句 | short replacement |

其中：

- `continue.light` 只保留为显式触发。
- 默认自动触发只考虑低风险体检或问题提示，不直接插入正文。

## 7. 返回协议

不要继续让顾问返回自由散文，再由前端猜怎么应用。

建议统一成结构化 JSON：

```json
{
  "operationId": "advisor_task_...",
  "task": "advisor.fix.selection",
  "mode": "replace",
  "confidence": 0.87,
  "summary": "修正了指代混乱和一句重复铺陈",
  "targetRange": {
    "start": 120,
    "end": 168
  },
  "baseTextHash": "sha256-or-lightweight-hash",
  "replacementRange": {
    "start": 120,
    "end": 168
  },
  "replacement": "修正后的文本",
  "stalePolicy": "require-same-base-text",
  "issues": [
    {
      "type": "continuity",
      "severity": "medium",
      "message": "人物称谓前后不一致"
    }
  ],
  "actions": [
    {
      "label": "应用修改",
      "kind": "apply-replacement"
    }
  ]
}
```

这样前端就能明确区分：

- 这是直接替换。
- 这是给建议不替换。
- 这是收线动作，而不是润色。
- 这是针对哪个文本范围生成的建议，避免用户继续编辑后误应用到旧文本。

字段优先级：

- 第一阶段必须有：`task`、`mode`、`summary`、`replacement` 或 `issues`。
- 替换类任务建议尽早补：`targetRange`、`baseTextHash`、`stalePolicy`。
- `operationId`、`replacementRange` 可先写入协议但不要求第一版 UI 完整使用。

## 8. 架构方案

### 8.1 服务端

新增统一顾问 route，建议不要继续沿用只支持 `{context, question}` 的窄接口。

建议：

- 新增 `server/routes/advisor.js`。
- 输入改为 `{ taskType, context, target, options }`。
- 服务端统一调用 OpenClaw Gateway。
- 在服务端完成 prompt 选择、结构化解析、错误归一化。
- 新 route 作为 facade 存在，内部可以继续复用现有 OpenClaw service。

不建议：

- 继续让每个页面手写 `fetch('/api/openclaw/advice')`。
- 立即删除旧 `/api/openclaw/advice`。旧 route 可以先保留兼容，等页面迁完再清理。

### 8.2 前端 service 层

建议新增：

- `src/services/advisorTaskService.js`

负责：

- 统一请求 `/api/advisor/*`。
- 校验返回结构。
- 归一化错误。
- 区分 replace / review / closure / continue 四类输出。

### 8.3 composable 层

建议：

- 将 `useAdvisor` 重构为 `useUnifiedAdvisor` 或在原 composable 内去掉 backend 切换。
- 移除 `backend` 状态。
- 移除 `update:backend` 事件。
- 统一由 composable 管理历史消息、任务结果、应用动作。

### 8.4 写作页接入

写作页不再把顾问当成单独问答浮层，而应把它变成编辑器辅助层。

第一阶段建议在写作页增加四类入口：

1. 修正选中内容。
2. 修正当前段落。
3. 自动收当前线索。
4. 章节体检。

每个动作都应明确 target 范围：

- 当前选区。
- 当前句子。
- 当前段落。
- 当前章节。

### 8.5 当前 Copilot 的去向

不建议立刻删文件，但要改角色：

- `useCopilot` 从“默认自动续写”改成“弱补全或轻续写工具”。
- `autoTrigger` 默认关闭，或仅保留在极低频场景。
- ghost overlay 只保留给 `advisor.continue.light` 这类短建议。
- 纠错和收线结果不再走 ghost overlay，而走结果卡片 + 应用按钮。

## 9. UI 方案

### 9.1 AdvisorPanel 收口

需要做的事：

1. 去掉 AI / OpenClaw 切换按钮。
2. 标题改成统一智能顾问。
3. 快捷问题改成动作导向，而不是泛泛聊天问题。

建议快捷动作：

- 修正选中内容
- 修正当前段落
- 自动收线
- 章节体检
- 轻续一句

### 9.2 结果展示

建议分两类展示：

1. 可直接应用的替换建议。
显示 before / after 或 replacement 预览，附“应用 / 忽略”。

2. 不直接替换的审阅建议。
显示问题列表、优先级、建议动作。

### 9.3 写作页交互

第一阶段不需要复杂行内标记，先用这三种交互就够：

- 工具栏按钮。
- 选区上下文菜单。
- 顾问面板结果应用。

## 10. CodeMirror 6 的二阶段触发条件

只有在第一阶段完成后，仍满足下面任一条件时，才进入 CodeMirror 6 迁移：

1. 需要稳定的行内批注、下划线、问题高亮。
2. 需要多个建议同时挂在不同文本位置。
3. 需要更可靠的 selection / range transaction，而 textarea 已经难以维护。

如果进入第二阶段，方向也应明确：

- 迁 CodeMirror 6。
- 不迁 ProseMirror。

## 11. 实施顺序

### 第一步

- 停止强化现有自动补全。
- 在计划与实现层确认：顾问优先级高于补全。

### 第二步

- 新增统一顾问 service 和 server route。
- 去掉页面各自的 `openclawAdvice()` 手写 fetch。

### 第三步

- 改 `AdvisorPanel` 和 `useAdvisor`。
- 删掉 LLM/OpenClaw 双模式。
- 统一成 OpenClaw 智能顾问。

### 第四步

- 写作页接入四个主动作：选区纠错、段落纠错、自动收线、章节体检。
- `useCopilot` 改为弱补全。

### 第五步

- 补测试。
- 根据真实使用感受决定是否需要第二阶段的 CodeMirror 6。

## 12. 测试要求

至少补这些测试：

1. 顾问 route 请求 / 响应结构测试。
2. 前端 service 结构化解析测试。
3. 选区替换与段落替换测试。
4. 顾问面板单后端状态测试。
5. `useCopilot` 关闭自动触发后的回归测试。

上述测试已补齐并通过，对应文件见 `serverAdvisorTaskService.test.js`、`advisorTaskService.test.js`、`useAdvisor.test.js`、`advisorResultApplier.test.js`、`openclawService.test.js` 和 `useCopilot.test.js`。

## 13. 验收标准

| 验收项 | 目标 |
|--------|------|
| 顾问只保留 OpenClaw 一种模式 | 必须完成 |
| 页面不再各自手写 OpenClaw fetch | 必须完成 |
| 写作主链路默认不再高频自动补全 | 必须完成 |
| 自动收线 / 纠错成为主能力 | 必须完成 |
| 轻补全只保留为弱能力 | 必须完成 |
| 第一阶段不进入 ProseMirror | 必须完成 |
| 若未来迁编辑器，优先 CodeMirror 6 | 明确记录 |
