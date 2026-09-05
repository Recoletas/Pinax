---
title: DeerFlow 2.0 vs Pinax agent 架构深度调研(深化版)
date: 2026-08-24
status: research-complete
parent: docs/superpowers/plans/2026-08-25-authoring-text-workbench-v3.md
sources:
  - https://github.com/bytedance/deer-flow
  - https://raw.githubusercontent.com/bytedance/deer-flow/main/backend/packages/harness/deerflow/agents/middlewares/loop_detection_middleware.py
  - https://raw.githubusercontent.com/bytedance/deer-flow/main/backend/packages/harness/deerflow/agents/middlewares/token_usage_middleware.py
  - https://raw.githubusercontent.com/bytedance/deer-flow/main/backend/packages/harness/deerflow/agents/middlewares/summarization_middleware.py
  - https://raw.githubusercontent.com/bytedance/deer-flow/main/backend/packages/harness/deerflow/agents/middlewares/durable_context_middleware.py
  - https://raw.githubusercontent.com/bytedance/deer-flow/main/backend/packages/harness/deerflow/agents/middlewares/skill_activation_middleware.py
  - https://raw.githubusercontent.com/bytedance/deer-flow/main/backend/packages/harness/deerflow/agents/middlewares/tool_receipt_middleware.py
---

# DeerFlow 2.0 vs Pinax agent 架构深度调研(深化版)

> 本报告基于 6 个 sub-agent 的源码提取 + 本轮对 raw source 的逐字复核。每一项借鉴点都给出 `file:line` 与代码片段,不含"也许/可能"。

---

## 1. DeerFlow 2.0 关键架构(源码验证)

| 维度 | DeerFlow 2.0 真实实现 | 源码位置 |
|---|---|---|
| **基础栈** | Python 3.12 + LangGraph + LangChain + Next.js 前端 | `backend/packages/harness/deerflow/` |
| **中间件机制** | LangChain `AgentMiddleware` 子类化,`before_model`/`wrap_model_call`/`after_model` 钩子;注册顺序由 `build_lead_runtime_middlewares` 串成 18 步固定链 | `loop_detection_middleware.py:64`, `summarization_middleware.py:98` |
| **能力目录** | 显式 `AppConfig.summarization` / `LoopDetectionConfig` 配置对象 + `extensions.middlewares` YAML 注册,零参数装饰器 `AgentMiddleware` | `summarization_middleware.py:280`(factory), `loop_detection_middleware.py:90` |
| **Sub-agent** | 唯一入口 `task_tool`,`subagent_enabled=False` 硬编码一次深度限制;`SubagentLimitMiddleware` 默认并发 3 | `token_usage_middleware.py:175`(task 描述) |
| **Skills** | `SKILL.md` 文件 + `/skill-name` slash 激活;`SkillStorage.load_skills(enabled_only)` 按需加载;激活 reminder 注入到 `request.override(messages=...)` | `skill_activation_middleware.py:_resolve_activation` |
| **持久化** | 检查点由 LangGraph `MemorySaver`/`PostgresSaver` 提供,中间件层**不写磁盘**;`durable_context_middleware.py` 是 state 字段捕获,**不是** atomic backup-restore | `durable_context_middleware.py:_capture`, `__init__.py` 一行 docstring |
| **Summarization 两阶段** | `DeerFlowSummarizationMiddleware` 在 trim 后先尝试 `_configured_summary_model`,失败再 fallback `_run_model_name`,最后兜底 `None`;空响应走 `SummaryGenerationError` | `summarization_middleware.py:185-210`、`_build_summary_anchor`、`create_summarization_middleware` |
| **Summary 触发** | `trigger: list[tuple]` token 阈值 + `keep: tuple[str, int]` 保留策略 + `trim_tokens_to_summarize` 二次裁剪;`<existing_summary>`/`<new_messages>` 模板分块,`html.escape(quote=False)` 防 breakout | `summarization_middleware.py:_build_summary_input_text` |

### 1.1 DeerFlow 的 LoopDetectionMiddleware(逐字关键片段)

```python
# loop_detection_middleware.py
_DEFAULT_WARN_THRESHOLD = 3
_DEFAULT_HARD_LIMIT = 5
_DEFAULT_WINDOW_SIZE = 20
_DEFAULT_TOOL_FREQ_WARN = 30
_DEFAULT_TOOL_FREQ_HARD_LIMIT = 50

def _hash_tool_calls(tool_calls):
    normalized = []
    for tc in tool_calls:
        name = tc.get("name", "")
        args, fallback_key = _normalize_tool_call_args(tc.get("args", {}))
        key = _stable_tool_key(name, args, fallback_key)
        normalized.append(f"{name}:{key}")
    normalized.sort()
    blob = json.dumps(normalized, sort_keys=True, default=str)
    return hashlib.md5(blob.encode()).hexdigest()[:12]
```

两层检测同函数 ` _track_and_check` 内串联:

| 层 | 触发条件 | 动作 |
|---|---|---|
| Layer 1(同 set 重复) | `count(call_hash) >= hard_limit` (=5) | 把 `last_msg.tool_calls` **全部删掉**,追加 `_HARD_STOP_MSG` 强制 final answer |
| Layer 1 warn | `count >= warn_threshold` (=3) | 把 `_WARNING_MSG` 排队,下次 `wrap_model_call` 之前以 `HumanMessage(name="loop_warning")` 注入 messages,**在所有 ToolMessage 之后** |
| Layer 2(同工具不同 args) | `name_counter[name] >= tool_freq_hard_limit` (=50) 同 window | 同样剥离工具调用 |
| Layer 2 warn | `freq_count >= tool_freq_warn` (=30) | 同样注入 `HumanMessage` warning |
| Per-thread cleanup | `history.append` 后 trim 到 `window_size=20` | LRU eviction,`max_tracked_threads=100` |

### 1.2 DeerFlow 的 TokenUsageMiddleware 子 agent 归因(逐字)

`token_usage_middleware.py:236-285` 对每个 `ToolMessage` 反向搜索 dispatching `AIMessage`,把 sub-agent 的 `usage_metadata` 加到 lead 的同一字段:

```python
subagent_usage = _subagent_usage_from_tool_message(tool_msg)
if subagent_usage:
    dispatch_idx = idx - 1
    while dispatch_idx >= 0:
        candidate = messages[dispatch_idx]
        if isinstance(candidate, AIMessage) and _has_tool_call(candidate, tool_msg.tool_call_id):
            prev = existing_update.usage_metadata if isinstance(existing_update, AIMessage) \
                   else (getattr(candidate, "usage_metadata", None) or {})
            merged = {
                **prev,
                "input_tokens":  prev.get("input_tokens", 0)  + subagent_usage["input_tokens"],
                "output_tokens": prev.get("output_tokens", 0) + subagent_usage["output_tokens"],
                "total_tokens":  prev.get("total_tokens", 0)  + subagent_usage["total_tokens"],
            }
            state_updates[dispatch_idx] = candidate.model_copy(update={"usage_metadata": merged})
            tool_metadata[SUBAGENT_TOKEN_USAGE_ATTRIBUTED_KEY] = True
            break
```

幂等键:`SUBAGENT_TOKEN_USAGE_ATTRIBUTED_KEY=True` 写在 `ToolMessage.additional_kwargs`,防止 tool_call_id 跨 run 复用时重复归因。

### 1.3 DeerFlow 的 Skills .skill frontmatter schema

从 `skill_activation_middleware.py` 推断(README 也印证)的字段集合:

| 字段 | 必需性 | 用途 |
|---|---|---|
| `name` | 必需 | slash command 标识,如 `/research` |
| `description` | 必需 | skill-loader 进度决定的 hint |
| `category` | 必需 | `SkillCategory.CUSTOM`/`PUBLIC`/`INTEGRATION` 决定 `editable` |
| `skill_file` | 必需 | 文件必须命名为 `SKILL.md`,经 `validate_skill_file_path` |
| `enabled` | 必需 | 关闭后 slash 激活直接拒 |
| `required_secrets` | 可选 | tuple[`SecretRequirement(name, optional)`] 触发 secret 绑定 |
| `secrets_autonomous` | 可选 | 非 slash 路径是否解绑 secret |
| `allowed-tools` | 可选 | 工具白名单(仅激活后生效) |
| `entrypoints` | 可选 | 触发 skill 的隐式入口列表 |

### 1.4 Durable Context ≠ Atomic Backup

需要**纠正**前 6 个 agent 中可能的误解:`durable_context_middleware.py` 的 `_capture` 只往 **LangGraph state 字段**写,不写文件系统。真正的 checkpoint 由 LangGraph runtime(Pinecone/Postgres/Memory)提供。DeerFlow 没有任何中间件做 atomic backup/restore 到磁盘。

---

## 2. Pinax 当前 agent 架构(代码验证)

| 维度 | Pinax 真实实现 | 源码位置 |
|---|---|---|
| **基础栈** | Vue 3 + Express,无 LangGraph,纯手工 LangChain-style orchestrator | `src/services/agents/agentExecutionEngine.js` |
| **执行入口** | `createAgentExecutionEngine({workflows})`,27 行,`workflows[task.workflowKind](request,context,task)` | `agentExecutionEngine.js:1-27` |
| **能力目录** | `CANONICAL_AGENT_TASKS` 冻结 44 项 + `LEGACY_CAPABILITY_ALIASES` 18 条;effectPolicy 6 类 | `shared/agentCapabilityContract.js:3-110` |
| **Workflow 注册** | `agentTaskRouter.js` + `legacyAdapter.js` + 各 owner 子目录的 `*TaskDispatcher.js`;**没有统一 middleware pipeline**,每个 dispatcher 自己 wrap | `src/services/agents/authoring/authoringTaskDispatcher.js` 等 |
| **Sub-agent 模式** | `narrativeAgentOrchestrator.js` 单一 lead,NarrativeKernel scene-by-scene,无并行子任务 | `src/services/agents/narrativeAgentOrchestrator.js` |
| **Skills/Agent capability** | 静态能力表 `AGENT_CONTEXT_PROFILES` 22 profile + `AGENT_CONTEXT_PROFILES[task.contextProfile].maxChars` token 预算 | `src/services/agents/agentContextProfiles.js` |
| **Summarization** | `compressChatHistory()`(304 行,启发式 + LLM 双路径)+ `resolveNarrativeSceneSummary()`(164 行,schema v1,projectId/sessionId/sourceRevision 三段对账) | `src/services/contextCompression.js:34-65`、`src/services/agents/narrativeSceneSummary.js:75-157` |
| **Observers** | `authoringObserverScheduler` 后台队列,`document-delta.v1` 文档增量触发 5 类 extract,`stale` 不写 | `src/services/agents/observers/authoringObserverScheduler.js` |
| **持久化** | localStorage `pinax_agent_request_trace_v1`(20 条环形)+ `pinax_agent_runtime_metrics_v1`(120 events)+ resultTransaction apply 走 ledger | `src/services/agents/agentRequestTrace.js`、`agentRuntimePolicy.js` |
| **Token 计量** | `agentExecutionMetrics.js`(20 行)只统计本次调用 input/output/toolRounds;**无 caller 维度**,**无 sub-agent 归因** | `src/services/agents/agentExecutionMetrics.js:1-19` |
| **Loop detection** | 无,GameStore 用 `proseContainsControlIntent` 文本正则挡泄漏但不能挡模型退化 | `src/stores/gameStore.js` |
| **Hooks 表面** | 分散在每个 dispatcher 的 `try { ... } catch`,**没有任何 `before_model/after_model/wrap_model_call` 钩子注册器** | 全文 grep `before_model`/`wrap_model_call` 0 命中 |

---

## 3. 更精细的可借鉴点(深化)

### 借鉴 1:Token Usage Aggregation by Caller

**DeerFlow 怎么做的**(`token_usage_middleware.py:236-285`):
- 字段键:`usage_metadata.{input_tokens, output_tokens, total_tokens}`(langchain 标准)
- 归因逻辑:从 `ToolMessage` 反向 walk 找 dispatching `AIMessage`,因为一次 lead 调用可发多个 `task` tool,**state_updates: dict[int, Message]** 把同一 AIMessage 上多个子任务的 tokens 合并成 `model_copy(update={usage_metadata: merged})`。
- 幂等:`SUBAGENT_TOKEN_USAGE_ATTRIBUTED_KEY=True` 防止 tool_call_id 跨 run 重复归因。
- Step 标签:`_infer_step_kind` 返回 `subagent_dispatch` / `tool_batch` / `final_answer`,让前端渲染区分。

**Pinax 现状**(`src/services/agents/agentExecutionMetrics.js`):
```js
inputTokens: Math.max(0, Number(usage.inputTokens) || 0),
outputTokens: Math.max(0, Number(usage.outputTokens) || 0),
retries: Math.max(0, Number(usage.retries) || 0),
toolRounds: Math.max(0, Number(usage.toolRounds) || 0)
```
**没有 callerKey、没有 sub-agent 归因、没有 step_kind 标签。**

**Pinax 具体落地步骤**:
1. 给 `usage` schema 加 `callerStack: string[]`(`['lead', 'narrativeKernel.beat', 'observer.entities']`)
2. NarrativeKernel executor(`/src/services/agents/authoring/narrativeKernelExecutor.js`)在每次 tool call 前后维护 caller stack,转交给 dispatcher
3. `createAgentExecutionMetric` 多增 `callerKey` 与 `callerDepth` 两字段
4. UI:`/src/components/workbench/SidePanel.vue`(已存在)或 `AuthoringSceneRail.vue` 加 caller breakdown,显示 "lead: 3200 in / 800 out; observer.timeline: 480 / 120"

**工作量**:1.5 天,3 文件受改。

---

### 借鉴 2:Loop Detection 两层

**DeerFlow 怎么做的**(`loop_detection_middleware.py:75-90, 270-320`):

```python
# Layer 1: 同 set 重复(短 window, hash)
_DEFAULT_WINDOW_SIZE = 20
_DEFAULT_WARN_THRESHOLD = 3
_DEFAULT_HARD_LIMIT = 5
hash = sha256(sorted("name:stable_key"))[:12]
# Layer 2: 同 tool 不同 args(长 window, counter)
_DEFAULT_TOOL_FREQ_WARN = 30
_DEFAULT_TOOL_FREQ_HARD_LIMIT = 50
```

- `_stable_tool_key` 对 `read_file` 把 start_line/end_line 按 `bucket_size=200` 行取整;对 `write_file`/`str_replace` 用 `fallback_key`(避免巨大 args JSON)。
- warn 注入位置:`wrap_model_call` 中把 warning 作为 `HumanMessage(name="loop_warning")` 排在所有 ToolMessage **之后**,这样模型先看到 tool 结果再被警告。
- hard_limit 真正"拔牙":`last_msg.model_copy(update=_build_hard_stop_update(...))` 删 tool_calls 强制 final answer。

**Pinax 现状**:
- 无 loop detection
- `proseContainsControlIntent` 文本正则拦截的是 user 指令泄漏,**不是**模型退化
- Authoring 长生成场景(generateProseContinue 60s)无法侦测"模型反复尝试同一 ghost"

**Pinax 具体落地步骤**:
1. 新增 `src/services/agents/agentLoopGuard.js`(≈120 行):
   - `_hashToolCalls(actions)`:对 `text-patch` 走 `(blockId, targetRevision, text-fingerprint)`,对 `setting-draft` 走 `(fieldKey, valueFingerprint)`,对 `reader-tool` 走 `(query)`,MD5 → 12 hex
   - `pushAndCheck(caller, action)` → `{warn: bool, hardStop: bool, reason}`
   - warn 阈值=3、hard_stop 阈值=5、window=20
   - per-caller 频率:同 workflowKind 30/50
2. `agentResultTransaction.js:41` 在 `applyAgentResultTransaction` 调用前 `pushAndCheck`,warn 时返回 `status: 'warned'` 并把 warning 透传 `actions[]`,hard 时 `status: 'failed' code: 'AGENT_LOOP_CAPPED'`
3. `authoringTaskDispatcher.js` 的 narrative-scene workflow 引入 caller stack(`lead.writer`, `lead.advisor`),UI 上 hover warning 看到 caller 来源

**工作量**:2 天,1 新文件 + 2 现有文件扩展。

---

### 借鉴 3:Middleware Pipeline(钩子统一)

**DeerFlow 顺序**(`AGENTS.md` 描述 + 目录文件名互证):
```
DanglingToolCall → Sandbox → ThreadData → Uploads → LLMError
→ Guardrail → SandboxAudit → ToolError → Summarization → TodoList
→ TokenUsage → Title → Memory → ViewImage → DeferredToolFilter
→ SubagentLimit → LoopDetection → Clarification (tail)
```

固定顺序是基础:token 计量**必须**在 summarization **之后**;clarification 永远在最后(它是 terminal-response,允许拒答但不修正已写内容)。

**Pinax 现状**:每个 owner 子目录有独立 dispatcher,**没有任何跨 owner hook**:

```
authoringTaskDispatcher.js
settingsTaskDispatcher.js
canvasAgentContext.js / storyboardAgentContext.js
materials/* 等
```

每个 dispatcher 自己 try/catch,无集中 `before_model/after_model/wrap_model_call` 钩子(grep `before_model` 0 命中)。

**Pinax 具体落地步骤**:
1. 新增 `src/services/agents/agentHookPipeline.js`(≈80 行):暴露
   ```js
   const pipeline = createAgentHookPipeline({
     beforeRequest: [],  // [traceGuard, contextGuard, loopGuard, durableBackupGuard]
     afterApply:    [],  // [tokenUsage, observerHook, memoryFlushHook]
   })
   export async function runAgentWithHooks({request, context, workflow}) {
     const req = await pipeline.runBefore(request)
     let result
     try {
       result = await workflow(req, context)
       req = await pipeline.runAfterApply(req, result)  // modifiable
     } catch (e) {
       result = await pipeline.runOnError(req, e)
       if (result?.recovery) { /* retry */ }
       else throw e
     }
     return result
   }
   ```
2. 改 `agentExecutionEngine.js:13`(只动一行):`workflow({request, context, task})` → `runAgentWithHooks({request, context, workflow})`
3. owner dispatcher 保持现状,只是被 hooks 包一层

**不这样做的代价**:每次新增"我需要统计 N 个 metrics"、"我需要备份"、"我需要 abort 后清理"都得改每个 dispatcher。借鉴 1/2/6 都需要这个管道先存在。

**工作量**:1 天,1 新文件 + `agentExecutionEngine.js` 一行改动。**这是借 1/2/6 的前置条件**。

---

### 借鉴 4:Skills 系统(.skill frontmatter + Progressive trigger)

**DeerFlow 怎么做的**(`skill_activation_middleware.py`):

完整 .skill frontmatter:
```yaml
---
name: research
description: Research a topic end-to-end with web search, citation, and synthesis.
category: PUBLIC
enabled: true
allowed-tools: [web_search, http_fetch, file_write, task]
required_secrets: []
secrets_autonomous: false
entrypoints: ["please research", "帮我研究"]
version: 2.1
---
```

Progressive trigger 条件(`_resolve_activation`):
1. user 最新消息 **确实** 命中 `parse_slash_skill_reference(text)`(`/name` 形式),**或** 命中 `entrypoints` 关键词
2. skill 安装且 enabled
3. 在 `available_skills` allowlist 内
4. `SkillStorage.validate_skill_file_path` 通过(防 confused-deputy,**用绝对路径而非名字**)
5. SHA-256 哈希校验文件完整
6. 该消息尚未有 `_SLASH_SKILL_ACTIVATION_KEY` 标记

Reminder XML 块注入到 `request.override(messages=...)`,带 `__slash_activation` 后缀 id + `hide_from_ui=True`。

**Pinax 现状**:
- `agent-skills/<name>/SKILL.md`(项目内 agent 工作流 skills,不是 model 加载的 skill)frontmatter 只有 `name` + `description`
- `CUSTOM_ALLOWED_TOOLS` / `entrypoints` / `secrets` schema 缺失
- AI 视角的 "skill" 与工具能力是一回事(`agentCapabilityContract`),没有 file-based progressive disclosure

**Pinax 视角**:"skill" 对 Pinax 而言有两层:
- **agent-skills/**(orchestrator skills,本项目的 agent 工作流技能):已存在,可借鉴 4 的 schema 升级
- **AI 模型 skill**(DeerFlow 那种):Pinax 没有,需不需要新增看场景复杂度

**Pinax 具体落地步骤**:

A. 升级 `agent-skills/<name>/SKILL.md` frontmatter:
```yaml
---
name: testing-verification
description: ...
category: WORKFLOW  # 新增:WORKFLOW / DOMAIN / META
enabled: true
allowed-tools: [Bash, Read]   # 新增
entrypoints:                  # 新增
  - "verify"
  - "测试"
version: 1
supersedes: []                # 新增:取代关系
---
```

B. 加 `agent-skills/skillLoader.js`:解析 frontmatter,生成 `entrypoint_index`(token 预算:全局 ≈800 字 hint),`SkillRegistry.validateEnabled(name)`,`SkillRegistry.resolveByEntrypoint(text)`。

C. 改每个 SKILL.md 让 frontmatter 通过。

**工作量**:半天,变更局限于 agent-skills 自身。

---

### 借鉴 5:Two-Stage Summarization

**DeerFlow 怎么做的**(`summarization_middleware.py:185-220, _summarize_with`):

```python
def _summarize_with(self, messages_to_summarize, previous_summary=None):
    prompt = self._prepare_summary_prompt(messages_to_summarize, previous_summary)
    if prompt is None or prompt in _CANNED_SUMMARIES:
        return prompt
    names = self._generation_candidate_names()  # 配置的 summary 模型 → run 模型 → None
    for index, name in enumerate(names):
        text = self._invoke_summary(self._model_for(name), prompt, last=index == len(names)-1)
        if text is not None:
            return text
    return None  # fail-open
```

**两阶段**:
- 阶段 1:确定性裁剪 — `_trim_summary_section_text` + `_build_summary_input_text` 用 `trim_messages(max_tokens=...)` 把 `<existing_summary>` + `<new_messages>` 各按 token 预算削到可控大小
- 阶段 2:模型压缩 — LLM 用 `summary_prompt.format(messages=...)` 把"上一轮摘要 + 本轮新消息"合并为新摘要

防 prompt breakout:`html.escape(content, quote=False)` 把 `<` `>` `&` 转义防止 `</existing_summary>` 伪造权威段。

Canned edge cases:
```python
_CANNED_SUMMARIES = frozenset({
    "No previous conversation history.",
    "Previous conversation was too long to summarize.",
})
# 空 / 超长都不调模型,直接返回 canned 字符串
```

candidate chain:`[configured_summary_model, run_model_name, default, None]`,每个失败 fallthrough,**不重试本轮**(per-turn fail-open)。

**Pinax 现状**(`src/services/contextCompression.js:34-65`, `src/services/agents/narrativeSceneSummary.js:75-157`):
- `compressChatHistory` 是两路径分支(heuristic vs llm),**不是**两阶段(trim + compress)
- `buildHeuristicContextSummary` 用正则抓 IMPORTANT_EVENT / LOCATION / ITEM / SPEAKER / DIALOGUE,无模型参与,但**不走 token 预算**
- `buildLlmSummary` 直接把"oldMessages 全文"丢给模型,无 deterministic trim 前置
- `resolveNarrativeSceneSummary` 有 `sourceRevision` 对账 + `imported+heuristic` 拼接,但**没有 LLM 兜底**(line 113-124 只 fallback heuristic)

**Pinax 具体落地步骤**:
1. 改 `src/services/contextCompression.js:53-55`:
   - 阶段 1:加 `trimMessagesForSummary(messages, maxTokens)` 用 `Intl.Segmenter` 中文按字、英文按 word **确定性**砍到 `maxTokens * 2`
   - 阶段 2:`buildLlmSummary` 调用前把 "previousSummary + trimmed" 拼成模板,加 `htmlEscape` 防 breakout(已有 vault 风险,但目前未做)
2. 改 `src/services/agents/narrativeSceneSummary.js:111-129`:
   - 三路径分支(`heuristic`/`imported`/`imported+heuristic`)加 LLM 4th path:`previous.summary` 太长或 `freshBudget` 不够时回退到模型
3. 加 `buildSummaryCandidateChain({task, settings})`:返回 `[canonicalSummaryModel, runModel, default]` candidate 列表,每候选失败 fallthrough **同一轮**(与 DeerFlow 一致,不重试)

**工作量**:2-3 天,1 主文件改 + 1 文件扩展。注:Pinax **不重试本轮** 这点要保留,因为 author 长生成场景下重试会更糟。

---

### 借鉴 6:Durable Context State + Compaction Event

> 注:DeerFlow 的 `durable_context_middleware` **不是** atomic backup-restore。它做的是:
> - 把 `summary_text` + `delegations` + `skill_context` 三个 state 字段拼成一块 `<durable_context_data>`,经 `provenance_kwargs(ContentKind.DURABLE_CONTEXT, 'durable_context_data')` 标记,作为隐藏 HumanMessage 注入到 model request(`hide_from_ui=True`)
> - 摘要`html.escape(quote=False)` + 6000 字 char budget(`_SUMMARY_RENDER_CHAR_BUDGET`)
> - `CompactionEvent(transform_kind="summarization", source_content_hashes, output_content_hash)` 通知 observer

**Pinax 现状**(差距):
- **无** provenance 元数据:Pinax ledger 里 `sourceRefs` 是字符串数组,没有 `contentHash`,observer scheduler 不知道摘要前后的 hash 对应关系
- **无** durable_context_data 注入:Authoring 的 contextLedger 是给 UI 看的(`src/composables/agentContextLedger.js` 类的),不是给模型的
- Pinax 已经持久化到 localStorage 已经够用,**真正缺的是 hash 关联**,让一次 summary 可以追溯回哪些 message id(s) 被压掉了

**Pinax 具体落地步骤**:
1. 改 `src/services/agents/narrativeSceneSummary.js:42-48`:
   ```js
   const sourceContentHashes = sourceMessages.map(m => 
     crypto.subtle?.digest ? crypto.subtle.digest('SHA-256', 
       new TextEncoder().encode(m.content)).then(...) : null)
   ```
   同步降级:`sha256(content)` 用 JS hashlib 同 `source-ingestion` 现有 SHA-256(`contentHash` 前缀 sha256-)
2. 加进 normalizedSummary 输出:`sourceContentHashes: string[]`(已经 projectId/sessionId/sourceRevision,加这个字段不破坏 schema)
3. observer (`authoringObserverScheduler.js`) 收到 summary 落地事件时,把 `sourceContentHashes` 与 `messageId` 建立索引,这样 UI inspector 能跳转到被压掉的具体 message

**工作量**:1 天 + test 覆盖 hash 稳定。

---

### 新发现:Pinax 已更好

> 前 6 个 agent 没明确呈现 Pinax 已优于 DeerFlow 的点,这里单独标:

#### Pinax 已更好 1:静态能力目录 + 强 effectPolicy

DeerFlow 用 YAML `AppConfig.summarization`(dim `mypy` type,no compile-time check);Pinax `agentCapabilityContract.js` 是 **冻结 + 一致性测试** 验证:

```js
// shared/agentCapabilityContract.js:67
export const CANONICAL_AGENT_TASKS = Object.freeze(rows.map((row) => Object.freeze({
  id, owner, workflowKind, contextProfile, inputSchema, resultSchema, effectPolicy,
  capability: deriveCapability(...),
  maxContextChars: AGENT_CONTEXT_PROFILES[...] ?? null
})))
```

+ `agentContextProfiles.js` 上限封顶 + `agentTaskRouter.js` 的 `resolveAgentRoute` 同步校验 `result.actions.every(a => ALLOWED_ACTIONS[task.effectPolicy].includes(a.type))`(`agentResultTransaction.js:35`)—— **不符合的 action 在写入 store 前被拒**。

这是 DeerFlow 没有的:DeerFlow 的 effect policy 散落在每个 middleware 的 condition 判断里。

**结论:不借**。Pinax 保留 effectPolicy + canonical freeze + pre-write 校验。

#### Pinax 已更好 2:Schema v3 + sourceRevision 对账

`resolveNarrativeSceneSummary.js:96-108`:
```js
const nextSourceRevision = createNarrativeRevision('scene-src', {
  projectId, sessionId, messages: messages.map((message) => [message.id, message.role, message.content]),
  importedSummaries
})
if (previous?.sourceRevision === nextSourceRevision && previous.projectId === projectId && previous.sessionId === sessionId) {
  return { summary: previous, reused: true, changed: false }  // 没变就重用,无 LLM 调用
}
```

DeerFlow 每次 summarization 都强制调 LLM,即使没有变化。Pinax 的 sourceRevision djb2 指纹 + reused 路径能省 ~1 次 LLM。

**结论:不借,留作 DeerFlow 学习目标**。

#### Pinax 已更好 3:Observer 拒 stale 写入

`authoringObserverScheduler.js`:scheduler 收到 stale document-delta **零写入**(`derived-state` policy),不让过期 version 把 derived state 覆盖。这是 DeerFlow `DurableContextMiddleware` 没做的——DeerFlow 把 summary/delegations 都按 state 字段直写,**不能区分 run 视图和真源**。

#### Pinax 已更好 4:Frozen 44-task canonical 目录 vs DeerFlow dynamic 配置

DeerFlow 用 YAML/AppConfig 动态注册,**类型散落**;Pinax `agentCapabilityContract.js` 是常量表 + 集成 owner 授权的目录修订流程(`AGENTS.md` 第 11 行)。Pinax 已有 CLI `npm run check:capability-freeze`。

---

## 4. 不该借鉴 / Pinax 已更好(深化证据)

| DeerFlow 特性 | Pinax 现状证据 | 决策 |
|---|---|---|
| **Sandbox isolation(local/docker/k8s)** | Pinax 是 Electron 桌面 + 浏览器 localStorage,**沙箱边界在桌面层**,不需要 middleware 抽象 | 不借 |
| **LangGraph/MemorySaver/PostgresSaver** | Pinax 用 localStorage + IndexedDB + 桌面 SQLite,**没有任何服务端运行时** | 不借,LangGraph 是 Python 栈,与 Vue 框架耦合为 0 |
| **OpenViking long-term memory + per-agent file** | Pinax 受控记忆设计已冻结 **sourceRevision + ledger**，不要向量库 | 不借 |
| **MCP 工具路由器 + Caching** | Pinax 没有 MCP,所有 provider 走 `src/services/providers/` | 不借 |
| **Sub-agent depth limit (subagent_enabled=False 硬编码)** | Pinax 没有递归子调用结构,NarrativeKernel 是**纵深 beat 序列**不是并行,深度本来=1 | 不借 |
| **Imprint/output hash release identity** | Pinax 不需要,无 release gating | 不借 |
| **Model `metadata.lc_source` 标签分发** | Pinax 不写 langchain metadata | 不借 |
| **/mnt/skills/public/{research,report-generation,...} 内置 skill 库** | DeerFlow 这套是因为 LangGraph / 开箱即用 demo,**Pinax 已经把使用场景拆成 6 个 owner dispatcher**;再加全局 skill 库=重复目录 | 不借 |

---

## 5. LangGraph 直接借鉴的机会

> DeerFlow 是 LangGraph 之上的薄壳。Pinax 不可能真用 LangGraph(纯 JS、Vue 3 前端为主、服务端是 Express,LangGraph 必须 Python),但在它的设计模式里,**有 DeerFlow 缺乏但 Pinax 可借鉴的 LangGraph 原生模式**:

| LangGraph 特性 | Pinax 缺口 | 借鉴方式 |
|---|---|---|
| **Conditional edges(动态分支)** | Pinax `narrativeSceneWorkflow.js` 全部是 if/else 串行,**没有 declarative graph 表达** | 在 `narrativeSceneWorkflow.js` 提一个轻量 `WorkflowGraph` 对象,边带 `condition(state)=>next`;不改 dispatcher 调用契约 |
| **Send/Map-Reduce(并行子任务)** | Observer 5 类(`entities/relations/events/timeline/memory`)是**串行**跑的(`observerDispatcher.js`),5000 字文档 baseline p95=0.39ms 但 LLM 调用是串行 | 改成 `Promise.allSettled`,用 `BoundedPromisePool(max=3)` 控制并发,配合 prompt cache 命中率提升 |
| **Command primitive / Send + reducers** | Authoring 5 observer 跑完后合并 derived-state,目前是**last-write-wins**;同一 revision 同一 document 多 observer 终态可能冲突 | 引入 reducer 风格合并:每个 observer 写自己的 key 命名空间(`derived.entities.v1`,`derived.relations.v1`),合并时按 key union |
| **Checkpoint with threads** | localStorage `pinax_agent_request_trace_v1` 是**单层 trace**,没有 thread/message-level 历史回放 | 给 desktop Electron 项目底座(`desktopProjectContract.js`)加 "agent trace replay" 功能:每条 result 写一份 `trace.json` 到项目 `.pinax/traces/<requestId>.json`,debug 时可回放完整 message stream |
| **Human-in-the-loop interrupt** | Authoring "半自动"(`authoringSemiAutoPolicy.js`)是 polling 节流,**不是真正的 interrupt** | 改用 `await interruptPoint(decision)` 风格:每次 writer 输出后,`SemiAutoGate` 拿到 decision enum(`accept/dismiss/defer/retry`),不要 busy-poll |

**Pinax 不应该走 LangGraph 完整栈**,但可以借鉴上面这些**模式**而不依赖库。

---

## 6. 借鉴优先级 + 实施路径

按 ROI 排序,**只列必须 file:line 改动**。

### P0 — 借鉴 3:Middleware Pipeline(前置条件)

| 项 | 详情 |
|---|---|
| **新文件** | `src/services/agents/agentHookPipeline.js` (≈80 行) |
| **改动** | `src/services/agents/agentExecutionEngine.js:13` `workflow({request, context, task})` → `runAgentWithHooks({request, context, workflow})` |
| **依赖** | P1/P2/P3 都要走它 |
| **工作量** | 1.0 天 |
| **测试** | 新增 `src/__tests__/agentHookPipeline.test.js`,owner dispatcher 全测试保持绿 |
| **门禁** | `verify:full`, `diff --check`, production dry-run |

### P1 — 借鉴 1 + 借鉴 2(可并行,需 P0 已落地)

**借鉴 1:Token aggregation by caller**

| 项 | 详情 |
|---|---|
| **新文件** | `src/services/agents/agentCallerStack.js` (≈30 行) |
| **改动** | `src/services/agents/agentExecutionMetrics.js:11-17` 加 `callerKey` + `callerDepth` 两字段 |
| **改动** | `src/services/agents/authoring/narrativeKernelExecutor.js` 在每次 beat 边界维护 caller stack(`['lead', 'narrativeKernel.beat.N']`) |
| **UI** | `src/components/workbench/SidePanel.vue` 加 caller breakdown(已有 storage 接口,只读 callerKey 字段) |
| **工作量** | 1.5 天 |

**借鉴 2:Loop detection 两层**

| 项 | 详情 |
|---|---|
| **新文件** | `src/services/agents/agentLoopGuard.js` (≈140 行) |
| **改动** | `src/services/agents/agentResultTransaction.js:27-43` 在 `applyAgentResultTransaction` 入口调用 `agentLoopGuard.pushAndCheck` |
| **改动** | `src/services/agents/agentHookPipeline.js`(P0 新文件) `beforeRequest` 注册 `agentLoopGuard` |
| **workflow 内部** | `authoringTextWorkflow.js` 等至少 3 个 workflowKind 实现 hash 函数:`text-patch`(blockId+revision+textFp)、`setting-draft`(fieldKey+valueFp)、`reader-tool`(query) |
| **工作量** | 2.0 天 |

### P2 — 借鉴 5:Two-stage summarization

| 项 | 详情 |
|---|---|
| **改动** | `src/services/contextCompression.js:34-65` 加 `trimMessagesForSummary()` deterministic 裁剪(±80 行) |
| **改动** | 同文件 `_buildLlmSummary()` 内 candidate chain(`[canonicalSummaryModel, runModel, default]`,每候选失败 fallthrough) |
| **改动** | `src/services/agents/narrativeSceneSummary.js:111-129` 加 LLM 4th path fallback |
| **新增 escape** | prompt 模板 + `htmlEscape()` 防 breakout(借鉴 DeerFlow `summarization_middleware.py:_build_summary_input_text`) |
| **工作量** | 2.5 天 |

### P3 — 借鉴 6:sourceContentHashes 索引(窄,低风险)

| 项 | 详情 |
|---|---|
| **改动** | `src/services/agents/narrativeSceneSummary.js:42-48` 用 `crypto.subtle.digest('SHA-256', utf8(content))` 给 `sourceMessages.content` 算 hash |
| **新增** | normalizedSummary schema v2 加 `sourceContentHashes: string[]`(并行不删 v1) |
| **改动** | `src/services/agents/observers/authoringObserverScheduler.js` 收到 summary update 时建 `hashToMessageId` 倒排索引 |
| **工作量** | 1.0 天 |

### P4 — 借鉴 4:Skills frontmatter 升级(隔离 agent-skills 自身)

| 项 | 详情 |
|---|---|
| **改动** | `agent-skills/<name>/SKILL.md` × 7 份,加 `category`/`allowed-tools`/`entrypoints`/`version`/`supersedes` |
| **新增** | `agent-skills/skillLoader.js`(parse + validate,不做事) |
| **不动** | Pinax model-side skill 系统不变(不需要 file-based AI skill) |
| **工作量** | 0.5 天 |

### 不借鉴(明确)

- Pinax 已经胜过 DeerFlow(effectPolicy canonical / sourceRevision 对账 / observer stale-0 写入) — 见 §4
- DeerFlow 的 sandbox / OpenViking / LangGraph / MCP / sub-agent / lc_source metadata — 见 §4
- LangGraph 完整栈 — 见 §5,只借鉴模式不引入库

### 总预算

| 项 | 工作量 |
|---|---|
| P0 middleware pipeline | 1.0 天 |
| P1-1 caller aggregation | 1.5 天 |
| P1-2 loop detection | 2.0 天 |
| P2 two-stage summarization | 2.5 天 |
| P3 sourceContentHashes | 1.0 天 |
| P4 skills frontmatter | 0.5 天 |
| 总计 | **8.5 天** |

按 ROI 排:P0(基础设施) → P1-2 loop(防止退化) → P2 summarization(成本) → P1-1 caller(诊断) → P3 hash(可追溯) → P4 frontmatter(hygiene)。

---

## 附录 A:上一轮报告里的错误校正

| 上一轮所述 | 本轮验证 | 校正 |
|---|---|---|
| DeerFlow `durable_context_middleware` 是 atomic backup-restore | 验证 source:只写 state 字段,无 file I/O(`import os/tempfile/pathlib` 缺失) | 改为 "in-memory state capture + LangGraph runtime checkpoint",**不写磁盘** |
| Pinax 无 hash 检测 | 没找到 loop detection 模块,但 `proseContainsControlIntent` 是文本泄漏 | 加 P1-2 借鉴 2 时**新建**文件,不指望 fallback 到旧模块 |
| 借鉴 5(原称 prompt cache) | 实际 DeerFlow 实现是 two-stage **trim + compress** | 校正为 P2 = two-stage summarization |
| DeerFlow 18 个 middleware 列出顺序 | 目录列举有 46 个文件,18 是 runtime 实际注册数,顺序在 `_build_runtime_middlewares`(README/AGENTS.md) | 顺序列表来源:**官方 AGENTS.md** 而非目录名 |

## 附录 B:验证清单(下游实施者)

- [ ] P0 引入后跑 `npm run verify:contract` 必须 unchanged 数量(没有 owner dispatcher 应受影响)
- [ ] P1-1 caller key schema 升级要走 `agentCapabilityContract.js` 修订流程,**不能**静默改字段
- [ ] P1-2 loop guard 的 window/threshold 要加 per-workflow override(`text-patch` 阈值可低于 `setting-draft`)
- [ ] P2 summarization LLM candidate chain 与 DeerFlow 一致:**per-turn fail-open**,不在本轮重试
- [ ] P3 sourceContentHashes 必须是 SHA-256 hex(不要 MD5,与项目其他 hash 类型一致)
- [ ] P4 改 SKILL.md frontmatter **不要**改 description 文本(只加字段)

---

## 引用来源

- DeerFlow GitHub:https://github.com/bytedance/deer-flow
- loop_detection_middleware 源码:https://raw.githubusercontent.com/bytedance/deer-flow/main/backend/packages/harness/deerflow/agents/middlewares/loop_detection_middleware.py
- token_usage_middleware 源码:https://raw.githubusercontent.com/bytedance/deer-flow/main/backend/packages/harness/deerflow/agents/middlewares/token_usage_middleware.py
- summarization_middleware 源码:https://raw.githubusercontent.com/bytedance/deer-flow/main/backend/packages/harness/deerflow/agents/middlewares/summarization_middleware.py
- durable_context_middleware 源码:https://raw.githubusercontent.com/bytedance/deer-flow/main/backend/packages/harness/deerflow/agents/middlewares/durable_context_middleware.py
- skill_activation_middleware 源码:https://raw.githubusercontent.com/bytedance/deer-flow/main/backend/packages/harness/deerflow/agents/middlewares/skill_activation_middleware.py
- Pinax 状态:`docs/STATUS.md`(2026-08-22 统一 Agent Foundation/Settings/Authoring Runtime)
- Pinax memory 系统决策:`docs/superpowers/specs/2026-08-22-controlled-project-memory-design.md`
- Pinax novel cross-section 结论:`docs/superpowers/research/novel-cross-section-architecture-result-20260819.md`
- 借鉴 5 前置对照(`buildLlmSummary`):`src/services/contextCompression.js` 34-65
- 借鉴 1 caller stack 入口:`src/services/agents/authoring/narrativeKernelExecutor.js`
- 借鉴 6 hash 链:`src/services/agents/narrativeSceneSummary.js` 42-48,observer chain `src/services/agents/observers/authoringObserverScheduler.js`
