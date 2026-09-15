// 叙事状态提取的纯解析（B12）：从模型回应文本解析可观察状态变化。
// 每个解析器输入原文 + 当前只读状态，返回新值或 null（无变化）；
// 不读 store、不写存储。legacy heuristic：这是面向中文叙事的正则启发式，
// 不是正式结构化合同；单类解析失败由流水线隔离，不静默吞掉。

// 时间推进解析（原 extractTimeChanges 解析段，逐字保持规则）。
// 返回新的 writingTime 对象，或 null 表示无变化。
export function parseWritingTimeChange(content, currentWritingTime = {}) {
  const currentTime = { ...currentWritingTime }
  let updated = false

  // 检测"次日"、"第二天"等日期推进
  if (/次日|第二天|翌日|隔天/.test(content)) {
    const currentDay = parseInt(currentTime.day) || 1
    currentTime.day = String(currentDay + 1)
    updated = true
  }

  // 检测完整日期格式：X年X月X日（最优先）
  const fullDateMatch = content.match(/(\d{1,4})年(\d{1,2})月(\d{1,2})日/)
  if (fullDateMatch) {
    const year = fullDateMatch[1]
    const month = fullDateMatch[2]
    const day = fullDateMatch[3]

    if (parseInt(year) > 0 && parseInt(year) < 10000) {
      currentTime.year = year
      updated = true
    }
    if (parseInt(month) >= 1 && parseInt(month) <= 12) {
      currentTime.month = month
      updated = true
    }
    if (parseInt(day) >= 1 && parseInt(day) <= 31) {
      currentTime.day = day
      updated = true
    }
  } else {
    // 单独检测年份（避免匹配年龄）
    const yearMatch = content.match(/(\d{2,4})年(?!纪|代|龄)/)
    if (yearMatch && yearMatch[1]) {
      const year = yearMatch[1]
      if (year !== currentTime.year && parseInt(year) > 0 && parseInt(year) < 10000) {
        currentTime.year = year
        updated = true
      }
    }

    // 单独检测月份
    const monthMatch = content.match(/(\d{1,2})月/)
    if (monthMatch && monthMatch[1]) {
      const month = parseInt(monthMatch[1])
      if (month >= 1 && month <= 12 && String(month) !== currentTime.month) {
        currentTime.month = String(month)
        updated = true
      }
    }

    // 单独检测日期
    const dayMatch = content.match(/(\d{1,2})日/)
    if (dayMatch && dayMatch[1]) {
      const day = parseInt(dayMatch[1])
      if (day >= 1 && day <= 31 && String(day) !== currentTime.day) {
        currentTime.day = String(day)
        updated = true
      }
    }
  }

  // 检测纪年/年号
  const eraMatch = content.match(/([^\s，。！？\d]{2,6})(元年|二年|三年|\d+年)/)
  if (eraMatch && eraMatch[1]) {
    currentTime.eraName = eraMatch[1]
    currentTime.eraId = 'chinese'
    updated = true
  }

  return updated ? currentTime : null
}

// 地点变化解析（原 extractLocationChanges 解析段）：返回清理后的地点名，
// 或 null 表示无匹配；只取第一个匹配（与迁出前一致）。
export function parseLocationChange(content) {
  const locationPatterns = [
    /来到[了]?([^\s，。！？]{2,20})/,
    /到达[了]?([^\s，。！？]{2,20})/,
    /进入[了]?([^\s，。！？]{2,20})/,
    /抵达[了]?([^\s，。！？]{2,20})/,
    /身处([^\s，。！？]{2,20})/,
    /位于([^\s，。！？]{2,20})/,
    /站在([^\s，。！？]{2,20})/,
    /位于([^\s，。！？]{2,20})/
  ]

  for (const pattern of locationPatterns) {
    const match = content.match(pattern)
    if (match && match[1]) {
      let location = match[1].trim()
      // 清理常见的后缀词
      location = location.replace(/[的地得]$/, '')
      if (location.length >= 2 && location.length <= 15) {
        return location
      }
    }
  }
  return null
}

// 视角人物启发式：只返回完整的新人物投影，不写 store/worldbook。
// 这些规则用于兼容 Experience 的旧自由文本响应；Authoring 的正式人物资料
// 仍以 worldbook entry 为唯一真源，不能把此结果反写为世界设定。
export function parseWritingCharacterChange(content, currentCharacter = {}) {
  const character = { ...currentCharacter }
  let updated = false

  if (!character.name || character.name === 'User') {
    const namePatterns = [
      /你叫([^\s，。！？]{2,8})/,
      /你的名字[叫是]([^\s，。！？]{2,8})/,
      /名叫([^\s，。！？]{2,8})/,
      /名为([^\s，。！？]{2,8})/,
      /我是([^\s，。！？]{2,8})[，。！？]/,
      /我叫([^\s，。！？]{2,8})[，。！？]/,
      /你是([^\s，。！？]{2,8})[，。！？，一个]/,
      /作为一个叫([^\s，。！？]{2,8})的/,
      /^([^\s，。！？]{2,8})[说想看走站坐躺醒]/m,
      /一个叫([^\s，。！？]{2,8})的/,
      /名叫([^\s，。！？]{2,8})的[男女]/,
      /^([^\s，。！？]{2,8})，.{0,30}(醒来|睁眼|起身)/m
    ]
    const excludedNames = new Set([
      '你', '我', '他', '她', '它', '这', '那', '一个', '一位', '自己',
      '年轻', '少年', '少女', '男子', '女子', '男人', '女人', '老人', '青年', '中年'
    ])
    for (const pattern of namePatterns) {
      const name = content.match(pattern)?.[1]?.trim()
      if (!name || excludedNames.has(name) || /\d/.test(name) || name.length < 2 || name.length > 8) continue
      character.name = name
      updated = true
      break
    }
  }

  if (!character.gender) {
    const genderPatterns = [
      /你是一个(\d{1,3})岁的(男|女)/,
      /你是个(\d{1,3})岁的(男|女)/,
      /你是(男|女)的/,
      /一个(男|女)[性孩人]/,
      /(男|女)主人公/,
      /作为(男|女)/,
      /性别[是为](男|女)/,
      /(男|女)士/,
      /(男|女)孩/
    ]
    for (const pattern of genderPatterns) {
      const match = content.match(pattern)
      const gender = match?.[2] || match?.[1]
      if (gender !== '男' && gender !== '女') continue
      character.gender = gender
      updated = true
      break
    }
  }

  if (!character.age) {
    const agePatterns = [
      /(\d{1,3})岁的[男女]/,
      /一个(\d{1,3})岁的/,
      /年龄[是为](\d{1,3})/,
      /今年(\d{1,3})岁/
    ]
    for (const pattern of agePatterns) {
      const age = Number.parseInt(content.match(pattern)?.[1])
      if (!(age > 0 && age < 200)) continue
      character.age = `${age}岁`
      updated = true
      break
    }
  }

  const moodKeywords = {
    happy: ['开心', '高兴', '兴奋', '喜悦', '欣慰', '满足', '快乐', '愉快'],
    sad: ['悲伤', '难过', '伤心', '沮丧', '失落', '忧郁', '悲痛'],
    angry: ['愤怒', '生气', '恼火', '恼怒', '气恼', '愤慨'],
    afraid: ['害怕', '恐惧', '惊恐', '惶恐', '不安', '担忧'],
    surprised: ['惊讶', '吃惊', '意外', '震惊', '惊奇']
  }
  let moodDelta = 0
  for (const [mood, keywords] of Object.entries(moodKeywords)) {
    for (const keyword of keywords) {
      if (!content.includes(keyword)) continue
      if (mood === 'happy') moodDelta += 5
      else if (mood === 'sad') moodDelta -= 5
      else if (mood === 'angry') moodDelta -= 3
      else if (mood === 'afraid') moodDelta -= 4
      else if (mood === 'surprised') moodDelta += 1
    }
  }
  if (moodDelta !== 0) {
    character.mood = Math.max(0, Math.min(100, (character.mood || 50) + moodDelta))
    updated = true
  }

  return updated ? character : null
}

// Experience 活动记录的纯文本投影。日期、地点、ID 与最近 20 条的写入策略
// 仍由 store 的 addActivity action 负责。
export function parseActivityEvents(content) {
  const eventPatterns = [
    { pattern: /获得了?(.+?)(?:。|，|\s)/, type: 'event' },
    { pattern: /做出了?(?:一个|项)?(.+?)(?:决定|选择)(?:。|，)/, type: 'decision' },
    { pattern: /遇到了?(.+?)(?:，|。)/, type: 'encounter' },
    { pattern: /完成了?(.+?)(?:任务|委托|目标)(?:。|，)/, type: 'milestone' }
  ]
  const events = []
  for (const { pattern, type } of eventPatterns) {
    const title = content.match(pattern)?.[0]?.trim()
    if (!title || title.length < 4 || title.length > 50) continue
    events.push({ title, type })
  }
  return events
}

// —— 轻状态家族（B12 第二刀）：目标 / 已遇角色 / 关键选择 / 阵营关系 ——
// 解析决策在此，store action 只负责应用（upsertGoal/recordKeyChoice 等）。

// 目标意图：第一个命中模式返回 { title, status }，无命中返回 null。
export function parseGoalIntent(content, normalizeTextValue) {
  const goalPatterns = [
    /(?:目标|任务目标|当前目标)[：:\s]+([^。！？\n]{4,40})/,
    /(?:你需要|你必须|你得)([^。！？\n]{4,36})/
  ]
  for (const pattern of goalPatterns) {
    const match = content.match(pattern)
    const title = normalizeTextValue(match?.[1])
    if (!title) continue
    return {
      title,
      status: /完成|达成|解决/.test(content) ? 'completed' : 'active'
    }
  }
  return null
}

// 已遇角色：世界书候选名中在原文出现的那些（保持候选顺序）。
export function filterMentionedNames(content, names = []) {
  return names.filter((name) => name && content.includes(name))
}

// 关键选择：逐模式取整句匹配文本（与原行为一致：每个模式最多记录一条）。
export function parseKeyChoiceLabels(content, normalizeTextValue) {
  const choicePatterns = [
    /(?:你决定|你选择|最终决定|最后选择)([^。！？\n]{3,36})/,
    /(?:答应了|拒绝了|站在了)([^。！？\n]{3,36})/
  ]
  const labels = []
  for (const pattern of choicePatterns) {
    const match = content.match(pattern)
    const label = normalizeTextValue(match?.[0] || match?.[1])
    if (!label) continue
    labels.push(label)
  }
  return labels
}

// 阵营关系增减：对每个阵营名计算 ±8 增量（只返回非零项，与原行为一致）。
export function computeFactionDeltas(content, names = []) {
  const deltas = []
  for (const name of names) {
    if (!name || !content.includes(name)) continue
    let delta = 0
    if (new RegExp(`${name}.{0,12}(信任|支持|帮助|保护)`).test(content)) delta += 8
    if (new RegExp(`${name}.{0,12}(怀疑|敌视|威胁|施压|逼迫)`).test(content)) delta -= 8
    if (delta !== 0) deltas.push({ name, delta })
  }
  return deltas
}
