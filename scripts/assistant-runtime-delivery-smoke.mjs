import { buildAssistantOrientation, buildAssistantWorkspaceItems } from '../src/services/agents/storyagent/assistantWorkspaceContext.js'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const root = process.env.PINAX_RUNTIME_OUTPUT || '/tmp/pinax-assistant-runtime-20261009'
const { createAssistantTask, assistantSystemPrompt, assistantUserPrompt, assistantCompletionText, assistantProviderFailure, assistantToolGuard } = await import(pathToFileURL(path.join(root, 'dist/pinax/assistantTask.js')))
const permission = { mode: 'review', bookId: 'book', scope: 'current', chapterIds: ['chapter'] }
const snapshot = { domains: { manuscript: [{ id: 'chapter', text: '甲推开门。' }, { id: 'other', text: '另一章' }] } }
let checks = 0
const make = policy => createAssistantTask({ assistantPolicy: policy, taskKind: 'assistant', intent: '试试第一个方向', kernel: { blocks: [] } }, snapshot)
const change = { kind: 'chapter', targetId: 'chapter', operation: 'replace', field: 'content', before: '甲推开门。', after: '甲先敲门。', reason: '谨慎' }
const task = make(permission)
const submit = task.tools.find(tool => tool.name === 'submit_edit_proposals')
const complete = task.tools.find(tool => tool.name === 'complete_assistant_task')
assert.equal((await complete.execute('', { intent: 'edit', outcome: 'answer', message: '写好了。' })).isError, true); checks++
assert.equal((await complete.execute('', { intent: 'edit', outcome: 'proposal', message: '已交付。' })).isError, true); checks++
assert.equal((await submit.execute('', { changes: [{ ...change, targetId: 'other', before: '另一章' }] })).isError, true); checks++
assert.equal((await submit.execute('', { changes: [change] })).isError, undefined); checks++
assert.equal((await complete.execute('', { intent: 'edit', outcome: 'proposal', message: '一处修改待确认。' })).isError, undefined); checks++
assert.equal(task.state.delivery.outcome, 'proposal'); checks++
assert.equal(make({ ...permission, mode: 'read' }).tools.some(tool => tool.name === 'submit_edit_proposals'), false); checks++
const read = make({ ...permission, mode: 'read' })
assert.equal((await read.tools[0].execute('', { intent: 'edit', outcome: 'blocked', message: '请授权修改。' })).isError, undefined); checks++
assert.equal((await make({ ...permission, expiresAt: Date.now() - 1 }).tools[0].execute('', { changes: [change] })).isError, true); checks++
assert.ok(assistantSystemPrompt({ kernel: { blocks: [] } }, ['complete_assistant_task']).includes('试试第一个方向')); checks++
assert.ok(assistantUserPrompt({ intent: '试试第一个方向' }).includes('complete_assistant_task')); checks++
// Prompt injection never grants scopes: the policy is outside model-controlled arguments.
assert.equal((await submit.execute('', { changes: [{ ...change, kind: 'worldbook', targetId: 'new', field: 'content', operation: 'create', before: '', title: '新角色', entryType: 'character' }], mode: 'auto' })).isError, true); checks++
const detailed = '完整评论：甲先敲门，体现了谨慎。\n\n后续可以沿仓库里的箱子展开。'
assert.equal(assistantCompletionText([{ role: 'user', content: '旧问题' }, { role: 'assistant', content: '旧回答' }, { role: 'user', content: '评论这里' }, { role: 'assistant', content: [{ type: 'text', text: detailed }] }], { outcome: 'answer', message: '已评论。' }), detailed); checks++
const workspaceSnapshot = { domains: { workspace: [{ id: 'project:book', bookId: 'book', type: 'project', title: '当前书', text: '', sourceRefs: ['/works/book'] }, { id: 'project:other', bookId: 'other', type: 'project', title: '另一部书', text: '', sourceRefs: ['/works/other'] }, { id: 'chapter:other:opening', bookId: 'other', type: 'chapter', title: '开篇', text: '另一部作品原文', sourceRefs: ['/works/other/chapters/opening'] }] } }
const workspace = createAssistantTask({ bookId: 'book', assistantPolicy: permission }, workspaceSnapshot).tools.find(tool => tool.name === 'workspace')
const payloadOf = result => JSON.parse(result.content[0].text)
assert.equal(payloadOf(await workspace.execute('', { action: 'list_projects' })).items.length, 2); checks++
assert.equal(payloadOf(await workspace.execute('', { action: 'open_project', bookId: 'other' })).editingBookId, 'book'); checks++
assert.equal(payloadOf(await workspace.execute('', { action: 'read', id: 'chapter:other:opening' })).text, '另一部作品原文'); checks++
assert.equal(payloadOf(await workspace.execute('', { action: 'read', path: '/etc/passwd' })).ok, false); checks++
assert.ok(assistantProviderFailure([{ role: 'assistant', stopReason: 'error', errorMessage: '529 overloaded_error' }]).includes('繁忙')); checks++
assert.equal(assistantProviderFailure([{ role: 'assistant', stopReason: 'stop' }]), ''); checks++
const blocks = buildAssistantOrientation({ bookTitle: '海港', chapterTitle: '守夜', currentChapterId: 'opening', manuscriptText: '克里德握着钥匙走向码头。', manuscriptItems: [{ id: 'opening', title: '守夜' }], worldEntries: [{ id: 'unrelated', title: '艾德格', text: '另一条人物线' }, { id: 'related', title: '克里德', text: '守夜人' }] }, 'current')
assert.ok(blocks.find(block => block.kind === 'workspace').text.includes('/works/current/chapters/opening')); checks++
assert.ok(blocks.find(block => block.kind === 'manuscript-context').text.includes('克里德握着钥匙')); checks++
assert.ok(blocks.find(block => block.kind === 'related-settings').text.includes('守夜人')); checks++
assert.ok(!blocks.find(block => block.kind === 'related-settings').text.includes('另一条人物线')); checks++
const manifest = buildAssistantWorkspaceItems([{ id: 'current', chapters: [{ id: 'opening' }] }, { id: 'other', chapters: [{ id: 'second' }] }], 'current', chapter => chapter.id, () => ({ entries: [{ id: 'person', name: '人物', content: '设定' }] }))
assert.ok(manifest.some(item => item.bookId === 'current' && item.type === 'worldbook')); checks++
assert.ok(manifest.some(item => item.bookId === 'other' && item.text === 'second')); checks++
// Reproduce the author's three reads -> valid proposal -> rejected read/reproposal -> completion.
const guarded = make(permission)
for (let i = 0; i < 3; i++) { assert.equal(assistantToolGuard(guarded, 'world_lookup', { maxCallsPerTurn: 6 }), undefined); checks++ }
assert.equal(assistantToolGuard(guarded, 'submit_edit_proposals', { maxCallsPerTurn: 6 }), undefined); checks++
assert.equal((await guarded.tools.find(tool => tool.name === 'submit_edit_proposals').execute('', { changes: [change] })).isError, undefined); checks++
assert.equal(assistantToolGuard(guarded, 'manuscript_get', { maxCallsPerTurn: 6 }).block, true); checks++
assert.equal(assistantToolGuard(guarded, 'submit_edit_proposals', { maxCallsPerTurn: 6 }).block, true); checks++
assert.equal(guarded.state.acceptedCalls, 4); checks++
assert.equal(assistantToolGuard(guarded, 'complete_assistant_task', { maxCallsPerTurn: 6 }), undefined); checks++
assert.equal((await guarded.tools.find(tool => tool.name === 'complete_assistant_task').execute('', { intent: 'edit', outcome: 'proposal', message: '正文建议待确认。' })).isError, undefined); checks++
const reserved = make(permission)
for (let i = 0; i < 4; i++) assistantToolGuard(reserved, 'world_lookup', { maxCallsPerTurn: 6 })
for (let i = 0; i < 10; i++) { assert.equal(assistantToolGuard(reserved, 'world_lookup', { maxCallsPerTurn: 6 }).block, true); checks++ }
assert.equal(assistantToolGuard(reserved, 'submit_edit_proposals', { maxCallsPerTurn: 6 }), undefined); checks++
assert.equal(assistantToolGuard(reserved, 'complete_assistant_task', { maxCallsPerTurn: 6 }), undefined); checks++
assert.equal(reserved.state.acceptedCalls, 5); checks++
const exhausted = make(permission)
exhausted.state.acceptedCalls = 6
exhausted.state.proposal = { ok: true, changes: [change] }
assert.equal(assistantToolGuard(exhausted, 'complete_assistant_task', { maxCallsPerTurn: 6 }), undefined); checks++
assert.equal(exhausted.state.acceptedCalls, 6); checks++
assert.equal(assistantToolGuard(exhausted, 'submit_edit_proposals', { maxCallsPerTurn: 6 }).block, true); checks++
const suffixTask = make(permission)
const suffixSubmit = suffixTask.tools.find(tool => tool.name === 'submit_edit_proposals')
const anchoredAppend = { ...change, operation: 'append', before: '推开门。', after: '\n\n甲看见了箱子。' }
const acceptedAppend = payloadOf(await suffixSubmit.execute('', { changes: [anchoredAppend] }))
assert.equal(acceptedAppend.ok, true); checks++
assert.equal(acceptedAppend.changes[0].before, ''); checks++
assert.equal(acceptedAppend.changes[0].operation, 'append'); checks++
assert.equal(acceptedAppend.changes[0].after, anchoredAppend.after); checks++
assert.equal(anchoredAppend.before, '推开门。'); checks++
assert.equal(acceptedAppend.normalizations.length, 1); checks++
assert.equal(payloadOf(await make(permission).tools[0].execute('', { changes: [{ ...anchoredAppend, before: '甲推' }] })).ok, false); checks++
const truncated = createAssistantTask({ bookId: 'book', assistantPolicy: permission }, { domains: { manuscript: [{ id: 'chapter', text: '甲推开门。', sourceLength: 20000 }] } })
assert.equal(payloadOf(await truncated.tools[0].execute('', { changes: [anchoredAppend] })).ok, false); checks++
assert.equal(payloadOf(await make(permission).tools[0].execute('', { changes: [{ ...anchoredAppend, targetId: 'other', before: '另一章' }] })).ok, false); checks++
const failedEdit = make(permission)
await failedEdit.tools[0].execute('', { changes: [{ ...anchoredAppend, before: '不在末尾的原文' }] })
const failedComplete = failedEdit.tools.find(tool => tool.name === 'complete_assistant_task')
assert.equal(payloadOf(await failedComplete.execute('', { intent: 'answer', outcome: 'answer', message: '改为聊天正文交付。' })).ok, false); checks++
assert.equal(payloadOf(await failedComplete.execute('', { intent: 'edit', outcome: 'blocked', message: '尚未提交修改，不能写入。' })).ok, true); checks++
console.log(`assistant-runtime-delivery: ${checks} checks passed`)
