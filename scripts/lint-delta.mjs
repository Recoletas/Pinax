#!/usr/bin/env node
/**
 * lint 差分门禁：存量错误按 scripts/lint-baseline.json 的 file+rule+count 放行，
 * 任何新增错误（新文件、新规则、同键计数增加）都使本命令失败。
 *
 * - 基线不会自动更新；修复存量后请人工从 baseline 删除对应条目。
 * - 输出 warnings 总数供观察，但不作为门禁。
 */
import { ESLint } from 'eslint'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const baselinePath = join(root, 'scripts', 'lint-baseline.json')

const baseline = JSON.parse(await readFile(baselinePath, 'utf8'))
const expected = new Map()
for (const entry of baseline.entries) {
  expected.set(`${entry.file}::${entry.rule}`, entry.count)
}

const eslint = new ESLint({ cwd: root })
const results = await eslint.lintFiles(['src'])
await ESLint.outputFixes(results)

const actual = new Map()
let warningCount = 0
const formatter = await eslint.loadFormatter('stylish')
for (const result of results) {
  const rel = result.filePath.slice(root.length + 1)
  for (const message of result.messages) {
    if (message.severity !== 2) {
      warningCount += 1
      continue
    }
    const key = `${rel}::${message.ruleId || 'PARSE'}`
    actual.set(key, (actual.get(key) || 0) + 1)
    actual.set(`${key}::line:${message.line}`, 1)
  }
}

const newViolations = []
for (const [key, count] of actual) {
  if (key.includes('::line:')) continue
  if (!expected.has(key)) {
    newViolations.push({ key, count, detail: '基线中不存在' })
    continue
  }
  const allowed = expected.get(key)
  if (count > allowed) {
    newViolations.push({ key, count, detail: `超过基线允许的 ${allowed}` })
  }
}

const stale = []
for (const [key, allowed] of expected) {
  const found = actual.get(key) || 0
  if (found < allowed) {
    stale.push(`${key}（基线 ${allowed}，实际 ${found}）`)
  }
}

console.log(formatter.format(results.filter((r) => r.messages.length > 0)))

if (stale.length > 0) {
  console.log('\n[lint-delta] 以下基线条目已部分或全部修复，请人工从 scripts/lint-baseline.json 删除：')
  for (const item of stale) console.log(`  - ${item}`)
}

if (newViolations.length > 0) {
  console.error('\n[lint-delta] 发现基线之外的新增错误，门禁失败：')
  for (const item of newViolations) {
    console.error(`  - ${item.key.replaceAll('::', '  ')} ×${item.count}（${item.detail}）`)
  }
  console.error('\n处理方式：修复新增错误；确属需豁免的存量时，先在本仓库讨论后再人工更新 baseline。')
  process.exit(1)
}

console.log(`\n[lint-delta] 通过：无新增 lint error（基线存量 ${expected.size} 项键，warnings ${warningCount} 条不计门禁）。`)
