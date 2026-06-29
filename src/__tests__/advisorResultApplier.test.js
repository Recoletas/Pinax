import { describe, expect, it } from 'vitest'
import {
  applyAdvisorReplacement,
  applyWritingAgentAction,
  APPLIER_ACTIONS,
  SIDE_EFFECTS
} from '../services/advisorResultApplier'

// -----------------------------------------------------------------------------
// Legacy API: applyAdvisorReplacement — regression guard
// -----------------------------------------------------------------------------

describe('advisorResultApplier — legacy applyAdvisorReplacement', () => {
  it('applies a valid replacement and returns the next cursor position', () => {
    const result = applyAdvisorReplacement('春天来了，花开了。', {
      mode: 'replace',
      targetRange: { start: 5, end: 8 },
      baseText: '花开了',
      replacement: '桃花开了'
    })

    expect(result).toMatchObject({
      ok: true,
      content: '春天来了，桃花开了。',
      cursorPos: 9
    })
  })

  it('rejects stale base text', () => {
    const result = applyAdvisorReplacement('春天来了，花谢了。', {
      mode: 'replace',
      targetRange: { start: 5, end: 8 },
      baseText: '花开了',
      replacement: '桃花开了'
    })

    expect(result).toMatchObject({
      ok: false,
      reason: 'stale-base-text',
      message: '原文已变化，请重新生成建议。'
    })
  })

  it('rejects invalid ranges', () => {
    const result = applyAdvisorReplacement('短句', {
      mode: 'replace',
      targetRange: { start: 0, end: 99 },
      replacement: '新句'
    })

    expect(result).toMatchObject({
      ok: false,
      reason: 'invalid-range'
    })
  })

  it('rejects non-replacement results', () => {
    const result = applyAdvisorReplacement('原文', {
      mode: 'review',
      targetRange: { start: 0, end: 2 },
      replacement: '新文'
    })

    expect(result).toMatchObject({
      ok: false,
      reason: 'not-replace'
    })
  })
})

// -----------------------------------------------------------------------------
// WA-C: applyWritingAgentAction — shape + 6 action types
// -----------------------------------------------------------------------------

describe('advisorResultApplier — applyWritingAgentAction (WA-C)', () => {
  // ---------- A. Action shape guards ----------
  it('WA-C-A1: rejects null / non-object action with reason invalid-action', () => {
    expect(applyWritingAgentAction('content', null).reason).toBe('invalid-action')
    expect(applyWritingAgentAction('content', undefined).reason).toBe('invalid-action')
    expect(applyWritingAgentAction('content', 'not-an-object').reason).toBe('invalid-action')
    expect(applyWritingAgentAction('content', {}).reason).toBe('invalid-action')
    expect(applyWritingAgentAction('content', { type: '' }).reason).toBe('invalid-action')
  })

  it('WA-C-A2: rejects unknown action type with reason unknown-action', () => {
    const result = applyWritingAgentAction('content', { type: 'launch_missile' })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('unknown-action')
    // Content is preserved on failure so the caller can show context.
    expect(result.content).toBe('content')
  })

  it('WA-C-A3: returns the 6 APPLIER_ACTIONS constants and 3 SIDE_EFFECTS constants', () => {
    expect(Object.values(APPLIER_ACTIONS)).toEqual([
      'replace_range',
      'insert_at_cursor',
      'append_to_outline',
      'create_asset',
      'set_reference',
      'review_only'
    ])
    expect(Object.values(SIDE_EFFECTS)).toEqual([
      'add-outline-item',
      'create-asset',
      'set-reference'
    ])
  })

  // ---------- B. replace_range ----------
  it('WA-C-B1: replace_range applies text + advances cursor + returns range', () => {
    const result = applyWritingAgentAction('春天来了，花开了。', {
      type: 'replace_range',
      range: { start: 5, end: 8 },
      baseText: '花开了',
      text: '桃花开了'
    })
    expect(result).toMatchObject({
      ok: true,
      content: '春天来了，桃花开了。',
      cursorPos: 9,
      range: { start: 5, end: 8 },
      replacement: '桃花开了'
    })
    expect(result.sideEffects).toEqual([])
  })

  it('WA-C-B2: replace_range rejects stale base text (same guard as legacy)', () => {
    const result = applyWritingAgentAction('春天来了，花谢了。', {
      type: 'replace_range',
      range: { start: 5, end: 8 },
      baseText: '花开了',
      text: '桃花开了'
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('stale-base-text')
  })

  it('WA-C-B3: replace_range skips stale check when baseText is missing', () => {
    const result = applyWritingAgentAction('短句', {
      type: 'replace_range',
      range: { start: 0, end: 2 },
      text: '新句'
    })
    expect(result).toMatchObject({ ok: true, content: '新句' })
  })

  it('WA-C-B4: replace_range rejects out-of-bounds range', () => {
    const result = applyWritingAgentAction('短句', {
      type: 'replace_range',
      range: { start: 0, end: 99 },
      text: '新句'
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('invalid-range')
  })

  it('WA-C-B5: replace_range rejects missing / invalid range', () => {
    expect(
      applyWritingAgentAction('短句', { type: 'replace_range', text: '新句' }).reason
    ).toBe('invalid-range')
    expect(
      applyWritingAgentAction('短句', {
        type: 'replace_range',
        range: { start: 'bad', end: 0 },
        text: '新句'
      }).reason
    ).toBe('invalid-range')
  })

  it('WA-C-B6: replace_range rejects empty text', () => {
    const result = applyWritingAgentAction('春天来了。', {
      type: 'replace_range',
      range: { start: 0, end: 4 },
      text: ''
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('empty-replacement')
  })

  it('WA-C-B7: replace_range accepts `replacement` field as legacy alias for `text`', () => {
    const result = applyWritingAgentAction('春天来了，花开了。', {
      type: 'replace_range',
      range: { start: 5, end: 8 },
      replacement: '桃花开了'
    })
    expect(result).toMatchObject({
      ok: true,
      content: '春天来了，桃花开了。',
      replacement: '桃花开了'
    })
  })

  // ---------- C. insert_at_cursor ----------
  it('WA-C-C1: insert_at_cursor uses action.cursorPos when provided', () => {
    const result = applyWritingAgentAction('春天来了。', {
      type: 'insert_at_cursor',
      cursorPos: 2,
      text: '的'
    })
    expect(result).toMatchObject({
      ok: true,
      content: '春天的来了。',
      cursorPos: 3
    })
    expect(result.sideEffects).toEqual([])
  })

  it('WA-C-C2: insert_at_cursor falls back to env.currentCursorPos', () => {
    const result = applyWritingAgentAction('春天来了。', {
      type: 'insert_at_cursor',
      text: '的'
    }, { currentCursorPos: 2 })
    expect(result).toMatchObject({
      ok: true,
      content: '春天的来了。',
      cursorPos: 3
    })
  })

  it('WA-C-C3: insert_at_cursor falls back to end-of-content when no position given', () => {
    const result = applyWritingAgentAction('春天来了', {
      type: 'insert_at_cursor',
      text: '，桃花开了。'
    })
    expect(result).toMatchObject({
      ok: true,
      content: '春天来了，桃花开了。',
      cursorPos: 10
    })
  })

  it('WA-C-C4: insert_at_cursor clamps out-of-range positions', () => {
    const result = applyWritingAgentAction('短句', {
      type: 'insert_at_cursor',
      cursorPos: 99,
      text: 'A'
    })
    expect(result).toMatchObject({ ok: true, content: '短句A', cursorPos: 3 })
  })

  it('WA-C-C5: insert_at_cursor rejects empty text', () => {
    const result = applyWritingAgentAction('短句', {
      type: 'insert_at_cursor',
      text: ''
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('empty-text')
  })

  // ---------- D. append_to_outline ----------
  it('WA-C-D1: append_to_outline returns add-outline-item side effect with normalized item', () => {
    const result = applyWritingAgentAction('正文不变', {
      type: 'append_to_outline',
      outlineItem: {
        title: '主角发现密室',
        content: '在古堡地下发现暗门',
        source: 'agent'
      }
    }, { now: 1700000000000 })
    expect(result.ok).toBe(true)
    expect(result.content).toBe('正文不变')  // text not modified
    expect(result.sideEffects).toHaveLength(1)
    const se = result.sideEffects[0]
    expect(se.type).toBe(SIDE_EFFECTS.ADD_OUTLINE_ITEM)
    expect(se.item).toMatchObject({
      schemaVersion: 1,
      title: '主角发现密室',
      content: '在古堡地下发现暗门',
      source: 'agent',
      createdAt: 1700000000000
    })
    expect(se.item.id).toMatch(/^outline_[a-z0-9]+$/)
  })

  it('WA-C-D2: append_to_outline preserves caller-provided id when given', () => {
    const result = applyWritingAgentAction('正文', {
      type: 'append_to_outline',
      outlineItem: {
        id: 'outline_custom_42',
        title: '来自素材的纲要',
        content: '内容',
        assetId: 'asset_xxx',
        assetKind: 'event'
      }
    })
    const se = result.sideEffects[0]
    expect(se.item.id).toBe('outline_custom_42')
    expect(se.item.assetId).toBe('asset_xxx')
    expect(se.item.assetKind).toBe('event')
  })

  it('WA-C-D3: append_to_outline rejects missing outlineItem', () => {
    const result = applyWritingAgentAction('正文', { type: 'append_to_outline' })
    expect(result.reason).toBe('invalid-outline-item')
  })

  it('WA-C-D4: append_to_outline rejects empty title or content', () => {
    expect(
      applyWritingAgentAction('正文', { type: 'append_to_outline', outlineItem: { content: 'c' } }).reason
    ).toBe('invalid-outline-item')
    expect(
      applyWritingAgentAction('正文', { type: 'append_to_outline', outlineItem: { title: 't' } }).reason
    ).toBe('invalid-outline-item')
  })

  // ---------- E. create_asset ----------
  it('WA-C-E1: create_asset returns create-asset side effect with full asset envelope', () => {
    const result = applyWritingAgentAction('正文不变', {
      type: 'create_asset',
      asset: {
        kind: 'event',
        title: '密室探索',
        content: '主角在古堡地下发现一扇暗门',
        status: 'draft'
      }
    }, { now: 1700000000000 })
    expect(result.ok).toBe(true)
    expect(result.content).toBe('正文不变')
    expect(result.sideEffects).toHaveLength(1)
    const se = result.sideEffects[0]
    expect(se.type).toBe(SIDE_EFFECTS.CREATE_ASSET)
    expect(se.asset).toMatchObject({
      schemaVersion: 1,
      kind: 'event',
      title: '密室探索',
      content: '主角在古堡地下发现一扇暗门',
      status: 'draft',
      createdAt: 1700000000000,
      updatedAt: 1700000000000
    })
    expect(se.asset.id).toMatch(/^asset_[a-z0-9]+$/)
    expect(se.asset.source).toEqual({ type: 'agent' })
  })

  it('WA-C-E2: create_asset accepts all 7 valid kinds from narrativeAssets.js', () => {
    const validKinds = [
      'draft-prose', 'event', 'character-fact', 'worldbook-draft',
      'inspiration', 'storyboard-seed', 'reference-image'
    ]
    for (const kind of validKinds) {
      const result = applyWritingAgentAction('正文', {
        type: 'create_asset',
        asset: { kind, title: 't', content: 'c' }
      })
      expect(result.ok, `kind=${kind} should be accepted`).toBe(true)
      expect(result.sideEffects[0].asset.kind).toBe(kind)
    }
  })

  it('WA-C-E3: create_asset rejects unknown kind', () => {
    const result = applyWritingAgentAction('正文', {
      type: 'create_asset',
      asset: { kind: 'meme', title: 't', content: 'c' }
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('invalid-asset-kind')
  })

  it('WA-C-E4: create_asset rejects missing / empty fields', () => {
    expect(
      applyWritingAgentAction('正文', { type: 'create_asset' }).reason
    ).toBe('invalid-asset')
    expect(
      applyWritingAgentAction('正文', { type: 'create_asset', asset: { title: 't', content: 'c' } }).reason
    ).toBe('invalid-asset')  // missing kind
    expect(
      applyWritingAgentAction('正文', { type: 'create_asset', asset: { kind: 'event', content: 'c' } }).reason
    ).toBe('invalid-asset')  // missing title
    expect(
      applyWritingAgentAction('正文', { type: 'create_asset', asset: { kind: 'event', title: 't' } }).reason
    ).toBe('invalid-asset')  // missing content
  })

  it('WA-C-E5: create_asset preserves caller-provided source object', () => {
    const result = applyWritingAgentAction('正文', {
      type: 'create_asset',
      asset: {
        kind: 'event',
        title: 't',
        content: 'c',
        source: { type: 'selection', chapterId: 'ch_1', offset: 10, length: 20 }
      }
    })
    expect(result.sideEffects[0].asset.source).toEqual({
      type: 'selection', chapterId: 'ch_1', offset: 10, length: 20
    })
  })

  // ---------- F. set_reference ----------
  it('WA-C-F1: set_reference to existing asset emits set-reference side effect', () => {
    const result = applyWritingAgentAction('正文不变', {
      type: 'set_reference',
      referenceAssetId: 'asset_42'
    })
    expect(result.ok).toBe(true)
    expect(result.content).toBe('正文不变')
    expect(result.sideEffects).toEqual([
      { type: SIDE_EFFECTS.SET_REFERENCE, assetId: 'asset_42' }
    ])
  })

  it('WA-C-F2: set_reference with null assetId clears the reference', () => {
    const result = applyWritingAgentAction('正文不变', {
      type: 'set_reference',
      referenceAssetId: null
    })
    expect(result.ok).toBe(true)
    expect(result.sideEffects).toEqual([
      { type: SIDE_EFFECTS.SET_REFERENCE, assetId: null }
    ])
  })

  it('WA-C-F3: set_reference with asset object creates + sets in one action (2 side effects)', () => {
    const result = applyWritingAgentAction('正文不变', {
      type: 'set_reference',
      asset: {
        kind: 'reference-image',
        title: '暮湾钟楼',
        content: '远景：暮色中的钟楼剪影',
        status: 'draft'
      }
    }, { now: 1700000000000 })
    expect(result.ok).toBe(true)
    expect(result.sideEffects).toHaveLength(2)
    expect(result.sideEffects[0].type).toBe(SIDE_EFFECTS.CREATE_ASSET)
    expect(result.sideEffects[1].type).toBe(SIDE_EFFECTS.SET_REFERENCE)
    // Both side effects share the same minted id.
    const newId = result.sideEffects[0].asset.id
    expect(result.sideEffects[1].assetId).toBe(newId)
    expect(newId).toMatch(/^asset_[a-z0-9]+$/)
  })

  it('WA-C-F4: set_reference validates against env.knownAssetIds when provided', () => {
    const ok = applyWritingAgentAction('正文', {
      type: 'set_reference',
      referenceAssetId: 'asset_42'
    }, { knownAssetIds: ['asset_42', 'asset_99'] })
    expect(ok.ok).toBe(true)

    const bad = applyWritingAgentAction('正文', {
      type: 'set_reference',
      referenceAssetId: 'asset_missing'
    }, { knownAssetIds: ['asset_42'] })
    expect(bad.ok).toBe(false)
    expect(bad.reason).toBe('unknown-asset')
  })

  it('WA-C-F5: set_reference rejects missing both referenceAssetId and asset', () => {
    const result = applyWritingAgentAction('正文', { type: 'set_reference' })
    expect(result.reason).toBe('invalid-reference')
  })

  it('WA-C-F6: set_reference rejects empty-string referenceAssetId', () => {
    const result = applyWritingAgentAction('正文', {
      type: 'set_reference',
      referenceAssetId: ''
    })
    expect(result.reason).toBe('invalid-reference')
  })

  it('WA-C-F7: set_reference rejects non-string non-null referenceAssetId', () => {
    const result = applyWritingAgentAction('正文', {
      type: 'set_reference',
      referenceAssetId: 42
    })
    expect(result.reason).toBe('invalid-reference')
  })

  it('WA-C-F8: set_reference with both asset + mismatched referenceAssetId rejects', () => {
    const result = applyWritingAgentAction('正文', {
      type: 'set_reference',
      asset: { kind: 'event', title: 't', content: 'c' },
      referenceAssetId: 'asset_explicit'
    })
    expect(result.reason).toBe('reference-id-mismatch')
  })

  // ---------- G. review_only ----------
  it('WA-C-G1: review_only is a no-op that preserves content + returns empty side effects', () => {
    const result = applyWritingAgentAction('春天来了。', { type: 'review_only' })
    expect(result).toMatchObject({
      ok: true,
      content: '春天来了。',
      sideEffects: []
    })
    expect(result.message).toMatch(/已查看/)
  })

  it('WA-C-G2: review_only respects env.currentCursorPos when provided', () => {
    const result = applyWritingAgentAction('春天来了。', {
      type: 'review_only'
    }, { currentCursorPos: 3 })
    expect(result.cursorPos).toBe(3)
  })

  // ---------- H. Side effects isolation ----------
  it('WA-C-H1: the applier never writes to localStorage (side effects are data only)', () => {
    // All side effects come back as plain objects. No function references,
    // no proxies, no storage handles. The caller is responsible for
    // executing them via the appropriate store/service.
    const result = applyWritingAgentAction('正文', {
      type: 'create_asset',
      asset: { kind: 'event', title: 't', content: 'c' }
    })
    const se = result.sideEffects[0]
    expect(typeof se).toBe('object')
    expect(se).not.toHaveProperty('apply')
    expect(se).not.toHaveProperty('commit')
    expect(se).not.toHaveProperty('save')
    expect(se).toEqual({
      type: 'create-asset',
      asset: expect.objectContaining({ title: 't' })
    })
  })

  it('WA-C-H2: applying multiple actions in sequence threads content + cursor between calls', () => {
    // Simulate the Writing.vue pattern: thread `content` + `cursorPos`
    // between calls, collect all side effects.
    let content = '春天来了。'
    let cursor = content.length
    const sideEffects = []

    const a1 = applyWritingAgentAction(content, {
      type: 'insert_at_cursor',
      cursorPos: cursor,
      text: '花开了。'
    })
    content = a1.content
    cursor = a1.cursorPos
    sideEffects.push(...a1.sideEffects)

    const a2 = applyWritingAgentAction(content, {
      type: 'create_asset',
      asset: { kind: 'event', title: '花开', content: '春天花开的场景' }
    })
    content = a2.content
    cursor = a2.cursorPos
    sideEffects.push(...a2.sideEffects)

    expect(content).toBe('春天来了。花开了。')
    expect(cursor).toBe(9)
    expect(sideEffects).toHaveLength(1)
    expect(sideEffects[0].type).toBe('create-asset')
  })

  it('WA-C-H3: if any action in a sequence fails, the caller can abort (content stays at last good state)', () => {
    let content = '春天来了。'
    const a1 = applyWritingAgentAction(content, {
      type: 'replace_range',
      range: { start: 0, end: 4 },
      text: '夏天到了。'
    })
    expect(a1.ok).toBe(true)
    content = a1.content  // caller would have applied this

    const a2 = applyWritingAgentAction(content, {
      type: 'create_asset',
      asset: { kind: 'meme', title: 't', content: 'c' }  // invalid kind
    })
    expect(a2.ok).toBe(false)
    // Caller would NOT apply a2.sideEffects and might roll back a1.
  })

  // ---------- I. Determinism ----------
  it('WA-C-I1: same action + same env.now produces same id (deterministic minting)', () => {
    const a1 = applyWritingAgentAction('正文', {
      type: 'create_asset',
      asset: { kind: 'event', title: '密室', content: '地下暗门' }
    }, { now: 1700000000000 })
    const a2 = applyWritingAgentAction('正文', {
      type: 'create_asset',
      asset: { kind: 'event', title: '密室', content: '地下暗门' }
    }, { now: 1700000000000 })
    expect(a1.sideEffects[0].asset.id).toBe(a2.sideEffects[0].asset.id)
  })
})
