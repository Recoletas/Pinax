// Vite browser fixture. Invoke only in an isolated Playwright profile.
import { createApp, h, nextTick, reactive } from 'vue'
import MapPlaceManuscript from '../../../src/components/geography/MapPlaceManuscript.vue'
import { COMPOSABLE_WORKSPACE_CONTEXT } from '../../../src/composables/useComposableWorkspace.js'
import { openLedgerDb, closeLedgerDb } from '../../../src/services/memory/ledger/ledgerDb.js'
import { forkWorldFacts, listWorldStatements, defineWorldCalendar, saveWorldStatement, correctFact, retractFact, createProposal, adoptProposal } from '../../../src/services/memory/ledger/factLedger.js'
import { saveWorldStatement as saveFromManuscript, saveWorldKnowledge, saveWorldManuscriptLink, worldManuscriptUnits } from '../../../src/services/memory/ledger/worldModelWorkspace.js'
import { createWritingDocument } from '../../../src/services/writing/writingDocumentSchema.js'
import { worldbookEntityKey } from '../../../src/services/project/knowledgeReadModel/identity.js'
import { loadWritingBooksSnapshot, saveWritingBooks } from '../../../src/services/writing/writingBooksRepository.js'

async function until(test, description) {
  const end = Date.now() + 5000
  while (!test()) {
    if (Date.now() > end) throw new Error('地图地点面板未显示预期内容：' + description)
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

export async function checkWorldPlaceEventsPanel() {
  const id = crypto.randomUUID()
  const bookA = 'map-a-' + id
  const bookB = 'map-b-' + id
  const worldbook = { id: 'world-' + id, entries: [
    { id: 'harbour', name: '旧港', type: 'location' }, { id: 'other', name: '旧港', type: 'location' }
  ] }
  const scope = bookId => ({ domain: 'book', bookId })
  const key = entry => worldbookEntityKey(worldbook.id, entry)
  const previous = loadWritingBooksSnapshot()
  const opened = await openLedgerDb()
  if (!opened.ok) throw Error(opened.reason)
  const { db } = opened
  const ok = async pending => { const r = await pending; if (!r.ok) throw Error(r.reason); return r }
  const event = (bookId, place, title, date, authority = 'fact') => ok(saveWorldStatement(db, {
    scope: scope(bookId), subjectKey: key(place), subjectLabel: '旧港', predicate: '发生', object: title,
    kind: 'event', authority, storyAt: date, commandId: 'map-event:' + id + ':' + title
  }))
  const root = document.createElement('div')
  document.body.append(root)
  const props = reactive({ bookId: bookA, worldbook, entryId: 'harbour' })
  let mounted = false
  const app = createApp({ render: () => h(MapPlaceManuscript, props) })
  const navigations = []
  app.provide(COMPOSABLE_WORKSPACE_CONTEXT, { openAt(target, group) { navigations.push({ target, group }) } })
  const titles = () => [...root.querySelectorAll('.event-list strong')].map(node => node.textContent)
  const dates = () => [...root.querySelectorAll('.event-list span')].map(node => node.textContent)
  const matches = expected => titles().join('|') === expected.map(title => '旧港 · 发生 · ' + title).join('|')
  try {
    saveWritingBooks([...previous, ...[bookA, bookB].map(bookId => ({ id: bookId, title: bookId, worldbookId: worldbook.id, chapters: [{ id: 'letter', title: '渡口',
      content: '阿九在船舷旁交出印章。', editorDocument: createWritingDocument('阿九在船舷旁交出印章。') }] }))])
    await event(bookA, 'harbour', '港口迁移', null)
    const dated = await event(bookA, 'harbour', '堤门封闭', 0)
    await event(bookA, 'other', '同名异地事件', 2)
    await event(bookA, 'harbour', '未证实的耳闻', 2, 'rumor')
    await event(bookB, 'harbour', '另一书的港口事件', 3)
    app.mount(root)
    mounted = true
    await until(() => matches(['堤门封闭', '港口迁移']), '日期排序、同书与地点身份')
    if (dates().join('|') !== '故事时点 0|日期未定') throw Error('日期未定与零点混淆')
    const recordCut = root.querySelector('input[placeholder="最新记录"]')
    recordCut.value = '-1'
    recordCut.dispatchEvent(new Event('input', { bubbles: true }))
    await until(() => root.textContent.includes('记录序号须为大于或等于零的整数'), '无效截面与无事件区分')
    recordCut.value = ''
    recordCut.dispatchEvent(new Event('input', { bubbles: true }))
    await until(() => matches(['堤门封闭', '港口迁移']), '清除无效截面')
    const fork = await ok(forkWorldFacts(db, { scope: scope(bookA), label: '涨潮稿', branchId: id, commandId: 'map-fork:' + id }))
    const branch = fork.decision.scope
    const inherited = (await ok(listWorldStatements(db, { scope: branch }))).items.find(row => row.object === '堤门封闭')
    const branchEvent = await ok(correctFact(db, { scope: branch, factKey: inherited.factKey, expectedHead: inherited.factVersionId,
      commandId: 'map-fork-event:' + id, object: '堤门冲毁' }))
    const branchFlood = await ok(correctFact(db, { scope: branch, expectedHead: branchEvent.result.factVersionId, factKey: inherited.factKey,
      commandId: 'map-fork-duration:' + id, object: '堤门冲毁', storyInterval: { timelineId: 'default', start: { eraId: 'default', ordinal: 0 },
        end: { eraId: 'default', ordinal: 4 }, endSemantic: 'exclusive', eventSpan: true } }))
    const branchBook = loadWritingBooksSnapshot().find(book => book.id === bookA)
    const branchChapter = branchBook.chapters[0]
    await ok(saveWorldManuscriptLink(db, { scope: branch, book: branchBook, chapterId: branchChapter.id, unitId: worldManuscriptUnits(branchChapter)[0].unitId,
      kind: 'narrator-assertion', claimId: branchFlood.result.claimId, factVersionId: branchFlood.result.factVersionId, commandId: 'map-fork-source:' + id }))
    const chooseBranch = value => {
      const select = root.querySelector('select[aria-label="事件设定版本"]')
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }
    await until(() => root.querySelector('select[aria-label="事件设定版本"] option[value="' + id + '"]'), '地点面板显示本书试写分支')
    chooseBranch(id)
    await until(() => matches(['堤门冲毁', '港口迁移']), '切换地图事件到分支')
    const dayInput = root.querySelector('input[placeholder="全部日期"]')
    function day(value) { dayInput.value = value; dayInput.dispatchEvent(new Event('input', { bubbles: true })) }
    day('3')
    await until(() => matches(['堤门冲毁']) && root.textContent.includes('有 1 条地点事件的日期未定'), '持续期间和日期待定分开')
    day('4')
    await until(() => matches([]) && root.textContent.includes('此故事时点没有可确认'), '结束时点排除持续事件')
    day('')
    await until(() => matches(['堤门冲毁', '港口迁移']), '清空故事时点恢复完整列表')
    if (!dates().includes('故事时点 0，至 故事时点 4 前')) throw Error('地图遗漏持续事件的结束边界')
    root.querySelector('.event-list > li button').click()
    await until(() => root.querySelector('.event-passages button')?.textContent.includes('交出印章'), '分支事件读取自己的原文登记')
    chooseBranch('')
    await until(() => matches(['堤门封闭', '港口迁移']) && !root.querySelector('.event-passages'), '返回正史清除分支事件与稿面')
    await ok(retractFact(db, { scope: scope(bookA), factKey: dated.result.factKey, expectedHead: dated.result.factVersionId, commandId: 'map-retract:' + id }))
    await until(() => matches(['港口迁移']), '作者撤回后地图应实时移除事件')
    props.entryId = 'other'
    await until(() => matches(['同名异地事件']), '同名地点有独立事件')
    props.entryId = 'harbour'
    props.bookId = bookB
    await until(() => matches(['另一书的港口事件']), '共享世界书的作品只显示本书事件')
    for (const [calendar, era, ordinal, object] of [
      ['天历', '旧纪', 17, '修港'], ['天历', '旧纪', 2, '开港'], ['海历', '新纪', 1, '入海'],
      ['天历', '旧纪', null, '祭海']
    ]) {
      const proposal = await ok(createProposal(db, { scope: scope(bookB), origin: 'author', kind: 'event',
        subjectKey: key('harbour'), subjectLabel: '旧港', predicate: '发生', object,
        storyInterval: { timelineId: calendar, start: { eraId: era, ordinal }, endSemantic: 'unknown' } }))
      await ok(adoptProposal(db, { scope: scope(bookB), proposalId: proposal.proposal.id,
        commandId: id + object, manualAssertion: true }))
    }
    await until(() => matches(['另一书的港口事件', '开港', '修港', '祭海', '入海']), '历法分组与纪元内排序')
    if (dates().slice(1).join('|') !== '天历 · 旧纪 · 故事时点 2|天历 · 旧纪 · 故事时点 17|天历 · 旧纪 · 具体时点未定|海历 · 新纪 · 故事时点 1') {
      throw Error('地点事件丢失历法或纪元')
    }
    await ok(defineWorldCalendar(db, { scope: scope(bookB), commandId: id + 'calendar-labels',
      calendar: { id: '海历', label: '船工海历', eras: [{ id: '新纪', label: '破晓纪', order: 0 }] } }))
    await until(() => dates().includes('船工海历 · 破晓纪 · 故事时点 1'), '地图跟随本书的历法名称')
    day('1')
    await until(() => root.querySelector('select[aria-label="使用历法"]'), '按作品历法筛选地点事件')
    const calendarSelector = root.querySelector('select[aria-label="使用历法"]')
    calendarSelector.value = '海历'
    calendarSelector.dispatchEvent(new Event('change', { bubbles: true }))
    await until(() => matches(['入海']), '只显示此纪元该日能确认的发生')
    recordCut.value = '1'
    recordCut.dispatchEvent(new Event('input', { bubbles: true }))
    await until(() => root.textContent.includes('该记录截面还没有所选历法或纪元'), '旧截面不把消失的历法默认为全时期')
    recordCut.value = ''; recordCut.dispatchEvent(new Event('input', { bubbles: true }))
    await until(() => matches(['入海']), '恢复原记录截面后按所选纪元查询')
    day('')
    const activeBook = loadWritingBooksSnapshot().find(book => book.id === bookB)
    const chapter = activeBook.chapters[0]
    const first = await ok(saveFromManuscript(db, { scope: scope(bookB), book: activeBook, factPosition: { chapterId: chapter.id, unitId: worldManuscriptUnits(chapter)[0].unitId }, subjectKey: key('runner'),
      subjectLabel: '信使', predicate: '交付', object: '印章', kind: 'event', authority: 'fact', commandId: id + 'handover',
      eventContext: { placeRefs: [key('harbour')], participants: [{ entityRef: key('runner'), role: '交付人' }] },
      eventLabels: [{ entityRef: key('runner'), label: '信使' }] }))
    await until(() => titles().includes('信使 · 交付 · 印章') && root.textContent.includes('交付人 · 信使'), '已绑定的发生地与参与者')
    await ok(saveWorldManuscriptLink(db, { scope: scope(bookB), book: activeBook, chapterId: chapter.id,
      unitId: worldManuscriptUnits(chapter)[0].unitId, commandId: id + 'source', kind: 'narrator-assertion',
      claimId: first.result.claimId, factVersionId: first.result.factVersionId }))
    const hearing = await ok(saveWorldKnowledge(db, { scope: scope(bookB), claimId: first.result.claimId,
      book: activeBook, originPosition: { chapterId: chapter.id, unitId: worldManuscriptUnits(chapter)[0].unitId },
      actorKey: '舟子', actorLabel: '舟子', channel: 'heard', storyAt: 3, commandId: id + 'hear' }))
    const handover = () => [...root.querySelectorAll('.event-list > li')].find(element => element.querySelector('strong').textContent.includes('交付 · 印章'))
    handover().querySelector('button').click()
    await until(() => handover()?.querySelector('.event-passages button'), '地图上的事件显示已确认的正文段落')
    await until(() => handover()?.textContent.includes('作者认定事实的依据'), '地图显示独立于读者与人物记录的事实证据')
    await until(() => handover()?.textContent.includes('舟子获知出处'), '地图能追溯人物在何处听到事件')
    await ok(saveWorldKnowledge(db, { scope: scope(bookB), claimId: first.result.claimId, supersedesEventId: hearing.result.knowledgeEventId,
      actorKey: '舟子', actorLabel: '舟子', channel: 'heard', storyAt: 3, passage: null, commandId: id + 'remove-source' }))
    await until(() => !handover()?.textContent.includes('舟子获知出处'), '作者撤下获知出处后地图移除旧指向')
    handover().querySelector('.event-passages button').click()
    await until(() => navigations.length === 1, '打开原文')
    const target = navigations[0].target
    if (navigations[0].group !== 'main' || target.bookId !== bookB || target.id !== chapter.id ||
      target.nodeId !== chapter.editorDocument.content[0].content[0].attrs.nodeId || target.matchText !== '阿九在船舷旁交出印章。') {
      throw Error('地图关联原文定位到了错误的书、章、节点或文字')
    }
    await ok(correctFact(db, { scope: scope(bookB), factKey: first.result.factKey, expectedHead: first.result.factVersionId,
      object: '印章', commandId: id + 'move-handover',
      eventContext: { placeRefs: [key('other')], participants: [{ entityRef: key('runner'), role: '交付人' }] } }))
    await until(() => !titles().includes('信使 · 交付 · 印章'), '改地点后原地点移除发生记录')
    const cut = root.querySelector('input[placeholder="最新记录"]')
    function setCut(value) { cut.value = value; cut.dispatchEvent(new Event('input', { bubbles: true })) }
    setCut(String(hearing.decision.recordedSeq))
    await until(() => !!handover(), '旧记录截面保留原来的事发地点')
    handover().querySelector('button').click()
    await until(() => handover()?.textContent.includes('舟子获知出处'), '旧截面可看当时登记的获知原文')
    setCut('')
    await until(() => !handover(), '回到现在移除原地点的历史事件')
    props.entryId = 'other'
    await until(() => titles().includes('信使 · 交付 · 印章') && root.textContent.includes('交付人 · 信使'), '新地点继承同一次发生和参与者')
    handover().querySelector('button').click()
    await until(() => handover()?.textContent.includes('旧版说法'), '地点更正后仍能查到原版说法的原文')
    const staleButton = handover().querySelector('.event-passages button')
    const currentBooks = loadWritingBooksSnapshot()
    const rewritten = { ...chapter, content: '阿九否认交印。', editorDocument: createWritingDocument('阿九否认交印。') }
    // Commit the rewrite while the click is waiting for its ledger read.
    staleButton.click()
    saveWritingBooks(currentBooks.map(book => book.id === bookB ? { ...book, chapters: [rewritten] } : book))
    await until(() => handover()?.textContent.includes('原文待核对') || handover()?.textContent.includes('原文已变化'), '改稿后只保留已登记原句')
    if (navigations.length !== 1) throw Error('地图打开了已失效的原文位置')
    props.worldbook = { ...worldbook, id: 'unbound-' + id }
    await nextTick()
    if (root.querySelector('section')) throw Error('解绑后残留旧地点信息')
    return { shown: 2, zeroAndUndated: true, liveRetraction: true, rumorExcluded: true, bookAndPlaceIsolation: true }
  } finally {
    if (mounted) app.unmount()
    root.remove()
    await closeLedgerDb(db)
    saveWritingBooks(previous)
  }
}
