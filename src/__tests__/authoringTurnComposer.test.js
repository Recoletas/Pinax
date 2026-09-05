import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AuthoringTurnComposer from '../components/authoring/AuthoringTurnComposer.vue'

// Plan Task 2.2：下一拍输入区。
// 文本+下划线类型选择（无 pill）；默认一两行精简态；主按钮三态；
// 失败保留输入+行动者+对象+导演注并提供重试；更多菜单收纳辅助入口；
// 半自动上限三拍且用户输入暂停；a11y（segmented 键盘操作、live status）。

function makeActor(id = 'char_lina', name = '莉娜') {
  return { id, name }
}

function mountComposer(props = {}) {
  return mount(AuthoringTurnComposer, {
    props: {
      actor: makeActor(),
      target: null,
      viewpoint: null,
      sourceRefs: ['chapter:ch-9'],
      ...props
    }
  })
}

function findButton(wrapper, text) {
  return wrapper.findAll('button').find((button) => button.text().trim() === text)
}

describe('authoring turn composer (plan Task 2.2)', () => {
  it("renders the type selector as underlined text segments with radio semantics, no pills（合并4例）", async () => {
{
const wrapper = mountComposer()
    const group = wrapper.find('[role="radiogroup"]')
    expect(group.exists()).toBe(true)
    const radios = group.findAll('[role="radio"]')
    expect(radios.length).toBe(4)
    for (const radio of radios) {
      expect(radio.element.tagName).toBe('BUTTON')
      expect(radio.classes().some((cls) => cls.includes('pill'))).toBe(false)
    }
    await radios[1].trigger('click')
    expect(radios[1].attributes('aria-checked')).toBe('true')
    // 下划线选中态：激活项携带 underline 标记类，而非胶囊背景。
    expect(radios[1].classes().join(' ')).toContain('underline')
}
{
const wrapper = mountComposer()
    expect(wrapper.find('.turn-composer__more-panel').exists()).toBe(false)
    await findButton(wrapper, '更多').trigger('click')
    expect(wrapper.find('.turn-composer__more-panel').exists()).toBe(true)
    expect(wrapper.text()).toContain('导演注')
    expect(wrapper.text()).toContain('半自动')
    expect(wrapper.text()).toContain('参考摘要')
    expect(wrapper.text()).toContain('下一步方向')
    expect(wrapper.text()).toContain('对话说法')
}
{
const wrapper = mountComposer()
    const primary = () => wrapper.find('[data-test="turn-primary"]')
    expect(primary().text()).toBe('继续下一拍')

    await wrapper.find('textarea').setValue('她推门进入档案室')
    expect(primary().text()).toBe('按此推进')

    await wrapper.setProps({ busy: true })
    expect(primary().text()).toBe('停止')
    await primary().trigger('click')
    expect(wrapper.emitted('stop')?.length).toBe(1)
}
{
const wrapper = mountComposer({
      target: makeActor('char_edgar', '艾德加'),
      viewpoint: makeActor('char_lina', '莉娜')
    })
    await wrapper.find('textarea').setValue('质问印章来源')
    await wrapper.find('[data-test="turn-primary"]').trigger('click')
    const payloads = wrapper.emitted('submit')
    expect(payloads?.length).toBe(1)
    const payload = payloads[0][0]
    expect(payload).toEqual({
      kind: 'action',
      actorId: 'char_lina',
      targetId: 'char_edgar',
      instruction: '质问印章来源',
      directorNote: '',
      sourceRefs: ['chapter:ch-9']
    })
    expect(Object.keys(payload)).not.toContain('prompt')
    expect(Object.keys(payload)).not.toContain('question')
}
})

  it("blocks dialogue submission without a target with a typed live-status reason（合并4例）", async () => {
{
const wrapper = mountComposer({ actor: makeActor() })
    await findButton(wrapper, '对话').trigger('click')
    await wrapper.find('textarea').setValue('质问印章来源')
    await wrapper.find('[data-test="turn-primary"]').trigger('click')
    expect(wrapper.emitted('submit')).toBeUndefined()
    const status = wrapper.find('[role="status"]')
    expect(status.text()).toContain('对话需要说话人与对象')
}
{
const wrapper = mountComposer()
    await findButton(wrapper, '心理').trigger('click')
    await wrapper.find('textarea').setValue('她的迟疑')
    await wrapper.find('[data-test="turn-primary"]').trigger('click')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.find('[role="status"]').text()).toContain('心理需要已知视角人物')

    await wrapper.setProps({ viewpoint: makeActor('char_lina', '莉娜') })
    await wrapper.find('[data-test="turn-primary"]').trigger('click')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ kind: 'thought', instruction: '她的迟疑' })
}
{
const wrapper = mountComposer({
      target: makeActor('char_edgar', '艾德加'),
      viewpoint: makeActor('char_lina', '莉娜'),
      failure: { ok: false, phase: 'provider', code: 'AUTHORING_PROVIDER_FAILED', message: '生成失败，请重试', retryable: true, generatedTextAvailable: false }
    })
    await findButton(wrapper, '对话').trigger('click')
    await wrapper.find('textarea').setValue('质问印章来源')
    await findButton(wrapper, '更多').trigger('click')
    await wrapper.find('.turn-composer__note-input').setValue('语气克制')
    await wrapper.find('[data-test="turn-primary"]').trigger('click')
    const firstPayload = wrapper.emitted('submit')[0][0]

    const retry = wrapper.find('[data-test="turn-retry"]')
    expect(retry.exists()).toBe(true)
    expect(wrapper.find('textarea').element.value).toBe('质问印章来源')
    expect(wrapper.find('.turn-composer__note-input').element.value).toBe('语气克制')
    expect(wrapper.props('actor').id).toBe('char_lina')

    await retry.trigger('click')
    expect(wrapper.emitted('submit')[1][0]).toEqual(firstPayload)
}
{
const wrapper = mountComposer({
      failure: { ok: false, phase: 'persist', code: 'AUTHORING_PERSIST_FAILED', message: '正文已插入，但保存失败', retryable: false, generatedTextAvailable: true }
    })
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('正文已插入，但保存失败')
    // 复验修复 4：persist 阶段不可“重试生成”（正文已在编辑器里）——只保留再次保存。
    expect(wrapper.find('[data-test="turn-retry"]').exists()).toBe(false)
    const retrySave = wrapper.find('[data-test="turn-retry-save"]')
    expect(retrySave.exists()).toBe(true)
    await retrySave.trigger('click')
    expect(wrapper.emitted('retry-save')?.length).toBe(1)
    // 非 persist 阶段不出现“再次保存”。
    const providerWrapper = mountComposer({
      failure: { ok: false, phase: 'provider', message: '生成失败，请重试', retryable: true }
    })
    expect(providerWrapper.find('[data-test="turn-retry-save"]').exists()).toBe(false)
}
})

  it("does not offer retry actions when the failure is not retryable（合并4例）", async () => {
{
const wrapper = mountComposer({
      failure: { ok: false, phase: 'protocol', message: '对话需要说话人与对象', retryable: false }
    })
    expect(wrapper.find('[role="alert"]').text()).toContain('对话需要说话人与对象')
    expect(wrapper.find('[data-test="turn-retry"]').exists()).toBe(false)
}
{
const wrapper = mountComposer()
    await wrapper.find('textarea').setValue('她推门进入档案室')
    await wrapper.setProps({ applyToken: 1 })
    await nextTick()
    expect(wrapper.find('textarea').element.value).toBe('')
}
{
const wrapper = mountComposer()
    await findButton(wrapper, '更多').trigger('click')
    const click = async (text) => { await findButton(wrapper, text).trigger('click') }
    await click('参考摘要')
    await click('下一步方向')
    await click('对话说法')
    expect(wrapper.emitted('request-reference-summary')?.length).toBe(1)
    expect(wrapper.emitted('request-next-directions')?.length).toBe(1)
    expect(wrapper.emitted('request-dialogue-options')?.length).toBe(1)
}
{
const wrapper = mountComposer()
    await findButton(wrapper, '更多').trigger('click')
    await wrapper.find('[data-test="turn-semi-auto"]').trigger('click')
    expect(wrapper.text()).toMatch(/剩余\s*3\s*拍/)

    // 每个 apply token 都是一拍成功写入：token 1 的那一拍就是第 1 拍（spec §6.4 含它共三拍），
    // 之后自动最多再发两拍，绝不出现第 4 拍。
    await wrapper.setProps({ applyToken: 1 })
    await wrapper.setProps({ applyToken: 2 })
    const continues = (wrapper.emitted('submit') || []).map((call) => call[0])
    expect(continues.length).toBe(2)
    for (const payload of continues) {
      expect(payload).toMatchObject({ kind: 'action', instruction: '' })
    }

    // 第 3 拍写入（token 3）→ 硬上限到达。
    await wrapper.setProps({ applyToken: 3 })
    expect((wrapper.emitted('submit') || []).length).toBe(2)
    expect(wrapper.text()).toMatch(/剩余\s*0\s*拍/)

    await wrapper.setProps({ applyToken: 4 })
    expect((wrapper.emitted('submit') || []).length).toBe(2)
}
})

  it("pauses semi-auto immediately when the user types input（合并3例）", async () => {
{
const wrapper = mountComposer()
    await findButton(wrapper, '更多').trigger('click')
    await wrapper.find('[data-test="turn-semi-auto"]').trigger('click')
    await wrapper.find('textarea').setValue('手动接管这一拍')
    await wrapper.setProps({ applyToken: 1 })
    expect(wrapper.emitted('submit')).toBeUndefined()
}
{
const wrapper = mountComposer()
    const radios = () => wrapper.find('[role="radiogroup"]').findAll('[role="radio"]')
    await radios()[0].trigger('keydown', { key: 'ArrowRight' })
    expect(radios()[1].attributes('aria-checked')).toBe('true')
    await radios()[1].trigger('keydown', { key: 'ArrowLeft' })
    expect(radios()[0].attributes('aria-checked')).toBe('true')
}
{
const wrapper = mountComposer()
    wrapper.vm.applyAdvanceContext({ kind: 'scene', instruction: '以此事件推进：码头火并' })
    await nextTick()
    // spec §5.3：填入下一拍输入并聚焦，等用户确认，不直接生成。
    expect(wrapper.find('textarea').element.value).toBe('以此事件推进：码头火并')
    const active = wrapper.find('[role="radio"][aria-checked="true"]')
    expect(active.text()).toBe('场景')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.find('[data-test="turn-primary"]').text()).toBe('按此推进')

    // 用户确认后按场景回合提交。
    await wrapper.find('[data-test="turn-primary"]').trigger('click')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ kind: 'scene', instruction: '以此事件推进：码头火并' })
}
})
})

// —— worldbook scene closure Task 9：编辑器连续的续写坞 ——

describe('composer continuation dock (Task 9)', () => {
  function makePeople() {
    return [
      { id: 'char_lina', name: '莉娜' },
      { id: 'char_edgar', name: '艾德加' }
    ]
  }

  it("keeps the root as a continuation dock with keyboard-operable text tabs and no pills（合并4例）", async () => {
{
const wrapper = mountComposer({ people: makePeople() })
    expect(wrapper.find('[data-test="turn-dock"]').exists()).toBe(true)
    // 类型仍是文字分段（下划线选中态），无 pill 类。
    for (const radio of wrapper.find('[role="radiogroup"]').findAll('[role="radio"]')) {
      expect(radio.classes().some((cls) => cls.includes('pill'))).toBe(false)
    }
}
{
const wrapper = mountComposer({ people: makePeople() })
    await wrapper.find('[data-test="select-actor"]').trigger('click')
    const options = wrapper.findAll('[role="option"]')
    expect(options.length).toBe(2)
    await options[1].trigger('click')
    expect(wrapper.emitted('select-actor')?.[0]).toEqual(['char_edgar'])

    await wrapper.find('[data-test="select-target"]').trigger('click')
    await wrapper.findAll('[role="option"]')[0].trigger('click')
    expect(wrapper.emitted('select-target')?.[0]).toEqual(['char_lina'])
}
{
const wrapper = mount(AuthoringTurnComposer, { props: { zenMode: true } })
    const collapsed = wrapper.find('[data-test="turn-dock-collapsed"]')
    expect(collapsed.exists()).toBe(true)
    expect(collapsed.text()).toBe('下一拍')
    expect(wrapper.find('textarea').exists()).toBe(false)

    await collapsed.trigger('click')
    await nextTick()
    expect(wrapper.find('textarea').exists()).toBe(true)
}
{
const wrapper = mount(AuthoringTurnComposer, { props: { zenMode: true } })
    await wrapper.find('[data-test="turn-dock-collapsed"]').trigger('click')
    await nextTick()

    // 打开“更多”披露 → Escape 只关披露，不收坞。
    await findButton(wrapper, '更多').trigger('click')
    expect(wrapper.find('.turn-composer__more-panel').exists()).toBe(true)
    await wrapper.find('[data-test="turn-dock"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.turn-composer__more-panel').exists()).toBe(false)
    expect(wrapper.find('textarea').exists()).toBe(true)

    // 再次 Escape → 收起续写坞。
    await wrapper.find('[data-test="turn-dock"]').trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(wrapper.find('[data-test="turn-dock-collapsed"]').exists()).toBe(true)
}
})
})
