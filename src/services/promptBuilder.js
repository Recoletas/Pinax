/**
 * promptBuilder - 提示词构建服务
 *
 * 职责：
 * - 集中管理所有提示词模板
 * - 支持 Layer 0~4 组装
 * - 动态注入世界书、角色、风格等上下文
 * - 支持 Author's Note 注入
 * - 支持叙事约束和 Few-shot 示例
 */

// 提示词层定义
const LAYERS = {
  CONSTRAINT: 0,  // 硬性约束（Layer 0）
  SYSTEM: 1,      // 系统角色定义（Layer 1）
  WORLD: 2,       // 世界观/设定（Layer 2）
  CONTEXT: 3,     // 上下文/历史（Layer 3）
  TASK: 4         // 具体任务/指令（Layer 4）
}

// 叙事风格预设
const NARRATIVE_STYLES = {
  literary: {
    name: '文学性',
    description: '注重文字美感，描写细腻，节奏舒缓',
    instruction: '请使用文学性语言，注重意象和氛围营造，句子可以稍长，节奏舒缓。'
  },
  webnovel: {
    name: '网文风',
    description: '节奏明快，对话多，情节紧凑',
    instruction: '请使用网文风格，节奏明快，多用对话推进情节，段落简短，悬念感强。'
  },
  concise: {
    name: '简洁白描',
    description: '文字简练，点到为止，留白多',
    instruction: '请使用简洁的白描手法，文字简练，避免过多修饰，点到为止。'
  },
  dramatic: {
    name: '戏剧性',
    description: '冲突强烈，情绪张力大，转折多',
    instruction: '请增强戏剧性，制造冲突和转折，情绪张力要强，悬念感要足。'
  }
}

// 系统角色模板
const SYSTEM_TEMPLATES = {
  narrator: {
    role: '你是一个小说叙述者',
    instruction: '请用生动的语言描述场景并与读者互动。使用第三人称叙事，混合适当的对话。用 *动作* 格式描述动作，用 "对话" 格式描述对话。'
  },
  copilot: {
    role: '你是一个小说续写助手',
    instruction: '根据用户提供的上下文续写接下来的内容，保持风格一致。用 *动作* 格式描述动作，用 "对话" 格式描述对话。'
  },
  worldbookBuilder: {
    role: '你是一个世界书构建助手',
    instruction: '从文本中提取角色、地点、物品、事件等设定，输出结构化JSON。'
  },
  analyzer: {
    role: '你是一个小说分析师',
    instruction: '分析文本中的情节、人物、主题等元素，提供专业建议。'
  },
  roleplay: {
    role: '你正在扮演指定角色',
    instruction: '以第一人称视角直接与用户对话。用 *动作* 格式描述动作，用 "对话" 格式描述对话，用 （心理） 格式描述心理活动。不要以旁白身份说话。'
  }
}

// 场景类型
const SCENE_TYPES = {
  combat: '战斗场景',
  exploration: '探索场景',
  dialogue: '对话场景',
  rest: '休息场景',
  travel: '旅行场景'
}

// Few-shot 示例库
const FEW_SHOT_EXAMPLES = {
  combat: [
    {
      input: '艾伦与森林中的狼群对峙',
      output: '*艾伦握紧手中的短剑，目光锁定着狼群的首领。* "来吧，让我看看你有多大的本事。" *狼王低吼一声，后腿猛然发力，如离弦之箭般扑来。*'
    }
  ],
  exploration: [
    {
      input: '艾伦推开废弃城堡的大门',
      output: '*生锈的铰链发出刺耳的呻吟，厚重的木门缓缓开启，扬起一片灰尘。* 阳光透过裂缝洒入，照亮了空旷的大厅。*空气中弥漫着腐朽的气息，角落里似乎有什么东西在移动。*'
    }
  ],
  dialogue: [
    {
      input: '商人与艾伦讨价还价',
      output: '"这把匕首，五个银币，不能再少了。"*商人眯起眼睛，手指在柜台上轻轻敲击。* "年轻人，我也要吃饭的。"*艾伦沉默片刻，从怀中掏出四枚银币放在柜台上。* "四个，外加一个承诺——下次有好货，先给我看。"'
    }
  ],
  rest: [
    {
      input: '艾伦在篝火旁休息',
      output: '*火焰跳动着，在艾伦疲惫的脸上投下摇曳的光影。* 他靠在树干上，闭上眼睛，听着远处传来的虫鸣。*（终于可以休息了...明天还要赶路。）*'
    }
  ]
}

/**
 * 构建叙事约束（Layer 0）
 * @param {object} constraints - 约束条件
 * @returns {string} 约束提示词
 */
export function buildNarrativeConstraints(constraints = {}) {
  const {
    currentPeriod,
    currentScene,
    latestActivity,
    strictMode = true
  } = constraints

  const parts = ['【硬性约束 - 违反将导致输出被拒绝】']

  if (currentPeriod) {
    parts.push(`1. 时间约束：当前时间为「${currentPeriod}」，不得在叙事中使用其他时间词汇。`)
  }
  if (currentScene) {
    parts.push(`2. 地点约束：当前位置为「${currentScene}」，不得描述前往其他地点或否认当前位置。`)
  }
  if (latestActivity) {
    parts.push(`3. 活动约束：「${latestActivity}」已记录为重要活动，必须在叙事中自然衔接。`)
  }
  parts.push('4. 角色约束：不得替用户做出未输入的决策或行动。')
  parts.push('5. 世界书约束：注入的世界书条目内容必须遵守，不得与之矛盾。')

  if (strictMode) {
    parts.push('')
    parts.push('【违规示例 - 严禁出现】')
    parts.push('❌ "当清晨的阳光洒进..." （违反时间约束）')
    parts.push('❌ "艾伦决定返回酒馆..." （违反地点约束）')
  }

  return parts.join('\n')
}

/**
 * 构建 Author's Note
 * @param {object} context - 上下文信息
 * @returns {string} Author's Note
 */
export function buildAuthorsNote(context = {}) {
  const {
    period,
    scene,
    activity,
    mood,
    weather,
    narrativeStyle = 'literary'
  } = context

  const styleConfig = NARRATIVE_STYLES[narrativeStyle] || NARRATIVE_STYLES.literary

  const parts = ['[Author\'s Note - 叙事锚定点]']

  if (period) parts.push(`时间：${period}`)
  if (scene) parts.push(`地点：${scene}`)
  if (activity) parts.push(`当前活动：${activity}`)
  if (mood) parts.push(`心境：${mood}`)
  if (weather) parts.push(`天气：${weather}`)

  parts.push(`叙事风格：${styleConfig.name}`)

  return parts.join('\n')
}

/**
 * 构建 Few-shot 示例
 * @param {string} sceneType - 场景类型
 * @param {number} count - 示例数量
 * @returns {string} Few-shot 示例
 */
export function buildFewShotExamples(sceneType = 'dialogue', count = 2) {
  const examples = FEW_SHOT_EXAMPLES[sceneType] || FEW_SHOT_EXAMPLES.dialogue
  const selected = examples.slice(0, count)

  if (selected.length === 0) return ''

  const parts = ['【叙事示例】']

  for (const example of selected) {
    parts.push('')
    parts.push(`输入：${example.input}`)
    parts.push(`输出：${example.output}`)
  }

  return parts.join('\n')
}

/**
 * 构建系统提示词
 * @param {string} templateKey - 模板键名
 * @param {object} options - 选项
 * @returns {string} 系统提示词
 */
export function buildSystemPrompt(templateKey = 'narrator', options = {}) {
  const template = SYSTEM_TEMPLATES[templateKey] || SYSTEM_TEMPLATES.narrator
  const { style = 'literary', customInstructions = [] } = options

  const styleConfig = NARRATIVE_STYLES[style] || NARRATIVE_STYLES.literary

  const parts = [
    `${template.role}。`,
    template.instruction,
    '',
    `风格要求：${styleConfig.name}（${styleConfig.description}）`,
    styleConfig.instruction
  ]

  if (customInstructions.length > 0) {
    parts.push('', '额外要求：', ...customInstructions.map(i => `- ${i}`))
  }

  return parts.join('\n')
}

/**
 * 构建世界书注入提示词
 * @param {Array} entries - 世界书条目
 * @param {object} worldbookInfo - 世界书基本信息
 * @returns {string} 世界书提示词
 */
export function buildWorldBookPrompt(entries = [], worldbookInfo = {}) {
  if (!entries || entries.length === 0) return ''

  const parts = []

  // 世界书基本信息
  if (worldbookInfo.name) {
    parts.push(`【世界书：${worldbookInfo.name}】`)
  }
  if (worldbookInfo.description) {
    parts.push(`世界观背景：${worldbookInfo.description}`)
    parts.push('')
  }

  parts.push('以下是世界书中的关键设定，必须在叙事中严格遵循：')
  parts.push('')

  // 条目列表
  for (const entry of entries) {
    const name = entry.name || '未命名'
    const type = entry.type || 'general'
    const content = entry.content || ''
    parts.push(`◆ 【${name}】(${type})`)
    parts.push(`  ${content}`)
    parts.push('')
  }

  parts.push('⚠️ 重要约束：')
  parts.push('1. 上述设定中的名称、特征、关系必须保持一致')
  parts.push('2. 不得创造与设定矛盾的情节')
  parts.push('3. 涉及设定内容时，确保符合描述')

  return parts.join('\n')
}

/**
 * 构建角色信息提示词
 * @param {object} character - 角色信息
 * @returns {string} 角色提示词
 */
export function buildCharacterPrompt(character = {}) {
  if (!character || !character.name) return ''

  const parts = [`【当前角色：${character.name}】`]

  if (character.description) {
    parts.push(`描述：${character.description}`)
  }
  if (character.traits && character.traits.length > 0) {
    parts.push(`性格特点：${character.traits.join('、')}`)
  }
  if (character.goal) {
    parts.push(`目标：${character.goal}`)
  }
  if (character.mood) {
    parts.push(`当前心情：${character.mood}`)
  }

  return parts.join('\n')
}

/**
 * 构建上下文窗口提示词
 * @param {string} text - 文本
 * @param {number} cursorPos - 光标位置
 * @param {object} options - 选项
 * @returns {string} 上下文提示词
 */
export function buildContextPrompt(text, cursorPos, options = {}) {
  const { upstream = 1500, downstream = 500 } = options

  if (!text) return ''

  // 如果文本较短，直接返回
  if (text.length < 2000) {
    return text
  }

  // 截取上下文窗口
  const upstreamText = text.slice(Math.max(0, cursorPos - upstream), cursorPos)
  const downstreamText = text.slice(cursorPos, cursorPos + downstream)

  // 段落对齐
  const paragraphBoundary = upstreamText.lastIndexOf('\n\n')
  const trimmedUpstream = paragraphBoundary !== -1
    ? upstreamText.slice(paragraphBoundary + 2)
    : upstreamText

  return trimmedUpstream + downstreamText
}

/**
 * 构建完整提示词序列
 * @param {object} config - 配置
 * @returns {Array} 消息序列
 */
export function buildPromptSequence(config = {}) {
  const {
    templateKey = 'narrator',
    style = 'literary',
    worldBookEntries = [],
    worldbookInfo = {},
    character = {},
    context = '',
    task = '',
    customInstructions = [],
    // 新增参数
    constraints = {},
    authorsNote = {},
    sceneType = 'dialogue',
    includeFewShot = false
  } = config

  const messages = []

  // Layer 0: 硬性约束
  if (constraints.currentPeriod || constraints.currentScene || constraints.latestActivity) {
    const constraintPrompt = buildNarrativeConstraints(constraints)
    messages.push({ role: 'system', content: constraintPrompt })
  }

  // Layer 1: 系统角色
  const systemPrompt = buildSystemPrompt(templateKey, { style, customInstructions })
  messages.push({ role: 'system', content: systemPrompt })

  // Layer 2: 世界书
  if (worldBookEntries.length > 0) {
    const worldBookPrompt = buildWorldBookPrompt(worldBookEntries, worldbookInfo)
    if (worldBookPrompt) {
      messages.push({ role: 'system', content: worldBookPrompt })
    }
  }

  // Layer 2.5: 角色信息
  if (character && character.name) {
    const characterPrompt = buildCharacterPrompt(character)
    if (characterPrompt) {
      messages.push({ role: 'system', content: characterPrompt })
    }
  }

  // Layer 3: Author's Note（插入到历史倒数第3轮的位置需要在调用方处理）
  if (authorsNote.period || authorsNote.scene) {
    const note = buildAuthorsNote({ ...authorsNote, narrativeStyle: style })
    messages.push({ role: 'system', content: note })
  }

  // Layer 3.5: Few-shot 示例
  if (includeFewShot) {
    const fewShot = buildFewShotExamples(sceneType, 2)
    if (fewShot) {
      messages.push({ role: 'user', content: fewShot })
    }
  }

  // Layer 3: 上下文
  if (context) {
    messages.push({ role: 'user', content: `上下文：\n${context}` })
  }

  // Layer 4: 任务
  if (task) {
    messages.push({ role: 'user', content: task })
  }

  return messages
}

/**
 * 构建小说体验专用提示词序列
 * @param {object} gameState - 游戏状态
 * @param {object} options - 选项
 * @returns {Array} 消息序列
 */
export function buildNovelExperiencePrompt(gameState = {}, options = {}) {
  const {
    period,
    scene,
    activity,
    mood,
    weather,
    worldBookEntries = [],
    character = {},
    history = []
  } = gameState

  const {
    style = 'literary',
    sceneType = 'dialogue',
    userInput = ''
  } = options

  // 构建约束
  const constraints = {
    currentPeriod: period,
    currentScene: scene,
    latestActivity: activity
  }

  // 构建 Author's Note
  const authorsNote = {
    period,
    scene,
    activity,
    mood,
    weather
  }

  return buildPromptSequence({
    templateKey: 'narrator',
    style,
    worldBookEntries,
    character,
    constraints,
    authorsNote,
    sceneType,
    includeFewShot: true,
    context: history.slice(-5).map(h => h.content).join('\n'),
    task: userInput
  })
}

/**
 * 获取可用风格列表
 * @returns {Array} 风格列表
 */
export function getAvailableStyles() {
  return Object.entries(NARRATIVE_STYLES).map(([key, config]) => ({
    value: key,
    label: config.name,
    description: config.description
  }))
}

/**
 * 获取可用模板列表
 * @returns {Array} 模板列表
 */
export function getAvailableTemplates() {
  return Object.entries(SYSTEM_TEMPLATES).map(([key, config]) => ({
    value: key,
    role: config.role
  }))
}

export default {
  buildSystemPrompt,
  buildWorldBookPrompt,
  buildCharacterPrompt,
  buildContextPrompt,
  buildPromptSequence,
  buildNarrativeConstraints,
  buildAuthorsNote,
  buildFewShotExamples,
  buildNovelExperiencePrompt,
  getAvailableStyles,
  getAvailableTemplates,
  LAYERS,
  NARRATIVE_STYLES,
  SYSTEM_TEMPLATES,
  SCENE_TYPES,
  FEW_SHOT_EXAMPLES
}
