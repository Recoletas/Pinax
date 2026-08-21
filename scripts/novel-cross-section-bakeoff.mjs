#!/usr/bin/env node

import { pathToFileURL } from 'node:url'
import * as nodeFs from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

import {
  CROSS_SECTION_ARCHITECTURES,
  CrossSectionEvaluationError,
  aggregateBakeoffReport,
  expandBakeoffMatrix,
  generateBakeoffArtifacts,
  parseBakeoffPrivateRuns,
  renderBakeoffDecisionMarkdown
} from './lib/novel-cross-section-bakeoff.mjs'
import { CROSS_SECTION_FIXTURES } from './fixtures/novel-cross-section-fixtures.mjs'

const COMMAND_FLAGS = Object.freeze({
  'dry-run': new Set(['repetitions']),
  generate: new Set(['config', 'repetitions', 'output', 'run-id', 'portability', 'architecture']),
  report: new Set(['run', 'reviews'])
})
const BOOLEAN_FLAGS = new Set(['portability'])

const cliError = (code, message, context = {}) => (
  new CrossSectionEvaluationError(code, message, context)
)

export function parseBakeoffArgs(argv) {
  const args = Array.isArray(argv) ? argv : []
  const command = args[0]
  if (!command) throw cliError('CROSS_SECTION_CLI_COMMAND_REQUIRED', '需要 dry-run、generate 或 report 命令')
  const allowedFlags = COMMAND_FLAGS[command]
  if (!allowedFlags) throw cliError('CROSS_SECTION_CLI_UNKNOWN_COMMAND', `未知命令：${command}`, { command })

  const flags = Object.create(null)
  for (let index = 1; index < args.length; index += 1) {
    const token = args[index]
    if (typeof token !== 'string' || !token.startsWith('--')) {
      throw cliError('CROSS_SECTION_CLI_UNKNOWN_FLAG', `未知参数：${token}`)
    }
    const flag = token.slice(2)
    if (!allowedFlags.has(flag)) {
      throw cliError('CROSS_SECTION_CLI_UNKNOWN_FLAG', `命令 ${command} 不支持 --${flag}`, { flag })
    }
    if (Object.prototype.hasOwnProperty.call(flags, flag)) {
      throw cliError('CROSS_SECTION_CLI_DUPLICATE_FLAG', `参数 --${flag} 重复`, { flag })
    }
    if (BOOLEAN_FLAGS.has(flag)) {
      flags[flag] = true
      continue
    }
    const value = args[index + 1]
    if (value === undefined || (typeof value === 'string' && value.startsWith('--'))) {
      throw cliError('CROSS_SECTION_CLI_MISSING_FLAG_VALUE', `参数 --${flag} 缺少值`, { flag })
    }
    flags[flag] = value
    index += 1
  }

  const portability = flags.portability === true
  const repetitions = flags.repetitions === undefined ? (portability ? 1 : 3) : Number(flags.repetitions)
  if ((command === 'dry-run' || command === 'generate')
    && (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5)) {
    throw cliError('CROSS_SECTION_CLI_INVALID_REPETITIONS', 'repetitions 必须是 1–5 的整数')
  }
  const required = command === 'generate' ? ['config'] : command === 'report' ? ['run', 'reviews'] : []
  const missing = required.find(flag => !String(flags[flag] || '').trim())
  if (missing) throw cliError('CROSS_SECTION_CLI_REQUIRED_FLAG', `命令 ${command} 需要 --${missing}`, { flag: missing })

  const architecture = String(flags.architecture || '').trim()
  if (architecture && !portability) {
    throw cliError(
      'CROSS_SECTION_CLI_ARCHITECTURE_REQUIRES_PORTABILITY',
      '--architecture 只能与 --portability 一起使用'
    )
  }
  if (portability && !architecture) {
    throw cliError(
      'CROSS_SECTION_CLI_PORTABILITY_ARCHITECTURE_REQUIRED',
      '--portability 需要 --architecture <winner-id>'
    )
  }
  if (portability && !CROSS_SECTION_ARCHITECTURES.includes(architecture)) {
    throw cliError('CROSS_SECTION_UNKNOWN_ARCHITECTURE', `未知架构：${architecture}`, { architecture })
  }
  if (portability && repetitions !== 1) {
    throw cliError('CROSS_SECTION_CLI_PORTABILITY_REPETITIONS', 'portability 固定 repetitions=1')
  }

  if (command === 'dry-run') return { command, repetitions }
  if (command === 'generate') {
    return {
      command,
      config: flags.config,
      repetitions,
      ...(flags.output === undefined ? {} : { output: flags.output }),
      ...(flags['run-id'] === undefined ? {} : { runId: flags['run-id'] }),
      ...(portability ? { portability: true, architecture } : {})
    }
  }
  return { command, run: flags.run, reviews: flags.reviews }
}

const parseJsonArtifact = (raw, code, label) => {
  try {
    return JSON.parse(raw)
  } catch (cause) {
    throw cliError(code, `${label} 不是有效 JSON`, { cause })
  }
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

const removeQuietly = async (fs, path) => {
  try {
    await fs.rm(path, { force: true })
  } catch {
    // Best-effort cleanup; rollback renames below preserve committed artifacts.
  }
}

const atomicWritePair = async (fs, artifacts) => {
  const token = `${process.pid}-${Date.now()}`
  const staged = artifacts.map(artifact => ({
    ...artifact,
    temporaryPath: `${artifact.path}.tmp-${token}`,
    backupPath: `${artifact.path}.bak-${token}`,
    hadOriginal: false,
    backupCreated: false,
    installed: false
  }))
  try {
    for (const artifact of staged) {
      await fs.writeFile(artifact.temporaryPath, artifact.content, { flag: 'wx' })
    }
    for (const artifact of staged) {
      artifact.hadOriginal = await pathExists(fs, artifact.path)
      if (artifact.hadOriginal) {
        await fs.rename(artifact.path, artifact.backupPath)
        artifact.backupCreated = true
      }
    }
    for (const artifact of staged) {
      await fs.rename(artifact.temporaryPath, artifact.path)
      artifact.installed = true
    }
    for (const artifact of staged) await removeQuietly(fs, artifact.backupPath)
  } catch (error) {
    for (const artifact of [...staged].reverse()) {
      if (artifact.installed) await removeQuietly(fs, artifact.path)
      if (artifact.backupCreated) {
        await fs.rename(artifact.backupPath, artifact.path)
        artifact.backupCreated = false
      }
    }
    for (const artifact of staged) {
      await removeQuietly(fs, artifact.temporaryPath)
      await removeQuietly(fs, artifact.backupPath)
    }
    throw error
  }
}

const createReportArtifacts = async ({ runDir, reviewsPath, fs = nodeFs }) => {
  try {
    await fs.readFile(join(runDir, '.generate.lock'), 'utf8')
    throw cliError('CROSS_SECTION_GENERATE_LOCK_HELD', 'generate 仍在运行，不能生成 report')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const [manifestRaw, privateRunsRaw, reviewsRaw] = await Promise.all([
    fs.readFile(join(runDir, 'manifest.json'), 'utf8'),
    fs.readFile(join(runDir, 'private-runs.jsonl'), 'utf8'),
    fs.readFile(reviewsPath, 'utf8')
  ])
  const manifest = parseJsonArtifact(manifestRaw, 'CROSS_SECTION_REPORT_MANIFEST_INVALID', 'manifest.json')
  if (manifest.status !== 'completed') {
    throw cliError('CROSS_SECTION_RUN_INCOMPLETE', 'manifest 尚未 completed，不能生成 report')
  }
  const reviews = parseJsonArtifact(reviewsRaw, 'CROSS_SECTION_REVIEWS_INVALID', 'reviews')
  const runs = parseBakeoffPrivateRuns(privateRunsRaw)
  const report = aggregateBakeoffReport({
    runs,
    reviews,
    manifest,
    fixtures: CROSS_SECTION_FIXTURES
  })
  const markdown = renderBakeoffDecisionMarkdown(report, {
    experimentRunId: manifest.experimentRunId
  })
  const reportPath = join(runDir, 'report.json')
  const decisionPath = join(runDir, 'decision.md')
  await atomicWritePair(fs, [
    { path: reportPath, content: `${JSON.stringify(report, null, 2)}\n` },
    { path: decisionPath, content: markdown }
  ])
  return {
    runDir,
    reportPath,
    decisionPath,
    decision: report.decision,
    winnerArchitecture: report.winnerArchitecture,
    editorialTieCandidates: report.editorialTieCandidates
  }
}

export async function runBakeoffCli(argv, {
  output = value => process.stdout.write(String(value)),
  generate = generateBakeoffArtifacts,
  fs = nodeFs
} = {}) {
  const args = parseBakeoffArgs(argv)
  let result
  if (args.command === 'dry-run') {
    result = expandBakeoffMatrix({
      fixtures: CROSS_SECTION_FIXTURES,
      architectures: CROSS_SECTION_ARCHITECTURES,
      repetitions: args.repetitions
    })
  } else if (args.command === 'generate') {
    result = await generate({
      configPath: args.config,
      repetitions: args.repetitions,
      ...(args.output === undefined ? {} : { outputRoot: args.output }),
      ...(args.runId === undefined ? {} : { runId: args.runId }),
      ...(args.portability ? { portability: true, architecture: args.architecture } : {})
    })
  } else {
    result = await createReportArtifacts({ runDir: args.run, reviewsPath: args.reviews, fs })
  }
  output(`${JSON.stringify(result, null, 2)}\n`)
  return result
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  runBakeoffCli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${JSON.stringify({
      error: {
        code: String(error?.code || 'CROSS_SECTION_CLI_FAILED'),
        message: String(error?.message || error)
      }
    })}\n`)
    process.exitCode = 1
  })
}
