import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SettingDraftReview from '../components/worldbook/SettingDraftReview.vue'

const baseDraft = () => ({
  fieldKey: 'origin',
  fieldLabel: '世界起源',
  content: 'line1\nline2\nline3',
  promptPreview: 'preview'
})

describe('SettingDraftReview — diff / status / adopt', () => {
  beforeEach(() => {
    // confirm 默认 true → 直接走 adopt 路径
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('draft 为 null → 不渲染', () => {
    const wrapper = mount(SettingDraftReview, {
      props: { draft: null, currentFieldValue: '' }
    })
    expect(wrapper.find('.setting-draft-review').exists()).toBe(false)
    wrapper.unmount()
  })

  it('空 diff（before=after）→ 不显示 diff details', () => {
    const sameContent = 'line1\nline2'
    const draft = { ...baseDraft(), content: sameContent }
    const wrapper = mount(SettingDraftReview, {
      props: { draft, currentFieldValue: sameContent }
    })
    expect(wrapper.find('.diff-preview').exists()).toBe(false)
    wrapper.unmount()
  })

  it('有 diff → details 打开后展示 add/del/same', async () => {
    const draft = { ...baseDraft(), content: 'line1\nline3-new' }
    const wrapper = mount(SettingDraftReview, {
      props: { draft, currentFieldValue: 'line1\nline2' }
    })
    const details = wrapper.find('.diff-preview')
    expect(details.exists()).toBe(true)
    await details.find('summary').trigger('click')
    await nextTick()
    const items = wrapper.findAll('.diff-list li')
    expect(items.length).toBeGreaterThan(0)
    // 至少一行是 del (line2)、一行是 add (line3-new)
    const types = items.map((li) => li.classes()[0])
    expect(types).toContain('diff-del')
    expect(types).toContain('diff-add')
    expect(types).toContain('diff-same')
    wrapper.unmount()
  })

  it('采纳（无冲突）→ 触发 save-field，不弹 confirm', async () => {
    const draft = baseDraft()
    const wrapper = mount(SettingDraftReview, {
      props: { draft, currentFieldValue: '' }
    })
    await wrapper.find('.primary-btn').trigger('click')
    expect(window.confirm).not.toHaveBeenCalled()
    expect(wrapper.emitted('save-field')).toBeTruthy()
    wrapper.unmount()
  })

  it('采纳（有冲突 + confirm true）→ save-field 触发', async () => {
    const draft = baseDraft()
    const wrapper = mount(SettingDraftReview, {
      props: { draft, currentFieldValue: 'existing content' }
    })
    await wrapper.find('.primary-btn').trigger('click')
    expect(window.confirm).toHaveBeenCalled()
    expect(wrapper.emitted('save-field')).toBeTruthy()
    wrapper.unmount()
  })

  it('采纳（有冲突 + confirm false）→ 不 save-field', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const draft = baseDraft()
    const wrapper = mount(SettingDraftReview, {
      props: { draft, currentFieldValue: 'existing' }
    })
    await wrapper.find('.primary-btn').trigger('click')
    expect(wrapper.emitted('save-field')).toBeFalsy()
    wrapper.unmount()
  })

  it('状态：pending 显示进度', () => {
    const draft = baseDraft()
    const status = { state: 'pending', progress: '3/6', error: '' }
    const wrapper = mount(SettingDraftReview, {
      props: { draft, currentFieldValue: '', status }
    })
    expect(wrapper.find('.generation-status').exists()).toBe(true)
    expect(wrapper.find('.generation-status').classes()).toContain('is-pending')
    expect(wrapper.text()).toContain('3/6')
    wrapper.unmount()
  })

  it('状态：error 显示重试按钮', async () => {
    const draft = baseDraft()
    const status = { state: 'error', progress: '', error: '网络错误' }
    const wrapper = mount(SettingDraftReview, {
      props: { draft, currentFieldValue: '', status }
    })
    const retryBtn = wrapper.find('.status-retry')
    expect(retryBtn.exists()).toBe(true)
    await retryBtn.trigger('click')
    expect(wrapper.emitted('retry')).toBeTruthy()
    wrapper.unmount()
  })

  it('status=null → 不显示 status 行', () => {
    const draft = baseDraft()
    const wrapper = mount(SettingDraftReview, {
      props: { draft, currentFieldValue: '', status: null }
    })
    expect(wrapper.find('.generation-status').exists()).toBe(false)
    wrapper.unmount()
  })

  it('discard 按钮触发 discard 事件', async () => {
    const draft = baseDraft()
    const wrapper = mount(SettingDraftReview, {
      props: { draft, currentFieldValue: '' }
    })
    const discardBtn = wrapper.findAll('button').find((b) => b.text() === '丢弃')
    expect(discardBtn).toBeTruthy()
    await discardBtn.trigger('click')
    expect(wrapper.emitted('discard')).toBeTruthy()
    wrapper.unmount()
  })
})
