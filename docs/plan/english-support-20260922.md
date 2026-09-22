# 英文支持：当前代码核查与分批实施

日期：2026-09-22。证据级别：已实施、程序合同验证与隔离浏览器组合验证；真实模型和人工英文审读尚未执行。实现与证据见[交付回执](../agent-runs/english-support-20260922.md)。

基线：`main@0b5c60f9659074ef211c15d8873e1367d3179270`，与用户提供报告完全一致；启动时工作区干净，Node `v22.22.3`。本轮不重复竞品调研，不将报告中的外部依赖维护状态当作本地验证结果。

## 实施前的一页差距表（历史基线）

| 范围 | 当前已有实现 / 差距 | 调用方与接入位置 | 数据影响与验证 |
|---|---|---|---|
| UI 语言 | `src/shared/server` 与 package 中未搜到 `uiLocale/manuscriptLanguage/assistantLanguage/Segmenter/i18n`；现有中文文案 | main、App、AppShell、路由展示、SettingsPopup、首页和 Authoring | 设备偏好单独保存；L01–03、L18–19、L21、L24；不改路由 ID 或重挂载编辑器 |
| 作品元数据 | repository 用 `{ ...raw }` 保留额外字段；创建函数尚无语言参数 | `writingBooksRepository` 的创建/更新与作品设置 | 可选字段，旧作品不自动填语言；JSON/ZIP往返、旧备份恢复 L15；不能仅凭展开对象认定所有写回都保留字段 |
| 长度 | 主编辑器汉字 + ASCII 连续字母段；导入为非空白 UTF-16 长度；Authoring 还有独立计数写入 | 导入预览、章节列表、主副编辑区、保存/导出与上下文摘要 | 集中作品长度，保留 maxChars/字节/token 单位；L08–09、L23；重算不改变正文、哈希和修订 |
| TXT 拆章 | 普通标题仅中文；Markdown 已支持英文 | `parseManuscriptText`、导入预览、`createImportedWritingBook` | 增加保守独立标题识别；默认标题按创建时作品语言；L10–11、L24 |
| 对白锁 | 自动匹配弯双引号、日式引号；直双/弯单遗漏 | `collectWritingDialogueLocks` → rewrite workflow → candidate contract | 保留原始 UTF-16 offset/exact；范围预览、手工锁、未闭合/跨段/缩写 L12、L16、L23 |
| 助手通路 | review/rewrite → `requestAdvisorTask` → `/advisor/task` → enforcement → runner → text-model →共享 openclaw 提示词 →结果归一化；未见语言策略 | 前后端 advisorTaskService、routes/advisor、writingSkillEnforcement、openclawService | shared 校验 options 中的语言策略并冻结；不绕过 writingSkill 白名单；L04–07、L14、L16 |
| 检查器 | 中文引号模板；英文 `Surely` 误命中，英文句号结尾被报截断 | `checkDegeneration`、服务端 enforcement、review workflow 合并 findings | scanner 返回 blocking，当前 UI 合并为 low；不能称为采纳阻断。覆盖正常叙事、对白与元叙事 L22 |
| 候选失效 | 已比较章、节点/单元修订、原文；未比较语言策略 | `getWritingCandidateStaleReason` 和 review/rewrite 结果记录 | 增加语义策略快照/比较，纯 UI 切换不失效；L06–07、L16 |
| 备份恢复 | JSON 原始键值备份，ZIP 复用 JSON 并包含其他域；已有预览与补偿 | `backupExport`、`workspaceBackupBundle`、SettingsPopup | 作品语言随作品；明确设备偏好恢复规则；真实保存失败与旧/新备份 L15、L17 |
| 帮助 | 固定中文 manifest/正文；已有正文请求代次、深链接映射、HTML 清理 | DocsPage 与 user-manual | manifest 和正文都需语言请求所有权；同章节 ID，保留 sanitize；L20–21 |

上表是定向核查，不是所有 provider 的完整审计。当前 review/rewrite 的客户端服务明确走 HTTP 服务端；下一拍、行内续写及其他浏览器模型入口仍需逐项登记策略传递，不能用这一条链代表全部助手。人物/世界设定页的英文覆盖也尚未清点。

## 本轮模块复现

直接导入当前 `writingManuscriptImport.js`、`writingCandidateContract.js` 和 `checkDegeneration.js`，执行 Node heredoc，exit 0；没有调用真实模型或启动应用。编辑器计算列仍是从 Authoring 摘出的表达式，未挂载 Vue。

| 原文 | 编辑器表达式 | 实际导入模块 wordCount |
|---|---:|---:|
| Hello, world! | 2 | 12 |
| Don't stop. | 3 | 10 |
| naïve café | 3 | 9 |
| 你好，Pinax。 | 3 | 9 |

- `Chapter 1` + `CHAPTER IV: The Door` 得到单章“正文”；`Prologue` 同样未识别。两个 Markdown 一级标题正确得到两章。
- `"Stay here," she said.` 与 `‘Stay here,’ she said.` 得到零自动锁；弯双引号及日式引号得到带 start/end 的锁。
- `Surely she knew the road.` 得到 exact=`Sure` 的 placeholder-leak，以及句尾 truncated；`"Sure," she said.` 不报英文 AI 腔，但仍报 truncated。均为 scanner 的 blocking。
- `useAuthoringReviewWorkflow` 将服务端检查结果映射成 `severity: 'low'` 的意见。这证明误报可进入合并结果，不证明采纳会被阻断。

## 分批实施与验收

A1/A2、核心 A3、B1/B2 的程序链路与 C 的文档已实施；下列条目保留为范围定义。真实模型质量、实体设备与全实验功能翻译未计完成。

1. **A1：语言边界和数据。** 核查锁定的 Vue/Node/Vite 兼容性与官方维护状态后选择 Vue I18n；设备 UI 偏好、可选作品语言、助手默认跟随 UI。旧设备优先保持中文，旧作品空值保持空值。先验证刷新、旧/新备份往返、不改正文和标题。
2. **A2：文本行为。** 集中计数并接入导入/主副编辑/章节写回，补英文 TXT 标题识别和对白锁预览。统计缓存不制造作者修订；精确锁不做 Unicode 或换行预处理。L08–13、L23。
3. **A3：无 AI 英文旅程。** 首页、新建/导入、编辑、人物查看/编辑、设置、导出及备份恢复，含 ARIA、错误、加载和覆盖警告。保留中文输入保护与字体偏好。桌面/窄屏/深浅色、选区/撤销/未保存状态实测。完成 A1/A2 不能算 A 已交付。
4. **B1：请求和输出。** 统一受校验的作品/解释/输出语言策略；目标片段与本次明确要求优先。reason/rationale/answer 使用解释语言，replacement 保留目标语言，exact/quote 原样；快照贯穿请求、方法、提示词、检查器、结果与失效检查。覆盖所有实际 provider 分支，不只修改 openclaw 提示词。
5. **B2：助手旅程。** 消除上述英文误报及固定中文规范冲突；中文 UI/英文稿/中文解释与反向组合，运行中切 UI/切作品、改语义策略、原文变化、取消与采纳保护。不扩大预算来掩盖截断。程序合同与真实模型自然度分开验收。
6. **C：对外入口。** 六类英文手册、README.en 与中文互链、真实英文截图；保留章节深链接和 HTML 清理。陌生作者从导入到恢复，再完成审稿→定位→改写→采纳。未覆盖的实验页明确语言范围，不宣传完整英文支持。

已实现计数口径（既有测试已增加断言）：英文 Unicode 词，内部撇号保留、连字符拆词、独立数字计词、emoji/标点不计；中文按汉字计数并补充非汉字词，混排详情分列。采用确定性 Unicode 字符类表达式，不依赖 Intl.Segmenter/ICU 版本；未声称与外部投稿工具一致。技术 UTF-16 长度、字节限额与模型 token 均独立。

核心术语沿用户报告：Workspace、Manuscript、Characters、Story Bible、Proofread、Review、Rewrite selection、Compare changes、Backup & restore；采用按动作分别为 Apply / Insert / Replace selection。业务键不翻译。

## 验证边界与后续交付

核心英文浏览器旅程已执行，包括导入、编辑、撤销重做、人物、语言设置、模拟审稿改写采纳、Markdown 导出、JSON 恢复和帮助深链接；完整 ZIP 回归已通过。L01–L24 并非全部设备/模型矩阵完成；具体边界见交付回执。

实施时扩展现有测试断言，遵守 20 文件/200 用例上限；额外旅程用现有 smoke/eval 入口。每批运行 `verify:full`，记录真实退出码；浏览器和模型证据单独记录。最终交付文件清单、冻结策略、计数口径、英文任务回执、未翻译范围与必要后续。工程构建成功不等于英文作者任务已通过。

实施前核查文档的历史验证：`npm run verify:full` exit 0，20/20 files / 200/200 tests / lint OK / Web build OK / architecture OK / diff clean / docs OK；日志 `/tmp/pinax-english-audit-20260922.log`。主计划、日志、状态的三个新增链接目标检查通过。测试有 Vue 生命周期警告；退出码未受影响。
