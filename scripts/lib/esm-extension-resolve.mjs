// Node ESM 解析钩子：为仓库内 Vite 风格的无扩展名相对导入补 .js / index.js。
// 仅用于 scripts/ 下的显式 eval/matrix 脚本在 plain node 中运行仓库纯模块；
// 不影响构建与测试配置。用法：
//   import { register } from 'node:module'
//   register('./lib/esm-extension-resolve.mjs', import.meta.url)
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context)
  } catch (error) {
    if (specifier.startsWith('.') && error?.code === 'ERR_MODULE_NOT_FOUND' && context.parentURL) {
      const base = new URL(specifier, context.parentURL).href
      for (const suffix of ['.js', '.mjs', '/index.js']) {
        const candidate = `${base}${suffix}`
        if (existsSync(fileURLToPath(candidate))) {
          return { url: candidate, format: 'module', shortCircuit: true }
        }
      }
    }
    throw error
  }
}
