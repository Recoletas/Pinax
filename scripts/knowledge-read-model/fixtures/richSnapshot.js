/**
 * K0 rich fixture — proposed rich shape, clearly separated from production.
 *
 * Everything under RICH-ONLY markers is a PROPOSED contract field that does
 * NOT exist in current production data (main f03e40f). The rich fixture
 * exists to prove what the read model COULD answer once such data exists —
 * it must never be reported as "existing archives already have this".
 *
 * RICH-ONLY fields here:
 * - snapshot.revision.{author, manuscript}        (author version ledger tip)
 * - snapshot.timeline (explicit ladder + eras)    (declared chronology)
 * - canonicalFacts[*].validDuring                 (story-time half-open interval)
 * - canonicalFacts[*].visibility                  (public/private/known-by)
 * - snapshot.knowledgeAssertions                  (who knows what, with basis)
 * - entry.visibility                              (worldbook-public excerpt)
 */

const WORLDBOOK_ID = 'wb_rich_001'
const RICH_TIMELINE_ID = 'timeline:linjiang-main'

export const RICH_TIMELINE = Object.freeze({
  id: RICH_TIMELINE_ID,
  eras: [
    { id: 'age-expansion', label: '拓张纪元', order: 1 },
    { id: 'age-strife', label: '动荡纪元', order: 2 },
    { id: 'age-present', label: '当代', order: 3 }
  ]
})

function buildRichWorldbook() {
  const base = {
    id: WORLDBOOK_ID,
    name: '临江志（rich 拟议）',
    worldDescription: '与 legacy 场景同构的世界，用于验证拟议丰富字段。',
    writingStyle: '沉稳',
    examples: '',
    forbidden: '',
    author: 'fixture',
    version: '1',
    createdAt: 1700000000000,
    updatedAt: 1700000123456,
    settings: { scanDepth: 2, tokenBudget: 4096, recursiveScanning: true },
    structuredCharacterTombstones: [],
    geoHistory: null,
    research: null,
    groups: [],
    sourceDocuments: []
  }
  base.entries = [
    {
      id: 'entry_ch_001',
      name: '沈青梧',
      content: '城主府女官，掌文书。',
      keys: ['沈青梧'],
      keysSecondary: [],
      type: 'character',
      injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 4, excludeRecursion: false, group: null },
      relations: { tags: [], locations: [], characters: [], events: [] },
      // RICH-ONLY: explicit visibility evidence for character perspectives.
      visibility: { level: 'public' },
      metadata: { createdAt: 1700000001000, updatedAt: 1700000100000, reviewState: 'ready' }
    },
    {
      id: 'entry_loc_001',
      name: '临江城',
      aliases: ['临州'],
      content: '临江城为旧约核心之地。',
      keys: ['临江城'],
      keysSecondary: [],
      type: 'location',
      injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 4, excludeRecursion: false, group: null },
      relations: { tags: [], locations: [], characters: [], events: [] },
      visibility: { level: 'public' },
      metadata: { createdAt: 1700000003000, updatedAt: 1700000102000, reviewState: 'ready' }
    },
    {
      id: 'entry_secret_order',
      name: '密约残部',
      content: '动荡纪元溃散后转入地下的旧部，仅沈青梧与白鹭知晓其联络暗号。',
      keys: ['密约'],
      keysSecondary: [],
      type: 'organization',
      injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 4, excludeRecursion: false, group: null },
      relations: { tags: [], locations: [], characters: [], events: [] },
      // RICH-ONLY: not public; knowledge flows through knowledgeAssertions.
      visibility: { level: 'private' },
      metadata: { createdAt: 1700000007000, updatedAt: 1700000107000, reviewState: 'ready' }
    }
  ]
  return base
}

export function createRichSnapshotA() {
  const worldbook = buildRichWorldbook()
  return {
    schemaVersion: 1,
    project: { id: 'book_rich_a', revision: 'proj_rich_a_r11', worldbookId: WORLDBOOK_ID },
    // RICH-ONLY: author + manuscript revision tips. v1 only serves these
    // exact values; older versions return unsupported.
    revision: { author: 'rev_11', manuscript: 'ms_11' },
    worldbook,
    geoHistory: null,
    // RICH-ONLY: explicit declared timeline (not derived from geoHistory).
    timeline: {
      id: RICH_TIMELINE_ID,
      eras: RICH_TIMELINE.eras.map((era) => ({ ...era }))
    },
    runtime: {
      branchId: 'main',
      encounteredCharacters: [
        { id: 'char_shen_qingwu', name: '沈青梧', description: '城主府女官。', source: 'runtime' },
        { id: 'char_bailu', name: '白鹭', description: '码头消息贩子。', source: 'runtime' },
        { id: 'char_wenxing', name: '文行', description: '港务司书吏，不知情者。', source: 'runtime' }
      ],
      characterStates: {
        char_shen_qingwu: { status: '暗中调查', placeId: 'place:rich:map:site-1', goal: '查清旧约' },
        char_bailu: { status: '旁观', placeId: 'place:rich:map:site-1', goal: '打听消息' },
        char_wenxing: { status: '当值', placeId: 'place:rich:map:site-1', goal: '抄税册' }
      },
      placeStates: {},
      canonicalFacts: {
        // RICH-ONLY fact block: validDuring + visibility.
        fact_r_taxguild: {
          subjectId: 'entry_loc_001',
          predicate: 'controlled-by',
          value: '商会',
          status: 'confirmed',
          confidence: 0.9,
          sourceRefs: ['chapter:3'],
          validDuring: {
            timelineId: RICH_TIMELINE_ID,
            start: { eraId: 'age-expansion', ordinal: 12 },
            end: { eraId: 'age-strife', ordinal: 1 },
            endSemantic: 'exclusive'
          },
          visibility: { level: 'public' }
        },
        fact_r_taxmanor: {
          subjectId: 'entry_loc_001',
          predicate: 'controlled-by',
          value: '城主府',
          status: 'confirmed',
          confidence: 0.9,
          sourceRefs: ['chapter:7'],
          validDuring: {
            timelineId: RICH_TIMELINE_ID,
            start: { eraId: 'age-strife', ordinal: 1 },
            end: null,
            endSemantic: 'open'
          },
          visibility: { level: 'public' }
        },
        // 秘密：只有沈青梧（本人）与白鹭（被明确告知）知道。
        fact_r_secret_alliance: {
          subjectId: 'char_shen_qingwu',
          predicate: 'secret-allegiance',
          value: '密约残部',
          status: 'confirmed',
          confidence: 0.7,
          sourceRefs: ['chapter:11'],
          validDuring: {
            timelineId: RICH_TIMELINE_ID,
            start: { eraId: 'age-strife', ordinal: 40 },
            end: null,
            endSemantic: 'unknown'
          },
          visibility: { level: 'known-by', characterIds: ['char_shen_qingwu', 'char_bailu'] }
        },
        // 无时间证据的拟议字段事实：timeApplicability 必须 unknown。
        fact_r_notemporal: {
          subjectId: 'char_shen_qingwu',
          predicate: 'tool-of-choice',
          value: '短刀',
          status: 'confirmed',
          sourceRefs: ['chapter:2'],
          visibility: { level: 'public' }
        }
      },
      events: [
        { v: 1, type: 'turn', id: 'evt_r_0001', parentId: '', branchId: 'main', ts: 1700001000000, source: 'user', payload: {} }
      ]
    },
    // RICH-ONLY: character knowledge assertions with explicit basis.
    knowledgeAssertions: [
      { characterId: 'char_shen_qingwu', refId: 'entry:entry_secret_order', basis: 'member', atTime: null },
      { characterId: 'char_bailu', refId: 'fact_r_secret_alliance', basis: 'told', atTime: null },
      { characterId: 'char_shen_qingwu', refId: 'fact_r_secret_alliance', basis: 'self', atTime: null }
    ],
    memories: [],
    drafts: []
  }
}

export const RICH_FIXTURE_IDS = Object.freeze({
  worldbookId: WORLDBOOK_ID,
  projectId: 'book_rich_a',
  timelineId: RICH_TIMELINE_ID,
  entrySecretOrder: 'entry_secret_order',
  runtimeShenId: 'char_shen_qingwu',
  runtimeBailuId: 'char_bailu',
  runtimeUnawareId: 'char_wenxing',
  factTaxGuild: 'fact_r_taxguild',
  factTaxManor: 'fact_r_taxmanor',
  factSecret: 'fact_r_secret_alliance',
  factNoTemporal: 'fact_r_notemporal'
})
