# Window F Integration Result

## 结论

F 已在恢复后的七月产品基线上完成 A-E 整合。旧前端和 1000 多测试不是功能回退，而是并行窗口从过期 `main` 开工造成的基线错位。

## 版本调查

- `main` / `origin/main` 当时停在 `61d4e6d`，日期为 2026-06-29。
- A 启动前把现代前端及 200 测试基线放入 `06085125a718f6f861b8ed8412b0abacee9b9f06`（`wip-k3-legacy-before-a-window`）。
- A/E 有提交，B/C/D 是未提交工作；三者先保存到 `recovery/ae-uncommitted-20260716`，再恢复现代基线并按 A -> B -> C -> D -> E 合并。
- 当前集成分支为 `integration/online-agents-canvas-video-f`；恢复提交为 `63b3e90`。

## F 接线

- 在线体验复用现代 `Experience`，行动先成为房间提案；房主选择后只调用一次既有叙事生成，再广播完整文本和受限运行时 patch。
- WebSocket 路径统一为 `/ws/rooms`，事件同时兼容顶层字段和 `payload`；成员、房主、快照、lastSeq、命令幂等和重连边界已收口。
- 分镜视频面板从当前分镜版本建立任务，支持渠道测试、提交、轮询、取消、失败重试和成功素材归档。
- 视频渠道配置只随请求进入服务端 runner；浏览器不持久化 API Key。通用异步 HTTP adapter 只接受声明字段，不执行任意脚本。
- 修复合并时发现的牌堆拖拽反向移除问题，以及空房房主重连和历史请求重复生成问题。

## 验证

- 定向联机、Agent、画布、视频测试通过。
- Vite production build 通过。
- `npm run verify:full` exit 0：核心 23 files / 188 tests、视觉 1 file / 12 tests，Vite build、VitePress docs build 和 `git diff --check` 全部通过。
- 按用户要求未启动 dev server；真实 provider 和双浏览器联机留给用户现有服务做 smoke。
