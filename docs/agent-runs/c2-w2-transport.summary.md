# C2-W2 transport handoff

Branch: `feature/collaboration-v2-transport`

Frozen base: `5f97714`

Commits: `5bb94b1`, `0c781e8`, `c48699b`, `f401ee1`, `a535f32`，以及本轮最终 scoped corrective commit。

C2-2 transport、Web/Electron endpoint、WebCrypto codec、REST/WS relay 已完成。最终入口可靠性纠偏确保真实邀请路由 scrub 后的昵称提交会显式执行 join；创建响应中的 reviewer invite 只在房主内存生成 fragment-only 分享 URL，复制不再使用 scrub 后当前地址，并暴露 active/expired/rotate 状态而不持久化 secret/content key。鉴权后同步 send throw 会进入重连且不会越过握手 flush；v2 client 以 pong 约束的 heartbeat 续租并在断线/销毁/旧 epoch 清理 timer。`expired`、`resume-invalid`、`invite-revoked` 等不可恢复房间/鉴权错误会关闭 socket、清除旧 identity、拒绝待确认命令并向 UI 暴露明确终态。maintenance 会把 connected lease expiry 与 invite expiry 物化为 left 并释放 quota。REST 房间 TTL 与 quota 均由服务端拥有；64KB JSON parser/error boundary 只挂载在 `/api/collaboration`，不截断其他 `/api/*` 的原 16MB body。REST creation limiter 与 WS relay limiter 都有 TTL GC 和容量上限，WS 容量耗尽时 fail closed。

验证（Node 20.20.2）：foundation 28/28、transport 43/43（含 100KB unrelated API 跨层透传、collaboration 413、真实 hello→resume→expired、10k unique limiter GC/capacity）、focused UI/style source contract、scoped ESLint/syntax、`verify:post` 均 exit 0。`verify:full` 第 1–5 次均为 20/20 files、200/200 tests 通过后触发已知 ProseMirror/jsdom `target.getClientRects` race，exit 1；未修改 Authoring。第 6 次按原命令完整 exit 0：20/20 files、200/200 tests、Vite build、diff check、VitePress build 全绿。OnlineExperience 仅机械调整 Vue block order，不改变已验证模板、样式或交互。

外部门禁：公共 TLS/WSS、packaged Electron 与真实双浏览器尚需部署环境 smoke；C2-3 等待 F3-2 `toCollaborableArtifact()` / 本地 promotion boundary 稳定与单一 integration window。
