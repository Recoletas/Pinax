// 一次下一拍生成 = 一个 schema-v3 writingUnit（plan Task 2.3 / spec §9）。
// 纯函数：不碰 DOM、不碰 store。编辑器与事务层共用这里的单元构建和
// Markdown 投影，保证回执文本与编辑器实际写入逐字节一致。
import { normalizeWritingOriginRefs, validateWritingDocument } from './writingDocumentSchema.js'
import { normalizeNarrativeTransportProse } from '../narrativePresentation.js'

export function buildAuthoringTurnOriginRef({
  requestId = '',
  turnKind = 'action',
  taskId = '',
  documentRevision = '',
  sourceRevision = 1
} = {}) {
  const [ref] = normalizeWritingOriginRefs([{
    type: 'authoring-turn',
    requestId,
    turnKind,
    taskId,
    documentRevision,
    sourceRevision
  }])
  return ref || null
}

export function getAuthoringTurnOriginFingerprint(originRef) {
  if (!originRef || originRef.type !== 'authoring-turn') return ''
  return [
    originRef.type,
    String(originRef.requestId || ''),
    Math.max(1, Number(originRef.sourceRevision || 1))
  ].join('\u0000')
}

// 单元的 Markdown 投影：'\n' + 段落以空行连接 + 结尾换行。
// 与 writingDocumentSchema 的渲染规则一致（首节点 leadingMarkdown='\n'，
// 每个段落节点渲染为 `${text}\n`）。
export function buildAuthoringTurnUnitMarkdown(text) {
  const paragraphs = normalizeNarrativeTransportProse(text).split('\n\n').filter(Boolean)
  if (!paragraphs.length) return ''
  return `\n${paragraphs.join('\n\n')}\n`
}

function createNodeId(seed) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `node-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function createWritingUnitFromAuthoringTurn({ text = '', originRef = null } = {}) {
  const [ref] = normalizeWritingOriginRefs([originRef])
  if (!ref) return { ok: false, reason: 'invalid-origin-ref', unit: null }
  const paragraphs = normalizeNarrativeTransportProse(text)
    .split('\n\n')
    .map((part) => part.trim())
    .filter(Boolean)
  if (!paragraphs.length) return { ok: false, reason: 'empty-turn', unit: null }

  const content = paragraphs.map((paragraph, index) => ({
    type: 'paragraph',
    attrs: {
      nodeId: createNodeId(`${ref.requestId}\u0000${index}\u0000${paragraph}`),
      nodeRevision: 0,
      kind: 'prose',
      rawMarkdown: null,
      leadingMarkdown: index > 0 ? '\n' : '',
      originalText: null
    },
    content: [{ type: 'text', text: paragraph }]
  }))
  const unitIdSeed = `${ref.requestId}:${content[0].attrs.nodeId}`
  let unitHash = 2166136261
  for (let index = 0; index < unitIdSeed.length; index += 1) {
    unitHash ^= unitIdSeed.charCodeAt(index)
    unitHash = Math.imul(unitHash, 16777619)
  }
  const unit = {
    type: 'writingUnit',
    attrs: {
      unitId: `unit-${(unitHash >>> 0).toString(16).padStart(8, '0')}`,
      unitRevision: 0,
      kind: 'passage',
      sceneId: null,
      originRefs: [ref]
    },
    content
  }
  return { ok: true, unit, originRef: ref, fingerprint: getAuthorizingTurnFingerprintSafe(ref) }
}

function getAuthorizingTurnFingerprintSafe(ref) {
  return getAuthoringTurnOriginFingerprint(ref)
}

// 目标感知插入（worldbook scene closure Task 3）：新单元插到 targetUnitId 之后，
// 目标缺失/revision 过期时返回原文档，绝不静默回退到文档末尾。
export function insertAuthoringTurnAfterUnit({
  document = null,
  targetUnitId = '',
  targetUnitRevision = null,
  text = '',
  originRef = null
} = {}) {
  const created = createWritingUnitFromAuthoringTurn({ text, originRef })
  if (!created.ok) return { ...created, document }
  if (!document || !validateWritingDocument(document).valid) {
    return { ok: false, reason: 'invalid-document', document }
  }
  const content = Array.isArray(document.content) ? document.content : []
  const targetIndex = content.findIndex((unit) => unit.attrs?.unitId === targetUnitId)
  if (targetIndex < 0) return { ok: false, reason: 'target-unit-missing', document }
  if (
    targetUnitRevision !== null
    && Number(content[targetIndex].attrs?.unitRevision || 0) !== Number(targetUnitRevision || 0)
  ) {
    return { ok: false, reason: 'target-unit-stale', document }
  }
  const fingerprints = new Set(content.flatMap((unit) => (
    (unit.attrs?.originRefs || []).map(getAuthoringTurnOriginFingerprint).filter(Boolean)
  )))
  if (fingerprints.has(created.fingerprint)) {
    return { ok: false, reason: 'already-imported', document }
  }
  const placeholderText = (content[0]?.content || [])
    .flatMap((node) => node.content || [])
    .map((part) => part.text || '')
    .join('')
  const replacedPlaceholder = content.length === 1 && targetIndex === 0 && !placeholderText.trim()
  const nextContent = replacedPlaceholder
    ? [created.unit]
    : [...content.slice(0, targetIndex + 1), created.unit, ...content.slice(targetIndex + 1)]
  const now = new Date().toISOString()
  const nextDocument = {
    ...document,
    revision: Number(document.revision || 0) + 1,
    content: nextContent,
    meta: { ...(document.meta || {}), lastAuthoringTurnAt: now },
    updatedAt: now
  }
  if (!validateWritingDocument(nextDocument).valid) {
    return { ok: false, reason: 'invalid-document', document }
  }
  return { ok: true, document: nextDocument, unitId: created.unit.attrs.unitId, fingerprint: created.fingerprint, replacedPlaceholder }
}

// 旧调用点兼容：追加到文档末尾 = 以最后一个单元为目标委托给目标感知插入。
export function appendAuthoringTurnToDocument({ document = null, text = '', originRef = null } = {}) {
  if (!document || !validateWritingDocument(document).valid) {
    const created = createWritingUnitFromAuthoringTurn({ text, originRef })
    if (!created.ok) return { ...created, document }
    return { ok: false, reason: 'invalid-document', document }
  }
  const lastUnitId = document.content?.at(-1)?.attrs?.unitId || ''
  const lastUnitRevision = Number(document.content?.at(-1)?.attrs?.unitRevision || 0)
  if (!lastUnitId) {
    // 空文档：直接在末尾插入（无目标单元）。
    return insertAuthoringTurnAtEnd({ document, text, originRef })
  }
  return insertAuthoringTurnAfterUnit({
    document,
    targetUnitId: lastUnitId,
    targetUnitRevision: lastUnitRevision,
    text,
    originRef
  })
}

function insertAuthoringTurnAtEnd({ document, text, originRef }) {
  const created = createWritingUnitFromAuthoringTurn({ text, originRef })
  if (!created.ok) return { ...created, document }
  const fingerprints = new Set((document.content || []).flatMap((unit) => (
    (unit.attrs?.originRefs || []).map(getAuthoringTurnOriginFingerprint).filter(Boolean)
  )))
  if (fingerprints.has(created.fingerprint)) {
    return { ok: false, reason: 'already-imported', document }
  }
  const now = new Date().toISOString()
  const nextDocument = {
    ...document,
    revision: Number(document.revision || 0) + 1,
    content: [...document.content, created.unit],
    meta: { ...(document.meta || {}), lastAuthoringTurnAt: now },
    updatedAt: now
  }
  if (!validateWritingDocument(nextDocument).valid) {
    return { ok: false, reason: 'invalid-document', document }
  }
  return { ok: true, document: nextDocument, unitId: created.unit.attrs.unitId, fingerprint: created.fingerprint }
}
