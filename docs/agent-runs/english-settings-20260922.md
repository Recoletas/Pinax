# 英文与界面精简续修 · 2026-09-22

基线 `main@0b5c60f`，延续既有未提交英文适配。只改界面显示与布局，不改世界书归属、导入格式、保存、AI 采纳或数据库；未提交、推送或部署。

## 实际修改

- 补资料列表与导入、设定四分区、字段/草稿审阅、高级条目和工作台设定右栏的英文。作者名称、分组、正文和模型原文不翻译。
- 顶部标签按页面类型切语言，不再直接展示存储的中文标题；含 ` · ` 的书名保持完整。
- 已有作品的首页去掉重复口号；统一 Story Bible / Sources 等入口名称；视频入口恢复“视频与编导”名称。
- 设定页两块重复来源区合为一条快捷预览，完整管理仍在 Sources；右栏目录不重复正文摘要。
- 缩短常驻按钮、搜索和筛选文案；沿用已有断点修正手机资料导入布局，避免高级条目页签被长内容压扁。英文页面标题使用 UI 字体，不缩小正文字号或新增面板。

按仓库 UI 规范查看真实页面截图后，才撤下重复来源区域，并调整手机标题、搜索与筛选长度；无需新增维护规则。

## 验证

- `BASE=http://127.0.0.1:5320 node scripts/english-settings-smoke.mjs`：4 组 exit 0，0 页面错误/缺失翻译警告。英文四分区、真实 TXT 追加、来源预览、条目三尺寸、返回工作台；通过真实设置菜单切语言后内容不变，刷新仍保存。
- `node scripts/english-support-smoke.mjs`：原有英文创作旅程 10 组 exit 0，包含输入/撤销、模拟 AI、导出恢复、设置与明暗/窄屏；0 页面错误。
- 中文 `settings-sources-journey`：9/9，exit 0；验证书籍隔离、未绑定建库、全文预览与移除。
- 中文 `entries-polish-check` 和 `settings-header-check`：exit 0；保存刷新、查找/键盘/批量工具/高级参数、四页三尺寸共用页头位置。
- `npm run verify:full`：exit 0，20/20 files / 200/200 tests / build OK / diff clean / docs OK；lint 0 error（开发态缺失翻译警告保留 1 条 lint warning），结构/体积预算通过。日志 `/tmp/pinax-english-settings-verify.log`。旧静态 aria 断言同步到翻译后的绑定语法，测试数量不变。

浏览器用隔离存储和虚构书稿，不接触用户数据、不调用真实模型。过程截图在 `/tmp/pinax-english-settings/`；只保留四张代表性实拍：[设定](../screenshots/english-support/settings-structured-en.png)、[条目深色](../screenshots/english-support/settings-entries-dark-en.png)、[资料导入](../screenshots/english-support/settings-import-en.png)、[工作台右栏](../screenshots/english-support/settings-inspector-en.png)。

## 未覆盖

不是全产品英文化验收：地图、跑团、联机、漫画、视频和任意第三方错误仍有中文。真实模型生成质量、人工英文审读和实体手机输入未验证；自动化通过不代表用户视觉确认。
