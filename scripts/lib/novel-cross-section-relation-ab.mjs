/**
 * 极小关系包 A/B 实验库（Tasks 2-5）。
 *
 * 复用截面 bake-off 的 single-writer 边界：同一 system（buildFinalProseContract）、
 * 同一 common user（公开设定 + focus/exit/beat/length）与完整 fact/role 合同；
 * 唯一差异是 minimal-relation 在 user 末尾追加【活跃关系】块。
 * 不复制 provider/密钥路径；生成走注入的 provider.invoke。
 */
import { buildFinalProseContract, normalizeCrossSectionFinalProse, scanUnauthorizedFacts } from './novel-cross-section-bakeoff.mjs'
import { validateCrossSectionRelationFixtures } from '../fixtures/novel-cross-section-relation-fixtures.mjs'

export const RELATION_AB_CONDITIONS = Object.freeze(['baseline', 'minimal-relation'])
export const RELATION_AB_PROMPT_CONTRACT_VERSION = 'cross-section-relation-prompt.v1'
export const RELATION_AB_RUNNER_CONTRACT_VERSION = 'cross-section-relation-runner.v1'
export const RELATION_AB_EVALUATOR_CONTRACT_VERSION = 'cross-section-relation-evaluator.v1'
export const RELATION_AB_MAX_TOKENS = 1800
export const RELATION_AB_TEMPERATURE = 0.7

const codePoints = value => [...String(value || '')].length
const isText = value => typeof value === 'string' && value.trim().length > 0

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

export default {
  RELATION_AB_CONDITIONS,
  RELATION_AB_PROMPT_CONTRACT_VERSION,
  RELATION_AB_RUNNER_CONTRACT_VERSION,
  RELATION_AB_EVALUATOR_CONTRACT_VERSION,
  serializeMinimalRelationPack,
  buildRelationConditionPrompt
}
