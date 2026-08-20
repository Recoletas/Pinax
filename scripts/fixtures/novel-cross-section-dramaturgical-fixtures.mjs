/**
 * Task 1：戏剧极小引擎消融 fixture 契约。
 *
 * 复用 canonical CROSS_SECTION_FIXTURES（characters/facts/focusProp/exitCue/
 * beatRange/expected/anti），只追加三个条件所需的作者输入与公共评审 ground truth。
 * S1 = 四问包（pressure / sceneObjective×角色 / withheldTruth×角色 / stateChange）；
 * S2 = S1 之上冗余的六字段理论词表（按计划保留语义冗余，不做人为区分）。
 */
import { CROSS_SECTION_FIXTURES } from './novel-cross-section-fixtures.mjs'

export const DRAMATURGICAL_FIXTURE_SCHEMA_VERSION = 1

export const DRAMATURGICAL_FIELD_LIMITS = Object.freeze({
  pressure: 80,
  sceneObjective: 80,
  withheldTruth: 80,
  stateChange: 100,
  premise: 100,
  theoryField: 100,
  conditionChars: 800
})

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.getOwnPropertyNames(value)) deepFreeze(value[key])
  }
  return value
}

const enriched = (baseId, fields) => {
  const base = CROSS_SECTION_FIXTURES.find(({ id }) => id === baseId)
  return { ...base, ...fields }
}

export const CROSS_SECTION_DRAMATURGICAL_FIXTURES = deepFreeze([
  enriched('canal-ledger', {
    minimalEngine: {
      pressure: '暴雨在涨，北岸船队天亮前必须过闸；拖延一夜，双方都担不起后果。',
      sceneObjectives: {
        inspector: '在天亮前确认粮册真伪，并让信使按册放行或退回。',
        messenger: '让检查官放行今夜这条船，同时不让沉船的消息出口。'
      },
      withheldTruths: {
        inspector: '他知道封印是伪造的，却无法当众指出——那等于承认关卡被人绕过。',
        messenger: '他知道册上那条驳船昨日已经沉没，却不能让任何人停下清点。'
      },
      stateChange: '粮册的归属或毁损状态发生不可逆改变，双方对彼此底牌的判断随之改变。'
    },
    fullVocabulary: {
      premise: '暴雨夜的运河关卡上，一册粮册决定一船人的去留。',
      dramaticQuestion: '检查官会不会为了秩序放过一册假粮册？',
      dramaticGuts: '两人都想守住各自对"职责"的定义，谁也不肯先让文字过关。',
      mainConsciousness: '检查官：多疑、克制，用审问压住心里的让步。',
      spine: '从验册到放行或扣册，一步接一步推向天亮的最后期限。',
      conflictType: '职责对职责：程序正义对救人急务。'
    },
    dramaturgicalGroundTruth: {
      observableMotivations: [
        '检查官的每个动作都服务于查明真伪，而不是配合剧情反转',
        '信使的回避都为了保住船队过闸的可能'
      ],
      acceptableStateChanges: [
        '粮册被扣下、销毁或易手',
        '双方明确各自下一步行动并退出关卡'
      ],
      prohibitedShortcuts: [
        '私密事实由旁白直接讲出',
        '争吵不改变任何归属就结束'
      ],
      evaluatorNote: '只描述可观察的动机与结果，不引用任何输入字段措辞。'
    }
  }),
  enriched('birthday-recorder', {
    minimalEngine: {
      pressure: '宴会散场前的最后半小时，舅舅要赶末班车，母亲明早要住院复查。',
      sceneObjectives: {
        daughter: '在舅舅走前问出录音里被剪掉的那一分钟。',
        uncle: '在不撕破脸的前提下把女儿劝离录音机。',
        mother: '让这个生日在记忆里保持完整，把录音机收走。'
      },
      withheldTruths: {
        daughter: '她知道录音被剪辑过，却不能承认自己偷听过剪辑后的版本。',
        uncle: '他知道父亲删掉了那一分钟，却不能当着姐姐的面说是她默许的。',
        mother: '她记得那晚自己说过什么，却宁愿让女儿以为是磁带的问题。'
      },
      stateChange: '录音机被播放、带走或毁掉，三人中至少一人对那晚的判断公开改变。'
    },
    fullVocabulary: {
      premise: '生日宴的残局里，一台旧录音机决定这个家还剩多少体面。',
      dramaticQuestion: '女儿能不能在母亲收走录音机之前，听清那一分钟？',
      dramaticGuts: '每个人都在保护另一个人，又都在保护自己版本的真相。',
      mainConsciousness: '女儿：执拗地轻声逼近，受伤时重复对方的词。',
      spine: '从收拾餐桌到处置录音机，逼向末班车前的最后对峙。',
      conflictType: '亲情对亲情：保护欲对真相权。'
    },
    dramaturgicalGroundTruth: {
      observableMotivations: [
        '女儿的追问指向缺失的那段声音，而非泛化的家庭矛盾',
        '母亲的每个动作都在推迟而非回答',
        '舅舅的圆滑服务于体面收场'
      ],
      acceptableStateChanges: [
        '录音机被播放、装进口袋或砸毁',
        '有人明确说出"那一分钟"存在并退场'
      ],
      prohibitedShortcuts: [
        '录音内容被旁白完整复述',
        '三人只交换背景说明而不处置录音机'
      ],
      evaluatorNote: '以可观察动作与信息处置为准，不评内心独白的辞藻。'
    }
  }),
  enriched('orbital-airlock-key', {
    minimalEngine: {
      pressure: '舱压警报每三十秒刷新一次，撤离窗口最多还剩四分钟。',
      sceneObjectives: {
        engineer: '拿回钥匙、停止撤离，并在舰长面前保住自己的岗位。',
        medic: '阻止舰长进闸，同时不公开他的体检结果。',
        captain: '拿到钥匙，带队按预案撤离，保住指挥权。'
      },
      withheldTruths: {
        engineer: '他知道警报是演习，却无法证明自己不是擅离警戒才得知的。',
        medic: '他知道舰长的身体撑不过气闸泄压，却不能在全员面前念出诊断。',
        captain: '他记得上次同类警报时的错误命令，却不能承认自己当时犹豫了。'
      },
      stateChange: '钥匙实际进入某人之手、舱门锁定在明确状态，撤离与否成为定局。'
    },
    fullVocabulary: {
      premise: '太空站气闸警报中，一把机械钥匙决定谁有资格撤离。',
      dramaticQuestion: '舰长的命令和医官的诊断，哪个先被证明？',
      dramaticGuts: '三种"职责"在四分钟里互不相让，每个人都握着别人不能听的事实。',
      mainConsciousness: '工程师：用数据说话，句尾省略主语。',
      spine: '从警报确认到钥匙归属，动作环环相扣直到舱门状态落定。',
      conflictType: '职责对职责：指挥链对专业判断。'
    },
    dramaturgicalGroundTruth: {
      observableMotivations: [
        '工程师的动作都在争取钥匙与止损',
        '医官的阻拦都有体检依据的影子但不直接泄露',
        '舰长的命令保持指挥语法而不是忽然顺从'
      ],
      acceptableStateChanges: [
        '钥匙进入工程师手中且舱门锁定',
        '舰长被明确说服或明确压制，撤离成为定局'
      ],
      prohibitedShortcuts: [
        '警报、伤情、钥匙去向、舱门状态全部保持模糊',
        '角色只重复撤离命令而不处置钥匙'
      ],
      evaluatorNote: '看决策链是否闭合，不奖赏术语密度。'
    }
  }),
  enriched('temple-debt-token', {
    minimalEngine: {
      pressure: '天亮还有一小时，收债人必须在天亮前带着结果离开，寺门那时会上闩。',
      sceneObjectives: {
        novice: '在收债人开价之前，把债符从佛龛前拿走或让老师之名不被念出。',
        collector: '不动手地拿到债符，或拿到寺里承认这笔债的凭证。'
      },
      withheldTruths: {
        novice: '他知道债符上刻着老师的名字，却不能承认自己夜里翻看过它。',
        collector: '他知道这笔债早已偿清，却需要寺庙亲口承认才好交差。'
      },
      stateChange: '债符被上交、藏匿或当众质疑，双方对"这笔债是否成立"的公开立场落定。'
    },
    fullVocabulary: {
      premise: '黎明前的偏殿里，一枚债符压着一个师门的名声。',
      dramaticQuestion: '见习者能不能在天亮前让债符离开佛龛又不折损师名？',
      dramaticGuts: '一个用礼数挡，一个用账目压，谁也不肯先说出真相的形状。',
      mainConsciousness: '见习者：敬语完整，紧张时把问题改成请求。',
      spine: '从认符到处置符，一步一步推向天亮前的表态。',
      conflictType: '道义对职责：师门名誉对收债交差。'
    },
    dramaturgicalGroundTruth: {
      observableMotivations: [
        '见习者的礼数始终服务于替老师挡',
        '收债人的耐心始终服务于拿到凭证'
      ],
      acceptableStateChanges: [
        '债符被上交、藏匿或公开质疑',
        '双方在披露边界上明确退出'
      ],
      prohibitedShortcuts: [
        '互相引用对方私密事实推进对话',
        '债符真相被直接讲完而没有处置动作'
      ],
      evaluatorNote: '看信息边界的攻防，不看禅意修辞。'
    }
  })
])

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const isText = value => typeof value === 'string' && value.trim().length > 0
const codePoints = value => [...String(value || '')].length

const invalid = (code, context = {}) => ({
  valid: false,
  error: Object.fromEntries(
    [['code', code], ['fixtureId', context.fixtureId], ['characterId', context.characterId], ['field', context.field]]
      .filter(([, value]) => value !== undefined)
  )
})

// 实验标签 / 评分与输出指令污染
const CONTAMINATION_RE = /minimal-engine|full-vocabulary|baseline|condition|评分|评审|打分|输出格式|marker|::/i
// S2 理论词表不应出现在 S1 字段里
const S2_VOCAB_RE = /premise|dramaticQuestion|戏剧性问题|戏剧动作|主旨|spine|conflictType|冲突类型/i
// S2 不允许携带 beat 结构覆盖
const BEAT_OVERRIDE_RE = /固定四拍|四拍|第[一二三四]拍|必须反转|reversal|recognition/i

/**
 * Task 1：严格 typed 校验。返回首个错误，不抛异常。
 */
export function validateDramaturgicalFixtures(fixtures) {
  if (!Array.isArray(fixtures) || fixtures.length < 1
    || fixtures.length > CROSS_SECTION_FIXTURES.length) {
    return invalid('CROSS_SECTION_DRAMATURGY_FIXTURE_MISMATCH')
  }
  const baseById = new Map(CROSS_SECTION_FIXTURES.map(fixture => [fixture.id, fixture]))
  const seenIds = new Set()

  for (const fixture of fixtures) {
    if (!isRecord(fixture)) return invalid('CROSS_SECTION_DRAMATURGY_FIXTURE_MISMATCH')
    const base = baseById.get(fixture.id)
    const fixtureId = fixture.id
    if (!base) return invalid('CROSS_SECTION_DRAMATURGY_FIXTURE_MISMATCH', { fixtureId })
    if (seenIds.has(fixtureId)) return invalid('CROSS_SECTION_DRAMATURGY_FIXTURE_MISMATCH', { fixtureId })
    seenIds.add(fixtureId)
    const ctx = fixtureId ? { fixtureId } : {}

    // 基础契约必须与 canonical 一致（防漂移抄写）
    if (JSON.stringify(fixture.characters) !== JSON.stringify(base.characters)
      || JSON.stringify(fixture.facts) !== JSON.stringify(base.facts)) {
      return invalid('CROSS_SECTION_DRAMATURGY_FIXTURE_MISMATCH', ctx)
    }

    const s1 = fixture.minimalEngine
    if (!isRecord(s1)) return invalid('CROSS_SECTION_DRAMATURGY_FIELD_REQUIRED', { ...ctx, field: 'minimalEngine' })
    for (const field of ['pressure', 'stateChange']) {
      if (!isText(s1[field])) return invalid('CROSS_SECTION_DRAMATURGY_FIELD_REQUIRED', { ...ctx, field })
      if (codePoints(s1[field]) > DRAMATURGICAL_FIELD_LIMITS[field]) {
        return invalid('CROSS_SECTION_DRAMATURGY_FIELD_TOO_LONG', { ...ctx, field })
      }
      if (CONTAMINATION_RE.test(s1[field])) {
        return invalid('CROSS_SECTION_DRAMATURGY_INPUT_CONTAMINATED', { ...ctx, field })
      }
    }

    const characterIds = base.characters.map(({ id }) => id)
    for (const [field, limit] of [['sceneObjectives', 'sceneObjective'], ['withheldTruths', 'withheldTruth']]) {
      const map = s1[field]
      if (!isRecord(map)) return invalid('CROSS_SECTION_DRAMATURGY_FIELD_REQUIRED', { ...ctx, field })
      for (const characterId of Object.keys(map)) {
        if (!characterIds.includes(characterId)) {
          return invalid('CROSS_SECTION_DRAMATURGY_CHARACTER_UNKNOWN', { ...ctx, characterId })
        }
        const value = map[characterId]
        if (!isText(value)) return invalid('CROSS_SECTION_DRAMATURGY_FIELD_REQUIRED', { ...ctx, field, characterId })
        if (codePoints(value) > DRAMATURGICAL_FIELD_LIMITS[limit]) {
          return invalid('CROSS_SECTION_DRAMATURGY_FIELD_TOO_LONG', { ...ctx, field, characterId })
        }
        if (CONTAMINATION_RE.test(value) || (field === 'sceneObjectives' && S2_VOCAB_RE.test(value))) {
          return invalid('CROSS_SECTION_DRAMATURGY_INPUT_CONTAMINATED', { ...ctx, field, characterId })
        }
      }
      for (const characterId of characterIds) {
        if (!(characterId in map)) {
          return invalid('CROSS_SECTION_DRAMATURGY_CHARACTER_MISSING', { ...ctx, characterId, field })
        }
      }
    }

    // withheldTruth 语义边界：角色知道（own-known 私事实或自述事实）但不能直说；
    // 不得指向该角色的 forbidden fact，也不得指向他人私知。
    for (const [characterId, truth] of Object.entries(s1.withheldTruths)) {
      const character = base.characters.find(({ id }) => id === characterId)
      for (const forbiddenId of character.forbiddenFactIds) {
        const forbidden = base.facts.find(fact => fact.id === forbiddenId)
        for (const marker of forbidden?.leakMarkers || []) {
          if (truth.includes(marker)) {
            return invalid('CROSS_SECTION_DRAMATURGY_WITHHELD_FORBIDDEN', { ...ctx, characterId })
          }
        }
      }
      // 未授权知识：文本命中任何非该角色可知的私事实 marker
      const knowable = new Set(character.knownFactIds)
      for (const fact of base.facts) {
        if (fact.visibility !== 'private') continue
        if (knowable.has(fact.id)) continue
        for (const marker of fact.leakMarkers || []) {
          if (truth.includes(marker)) {
            return invalid('CROSS_SECTION_DRAMATURGY_WITHHELD_FACT_UNKNOWN', { ...ctx, characterId })
          }
        }
      }
    }

    const s2 = fixture.fullVocabulary
    if (!isRecord(s2)) return invalid('CROSS_SECTION_DRAMATURGY_FIELD_REQUIRED', { ...ctx, field: 'fullVocabulary' })
    for (const field of ['premise', 'dramaticQuestion', 'dramaticGuts', 'mainConsciousness', 'spine', 'conflictType']) {
      if (!isText(s2[field])) return invalid('CROSS_SECTION_DRAMATURGY_FIELD_REQUIRED', { ...ctx, field })
      if (codePoints(s2[field]) > DRAMATURGICAL_FIELD_LIMITS.theoryField) {
        return invalid('CROSS_SECTION_DRAMATURGY_FIELD_TOO_LONG', { ...ctx, field })
      }
      if (CONTAMINATION_RE.test(s2[field])) {
        return invalid('CROSS_SECTION_DRAMATURGY_INPUT_CONTAMINATED', { ...ctx, field })
      }
      if (BEAT_OVERRIDE_RE.test(s2[field])) {
        return invalid('CROSS_SECTION_DRAMATURGY_BEAT_OVERRIDE', { ...ctx, field })
      }
    }

    const truth = fixture.dramaturgicalGroundTruth
    if (!isRecord(truth)
      || !Array.isArray(truth.observableMotivations) || truth.observableMotivations.length < 1
      || !Array.isArray(truth.acceptableStateChanges) || truth.acceptableStateChanges.length < 1
      || !Array.isArray(truth.prohibitedShortcuts) || truth.prohibitedShortcuts.length < 1
      || !isText(truth.evaluatorNote)
      || CONTAMINATION_RE.test(JSON.stringify(truth))) {
      return invalid('CROSS_SECTION_DRAMATURGY_GROUND_TRUTH_INVALID', ctx)
    }
  }

  return { valid: true }
}

export default {
  DRAMATURGICAL_FIXTURE_SCHEMA_VERSION,
  DRAMATURGICAL_FIELD_LIMITS,
  CROSS_SECTION_DRAMATURGICAL_FIXTURES,
  validateDramaturgicalFixtures
}
