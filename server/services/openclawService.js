import WebSocket from 'ws'
import { existsSync, readFileSync, mkdirSync, writeFileSync, chmodSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import {
  randomUUID,
  generateKeyPairSync,
  createPublicKey,
  createPrivateKey,
  sign,
  createHash
} from 'crypto'

const AGENT_ID = process.env.OPENCLAW_AGENT_ID || 'main'
const GATEWAY_BASE_URL = process.env.OPENCLAW_BASE_URL || 'http://127.0.0.1:18789'
const OPENCLAW_TIMEOUT_MS = Number.isFinite(Number(process.env.OPENCLAW_TIMEOUT_MS))
  ? Math.max(5000, Math.floor(Number(process.env.OPENCLAW_TIMEOUT_MS)))
  : 45000
const DEVICE_IDENTITY_PATH = process.env.OPENCLAW_DEVICE_IDENTITY_PATH
  || join(homedir(), '.openclaw', 'identity', 'pinax-device.json')

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

import { validateServerTaskType } from './agentTaskAllowlist.js'
import { agentEnvelopeToPromptText } from '../../shared/agentContextContract.js'

export const OPENCLAW_PROVIDER = Object.freeze({
  id: 'openclaw',
  capabilities: ['text'],
  timeoutMs: OPENCLAW_TIMEOUT_MS
})

const ADVISOR_TASK_INSTRUCTIONS = {
  'authoring.rehearsal.step': '任务：在作者隔离的故事试演中，承接给定路径和最新行动，只演出一次具体回应。用人物对白与动作呈现，不写评审建议，不生成正式正文，不改设定。人物仅能依据已知信息行动；作者知道的秘密不等于人物知道。不得捏造引用、确定概率或强迫冲突升级。',
  'writing.fix.selection': '任务：修正选区文字。输出简洁可替换结果。',
  'writing.fix.paragraph': '任务：修正当前段落。输出简洁可替换段落。',
  'writing.close.thread': '任务：收束当前线索。给 1-2 个自然收束方式。',
  'writing.chapter.health': '任务：章节体检。输出 summary/issues/action，每段简洁。',
  'writing.continue.light': '任务：轻续一句。续写光标后的下一句正文，不要分析、解释、列建议或重复上文。',
  'materials.refine': '任务：精简当前素材。保留事实、人物动机和可复用信息，删除重复与空泛解释。',
  'materials.classify': '任务：判断所选素材的分类。只给分类建议与简短理由，不修改素材。',
  'materials.split': '任务：判断当前素材是否应拆分。给出最多四个拆分标题与边界，不直接写入。',
  'materials.relate': '任务：分析所选素材之间的因果、人物、地点或时间关系。只报告有依据的关系。',
  'canvas.organize': '任务：检查当前选中节点、直接邻居和可见视口的组织方式。不得假设未提供的节点。',
  'canvas.relate': '任务：分析当前选中节点与直接邻居之间值得建立或修改的关系。不得扫描整个画布。',
  'canvas.transition': '任务：检查选中镜头与直接邻居的转场，只修改上下文中已有节点之间的转场关系。',
  'experience.next-actions': '任务：基于当前对话、地点、历史、角色状态、精简记忆和未决线索生成玩家可选的下一步行动。不得替玩家选择。',
  'authoring.scene.directions': '任务：只根据冻结的场景压力与证据，生成二至三个会改变人物行动或信息处置的因果方向。不得续写正文，不得创造未知人物、地点、组织或规则。',
  'authoring.knowledge.query': '任务：只根据本次冻结且明确授权的项目证据回答作者问题。事实必须引用证据块给出的完整 sourceRef；资料不足就明确说明，不得补写看似合理的设定，也不得返回任何写入动作。',
  'experience.emergence': '任务：审阅当前已有涌现候选，指出最符合对话与地点历史的一项。不得创造新候选或直接修改世界状态。',
  'storyboard.review': '任务：检查当前镜头与前后镜头的动作、人物、空间、光线、景别、运镜和转场连续性。只提出必要的当前镜头字段修改。',
  'storyboard.video.prompt': '任务：为当前已确认分镜镜头准备一条视频生成提示词。只返回待确认请求，不提交媒体任务。'
}

// 服务端指令模板历史上按旧任务键维护；canonical 任务通过该映射复用同族模板。
const CANONICAL_TASK_TEMPLATE_KEYS = Object.freeze({
  'authoring.rewrite': 'writing.fix.selection',
  'authoring.review.selection': 'writing.close.thread',
  'authoring.review.chapter': 'writing.chapter.health',
  'authoring.complete.inline': 'writing.continue.light',
  'authoring.next-actions': 'experience.next-actions',
  'authoring.emergence': 'experience.emergence',
  // 统一创作命令链：九个 Authoring 命令全部可路由到既有同族模板。
  'authoring.continue': 'writing.continue.light',
  'authoring.advance': 'writing.continue.light',
  'authoring.simulate.character': 'writing.continue.light',
  'authoring.simulate.scene': 'writing.continue.light',
  'authoring.insert': 'writing.continue.light',
  'authoring.dialogue-options': 'experience.next-actions'
})

function resolveTaskTemplateKey(taskType) {
  return CANONICAL_TASK_TEMPLATE_KEYS[taskType] || taskType
}

function readGatewayTokenFromConfig() {
  try {
    const configPath = join(homedir(), '.openclaw', 'openclaw.json')
    if (!existsSync(configPath)) return ''
    const raw = JSON.parse(readFileSync(configPath, 'utf8'))
    const token = raw?.gateway?.auth?.token
    return typeof token === 'string' ? token.trim() : ''
  } catch {
    return ''
  }
}

function resolveGatewayToken() {
  return (process.env.OPENCLAW_GATEWAY_TOKEN || readGatewayTokenFromConfig() || '').trim()
}

function serializeContext(context) {
  if (typeof context === 'string') return context.trim()
  if (context == null) return ''

  if (typeof context === 'object' && context.version != null && Array.isArray(context.blocks)) {
    return agentEnvelopeToPromptText(context)
  }

  if (typeof context === 'object') {
    try {
      return JSON.stringify(context, null, 2)
    } catch {
      return String(context).trim()
    }
  }
  return String(context).trim()
}

function normalizeTaskType(taskType) {
  const validation = validateServerTaskType(taskType)
  if (!validation.valid) {
    const error = new Error('该 Agent 任务尚未接入执行器')
    error.code = validation.code
    throw error
  }
  return validation.taskType
}

function getTaskInstruction(taskType) {
  const instruction = ADVISOR_TASK_INSTRUCTIONS[resolveTaskTemplateKey(taskType)]
  if (!instruction) {
    const error = new Error(`Agent 任务缺少服务端指令：${taskType}`)
    error.code = 'AGENT_TASK_UNAVAILABLE'
    throw error
  }
  return instruction
}

function getTaskOutputInstruction(taskType, options = {}) {
  taskType = resolveTaskTemplateKey(taskType)
  if (taskType === 'writing.continue.light') {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown。格式：
{
  "task": "writing.continue.light",
  "mode": "replace",
  "summary": "续写一句",
  "replacement": "可直接插入光标处的一句正文",
  "issues": []
}
replacement 只能包含一句正文，不得包含 summary、issues、建议、序号或解释。`
  }

  if (taskType === 'writing.fix.selection'
    || taskType === 'writing.fix.paragraph'
    || taskType === 'materials.refine') {
    const candidateCount = Math.max(1, Math.min(3, Math.floor(Number(options.candidateCount) || 1)))
    if (candidateCount > 1 && taskType !== 'materials.refine') {
      if (options.multiBlock) {
        return `输出要求：只输出一个 JSON 对象，不要 Markdown、分析或思考过程。格式：
{
  "task": "${taskType}",
  "mode": "candidates",
  "summary": "一句话",
  "candidates": [
    {
      "id": "candidate-1",
      "label": "克制",
      "rationale": "一句话说明取舍",
      "patches": [
        { "nodeId": "必须与目标片段完全一致", "replacement": "完整替换该节点选中片段" }
      ]
    }
  ],
  "issues": []
}
最多返回 ${candidateCount} 个候选。每个候选必须对上下文列出的每个目标片段各返回一条 patch，nodeId 必须逐字一致且顺序一致；不得遗漏、合并、拆分或新增目标片段。replacement 只能是对应节点选中片段的完整替换文本，不得包含标题、序号、Markdown、解释或思考过程。每个候选必须对至少一个目标片段产生实际文字变化，不得原样复制；候选之间也不得重复。不得改写未列出的文字，不得编造上下文没有的事实。任一目标片段无法处理时，不要返回半套 patches。`
      }
      return `输出要求：只输出一个 JSON 对象，不要 Markdown。格式：
{
  "task": "${taskType}",
  "mode": "candidates",
  "summary": "一句话",
  "candidates": [
    { "id": "candidate-1", "label": "克制", "replacement": "完整替换文本", "rationale": "一句话说明取舍" }
  ],
  "issues": []
}
最多返回 ${candidateCount} 个候选。每个 replacement 都必须是完整替换文本，不能包含分析、标题、序号或 Markdown；每个 replacement 必须与目标原文产生实际文字变化，不得原样复制，且候选之间不得重复。候选之间只改变表达策略，不编造上下文没有的事实。必须直接处理上下文中标为“必须处理”的原文。`
    }
    return `输出要求：只输出一个 JSON 对象，不要 Markdown。格式：
{
  "task": "${taskType}",
  "mode": "replace",
  "summary": "一句话",
  "replacement": "完整替换文本",
  "issues": []
}
必须直接处理上下文中标为“必须处理”的原文。不得索要选区、段落或其他已提供内容；无法完成时也不得返回占位替换文本。`
  }

  if (taskType === 'writing.chapter.health' && options.chapterReview) {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown、分析或思考过程。格式：
{
  "task": "writing.chapter.health",
  "mode": "review",
  "summary": "一句话总结本批次",
  "findings": [
    {
      "kind": "proofing|consistency",
      "issueType": "typo|punctuation|quote|repetition|grammar|naming|time|number|scene-conflict",
      "severity": "low|medium|high",
      "reason": "指出具体、可核查的问题",
      "target": {
        "nodeId": "目标节点 ID",
        "startOffset": 0,
        "endOffset": 8,
        "exact": "必须与范围逐字一致的原文"
      },
      "replacement": "只替换 exact 的确定修正；没有唯一修法时必须为 null",
      "evidenceRefs": ["只能逐字使用上下文提供的 sourceRef"],
      "confidence": 0.9
    }
  ],
  "issues": []
}
只校对上下文列出的目标节点，结果按正文顺序返回。每条 finding 必须有真实 nodeId、有效局部 offset 和 exact 原文；无法精确定位就不要返回。proofing 只处理错别字、标点、异常引号、重复词、病句和明显语病；consistency 只处理有证据支持的称谓、时间、数值或当前场冲突。不得扩展成节奏、文风、情节结构评价，也不得冒充任何发布平台的审核规则。
规范中文引号必须保持外层“……”、嵌套‘……’，不要把正确的“外层‘内层’”当成错误。首行缩进是编辑器排版，不得在 replacement 前增删空格、制表符或全角空格。replacement 只能替换 exact，不能包含换行、标题、Markdown、解释或思考；没有唯一且确定的替换时返回 null。事实一致性 finding 的 evidenceRefs 必须来自上下文授权来源；不得返回 action 或直接修改正文。最多返回 8 条。`
  }

  if (taskType === 'materials.classify') {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown。格式：
{
  "summary": "一句话",
  "actions": [{
    "type": "material-classification",
    "label": "应用分类",
    "payload": {
      "changes": [{ "assetId": "必须来自上下文", "kind": "draft-prose|event|character-fact|worldbook-draft|inspiration|storyboard-seed|reference-image", "reason": "简短理由" }]
    }
  }]
}`
  }

  if (taskType === 'materials.split') {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown。格式：
{
  "summary": "一句话",
  "actions": [{
    "type": "material-split",
    "label": "拆分素材",
    "payload": {
      "sourceAssetId": "必须来自上下文",
      "parts": [{ "title": "短标题", "content": "完整可独立使用的内容", "kind": "合法素材分类" }]
    }
  }]
}
parts 为 2-4 项，不得编造上下文没有的事实。`
  }

  if (taskType === 'materials.relate') {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown。格式：
{
  "summary": "一句话",
  "actions": [{
    "type": "material-relations",
    "label": "写入关联",
    "payload": {
      "links": [{ "sourceId": "必须来自上下文", "targetId": "必须来自上下文且不同于 sourceId", "relation": "causes|character|place|time|supports", "reason": "简短依据" }]
    }
  }]
}`
  }

  if (taskType === 'canvas.organize') {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown。格式：
{
  "summary": "一句话",
  "actions": [{
    "type": "canvas-layout",
    "label": "应用局部整理",
    "payload": {
      "moves": [{ "cardId": "必须来自上下文", "x": 120, "y": 240, "reason": "简短理由" }]
    }
  }]
}
单个节点相对原位置最多移动 480 像素；不要移动牌堆节点。`
  }

  if (taskType === 'canvas.relate') {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown。格式：
{
  "summary": "一句话",
  "actions": [{
    "type": "canvas-relations",
    "label": "应用关系修改",
    "payload": {
      "changes": [{ "operation": "upsert|remove", "sourceId": "必须来自上下文", "targetId": "必须来自上下文", "edgeType": "continuation|elaboration|contrast|parallel|consciousness", "reason": "简短依据" }]
    }
  }]
}`
  }

  if (taskType === 'canvas.transition') {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown。格式：
{
  "summary": "一句话",
  "actions": [{
    "type": "canvas-transition",
    "label": "应用转场修改",
    "payload": {
      "changes": [{ "operation": "upsert|remove", "sourceId": "必须来自上下文", "targetId": "必须来自上下文", "edgeType": "jump_cut|dissolve|fade|contrast_montage|cross_cut|match_cut", "reason": "简短依据" }]
    }
  }]
}`
  }

  if (taskType === 'experience.next-actions') {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown。格式：
{
  "summary": "当前局势的一句话概括",
  "actions": [{
    "type": "runtime-candidate",
    "label": "审阅下一步选项",
    "payload": {
      "kind": "next-actions",
      "options": [{
        "id": "option-1",
        "label": "玩家可直接采取的行动",
        "intent": "行动意图",
        "risk": "可感知风险",
        "evidenceRefs": ["必须来自上下文 sourceRefs"]
      }]
    }
  }]
}
options 必须为 2-3 项，使用中文，不得替玩家决定，不得输出预设式万能选项。`
  }

  if (taskType === 'authoring.rehearsal.step') {
    return '只输出 JSON：{"response":"80-250字的具体动作/对白回应，不重复作者行动","change":"一句本次假想局面变化，80字以内","choices":["一个可试的具体行动","另一个可试的具体行动"],"evidenceRefs":["依据的原文 sourceRef"],"consequences":[]}'
      + ' response 最多600字符，choices 1-3条，每条最多80字符。仅引用上下文给出的 sourceRefs；回应是未采用的假想，不是正式事实。资料不足时明确描述不确定性，不假装角色已知秘密。不要输出 summary、replacement 或任何写入动作。'
      + ' consequences 是本步后果登记，协议最多2条，但每次只输出最明确的1条；没有就给空数组，只能登记问题中列出的事实与人物：'
      + ' 行动让某人确实得知已列出的事实时输出 {"kind":"knowledge","knowerRef":"人物ref","factKey":"事实标识","source":{"kind":"action或response","quote":"逐字原句"}}；'
      + ' 人物在回应中承诺/有条件承诺/拒绝/撤回时输出 {"kind":"commitment","promisorRef":"人物ref","beneficiaryRef":"人物ref或省略","state":"promised|conditioned|refused|withdrawn","content":"具体承诺","condition":"条件或省略","source":{"kind":"response","quote":"回应逐字原句"}}；更新既有承诺必须原样带上其 commitmentKey，新承诺不要编造 key。'
      + ' quote 必须逐字来自本次作者行动或 response 字段原文，choices 不属于回应原文、绝不能作为 quote；未列出的事实与人物 ref 一律不要登记。'
  }
  if (taskType === 'authoring.scene.directions') {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown。证据不足时输出：
{
  "status": "insufficient-evidence",
  "missing": ["缺少的事实"]
}
证据充分时输出：
{
  "status": "ready",
  "pressure": {
    "statement": "一句有真实取舍的场景压力",
    "evidenceRefs": ["只能使用上下文中的 sourceRefs"]
  },
  "directions": [{
    "id": "稳定短 ID",
    "title": "短标题",
    "action": "人物实际采取的行动或信息处置",
    "immediateGain": "一个眼前所得",
    "cost": "一个代价",
    "evidenceRefs": ["只能使用上下文中的 sourceRefs"],
    "entityRefs": ["只能使用压力投影允许的实体 ref"]
  }]
}
directions 只能为 2-3 条；不得只改变语气、文风或氛围；任意两条不得是同义行动；不得输出完整正文。`
  }

  if (taskType === 'authoring.knowledge.query') {
    const knowledgeIntent = String(options.knowledgeIntent || 'whole-book')
    const intentRule = ({
      setting: '查设定：分别说明世界书规则、正文表现和当前场状态，不把其中一种冒充另一种。',
      foreshadowing: '找伏笔：逐项区分已埋、已兑现、疑似和证据不足；大纲只代表作者意图。',
      calculation: '算数值：每个输入都要给授权来源，只输出由数字、+ - * / 和括号构成的 expression；宿主会重新计算，禁止心算后只报结论。',
      clues: '理线索：只排列已有事实、时间与因果；任何推断都明确写“推测”并降为 partial。',
      character: '挖角色：分别说明世界书设定、正文行为和当前场状态，不把速记当作人物事实。',
      'whole-book': '问全书：按章节或来源组织答案，引用每个结论实际依赖的原文。',
      free: '自由问：只提供一般写作建议，claims、evidenceRefs 和 calculations 必须为空。'
    })[knowledgeIntent] || '只回答当前问题，不扩展为正文生成或资料写入。'
    return `输出要求：只输出一个 JSON 对象，不要 Markdown、分析过程或写入动作。格式：
{
  "answer": "面向作者的简洁回答；资料不足时明确写当前资料中没有找到",
  "claims": [{
    "text": "一个可独立核查的结论",
    "confidence": "supported|partial|unsupported",
    "evidenceRefs": ["必须逐字来自证据块 sourceRef"]
  }],
  "missingInformation": ["资料缺少的具体部分"],
  "calculations": [{
    "label": "计算名称",
    "inputs": [{ "label": "输入名", "value": 0, "unit": "可选单位", "evidenceRefs": ["授权 sourceRef"] }],
    "expression": "只含数字、+ - * / 与括号的可复算算式",
    "result": "模型计算结果",
    "unit": "可选单位"
  }]
}
每个事实 claim 至少引用一条授权证据。大纲只证明作者意图，速记只证明作者建议，不能冒充正文已经发生；推测必须降为 partial 并在文字中标为推测。不得自行返回 excerpt、locator 或 revision，这些字段由宿主从冻结证据补齐。没有证据时 claims 返回空数组并填写 missingInformation。非数值问题 calculations 返回空数组。`
      + `\n本次模式：${intentRule}`
  }

  if (taskType === 'experience.emergence') {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown。格式：
{
  "summary": "为什么该候选与当前对话一致",
  "actions": [{
    "type": "runtime-candidate",
    "label": "审阅涌现候选",
    "payload": {
      "kind": "emergence-review",
      "candidateId": "必须是上下文中已有 candidate ID",
      "reason": "地点、历史、角色与对话依据",
      "evidenceRefs": ["必须来自上下文 sourceRefs"]
    }
  }]
}
没有已有候选时 actions 返回空数组；不得创造神秘使者、陌生角色、新地点或状态修改。`
  }

  if (taskType === 'storyboard.review') {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown。格式：
{
  "summary": "连续性问题的一句话结论",
  "actions": [{
    "type": "storyboard-shot-patch",
    "label": "应用镜头修正",
    "payload": {
      "shotId": "必须是当前镜头 ID",
      "changes": {
        "shotType": "wide|full|medium|close_up|extreme_close_up",
        "cameraMovement": "fixed|push|pull|pan|track|follow",
        "duration": 4,
        "visual": "修正后的视觉描述",
        "transition": "none|cut|dissolve|fade"
      },
      "reason": "前后镜头连续性依据",
      "evidenceRefs": ["必须来自上下文 sourceRefs"]
    }
  }]
}
changes 只保留确实需要修改的字段，不得新增、删除或重排镜头。`
  }

  if (taskType === 'storyboard.video.prompt') {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown。格式：
{
  "summary": "提示词准备说明",
  "actions": [{
    "type": "generation-request",
    "label": "确认视频提示词",
    "payload": {
      "kind": "storyboard-video",
      "shotId": "必须是当前镜头 ID",
      "versionId": "必须是当前分镜版本 ID",
      "prompt": "20-2000 字中文视频提示词，包含主体、动作、构图、运镜、前镜衔接和无字要求",
      "evidenceRefs": ["必须来自上下文 sourceRefs"]
    }
  }]
}
这里只准备请求，不能宣称任务已经提交或生成完成。`
  }

  return [
    '输出要求：',
    'summary',
    '一句话总结（<=40字）',
    '',
    'issues',
    '- 最多3条，每条一句',
    '',
    'action',
    '- 最多3条可执行动作'
  ].join('\n')
}

export function buildOpenClawUserMessage(context, question, taskMeta = {}) {
  const contextText = serializeContext(context)
  const questionText = String(question || '').trim()
  const taskType = normalizeTaskType(taskMeta.taskType)
  const targetText = serializeContext(taskMeta.target)
  const {
    providerConfig: _providerConfig,
    agentProvider: _agentProvider,
    fallbackProvider: _fallbackProvider,
    // Validation inputs are already serialized once in the authorized envelope.
    // Keep them server-side for result normalization, but never duplicate a full
    // chapter batch or its authorization catalog in the provider prompt.
    reviewBlocks: _reviewBlocks,
    allowedEvidenceRefs: _allowedEvidenceRefs,
    reviewSourceRevisions: _reviewSourceRevisions,
    // rehearsal 的后果校验原文（行动原文/授权 ref/factKey/承诺 key）只用于
    // 服务端归一化，不进入 provider prompt；后果清单由任务指令与问题承载。
    rehearsalVerification: _rehearsalVerification,
    // 写作 Skills 冻结输入只允许以组合后的方法指令进入 provider prompt
    // （经 writingSkillEnforcement）；原始/未归一化载荷一律不序列化。
    writingSkill: _writingSkill,
    ...promptOptions
  } = taskMeta.options || {}
  const optionsText = serializeContext(promptOptions)

  if (!contextText || !questionText) {
    throw new Error('缺少 context 或 question 参数')
  }

  return [
    `任务类型：${taskType}`,
    getTaskInstruction(taskType),
    getTaskOutputInstruction(taskType, promptOptions),
    targetText ? `目标文本/范围：\n${targetText}` : '',
    optionsText ? `任务选项：\n${optionsText}` : '',
    `当前创作上下文：\n${contextText}`,
    `用户的问题：${questionText}`
  ].filter(Boolean).join('\n\n')
}

function base64UrlEncode(inputBuffer) {
  return inputBuffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function derivePublicKeyRaw(publicKeyPem) {
  const key = createPublicKey(publicKeyPem)
  const spki = key.export({ type: 'spki', format: 'der' })
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32
    && spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length)
  }
  return spki
}

function buildDeviceId(publicKeyPem) {
  return createHash('sha256').update(derivePublicKeyRaw(publicKeyPem)).digest('hex')
}

function loadOrCreateDeviceIdentity(filePath = DEVICE_IDENTITY_PATH) {
  try {
    if (existsSync(filePath)) {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
      if (
        parsed?.version === 1
        && typeof parsed.deviceId === 'string'
        && typeof parsed.publicKeyPem === 'string'
        && typeof parsed.privateKeyPem === 'string'
      ) {
        return {
          deviceId: parsed.deviceId,
          publicKeyPem: parsed.publicKeyPem,
          privateKeyPem: parsed.privateKeyPem
        }
      }
    }
  } catch {
    // fall through
  }

  const pair = generateKeyPairSync('ed25519')
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const payload = {
    version: 1,
    deviceId: buildDeviceId(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
    createdAtMs: Date.now()
  }

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  try {
    chmodSync(filePath, 0o600)
  } catch {
    // best effort
  }

  return {
    deviceId: payload.deviceId,
    publicKeyPem: payload.publicKeyPem,
    privateKeyPem: payload.privateKeyPem
  }
}

function buildDeviceAuthPayload({ deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce }) {
  return [
    'v2',
    deviceId,
    clientId,
    clientMode,
    role,
    scopes.join(','),
    String(signedAtMs),
    token || '',
    nonce
  ].join('|')
}

function buildSignedDevice(challengeNonce, token, scopes) {
  const identity = loadOrCreateDeviceIdentity()
  const signedAt = Date.now()
  const payload = buildDeviceAuthPayload({
    deviceId: identity.deviceId,
    clientId: 'gateway-client',
    clientMode: 'backend',
    role: 'operator',
    scopes,
    signedAtMs: signedAt,
    token,
    nonce: challengeNonce
  })
  const signature = base64UrlEncode(sign(null, Buffer.from(payload, 'utf8'), createPrivateKey(identity.privateKeyPem)))
  return {
    id: identity.deviceId,
    publicKey: base64UrlEncode(derivePublicKeyRaw(identity.publicKeyPem)),
    signature,
    signedAt,
    nonce: challengeNonce
  }
}

function extractTextFromChatMessage(message) {
  if (!message || typeof message !== 'object') return ''

  if (typeof message.text === 'string') return message.text.trim()
  if (typeof message.content === 'string') return message.content.trim()

  if (Array.isArray(message.content)) {
    const text = message.content
      .map((item) => (item && typeof item === 'object' && typeof item.text === 'string' ? item.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim()
    if (text) return text
  }

  return ''
}

function extractTextFromHistoryMessages(messages) {
  if (!Array.isArray(messages)) return ''

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i]
    if (!item || typeof item !== 'object') continue
    if (item.role !== 'assistant') continue

    if (typeof item.text === 'string' && item.text.trim()) {
      return item.text.trim()
    }

    if (typeof item.content === 'string' && item.content.trim()) {
      return item.content.trim()
    }

    if (Array.isArray(item.content)) {
      const text = item.content
        .map((part) => (part && typeof part === 'object' && typeof part.text === 'string' ? part.text : ''))
        .filter(Boolean)
        .join('\n')
        .trim()
      if (text) return text
    }
  }

  return ''
}

export async function getAdvice(context, question, taskMeta = {}) {
  const token = resolveGatewayToken()
  if (!token) {
    throw new Error('缺少 OPENCLAW_GATEWAY_TOKEN，请先配置网关 Token')
  }

  const userMessage = buildOpenClawUserMessage(context, question, taskMeta)

  const wsUrl = GATEWAY_BASE_URL.replace(/^http/, 'ws').replace(/\/$/, '')
  const connectId = randomUUID()
  const sendId = randomUUID()
  const historyId = randomUUID()
  const requestId = randomUUID()
  const idempotencyKey = `pinax_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  const sessionKey = `agent:${AGENT_ID}:pinax:${requestId}`

  return new Promise((resolve, reject) => {
    let settled = false
    let runId = ''
    let waitingHistory = false

    const ws = new WebSocket(wsUrl, {
      perMessageDeflate: false,
      headers: { 'User-Agent': 'Pinax-OpenClaw-Client/1.0.0' }
    })

    const done = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(value)
      ws.close(1000, 'done')
    }

    const fail = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error instanceof Error ? error : new Error(String(error)))
      ws.close(1008, 'error')
    }

    const timeout = setTimeout(() => {
      fail(new Error(`OpenClaw Gateway 调用超时（${Math.floor(OPENCLAW_TIMEOUT_MS / 1000)}秒）`))
    }, OPENCLAW_TIMEOUT_MS)

    ws.on('message', (data) => {
      let message
      try {
        message = JSON.parse(data.toString())
      } catch {
        return
      }

      if (message.type === 'event' && message.event === 'connect.challenge') {
        const nonce = message.payload?.nonce
        if (!nonce || typeof nonce !== 'string') {
          fail(new Error('gateway connect challenge missing nonce'))
          return
        }

        const scopes = ['operator.read', 'operator.write']
        ws.send(JSON.stringify({
          type: 'req',
          id: connectId,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: 'gateway-client',
              version: '1.0.0',
              platform: 'linux',
              mode: 'backend'
            },
            role: 'operator',
            scopes,
            caps: [],
            commands: [],
            permissions: {},
            auth: { token },
            device: buildSignedDevice(nonce, token, scopes)
          }
        }))
        return
      }

      if (message.type === 'res' && message.id === connectId) {
        if (!message.ok || message.payload?.type !== 'hello-ok') {
          fail(new Error(`connect failed: ${message.error?.message || message.error || 'unknown error'}`))
          return
        }

        ws.send(JSON.stringify({
          type: 'req',
          id: sendId,
          method: 'chat.send',
          params: {
            sessionKey,
            message: userMessage,
            idempotencyKey,
            timeoutMs: OPENCLAW_TIMEOUT_MS
          }
        }))
        return
      }

      if (message.type === 'res' && message.id === sendId) {
        if (!message.ok) {
          fail(new Error(`chat.send failed: ${message.error?.message || message.error || 'unknown error'}`))
          return
        }
        runId = typeof message.payload?.runId === 'string' ? message.payload.runId : runId
        return
      }

      if (message.type === 'res' && message.id === historyId) {
        if (!message.ok) {
          fail(new Error(`chat.history failed: ${message.error?.message || message.error || 'unknown error'}`))
          return
        }

        const content = extractTextFromHistoryMessages(message.payload?.messages)
        if (!content) {
          fail(new Error('OpenClaw 返回空内容'))
          return
        }
        done(content)
        return
      }

      if (message.type === 'event' && message.event === 'chat') {
        const payload = message.payload || {}
        if (runId && payload.runId && payload.runId !== runId) return

        if (payload.state === 'error') {
          fail(new Error(`chat error: ${payload.errorMessage || 'unknown error'}`))
          return
        }

        if (payload.state !== 'final') return

        const content = extractTextFromChatMessage(payload.message)
        if (!content) {
          if (!waitingHistory) {
            waitingHistory = true
            ws.send(JSON.stringify({
              type: 'req',
              id: historyId,
              method: 'chat.history',
              params: {
                sessionKey,
                limit: 20
              }
            }))
          }
          return
        }

        done(content)
      }
    })

    ws.on('error', (error) => {
      fail(new Error(`WebSocket error: ${error.message}`))
    })

    ws.on('close', (code, reason) => {
      if (!settled && code !== 1000) {
        fail(new Error(`WebSocket closed: ${reason?.toString() || code}`))
      }
    })
  })
}
