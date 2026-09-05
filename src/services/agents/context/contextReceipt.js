// ModelCallReceipt（文本工作台 v3 Phase 4 / 0/6 实验第 6 项）：
// receipt 从"真实 provider 调用最终序列化的内容"产生——不是从 manifest 推测。
// manifest 声明计划；receipt 记录实际。两者可对账（reconcile）。

const TOOL_EVIDENCE_LIMIT = 6
const TOOL_EVIDENCE_ITEM_LIMIT = 12
const TOOL_EVIDENCE_REF_LIMIT = 16

function boundedText(value, limit = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function uniqueBoundedTextList(value, limit, itemLimit = 160) {
  const output = []
  for (const item of (Array.isArray(value) ? value : [])) {
    const normalized = boundedText(item, itemLimit)
    if (!normalized || output.includes(normalized)) continue
    output.push(normalized)
    if (output.length >= limit) break
  }
  return output
}

function boundedToolEvidence(value) {
  return (Array.isArray(value) ? value : [])
    .filter((entry) => boundedText(entry?.tool || entry?.name, 80) !== 'submit_narrative_beat_plan')
    .slice(0, TOOL_EVIDENCE_LIMIT)
    .map((entry) => {
      const modelCallIndex = Number.isInteger(entry?.modelCallIndex) ? entry.modelCallIndex : null
      const consumedByCallIndex = Number.isInteger(entry?.consumedByCallIndex) ? entry.consumedByCallIndex : null
      return {
        callId: boundedText(entry?.callId, 120),
        tool: boundedText(entry?.tool || entry?.name, 80),
        action: boundedText(entry?.action, 80),
        itemIds: uniqueBoundedTextList(entry?.itemIds, TOOL_EVIDENCE_ITEM_LIMIT, 160),
        sourceRefs: uniqueBoundedTextList(entry?.sourceRefs, TOOL_EVIDENCE_REF_LIMIT, 240),
        chars: Math.max(0, Number(entry?.chars) || 0),
        cached: Boolean(entry?.cached),
        errorCode: boundedText(entry?.errorCode, 120),
        ...(modelCallIndex !== null ? { modelCallIndex } : {}),
        ...(consumedByCallIndex !== null ? { consumedByCallIndex } : {})
      }
    })
}

function authorizedEvidenceRefs(authorization) {
  if (!authorization || typeof authorization !== 'object') return null
  return new Set([
    ...(Array.isArray(authorization.worldbookRefs) ? authorization.worldbookRefs : []),
    ...(Array.isArray(authorization.memoryRefs) ? authorization.memoryRefs : [])
  ].map((sourceRef) => String(sourceRef || '')).filter(Boolean))
}

function validateToolEvidence(toolEvidence, authorization) {
  const allowed = authorizedEvidenceRefs(authorization)
  if (!allowed) return { valid: true, issues: [] }
  const issues = []
  for (const evidence of toolEvidence) {
    for (const sourceRef of evidence.sourceRefs) {
      if (!allowed.has(sourceRef)) {
        issues.push({
          issue: 'tool-evidence-not-authorized',
          callId: evidence.callId,
          tool: evidence.tool,
          sourceRef
        })
      }
    }
  }
  return { valid: issues.length === 0, issues }
}

function compilerOmissions(manifest) {
  return (Array.isArray(manifest?.excluded) ? manifest.excluded : []).map((item) => {
    const omission = {
      candidateId: boundedText(item?.candidateId, 240),
      reason: boundedText(item?.reason, 160) || 'compiler-excluded',
      stage: 'compiler'
    }
    for (const key of ['label', 'kind', 'sourceKind', 'sourceId', 'primarySourceRef', 'usageRole']) {
      const value = boundedText(item?.[key], key === 'label' ? 160 : 240)
      if (value) omission[key] = value
    }
    const sourceRefs = uniqueBoundedTextList(item?.sourceRefs, TOOL_EVIDENCE_REF_LIMIT, 240)
    if (sourceRefs.length) omission.sourceRefs = sourceRefs
    return omission
  }).filter((item) => item.candidateId)
}

function normalizeDependencyIssues(value) {
  return (Array.isArray(value) ? value : []).slice(0, 32).map((item) => ({
    dependency: boundedText(item?.dependency, 240) || '*',
    reason: boundedText(item?.reason, 160) || 'revision-changed',
    expected: boundedText(item?.expected, 240),
    actual: boundedText(item?.actual, 240),
    errorCode: boundedText(item?.errorCode, 120)
  }))
}

// stale 发生在 provider 返回之后，不能反写“实际序列化”字段；在同一回执上
// 附加失效来源，保留本轮正文/工具 evidence 与 live revision 对账的完整链路。
export function attachDependencyIssuesToReceipt(receipt, dependencyIssues = []) {
  if (!receipt || typeof receipt !== 'object') return receipt
  const normalized = normalizeDependencyIssues(dependencyIssues)
  return Object.freeze({
    ...receipt,
    dependencyIssues: normalized,
    invalidatedSources: normalized.map((item) => ({
      dependency: item.dependency,
      reason: item.reason,
      ...(item.expected ? { expected: item.expected } : {}),
      ...(item.actual ? { actual: item.actual } : {})
    }))
  })
}

// 从最终序列化文本构建 receipt：
// - blocks：manifest 每块的声明；
// - serializedBlocks：runtime 实际放进 provider payload 的块（id → 文本）；
// - toolEvidence：orchestrator 已有界写入 transcript 的只读工具证据；
// - authorization：FrozenContextManifest 派生的精确 world/memory allowlist；
// - usage：provider 返回的 token 用量（无则保守估算）。
export function buildModelCallReceipt({
  manifest = null,
  serializedBlocks = {},
  toolEvidence = [],
  authorization = null,
  usage = null,
  provider = '',
  model = '',
  callIndex = null
} = {}) {
  const manifestBlocks = Array.isArray(manifest?.blocks) ? manifest.blocks : []
  const entries = manifestBlocks.map((block) => {
    const actual = serializedBlocks[block.candidateId]
    const included = typeof actual === 'string' && actual.length > 0
    const declaredChars = Math.max(0, Number(block.chars) || String(block.text || '').length)
    const actualChars = included ? actual.length : 0
    return {
      candidateId: block.candidateId,
      kind: block.kind,
      label: boundedText(block.label, 160),
      sourceKind: boundedText(block.sourceKind, 120),
      sourceId: boundedText(block.sourceId, 240),
      primarySourceRef: boundedText(block.primarySourceRef, 240),
      representation: block.representation,
      sourceRefs: block.sourceRefs,
      sourceAuthority: block.sourceAuthority,
      declaredChars,
      actualChars,
      // cut：声明了但实际序列化被截断。
      cut: included && actualChars < declaredChars,
      included
    }
  })
  const normalizedToolEvidence = boundedToolEvidence(toolEvidence)
  const evidenceAuthorization = validateToolEvidence(normalizedToolEvidence, authorization)
  const omissions = [
    ...compilerOmissions(manifest),
    ...entries.filter((entry) => !entry.included).map((entry) => ({
      candidateId: entry.candidateId,
      reason: 'provider-serialization-omitted',
      stage: 'provider',
      ...(entry.label ? { label: entry.label } : {}),
      ...(entry.kind ? { kind: entry.kind } : {}),
      ...(entry.sourceKind ? { sourceKind: entry.sourceKind } : {}),
      ...(entry.sourceId ? { sourceId: entry.sourceId } : {}),
      ...(entry.primarySourceRef ? { primarySourceRef: entry.primarySourceRef } : {}),
      ...(entry.sourceRefs?.length ? { sourceRefs: entry.sourceRefs } : {})
    }))
  ]
  const totalActualChars = entries.reduce((sum, entry) => sum + entry.actualChars, 0)
  // 无 provider usage 时保守估算：中文约 1 token/1.5 chars，取 0.7 系数偏保守。
  const usageSource = ['provider', 'estimated', 'mixed'].includes(String(usage?.source || ''))
    ? String(usage.source)
    : 'provider'
  const tokens = usage && Number.isFinite(Number(usage.totalTokens))
    ? { input: Number(usage.inputTokens || 0), output: Number(usage.outputTokens || 0), total: Number(usage.totalTokens), source: usageSource }
    : { input: 0, output: 0, total: Math.ceil(totalActualChars * 0.7), source: 'estimated' }
  return {
    schemaVersion: 1,
    kind: 'model-call-receipt',
    callIndex: Number.isInteger(callIndex) ? callIndex : null,
    manifestFingerprint: manifest?.fingerprint || '',
    provider,
    model,
    entries,
    omissions,
    toolEvidence: normalizedToolEvidence,
    evidenceAuthorization,
    dependencyIssues: [],
    invalidatedSources: [],
    totalDeclaredChars: entries.reduce((sum, entry) => sum + entry.declaredChars, 0),
    totalActualChars,
    tokens,
    anyCut: entries.some((entry) => entry.cut),
    createdAt: new Date().toISOString()
  }
}

// 对账：manifest 声明的每块都必须在 receipt 中可追溯；
// 返回不一致列表（空 = 对账通过）。供 lifecycle eval 与 UI 使用。
export function reconcileManifestWithReceipt(manifest, receipt) {
  const issues = []
  if (!manifest) return [{ issue: 'missing-manifest' }]
  if (!receipt) return [{ issue: 'missing-receipt' }]
  if (manifest.fingerprint && receipt.manifestFingerprint
    && manifest.fingerprint !== receipt.manifestFingerprint) {
    issues.push({ issue: 'fingerprint-mismatch', manifest: manifest.fingerprint, receipt: receipt.manifestFingerprint })
  }
  const byId = new Map(receipt.entries.map((entry) => [entry.candidateId, entry]))
  for (const block of manifest.blocks || []) {
    const entry = byId.get(block.candidateId)
    if (!entry) {
      issues.push({ issue: 'block-missing-in-receipt', candidateId: block.candidateId })
      continue
    }
    if (!entry.included) issues.push({ issue: 'declared-but-not-serialized', candidateId: block.candidateId })
    if (entry.cut) issues.push({ issue: 'serialized-truncated', candidateId: block.candidateId, declared: entry.declaredChars, actual: entry.actualChars })
  }
  for (const evidenceIssue of receipt.evidenceAuthorization?.issues || []) {
    issues.push(evidenceIssue)
  }
  return issues
}
