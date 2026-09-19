#!/usr/bin/env node
/* eslint-disable no-console */
// S02（助手写作 Skills 接入计划 docs/plan/assistant-writing-skills-20260919.md）
// 上游规则 fixture 与 Pinax locator fixture 对照：
//   1. 逐字参照的 Oh Story CLI（scripts/writing-skills/upstream/check-degeneration.cjs，
//      固定 0ffe7db4fa02489f5d1989e58a22ce62d040a850）对每个 fixture 跑 --json；
//   2. 适配后的纯模块（src/services/agents/authoring/writingSkillChecks/checkDegeneration.js）
//      对同一输入扫描，行/列/类型/严重度必须与上游逐条一致；
//   3. locator 自检：start/end 为 UTF-16 编辑 offset，exact 与输入切片逐字相等，
//      CRLF 输入同样成立；
//   4. 反例（negative-*.txt）：引用台词、标题行豁免、front-matter/围栏跳过
//      两侧都必须零 finding。
// 本脚本只在 Node 侧运行；前端应用代码不引用 upstream/ 下任何文件。
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanDegenerationFindings } from '../src/services/agents/authoring/writingSkillChecks/checkDegeneration.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const upstreamCli = path.join(here, 'writing-skills', 'upstream', 'check-degeneration.cjs')
const fixturesDir = path.join(here, 'writing-skills', 'fixtures')

let failures = 0
function fail(message) {
  failures += 1
  console.log(`FAIL ${message}`)
}

for (const name of readdirSync(fixturesDir).filter((file) => file.endsWith('.txt')).sort()) {
  const fixturePath = path.join(fixturesDir, name)
  const input = readFileSync(fixturePath, 'utf8')

  const upstream = spawnSync(process.execPath, [upstreamCli, '--json', fixturePath], { encoding: 'utf8' })
  if (upstream.status !== 0 && upstream.status !== 1) {
    fail(`${name}: 上游 CLI 运行失败 status=${upstream.status} ${upstream.stderr?.slice(0, 200)}`)
    continue
  }
  let upstreamFindings = []
  try {
    upstreamFindings = JSON.parse(upstream.stdout).findings || []
  } catch {
    fail(`${name}: 上游 --json 输出不可解析: ${upstream.stdout.slice(0, 120)}`)
    continue
  }
  const expected = upstreamFindings
    .map(({ line, column, type, severity }) => ({ line, column, type, severity }))
    .sort((a, b) => a.line - b.line || a.column - b.column || a.type.localeCompare(b.type))

  const adapted = scanDegenerationFindings(input)
  const actual = adapted
    .map(({ line, column, type, severity }) => ({ line, column, type, severity }))
    .sort((a, b) => a.line - b.line || a.column - b.column || a.type.localeCompare(b.type))

  const same = expected.length === actual.length
    && expected.every((finding, index) => JSON.stringify(finding) === JSON.stringify(actual[index]))
  if (!same) {
    fail(`${name}: 与上游判定不一致\n  upstream=${JSON.stringify(expected)}\n  adapted=${JSON.stringify(actual)}`)
    continue
  }

  let locatorBroken = false
  for (const finding of adapted) {
    const { startOffset, endOffset, exact } = finding.locator
    if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || startOffset >= endOffset) {
      locatorBroken = true
      fail(`${name}: locator offset 非法 ${startOffset}..${endOffset} (${finding.type})`)
      break
    }
    if (input.slice(startOffset, endOffset) !== exact) {
      locatorBroken = true
      fail(`${name}: exact 与输入切片不一致 (${finding.type}@${startOffset})`)
      break
    }
  }
  if (locatorBroken) continue

  if (name.startsWith('negative-') && adapted.length !== 0) {
    fail(`${name}: 反例必须零 finding，实际 ${adapted.length} 条`)
    continue
  }
  if (!name.startsWith('negative-') && adapted.length === 0) {
    fail(`${name}: 正例没有产出 finding`)
    continue
  }
  console.log(`PASS ${name}（${adapted.length} 条 finding，与上游一致，locator 逐字核验通过）`)
}

if (failures) {
  console.log(`writing-skills degeneration eval: ${failures} 个失败`)
  process.exitCode = 1
} else {
  console.log('writing-skills degeneration eval: 全部 fixture 对照通过')
}
