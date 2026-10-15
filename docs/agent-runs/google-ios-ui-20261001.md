# Google / iOS 界面打磨

2026-10-01 · main · 本地已实施并完成工程检查，视觉待作者确认。

## 方向与范围

这次调整解决不同页面的工具栏、导航、字体和表单像不同产品的问题。沿用作者提供的 Gemini 桌面截图，并参考 Google 与 Apple 官方界面。保留 Pinax 的作品与编辑流程；不复刻手机系统的桌面布局。

| 部分 | 本轮规则 |
|---|---|
| 作品导航 | 256px 桌面侧栏，40px 导航行；窄屏与触控至少 44px；选中常态中性，焦点只属于当前控件 |
| 工作栏 | 桌面以 52px 为基线；作品、分区和返回入口压到同一行，窄屏允许拆行 |
| 字体 | 界面使用系统无衬线；导航 15px、动作 14px、说明 12px；设定标题 24px；作者正文单独保留 |
| 面层 | 浅灰外壳、白色主要工作面、浅灰导航；暗色用相同的明度关系；去掉无用途的纹理与连续框线 |
| 控件 | 普通圆角 12px、大工作面 20px、浮层 16px；主动作可用胶囊，次动作轻量；状态不改变控件几何 |
| 内容 | 助手回答无衬线；来源保留证据与入口；设定空字段紧凑，长内容仍自动长高 |

以上为 Pinax 的试排尺度，并非实测的 Google / Apple CSS。

正文/助手切换沿用同一作品会话与现有草稿；设定切书、保存、撤销和来源预览保留现有调用链。字段组件的实例键补入作品和分区 ID，让编辑状态与撤销记录随字段所属对象切换；不把这一保护改动表述为已证实的串书故障。窄屏导航和来源仍能展开关闭，焦点、选区、阅读位置由原组件管理。此轮没有改 Agent、RAG、漫画生成或数据协议。

## 参考

- 作者 Gemini 暗色截图：`屏幕截图 2026-09-30 213032.png`，优先用于桌面布局。
- [Google Gemini 当前设计说明](https://blog.google/innovation-and-ai/products/gemini-app/next-evolution-gemini-app/)、[Google Workspace 官方界面](https://workspace.google.com/blog/product-announcements/reimagining-content-creation)、[Material 3 色彩角色](https://m3.material.io/styles/color/roles)。已查看官方产品图与此前 Gemini 网页实拍；详细研究在 `/tmp/pinax-google-ui-reference-20261001.md`。
- Apple 人机界面指南：[布局](https://developer.apple.com/design/human-interface-guidelines/layout)、[侧栏](https://developer.apple.com/design/human-interface-guidelines/sidebars)、[按钮](https://developer.apple.com/design/human-interface-guidelines/buttons)。参考官方原则，未声称运行或量测 Apple 客户端。

## 写集

- 根：共享字体与主题 tokens、导航/面层/控件、AppShell 与页签，偏好弹窗、资料页和地图容器。
- A：正文与助手组件、作品导航、Authoring 外部 CSS；不增加 Authoring.vue 行数。
- B：设定工作栏、目录、字段和资料表面，以及条目编辑页样式；根负责字段实例键保护，不改世界书持久化协议。
- C：首页、素材、速记、漫画与体验的界面样式；不改正文、画布坐标或输出。

## 证据与边界

施工前四页明暗截图已实际查看：`/tmp/pinax-google-ios-readonly-20261001/`。设定的多层工作栏、正文四宫入口、混用字体与选中态是本轮具体修订对象。

### 已修订的具体问题

- 侧栏统一宽度和导航层级；正文四宫入口改为垂直作品导航，当前项不再因侧栏任意控件获焦而整体变蓝。
- 设定的作品、栏目和返回入口合为一条工作栏；来源位于主工作面。字段减少留白，长内容仍自动增高。
- 首页、素材、画布、漫画、体验和偏好使用相同面层、字级与控件。去掉体验页外围渐变和纹理，正文与书封字体独立保留。
- 修复暗色章节菜单的白底、素材选中工具文字对比不足、长素材标题撑宽目录、手机标题裁切，以及时间轴操作覆盖标题。
- 修复手机设定目录被主工作面压住。条目页手机页签单行横向滚动；普通输入框实测桌面 36px、手机 44px。

### 浏览器证据

最终构建复制至 `/tmp/pinax-ui-final-r3-snapshot-20261001`，由 Playwright 在隔离浏览器内读取真实构建文件和手册 Markdown。API 与外网请求被拦截，没有启动服务、调用模型或写入用户浏览器数据。

| 范围 | 观察与截图 |
|---|---|
| 首页、正文、助手、设定、资料、素材、漫画、偏好 | 40 个页面状态：1440px 亮/暗、390px 亮、320px 英文暗色、1440px 英文 85% 缩放；`/tmp/pinax-google-ios-final-20261001/` |
| 地图、条目、资料回程、使用指南 | 8 张桌面亮暗截图；`/tmp/pinax-google-ios-aux-20261001/`。资料回程沿现有路由进入资料页，不据此宣称导入向导已验收 |
| 助手长列表、菜单与手机 | 分线 20 张截图，实际查看代表图；`/tmp/pinax-assistant-ui-polish-20261001/` |
| 设定有内容、来源与切书 | 分线 16 张截图及最终条目 3 张图；字段输入保存、切 B、回 A、重载仍保留 A 内容；`/tmp/pinax-settings-ui-20261001/REPORT.md` |
| 素材长标题、画布时间轴、漫画手工页、体验 | 分线 24 个状态、28 张截图；`/tmp/pinax-secondary-polish-summary-20261001.md` |

以上观察没有记录 pageerror 或整页横向溢出。主 agent 实际查看了助手、正文、设定、资料、素材、漫画、偏好、条目、地图和手册代表图；分线另查看长列表、有内容和手机图。未声称逐张人工查看全部截图，也未以合成数据判断真实模型质量。

### 工程检查

| 命令 | 最终结果 |
|---|---|
| `npm run build` | exit 0，13.60s；仍有构建器大 chunk 提示 |
| `npm run lint:delta` | exit 0；0 error、2 存量 warning：i18n console 与 Authoring 未使用函数 |
| `npm run architecture:check` | exit 0；Authoring 10,900 行 / 119 imports，生产循环与实验依赖均为 0 |
| `npm run architecture:build-size` | exit 0；Authoring 1,405,822 bytes，上限 1,450,000 |
| `npm run docs:build` | exit 0 |
| `git diff --check` | exit 0 |

日志：`/tmp/pinax-google-ios-{build,lint,architecture,docs}-final.log`。本轮没有新增或运行自动测试、smoke/eval 套件、`verify:full`、真实模型或真机检查。

daemon 中断后原 5174 预览已退出，本轮没有重启。当前为本地代码和构建产物，未提交、推送或部署；公网尚未更新。工程检查不能代替作者对视觉的确认。

## 细节续修：作者仍认为整体质感不足

上一轮只是本地实施与工程检查，作者未认可最终视觉。本轮保持当前页面骨架，按实际截图收细字体、控件、导航层级和信息密度。

- 界面字体栈归到 `--font-interface`。修复英文样式再次覆盖中文回退的问题；本机浏览器里，同一段中文回答从 Droid Sans Fallback 切到 Noto Sans CJK SC，证据为 `/tmp/pinax-ui-craft-20261001/fonts-en-{before,after}.jsonl`。作者正文与封面字体不改。
- 一级当前导航使用 500 字重，普通项 400；章节和提问的当前项使用更轻的底色。助手入口统一图标，回答名称 13px、时间 12px；发送使用真正的向上箭头，输入提示缩短，手机实填草稿仍自动增高。
- 单选下拉框共用 chevron、32px 右内距，保留原生选择器和键盘语义。亮暗主题声明对应 `color-scheme`；强制颜色环境恢复原生箭头。没有新增自制选择器组件。
- 偏好关闭按钮复用图标与命中区；临时遮罩加 4px 模糊，主页面不模糊。当前分区与其他分区字重分开，选择器降低边界噪声。
- 空设定的计数在未聚焦时隐藏，聚焦或有内容时显示；底部状态区保持高度。资料搜索和筛选对齐，移出动作与其他工具统一字级。
- 书架标题、字数和日期使用 16/500、13、12px，移除父组件重复覆盖。素材页码信息按基线排齐，工具去掉双色描边并统一图标；漫画折叠项收紧留白，保留桌面 36px / 触控 44px 命中区。

### 本轮观察与限制

截图来自离线加载的真实构建，数据仍为隔离合成样例。主 agent 实际查看助手亮暗、320px 英文、设定、书架、偏好和有内容的素材/漫画代表图；分线另外查看手机、草稿、菜单和聚焦状态。

- 主页面 40 个状态：未记录 pageerror、console warning 或整页横向溢出。
- 助手 10 个主状态及草稿/菜单/导航观察：320px 英文空提示一行；12 行输入从 28px 增到 160px，清空回 28px，输入焦点保持；Esc 关闭工具菜单后焦点返回触发项。
- 首页、有内容素材和手工漫画 9 个状态：无 pageerror / 整页横向溢出；分线保留 13 张截图，代表图已实际查看。
- 偏好早期分线截图误截在进入动画中，等待现存动画完成后重拍并实际查看正常；不能把过渡截图视作稳定界面。最终四配置 × 空未聚焦、空聚焦、有值聚焦、有值失焦的底部均为 20px；桌面卡片 152px / 手机 160px，各状态一致，计数只在空未聚焦时隐藏。记录见 `settings/observations.json` 与 `settings/REPORT.md`。

最终快照为 `/tmp/pinax-ui-craft-r2-snapshot-20261001`；主页面及最后状态区观察使用这一版。助手与有内容素材/漫画的分线截图来自同轮、最后两行设定 footer 修订之前的快照，不能表述为逐图重拍全部分线。过程与截图在 `/tmp/pinax-ui-craft-20261001/`。

最终命令：`npm run build` exit 0 / 12.22s；`npm run lint:delta` exit 0 / 0 error、2 存量 warning；`npm run architecture:check` 与 `architecture:build-size` exit 0，Authoring 10,900 行 / 119 imports / 1,405,822 bytes；`npm run docs:build`、`git diff --check` exit 0。日志为上述目录中的 `*-final.log`。

本轮未新增/运行自动测试、模型、服务、提交或部署；视觉仍待作者确认。

## 详细研究与独立交互样片

作者再次明确要求详细调研 Google / iOS 的高级质感。此前的样式收口与工程检查未获得作者的整体视觉认可，本次重新研究共同骨架、内容轴线、面层和工作状态。

交付：

- [完整设计研究](../plan/google-ios-visual-design-20261001.md)：官方依据、当前问题、页面落点、组件 owner、Web 边界和分片实施顺序。
- [独立 HTML 交互样片](../design/google-ios-surface-study-20261001.html)：正文/助手/设定/资料共同导航；亮暗、局部材质与减少透明效果；空白输入、示例对话、设定阅读/临时编辑和资料预览。
- [代表截图目录](../design/google-ios-study-20261001/)：7 张原始浏览器截图。完整过程观察保留在 `/tmp/pinax-premium-study-20261001/`。

### 依据与判断范围

三条只读研究分别处理 Google、Apple 与当前 Pinax，报告保留为 `/tmp/pinax-premium-{google,apple}-research-20261001.md`、`/tmp/pinax-premium-current-audit-20261001.md`。各分线实际查看产品图；主 agent 重新查看作者 Gemini 桌面图、Pinax 对照图、Google Docs 和 Apple Mail/材质图。官方链接及适用范围已收进设计研究，不把 Android 数值、iOS 原生效果或新版营销图视为作者桌面截图的实现参数。

核心建议是共同的作品上下文与导航位置、按任务确定的阅读宽度、实色内容面、局部功能层材质，以及完整的输入/生成/审阅反馈。助手空白页可保留作者截图中的局部蓝光。正式页签、编辑器与所有工具仍须在生产切片中承接，样片的简化界面不构成功能迁移。

本次执行现有视觉对齐流程的小片与实图要求，没有增加维护规则。生产 `src/`、服务端、模型、存储和媒体运行链本次均未改动。

### 样片观察与收口

离线 Chromium 直接打开 HTML，不占用端口、不加载真实项目。3 个视口（1440×900、390×844、320×720）× 2 个主题，分别采集空白助手、正文、设定、资料、输入、示例对话和菜单，最终 42 张稳定帧截图；页面状态与焦点共 24 条观察。主 agent 实际查看代表图；不把截图数当作视觉通过证明。

- 最终观察未记录 pageerror 或整页横向溢出；这只代表样片与此次视口。
- 手机收起侧栏后使用 inert，关闭与切页不把焦点留在屏外；Esc 关闭菜单返回顶部外观入口。
- 补拍 1440/390 的设定编辑后阅读、资料预览/关闭、正文滚动、实色菜单及 Tab 离开。临时文本在阅读模式保留，资料关闭回到原行，减少透明效果下 backdrop-filter 为 none。
- 样片初稿修正长 placeholder、只有边框变化的模式演示、手机隐藏导航焦点、菜单方向键范围和 SVG 选中标记；最终截图重新采集。早期截在过渡中的图片不作为稳定态证据。

只读脚本、观测 JSON 与截图为设计观察，没有添加断言或运行测试/smoke/eval 套件。未进行真机键盘、性能、完整编辑器、真实生成或作者视觉验收。

### 本次命令

| 命令 | 结果 |
| --- | --- |
| `node --check /tmp/pinax-premium-study-20261001/script.js` | exit 0；从最终 HTML 抽出的内联脚本 |
| `node /tmp/pinax-premium-study-20261001/capture.mjs` | exit 0；42 张样片稳定帧截图与 24 条观察，无断言 |
| `node /tmp/pinax-premium-study-20261001/details.mjs` | exit 0；10 张补充截图与 8 条观察，无断言 |
| `npm run docs:build` | exit 0，4.11s；现有 VitePress 文档构建，设计 Markdown 与 HTML 独立保存 |
| `git diff --check` | exit 0 |

设计方向待作者看样片确认。没有启动或重启服务，没有新增或运行自动测试、verify:full、模型调用、提交、推送或部署。
