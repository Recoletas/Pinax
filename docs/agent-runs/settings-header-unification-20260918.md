# 设定子界面顶部统一 · 2026-09-18

用户指出当前作品与子界面选择位置不一致。原因是设定页并列两栏，资料/条目上下两行，地图页只有分区导航；各页面还各自覆盖公共组件间距。

四个正式页面统一使用 `SettingsWorkspaceHeader`：第一行左侧当前作品，右侧回正文；第二行设定/资料/地图/条目。项目身份统一显示作品名，全局入口仍保留世界书选择。清除四页旧顶部布局覆盖，模块工具放在共享导航之下；地图仅修改页面 UI，不触碰引擎/worker/绑定算法。

沿用本会话已读 ui-style-check、worldbook-workflow 和 testing-verification，并核对 map-engine-workflow 的 UI 范围。此问题是公共视觉所有权未统一，不需要新增规则。

`node scripts/settings-header-check.mjs` exit 0：四页 × 1440/900/390，逐一断言公共容器、作品名、导航和回正文的 x/y/高度完全一致，当前作品/选中分区正确，切换保留 bookId，无横向溢出及页面异常。深色截图亦已查看。

截图 `/tmp/pinax-settings-header/`，已查看设定/地图桌面与手机暗色。共享设定联动 exit 0，20/20；`npm run verify:full` exit 0：20/20 files / 200/200 tests / build OK / diff clean / docs OK，lint 0 warnings，结构预算通过。日志 `/tmp/pinax-header-verify.log`。未提交推送，保留既有 WIP。
