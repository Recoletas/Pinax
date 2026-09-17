/**
 * AC-SOURCE-v1 — 资料来源身份与归属合同（N-A 提供，N-C 消费）。
 *
 * 本文件只描述数据形状与纯校验函数，不含任何存储或 IO：N-A 的归档 reader
 * 负责按此合同产出记录，N-C 的提取/证据链负责按此合同校验冻结来源。
 * 字段语义（与既有实现对齐，见 services/worldbook/worldbookSourceArchive.js）：
 *
 * SourceRef = {
 *   sourceId: string            —— 归档内稳定身份（artifact id = 内容哈希首切）
 *   contentHash: string         —— 'sha256-...' 前缀内容身份；同名不同内容不算同源
 *   sourceRevision: string      —— 产生该引用时的来源版本（引用冻结，更新产生新 revision）
 *   archiveRef: string|null     —— IndexedDB pinax-source-archive/artifacts 主键；null=未归档（不可作为证据）
 *   chunkIds: string[]          —— 可定位的 chunk（locator {type,start,end}）
 *   title, kind                 —— 展示与类型；标题相同不代表身份相同
 *   scope: { kind: 'book'|'worldbook', bookId|null, worldbookId } —— 归属与共享范围
 * }
 *
 * 规则：
 * - 标题/name 不参与身份；身份只有 contentHash（内容）与 sourceId（实例）。
 * - 证据引用必须携带 archiveRef 与 sourceRevision；缺任一只算"参考原文"，不能冻结为证据。
 * - 来源更新产生新 revision 与新 archiveRef；旧证据引用永不被覆写。
 * - 删除只允许软移除；仍被证据/其他书引用的 artifact 不物理清除。
 */

export const SOURCE_CONTRACT_VERSION = 1

export const SOURCE_KINDS = ['text-file', 'markdown', 'pdf', 'docx', 'epub', 'pasted-text']

export const SOURCE_SCOPE_KINDS = ['book', 'worldbook']

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * 校验一条可作为"冻结证据"引用的来源记录。返回 { ok, reason?, source }。
 * 与"仅参考原文"的宽松形状区分：证据级必须有 archiveRef + sourceRevision。
 */
export function validateEvidenceSourceRef(input) {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'source-ref-missing' }
  const source = {
    sourceId: input.sourceId,
    contentHash: input.contentHash,
    sourceRevision: input.sourceRevision,
    archiveRef: input.archiveRef ?? null,
    chunkIds: Array.isArray(input.chunkIds) ? input.chunkIds.filter(isNonEmptyString) : [],
    title: typeof input.title === 'string' ? input.title : '',
    kind: SOURCE_KINDS.includes(input.kind) ? input.kind : 'text-file',
    scope: input.scope && SOURCE_SCOPE_KINDS.includes(input.scope.kind)
      ? { kind: input.scope.kind, bookId: input.scope.bookId ?? null, worldbookId: isNonEmptyString(input.scope.worldbookId) ? input.scope.worldbookId : null }
      : null
  }
  if (!isNonEmptyString(source.sourceId)) return { ok: false, reason: 'source-id-required' }
  if (!isNonEmptyString(source.contentHash)) return { ok: false, reason: 'source-hash-required' }
  if (!isNonEmptyString(source.sourceRevision)) return { ok: false, reason: 'source-revision-required' }
  if (!isNonEmptyString(source.archiveRef)) return { ok: false, reason: 'source-not-archived' }
  if (!source.scope || !isNonEmptyString(source.scope.worldbookId)) return { ok: false, reason: 'source-scope-required' }
  return { ok: true, source }
}

/**
 * 宽松形状：允许未归档的参考原文（如粘贴预览），不作为证据。
 */
export function normalizeReferenceSourceRef(input) {
  if (!input || typeof input !== 'object') return null
  return {
    sourceId: isNonEmptyString(input.sourceId) ? input.sourceId : '',
    contentHash: isNonEmptyString(input.contentHash) ? input.contentHash : '',
    sourceRevision: isNonEmptyString(input.sourceRevision) ? input.sourceRevision : '',
    archiveRef: isNonEmptyString(input.archiveRef) ? input.archiveRef : null,
    chunkIds: Array.isArray(input.chunkIds) ? input.chunkIds.filter(isNonEmptyString) : [],
    title: typeof input.title === 'string' ? input.title : '',
    kind: SOURCE_KINDS.includes(input.kind) ? input.kind : 'text-file',
    scope: null
  }
}

/**
 * 来源更新事件形状（NA10 消费；N-C 据此失效旧证据）。
 */
export function buildSourceUpdatedEvent({ sourceId, previousRevision, nextRevision, reason }) {
  return {
    type: 'source-updated',
    sourceId,
    previousRevision: previousRevision ?? null,
    nextRevision: nextRevision ?? null,
    reason: reason ?? 'source-revision-changed',
    at: Date.now()
  }
}
