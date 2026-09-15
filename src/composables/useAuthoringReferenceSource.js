import { ref } from 'vue'

// 显式续写参考的唯一 owner(A 线 A6):来源身份冻结、作用域绑定与
// 请求前可用性都由本模块协调;页面只发出选择/移除/刷新意图。
// 参考不再是游离的全局页面状态:它绑定选择时的作用域(章/文档),
// 作用域变化后自动失效,即使某个切换路径忘记显式清理,旧参考也不会
// 再喂给新落笔处的请求(读取侧 readForScope 同时把关)。
export function useAuthoringReferenceSource() {
  const reference = ref(null)
  const scopeKey = ref('')

  function select(asset, { scopeKey: currentScopeKey = '' } = {}) {
    const content = String(asset?.content || '').trim()
    if (!content) return { ok: false, reason: 'empty-content' }
    reference.value = Object.freeze({
      id: String(asset.id || ''),
      title: String(asset.title || ''),
      kind: asset.kind,
      source: asset.source,
      content,
      sourceRefs: Object.freeze([...(Array.isArray(asset.sourceRefs) ? asset.sourceRefs : [])]),
      updatedAt: asset.updatedAt || null,
      revision: asset.revision || null
    })
    scopeKey.value = String(currentScopeKey || '')
    return { ok: true, reference: reference.value }
  }

  function clear() {
    const had = Boolean(reference.value)
    reference.value = null
    scopeKey.value = ''
    return had
  }

  // 作用域切换(切章/切文档/切书)后,旧作用域的参考不得带进新落笔处。
  function clearIfScopeChanged(currentScopeKey) {
    if (!reference.value) return false
    if (scopeKey.value === String(currentScopeKey || '')) return false
    return clear()
  }

  // 请求前可用性:只有作用域仍匹配时才把参考交给上下文装配。
  function readForScope(currentScopeKey) {
    if (!reference.value) return null
    return scopeKey.value === String(currentScopeKey || '') ? reference.value : null
  }

  return {
    reference,
    scopeKey,
    select,
    clear,
    clearIfScopeChanged,
    readForScope
  }
}
