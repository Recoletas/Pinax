# C2-3B domain bridge

- 新增纯 `authoringRehearsalBridge`：将冻结的 intervention、direction set、impact group、rehearsal result 映射为严格白名单 `CollaborableArtifact`；canonical JSON roundtrip 与 SHA-256 fingerprint 篡改均 fail-closed。
- selected proposal 只构造 `CollaborationPromotionRequest`；本地 preflight 复核 room/share session/host epoch/proposal revision/artifact/F3 session-result-Ghost/live target，再复用既有 adoption owner 产出 `prepared` 数据，不写正文、Ghost 或 store。
- 敏感配置、room/member 状态、provider trace、未授权 evidence 均不进入 artifact。
- 验证：bridge 9/9、foundation 28/28、transport 43/43；scoped ESLint exit 0（仅 smoke 的 console warnings）；两文件 `node --check` 与 `git diff --check` exit 0。
- 风险：尚未接 Vue/relay 实流；真实 room、加密 codec 与 F3 UI 由 integration owner 下一切片接线。
