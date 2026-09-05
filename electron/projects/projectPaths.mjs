import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { DESKTOP_ERROR_CODES, validateRelativeProjectPath } from '../../shared/desktopProjectContract.js'

export async function resolveProjectPath(root, relativePath, { allowPinax = false } = {}) {
  const rootPath = resolve(String(root || ''))
  const normalized = String(relativePath || '').trim().replaceAll('\\', '/')
  const validation = allowPinax && normalized.startsWith('.pinax/')
    ? validateInternalPath(normalized)
    : validateRelativeProjectPath(normalized)
  if (!validation.valid) throw pathError(relativePath)

  const target = resolve(rootPath, validation.value)
  if (!isContained(rootPath, target)) throw pathError(relativePath)

  const realRoot = await realpath(rootPath)
  const existingAncestor = await nearestExistingAncestor(target)
  const realAncestor = await realpath(existingAncestor)
  if (!isContained(realRoot, realAncestor)) throw pathError(relativePath)
  return target
}

function validateInternalPath(path) {
  if (!path
    || path.startsWith('/')
    || /^[a-zA-Z]:\//.test(path)
    || path.split('/').some((part) => !part || part === '.' || part === '..')) {
    return { valid: false }
  }
  return { valid: true, value: path }
}

function isContained(root, target) {
  const child = relative(root, target)
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child))
}

async function nearestExistingAncestor(target) {
  let current = target
  while (true) {
    try {
      await lstat(current)
      return current
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      const parent = resolve(current, '..')
      if (parent === current) throw error
      current = parent
    }
  }
}

function pathError(path) {
  return Object.assign(new Error('Project path escapes the permitted root'), {
    code: DESKTOP_ERROR_CODES.PATH_OUTSIDE_PROJECT,
    details: { path: String(path || '') }
  })
}
