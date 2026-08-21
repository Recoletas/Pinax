import { describe, it, expect } from 'vitest'
import { CROSS_SECTION_FIXTURES } from '../../scripts/fixtures/novel-cross-section-fixtures.mjs'
import {
  CROSS_SECTION_DRAMATURGICAL_FIXTURES,
  DRAMATURGICAL_FIELD_LIMITS,
  validateDramaturgicalFixtures
} from '../../scripts/fixtures/novel-cross-section-dramaturgical-fixtures.mjs'
import {
  DRAMATURGICAL_CONDITIONS,
  DRAMATURGICAL_PROMPT_CONTRACT_VERSION,
  serializeMinimalEngine,
  serializeFullVocabulary,
  buildDramaturgicalConditionPrompt,
  expandDramaturgicalMatrix,
  runDramaturgicalCondition,
  generateDramaturgicalArtifacts,
  createDramaturgicalBlindPairs,
  buildDramaturgicalReviewTemplate,
  validateDramaturgicalReviews,
  buildDramaturgicalAuthoringTemplate
} from '../../scripts/lib/novel-cross-section-dramaturgical-ablation.mjs'
import { serializeMinimalRelationPack } from '../../scripts/lib/novel-cross-section-relation-ab.mjs'
import { CROSS_SECTION_RELATION_FIXTURES } from '../../scripts/fixtures/novel-cross-section-relation-fixtures.mjs'
import {
  parseDramaturgicalArgs,
  runDramaturgicalCli
} from '../../scripts/novel-cross-section-dramaturgical-ablation.mjs'

const clone = value => JSON.parse(JSON.stringify(value))

const createMemoryFs = () => {
  const files = new Map()
  const writes = []
  let appendLimit = Infinity
  let appendCount = 0
  const missing = path => Object.assign(new Error(`missing: ${path}`), { code: 'ENOENT' })
  return {
    files,
    writes,
    setAppendLimit(value) { appendLimit = value },
    mkdir: async () => {},
    readFile: async path => {
      if (!files.has(path)) throw missing(path)
      return files.get(path)
    },
    writeFile: async (path, data, options = {}) => {
      if (options?.flag === 'wx' && files.has(path)) {
        throw Object.assign(new Error(`exists: ${path}`), { code: 'EEXIST' })
      }
      files.set(path, String(data))
      writes.push({ path, data: String(data) })
    },
    appendFile: async (path, data) => {
      appendCount += 1
      if (appendCount > appendLimit) throw Object.assign(new Error('simulated interruption'), { code: 'EIO' })
      files.set(path, (files.get(path) || '') + String(data))
    },
    rename: async (from, to) => {
      if (!files.has(from)) throw missing(from)
      files.set(to, files.get(from))
      files.delete(from)
    },
    rm: async path => { files.delete(path) }
  }
}

describe('novel cross-section dramaturgical ablation (tasks 1-8)', () => {
  it('locks four enriched fixtures whose base contract is reused, not copied (Task 1)', () => {
    expect(CROSS_SECTION_DRAMATURGICAL_FIXTURES.map(({ id }) => id)).toEqual([
      'canal-ledger',
      'birthday-recorder',
      'orbital-airlock-key',
      'temple-debt-token'
    ])
    expect(validateDramaturgicalFixtures(CROSS_SECTION_DRAMATURGICAL_FIXTURES))
      .toEqual({ valid: true })

    const baseById = new Map(CROSS_SECTION_FIXTURES.map(fixture => [fixture.id, fixture]))
    for (const fixture of CROSS_SECTION_DRAMATURGICAL_FIXTURES) {
      const base = baseById.get(fixture.id)
      // 基础契约来自 canonical fixture（同引用等价），不是抄写
      expect(fixture.characters).toEqual(base.characters)
      expect(fixture.facts).toEqual(base.facts)
      expect(fixture.focusProp).toBe(base.focusProp)
      expect(fixture.exitCue).toEqual(base.exitCue)
      expect(fixture.internalBeatRange).toEqual(base.internalBeatRange)
      expect(fixture.expectedOutcome).toBe(base.expectedOutcome)
      expect(fixture.antiOutcome).toBe(base.antiOutcome)

      // S1：pressure / stateChange 为必填 section 字符串
      expect([...fixture.minimalEngine.pressure].length).toBeGreaterThan(0)
      expect([...fixture.minimalEngine.stateChange].length).toBeGreaterThan(0)
      // sceneObjectives / withheldTruths：每个角色恰一条
      expect(Object.keys(fixture.minimalEngine.sceneObjectives).sort())
        .toEqual(base.characters.map(({ id }) => id).sort())
      expect(Object.keys(fixture.minimalEngine.withheldTruths).sort())
        .toEqual(base.characters.map(({ id }) => id).sort())
      // 长度上限
      expect([...fixture.minimalEngine.pressure].length).toBeLessThanOrEqual(DRAMATURGICAL_FIELD_LIMITS.pressure)
      expect([...fixture.minimalEngine.stateChange].length).toBeLessThanOrEqual(DRAMATURGICAL_FIELD_LIMITS.stateChange)
      for (const value of Object.values(fixture.minimalEngine.sceneObjectives)) {
        expect([...value].length).toBeLessThanOrEqual(DRAMATURGICAL_FIELD_LIMITS.sceneObjective)
      }
      for (const value of Object.values(fixture.minimalEngine.withheldTruths)) {
        expect([...value].length).toBeLessThanOrEqual(DRAMATURGICAL_FIELD_LIMITS.withheldTruth)
      }
      // withheldTruth 不得指向该角色的 forbidden facts（知道但不能直说 ≠ 禁止知道）
      for (const [characterId, truth] of Object.entries(fixture.minimalEngine.withheldTruths)) {
        const character = base.characters.find(({ id }) => id === characterId)
        for (const forbiddenId of character.forbiddenFactIds) {
          const forbidden = base.facts.find(fact => fact.id === forbiddenId)
          expect(truth).not.toContain((forbidden?.leakMarkers || [])[0] || forbidden?.text || '')
        }
      }

      // S2：六字段齐备，且不含 beat 数 / reversal / recognition 覆盖
      for (const field of ['premise', 'dramaticQuestion', 'dramaticGuts', 'mainConsciousness', 'spine', 'conflictType']) {
        expect([...fixture.fullVocabulary[field]].length).toBeGreaterThan(0)
        expect([...fixture.fullVocabulary[field]].length).toBeLessThanOrEqual(DRAMATURGICAL_FIELD_LIMITS.theoryField)
      }
      const s2Joined = Object.values(fixture.fullVocabulary).join('')
      expect(s2Joined).not.toMatch(/四拍|固定四|必须反转|reversal|recognition/i)

      // 评审 ground truth：可观察结果，不复述条件字段措辞
      const truth = JSON.stringify(fixture.dramaturgicalGroundTruth)
      expect(truth).not.toMatch(/minimal-engine|full-vocabulary|baseline|condition/i)
      expect(fixture.dramaturgicalGroundTruth.observableMotivations.length).toBeGreaterThan(0)
      expect(fixture.dramaturgicalGroundTruth.acceptableStateChanges.length).toBeGreaterThan(0)
      expect(fixture.dramaturgicalGroundTruth.prohibitedShortcuts.length).toBeGreaterThan(0)
    }
  })

  it('expands the 24-attempt matrix with stable ordering and pair families (Task 3)', () => {
    const matrix = expandDramaturgicalMatrix()
    expect(matrix.attemptCount).toBe(24)
    expect(matrix.pairCounts).toEqual({
      'minimal-engine-vs-baseline': 8,
      'full-vocabulary-vs-minimal-engine': 8
    })
    expect(new Set(matrix.attempts.map(({ runId }) => runId)).size).toBe(24)
    expect(new Set(matrix.attempts.map(({ condition }) => condition))).toEqual(new Set(DRAMATURGICAL_CONDITIONS))
    // fixture 主序、repetition 次序、condition 末序
    expect(matrix.attempts[0].runId).toBe('canal-ledger-baseline-r1')
    expect(matrix.attempts[1].runId).toBe('canal-ledger-minimal-engine-r1')
    expect(matrix.attempts[2].runId).toBe('canal-ledger-full-vocabulary-r1')
    expect(matrix.attempts[3].runId).toBe('canal-ledger-baseline-r2')
    expect(matrix.attempts[23].runId).toBe('temple-debt-token-full-vocabulary-r2')
    expect(matrix.repetitions).toBe(2)
    expect(matrix.worstCaseProviderCalls).toBe(24)
  })

  it('runs each condition once through the provider boundary with typed failures (Task 3)', async () => {
    const fixture = CROSS_SECTION_DRAMATURGICAL_FIXTURES[1]
    const requests = []
    let clock = 1000
    const provider = {
      invoke: async request => {
        requests.push(request)
        clock += 150
        if (requests.length === 2) {
          throw Object.assign(new Error('上游超时'), { code: 'UPSTREAM_TIMEOUT' })
        }
        if (requests.length === 3) return { text: '' }
        return {
          text: ':::narration\n母亲把录音机往女儿那边推了推。\n:::dialogue|女儿\n「妈，那一分钟呢？」',
          usage: { inputTokens: 10, outputTokens: 20 }
        }
      }
    }

    const baseline = await runDramaturgicalCondition({
      fixture, condition: 'baseline', repetition: 1, provider,
      relationMode: 'none', now: () => clock
    })
    expect(baseline.status).toBe('success')
    expect(requests).toHaveLength(1)
    expect(requests[0].maxTokens).toBe(1800)
    expect(requests[0].temperature).toBe(0.4)
    expect(baseline.readableText).toContain('录音机')
    expect(baseline.usage.totalTokens).toBe(30)
    expect(baseline.latencyMs).toBe(150)
    expect(baseline.promptMetrics.conditionChars).toBe(0)
    expect(baseline.unauthorizedFactEvents).toEqual([])
    expect(baseline.condition).toBe('baseline')
    expect(baseline.relationMode).toBe('none')
    expect(JSON.stringify(baseline)).not.toMatch(/apiKey|baseUrl/i)

    const failed = await runDramaturgicalCondition({
      fixture, condition: 'minimal-engine', repetition: 1, provider,
      relationMode: 'none', now: () => clock
    })
    expect(failed.status).toBe('failed')
    expect(failed.error.code).toBe('UPSTREAM_TIMEOUT')
    expect(requests).toHaveLength(2)
    // 失败不重试到其它条件：同一 runId 保持
    expect(failed.runId).toBe('birthday-recorder-minimal-engine-r1')

    const parseFailed = await runDramaturgicalCondition({
      fixture, condition: 'full-vocabulary', repetition: 1, provider,
      relationMode: 'none', now: () => clock
    })
    expect(parseFailed.status).toBe('failed')
    expect(parseFailed.error.code).toBeTruthy()

    // 未知条件 / 关系模式 typed 拒绝
    await expect(runDramaturgicalCondition({
      fixture, condition: 'ghost', repetition: 1, provider, relationMode: 'none'
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_CONDITION_UNKNOWN' })
    await expect(runDramaturgicalCondition({
      fixture, condition: 'baseline', repetition: 1, provider, relationMode: 'ghost'
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_RELATION_MODE_INVALID' })
    await expect(runDramaturgicalCondition({
      fixture: null, condition: 'baseline', repetition: 1, provider, relationMode: 'none'
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_FIXTURE_MISMATCH' })
    expect(requests).toHaveLength(3)
  })

  it('persists immutable resumable runs and fails closed on corrupted identity (Task 4)', async () => {
    const providerConfig = {
      id: 'minimax',
      model: 'MiniMax-Text-01',
      format: 'anthropic',
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'never-persist-this'
    }
    const makeProvider = counter => ({
      invoke: async () => {
        counter.count += 1
        return {
          text: ':::narration\n母亲把录音机放在桌上。',
          usage: { inputTokens: 4, outputTokens: 6 }
        }
      }
    })
    const fs = createMemoryFs()
    const calls = { count: 0 }
    const runDir = await generateDramaturgicalArtifacts({
      fs,
      outputRoot: '/tmp/drama-test',
      experimentRunId: 'run-1',
      fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
      providerConfig,
      provider: makeProvider(calls),
      relationMode: 'none',
      now: () => 1_776_000_000_000
    })
    expect(runDir).toBe('/tmp/drama-test/run-1')
    expect(calls.count).toBe(24)
    const manifestPath = `${runDir}/manifest.json`
    const privatePath = `${runDir}/private-runs.jsonl`
    const manifest = JSON.parse(fs.files.get(manifestPath))
    expect(manifest).toMatchObject({
      status: 'complete',
      fixtureSchemaVersion: 1,
      relationMode: 'none',
      relationDecisionRef: null,
      repetitions: 2,
      attemptCount: 24,
      parameters: { temperature: 0.4, maxTokens: 1800 },
      provider: { provider: 'minimax', model: 'MiniMax-Text-01', format: 'anthropic' }
    })
    expect(manifest.completedAt).toBeTruthy()
    expect(JSON.stringify(manifest)).not.toMatch(/never-persist-this|api\.example\.test|apiKey|baseUrl/i)
    expect(fs.writes.some(({ path, data }) => path.includes('manifest.json.tmp-') && JSON.parse(data).status === 'running')).toBe(true)
    const records = fs.files.get(privatePath).trim().split('\n').map(JSON.parse)
    expect(records).toHaveLength(24)
    expect(new Set(records.map(({ runId }) => runId)).size).toBe(24)

    // completed resume is a no-op
    calls.count = 0
    await generateDramaturgicalArtifacts({
      fs, runDir, outputRoot: '/tmp/drama-test', fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
      providerConfig, provider: makeProvider(calls), relationMode: 'none', now: () => 1_776_000_000_001
    })
    expect(calls.count).toBe(0)

    // append interruption leaves a running manifest; resume invokes only unrecorded ids
    const interruptedFs = createMemoryFs()
    interruptedFs.setAppendLimit(5)
    const interruptedCalls = { count: 0 }
    await expect(generateDramaturgicalArtifacts({
      fs: interruptedFs,
      outputRoot: '/tmp/drama-test', experimentRunId: 'run-interrupted',
      fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
      providerConfig, provider: makeProvider(interruptedCalls), relationMode: 'none', now: () => 1_776_000_000_002
    })).rejects.toMatchObject({ code: 'EIO' })
    const interruptedDir = '/tmp/drama-test/run-interrupted'
    expect(JSON.parse(interruptedFs.files.get(`${interruptedDir}/manifest.json`)).status).toBe('running')
    expect(interruptedFs.files.get(`${interruptedDir}/private-runs.jsonl`).trim().split('\n')).toHaveLength(5)
    interruptedFs.setAppendLimit(Infinity)
    const callsBeforeResume = interruptedCalls.count
    await generateDramaturgicalArtifacts({
      fs: interruptedFs, runDir: interruptedDir, outputRoot: '/tmp/drama-test',
      fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
      providerConfig, provider: makeProvider(interruptedCalls), relationMode: 'none', now: () => 1_776_000_000_003
    })
    expect(interruptedCalls.count - callsBeforeResume).toBe(19)

    // lock, corrupt JSONL, duplicate ids, changed provider/relation identity, and path escape fail closed
    const lockedFs = createMemoryFs()
    lockedFs.files.set('/tmp/drama-test/locked/.generate.lock', '{}')
    await expect(generateDramaturgicalArtifacts({
      fs: lockedFs, runDir: '/tmp/drama-test/locked', outputRoot: '/tmp/drama-test',
      fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
      providerConfig, provider: makeProvider({ count: 0 }), relationMode: 'none'
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_LOCKED' })

    fs.files.set(privatePath, `${fs.files.get(privatePath)}{"runId":`)
    await expect(generateDramaturgicalArtifacts({
      fs, runDir, outputRoot: '/tmp/drama-test', fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
      providerConfig, provider: makeProvider({ count: 0 }), relationMode: 'none'
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_PRIVATE_RUNS_INVALID' })
    fs.files.set(privatePath, records.map(record => JSON.stringify(record)).join('\n') + '\n' + JSON.stringify(records[0]) + '\n')
    await expect(generateDramaturgicalArtifacts({
      fs, runDir, outputRoot: '/tmp/drama-test', fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
      providerConfig, provider: makeProvider({ count: 0 }), relationMode: 'none'
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_PRIVATE_RUN_DUPLICATE' })
    fs.files.set(privatePath, records.map(record => JSON.stringify(record)).join('\n') + '\n')
    await expect(generateDramaturgicalArtifacts({
      fs, runDir, outputRoot: '/tmp/drama-test', fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
      providerConfig: { ...providerConfig, model: 'changed-model' },
      provider: makeProvider({ count: 0 }), relationMode: 'none'
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_RESUME_MISMATCH' })

    const changedFixtures = clone(CROSS_SECTION_DRAMATURGICAL_FIXTURES)
    changedFixtures[0].minimalEngine.pressure += '。'
    await expect(generateDramaturgicalArtifacts({
      fs, runDir, outputRoot: '/tmp/drama-test', fixtures: changedFixtures,
      providerConfig, provider: makeProvider({ count: 0 }), relationMode: 'none'
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_RESUME_MISMATCH' })

    const originalManifestRaw = fs.files.get(manifestPath)
    for (const mutate of [
      value => { value.schemaVersion = 2 },
      value => { value.promptContractVersion = 'changed-contract' },
      value => { value.conditions = ['baseline'] },
      value => { value.repetitions = 3 }
    ]) {
      const changed = JSON.parse(originalManifestRaw)
      mutate(changed)
      fs.files.set(manifestPath, JSON.stringify(changed))
      await expect(generateDramaturgicalArtifacts({
        fs, runDir, outputRoot: '/tmp/drama-test', fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
        providerConfig, provider: makeProvider({ count: 0 }), relationMode: 'none'
      })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_RESUME_MISMATCH' })
    }
    const unknownStatus = JSON.parse(originalManifestRaw)
    unknownStatus.status = 'mystery'
    fs.files.set(manifestPath, JSON.stringify(unknownStatus))
    await expect(generateDramaturgicalArtifacts({
      fs, runDir, outputRoot: '/tmp/drama-test', fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
      providerConfig, provider: makeProvider({ count: 0 }), relationMode: 'none'
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_MANIFEST_INVALID' })
    fs.files.set(manifestPath, originalManifestRaw)
    await expect(generateDramaturgicalArtifacts({
      fs, runDir, outputRoot: '/tmp/drama-test', fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
      conditions: ['baseline'], providerConfig, provider: makeProvider({ count: 0 }), relationMode: 'none'
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_CONDITION_UNKNOWN' })
    await expect(generateDramaturgicalArtifacts({
      fs, runDir, outputRoot: '/tmp/drama-test', fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
      repetitions: 3, providerConfig, provider: makeProvider({ count: 0 }), relationMode: 'none'
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_REPETITIONS_FIXED' })

    await expect(generateDramaturgicalArtifacts({
      fs, runDir, outputRoot: '/tmp/drama-test', fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
      providerConfig, provider: makeProvider({ count: 0 }), relationMode: 'minimal-relation',
      relationDecisionRef: { reportPath: '/tmp/report.json', reportSha256: 'a'.repeat(64), decision: 'minimal-relation-supported' }
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_RESUME_MISMATCH' })
    await expect(generateDramaturgicalArtifacts({
      fs: createMemoryFs(), runDir: '/tmp/outside/run', outputRoot: '/tmp/drama-test',
      fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
      providerConfig, provider: makeProvider({ count: 0 }), relationMode: 'none'
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_PATH_INVALID' })

    const relationFs = createMemoryFs()
    const relationRef = {
      reportPath: '/tmp/relation-report.json',
      reportSha256: 'b'.repeat(64),
      decision: 'minimal-relation-supported'
    }
    const relationDir = await generateDramaturgicalArtifacts({
      fs: relationFs, outputRoot: '/tmp/drama-test', experimentRunId: 'relation-run',
      fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES, providerConfig,
      provider: makeProvider({ count: 0 }), relationMode: 'minimal-relation', relationDecisionRef: relationRef
    })
    await expect(generateDramaturgicalArtifacts({
      fs: relationFs, runDir: relationDir, outputRoot: '/tmp/drama-test',
      fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES, providerConfig,
      provider: makeProvider({ count: 0 }), relationMode: 'minimal-relation',
      relationDecisionRef: { ...relationRef, reportSha256: 'c'.repeat(64) }
    })).rejects.toMatchObject({ code: 'CROSS_SECTION_DRAMATURGY_RESUME_MISMATCH' })
  })

  it('creates two opaque pair families and requires two complete blind reviewers (Task 5)', () => {
    const conditionText = { baseline: '甲', 'minimal-engine': '乙', 'full-vocabulary': '丙' }
    const runs = expandDramaturgicalMatrix().attempts.map(attempt => ({
      ...attempt,
      status: 'success',
      readableText: `${conditionText[attempt.condition]}篇 ${attempt.fixtureId} ${attempt.repetition}\n\n:::`
    }))
    const bundle = createDramaturgicalBlindPairs(runs, { seed: 'drama-a', includePrivate: true })
    expect(bundle.pairs).toHaveLength(16)
    expect(bundle.incompletePairs).toEqual([])
    const mappings = Object.values(bundle.privateBlindMap)
    expect(mappings.filter(({ comparisonFamily }) => comparisonFamily === 'minimal-engine-vs-baseline')).toHaveLength(16)
    expect(mappings.filter(({ comparisonFamily }) => comparisonFamily === 'full-vocabulary-vs-minimal-engine')).toHaveLength(16)
    for (const pair of bundle.pairs) {
      expect(Object.keys(pair).sort()).toEqual(['comparisonId', 'groundTruth', 'left', 'pairId', 'right'])
      expect(pair.pairId).toMatch(/^dp_[a-f0-9]+$/)
      expect(pair.comparisonId).toMatch(/^dc_[a-f0-9]+$/)
      expect(pair.groundTruth).toEqual(expect.objectContaining({
        fixtureTitle: expect.any(String),
        publicFacts: expect.any(Array),
        expectedOutcome: expect.any(String),
        antiOutcome: expect.any(String),
        dramaturgical: expect.any(Object)
      }))
      expect(pair.left).toEqual({ outputId: expect.any(String), text: expect.any(String) })
      expect(pair.right).toEqual({ outputId: expect.any(String), text: expect.any(String) })
      expect(pair.left.text + pair.right.text).not.toContain(':::')
      const left = bundle.privateBlindMap[pair.left.outputId]
      const right = bundle.privateBlindMap[pair.right.outputId]
      expect(left.fixtureId).toBe(right.fixtureId)
      expect(left.repetition).toBe(right.repetition)
      expect(left.comparisonFamily).toBe(right.comparisonFamily)
      expect(left.condition).not.toBe(right.condition)
    }
    const { privateBlindMap: _private, privateIncompleteMap: _incomplete, ...publicBundle } = bundle
    expect(JSON.stringify(publicBundle)).not.toMatch(
      /baseline|minimal-engine|full-vocabulary|pressure|sceneObjective|withheldTruth|stateChange|relationMode|sourceRef|prompt|apiKey|baseUrl/i
    )

    const rerun = createDramaturgicalBlindPairs(runs, { seed: 'drama-a' })
    expect(rerun.pairs).toEqual(publicBundle.pairs)
    const changedSeed = createDramaturgicalBlindPairs(runs, { seed: 'drama-b' })
    expect(changedSeed.pairs.some((pair, index) => pair.left.outputId !== rerun.pairs[index].left.outputId)).toBe(true)

    const failed = runs.map(run => run.runId === 'birthday-recorder-minimal-engine-r1'
      ? { ...run, status: 'failed' }
      : run)
    const partial = createDramaturgicalBlindPairs(failed, { seed: 'drama-a', includePrivate: true })
    expect(partial.pairs).toHaveLength(14)
    expect(partial.incompletePairs).toHaveLength(2)
    expect(Object.values(partial.privateIncompleteMap).every(item => (
      item.fixtureId === 'birthday-recorder' && item.repetition === 1
    ))).toBe(true)

    const template = buildDramaturgicalReviewTemplate(publicBundle)
    expect(template.reviewerSlots).toHaveLength(2)
    expect(template.reviewerSlots.every(slot => slot.reviewPairs.length === 16)).toBe(true)
    expect(template.reviewerSlots[0].reviewPairs[0]).toEqual({
      pairId: expect.any(String),
      left: {
        motivatedAction: null, stateChange: null, naturalSubtext: null,
        structuralNaturalness: null, literaryUsability: null, informationDiscipline: null
      },
      right: {
        motivatedAction: null, stateChange: null, naturalSubtext: null,
        structuralNaturalness: null, literaryUsability: null, informationDiscipline: null
      },
      preference: null,
      confidence: null,
      note: ''
    })

    const fillScores = () => ({
      motivatedAction: 7, stateChange: 7, naturalSubtext: 7,
      structuralNaturalness: 7, literaryUsability: 7, informationDiscipline: 7
    })
    const validReviews = ['reviewer-1', 'reviewer-2'].map(reviewerId => ({
      reviewerId,
      scores: publicBundle.pairs.map(pair => ({
        pairId: pair.pairId,
        left: fillScores(),
        right: fillScores(),
        preference: 'tie',
        confidence: 'medium',
        note: ''
      }))
    }))
    const pairIds = publicBundle.pairs.map(({ pairId }) => pairId)
    expect(validateDramaturgicalReviews(validReviews, { pairIds })).toEqual({ valid: true, reviewerCount: 2 })
    expect(validateDramaturgicalReviews(validReviews.slice(0, 1), { pairIds }).error.code)
      .toBe('CROSS_SECTION_DRAMATURGY_REVIEW_COVERAGE_INCOMPLETE')
    const duplicate = clone(validReviews)
    duplicate[0].scores.push(clone(duplicate[0].scores[0]))
    expect(validateDramaturgicalReviews(duplicate, { pairIds }).error.code)
      .toBe('CROSS_SECTION_DRAMATURGY_REVIEW_DUPLICATE_PAIR')
    const missing = clone(validReviews)
    delete missing[0].scores[0].left.naturalSubtext
    expect(validateDramaturgicalReviews(missing, { pairIds }).error.code)
      .toBe('CROSS_SECTION_DRAMATURGY_REVIEW_SCORES_INCOMPLETE')
    const decimal = clone(validReviews)
    decimal[0].scores[0].left.motivatedAction = 7.5
    expect(validateDramaturgicalReviews(decimal, { pairIds }).error.code)
      .toBe('CROSS_SECTION_DRAMATURGY_REVIEW_SCORE_INVALID')
    const unknown = clone(validReviews)
    unknown[0].scores[0].pairId = 'ghost'
    expect(validateDramaturgicalReviews(unknown, { pairIds }).error.code)
      .toBe('CROSS_SECTION_DRAMATURGY_REVIEW_PAIR_UNKNOWN')
    const unblinded = clone(validReviews)
    unblinded[0].scores[0].condition = 'baseline'
    expect(validateDramaturgicalReviews(unblinded, { pairIds }).error.code)
      .toBe('CROSS_SECTION_DRAMATURGY_REVIEW_METADATA_REJECTED')
  })

  it('supports a lightweight single-author burden note without requiring full coverage (Task 6)', () => {
    const template = buildDramaturgicalAuthoringTemplate({
      fixtures: CROSS_SECTION_DRAMATURGICAL_FIXTURES,
      seed: 'authoring-a',
      participantCount: 1
    })
    expect(template.participants.map(({ participantId }) => participantId)).toEqual(['author-01'])
    expect(template.participants.every(({ tasks }) => tasks.length === 8)).toBe(true)
    for (const participant of template.participants) {
      expect(participant.tasks.filter(({ stage }) => stage === 'minimal-engine')).toHaveLength(4)
      expect(participant.tasks.filter(({ stage }) => stage === 'full-vocabulary-additional')).toHaveLength(4)
      for (const task of participant.tasks) {
        expect(task.context).toEqual(expect.objectContaining({
          fixtureTitle: expect.any(String),
          characters: expect.any(Array),
          facts: expect.any(Array)
        }))
        expect(task.questions.length).toBe(task.stage === 'full-vocabulary-additional' ? 6 : task.questions.length)
        expect(task.questions.every(question => !Object.hasOwn(question, 'answer'))).toBe(true)
        if (task.stage === 'full-vocabulary-additional') {
          expect(task.instructions).toMatch(/只填写新增的六项/)
        }
      }
    }
    const serializedTemplate = JSON.stringify(template)
    for (const fixture of CROSS_SECTION_DRAMATURGICAL_FIXTURES) {
      for (const answer of [
        fixture.minimalEngine.pressure,
        fixture.minimalEngine.stateChange,
        ...Object.values(fixture.minimalEngine.sceneObjectives),
        ...Object.values(fixture.minimalEngine.withheldTruths),
        ...Object.values(fixture.fullVocabulary)
      ]) expect(serializedTemplate).not.toContain(answer)
    }
    expect(serializedTemplate).not.toMatch(/readableText|generatedProse|reviewerScore|preference/i)
  })

  it('offers a small CLI with built-in server-env generation and a no-write dry run (Task 8)', async () => {
    expect(parseDramaturgicalArgs(['generate', '--relation-mode', 'none'])).toEqual({
      command: 'generate',
      relationMode: 'none'
    })
    expect(parseDramaturgicalArgs(['generate', '--config', '/tmp/provider.json', '--relation-mode', 'none']))
      .toMatchObject({ command: 'generate', configPath: '/tmp/provider.json' })
    expect(() => parseDramaturgicalArgs(['generate', '--relation-mode', 'unknown']))
      .toThrow(expect.objectContaining({ code: 'CROSS_SECTION_DRAMATURGY_RELATION_MODE_INVALID' }))

    let printed = ''
    const result = await runDramaturgicalCli(['dry-run'], {
      output: value => { printed += value }
    })
    expect(result).toMatchObject({ attemptCount: 24, authoringParticipantCount: 1 })
    expect(JSON.parse(printed)).toMatchObject({ attemptCount: 24, persistentWrites: 0 })
  })

  it('serializes three isolated conditions sharing a byte-identical base (Task 2)', () => {
    const fixture = CROSS_SECTION_DRAMATURGICAL_FIXTURES[1]
    const s1 = serializeMinimalEngine(fixture)
    const s2 = serializeFullVocabulary(fixture)
    expect(s1).toContain('【场景压力】')
    expect(s1).toContain(fixture.minimalEngine.pressure)
    expect(s1).not.toContain(fixture.fullVocabulary.premise)
    // 序列化器只负责各自块；S1+S2 的组合发生在 prompt 层
    expect(s2).not.toContain(fixture.minimalEngine.pressure)
    expect(s2).toContain(fixture.fullVocabulary.conflictType)

    const prompts = {
      baseline: buildDramaturgicalConditionPrompt({ fixture, condition: 'baseline', relationMode: 'none' }),
      minimalEngine: buildDramaturgicalConditionPrompt({ fixture, condition: 'minimal-engine', relationMode: 'none' }),
      fullVocabulary: buildDramaturgicalConditionPrompt({ fixture, condition: 'full-vocabulary', relationMode: 'none' })
    }
    const base = prompts.baseline
    const s1Prompt = prompts.minimalEngine
    const s2Prompt = prompts.fullVocabulary

    // baseline 不含任何 S1/S2 值
    expect(base.user).not.toContain(fixture.minimalEngine.pressure)
    expect(base.user).not.toContain(fixture.minimalEngine.stateChange)
    expect(base.user).not.toContain(fixture.fullVocabulary.spine)
    // minimal-engine 含且仅含 S1
    expect(s1Prompt.user).toContain(fixture.minimalEngine.pressure)
    expect(s1Prompt.user).not.toContain(fixture.fullVocabulary.premise)
    // full = S1 + S2
    expect(s2Prompt.user).toContain(fixture.minimalEngine.stateChange)
    expect(s2Prompt.user).toContain(fixture.fullVocabulary.dramaticQuestion)

    // 三条件共享字节一致的基底；唯一差异是戏剧块
    expect(s1Prompt.system).toBe(base.system)
    expect(s2Prompt.system).toBe(base.system)
    expect(s1Prompt.maxTokens).toBe(base.maxTokens)
    expect(s2Prompt.temperature).toBe(base.temperature)
    expect(s1Prompt.user).toBe(base.user + '\n\n' + serializeMinimalEngine(fixture))
    expect(s2Prompt.user).toBe(base.user + '\n\n' + serializeMinimalEngine(fixture) + '\n\n' + serializeFullVocabulary(fixture))
    expect(base.user).toContain('推断只写一遍')
    expect(base.user).toContain('不用列举数项后再用破折号短句揭晓')
    expect(base.user).toContain('对白必须改变压力、关系或下一步行动')
    expect(base.user).toContain('不把普通信息写成故作神秘的总结句')
    expect(base.user).toContain('“票据、签名都对，唯独日期——错了。”')
    expect(base.user).toContain('“他看了眼日期，把票据退了回去。”')
    expect(base.user).toContain('“她把杯子挪远，没有接话。”')

    // 提示词不含实验元数据 / 评分 / ground truth / 字段内部名
    const allPrompts = base.system + base.user + s1Prompt.user + s2Prompt.user
    expect(allPrompts).not.toMatch(/minimal-engine|full-vocabulary|baseline|condition|评分|评审|dramaturgical/i)
    expect(allPrompts).not.toContain(JSON.stringify(fixture.dramaturgicalGroundTruth).slice(0, 20))

    // relation mode：none 不序列化关系；minimal-relation 三条件同字节
    expect(base.user).not.toContain('【活跃关系】')
    const relBase = buildDramaturgicalConditionPrompt({ fixture, condition: 'baseline', relationMode: 'minimal-relation' })
    const relS1 = buildDramaturgicalConditionPrompt({ fixture, condition: 'minimal-engine', relationMode: 'minimal-relation' })
    const relationFixture = CROSS_SECTION_RELATION_FIXTURES.find(({ id }) => id === fixture.id)
    const relationBytes = serializeMinimalRelationPack(relationFixture)
    expect(relBase.user.endsWith(relationBytes)).toBe(true)
    expect(relS1.user.includes(relationBytes)).toBe(true)

    // prompt economy
    const metrics = s1Prompt.promptMetrics
    expect(metrics.promptChars).toBe([...s1Prompt.system + s1Prompt.user].length)
    expect(metrics.promptBytes).toBe(Buffer.byteLength(s1Prompt.system + s1Prompt.user, 'utf8'))
    expect(metrics.conditionChars).toBeGreaterThan(0)
    expect(metrics.relationChars).toBe(0)
    expect(relBase.promptMetrics.relationChars).toBeGreaterThan(0)
    expect(DRAMATURGICAL_CONDITIONS).toEqual(['baseline', 'minimal-engine', 'full-vocabulary'])
    expect(DRAMATURGICAL_PROMPT_CONTRACT_VERSION).toBe('cross-section-dramaturgy-prompt.v3')
  })

  it('rejects typed dramaturgical fixture violations (Task 1)', () => {
    const base = () => clone(CROSS_SECTION_DRAMATURGICAL_FIXTURES)
    const first = fixtures => fixtures[0]
    const expectCode = (fixtures, code) => {
      const result = validateDramaturgicalFixtures(fixtures)
      expect(result.valid).toBe(false)
      expect(result.error.code).toBe(code)
    }

    // 未知角色 id（sceneObjectives 出现幽灵角色）
    let mutated = base()
    first(mutated).minimalEngine.sceneObjectives.ghost = '拿到粮册'
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_CHARACTER_UNKNOWN')
    // 缺角色条目（withheldTruths 少一人）
    mutated = base()
    const birthday = mutated.find(({ id }) => id === 'birthday-recorder')
    delete birthday.minimalEngine.withheldTruths.mother
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_CHARACTER_MISSING')
    // 重复条目（同角色两份 sceneObjective —— 以对象形态无法重复，改测 withheldTruths 指向 forbidden）
    mutated = base()
    const canalTruth = first(mutated).minimalEngine.withheldTruths
    const inspector = first(mutated).characters.find(({ id }) => id === 'inspector')
    const forbiddenFact = first(mutated).facts.find(fact => fact.id === inspector.forbiddenFactIds[0])
    canalTruth.inspector = `他知道${forbiddenFact.leakMarkers[0]}，但无法直说`
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_WITHHELD_FORBIDDEN')
    // 未经知情角色持有的 withheldTruth：在本 fixture 家族里，任何他人私知同时都在
    // 该角色 forbidden 列表（非知即禁），因此该分支防御性保留；用"知道别人的私知"
    // 走到的必然是 WITHHELD_FORBIDDEN（上一用例已覆盖）。这里断言 canonical 全集上
    // 不存在可构造 FACT_UNKNOWN 的窗口，防止未来 fixture 改动悄悄打开它。
    for (const fixture of CROSS_SECTION_DRAMATURGICAL_FIXTURES) {
      for (const character of fixture.characters) {
        const privateIds = fixture.facts.filter(f => f.visibility === 'private').map(f => f.id)
        for (const factId of privateIds) {
          if (character.knownFactIds.includes(factId)) continue
          expect(character.forbiddenFactIds).toContain(factId)
        }
      }
    }
    // 缺 stateChange
    mutated = base()
    first(mutated).minimalEngine.stateChange = ''
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_FIELD_REQUIRED')
    // S2 字段泄漏进 S1（sceneObjective 含理论词表标记）
    mutated = base()
    first(mutated).minimalEngine.sceneObjectives.inspector = '完成戏剧性问题：谁的命令压过谁'
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_INPUT_CONTAMINATED')
    // 超长（pressure > 80 码点）
    mutated = base()
    first(mutated).minimalEngine.pressure = '压'.repeat(81)
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_FIELD_TOO_LONG')
    // S2 beat 覆盖（fullVocabulary 里夹带固定四拍）
    mutated = base()
    first(mutated).fullVocabulary.spine = '固定四拍推进，第一拍建置'
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_BEAT_OVERRIDE')
    // S2 字段缺失
    mutated = base()
    delete first(mutated).fullVocabulary.conflictType
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_FIELD_REQUIRED')
    // base fixture id 不匹配
    mutated = base()
    mutated[0].id = 'not-a-fixture'
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_FIXTURE_MISMATCH')
    // ground truth 缺失
    mutated = base()
    delete first(mutated).dramaturgicalGroundTruth
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_GROUND_TRUTH_INVALID')
    // 条件输入包含实验标签
    mutated = base()
    first(mutated).minimalEngine.stateChange = 'minimal-engine 条件下的变化'
    expectCode(mutated, 'CROSS_SECTION_DRAMATURGY_INPUT_CONTAMINATED')
  })
})
