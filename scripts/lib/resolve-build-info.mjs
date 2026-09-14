/**
 * 构建期身份解析（仅 Node 侧：vite.config.js / 测试引用）。
 *
 * 白名单原则：只输出 package 版本、短 commit、channel、dirty 布尔。
 * 不注入本机路径、分支名、环境变量整体或工作树修改内容。
 * 无 .git（源码 zip）时 commit 为 'unknown'，不抛错。
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

function tryGit(root, args, runner) {
  try {
    return runner(['-C', root, ...args])
  } catch {
    return null
  }
}

export function resolveBuildInfo({
  version,
  channel = process.env.PINAX_BUILD_CHANNEL || 'dev',
  root = process.cwd(),
  gitExists = (dir) => existsSync(join(dir, '.git')),
  runGit = (args) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
} = {}) {
  if (!gitExists(root)) {
    return { version, commit: 'unknown', channel, dirty: false }
  }
  const commit = tryGit(root, ['rev-parse', '--short=9', 'HEAD'], runGit) || 'unknown'
  const status = tryGit(root, ['status', '--porcelain'], runGit)
  return { version, commit, channel, dirty: Boolean(status && status.length > 0) }
}
