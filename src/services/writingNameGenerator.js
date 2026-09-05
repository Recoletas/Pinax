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

const CATEGORY_REASONS = Object.freeze({
  person: ['音节清楚', '字形疏密均衡', '称呼顺口', '适合正文反复出现', '姓与名节奏分明', '昵称容易派生', '人物辨识度较高', '对白中不易混淆', '书面与口语兼容', '适合作为核心角色', '读音转折自然', '视觉重心稳定'],
  place: ['地貌意象明确', '适合作为章节地点', '方位辨识度高', '读音有空间感', '便于衍生辖区名', '适合地图标注', '环境气质鲜明', '可自然形成简称', '适合作为事件锚点', '远近层次清楚', '名称画面感集中', '正文指代不费力'],
  organization: ['组织属性清楚', '简称容易形成', '适合正式称谓', '阵营辨识度高', '便于成员自称', '适合公文语境', '权力气质明确', '可衍生下属机构', '敌我称呼都自然', '名称层级稳定', '适合反复提及', '徽记意象容易建立'],
  ability: ['动作感明确', '便于招式分级', '能力意象集中', '适合战斗叙述', '发动口令简洁', '力量来源可联想', '升级名称容易延展', '适合角色专属能力', '读音节奏有冲击', '效果边界易理解', '可形成体系词根', '战斗中指代清楚'],
  item: ['器物类型明确', '适合成为线索', '名称便于反复指代', '材质意象清楚', '适合作为关键道具', '易形成民间别称', '来源故事容易展开', '外观联想具体', '持有者关系好表达', '适合任务文本引用', '稀有度气质明确', '名称不易与人物混淆']
})

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
  const givenNames = length === 'two' ? given.single : length === 'multi' && fixed ? given.triple : given.double
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
  const usedSignatures = new Set()
  const result = []
  for (const value of shuffled([...new Set(candidates)], random)) {
    const core = signature(value)
    if (excluded.has(value) || usedSignatures.has(core)) continue
    result.push(value)
    usedSignatures.add(core)
    if (result.length >= count) break
  }
  return result
}

export function explainWritingName({ category = 'person', value = '', index = 0 } = {}) {
  const reasons = CATEGORY_REASONS[category] || CATEGORY_REASONS.person
  return reasons[Math.max(0, Number(index) || 0) % reasons.length]
}
