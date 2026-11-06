/* eslint-disable no-console -- 开发工具输出当前 Core 来源 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const installed = join(root, 'node_modules/@pinax/core')
const backup = join(root, 'node_modules/@pinax/.core-installed')
const marker = join(root, 'node_modules/.pinax-core-dev.json')
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const present = path => { try { lstatSync(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }
const git = (source, ...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim()
const npm = args => execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: root, stdio: 'inherit' })
const command = process.argv[2]
const input = process.argv[3] || process.env.PINAX_CORE_SOURCE

function sourceDirectory() {
  if (!input) throw new Error('请传入独立 pinax-core 仓库路径，或设置 PINAX_CORE_SOURCE')
  const source = realpathSync(resolve(input))
  if (realpathSync(git(source, 'rev-parse', '--show-toplevel')) !== source || source === root || source === join(root, 'packages/core')) {
    throw new Error('来源必须是独立 pinax-core git 仓库根目录')
  }
  if (json(join(source, 'package.json')).name !== '@pinax/core') throw new Error('来源不是 @pinax/core')
  return source
}

function restore() {
  if (!existsSync(marker)) {
    if (present(backup)) throw new Error('存在未登记的安装备份，请检查后处理；未改动任何文件')
    console.log('当前没有开发连接')
    return
  }
  const { source } = json(marker)
  if (!present(backup)) throw new Error('原安装备份不存在；请运行 npm ci 恢复固定依赖后删除开发标记')
  if (present(installed)) {
    if (!lstatSync(installed).isSymbolicLink() || resolve(readlinkSync(installed)) !== source) {
      throw new Error('安装目录已被其他命令更改，请检查开发标记及备份；未覆盖当前安装')
    }
    unlinkSync(installed)
  }
  renameSync(backup, installed)
  unlinkSync(marker)
  console.log('已恢复固定 Core 包；请重启使用 Core 的开发服务')
}

function develop() {
  const source = sourceDirectory()
  if (existsSync(marker) || present(backup)) throw new Error('已有开发连接或备份；先运行 npm run core:restore')
  if (!present(installed) || lstatSync(installed).isSymbolicLink()) throw new Error('先运行 npm ci 安装固定 Core 包')
  const dependencies = json(join(source, 'package.json')).dependencies || {}
  for (const dependency of Object.keys(dependencies)) {
    if (!existsSync(join(source, 'node_modules', dependency))) throw new Error('请先在独立 Core 仓库运行 npm ci')
  }
  renameSync(installed, backup)
  try {
    writeFileSync(marker, `${JSON.stringify({ source }, null, 2)}\n`, { flag: 'wx' })
    symlinkSync(source, installed, process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    if (existsSync(marker)) unlinkSync(marker)
    renameSync(backup, installed)
    throw error
  }
  console.log(`开发 Core: ${source}\n修改此独立仓库的 src；package.json 和 lockfile 未改动。请重启相关开发服务。`)
}

function update() {
  if (existsSync(marker) || present(backup)) throw new Error('先运行 npm run core:restore，再更新固定版本')
  const source = sourceDirectory()
  if (git(source, 'status', '--porcelain')) throw new Error('请先提交独立 Core 的版本和改动')
  const { version } = json(join(source, 'package.json'))
  // npm pack 的文件名由包版本决定；拒绝将路径作为版本使用。
  if (!/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(version)) throw new Error('Core 版本不是有效的 semver')
  const relative = `vendor/core/pinax-core-${version}.tgz`
  const artifact = join(root, relative)
  const proofPath = artifact.replace(/\.tgz$/, '.provenance.json')
  if (!existsSync(artifact)) {
    if (existsSync(proofPath)) throw new Error('产物缺失但来源记录存在，请检查版本；不会覆盖记录')
    execFileSync(process.execPath, [join(root, 'scripts/pack-core.mjs'), source], { cwd: root, stdio: 'inherit' })
  }
  const proof = json(proofPath)
  const bytes = readFileSync(artifact)
  if (proof.package !== '@pinax/core' || proof.version !== version || proof.filename !== `pinax-core-${version}.tgz`
    || proof.commit !== git(source, 'rev-parse', 'HEAD')
    || proof.sha256 !== createHash('sha256').update(bytes).digest('hex')
    || proof.integrity !== `sha512-${createHash('sha512').update(bytes).digest('base64')}`) {
    throw new Error('该版本产物与独立 Core 提交不一致；请升级 Core 版本，不能覆盖同版本包')
  }
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', `./${relative}`])
  console.log(`已固定 Core ${version} (${proof.commit})；提交 package.json、package-lock.json 和新产物/来源记录。`)
}

try {
  if (command === 'dev') develop()
  else if (command === 'restore') restore()
  else if (command === 'update') update()
  else if (command === 'status') {
    console.log(JSON.stringify({ pinned: json(join(root, 'package.json')).dependencies['@pinax/core'], installed: existsSync(installed) ? json(join(installed, 'package.json')).version : null, development: existsSync(marker) ? json(marker).source : null }, null, 2))
  } else throw new Error('用法：core-workflow.mjs dev|restore|update|status [独立 Core 路径]')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
