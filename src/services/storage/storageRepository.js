import { createBrowserStorageRepository } from './browserStorageRepository'
import { createDesktopProjectRepository } from './desktopProjectRepository'

export function createStorageRepository({ bridge, localStorage = globalThis.localStorage }) {
  if (bridge?.platform === 'desktop') return createDesktopProjectRepository(bridge)
  return createBrowserStorageRepository(localStorage)
}
