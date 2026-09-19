#!/usr/bin/env node
/* eslint-disable no-console */
// S03（助手写作 Skills 接入计划 docs/plan/assistant-writing-skills-20260919.md）
// 完成证据：未知版本/字段/能力被拒绝，旧问答行为保持。
//   1. shared/writingSkillMethodContract.js：注册表解析、冻结输入白名单、
//      方法描述禁带路径/shell/JS/网络地址、预算顶格收敛、协商回执；
//   2. 真实 server（server/routes/advisor.js）：携带未知 skillVersion 的
//      options.writingSkill 必须 typed 400（WRITING_SKILL_REJECTED）；
//      不携带该字段的旧请求不进入该分支（provider 失败是 500 既有路径）。
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import {
  WRITING_SKILL_METHODS,
  WRITING_SKILL_BUDGET_LIMITS,
  resolveWritingSkillMethod,
  validateWritingSkillMethodDescription,
  validateWritingSkillInvocation,
  writingSkillAck
} from '../shared/writingSkillMethodContract.js'

let failures = 0
function check(label, pass, detail = '') {
  if (!pass) failures += 1
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${!pass && detail ? ` — ${String(detail).slice(0, 300)}` : ''}`)
}

// 1) 注册表与精确版本解析
check('首批注册三个 goal-review 方法', WRITING_SKILL_METHODS.length === 3
  && WRITING_SKILL_METHODS.every((method) => method.taskKind === 'goal-review'))
check('精确版本命中', resolveWritingSkillMethod('pacing-redundancy', 1).ok === true)
check('未知 skillId 拒绝', resolveWritingSkillMethod('full-book-rewrite', 1).reason === 'skill-unknown')
check('未知版本拒绝且不用最新兜底', resolveWritingSkillMethod('setup-payoff', 2).reason === 'skill-version-unknown'
  && resolveWritingSkillMethod('setup-payoff', '').reason === 'skill-version-unknown')

// 2) 方法描述禁带路径/shell/JS/网络地址
const forbidden = {
  'file-path': '打开 /src/services/agents/authoring/writingSkillChecks/checkDegeneration.js 后按步骤 1 执行。',
  'shell': '先运行 curl https://example.com/a.json，再 bash -c "rm -rf /tmp/x"。',
  'network-address': '参考 https://internal.example.com/method 获取步骤。',
  'arbitrary-js': '对每段调用 eval(paragraph) 并读取 window.localStorage。'
}
for (const [label, text] of Object.entries(forbidden)) {
  const result = validateWritingSkillMethodDescription({
    title: '测试方法',
    summary: '合法摘要。',
    methodText: text
  })
  check(`方法文本拒绝 ${label}`, result.valid === false && result.reason === `forbidden-content:${label}`, JSON.stringify(result))
}
check('注册表内建方法全部通过描述校验',
  WRITING_SKILL_METHODS.every((method) => validateWritingSkillMethodDescription(method).valid === true))

// 3) 冻结输入白名单
const baseInvocation = {
  invocationId: 'inv-20260919-0001',
  taskKind: 'goal-review',
  skillId: 'motivation-causality',
  skillVersion: 1,
  goal: '看这一章主角为什么突然信任对方，别改台词。',
  scope: { projectId: 'book-1', documentRole: 'manuscript', documentId: 'ch-1', chapterIds: ['ch-1'] },
  target: { nodeId: 'node-9', range: { startOffset: 12, endOffset: 40 }, exactQuote: '莉娜把册子捆紧。' },
  revisions: { document: '42', evidence: { 'worldbook-entry:e1': '7' } },
  constraints: { lockedRanges: [{ nodeId: 'node-9', startOffset: 0, endOffset: 10 }] },
  materialManifest: { sourceRefs: ['worldbook-entry:e1'] },
  requestedCoverage: { wholeBook: false }
}
const valid = validateWritingSkillInvocation(baseInvocation)
check('完整合法冻结输入通过并回带预算', valid.valid === true
  && valid.invocation.budget.maxBatches === WRITING_SKILL_BUDGET_LIMITS.maxBatches, JSON.stringify(valid.failures || []))

const unknownTop = validateWritingSkillInvocation({ ...baseInvocation, autoFixAll: true })
check('未知顶层字段拒绝', unknownTop.valid === false && unknownTop.reason === 'autoFixAll', JSON.stringify(unknownTop))
const unknownNested = validateWritingSkillInvocation({ ...baseInvocation, scope: { ...baseInvocation.scope, wholeLibrary: true } })
check('未知嵌套字段拒绝', unknownNested.valid === false && unknownNested.reason === 'scope.wholeLibrary', JSON.stringify(unknownNested))
check('未知 skillId 的冻结输入拒绝', validateWritingSkillInvocation({
  ...baseInvocation, skillId: 'no-such-method'
}).reason === 'skill:skill-unknown')
check('未知 skillVersion 的冻结输入拒绝', validateWritingSkillInvocation({
  ...baseInvocation, skillVersion: 9
}).reason === 'skill:skill-version-unknown')
check('taskKind 与方法不符拒绝', validateWritingSkillInvocation({
  ...baseInvocation, taskKind: 'change-impact'
}).reason === 'skill:task-kind-mismatch')
check('审稿类缺少 scope.projectId 拒绝', validateWritingSkillInvocation({
  ...baseInvocation, scope: { documentRole: 'manuscript' }
}).reason === 'scope.projectId')
check('超出方法只读能力白名单拒绝', validateWritingSkillInvocation({
  ...baseInvocation, requestedReadonlyCapabilities: ['narrative.tools.loop']
}).reason === 'requestedReadonlyCapabilities:not-allowed')
check('非法锁定区间拒绝', validateWritingSkillInvocation({
  ...baseInvocation, constraints: { lockedRanges: [{ nodeId: 'n', startOffset: 9, endOffset: 3 }] }
}).reason === 'constraints.lockedRanges')
check('非法预算字段拒绝并回落默认', validateWritingSkillInvocation({
  ...baseInvocation, budget: { maxBatches: -1 }
}).reason === 'budget.maxBatches')

const clamped = validateWritingSkillInvocation({
  ...baseInvocation,
  budget: { maxBatches: 99, batchChars: 120000, maxCandidates: 5, concurrency: 4 }
})
check('预算只降不升', clamped.valid === true
  && clamped.invocation.budget.maxBatches === WRITING_SKILL_BUDGET_LIMITS.maxBatches
  && clamped.invocation.budget.batchChars === WRITING_SKILL_BUDGET_LIMITS.batchChars
  && clamped.invocation.budget.maxCandidates === WRITING_SKILL_BUDGET_LIMITS.maxCandidates
  && clamped.invocation.budget.concurrency === WRITING_SKILL_BUDGET_LIMITS.concurrency, JSON.stringify(clamped.invocation?.budget))

const ack = writingSkillAck(valid.invocation)
check('协商回执回带 schema 与方法版本', ack?.schemaVersion === 1
  && ack?.skillId === 'motivation-causality' && ack?.skillVersion === 1
  && ack?.outputSchema === 'writing-skill-findings.v1')
check('knowledge-query 任务可携带方法', validateWritingSkillInvocation({
  ...baseInvocation, taskKind: 'knowledge-query'
}).valid === true)

// 4) 真实 server：未知版本 typed 拒绝；旧请求不进该分支
const PORT = 3219
const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
})
let serverLog = ''
server.stdout.on('data', (chunk) => { serverLog += chunk })
server.stderr.on('data', (chunk) => { serverLog += chunk })
try {
  let up = false
  for (let attempt = 0; attempt < 40 && !up; attempt += 1) {
    await delay(250)
    up = await fetch(`http://127.0.0.1:${PORT}/api/config`).then(() => true).catch(() => false)
  }
  if (!up) throw new Error(`server 未就绪: ${serverLog.slice(-300)}`)

  const rejected = await fetch(`http://127.0.0.1:${PORT}/api/advisor/task`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      envelope: { version: 1, surface: 'writing', projectId: 'b', target: { type: 'chapter', id: 'c', revision: 'r' }, blocks: [{ kind: 'raw', content: '正文', priority: 500, sourceRefs: [] }], budget: { maxChars: 4000, usedChars: 2, truncated: false } },
      question: '这一章动机是否成立？',
      taskType: 'authoring.review.chapter',
      options: { writingSkill: { ...baseInvocation, skillVersion: 99 } }
    })
  }).then((response) => response.json().then((body) => ({ status: response.status, body })))
  check('服务端拒绝未知 skillVersion（typed 400）', rejected.status === 400
    && rejected.body.code === 'WRITING_SKILL_REJECTED'
    && rejected.body.reason === 'skill:skill-version-unknown', JSON.stringify(rejected.body))

  const unknownFieldRejected = await fetch(`http://127.0.0.1:${PORT}/api/advisor/task`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      envelope: { version: 1, surface: 'writing', projectId: 'b', target: { type: 'chapter', id: 'c', revision: 'r' }, blocks: [{ kind: 'raw', content: '正文', priority: 500, sourceRefs: [] }], budget: { maxChars: 4000, usedChars: 2, truncated: false } },
      question: '这一章节奏如何？',
      taskType: 'authoring.review.chapter',
      options: { writingSkill: { ...baseInvocation, extraDrift: true } }
    })
  }).then((response) => response.json().then((body) => ({ status: response.status, body })))
  check('服务端拒绝未知冻结字段', unknownFieldRejected.status === 400
    && unknownFieldRejected.body.code === 'WRITING_SKILL_REJECTED'
    && unknownFieldRejected.body.reason === 'extraDrift', JSON.stringify(unknownFieldRejected.body))

  const legacy = await fetch(`http://127.0.0.1:${PORT}/api/advisor/task`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      envelope: { version: 1, surface: 'writing', projectId: 'b', target: { type: 'chapter', id: 'c', revision: 'r' }, blocks: [{ kind: 'raw', content: '正文', priority: 500, sourceRefs: [] }], budget: { maxChars: 4000, usedChars: 2, truncated: false } },
      question: '这一章动机是否成立？',
      taskType: 'authoring.knowledge.query'
    })
  }).then((response) => response.json().then((body) => ({ status: response.status, body })))
  check('旧问答请求不进入 writing-skill 分支（无 provider 时走既有 500 路径）',
    legacy.status !== 400 || legacy.body.code !== 'WRITING_SKILL_REJECTED', JSON.stringify(legacy.body).slice(0, 200))
} catch (error) {
  check('真实 server 旅程', false, error.message)
} finally {
  server.kill('SIGTERM')
}

if (failures) {
  console.log(`writing-skills method contract eval: ${failures} 个失败`)
  process.exitCode = 1
} else {
  console.log('writing-skills method contract eval: 全部通过')
}
