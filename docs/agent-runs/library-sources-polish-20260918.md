# 首页与资料页视觉修正 · 2026-09-18

范围：当前 main 工作区，保留前轮顶栏/图标 WIP，并接入已在 `939fedc` 验证的资料一级页功能切片。未整体合并夜间分支的文档历史。

## 调研与约束

- [Novelcrafter Codex](https://www.novelcrafter.com/features/codex)：已查看官方功能说明与实际产品截图，借鉴常驻资料、可扫描索引、名称与摘要层级。未继承其付费能力、数据模型或营销视觉。
- [Carbon 按钮指南](https://carbondesignsystem.com/components/button/usage/)：核对单一主操作、次级操作降权、同组尺寸一致与明确动词标签；保留 Pinax 自身颜色和圆角。
- [Lucide 官方指南](https://lucide.dev/guide)：复用已有 Vue SVG 库，统一线宽和尺寸，以可识别语义选图，不混搭 emoji 或位图。
- 初次尝试的 Novelcrafter/Lucide 子路径为 404，已改用上述有效页面；Apple 页面仅返回 JavaScript 壳，未将其视为已读证据。

六项约束：唯一主操作；唯一标题与计数；控件高度/基线统一；不同用途图标可区分；资料名称/摘要/元信息分层；1440/900/390 与深色分别验图。首页是作品入口，资料是长期使用的管理列表；采用安静工具风格，桌面连续内容面，手机重排元信息。

## 实施

- 首页四张同权大动作卡改为紧凑工具组，新建为主操作，导入为描边动作，备份/指南为轻量命令；手机两列重排。保留书架、真实封面与原有路由。
- 新建用文件加号、导入用文件向内箭头；作品/资料/地图/素材/漫画/冒险/历史/备份/帮助分别采用对应语义图标。主页加入随书“参考资料”入口，标签与分区同步。
- 资料页移除重复标题/计数/添加按钮和可折叠外框，采用单标题、搜索/筛选与文档行；长标题换行、摘要截断、类型/字数/归档状态对齐，原文采用阅读行距。
- 独立资料页显示当前作品名称，不把锁定项目呈现为可选下拉；其他设定页面保留原上下文合同。
- 搜索、控件和分隔线使用实际存在的主题令牌；亮/暗、键盘焦点、移动端操作均保留。

## 证据与边界

早期小切片 `/tmp/pinax-ui-before-home.png` → `/tmp/pinax-ui-actions-slice.png` 已查看后继续资料列表。最终截图在 `/tmp/pinax-library-sources-polish/`，包含首页/资料三尺寸、暗色与手机预览；已查看桌面、手机及暗色原图。外部参考截图仅保留在 `/tmp`，未作为产品资产使用。

`welcome-library-smoke` exit 0：书架、搜索、排序、列表、回正文、立即返回保存、标签关闭/键盘、首页导航与菜单。旧脚本的 tab role 断言与现有按钮式导航不符，已按实际 aria-current 合同修正。

`settings-sources-journey` exit 0：9/9，上传/追加/回程、持久化、两书隔离、失效态、未绑定首次导入、预览/移出。导航使用正在运行的应用 router，避免 HMR 场景下动态重新 import 产生第二个 router。

`library-sources-visual-check` exit 0：三尺寸、暗色、唯一添加入口、搜索/筛选/预览、无页面错误。

`settings-linkage-check` exit 0：20/20。首次 19/20 暴露手机回程按钮被公共 quiet 高度覆盖，修正局部触控尺寸后完整复跑通过。

最终 `npm run verify:full` exit 0：20/20 files / 200/200 tests / build OK / diff clean / docs OK；lint 0 warnings、结构预算通过，日志 `/tmp/pinax-library-sources-verify-final.log`。不调用真实模型、不操作用户存储或重启已有服务。用户视觉确认仍待定；此轮落实既有视觉规范，不需要新规则。
