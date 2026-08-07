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

export function resolveTextApiKey({ provider = '', baseUrl = '', apiKey = '' } = {}) {
  const isMiniMax =
    /minimax/i.test(String(provider)) || /minimaxi?\.com/i.test(String(baseUrl))
  const serverKey =
    (typeof process !== 'undefined' && process.env && process.env.MINIMAX_API_KEY) || ''
  const key = String(apiKey || '')
  // 命中 MiniMax 且 key 为空 / 哨兵 → 换服务器 key; env 未配时返回 '' (让上层给出明确报错)
  if ((!key || key === MINIMAX_SERVER_KEY_SENTINEL) && isMiniMax) {
    return serverKey || ''
  }
  return key
}
