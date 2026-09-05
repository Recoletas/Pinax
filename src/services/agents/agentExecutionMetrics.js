export function createAgentExecutionMetric({ request, task, result, timing = {}, usage = {}, ledger = {} }) {
  return Object.freeze({
    schemaVersion: 1,
    requestId: String(request?.requestId || ''),
    taskId: String(request?.taskId || ''),
    workflowKind: String(task?.workflowKind || ''),
    contextProfile: String(task?.contextProfile || ''),
    status: String(result?.status || ''),
    errorCode: result?.error?.code ? String(result.error.code) : null,
    durationMs: Math.max(0, Number(timing.durationMs) || 0),
    inputTokens: Math.max(0, Number(usage.inputTokens) || 0),
    outputTokens: Math.max(0, Number(usage.outputTokens) || 0),
    retries: Math.max(0, Number(usage.retries) || 0),
    toolRounds: Math.max(0, Number(usage.toolRounds) || 0),
    contextChars: Math.max(0, Number(ledger.budget?.usedChars) || 0),
    truncatedBlocks: (ledger.parts || []).filter((part) => part.status === 'truncated').length,
    droppedBlocks: (ledger.parts || []).filter((part) => part.status === 'dropped').length
  })
}
