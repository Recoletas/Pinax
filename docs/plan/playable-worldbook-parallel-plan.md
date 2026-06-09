# 可玩的世界书并行执行计划

> 目标：下一轮不要继续堆种子世界数量，也不要只换文案。主线改成“一个主推可玩世界 + 更有仪式感的入口 + 玩到写闭环”。

## 1. 产品修正

上一轮方向成立，但执行要收窄：

- 首页/快速导入不要同时主推太多世界。短期只推 1 个旗舰世界：`边境王国 · 雾潮暮湾`。
- `都市异闻`、`近未来殖民地` 和 RPG 旧世界放进“更多题材 / 归档”，不抢首屏。
- UI 不再沿用旧表单列表。下一轮入口要像“今晚进入一个世界”：
  - 世界封面卡。
  - 开场困境。
  - 3 个可点行动钩子。
  - 势力/地点/事件的可视化摘要。
  - 明确的下一步：开始冒险 -> 写成我的版本 -> 整理成分镜。

## 2. 并行分工

### 线程 A — Codex 主做

范围：工程主链路和高冲突文件。其他人不要同时改这些文件。

Owner：Codex

主要文件：

- `src/pages/WorldBookQuickImport.vue`
- `src/pages/Experience.vue`
- `src/stores/gameStore.js`
- `src/components/GamePanel.vue`
- `src/services/worldbookContextBuilder.js`
- `src/services/generation*`
- `src/components/worldbook/*`
- 相关测试文件

交付顺序：

1. 快速导入入口重构为“单主推世界”。
   - 首屏只展示 `边境王国 · 雾潮暮湾`。
   - 其他世界折叠到“更多题材”。
   - 增加封面式 hero、开局困境、3 个行动钩子。
   - 保留旧导入路径：预设导入、小说文本导入、说明驱动 AI 生成。
2. 体验页开局变得更像冒险入口。
   - 导入后显示“进入这个世界”的开场卡。
   - 第一轮输入前提供 3 个行动建议。
   - 不改路由、store key、localStorage key。
3. Stage 3a：GM 轻状态。
   - 复用 `gameStore`，新增最小字段。
   - 不启用第二套 `experienceStore` 状态。
   - 加 `StatusBar` / `QuestLog` / session persistence 回归。
4. Stage 3b：剧情日志聚合器。
   - 每 8-12 轮生成结构化摘要。
   - 日志服务只消费世界书摘要、轻状态和最近对话。
5. Stage 4 MVP：两个 trigger。
   - `写成我的版本`：剧情日志 -> 小说章节草稿。
   - `整理成分镜`：剧情节点 -> 卡片画布 / 分镜草稿。
   - 必须走现有 generation task layer，不直接 fetch。

验收：

- 新用户 30 秒内只看到一个清晰主世界，而不是题材货架。
- 从空白状态导入旗舰世界后，能直接开始 1 轮冒险。
- 10 轮冒险后能生成剧情摘要。
- 冒险摘要后出现“写成我的版本”和“整理成分镜”。
- `npm run test:run`、`npm run build` 通过；UI 改动补视觉/契约测试。

### 线程 B — 交给用户/其他人

范围：内容质量、手测、demo 和营销材料。尽量不要改线程 A 的高冲突工程文件。

建议独立分支：`content/flagship-world-review`

主要文件：

- `docs/demo/*`
- `docs/plan/*`
- `docs/user-manual/*`
- 可新增 `docs/content-review/*`
- 需要改世界内容时，先提交 review 文档，不直接大改工程文件

交付：

1. 旗舰世界内容 review。
   - 只审 `边境王国 · 雾潮暮湾`。
   - 检查 6-10 个事件是否能串成 10-15 分钟冒险。
   - 检查 3 个行动钩子是否有差异，而不是同义按钮。
   - 检查势力冲突是否能给 GM 明确压力。
2. 手动冒险记录。
   - 从空白浏览器开始。
   - 导入旗舰世界。
   - 玩 10-15 分钟。
   - 记录每轮：玩家输入、GM 是否引用世界书、是否出现可写作素材。
3. Demo case。
   - 写 `docs/demo/border-kingdom-adventure.md`。
   - 产出 1 段冒险摘要。
   - 产出 1 段小说化改写示例。
   - 产出 1 个分镜节点清单。
4. UI 参考。
   - 找 3 个“可玩世界入口”参考，不要只找写作工具。
   - 输出文字说明即可：信息层级、首屏动线、按钮文案、视觉氛围。

验收：

- 旗舰世界可支撑 10-15 分钟，不靠用户临场补设定。
- 手测记录能指出 GM 引用世界书的证据。
- demo 文档能支撑后续营销：选世界 -> 玩 -> 写 -> 分镜。
- 不直接和线程 A 抢改 `gameStore`、`Experience.vue`、`WorldBookQuickImport.vue`。

## 3. 合流规则

- 线程 A 先合工程主线。
- 线程 B 的内容 review 以文档 PR 合入。
- 如果线程 B 发现必须改种子世界内容，先提具体 patch 点，再由线程 A 或单独短分支改 `seedWorldbookPresets`。
- Stage 3a/3b 属于高风险状态改动，必须单独 review 后再做 Stage 4。

## 4. 下一轮顺序

```text
Codex:
  单主推世界入口 UI
  -> 体验页开场卡
  -> GM 轻状态
  -> 剧情日志
  -> 2 个 trigger

其他人:
  旗舰世界内容 review
  -> 10-15 分钟手测记录
  -> demo case 文档
  -> UI 参考清单
```

这两个线程可以并行。唯一硬约束是不要同时改高冲突工程文件。
