/* eslint-disable no-console -- 显式隔离开发工具验收 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const temporary = mkdtempSync(join(tmpdir(), 'pinax-core-workflow-'))
const source = join(temporary, 'independent core')
const hosts = ['web', 'pinix'].map(name => join(temporary, name))
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' })
const npm = args => run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, hosts[0])
const git = args => run('git', ['-C', source, ...args], temporary)
const writeJSON = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
const workflow = (host, command, ...args) => run(process.execPath, ['scripts/core-workflow.mjs', command, ...args], host)
const rejected = (host, command, ...args) => assert.notEqual(spawnSync(process.execPath, ['scripts/core-workflow.mjs', command, ...args], { cwd: host, encoding: 'utf8' }).status, 0)
const imported = host => run(process.execPath, ['--input-type=module', '-e', 'import { value } from "@pinax/core"; console.log(value)'], host).trim()
let server
try {
  mkdirSync(source)
  const manifest = { name: '@pinax/core', version: '1.0.0', type: 'module', exports: './index.js', files: ['index.js'] }
  writeJSON(join(source, 'package.json'), manifest)
  writeFileSync(join(source, 'index.js'), 'export const value = "original"\n')
  git(['init', '-q'])
  git(['config', 'user.name', 'Core workflow fixture'])
  git(['config', 'user.email', 'fixture@example.invalid'])
  git(['remote', 'add', 'origin', 'https://example.invalid/core.git'])
  git(['add', '.'])
  git(['commit', '-qm', 'fixture'])
  for (const host of hosts) {
    mkdirSync(join(host, 'scripts'), { recursive: true })
    for (const file of ['core-workflow.mjs', 'pack-core.mjs']) cpSync(join(root, 'scripts', file), join(host, 'scripts', file))
    writeJSON(join(host, 'package.json'), { name: 'host-fixture', private: true, type: 'module', dependencies: {} })
    workflow(host, 'update', source)
    assert.equal(imported(host), 'original')
  }
  const before = ['package.json', 'package-lock.json'].map(file => readFileSync(join(hosts[0], file), 'utf8'))
  workflow(hosts[0], 'dev', source)
  writeFileSync(join(source, 'index.js'), 'export const value = "live edit"\n')
  assert.equal(imported(hosts[0]), 'live edit')
  assert.equal(imported(hosts[1]), 'original', '其他端保持固定包，不被本地调试污染')
  rejected(hosts[0], 'dev', source)
  rejected(hosts[0], 'update', source)
  // 用实际 Vite 解析链接包，验证源码不被当成另一个内联 Core 副本。
  writeFileSync(join(hosts[0], 'main.js'), 'import { value } from "@pinax/core"; console.log(value)\n')
  server = await createServer({ root: hosts[0], configFile: false, server: { port: 0 }, optimizeDeps: { noDiscovery: true } })
  await server.listen()
  const transformed = await server.transformRequest('/main.js')
  assert.ok(transformed.code.includes('/@fs/'), 'Vite 应解析真实独立源码路径')
  const dependencyURL = transformed.code.match(/from\s*"([^"]+)"/)[1]
  const response = await fetch(`${server.resolvedUrls.local[0].replace(/\/$/, '')}${dependencyURL}`)
  assert.equal(response.status, 200, '外部源码必须可被开发服务器读取')
  assert.match(await response.text(), /live edit/)
  await server.close()
  server = null
  workflow(hosts[0], 'restore')
  assert.equal(imported(hosts[0]), 'original')
  for (let i = 0; i < before.length; i++) assert.equal(readFileSync(join(hosts[0], ['package.json', 'package-lock.json'][i]), 'utf8'), before[i])
  rejected(hosts[1], 'update', source) // dirty Core 不能打包
  git(['add', '.'])
  git(['commit', '-qm', 'change without version bump'])
  rejected(hosts[1], 'update', source) // 不覆盖已发行版本
  manifest.version = '1.1.0'
  writeJSON(join(source, 'package.json'), manifest)
  git(['add', '.'])
  git(['commit', '-qm', 'release 1.1.0'])
  for (const host of hosts) {
    workflow(host, 'update', source)
    workflow(host, 'update', source) // 同一产物可以重复安装
    assert.equal(imported(host), 'live edit')
  }
  workflow(hosts[0], 'dev', source)
  rmSync(source, { recursive: true, force: true })
  workflow(hosts[0], 'restore') // 工作目录移走后也能恢复固定包
  assert.equal(imported(hosts[0]), 'live edit')
  npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'])
  assert.equal(imported(hosts[0]), 'live edit')
  console.log('PASS: 两端固定包更新、开发源码实时复用、Vite外部源码访问、固定版本隔离、恢复不改lock、脏源/同版本拒绝、断链恢复与npm ci复现')
} finally {
  await server?.close()
  rmSync(temporary, { recursive: true, force: true })
}
