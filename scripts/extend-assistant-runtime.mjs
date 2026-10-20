import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
const root = path.resolve(import.meta.dirname, '..')
export const assistantRuntimeFiles = ['runtime-extensions/assistantKnowledgeTool.js', 'runtime-extensions/assistantProposalTool.js', 'runtime-extensions/assistantNarrativeTool.js', 'runtime-extensions/assistantObservability.js', 'runtime-extensions/assistantTask.js', 'runtime-extensions/assistantWorkspaceTool.js', 'shared/assistantEditProposal.js', 'shared/assistantPermission.js', 'shared/requestModelConfig.js', 'shared/assistantUserInput.js', 'runtime-extensions/assistantSteering.js']
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
    ['{ ...options, maxTokens: Math.max(200, Math.min(8000, req.maxTokens || 1600)), timeoutMs: budget.agentTimeoutMs }', '{ ...assistantStreamOptions(req, context, options, listeners), maxTokens: Math.max(200, Math.min(8000, req.maxTokens || 1600)), timeoutMs: budget.agentTimeoutMs }'],
    ['toolName: event.toolName, result: event.result, isError: Boolean(event.isError)', 'callId: event.toolCallId, toolName: event.toolName, result: event.result, isError: Boolean(event.isError)'],
    ['import { Agent }', 'import { createAssistantTask, assistantCompletionText, assistantProviderFailure, assistantToolGuard } from "./assistantTask.js";\nimport { Agent }'],
    ['    const lookupTools = buildPinaxTools(snapshot, toolNames, toolHooks);', '    const assistantTask = req.taskKind === "assistant" ? createAssistantTask(req, snapshot) : null;\n    const lookupTools = buildPinaxTools(snapshot, toolNames, toolHooks);\n    if (assistantTask) lookupTools.push(...assistantTask.tools);'],
    ['            // 单轮调用限额', '            if (assistantTask) {\n                const name = ctx.toolCall?.name || ctx.tool?.name || "";\n                return assistantToolGuard(assistantTask, name, budget);\n            }\n            // 单轮调用限额'],
    ['                    if (capability)\n                        agent.state.tools = agent.state.tools.filter((tool) => tool.name === submitToolName);', '                    if (assistantTask)\n                        agent.state.tools = agent.state.tools.filter((tool) => ["generate_narrative_draft", "submit_edit_proposals", "request_user_input", "complete_assistant_task"].includes(tool.name));\n                    else if (capability)\n                        agent.state.tools = agent.state.tools.filter((tool) => tool.name === submitToolName);'],
    ['                // 能力任务：submit 回执', '                if (assistantTask?.state.proposal) agent.state.tools = agent.state.tools.filter(tool => tool.name === "complete_assistant_task");\n                // 能力任务：submit 回执'],
    ['            case "turn_end":', '            case "turn_end":\n                if (assistantTask?.state.delivery) ac.abort(new Error("PINAX_ASSISTANT_DELIVERED"));'],
    ['            // Some compatible models print', '            if (assistantTask && assistantProviderFailure(agent.state.messages)) throw new Error(assistantProviderFailure(agent.state.messages));\n            if (assistantTask && !assistantTask.state.delivery && counters.steps < budget.maxModelSteps) {\n                await Promise.race([agent.prompt("本轮尚未交付任务。若要求写作修改，先提交合法提议；若需澄清则调用 request_user_input 等待作者；缺授权则说明原因并调用 complete_assistant_task。不要以聊天长文代替作品修改。"), abortGate]);\n            }\n            if (assistantTask && assistantProviderFailure(agent.state.messages)) throw new Error(assistantProviderFailure(agent.state.messages));\n            if (assistantTask && !assistantTask.state.delivery) throw new Error("本轮未形成有效交付，已有内容已保留，请重试。");\n            // Some compatible models print'],
    ['        catch (e) {\n            // 能力任务', '        catch (e) {\n            if (assistantTask?.state.delivery && String(ac.signal.reason?.message || "") === "PINAX_ASSISTANT_DELIVERED") {\n                const delivery = assistantTask.state.delivery;\n                finalText = assistantCompletionText(agent.state.messages, delivery, finalText);\n                emitTask("completed", { status: "completed", taskId: req.taskId || base.taskId, bookId: req.bookId, finalText, delivery, model: `${cfg.provider}.${cfg.model}`, usage: counters.usage, steps: counters.steps, toolCalls: counters.toolCalls });\n                return { ...base, status: "completed", finalText, delivery, messages: agent.state.messages, steps: counters.steps, toolCalls: counters.toolCalls };\n            }\n            // 能力任务']
  ])
  patch('server.js', [['[...PINAX_TOOL_NAMES, "manuscript", "notes", "outline"]', '[...PINAX_TOOL_NAMES, "manuscript", "notes", "outline", "workspace"]'], ['const store = new TaskStore(cfg.tasksDir);', 'const store = new TaskStore(cfg.tasksDir);'], ['json(res, 200, { ok: true', 'json(res, 200, { assistantProtocolVersion: 2, assistantWorkspace: true, assistantNarrative: true, assistantSampling: true, assistantObservability: true, assistantKnowledge: true, ok: true']])
  patch('server.js', [
    ['import { applyModelPatch,', 'import { requestScopedRuntimeConfig } from "./requestModelConfig.js";\nimport { applyModelPatch,'],
    ['createRun(turn, cfg,', 'createRun(turn, requestScopedRuntimeConfig(cfg, turn.modelConfig),'],
    ['runComplete(cfg, validated.value,', 'runComplete(requestScopedRuntimeConfig(cfg, body.modelConfig), validated.value,'],
    ['runCompleteStream(cfg, validated.value,', 'runCompleteStream(requestScopedRuntimeConfig(cfg, body.modelConfig), validated.value,'],
    ['assistantProtocolVersion: 2,', 'assistantUserInput: true, requestModels: true, assistantProtocolVersion: 2,']
  ])
  // pi-ai requires block arrays for every assistant message, including plain drafts
  // sent back for revision. A string causes a local serializer error before any request.
  patch('runner.js', [
    ['import { Agent }', 'import { createAssistantSteering } from "./assistantSteering.js";\nimport { Agent }'],
    ['    let finalText = "";', '    const steering = createAssistantSteering({ agent, task: assistantTask, req, counters, budget, signal: ac.signal, emit: frame => { for (const listener of listeners) listener(frame); } });\n    let finalText = "";'],
    ['        switch (ev.type) {', '        switch (ev.type) {\n            case "message_start": steering.consumed(ev.message); break;'],
    ['        abort,\n        done: run,', '        abort,\n        steer: input => steering.enqueue(input),\n        done: run,']
  ])
  patch('server.js', [
    ['                if (req.method === "POST" && action === "cancel") {', '                if (req.method === "POST" && action === "steer") {\n                    const input = JSON.parse(await readBody(req));\n                    const owner = active.get(taskId);\n                    const result = owner?.run?.steer?.(input) || { ok: false, error: "task-not-active" };\n                    return json(res, result.ok ? 200 : 409, result);\n                }\n                if (req.method === "POST" && action === "cancel") {'],
    ['assistantUserInput: true,', 'assistantSteering: true, assistantUserInput: true,']
  ])
  patch('modelFunnel.js', [
    ['if (message.role === "assistant" && message.toolCalls?.length) {', 'if (message.role === "assistant") {'],
    ['for (const call of message.toolCalls)\n', 'for (const call of (message.toolCalls || []))\n'],
    ['...(request.toolChoice !== undefined ? { toolChoice: request.toolChoice } : {})', '...(request.toolChoice !== undefined ? { toolChoice: model.api === "anthropic-messages" && request.toolChoice?.type === "function" ? { type: "tool", name: request.toolChoice.function.name } : request.toolChoice } : {})'],
    ['    const content = (message.content ?? []).filter', '    if (["error", "aborted"].includes(message.stopReason)) throw new Error("模型补全未完成：" + (message.errorMessage || message.stopReason));\n    const content = (message.content ?? []).filter']
  ])
  return createHash('sha256').update(fs.readFileSync(import.meta.filename)).update(assistantRuntimeFiles.map(file => fs.readFileSync(path.join(root, file))).reduce((all, buffer) => Buffer.concat([all, buffer]), Buffer.alloc(0))).digest('hex')
}
