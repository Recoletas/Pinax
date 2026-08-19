/**
 * Task 1：极小关系包 fixture 契约（minimal relation pack A/B）。
 *
 * 复用 CROSS_SECTION_FIXTURES 的基础事实与角色，不复制底稿；
 * 每个 fixture 追加 1–2 条活跃关系包、关系来源（provenance）与
 * 双条件共用的 relationshipGroundTruth。
 */
import { CROSS_SECTION_FIXTURES } from './novel-cross-section-fixtures.mjs'

export const RELATION_FIXTURE_SCHEMA_VERSION = 1

export const RELATION_PACK_LIMITS = Object.freeze({
  maxRelations: 2,
  relationFrame: 60,
  cueCount: 2,
  cue: 30,
  sharedAnchor: 50,
  openTension: 60,
  relationTotal: 250,
  activeRelationsTotal: 400
})

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.getOwnPropertyNames(value)) deepFreeze(value[key])
    for (const key of Object.getOwnPropertySymbols(value)) deepFreeze(value[key])
  }
  return value
}

const relationFixture = (baseId, enrichment) => {
  const base = CROSS_SECTION_FIXTURES.find(({ id }) => id === baseId)
  return { ...base, ...enrichment }
}

export const CROSS_SECTION_RELATION_FIXTURES = deepFreeze([
  relationFixture('canal-ledger', {
    relationSources: [
      {
        refType: 'history-node',
        refId: 'canal-shared-convoy',
        summary: '两人多年前在同一支漕运队共事，检查官曾欠信使一次夜航引路。'
      }
    ],
    sharedAnchors: [
      { text: '两人都记得那年夜航走的是北汊水道', knownTo: ['inspector', 'messenger'] }
    ],
    declaredContradictions: [],
    activeRelations: [
      {
        pair: ['inspector', 'messenger'],
        relationFrame: '职务对峙；两人多年前在同一支漕运队共事，彼此知底',
        interactionCues: [
          '检查官称呼信使全名时已在准备让步',
          '信使提到夜航就会放慢语速'
        ],
        sharedAnchor: '两人都记得那年夜航走的是北汊水道',
        openTension: {
          text: '检查官始终没有还那次引路的人情',
          sourceRef: { refType: 'history-node', refId: 'canal-shared-convoy' }
        }
      }
    ],
    relationshipGroundTruth: {
      establishedSignals: [
        '两人对话中夹杂旧日共事的称呼或称呼变化',
        '职务冲突里保留一条私人的、无法公开的让步通道'
      ],
      prohibitedInventions: [
        '两人是亲属或恋人',
        '旧日共事之外新增未提供的共同经历'
      ],
      evaluatorNote: '不透露实验分组，只说明两人是旧日同僚、如今隔着一道关卡命令。'
    }
  }),
  relationFixture('birthday-recorder', {
    relationSources: [
      {
        refType: 'history-node',
        refId: 'birthday-recorder-gap',
        summary: '生日宴当天录音机里缺失的一分钟，母亲始终没有解释。'
      },
      {
        refType: 'history-node',
        refId: 'mother-daughter-care-years',
        summary: '成年女儿长期照顾母亲，同时拒绝再被她安排生活。'
      }
    ],
    sharedAnchors: [
      { text: '两人都知道录音机里缺失了一分钟', knownTo: ['daughter', 'mother'] }
    ],
    declaredContradictions: [],
    activeRelations: [
      {
        pair: ['daughter', 'mother'],
        relationFrame: '母女；成年女儿长期照顾母亲，但拒绝再被她安排生活',
        interactionCues: [
          '女儿平时叫"妈"，真正生气时改叫母亲全名',
          '母亲被问到父亲去世时，会立即转向家务'
        ],
        sharedAnchor: '两人都知道录音机里缺失了一分钟',
        openTension: {
          text: '母亲一直没有解释那一分钟',
          sourceRef: { refType: 'history-node', refId: 'birthday-recorder-gap' }
        }
      },
      {
        pair: ['mother', 'uncle'],
        relationFrame: '姐弟；母亲默认舅舅替家里收拾局面，舅舅早已不耐烦',
        interactionCues: [
          '舅舅用旧绰号叫母亲，母亲从不回应那个称呼'
        ],
        sharedAnchor: null,
        openTension: null
      }
    ],
    relationshipGroundTruth: {
      establishedSignals: [
        '女儿对母亲的照顾里带着疲惫的惯性',
        '母亲的回避动作指向同一个未解释的缺口',
        '舅舅的圆滑是在替姐姐维持体面'
      ],
      prohibitedInventions: [
        '缺失的一分钟内容被任何角色直接讲出',
        '新增父亲生前的具体事件或遗嘱'
      ],
      evaluatorNote: '不透露实验分组，只说明母女长期同住、舅舅是家中调停人。'
    }
  }),
  relationFixture('orbital-airlock-key', {
    relationSources: [
      {
        refType: 'history-node',
        refId: 'airlock-old-shifts',
        summary: '工程师与医官曾在三次舱段事故中同值班，形成固定分工。'
      }
    ],
    sharedAnchors: [
      { text: '两人都记得上次舱压事故时谁先松了手', knownTo: ['engineer', 'medic'] }
    ],
    declaredContradictions: [],
    activeRelations: [
      {
        pair: ['engineer', 'medic'],
        relationFrame: '危机搭档；多次同舱事故磨出的固定分工，互不客套',
        interactionCues: [
          '工程师报数据时医官直接接下半句',
          '医官反对时只叫工程师的岗位代号'
        ],
        sharedAnchor: '两人都记得上次舱压事故时谁先松了手',
        openTension: {
          text: '上次事故中松手的人一直没有被点破',
          sourceRef: { refType: 'history-node', refId: 'airlock-old-shifts' }
        }
      }
    ],
    relationshipGroundTruth: {
      establishedSignals: [
        '两人协作时跳过寒暄，直接进入分工',
        '默契之下留着一件谁都不提的旧事'
      ],
      prohibitedInventions: [
        '两人是亲属',
        '新增未提供的共事事故细节'
      ],
      evaluatorNote: '不透露实验分组，只说明二人是多次危机里搭出来的老搭档。'
    }
  }),
  relationFixture('temple-debt-token', {
    relationSources: [
      {
        refType: 'history-node',
        refId: 'temple-old-collection',
        summary: '收债人多年前来寺里收过一次债，见过还是学徒的老师。'
      }
    ],
    sharedAnchors: [
      { text: '两人都知道这间偏殿上次彻夜亮灯是为了收债', knownTo: ['collector', 'novice'] }
    ],
    declaredContradictions: [],
    activeRelations: [
      {
        pair: ['collector', 'novice'],
        relationFrame: '债务两端的旧识；收债人认识老师的过去，见习者只知道规矩',
        interactionCues: [
          '收债人提到"你师父"时改用账簿上的全名',
          '见习者紧张时把问题改成上香的请求'
        ],
        sharedAnchor: '两人都知道这间偏殿上次彻夜亮灯是为了收债',
        openTension: {
          text: '收债人没有说明上次那笔债的结局',
          sourceRef: { refType: 'history-node', refId: 'temple-old-collection' }
        }
      }
    ],
    relationshipGroundTruth: {
      establishedSignals: [
        '收债人的熟练里带着对旧寺的熟稔',
        '见习者的礼数是在替老师挡'
      ],
      prohibitedInventions: [
        '收债人与老师有血缘',
        '新增未提供的旧债细节'
      ],
      evaluatorNote: '不透露实验分组，只说明收债人是旧识、见习者守着师门规矩。'
    }
  })
])

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const isText = value => typeof value === 'string' && value.trim().length > 0
const codePoints = value => [...String(value || '')].length

const invalid = (code, context = {}) => ({
  valid: false,
  error: Object.fromEntries(
    [['code', code], ['fixtureId', context.fixtureId], ['pair', context.pair]]
      .filter(([, value]) => value !== undefined)
  )
})

/**
 * 严格校验关系 fixture；返回 typed result，不抛异常。
 */
export function validateCrossSectionRelationFixtures(fixtures) {
  if (!Array.isArray(fixtures) || fixtures.length < 1) return invalid('CROSS_SECTION_RELATION_INVALID_INPUT')
  if (fixtures.length > CROSS_SECTION_FIXTURES.length) {
    return invalid('CROSS_SECTION_RELATION_INVALID_INPUT')
  }
  const baseById = new Map(CROSS_SECTION_FIXTURES.map(fixture => [fixture.id, fixture]))
  const seenFixtureIds = new Set()

  for (const fixture of fixtures) {
    if (!isRecord(fixture)) return invalid('CROSS_SECTION_RELATION_INVALID_INPUT')
    const fixtureId = fixture.id
    const context = { fixtureId }
    const base = baseById.get(fixtureId)
    if (!base) return invalid('CROSS_SECTION_RELATION_FIXTURE_UNKNOWN', context)
    if (seenFixtureIds.has(fixtureId)) return invalid('CROSS_SECTION_RELATION_INVALID_INPUT', context)
    seenFixtureIds.add(fixtureId)

    if (!Array.isArray(fixture.relationSources) || fixture.relationSources.length === 0) {
      return invalid('CROSS_SECTION_RELATION_SOURCE_MISSING', context)
    }
    const sourceIds = new Set(fixture.relationSources.map(source => source?.refId))
    for (const source of fixture.relationSources) {
      if (!isRecord(source) || !isText(source.refType) || !isText(source.refId)) {
        return invalid('CROSS_SECTION_RELATION_SOURCE_INVALID', context)
      }
    }
    if (!Array.isArray(fixture.sharedAnchors)) {
      return invalid('CROSS_SECTION_RELATION_ANCHOR_SCOPE_MISSING', context)
    }
    const declaredContradictions = Array.isArray(fixture.declaredContradictions)
      ? fixture.declaredContradictions
      : []

    const charactersById = new Map(base.characters.map(character => [character.id, character]))
    const relations = fixture.activeRelations
    if (!Array.isArray(relations) || relations.length < 1) {
      return invalid('CROSS_SECTION_RELATION_COUNT', context)
    }
    if (relations.length > RELATION_PACK_LIMITS.maxRelations) {
      return invalid('CROSS_SECTION_RELATION_COUNT', context)
    }

    const seenPairs = new Set()
    let activeTotal = 0
    for (const relation of relations) {
      if (!isRecord(relation)) return invalid('CROSS_SECTION_RELATION_INVALID_INPUT', context)
      const pairContext = { ...context, pair: Array.isArray(relation.pair) ? relation.pair : undefined }

      if (!Array.isArray(relation.pair) || relation.pair.length !== 2) {
        return invalid('CROSS_SECTION_RELATION_PAIR_INVALID', pairContext)
      }
      const [first, second] = relation.pair
      if (first === second) return invalid('CROSS_SECTION_RELATION_PAIR_INVALID', pairContext)
      if ([...relation.pair].sort().join('\u0000') !== relation.pair.join('\u0000')) {
        return invalid('CROSS_SECTION_RELATION_PAIR_UNSORTED', pairContext)
      }
      for (const characterId of relation.pair) {
        if (!charactersById.has(characterId)) {
          return invalid('CROSS_SECTION_RELATION_CHARACTER_UNKNOWN', pairContext)
        }
      }
      const pairKey = [...relation.pair].sort().join('|')
      if (seenPairs.has(pairKey)) return invalid('CROSS_SECTION_RELATION_PAIR_DUPLICATE', pairContext)
      seenPairs.add(pairKey)

      if (!isText(relation.relationFrame)) {
        return invalid('CROSS_SECTION_RELATION_FRAME_REQUIRED', pairContext)
      }
      if (codePoints(relation.relationFrame) > RELATION_PACK_LIMITS.relationFrame) {
        return invalid('CROSS_SECTION_RELATION_FRAME_TOO_LONG', pairContext)
      }

      const cues = Array.isArray(relation.interactionCues) ? relation.interactionCues : []
      if (cues.length > RELATION_PACK_LIMITS.cueCount) {
        return invalid('CROSS_SECTION_RELATION_CUE_COUNT', pairContext)
      }
      const characterNames = relation.pair.map(id => charactersById.get(id)?.name || '')
      for (const cue of cues) {
        if (!isText(cue)) return invalid('CROSS_SECTION_RELATION_CUE_INVALID', pairContext)
        if (codePoints(cue) > RELATION_PACK_LIMITS.cue) {
          return invalid('CROSS_SECTION_RELATION_CUE_TOO_LONG', pairContext)
        }
        if (/^(对方|另一人|彼此)/.test(cue.trim())
          || !characterNames.some(name => name && cue.includes(name))) {
          return invalid('CROSS_SECTION_RELATION_CUE_ACTOR_MISSING', pairContext)
        }
        if (declaredContradictions.includes(cue)) {
          return invalid('CROSS_SECTION_RELATION_CONTRADICTION_DECLARED', pairContext)
        }
      }

      let relationTotal = codePoints(relation.relationFrame)
        + cues.reduce((total, cue) => total + codePoints(cue), 0)

      if (relation.sharedAnchor != null) {
        if (!isText(relation.sharedAnchor)) {
          return invalid('CROSS_SECTION_RELATION_ANCHOR_INVALID', pairContext)
        }
        if (codePoints(relation.sharedAnchor) > RELATION_PACK_LIMITS.sharedAnchor) {
          return invalid('CROSS_SECTION_RELATION_ANCHOR_TOO_LONG', pairContext)
        }
        const declared = fixture.sharedAnchors.find(entry => (
          entry?.text === relation.sharedAnchor
          && Array.isArray(entry.knownTo)
          && relation.pair.every(id => entry.knownTo.includes(id))
        ))
        if (!declared) return invalid('CROSS_SECTION_RELATION_ANCHOR_NOT_SHARED', pairContext)
        relationTotal += codePoints(relation.sharedAnchor)
      }

      if (relation.openTension != null) {
        if (!isRecord(relation.openTension) || !isText(relation.openTension.text)) {
          return invalid('CROSS_SECTION_RELATION_TENSION_INVALID', pairContext)
        }
        if (codePoints(relation.openTension.text) > RELATION_PACK_LIMITS.openTension) {
          return invalid('CROSS_SECTION_RELATION_TENSION_TOO_LONG', pairContext)
        }
        const sourceRef = relation.openTension.sourceRef
        if (!isRecord(sourceRef) || !isText(sourceRef.refId) || !sourceIds.has(sourceRef.refId)) {
          return invalid('CROSS_SECTION_RELATION_SOURCE_UNKNOWN', pairContext)
        }
        relationTotal += codePoints(relation.openTension.text)
      }

      if (relationTotal > RELATION_PACK_LIMITS.relationTotal) {
        return invalid('CROSS_SECTION_RELATION_CONTENT_TOO_LONG', pairContext)
      }
      activeTotal += relationTotal
    }

    if (activeTotal > RELATION_PACK_LIMITS.activeRelationsTotal) {
      return invalid('CROSS_SECTION_RELATION_ACTIVE_TOTAL_TOO_LONG', context)
    }

    const truth = fixture.relationshipGroundTruth
    if (!isRecord(truth)
      || !Array.isArray(truth.establishedSignals) || truth.establishedSignals.length < 1
      || !Array.isArray(truth.prohibitedInventions) || truth.prohibitedInventions.length < 1
      || !isText(truth.evaluatorNote)) {
      return invalid('CROSS_SECTION_RELATION_GROUND_TRUTH_INVALID', context)
    }
  }

  return { valid: true }
}

export default {
  RELATION_FIXTURE_SCHEMA_VERSION,
  RELATION_PACK_LIMITS,
  CROSS_SECTION_RELATION_FIXTURES,
  validateCrossSectionRelationFixtures
}
