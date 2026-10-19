[English](README.en.md)

<div align="center">
  <img src="docs/assets/readme/pinax-icon.png" width="92" height="92" alt="Pinax 标志">
  <h1>Pinax</h1>
  <p><strong>把故事留在作者手里。</strong></p>
  <p>Pinax 把正文、人物和世界设定放在同一个长篇创作工作台。</p>

  <p>
    <a href="https://github.com/Recoletas/Pinax/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Recoletas/Pinax/ci.yml?branch=main&amp;style=flat-square&amp;label=CI" alt="CI 状态"></a>
    <img src="https://img.shields.io/badge/status-Public_Alpha-2563eb?style=flat-square" alt="Public Alpha">
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-PolyForm_Noncommercial-475569?style=flat-square" alt="PolyForm Noncommercial 许可证"></a>
  </p>

  <p>
    <a href="#当前如何使用">当前如何使用</a> ·
    <a href="#可以怎样创作">创作场景</a> ·
    <a href="docs/user-manual/01-quickstart.md">快速开始</a> ·
    <a href="#保存隐私与-ai">保存与隐私</a> ·
    <a href="#开发者本地运行">本地运行</a>
  </p>
</div>

Pinax 为有故事想法、但可能受时间、精力或经验限制的人提供写作帮助。AI 可以承担资料整理、检查和重复修改等工作，让作者把更多心力留给故事判断与表达；目标是帮助更多人把想法写成优秀作品，而不是用 AI 取代作者。

产品以**文本和正文工作台**为中心。工作台提供章节、正文、批注、改写、续写、校对和助手问答；关联世界书后，受支持的 AI 任务可进一步参考本书人物、地点、规则和历史。设定可从来源资料提取、作者手动整理、AI 草拟，并在写作过程中按需更新；提取和识别结果仍需作者确认。跑团、漫画、生图和视频是围绕故事文本延伸的工作流，不是写作前置步骤。

推演草稿和默认助手修改先供作者审阅；助手也可在明确授权的范围内自动采用修改，仍检查原文版本和保存结果。基础写作和作品备份不要求先配置模型。

**写作本身不需要 AI、账号或 API Key。** 章节、资料、正文保存和备份都可以独立使用。

## 当前如何使用

Pinax 当前处于 **Public Alpha**，支持公网试用和本机运行。

- **公网试用**：[pinax.cc](http://pinax.cc/)，免登录。当前 HTTP 连接会被浏览器提示不安全，HTTPS 尚待配置；部署状态见[已知问题](docs/src/known-issues.md)。首次进入看[快速开始](docs/user-manual/01-quickstart.md)。
- **自行运行**：开发者可按下方[本地运行步骤](#开发者本地运行)启动 Web 版；AI 和部分媒体功能还需要启动服务端并配置渠道。
- **只想了解**：先看[作者使用指南](docs/user-manual/README.md)；工程状态、路线和测试证据在[工程文档](docs/README.md)。

访问地址会影响浏览器中的作品归属。**从临时地址切换到正式域名之前，请先在旧网址导出备份。** 新网址看不到作品不代表原稿已删除，应先回原来的网址和浏览器检查。

## 可以怎样创作

### 写一部长篇

新建书稿或导入 TXT / Markdown，按卷章整理正文、构思与大纲。正文自动保存在当前浏览器；查找、历史、排版和恢复不依赖模型。

### 关联世界书，增强 AI 创作

世界书承载人物、地点和规则。默认直接写条目标题和正文，属性按需展开；右栏提供同类、场景与经历、表格、关系和管理。参考资料通过导入浮窗加入，原文与提取出的设定分开保存。关联到书稿后，工作台里的 AI 可以使用这些作品背景；不必为使用通用 AI 先建完整世界书。

### 需要时再请 AI 帮忙

针对选中的文字或当前场查询资料、比较路线、改写或生成试稿。Pinax 会显示本次参考的章节和资料；建议可以放弃或修改，采用前仍由作者决定。

左侧目录默认按正文、构思、设定、资料和素材收纳，可新建混合文件夹；章节顺序另有视图。中央标签按资源类型打开原工作台，右侧写作工具和可编辑双栏继续保留。目录移动不改变章节导出顺序。


## 创作流程

**基础流程**：新建或导入书稿 → 在核心工作台写作，按需使用通用 AI → 修改、保存与导出。

**世界书增强流程**：新建人物/地点或导入资料 → 编写条目、核对来源 → 按需补属性和关系 → 在正文与助手中使用本书设定。写作过程中出现的新事实可能进入待核对/记忆记录，不会不经确认就静默成为正式设定。

**其他去向**：素材、漫画、视频和跑团可由工作区打开，各自保留制作/存档流程。它们是可选扩展，不是写作的必经步骤。

书稿导入支持 TXT / Markdown；DOCX / PDF 属于资料页的来源导入。具体按钮和操作见[快速开始](docs/user-manual/01-quickstart.md)与[世界书与设定](docs/user-manual/03-worldbook.md)。

## 保存、隐私与 AI

Pinax 当前是本地优先的 Web 应用，不是云同步服务。

| 内容 | 当前边界 |
| --- | --- |
| 书稿与常用配置 | 主要保存在当前网址、当前浏览器的本地存储中 |
| 来源归档与媒体 | 主要保存在当前浏览器的 IndexedDB 中 |
| 完整工作区备份 | ZIP；包含书稿、设定、来源归档、已落盘媒体、记忆历史和事实账本；外部链接和未落盘内容可能不含在内 |
| 轻量备份 | JSON；适合快速留底，不包含来源原件、媒体原件和已归档的记忆历史 |
| 模型密钥 | 不进入 ZIP 或 JSON 备份；自定义配置需另行保管 |
| AI 请求 | 只有主动使用相关功能时，本次任务所需正文和资料才会发送到所选模型渠道 |
| 账号与同步 | 核心写作不要求账号；当前没有完整的多设备云同步 |

协议、主机名或端口变化都可能让浏览器把网页视为不同来源。换网址、换浏览器、换设备、清站点数据或使用无痕窗口前，请先导出备份。恢复可能覆盖当前内容，Pinax 会先显示新增、覆盖和跳过项目，确认范围后再继续。

AI 是可选项。应用里可见的内置 MiniMax 只有在部署者配置服务端密钥并且网络可用时才能调用；本机部署可配置文本渠道，公网不允许访客修改服务器模型；图片和视频有独立配置。不要把密钥写入源码、`VITE_*`、日志或提交记录。

## 当前范围

核心 Web 写作闭环适合本地试用和小范围作者反馈。作品知识、受控生成和推演仍需持续验证真实模型质量；跑团、地图、漫画、视频、协作与 Electron 等属于扩展或实验工作面，不应成为作品唯一的保存路径。

准确状态以[项目状态](docs/STATUS.md)和[测试状态](docs/src/test-status.md)为准。自动化测试证明相应合同和流程能够运行，不替代真实作品、真机中文输入、长期数据可靠性或生成内容质量验收。

## 开发者本地运行

需要 Node.js `>=22.13.0 <23`（仓库提供 `.nvmrc`）和 npm。完整安装可能需要本机构建工具链来编译原生依赖。

```bash
git clone https://github.com/Recoletas/Pinax.git
cd Pinax
nvm use
npm ci
npm run doctor

# 终端 1：前端，默认 http://localhost:5173
npm run dev

# 终端 2：后端，AI、媒体代理与应用内帮助需要
npm run server
```

文本 AI 还需要运行包及模型配置，在开发机执行：

```bash
PINAX_RUNTIME_OUTPUT=.runtime/storyagent-next npm run build:agent-runtime
# 配置 server/.env 后，再启动或更新后端
```

可选的本机知识检索另需 `npm run build:knowledge-runtime` 和项目绑定。公网关闭本机文件能力。服务器内存较小时，在兼容平台构建后上传产物，详见[运行包发布与回滚](docs/engineering/agent-runtime-deployment.md)。

服务端渠道配置见 [server/.env.example](server/.env.example)。完整验证、架构边界和贡献流程分别见[测试说明](docs/src/test-status.md)、[当前架构](docs/engineering/current-architecture.md)和[贡献指南](CONTRIBUTING.md)。

## 文档与参与

- 作者：[使用指南](docs/user-manual/README.md) · [快速开始](docs/user-manual/01-quickstart.md) · [常见问题](docs/user-manual/08-faq.md)
- 部署与维护：[工程文档入口](docs/README.md) · [运维排障](docs/operations/troubleshooting.md)
- 开发：[当前架构](docs/engineering/current-architecture.md) · [代码地图](docs/src/code-map.md) · [贡献指南](CONTRIBUTING.md)

欢迎通过 Issue 和 Pull Request 参与改进。安全问题不要在公开 Issue 中披露；项目尚未公布独立私密渠道时，以 [SECURITY.md](SECURITY.md) 的当前说明为准。

## 许可证

Pinax 采用 [PolyForm Noncommercial License 1.0.0](LICENSE)：允许查看、修改和非商业使用，但它是 **source-available** 许可证，不是 OSI 定义下的开源许可证。商业销售、商业 SaaS、付费托管、商业集成或其他商业用途需要单独授权。

第三方依赖、字体、图片、演示素材、模型服务，以及用户自己的作品和生成内容，仍分别受其原始许可证、服务条款或权利归属约束。许可说明见[公开 Alpha 许可证说明](docs/engineering/public-alpha-license-notes.md)。
