# C00 基线记录(c-ux-20260914)

基线树:`main@5152aad` + C线工作区(前端 5213,后端未启动,`/api` 走 3001 死代理=天然失败态)。
截图:`screenshots/c00-*.png`,拍摄脚本 `scripts/authoring-ui/ux-state-capture.mjs`(合成 fixture `tmp/authoring-context-closure`,13/13 gate 通过)。

## 已合格(verified-existing,不重做)

- Welcome 空库桌面:主信息清晰、两条主路径、三步回路安静无教程无遮罩。
- 导入预览 1440:书名自动聚焦全选、拆章模式卡、可编辑章名列表、确认区动作明确。
- 稿面正常态:保存成功安静(`wall__save-chip` 仅反馈时出现),正文/章名主视觉成立。
- 推演失败时行动草稿保留(输入不被清空)。

## 缺口清单(按包归属)

| 缺口 | 证据 | 归属 |
|---|---|---|
| 390 回访:最近作品沉在欢迎语/主按钮之后(首屏下方),浮动"记忆·2条"胶囊遮挡引导文字 | `c00-welcome-books-mobile.png` | C02 |
| 备份面打开即原始 localStorage 键表(writing_books/worldbook_wb_…),导出/恢复按钮沉底 | `c00-settings-backup.png` | C04 |
| 推演失败呈现原始英文 "Request failed with status code 500",无中文解释/重试/检查连接入口 | `c00-rehearsal-failure.png` | C06 |
| 长章名在稿面单行截断(不换行),约束1要求允许合理换行 | `c00-manuscript-long-title.png` | C08 |
| 代码复核:指引 `rehearsal.run` 出现即 dismiss(未见回应/试稿);不按书归属;无重开入口(`Authoring.vue:6564-6616`) | 代码 | C01 |
| 代码复核:`reparseEncoding`/`watch(mode)` 直接覆盖作者改过的书名与章名;手动编码仅在 warning 态可达;读取无可视状态/无一次性身份(`AuthoringManuscriptImport.vue:136-192`) | 代码 | C03 |
| 浮动"记忆·2条"胶囊为全局组件,移动端遮挡正文(桌面左下角常驻) | `c00-welcome-books-mobile.png` | C13 候选,先记录 |

## C00 结论

基线 12 张覆盖 空库/有书/稿面长名/备份/导入(2)/推演起点/推演失败 × 1440/390/720×450。最值得优先修:导入手改保护(C03)与推演失败自救呈现(C06),其次指引按书归属(C01)、备份语言重排(C04)、回访层级(C02)。
