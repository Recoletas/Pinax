import { randomUUID } from '../../../shared/randomId.js'
import { serializeAgentBlockContent } from '../../../shared/agentContextContract.js'

const STORAGE_KEY = 'pinax_agent_request_trace_v1'
const TRACE_LIMIT = 50

function readTraces() {
  if (typeof localStorage === 'undefined') return []
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function createAgentRequestId() {
  return randomUUID()
}

export function summarizeAgentEnvelope(envelope) {
  return {
    surface: envelope?.surface || '',
    projectId: envelope?.projectId || null,
    target: {
      type: envelope?.target?.type || '',
      id: envelope?.target?.id || null,
      revision: envelope?.target?.revision || null
    },
    budget: envelope?.budget || null,
    blocks: (envelope?.blocks || []).map((block, order) => ({
      order,
      kind: block.kind,
      priority: block.priority,
      chars: serializeAgentBlockContent(block?.content).length,
      sourceRefs: block.sourceRefs || [],
      truncated: Boolean(block.truncated),
      retainedChars: block.retainedChars ?? null
    })),
    dropped: envelope?.dropReport?.dropped || []
  }
}

export function recordAgentRequestTrace(trace) {
  if (typeof localStorage === 'undefined') return
  const traces = [trace, ...readTraces().filter((item) => item?.requestId !== trace?.requestId)]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(traces.slice(0, TRACE_LIMIT)))
  } catch {
    // Trace must never block an Agent request.
  }
}

export function getAgentRequestTraces() {
  return readTraces()
}
