import { reactive } from 'vue'

export const tooltipState = reactive({ anchor: null, text: '', side: 'left' })
let timer
let pendingAnchor
function dismiss(element) {
  if (!element || pendingAnchor === element) { clearTimeout(timer); pendingAnchor = null }
  if (!element || tooltipState.anchor === element) {
    const anchor = tooltipState.anchor
    anchor?.removeAttribute('aria-describedby')
    tooltipState.anchor = null
  }
}
export const vWorkbenchTooltip = {
  mounted(element, binding) {
    element._pinaxTooltipValue = binding.value
    const show = immediate => {
      dismiss()
      const value = element._pinaxTooltipValue
      const content = typeof value === 'string' ? { text: value } : value
      if (!content?.text) return
      pendingAnchor = element
      timer = setTimeout(() => {
        if (!element.isConnected) return
        tooltipState.text = content.text; tooltipState.side = content.side || 'left'; tooltipState.anchor = element
        element.setAttribute('aria-describedby', 'pinax-tool-tooltip')
      }, immediate ? 0 : 250)
    }
    const handlers = {
      pointerenter: event => { if (event.pointerType !== 'touch') { element._pinaxTouch = false; show(false) } },
      pointerleave: () => dismiss(element), focus: () => { if (!element._pinaxTouch) show(true) }, blur: () => { element._pinaxTouch = false; dismiss(element) },
      pointerdown: event => { element._pinaxTouch = event.pointerType === 'touch'; dismiss(element) }, keydown: event => { if (event.key === 'Escape') dismiss(element) }
    }
    element._pinaxTooltipHandlers = handlers
    for (const [name, handler] of Object.entries(handlers)) element.addEventListener(name, handler)
  },
  updated(element, binding) { element._pinaxTooltipValue = binding.value },
  unmounted(element) {
    dismiss(element)
    for (const [name, handler] of Object.entries(element._pinaxTooltipHandlers || {})) element.removeEventListener(name, handler)
    delete element._pinaxTooltipHandlers; delete element._pinaxTooltipValue; delete element._pinaxTouch
  }
}
export function dismissWorkbenchTooltip() { dismiss() }
