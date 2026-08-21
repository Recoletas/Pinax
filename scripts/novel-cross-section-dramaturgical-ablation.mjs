#!/usr/bin/env node

import { pathToFileURL } from 'node:url'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import * as nodeFs from 'node:fs/promises'
import process from 'node:process'

import '../server/loadEnv.js'
import { createBakeoffProvider } from './lib/novel-cross-section-bakeoff.mjs'
import {
  AUTHENTICITY_EDITOR_CONTRACT_VERSION,
  runAuthenticityEditor
} from './lib/novel-cross-section-authenticity-editor.mjs'
import { CROSS_SECTION_DRAMATURGICAL_FIXTURES } from './fixtures/novel-cross-section-dramaturgical-fixtures.mjs'
import {
  DEFAULT_DRAMATURGICAL_OUTPUT_ROOT,
  DRAMATURGICAL_AUTHORING_CONTRACT_VERSION,
  DRAMATURGICAL_CONDITIONS,
  DRAMATURGICAL_EVALUATOR_CONTRACT_VERSION,
  DRAMATURGICAL_PROMPT_CONTRACT_VERSION,
  DRAMATURGICAL_RELATION_MODES,
  DRAMATURGICAL_RUNNER_CONTRACT_VERSION,
  buildDramaturgicalAuthoringTemplate,
  buildDramaturgicalReviewTemplate,
  createDramaturgicalBlindPairs,
  dramaturgicalError,
  expandDramaturgicalMatrix,
  generateDramaturgicalArtifacts
} from './lib/novel-cross-section-dramaturgical-ablation.mjs'

const FLAGS = Object.freeze({
  'dry-run': new Set(),
  generate: new Set(['config', 'output', 'run', 'relation-mode']),
  edit: new Set(['config', 'output', 'run', 'run-ids'])
})

const text = value => typeof value === 'string' ? value.trim() : ''

export function parseDramaturgicalArgs(argv) {
  const tokens = Array.isArray(argv) ? argv : []
  const command = tokens[0]
  const allowed = FLAGS[command]
  if (!allowed) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_CLI_COMMAND_INVALID', '需要 dry-run、generate 或 edit 命令')
  }
  const flags = {}
  for (let index = 1; index < tokens.length; index += 2) {
    const token = tokens[index]
    const value = tokens[index + 1]
    if (!text(token).startsWith('--') || !allowed.has(token.slice(2))) {
      throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_CLI_FLAG_INVALID', `未知参数：${token}`)
    }
    const name = token.slice(2)
    if (Object.hasOwn(flags, name)) {
      throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_CLI_FLAG_DUPLICATE', `参数重复：--${name}`)
    }
    if (!text(value) || text(value).startsWith('--')) {
      throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_CLI_FLAG_VALUE_REQUIRED', `参数缺少值：--${name}`)
    }
    flags[name] = text(value)
  }
  if (command === 'dry-run') return { command }

  if (command === 'edit') {
    for (const name of ['run', 'output']) {
      if (!flags[name]) {
        throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_CLI_FLAG_VALUE_REQUIRED', `edit 缺少 --${name}`)
      }
      if (!isAbsolute(flags[name])) {
        throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PATH_INVALID', `--${name} 必须是绝对路径`)
      }
    }
    const sourceRun = resolve(flags.run)
    const outputDir = resolve(flags.output)
    const outputOffset = relative(sourceRun, outputDir)
    const outputInsideSource = !outputOffset
      || (outputOffset !== '..' && !outputOffset.startsWith(`..${sep}`) && !isAbsolute(outputOffset))
    if (outputInsideSource) {
      throw dramaturgicalError('CROSS_SECTION_AUTHENTICITY_OUTPUT_CONFLICT', '编辑输出不能覆盖冻结 run')
    }
    if (flags.config && !isAbsolute(flags.config)) {
      throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PATH_INVALID', '--config 必须是绝对路径')
    }
    const runIds = String(flags['run-ids'] || '').split(',').map(text).filter(Boolean)
    if (runIds.length === 0) {
      throw dramaturgicalError('CROSS_SECTION_AUTHENTICITY_RUN_IDS_REQUIRED', 'edit 缺少 --run-ids')
    }
    if (new Set(runIds).size !== runIds.length) {
      throw dramaturgicalError('CROSS_SECTION_AUTHENTICITY_RUN_IDS_DUPLICATE', 'edit run id 重复')
    }
    return {
      command,
      runDir: flags.run,
      outputDir: flags.output,
      runIds,
      ...(flags.config ? { configPath: flags.config } : {})
    }
  }

  const relationMode = flags['relation-mode'] || 'none'
  if (!DRAMATURGICAL_RELATION_MODES.includes(relationMode)) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_RELATION_MODE_INVALID', 'relation-mode 只能是 none 或 minimal-relation')
  }
  for (const name of ['config', 'output', 'run']) {
    if (flags[name] && !isAbsolute(flags[name])) {
      throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PATH_INVALID', `--${name} 必须是绝对路径`)
    }
  }
  if (flags.output && flags.run) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_CLI_PATH_CONFLICT', '--output 与 --run 不能同时使用')
  }
  return {
    command,
    ...(flags.config ? { configPath: flags.config } : {}),
    ...(flags.output ? { outputRoot: flags.output } : {}),
    ...(flags.run ? { runDir: flags.run } : {}),
    relationMode
  }
}

const parseConfig = raw => {
  let value
  try { value = JSON.parse(raw) } catch (cause) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PROVIDER_INVALID', 'provider config 不是有效 JSON', { cause })
  }
  const config = value?.provider && Object.keys(value).length === 1 ? value.provider : value
  if (!config || typeof config !== 'object' || !text(config.id) || !text(config.model)) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_PROVIDER_INVALID', 'provider config 缺少 id/model')
  }
  return config
}

const builtinMiniMaxConfig = () => {
  const apiKey = text(process.env.MINIMAX_API_KEY)
  if (!apiKey) {
    throw dramaturgicalError(
      'CROSS_SECTION_DRAMATURGY_PROVIDER_INVALID',
      '未找到 MINIMAX_API_KEY；请配置 server/.env，或传入 --config'
    )
  }
  return {
    id: 'minimax',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    apiKey,
    model: 'MiniMax-M3',
    format: 'anthropic'
  }
}

const parsePrivateRuns = raw => String(raw || '')
  .split('\n')
  .filter(Boolean)
  .map(line => JSON.parse(line))

const renderBlindPairsText = bundle => bundle.pairs.map((pair, index) => [
  `第 ${index + 1} 组（${pair.pairId}）`,
  '',
  '左侧文本',
  pair.left.text,
  '',
  '右侧文本',
  pair.right.text,
  '',
  '简评（可只写你有感觉的项）',
  '关系与细节：',
  '动机与变化：',
  '真实感问题：',
  '偏好：左 / 右 / 平',
  '备注：'
].join('\n')).join('\n\n==============================\n\n') + '\n'

const renderAuthoringText = template => template.participants[0].tasks.map((task, index) => [
  `任务 ${index + 1}：${task.context.fixtureTitle}`,
  `类型：${task.stage === 'minimal-engine' ? '四问极小引擎' : '额外戏剧术语（可跳过）'}`,
  '',
  ...task.questions.flatMap(question => [question.prompt, ''])
].join('\n')).join('\n------------------------------\n\n') + '\n'

const renderAuthenticityEditsText = edits => edits.map((edit, index) => [
  `样本 ${index + 1}：${edit.runId}`,
  `状态：${edit.status}`,
  '',
  '原稿',
  edit.originalReadableText || edit.originalText,
  '',
  '局部编辑稿',
  edit.readableText || edit.originalReadableText || edit.originalText,
  '',
  '修改记录',
  ...(edit.findings?.length
    ? edit.findings.map((finding, findingIndex) => `${findingIndex + 1}. ${finding.type}：${finding.reason}`)
    : ['无'])
].join('\n')).join('\n\n==============================\n\n') + '\n'

const runAuthenticityEditCommand = async ({ fs, args, provider }) => {
  const [manifestRaw, privateRaw] = await Promise.all([
    fs.readFile(join(args.runDir, 'manifest.json'), 'utf8'),
    fs.readFile(join(args.runDir, 'private-runs.jsonl'), 'utf8')
  ])
  let manifest
  try { manifest = JSON.parse(manifestRaw) } catch (cause) {
    throw dramaturgicalError('CROSS_SECTION_DRAMATURGY_MANIFEST_INVALID', '源 run manifest 无效', { cause })
  }
  if (manifest?.status !== 'complete') {
    throw dramaturgicalError('CROSS_SECTION_AUTHENTICITY_SOURCE_INCOMPLETE', '只能编辑已完成的冻结 run')
  }
  const runs = parsePrivateRuns(privateRaw)
  const byId = new Map(runs.map(run => [run.runId, run]))
  const edits = []
  for (const runId of args.runIds) {
    const source = byId.get(runId)
    if (!source || source.status !== 'success' || !text(source.rawText)) {
      throw dramaturgicalError('CROSS_SECTION_AUTHENTICITY_SOURCE_RUN_INVALID', `源 run 不可编辑：${runId}`)
    }
    const fixture = CROSS_SECTION_DRAMATURGICAL_FIXTURES.find(({ id }) => id === source.fixtureId)
    if (!fixture) {
      throw dramaturgicalError('CROSS_SECTION_AUTHENTICITY_SOURCE_FIXTURE_UNKNOWN', `源 fixture 不存在：${source.fixtureId}`)
    }
    edits.push(await runAuthenticityEditor({ fixture, draft: source, provider, runId }))
  }
  const bundle = {
    contractVersion: AUTHENTICITY_EDITOR_CONTRACT_VERSION,
    sourceRunDir: args.runDir,
    edits
  }
  await fs.mkdir(args.outputDir, { recursive: true })
  await fs.writeFile(join(args.outputDir, 'authenticity-edits.json'), `${JSON.stringify(bundle, null, 2)}\n`)
  await fs.writeFile(join(args.outputDir, 'authenticity-edits.txt'), renderAuthenticityEditsText(edits))
  return {
    outputDir: args.outputDir,
    editCount: edits.length,
    failedCount: edits.filter(({ status }) => status === 'failed').length,
    readableEdits: join(args.outputDir, 'authenticity-edits.txt')
  }
}

const finalizeArtifacts = async (fs, runDir) => {
  const [manifestRaw, privateRaw] = await Promise.all([
    fs.readFile(join(runDir, 'manifest.json'), 'utf8'),
    fs.readFile(join(runDir, 'private-runs.jsonl'), 'utf8')
  ])
  const manifest = JSON.parse(manifestRaw)
  const runs = parsePrivateRuns(privateRaw)
  const bundle = createDramaturgicalBlindPairs(runs, {
    seed: manifest.experimentRunId,
    includePrivate: true
  })
  const reviewTemplate = buildDramaturgicalReviewTemplate(bundle)
  const authoringTemplate = buildDramaturgicalAuthoringTemplate({
    seed: manifest.experimentRunId,
    participantCount: 1
  })
  manifest.privateBlindMap = bundle.privateBlindMap
  await Promise.all([
    fs.writeFile(join(runDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    fs.writeFile(join(runDir, 'blind-pairs.json'), `${JSON.stringify({ pairs: bundle.pairs, incompletePairs: bundle.incompletePairs }, null, 2)}\n`),
    fs.writeFile(join(runDir, 'review-template.json'), `${JSON.stringify(reviewTemplate, null, 2)}\n`),
    fs.writeFile(join(runDir, 'authoring-template.json'), `${JSON.stringify(authoringTemplate, null, 2)}\n`),
    fs.writeFile(join(runDir, 'blind-pairs.txt'), renderBlindPairsText(bundle)),
    fs.writeFile(join(runDir, 'authoring-template.txt'), renderAuthoringText(authoringTemplate))
  ])
  return {
    runDir,
    attemptCount: runs.length,
    pairCount: bundle.pairs.length,
    incompletePairCount: bundle.incompletePairs.length,
    readablePairs: join(runDir, 'blind-pairs.txt')
  }
}

export async function runDramaturgicalCli(argv, {
  fs = nodeFs,
  output = value => process.stdout.write(String(value)),
  generate = generateDramaturgicalArtifacts,
  createProvider = createBakeoffProvider
} = {}) {
  const args = parseDramaturgicalArgs(argv)
  let result
  if (args.command === 'dry-run') {
    result = {
      ...expandDramaturgicalMatrix(),
      contracts: {
        prompt: DRAMATURGICAL_PROMPT_CONTRACT_VERSION,
        runner: DRAMATURGICAL_RUNNER_CONTRACT_VERSION,
        evaluator: DRAMATURGICAL_EVALUATOR_CONTRACT_VERSION,
        authoring: DRAMATURGICAL_AUTHORING_CONTRACT_VERSION
      },
      conditions: [...DRAMATURGICAL_CONDITIONS],
      blindPairCount: 16,
      authoringParticipantCount: 1,
      persistentWrites: 0
    }
  } else if (args.command === 'generate') {
    const config = args.configPath
      ? parseConfig(await fs.readFile(args.configPath, 'utf8'))
      : builtinMiniMaxConfig()
    const runDir = await generate({
      fs,
      providerConfig: config,
      provider: createProvider(config),
      relationMode: args.relationMode,
      outputRoot: args.outputRoot || DEFAULT_DRAMATURGICAL_OUTPUT_ROOT,
      ...(args.runDir ? { runDir: args.runDir } : {})
    })
    result = await finalizeArtifacts(fs, runDir)
  } else {
    const config = args.configPath
      ? parseConfig(await fs.readFile(args.configPath, 'utf8'))
      : builtinMiniMaxConfig()
    result = await runAuthenticityEditCommand({
      fs,
      args,
      provider: createProvider(config)
    })
  }
  output(`${JSON.stringify(result, null, 2)}\n`)
  return result
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  runDramaturgicalCli(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${JSON.stringify({
      error: {
        code: String(error?.code || 'CROSS_SECTION_DRAMATURGY_CLI_FAILED'),
        message: String(error?.message || error)
      }
    })}\n`)
    process.exitCode = 1
  })
}
