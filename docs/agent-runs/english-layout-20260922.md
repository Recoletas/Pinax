# 英文漏译与排版续修

基线：main `0b5c60f9659074ef211c15d8873e1367d3179270`，保留原英文适配工作区。本轮未提交、推送或部署。

## 改了什么

- 补充大纲、故事试演、参考来源、记忆历史与记忆审核的界面翻译，新增三个小字典共 422 项；书名、正文、引文、模型输出不自动翻译。
- 将冗长按钮改成 `New book`、`Explore next`、`Add model`、`AI assist` 等简短操作名。仍未翻完的高级面板保留 `Partial English` 提示，完整说明在悬浮提示中。
- 英文界面使用系统 UI 字体；生图描述不再用等宽字体。正文与持久化字体偏好不变，没有缩小全局字号或改变默认缩放。
- 调整英文新建按钮比例、窄侧栏换行、设置导航宽度和手机表单；生图参数栏加宽，风格名自然换行，预览按比例裁切而非拉伸。没有另造主题或重写页面。

处理依据：[W3C 的文本长度适配说明](https://www.w3.org/International/articles/article-text-size)建议为翻译后的不同长度留出可伸缩和换行空间。本轮按仓库 UI 检查规范使用真实页面截图，并回归中文与正文字体；不需要新规则。

## 验证

- 完整 `npm run verify:full` 最终 exit 0：20 文件 / 200 用例、lint 无 error、Web/VitePress 构建、架构与 diff 检查通过。保留开发态漏译检测的 1 个 console warning；Authoring 1,445,376 bytes，未超过 1,450,000 限额。日志 `/tmp/pinax-english-layout-verify.log`。
- 隔离英文旅程 10 组 exit 0，0 pageerror、0 缺失翻译警告：导入、保存、人物、推演、生图、模型配置、大纲、记忆三视图、设置、备份与帮助；包含 1440/900/390px、85%/100%、明暗、切语言保留草稿及正文字体。[机器结果](./english-support-20260922-report.json)，日志 `/tmp/pinax-english-layout-smoke.log`。本页 4 个截图链接检查通过。
- 两个既有中文记忆脚本明确 `locale: zh-CN` 后原命令通过：209 次修订、刷新、跨书隔离、ZIP 往返、写失败保护，以及事实来源/更正链/失败任务重排队。日志 `/tmp/pinax-memory-history-locale-smoke.log`、`/tmp/pinax-memory-history-locale-ui.log`。
- 分线额外验证有内容的记忆编辑与切语言保留输入，及大纲/推演输入 DOM 身份不变。服务商技术错误和作者内容保留原文，不作为漏译机械替换。

已查看真实截图：[生图](../screenshots/english-support/image-workspace-en.png)、[大纲](../screenshots/english-support/outline-en.png)、[记忆](../screenshots/english-support/memory-en.png)、[手机设置](../screenshots/english-support/settings-390-en.png)。大纲中的中文是测试作者输入，特意验证不被翻译；生图是产品内置风格预览，不是本轮模型生成。只留少量代表图，临时矩阵截图在 `/tmp/pinax-english-support/`。

## 边界

完整设定、地图、跑团/联机、漫画/视频仍未全量英文化；本轮不宣称全产品无漏译。未验证真实模型文学质量、实体输入法、Safari/Firefox 或人工读屏。
