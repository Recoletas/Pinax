import { computed, nextTick, ref, watch } from 'vue'
import {
  blocksPassiveInlineSuggestion,
  resolveWritingInteractionOwner
} from '../services/writing/writingInteractionPolicy.js'

// 行内写作助手的页面编排 owner(A 线):光标状态、IME 组合状态机、
// 触发调度与输入所有权仲裁都收在这里。
// 职责边界:
// - 请求身份/timer/候选仍由 useWritingAgent(agent)唯一拥有,这里只路由语义事件;
// - 编辑器事务与原子历史接缝仍归页面;采纳提交(插入→信任 consume→不符回退)
//   的顺序契约在本模块,peek 由页面先行调用 agent 公共 API;
// - 页面通过窄注入提供真实活动编辑面的光标读取与只读 UI 信号,
//   不传整页状态,也不持有第二份可变光标。
export function useInlineWritingAgentHost({
  agent,
  cursorRef = ref(0),
  compositionRef = ref(false),
  readCursorSnapshot,
  buildAgentInput,
  readInteractionSignals = () => ({})
}) {
  // 光标/组合态的读写在页面 setup 早期就有 computed 链依赖(编辑器选区投影),
  // refs 由页面按初始化顺序声明后注入;读写语义与唯一 owner 仍是本模块。
  const cursorPos = cursorRef
  const compositionActive = compositionRef

  // 同步真实活动编辑面的光标;返回快照供调用方更新自己的工具栏选区状态。
  // cancelOnMove:已有候选时光标移位即取消(旧 textarea 粘贴路径的语义)。
  function syncCursor({ cancelOnMove = false } = {}) {
    const snapshot = readCursorSnapshot()
    const cursorMoved = Number(snapshot.end) !== cursorPos.value
    if (cancelOnMove && cursorMoved && agent.visible.value) agent.cancel('cursor-move')
    cursorPos.value = snapshot.end
    return { ...snapshot, cursorMoved }
  }

  function setCursor(nextCursor) {
    cursorPos.value = Math.max(0, Number(nextCursor) || 0)
  }

  // 光标移动不是“拒绝这个候选”:清除落笔处请求去重后,用户移回原文处
  // 仍可按 dwell 重新触发;显式拒绝继续由 agent 的 dismissedFingerprint 抑制。
  function cancelForCursorMove() {
    agent.cancel('cursor-move')
  }

  function schedule(inputType, nextCursorPos = cursorPos.value) {
    agent.onInput({
      ...buildAgentInput(nextCursorPos),
      interactionOwner: owner.value,
      inputType,
      composing: compositionActive.value
    })
  }

  const owner = computed(() => {
    const signals = readInteractionSignals()
    return resolveWritingInteractionOwner({
      ...signals,
      composing: compositionActive.value || Boolean(signals.dualComposing),
      inlineSuggestionVisible: agent.visible.value,
      inlineSuggestionRequesting: agent.requesting.value
    })
  })

  watch(owner, (value) => {
    if (blocksPassiveInlineSuggestion(value)) agent.suppress(value)
  })

  // —— 语义事件路由:页面不再各自散布 suppress/cancel ——

  function notifyEditorInput(payload = {}) {
    // selection-change 会先于 input 到达,可能已排入 cursor dwell;
    // 历史、粘贴及程序化写入必须取消那条定时器,不能只跳过调度。
    if (payload.inputType !== 'input') {
      agent.suppress(payload.inputType || 'document-change')
      return
    }
    if (!agent.enabled.value || payload.composing || compositionActive.value) return
    schedule('input')
  }

  function handleSelectionMoved({ transactionOwned = false, hasSelectionText = false } = {}) {
    const snapshot = syncCursor()
    if (!transactionOwned && (snapshot.cursorMoved || hasSelectionText)) cancelForCursorMove()
    return snapshot
  }

  function scheduleCursorDwell({ transactionOwned = false, hasSelectionText = false, snapshot } = {}) {
    if (transactionOwned || !snapshot?.cursorMoved || hasSelectionText) return
    if (!agent.enabled.value) return
    schedule('cursor', snapshot.end)
  }

  function notifyCompositionStart() {
    compositionActive.value = true
    agent.suppress('composition')
  }

  // 组合结束:状态与解除抑制同步;调度由页面按原时序 nextTick 后发起
  // (等待编辑器最终合成事务落盘,payload 内容才完整)。
  function notifyCompositionEnd() {
    compositionActive.value = false
    agent.finishComposition()
    // compositionend 时 Vue/ProseMirror 的正文同步可能尚未完成:延迟到
    // nextTick 再构造 payload,并在执行前复核 enabled/组合/所有权,
    // 防止读取组合前文本或越过新 owner 排入请求。
    nextTick(() => {
      if (!agent.enabled.value || compositionActive.value) return
      if (blocksPassiveInlineSuggestion(owner.value)) return
      schedule('input')
    })
  }

  function notifyCompositionAborted(reason = 'abort') {
    compositionActive.value = false
    agent.suppress(`composition-${reason}`)
  }

  function notifyPaste() {
    agent.suppress('paste')
  }

  function notifyUserScroll() {
    agent.suppress('scroll')
  }

  function notifyCommandMenu(open) {
    if (open) agent.suppress('command-menu')
  }

  function notifyContextMenuOpen() {
    agent.suppress('context-menu')
  }

  function notifyHistory(kind = 'history') {
    agent.suppress(kind)
  }

  function notifyBlur() {
    agent.suppress('blur')
  }

  // 显式 Esc/关闭拒绝:保持 agent 默认 'user' reason,同落笔处不再重复弹。
  function notifyDismiss() {
    agent.cancel()
  }

  // 工具接管(块推演/干预/参考清理等)与作用域切换(切章/切文档)是
  // 临时取消:不写 dismissedFingerprint(返回原落笔处可重新触发),
  // 但会像 cursor-move 一样清除该落笔处的请求去重,允许重新排入。
  function cancelForToolTakeover() {
    agent.cancel('tool-takeover')
  }

  function cancelForScopeChange() {
    agent.cancel('scope-change')
  }

  // —— 采纳提交(A 线 A2):插入 → 信任 consume → 不符即编辑器回退 ——
  // 顺序契约不可变:插入成功前绝不消费候选;插入本身会同步推进快照,
  // consume 必须走 ignoreRevision,否则二次 revision 校验会拒绝自己刚
  // 写入的正文(Tab 采纳静默丢内容的根因)。consume 数量与 peek 不符时
  // 用编辑器 undo 原样回退。peek 由页面先行调用 agent 公共 API;
  // 原子历史的接缝由现有 owner 经 hooks 显式参与,模块不重建历史状态。
  let adoptionInFlight = false

  // 返回 'adopted' | 'rejected'(正文未动) | 'uncertain'(正文可能已变,
  // 回退未确认——页面应提示作者检查正文,不得假装未发生)。
  function commitAdoption(mode = 'all', inserted, {
    editor,
    beforeInsert,
    onAdopted,
    afterSync
  } = {}) {
    if (!editor || adoptionInFlight || !inserted) return 'rejected'
    // 窗口先于 beforeInsert 建立:hook 同步触发再次提交会被守卫拦下。
    adoptionInFlight = true
    try {
      let accepted = false
      try {
        beforeInsert?.()
        // surface 在响应前销毁(编辑器卸载/文档切换)可能以异常表达失败:
        // 与返回 false 同样处理——不消费、不回退(无可回退物)、不崩溃。
        accepted = editor.insertPlainText(inserted, { origin: 'writing-agent' })
      } catch {
        accepted = false
      }
      if (!accepted) return 'rejected'
      let consumed
      try {
        consumed = agent.consume(mode, { ignoreRevision: true })
      } catch {
        // consume 抛错:已插入正文必须尽力回退;回退失败则为 uncertain。
        try { editor.undo() } catch { return 'uncertain' }
        return 'rejected'
      }
      if (consumed !== inserted) {
        try {
          editor.undo()
        } catch {
          // 回退失败:正文是否仍在稿面未知,交页面提示作者检查。
          return 'uncertain'
        }
        return 'rejected'
      }
      try { onAdopted?.() } catch { /* UI 同步异常不改变采纳事实 */ }
      try { afterSync?.() } catch { /* 同上,不二次 consume */ }
      return 'adopted'
    } finally {
      adoptionInFlight = false
    }
  }

  // Ghost 采纳/原子历史窗口内的编辑器 input 冒泡保护:此时只允许同步光标,
  // 任何清候选/失效回执/新联想都会让 consume 校验失败并整段回滚。
  function isAdoptionInFlight() {
    return adoptionInFlight
  }

  return {
    cursorPos,
    compositionActive,
    interactionOwner: owner,
    syncCursor,
    setCursor,
    schedule,
    handleSelectionMoved,
    scheduleCursorDwell,
    notifyEditorInput,
    notifyCompositionStart,
    notifyCompositionEnd,
    notifyCompositionAborted,
    notifyPaste,
    notifyUserScroll,
    notifyCommandMenu,
    notifyContextMenuOpen,
    notifyHistory,
    notifyBlur,
    notifyDismiss,
    cancelForCursorMove,
    cancelForToolTakeover,
    cancelForScopeChange,
    commitAdoption,
    isAdoptionInFlight
  }
}
