import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { defineComponent, h } from 'vue'
import { useSettingKeyboardShortcuts } from '../composables/useSettingKeyboardShortcuts'

function mountWith(handlers) {
  let api
  const Comp = defineComponent({
    setup() {
      api = useSettingKeyboardShortcuts(handlers)
      return () => h('div', { 'data-testid': 'root' })
    }
  })
  const wrapper = mount(Comp, { attachTo: document.body })
  return { wrapper, api }
}

function pressKey(key, opts = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts })
  document.dispatchEvent(event)
  return event
}

describe('useSettingKeyboardShortcuts', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('Cmd/Ctrl + S → 触发 save handler（任意位置）', async () => {
    const save = vi.fn()
    const { wrapper } = mountWith({ save })
    pressKey('s', { metaKey: true })
    expect(save).toHaveBeenCalledTimes(1)
    pressKey('S', { ctrlKey: true })
    expect(save).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('"?" 在非输入框内 → 切换 hintsOpen', async () => {
    const { wrapper, api } = mountWith({})
    expect(api.hintsOpen.value).toBe(false)
    pressKey('?')
    expect(api.hintsOpen.value).toBe(true)
    pressKey('?')
    expect(api.hintsOpen.value).toBe(false)
    wrapper.unmount()
  })

  it('"?" 在 data-setting-field-card 内的输入框 → 不切换', async () => {
    const { wrapper, api } = mountWith({})
    const card = document.createElement('div')
    card.setAttribute('data-setting-field-card', 'world.origin')
    const input = document.createElement('input')
    card.appendChild(input)
    document.body.appendChild(card)
    input.focus()
    const ev = new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true })
    input.dispatchEvent(ev)
    expect(api.hintsOpen.value).toBe(false)
    wrapper.unmount()
  })

  it('Cmd+Shift+Z 在 data-setting-field-card 内 → 触发 undo + preventDefault', async () => {
    const undo = vi.fn()
    const { wrapper } = mountWith({ undo })
    const card = document.createElement('div')
    card.setAttribute('data-setting-field-card', 'world.origin')
    const input = document.createElement('input')
    card.appendChild(input)
    document.body.appendChild(card)
    input.focus()
    const ev = new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true, metaKey: true, shiftKey: true })
    input.dispatchEvent(ev)
    expect(undo).toHaveBeenCalledTimes(1)
    expect(ev.defaultPrevented).toBe(true)
    wrapper.unmount()
  })

  it('Cmd+Shift+Z 在字段外 → 不触发 undo', async () => {
    const undo = vi.fn()
    const { wrapper } = mountWith({ undo })
    pressKey('z', { metaKey: true, shiftKey: true })
    expect(undo).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('Esc 关闭 hints', async () => {
    const { wrapper, api } = mountWith({})
    api.hintsOpen.value = true
    pressKey('Escape')
    expect(api.hintsOpen.value).toBe(false)
    wrapper.unmount()
  })

  it('unmount 后不再响应快捷键', async () => {
    const save = vi.fn()
    const { wrapper } = mountWith({ save })
    wrapper.unmount()
    pressKey('s', { metaKey: true })
    expect(save).not.toHaveBeenCalled()
  })
})
