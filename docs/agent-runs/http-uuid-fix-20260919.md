# HTTP UUID 兼容修复（2026-09-19）

普通 HTTP 域名/IP 不属于安全上下文，直接调用 `crypto.randomUUID()` 会在请求创建、历史归档与协作编号阶段抛错。服务器 Node crypto 不受浏览器上下文限制，未改服务器代码。

## 实施

- `shared/randomId.js` 统一入口：可调用的原生 randomUUID 优先；否则以 `getRandomValues` 产生随机字节，交给成熟 `uuid` 库生成 UUID v4。uuid 11.1.1 已在项目依赖树，现声明为直接依赖；不另写 UUID 格式算法、不修改全局 crypto、不使用 Math.random 降级。
- 替换 task request、agent trace、memory history、ledgerContract 和三个协作模块里的调用；保留协作 cryptoImpl 注入与既有 ID 前缀。
- 资料归档已有 typeof 检测和降级，本轮不改其存储合同。服务端 randomUUID 保持原样。
- 完全缺乏安全随机源时明确报错，不伪造低质量编号。协作加密依赖 crypto.subtle，HTTP 下仍有独立限制；本修复不声称所有协作功能无需 HTTPS。

## 验证

`node scripts/http-uuid-smoke.mjs` exit 0。自起独立 Vite，真实 Chromium 分别访问非 loopback IPv4 HTTP 与 localhost，明确断言前者 `isSecureContext=false`、原生 randomUUID 为 undefined，后者原生 API 存在。验证生产请求合同、账本/轨迹/协作命令 ID 格式、每环境 1000 个随机编号无重复、真实 IndexedDB 记忆创建/修订与刷新后两版本持久化。测试使用隔离上下文，不操作用户数据、不外发模型请求。另验证注入原生方法的 this、固定随机字节下版本/variant 位以及缺少安全随机源时拒绝。

`npm run verify:full` exit 0：20/20 files / 200/200 tests / build OK / diff clean / docs OK；lint 与架构通过。专项脚本独立执行，不增加核心测试文件/用例数。

边界：测试证明编号及关联持久化修复，没有调用真实模型、没有部署到 pinax.cc、没有配置 nginx/TLS。线上需要发布本补丁后才生效。
