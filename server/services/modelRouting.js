// 统一模型路由：所有内容生成路径（chat / 非流式与流式、agent-step、结构化设定、advisor text-model）
// 共用这一处判定。
//
// 2026-10-08 起直连通路退役：pi-agent 任务面（内核）是文本模型的唯一出口。浏览器配置的模型
// 由设置面板热切进内核（POST /api/storyagent/model），请求携带的 key 只在 /models、/test 两个
// 设置面探测端点使用，内容生成一律转发内核，key 永不出内环。
//   1. kernel —— 任务面就绪：forwardComplete 只连回环端口。
//   2. none   —— 任务面不可达：调用方给出统一的"未检测到可用模型"错误。
import { kitFunnelAvailable } from './kitModelGateway.js'

/** 公网部署（PINAX_PUBLIC_ORIGINS 配置时）：终端用户不运行任务面，'none' 态文案
 *  不能指引自托管操作；自托管部署维持 serve:pinax 指引。 */
const publicDeployment = Boolean(String(process.env.PINAX_PUBLIC_ORIGINS || '').trim())

export const MODEL_ROUTING_ERROR_MESSAGE = publicDeployment
  ? '模型服务暂时不可用，请稍后重试。'
  : '未检测到可用模型。请先启动 pi-agent 任务面（serve:pinax），并在设置中选择模型。'

export const MODEL_ROUTING_OPS_HINT = publicDeployment
  ? '公网部署：内核模型通路不可达，请检查任务面进程与服务端模型配置。'
  : '自托管：pi-agent 任务面（serve:pinax）未运行。'

/** 解析一次请求应走哪条模型通路。返回 { mode: 'kernel' } 或 { mode: 'none', message }。 */
export async function resolveModelRouting() {
  if (await kitFunnelAvailable()) return { mode: 'kernel' }
  console.warn(`[ModelRouting] none（${MODEL_ROUTING_OPS_HINT}）`)
  return { mode: 'none', message: MODEL_ROUTING_ERROR_MESSAGE }
}
