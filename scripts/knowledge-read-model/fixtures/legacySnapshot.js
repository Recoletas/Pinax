/**
 * K0 legacy fixture — production "old shape" ONLY.
 *
 * Every field below exists in the current production schema (main f03e40f):
 * - worldbook/entry: worldStore normalizeWorldbook/addEntry
 * - geoHistory: historyGenerator buildNode + attachPlaceRefsToGeoHistory
 * - runtime: gameStore normalize* + runtimeEvents.createRuntimeEvent
 * - canonicalFacts: runtimeEvents.hasValidCanonicalFactRecord allowlist
 * - drafts: writingGhostCandidate shape
 * - memories: memoryCandidates createMemoryCandidate (v2)
 * - research: worldbookResearchClaims normalizeResearchClaims
 *
 * Field provenance is documented per-section in fixtures/README.md.
 * Two projects (book_a_001 / book_b_001) bind the SAME worldbook; each has
 * its own authorized snapshot with its own runtime — sharing a worldbook
 * never shares runtime facts.
 */

const WORLDBOOK_ID = 'wb_legacy_001'
const LEGACY_PLACE_ID = 'place:wb_legacy_001:map_linjiang:site-lincheng'

function buildSharedWorldbook() {
  return {
    id: WORLDBOOK_ID,
    name: '临江志',
    worldDescription: '临江城依山傍水，旧约与港税之争延续了两个纪元。',
    writingStyle: '沉稳，重细节',
    examples: '',
    forbidden: '',
    description: '',
    author: 'fixture',
    version: '1',
    createdAt: 1700000000000,
    updatedAt: 1700000123456,
    settings: { scanDepth: 2, tokenBudget: 4096, recursiveScanning: true },
    entries: [
      {
        id: 'entry_ch_001',
        name: '沈青梧',
        content: '城主府女官，掌文书。近来频繁出入港务司，似在追查旧约底档。',
        keys: ['沈青梧', '女官'],
        keysSecondary: ['港务司'],
        type: 'character',
        injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 4, excludeRecursion: false, group: null },
        relations: { tags: [], locations: [], characters: [], events: [] },
        metadata: {
          createdAt: 1700000001000,
          updatedAt: 1700000100000,
          importSource: 'manual',
          basis: 'creative',
          sourceRefs: ['S1'],
          claimIds: ['C2'],
          reviewState: 'ready',
          userTouched: true
        }
      },
      {
        id: 'entry_ch_002',
        name: '沈青梧',
        content: '百年前的临江剑客，与同名女官并无血缘。旧庙壁画或存其名。',
        keys: ['沈青梧', '剑客'],
        keysSecondary: ['旧庙'],
        type: 'character',
        injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 4, excludeRecursion: false, group: null },
        relations: { tags: [], locations: [], characters: [], events: [] },
        metadata: {
          createdAt: 1700000002000,
          updatedAt: 1700000101000,
          importSource: 'manual',
          basis: 'creative',
          sourceRefs: [],
          claimIds: [],
          reviewState: 'ready'
        }
      },
      {
        id: 'entry_loc_001',
        name: '临江城',
        aliases: ['临州', '江防旧城'],
        scale: 'city',
        content: '临江城为旧约核心之地。拓张纪元时港税归商会，动荡纪元后归城主府。',
        keys: ['临江城', '临州'],
        keysSecondary: ['江防'],
        type: 'location',
        injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 4, excludeRecursion: false, group: null },
        relations: {
          tags: [],
          locations: [{ type: 'part-of', targetId: '', targetName: '临江郡', status: 'resolved' }],
          characters: [],
          events: []
        },
        mapBinding: { status: 'confirmed', country: '临江郡', city: '临江城', scene: '城门' },
        metadata: {
          createdAt: 1700000003000,
          updatedAt: 1700000102000,
          importSource: 'place-catalog',
          basis: 'mixed',
          sourceRefs: ['S1'],
          claimIds: ['C1'],
          reviewState: 'ready',
          place: {
            schemaVersion: 1,
            name: '临江城',
            aliases: ['临州', '江防旧城'],
            kind: 'city',
            scale: 'city',
            reviewState: 'accepted',
            mapBinding: { status: 'confirmed', country: '临江郡', city: '临江城', scene: '城门' }
          }
        }
      },
      {
        id: 'entry_loc_002',
        name: '临江港',
        content: '临江城的外港，商会与城主府争夺港税的实际场所。',
        keys: ['临江港'],
        keysSecondary: [],
        type: 'location',
        injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 4, excludeRecursion: false, group: null },
        relations: { tags: [], locations: [], characters: [], events: [] },
        metadata: {
          createdAt: 1700000004000,
          updatedAt: 1700000103000,
          importSource: 'manual',
          basis: 'creative',
          sourceRefs: [],
          claimIds: [],
          reviewState: 'ready'
        }
      },
      {
        id: 'entry_rule_001',
        name: '税令规则',
        content: '凡涉及港税的交涉，须先援引旧约条文再谈新令。',
        keys: ['港税', '旧约'],
        keysSecondary: [],
        type: 'rule',
        injection: { mode: 'constant', probability: 100, cooldown: 0, depth: 0, excludeRecursion: false, group: null },
        relations: { tags: [], locations: [], characters: [], events: [] },
        metadata: {
          createdAt: 1700000005000,
          updatedAt: 1700000104000,
          importSource: 'manual',
          basis: 'creative',
          sourceRefs: [],
          claimIds: [],
          reviewState: 'ready'
        }
      },
      {
        id: 'entry_ch_deleted',
        name: '被删除的角色',
        content: '此条目对应的结构化角色已被作者删除（tombstone），不应复活。',
        keys: [],
        keysSecondary: [],
        type: 'character',
        injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 4, excludeRecursion: false, group: null },
        relations: { tags: [], locations: [], characters: [], events: [] },
        metadata: {
          createdAt: 1700000006000,
          updatedAt: 1700000105000,
          importSource: 'structured-setting',
          basis: 'research',
          sourceRefs: [],
          claimIds: [],
          reviewState: 'stale',
          structuredSettingRef: 'characters.protagonist',
          structuredCharacterKey: 'char-deleted-x'
        }
      }
    ],
    structuredCharacterTombstones: ['characters.protagonist:char-deleted-x'],
    structuredSettings: { 'characters.protagonist': { 'char-deleted-x': '旧稿' } },
    geoHistory: {
      version: 1,
      source: 'map-semantics-v1',
      seed: 'seed-linjiang-001',
      mapId: 'map_linjiang',
      semanticSiteCount: 2,
      ages: [
        { id: 'age-expansion', label: '拓张纪元', order: 1, key: 'expansion' },
        { id: 'age-strife', label: '动荡纪元', order: 2, key: 'strife' },
        { id: 'age-present', label: '当代', order: 3, key: 'present' }
      ],
      nodes: [
        {
          id: 'hn_lincheng_tax',
          title: '临江城·税权之争（第一幕）',
          yearLabel: '拓张纪元 · 纪元 12 年',
          ageId: 'age-expansion',
          type: 'tax-rights',
          summary: '港税旧约立约，商会取得拓张纪元的港税权。',
          mapBinding: { siteId: 'site-lincheng', cellIds: [3, 4], markerIds: ['mk_lincheng'], routeIds: [] },
          participants: { factions: ['商会'], characters: [], locations: ['临江城'], items: ['港税旧约'] },
          causes: ['航路开通'],
          consequences: ['商会势力扩张'],
          unresolvedHooks: [],
          entryIds: ['entry_loc_001'],
          playable: true,
          openingHook: '旧约签订之日，有商贾试探港防。',
          actionHooks: []
        },
        {
          id: 'hn_lincheng_siege',
          title: '临江城·围城之变（第二幕）',
          yearLabel: '动荡纪元 · 纪元 3 年',
          ageId: 'age-strife',
          type: 'siege',
          summary: '动荡纪元围城后，港税权转入城主府。',
          mapBinding: { siteId: 'site-lincheng', cellIds: [3, 4], markerIds: ['mk_lincheng'], routeIds: [] },
          participants: { factions: ['城主府', '商会'], characters: [], locations: ['临江城'], items: [] },
          causes: ['税权之争'],
          consequences: ['城主府掌港税'],
          unresolvedHooks: ['旧约原件下落不明'],
          entryIds: ['entry_loc_001'],
          playable: true,
          openingHook: '围城第七日，粮道先断。',
          actionHooks: []
        },
        {
          id: 'hn_harbor_dispute',
          title: '临江港·码头风波',
          yearLabel: '当代 · 纪元 1 年',
          ageId: 'age-present',
          type: 'dispute',
          summary: '当代码头税率再起争执，旧约抄件成为关键。',
          mapBinding: { siteId: 'site-harbor', cellIds: [7], markerIds: ['mk_harbor'], routeIds: [] },
          participants: { factions: ['商会'], characters: ['沈青梧'], locations: ['临江港'], items: ['旧约抄件'] },
          causes: ['围城之变'],
          consequences: [],
          unresolvedHooks: [],
          entryIds: ['entry_loc_002'],
          playable: false,
          openingHook: '',
          actionHooks: []
        }
      ],
      links: [
        { id: 'link_tax_siege', from: 'hn_lincheng_tax', to: 'hn_lincheng_siege', type: 'leads-to' },
        { id: 'link_siege_dispute', from: 'hn_lincheng_siege', to: 'hn_harbor_dispute', type: 'leads-to' },
        { id: 'link_cycle_back', from: 'hn_lincheng_siege', to: 'hn_lincheng_tax', type: 'leads-to' },
        { id: 'link_orphan', from: 'hn_lincheng_tax', to: 'hn_missing_node', type: 'leads-to' }
      ],
      entryBindings: [
        { nodeId: 'hn_lincheng_tax', siteId: 'site-lincheng', entryIds: ['entry_loc_001'] },
        { nodeId: 'hn_lincheng_siege', siteId: 'site-lincheng', entryIds: ['entry_loc_001'] },
        { nodeId: 'hn_harbor_dispute', siteId: 'site-harbor', entryIds: ['entry_loc_002'] }
      ],
      placeRefs: [
        {
          placeId: LEGACY_PLACE_ID,
          worldbookId: WORLDBOOK_ID,
          mapId: 'map_linjiang',
          siteId: 'site-lincheng',
          name: '临江城',
          semanticType: 'city',
          cellIds: [3, 4],
          markerIds: ['mk_lincheng'],
          routeIds: []
        }
      ]
    },
    research: {
      sources: [
        { id: 'S1', title: '临江郡志（节录）', kind: 'text', contentPreview: '……拓张纪元十二年，港税初定……' }
      ],
      claims: [
        {
          id: 'C1',
          type: 'history',
          text: '临江城的港税旧约签订于拓张纪元十二年。',
          basis: 'research',
          sourceRefs: ['S1'],
          evidenceRefs: [{ sourceId: 'S1', locator: 'p12', quote: '拓张纪元十二年，港税初定' }],
          confidence: 0.8,
          status: 'ready'
        },
        {
          id: 'C2',
          type: 'history',
          text: '沈青梧（女官）曾于动荡纪元初任职港务司。',
          basis: 'mixed',
          sourceRefs: ['S1'],
          evidenceRefs: [],
          confidence: 0.4,
          status: 'stale'
        }
      ],
      conflicts: [],
      review: { state: 'needs-review', needsReview: true, conflictCount: 0, staleClaimIds: ['C2'] },
      excludedSourceIds: [],
      revision: 'research_7'
    },
    groups: [],
    sourceDocuments: [],
    sourcePresetId: null,
    presetSignature: null
  }
}

function buildLegacyRuntime(projectId, { shenGoal, factValue }) {
  return {
    branchId: 'main',
    encounteredCharacters: [
      {
        id: 'char_shen_qingwu',
        name: '沈青梧',
        gender: '女',
        age: '二十六',
        traits: ['谨慎', '重旧诺'],
        description: '城主府女官，正在追查旧约底档。',
        goal: shenGoal,
        source: 'runtime',
        firstSeenAt: 1700001000000,
        lastSeenAt: 1700002000000
      },
      {
        id: 'char_bailu',
        name: '白鹭',
        gender: '女',
        age: '不详',
        traits: ['消息灵通'],
        description: '码头消息贩子。',
        goal: '打听码头风波',
        source: 'runtime',
        firstSeenAt: 1700001500000,
        lastSeenAt: 1700002000000
      }
    ],
    characterStates: {
      char_shen_qingwu: {
        status: '暗中调查',
        alive: true,
        placeId: LEGACY_PLACE_ID,
        goal: shenGoal,
        knowledgeRefs: ['chapter:3', 'evt_b_0002']
      },
      char_bailu: {
        status: '旁观',
        placeId: LEGACY_PLACE_ID,
        goal: '打听码头风波'
      }
    },
    placeStates: {
      [LEGACY_PLACE_ID]: { status: '紧张', controllerId: factValue, danger: 55 }
    },
    canonicalFacts: {
      fact_a_001: {
        subjectId: LEGACY_PLACE_ID,
        predicate: 'controlled-by',
        value: factValue,
        status: 'confirmed',
        confidence: 0.9,
        sourceRefs: ['chapter:3']
      },
      // 与 fact_a_001 同主体同谓词但值相反（legacy 无时间字段，无法用时间
      // 分开）——模型必须报告 conflict，而不是按 authority/顺序吞掉一边。
      fact_a_004: {
        subjectId: LEGACY_PLACE_ID,
        predicate: 'controlled-by',
        value: factValue === '商会' ? '城主府' : '商会',
        status: 'confirmed',
        sourceRefs: ['chapter:11']
      },
      fact_a_002: {
        subjectId: 'char_shen_qingwu',
        predicate: 'allegiance',
        value: '城主府',
        status: 'confirmed',
        sourceRefs: ['chapter:5']
      },
      fact_a_003: {
        subjectId: 'char_bailu',
        predicate: 'allegiance',
        value: '商会情报线',
        status: 'disputed',
        sourceRefs: ['chapter:9']
      }
    },
    events: [
      {
        v: 1, type: 'turn', id: 'evt_b_0001', parentId: '', branchId: 'main',
        ts: 1700001000000, source: 'user', payload: {}
      },
      {
        v: 1, type: 'state_delta', id: 'evt_b_0002', parentId: 'evt_b_0001', branchId: 'main',
        ts: 1700001100000, source: 'assistant',
        payload: { kind: 'emergent-event-v1', contextual: false, causes: ['码头风波'], consequences: [] }
      }
    ]
  }
}

function buildDrafts(projectId) {
  return [
    {
      schemaVersion: 1,
      kind: 'writing-ghost-candidate',
      id: 'ghost_001',
      mode: 'inline',
      text: '（试稿，未采纳）沈青梧把密信压进袖口，转身没入雨幕。守城门的老兵甚至没抬头。',
      target: {
        projectId,
        documentId: 'doc_main',
        role: 'manuscript',
        chapterId: 'ch_12',
        unitId: 'unit_9',
        unitRevision: 3,
        nodeId: 'node_31',
        nodeRevision: 7,
        caret: 142,
        documentRevision: 21
      },
      dependencyRevisions: {},
      manifestFingerprint: 'fp_fixture_001',
      runOutcome: { status: 'completed' },
      runSession: 'sess_fixture_001',
      contextCallReceipts: [],
      originRefs: [],
      sceneDelta: null,
      outlineDelta: null,
      requiresWholeAdoption: false,
      status: 'pending'
    }
  ]
}

function buildMemories(projectId) {
  return [
    {
      id: 'mem_001',
      schemaVersion: 2,
      scope: 'project',
      scopeId: projectId,
      kind: 'project-fact',
      content: '作者备忘：临江城税率争议源自港税旧约，旧约原件下落不明。',
      confidence: 0.9,
      sourceRefs: ['entry:entry_loc_001'],
      sourceRevision: 'wb:1700000123456',
      authority: 'accepted',
      derivedBy: 'explicit',
      status: 'active',
      createdAt: 1700003000000
    },
    {
      id: 'mem_002',
      schemaVersion: 2,
      scope: 'project',
      scopeId: projectId,
      kind: 'character-state',
      content: '旧记录：白鹭疑似为商会效力。',
      confidence: 0.5,
      sourceRefs: ['chapter:9'],
      sourceRevision: 'wb:1700000000000',
      authority: 'derived',
      derivedBy: 'boundary',
      status: 'stale',
      createdAt: 1700002000000
    }
  ]
}

/**
 * Project A snapshot: 《临江往事》 bound to the shared worldbook.
 * Project B snapshot: 《临江别传》, same worldbook, own runtime whose facts
 * deliberately DIFFER from A's (fact value 商会 vs 城主府).
 */
export function createLegacySnapshotA() {
  const worldbook = buildSharedWorldbook()
  return {
    schemaVersion: 1,
    project: { id: 'book_a_001', revision: 'proj_a_r7', worldbookId: WORLDBOOK_ID },
    worldbook,
    geoHistory: worldbook.geoHistory,
    timeline: null,
    runtime: buildLegacyRuntime('book_a_001', { shenGoal: '查清旧约底档', factValue: '商会' }),
    memories: buildMemories('book_a_001'),
    drafts: buildDrafts('book_a_001')
  }
}

export function createLegacySnapshotB() {
  const worldbook = buildSharedWorldbook()
  return {
    schemaVersion: 1,
    project: { id: 'book_b_001', revision: 'proj_b_r2', worldbookId: WORLDBOOK_ID },
    worldbook,
    geoHistory: worldbook.geoHistory,
    timeline: null,
    runtime: buildLegacyRuntime('book_b_001', { shenGoal: '替商会查账', factValue: '城主府' }),
    memories: buildMemories('book_b_001'),
    drafts: buildDrafts('book_b_001')
  }
}

export const LEGACY_FIXTURE_IDS = Object.freeze({
  worldbookId: WORLDBOOK_ID,
  legacyPlaceId: LEGACY_PLACE_ID,
  projectAId: 'book_a_001',
  projectBId: 'book_b_001',
  entryShenOfficial: 'entry_ch_001',
  entryShenSwordsman: 'entry_ch_002',
  entryLincheng: 'entry_loc_001',
  entryHarbor: 'entry_loc_002',
  entryRule: 'entry_rule_001',
  entryTombstoned: 'entry_ch_deleted',
  runtimeShenId: 'char_shen_qingwu',
  runtimeBailuId: 'char_bailu',
  nodeTax: 'hn_lincheng_tax',
  nodeSiege: 'hn_lincheng_siege',
  nodeHarbor: 'hn_harbor_dispute',
  ghostDraftId: 'ghost_001'
})
