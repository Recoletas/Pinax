function node(id, text) {
  return {
    type: 'paragraph',
    attrs: { nodeId: id, nodeRevision: `${id}-r1` },
    content: [{ type: 'text', text }]
  }
}

function document(projectId, chapterId, order, rows) {
  return {
    projectId,
    documentId: chapterId,
    chapterId,
    documentRole: 'manuscript',
    title: chapterId,
    order,
    documentRevision: `${chapterId}-r1`,
    document: {
      type: 'doc',
      content: rows.map(([nodeId, content], unitOrder) => ({
        type: 'writingUnit',
        attrs: { unitId: `unit-${nodeId}`, unitRevision: `unit-${nodeId}-r1` },
        content: [node(nodeId, content)],
        unitOrder
      }))
    }
  }
}

function fixture({ id, operation, subjectRef = '', before, after, rationale, chapters, worldbookEntries, target, links, gold, terms }) {
  const projectId = `f3-${id}`
  return Object.freeze({
    id,
    projectId,
    operation,
    subjectRef,
    before,
    after,
    rationale,
    target,
    documents: chapters.map(([chapterId, rows], order) => document(projectId, chapterId, order, rows)),
    worldbookEntries,
    links,
    goldTargetRefs: gold,
    baselineTerms: terms
  })
}

export const AUTHORING_CAUSAL_SANDBOX_FIXTURES = Object.freeze([
  fixture({
    id: 'character-enters-scene',
    operation: 'add-presence',
    subjectRef: 'worldbook-entry:edgar',
    before: '会客室里只有莉娜。',
    after: '艾德加也在会客室。',
    rationale: '让艾德加亲眼看到交换，并改变后续证词。',
    target: { documentId: 'chapter-2', nodeId: 'arrival' },
    worldbookEntries: [
      ['edgar', '艾德加', '谨慎的调查员，习惯记住现场细节。'],
      ['parlor', '会客室', '旅馆二层用于私下会面的房间。']
    ],
    chapters: [
      ['chapter-2', [
        ['arrival', '会客室里只有莉娜，她独自完成了交换。'],
        ['witness', '莉娜后来坚称交换时没有任何目击者。'],
        ['alibi', '艾德加说自己当晚从未进过会客室。'],
        ['portrait', '墙上那幅艾德加先祖的肖像注视着壁炉。']
      ]],
      ['chapter-4', [
        ['testimony', '审讯中，莉娜的证词因无人佐证而被采信。'],
        ['garden', '花园里也有一间被称作会客室的小亭子。']
      ]]
    ],
    links: [
      ['worldbook-entry:edgar', 'node:chapter-2:witness', 'present-in', true, '艾德加在场会使“没有目击者”的陈述失效。'],
      ['worldbook-entry:edgar', 'node:chapter-2:alibi', 'present-in', true, '艾德加进入会客室与他的不在场说法冲突。'],
      ['worldbook-entry:edgar', 'node:chapter-4:testimony', 'depends-on', true, '证词被采信依赖交换时无人目击。'],
      ['worldbook-entry:edgar', 'node:chapter-2:portrait', 'mentions', false, '文字也出现了艾德加，但只是肖像。']
    ],
    gold: ['node:chapter-2:witness', 'node:chapter-2:alibi', 'node:chapter-4:testimony'],
    terms: ['艾德加', '会客室', '目击', '交换']
  }),
  fixture({
    id: 'rain-becomes-blackout',
    operation: 'change-event',
    before: '暴雨封住了山路。',
    after: '全城突然停电。',
    rationale: '把环境阻碍从交通中断改为照明和设备失效。',
    target: { documentId: 'chapter-3', nodeId: 'storm' },
    worldbookEntries: [
      ['city-power', '旧城电网', '旅馆监控与电梯依赖同一条市电线路。'],
      ['mountain-road', '北侧山路', '强降雨时容易发生塌方。']
    ],
    chapters: [
      ['chapter-3', [
        ['storm', '暴雨封住了山路，所有车辆都停在旅馆。'],
        ['camera', '走廊监控整夜正常工作，录下了凶手的身影。'],
        ['elevator', '莉娜乘电梯抵达顶层，没有走过黑暗的楼梯。'],
        ['road', '警察因山路塌方直到清晨才抵达。'],
        ['rain-song', '酒吧里播放着名为《停电暴雨》的旧歌。']
      ]],
      ['chapter-5', [
        ['recording', '审判以走廊监控录像作为关键证据。'],
        ['picnic', '三年前那场暴雨取消了镇上的野餐。']
      ]]
    ],
    links: [
      ['node:chapter-3:storm', 'node:chapter-3:camera', 'causes', true, '停电会使依赖市电的走廊监控中断。'],
      ['node:chapter-3:storm', 'node:chapter-3:elevator', 'causes', true, '停电会让电梯无法按原路径运行。'],
      ['node:chapter-3:camera', 'node:chapter-5:recording', 'depends-on', true, '审判证据依赖监控当夜成功录像。'],
      ['node:chapter-3:storm', 'node:chapter-3:rain-song', 'similar-to', false, '歌名同时包含停电和暴雨，但不属于事件后果。']
    ],
    gold: ['node:chapter-3:camera', 'node:chapter-3:elevator', 'node:chapter-5:recording'],
    terms: ['暴雨', '停电', '山路', '监控', '电梯']
  }),
  fixture({
    id: 'burned-key-becomes-hidden',
    operation: 'change-event',
    subjectRef: 'worldbook-entry:warehouse-key',
    before: '仓库钥匙已经被烧毁。',
    after: '仓库钥匙被莉娜藏了起来。',
    rationale: '让钥匙能够在后文重新出现，并改变知情关系。',
    target: { documentId: 'chapter-3', nodeId: 'key-fate' },
    worldbookEntries: [
      ['warehouse-key', '仓库钥匙', '打开旧港仓库正门的唯一钥匙。'],
      ['old-warehouse', '旧港仓库', '正门上锁，天窗可以勉强进入。'],
      ['lina', '莉娜', '掌管仓库账本，对钥匙下落有所隐瞒。']
    ],
    chapters: [
      ['chapter-3', [
        ['key-fate', '莉娜把仓库钥匙投入火中，确认它已经烧毁。'],
        ['lockpick', '他们认定钥匙不存在，只能冒险撬开仓库门。'],
        ['secret', '莉娜告诉艾德加，自己也不知道钥匙去了哪里。'],
        ['ash-key', '壁炉灰里有一块形似钥匙的焦黑木片。']
      ]],
      ['chapter-7', [
        ['warehouse', '众人因没有钥匙，只能从天窗进入仓库。'],
        ['return', '真正的仓库钥匙忽然出现在莉娜的抽屉里。'],
        ['music', '乐队演奏了老歌《藏起钥匙》。']
      ]]
    ],
    links: [
      ['node:chapter-3:key-fate', 'node:chapter-3:lockpick', 'depends-on', true, '撬锁方案依赖钥匙已经不存在。'],
      ['node:chapter-3:key-fate', 'node:chapter-3:secret', 'changes', true, '钥匙改为被莉娜藏起后，她的无知陈述变成隐瞒。'],
      ['node:chapter-3:key-fate', 'node:chapter-7:warehouse', 'depends-on', true, '从天窗进入依赖众人仍然没有钥匙。'],
      ['node:chapter-3:key-fate', 'node:chapter-7:return', 'reveals', true, '钥匙没有烧毁，允许它在后文重新出现。'],
      ['node:chapter-3:key-fate', 'node:chapter-7:music', 'similar-to', false, '歌名相似但不是钥匙事件的后果。']
    ],
    gold: ['node:chapter-3:lockpick', 'node:chapter-3:secret', 'node:chapter-7:warehouse'],
    terms: ['钥匙', '烧毁', '藏', '仓库', '莉娜']
  }),
  fixture({
    id: 'event-three-days-earlier',
    operation: 'change-time',
    before: '庆典发生在十月十日。',
    after: '庆典提前到十月七日。',
    rationale: '把事件提前三天，检查行程、在场关系和明确日期。',
    target: { documentId: 'chapter-1', nodeId: 'festival-date' },
    worldbookEntries: [
      ['harbor-festival', '港口庆典', '原定十月十日举行，需要药品船到港。'],
      ['edgar', '艾德加', '十月九日晚抵达港口。']
    ],
    chapters: [
      ['chapter-1', [
        ['festival-date', '港口庆典定在十月十日举行。'],
        ['arrival', '艾德加十月九日晚才抵达港口，因此赶上了庆典。'],
        ['shipment', '庆典当天收到的药品预计十月八日才装船。'],
        ['calendar', '旧历法中，十月七日也曾被称作丰收庆典日。']
      ]],
      ['chapter-2', [
        ['witnessed', '艾德加因为参加庆典，亲眼看见市长交出密信。'],
        ['anniversary', '三年后的十月十日，人们再次纪念那场庆典。'],
        ['museum', '博物馆展出一张写着“提前三天”的无关船票。']
      ]]
    ],
    links: [
      ['node:chapter-1:festival-date', 'node:chapter-1:arrival', 'depends-on', true, '艾德加能参加庆典，依赖庆典发生在他抵达之后。'],
      ['node:chapter-1:festival-date', 'node:chapter-1:shipment', 'depends-on', true, '庆典使用药品依赖十月八日完成装船。'],
      ['node:chapter-1:festival-date', 'node:chapter-2:witnessed', 'present-in', true, '艾德加的目击依赖他在庆典当天已经到场。'],
      ['node:chapter-1:arrival', 'node:chapter-2:witnessed', 'depends-on', true, '目击成立依赖艾德加先抵达港口。'],
      ['node:chapter-1:festival-date', 'node:chapter-1:calendar', 'precedes', true, '旧历日期只提供先后参照，不能单独证明剧情后果。'],
      ['node:chapter-1:festival-date', 'node:chapter-2:museum', 'similar-to', false, '船票也写着提前三天，但与庆典无关。']
    ],
    gold: ['node:chapter-1:arrival', 'node:chapter-1:shipment', 'node:chapter-2:witnessed'],
    terms: ['十月十日', '十月七日', '提前', '三天', '庆典']
  })
])
