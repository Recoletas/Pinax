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

function findFirstLineNumber(content, regex) {
  const lines = content.split('\n')
  const lineIndex = lines.findIndex((line) => regex.test(line))
  return lineIndex >= 0 ? lineIndex + 1 : -1
}

describe('architecture guard', () => {
  it('only API layer and retry runner can call sendChat', () => {
    const allowedCallers = new Set([
      'services/api.js',
      'services/generationRetry.js'
    ])

    const offenders = []
    const files = walkFiles(srcDir)
    const sendChatCallRegex = /\bsendChat\s*\(/

    for (const file of files) {
      const rel = toPosixPath(relative(srcDir, file))
      if (rel.startsWith('__tests__/')) continue

      const content = readFileSync(file, 'utf-8')
      if (!sendChatCallRegex.test(content)) continue
      if (allowedCallers.has(rel)) continue

      offenders.push({
        file: rel,
        line: findFirstLineNumber(content, sendChatCallRegex)
      })
    }

    if (offenders.length > 0) {
      const detail = offenders
        .map(({ file, line }) => {
          const lineInfo = line > 0 ? `:${line}` : ''
          return `- ${file}${lineInfo} -> 请改为通过 generationRetry 统一执行器发起请求，不要直接调用 sendChat().`
        })
        .join('\n')

      throw new Error(
        `检测到未授权的 sendChat() 直接调用：\n${detail}\n允许调用方仅有：services/api.js, services/generationRetry.js`
      )
    }

    expect(offenders).toHaveLength(0)
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
      if (!importSendChatRegex.test(content)) continue

      offenders.push({
        file: rel,
        line: findFirstLineNumber(content, /import\s*\{[^}]*\bsendChat\b/)
      })
    }

    if (offenders.length > 0) {
      const detail = offenders
        .map(({ file, line }) => {
          const lineInfo = line > 0 ? `:${line}` : ''
          return `- ${file}${lineInfo} -> 请移除 sendChat 直接导入，改为调用 generationRetry 服务或对应 store action。`
        })
        .join('\n')

      throw new Error(`检测到 pages/stores 直接导入 sendChat：\n${detail}`)
    }

    expect(offenders).toHaveLength(0)
  })
})
