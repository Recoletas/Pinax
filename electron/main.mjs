import { app, BrowserWindow, dialog, ipcMain, Menu, session } from 'electron'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCacheManager } from './cache/cacheManager.mjs'
import { registerProjectHandlers } from './ipc/registerProjectHandlers.mjs'
import { createLegacyMigrationService } from './migration/legacyMigrationService.mjs'
import { createProjectService } from './projects/projectService.mjs'
import { DESKTOP_CHANNELS } from './ipc/channels.cjs'
import { resolveDesktopCollaborationConfig } from './collaboration/publicConfig.mjs'

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
    autoHideMenuBar: true,
    ...(process.platform === 'win32' ? {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#f7f6f3', symbolColor: '#292925', height: 48 }
    } : {}),
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
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
  ipcMain.on(DESKTOP_CHANNELS.WINDOW_APPEARANCE, (event, dark) => {
    if (process.platform !== 'win32' || event.senderFrame !== mainWindow?.webContents.mainFrame ||
        !isTrustedApplicationUrl(event.senderFrame?.url)) return
    mainWindow.setTitleBarOverlay({ color: dark ? '#242421' : '#f7f6f3', symbolColor: dark ? '#e4e2dd' : '#292925', height: 48 })
  })
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  projectService = createProjectService()
  const projectDirectory = process.argv.find(arg => arg.startsWith('--pinax-project='))?.slice('--pinax-project='.length)
  if (projectDirectory && isAbsolute(projectDirectory)) {
    try { await projectService.open({ directory: projectDirectory, mode: 'read-write' }) }
    catch (error) { dialog.showErrorBox('无法打开指定的 Pinax 项目', error.message) }
  }
  migrationService = createLegacyMigrationService({
    dialog,
    getWindow: () => mainWindow,
    activateProject: (input) => projectService.open(input)
  })
  const cacheManager = await createCacheManager({ root: join(app.getPath('userData'), 'cache') })
  const collaborationConfig = resolveDesktopCollaborationConfig(process.env)
  ipcMain.handle(DESKTOP_CHANNELS.COLLABORATION_GET_PUBLIC_CONFIG, event => {
    if (!isTrustedApplicationUrl(event.senderFrame.url)) throw new Error('untrusted-collaboration-config-request')
    return collaborationConfig
  })
  registerProjectHandlers({
    ipcMain,
    getWindow: () => mainWindow,
    isTrustedUrl: isTrustedApplicationUrl,
    dialog,
    repository: projectService,
    migrationService,
    cacheManager
  })

  mainWindow = createMainWindow()
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
