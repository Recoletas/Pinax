// Mount the production entry inspector against an isolated book and real IndexedDB.
import { createApp, h, reactive, nextTick } from 'vue'
import SettingContextPanel from '../../../src/components/worldbook/SettingContextPanel.vue'
import { withLedgerDb } from '../../../src/services/memory/ledger/ledgerDb'
import { worldbookEntityKey } from '../../../src/services/project/knowledgeReadModel/identity'
import { defineWorldCalendar, saveWorldStatement, saveWorldKnowledge } from '../../../src/services/memory/ledger/worldModelWorkspace'
import { loadWritingBooksSnapshot, saveWritingBooks } from '../../../src/services/writing/writingBooksRepository'
import { createWritingDocument } from '../../../src/services/writing/writingDocumentSchema'

export async function checkWorldbookEntityPanel() {
  const bookId = 'dossier-novel', worldbookId = 'dossier-world'
  const first = { id: 'lin', type: 'character', name: '林昭' }
  const twin = { ...first, id: 'second' }
  const bureau = { id: 'office', type: 'organization', name: '巡防司' }
  const library = { id: worldbookId, entries: [first, twin, bureau] }
  const documentModel = createWritingDocument('林昭还在等信。')
  const storyClock = { timelineId: 'dossier-tide', eraId: 'tide' }
  const chapter = { id: 'waiting', title: '守候', editorDocument: documentModel, sceneAnchors: [
    { worldbookId, unitId: documentModel.content[0].attrs.unitId, time: { storyAt: 0, storyClock }, presentCharacterIds: ['lin'] }
  ] }
  const previous = loadWritingBooksSnapshot()
  const root = document.createElement('div')
  document.body.append(root)
  const props = reactive({ bookId, worldbook: library, entry: first, chapterId: chapter.id })
  const visited = [], located = []
  const app = createApp({ render: () => h(SettingContextPanel, { ...props, onEntry: entry => visited.push(entry.id), onLocate: target => located.push(target) }) })
  const scope = { domain: 'book', bookId }
  const key = id => worldbookEntityKey(worldbookId, id)
  async function until(test, name) {
    const end = Date.now() + 5000
    while (!test()) {
      if (Date.now() >= end) throw Error('世界书条目模型：' + name + ' ' + root.textContent)
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  }
  let mounted = false
  try {
    saveWritingBooks([...previous, { id: bookId, title: '送信', worldbookId, chapters: [chapter] }])
    await withLedgerDb(async db => {
      const defined = await defineWorldCalendar(db, { scope, commandId: 'dossier-calendar',
        calendar: { id: storyClock.timelineId, label: '潮历', eras: [{ id: 'tide', label: '潮元', order: 0 }] } })
      if (!defined.ok) throw Error(defined.reason)
      const save = async fields => {
        const answer = await saveWorldStatement(db, { scope, storyClock, authority: 'fact', kind: 'relation', subjectKey: 'book:' + bookId,
          predicate: '托付', commandId: fields.object, ...fields })
        if (!answer.ok) throw Error(answer.reason)
        return answer.result
      }
      const owner = loadWritingBooksSnapshot().find(book => book.id === bookId)
      await save({ subjectKey: key('office'), subjectLabel: '巡防司', object: '城主委托', objectRef: key('lin'), storyAt: 0,
        book: owner, factPosition: { chapterId: chapter.id, unitId: documentModel.content[0].attrs.unitId } })
      await save({ kind: 'event', object: '亲自递信', storyAt: 0,
        eventContext: { participants: [{ entityRef: key('lin'), role: '送信人' }] } })
      await save({ object: '同名人的差使', objectRef: key('second'), storyAt: 0 })
      await save({ predicate: '结盟', object: '两日后结盟', objectRef: key('lin'), storyAt: 2 })
      const rumor = await save({ authority: 'rumor', storyClock: null, object: '信封夹着密令' })
      const heard = await saveWorldKnowledge(db, { scope, storyClock, actorKey: key('lin'), claimId: rumor.claimId, storyAt: 1,
        kind: 'known', channel: 'heard', speaker: { entityRef: key('second'), label: '驿丞' }, commandId: 'dossier-heard' })
      if (!heard.ok) throw Error(heard.reason)
    })
    app.mount(root); mounted = true
    const panel = () => root.querySelector('.entity-ledger')
    panel().querySelector('summary').click()
    await until(() => panel().textContent.includes('城主委托') && panel().textContent.includes('送信人'), '反向关系和事件角色')
    if (/两日后结盟|同名人的差使|信封夹着密令/.test(panel().textContent)) throw Error('场景第零日混入未来消息或同名人')
    const relation = [...panel().querySelectorAll('li')].find(row => row.textContent.includes('城主委托'))
    const buttons = [...relation.querySelectorAll('button')]
    buttons.find(button => button.textContent === '巡防司').click()
    if (visited[0] !== 'office') throw Error('关系端点没有打开正确的条目')
    buttons.find(button => button.textContent.includes('查看全稿出处')).click()
    await until(() => relation.querySelector('.event-passages button')?.textContent === '林昭还在等信。', '从反向关系核对原文依据')
    relation.querySelector('.event-passages button').click()
    await until(() => located[0]?.chapterId === chapter.id && located[0]?.term === '林昭还在等信。', '从条目定位全稿原句')
    panel().querySelector('input').click()
    await until(() => ['两日后结盟', '听说 · 驿丞 · 未表态'].every(text => panel().textContent.includes(text)), '切换日期显示获知与渠道')
    props.entry = twin
    await nextTick()
    panel().querySelector('summary').click()
    await until(() => panel().textContent.includes('同名人的差使'), '同名人物按身份切换')
    if (/亲自递信|城主委托|信封夹着密令/.test(panel().textContent)) throw Error('同名人物继承了对方的见闻或关系')
    props.worldbook = { ...library, id: 'unbound-world' }
    await nextTick()
    if (panel()) throw Error('解绑的世界书仍显示当前作品的事实')
  } finally {
    if (mounted) app.unmount()
    root.remove()
    saveWritingBooks(previous)
  }
}
