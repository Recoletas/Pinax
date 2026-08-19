/**
 * 极小关系包 A/B 实验库（Tasks 2-5）。
 *
 * 复用截面 bake-off 的 single-writer 边界：同一 system（buildFinalProseContract）、
 * 同一 common user（公开设定 + focus/exit/beat/length）与完整 fact/role 合同；
 * 唯一差异是 minimal-relation 在 user 末尾追加【活跃关系】块。
 * 不复制 provider/密钥路径；生成走注入的 provider.invoke。
 */
import { createHash } from 'node:crypto'
import * as nodeFs from 'node:fs/promises'
import { hostname as systemHostname } from 'node:os'
import { join } from 'node:path'
import { buildFinalProseContract, normalizeCrossSectionFinalProse, scanUnauthorizedFacts } from './novel-cross-section-bakeoff.mjs'
import { normalizeGenerationUsage } from '../../shared/generationToolContract.js'
import {
  CROSS_SECTION_RELATION_FIXTURES,
  validateCrossSectionRelationFixtures
} from '../fixtures/novel-cross-section-relation-fixtures.mjs'

export const RELATION_AB_CONDITIONS = Object.freeze(['baseline', 'minimal-relation'])
export const RELATION_AB_PROMPT_CONTRACT_VERSION = 'cross-section-relation-prompt.v1'
export const RELATION_AB_RUNNER_CONTRACT_VERSION = 'cross-section-relation-runner.v1'
export const RELATION_AB_EVALUATOR_CONTRACT_VERSION = 'cross-section-relation-evaluator.v1'
export const RELATION_AB_MAX_TOKENS = 1800
export const RELATION_AB_TEMPERATURE = 0.4

const codePoints = value => [...String(value || '')].length
const isText = value => typeof value === 'string' && value.trim().length > 0

export const DEFAULT_RELATION_AB_OUTPUT_ROOT = '/tmp/pinax-cross-section-relation-ab'

const relationError = (code, message, context = {}) => Object.assign(
  new Error(message),
  { code, ...context }
)

/* —— 与 bake-off 私有 formatter 保持逐字节一致的事实/角色序列化 —— */
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
 * Task 2：把活跃关系序列化为简洁语义行。
 * 只输出语义文本；不输出 sourceRef、评审说明或任何实验元数据。
 */
export function serializeMinimalRelationPack(fixture) {
  const lines = ['【活跃关系】']
  for (const relation of fixture.activeRelations) {
    const [first, second] = relation.pair
    lines.push(`- ${nameOf(fixture, first)} ↔ ${nameOf(fixture, second)}`)
    lines.push(`  关系：${relation.relationFrame}`)
    if (Array.isArray(relation.interactionCues) && relation.interactionCues.length > 0) {
      lines.push(`  互动：${relation.interactionCues.join('；')}`)
    }
    if (isText(relation.sharedAnchor)) lines.push(`  共同锚点：${relation.sharedAnchor}`)
    if (relation.openTension && isText(relation.openTension.text)) {
      lines.push(`  当前张力：${relation.openTension.text}`)
    }
  }
  return lines.join('\n')
}

/**
 * Task 2：按条件构建提示词。baseline 与 minimal-relation 共享字节一致的全部内容，
 * 差异仅为末尾追加的关系块；返回 prompt 指标（码点 + UTF-8 字节）。
 */
export function buildRelationConditionPrompt({ fixture, condition } = {}) {
  if (!RELATION_AB_CONDITIONS.includes(condition)) {
    throw relationError('CROSS_SECTION_RELATION_CONDITION_UNKNOWN', '未知实验条件', { condition })
  }
  const validation = validateCrossSectionRelationFixtures([fixture])
  if (!validation.valid) {
    throw relationError(
      validation.error.code,
      `关系 fixture 未通过验证：${validation.error.code}`,
      validation.error
    )
  }
  const system = buildFinalProseContract(fixture)
  const sharedUser = [commonFinalUserPrompt(fixture), fullRestrictions(fixture)].join('\n\n')
  const relationBlock = condition === 'minimal-relation' ? serializeMinimalRelationPack(fixture) : ''
  const user = relationBlock ? `${sharedUser}\n\n${relationBlock}` : sharedUser
  return {
    system,
    user,
    maxTokens: RELATION_AB_MAX_TOKENS,
    temperature: RELATION_AB_TEMPERATURE,
    promptMetrics: {
      promptChars: codePoints(system + user),
      promptBytes: Buffer.byteLength(system + user, 'utf8'),
      relationChars: codePoints(relationBlock)
    }
  }
}

/* ============================================================================
 * Task 3：分阶段矩阵、条件执行与可恢复工件生成
 * ========================================================================== */

const sha256Hex = value => createHash('sha256').update(String(value)).digest('hex')

export function expandRelationAbMatrix({
  fixtures = CROSS_SECTION_RELATION_FIXTURES,
  conditions = RELATION_AB_CONDITIONS,
  repetitions = 2
} = {}) {
  if (!Number.isInteger(repetitions) || repetitions < 2 || repetitions > 3) {
    throw relationError('CROSS_SECTION_RELATION_REPETITIONS_INVALID', 'repetitions 只允许 2 或 3')
  }
  const normalized = [...conditions].sort()
  if (normalized.join('|') !== [...RELATION_AB_CONDITIONS].sort().join('|')) {
    throw relationError('CROSS_SECTION_RELATION_CONDITION_UNKNOWN', '实验条件只能是 baseline 与 minimal-relation')
  }
  // fixture 主序、repetition 次序、condition 末序 —— 匹配对在私有工件中相邻
  const attempts = []
  for (const fixture of fixtures) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      for (const condition of RELATION_AB_CONDITIONS) {
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
    pairCount: attempts.length / 2,
    fixtureIds: fixtures.map(({ id }) => id),
    conditions: [...RELATION_AB_CONDITIONS],
    repetitions,
    worstCaseProviderCalls: attempts.length,
    promptContractVersion: RELATION_AB_PROMPT_CONTRACT_VERSION,
    runnerContractVersion: RELATION_AB_RUNNER_CONTRACT_VERSION
  }
}

/**
 * Task 3：执行单个条件尝试。provider.invoke 恰好一次；
 * 失败保留 condition 于返回值（调用方只写入私有工件）。
 */
export async function runRelationCondition({
  fixture,
  condition,
  repetition,
  provider,
  runId,
  now = () => Date.now()
} = {}) {
  const attemptRunId = String(runId || `${fixture.id}-${condition}-r${repetition}`)
  const startedAt = now()
  const base = {
    runId: attemptRunId,
    fixtureId: fixture.id,
    repetition,
    condition,
    latencyMs: 0
  }
  let prompt
  try {
    prompt = buildRelationConditionPrompt({ fixture, condition })
  } catch (error) {
    return { ...base, status: 'failed', error: { code: error.code, message: error.message } }
  }
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
      usage: normalizeGenerationUsage(result?.usage || {}),
      latencyMs: Math.max(0, now() - startedAt),
      promptMetrics: prompt.promptMetrics,
      unauthorizedFactEvents: scan.leaks,
      needsHumanInformationReview: scan.needsHumanReview,
      disclosures: scan.disclosures,
      relationProvenance: {
        condition,
        relations: fixture.activeRelations.map(relation => ({
          pair: relation.pair,
          relationFrame: relation.relationFrame,
          sourceRef: relation.openTension?.sourceRef || null
        })),
        relationSources: fixture.relationSources
      }
    }
  } catch (error) {
    return {
      ...base,
      status: 'failed',
      error: { code: String(error?.code || 'CROSS_SECTION_RELATION_RUN_FAILED'), message: String(error?.message || '关系 A/B 运行失败') },
      latencyMs: Math.max(0, now() - startedAt),
      promptMetrics: prompt.promptMetrics,
      relationProvenance: { condition, relations: fixture.activeRelations.map(r => ({ pair: r.pair })) }
    }
  }
}

const fingerprintOf = ({ fixtures, providerConfig }) => ({
  promptContractVersion: RELATION_AB_PROMPT_CONTRACT_VERSION,
  runnerContractVersion: RELATION_AB_RUNNER_CONTRACT_VERSION,
  evaluatorContractVersion: RELATION_AB_EVALUATOR_CONTRACT_VERSION,
  fixtureFingerprint: sha256Hex(JSON.stringify(
    fixtures.map(({ id, activeRelations, relationSources }) => ({ id, activeRelations, relationSources }))
  )).slice(0, 16),
  providerFingerprint: sha256Hex(JSON.stringify({
    provider: providerConfig.provider,
    model: providerConfig.model,
    baseUrl: providerConfig.baseUrl || '',
    format: providerConfig.format || ''
  })).slice(0, 16)
})

const manifestComparable = manifest => JSON.stringify({
  fixtureIds: manifest.fixtureIds,
  repetitions: manifest.repetitions,
  fingerprint: manifest.fingerprint,
  provider: manifest.provider
})

const timestampSlug = date => date.toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z')

/**
 * Task 3：原子、可恢复的工件生成。Stage 1 = repetitions 2（或显式 3）；
 * stage 2 只允许在已完成的 2-repetition 运行上追加第 3 次重复。
 * manifest 只含 provider id/model；提示词、条件与 provenance 只进 private-runs.jsonl。
 */
export async function generateRelationAbArtifacts(options = {}) {
  const fs = options.fs || nodeFs
  const fixtures = options.fixtures || CROSS_SECTION_RELATION_FIXTURES
  const validation = validateCrossSectionRelationFixtures(fixtures)
  if (!validation.valid) {
    throw relationError(validation.error.code, `关系 fixture 未通过验证：${validation.error.code}`, validation.error)
  }
  const providerConfig = options.providerConfig
  if (!providerConfig?.provider || !providerConfig?.model) {
    throw relationError('CROSS_SECTION_RELATION_PROVIDER_CONFIG_INVALID', 'provider/model 配置不完整')
  }
  if (!options.provider?.invoke) {
    throw relationError('CROSS_SECTION_RELATION_PROVIDER_INVALID', '缺少 provider 执行边界')
  }
  const stage = options.stage === 2 ? 2 : 1
  const outputRoot = options.outputRoot || DEFAULT_RELATION_AB_OUTPUT_ROOT
  const createdDate = new Date((options.now ? options.now() : Date.now()))
  const experimentRunId = String(options.experimentRunId || (stage === 2 ? '' : timestampSlug(createdDate)))
  const runDir = options.runDir || join(outputRoot, experimentRunId)
  const manifestPath = join(runDir, 'manifest.json')
  const privateRunsPath = join(runDir, 'private-runs.jsonl')

  const fingerprint = fingerprintOf({ fixtures, providerConfig })
  const baseManifest = {
    schemaVersion: 1,
    experiment: 'minimal-relation-ab',
    status: 'in-progress',
    experimentRunId: stage === 2 ? undefined : experimentRunId,
    stage,
    provider: { provider: providerConfig.provider, model: providerConfig.model },
    options: {
      repetitions: 0,
      maxTokens: RELATION_AB_MAX_TOKENS,
      temperature: RELATION_AB_TEMPERATURE
    },
    fixtureIds: fixtures.map(({ id }) => id),
    matrixRunIds: [],
    fingerprint,
    createdAt: createdDate.toISOString(),
    privateBlindMap: {}
  }

  const readOptional = async path => {
    try { return await fs.readFile(path, 'utf8') } catch { return null }
  }
  const writeJson = async (path, value) => {
    const tmp = `${path}.tmp`
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
    await fs.rename(tmp, path)
  }

  await fs.mkdir(runDir, { recursive: true })
  const existingRaw = await readOptional(manifestPath)
  let manifest
  let repetitions
  if (existingRaw === null) {
    if (stage === 2) {
      throw relationError('CROSS_SECTION_RELATION_STAGE2_REQUIRES_STAGE1', 'Stage 2 需要已完成的 Stage 1 run 目录', { runDir })
    }
    repetitions = Number(options.repetitions || 2)
    if (repetitions !== 2 && repetitions !== 3) {
      throw relationError('CROSS_SECTION_RELATION_REPETITIONS_INVALID', 'repetitions 只允许 2 或 3')
    }
    manifest = { ...baseManifest, repetitions, options: { ...baseManifest.options, repetitions } }
  } else {
    manifest = JSON.parse(existingRaw)
    if (stage === 2) {
      if (manifest.options.repetitions !== 2 || manifest.status !== 'complete') {
        throw relationError('CROSS_SECTION_RELATION_STAGE2_REQUIRES_STAGE1', 'Stage 2 只能追加在已完成的 2-repetition Stage 1 之上', { runDir })
      }
      repetitions = 3
      manifest = { ...manifest, stage: 2, status: 'in-progress', repetitions: 3, options: { ...manifest.options, repetitions: 3 } }
    } else {
      repetitions = Number(options.repetitions || manifest.options.repetitions || 2)
      if (repetitions !== manifest.options.repetitions) {
        // 已完成的矩阵不允许静默扩展；第 3 次重复只能走显式 Stage 2
        throw relationError('CROSS_SECTION_RELATION_RESUME_MISMATCH', '恢复参数与现有 manifest 指纹不一致')
      }
      manifest = { ...manifest, status: 'in-progress', repetitions, options: { ...manifest.options, repetitions } }
    }
    if (manifestComparable(manifest) !== manifestComparable({
      fixtureIds: baseManifest.fixtureIds,
      repetitions,
      fingerprint,
      provider: baseManifest.provider
    })) {
      throw relationError('CROSS_SECTION_RELATION_RESUME_MISMATCH', '恢复参数与现有 manifest 指纹不一致')
    }
  }

  const matrix = expandRelationAbMatrix({ fixtures, repetitions })
  manifest.matrixRunIds = matrix.attempts.map(({ runId }) => runId)

  const existingPrivateRaw = await readOptional(privateRunsPath)
  const completedRunIds = new Set()
  if (existingPrivateRaw) {
    for (const line of existingPrivateRaw.trim().split('\n')) {
      if (!line.trim()) continue
      completedRunIds.add(JSON.parse(line).runId)
    }
  }

  const now = options.now || (() => Date.now())
  for (const attempt of matrix.attempts) {
    if (completedRunIds.has(attempt.runId)) continue
    const fixture = fixtures.find(({ id }) => id === attempt.fixtureId)
    const run = await runRelationCondition({
      fixture,
      condition: attempt.condition,
      repetition: attempt.repetition,
      runId: attempt.runId,
      provider: options.provider,
      now
    })
    const privateRecord = {
      runId: run.runId,
      fixtureId: run.fixtureId,
      repetition: run.repetition,
      condition: run.condition,
      status: run.status,
      readableText: run.readableText || '',
      error: run.error || null,
      usage: run.usage || null,
      latencyMs: run.latencyMs ?? 0,
      promptMetrics: run.promptMetrics || null,
      unauthorizedFactEvents: run.unauthorizedFactEvents || [],
      needsHumanInformationReview: run.needsHumanInformationReview || [],
      relationProvenance: run.relationProvenance || null
    }
    await fs.appendFile(privateRunsPath, `${JSON.stringify(privateRecord)}\n`, 'utf8')
  }

  const finalPrivateRaw = await readOptional(privateRunsPath)
  const finalRunIds = new Set((finalPrivateRaw || '').trim().split('\n').filter(Boolean).map(line => JSON.parse(line).runId))
  const allComplete = matrix.attempts.every(({ runId }) => finalRunIds.has(runId))
  manifest.status = allComplete ? 'complete' : 'in-progress'
  await writeJson(manifestPath, manifest)
  return runDir
}

/* ============================================================================
 * Task 4：同 fixture 盲评对与审校校验
 * ========================================================================== */

const seededRandom = seedText => {
  let state = Number.parseInt(sha256Hex(seedText).slice(0, 8), 16) || 0x9e3779b9
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x100000000
  }
}

const RELATION_SCORE_FIELDS = Object.freeze([
  'relationshipAuthenticity',
  'causalMotivation',
  'fakeSuspense',
  'literaryUsability'
])

/**
 * Task 4：把成功运行组成同 fixture 盲评对。
 * 公共 bundle 不含 condition、提示词、sourceRef 或任何实验元数据；
 * { includePrivate: true } 时额外返回 privateBlindMap（只允许写入私有工件）。
 */
export function createRelationBlindPairs(runs, { seed = 'relation-ab', includePrivate = false } = {}) {
  const fixtureById = new Map(CROSS_SECTION_RELATION_FIXTURES.map(fixture => [fixture.id, fixture]))
  const groups = new Map()
  for (const run of runs) {
    if (run?.status !== 'success') continue
    const key = `${run.fixtureId}|${run.repetition}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(run)
  }

  const pairs = []
  const incompletePairs = []
  const privateBlindMap = {}
  const expectedGroups = new Set()
  for (const fixture of CROSS_SECTION_RELATION_FIXTURES) {
    for (const repetition of [1, 2, 3]) expectedGroups.add(`${fixture.id}|${repetition}`)
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => {
    const [fa, ra] = a.split('|')
    const [fb, rb] = b.split('|')
    return fa.localeCompare(fb) || Number(ra) - Number(rb)
  })
  for (const key of sortedKeys) {
    const group = groups.get(key)
    const [fixtureId, repetitionText] = key.split('|')
    const repetition = Number(repetitionText)
    const byCondition = {}
    for (const run of group) byCondition[run.condition] = run
    const baseline = byCondition.baseline
    const minimal = byCondition['minimal-relation']
    if (!baseline || !minimal) {
      incompletePairs.push({
        fixtureId,
        repetition,
        code: 'CROSS_SECTION_RELATION_PAIR_INCOMPLETE',
        missingConditions: [!baseline && 'baseline', !minimal && 'minimal-relation'].filter(Boolean)
      })
      continue
    }
    const fixture = fixtureById.get(fixtureId)
    const random = seededRandom(`${seed}|${key}`)
    const minimalFirst = random() < 0.5
    const first = minimalFirst ? minimal : baseline
    const second = minimalFirst ? baseline : minimal
    const blindPairId = `bp_${sha256Hex(`${seed}|${key}|pair`).slice(0, 10)}`
    const leftId = `bo_${sha256Hex(`${seed}|${first.runId}`).slice(0, 10)}`
    const rightId = `bo_${sha256Hex(`${seed}|${second.runId}`).slice(0, 10)}`
    privateBlindMap[leftId] = { runId: first.runId, condition: first.condition }
    privateBlindMap[rightId] = { runId: second.runId, condition: second.condition }
    pairs.push({
      blindPairId,
      fixtureId,
      fixtureTitle: fixture.title,
      publicFacts: fixture.facts.filter(({ visibility }) => visibility === 'public').map(({ text }) => text),
      focusProp: fixture.focusProp,
      relationshipGroundTruth: fixture.relationshipGroundTruth,
      left: { blindOutputId: leftId, text: String(first.readableText || '') },
      right: { blindOutputId: rightId, text: String(second.readableText || '') }
    })
  }

  const bundle = { pairs, incompletePairs }
  if (includePrivate) bundle.privateBlindMap = privateBlindMap
  return bundle
}

/** Task 4：审校模板（空分数 + 成对偏好）。 */
export function buildRelationReviewTemplate(bundle) {
  return {
    schemaVersion: 1,
    instructions: '对每对文本分别打 0-10 分（fakeSuspense 为严重度，越低越好），再给出 left/right/tie 偏好与置信度。',
    reviewPairs: bundle.pairs.map(pair => ({
      blindPairId: pair.blindPairId,
      left: { ...Object.fromEntries(RELATION_SCORE_FIELDS.map(field => [field, null])) },
      right: { ...Object.fromEntries(RELATION_SCORE_FIELDS.map(field => [field, null])) },
      preference: null,
      confidence: null,
      note: ''
    }))
  }
}

const reviewError = code => ({ valid: false, error: { code } })

/** Task 4：严格审校校验（不含任何评审者身份元数据）。 */
export function validateRelationReviews(reviews, { blindPairIds = [] } = {}) {
  const knownIds = new Set(blindPairIds)
  const CONDITION_LABEL_RE = /baseline|minimal-relation|condition/i
  for (const reviewer of Array.isArray(reviews) ? reviews : []) {
    const reviewerId = reviewer?.reviewerId
    if (typeof reviewerId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,31}$/i.test(reviewerId)) {
      return reviewError('CROSS_SECTION_RELATION_REVIEWER_INVALID')
    }
    const extraKeys = Object.keys(reviewer).filter(key => !['reviewerId', 'scores'].includes(key))
    if (extraKeys.length > 0) return reviewError('CROSS_SECTION_RELATION_REVIEWER_METADATA_REJECTED')
    if (!Array.isArray(reviewer.scores)) {
      return reviewError('CROSS_SECTION_RELATION_REVIEW_PAIRS_INCOMPLETE')
    }
    const seen = new Set()
    for (const score of reviewer.scores) {
      if (!knownIds.has(score?.blindPairId)) return reviewError('CROSS_SECTION_RELATION_REVIEW_PAIR_UNKNOWN')
      if (seen.has(score.blindPairId)) return reviewError('CROSS_SECTION_RELATION_REVIEW_DUPLICATE_PAIR')
      seen.add(score.blindPairId)
      for (const side of ['left', 'right']) {
        const sideScores = score?.[side]
        for (const field of RELATION_SCORE_FIELDS) {
          const value = sideScores?.[field]
          if (!Number.isInteger(value)) return reviewError('CROSS_SECTION_RELATION_REVIEW_SCORES_INCOMPLETE')
          if (value < 0 || value > 10) return reviewError('CROSS_SECTION_RELATION_REVIEW_SCORE_INVALID')
        }
      }
      if (!['left', 'right', 'tie'].includes(score?.preference)) {
        return reviewError('CROSS_SECTION_RELATION_REVIEW_PREFERENCE_INVALID')
      }
      if (!['low', 'medium', 'high'].includes(score?.confidence)) {
        return reviewError('CROSS_SECTION_RELATION_REVIEW_CONFIDENCE_INVALID')
      }
      if (typeof score?.note !== 'string' || CONDITION_LABEL_RE.test(score.note || '')) {
        return reviewError('CROSS_SECTION_RELATION_REVIEW_NOTE_REJECTED')
      }
    }
    if (seen.size !== knownIds.size) {
      return reviewError('CROSS_SECTION_RELATION_REVIEW_PAIRS_INCOMPLETE')
    }
  }
  return { valid: true, reviewerCount: (reviews || []).length }
}

/* ============================================================================
 * Task 5：配对聚合与决策门（探索性结果，不做显著性声明）
 * ========================================================================== */

const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const round1 = value => Math.round(value * 10) / 10

/**
 * Task 5：聚合盲评与运行指标，输出探索性决策。
 * 只在聚合期间解盲；不产生 p 值、显著性或"获胜架构"表述。
 */
export function aggregateRelationAbReport({ runs, reviews, manifest, blindPairs, privateBlindMap } = {}) {
  if (!Array.isArray(runs) || runs.length === 0 || !manifest || !blindPairs || !privateBlindMap) {
    return { decision: 'invalid-experiment', reason: 'CROSS_SECTION_RELATION_INPUT_INVALID', metrics: null }
  }
  if (manifest.fingerprint?.promptContractVersion !== RELATION_AB_PROMPT_CONTRACT_VERSION) {
    return { decision: 'invalid-experiment', reason: 'CROSS_SECTION_RELATION_CONTRACT_MISMATCH', metrics: null }
  }
  const repetitions = Number(manifest.repetitions || manifest.options?.repetitions || 2)
  if (![2, 3].includes(repetitions)) {
    return { decision: 'invalid-experiment', reason: 'CROSS_SECTION_RELATION_REPETITIONS_INVALID', metrics: null }
  }
  const expectedPairs = CROSS_SECTION_RELATION_FIXTURES.length * repetitions
  const successfulRuns = runs.filter(run => run.status === 'success')
  if (successfulRuns.length !== expectedPairs * 2 || blindPairs.pairs.length !== expectedPairs) {
    return { decision: 'invalid-experiment', reason: 'CROSS_SECTION_RELATION_PAIRS_INCOMPLETE', metrics: null }
  }
  const reviewValidation = validateRelationReviews(reviews, {
    blindPairIds: blindPairs.pairs.map(pair => pair.blindPairId)
  })
  if (!reviewValidation.valid) {
    return { decision: 'invalid-experiment', reason: reviewValidation.error.code, metrics: null }
  }

  const conditionOf = blindOutputId => privateBlindMap[blindOutputId]?.condition || null
  const runByRunId = new Map(successfulRuns.map(run => [run.runId, run]))
  const dimensions = ['relationshipAuthenticity', 'causalMotivation', 'literaryUsability']
  const fixtureDeltas = new Map(CROSS_SECTION_RELATION_FIXTURES.map(({ id }) => [id, {
    relationshipAuthenticity: [],
    causalMotivation: [],
    literaryUsability: [],
    fakeSuspenseSeverity: []
  }]))
  const preferenceCounts = { baseline: 0, 'minimal-relation': 0, tie: 0 }

  for (const reviewer of reviews) {
    for (const score of reviewer.scores) {
      const pair = blindPairs.pairs.find(candidate => candidate.blindPairId === score.blindPairId)
      const fixture = fixtureDeltas.get(pair.fixtureId)
      const leftCondition = conditionOf(pair.left.blindOutputId)
      const rightCondition = conditionOf(pair.right.blindOutputId)
      if (!leftCondition || !rightCondition || leftCondition === rightCondition) {
        return { decision: 'invalid-experiment', reason: 'CROSS_SECTION_RELATION_BLIND_MAP_INVALID', metrics: null }
      }
      const sideByCondition = { [leftCondition]: 'left', [rightCondition]: 'right' }
      for (const dimension of dimensions) {
        const minimalValue = score[sideByCondition['minimal-relation']][dimension]
        const baselineValue = score[sideByCondition.baseline][dimension]
        fixture[dimension].push(minimalValue - baselineValue)
      }
      // fakeSuspense 为严重度：改善 = baseline - minimal
      const suspenseMinimal = score[sideByCondition['minimal-relation']].fakeSuspense
      const suspenseBaseline = score[sideByCondition.baseline].fakeSuspense
      fixture.fakeSuspenseSeverity.push(suspenseBaseline - suspenseMinimal)
      if (score.preference === 'tie') preferenceCounts.tie += 1
      else preferenceCounts[conditionOf(pair[score.preference].blindOutputId)] += 1
    }
  }

  const perFixture = {}
  const overallPools = { relationshipAuthenticity: [], causalMotivation: [], literaryUsability: [], fakeSuspenseSeverity: [] }
  for (const [fixtureId, pools] of fixtureDeltas.entries()) {
    perFixture[fixtureId] = {}
    for (const key of [...dimensions, 'fakeSuspenseSeverity']) {
      const value = round1(median(pools[key]))
      perFixture[fixtureId][key] = value
      overallPools[key].push(...pools[key])
    }
  }
  const overallMedianDeltas = {}
  for (const key of Object.keys(overallPools)) {
    overallMedianDeltas[key] = round1(median(overallPools[key]))
  }

  const sum = values => values.reduce((total, value) => total + value, 0)
  const baselineRuns = successfulRuns.filter(run => run.condition === 'baseline')
  const minimalRuns = successfulRuns.filter(run => run.condition === 'minimal-relation')
  const leakage = {
    baseline: sum(baselineRuns.map(run => (run.unauthorizedFactEvents || []).length)),
    minimalRelation: sum(minimalRuns.map(run => (run.unauthorizedFactEvents || []).length))
  }
  const metrics = {
    exploratory: true,
    overallMedianDeltas,
    perFixture,
    preferenceCounts,
    completion: { baseline: baselineRuns.length, minimalRelation: minimalRuns.length, expected: expectedPairs },
    leakage,
    operations: {
      inputTokens: { baseline: sum(baselineRuns.map(r => r.usage?.inputTokens || 0)), minimalRelation: sum(minimalRuns.map(r => r.usage?.inputTokens || 0)) },
      outputTokens: { baseline: sum(baselineRuns.map(r => r.usage?.outputTokens || 0)), minimalRelation: sum(minimalRuns.map(r => r.usage?.outputTokens || 0)) },
      latencyMsMedian: { baseline: round1(median(baselineRuns.map(r => r.latencyMs || 0))), minimalRelation: round1(median(minimalRuns.map(r => r.latencyMs || 0))) },
      promptCharsMedian: { baseline: round1(median(baselineRuns.map(r => r.promptMetrics?.promptChars || 0))), minimalRelation: round1(median(minimalRuns.map(r => r.promptMetrics?.promptChars || 0))) },
      relationCharsMax: Math.max(0, ...minimalRuns.map(r => r.promptMetrics?.relationChars || 0))
    },
    reviewerCount: reviews.length,
    repetitions
  }

  // —— 决策门（顺序：安全/文学 → 支持 → 加重复 → 保留） ——
  const gateResults = {
    attemptsComplete: metrics.completion.baseline === expectedPairs && metrics.completion.minimalRelation === expectedPairs,
    relationshipAuthenticityGate: overallMedianDeltas.relationshipAuthenticity >= 1.0
      && Object.values(perFixture).filter(f => f.relationshipAuthenticity > 0).length >= 3,
    causalMotivationGate: overallMedianDeltas.causalMotivation >= 1.0
      && Object.values(perFixture).filter(f => f.causalMotivation > 0).length >= 3,
    literaryUsabilityGate: overallMedianDeltas.literaryUsability >= -0.5
      && !Object.values(perFixture).some(f => f.literaryUsability < -1.0),
    leakageGate: leakage.minimalRelation <= leakage.baseline,
    promptEconomyGate: metrics.operations.relationCharsMax <= 400,
    fakeSuspenseDiagnostic: { improvedByAtLeast1: overallMedianDeltas.fakeSuspenseSeverity >= 1.0, gating: false }
  }

  let decision
  if (!gateResults.literaryUsabilityGate || !gateResults.leakageGate || !gateResults.promptEconomyGate) {
    decision = 'minimal-relation-rejected'
  } else if (gateResults.relationshipAuthenticityGate && gateResults.causalMotivationGate) {
    decision = reviews.length >= 2 ? 'minimal-relation-supported' : 'reviewer-confirmation-required'
  } else if (
    overallMedianDeltas.relationshipAuthenticity > 0
    && overallMedianDeltas.causalMotivation > 0
    && Object.values(perFixture).filter(f => f.relationshipAuthenticity > 0).length >= 2
    && Object.values(perFixture).filter(f => f.causalMotivation > 0).length >= 2
    && repetitions === 2
  ) {
    decision = 'inconclusive-add-repetition'
  } else {
    decision = 'baseline-retained'
  }

  return {
    decision,
    exploratory: true,
    gateResults,
    metrics,
    limitations: [
      '单一 provider/模型、四个预填 fixture 的小样本探索性结果',
      '预填关系不测量真实用户的录入耗时',
      '未实现任何产品能力或 UI'
    ]
  }
}

/** Task 5：人类可读决策记录（不输出显著性表述）。 */
export function renderRelationDecisionMarkdown(report, meta = {}) {
  if (!report || !report.metrics) {
    return `# 最小关系包 A/B 决策\n\n决策：${report?.decision || 'invalid-experiment'}\n`
  }
  const m = report.metrics
  const lines = [
    '# 最小关系包 A/B 决策（探索性）',
    '',
    `- 决策：**${report.decision}**`,
    `- 提交：${meta.commit || '未记录'}`,
    `- Provider/模型：${meta.provider || ''}${meta.model || ''}`,
    `- 完成尝试：baseline ${m.completion.baseline}/${m.completion.expected} · minimal-relation ${m.completion.minimalRelation}/${m.completion.expected}（${m.repetitions} 次重复）`,
    `- 评审者：${m.reviewerCount}（盲评；聚合期才解盲）`,
    '',
    '## 按 fixture 的配对中位差（minimal − baseline）',
    '',
    '| fixture | 关系真实感 | 因果动机 | 可用性 | 悬念严重度改善 |',
    '|---|---:|---:|---:|---:|'
  ]
  for (const [fixtureId, fixture] of Object.entries(m.perFixture)) {
    lines.push(`| ${fixtureId} | ${fixture.relationshipAuthenticity} | ${fixture.causalMotivation} | ${fixture.literaryUsability} | ${fixture.fakeSuspenseSeverity} |`)
  }
  lines.push(
    '',
    `总体中位差：真实感 ${m.overallMedianDeltas.relationshipAuthenticity} · 动机 ${m.overallMedianDeltas.causalMotivation} · 可用性 ${m.overallMedianDeltas.literaryUsability} · 悬念改善 ${m.overallMedianDeltas.fakeSuspenseSeverity}`,
    `偏好计数：baseline ${m.preferenceCounts.baseline} · minimal-relation ${m.preferenceCounts['minimal-relation']} · tie ${m.preferenceCounts.tie}`,
    `确定性泄漏事件：baseline ${m.leakage.baseline} · minimal-relation ${m.leakage.minimalRelation}`,
    `运营：输入 token ${m.operations.inputTokens.baseline}/${m.operations.inputTokens.minimalRelation} · 输出 token ${m.operations.outputTokens.baseline}/${m.operations.outputTokens.minimalRelation} · 中位延迟 ${m.operations.latencyMsMedian.baseline}/${m.operations.latencyMsMedian.minimalRelation}ms · 关系块最大 ${m.operations.relationCharsMax} 字`,
    '',
    '## 决策门',
    ...Object.entries(report.gateResults).map(([gate, value]) => (
      `- ${gate}: ${typeof value === 'object' ? JSON.stringify(value) : value}`
    )),
    '',
    '## 局限',
    ...report.limitations.map(item => `- ${item}`),
    '- 本记录只呈现探索性配对证据，不做统计显著性声明',
    '- 未实现产品能力；后续需要单独的产品设计/spec'
  )
  return lines.join('\n')
}

export default {
  RELATION_AB_CONDITIONS,
  RELATION_AB_PROMPT_CONTRACT_VERSION,
  RELATION_AB_RUNNER_CONTRACT_VERSION,
  RELATION_AB_EVALUATOR_CONTRACT_VERSION,
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
}
