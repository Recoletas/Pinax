/**
 * 前端读取构建身份。真实值由 vite.config.js 在构建/ dev 期通过 __BUILD_INFO__ 注入；
 * 无注入环境（Vitest 直接渲染组件等）回落到 package 版本 + unknown。
 * 只含白名单字段：版本、短 commit、channel、dirty 布尔；无本机路径、分支名、环境变量。
 */
import packageInfo from '../../package.json'

function readInjected() {
  try {
    if (typeof __BUILD_INFO__ !== 'undefined' && __BUILD_INFO__ && typeof __BUILD_INFO__ === 'object') {
      return __BUILD_INFO__
    }
  } catch {
    /* ReferenceError → 走回落 */
  }
  return null
}

const injected = readInjected()

export const buildInfo = {
  version: String(injected?.version || packageInfo.version),
  commit: String(injected?.commit || 'unknown'),
  channel: String(injected?.channel || 'dev'),
  dirty: Boolean(injected?.dirty)
}

export function describeBuildIdentity() {
  const suffix = buildInfo.dirty ? '+dirty' : ''
  return `v${buildInfo.version} (${buildInfo.commit}${suffix}, ${buildInfo.channel})`
}
