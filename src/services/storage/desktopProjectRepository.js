export function createDesktopProjectRepository(bridge) {
  const project = bridge.project
  const migration = bridge.migration || {}
  return Object.freeze({
    kind: 'desktop-project',
    chooseDirectory: () => invoke(project.chooseDirectory),
    create: (input) => invoke(project.create, input),
    open: (input) => invoke(project.open, input),
    getActive: () => invoke(project.getActive),
    listText: (input) => invoke(project.listText, input),
    readText: (input) => invoke(project.readText, input),
    writeText: (input) => invoke(project.writeText, input),
    checkIntegrity: () => invoke(project.checkIntegrity),
    createBackup: (input) => invoke(project.createBackup, input),
    close: () => invoke(project.close),
    chooseMigrationBundle: () => invoke(migration.chooseBundle),
    chooseMigrationDestination: () => invoke(migration.chooseDestination),
    dryRunMigration: (input) => invoke(migration.dryRun, input),
    importLegacyProject: (input) => invoke(migration.importProject, input),
    cancelLegacyImport: () => invoke(migration.cancelImport)
  })
}

async function invoke(method, input) {
  if (typeof method !== 'function') throw typedError({ code: 'DESKTOP_INVALID_INPUT', message: 'Desktop bridge method is unavailable' })
  const result = await method(input)
  if (!result?.ok) throw typedError(result?.error)
  return result.value
}

function typedError(input = {}) {
  return Object.assign(new Error(input.message || 'Desktop operation failed'), {
    code: input.code || 'DESKTOP_IO_FAILED',
    details: input.details
  })
}
