# 开放世界文字游戏框架

基于 SillyTavern 提示词工程设计的文字冒险游戏框架，支持前端界面和后端服务。

## 项目结构

```
text-game-framework/
├── package.json              # 项目配置 (Vue 3 + Express)
├── vite.config.js            # Vite 构建配置
├── jsconfig.json             # JS 项目配置
│
├── public/                   # 静态资源
│   └── index.html            # HTML 入口
│
├── src/                      # 前端源码 (Vue 3)
│   ├── main.js               # 入口文件
│   ├── App.vue               # 根组件
│   ├── styles/
│   │   └── main.css          # 全局样式
│   ├── components/           # Vue 组件
│   │   ├── GamePanel.vue     # 故事输出区
│   │   ├── InputArea.vue     # 玩家输入区
│   │   ├── StatusBar.vue     # 状态栏
│   │   ├── Inventory.vue     # 背包
│   │   ├── QuestLog.vue      # 任务日志
│   │   ├── WorldMap.vue      # 世界地图
│   │   └── Settings.vue      # 设置面板
│   ├── stores/               # Pinia 状态管理
│   │   └── gameStore.js
│   └── services/             # API 服务
│       └── api.js
│
├── server/                   # 后端源码 (Express)
│   ├── index.js              # 服务器入口
│   ├── routes/               # API 路由
│   │   ├── game.js           # 游戏 API
│   │   ├── events.js         # 事件 API
│   │   └── config.js         # 配置 API
│   ├── services/             # 核心服务
│   │   ├── eventEngine.js    # 事件引擎
│   │   ├── timeSystem.js     # 时间系统
│   │   └── stateManager.js   # 状态管理
│   └── data/                 # 游戏数据
│       ├── worlds/           # 世界设定
│       │   ├── 仙侠世界/
│       │   ├── 科幻星际/
│       │   ├── 都市生活/
│       │   ├── 奇幻大陆/
│       │   └── 末日生存/
│       └── events/           # 事件库
│           ├── 时间类.json
│           ├── 探索类.json
│           ├── 战斗类.json
│           ├── 社交类.json
│           ├── 生存类.json
│           ├── 技能类.json
│           ├── 随机类.json
│           └── 剧情类.json
│
├── SYSTEM_PROMPT.md          # AI 系统提示词
├── game-config.json          # 游戏配置 (旧版)
└── example-world.md          # 世界设定示例
```

## 快速开始

### 1. 安装依赖

```bash
cd text-game-framework
npm install
```

### 2. 启动服务器

```bash
# 终端1: 启动后端 (端口 3001)
node server/index.js

# 终端2: 启动前端 (端口 5173)
npm run dev
```

### 3. 开始游戏

访问 http://localhost:5173，选择世界后即可开始游戏。

---

## 功能说明

### 世界系统

| 世界 | 风格 | 核心机制 |
|------|------|---------|
| 仙侠世界 | 古风玄幻 | 修仙、法宝、丹药、门派 |
| 科幻星际 | 未来科技 | 飞船、基因、机械义体 |
| 都市生活 | 现代都市 | 职场、社交、投资 |
| 奇幻大陆 | 西方奇幻 | 魔法、龙、佣兵公会 |
| 末日生存 | 末日废土 |丧尸、资源、避难所 |

### 关键词触发系统

玩家输入文字时，系统会根据关键词触发对应事件：

| 类型 | 关键词 | 效果 |
|------|--------|------|
| 时间 | 时间流转、休息、睡一晚 | 推进游戏时间 |
| 探索 | 探索、调查、搜索 | 搜索当前区域 |
| 战斗 | 战斗、攻击、打怪 | 进入战斗 |
| 社交 | 交谈、交易、打听 | 与NPC互动 |
| 系统 | 状态、背包、帮助 | 显示游戏信息 |

### 时间推进规则

- 每 **3个行动** 自动推进一个时段
- 时段顺序：凌晨 → 清晨 → 早晨 → 上午 → 中午 → 下午 → 傍晚 → 夜晚 → 深夜
- 休息/睡眠推进到次日早晨，并恢复全部精力

---

## API 文档

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/config/worlds` | 获取世界列表 |
| GET | `/api/config/worlds/:id` | 获取世界详情 |
| POST | `/api/game/start` | 开始新游戏 |
| POST | `/api/game/action` | 发送玩家行动 |
| GET | `/api/game/state/:gameId` | 获取游戏状态 |
| GET | `/api/events/categories` | 获取事件分类 |

### 开始游戏

```bash
curl -X POST http://localhost:3001/api/game/start \
  -H "Content-Type: application/json" \
  -d '{"worldId":"仙侠世界"}'
```

### 发送行动

```bash
curl -X POST http://localhost:3001/api/game/action \
  -H "Content-Type: application/json" \
  -d '{"gameId":"你的游戏ID","action":"时间流转"}'
```

---

## 添加新世界

1. 在 `server/data/worlds/` 下创建新文件夹
2. 添加 `world.json` 文件
3. 配置地点、NPC、敌人、随机事件等

示例结构：

```json
{
  "config": {
    "name": "新世界名称",
    "description": "世界描述",
    "tags": ["标签1", "标签2"],
    "defaultLocation": "起始地点"
  },
  "locations": {
    "地点ID": {
      "name": "地点名称",
      "description": "地点描述",
      "exits": {"north": "另一个地点"},
      "npcs": ["NPC_ID"]
    }
  },
  "npcs": {
    "NPC_ID": {
      "name": "NPC名称",
      "location": "所在地点",
      "dialogue": {"default": "默认对话"}
    }
  },
  "enemies": [],
  "randomEncounters": []
}
```

---

## 添加新事件

在 `server/data/events/` 下添加 JSON 文件：

```json
[
  {
    "id": "event_id",
    "name": "事件名称",
    "keywords": ["触发关键词1", "触发关键词2"],
    "type": "exploration",
    "description": "事件描述",
    "effects": [
      {"type": "give_item", "item": "物品名", "count": 1}
    ],
    "narrative": "叙述文本..."
  }
]
```

事件效果类型：
- `advance_time` - 推进时间
- `restore_vitality` - 恢复生命
- `give_item` - 给予物品
- `set_flag` - 设置标志
- `start_battle` - 开始战斗
- `deal_damage` - 造成伤害

---

## 开发指南

### 前端组件

| 组件 | 功能 |
|------|------|
| GamePanel | 显示游戏故事和叙述 |
| InputArea | 玩家输入和快捷按钮 |
| StatusBar | 显示时间、地点、属性 |
| Inventory | 背包物品管理 |
| QuestLog | 任务列表 |
| WorldMap | 已探索地点 |

### 后端服务

| 服务 | 功能 |
|------|------|
| eventEngine | 关键词解析和事件触发 |
| timeSystem | 时间推进和时段管理 |
| stateManager | 游戏状态存储和更新 |

### 状态结构

```javascript
{
  time: { day: 1, period: '早晨' },
  player: { vitality: 100, mood: 80, money: 100 },
  inventory: [],
  quests: [],
  flags: {},
  worldState: { currentLocation: '地点' },
  npcRelations: {},
  discoveredPlaces: []
}
```

---

## 技术栈

- **前端**: Vue 3 + Vite + Pinia + Axios
- **后端**: Express.js + Node.js
- **样式**: CSS Variables + Flexbox

---

## 许可证

MIT