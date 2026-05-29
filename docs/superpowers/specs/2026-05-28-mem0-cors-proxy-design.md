# Mem0 CORS 代理修复设计

## 背景

记忆候选确认后同步到 Mem0 失败，设置界面测试连接却正常。根因：测试走服务端代理（`POST /api/chat/mem0/test`），同步走浏览器直连（`useMem0.js` → `fetch('https://api.mem0.ai/v1/memories')`），被 CORS 拦截。

## 目标

让 `useMem0.js` 的所有 Mem0 API 调用通过服务端代理，与设置测试保持一致的架构。

## 设计

### 服务端：3 个代理端点

**文件**：`server/routes/chat.js`

复用已有工具：`loadSecrets()`、`normalizeMem0ApiUrl()`、`DEFAULT_MEM0_HOST`。

| 端点 | HTTP | 转发 | 说明 |
|---|---|---|---|
| `/api/chat/mem0/memories` | POST | `POST {apiUrl}/memories` | 写入记忆 |
| `/api/chat/mem0/search` | POST | `GET {apiUrl}/memories?query=...` | 查询记忆 |
| `/api/chat/mem0/delete` | POST | `DELETE {apiUrl}/memories/{memoryId}` | 删除记忆 |

每个端点：
- 从 `req.body` 接收 `{ apiKey?, host?, userId, ... }`
- 从 env/secrets 解析实际凭据（优先级：body > env > secrets）
- 返回 `{ success: true, data }` 或 `{ success: false, error }`

### 客户端：useMem0.js 改走服务端

**文件**：`src/composables/useMem0.js`

三个方法改为 POST 到本地服务端：

- `storeMemory()` → `POST /api/chat/mem0/memories`
- `searchMemories()` → `POST /api/chat/mem0/search`
- `deleteMemory()` → `POST /api/chat/mem0/delete`

body 中透传 `apiKey` 和 `host`（供服务端回退使用），实际凭据由服务端优先从自身 secrets 解析。

### 不改的部分

- `server/services/memoryService.js` — SDK 客户端不变
- `src/services/memorySync.js` — 调用层不变
- `src/components/Settings.vue` — 测试连接已通过服务端
- `src/components/MemoryIndicator.vue` — 调用层不变

## 验证

1. 设置界面测试连接仍然成功
2. 记忆候选确认后 syncStatus 变为 `synced`（非 `failed`）
3. 浏览器控制台无 CORS 错误
4. 服务端控制台无 mem0 调用报错
