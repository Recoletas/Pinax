// 助手写作 Skills 的 shared 合同：内置方法注册表、冻结输入白名单、预算
// 顶格值与版本协商回执。依据 docs/plan/assistant-writing-skills-20260919.md
// §5.1–§5.2、§8.2。服务端（server/routes/advisor.js）与浏览器 provider 共用
// 本模块；任何一侧未知 skillId/skillVersion/字段/能力一律 fail closed。
//
// 边界：本模块只做注册与校验，不发起模型请求、不读文件、不触碰编辑器。
// 方法正文（methodText）由 agents/authoring 域在 S05 落地并经
// validateWritingSkillMethodDescription 校验后注册；本表只引用 ID。

export const WRITING_SKILL_SCHEMA_VERSION = 1

// 同一任务入口的四种 taskKind（§1/§4）。knowledge-query 沿用旧问答链，
// 其余三种在后续包分别接入既有 review/rewrite/影响检查 owner。
export const WRITING_SKILL_TASK_KINDS = Object.freeze([
  'knowledge-query',
  'goal-review',
  'finding-rewrite',
  'change-impact'
])

// 检查器 ID 白名单：local.proofing 指既有 authoringReviewSession 本地检查；
// writingSkillChecks.degeneration 指 S02 适配的退化指纹检测。
export const WRITING_SKILL_CHECKER_IDS = Object.freeze([
  'local.proofing',
  'writingSkillChecks.degeneration'
])

// 首批三个目标方法（§5.1）；人物一致性留待第二批独立校准，不在表内。
const METHOD_ROWS = [
  {
    id: 'motivation-causality',
    version: 1,
    taskKind: 'goal-review',
    title: '动机与行动因果',
    summary: '围绕作者目标检查人物动机是否成立、行动是否有因果衔接。',
    methodTextId: 'writingSkillMethods.motivationCausality',
    scope: Object.freeze(['selection', 'chapter', 'whole-book']),
    requiredMaterials: Object.freeze(['manuscript-target', 'authorized-evidence', 'style-rules']),
    outputSchema: 'writing-skill-findings.v1',
    allowedReadonlyCapabilities: Object.freeze([]),
    checkers: Object.freeze(['local.proofing', 'writingSkillChecks.degeneration']),
    provenance: Object.freeze({
      methodFamily: 'pinax-original',
      upstreamSha: 'oh-story-claudecode@0ffe7db4fa02489f5d1989e58a22ce62d040a850 (checks only)',
      license: 'MIT',
      licenseNotice: '/third-party/oh-story-claudecode-LICENSE.txt'
    }),
    evalVersion: 'writing-skills-eval-v0'
  },
  {
    id: 'setup-payoff',
    version: 1,
    taskKind: 'goal-review',
    title: '铺垫与兑现',
    summary: '检查伏笔与承诺是否在目标范围内得到铺垫或兑现，缺资料时如实标注。',
    methodTextId: 'writingSkillMethods.setupPayoff',
    scope: Object.freeze(['selection', 'chapter', 'whole-book']),
    requiredMaterials: Object.freeze(['manuscript-target', 'authorized-evidence', 'style-rules']),
    outputSchema: 'writing-skill-findings.v1',
    allowedReadonlyCapabilities: Object.freeze([]),
    checkers: Object.freeze(['local.proofing', 'writingSkillChecks.degeneration']),
    provenance: Object.freeze({
      methodFamily: 'pinax-original',
      upstreamSha: 'oh-story-claudecode@0ffe7db4fa02489f5d1989e58a22ce62d040a850 (checks only)',
      license: 'MIT',
      licenseNotice: '/third-party/oh-story-claudecode-LICENSE.txt'
    }),
    evalVersion: 'writing-skills-eval-v0'
  },
  {
    id: 'pacing-redundancy',
    version: 1,
    taskKind: 'goal-review',
    title: '节奏与冗余',
    summary: '检查节奏拖沓、重复表述与冗余段落，风格偏好不得升级为事实冲突。',
    methodTextId: 'writingSkillMethods.pacingRedundancy',
    scope: Object.freeze(['selection', 'chapter', 'whole-book']),
    requiredMaterials: Object.freeze(['manuscript-target', 'style-rules']),
    outputSchema: 'writing-skill-findings.v1',
    allowedReadonlyCapabilities: Object.freeze([]),
    checkers: Object.freeze(['local.proofing', 'writingSkillChecks.degeneration']),
    provenance: Object.freeze({
      methodFamily: 'pinax-original',
      upstreamSha: 'oh-story-claudecode@0ffe7db4fa02489f5d1989e58a22ce62d040a850 (checks only)',
      license: 'MIT',
      licenseNotice: '/third-party/oh-story-claudecode-LICENSE.txt'
    }),
    evalVersion: 'writing-skills-eval-v0'
  }
]

export const WRITING_SKILL_METHODS = Object.freeze(METHOD_ROWS.map((row) => Object.freeze(row)))

// §8.2 预算初值：均为待校准顶格值，调用方可以下调，不得越过。
export const WRITING_SKILL_BUDGET_LIMITS = Object.freeze({
  maxReviewGoals: 3,
  batchChars: 6000,
  maxBatches: 8,
  maxFollowupQueriesPerBatch: 2,
  maxFormatRepairs: 1,
  maxCandidates: 2,
  maxCandidateRepairs: 1,
  concurrency: 1
})

const FORBIDDEN_DESCRIPTION_PATTERNS = [
  { re: /(?:^|[\s（(（])\/(?:src|server|shared|scripts|etc|usr|home)\b/i, label: 'file-path' },
  { re: /\.\.(?:\/|\\)/, label: 'file-path' },
  { re: /\b(?:[A-Za-z]:\\|~\/)/, label: 'file-path' },
  { re: /\.(?:js|mjs|cjs|ts|vue|sh|py)\b(?![\w-])/, label: 'file-path' },
  { re: /(?:\brm\s+-[rf]\b|\bsudo\b|\bbash\s+-c\b|\bsh\s+-c\b|\bcurl\s|\bwget\s|\bchmod\s|\bkill\s)/, label: 'shell' },
  { re: /(?:\$\(|`|&&|\|\||;\s*(?:rm|curl|wget|bash|sh)\b)/, label: 'shell' },
  { re: /(?:https?:\/\/|www\.|ftp:\/\/|file:\/\/)/i, label: 'network-address' },
  { re: /(?:\beval\s*\(|new\s+Function\s*\(|import\s*\(|require\s*\(|process\.|globalThis\.|window\.|document\.)/, label: 'arbitrary-js' },
  { re: /<script\b/i, label: 'arbitrary-js' }
]

/**
 * 校验方法描述文本：title/summary/methodText 不得携带文件路径、shell、
 * 任意 JS 或网络地址（§5.1）。注册方法与 S05 的方法正文都必须通过。
 */
export function validateWritingSkillMethodDescription(method) {
  const fields = [
    ['title', method?.title],
    ['summary', method?.summary],
    ['methodText', method?.methodText]
  ]
  for (const [field, value] of fields) {
    const text = String(value ?? '')
    if (field !== 'methodText' && !text.trim()) {
      return { valid: false, reason: `missing-field:${field}` }
    }
    if (text.length > (field === 'methodText' ? 12000 : 400)) {
      return { valid: false, reason: `field-too-long:${field}` }
    }
    for (const { re, label } of FORBIDDEN_DESCRIPTION_PATTERNS) {
      const match = re.exec(text)
      if (match) return { valid: false, reason: `forbidden-content:${label}`, field, fragment: match[0].slice(0, 40) }
    }
  }
  return { valid: true, reason: '' }
}

function sameVersion(method, skillVersion) {
  if (skillVersion == null || skillVersion === '') return false
  return Number(skillVersion) === method.version
}

/**
 * 精确解析方法：skillId 与 skillVersion 都必须命中注册表，不用“最新版”
 * 兜底（§9：旧结果保留生成版本，更新方法不自动重生成）。
 */
export function resolveWritingSkillMethod(skillId, skillVersion) {
  const id = String(skillId ?? '').trim()
  if (!id) return { ok: false, reason: 'skill-id-missing' }
  const method = WRITING_SKILL_METHODS.find((row) => row.id === id)
  if (!method) return { ok: false, reason: 'skill-unknown' }
  if (!sameVersion(method, skillVersion)) return { ok: false, reason: 'skill-version-unknown' }
  return { ok: true, reason: '', method }
}

const INVOCATION_TOP_FIELDS = Object.freeze([
  'invocationId', 'taskKind', 'skillId', 'skillVersion', 'goal',
  'scope', 'target', 'revisions', 'constraints', 'materialManifest',
  'budget', 'requestedCoverage', 'requestedReadonlyCapabilities'
])
const SCOPE_FIELDS = Object.freeze(['projectId', 'documentRole', 'documentId', 'chapterIds', 'branchId'])
const TARGET_FIELDS = Object.freeze(['unitId', 'nodeId', 'range', 'exactQuote', 'prefix', 'suffix'])
const REVISION_FIELDS = Object.freeze(['document', 'node', 'unit', 'evidence', 'style'])
const CONSTRAINT_FIELDS = Object.freeze(['lockedRanges', 'forbiddenChanges', 'viewpointActorRef', 'storyCutoff'])
const BUDGET_FIELDS = Object.freeze([
  'maxReviewGoals', 'batchChars', 'maxBatches', 'maxFollowupQueriesPerBatch',
  'maxFormatRepairs', 'maxCandidates', 'maxCandidateRepairs', 'concurrency'
])

function rejectUnknownFields(raw, allowed, prefix, failures) {
  for (const key of Object.keys(raw || {})) {
    if (!allowed.includes(key)) failures.push(`${prefix}${key}`)
  }
}

const MAX_TEXT_FIELD = 400
const MAX_ID_FIELD = 120
const MAX_REF_LIST = 64

// 严格字符串字段：必须是 string/number，收成 trim 后的字符串并限长；
// 对象/数组/布尔一律拒绝（fail closed，不做隐式转换）。
function normalizeTextField(value, failures, label, maxLength = MAX_TEXT_FIELD) {
  if (value == null || typeof value === 'boolean' || typeof value === 'object') {
    failures.push(label)
    return ''
  }
  const normalized = String(value).trim()
  if (!normalized || normalized.length > maxLength) failures.push(label)
  return normalized.slice(0, maxLength)
}

function normalizeRefList(value, failures, label, maxLength = MAX_ID_FIELD) {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    failures.push(label)
    return undefined
  }
  if (value.length > MAX_REF_LIST) {
    failures.push(label)
    return undefined
  }
  const refs = []
  for (const item of value) {
    if (item == null || typeof item === 'boolean' || typeof item === 'object') {
      failures.push(label)
      return undefined
    }
    const ref = String(item).trim()
    if (!ref || ref.length > maxLength) {
      failures.push(label)
      return undefined
    }
    refs.push(ref)
  }
  return refs
}

// 预算字段：只接受有限正数（typeof number）。NaN/Infinity/字符串/对象/
// 布尔一律 typed 拒绝，不静默回落最大预算。
function normalizeBudget(raw, failures) {
  const budget = {}
  for (const key of BUDGET_FIELDS) {
    const supplied = raw?.[key]
    if (supplied === undefined) {
      budget[key] = WRITING_SKILL_BUDGET_LIMITS[key]
      continue
    }
    if (typeof supplied !== 'number' || !Number.isFinite(supplied) || supplied <= 0) {
      failures.push(`budget.${key}`)
      continue
    }
    budget[key] = Math.min(Math.floor(supplied), WRITING_SKILL_BUDGET_LIMITS[key])
  }
  return budget
}

function validRange(range) {
  return Boolean(range) && typeof range === 'object' && !Array.isArray(range)
    && Number.isFinite(Number(range.startOffset))
    && Number.isFinite(Number(range.endOffset))
    && Number(range.startOffset) >= 0
    && Number(range.endOffset) > Number(range.startOffset)
    && Number.isInteger(Number(range.startOffset))
    && Number.isInteger(Number(range.endOffset))
}

function normalizeScope(raw, failures) {
  if (raw === undefined) return undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    failures.push('scope')
    return undefined
  }
  rejectUnknownFields(raw, SCOPE_FIELDS, 'scope.', failures)
  const scope = {}
  for (const key of ['projectId', 'documentRole', 'documentId', 'branchId']) {
    if (raw[key] === undefined) continue
    scope[key] = normalizeTextField(raw[key], failures, `scope.${key}`, MAX_ID_FIELD)
  }
  if (raw.chapterIds !== undefined) scope.chapterIds = normalizeRefList(raw.chapterIds, failures, 'scope.chapterIds')
  if (scope.projectId === '') failures.push('scope.projectId')
  return scope
}

function normalizeTarget(raw, failures) {
  if (raw === undefined) return undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    failures.push('target')
    return undefined
  }
  rejectUnknownFields(raw, TARGET_FIELDS, 'target.', failures)
  const target = {}
  for (const key of ['unitId', 'nodeId']) {
    if (raw[key] === undefined) continue
    target[key] = normalizeTextField(raw[key], failures, `target.${key}`, MAX_ID_FIELD)
  }
  for (const key of ['exactQuote', 'prefix', 'suffix']) {
    if (raw[key] === undefined) continue
    target[key] = normalizeTextField(raw[key], failures, `target.${key}`)
  }
  if (raw.range !== undefined) {
    if (!validRange(raw.range)) failures.push('target.range')
    else target.range = { startOffset: Number(raw.range.startOffset), endOffset: Number(raw.range.endOffset) }
  }
  return target
}

function normalizeRevisions(raw, failures) {
  if (raw === undefined) return undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    failures.push('revisions')
    return undefined
  }
  rejectUnknownFields(raw, REVISION_FIELDS, 'revisions.', failures)
  const revisions = {}
  for (const key of ['document', 'node', 'unit', 'style']) {
    if (raw[key] === undefined) continue
    revisions[key] = normalizeTextField(raw[key], failures, `revisions.${key}`, MAX_ID_FIELD)
  }
  if (raw.evidence !== undefined) {
    if (!raw.evidence || typeof raw.evidence !== 'object' || Array.isArray(raw.evidence)) {
      failures.push('revisions.evidence')
    } else {
      const entries = Object.entries(raw.evidence)
      if (entries.length > MAX_REF_LIST) {
        failures.push('revisions.evidence')
      } else {
        const evidence = {}
        for (const [ref, revision] of entries) {
          const normalizedRef = normalizeTextField(ref, failures, 'revisions.evidence', MAX_ID_FIELD)
          const normalizedRevision = normalizeTextField(revision, failures, 'revisions.evidence', MAX_ID_FIELD)
          if (!normalizedRef || !normalizedRevision) break
          evidence[normalizedRef] = normalizedRevision
        }
        if (!failures.some((item) => item.startsWith('revisions.evidence'))) revisions.evidence = evidence
      }
    }
  }
  return revisions
}

function normalizeConstraints(raw, failures) {
  if (raw === undefined) return undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    failures.push('constraints')
    return undefined
  }
  rejectUnknownFields(raw, CONSTRAINT_FIELDS, 'constraints.', failures)
  const constraints = {}
  if (raw.lockedRanges !== undefined) {
    if (!Array.isArray(raw.lockedRanges) || raw.lockedRanges.length > MAX_REF_LIST) {
      failures.push('constraints.lockedRanges')
    } else {
      const lockedRanges = []
      let invalid = false
      for (const range of raw.lockedRanges) {
        if (!range || typeof range !== 'object' || Array.isArray(range) || !validRange(range)) {
          invalid = true
          break
        }
        const nodeId = normalizeTextField(range.nodeId, failures, 'constraints.lockedRanges', MAX_ID_FIELD)
        if (!nodeId) {
          invalid = true
          break
        }
        lockedRanges.push({
          nodeId,
          startOffset: Number(range.startOffset),
          endOffset: Number(range.endOffset),
          ...(range.exact != null && typeof range.exact === 'string' && range.exact.trim()
            ? { exact: range.exact.trim().slice(0, MAX_TEXT_FIELD) }
            : {})
        })
      }
      if (invalid) failures.push('constraints.lockedRanges')
      else constraints.lockedRanges = lockedRanges
    }
  }
  if (raw.forbiddenChanges !== undefined) constraints.forbiddenChanges = normalizeRefList(raw.forbiddenChanges, failures, 'constraints.forbiddenChanges', MAX_TEXT_FIELD)
  for (const key of ['viewpointActorRef', 'storyCutoff']) {
    if (raw[key] === undefined) continue
    constraints[key] = normalizeTextField(raw[key], failures, `constraints.${key}`, MAX_ID_FIELD)
  }
  return constraints
}

// 资料清单与覆盖请求是闭合形状：manifest 只许 sourceRefs；coverage 只许
// sourceRefs/wholeBook。任何额外内容（如 instructions 之类的自由文本）都
// 会被 typed 拒绝，不可能搭车进入模型提示词。
function normalizeMaterialManifest(raw, failures) {
  if (raw === undefined) return undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    failures.push('materialManifest')
    return undefined
  }
  rejectUnknownFields(raw, ['sourceRefs'], 'materialManifest.', failures)
  const sourceRefs = normalizeRefList(raw.sourceRefs, failures, 'materialManifest.sourceRefs')
  if (sourceRefs === undefined) return undefined
  return { sourceRefs }
}

function normalizeRequestedCoverage(raw, failures) {
  if (raw === undefined) return undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    failures.push('requestedCoverage')
    return undefined
  }
  rejectUnknownFields(raw, ['sourceRefs', 'wholeBook'], 'requestedCoverage.', failures)
  const coverage = {}
  if (raw.sourceRefs !== undefined) {
    const sourceRefs = normalizeRefList(raw.sourceRefs, failures, 'requestedCoverage.sourceRefs')
    if (sourceRefs === undefined) return undefined
    coverage.sourceRefs = sourceRefs
  }
  if (raw.wholeBook !== undefined) {
    if (typeof raw.wholeBook !== 'boolean') {
      failures.push('requestedCoverage.wholeBook')
      return undefined
    }
    coverage.wholeBook = raw.wholeBook
  }
  return coverage
}

/**
 * 冻结输入（§5.2）白名单校验：未知顶层/嵌套字段、未知 taskKind/skill、
 * 超出方法白名单的只读能力、非法锁定区间、非数值预算一律拒绝，fail
 * closed。通过时返回的 invocation 是逐字段归一化的闭包对象——上游原始
 * 载荷的任何未列字段/自由内容都不会原样透传（服务端只把该归一化对象
 * 传给模型链）。
 */
export function validateWritingSkillInvocation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, reason: 'invocation-missing' }
  }
  const failures = []
  rejectUnknownFields(raw, INVOCATION_TOP_FIELDS, '', failures)

  const invocationId = normalizeTextField(raw.invocationId, failures, 'invocationId', MAX_ID_FIELD)
  const taskKind = typeof raw.taskKind === 'string' ? raw.taskKind.trim() : ''
  if (!WRITING_SKILL_TASK_KINDS.includes(taskKind)) failures.push('taskKind')
  const goal = typeof raw.goal === 'string' ? raw.goal.trim() : (raw.goal == null ? '' : '')
  if (typeof raw.goal !== 'string' || goal.length > 400) failures.push('goal')

  const resolved = resolveWritingSkillMethod(raw.skillId, raw.skillVersion)
  if (!resolved.ok) failures.push(`skill:${resolved.reason}`)
  else {
    const descriptionCheck = validateWritingSkillMethodDescription(resolved.method)
    if (!descriptionCheck.valid) failures.push(`skill-description:${descriptionCheck.reason}`)
    if (taskKind && methodSupportsTaskKind(resolved.method, taskKind) === false) {
      failures.push('skill:task-kind-mismatch')
    }
  }

  const scope = normalizeScope(raw.scope, failures)
  const target = normalizeTarget(raw.target, failures)
  const revisions = normalizeRevisions(raw.revisions, failures)
  const constraints = normalizeConstraints(raw.constraints, failures)

  if (taskKind && taskKind !== 'knowledge-query' && scope && !scope.projectId) {
    failures.push('scope.projectId')
  }

  const requested = raw.requestedReadonlyCapabilities
  if (requested !== undefined) {
    if (!Array.isArray(requested)) failures.push('requestedReadonlyCapabilities')
    else if (resolved.ok) {
      const allowed = new Set(resolved.method.allowedReadonlyCapabilities)
      if (requested.some((capability) => !allowed.has(String(capability)))) {
        failures.push('requestedReadonlyCapabilities:not-allowed')
      }
    }
  }

  const budget = normalizeBudget(raw.budget, failures)
  const materialManifest = normalizeMaterialManifest(raw.materialManifest, failures)
  const requestedCoverage = normalizeRequestedCoverage(raw.requestedCoverage, failures)

  if (failures.length) {
    return { valid: false, reason: failures[0], failures: failures.slice(0, 12) }
  }
  return {
    valid: true,
    reason: '',
    invocation: Object.freeze({
      invocationId,
      taskKind,
      skillId: resolved.method.id,
      skillVersion: resolved.method.version,
      goal: goal.slice(0, 400),
      scope: scope ?? undefined,
      target: target ?? undefined,
      revisions: revisions ?? undefined,
      constraints: constraints ?? undefined,
      materialManifest: materialManifest ?? undefined,
      budget,
      requestedCoverage: requestedCoverage ?? undefined,
      requestedReadonlyCapabilities: Array.isArray(requested)
        ? Object.freeze(requested.map((capability) => String(capability)))
        : Object.freeze([])
    })
  }
}

function methodSupportsTaskKind(method, taskKind) {
  if (taskKind === 'knowledge-query') return true
  return method.taskKind === taskKind
}

/**
 * 版本协商回执：服务端在响应 meta 里回带已接受的方法与 schema 版本，
 * 客户端据此发现静默降级或版本漂移（§5.1：前后端同一版本标识）。
 */
export const WRITING_SKILL_ENFORCEMENT_STATES = Object.freeze({
  APPLIED: 'applied',
  VALIDATED_ONLY: 'validated-only'
})

/**
 * 版本协商回执：服务端在响应 meta 里回带已接受的方法与 schema 版本。
 * enforcement 明示本次请求里方法到底有没有真正执行——'applied' 只在
 * 组合器/检查器真实进入该次模型链时回带（见 server/services/
 * writingSkillEnforcement.js），仅通过校验时是 'validated-only'，
 * 不允许出现「已确认、实际没执行」的静默降级。
 */
export function writingSkillAck(invocation, enforcement = WRITING_SKILL_ENFORCEMENT_STATES.VALIDATED_ONLY) {
  if (!invocation?.skillId) return null
  if (!Object.values(WRITING_SKILL_ENFORCEMENT_STATES).includes(enforcement)) return null
  return Object.freeze({
    schemaVersion: WRITING_SKILL_SCHEMA_VERSION,
    skillId: invocation.skillId,
    skillVersion: invocation.skillVersion,
    outputSchema: resolveWritingSkillMethod(invocation.skillId, invocation.skillVersion).method?.outputSchema ?? null,
    budget: invocation.budget ? Object.freeze({ ...invocation.budget }) : null,
    enforcement
  })
}
