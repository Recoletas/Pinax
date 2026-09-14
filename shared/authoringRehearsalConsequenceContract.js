// 试演后果共享合同：knowledge（知情）与 commitment（承诺）两类结构化后果的
// 归一化、校验与路由状态投影。服务端 buildAdvisorResult 与客户端 parse 使用
// 同一份实现；纯函数、无 IO、无存储。所有后果权威为 simulated，生命周期与
// 当前试演会话相同，不写入正式 runtime event、角色卡或世界书。

export const AUTHORING_REHEARSAL_CONSEQUENCE_VERSION = 1

// 结果三重上限（与模型 max_tokens 各自独立，不互相替代）：单次输出字符上限
// 与整份结果 JSON 序列化上限共用此值；超限即拒绝，不静默截断。
export const REHEARSAL_MAX_OUTPUT_CHARS = 2400

export const REHEARSAL_CONSEQUENCE_LIMITS = Object.freeze({
  maxPerStep: 2,
  contentMaxChars: 80,
  conditionMaxChars: 80,
  quoteMaxChars: 120,
  factTextMaxChars: 120,
  serializedMaxChars: REHEARSAL_MAX_OUTPUT_CHARS,
  maxEvidenceRefs: 4
})

export const REHEARSAL_CONSEQUENCE_STATES = Object.freeze({
  knowledge: Object.freeze(['learned']),
  commitment: Object.freeze(['promised', 'conditioned', 'refused', 'withdrawn'])
})

function text(value) {
  return String(value ?? '').trim()
}

function bounded(value, max) {
  const value_ = text(value)
  return value_ && value_.length <= max ? value_ : ''
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

export function consequenceFingerprint(prefix, value) {
  const source = JSON.stringify(stableValue(value))
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

function failure(issues) {
  return { ok: false, version: AUTHORING_REHEARSAL_CONSEQUENCE_VERSION, consequences: [], issues }
}

function pushIssue(issues, code, detail = '') {
  issues.push(detail ? `${code}：${detail}` : code)
}

// 作者在推演起点明确冻结的本次条件：一条事实、已知者、作者明确不知情者。
// factKey 由应用从声明文本确定性生成；整包标为本次假设（assumption），
// 不伪造正式世界书 evidenceRef。未指定知情状态的人物保持 unrecorded。
export function freezeRehearsalConditions(input = {}, { allowedRefs = null } = {}) {
  const issues = []
  const facts = (Array.isArray(input.facts) ? input.facts : []).map((fact) => {
    const statement = bounded(fact?.text, REHEARSAL_CONSEQUENCE_LIMITS.factTextMaxChars)
    if (!statement) {
      pushIssue(issues, 'fact-text-required')
      return null
    }
    const knowerRefs = uniqueRefs(fact?.knowerRefs)
    const unawareRefs = uniqueRefs(fact?.unawareRefs).filter((ref) => !knowerRefs.includes(ref))
    return {
      factKey: consequenceFingerprint('fact', statement),
      text: statement,
      knowerRefs,
      unawareRefs,
      kind: 'assumption',
      source: 'author-declared'
    }
  }).filter(Boolean)
  // 本场已明确的稳定物品：作者在起点声明名称与初始持有者；itemKey 由应用
  // 生成，模型只能引用。未声明持有者的物品保持无主，不凭空归属。
  const items = (Array.isArray(input.items) ? input.items : []).map((item) => {
    const name = bounded(item?.name, REHEARSAL_CONSEQUENCE_LIMITS.contentMaxChars)
    if (!name) {
      pushIssue(issues, 'item-name-required')
      return null
    }
    const holderRef = text(item?.holderRef)
    if (holderRef && allowedRefs && !allowedRefs.includes(holderRef)) {
      pushIssue(issues, `物品初始持有者不在本场授权名单：${holderRef}`)
      return null
    }
    return {
      itemKey: consequenceFingerprint('item', name),
      name,
      holderRef,
      kind: 'assumption',
      source: 'author-declared'
    }
  }).filter(Boolean)
  const commitments = (Array.isArray(input.commitments) ? input.commitments : []).map((item) => {
    const content = bounded(item?.content, REHEARSAL_CONSEQUENCE_LIMITS.contentMaxChars)
    const promisorRef = text(item?.promisorRef)
    if (!content || !promisorRef) {
      pushIssue(issues, 'baseline-commitment-incomplete')
      return null
    }
    const condition = bounded(item?.condition, REHEARSAL_CONSEQUENCE_LIMITS.conditionMaxChars)
    const state = REHEARSAL_CONSEQUENCE_STATES.commitment.includes(text(item?.state))
      ? text(item.state) : 'promised'
    const beneficiaryRef = text(item?.beneficiaryRef)
    return {
      commitmentKey: consequenceFingerprint('commitment', { issue: 'baseline', promisorRef, content, condition }),
      issueKey: consequenceFingerprint('issue', `baseline:${content}`),
      promisorRef,
      beneficiaryRef: beneficiaryRef || '',
      content,
      condition,
      state,
      kind: 'assumption',
      source: 'author-declared'
    }
  }).filter(Boolean)
  const baseline = Object.freeze({
    version: AUTHORING_REHEARSAL_CONSEQUENCE_VERSION,
    kind: 'authoring-rehearsal-conditions',
    facts: Object.freeze(facts.map((fact) => Object.freeze({ ...fact }))),
    items: Object.freeze(items.map((item) => Object.freeze({ ...item }))),
    commitments: Object.freeze(commitments.map((item) => Object.freeze({ ...item }))),
    issues: Object.freeze(issues)
  })
  return Object.freeze({ ...baseline, fingerprint: consequenceFingerprint('conditions', baseline) })
}

function uniqueRefs(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((ref) => text(ref)).filter(Boolean))]
}

// 归一化一次模型返回的后果批次。任一条非法 → 整批不提交（ok:false），
// issues 供界面以“待核对”呈现，绝不静默丢 delta。
// context: {
//   allowedRefs: 授权人物 ref（在场或本路已入场）,
//   allowedFactKeys: 可登记 factKey（本次冻结条件 + 本路已学得）,
//   knownCommitments: [{ commitmentKey, issueKey }] 本路可引用的既有承诺,
//   actionText: 本次作者行动原文（quote 校验源）,
//   responseText: 本次假想回应原文（quote 校验源）,
//   allowedEvidenceRefs: 冻结授权资料 ref（可选）
// }
export function normalizeRehearsalConsequences(raw, context = {}) {
  const issues = []
  if (raw == null) return { ok: true, version: AUTHORING_REHEARSAL_CONSEQUENCE_VERSION, consequences: [], issues }
  if (!Array.isArray(raw)) return failure(['后果批次不是数组'])
  if (raw.length > REHEARSAL_CONSEQUENCE_LIMITS.maxPerStep) {
    return failure([`后果超过每步上限 ${REHEARSAL_CONSEQUENCE_LIMITS.maxPerStep} 条`])
  }
  const allowedRefs = new Set(uniqueRefs(context.allowedRefs))
  const allowedFactKeys = new Set(uniqueRefs(context.allowedFactKeys))
  const allowedEvidenceRefs = new Set(uniqueRefs(context.allowedEvidenceRefs))
  const itemsByKey = new Map((Array.isArray(context.authorizedItems) ? context.authorizedItems : [])
    .map((item) => [text(item?.itemKey), item]))
  const sceneLocationRef = text(context.sceneLocationRef)
  const knownByKey = new Map((Array.isArray(context.knownCommitments) ? context.knownCommitments : [])
    .map((item) => [text(item?.commitmentKey), item]))
  const actionText = text(context.actionText)
  const responseText = text(context.responseText)
  const consequences = []
  const seenKnowledge = new Set()
  const seenCommitmentUpdates = new Set()

  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return failure(['后果项不是对象'])
    const version = item.version == null ? AUTHORING_REHEARSAL_CONSEQUENCE_VERSION : Number(item.version)
    if (version !== AUTHORING_REHEARSAL_CONSEQUENCE_VERSION) {
      return failure([`后果版本不受支持：${String(item.version)}`])
    }
    const kind = text(item.kind)
    if (kind === 'knowledge') {
      const knowerRef = text(item.knowerRef)
      const factKey = text(item.factKey)
      if (!allowedRefs.has(knowerRef)) return failure([`知情人物不在本场授权名单：${knowerRef || '(空)'}`])
      if (!allowedFactKeys.has(factKey)) return failure([`factKey 未在本次冻结条件或本路前序中登记：${factKey || '(空)'}`])
      const dedupeKey = `k:${factKey}:${knowerRef}`
      if (seenKnowledge.has(dedupeKey)) return failure(['同一步重复登记同一知情'])
      seenKnowledge.add(dedupeKey)
      const source = normalizeConsequenceSource(item.source, { actionText, responseText, allowAction: true, allowedEvidenceRefs, issues })
      if (!source) return failure(issues)
      consequences.push({
        kind: 'knowledge',
        version: AUTHORING_REHEARSAL_CONSEQUENCE_VERSION,
        knowerRef,
        factKey,
        state: 'learned',
        source
      })
      continue
    }
    if (kind === 'commitment') {
      const promisorRef = text(item.promisorRef)
      const beneficiaryRef = text(item.beneficiaryRef)
      const content = bounded(item.content, REHEARSAL_CONSEQUENCE_LIMITS.contentMaxChars)
      const condition = bounded(item.condition, REHEARSAL_CONSEQUENCE_LIMITS.conditionMaxChars)
      const state = text(item.state)
      if (!allowedRefs.has(promisorRef)) return failure([`承诺人不在本场授权名单：${promisorRef || '(空)'}`])
      if (beneficiaryRef && !allowedRefs.has(beneficiaryRef)) return failure([`受益人不在本场授权名单：${beneficiaryRef}`])
      if (!content) return failure(['承诺内容缺失'])
      if (!REHEARSAL_CONSEQUENCE_STATES.commitment.includes(state)) {
        return failure([`承诺状态不受支持：${state || '(空)'}`])
      }
      const source = normalizeConsequenceSource(item.source, { actionText, responseText, allowAction: false, allowedEvidenceRefs, issues })
      if (!source) return failure(issues)
      let commitmentKey
      let issueKey
      const echoed = text(item.commitmentKey)
      if (echoed) {
        const known = knownByKey.get(echoed)
        if (!known) return failure([`引用了未登记的 commitmentKey：${echoed}`])
        if (seenCommitmentUpdates.has(echoed)) return failure(['同一步对同一承诺重复更新'])
        seenCommitmentUpdates.add(echoed)
        commitmentKey = known.commitmentKey
        issueKey = known.issueKey || consequenceFingerprint('issue', content)
      } else {
        // 新承诺：模型不拥有 key 分配权。议题（issue）锚定在触发它的本次作者
        // 行动原文上；同一起点同一路径的同一请求得到同一 issueKey，可跨路比较。
        issueKey = consequenceFingerprint('issue', actionText)
        commitmentKey = consequenceFingerprint('commitment', { issueKey, promisorRef, content, condition })
      }
      consequences.push({
        kind: 'commitment',
        version: AUTHORING_REHEARSAL_CONSEQUENCE_VERSION,
        commitmentKey,
        issueKey,
        promisorRef,
        beneficiaryRef,
        content,
        condition,
        state,
        source
      })
      continue
    }
    if (kind === 'item') {
      // 物品转移：只处理本场已声明的稳定对象；交付/拒收都必须有回应原文
      // 依据；一把物品同时只有一个持有者，拒收不扣旧持有者。
      const itemKey = text(item.itemKey)
      const toRef = text(item.toRef)
      const state = text(item.state)
      if (!itemsByKey.has(itemKey)) return failure([`物品未在本次冻结条件中声明：${itemKey || '(空)'}`])
      if (!allowedRefs.has(toRef)) return failure([`物品交付对象不在本场授权名单：${toRef || '(空)'}`])
      if (!['delivered', 'refused'].includes(state)) return failure([`物品状态不受支持：${state || '(空)'}`])
      const known = itemsByKey.get(itemKey)
      if (state === 'delivered' && known?.holderRef && known.holderRef === toRef) {
        return failure(['交付对象已经是该物品的持有者'])
      }
      const source = normalizeConsequenceSource(item.source, { actionText, responseText, allowAction: false, allowedEvidenceRefs, issues })
      if (!source) return failure(issues)
      consequences.push({
        kind: 'item',
        version: AUTHORING_REHEARSAL_CONSEQUENCE_VERSION,
        itemKey,
        toRef,
        state,
        source
      })
      continue
    }
    if (kind === 'location') {
      // 位置：只允许本场授权地点的进入/离开；离场者失去回应资格（A01 规则）。
      const moverRef = text(item.moverRef)
      const state = text(item.state)
      const locationRef = text(item.locationRef)
      if (!allowedRefs.has(moverRef)) return failure([`移动者不在本场授权名单：${moverRef || '(空)'}`])
      if (sceneLocationRef && locationRef && locationRef !== sceneLocationRef) {
        return failure([`地点不在本场授权目录：${locationRef}`])
      }
      if (!['left', 'returned'].includes(state)) return failure([`位置状态不受支持：${state || '(空)'}`])
      const source = normalizeConsequenceSource(item.source, { actionText, responseText, allowAction: false, allowedEvidenceRefs, issues })
      if (!source) return failure(issues)
      consequences.push({
        kind: 'location',
        version: AUTHORING_REHEARSAL_CONSEQUENCE_VERSION,
        moverRef,
        locationRef: sceneLocationRef || locationRef,
        state,
        source
      })
      continue
    }
    return failure([`后果类型不受支持：${kind || '(空)'}`])
  }
  return { ok: true, version: AUTHORING_REHEARSAL_CONSEQUENCE_VERSION, consequences, issues }
}

function normalizeConsequenceSource(raw, { actionText, responseText, allowAction, allowedEvidenceRefs, issues }) {
  const kind = text(raw?.kind)
  if (kind !== 'action' && kind !== 'response') {
    pushIssue(issues, '后果来源类型必须是 action 或 response')
    return null
  }
  if (kind === 'action' && !allowAction) {
    pushIssue(issues, '承诺必须有回应原文依据，不能只由作者行动支持')
    return null
  }
  const quote = text(raw?.quote)
  if (!quote || quote.length > REHEARSAL_CONSEQUENCE_LIMITS.quoteMaxChars) {
    pushIssue(issues, '后果引文缺失或超过长度上限')
    return null
  }
  const origin = kind === 'action' ? actionText : responseText
  if (!origin.includes(quote)) {
    pushIssue(issues, `引文在${kind === 'action' ? '作者行动' : '回应'}原文中不存在`)
    return null
  }
  const evidenceRefs = uniqueRefs(raw?.evidenceRefs)
  if (evidenceRefs.length > REHEARSAL_CONSEQUENCE_LIMITS.maxEvidenceRefs) {
    pushIssue(issues, '后果依据引用超过数量上限')
    return null
  }
  if (evidenceRefs.some((ref) => !allowedEvidenceRefs.has(ref))) {
    pushIssue(issues, '后果依据引用不在冻结授权资料内')
    return null
  }
  return { kind, evidenceRefs, quote }
}

// 把本次冻结条件与本路已提交的 step 后果折叠为路线状态。纯函数：
// steps 顺序即提交顺序；同一 step 重放由调用方保证不重复进入。
export function projectRouteConsequenceState(conditions, steps) {
  const facts = new Map()
  const commitments = new Map()
  const items = new Map()
  const absentRefs = new Set()
  const addFact = (fact) => {
    facts.set(fact.factKey, {
      factKey: fact.factKey,
      text: fact.text,
      kind: fact.kind || 'assumption',
      knowerRefs: [...(fact.knowerRefs || [])],
      unawareRefs: [...(fact.unawareRefs || [])],
      learnedInStep: {}
    })
  }
  for (const fact of conditions?.facts || []) addFact(fact)
  for (const item of conditions?.items || []) {
    items.set(item.itemKey, {
      itemKey: item.itemKey,
      name: item.name,
      holderRef: item.holderRef || '',
      kind: item.kind || 'assumption',
      stepId: '',
      history: []
    })
  }
  for (const item of conditions?.commitments || []) {
    commitments.set(item.commitmentKey, {
      commitmentKey: item.commitmentKey,
      issueKey: item.issueKey,
      promisorRef: item.promisorRef,
      beneficiaryRef: item.beneficiaryRef || '',
      content: item.content,
      condition: item.condition || '',
      state: item.state,
      kind: item.kind || 'assumption',
      stepId: '',
      history: []
    })
  }
  for (const step of Array.isArray(steps) ? steps : []) {
    for (const consequence of Array.isArray(step?.consequences) ? step.consequences : []) {
      if (consequence.kind === 'knowledge') {
        const fact = facts.get(consequence.factKey)
        if (!fact) continue
        if (!fact.knowerRefs.includes(consequence.knowerRef)) fact.knowerRefs.push(consequence.knowerRef)
        fact.unawareRefs = fact.unawareRefs.filter((ref) => ref !== consequence.knowerRef)
        fact.learnedInStep[consequence.knowerRef] = step.id
        continue
      }
      if (consequence.kind === 'item') {
        const item = items.get(consequence.itemKey)
        if (!item) continue
        if (consequence.state === 'delivered') item.holderRef = consequence.toRef
        item.stepId = step.id
        item.history.push({ stepId: step.id, state: consequence.state, toRef: consequence.toRef })
        continue
      }
      if (consequence.kind === 'location') {
        // 离场/回到本场：同一人反复进出以后一次为准，不重复记录
        if (consequence.state === 'left') absentRefs.add(consequence.moverRef)
        else absentRefs.delete(consequence.moverRef)
        continue
      }
      if (consequence.kind === 'commitment') {
        const existing = commitments.get(consequence.commitmentKey)
        if (existing) {
          existing.state = consequence.state
          existing.condition = consequence.condition || existing.condition
          existing.stepId = step.id
          existing.history.push({ stepId: step.id, state: consequence.state, condition: consequence.condition || '' })
          continue
        }
        commitments.set(consequence.commitmentKey, {
          commitmentKey: consequence.commitmentKey,
          issueKey: consequence.issueKey,
          promisorRef: consequence.promisorRef,
          beneficiaryRef: consequence.beneficiaryRef || '',
          content: consequence.content,
          condition: consequence.condition || '',
          state: consequence.state,
          kind: 'simulated',
          stepId: step.id,
          history: []
        })
      }
    }
  }
  const factList = [...facts.values()].map((fact) => Object.freeze({
    ...fact,
    learnedInStep: Object.freeze({ ...fact.learnedInStep })
  }))
  const commitmentList = [...commitments.values()].map((item) => Object.freeze({ ...item }))
  const itemList = [...items.values()].map((item) => Object.freeze({ ...item }))
  const state = Object.freeze({
    kind: 'authoring-rehearsal-consequence-state',
    version: AUTHORING_REHEARSAL_CONSEQUENCE_VERSION,
    facts: Object.freeze(factList),
    items: Object.freeze(itemList),
    commitments: Object.freeze(commitmentList),
    absentRefs: Object.freeze([...absentRefs])
  })
  return Object.freeze({ ...state, stateFingerprint: consequenceFingerprint('route-state', state) })
}

// 知情状态三分：learned（已得知）/ declared-unaware（作者明确声明尚不知情）/
// unrecorded（本路未记录——不是不知道）。只有 declared-unaware 可展示“尚未获知”。
export function knowledgeStatus(routeState, factKey, knowerRef) {
  const fact = routeState?.facts?.find((item) => item.factKey === factKey)
  if (!fact) return 'unrecorded'
  if (fact.knowerRefs.includes(knowerRef)) return 'learned'
  if (fact.unawareRefs.includes(knowerRef)) return 'declared-unaware'
  return 'unrecorded'
}

const STATUS_LABELS = Object.freeze({
  learned: '已得知',
  'declared-unaware': '作者声明暂不知情',
  unrecorded: '未记录',
  promised: '已承诺',
  conditioned: '有条件承诺',
  refused: '拒绝',
  withdrawn: '已撤回'
})

export function consequenceStatusLabel(state) {
  return STATUS_LABELS[state] || '未记录'
}

// 纯对照：按 factKey+knowerRef 与 commitment issueKey 匹配两路状态。
// 按对象与状态比较，不做句子相似度；共同前缀/共同状态不计为分歧；
// 未记录与明确拒绝/声明不知情是不同状态。
export function compareRouteConsequences(stateA, stateB, { namesByRef = () => '' } = {}) {
  const differences = []
  const nameOf = (ref) => namesByRef(ref) || ref
  const factKeys = new Set([
    ...(stateA?.facts || []).map((fact) => fact.factKey),
    ...(stateB?.facts || []).map((fact) => fact.factKey)
  ])
  for (const factKey of factKeys) {
    const a = stateA?.facts?.find((fact) => fact.factKey === factKey) || null
    const b = stateB?.facts?.find((fact) => fact.factKey === factKey) || null
    const knowerRefs = new Set([...(a?.knowerRefs || []), ...(a?.unawareRefs || []), ...(b?.knowerRefs || []), ...(b?.unawareRefs || [])])
    for (const knowerRef of knowerRefs) {
      const statusA = knowledgeStatus(stateA, factKey, knowerRef)
      const statusB = knowledgeStatus(stateB, factKey, knowerRef)
      if (statusA === statusB) continue
      differences.push({
        kind: 'knowledge',
        key: `${factKey}:${knowerRef}`,
        label: (a || b)?.text || factKey,
        personName: nameOf(knowerRef),
        a: { status: statusA, statusLabel: consequenceStatusLabel(statusA), stepId: a?.learnedInStep?.[knowerRef] || '' },
        b: { status: statusB, statusLabel: consequenceStatusLabel(statusB), stepId: b?.learnedInStep?.[knowerRef] || '' }
      })
    }
  }
  const issueKeys = new Set([
    ...(stateA?.commitments || []).map((item) => item.issueKey),
    ...(stateB?.commitments || []).map((item) => item.issueKey)
  ])
  for (const issueKey of issueKeys) {
    const inA = (stateA?.commitments || []).filter((item) => item.issueKey === issueKey)
    const inB = (stateB?.commitments || []).filter((item) => item.issueKey === issueKey)
    const pick = (items) => items.find((item) => ['promised', 'conditioned'].includes(item.state)) || items[0] || null
    const a = pick(inA)
    const b = pick(inB)
    const statusA = a ? a.state : 'unrecorded'
    const statusB = b ? b.state : 'unrecorded'
    if (statusA === statusB && (a?.condition || '') === (b?.condition || '')) continue
    differences.push({
      kind: 'commitment',
      key: issueKey,
      label: (a || b)?.content || issueKey,
      personName: nameOf((a || b)?.promisorRef || ''),
      a: { status: statusA, statusLabel: consequenceStatusLabel(statusA), condition: a?.condition || '', stepId: a?.stepId || '' },
      b: { status: statusB, statusLabel: consequenceStatusLabel(statusB), condition: b?.condition || '', stepId: b?.stepId || '' }
    })
  }
  const itemKeys = new Set([
    ...(stateA?.items || []).map((item) => item.itemKey),
    ...(stateB?.items || []).map((item) => item.itemKey)
  ])
  for (const itemKey of itemKeys) {
    const a = stateA?.items?.find((item) => item.itemKey === itemKey) || null
    const b = stateB?.items?.find((item) => item.itemKey === itemKey) || null
    const holderA = a?.holderRef || ''
    const holderB = b?.holderRef || ''
    if (holderA === holderB) continue
    differences.push({
      kind: 'item',
      key: itemKey,
      label: (a || b)?.name || itemKey,
      personName: nameOf(holderB || holderA || ''),
      a: { status: holderA ? 'held' : 'unheld', statusLabel: holderA ? `持有者：${nameOf(holderA)}` : '无主', holderName: holderA ? nameOf(holderA) : '', stepId: a?.stepId || '' },
      b: { status: holderB ? 'held' : 'unheld', statusLabel: holderB ? `持有者：${nameOf(holderB)}` : '无主', holderName: holderB ? nameOf(holderB) : '', stepId: b?.stepId || '' }
    })
  }
  const absenceRefs = new Set([...(stateA?.absentRefs || []), ...(stateB?.absentRefs || [])])
  for (const ref of absenceRefs) {
    const awayA = (stateA?.absentRefs || []).includes(ref)
    const awayB = (stateB?.absentRefs || []).includes(ref)
    if (awayA === awayB) continue
    differences.push({
      kind: 'location',
      key: `absence:${ref}`,
      label: nameOf(ref),
      personName: nameOf(ref),
      a: { status: awayA ? 'away' : 'present', statusLabel: awayA ? '已离开现场' : '在现场', stepId: '' },
      b: { status: awayB ? 'away' : 'present', statusLabel: awayB ? '已离开现场' : '在现场', stepId: '' }
    })
  }
  return Object.freeze({ differences: Object.freeze(differences) })
}

// ---------------------------------------------------------------------------
// 试演请求协议（纯函数）：行动意图、人物身份/入场时点、请求装配与响应解析。
// 与后果合同同住一份共享模块，服务端与客户端使用同一实现；本段不依赖任何
// IO，可在 plain node / 浏览器 / vitest 三种环境运行。
// ---------------------------------------------------------------------------

export const REHEARSAL_MAX_STEPS = 4

// 作者行动的会话内意图：谁行动、指向谁、原文。只在试演会话内存在，
// 不写入作品数据库或正式设定。actorRef/targetRefs 是稳定主键；actor/targets
// 是显示姓名，保持旧字符串调用兼容，但身份判定永远不取第一个同名人。
export function normalizeActionIntent(action) {
  if (action && typeof action === 'object') {
    return {
      text: String(action.text || '').trim(),
      actor: String(action.actor || '').trim(),
      targets: (Array.isArray(action.targets) ? action.targets : []).map(item => String(item || '').trim()).filter(Boolean),
      actorRef: String(action.actorRef || '').trim(),
      targetRefs: (Array.isArray(action.targetRefs) ? action.targetRefs : []).map(item => String(item || '').trim()).filter(Boolean),
      // 作者明确授权本步入场的人物 ref（必须是 planned 人物；生效后才有回应权）
      enteringRefs: (Array.isArray(action.enteringRefs) ? action.enteringRefs : []).map(item => String(item || '').trim()).filter(Boolean)
    }
  }
  return { text: String(action || '').trim(), actor: '', targets: [], actorRef: '', targetRefs: [], enteringRefs: [] }
}

export function rehearsalPathText(steps) {
  return steps.map((step, i) => {
    const who = step.actor ? `${step.actor}${step.targets?.length ? `（对 ${step.targets.join('、')}）` : ''}` : '作者'
    return `${i + 1}. 行动 ${who}：${step.action}\n假想回应：${step.response}\n假想变化：${step.change}`
  }).join('\n\n')
}

// 在场人物边界（低敏：名字、角色标签、引用），供请求与归档共用。
// entry 是本路已生效的入场 ref 集合；planned 且未入场的人物保留在名单中
// 供作者选择授权，但没有任何当前台词权。
export function rehearsalParticipants(run, enteredRefs = []) {
  const list = Array.isArray(run?.pressureProjection?.participants) ? run.pressureProjection.participants : []
  const entered = new Set((Array.isArray(enteredRefs) ? enteredRefs : []).map(ref => String(ref || '').trim()).filter(Boolean))
  return list
    .filter(person => person?.name)
    .map(person => {
      const roles = (Array.isArray(person.roles) ? person.roles : []).map(role => String(role))
      const plannedOnly = roles.length > 0 && roles.every(role => role === 'planned')
      const ref = String(person.ref || '')
      return {
        name: String(person.name),
        roles,
        ref,
        // present：在场可回应；entered：作者授权后本路已入场；planned：纯未来计划
        status: plannedOnly ? (entered.has(ref) ? 'entered' : 'planned') : 'present'
      }
    })
}

// 行动者/对象的身份解析。ref 优先；退回姓名时必须唯一命中。
// 返回 { ok, actor, targets, error }——歧义是可处理错误，绝不取第一个同名人。
export function resolveActionParticipants(participants, intent) {
  const eligible = participants.filter(person => person.ref)
  const byRef = new Map(eligible.map(person => [person.ref, person]))
  const resolveOne = (ref, name, field) => {
    if (ref) {
      const person = byRef.get(ref)
      if (!person) return { error: `人物引用不在当前现场（${field}），请重新选择。` }
      return { person }
    }
    const matches = eligible.filter(person => person.name === name)
    if (matches.length === 1) return { person: matches[0] }
    if (matches.length > 1) return { error: `现场有多位「${name}」，请改用人物选择指定具体对象。` }
    return { error: `「${name || field}」不在当前现场，请重新选择。` }
  }
  if (participants.length) {
    if (intent.actor || intent.actorRef) {
      const actor = resolveOne(intent.actorRef, intent.actor, '行动者')
      if (actor.error) return { ok: false, error: actor.error }
      if (actor.person.status === 'planned') {
        return { ok: false, error: `「${actor.person.name}」尚未入场，不能先行动；可先授权其入场。` }
      }
      const targets = []
      for (let index = 0; index < intent.targets.length; index += 1) {
        const target = resolveOne(intent.targetRefs[index] || '', intent.targets[index], '动作对象')
        if (target.error) return { ok: false, error: target.error }
        if (target.person.ref === actor.person.ref) return { ok: false, error: '动作对象不能是行动者本人，请重新选择。' }
        targets.push(target.person)
      }
      return { ok: true, actor: actor.person, targets }
    }
    // 未指明行动者：按现场视角人物理解，保持既有行为
    return { ok: true, actor: null, targets: [] }
  }
  return { ok: true, actor: null, targets: [] }
}

// 有权在本步获得台词/回应的人物：在场 + 本路已入场者。planned 未入场者
// 明确无权；本线不实现离场状态，如需离场边界继续列为支持范围外。
export function rehearsalResponders(participants, actorRef = '') {
  return participants.filter(person => person.status !== 'planned' && person.ref !== actorRef)
}

const COMMITMENT_STATE_LABELS = Object.freeze({
  promised: '已承诺', conditioned: '有条件承诺', refused: '已拒绝', withdrawn: '已撤回'
})

// 供请求使用的知情约束视图（有界）。只描述已记录状态：某人已得知、
// 作者明确声明暂不知情；其余一律「未记录」，指令要求模型不凭空假定。
function buildKnowledgeLines({ routeState, participants, maxItems = 8 }) {
  const nameByRef = new Map(participants.map(person => [person.ref, person.name]))
  const lines = []
  for (const fact of routeState?.facts || []) {
    for (const ref of fact.knowerRefs) {
      if (lines.length >= maxItems) return lines
      lines.push(`${nameByRef.get(ref) || ref}已得知「${fact.text}」`)
    }
    for (const ref of fact.unawareRefs) {
      if (lines.length >= maxItems) return lines
      lines.push(`${nameByRef.get(ref) || ref}尚不知道「${fact.text}」（作者本次设定）`)
    }
  }
  return lines
}

function buildCommitmentLines({ routeState, participants, maxItems = 6 }) {
  const nameByRef = new Map(participants.map(person => [person.ref, person.name]))
  return (routeState?.commitments || [])
    .filter(item => item.state !== 'withdrawn')
    .slice(0, maxItems)
    .map(item => {
      const who = nameByRef.get(item.promisorRef) || item.promisorRef
      const condition = item.condition ? `（条件：${item.condition}）` : ''
      return `${who}对本次请求${COMMITMENT_STATE_LABELS[item.state] || item.state}${condition}：${item.content}`
    })
}

function buildConsequenceDirective({ participants, routeState, sceneLocationRef }) {
  const activeParticipants = participants.filter(person => person.status !== 'planned' && person.ref)
  if (!activeParticipants.length || !routeState) return ''
  const nameByRef = new Map(participants.map(person => [person.ref, person.name]))
  const factLines = (routeState.facts || []).map(fact => `${fact.factKey}（${fact.text}）`)
  const commitmentLines = (routeState.commitments || [])
    .filter(item => ['promised', 'conditioned'].includes(item.state))
    .map(item => `${item.commitmentKey}（${nameByRef.get(item.promisorRef) || item.promisorRef}的承诺：${item.content}）`)
  const itemLines = (routeState.items || [])
    .map(item => `${item.itemKey}（${item.name}${item.holderRef ? `，当前在 ${nameByRef.get(item.holderRef) || item.holderRef} 手里` : '，当前无主'}）`)
  const lines = [
    `\n后果登记（可选；虽然协议最多容纳2条，本次最多输出最明确的1条，登记后本路可继承）：`,
    `- 知情：若本行动让某人确实得知某项已登记事实，输出 {"kind":"knowledge","knowerRef":"人物ref","factKey":"事实标识","source":{"kind":"action或response","quote":"原句"}}。factKey 必须逐字复制下方机器标识，不能填写事实原文或自造标识。`,
    `- 承诺：若某人物在回应中作出承诺/有条件承诺/拒绝/撤回，输出 {"kind":"commitment","promisorRef":"人物ref","beneficiaryRef":"人物ref或省略","state":"promised|conditioned|refused|withdrawn","content":"守门等具体承诺","condition":"条件或省略","source":{"kind":"response","quote":"回应原句"}}；更新既有承诺必须带上其 commitmentKey，新承诺不要编 key。`,
    `- quote 必须是 action 或 response 字段里一段连续文字的逐字复制，连中英文引号和标点也保持一致；choices 里的文字不属于 response，绝不能拿来作回应引文。先写完 response 再复制 quote，不能保证逐字一致就不要登记该后果。人物 ref 只能用：${activeParticipants.map(person => `${person.name}=${person.ref}`).join('、')}。`
  ]
  if (factLines.length) lines.push(`- 可登记事实：${factLines.join('；')}`)
  else lines.push('- 当前没有可登记事实：consequences 中不得输出 knowledge。')
  if (commitmentLines.length) lines.push(`- 可更新承诺：${commitmentLines.join('；')}`)
  if (itemLines.length) {
    lines.push(`- 物品（只限已声明物品；回应中出现明确交付或拒收时才登记，输出 {"kind":"item","itemKey":"物品标识","toRef":"接收方人物ref","state":"delivered或refused","source":{"kind":"response","quote":"回应原句"}}）：${itemLines.join('；')}`)
  }
  else lines.push('- 当前没有已声明物品：consequences 中不得输出 item。')
  if (sceneLocationRef) {
    lines.push(`- 位置（只限本场：有人明确离开或回到现场时登记，输出 {"kind":"location","moverRef":"人物ref","state":"left或returned","source":{"kind":"response","quote":"回应原句"}}）`)
  }
  return lines.join('\n')
}

// 请求装配（纯函数）。返回 { error } 或完整请求部件；发送方只负责
// 构建信封、调用 provider 与解析。本函数只做身份边界、知情视图、
// 后果指令与校验原文的装配。
export function buildRehearsalRequestPlan({ run, steps, action, routeState = null, refs = [] }) {
  const intent = normalizeActionIntent(action)
  if (!run || steps.length >= REHEARSAL_MAX_STEPS || !intent.text || intent.text.length > 300) {
    return { error: '本次试演已到四步，或行动过长；请从较早一步换路。' }
  }
  const enteredRefs = (routeState?.enteredRefs || [])
  const participants = rehearsalParticipants(run, enteredRefs)
  // 作者本步授权入场：只接受 planned 人物；入场在本步提交后生效，
  // 因此本步的回应者仍不含新入场者。
  const entering = participants.filter(person => person.status === 'planned' && intent.enteringRefs.includes(person.ref))
  const invalidEntering = intent.enteringRefs.filter(ref => !entering.some(person => person.ref === ref))
  if (invalidEntering.length) return { error: '授权入场的人物不存在或已在场，请重新选择。' }
  const resolved = resolveActionParticipants(participants, intent)
  if (!resolved.ok) return { error: resolved.error }
  const actor = resolved.actor
  // 离场者失去回应资格（A01 同一规则）；回到现场后恢复。
  const absentRefs = new Set(routeState?.absentRefs || [])
  const responders = rehearsalResponders(participants, actor?.ref || '')
    .filter(person => !absentRefs.has(person.ref))
  const absentPeople = participants.filter(person => person.status !== 'planned' && absentRefs.has(person.ref))
  const cast = participants
    .filter(person => person.status !== 'planned')
    .map(person => `${person.name}（${person.roles.join('/') || '在场'}）`).join('、')
  const plannedCast = participants.filter(person => person.status === 'planned')
  const plannedLine = plannedCast.length
    ? `未入场人物（本步无台词与行动权，除非作者本步明确授权入场）：${plannedCast.map(person => person.name).join('、')}`
    : ''
  const enteringLine = entering.length
    ? `作者本步授权以下人物行动完成后入场：${entering.map(person => person.name).join('、')}；他们从下一步起才可回应。`
    : ''
  const absentLine = absentPeople.length
    ? `已离开现场的人物（本步不得获得台词或关键行动，除非其回到现场）：${absentPeople.map(person => person.name).join('、')}`
    : ''
  const actorLine = actor ? `行动者：${actor.name}` : '行动者：未指明（按现场视角人物理解）'
  const targetNames = resolved.targets.map(person => person.name)
  const targetLine = targetNames.length ? `动作对象：${targetNames.join('、')}` : '动作对象：未指明'
  const responderLine = responders.length
    ? `允许回应者（也允许环境）：${responders.map(person => person.name).join('、')}`
    : '本场没有其他在场人物：不要虚构人物互动，写行动完成后环境与局势的直接后果。'
  const priorityLine = targetNames.length ? `优先回应者（动作对象）：${targetNames.join('、')}` : ''
  const knowledgeLines = buildKnowledgeLines({ routeState, participants })
  const commitmentLines = buildCommitmentLines({ routeState, participants })
  const knowledgeBlock = knowledgeLines.length
    ? `\n知情约束（只依据已记录状态；未记录的人物不假定其知晓或不知晓，不替作者泄露未登记的秘密）：\n${knowledgeLines.map(line => `- ${line}`).join('\n')}`
    : ''
  const commitmentBlock = commitmentLines.length
    ? `\n本路已成立的承诺（延续其条件与状态）：\n${commitmentLines.map(line => `- ${line}`).join('\n')}`
    : ''
  const consequenceDirective = buildConsequenceDirective({ participants, routeState, sceneLocationRef: run?.pressureProjection?.location?.ref || '' })
  const verification = {
    actionText: intent.text,
    allowedRefs: participants.filter(person => person.status !== 'planned' && person.ref).map(person => person.ref),
    allowedFactKeys: (routeState?.facts || []).map(fact => fact.factKey),
    knownCommitments: (routeState?.commitments || [])
      .filter(item => ['promised', 'conditioned'].includes(item.state))
      .map(item => ({ commitmentKey: item.commitmentKey, issueKey: item.issueKey })),
    allowedEvidenceRefs: refs,
    authorizedItems: (routeState?.items || []).map(item => ({ itemKey: item.itemKey, name: item.name, holderRef: item.holderRef || '' })),
    sceneLocationRef: run?.pressureProjection?.location?.ref || '',
    absentRefs: [...absentRefs]
  }
  const question = `这是未写入作品的隔离试演，不是批注改写。冻结现场是出发点，以下只包含当前路径，承接已发生的假想回应；不要回到起点或引入其他路径。\n${rehearsalPathText(steps) || '尚未试演。'}\n\n在场人物（仅限这些人物获得台词、名字或关键行动）：${cast || '（无）'}\n${plannedLine}${plannedLine && enteringLine ? '\n' : ''}${enteringLine}${absentLine ? `\n${absentLine}` : ''}\n${actorLine}\n${targetLine}\n${responderLine}${priorityLine ? `\n${priorityLine}` : ''}${knowledgeBlock}${commitmentBlock}${consequenceDirective}\n本次作者行动：${intent.text}\n\n写作规则：\n1. 从行动完成后的那一瞬间接写。不要重演、描述或解释行动本身，直接写他人与环境对已完成行动的反应。\n2. 只演行动者之外的人物与环境：他们的动作、台词、态度、条件。不替行动者对白，不写行动者的内心独白。若有动作对象，由动作对象先作出直接回应；其他允许回应者只在现场关系确实需要时参与。\n3. 名单之外的人物不得出现台词、名字或关键行动；未入场与已离场人物同样不得获得台词或关键行动；可以写门响、灯灭、沉默等环境反应，但环境异动必须来自冻结现场或已发生的行为，不用凭空的脚步声、陌生人制造紧张。\n4. 每个回应人物至少表现一个自己的目标、条件、保留或拒绝，不总是顺从行动者。\n5. change 用一两句写可继续使用的事实——位置、持有物、承诺、拒绝、暴露的信息、关系中的明确条件；不要只写「更加警觉」「信任加深」这类态度总结。若是路径第二步，必须继承前一步假想变化中已发生的具体事实。\n6. response 用具体动作与台词，中文引号。\n7. choices 每条以执行者名字开头（如「艾德加……」「莉娜……」），直接给动作原文，不加任何前缀或引号包裹，不预告结果。\n在作者继续介入之前暂停。`
  return {
    intent, participants, actor, targets: resolved.targets, responders, entering,
    question, verification
  }
}

// 解析一次推演响应：保留四字段；后果批次用同一合同归一化。结构失败仍是
// 失败；后果非法不吞掉回应，而是标为 needs-review 交作者重试或放弃，
// 绝不静默丢 delta。verification 传 null 时（服务端已归一化对象）只做透传。
export function parseRehearsalResponse(raw, allowedRefs = [], verification = null) {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? null)
  if (text.length > REHEARSAL_MAX_OUTPUT_CHARS) {
    throw new Error('这次回应超出结果上限，请重试；已有试演仍为你保留。')
  }
  const value = typeof raw === 'string' ? JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')) : raw
  const bounded = (value_, max) => typeof value_ === 'string' && value_.trim().length > 0 && value_.length <= max
  if (!value || !bounded(value.response, 600) || !bounded(value.change, 160) ||
      !Array.isArray(value.choices) || value.choices.length < 1 || value.choices.length > 3 ||
      value.choices.some(choice => !bounded(choice, 80)) || !Array.isArray(value.evidenceRefs) ||
      value.evidenceRefs.length > 12 || value.evidenceRefs.some(ref => !allowedRefs.includes(ref))) {
    throw new Error('回应或依据不完整，请重试；已有试演仍为你保留。')
  }
  const parsed = {
    response: value.response.trim(),
    change: value.change.trim(),
    choices: [...value.choices],
    evidenceRefs: [...value.evidenceRefs]
  }
  if (value.consequenceStatus) {
    // 服务端已经用同一合同归一化过：只做形状校验，不再二次归一
    // （新分配的 commitmentKey 不在本端 knownCommitments 里，重跑会误判）。
    parsed.consequences = Array.isArray(value.consequences) ? value.consequences.filter(item => item && typeof item === 'object') : []
    parsed.consequenceVersion = AUTHORING_REHEARSAL_CONSEQUENCE_VERSION
    parsed.consequenceStatus = value.consequenceStatus === 'committed' && parsed.consequences.length <= REHEARSAL_CONSEQUENCE_LIMITS.maxPerStep
      ? 'committed'
      : 'needs-review'
    parsed.consequenceIssues = Array.isArray(value.consequenceIssues) ? [...value.consequenceIssues] : []
    return parsed
  }
  const batch = normalizeRehearsalConsequences(value.consequences, verification || {})
  if (batch.ok) {
    parsed.consequences = batch.consequences
    parsed.consequenceVersion = AUTHORING_REHEARSAL_CONSEQUENCE_VERSION
    parsed.consequenceStatus = 'committed'
    parsed.consequenceIssues = []
  } else {
    parsed.consequences = []
    parsed.consequenceVersion = AUTHORING_REHEARSAL_CONSEQUENCE_VERSION
    parsed.consequenceStatus = 'needs-review'
    parsed.consequenceIssues = batch.issues
  }
  return parsed
}
