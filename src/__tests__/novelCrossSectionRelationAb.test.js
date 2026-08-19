import { describe, it, expect } from 'vitest'
import {
  CROSS_SECTION_RELATION_FIXTURES,
  RELATION_PACK_LIMITS,
  validateCrossSectionRelationFixtures
} from '../../scripts/fixtures/novel-cross-section-relation-fixtures.mjs'

const clone = value => JSON.parse(JSON.stringify(value))

describe('novel cross-section relation ab (tasks 1-6)', () => {
  it('locks four enriched fixtures with one-to-two active relations and resolvable provenance', () => {
    expect(CROSS_SECTION_RELATION_FIXTURES).toHaveLength(4)
    expect(validateCrossSectionRelationFixtures(CROSS_SECTION_RELATION_FIXTURES))
      .toEqual({ valid: true })

    for (const fixture of CROSS_SECTION_RELATION_FIXTURES) {
      expect(fixture.activeRelations.length).toBeGreaterThanOrEqual(1)
      expect(fixture.activeRelations.length).toBeLessThanOrEqual(2)
      for (const relation of fixture.activeRelations) {
        expect(relation.pair).toHaveLength(2)
        expect(relation.pair).toEqual([...relation.pair].sort())
        expect(relation.pair[0]).not.toBe(relation.pair[1])
        expect(relation.relationFrame.length).toBeLessThanOrEqual(60)
        expect(relation.interactionCues.length).toBeLessThanOrEqual(2)
        expect(relation.interactionCues.every(cue => cue.length <= 30)).toBe(true)
      }
      expect(fixture.relationshipGroundTruth.establishedSignals.length).toBeGreaterThan(0)
      expect(fixture.relationshipGroundTruth.prohibitedInventions.length).toBeGreaterThan(0)
      // 每个关系类型至少覆盖：家庭、职业层级、债务对峙、危机团队
    }

    // 覆盖四种关系形态
    const frames = CROSS_SECTION_RELATION_FIXTURES.map(f => f.activeRelations[0].relationFrame).join('')
    expect(frames).toContain('母女')
    expect(frames).toContain('职务')
    expect(frames).toContain('债')
    expect(frames).toContain('同舱')
  })

  it('rejects typed contract violations for every documented negative case', () => {
    const base = () => clone(CROSS_SECTION_RELATION_FIXTURES)
    const first = fixtures => fixtures[0]
    const expectCode = (fixtures, code) => {
      const result = validateCrossSectionRelationFixtures(fixtures)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(code)
    }

    // unknown character（保持排序，触发 CHARACTER_UNKNOWN 而非 UNSORTED）
    let mutated = base()
    first(mutated).activeRelations[0].pair = ['inspector', 'zebra']
    expectCode(mutated, 'CROSS_SECTION_RELATION_CHARACTER_UNKNOWN')
    // unsorted pair
    mutated = base()
    first(mutated).activeRelations[0].pair = ['messenger', 'inspector']
    expectCode(mutated, 'CROSS_SECTION_RELATION_PAIR_UNSORTED')
    // duplicate unordered pair
    mutated = base()
    const twoChar = mutated.find(f => f.characters.length === 2 && f.activeRelations.length === 1)
    twoChar.activeRelations.push(clone(twoChar.activeRelations[0]))
    expectCode(mutated, 'CROSS_SECTION_RELATION_PAIR_DUPLICATE')
    // three relations
    mutated = base()
    const threeChar = mutated.find(f => f.characters.length === 3)
    threeChar.activeRelations.push({ ...clone(threeChar.activeRelations[0]), pair: ['captain', 'engineer'] })
    threeChar.activeRelations.push({ ...clone(threeChar.activeRelations[0]), pair: ['captain', 'medic'] })
    expectCode(mutated, 'CROSS_SECTION_RELATION_COUNT')
    // empty frame
    mutated = base()
    first(mutated).activeRelations[0].relationFrame = '   '
    expectCode(mutated, 'CROSS_SECTION_RELATION_FRAME_REQUIRED')
    // frame over 60 code points
    mutated = base()
    first(mutated).activeRelations[0].relationFrame = '关'.repeat(61)
    expectCode(mutated, 'CROSS_SECTION_RELATION_FRAME_TOO_LONG')
    // cue without an acting character name
    mutated = base()
    first(mutated).activeRelations[0].interactionCues = ['对方生气时会提高音量']
    expectCode(mutated, 'CROSS_SECTION_RELATION_CUE_ACTOR_MISSING')
    // cue over 30
    mutated = base()
    first(mutated).activeRelations[0].interactionCues = ['检查官会在每一个句子里反复提及自己的关卡职务并且始终避谈封印之事']
    expectCode(mutated, 'CROSS_SECTION_RELATION_CUE_TOO_LONG')
    // shared anchor not declared for both members
    mutated = base()
    const anchorFixture = mutated.find(f => f.activeRelations[0].sharedAnchor)
    anchorFixture.sharedAnchors = anchorFixture.sharedAnchors.filter(
      entry => entry.text !== anchorFixture.activeRelations[0].sharedAnchor
    )
    expectCode(mutated, 'CROSS_SECTION_RELATION_ANCHOR_NOT_SHARED')
    // unresolved source ref
    mutated = base()
    const tensionFixture = mutated.find(f => f.activeRelations[0].openTension)
    tensionFixture.activeRelations[0].openTension.sourceRef.refId = 'missing-node'
    expectCode(mutated, 'CROSS_SECTION_RELATION_SOURCE_UNKNOWN')
    // declared voice contradiction
    mutated = base()
    first(mutated).declaredContradictions = [first(mutated).activeRelations[0].interactionCues[0]]
    expectCode(mutated, 'CROSS_SECTION_RELATION_CONTRADICTION_DECLARED')
    // 字段上限内的单条关系（60+60+50+60=230）必须通过 —— 250 是安全上限而非可达门
    mutated = base()
    first(mutated).activeRelations[0].relationFrame = '检查官'.padEnd(60, '与信使的旧谊')
    first(mutated).activeRelations[0].interactionCues = ['检查官'.padEnd(30, '低声'), '信使'.padEnd(30, '加快')]
    first(mutated).activeRelations[0].sharedAnchor = '两人都记得那年夜航走的是北汊水道'
    first(mutated).activeRelations[0].openTension.text = '张'.repeat(60)
    first(mutated).activeRelations[0].openTension.sourceRef = { refType: 'history-node', refId: 'canal-shared-convoy' }
    expect(validateCrossSectionRelationFixtures(mutated).valid).toBe(true)
    // combined content over 400：birthday 两条关系全部撑到字段上限（230+230=460）
    mutated = base()
    const birthday = mutated.find(f => f.activeRelations.length === 2)
    birthday.sharedAnchors.push({ text: '舅舅与母亲都记得父亲最后一次动录音机', knownTo: ['mother', 'uncle'] })
    birthday.sharedAnchors.push({ text: '锚'.repeat(50), knownTo: ['daughter', 'mother'] })
    birthday.relationSources.push({ refType: 'history-node', refId: 'uncle-tension-src', summary: '舅舅一端的旧张力。' })
    for (const relation of birthday.activeRelations) {
      relation.relationFrame = '母'.padEnd(60, '女之间的长期照顾与安排')
      const cueNames = relation.pair.join('|') === 'daughter|mother' ? ['女儿', '母亲'] : ['舅舅', '母亲']
      relation.interactionCues = [cueNames[0].padEnd(30, '先开口'), cueNames[1].padEnd(30, '转家务')]
      if (relation.pair.join('|') === 'daughter|mother') {
        relation.sharedAnchor = '锚'.repeat(50)
        relation.openTension.text = '张'.repeat(60)
      }
      if (relation.pair.join('|') === 'mother|uncle') {
        relation.sharedAnchor = '舅舅与母亲都记得父亲最后一次动录音机'
        relation.openTension = { text: '舅'.repeat(60), sourceRef: { refType: 'history-node', refId: 'uncle-tension-src' } }
      }
    }
    expectCode(mutated, 'CROSS_SECTION_RELATION_ACTIVE_TOTAL_TOO_LONG')
    // unknown base fixture
    mutated = base()
    mutated[0].id = 'not-a-fixture'
    expectCode(mutated, 'CROSS_SECTION_RELATION_FIXTURE_UNKNOWN')
  })
})
