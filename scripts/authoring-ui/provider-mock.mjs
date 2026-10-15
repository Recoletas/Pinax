const PROVIDER_CONFIG_ID = 'authoring-journey-provider'

export const MOCK_INLINE_SUGGESTION = '海风把门缝里的灯焰压低。'
export const MOCK_BLOCK_INSTRUCTION = '守卫追向灯塔，在石阶看见异物，随后走进灯室'
export const MOCK_BLOCK_ORIGINAL_TEXT = [
  '守卫沿湿滑的石阶冲上去，急促的铃声却在半途截断了他的脚步。',
  '一枚银哨落在第三层石阶，他推开虚掩的铁门，灯室里空无一人，最后守卫停在灯塔门前。',
].join('')
export const MOCK_BLOCK_EDITED_TEXT = [
  '守卫没有立刻冲上灯塔。他先拾起被潮水推回来的铜钥匙，再沿石阶逐级检查湿漉漉的脚印。',
  '铜钥匙滑到第二层石阶，他推开虚掩的铁门，确认灯室里空无一人，最后守卫停在灯塔门前。',
].join('')

// 推演单步确定性 fixture（taskType `authoring.rehearsal.step`）。形状对齐
// shared/capabilityToolContracts.js 的 REHEARSAL_STEP_SCHEMA submit 契约：
// response/change 非空有界、choices 1-3 条、evidenceRefs 授权内、consequences 上限 2。
// 宿主侧还有两道闸（shared/authoringRehearsalConsequenceContract.js 的
// parseRehearsalResponse 与 authoringRehearsal.js 的逐字复述守卫——同一路内
// 新回应与既有步骤共享 ≥32 字连续原文即拒绝），因此每幕 response 正文两两
// 互不重叠，按调用序号轮换，任一 4 步路径内的连续回应必然不同文。
const MOCK_REHEARSAL_STEP_BODIES = Object.freeze([
  '守卫没有点破暗格前的手印，只把灯笼举高了一寸，让光替他问出第一个问题。',
  '潮水退到第三级石阶时，守卫终于开口：昨夜灯室的门闩是从里面取下的。',
  '守卫把哨子按在掌心，决定先绕灯塔一圈，看看有没有第三个人的脚印。',
  '石阶尽头的灯室虚掩着，守卫数了三下心跳，把门推到只容一人侧身的宽度。',
  '守卫回头望了一眼来路，雾把码头吞得只剩轮廓，他头一次觉得自己是孤身查案。',
  '守卫蹲下身，用指尖量了量石阶上的水渍，宽度与昨夜他在档口见过的那双靴印一致。',
])

/**
 * Build a deterministic, parse-gate-valid `authoring.rehearsal.step` reply.
 * callIndex rotates the response body so consecutive steps on one path never
 * repeat a ≥32-char passage (rehearsal verbatim-repeat guard).
 */
export function makeRehearsalStepFixture(callIndex = 0) {
  const index = Math.max(0, Number(callIndex) || 0)
  return {
    response: MOCK_REHEARSAL_STEP_BODIES[index % MOCK_REHEARSAL_STEP_BODIES.length],
    change: '守卫把怀疑往前推了一步，但还没有到能落笔的程度。',
    choices: ['让守卫敲响灯室的门', '先退回石阶观察'],
    evidenceRefs: [],
    consequences: [],
  }
}

const MOCK_BEAT_PLAN = Object.freeze({
  intent: 'respond',
  mode: 'action',
  responseObligation: '让守卫追向灯塔并发现现场发生了变化',
  causalSteps: ['守卫追上石阶', '异常物件迫使他停下核对', '灯室无人改变了他的判断'],
  characterMoves: [{
    character: '守卫',
    intent: '追查灯塔异动',
    action: '冲上石阶并推开铁门',
    result: '确认灯室已经无人',
  }],
  functionalDetails: [{ detail: '湿滑石阶', affects: '限制守卫的速度' }],
  revealOrChange: '灯室已经无人，追查目标转为现场留下的物件',
  endCondition: '最后守卫停在灯塔门前',
  avoidRepeats: ['重复解释写作指令'],
})

function safeJsonRequest(request) {
  try {
    return request.postDataJSON() || {}
  } catch {
    return null
  }
}

function streamBody(requestId, events) {
  const at = Date.now()
  return events.map((event, index) => {
    const normalized = {
      schemaVersion: 1,
      requestId,
      seq: index + 1,
      at: at + index,
      ...event,
    }
    return `event: ${normalized.type}\ndata: ${JSON.stringify(normalized)}\n\n`
  }).join('')
}

function planningStream(requestId) {
  return streamBody(requestId, [
    { type: 'step.start', stepIndex: 0, toolChoice: 'required' },
    {
      type: 'tool.input.delta',
      callId: 'journey-beat-plan-1',
      toolName: 'submit_narrative_beat_plan',
      input: MOCK_BEAT_PLAN,
    },
    {
      type: 'tool.call',
      callId: 'journey-beat-plan-1',
      toolName: 'submit_narrative_beat_plan',
      action: 'submit',
    },
    { type: 'usage', usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 } },
    {
      type: 'step.finish',
      stepIndex: 0,
      status: 'tool_calls',
      terminalMode: 'tool-call',
      toolRounds: 1,
      totalCalls: 1,
      finishReason: 'tool_calls',
    },
  ])
}

function proseStream(requestId, prose) {
  return streamBody(requestId, [
    { type: 'step.start', stepIndex: 0, toolChoice: 'auto' },
    { type: 'text.delta', content: prose },
    { type: 'usage', usage: { inputTokens: 220, outputTokens: 90, totalTokens: 310 } },
    {
      type: 'step.finish',
      stepIndex: 0,
      status: 'final_ready',
      terminalMode: 'provider-text',
      toolRounds: 0,
      totalCalls: 0,
      finishReason: 'stop',
    },
  ])
}

function criticStream(requestId) {
  const verdict = JSON.stringify({
    schemaVersion: 1,
    pass: true,
    scores: { voiceConsistency: null, grounding: null, continuity: 4, readability: 4 },
    flags: [],
    reason: '确定性旅程只验证可编辑草稿事务',
  })
  return proseStream(requestId, verdict)
}

function summarizeRequests(requests) {
  const advisorTaskTypes = requests
    .filter((request) => request.kind === 'advisor')
    .map((request) => request.taskType)
  const narrativePhases = requests
    .filter((request) => request.kind === 'narrative')
    .map((request) => request.phase)
  return {
    advisorCount: advisorTaskTypes.length,
    advisorTaskTypes,
    narrativeCount: narrativePhases.length,
    narrativePhases,
    composerInstructionSeen: requests.some((request) => (
      request.kind === 'narrative'
      && ['plan', 'prose'].includes(request.phase)
      && request.instructionSeen
    )),
    selectedDirectionSeen: requests.some((request) => request.kind === 'narrative' && request.selectedDirectionSeen),
    excludedDirectionSeen: requests.some((request) => request.kind === 'narrative' && request.excludedDirectionSeen),
  }
}

/**
 * Install a browser-only provider fixture and same-origin route mocks.
 * Nothing reaches a real provider or the local Express server.
 */
export async function installDeterministicProviderMock(page, {
  passiveInline = true,
  inlineSuggestion = MOCK_INLINE_SUGGESTION,
  blockText = MOCK_BLOCK_ORIGINAL_TEXT,
  expectedComposerInstruction = '',
  narrativeDelayMs = {},
  narrativeFailures = {},
  sceneDirections = null,
  expectedSelectedDirection = '',
  excludedDirectionTexts = [],
  primaryRequestPrefixes = ['authoring:'],
  // `authoring.rehearsal.step` 确定性响应：缺省用内置逐幕轮换 fixture；传 null
  // 恢复旧的严格 501 行为；传对象则每步返回同一份（仅适合单步旅程）。
  rehearsalStep = makeRehearsalStepFixture,
} = {}) {
  const requests = []
  await page.addInitScript(({ configId, passive }) => {
    localStorage.setItem('text_model_configs', JSON.stringify([{
      id: configId,
      name: 'Authoring journey deterministic provider',
      providerId: 'openai',
      baseUrl: 'https://authoring-journey.invalid/v1',
      apiKey: 'authoring-journey-test-key',
      model: 'authoring-journey-model',
    }]))
    localStorage.setItem('text_model_selected', configId)
    localStorage.setItem('pinax_agent_runtime_policy_v1', JSON.stringify({
      enabled: true,
      passiveHints: { 'writing-inline': passive },
      minIntervalsMs: { 'writing-inline': 0 },
    }))
  }, { configId: PROVIDER_CONFIG_ID, passive: Boolean(passiveInline) })

  await page.route('**/api/advisor/task', async (route) => {
    const payload = safeJsonRequest(route.request())
    if (!payload) {
      requests.push({ kind: 'advisor', taskType: '[malformed]' })
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'deterministic journey received malformed advisor request' }),
      })
      return
    }
    const taskType = String(payload.taskType || '')
    requests.push({ kind: 'advisor', taskType })
    if (taskType === 'authoring.rehearsal.step' && rehearsalStep) {
      const reply = typeof rehearsalStep === 'function'
        ? rehearsalStep(requests.filter((request) => request.taskType === 'authoring.rehearsal.step').length - 1, payload)
        : rehearsalStep
      const advice = JSON.stringify(reply)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          taskType,
          advice,
          result: { task: taskType, mode: 'direct', summary: advice, rehearsal: reply },
          meta: { fixture: 'authoring-journey' },
        }),
      })
      return
    }
    if (taskType === 'authoring.scene.directions' && sceneDirections) {
      const pressureBlock = payload.envelope?.blocks?.find((block) => block.kind === 'scene')
      let pressure = {}
      try { pressure = JSON.parse(pressureBlock?.content || '{}') } catch { pressure = {} }
      const value = typeof sceneDirections === 'function'
        ? sceneDirections({ payload, pressure })
        : sceneDirections
      const advice = JSON.stringify(value)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          taskType,
          advice,
          result: { task: taskType, mode: 'review', summary: advice },
          meta: { fixture: 'authoring-journey' },
        }),
      })
      return
    }
    if (taskType !== 'authoring.complete.inline') {
      await route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: JSON.stringify({ error: `deterministic journey does not mock advisor task ${taskType || '[empty]'}` }),
      })
      return
    }
    const advice = inlineSuggestion
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        taskType,
        advice,
        result: {
          task: taskType,
          mode: 'direct',
          summary: advice,
          text: advice,
        },
        meta: { fixture: 'authoring-journey' },
      }),
    })
  })

  await page.route('**/api/generate/agent-step/stream', async (route) => {
    const payload = safeJsonRequest(route.request())
    if (!payload) {
      requests.push({ kind: 'narrative', phase: 'malformed' })
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'deterministic journey received malformed narrative request' }),
      })
      return
    }
    const requestId = String(payload.requestId || 'authoring-journey-request').slice(0, 120)
    const toolNames = Array.isArray(payload.tools)
      ? payload.tools.map((tool) => String(tool?.name || ''))
      : []
    const primaryRequest = primaryRequestPrefixes.some(prefix => requestId.startsWith(prefix))
    let phase = 'unknown'
    if (requestId.startsWith('critic-')) phase = 'critic'
    else if (primaryRequest && toolNames.length === 1 && toolNames[0] === 'submit_narrative_beat_plan') phase = 'plan'
    else if (primaryRequest && !toolNames.includes('submit_narrative_beat_plan')) phase = 'prose'
    const serializedMessages = JSON.stringify(Array.isArray(payload.messages) ? payload.messages : [])
    requests.push({
      kind: 'narrative',
      phase,
      instructionSeen: Boolean(expectedComposerInstruction && serializedMessages.includes(expectedComposerInstruction)),
      selectedDirectionSeen: Boolean(expectedSelectedDirection && serializedMessages.includes(expectedSelectedDirection)),
      excludedDirectionSeen: (excludedDirectionTexts || []).some((value) => serializedMessages.includes(String(value))),
    })
    if (phase === 'unknown') {
      await route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: JSON.stringify({ error: `deterministic journey does not mock narrative request ${requestId}` }),
      })
      return
    }
    const delayMs = Math.max(0, Number(narrativeDelayMs?.[phase] || 0))
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
    const failure = narrativeFailures?.[phase]
    if (failure) {
      const status = Math.max(400, Math.min(599, Number(failure.status || 503)))
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          error: String(failure.message || `deterministic ${phase} failure`),
          code: String(failure.code || 'DETERMINISTIC_PROVIDER_FAILURE'),
          retryable: failure.retryable !== false,
        }),
      })
      return
    }
    const body = phase === 'plan'
      ? planningStream(requestId)
      : phase === 'critic' ? criticStream(requestId) : proseStream(requestId, blockText)
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
      },
      body,
    })
  })

  return Object.freeze({
    async setPassiveInline(enabled) {
      await page.evaluate((nextEnabled) => {
        const key = 'pinax_agent_runtime_policy_v1'
        let policy = {}
        try { policy = JSON.parse(localStorage.getItem(key) || '{}') } catch { policy = {} }
        policy.enabled = true
        policy.passiveHints = { ...(policy.passiveHints || {}), 'writing-inline': Boolean(nextEnabled) }
        policy.minIntervalsMs = { ...(policy.minIntervalsMs || {}), 'writing-inline': 0 }
        localStorage.setItem(key, JSON.stringify(policy))
      }, Boolean(enabled))
    },
    count({ kind, taskType, phase, instructionSeen, selectedDirectionSeen, excludedDirectionSeen } = {}) {
      return requests.filter((request) => (
        (!kind || request.kind === kind)
        && (!taskType || request.taskType === taskType)
        && (!phase || request.phase === phase)
        && (instructionSeen === undefined || request.instructionSeen === instructionSeen)
        && (selectedDirectionSeen === undefined || request.selectedDirectionSeen === selectedDirectionSeen)
        && (excludedDirectionSeen === undefined || request.excludedDirectionSeen === excludedDirectionSeen)
      )).length
    },
    summary() {
      return summarizeRequests(requests)
    },
  })
}
