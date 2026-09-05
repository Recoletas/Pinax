import { open } from 'node:fs/promises'

const UNSUPPORTED_DIRECTORY_SYNC_ERRORS = new Set(['EINVAL', 'ENOTSUP', 'EISDIR'])

export async function syncDirectory(path, deps = {}) {
  const openDirectory = deps.open || open
  const platform = deps.platform || process.platform
  try {
    const handle = await openDirectory(path, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch (error) {
    const unsupported = UNSUPPORTED_DIRECTORY_SYNC_ERRORS.has(error?.code)
      || (platform === 'win32' && error?.code === 'EPERM')
    if (!unsupported) throw error
  }
}
