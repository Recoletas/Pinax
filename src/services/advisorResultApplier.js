// advisorResultApplier.js — Writing Agent result application
//
// Two related APIs:
//
//   1. applyAdvisorReplacement(content, result)
//      Legacy: handles `mode === 'replace'` results from the old advisor
//      flow. Kept as-is for backward compat (4 tests in
//      advisorResultApplier.test.js lock the existing return shape).
//
//   2. applyWritingAgentAction(content, action, env)
//      New (WA-C 2026-06-29): pure function that applies a single
//      agent action to the chapter content. Supports 6 action types:
//
//        - replace_range         text-mutating + stale check
//        - insert_at_cursor     text-mutating (default: end of content)
//        - append_to_outline    side-effect only (add chapter outline item)
//        - create_asset         side-effect only (add narrative asset)
//        - set_reference        side-effect only (set copilot reference)
//        - review_only          no-op (mark result as read)
//
//      Return shape: { ok, content, cursorPos, sideEffects, message, reason?, range? }
//
//      sideEffects is an array of typed objects:
//        { type: 'add-outline-item', item: {...} }
//        { type: 'create-asset',     asset: {...} }
//        { type: 'set-reference',    assetId: string | null }
//
//      The applier NEVER writes to localStorage. It returns the side
//      effects; the caller (Writing.vue) executes them via the
//      appropriate store/service. This keeps the applier pure
//      (testable without a Pinia / localStorage harness).
//
//      For multi-action sequences, the caller iterates the actions
//      array and threads `content` + `cursorPos` between calls. If
//      any action returns ok: false, the caller aborts and marks the
//      result stale (atomic-ish: failed actions don't apply, applied
//      actions do — caller decides whether to roll back).

// -----------------------------------------------------------------------------
// Legacy API — applyAdvisorReplacement
// -----------------------------------------------------------------------------

function normalizeRange(range) {
  if (!range || typeof range !== 'object') return null
  const start = Number(range.start)
  const end = Number(range.end)

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null
  }

  return {
    start: Math.max(0, Math.floor(Math.min(start, end))),
    end: Math.max(0, Math.floor(Math.max(start, end)))
  }
}

export function applyAdvisorReplacement(content, result) {
  const text = String(content || '')
  const replacement = String(result?.replacement || '')
  const range = normalizeRange(result?.targetRange)

  if (!result || result.mode !== 'replace') {
    return {
      ok: false,
      reason: 'not-replace',
      message: '该建议不是替换类型。'
    }
  }

  if (!range || range.end > text.length) {
    return {
      ok: false,
      reason: 'invalid-range',
      message: '目标范围已不可用，无法应用。'
    }
  }

  if (!replacement) {
    return {
      ok: false,
      reason: 'empty-replacement',
      message: '替换文本为空，无法应用。'
    }
  }

  const currentTargetText = text.slice(range.start, range.end)
  if (typeof result.baseText === 'string' && result.baseText && currentTargetText !== result.baseText) {
    return {
      ok: false,
      reason: 'stale-base-text',
      message: '原文已变化，请重新生成建议。'
    }
  }

  const nextContent = text.slice(0, range.start) + replacement + text.slice(range.end)

  return {
    ok: true,
    content: nextContent,
    cursorPos: range.start + replacement.length,
    range,
    replacement
  }
}

// -----------------------------------------------------------------------------
// WA-C: new Writing Agent action applier
// -----------------------------------------------------------------------------

export const APPLIER_ACTIONS = Object.freeze({
  REPLACE_RANGE: 'replace_range',
  INSERT_AT_CURSOR: 'insert_at_cursor',
  APPEND_TO_OUTLINE: 'append_to_outline',
  CREATE_ASSET: 'create_asset',
  SET_REFERENCE: 'set_reference',
  REVIEW_ONLY: 'review_only'
})

export const SIDE_EFFECTS = Object.freeze({
  ADD_OUTLINE_ITEM: 'add-outline-item',
  CREATE_ASSET: 'create-asset',
  SET_REFERENCE: 'set-reference'
})

// Asset kinds accepted by narrativeAssets.js. Any kind outside this set
// is rejected at the applier level (we don't want to write nonsense into
// the store just because the agent hallucinated a kind).
const VALID_ASSET_KINDS = Object.freeze([
  'draft-prose',
  'event',
  'character-fact',
  'worldbook-draft',
  'inspiration',
  'storyboard-seed',
  'reference-image'
])

const OUTLINE_SCHEMA_VERSION = 1
const ASSET_SCHEMA_VERSION = 1

/**
 * Apply a single Writing Agent action to chapter content.
 * Pure: no store / localStorage / DOM access. Returns side effects
 * as data; the caller executes them.
 *
 * @param {string} content - Current editor content (markdown).
 * @param {object} action - Action object with `type` + payload.
 * @param {object} [env] - Optional context: { currentCursorPos, knownAssetIds, now }.
 *   - currentCursorPos: number — used by insert_at_cursor when action.cursorPos is null.
 *   - knownAssetIds: string[] — if provided, set_reference validates the id exists.
 *   - now: number — override Date.now() for deterministic tests + asset id minting.
 * @returns {{
 *   ok: boolean,
 *   content: string,
 *   cursorPos: number,
 *   sideEffects: Array<object>,
 *   message: string,
 *   reason?: string,
 *   range?: { start: number, end: number }
 * }}
 */
export function applyWritingAgentAction(content, action, env = {}) {
  if (!action || typeof action !== 'object') {
    return fail('invalid-action', '动作格式不正确。', content, env)
  }
  const type = String(action.type || '').trim()
  if (!type) {
    return fail('invalid-action', '动作类型缺失。', content, env)
  }

  const text = String(content || '')

  switch (type) {
    case APPLIER_ACTIONS.REPLACE_RANGE:
      return applyReplaceRange(text, action, env)
    case APPLIER_ACTIONS.INSERT_AT_CURSOR:
      return applyInsertAtCursor(text, action, env)
    case APPLIER_ACTIONS.APPEND_TO_OUTLINE:
      return applyAppendToOutline(text, action, env)
    case APPLIER_ACTIONS.CREATE_ASSET:
      return applyCreateAsset(text, action, env)
    case APPLIER_ACTIONS.SET_REFERENCE:
      return applySetReference(text, action, env)
    case APPLIER_ACTIONS.REVIEW_ONLY:
      return okResult(
        text,
        readCursorFromEnv(env, text),
        [],
        '已查看,无需修改。'
      )
    default:
      return fail('unknown-action', `未知的动作类型: ${type}`, text, env)
  }
}

// -----------------------------------------------------------------------------
// Action handlers
// -----------------------------------------------------------------------------

function applyReplaceRange(text, action, env) {
  const range = normalizeRange(action.range || action.targetRange)
  if (!range) {
    return fail('invalid-range', '替换范围无效。', text, env)
  }
  if (range.end > text.length) {
    return fail('invalid-range', '目标范围已不可用,无法应用。', text, env)
  }

  // Accept either `text` (new) or `replacement` (legacy field name) for
  // back-compat with the old `applyAdvisorReplacement` shape.
  const replacement = String(
    action.text !== undefined ? action.text : (action.replacement !== undefined ? action.replacement : '')
  )
  if (!replacement) {
    return fail('empty-replacement', '替换文本为空,无法应用。', text, env)
  }

  // Stale check: if the agent passed a baseText snapshot, the current
  // text at the range must still match. This is the same guard the
  // legacy `applyAdvisorReplacement` uses (via `result.baseText`).
  if (typeof action.baseText === 'string' && action.baseText) {
    const currentTargetText = text.slice(range.start, range.end)
    if (currentTargetText !== action.baseText) {
      return fail('stale-base-text', '原文已变化,请重新生成建议。', text, env)
    }
  }

  const nextContent = text.slice(0, range.start) + replacement + text.slice(range.end)
  return {
    ok: true,
    content: nextContent,
    cursorPos: range.start + replacement.length,
    sideEffects: [],
    message: '替换已应用。',
    range,
    replacement
  }
}

function applyInsertAtCursor(text, action, env) {
  const insertion = String(action.text || '')
  if (!insertion) {
    return fail('empty-text', '插入文本为空,无法应用。', text, env)
  }

  // Position resolution: action.cursorPos > env.currentCursorPos > end.
  const explicitPos = Number(action.cursorPos)
  const envPos = Number(env && env.currentCursorPos)
  let pos
  if (Number.isFinite(explicitPos)) {
    pos = clampInt(explicitPos, text.length, 0, text.length)
  } else if (Number.isFinite(envPos)) {
    pos = clampInt(envPos, text.length, 0, text.length)
  } else {
    pos = text.length
  }

  const nextContent = text.slice(0, pos) + insertion + text.slice(pos)
  return okResult(
    nextContent,
    pos + insertion.length,
    [],
    '已插入到光标位置。'
  )
}

function applyAppendToOutline(text, action, env) {
  const raw = action.outlineItem
  if (!raw || typeof raw !== 'object') {
    return fail('invalid-outline-item', '纲要项格式无效。', text, env)
  }

  const title = String(raw.title || '').trim()
  if (!title) {
    return fail('invalid-outline-item', '纲要项标题缺失。', text, env)
  }
  const content = String(raw.content || '').trim()
  if (!content) {
    return fail('invalid-outline-item', '纲要项内容缺失。', text, env)
  }

  const now = readNow(env)
  const item = {
    schemaVersion: OUTLINE_SCHEMA_VERSION,
    id: String(raw.id || `outline_${hashString(title + '' + content + '' + (raw.source || 'agent'))}`),
    title,
    content,
    source: String(raw.source || 'agent'),
    assetId: raw.assetId || null,
    assetKind: raw.assetKind || null,
    createdAt: now
  }

  return okResult(
    text,
    readCursorFromEnv(env, text),
    [{ type: SIDE_EFFECTS.ADD_OUTLINE_ITEM, item }],
    '已添加到章节纲要。'
  )
}

function applyCreateAsset(text, action, env) {
  const raw = action.asset
  if (!raw || typeof raw !== 'object') {
    return fail('invalid-asset', '素材格式无效。', text, env)
  }

  const kind = String(raw.kind || '').trim()
  if (!kind) {
    return fail('invalid-asset', '素材 kind 缺失。', text, env)
  }
  if (!VALID_ASSET_KINDS.includes(kind)) {
    return fail('invalid-asset-kind', `未知的素材 kind: ${kind}`, text, env)
  }

  const title = String(raw.title || '').trim()
  if (!title) {
    return fail('invalid-asset', '素材标题缺失。', text, env)
  }

  const content = String(raw.content || '').trim()
  if (!content) {
    return fail('invalid-asset', '素材内容为空。', text, env)
  }

  const now = readNow(env)
  const status = String(raw.status || 'draft').trim()
  const source = normalizeAssetSource(raw.source)
  const id = String(raw.id || `asset_${hashString(title + '' + content + '' + kind + '' + now)}`)

  const asset = {
    schemaVersion: ASSET_SCHEMA_VERSION,
    id,
    kind,
    title,
    content,
    status,
    source,
    createdAt: now,
    updatedAt: now
  }

  return okResult(
    text,
    readCursorFromEnv(env, text),
    [{ type: SIDE_EFFECTS.CREATE_ASSET, asset }],
    '素材已创建。'
  )
}

function applySetReference(text, action, env) {
  // Two modes:
  //   (a) referenceAssetId present → set to that existing asset (or null = clear).
  //   (b) asset object present    → create a new asset AND set it as reference.
  //       Returns 2 side effects (create-asset then set-reference) so the
  //       caller applies them in order. Both side effects share the same
  //       minted asset id.
  const hasRef = Object.prototype.hasOwnProperty.call(action, 'referenceAssetId')
  const hasAsset = action.asset && typeof action.asset === 'object'

  if (!hasRef && !hasAsset) {
    return fail('invalid-reference', 'reference 动作缺少 referenceAssetId 或 asset。', text, env)
  }

  if (hasAsset) {
    const raw = action.asset
    const kind = String(raw.kind || 'reference-image').trim()
    if (!VALID_ASSET_KINDS.includes(kind)) {
      return fail('invalid-reference-asset-kind', `未知的素材 kind: ${kind}`, text, env)
    }
    const title = String(raw.title || '').trim()
    const content = String(raw.content || '').trim()
    if (!title) {
      return fail('invalid-reference-asset', 'reference asset 缺少 title。', text, env)
    }
    if (!content) {
      return fail('invalid-reference-asset', 'reference asset 缺少 content。', text, env)
    }

    const now = readNow(env)
    const status = String(raw.status || 'draft').trim()
    const source = normalizeAssetSource(raw.source)
    const id = String(raw.id || `asset_${hashString(title + '' + content + '' + kind + '' + now)}`)

    const asset = {
      schemaVersion: ASSET_SCHEMA_VERSION,
      id,
      kind,
      title,
      content,
      status,
      source,
      createdAt: now,
      updatedAt: now
    }

    // If the caller also passed referenceAssetId, ensure it matches the
    // new asset id (caller is being explicit about what to point at).
    if (hasRef && action.referenceAssetId !== null && action.referenceAssetId !== id) {
      return fail(
        'reference-id-mismatch',
        'referenceAssetId 与 asset 派生的 id 不一致,无法同时应用。',
        text,
        env
      )
    }

    return okResult(
      text,
      readCursorFromEnv(env, text),
      [
        { type: SIDE_EFFECTS.CREATE_ASSET, asset },
        { type: SIDE_EFFECTS.SET_REFERENCE, assetId: id }
      ],
      '已创建素材并设为引用。'
    )
  }

  // Pure set mode. assetId can be:
  //   - string  → set to that existing asset (caller is responsible for
  //               ensuring the asset exists; we just emit the side effect).
  //   - null    → clear the reference.
  const refId = action.referenceAssetId
  if (refId !== null && typeof refId !== 'string') {
    return fail('invalid-reference', 'referenceAssetId 必须是 string 或 null。', text, env)
  }
  if (typeof refId === 'string' && !refId) {
    return fail('invalid-reference', 'referenceAssetId 不能为空字符串。', text, env)
  }

  // Optional validation against env.knownAssetIds (caller passes when
  // it has the asset list in memory; otherwise we trust the action).
  if (refId !== null && Array.isArray(env.knownAssetIds) && !env.knownAssetIds.includes(refId)) {
    return fail('unknown-asset', `引用素材不存在: ${refId}`, text, env)
  }

  return okResult(
    text,
    readCursorFromEnv(env, text),
    [{ type: SIDE_EFFECTS.SET_REFERENCE, assetId: refId }],
    refId === null ? '已清除引用素材。' : '引用素材已更新。'
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function okResult(content, cursorPos, sideEffects, message, extra) {
  return {
    ok: true,
    content: String(content || ''),
    cursorPos: Number.isFinite(cursorPos) ? cursorPos : String(content || '').length,
    sideEffects: Array.isArray(sideEffects) ? sideEffects : [],
    message: message || '',
    ...(extra || {})
  }
}

function fail(reason, message, content, env) {
  const text = String(content || '')
  return {
    ok: false,
    content: text,
    cursorPos: readCursorFromEnv(env, text),
    sideEffects: [],
    reason,
    message: message || reason
  }
}

function readCursorFromEnv(env, text) {
  const fallback = String(text || '').length
  const pos = Number(env && env.currentCursorPos)
  if (!Number.isFinite(pos)) return fallback
  return clampInt(pos, fallback, 0, fallback)
}

function readNow(env) {
  const now = Number(env && env.now)
  return Number.isFinite(now) ? now : Date.now()
}

function clampInt(value, fallback, min, max) {
  if (!Number.isFinite(value)) return fallback
  let v = Math.floor(value)
  if (v < min) v = min
  if (v > max) v = max
  return v
}

function normalizeAssetSource(source) {
  if (!source || typeof source !== 'object') {
    return { type: 'agent' }
  }
  if (typeof source.type === 'string' && source.type) {
    return source
  }
  return { type: 'agent' }
}

// FNV-1a 32-bit hash. Deterministic + non-cryptographic. Used to mint
// stable asset / outline item ids from content (so the same agent
// action applied twice produces the same id).
function hashString(input) {
  const s = String(input || '')
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}
