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
export const RELATION_AB_TEMPERATURE = 0.7

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
  providerFingerprint: sha256Hex(`${providerConfig.provider}|${providerConfig.model}`).slice(0, 16)
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

export default {
  RELATION_AB_CONDITIONS,
  RELATION_AB_PROMPT_CONTRACT_VERSION,
  RELATION_AB_RUNNER_CONTRACT_VERSION,
  RELATION_AB_EVALUATOR_CONTRACT_VERSION,
  serializeMinimalRelationPack,
  buildRelationConditionPrompt,
  expandRelationAbMatrix,
  runRelationCondition,
  generateRelationAbArtifacts
}
