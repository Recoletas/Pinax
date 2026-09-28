# 使用指南文案与操作细节续修

2026-09-28，main 工作区。用户要求减少 AI 味并补清小步骤。本轮保留既有截图与页面布局，仅修改手册内容、导航摘要和交接记录。

## 改动

- 首页改为按任务找说明，删重复章节导航和宣传式介绍；快速开始保留新建/导入、输入与保存、批注、可选改写、备份五步。
- 写作页按实际入口补章节/速记标题、批注改写、助手范围、推演四步与换路、写成试稿/查看试稿、现场候选确认、正文版本。
- 明确“推演回应 → 写成试稿（再次生成）→ 作者采用”，替换原先仅建议手动搬回正文的说明。
- 正文旧版本统一指向“批注 → 版本”或章节菜单“历史版本”，与设置的“记忆与历史”区分。
- 识别写明附近正文、世界书名称/关键词匹配、选入后还需保存；不承诺计划中的多轮 Agent 或增量语义识别已经上线。
- FAQ 补选区浮条、重复推演、试稿采用、候选入场、速记改名、资料未检索到等问题；备份说明增加正文导出与 ZIP/JSON 区别、迁移步骤。
- 世界书、素材、跑团、视频、漫画删去重复定位、空泛转折和“沉淀/凭空/真实生成”等表达；核心英文六篇与两个 manifest 摘要同步。

## 代码依据（只读，未改）

- `src/pages/Authoring.vue`：速记标题 Enter blur/Esc、章节菜单、批注/版本页签、history rail 到记忆设置的路由。
- `src/components/authoring/AuthoringRehearsalPanel.vue`：从当前段落开始、四步上限、写成试稿/查看试稿、重新确定起点。
- `src/composables/useAuthoringRehearsalWorkflow.js`：试稿的独立生成、已有候选阻断和定位。
- `src/components/authoring/AuthoringSceneCuration.vue`、`useAuthoringSceneRecognition.js`：识别候选、选入、保存、跳过、取消。
- `src/components/authoring/AuthoringKnowledgeAssistant.vue`：现有问答范围；不把“问全书”说明为逐字阅读全部章节。
- `src/i18n/en.json`：已知英文标签；仍未翻译的推演/现场按钮在英文手册保留中文原标签供定位。

## 检查结果

- `npm run docs:build`：exit 0，日志 `/tmp/pinax-docs-copy-20260928.log`。这是工程文档站构建，不冒充手册浏览器交互验证。
- 手册静态链接检查：80 项，含 26 处图片；按 DocsPage 的 `/docs/screenshots` 映射到 `public/docs/screenshots` 检查，0 缺失。首次仅按文件相对路径检查时图片被误报，随后按实际挂载规则核对。
- 两份 manifest：章节 ID 无重复，各语言/中文回退目标文件存在。
- 使用当前 `marked` 解析：17 篇 Markdown 成功，均有一级标题。
- `git diff --check`：exit 0。

本轮未运行自动测试或 verify:full，遵守当前仅在用户要求测试/验证实现时运行测试的执行约束；未重拍截图、未进行浏览器 UI 走查、未部署。不宣称公网文档已经更新，保留其他会话 WIP。

文案修订落实到当前说明即可，不需要新增技能规则。
