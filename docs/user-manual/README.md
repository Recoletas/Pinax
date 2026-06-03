# WriterHelper 使用说明书

中文为主。本说明书写给想用这个框架写小说、做文字游戏的人。如果你是来改源码的，看 [README](../../README.md) 末尾的开发脚本表和仓库根目录的 `docs/engineering/` 就够了。

## 章节

按推荐阅读顺序：

1. [快速开始](./01-quickstart.md) —— 五分钟跑起来，配置第一个 LLM，跑出一段对话
2. [核心概念](./02-concepts.md) —— 把世界书、状态、机制、分镜这些项目里的黑话一次讲清
3. [功能与工作流](./03-features.md) —— 九大功能分别能干嘛，四个典型工作流怎么走
4. [详细配置](./04-configuration.md) —— provider 怎么选、Mem0 怎么开、localStorage 那些键都在存什么
5. [部署到公网](./05-deployment.md) —— **重点**：这个项目跟其他 LLM 应用不一样的地方都在这节
6. [常见问题](./06-faq.md) —— 配了 key 还是报错、地图慢、顾问不响应……用用户语言写的故障排查

## 我是 X，我该先看 Y

- **我刚 clone 下来，啥也不知道** → [01-quickstart.md](./01-quickstart.md)
- **我想搭一个仙侠世界** → [02-concepts.md](./02-concepts.md) 看"世界书"和"结构化设定"，再回 [01-quickstart.md](./01-quickstart.md) 走"方式 A：预设导入"
- **我想让 AI 记住我"不喜欢冗长描述"这种偏好** → [04-configuration.md](./04-configuration.md) 的"记忆系统"一节
- **我想把项目部署到自己的服务器上让朋友也能用** → [05-deployment.md](./05-deployment.md) 整篇，特别是"密钥模型"那一段
- **我用着用着出问题了** → [06-faq.md](./06-faq.md)
- **我想改源码** → [README](../../README.md) + 仓库根 `docs/engineering/development-standards.md`
