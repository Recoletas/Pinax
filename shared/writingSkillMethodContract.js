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

function clampBudgetValue(raw, limit) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return limit
  return Math.min(Math.floor(value), limit)
}

function normalizeBudget(raw, failures) {
  const budget = {}
  for (const key of BUDGET_FIELDS) {
    const supplied = raw?.[key]
    if (supplied === undefined) {
      budget[key] = WRITING_SKILL_BUDGET_LIMITS[key]
      continue
    }
    if (supplied === null || typeof supplied === 'boolean' || Number(supplied) <= 0) {
      failures.push(`budget.${key}`)
      budget[key] = WRITING_SKILL_BUDGET_LIMITS[key]
      continue
    }
    budget[key] = clampBudgetValue(supplied, WRITING_SKILL_BUDGET_LIMITS[key])
  }
  return budget
}

function validRange(range) {
  return Boolean(range)
    && Number.isFinite(Number(range.startOffset))
    && Number.isFinite(Number(range.endOffset))
    && Number(range.endOffset) > Number(range.startOffset)
    && Number(range.startOffset) >= 0
}

/**
 * 冻结输入（§5.2）白名单校验：未知顶层/嵌套字段、未知 taskKind/skill、
 * 超出方法白名单的只读能力、非法锁定区间一律拒绝，fail closed。
 * 通过时返回 normalized invocation（budget 已顶格收敛），原样幂等。
 */
export function validateWritingSkillInvocation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, reason: 'invocation-missing' }
  }
  const failures = []
  rejectUnknownFields(raw, INVOCATION_TOP_FIELDS, '', failures)

  const invocationId = String(raw.invocationId ?? '').trim()
  if (!invocationId || invocationId.length > 120) failures.push('invocationId')

  const taskKind = String(raw.taskKind ?? '').trim()
  if (!WRITING_SKILL_TASK_KINDS.includes(taskKind)) failures.push('taskKind')

  const goal = String(raw.goal ?? '').trim()
  if (goal.length > 400) failures.push('goal')

  const resolved = resolveWritingSkillMethod(raw.skillId, raw.skillVersion)
  if (!resolved.ok) failures.push(`skill:${resolved.reason}`)
  else {
    const descriptionCheck = validateWritingSkillMethodDescription(resolved.method)
    if (!descriptionCheck.valid) failures.push(`skill-description:${descriptionCheck.reason}`)
    if (taskKind && methodSupportsTaskKind(resolved.method, taskKind) === false) {
      failures.push('skill:task-kind-mismatch')
    }
  }

  for (const [field, allowed] of [
    ['scope', SCOPE_FIELDS],
    ['target', TARGET_FIELDS],
    ['revisions', REVISION_FIELDS],
    ['constraints', CONSTRAINT_FIELDS]
  ]) {
    if (raw[field] === undefined) continue
    if (!raw[field] || typeof raw[field] !== 'object' || Array.isArray(raw[field])) {
      failures.push(field)
      continue
    }
    rejectUnknownFields(raw[field], allowed, `${field}.`, failures)
  }

  const scope = raw.scope && typeof raw.scope === 'object' ? raw.scope : {}
  if (taskKind && taskKind !== 'knowledge-query' && !String(scope.projectId ?? '').trim()) {
    failures.push('scope.projectId')
  }
  if (Array.isArray(scope.chapterIds) && scope.chapterIds.some((id) => !String(id ?? '').trim())) {
    failures.push('scope.chapterIds')
  }

  const target = raw.target && typeof raw.target === 'object' ? raw.target : null
  if (target?.range != null && !validRange(target.range)) failures.push('target.range')
  if (target?.exactQuote != null && !String(target.exactQuote).trim()) failures.push('target.exactQuote')

  const constraints = raw.constraints && typeof raw.constraints === 'object' ? raw.constraints : {}
  if (constraints.lockedRanges !== undefined) {
    if (!Array.isArray(constraints.lockedRanges)) failures.push('constraints.lockedRanges')
    else if (constraints.lockedRanges.some((range) => (
      !range || !String(range.nodeId ?? '').trim() || !validRange(range)
    ))) failures.push('constraints.lockedRanges')
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

  if (failures.length) {
    return { valid: false, reason: failures[0], failures: failures.slice(0, 12) }
  }
  return {
    valid: true,
    reason: '',
    invocation: Object.freeze({
      invocationId,
      taskKind,
      skillId: String(raw.skillId).trim(),
      skillVersion: resolved.method.version,
      goal,
      scope: clonePlain(raw.scope),
      target: clonePlain(raw.target),
      revisions: clonePlain(raw.revisions),
      constraints: clonePlain(constraints),
      materialManifest: clonePlain(raw.materialManifest) ?? null,
      budget,
      requestedCoverage: clonePlain(raw.requestedCoverage) ?? null,
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

function clonePlain(value) {
  if (value == null) return undefined
  return JSON.parse(JSON.stringify(value))
}

/**
 * 版本协商回执：服务端在响应 meta 里回带已接受的方法与 schema 版本，
 * 客户端据此发现静默降级或版本漂移（§5.1：前后端同一版本标识）。
 */
export function writingSkillAck(invocation) {
  if (!invocation?.skillId) return null
  return Object.freeze({
    schemaVersion: WRITING_SKILL_SCHEMA_VERSION,
    skillId: invocation.skillId,
    skillVersion: invocation.skillVersion,
    outputSchema: resolveWritingSkillMethod(invocation.skillId, invocation.skillVersion).method?.outputSchema ?? null,
    budget: invocation.budget ? Object.freeze({ ...invocation.budget }) : null
  })
}
