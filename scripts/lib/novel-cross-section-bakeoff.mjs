import { createHash, randomUUID } from 'node:crypto'
import * as nodeFs from 'node:fs/promises'
import { hostname as systemHostname } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { runToolCallingProviderTurn } from '../../server/services/toolCallingProviderAdapter.js'
import { getNarrativeToolCatalog } from '../../shared/narrativeAgentContract.js'
import { normalizeGenerationUsage } from '../../shared/generationToolContract.js'
import { resolveTextApiKey } from '../../shared/textModelKeys.js'
import {
  buildNarrativeFormatInstructions,
  parseNarrativePresentation
} from '../../src/services/narrativePresentation.js'
import {
  CROSS_SECTION_FIXTURES,
  validateCrossSectionFixtures
} from '../fixtures/novel-cross-section-fixtures.mjs'

const BAKEOFF_MAX_TOKENS = 1800
const BAKEOFF_TIMEOUT_MS = 90000
export const CROSS_SECTION_PROMPT_CONTRACT_VERSION = 'cross-section-prompt.v1'
export const CROSS_SECTION_RUNNER_CONTRACT_VERSION = 'cross-section-runner.v2'
export const CROSS_SECTION_EVALUATOR_CONTRACT_VERSION = 'cross-section-evaluator.v1'
const CROSS_SECTION_CONTRACT_VERSIONS = Object.freeze({
  prompt: CROSS_SECTION_PROMPT_CONTRACT_VERSION,
  runner: CROSS_SECTION_RUNNER_CONTRACT_VERSION,
  evaluator: CROSS_SECTION_EVALUATOR_CONTRACT_VERSION
})
export const CROSS_SECTION_ARCHITECTURES = Object.freeze([
  'single-writer',
  'role-agents-narrator',
  'intent-planners-writer'
])
const SENSITIVE_MANIFEST_KEYS = new Set([
  'apikey',
  'authorization',
  'secret',
  'accesstoken',
  'refreshtoken',
  'clientsecret',
  'password',
  'token'
])
const SAFE_MANIFEST_KEYS = new Set(['inputtokens', 'outputtokens', 'totaltokens'])
const DANGEROUS_MANIFEST_KEYS = new Set(['proto', 'prototype', 'constructor'])
const READABLE_BLOCK_KINDS = new Set(['narration', 'action', 'dialogue', 'thought'])
const CHARACTER_BLOCK_KINDS = new Set(['action', 'dialogue', 'thought'])
const HUMAN_SCORE_FIELDS = Object.freeze([
  'voiceDistinctness',
  'informationDiscipline',
  'causalCoherence',
  'authorControl',
  'literaryUsability'
])
const HUMAN_SCORE_INSTRUCTIONS = Object.freeze(Object.fromEntries(HUMAN_SCORE_FIELDS.map(field => [field, {
  min: 0,
  max: 10,
  integer: true
}])))

export class CrossSectionEvaluationError extends Error {
  constructor(code, message, context = {}) {
    super(message)
    this.name = 'CrossSectionEvaluationError'
    this.code = code
    Object.assign(this, context)
  }
}

export function expandBakeoffMatrix({
  fixtures = CROSS_SECTION_FIXTURES,
  architectures = CROSS_SECTION_ARCHITECTURES,
  repetitions = 3
} = {}) {
  const fixtureValidation = validateCrossSectionFixtures(fixtures)
  if (!fixtureValidation.valid) {
    throw new CrossSectionEvaluationError(
      fixtureValidation.error.code,
      `截面评测 fixture 无效：${fixtureValidation.error.code}`,
      fixtureValidation.error
    )
  }
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) {
    throw new CrossSectionEvaluationError(
      'CROSS_SECTION_CLI_INVALID_REPETITIONS',
      '截面评测 repetitions 必须是 1–5 的整数'
    )
  }
  if (!Array.isArray(architectures)
    || architectures.some(architecture => !CROSS_SECTION_ARCHITECTURES.includes(architecture))) {
    throw new CrossSectionEvaluationError(
      'CROSS_SECTION_UNKNOWN_ARCHITECTURE',
      '截面评测包含未知架构'
    )
  }

  const attempts = []
  for (const fixture of fixtures) {
    for (const architecture of architectures) {
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        attempts.push({
          runId: `${fixture.id}-${architecture}-r${repetition}`,
          fixtureId: fixture.id,
          architecture,
          repetition
        })
      }
    }
  }
  const callsPerAttempt = {
    'single-writer': 1,
    'role-agents-narrator': 'characters+1',
    'intent-planners-writer': 'characters+1'
  }
  const fixturesById = new Map(fixtures.map(fixture => [fixture.id, fixture]))
  const worstCaseProviderCalls = attempts.reduce((total, attempt) => {
    if (attempt.architecture === 'single-writer') return total + 1
    return total + fixturesById.get(attempt.fixtureId).characters.length + 1
  }, 0)

  return {
    schemaVersion: 1,
    fixtureCount: fixtures.length,
    fixtureIds: fixtures.map(({ id }) => id),
    architectureCount: architectures.length,
    architectures: [...architectures],
    repetitions,
    attemptCount: attempts.length,
    callsPerAttempt,
    worstCaseProviderCalls,
    attempts
  }
}

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

const publicFacts = fixture => fixture.facts.filter(({ visibility }) => visibility === 'public')

const factsVisibleTo = (fixture, character) => fixture.facts.filter(fact => (
  fact.visibility === 'public' || character.knownFactIds.includes(fact.id)
))

const commonFinalUserPrompt = fixture => [
  '【公开设定】',
  ...publicFacts(fixture).map(labelledFact),
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

export function buildFinalProseContract(fixture) {
  return [
    '你负责生成一篇完整中文小说段落，终稿长度必须为 500–900 中文字符。',
    `在内部安排 ${fixture.internalBeatRange.min}–${fixture.internalBeatRange.max} 个连续因果 beats，但不打印 beat 标签。`,
    `所有冲突必须指向 focusProp「${fixture.focusProp}」。`,
    `只在 exitCue（${fixture.exitCue.join('、')}）出现时停下；不提供选项，不自动继续。`,
    '角色披露前不得使用其 forbidden fact；旁白、动作、心理与对白都受此限制。',
    '使用 Pinax markers 和规范中文双引号；marker 只承担传输结构。',
    '保留作者控制，不决定未提供的玩家动作。',
    buildNarrativeFormatInstructions()
  ].join('\n')
}

const strictObject = (raw, keys) => {
  let value
  try {
    const text = String(raw || '').trim()
    const fenced = text.match(/^```json[ \t]*\r?\n([\s\S]*?)\r?\n```$/i)
    value = JSON.parse(fenced ? fenced[1].trim() : text)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const actualKeys = Object.keys(value).sort()
  if (actualKeys.length !== keys.length || actualKeys.some((key, index) => key !== [...keys].sort()[index])) return null
  return value
}

const validText = value => typeof value === 'string' && value.trim().length > 0
const validFactIds = (value, allowedFactIds) => Array.isArray(value)
  && new Set(value).size === value.length
  && value.every(factId => typeof factId === 'string' && allowedFactIds.has(factId))

const ownedKnownPrivateFactIds = (fixture, character) => new Set(fixture.facts
  .filter(fact => fact.visibility === 'private'
    && fact.ownerCharacterId === character.id
    && character.knownFactIds.includes(fact.id))
  .map(({ id }) => id))

const parseProposal = (raw, fixture, character) => {
  const proposal = strictObject(raw, ['characterId', 'proposedAction', 'proposedDialogue', 'discloseFactIds'])
  const disclosureFactIds = ownedKnownPrivateFactIds(fixture, character)
  if (!proposal
    || proposal.characterId !== character.id
    || !validText(proposal.proposedAction)
    || !validText(proposal.proposedDialogue)
    || !validFactIds(proposal.discloseFactIds, disclosureFactIds)) return null
  return proposal
}

const parsePlan = (raw, fixture, character) => {
  const plan = strictObject(raw, [
    'characterId',
    'intent',
    'nextAction',
    'pressureOnFocusProp',
    'discloseFactIds',
    'withholdFactIds'
  ])
  const disclosureFactIds = ownedKnownPrivateFactIds(fixture, character)
  const disclosed = new Set(Array.isArray(plan?.discloseFactIds) ? plan.discloseFactIds : [])
  if (!plan
    || plan.characterId !== character.id
    || !validText(plan.intent)
    || !validText(plan.nextAction)
    || !validText(plan.pressureOnFocusProp)
    || !validFactIds(plan.discloseFactIds, disclosureFactIds)
    || !validFactIds(plan.withholdFactIds, disclosureFactIds)
    || plan.withholdFactIds.some(factId => disclosed.has(factId))) return null
  return plan
}

const usageOf = result => normalizeGenerationUsage(result?.usage)

const sumUsage = calls => calls.reduce((total, call) => {
  const usage = usageOf(call.result)
  total.inputTokens += usage.inputTokens
  total.outputTokens += usage.outputTokens
  total.totalTokens += usage.totalTokens
  return total
}, { inputTokens: 0, outputTokens: 0, totalTokens: 0 })

const errorShape = error => Object.fromEntries([
  ['code', String(error?.code || 'CROSS_SECTION_RUN_FAILED')],
  ['message', String(error?.message || '截面评测运行失败')],
  ['fixtureId', error?.fixtureId],
  ['characterId', error?.characterId],
  ['factId', error?.factId]
].filter(([, value]) => value !== undefined))

const intermediateError = stage => new CrossSectionProviderError(
  'CROSS_SECTION_INTERMEDIATE_INVALID',
  `${stage} 返回值不符合严格 JSON 合同`
)

const validateFixtureForRun = fixture => {
  const validation = validateCrossSectionFixtures([fixture])
  if (validation.valid) return null
  return Object.assign(
    new CrossSectionProviderError(
      validation.error.code,
      `截面 fixture 未通过验证：${validation.error.code}`
    ),
    validation.error
  )
}

const speakerRegistryFor = fixture => fixture.characters.map(({ id, name }) => ({
  speakerId: id,
  displayName: name,
  aliases: [],
  entityType: 'character',
  canSpeak: true,
  source: 'bakeoff-fixture'
}))

const readableBlockText = block => {
  const text = String(block.text || '').trim()
  if (block.kind !== 'dialogue' || !block.speaker || !/^[“「『\"']/.test(text)) return text
  return `${block.speaker}：${text}`
}

export function normalizeCrossSectionFinalProse(raw, fixture, runId) {
  const rawText = String(raw ?? '')
  const presentation = parseNarrativePresentation(rawText, {
    complete: true,
    messageId: runId,
    speakerMap: fixture.speakerMap,
    speakerRegistry: speakerRegistryFor(fixture)
  })
  const readableBlocks = presentation.blocks.filter(block => (
    READABLE_BLOCK_KINDS.has(block.kind) && String(block.text || '').trim()
  ))
  if (readableBlocks.length === 0) {
    throw new CrossSectionProviderError(
      'CROSS_SECTION_PRESENTATION_EMPTY',
      '终稿解析后没有可读叙事块'
    )
  }
  const readableText = readableBlocks.map(readableBlockText).join('\n\n')
  return {
    rawText,
    text: readableText,
    readableText,
    renderedText: readableText,
    presentation
  }
}

const factScanEvent = ({ fixture, runId, block, blockIndex, speakerId, fact, marker }) => ({
  fixtureId: fixture.id,
  runId,
  speakerId,
  factId: fact.id,
  matchedMarker: marker,
  blockId: String(block.id || block.blockId || ''),
  blockIndex
})

const humanReviewReason = (block, character) => {
  if (block.kind === 'narration') return 'narration'
  if (block.kind === 'system') return 'system'
  if (block.speakerTrust === 'unresolved' || (block.speakerId && !character)) return 'speaker-unresolved'
  return 'speaker-missing'
}

export function scanUnauthorizedFacts({ fixture, runId, presentation }) {
  const leaks = []
  const needsHumanReview = []
  const disclosures = []
  const disclosedFactIds = new Set()
  const privateFacts = (fixture?.facts || []).filter(fact => fact.visibility === 'private')
  const charactersById = new Map((fixture?.characters || []).map(character => [character.id, character]))
  const blocks = Array.isArray(presentation?.blocks) ? presentation.blocks : []

  blocks.forEach((block, blockIndex) => {
    const text = String(block?.text || '')
    const matched = []
    for (const fact of privateFacts) {
      if (disclosedFactIds.has(fact.id)) continue
      const marker = (fact.leakMarkers || []).find(candidate => text.includes(candidate))
      if (marker !== undefined) matched.push({ fact, marker })
    }
    if (matched.length === 0) return

    const speakerId = String(block?.speakerId || '')
    const character = charactersById.get(speakerId)
    const characterBlock = CHARACTER_BLOCK_KINDS.has(block?.kind)
      && block?.speakerTrust !== 'unresolved'
      && Boolean(character)
    const disclosuresAfterBlock = new Set()

    for (const { fact, marker } of matched) {
      if (!characterBlock) {
        needsHumanReview.push({
          ...factScanEvent({ fixture, runId, block, blockIndex, speakerId, fact, marker }),
          reason: humanReviewReason(block, character)
        })
        continue
      }

      const event = factScanEvent({ fixture, runId, block, blockIndex, speakerId, fact, marker })
      if (character.forbiddenFactIds.includes(fact.id)) {
        leaks.push(event)
      } else if (block.kind === 'dialogue') {
        disclosures.push(event)
        disclosuresAfterBlock.add(fact.id)
      }
    }

    for (const factId of disclosuresAfterBlock) disclosedFactIds.add(factId)
  })

  return { leaks, needsHumanReview, disclosures }
}

const sha256Hex = value => createHash('sha256').update(String(value)).digest('hex')

const seededRandom = seedText => {
  let state = Number.parseInt(sha256Hex(seedText).slice(0, 8), 16) || 0x9e3779b9
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x100000000
  }
}

const shuffled = (values, seedText) => {
  const output = [...values]
  const random = seededRandom(seedText)
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[output[index], output[swapIndex]] = [output[swapIndex], output[index]]
  }
  return output
}

const blankReview = blindId => ({
  blindId,
  ...Object.fromEntries(HUMAN_SCORE_FIELDS.map(field => [field, null])),
  humanLeakFactIds: [],
  notes: ''
})

export function createBlindReviewBundle(runs, {
  experimentRunId,
  fixtures = CROSS_SECTION_FIXTURES
} = {}) {
  const inputRuns = Array.isArray(runs) ? runs : []
  const runIds = new Set()
  for (const run of inputRuns) {
    const runId = String(run?.runId || '')
    if (runIds.has(runId)) {
      throw new CrossSectionEvaluationError(
        'CROSS_SECTION_DUPLICATE_RUN_ID',
        `截面评测 runId 重复：${runId}`,
        { runId }
      )
    }
    runIds.add(runId)
  }

  const fixturesById = new Map((Array.isArray(fixtures) ? fixtures : []).map(fixture => [fixture.id, fixture]))
  const eligibleRuns = inputRuns.filter(run => (
    (run?.status === 'success' || run?.status === 'completed')
      && String(run?.readableText || '').trim()
  ))
  const blindIds = new Set()
  const items = eligibleRuns.map(run => {
    const blindId = `blind-${sha256Hex(`${experimentRunId}:${run.runId}`).slice(0, 16)}`
    if (blindIds.has(blindId)) {
      throw new CrossSectionEvaluationError(
        'CROSS_SECTION_BLIND_ID_COLLISION',
        `截面评测 blindId 碰撞：${blindId}`,
        { blindId, runId: String(run.runId) }
      )
    }
    blindIds.add(blindId)
    const fixture = fixturesById.get(run.fixtureId)
    return {
      blindId,
      fixtureGenreLabel: String(fixture?.genreLabel || fixture?.title || ''),
      readableProse: String(run.readableText),
      scoreInstructions: HUMAN_SCORE_INSTRUCTIONS,
      privateMapping: {
        runId: String(run.runId),
        architecture: String(run.architecture),
        fixtureId: String(run.fixtureId)
      }
    }
  })
  const orderedItems = shuffled(items, experimentRunId)
  const blindItems = orderedItems.map(({ privateMapping: _privateMapping, ...item }) => item)
  const privateBlindMap = Object.fromEntries(orderedItems.map(item => [item.blindId, item.privateMapping]))

  return {
    blindReview: {
      schemaVersion: 1,
      instructions: '请独立阅读每篇终稿，按五个维度分别给出 0–10 的整数评分，并记录人工发现的事实泄漏。',
      items: blindItems
    },
    reviewTemplate: blindItems.map(({ blindId }) => blankReview(blindId)),
    privateBlindMap
  }
}

const invalidReview = (code, context = {}) => ({
  valid: false,
  error: { code, ...context }
})

export function validateBakeoffReviews(reviews, { blindIds } = {}) {
  try {
    if (!Array.isArray(reviews) || !Array.isArray(blindIds)) {
      return invalidReview('CROSS_SECTION_REVIEWS_INVALID')
    }
    const knownBlindIds = new Set(blindIds)
    const reviewedBlindIds = new Set()
    const reviewerPairs = new Set()

    for (const review of reviews) {
      if (!review || typeof review !== 'object' || Array.isArray(review)) {
        return invalidReview('CROSS_SECTION_REVIEW_INVALID')
      }
      if (typeof review.blindId !== 'string' || !knownBlindIds.has(review.blindId)) {
        return invalidReview('CROSS_SECTION_REVIEW_UNKNOWN_BLIND_ID', { blindId: review.blindId })
      }
      const hasReviewerId = Object.prototype.hasOwnProperty.call(review, 'reviewerId')
      if (hasReviewerId
        && (typeof review.reviewerId !== 'string' || !review.reviewerId.trim())) {
        return invalidReview('CROSS_SECTION_REVIEW_INVALID_REVIEWER_ID', { blindId: review.blindId })
      }
      const reviewerId = hasReviewerId ? review.reviewerId.trim() : ''
      const pair = `${review.blindId}\u0000${reviewerId}`
      if (reviewerPairs.has(pair)) {
        return invalidReview('CROSS_SECTION_REVIEW_DUPLICATE', {
          blindId: review.blindId,
          reviewerId
        })
      }
      reviewerPairs.add(pair)
      reviewedBlindIds.add(review.blindId)

      for (const field of HUMAN_SCORE_FIELDS) {
        const score = review[field]
        if (!Object.prototype.hasOwnProperty.call(review, field)
          || !Number.isInteger(score)
          || score < 0
          || score > 10) {
          return invalidReview('CROSS_SECTION_REVIEW_INVALID_SCORE', {
            blindId: review.blindId,
            field
          })
        }
      }
      if (!Array.isArray(review.humanLeakFactIds)
        || review.humanLeakFactIds.some(factId => typeof factId !== 'string' || !factId)
        || new Set(review.humanLeakFactIds).size !== review.humanLeakFactIds.length) {
        return invalidReview('CROSS_SECTION_REVIEW_INVALID_LEAK_FACT_IDS', { blindId: review.blindId })
      }
      if (review.notes !== undefined && typeof review.notes !== 'string') {
        return invalidReview('CROSS_SECTION_REVIEW_INVALID_NOTES', { blindId: review.blindId })
      }
    }

    for (const blindId of blindIds) {
      if (!reviewedBlindIds.has(blindId)) {
        return invalidReview('CROSS_SECTION_REVIEW_MISSING_BLIND_ID', { blindId })
      }
    }
    return { valid: true }
  } catch {
    return invalidReview('CROSS_SECTION_REVIEWS_INVALID')
  }
}

export function aggregateHumanReviews(reviews) {
  if (!Array.isArray(reviews)) {
    throw new CrossSectionEvaluationError(
      'CROSS_SECTION_REVIEWS_INVALID',
      '截面评测 reviews 必须是数组'
    )
  }
  const blindIds = [...new Set(reviews
    .map(review => review?.blindId)
    .filter(blindId => typeof blindId === 'string'))]
  const validation = validateBakeoffReviews(reviews, { blindIds })
  if (!validation.valid) {
    const { code, ...context } = validation.error
    throw new CrossSectionEvaluationError(code, `截面评测 review 无效：${code}`, context)
  }

  const grouped = new Map()
  for (const review of reviews) {
    if (!grouped.has(review.blindId)) grouped.set(review.blindId, [])
    grouped.get(review.blindId).push(review)
  }

  return [...grouped].map(([blindId, blindReviews]) => {
    const scores = Object.fromEntries(HUMAN_SCORE_FIELDS.map(field => [
      field,
      blindReviews.reduce((sum, review) => sum + review[field], 0) / blindReviews.length
    ]))
    return {
      blindId,
      reviewCount: blindReviews.length,
      humanScore: HUMAN_SCORE_FIELDS.reduce((sum, field) => sum + scores[field], 0) / HUMAN_SCORE_FIELDS.length,
      scores,
      humanLeakFactIds: [...new Set(blindReviews.flatMap(review => review.humanLeakFactIds || []))]
    }
  })
}

const invokeRecorded = async (provider, calls, metadata, request) => {
  const call = { ...metadata, status: 'pending', request }
  calls.push(call)
  try {
    const result = await provider.invoke(request)
    call.status = 'success'
    call.result = result
    return result
  } catch (error) {
    call.status = 'failed'
    call.error = errorShape(error)
    throw error
  }
}

const settleRecorded = async invocation => {
  try {
    return { result: await invocation() }
  } catch (error) {
    return { error }
  }
}

const rolePrompt = (fixture, character) => [
  `你只为角色 ${character.name}（characterId=${character.id}）提出下一步。`,
  `角色合同：desire=${character.desire} | contradiction=${character.contradiction} | voice=${character.voiceProfile} | temperament=${character.temperament}`,
  `focusProp=${fixture.focusProp}；exitCue=${fixture.exitCue.join(' / ')}`,
  '你可见且仅可见以下 public facts 与该角色 own-known facts：',
  ...factsVisibleTo(fixture, character).map(labelledFact),
  '只输出严格 JSON，不要代码围栏，不做修复轮次。schema={characterId,proposedAction,proposedDialogue,discloseFactIds}'
].join('\n')

const plannerPrompt = (fixture, character) => [
  `你只规划角色 ${character.name}（characterId=${character.id}）的意图和动作。`,
  `角色合同：desire=${character.desire} | contradiction=${character.contradiction} | temperament=${character.temperament}`,
  `focusProp=${fixture.focusProp}；exitCue=${fixture.exitCue.join(' / ')}`,
  '禁止润色对白和叙述；不要写小说正文。',
  '你可见且仅可见以下 public facts 与该角色 own-known facts：',
  ...factsVisibleTo(fixture, character).map(labelledFact),
  '只输出严格 JSON，不要代码围栏，不做修复轮次。schema={characterId,intent,nextAction,pressureOnFocusProp,discloseFactIds,withholdFactIds}'
].join('\n')

const finalizeRun = (base, finalResult) => ({
  ...base,
  status: 'success',
  usage: sumUsage(base.calls),
  ...normalizeCrossSectionFinalProse(finalResult.text, base.fixture, base.runId)
})

const failedRun = (base, error, rawText = '') => ({
  runId: base.runId,
  fixtureId: base.fixtureId,
  architecture: base.architecture,
  status: 'failed',
  calls: base.calls,
  usage: sumUsage(base.calls),
  latencyMs: Math.max(0, base.now() - base.startedAt),
  rawText: String(rawText || ''),
  text: '',
  readableText: '',
  renderedText: '',
  presentation: null,
  error: errorShape(error)
})

const executeArchitecture = async (architecture, fixture, provider, options, implementation) => {
  const now = resolveNow(options)
  const startedAt = now()
  const fixtureError = validateFixtureForRun(fixture)
  const fixtureId = fixtureError ? String(fixtureError.fixtureId || '') : String(fixture.id)
  const base = {
    runId: String(options.runId || `${fixtureId || 'invalid-fixture'}-${architecture}`),
    fixtureId,
    architecture,
    fixture,
    calls: [],
    now,
    startedAt
  }
  if (fixtureError) return failedRun(base, fixtureError)
  let finalResult
  try {
    finalResult = await implementation(base, provider)
    const normalized = finalizeRun(base, finalResult)
    normalized.latencyMs = Math.max(0, now() - base.startedAt)
    delete normalized.fixture
    delete normalized.now
    delete normalized.startedAt
    return normalized
  } catch (error) {
    return failedRun(base, error, finalResult?.text)
  }
}

const finalRequest = (base, fixture, supplemental) => ({
  callId: `${base.runId}:final`,
  system: buildFinalProseContract(fixture),
  user: [commonFinalUserPrompt(fixture), supplemental].filter(Boolean).join('\n\n'),
  maxTokens: BAKEOFF_MAX_TOKENS
})

export function runSingleWriter(fixture, provider, options = {}) {
  return executeArchitecture('single-writer', fixture, provider, options, async base => (
    invokeRecorded(provider, base.calls, { stage: 'final' }, finalRequest(
      base,
      fixture,
      fullRestrictions(fixture)
    ))
  ))
}

export function runRoleAgentsNarrator(fixture, provider, options = {}) {
  return executeArchitecture('role-agents-narrator', fixture, provider, options, async base => {
    const roleResults = await Promise.all(fixture.characters.map(async character => {
      const request = {
        callId: `${base.runId}:role:${character.id}`,
        system: '你是隔离的角色 proposal agent，只按严格 JSON 合同返回。',
        user: rolePrompt(fixture, character),
        maxTokens: BAKEOFF_MAX_TOKENS
      }
      const outcome = await settleRecorded(() => invokeRecorded(provider, base.calls, {
          stage: 'role-proposal',
          characterId: character.id
        }, request))
      return {
        character,
        ...outcome,
        parsed: outcome.result ? parseProposal(outcome.result.text, fixture, character) : null
      }
    }))
    const failedRole = roleResults.find(({ error }) => error)
    if (failedRole) throw failedRole.error
    if (roleResults.some(({ parsed }) => !parsed)) throw intermediateError('role proposal')
    const proposals = roleResults.map(({ parsed }) => parsed)
    return invokeRecorded(provider, base.calls, { stage: 'final' }, finalRequest(
      base,
      fixture,
      `${fullRestrictions(fixture)}\n【proposals】\n${JSON.stringify(proposals)}`
    ))
  })
}

export function runIntentPlannersWriter(fixture, provider, options = {}) {
  return executeArchitecture('intent-planners-writer', fixture, provider, options, async base => {
    const plannerResults = await Promise.all(fixture.characters.map(async character => {
      const request = {
        callId: `${base.runId}:planner:${character.id}`,
        system: '你是隔离的 intent planner，只按严格 JSON 合同返回。',
        user: plannerPrompt(fixture, character),
        maxTokens: BAKEOFF_MAX_TOKENS
      }
      const outcome = await settleRecorded(() => invokeRecorded(provider, base.calls, {
          stage: 'intent-plan',
          characterId: character.id
        }, request))
      return {
        character,
        ...outcome,
        parsed: outcome.result ? parsePlan(outcome.result.text, fixture, character) : null
      }
    }))
    const failedPlanner = plannerResults.find(({ error }) => error)
    if (failedPlanner) throw failedPlanner.error
    if (plannerResults.some(({ parsed }) => !parsed)) throw intermediateError('intent plan')
    const plans = plannerResults.map(({ parsed }) => parsed)
    return invokeRecorded(provider, base.calls, { stage: 'final' }, finalRequest(
      base,
      fixture,
      `${fullRestrictions(fixture)}\n【plans】\n${JSON.stringify(plans)}`
    ))
  })
}

export function runCrossSectionArchitecture(architecture, fixture, provider, options = {}) {
  if (architecture === 'single-writer') return runSingleWriter(fixture, provider, options)
  if (architecture === 'role-agents-narrator') return runRoleAgentsNarrator(fixture, provider, options)
  if (architecture === 'intent-planners-writer') return runIntentPlannersWriter(fixture, provider, options)
  return executeArchitecture(architecture, fixture, provider, options, async () => {
    throw new CrossSectionProviderError(
      'CROSS_SECTION_UNKNOWN_ARCHITECTURE',
      `未知截面架构：${architecture}`
    )
  })
}

export class CrossSectionProviderError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'CrossSectionProviderError'
    this.code = code
    if (options.cause !== undefined) this.cause = options.cause
  }
}

const resolveNow = options => {
  if (typeof options.now === 'function') return options.now
  if (typeof options.clock?.now === 'function') return () => options.clock.now()
  return Date.now
}

const cloneValue = value => structuredClone(value)

const deepFreeze = (value, visited = new WeakSet()) => {
  if (value === null || typeof value !== 'object' || visited.has(value)) return value
  visited.add(value)
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], visited)
  return Object.freeze(value)
}

const providerError = (code, message, result) => new CrossSectionProviderError(
  code,
  message,
  result?.cause === undefined ? {} : { cause: result.cause }
)

const isTruncatedResult = result => {
  if (result?.truncated === true || result?.incomplete === true) return true
  if (String(result?.status || '').toLowerCase() === 'incomplete') return true
  const finishReason = String(result?.finishReason || result?.stopReason || '').toLowerCase()
  return /(?:truncat|length|max[_-]?(?:output[_-]?)?tokens?|token[_-]?limit)/.test(finishReason)
}

export async function invokeBakeoffModel(config, invocation, options = {}) {
  const runner = options.runner || runToolCallingProviderTurn
  const resolveApiKey = options.resolveApiKey || resolveTextApiKey
  const now = resolveNow(options)
  const startedAt = now()
  const requestProvider = cloneValue(config)
  requestProvider.apiKey = resolveApiKey({
    provider: requestProvider.id || requestProvider.provider,
    baseUrl: requestProvider.baseUrl,
    apiKey: requestProvider.apiKey
  })
  let result
  try {
    result = await runner({
      schemaVersion: 1,
      requestId: invocation.callId,
      provider: requestProvider,
      messages: [
        { role: 'system', content: invocation.system },
        { role: 'user', content: invocation.user }
      ],
      tools: getNarrativeToolCatalog({ activeTools: ['world_lookup'] }),
      options: {
        temperature: 0.4,
        maxTokens: BAKEOFF_MAX_TOKENS,
        timeoutMs: BAKEOFF_TIMEOUT_MS,
        toolChoice: 'none'
      }
    })
  } catch (error) {
    if (error?.code === 'NARRATIVE_PROVIDER_EMPTY_RESPONSE') {
      throw new CrossSectionProviderError(
        'CROSS_SECTION_PROVIDER_EMPTY_TEXT',
        '截面评测模型返回了空正文',
        { cause: error }
      )
    }
    if (error?.code === 'NARRATIVE_PROVIDER_OUTPUT_TRUNCATED') {
      throw new CrossSectionProviderError(
        'CROSS_SECTION_PROVIDER_OUTPUT_TRUNCATED',
        '截面评测模型输出被截断',
        { cause: error }
      )
    }
    throw error
  }

  if (result?.kind !== 'final_ready' || (Array.isArray(result?.calls) && result.calls.length > 0)) {
    throw providerError(
      'CROSS_SECTION_PROVIDER_TOOL_CALL_REJECTED',
      '截面评测模型不得调用工具',
      result
    )
  }
  if (isTruncatedResult(result)) {
    throw providerError(
      'CROSS_SECTION_PROVIDER_OUTPUT_TRUNCATED',
      '截面评测模型输出被截断',
      result
    )
  }
  if (!String(result.text ?? '').trim()) {
    throw providerError(
      'CROSS_SECTION_PROVIDER_EMPTY_TEXT',
      '截面评测模型返回了空正文',
      result
    )
  }

  return {
    text: result.text,
    usage: normalizeGenerationUsage(result.usage),
    finishReason: result.finishReason,
    latencyMs: Math.max(0, now() - startedAt)
  }
}

export function createBakeoffProvider(config, options = {}) {
  const fixedConfig = deepFreeze(cloneValue(config))
  return {
    config: fixedConfig,
    provider: fixedConfig.id,
    model: fixedConfig.model,
    format: fixedConfig.format,
    invoke(invocation) {
      return invokeBakeoffModel(fixedConfig, invocation, options)
    }
  }
}

const redactBaseUrl = value => {
  try {
    const url = new URL(String(value))
    return /^https?:$/.test(url.protocol) ? url.origin : ''
  } catch {
    return ''
  }
}

const normalizeManifestKey = key => String(key).toLowerCase().replace(/[^a-z0-9]/g, '')

const isBaseUrlKey = key => key === 'baseurl' || key === 'xbaseurl'

const isSensitiveManifestKey = key => {
  if (SAFE_MANIFEST_KEYS.has(key)) return false
  return SENSITIVE_MANIFEST_KEYS.has(key)
    || key.endsWith('apikey')
    || key.endsWith('token')
    || key.endsWith('authorization')
}

const stableJson = value => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

const fingerprintBaseUrl = value => {
  try {
    const url = new URL(String(value))
    if (!/^https?:$/.test(url.protocol)) return String(value)
    return `${url.origin}${url.pathname}`
  } catch {
    return String(value)
  }
}

const nonSecretProviderContract = value => {
  if (Array.isArray(value)) return value.map(nonSecretProviderContract)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .filter(([key]) => {
      const normalizedKey = normalizeManifestKey(key)
      return !isSensitiveManifestKey(normalizedKey) && !DANGEROUS_MANIFEST_KEYS.has(normalizedKey)
    })
    .map(([key, childValue]) => {
      const normalizedKey = normalizeManifestKey(key)
      return [
        key,
        isBaseUrlKey(normalizedKey)
          ? fingerprintBaseUrl(childValue)
          : nonSecretProviderContract(childValue)
      ]
    }))
}

const hashCanonical = value => createHash('sha256').update(stableJson(value)).digest('hex')

const experimentFingerprintFrom = ({
  contractVersions,
  fixtureContractFingerprint,
  providerContractFingerprint
}) => hashCanonical({ contractVersions, fixtureContractFingerprint, providerContractFingerprint })

const fixtureContractFingerprintFrom = fixtures => hashCanonical({
  contractVersions: CROSS_SECTION_CONTRACT_VERSIONS,
  fixtures
})

export function createBakeoffExperimentFingerprint({ fixtures, providerConfig }) {
  const contractVersions = { ...CROSS_SECTION_CONTRACT_VERSIONS }
  const fixtureContractFingerprint = fixtureContractFingerprintFrom(fixtures)
  const providerContractFingerprint = hashCanonical(nonSecretProviderContract(providerConfig))
  return {
    contractVersions,
    fixtureContractFingerprint,
    providerContractFingerprint,
    experimentFingerprint: experimentFingerprintFrom({
      contractVersions,
      fixtureContractFingerprint,
      providerContractFingerprint
    })
  }
}

export function redactBakeoffManifest(value) {
  const visited = new WeakMap()

  const redact = nestedValue => {
    if (nestedValue === null || typeof nestedValue !== 'object') return nestedValue
    if (visited.has(nestedValue)) return '[Circular]'

    visited.set(nestedValue, true)
    if (Array.isArray(nestedValue)) {
      const redactedArray = nestedValue.map(redact)
      visited.delete(nestedValue)
      return redactedArray
    }

    const redactedObject = Object.create(null)
    for (const [key, childValue] of Object.entries(nestedValue)) {
      const normalizedKey = normalizeManifestKey(key)
      if (isSensitiveManifestKey(normalizedKey)
        || DANGEROUS_MANIFEST_KEYS.has(normalizedKey)) continue
      Object.defineProperty(redactedObject, key, {
        value: isBaseUrlKey(normalizedKey) ? redactBaseUrl(childValue) : redact(childValue),
        enumerable: true,
        configurable: true,
        writable: true
      })
    }
    visited.delete(nestedValue)
    return redactedObject
  }

  return redact(value)
}

const DEFAULT_BAKEOFF_OUTPUT_ROOT = '/tmp/pinax-cross-section-bakeoff'
const RUN_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
const GENERATE_LOCK_FILE = '.generate.lock'

const artifactError = (code, message, context = {}) => (
  new CrossSectionEvaluationError(code, message, context)
)

const validGenerateLock = lock => lock
  && typeof lock === 'object'
  && !Array.isArray(lock)
  && validText(lock.token)
  && Number.isInteger(lock.pid)
  && lock.pid > 0
  && validText(lock.hostname)
  && validText(lock.startedAt)
  && !Number.isNaN(Date.parse(lock.startedAt))

const processIsAlive = pid => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code !== 'ESRCH'
  }
}

const parseGenerateLock = raw => {
  try {
    const lock = JSON.parse(raw)
    return validGenerateLock(lock) ? lock : null
  } catch {
    return null
  }
}

const acquireGenerateLock = async (fs, runDir, options, startedAt) => {
  const lockPath = join(runDir, GENERATE_LOCK_FILE)
  const ownLock = {
    token: randomUUID(),
    pid: process.pid,
    hostname: options.lockHostname || systemHostname(),
    startedAt
  }
  const isAlive = options.isProcessAlive || processIsAlive

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await fs.writeFile(lockPath, `${JSON.stringify(ownLock)}\n`, { flag: 'wx' })
      return { lockPath, lock: ownLock }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }

    let existingRaw
    try {
      existingRaw = await fs.readFile(lockPath, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw error
    }
    const existing = parseGenerateLock(existingRaw)
    if (!existing) {
      throw artifactError('CROSS_SECTION_GENERATE_LOCK_INVALID', 'generate lock 损坏，拒绝自动恢复')
    }
    if (existing.hostname !== ownLock.hostname || isAlive(existing.pid)) {
      throw artifactError('CROSS_SECTION_GENERATE_LOCK_HELD', '同一 experiment run 正在生成', {
        pid: existing.pid,
        hostname: existing.hostname
      })
    }

    const stalePath = `${lockPath}.stale-${randomUUID()}`
    try {
      await fs.rename(lockPath, stalePath)
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw error
    }
    const isolatedRaw = await fs.readFile(stalePath, 'utf8')
    const isolated = parseGenerateLock(isolatedRaw)
    if (!isolated || isolated.token !== existing.token) {
      try {
        await fs.rename(stalePath, lockPath)
      } catch {
        // Another contender owns lockPath; preserve both records for diagnosis.
      }
      throw artifactError('CROSS_SECTION_GENERATE_LOCK_HELD', 'stale lock 回收发生竞争')
    }
    await fs.rm(stalePath, { force: true })
  }
  throw artifactError('CROSS_SECTION_GENERATE_LOCK_HELD', '无法原子获取 generate lock')
}

const releaseGenerateLock = async (fs, ownership) => {
  let currentRaw
  try {
    currentRaw = await fs.readFile(ownership.lockPath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  const current = parseGenerateLock(currentRaw)
  if (!current || current.token !== ownership.lock.token) return

  const releasePath = `${ownership.lockPath}.release-${ownership.lock.token}`
  try {
    await fs.rename(ownership.lockPath, releasePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  const isolated = parseGenerateLock(await fs.readFile(releasePath, 'utf8'))
  if (isolated?.token === ownership.lock.token) {
    await fs.rm(releasePath, { force: true })
    return
  }
  try {
    await fs.rename(releasePath, ownership.lockPath)
  } catch {
    // Never delete a lock whose token changed.
  }
}

const parseProviderConfig = raw => {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    throw artifactError('CROSS_SECTION_PROVIDER_CONFIG_INVALID', 'provider config 不是有效 JSON', { cause })
  }
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  let config
  if (isObject(parsed) && Object.prototype.hasOwnProperty.call(parsed, 'provider')) {
    if (Object.keys(parsed).length !== 1 || !isObject(parsed.provider)) {
      throw artifactError('CROSS_SECTION_PROVIDER_CONFIG_INVALID', 'provider config 必须严格包含一个 provider')
    }
    config = parsed.provider
  } else {
    config = parsed
  }
  if (!isObject(config)
    || !validText(config.id)
    || !validText(config.model)
    || Object.prototype.hasOwnProperty.call(config, 'providers')) {
    throw artifactError('CROSS_SECTION_PROVIDER_CONFIG_INVALID', 'provider config 必须是单个 provider 对象')
  }
  return config
}

const dateFromNow = now => {
  const value = typeof now === 'function' ? now() : Date.now()
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return new Date()
  return date
}

const timestampSlug = date => date.toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z')

const atomicWriteJson = async (fs, path, value) => {
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
  await fs.rename(temporaryPath, path)
}

const readOptional = async (fs, path) => {
  try {
    return await fs.readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

const parsePrivateRunsState = (raw, { recoverTrailing = false } = {}) => {
  if (raw === null || raw === '') return { runs: [], normalizedRaw: '', needsRewrite: false }
  const hasFinalNewline = raw.endsWith('\n')
  const lines = raw.split('\n')
  if (hasFinalNewline) lines.pop()
  const runs = []
  const runIds = new Set()
  for (let index = 0; index < lines.length; index += 1) {
    let run
    try {
      run = JSON.parse(lines[index])
    } catch (cause) {
      if (recoverTrailing && !hasFinalNewline && index === lines.length - 1) {
        return {
          runs,
          normalizedRaw: runs.length === 0 ? '' : `${lines.slice(0, index).join('\n')}\n`,
          needsRewrite: true
        }
      }
      throw artifactError(
        'CROSS_SECTION_PRIVATE_RUNS_CORRUPT',
        `private-runs.jsonl 第 ${index + 1} 行损坏`,
        { line: index + 1, cause }
      )
    }
    const runId = String(run?.runId || '')
    if (!runId) {
      throw artifactError('CROSS_SECTION_PRIVATE_RUNS_CORRUPT', `private-runs.jsonl 第 ${index + 1} 行缺少 runId`, { line: index + 1 })
    }
    if (runIds.has(runId)) {
      throw artifactError('CROSS_SECTION_DUPLICATE_RUN_ID', `private-runs.jsonl runId 重复：${runId}`, { runId })
    }
    runIds.add(runId)
    runs.push(run)
  }
  return {
    runs,
    normalizedRaw: hasFinalNewline ? raw : `${raw}\n`,
    needsRewrite: !hasFinalNewline
  }
}

export const parseBakeoffPrivateRuns = raw => parsePrivateRunsState(raw).runs

const manifestProvider = config => redactBakeoffManifest({
  id: config.id,
  model: config.model,
  ...(config.format === undefined ? {} : { format: config.format }),
  ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl })
})

const resumeComparable = manifest => ({
  provider: manifest?.provider,
  options: manifest?.options,
  fixtureIds: manifest?.fixtureIds,
  matrixRunIds: manifest?.matrixRunIds,
  contractVersions: manifest?.contractVersions,
  fixtureContractFingerprint: manifest?.fixtureContractFingerprint,
  providerContractFingerprint: manifest?.providerContractFingerprint,
  experimentFingerprint: manifest?.experimentFingerprint
})

const thrownRun = (attempt, error) => ({
  ...attempt,
  status: 'failed',
  readableText: '',
  rawText: '',
  presentation: null,
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  latencyMs: 0,
  calls: [],
  error: errorShape(error)
})

const KNOWN_ARTIFACT_ERROR_CODES = new Set([
  'CROSS_SECTION_CHARACTER_COUNT',
  'CROSS_SECTION_DUPLICATE_CHARACTER_ID',
  'CROSS_SECTION_DUPLICATE_FACT_ID',
  'CROSS_SECTION_DUPLICATE_FIXTURE_ID',
  'CROSS_SECTION_DUPLICATE_FORBIDDEN_FACT_ID',
  'CROSS_SECTION_DUPLICATE_KNOWN_FACT_ID',
  'CROSS_SECTION_INTERMEDIATE_INVALID',
  'CROSS_SECTION_INVALID_BEAT_RANGE',
  'CROSS_SECTION_INVALID_FACT_VISIBILITY',
  'CROSS_SECTION_INVALID_FIXTURE',
  'CROSS_SECTION_INVALID_FIXTURES',
  'CROSS_SECTION_INVALID_ID',
  'CROSS_SECTION_INVALID_SPEAKER_MAP',
  'CROSS_SECTION_KNOWLEDGE_CONFLICT',
  'CROSS_SECTION_MISSING_FIELD',
  'CROSS_SECTION_PRESENTATION_EMPTY',
  'CROSS_SECTION_PRIVATE_FACT_LITERAL_MARKER_REQUIRED',
  'CROSS_SECTION_PRIVATE_FACT_METADATA_LEAK',
  'CROSS_SECTION_PRIVATE_FACT_NON_OWNER_KNOWS',
  'CROSS_SECTION_PRIVATE_FACT_NON_OWNER_MUST_FORBID',
  'CROSS_SECTION_PRIVATE_FACT_OWNER_FORBIDDEN',
  'CROSS_SECTION_PRIVATE_FACT_OWNER_MUST_KNOW',
  'CROSS_SECTION_PROVIDER_EMPTY_TEXT',
  'CROSS_SECTION_PROVIDER_OUTPUT_TRUNCATED',
  'CROSS_SECTION_PROVIDER_TOOL_CALL_REJECTED',
  'CROSS_SECTION_RUN_FAILED',
  'CROSS_SECTION_UNKNOWN_ARCHITECTURE',
  'CROSS_SECTION_UNKNOWN_CHARACTER',
  'CROSS_SECTION_UNKNOWN_FACT'
])

const safeArtifactError = error => ({
  code: KNOWN_ARTIFACT_ERROR_CODES.has(error?.code) ? error.code : 'CROSS_SECTION_RUN_FAILED',
  message: '截面评测 attempt 失败'
})

const sanitizeArtifactErrors = (value, key = '') => {
  if (value === null || typeof value !== 'object') return value
  if (key === 'error') return safeArtifactError(value)
  if (Array.isArray(value)) return value.map(item => sanitizeArtifactErrors(item))
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
    childKey,
    sanitizeArtifactErrors(childValue, childKey)
  ]))
}

const atomicRepairPrivateRuns = async (fs, path, content) => {
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`
  try {
    await fs.writeFile(temporaryPath, content, { flag: 'wx' })
    await fs.rename(temporaryPath, path)
  } catch (error) {
    try {
      await fs.rm(temporaryPath, { force: true })
    } catch {
      // Preserve the original error; the target JSONL was never overwritten in place.
    }
    throw error
  }
}

export async function generateBakeoffArtifacts(options = {}) {
  const fs = options.fs || nodeFs
  const configPath = options.configPath
  if (!validText(configPath)) {
    throw artifactError('CROSS_SECTION_PROVIDER_CONFIG_INVALID', 'generate 需要 provider config 路径')
  }
  const config = parseProviderConfig(await fs.readFile(configPath, 'utf8'))
  const fixtures = options.fixtures || CROSS_SECTION_FIXTURES
  const portability = options.portability === true
  const selectedArchitecture = String(options.architecture || '').trim()
  if (selectedArchitecture && !portability) {
    throw artifactError(
      'CROSS_SECTION_PORTABILITY_REQUIRED',
      '指定 architecture 时必须启用 portability'
    )
  }
  if (portability && !selectedArchitecture) {
    throw artifactError(
      'CROSS_SECTION_PORTABILITY_ARCHITECTURE_REQUIRED',
      'portability 需要选中 architecture'
    )
  }
  if (portability && !CROSS_SECTION_ARCHITECTURES.includes(selectedArchitecture)) {
    throw artifactError('CROSS_SECTION_UNKNOWN_ARCHITECTURE', 'portability 包含未知架构')
  }
  const repetitions = options.repetitions ?? (portability ? 1 : 3)
  if (portability && repetitions !== 1) {
    throw artifactError('CROSS_SECTION_PORTABILITY_REPETITIONS', 'portability 固定 repetitions=1')
  }
  const architectures = portability
    ? [selectedArchitecture]
    : options.architectures || CROSS_SECTION_ARCHITECTURES
  const matrix = expandBakeoffMatrix({ fixtures, architectures, repetitions })
  const createdDate = dateFromNow(options.now)
  const experimentRunId = String(options.runId || timestampSlug(createdDate))
  if (!RUN_ID_RE.test(experimentRunId)) {
    throw artifactError('CROSS_SECTION_RUN_ID_INVALID', 'run-id 必须是安全 slug', { runId: experimentRunId })
  }
  const outputRoot = options.outputRoot || DEFAULT_BAKEOFF_OUTPUT_ROOT
  const runDir = join(outputRoot, experimentRunId)
  const manifestPath = join(runDir, 'manifest.json')
  const privateRunsPath = join(runDir, 'private-runs.jsonl')
  await fs.mkdir(runDir, { recursive: true })
  const lockOwnership = await acquireGenerateLock(fs, runDir, options, createdDate.toISOString())

  try {
    const fingerprint = createBakeoffExperimentFingerprint({ fixtures, providerConfig: config })
    const desiredManifest = redactBakeoffManifest({
    schemaVersion: 1,
    status: 'in-progress',
    experimentRunId,
    provider: manifestProvider(config),
    options: {
      budgets: { maxTokens: BAKEOFF_MAX_TOKENS, timeoutMs: BAKEOFF_TIMEOUT_MS },
      repetitions,
      ...(portability ? { portability: true, architecture: selectedArchitecture } : {})
    },
    fixtureIds: fixtures.map(({ id }) => id),
    matrixRunIds: matrix.attempts.map(({ runId }) => runId),
    ...fingerprint,
    createdAt: createdDate.toISOString(),
    privateBlindMap: {}
  })
    const existingManifestRaw = await readOptional(fs, manifestPath)
    if (existingManifestRaw === null) {
      await atomicWriteJson(fs, manifestPath, desiredManifest)
    } else {
    let existingManifest
    try {
      existingManifest = JSON.parse(existingManifestRaw)
    } catch (cause) {
      throw artifactError('CROSS_SECTION_RESUME_MANIFEST_INVALID', '现有 manifest.json 损坏', { cause })
    }
      if (existingManifest.experimentRunId !== experimentRunId
      || JSON.stringify(resumeComparable(existingManifest)) !== JSON.stringify(resumeComparable(desiredManifest))) {
        throw artifactError('CROSS_SECTION_RESUME_MISMATCH', '恢复参数与现有 manifest 不一致')
      }
      await atomicWriteJson(fs, manifestPath, {
        ...existingManifest,
        status: 'in-progress'
      })
    }

  const privateRunsRaw = await readOptional(fs, privateRunsPath)
  const privateRunsState = parsePrivateRunsState(privateRunsRaw, { recoverTrailing: true })
  if (privateRunsState.needsRewrite) {
    await atomicRepairPrivateRuns(fs, privateRunsPath, privateRunsState.normalizedRaw)
  }
  const existingRuns = privateRunsState.runs
  const attemptsByRunId = new Map(matrix.attempts.map(attempt => [attempt.runId, attempt]))
  for (const run of existingRuns) {
    const attempt = attemptsByRunId.get(run.runId)
    if (!attempt
      || run.fixtureId !== attempt.fixtureId
      || run.architecture !== attempt.architecture
      || run.repetition !== attempt.repetition) {
      throw artifactError(
        'CROSS_SECTION_RESUME_RUN_MISMATCH',
        `private-runs.jsonl 记录不属于当前 matrix：${run.runId}`,
        { runId: run.runId }
      )
    }
  }
  const recordedRunIds = new Set(existingRuns.map(({ runId }) => runId))
  const fixtureById = new Map(fixtures.map(fixture => [fixture.id, fixture]))
  const provider = options.provider || createBakeoffProvider(config)
  const runner = options.runner || runCrossSectionArchitecture
  const newRuns = []
  let skipped = 0

  for (const attempt of matrix.attempts) {
    if (recordedRunIds.has(attempt.runId)) {
      skipped += 1
      continue
    }
    const fixture = fixtureById.get(attempt.fixtureId)
    let run
    try {
      run = await runner(attempt.architecture, fixture, provider, { runId: attempt.runId })
      run = {
        ...attempt,
        ...run,
        runId: attempt.runId,
        fixtureId: attempt.fixtureId,
        architecture: attempt.architecture,
        repetition: attempt.repetition
      }
      if (run.status === 'success' || run.status === 'completed') {
        run.deterministicEvaluation = scanUnauthorizedFacts({
          fixture,
          runId: attempt.runId,
          presentation: run.presentation
        })
      }
    } catch (error) {
      run = thrownRun(attempt, error)
    }
    run = sanitizeArtifactErrors(run)
    await fs.appendFile(privateRunsPath, `${JSON.stringify(run)}\n`, 'utf8')
    newRuns.push(run)
  }

  const allRuns = [...existingRuns, ...newRuns]
  const bundle = createBlindReviewBundle(allRuns, { experimentRunId, fixtures })
  await atomicWriteJson(fs, join(runDir, 'blind-review.json'), bundle.blindReview)
  await atomicWriteJson(fs, join(runDir, 'review-template.json'), bundle.reviewTemplate)
    await atomicWriteJson(fs, manifestPath, redactBakeoffManifest({
    ...desiredManifest,
    status: 'completed',
    privateBlindMap: bundle.privateBlindMap
    }))

  const completed = allRuns.filter(run => run.status === 'success' || run.status === 'completed').length
    return {
    runDir,
    total: matrix.attemptCount,
    completed,
    failed: allRuns.length - completed,
    skipped
    }
  } finally {
    await releaseGenerateLock(fs, lockOwnership)
  }
}

const mean = values => values.length === 0
  ? null
  : values.reduce((total, value) => total + value, 0) / values.length

const median = values => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

const successfulStatus = status => status === 'success' || status === 'completed'

const forbiddenRelations = fixture => (fixture?.characters || []).flatMap(character => (
  (character.forbiddenFactIds || []).map(factId => ({ speakerId: character.id, factId }))
))

const fixtureByIdFrom = fixtures => new Map((fixtures || []).map(fixture => [fixture.id, fixture]))

export function aggregateBakeoffReport({ runs, reviews, manifest, fixtures = CROSS_SECTION_FIXTURES } = {}) {
  if (!Array.isArray(runs) || !manifest || typeof manifest !== 'object') {
    throw artifactError('CROSS_SECTION_REPORT_INPUT_INVALID', '报告输入缺少 runs 或 manifest')
  }
  const hashPattern = /^[a-f0-9]{64}$/
  const availableFixturesById = fixtureByIdFrom(fixtures)
  const experimentFixtures = Array.isArray(manifest.fixtureIds)
    ? manifest.fixtureIds.map(fixtureId => availableFixturesById.get(fixtureId))
    : fixtures
  if (experimentFixtures.some(fixture => !fixture)) {
    throw artifactError(
      'CROSS_SECTION_REPORT_FINGERPRINT_MISMATCH',
      'manifest fingerprint 引用了当前 catalog 中不存在的 fixture'
    )
  }
  const expectedFixtureContractFingerprint = fixtureContractFingerprintFrom(experimentFixtures)
  const expectedExperimentFingerprint = experimentFingerprintFrom({
    contractVersions: CROSS_SECTION_CONTRACT_VERSIONS,
    fixtureContractFingerprint: expectedFixtureContractFingerprint,
    providerContractFingerprint: manifest.providerContractFingerprint
  })
  if (stableJson(manifest.contractVersions) !== stableJson(CROSS_SECTION_CONTRACT_VERSIONS)
    || !hashPattern.test(String(manifest.fixtureContractFingerprint || ''))
    || !hashPattern.test(String(manifest.providerContractFingerprint || ''))
    || !hashPattern.test(String(manifest.experimentFingerprint || ''))
    || manifest.fixtureContractFingerprint !== expectedFixtureContractFingerprint
    || manifest.experimentFingerprint !== expectedExperimentFingerprint) {
    throw artifactError(
      'CROSS_SECTION_REPORT_FINGERPRINT_MISMATCH',
      'manifest experiment fingerprint 与当前 fixture/contract 不一致'
    )
  }
  const privateBlindMap = manifest.privateBlindMap
  if (!privateBlindMap || typeof privateBlindMap !== 'object' || Array.isArray(privateBlindMap)) {
    throw artifactError('CROSS_SECTION_REPORT_PRIVATE_MAP_INVALID', 'manifest 缺少 privateBlindMap')
  }
  const matrixRunIds = manifest.matrixRunIds
  if (!Array.isArray(matrixRunIds)
    || matrixRunIds.some(runId => typeof runId !== 'string' || !runId)
    || new Set(matrixRunIds).size !== matrixRunIds.length
    || runs.length !== matrixRunIds.length
    || new Set(runs.map(run => run?.runId)).size !== runs.length
    || matrixRunIds.some(runId => !runs.some(run => run?.runId === runId))) {
    throw artifactError('CROSS_SECTION_REPORT_MATRIX_MISMATCH', 'runs 必须与 manifest matrixRunIds 完整一一对应')
  }
  for (const run of runs) {
    const expectedRunId = `${run?.fixtureId}-${run?.architecture}-r${run?.repetition}`
    if (!fixtureByIdFrom(fixtures).has(run?.fixtureId)
      || !CROSS_SECTION_ARCHITECTURES.includes(run?.architecture)
      || !Number.isInteger(run?.repetition)
      || run.repetition < 1
      || run.runId !== expectedRunId) {
      throw artifactError(
        'CROSS_SECTION_REPORT_RUN_METADATA_INVALID',
        `run metadata 与 matrix 不一致：${String(run?.runId || '')}`,
        { runId: String(run?.runId || '') }
      )
    }
    if (successfulStatus(run.status)) {
      const presentationBlocks = Array.isArray(run.presentation?.blocks)
        ? run.presentation.blocks
        : []
      const hasReadablePresentationBlock = presentationBlocks.some(block => (
        READABLE_BLOCK_KINDS.has(block?.kind) && String(block?.text || '').trim()
      ))
      if (!String(run.readableText || '').trim() || !hasReadablePresentationBlock) {
        throw artifactError(
          'CROSS_SECTION_REPORT_RUN_OUTPUT_INVALID',
          `成功 run 缺少可读正文或有效 presentation：${run.runId}`,
          { runId: run.runId }
        )
      }
      const usage = run.usage
      const usageValues = [usage?.inputTokens, usage?.outputTokens, usage?.totalTokens]
      if (usageValues.some(value => !Number.isFinite(value) || value < 0)
        || usage.totalTokens !== usage.inputTokens + usage.outputTokens
        || !Number.isFinite(run.latencyMs)
        || run.latencyMs < 0) {
        throw artifactError(
          'CROSS_SECTION_REPORT_RUN_METRICS_INVALID',
          `成功 run 的 usage/latency 无效：${run.runId}`,
          { runId: run.runId }
        )
      }
    }
  }
  const runsByIdForMapping = new Map(runs.map(run => [run.runId, run]))
  const eligibleBlindRuns = runs.filter(run => (
    successfulStatus(run.status) && String(run.readableText || '').trim()
  ))
  const mappingEntries = Object.entries(privateBlindMap)
  const mappedRunIds = new Set()
  for (const [blindId, mapping] of mappingEntries) {
    const run = runsByIdForMapping.get(String(mapping?.runId || ''))
    if (!blindId
      || !run
      || !successfulStatus(run.status)
      || !String(run.readableText || '').trim()
      || mappedRunIds.has(run.runId)
      || mapping.architecture !== run.architecture
      || mapping.fixtureId !== run.fixtureId) {
      throw artifactError(
        'CROSS_SECTION_REPORT_PRIVATE_MAP_INVALID',
        `privateBlindMap 不是成功可读 runs 的一一映射：${blindId}`,
        { blindId }
      )
    }
    mappedRunIds.add(run.runId)
  }
  if (mappingEntries.length !== eligibleBlindRuns.length
    || eligibleBlindRuns.some(run => !mappedRunIds.has(run.runId))) {
    throw artifactError(
      'CROSS_SECTION_REPORT_PRIVATE_MAP_INVALID',
      '每个成功可读 run 必须恰好对应一个 blindId'
    )
  }
  const blindIds = Object.keys(privateBlindMap)
  const validation = validateBakeoffReviews(reviews, { blindIds })
  if (!validation.valid) {
    const { code, ...context } = validation.error
    throw artifactError(code, `截面评测 review 无效：${code}`, context)
  }
  const aggregatedReviews = aggregateHumanReviews(reviews)
  const runsById = new Map(runs.map(run => [String(run?.runId || ''), run]))
  const fixtureById = fixtureByIdFrom(fixtures)
  const currentEvaluationByRunId = new Map(runs
    .filter(run => successfulStatus(run.status))
    .map(run => [run.runId, scanUnauthorizedFacts({
      fixture: fixtureById.get(run.fixtureId),
      runId: run.runId,
      presentation: run.presentation
    })]))
  const reviewByRunId = new Map()
  for (const review of aggregatedReviews) {
    const mapping = privateBlindMap[review.blindId]
    const run = runsById.get(String(mapping?.runId || ''))
    if (!run
      || run.architecture !== mapping.architecture
      || run.fixtureId !== mapping.fixtureId
      || !successfulStatus(run.status)) {
      throw artifactError('CROSS_SECTION_REPORT_PRIVATE_MAP_INVALID', `blind mapping 无法还原成功 run：${review.blindId}`, { blindId: review.blindId })
    }
    reviewByRunId.set(run.runId, review)
  }

  const unresolvedHumanLeaks = []
  const architectures = CROSS_SECTION_ARCHITECTURES.map(architecture => {
    const architectureRuns = runs.filter(run => run.architecture === architecture)
    const successfulRuns = architectureRuns.filter(run => successfulStatus(run.status))
    const reviewedRuns = successfulRuns.filter(run => reviewByRunId.has(run.runId))
    const confirmedLeakKeys = new Set()
    const confirmedFactKeys = new Set()
    let leakOpportunities = 0

    for (const run of reviewedRuns) {
      const fixture = fixtureById.get(run.fixtureId)
      if (!fixture) {
        throw artifactError('CROSS_SECTION_REPORT_FIXTURE_UNKNOWN', `报告 run 引用了未知 fixture：${run.fixtureId}`, { fixtureId: run.fixtureId })
      }
      const relations = forbiddenRelations(fixture)
      const relationKeys = new Set(relations.map(({ speakerId, factId }) => `${speakerId}\u0000${factId}`))
      leakOpportunities += relations.length
      for (const leak of currentEvaluationByRunId.get(run.runId).leaks) {
        const relationKey = `${leak.speakerId}\u0000${leak.factId}`
        if (relationKeys.has(relationKey)) {
          confirmedLeakKeys.add(`${run.runId}\u0000${relationKey}`)
          confirmedFactKeys.add(`${run.runId}\u0000${leak.factId}`)
        }
      }
      const review = reviewByRunId.get(run.runId)
      for (const factId of review.humanLeakFactIds) {
        const candidateRelations = relations.filter(candidate => candidate.factId === factId)
        if (candidateRelations.length === 0) {
          throw artifactError(
            'CROSS_SECTION_REVIEW_UNKNOWN_LEAK_FACT_ID',
            `humanLeakFactId 在当前 fixture 中没有 forbidden relation：${factId}`,
            { runId: run.runId, fixtureId: run.fixtureId, factId }
          )
        } else if (candidateRelations.length === 1) {
          const [relation] = candidateRelations
          confirmedLeakKeys.add(`${run.runId}\u0000${relation.speakerId}\u0000${relation.factId}`)
          confirmedFactKeys.add(`${run.runId}\u0000${factId}`)
        } else {
          unresolvedHumanLeaks.push({
            runId: run.runId,
            fixtureId: run.fixtureId,
            factId,
            candidateSpeakerIds: candidateRelations.map(({ speakerId }) => speakerId)
          })
          const factKey = `${run.runId}\u0000${factId}`
          if (!confirmedFactKeys.has(factKey)) {
            confirmedLeakKeys.add(`${run.runId}\u0000unattributed-human\u0000${factId}`)
            confirmedFactKeys.add(factKey)
          }
        }
      }
    }

    const attemptCount = architectureRuns.length
    const successCount = successfulRuns.length
    return {
      architecture,
      attemptCount,
      successCount,
      completionRate: attemptCount === 0 ? 0 : successCount / attemptCount,
      reviewedOutputCount: reviewedRuns.length,
      meanHumanScore: mean(reviewedRuns.map(run => reviewByRunId.get(run.runId).humanScore)),
      meanTokensPerSuccessfulOutput: mean(successfulRuns.map(run => Number(run.usage?.totalTokens || 0))),
      medianLatencyMs: median(successfulRuns.map(run => Number(run.latencyMs || 0))),
      maximumLatencyMs: successfulRuns.length === 0
        ? null
        : Math.max(...successfulRuns.map(run => Number(run.latencyMs || 0))),
      leakOpportunities,
      confirmedLeaks: confirmedLeakKeys.size,
      leakageRate: leakOpportunities === 0 ? 0 : confirmedLeakKeys.size / leakOpportunities
    }
  })
  const baseline = architectures.find(({ architecture }) => architecture === 'single-writer')
  for (const architecture of architectures) {
    architecture.tokenRatioToBaseline = baseline?.meanTokensPerSuccessfulOutput
      && architecture.meanTokensPerSuccessfulOutput !== null
      ? architecture.meanTokensPerSuccessfulOutput / baseline.meanTokensPerSuccessfulOutput
      : null
    architecture.medianLatencyRatioToBaseline = baseline?.medianLatencyMs
      && architecture.medianLatencyMs !== null
      ? architecture.medianLatencyMs / baseline.medianLatencyMs
      : null
    architecture.gates = {
      completion: architecture.completionRate >= 0.9,
      humanScore: architecture.meanHumanScore !== null && architecture.meanHumanScore >= 7,
      leakage: architecture.leakageRate <= 0.05,
      tokenRatioToBaseline: architecture.tokenRatioToBaseline !== null && architecture.tokenRatioToBaseline <= 3,
      medianLatencyRatioToBaseline: architecture.medianLatencyRatioToBaseline !== null
        && architecture.medianLatencyRatioToBaseline <= 2
    }
    architecture.gatePassed = Object.values(architecture.gates).every(Boolean)
  }

  const ranking = architectures
    .filter(({ gatePassed }) => gatePassed)
    .sort((left, right) => (
      right.meanHumanScore - left.meanHumanScore
      || left.leakageRate - right.leakageRate
      || left.meanTokensPerSuccessfulOutput - right.meanTokensPerSuccessfulOutput
      || left.medianLatencyMs - right.medianLatencyMs
    ))
    .map(architecture => ({
      architecture: architecture.architecture,
      meanHumanScore: architecture.meanHumanScore,
      leakageRate: architecture.leakageRate,
      meanTokensPerSuccessfulOutput: architecture.meanTokensPerSuccessfulOutput,
      medianLatencyMs: architecture.medianLatencyMs
    }))
  let decision = 'no-winner'
  let winnerArchitecture = null
  let editorialTieCandidates = []
  if (ranking.length > 0) {
    const top = ranking[0]
    const thresholdEpsilon = Number.EPSILON * 4
    const tied = ranking.filter(candidate => (
      Math.abs(top.meanHumanScore - candidate.meanHumanScore) <= 0.2 + thresholdEpsilon
      && Math.abs(candidate.leakageRate - top.leakageRate) <= 0.02 + thresholdEpsilon
    ))
    if (tied.length > 1) {
      decision = 'editorial-tie'
      editorialTieCandidates = tied.map(({ architecture }) => architecture)
    } else {
      decision = 'winner'
      winnerArchitecture = top.architecture
    }
  }

  return {
    schemaVersion: 1,
    experimentRunId: String(manifest.experimentRunId || ''),
    provider: redactBakeoffManifest(manifest.provider || {}),
    decision,
    winnerArchitecture,
    editorialTieCandidates,
    ranking,
    architectures,
    sampleCounts: {
      attempts: runs.length,
      successful: runs.filter(run => successfulStatus(run.status)).length,
      failed: runs.filter(run => !successfulStatus(run.status)).length,
      reviewedOutputs: aggregatedReviews.length,
      humanReviews: reviews.length
    },
    unresolvedNarrationReviews: runs
      .filter(run => successfulStatus(run.status))
      .flatMap(run => currentEvaluationByRunId.get(run.runId).needsHumanReview),
    unresolvedHumanLeaks
  }
}

const displayMetric = (value, digits = 2) => value === null || value === undefined
  ? '—'
  : Number(value).toFixed(digits).replace(/\.00$/, '')

export function renderBakeoffDecisionMarkdown(report, meta = {}) {
  const decisionText = report.decision === 'winner'
    ? `winner：${report.winnerArchitecture}`
    : report.decision === 'editorial-tie'
      ? `editorial-tie：${report.editorialTieCandidates.join('、')}`
      : 'no-winner：没有架构通过全部门禁'
  const rows = report.architectures.map(item => [
    item.architecture,
    `${item.successCount}/${item.attemptCount}`,
    displayMetric(item.meanHumanScore),
    displayMetric(item.leakageRate),
    displayMetric(item.meanTokensPerSuccessfulOutput),
    displayMetric(item.tokenRatioToBaseline),
    displayMetric(item.medianLatencyMs),
    displayMetric(item.medianLatencyRatioToBaseline),
    displayMetric(item.maximumLatencyMs),
    item.gates.completion ? 'PASS' : 'FAIL',
    item.gates.humanScore ? 'PASS' : 'FAIL',
    item.gates.leakage ? 'PASS' : 'FAIL',
    item.gates.tokenRatioToBaseline ? 'PASS' : 'FAIL',
    item.gates.medianLatencyRatioToBaseline ? 'PASS' : 'FAIL',
    item.gatePassed ? '通过' : '未通过'
  ].join(' | '))
  const unresolved = report.unresolvedNarrationReviews.length === 0
    ? '- 无'
    : report.unresolvedNarrationReviews.map(item => `- ${item.runId || 'unknown'} / ${item.factId || 'unknown'} / ${item.reason || 'unknown'}`).join('\n')
  const unresolvedHuman = report.unresolvedHumanLeaks.length === 0
    ? '- 无'
    : report.unresolvedHumanLeaks.map(item => (
        `- ${item.runId} / ${item.factId} / 候选 speaker：${item.candidateSpeakerIds.join('、') || '无'}`
      )).join('\n')
  const provider = report.provider || {}

  return [
    '# 小说截面架构 Bakeoff 决策',
    '',
    `实验：${meta.experimentRunId || report.experimentRunId || 'unknown'}`,
    `Provider：${provider.id || 'unknown'} / ${provider.model || 'unknown'}`,
    `决策：${decisionText}`,
    '',
    '## 样本数与失败',
    '',
    `样本数：${report.sampleCounts.attempts}；成功：${report.sampleCounts.successful}；失败：${report.sampleCounts.failed}；已审输出：${report.sampleCounts.reviewedOutputs}。`,
    '',
    '## 各架构指标',
    '',
    '架构 | 成功/尝试 | 人工均分 | 泄漏率 | 成功输出平均 tokens | token 比 | 中位延迟 | 延迟比 | 最大延迟（诊断） | 完成率 gate | 评分 gate | 泄漏 gate | token gate | 延迟 gate | 总门禁',
    '--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---',
    ...rows,
    '',
    '## 固定门禁解释',
    '',
    '- 完成率 ≥ 0.90（失败仍计入分母）',
    '- 人工均分 ≥ 7.00（先按每个输出聚合 reviewer）',
    '- 泄漏率 ≤ 0.05',
    '- 相对 single-writer 的 token 比 ≤ 3.00',
    '- 相对 single-writer 的中位延迟比 ≤ 2.00',
    '- 最大延迟（诊断）仅用于排障，不是门禁，也不代表分位数。',
    '',
    '## 未决旁白泄漏',
    '',
    unresolved,
    '',
    '## 未决人工泄漏归因',
    '',
    unresolvedHuman,
    ''
  ].join('\n')
}
