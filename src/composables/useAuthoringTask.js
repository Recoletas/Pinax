import { ref, shallowRef } from 'vue'
import {
  applyAuthoringText,
  undoAuthoringText
} from '../services/agents/authoring/authoringTextTransaction.js'
import { resolveLegacyTaskAlias } from '../../shared/agentCapabilityContract.js'
import { buildAuthoringTurnUnitMarkdown } from '../services/writing/writingAuthoringTurnImport.js'
import { authoringFailure } from '../services/agents/authoring/authoringExecutionResult.js'

const NOTICE_DURATION_MS = 6000

// 创作任务运行时：把命令条意图变成一次 AI 请求 + 一个可撤销的正文事务。
// 语义约束：
// - 改写选区（replaceSelectionTaskIds）精确替换选区范围，其余命令在光标处插入；
// - 带来源的结果（originRefs）走 writingUnit 事务：一次生成 = 一个 schema-v3 单元，
//   编辑器写入与持久化都确认后才推进 apply token（下一拍输入区据此清空草稿）；
// - revision 在请求前捕获、应用前用 getLiveRevision 复查，过期则不写入并给出可重试提示；
// - 辅助结果（下一步/对话选项/涌现）只进入候选列表，永不作为正文插入；
// - 只保留一个请求级撤销回执，手动编辑即失效。
export function useAuthoringTask({
  resolveTarget = () => null,
  execute = null,
  applyPatchToEditor = () => false,
  applyWritingUnit = null,
  restoreFullText = () => {},
  persist = () => {},
  getLiveRevision = null,
  replaceSelectionTaskIds = ['authoring.rewrite'],
  emitDiagnostic = null
} = {}) {
  const busy = ref(false)
  const error = ref('')
  const notice = ref(null)
  const auxiliary = shallowRef(null)
  const currentDocument = shallowRef(null)
  const lastReceipt = shallowRef(null)
  // 插入成功但持久化失败时的待保存回执：只记 requestId/单元 ID，不保存正文内容。
  const pendingPersist = shallowRef(null)
  // 成功应用的正文事务计数：供下一拍输入区在成功写入后推进草稿状态。
  const appliedCount = ref(0)
  let noticeTimer = null
  let abortController = null
  let requestStartedAt = 0
  let requestDiagnosticId = ''

  function requestIdOf() {
    return requestDiagnosticId
  }

  // 低敏诊断：只上报 phase/code/retryable/耗时/请求 ID；正文、prompt、transcript 永不进入指标。
  // 停止（abort）是用户可见的暂停态，不算 provider 故障，不上报。
  function reportDiagnostic(taskId, failure) {
    if (typeof emitDiagnostic !== 'function' || !failure || failure.ok !== false) return
    if (failure.code === 'AUTHORING_ABORTED') return
    emitDiagnostic({
      taskId,
      phase: failure.phase,
      code: failure.code,
      retryable: failure.retryable === true,
      durationMs: Math.max(0, Math.round(performance.now() - requestStartedAt)),
      requestId: String(failure.requestId || '')
    })
  }

  // typed 失败 + legacy reason 字段共存：旧调用点/测试仍可读 reason，新链路读 phase/code。
  function typedFailure(taskId, input, legacyReason, text = '') {
    const failure = authoringFailure(input)
    reportDiagnostic(taskId, failure)
    return { ...failure, reason: legacyReason, text }
  }

  function clearNotice() {
    if (noticeTimer) {
      clearTimeout(noticeTimer)
      noticeTimer = null
    }
    notice.value = null
  }

  function showNotice(text, { canUndo = false } = {}) {
    clearNotice()
    notice.value = { text, canUndo }
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => {
      notice.value = null
      noticeTimer = null
    }, NOTICE_DURATION_MS)
  }

  async function run(commandId, { turn = null, narrativeContext = null } = {}) {
    if (busy.value) return
    const target = resolveTarget(commandId)
    if (!target?.document) return
    const canonicalId = resolveLegacyTaskAlias(commandId)
    busy.value = true
    error.value = ''
    lastReceipt.value = null
    auxiliary.value = null
    abortController = new AbortController()
    requestStartedAt = performance.now()
    requestDiagnosticId = `${commandId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
    try {
      const result = await execute?.({
        taskId: commandId,
        request: turn
          ? { ...target.request, turn, ...(narrativeContext ? { narrativeContext } : {}) }
          : target.request,
        signal: abortController.signal
      })

      // 辅助结果：候选列表展示，绝不插入正文。
      // 结果同时带回 outcome（suggestions/candidates），供下一拍输入区上方的
      // 候选短列表（spec §8）消费；这里只负责"候选不入正文"的边界。
      const optionSuggestions = (result?.suggestions || []).filter((item) => item?.type === 'option' && item.content)
      if (optionSuggestions.length) {
        auxiliary.value = { kind: 'options', taskId: canonicalId, items: optionSuggestions }
        showNotice(`已生成 ${optionSuggestions.length} 个候选，请在列表中查看`)
        return { ok: true, text: '', auxiliary: 'options', suggestions: optionSuggestions }
      }
      if (Array.isArray(result?.candidates) && result.candidates.length) {
        auxiliary.value = { kind: 'candidates', taskId: canonicalId, items: result.candidates }
        showNotice(`已提炼 ${result.candidates.length} 个涌现候选，请审阅`)
        return { ok: true, text: '', auxiliary: 'candidates', candidates: result.candidates }
      }

      const generated = String(result?.text || '').trim()
      if (!generated) {
        showNotice('本次没有生成可插入的正文')
        return typedFailure(commandId, {
          phase: 'protocol',
          code: 'AUTHORING_EMPTY_RESULT',
          message: '本次没有生成可插入的正文'
        }, 'empty-result')
      }

      // 过期门禁：文档在请求期间被改动则丢弃结果（同长度修改也会改变 revision 指纹）。
      const baseRevision = String(target.document.revision || '')
      const liveRevision = String(getLiveRevision?.() ?? baseRevision)
      if (liveRevision !== baseRevision) {
        showNotice('文档已更新，本次结果未写入；可重新执行该命令', { canUndo: false })
        return typedFailure(commandId, {
          phase: 'stale',
          code: 'AUTHORING_STALE',
          message: '文档已更新，本次结果未写入；可重新执行该命令',
          retryable: true
        }, 'stale')
      }

      // 选区改写精确替换选区；其余在光标处插入。
      const selection = target.selection || null
      const replaceSelection = replaceSelectionTaskIds.includes(canonicalId) && selection?.hasSelection
      const documentText = String(target.document.text || '')
      const caret = Math.max(0, Math.min(documentText.length, Number(target.caret ?? documentText.length)))

      // 带来源的结果走 writingUnit 事务：编辑器写入一个新 schema-v3 单元，
      // 回执文本使用同一 Markdown 投影，保证撤销精确恢复。
      const originRefs = Array.isArray(result?.originRefs) ? result.originRefs : null
      const useUnitPath = Boolean(originRefs?.length) && typeof applyWritingUnit === 'function' && !replaceSelection
      const insertedText = useUnitPath ? buildAuthoringTurnUnitMarkdown(generated) : generated
      if (!insertedText) {
        showNotice('本次没有生成可插入的正文')
        return typedFailure(commandId, {
          phase: 'protocol',
          code: 'AUTHORING_EMPTY_RESULT',
          message: '本次没有生成可插入的正文'
        }, 'empty-result')
      }
      const patch = replaceSelection
        ? {
            from: Math.max(0, Math.min(documentText.length, Number(selection.start))),
            to: Math.max(0, Math.min(documentText.length, Number(selection.end))),
            text: generated
          }
        : { from: caret, to: caret, text: insertedText }

      const applied = applyAuthoringText(target.document, {
        ...patch,
        requestId: `${canonicalId}:${Date.now().toString(36)}`
      })

      // 编辑器写入确认：单元事务失败时不推进 apply token、不持久化、保留草稿。
      // 目标感知（Task 3）：回合路径携带冻结的 afterUnitId/expectedUnitRevision；
      // 目标缺失/revision 过期归为 stale（现场已变），不是编辑器故障。
      const written = useUnitPath
        ? applyWritingUnit({
            text: generated,
            originRefs,
            afterUnitId: target.targetUnitId || null,
            expectedUnitRevision: target.targetUnitRevision ?? null
          })
        : applyPatchToEditor(patch)
      if (!written) {
        lastReceipt.value = null
        currentDocument.value = null
        error.value = '生成的正文已就绪，但未能写入编辑器'
        showNotice(error.value)
        return typedFailure(commandId, {
          phase: 'editor-write',
          code: 'AUTHORING_EDITOR_WRITE_FAILED',
          message: '正文已生成，但未能插入当前落笔处',
          retryable: true,
          generatedTextAvailable: true,
          requestId: requestIdOf()
        }, 'editor-write', generated)
      }
      // 写入结果归一：true / 旧版 unitId 字符串 / 新版 typed 对象。
      const writeOutcome = written === true
        ? { ok: true }
        : typeof written === 'string' && written
          ? { ok: true, unitId: written }
          : (written && typeof written === 'object'
            ? (Object.prototype.hasOwnProperty.call(written, 'ok')
              ? written
              : { ok: Boolean(written.unitId), unitId: String(written.unitId || '') })
            : { ok: false, reason: 'editor-write' })
      if (!writeOutcome.ok) {
        const staleTarget = writeOutcome.reason === 'target-unit-missing' || writeOutcome.reason === 'target-unit-stale'
        lastReceipt.value = null
        currentDocument.value = null
        error.value = staleTarget
          ? '当前落笔处已变化，本次结果未写入'
          : '生成的正文已就绪，但未能写入编辑器'
        showNotice(error.value)
        return typedFailure(commandId, {
          phase: staleTarget ? 'stale' : 'editor-write',
          code: staleTarget ? 'AUTHORING_TARGET_STALE' : 'AUTHORING_EDITOR_WRITE_FAILED',
          message: error.value,
          retryable: true,
          generatedTextAvailable: true,
          requestId: requestIdOf()
        }, staleTarget ? 'stale' : 'editor-write', generated)
      }

      const insertedUnitId = String(writeOutcome.unitId || '')

      // 持久化确认：保存失败同样视为未提交（apply token 不推进），
      // 但保留一次待保存回执供“再次保存”重试；回执含内存中的正文与
      // 有界撤销所需信息（插入后文档 + 撤销回执），绝不进指标。
      // retryable:false：正文已在编辑器里，重新请求 provider 会造成重复插入。
      if (persist() === false) {
        lastReceipt.value = null
        currentDocument.value = null
        error.value = '正文已写入编辑器，但保存失败；请手动重试保存'
        showNotice(error.value)
        pendingPersist.value = {
          requestId: requestIdOf(),
          insertedUnitId,
          generatedTextAvailable: true,
          text: generated,
          undoReceipt: applied.receipt || null,
          undoDocument: applied.document || null
        }
        return typedFailure(commandId, {
          phase: 'persist',
          code: 'AUTHORING_PERSIST_FAILED',
          message: '正文已插入，但保存失败',
          retryable: false,
          generatedTextAvailable: true,
          requestId: requestIdOf()
        }, 'persist', generated)
      }
      pendingPersist.value = null

      currentDocument.value = applied.document
      lastReceipt.value = applied.receipt
      appliedCount.value += 1
      showNotice(
        replaceSelection ? '已替换选区内容' : '已把生成的正文写入当前章节',
        { canUndo: true }
      )
      return { ok: true, text: generated }
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'AGENT_REQUEST_ABORTED' || err?.code === 'AGENT_ABORTED') {
        showNotice('已停止生成')
        // 停止是可见的暂停态（半自动据此暂停），但不算 provider 故障指标。
        return typedFailure(commandId, {
          phase: 'provider',
          code: 'AUTHORING_ABORTED',
          message: '已停止生成',
          retryable: true
        }, 'aborted')
      }
      if (err?.code === 'AGENT_CONTROL_TEXT_LEAK') {
        error.value = String(err?.message || '生成正文包含了用户控制文本')
        showNotice(error.value)
        return typedFailure(commandId, {
          phase: 'protocol',
          code: 'AUTHORING_CONTROL_TEXT_LEAK',
          message: error.value
        }, 'control-text-leak')
      }
      error.value = String(err?.message || '生成失败')
      showNotice(error.value)
      const staleReason = err?.code === 'AGENT_RESULT_STALE'
      return staleReason
        ? typedFailure(commandId, {
            phase: 'stale',
            code: 'AUTHORING_STALE',
            message: error.value,
            retryable: true
          }, 'stale')
        : typedFailure(commandId, {
            phase: 'provider',
            code: String(err?.code || 'AUTHORING_PROVIDER_FAILED'),
            message: error.value
          }, 'error')
    } finally {
      busy.value = false
      abortController = null
    }
  }

  // 手动编辑使瞬时回执失效（由页面的输入事件调用）。
  // 同时清除待保存回执：正文已被手动改动，旧的插入回执不可再代表当前文档。
  function invalidateReceipt() {
    lastReceipt.value = null
    pendingPersist.value = null
    if (notice.value?.canUndo) clearNotice()
  }

  // 章节切换 / 手动保存成功后由页面调用：只清待保存回执，不动撤销回执。
  function clearPendingPersist() {
    pendingPersist.value = null
  }

  // 待保存重试：只再次调用 persist()，绝不重新请求 provider 或重复插单元。
  // 成功 = 该正文事务真正提交：推进 apply token（输入区据此清空），
  // 并把内存中的正文交还页面供观察器补一次调度。
  function retryPersist() {
    if (!pendingPersist.value) return { ok: false, reason: 'nothing-to-save' }
    const receipt = pendingPersist.value
    if (persist() === false) {
      return authoringFailure({
        phase: 'persist',
        code: 'AUTHORING_PERSIST_FAILED',
        message: '正文仍未保存，请检查存储空间',
        retryable: false,
        generatedTextAvailable: true
      })
    }
    pendingPersist.value = null
    error.value = ''
    // 复验修复 3：只有真的恢复了撤销回执才宣称 canUndo——
    // persist 初次失败会清空 lastReceipt/currentDocument，
    // 不恢复就提示“可撤销”会让 undoLastRequest() 静默失败。
    if (receipt.undoReceipt && receipt.undoDocument) {
      lastReceipt.value = receipt.undoReceipt
      currentDocument.value = receipt.undoDocument
    }
    appliedCount.value += 1
    showNotice('已保存', { canUndo: Boolean(receipt.undoReceipt && receipt.undoDocument) })
    return { ok: true, text: String(receipt.text || ''), insertedUnitId: receipt.insertedUnitId || '' }
  }

  function undoLastRequest() {
    const receipt = lastReceipt.value
    const document = currentDocument.value
    if (!receipt || !document) return false
    const restored = undoAuthoringText(document, receipt)
    lastReceipt.value = null
    if (!restored) return false
    currentDocument.value = restored
    restoreFullText(restored.text)
    persist(restored)
    clearNotice()
    return true
  }

  function cancel() {
    abortController?.abort()
  }

  function dismissAuxiliary() {
    auxiliary.value = null
  }

  // 外部（如下一拍输入区的 typed 校验失败）复用同一条瞬时提示通道。
  function notify(text, options = {}) {
    showNotice(text, options)
  }

  return {
    busy,
    error,
    notice,
    auxiliary,
    appliedCount,
    pendingPersist,
    run,
    cancel,
    undoLastRequest,
    invalidateReceipt,
    clearPendingPersist,
    retryPersist,
    dismissAuxiliary,
    notify
  }
}
