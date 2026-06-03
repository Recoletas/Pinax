# 常见问题

按症状分。看完症状直接对号入座。

## 配置了 API key 还是报 400

**症状**：填了 API key，点了 AI 按钮，回 `400 API_KEY_REQUIRED` 或者 "未在请求体中提供 apiKey"。

**最常见原因**：

1. **填了 key 但没点保存**。设置面板里填完 key 必须点 **保存并关闭**，不然 key 没写到 localStorage
2. **点保存的时机不对**。先填 key，再切到其他标签，切回来时 key 会清空（这是已知的小 bug）。**解决**：填完 key 直接点保存，不要中途切标签
3. **开了多个浏览器配置档**（比如 Chrome 的 Profile 1 / Profile 2）。key 只存在你当前这个 profile 的 localStorage 里，换 profile 就没了
4. **用了无痕模式**。无痕模式关掉浏览器 key 就没

排查步骤：

1. 打开 DevTools → Application → Local Storage
2. 找 `apiSettings` 这个键，应该是 `{"provider":"deepseek","apiKey":"sk-...","baseUrl":"...","model":"..."}` 这种 JSON
3. 看不到说明没保存成功；看到但 `apiKey` 是空，重新填

## 选了 Ollama 但连不上

**症状**：选了 Ollama（本地） provider，测试连接失败。

**检查清单**：

1. 本地 Ollama 跑起来了吗？`ollama serve` 看输出
2. 模型拉了吗？`ollama pull llama3` 之类的
3. Base URL 是 `http://localhost:11434` 吗？Ollama 默认就是这个，不要加 `/v1` 也不要加路径
4. API Key 字段 Ollama 不需要校验，但 UI 上不能为空 —— 随便填一串字符串就行

## 地图生成很慢 / 卡死

**症状**：进世界地图页，浏览器转圈几十秒甚至几分钟，DevTools 显示 `generateMap` 调用堆栈。

**正常范围**：

- 默认配置（20000 格 Voronoi）大概 3-5 秒
- Pangea 类大种子（整块大陆、复杂地形）可能 10-20 秒
- 超过 30 秒基本是有问题

**加速办法**：

1. 用更小的 `pointCount`（世界地图页右上角有调参）
2. 选更小的种子（别用 Pangea seed=42 这种已知很慢的）
3. 把 DevTools 打开看具体哪个阶段卡住：
   - Grid / Heightmap 慢 → Voronoi 计算量大
   - Climate 慢 → 气候模型
   - Roads 慢 → 路网寻路
   - States 慢 → 势力分布（已知有过 O(n²) 性能问题，main 已经修了 A*）
4. 控制台输入 `window.__PERF__` 看各阶段耗时

**如果完全卡死**（超过 1 分钟没反应）：F5 刷新。生成数据不会被保存（除非你显式 commit），重生成就行。

## 顾问按钮不响应

**症状**：点章节旁的 **顾问** 按钮，要么转圈没结果，要么报错。

**可能原因**：

1. **没配 OpenClaw**。这是最常见。OpenClaw 是单独的后台服务，仓库自带的部署里默认没装。看 [05-deployment.md](./05-deployment.md) 的"OpenClaw 怎么开"那一节
2. **配了但网关不通**。`curl http://127.0.0.1:18789` 看有没有响应
3. **gateway token 不对**。检查服务器 `.env` 里的 `OPENCLAW_GATEWAY_TOKEN`

如果你**不需要顾问功能**，忽略这个按钮就行。顾问是锦上添花，不是核心玩法。

## 移动端键盘遮挡输入框

**症状**：手机上点输入框，键盘弹起来后输入区被挡住，要手动滚页面才能看到自己打的字。

**缓解办法**：

1. 滚一下页面，输入框会自动浮到键盘上方
2. 暂时用横屏（更宽）
3. 如果是 `localhost`，用 Chrome DevTools 的设备模拟（`Ctrl+Shift+M`）调试

这个问题项目层面已经统一了视口高度策略（不再用 `100vh`），但部分旧浏览器上仍有表现差异。

## 浮层打不开 / 关闭后背景不能滚

**症状**：设置、世界书、顾问等弹窗偶尔打不开，或者关了弹窗之后背景页面滚不动。

**原因**：少数情况是弹层 z-index 被某个浮动按钮压住；多数情况是滚动锁没释放。

**临时处理**：

1. F5 刷新
2. 关掉再开一次
3. 实在不行清 localStorage 重来（**先备份**，见 [04-configuration.md](./04-configuration.md) 的"数据备份"）

## 横向滚动条 / 按钮被裁剪

**症状**：小屏设备（360px 宽以下）出现横向滚动条，关键按钮被切到屏幕外。

**项目已经按 360 / 768 / 1280 三档做了回归**，但部分第三方浏览器（小米、夸克之类）行为不一致。

**临时处理**：用 Chrome / Edge / Safari 主流浏览器。

## LLM 写得慢

**症状**：每次 AI 响应要等十几秒甚至几十秒。

**可能原因**：

1. **provider 慢**。DeepSeek / OpenAI 通常 2-5 秒；自建 Ollama 看硬件；Groq 标称快但限速
2. **prompt 长**。世界书条目很多、扫描深度设置很大，prompt 会很长。**解决**：进 **世界书 → 高级设置** 调小扫描深度
3. **流式输出没启用**。默认是流式（一边写一边返回），如果你看到的是整段一把出来，说明反代 buffer 了。看 [05-deployment.md](./05-deployment.md) 的"SSE 流被缓冲"那一节

## 切换世界后旧世界的数据还在

**症状**：体验页换了世界，状态栏、时间、角色名字都换了，但世界书编辑器里还能看到旧世界的条目。

**这是预期的**。世界书是**多本共存**的，切换世界只切换激活的那一本。所有世界书都还在。

要删除某本世界书：进 **世界书 → 高级设置**，在分组 / 条目管理里操作。

## 数据丢了 / 想恢复

**症状**：之前写的内容没了，或者世界书消失了。

**首先**：检查 localStorage（[04-configuration.md](./04-configuration.md) 的"数据备份"）。localStorage 一般不会自己清，但：

- 浏览器"清除浏览数据"会清掉
- 卸载浏览器会清掉
- 一些清理工具（CCleaner 之类）会清掉

**其次**：如果你之前按 [04-configuration.md](./04-configuration.md) 备份过 localStorage，把 JSON 粘回去就行。

**最后**：项目本身**没有云同步**。多设备之间不会自动同步。如果你要在多台设备上用，要么手 sync localStorage（DevTools 复制粘贴），要么部署自己的后端 + 数据库（这个超出说明书范围）。

## 想换浏览器 / 换电脑

1. 旧浏览器：DevTools 复制整个 localStorage 到 JSON 文件
2. 新浏览器：打开项目页面，DevTools 把 JSON 粘回去运行：

   ```js
   const data = /* 你的 JSON */;
   Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
   location.reload();
   ```

3. 重新填 API key（key 不在备份里 —— 上面那个 JSON 不包含敏感字段的意识是对的；如果你手贱把 key 也备份了，确保文件存在安全的地方）

## 还有问题

去 GitHub 仓库开 issue：[github.com/Recoletas/Wrias/issues](https://github.com/Recoletas/Wrias/issues)

issue 模板会问你：项目版本（`git rev-parse HEAD`）、Node 版本、浏览器、控制台报错。**别**把 API key 贴在 issue 里。
