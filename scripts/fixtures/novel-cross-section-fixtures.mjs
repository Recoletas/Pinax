export const CROSS_SECTION_FIXTURE_SCHEMA_VERSION = 1

const deepFreeze = value => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key])
  return Object.freeze(value)
}

const publicFact = (id, text) => ({ id, text, visibility: 'public' })
const privateFact = (id, text, ownerCharacterId, leakMarkers) => ({
  id,
  text,
  visibility: 'private',
  ownerCharacterId,
  leakMarkers
})

export const CROSS_SECTION_FIXTURES = deepFreeze([
  {
    id: 'canal-ledger',
    title: '雨中运河关卡',
    facts: [
      publicFact('canal-gate', '暴雨中的运河关卡封锁了北岸航道。'),
      publicFact('sealed-ledger', '一册密封粮册记录着今夜应当放行的粮船。'),
      privateFact('seal-forgery', '检查官私下确认封印是伪造的。', 'inspector', ['封印是伪造的']),
      privateFact('barge-sank', '信使私下知道粮册所列驳船昨日已经沉没。', 'messenger', ['驳船昨日已经沉没'])
    ],
    characters: [
      {
        id: 'inspector',
        name: '检查官',
        desire: '守住关卡并查明粮册真伪。',
        contradiction: '越想维护秩序，越不能公开伪造封印。',
        voiceProfile: '句子短促，常用审问式反问。',
        temperament: '克制多疑',
        knownFactIds: ['seal-forgery'],
        forbiddenFactIds: ['barge-sank']
      },
      {
        id: 'messenger',
        name: '信使',
        desire: '让一船人活着离开雨中的关卡。',
        contradiction: '越急于送信，越必须隐瞒沉船的事实。',
        voiceProfile: '语气客气，关键处突然加快。',
        temperament: '焦灼圆滑',
        knownFactIds: ['barge-sank'],
        forbiddenFactIds: ['seal-forgery']
      }
    ],
    expectedOutcome: '密封粮册易手、销毁，或双方明确退出关卡，冲突随动作结束。',
    antiOutcome: '双方在没有改变粮册归属的情况下无限争吵，私密事实被旁白直接泄露。',
    focusProp: '密封粮册',
    exitCue: ['账册易手', '账册销毁', '双方明确退出'],
    internalBeatRange: { min: 3, max: 5 },
    speakerMap: { 检查官: 'inspector', 信使: 'messenger' }
  },
  {
    id: 'birthday-recorder',
    title: '三人生日宴',
    facts: [
      publicFact('birthday-table', '三人在生日宴后仍坐在没有收拾完的餐桌旁。'),
      publicFact('recorder-present', '一台旧录音机停在桌角，磁带还没有取出。'),
      privateFact('edited-recording', '女儿私下知道录音已经被剪辑过。', 'daughter', ['录音已经被剪辑过']),
      privateFact('deleted-minute', '舅舅知道父亲删掉了录音中的一分钟。', 'uncle', ['父亲删掉了录音中的一分钟'])
    ],
    characters: [
      {
        id: 'daughter',
        name: '女儿',
        desire: '听清母亲没有说出口的那句话。',
        contradiction: '想保护母亲，却必须追问被剪掉的声音。',
        voiceProfile: '先轻声试探，受伤时重复对方的词。',
        temperament: '敏感执拗',
        knownFactIds: ['edited-recording'],
        forbiddenFactIds: ['deleted-minute']
      },
      {
        id: 'uncle',
        name: '舅舅',
        desire: '把宴会维持成一场体面的庆祝。',
        contradiction: '想息事宁人，却知道父亲动过录音。',
        voiceProfile: '用玩笑绕开问题，沉默比回答更长。',
        temperament: '圆滑紧张',
        knownFactIds: ['deleted-minute'],
        forbiddenFactIds: ['edited-recording']
      },
      {
        id: 'mother',
        name: '母亲',
        desire: '让女儿记住一个没有争吵的生日。',
        contradiction: '越想维持平静，越无法解释录音机为何被留下。',
        voiceProfile: '声音平稳，回避具体时间和名字。',
        temperament: '疲惫温和',
        knownFactIds: [],
        forbiddenFactIds: ['edited-recording', 'deleted-minute']
      }
    ],
    expectedOutcome: '录音被播放、装进口袋或砸毁，三人的争执随一个明确动作退出。',
    antiOutcome: '录音内容被旁白完整复述，三人只交换背景说明而没有处置录音机。',
    focusProp: '生日宴录音机',
    exitCue: ['播放', '装进口袋', '砸毁'],
    internalBeatRange: { min: 3, max: 5 },
    speakerMap: { 女儿: 'daughter', 舅舅: 'uncle', 母亲: 'mother' }
  },
  {
    id: 'orbital-airlock-key',
    title: '太空站机械气闸钥匙',
    facts: [
      publicFact('station-alert', '太空站机械气闸响起压力警报，三人被困在内侧舱段。'),
      publicFact('airlock-key-present', '一把机械气闸钥匙躺在检修台上，尚未归还。'),
      privateFact('drill-alarm', '工程师私下知道压力警报其实是一场演习。', 'engineer', ['压力警报其实是一场演习']),
      privateFact('captain-unfit', '医官私下知道舰长的身体不适合撤离。', 'medic', ['舰长的身体不适合撤离'])
    ],
    characters: [
      {
        id: 'engineer',
        name: '工程师',
        desire: '立刻接管钥匙并停止无谓的撤离。',
        contradiction: '知道演习真相，却不能证明自己没有擅离警戒。',
        voiceProfile: '用技术名词压住情绪，句尾常省略主语。',
        temperament: '急躁务实',
        knownFactIds: ['drill-alarm'],
        forbiddenFactIds: ['captain-unfit']
      },
      {
        id: 'medic',
        name: '医官',
        desire: '阻止舰长带伤进入气闸。',
        contradiction: '想救舰长，却必须在众人面前违抗舰长命令。',
        voiceProfile: '先报数据再下判断，几乎不使用比喻。',
        temperament: '冷静坚硬',
        knownFactIds: ['captain-unfit'],
        forbiddenFactIds: ['drill-alarm']
      },
      {
        id: 'captain',
        name: '舰长',
        desire: '拿到钥匙并亲自带队撤离。',
        contradiction: '以为自己掌握全局，却不知道警报与身体状况的真相。',
        voiceProfile: '命令式短句，拒绝听完解释。',
        temperament: '果断自负',
        knownFactIds: [],
        forbiddenFactIds: ['drill-alarm', 'captain-unfit']
      }
    ],
    expectedOutcome: '机械钥匙实际进入工程师手中，舱门锁定在稳定状态，气闸争执随之退出。',
    antiOutcome: '压力警报、伤情、钥匙去向和舱门状态都保持模糊，角色只重复撤离命令。',
    focusProp: '机械气闸钥匙',
    exitCue: ['钥匙进入工程师手中', '舱门锁定并保持稳定'],
    internalBeatRange: { min: 3, max: 5 },
    speakerMap: { 工程师: 'engineer', 医官: 'medic', 舰长: 'captain' }
  },
  {
    id: 'temple-debt-token',
    title: '黎明前寺庙债符',
    facts: [
      publicFact('temple-before-dawn', '黎明前的寺庙只亮着一盏偏殿的灯。'),
      publicFact('debt-token-present', '一枚雕刻债符被放在佛龛前，等待收取。'),
      privateFact('token-names-teacher', '见习者知道雕刻债符上刻着老师的名字。', 'novice', ['雕刻债符上刻着老师的名字']),
      privateFact('debt-paid', '收债人知道这笔债早已偿清。', 'collector', ['这笔债早已偿清'])
    ],
    characters: [
      {
        id: 'novice',
        name: '见习者',
        desire: '保护老师的名声并让债符离开佛龛。',
        contradiction: '越想替老师辩护，越可能暴露自己看过债符。',
        voiceProfile: '敬语完整，紧张时把问题改成请求。',
        temperament: '谨慎忠诚',
        knownFactIds: ['token-names-teacher'],
        forbiddenFactIds: ['debt-paid']
      },
      {
        id: 'collector',
        name: '收债人',
        desire: '在天亮前完成一次不必动手的收债。',
        contradiction: '知道债已偿清，却仍必须确认寺庙是否愿意承认它。',
        voiceProfile: '语气平缓，反复使用账目和日期。',
        temperament: '耐心冷漠',
        knownFactIds: ['debt-paid'],
        forbiddenFactIds: ['token-names-teacher']
      }
    ],
    expectedOutcome: '雕刻债符被上交、藏匿或遭到公开质疑，双方在披露边界上明确退出。',
    antiOutcome: '见习者和收债人在披露前互相引用对方的私密事实，债符真相被直接讲完。',
    focusProp: '雕刻债符',
    exitCue: ['上交债符', '藏匿债符', '公开质疑债符'],
    internalBeatRange: { min: 3, max: 5 },
    speakerMap: { 见习者: 'novice', 收债人: 'collector' }
  }
])

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const isText = value => typeof value === 'string' && value.trim().length > 0
const STABLE_ID_RE = /^[a-z0-9][a-z0-9-]*$/
const isStableId = value => typeof value === 'string' && STABLE_ID_RE.test(value)
const containsPrivateFactMetadata = (value, fact) => typeof value === 'string'
  && [fact.id, fact.text, ...fact.leakMarkers].some(token => value.includes(token))

const invalid = (code, context = {}) => ({
  valid: false,
  error: Object.fromEntries([
    ['code', code],
    ['fixtureId', context.fixtureId],
    ['characterId', context.characterId],
    ['factId', context.factId]
  ].filter(([, value]) => value !== undefined))
})

const validateFixtureList = fixtures => {
  if (!Array.isArray(fixtures)) return invalid('CROSS_SECTION_INVALID_FIXTURES')

  const fixtureIds = new Set()
  for (const fixture of fixtures) {
    if (!isRecord(fixture)) return invalid('CROSS_SECTION_INVALID_FIXTURE')

    const fixtureId = isText(fixture.id) ? fixture.id : undefined
    const fixtureContext = fixtureId ? { fixtureId } : {}
    if (!fixtureId || !isText(fixture.title)) return invalid('CROSS_SECTION_MISSING_FIELD', fixtureContext)
    if (!isStableId(fixtureId)) return invalid('CROSS_SECTION_INVALID_ID', fixtureContext)
    if (fixtureIds.has(fixtureId)) return invalid('CROSS_SECTION_DUPLICATE_FIXTURE_ID', fixtureContext)
    fixtureIds.add(fixtureId)

    if (!Array.isArray(fixture.facts) || fixture.facts.length === 0) {
      return invalid('CROSS_SECTION_MISSING_FIELD', fixtureContext)
    }
    if (!Array.isArray(fixture.characters)) return invalid('CROSS_SECTION_MISSING_FIELD', fixtureContext)
    if (fixture.characters.length < 2 || fixture.characters.length > 3) {
      return invalid('CROSS_SECTION_CHARACTER_COUNT', fixtureContext)
    }

    const characterIds = new Set()
    for (const character of fixture.characters) {
      if (!isRecord(character)) return invalid('CROSS_SECTION_INVALID_FIXTURE', fixtureContext)
      const characterId = isText(character.id) ? character.id : undefined
      const characterContext = { ...fixtureContext, ...(characterId ? { characterId } : {}) }
      if (!characterId) return invalid('CROSS_SECTION_MISSING_FIELD', characterContext)
      if (!isStableId(characterId)) return invalid('CROSS_SECTION_INVALID_ID', characterContext)
      if (characterIds.has(characterId)) return invalid('CROSS_SECTION_DUPLICATE_CHARACTER_ID', characterContext)
      characterIds.add(characterId)
      for (const field of ['name', 'desire', 'contradiction', 'voiceProfile', 'temperament']) {
        if (!isText(character[field])) return invalid('CROSS_SECTION_MISSING_FIELD', characterContext)
      }
      if (!Array.isArray(character.knownFactIds) || !Array.isArray(character.forbiddenFactIds)) {
        return invalid('CROSS_SECTION_MISSING_FIELD', characterContext)
      }
      const duplicateKnownFactId = character.knownFactIds.find((factId, index, factIds) => factIds.indexOf(factId) !== index)
      if (duplicateKnownFactId !== undefined) {
        return invalid('CROSS_SECTION_DUPLICATE_KNOWN_FACT_ID', { ...characterContext, factId: duplicateKnownFactId })
      }
      const duplicateForbiddenFactId = character.forbiddenFactIds.find((factId, index, factIds) => factIds.indexOf(factId) !== index)
      if (duplicateForbiddenFactId !== undefined) {
        return invalid('CROSS_SECTION_DUPLICATE_FORBIDDEN_FACT_ID', { ...characterContext, factId: duplicateForbiddenFactId })
      }
    }

    const factIds = new Set()
    let hasPublicSettingFact = false
    for (const fact of fixture.facts) {
      if (!isRecord(fact)) return invalid('CROSS_SECTION_INVALID_FIXTURE', fixtureContext)
      const factId = isText(fact.id) ? fact.id : undefined
      const factContext = { ...fixtureContext, ...(factId ? { factId } : {}) }
      if (!factId || !isText(fact.text) || !isText(fact.visibility)) {
        return invalid('CROSS_SECTION_MISSING_FIELD', factContext)
      }
      if (!isStableId(factId)) return invalid('CROSS_SECTION_INVALID_ID', factContext)
      if (factIds.has(factId)) return invalid('CROSS_SECTION_DUPLICATE_FACT_ID', factContext)
      factIds.add(factId)

      if (fact.visibility === 'public') {
        hasPublicSettingFact = true
      } else if (fact.visibility === 'private') {
        if (!isText(fact.ownerCharacterId)) return invalid('CROSS_SECTION_MISSING_FIELD', factContext)
        if (!characterIds.has(fact.ownerCharacterId)) return invalid('CROSS_SECTION_UNKNOWN_CHARACTER', factContext)
        if (!Array.isArray(fact.leakMarkers) || fact.leakMarkers.length === 0 || fact.leakMarkers.some(marker => !isText(marker) || !fact.text.includes(marker))) {
          return invalid('CROSS_SECTION_PRIVATE_FACT_LITERAL_MARKER_REQUIRED', factContext)
        }
      } else {
        return invalid('CROSS_SECTION_INVALID_FACT_VISIBILITY', factContext)
      }
    }
    if (!hasPublicSettingFact) return invalid('CROSS_SECTION_MISSING_FIELD', fixtureContext)

    for (const character of fixture.characters) {
      const characterContext = { ...fixtureContext, characterId: character.id }
      for (const factId of [...character.knownFactIds, ...character.forbiddenFactIds]) {
        if (!isText(factId) || !factIds.has(factId)) {
          return invalid('CROSS_SECTION_UNKNOWN_FACT', { ...characterContext, ...(isText(factId) ? { factId } : {}) })
        }
      }
    }

    for (const fact of fixture.facts.filter(({ visibility }) => visibility === 'private')) {
      for (const character of fixture.characters) {
        const knowledgeContext = { ...fixtureContext, characterId: character.id, factId: fact.id }
        const knowsFact = character.knownFactIds.includes(fact.id)
        const forbidsFact = character.forbiddenFactIds.includes(fact.id)
        if (character.id === fact.ownerCharacterId) {
          if (forbidsFact) return invalid('CROSS_SECTION_PRIVATE_FACT_OWNER_FORBIDDEN', knowledgeContext)
          if (!knowsFact) return invalid('CROSS_SECTION_PRIVATE_FACT_OWNER_MUST_KNOW', knowledgeContext)
        } else {
          if (knowsFact) return invalid('CROSS_SECTION_PRIVATE_FACT_NON_OWNER_KNOWS', knowledgeContext)
          if (!forbidsFact) return invalid('CROSS_SECTION_PRIVATE_FACT_NON_OWNER_MUST_FORBID', knowledgeContext)
        }
      }
    }

    for (const character of fixture.characters) {
      const characterContext = { ...fixtureContext, characterId: character.id }
      const knownFactIds = new Set(character.knownFactIds)
      for (const factId of character.forbiddenFactIds) {
        if (knownFactIds.has(factId)) {
          return invalid('CROSS_SECTION_KNOWLEDGE_CONFLICT', { ...characterContext, factId })
        }
      }
    }

    const privateFacts = fixture.facts.filter(({ visibility }) => visibility === 'private')
    for (const fact of privateFacts) {
      const factMetadata = [fact.id, fact.text, ...fact.leakMarkers]
      for (const leakedFact of privateFacts.filter(candidate => (
        candidate.ownerCharacterId !== fact.ownerCharacterId
      ))) {
        if (factMetadata.some(value => containsPrivateFactMetadata(value, leakedFact))) {
          return invalid('CROSS_SECTION_PRIVATE_FACT_METADATA_LEAK', {
            ...fixtureContext,
            factId: fact.id
          })
        }
      }
    }

    const sharedVisibleIds = [
      fixture.id,
      ...fixture.facts.filter(({ visibility }) => visibility === 'public').map(({ id }) => id)
    ]
    for (const fact of privateFacts) {
      if (sharedVisibleIds.some(id => containsPrivateFactMetadata(id, fact))) {
        return invalid('CROSS_SECTION_PRIVATE_FACT_METADATA_LEAK', {
          ...fixtureContext,
          factId: fact.id
        })
      }
    }

    for (const character of fixture.characters) {
      for (const fact of privateFacts) {
        if (containsPrivateFactMetadata(character.id, fact)) {
          return invalid('CROSS_SECTION_PRIVATE_FACT_METADATA_LEAK', {
            ...fixtureContext,
            characterId: character.id,
            factId: fact.id
          })
        }
      }
    }

    const sharedMetadata = [
      fixture.title,
      fixture.expectedOutcome,
      fixture.antiOutcome,
      fixture.focusProp,
      ...(Array.isArray(fixture.exitCue) ? fixture.exitCue : []),
      ...fixture.facts.filter(({ visibility }) => visibility === 'public').map(({ text }) => text)
    ]
    for (const fact of privateFacts) {
      if (sharedMetadata.some(value => containsPrivateFactMetadata(value, fact))) {
        return invalid('CROSS_SECTION_PRIVATE_FACT_METADATA_LEAK', {
          ...fixtureContext,
          factId: fact.id
        })
      }
    }

    const characterMetadataFields = ['name', 'desire', 'contradiction', 'voiceProfile', 'temperament']
    for (const character of fixture.characters) {
      for (const fact of privateFacts.filter(({ id }) => character.forbiddenFactIds.includes(id))) {
        if (characterMetadataFields.some(field => containsPrivateFactMetadata(character[field], fact))) {
          return invalid('CROSS_SECTION_PRIVATE_FACT_METADATA_LEAK', {
            ...fixtureContext,
            characterId: character.id,
            factId: fact.id
          })
        }
      }
    }

    for (const field of ['expectedOutcome', 'antiOutcome', 'focusProp']) {
      if (!isText(fixture[field])) return invalid('CROSS_SECTION_MISSING_FIELD', fixtureContext)
    }
    if (!Array.isArray(fixture.exitCue) || fixture.exitCue.length === 0 || fixture.exitCue.some(cue => !isText(cue))) {
      return invalid('CROSS_SECTION_MISSING_FIELD', fixtureContext)
    }
    if (!isRecord(fixture.internalBeatRange) || Object.keys(fixture.internalBeatRange).length !== 2 || fixture.internalBeatRange.min !== 3 || fixture.internalBeatRange.max !== 5) {
      return invalid('CROSS_SECTION_INVALID_BEAT_RANGE', fixtureContext)
    }
    if (!isRecord(fixture.speakerMap)) return invalid('CROSS_SECTION_INVALID_SPEAKER_MAP', fixtureContext)
    const expectedSpeakerEntries = fixture.characters.map(({ id, name }) => [name, id])
    if (Object.keys(fixture.speakerMap).length !== expectedSpeakerEntries.length || expectedSpeakerEntries.some(([name, id]) => fixture.speakerMap[name] !== id)) {
      return invalid('CROSS_SECTION_INVALID_SPEAKER_MAP', fixtureContext)
    }
  }

  return { valid: true }
}

export function validateCrossSectionFixtures(fixtures) {
  return validateFixtureList(fixtures)
}
