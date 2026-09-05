import { computed, ref } from 'vue'
import { resolvePlatformBridge } from '../services/platform/platformBridge'

export function useDesktopProject(scope = globalThis) {
  const bridge = resolvePlatformBridge(scope)
  const isDesktop = bridge.platform === 'desktop'
  const activeProject = ref(null)
  const busy = ref(false)
  const initializing = ref(isDesktop)
  const error = ref(null)
  const lockedDirectory = ref('')
  const migrationBundleToken = ref('')
  const migrationReport = ref(null)
  const migrationProjectName = ref('迁移项目')
  const migrationImporting = ref(false)

  async function initialize() {
    if (!isDesktop) return
    initializing.value = true
    try {
      activeProject.value = await invoke(bridge.project.getActive)
    } catch (caught) {
      error.value = caught
    } finally {
      initializing.value = false
    }
  }

  async function chooseAndCreate() {
    return perform(async () => {
      const directory = await invoke(bridge.project.chooseDirectory)
      if (!directory) return null
      const name = projectNameFromPath(directory)
      activeProject.value = await invoke(bridge.project.create, { directory, name })
      return activeProject.value
    })
  }

  async function chooseAndOpen() {
    return perform(async () => {
      const directory = await invoke(bridge.project.chooseDirectory)
      if (!directory) return null
      try {
        activeProject.value = await invoke(bridge.project.open, { directory, mode: 'read-write' })
        return activeProject.value
      } catch (caught) {
        if (caught.code === 'DESKTOP_PROJECT_LOCKED') lockedDirectory.value = directory
        throw caught
      }
    })
  }

  async function openReadOnly() {
    if (!lockedDirectory.value) return null
    return perform(async () => {
      activeProject.value = await invoke(bridge.project.open, {
        directory: lockedDirectory.value,
        mode: 'read-only'
      })
      lockedDirectory.value = ''
      return activeProject.value
    })
  }

  async function chooseAndPreviewMigration() {
    return perform(async () => {
      const selection = await invoke(bridge.migration?.chooseBundle)
      if (!selection) return null
      const preview = await invoke(bridge.migration?.dryRun, { bundleToken: selection.bundleToken })
      migrationBundleToken.value = selection.bundleToken
      migrationReport.value = preview?.report || null
      migrationProjectName.value = preview?.report?.suggestedProjectName || '迁移项目'
      return preview
    })
  }

  async function confirmMigration() {
    if (!migrationBundleToken.value || !migrationReport.value) return null
    return perform(async () => {
      const destination = await invoke(bridge.migration?.chooseDestination)
      if (!destination) return null
      migrationImporting.value = true
      try {
        const imported = await invoke(bridge.migration?.importProject, {
          bundleToken: migrationBundleToken.value,
          destinationToken: destination.destinationToken,
          name: migrationProjectName.value
        })
        activeProject.value = imported.project
        migrationBundleToken.value = ''
        migrationReport.value = null
        return activeProject.value
      } finally {
        migrationImporting.value = false
      }
    })
  }

  async function cancelMigration() {
    if (migrationImporting.value) {
      await invoke(bridge.migration?.cancelImport)
      return true
    }
    if (busy.value) return false
    migrationBundleToken.value = ''
    migrationReport.value = null
    migrationProjectName.value = '迁移项目'
    error.value = null
    return true
  }

  async function perform(operation) {
    if (busy.value) return null
    busy.value = true
    error.value = null
    try {
      return await operation()
    } catch (caught) {
      error.value = caught
      return null
    } finally {
      busy.value = false
    }
  }

  return {
    isDesktop,
    activeProject,
    hasActiveProject: computed(() => Boolean(activeProject.value)),
    busy,
    initializing,
    error,
    lockedDirectory,
    canMigrate: isDesktop && Boolean(bridge.migration),
    migrationBundleToken,
    migrationReport,
    migrationProjectName,
    migrationImporting,
    initialize,
    chooseAndCreate,
    chooseAndOpen,
    openReadOnly,
    chooseAndPreviewMigration,
    confirmMigration,
    cancelMigration
  }
}

async function invoke(method, input) {
  if (typeof method !== 'function') throw typedError({ code: 'DESKTOP_INVALID_INPUT', message: '桌面项目桥接不可用' })
  const result = input === undefined ? await method() : await method(input)
  if (!result?.ok) throw typedError(result?.error)
  return result.value
}

function typedError(input = {}) {
  return Object.assign(new Error(input.message || '桌面项目操作失败'), {
    code: input.code || 'DESKTOP_IO_FAILED',
    details: input.details
  })
}

function projectNameFromPath(path) {
  const parts = String(path).replaceAll('\\', '/').split('/').filter(Boolean)
  return parts.at(-1) || '未命名项目'
}
