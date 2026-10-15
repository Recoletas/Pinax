// Optional external kit protocol transport; local deployments default to the pinned in-process read-only runtime.
export const KIT_PROTOCOL_PLANE_PORT = 8431
export const KIT_PROTOCOL_PLANE_PORT_ENV = 'PINAX_KIT_PROTOCOL_PORT'
export const KIT_PROTOCOL_PLANE_ENDPOINT = `http://127.0.0.1:${KIT_PROTOCOL_PLANE_PORT}`

/** 8431 POST /api/kernel-verb 的完整动词白名单（kit/storyharness/src/serve.ts 内 allow 集合同源）。 */
export const KIT_PROTOCOL_VERB_WHITELIST = Object.freeze([
  'flow_init',
  'flow_run',
  'flow_next',
  'flow_effect',
  'kb_search',
  'kb_read',
  'worldbook_search'
])

/** Pinax 知识代理只转发这一组只读检索动词；永不发 flow_* 写动词（显式失败纪律的单源依据）。 */
export const KNOWLEDGE_READ_VERBS = Object.freeze(['worldbook_search', 'kb_search', 'kb_read'])

/** 内核面（8421）缺省端口：协议面的陪跑依赖，kit 占用自动顺延，探针用 env 兜底可覆写。 */
export const KIT_KERNEL_PLANE_PORT = 8421
export const KIT_KERNEL_PLANE_PORT_ENV = 'PINAX_KIT_KERNEL_PORT'

/** 解析协议面端点：PINAX_KIT_PROTOCOL_PORT 覆盖端口（冒烟打桩），host 恒 loopback（守卫同款白名单）。
 *  env 由调用方显式传入（server/scripts 传 process.env；shared/ 保持浏览器可载，不裸引 process）。 */
export function resolveKitProtocolPlaneEndpoint(env) {
  const port = Number(env?.[KIT_PROTOCOL_PLANE_PORT_ENV])
  const resolved = Number.isInteger(port) && port > 0 && port <= 65535 ? port : KIT_PROTOCOL_PLANE_PORT
  return `http://127.0.0.1:${resolved}`
}
