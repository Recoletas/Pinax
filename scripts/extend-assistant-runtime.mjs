import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
const root = path.resolve(import.meta.dirname, '..')
export const assistantRuntimeFiles = ['runtime-extensions/assistantProposalTool.js', 'runtime-extensions/assistantTask.js', 'runtime-extensions/assistantWorkspaceTool.js', 'shared/assistantEditProposal.js', 'shared/assistantPermission.js']
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
    ['import { Agent }', 'import { createAssistantTask, assistantCompletionText, assistantProviderFailure, assistantToolGuard } from "./assistantTask.js";\nimport { Agent }'],
    ['    const lookupTools = buildPinaxTools(snapshot, toolNames, toolHooks);', '    const assistantTask = req.taskKind === "assistant" ? createAssistantTask(req, snapshot) : null;\n    const lookupTools = buildPinaxTools(snapshot, toolNames, toolHooks);\n    if (assistantTask) lookupTools.push(...assistantTask.tools);'],
    ['            // 单轮调用限额', '            if (assistantTask) {\n                const name = ctx.toolCall?.name || ctx.tool?.name || "";\n                return assistantToolGuard(assistantTask, name, budget);\n            }\n            // 单轮调用限额'],
    ['                    if (capability)\n                        agent.state.tools = agent.state.tools.filter((tool) => tool.name === submitToolName);', '                    if (assistantTask)\n                        agent.state.tools = agent.state.tools.filter((tool) => ["submit_edit_proposals", "complete_assistant_task"].includes(tool.name));\n                    else if (capability)\n                        agent.state.tools = agent.state.tools.filter((tool) => tool.name === submitToolName);'],
    ['                // 能力任务：submit 回执', '                if (assistantTask?.state.proposal) agent.state.tools = agent.state.tools.filter(tool => tool.name === "complete_assistant_task");\n                // 能力任务：submit 回执'],
    ['            case "turn_end":', '            case "turn_end":\n                if (assistantTask?.state.delivery) ac.abort(new Error("PINAX_ASSISTANT_DELIVERED"));'],
    ['            // Some compatible models print', '            if (assistantTask && assistantProviderFailure(agent.state.messages)) throw new Error(assistantProviderFailure(agent.state.messages));\n            if (assistantTask && !assistantTask.state.delivery && counters.steps < budget.maxModelSteps) {\n                await Promise.race([agent.prompt("本轮尚未交付任务。若要求写作修改，先提交合法提议；若需澄清或缺授权说明原因。然后调用 complete_assistant_task。不要以聊天长文代替作品修改。"), abortGate]);\n            }\n            if (assistantTask && assistantProviderFailure(agent.state.messages)) throw new Error(assistantProviderFailure(agent.state.messages));\n            if (assistantTask && !assistantTask.state.delivery) throw new Error("本轮未形成有效交付，已有内容已保留，请重试。");\n            // Some compatible models print'],
    ['        catch (e) {\n            // 能力任务', '        catch (e) {\n            if (assistantTask?.state.delivery && String(ac.signal.reason?.message || "") === "PINAX_ASSISTANT_DELIVERED") {\n                const delivery = assistantTask.state.delivery;\n                finalText = assistantCompletionText(agent.state.messages, delivery, finalText);\n                emitTask("completed", { status: "completed", taskId: req.taskId || base.taskId, bookId: req.bookId, finalText, delivery, model: `${cfg.provider}.${cfg.model}`, usage: counters.usage, steps: counters.steps, toolCalls: counters.toolCalls });\n                return { ...base, status: "completed", finalText, delivery, messages: agent.state.messages, steps: counters.steps, toolCalls: counters.toolCalls };\n            }\n            // 能力任务']
  ])
  patch('server.js', [['[...PINAX_TOOL_NAMES, "manuscript", "notes", "outline"]', '[...PINAX_TOOL_NAMES, "manuscript", "notes", "outline", "workspace"]'], ['const store = new TaskStore(cfg.tasksDir);', 'const store = new TaskStore(cfg.tasksDir);'], ['json(res, 200, { ok: true', 'json(res, 200, { assistantProtocolVersion: 2, assistantWorkspace: true, ok: true']])
  return createHash('sha256').update(fs.readFileSync(import.meta.filename)).update(assistantRuntimeFiles.map(file => fs.readFileSync(path.join(root, file))).reduce((all, buffer) => Buffer.concat([all, buffer]), Buffer.alloc(0))).digest('hex')
}
