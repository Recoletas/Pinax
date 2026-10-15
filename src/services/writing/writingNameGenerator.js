const CHINESE_SURNAMES = ['沈', '顾', '陆', '谢', '裴', '江', '闻', '宋', '程', '许', '周', '林', '陈', '苏', '叶', '秦', '纪', '温', '乔', '唐', '梁', '贺', '夏', '杜', '孟', '萧', '白', '徐', '韩', '黎', '陶', '钟']
const CHINESE_COMPOUND_SURNAMES = ['欧阳', '司徒', '上官', '诸葛', '南宫', '慕容', '夏侯', '东方']
const CHINESE_GIVEN = {
  male: {
    single: ['川', '衡', '砚', '朔', '澈', '岳', '昭', '叙', '驰', '修', '珩', '屿', '晏', '骁', '谦', '铮', '远', '舟'],
    double: ['既明', '景和', '叙川', '怀瑾', '临岳', '知衡', '修远', '允执', '行简', '照野', '云峥', '砚舟', '时安', '清越', '庭深', '闻洲', '岑远', '谨言', '言蹊', '嘉树', '鹤川', '明川', '至衡', '星野'],
    triple: ['景行之', '云归远', '闻道川', '明照野', '知临岳', '叙长风', '鹤归山', '言修远', '怀清越', '照庭深', '砚闻洲', '允嘉树']
  },
  female: {
    single: ['仪', '晏', '微', '舒', '月', '乔', '姝', '宁', '漪', '桐', '雪', '岫', '棠', '蘅', '澜', '霁', '遥', '音'],
    double: ['令仪', '清晏', '知微', '望舒', '庭月', '南乔', '静姝', '攸宁', '明漪', '疏桐', '映雪', '云岫', '晚棠', '若蘅', '听澜', '初霁', '星遥', '知夏', '书音', '清嘉', '月白', '见微', '云舒', '宜安'],
    triple: ['月见溪', '云知夏', '书照晚', '清如许', '星落野', '南望舒', '庭映雪', '宜长宁', '疏晚棠', '若听澜', '明初霁', '令清嘉']
  },
  neutral: {
    single: ['宁', '澜', '安', '川', '初', '溪', '野', '时', '言', '景', '禾', '舟', '霁', '昭', '白', '青', '星', '遥'],
    double: ['知许', '长宁', '听澜', '星回', '见山', '清和', '予安', '时雨', '言川', '景初', '岁安', '闻溪', '云舟', '照临', '青野', '明夷', '知白', '星遥', '临溪', '清晖', '以宁', '见川', '怀青', '既白'],
    triple: ['星见野', '云照川', '时听澜', '知归处', '明见山', '青临溪', '予长宁', '言清和', '景知白', '岁闻溪', '怀青野', '照清晖']
  }
}

const WESTERN = {
  male: ['Adrian', 'Julian', 'Elias', 'Theo', 'Leon', 'Felix', 'Dorian', 'Silas', 'Arthur', 'Edwin', 'Lucian', 'Miles', 'Oscar', 'Simon', 'Vincent', 'Hugo', 'Caleb', 'Nathan', 'Alistair', 'Cedric', 'Gideon', 'Jasper', 'Leander', 'Marcus', 'Nolan', 'Raphael', 'Tristan', 'Wesley'],
  female: ['Clara', 'Elena', 'Iris', 'Nora', 'Celia', 'Vera', 'Diana', 'Sylvia', 'Alice', 'Audrey', 'Evelyn', 'Flora', 'Helena', 'Mabel', 'Rosalie', 'Vivian', 'Esther', 'Louisa', 'Beatrice', 'Camille', 'Delia', 'Freya', 'Isolde', 'Lydia', 'Marina', 'Ophelia', 'Sabine', 'Thea'],
  neutral: ['Avery', 'Morgan', 'Rowan', 'Robin', 'Ellis', 'Quinn', 'Sage', 'Riley', 'Alex', 'Casey', 'Jamie', 'Jordan', 'Reese', 'Taylor', 'Emery', 'Blair', 'Cameron', 'Skyler', 'Arden', 'Dakota', 'Finley', 'Harper', 'Lennon', 'Marlow', 'Parker', 'Remy', 'Shiloh', 'Winter'],
  last: ['Vale', 'Hart', 'Rowe', 'Mercer', 'Arden', 'Ward', 'Hale', 'Reed', 'Bennett', 'Clarke', 'Dawson', 'Everett', 'Frost', 'Gray', 'Hayes', 'Lowe', 'Marlow', 'North', 'Rhodes', 'Sterling', 'Voss', 'Wells']
}

const JAPANESE = {
  surnames: ['藤原', '高桥', '神谷', '森川', '橘', '白石', '雨宫', '九条', '朝仓', '北川', '青木', '小野', '佐久间', '水野', '月岛', '相泽', '冬木', '黑泽'],
  male: ['朔', '律', '湊', '苍真', '悠人', '莲', '遥斗', '凛太郎', '直树', '和真', '伊织', '晴人', '奏太', '优希', '拓海', '修平', '新', '树', '朝阳', '冬马', '景吾', '圭介', '诚司', '宗一郎', '智也', '雅人'],
  female: ['澪', '千夏', '纱月', '葵', '诗织', '结衣', '铃', '和叶', '美月', '七海', '小春', '明日香', '琴音', '真白', '凉子', '雫', '萤', '茜', '彩乃', '冬花', '花音', '佳奈', '莉子', '麻衣', '奈绪', '由纪'],
  neutral: ['凪', '光', '岚', '泉', '青', '遥', '椿', '薰', '枫', '翼', '空', '陆', '晶', '奏', '日向', '千景', '瑞希', '悠', '朝日', '春', '景', '零', '真琴', '千寻', '琉生', '伊吹']
}

const CATEGORY_PARTS = Object.freeze({
  place: {
    heads: ['雾隐', '星沉', '长风', '白石', '烬河', '青崖', '月渡', '霜原', '栖鹤', '落潮', '望海', '赤沙', '云岫', '寒川', '鸣泉', '暮钟', '沉舟', '照野', '空庭', '归墟'],
    tails: ['港', '城', '关', '谷', '岛', '原', '镇', '堡', '泽', '岭', '渡', '庭']
  },
  organization: {
    heads: ['白塔', '巡夜', '潮汐', '星环', '灰烬', '秘仪', '长风', '黑帆', '银钥', '北境', '旧港', '赤羽', '镜湖', '天衡', '无昼', '青铜', '观星', '烛影', '归航', '静默'],
    tails: ['议会', '学会', '商盟', '工坊', '骑士团', '档案局', '守望会', '航路司', '密社', '公会', '同盟', '书院']
  },
  ability: {
    heads: ['逐星', '断潮', '听风', '照夜', '燃血', '回响', '折光', '凝霜', '引雷', '渡影', '观心', '封灵', '逆流', '踏月', '裂空', '归元', '织梦', '锁魂', '借火', '静域'],
    tails: ['术', '法', '式', '诀', '印', '领域', '回路', '共鸣', '仪轨', '秘章', '步', '真言']
  },
  item: {
    heads: ['星砂', '旧王', '雾海', '月蚀', '长夜', '赤铜', '寒鸦', '潮声', '白骨', '青金', '无铭', '归航', '断弦', '镜心', '余烬', '霜纹', '沉钟', '逐光', '秘银', '空庭'],
    tails: ['短刃', '怀表', '手杖', '指环', '罗盘', '灯盏', '卷轴', '面具', '钥匙', '徽章', '长弓', '匣']
  }
})

// 常用姓名用字组合，增加可选空间，避免始终复用少量固定双字名。
const GIVEN_PARTS = {
  male: ['志文明建国伟世振承启正立成永宏俊博浩宇泽瑞康健嘉学德仁思元维绍致', '明华安平和文成荣杰辉峰远诚毅宁轩辰阳泽川林海松柏舟'],
  female: ['文慧敏静淑雅丽佳美婉怡欣思晓秋春玉秀芳燕琳雯瑶晴悦宁舒安芸涵洁颖珊', '华文安宁然晴月云雪玉玲琳雯瑶怡悦欣涵萱莹颖慧雅芸洁彤晨秋'],
  neutral: ['文明嘉思安宁子亦予景时清云天雨星晨晓秋春溪庭书言知怀', '文安宁然和平川明远辰雨青林言初晨阳秋新清凡泽柏松舟']
}

function shuffled(items, random) {
  return [...items]
    .map((value) => ({ value, order: random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ value }) => value)
}

function chineseCandidates({ length, gender, surname }) {
  const given = CHINESE_GIVEN[gender] || CHINESE_GIVEN.neutral
  const fixed = String(surname || '').trim()
  const surnames = fixed ? [fixed] : (length === 'multi' ? [...CHINESE_COMPOUND_SURNAMES, ...CHINESE_SURNAMES] : CHINESE_SURNAMES)
  const [starts, ends] = GIVEN_PARTS[gender] || GIVEN_PARTS.neutral
  const characters = [...new Set(Array.from(starts + ends))]
  const pairs = Array.from(starts).flatMap((first) => Array.from(ends).filter((last) => last !== first).map((last) => first + last))
  const givenNames = length === 'two' ? [...new Set([...given.single, ...characters])] : length === 'multi' && fixed ? given.triple : [...new Set([...given.double, ...pairs])]
  const candidates = []
  for (const family of surnames) {
    for (const personal of givenNames) {
      if (length === 'two' && family.length + personal.length !== 2) continue
      if (length === 'three' && family.length + personal.length !== 3) continue
      if (length === 'multi' && family.length + personal.length < 4) continue
      candidates.push(`${family}${personal}`)
    }
  }
  return candidates
}

function westernCandidates({ length, gender }) {
  const first = WESTERN[gender] || WESTERN.neutral
  const candidates = []
  for (const given of first) {
    for (const family of WESTERN.last) {
      if (length === 'two') candidates.push(given)
      else if (length === 'three') candidates.push(`${given} ${family}`)
      else candidates.push(`${given} ${family}`, `${given} de ${family}`, `${given} ${family}-${WESTERN.last[(WESTERN.last.indexOf(family) + 7) % WESTERN.last.length]}`)
    }
  }
  return candidates
}

function japaneseCandidates({ length, gender }) {
  const givenNames = JAPANESE[gender] || JAPANESE.neutral
  const candidates = []
  for (const family of JAPANESE.surnames) {
    for (const given of givenNames) {
      const value = `${family}${given}`
      if (length === 'two' && value.length !== 2) continue
      if (length === 'three' && value.length !== 3) continue
      if (length === 'multi' && value.length < 4) continue
      candidates.push(value)
    }
  }
  // 部分日式姓氏本身已是二字，短名用单名呈现，避免筛选后空结果。
  if (!candidates.length && length === 'two') candidates.push(...givenNames.filter((name) => name.length <= 2))
  return candidates
}

function categoryCandidates(category) {
  const parts = CATEGORY_PARTS[category]
  if (!parts) return []
  const candidates = []
  for (const head of parts.heads) {
    for (const tail of parts.tails) candidates.push(`${head}${tail}`)
  }
  return candidates
}

export function generateWritingNames({ category = 'person', language = 'chinese', length = 'three', gender = 'neutral', surname = '', exclude = [], count = 12, random = Math.random } = {}) {
  const candidates = category !== 'person'
    ? categoryCandidates(category)
    : language === 'western'
      ? westernCandidates({ length, gender })
      : language === 'japanese'
        ? japaneseCandidates({ length, gender })
        : chineseCandidates({ length, gender, surname })
  const excluded = new Set((exclude || []).map((value) => String(value).trim()).filter(Boolean))
  const signature = (value) => {
    if (category !== 'person') return value.slice(0, 2)
    if (language === 'western') return value.split(/\s+/)[0]
    const families = language === 'japanese'
      ? [...JAPANESE.surnames]
      : [String(surname || '').trim(), ...CHINESE_COMPOUND_SURNAMES, ...CHINESE_SURNAMES].filter(Boolean)
    const family = families.sort((a, b) => b.length - a.length).find((item) => value.startsWith(item))
    return family ? value.slice(family.length) : value
  }
  const recentSignatures = new Set([...excluded].map(signature))
  const usedSignatures = new Set()
  const result = []
  const ordered = shuffled([...new Set(candidates)], random)
  // 优先避开近期同名核心；小名字池耗尽时允许换姓，但不重复完整姓名。
  for (const avoidRecentCore of [true, false]) {
    for (const value of ordered) {
      const core = signature(value)
      if (excluded.has(value) || usedSignatures.has(core) || (avoidRecentCore && recentSignatures.has(core))) continue
      result.push(value)
      usedSignatures.add(core)
      if (result.length >= count) return result
    }
  }
  return result
}
