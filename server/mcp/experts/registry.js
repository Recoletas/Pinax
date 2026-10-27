import fs from 'node:fs'
import path from 'node:path'
import { resolveAppData } from '../../services/localMirrorService.js'
import { resolveAskTask } from '../agentAsk.js'

// 批次 3：专家 = 纯数据配置（任务类型 + 上下文选择 + 提问模板 + 字数上限）。
// 没有 hooks / toolChain / 可执行代码：专家只是既有 advisor 任务的一种提问方式，
// 不新增执行器，也不改动 advisor。配置文件只从应用数据目录读取，不随项目文件夹走。
export const EXPERT_SCHEMA = 'pinax-experts@1'
export const EXPERT_FILE = 'experts.json'

const ID_PATTERN = /^[a-z][a-z0-9-]{1,40}$/
const CHAPTER_POLICIES = Object.freeze(['auto', 'last', 'none'])
const EXECUTABLE_FIELDS = Object.freeze(['hooks', 'toolChain', 'tools', 'kernelBuilder', 'knowledgeScope'])

export const BUILTIN_EXPERTS = Object.freeze([
  Object.freeze({
    id: 'polish-master',
    name: '润笔大师',
    role: '逐句打磨：删虚词、紧节奏，把抽象改成可感的动作与细节',
    taskType: 'authoring.review.chapter',
    prompt: [
      '请以润笔编辑的身份审读这一章，只谈文字本身。',
      '逐条给出：1) 可以删掉的虚词、重复与解释性旁白；2) 节奏拖沓或过快的段落；3) 三处最值得改写的句子，给出改前/改后对照。',
      '不要重写整章，不要改动情节与人物关系。'
    ].join('\n'),
    context: Object.freeze({ chapter: 'last', includeOutline: true, worldbookLimit: 4, worldbookNames: Object.freeze([]) }),
    maxChars: 24000
  }),
  Object.freeze({
    id: 'dramaturg',
    name: '编剧顾问',
    role: '看场面压力与走向：冲突是否升级、下一场戏该给什么',
    taskType: 'authoring.next-actions',
    prompt: [
      '请以编剧顾问的身份看这个项目的最新进展。',
      '回答：1) 当前这一章的压力来源与权力关系；2) 读者此刻最想弄清楚的三个问题；3) 接下来三场戏的建议，每场一句目标、一个阻力、一个转折，并按优先级排序。'
    ].join('\n'),
    context: Object.freeze({ chapter: 'last', includeOutline: false, worldbookLimit: 6, worldbookNames: Object.freeze([]) }),
    maxChars: 16000
  }),
  Object.freeze({
    id: 'senior-reader',
    name: '资深读者',
    role: '第一次读到的困惑与情绪：哪里出戏、哪里没接住',
    taskType: 'authoring.knowledge.query',
    prompt: [
      '请以一个只读过本书已发布部分的资深读者身份回答，不要用编辑口吻，也不要列写作技巧清单。',
      '以第一人称说明：1) 这一章哪里让我困惑或出戏；2) 哪一处情绪没有接住，为什么；3) 我还想不想读下去，最想翻回去确认什么。',
      '凡是指向正文的判断，都引用原文短句作为依据。'
    ].join('\n'),
    context: Object.freeze({ chapter: 'last', includeOutline: false, worldbookLimit: 6, worldbookNames: Object.freeze([]) }),
    maxChars: 28000
  })
])

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value, max) {
  const raw = typeof value === 'string' ? value.trim() : ''
  return raw.length > max ? raw.slice(0, max) : raw
}

/** 单个专家配置校验：失败项全部列出，不抛错；成功返回归一化后的 expert。 */
export function validateExpert(input) {
  const failures = []
  if (!isPlainObject(input)) {
    return { valid: false, failures: ['专家配置必须是对象'] }
  }
  const id = text(input.id, 40)
  if (!ID_PATTERN.test(id)) failures.push('id 须为小写字母开头的 2–41 位英文/数字/连字符')
  if (input.disabled === true) {
    return failures.length ? { valid: false, failures } : { valid: true, expert: { id, disabled: true } }
  }
  for (const field of EXECUTABLE_FIELDS) {
    if (input[field] !== undefined) failures.push(`${field} 不受支持：专家配置是纯数据，不执行 hooks/toolChain`)
  }
  const name = text(input.name, 40)
  if (!name) failures.push('name 不能为空')

  let taskType = null
  let profileMax = 0
  try {
    const resolved = resolveAskTask(input.taskType)
    taskType = resolved.taskType
    profileMax = Number(resolved.profile.maxChars) || 0
  } catch (error) {
    failures.push(error.message)
  }

  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  if (!prompt) failures.push('prompt 不能为空')
  if (prompt.length > 4000) failures.push('prompt 超过 4000 字')

  const rawContext = isPlainObject(input.context) ? input.context : {}
  const chapter = rawContext.chapter === undefined ? 'auto' : String(rawContext.chapter)
  if (!CHAPTER_POLICIES.includes(chapter)) failures.push(`context.chapter 只能是 ${CHAPTER_POLICIES.join(' / ')}`)
  const includeOutline = rawContext.includeOutline === undefined ? true : Boolean(rawContext.includeOutline)
  const worldbookLimit = rawContext.worldbookLimit === undefined
    ? 8
    : Number(rawContext.worldbookLimit)
  if (!Number.isInteger(worldbookLimit) || worldbookLimit < 0 || worldbookLimit > 24) {
    failures.push('context.worldbookLimit 须为 0–24 的整数')
  }
  const names = Array.isArray(rawContext.worldbookNames) ? rawContext.worldbookNames : []
  if (names.length > 12 || names.some((item) => typeof item !== 'string' || item.length > 60)) {
    failures.push('context.worldbookNames 最多 12 个、每个不超过 60 字')
  }

  const maxChars = input.maxChars === undefined ? (profileMax || 16000) : Number(input.maxChars)
  if (!Number.isInteger(maxChars) || maxChars < 2000) failures.push('maxChars 须为不小于 2000 的整数')
  if (profileMax && Number.isFinite(maxChars) && maxChars > profileMax) {
    failures.push(`maxChars 超过该任务的预算上限 ${profileMax}`)
  }

  if (failures.length) return { valid: false, failures }

  return {
    valid: true,
    expert: {
      id,
      name,
      role: text(input.role, 200),
      taskType,
      prompt,
      context: {
        chapter,
        includeOutline,
        worldbookLimit,
        worldbookNames: names.map((item) => String(item).trim()).filter(Boolean)
      },
      maxChars,
      builtin: false
    }
  }
}

function readConfigFile(file) {
  if (!fs.existsSync(file)) return { exists: false, entries: [], warnings: [] }
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (error) {
    return { exists: true, entries: [], warnings: [`${EXPERT_FILE}: 解析失败（${error.message}），本次只用内置专家`] }
  }
  const entries = Array.isArray(parsed?.experts) ? parsed.experts : []
  const warnings = []
  if (!Array.isArray(parsed?.experts)) warnings.push(`${EXPERT_FILE}: 缺少 experts 数组，本次只用内置专家`)
  if (parsed?.schema && parsed.schema !== EXPERT_SCHEMA) warnings.push(`${EXPERT_FILE}: schema ${parsed.schema} 与 ${EXPERT_SCHEMA} 不一致，按当前格式尽力读取`)
  return { exists: true, entries, warnings }
}

/** 内置 + 应用数据目录 experts.json 的合并结果；文件缺失不创建、不写入。 */
export function loadExperts({ appDataPath } = {}) {
  const dir = appDataPath || resolveAppData()
  const file = path.join(dir, EXPERT_FILE)
  const config = readConfigFile(file)
  const warnings = [...config.warnings]
  const byId = new Map(BUILTIN_EXPERTS.map((expert) => [expert.id, { ...expert, builtin: true }]))

  for (const entry of config.entries) {
    const label = isPlainObject(entry) ? (entry.id || '未命名') : '未命名'
    const validation = validateExpert(entry)
    if (!validation.valid) {
      warnings.push(`${label}: ${validation.failures.join('；')}`)
      continue
    }
    if (validation.expert.disabled) {
      if (byId.delete(validation.expert.id)) warnings.push(`已按配置停用专家 ${validation.expert.id}`)
      continue
    }
    if (!byId.has(validation.expert.id)) {
      warnings.push(`自定义专家 ${validation.expert.id} 不是内置专家，已作为扩展加入`)
    } else {
      warnings.push(`自定义专家 ${validation.expert.id} 覆盖内置定义`)
    }
    byId.set(validation.expert.id, { ...validation.expert, builtin: false })
  }

  return {
    schema: EXPERT_SCHEMA,
    file: config.exists ? file : null,
    warnings,
    experts: [...byId.values()]
  }
}

export function getExpert(id, options = {}) {
  const wanted = String(id || '').trim()
  if (!wanted) return { expert: null, warnings: ['缺少专家 id'] }
  const registry = loadExperts(options)
  return {
    expert: registry.experts.find((expert) => expert.id === wanted) || null,
    warnings: registry.warnings
  }
}

/** 提问模板 + 作者问题：模板没有 {question} 时把问题附在末尾。 */
export function composeExpertQuestion(expert, question) {
  const asked = String(question || '').trim().slice(0, 4000)
  const template = String(expert?.prompt || '').trim()
  if (!template) return asked
  if (template.includes('{question}')) return template.replaceAll('{question}', asked).trim()
  return asked ? `${template}\n\n作者的问题：${asked}` : template
}

/** 专家配置 → askAdvisor 的 options；调用方只能覆盖不改变专家身份的参数。 */
export function expertAskOptions(expert) {
  return {
    taskType: expert.taskType,
    chapterPolicy: expert.context.chapter,
    includeOutline: expert.context.includeOutline,
    worldbookLimit: expert.context.worldbookLimit,
    worldbookNames: expert.context.worldbookNames,
    maxChars: expert.maxChars
  }
}
