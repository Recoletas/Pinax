// kit 任务面（8451）：Pinax 侧唯一直连的 kit 服务面。默认端点单源在此，env（PINAX_ADAPTER_ENDPOINT /
// VITE_PI_ADAPTER_URL）可覆写。服务端四处引用与本面板、冒烟断言共用，避免端口字面量多处漂移。
export const KIT_TASK_PLANE_PORT = 8451
export const KIT_TASK_PLANE_ENDPOINT = `http://127.0.0.1:${KIT_TASK_PLANE_PORT}`
