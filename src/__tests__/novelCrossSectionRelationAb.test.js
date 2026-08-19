import { describe, it, expect } from 'vitest'
import {
  CROSS_SECTION_RELATION_FIXTURES,
  RELATION_PACK_LIMITS,
  validateCrossSectionRelationFixtures
} from '../../scripts/fixtures/novel-cross-section-relation-fixtures.mjs'
import {
  RELATION_AB_CONDITIONS,
  RELATION_AB_PROMPT_CONTRACT_VERSION,
  serializeMinimalRelationPack,
  buildRelationConditionPrompt,
  expandRelationAbMatrix,
  runRelationCondition,
  generateRelationAbArtifacts,
  createRelationBlindPairs,
  buildRelationReviewTemplate,
  validateRelationReviews,
  aggregateRelationAbReport,
  renderRelationDecisionMarkdown
} from '../../scripts/lib/novel-cross-section-relation-ab.mjs'

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

  it('aggregates paired evidence through decision gates without false significance (Task 5)', () => {
    const makeRuns = () => CROSS_SECTION_RELATION_FIXTURES.flatMap((fixture, index) => ([1, 2]).flatMap(repetition => (
      ['baseline', 'minimal-relation'].map(condition => ({
        runId: `${fixture.id}-${condition}-r${repetition}`,
        fixtureId: fixture.id,
        repetition,
        condition,
        status: 'success',
        readableText: `${condition === 'baseline' ? '甲' : '乙'} 文本 ${index}-${repetition}`,
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
        latencyMs: 1200,
        promptMetrics: { promptChars: 900, promptBytes: 2400, relationChars: condition === 'minimal-relation' ? 180 : 0 },
        unauthorizedFactEvents: []
      }))
    )))

    // 支持：关系真实感与因果动机 +1.5、可用性不回退、无泄漏恶化
    const supportedBundle = createRelationBlindPairs(makeRuns(), { seed: 'gate' })
    const privateMap = createRelationBlindPairs(makeRuns(), { seed: 'gate', includePrivate: true }).privateBlindMap
    const conditionOf = blindOutputId => privateMap[blindOutputId].condition
    // 按每个评审者的整数 delta 生成（评分必须 0-10 整数）
    const reviewsFor = (authDeltas, motDeltas, useDeltas) => (['r1', 'r2'].map((reviewerId, reviewerIndex) => ({
      reviewerId,
      scores: supportedBundle.pairs.map(pair => {
        const score = (side) => {
          const isMinimal = conditionOf(side.blindOutputId) === 'minimal-relation'
          return {
            relationshipAuthenticity: Math.max(0, Math.min(10, (isMinimal ? 6 : 6) + (isMinimal ? authDeltas[reviewerIndex] : 0))),
            causalMotivation: Math.max(0, Math.min(10, (isMinimal ? 6 : 6) + (isMinimal ? motDeltas[reviewerIndex] : 0))),
            fakeSuspense: 3,
            literaryUsability: Math.max(0, Math.min(10, (isMinimal ? 8 : 8) + (isMinimal ? useDeltas[reviewerIndex] : 0)))
          }
        }
        return {
          blindPairId: pair.blindPairId,
          left: score(pair.left),
          right: score(pair.right),
          preference: 'tie',
          confidence: 'medium',
          note: ''
        }
      })
    })))

    const runs = makeRuns()
    const manifest = {
      status: 'complete',
      repetitions: 2,
      provider: { provider: 'MiniMax', model: 'MiniMax-Text-01' },
      fingerprint: { promptContractVersion: RELATION_AB_PROMPT_CONTRACT_VERSION }
    }
    const supported = aggregateRelationAbReport({
      runs,
      reviews: reviewsFor([2, 2], [2, 2], [0, 0]),
      manifest,
      blindPairs: supportedBundle,
      privateBlindMap: privateMap
    })
    expect(supported.decision).toBe('minimal-relation-supported')
    expect(supported.exploratory).toBe(true)
    expect(JSON.stringify(supported)).not.toMatch(/p-value|statistically|significan|p95/i)
    expect(supported.metrics.overallMedianDeltas.relationshipAuthenticity).toBeGreaterThanOrEqual(1.0)
    expect(supported.metrics.preferenceCounts).toBeTruthy()

    // 缺第二个评审者 → reviewer-confirmation-required
    const oneReviewer = aggregateRelationAbReport({
      runs,
      reviews: reviewsFor([2, 2], [2, 2], [0, 0]).slice(0, 1),
      manifest,
      blindPairs: supportedBundle,
      privateBlindMap: privateMap
    })
    expect(oneReviewer.decision).toBe('reviewer-confirmation-required')

    // 文学可用性回退 >0.5 → rejected
    const rejected = aggregateRelationAbReport({
      runs,
      reviews: reviewsFor([2, 2], [2, 2], [-1, -1]),
      manifest,
      blindPairs: supportedBundle,
      privateBlindMap: privateMap
    })
    expect(rejected.decision).toBe('minimal-relation-rejected')

    // 必需维度未提升 → baseline-retained
    const retained = aggregateRelationAbReport({
      runs,
      reviews: reviewsFor([0, 0], [2, 2], [0, 0]),
      manifest,
      blindPairs: supportedBundle,
      privateBlindMap: privateMap
    })
    expect(retained.decision).toBe('baseline-retained')

    // 方向为正但差一点（+0.8）→ inconclusive-add-repetition（2 次重复）
    const inconclusive = aggregateRelationAbReport({
      runs,
      reviews: reviewsFor([1, 0], [2, 1], [0, 0]),
      manifest,
      blindPairs: supportedBundle,
      privateBlindMap: privateMap
    })
    expect(inconclusive.decision).toBe('inconclusive-add-repetition')

    // 缺 pair → invalid-experiment
    const invalid = aggregateRelationAbReport({
      runs: runs.slice(0, 14),
      reviews: reviewsFor([2, 2], [2, 2], [0, 0]),
      manifest,
      blindPairs: supportedBundle,
      privateBlindMap: privateMap
    })
    expect(invalid.decision).toBe('invalid-experiment')

    // 决策 markdown
    const markdown = renderRelationDecisionMarkdown(supported, { commit: 'abc1234' })
    expect(markdown).toContain('minimal-relation-supported')
    expect(markdown).toContain('局限')
    expect(markdown).toContain('未实现产品能力')
  })

  it('creates deterministic blinded same-fixture pairs and validates reviews (Task 4)', () => {
    const makeRuns = () => CROSS_SECTION_RELATION_FIXTURES.flatMap((fixture, index) => ([1, 2]).flatMap(repetition => (
      ['baseline', 'minimal-relation'].map(condition => ({
        runId: `${fixture.id}-${condition}-r${repetition}`,
        fixtureId: fixture.id,
        repetition,
        condition,
        status: 'success',
        readableText: `${condition === 'baseline' ? '甲' : '乙'} 文本 ${index}-${repetition}`
      }))
    )))
    const runs = makeRuns()
    const bundle = createRelationBlindPairs(runs, { seed: 'seed-a' })
    expect(bundle.pairs).toHaveLength(8)
    expect(bundle.incompletePairs).toHaveLength(0)
    for (const pair of bundle.pairs) {
      expect(pair).toEqual(expect.objectContaining({
        blindPairId: expect.any(String),
        fixtureTitle: expect.any(String),
        relationshipGroundTruth: expect.any(Object),
        left: { blindOutputId: expect.any(String), text: expect.any(String) },
        right: { blindOutputId: expect.any(String), text: expect.any(String) }
      }))
      expect(pair.left.text).not.toBe(pair.right.text)
    }
    const forbidden = /baseline|minimal-relation|condition|sourceRef|sourceRefId|rawPrompt|architecture|apiKey|baseUrl/i
    expect(JSON.stringify(bundle)).not.toMatch(forbidden)

    // 同 seed 确定、异 seed 变化、且不是恒 baseline-left
    const rerun = createRelationBlindPairs(makeRuns(), { seed: 'seed-a' })
    expect(JSON.stringify(rerun.pairs.map(p => [p.left.blindOutputId, p.right.blindOutputId])))
      .toBe(JSON.stringify(bundle.pairs.map(p => [p.left.blindOutputId, p.right.blindOutputId])))
    const other = createRelationBlindPairs(makeRuns(), { seed: 'seed-b' })
    const flipped = other.pairs.filter((pair, index) => (
      pair.left.blindOutputId !== bundle.pairs[index].left.blindOutputId
    ))
    expect(flipped.length).toBeGreaterThan(0)

    // 未配对失败 → typed incompletePairs
    const withFailure = makeRuns().filter(run => run.runId !== 'canal-ledger-baseline-r2')
    const partial = createRelationBlindPairs(withFailure, { seed: 'seed-a' })
    expect(partial.pairs).toHaveLength(7)
    expect(partial.incompletePairs).toEqual([
      expect.objectContaining({ fixtureId: 'canal-ledger', repetition: 2, code: 'CROSS_SECTION_RELATION_PAIR_INCOMPLETE' })
    ])

    // review template
    const template = buildRelationReviewTemplate(bundle)
    expect(template.reviewPairs).toHaveLength(8)
    const record = template.reviewPairs[0]
    expect(record).toEqual(expect.objectContaining({
      blindPairId: record.blindPairId,
      left: {
        relationshipAuthenticity: null,
        causalMotivation: null,
        fakeSuspense: null,
        literaryUsability: null
      },
      right: {
        relationshipAuthenticity: null,
        causalMotivation: null,
        fakeSuspense: null,
        literaryUsability: null
      },
      preference: null,
      confidence: null,
      note: ''
    }))

    // review 校验：完整通过 / 各类拒绝
    const fill = side => ({
      relationshipAuthenticity: 7,
      causalMotivation: 6,
      fakeSuspense: 3,
      literaryUsability: 8
    })
    const validReviews = [{
      reviewerId: 'reviewer-1',
      scores: bundle.pairs.map(pair => ({
        blindPairId: pair.blindPairId,
        left: fill(),
        right: fill(),
        preference: 'left',
        confidence: 'medium',
        note: ''
      }))
    }]
    expect(validateRelationReviews(validReviews, { blindPairIds: bundle.pairs.map(p => p.blindPairId) }).valid).toBe(true)
    const dup = structuredClone(validReviews)
    dup[0].scores.push({ ...dup[0].scores[0] })
    expect(validateRelationReviews(dup, { blindPairIds: bundle.pairs.map(p => p.blindPairId) }).error.code)
      .toBe('CROSS_SECTION_RELATION_REVIEW_DUPLICATE_PAIR')
    const partialScores = structuredClone(validReviews)
    delete partialScores[0].scores[0].left.literaryUsability
    expect(validateRelationReviews(partialScores, { blindPairIds: bundle.pairs.map(p => p.blindPairId) }).error.code)
      .toBe('CROSS_SECTION_RELATION_REVIEW_SCORES_INCOMPLETE')
    const outOfRange = structuredClone(validReviews)
    outOfRange[0].scores[0].left.relationshipAuthenticity = 11
    expect(validateRelationReviews(outOfRange, { blindPairIds: bundle.pairs.map(p => p.blindPairId) }).error.code)
      .toBe('CROSS_SECTION_RELATION_REVIEW_SCORE_INVALID')
    const unknownId = structuredClone(validReviews)
    unknownId[0].scores[0].blindPairId = 'ghost-pair'
    expect(validateRelationReviews(unknownId, { blindPairIds: bundle.pairs.map(p => p.blindPairId) }).error.code)
      .toBe('CROSS_SECTION_RELATION_REVIEW_PAIR_UNKNOWN')
  })

  it('expands the staged matrix and rejects invalid repetitions or conditions (Task 3)', () => {
    const stage1 = expandRelationAbMatrix({ repetitions: 2 })
    expect(stage1.attemptCount).toBe(16)
    expect(stage1.pairCount).toBe(8)
    expect(new Set(stage1.attempts.map(item => item.condition)))
      .toEqual(new Set(['baseline', 'minimal-relation']))
    const stage2 = expandRelationAbMatrix({ repetitions: 3 })
    expect(stage2.attemptCount).toBe(24)
    expect(stage2.pairCount).toBe(12)

    // 每 fixture × repetition × condition 恰好一次
    const keys = new Set(stage1.attempts.map(a => `${a.fixtureId}|${a.repetition}|${a.condition}`))
    expect(keys.size).toBe(16)

    expect(() => expandRelationAbMatrix({ repetitions: 1 })).toThrow()
    expect(() => expandRelationAbMatrix({ repetitions: 4 })).toThrow()
    expect(() => expandRelationAbMatrix({ repetitions: 2, conditions: ['baseline', 'ghost'] })).toThrow()
    // 匹配对相邻（fixture 主序、repetition 次序、condition 末序）
    expect(stage1.attempts[0].runId).toMatch(/-baseline-r1$/)
    expect(stage1.attempts[1].runId).toMatch(/-minimal-relation-r1$/)
  })

  it('runs conditions through the provider boundary once per attempt with resume and typed failures (Task 3)', async () => {
    const fixture = CROSS_SECTION_RELATION_FIXTURES[1]
    const calls = []
    const provider = {
      invoke: async request => {
        calls.push(request)
        if (calls.length === 2) throw Object.assign(new Error('上游超时'), { code: 'UPSTREAM_TIMEOUT' })
        return { text: ':::narration\n母亲把录音机往女儿那边推了推，没有解释那一分钟。\n:::dialogue|女儿\n「妈，你剪掉了什么？」', usage: { inputTokens: 10, outputTokens: 20 } }
      }
    }
    const baseline = await runRelationCondition({ fixture, condition: 'baseline', repetition: 1, provider, now: () => 1000 })
    expect(baseline.status).toBe('success')
    expect(baseline.readableText).toContain('录音机')
    expect(baseline.condition).toBe('baseline')
    expect(baseline.usage.totalTokens).toBe(30)
    expect(baseline.promptMetrics.relationChars).toBe(0)
    expect(Array.isArray(baseline.unauthorizedFactEvents)).toBe(true)

    const failed = await runRelationCondition({ fixture, condition: 'minimal-relation', repetition: 1, provider, now: () => 1000 })
    expect(failed.status).toBe('failed')
    expect(failed.error.code).toBe('UPSTREAM_TIMEOUT')
    // 失败记录只在私有侧保留 condition
    expect(calls).toHaveLength(2)
    expect(calls[1].user).toContain('【活跃关系】')

    // 可恢复生成：fake fs + fake provider；重跑只补缺失 attempt
    const files = new Map()
    const fs = {
      mkdir: async () => {},
      readFile: async path => { if (!files.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return files.get(path) },
      writeFile: async (path, data) => { files.set(path, data) },
      appendFile: async (path, data) => { files.set(path, (files.get(path) || '') + data) },
      rename: async (from, to) => { files.set(to, files.get(from) || ''); files.delete(from) },
      stat: async path => { if (!files.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return { isFile: () => true } }
    }
    const providerConfig = { provider: 'MiniMax', model: 'MiniMax-Text-01', apiKey: 'secret-key', baseUrl: 'https://api.example.internal/v1' }
    let invokeCount = 0
    const okProvider = {
      invoke: async () => {
        invokeCount += 1
        return { text: ':::narration\n女儿按下了播放键，录音机转了半圈便停住。', usage: { inputTokens: 5, outputTokens: 7 } }
      }
    }
    const runDir = await generateRelationAbArtifacts({
      fs,
      outputRoot: '/tmp/relation-ab-test/run-1',
      fixtures: CROSS_SECTION_RELATION_FIXTURES,
      providerConfig,
      provider: okProvider,
      repetitions: 2,
      now: () => new Date('2026-08-19T00:00:00Z')
    })
    expect(invokeCount).toBe(16)
    const manifest = JSON.parse(files.get(`${runDir}/manifest.json`))
    expect(manifest.status).toBe('complete')
    expect(manifest.repetitions).toBe(2)
    expect(JSON.stringify(manifest)).not.toContain('secret-key')
    expect(files.get(`${runDir}/manifest.json`)).not.toContain('api.example.internal')
    const privateLines = files.get(`${runDir}/private-runs.jsonl`).trim().split('\n')
    expect(privateLines).toHaveLength(16)
    const privateRecord = JSON.parse(privateLines[0])
    expect(privateRecord.promptMetrics.promptBytes).toBeGreaterThan(0)
    expect(privateRecord.relationProvenance).toBeTruthy()

    // resume：已完成的 16 次不再调用
    invokeCount = 0
    await generateRelationAbArtifacts({
      fs,
      outputRoot: '/tmp/relation-ab-test/run-1',
      fixtures: CROSS_SECTION_RELATION_FIXTURES,
      providerConfig,
      provider: okProvider,
      repetitions: 2,
      now: () => new Date('2026-08-19T00:00:00Z')
    })
    expect(invokeCount).toBe(0)

    // 指纹变化（repetitions 不同）拒绝复用
    await expect(generateRelationAbArtifacts({
      fs,
      outputRoot: '/tmp/relation-ab-test/run-1',
      fixtures: CROSS_SECTION_RELATION_FIXTURES,
      providerConfig,
      provider: okProvider,
      repetitions: 3,
      now: () => new Date('2026-08-19T00:00:00Z')
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_RELATION_RESUME_MISMATCH' })
  })

  it('serializes the minimal pack and isolates prompts by condition (Task 2)', () => {
    const fixture = CROSS_SECTION_RELATION_FIXTURES[1]
    const serialized = serializeMinimalRelationPack(fixture)
    expect([...serialized].length).toBeLessThanOrEqual(RELATION_PACK_LIMITS.activeRelationsTotal)
    expect(serialized).toContain('【活跃关系】')

    const baselinePrompt = buildRelationConditionPrompt({ fixture, condition: 'baseline' })
    const minimalPrompt = buildRelationConditionPrompt({ fixture, condition: 'minimal-relation' })
    expect(baselinePrompt.user).not.toContain('【活跃关系】')
    expect(baselinePrompt.user).not.toContain(fixture.activeRelations[0].relationFrame)
    expect(minimalPrompt.user).toContain('【活跃关系】')
    expect(minimalPrompt.user).toContain(fixture.activeRelations[0].relationFrame)
    // 实验元数据与 opaque 引用绝不进入提示词
    expect(minimalPrompt.user).not.toContain(fixture.activeRelations[0].openTension.sourceRef.refId)
    expect(minimalPrompt.system + minimalPrompt.user).not.toMatch(/condition|baseline|minimal-relation|sourceRef/i)
    // 双条件共享字节一致的终稿规则、角色字段、事实、预算与配置
    expect(minimalPrompt.system).toBe(baselinePrompt.system)
    expect(minimalPrompt.maxTokens).toBe(baselinePrompt.maxTokens)
    expect(minimalPrompt.temperature).toBe(baselinePrompt.temperature)
    expect(baselinePrompt.user).toBe(minimalPrompt.user.replace(/\n\n【活跃关系】[\s\S]*$/, ''))
    // 序列化不含 sourceRef / 评审指令
    expect(serialized).not.toMatch(/sourceRef|评分|评审/i)

    const metrics = minimalPrompt.promptMetrics
    expect(metrics.promptChars).toBe([...minimalPrompt.system + minimalPrompt.user].length)
    expect(metrics.promptBytes).toBe(Buffer.byteLength(minimalPrompt.system + minimalPrompt.user, 'utf8'))
    expect(metrics.relationChars).toBeGreaterThan(0)
    expect(RELATION_AB_CONDITIONS).toEqual(['baseline', 'minimal-relation'])
    expect(RELATION_AB_PROMPT_CONTRACT_VERSION).toBe('cross-section-relation-prompt.v1')
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
