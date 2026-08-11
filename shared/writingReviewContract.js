const REVIEW_TYPES = new Set([
  '重复',
  '衔接',
  'POV',
  '角色连续性',
  '时间',
  '设定冲突',
  '节奏',
  '语言'
])
const SEVERITIES = new Set(['low', 'medium', 'high'])
const WEAK_REVIEW_PATTERNS = [
  /更生动/u,
  /更精彩/u,
  /加强描写/u,
  /注意氛围/u,
  /丰富细节/u,
  /提升.*感染力/u
]

function text(value) {
  return value == null ? '' : String(value)
}

function integer(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.floor(number) : fallback
}

function blockIdOf(value) {
  return text(value?.blockId || value?.id).trim()
}

function normalizeKind(value) {
  const kind = text(value || value?.type).trim()
  return REVIEW_TYPES.has(kind) ? kind : ''
}

function normalizeSeverity(value) {
  const severity = text(value).trim().toLowerCase()
  return SEVERITIES.has(severity) ? severity : 'medium'
}

function exactForRange(blocks, startIndex, endIndex, startOffset, endOffset) {
  if (startIndex === endIndex) {
    return blocks[startIndex].text.slice(startOffset, endOffset)
  }
  return [
    blocks[startIndex].text.slice(startOffset),
    ...blocks.slice(startIndex + 1, endIndex).map((block) => block.text),
    blocks[endIndex].text.slice(0, endOffset)
  ].join('\n')
}

export function normalizeWritingReviewFindings(rawFindings, { blocks = [], maxFindings = 8 } = {}) {
  const source = Array.isArray(rawFindings) ? rawFindings : []
  const normalizedBlocks = blocks
    .map((block) => ({
      blockId: blockIdOf(block),
      blockRevision: integer(block?.blockRevision ?? block?.revision),
      text: text(block?.text)
    }))
    .filter((block) => block.blockId)
  const blockIndex = new Map(normalizedBlocks.map((block, index) => [block.blockId, { ...block, index }]))
  const findings = []
  const seen = new Set()

  for (const raw of source) {
    const startBlockId = blockIdOf(raw?.start || raw?.startBlock || { blockId: raw?.startBlockId })
    const endBlockId = blockIdOf(raw?.end || raw?.endBlock || { blockId: raw?.endBlockId || startBlockId })
    const start = blockIndex.get(startBlockId)
    const end = blockIndex.get(endBlockId)
    if (!start || !end || start.index > end.index) continue

    const startOffset = Math.max(0, Math.min(start.text.length, integer(raw?.start?.offset ?? raw?.startOffset)))
    const endOffset = Math.max(0, Math.min(end.text.length, integer(raw?.end?.offset ?? raw?.endOffset, end.text.length)))
    if (start.index === end.index && endOffset <= startOffset) continue
    if (start.index !== end.index && (startOffset >= start.text.length || endOffset <= 0)) continue

    const kind = normalizeKind(raw?.kind || raw?.type)
    const body = text(raw?.body || raw?.message || raw?.issue || raw?.rationale).trim()
    if (!kind || !body || body.length > 500 || WEAK_REVIEW_PATTERNS.some((pattern) => pattern.test(body))) continue

    const exact = exactForRange(normalizedBlocks, start.index, end.index, startOffset, endOffset).trim()
    if (!exact || exact.length > 1200) continue
    if (raw?.exact != null && text(raw.exact).trim() !== exact) continue

    const blockIds = normalizedBlocks.slice(start.index, end.index + 1).map((block) => block.blockId)
    const fingerprint = `${kind}|${startBlockId}|${startOffset}|${endBlockId}|${endOffset}|${body}`
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    findings.push({
      id: text(raw?.id).trim() || `finding-${findings.length + 1}`,
      kind,
      severity: normalizeSeverity(raw?.severity),
      body,
      exact,
      start: {
        blockId: startBlockId,
        blockRevision: start.blockRevision,
        offset: startOffset
      },
      end: {
        blockId: endBlockId,
        blockRevision: end.blockRevision,
        offset: endOffset
      },
      blockIds
    })
    if (findings.length >= Math.max(1, integer(maxFindings, 8))) break
  }

  return findings
}

export const WRITING_REVIEW_TYPES = Object.freeze([...REVIEW_TYPES])
