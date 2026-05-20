import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'

const srcDir = resolve(process.cwd(), 'src')

function toPosixPath(filePath) {
  return filePath.split(sep).join('/')
}

function walkFiles(dirPath, out = []) {
  for (const name of readdirSync(dirPath)) {
    const absPath = resolve(dirPath, name)
    const stat = statSync(absPath)
    if (stat.isDirectory()) {
      walkFiles(absPath, out)
      continue
    }

    if (!/\.(js|vue)$/i.test(name)) continue
    out.push(absPath)
  }
  return out
}

describe('architecture guard', () => {
  it('only API layer and retry runner can call sendChat', () => {
    const allowedCallers = new Set([
      'services/api.js',
      'services/generationRetry.js'
    ])

    const offenders = []
    const files = walkFiles(srcDir)

    for (const file of files) {
      const rel = toPosixPath(relative(srcDir, file))
      if (rel.startsWith('__tests__/')) continue

      const content = readFileSync(file, 'utf-8')
      if (!/\bsendChat\s*\(/.test(content)) continue
      if (!allowedCallers.has(rel)) offenders.push(rel)
    }

    expect(offenders).toEqual([])
  })

  it('pages and stores must not import sendChat directly', () => {
    const disallowedRoots = ['pages', 'stores']
    const importSendChatRegex = /import\s*\{[^}]*\bsendChat\b[^}]*\}\s*from\s*['"][^'"]*services\/api['"]/m

    const offenders = []
    const files = walkFiles(srcDir)

    for (const file of files) {
      const rel = toPosixPath(relative(srcDir, file))
      if (!disallowedRoots.some((root) => rel.startsWith(`${root}/`))) continue

      const content = readFileSync(file, 'utf-8')
      if (importSendChatRegex.test(content)) offenders.push(rel)
    }

    expect(offenders).toEqual([])
  })
})
