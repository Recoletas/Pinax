# 详细配置

## Provider 怎么选

设置里 AI API 标签能选八家 provider，列一下特点和适用场景：

| Provider | 适合 | Base URL | 备注 |
| --- | --- | --- | --- |
| **DeepSeek** | 性价比首选，中文友好 | `https://api.deepseek.com/v1` | 走 OpenAI 兼容协议，注册快，便宜 |
| **OpenAI** | 通用 | `https://api.openai.com/v1` | 要科学上网 |
| **SiliconFlow** | 国内，便宜 | `https://api.siliconflow.cn/v1` | 多模型托管 |
| **OpenRouter** | 一个 key 试多家模型 | `https://openrouter.ai/api/v1` | 按 token 计费 |
| **Ollama（本地）** | 完全离线、零费用 | `http://localhost:11434` | 需要本地跑 Ollama，模型质量看硬件 |
| **Groq** | 速度极快 | `https://api.groq.com/openai/v1` | 限速严，长文容易截断 |
| **Moonshot（月之暗面）** | 中文长文 | `https://api.moonshot.cn/v1` | Kimi 系列 |
| **自定义** | 其他兼容 OpenAI 协议的 | 自己填 | 比如自建网关 |

**新手建议**：先用 **DeepSeek** 把项目跑通，再根据需要换。

**Base URL** 那行一般情况下不要手填——切 provider 会自动填。什么时候要手填？比如你用反向代理、镜像站、企业内网网关。

**模型**那行也是切 provider 会自动给个默认（比如 DeepSeek 给 `deepseek-v4-flash`），想换别的就自己输。

## Mem0 怎么开

Mem0 是跨会话的偏好记忆服务。要用：

1. 去 [mem0.ai](https://mem0.ai) 注册账号，拿到 API key（`m0-...` 开头）
2. 回到项目 **设置 → 记忆系统** 标签
3. 填 Mem0 API Key
4. Host 不用动，默认 `https://api.mem0.ai`
5. 点 **测试记忆连接**，看到绿色成功就 OK
6. 保存

之后 AI 写作时识别到的"作者偏好"会进 **记忆候选池**，采纳后写进 Mem0。

> Mem0 key 跟 LLM key 一样，只存在你自己浏览器的 `localStorage` 里，服务器不落盘。

## OpenClaw 怎么开

OpenClaw 是顾问 / 主动检查功能依赖的后台服务。普通体验用不到。

1. 部署一个 OpenClaw 网关（参考 OpenClaw 官方文档）
2. 在服务器的 `.env` 里配：

   ```
   OPENCLAW_BASE_URL=http://127.0.0.1:18789
   OPENCLAW_GATEWAY_TOKEN=<你的 token>
   OPENCLAW_AGENT_ID=main
   ```

3. 重启项目后端
4. 章节页 / 写作页里点 **顾问**，应该能正常返回体检结果

不配 OpenClaw 不会影响其他功能，只是顾问按钮会报"网关不可达"。

## localStorage 键都在存什么

按"什么场景下你会想动它"分组，不是按字母。

> **警告**：手动改 localStorage 可能让数据不一致。下面这些**只是**让你排查问题时知道去哪儿看，不是让你没事去改。

### AI / LLM 配置

| 键名 | 什么时候会想动它 |
| --- | --- |
| `apiSettings` | 切 provider、换 model、debug "API key 配错了" |

### Mem0 / 记忆系统

| 键名 | 什么时候会想动它 |
| --- | --- |
| `mem0_settings` | 换 Mem0 key 或 host |
| `preference_user_id` | 想换匿名身份（默认自动生成） |
| `mem0_sync_state` | 排查 "记忆同步卡住了" |
| `mem0_cache` | 排查 "为什么我看到的是旧记忆" |

### 通用偏好

| 键名 | 什么时候会想动它 |
| --- | --- |
| `gameSettings` | 重置语言 / 文字速度 / 自动存档 |

### 小说写作

| 键名 | 什么时候会想动它 |
| --- | --- |
| `writing_books` | 整本导出 / 备份 |
| `writing_character` | 当前主角卡 |
| `writing_time` | 当前剧情内时间 |
| `writing_worldmap` | 当前世界的世界书引用 |
| `writing_scenes` / `writing_activities` / `writing_characters` / `writing_timelines` / `writing_world_settings` | 当前会话的运行时状态 |
| `writing_notes` | 写作时的速记 |

### 散文 / 卡片画布

| 键名 | 什么时候会想动它 |
| --- | --- |
| `prose_cards_v1` | 节点数据 |
| `prose_edges_v1` | 节点之间的关系 |
| `prose_outline_v1` | 大纲 |
| `prose_timeline_v1` | 时间轴排序 |
| `prose_piles_v1` / `prose_commits_v1` / `prose_branches_v1` | 堆叠 / 提交 / 分支历史 |
| `prose_image_library` | 画布里引用的图 |

### 诗歌工作坊

`poetry_idea_tree_v2` / `poetry_idea_positions_v2` / `poetry_adapt_profile_v2` / `poetry_graph_edges_v1` / `poetry_imagery_groups_v1` / `poetry_snapshots_v1` / `poetry_image_library_v1` —— 备用，目前主要用在散文画布的早期形态。

### 叙事素材 / 分镜

| 键名 | 什么时候会想动它 |
| --- | --- |
| `narrative_assets_v1` | 导出所有素材 |
| `memory_candidates_v1` | 清空候选池（"AI 又把这条推给我了"） |
| `storyboard_documents_v1` | 章节分镜 |
| `storyboard_snapshots_v1` | 分镜的历史快照 |

### 图片生成

| 键名 | 什么时候会想动它 |
| --- | --- |
| `image_model_configs` | 多 provider 生图配置 |

### 世界 / 地理

| 键名 | 什么时候会想动它 |
| --- | --- |
| `geography_data` | 整张世界地图数据，体积大 |
| `world_nodes` | 世界树节点 |
| `characters` | 角色卡合集 |

## 数据备份

整个项目的用户数据全在 `localStorage` 里。想备份：

1. 打开 DevTools（F12）→ Application → Local Storage → 你的域名
2. 全选，导出 JSON
3. 想恢复就把 JSON 粘回去

或者直接复制整个 localStorage 内容到剪贴板（DevTools 控制台）：

```js
copy(JSON.stringify(localStorage))
```
