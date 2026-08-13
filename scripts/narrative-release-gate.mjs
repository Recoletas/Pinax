import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import {
  normalizeNarrativeProductionRun,
  summarizeNarrativeProductionMetrics
} from '../src/services/agents/narrativeProductionMetrics.js'
import { summarizeNarrativeQuality } from './lib/narrative-quality-metrics.mjs'

const REQUIRED_SAMPLE = 60

function usage() {
  return [
    'Usage: npm run gate:narrative-release -- --matrix <matrix.json> [options]',
    '',
    'Options:',
    '  --matrix <file>          R8-B matrix.json path',
    '  --annotations-dir <dir> Directory containing <channel>/annotations.json',
    '  --output <file>         Gate report path (default beside matrix.json)',
    '  --allow-incomplete      Exit 0 while gates are blocked',
    '  --help                  Show this message',
    '',
    'Quality annotations are keyed by runId and must not contain story text or secrets.'
  ].join('\n')
}

function parseArgs(argv) {
  const options = {
    matrix: '',
    annotationsDir: '',
    output: '',
    allowIncomplete: false,
    help: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') options.help = true
    else if (token === '--allow-incomplete') options.allowIncomplete = true
    else if (['--matrix', '--annotations-dir', '--output'].includes(token)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`)
      options[token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value
      index += 1
    } else throw new Error(`Unknown argument: ${token}`)
  }
  if (options.matrix) options.matrix = resolve(options.matrix)
  if (options.annotationsDir) options.annotationsDir = resolve(options.annotationsDir)
  if (options.output) options.output = resolve(options.output)
  return options
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read ${label} JSON at ${path}: ${error.message}`)
  }
}

async function readOptionalJson(path) {
  try {
    await access(path)
    return await readJson(path, 'annotations')
  } catch {
    return null
  }
}

function annotationMap(value) {
  const entries = Array.isArray(value)
    ? value.map((item) => [item?.runId, item])
    : Object.entries(value || {})
  return new Map(entries.filter(([runId]) => String(runId || '').trim()))
}

function ratio(numerator, denominator) {
  if (!denominator) return null
  return Number((numerator / denominator).toFixed(4))
}

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

function gate(name, value, required, met, reason = '') {
  return { name, value, required, met: Boolean(met), ...(reason ? { reason } : {}) }
}

// C7：叙事质量发布阈值（计划 §7.3/§7.4）。quality 由 review-cases.json 计算。
function qualityGates(quality) {
  const missing = (name) => gate(name, null, null, false, '缺少 review-cases.json')
  if (!quality) {
    return {
      shortTurnRate: missing('shortTurnRate'),
      openingSimilarityRate: missing('openingSimilarityRate'),
      fragmentedParagraphRate: missing('fragmentedParagraphRate'),
      tailAnchorCarryRate: missing('tailAnchorCarryRate'),
      playerAgencyViolation: missing('playerAgencyViolation')
    }
  }
  const has = (value) => value != null
  return {
    shortTurnRate: gate('shortTurnRate', quality.shortTurnRate, 0.1,
      has(quality.shortTurnRate) && quality.shortTurnRate <= 0.1,
      has(quality.shortTurnRate) ? '' : '样本不足'),
    openingSimilarityRate: gate('openingSimilarityRate', quality.openingSimilarityRate, 0.08,
      has(quality.openingSimilarityRate) && quality.openingSimilarityRate <= 0.08,
      has(quality.openingSimilarityRate) ? '' : '样本不足（需多轮）'),
    fragmentedParagraphRate: gate('fragmentedParagraphRate', quality.fragmentedParagraphRate, 0.1,
      has(quality.fragmentedParagraphRate) && quality.fragmentedParagraphRate <= 0.1,
      has(quality.fragmentedParagraphRate) ? '' : '样本不足'),
    tailAnchorCarryRate: gate('tailAnchorCarryRate', quality.tailAnchorCarryRate, 0.9,
      has(quality.tailAnchorCarryRate) && quality.tailAnchorCarryRate >= 0.9,
      has(quality.tailAnchorCarryRate) ? '' : '样本不足（需多轮）'),
    playerAgencyViolation: gate('playerAgencyViolation', quality.playerAgencyViolationRate, 0,
      has(quality.playerAgencyViolationRate) && quality.playerAgencyViolationRate === 0,
      has(quality.playerAgencyViolationRate) ? '' : '样本不足')
  }
}

function buildChannelGate(channel, metrics, annotations, reviewCases = null) {
  const rawEvents = Array.isArray(metrics?.events) ? metrics.events : []
  const byRunId = annotationMap(annotations)
  const pairs = rawEvents.map((raw) => ({
    raw,
    event: normalizeNarrativeProductionRun({
      ...raw,
      quality: { ...(raw?.quality || {}), ...(byRunId.get(raw?.runId)?.quality || {}) }
    }),
    annotation: byRunId.get(raw?.runId) || null
  }))
  const events = pairs.map((pair) => pair.event)
  const summary = summarizeNarrativeProductionMetrics(events)
  const successes = pairs.filter(({ event }) => event.outcome === 'success')
  const failures = pairs.filter(({ event }) => event.outcome === 'error')
  const completed = pairs.filter(({ event }) => event.outcome !== 'cancelled')
  const protocolKnown = events.filter((event) => typeof event.protocolOk === 'boolean')
  const required = pairs.filter(({ event }) => event.groundingPolicy === 'required')
  const repairCases = pairs.filter(({ annotation }) => annotation?.quality?.repairRequired === true)
  const repairPassed = repairCases.filter(({ annotation }) => annotation.quality.repairSucceeded === true)
  const evidenceLabeled = required.filter(({ annotation }) => typeof annotation?.quality?.evidenceHit === 'boolean')
  const evidencePassed = evidenceLabeled.filter(({ annotation }) => annotation.quality.evidenceHit === true)
  const reductionEvents = pairs.filter(({ annotation }) => (
    Number.isFinite(Number(annotation?.quality?.unsupportedFacts))
    && Number.isFinite(Number(annotation?.quality?.baselineUnsupportedFacts))
    && Number(annotation.quality.baselineUnsupportedFacts) > 0
  ))
  const unsupportedFacts = reductionEvents.reduce(
    (total, { annotation }) => total + Number(annotation.quality.unsupportedFacts),
    0
  )
  const baselineUnsupportedFacts = reductionEvents.reduce(
    (total, { annotation }) => total + Number(annotation.quality.baselineUnsupportedFacts),
    0
  )
  const unsupportedReduction = baselineUnsupportedFacts > 0
    ? Number((1 - unsupportedFacts / baselineUnsupportedFacts).toFixed(4))
    : null
  const noTool = pairs.filter(({ event }) => event.tools.calls === 0)
  const noToolTiming = noTool
    .filter(({ raw }) => Object.prototype.hasOwnProperty.call(raw?.timing || {}, 'decisionMs'))
    .map(({ event }) => event.timing.decisionMs)
  const p95NoToolDecisionMs = percentile(noToolTiming, 0.95)
  const silentRequired = required.filter(({ event }) => (
    event.outcome === 'success' && event.tools.evidenceCount === 0
  ))
  const cleanupPassed = failures.filter(({ event }) => (
    event.cleanup.renderSettled
    && event.cleanup.requestReleased
    && event.cleanup.loadingOwnerSettled
    && event.cleanup.failureVisible
  ))
  const aligned = completed.filter(({ event }) => (
    event.orphanedCallCount === 0 && Boolean(event.transcriptRevision)
  ))
  const quality = reviewCases
    ? summarizeNarrativeQuality((Array.isArray(reviewCases) ? reviewCases : []).map((item) => ({
        input: item?.action || '',
        response: item?.response || ''
      })))
    : null
  const gates = {
    sampleSize: gate(
      'sampleSize',
      events.length,
      REQUIRED_SAMPLE,
      events.length >= REQUIRED_SAMPLE,
      events.length >= REQUIRED_SAMPLE ? '' : `需要至少 ${REQUIRED_SAMPLE} 轮`
    ),
    providerProtocol: gate(
      'providerProtocol',
      ratio(protocolKnown.filter((event) => event.protocolOk).length, protocolKnown.length),
      0.98,
      protocolKnown.length > 0
        && ratio(protocolKnown.filter((event) => event.protocolOk).length, protocolKnown.length) >= 0.98,
      protocolKnown.length ? '' : '没有可验证的 protocolOk 指标'
    ),
    terminalNonEmpty: gate(
      'terminalNonEmpty',
      ratio(successes.filter(({ event }) => event.timing.outputChars > 0).length, successes.length),
      0.99,
      successes.length > 0
        && ratio(successes.filter(({ event }) => event.timing.outputChars > 0).length, successes.length) >= 0.99,
      successes.length ? '' : '没有成功终态样本'
    ),
    toolRounds: gate(
      'toolRounds',
      summary.rates.toolRoundCompliance,
      0.95,
      summary.rates.toolRoundCompliance != null && summary.rates.toolRoundCompliance >= 0.95
    ),
    repairSuccess: gate(
      'repairSuccess',
      ratio(repairPassed.length, repairCases.length),
      0.9,
      repairCases.length > 0 && ratio(repairPassed.length, repairCases.length) >= 0.9,
      repairCases.length ? '' : '缺少 repairRequired/repairSucceeded 人工标注'
    ),
    requiredGrounding: gate(
      'requiredGrounding',
      silentRequired.length,
      0,
      required.length > 0 && silentRequired.length === 0,
      required.length ? '' : '本批没有 required grounding 样本'
    ),
    transcriptAlignment: gate(
      'transcriptAlignment',
      ratio(aligned.length, completed.length),
      1,
      completed.length > 0 && aligned.length === completed.length,
      completed.length ? '' : '没有可对齐的完成样本'
    ),
    typedFailureCleanup: gate(
      'typedFailureCleanup',
      ratio(cleanupPassed.length, failures.length),
      1,
      failures.length > 0 && cleanupPassed.length === failures.length,
      failures.length ? '' : '没有受控失败样本'
    ),
    evidenceHit: gate(
      'evidenceHit',
      ratio(evidencePassed.length, evidenceLabeled.length),
      0.9,
      evidenceLabeled.length === required.length
        && required.length > 0
        && ratio(evidencePassed.length, evidenceLabeled.length) >= 0.9,
      evidenceLabeled.length === required.length ? '' : 'required 样本缺少 evidenceHit 标注'
    ),
    unsupportedFactReduction: gate(
      'unsupportedFactReduction',
      unsupportedReduction,
      0.3,
      reductionEvents.length > 0 && unsupportedReduction != null && unsupportedReduction >= 0.3,
      reductionEvents.length ? '' : '缺少 unsupportedFacts/baselineUnsupportedFacts 标注'
    ),
    noToolDecisionP95: gate(
      'noToolDecisionP95',
      p95NoToolDecisionMs,
      600,
      noTool.length > 0 && noToolTiming.length === noTool.length && p95NoToolDecisionMs <= 600,
      noTool.length && noToolTiming.length === noTool.length ? '' : '缺少 no-tool decisionMs 指标'
    ),
    orphanedCalls: gate(
      'orphanedCalls',
      events.reduce((total, event) => total + event.orphanedCallCount, 0),
      0,
      events.length > 0 && events.every((event) => event.orphanedCallCount === 0)
    ),
    ...qualityGates(quality)
  }
  return {
    id: channel.id,
    label: channel.label,
    status: channel.status,
    sample: events.length,
    annotationCoverage: {
      total: pairs.length,
      repairCases: repairCases.length,
      requiredEvidence: required.length,
      requiredEvidenceLabeled: evidenceLabeled.length,
      unsupportedFactRuns: reductionEvents.length
    },
    gates,
    releaseReady: Object.values(gates).every((item) => item.met)
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) return process.stdout.write(`${usage()}\n`)
  if (!options.matrix) throw new Error('--matrix is required')
  const matrix = await readJson(options.matrix, 'matrix')
  const channels = []
  for (const channel of Array.isArray(matrix.channels) ? matrix.channels : []) {
    if (channel.status !== 'executed' || !channel.outputDir) {
      channels.push({
        id: channel.id,
        label: channel.label,
        status: channel.status || 'missing',
        sample: 0,
        gates: {
          channelConfigured: gate('channelConfigured', false, true, false, '渠道没有可用矩阵产物')
        },
        releaseReady: false
      })
      continue
    }
    const metrics = await readJson(join(channel.outputDir, 'metrics.json'), `${channel.id} metrics`)
    const annotationPath = options.annotationsDir
      ? join(options.annotationsDir, channel.id, 'annotations.json')
      : join(channel.outputDir, 'annotations.json')
    const annotations = await readOptionalJson(annotationPath)
    const reviewCases = await readOptionalJson(join(channel.outputDir, 'review-cases.json'))
    channels.push(buildChannelGate(channel, metrics, annotations, reviewCases))
  }
  const report = {
    schemaVersion: 1,
    gate: 'narrative-release-v1',
    generatedAt: new Date().toISOString(),
    matrixPath: options.matrix,
    channels,
    releaseReady: channels.length > 0
      && channels.length === (Array.isArray(matrix.channels) ? matrix.channels.length : 0)
      && channels.every((channel) => channel.releaseReady),
    blockedChannels: channels.filter((channel) => !channel.releaseReady).map((channel) => channel.id)
  }
  const outputPath = options.output || join(resolve(options.matrix, '..'), 'release-gate.json')
  await mkdir(resolve(outputPath, '..'), { recursive: true })
  await writeFile(outputPath, JSON.stringify(report, null, 2))
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (!report.releaseReady && !options.allowIncomplete) process.exitCode = 2
}

main().catch((error) => {
  process.stderr.write(`Narrative release gate failed: ${error.message}\n`)
  process.exitCode = 1
})
