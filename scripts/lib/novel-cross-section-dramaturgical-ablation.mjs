/**
 * 戏剧极小引擎消融实验库（Tasks 2-7）。
 *
 * 三条件共享 single-writer 基底（system=buildFinalProseContract、公开设定、
 * focus/exit/beat/length、完整 fact/role 合同、可选关系块）；
 * 唯一差异是追加的戏剧块：S1 四问 / S1+S2 冗余词表。
 * 与 relation-ab 一致地复制 bake-off 私有 formatter（保持字节一致，不做提取）。
 */
import { createHash } from 'node:crypto'
import * as nodeFs from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { normalizeGenerationUsage } from '../../shared/generationToolContract.js'
import {
  buildFinalProseContract,
  normalizeCrossSectionFinalProse,
  scanUnauthorizedFacts
} from './novel-cross-section-bakeoff.mjs'
import {
  CROSS_SECTION_RELATION_FIXTURES,
  validateCrossSectionRelationFixtures
} from '../fixtures/novel-cross-section-relation-fixtures.mjs'
import { serializeMinimalRelationPack } from './novel-cross-section-relation-ab.mjs'
import {
  CROSS_SECTION_DRAMATURGICAL_FIXTURES,
  DRAMATURGICAL_FIXTURE_SCHEMA_VERSION,
  validateDramaturgicalFixtures
} from '../fixtures/novel-cross-section-dramaturgical-fixtures.mjs'

export const DRAMATURGICAL_CONDITIONS = Object.freeze([
  'baseline',
  'minimal-engine',
  'full-vocabulary'
])
export const DRAMATURGICAL_PROMPT_CONTRACT_VERSION = 'cross-section-dramaturgy-prompt.v1'
export const DRAMATURGICAL_RUNNER_CONTRACT_VERSION = 'cross-section-dramaturgy-runner.v1'
export const DRAMATURGICAL_EVALUATOR_CONTRACT_VERSION = 'cross-section-dramaturgy-evaluator.v1'
export const DRAMATURGICAL_AUTHORING_CONTRACT_VERSION = 'cross-section-dramaturgy-authoring.v1'
export const DRAMATURGICAL_RELATION_MODES = Object.freeze(['none', 'minimal-relation'])
export const DRAMATURGICAL_MAX_TOKENS = 1800
export const DRAMATURGICAL_TEMPERATURE = 0.4
export const DEFAULT_DRAMATURGICAL_OUTPUT_ROOT = '/tmp/pinax-cross-section-dramaturgy-ablation'

const codePoints = value => [...String(value || '')].length
const isText = value => typeof value === 'string' && value.trim().length > 0

export const dramaturgicalError = (code, message, context = {}) => Object.assign(
  new Error(message),
  { code, ...context }
)

/* —— 与 bake-off/relation-ab 私有 formatter 逐字节一致 —— */
const labelledFact = fact => [
  `id=${fact.id}`,
  `visibility=${fact.visibility}`,
  `owner=${fact.ownerCharacterId || 'public'}`,
  `text=${fact.text}`
].join(' | ')

const roleContract = character => [
  `id=${character.id}`,
  `name=${character.name}`,
  `desire=${character.desire}`,
  `contradiction=${character.contradiction}`,
  `voice=${character.voiceProfile}`,
  `temperament=${character.temperament}`,
  `known=${character.knownFactIds.join(',')}`,
  `forbidden=${character.forbiddenFactIds.join(',')}`
].join(' | ')

const commonFinalUserPrompt = fixture => [
  '【公开设定】',
  ...fixture.facts.filter(({ visibility }) => visibility === 'public').map(labelledFact),
  `【focus】所有冲突必须指向 focusProp=${fixture.focusProp}`,
  `【exit】只在 exitCue=${fixture.exitCue.join(' / ')} 停下`,
  `【beat】内部组织 3–5 个因果 beats，不打印标签`,
  '【length/format】终稿 500–900 中文字符，使用 Pinax markers 与规范中文引号',
  '【final boundary】这次调用只产出终稿，maxTokens=1800；不提供选项，不自动继续。'
].join('\n')

const fullRestrictions = fixture => [
  '【完整 fact visibility labels】',
  ...fixture.facts.map(labelledFact),
  '【role contracts】',
  ...fixture.characters.map(roleContract)
].join('\n')

const nameOf = (fixture, characterId) => fixture.characters.find(({ id }) => id === characterId)?.name || characterId

/**
 * Task 2：S1 四问 → 作者可读标题（不暴露内部字段名）。
 */
export function serializeMinimalEngine(fixture) {
  const s1 = fixture.minimalEngine
  const lines = [
    '【场景压力】',
    s1.pressure,
    '【当前索取】',
    ...fixture.characters.map(character => `- ${character.name}：${s1.sceneObjectives[character.id]}`),
    '【不可直说】',
    ...fixture.characters.map(character => `- ${character.name}：${s1.withheldTruths[character.id]}`),
    '【必须发生的变化】',
    s1.stateChange
  ]
  return lines.join('\n')
}

/**
 * Task 2：S2 六字段冗余词表（中文理论标签是条件本身的一部分）。
 */
export function serializeFullVocabulary(fixture) {
  const s2 = fixture.fullVocabulary
  return [
    '【戏剧行动指引】',
    `前提：${s2.premise}`,
    `戏剧性问题：${s2.dramaticQuestion}`,
    `戏剧内核：${s2.dramaticGuts}`,
    `主要意识：${s2.mainConsciousness}`,
    `贯穿线：${s2.spine}`,
    `冲突类型：${s2.conflictType}`
  ].join('\n')
}

/**
 * Task 2：按条件构建提示词。三条件共享字节一致的基底与关系块；
 * 差异仅为追加的戏剧块。不估计作者输入耗时。
 */
export function buildDramaturgicalConditionPrompt({ fixture, condition, relationMode = 'none' } = {}) {
  if (!DRAMATURGICAL_CONDITIONS.includes(condition)) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_CONDITION_UNKNOWN', '未知消融条件', { condition })
  }
  if (!DRAMATURGICAL_RELATION_MODES.includes(relationMode)) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_RELATION_MODE_INVALID', '未知关系模式', { relationMode })
  }
  const validation = validateDramaturgicalFixtures([fixture])
  if (!validation.valid) {
    throw dramaturgicalError(
      validation.error.code,
      `戏剧 fixture 未通过验证：${validation.error.code}`,
      validation.error
    )
  }
  const relationFixture = CROSS_SECTION_RELATION_FIXTURES.find(({ id }) => id === fixture.id)
  if (relationMode === 'minimal-relation') {
    const relationValidation = validateCrossSectionRelationFixtures([relationFixture])
    if (!relationValidation.valid) {
      throw dramaturgicalError(
        relationValidation.error.code,
        '关系 fixture 未通过验证',
        relationValidation.error
      )
    }
  }

  const system = buildFinalProseContract(fixture)
  const sharedUser = [commonFinalUserPrompt(fixture), fullRestrictions(fixture)].join('\n\n')
  const relationBlock = relationMode === 'minimal-relation'
    ? serializeMinimalRelationPack(relationFixture)
    : ''
  const conditionBlock = condition === 'minimal-engine'
    ? serializeMinimalEngine(fixture)
    : (condition === 'full-vocabulary'
      ? `${serializeMinimalEngine(fixture)}\n\n${serializeFullVocabulary(fixture)}`
      : '')
  const user = [sharedUser, relationBlock, conditionBlock].filter(Boolean).join('\n\n')
  return {
    system,
    user,
    maxTokens: DRAMATURGICAL_MAX_TOKENS,
    temperature: DRAMATURGICAL_TEMPERATURE,
    promptMetrics: {
      promptChars: codePoints(system + user),
      promptBytes: Buffer.byteLength(system + user, 'utf8'),
      conditionChars: codePoints(conditionBlock),
      relationChars: codePoints(relationBlock)
    }
  }
}

/* ============================================================================
 * Task 3：24 尝试矩阵与受控 runner
 * ========================================================================== */

export function expandDramaturgicalMatrix({
  fixtures = CROSS_SECTION_DRAMATURGICAL_FIXTURES,
  conditions = DRAMATURGICAL_CONDITIONS,
  repetitions = 2
} = {}) {
  if (repetitions !== 2) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_REPETITIONS_FIXED', 'v1 固定 repetitions=2')
  }
  if ([...conditions].sort().join('|') !== [...DRAMATURGICAL_CONDITIONS].sort().join('|')) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_CONDITION_UNKNOWN', '条件集只能是三条件消融')
  }
  const attempts = []
  for (const fixture of fixtures) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      for (const condition of DRAMATURGICAL_CONDITIONS) {
        attempts.push({
          runId: `${fixture.id}-${condition}-r${repetition}`,
          fixtureId: fixture.id,
          repetition,
          condition
        })
      }
    }
  }
  return {
    attempts,
    attemptCount: attempts.length,
    pairCounts: {
      'minimal-engine-vs-baseline': fixtures.length * repetitions,
      'full-vocabulary-vs-minimal-engine': fixtures.length * repetitions
    },
    fixtureIds: fixtures.map(({ id }) => id),
    conditions: [...DRAMATURGICAL_CONDITIONS],
    repetitions,
    worstCaseProviderCalls: attempts.length
  }
}

/**
 * Task 3：执行单条件。provider.invoke 恰好一次；失败保留在私有记录，
 * 不换条件重试。成功记录含规范化正文、泄漏扫描、用量、延迟与双 provenance。
 */
export async function runDramaturgicalCondition({
  fixture,
  condition,
  repetition,
  provider,
  relationMode = 'none',
  runId,
  now = () => Date.now()
} = {}) {
  const fixtureId = fixture && typeof fixture === 'object' ? String(fixture.id || '') : ''
  const attemptRunId = String(runId || `${fixtureId}-${condition}-r${repetition}`)
  const startedAt = now()
  const base = { runId: attemptRunId, fixtureId, repetition, condition, relationMode, latencyMs: 0 }
  // 契约错误（未知条件/模式/fixture 校验）直接抛出；只有运行期失败转为 failed 记录
  const prompt = buildDramaturgicalConditionPrompt({ fixture, condition, relationMode })
  try {
    const result = await provider.invoke({
      callId: `${attemptRunId}:final`,
      system: prompt.system,
      user: prompt.user,
      maxTokens: prompt.maxTokens,
      temperature: prompt.temperature
    })
    const normalized = normalizeCrossSectionFinalProse(result?.text, fixture, attemptRunId)
    const scan = scanUnauthorizedFacts({ fixture, runId: attemptRunId, presentation: normalized.presentation })
    return {
      ...base,
      status: 'success',
      readableText: normalized.readableText,
      rawText: normalized.rawText,
      presentation: normalized.presentation,
      disclosures: scan.disclosures,
      unauthorizedFactEvents: scan.leaks,
      needsHumanInformationReview: scan.needsHumanReview,
      usage: normalizeGenerationUsage(result?.usage || {}),
      latencyMs: Math.max(0, now() - startedAt),
      promptMetrics: prompt.promptMetrics,
      conditionProvenance: {
        condition,
        conditionChars: prompt.promptMetrics.conditionChars,
        promptContractVersion: DRAMATURGICAL_PROMPT_CONTRACT_VERSION
      },
      relationProvenance: { relationMode }
    }
  } catch (error) {
    return {
      ...base,
      status: 'failed',
      error: { code: String(error?.code || 'CROSS_SECTION_DRAMATURGY_RUN_FAILED'), message: String(error?.message || '戏剧消融运行失败') },
      latencyMs: Math.max(0, now() - startedAt),
      promptMetrics: prompt.promptMetrics,
      conditionProvenance: { condition },
      relationProvenance: { relationMode }
    }
  }
}

/* ============================================================================
 * Task 4：不可变 manifest、追加式 JSONL 与可恢复生成
 * ========================================================================== */

const sha256Hex = value => createHash('sha256').update(String(value)).digest('hex')
const safeRunId = value => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(String(value || ''))

const dateFromNow = now => {
  const value = typeof now === 'function' ? now() : Date.now()
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

const timestampSlug = date => date.toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z')

const assertContainedPath = (outputRoot, runDir) => {
  if (!isAbsolute(outputRoot) || !isAbsolute(runDir)) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PATH_INVALID', '工件路径必须是绝对路径')
  }
  const root = resolve(outputRoot)
  const target = resolve(runDir)
  const offset = relative(root, target)
  if (!offset) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PATH_INVALID', 'run 目录不能等于 output root')
  }
  if (offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset)) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PATH_INVALID', 'run 目录必须位于 output root 内')
  }
  return { root, target }
}

const readOptional = async (fs, path) => {
  try {
    return await fs.readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

const atomicWriteJson = async (fs, path, value) => {
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
    await fs.rename(temporaryPath, path)
  } catch (error) {
    try { await fs.rm(temporaryPath, { force: true }) } catch { /* preserve primary error */ }
    throw error
  }
}

const acquireRunLock = async (fs, runDir) => {
  const lockPath = join(runDir, '.generate.lock')
  const token = sha256Hex(`${process.pid}|${Date.now()}|${Math.random()}`).slice(0, 24)
  try {
    await fs.writeFile(lockPath, `${JSON.stringify({ token })}\n`, { flag: 'wx' })
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_LOCKED', '该实验 run 正在被另一个生成进程使用')
    }
    throw error
  }
  return { lockPath, token }
}

const releaseRunLock = async (fs, ownership) => {
  try {
    const current = JSON.parse(await fs.readFile(ownership.lockPath, 'utf8'))
    if (current?.token === ownership.token) await fs.rm(ownership.lockPath, { force: true })
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

const normalizeProviderIdentity = providerConfig => {
  const provider = String(providerConfig?.id || providerConfig?.provider || '').trim()
  const model = String(providerConfig?.model || '').trim()
  const format = String(providerConfig?.format || '').trim()
  if (!provider || !model) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PROVIDER_INVALID', 'provider/model 配置不完整')
  }
  return {
    public: { provider, model, format },
    digest: sha256Hex(JSON.stringify({
      provider,
      model,
      format,
      baseUrl: String(providerConfig?.baseUrl || '')
    }))
  }
}

const normalizeRelationDecisionRef = (relationMode, value) => {
  if (relationMode === 'none') {
    if (value != null) {
      throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_RELATION_DECISION_INVALID', 'none 模式不能携带关系决策')
    }
    return null
  }
  if (relationMode !== 'minimal-relation') {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_RELATION_MODE_INVALID', '未知关系模式', { relationMode })
  }
  const reportPath = String(value?.reportPath || '')
  const reportSha256 = String(value?.reportSha256 || '')
  if (!isAbsolute(reportPath) || !/^[a-f0-9]{64}$/i.test(reportSha256)
    || value?.decision !== 'minimal-relation-supported') {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_RELATION_DECISION_INVALID', 'minimal-relation 需要已支持的关系报告引用')
  }
  return { reportPath, reportSha256: reportSha256.toLowerCase(), decision: value.decision }
}

const manifestIdentity = manifest => JSON.stringify({
  schemaVersion: manifest.schemaVersion,
  experiment: manifest.experiment,
  experimentRunId: manifest.experimentRunId,
  fixtureSchemaVersion: manifest.fixtureSchemaVersion,
  fixtureDigest: manifest.fixtureDigest,
  promptContractVersion: manifest.promptContractVersion,
  runnerContractVersion: manifest.runnerContractVersion,
  evaluatorContractVersion: manifest.evaluatorContractVersion,
  authoringContractVersion: manifest.authoringContractVersion,
  provider: manifest.provider,
  providerContractDigest: manifest.providerContractDigest,
  relationMode: manifest.relationMode,
  relationDecisionRef: manifest.relationDecisionRef,
  conditions: manifest.conditions,
  repetitions: manifest.repetitions,
  attemptCount: manifest.attemptCount,
  parameters: manifest.parameters,
  matrixRunIds: manifest.matrixRunIds
})

const parsePrivateRuns = (raw, allowedRunIds) => {
  if (!raw) return []
  if (!String(raw).endsWith('\n')) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PRIVATE_RUNS_INVALID', 'private-runs.jsonl 存在截断尾行')
  }
  const records = []
  const seen = new Set()
  for (const line of String(raw).split('\n').filter(Boolean)) {
    let record
    try {
      record = JSON.parse(line)
    } catch (cause) {
      throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PRIVATE_RUNS_INVALID', 'private-runs.jsonl 不是有效 JSONL', { cause })
    }
    if (!allowedRunIds.has(record?.runId) || !['success', 'failed'].includes(record?.status)) {
      throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PRIVATE_RUNS_INVALID', 'private run 不属于冻结矩阵')
    }
    if (seen.has(record.runId)) {
      throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PRIVATE_RUN_DUPLICATE', 'private run id 重复', { runId: record.runId })
    }
    seen.add(record.runId)
    records.push(record)
  }
  return records
}

export async function generateDramaturgicalArtifacts(options = {}) {
  const fs = options.fs || nodeFs
  const fixtures = options.fixtures || CROSS_SECTION_DRAMATURGICAL_FIXTURES
  const fixtureValidation = validateDramaturgicalFixtures(fixtures)
  if (!fixtureValidation.valid) {
    throw dramaturgicalError(fixtureValidation.error.code, '戏剧 fixture 未通过验证', fixtureValidation.error)
  }
  if (!options.provider?.invoke) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PROVIDER_INVALID', '缺少 provider 执行边界')
  }
  const relationMode = String(options.relationMode || 'none')
  const relationDecisionRef = normalizeRelationDecisionRef(relationMode, options.relationDecisionRef)
  const providerIdentity = normalizeProviderIdentity(options.providerConfig)
  const conditions = options.conditions || DRAMATURGICAL_CONDITIONS
  const repetitions = options.repetitions ?? 2
  const matrix = expandDramaturgicalMatrix({ fixtures, conditions, repetitions })
  const outputRoot = String(options.outputRoot || DEFAULT_DRAMATURGICAL_OUTPUT_ROOT)
  const createdDate = dateFromNow(options.now)
  const requestedExperimentRunId = String(options.experimentRunId || timestampSlug(createdDate))
  const requestedRunDir = String(options.runDir || join(outputRoot, requestedExperimentRunId))
  const { target: runDir } = assertContainedPath(outputRoot, requestedRunDir)
  const experimentRunId = String(options.experimentRunId || (options.runDir ? basename(runDir) : requestedExperimentRunId))
  if (!safeRunId(experimentRunId)) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_RUN_ID_INVALID', 'experimentRunId 必须是安全 slug')
  }
  const manifestPath = join(runDir, 'manifest.json')
  const privateRunsPath = join(runDir, 'private-runs.jsonl')
  await fs.mkdir(runDir, { recursive: true })
  const ownership = await acquireRunLock(fs, runDir)

  try {
    const desiredManifest = {
      schemaVersion: 1,
      experiment: 'dramaturgical-minimal-engine-ablation',
      experimentRunId,
      status: 'running',
      createdAt: createdDate.toISOString(),
      completedAt: null,
      fixtureSchemaVersion: DRAMATURGICAL_FIXTURE_SCHEMA_VERSION,
      fixtureDigest: sha256Hex(fixtureDigestValue(fixtures)),
      promptContractVersion: DRAMATURGICAL_PROMPT_CONTRACT_VERSION,
      runnerContractVersion: DRAMATURGICAL_RUNNER_CONTRACT_VERSION,
      evaluatorContractVersion: DRAMATURGICAL_EVALUATOR_CONTRACT_VERSION,
      authoringContractVersion: DRAMATURGICAL_AUTHORING_CONTRACT_VERSION,
      provider: providerIdentity.public,
      providerContractDigest: providerIdentity.digest,
      relationMode,
      relationDecisionRef,
      conditions: [...DRAMATURGICAL_CONDITIONS],
      repetitions: 2,
      attemptCount: matrix.attemptCount,
      parameters: { temperature: DRAMATURGICAL_TEMPERATURE, maxTokens: DRAMATURGICAL_MAX_TOKENS },
      matrixRunIds: matrix.attempts.map(({ runId }) => runId)
    }
    const existingManifestRaw = await readOptional(fs, manifestPath)
    let manifest
    if (existingManifestRaw == null) {
      const orphanedPrivate = await readOptional(fs, privateRunsPath)
      if (orphanedPrivate != null) {
        throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_RESUME_MISMATCH', '缺少 manifest，不能复用 private runs')
      }
      manifest = desiredManifest
      await atomicWriteJson(fs, manifestPath, manifest)
    } else {
      try {
        manifest = JSON.parse(existingManifestRaw)
      } catch (cause) {
        throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_MANIFEST_INVALID', 'manifest.json 不是有效 JSON', { cause })
      }
      if (!['running', 'complete'].includes(manifest?.status)) {
        throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_MANIFEST_INVALID', 'manifest status 不是已知状态')
      }
      desiredManifest.createdAt = manifest.createdAt
      if (manifestIdentity(manifest) !== manifestIdentity(desiredManifest)) {
        throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_RESUME_MISMATCH', '恢复参数与冻结 manifest 不一致')
      }
      manifest = { ...manifest, status: manifest.status === 'complete' ? 'complete' : 'running' }
    }

    const privateRaw = await readOptional(fs, privateRunsPath)
    const allowedRunIds = new Set(matrix.attempts.map(({ runId }) => runId))
    const existingRecords = parsePrivateRuns(privateRaw, allowedRunIds)
    if (manifest.status === 'complete') {
      if (existingRecords.length !== matrix.attemptCount) {
        throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PRIVATE_RUNS_INVALID', 'complete manifest 缺少终态 attempts')
      }
      return runDir
    }

    await atomicWriteJson(fs, manifestPath, { ...manifest, status: 'running', completedAt: null })
    const completedIds = new Set(existingRecords.map(({ runId }) => runId))
    for (const attempt of matrix.attempts) {
      if (completedIds.has(attempt.runId)) continue
      const fixture = fixtures.find(({ id }) => id === attempt.fixtureId)
      const result = await runDramaturgicalCondition({
        fixture,
        condition: attempt.condition,
        repetition: attempt.repetition,
        runId: attempt.runId,
        relationMode,
        provider: options.provider,
        now: options.now || (() => Date.now())
      })
      const privateRecord = {
        runId: result.runId,
        fixtureId: result.fixtureId,
        repetition: result.repetition,
        condition: result.condition,
        relationMode: result.relationMode,
        status: result.status,
        readableText: result.readableText || '',
        rawText: result.rawText || '',
        presentation: result.presentation || null,
        disclosures: result.disclosures || [],
        unauthorizedFactEvents: result.unauthorizedFactEvents || [],
        needsHumanInformationReview: result.needsHumanInformationReview || [],
        usage: result.usage || null,
        latencyMs: result.latencyMs ?? 0,
        promptMetrics: result.promptMetrics || null,
        conditionProvenance: result.conditionProvenance || null,
        relationProvenance: result.relationProvenance || null,
        error: result.error || null
      }
      await fs.appendFile(privateRunsPath, `${JSON.stringify(privateRecord)}\n`, 'utf8')
      completedIds.add(attempt.runId)
    }

    if (completedIds.size !== matrix.attemptCount) {
      throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_GENERATION_INCOMPLETE', '生成未形成 24 个终态 attempts')
    }
    manifest = {
      ...manifest,
      status: 'complete',
      completedAt: dateFromNow(options.now).toISOString()
    }
    await atomicWriteJson(fs, manifestPath, manifest)
    return runDir
  } finally {
    await releaseRunLock(fs, ownership)
  }
}

/* ============================================================================
 * Task 5：双族盲评对与严格 review 契约
 * ========================================================================== */

export const DRAMATURGICAL_SCORE_FIELDS = Object.freeze([
  'motivatedAction',
  'stateChange',
  'naturalSubtext',
  'structuralNaturalness',
  'literaryUsability',
  'informationDiscipline'
])

const DRAMATURGICAL_COMPARISONS = Object.freeze([
  Object.freeze({ family: 'minimal-engine-vs-baseline', conditions: Object.freeze(['minimal-engine', 'baseline']) }),
  Object.freeze({ family: 'full-vocabulary-vs-minimal-engine', conditions: Object.freeze(['full-vocabulary', 'minimal-engine']) })
])

const sanitizeDramaturgicalReviewText = value => String(value || '')
  .replace(/^\s*:::\s*$/gm, '')
  .replace(/:::/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

const publicDramaturgicalGroundTruth = fixture => ({
  fixtureTitle: fixture.title,
  publicFacts: fixture.facts.filter(({ visibility }) => visibility === 'public').map(({ text }) => text),
  focusProp: fixture.focusProp,
  expectedOutcome: fixture.expectedOutcome,
  antiOutcome: fixture.antiOutcome,
  dramaturgical: {
    motivations: [...fixture.dramaturgicalGroundTruth.observableMotivations],
    acceptableChanges: [...fixture.dramaturgicalGroundTruth.acceptableStateChanges],
    prohibitedShortcuts: [...fixture.dramaturgicalGroundTruth.prohibitedShortcuts],
    evaluatorNote: fixture.dramaturgicalGroundTruth.evaluatorNote
  }
})

/**
 * 将 24 个终态运行拆成两个互不混合的对照族。公共工件只含不透明 id、
 * 共同评审事实和文本；条件、fixture/repetition 与 run 映射只进入私有 map。
 */
export function createDramaturgicalBlindPairs(runs, { seed = 'dramaturgy-ablation', includePrivate = false } = {}) {
  const fixtureById = new Map(CROSS_SECTION_DRAMATURGICAL_FIXTURES.map(fixture => [fixture.id, fixture]))
  const successfulByRunId = new Map((Array.isArray(runs) ? runs : [])
    .filter(run => run?.status === 'success')
    .map(run => [run.runId, run]))
  const pairs = []
  const incompletePairs = []
  const privateBlindMap = {}
  const privateIncompleteMap = {}

  for (const fixture of CROSS_SECTION_DRAMATURGICAL_FIXTURES) {
    for (const repetition of [1, 2]) {
      for (const comparison of DRAMATURGICAL_COMPARISONS) {
        const key = `${fixture.id}|${repetition}|${comparison.family}`
        const pairId = `dp_${sha256Hex(`${seed}|${key}|pair`).slice(0, 12)}`
        const comparisonId = `dc_${sha256Hex(`${seed}|${comparison.family}|comparison`).slice(0, 10)}`
        const selectedRuns = comparison.conditions.map(condition => successfulByRunId.get(
          `${fixture.id}-${condition}-r${repetition}`
        ))
        if (selectedRuns.some(run => !run)) {
          incompletePairs.push({
            pairId,
            comparisonId,
            code: 'CROSS_SECTION_DRAMATURGY_PAIR_INCOMPLETE'
          })
          privateIncompleteMap[pairId] = {
            fixtureId: fixture.id,
            repetition,
            comparisonFamily: comparison.family,
            missingConditions: comparison.conditions.filter((condition, index) => !selectedRuns[index])
          }
          continue
        }

        const firstOnLeft = Number.parseInt(sha256Hex(`${seed}|${key}|side`).slice(0, 8), 16) % 2 === 0
        const orderedRuns = firstOnLeft ? selectedRuns : [...selectedRuns].reverse()
        const sides = orderedRuns.map((run, index) => {
          const outputId = `do_${sha256Hex(`${seed}|${pairId}|${index}|${run.runId}`).slice(0, 12)}`
          privateBlindMap[outputId] = {
            runId: run.runId,
            fixtureId: fixture.id,
            repetition,
            condition: run.condition,
            comparisonFamily: comparison.family,
            pairId
          }
          return { outputId, text: sanitizeDramaturgicalReviewText(run.readableText) }
        })
        pairs.push({
          pairId,
          comparisonId,
          groundTruth: publicDramaturgicalGroundTruth(fixture),
          left: sides[0],
          right: sides[1]
        })
      }
    }
  }

  const bundle = { pairs, incompletePairs }
  if (includePrivate) {
    bundle.privateBlindMap = privateBlindMap
    bundle.privateIncompleteMap = privateIncompleteMap
  }
  return bundle
}

const blankDramaturgicalScores = () => Object.fromEntries(
  DRAMATURGICAL_SCORE_FIELDS.map(field => [field, null])
)

export function buildDramaturgicalReviewTemplate(bundle) {
  const pairs = Array.isArray(bundle?.pairs) ? bundle.pairs : []
  const reviewerSlots = [1, 2].map(slot => ({
    slot,
    reviewerId: null,
    reviewPairs: pairs.map(({ pairId }) => ({
      pairId,
      left: blankDramaturgicalScores(),
      right: blankDramaturgicalScores(),
      preference: null,
      confidence: null,
      note: ''
    }))
  }))
  return {
    schemaVersion: 1,
    instructions: '两位独立评审者分别为左右文本的六项正向指标打 0–10 整数分，再记录偏好、置信度与简短诊断。',
    reviewerSlots
  }
}

const dramaturgicalReviewError = code => ({ valid: false, error: { code } })
const REVIEW_UNBLINDING_RE = /baseline|minimal-engine|full-vocabulary|condition|prompt|sourceRef|relationMode|provider|model|token|latency/i

export function validateDramaturgicalReviews(reviews, { pairIds = [] } = {}) {
  const knownPairIds = new Set(pairIds)
  const coverage = new Map(pairIds.map(pairId => [pairId, new Set()]))
  const reviewerPairKeys = new Set()
  const reviewerIds = new Set()

  for (const reviewer of Array.isArray(reviews) ? reviews : []) {
    if (!reviewer || typeof reviewer !== 'object' || Array.isArray(reviewer)
      || Object.keys(reviewer).some(key => !['reviewerId', 'scores'].includes(key))) {
      return dramaturgicalReviewError('CROSS_SECTION_DRAMATURGY_REVIEW_METADATA_REJECTED')
    }
    const reviewerId = reviewer.reviewerId
    if (typeof reviewerId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,31}$/i.test(reviewerId)) {
      return dramaturgicalReviewError('CROSS_SECTION_DRAMATURGY_REVIEWER_INVALID')
    }
    reviewerIds.add(reviewerId)
    if (!Array.isArray(reviewer.scores)) {
      return dramaturgicalReviewError('CROSS_SECTION_DRAMATURGY_REVIEW_COVERAGE_INCOMPLETE')
    }
    for (const score of reviewer.scores) {
      if (!score || typeof score !== 'object' || Array.isArray(score)
        || Object.keys(score).some(key => !['pairId', 'left', 'right', 'preference', 'confidence', 'note'].includes(key))) {
        return dramaturgicalReviewError('CROSS_SECTION_DRAMATURGY_REVIEW_METADATA_REJECTED')
      }
      if (!knownPairIds.has(score.pairId)) {
        return dramaturgicalReviewError('CROSS_SECTION_DRAMATURGY_REVIEW_PAIR_UNKNOWN')
      }
      const reviewerPairKey = `${reviewerId}\u0000${score.pairId}`
      if (reviewerPairKeys.has(reviewerPairKey)) {
        return dramaturgicalReviewError('CROSS_SECTION_DRAMATURGY_REVIEW_DUPLICATE_PAIR')
      }
      reviewerPairKeys.add(reviewerPairKey)
      for (const side of ['left', 'right']) {
        const sideScores = score[side]
        if (!sideScores || typeof sideScores !== 'object' || Array.isArray(sideScores)) {
          return dramaturgicalReviewError('CROSS_SECTION_DRAMATURGY_REVIEW_SCORES_INCOMPLETE')
        }
        const scoreKeys = Object.keys(sideScores)
        if (scoreKeys.some(key => !DRAMATURGICAL_SCORE_FIELDS.includes(key))) {
          return dramaturgicalReviewError('CROSS_SECTION_DRAMATURGY_REVIEW_METADATA_REJECTED')
        }
        for (const field of DRAMATURGICAL_SCORE_FIELDS) {
          if (!Object.prototype.hasOwnProperty.call(sideScores, field)) {
            return dramaturgicalReviewError('CROSS_SECTION_DRAMATURGY_REVIEW_SCORES_INCOMPLETE')
          }
          const value = sideScores[field]
          if (!Number.isInteger(value) || value < 0 || value > 10) {
            return dramaturgicalReviewError('CROSS_SECTION_DRAMATURGY_REVIEW_SCORE_INVALID')
          }
        }
      }
      if (!['left', 'right', 'tie'].includes(score.preference)) {
        return dramaturgicalReviewError('CROSS_SECTION_DRAMATURGY_REVIEW_PREFERENCE_INVALID')
      }
      if (!['low', 'medium', 'high'].includes(score.confidence)) {
        return dramaturgicalReviewError('CROSS_SECTION_DRAMATURGY_REVIEW_CONFIDENCE_INVALID')
      }
      if (typeof score.note !== 'string' || codePoints(score.note) > 500 || REVIEW_UNBLINDING_RE.test(score.note)) {
        return dramaturgicalReviewError('CROSS_SECTION_DRAMATURGY_REVIEW_NOTE_REJECTED')
      }
      coverage.get(score.pairId).add(reviewerId)
    }
  }

  if (reviewerIds.size < 2 || [...coverage.values()].some(reviewers => reviewers.size < 2)) {
    return dramaturgicalReviewError('CROSS_SECTION_DRAMATURGY_REVIEW_COVERAGE_INCOMPLETE')
  }
  return { valid: true, reviewerCount: reviewerIds.size }
}

export const fixtureDigestValue = fixtures => JSON.stringify(
  fixtures.map(({ id, minimalEngine, fullVocabulary, dramaturgicalGroundTruth }) => ({
    id,
    minimalEngine,
    fullVocabulary,
    dramaturgicalGroundTruth
  }))
)

export default {
  DRAMATURGICAL_CONDITIONS,
  DRAMATURGICAL_PROMPT_CONTRACT_VERSION,
  DRAMATURGICAL_RUNNER_CONTRACT_VERSION,
  DRAMATURGICAL_EVALUATOR_CONTRACT_VERSION,
  DRAMATURGICAL_AUTHORING_CONTRACT_VERSION,
  serializeMinimalEngine,
  serializeFullVocabulary,
  buildDramaturgicalConditionPrompt,
  expandDramaturgicalMatrix,
  runDramaturgicalCondition,
  generateDramaturgicalArtifacts,
  createDramaturgicalBlindPairs,
  buildDramaturgicalReviewTemplate,
  validateDramaturgicalReviews
}
