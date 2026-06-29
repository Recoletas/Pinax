import { describe, expect, it } from 'vitest'

import {
  REFERENCE_KIND_PRIORITY,
  REFERENCE_RANK_WEIGHTS,
  REFERENCE_SCHEMA_VERSION,
  buildAssetSummaryBlock,
  buildReferenceContext,
  rankAssetForReference,
  sortAssetsForReference
} from '../services/writingAgentReferences'

const NOW = Date.now()
const ONE_DAY_MS = 1000 * 60 * 60 * 24

function makeAsset(overrides = {}) {
  return {
    id: 'a-default',
    kind: 'inspiration',
    title: '默认素材',
    content: '默认素材内容。',
    status: 'inbox',
    projectId: 'b-1',
    source: { type: 'manual' },
    createdAt: NOW - 2 * ONE_DAY_MS,
    updatedAt: NOW - 2 * ONE_DAY_MS,
    ...overrides
  }
}

const SCOPE_CHAPTER = {
  currentChapterId: 'c-1',
  currentBookId: 'b-1',
  selectedInboxIds: []
}

describe('writingAgentReferences — REFERENCE_KIND_PRIORITY catalog', () => {
  it('K1: draft-prose is the highest priority; reference-image is the lowest', () => {
    expect(REFERENCE_KIND_PRIORITY['draft-prose']).toBe(1)
    expect(REFERENCE_KIND_PRIORITY['reference-image']).toBe(7)
    expect(REFERENCE_KIND_PRIORITY['draft-prose'])
      .toBeLessThan(REFERENCE_KIND_PRIORITY['reference-image'])
  })

  it('K2: catalog is frozen — caller mutation throws', () => {
    expect(() => {
      REFERENCE_KIND_PRIORITY['draft-prose'] = 99
    }).toThrow()
    expect(REFERENCE_KIND_PRIORITY['draft-prose']).toBe(1)
  })

  it('K3: covers every ASSET_KINDS value (defensive completeness)', () => {
    // The 7 narrative asset kinds from narrativeAssets.js must each
    // have a rank — otherwise rankAssetForReference falls back to 0
    // for the missing one and silently degrades.
    const expected = [
      'draft-prose', 'event', 'character-fact', 'storyboard-seed',
      'inspiration', 'worldbook-draft', 'reference-image'
    ]
    for (const kind of expected) {
      expect(REFERENCE_KIND_PRIORITY[kind], `missing rank for ${kind}`).toBeDefined()
    }
  })
})

describe('writingAgentReferences — rankAssetForReference', () => {
  it('R1: chapter-source asset outranks book-source asset outranks orphan asset', () => {
    const chapterAsset = makeAsset({ id: 'a-chap', source: { type: 'chapter', chapterId: 'c-1' } })
    const bookAsset = makeAsset({ id: 'a-book', projectId: 'b-1' })
    // Orphan must NOT match the current book — give it a different
    // projectId so the source-affinity check actually skips.
    const orphanAsset = makeAsset({ id: 'a-orphan', projectId: 'b-OTHER' })

    const chapRank = rankAssetForReference(chapterAsset, SCOPE_CHAPTER)
    const bookRank = rankAssetForReference(bookAsset, SCOPE_CHAPTER)
    const orphanRank = rankAssetForReference(orphanAsset, SCOPE_CHAPTER)

    expect(chapRank.score).toBeGreaterThan(bookRank.score)
    expect(bookRank.score).toBeGreaterThan(orphanRank.score)
    expect(chapRank.reasons).toContain('source-chapter-match')
    expect(bookRank.reasons).toContain('project-match')
  })

  it('R2: source-chapter from a different chapter gets a small penalty', () => {
    const otherChapter = makeAsset({ id: 'a-x', source: { type: 'chapter', chapterId: 'c-OTHER' } })
    const rank = rankAssetForReference(otherChapter, SCOPE_CHAPTER)
    expect(rank.components.chapterSource).toBe(-10)
    expect(rank.reasons).toContain('source-chapter-other')
  })

  it('R3: accepted status outranks inbox status outranks rejected/archived', () => {
    const accepted = makeAsset({ id: 'a-acc', status: 'accepted' })
    const inbox = makeAsset({ id: 'a-inb', status: 'inbox' })
    const rejected = makeAsset({ id: 'a-rej', status: 'rejected' })
    const archived = makeAsset({ id: 'a-arc', status: 'archived' })

    const accRank = rankAssetForReference(accepted, SCOPE_CHAPTER)
    const inbRank = rankAssetForReference(inbox, SCOPE_CHAPTER)
    const rejRank = rankAssetForReference(rejected, SCOPE_CHAPTER)
    const arcRank = rankAssetForReference(archived, SCOPE_CHAPTER)

    expect(accRank.score).toBeGreaterThan(inbRank.score)
    expect(inbRank.score).toBeGreaterThan(rejRank.score)
    // rejected and archived both get the stale penalty (-15) — they
    // tie because the user spec only differentiates active vs inactive,
    // not between the two inactive states.
    expect(rejRank.score).toBe(arcRank.score)
    expect(rejRank.reasons).toContain('status-rejected')
    expect(arcRank.reasons).toContain('status-archived')
  })

  it('R4: user-selected assets get a +50 selection bonus', () => {
    const selected = makeAsset({ id: 'a-sel' })
    const unselected = makeAsset({ id: 'a-uns' })
    const scopeWithSel = { ...SCOPE_CHAPTER, selectedInboxIds: ['a-sel'] }

    const selRank = rankAssetForReference(selected, scopeWithSel)
    const unsRank = rankAssetForReference(unselected, scopeWithSel)
    expect(selRank.components.selected).toBe(REFERENCE_RANK_WEIGHTS.selected)
    expect(selRank.score).toBeGreaterThan(unsRank.score + 30)
    expect(selRank.reasons).toContain('user-selected')
  })

  it('R5: recent assets outrank stale ones (recency bonus capped)', () => {
    // 1 day + 1 hour old → 1.04 days → recency ≈ recencyCap - 5 = 20
    const fresh = makeAsset({ id: 'a-fresh', updatedAt: NOW - (ONE_DAY_MS + 60 * 60 * 1000) })
    const stale = makeAsset({ id: 'a-stale', updatedAt: NOW - 365 * ONE_DAY_MS })
    const freshRank = rankAssetForReference(fresh, SCOPE_CHAPTER)
    const staleRank = rankAssetForReference(stale, SCOPE_CHAPTER)
    expect(freshRank.components.recency).toBeGreaterThan(0)
    expect(staleRank.components.recency).toBe(0)
    expect(freshRank.score).toBeGreaterThan(staleRank.score)
  })

  it('R6: kind priority — draft-prose outranks character-fact outranks reference-image', () => {
    const draft = makeAsset({ id: 'a-d', kind: 'draft-prose' })
    const character = makeAsset({ id: 'a-c', kind: 'character-fact' })
    const image = makeAsset({ id: 'a-i', kind: 'reference-image' })
    const dRank = rankAssetForReference(draft, SCOPE_CHAPTER)
    const cRank = rankAssetForReference(character, SCOPE_CHAPTER)
    const iRank = rankAssetForReference(image, SCOPE_CHAPTER)
    expect(dRank.score).toBeGreaterThan(cRank.score)
    expect(cRank.score).toBeGreaterThan(iRank.score)
    expect(dRank.reasons).toContain('kind-draft-prose')
  })

  it('R7: empty / null asset returns score 0 with safe defaults', () => {
    expect(rankAssetForReference(null, SCOPE_CHAPTER).score).toBe(0)
    expect(rankAssetForReference(undefined, SCOPE_CHAPTER).score).toBe(0)
    expect(rankAssetForReference({}, SCOPE_CHAPTER).score).toBe(0)
    expect(rankAssetForReference({ id: 'x' }, null).score).toBe(0)
  })
})

describe('writingAgentReferences — sortAssetsForReference', () => {
  it('S1: stable sort — high score first, ties preserve original order', () => {
    const list = [
      makeAsset({ id: 'a-1', kind: 'inspiration' }),
      makeAsset({ id: 'a-2', kind: 'draft-prose' }),
      makeAsset({ id: 'a-3', kind: 'event' }),
      makeAsset({ id: 'a-4', kind: 'character-fact' })
    ]
    const sorted = sortAssetsForReference(list, SCOPE_CHAPTER)
    expect(sorted.map((a) => a.id)).toEqual(['a-2', 'a-3', 'a-4', 'a-1'])
  })

  it('S2: pinned-style boost (selected) wins over better kind, all else equal', () => {
    const list = [
      makeAsset({ id: 'a-low-kind', kind: 'inspiration' }),
      makeAsset({ id: 'a-high-kind', kind: 'draft-prose' })
    ]
    const scope = { ...SCOPE_CHAPTER, selectedInboxIds: ['a-low-kind'] }
    const sorted = sortAssetsForReference(list, scope)
    expect(sorted[0].id).toBe('a-low-kind')
  })

  it('S3: empty / non-array input returns empty array', () => {
    expect(sortAssetsForReference([], SCOPE_CHAPTER)).toEqual([])
    expect(sortAssetsForReference(null, SCOPE_CHAPTER)).toEqual([])
    expect(sortAssetsForReference(undefined, SCOPE_CHAPTER)).toEqual([])
  })
})

describe('writingAgentReferences — buildAssetSummaryBlock', () => {
  it('B1: returns null for empty / non-object input', () => {
    expect(buildAssetSummaryBlock(null)).toBeNull()
    expect(buildAssetSummaryBlock(undefined)).toBeNull()
    expect(buildAssetSummaryBlock('foo')).toBeNull()
  })

  it('B2: includes title, kindLabel, sourceDetail, contentPreview in the block', () => {
    const asset = makeAsset({
      id: 'a-1',
      title: '索德',
      kind: 'character-fact',
      content: '灰墙夜班头目，掌握钥匙来源。',
      source: { type: 'chapter', chapterId: 'c-1' }
    })
    const block = buildAssetSummaryBlock(asset, { index: 0 })

    expect(block).toMatchObject({
      id: 'a-1',
      kind: 'character-fact',
      kindLabel: '人物事实',
      title: '索德',
      contentPreview: '灰墙夜班头目，掌握钥匙来源。',
      contentLength: 14,
      contentTruncated: false
    })
    expect(block.blockText).toContain('标题：索德')
    expect(block.blockText).toContain('类型：人物事实')
    expect(block.blockText).toContain('来源：')
    expect(block.blockText).toContain('灰墙夜班头目')
  })

  it('B3: clips long content at the configured per-asset budget and reports truncation', () => {
    const long = 'A'.repeat(800)
    const block = buildAssetSummaryBlock(
      makeAsset({ id: 'a-long', content: long }),
      { contentMaxChars: 120 }
    )
    expect(block.contentPreview.length).toBeLessThanOrEqual(120)
    expect(block.contentTruncated).toBe(true)
  })

  it('B4: missing source / kind / timestamp gracefully degrade (no error, no "undefined" string)', () => {
    const block = buildAssetSummaryBlock({
      id: 'a-bare',
      content: '裸素材，无 source 无 kind。'
    })
    expect(block.kindLabel).toBe('素材') // fallback from narrativeAssets
    expect(block.sourceDetail).toBeNull()
    expect(block.updatedAt).toBeNull()
    expect(block.blockText).not.toContain('undefined')
    expect(block.blockText).toContain('裸素材')
  })

  it('B5: index prefix is added when caller passes an index', () => {
    const a = buildAssetSummaryBlock(makeAsset({ id: 'x', content: 'A' }), { index: 0 })
    const b = buildAssetSummaryBlock(makeAsset({ id: 'y', content: 'B' }), { index: 4 })
    expect(a.blockText).toMatch(/^\[1\] /)
    expect(b.blockText).toMatch(/^\[5\] /)
  })
})

describe('writingAgentReferences — buildReferenceContext', () => {
  it('C1: empty input returns empty contextText + zero-chars budget report', () => {
    const out = buildReferenceContext({})
    expect(out.schemaVersion).toBe(REFERENCE_SCHEMA_VERSION)
    expect(out.contextText).toBe('')
    expect(out.referenceAsset).toBeNull()
    expect(out.inboxBlocks).toEqual([])
    expect(out.outlineBlock.blockText).toBe('')
    expect(out.budgetReport.usedChars).toBe(0)
    expect(out.budgetReport.overflowed).toBe(false)
    expect(out.budgetReport.assetBlocksIncluded).toBe(0)
    expect(out.budgetReport.assetBlocksDropped).toBe(0)
  })

  it('C2: outline gets its own reserved slot — clipped at outlineChars, not totalChars', () => {
    const longOutline = '1. 条目一\n内容\n\n2. 条目二\n内容'.repeat(50)
    const out = buildReferenceContext({
      outlineContext: `【章节纲要】\n${longOutline}`,
      budget: { totalChars: 800, outlineChars: 200 }
    })
    expect(out.outlineBlock.truncated).toBe(true)
    expect(out.outlineBlock.blockText.length).toBeLessThanOrEqual(200)
  })

  it('C3: pinned reference asset always included even when it overflows total budget', () => {
    const longContent = 'X'.repeat(900)
    const out = buildReferenceContext({
      referenceAsset: makeAsset({ id: 'a-pin', content: longContent }),
      budget: { totalChars: 500, perAssetChars: 900, outlineChars: 0 }
    })
    expect(out.referenceAsset).not.toBeNull()
    expect(out.budgetReport.assetBlocksIncluded).toBe(1)
    expect(out.budgetReport.overflowed).toBe(true)
  })

  it('C4: ranked inbox entries fill the remaining budget; lowest-scored drop first', () => {
    const high = makeAsset({
      id: 'a-high',
      kind: 'draft-prose',
      status: 'accepted',
      source: { type: 'chapter', chapterId: 'c-1' },
      content: '高优先级素材。'.repeat(20)
    })
    const low = makeAsset({
      id: 'a-low',
      kind: 'inspiration',
      status: 'rejected',
      projectId: 'b-OTHER',
      content: '低优先级素材。'.repeat(20)
    })
    const out = buildReferenceContext({
      inboxAssets: [low, high],
      currentChapterId: 'c-1',
      currentBookId: 'b-1',
      budget: { totalChars: 250, perAssetChars: 100, outlineChars: 0 }
    })

    expect(out.inboxBlocks.map((b) => b.id)).toEqual(['a-high'])
    expect(out.budgetReport.assetBlocksIncluded).toBe(1)
    expect(out.budgetReport.assetBlocksDropped).toBe(1)
    expect(out.droppedAssets).toEqual(['a-low'])
    expect(out.contextText).toContain('【已选素材】')
    expect(out.contextText).not.toContain('低优先级素材')
  })

  it('C5: user-selected entries get a +50 boost — selected beats higher-kind unselected when budget tight', () => {
    const selected = makeAsset({
      id: 'a-sel',
      kind: 'inspiration',
      status: 'inbox',
      content: '用户手动选中的素材。'.repeat(15)
    })
    const higherKind = makeAsset({
      id: 'a-kind',
      kind: 'draft-prose',
      status: 'inbox',
      content: '高优先级类型的素材。'.repeat(15)
    })
    const out = buildReferenceContext({
      inboxAssets: [higherKind, selected],
      currentChapterId: 'c-1',
      selectedInboxIds: ['a-sel'],
      budget: { totalChars: 200, perAssetChars: 80, outlineChars: 0 }
    })

    expect(out.inboxBlocks.map((b) => b.id)).toContain('a-sel')
    // Either could fit under tight budget — assert at least one shows.
    expect(out.inboxBlocks.length).toBeGreaterThanOrEqual(1)
  })

  it('C6: pinned + selected inbox compose in prompt order (outline → pinned → inbox)', () => {
    const out = buildReferenceContext({
      referenceAsset: makeAsset({ id: 'a-pin', title: '钉素材', kind: 'event', content: 'X' }),
      inboxAssets: [
        makeAsset({ id: 'a-inb', title: '收件箱素材', kind: 'inspiration', content: 'Y' })
      ],
      selectedInboxIds: ['a-inb'],
      outlineContext: '【章节纲要】\n1. 纲要条目',
      currentChapterId: 'c-1',
      currentBookId: 'b-1',
      budget: { totalChars: 1500, perAssetChars: 360, outlineChars: 600 }
    })

    expect(out.contextText).toContain('【章节纲要】')
    expect(out.contextText).toContain('【参考素材】')
    expect(out.contextText).toContain('【已选素材】')

    const idxOutline = out.contextText.indexOf('【章节纲要】')
    const idxRef = out.contextText.indexOf('【参考素材】')
    const idxInbox = out.contextText.indexOf('【已选素材】')
    expect(idxOutline).toBeLessThan(idxRef)
    expect(idxRef).toBeLessThan(idxInbox)
  })

  it('C7: pinned asset id is deduplicated from the inbox list', () => {
    const shared = makeAsset({ id: 'a-shared', kind: 'event', content: '同时存在' })
    const out = buildReferenceContext({
      referenceAsset: { ...shared, title: '钉版本' },
      inboxAssets: [{ ...shared, title: '收件箱版本' }],
      currentChapterId: 'c-1',
      budget: { totalChars: 1500 }
    })

    // Only one block for the shared id (the pinned version).
    const sharedCount = out.blocks.filter((b) => b.blockText.includes('同时存在')).length
    expect(sharedCount).toBe(1)
    expect(out.contextText).toContain('钉版本')
    expect(out.contextText).not.toContain('收件箱版本')
  })

  it('C8: budget report tracks used / remaining / overflowed accurately', () => {
    // Pinned asset alone is 500 chars; budget is 200 → overflow.
    const out = buildReferenceContext({
      referenceAsset: makeAsset({ id: 'a-pin', content: 'X'.repeat(500) }),
      outlineContext: '【章节纲要】\n' + 'Y'.repeat(50),
      budget: { totalChars: 200, perAssetChars: 500, outlineChars: 50 }
    })

    expect(out.budgetReport.usedChars).toBe(out.contextText.length)
    expect(out.budgetReport.remainingChars).toBeLessThanOrEqual(0)
    expect(out.budgetReport.overflowed).toBe(true)
    // outline still consumed its reserved slot (50 chars) and pinned
    // asset always includes even past budget.
    expect(out.budgetReport.usedChars).toBeGreaterThanOrEqual(50)
    expect(out.budgetReport.assetBlocksIncluded).toBe(1)
  })

  it('C9: defensive reads — null / string / undefined inputs do not throw', () => {
    expect(() => buildReferenceContext(null)).not.toThrow()
    expect(() => buildReferenceContext(undefined)).not.toThrow()
    expect(() => buildReferenceContext({ referenceAsset: 'foo' })).not.toThrow()
    expect(() => buildReferenceContext({
      referenceAsset: null,
      inboxAssets: 'not-an-array',
      selectedInboxIds: null,
      outlineContext: null,
      currentChapterId: '',
      currentBookId: ''
    })).not.toThrow()
  })

  it('C10: budget cap drops additional selected inbox entries (per-asset cap takes effect)', () => {
    const assets = []
    for (let i = 0; i < 5; i += 1) {
      assets.push(makeAsset({
        id: `a-${i}`,
        title: `素材 ${i}`,
        kind: 'event',
        content: 'A'.repeat(120),
        status: 'accepted'
      }))
    }
    const out = buildReferenceContext({
      inboxAssets: assets,
      selectedInboxIds: assets.map((a) => a.id),
      currentChapterId: 'c-1',
      currentBookId: 'b-1',
      budget: { totalChars: 360, perAssetChars: 120, outlineChars: 0 }
    })
    // 360 / 120 = 3 blocks max under tight budget
    expect(out.inboxBlocks.length).toBeLessThanOrEqual(3)
    expect(out.budgetReport.assetBlocksDropped).toBeGreaterThanOrEqual(2)
  })
})

describe('writingAgentReferences — integration shape', () => {
  it('I1: buildReferenceContext output is JSON-serializable (no functions / dates / symbols)', () => {
    const out = buildReferenceContext({
      referenceAsset: makeAsset({ id: 'a-pin', content: 'X' }),
      inboxAssets: [makeAsset({ id: 'a-1', content: 'Y' })],
      outlineContext: '【章节纲要】\n1. Z',
      currentChapterId: 'c-1',
      currentBookId: 'b-1'
    })
    const json = JSON.stringify(out)
    expect(typeof json).toBe('string')
    const parsed = JSON.parse(json)
    expect(parsed.contextText.length).toBeGreaterThan(0)
  })

  it('I2: droppedAssets list contains only asset ids (no full objects leaking into the prompt path)', () => {
    const out = buildReferenceContext({
      inboxAssets: [
        makeAsset({ id: 'a-1', content: 'A'.repeat(500), kind: 'inspiration' }),
        makeAsset({ id: 'a-2', content: 'B'.repeat(50), kind: 'draft-prose', status: 'accepted' })
      ],
      currentChapterId: 'c-1',
      budget: { totalChars: 100, perAssetChars: 60 }
    })
    expect(out.droppedAssets.every((id) => typeof id === 'string')).toBe(true)
  })
})