const DEFAULT_GROUPS = ['硬约束', '文风约束', '禁写边界', '地理', '角色', '道具', '事件', '任务', '设定']

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function ensureRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function unique(values = []) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function keywords(values, fallback) {
  return unique([...ensureArray(values), fallback]).slice(0, 6)
}

function entry(type, name, keys, content, group, mode = '') {
  const safeName = normalizeText(name) || '未命名条目'
  const safeContent = normalizeText(content) || `${safeName}：由 RPG 预设世界适配生成，可在高级设置中继续精修。`

  return {
    name: safeName,
    type,
    keys: keywords(keys, safeName),
    content: safeContent,
    group,
    mode
  }
}

function joinList(values = [], fallback = '') {
  const normalized = ensureArray(values).map(normalizeText).filter(Boolean)
  return normalized.length ? normalized.join('、') : fallback
}

function describeExits(exits) {
  const pairs = Object.entries(ensureRecord(exits))
    .map(([direction, target]) => `${direction} -> ${target}`)
  return pairs.length ? `出口：${pairs.join('；')}。` : ''
}

function describeChoices(choices) {
  const texts = ensureArray(choices)
    .map(choice => normalizeText(choice?.text || choice?.action))
    .filter(Boolean)
  return texts.length ? `可选行动：${texts.join('、')}。` : ''
}

function describeConditions(conditions) {
  const pairs = Object.entries(ensureRecord(conditions))
    .map(([key, value]) => `${key}=${value}`)
  return pairs.length ? `触发条件：${pairs.join('；')}。` : ''
}

function describeDialogue(dialogue) {
  const source = ensureRecord(dialogue)
  const lines = [source.first_meet, source.default, source.friendly]
    .map(normalizeText)
    .filter(Boolean)
  return lines.length ? `典型台词：${lines.join(' / ')}。` : ''
}

function describeShop(shop) {
  const categories = Object.entries(ensureRecord(shop))
    .map(([category, goods]) => {
      const names = ensureArray(goods)
        .map(item => normalizeText(item?.name))
        .filter(Boolean)
      return names.length ? `${category}(${names.slice(0, 5).join('、')})` : category
    })
    .filter(Boolean)
  return categories.length ? `可交互资源：${categories.join('；')}。` : ''
}

function describeRelations(relations) {
  const source = ensureRecord(relations)
  if (!Object.keys(source).length) return ''
  const initial = source.initial ?? source.start
  const max = source.max
  const parts = []
  if (initial != null) parts.push(`初始关系 ${initial}`)
  if (max != null) parts.push(`上限 ${max}`)
  return parts.length ? `关系参数：${parts.join('，')}。` : ''
}

function inferWritingStyle(name, tags = []) {
  const source = `${name} ${tags.join(' ')}`
  if (/(仙|修仙|玄幻|门派|飞剑|丹药)/.test(source)) {
    return '古风玄幻与修行冒险语气，强调机缘、门派规矩、灵气差异和因果约束。'
  }
  if (/(魔法|龙|王国|公会|史诗|奇幻)/.test(source)) {
    return '剑与魔法的冒险叙事，强调委托、王国秩序、旅途风险和英雄成长。'
  }
  if (/(末日|废土|丧尸|避难|物资)/.test(source)) {
    return '末日生存语气，强调资源稀缺、环境危险、幸存者互信和选择代价。'
  }
  if (/(星际|飞船|科技|赛博|基因|机器人)/.test(source)) {
    return '近未来科幻任务流语气，强调程序、资源、航行风险、技术边界和派系利益。'
  }
  if (/(都市|职场|现代|社交|恋爱|投资)/.test(source)) {
    return '现代都市叙事语气，强调日常压力、人际关系、职业选择和现实约束。'
  }
  return '保持当前世界类型的稳定叙事语气，避免突然切换题材、规则或角色动机。'
}

function resolveOpeningHook({ config, story, locations, randomEncounters }) {
  const mainQuest = ensureRecord(story?.mainQuest)
  const defaultLocation = normalizeText(config.defaultLocation)
  const defaultLocationData = ensureRecord(locations[defaultLocation])
  const locationEvent = ensureArray(defaultLocationData.events)[0]
  const randomEncounter = ensureArray(randomEncounters)[0]

  return normalizeText(locationEvent?.description)
    || normalizeText(randomEncounter?.description)
    || normalizeText(mainQuest.description)
    || normalizeText(config.preview)
    || normalizeText(config.description)
    || '从默认地点进入世界，确认当前目标、可交互角色和第一处风险。'
}

function buildLocationEntries(locations) {
  return Object.entries(ensureRecord(locations)).map(([id, location]) => {
    const source = ensureRecord(location)
    const name = normalizeText(source.name || id)
    const npcs = joinList(source.npcs)
    const eventIds = ensureArray(source.events)
      .map(item => normalizeText(item?.id || item?.description))
      .filter(Boolean)

    const content = [
      source.description,
      describeExits(source.exits),
      npcs ? `可遇角色：${npcs}。` : '',
      eventIds.length ? `地点事件：${eventIds.join('、')}。` : ''
    ].filter(Boolean).join(' ')

    return entry('location', name, [id, name, ...ensureArray(source.npcs)], content, '地理')
  })
}

function buildLocationEventEntries(locations) {
  return Object.entries(ensureRecord(locations)).flatMap(([locationId, location]) => {
    const source = ensureRecord(location)
    const locationName = normalizeText(source.name || locationId)

    return ensureArray(source.events).map((eventData, index) => {
      const eventName = normalizeText(eventData?.id || `${locationName}事件${index + 1}`)
      const content = [
        `${locationName}的地点事件。`,
        eventData?.category ? `类型：${eventData.category}。` : '',
        eventData?.description
      ].filter(Boolean).join(' ')

      return entry('event', eventName, [eventName, locationName, eventData?.category], content, '事件')
    })
  })
}

function buildNpcEntries(npcs) {
  return Object.entries(ensureRecord(npcs)).map(([id, npc]) => {
    const source = ensureRecord(npc)
    const name = normalizeText(source.name || id)
    const title = normalizeText(source.title)
    const location = normalizeText(source.location)

    const content = [
      title ? `${name}是${title}。` : '',
      location ? `常驻地点：${location}。` : '',
      describeDialogue(source.dialogue),
      describeShop(source.shop),
      describeRelations(source.relations)
    ].filter(Boolean).join(' ')

    return entry('character', name, [id, name, title, location], content, '角色')
  })
}

function buildEnemyEntries(enemies) {
  return ensureArray(enemies).map((enemy, index) => {
    const source = ensureRecord(enemy)
    const name = normalizeText(source.name || `敌对角色${index + 1}`)
    const stats = [
      source.level != null ? `等级 ${source.level}` : '',
      source.hp != null ? `生命 ${source.hp}` : '',
      source.attack != null ? `攻击 ${source.attack}` : ''
    ].filter(Boolean).join('，')

    const content = [
      source.description,
      stats ? `基础数值：${stats}。` : ''
    ].filter(Boolean).join(' ')

    return entry('character', name, [name, '敌对角色'], content, '角色')
  })
}

function buildItemEntries(items) {
  return Object.entries(ensureRecord(items)).map(([id, item]) => {
    const source = ensureRecord(item)
    const name = normalizeText(source.name || id)
    const attrs = [
      source.type ? `类型：${source.type}` : '',
      source.rarity ? `稀有度：${source.rarity}` : '',
      source.effect ? `效果：${source.effect}` : ''
    ].filter(Boolean).join('；')

    const content = [
      source.description,
      attrs ? `${attrs}。` : ''
    ].filter(Boolean).join(' ')

    return entry('item', name, [id, name, source.type, source.rarity], content, '道具')
  })
}

function buildRandomEncounterEntries(randomEncounters) {
  return ensureArray(randomEncounters).map((encounter, index) => {
    const source = ensureRecord(encounter)
    const name = normalizeText(source.id || `随机事件${index + 1}`)
    const chance = source.chance != null ? `触发概率：${source.chance}。` : ''
    const content = [
      source.description,
      chance,
      describeConditions(source.conditions),
      describeChoices(source.choices)
    ].filter(Boolean).join(' ')

    return entry('event', name, [name, source.conditions?.location], content, '事件')
  })
}

function buildStoryEntries(story) {
  const source = ensureRecord(story)
  const entries = []
  const mainQuest = ensureRecord(source.mainQuest)
  if (Object.keys(mainQuest).length) {
    const name = normalizeText(mainQuest.name || mainQuest.id || '主线任务')
    entries.push(entry('quest', name, [name, mainQuest.id], mainQuest.description, '任务'))
  }

  for (const chapter of ensureArray(source.chapters)) {
    const name = normalizeText(chapter?.name || chapter?.id)
    if (!name) continue
    const events = joinList(chapter.events)
    const content = events
      ? `${name}包含的关键剧情节点：${events}。`
      : `${name}是主线推进章节。`
    entries.push(entry('quest', name, [name, chapter.id, ...ensureArray(chapter.events)], content, '任务'))
  }

  return entries
}

export function adaptRpgWorldToWorldbookPayload(rawWorld = {}, options = {}) {
  const config = ensureRecord(rawWorld.config)
  const locations = ensureRecord(rawWorld.locations)
  const tags = ensureArray(config.tags).map(normalizeText).filter(Boolean)
  const name = normalizeText(options.name || config.name || options.id || 'RPG 预设世界')
  const description = normalizeText(config.description || `${name} RPG 预设世界。`)
  const mainQuest = ensureRecord(rawWorld.story?.mainQuest)
  const openingHook = resolveOpeningHook({
    config,
    story: rawWorld.story,
    locations,
    randomEncounters: rawWorld.randomEncounters
  })
  const writingStyle = normalizeText(options.writingStyle || inferWritingStyle(name, tags))
  const forbidden = normalizeText(options.forbidden || '不得无因改写地点连接、角色常驻地点、物品效果和主线任务；不得让 RPG 数值或商店资源无限制解决所有危机。')

  const entries = [
    entry(
      'rule',
      `${name}运行规则`,
      [name, '默认地点', config.defaultLocation, 'RPG预设'],
      `世界核心：${description} 默认地点是${config.defaultLocation || '未指定'}，初始资源为${config.starterMoney ?? '未指定'}。地点出口、NPC 常驻地、物品效果和主线任务必须保持一致。`,
      '硬约束',
      'constant'
    ),
    entry('style', `${name}文风基线`, [name, '文风', ...tags.slice(0, 3)], writingStyle, '文风约束', 'constant'),
    entry('forbidden', `${name}禁写边界`, [name, '禁写', 'RPG约束'], forbidden, '禁写边界', 'constant'),
    entry(
      'lore',
      `${name}世界概述`,
      [name, ...tags.slice(0, 4)],
      [
        description,
        tags.length ? `主题标签：${tags.join('、')}。` : '',
        config.preview ? `视觉预览：${config.preview}` : '',
        mainQuest.description ? `主线锚点：${mainQuest.description}` : ''
      ].filter(Boolean).join(' '),
      '设定'
    ),
    ...buildLocationEntries(locations),
    ...buildLocationEventEntries(locations),
    ...buildNpcEntries(rawWorld.npcs),
    ...buildEnemyEntries(rawWorld.enemies),
    ...buildItemEntries(rawWorld.items),
    ...buildRandomEncounterEntries(rawWorld.randomEncounters),
    ...buildStoryEntries(rawWorld.story)
  ]

  return {
    id: normalizeText(options.id || `rpg-${name}`),
    name,
    genreLabel: tags.slice(0, 2).join(' / ') || 'RPG 预设',
    sourceKind: 'rpg-world-json',
    sourceLabel: normalizeText(options.sourceLabel || 'RPG 预设适配'),
    description,
    worldDescription: [
      description,
      `默认地点：${config.defaultLocation || '未指定'}。`,
      mainQuest.description ? `主线目标：${mainQuest.description}` : '',
      tags.length ? `主题标签：${tags.join('、')}。` : ''
    ].filter(Boolean).join(' '),
    writingStyle,
    forbidden,
    openingHook,
    creativeExits: [
      `写成${name}冒险章节`,
      `整理成${name}分镜`,
      '扩展事件/势力草稿'
    ],
    groups: unique([...DEFAULT_GROUPS, ...entries.map(item => item.group)]),
    entries
  }
}

export function summarizeRpgWorldShape(rawWorld = {}) {
  return {
    locations: Object.keys(ensureRecord(rawWorld.locations)).length,
    npcs: Object.keys(ensureRecord(rawWorld.npcs)).length,
    enemies: ensureArray(rawWorld.enemies).length,
    randomEncounters: ensureArray(rawWorld.randomEncounters).length,
    items: Object.keys(ensureRecord(rawWorld.items)).length,
    chapters: ensureArray(rawWorld.story?.chapters).length,
    hasMainQuest: Boolean(rawWorld.story?.mainQuest)
  }
}
