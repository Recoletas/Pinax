/**
 * 戏剧极小引擎消融实验库（Tasks 2-7）。
 *
 * 三条件共享 single-writer 基底（system=buildFinalProseContract、公开设定、
 * focus/exit/beat/length、完整 fact/role 合同、可选关系块）；
 * 唯一差异是追加的戏剧块：S1 四问 / S1+S2 冗余词表。
 * 与 relation-ab 一致地复制 bake-off 私有 formatter（保持字节一致，不做提取）。
 */
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
  runDramaturgicalCondition
}
