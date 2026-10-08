// 统一模型路由：所有内容生成路径（chat / 非流式与流式、agent-step、结构化设定、advisor text-model）
// 共用这一处判定，不再各自按 MiniMax 官方域名硬编码分叉。
//
// 三段式，与 provider 无关——"不一定是 MiniMax，只要有模型，所有内容都搞定"：
//   1. kernel  —— 浏览器没有真正持有 key（空或哨兵）时，交给 pi-agent 任务面这一个内核模型、
//                  这一套 agent 工具流；forwardComplete 只连回环端口，浏览器 key 永不外发。
//   2. direct  —— 浏览器自带真实 key，或服务器 env 注入的内置 key，按原 provider 直连。
//   3. none    —— 既无自带 key，内核也未就绪：调用方给出统一的"未检测到可用模型"错误。
import { MINIMAX_SERVER_KEY_SENTINEL, resolveTextApiKey } from '../../shared/textModelKeys.js'
import { kitFunnelAvailable } from './kitModelGateway.js'

export function isServerOwnedModelConfig(config = {}) {
  const key = String(config.apiKey || '').trim()
  return !key || key === MINIMAX_SERVER_KEY_SENTINEL
}

/**
 * 解析一次请求应走哪条模型通路。
 * @param {{ id?: string, provider?: string, baseUrl?: string, apiKey?: string }} config
 * @param {{ probeKernel?: boolean, kernelAvailable?: boolean }} [options]
 *   probeKernel=false 时不探测任务面（用于纯同步判定场景）。
 */
export async function resolveModelRouting(config = {}, options = {}) {
  const provider = String(config.id || config.provider || '').trim()
  const baseUrl = String(config.baseUrl || '').trim()
  const apiKey = config.apiKey
  const owned = isServerOwnedModelConfig({ apiKey })

  if (owned) {
    const kernelReady = options.probeKernel === false
      ? Boolean(options.kernelAvailable)
      : await kitFunnelAvailable()
    if (kernelReady) return { mode: 'kernel', provider, baseUrl }
  }

  // 直连：内置（哨兵/空 key + 官方域）由 resolveTextApiKey 注入服务器 env key；自带 key 原样透传。
  const effectiveApiKey = resolveTextApiKey({ provider, baseUrl, apiKey })
  if (!effectiveApiKey) return { mode: 'none', provider, baseUrl }
  return { mode: 'direct', provider, baseUrl, apiKey: effectiveApiKey }
}

export const MODEL_ROUTING_ERROR_MESSAGE =
  '未检测到可用模型。请在 pi-agent 任务面配置服务器模型，或在设置里添加自带 API Key 的文本模型配置。'
