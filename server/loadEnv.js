/**
 * 零依赖 .env 读取器 — 把 server/.env 中的变量注入 process.env。
 *
 * 用法: 在 server/index.js 顶部 `import './loadEnv.js'`。
 * ESM import 按源顺序执行, 该模块 body 会先于其他 import 模块执行,
 * 因此 chat.js / textModelAgentProvider.js 等在模块顶层读 process.env 也安全。
 *
 * 规则:
 * - 已存在的环境变量优先, 不覆盖 (方便外部进程注入 MINIMAX_API_KEY)。
 * - 忽略空行与 # 注释; 支持可选引号包裹的值。
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '.env')

if (existsSync(envPath)) {
  const raw = readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }
    if (key && value && !(key in process.env)) {
      process.env[key] = value
    }
  }
}
