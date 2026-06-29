import { describe, expect, it } from 'vitest'

import {
  WRITING_AGENT_CONTEXT_SCHEMA_VERSION,
  WRITING_TASK_TYPES,
  buildWritingAgentContext,
  getWritingQuickActions
} from '../services/writingAgentContext'

const FIXED_NOW = '2026-06-29T00:00:00.000Z'

const baseInput = {
  book: { id: 'b-1', title: '边境王国' },
  chapter: { id: 'c-1', title: '灰墙真相分岔', wordCount: 3200 },
  totalBooks: 2,
  totalChapters: 5,
  editorContent: '黄昏时分。\n\n索德把钥匙放在桌上。\n\n"这钥匙是灰墙难民营的巡骑留下的。"\n\n索德沉声说，*心想*他们失踪得太过蹊跷。',
  selection: { start: 6, end: 10, text: '黄昏时分。' },
  paragraph: {
    start: 0,
    end: 6,
    text: '黄昏时分。',
    rawText: '黄昏时分。'
  },
  cursor: 10,
  outlineItems: [
    {
      id: 'o-1',
      assetId: 'a-1',
      assetKind: 'evidence',
      title: '灰墙观测曲线停摆',
      content: '次日清晨观测点失守，停摆 14 小时。',
      schemaVersion: 1,
      source: { type: 'narrative-asset' }
    },
    {
      id: 'o-2',
      assetId: 'a-2',
      assetKind: 'character',
      title: '索德的钥匙',
      content: '灰墙难民营巡骑留下的钥匙，线索核心。',
      schemaVersion: 1,
      source: { type: 'chapter-note' }
    }
  ],
  referenceAsset: {
    id: 'a-2',
    kind: 'character',
    kindLabel: '角色',
    title: '索德',
    content: '灰墙夜班头目，掌握钥匙来源。',
    source: { type: 'chapter-note' }
  },
  inboxAssets: [
    { id: 'i-1', kind: 'event', kindLabel: '事件', title: '观测曲线停摆', content: '14 小时窗口证据' },
    { id: 'i-2', kind: 'character', kindLabel: '角色', title: '索德', content: '灰墙夜班头目' },
    { id: 'i-3', kind: 'evidence', kindLabel: '证据', title: '巡骑日志', content: '停摆前最后记录' }
  ],
  selectedInboxIds: ['i-1', 'i-3'],
  worldbook: {
    id: 'w-1',
    name: '边境王国',
    writingStyle: '克制悬疑的边境奇幻语气，重视潮湿港雾、势力谈判、线索递进。',
    forbidden: '不要直接揭示凶手。',
    examples: ''
  },
  worldbookStructuredSummary: '写作风格：克制悬疑。叙事视角：第三人称有限全知。基调：冷峻。',
  matchedEntries: [
    {
      id: 'me-1',
      title: '灰墙难民营',
      keywords: ['灰墙', '难民营', '失踪'],
      score: 0.86,
      content: '巡骑失踪据点。三面环山，只有一条木栅栏小路通入。'
    },
    {
      id: 'me-2',
      title: '索德的钥匙',
      keywords: ['索德', '钥匙'],
      score: 0.71,
      content: '灰墙夜班头目掌握的钥匙线索。'
    }
  ],
  writingConstraints: {
    style: '克制悬疑',
    perspective: '第三人称有限全知',
    tone: '冷峻',
    taboos: '不直接揭示凶手',
    consistency: '时间线以灯痕历 1173 年为准',
    references: ''
  }
}

describe('writingAgentContext — buildWritingAgentContext', () => {
  // ---------- A. Stable JSON envelope ----------
  it('A1: returns a stable JSON envelope with schemaVersion + generatedAt + all 11 top-level keys', () => {
    const ctx = buildWritingAgentContext(baseInput, { now: FIXED_NOW })
    expect(ctx.schemaVersion).toBe(WRITING_AGENT_CONTEXT_SCHEMA_VERSION)
    expect(ctx.generatedAt).toBe(FIXED_NOW)
    expect(Object.keys(ctx)).toEqual([
      'schemaVersion',
      'generatedAt',
      'scope',
      'selection',
      'paragraph',
      'cursor',
      'outline',
      'referenceAsset',
      'inbox',
      'worldbook',
      'writingConstraints',
      'routing',
      'taskCatalog'
    ])
    // Top-level JSON-serializable (no Date, no function, no Symbol).
    const json = JSON.stringify(ctx)
    expect(typeof json).toBe('string')
    const parsed = JSON.parse(json)
    expect(parsed.generatedAt).toBe(FIXED_NOW)
  })

  it('A2: produces identical envelope across two calls with the same input (excluding generatedAt when injected)', () => {
    const a = buildWritingAgentContext(baseInput, { now: FIXED_NOW })
    const b = buildWritingAgentContext(baseInput, { now: FIXED_NOW })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  // ---------- B. Scope / selection / paragraph / cursor ----------
  it('B1: scope reflects book + chapter ids, word count, totals', () => {
    const ctx = buildWritingAgentContext(baseInput, { now: FIXED_NOW })
    expect(ctx.scope).toEqual({
      bookId: 'b-1',
      bookTitle: '边境王国',
      chapterId: 'c-1',
      chapterTitle: '灰墙真相分岔',
      wordCount: 3200,
      totalBooks: 2,
      totalChapters: 5
    })
  })

  it('B2: selection snapshot captures hasSelection + range + text + length', () => {
    const ctx = buildWritingAgentContext(baseInput, { now: FIXED_NOW })
    expect(ctx.selection).toEqual({
      hasSelection: true,
      start: 6,
      end: 10,
      text: '黄昏时分。',
      length: 5
    })
  })

  it('B3: paragraph snapshot captures range + text + rawText + length', () => {
    const ctx = buildWritingAgentContext(baseInput, { now: FIXED_NOW })
    expect(ctx.paragraph).toEqual({
      hasParagraph: true,
      start: 0,
      end: 6,
      text: '黄昏时分。',
      rawText: '黄昏时分。',
      length: 5
    })
  })

  it('B4: cursor snapshot uses content.slice with upstream/downstream window and reports truncation', () => {
    const ctx = buildWritingAgentContext(baseInput, { now: FIXED_NOW })
    // cursor = 10; cursorBefore = 520; content length ≈ 70 chars; cursorAfter default = 240.
    // before = content.slice(0, 10) — first 10 chars ending at 把.
    // after = content.slice(10, 70) — all remaining chars (window is bigger than content).
    expect(ctx.cursor.position).toBe(10)
    expect(ctx.cursor.beforeStart).toBe(0)
    expect(ctx.cursor.before).toBe('黄昏时分。\n\n索德把')
    expect(ctx.cursor.after).toBe('钥匙放在桌上。\n\n"这钥匙是灰墙难民营的巡骑留下的。"\n\n索德沉声说，*心想*他们失踪得太过蹊跷。')
    expect(ctx.cursor.beforeTruncated).toBe(false)
    // cursorAfter window (240) > remaining content (≈ 60 chars), so no truncation.
    expect(ctx.cursor.afterTruncated).toBe(false)
    expect(ctx.cursor.afterEnd).toBe(baseInput.editorContent.length)
  })

  // ---------- C. Outline ----------
  it('C1: outline snapshot formats items + contextText (clip-aware)', () => {
    const ctx = buildWritingAgentContext(baseInput, { now: FIXED_NOW })
    expect(ctx.outline.count).toBe(2)
    expect(ctx.outline.items[0]).toMatchObject({
      id: 'o-1',
      assetId: 'a-1',
      assetKind: 'evidence',
      title: '灰墙观测曲线停摆',
      schemaVersion: 1,
      sourceType: 'narrative-asset'
    })
    expect(ctx.outline.contextText).toContain('【章节纲要】')
    expect(ctx.outline.contextText).toContain('1. 灰墙观测曲线停摆')
    expect(ctx.outline.contextText).toContain('2. 索德的钥匙')
  })

  it('C2: empty outline produces count=0 + empty contextText', () => {
    const ctx = buildWritingAgentContext(
      { ...baseInput, outlineItems: [] },
      { now: FIXED_NOW }
    )
    expect(ctx.outline.count).toBe(0)
    expect(ctx.outline.items).toEqual([])
    expect(ctx.outline.contextText).toBe('')
    expect(ctx.outline.contextTextTruncated).toBe(false)
  })

  // ---------- D. Reference asset ----------
  it('D1: referenceAsset surfaces id + kind + kindLabel + title + preview + contextText', () => {
    const ctx = buildWritingAgentContext(baseInput, { now: FIXED_NOW })
    expect(ctx.referenceAsset).toMatchObject({
      available: true,
      id: 'a-2',
      kind: 'character',
      kindLabel: '角色',
      title: '索德',
      sourceType: 'chapter-note',
      contentLength: 14,
      contentTruncated: false
    })
    expect(ctx.referenceAsset.contentPreview).toBe('灰墙夜班头目，掌握钥匙来源。')
    expect(ctx.referenceAsset.contextText).toContain('标题：索德')
    expect(ctx.referenceAsset.contextText).toContain('类型：角色')
    expect(ctx.referenceAsset.contextText).toContain('灰墙夜班头目，掌握钥匙来源。')
  })

  it('D2: missing referenceAsset returns null', () => {
    const ctx = buildWritingAgentContext(
      { ...baseInput, referenceAsset: null },
      { now: FIXED_NOW }
    )
    expect(ctx.referenceAsset).toBeNull()
  })

  // ---------- E. Inbox ----------
  it('E1: inbox.selectedSummary contains only the selected inbox assets, with preview + length', () => {
    const ctx = buildWritingAgentContext(baseInput, { now: FIXED_NOW })
    expect(ctx.inbox.total).toBe(3)
    expect(ctx.inbox.selectedCount).toBe(2)
    expect(ctx.inbox.selectedIds).toEqual(['i-1', 'i-3'])
    expect(ctx.inbox.selectedSummary).toHaveLength(2)
    expect(ctx.inbox.selectedSummary[0]).toMatchObject({
      id: 'i-1',
      kind: 'event',
      kindLabel: '事件',
      title: '观测曲线停摆',
      contentPreview: '14 小时窗口证据',
      contentLength: 9
    })
    expect(ctx.inbox.selectedSummary[1].id).toBe('i-3')
    expect(ctx.inbox.contextText).toContain('【已选素材】')
    expect(ctx.inbox.contextText).toContain('1. 事件 · 观测曲线停摆')
    expect(ctx.inbox.contextText).toContain('2. 证据 · 巡骑日志')
  })

  // ---------- F. Worldbook + matched entries ----------
  it('F1: worldbook snapshot surfaces writingStyle + forbidden + structuredSummary + matchedEntries', () => {
    const ctx = buildWritingAgentContext(baseInput, { now: FIXED_NOW })
    expect(ctx.worldbook.available).toBe(true)
    expect(ctx.worldbook.id).toBe('w-1')
    expect(ctx.worldbook.name).toBe('边境王国')
    expect(ctx.worldbook.writingStyle).toContain('克制悬疑')
    expect(ctx.worldbook.forbidden).toBe('不要直接揭示凶手。')
    expect(ctx.worldbook.structuredSummary).toContain('写作风格：克制悬疑')
    expect(ctx.worldbook.matchedEntryCount).toBe(2)
    expect(ctx.worldbook.matchedEntries[0]).toMatchObject({
      id: 'me-1',
      title: '灰墙难民营',
      keywordCount: 3,
      score: 0.86
    })
    expect(ctx.worldbook.contextText).toContain('【世界书文风】')
    expect(ctx.worldbook.contextText).toContain('【命中条目】')
    expect(ctx.worldbook.contextText).toContain('1. 灰墙难民营（score=0.86）')
  })

  it('F2: missing worldbook returns available=false + empty contextText', () => {
    const ctx = buildWritingAgentContext(
      { ...baseInput, worldbook: null, matchedEntries: [], worldbookStructuredSummary: '' },
      { now: FIXED_NOW }
    )
    expect(ctx.worldbook.available).toBe(false)
    expect(ctx.worldbook.id).toBeNull()
    expect(ctx.worldbook.name).toBeNull()
    expect(ctx.worldbook.matchedEntryCount).toBe(0)
    expect(ctx.worldbook.contextText).toBe('')
  })

  // ---------- G. Writing constraints ----------
  it('G1: writingConstraints captures structured fields + falls back to worldbook values', () => {
    const ctx = buildWritingAgentContext(baseInput, { now: FIXED_NOW })
    expect(ctx.writingConstraints).toEqual({
      style: '克制悬疑',
      perspective: '第三人称有限全知',
      tone: '冷峻',
      taboos: '不直接揭示凶手',
      consistency: '时间线以灯痕历 1173 年为准',
      references: null,
      worldbookWritingStyle: '克制悬疑的边境奇幻语气，重视潮湿港雾、势力谈判、线索递进。',
      worldbookForbidden: '不要直接揭示凶手。'
    })
  })

  // ---------- H. Routing hints ----------
  it('H1: routing flips correctly based on selection / paragraph / chapter / referenceAsset availability', () => {
    const full = buildWritingAgentContext(baseInput, { now: FIXED_NOW })
    expect(full.routing).toEqual({
      canFixSelection: true,
      canFixParagraph: true,
      canContinueLight: true,
      canCloseThread: true,
      canChapterHealth: true,
      canGenerateFromAsset: true,
      canExtractToAsset: true
    })

    const empty = buildWritingAgentContext({
      editorContent: 'no chapter / no selection / no asset'
    }, { now: FIXED_NOW })
    expect(empty.routing).toEqual({
      canFixSelection: false,
      canFixParagraph: false,
      canContinueLight: false,
      canCloseThread: false,
      canChapterHealth: false,
      canGenerateFromAsset: false,
      canExtractToAsset: false
    })
  })

  // ---------- I. Defensive reads ----------
  it('I1: undefined / null inputs do not throw and return safe defaults', () => {
    const ctx = buildWritingAgentContext(undefined, { now: FIXED_NOW })
    expect(ctx.scope.bookId).toBeNull()
    expect(ctx.scope.wordCount).toBe(0)
    expect(ctx.selection.hasSelection).toBe(false)
    expect(ctx.paragraph.hasParagraph).toBe(false)
    expect(ctx.cursor.position).toBe(0)
    expect(ctx.outline.count).toBe(0)
    expect(ctx.referenceAsset).toBeNull()
    expect(ctx.inbox.total).toBe(0)
    expect(ctx.inbox.selectedCount).toBe(0)
    expect(ctx.worldbook.available).toBe(false)
    expect(ctx.writingConstraints.style).toBeNull()
    expect(ctx.routing.canFixSelection).toBe(false)
    expect(ctx.taskCatalog).toEqual({ ...WRITING_TASK_TYPES })
  })

  it('I2: numeric coercion — NaN / Infinity fall back to 0', () => {
    const ctx = buildWritingAgentContext({
      ...baseInput,
      chapter: { id: 'c-1', title: 'X', wordCount: NaN },
      cursor: NaN,
      totalBooks: Infinity,
      totalChapters: -3
    }, { now: FIXED_NOW })
    expect(ctx.scope.wordCount).toBe(0)
    expect(ctx.scope.totalBooks).toBe(0) // Infinity clamps to MAX
    expect(ctx.scope.totalChapters).toBe(0) // -3 clamps to 0
    expect(ctx.cursor.position).toBe(0)
  })

  it('I3: long content gets clipped at the configured cursor window with sentence-boundary cut', () => {
    const longContent = '。'.repeat(2000) + '。'.repeat(2000)
    const ctx = buildWritingAgentContext({
      editorContent: longContent,
      cursor: 1500,
      selection: null,
      paragraph: null
    }, {
      now: FIXED_NOW,
      contextLimits: { cursorBefore: 80, cursorAfter: 40 }
    })
    expect(ctx.cursor.before.length).toBeLessThanOrEqual(80)
    expect(ctx.cursor.after.length).toBeLessThanOrEqual(40)
    expect(ctx.cursor.beforeTruncated).toBe(true)
    expect(ctx.cursor.afterTruncated).toBe(true)
  })

  it('I4: missing cursorPosition / cursor / selection.end falls back to 0', () => {
    const ctx = buildWritingAgentContext({
      editorContent: 'abc'
    }, { now: FIXED_NOW })
    expect(ctx.cursor.position).toBe(0)
    expect(ctx.cursor.before).toBe('')
    expect(ctx.cursor.after).toBe('abc')
  })

  it('I5: cursor never escapes editorContent bounds', () => {
    const ctx = buildWritingAgentContext({
      editorContent: 'short',
      cursor: 99999
    }, { now: FIXED_NOW })
    expect(ctx.cursor.position).toBe(5)
    expect(ctx.cursor.after).toBe('')
    expect(ctx.cursor.afterTruncated).toBe(false)
  })
})

describe('writingAgentContext — WRITING_TASK_TYPES catalog', () => {
  it('T1: catalog freezes the 7 task types so callers cannot mutate', () => {
    const expectedKeys = [
      'FIX_SELECTION',
      'FIX_PARAGRAPH',
      'CONTINUE_LIGHT',
      'CLOSE_THREAD',
      'CHAPTER_HEALTH',
      'GENERATE_FROM_ASSET',
      'EXTRACT_TO_ASSET'
    ]
    expect(Object.keys(WRITING_TASK_TYPES).sort()).toEqual(expectedKeys.sort())
    for (const value of Object.values(WRITING_TASK_TYPES)) {
      expect(value).toMatch(/^writing\.[a-z]+\.[a-z-]+$/)
    }
    // The envelope exposes a copy, not the frozen reference.
    expect(() => {
      WRITING_TASK_TYPES.FIX_SELECTION = 'mutated'
    }).toThrow()
    expect(WRITING_TASK_TYPES.FIX_SELECTION).toBe('writing.fix.selection')
  })
})

describe('writingAgentContext — getWritingQuickActions', () => {
  it('Q1: returns 7 actions with explicit taskType from the catalog', () => {
    const actions = getWritingQuickActions({
      hasSelection: true,
      hasParagraph: true,
      hasReferenceAsset: true
    })
    expect(actions).toHaveLength(7)
    for (const action of actions) {
      expect(action).toMatchObject({
        label: expect.any(String),
        question: expect.any(String),
        taskType: expect.any(String),
        scope: expect.any(String),
        disabled: expect.any(Boolean)
      })
      // taskType must come from the catalog — no `advisor.review.chapter` dumping.
      expect(Object.values(WRITING_TASK_TYPES)).toContain(action.taskType)
      expect(action.taskType).not.toBe('advisor.review.chapter')
    }
  })

  it('Q2: disabled flags reflect availability flags', () => {
    const nothing = getWritingQuickActions({})
    expect(nothing.find((a) => a.taskType === 'writing.fix.selection').disabled).toBe(true)
    expect(nothing.find((a) => a.taskType === 'writing.fix.paragraph').disabled).toBe(true)
    expect(nothing.find((a) => a.taskType === 'writing.generate.from-asset').disabled).toBe(true)
    expect(nothing.find((a) => a.taskType === 'writing.extract.to-asset').disabled).toBe(true)
    // Always-enabled actions stay on regardless of flags.
    expect(nothing.find((a) => a.taskType === 'writing.continue.light').disabled).toBe(false)
    expect(nothing.find((a) => a.taskType === 'writing.close.thread').disabled).toBe(false)
    expect(nothing.find((a) => a.taskType === 'writing.chapter.health').disabled).toBe(false)

    const allOn = getWritingQuickActions({
      hasSelection: true,
      hasParagraph: true,
      hasReferenceAsset: true
    })
    for (const action of allOn) {
      expect(action.disabled).toBe(false)
    }
  })

  it('Q3: legacy scope strings (selection / paragraph / continue / thread / chapter) are preserved so existing buildAdvisorActionTarget keeps working', () => {
    const actions = getWritingQuickActions({})
    const byType = Object.fromEntries(actions.map((a) => [a.taskType, a]))
    expect(byType['writing.fix.selection'].scope).toBe('selection')
    expect(byType['writing.fix.paragraph'].scope).toBe('paragraph')
    expect(byType['writing.continue.light'].scope).toBe('continue')
    expect(byType['writing.close.thread'].scope).toBe('thread')
    expect(byType['writing.chapter.health'].scope).toBe('chapter')
  })

  it('Q4: new actions (GENERATE_FROM_ASSET / EXTRACT_TO_ASSET) carry scoped strings for Window A pickup', () => {
    const actions = getWritingQuickActions({
      hasSelection: true,
      hasParagraph: true,
      hasReferenceAsset: true
    })
    const byType = Object.fromEntries(actions.map((a) => [a.taskType, a]))
    expect(byType['writing.generate.from-asset'].scope).toBe('reference-asset')
    expect(byType['writing.extract.to-asset'].scope).toBe('paragraph-or-selection')
    // Both are now enabled.
    expect(byType['writing.generate.from-asset'].disabled).toBe(false)
    expect(byType['writing.extract.to-asset'].disabled).toBe(false)
  })
})