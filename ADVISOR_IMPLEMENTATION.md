# OpenClaw 创作顾问功能 - 实施完成文档

**日期:** 2026-05-19
**项目:** Wrias (Vue 3 + Node.js)

---

## 功能概述

在诗歌灵感工坊（PoetryLab）和散文随笔（ProseEssay）页面中集成了 OpenClaw 智能体作为创作顾问，提供实时的创作建议和分析。

---

## 架构设计

### 后端部分

#### 1. 服务层 (services/openclawService.js)
- 使用 OpenClaw Gateway 的 OpenAI 兼容 HTTP API
- 从环境变量读取配置
- 实现 `getAdvice(context, question)` 函数
- 完整的错误处理

**关键配置:**
```javascript
OPENCLAW_BASE_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=（可选）
OPENCLAW_AGENT_ID=creative-advisor
```

#### 2. 路由层 (server/routes/openclaw.js)
- 端点: `POST /api/openclaw/advice`
- 请求体: `{ context, question }`
- 响应: `{ advice }`
- 参数验证和错误处理

#### 3. 主服务器 (server/index.js)
- 已注册 openclaw 路由
- 端口: 3001

---

### 前端部分

#### 1. 顾问面板组件 (src/components/AdvisorPanel.vue)

**功能特性:**
- ✅ 对话气泡样式展示建议
- ✅ 快捷提问按钮（4个预设问题）
- ✅ 自由文本输入
- ✅ 支持暗色/亮色主题
- ✅ 加载状态指示
- ✅ 自动滚动到底部

**Props:**
- `isOpen` - 控制面板显示/隐藏
- `onGetAdvice` - 获取建议的函数

**Events:**
- `close` - 关闭面板事件

#### 2. API 服务 (src/services/api.js)

新增函数:
```javascript
export async function getCreativeAdvice(context, question)
```

调用后端 `/api/openclaw/advice` 端点。

#### 3. 页面集成

**PoetryLab.vue**
- 右下角大型圆形悬浮按钮（64px，渐变背景）
- 自动收集上下文：
  - `currentMode` - 当前模式（writing/directing）
  - `nodes` - 所有节点（id, text, emotion, extraFields）
  - `edges` - 所有边（sourceId, targetId, type）
  - `outline` - 大纲数据
- 面板打开时自动触发分析

**ProseEssay.vue**
- 右下角大型圆形悬浮按钮（同上）
- 自动收集上下文：
  - `currentMode` - 当前模式
  - `cards` - 所有卡片（id, content, emotion, extraFields）
  - `edges` - 所有边
  - `outline` - 大纲数据（写作模式）
  - `timeline` - 时间轴数据（编导模式）
- 面板打开时自动触发分析

---

## 使用说明

### 启动步骤

1. **确保 OpenClaw Gateway 运行**
   ```bash
   # 默认端口 18789
   openclaw gateway start
   ```

2. **启动后端服务器**
   ```bash
   cd /home/claw/Wrias
   npm run server  # 或 node server/index.js
   ```

3. **启动前端开发服务器**
   ```bash
   npm run dev
   ```

4. **访问页面**
   - 诗歌灵感工坊: http://localhost:5173/poetry-lab
   - 散文随笔: http://localhost:5173/prose-essay

### 使用创作顾问

1. 点击右下角的圆形按钮打开顾问面板
2. 面板会自动分析当前作品并给出整体建议
3. 使用快捷提问按钮快速获取分析：
   - 分析当前节奏
   - 情绪分布
   - 结构建议
   - 续写灵感
4. 或在输入框中输入自定义问题
5. 按 `Ctrl+Enter` 或点击"发送"提交问题

---

## 测试

运行测试脚本:
```bash
cd /home/claw/Wrias
./test-advisor.sh
```

测试内容：
1. 后端服务运行状态
2. 环境变量配置
3. OpenClaw Gateway 连接
4. 后端路由响应
5. 前端组件存在性
6. API 函数导出
7. 页面集成状态

---

## 文件清单

### 新增文件

| 文件路径 | 说明 |
|---------|------|
| `src/components/AdvisorPanel.vue` | 顾问面板组件 |
| `services/openclawService.js` | OpenClaw 服务模块 |
| `.env` | 环境变量配置 |
| `test-advisor.sh` | 测试脚本 |

### 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src/services/api.js` | 添加 `getCreativeAdvice` 函数 |
| `src/pages/PoetryLab.vue` | 集成顾问按钮和面板 |
| `src/pages/ProseEssay.vue` | 集成顾问按钮和面板 |

### 已存在文件（无需修改）

| 文件路径 | 说明 |
|---------|------|
| `server/routes/openclaw.js` | OpenClaw 路由（已实现） |
| `server/index.js` | 主服务器（已注册路由） |

---

## 技术细节

### OpenClaw API 调用格式

```javascript
POST /v1/chat/completions
Authorization: Bearer {token}

{
  "model": "openclaw/creative-advisor",
  "messages": [
    {
      "role": "system",
      "content": "你是一位资深文学创作顾问..."
    },
    {
      "role": "user",
      "content": "当前创作上下文：\n{context}\n\n用户的问题：{question}"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 2000
}
```

### 上下文数据结构

**PoetryLab:**
```javascript
{
  mode: "writing" | "directing",
  nodes: [
    {
      id: string,
      text: string,
      emotion: string,
      extraFields: object
    }
  ],
  edges: [
    {
      sourceId: string,
      targetId: string,
      type: string
    }
  ],
  outline: array
}
```

**ProseEssay:**
```javascript
{
  mode: "writing" | "directing",
  cards: [
    {
      id: string,
      content: string,
      emotion: string,
      extraFields: object
    }
  ],
  edges: [
    {
      sourceId: string,
      targetId: string,
      type: string
    }
  ],
  outline: array,
  timeline: array | null  // 仅编导模式
}
```

---

## 故障排查

### 问题: 获取建议失败

**可能原因:**
1. OpenClaw Gateway 未运行
2. 端口配置错误（默认 18789）
3. Agent ID 不正确
4. Token 认证失败

**解决方法:**
```bash
# 检查 Gateway 状态
curl http://localhost:18789/v1/models

# 检查环境变量
cat .env | grep OPENCLAW

# 查看后端日志
npm run server
```

### 问题: 悬浮按钮不显示

**可能原因:**
1. 组件导入失败
2. 样式冲突
3. z-index 层级问题

**解决方法:**
- 打开浏览器控制台检查错误
- 检查 `src/pages/*.vue` 中的导入语句
- 检查样式是否被覆盖

---

## 后续优化建议

1. **性能优化**
   - 上下文数据压缩
   - 请求防抖
   - 响应缓存

2. **功能增强**
   - 支持对话历史
   - 支持导出建议
   - 支持多轮对话

3. **用户体验**
   - 添加加载动画
   - 添加错误提示
   - 支持快捷键

---

## 许可与致谢

- OpenClaw: https://github.com/openclaw/openclaw
- Vue 3: https://vuejs.org
- 本项目遵循相关开源协议

---

**文档版本:** 1.0
**最后更新:** 2026-05-19