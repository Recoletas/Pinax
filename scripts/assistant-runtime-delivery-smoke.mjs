import { buildAssistantOrientation, buildAssistantWorkspaceItems } from '../src/services/agents/storyagent/assistantWorkspaceContext.js'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const root = process.env.PINAX_RUNTIME_OUTPUT || '/tmp/pinax-assistant-runtime-20261009'
const { createAssistantTask, assistantSystemPrompt, assistantUserPrompt, assistantCompletionText, assistantProviderFailure, assistantToolGuard, finishAssistantTurn } = await import(pathToFileURL(path.join(root, 'dist/pinax/assistantTask.js')))
const { createAssistantSteering } = await import(pathToFileURL(path.join(root, 'dist/pinax/assistantSteering.js')))
const permission = { mode: 'review', bookId: 'book', scope: 'current', chapterIds: ['chapter'] }
const snapshot = { domains: { manuscript: [{ id: 'chapter', text: '甲推开门。' }, { id: 'other', text: '另一章' }], world_lookup: [{ id: 'person', text: '甲是守夜人。' }], outline: [{ id: 'opening', text: '甲找到箱子。' }] } }
let checks = 0
const req = policy => ({ bookId: 'book', assistantPolicy: policy, taskKind: 'assistant', intent: '试试第一个方向', kernel: { blocks: [] } })
const make = (policy = permission, pending = []) => createAssistantTask(req(policy), snapshot, () => {}, pending)
const tool = (task, name) => task.tools.find(item => item.name === name)
const payloadOf = result => JSON.parse(result.content[0].text)
const textTurn = text => ({ message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text }] } })
const toolTurn = name => ({ message: { role: 'assistant', stopReason: 'toolUse', content: [{ type: 'toolCall', id: 'call', name, arguments: {} }] } })
const change = { kind: 'chapter', targetId: 'chapter', operation: 'replace', field: 'content', before: '甲推开门。', after: '甲先敲门。', reason: '谨慎' }
const task = make()

// A denied edit is a recoverable tool result. It does not terminate the native loop.
assert.equal((await tool(task, 'submit_edit_proposals').execute('', { changes: [{ ...change, targetId: 'other', before: '另一章' }] })).isError, true); checks++
assert.equal(task.state.delivery, null); checks++
assert.equal(assistantToolGuard(task, 'manuscript'), undefined); checks++
assert.equal(payloadOf(await tool(task, 'submit_edit_proposals').execute('', { final: true, changes: [change] })).ok, true); checks++
assert.equal(task.state.delivery, null); checks++
assert.equal(finishAssistantTurn(task, toolTurn('submit_edit_proposals')), undefined); checks++
assert.equal(assistantToolGuard(task, 'writing_methods'), undefined); checks++
assert.equal(payloadOf(await tool(task, 'writing_methods').execute('', { action: 'list' })).ok, true); checks++
assert.equal(finishAssistantTurn(task, textTurn('已按谨慎的性格修改，候选可审阅。')), undefined); checks++
assert.equal(task.state.delivery.outcome, 'proposal'); checks++
assert.equal(task.state.delivery.message, '已按谨慎的性格修改，候选可审阅。'); checks++
// A receipt must not suppress the native queue or the next turn's tools.
assert.equal(assistantToolGuard(task, 'manuscript'), undefined); checks++
assert.equal(make({ ...permission, mode: 'read' }).tools.some(item => item.name === 'submit_edit_proposals'), false); checks++
assert.equal((await tool(make({ ...permission, expiresAt: Date.now() - 1 }), 'submit_edit_proposals').execute('', { changes: [change] })).isError, true); checks++
assert.equal(payloadOf(await tool(make(), 'submit_edit_proposals').execute('', { changes: [{ ...change, kind: 'worldbook', targetId: 'new', operation: 'create', before: '', title: '新角色', entryType: 'character' }], mode: 'auto' })).ok, false); checks++

// Compatibility completion accepts metadata only; real prose ends the turn.
const legacy = make()
assert.equal(payloadOf(await tool(legacy, 'complete_assistant_task').execute('', { intent: 'edit', outcome: 'proposal', message: '已交付。' })).compatibility, true); checks++
assert.equal(legacy.state.delivery, null); checks++
assert.equal(finishAssistantTurn(legacy, toolTurn('complete_assistant_task')), undefined); checks++
const detailed = '完整评论：甲先敲门，体现了谨慎。\n\n后续可以沿仓库里的箱子展开。'
assert.equal(finishAssistantTurn(legacy, textTurn(detailed)), undefined); checks++
assert.equal(legacy.state.delivery.outcome, 'answer'); checks++
for (const outcome of ['answer', 'proposal', 'blocked']) {
  assert.equal(assistantCompletionText([{ role: 'user', content: '旧问题' }, { role: 'assistant', content: '旧回答' }, { role: 'user', content: '评论这里' }, { role: 'assistant', content: [{ type: 'text', text: detailed }] }], { outcome, message: '已评论。' }), detailed); checks++
}
assert.ok(assistantSystemPrompt({ kernel: { blocks: [] } }, ['submit_edit_proposals']).includes('提交后可以继续')); checks++
assert.ok(!assistantUserPrompt({ intent: '继续' }).includes('complete_assistant_task')); checks++

// Method discovery is read-only. Automatic selection can be replaced without
// losing an author's explicit choices or accepting unknown method IDs.
const methodRequest = req(permission)
methodRequest.kernel.blocks = [{ kind: 'writing-methods', text: JSON.stringify([{ id: 'world-design' }, { id: 'custom-voice', label: '作者语气', instruction: '沿用作者提供的开篇语气。' }]) }]
const methodTask = createAssistantTask(methodRequest, snapshot)
const methodTool = tool(methodTask, 'writing_methods')
const selectedIds = () => methodTask.state.methods.map(method => method.id)
const authorIds = ['world-design', 'custom-voice']
assert.deepEqual(selectedIds(), authorIds); checks++
const listedMethods = payloadOf(await methodTool.execute('list', { action: 'list' }))
assert.ok(listedMethods.methods.some(method => method.id === 'line-polish' && method.targets.includes('chapter'))); checks++
assert.deepEqual(selectedIds(), authorIds); checks++
assert.equal(payloadOf(await methodTool.execute('load', { action: 'load', ids: ['character-design'] })).ok, true); checks++
await methodTool.execute('append', { action: 'load', ids: ['ghostwrite', 'character-design'] })
assert.deepEqual(selectedIds(), [...authorIds, 'character-design', 'ghostwrite']); checks++
const replacedMethods = payloadOf(await methodTool.execute('replace', { action: 'load', mode: 'replace', ids: ['line-polish'] }))
assert.deepEqual(replacedMethods.activeIds, [...authorIds, 'line-polish']); checks++
assert.deepEqual(replacedMethods.authorSelectedIds, authorIds); checks++
for (const input of [{ action: 'load', mode: 'replace', ids: ['unknown'] }, { action: 'load', mode: 'invalid', ids: ['ghostwrite'] }, { action: 'load', ids: [] }]) {
  assert.equal(payloadOf(await methodTool.execute('invalid', input)).ok, false); checks++
  assert.deepEqual(selectedIds(), [...authorIds, 'line-polish']); checks++
}
assert.equal(payloadOf(await methodTool.execute('clear', { action: 'load', mode: 'replace', ids: [] })).ok, true); checks++
assert.deepEqual(selectedIds(), authorIds); checks++
const separateMethods = make()
assert.deepEqual(separateMethods.state.methods, []); checks++

// Long manuscript snapshots remain readable to the last character. Page size is
// a default, not a second cap; missing snapshot coverage stays explicit.
const longManuscript = `${'前段。'.repeat(3500)}最后一段：门已经关上。`
const manuscriptSnapshot = { revision: 'manuscript-revision', domains: { manuscript: [
  { id: 'long', title: '长章', text: longManuscript, sourceLength: longManuscript.length, sourceRefs: ['chapter:long'] },
  { id: 'excerpt', text: '节选正文', sourceLength: 20000, sourceRefs: ['chapter:excerpt'] },
  { id: 'empty', text: '', sourceLength: 0 },
] } }
const manuscriptReader = tool(createAssistantTask(req({ ...permission, mode: 'read' }), manuscriptSnapshot), 'manuscript_get')
let offset = 0, reassembled = ''
do {
  const page = payloadOf(await manuscriptReader.execute('page', { id: 'long', offset }))
  assert.equal(page.ok, true); checks++
  assert.equal(page.revision, manuscriptSnapshot.revision); checks++
  const item = page.items[0]
  assert.equal(item.offset, offset); checks++
  assert.equal(item.includedLength, longManuscript.length); checks++
  assert.equal(item.sourceLength, longManuscript.length); checks++
  assert.equal(item.truncated, false); checks++
  assert.deepEqual(item.sourceRefs, ['chapter:long']); checks++
  reassembled += item.text
  offset = item.nextOffset
} while (offset !== null)
assert.equal(reassembled, longManuscript); checks++
const completeManuscript = payloadOf(await manuscriptReader.execute('full', { id: 'long', limit: longManuscript.length })).items[0]
assert.equal(completeManuscript.text, longManuscript); checks++
assert.equal(completeManuscript.nextOffset, null); checks++
const tail = payloadOf(await manuscriptReader.execute('tail', { id: 'long', offset: longManuscript.length - 12 })).items[0]
assert.equal(tail.text, longManuscript.slice(-12)); checks++
const excerptPage = payloadOf(await manuscriptReader.execute('excerpt', { id: 'excerpt' })).items[0]
assert.equal(excerptPage.truncated, true); checks++
assert.equal(excerptPage.sourceLength, 20000); checks++
assert.equal(excerptPage.includedLength, '节选正文'.length); checks++
assert.equal(excerptPage.nextOffset, null); checks++
const unavailable = payloadOf(await manuscriptReader.execute('missing-range', { id: 'excerpt', offset: 10000 }))
assert.equal(unavailable.ok, false); checks++
assert.equal(unavailable.truncated, true); checks++
assert.equal(payloadOf(await manuscriptReader.execute('unknown', { id: 'unknown' })).ok, false); checks++
assert.equal(payloadOf(await manuscriptReader.execute('empty', { id: 'empty' })).items[0].text, ''); checks++
for (const invalidRange of [{ offset: -1 }, { offset: 1.5 }, { limit: 0 }, { limit: -1 }]) {
  assert.equal(payloadOf(await manuscriptReader.execute('invalid-range', { id: 'long', ...invalidRange })).ok, false); checks++
}
assert.equal(manuscriptSnapshot.domains.manuscript[0].text, longManuscript); checks++

// Worldbook detail reads use the same full-text pagination. Search and related
// continue to execute the original lookup, including its result and error shape.
const originalLookups = []
const originalLookupResult = { content: [{ type: 'text', text: 'original lookup response' }], details: { source: 'upstream' } }
const originalLookup = {
  name: 'world_lookup', label: '设定查询', description: '原查找说明。',
  parameters: { type: 'object', properties: { action: { type: 'string' }, id: { type: 'string' }, query: { type: 'string' } }, required: ['action'] },
  execute: async (...args) => { originalLookups.push(args); return originalLookupResult },
}
const fullSetting = `${'人物经历与正文。'.repeat(900)}\n结构属性：称谓为船长，过去在北方任职。`
const worldSnapshot = { revision: 'world-revision', domains: { world_lookup: [
  { id: 'captain', title: '船长', type: 'character', trust: 'canon', text: fullSetting, summary: '仅供搜索的简短摘要。', sourceLength: fullSetting.length, sourceRefs: ['worldbook:captain'], relations: [{ targetId: 'crew', type: '指挥' }] },
  { id: 'partial', type: 'location', text: '已提供的原文', sourceLength: 12000 },
  { id: 'summary-only', summary: '旧快照仅有摘要。' },
] } }
const worldTask = createAssistantTask(req({ ...permission, mode: 'read' }), worldSnapshot, () => {}, [], [originalLookup])
const worldReader = tool(worldTask, 'world_lookup')
assert.ok(worldReader.parameters.properties.offset); checks++
assert.equal(originalLookup.parameters.properties.offset, undefined); checks++
for (const action of ['search', 'related']) {
  const lookupInput = { action, query: '船长', id: 'captain' }
  const signal = new AbortController().signal
  assert.equal(await worldReader.execute(action, lookupInput, signal), originalLookupResult); checks++
  assert.equal(originalLookups.at(-1)[1], lookupInput); checks++
  assert.equal(originalLookups.at(-1)[2], signal); checks++
}
let worldOffset = 0, worldText = ''
do {
  const page = payloadOf(await worldReader.execute('world-page', { action: 'get', id: 'captain', offset: worldOffset }))
  const item = page.items[0]
  assert.equal(page.domain, 'world_lookup'); checks++
  assert.equal(page.revision, 'world-revision'); checks++
  assert.equal(item.type, 'character'); checks++
  assert.equal(item.trust, 'canon'); checks++
  assert.deepEqual(item.sourceRefs, ['worldbook:captain']); checks++
  assert.deepEqual(item.relations, worldSnapshot.domains.world_lookup[0].relations); checks++
  assert.equal(item.truncated, false); checks++
  worldText += item.text
  worldOffset = item.nextOffset
} while (worldOffset !== null)
assert.equal(worldText, fullSetting); checks++
assert.equal(originalLookups.length, 2); checks++
assert.equal(payloadOf(await worldReader.execute('world-full', { action: 'get', id: 'captain', limit: fullSetting.length })).items[0].text, fullSetting); checks++
const partialWorld = payloadOf(await worldReader.execute('world-partial', { action: 'get', id: 'partial' }))
assert.equal(partialWorld.items[0].truncated, true); checks++
assert.equal(partialWorld.items[0].sourceLength, 12000); checks++
assert.equal(partialWorld.items[0].nextOffset, null); checks++
assert.equal(payloadOf(await worldReader.execute('summary-only', { action: 'get', id: 'summary-only' })).items[0].truncated, true); checks++
assert.equal(payloadOf(await worldReader.execute('missing-setting', { action: 'get', id: 'missing' })).ok, false); checks++
assert.equal(payloadOf(await worldReader.execute('invalid-world-range', { action: 'get', id: 'captain', offset: -1 })).ok, false); checks++

// Revisions replace the matching candidate, including worldbook and outline.
const writable = { ...permission, worldbook: true, outline: true }
const revisions = make(writable)
const setting = { ...change, kind: 'worldbook', targetId: 'person', before: '甲是守夜人。', after: '甲是谨慎的守夜人。', groupId: 'opening', details: { aliases: ['阿甲'] } }
const outline = { ...change, kind: 'outline', targetId: 'opening', field: 'intent', before: '甲找到箱子。', after: '甲找到箱子，但先检查锁。' }
assert.equal(payloadOf(await tool(revisions, 'submit_edit_proposals').execute('', { changes: [setting, outline, change] })).acceptedTotal, 3); checks++
const revised = payloadOf(await tool(revisions, 'submit_edit_proposals').execute('', { final: true, changes: [{ ...setting, after: '甲谨慎，但不喜欢等待。', details: undefined, groupId: undefined }, { ...outline, after: '甲听见箱内响动。' }, { ...change, after: '甲停在门前，先听动静。' }] }))
assert.equal(revised.proposalChanges.length, 3); checks++
assert.equal(revised.proposalChanges.find(item => item.kind === 'worldbook').after, '甲谨慎，但不喜欢等待。'); checks++
assert.deepEqual(revised.proposalChanges.find(item => item.kind === 'worldbook').details, { aliases: ['阿甲'] }); checks++
assert.equal(revised.proposalChanges.find(item => item.kind === 'worldbook').groupId, 'opening'); checks++
assert.equal(revised.proposalChanges.find(item => item.kind === 'outline').after, '甲听见箱内响动。'); checks++
assert.equal(revised.proposalChanges.find(item => item.kind === 'chapter').after, '甲停在门前，先听动静。'); checks++
// Reusing an existing object's ID allocates a candidate ID, then that returned ID
// can be revised without making another object or breaking its references.
const creation = make(writable)
const newPerson = { kind: 'worldbook', targetId: 'person', operation: 'create', field: 'content', before: '', after: '乙在门外。', reason: '补人物', title: '乙', entryType: 'character' }
const created = payloadOf(await tool(creation, 'submit_edit_proposals').execute('', { changes: [newPerson] }))
const createdId = created.changes[0].targetId
assert.notEqual(createdId, 'person'); checks++
const connected = { ...newPerson, targetId: 'friend', title: '丙', after: '丙认识乙。', details: { relations: [{ to: createdId, type: '朋友' }] } }
await tool(creation, 'submit_edit_proposals').execute('', { changes: [connected] })
const updated = payloadOf(await tool(creation, 'submit_edit_proposals').execute('', { changes: [{ ...newPerson, targetId: createdId, after: '乙在门外等候。' }] }))
assert.equal(updated.proposalChanges.length, 2); checks++
assert.equal(updated.changes[0].targetId, createdId); checks++
assert.equal(updated.proposalChanges.find(item => item.targetId === createdId).after, '乙在门外等候。'); checks++
assert.equal(updated.proposalChanges.find(item => item.targetId === 'friend').details.relations[0].to, createdId); checks++

// Browser-owned prose returns through the exchange before becoming a candidate.
// Empty saved chapters keep their append baseline when revising an opening draft.
function makeNarrative(source = '', pending = [], methods = []) {
  const requests = []
  const chapter = { id: 'chapter', text: source }
  const request = req(permission)
  request.kernel.blocks = [{ kind: 'assistant-narrative' }, { kind: 'editing-target', text: JSON.stringify({ chapterId: 'chapter' }) }, { kind: 'writing-methods', text: JSON.stringify(methods) }]
  let narrativeTask
  narrativeTask = createAssistantTask(request, { domains: { manuscript: [chapter] } }, frame => {
    const event = JSON.parse(frame.split('\ndata: ')[1].trim())
    requests.push(event.request)
    queueMicrotask(() => narrativeTask.exchange.accept({ ...event, text: `候选正文${requests.length}。` }))
  }, pending)
  return { task: narrativeTask, requests, chapter }
}
const narrative = makeNarrative()
const generate = tool(narrative.task, 'generate_narrative_draft')
assert.equal(generate.parameters.required.includes('before'), false); checks++
const openingRequest = { targetId: 'chapter', operation: 'append', instruction: '写开篇。' }
const opening = payloadOf(await generate.execute('opening', openingRequest))
assert.equal(opening.phase, 'generated'); checks++
assert.equal(JSON.stringify(opening).split('候选正文1。').length, 2); checks++
assert.equal(Object.hasOwn(opening, 'text'), false); checks++
assert.equal(Object.hasOwn(opening, 'changes'), false); checks++
assert.equal(narrative.requests[0].planning, 'direct'); checks++
assert.equal(narrative.task.state.narrativeFinishCallId, null); checks++
assert.equal(opening.proposalChanges[0].before, ''); checks++
assert.equal(Object.hasOwn(openingRequest, 'before'), false); checks++
const reviseRequest = { targetId: 'chapter', operation: 'replace', scope: 'chapter', draftAction: 'revise', before: '', instruction: '重写刚才的开篇草稿。' }
const openingRevision = payloadOf(await generate.execute('revision', reviseRequest))
assert.equal(openingRevision.ok, true); checks++
assert.equal(narrative.requests[1].operation, 'append'); checks++
assert.equal(narrative.requests[1].draftAction, 'revise'); checks++
assert.equal(narrative.requests[1].pendingChanges[0].after, opening.proposalChanges[0].after); checks++
assert.equal(openingRevision.proposalChanges.length, 1); checks++
assert.equal(openingRevision.proposalChanges[0].operation, 'append'); checks++
assert.equal(openingRevision.proposalChanges[0].before, ''); checks++
assert.equal(openingRevision.proposalChanges[0].after, '候选正文2。'); checks++
assert.equal(narrative.chapter.text, ''); checks++
assert.equal(reviseRequest.operation, 'replace'); checks++
const extendedOpening = payloadOf(await generate.execute('extension', { ...openingRequest, draftAction: 'extend' }))
assert.equal(extendedOpening.proposalChanges[0].after, '候选正文2。\n\n候选正文3。'); checks++
for (const input of [{ ...reviseRequest, draftAction: 'extend' }, { ...reviseRequest, before: '候选正文3。' }, { ...openingRequest, before: '不存在的原文' }, ...['replace', 'insert'].map(operation => ({ ...openingRequest, operation }))]) {
  assert.equal(payloadOf(await generate.execute('invalid-anchor', input)).ok, false); checks++
}
assert.equal(narrative.requests.length, 3); checks++
const noDraft = makeNarrative()
assert.equal(payloadOf(await tool(noDraft.task, 'generate_narrative_draft').execute('no-draft', reviseRequest)).ok, true); checks++
assert.equal(noDraft.requests.length, 1); checks++
assert.equal(noDraft.requests[0].operation, 'append'); checks++
const missingChapterText = makeNarrative('', opening.proposalChanges)
missingChapterText.chapter.sourceLength = 200
assert.equal(payloadOf(await tool(missingChapterText.task, 'generate_narrative_draft').execute('truncated-chapter', reviseRequest)).ok, false); checks++
assert.equal(missingChapterText.requests.length, 0); checks++
const savedChapter = makeNarrative('正式章节。', opening.proposalChanges)
const savedRevision = payloadOf(await tool(savedChapter.task, 'generate_narrative_draft').execute('saved-revision', reviseRequest))
assert.equal(savedRevision.proposalChanges.at(-1).operation, 'replace'); checks++
assert.equal(savedRevision.proposalChanges.at(-1).before, '正式章节。'); checks++
assert.equal(savedChapter.chapter.text, '正式章节。'); checks++

// Loading character/outline craft for earlier object work must not instruct the
// prose generator to keep designing those objects. Explicit author choices do.
const scopedMethods = makeNarrative('正式前文。', [], [{ id: 'world-design' }])
await tool(scopedMethods.task, 'writing_methods').execute('object-methods', { action: 'load', ids: ['character-design', 'outline-causality', 'ghostwrite'] })
const narrativeInstruction = '接着正式前文往下写。\n保留作者要求的叙述口吻。'
await tool(scopedMethods.task, 'generate_narrative_draft').execute('scoped-generation', { ...openingRequest, instruction: narrativeInstruction })
assert.deepEqual(scopedMethods.requests[0].methods.map(method => method.id), ['world-design', 'ghostwrite']); checks++
assert.equal(scopedMethods.requests[0].instruction, narrativeInstruction); checks++
assert.deepEqual(scopedMethods.task.state.loadedMethods.map(method => method.id), ['character-design', 'outline-causality', 'ghostwrite']); checks++
await tool(scopedMethods.task, 'writing_methods').execute('switch-methods', { action: 'load', mode: 'replace', ids: ['line-polish'] })
await tool(scopedMethods.task, 'generate_narrative_draft').execute('polish-generation', { ...openingRequest, instruction: '修订刚才草稿中的病句。' })
assert.deepEqual(scopedMethods.requests[1].methods.map(method => method.id), ['world-design', 'line-polish']); checks++
assert.deepEqual(scopedMethods.requests[0].methods.map(method => method.id), ['world-design', 'ghostwrite']); checks++
assert.equal(scopedMethods.chapter.text, '正式前文。'); checks++

// Clarification pauses with candidates intact; resume restores the pending draft.
const questions = [{ id: 'choice', question: '乙为什么在门外等候？', options: [{ label: '送信', description: '带来新消息。' }, { label: '避雨', description: '先从日常接触展开。' }] }]
const asking = payloadOf(await tool(creation, 'request_user_input').execute('', { questions }))
assert.equal(asking.outcome, 'needs_input'); checks++
assert.equal(creation.state.proposal.changes.length, 2); checks++
assert.deepEqual(finishAssistantTurn(creation, toolTurn('request_user_input')), { action: 'end' }); checks++
assert.equal(assistantToolGuard(creation, 'complete_assistant_task').block, true); checks++
assert.equal((await tool(creation, 'complete_assistant_task').execute('', { intent: 'edit', outcome: 'proposal', message: '结束。' })).isError, true); checks++
assert.equal(creation.state.delivery.outcome, 'needs_input'); checks++
assert.equal(assistantCompletionText([], creation.state.delivery), questions[0].question); checks++
const restored = make(writable, creation.state.proposal.changes)
assert.equal(restored.state.delivery, null); checks++
assert.deepEqual(restored.state.proposal.changes, creation.state.proposal.changes); checks++
assert.equal(payloadOf(await tool(restored, 'submit_edit_proposals').execute('', { changes: [{ ...newPerson, targetId: createdId, after: '乙送信来到门外。' }] })).proposalChanges.length, 2); checks++
assert.equal(creation.state.proposal.changes[0].after, '乙在门外等候。'); checks++
assert.throws(() => make(writable, [{ kind: 'worldbook' }])); checks++

// No local counter blocks a long sequence, and pending author input does not turn
// the remaining native tool batch into fabricated failures.
const ongoing = make()
ongoing.state.acceptedCalls = 1000
ongoing.state.pendingInput = new Set(['queued'])
for (const name of ['world_lookup', 'submit_edit_proposals', 'generate_narrative_draft']) {
  assert.equal(assistantToolGuard(ongoing, name, { maxCallsPerTurn: 6 }), undefined); checks++
}
assert.equal(finishAssistantTurn(ongoing, textTurn('先处理完当前工具结果。')), undefined); checks++

// The adapter acknowledges durable Pi enqueue, coalesces retried IDs, and leaves
// failed enqueues retryable. This fake isolates the queue adapter from a provider.
const queueTask = make()
queueTask.state.editAttempted = true
queueTask.state.delivery = { outcome: 'blocked', message: '旧回执' }
let release
const queued = []
const events = []
const agent = { state: { isStreaming: true }, steer(message) { queued.push(message); return new Promise(resolve => { release = resolve }) } }
const steering = createAssistantSteering({ agent, task: queueTask, req: req(permission), signal: new AbortController().signal, emit: frame => events.push(frame) })
const input = { id: 'live_1', bookId: 'book', text: '保留门口的悬念。' }
const first = steering.enqueue(input)
const duplicate = steering.enqueue(input)
await Promise.resolve()
assert.equal(queued.length, 1); checks++
assert.equal(queueTask.state.pendingInput.size, 1); checks++
release()
assert.deepEqual(await first, { ok: true, id: 'live_1' }); checks++
assert.deepEqual(await duplicate, { ok: true, id: 'live_1' }); checks++
steering.consumed(queued[0])
assert.equal(queueTask.state.pendingInput.size, 0); checks++
assert.equal(queueTask.state.delivery, null); checks++
assert.equal(events.length, 1); checks++
steering.consumed(queued[0])
assert.equal(events.length, 1); checks++
assert.deepEqual(await steering.enqueue(input), { ok: true, id: 'live_1' }); checks++
assert.equal(queued.length, 1); checks++
agent.steer = async () => { throw new Error('queue persistence failed') }
assert.equal((await steering.enqueue({ ...input, id: 'retryable' })).ok, false); checks++
assert.equal(queueTask.state.pendingInput.size, 0); checks++
agent.steer = async message => queued.push(message)
assert.equal((await steering.enqueue({ ...input, id: 'retryable' })).ok, true); checks++
assert.equal(queued.length, 2); checks++
queueTask.state.delivery = { outcome: 'needs_input' }
assert.equal((await steering.enqueue({ ...input, id: 'waiting' })).ok, false); checks++
queueTask.state.delivery = null
agent.state.isStreaming = false
assert.equal((await steering.enqueue({ ...input, id: 'finished' })).ok, false); checks++

// Original resource identity, scope and append-normalization coverage remains.
const workspaceSnapshot = { domains: { workspace: [{ id: 'project:book', bookId: 'book', type: 'project', title: '当前书', text: '', sourceRefs: ['/works/book'] }, { id: 'project:other', bookId: 'other', type: 'project', title: '另一部书', text: '', sourceRefs: ['/works/other'] }, { id: 'chapter:other:opening', bookId: 'other', type: 'chapter', title: '开篇', text: '另一部作品原文', sourceRefs: ['/works/other/chapters/opening'] }] } }
const workspace = tool(createAssistantTask(req(permission), workspaceSnapshot), 'workspace')
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
const anchoredAppend = { ...change, operation: 'append', before: '推开门。', after: '\n\n甲看见了箱子。' }
const acceptedAppend = payloadOf(await tool(make(), 'submit_edit_proposals').execute('', { changes: [anchoredAppend] }))
assert.equal(acceptedAppend.ok, true); checks++
assert.equal(acceptedAppend.changes[0].before, ''); checks++
assert.equal(acceptedAppend.changes[0].operation, 'append'); checks++
assert.equal(acceptedAppend.changes[0].after, anchoredAppend.after); checks++
assert.equal(anchoredAppend.before, '推开门。'); checks++
assert.equal(acceptedAppend.normalizations.length, 1); checks++
assert.equal(payloadOf(await tool(make(), 'submit_edit_proposals').execute('', { changes: [{ ...anchoredAppend, before: '甲推' }] })).ok, false); checks++
const truncated = createAssistantTask(req(permission), { domains: { manuscript: [{ id: 'chapter', text: '甲推开门。', sourceLength: 20000 }] } })
assert.equal(payloadOf(await tool(truncated, 'submit_edit_proposals').execute('', { changes: [anchoredAppend] })).ok, false); checks++
assert.equal(payloadOf(await tool(make(), 'submit_edit_proposals').execute('', { changes: [{ ...anchoredAppend, targetId: 'other', before: '另一章' }] })).ok, false); checks++
const failedEdit = make()
await tool(failedEdit, 'submit_edit_proposals').execute('', { changes: [{ ...anchoredAppend, before: '不在末尾的原文' }] })
assert.equal(failedEdit.state.delivery, null); checks++
assert.equal(finishAssistantTurn(failedEdit, textTurn('原文无法定位，请确认要改哪一段。')), undefined); checks++
assert.equal(failedEdit.state.delivery.outcome, 'blocked'); checks++
console.log(`assistant-runtime-delivery: ${checks} checks passed`)
