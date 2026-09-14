/* global process */

// A 线后果合同矩阵：细粒度正反例逐项断言（显式 eval，不占核心 vitest 预算）。
// 运行：node scripts/authoring-rehearsal-consequence-matrix.mjs
// 覆盖 shared/authoringRehearsalConsequenceContract.js（冻结条件、归一化反例、
// 投影、对照、请求协议、响应解析）、draftSource 模块与 useAuthoringRehearsal
// 组合式状态（分支账本、needs-review、条件代次、故障旅程）。
// 核心套件预算顶格（20 文件/200 用例），因此本线新增断言全部落在 scripts/。

import { register } from 'node:module'
import assert from 'node:assert/strict'

// composable 链里有 Vite 风格无扩展名导入，注册解析钩子后再动态加载。
register('./lib/esm-extension-resolve.mjs', import.meta.url)

import {
  AUTHORING_REHEARSAL_CONSEQUENCE_VERSION,
  buildRehearsalRequestPlan,
  compareRouteConsequences,
  consequenceFingerprint,
  freezeRehearsalConditions,
  knowledgeStatus,
  normalizeActionIntent,
  normalizeRehearsalConsequences,
  parseRehearsalResponse,
  projectRouteConsequenceState,
  rehearsalParticipants,
  rehearsalResponders,
  resolveActionParticipants
} from '../shared/authoringRehearsalConsequenceContract.js'
import { buildRehearsalDraftSource, isRehearsalDraftSourceCurrent } from '../src/services/agents/authoring/authoringRehearsalDraftSource.js'

const LINA = 'worldbook-entry:lina'
const EDGAR = 'worldbook-entry:edgar'
const LAOZHOU = 'worldbook-entry:lao-zhou'

const checks = []
function check(name, fn) {
  checks.push([name, fn])
}

check('冻结条件：factKey 确定性、未指定者不预置知情、声明不知情与已知互斥', () => {
  const conditions = freezeRehearsalConditions({
    facts: [{ text: '账册被调包', knowerRefs: [LINA], unawareRefs: [EDGAR, EDGAR] }]
  })
  assert.equal(conditions.facts[0].factKey, consequenceFingerprint('fact', '账册被调包'))
  assert.equal(conditions.facts[0].kind, 'assumption')
  assert.deepEqual(conditions.facts[0].knowerRefs, [LINA])
  assert.deepEqual(conditions.facts[0].unawareRefs, [EDGAR])
  assert.deepEqual(freezeRehearsalConditions({ facts: [{ text: '' }] }).issues, ['fact-text-required'])
  assert.equal(freezeRehearsalConditions({ facts: [{ text: 'x', knowerRefs: [LINA], unawareRefs: [LINA] }] }).facts[0].unawareRefs.length, 0)
})

const conditions = freezeRehearsalConditions({
  facts: [{ text: '账册被调包', knowerRefs: [LINA], unawareRefs: [LAOZHOU] }]
})
const FACT = conditions.facts[0].factKey
const verification = {
  actionText: '莉娜把账册被调包的事告诉艾德加',
  allowedRefs: [LINA, EDGAR],
  allowedFactKeys: [FACT],
  knownCommitments: [],
  allowedEvidenceRefs: ['unit:known']
}

check('归一化：knowledge(action 引文) 与 commitment(response 引文) 通过并分配应用 key', () => {
  const responseText = '艾德加压低声音说：“可以，但先让我看到账册。”'
  const batch = normalizeRehearsalConsequences([
    { kind: 'knowledge', knowerRef: EDGAR, factKey: FACT, source: { kind: 'action', quote: '告诉艾德加' } },
    {
      kind: 'commitment', promisorRef: EDGAR, beneficiaryRef: LINA, state: 'conditioned',
      content: '守住档案室门口', condition: '先让我看到账册', source: { kind: 'response', quote: responseText }
    }
  ], { ...verification, responseText })
  assert.equal(batch.ok, true)
  assert.equal(batch.version, AUTHORING_REHEARSAL_CONSEQUENCE_VERSION)
  assert.equal(batch.consequences[0].state, 'learned')
  assert.match(batch.consequences[1].commitmentKey, /^commitment-/)
  assert.equal(batch.consequences[1].issueKey, consequenceFingerprint('issue', verification.actionText))
  // 缺省 beneficiaryRef / condition 归一为空串
  assert.deepEqual(Object.keys(batch.consequences[1]).sort(), [
    'beneficiaryRef', 'commitmentKey', 'condition', 'content', 'issueKey', 'kind', 'promisorRef', 'source', 'state', 'version'
  ])
})

check('归一化反例矩阵：每项非法输入整批拒绝且 issues 可读', () => {
  const ctx = { ...verification, responseText: '艾德加点头的原文' }
  const knowledge = quote => [{ kind: 'knowledge', knowerRef: EDGAR, factKey: FACT, source: { kind: 'action', quote } }]
  const cases = [
    ['未知人物 ref', [{ kind: 'knowledge', knowerRef: 'worldbook-entry:stranger', factKey: FACT, source: { kind: 'action', quote: '告诉艾德加' } }]],
    ['未知 factKey', [{ kind: 'knowledge', knowerRef: EDGAR, factKey: 'fact-none', source: { kind: 'action', quote: '告诉艾德加' } }]],
    ['引文不在行动原文', knowledge('引文不存在')],
    ['引文超长', knowledge('告'.repeat(121))],
    ['承诺由 action 支持被拒', [{ kind: 'commitment', promisorRef: EDGAR, state: 'promised', content: '守门', source: { kind: 'action', quote: '告诉艾德加' } }]],
    ['未知来源类型', knowledge('告诉艾德加').map(item => ({ ...item, source: { kind: 'memory', quote: '告诉艾德加' } }))],
    ['同批重复知情', knowledge('告诉艾德加').concat(knowledge('告诉艾德加'))],
    ['未知后果类型', [{ kind: 'relationship', strength: 0.9 }]],
    ['坏版本', [{ kind: 'knowledge', version: 2, knowerRef: EDGAR, factKey: FACT, source: { kind: 'action', quote: '告诉艾德加' } }]],
    ['后果不是数组', { kind: 'knowledge' }],
    ['超过每步上限', knowledge('告诉艾德加').concat(knowledge('告诉艾德加').map(item => ({ ...item, knowerRef: LINA })), knowledge('告诉艾德加').map(item => ({ ...item, knowerRef: LINA })))],
    ['依据引用越界', [{ kind: 'knowledge', knowerRef: EDGAR, factKey: FACT, source: { kind: 'action', quote: '告诉艾德加', evidenceRefs: ['unit:no'] } }]]
  ]
  for (const [name, raw] of cases) {
    const batch = normalizeRehearsalConsequences(raw, ctx)
    assert.equal(batch.ok, false, name)
    assert.ok(batch.issues.length >= 1, `${name} 应有 issues`)
    assert.deepEqual(batch.consequences, [], `${name} 整批不提交`)
  }
})

check('承诺更新：必须引用已登记 key，继承 issueKey，同批重复拒绝', () => {
  const known = [{ commitmentKey: 'commitment-abc', issueKey: 'issue-xyz' }]
  const ctx = { ...verification, responseText: '我答应你', knownCommitments: known }
  const update = { kind: 'commitment', promisorRef: EDGAR, commitmentKey: 'commitment-abc', state: 'promised', content: '守住门口', source: { kind: 'response', quote: '我答应你' } }
  const ok = normalizeRehearsalConsequences([update], ctx)
  assert.equal(ok.ok, true)
  assert.equal(ok.consequences[0].issueKey, 'issue-xyz')
  assert.equal(normalizeRehearsalConsequences([update, update], ctx).ok, false)
  assert.equal(normalizeRehearsalConsequences([{ ...update, commitmentKey: 'commitment-nope' }], ctx).ok, false)
})

check('投影：知情入账、承诺状态迁移、未知 factKey 忽略、幂等', () => {
  const steps = [
    { id: 'step-1', consequences: [{ kind: 'knowledge', version: 1, knowerRef: EDGAR, factKey: FACT, state: 'learned', source: { kind: 'action', evidenceRefs: [], quote: 'q' } }] },
    { id: 'step-2', consequences: [{ kind: 'knowledge', version: 1, knowerRef: EDGAR, factKey: 'fact-unknown', state: 'learned', source: { kind: 'action', evidenceRefs: [], quote: 'q' } }] },
    {
      id: 'step-3', consequences: [{
        kind: 'commitment', version: 1, commitmentKey: 'commitment-k', issueKey: 'issue-k',
        promisorRef: EDGAR, beneficiaryRef: '', content: '守门', condition: '', state: 'promised',
        source: { kind: 'response', evidenceRefs: [], quote: 'q3' }
      }]
    },
    {
      id: 'step-4', consequences: [{
        kind: 'commitment', version: 1, commitmentKey: 'commitment-k', issueKey: 'issue-k',
        promisorRef: EDGAR, beneficiaryRef: '', content: '守门', condition: '先看账册', state: 'withdrawn',
        source: { kind: 'response', evidenceRefs: [], quote: 'q4' }
      }]
    }
  ]
  const state = projectRouteConsequenceState(conditions, steps)
  assert.deepEqual(state.facts[0].knowerRefs, [LINA, EDGAR])
  assert.deepEqual(state.facts[0].unawareRefs, [LAOZHOU])
  assert.equal(state.facts[0].learnedInStep[EDGAR], 'step-1')
  assert.equal(state.commitments[0].state, 'withdrawn')
  assert.equal(state.commitments[0].stepId, 'step-4')
  assert.equal(state.commitments[0].history.length, 1)
  assert.equal(knowledgeStatus(state, FACT, EDGAR), 'learned')
  assert.equal(knowledgeStatus(state, FACT, LINA), 'learned')
  assert.equal(knowledgeStatus(state, FACT, LAOZHOU), 'declared-unaware')
  assert.equal(knowledgeStatus(state, 'fact-none', EDGAR), 'unrecorded')
  // 同一输入再投影结果一致（幂等）
  assert.equal(projectRouteConsequenceState(conditions, steps).stateFingerprint, state.stateFingerprint)
})

check('对照：知情差异、声明不知情不误报、承诺条件差异、同状态零差异', () => {
  const namesByRef = ref => ({ [LINA]: '莉娜', [EDGAR]: '艾德加', [LAOZHOU]: '老周' }[ref] || ref)
  const knowledgeStep = (id, knowerRef) => ({
    id, consequences: [{ kind: 'knowledge', version: 1, knowerRef, factKey: FACT, state: 'learned', source: { kind: 'action', evidenceRefs: [], quote: 'q' } }]
  })
  const commitmentStep = (condition, state, issueKey) => ({
    id: 's', consequences: [{
      kind: 'commitment', version: 1, commitmentKey: `commitment-${issueKey}-${condition}`, issueKey,
      promisorRef: EDGAR, beneficiaryRef: '', content: '守门', condition, state,
      source: { kind: 'response', evidenceRefs: [], quote: 'q' }
    }]
  })
  const stateA = projectRouteConsequenceState(conditions, [knowledgeStep('s1', EDGAR)])
  const stateB = projectRouteConsequenceState(conditions, [])
  const { differences } = compareRouteConsequences(stateA, stateB, { namesByRef })
  const entry = differences.find(item => item.kind === 'knowledge' && item.personName === '艾德加')
  assert.equal(entry.a.status, 'learned')
  assert.equal(entry.b.status, 'unrecorded')
  assert.ok(!differences.some(item => item.personName === '老周'), '两路同样声明不知情不是分歧')
  assert.deepEqual(compareRouteConsequences(stateA, stateA, { namesByRef }).differences, [])

  const issueKey = consequenceFingerprint('issue', '请艾德加守门')
  const promised = projectRouteConsequenceState(conditions, [commitmentStep('', 'promised', issueKey)])
  const conditioned = projectRouteConsequenceState(conditions, [commitmentStep('先看账册', 'conditioned', issueKey)])
  const commitmentDiff = compareRouteConsequences(promised, conditioned, { namesByRef }).differences
    .find(item => item.kind === 'commitment')
  assert.equal(commitmentDiff.a.status, 'promised')
  assert.equal(commitmentDiff.b.status, 'conditioned')
  assert.equal(commitmentDiff.b.condition, '先看账册')
  assert.equal(commitmentDiff.personName, '艾德加')
})

const runFixtures = {
  target: { unitId: 'u-1', unitRevision: 3 },
  runSession: { manifest: { fingerprint: 'fp-1', blocks: [], target: { projectId: 'p1' } } },
  pressureProjection: {
    participants: [
      { ref: LINA, name: '莉娜', roles: ['present', 'viewpoint'] },
      { ref: EDGAR, name: '艾德加', roles: ['present'] },
      { ref: LAOZHOU, name: '老周', roles: ['planned'] }
    ],
    evidence: [], pressureSeeds: [], location: null
  }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

check('A01 身份：planned 无台词权、ref 优先、同名歧义、自指、授权入场', () => {
  const listed = rehearsalParticipants(runFixtures)
  assert.deepEqual(listed.map(person => person.status), ['present', 'present', 'planned'])
  assert.deepEqual(rehearsalResponders(listed).map(person => person.name), ['莉娜', '艾德加'])
  const afterEntry = rehearsalParticipants(runFixtures, [LAOZHOU])
  assert.equal(afterEntry.find(person => person.ref === LAOZHOU).status, 'entered')
  assert.deepEqual(rehearsalResponders(afterEntry).map(person => person.name), ['莉娜', '艾德加', '老周'])

  assert.equal(resolveActionParticipants(listed, normalizeActionIntent({ text: 'x', actorRef: EDGAR })).actor.ref, EDGAR)
  const byName = resolveActionParticipants(listed, normalizeActionIntent({ text: 'x', actor: '艾德加', targets: ['莉娜'] }))
  assert.equal(byName.targets[0].ref, LINA)
  assert.equal(resolveActionParticipants(listed, normalizeActionIntent({ text: 'x', actorRef: 'worldbook-entry:ghost' })).ok, false)
  const plannedActor = resolveActionParticipants(listed, normalizeActionIntent({ text: 'x', actorRef: LAOZHOU }))
  assert.equal(plannedActor.ok, false)
  assert.match(plannedActor.error, /尚未入场/)
  const sameNamed = rehearsalParticipants({
    pressureProjection: { participants: [...runFixtures.pressureProjection.participants, { ref: 'worldbook-entry:lao-zhou-2', name: '老周', roles: ['present'] }], evidence: [], pressureSeeds: [], location: null }
  })
  const ambiguous = resolveActionParticipants(sameNamed, normalizeActionIntent({ text: 'x', actor: '艾德加', targets: ['老周'] }))
  assert.equal(ambiguous.ok, false)
  assert.match(ambiguous.error, /多位/)
  assert.match(resolveActionParticipants(listed, normalizeActionIntent({ text: 'x', actor: '艾德加', targets: ['艾德加'] })).error, /本人/)
})

check('A04 请求装配：知情视图、未入场排除、后果指令、校验原文', () => {
  const factConditions = freezeRehearsalConditions({ facts: [{ text: '账册被调包', knowerRefs: [LINA] }] })
  const factKey = factConditions.facts[0].factKey
  const firstStep = {
    id: 'step-1', action: '告诉秘密', response: '艾德加皱眉', change: '', choices: [], evidenceRefs: [],
    consequences: [{ kind: 'knowledge', version: 1, knowerRef: EDGAR, factKey, state: 'learned', source: { kind: 'action', evidenceRefs: [], quote: 'q' } }]
  }
  const routeState = projectRouteConsequenceState(factConditions, [firstStep])
  const planned = buildRehearsalRequestPlan({
    run: runFixtures, steps: [firstStep], refs: ['unit:known'],
    action: { text: '请艾德加守门', actor: '莉娜', targets: ['艾德加'] }, routeState
  })
  assert.ok(!planned.error)
  assert.match(planned.question, /艾德加已得知「账册被调包」/)
  assert.match(planned.question, /未入场人物/)
  assert.match(planned.question, /老周/)
  assert.doesNotMatch(planned.question, /允许回应者[^\n]*老周/)
  assert.match(planned.question, /可登记事实/)
  assert.equal(planned.verification.actionText, '请艾德加守门')
  assert.deepEqual(planned.verification.allowedFactKeys, [factKey])
  assert.ok(!planned.verification.allowedRefs.includes(LAOZHOU))
  assert.deepEqual(planned.verification.allowedEvidenceRefs, ['unit:known'])
  // 授权入场：planned 生效在下一步；非法入场被拒
  const entering = buildRehearsalRequestPlan({
    run: runFixtures, steps: [],
    action: { text: '叫老周来', enteringRefs: [LAOZHOU] }, routeState
  })
  assert.deepEqual(entering.entering.map(person => person.ref), [LAOZHOU])
  assert.match(entering.question, /作者本步授权以下人物行动完成后入场：老周/)
  const badEntering = buildRehearsalRequestPlan({
    run: runFixtures, steps: [],
    action: { text: 'x', enteringRefs: [EDGAR] }, routeState
  })
  assert.match(badEntering.error, /授权入场的人物不存在/)
})

check('A02 解析：裸输出本地归一化、needs-review 保留回应、服务端对象透传、超限拒绝', () => {
  const factConditions = freezeRehearsalConditions({ facts: [{ text: '账册被调包' }] })
  const factKey = factConditions.facts[0].factKey
  const verification = { actionText: '把秘密告诉艾德加', allowedRefs: [EDGAR], allowedFactKeys: [factKey], knownCommitments: [], allowedEvidenceRefs: [] }
  const parsed = parseRehearsalResponse(JSON.stringify({
    response: '艾德加沉默', change: '知情', choices: ['x'], evidenceRefs: [],
    consequences: [{ kind: 'knowledge', knowerRef: EDGAR, factKey, source: { kind: 'action', quote: '告诉艾德加' } }]
  }), [], verification)
  assert.equal(parsed.consequenceStatus, 'committed')
  assert.equal(parsed.consequences[0].state, 'learned')
  const bad = parseRehearsalResponse(JSON.stringify({
    response: 'r', change: 'c', choices: ['x'], evidenceRefs: [],
    consequences: [{ kind: 'knowledge', knowerRef: EDGAR, factKey: 'fact-none', source: { kind: 'action', quote: 'q' } }]
  }), [], verification)
  assert.equal(bad.consequenceStatus, 'needs-review')
  assert.equal(bad.response, 'r')
  assert.ok(bad.consequenceIssues.length > 0)
  const passthrough = parseRehearsalResponse({
    response: 'r', change: 'c', choices: ['x'], evidenceRefs: [], consequenceStatus: 'committed',
    consequences: [{ kind: 'commitment', version: 1, commitmentKey: 'commitment-new', issueKey: 'issue-new', promisorRef: EDGAR, content: '守门', condition: '', state: 'promised', source: { kind: 'response', evidenceRefs: [], quote: 'q' } }]
  }, [], null)
  assert.equal(passthrough.consequenceStatus, 'committed')
  assert.equal(passthrough.consequences[0].commitmentKey, 'commitment-new')
  assert.equal(parseRehearsalResponse({ response: 'r', change: 'c', choices: ['x'], evidenceRefs: [], consequenceStatus: 'needs-review', consequenceIssues: ['x'], consequences: [] }, [], null).consequenceStatus, 'needs-review')
  assert.throws(() => parseRehearsalResponse(JSON.stringify({ response: 'r'.repeat(2500), change: 'c', choices: ['x'], evidenceRefs: [] }), [], null))
})

check('A10 物品：声明校验、交付转移、拒收不扣、非法整批拒绝、对照持有差异', () => {
  const itemConditions = freezeRehearsalConditions({
    items: [
      { name: '黄铜钥匙', holderRef: LINA },
      { name: '' },
      { name: '来路不明的手表', holderRef: 'worldbook-entry:stranger' }
    ]
  }, { allowedRefs: [LINA, EDGAR] })
  assert.equal(itemConditions.items.length, 1)
  assert.equal(itemConditions.items[0].name, '黄铜钥匙')
  assert.equal(itemConditions.items[0].holderRef, LINA)
  assert.match(itemConditions.items[0].itemKey, /^item-/)
  assert.ok(itemConditions.issues.some(issue => issue.includes('物品初始持有者')), '非法持有者进入 issues')
  const itemKey = itemConditions.items[0].itemKey
  const ctx = {
    actionText: '莉娜把黄铜钥匙递给艾德加',
    responseText: '艾德加接过钥匙：“我守到天亮。”',
    allowedRefs: [LINA, EDGAR],
    allowedFactKeys: [],
    knownCommitments: [],
    allowedEvidenceRefs: [],
    authorizedItems: itemConditions.items.map(item => ({ itemKey: item.itemKey, name: item.name, holderRef: item.holderRef }))
  }
  const deliver = normalizeRehearsalConsequences([{
    kind: 'item', itemKey, toRef: EDGAR, state: 'delivered',
    source: { kind: 'response', quote: '艾德加接过钥匙' }
  }], ctx)
  assert.equal(deliver.ok, true)
  const stateAfter = projectRouteConsequenceState(itemConditions, [{
    id: 's1', consequences: deliver.consequences
  }])
  assert.equal(stateAfter.items[0].holderRef, EDGAR)
  assert.equal(stateAfter.items[0].history.length, 1)
  // 拒收：持有者不变，仅记录结果；引文必须来自回应原文
  assert.equal(normalizeRehearsalConsequences([{
    kind: 'item', itemKey, toRef: EDGAR, state: 'refused',
    source: { kind: 'response', quote: '艾德加摇头不接' }
  }], { ...ctx, responseText: '艾德加点头接过' }).ok, false)
  const refuseOk = normalizeRehearsalConsequences([{
    kind: 'item', itemKey, toRef: EDGAR, state: 'refused',
    source: { kind: 'response', quote: '艾德加摇头不接' }
  }], { ...ctx, responseText: '艾德加摇头不接，转身回去' })
  assert.equal(refuseOk.ok, true)
  const refuseState = projectRouteConsequenceState(itemConditions, [{ id: 's2', consequences: refuseOk.consequences }])
  assert.equal(refuseState.items[0].holderRef, LINA, '拒收不扣旧持有者')
  // 反例：未知物品、action 来源、交给当前持有者、坏状态
  const badCases = [
    [{ kind: 'item', itemKey: 'item-none', toRef: EDGAR, state: 'delivered', source: { kind: 'response', quote: '艾德加接过钥匙' } }],
    [{ kind: 'item', itemKey, toRef: EDGAR, state: 'delivered', source: { kind: 'action', quote: '莉娜把黄铜钥匙递给艾德加' } }],
    [{ kind: 'item', itemKey, toRef: LINA, state: 'delivered', source: { kind: 'response', quote: '艾德加接过钥匙' } }],
    [{ kind: 'item', itemKey, toRef: EDGAR, state: 'held', source: { kind: 'response', quote: '艾德加接过钥匙' } }]
  ]
  for (const raw of badCases) {
    assert.equal(normalizeRehearsalConsequences(raw, ctx).ok, false, JSON.stringify(raw).slice(0, 60))
  }
  // 交付换手后对照出现持有差异；未动路无差异
  const stateGiven = projectRouteConsequenceState(itemConditions, [{ id: 's1', consequences: deliver.consequences }])
  const itemDiff = compareRouteConsequences(stateGiven, projectRouteConsequenceState(itemConditions, []), { namesByRef: ref => ({ [LINA]: '莉娜', [EDGAR]: '艾德加' }[ref] || ref) }).differences
    .find(item => item.kind === 'item')
  assert.equal(itemDiff.a.statusLabel, '持有者：艾德加')
  assert.equal(itemDiff.b.statusLabel, '持有者：莉娜')
})

check('A10 位置：授权地点、离场失去回应权、回到恢复、对照在场差异', () => {
  const sceneLocationRef = 'scene-location:tax-office'
  const ctx = {
    actionText: '莉娜请老周先回避',
    responseText: '老周拎起外套出了门',
    allowedRefs: [LINA, EDGAR],
    allowedFactKeys: [],
    knownCommitments: [],
    allowedEvidenceRefs: [],
    sceneLocationRef
  }
  const leave = normalizeRehearsalConsequences([{
    kind: 'location', moverRef: LINA, locationRef: sceneLocationRef, state: 'left',
    source: { kind: 'response', quote: '出了门' }
  }], ctx)
  assert.equal(leave.ok, true)
  assert.equal(leave.consequences[0].locationRef, sceneLocationRef)
  // 未授权地点与坏状态被拒
  assert.equal(normalizeRehearsalConsequences([{
    kind: 'location', moverRef: LINA, locationRef: 'scene-location:elsewhere', state: 'left',
    source: { kind: 'response', quote: '出了门' }
  }], ctx).ok, false)
  assert.equal(normalizeRehearsalConsequences([{
    kind: 'location', moverRef: LINA, locationRef: sceneLocationRef, state: 'entered',
    source: { kind: 'response', quote: '出了门' }
  }], ctx).ok, false)
  // 投影：离场进入 absent；回来移出
  const away = projectRouteConsequenceState(freezeRehearsalConditions({}), [{ id: 's1', consequences: leave.consequences }])
  assert.deepEqual(away.absentRefs, [LINA])
  const returnBatch = normalizeRehearsalConsequences([{ kind: 'location', moverRef: LINA, locationRef: sceneLocationRef, state: 'returned', source: { kind: 'response', quote: '出了门' } }], { ...ctx, actionText: '叫她回来' })
  const returned = projectRouteConsequenceState(freezeRehearsalConditions({}), [
    { id: 's1', consequences: leave.consequences },
    { id: 's2', consequences: returnBatch.consequences }
  ])
  assert.deepEqual(returned.absentRefs, [])
  // 请求装配：离场者不进入允许回应者，并有明确离场提示行
  const planned = buildRehearsalRequestPlan({
    run: runFixtures, steps: [], refs: [],
    action: { text: '请艾德加守门', actor: '艾德加' }, routeState: away
  })
  assert.doesNotMatch(planned.question, /允许回应者[^\n]*莉娜/)
  assert.match(planned.question, /已离开现场的人物[^\n]*莉娜/)
  // 对照：一走一留是在场差异
  const stay = projectRouteConsequenceState(freezeRehearsalConditions({}), [])
  const absenceDiff = compareRouteConsequences(away, stay, { namesByRef: ref => ({ [LINA]: '莉娜' }[ref] || ref) }).differences
    .find(item => item.kind === 'location')
  assert.equal(absenceDiff.a.status, 'away')
  assert.equal(absenceDiff.b.status, 'present')
})

check('A02 贯通：服务端 buildAdvisorResult 经共享合同归一化后果', async () => {
  const { createAdvisorTaskResponse } = await import('../server/services/advisorTaskService.js')
  const factConditions = freezeRehearsalConditions({ facts: [{ text: '账册被调包' }], items: [{ name: '黄铜钥匙', holderRef: LINA }] })
  const factKey = factConditions.facts[0].factKey
  const itemKey = factConditions.items[0].itemKey
  const verification = {
    actionText: '莉娜把账册被调包的事告诉艾德加，并把黄铜钥匙递给他',
    allowedRefs: [LINA, EDGAR],
    allowedFactKeys: [factKey],
    knownCommitments: [],
    allowedEvidenceRefs: [],
    authorizedItems: factConditions.items.map(item => ({ itemKey: item.itemKey, name: item.name, holderRef: item.holderRef }))
  }
  const modelJson = JSON.stringify({
    response: '艾德加接过钥匙，点头。',
    change: '艾德加已知账册被调包并收下钥匙',
    choices: ['艾德加提出先看总册'],
    evidenceRefs: [],
    consequences: [
      { kind: 'knowledge', knowerRef: EDGAR, factKey, source: { kind: 'action', quote: '告诉艾德加' } },
      { kind: 'item', itemKey, toRef: EDGAR, state: 'delivered', source: { kind: 'response', quote: '艾德加接过钥匙' } }
    ]
  })
  const ok = createAdvisorTaskResponse({ taskType: 'authoring.rehearsal.step', advice: modelJson, options: { rehearsalVerification: verification } })
  assert.equal(ok.result.rehearsal.consequenceStatus, 'committed')
  assert.equal(ok.result.rehearsal.consequences.length, 2)
  assert.equal(ok.result.rehearsal.consequences[0].state, 'learned')
  assert.equal(ok.result.rehearsal.consequences[1].toRef, EDGAR)
  // 非法批次：服务端 needs-review，issues 返回，response 保留
  const bad = createAdvisorTaskResponse({
    taskType: 'authoring.rehearsal.step',
    advice: JSON.stringify({
      response: 'r', change: 'c', choices: ['x'], evidenceRefs: [],
      consequences: [{ kind: 'knowledge', knowerRef: 'worldbook-entry:ghost', factKey: 'fact-none', source: { kind: 'action', quote: 'nope' } }]
    }),
    options: { rehearsalVerification: verification }
  })
  assert.equal(bad.result.rehearsal.consequenceStatus, 'needs-review')
  assert.deepEqual(bad.result.rehearsal.consequences, [])
  assert.ok(bad.result.rehearsal.consequenceIssues.length > 0)
  assert.equal(bad.result.rehearsal.response, 'r')
  // verification 不进入 provider prompt
  const { buildOpenClawUserMessage } = await import('../server/services/openclawService.js')
  const message = buildOpenClawUserMessage({ version: 1, blocks: [{ kind: 'scene', priority: 1, content: 'ctx', sourceRefs: [] }] }, 'q', {
    taskType: 'authoring.rehearsal.step',
    options: { rehearsalVerification: { actionText: '秘密原文' } }
  })
  assert.ok(!message.includes('秘密原文'), '校验原文不进 prompt')
})

const okResult = (overrides = {}) => ({
  response: 'r', change: 'c', choices: ['x'], evidenceRefs: [],
  consequences: [], consequenceStatus: 'committed', consequenceIssues: [], ...overrides
})

const composableChecks = [
  ['A03 分支账本：提交冻结、fork 值隔离、同 id 不重复', async () => {
    const { useAuthoringRehearsal } = await import('../src/composables/useAuthoringRehearsal.js')
    const rehearsal = useAuthoringRehearsal({ validate: async () => true, getSettings: async () => ({}), step: async () => okResult({ response: 'r1' }) })
    rehearsal.start(runFixtures)
    await rehearsal.advance('第一步')
    const root = rehearsal.current.value
    assert.equal(Object.isFrozen(root.steps[0]), true)
    assert.equal(Object.isFrozen(root.steps[0].evidenceRefs), true)
    rehearsal.rewind(1)
    const fork = rehearsal.current.value
    assert.notEqual(fork.id, root.id)
    assert.deepEqual(fork.steps[0].evidenceRefs, root.steps[0].evidenceRefs)
    assert.notEqual(fork.steps[0].evidenceRefs, root.steps[0].evidenceRefs)
    let count = 0
    const replay = useAuthoringRehearsal({ validate: async () => true, getSettings: async () => ({}), step: async () => {
      count += 1
      return okResult({ response: `r${count}` })
    } })
    replay.start(runFixtures)
    await replay.advance('同一步')
    const firstIds = replay.steps.value.map(step => step.id)
    await replay.advance('同一步')
    const allIds = replay.steps.value.map(step => step.id)
    assert.deepEqual(allIds.filter((id, index, list) => list.indexOf(id) !== index), [])
    assert.notEqual(replay.steps.value[1].id, firstIds[0])
  }],
  ['A05 needs-review：整批不提交、输入保留、重试与弃掉', async () => {
    const { useAuthoringRehearsal } = await import('../src/composables/useAuthoringRehearsal.js')
    let bad = true
    const rehearsal = useAuthoringRehearsal({ validate: async () => true, getSettings: async () => ({}), step: async () => bad
      ? okResult({ response: '可疑回应', consequenceStatus: 'needs-review', consequenceIssues: ['引文在回应原文中不存在'] })
      : okResult({ response: '干净回应' })
    })
    rehearsal.start(runFixtures)
    await rehearsal.advance('可疑行动')
    assert.equal(rehearsal.steps.value.length, 0)
    assert.equal(rehearsal.lastRejected.value.response, '可疑回应')
    assert.match(rehearsal.error.value, /没有通过核对/)
    bad = false
    await rehearsal.advance('可疑行动重试')
    assert.equal(rehearsal.steps.value.length, 1)
    assert.equal(rehearsal.steps.value[0].response, '干净回应')
    assert.equal(rehearsal.lastRejected.value, null)
    bad = true
    await rehearsal.advance('再来一次')
    assert.notEqual(rehearsal.lastRejected.value, null)
    rehearsal.discardRejected()
    assert.equal(rehearsal.lastRejected.value, null)
    assert.equal(rehearsal.steps.value.length, 1)
  }],
  ['A05/A06 两路对照、draftSource 冻结、条件代次只读', async () => {
    const { useAuthoringRehearsal } = await import('../src/composables/useAuthoringRehearsal.js')
    let secretRoute = true
    const twoRoutes = useAuthoringRehearsal({ validate: async () => true, getSettings: async () => ({}), step: async () => okResult({
      consequences: secretRoute
        ? [{ kind: 'knowledge', version: 1, knowerRef: EDGAR, factKey: twoRoutes.conditions.value.facts[0].factKey, state: 'learned', source: { kind: 'action', evidenceRefs: [], quote: 'q' } }]
        : []
    }) })
    twoRoutes.start(runFixtures)
    twoRoutes.freezeConditions({ facts: [{ text: '账册被调包', knowerRefs: [], unawareRefs: [LAOZHOU] }] })
    await twoRoutes.advance('告诉艾德加')
    secretRoute = false
    twoRoutes.rewind(0)
    await twoRoutes.advance('隐瞒')
    const knowledgeDiff = twoRoutes.compareRoutes().differences.find(item => item.kind === 'knowledge' && item.personName === '艾德加')
    assert.deepEqual([knowledgeDiff.a.status, knowledgeDiff.b.status].sort(), ['learned', 'unrecorded'])
    assert.ok(!twoRoutes.compareRoutes().differences.some(item => item.personName === '老周'))
    // draftSource：点击捕获；同代次内推进后不再当前
    const source = twoRoutes.createDraftSource()
    assert.equal(source.routeId, twoRoutes.route.value)
    assert.match(source.pathText, /隐瞒/)
    assert.equal(twoRoutes.draftSourceIsCurrent(source), true)
    await twoRoutes.advance('第二步推进')
    assert.equal(twoRoutes.draftSourceIsCurrent(source), false)
    // 条件代次：旧路只读、旧步保留、新路可写
    assert.equal(twoRoutes.freezeConditions({ facts: [{ text: '新秘密', knowerRefs: [] }] }), true)
    assert.equal(await twoRoutes.advance('旧路续写'), false)
    assert.match(twoRoutes.error.value, /旧路线只读/)
    twoRoutes.restore(twoRoutes.otherRoutes.value[0].id)
    assert.equal(twoRoutes.steps.value.length, 1)
    twoRoutes.rewind(0)
    assert.equal(await twoRoutes.advance('新条件下的行动'), true)
    // 模块级 draftSource 代次核对
    const moduleSource = buildRehearsalDraftSource({ run: runFixtures, route: { id: 'route-x', steps: [{ id: 's', response: 'r', change: 'c' }] }, routeState: projectRouteConsequenceState(freezeRehearsalConditions({}), []) })
    assert.equal(isRehearsalDraftSourceCurrent(moduleSource, { route: { id: 'route-x', steps: [{ id: 's', response: 'r', change: 'c' }] }, routeState: null, conditionGeneration: 0 }), true)
    assert.equal(isRehearsalDraftSourceCurrent(moduleSource, { route: { id: 'route-x', steps: [{ id: 's', response: 'r', change: 'c' }] }, routeState: null, conditionGeneration: 1 }), false)
  }],
  ['A07 故障旅程：失败保留、取消不落步、一击一请求、设置刷新', async () => {
    const { useAuthoringRehearsal } = await import('../src/composables/useAuthoringRehearsal.js')
    let resolveInFlight
    let attempts = 0
    let shouldFail = true
    let hold = false
    const rehearsal = useAuthoringRehearsal({ validate: async () => true, getSettings: async () => ({ model: 'm' }), step: (input) => {
      attempts += 1
      if (input.signal?.aborted) return Promise.reject(new Error('生成已取消'))
      if (shouldFail) return Promise.reject(new Error('网络中断，这次试演未完成，可以重试。'))
      if (hold) return new Promise((resolve) => { resolveInFlight = () => resolve(okResult({ response: '晚到回应' })) })
      return Promise.resolve(okResult({ response: '晚到回应' }))
    } })
    rehearsal.start(runFixtures)
    rehearsal.action.value = '草拟的行动'
    await rehearsal.advance('会失败的行动')
    assert.equal(attempts, 1)
    assert.equal(rehearsal.steps.value.length, 0)
    assert.match(rehearsal.error.value, /网络中断/)
    assert.equal(rehearsal.busy.value, false)
    shouldFail = false
    hold = true
    const retry = rehearsal.advance('会失败的行动')
    while (!resolveInFlight) await sleep(5)
    assert.equal(attempts, 2)
    rehearsal.cancel()
    resolveInFlight()
    assert.equal(await retry, false)
    assert.equal(rehearsal.steps.value.length, 0)
    assert.equal(rehearsal.busy.value, false)
    hold = false
    assert.equal(await rehearsal.advance('正常行动'), true)
    assert.equal(rehearsal.steps.value[0].response, '晚到回应')
    assert.equal(attempts, 3)
    // 配置更新后 refreshSettings 生效
    const seen = []
    const settingsRehearsal = useAuthoringRehearsal({ validate: async () => true, getSettings: async () => ({ model: seen.length ? 'new' : 'old' }), step: async ({ settingsSnapshot }) => {
      seen.push(settingsSnapshot.model)
      return okResult()
    } })
    settingsRehearsal.start(runFixtures)
    await settingsRehearsal.advance('第一次')
    settingsRehearsal.refreshSettings()
    await settingsRehearsal.advance('第二次')
    assert.deepEqual(seen, ['old', 'new'])
  }]
]

let failed = 0
for (const [name, fn] of checks) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL - ${name}\n  ${error.message}`)
  }
}
for (const [name, fn] of composableChecks) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL - ${name}\n  ${error.message}`)
  }
}
console.log(`\nauthoring rehearsal consequence matrix: ${checks.length + composableChecks.length - failed}/${checks.length + composableChecks.length} checks passed`)
if (failed > 0) process.exitCode = 1
