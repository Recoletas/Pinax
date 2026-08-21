#!/usr/bin/env node

import * as nodeFs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { createBakeoffProvider } from './lib/novel-cross-section-bakeoff.mjs'
import {
  DEFAULT_RELATION_AB_OUTPUT_ROOT,
  aggregateRelationAbReport,
  buildRelationReviewTemplate,
  createRelationBlindPairs,
  expandRelationAbMatrix,
  generateRelationAbArtifacts,
  renderRelationDecisionMarkdown
} from './lib/novel-cross-section-relation-ab.mjs'

const COMMAND_FLAGS = Object.freeze({
  'dry-run': new Set(),
  generate: new Set(['config', 'output', 'run', 'stage-2']),
  report: new Set(['run', 'reviews'])
})
const BOOLEAN_FLAGS = new Set(['stage-2'])

const cliError = (code, message, context = {}) => Object.assign(new Error(message), { code, ...context })
const hasText = value => typeof value === 'string' && value.trim().length > 0

export function parseRelationAbArgs(argv) {
  const tokens = Array.isArray(argv) ? argv : []
  const command = tokens[0]
  if (!command) throw cliError('CROSS_SECTION_RELATION_CLI_COMMAND_REQUIRED', '需要 dry-run、generate 或 report 命令')
  const allowedFlags = COMMAND_FLAGS[command]
  if (!allowedFlags) throw cliError('CROSS_SECTION_RELATION_CLI_UNKNOWN_COMMAND', `未知命令：${command}`)

  const flags = Object.create(null)
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (typeof token !== 'string' || !token.startsWith('--')) {
      throw cliError('CROSS_SECTION_RELATION_CLI_UNKNOWN_FLAG', `未知参数：${token}`)
    }
    const flag = token.slice(2)
    if (!allowedFlags.has(flag)) {
      throw cliError('CROSS_SECTION_RELATION_CLI_UNKNOWN_FLAG', `命令 ${command} 不支持 --${flag}`)
    }
    if (Object.prototype.hasOwnProperty.call(flags, flag)) {
      throw cliError('CROSS_SECTION_RELATION_CLI_DUPLICATE_FLAG', `参数 --${flag} 重复`)
    }
    if (BOOLEAN_FLAGS.has(flag)) {
      flags[flag] = true
      continue
    }
    const value = tokens[index + 1]
    if (!hasText(value) || String(value).startsWith('--')) {
      throw cliError('CROSS_SECTION_RELATION_CLI_MISSING_FLAG_VALUE', `参数 --${flag} 缺少值`)
    }
    flags[flag] = value
    index += 1
  }

  if (command === 'dry-run') return { command: 'dry-run' }
  if (command === 'report') {
    if (!hasText(flags.run) || !hasText(flags.reviews)) {
      throw cliError('CROSS_SECTION_RELATION_CLI_REQUIRED_FLAG', 'report 需要 --run 与 --reviews')
    }
    const runDir = flags.run.trim()
    const reviewsPath = flags.reviews.trim()
    const outputPaths = new Set([
      resolve(join(runDir, 'report.json')),
      resolve(join(runDir, 'decision.md'))
    ])
    if (outputPaths.has(resolve(reviewsPath))) {
      throw cliError('CROSS_SECTION_RELATION_REVIEWS_OUTPUT_CONFLICT', 'reviews 文件不能与 report 输出路径相同')
    }
    return { command, runDir, reviewsPath }
  }

  if (!hasText(flags.config)) {
    throw cliError('CROSS_SECTION_RELATION_CLI_REQUIRED_FLAG', 'generate 需要 --config')
  }
  const stage2 = flags['stage-2'] === true
  if (stage2 && !hasText(flags.run)) {
    throw cliError('CROSS_SECTION_RELATION_STAGE2_REQUIRES_STAGE1', 'Stage 2 需要 --run 指向已完成的 Stage 1')
  }
  if (!stage2 && flags.run) {
    throw cliError('CROSS_SECTION_RELATION_CLI_RUN_REQUIRES_STAGE2', '--run 只用于 --stage-2')
  }
  if (stage2 && flags.output) {
    throw cliError('CROSS_SECTION_RELATION_CLI_OUTPUT_CONFLICT', 'Stage 2 直接扩展 --run，不接受 --output')
  }
  return {
    command,
    configPath: flags.config.trim(),
    stage: stage2 ? 2 : 1,
    ...(stage2 ? { runDir: flags.run.trim() } : {}),
    ...(!stage2 && hasText(flags.output) ? { outputRoot: flags.output.trim() } : {})
  }
}

const parseJson = (raw, code, label) => {
  try {
    return JSON.parse(raw)
  } catch (cause) {
    throw cliError(code, `${label} 不是有效 JSON`, { cause })
  }
}

const parseProviderConfig = raw => {
  const parsed = parseJson(raw, 'CROSS_SECTION_RELATION_PROVIDER_CONFIG_INVALID', 'provider config')
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  const config = isObject(parsed) && Object.keys(parsed).length === 1 && isObject(parsed.provider)
    ? parsed.provider
    : parsed
  if (!isObject(config) || !String(config.id || '').trim() || !String(config.model || '').trim()) {
    throw cliError('CROSS_SECTION_RELATION_PROVIDER_CONFIG_INVALID', 'provider config 必须是单个 provider 对象')
  }
  return config
}

const parsePrivateRuns = raw => String(raw || '')
  .split('\n')
  .filter(line => line.trim())
  .map(line => parseJson(line, 'CROSS_SECTION_RELATION_PRIVATE_RUN_INVALID', 'private-runs.jsonl'))

const removeQuietly = async (fs, path) => {
  try { await fs.rm(path, { force: true }) } catch { /* best effort */ }
}

const pathExists = async (fs, path) => {
  try {
    await fs.readFile(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

const atomicWriteArtifacts = async (fs, artifacts) => {
  const token = `${process.pid}-${Date.now()}`
  const staged = artifacts.map(artifact => ({
    ...artifact,
    temporaryPath: `${artifact.path}.tmp-${token}`,
    backupPath: `${artifact.path}.bak-${token}`,
    hadOriginal: false,
    installed: false
  }))
  try {
    for (const artifact of staged) {
      await fs.writeFile(artifact.temporaryPath, artifact.content, { flag: 'wx' })
    }
    for (const artifact of staged) {
      artifact.hadOriginal = await pathExists(fs, artifact.path)
      if (artifact.hadOriginal) await fs.rename(artifact.path, artifact.backupPath)
    }
    for (const artifact of staged) {
      await fs.rename(artifact.temporaryPath, artifact.path)
      artifact.installed = true
    }
    for (const artifact of staged) if (artifact.hadOriginal) await removeQuietly(fs, artifact.backupPath)
  } catch (error) {
    for (const artifact of [...staged].reverse()) {
      if (artifact.installed) await removeQuietly(fs, artifact.path)
      if (artifact.hadOriginal) {
        try { await fs.rename(artifact.backupPath, artifact.path) } catch { /* preserve original error */ }
      }
      await removeQuietly(fs, artifact.temporaryPath)
    }
    throw error
  }
}

const writeReviewArtifacts = async ({ fs, runDir }) => {
  const [manifestRaw, privateRaw] = await Promise.all([
    fs.readFile(join(runDir, 'manifest.json'), 'utf8'),
    fs.readFile(join(runDir, 'private-runs.jsonl'), 'utf8')
  ])
  const manifest = parseJson(manifestRaw, 'CROSS_SECTION_RELATION_MANIFEST_INVALID', 'manifest.json')
  const runs = parsePrivateRuns(privateRaw)
  const bundle = createRelationBlindPairs(runs, {
    seed: manifest.experimentRunId || 'relation-ab',
    includePrivate: true
  })
  manifest.privateBlindMap = bundle.privateBlindMap
  const blindPairs = { pairs: bundle.pairs, incompletePairs: bundle.incompletePairs }
  const reviewTemplate = buildRelationReviewTemplate(blindPairs)
  await atomicWriteArtifacts(fs, [
    { path: join(runDir, 'manifest.json'), content: `${JSON.stringify(manifest, null, 2)}\n` },
    { path: join(runDir, 'blind-pairs.json'), content: `${JSON.stringify(blindPairs, null, 2)}\n` },
    { path: join(runDir, 'review-template.json'), content: `${JSON.stringify(reviewTemplate, null, 2)}\n` }
  ])
  return { runDir, attemptCount: runs.length, pairCount: bundle.pairs.length, incompletePairCount: bundle.incompletePairs.length }
}

const createReport = async ({ fs, runDir, reviewsPath }) => {
  const [manifestRaw, privateRaw, blindRaw, reviewsRaw] = await Promise.all([
    fs.readFile(join(runDir, 'manifest.json'), 'utf8'),
    fs.readFile(join(runDir, 'private-runs.jsonl'), 'utf8'),
    fs.readFile(join(runDir, 'blind-pairs.json'), 'utf8'),
    fs.readFile(reviewsPath, 'utf8')
  ])
  const manifest = parseJson(manifestRaw, 'CROSS_SECTION_RELATION_MANIFEST_INVALID', 'manifest.json')
  const runs = parsePrivateRuns(privateRaw)
  const blindPairs = parseJson(blindRaw, 'CROSS_SECTION_RELATION_BLIND_PAIRS_INVALID', 'blind-pairs.json')
  const reviews = parseJson(reviewsRaw, 'CROSS_SECTION_RELATION_REVIEWS_INVALID', 'reviews.json')
  const report = aggregateRelationAbReport({
    runs,
    reviews,
    manifest,
    blindPairs,
    privateBlindMap: manifest.privateBlindMap
  })
  const markdown = renderRelationDecisionMarkdown(report, {
    provider: manifest.provider?.provider,
    model: manifest.provider?.model
  })
  await atomicWriteArtifacts(fs, [
    { path: join(runDir, 'report.json'), content: `${JSON.stringify(report, null, 2)}\n` },
    { path: join(runDir, 'decision.md'), content: `${markdown}\n` }
  ])
  return { runDir, decision: report.decision }
}

const assertCompletedStage1 = async (fs, runDir) => {
  let raw
  try {
    raw = await fs.readFile(join(runDir, 'manifest.json'), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw cliError('CROSS_SECTION_RELATION_STAGE2_REQUIRES_STAGE1', 'Stage 2 需要已完成的 Stage 1 run 目录')
    }
    throw error
  }
  const manifest = parseJson(raw, 'CROSS_SECTION_RELATION_MANIFEST_INVALID', 'manifest.json')
  const repetitions = Number(manifest.repetitions || manifest.options?.repetitions)
  if (manifest.status !== 'complete' || repetitions !== 2) {
    throw cliError('CROSS_SECTION_RELATION_STAGE2_REQUIRES_STAGE1', 'Stage 2 只能扩展已完成的 2-repetition Stage 1')
  }
}

export async function runRelationAbCli(argv, {
  fs = nodeFs,
  stdout = value => process.stdout.write(String(value)),
  generate = generateRelationAbArtifacts,
  createProvider = createBakeoffProvider,
  finalize = writeReviewArtifacts,
  report = createReport
} = {}) {
  const args = parseRelationAbArgs(argv)
  let result
  if (args.command === 'dry-run') {
    result = expandRelationAbMatrix({ repetitions: 2 })
  } else if (args.command === 'generate') {
    if (args.stage === 2) await assertCompletedStage1(fs, args.runDir)
    const config = parseProviderConfig(await fs.readFile(args.configPath, 'utf8'))
    const runDir = await generate({
      fs,
      providerConfig: {
        provider: config.id,
        model: config.model,
        baseUrl: config.baseUrl || '',
        format: config.format || ''
      },
      provider: createProvider(config),
      stage: args.stage,
      repetitions: args.stage === 1 ? 2 : 3,
      ...(args.stage === 2 ? { runDir: args.runDir } : { outputRoot: args.outputRoot || DEFAULT_RELATION_AB_OUTPUT_ROOT })
    })
    result = await finalize({ fs, runDir })
  } else {
    result = await report({ fs, runDir: args.runDir, reviewsPath: args.reviewsPath })
  }
  stdout(`${JSON.stringify(result, null, 2)}\n`)
  return result
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  runRelationAbCli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${JSON.stringify({
      error: {
        code: String(error?.code || 'CROSS_SECTION_RELATION_CLI_FAILED'),
        message: String(error?.message || error)
      }
    })}\n`)
    process.exitCode = 1
  })
}
