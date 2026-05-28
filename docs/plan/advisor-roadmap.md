# 智能顾问系统现状评估与演进路线

## 一、当前架构总览

```
页面(Writing/Experience/Notes/ProseEssay)
  → useAdvisor composable (状态管理)
    → advisorTaskService.js (客户端API)
      → POST /api/advisor/task
        → server/routes/advisor.js
          → server/services/advisorTaskService.js (响应构建)
            → server/services/openclawService.js (LLM调用)
              → OpenClaw Gateway (http://127.0.0.1:18789)
```

统一调用链已建立，架构清晰。

---

## 二、已完善的部分

| 模块 | 状态 | 说明 |
|------|------|------|
| 调用链统一 | ✅ | 所有页面走 `/api/advisor/task`，单一入口 |
| 任务类型体系 | ✅ | 5 种结构化任务：fix.selection / fix.paragraph / close.thread / review.chapter / continue.light |
| 结构化返回协议 | ✅ | task / mode / summary / replacement / targetRange / baseText / stalePolicy / issues |
| 结果应用（Writing） | ✅ | 完整的替换流程 + 过期检测（baseText 比对） |
| 单测覆盖 | ✅ | useAdvisor / openclawService / advisorTaskService / serverAdvisorTaskService / advisorResultApplier 均有测试 |
| Markdown 渲染 | ✅ | AdvisorPanel 用 marked 渲染顾问回复 |

---

## 三、现存问题

### 3.1 遗留代码未清理

| 文件 | 问题 |
|------|------|
| `server/routes/openclaw.js` | ✅ 已删除 |
| `server/index.js` | ✅ 已移除 openclaw 挂载 |
| `src/services/api.js` | ✅ `getCreativeAdvice()` 已删除（零调用方） |

**风险**：新代码可能误用旧路径，绕过结构化任务协议。

### 3.2 Prompt Registry 未接入

`src/services/promptRegistry.js` 定义了 4 套领域专属 prompt：

| 模式 | Prompt 焦点 |
|------|------------|
| `poetry` | 意象密度、音韵节奏、留白 |
| `prose` | 叙事弧线、镜头语言、意象 |
| `novel` | 人物弧光、冲突设计、节奏 |
| `notes` | 知识关联、结构化、索引 |

✅ **已接入**：`openclawService.js` 的 `getAdvice()` 现在根据 `taskMeta.mode` 调用 `getAdvisorPrompt(mode)` 获取领域 system prompt。mode 通过页面 → useAdvisor → advisorTaskService → API → server 完整传递。

### 3.3 各页面集成深度不均

| 页面 | 快速操作 | 结构化上下文 | 结果应用 | 领域 Prompt |
|------|---------|-------------|---------|------------|
| Writing.vue | ✅ 5个结构化 action | ✅ 完整（选区/段落/上下文窗口/大纲） | ✅ 替换+光标定位 | ✅ prose |
| Experience.vue | ✅ 结构化 action（review.chapter/fix.selection/continue.light） | ⚠️ 基础（20条消息+元数据） | ❌ 无 | ✅ novel |
| Notes.vue | ✅ 结构化 action（review.chapter/fix.selection/continue.light） | ⚠️ 基础 | ❌ 无 | ✅ notes |
| ProseEssay.vue | ✅ 结构化 action（review.chapter/fix.selection/continue.light） | ⚠️ 基础（cards+timeline） | ❌ 无 | ✅ prose |

### 3.4 Proactive Advisor 未完成

`src/composables/useProactiveAdvisor.js` 已编写但：
- 未被任何页面 import
- 依赖的 `/api/openclaw/proactive-check` 端点不存在于 server routes
- 后端无对应的分析逻辑

### 3.5 对话上下文断裂

`useAdvisor.js` 的 `askAdvisor()` 每次调用都是独立请求，不携带历史消息。用户追问"刚才那个建议具体怎么改"时，顾问无法关联上文。

### 3.6 缺少流式输出

当前 `getAdvice()` 用标准 `chat/completions` 调用，等待完整响应后一次性返回。长回复（如章节体检）等待时间可达 10-30 秒，用户无反馈。

### 3.7 错误处理薄弱

- OpenClaw 不可达时，客户端只显示通用错误消息
- 无超时重试机制
- JSON 解析失败时的 fallback 只返回原始文本，无降级提示

---

## 四、演进路线

### Phase 1: 清理 + 补齐（低风险，高收益）✅ 已完成

**1.1 清理遗留路由** ✅
- ✅ 删除 `server/routes/openclaw.js`
- ✅ 从 `server/index.js` 移除 `app.use('/api/openclaw', ...)`
- ✅ 删除 `api.js` 中 `getCreativeAdvice()`（零调用方，直接删除）

**1.2 接入 Prompt Registry** ✅
- ✅ `openclawService.js` 的 `getAdvice()` 从 `taskMeta.mode` 取 mode
- ✅ 调用 `getAdvisorPrompt(mode)` 获取领域 system prompt（服务端直接 import 前端 promptRegistry）
- ✅ mode 通过页面 → useAdvisor → advisorTaskService → API → server 完整传递

**1.3 Experience / Notes / ProseEssay 升级为结构化 action** ✅
- ✅ 三个页面的 quick questions 改为 `{ label, question, scope, taskType }` 格式
- ✅ `handleAskAdvisor` 统一加 string fallback
- ✅ mode 分别为 novel / notes / prose

### Phase 2: 智能化提升（中风险，高价值）

**2.1 多轮对话上下文**
- `useAdvisor.js` 维护 `advisorMessages` 数组
- `askAdvisor()` 将最近 N 轮消息作为上下文传入后端
- 后端 `getAdvice()` 将历史消息拼入 `messages` 数组（OpenAI 多轮格式）
- 控制窗口大小（最近 6 轮），避免 token 超限

**2.2 流式输出**
- 后端 `/api/advisor/task` 支持 SSE（`stream: true`）
- 前端用 `fetch` + `ReadableStream` 或 `EventSource` 逐 token 显示
- 结构化结果（JSON）在流结束后统一解析

**2.3 错误处理增强**
- OpenClaw 不可达 → 返回离线提示 + 本地 fallback（如语法检查用正则）
- 超时 → 自动重试一次，仍失败则返回部分内容
- JSON 解析失败 → 将原始文本作为纯建议返回，附带"结构化结果不可用"标记

### Phase 3: 主动顾问（高风险，探索性）

**3.1 完成 Proactive Advisor**
- 补全 `/api/advisor/proactive-check` 端点
- 将 `useProactiveAdvisor.js` 接入 Writing.vue
- 触发条件：用户停止输入 3 秒 + 内容 > 200 字
- 告警级别：info（建议）→ warning（提醒）→ alert（必须处理）

**3.2 轻量本地分析**
- 在发送远程请求前，先做本地模式匹配：
  - 时间词冲突（"昨天" + "明天" 同段落）
  - 段落过长（> 500 字无分段）
  - 重复用词（同义词高频出现）
- 本地命中才触发远程分析，减少无效调用

### Phase 4: 深度集成（长期）

**4.1 Writing.vue 扩展任务类型**
- `advisor.plot.hole` — 检测剧情漏洞
- `advisor.character.voice` — 角色语言一致性检查
- `advisor.pacing.chart` — 节奏分析（长短句分布可视化）

**4.2 结果应用扩展**
- Experience.vue：将顾问建议作为续写 prompt 的前置条件
- ProseEssay.vue：将建议转化为卡片操作（拆分/合并/重排）
- Notes.vue：将关联发现自动创建为新的笔记链接

**4.3 顾问画像可配置**
- 用户自定义顾问风格（严格/宽松/学术/口语）
- 可调节 temperature / max_tokens
- 可选择不同 OpenClaw agent（多 agent 切换）

---

## 五、优先级建议

| 优先级 | 项目 | 工作量 | 收益 |
|--------|------|--------|------|
| P0 | 1.1 清理遗留路由 | 0.5h | 消除架构混乱 |
| P0 | 1.2 接入 Prompt Registry | 2h | 顾问回复质量显著提升 |
| P1 | 1.3 结构化 action 升级 | 3h | 体验对齐，减少维护成本 |
| P1 | 2.1 多轮对话上下文 | 4h | 顾问可用性质变 |
| P2 | 2.2 流式输出 | 6h | 体验优化 |
| P2 | 2.3 错误处理增强 | 3h | 健壮性 |
| P3 | 3.x 主动顾问 | 8h+ | 探索性，需验证用户接受度 |

---

## 六、关键文件索引

| 层级 | 文件 | 职责 |
|------|------|------|
| 组件 | `src/components/AdvisorPanel.vue` | UI 面板 |
| 组合式 | `src/composables/useAdvisor.js` | 客户端状态 |
| 组合式 | `src/composables/useProactiveAdvisor.js` | 主动分析（未接入） |
| 服务 | `src/services/advisorTaskService.js` | 客户端 API |
| 服务 | `src/services/advisorResultApplier.js` | 结果应用 |
| 服务 | `src/services/promptRegistry.js` | 领域 Prompt |
| 路由 | `server/routes/advisor.js` | `/api/advisor/task` |
| 路由 | `server/routes/openclaw.js` | 遗留，待删除 |
| 服务 | `server/services/advisorTaskService.js` | 响应构建 |
| 服务 | `server/services/openclawService.js` | OpenClaw 集成 |
| 文档 | `docs/plan/current-execution-plan.md` | 当前执行边界与 UI 收口要求 |
