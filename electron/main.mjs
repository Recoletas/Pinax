import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCacheManager } from './cache/cacheManager.mjs'
import { registerProjectHandlers } from './ipc/registerProjectHandlers.mjs'
import { createLegacyMigrationService } from './migration/legacyMigrationService.mjs'
import { createProjectService } from './projects/projectService.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
let mainWindow = null
let projectService = null
let migrationService = null
let quitAfterProjectClose = false
let projectCloseInProgress = false

app.enableSandbox()

export function isTrustedApplicationUrl(rawUrl) {
  try {
    const candidate = new URL(rawUrl)
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return candidate.origin === new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin
    }
    const entry = pathToFileURL(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
    return candidate.protocol === 'file:' && candidate.pathname === entry.pathname
  } catch {
    return false
  }
}

export function createMainWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 390,
    minHeight: 620,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedApplicationUrl(url)) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    window.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }
  window.on('closed', () => { if (mainWindow === window) mainWindow = null })
  return window
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  mainWindow = createMainWindow()
  projectService = createProjectService()
  migrationService = createLegacyMigrationService({
    dialog,
    getWindow: () => mainWindow,
    activateProject: (input) => projectService.open(input)
  })
  const cacheManager = await createCacheManager({ root: join(app.getPath('userData'), 'cache') })
  registerProjectHandlers({
    ipcMain,
    getWindow: () => mainWindow,
    isTrustedUrl: isTrustedApplicationUrl,
    dialog,
    repository: projectService,
    migrationService,
    cacheManager
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
  })
})

app.on('before-quit', (event) => {
  if (quitAfterProjectClose) return
  event.preventDefault()
  if (projectCloseInProgress) return
  projectCloseInProgress = true
  const closingService = projectService
  projectService = null
  void (async () => {
    try {
      if (migrationService) await migrationService.cancelAndWait()
      if (closingService) await closingService.close()
    } finally {
      quitAfterProjectClose = true
      app.quit()
    }
  })()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
