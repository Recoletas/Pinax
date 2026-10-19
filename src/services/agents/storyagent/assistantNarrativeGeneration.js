import { normalizeNarrativeTransportResult } from '../../narrativePresentation.js'
import { getWritingMarkdownPosition } from '../../writing/writingDocumentSchema.js'
import { getWritingBlockText } from '../../../../shared/writingBlockHistoryContract.js'
import { buildAuthoringTurnIntent } from '../authoring/authoringTurnContract.js'
import { createNarrativeSceneWorkflow } from '../authoring/narrativeSceneWorkflow.js'

export async function generateAssistantNarrative({ request, prepared, signal }, { readCurrent, resolveTarget, readNarrative }) {
  const chapterId = prepared.currentChapterId
  const baseline = prepared.editBaseline.book.chapters.find(chapter => String(chapter.id) === chapterId)?.content || ''
  const isCurrent = () => { const current = readCurrent(); return !signal?.aborted && current.projectId === prepared.bookId && current.chapterId === chapterId && !current.exploration && current.markdown === baseline }
  if (!isCurrent()) throw new Error('正文或编辑位置已变化，请重新发起写作。')
  const document = readCurrent().document
  let unit = document.content.at(-1), node = unit?.content?.at(-1)
  let localOffset = node ? getWritingBlockText(node).length : 0
  if (request.operation !== 'append') {
    const index = baseline.indexOf(request.before)
    if (index < 0 || index !== baseline.lastIndexOf(request.before)) throw new Error('改写原文已变化，请重新选择。')
    const anchor = request.operation === 'insert' ? index + request.before.length : index
    for (const candidate of document.content) for (const block of candidate.content || []) {
      const start = getWritingMarkdownPosition(document, block.attrs?.nodeId, 0)
      const end = getWritingMarkdownPosition(document, block.attrs?.nodeId, getWritingBlockText(block).length)
      if (start != null && end != null && anchor >= start && anchor <= end) {
        unit = candidate; node = block
        localOffset = Math.max(0, Math.min(getWritingBlockText(block).length, anchor - start))
      }
    }
  }
  if (!unit || !node) throw new Error('当前正文没有可定位的写作单元。')
  const target = resolveTarget({ unitId: unit.attrs.unitId, nodeId: node.attrs.nodeId, cursorLocalOffset: localOffset })
  const operation = request.operation === 'replace' ? 'rewrite-unit' : 'next-passage'
  const instruction = [prepared.authorQuestion || '', request.instruction,
    request.operation === 'replace' ? `只输出以下原文片段的替换正文，不改写其他段落：\n${request.before}` : request.operation === 'insert' ? '只输出插入该位置的新增正文，不复述前文或后文。' : '从当前章节末尾接续，只输出新增正文，不复述已经发生的事。'].filter(Boolean).join('\n')
  const built = buildAuthoringTurnIntent({ operation, kind: 'action', instruction, sourceRefs: [`chapter:${chapterId}`],
    ...(request.operation === 'replace' ? { rewriteText: request.before } : {}) })
  if (!built.ok) throw new Error(`写作要求无效：${built.reason}`)
  const narrative = readNarrative()
  const input = { target: { id: chapterId, revision: readCurrent().revision }, intent: { invocationTarget: target, operation, turn: built.turn }, options: { signal, assistantSampling: prepared.sampling, onModelRequest: prepared.onNarrativeModelRequest } }
  const context = await narrative.resolveContext({ taskId: 'authoring.advance', request: input })
  if (!isCurrent()) throw new Error('正文或编辑位置已变化，生成尚未执行。')
  let result
  try { result = await createNarrativeSceneWorkflow({ runTurn: narrative.runTurn }).run({ task: { id: 'authoring.advance' }, request: input, context }) }
  catch (error) {
    if (error.generatedText) error.generatedText = normalizeNarrativeTransportResult(error.generatedText).prose
    if (!signal?.aborted && (String(error.code) === '20' || error.message === 'This operation was aborted')) error.message = '推演等待模型超时，已有文字已保留，可以重试。'
    throw error
  }
  const text = String(result.actions?.find(action => action.type === 'text-insert')?.content || '')
  if (!isCurrent()) throw Object.assign(new Error('正文已变化，生成内容已保留但不能采用。'), { generatedText: text })
  return { ...result, text }
}
