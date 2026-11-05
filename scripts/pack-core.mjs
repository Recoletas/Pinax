/* eslint-disable no-console -- 打包脚本把产物路径写到 stdout */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = process.argv[2] || process.env.PINAX_CORE_SOURCE
if (!source) throw new Error('指定独立仓库：npm run core:pack -- /path/to/pinax-core')
const coreDir = resolve(source)
if (coreDir === join(root, 'packages/core')) throw new Error('不再从宿主内旧 Core 副本生成依赖')
const git = args => execFileSync('git', ['-C', coreDir, ...args], { encoding: 'utf8' }).trim()
if (resolve(git(['rev-parse', '--show-toplevel'])) !== coreDir) throw new Error('Core 来源必须是独立 git 仓库根目录')
if (git(['status', '--porcelain'])) throw new Error('Core 来源有未提交改动，请先在独立仓库完成版本管理')
const manifest = JSON.parse(readFileSync(join(coreDir, 'package.json'), 'utf8'))
if (manifest.name !== '@pinax/core') throw new Error('来源不是 @pinax/core')
const distDir = join(root, 'vendor/core')
mkdirSync(distDir, { recursive: true })
if (existsSync(join(distDir, `pinax-core-${manifest.version}.tgz`))) throw new Error('该版本产物已存在；不要覆盖同版本，请在独立 Core 仓库升级版本')
const packed = JSON.parse(execFileSync('npm', ['pack', coreDir, '--ignore-scripts', '--pack-destination', distDir, '--json'], { cwd: root, encoding: 'utf8' }))[0]
const provenance = {
  package: manifest.name, version: manifest.version,
  repository: git(['config', '--get', 'remote.origin.url']),
  commit: git(['rev-parse', 'HEAD']), filename: packed.filename,
  sha256: createHash('sha256').update(readFileSync(join(distDir, packed.filename))).digest('hex'),
  integrity: packed.integrity
}
writeFileSync(join(distDir, packed.filename.replace(/\.tgz$/, '.provenance.json')), `${JSON.stringify(provenance, null, 2)}\n`)
console.log(`Core artifact: vendor/core/${packed.filename}; install explicitly to update package.json and lockfile`)
