import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
const root = path.resolve(import.meta.dirname, '..')
export const assistantRuntimeFiles = ['runtime-extensions/assistantSession.js', 'runtime-extensions/assistantContinuation.js', 'shared/assistantEntryDetails.js', 'shared/assistantWritingMethods.js', 'runtime-extensions/assistantMethodTool.js', 'runtime-extensions/assistantManuscriptTool.js', 'runtime-extensions/assistantNarrativeExchange.js', 'runtime-extensions/requestModelTransport.js', 'runtime-extensions/assistantKnowledgeTool.js', 'runtime-extensions/assistantProposalTool.js', 'runtime-extensions/assistantNarrativeTool.js', 'runtime-extensions/assistantObservability.js', 'runtime-extensions/assistantTask.js', 'runtime-extensions/assistantWorkspaceTool.js', 'shared/assistantEditProposal.js', 'shared/assistantPermission.js', 'shared/requestModelConfig.js', 'shared/assistantUserInput.js', 'runtime-extensions/assistantSteering.js']
export function extendAssistantRuntime(directory) {
  const target = path.join(directory, 'dist/pinax')
  for (const file of assistantRuntimeFiles) fs.copyFileSync(path.join(root, file), path.join(target, path.basename(file)))
  const patch = (name, edits) => {
    let source = fs.readFileSync(path.join(target, name), 'utf8')
    for (const [before, after] of edits) {
      if (!source.includes(before)) throw new Error(`Pinned assistant extension anchor changed: ${name} ${before.slice(0, 70)}`)
      source = source.replace(before, after)
    }
    fs.writeFileSync(path.join(target, name), source)
  }
  patch('prompt.js', [
    ['import { NARRATIVE_TOOL_LIMITS }', 'import { assistantSystemPrompt, assistantUserPrompt } from "./assistantTask.js";\nimport { NARRATIVE_TOOL_LIMITS }'],
    ['export function buildSystemPrompt(req, toolNames, options = {}) {', 'export function buildSystemPrompt(req, toolNames, options = {}) {\n    if (req.taskKind === "assistant") return assistantSystemPrompt(req, toolNames);'],
    ['export function buildUserPrompt(req) {', 'export function buildUserPrompt(req) {\n    if (req.taskKind === "assistant") return assistantUserPrompt(req);'],
    ['export function buildResumePrompt(req) {', 'export function buildResumePrompt(req) {\n    if (req.taskKind === "assistant") return assistantUserPrompt(req);']
  ])
  patch('runner.js', [
    ['import { Agent }', 'import { assistantStreamOptions } from "./assistantObservability.js";\nimport { Agent }'],
    ['{ ...options, maxTokens: Math.max(200, Math.min(8000, req.maxTokens || 1600)), timeoutMs: budget.agentTimeoutMs }', 'req.taskKind === "assistant" ? assistantStreamOptions(req, context, options, listeners) : { ...options, maxTokens: Math.max(200, Math.min(8000, req.maxTokens || 1600)), timeoutMs: budget.agentTimeoutMs }'],
    ['toolName: event.toolName, result: event.result, isError: Boolean(event.isError)', 'callId: event.toolCallId, toolName: event.toolName, result: event.result, isError: Boolean(event.isError)'],
    ['import { Agent }', 'import { createAssistantTask, assistantCompletionText, assistantProviderFailure, assistantToolGuard, finishAssistantTurn } from "./assistantTask.js";\nimport { Agent }'],
    ['    const lookupTools = buildPinaxTools(snapshot, toolNames, toolHooks);', '    const lookupTools = buildPinaxTools(snapshot, toolNames, toolHooks);\n    const assistantTask = req.taskKind === "assistant" ? createAssistantTask(req, snapshot, frame => { for (const listener of listeners) listener(frame); }, restoreAssistantProposal(req, snapshot, opts), lookupTools) : null;\n    if (assistantTask) { for (const tool of assistantTask.tools) { const previous = lookupTools.findIndex(item => item.name === tool.name); if (previous >= 0) lookupTools.splice(previous, 1, tool); else lookupTools.push(tool); } }'],
    ['            // 单轮调用限额', '            if (assistantTask) {\n                const name = ctx.toolCall?.name || ctx.tool?.name || "";\n                return assistantToolGuard(assistantTask, name);\n            }\n            // 单轮调用限额'],
    ['                    if (text)\n                        finalText = text;', '                    if (text) {\n                        finalText = text;\n                        if (assistantTask) assistantTask.state.answerText += (assistantTask.state.answerText ? "\\n\\n" : "") + text;\n                    }'],
  ])
  // Narrative lookup budgets do not govern the interactive assistant.
  // Assistant work ends through pi completion, cancellation or an actual failure.
  patch('runner.js', [
    ['    const timer = setTimeout(() => ac.abort(new Error("PINAX_ADAPTER_AGENT_TIMEOUT")), budget.agentTimeoutMs);', '    const timer = assistantTask ? null : setTimeout(() => ac.abort(new Error("PINAX_ADAPTER_AGENT_TIMEOUT")), budget.agentTimeoutMs);'],
    ['        beforeToolCall: async (ctx) => {', '        finishTurn: turn => finishAssistantTurn(assistantTask, turn),\n        beforeToolCall: async (ctx) => {'],
    ['            // Some compatible models print', '            if (assistantTask) {\n                const failure = assistantProviderFailure(agent.state.messages);\n                if (failure) throw new Error(failure);\n                if (!assistantTask.state.delivery) throw new Error("助手未输出正式回答，已有内容已保留。");\n                finalText = assistantCompletionText(agent.state.messages, assistantTask.state.delivery, assistantTask.state.answerText);\n            }\n            // Some compatible models print'],
    ['textChars: finalText.length, finalText, beatPlan: runExtras.beatPlan, ...(capability ?', 'textChars: finalText.length, finalText, delivery: assistantTask?.state.delivery, proposalChanges: assistantTask?.state.proposal?.changes || [], beatPlan: runExtras.beatPlan, ...(capability ?'],
    ['status: "completed", finalText, messages: agent.state.messages, ...(capability ?', 'status: "completed", finalText, delivery: assistantTask?.state.delivery, proposalChanges: assistantTask?.state.proposal?.changes || [], nativeSession: agent.nativeSession, messages: agent.state.messages, ...(capability ?'],
    ['if (counters.steps >= budget.maxModelSteps) {', 'if (!assistantTask && counters.steps >= budget.maxModelSteps) {'],
    ['if (counters.steps >= budget.maxModelSteps - 1 || counters.toolCalls >= budget.maxCallsPerTurn) {', 'if (!assistantTask && (counters.steps >= budget.maxModelSteps - 1 || counters.toolCalls >= budget.maxCallsPerTurn)) {'],
    ['if (counters.turnToolFlags && counters.steps >= budget.maxModelSteps && agent.state.tools.length) {', 'if (!assistantTask && counters.turnToolFlags && counters.steps >= budget.maxModelSteps && agent.state.tools.length) {']
  ])
  patch('server.js', [['[...PINAX_TOOL_NAMES, "manuscript", "notes", "outline"]', '[...PINAX_TOOL_NAMES, "manuscript", "notes", "outline", "workspace"]'], ['const store = new TaskStore(cfg.tasksDir);', 'const store = new TaskStore(cfg.tasksDir);'], ['json(res, 200, { ok: true', 'json(res, 200, { assistantProtocolVersion: 2, assistantWorkspace: true, assistantNarrative: true, assistantSampling: true, assistantObservability: true, assistantKnowledge: true, ok: true']])
  patch('server.js', [
    ['import { applyModelPatch,', 'import { requestScopedRuntimeConfig } from "./requestModelConfig.js";\nimport { applyModelPatch,'],
    ['createRun(turn, cfg,', 'createRun(turn, requestScopedRuntimeConfig(cfg, turn.modelConfig),'],
    ['runComplete(cfg, validated.value,', 'runComplete(requestScopedRuntimeConfig(cfg, body.modelConfig), validated.value,'],
    ['runCompleteStream(cfg, validated.value,', 'runCompleteStream(requestScopedRuntimeConfig(cfg, body.modelConfig), validated.value,'],
    ['assistantProtocolVersion: 2,', 'assistantUserInput: true, requestModels: true, assistantProtocolVersion: 2,']
  ])
  patch('server.js', [
    ['                if (active.size >= 4)', '                if (turn.taskKind !== "assistant" && active.size >= 4)'],
    ['                    if (active.size >= 4)', '                    if (parsed.value.taskKind !== "assistant" && active.size >= 4)'],
    ['assistantUserInput: true, requestModels: true,', 'assistantWritingMethods: true, assistantNarrativeExchange: true, assistantNativeLoop: true, assistantTaskQuotas: false, assistantUserInput: true, requestModels: true,']
  ])
  // pi-ai requires block arrays for every assistant message, including plain drafts
  // sent back for revision. A string causes a local serializer error before any request.
  patch('runner.js', [
    ['import { Agent }', 'import { createAssistantSteering } from "./assistantSteering.js";\nimport { Agent }'],
    ['    let finalText = "";', '    const steering = createAssistantSteering({ agent, task: assistantTask, req, counters, budget, signal: ac.signal, emit: frame => { for (const listener of listeners) listener(frame); } });\n    let finalText = "";'],
    ['        switch (ev.type) {', '        switch (ev.type) {\n            case "message_start": steering.consumed(ev.message); break;'],
    ['        abort,\n        done: run,', '        abort,\n        steer: input => steering.enqueue(input),\n        narrativeResult: input => assistantTask?.exchange.accept(input),\n        done: run,']
  ])
  patch('server.js', [
    ['                if (req.method === "POST" && action === "cancel") {', '                if (req.method === "POST" && action === "narrative-result") {\n                    const input = JSON.parse(await readBody(req));\n                    const result = active.get(taskId)?.run?.narrativeResult?.(input) || { ok: false, error: "task-not-active" };\n                    return json(res, result.ok ? 200 : 409, result);\n                }\n                if (req.method === "POST" && action === "cancel") {'],
    ['                if (req.method === "POST" && action === "cancel") {', '                if (req.method === "POST" && action === "steer") {\n                    const input = JSON.parse(await readBody(req));\n                    const owner = active.get(taskId);\n                    const result = await owner?.run?.steer?.(input) || { ok: false, error: "task-not-active" };\n                    return json(res, result.ok ? 200 : 409, result);\n                }\n                if (req.method === "POST" && action === "cancel") {'],
    ['assistantUserInput: true,', 'assistantSteering: true, assistantUserInput: true,']
  ])
  patch('../llm.js', [
    ['import { createModels,', 'import { withRequestModelTransport } from "./pinax/requestModelTransport.js";\nimport { createModels,'],
    ['return withSystemFolding(models, profile);', 'return withRequestModelTransport(withSystemFolding(models, profile), t);'],
    ['return withSystemFolding(models, profile);', 'return withRequestModelTransport(withSystemFolding(models, profile), t);']
  ])
  patch('runner.js', [
    ['import { Agent }', 'import { cleanAssistantResumeHistory } from "./requestModelTransport.js";\nimport { Agent }'],
    ['return messages.slice(start);', 'return cleanAssistantResumeHistory(messages.slice(start));'],
    ['                // 能力任务：submit 回执', '                if (assistantTask && !event.isError && ["world_lookup", "manuscript", "manuscript_get", "manuscript_search", "notes", "notes_search", "outline", "outline_lookup", "knowledge", "workspace"].includes(event.toolName)) (assistantTask.state.references ||= []).push({ tool: event.toolName, result: event.result });\n                // 能力任务：submit 回执']
  ])

  // Reuse pi's shipped harness/session/compaction implementation for assistant
  // conversations. Narrative and capability runners retain their existing API.
  patch('runner.js', [
    ['import { Agent }', 'import { createAssistantSession } from "./assistantSession.js";\nimport { restoreAssistantProposal } from "./assistantContinuation.js";\nimport { Agent }'],
    ['    const agent = new Agent({', '    const makeAgent = options => assistantTask ? createAssistantSession(options, { models, tasksDir: cfg.tasksDir, req, task: assistantTask, signal: ac.signal, emit: frame => { for (const listener of listeners) listener(frame); } }) : new Agent(options);\n    const agent = makeAgent({'],
    ['messages: boundedResumeMessages(opts.resumeMessages)', 'messages: assistantTask ? cleanAssistantResumeHistory(opts.resumeMessages) : boundedResumeMessages(opts.resumeMessages)'],
    ['            clearTimeout(timer);', '            clearTimeout(timer);\n            await agent.close?.();']
  ])
  patch('server.js', [
    ['}, { resumeMessages });', '}, { resumeMessages, pendingProposal: initial.delivery?.outcome === "needs_input" ? initial.proposalChanges || [] : [], pendingRevision: initial.resourcesRevision });'],
    ['const persisted = { ...final, taskId,', 'const persisted = { ...final, resourcesRevision: turn.resources?.revision, taskId,'],
    ['assistantNativeLoop: true,', 'assistantNativeSession: true, assistantNativeLoop: true,']
  ])
  patch('server.js', [
    ['import { createRun }', 'import { compactAssistantConversation } from "./assistantContinuation.js";\nimport { createRun }'],
    ['                if (req.method === "POST" && action === "cancel") {', `                if (req.method === "POST" && action === "compact") {
                    const input = JSON.parse(await readBody(req));
                    const saved = store.load(taskId);
                    if (!saved || saved.bookId !== input.bookId || saved.taskKind !== "assistant") return json(res, 404, { ok: false, error: "task-not-found" });
                    if (active.has(taskId)) return json(res, 409, { ok: false, error: "task-already-running", message: "请等待当前任务结束后整理上下文。" });
                    const owner = {};
                    const controller = new AbortController();
                    owner.run = { abort: () => controller.abort() };
                    active.set(taskId, owner);
                    res.on("close", () => { if (!res.writableEnded) controller.abort(); });
                    owner.settled = Promise.resolve().then(() => compactAssistantConversation(requestScopedRuntimeConfig(cfg, input.modelConfig), saved, controller.signal))
                        .then(result => ({ status: "completed", result }), error => ({ status: controller.signal.aborted ? "cancelled" : "failed", error }))
                        .finally(() => { if (active.get(taskId) === owner) active.delete(taskId); });
                    const final = await owner.settled;
                    if (final.status === "completed") return json(res, 200, { ok: true, ...final.result });
                    return json(res, 409, { ok: false, error: final.status === "cancelled" ? "session-compaction-cancelled" : "session-compaction-failed", message: String(final.error?.message || final.error) });
                }
                if (req.method === "POST" && action === "cancel") {`]
  ])
  patch('modelFunnel.js', [
    ['maxTokens: request.maxTokens ?? 4096,', 'maxTokens: request.maxTokens ?? model.maxTokens,'],
    ['maxTokens: request.maxTokens ?? 4096,', 'maxTokens: request.maxTokens ?? model.maxTokens,'],
    ['if (message.role === "assistant" && message.toolCalls?.length) {', 'if (message.role === "assistant") {'],
    ['for (const call of message.toolCalls)\n', 'for (const call of (message.toolCalls || []))\n'],
    ['...(request.toolChoice !== undefined ? { toolChoice: request.toolChoice } : {})', '...(request.toolChoice !== undefined ? { toolChoice: model.api === "anthropic-messages" && request.toolChoice?.type === "function" ? { type: "tool", name: request.toolChoice.function.name } : request.toolChoice } : {})'],
    ['    const content = (message.content ?? []).filter', '    if (["error", "aborted"].includes(message.stopReason)) throw new Error("模型补全未完成：" + (message.errorMessage || message.stopReason));\n    const content = (message.content ?? []).filter'],
    ['return { ok: true, content, toolCalls: [], finishReason: content ? "stop" : "empty", usage: null, model: `${cfg.provider}.${cfg.model}` };', 'const message = await events.result();\n    if (["error", "aborted"].includes(message.stopReason)) throw Object.assign(new Error("模型补全未完成：" + (message.errorMessage || message.stopReason)), { generatedText: content });\n    return { ok: true, content, toolCalls: [], finishReason: message.stopReason || (content ? "stop" : "empty"), usage: message.usage ? { inputTokens: message.usage.input ?? 0, outputTokens: message.usage.output ?? 0, totalTokens: message.usage.totalTokens ?? 0 } : null, model: `${cfg.provider}.${cfg.model}` };']
  ])
  // complete() itself consumes stream(). Keep the provider transport wrappers
  // on the native stream entry points so both paths use identical payloads.
  patch('../llm.js', [[
    'for (const method of ["streamSimple", "complete", "completeSimple"])',
    'for (const method of ["stream", "streamSimple"])'
  ]])
  const funnelFile = path.join(target, 'modelFunnel.js')
  let funnel = fs.readFileSync(funnelFile, 'utf8')
  const completeStart = funnel.indexOf('export async function runComplete(cfg, request, signal) {')
  const streamStart = funnel.indexOf('export async function runCompleteStream(cfg, request, onDelta, signal) {')
  if (completeStart < 0 || streamStart <= completeStart || !funnel.slice(streamStart).trim().endsWith('}')) throw new Error('Pinned complete/stream function boundary changed')
  funnel = funnel.slice(0, completeStart) + `function prepareComplete(cfg, request, signal) {
    const models = makeModels(cfg);
    const model = resolveModel(models, cfg);
    const thinking = request.thinking ?? cfg.thinking;
    const options = {
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        maxTokens: request.maxTokens ?? model.maxTokens,
        ...(request.timeoutMs ? { timeoutMs: request.timeoutMs } : {}),
        ...(signal ? { signal } : {}),
        ...(THINKING_BUDGETS[thinking] ? { thinkingBudgets: THINKING_BUDGETS[thinking] } : {}),
        ...(request.toolChoice !== undefined ? { toolChoice: model.api === "anthropic-messages" && request.toolChoice?.type === "function" ? { type: "tool", name: request.toolChoice.function.name } : request.toolChoice } : {}),
        ...(request.responseFormat ? { samplingParams: { response_format: { type: request.responseFormat } } } : {})
    };
    return { models, model, options, context: toPiContext(request) };
}
function completeResult(cfg, message) {
    if (["error", "aborted"].includes(message.stopReason)) throw new Error("模型补全未完成：" + (message.errorMessage || message.stopReason));
    const content = (message.content ?? []).filter(block => block.type === "text").map(block => block.text ?? "").join("");
    const toolCalls = (message.content ?? []).filter(block => block.type === "toolCall").map(call => ({ id: call.id ?? "", name: call.name, arguments: call.arguments }));
    return { ok: true, content, toolCalls, finishReason: message.stopReason ?? "stop", usage: message.usage ? { inputTokens: message.usage.input ?? 0, outputTokens: message.usage.output ?? 0, totalTokens: message.usage.totalTokens ?? 0 } : null, model: cfg.provider + "." + cfg.model };
}
export async function runComplete(cfg, request, signal) {
    const { models, model, options, context } = prepareComplete(cfg, request, signal);
    return completeResult(cfg, await models.complete(model, context, options));
}
export async function runCompleteStream(cfg, request, onDelta, signal, onEvent) {
    const { models, model, options, context } = prepareComplete(cfg, request, signal);
    const events = models.stream(model, context, options);
    let content = "";
    let toolStarted = false;
    try {
        for await (const event of events) {
            if (event.type === "toolcall_start") {
                toolStarted = true;
                const call = event.partial?.content?.[event.contentIndex];
                onEvent?.({ type: "tool.input.delta", callId: call?.id || "", toolName: call?.name || "", input: {} });
            }
            if (event.type === "text_delta" && typeof event.delta === "string" && event.delta) {
                content += event.delta;
                onDelta(event.delta);
            }
        }
        const result = completeResult(cfg, await events.result());
        if (signal?.aborted) throw signal.reason || new Error("生成已停止");
        return result;
    } catch (error) { throw Object.assign(error instanceof Error ? error : new Error(String(error)), { generatedText: toolStarted ? "" : content }); }
}
`
  fs.writeFileSync(funnelFile, funnel)
  patch('server.js', [[
    '                }, controller.signal);\n                if (!res.destroyed && !res.writableEnded) {',
    '                }, controller.signal, event => {\n                    if (!res.destroyed && !res.writableEnded) res.write("data: " + JSON.stringify(event) + "\\n\\n");\n                });\n                if (!res.destroyed && !res.writableEnded) {'
  ], [
    '                    res.write("data: [DONE]\\n\\n");',
    '                    res.write("data: " + JSON.stringify({ type: "complete", result }) + "\\n\\n");\n                    res.write("data: [DONE]\\n\\n");'
  ]])
  return createHash('sha256').update(fs.readFileSync(import.meta.filename)).update(assistantRuntimeFiles.map(file => fs.readFileSync(path.join(root, file))).reduce((all, buffer) => Buffer.concat([all, buffer]), Buffer.alloc(0))).digest('hex')
}
