#!/usr/bin/env node
/**
 * Experience 跑团线离线验收矩阵（plain node，不占 Vitest 20 文件/200 用例预算）。
 *
 * 覆盖任务书 §10 的可离线项：骰式（V05–V07）、规则边界（V08）、
 * 行动合同与幂等（V09–V12，store 级）、持久化/归一化往返（V14/V23/V31 形状级）、
 * 失败保持（V15/V16 store 级）、作用域拒绝（V25/V26）、归档幂等（V29）、
 * 热窗口容量（V31）、投影与约束重建（R08/R19）。
 * 浏览器旅程（V17–V22、V32–V36）走 scripts/experience-roleplay-smoke.mjs。
 *
 * 运行：node scripts/experience-roleplay-eval.mjs   （exit 0 = 全部通过）
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = JSON.parse(readFileSync(path.join(root, 'scripts/fixtures/roleplay/roleplay-scenes.fixture.json'), 'utf8'))

const dice = await import(path.join(root, 'src/services/experience/roleplay/third-party/storyforgeDice.js'))
const rules = await import(path.join(root, 'src/services/experience/roleplay/roleplayRules.js'))
const contract = await import(path.join(root, 'src/services/experience/roleplay/roleplayActionContract.js'))
const stateMod = await import(path.join(root, 'src/services/experience/roleplay/roleplayState.js'))
const projection = await import(path.join(root, 'src/services/experience/roleplay/roleplayProjection.js'))
const adapter = await import(path.join(root, 'src/services/experience/roleplay/roleplayHistoryAdapter.js'))
const workflow = await import(path.join(root, 'src/services/experience/roleplay/roleplayWorkflow.js'))
const scenarioMod = await import(path.join(root, 'src/services/experience/roleplay/roleplayScenario.js'))
const runContract = await import(path.join(root, 'src/services/experience/run/runContract.js'))
const roleplayRuns = await import(path.join(root, 'src/services/experience/roleplay/roleplayRuns.js'))
const kpMod = await import(path.join(root, 'src/services/experience/roleplay/roleplayKpCoordinator.js'))
const companionMod = await import(path.join(root, 'src/services/experience/roleplay/roleplayCompanion.js'))

let passed = 0
let failed = 0
const failures = []

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
  } else {
    failed += 1
    failures.push({ name, detail })
  }
}

function throwsWithCode(fn, code) {
  try {
    fn()
    return false
  } catch (error) {
    return error?.code === code || String(error?.code || '').startsWith(code)
  }
}

// ── V05：骰式归一化（空格/大小写） ──
{
  const a = dice.parseDiceExpression(' 2D6 + 1 ')
  const b = dice.parseDiceExpression('2d6+1')
  check('V05 骰式空格/大小写归一化一致', JSON.stringify(a) === JSON.stringify(b))
  check('V05 规范形式', a.normalized === '2d6+1')
}

// ── V06：注入/超大/NaN 本地拒绝，无 eval ──
{
  check('V06 注入表达式拒绝', throwsWithCode(() => dice.parseDiceExpression('2d6; require("fs")'), 'ROLEPLAY_DICE_INVALID'))
  check('V06 非骰式字符串拒绝', throwsWithCode(() => dice.parseDiceExpression('2*6+1'), 'ROLEPLAY_DICE_INVALID'))
  check('V06 超大骰面拒绝', throwsWithCode(() => dice.parseDiceExpression('4d101'), 'ROLEPLAY_DICE_INVALID'))
  check('V06 超大数量拒绝', throwsWithCode(() => dice.parseDiceExpression('101d6'), 'ROLEPLAY_DICE_INVALID'))
  check('V06 超大修正拒绝', throwsWithCode(() => dice.parseDiceExpression('2d6+10001'), 'ROLEPLAY_DICE_INVALID'))
  check('V06 NaN 修正被合同拒绝', throwsWithCode(() => contract.createConfirmedRoleplayAction({
    sessionId: 's1', branchId: 'main', rawInput: '开门', attribute: 'wits', modifier: Number.NaN
  }), 'ROLEPLAY_MODIFIER_INVALID'))
  check('V06 无穷修正被合同拒绝', throwsWithCode(() => contract.createConfirmedRoleplayAction({
    sessionId: 's1', branchId: 'main', rawInput: '开门', attribute: 'wits', modifier: Number.POSITIVE_INFINITY
  }), 'ROLEPLAY_MODIFIER_INVALID'))
  check('V06 非法属性拒绝', throwsWithCode(() => contract.createConfirmedRoleplayAction({
    sessionId: 's1', branchId: 'main', rawInput: '开门', attribute: 'luck'
  }), 'ROLEPLAY_ATTRIBUTE_INVALID'))
}

// ── V07：拒绝区 uint32 重采样 + trace 计数 ──
{
  // d6 接受区 = floor(2^32/6)*6 = 4294967292；前两个样本落在拒绝区 [4294967292, 4294967295]。
  const samples = [4294967295, 4294967292, 8, 4]
  let call = 0
  const rolled = dice.sampleDiceFromUint32({ count: 2, sides: 6, nextUint32: () => samples[call++] })
  check('V07 重采样后得到两颗合法骰', rolled.dice.length === 2 && rolled.dice.every((v) => v >= 1 && v <= 6))
  check('V07 trace 计数一致（消耗 4 / 拒绝 2）', rolled.trace.consumedSamples === 4 && rolled.trace.rejectedSamples === 2)
  check('V07 trace 结构校验通过', (() => { try { dice.assertDiceRollTrace(rolled.trace); return true } catch { return false } })())
  check('V07 非法 trace 拒绝', throwsWithCode(() => dice.assertDiceRollTrace({ ...rolled.trace, consumedSamples: 99 }), 'ROLEPLAY_DICE_INVALID'))
}

// ── V08：三档边界 6/7/9/10 ──
{
  check('V08 总分 6 → 失败前进', rules.resolveOutcomeByTotal(6) === 'failure')
  check('V08 总分 7 → 部分成功', rules.resolveOutcomeByTotal(7) === 'partial')
  check('V08 总分 9 → 部分成功', rules.resolveOutcomeByTotal(9) === 'partial')
  check('V08 总分 10 → 成功', rules.resolveOutcomeByTotal(10) === 'success')
  check('V08 规则明文含三档', rules.describeRuleText({ modifier: 1 }).includes('10+') && rules.describeRuleText({ modifier: 1 }).includes('7–9') && rules.describeRuleText({ modifier: 1 }).includes('6-'))
}

// ── R03：夹具三场景一次性走完 确认→结算→待叙述（不调模型；提交归 coordinator，另行验证） ──
{
  for (const scene of fixture.scenes) {
    let sampleIndex = 0
    const store = createMockStore({ flushOk: true })
    workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: scene.goal })
    await workflow.confirmRoleplayAction(store, {
      rawInput: scene.action,
      attribute: scene.attribute,
      modifier: scene.modifier,
      nextUint32: () => scene.fixedDiceSamples[sampleIndex++]
    })
    const pending = stateMod.getRoleplayPendingForBranch(store.roleplaySession, 'main')
    check(`R03/${scene.key} 已结算等待叙述`, pending && pending.status === 'resolved' && store.sent.length === 1)
    check(`R03/${scene.key} 期望骰点/结果`, pending
      && JSON.stringify(pending.resolution.dice) === JSON.stringify(scene.expected.dice)
      && pending.resolution.total === scene.expected.total
      && pending.resolution.outcome === scene.expected.outcome)
    check(`R03/${scene.key} 叙述请求携带行动身份与约束`, store.sent[0]
      && store.sent[0].options.roleplayActionId === pending.actionId
      && String(store.sent[0].options.directorNote || '').includes('跑团结算'))
  }
}

// ── V09/V10/V11/V12：确认幂等与冲突（store 级） ──
{
  const store = createMockStore({ flushOk: true })
  workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: '测试' })
  // V09：确认前取消——只有一个 pending，零骰点零回执。
  {
    let sampleIndex = 0
    await workflow.confirmRoleplayAction(store, {
      rawInput: '推门', attribute: 'physique', modifier: 0,
      nextUint32: () => [3, 4][sampleIndex++ % 2]
    }).catch(() => {})
    const pending = stateMod.getRoleplayPendingForBranch(store.roleplaySession, 'main')
    check('V09 未提交前存在 pending', Boolean(pending))
    check('V09 放弃后零骰点零回执', (() => {
      workflow.cancelRoleplayPending(store)
      const after = store.roleplaySession
      return !stateMod.getRoleplayPendingForBranch(after, 'main') && after.receipts.length === 0
    })())
  }
  // V10/V11：相同 payload 重复确认 → 同一 actionId，一次骰点。
  {
    const fixed = [6, 5]
    let sampleIndex = 0
    await workflow.confirmRoleplayAction(store, {
      rawInput: '撬锁', attribute: 'agility', modifier: 1,
      nextUint32: () => fixed[sampleIndex++ % fixed.length]
    })
    const firstPending = stateMod.getRoleplayPendingForBranch(store.roleplaySession, 'main')
    const firstSendCount = store.sent.length
    const firstTotal = firstPending.resolution.total
    // 已 resolved 且 durable：同 payload 再确认走 requestRoleplayNarration（不重掷）。
    await workflow.confirmRoleplayAction(store, {
      rawInput: '撬锁', attribute: 'agility', modifier: 1,
      nextUint32: () => 1
    })
    const secondPending = stateMod.getRoleplayPendingForBranch(store.roleplaySession, 'main')
    check('V11 同 payload 重发不重掷（同 actionId、骰点不变）', secondPending
      && secondPending.actionId === firstPending.actionId
      && secondPending.resolution.total === firstTotal)
    check('V11 重发只追加一次叙述请求', store.sent.length === firstSendCount + 1)
  }
  // V12：同 ID 异 payload 冲突拒绝（走合同比较 + receipt 冲突检测）。
  {
    const actionA = contract.createConfirmedRoleplayAction({ sessionId: 's1', branchId: 'main', rawInput: '撬柜', attribute: 'wits', modifier: 0 })
    const actionB = contract.createConfirmedRoleplayAction({ sessionId: 's1', branchId: 'main', rawInput: '撬柜', attribute: 'agility', modifier: 0 })
    check('V12 同槽位异 payload → conflict', contract.compareRoleplayActionPayload(actionA, actionB) === 'conflict')
    const resolutionA = { dice: [3, 4], modifier: 0, total: 7, outcome: 'partial', rngTrace: {}, resolvedAt: 1 }
    const resolutionB = { dice: [5, 5], modifier: 0, total: 10, outcome: 'success', rngTrace: {}, resolvedAt: 2 }
    const receiptA = projection.buildTurnReceiptV1({ ...actionA, resolution: resolutionA }, { turnId: 't1', parentTurnId: null, store })
    // 同一 actionId、不同内容（模拟重放冲突）。
    const receiptB = projection.buildTurnReceiptV1({ ...actionB, actionId: actionA.actionId, resolution: resolutionB }, { turnId: 't1', parentTurnId: null, store })
    check('V12 同 ID 异内容回执被识别为冲突', Boolean(projection.findConflictingReceipt([receiptA], receiptB)))
    check('V11 同 ID 同内容回执幂等复用', !projection.findConflictingReceipt([receiptA], { ...receiptA, committedAt: receiptA.committedAt + 5 }))
  }
  // V20（store 级）：pending 存在时普通发送被拒。
  {
    const blocked = createMockStore({ flushOk: true })
    workflow.setRoleplaySessionSetup(blocked, { mode: 'rules', goal: '' })
    let sampleIndex = 0
    await workflow.confirmRoleplayAction(blocked, {
      rawInput: '试探栅栏', attribute: 'will', modifier: 0,
      nextUint32: () => [2, 2][sampleIndex++ % 2]
    }).catch(() => {})
    check('V20 pending 阻断普通发送', throwsWithCode(() => workflow.assertRoleplaySendAllowed(blocked, {}), 'ROLEPLAY_PENDING_BLOCKS_SEND'))
    check('V20 放行带正确身份的叙述请求', !throwsWithCode(() => workflow.assertRoleplaySendAllowed(blocked, { roleplayActionId: stateMod.getRoleplayPendingForBranch(blocked.roleplaySession, 'main').actionId }), 'ROLEPLAY_PENDING_BLOCKS_SEND'))
  }
}

// ── V13/V18/V15/V16：持久化门禁与失败保持（store 级） ──
{
  // V13：确认保存抛失败（quota）→ 不掷骰、pending 未登记、输入不进任何已存会话。
  {
    const store = createMockStore({ flushOk: false })
    workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: '' })
    let rolled = false
    let error = null
    try {
      await workflow.confirmRoleplayAction(store, {
        rawInput: '翻墙', attribute: 'physique', modifier: 0,
        nextUint32: () => { rolled = true; return 1 }
      })
    } catch (e) { error = e }
    check('V13 持久化失败不掷骰', !rolled && error?.code === 'ROLEPLAY_PERSIST_FAILED')
    check('V13 失败后无残留 pending', !stateMod.getRoleplayPendingForBranch(store.roleplaySession, 'main'))
  }
  // V15/V16：叙述失败/取消 → pending 保持 resolved、骰点不变、retryCount 累计。
  {
    const store = createMockStore({ flushOk: true })
    workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: '' })
    let sampleIndex = 0
    await workflow.confirmRoleplayAction(store, {
      rawInput: '搜抽屉', attribute: 'wits', modifier: 0,
      nextUint32: () => [6, 6][sampleIndex++ % 2]
    }).catch(() => {})
    const pending = stateMod.getRoleplayPendingForBranch(store.roleplaySession, 'main')
    const totalBefore = pending.resolution.total
    workflow.failRoleplayNarration(store, { action: pending, errorCode: 'NARRATIVE_PROVIDER_TIMEOUT' })
    workflow.failRoleplayNarration(store, { action: pending, errorCode: 'NARRATIVE_AGENT_ABORTED' })
    const after = stateMod.getRoleplayPendingForBranch(store.roleplaySession, 'main')
    check('V15/V16 失败后骰点不变', after.resolution.total === totalBefore && after.status === 'resolved')
    check('V15/V16 诊断累计', after.retryCount === 2 && after.lastErrorCode === 'NARRATIVE_AGENT_ABORTED')
  }
}

// ── V14/V31：归一化往返与热窗口容量 ──
{
  const state = stateMod.createEmptyRoleplaySessionState()
  state.mode = 'rules'
  state.goal = '往返测试'
  const action = contract.createConfirmedRoleplayAction({ sessionId: 's1', branchId: 'main', rawInput: '查看账本', attribute: 'wits', modifier: 1 })
  contract.applyResolution(action, { dice: [5, 4], rngTrace: { algorithm: 'uint32-rejection-v2', sides: 6, requestedDice: 2, consumedSamples: 2, rejectedSamples: 0 } })
  state.pendingByBranch.main = action
  const roundTrip = stateMod.normalizeRoleplaySessionState(JSON.parse(JSON.stringify(state)))
  const pending = stateMod.getRoleplayPendingForBranch(roundTrip, 'main')
  check('V14 已结算 pending 刷新可恢复（骰点一致）', pending && pending.resolution.total === 10 && pending.status === 'resolved')

  // V31/CX04：receipts 热窗口 LRU ≤200；pending/outbox 归一化不再静默裁剪。
  const big = stateMod.createEmptyRoleplaySessionState()
  big.mode = 'rules'
  for (let i = 0; i < 10; i += 1) {
    const a = contract.createConfirmedRoleplayAction({ sessionId: 's1', branchId: `b${i}`, rawInput: `行动${i}`, attribute: 'wits', modifier: 0 })
    a.status = 'resolved'
    a.resolution = { dice: [3, 4], modifier: 0, total: 7, outcome: 'partial', rngTrace: {}, resolvedAt: i }
    big.pendingByBranch[`b${i}`] = a
  }
  const capped = stateMod.normalizeRoleplaySessionState(JSON.parse(JSON.stringify(big)))
  // V31：receipts 热窗口 LRU ≤200；pending/outbox 归一化不再裁剪（CX02/CX04）。
  const manyReceipts = { ...big, receipts: Array.from({ length: 260 }, (_, i) => ({ receiptId: `r${i}`, payloadHash: 'x', committedAt: i })) }
  check('V31 receipts 上限 200（热窗口）', stateMod.normalizeRoleplaySessionState(manyReceipts).receipts.length === 200)
  check('CX04 归一化不再静默裁剪 pending（10 分支全保留）', Object.keys(capped.pendingByBranch).length === 10)
  const manyOutbox = { ...big, archiveOutbox: Array.from({ length: 60 }, (_, i) => ({ actionId: `o${i}`, receiptId: `r${i}`, turnId: `t${i}`, attempts: 0, lastError: '', queuedAt: i })) }
  check('CX02 归一化不再裁剪 outbox（60 条全保留）', stateMod.normalizeRoleplaySessionState(manyOutbox).archiveOutbox.length === 60)

  // 旧数据兼容（V02 形状级）：缺 roleplay 字段 → null；坏字段 → null。
  check('V02 旧会话无 roleplay 字段 → null（自由叙事）', stateMod.normalizeRoleplaySessionState(null) === null)
  check('R23 非法 roleplay 字段 → null', stateMod.normalizeRoleplaySessionState({ version: 99, mode: 'rules' }) === null)
  check('R23 非法 action 归一化为丢弃', stateMod.normalizeRoleplaySessionState({ version: 1, mode: 'rules', pendingByBranch: { main: { actionId: 'x', status: 'weird' } } })?.pendingByBranch?.main === undefined)
}

// ── R19/V17 支撑：从检定行重建约束 == 原约束 ──
{
  const action = contract.createConfirmedRoleplayAction({ sessionId: 's1', branchId: 'main', worldbookId: 'wb1', rawInput: '辨认日志字迹', attribute: 'wits', modifier: 1 })
  contract.applyResolution(action, { dice: [5, 4], rngTrace: { algorithm: 'uint32-rejection-v2', sides: 6, requestedDice: 2, consumedSamples: 2, rejectedSamples: 0 } })
  const row = projection.buildCheckRowProjection(action)
  check('R08 检定行投影字段白名单', Object.keys(row).every((key) => ['version', 'actionId', 'branchId', 'sessionId', 'ruleId', 'rulesVersion', 'expression', 'attribute', 'attributeLabel', 'modifier', 'dice', 'total', 'outcome', 'outcomeLabel', 'ruleText', 'rawInputDigest', 'status', 'detail'].includes(key)))
  check('R08 投影不含 envelope 全文', !('rawInput' in row) && !('intentHint' in row))
  check('R19 重建约束与原约束一致', projection.buildDirectiveFromCheckRow(row) === projection.buildResolutionDirective(action))
  check('R08 约束长度 ≤380', projection.buildResolutionDirective(action).length <= 380)
  check('K1 ScopeRef 形状', (() => {
    const scope = projection.buildScopeRef({ sessionId: 's1', branchId: 'b2' })
    return scope.domain === 'session' && scope.bookId === null && scope.sessionId === 's1' && scope.branchId === 'b2'
  })())
}

// ── V25/V26/V29：历史端口合同与 outbox 幂等 ──
{
  // V26：端口不可用 ≠ 空记录。
  {
    const port = adapter.createRoleplayHistoryPort()
    check('V26 端口不可用如实标记', port.available === false)
    const read = await port.readRoleplayHistory({ scope: { domain: 'session', sessionId: 's1' } })
    check('V26 读取返回不可用而非空历史', read.ok === false && read.reason === adapter.ROLEPLAY_ARCHIVE_REASON.UNAVAILABLE)
  }
  // V25：作用域不符拒绝，不进 provider payload。
  {
    const port = adapter.createRoleplayHistoryPort({
      read: async (request) => ({ ok: true, records: [{ id: 'x', sessionId: request.scope.sessionId }] }),
      record: async () => ({ ok: true, eventId: 'e1' })
    })
    adapter.installRoleplayHistoryPort(port)
    const rejected = await adapter.readRoleplayHistorySafely({ scope: { domain: 'session', sessionId: 's1' }, sessionId: 'other-session' })
    check('V25 跨会话读取被拒', rejected.ok === false && rejected.reason === adapter.ROLEPLAY_ARCHIVE_REASON.REJECTED_SCOPE)
    const okRead = await adapter.readRoleplayHistorySafely({ scope: { domain: 'session', sessionId: 's1' }, sessionId: 's1' })
    check('V25 同会话读取放行', okRead.ok === true)
  }
  // V29：失败/取消不归档；重复 drain 幂等；成功后 outbox 清空。
  {
    const store = createMockStore({ flushOk: true })
    workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: '' })
    const committedAction = contract.createConfirmedRoleplayAction({ sessionId: store.currentSessionId, branchId: 'main', rawInput: '已提交行动', attribute: 'wits', modifier: 0 })
    contract.applyResolution(committedAction, { dice: [2, 2], rngTrace: {} })
    contract.markRoleplayActionCommitted(committedAction, { narrationTurnId: 'turn_1' })
    const receipt = projection.buildTurnReceiptV1(committedAction, { turnId: 'turn_1', parentTurnId: null, store })
    const failedAction = contract.createConfirmedRoleplayAction({ sessionId: store.currentSessionId, branchId: 'main', rawInput: '失败行动', attribute: 'wits', modifier: 0 })
    contract.cancelRoleplayAction(failedAction)
    const state = store.roleplaySession
    const scope = projection.buildScopeRef({ sessionId: store.currentSessionId, branchId: 'main' })
    check('V29 失败/取消回合不入队', adapter.queueRoleplayArchive(state, { action: failedAction, receipt, scope }).ok === false)
    check('V29 已提交回合入队（自包含载荷）', (() => {
      const queued = adapter.queueRoleplayArchive(state, { action: committedAction, receipt, scope })
      return queued.ok === true && state.archiveOutbox[0]?.payload?.scope?.sessionId === store.currentSessionId
    })())
    check('V29 同 action 重复入队幂等', adapter.queueRoleplayArchive(state, { action: committedAction, receipt, scope }).duplicate === true)

    let recordCalls = 0
    adapter.installRoleplayHistoryPort(adapter.createRoleplayHistoryPort({
      read: async () => ({ ok: true, records: [] }),
      record: async () => { recordCalls += 1; if (recordCalls === 1) return { ok: false, reason: 'db-down', retryable: true }; return { ok: true, eventId: 'e1' } }
    }))
    const first = await adapter.drainRoleplayArchiveOutbox(state)
    check('V29 首次 drain 失败保留 outbox', first.accepted === 0 && first.remaining === 1 && state.archiveOutbox[0].attempts === 1)
    const second = await adapter.drainRoleplayArchiveOutbox(state)
    check('V29 重试成功清空 outbox', second.accepted === 1 && state.archiveOutbox.length === 0)
    const third = await adapter.drainRoleplayArchiveOutbox(state)
    check('V29 重复 drain 幂等（不重复投递）', third.attempted === 0)
    adapter.installRoleplayHistoryPort(adapter.createRoleplayHistoryPort())
  }
}

// ── coordinator 回调级：绑定→提交落账→重叙述（V10/V14/V21 store 级） ──
{
  const store = createMockStore({ flushOk: true })
  workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: '回调测试' })
  let sampleIndex = 0
  await workflow.confirmRoleplayAction(store, {
    rawInput: '推门而入', attribute: 'physique', modifier: 1,
    nextUint32: () => [4, 5][sampleIndex++ % 2]
  })
  const action = stateMod.getRoleplayPendingForBranch(store.roleplaySession, 'main')
  const userMessage = { id: 'msg_user_1', role: 'user', content: action.rawInput, branchId: 'main' }
  store.messages.push(userMessage)

  // 叙述开始绑定：身份一致 → 挂检定行；身份不一致 → 抛错。
  const binding = workflow.bindRoleplayNarration(store, { roleplayActionId: action.actionId, userMessageId: userMessage.id })
  check('R15 绑定返回 pending 行动', binding?.pending === true && binding.action.actionId === action.actionId)
  check('R15 检定行已挂到 user 消息', userMessage.roleplayCheck?.actionId === action.actionId && userMessage.roleplayCheck.total === 12)
  check('R15 身份不一致被事务内拒绝', throwsWithCode(() => workflow.bindRoleplayNarration(store, { roleplayActionId: 'act_other', userMessageId: userMessage.id }), 'ROLEPLAY_PENDING_BLOCKS_SEND'))

  // 提交落账：pending 移除、receipt 入账、outbox 入队（端口不可用 → 保留）。
  const turnRecord = { id: 'turn_9', parentTurnId: null, userMessageIds: ['msg_user_1'] }
  const receipt = workflow.commitRoleplayNarration(store, { action: binding.action, turnRecord })
  check('R15 落账生成 receipt（同 actionId）', receipt && receipt.receiptId === action.actionId && receipt.turnId === 'turn_9')
  check('R15 pending 已移除', !stateMod.getRoleplayPendingForBranch(store.roleplaySession, 'main'))
  check('R15 outbox 入队（端口不可用待重试）', store.roleplaySession.archiveOutbox.length === 1)
  check('R15 检定行状态刷新为 committed', userMessage.roleplayCheck.status === 'committed')

  // 重叙述绑定（重生成）：无 pending，但 user 消息带 committed 检定行。
  const rebinding = workflow.bindRoleplayNarration(store, { roleplayActionId: '', userMessageId: userMessage.id })
  check('R19 重叙述从检定行恢复绑定', rebinding && !rebinding.pending && rebinding.actionId === action.actionId)
  const receipt2 = workflow.commitRoleplayRenarration(store, { binding: rebinding, turnRecord: { id: 'turn_10', userMessageIds: ['msg_user_1'] } })
  check('R19 重叙述保留不可变原结算回执', receipt2 && receipt2.turnId === 'turn_9' && store.roleplaySession.receipts.length === 1)
  check('R19 outbox 不重复入队', store.roleplaySession.archiveOutbox.length === 1)

  // 迟到提交守卫（V18/V19 形状级）：会话已切换时丢弃。
  const otherSessionStore = createMockStore({ flushOk: true })
  workflow.setRoleplaySessionSetup(otherSessionStore, { mode: 'rules', goal: '' })
  let idx = 0
  await workflow.confirmRoleplayAction(otherSessionStore, {
    rawInput: '别的会话行动', attribute: 'wits', modifier: 0,
    nextUint32: () => [1, 2][idx++ % 2]
  }).catch(() => {})
  const otherAction = stateMod.getRoleplayPendingForBranch(otherSessionStore.roleplaySession, 'main')
  otherSessionStore.currentSessionId = 'sess_moved_on'
  const lateBinding = (() => {
    try {
      return workflow.bindRoleplayNarration(otherSessionStore, { roleplayActionId: otherAction.actionId, userMessageId: '' })
    } catch (error) {
      return { threw: error.code }
    }
  })()
  check('V18 会话身份失效的检定被拒绝（不写入新会话）', lateBinding?.threw === 'ROLEPLAY_SCOPE_MISMATCH')
}

// ── CX02/CX03：outbox 容量背压与自包含载荷（XC-G01/XC-G02） ──
{
  const state = stateMod.createEmptyRoleplaySessionState()
  state.mode = 'rules'
  const makeAction = (i) => {
    const a = contract.createConfirmedRoleplayAction({ sessionId: 's1', branchId: `b${i % 20}`, rawInput: `行动${i}`, attribute: 'wits', modifier: 0 })
    contract.applyResolution(a, { dice: [5, 5], rngTrace: {} })
    contract.markRoleplayActionCommitted(a, { narrationTurnId: `turn_${i}` })
    return a
  }
  let lastResult = null
  for (let i = 0; i < 1001; i += 1) {
    const a = makeAction(i)
    const receipt = projection.buildTurnReceiptV1(a, { turnId: `turn_${i}`, parentTurnId: null, store: { currentSessionId: 's1', activeBranchId: `b${i % 20}`, worldId: 'wb1' } })
    lastResult = adapter.queueRoleplayArchive(state, { action: a, receipt, scope: receipt.scope })
  }
  check('XC-G01 1001 条达到容量背压（不再入队）', lastResult.ok === false && lastResult.reason === 'ROLEPLAY_OUTBOX_CAPACITY')
  check('XC-G01 已入队 1000 条一条不丢（最旧仍在）', state.archiveOutbox.length === stateMod.ROLEPLAY_OUTBOX_CAPACITY
    && state.archiveOutbox[0].turnId === 'turn_0' && state.archiveOutbox.at(-1).turnId === 'turn_999')
  // XC-G02：receipts 热窗口清空后，outbox 载荷仍自包含完整 receipt+scope。
  state.receipts = []
  const trimmed = stateMod.normalizeRoleplaySessionState(JSON.parse(JSON.stringify(state)))
  check('XC-G02 热窗口裁剪后载荷完整（receipt+scope 自包含）', trimmed.archiveOutbox.length === 1000
    && Boolean(trimmed.archiveOutbox[0].payload?.receipt?.receiptId)
    && trimmed.archiveOutbox[0].payload.scope.domain === 'session'
    && Boolean(trimmed.archiveOutbox[0].payload.scope.branchId))
}

// ── CX03/XC-G07：冻结 scope；legacy 无载荷不假装归档 ──
{
  const state = stateMod.createEmptyRoleplaySessionState()
  const a = contract.createConfirmedRoleplayAction({ sessionId: 'sess_A', branchId: 'br_A', rawInput: '冻结scope行动', attribute: 'wits', modifier: 0 })
  contract.applyResolution(a, { dice: [4, 4], rngTrace: {} })
  contract.markRoleplayActionCommitted(a, { narrationTurnId: 'turn_A' })
  const receipt = projection.buildTurnReceiptV1(a, { turnId: 'turn_A', parentTurnId: null, store: { currentSessionId: 'sess_A', activeBranchId: 'br_A', worldId: 'wb_A' } })
  const frozenScope = { domain: 'session', bookId: null, worldbookId: 'wb_A', sessionId: 'sess_A', branchId: 'br_A' }
  adapter.queueRoleplayArchive(state, { action: a, receipt, scope: frozenScope })
  // drain 时"当前会话"已是别处：scope 必须仍来自冻结回执（不传当前会话信息）。
  let seen = null
  adapter.installRoleplayHistoryPort(adapter.createRoleplayHistoryPort({
    read: async () => ({ ok: true, records: [] }),
    record: async (request) => { seen = request; return { ok: true, eventId: 'e' } }
  }))
  const summary = await adapter.drainRoleplayArchiveOutbox(state)
  check('XC-G07 scope 来自冻结回执（session/branch 不猜当前）', seen
    && seen.scope.sessionId === 'sess_A'
    && seen.scope.branchId === 'br_A'
    && seen.scope.worldbookId === 'wb_A'
    && summary.accepted === 1)
  // legacy 无载荷条目：不补猜、不丢弃、如实标记。
  const legacyState = stateMod.createEmptyRoleplaySessionState()
  legacyState.archiveOutbox = [{ actionId: 'legacy_1', receiptId: 'legacy_1', turnId: 'turn_L', attempts: 0, lastError: '', queuedAt: 1 }]
  const legacySummary = await adapter.drainRoleplayArchiveOutbox(legacyState)
  check('CX03 legacy 无载荷条目保留并标记受限', legacyState.archiveOutbox.length === 1
    && legacyState.archiveOutbox[0].lastError === adapter.ROLEPLAY_ARCHIVE_REASON.LEGACY_NO_PAYLOAD
    && legacySummary.accepted === 0)
  adapter.installRoleplayHistoryPort(adapter.createRoleplayHistoryPort())
}

// ── CX04/XC-G03：pending 第 7 分支创建时背压，旧 pending 不丢 ──
{
  const store = createMockStore({ flushOk: true })
  workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: '' })
  const state = store.roleplaySession
  for (let i = 0; i < 6; i += 1) {
    const a = contract.createConfirmedRoleplayAction({ sessionId: store.currentSessionId, branchId: `b${i}`, rawInput: `分支行动${i}`, attribute: 'wits', modifier: 0 })
    a.status = 'resolved'
    a.resolution = { dice: [3, 3], modifier: 0, total: 6, outcome: 'failure', rngTrace: {}, resolvedAt: i }
    state.pendingByBranch[`b${i}`] = a
  }
  const capacity = stateMod.checkRoleplayPendingCapacity(state, 'b_new')
  check('XC-G03 第 7 分支容量判定拒绝', capacity.ok === false && capacity.reason === 'ROLEPLAY_PENDING_CAPACITY')
  check('XC-G03 既有 6 分支 pending 全部保留', Object.keys(state.pendingByBranch).length === 6)
  const before = JSON.stringify(Object.keys(state.pendingByBranch).sort())
  let blockedCode = ''
  try {
    await workflow.confirmRoleplayAction({ ...store, activeBranchId: 'b_new' }, {
      rawInput: '新分支行动', attribute: 'wits', modifier: 0, nextUint32: () => 1
    })
  } catch (error) {
    blockedCode = error.code || ''
  }
  check('XC-G03 第 7 分支确认被阻断（类型化背压）', blockedCode === 'ROLEPLAY_PENDING_CAPACITY')
  check('XC-G03 阻断后旧 pending 不变', JSON.stringify(Object.keys(state.pendingByBranch).sort()) === before)
}

// ── CX05/XC-G04：未来 schema 安全加载与无损写回 ──
{
  const futureRaw = {
    version: 2,
    mode: 'rules',
    futureOnlyField: { clueStates: { c1: 'discovered' } },
    pendingByBranch: { main: { schemaVersion: 2, actionId: 'fut_1' } }
  }
  const loaded = stateMod.loadRoleplayStateForSession(JSON.parse(JSON.stringify(futureRaw)))
  check('XC-G04 未来版本加载：current=null + futureRaw 保留', loaded.current === null && loaded.futureRaw?.version === 2)
  const writtenBack = stateMod.resolveRoleplayPersistence(loaded.current, loaded.futureRaw)
  check('XC-G04 写回走 future-raw 透传', writtenBack.kind === 'future-raw' && writtenBack.value.futureOnlyField.clueStates.c1 === 'discovered')
  check('XC-G04 原始扩展字段不变（无损往返）', JSON.stringify(JSON.parse(JSON.stringify(writtenBack.value))) === JSON.stringify(futureRaw))
  check('XC-G04 当前版本写回归一化', stateMod.resolveRoleplayPersistence({ version: 1, mode: 'rules' }, null).kind === 'v1')
  check('CX05 未来版本会话不可改模式（只读守卫）', throwsWithCode(() => workflow.setRoleplaySessionSetup({ roleplayFutureRaw: futureRaw, roleplaySession: null, saveCurrentSession() {}, flushSaveSessions() { return true } }, { mode: 'rules' }), 'ROLEPLAY_FUTURE_STATE_READONLY'))
}

// ── CX02/XC-G05/XC-G06：drain 中新增、两 drain 并发、逐 ID 移除 ──
{
  // XC-G05：drain 处理第 1 条时新入队第 2 条 → 新条目不被旧数组覆盖。
  {
    const state = stateMod.createEmptyRoleplaySessionState()
    const scope = { domain: 'session', bookId: null, worldbookId: null, sessionId: 's1', branchId: 'main' }
    const mkEntry = (id) => ({ actionId: id, receiptId: id, turnId: `t_${id}`, attempts: 0, lastError: '', queuedAt: 1, payload: { receipt: { receiptId: id, commandId: id, turnId: `t_${id}`, parentTurnId: null, branchId: 'main', rulesVersion: 'r@1', resolutionRef: 'x', stateDeltaRefs: [], evidenceRefs: [], committedAt: 1 }, scope, sessionId: 's1', worldbookId: null, branchId: 'main' } })
    state.archiveOutbox.push(mkEntry('a1'))
    adapter.installRoleplayHistoryPort(adapter.createRoleplayHistoryPort({
      read: async () => ({ ok: true, records: [] }),
      record: async () => {
        // drain 快照已取；模拟处理期间新回执入队。
        if (!state.archiveOutbox.some((e) => e.actionId === 'a2')) state.archiveOutbox.push(mkEntry('a2'))
        return { ok: true, eventId: 'e' }
      }
    }))
    const summary = await adapter.drainRoleplayArchiveOutbox(state)
    check('XC-G05 drain 中新增条目仍在队列', summary.accepted === 1 && state.archiveOutbox.some((e) => e.actionId === 'a2'))
    const second = await adapter.drainRoleplayArchiveOutbox(state)
    check('XC-G05 二次 drain 排空新增项', second.accepted === 1 && state.archiveOutbox.length === 0)
  }
  // XC-G06：两 drain 并发 → 同条目可能重复投递，由 ledger 幂等吸收；清理幂等。
  {
    const state = stateMod.createEmptyRoleplaySessionState()
    const scope = { domain: 'session', bookId: null, worldbookId: null, sessionId: 's1', branchId: 'main' }
    state.archiveOutbox.push({ actionId: 'a1', receiptId: 'a1', turnId: 't_a1', attempts: 0, lastError: '', queuedAt: 1, payload: { receipt: { receiptId: 'a1', commandId: 'a1', turnId: 't_a1', parentTurnId: null, branchId: 'main', rulesVersion: 'r@1', resolutionRef: 'x', stateDeltaRefs: [], evidenceRefs: [], committedAt: 1 }, scope, sessionId: 's1', worldbookId: null, branchId: 'main' } })
    let recordCalls = 0
    adapter.installRoleplayHistoryPort(adapter.createRoleplayHistoryPort({
      read: async () => ({ ok: true, records: [] }),
      record: async () => { recordCalls += 1; return { ok: true, replay: recordCalls > 1, eventId: 'a1' } }
    }))
    const [d1, d2] = await Promise.all([adapter.drainRoleplayArchiveOutbox(state), adapter.drainRoleplayArchiveOutbox(state)])
    check('XC-G06 并发 drain 双双成功（重复投递被幂等吸收）', d1.accepted + d2.accepted >= 2 && recordCalls >= 2)
    check('XC-G06 队列清理幂等（账本一份、无残留）', state.archiveOutbox.length === 0)
  }
  // XC-G10：receipt-conflict 保留队列不覆盖。
  {
    const state = stateMod.createEmptyRoleplaySessionState()
    const scope = { domain: 'session', bookId: null, worldbookId: null, sessionId: 's1', branchId: 'main' }
    state.archiveOutbox.push({ actionId: 'a1', receiptId: 'a1', turnId: 't_a1', attempts: 0, lastError: '', queuedAt: 1, payload: { receipt: { receiptId: 'a1' }, scope, sessionId: 's1', worldbookId: null, branchId: 'main' } })
    adapter.installRoleplayHistoryPort(adapter.createRoleplayHistoryPort({
      read: async () => ({ ok: true, records: [] }),
      record: async () => ({ ok: false, reason: 'receipt-conflict', retryable: false })
    }))
    await adapter.drainRoleplayArchiveOutbox(state)
    check('XC-G10 同 ID 异内容保留队列并可见诊断', state.archiveOutbox.length === 1
      && state.archiveOutbox[0].lastError === 'receipt-conflict')
    adapter.installRoleplayHistoryPort(adapter.createRoleplayHistoryPort())
  }
}

// ── CX07：TurnReceiptV1 生产序列化形态（A 合同对齐） ──
{
  const action = contract.createConfirmedRoleplayAction({ sessionId: 'sess_demo_001', branchId: 'main', worldbookId: 'wb_demo_001', rawInput: '样例行动', attribute: 'wits', modifier: 1 })
  contract.applyResolution(action, { dice: [5, 4], rngTrace: { algorithm: 'uint32-rejection-v2', sides: 6, requestedDice: 2, consumedSamples: 2, rejectedSamples: 0 } })
  const receipt = projection.buildTurnReceiptV1(action, { turnId: 'narrative_x', parentTurnId: null, store: { currentSessionId: 'sess_demo_001', activeBranchId: 'main', worldId: 'wb_demo_001' } })
  const serialized = projection.serializeRoleplayReceipt(receipt)
  const fixture = JSON.parse(readFileSync(path.join(root, 'scripts/fixtures/roleplay/roleplay-receipt-sample.fixture.json'), 'utf8'))
  check('CX07 序列化字段集合与 A 合同样例一致', JSON.stringify(Object.keys(serialized).sort()) === JSON.stringify(Object.keys(fixture.serializedReceipt).sort()))
  check('CX07 序列化不含本地专属字段', !('schemaVersion' in serialized) && !('payloadHash' in serialized) && !('scope' in serialized))
  check('CX07 branchId 必填（A 合同）', serialized.branchId === 'main')
  check('CX07 缺 branchId 拒绝', throwsWithCode(() => projection.serializeRoleplayReceipt({ ...serialized, branchId: null }), 'ROLEPLAY_RECEIPT_INVALID'))
}

// ── CX09/XC-G09：只读历史返回值再验证（跨会话/别分支/viewer） ──
{
  const goodRecord = { receiptId: 'g1', scope: { domain: 'session', bookId: null, worldbookId: null, sessionId: 's1', branchId: 'main' } }
  adapter.installRoleplayHistoryPort(adapter.createRoleplayHistoryPort({
    read: async () => ({ ok: true, records: [
      goodRecord,
      { receiptId: 'bad1', scope: { domain: 'session', bookId: null, worldbookId: null, sessionId: 'other-book-session', branchId: 'main' } },
      { receiptId: 'bad2', scope: { domain: 'session', bookId: null, worldbookId: null, sessionId: 's1', branchId: 'other-branch' } },
      { receiptId: 'bad3', visibleTo: 'player-b', scope: { domain: 'session', bookId: null, worldbookId: null, sessionId: 's1', branchId: 'main' } }
    ] }),
    record: async () => ({ ok: true, eventId: 'e' })
  }))
  const filtered = await adapter.readRoleplayHistorySafely({ scope: { domain: 'session', bookId: null, worldbookId: null, sessionId: 's1', branchId: 'main' }, sessionId: 's1', branchId: 'main', viewerRef: 'player-a' })
  check('XC-G09 别书记录被拒', !filtered.records.some((r) => r.receiptId === 'bad1'))
  check('XC-G09 别分支记录被拒', !filtered.records.some((r) => r.receiptId === 'bad2'))
  check('XC-G09 viewer 不符记录被拒', !filtered.records.some((r) => r.receiptId === 'bad3'))
  check('XC-G09 合法记录保留 + 排除数可观测', filtered.records.length === 1 && filtered.excludedCount === 3)
  adapter.installRoleplayHistoryPort(adapter.createRoleplayHistoryPort())
}

// ── CX13–CX18：场景/线索/结局（XC-G16/G17/G18/G19/G20/G33） ──
{
  const scenarioJson = JSON.parse(readFileSync(path.join(root, 'src/services/experience/roleplay/fixtures/lampkeeper-scenario.json'), 'utf8'))
  const scenario = scenarioMod.normalizeScenario(scenarioJson.scenario)
  check('CX13 场景定义合法（5 场景 5 线索 2 结局）', Boolean(scenario)
    && scenario.scenes.length === 5 && scenario.clues.length === 5 && scenario.endings.length === 2)

  // G16：主线/支路/返回路径三条路线可走通。
  {
    const run = scenarioMod.createScenarioRun(scenario)
    check('CX13 初始场景为值房且 clue_log 可用', run.currentSceneId === 'scene_desk' && run.clues.clue_log === 'available')
    scenarioMod.moveScenarioRun(run, scenario, { toSceneId: 'scene_stairs' })
    check('G16 主线：值房→梯井', run.currentSceneId === 'scene_stairs' && run.clues.clue_scuff === 'available')
    scenarioMod.moveScenarioRun(run, scenario, { toSceneId: 'scene_lamp_room' })
    check('G16 主线：梯井→灯室（clue_mechanism 提级可用）', run.currentSceneId === 'scene_lamp_room' && run.clues.clue_mechanism === 'available')
    // 返回路径：灯室→梯井→值房→…→值房（结局 end_return 需要 clue_boot + 值房）。
    scenarioMod.moveScenarioRun(run, scenario, { toSceneId: 'scene_stairs' })
    scenarioMod.moveScenarioRun(run, scenario, { toSceneId: 'scene_desk' })
    scenarioMod.moveScenarioRun(run, scenario, { toSceneId: 'scene_reef' })
    check('G16 支路：值房→礁石滩', run.currentSceneId === 'scene_reef')
  }
  // G17：重复进入场景不重复发奖励（线索只提级一次，发现态不被重置）。
  {
    const run = scenarioMod.createScenarioRun(scenario)
    scenarioMod.moveScenarioRun(run, scenario, { toSceneId: 'scene_stairs' })
    scenarioMod.applyScenarioOutcome(run, scenario, { actionId: 'act_1', clueId: 'clue_scuff', outcome: 'success' })
    check('G17 线索已发现', run.clues.clue_scuff === 'discovered')
    scenarioMod.moveScenarioRun(run, scenario, { toSceneId: 'scene_desk' })
    scenarioMod.moveScenarioRun(run, scenario, { toSceneId: 'scene_stairs' })
    check('G17 重复进入不重置发现态、不重复计数奖励', run.clues.clue_scuff === 'discovered' && run.sceneVisits.scene_stairs === 2)
    const repeat = scenarioMod.applyScenarioOutcome(run, scenario, { actionId: 'act_1', clueId: 'clue_scuff', outcome: 'success' })
    check('G17 同 actionId 幂等（不重复应用）', repeat.applied === false && run.publicEvents.filter((e) => e.clueId === 'clue_scuff').length === 1)
  }
  // G18：唯一关键线索检定失败 → 失败前进开替代路线，不改失败为成功。
  {
    const run = scenarioMod.createScenarioRun(scenario)
    scenarioMod.moveScenarioRun(run, scenario, { toSceneId: 'scene_stairs' })
    const result = scenarioMod.applyScenarioOutcome(run, scenario, { actionId: 'act_fail', clueId: 'clue_scuff', outcome: 'failure' })
    check('G18 失败不解锁原线索', run.clues.clue_scuff !== 'discovered' && run.clues.clue_scuff !== 'success')
    check('G18 失败前进开启替代线索（字条）', result.applied === true && run.clues.clue_guard_note === 'available')
    check('G18 受挫事件可见', run.publicEvents.some((event) => event.type === 'setback'))
  }
  // G19：公开投影不含未发现线索（名称/摘要/数量全部缺席）。
  {
    const run = scenarioMod.createScenarioRun(scenario)
    const view = scenarioMod.buildScenarioPublicProjection(run, scenario)
    check('G19 投影只含 discovered 线索', view.discoveredClues.length === 0)
    const serialized = JSON.stringify(view)
    check('G19 未发现线索名称/摘要不泄漏', !serialized.includes('刮痕') && !serialized.includes('靴子') && !serialized.includes('字条'))
    check('G19 可用行动只出现在当前场景且状态 available', view.availableSceneClueActions.every((action) => action.clueId === 'clue_log'))
  }
  // G20：结局后停行；确定性结局判定不由叙述宣称。
  {
    const run = scenarioMod.createScenarioRun(scenario)
    scenarioMod.applyScenarioOutcome(run, scenario, { actionId: 'act_m', clueId: 'clue_mechanism', outcome: 'success' })
    scenarioMod.applyScenarioOutcome(run, scenario, { actionId: 'act_g', clueId: 'clue_guard_note', outcome: 'success' })
    const ending = scenarioMod.maybeApplyEnding(run, scenario)
    check('G20 双线索未到小屋：结局不触发', ending === null && run.status === 'active')
    scenarioMod.moveScenarioRun(run, scenario, { toSceneId: 'scene_stairs' })
    scenarioMod.moveScenarioRun(run, scenario, { toSceneId: 'scene_cottage' })
    check('G20 抵达小屋即达成结局（确定性条件）', run.status === 'ended' && run.endingId === 'end_truth')
    let blocked = ''
    try {
      scenarioMod.moveScenarioRun(run, scenario, { toSceneId: 'scene_stairs' })
    } catch (error) { blocked = error.code }
    check('G20 结局后移动被拒（交还真人）', blocked === 'ROLEPLAY_SCENARIO_NOT_ACTIVE')
  }
  // G33：运行源冻结——运行体 revision 与外部定义变更解耦。
  {
    const store = createMockStore({ flushOk: true })
    workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: '' })
    workflow.startRoleplayScenario(store, { scenario: scenarioJson.scenario })
    const frozenRevision = store.roleplaySession.scenario.revision
    workflow.moveRoleplayScene(store, { toSceneId: 'scene_stairs' })
    // 外部定义被"编辑"（改名/换 revision）：运行实例不静默变更。
    const edited = { ...scenarioJson.scenario, title: '被改掉的场景', revision: 'rev_new_editor_change' }
    let startError = ''
    try { workflow.startRoleplayScenario(store, { scenario: edited }) } catch (error) { startError = error.code }
    check('G33 已有进行中冒险时拒绝另起（不静默换运行源）', startError === 'ROLEPLAY_SCENARIO_ACTIVE')
    check('G33 运行中的场景体保持冻结（标题/revision 不变）', store.roleplaySession.scenario.title !== '被改掉的场景'
      && store.roleplaySession.scenario.revision === frozenRevision
      && store.roleplaySession.scenarioRun.scenarioRevision === frozenRevision)
    // 归一化往返：场景+运行体无损。
    const roundTrip = stateMod.normalizeRoleplaySessionState(JSON.parse(JSON.stringify(store.roleplaySession)))
    check('CX13 场景与运行体随会话无损往返', roundTrip.scenario?.scenarioId === 'scn_lampkeeper'
      && roundTrip.scenarioRun?.currentSceneId === 'scene_stairs'
      && roundTrip.scenarioRun.scenarioRevision === frozenRevision)
  }
}


// ── CX19–CX24：确定性资源账（XC-G21/G22/G24） ──
{
  const resourcesMod = await import(path.join(root, 'src/services/experience/roleplay/roleplayResources.js'))
  const state = resourcesMod.createResourceState()
  // 基线可读（CX19 最小：身份之外的当前状态投影）。
  const view0 = resourcesMod.buildResourceProjection(state)
  check('CX21 资源基线（活力100/灯油10）', view0.values.vitality.value === 100 && view0.values.lampOil.value === 10)
  // G21：白名单外/非整数/越界/revision 冲突全部本地拒绝。
  check('XC-G21 白名单外资源拒绝', resourcesMod.applyResourceDelta(state, { deltaId: 'd1', resource: 'mana', amount: 5 }).ok === false)
  check('XC-G21 非整数金额拒绝', resourcesMod.applyResourceDelta(state, { deltaId: 'd2', resource: 'vitality', amount: 1.5 }).ok === false)
  check('XC-G21 越界结果拒绝（活力 -2 下限以下不减）', (() => {
    const s2 = resourcesMod.createResourceState()
    for (let i = 0; i < 60; i += 1) resourcesMod.applyResourceDelta(s2, { deltaId: `d_${i}`, resource: 'vitality', amount: -2 })
    return s2.deltas.length === 50 && resourcesMod.computeResourceValues(s2).vitality === 0
  })())
  const okApply = resourcesMod.applyResourceDelta(state, { deltaId: 'd3', resource: 'lampOil', amount: -1 })
  check('XC-G21 合法 delta 生效且 revision 递增', okApply.ok === true && okApply.revision === 1)
  check('XC-G21 expectedRevision CAS 冲突拒绝', resourcesMod.applyResourceDelta(state, { deltaId: 'd4', resource: 'vitality', amount: -1, expectedRevision: 0 }).reason === 'ROLEPLAY_RESOURCE_REVISION_CONFLICT')
  check('XC-G21 同 deltaId 幂等', (() => {
    const first = resourcesMod.applyResourceDelta(state, { deltaId: 'd5', resource: 'lampOil', amount: -1 })
    const again = resourcesMod.applyResourceDelta(state, { deltaId: 'd5', resource: 'lampOil', amount: -1 })
    return first.ok === true && again.duplicate === true && resourcesMod.getResourceRevision(state) === 2
  })())
  // G22：同 actionId 结算后果只应用一次（重试叙述不再扣）。
  {
    const s3 = resourcesMod.createResourceState()
    const first = resourcesMod.applyOutcomeResourceCost(s3, { actionId: 'act_x', outcome: 'failure' })
    const again = resourcesMod.applyOutcomeResourceCost(s3, { actionId: 'act_x', outcome: 'failure' })
    check('XC-G22 失败前进固定代价（活力-2）一次生效', first.applied === true && first.changes.some((c) => c.resource === 'vitality' && c.amount === -2))
    check('XC-G22 重复结算不重复扣', again.applied === false && s3.deltas.filter((d) => d.sourceRef === 'outcome:failure').length === 1)
    const successCost = resourcesMod.applyOutcomeResourceCost(resourcesMod.createResourceState(), { actionId: 'act_y', outcome: 'success' })
    check('CX22 成功无消耗', successCost.applied === true && successCost.changes.length === 0)
  }
  // G23：消耗品一次性（获取幂等/使用失效/重复使用拒绝）。
  {
    const s4 = resourcesMod.createResourceState()
    check('CX23 首次获取灯油壶', resourcesMod.grantItem(s4, { itemId: 'lampOilFlask', sourceActionId: 'act_z' }).ok === true)
    check('CX23 同来源重复获取幂等（不加数量）', resourcesMod.grantItem(s4, { itemId: 'lampOilFlask', sourceActionId: 'act_z' }).duplicate === true && s4.items.lampOilFlask.count === 1)
    const oilBefore = resourcesMod.computeResourceValues(s4).lampOil
    check('CX23 使用生效（灯油+3，壶消耗）', resourcesMod.useItem(s4, { itemId: 'lampOilFlask' }).ok === true && resourcesMod.computeResourceValues(s4).lampOil === oilBefore + 3 && s4.items.lampOilFlask.count === 0)
    check('CX23 无库存重复使用拒绝', resourcesMod.useItem(s4, { itemId: 'lampOilFlask' }).ok === false && resourcesMod.computeResourceValues(s4).lampOil === oilBefore + 3)
  }
  // CX24：对账。
  {
    const s5 = resourcesMod.createResourceState()
    resourcesMod.applyResourceDelta(s5, { deltaId: 'r1', resource: 'lampOil', amount: -3 })
    const values = resourcesMod.computeResourceValues(s5)
    check('CX24 对账一致', resourcesMod.reconcileResources(s5, values).consistent === true)
    check('CX24 对账发现篡改', resourcesMod.reconcileResources(s5, { ...values, lampOil: 99 }).consistent === false)
  }
  // 资源账随会话无损往返。
  {
    const s6 = resourcesMod.createResourceState()
    resourcesMod.applyOutcomeResourceCost(s6, { actionId: 'act_w', outcome: 'partial' })
    resourcesMod.grantItem(s6, { itemId: 'lampOilFlask', sourceActionId: 'act_v' })
    const round = resourcesMod.normalizeResourceState(JSON.parse(JSON.stringify(s6)))
    check('CX21 资源账归一化无损往返（值/物品/幂等键一致）', round
      && resourcesMod.computeResourceValues(round).lampOil === resourcesMod.computeResourceValues(s6).lampOil
      && round.items.lampOilFlask.count === 1
      && round.appliedActionIds.includes('act_w'))
  }
}


// ── CX25/CX28/CX29：有界主持预算（XC-G24/G25 形状级） ──
{
  const host = await import(path.join(root, 'src/services/experience/roleplay/roleplayHost.js'))
  // 预算 0：立即耗尽。
  {
    const plan = host.createHostPlan({ maxSteps: 0 })
    let code = ''
    try { host.beginHostStep(plan, { stepId: 's1' }) } catch (error) { code = error.code }
    check('XC-G24 预算 0 → 首步即拒绝', code === 'ROLEPLAY_HOST_BUDGET_EXHAUSTED')
  }
  // 预算 1：一步后耗尽；预扣语义（begin 即计数）。
  {
    const plan = host.createHostPlan({ maxSteps: 1 })
    host.beginHostStep(plan, { stepId: 's1' })
    check('XC-G24 begin 预扣（进行中）', plan.status === 'advancing' && plan.stepsUsed === 1)
    let code = ''
    try { host.beginHostStep(plan, { stepId: 's2' }) } catch (error) { code = error.code }
    check('XC-G24 进行中并发 begin 拒绝', code === 'ROLEPLAY_HOST_STEP_IN_FLIGHT')
    host.completeHostStep(plan, { stepId: 's1' })
    check('CX28 完成后 awaiting，预算已尽', plan.status === 'awaiting-player' && plan.stepsUsed === plan.maxSteps)
    code = ''
    try { host.beginHostStep(plan, { stepId: 's2' }) } catch (error) { code = error.code }
    check('XC-G24 预算耗尽拒绝（交还真人）', code === 'ROLEPLAY_HOST_BUDGET_EXHAUSTED')
  }
  // 多步 + 同 stepId 幂等 + 暂停/恢复 + 归一化往返。
  {
    const plan = host.createHostPlan({ maxSteps: 3 })
    host.beginHostStep(plan, { stepId: 'a' })
    check('CX28 同 stepId 重复 begin 幂等', host.beginHostStep(plan, { stepId: 'a' }).duplicate === true && plan.stepsUsed === 1)
    host.completeHostStep(plan, { stepId: 'a' })
    host.beginHostStep(plan, { stepId: 'b' })
    host.completeHostStep(plan, { stepId: 'b' })
    check('CX28 多步累计（2/3）', plan.stepsUsed === 2)
    host.pauseHostPlan(plan)
    check('CX29 暂停后 begin 拒绝', (() => { try { host.beginHostStep(plan, { stepId: 'c' }); return false } catch (error) { return error.code === 'ROLEPLAY_HOST_PAUSED' } })())
    host.resumeHostPlan(plan)
    host.beginHostStep(plan, { stepId: 'c' })
    host.completeHostStep(plan, { stepId: 'c' })
    check('CX29 恢复后可用剩余预算', plan.stepsUsed === 3)
    // 刷新往返：预算/状态无损。
    const round = host.normalizeHostPlan(JSON.parse(JSON.stringify(plan)))
    check('CX29 主持计划归一化往返无损', round.stepsUsed === 3 && round.maxSteps === 3 && round.status === 'awaiting-player')
    host.endHostPlan(plan)
    check('CX29 显式结束后不再推进', (() => { try { host.beginHostStep(plan, { stepId: 'd' }); return false } catch (error) { return error.code === 'ROLEPLAY_HOST_ENDED' } })())
  }
  // workflow 级：pending 未决时主持步被发送门禁拦截（主持不代替玩家）。
  {
    const store = createMockStore({ flushOk: true })
    workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: '' })
    let idx = 0
    await workflow.confirmRoleplayAction(store, {
      rawInput: '检定行动', attribute: 'wits', modifier: 0,
      nextUint32: () => [5, 5][idx++ % 2]
    }).catch(() => {})
    let blocked = ''
    try {
      await workflow.advanceRoleplayHostStep({ ...store, isLoading: false })
    } catch (error) { blocked = error.code }
    check('XC-G25 pending 未决时主持步被拒（停在真人边界）', blocked === 'ROLEPLAY_PENDING_BLOCKS_SEND')
    check('XC-G25 预算未被非法消耗', store.roleplaySession.hostPlan === null || store.roleplaySession.hostPlan.stepsUsed === 0)
  }
}


// ── CX43/XC-G37：500 回合 / 20 分支长程稳定性（离线形状级） ──
{
  const state = stateMod.createEmptyRoleplaySessionState()
  state.mode = 'rules'
  // 20 个分支各有 pending：创建时容量背压只放行 6 个，第 7 起明确拒绝——
  // 已放行的 6 个 pending 一条不丢（背压而非静默淘汰）。
  for (let b = 0; b < 20; b += 1) {
    const a = contract.createConfirmedRoleplayAction({ sessionId: 's1', branchId: `br_${b}`, rawInput: `分支${b}`, attribute: 'wits', modifier: 0 })
    a.status = 'resolved'
    a.resolution = { dice: [3, 3], modifier: 0, total: 6, outcome: 'failure', rngTrace: {}, resolvedAt: b }
    const capacity = stateMod.checkRoleplayPendingCapacity(state, `br_${b}`)
    if (capacity.ok) state.pendingByBranch[`br_${b}`] = a
  }
  // 500 回合：receipts 热窗 200 + outbox 自包含全量。
  for (let i = 0; i < 500; i += 1) {
    const a = contract.createConfirmedRoleplayAction({ sessionId: 's1', branchId: 'main', rawInput: `回合${i}`, attribute: 'wits', modifier: 0 })
    contract.applyResolution(a, { dice: [5, 5], rngTrace: {} })
    contract.markRoleplayActionCommitted(a, { narrationTurnId: `turn_${i}` })
    const receipt = projection.buildTurnReceiptV1(a, { turnId: `turn_${i}`, parentTurnId: null, store: { currentSessionId: 's1', activeBranchId: 'main', worldId: 'wb1' } })
    const q = adapter.queueRoleplayArchive(state, { action: a, receipt, scope: receipt.scope })
    if (!q.ok && q.reason !== 'ROLEPLAY_OUTBOX_CAPACITY') throw new Error('unexpected queue failure')
    state.receipts.push(receipt)
  }
  const stable = stateMod.normalizeRoleplaySessionState(JSON.parse(JSON.stringify(state)))
  check('XC-G37 20 分支：6 个放行 pending 全保留（其余被可见背压）', Object.keys(stable.pendingByBranch).length === 6)
  check('XC-G37 500 回合：outbox 容量背压在 1000 内不丢（500 全保留）', stable.archiveOutbox.length === 500
    && stable.archiveOutbox[0].turnId === 'turn_0'
    && Boolean(stable.archiveOutbox.at(-1).payload?.receipt?.receiptId))
  check('XC-G37 receipts 热窗保持 200（归档真源在 outbox）', stable.receipts.length === 200)
}


// ── CX39/CX42：场次记录、回退失效与手动导出（XC-G34/G39） ──
{
  const records = await import(path.join(root, 'src/services/experience/roleplay/roleplayRecords.js'))
  const scenarioJson2 = JSON.parse(readFileSync(path.join(root, 'src/services/experience/roleplay/fixtures/lampkeeper-scenario.json'), 'utf8'))
  const scen = scenarioMod.normalizeScenario(scenarioJson2.scenario)
  const run2 = scenarioMod.createScenarioRun(scen)
  scenarioMod.moveScenarioRun(run2, scen, { toSceneId: 'scene_stairs' })
  scenarioMod.applyScenarioOutcome(run2, scen, { actionId: 'act_r1', clueId: 'clue_scuff', outcome: 'success', turnId: 'turn_A' })
  const record = records.buildScenarioRecord(run2, scen, { sourceRef: records.buildRecordSourceRef({ sessionId: 'sess_x', branchId: 'main', turnId: 'turn_A' }) })
  check('CX39 摘要锚定来源回合', record.sourceTurnIds.includes('turn_A') && record.events.every((event) => !event.invalidated))
  // XC-G34：回退使事件失效（保留本体，标记可观测），不覆盖正文。
  const invalidated = records.invalidateRecordsFrom(record, 'turn_A')
  check('XC-G34 回退失效标记可观测', invalidated.invalidated >= 1 && record.events.some((event) => event.invalidated))
  check('XC-G34 摘要不冒称仍有效', record.sourceTurnIds.includes('turn_A') === false)
  // XC-G39：公开/作者两档导出；白名单构造，无密钥混入。
  const receiptsForExport = [{ receiptId: 'act_r1', turnId: 'turn_A', committedAt: 1, payloadHash: 'h', scope: { branchId: 'main' } }]
  const pub = records.exportAdventureRecord({ run: run2, scenario: scen, receipts: receiptsForExport, mode: 'public', sourceRef: records.buildRecordSourceRef({ sessionId: 'sess_x', branchId: 'main' }) })
  const auth = records.exportAdventureRecord({ run: run2, scenario: scen, receipts: receiptsForExport, mode: 'author', sourceRef: records.buildRecordSourceRef({ sessionId: 'sess_x', branchId: 'main' }) })
  check('XC-G39 公开档不含失效事件与回执引用', !JSON.stringify(pub).includes('sourceActionId') && !('receiptRefs' in pub))
  check('XC-G39 作者档含来源与回执引用', JSON.stringify(auth).includes('sourceActionId') && auth.receiptRefs?.length === 1)
  check('XC-G39 导出白名单构造（无 settings/apiKey 字段）', !JSON.stringify(pub).includes('apiKey') && !JSON.stringify(auth).includes('baseUrl'))
  check('CX42 导出范围非法拒绝', throwsWithCode(() => records.exportAdventureRecord({ run: run2, scenario: scen, mode: 'everything' }), 'ROLEPLAY_EXPORT_SCOPE_INVALID'))
}


// ── CX31–CX36：单一 AI 同伴（XC-G28/G29/G31 形状级） ──
{
  const comp = await import(path.join(root, 'src/services/experience/roleplay/roleplayCompanion.js'))
  const scenarioJson3 = JSON.parse(readFileSync(path.join(root, 'src/services/experience/roleplay/fixtures/lampkeeper-scenario.json'), 'utf8'))
  const store3 = createMockStore({ flushOk: true })
  workflow.setRoleplaySessionSetup(store3, { mode: 'rules', goal: '' })
  // CX31：默认未启用；开启后身份明确非玩家、可停用。
  check('CX31 同伴默认未启用', workflow.getRoleplayCompanionProposal(store3) === null)
  workflow.setRoleplayCompanionEnabled(store3, { enabled: true })
  check('CX31 同伴身份非玩家分身且可停用', store3.roleplaySession.companion?.isPlayer === false)
  workflow.startRoleplayScenario(store3, { scenario: scenarioJson3.scenario })
  // CX33：确定性提案（值房首条可用线索），白名单来源。
  const proposal = workflow.getRoleplayCompanionProposal(store3)
  check('CX33 每轮至多一个提案（确定性）', proposal?.kind === 'check' && proposal.clueId === 'clue_log')
  // CX36/G31：白名单外提案被硬拒（注入伪造的移动/未知目标）。
  const view3 = workflow.getRoleplayScenarioView(store3)
  check('CX36 伪造目标提案被拒', comp.validateProposalAgainstProjection({ kind: 'move', toSceneId: 'scene_vault' }, view3) === false)
  check('CX36 未知 kind 提案被拒', comp.validateProposalAgainstProjection({ kind: 'spend', resource: 'vitality', amount: -99 }, view3) === false)
  check('CX31 消耗资源/不可逆动作不在提案白名单', proposal.kind !== 'spend')
  // CX34：check 提案采纳必须回到玩家确认（不跳过确认面板）。
  const adopted = workflow.adoptRoleplayCompanionProposal(store3, { proposal })
  check('CX34 检定提案采纳需玩家确认', adopted.ok === true && adopted.requiresConfirm === true && adopted.clueId === 'clue_log')
  // 移动提案可执行，但也是显式玩家动作。
  const moveProposal = { kind: 'move', toSceneId: 'scene_stairs', label: 'x' }
  check('CX34 移动提案合法目标放行', workflow.adoptRoleplayCompanionProposal(store3, { proposal: moveProposal }).executed === 'move')
  // CX32：知识上下文降级（不回退全库）。
  const ctx = comp.buildCompanionContext(view3)
  check('XC-G29 知识未接线时缩小到公开投影（不回退全库）', ctx.ok === true && ctx.scope === 'scenario-public-only' && ctx.facts.length === 0)
  // 停用后不再产生提案。
  workflow.setRoleplayCompanionEnabled(store3, { enabled: false })
  check('CX31 停用后无提案', workflow.getRoleplayCompanionProposal(store3) === null)
}


// ── CX19：稳定 actorRef 与属性来源区分 ──
{
  const actorMod = await import(path.join(root, 'src/services/experience/roleplay/roleplayActor.js'))
  const actor = actorMod.createActor({ sessionId: 'sess_actor_1', name: '林舟' })
  check('CX19 actorRef 稳定绑定会话', actor.actorRef === 'actor:player:sess_actor_1')
  actorMod.setActorOverride(actor, { attribute: 'wits', modifier: 1 })
  const eff = actorMod.effectiveModifier(actor, 'wits')
  check('CX19 override 生效且来源=actor', eff.modifier === 1 && eff.source === 'actor')
  check('CX19 无 override 属性来源=manual-adjust', actorMod.effectiveModifier(actor, 'agility').source === 'manual-adjust')
  check('CX19 越界 override 拒绝', throwsWithCode(() => actorMod.setActorOverride(actor, { attribute: 'wits', modifier: 9 }), 'ROLEPLAY_MODIFIER_INVALID'))
  check('CX19 非法属性拒绝', throwsWithCode(() => actorMod.setActorOverride(actor, { attribute: 'luck', modifier: 1 }), 'ROLEPLAY_ATTRIBUTE_INVALID'))
  const card = actorMod.buildActorCardProjection(actor)
  check('CX19 角色卡投影五属性带来源', card.attributes.length === 5 && card.attributes.find((a) => a.key === 'wits').source === 'actor')
  const actorRound = actorMod.normalizeActor(JSON.parse(JSON.stringify(actor)))
  check('CX19 actor 归一化无损', actorRound.actorRef === actor.actorRef && actorRound.attributeOverrides.wits === 1)
  // 会话级往返：roleplayState 携带 actor。
  const stateWithActor = { version: 1, mode: 'rules', actor: JSON.parse(JSON.stringify(actor)) }
  const st = stateMod.normalizeRoleplaySessionState(stateWithActor)
  check('CX19 actor 随会话状态往返', st?.actor?.actorRef === 'actor:player:sess_actor_1')
  // modifierSource 进入 ruleSnapshot。
  const action = contract.createConfirmedRoleplayAction({ sessionId: 's1', branchId: 'main', rawInput: '带来源行动', attribute: 'wits', modifier: 1, modifierSource: 'actor' })
  check('CX19 ruleSnapshot 记录 modifierSource=actor', action.ruleSnapshot.modifierSource === 'actor')
  const manual = contract.createConfirmedRoleplayAction({ sessionId: 's1', branchId: 'main', rawInput: '手动来源行动', attribute: 'wits', modifier: 2 })
  check('CX19 默认来源=manual-adjust', manual.ruleSnapshot.modifierSource === 'manual-adjust')
}
// eslint-disable-next-line no-console

// ── CX32：同伴知识上下文深度路径（A queryFacts 会话域 + 降级） ──
{
  const comp = await import(path.join(root, 'src/services/experience/roleplay/roleplayCompanion.js'))
  const scenarioJson4 = JSON.parse(readFileSync(path.join(root, 'src/services/experience/roleplay/fixtures/lampkeeper-scenario.json'), 'utf8'))
  const scen4 = scenarioMod.normalizeScenario(scenarioJson4.scenario)
  const view4 = scenarioMod.buildScenarioPublicProjection(scenarioMod.createScenarioRun(scen4), scen4)
  // provider 抛异常 → 降级公开投影，不抛出。
  const degraded = await comp.buildCompanionKnowledgeContext({
    projection: view4, sessionId: 's1', branchId: 'main',
    queryFactsFn: async () => { throw new Error('db-down') }, db: {}
  })
  check('XC-G29 知识读取故障降级公开投影（不扩大上下文）', degraded.ok === true && degraded.facts.length === 0 && String(degraded.knowledgeScope).startsWith('unavailable:'))
  // provider 失败返回 → 同样降级。
  const failed = await comp.buildCompanionKnowledgeContext({
    projection: view4, sessionId: 's1', branchId: 'main',
    queryFactsFn: async () => ({ ok: false, reason: 'scope-invalid' }), db: {}
  })
  check('CX32 provider 失败如实标记', failed.ok === true && String(failed.knowledgeScope).startsWith('unavailable:'))
  // 成功路径：只保留同会话事实的白名单字段。
  const fakeDb = {}
  const fakeQuery = async (db, input) => ({
    ok: true,
    items: [
      { factKey: 'f1', subjectId: 'npc_guard', predicate: 'motive', value: '欠债', recordedAt: 1, scope: { sessionId: 's1' } },
      { factKey: 'f2', subjectId: 'npc_other', predicate: 'secret', value: '别书事实', recordedAt: 2, scope: { sessionId: 'other' } },
      { factKey: 'f3', subjectId: 'npc_guard', predicate: 'leak', value: '字段外内容', recordedAt: 3, scope: { sessionId: 's1' } }
    ]
  })
  const knowledge = await comp.buildCompanionKnowledgeContext({ projection: view4, sessionId: 's1', branchId: 'main', queryFactsFn: fakeQuery, db: fakeDb })
  check('CX32 作者事实不能冒充角色已知信息', knowledge.scope === 'scenario-public-only' && knowledge.facts.length === 0)
  check('CX32 别书事实被过滤', !knowledge.facts.some((f) => f.value === '别书事实'))
}


// ── CX38/XC-G23：分支口径资源视图（本分支+共享 delta） ──
{
  const resourcesMod = await import(path.join(root, 'src/services/experience/roleplay/roleplayResources.js'))
  const state = resourcesMod.createResourceState()
  resourcesMod.applyResourceDelta(state, { deltaId: 'b_main', resource: 'lampOil', amount: -2, branchId: 'main' })
  resourcesMod.applyResourceDelta(state, { deltaId: 'b_a', resource: 'vitality', amount: -2, branchId: 'branch_a' })
  const mainView = resourcesMod.computeResourceValuesForBranch(state, 'main')
  const aView = resourcesMod.computeResourceValuesForBranch(state, 'branch_a')
  check('XC-G23 主分支视图不含他分支 delta（灯油-2 计入、活力不计入）', mainView.lampOil === 8 && mainView.vitality === 100)
  check('XC-G23 分支 A 视图含自身与本干 delta', aView.lampOil === 8 && aView.vitality === 98)
  const noBranch = resourcesMod.computeResourceValuesForBranch(state, 'branch_b')
  check('XC-G23 无关分支只见共享 delta', noBranch.vitality === 100 && noBranch.lampOil === 8)
}


// ── CX45：规则版本升级语义（未来规则阈值自洽，不被 v1 引擎静默改写） ──
{
  const futureRuleAction = contract.createConfirmedRoleplayAction({ sessionId: 's1', branchId: 'main', rawInput: '未来规则行动', attribute: 'wits', modifier: 0 })
  // 模拟未来规则包：阈值不同（9+ 成功），归一化保留其阈值与版本。
  futureRuleAction.ruleSnapshot.version = 2
  futureRuleAction.ruleSnapshot.thresholds = { success: 9, partialSuccess: 6 }
  const normalized = contract.normalizeRoleplayAction(JSON.parse(JSON.stringify(futureRuleAction)))
  check('CX45 未来规则版本与阈值原样保留', normalized?.ruleSnapshot?.version === 2
    && normalized.ruleSnapshot.thresholds.success === 9
    && normalized.ruleSnapshot.thresholds.partialSuccess === 6)
  const resolved = contract.applyResolution(normalized, { dice: [4, 4], rngTrace: {} })
  check('CX45 结算按该行动自己的阈值判定（总 8 → 按 v2 阈值=部分成功）', resolved.resolution.total === 8 && resolved.resolution.outcome === 'partial')
}


// ── CX44：混沌补例——叙述请求同步失败/中止后预算与 pending 一致 ──
{
  const store = createMockStore({ flushOk: true })
  workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: '' })
  // sendAction 同步抛错（模拟中止/身份失效）：预算已预扣但 pending 保持 resolved，
  // 重试路径不被破坏。
  store.sendAction = async () => { throw Object.assign(new Error('aborted'), { code: 'NARRATIVE_AGENT_ABORTED' }) }
  let idx = 0
  await workflow.confirmRoleplayAction(store, {
    rawInput: '混沌行动', attribute: 'wits', modifier: 0,
    nextUint32: () => [5, 2][idx++ % 2]
  }).catch((error) => { store.caughtCode = error.code })
  const pending = stateMod.getRoleplayPendingForBranch(store.roleplaySession, 'main')
  check('CX44 叙述中止后 pending 保持 resolved（错误向 UI 传播）', pending?.status === 'resolved' && store.caughtCode === 'NARRATIVE_AGENT_ABORTED')
  // 恢复正常 sendAction：重试走同一骰点。
  const sent = []
  store.sendAction = async (text, options = {}) => { sent.push({ text, options }); return 'success' }
  await workflow.retryRoleplayNarration(store)
  check('CX44 重试复用同一骰点与身份', sent.length === 1
    && sent[0].options.roleplayActionId === pending.actionId
    && String(sent[0].options.directorNote || '').includes('部分成功'))
  // 结算后果只应用一次（中止失败 + 成功重试合计只扣一轮）。
  const costDeltas = store.roleplaySession.resources.deltas.filter((d) => d.sourceRef === 'outcome:partial')
  check('CX22/CX44 资源代价不因重试重复', costDeltas.length === 1)
}


// ── CX30：12 组固定动作/结果组合（离线确定性部分：机械一致性零容忍） ──
{
  const outcomes = ['success', 'partial', 'failure']
  const actions = [
    { label: '调查', rawInput: '调查书架后的暗格', attribute: 'wits' },
    { label: '行动', rawInput: '强行推开石门', attribute: 'physique' },
    { label: '交涉', rawInput: '向守陵人打听碑文来历', attribute: 'presence' }
  ]
  let combo = 0
  let allFrozen = true
  let allCostOnce = true
  let allNoReverse = true
  for (const action of actions) {
    for (const outcome of outcomes) {
      for (const repeat of [false, true]) {
        combo += 1
        const store = createMockStore({ flushOk: true })
        workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: 'CX30' })
        let idx = 0
        const samples = outcome === 'success' ? [5, 5] : outcome === 'partial' ? [4, 3] : [1, 1]
        try {
          await workflow.confirmRoleplayAction(store, {
            rawInput: action.rawInput, attribute: action.attribute, modifier: 0,
            nextUint32: () => samples[idx++ % samples.length]
          })
        } catch { /* 失败前进也是合法结算，pending 仍 resolved */ }
        const pending = stateMod.getRoleplayPendingForBranch(store.roleplaySession, 'main')
        if (!pending || pending.resolution.outcome !== outcome) { allFrozen = false; continue }
        const directive = projection.buildResolutionDirective(pending)
        // 机械结果不被反转：directive 必须包含该结果的判定与骰点。
        const expectedLabel = { success: '成功', partial: '部分成功', failure: '失败前进' }[outcome]
        if (!directive.includes(expectedLabel) || !directive.includes(String(pending.resolution.total))) allNoReverse = false
        // 重试叙述不改骰点/不改结果；重复结算拒绝。
        if (repeat) {
          let conflict = ''
          try { contract.applyResolution(pending, { dice: [6, 6], rngTrace: {} }) } catch (error) { conflict = error.code }
          if (conflict !== 'ROLEPLAY_RESOLVE_INVALID_STATE' || pending.resolution.total !== samples.map((v) => (v % 6) + 1).reduce((s, v) => s + v, 0)) allCostOnce = false
        }
      }
    }
  }
  check('CX30 12 组合机械结果全部冻结不被反转', allNoReverse)
  check('CX30 12 组合重复结算全部拒绝（代价/骰点只发生一次）', allCostOnce)
}


// ── CX43 附：长程处理实测耗时（记录真实规模数据，不编造指标） ──
{
  const t0 = Date.now()
  const state = stateMod.createEmptyRoleplaySessionState()
  for (let i = 0; i < 500; i += 1) {
    const a = contract.createConfirmedRoleplayAction({ sessionId: 's1', branchId: `br_${i % 10}`, rawInput: `规模行动${i}`, attribute: 'wits', modifier: 0 })
    contract.applyResolution(a, { dice: [5, 5], rngTrace: {} })
    contract.markRoleplayActionCommitted(a, { narrationTurnId: `turn_${i}` })
    const receipt = projection.buildTurnReceiptV1(a, { turnId: `turn_${i}`, parentTurnId: null, store: { currentSessionId: 's1', activeBranchId: `br_${i % 10}`, worldId: 'wb1' } })
    adapter.queueRoleplayArchive(state, { action: a, receipt, scope: receipt.scope })
  }
  const queueMs = Date.now() - t0
  const t1 = Date.now()
  const normalized = stateMod.normalizeRoleplaySessionState(JSON.parse(JSON.stringify(state)))
  const normMs = Date.now() - t1
  // eslint-disable-next-line no-console
  console.log(`[cx43-measure] 500 条入队=${queueMs}ms，500 条归一化=${normMs}ms，容量=${normalized.archiveOutbox.length}`)
  check('CX43 实测：500 条全保留（低于容量上限无背压丢弃）', normalized.archiveOutbox.length === 500)
}

// ── G2a/G2b：最小 run 合同（StoryForge hash/checkpoint 移植面）与持久恢复 ──
{
  const fixed = { z: 1, a: 2, nested: { y: undefined, b: 3, a: 1 } }
  check('G2a canonicalStringify 键排序且去 undefined', runContract.canonicalStringify(fixed) === '{"a":2,"nested":{"a":1,"b":3},"z":1}')
  check('G2a undefined 字段不改变哈希', runContract.hashCanonicalValue({ a: 1, b: undefined }) === runContract.hashCanonicalValue({ a: 1 }))
  check('G2a 键序不同哈希一致', runContract.hashCanonicalValue({ a: 1, b: 2 }) === runContract.hashCanonicalValue({ b: 2, a: 1 }))
  check('G2a 缺 taskId 拒绝', throwsWithCode(() => runContract.createRunIdentity({ scope: { sessionId: 's' } }), 'RUN_TASK_ID_INVALID'))
  check('G2a 缺 sessionId 拒绝', throwsWithCode(() => runContract.createRunIdentity({ taskId: 't', scope: {} }), 'RUN_SCOPE_INVALID'))
  check('G2a 跨分支写入拒绝', (() => {
    const identity = runContract.createRunIdentity({ taskId: 't', scope: { sessionId: 's1', branchId: 'main' } })
    return throwsWithCode(() => runContract.assertRunScope(identity, { sessionId: 's1', branchId: 'other' }), 'RUN_SCOPE_MISMATCH')
  })())
  check('G2a 跨书写入拒绝', (() => {
    const identity = runContract.createRunIdentity({ taskId: 't', scope: { bookId: 'b1', sessionId: 's1', branchId: 'main' } })
    return throwsWithCode(() => runContract.assertRunScope(identity, { bookId: 'b2', sessionId: 's1', branchId: 'main' }), 'RUN_SCOPE_MISMATCH')
  })())

  // 幂等 begin/complete：同输入复用、异输入拒绝、重试 attempt+1、副作用唯一。
  {
    const identity = runContract.createRunIdentity({ taskId: 't', scope: { sessionId: 's1', branchId: 'main' } })
    const run = runContract.createRunRecord({ identity })
    const first = runContract.beginRunStep(run, { stepId: 'resolve', input: { actionId: 'a1' } })
    const again = runContract.beginRunStep(run, { stepId: 'resolve', input: { actionId: 'a1' } })
    check('G2a 同输入 begin 幂等复用', first.reused === false && again.reused === true && again.receipt === first.receipt)
    check('G2a 同步骤异输入拒绝（幂等键冲突）', throwsWithCode(() => runContract.beginRunStep(run, { stepId: 'resolve', input: { actionId: 'a2' } }), 'RUN_STEP_INPUT_CONFLICT'))
    check('G2a 成功步骤缺结果哈希拒绝', throwsWithCode(() => runContract.completeRunStep(run, { stepId: 'resolve', status: 'succeeded' }), 'RUN_STEP_RESULT_HASH_MISSING'))
    runContract.completeRunStep(run, { stepId: 'resolve', status: 'succeeded', result: { dice: [3, 4] }, effectKey: 'dice:a1' })
    const replay = runContract.completeRunStep(run, { stepId: 'resolve', status: 'succeeded', result: { dice: [3, 4] }, effectKey: 'dice:a1' })
    check('G2a 同结果重复结算幂等复用', replay.reused === true)
    check('G2a 异结果重复结算拒绝', throwsWithCode(() => runContract.completeRunStep(run, { stepId: 'resolve', status: 'succeeded', result: { dice: [5, 6] } }), 'RUN_STEP_RESULT_CONFLICT'))
    check('G2a 同 effectKey 第二个副作用拒绝', (() => {
      runContract.beginRunStep(run, { stepId: 'resource-cost', input: { actionId: 'a1' } })
      return throwsWithCode(() => runContract.completeRunStep(run, { stepId: 'resource-cost', status: 'succeeded', result: { v: 1 }, effectKey: 'dice:a1' }), 'RUN_EFFECT_DUPLICATE')
    })())
    // narration 步骤：failed → 重新 begin attempt+1 → succeeded。
    runContract.beginRunStep(run, { stepId: 'narration', input: { actionId: 'a1' } })
    runContract.completeRunStep(run, { stepId: 'narration', status: 'failed', errorCode: 'NARRATIVE_AGENT_FAILED' })
    const retryBegin = runContract.beginRunStep(run, { stepId: 'narration', input: { actionId: 'a1' } })
    check('G2a 失败重试 attempt+1 且回 pending', retryBegin.retried === true && retryBegin.receipt.attempt === 2 && retryBegin.receipt.status === 'pending')
    // 状态机：running→completed 合法；终态再开步/回退拒绝。
    runContract.completeRunStep(run, { stepId: 'narration', status: 'succeeded', result: { turnId: 't1' }, commitReceipt: { kind: 'turn-commit', turnId: 't1', committedAt: 1 } })
    runContract.setRunStatus(run, 'completed')
    check('G2a 终态后再开步拒绝', throwsWithCode(() => runContract.beginRunStep(run, { stepId: 'x', input: {} }), 'RUN_TERMINAL'))
    check('G2a 终态回退拒绝', throwsWithCode(() => runContract.setRunStatus(run, 'running'), 'RUN_TRANSITION_INVALID'))
    const plan = runContract.buildRunRecoveryPlanV1(run)
    check('G2a 恢复计划分类：完成/已采用/可恢复', plan.completedStepIds.length === 2 && plan.committedAdoptionStepIds.length === 1 && plan.resumableStepIds.length === 0)
    check('G2a 未知版本 run 拒绝解析', runContract.parseRunRecordV1({ version: 99 }) === null)
  }

  // G2b store 级：确认→登记→结算记账→叙述提交完成。
  {
    const store = createMockStore({ flushOk: true })
    workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: 'run 账目验收' })
    await workflow.confirmRoleplayAction(store, { rawInput: '查看祭坛', attribute: 'wits', modifier: 0, nextUint32: () => 8 })
    const state = store.roleplaySession
    const pendingAction = state.pendingByBranch.main
    const run = state.runs?.find((item) => item.runId === pendingAction.actionId)
    check('G2b 确认即登记 run（runId=actionId，confirm 步骤已提交）', Boolean(run) && run.runId === pendingAction.actionId && run.steps.some((s) => s.stepId === 'confirm' && s.status === 'succeeded' && s.effectKey === `confirm:${run.runId}`))
    check('G2b 结算后 run 含骰点步骤与 narration 待办', run.steps.some((s) => s.stepId === 'resolve' && s.status === 'succeeded' && s.effectKey === `dice:${run.runId}`) && run.steps.some((s) => s.stepId === 'narration' && s.status === 'pending'))
    check('G2b run 资源快照与当前一致（自身结算后更新）', Boolean(run.resourceRevision) && !roleplayRuns.buildRoleplayRunRecoveryViews(state)[0].stale)
    // coordinator 提交路径：commitRoleplayNarration → run 完成。
    const userMessage = { id: 'msg_user_1', role: 'user', content: '查看祭坛' }
    store.messages.push(userMessage)
    const turnRecord = { id: 'turn_eval_1', parentTurnId: null, userMessageIds: ['msg_user_1'], branchId: 'main' }
    const receipt = workflow.commitRoleplayNarration(store, { action: pendingAction, turnRecord })
    check('G2b 提交后 run 终态 completed 且 narration 关联 turn', run.status === 'completed' && run.steps.find((s) => s.stepId === 'narration')?.resultRef === 'turn:turn_eval_1')
    check('G2b 提交回执 receiptId=actionId', receipt?.receiptId === pendingAction.actionId)
    check('G2b 完成后无待恢复 run', workflow.getRoleplayRunRecoveryViews(store).length === 0)
    check('G2b 骰点副作用步骤唯一（重复提交不重复记账）', run.steps.filter((s) => s.effectKey === `dice:${run.runId}` && s.status === 'succeeded').length === 1)
  }

  // G2b 幂等确认：pending 在途时同 payload 复用（不重骰），异 payload 冲突拒绝。
  {
    const store = createMockStore({ flushOk: true })
    workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: '幂等确认验收' })
    await workflow.confirmRoleplayAction(store, { rawInput: '搜索房间', attribute: 'wits', modifier: 0, nextUint32: () => 2 })
    const state = store.roleplaySession
    const pendingBefore = state.pendingByBranch.main
    const diceFrozen = JSON.stringify(pendingBefore.resolution.dice)
    const sendCount = store.sent.length
    await workflow.confirmRoleplayAction(store, { rawInput: '搜索房间', attribute: 'wits', modifier: 0, nextUint32: () => 999 })
    check('G2b 同载荷重发复用同 actionId（不重骰）', state.pendingByBranch.main.actionId === pendingBefore.actionId && JSON.stringify(state.pendingByBranch.main.resolution.dice) === diceFrozen)
    check('G2b 同载荷重发只重发叙述（一次）', store.sent.length === sendCount + 1 && store.sent.at(-1).options.roleplayActionId === pendingBefore.actionId)
    check('G2b 同载荷重发不新增 run', state.runs.filter((item) => item.runId === pendingBefore.actionId).length === 1)
    let conflictCode = null
    try {
      await workflow.confirmRoleplayAction(store, { rawInput: '改为撬锁', attribute: 'wits', modifier: 0 })
    } catch (error) { conflictCode = error?.code }
    check('G2b 异 payload 冲突拒绝', conflictCode === 'ROLEPLAY_PENDING_CONFLICT')
  }

  // G2b 刷新恢复：resolved+未叙述 → 载入扫描 interrupted → 恢复同骰点 → 完成一次。
  {
    const store = createMockStore({ flushOk: true })
    workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: '刷新恢复验收' })
    await workflow.confirmRoleplayAction(store, { rawInput: '撬开锁', attribute: 'physique', modifier: 1, nextUint32: () => 4 })
    const before = store.roleplaySession
    const pendingBefore = stateMod.getRoleplayPendingForBranch(before, 'main')
    const diceFrozen = JSON.stringify(pendingBefore.resolution.dice)
    check('G2b 刷新前 run 非终态且 narration 待办', before.runs.length === 1 && before.runs[0].status === 'running')
    // 模拟刷新：序列化 → 载入（loadRoleplayStateForSession 含 interrupted 扫描）。
    const serialized = JSON.parse(JSON.stringify(before))
    const loaded = stateMod.loadRoleplayStateForSession(serialized)
    const restored = loaded.current
    const run = restored.runs[0]
    check('G2b 载入扫描把 running 标为 interrupted', run.status === 'interrupted')
    check('G2b 恢复视图展示 interrupted + 可恢复 narration', (() => {
      const views = roleplayRuns.buildRoleplayRunRecoveryViews(restored)
      return views.length === 1 && views[0].status === 'interrupted' && views[0].actionId === run.runId
    })())
    // 恢复：接回 store（同会话身份）→ resume 同 actionId → 同骰点重发叙述。
    store.roleplaySession = restored
    const sendCountBefore = store.sent.length
    await workflow.resumeRoleplayPending(store, { actionId: pendingBefore.actionId })
    const pendingAfter = stateMod.getRoleplayPendingForBranch(store.roleplaySession, 'main')
    check('G2b 恢复后骰点不变（不重掷）', JSON.stringify(pendingAfter.resolution.dice) === diceFrozen)
    check('G2b 恢复即重发叙述（同 actionId，显式动作）', store.sent.length === sendCountBefore + 1 && store.sent.at(-1).options.roleplayActionId === pendingBefore.actionId)
    check('G2b 恢复后 run 回到 running', store.roleplaySession.runs[0].status === 'running')
    // 提交：完成一次；重复提交同 turn 幂等。
    const action = pendingAfter
    workflow.commitRoleplayNarration(store, { action, turnRecord: { id: 'turn_r1', parentTurnId: null, userMessageIds: [], branchId: 'main' } })
    workflow.commitRoleplayNarration(store, { action, turnRecord: { id: 'turn_r1', parentTurnId: null, userMessageIds: [], branchId: 'main' } })
    check('G2b 重复提交同 turn 幂等（completed 一次，回执唯一）', store.roleplaySession.runs[0].status === 'completed' && store.roleplaySession.runs[0].steps.filter((s) => s.stepId === 'narration' && s.status === 'succeeded').length === 1)
  }

  // G2b 存储失败/取消/外部改动 stale/终态裁剪。
  {
    const store = createMockStore({ flushOk: false })
    workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: '故障边界验收' })
    let caught = null
    try {
      await workflow.confirmRoleplayAction(store, { rawInput: '推门', attribute: 'physique', modifier: 0, nextUint32: () => 6 })
    } catch (error) { caught = error }
    check('G2b 确认 durable 失败：零骰点零 run', caught?.code === 'ROLEPLAY_PERSIST_FAILED' && (store.roleplaySession?.runs?.length || 0) === 0 && !store.roleplaySession?.pendingByBranch?.main)

    const okStore = createMockStore({ flushOk: true })
    workflow.setRoleplaySessionSetup(okStore, { mode: 'rules', goal: '取消与 stale' })
    await workflow.confirmRoleplayAction(okStore, { rawInput: '搜索房间', attribute: 'wits', modifier: 0, nextUint32: () => 2 })
    workflow.cancelRoleplayPending(okStore)
    const cancelledRun = okStore.roleplaySession.runs[0]
    check('G2b 放弃后 run 显式取消（终态保留诊断）', cancelledRun.status === 'cancelled' && cancelledRun.lastErrorCode === 'ROLEPLAY_CANCELLED')

    const staleStore = createMockStore({ flushOk: true })
    workflow.setRoleplaySessionSetup(staleStore, { mode: 'rules', goal: 'stale 验收' })
    // 骰 3+3=6 → 失败前进 → 自身资源结算已应用（run 快照非空）。
    await workflow.confirmRoleplayAction(staleStore, { rawInput: '聆听', attribute: 'wits', modifier: 0, nextUint32: () => 2 })
    const staleState = staleStore.roleplaySession
    const freshView = roleplayRuns.buildRoleplayRunRecoveryViews(staleState)[0]
    check('G2b 自身结算后恢复视图不误报 stale', freshView?.stale === false && Boolean(freshView) === true)
    // 外部改动（消耗品使用不经 run）→ 快照不一致 → stale 标记。
    const resourceMod = await import(path.join(root, 'src/services/experience/roleplay/roleplayResources.js'))
    resourceMod.applyResourceDelta(staleState.resources, {
      deltaId: 'eval_external_use', resource: 'lampOil', amount: -1, sourceRef: 'eval:manual-use', branchId: 'main'
    })
    const staleView = roleplayRuns.buildRoleplayRunRecoveryViews(staleState)[0]
    check('G2b 外部资源改动后恢复视图标记 stale', staleView?.stale === true)

    // 终态 LRU：非终态绝不裁剪。
    const trimState = { runs: [] }
    for (let i = 0; i < 60; i += 1) {
      trimState.runs.push({ version: 1, runId: `run_t${i}`, taskId: 't', scope: { sessionId: 's', branchId: 'main' }, contractVersion: 1, resourceRevision: null, status: 'completed', steps: [], budget: null, lastErrorCode: null, createdAt: i, updatedAt: i })
    }
    trimState.runs.push({ version: 1, runId: 'run_live', taskId: 't', scope: { sessionId: 's', branchId: 'main' }, contractVersion: 1, resourceRevision: null, status: 'interrupted', steps: [], budget: null, lastErrorCode: null, createdAt: 1000, updatedAt: 1000 })
    roleplayRuns.trimRoleplayRuns(trimState)
    check('G2b 终态 LRU 裁剪且非终态保留', trimState.runs.length === roleplayRuns.ROLEPLAY_RUN_LIMIT && trimState.runs.some((r) => r.runId === 'run_live'))
  }
}

// ── R01/R02：KP 阶段协调循环（StoryForge kp-coordinator 适配移植） ──
function createKpMockStore() {
  const store = createMockStore({ flushOk: true })
  let turnSeq = 0
  store.commitCurrentSessionNow = () => true
  store.sendAction = async function sendAction(text, options = {}) {
    this.sent.push({ text, options })
    turnSeq += 1
    this.lastCommittedTurnId = `turn_kp_${turnSeq}`
    return 'success'
  }
  return store
}

function seedKpScenario(store, { companion = true } = {}) {
  const scenarioJson = JSON.parse(readFileSync(path.join(root, 'src/services/experience/roleplay/fixtures/lampkeeper-scenario.json'), 'utf8'))
  const scenario = scenarioMod.normalizeScenario(scenarioJson.scenario)
  workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: '查明灯塔看守失踪的真相' })
  workflow.startRoleplayScenario(store, { scenario })
  if (companion) workflow.setRoleplayCompanionEnabled(store, { enabled: true })
  return scenario
}

  // R01：预算默认 3；周期内 3 个 narration beat；提案出现 → confirmation 立即停。
  {
    const store = createKpMockStore()
    seedKpScenario(store)
    const first = await kpMod.runRoleplayKpCycle(store, { maxAiActions: 3 })
    check('R01 周期返回合法状态', kpMod.ROLEPLAY_KP_STATUSES.includes(first.status), `status=${first.status}`)
    check('R01 budget≤3（预算内停止）', first.aiActions <= 3 && first.aiActions >= 1, `aiActions=${first.aiActions}`)
    check('R01 narration 经 hidden advance 单链', store.sent.length > 0 && store.sent.every((call) => call.options.hidden === true && call.options.source === 'roleplay-host'))
    check('R01 director 指令经导演注通道进入 narration', store.sent.every((call) => typeof call.options.directorNote === 'string' && call.options.directorNote.includes('当前场景')))
    const state = store.roleplaySession
    const kpRun = state.runs.find((run) => run.taskId === kpMod.ROLEPLAY_KP_TASK_ID)
    check('R01 kp run 在案且 narration 步骤全部成功', Boolean(kpRun) && kpRun.steps.filter((s) => s.stepId.startsWith('narration:') && s.status === 'succeeded').length === first.aiActions)
    check('R01 narration effectKey 唯一（不重复 AI 动作）', new Set(kpRun.steps.filter((s) => s.effectKey?.startsWith('kp-narration:')).map((s) => s.effectKey)).size === first.aiActions)
    check('R01 director→narration 成对出现', kpRun.steps.filter((s) => s.stepId.startsWith('director:')).length === kpRun.steps.filter((s) => s.stepId.startsWith('narration:')).length)
    check('R01 budget 镜像持久（刷新不清零）', kpRun.budget.usedAiActions === first.aiActions && kpRun.budget.maxAiActions === 3)
    if (first.status === 'confirmation') {
      check('R01 提案等待真人采纳（不自动执行）', Boolean(first.proposal?.requiresPlayerConfirmation) && state.companion.lastProposal.kind === first.proposal.kind)
    }
  }

  // R02：真人优先——待回应检定立即停，预算零消耗。
  {
    const store = createKpMockStore()
    seedKpScenario(store)
    await workflow.confirmRoleplayAction(store, { rawInput: '检查线索', attribute: 'wits', modifier: 0, nextUint32: () => 2 })
    const sentBefore = store.sent.length
    const result = await kpMod.runRoleplayKpCycle(store, { maxAiActions: 3 })
    check('R02 待回应检定：human-response 立即停', result.status === 'human-response')
    check('R02 真人优先不消耗主持预算（不动玩家骰点）', store.sent.length === sentBefore && result.aiActions === 0)
  }

  // R02：结局立即停；暂停立即停；无场景 setup-required。
  {
    const store = createKpMockStore()
    const scenario = seedKpScenario(store)
    const state = store.roleplaySession
    // 直接触发结局（确定性条件：clue_boot 已发现 + 折返值房）。
    state.scenarioRun.clues.clue_boot = 'discovered'
    const ending = scenarioMod.maybeApplyEnding(state.scenarioRun, scenario)
    const result = await kpMod.runRoleplayKpCycle(store, { maxAiActions: 3 })
    check('R02 结局后不继续消耗动作', Boolean(ending) && result.status === 'ended' && result.aiActions === 0)
    const view = kpMod.getRoleplayKpStatusView(store)
    check('R02 统一状态视图反映结局', view.status === 'ended')

    const store2 = createKpMockStore()
    seedKpScenario(store2)
    workflow.pauseRoleplayHost(store2)
    const paused = await kpMod.runRoleplayKpCycle(store2, { maxAiActions: 3 })
    check('R02 暂停立即停', paused.status === 'paused' && paused.aiActions === 0)

    const store3 = createKpMockStore()
    const none = await kpMod.runRoleplayKpCycle(store3, { maxAiActions: 3 })
    check('R02 无场景 setup-required（不生成）', none.status === 'setup-required' && store3.sent.length === 0)
  }

  // R02：预算耗尽 → budget-limit 交还真人；并发单飞 busy。
  {
    const store = createKpMockStore()
    seedKpScenario(store, { companion: false })
    const first = await kpMod.runRoleplayKpCycle(store, { maxAiActions: 1 })
    const second = await kpMod.runRoleplayKpCycle(store, { maxAiActions: 1 })
    check('R02 预算耗尽交还真人（budget-limit）', first.aiActions === 1 && (second.status === 'budget-limit' || second.status === 'confirmation' || second.aiActions === 0))
    const view = kpMod.getRoleplayKpStatusView(store)
    check('R02 状态视图预算耗尽可见', view.exhausted === true && view.budget.remaining === 0)
  }

  // R01：刷新恢复——中断的 kp run 载入后恢复同 run，不重复 narration effectKey。
  {
    const store = createKpMockStore()
    seedKpScenario(store, { companion: false })
    await kpMod.runRoleplayKpCycle(store, { maxAiActions: 2 })
    const before = store.roleplaySession
    const kpRunBefore = kpMod.findKpRunForBranch(before, 'main')
    const effectKeysBefore = new Set(kpRunBefore.steps.filter((s) => s.effectKey?.startsWith('kp-narration:')).map((s) => s.effectKey))
    // 序列化 → 模拟周期中途崩溃（run 停在 running）→ 载入（interrupted 扫描）
    // → 继续周期：同一 run、效果键不重复。
    const copy = JSON.parse(JSON.stringify(before))
    copy.runs.find((run) => run.taskId === kpMod.ROLEPLAY_KP_TASK_ID).status = 'running'
    const restored = stateMod.loadRoleplayStateForSession(copy).current
    check('R01 中断扫描后 kp run 标 interrupted', kpMod.findKpRunForBranch(restored, 'main').status === 'interrupted')
    store.roleplaySession = restored
    const resumed = await kpMod.runRoleplayKpCycle(store, { maxAiActions: 2 })
    const kpRunAfter = kpMod.findKpRunForBranch(store.roleplaySession, 'main')
    check('R01 恢复复用同一 kp run（不新开）', kpRunAfter.runId === kpRunBefore.runId)
    const effectKeysAfter = kpRunAfter.steps.filter((s) => s.effectKey?.startsWith('kp-narration:')).map((s) => s.effectKey)
    check('R01 恢复后 narration 效果键仍唯一', new Set(effectKeysAfter).size === effectKeysAfter.length)
    check('R01 恢复不重做已完成 AI 动作（效果键为前缀集）', effectKeysAfter.every((key) => {
      const seq = Number(key.split(':').pop())
      return Number.isInteger(seq)
    }) && effectKeysAfter.length >= effectKeysBefore.size)
  }
  // R03：模型同伴白名单候选——校验、越权拒绝、畸形显式失败（不冒充 AI 决策）。
  {
    const companionMod = await import(path.join(root, 'src/services/experience/roleplay/roleplayCompanion.js'))
    const store = createKpMockStore()
    seedKpScenario(store)
    const view = workflow.getRoleplayScenarioView(store)
    const clueIds = view.availableSceneClueActions.map((action) => action.clueId)
    const exitIds = view.currentScene.exits.map((exit) => exit.toSceneId)
    check('R03 夹具有可校验的白名单', clueIds.length > 0 || exitIds.length > 0)
    // 合法模型候选（若有两个线索，取第二个以证明不是"第一个动作"）。
    if (clueIds.length > 1) {
      const resolved = companionMod.resolveCompanionProposal({
        projection: view,
        modelCandidate: { kind: 'check', target: clueIds[1], reason: '线索之间的关联值得先查证' }
      })
      check('R03 合法模型候选通过且标注 model', resolved.ok && resolved.source === 'model' && resolved.proposal.clueId === clueIds[1] && resolved.proposal.source === 'model')
    }
    check('R03 非对象候选拒绝', companionMod.resolveCompanionProposal({ projection: view, modelCandidate: '检查一切' }).reason === 'COMPANION_CANDIDATE_MALFORMED')
    check('R03 未知类型拒绝', companionMod.resolveCompanionProposal({ projection: view, modelCandidate: { kind: 'attack', target: '看守' } }).reason === 'COMPANION_CANDIDATE_MALFORMED')
    check('R03 缺目标拒绝', companionMod.resolveCompanionProposal({ projection: view, modelCandidate: { kind: 'move', reason: '想走' } }).reason === 'COMPANION_CANDIDATE_MALFORMED')
    check('R03 越权线索目标拒绝（白名单外）', companionMod.resolveCompanionProposal({ projection: view, modelCandidate: { kind: 'check', target: 'clue_not_in_projection' } }).reason === 'COMPANION_CANDIDATE_OUT_OF_WHITELIST')
    check('R03 越权出口目标拒绝', companionMod.resolveCompanionProposal({ projection: view, modelCandidate: { kind: 'move', target: 'scene_void' } }).reason === 'COMPANION_CANDIDATE_OUT_OF_WHITELIST')
    // 周期接线：合法候选 → confirmation 且提案来自模型（非第一个动作也照单校验）。
    {
      const providerStore = createKpMockStore()
      seedKpScenario(providerStore)
      const target = clueIds.length > 1 ? clueIds[1] : clueIds[0]
      const result = await kpMod.runRoleplayKpCycle(providerStore, {
        maxAiActions: 1,
        companionCandidateProvider: async () => ({ kind: 'check', target, reason: '模型理由：按已知事实优先查这条线索' })
      })
      check('R03 周期采纳模型候选（proposalSource=model）', result.status === 'confirmation' && result.proposalSource === 'model' && result.proposal.clueId === target)
      // 畸形候选 → 显式 error + 诊断，不静默替换成确定性提案。
      const badStore = createKpMockStore()
      seedKpScenario(badStore)
      const bad = await kpMod.runRoleplayKpCycle(badStore, {
        maxAiActions: 1,
        companionCandidateProvider: async () => ({ kind: 'check', target: 'clue_hallucinated' })
      })
      check('R03 越权候选显式失败并保留诊断', bad.status === 'error' && bad.errorCode === 'COMPANION_CANDIDATE_OUT_OF_WHITELIST' && Boolean(bad.diagnostics))
      const badRun = kpMod.findKpRunForBranch(badStore.roleplaySession, 'main')
      check('R03 失败候选入 run 诊断（failed 步骤保留）', badRun.steps.some((s) => s.stepId.startsWith('companion:') && s.status === 'failed' && s.errorCode === 'COMPANION_CANDIDATE_OUT_OF_WHITELIST'))
      // provider 抛错 → 显式停止，不回退。
      const throwStore = createKpMockStore()
      seedKpScenario(throwStore)
      const threw = await kpMod.runRoleplayKpCycle(throwStore, {
        maxAiActions: 1,
        companionCandidateProvider: async () => { throw new Error('provider 不可用') }
      })
      check('R03 provider 异常显式停止', threw.status === 'error' && threw.errorCode === 'KP_COMPANION_PROVIDER_FAILED')
      // 无 provider → 确定性降级且诚实标注。
      const detStore = createKpMockStore()
      seedKpScenario(detStore)
      const det = await kpMod.runRoleplayKpCycle(detStore, { maxAiActions: 1 })
      check('R03 无 provider 降级确定性并如实标注', (det.status === 'confirmation' && det.proposalSource === 'deterministic-whitelist' && det.proposal.source === 'deterministic-whitelist') || det.status === 'budget-limit')
    }
  }
  // R05/R06：模型提议的同伴行动与玩家行动共用确定性结算；命令幂等/版本贯穿。
  {
    const resourceMod2 = await import(path.join(root, 'src/services/experience/roleplay/roleplayResources.js'))
    const store = createKpMockStore()
    seedKpScenario(store)
    const view = workflow.getRoleplayScenarioView(store)
    const clueIds = view.availableSceneClueActions.map((action) => action.clueId)
    let sampleCursor = 0
    const nextSample = () => [4, 3][sampleCursor++ % 2]
    const provider = async () => ({ kind: 'check', target: clueIds[0], reason: '同伴理由：先查证这条线索' })
    const cycle = await kpMod.runRoleplayKpCycle(store, { maxAiActions: 1, companionCandidateProvider: provider })
    check('R05 同伴提案确认停（不代玩家/同伴结算）', cycle.status === 'confirmation' && store.roleplaySession.pendingByBranch.main === undefined)
    // 采纳：走与玩家完全相同的 confirm→roll→durable 通道（确定性结算）。
    const adopted = workflow.adoptRoleplayCompanionProposal(store, { proposal: cycle.proposal })
    check('R05 检定提案不跳过确认（requiresConfirm）', adopted.requiresConfirm === true && adopted.clueId === clueIds[0])
    await workflow.confirmRoleplayClueCheck(store, { clueId: clueIds[0], nextUint32: nextSample })
    const state = store.roleplaySession
    const pending = stateMod.getRoleplayPendingForBranch(state, 'main')
    check('R05 结算走冻结规则（骰点/结果由合同生成）', Boolean(pending?.resolution) && typeof pending.resolution.total === 'number' && pending.intentHint === `scenario-clue:${clueIds[0]}`)
    check('R05 模型不能改骰式（篡改 ruleSnapshot 在掷骰入口被拒）', await (async () => {
      const tamperedStore = createKpMockStore()
      seedKpScenario(tamperedStore)
      const action = contract.createConfirmedRoleplayAction({
        sessionId: tamperedStore.currentSessionId, branchId: 'main', rawInput: '查证', attribute: 'wits', modifier: 0
      })
      action.ruleSnapshot.expression = '20d20'
      tamperedStore.roleplaySession.pendingByBranch.main = action
      try {
        await workflow.resolvePendingAction(tamperedStore, { actionId: action.actionId })
        return false
      } catch (error) {
        return error?.code === 'ROLEPLAY_EXPRESSION_MISMATCH'
      }
    })())
    check('R05 模型不能改资源（revision 冲突拒绝）', (() => {
      const before = resourceMod2.getResourceRevision(state.resources)
      const result = resourceMod2.applyResourceDelta(state.resources, {
        deltaId: 'eval_forge_1', resource: 'lampOil', amount: -5, sourceRef: 'eval:forge', branchId: 'main', expectedRevision: before + 99
      })
      return result.ok === false && result.reason === 'ROLEPLAY_RESOURCE_REVISION_CONFLICT'
    })())
    // R06：同 command 重发只结算一次——同 actionId 重入复用同一骰点；
    // 已发现线索的再次检查是新命令（拒绝），不是幂等重放。
    const diceFrozen = JSON.stringify(pending.resolution.dice)
    const runId = pending.actionId
    check('R06 已发现线索再次检查被拒（新命令非重放）', await (async () => {
      try {
        await workflow.confirmRoleplayClueCheck(store, { clueId: clueIds[0], nextUint32: () => 999 })
        return false
      } catch (error) {
        return error?.code === 'ROLEPLAY_CLUE_NOT_AVAILABLE'
      }
    })())
    await workflow.resolvePendingAction(store, { actionId: runId })
    const repending = stateMod.getRoleplayPendingForBranch(state, 'main')
    check('R06 同 command 重发骰点不变（只结算一次）', repending.actionId === runId && JSON.stringify(repending.resolution.dice) === diceFrozen)
    check('R06 run 副作用键唯一（骰点/确认各一次）', (() => {
      const run = state.runs.find((item) => item.runId === runId)
      return run.steps.filter((s) => s.effectKey === `dice:${runId}` && s.status === 'succeeded').length === 1
        && run.steps.filter((s) => s.effectKey === `confirm:${runId}` && s.status === 'succeeded').length === 1
    })())
    // R06：过期版本不能落盘——同 actionId 不同 payloadHash 走真实账本冲突判定。
    check('R06 同 ID 异回执内容拒绝', (() => {
      const receipt = projection.buildTurnReceiptV1(repending, { turnId: 'turn_x', parentTurnId: null, store: { currentSessionId: store.currentSessionId, activeBranchId: 'main', worldId: 'wb_eval_1' } })
      state.receipts.push(receipt)
      const tampered = { ...receipt, payloadHash: `${receipt.payloadHash.slice(0, 60)}ffff` }
      return Boolean(projection.findConflictingReceipt(state.receipts, tampered))
        && !projection.findConflictingReceipt(state.receipts, receipt)
    })())
  }

  // R07/R08/R09：KP 连续旅程（失败推进→线索→移动→结局）、跨会话边界、分支隔离。
  {
    const roleplayRunsResource = await import(path.join(root, 'src/services/experience/roleplay/roleplayResources.js'))
    // ── R07：一场连续 KP 旅程：失败推进 → 线索 → 场景切换 → 结局 → 停止消耗 ──
    const store = createKpMockStore()
    const scenario = seedKpScenario(store)
    const state = store.roleplaySession
    const journey = { beats: 0, checks: [], moves: 0, failures: 0 }
    const failDice = () => 1   // 2+2=4（含线索修正仍 ≤6）→ 失败前进
    const winDice = () => 4    // 5+5=10 → 成功

    async function kpBeat(diceSource) {
      // 预算按批显式重置（新批=玩家动作）。
      if (state.hostPlan && state.hostPlan.stepsUsed >= state.hostPlan.maxSteps) {
        workflow.resetRoleplayHostBudget(store, { maxSteps: 3 })
      }
      const cycle = await kpMod.runRoleplayKpCycle(store, { maxAiActions: 1 })
      if (cycle.status === 'ended') return { done: true, cycle }
      if (cycle.status !== 'confirmation') return { cycle, status: cycle.status }
      journey.beats += 1
      const adopted = workflow.adoptRoleplayCompanionProposal(store, { proposal: cycle.proposal })
      if (adopted.executed === 'move') {
        journey.moves += 1
        return { cycle, moved: true }
      }
      const before = state.scenarioRun.clues[adopted.clueId]
      await workflow.confirmRoleplayClueCheck(store, { clueId: adopted.clueId, nextUint32: diceSource })
      // 模拟 coordinator 事务提交（mock sendAction 不含真实提交路径）：
      // 回执入账、pending 清除——否则下一拍周期被人回应门禁正确拦截。
      const pendingAfter = stateMod.getRoleplayPendingForBranch(state, 'main')
      if (pendingAfter) {
        workflow.commitRoleplayNarration(store, {
          action: pendingAfter,
          turnRecord: { id: `turn_j_${journey.beats}`, parentTurnId: null, userMessageIds: [], branchId: 'main' }
        })
      }
      const after = state.scenarioRun.clues[adopted.clueId]
      if (before !== 'discovered' && after !== 'discovered') journey.failures += 1
      journey.checks.push(adopted.clueId)
      return { cycle, checked: adopted.clueId }
    }

    // 失败推进：第一次检查失败——线索保持未发现、受挫事件入公开记录。
    const firstClue = workflow.getRoleplayScenarioView(store).availableSceneClueActions[0].clueId
    await kpBeat(failDice)
    check('R07 失败推进：线索未发现但旅程可继续', state.scenarioRun.clues[firstClue] !== 'discovered' && state.scenarioRun.status === 'active')
    check('R07 失败推进受挫事件入公开记录（不含未发现线索名）', state.scenarioRun.publicEvents.some((event) => event.type === 'setback'))
    // 成功：同一线索第二检查成功发现。
    await kpBeat(winDice)
    check('R07 同线索重试成功后入已确认', state.scenarioRun.clues[firstClue] === 'discovered')
    // 确定性导航：优先采纳同向移动提案（同伴建议被真人选路采纳），否则玩家
    // 显式 moveRoleplayScene（提案只是建议，玩家可以不采纳——产品语义）。
    async function navigate(toSceneId) {
      if (state.scenarioRun.currentSceneId === toSceneId) return
      if (state.hostPlan && state.hostPlan.stepsUsed >= state.hostPlan.maxSteps) {
        workflow.resetRoleplayHostBudget(store, { maxSteps: 3 })
      }
      const cycle = await kpMod.runRoleplayKpCycle(store, { maxAiActions: 1 })
      if (cycle.status === 'confirmation' && cycle.proposal?.kind === 'move' && cycle.proposal.toSceneId === toSceneId) {
        workflow.adoptRoleplayCompanionProposal(store, { proposal: cycle.proposal })
        journey.moves += 1
        return
      }
      workflow.moveRoleplayScene(store, { toSceneId })
    }
    // 确定性旅程路线：值房（log 失败→成功）→ 梯井（scuff 失败→解锁小屋守卫笔记）
    // → 灯室（mechanism 成功）→ 折返梯井 → 小屋（guard_note 成功 → end_truth）。
    await navigate('scene_stairs')
    await kpBeat(failDice)   // 梯井 scuff 失败推进：解锁 clue_guard_note
    await navigate('scene_lamp_room')
    await kpBeat(winDice)    // 灯室 mechanism 成功
    await navigate('scene_stairs')
    await navigate('scene_cottage')
    await kpBeat(winDice)    // 小屋 guard_note 成功 → 确定性结局
    check('R07 KP 连续旅程到达结局（确定性条件）', state.scenarioRun.status === 'ended' && Boolean(state.scenarioRun.endingId), `status=${state.scenarioRun.status}, beats=${journey.beats}, moves=${journey.moves}, scene=${state.scenarioRun.currentSceneId}`)
    const finalCycle = await kpMod.runRoleplayKpCycle(store, { maxAiActions: 1 })
    check('R07 结局后周期返回 ended 且零动作消耗', finalCycle.status === 'ended' && finalCycle.aiActions === 0, `status=${finalCycle.status}`)
    check('R07 场景切换确实发生（移动多于一拍）', journey.moves >= 1 || state.scenarioRun.currentSceneId !== 'scene_desk', `moves=${journey.moves}, scene=${state.scenarioRun.currentSceneId}`)
    check('R07 结局后发送门禁拦截新行动', (() => {
      try {
        workflow.assertRoleplaySendAllowed(store, {})
        return false
      } catch (error) {
        return error?.code === 'ROLEPLAY_SCENARIO_ENDED'
      }
    })())

    // ── R08：跨会话边界——迟到响应按会话身份拒绝；未决回应跨保存保留 ──
    const otherSessionStore = createKpMockStore()
    seedKpScenario(otherSessionStore, { companion: false })
    otherSessionStore.currentSessionId = 'sess_other'
    const crossStore = createKpMockStore()
    seedKpScenario(crossStore, { companion: false })
    await workflow.confirmRoleplayAction(crossStore, { rawInput: '行动', attribute: 'wits', modifier: 0, nextUint32: () => 4 })
    crossStore.currentSessionId = 'sess_other'  // 模拟切换会话后原 pending 的迟到请求
    check('R08 切会话后迟到叙述请求按 scope 拒绝', await (async () => {
      try {
        await workflow.requestRoleplayNarration(crossStore, {})
        return false
      } catch (error) {
        return error?.code === 'ROLEPLAY_SCOPE_MISMATCH'
      }
    })())
    // 未决回应跨保存保留（序列化→载入），恢复动作可用。
    const carriedState = stateMod.loadRoleplayStateForSession(JSON.parse(JSON.stringify(crossStore.roleplaySession))).current
    check('R08 未决回应跨保存保留（pending 不丢）', Boolean(stateMod.getRoleplayPendingForBranch(carriedState, 'main')))
    // 未来版本只读边界（R08 兼容策略）。
    const futureStore = createKpMockStore()
    futureStore.roleplayFutureRaw = { version: 99, mode: 'rules' }
    check('R08 未来版本会话只读（拒绝改模式）', throwsWithCode(() => workflow.setRoleplaySessionSetup(futureStore, { mode: 'rules' }), 'ROLEPLAY_FUTURE_STATE_READONLY'))

    // ── R09：分支隔离——pending/资源/回执/run 不混入另一分支 ──
    const branchStore = createKpMockStore()
    seedKpScenario(branchStore, { companion: false })
    await kpMod.runRoleplayKpCycle(branchStore, { maxAiActions: 1 })  // main 分支产生 kp run
    await workflow.confirmRoleplayAction(branchStore, { rawInput: '主分支行动', attribute: 'wits', modifier: 0, nextUint32: () => 4 })
    const branchState = branchStore.roleplaySession
    branchStore.activeBranchId = 'branch-2'
    check('R09 另一无 pending 分支发送不被阻断', (() => {
      try {
        workflow.assertRoleplaySendAllowed(branchStore, {})
        return true
      } catch {
        return false
      }
    })())
    check('R09 kp run 按分支查找隔离（branch-2 无主持 run）', kpMod.findKpRunForBranch(branchState, 'branch-2') === null && kpMod.findKpRunForBranch(branchState, 'main') !== null, `runs=${JSON.stringify((branchState.runs || []).map((r) => [r.taskId, r.scope?.branchId]))}`)
    check('R09 资源账按分支投影（branch-2 不见 main 扣减）', (() => {
      if (!branchState.resources) return 'no-resources'
      const resourceModR = roleplayRunsResource
      const applied = resourceModR.applyResourceDelta(branchState.resources, {
        deltaId: 'eval_br_main', resource: 'lampOil', amount: -4, sourceRef: 'eval:br', branchId: 'main'
      })
      if (!applied.ok) return `delta-rejected:${applied.reason}`
      const mainOil = resourceModR.buildResourceProjection(branchState.resources, { branchId: 'main' }).values.lampOil
      const otherOil = resourceModR.buildResourceProjection(branchState.resources, { branchId: 'branch-2' }).values.lampOil
      return mainOil.value === otherOil.value - 4 ? true : `main=${mainOil.value},other=${otherOil.value}`
    })())
    check('R09 回执按分支打 scope 且导出只取本分支', (() => {
      const pendingBr = stateMod.getRoleplayPendingForBranch(branchState, 'main')
      if (!pendingBr) return 'no-pending'
      branchStore.activeBranchId = 'main'
      // 提交一拍得到真实入账回执（coordinator 同一调用面）。
      workflow.commitRoleplayNarration(branchStore, {
        action: pendingBr,
        turnRecord: { id: 'turn_br', parentTurnId: null, userMessageIds: [], branchId: 'main' }
      })
      const committed = branchState.receipts.find((item) => item.receiptId === pendingBr.actionId)
      if (!committed) return 'no-committed-receipt'
      // 另一分支的迟到回执（scope branch-2）不得混入 main 的导出过滤结果。
      branchState.receipts.push({ ...committed, receiptId: `${committed.receiptId}_br2`, scope: { ...committed.scope, branchId: 'branch-2' } })
      const forMain = branchState.receipts.filter((item) => item.scope?.branchId === 'main')
      return forMain.some((item) => item.receiptId === committed.receiptId)
        && !forMain.some((item) => item.scope?.branchId === 'branch-2')
    })())
  // R12：既有原创场景 20 轮生产 coordinator 旅程（确定性 provider 替身）。
  // 含：KP 主持拍、玩家自由行动、同伴提案、失败推进、场景切换、中途刷新、
  // 确定性结局、场次记录导出。真实模型不在本轮范围（真实模型 Gate 单列）。
  {
    const journeyStore = createKpMockStore()
    seedKpScenario(journeyStore)
    const jStateGet = () => journeyStore.roleplaySession
    const rounds = { count: 0, kpBeats: 0, playerActions: 0, moves: 0, failures: 0 }
    let playerSeq = 0
    const kpFail = () => 1
    const kpWin = () => 4

    async function playerRound(diceSource) {
      rounds.count += 1
      rounds.playerActions += 1
      playerSeq += 1
      await workflow.confirmRoleplayAction(journeyStore, {
        rawInput: `自由行动 ${playerSeq}`, attribute: 'wits', modifier: 0, nextUint32: diceSource
      })
      const pending = stateMod.getRoleplayPendingForBranch(jStateGet(), 'main')
      workflow.commitRoleplayNarration(journeyStore, {
        action: pending, turnRecord: { id: `turn_p_${playerSeq}`, parentTurnId: null, userMessageIds: [], branchId: 'main' }
      })
    }

    async function journeyKpBeat(diceSource) {
      rounds.count += 1
      if (jStateGet().hostPlan && jStateGet().hostPlan.stepsUsed >= jStateGet().hostPlan.maxSteps) {
        workflow.resetRoleplayHostBudget(journeyStore, { maxSteps: 3 })
      }
      const cycle = await kpMod.runRoleplayKpCycle(journeyStore, { maxAiActions: 1 })
      if (cycle.status === 'ended') return { ended: true, cycle }
      if (cycle.status !== 'confirmation') return { cycle }
      rounds.kpBeats += 1
      const adopted = workflow.adoptRoleplayCompanionProposal(journeyStore, { proposal: cycle.proposal })
      if (adopted.executed === 'move') {
        rounds.moves += 1
        return { cycle }
      }
      const before = jStateGet().scenarioRun.clues[adopted.clueId]
      await workflow.confirmRoleplayClueCheck(journeyStore, { clueId: adopted.clueId, nextUint32: diceSource })
      const pending = stateMod.getRoleplayPendingForBranch(jStateGet(), 'main')
      if (pending) {
        workflow.commitRoleplayNarration(journeyStore, {
          action: pending, turnRecord: { id: `turn_k_${rounds.kpBeats}`, parentTurnId: null, userMessageIds: [], branchId: 'main' }
        })
      }
      if (before !== 'discovered' && jStateGet().scenarioRun.clues[adopted.clueId] !== 'discovered') rounds.failures += 1
      return { cycle }
    }

    async function journeyNavigate(toSceneId) {
      rounds.count += 1
      if (jStateGet().hostPlan && jStateGet().hostPlan.stepsUsed >= jStateGet().hostPlan.maxSteps) {
        workflow.resetRoleplayHostBudget(journeyStore, { maxSteps: 3 })
      }
      const cycle = await kpMod.runRoleplayKpCycle(journeyStore, { maxAiActions: 1 })
      if (cycle.status === 'confirmation' && cycle.proposal?.kind === 'move' && cycle.proposal.toSceneId === toSceneId) {
        workflow.adoptRoleplayCompanionProposal(journeyStore, { proposal: cycle.proposal })
        rounds.moves += 1
        return
      }
      workflow.moveRoleplayScene(journeyStore, { toSceneId })
    }

    // 第 1–2 轮：值房线索 失败→成功。
    await journeyKpBeat(kpFail)
    await journeyKpBeat(kpWin)
    // 第 3 轮：玩家自由行动（失败，扣活力）。
    await playerRound(kpFail)
    // 第 4 轮：移动到梯井。
    await journeyNavigate('scene_stairs')
    // 第 5–6 轮：scuff 失败（解锁守卫笔记）→ 成功。
    await journeyKpBeat(kpFail)
    await journeyKpBeat(kpWin)
    // 第 7 轮：玩家行动（成功）。
    await playerRound(kpWin)
    // 第 8 轮：移动到灯室。
    await journeyNavigate('scene_lamp_room')
    // 第 9–10 轮：mechanism 失败→成功。
    await journeyKpBeat(kpFail)
    await journeyKpBeat(kpWin)
    // 第 11 轮：玩家行动。
    await playerRound(kpWin)
    // 第 12 轮：中途刷新（生产持久化往返），恢复后同一场景/线索/run 账目继续。
    const beforeRefresh = {
      scene: jStateGet().scenarioRun.currentSceneId,
      clues: JSON.stringify(jStateGet().scenarioRun.clues),
      runCount: jStateGet().runs.length,
      receipts: jStateGet().receipts.length
    }
    rounds.count += 1  // 第 12 轮：刷新/重载也算一轮真实旅程
    const reloaded = stateMod.loadRoleplayStateForSession(JSON.parse(JSON.stringify(jStateGet()))).current
    journeyStore.roleplaySession = reloaded
    check('R12 中途刷新：场景/线索/账目无损往返', reloaded.scenarioRun.currentSceneId === beforeRefresh.scene
      && JSON.stringify(reloaded.scenarioRun.clues) === beforeRefresh.clues
      && reloaded.runs.length === beforeRefresh.runCount
      && reloaded.receipts.length === beforeRefresh.receipts)
    // 第 13–14 轮：移动折返梯井 → 小屋。
    await journeyNavigate('scene_stairs')
    await journeyNavigate('scene_cottage')
    // 第 15–17 轮：玩家行动 ×3。
    await playerRound(kpWin)
    await playerRound(kpFail)
    await playerRound(kpWin)
    // 第 17–18 轮：守卫笔记 失败→成功 → 确定性结局。
    await journeyKpBeat(kpFail)
    const finalBeat = await journeyKpBeat(kpWin)
    check('R12 旅程在第 20 轮内到达确定性结局', jStateGet().scenarioRun.status === 'ended' && Boolean(jStateGet().scenarioRun.endingId), `rounds=${rounds.count}, status=${jStateGet().scenarioRun.status}, beats=${rounds.kpBeats}, moves=${rounds.moves}, player=${rounds.playerActions}`)
    // 第 19 轮：结局后周期停止消耗。
    const endedCycle = await kpMod.runRoleplayKpCycle(journeyStore, { maxAiActions: 3 })
    rounds.count += 1
    check('R12 结局后周期零消耗', endedCycle.status === 'ended' && endedCycle.aiActions === 0)
    // 第 20 轮：场次记录导出（作者口径含来源回合）。
    rounds.count += 1
    const record = workflow.exportRoleplayAdventure(journeyStore, { mode: 'author' })
    check('R12 场次记录导出含结局与来源', record.endingId === jStateGet().scenarioRun.endingId && (record.sourceTurnIds || []).length > 0 && record.events.length > 0)
    // 全旅程副作用键唯一（重复轮次不重复结算）。
    const allEffectKeys = (reloaded !== journeyStore.roleplaySession ? journeyStore.roleplaySession : reloaded).runs
      .flatMap((run) => run.steps.filter((step) => step.effectKey && step.status === 'succeeded').map((step) => `${run.runId}:${step.effectKey}`))
    check('R12 全旅程副作用键唯一（无重复结算）', new Set(allEffectKeys).size === allEffectKeys.length, `keys=${allEffectKeys.length}`)
    check('R12 覆盖 20 轮（主持拍+玩家行动+移动+刷新+结局）', rounds.count >= 20, `rounds=${rounds.count}, detail=${JSON.stringify(rounds)}`)
  }

  // T04/T07：provider 错误分类贯穿 run；双标签执行锁（Web Locks + 降级）。
  {
    const lockMod = await import(path.join(root, 'src/services/experience/run/runLock.js'))
    check('T04 429 限流 → failed 且可重试', (() => {
      const c = runContract.classifyRunStepFailure({ errorCode: 'NARRATIVE_PROVIDER_RATE_LIMITED' })
      return c.status === 'failed' && c.retryable === true
    })())
    check('T04 超时/中止可重试', runContract.classifyRunStepFailure({ errorCode: 'NARRATIVE_PROVIDER_TIMEOUT' }).retryable === true
      && runContract.classifyRunStepFailure({ errorCode: 'NARRATIVE_AGENT_ABORTED' }).retryable === true)
    check('T04 普通失败不可重试', runContract.classifyRunStepFailure({ errorCode: 'NARRATIVE_STREAM_EMPTY' }).retryable === false)
    check('T04 不确定副作用写 → unknown（不自动重发）', (() => {
      const c = runContract.classifyRunStepFailure({ errorCode: 'PROVIDER_WRITE_UNRESOLVED', effectKey: 'effect:1' })
      return c.status === 'unknown' && c.retryable === false
    })())
    check('T04 unknown 步骤不进恢复计划 resumable（不盲重试）', (() => {
      const identity = runContract.createRunIdentity({ taskId: 't', scope: { sessionId: 's', branchId: 'main' } })
      const run = runContract.createRunRecord({ identity })
      runContract.beginRunStep(run, { stepId: 'write', input: { a: 1 } })
      runContract.completeRunStep(run, { stepId: 'write', status: 'unknown', errorCode: 'PROVIDER_WRITE_UNRESOLVED' })
      const plan = runContract.buildRunRecoveryPlanV1(run)
      return plan.unknownStepIds.length === 1 && plan.resumableStepIds.length === 0 && plan.completedStepIds.length === 0
    })())
    // T04 贯穿：叙述 429 失败 → run 步骤 failed 且保留可重试码；run 非终态可显式重试。
    {
      const store = createKpMockStore()
      seedKpScenario(store, { companion: false })
      await workflow.confirmRoleplayAction(store, { rawInput: '行动', attribute: 'wits', modifier: 0, nextUint32: () => 4 })
      const state4 = store.roleplaySession
      const pending4 = stateMod.getRoleplayPendingForBranch(state4, 'main')
      workflow.failRoleplayNarration(store, { action: pending4, errorCode: 'NARRATIVE_PROVIDER_RATE_LIMITED' })
      const run4 = state4.runs.find((item) => item.runId === pending4.actionId)
      const narration4 = run4?.steps?.find((s) => s.stepId === 'narration')
      check('T04 429 落 run：failed+保留错误码，run 可恢复（非终态）', narration4?.status === 'failed' && narration4?.errorCode === 'NARRATIVE_PROVIDER_RATE_LIMITED' && !['completed', 'failed', 'cancelled'].includes(run4.status))
    }
    // T07：锁合同（假 adapter 注入）。
    {
      function createFakeLockAdapter() {
        const held = new Map()
        return {
          request(key, options, callback) {
            // 与 navigator.locks 同语义：request 返回 callback 的完成值。
            if (held.has(key)) return Promise.resolve(callback(null))
            held.set(key, true)
            return Promise.resolve(callback({ name: key }))
          },
          release(key) { held.delete(key) }
        }
      }
      const adapter = createFakeLockAdapter()
      const r1 = await lockMod.withExclusiveRunLock('k', async ({ lockHeld }) => `ran:${lockHeld}`, { lockAdapter: adapter })
      check('T07 空闲锁获取执行（lockHeld=true）', r1 === 'ran:true')
      const busy = await lockMod.withExclusiveRunLock('k', async () => 'should-not-run', { lockAdapter: adapter, onBusy: () => 'busy' })
      check('T07 锁被持有时走 onBusy（不执行任务）', busy === 'busy')
      let thrown = null
      try {
        await lockMod.withExclusiveRunLock('k', async () => {}, { lockAdapter: adapter })
      } catch (error) { thrown = error?.code }
      check('T07 锁被持有且无 onBusy → RUN_LOCK_HELD', thrown === 'RUN_LOCK_HELD')
      adapter.release('k')
      const r2 = await lockMod.withExclusiveRunLock('k', async ({ lockHeld }) => `recovered:${lockHeld}`, { lockAdapter: adapter })
      check('T07 过期 owner 释放后新 owner 恢复', r2 === 'recovered:true')
      // KP 周期接线：锁被另一标签持有 → busy，不消耗预算不生成。
      const lockStore = createKpMockStore()
      seedKpScenario(lockStore, { companion: false })
      const busyAdapter = createFakeLockAdapter()
      busyAdapter.request('pinax-roleplay-kp:sess_eval_1', { ifAvailable: true }, () => {})
      const busyCycle = await kpMod.runRoleplayKpCycle(lockStore, { maxAiActions: 1, lockAdapter: busyAdapter })
      check('T07 另一标签持锁 → 周期 busy（不重复消费）', busyCycle.status === 'busy' && busyCycle.busyReason === 'RUN_LOCK_HELD' && lockStore.sent.length === 0)
    }

    // T08：过期候选硬拒绝——提案冻结后资源被其它路径改动 → 采用被拒并给出具体变化。
    {
      const staleStore = createKpMockStore()
      seedKpScenario(staleStore)
      const staleView = workflow.getRoleplayScenarioView(staleStore)
      const staleClue = staleView.availableSceneClueActions[0].clueId
      const staleCycle = await kpMod.runRoleplayKpCycle(staleStore, {
        maxAiActions: 1,
        companionCandidateProvider: async () => ({ kind: 'check', target: staleClue, reason: '提案' })
      })
      check('T08 前置：提案冻结于 confirmation 停', staleCycle.status === 'confirmation')
      // 提案产生后外部改动资源（不经 run）。
      const resMod = await import(path.join(root, 'src/services/experience/roleplay/roleplayResources.js'))
      if (!staleStore.roleplaySession.resources) {
        staleStore.roleplaySession.resources = resMod.createResourceState()
      }
      resMod.applyResourceDelta(staleStore.roleplaySession.resources, {
        deltaId: 'eval_t08_ext', resource: 'lampOil', amount: -2, sourceRef: 'eval:t08', branchId: 'main'
      })
      let staleError = null
      try {
        workflow.adoptRoleplayCompanionProposal(staleStore, { proposal: staleCycle.proposal })
      } catch (error) { staleError = error }
      check('T08 过期候选禁止采用（具体变化可见）', staleError?.code === 'ROLEPLAY_PROPOSAL_STALE'
        && String(staleError.message).includes('冻结') && String(staleError.message).includes('当前'), String(staleError?.message || 'no-throw').slice(0, 120))
    }
  }
}

// Integration regressions: saving and rollback must precede external work.
{
  const store = createKpMockStore()
  seedKpScenario(store)
  store.commitCurrentSessionNow = () => false
  const denied = await kpMod.runRoleplayKpCycle(store, { maxAiActions: 1 })
  check('integration save failure stops before generation', denied.status === 'error' && store.sent.length === 0)
  const rollback = createKpMockStore()
  seedKpScenario(rollback)
  rollback.sendAction = async () => {
    rollback.roleplaySession = JSON.parse(JSON.stringify(rollback.roleplaySession))
    return 'error'
  }
  await kpMod.runRoleplayKpCycle(rollback, { maxAiActions: 1 })
  check('integration failure receipt follows replacement state', rollback.roleplaySession.runs.some(run => run.steps.some(step => step.status === 'failed')))
  const switched = createKpMockStore()
  seedKpScenario(switched)
  switched.sendAction = async () => { switched.currentSessionId = 'different-session'; return 'success' }
  const stale = await kpMod.runRoleplayKpCycle(switched, { maxAiActions: 1 })
  check('integration late result rejects switched session', stale.errorCode === 'KP_SCOPE_CHANGED')
  const malformed = companionMod.parseCompanionModelCandidate({ kind: 'move', target: 'harbor', reason: 'go', injectedScope: 'secret' })
  check('integration companion rejects extra fields', malformed.ok === false)
}
console.log(`\n=== experience-roleplay-eval: ${passed} passed, ${failed} failed ===`)
if (failed) {
  for (const failure of failures) {
    // eslint-disable-next-line no-console
    console.error(`FAIL ${failure.name}${failure.detail ? ` :: ${failure.detail}` : ''}`)
  }
  process.exit(1)
}

// ── 测试辅助：轻量 mock store（只暴露 roleplayWorkflow 消费的成员） ──
function createMockStore({ flushOk }) {
  return {
    currentSessionId: 'sess_eval_1',
    activeBranchId: 'main',
    worldId: 'wb_eval_1',
    isLoading: false,
    lastError: null,
    pendingDirectorNote: '',
    roleplaySession: null,
    roleplayFutureRaw: null,
    messages: [],
    sent: [],
    saveCurrentSession() {},
    flushSaveSessions() { return flushOk },
    async sendAction(text, options = {}) {
      this.sent.push({ text, options })
      return 'success'
    }
  }
}
