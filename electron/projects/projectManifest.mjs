import { open, mkdir, readFile, readdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DESKTOP_ERROR_CODES,
  DESKTOP_PROJECT_SCHEMA_VERSION,
  validateProjectManifest
} from '../../shared/desktopProjectContract.js'
import { syncDirectory } from './fsDurability.mjs'

const PROJECT_DIRECTORIES = [
  'manuscript',
  'reference/characters',
  'reference/places',
  'reference/events',
  'reference/research',
  'assets/images',
  'assets/audio',
  'assets/video',
  'assets/documents',
  '.pinax/backups',
  '.pinax/tmp'
]

export async function createProject(root, input, deps = {}) {
  const now = deps.now || (() => new Date())
  const uuid = deps.uuid || (() => crypto.randomUUID())
  const entries = await readdir(root)
  if (entries.length) throw desktopError(DESKTOP_ERROR_CODES.IO_FAILED, 'Project directory must be empty', { path: root })

  for (const directory of PROJECT_DIRECTORIES) {
    await mkdir(join(root, directory), { recursive: true })
  }

  const timestamp = now().toISOString()
  const manifest = {
    schemaVersion: DESKTOP_PROJECT_SCHEMA_VERSION,
    projectId: uuid(),
    name: String(input?.name || '').trim(),
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const validation = validateProjectManifest(manifest)
  if (!validation.valid) throw desktopError(DESKTOP_ERROR_CODES.INVALID_INPUT, validation.error.message)

  const temporaryPath = join(root, '.pinax/tmp', `${uuid()}.project.json`)
  const manifestPath = join(root, '.pinax/project.json')
  const handle = await open(temporaryPath, 'wx')
  try {
    await handle.writeFile(`${JSON.stringify(validation.value, null, 2)}\n`, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await rename(temporaryPath, manifestPath)
  } catch (error) {
    throw desktopError(DESKTOP_ERROR_CODES.IO_FAILED, 'Project manifest already exists or cannot be committed', { path: manifestPath, cause: error?.code })
  }
  await syncDirectory(join(root, '.pinax'))
  return validation.value
}

export async function readProjectManifest(root) {
  const path = join(root, '.pinax/project.json')
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    const result = validateProjectManifest(parsed)
    if (!result.valid) throw new Error(result.error.message)
    return result.value
  } catch (error) {
    throw desktopError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Project manifest is missing or invalid', { path, cause: error?.code })
  }
}

function desktopError(code, message, details) {
  return Object.assign(new Error(message), { code, details })
}
