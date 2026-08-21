import { normalizeGenerationUsage } from '../../shared/generationToolContract.js'
import {
  normalizeCrossSectionFinalProse,
  scanUnauthorizedFacts
} from './novel-cross-section-bakeoff.mjs'
import { serializeMinimalRelationPack } from './novel-cross-section-relation-ab.mjs'
import { CROSS_SECTION_RELATION_FIXTURES } from '../fixtures/novel-cross-section-relation-fixtures.mjs'
import { validateDramaturgicalFixtures } from '../fixtures/novel-cross-section-dramaturgical-fixtures.mjs'

export const AUTHENTICITY_EDITOR_CONTRACT_VERSION = 'cross-section-authenticity-editor.v1'
export const AUTHENTICITY_EDITOR_MAX_FINDINGS = 3
export const AUTHENTICITY_EDITOR_MAX_TOKENS = 1400

const FINDING_TYPES = new Set([
  'relation-detail',
  'repeated-inference',
  'empty-mystery',
  'explanatory-metaphor'
])

const editorError = (code, message, context = {}) => Object.assign(new Error(message), { code, ...context })
const text = value => typeof value === 'string' ? value.trim() : ''

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

const relationFixtureFor = fixture => CROSS_SECTION_RELATION_FIXTURES.find(({ id }) => id === fixture.id)

const AUTHENTICITY_SIGNAL_PATTERNS = Object.freeze([
  ['dash-reveal', /[^。！？\n]*唯独[^。！？\n]*——[^。！？\n]*[。！？]?/g],
  ['explanatory-metaphor', /[^。！？\n]*(?:像|仿佛|好像)[^。！？\n]*(?:没说完的话|还在响的词|关上的门)[^。！？\n]*[。！？]?/g],
  ['knife-metaphor', /[^。！？\n]*替[^。！？\n]{0,12}把刀递给[^。！？\n]*[。！？]?/g]
])

const detectAuthenticitySignals = value => AUTHENTICITY_SIGNAL_PATTERNS.flatMap(([type, pattern]) => (
  [...String(value || '').matchAll(pattern)].map(match => ({ type, text: match[0] }))
))

export function buildAuthenticityEditorPrompt({ fixture, draftText } = {}) {
  const validation = validateDramaturgicalFixtures([fixture])
  if (!validation.valid) {
    throw editorError(validation.error.code, '真实性编辑 fixture 未通过验证', validation.error)
  }
  if (!text(draftText)) {
    throw editorError('CROSS_SECTION_AUTHENTICITY_DRAFT_REQUIRED', '真实性编辑缺少原始正文')
  }
  const relationFixture = relationFixtureFor(fixture)
  if (!relationFixture) {
    throw editorError('CROSS_SECTION_AUTHENTICITY_RELATION_REQUIRED', '真实性编辑缺少关系材料')
  }
  const requiredSignals = detectAuthenticitySignals(draftText)
  return {
    system: [
      '你是中文小说的局部真实性编辑，不是续写者。',
      '保留事件、人物选择、退出点、角色口吻和 Pinax markers；只做能逐字定位的局部替换。',
      '只输出严格 JSON，不要代码围栏、解释或额外字段。'
    ].join('\n'),
    user: [
      '【角色合同】',
      ...fixture.characters.map(roleContract),
      '【事实边界】',
      ...fixture.facts.map(labelledFact),
      serializeMinimalRelationPack(relationFixture),
      '关系提示不是逐项写入任务；只采用原稿中有自然落点的部分。没有提供真实姓名时，不得写“叫出全名”；对白没有出现某个词时，不得声称人物在该词上改变语速。',
      '【只检查四类问题】',
      '1. 关系没有落实为动作、称呼、打断、回避、照顾或拒绝。',
      '2. 推断或结论被旁白重复解释。',
      '3. 无兑现的神秘句、格言句或破折号顿悟。',
      '4. 比喻只是在替人物解释心理。',
      '【必须优先处理的已确认信号】',
      ...(requiredSignals.length
        ? requiredSignals.map(signal => `- ${signal.type}：${signal.text}`)
        : ['- 无']),
      `最多 ${AUTHENTICITY_EDITOR_MAX_FINDINGS} 处；没有可靠改法就 unchanged。不得整篇重写。`,
      '每个 sourceText 必须逐字取自原稿且只出现一次；replacementText 是它的完整替换。',
      'editedText 必须等于按 findings 顺序完成替换后的全文。',
      'schema={status:"unchanged"|"edited",findings:[{type:"relation-detail"|"repeated-inference"|"empty-mystery"|"explanatory-metaphor",sourceText,replacementText,reason}],editedText}',
      '【原稿】',
      String(draftText)
    ].join('\n'),
    maxTokens: AUTHENTICITY_EDITOR_MAX_TOKENS,
    temperature: 0.2
  }
}

const parseVerdict = raw => {
  const source = String(raw || '').trim()
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end < start) {
    throw editorError('CROSS_SECTION_AUTHENTICITY_JSON_INVALID', '真实性编辑没有返回 JSON object')
  }
  let verdict
  try {
    verdict = JSON.parse(source.slice(start, end + 1))
  } catch (cause) {
    throw editorError('CROSS_SECTION_AUTHENTICITY_JSON_INVALID', '真实性编辑 JSON 无效', { cause })
  }
  if (!verdict || typeof verdict !== 'object' || !['unchanged', 'edited'].includes(verdict.status)
    || !Array.isArray(verdict.findings) || typeof verdict.editedText !== 'string') {
    throw editorError('CROSS_SECTION_AUTHENTICITY_VERDICT_INVALID', '真实性编辑 verdict 字段无效')
  }
  if (verdict.findings.length > AUTHENTICITY_EDITOR_MAX_FINDINGS) {
    throw editorError('CROSS_SECTION_AUTHENTICITY_FINDINGS_LIMIT', '真实性编辑超过三处')
  }
  return verdict
}

const applyVerdict = (draftText, verdict) => {
  if (verdict.status === 'unchanged') {
    if (verdict.findings.length !== 0 || verdict.editedText !== draftText) {
      throw editorError('CROSS_SECTION_AUTHENTICITY_UNCHANGED_INVALID', 'unchanged 不能修改正文')
    }
    return draftText
  }
  if (verdict.findings.length === 0) {
    throw editorError('CROSS_SECTION_AUTHENTICITY_FINDINGS_REQUIRED', 'edited 至少需要一处修改')
  }
  let computed = draftText
  for (const finding of verdict.findings) {
    if (!finding || !FINDING_TYPES.has(finding.type) || !text(finding.sourceText)
      || !text(finding.replacementText) || !text(finding.reason)) {
      throw editorError('CROSS_SECTION_AUTHENTICITY_FINDING_INVALID', '真实性编辑 finding 字段无效')
    }
    const first = computed.indexOf(finding.sourceText)
    if (first < 0 || computed.indexOf(finding.sourceText, first + finding.sourceText.length) >= 0) {
      throw editorError('CROSS_SECTION_AUTHENTICITY_SOURCE_AMBIGUOUS', 'sourceText 必须在原稿中唯一出现')
    }
    computed = `${computed.slice(0, first)}${finding.replacementText}${computed.slice(first + finding.sourceText.length)}`
  }
  if (computed !== verdict.editedText) {
    throw editorError('CROSS_SECTION_AUTHENTICITY_EDIT_MISMATCH', 'editedText 与局部替换结果不一致')
  }
  const originalSignalCounts = new Map()
  const nextSignalCounts = new Map()
  for (const signal of detectAuthenticitySignals(draftText)) {
    originalSignalCounts.set(signal.type, (originalSignalCounts.get(signal.type) || 0) + 1)
  }
  for (const signal of detectAuthenticitySignals(computed)) {
    nextSignalCounts.set(signal.type, (nextSignalCounts.get(signal.type) || 0) + 1)
  }
  for (const [type, count] of originalSignalCounts) {
    if ((nextSignalCounts.get(type) || 0) >= count) {
      throw editorError('CROSS_SECTION_AUTHENTICITY_REQUIRED_SIGNAL_REMAINS', `已确认的 ${type} 信号没有减少`)
    }
  }
  const originalUngroundedCues = new Set([
    ...String(draftText).matchAll(/“([^”\n]{1,12})”二字/g),
    ...String(draftText).matchAll(/叫出[^，。\n]{0,12}的全名/g)
  ].map(match => match[0]))
  const nextUngroundedCues = [
    ...computed.matchAll(/“([^”\n]{1,12})”二字/g),
    ...computed.matchAll(/叫出[^，。\n]{0,12}的全名/g)
  ]
  if (nextUngroundedCues.some(match => !originalUngroundedCues.has(match[0]))) {
    throw editorError('CROSS_SECTION_AUTHENTICITY_UNGROUNDED_RELATION_CUE', '真实性编辑新增了没有正文落点的关系提示')
  }
  return computed
}

const leakKey = event => [event.factId, event.speakerId, event.matchedMarker].join('|')

export async function runAuthenticityEditor({ fixture, draft, provider, runId } = {}) {
  const originalText = String(draft?.rawText || '')
  const prompt = buildAuthenticityEditorPrompt({ fixture, draftText: originalText })
  let result
  let originalReadableText = ''
  try {
    const original = normalizeCrossSectionFinalProse(originalText, fixture, `${runId}:original`)
    originalReadableText = original.readableText
    if (!provider?.invoke) {
      throw editorError('CROSS_SECTION_AUTHENTICITY_PROVIDER_INVALID', '缺少真实性编辑 provider')
    }
    result = await provider.invoke({
      callId: `${String(runId || fixture.id)}:authenticity-editor`,
      ...prompt
    })
    const verdict = parseVerdict(result?.text)
    const nextText = applyVerdict(originalText, verdict)
    const normalized = normalizeCrossSectionFinalProse(nextText, fixture, `${runId}:edited`)
    const originalLeaks = new Set(scanUnauthorizedFacts({
      fixture, runId: `${runId}:original`, presentation: original.presentation
    }).leaks.map(leakKey))
    const nextLeaks = scanUnauthorizedFacts({
      fixture, runId: `${runId}:edited`, presentation: normalized.presentation
    }).leaks
    if (nextLeaks.some(event => !originalLeaks.has(leakKey(event)))) {
      throw editorError('CROSS_SECTION_AUTHENTICITY_NEW_FACT_LEAK', '真实性编辑新增了未授权事实泄漏')
    }
    return {
      status: verdict.status,
      runId: String(runId || fixture.id),
      fixtureId: fixture.id,
      findings: verdict.findings,
      originalText,
      originalReadableText,
      rawText: normalized.rawText,
      readableText: normalized.readableText,
      presentation: normalized.presentation,
      usage: normalizeGenerationUsage(result?.usage || {}),
      contractVersion: AUTHENTICITY_EDITOR_CONTRACT_VERSION
    }
  } catch (error) {
    return {
      status: 'failed',
      runId: String(runId || fixture?.id || ''),
      fixtureId: String(fixture?.id || ''),
      originalText,
      originalReadableText,
      error: {
        code: String(error?.code || 'CROSS_SECTION_AUTHENTICITY_EDIT_FAILED'),
        message: String(error?.message || '真实性编辑失败')
      },
      usage: normalizeGenerationUsage(result?.usage || {}),
      contractVersion: AUTHENTICITY_EDITOR_CONTRACT_VERSION
    }
  }
}
