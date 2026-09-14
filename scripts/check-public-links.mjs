#!/usr/bin/env node
/**
 * 公共阅读路径链接检查（B13/GFI-5 基础版）。
 *
 * 只覆盖公开入口文件中的相对路径链接与本地锚点文件存在性；
 * 不做全站爬取。VitePress ignoreDeadLinks 下的 docs 构建不代表链接有效，
 * 本脚本是显式清单式核对。
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_FILES = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'THIRD_PARTY_NOTICES.md',
  'docs/src/index.md',
  'docs/src/code-map.md'
]

const linkPattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
let broken = 0
let checked = 0

for (const relFile of PUBLIC_FILES) {
  const absFile = join(root, relFile)
  if (!existsSync(absFile)) {
    console.error(`[links] 清单文件缺失: ${relFile}`)
    broken += 1
    continue
  }
  const content = readFileSync(absFile, 'utf8')
  const dir = dirname(absFile)
  const seen = new Set()
  for (const match of content.matchAll(linkPattern)) {
    const raw = match[1]
    if (seen.has(raw)) continue
    seen.add(raw)
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('mailto:')) continue
    checked += 1
    const [pathPart] = raw.split('#')
    if (!pathPart) continue // 纯页内锚点
    const target = resolve(dir, decodeURIComponent(pathPart))
    if (!existsSync(target)) {
      console.error(`[links] 断链: ${relFile} → ${raw}`)
      broken += 1
    }
  }
}

console.log(`[links] 检查 ${PUBLIC_FILES.length} 个公共入口，本地相对链接 ${checked} 条，断链 ${broken} 条。`)
process.exit(broken > 0 ? 1 : 0)
