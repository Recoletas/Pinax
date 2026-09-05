import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DesktopProjectGate from '../components/desktop/DesktopProjectGate.vue'

const ok = (value) => Promise.resolve({ ok: true, value })
const failed = (code, message = 'failed') => Promise.resolve({ ok: false, error: { code, message } })

afterEach(() => {
  delete window.pinaxDesktop
  document.body.innerHTML = ''
})

function desktop(project = {}) {
  window.pinaxDesktop = {
    platform: 'desktop',
    project: {
      getActive: vi.fn(() => ok(null)),
      chooseDirectory: vi.fn(() => ok('/作品/雾港')), create: vi.fn((input) => ok({ name: input.name, mode: 'read-write' })),
      open: vi.fn(() => ok({ name: '雾港', mode: 'read-write' })), ...project
    },
    migration: {
      chooseBundle: vi.fn(() => ok({ bundleToken: 'bundle-token-123', displayName: '旧项目.json' })),
      chooseDestination: vi.fn(() => ok({ destinationToken: 'destination-token-123', displayName: '作品' })),
      dryRun: vi.fn(() => ok({
        bundleId: 'bundle-1',
        report: {
          suggestedProjectName: '雾港纪事',
          total: 5,
          counts: { supported: 1, converted: 2, detached: 1, orphaned: 0, rejected: 1 },
          records: [{ sourceRecordId: 'writing_notes', recordType: 'writing-notes', status: 'rejected', reason: 'invalid-json' }]
        }
      })),
      importProject: vi.fn(() => ok({
        bundleId: 'bundle-1',
        project: { projectId: 'project-1', name: '雾港纪事', mode: 'read-write', recovery: {} }
      })),
      cancelImport: vi.fn(() => ok(true))
    }
  }
  return window.pinaxDesktop.project
}

describe('DesktopProjectGate', () => {
  it("passes browser mode and an active desktop project through unchanged（合并4例）", async () => {
{
const browser = mount(DesktopProjectGate, { slots: { default: '<main data-test="application">应用</main>' } })
    expect(browser.get('[data-test="application"]').exists()).toBe(true)
    browser.unmount()

    desktop({ getActive: vi.fn(() => ok({ name: '已打开', mode: 'read-write' })) })
    const active = mount(DesktopProjectGate, { slots: { default: '<main data-test="application">应用</main>' } })
    await flushPromises()
    expect(active.get('[data-test="application"]').exists()).toBe(true)

  delete window.pinaxDesktop
  document.body.innerHTML = ''

}
{
desktop()
    const wrapper = mount(DesktopProjectGate, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.get('[data-test="desktop-project-gate"]').text()).toContain('Pinax')
    expect(wrapper.get('[data-test="desktop-project-create"]').text()).toBe('新建项目')
    expect(wrapper.get('[data-test="desktop-project-open"]').text()).toBe('打开项目')
    expect(document.activeElement).toBe(wrapper.get('[data-test="desktop-project-create"]').element)

  delete window.pinaxDesktop
  document.body.innerHTML = ''

}
{
const bridge = desktop()
    const createWrapper = mount(DesktopProjectGate)
    await flushPromises()
    await createWrapper.get('[data-test="desktop-project-create"]').trigger('click')
    await flushPromises()
    expect(bridge.create).toHaveBeenCalledWith({ directory: '/作品/雾港', name: '雾港' })

    bridge.getActive.mockImplementation(() => ok(null))
    bridge.chooseDirectory.mockImplementationOnce(() => ok(null))
    const cancelWrapper = mount(DesktopProjectGate)
    await flushPromises()
    await cancelWrapper.get('[data-test="desktop-project-open"]').trigger('click')
    await flushPromises()
    expect(cancelWrapper.get('[data-test="desktop-project-open"]').attributes('disabled')).toBeUndefined()
    expect(cancelWrapper.find('[role="alert"]').exists()).toBe(false)

    bridge.chooseDirectory.mockImplementationOnce(() => ok('/作品/旧稿'))
    await cancelWrapper.get('[data-test="desktop-project-open"]').trigger('click')
    await flushPromises()
    expect(bridge.open).toHaveBeenCalledWith({ directory: '/作品/旧稿', mode: 'read-write' })

  delete window.pinaxDesktop
  document.body.innerHTML = ''

}
{
const bridge = desktop({
      open: vi.fn((input) => input.mode === 'read-write'
        ? failed('DESKTOP_PROJECT_LOCKED', '项目正在另一窗口中使用')
        : ok({ name: '只读项目', mode: 'read-only' }))
    })
    const wrapper = mount(DesktopProjectGate)
    await flushPromises()
    await wrapper.get('[data-test="desktop-project-open"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('项目正在另一窗口中使用')
    const readOnly = wrapper.get('[data-test="desktop-project-readonly"]')
    await readOnly.trigger('keydown.enter')
    await readOnly.trigger('click')
    await flushPromises()
    expect(bridge.open).toHaveBeenLastCalledWith({ directory: '/作品/雾港', mode: 'read-only' })

    bridge.getActive.mockImplementation(() => failed('DESKTOP_INTEGRITY_FAILED', '项目清单无效'))
    const invalid = mount(DesktopProjectGate)
    await flushPromises()
    expect(invalid.get('[role="alert"]').text()).toContain('项目清单无效')

  delete window.pinaxDesktop
  document.body.innerHTML = ''

}
})

  it("disables both actions while a directory dialog is pending（合并4例）", async () => {
{
let resolveDialog
    desktop({ chooseDirectory: vi.fn(() => new Promise((resolve) => { resolveDialog = resolve })) })
    const wrapper = mount(DesktopProjectGate)
    await flushPromises()
    const action = wrapper.get('[data-test="desktop-project-create"]')
    await action.trigger('click')
    expect(action.attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="desktop-project-open"]').attributes('disabled')).toBeDefined()
    resolveDialog({ ok: true, value: null })
    await flushPromises()

  delete window.pinaxDesktop
  document.body.innerHTML = ''

}
{
desktop()
    const bridge = window.pinaxDesktop
    const wrapper = mount(DesktopProjectGate, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('[data-test="desktop-project-migrate"]').trigger('click')
    await flushPromises()
    expect(bridge.migration.dryRun).toHaveBeenCalledWith({ bundleToken: 'bundle-token-123' })
    expect(wrapper.get('[data-test="desktop-migration-report"]').text()).toContain('可转换 2')
    expect(wrapper.get('[data-test="desktop-migration-report"]').text()).toContain('拒绝 1')
    expect(wrapper.get('[data-test="desktop-migration-issues"]').text()).toContain('writing_notes')
    expect(bridge.migration.importProject).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(wrapper.get('[data-test="desktop-migration-confirm"]').element)

    await wrapper.get('[data-test="desktop-migration-confirm"]').trigger('click')
    await flushPromises()
    expect(bridge.migration.chooseDestination).toHaveBeenCalledOnce()
    expect(bridge.migration.importProject).toHaveBeenCalledWith({
      bundleToken: 'bundle-token-123', destinationToken: 'destination-token-123', name: '雾港纪事'
    })
    expect(bridge.project.open).not.toHaveBeenCalled()

  delete window.pinaxDesktop
  document.body.innerHTML = ''

}
{
desktop()
    const bridge = window.pinaxDesktop
    const wrapper = mount(DesktopProjectGate, { attachTo: document.body })
    await flushPromises()
    const migrate = wrapper.get('[data-test="desktop-project-migrate"]')
    await migrate.trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="desktop-migration-cancel"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="desktop-migration-report"]').exists()).toBe(false)
    expect(bridge.migration.importProject).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(wrapper.get('[data-test="desktop-project-migrate"]').element)

  delete window.pinaxDesktop
  document.body.innerHTML = ''

}
{
desktop()
    const bridge = window.pinaxDesktop
    let resolveImport
    bridge.migration.importProject.mockImplementation(() => new Promise((resolve) => { resolveImport = resolve }))
    bridge.migration.cancelImport.mockImplementation(() => {
      resolveImport({ ok: false, error: { code: 'DESKTOP_IO_FAILED', message: '迁移已取消' } })
      return ok(true)
    })
    const wrapper = mount(DesktopProjectGate)
    await flushPromises()
    await wrapper.get('[data-test="desktop-project-migrate"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="desktop-migration-confirm"]').trigger('click')
    await flushPromises()

    const cancel = wrapper.get('[data-test="desktop-migration-cancel"]')
    expect(cancel.text()).toBe('停止迁移')
    expect(cancel.attributes('disabled')).toBeUndefined()
    await cancel.trigger('click')
    await flushPromises()

    expect(bridge.migration.cancelImport).toHaveBeenCalledOnce()
    expect(wrapper.get('[role="alert"]').text()).toContain('迁移已取消')

  delete window.pinaxDesktop
  document.body.innerHTML = ''

}
})
})
