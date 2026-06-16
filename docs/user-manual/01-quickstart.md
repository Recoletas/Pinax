# 快速开始

五分钟跑起来。

## 1. 准备

- Node.js 18 或更新（建议 20）。`node -v` 看一下
- 一个 LLM 的 API key。DeepSeek 性价比高、注册快，可以先用这个；想用 OpenAI、Anthropic、自建 Ollama 也行，详见 [04-configuration.md](./04-configuration.md)
- 浏览器：Chrome / Edge / Firefox 最近的版本都行

## 2. 装包

```bash
git clone <这个仓库的地址>
cd text-game-framework
npm install
```

## 3. 跑起来

需要开两个进程。前端和后端各一个。

```bash
# 第一个终端：起后端
npm run server
# 看到 Server running on http://localhost:3001 就好了

# 第二个终端：起前端
npm run dev
# 看到 Local: http://localhost:5173/ 就好了
```

浏览器开 http://localhost:5173 看到欢迎页就算成功。

> **生产部署**到公网服务器怎么搞？看 [05-deployment.md](./05-deployment.md)。

## 4. 配第一个 LLM

不配 LLM key 也能开页面，但所有"让 AI 写"的按钮点下去都会回 `400 API_KEY_REQUIRED`。配法：

1. 点欢迎页右上角的 **设置**（齿轮图标）
2. 切到 **AI API** 标签
3. 选 Provider：先选 **DeepSeek**（如果你有 OpenAI key 就选 OpenAI）
4. 填 **API Key**：`sk-...` 那一长串
5. **Base URL** 不用手填，切 provider 时会自动填好
6. **模型**：DeepSeek 选 `deepseek-v4-flash`，OpenAI 选 `gpt-4o-mini`
7. 点 **测试连接**，看到绿色的"连接成功"就 OK
8. **保存并关闭**

key 只存在你这个浏览器的 `localStorage` 里，不会被发到仓库作者的服务器上——这一点跟其他 LLM 应用不一样，详见 [05-deployment.md](./05-deployment.md) 的"密钥模型"。

## 5. 跑出第一段

回到欢迎页，点 **体验**，再进入体验页。

如果还没有激活世界，先点 **导入种子世界**。当前首轮推荐的是 3 个种子世界：

- `边境王国 · 雾潮暮湾`
- `都市异闻 · 北岸旧档`
- `近未来殖民地 · 赫利俄斯`

导入后回到体验页，选中这个世界，再点 **进入这个世界**。

AI 会基于你选的世界生成一段开场白，然后你就可以在输入框里输入行动了：

```
我环顾四周，看看有什么能用的东西
```

回车之后 AI 接着往下写。状态栏会显示你的体力、心情、金钱等。

到这里就完整跑通了。后面 [02-concepts.md](./02-concepts.md) 会把“世界书”“状态”“机制”这些概念讲清楚，[03-features.md](./03-features.md) 会把“选择世界 -> 开始冒险 -> 写成作品”的主线路径展开。

## 6. 不想跑后端行不行？

可以，但只用到"写小说 / 编辑世界书 / 编辑素材"这些纯本地功能时能这么干——这些数据全在 `localStorage` 里。**只要涉及"让 AI 写"，就得起后端**（AI 请求要中转一次）。

纯前端起法：

```bash
npm run dev
```

不开 `npm run server` 也能进页面，访问 http://localhost:5173 就行。点任何 AI 按钮会报"网络错误"或 404。
