import { describe, expect, it } from 'vitest'
import * as nodeFs from 'node:fs/promises'
import { access, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { parseBakeoffArgs, runBakeoffCli } from '../../scripts/novel-cross-section-bakeoff.mjs'

import {
  CROSS_SECTION_FIXTURE_SCHEMA_VERSION,
  CROSS_SECTION_FIXTURES,
  validateCrossSectionFixtures
} from '../../scripts/fixtures/novel-cross-section-fixtures.mjs'
import {
  CROSS_SECTION_ARCHITECTURES,
  CROSS_SECTION_EVALUATOR_CONTRACT_VERSION,
  CROSS_SECTION_PROMPT_CONTRACT_VERSION,
  CROSS_SECTION_RUNNER_CONTRACT_VERSION,
  CrossSectionEvaluationError,
  aggregateBakeoffReport,
  aggregateHumanReviews,
  buildFinalProseContract,
  createBlindReviewBundle,
  createBakeoffExperimentFingerprint,
  createBakeoffProvider,
  expandBakeoffMatrix,
  generateBakeoffArtifacts,
  invokeBakeoffModel,
  normalizeCrossSectionFinalProse,
  runCrossSectionArchitecture,
  runIntentPlannersWriter,
  runRoleAgentsNarrator,
  runSingleWriter,
  redactBakeoffManifest,
  renderBakeoffDecisionMarkdown,
  scanUnauthorizedFacts,
  validateBakeoffReviews
} from '../../scripts/lib/novel-cross-section-bakeoff.mjs'
import { buildNarrativeFormatInstructions } from '../services/narrativePresentation.js'

const FIXTURE_IDS = [
  'canal-ledger',
  'birthday-recorder',
  'orbital-airlock-key',
  'temple-debt-token'
]

const cloneFixtures = () => structuredClone(CROSS_SECTION_FIXTURES)
const fixtureById = (fixtures, fixtureId) => fixtures.find(({ id }) => id === fixtureId)

const expectInvalid = (fixtures, error) => {
  expect(() => validateCrossSectionFixtures(fixtures)).not.toThrow()
  expect(validateCrossSectionFixtures(fixtures)).toEqual({ valid: false, error })
}

const expectDeepFrozen = (value, seen = new WeakSet()) => {
  if (value === null || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  expect(Object.isFrozen(value)).toBe(true)
  for (const key of Reflect.ownKeys(value)) expectDeepFrozen(value[key], seen)
}

describe('novel cross-section bakeoff CLI arguments and matrix', () => {
  it('parses each command with strict defaults and bounded repetitions', () => {
    expect(parseBakeoffArgs(['dry-run'])).toEqual({ command: 'dry-run', repetitions: 3 })
    expect(parseBakeoffArgs(['dry-run', '--repetitions', '5'])).toEqual({ command: 'dry-run', repetitions: 5 })
    expect(parseBakeoffArgs([
      'generate', '--config', './provider.json', '--repetitions', '1', '--output', './runs', '--run-id', 'resume-1'
    ])).toEqual({
      command: 'generate',
      config: './provider.json',
      repetitions: 1,
      output: './runs',
      runId: 'resume-1'
    })
    expect(parseBakeoffArgs(['report', '--run', './runs/r1', '--reviews', './reviews.json'])).toEqual({
      command: 'report',
      run: './runs/r1',
      reviews: './reviews.json'
    })
    expect(parseBakeoffArgs(['generate', '--config', './provider.json'])).toEqual({
      command: 'generate',
      config: './provider.json',
      repetitions: 3
    })
  })

  it('parses winner-only portability generation with one configured provider', () => {
    expect(parseBakeoffArgs([
      'generate',
      '--portability',
      '--architecture', 'role-agents-narrator',
      '--config', './provider.json',
      '--repetitions', '1',
      '--output', './portability-runs'
    ])).toEqual({
      command: 'generate',
      config: './provider.json',
      repetitions: 1,
      output: './portability-runs',
      portability: true,
      architecture: 'role-agents-narrator'
    })
    expect(parseBakeoffArgs([
      'generate', '--portability', '--architecture', 'single-writer', '--config', './provider.json'
    ])).toEqual({
      command: 'generate',
      config: './provider.json',
      repetitions: 1,
      portability: true,
      architecture: 'single-writer'
    })
  })

  it.each([
    [
      ['generate', '--architecture', 'single-writer', '--config', './provider.json'],
      'CROSS_SECTION_CLI_ARCHITECTURE_REQUIRES_PORTABILITY'
    ],
    [
      ['generate', '--portability', '--config', './provider.json'],
      'CROSS_SECTION_CLI_PORTABILITY_ARCHITECTURE_REQUIRED'
    ],
    [
      ['generate', '--portability', '--architecture', 'unknown-winner', '--config', './provider.json'],
      'CROSS_SECTION_UNKNOWN_ARCHITECTURE'
    ],
    [
      ['generate', '--portability', '--architecture', 'single-writer', '--config', './provider.json', '--repetitions', '2'],
      'CROSS_SECTION_CLI_PORTABILITY_REPETITIONS'
    ]
  ])('rejects invalid portability argv %# with a typed error', (argv, code) => {
    expect(() => parseBakeoffArgs(argv)).toThrow(expect.objectContaining({ code }))
  })

  it('expands portability to four fixtures once for the selected architecture', async () => {
    const calls = []
    await runBakeoffCli([
      'generate',
      '--portability',
      '--architecture', 'intent-planners-writer',
      '--config', './provider.json',
      '--repetitions', '1'
    ], {
      output: () => {},
      generate: async options => {
        calls.push(options)
        const matrix = expandBakeoffMatrix({
          fixtures: CROSS_SECTION_FIXTURES,
          architectures: [options.architecture],
          repetitions: options.repetitions
        })
        return { attemptCount: matrix.attemptCount, attempts: matrix.attempts }
      }
    })

    expect(calls).toEqual([{
      configPath: './provider.json',
      repetitions: 1,
      portability: true,
      architecture: 'intent-planners-writer'
    }])
    const [{ attemptCount, attempts }] = calls.map(options => expandBakeoffMatrix({
      fixtures: CROSS_SECTION_FIXTURES,
      architectures: [options.architecture],
      repetitions: options.repetitions
    }))
    expect(attemptCount).toBe(4)
    expect(attempts).toHaveLength(4)
    expect(new Set(attempts.map(({ architecture }) => architecture))).toEqual(new Set(['intent-planners-writer']))
    expect(new Set(attempts.map(({ repetition }) => repetition))).toEqual(new Set([1]))
  })

  it.each([
    [[], 'CROSS_SECTION_CLI_COMMAND_REQUIRED'],
    [['unknown'], 'CROSS_SECTION_CLI_UNKNOWN_COMMAND'],
    [['dry-run', '--wat'], 'CROSS_SECTION_CLI_UNKNOWN_FLAG'],
    [['dry-run', '--repetitions'], 'CROSS_SECTION_CLI_MISSING_FLAG_VALUE'],
    [['dry-run', '--repetitions', '3', '--repetitions', '4'], 'CROSS_SECTION_CLI_DUPLICATE_FLAG'],
    [['dry-run', '--repetitions', '0'], 'CROSS_SECTION_CLI_INVALID_REPETITIONS'],
    [['generate', '--config', 'a.json', '--config', 'b.json', '--output', 'out'], 'CROSS_SECTION_CLI_DUPLICATE_FLAG'],
    [['generate', '--output', 'out'], 'CROSS_SECTION_CLI_REQUIRED_FLAG'],
    [['report', '--run', 'r'], 'CROSS_SECTION_CLI_REQUIRED_FLAG'],
    [['report', '--reviews', 'r.json'], 'CROSS_SECTION_CLI_REQUIRED_FLAG']
  ])('rejects malformed argv %# with a typed error', (argv, code) => {
    expect(() => parseBakeoffArgs(argv)).toThrow(expect.objectContaining({ code }))
  })

  it('expands the default matrix deterministically and calculates worst-case calls', () => {
    const summary = expandBakeoffMatrix({
      fixtures: CROSS_SECTION_FIXTURES,
      architectures: CROSS_SECTION_ARCHITECTURES,
      repetitions: 3
    })

    expect(summary.fixtureCount).toBe(4)
    expect(summary.architectureCount).toBe(3)
    expect(summary.repetitions).toBe(3)
    expect(summary.attemptCount).toBe(36)
    expect(summary.attempts).toHaveLength(36)
    expect(new Set(summary.attempts.map(({ runId }) => runId)).size).toBe(36)
    expect(summary.attempts.slice(0, 3).map(({ repetition }) => repetition)).toEqual([1, 2, 3])
    expect(summary.callsPerAttempt).toEqual({
      'single-writer': 1,
      'role-agents-narrator': 'characters+1',
      'intent-planners-writer': 'characters+1'
    })
    const expectedCalls = CROSS_SECTION_FIXTURES.reduce((total, fixture) => (
      total + 3 * (1 + (fixture.characters.length + 1) * 2)
    ), 0)
    expect(summary.worstCaseProviderCalls).toBe(expectedCalls)
    expect(JSON.stringify(summary)).not.toMatch(/api[_-]?key|secret/i)
  })

  it('validates fixtures and dry-run does not create an output path', async () => {
    expect(() => expandBakeoffMatrix({ fixtures: [{}], architectures: CROSS_SECTION_ARCHITECTURES, repetitions: 3 }))
      .toThrow(expect.objectContaining({ code: 'CROSS_SECTION_MISSING_FIELD' }))
    const root = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-dry-'))
    const absent = join(root, 'must-remain-absent')
    const lines = []
    const result = await runBakeoffCli(['dry-run', '--repetitions', '3'], {
      output: value => lines.push(value),
      defaultOutputRoot: absent
    })

    expect(result.attemptCount).toBe(36)
    expect(JSON.parse(lines.join('')).attemptCount).toBe(36)
    await expect(access(absent)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('novel cross-section bakeoff artifact generation', () => {
  const makeConfig = () => ({
    id: 'openai-compatible',
    model: 'test-model',
    format: 'openai',
    baseUrl: 'https://provider.example/v1/responses?secret=query',
    apiKey: 'API_KEY_SENTINEL',
    headers: { Authorization: 'Bearer HEADER_SENTINEL' }
  })

  const makeSuccessfulRun = (attempt, fixture) => ({
    ...attempt,
    status: 'success',
    readableText: `可读终稿 ${fixture.title} 第${attempt.repetition || 1}次`,
    rawText: `RAW_SENTINEL ${attempt.runId}`,
    presentation: { blocks: [{ id: 'n1', kind: 'narration', text: '雨落在道具上。' }] },
    usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 },
    latencyMs: 18,
    calls: [{ request: { user: 'INTERMEDIATE_SENTINEL' } }],
    fixtureTitle: fixture.title
  })

  it('runs a portability artifact matrix as four fixtures once for one selected architecture', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-portability-'))
    const configPath = join(outputRoot, 'provider.json')
    await writeFile(configPath, JSON.stringify({ provider: makeConfig() }))
    const issued = []
    const options = {
      configPath,
      outputRoot,
      runId: 'portability-contract',
      portability: true,
      architecture: 'role-agents-narrator',
      provider: { invoke: async () => { throw new Error('must not invoke') } },
      runner: async (architecture, fixture, _provider, { runId }) => {
        issued.push({ architecture, fixtureId: fixture.id, runId })
        return makeSuccessfulRun({ runId, fixtureId: fixture.id, architecture, repetition: 1 }, fixture)
      }
    }
    const result = await generateBakeoffArtifacts(options)

    expect(result).toMatchObject({ total: 4, completed: 4, failed: 0, skipped: 0 })
    expect(issued).toHaveLength(4)
    expect(new Set(issued.map(({ fixtureId }) => fixtureId))).toEqual(new Set(FIXTURE_IDS))
    expect(new Set(issued.map(({ architecture }) => architecture))).toEqual(new Set(['role-agents-narrator']))
    const manifest = JSON.parse(await readFile(join(result.runDir, 'manifest.json'), 'utf8'))
    expect(manifest.options).toMatchObject({
      repetitions: 1,
      portability: true,
      architecture: 'role-agents-narrator'
    })
    expect(manifest.matrixRunIds).toHaveLength(4)
    expect(manifest.fixtureContractFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(manifest.providerContractFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(manifest.experimentFingerprint).toMatch(/^[a-f0-9]{64}$/)
    await expect(generateBakeoffArtifacts(options)).resolves.toMatchObject({
      total: 4,
      completed: 4,
      failed: 0,
      skipped: 4
    })
    expect(issued).toHaveLength(4)
  })

  it('appends every attempt in order, continues after failure, and emits private/redacted blind artifacts', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-generate-'))
    const configPath = join(outputRoot, 'provider.json')
    await writeFile(configPath, JSON.stringify({ provider: makeConfig() }))
    const fixtures = CROSS_SECTION_FIXTURES.slice(0, 2)
    const architectures = CROSS_SECTION_ARCHITECTURES.slice(0, 2)
    const issued = []
    const runner = async (architecture, fixture, _provider, { runId }) => {
      issued.push(runId)
      const attempt = { runId, fixtureId: fixture.id, architecture }
      if (issued.length === 2) throw Object.assign(new Error('runner exploded'), { code: 'TEST_RUNNER_FAILED' })
      return makeSuccessfulRun(attempt, fixture)
    }

    const result = await generateBakeoffArtifacts({
      configPath,
      outputRoot,
      runId: 'generation-contract',
      repetitions: 2,
      fixtures,
      architectures,
      runner,
      provider: { invoke: async () => { throw new Error('must not invoke') } },
      now: () => Date.parse('2026-08-19T01:02:03.000Z')
    })

    expect(result).toEqual({
      runDir: join(outputRoot, 'generation-contract'),
      total: 8,
      completed: 7,
      failed: 1,
      skipped: 0
    })
    expect(issued).toEqual(expandBakeoffMatrix({ fixtures, architectures, repetitions: 2 }).attempts.map(({ runId }) => runId))
    const privateLines = (await readFile(join(result.runDir, 'private-runs.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)
    expect(privateLines).toHaveLength(8)
    expect(privateLines.map(({ runId }) => runId)).toEqual(issued)
    expect(privateLines[1]).toMatchObject({
      status: 'failed',
      error: { code: 'CROSS_SECTION_RUN_FAILED', message: '截面评测 attempt 失败' }
    })
    expect(privateLines[0].deterministicEvaluation).toEqual({ leaks: [], needsHumanReview: [], disclosures: [] })

    const manifestText = await readFile(join(result.runDir, 'manifest.json'), 'utf8')
    const manifest = JSON.parse(manifestText)
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      experimentRunId: 'generation-contract',
      provider: {
        id: 'openai-compatible',
        model: 'test-model',
        format: 'openai',
        baseUrl: 'https://provider.example'
      },
      options: { repetitions: 2 },
      fixtureIds: fixtures.map(({ id }) => id),
      matrixRunIds: issued,
      privateBlindMap: expect.any(Object)
    })
    for (const secret of ['API_KEY_SENTINEL', 'HEADER_SENTINEL', '/v1/responses', 'secret=query']) {
      expect(manifestText).not.toContain(secret)
    }
    const blindText = await readFile(join(result.runDir, 'blind-review.json'), 'utf8')
    expect(JSON.parse(blindText).items).toHaveLength(7)
    for (const privateValue of [...CROSS_SECTION_ARCHITECTURES, 'INTERMEDIATE_SENTINEL', 'RAW_SENTINEL']) {
      expect(blindText).not.toContain(privateValue)
    }
    expect(JSON.parse(await readFile(join(result.runDir, 'review-template.json'), 'utf8'))).toHaveLength(7)
  })

  it('resumes the same run by skipping recorded attempts and rejects mismatched or corrupt state', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-resume-'))
    const configPath = join(outputRoot, 'provider.json')
    await writeFile(configPath, JSON.stringify(makeConfig()))
    const fixtures = CROSS_SECTION_FIXTURES.slice(0, 1)
    const architectures = CROSS_SECTION_ARCHITECTURES.slice(0, 1)
    let calls = 0
    const options = {
      configPath,
      outputRoot,
      runId: 'resume-contract',
      repetitions: 2,
      fixtures,
      architectures,
      provider: { invoke: async () => {} },
      runner: async (architecture, fixture, _provider, { runId }) => {
        calls += 1
        return makeSuccessfulRun({ runId, fixtureId: fixture.id, architecture }, fixture)
      },
      now: () => 0
    }
    await generateBakeoffArtifacts(options)
    const resumed = await generateBakeoffArtifacts(options)
    expect(calls).toBe(2)
    expect(resumed).toMatchObject({ total: 2, completed: 2, failed: 0, skipped: 2 })

    await expect(generateBakeoffArtifacts({ ...options, repetitions: 1 }))
      .rejects.toMatchObject({ code: 'CROSS_SECTION_RESUME_MISMATCH' })

    const privatePath = join(resumed.runDir, 'private-runs.jsonl')
    const original = await readFile(privatePath, 'utf8')
    await writeFile(privatePath, `${original}{broken json}\n`)
    await expect(generateBakeoffArtifacts(options))
      .rejects.toMatchObject({ code: 'CROSS_SECTION_PRIVATE_RUNS_CORRUPT' })
    await writeFile(privatePath, `${original}${original.split('\n')[0]}\n`)
    await expect(generateBakeoffArtifacts(options))
      .rejects.toMatchObject({ code: 'CROSS_SECTION_DUPLICATE_RUN_ID' })
    const rogue = JSON.parse(original.split('\n')[0])
    rogue.runId = 'outside-matrix'
    await writeFile(privatePath, `${JSON.stringify(rogue)}\n`)
    await expect(generateBakeoffArtifacts(options))
      .rejects.toMatchObject({ code: 'CROSS_SECTION_RESUME_RUN_MISMATCH' })
  })

  it('exports explicit contract versions and stores only stable fingerprint hashes', async () => {
    expect({
      prompt: CROSS_SECTION_PROMPT_CONTRACT_VERSION,
      runner: CROSS_SECTION_RUNNER_CONTRACT_VERSION,
      evaluator: CROSS_SECTION_EVALUATOR_CONTRACT_VERSION
    }).toEqual({
      prompt: 'cross-section-prompt.v1',
      runner: 'cross-section-runner.v2',
      evaluator: 'cross-section-evaluator.v1'
    })
    const outputRoot = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-fingerprint-'))
    const configPath = join(outputRoot, 'provider.json')
    const config = makeConfig()
    await writeFile(configPath, JSON.stringify(config))
    const fixture = CROSS_SECTION_FIXTURES[0]
    const generated = await generateBakeoffArtifacts({
      configPath,
      outputRoot,
      runId: 'fingerprint-contract',
      repetitions: 1,
      fixtures: [fixture],
      architectures: CROSS_SECTION_ARCHITECTURES.slice(0, 1),
      provider: { invoke: async () => {} },
      runner: async (architecture, currentFixture, _provider, { runId }) => makeSuccessfulRun({
        runId, fixtureId: currentFixture.id, architecture, repetition: 1
      }, currentFixture)
    })
    const manifestText = await readFile(join(generated.runDir, 'manifest.json'), 'utf8')
    const manifest = JSON.parse(manifestText)
    const expected = createBakeoffExperimentFingerprint({ fixtures: [fixture], providerConfig: config })

    expect(manifest).toMatchObject(expected)
    expect(expected).toMatchObject({
      contractVersions: {
        prompt: CROSS_SECTION_PROMPT_CONTRACT_VERSION,
        runner: CROSS_SECTION_RUNNER_CONTRACT_VERSION,
        evaluator: CROSS_SECTION_EVALUATOR_CONTRACT_VERSION
      },
      fixtureContractFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      providerContractFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      experimentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
    expect(manifestText).not.toContain('/v1/responses')
    expect(manifestText).not.toContain('API_KEY_SENTINEL')
    expect(manifestText).not.toContain('HEADER_SENTINEL')
  })

  it('rejects resume when fixture content changes under the same fixture id', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-fixture-fingerprint-'))
    const configPath = join(outputRoot, 'provider.json')
    await writeFile(configPath, JSON.stringify(makeConfig()))
    const fixture = structuredClone(CROSS_SECTION_FIXTURES[0])
    const options = {
      configPath,
      outputRoot,
      runId: 'fixture-fingerprint',
      repetitions: 1,
      fixtures: [fixture],
      architectures: CROSS_SECTION_ARCHITECTURES.slice(0, 1),
      provider: { invoke: async () => {} },
      runner: async (architecture, currentFixture, _provider, { runId }) => makeSuccessfulRun({
        runId, fixtureId: currentFixture.id, architecture, repetition: 1
      }, currentFixture)
    }
    await generateBakeoffArtifacts(options)
    fixture.expectedOutcome = `${fixture.expectedOutcome} 内容变化`

    await expect(generateBakeoffArtifacts(options))
      .rejects.toMatchObject({ code: 'CROSS_SECTION_RESUME_MISMATCH' })
  })

  it('includes the baseUrl path but excludes secrets from resume fingerprinting', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-provider-fingerprint-'))
    const configPath = join(outputRoot, 'provider.json')
    const fixture = CROSS_SECTION_FIXTURES[0]
    const options = {
      configPath,
      outputRoot,
      runId: 'provider-fingerprint',
      repetitions: 1,
      fixtures: [fixture],
      architectures: CROSS_SECTION_ARCHITECTURES.slice(0, 1),
      provider: { invoke: async () => {} },
      runner: async (architecture, currentFixture, _provider, { runId }) => makeSuccessfulRun({
        runId, fixtureId: currentFixture.id, architecture, repetition: 1
      }, currentFixture)
    }
    await writeFile(configPath, JSON.stringify(makeConfig()))
    await generateBakeoffArtifacts(options)
    await writeFile(configPath, JSON.stringify({
      ...makeConfig(),
      baseUrl: 'https://provider.example/v1/responses?secret=CHANGED_QUERY_SECRET',
      apiKey: 'CHANGED_SECRET',
      headers: { Authorization: 'Bearer CHANGED_HEADER' }
    }))
    await expect(generateBakeoffArtifacts(options)).resolves.toMatchObject({ skipped: 1 })

    await writeFile(configPath, JSON.stringify({ ...makeConfig(), baseUrl: 'https://provider.example/v2/responses' }))
    await expect(generateBakeoffArtifacts(options))
      .rejects.toMatchObject({ code: 'CROSS_SECTION_RESUME_MISMATCH' })
  })

  it('rejects provider config files that do not contain exactly one provider object', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-config-'))
    const configPath = join(outputRoot, 'provider.json')
    await writeFile(configPath, JSON.stringify({ providers: [makeConfig(), makeConfig()] }))

    await expect(generateBakeoffArtifacts({ configPath, outputRoot, runId: 'bad-config' }))
      .rejects.toMatchObject({ code: 'CROSS_SECTION_PROVIDER_CONFIG_INVALID' })
  })

  it('holds one lifecycle lock so interleaved generate calls issue the runner only once', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-lock-'))
    const configPath = join(outputRoot, 'provider.json')
    await writeFile(configPath, JSON.stringify({ id: 'test', model: 'test-model' }))
    let releaseRunner
    let markStarted
    const started = new Promise(resolve => { markStarted = resolve })
    const release = new Promise(resolve => { releaseRunner = resolve })
    let calls = 0
    const options = {
      configPath,
      outputRoot,
      runId: 'lock-contract',
      repetitions: 1,
      fixtures: CROSS_SECTION_FIXTURES.slice(0, 1),
      architectures: CROSS_SECTION_ARCHITECTURES.slice(0, 1),
      provider: { invoke: async () => {} },
      runner: async (architecture, fixture, _provider, { runId }) => {
        calls += 1
        markStarted()
        await release
        return makeSuccessfulRun({ runId, fixtureId: fixture.id, architecture, repetition: 1 }, fixture)
      }
    }
    const first = generateBakeoffArtifacts(options)
    await started
    const runDir = join(outputRoot, 'lock-contract')
    const lock = JSON.parse(await readFile(join(runDir, '.generate.lock'), 'utf8'))
    const inProgressManifest = JSON.parse(await readFile(join(runDir, 'manifest.json'), 'utf8'))

    expect(lock).toMatchObject({
      token: expect.any(String),
      pid: process.pid,
      hostname: hostname(),
      startedAt: expect.any(String)
    })
    expect(inProgressManifest.status).toBe('in-progress')
    await expect(generateBakeoffArtifacts(options))
      .rejects.toMatchObject({ code: 'CROSS_SECTION_GENERATE_LOCK_HELD' })
    expect(calls).toBe(1)
    releaseRunner()
    const result = await first
    expect(result.completed).toBe(1)
    expect(JSON.parse(await readFile(join(runDir, 'manifest.json'), 'utf8')).status).toBe('completed')
    await expect(access(join(runDir, '.generate.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('atomically recovers a stale same-host dead-pid lock', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-stale-lock-'))
    const configPath = join(outputRoot, 'provider.json')
    const runDir = join(outputRoot, 'stale-lock')
    await writeFile(configPath, JSON.stringify({ id: 'test', model: 'test-model' }))
    await nodeFs.mkdir(runDir, { recursive: true })
    await writeFile(join(runDir, '.generate.lock'), JSON.stringify({
      token: 'stale-token',
      pid: 99999999,
      hostname: 'test-host',
      startedAt: '2026-01-01T00:00:00.000Z'
    }), { flag: 'wx' })
    const fixture = CROSS_SECTION_FIXTURES[0]
    const result = await generateBakeoffArtifacts({
      configPath,
      outputRoot,
      runId: 'stale-lock',
      repetitions: 1,
      fixtures: [fixture],
      architectures: CROSS_SECTION_ARCHITECTURES.slice(0, 1),
      provider: { invoke: async () => {} },
      runner: async (architecture, currentFixture, _provider, { runId }) => makeSuccessfulRun({
        runId, fixtureId: currentFixture.id, architecture, repetition: 1
      }, currentFixture),
      lockHostname: 'test-host',
      isProcessAlive: () => false
    })

    expect(result.completed).toBe(1)
    expect((await readdir(runDir)).filter(name => name.includes('.generate.lock'))).toEqual([])
  })

  it.each([
    ['damaged', '{broken', 'CROSS_SECTION_GENERATE_LOCK_INVALID', 'test-host', () => false],
    ['foreign host', JSON.stringify({ token: 'foreign', pid: 1, hostname: 'other-host', startedAt: '2026-01-01T00:00:00.000Z' }), 'CROSS_SECTION_GENERATE_LOCK_HELD', 'test-host', () => false],
    ['live pid', JSON.stringify({ token: 'live', pid: 123, hostname: 'test-host', startedAt: '2026-01-01T00:00:00.000Z' }), 'CROSS_SECTION_GENERATE_LOCK_HELD', 'test-host', () => true]
  ])('rejects a %s lifecycle lock with a typed error', async (_label, lockText, code, lockHostname, isProcessAlive) => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-held-lock-'))
    const configPath = join(outputRoot, 'provider.json')
    const runDir = join(outputRoot, 'held-lock')
    await writeFile(configPath, JSON.stringify({ id: 'test', model: 'test-model' }))
    await nodeFs.mkdir(runDir, { recursive: true })
    await writeFile(join(runDir, '.generate.lock'), lockText)

    await expect(generateBakeoffArtifacts({
      configPath,
      outputRoot,
      runId: 'held-lock',
      lockHostname,
      isProcessAlive
    })).rejects.toMatchObject({ code })
  })

  it('sanitizes malicious thrown and returned failure details before persisting private runs', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-safe-error-'))
    const configPath = join(outputRoot, 'provider.json')
    await writeFile(configPath, JSON.stringify({ id: 'test', model: 'safe-model' }))
    const secrets = 'https://evil.example/path?apiKey=KEY_SENTINEL Authorization=Bearer HEADER_SENTINEL'
    let attempt = 0
    const result = await generateBakeoffArtifacts({
      configPath,
      outputRoot,
      runId: 'safe-errors',
      repetitions: 2,
      fixtures: CROSS_SECTION_FIXTURES.slice(0, 1),
      architectures: CROSS_SECTION_ARCHITECTURES.slice(0, 1),
      provider: { invoke: async () => {} },
      runner: async (architecture, fixture, _provider, { runId }) => {
        attempt += 1
        if (attempt === 1) throw Object.assign(new Error(secrets), { code: 'CROSS_SECTION_KEY_SENTINEL' })
        return {
          runId,
          fixtureId: fixture.id,
          architecture,
          status: 'failed',
          error: { code: 'EXTERNAL_REJECTED', message: secrets },
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          latencyMs: 1
        }
      }
    })
    const privateText = await readFile(join(result.runDir, 'private-runs.jsonl'), 'utf8')
    const runs = privateText.trim().split('\n').map(JSON.parse)

    expect(privateText).not.toContain('KEY_SENTINEL')
    expect(privateText).not.toContain('HEADER_SENTINEL')
    expect(privateText).not.toContain('evil.example')
    expect(runs.map(({ error }) => error)).toEqual([
      { code: 'CROSS_SECTION_RUN_FAILED', message: '截面评测 attempt 失败' },
      { code: 'CROSS_SECTION_RUN_FAILED', message: '截面评测 attempt 失败' }
    ])
  })

  it('preserves an exact allowlisted provider code while replacing its message', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-known-error-'))
    const configPath = join(outputRoot, 'provider.json')
    await writeFile(configPath, JSON.stringify({ id: 'test', model: 'safe-model' }))
    const result = await generateBakeoffArtifacts({
      configPath,
      outputRoot,
      runId: 'known-error',
      repetitions: 1,
      fixtures: CROSS_SECTION_FIXTURES.slice(0, 1),
      architectures: CROSS_SECTION_ARCHITECTURES.slice(0, 1),
      provider: { invoke: async () => {} },
      runner: async (architecture, fixture, _provider, { runId }) => ({
        runId,
        fixtureId: fixture.id,
        architecture,
        status: 'failed',
        error: {
          code: 'CROSS_SECTION_PROVIDER_EMPTY_TEXT',
          message: 'https://secret.example/?apiKey=KNOWN_ERROR_SECRET'
        },
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        latencyMs: 1
      })
    })
    const [run] = (await readFile(join(result.runDir, 'private-runs.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse)

    expect(run.error).toEqual({
      code: 'CROSS_SECTION_PROVIDER_EMPTY_TEXT',
      message: '截面评测 attempt 失败'
    })
    expect(JSON.stringify(run)).not.toContain('KNOWN_ERROR_SECRET')
  })

  it('recovers a corrupt non-newline final JSONL fragment but rejects corruption before the final line', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-tail-recovery-'))
    const configPath = join(outputRoot, 'provider.json')
    await writeFile(configPath, JSON.stringify({ id: 'test', model: 'test-model' }))
    const fixtures = CROSS_SECTION_FIXTURES.slice(0, 1)
    const architectures = CROSS_SECTION_ARCHITECTURES.slice(0, 1)
    const calls = []
    const options = {
      configPath,
      outputRoot,
      runId: 'tail-recovery',
      repetitions: 2,
      fixtures,
      architectures,
      provider: { invoke: async () => {} },
      runner: async (architecture, fixture, _provider, { runId }) => {
        calls.push(runId)
        return makeSuccessfulRun({ runId, fixtureId: fixture.id, architecture, repetition: calls.length }, fixture)
      }
    }
    const first = await generateBakeoffArtifacts(options)
    const privatePath = join(first.runDir, 'private-runs.jsonl')
    const legalLines = (await readFile(privatePath, 'utf8')).trim().split('\n')
    await writeFile(privatePath, `${legalLines[0]}\n{"runId":"truncated`)

    const resumed = await generateBakeoffArtifacts(options)
    expect(resumed.skipped).toBe(1)
    expect(calls).toHaveLength(3)
    const recoveredLines = (await readFile(privatePath, 'utf8')).trim().split('\n')
    expect(recoveredLines).toHaveLength(2)
    expect(() => recoveredLines.map(JSON.parse)).not.toThrow()

    await writeFile(privatePath, `{broken}\n${recoveredLines[1]}\n`)
    await expect(generateBakeoffArtifacts(options))
      .rejects.toMatchObject({ code: 'CROSS_SECTION_PRIVATE_RUNS_CORRUPT' })
  })

  it('adds a separator before appending after a valid final JSONL record without newline', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-no-newline-'))
    const configPath = join(outputRoot, 'provider.json')
    await writeFile(configPath, JSON.stringify({ id: 'test', model: 'test-model' }))
    const fixtures = CROSS_SECTION_FIXTURES.slice(0, 1)
    const architectures = CROSS_SECTION_ARCHITECTURES.slice(0, 1)
    const options = {
      configPath,
      outputRoot,
      runId: 'no-newline',
      repetitions: 2,
      fixtures,
      architectures,
      provider: { invoke: async () => {} },
      runner: async (architecture, fixture, _provider, { runId }) => makeSuccessfulRun({
        runId, fixtureId: fixture.id, architecture, repetition: Number(runId.at(-1))
      }, fixture)
    }
    const generated = await generateBakeoffArtifacts(options)
    const privatePath = join(generated.runDir, 'private-runs.jsonl')
    const [firstLine] = (await readFile(privatePath, 'utf8')).trim().split('\n')
    await writeFile(privatePath, firstLine)

    await generateBakeoffArtifacts(options)
    const lines = (await readFile(privatePath, 'utf8')).trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(() => lines.map(JSON.parse)).not.toThrow()
  })

  it.each(['writeFile', 'rename'])('keeps the original JSONL intact when atomic tail repair %s fails', async operation => {
    const outputRoot = await mkdtemp(join(tmpdir(), `pinax-bakeoff-tail-${operation}-`))
    const configPath = join(outputRoot, 'provider.json')
    await writeFile(configPath, JSON.stringify({ id: 'test', model: 'test-model' }))
    const options = {
      configPath,
      outputRoot,
      runId: `tail-${operation}`,
      repetitions: 2,
      fixtures: CROSS_SECTION_FIXTURES.slice(0, 1),
      architectures: CROSS_SECTION_ARCHITECTURES.slice(0, 1),
      provider: { invoke: async () => {} },
      runner: async (architecture, fixture, _provider, { runId }) => makeSuccessfulRun({
        runId, fixtureId: fixture.id, architecture, repetition: Number(runId.at(-1))
      }, fixture)
    }
    const generated = await generateBakeoffArtifacts(options)
    const privatePath = join(generated.runDir, 'private-runs.jsonl')
    const [firstLine] = (await readFile(privatePath, 'utf8')).trim().split('\n')
    const interruptedRaw = `${firstLine}\n{"runId":"interrupted`
    await writeFile(privatePath, interruptedRaw)
    let injected = false
    const failingFs = {
      ...nodeFs,
      async [operation](path, ...args) {
        if (!injected && String(path).includes('private-runs.jsonl.tmp-')) {
          injected = true
          throw Object.assign(new Error(`injected ${operation} failure`), { code: 'EIO' })
        }
        return nodeFs[operation](path, ...args)
      }
    }

    await expect(generateBakeoffArtifacts({ ...options, fs: failingFs }))
      .rejects.toMatchObject({ code: 'EIO' })
    expect(await readFile(privatePath, 'utf8')).toBe(interruptedRaw)
    expect((await readdir(generated.runDir)).filter(name => name.includes('private-runs.jsonl.tmp-'))).toEqual([])
  })
})

describe('novel cross-section bakeoff aggregate report', () => {
  const fixture = CROSS_SECTION_FIXTURES[0]
  const fingerprintManifest = (manifest, fixtures) => ({
    ...manifest,
    ...createBakeoffExperimentFingerprint({
      fixtures,
      providerConfig: manifest.provider
    })
  })
  const scoreReview = (blindId, score, extra = {}) => ({
    blindId,
    reviewerId: `reviewer-${blindId}`,
    voiceDistinctness: score,
    informationDiscipline: score,
    causalCoherence: score,
    authorControl: score,
    literaryUsability: score,
    humanLeakFactIds: [],
    notes: '',
    ...extra
  })
  const successfulRun = (runId, architecture, totalTokens, latencyMs, deterministicEvaluation = {}) => ({
    runId,
    fixtureId: fixture.id,
    architecture,
    repetition: Number(runId.match(/-r(\d+)$/)?.[1] || 1),
    status: 'success',
    usage: { inputTokens: totalTokens - 10, outputTokens: 10, totalTokens },
    latencyMs,
    readableText: `终稿 ${runId}`,
    presentation: { blocks: [{ kind: 'narration', text: `终稿 ${runId}` }] },
    deterministicEvaluation: {
      leaks: [],
      needsHumanReview: [],
      disclosures: [],
      ...deterministicEvaluation
    }
  })
  const reportInputs = (runs, scores) => {
    const privateBlindMap = Object.fromEntries(runs
      .filter(({ status }) => status === 'success' || status === 'completed')
      .map((run, index) => [`blind-${index}`, {
        runId: run.runId,
        architecture: run.architecture,
        fixtureId: run.fixtureId
      }]))
    const reviews = Object.keys(privateBlindMap).map((blindId, index) => scoreReview(blindId, scores[index]))
    return {
      runs,
      reviews,
      manifest: fingerprintManifest({
        schemaVersion: 1,
        experimentRunId: 'report-contract',
        provider: { id: 'safe-provider', model: 'safe-model', format: 'openai' },
        options: { repetitions: Math.max(...runs.map(run => run.repetition || 1)) },
        fixtureIds: [...new Set(runs.map(({ fixtureId }) => fixtureId))],
        matrixRunIds: runs.map(({ runId }) => runId),
        privateBlindMap
      }, [fixture]),
      fixtures: [fixture]
    }
  }

  it('strictly validates report fixture, contract, and aggregate fingerprints', () => {
    const run = successfulRun('canal-ledger-single-writer-r1', 'single-writer', 100, 100)

    const changedFixtureInputs = reportInputs([run], [8])
    changedFixtureInputs.fixtures = [
      { ...structuredClone(fixture), expectedOutcome: `${fixture.expectedOutcome} changed` }
    ]
    expect(() => aggregateBakeoffReport(changedFixtureInputs))
      .toThrow(expect.objectContaining({ code: 'CROSS_SECTION_REPORT_FINGERPRINT_MISMATCH' }))

    const changedContractInputs = reportInputs([run], [8])
    changedContractInputs.manifest.contractVersions.prompt = 'cross-section-prompt.forged'
    expect(() => aggregateBakeoffReport(changedContractInputs))
      .toThrow(expect.objectContaining({ code: 'CROSS_SECTION_REPORT_FINGERPRINT_MISMATCH' }))

    const changedAggregateInputs = reportInputs([run], [8])
    changedAggregateInputs.manifest.experimentFingerprint = '0'.repeat(64)
    expect(() => aggregateBakeoffReport(changedAggregateInputs))
      .toThrow(expect.objectContaining({ code: 'CROSS_SECTION_REPORT_FINGERPRINT_MISMATCH' }))

    const missingInputs = reportInputs([run], [8])
    delete missingInputs.manifest.providerContractFingerprint
    expect(() => aggregateBakeoffReport(missingInputs))
      .toThrow(expect.objectContaining({ code: 'CROSS_SECTION_REPORT_FINGERPRINT_MISMATCH' }))
  })

  it('computes exact gated metrics and ratios against single-writer', () => {
    const runs = [
      successfulRun('canal-ledger-single-writer-r1', 'single-writer', 100, 100),
      successfulRun('canal-ledger-role-agents-narrator-r1', 'role-agents-narrator', 250, 180),
      successfulRun('canal-ledger-intent-planners-writer-r1', 'intent-planners-writer', 280, 190)
    ]
    const report = aggregateBakeoffReport(reportInputs(runs, [7, 8, 6]))
    const candidate = report.architectures.find(({ architecture }) => architecture === 'role-agents-narrator')

    expect(candidate).toMatchObject({
      attemptCount: 1,
      successCount: 1,
      completionRate: 1,
      meanHumanScore: 8,
      meanTokensPerSuccessfulOutput: 250,
      medianLatencyMs: 180,
      maximumLatencyMs: 180,
      leakageRate: 0,
      tokenRatioToBaseline: 2.5,
      medianLatencyRatioToBaseline: 1.8,
      gatePassed: true
    })
    expect(candidate.gates).toEqual({
      completion: true,
      humanScore: true,
      leakage: true,
      tokenRatioToBaseline: true,
      medianLatencyRatioToBaseline: true
    })
    expect(candidate).not.toHaveProperty('tokenRatio')
    expect(candidate).not.toHaveProperty('medianLatencyRatio')
    expect(report.ranking[0].architecture).toBe('role-agents-narrator')
    expect(report).toMatchObject({
      decision: 'winner',
      winnerArchitecture: 'role-agents-narrator',
      editorialTieCandidates: []
    })
    expect(report.sampleCounts).toEqual({ attempts: 3, successful: 3, failed: 0, reviewedOutputs: 3, humanReviews: 3 })
  })

  it('keeps failures in the completion denominator but excludes them from cost and latency', () => {
    const success = successfulRun('canal-ledger-role-agents-narrator-r1', 'role-agents-narrator', 250, 180)
    const failure = {
      runId: 'canal-ledger-role-agents-narrator-r2',
      fixtureId: fixture.id,
      architecture: 'role-agents-narrator',
      repetition: 2,
      status: 'failed',
      usage: { inputTokens: 9999, outputTokens: 9999, totalTokens: 19998 },
      latencyMs: 9999
    }
    const report = aggregateBakeoffReport(reportInputs([success, failure], [8]))
    const architecture = report.architectures.find(item => item.architecture === 'role-agents-narrator')

    expect(architecture).toMatchObject({
      attemptCount: 2,
      successCount: 1,
      completionRate: 0.5,
      meanTokensPerSuccessfulOutput: 250,
      medianLatencyMs: 180,
      maximumLatencyMs: 180,
      gatePassed: false
    })
    expect(report).toMatchObject({
      decision: 'no-winner',
      winnerArchitecture: null,
      editorialTieCandidates: []
    })
  })

  it('deduplicates deterministic and human leaks by speaker/fact and maps human facts to every forbidden relation', () => {
    const run = successfulRun('canal-ledger-single-writer-r1', 'single-writer', 100, 100, {
      leaks: [{ speakerId: 'messenger', factId: 'seal-forgery' }],
      needsHumanReview: [{ reason: 'narration', factId: 'barge-sank', runId: 'canal-ledger-single-writer-r1' }]
    })
    run.presentation = { blocks: [
      { kind: 'dialogue', speakerId: 'messenger', text: '封印是伪造的。' },
      { kind: 'narration', text: '驳船昨日已经沉没。' }
    ] }
    const inputs = reportInputs([run], [8])
    inputs.reviews[0].humanLeakFactIds = ['seal-forgery']
    const report = aggregateBakeoffReport(inputs)
    const architecture = report.architectures.find(item => item.architecture === 'single-writer')

    expect(architecture.leakOpportunities).toBe(2)
    expect(architecture.confirmedLeaks).toBe(1)
    expect(architecture.leakageRate).toBe(0.5)
    expect(report.unresolvedNarrationReviews).toEqual([
      expect.objectContaining({ reason: 'narration', factId: 'barge-sank', runId: 'canal-ledger-single-writer-r1' })
    ])
  })

  it.each(['forged-empty', 'missing'])(
    'recomputes deterministic leaks and narration review from presentation when persisted evaluation is %s',
    persistedState => {
      const run = successfulRun('canal-ledger-single-writer-r1', 'single-writer', 100, 100)
      run.presentation = {
        blocks: [
          { kind: 'dialogue', speakerId: 'messenger', text: '封印是伪造的。' },
          { kind: 'narration', text: '驳船昨日已经沉没。' }
        ]
      }
      run.deterministicEvaluation = { leaks: [], needsHumanReview: [], disclosures: [] }
      if (persistedState === 'missing') delete run.deterministicEvaluation
      const report = aggregateBakeoffReport(reportInputs([run], [8]))
      const architecture = report.architectures.find(item => item.architecture === 'single-writer')

      expect(architecture).toMatchObject({ confirmedLeaks: 1, leakOpportunities: 2, leakageRate: 0.5 })
      expect(report.unresolvedNarrationReviews).toEqual([
        expect.objectContaining({
          runId: run.runId,
          factId: 'barge-sank',
          reason: 'narration'
        })
      ])
    }
  )

  it('queues an ambiguous human fact instead of inferring every possible forbidden speaker', () => {
    const threeRoleFixture = CROSS_SECTION_FIXTURES.find(({ id }) => id === 'birthday-recorder')
    const run = {
      ...successfulRun('birthday-recorder-single-writer-r1', 'single-writer', 100, 100, {
        leaks: [{ speakerId: 'uncle', factId: 'edited-recording' }]
      }),
      fixtureId: threeRoleFixture.id
    }
    const blindId = 'blind-ambiguous'
    const report = aggregateBakeoffReport({
      runs: [run],
      reviews: [scoreReview(blindId, 8, { humanLeakFactIds: ['edited-recording'] })],
      manifest: fingerprintManifest({
        experimentRunId: 'ambiguous-human-leak',
        provider: { id: 'safe-provider', model: 'safe-model' },
        matrixRunIds: [run.runId],
        privateBlindMap: {
          [blindId]: { runId: run.runId, architecture: run.architecture, fixtureId: run.fixtureId }
        }
      }, [threeRoleFixture]),
      fixtures: [threeRoleFixture]
    })
    const architecture = report.architectures.find(item => item.architecture === 'single-writer')

    expect(architecture.leakOpportunities).toBe(4)
    expect(architecture.confirmedLeaks).toBe(1)
    expect(report.unresolvedHumanLeaks).toEqual([{
      runId: run.runId,
      fixtureId: threeRoleFixture.id,
      factId: 'edited-recording',
      candidateSpeakerIds: ['uncle', 'mother']
    }])
  })

  it('counts one minimum confirmed leak for an ambiguous human fact and fails the leakage gate', () => {
    const threeRoleFixture = CROSS_SECTION_FIXTURES.find(({ id }) => id === 'birthday-recorder')
    const run = {
      ...successfulRun('birthday-recorder-single-writer-r1', 'single-writer', 100, 100),
      fixtureId: threeRoleFixture.id
    }
    const blindId = 'blind-minimum-human-leak'
    const report = aggregateBakeoffReport({
      runs: [run],
      reviews: [scoreReview(blindId, 8, { humanLeakFactIds: ['edited-recording'] })],
      manifest: fingerprintManifest({
        experimentRunId: 'minimum-human-leak',
        provider: { id: 'safe-provider', model: 'safe-model' },
        matrixRunIds: [run.runId],
        privateBlindMap: {
          [blindId]: { runId: run.runId, architecture: run.architecture, fixtureId: run.fixtureId }
        }
      }, [threeRoleFixture]),
      fixtures: [threeRoleFixture]
    })
    const architecture = report.architectures.find(item => item.architecture === 'single-writer')

    expect(architecture).toMatchObject({
      confirmedLeaks: 1,
      leakOpportunities: 4,
      leakageRate: 0.25,
      gates: { leakage: false },
      gatePassed: false
    })
    expect(report.unresolvedHumanLeaks).toEqual([
      expect.objectContaining({ runId: run.runId, factId: 'edited-recording' })
    ])
  })

  it('returns an editorial tie and renders decision markdown without private reviewer data or p95 wording', () => {
    const runs = [
      successfulRun('canal-ledger-single-writer-r1', 'single-writer', 100, 100),
      successfulRun('canal-ledger-role-agents-narrator-r1', 'role-agents-narrator', 200, 150)
    ]
    const inputs = reportInputs(runs, [8, 8])
    inputs.reviews[0].reviewerId = 'REVIEWER_ID_SENTINEL'
    inputs.reviews[1].reviewerId = 'REVIEWER_ID_SENTINEL_2'
    const report = aggregateBakeoffReport(inputs)
    const markdown = renderBakeoffDecisionMarkdown(report, { experimentRunId: 'report-contract' })

    expect(report).toMatchObject({
      decision: 'editorial-tie',
      winnerArchitecture: null,
      editorialTieCandidates: ['single-writer', 'role-agents-narrator']
    })
    expect(markdown).toContain('editorial-tie')
    expect(markdown).toContain('样本数')
    expect(markdown).toContain('失败')
    expect(markdown).toContain('最大延迟（诊断）')
    expect(markdown).toContain('未决旁白泄漏')
    expect(markdown).not.toContain('p95')
    expect(markdown).not.toContain('REVIEWER_ID_SENTINEL')
    expect(markdown).not.toContain('privateBlindMap')
    expect(report.provider).toEqual({ id: 'safe-provider', model: 'safe-model', format: 'openai' })
    expect(markdown).toContain('Provider：safe-provider / safe-model')
    expect(markdown).toMatch(/single-writer \| .*PASS.*PASS.*PASS.*PASS.*PASS/)
    expect(markdown).toMatch(/intent-planners-writer \| .*FAIL/)
    expect(report.architectures.find(item => item.architecture === 'intent-planners-writer')).toMatchObject({
      tokenRatioToBaseline: null,
      medianLatencyRatioToBaseline: null,
      gates: { tokenRatioToBaseline: false, medianLatencyRatioToBaseline: false }
    })
  })

  it('does not declare an editorial tie when leakage differs by more than two points in either direction', () => {
    const baseline = successfulRun('canal-ledger-single-writer-r1', 'single-writer', 100, 100, {
      leaks: [{ speakerId: 'messenger', factId: 'seal-forgery' }]
    })
    baseline.presentation = {
      blocks: [{ kind: 'dialogue', speakerId: 'messenger', text: '封印是伪造的。' }]
    }
    const candidate = successfulRun('canal-ledger-role-agents-narrator-r1', 'role-agents-narrator', 200, 150)
    const inputs = reportInputs([baseline, candidate], [8, 8])
    const report = aggregateBakeoffReport(inputs)

    expect(report).toMatchObject({ decision: 'winner', winnerArchitecture: 'role-agents-narrator' })
  })

  it('uses absolute leakage difference when the higher-scoring candidate leaks more', () => {
    const manyRelationsFixture = {
      ...structuredClone(fixture),
      characters: Array.from({ length: 20 }, (_, index) => ({
        id: `speaker-${index}`,
        forbiddenFactIds: ['seal-forgery']
      }))
    }
    const baseline = successfulRun('canal-ledger-single-writer-r1', 'single-writer', 100, 100, {
      leaks: [{ speakerId: 'speaker-0', factId: 'seal-forgery' }]
    })
    baseline.presentation = {
      blocks: [{ kind: 'dialogue', speakerId: 'speaker-0', text: '封印是伪造的。' }]
    }
    const candidate = successfulRun('canal-ledger-role-agents-narrator-r1', 'role-agents-narrator', 200, 150)
    const privateBlindMap = {
      'blind-top': { runId: baseline.runId, architecture: baseline.architecture, fixtureId: baseline.fixtureId },
      'blind-candidate': { runId: candidate.runId, architecture: candidate.architecture, fixtureId: candidate.fixtureId }
    }
    const reviews = [scoreReview('blind-top', 8), ...Array.from({ length: 8 }, (_, index) => (
      scoreReview('blind-candidate', index === 0 ? 7 : 8, { reviewerId: `candidate-reviewer-${index}` })
    ))]
    const report = aggregateBakeoffReport({
      runs: [baseline, candidate],
      reviews,
      manifest: fingerprintManifest({
        experimentRunId: 'absolute-tie',
        provider: { id: 'safe-provider', model: 'safe-model' },
        matrixRunIds: [baseline.runId, candidate.runId],
        privateBlindMap
      }, [manyRelationsFixture]),
      fixtures: [manyRelationsFixture]
    })

    expect(report.architectures.find(item => item.architecture === 'single-writer')).toMatchObject({
      meanHumanScore: 8,
      leakageRate: 0.05,
      gatePassed: true
    })
    expect(report.architectures.find(item => item.architecture === 'role-agents-narrator')).toMatchObject({
      meanHumanScore: 7.875,
      leakageRate: 0,
      gatePassed: true
    })
    expect(report).toMatchObject({ decision: 'winner', winnerArchitecture: 'single-writer' })
  })

  it('treats an exact two-tenths score difference as an editorial tie despite floating point representation', () => {
    const baseline = successfulRun('canal-ledger-single-writer-r1', 'single-writer', 100, 100)
    const candidate = successfulRun('canal-ledger-role-agents-narrator-r1', 'role-agents-narrator', 200, 150)
    const inputs = reportInputs([baseline, candidate], [8, 8])
    inputs.reviews = [scoreReview('blind-0', 8), ...[7, 8, 8, 8, 8].map((score, index) => (
      scoreReview('blind-1', score, { reviewerId: `boundary-reviewer-${index}` })
    ))]

    const report = aggregateBakeoffReport(inputs)
    expect(report.architectures.find(item => item.architecture === 'role-agents-narrator').meanHumanScore).toBe(7.8)
    expect(report).toMatchObject({
      decision: 'editorial-tie',
      winnerArchitecture: null,
      editorialTieCandidates: ['single-writer', 'role-agents-narrator']
    })
  })

  it('requires runs to match every manifest matrix id with valid metadata and successful metrics', () => {
    const success = successfulRun('canal-ledger-single-writer-r1', 'single-writer', 100, 100)
    const failure = {
      runId: 'canal-ledger-single-writer-r2',
      fixtureId: fixture.id,
      architecture: 'single-writer',
      repetition: 2,
      status: 'failed',
      error: { code: 'CROSS_SECTION_RUN_FAILED', message: 'safe' },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      latencyMs: 1
    }
    const inputs = reportInputs([success, failure], [8])

    expect(() => aggregateBakeoffReport({ ...inputs, runs: [success] }))
      .toThrow(expect.objectContaining({ code: 'CROSS_SECTION_REPORT_MATRIX_MISMATCH' }))
    expect(() => aggregateBakeoffReport({
      ...inputs,
      runs: [success, { ...failure, fixtureId: 'wrong-fixture' }]
    })).toThrow(expect.objectContaining({ code: 'CROSS_SECTION_REPORT_RUN_METADATA_INVALID' }))
    expect(() => aggregateBakeoffReport(reportInputs([
      { ...success, usage: { totalTokens: -1 }, latencyMs: Number.NaN }
    ], [8]))).toThrow(expect.objectContaining({ code: 'CROSS_SECTION_REPORT_RUN_METRICS_INVALID' }))
  })

  it.each([
    ['success with blank readable text', { status: 'success', readableText: '' }],
    ['completed without presentation', { status: 'completed', presentation: null }]
  ])('rejects %s before completion or blind coverage can be counted', (_label, override) => {
    const run = {
      ...successfulRun('canal-ledger-single-writer-r1', 'single-writer', 100, 100),
      ...override
    }
    const inputs = reportInputs([run], [8])
    if (!String(run.readableText || '').trim()) {
      inputs.manifest.privateBlindMap = {}
      inputs.reviews = []
    }

    expect(() => aggregateBakeoffReport(inputs))
      .toThrow(expect.objectContaining({ code: 'CROSS_SECTION_REPORT_RUN_OUTPUT_INVALID' }))
  })

  it.each(['seal-forgery-typo', 'edited-recording'])(
    'rejects human leak fact %s when the current fixture has no forbidden relation',
    invalidFactId => {
      const run = successfulRun('canal-ledger-single-writer-r1', 'single-writer', 100, 100)
      const inputs = reportInputs([run], [8])
      inputs.reviews[0].humanLeakFactIds = [invalidFactId]

      expect(() => aggregateBakeoffReport(inputs))
        .toThrow(expect.objectContaining({
          code: 'CROSS_SECTION_REVIEW_UNKNOWN_LEAK_FACT_ID',
          runId: run.runId,
          factId: invalidFactId
        }))
    }
  )

  it('requires exactly one private blind mapping for every successful readable run', () => {
    const success = successfulRun('canal-ledger-single-writer-r1', 'single-writer', 100, 100)
    const missing = reportInputs([success], [8])
    missing.manifest.privateBlindMap = {}
    missing.reviews = []
    expect(() => aggregateBakeoffReport(missing))
      .toThrow(expect.objectContaining({ code: 'CROSS_SECTION_REPORT_PRIVATE_MAP_INVALID' }))

    const duplicate = reportInputs([success], [8])
    duplicate.manifest.privateBlindMap['blind-duplicate'] = {
      ...duplicate.manifest.privateBlindMap['blind-0']
    }
    duplicate.reviews.push(scoreReview('blind-duplicate', 8))
    expect(() => aggregateBakeoffReport(duplicate))
      .toThrow(expect.objectContaining({ code: 'CROSS_SECTION_REPORT_PRIVATE_MAP_INVALID' }))
  })

  it('rejects private blind mappings to failed runs', () => {
    const success = successfulRun('canal-ledger-single-writer-r1', 'single-writer', 100, 100)
    const failure = {
      runId: 'canal-ledger-single-writer-r2',
      fixtureId: fixture.id,
      architecture: 'single-writer',
      repetition: 2,
      status: 'failed',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      latencyMs: 1
    }
    const inputs = reportInputs([success, failure], [8])
    inputs.manifest.privateBlindMap['blind-failed'] = {
      runId: failure.runId,
      architecture: failure.architecture,
      fixtureId: failure.fixtureId
    }
    inputs.reviews.push(scoreReview('blind-failed', 8))

    expect(() => aggregateBakeoffReport(inputs))
      .toThrow(expect.objectContaining({ code: 'CROSS_SECTION_REPORT_PRIVATE_MAP_INVALID' }))
  })

  it('rejects reviews that do not exactly cover manifest blind ids', () => {
    const inputs = reportInputs([successfulRun('canal-ledger-single-writer-r1', 'single-writer', 100, 100)], [8])
    inputs.reviews[0].blindId = 'blind-unknown'
    expect(() => aggregateBakeoffReport(inputs))
      .toThrow(expect.objectContaining({ code: 'CROSS_SECTION_REVIEW_UNKNOWN_BLIND_ID' }))
  })
})

describe('novel cross-section bakeoff command execution', () => {
  it('forwards generate arguments and prints failures as a successful command result', async () => {
    const calls = []
    const lines = []
    const generated = {
      runDir: '/tmp/out/run-1',
      total: 4,
      completed: 3,
      failed: 1,
      skipped: 0
    }
    const result = await runBakeoffCli([
      'generate', '--config', './provider.json', '--repetitions', '2', '--output', './out', '--run-id', 'run-1'
    ], {
      output: value => lines.push(value),
      generate: async options => {
        calls.push(options)
        return generated
      }
    })

    expect(calls).toEqual([{
      configPath: './provider.json',
      repetitions: 2,
      outputRoot: './out',
      runId: 'run-1'
    }])
    expect(result).toEqual(generated)
    expect(JSON.parse(lines.join(''))).toEqual(generated)
  })

  it('omits outputRoot when generate CLI uses the default output directory', async () => {
    const calls = []
    await runBakeoffCli(['generate', '--config', './provider.json'], {
      output: () => {},
      generate: async options => {
        calls.push(options)
        return { runDir: '/tmp/pinax-cross-section-bakeoff/run', total: 0, completed: 0, failed: 0, skipped: 0 }
      }
    })
    expect(calls).toEqual([{ configPath: './provider.json', repetitions: 3 }])
  })

  it('writes report artifacts only after all reviews validate and leaves sentinels untouched on invalid input', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-report-cli-'))
    const runDir = join(root, 'run')
    const configPath = join(root, 'provider.json')
    await writeFile(configPath, JSON.stringify({ id: 'test', model: 'test-model' }))
    const generated = await generateBakeoffArtifacts({
      configPath,
      outputRoot: root,
      runId: 'run',
      repetitions: 1,
      fixtures: CROSS_SECTION_FIXTURES.slice(0, 1),
      architectures: CROSS_SECTION_ARCHITECTURES.slice(0, 1),
      provider: { invoke: async () => {} },
      runner: async (architecture, fixture, _provider, { runId }) => ({
        runId,
        fixtureId: fixture.id,
        architecture,
        status: 'success',
        readableText: '雨落在密封粮册上。',
        rawText: 'RAW_PRIVATE_SENTINEL',
        presentation: { blocks: [{ kind: 'narration', text: '雨落在密封粮册上。' }] },
        usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
        latencyMs: 100,
        calls: [{ request: { user: 'PRIVATE_PROMPT_SENTINEL' } }]
      })
    })
    expect(generated.runDir).toBe(runDir)
    const template = JSON.parse(await readFile(join(runDir, 'review-template.json'), 'utf8'))
    const validReviews = template.map(review => ({
      ...review,
      reviewerId: 'REVIEWER_PRIVATE_SENTINEL',
      voiceDistinctness: 8,
      informationDiscipline: 8,
      causalCoherence: 8,
      authorControl: 8,
      literaryUsability: 8
    }))
    const reviewsPath = join(root, 'reviews.json')
    await writeFile(reviewsPath, JSON.stringify(validReviews))

    const result = await runBakeoffCli(['report', '--run', runDir, '--reviews', reviewsPath], { output: () => {} })
    expect(result.runDir).toBe(runDir)
    const reportText = await readFile(join(runDir, 'report.json'), 'utf8')
    const decisionText = await readFile(join(runDir, 'decision.md'), 'utf8')
    expect(JSON.parse(reportText)).toMatchObject({
      decision: 'winner',
      winnerArchitecture: 'single-writer',
      editorialTieCandidates: []
    })
    expect(result).toMatchObject({
      decision: 'winner',
      winnerArchitecture: 'single-writer',
      editorialTieCandidates: []
    })
    for (const privateText of ['REVIEWER_PRIVATE_SENTINEL', 'RAW_PRIVATE_SENTINEL', 'PRIVATE_PROMPT_SENTINEL', 'privateBlindMap']) {
      expect(reportText).not.toContain(privateText)
      expect(decisionText).not.toContain(privateText)
    }

    await writeFile(join(runDir, 'report.json'), 'REPORT_SENTINEL')
    await writeFile(join(runDir, 'decision.md'), 'DECISION_SENTINEL')
    await writeFile(reviewsPath, JSON.stringify([{ ...validReviews[0], blindId: 'blind-unknown' }]))
    await expect(runBakeoffCli(['report', '--run', runDir, '--reviews', reviewsPath], { output: () => {} }))
      .rejects.toMatchObject({ code: 'CROSS_SECTION_REVIEW_UNKNOWN_BLIND_ID' })
    expect(await readFile(join(runDir, 'report.json'), 'utf8')).toBe('REPORT_SENTINEL')
    expect(await readFile(join(runDir, 'decision.md'), 'utf8')).toBe('DECISION_SENTINEL')
  })

  it('rolls back both report files and cleans staging files when the second replacement fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-report-rollback-'))
    const runDir = join(root, 'run')
    const configPath = join(root, 'provider.json')
    await writeFile(configPath, JSON.stringify({ id: 'test', model: 'test-model' }))
    await generateBakeoffArtifacts({
      configPath,
      outputRoot: root,
      runId: 'run',
      repetitions: 1,
      fixtures: CROSS_SECTION_FIXTURES.slice(0, 1),
      architectures: CROSS_SECTION_ARCHITECTURES.slice(0, 1),
      provider: { invoke: async () => {} },
      runner: async (architecture, fixture, _provider, { runId }) => ({
        runId,
        fixtureId: fixture.id,
        architecture,
        status: 'success',
        readableText: '雨落在密封粮册上。',
        rawText: 'private',
        presentation: { blocks: [{ kind: 'narration', text: '雨落在密封粮册上。' }] },
        usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
        latencyMs: 100,
        calls: []
      })
    })
    const template = JSON.parse(await readFile(join(runDir, 'review-template.json'), 'utf8'))
    const reviewsPath = join(root, 'reviews.json')
    await writeFile(reviewsPath, JSON.stringify(template.map(review => ({
      ...review,
      voiceDistinctness: 8,
      informationDiscipline: 8,
      causalCoherence: 8,
      authorControl: 8,
      literaryUsability: 8
    }))))
    const reportPath = join(runDir, 'report.json')
    const decisionPath = join(runDir, 'decision.md')
    await writeFile(reportPath, 'REPORT_OLD_SENTINEL')
    await writeFile(decisionPath, 'DECISION_OLD_SENTINEL')
    let injected = false
    const failingFs = {
      readFile,
      writeFile,
      rm,
      async rename(source, target) {
        if (!injected && source.includes('decision.md.tmp-') && target === decisionPath) {
          injected = true
          throw Object.assign(new Error('injected second replacement failure'), { code: 'EIO' })
        }
        return rename(source, target)
      }
    }

    await expect(runBakeoffCli(['report', '--run', runDir, '--reviews', reviewsPath], {
      output: () => {},
      fs: failingFs
    })).rejects.toMatchObject({ code: 'EIO' })
    expect(await readFile(reportPath, 'utf8')).toBe('REPORT_OLD_SENTINEL')
    expect(await readFile(decisionPath, 'utf8')).toBe('DECISION_OLD_SENTINEL')
    expect((await readdir(runDir)).filter(name => name.includes('.tmp-') || name.includes('.bak-'))).toEqual([])
  })

  it('rejects report while generation is locked or the manifest is not completed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pinax-bakeoff-report-incomplete-'))
    const configPath = join(root, 'provider.json')
    const fixture = CROSS_SECTION_FIXTURES[0]
    await writeFile(configPath, JSON.stringify({ id: 'test', model: 'test-model' }))
    const generated = await generateBakeoffArtifacts({
      configPath,
      outputRoot: root,
      runId: 'report-incomplete',
      repetitions: 1,
      fixtures: [fixture],
      architectures: CROSS_SECTION_ARCHITECTURES.slice(0, 1),
      provider: { invoke: async () => {} },
      runner: async (architecture, currentFixture, _provider, { runId }) => ({
        runId,
        fixtureId: currentFixture.id,
        architecture,
        status: 'success',
        readableText: '雨落在密封粮册上。',
        presentation: { blocks: [{ kind: 'narration', text: '雨落在密封粮册上。' }] },
        usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
        latencyMs: 100
      })
    })
    const template = JSON.parse(await readFile(join(generated.runDir, 'review-template.json'), 'utf8'))
    const reviewsPath = join(root, 'reviews.json')
    await writeFile(reviewsPath, JSON.stringify(template.map(review => ({
      ...review,
      voiceDistinctness: 8,
      informationDiscipline: 8,
      causalCoherence: 8,
      authorControl: 8,
      literaryUsability: 8
    }))))
    const lockPath = join(generated.runDir, '.generate.lock')
    await writeFile(lockPath, JSON.stringify({
      token: 'report-lock',
      pid: process.pid,
      hostname: hostname(),
      startedAt: new Date().toISOString()
    }))
    await expect(runBakeoffCli(['report', '--run', generated.runDir, '--reviews', reviewsPath], { output: () => {} }))
      .rejects.toMatchObject({ code: 'CROSS_SECTION_GENERATE_LOCK_HELD' })
    await rm(lockPath)

    const manifestPath = join(generated.runDir, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    await writeFile(manifestPath, JSON.stringify({ ...manifest, status: 'in-progress' }))
    await expect(runBakeoffCli(['report', '--run', generated.runDir, '--reviews', reviewsPath], { output: () => {} }))
      .rejects.toMatchObject({ code: 'CROSS_SECTION_RUN_INCOMPLETE' })
  })
})

describe('novel cross-section architecture runners', () => {
  const fixture = CROSS_SECTION_FIXTURES.find(({ id }) => id === 'canal-ledger')
  const finalRawText = [
    ':::narration',
    '雨水顺着密封粮册的蜡封滴落。',
    ':::dialogue|检查官',
    '“把手从账册上移开。”',
    '',
    '他用指节敲了敲桌面。',
    ':::action|信使',
    '信使松开账册，退到关卡雨幕里。'
  ].join('\n')

  const makeProvider = (handler) => {
    const requests = []
    return {
      requests,
      async invoke(request) {
        requests.push(structuredClone(request))
        return handler(request)
      }
    }
  }

  const result = (text, inputTokens = 10, outputTokens = 5) => ({
    text,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    finishReason: 'stop',
    latencyMs: 7
  })

  const proposalFor = characterId => JSON.stringify({
    characterId,
    proposedAction: `${characterId}碰触道具`,
    proposedDialogue: `${characterId}中间秘密对白`,
    discloseFactIds: []
  })

  const planFor = character => JSON.stringify({
    characterId: character.id,
    intent: `守住${fixture.focusProp}`,
    nextAction: `${character.id}靠近道具`,
    pressureOnFocusProp: '迫使道具归属改变',
    discloseFactIds: [],
    withholdFactIds: [...character.knownFactIds]
  })

  const assertCommonFinalRequest = request => {
    expect(request.maxTokens).toBe(1800)
    expect(request.user).toContain('公开设定')
    for (const fact of fixture.facts.filter(({ visibility }) => visibility === 'public')) {
      expect(request.user).toContain(fact.id)
      expect(request.user).toContain(fact.text)
    }
    expect(request.user).toContain(fixture.focusProp)
    for (const cue of fixture.exitCue) expect(request.user).toContain(cue)
    expect(request.user).toContain('3–5')
    expect(request.user).toContain('500–900')
    expect(request.user).toContain('Pinax marker')
    expect(request.user).toContain('1800')
  }

  it('exports the fixed architecture ids in bakeoff order', () => {
    expect(CROSS_SECTION_ARCHITECTURES).toEqual([
      'single-writer',
      'role-agents-narrator',
      'intent-planners-writer'
    ])
  })

  it('builds one shared final prose contract and appends the exact narrative format instructions', () => {
    const contract = buildFinalProseContract(fixture)

    for (const text of [
      '一篇完整中文小说段落',
      '500–900',
      '3–5',
      fixture.focusProp,
      '不打印 beat 标签',
      '只在 exitCue',
      '不提供选项',
      '不自动继续',
      'forbidden fact',
      '中文双引号',
      '保留作者控制',
      '不决定未提供的玩家动作'
    ]) expect(contract).toContain(text)
    expect(contract.endsWith(buildNarrativeFormatInstructions())).toBe(true)
  })

  it('runs single-writer once with complete labelled fixture knowledge', async () => {
    const provider = makeProvider(() => result(finalRawText, 12, 8))
    const run = await runSingleWriter(fixture, provider, {
      runId: 'single-run',
      now: (() => { const values = [100, 145]; return () => values.shift() })()
    })

    expect(provider.requests).toHaveLength(1)
    const [request] = provider.requests
    expect(request.callId).toBe('single-run:final')
    expect(request.system).toBe(buildFinalProseContract(fixture))
    assertCommonFinalRequest(request)
    for (const fact of fixture.facts) {
      expect(request.user).toContain(fact.id)
      expect(request.user).toContain(fact.text)
      expect(request.user).toContain(`visibility=${fact.visibility}`)
      if (fact.ownerCharacterId) expect(request.user).toContain(`owner=${fact.ownerCharacterId}`)
    }
    for (const character of fixture.characters) {
      expect(request.user).toContain(character.id)
      expect(request.user).toContain(`known=${character.knownFactIds.join(',')}`)
      expect(request.user).toContain(`forbidden=${character.forbiddenFactIds.join(',')}`)
    }
    expect(run).toMatchObject({
      runId: 'single-run',
      fixtureId: fixture.id,
      architecture: 'single-writer',
      status: 'success',
      usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
      latencyMs: 45,
      rawText: finalRawText,
      text: expect.any(String),
      readableText: expect.any(String),
      renderedText: expect.any(String),
      presentation: expect.any(Object)
    })
    expect(run.calls).toHaveLength(1)
    expect(run.calls[0]).toMatchObject({ stage: 'final', request, result: expect.objectContaining({ text: finalRawText }) })
    expect(run.readableText).toContain('检查官')
    expect(run.readableText).toContain('“把手从账册上移开。”')
    expect(run.readableText).not.toContain(':::')
  })

  it('records one failed single-writer provider call without repair or fabricated usage', async () => {
    const providerFailure = Object.assign(new Error('provider rejected final prose'), {
      code: 'CROSS_SECTION_PROVIDER_REJECTED'
    })
    const provider = makeProvider(async () => { throw providerFailure })

    const run = await runSingleWriter(fixture, provider, {
      runId: 'single-reject',
      now: (() => { const values = [20, 27]; return () => values.shift() })()
    })

    expect(provider.requests).toHaveLength(1)
    expect(run).toMatchObject({
      runId: 'single-reject',
      architecture: 'single-writer',
      status: 'failed',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      latencyMs: 7,
      error: {
        code: 'CROSS_SECTION_PROVIDER_REJECTED',
        message: 'provider rejected final prose'
      }
    })
    expect(run.calls).toHaveLength(1)
    expect(run.calls[0]).toMatchObject({
      stage: 'final',
      status: 'failed',
      request: provider.requests[0],
      error: {
        code: 'CROSS_SECTION_PROVIDER_REJECTED',
        message: 'provider rejected final prose'
      }
    })
    expect(run.calls[0]).not.toHaveProperty('result')
    expect(run.calls[0]).not.toHaveProperty('usage')
  })

  it('runs role agents in parallel with isolated knowledge, then gives the narrator proposals and full restrictions', async () => {
    let active = 0
    let peakActive = 0
    let releaseRoles
    const rolesStarted = new Promise(resolve => { releaseRoles = resolve })
    const started = new Set()
    const provider = makeProvider(async request => {
      const roleMatch = request.callId.match(/^role-run:role:(.+)$/)
      if (!roleMatch) return result(finalRawText, 20, 10)
      active += 1
      peakActive = Math.max(peakActive, active)
      started.add(roleMatch[1])
      if (started.size === fixture.characters.length) releaseRoles()
      await rolesStarted
      active -= 1
      return result(proposalFor(roleMatch[1]), 3, 2)
    })

    const run = await runRoleAgentsNarrator(fixture, provider, { runId: 'role-run', now: () => 50 })

    expect(peakActive).toBe(fixture.characters.length)
    expect(provider.requests).toHaveLength(fixture.characters.length + 1)
    const roleRequests = provider.requests.filter(({ callId }) => callId.includes(':role:'))
    for (const character of fixture.characters) {
      const request = roleRequests.find(({ callId }) => callId.endsWith(`:${character.id}`))
      expect(request).toBeTruthy()
      for (const fact of fixture.facts.filter(fact => fact.visibility === 'public' || character.knownFactIds.includes(fact.id))) {
        expect(request.user).toContain(fact.id)
        expect(request.user).toContain(fact.text)
      }
      for (const fact of fixture.facts.filter(fact => character.forbiddenFactIds.includes(fact.id))) {
        expect(request.user).not.toContain(fact.id)
        expect(request.user).not.toContain(fact.text)
        for (const marker of fact.leakMarkers) expect(request.user).not.toContain(marker)
      }
      expect(request.user).toContain('{characterId,proposedAction,proposedDialogue,discloseFactIds}')
    }
    const finalRequest = provider.requests.find(({ callId }) => callId === 'role-run:final')
    expect(finalRequest.system).toBe(buildFinalProseContract(fixture))
    assertCommonFinalRequest(finalRequest)
    expect(finalRequest.user).toContain('proposals')
    for (const fact of fixture.facts) {
      expect(finalRequest.user).toContain(fact.id)
      expect(finalRequest.user).toContain(fact.text)
    }
    expect(run.status).toBe('success')
    expect(run.calls).toHaveLength(fixture.characters.length + 1)
    expect(run.usage).toEqual({ inputTokens: 26, outputTokens: 14, totalTokens: 40 })
    expect(run.readableText).not.toContain('中间秘密对白')
  })

  it('accepts one complete JSON code fence for role intermediates without a repair call', async () => {
    const fence = value => `${String.fromCharCode(96).repeat(3)}json\n${value}\n${String.fromCharCode(96).repeat(3)}`
    const provider = makeProvider(request => {
      if (request.callId.endsWith(':final')) return result(finalRawText)
      return result(fence(proposalFor(request.callId.split(':').at(-1))))
    })

    const run = await runRoleAgentsNarrator(fixture, provider, {
      runId: 'role-json-fence',
      now: () => 1
    })

    expect(run.status).toBe('success')
    expect(provider.requests).toHaveLength(fixture.characters.length + 1)
  })

  it.each([
    ['schema', characterId => JSON.stringify({ characterId, proposedAction: '动作缺少字段' })],
    ['explanatory wrapper', characterId => `以下是结果：\n${proposalFor(characterId)}`],
    ['characterId', characterId => JSON.stringify({ ...JSON.parse(proposalFor(characterId)), characterId: 'wrong' })],
    ['unknown disclose fact', characterId => JSON.stringify({ ...JSON.parse(proposalFor(characterId)), discloseFactIds: ['unknown-fact'] })],
    ['public disclose fact', characterId => JSON.stringify({ ...JSON.parse(proposalFor(characterId)), discloseFactIds: ['canal-gate'] })],
    ['another role private fact', characterId => JSON.stringify({ ...JSON.parse(proposalFor(characterId)), discloseFactIds: ['barge-sank'] })],
    ['duplicate disclose fact', characterId => JSON.stringify({ ...JSON.parse(proposalFor(characterId)), discloseFactIds: ['seal-forgery', 'seal-forgery'] })]
  ])('fails a role-agent attempt for invalid %s after one parse without repair', async (_label, invalidOutput) => {
    const provider = makeProvider(request => {
      const characterId = request.callId.split(':').at(-1)
      return result(characterId === fixture.characters[0].id
        ? invalidOutput(characterId)
        : proposalFor(characterId))
    })

    const run = await runRoleAgentsNarrator(fixture, provider, { runId: 'role-invalid', now: () => 1 })

    expect(provider.requests).toHaveLength(fixture.characters.length)
    expect(run.status).toBe('failed')
    expect(run.error).toEqual(expect.objectContaining({ code: 'CROSS_SECTION_INTERMEDIATE_INVALID', message: expect.any(String) }))
    expect(run.calls).toHaveLength(fixture.characters.length)
  })

  it('retains every issued role call in fixture order when one provider call rejects and skips synthesis', async () => {
    const rejectedCharacter = fixture.characters[0]
    const providerFailure = Object.assign(new Error('isolated role provider rejected'), {
      code: 'CROSS_SECTION_ROLE_PROVIDER_REJECTED'
    })
    const provider = makeProvider(async request => {
      const characterId = request.callId.split(':').at(-1)
      if (characterId === rejectedCharacter.id) throw providerFailure
      await Promise.resolve()
      return result(proposalFor(characterId), 4, 2)
    })

    const run = await runRoleAgentsNarrator(fixture, provider, {
      runId: 'role-reject',
      now: () => 30
    })

    expect(provider.requests).toHaveLength(fixture.characters.length)
    expect(provider.requests.some(({ callId }) => callId.endsWith(':final'))).toBe(false)
    expect(run.status).toBe('failed')
    expect(run.error).toEqual({
      code: 'CROSS_SECTION_ROLE_PROVIDER_REJECTED',
      message: 'isolated role provider rejected'
    })
    expect(run.calls).toHaveLength(fixture.characters.length)
    expect(run.calls.map(({ characterId }) => characterId)).toEqual(fixture.characters.map(({ id }) => id))
    expect(run.calls.map(({ status }) => status)).toEqual(['failed', 'success'])
    expect(run.calls[0]).toMatchObject({
      stage: 'role-proposal',
      characterId: rejectedCharacter.id,
      status: 'failed',
      error: {
        code: 'CROSS_SECTION_ROLE_PROVIDER_REJECTED',
        message: 'isolated role provider rejected'
      }
    })
    expect(run.calls[0]).not.toHaveProperty('result')
    expect(run.calls[1]).toMatchObject({
      stage: 'role-proposal',
      characterId: fixture.characters[1].id,
      status: 'success',
      result: expect.objectContaining({ usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 } })
    })
    expect(run.usage).toEqual({ inputTokens: 4, outputTokens: 2, totalTokens: 6 })
  })

  it('runs intent planners in parallel without prose polishing, then gives the writer plans and labelled contracts', async () => {
    let active = 0
    let peakActive = 0
    let releasePlanners
    const plannersStarted = new Promise(resolve => { releasePlanners = resolve })
    const started = new Set()
    const provider = makeProvider(async request => {
      const plannerMatch = request.callId.match(/^planner-run:planner:(.+)$/)
      if (!plannerMatch) return result(finalRawText, 30, 15)
      active += 1
      peakActive = Math.max(peakActive, active)
      started.add(plannerMatch[1])
      if (started.size === fixture.characters.length) releasePlanners()
      await plannersStarted
      active -= 1
      return result(planFor(fixture.characters.find(({ id }) => id === plannerMatch[1])), 4, 1)
    })

    const run = await runIntentPlannersWriter(fixture, provider, { runId: 'planner-run', now: () => 80 })

    expect(peakActive).toBe(fixture.characters.length)
    expect(provider.requests).toHaveLength(fixture.characters.length + 1)
    const plannerRequests = provider.requests.filter(({ callId }) => callId.includes(':planner:'))
    for (const character of fixture.characters) {
      const request = plannerRequests.find(({ callId }) => callId.endsWith(`:${character.id}`))
      expect(request.user).toContain('禁止润色对白和叙述')
      expect(request.user).toContain('{characterId,intent,nextAction,pressureOnFocusProp,discloseFactIds,withholdFactIds}')
      for (const fact of fixture.facts.filter(fact => fact.visibility === 'public' || character.knownFactIds.includes(fact.id))) {
        expect(request.user).toContain(fact.id)
        expect(request.user).toContain(fact.text)
      }
      for (const fact of fixture.facts.filter(fact => character.forbiddenFactIds.includes(fact.id))) {
        expect(request.user).not.toContain(fact.id)
        expect(request.user).not.toContain(fact.text)
        for (const marker of fact.leakMarkers) expect(request.user).not.toContain(marker)
      }
    }
    const finalRequest = provider.requests.find(({ callId }) => callId === 'planner-run:final')
    expect(finalRequest.system).toBe(buildFinalProseContract(fixture))
    assertCommonFinalRequest(finalRequest)
    expect(finalRequest.user).toContain('plans')
    expect(finalRequest.user).toContain('role contracts')
    for (const fact of fixture.facts) {
      expect(finalRequest.user).toContain(fact.id)
      expect(finalRequest.user).toContain(`visibility=${fact.visibility}`)
    }
    expect(run.status).toBe('success')
    expect(run.calls).toHaveLength(fixture.characters.length + 1)
    expect(run.usage).toEqual({ inputTokens: 38, outputTokens: 17, totalTokens: 55 })
  })

  it.each([
    ['schema', character => JSON.stringify({ characterId: character.id, intent: '缺少字段' })],
    ['characterId', character => JSON.stringify({ ...JSON.parse(planFor(character)), characterId: 'wrong' })],
    ['unknown disclose fact', character => JSON.stringify({ ...JSON.parse(planFor(character)), discloseFactIds: ['unknown-fact'] })],
    ['public disclose fact', character => JSON.stringify({ ...JSON.parse(planFor(character)), discloseFactIds: ['canal-gate'] })],
    ['another role private fact', character => JSON.stringify({ ...JSON.parse(planFor(character)), discloseFactIds: ['barge-sank'] })],
    ['duplicate disclose fact', character => JSON.stringify({ ...JSON.parse(planFor(character)), discloseFactIds: ['seal-forgery', 'seal-forgery'] })],
    ['duplicate withhold fact', character => JSON.stringify({ ...JSON.parse(planFor(character)), withholdFactIds: ['seal-forgery', 'seal-forgery'] })],
    ['disclose/withhold overlap', character => JSON.stringify({
      ...JSON.parse(planFor(character)),
      discloseFactIds: ['seal-forgery'],
      withholdFactIds: ['seal-forgery']
    })]
  ])('rejects invalid planner %s without repair or writer calls', async (_label, invalidOutput) => {
    const provider = makeProvider(request => {
      const characterId = request.callId.split(':').at(-1)
      const character = fixture.characters.find(({ id }) => id === characterId)
      return result(characterId === fixture.characters[0].id
        ? invalidOutput(character)
        : planFor(character))
    })

    const run = await runIntentPlannersWriter(fixture, provider, { runId: 'planner-invalid', now: () => 1 })

    expect(provider.requests).toHaveLength(fixture.characters.length)
    expect(run.status).toBe('failed')
    expect(run.error.code).toBe('CROSS_SECTION_INTERMEDIATE_INVALID')
    expect(run.calls).toHaveLength(fixture.characters.length)
  })

  it.each([
    ['single-writer', (invalidFixture, provider, options) => runSingleWriter(invalidFixture, provider, options)],
    ['role-agents-narrator', (invalidFixture, provider, options) => runRoleAgentsNarrator(invalidFixture, provider, options)],
    ['intent-planners-writer', (invalidFixture, provider, options) => runIntentPlannersWriter(invalidFixture, provider, options)],
    ['dispatcher', (invalidFixture, provider, options) => runCrossSectionArchitecture('single-writer', invalidFixture, provider, options)]
  ])('rejects metadata-leaking fixtures before any provider call in %s', async (_label, runner) => {
    const invalidFixture = structuredClone(fixture)
    invalidFixture.characters[0].desire += invalidFixture.facts.find(({ id }) => id === 'barge-sank').leakMarkers[0]
    const provider = makeProvider(() => result(finalRawText))

    const run = await runner(invalidFixture, provider, { runId: `invalid-fixture-${_label}`, now: () => 1 })

    expect(provider.requests).toHaveLength(0)
    expect(run).toMatchObject({
      status: 'failed',
      calls: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      error: {
        code: 'CROSS_SECTION_PRIVATE_FACT_METADATA_LEAK',
        message: expect.any(String),
        fixtureId: fixture.id,
        characterId: 'inspector',
        factId: 'barge-sank'
      }
    })
  })

  it('rejects a cross-owner private-fact metadata leak before the dispatcher calls a provider', async () => {
    const invalidFixture = structuredClone(fixture)
    const contaminatedFact = invalidFixture.facts.find(({ id }) => id === 'seal-forgery')
    const leakedFact = invalidFixture.facts.find(({ id }) => id === 'barge-sank')
    contaminatedFact.text += leakedFact.leakMarkers[0]
    const provider = makeProvider(() => result(finalRawText))

    const run = await runCrossSectionArchitecture('single-writer', invalidFixture, provider, {
      runId: 'private-fact-leak-run',
      now: () => 1
    })

    expect(provider.requests).toHaveLength(0)
    expect(run).toMatchObject({
      status: 'failed',
      calls: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      error: {
        code: 'CROSS_SECTION_PRIVATE_FACT_METADATA_LEAK',
        message: expect.any(String),
        fixtureId: fixture.id,
        factId: 'seal-forgery'
      }
    })
  })

  it('rejects an invalid slug fixture before a direct runner calls a provider', async () => {
    const invalidFixture = structuredClone(fixture)
    invalidFixture.id = 'Canal_Ledger'
    const provider = makeProvider(() => result(finalRawText))

    const run = await runSingleWriter(invalidFixture, provider, {
      runId: 'invalid-slug-run',
      now: () => 1
    })

    expect(provider.requests).toHaveLength(0)
    expect(run).toMatchObject({
      status: 'failed',
      calls: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      error: {
        code: 'CROSS_SECTION_INVALID_ID',
        message: expect.any(String),
        fixtureId: 'Canal_Ledger'
      }
    })
  })

  it.each([
    ['single-writer null', null, (value, provider, options) => runSingleWriter(value, provider, options)],
    ['role-agents null', null, (value, provider, options) => runRoleAgentsNarrator(value, provider, options)],
    ['intent-planners null', null, (value, provider, options) => runIntentPlannersWriter(value, provider, options)],
    ['dispatcher null', null, (value, provider, options) => runCrossSectionArchitecture('single-writer', value, provider, options)],
    ['single-writer nonobject', 'invalid-fixture', (value, provider, options) => runSingleWriter(value, provider, options)],
    ['role-agents nonobject', 'invalid-fixture', (value, provider, options) => runRoleAgentsNarrator(value, provider, options)],
    ['intent-planners nonobject', 'invalid-fixture', (value, provider, options) => runIntentPlannersWriter(value, provider, options)],
    ['dispatcher nonobject', 'invalid-fixture', (value, provider, options) => runCrossSectionArchitecture('single-writer', value, provider, options)]
  ])('normalizes invalid fixture input for %s without provider calls or TypeError rejection', async (_label, invalidFixture, runner) => {
    const provider = makeProvider(() => result(finalRawText))

    const run = await runner(invalidFixture, provider, { runId: `invalid-input-${_label}`, now: () => 1 })

    expect(provider.requests).toHaveLength(0)
    expect(run).toMatchObject({
      runId: `invalid-input-${_label}`,
      fixtureId: '',
      status: 'failed',
      calls: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      error: {
        code: 'CROSS_SECTION_INVALID_FIXTURE',
        message: expect.any(String)
      }
    })
  })

  it('normalizes only readable parsed blocks with the fixture speaker registry', () => {
    const normalized = normalizeCrossSectionFinalProse(finalRawText, fixture, 'normalize-run')

    expect(normalized.rawText).toBe(finalRawText)
    expect(normalized.presentation.blocks.some(block => block.kind === 'dialogue' && block.speakerId === 'inspector')).toBe(true)
    expect(normalized.readableText).toContain('检查官：“把手从账册上移开。”')
    expect(normalized.readableText).toContain('他用指节敲了敲桌面。')
    expect(normalized.readableText).not.toContain('检查官：他用指节敲了敲桌面')
    expect(normalized.readableText).toContain('信使松开账册，退到关卡雨幕里。')
    expect(normalized.readableText).not.toContain('信使：信使松开账册')
    expect(normalized.readableText).not.toContain(':::')
    expect(normalized.text).toBe(normalized.readableText)
    expect(normalized.renderedText).toBe(normalized.readableText)
  })

  it('returns a typed failed attempt when parsed output has no readable blocks', async () => {
    const provider = makeProvider(() => result(':::system\n仅供系统读取', 6, 2))
    const run = await runCrossSectionArchitecture('single-writer', fixture, provider, {
      runId: 'empty-presentation',
      now: (() => { const values = [10, 18]; return () => values.shift() })()
    })

    expect(run).toMatchObject({
      runId: 'empty-presentation',
      fixtureId: fixture.id,
      architecture: 'single-writer',
      status: 'failed',
      calls: [expect.objectContaining({ stage: 'final' })],
      usage: { inputTokens: 6, outputTokens: 2, totalTokens: 8 },
      latencyMs: 8,
      rawText: ':::system\n仅供系统读取',
      error: {
        code: 'CROSS_SECTION_PRESENTATION_EMPTY',
        message: expect.any(String)
      }
    })
  })

  it('dispatches all fixed ids and returns a typed failure for an unknown architecture', async () => {
    for (const architecture of CROSS_SECTION_ARCHITECTURES) {
      const provider = makeProvider(request => {
        const characterId = request.callId.split(':').at(-1)
        if (request.callId.includes(':role:')) return result(proposalFor(characterId))
        if (request.callId.includes(':planner:')) return result(planFor(fixture.characters.find(({ id }) => id === characterId)))
        return result(finalRawText)
      })
      const run = await runCrossSectionArchitecture(architecture, fixture, provider, {
        runId: `dispatch-${architecture}`,
        now: () => 1
      })
      expect(run.architecture).toBe(architecture)
      expect(run.status).toBe('success')
    }

    const unknown = await runCrossSectionArchitecture('unknown', fixture, makeProvider(() => result(finalRawText)), {
      runId: 'dispatch-unknown',
      now: () => 1
    })
    expect(unknown).toMatchObject({
      status: 'failed',
      architecture: 'unknown',
      error: { code: 'CROSS_SECTION_UNKNOWN_ARCHITECTURE', message: expect.any(String) }
    })
  })
})

describe('novel cross-section fixtures', () => {
  it('exports one frozen ordered array of four fixtures', () => {
    expect(CROSS_SECTION_FIXTURE_SCHEMA_VERSION).toBe(1)
    expect(Array.isArray(CROSS_SECTION_FIXTURES)).toBe(true)
    expect(Object.isFrozen(CROSS_SECTION_FIXTURES)).toBe(true)
    expect(CROSS_SECTION_FIXTURES).toHaveLength(4)
    expect(CROSS_SECTION_FIXTURES.map(({ id }) => id)).toEqual(FIXTURE_IDS)
    expect(validateCrossSectionFixtures(CROSS_SECTION_FIXTURES)).toEqual({ valid: true })
  })

  it('recursively freezes every fixture value and cannot be polluted', () => {
    expectDeepFrozen(CROSS_SECTION_FIXTURES)

    const originalTitle = CROSS_SECTION_FIXTURES[0].title
    const originalKnownFactIds = [...CROSS_SECTION_FIXTURES[0].characters[0].knownFactIds]
    expect(() => { CROSS_SECTION_FIXTURES[0].title = '污染标题' }).toThrow(TypeError)
    expect(() => { CROSS_SECTION_FIXTURES[0].characters[0].knownFactIds.push('污染事实') }).toThrow(TypeError)
    expect(CROSS_SECTION_FIXTURES[0].title).toBe(originalTitle)
    expect(CROSS_SECTION_FIXTURES[0].characters[0].knownFactIds).toEqual(originalKnownFactIds)
    expect(validateCrossSectionFixtures(CROSS_SECTION_FIXTURES)).toEqual({ valid: true })
  })

  it('uses the unified fact, character knowledge, ownership, and speaker-map contract', () => {
    for (const fixture of CROSS_SECTION_FIXTURES) {
      expect(fixture).toEqual(expect.objectContaining({
        id: expect.any(String),
        title: expect.any(String),
        facts: expect.any(Array),
        characters: expect.any(Array),
        expectedOutcome: expect.any(String),
        antiOutcome: expect.any(String),
        focusProp: expect.any(String),
        exitCue: expect.any(Array),
        internalBeatRange: { min: 3, max: 5 },
        speakerMap: expect.any(Object)
      }))
      expect(fixture).not.toHaveProperty('publicSettingFacts')
      expect(fixture).not.toHaveProperty('privateFacts')
      expect(fixture).not.toHaveProperty('factOwnership')
      expect(fixture.characters.length).toBeGreaterThanOrEqual(2)
      expect(fixture.characters.length).toBeLessThanOrEqual(3)
      expect(fixture.facts.some(({ visibility }) => visibility === 'public')).toBe(true)

      const factIds = fixture.facts.map(({ id }) => id)
      const characterIds = fixture.characters.map(({ id }) => id)
      expect(new Set(factIds).size).toBe(factIds.length)
      expect(new Set(characterIds).size).toBe(characterIds.length)

      for (const fact of fixture.facts) {
        expect(fact).toEqual(expect.objectContaining({
          id: expect.any(String),
          text: expect.any(String),
          visibility: expect.stringMatching(/^(public|private)$/)
        }))
        if (fact.visibility === 'public') {
          expect(fact.ownerCharacterId).toBeUndefined()
          expect(fact.leakMarkers).toBeUndefined()
        } else {
          expect(characterIds).toContain(fact.ownerCharacterId)
          expect(fact.leakMarkers.length).toBeGreaterThan(0)
          for (const marker of fact.leakMarkers) {
            expect(marker).toBeTruthy()
            expect(fact.text).toContain(marker)
          }
        }
      }

      for (const character of fixture.characters) {
        expect(character).toEqual(expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          desire: expect.any(String),
          contradiction: expect.any(String),
          voiceProfile: expect.any(String),
          temperament: expect.any(String),
          knownFactIds: expect.any(Array),
          forbiddenFactIds: expect.any(Array)
        }))
        expect(character).not.toHaveProperty('known')
        expect(character).not.toHaveProperty('forbidden')
        for (const factId of [...character.knownFactIds, ...character.forbiddenFactIds]) {
          expect(factIds.filter(id => id === factId)).toHaveLength(1)
        }
      }

      for (const fact of fixture.facts.filter(({ visibility }) => visibility === 'private')) {
        for (const character of fixture.characters) {
          if (character.id === fact.ownerCharacterId) {
            expect(character.knownFactIds).toContain(fact.id)
            expect(character.forbiddenFactIds).not.toContain(fact.id)
          } else {
            expect(character.forbiddenFactIds).toContain(fact.id)
            expect(character.knownFactIds).not.toContain(fact.id)
          }
        }
      }

      expect(fixture.speakerMap).toEqual(Object.fromEntries(
        fixture.characters.map(({ id, name }) => [name, id])
      ))
    }
  })

  it('keeps all authored fixture text Chinese and captures the exact scenario semantics', () => {
    const chineseFields = ['title', 'expectedOutcome', 'antiOutcome', 'focusProp']
    for (const fixture of CROSS_SECTION_FIXTURES) {
      for (const field of chineseFields) expect(fixture[field]).toMatch(/[\u3400-\u9fff]/u)
      for (const cue of fixture.exitCue) expect(cue).toMatch(/[\u3400-\u9fff]/u)
      for (const fact of fixture.facts) expect(fact.text).toMatch(/[\u3400-\u9fff]/u)
      for (const character of fixture.characters) {
        for (const field of ['name', 'desire', 'contradiction', 'voiceProfile', 'temperament']) {
          expect(character[field]).toMatch(/[\u3400-\u9fff]/u)
        }
      }
    }

    const birthday = fixtureById(CROSS_SECTION_FIXTURES, 'birthday-recorder')
    const deletedMinute = birthday.facts.find(({ id }) => id === 'deleted-minute')
    expect(deletedMinute.ownerCharacterId).toBe('uncle')
    expect(deletedMinute.text).toContain('父亲删掉了录音中的一分钟')
    expect(birthday.exitCue).toEqual(['播放', '装进口袋', '砸毁'])

    const orbital = fixtureById(CROSS_SECTION_FIXTURES, 'orbital-airlock-key')
    expect(orbital.facts.find(({ id }) => id === 'station-alert').text).toContain('压力警报')
    expect(orbital.exitCue.some(cue => /钥匙.*(?:工程师|医官|舰长).*手中/.test(cue))).toBe(true)
    expect(orbital.exitCue.some(cue => /舱门.*(?:稳定|锁定|关闭|开启)/.test(cue))).toBe(true)
    expect(orbital.expectedOutcome).toMatch(/钥匙.*(?:工程师|医官|舰长).*手中/)
    expect(orbital.expectedOutcome).toMatch(/舱门.*(?:稳定|锁定|关闭|开启)/)

    const temple = fixtureById(CROSS_SECTION_FIXTURES, 'temple-debt-token')
    expect(temple.focusProp).toBe('雕刻债符')
    expect(temple.facts.find(({ id }) => id === 'debt-token-present').text).toContain('雕刻债符')
  })

  it.each([
    ['null fixtures', null],
    ['object fixtures', {}],
    ['string fixtures', 'fixtures']
  ])('returns INVALID_FIXTURES without throwing for %s', (_label, fixtures) => {
    expectInvalid(fixtures, { code: 'CROSS_SECTION_INVALID_FIXTURES' })
  })

  it('returns a typed result for a non-object fixture', () => {
    const fixtures = cloneFixtures()
    fixtures[0] = null
    expectInvalid(fixtures, { code: 'CROSS_SECTION_INVALID_FIXTURE' })
  })

  it('does not disguise an unexpected getter exception as invalid fixture data', () => {
    const fixtures = cloneFixtures()
    const programmerError = new Error('fixture getter failed')
    Object.defineProperty(fixtures[0], 'title', {
      enumerable: true,
      get: () => { throw programmerError }
    })

    expect(() => validateCrossSectionFixtures(fixtures)).toThrow(programmerError)
  })

  it.each([
    ['title contains private id', (target, fact) => { target.title += fact.id }],
    ['expected outcome contains private text', (target, fact) => { target.expectedOutcome += fact.text }],
    ['anti outcome contains leak marker', (target, fact) => { target.antiOutcome += fact.leakMarkers[0] }],
    ['focus prop contains leak marker', (target, fact) => { target.focusProp += fact.leakMarkers[0] }],
    ['exit cue contains leak marker', (target, fact) => { target.exitCue[0] += fact.leakMarkers[0] }],
    ['public fact contains leak marker', (target, fact) => { target.facts.find(({ visibility }) => visibility === 'public').text += fact.leakMarkers[0] }]
  ])('rejects shared metadata leak when %s', (_label, mutate) => {
    const fixtures = cloneFixtures()
    const target = fixtureById(fixtures, 'canal-ledger')
    const fact = target.facts.find(({ id }) => id === 'seal-forgery')
    mutate(target, fact)

    expectInvalid(fixtures, {
      code: 'CROSS_SECTION_PRIVATE_FACT_METADATA_LEAK',
      fixtureId: 'canal-ledger',
      factId: 'seal-forgery'
    })
  })

  it.each([
    ['name contains forbidden id', (character, fact) => { character.name += fact.id }],
    ['desire contains forbidden text', (character, fact) => { character.desire += fact.text }],
    ['contradiction contains forbidden marker', (character, fact) => { character.contradiction += fact.leakMarkers[0] }],
    ['voice contains forbidden marker', (character, fact) => { character.voiceProfile += fact.leakMarkers[0] }],
    ['temperament contains forbidden marker', (character, fact) => { character.temperament += fact.leakMarkers[0] }]
  ])('rejects character prompt metadata leak when %s', (_label, mutate) => {
    const fixtures = cloneFixtures()
    const target = fixtureById(fixtures, 'canal-ledger')
    const character = target.characters.find(({ id }) => id === 'inspector')
    const forbiddenFact = target.facts.find(({ id }) => id === 'barge-sank')
    mutate(character, forbiddenFact)

    expectInvalid(fixtures, {
      code: 'CROSS_SECTION_PRIVATE_FACT_METADATA_LEAK',
      fixtureId: 'canal-ledger',
      characterId: 'inspector',
      factId: 'barge-sank'
    })
  })

  it('allows an owner known private marker in that owner character metadata', () => {
    const fixtures = cloneFixtures()
    const target = fixtureById(fixtures, 'canal-ledger')
    const owner = target.characters.find(({ id }) => id === 'inspector')
    const ownedFact = target.facts.find(({ id }) => id === 'seal-forgery')
    owner.desire += ownedFact.leakMarkers[0]

    expect(validateCrossSectionFixtures(fixtures)).toEqual({ valid: true })
  })

  it('rejects one private fact text containing another owner private fact marker', () => {
    const fixtures = cloneFixtures()
    const target = fixtureById(fixtures, 'canal-ledger')
    const contaminatedFact = target.facts.find(({ id }) => id === 'seal-forgery')
    const leakedFact = target.facts.find(({ id }) => id === 'barge-sank')
    contaminatedFact.text += leakedFact.leakMarkers[0]

    expectInvalid(fixtures, {
      code: 'CROSS_SECTION_PRIVATE_FACT_METADATA_LEAK',
      fixtureId: 'canal-ledger',
      factId: 'seal-forgery'
    })
  })

  it.each([
    [
      'fixture id',
      target => { target.id = 'Canal_Ledger' },
      { code: 'CROSS_SECTION_INVALID_ID', fixtureId: 'Canal_Ledger' }
    ],
    [
      'fact id',
      target => { target.facts.find(({ id }) => id === 'canal-gate').id = 'canal_gate' },
      { code: 'CROSS_SECTION_INVALID_ID', fixtureId: 'canal-ledger', factId: 'canal_gate' }
    ],
    [
      'character id',
      target => {
        target.characters.find(({ id }) => id === 'inspector').id = 'Inspector'
        target.facts.find(({ id }) => id === 'seal-forgery').ownerCharacterId = 'Inspector'
        target.speakerMap.检查官 = 'Inspector'
      },
      { code: 'CROSS_SECTION_INVALID_ID', fixtureId: 'canal-ledger', characterId: 'Inspector' }
    ]
  ])('requires a stable ASCII slug for every %s', (_label, mutate, error) => {
    const fixtures = cloneFixtures()
    mutate(fixtureById(fixtures, 'canal-ledger'))
    expectInvalid(fixtures, error)
  })

  it.each([
    ['fixture id', target => { target.id += '-barge-sank' }],
    ['public fact id', target => { target.facts.find(({ id }) => id === 'canal-gate').id += '-barge-sank' }]
  ])('rejects private fact labels embedded in shared visible %s', (_label, mutate) => {
    const fixtures = cloneFixtures()
    const target = fixtureById(fixtures, 'canal-ledger')
    mutate(target)

    expectInvalid(fixtures, {
      code: 'CROSS_SECTION_PRIVATE_FACT_METADATA_LEAK',
      fixtureId: target.id,
      factId: 'barge-sank'
    })
  })

  it('rejects another owner private fact id embedded in a private fact id', () => {
    const fixtures = cloneFixtures()
    const target = fixtureById(fixtures, 'canal-ledger')
    const contaminatedFact = target.facts.find(({ id }) => id === 'seal-forgery')
    const oldFactId = contaminatedFact.id
    contaminatedFact.id = `${oldFactId}-barge-sank`
    for (const character of target.characters) {
      character.knownFactIds = character.knownFactIds.map(id => id === oldFactId ? contaminatedFact.id : id)
      character.forbiddenFactIds = character.forbiddenFactIds.map(id => id === oldFactId ? contaminatedFact.id : id)
    }

    expectInvalid(fixtures, {
      code: 'CROSS_SECTION_PRIVATE_FACT_METADATA_LEAK',
      fixtureId: 'canal-ledger',
      factId: 'seal-forgery-barge-sank'
    })
  })

  it('rejects a forbidden private fact id embedded in a character id', () => {
    const fixtures = cloneFixtures()
    const target = fixtureById(fixtures, 'canal-ledger')
    const character = target.characters.find(({ id }) => id === 'inspector')
    const oldCharacterId = character.id
    character.id = `${oldCharacterId}-barge-sank`
    target.facts.find(({ id }) => id === 'seal-forgery').ownerCharacterId = character.id
    target.speakerMap.检查官 = character.id

    expectInvalid(fixtures, {
      code: 'CROSS_SECTION_PRIVATE_FACT_METADATA_LEAK',
      fixtureId: 'canal-ledger',
      characterId: 'inspector-barge-sank',
      factId: 'barge-sank'
    })
  })

  it.each([
    ['fixture', fixtures => fixtures.push({ ...fixtures[0] }), { code: 'CROSS_SECTION_DUPLICATE_FIXTURE_ID', fixtureId: 'canal-ledger' }],
    ['character', fixtures => fixtureById(fixtures, 'canal-ledger').characters.push({ ...fixtureById(fixtures, 'canal-ledger').characters[0] }), { code: 'CROSS_SECTION_DUPLICATE_CHARACTER_ID', fixtureId: 'canal-ledger', characterId: 'inspector' }],
    ['fact', fixtures => fixtureById(fixtures, 'canal-ledger').facts.push({ ...fixtureById(fixtures, 'canal-ledger').facts[0] }), { code: 'CROSS_SECTION_DUPLICATE_FACT_ID', fixtureId: 'canal-ledger', factId: 'canal-gate' }]
  ])('returns a typed duplicate-id result for a %s id', (_label, mutate, error) => {
    const fixtures = cloneFixtures()
    mutate(fixtures)
    expectInvalid(fixtures, error)
  })

  it.each([
    ['fixture title', fixtures => { fixtureById(fixtures, 'canal-ledger').title = '' }, { code: 'CROSS_SECTION_MISSING_FIELD', fixtureId: 'canal-ledger' }],
    ['facts', fixtures => { delete fixtureById(fixtures, 'canal-ledger').facts }, { code: 'CROSS_SECTION_MISSING_FIELD', fixtureId: 'canal-ledger' }],
    ['character voice', fixtures => { fixtureById(fixtures, 'canal-ledger').characters[0].voiceProfile = '' }, { code: 'CROSS_SECTION_MISSING_FIELD', fixtureId: 'canal-ledger', characterId: 'inspector' }],
    ['knowledge arrays', fixtures => { delete fixtureById(fixtures, 'canal-ledger').characters[0].knownFactIds }, { code: 'CROSS_SECTION_MISSING_FIELD', fixtureId: 'canal-ledger', characterId: 'inspector' }],
    ['fact text', fixtures => { fixtureById(fixtures, 'canal-ledger').facts[0].text = '' }, { code: 'CROSS_SECTION_MISSING_FIELD', fixtureId: 'canal-ledger', factId: 'canal-gate' }],
    ['private owner', fixtures => { delete fixtureById(fixtures, 'canal-ledger').facts.find(({ visibility }) => visibility === 'private').ownerCharacterId }, { code: 'CROSS_SECTION_MISSING_FIELD', fixtureId: 'canal-ledger', factId: 'seal-forgery' }],
    ['exit cue', fixtures => { fixtureById(fixtures, 'canal-ledger').exitCue = [] }, { code: 'CROSS_SECTION_MISSING_FIELD', fixtureId: 'canal-ledger' }]
  ])('returns MISSING_FIELD for missing required %s', (_label, mutate, error) => {
    const fixtures = cloneFixtures()
    mutate(fixtures)
    expectInvalid(fixtures, error)
  })

  it.each([
    ['one character', fixtures => { fixtureById(fixtures, 'canal-ledger').characters = fixtureById(fixtures, 'canal-ledger').characters.slice(0, 1) }],
    ['four characters', fixtures => { fixtureById(fixtures, 'birthday-recorder').characters.push({ ...fixtureById(fixtures, 'birthday-recorder').characters[0], id: 'guest', name: '宾客' }) }]
  ])('returns CHARACTER_COUNT for %s', (_label, mutate) => {
    const fixtures = cloneFixtures()
    mutate(fixtures)
    expectInvalid(fixtures, { code: 'CROSS_SECTION_CHARACTER_COUNT', fixtureId: _label === 'one character' ? 'canal-ledger' : 'birthday-recorder' })
  })

  it.each([
    ['minimum below three', { min: 2, max: 5 }],
    ['maximum above five', { min: 3, max: 6 }],
    ['reversed endpoints', { min: 5, max: 3 }],
    ['array lookalike', [3, 5]]
  ])('requires the exact 3-5 beat range for %s', (_label, internalBeatRange) => {
    const fixtures = cloneFixtures()
    fixtureById(fixtures, 'canal-ledger').internalBeatRange = internalBeatRange
    expectInvalid(fixtures, { code: 'CROSS_SECTION_INVALID_BEAT_RANGE', fixtureId: 'canal-ledger' })
  })

  it('returns UNKNOWN_FACT with character and fact context', () => {
    const fixtures = cloneFixtures()
    fixtureById(fixtures, 'canal-ledger').characters[0].knownFactIds = ['missing-fact']
    expectInvalid(fixtures, {
      code: 'CROSS_SECTION_UNKNOWN_FACT',
      fixtureId: 'canal-ledger',
      characterId: 'inspector',
      factId: 'missing-fact'
    })
  })

  it.each([
    ['empty marker list', fact => { fact.leakMarkers = [] }],
    ['non-literal marker', fact => { fact.leakMarkers = ['正文里不存在'] }]
  ])('requires a private fact literal marker for %s', (_label, mutate) => {
    const fixtures = cloneFixtures()
    mutate(fixtureById(fixtures, 'canal-ledger').facts.find(({ id }) => id === 'seal-forgery'))
    expectInvalid(fixtures, {
      code: 'CROSS_SECTION_PRIVATE_FACT_LITERAL_MARKER_REQUIRED',
      fixtureId: 'canal-ledger',
      factId: 'seal-forgery'
    })
  })

  it.each([
    ['knownFactIds', character => { character.knownFactIds.push('seal-forgery') }, 'CROSS_SECTION_DUPLICATE_KNOWN_FACT_ID'],
    ['forbiddenFactIds', character => { character.forbiddenFactIds.push('seal-forgery') }, 'CROSS_SECTION_DUPLICATE_FORBIDDEN_FACT_ID']
  ])('rejects a duplicate fact id within %s', (_label, mutate, code) => {
    const fixtures = cloneFixtures()
    const character = fixtureById(fixtures, 'canal-ledger').characters.find(({ id }) => id === (_label === 'knownFactIds' ? 'inspector' : 'messenger'))
    mutate(character)
    expectInvalid(fixtures, {
      code,
      fixtureId: 'canal-ledger',
      characterId: character.id,
      factId: 'seal-forgery'
    })
  })

  it('rejects one public fact in both known and forbidden arrays', () => {
    const fixtures = cloneFixtures()
    fixtureById(fixtures, 'canal-ledger').characters[0].knownFactIds.push('canal-gate')
    fixtureById(fixtures, 'canal-ledger').characters[0].forbiddenFactIds.push('canal-gate')
    expectInvalid(fixtures, {
      code: 'CROSS_SECTION_KNOWLEDGE_CONFLICT',
      fixtureId: 'canal-ledger',
      characterId: 'inspector',
      factId: 'canal-gate'
    })
  })

  it.each([
    [
      'owner does not know its private fact',
      fixtures => { fixtureById(fixtures, 'canal-ledger').characters.find(({ id }) => id === 'inspector').knownFactIds = [] },
      { code: 'CROSS_SECTION_PRIVATE_FACT_OWNER_MUST_KNOW', fixtureId: 'canal-ledger', characterId: 'inspector', factId: 'seal-forgery' }
    ],
    [
      'owner forbids its private fact',
      fixtures => { fixtureById(fixtures, 'canal-ledger').characters.find(({ id }) => id === 'inspector').forbiddenFactIds.push('seal-forgery') },
      { code: 'CROSS_SECTION_PRIVATE_FACT_OWNER_FORBIDDEN', fixtureId: 'canal-ledger', characterId: 'inspector', factId: 'seal-forgery' }
    ],
    [
      'non-owner does not forbid a private fact',
      fixtures => { fixtureById(fixtures, 'canal-ledger').characters.find(({ id }) => id === 'messenger').forbiddenFactIds = [] },
      { code: 'CROSS_SECTION_PRIVATE_FACT_NON_OWNER_MUST_FORBID', fixtureId: 'canal-ledger', characterId: 'messenger', factId: 'seal-forgery' }
    ],
    [
      'non-owner knows a private fact',
      fixtures => { fixtureById(fixtures, 'canal-ledger').characters.find(({ id }) => id === 'messenger').knownFactIds.push('seal-forgery') },
      { code: 'CROSS_SECTION_PRIVATE_FACT_NON_OWNER_KNOWS', fixtureId: 'canal-ledger', characterId: 'messenger', factId: 'seal-forgery' }
    ]
  ])('enforces the private-fact knowledge matrix when %s', (_label, mutate, error) => {
    const fixtures = cloneFixtures()
    mutate(fixtures)
    expectInvalid(fixtures, error)
  })

  it.each([
    ['missing speaker', speakerMap => { delete speakerMap.信使 }],
    ['wrong character id', speakerMap => { speakerMap.检查官 = 'messenger' }],
    ['id keyed map', speakerMap => { delete speakerMap.检查官; speakerMap.inspector = '检查官' }]
  ])('rejects an incomplete or wrong speaker map: %s', (_label, mutate) => {
    const fixtures = cloneFixtures()
    mutate(fixtureById(fixtures, 'canal-ledger').speakerMap)
    expectInvalid(fixtures, { code: 'CROSS_SECTION_INVALID_SPEAKER_MAP', fixtureId: 'canal-ledger' })
  })
})

describe('novel cross-section bakeoff provider', () => {
  const providerConfig = {
    id: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'provider-secret',
    model: 'novel-model',
    format: 'openai'
  }

  it('builds the fixed tool-provider request and normalizes metrics', async () => {
    const requests = []
    const times = [1200, 1242]
    const runner = async request => {
      requests.push(request)
      return {
        kind: 'final_ready',
        text: ':::narration\n雨落在账册上。',
        usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
        finishReason: 'stop'
      }
    }
    const provider = createBakeoffProvider(providerConfig, {
      runner,
      now: () => times.shift()
    })

    const result = await provider.invoke({
      callId: 'run-canal-ledger-1',
      system: '你是小说叙事模型。',
      user: '续写这段场景。',
      maxTokens: 1800
    })

    expect(requests).toEqual([{
      schemaVersion: 1,
      requestId: 'run-canal-ledger-1',
      provider: providerConfig,
      messages: [
        { role: 'system', content: '你是小说叙事模型。' },
        { role: 'user', content: '续写这段场景。' }
      ],
      tools: [expect.objectContaining({
        name: 'world_lookup',
        description: expect.any(String),
        inputSchema: expect.any(Object)
      })],
      options: {
        temperature: 0.4,
        maxTokens: 1800,
        timeoutMs: 90000,
        toolChoice: 'none'
      }
    }])
    expect(provider).toMatchObject({
      config: providerConfig,
      provider: 'openai-compatible',
      model: 'novel-model',
      format: 'openai'
    })
    expect(result).toEqual({
      text: ':::narration\n雨落在账册上。',
      usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
      finishReason: 'stop',
      latencyMs: 42
    })
  })

  it('supports direct invocation and clock injection with non-negative latency', async () => {
    const result = await invokeBakeoffModel(providerConfig, {
      callId: 'direct-1',
      system: 'system',
      user: 'user',
      maxTokens: 1800
    }, {
      runner: async () => ({
        kind: 'final_ready',
        text: '正文',
        usage: { prompt_tokens: 3, completion_tokens: 2 },
        finishReason: 'stop'
      }),
      clock: { now: () => 500 }
    })

    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 })
    expect(result.latencyMs).toBe(0)
  })

  it('resolves the built-in MiniMax sentinel from the server environment only in memory', async () => {
    const previousKey = process.env.MINIMAX_API_KEY
    process.env.MINIMAX_API_KEY = 'server-env-secret'
    const capturedProviders = []
    const sentinelConfig = {
      id: 'MiniMax',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      apiKey: 'minimax-server-key',
      model: 'MiniMax-Text-01',
      format: 'anthropic'
    }

    try {
      const provider = createBakeoffProvider(sentinelConfig, {
        runner: async request => {
          capturedProviders.push(structuredClone(request.provider))
          return {
            kind: 'final_ready',
            text: '正文',
            usage: {},
            finishReason: 'stop'
          }
        },
        now: () => 1
      })

      await provider.invoke({ callId: 'server-key-1', system: 'system', user: 'user' })

      expect(capturedProviders).toEqual([{
        ...sentinelConfig,
        apiKey: 'server-env-secret'
      }])
      expect(provider.config).toEqual(sentinelConfig)
      expect(provider.config.apiKey).toBe('minimax-server-key')
    } finally {
      if (previousKey === undefined) delete process.env.MINIMAX_API_KEY
      else process.env.MINIMAX_API_KEY = previousKey
    }
  })

  it('isolates a deeply frozen provider snapshot from callers and runner mutations', async () => {
    const mutableConfig = {
      ...providerConfig,
      routing: { region: 'primary' }
    }
    const capturedProviders = []
    const provider = createBakeoffProvider(mutableConfig, {
      runner: async request => {
        capturedProviders.push(structuredClone(request.provider))
        request.provider.model = 'runner-mutated-model'
        request.provider.baseUrl = 'https://runner.invalid/private'
        request.provider.routing.region = 'runner-mutated-region'
        return {
          kind: 'final_ready',
          text: '正文',
          usage: {},
          finishReason: 'stop'
        }
      },
      now: () => 1
    })

    mutableConfig.model = 'caller-mutated-model'
    mutableConfig.baseUrl = 'https://caller.invalid/private'
    mutableConfig.routing.region = 'caller-mutated-region'
    expect(Object.isFrozen(provider.config)).toBe(true)
    expect(Object.isFrozen(provider.config.routing)).toBe(true)
    expect(() => { provider.config.model = 'consumer-mutated-model' }).toThrow(TypeError)
    expect(() => { provider.config.routing.region = 'consumer-mutated-region' }).toThrow(TypeError)

    await provider.invoke({ callId: 'isolated-1', system: 'system', user: 'user', maxTokens: 1800 })
    await provider.invoke({ callId: 'isolated-2', system: 'system', user: 'user', maxTokens: 1800 })

    expect(capturedProviders).toEqual([
      { ...providerConfig, routing: { region: 'primary' } },
      { ...providerConfig, routing: { region: 'primary' } }
    ])
    expect(provider.config).toEqual({ ...providerConfig, routing: { region: 'primary' } })
    expect(mutableConfig).toEqual({
      ...providerConfig,
      model: 'caller-mutated-model',
      baseUrl: 'https://caller.invalid/private',
      routing: { region: 'caller-mutated-region' }
    })
  })

  it.each([
    ['tool calls', { kind: 'tool_calls', calls: [{ name: 'world_lookup' }] }, 'CROSS_SECTION_PROVIDER_TOOL_CALL_REJECTED'],
    ['empty text', { kind: 'final_ready', text: '   ', finishReason: 'stop' }, 'CROSS_SECTION_PROVIDER_EMPTY_TEXT'],
    ['length finish', { kind: 'final_ready', text: '未完成', finishReason: 'length' }, 'CROSS_SECTION_PROVIDER_OUTPUT_TRUNCATED'],
    ['max_tokens finish', { kind: 'final_ready', text: '未完成', finishReason: 'max_tokens' }, 'CROSS_SECTION_PROVIDER_OUTPUT_TRUNCATED'],
    ['explicit truncated result', { kind: 'final_ready', text: '未完成', truncated: true }, 'CROSS_SECTION_PROVIDER_OUTPUT_TRUNCATED']
  ])('throws a typed error for %s', async (_label, runnerResult, code) => {
    await expect(invokeBakeoffModel(providerConfig, {
      callId: `error-${_label}`,
      system: 'system',
      user: 'user',
      maxTokens: 1800
    }, {
      runner: async () => runnerResult,
      now: () => 1
    })).rejects.toMatchObject({ code })
  })

  it.each([
    ['NARRATIVE_PROVIDER_EMPTY_RESPONSE', 'CROSS_SECTION_PROVIDER_EMPTY_TEXT'],
    ['NARRATIVE_PROVIDER_OUTPUT_TRUNCATED', 'CROSS_SECTION_PROVIDER_OUTPUT_TRUNCATED']
  ])('maps runner rejection %s and retains the provider error as cause', async (providerCode, bakeoffCode) => {
    const providerFailure = Object.assign(new Error(`provider failed: ${providerCode}`), {
      code: providerCode
    })
    let rejection

    try {
      await invokeBakeoffModel(providerConfig, {
        callId: `runner-${providerCode}`,
        system: 'system',
        user: 'user',
        maxTokens: 1800
      }, {
        runner: async () => { throw providerFailure },
        now: () => 1
      })
    } catch (error) {
      rejection = error
    }

    expect(rejection).toMatchObject({ code: bakeoffCode })
    expect(rejection.cause).toBe(providerFailure)
  })

  it('passes through unrelated provider errors without masking them', async () => {
    const providerFailure = Object.assign(new Error('provider authentication failed'), {
      code: 'NARRATIVE_PROVIDER_CONFIGURATION_INVALID'
    })

    await expect(invokeBakeoffModel(providerConfig, {
      callId: 'runner-unrelated-error',
      system: 'system',
      user: 'user',
      maxTokens: 1800
    }, {
      runner: async () => { throw providerFailure },
      now: () => 1
    })).rejects.toBe(providerFailure)
  })
})

describe('novel cross-section bakeoff manifest redaction', () => {
  it('recursively removes secrets and reduces base URLs without mutating input', () => {
    const manifest = {
      provider: 'openai-compatible',
      model: 'novel-model',
      format: 'openai',
      apiKey: 'top-secret',
      budgets: { inputTokens: 1800 },
      runs: [{
        runId: 'run-1',
        timestamp: '2026-08-19T00:00:00.000Z',
        Authorization: 'Bearer hidden',
        baseUrl: 'https://user:password@api.example.com/v1/chat?token=hidden',
        usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
        nested: { AccessToken: 'access-secret', refreshTOKEN: 'refresh-secret' }
      }],
      invalid: { BASEURL: 'not-a-url/private/path', Secret: 'nested-secret' }
    }
    const original = structuredClone(manifest)

    const redacted = redactBakeoffManifest(manifest)
    const serialized = JSON.stringify(redacted)

    expect(manifest).toEqual(original)
    expect(redacted).toEqual({
      provider: 'openai-compatible',
      model: 'novel-model',
      format: 'openai',
      budgets: { inputTokens: 1800 },
      runs: [{
        runId: 'run-1',
        timestamp: '2026-08-19T00:00:00.000Z',
        baseUrl: 'https://api.example.com',
        usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
        nested: {}
      }],
      invalid: { BASEURL: '' }
    })
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('Bearer hidden')
    expect(serialized).not.toContain('/v1/chat')
    expect(serialized).not.toContain('/private/path')
  })

  it('normalizes punctuated sensitive and base URL keys while preserving usage metrics', () => {
    const redacted = redactBakeoffManifest({
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      api_key: 'api-secret',
      'X-API-Key': 'x-api-secret',
      'CLIENT-SECRET': 'client-secret-value',
      Password: 'password-value',
      TOKEN: 'token-value',
      auth_token: 'auth-token-value',
      bearerToken: 'bearer-token-value',
      'X-Authorization': 'Bearer x-authorization-value',
      base_url: 'https://user:pass@api.example.com/v1/chat?token=hidden',
      nested: [{
        'X-Base-Url': 'http://gateway.example.test/private?q=hidden',
        'refresh token': 'refresh-secret'
      }]
    })
    const serialized = JSON.stringify(redacted)

    expect(redacted).toMatchObject({
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      base_url: 'https://api.example.com',
      nested: [{ 'X-Base-Url': 'http://gateway.example.test' }]
    })
    for (const leaked of [
      'api-secret',
      'x-api-secret',
      'client-secret-value',
      'password-value',
      'token-value',
      'auth-token-value',
      'bearer-token-value',
      'x-authorization-value',
      'refresh-secret',
      '/v1/chat',
      '/private'
    ]) {
      expect(serialized).not.toContain(leaked)
    }
  })

  it('serializes circular input and skips prototype-pollution keys without mutation', () => {
    const manifest = JSON.parse(`{
      "__proto__": { "polluted": "yes", "secret": "proto-secret" },
      "constructor": { "prototype": { "polluted": "yes" } },
      "safe": { "password": "nested-password", "value": "kept" }
    }`)
    manifest.self = manifest
    manifest.items = [manifest]

    const redacted = redactBakeoffManifest(manifest)
    const serialized = JSON.stringify(redacted)

    expect(Object.getPrototypeOf(redacted)).toBe(null)
    expect(Object.prototype.hasOwnProperty.call(redacted, '__proto__')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(redacted, 'constructor')).toBe(false)
    expect(redacted.safe.value).toBe('kept')
    expect(redacted.self).toBe('[Circular]')
    expect(redacted.items).toEqual(['[Circular]'])
    expect(serialized).not.toContain('proto-secret')
    expect(serialized).not.toContain('nested-password')
    expect({}.polluted).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(manifest, '__proto__')).toBe(true)
    expect(manifest.self).toBe(manifest)
    expect(manifest.items[0]).toBe(manifest)
  })
})

describe('novel cross-section private-fact scanning', () => {
  const fixture = CROSS_SECTION_FIXTURES.find(({ id }) => id === 'canal-ledger')

  it('reports forbidden character leaks once per block/fact/speaker in block order', () => {
    const marker = '驳船昨日已经沉没'
    const presentation = {
      blocks: [
        { id: 'b0', kind: 'dialogue', speakerId: 'inspector', text: `${marker}；${marker}。` },
        { id: 'b1', kind: 'action', speakerId: 'inspector', text: `他写下：${marker}。` },
        { id: 'b2', kind: 'dialogue', speakerId: 'messenger', text: marker }
      ]
    }

    expect(scanUnauthorizedFacts({ fixture, runId: 'scan-run', presentation })).toEqual({
      leaks: [
        {
          fixtureId: fixture.id,
          runId: 'scan-run',
          speakerId: 'inspector',
          factId: 'barge-sank',
          matchedMarker: marker,
          blockId: 'b0',
          blockIndex: 0
        },
        {
          fixtureId: fixture.id,
          runId: 'scan-run',
          speakerId: 'inspector',
          factId: 'barge-sank',
          matchedMarker: marker,
          blockId: 'b1',
          blockIndex: 1
        }
      ],
      needsHumanReview: [],
      disclosures: [
        {
          fixtureId: fixture.id,
          runId: 'scan-run',
          speakerId: 'messenger',
          factId: 'barge-sank',
          matchedMarker: marker,
          blockId: 'b2',
          blockIndex: 2
        }
      ]
    })
  })

  it('applies a visible owner disclosure only after its block', () => {
    const marker = '封印是伪造的'
    const presentation = {
      blocks: [
        { id: 'before', kind: 'thought', speakerId: 'messenger', text: marker },
        { id: 'owner', kind: 'dialogue', speakerId: 'inspector', text: marker },
        { id: 'after', kind: 'dialogue', speakerId: 'messenger', text: marker }
      ]
    }

    const result = scanUnauthorizedFacts({ fixture, runId: 'disclose-run', presentation })

    expect(result.leaks.map(({ blockId }) => blockId)).toEqual(['before'])
    expect(result.disclosures.map(({ blockId, factId }) => ({ blockId, factId }))).toEqual([
      { blockId: 'owner', factId: 'seal-forgery' }
    ])
  })

  it('does not disclose an owner fact from thought or action but does disclose it from dialogue', () => {
    const marker = '封印是伪造的'
    const ownerThought = scanUnauthorizedFacts({
      fixture,
      runId: 'owner-thought-run',
      presentation: {
        blocks: [
          { id: 'owner-thought', kind: 'thought', speakerId: 'inspector', text: marker },
          { id: 'other-dialogue', kind: 'dialogue', speakerId: 'messenger', text: marker }
        ]
      }
    })
    const ownerDialogue = scanUnauthorizedFacts({
      fixture,
      runId: 'owner-dialogue-run',
      presentation: {
        blocks: [
          { id: 'owner-dialogue', kind: 'dialogue', speakerId: 'inspector', text: marker },
          { id: 'other-dialogue', kind: 'dialogue', speakerId: 'messenger', text: marker }
        ]
      }
    })

    expect(ownerThought.disclosures).toEqual([])
    expect(ownerThought.leaks).toEqual([
      expect.objectContaining({ blockId: 'other-dialogue', factId: 'seal-forgery' })
    ])
    expect(ownerDialogue.disclosures).toEqual([
      expect.objectContaining({ blockId: 'owner-dialogue', factId: 'seal-forgery' })
    ])
    expect(ownerDialogue.leaks).toEqual([])
  })

  it('routes narration, system, unresolved, and missing speakers to human review', () => {
    const marker = '驳船昨日已经沉没'
    const result = scanUnauthorizedFacts({
      fixture,
      runId: 'review-run',
      presentation: {
        blocks: [
          { id: 'narration', kind: 'narration', text: marker },
          { id: 'system', kind: 'system', speakerId: 'inspector', text: marker },
          { id: 'unresolved', kind: 'dialogue', speakerTrust: 'unresolved', text: marker },
          { id: 'missing', kind: 'action', text: marker }
        ]
      }
    })

    expect(result.leaks).toEqual([])
    expect(result.disclosures).toEqual([])
    expect(result.needsHumanReview).toEqual([
      expect.objectContaining({ factId: 'barge-sank', matchedMarker: marker, blockId: 'narration', blockIndex: 0, reason: 'narration' }),
      expect.objectContaining({ factId: 'barge-sank', matchedMarker: marker, blockId: 'system', blockIndex: 1, reason: 'system' }),
      expect.objectContaining({ factId: 'barge-sank', matchedMarker: marker, blockId: 'unresolved', blockIndex: 2, reason: 'speaker-unresolved' }),
      expect.objectContaining({ factId: 'barge-sank', matchedMarker: marker, blockId: 'missing', blockIndex: 3, reason: 'speaker-missing' })
    ])
  })

  it('emits one event per block/fact/speaker and chooses the first matching fixture marker', () => {
    const multiMarkerFixture = structuredClone(fixture)
    const forged = multiMarkerFixture.facts.find(({ id }) => id === 'seal-forgery')
    const sunk = multiMarkerFixture.facts.find(({ id }) => id === 'barge-sank')
    forged.leakMarkers = ['伪造首选标记', '伪造次选标记']
    sunk.leakMarkers = ['沉船首选标记', '沉船次选标记']

    const result = scanUnauthorizedFacts({
      fixture: multiMarkerFixture,
      runId: 'multi-marker-run',
      presentation: {
        blocks: [
          { id: 'review', kind: 'narration', text: '沉船次选标记，然后沉船首选标记。' },
          { id: 'disclosure', kind: 'dialogue', speakerId: 'messenger', text: '沉船次选标记，然后沉船首选标记。' },
          { id: 'leak', kind: 'dialogue', speakerId: 'messenger', text: '伪造次选标记，然后伪造首选标记。' }
        ]
      }
    })

    expect(result.needsHumanReview).toHaveLength(1)
    expect(result.needsHumanReview[0]).toMatchObject({
      blockId: 'review',
      factId: 'barge-sank',
      matchedMarker: '沉船首选标记'
    })
    expect(result.disclosures).toHaveLength(1)
    expect(result.disclosures[0]).toMatchObject({
      blockId: 'disclosure',
      factId: 'barge-sank',
      matchedMarker: '沉船首选标记'
    })
    expect(result.leaks).toHaveLength(1)
    expect(result.leaks[0]).toMatchObject({
      blockId: 'leak',
      factId: 'seal-forgery',
      matchedMarker: '伪造首选标记'
    })
  })
})

describe('novel cross-section blind review bundle', () => {
  const architectures = CROSS_SECTION_ARCHITECTURES
  const makeRun = (index, extra = {}) => ({
    runId: `run-${index}`,
    fixtureId: CROSS_SECTION_FIXTURES[index % CROSS_SECTION_FIXTURES.length].id,
    architecture: architectures[index % architectures.length],
    status: 'success',
    readableText: `可读终稿 ${index}`,
    rawText: `:::dialogue|恶意角色\nraw prompt ${index}`,
    calls: [{ request: { user: `INTERMEDIATE_SENTINEL_${index}` } }],
    prompts: [`PROMPT_SENTINEL_${index}`],
    intermediate: `INTERMEDIATE_SENTINEL_${index}`,
    maliciousExtra: { secret: `EXTRA_SENTINEL_${index}` },
    ...extra
  })

  it('creates deterministic collision-free blind ids and a private order-restoration map for six runs', () => {
    const runs = Array.from({ length: 6 }, (_, index) => makeRun(index, index === 5 ? { status: 'completed' } : {}))
    const first = createBlindReviewBundle(runs, { experimentRunId: 'experiment-42' })
    const second = createBlindReviewBundle(runs, { experimentRunId: 'experiment-42' })

    expect(first).toEqual(second)
    expect(first.blindReview).toEqual({
      schemaVersion: 1,
      instructions: expect.any(String),
      items: expect.any(Array)
    })
    expect(first.blindReview.items).toHaveLength(6)
    expect(new Set(first.blindReview.items.map(({ blindId }) => blindId)).size).toBe(6)
    expect(first.blindReview.items.every(({ blindId }) => /^blind-[a-f0-9]{16}$/.test(blindId))).toBe(true)
    expect(first.reviewTemplate).toHaveLength(6)
    expect(Object.keys(first.privateBlindMap)).toEqual(first.blindReview.items.map(({ blindId }) => blindId))
    expect(Object.values(first.privateBlindMap).map(({ runId }) => runId).sort()).toEqual(runs.map(({ runId }) => runId).sort())
  })

  it('accepts the real successful runner shape and filters failed runs', async () => {
    const fixture = CROSS_SECTION_FIXTURES[0]
    const provider = {
      async invoke() {
        return {
          text: ':::narration\n雨落在密封粮册上。',
          usage: { inputTokens: 4, outputTokens: 3, totalTokens: 7 },
          finishReason: 'stop'
        }
      }
    }
    const successfulRun = await runSingleWriter(fixture, provider, {
      runId: 'real-success-run',
      now: () => 10
    })
    const failedRun = {
      ...successfulRun,
      runId: 'real-failed-run',
      status: 'failed',
      readableText: '失败输出不进入盲评'
    }

    expect(successfulRun.status).toBe('success')
    const bundle = createBlindReviewBundle([successfulRun, failedRun], {
      experimentRunId: 'real-run-shape'
    })
    expect(bundle.blindReview.items).toHaveLength(1)
    expect(bundle.blindReview.items[0].readableProse).toBe(successfulRun.readableText)
    expect(Object.values(bundle.privateBlindMap)).toEqual([
      {
        runId: 'real-success-run',
        architecture: 'single-writer',
        fixtureId: fixture.id
      }
    ])
  })

  it('rejects duplicate run ids before building a blind map', () => {
    let error
    try {
      createBlindReviewBundle([
        makeRun(0, { runId: 'duplicate-run' }),
        makeRun(1, { runId: 'duplicate-run' })
      ], { experimentRunId: 'duplicate-run-check' })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(CrossSectionEvaluationError)
    expect(error).toMatchObject({
      code: 'CROSS_SECTION_DUPLICATE_RUN_ID',
      runId: 'duplicate-run'
    })
  })

  it('explicitly projects successful readable runs without private or malicious run fields', () => {
    const runs = [
      makeRun(0),
      makeRun(1, { status: 'failed' }),
      makeRun(2, { readableText: '' }),
      makeRun(3, { status: 'queued' })
    ]
    const bundle = createBlindReviewBundle(runs, { experimentRunId: 'projection-check' })
    const serializedBlind = JSON.stringify(bundle.blindReview)

    expect(bundle.blindReview.items).toHaveLength(1)
    expect(bundle.blindReview.items[0]).toEqual({
      blindId: expect.stringMatching(/^blind-[a-f0-9]{16}$/),
      fixtureGenreLabel: CROSS_SECTION_FIXTURES[0].title,
      readableProse: '可读终稿 0',
      scoreInstructions: expect.any(Object)
    })
    for (const forbidden of [
      ...architectures,
      'run-0',
      'INTERMEDIATE_SENTINEL',
      'PROMPT_SENTINEL',
      'EXTRA_SENTINEL',
      ':::dialogue',
      'raw prompt'
    ]) expect(serializedBlind).not.toContain(forbidden)
    expect(bundle.reviewTemplate[0]).toEqual({
      blindId: bundle.blindReview.items[0].blindId,
      voiceDistinctness: null,
      informationDiscipline: null,
      causalCoherence: null,
      authorControl: null,
      literaryUsability: null,
      humanLeakFactIds: [],
      notes: ''
    })
    expect(bundle.privateBlindMap[bundle.blindReview.items[0].blindId]).toEqual({
      runId: 'run-0',
      architecture: 'single-writer',
      fixtureId: 'canal-ledger'
    })
  })
})

describe('novel cross-section human reviews', () => {
  const blindIds = ['blind-a', 'blind-b']
  const completeReview = (blindId, reviewerId = 'reviewer-1', scores = {}) => ({
    blindId,
    reviewerId,
    voiceDistinctness: 8,
    informationDiscipline: 7,
    causalCoherence: 6,
    authorControl: 9,
    literaryUsability: 5,
    humanLeakFactIds: [],
    notes: '',
    ...scores
  })

  it('validates complete bounded integer reviews and requires coverage of every blind id', () => {
    expect(validateBakeoffReviews([
      completeReview('blind-a'),
      completeReview('blind-b')
    ], { blindIds })).toEqual({ valid: true })

    expect(validateBakeoffReviews([completeReview('blind-a')], { blindIds })).toEqual({
      valid: false,
      error: { code: 'CROSS_SECTION_REVIEW_MISSING_BLIND_ID', blindId: 'blind-b' }
    })
  })

  it.each([
    ['unknown blind id', [completeReview('blind-c')], 'CROSS_SECTION_REVIEW_UNKNOWN_BLIND_ID'],
    ['duplicate reviewer/blind pair', [completeReview('blind-a'), completeReview('blind-a')], 'CROSS_SECTION_REVIEW_DUPLICATE'],
    ['null score', [completeReview('blind-a', 'r1', { voiceDistinctness: null })], 'CROSS_SECTION_REVIEW_INVALID_SCORE'],
    ['fractional score', [completeReview('blind-a', 'r1', { authorControl: 7.5 })], 'CROSS_SECTION_REVIEW_INVALID_SCORE'],
    ['out-of-range score', [completeReview('blind-a', 'r1', { literaryUsability: 11 })], 'CROSS_SECTION_REVIEW_INVALID_SCORE'],
    ['duplicate leak facts', [completeReview('blind-a', 'r1', { humanLeakFactIds: ['fact-a', 'fact-a'] })], 'CROSS_SECTION_REVIEW_INVALID_LEAK_FACT_IDS'],
    ['non-string notes', [completeReview('blind-a', 'r1', { notes: 42 })], 'CROSS_SECTION_REVIEW_INVALID_NOTES']
  ])('returns a typed error without throwing for %s', (_label, reviews, code) => {
    let result
    expect(() => { result = validateBakeoffReviews(reviews, { blindIds: ['blind-a'] }) }).not.toThrow()
    expect(result).toEqual({ valid: false, error: expect.objectContaining({ code }) })
  })

  it('requires score dimensions to be own properties and rejects a blank explicit reviewer id', () => {
    const inheritedScores = Object.create({
      voiceDistinctness: 8,
      informationDiscipline: 7,
      causalCoherence: 6,
      authorControl: 9,
      literaryUsability: 5
    })
    Object.assign(inheritedScores, {
      blindId: 'blind-a',
      reviewerId: 'reviewer-prototype',
      humanLeakFactIds: [],
      notes: ''
    })

    expect(validateBakeoffReviews([inheritedScores], { blindIds: ['blind-a'] })).toEqual({
      valid: false,
      error: {
        code: 'CROSS_SECTION_REVIEW_INVALID_SCORE',
        blindId: 'blind-a',
        field: 'voiceDistinctness'
      }
    })
    expect(validateBakeoffReviews([
      completeReview('blind-a', '   ')
    ], { blindIds: ['blind-a'] })).toEqual({
      valid: false,
      error: {
        code: 'CROSS_SECTION_REVIEW_INVALID_REVIEWER_ID',
        blindId: 'blind-a'
      }
    })
  })

  it('allows an absent reviewer id but aggregate rejects an incomplete score record', () => {
    const withoutReviewer = completeReview('blind-a')
    delete withoutReviewer.reviewerId
    expect(validateBakeoffReviews([withoutReviewer], { blindIds: ['blind-a'] })).toEqual({ valid: true })

    const incomplete = completeReview('blind-a')
    delete incomplete.causalCoherence
    let error
    try {
      aggregateHumanReviews([incomplete])
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(CrossSectionEvaluationError)
    expect(error).toMatchObject({
      code: 'CROSS_SECTION_REVIEW_INVALID_SCORE',
      blindId: 'blind-a',
      field: 'causalCoherence'
    })
  })

  it('averages each dimension across reviewers and unions human leak facts once', () => {
    const reviews = [
      completeReview('blind-a', 'reviewer-1', {
        voiceDistinctness: 10,
        informationDiscipline: 8,
        causalCoherence: 6,
        authorControl: 4,
        literaryUsability: 2,
        humanLeakFactIds: ['fact-a']
      }),
      completeReview('blind-a', 'reviewer-2', {
        voiceDistinctness: 8,
        informationDiscipline: 6,
        causalCoherence: 4,
        authorControl: 2,
        literaryUsability: 0,
        humanLeakFactIds: ['fact-b', 'fact-a']
      })
    ]

    expect(aggregateHumanReviews(reviews)).toEqual([
      {
        blindId: 'blind-a',
        reviewCount: 2,
        humanScore: 5,
        scores: {
          voiceDistinctness: 9,
          informationDiscipline: 7,
          causalCoherence: 5,
          authorControl: 3,
          literaryUsability: 1
        },
        humanLeakFactIds: ['fact-a', 'fact-b']
      }
    ])
  })
})
