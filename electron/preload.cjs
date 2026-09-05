const { contextBridge, ipcRenderer } = require('electron')
const { DESKTOP_CHANNELS } = require('./ipc/channels.cjs')

const desktopBridge = Object.freeze({
  platform: 'desktop',
  project: Object.freeze({
    chooseDirectory: () => ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_CHOOSE_DIRECTORY),
    create: (input) => ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_CREATE, input),
    open: (input) => ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_OPEN, input),
    getActive: () => ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_GET_ACTIVE),
    listText: (input) => ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_LIST_TEXT, input),
    readText: (input) => ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_READ_TEXT, input),
    writeText: (input) => ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_WRITE_TEXT, input),
    checkIntegrity: () => ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_CHECK_INTEGRITY),
    createBackup: (input) => ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_CREATE_BACKUP, input),
    close: () => ipcRenderer.invoke(DESKTOP_CHANNELS.PROJECT_CLOSE)
  }),
  migration: Object.freeze({
    chooseBundle: () => ipcRenderer.invoke(DESKTOP_CHANNELS.MIGRATION_CHOOSE_BUNDLE),
    chooseDestination: () => ipcRenderer.invoke(DESKTOP_CHANNELS.MIGRATION_CHOOSE_DESTINATION),
    dryRun: (input) => ipcRenderer.invoke(DESKTOP_CHANNELS.MIGRATION_DRY_RUN, input),
    importProject: (input) => ipcRenderer.invoke(DESKTOP_CHANNELS.MIGRATION_IMPORT, input),
    cancelImport: () => ipcRenderer.invoke(DESKTOP_CHANNELS.MIGRATION_CANCEL)
  }),
  cache: Object.freeze({
    getUsage: () => ipcRenderer.invoke(DESKTOP_CHANNELS.CACHE_GET_USAGE),
    setLimit: (input) => ipcRenderer.invoke(DESKTOP_CHANNELS.CACHE_SET_LIMIT, input),
    prune: () => ipcRenderer.invoke(DESKTOP_CHANNELS.CACHE_PRUNE)
  }),
  collaboration: Object.freeze({
    getPublicConfig: () => ipcRenderer.invoke(DESKTOP_CHANNELS.COLLABORATION_GET_PUBLIC_CONFIG)
  })
})

contextBridge.exposeInMainWorld('pinaxDesktop', desktopBridge)
