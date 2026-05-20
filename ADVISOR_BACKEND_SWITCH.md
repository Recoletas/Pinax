# 创作顾问后端切换说明

项目支持两种后端作为创作顾问的 AI 服务，可在顾问面板中切换。

## 后端选项

### 1. AI (默认推荐)
使用项目已配置的 AI API（OpenAI/Azure）。

**优点：**
- ✅ 稳定可靠
- ✅ 即开即用
- ✅ 速度快
- ✅ 成本可控

### 2. OpenClaw Gateway
使用本地运行的 OpenClaw Gateway 作为 AI 服务。

**优点：**
- ✅ 完全本地化
- ✅ 可自定义 Agent
- ✅ 离线可用（如果模型在本地）

**缺点：**
- ⚠️ 需要安装和配置 OpenClaw
- ⚠️ 需要 Gateway 运行
- ⚠️ WebSocket 连接可能不稳定

## 切换方法

### UI 切换

1. 打开 PoetryLab 或 ProseEssay
2. 点击右下角紫色按钮打开顾问面板
3. 在面板标题栏右侧有两个切换按钮：
   - **AI** - 使用已配置的 AI API
   - **OpenClaw** - 使用 OpenClaw Gateway
4. 点击按钮即可切换

### 环境变量配置

```env
# OpenClaw Gateway 配置（仅 OpenClaw 模式需要）
OPENCLAW_BASE_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=       # 如果 Gateway 开启了认证
OPENCLAW_AGENT_ID=main
```

## 技术实现

### 前端（AdvisorPanel.vue）

```javascript
// 两个 prop
const props = defineProps({
  onGetAdvice: Function,      // AI 模式：使用现有聊天 API
  contextProvider: Function   // OpenClaw 模式：提供上下文
})

// 内部处理
async function askQuestion(question) {
  if (backend.value === 'openai') {
    // 调用 onGetAdvice（使用 sendChat）
    advice = await props.onGetAdvice(question)
  } else {
    // 调用后端 OpenClaw 端点
    const context = await props.contextProvider()
    const response = await axios.post('/api/openclaw/advice', { context, question })
    advice = response.data.advice
  }
}
```

### 后端

- **OpenAI 模式**：前端直接调用 `/api/chat/chat`
- **OpenClaw 模式**：前端调用 `/api/openclaw/advice`，后端通过 WebSocket 连接 Gateway

## 文件结构

```
Wrias/
├── services/
│   ├── openclawService.js     # OpenClaw WebSocket 调用（后端用）
│   └── api.js                 # 项目 AI API
├── src/
│   ├── pages/
│   │   ├── PoetryLab.vue     # 诗歌工坊
│   │   └── ProseEssay.vue    # 散文随笔
│   └── components/
│       └── AdvisorPanel.vue  # 顾问面板（含切换按钮）
└── server/
    └── routes/
        └── openclaw.js       # OpenClaw API 端点
```

## 使用示例

### PoetryLab

```vue
<AdvisorPanel
  :isOpen="advisorOpen"
  :onGetAdvice="handleGetAdviceAI"      // AI 模式函数
  :contextProvider="collectPoetryContext" // OpenClaw 上下文
  @close="closeAdvisor"
/>
```

### ProseEssay

```vue
<AdvisorPanel
  :isOpen="advisorOpen"
  :onGetAdvice="handleGetAdviceAI"
  :contextProvider="collectProseContext"
  @close="closeAdvisor"
/>
```

## 推荐

**日常使用：** 点击 **AI** 按钮（稳定可靠）

**本地调试：** 点击 **OpenClaw** 按钮（需要 Gateway 运行）

如需帮助，查看项目文档或提交 Issue。