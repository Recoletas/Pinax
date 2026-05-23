# 小说体验模块

> 本模块是框架的核心场景，定位为"类酒馆但导向写作辅助"的体验工具。

## 1. 与酒馆的定位差异

| 维度 | 酒馆 (SillyTavern) | 本模块 |
|------|-------------------|--------|
| **核心场景** | 与 AI 角色对话/角色扮演 | 模拟小说情节、写作辅助 |
| **用户角色** | 扮演故事中的角色 | 可以扮演角色，也可以旁观 |
| **叙事方式** | 第一人称对话为主 | 第三人称叙事 + 第一人称对话混合 |
| **输出目标** | 有趣的对话体验 | 可沉淀到写作的叙事片段 |
| **界面风格** | 功能常驻（背包/任务等始终可见） | 平时简洁，事件触发才显示对应机制 |
| **机制展示** | 所有功能常驻显示 | 事件驱动，平时隐藏 |

## 2. 世界书系统

世界书（WorldBook）是体验的核心驱动引擎，参考 SillyTavern 的 entries 结构。

### 2.1 数据结构

```
WorldBook
├── id, name, description, author, version
├── settings: { scanDepth, tokenBudget, recursiveScanning }
└── entries: WorldEntry[]

WorldEntry
├── id, keys[], keysSecondary[], content, name
├── type: location | character | item | lore | quest | event | general
├── injection: { mode, probability, cooldown, depth, excludeRecursion, group }
├── relations: { tags, locations, characters, events }
└── metadata
```

### 2.2 与 SillyTavern 的兼容性

字段一一映射，可互相导入导出：
- `key` → `keys`
- `keysecondary` → `keysSecondary`
- `comment` → `name`
- `selective/constant` → `injection.mode`

### 2.3 导入方式

| 方式 | 说明 | 优先级 |
|------|------|--------|
| SillyTavern 导入 | 上传 .json，直接解析 | P0 |
| 小说文本 AI 导入 | 上传 TXT/MD，AI 提取实体生成世界书 | P1 |
| AI 生成草案 | 输入 8 字以上说明，AI 生成条目 | P1 |

## 3. 事件驱动机制

核心设计原则：**机制存在但平时隐藏，叙事触发时才显示对应面板。**

| 触发场景 | 显示面板 | 面板内容 |
|---------|---------|---------|
| 战斗中 | 战斗面板 | 回合制操作：攻击/防御/技能/道具/逃跑 |
| 交易时 | 交易面板 | 物品列表、金币交换 |
| 任务接取 | 任务面板 | 任务描述、目标、奖励 |
| 遭遇 NPC | 对话面板 | 角色对话、历史关系 |
| 探索发现 | 发现面板 | 地点描述、出口选项 |

## 4. 分层提示词架构

```
Layer 1: 系统提示词 (System Prompt)
  └─ 叙事者身份定义 + 叙事格式规则（*动作* "对话"）+ 风格指导

Layer 2: 世界书注入 (WorldBook Injection)
  └─ 当前位置/角色相关条目（关键词匹配）+ 常量条目 + 分组条目

Layer 3: 情境上下文 (Situation Context)
  └─ 当前角色状态 + 时间/年代背景 + 最近活动 + 情绪氛围引导

Layer 4: Few-shot 示例（可选）
  └─ 2-3 个高质量叙事片段，根据场景类型动态选择
```

## 5. 叙事风格预设

| 预设 | 特点 | 适用场景 |
|------|------|---------|
| 文学性强 | 注重文笔、环境描写、内心刻画 | 严肃向小说、历史 |
| 流畅叙事 | 节奏紧凑、可读性强 | 商业向小说、网文 |
| 对话丰富 | 人物对话推动情节 | 都市、校园 |
| 简洁白描 | 少修饰、重情节 | 快节奏、悬疑 |

## 6. 后续规划

详见 [PLAN.md](../PLAN.md) 阶段目标：

- **M1-M2：** 世界书编辑器、导入导出、SillyTavern 兼容
- **M3：** 分层提示词实现、上下文压缩
- **M4：** 角色卡系统
- **M5：** 顾问功能、细节打磨