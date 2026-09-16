import { getNarrativeToolCatalog } from '../../../../shared/narrativeAgentContract.js'
import { runNarrativeAgentTurn } from '../../generationService.js'
import { createNarrativeToolRegistry } from '../narrativeToolRegistry.js'
import { createManifestAuthorizedNarrativeIndex } from '../context/manifestToolAuthorization.js'

const TOOL_NAME = 'history_lookup'
const MAX_MODEL_STEPS = 3

function text(value) {
  return String(value ?? '').trim()
}

function typedError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, retryable: false, ...details })
}

function unique(values, limit = 32) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))].slice(0, limit)
}

function receipt(status, manifest, calls = []) {
  return Object.freeze({
    status,
    calls: Object.freeze(calls.map((call) => Object.freeze({ ...call }))),
    manifestFingerprint: text(manifest?.fingerprint),
    projectRevision: text(manifest?.target?.documentRevision || manifest?.target?.revision)
  })
}

function toolCallSummary(call, result, authorization) {
  const allowedById = new Map((authorization?.bindings || [])
    .filter((binding) => binding.domain === 'history')
    .map((binding) => [text(binding.sourceId), binding]))
  const requestedRefs = (call.arguments?.ids || []).flatMap((id) => {
    const binding = allowedById.get(text(id))
    return binding ? [binding.sourceRef] : []
  })
  const resultRefs = unique((result?.items || []).flatMap((item) => item?.sourceRefs || []))
  return {
    toolCallId: text(call.id),
    toolName: TOOL_NAME,
    action: text(call.arguments?.action),
    sourceRefs: unique([...requestedRefs, ...resultRefs]),
    resultRefs,
    resultCount: Array.isArray(result?.items) ? result.items.length : 0,
    truncated: Boolean(result?.truncated || result?.warnings?.includes('result-char-limit'))
  }
}

function authorizedCall(call, authorization) {
  if (text(call?.name) !== TOOL_NAME) return false
  const allowedIds = new Set((authorization?.bindings || [])
    .filter((binding) => binding.domain === 'history')
    .map((binding) => text(binding.sourceId)))
  return (call.arguments?.ids || []).every((id) => allowedIds.has(text(id)))
}

function providerUnavailable(error) {
  return [
    'NARRATIVE_PROVIDER_TOOLS_UNSUPPORTED',
    'NARRATIVE_PROVIDER_PROTOCOL_UNSUPPORTED',
    'NARRATIVE_STREAM_UNSUPPORTED'
  ].includes(text(error?.code))
}

function initialMessages({ envelope, question }) {
  const context = (envelope?.blocks || []).map((block) => ({
    kind: block.kind,
    content: block.content,
    sourceRefs: block.sourceRefs
  }))
  return [{
    role: 'system',
    content: '你是作者的故事试演助手。只在确有必要时调用 history_lookup，最多一次；否则直接输出试演 JSON。最终只输出 JSON，不要 markdown。'
  }, {
    role: 'user',
    content: `${question}\n\n冻结现场：${JSON.stringify(context)}`
  }]
}

function assistantToolMessage(response) {
  return {
    role: 'assistant',
    content: text(response?.text),
    toolCalls: (response?.calls || []).map((call) => ({
      id: call.id,
      name: call.name,
      arguments: call.arguments
    }))
  }
}

function toolResultMessage(call, result) {
  return {
    role: 'tool',
    name: TOOL_NAME,
    toolCallId: call.id,
    content: JSON.stringify(result)
  }
}

export function hasAuthorizedRehearsalHistory(manifest) {
  return Array.isArray(manifest?.blocks)
    && manifest.blocks.some((block) => block?.kind === 'history-node' && text(block.primarySourceRef))
}

export async function runAuthoringRehearsalToolStep({
  manifest,
  envelope,
  question,
  settingsSnapshot,
  signal = null,
  parseFinal,
  requestModel = runNarrativeAgentTurn,
  requestFallback,
  createRegistry = createNarrativeToolRegistry
} = {}) {
  const noTool = receipt('not-requested', manifest)
  if (!hasAuthorizedRehearsalHistory(manifest)) {
    const output = await requestFallback({ signal, toolReceipt: noTool })
    return { output, toolReceipt: noTool }
  }
  const access = createManifestAuthorizedNarrativeIndex({
    manifest,
    projectId: manifest?.target?.projectId
  })
  if (!access?.ok || !(access.authorization?.historyRefs || []).length) {
    const unavailable = receipt('unavailable', manifest)
    const output = await requestFallback({ signal, toolReceipt: unavailable })
    return { output, toolReceipt: unavailable }
  }
  const registry = createRegistry({
    index: access.index,
    projectId: access.authorization.projectId,
    allowedToolNames: [TOOL_NAME]
  })
  const tools = getNarrativeToolCatalog({ activeTools: [TOOL_NAME] })
  let messages = initialMessages({ envelope, question })
  let modelSteps = 0
  let callSummary = null
  let toolReceipt = noTool
  try {
    const first = await requestModel({
      messages, tools, settings: settingsSnapshot,
      options: { toolChoice: 'auto', parallelToolCalls: false, maxTokens: 1800 },
      intentMode: 'rehearsal', signal
    })
    modelSteps += 1
    if (first.kind === 'final_ready') return { output: first.text, toolReceipt: noTool }
    if (first.kind !== 'tool_calls' || first.calls?.length !== 1) {
      throw typedError('AUTHORING_REHEARSAL_TOOL_CALL_COUNT_INVALID', '一次试演只允许一次历史查阅')
    }
    const call = first.calls[0]
    if (!authorizedCall(call, access.authorization)) {
      const deniedResult = {
        schemaVersion: 1, ok: false, callId: text(call.id), tool: TOOL_NAME,
        action: text(call.arguments?.action), items: [], truncated: false,
        error: { code: 'NARRATIVE_TOOL_NOT_AUTHORIZED', message: '请求的资料不在本次参考范围', retryable: false }
      }
      callSummary = toolCallSummary(call, deniedResult, access.authorization)
      toolReceipt = receipt('denied', manifest, [callSummary])
      messages = [...messages, assistantToolMessage(first), toolResultMessage(call, deniedResult)]
    } else {
      const result = await registry.execute(call, { signal })
      if (signal?.aborted) throw typedError('AGENT_REQUEST_ABORTED', '生成已取消')
      callSummary = toolCallSummary(call, result, access.authorization)
      toolReceipt = receipt(result?.ok === false ? 'failed' : 'completed', manifest, [callSummary])
      messages = [...messages, assistantToolMessage(first), toolResultMessage(call, result)]
    }

    const final = await requestModel({
      messages, tools, settings: settingsSnapshot,
      options: { toolChoice: 'none', parallelToolCalls: false, maxTokens: 1800 },
      intentMode: 'rehearsal', signal
    })
    modelSteps += 1
    if (final.kind === 'tool_calls' || final.calls?.length) {
      throw typedError('AUTHORING_REHEARSAL_SECOND_TOOL_CALL', '历史资料每步最多查阅一次')
    }
    let output = final.text
    if (typeof parseFinal === 'function') {
      try {
        parseFinal(output)
      } catch (error) {
        if (modelSteps >= MAX_MODEL_STEPS) throw error
        messages = [...messages, { role: 'assistant', content: text(output) }, {
          role: 'user', content: '上一次输出没有通过格式校验。请保持事实不变，只输出符合要求的试演 JSON。'
        }]
        const repaired = await requestModel({
          messages, tools, settings: settingsSnapshot,
          options: { toolChoice: 'none', parallelToolCalls: false, maxTokens: 1800 },
          intentMode: 'rehearsal', signal
        })
        modelSteps += 1
        if (repaired.kind !== 'final_ready' || repaired.calls?.length) throw error
        output = repaired.text
        parseFinal(output)
      }
    }
    return { output, toolReceipt }
  } catch (error) {
    if (!providerUnavailable(error)) throw error
    const unavailable = receipt('unavailable', manifest, callSummary ? [callSummary] : [])
    const output = await requestFallback({ signal, toolReceipt: unavailable })
    return { output, toolReceipt: unavailable }
  }
}

export default runAuthoringRehearsalToolStep
