// B 线矩阵专用 Node ESM 解析钩子：无扩展名补 .js + 把 'vue' 别名到
// @vue/runtime-core（plain node 无 DOM，runtime-dom 在加载期需要浏览器全局；
// Pinia/组合式 API 只依赖 runtime-core 的导出）。仅用于 scripts/ 显式 eval，
// 不影响构建与测试配置。
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function resolve(specifier, context, next) {
  if (specifier === 'vue') {
    return next('@vue/runtime-core', context)
  }
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
