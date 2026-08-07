/**
 * 内置 MiniMax 文本模型的服务器密钥约定 (客户端与服务器共用)。
 *
 * - MINIMAX_SERVER_KEY_SENTINEL: 客户端在「已由服务器配置密钥」时使用的占位 key。
 *   它让所有现存 `Boolean(apiKey)` 守卫通过; 请求到达服务器后由 resolveTextApiKey
 *   替换为真实 env key。真实 key 永不进入浏览器 localStorage / 请求日志。
 * - resolveTextApiKey: 服务器在转发上游前调用。命中 MiniMax (provider 或 baseUrl)
 *   且 key 为空或为哨兵时, 注入 process.env.MINIMAX_API_KEY。
 */

export const MINIMAX_SERVER_KEY_SENTINEL = 'minimax-server-key'

/**
 * 服务器 key 解析的通用实现 (按 baseUrl 判定 MiniMax)。
 * - 命中 MiniMax 且 key 为空 / 哨兵 → 返回 process.env.MINIMAX_API_KEY; env 未配时返回 ''。
 * - 其余情况原样返回传入 key。
 * 图片/视频适配器 (server/media、server/routes/image.js) 与文本共用这一处解析。
 */
export function resolveMiniMaxApiKey({ baseUrl = '', apiKey = '' } = {}) {
  const isMiniMax = /minimaxi?\.com/i.test(String(baseUrl))
  const serverKey =
    (typeof process !== 'undefined' && process.env && process.env.MINIMAX_API_KEY) || ''
  const key = String(apiKey || '')
  if ((!key || key === MINIMAX_SERVER_KEY_SENTINEL) && isMiniMax) {
    return serverKey || ''
  }
  return key
}

export function resolveTextApiKey({ provider = '', baseUrl = '', apiKey = '' } = {}) {
  const isMiniMax =
    /minimax/i.test(String(provider)) || /minimaxi?\.com/i.test(String(baseUrl))
  if (!isMiniMax) return String(apiKey || '')
  return resolveMiniMaxApiKey({ baseUrl, apiKey })
}
