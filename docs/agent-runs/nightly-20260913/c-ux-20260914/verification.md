# C 线验证记录(c-ux-20260914)

冻结候选:`night/authoring-ux-20260913` @ 813d7f2(基线 main@5152aad)。

## 机器门禁(封板树)

| 检查 | 结果 |
|---|---|
| `npm run verify:full` | exit 0;**20/20 文件 / 200/200 用例**;vite build OK;git diff --check clean;VitePress docs OK |
| `web-beta-onboarding-check.mjs`(Gate) | `"ok": true`(两处断言按 C03/C04 既定 UI 变更做最小更新,见 tasks.md) |
| `rehearsal-panel-check.mjs`(Gate) | pass: 304/304 |
| `settings-linkage-check.mjs`(Gate) | pass: 20/20 |
| first-run-ownership-check | 9/9 PASS,0 FAIL |
| welcome-returning-check | 6/6 PASS,0 FAIL |
| manuscript-import-guard-check | 13/13 PASS,0 FAIL(含 quota 二分填充反例) |
| backup-language-check | 8/8 PASS,0 FAIL(含两书备份/损坏文件反例) |
| save-rescue-check | 10/10 PASS,0 FAIL(含拒写/实时导出/刷新可达/丢弃反例) |
| settings-focus-check | 10/10 PASS,0 FAIL(含嵌套 Esc/IME/触控 44px) |

lint:`useAuthoringFirstRun.js` 0 问题;触碰文件无新增 lint 错误。存量错误(计入基线):AuthoringRehearsalPanel.vue 4 处 `vue/no-mutating-props`、Authoring.vue/AuthoringWelcomeView.vue/SettingsPopup.vue 的 block-order 各 2 处、AuthoringManuscriptImport.vue 1 处 `no-useless-escape`,均为主@5152aad 已有,归 B 线 lint 噪音清理。

## 十四旅程覆盖(C 相关)

| 旅程 | 结果 | 证据 |
|---|---|---|
| J01 干净浏览器新建/刷新 | pass | web-beta Gate 新建流程 + first-run-ownership(刷新回同章、指引不误完成) |
| J02 回访继续最近作品 | pass | welcome-returning-check(1440/390、正确书、无新建、无 first-run 附带) |
| J03 导入手改保护 | pass | manuscript-import-guard(书名不被重解析覆盖、章名对应保留、错误入框) |
| J04 换文件/取消/重复提交 | pass | manuscript-import-guard(重新选择有效、确认仅一份创建、quota 零写入) |
| J05 指引串到采纳 | partial | 指引按真实产物推进+run 创建不结束(单测+Gate);采纳后完成(单测);A 缺席,真实回应→试稿→采纳的浏览器纵切未走(A DTO 阻塞) |
| J12 保存/备份自救 | pass | save-rescue-check + backup-language-check(导出→隔离恢复→打开预期书,取消零写入) |
| J14 键盘/IME | pass | settings-focus-check(Welcome 入口;导入对话框 IME 守卫;推演错误入口经 c06 浏览器验证回程) |
| J06/J07/J09/J10/J11 | blocked-external | 后果 DTO/冻结接口属 A;C 未从自由文本猜状态,未造假接线 |

失败分母:web-beta Gate 首次复跑暴露 2 处断言过时(已修);其余检查在封板树一次通过。无已知未修复红项。

## 截图索引(精选 10 张,均在 screenshots/)

1. `c00-welcome-empty-desktop.png` — 基线:空库首访(verified-existing)
2. `c00-welcome-books-mobile.png` — 基线:390 回访缺口(最近作品沉底+记忆胶囊遮挡)
3. `c02-welcome-books-mobile-after.png` — 改后:390 回访首屏即“继续《雾港纪事·P1》”
4. `c02-continue-opens-book.png` — J02:点继续打开预期书
5. `c00-import-preview.png` — 基线:导入预览(verified-existing)
6. `c03-import-quota-error.png` — J04:quota 失败错误入框、预览保留
7. `c04-settings-backup-after.png` / `c04-backup-review.png` — C04:备份面重排+真实 metadata
8. `c05-save-rescue-error.png` — J12:拒写自救条,输入保留
9. `c06-rehearsal-failure-rescue.png` — 推演失败就地回程+设置 AI 分区
10. `c08-matrix-long-title-900-dark.png` — 900 暗色长章名(另有 1280/1024)
11. `c07-settings-focus.png` — J14:设置键盘焦点

全部 24 张含 capture-log.json(提交/分支/视口元数据),可回溯。
