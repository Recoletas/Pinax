# 英文支持交付回执

日期：2026-09-22。基线 main `0b5c60f9659074ef211c15d8873e1367d3179270`。本地实现，未提交、推送或部署。

最新一轮补充资料、设定与条目翻译，并精简重复界面，见[设定续修回执](./english-settings-20260922.md)；[上一轮排版回执](./english-layout-20260922.md)保留大纲/推演/记忆证据。以下数字保留为早期轮次记录。

## 本次续修验证

- `verify:full` exit 0：20/20 文件、200/200 用例、lint、Web/VitePress 构建、架构/diff。日志 `/tmp/pinax-english-tools-complete.log`。
- 英文浏览器旅程扩为 9 组，exit 0，0 pageerror、0 缺失翻译提示。人物补全/推演/生图切语言保留输入；图片模型配置使用真实点击，新弹窗确实在父窗口上方；390px 分栏及英文风格名称无裁切。日志 `/tmp/pinax-english-tools-smoke-final.log`，机器回执已更新。
- 已查看[英文生图桌面](../screenshots/english-support/image-workspace-en.png)与[手机](../screenshots/english-support/image-mobile-en.png)截图；风格预览是产品内置参考图，不是本轮调用模型生成。核心编辑截图已重拍。
- README、英文指南及新截图回执的 39 个本地链接/图片检查通过。中文 README 换为已推送基线的[三张真实截图](./readme-screenshots-20260922.md)，不把英文 WIP 伪装为已发布界面。临时拍摄服务与 worktree 已清理，无用户数据删除。
- 此次只补实际英文工具流程；没有新增语言框架或翻译用户内容。以下早期交付数据为历史记录，不能代替本次验证。

## 已实施

- 续修：推演输入/选项/等待状态、人物 AI 补全、生图参数/结果/错误及模型配置界面接入翻译；只翻译应用文案，保留作品文本和自定义模型名。英文风格卡片换行、Home 标签加宽；修复模型配置弹窗被生图窗口遮挡导致无法点击的问题。新增 `english-tools-smoke.mjs`，并入原英文旅程，检查真实点击、辅助标签、输入在中英切换后保持、手机分栏与风格名称不截断。真实模型的英文生成质量未计验收；记忆、完整世界设定和扩展体验仍有中文面板。

- Vue I18n 11 Composition API 单例；核心中英消息随包加载。设置中的界面/助手语言是设备偏好，作品语言是可选书稿元数据。旧书不自动补语言；旧设备保持中文，新设备按浏览器首个受支持语言初始化。更新 html.lang，不重挂载编辑器、不重写正文/章节标题/字体。
- 核心首页、导入、新建、编辑、人物、设置、审稿改写、保存恢复与帮助英文文案。布局允许英文工具名，手机工具带横向滚动。高级工具显示部分中文提示，路由 ID、机器字段和枚举不变。
- Unicode 计数共享于导入预览、书库、主副编辑与章节写回。Han code points + 非汉字 Unicode words；内部撇号算一词，连字符拆词，数字算词，emoji/标点不计。英文单位 Words，混排为 Characters/words。UTF-16 技术长度、文件字节和模型预算未换算为词数。统计不制造正文修订。
- TXT 识别独立 Chapter 数字/罗马数字、Prologue、Epilogue；保留 Markdown、单章、编码预览。有效 UTF-8 优先于旧编码启发式，修复 O’Neill/café 被误读的问题。
- 自动对白锁支持单段直/弯双引号、弯单引号、日式引号；词内撇号不作为对白。显示范围、零识别说明与唯一精确手工锁；保留原始 offset/exact。跨段/未闭合/直单引号需手工指定。
- shared 语言合同校验 `manuscriptLanguage / assistantLanguage / outputLanguage`，发请求前冻结。审稿/改写经客户端、路由、共享提示词传递，返回/恢复记录保留策略。解释与候选正文语言分离，引用原样。作品语言变化使旧建议待复核，UI 切换不失效。writingSkill 白名单保持；未创建新运行时或增加模型预算。浏览器叙事内核也加入语言说明并计入原预算。
- 英文校对不强套中文引号；Surely 与正常英文句号不再触发对应误报。检查器仍不是完整英文语法引擎。
- 新增 README.en 和六篇核心英文手册；保留原章节 ID、请求代次保护及 Markdown 清理。四个高级帮助章节明确回退中文。

Vue I18n 版本选择依据[官方维护页](https://vue-i18n.intlify.dev/guide/maintenance)，未升级 Vue/Vite/Node 主版本。

## 语言和术语

UI 偏好键 `pinax-device-language` 不进入 JSON/ZIP；作品可选 `manuscriptLanguage` 随备份保留。目标原文语言优先于作品默认；显式本次输出要求通过提示词优先，模型仍需作者复核。混排保持原语言，不自动翻译。

核心术语：Manuscript、Characters、Story Bible、Proofread、Review、Rewrite from suggestion、Replace with this version、Backup & restore。界面使用完整句与命名插值，计数标签采用 Words: / Chapters:，避免英语单复数拼接错误。

## 实际任务与证据

`scripts/english-support-smoke.mjs` 启动自己拥有的 5232/3032 服务及全新 Chromium 上下文，使用自造 The Door 稿件。外部浏览器网络阻断，模型响应明确模拟；脚本不读取作者浏览器数据。

已通过任务：英文入口 → 4 章 TXT 导入 → 真实键盘写作和自动保存 → UI 中英切换保持同一编辑器、正文、标题和撤销重做 → 设置控件切语言 → 创建 Mae O’Neill 并编辑背景 → 中文解释、英文候选、直引号对白锁 → 采纳并保存 → Markdown 下载 → 干净浏览器通过设置预览/确认恢复 JSON → 帮助深链接及快速切换。桌面/390px/深色截图独立检查。

- [英文编辑界面](../screenshots/english-support/editor-en.png)、[人物编辑](../screenshots/english-support/characters-en.png)、[手机恢复预览](../screenshots/english-support/restore-preview-en.png)为实际 Chromium 截图，不是设计稿。
- 英文旅程日志/截图：`/tmp/pinax-english-support/`，report.json 记录步骤和 pageerror。
- `BACKUP_CHECK_OUT_DIR=/tmp/pinax-english-zip npm run ci:workspace-backup-smoke`：exit 0。完整 ZIP、作品语言字段、来源/媒体、幂等恢复及 IndexedDB 写失败保护通过；原中文回归上下文显式设 zh-CN。日志 `/tmp/pinax-english-zip.log`。
- `npm run verify:full`：exit 0，20/20 files / 200/200 tests / Web build OK / architecture OK / diff clean / docs OK。日志 `/tmp/pinax-english-final-20260922.log`；Authoring 1,445,307 bytes（上限 1,450,000），10,895 行 / 119 imports（上限 10,900 / 125）。lint 无 error，开发态缺失翻译的 console.warn 有 1 个 warning；原有 Vue 生命周期警告不影响退出码。
- `node scripts/english-support-smoke.mjs`：exit 0，8 组旅程，0 pageerror、0 核心旅程缺失翻译提示；[机器回执](./english-support-20260922-report.json)。测试保持 20 文件 / 200 用例，新增合同断言并入既有用例。
- README/英文手册/回执 19 个本地链接核查，无缺失。

## 尚未覆盖

- 未调用真实模型，未做文学质量或真实 provider 交叉矩阵；模拟 JSON 合格不代表英文意见自然、有价值。未完成陌生作者人工英文审读。
- 浏览器为 Linux Chromium；实体设备中文 IME、dead keys、Safari/Firefox 和读屏器人工验证未做。
- 完整世界设定/地图、体验、联机、漫画/视频、部分高级面板和工程文档未整体翻译。记忆历史、大纲与试演界面已在最新续修补齐；人物 AI 的真实输出语言与内容质量仍需模型验收。
- UI 语言切换保持未保存内容/编辑器实例/撤销历史的浏览器验证已做；全部 L01–L24 组合、所有异步 provider 和跨作品故障矩阵没有全量复跑。
- 原始服务商诊断保留在错误对象；稳定错误码有英文提示。尚未给所有高级错误建立统一可展开诊断面板。

下一步必要项是实际英文稿与真实模型矩阵、人工英文/无障碍/实体输入检查，以及按使用频率补高级工具；不应宣传全产品完整英文支持。

## 变更文件

以下为工作区实际修改与新增文件；未修改许可证。

- `README.en.md`
- `README.md`
- `docs/LOG.md`
- `docs/PLAN.md`
- `docs/STATUS.md`
- `docs/agent-runs/english-support-20260922-report.json`
- `docs/agent-runs/english-support-20260922.md`
- `docs/plan/english-support-20260922.md`
- `docs/screenshots/english-support/characters-en.png`
- `docs/screenshots/english-support/editor-en.png`
- `docs/screenshots/english-support/restore-preview-en.png`
- `docs/user-manual/05-writing.md`
- `docs/user-manual/07-settings.md`
- `docs/user-manual/en/01-quickstart.md`
- `docs/user-manual/en/03-worldbook.md`
- `docs/user-manual/en/05-writing.md`
- `docs/user-manual/en/07-settings.md`
- `docs/user-manual/en/08-faq.md`
- `docs/user-manual/en/README.md`
- `docs/user-manual/en/manifest.json`
- `package-lock.json`
- `package.json`
- `scripts/authoring-ui/workspace-backup-check.mjs`
- `scripts/english-support-smoke.mjs`
- `server/routes/advisor.js`
- `server/services/openclawService.js`
- `shared/writingCandidateContract.js`
- `shared/writingLanguage.js`
- `shared/writingTextMetrics.js`
- `src/App.vue`
- `src/__tests__/agentContracts.test.js`
- `src/__tests__/authoringSceneRail.test.js`
- `src/__tests__/authoringWorldbookBinding.test.js`
- `src/__tests__/uiControlContract.test.js`
- `src/components/authoring/AuthoringCharacterPanel.vue`
- `src/components/authoring/AuthoringDualPane.vue`
- `src/components/authoring/AuthoringFirstRunPath.vue`
- `src/components/authoring/AuthoringGoalReview.vue`
- `src/components/authoring/AuthoringIdeaShelf.vue`
- `src/components/authoring/AuthoringKnowledgeAssistant.vue`
- `src/components/authoring/AuthoringManuscriptImport.vue`
- `src/components/authoring/AuthoringReviewPanel.vue`
- `src/components/authoring/AuthoringSceneRail.vue`
- `src/components/authoring/AuthoringWorkspaceToolRail.vue`
- `src/components/authoring/BookLibraryCard.vue`
- `src/components/authoring/LibraryQuickActions.vue`
- `src/components/authoring/LibrarySidebar.vue`
- `src/components/authoring/ManuscriptLanguageSelect.vue`
- `src/components/text/TextModelPicker.vue`
- `src/components/workbench/ActivityBar.vue`
- `src/components/workbench/SettingsPopup.vue`
- `src/components/workbench/WorkspaceTabs.vue`
- `src/components/workbench/WritingPreferences.vue`
- `src/components/worldbook/ApiSettingsPanel.vue`
- `src/components/writing/WritingNotebookEditor.vue`
- `src/composables/useAuthoringPersistence.js`
- `src/composables/useAuthoringReviewWorkflow.js`
- `src/composables/useAuthoringRewriteWorkflow.js`
- `src/i18n/backupMessages.js`
- `src/i18n/en.json`
- `src/i18n/index.js`
- `src/layouts/AppShell.vue`
- `src/main.js`
- `src/pages/Authoring.block-native.css`
- `src/pages/Authoring.vue`
- `src/pages/DocsPage.vue`
- `src/services/advisorTaskService.js`
- `src/services/agents/authoring/authoringReviewRunStore.js`
- `src/services/agents/authoring/authoringReviewSession.js`
- `src/services/agents/authoring/narrativeKernelExecutor.js`
- `src/services/agents/authoring/writingSkillChecks/checkDegeneration.js`
- `src/services/writing/writingBooksRepository.js`
- `src/services/writing/writingChapterLabels.js`
- `src/services/writing/writingLanguagePolicy.js`
- `src/services/writing/writingManuscriptExport.js`
- `src/services/writing/writingManuscriptImport.js`
- `src/views/AuthoringWelcomeView.vue`
- `vitest.setup.js`
