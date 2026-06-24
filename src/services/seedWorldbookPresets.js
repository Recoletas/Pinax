const STAGE2_GROUPS = ['硬约束', '文风约束', '禁写边界', '地理', '组织', '角色', '道具', '事件', '设定', '任务']

export const STAGE2_QUALITY_TARGETS = {
  minEvents: 6,
  maxEvents: 10,
  minFactions: 3,
  maxFactions: 5,
  minLocations: 5,
  maxLocations: 8,
  minRewriteDirections: 3
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeKeywords(values = [], fallback = '') {
  const fromArray = Array.isArray(values) ? values : [values]
  const seen = new Set()
  const result = []

  for (const value of [...fromArray, fallback]) {
    const normalized = normalizeText(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result.slice(0, 6)
}

function createSeedWorldbookEntry(type, name, keys, content, group, mode = '') {
  return {
    name: normalizeText(name),
    type,
    keys: normalizeKeywords(keys, name),
    content: normalizeText(content),
    group,
    mode
  }
}

function createSeedWorldbookPreset(preset) {
  return {
    sourceKind: 'seed-worldbook',
    sourceLabel: '首轮种子世界',
    groups: STAGE2_GROUPS,
    ...preset
  }
}

export const seedWorldbookPresets = [
  createSeedWorldbookPreset({
    id: 'preset-border-kingdom-fogtide',
    name: '边境王国 · 雾潮暮湾',
    genreLabel: '边境奇幻',
    description: '一个被雾潮、边境王权和行会契约牵扯的港口王国，适合直接开始调查、远征和势力抉择。',
    worldDescription: '雾潮笼罩的边境港口王国长期依赖王室、学院、行会和城防队维持秩序。探索者必须在未知异常、边境战争、港口税账和难民证词之间保持证据链。',
    writingStyle: '克制悬疑的边境奇幻语气，重视潮湿港雾、势力谈判、线索递进和人物谨慎判断。',
    forbidden: '不得无因推翻雾潮契约，不得让关键道具无限制解决所有危机，不得让王国势力无代价统一行动。',
    openingHook: '暮湾钟楼连续三夜停摆，北境难民带来“雾中军队”的消息，王室要求你在黎明前确认真相；行会则要求你先封存港口账簿。',
    creativeExits: ['写成边境调查章节', '整理成王国势力分镜', '整理成三方证据卡'],
    entries: [
      createSeedWorldbookEntry('rule', '暮湾一致性规则', ['暮湾', '雾潮', '契约'], '雾潮、学院、城防队和旧时代契约之间的因果必须稳定；任何新线索都要能回扣已有异常和调查记录。', '硬约束', 'constant'),
      createSeedWorldbookEntry('style', '奇幻调查文风', ['调查文风', '线索', '雾港'], '叙事以谨慎调查、湿冷港雾和证据递进为主，避免突然变成无约束战斗爽文。', '文风约束', 'constant'),
      createSeedWorldbookEntry('forbidden', '雾潮禁写边界', ['禁忌', '雾潮契约', '风蚀罗盘'], '禁止让风蚀罗盘无限使用，禁止无代价解除雾潮，禁止让角色在没有证据时直接得知真相。', '禁写边界', 'constant'),
      createSeedWorldbookEntry('location', '暮湾主城', ['暮湾', '主城'], '港雾常年笼罩的贸易主城，王室公署、城防队和盐税账房都在这里争夺调查主导权。', '地理'),
      createSeedWorldbookEntry('location', '银藤学院', ['银藤学院', '法师学院'], '培养探索者与记录官的学院，地下藏有古代观测仪，近期观测到雾潮频率异常。', '地理'),
      createSeedWorldbookEntry('location', '北境灰墙', ['北境', '灰墙'], '王国北部旧防线，难民、巡骑和失踪商队都从这里进入暮湾，墙外雾声像军号。', '地理'),
      createSeedWorldbookEntry('location', '灯痕码头', ['灯痕码头', '码头'], '潮盐行会控制的主码头，雾灯燃料在此交接，夜间账本与船旗经常对不上。', '地理'),
      createSeedWorldbookEntry('location', '雾灯仓库', ['雾灯仓库', '雾灯'], '储存雾灯燃芯和盐税封条的仓库，守卫称有人从没有门的墙边离开。', '地理'),
      createSeedWorldbookEntry('location', '暮湾钟楼', ['钟楼','值守室'], '钟楼内部值守室，停摆时刻的值守记录、失踪名单和当晚键位日志在此保管，是钟楼停摆事件的第一现场。', '地理'),
      createSeedWorldbookEntry('location', '沉钟沼泽', ['沉钟沼泽', '沉钟'], '旧王战争后被水淹没的钟塔遗址，雾潮夜会传出与暮湾钟楼相同的钟声。', '地理'),
      createSeedWorldbookEntry('location', '灰墙难民营', ['灰墙难民营','难民营'], '灰墙外的临时营地，苔娜领导的难民互助会在此驻扎，雾中军队的目击证词和失踪巡骑线索在此收集。', '地理'),
      createSeedWorldbookEntry('organization', '潮盐行会', ['潮盐行会', '行会'], '控制港口盐税和雾灯燃料的商人组织，公开支持王室，私下与学院互相试探。', '组织'),
      createSeedWorldbookEntry('organization', '王家巡骑团', ['巡骑团', '王家巡骑'], '负责北境道路和难民营安全的军务组织，近期不断要求城防队交出调查权。', '组织'),
      createSeedWorldbookEntry('organization', '银藤学院评议会', ['学院评议会', '银藤'], '掌握雾潮观测资料的学术势力，愿意合作但拒绝交出地下仪器记录。', '组织'),
      createSeedWorldbookEntry('organization', '灰墙难民互助会', ['互助会', '难民'], '北境难民自发组成的互助组织，既需要保护，也掌握雾中军队的第一手证词。', '组织'),
      createSeedWorldbookEntry('character', '伊薇队长', ['伊薇', '队长'], '城防调查队长，信奉先证据后判断，与你关系复杂但可靠。', '角色'),
      createSeedWorldbookEntry('character', '卢岑公使', ['卢岑', '公使'], '王室派来的年轻公使，急于证明雾潮与北境军情有关，擅长施压但缺乏现场经验。', '角色'),
      createSeedWorldbookEntry('character', '塔维克书记官', ['塔维克', '书记官'], '负责盐税旧账的中年书记官，记忆力惊人，但只愿在安全承诺后开口。', '角色'),
      createSeedWorldbookEntry('character', '苔娜难民领队', ['苔娜', '难民领队'], '带领北境难民进入暮湾的人，她知道灰墙外第一支失踪巡骑的去向。', '角色'),
      createSeedWorldbookEntry('character', '赫玛教授', ['赫玛', '教授'], '银藤学院雾潮史教授，坚称钟楼停摆不是机械故障，而是旧契约被重启。', '角色'),
      createSeedWorldbookEntry('character', '索德码头夜班头目', ['索德','夜班头目','码头夜班'], '潮盐行会的码头夜班头目，会直接挡查账、封账、拖时间，是第四轮明确反作用力人物。', '角色'),
      createSeedWorldbookEntry('item', '风蚀罗盘', ['罗盘', '风蚀罗盘'], '能够在异常雾潮中定位安全路径，但每次使用会损耗刻度，刻度归零后会指向使用者最恐惧的地点。', '道具'),
      createSeedWorldbookEntry('item', '雾灯燃芯', ['燃芯', '雾灯'], '维持港区雾灯的稀缺燃料，近期失窃数量足以让整条码头在雾潮夜熄灭。', '道具'),
      createSeedWorldbookEntry('item', '沉钟残片', ['沉钟残片', '钟楼'], '从沉钟沼泽捞出的青铜残片，表面刻痕会在钟楼停摆时渗出盐水。', '道具'),
      createSeedWorldbookEntry('event', '钟楼停摆事件', ['钟楼停摆', '停摆'], '城中钟楼在三日前停摆，引发港区谣言与恐慌；每次停摆都对应一份失踪记录。', '事件'),
      createSeedWorldbookEntry('event', '北境难民潮', ['难民潮', '北境'], '边境道路忽然涌入难民，他们声称看见不属于任何王国军旗的雾中军队。', '事件'),
      createSeedWorldbookEntry('event', '雾灯燃料失窃', ['燃料失窃', '雾灯'], '雾灯仓库少了十二箱燃芯，账面记录显示它们仍在码头等待验封。', '事件'),
      createSeedWorldbookEntry('event', '学院观测仪过载', ['观测仪', '过载'], '银藤学院地下观测仪在钟楼停摆同一刻过载，记录盘出现一段被人为刮除的曲线。', '事件'),
      createSeedWorldbookEntry('event', '观测曲线停摆对应', ['观测曲线','停摆对应','学院观测'], '银藤学院地下观测仪的异常曲线编号正对应钟楼每次停摆时刻，是把钟楼线、学院线、灰墙线织成一条链的硬证据。', '事件'),
      createSeedWorldbookEntry('event', '灰墙巡骑失踪', ['巡骑失踪', '灰墙'], '两名巡骑在护送难民时失踪，唯一留下的是被雾水浸透的王室密令副本。', '事件'),
      createSeedWorldbookEntry('event', '沼泽沉钟回响', ['沉钟回响', '沼泽'], '沉钟沼泽在无风夜响起钟声，声音与主城钟楼完全同步。', '事件'),
      createSeedWorldbookEntry('event', '行会夜账泄露', ['夜账', '行会'], '潮盐行会的夜账被匿名贴到公署门口，显示燃芯流向北境灰墙。', '事件'),
      createSeedWorldbookEntry('event', '王室密令抵达', ['王室密令', '密令'], '王室密令要求在日出前封锁难民营；执行密令会切断关键证人，拒绝则会得罪巡骑团。', '事件'),
      createSeedWorldbookEntry('lore', '雾潮契约', ['雾潮契约', '契约'], '旧时代流传下来的雾潮仪式约定，要求城民在雾潮之夜降低火光与声响。', '设定'),
      createSeedWorldbookEntry('lore', '暮湾盐税', ['盐税', '暮湾'], '暮湾用盐税供养雾灯和城防，盐税账本也是行会、王室和学院的权力边界。', '设定'),
      createSeedWorldbookEntry('lore', '旧王边境战争', ['旧王战争', '边境'], '上一代王室在北境灰墙外封存过一场失败战役，战争记录与雾潮契约同时缺页。', '设定'),
      createSeedWorldbookEntry('quest', '黎明前的钟楼调查', ['钟楼调查', '黎明'], '在黎明前确认钟楼停摆、难民证词和雾潮异动之间是否存在同一条因果链。', '任务'),
      createSeedWorldbookEntry('quest', '雾灯仓库谈判', ['仓库谈判', '雾灯'], '在潮盐行会、城防队和学院之间谈判，找出燃芯失窃的真实流向。', '任务'),
      createSeedWorldbookEntry('quest', '灰墙真相分岔', ['灰墙真相', '分岔'], '在灰墙现场做硬选择：当场失去证人（让苔娜离开雾潮夜）/ 失去账本窗口（让索德封掉港口夜账）/ 失去巡骑追踪时机（让巡骑团带难民撤回王都）。三选一，每条路径都会改变暮湾势力关系。', '任务')
    ]
  }),
  createSeedWorldbookPreset({
    id: 'preset-urban-old-files',
    name: '都市异闻 · 北岸旧档',
    genreLabel: '都市异闻',
    description: '现代城市里的媒体、律所、企业公关和异常传闻互相缠绕，适合调查、关系网和悬疑分支。',
    worldDescription: '北岸市表面由媒体、律所、刑侦支队和企业公关维持秩序，暗处的信息网、旧档案、地下社群和异闻目击不断影响案件走向。',
    writingStyle: '现实悬疑与都市异闻混合风格，语气冷静，强调证据、时间线、访谈、信息差和暧昧异常。',
    forbidden: '不得用超自然能力直接破案，不得跳过证据链宣告真相，不得把所有异闻都解释成万能阴谋。',
    openingHook: '北岸传媒大厦凌晨坠楼，监控缺失七分钟；死者笔记里反复写着“第三层信息网在看我们”，晨星公关要求你先交出笔记。',
    creativeExits: ['写成都市调查章节', '整理成人物关系分镜', '扩展新案件/异闻'],
    entries: [
      createSeedWorldbookEntry('rule', '证据链规则', ['证据链', '监控', '资金流'], '案件推进必须依赖证词、监控、资金流或物证，不得让角色凭空知道幕后真相。', '硬约束', 'constant'),
      createSeedWorldbookEntry('style', '都市悬疑文风', ['都市悬疑', '调查', '信息差'], '叙事保持克制现实感，用细节、采访和时间线错位制造紧张，不使用夸张玄幻解决方案。', '文风约束', 'constant'),
      createSeedWorldbookEntry('forbidden', '破案禁写边界', ['禁忌', '无证推理', '超自然'], '禁止无证推理成功，禁止关键证据被一句话带过，禁止把普通都市案件写成超自然干预。', '禁写边界', 'constant'),
      createSeedWorldbookEntry('location', '北岸传媒大厦', ['北岸传媒', '大厦'], '新闻与公关中心，内部流传一份不能公开的旧档案，坠楼现场位于第十九层露台。', '地理'),
      createSeedWorldbookEntry('location', '旧港地下站', ['旧港站', '地下站'], '废弃地铁站改造出的地下社群据点，许多异闻目击者会在这里交换消息。', '地理'),
      createSeedWorldbookEntry('location', '白榆律所', ['白榆律所', '律所'], '周岚所在的商业律所，档案室保存着多家企业互相封口的协议副本。', '地理'),
      createSeedWorldbookEntry('location', '滨江数据中心', ['数据中心', '滨江'], '北岸市多数监控备份的异地机房，火警记录和门禁记录经常不一致。', '地理'),
      createSeedWorldbookEntry('location', '城东废弃医院', ['废弃医院', '城东'], '旧城区拆迁前遗留的医院，异闻社群称这里能看到“重复播放的七分钟”。', '地理'),
      createSeedWorldbookEntry('organization', '晨星公关', ['晨星公关', '公关公司'], '专门替企业和名人处理舆论危机的公司，擅长制造可验证但不完整的事实。', '组织'),
      createSeedWorldbookEntry('organization', '三层信息网', ['三层信息网', '暗线'], '由记者、律师、黑客和匿名目击者组成的松散信息网络，真假消息混杂。', '组织'),
      createSeedWorldbookEntry('organization', '北岸市刑侦支队', ['刑侦支队', '北岸警方'], '负责坠楼案的官方调查力量，内部有人想快速结案，也有人暗中保护证人。', '组织'),
      createSeedWorldbookEntry('organization', '恒岳资本', ['恒岳资本', '资本方'], '多起旧城区开发和媒体收购的幕后投资方，与晨星公关有长期合同。', '组织'),
      createSeedWorldbookEntry('character', '沈述记者', ['沈述', '记者'], '调查记者，擅长追踪资金流，嘴硬心软，认识死者但不愿先承认。', '角色'),
      createSeedWorldbookEntry('character', '周岚律师', ['周岚', '律师'], '商业诉讼专家，知晓多家企业的隐秘协议，习惯用程序正义掩护真正目标。', '角色'),
      createSeedWorldbookEntry('character', '阿蒙', ['阿蒙', '线人'], '长期混迹旧港地下站的匿名线人，掌握异闻社群的目击记录，但从不免费给出完整答案。', '角色'),
      createSeedWorldbookEntry('character', '顾槐刑警', ['顾槐', '刑警'], '刑侦支队办案人，表面冷淡，暗中查过死者电脑的离线备份。', '角色'),
      createSeedWorldbookEntry('character', '林以南产品总监', ['林以南', '总监'], '恒岳资本投资公司的产品总监，熟悉数据中心权限，声称坠楼案只是商业勒索。', '角色'),
      createSeedWorldbookEntry('item', '缺页笔记本', ['笔记本', '缺页'], '受害者遗留笔记，本应记录线索的几页被完整裁走，剩余页码却没有断裂。', '道具'),
      createSeedWorldbookEntry('item', '七分钟监控备份', ['监控备份', '七分钟'], '从数据中心导出的低清备份，画面被强光覆盖，但音轨保留了三次电梯提示音。', '道具'),
      createSeedWorldbookEntry('item', '蓝色门禁卡', ['蓝色门禁卡', '门禁'], '只能开启传媒大厦三处冷门通道的临时门禁卡，登记人已在系统中被删除。', '道具'),
      createSeedWorldbookEntry('event', '凌晨坠楼案', ['坠楼案', '凌晨案'], '看似意外的坠楼事件，留下了被篡改的监控时间轴和两份互相矛盾的通报。', '事件'),
      createSeedWorldbookEntry('event', '七分钟空白', ['七分钟', '监控空白'], '坠楼前后所有监控同时缺失七分钟，且不同设备显示的系统时间互相冲突。', '事件'),
      createSeedWorldbookEntry('event', '旧档案泄露', ['旧档案', '泄露'], '匿名账号放出一页旧档案，指向五年前城东医院的停电事故。', '事件'),
      createSeedWorldbookEntry('event', '线人失约', ['线人失约', '阿蒙'], '阿蒙约你在旧港地下站见面却没有出现，只留下写着“不要相信第一层”的车票。', '事件'),
      createSeedWorldbookEntry('event', '匿名直播预告', ['匿名直播', '预告'], '一个匿名频道宣布午夜直播坠楼案真相，晨星公关同步准备了反向舆论稿。', '事件'),
      createSeedWorldbookEntry('event', '律所被搜查', ['律所搜查', '白榆律所'], '白榆律所突然被警方搜查，周岚怀疑有人试图拿走封口协议。', '事件'),
      createSeedWorldbookEntry('event', '数据中心火警', ['火警', '数据中心'], '滨江数据中心在调取备份时触发火警，现场温度正常，烟感记录却显示持续升高。', '事件'),
      createSeedWorldbookEntry('event', '废弃医院目击', ['医院目击', '城东'], '目击者声称在城东废弃医院看到死者进入电梯，而那台电梯早已拆除。', '事件'),
      createSeedWorldbookEntry('lore', '北岸异闻档案', ['异闻档案', '北岸'], '北岸市存在一批无法完全归档的目击记录，常与企业危机、旧城区拆迁和失踪人口交错。', '设定'),
      createSeedWorldbookEntry('lore', '第三层信息网传闻', ['第三层', '信息网'], '“第三层信息网”既像真实组织，也像办案人用来互相测试的暗号。', '设定'),
      createSeedWorldbookEntry('lore', '舆论清洗协议', ['舆论清洗', '协议'], '企业、公关和媒体之间长期存在非正式协议，会用可验证的小事实覆盖关键真相。', '设定'),
      createSeedWorldbookEntry('quest', '追查第三层信息网', ['追查', '第三层'], '从坠楼案、缺页笔记本和旧港线人入手，确认“第三层信息网”是否真实存在。', '任务'),
      createSeedWorldbookEntry('quest', '还原七分钟时间线', ['七分钟时间线', '还原'], '比对监控备份、门禁记录、音轨和目击证词，还原坠楼前后七分钟。', '任务'),
      createSeedWorldbookEntry('quest', '公开或封存证据', ['公开证据', '封存证据'], '在保护证人、避免舆论操控和推动真相之间做选择，决定北岸旧档后续走向。', '任务')
    ]
  }),
  createSeedWorldbookPreset({
    id: 'preset-helios-colony',
    name: '近未来殖民地 · 赫利俄斯',
    genreLabel: '近未来科幻',
    description: '一个资源紧张、派系分裂、通讯受限的边境殖民地，适合任务流、灾害和伦理抉择。',
    worldDescription: '赫利俄斯殖民地由前哨站、远征舰队、矿业财团、生态穹顶和自治议会共同维系。静默区、补给限制、未知信号和生态改造失败构成主要风险。',
    writingStyle: '任务流近未来科幻语气，关注流程、资源、风险评估、团队协作和殖民地伦理。',
    forbidden: '不得无视联邦协定 17-B，不得让折跃与通讯绕开所有风险限制，不得让殖民地资源问题被一句万能科技解决。',
    openingHook: '静默区三支巡检小队失联，氧气配给只够 72 小时；自治议会和矿业财团都要求你先保护他们的利益，舰队纪律处则禁止全频广播。',
    creativeExits: ['写成殖民地任务章节', '整理成灾害救援分镜', '扩展派系/科技限制'],
    entries: [
      createSeedWorldbookEntry('rule', '远征程序规则', ['远征程序', '17-B', '静默区'], '未知信号、折跃、全频广播和边境行动必须遵守联邦协定 17-B，违规会引发明确后果。', '硬约束', 'constant'),
      createSeedWorldbookEntry('style', '星际任务文风', ['任务流', '硬科幻', '风险评估'], '叙事偏向程序化任务、资源权衡和冷静风险评估，避免用万能科技瞬间消解危机。', '文风约束', 'constant'),
      createSeedWorldbookEntry('forbidden', '科技禁写边界', ['禁忌', '折跃', '通讯'], '禁止无代价全频广播，禁止折跃芯簇无限供应，禁止角色忽略供氧、补给和轨道风险。', '禁写边界', 'constant'),
      createSeedWorldbookEntry('location', '赫利俄斯前哨站', ['前哨站', '赫利俄斯'], '位于边境轨道的补给站，长期受微陨石风暴干扰，是所有救援任务的出发点。', '地理'),
      createSeedWorldbookEntry('location', '静默区矿坑', ['静默区', '矿坑'], '殖民地北部的废弃矿坑群，通讯信号会被周期性吞噬，仍残留自动采掘设备。', '地理'),
      createSeedWorldbookEntry('location', '生态穹顶', ['生态穹顶', '氧气'], '殖民地居住区和供氧核心，过滤系统正因未知微粒堵塞而效率下降。', '地理'),
      createSeedWorldbookEntry('location', '轨道补给环', ['补给环', '轨道'], '连接舰队和地表殖民地的补给环，轨道风暴期间只能开启短窗口转运。', '地理'),
      createSeedWorldbookEntry('location', '旧殖民船坞', ['旧船坞', '殖民船坞'], '第一批殖民船遗留的维修区，保留着早期生态改造失败前的日志。', '地理'),
      createSeedWorldbookEntry('location', '赤沙观测阵列', ['赤沙阵列', '观测阵列'], '用于监测静默区电磁回声的地表阵列，最近开始重复播放失联小队的求救码。', '地理'),
      createSeedWorldbookEntry('organization', '自治议会', ['自治议会', '议会'], '殖民地居民自组的决策机构，优先保护生存配给和居住区安全。', '组织'),
      createSeedWorldbookEntry('organization', '奥尔特矿业', ['奥尔特矿业', '矿业财团'], '持有赫利俄斯大部分采矿设备的财团，宣称失联小队带走了重要勘探数据。', '组织'),
      createSeedWorldbookEntry('organization', '远征舰队纪律处', ['纪律处', '远征舰队'], '负责执行联邦协定 17-B 的舰队监察系统，宁愿放弃小队也不愿引发信号污染。', '组织'),
      createSeedWorldbookEntry('organization', '生态穹顶工会', ['穹顶工会', '生态工会'], '维护供氧、滤芯和居住区安全的一线工人组织，掌握真实配给表。', '组织'),
      createSeedWorldbookEntry('character', '林霁舰长', ['林霁', '舰长'], '远征舰指挥官，强调程序与纪律，但对平民保持克制。', '角色'),
      createSeedWorldbookEntry('character', '玛拉工程师', ['玛拉', '工程师'], '生态穹顶维护负责人，掌握氧气配给真实数据，对矿业财团极不信任。', '角色'),
      createSeedWorldbookEntry('character', '凯恩监察官', ['凯恩', '监察官'], '舰队纪律处派驻人员，负责阻止任何违反 17-B 的救援方案。', '角色'),
      createSeedWorldbookEntry('character', '索拉矿工代表', ['索拉', '矿工代表'], '静默区矿工代表，坚称矿业财团隐瞒了事故前的异常信号记录。', '角色'),
      createSeedWorldbookEntry('character', 'A-17 仿生译员', ['A-17', '仿生译员'], '负责解析未知信号的仿生单位，开始用失联小队的语气复述日志。', '角色'),
      createSeedWorldbookEntry('item', '折跃芯簇', ['折跃芯簇', '芯簇'], '维持短距折跃稳定的核心组件，库存稀缺，只能支撑一次高风险救援窗口。', '道具'),
      createSeedWorldbookEntry('item', '失联小队黑匣', ['黑匣', '失联小队'], '记录三支巡检小队最后任务参数的黑匣，可能被静默区回声污染。', '道具'),
      createSeedWorldbookEntry('item', '氧气配给密钥', ['配给密钥', '氧气'], '能调整生态穹顶配给优先级的权限密钥，公开使用会引发议会和工会冲突。', '道具'),
      createSeedWorldbookEntry('event', '静默区失联', ['静默区', '失联'], '三支巡检小队进入静默区后全部失联，仅返还空白日志。', '事件'),
      createSeedWorldbookEntry('event', '氧气配给危机', ['氧气配给', '危机'], '生态穹顶过滤系统异常，剩余氧气配给被迫按派系优先级重新分配。', '事件'),
      createSeedWorldbookEntry('event', '轨道风暴预警', ['轨道风暴', '预警'], '微陨石风暴压缩了补给窗口，救援队只能在短时间内完成投送和回收。', '事件'),
      createSeedWorldbookEntry('event', '矿业数据封锁', ['数据封锁', '矿业'], '奥尔特矿业拒绝公开失联前的采掘数据，声称涉及商业机密。', '事件'),
      createSeedWorldbookEntry('event', '生态穹顶裂隙', ['穹顶裂隙', '生态穹顶'], '居住区穹顶出现细小裂隙，过滤系统检测到与静默区相同的电磁残留。', '事件'),
      createSeedWorldbookEntry('event', '黑匣回声重放', ['黑匣回声', '重放'], '回收黑匣前，观测阵列开始播放一段尚未发生的求救录音。', '事件'),
      createSeedWorldbookEntry('event', '自治议会紧急表决', ['紧急表决', '自治议会'], '议会要求表决是否优先撤离居民、救援小队或保护矿坑数据。', '事件'),
      createSeedWorldbookEntry('event', '未知信号复现', ['未知信号', '复现'], '静默区信号在多个频道复现，并开始模仿殖民地内部通讯格式。', '事件'),
      createSeedWorldbookEntry('lore', '联邦协定 17-B', ['17-B', '协定'], '边境行动中的旧版联邦协定，记录了未知信号源附近的通讯风险与回声干扰案例。', '设定'),
      createSeedWorldbookEntry('lore', '赫利俄斯改造失败史', ['改造失败', '赫利俄斯'], '殖民地早期生态改造失败留下大量地下空腔和封存日志，矿业财团一直回避这段历史。', '设定'),
      createSeedWorldbookEntry('lore', '静默区回声污染', ['回声污染', '静默区'], '静默区会复写通讯内容并延迟返还，导致救援信息真假难辨。', '设定'),
      createSeedWorldbookEntry('quest', '回收黑匣任务', ['黑匣', '回收任务'], '需在 72 小时内回收失联小队黑匣，避免航线被封锁。', '任务'),
      createSeedWorldbookEntry('quest', '72 小时配给决策', ['配给决策', '72小时'], '在救援、撤离和维持生态穹顶之间分配有限氧气与折跃资源。', '任务'),
      createSeedWorldbookEntry('quest', '确认未知信号来源', ['未知信号', '来源'], '判断静默区信号是设备回声、矿坑事故还是外源接触，并决定是否违反 17-B 广播求援。', '任务')
    ]
  })
]

export function summarizeSeedWorldbookQuality(preset) {
  const entries = Array.isArray(preset?.entries) ? preset.entries : []
  const countType = (type) => entries.filter(entry => entry?.type === type).length

  return {
    events: countType('event'),
    factions: countType('organization'),
    locations: countType('location'),
    rewriteDirections: Array.isArray(preset?.creativeExits) ? preset.creativeExits.length : 0,
    hasOpeningDilemma: normalizeText(preset?.openingHook).length >= 20,
    hasWorldDescription: normalizeText(preset?.worldDescription).length >= 40,
    hasWritingStyle: normalizeText(preset?.writingStyle).length >= 16,
    hasForbidden: normalizeText(preset?.forbidden).length >= 16,
    constraints: {
      rule: entries.some(entry => entry?.type === 'rule' && entry?.mode === 'constant'),
      style: entries.some(entry => entry?.type === 'style' && entry?.mode === 'constant'),
      forbidden: entries.some(entry => entry?.type === 'forbidden' && entry?.mode === 'constant')
    }
  }
}
