import channelsModule from './channels.cjs'
import {
  DESKTOP_ERROR_CODES,
  failure,
  success,
  validateCacheLimitInput,
  validateCreateProjectInput,
  validateOpenProjectInput,
  validateWriteTextInput
} from '../../shared/desktopProjectContract.js'
import {
  validateMigrationDryRunTokenInput,
  validateMigrationImportTokenInput
} from '../../shared/legacyMigrationContract.js'

const { DESKTOP_CHANNELS } = channelsModule

export function registerProjectHandlers({ ipcMain, getWindow, isTrustedUrl, dialog, repository, migrationService, cacheManager }) {
  const registrations = [
    [DESKTOP_CHANNELS.PROJECT_CHOOSE_DIRECTORY, noPayload, async () => {
      const result = await dialog.showOpenDialog(getWindow(), { properties: ['openDirectory', 'createDirectory'] })
      return result.canceled ? null : result.filePaths[0] || null
    }],
    [DESKTOP_CHANNELS.PROJECT_CREATE, validateCreateProjectInput, (input) => repository.create(input)],
    [DESKTOP_CHANNELS.PROJECT_OPEN, validateOpenProjectInput, (input) => repository.open(input)],
    [DESKTOP_CHANNELS.PROJECT_GET_ACTIVE, noPayload, () => repository.getActive()],
    [DESKTOP_CHANNELS.PROJECT_LIST_TEXT, validateListInput, (input) => repository.listText(input)],
    [DESKTOP_CHANNELS.PROJECT_READ_TEXT, validateItemInput, (input) => repository.readText(input)],
    [DESKTOP_CHANNELS.PROJECT_WRITE_TEXT, validateWriteTextInput, (input) => repository.writeText(input)],
    [DESKTOP_CHANNELS.PROJECT_CHECK_INTEGRITY, noPayload, () => repository.checkIntegrity()],
    [DESKTOP_CHANNELS.PROJECT_CREATE_BACKUP, validateBackupInput, (input) => repository.createBackup(input)],
    [DESKTOP_CHANNELS.PROJECT_CLOSE, noPayload, () => repository.close()],
    [DESKTOP_CHANNELS.MIGRATION_CHOOSE_BUNDLE, noPayload, () => migrationService.chooseBundle()],
    [DESKTOP_CHANNELS.MIGRATION_CHOOSE_DESTINATION, noPayload, () => migrationService.chooseDestination()],
    [DESKTOP_CHANNELS.MIGRATION_DRY_RUN, validateMigrationDryRunTokenInput, (input) => migrationService.dryRun(input)],
    [DESKTOP_CHANNELS.MIGRATION_IMPORT, validateMigrationImportTokenInput, (input) => migrationService.importProject(input)],
    [DESKTOP_CHANNELS.MIGRATION_CANCEL, noPayload, () => migrationService.cancelImport()],
    [DESKTOP_CHANNELS.CACHE_GET_USAGE, noPayload, () => cacheManager.usage()],
    [DESKTOP_CHANNELS.CACHE_SET_LIMIT, validateCacheLimitInput, (input) => cacheManager.setLimit(input.bytes)],
    [DESKTOP_CHANNELS.CACHE_PRUNE, noPayload, () => cacheManager.prune()]
  ]

  for (const [channel, validate, invoke] of registrations) {
    ipcMain.handle(channel, async (event, payload) => {
      if (!isTrustedSender(event, getWindow(), isTrustedUrl)) {
        return failure(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Untrusted desktop IPC sender')
      }
      const validation = validate(payload)
      if (!validation.valid) return failure(validation.error.code, validation.error.message)
      try {
        return success(toSerializable(await invoke(validation.value)))
      } catch (error) {
        return failure(error?.code, error?.message, error?.details)
      }
    })
  }
}

function isTrustedSender(event, window, isTrustedUrl) {
  const frame = event?.senderFrame
  return Boolean(window && frame && frame === window.webContents?.mainFrame && isTrustedUrl(frame.url))
}

function noPayload() {
  return { valid: true, value: undefined }
}

function validateListInput(input) {
  if (!input || !['manuscript', 'reference'].includes(input.kind)) return invalid('Invalid text list kind')
  if (input.directory !== undefined && typeof input.directory !== 'string') return invalid('Invalid contained directory')
  return { valid: true, value: { kind: input.kind, directory: input.directory || '' } }
}

function validateItemInput(input) {
  if (!input || typeof input.itemId !== 'string' || !input.itemId.trim()) return invalid('Project item id is required')
  return { valid: true, value: { itemId: input.itemId.trim() } }
}

function validateBackupInput(input) {
  if (!input || typeof input.destinationDirectory !== 'string' || !input.destinationDirectory.trim()) {
    return invalid('Backup destination is required')
  }
  return { valid: true, value: { destinationDirectory: input.destinationDirectory.trim() } }
}

function invalid(message) {
  return { valid: false, error: { code: DESKTOP_ERROR_CODES.INVALID_INPUT, message } }
}

function toSerializable(value) {
  if (value === undefined) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    throw Object.assign(new Error('Desktop response is not serializable'), { code: DESKTOP_ERROR_CODES.IO_FAILED })
  }
}
