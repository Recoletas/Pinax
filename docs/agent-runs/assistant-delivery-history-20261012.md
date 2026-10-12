# 助手交付、默认上下文与消息操作 · 2026-10-12

## 已实施（本地 main）

- 修复回答结束时两处摘要覆盖：前端保留本轮流式全文，运行器将完整回答与完成工具说明分开。
- 默认给出作品／章节目录、当前正文和涉及的设定；移除任意第一条设定注入。长章明确显示节选范围。
- 新运行包提供浏览器作品快照目录工具：列作品、进入目录、列出／读取／检索文件。跨书只读，不切换实际改稿目标或授权；没有磁盘访问，也不宣称所有书稿均已载入。
- 编辑旧问题、重新生成回答和从某条回答继续创建独立分支；原会话保留，后续消息不带入，旧任务、提议与自动授权不继承。复制回答，失败原因留在消息中。
- 助手输出预算从默认1600改为6000 token，补齐续聊预算参数；交付检查不再先截掉第12条后的工具结果。
- 真实渠道复现 MiniMax 529 overloaded_error：旧运行器误当成未形成有效交付并继续补交。现在在补交前识别模型失败，不暴露供应商原始认证信息。

## 验证

- `node scripts/pr6-assistant-ui-smoke.mjs`：163项，exit 0。桌面亮暗／390手机，原位采用／撤销、权限、滚轮／触控、回答保留、旧提问编辑、回答分支、刷新恢复；接口模拟。截图已实际查看，临时截图清理。
- `PINAX_RUNTIME_OUTPUT=.runtime/storyagent-assistant-fixed-20261012 node scripts/assistant-runtime-delivery-smoke.mjs`：25项，exit 0。完整回答、模型错误、目录读取、任意路径拒绝及上下文方向。
- `PINAX_SMOKE_RUNTIME=.runtime/storyagent-assistant-fixed-20261012 PINAX_SMOKE_RUNTIME_PID=<作者运行器PID> node scripts/assistant-real-edit-smoke.mjs`：真实 MiniMax 13项，exit 0。独立临时端口、合成作品和独立任务日志；完整讨论、按讨论方向续写三段、确认采用、撤销均走通。前轮遇到529，不以成功轮证明供应商永不失败。
- 最终 `npm run verify:full`：exit 0，20文件／200用例，双构建、lint、结构／体积和diff通过；5条warning，kit bridge两项环境跳过。Authoring包1,367,591 bytes／1,450,000上限。

## 生效范围

前端在作者5173预览热更新。初轮候选另存未启动，返修后作者授权仅更新8451，最新包已切为 `.runtime/storyagent-next` 并加载；Express与前端未重启。没有提交、生产部署或修改用户作品。kit bridge 对侧仓库缺席，同步检查环境跳过；本轮 bridge 变化尚未同步到对侧。

分支不回滚已经采用的正文修改。保存上限仍为20会话／每会话60消息，模型新任务历史为有界摘要；不提供任意深度分支树或完整无限历史。其他作品读取为有界快照，资料更新后重新发送取得新快照。

## 返修：悬停操作、提议收尾与正文定位

作者报告写作结果仍留聊天，本轮对应其实际任务日志：3次 world_lookup 后，首个 submit_edit_proposals 工具层isError为false，但业务内容ok为false；前轮误读为校验成功，本轮已纠正。后续读取／重提交被预算拒绝，连 complete_assistant_task 也被拒绝，终态failed，前端撤去提议。该轮调用过编辑工具，但当时没有通过参数校验。

修复：预算改为在工具执行前按获准操作计数，拒绝的尝试不扣资源额度；本地 complete_assistant_task 是交付确认，不再被资源预算拦截，仍必须通过既有 intent/outcome/已提交提议检查。资源操作保留6次上限，模型步骤／超时继续有界。第一次有效提议提交后只留下完成工具，不再读取或重提交。前端成功后在编辑绑定、作品和权限仍匹配时自动定位正文／设定审阅；后台任务保持原归属，不擅自改变作者当前页面。工具记录区分提交成功和失败。

铅笔独立在消息框外侧，桌面平时隐藏，悬停消息或键盘焦点进入时显示；显示不改变消息尺寸／位置。触屏保留44px入口，编辑保留原位置与取消动作。侧栏右边界不放溢出按钮，使用气泡左侧空白。参考：[Gemini官方编辑提示](https://support.google.com/gemini/answer/13275745?hl=en)确认编辑位于提示旁；[Atlas自身操作文档](https://github.com/sandialabs/atlas-ui-3/blob/main/docs/user-guide/rewind-edit/README.md)明确悬停显示和原位编辑。未把社区评论当成GPT最新桌面实测证据。本轮无需新增skill规则，原有局部样式／交互核对约束应当落实。

返修验证：目录与交付smoke 51项exit 0，包含作者3次读取→有效提议→拒绝后续读取／重复提议→成功完成的序列；最新运行包真实MiniMax 14项exit 0，自动显示正文差异、确认采用和撤销通过。亮暗／手机页面187项exit 0，悬停前后几何不变、图标在框外且中心对齐，键盘与触屏入口可用；自动正文定位、分域保存失败回滚、采用及撤销通过。返修最终 `npm run verify:full` exit 0（20文件／200用例、双构建、lint、结构体积与diff通过；5条warning，bridge两项环境跳过）。前轮退出143，重跑明确打印VERIFY_EXIT=0；不沿用被终止那轮作成功证据。

作者随后明确授权只更新并重启8451。构建 `.runtime/storyagent-delivery-final-20261012` 经验证后原子切为 `.runtime/storyagent-next`，旧包保存在 `.runtime/storyagent-next-backup-20261012-1791780256`；首轮运行进程2224021使用Node22，原模型环境和配置路径继承，4份JSONL哈希保持一致。Express3001及前端5173未重启。3001代理健康响应ok/protocol2/workspace=true/MiniMax-M2.7，运行包已生效。当前运行器由独立后台进程持有，PID记在 `.runtime/storyagent-current.pid`；后续需要关闭8451时按此PID处理。Express再次启动会探测并复用已健康运行器。

## 续查：append末尾锚点与交付意图降级

作者再次报告整理修改建议反复失败。最新任务的4次append都填写了before（原文末尾124／124／20／13字），共享接口只接受空before。每次错误均为“修改建议的目标或原文无效”；workspace.list随后被预算拦截。模型先以mixed/answer失败，再改为answer/answer交付，造成编辑任务被当成聊天回答。这与前轮预算问题分别处理。

修复：工具与schema明确append的空before要求；运行器只在before精确匹配完整、未截断目标末尾时转换为空before，保持append／after／目标及权限不变，回执记录转换。中段锚点、未读全文、无效目标和越权仍拒绝，标准共享validator不放宽。曾尝试修改后，完成工具不能改为普通answer；前端也按实际submit工具记录检查，防止旧／错误运行包回执绕过。失败工具提供具体原因的悬停提示，并保留原回执。

验证：工具／交付62项exit 0；只读回放作者本次4份原始提交均通过新校验，没有模型调用或写入。verify:full20/200 exit 0（bridge两项环境跳过）。本轮页面187项、真实MiniMax14项均exit 0，正文差异自动显示、采用／撤销通过。沿用作者对8451的更新授权，新包验证后切至storyagent-next并重启（PID2235413），5份任务日志哈希一致；旧包备份`.runtime/storyagent-next-backup-append-1791781497`，Express／前端未重启。
