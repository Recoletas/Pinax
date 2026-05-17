# ProseEssay 改动记录

每次改动后记录，空白时回退到上一个正常状态。

## 改动记录

### Step 1 (2026-05-16)
- 添加 PILES_KEY, COMMITS_KEY, BRANCHES_KEY
- 添加 piles, expandedPile, draggingCardId, canvasSplitX 状态
- 状态: 正常

### Step 2 (2026-05-16)
- 添加 .zone-divider CSS (不含其他样式)
- 状态: 正常

### Step 3 (2026-05-16)
- 添加 zone-divider HTML (含素材区/编排区标签)
- 状态: 正常

### Step 4a (2026-05-16)
- 添加 .zone-label 基本样式 (writing-mode, opacity, color)
- build: 成功

### Step 4b (2026-05-16)
- 添加 .zone-material { left: 4px } 和 .zone-editing { right: 4px }
- build: 成功

### Step 4c (2026-05-16)
- 添加 .writing-card.zone-material, .writing-card.zone-editing 边框样式
- build: 成功

### Step 5 (2026-05-16)
- 添加 card zone class 绑定 ('zone-material', 'zone-editing')
- build: 成功

### Step 6 (2026-05-16)
- 添加 loadData/saveData 中的 piles/commits/branches 持久化
- 添加 inferZone() 函数
- build: 成功
- 状态: 正常

### Step 7 (2026-05-16)
- 添加 commits, branches 状态（回退因为卡片消失）
- build: 成功但导致卡片消失
- 状态: 回退

### Step 7b (2026-05-16)
- 添加 proseCommits, proseBranches 状态（改名避免冲突）
- build: 成功
- 状态: 正常

### Step 8 (2026-05-16)
- 修复 loadData/saveData 中的 commits/branches → proseCommits/proseBranches
- build: 成功
- 状态: 正常

### Step 9 (2026-05-16)
- 添加 onCardDragStart/Over/Drop/End 拖拽处理函数
- 添加 pile-badge 显示（属于牌堆的卡片）
- build: 成功
- 状态: 正常

### Step 10 (2026-05-16)
- 修复 layoutCards 保留 card.x/card.y（不覆盖已有位置）
- 添加牌堆堆叠效果（zIndex, rotate, 偏移）
- 新卡片添加 pileId: null, zone: 'material', x/y: null
- 插入卡片添加相同字段
- 添加 .writing-card.zone-material/editing 左边框/右边框样式
- build: 成功

### Step 11 (2026-05-16)
- 修复 onCardDrop：添加 e.preventDefault()，完善空值检查，添加 updateLayout() 调用
- build: 成功

### Step 12 (2026-05-16)
- onCardDragOver 添加 e.preventDefault()
- 修复 targetCard.pileId 直接赋值（之前用 find + 赋值没用）
- build: 成功

### Step 14 (2026-05-17)
- 牌堆收起时堆叠偏移加大（X 12px，Y 16px）
- 修复 onCardWallDrop：对无 pileId 的卡也更新位置
- 修复 onCardDragEnd：只清除 draggingCardId，不自动移出牌堆
- pileGroups 从 piles.value 直接读取 cardIds 顺序
- zIndex 统一：posInPile 越小越在底部（收起/悬浮一致）
- build: 成功
- 状态: 牌堆功能基本正常

### Step 15 (2026-05-17)
- 添加 cloneState() / recordCommit() / rollbackToCommit()
- 添加 showCommitPanel，提交历史面板 UI（右上角按钮）
- 结构变更自动触发 recordCommit（加入/移出大纲、牌堆变动）
- 提交历史支持回滚
- 修复工具栏重复问题
- build: 成功
- 状态: 正常

### Step 16 (2026-05-17)
- 添加 fusePileCards() 导出时牌堆融合
- exportToMarkdown/Txt 支持牌堆融合输出
- exportToJson 额外导出 piles 和 commits
- build: 成功
- 状态: 正常

### Step 19 (2026-05-17)
- 大纲牌堆条目支持双击编辑说明（inline edit）
- 添加 inlineEditingPile / inlineEditingPileName 状态
- 添加 startPileInlineEdit / savePileInlineEdit / cancelPileInlineEdit
- savePileInlineEdit 同时更新 outline 里的 preview
- 添加 .inline-pile-input 样式
- build: 成功

### Step 20 (2026-05-17)
- 大纲改为 VSCode Git 风格（垂直时间线连线）
- 添加 .outline-node-col / .outline-node-line / .outline-node-dot
- 每个条目左侧有圆点+垂直连线（最后一项不显示连线）
- 牌堆条目圆点用紫色区分普通卡片
- build: 成功

### Step 21 (2026-05-17)
- 修复 Enter 确认：input 加 @blur="savePileInlineEdit"，失焦自动保存
- 卡片详情面板紧促化（padding 10→6, font-size 缩小）
- 分离卡片详情和大纲：卡片详情留在左侧面板，大纲独立浮动面板（VSCode Git风格）
- build: 成功
- 状态: 大纲需做成可拖动浮窗

### Step 23 (2026-05-17)
- 从头开始重建改动（避免结构错误）
- 大纲移除改用 cardId/pileId（removeCardFromOutline）
- 大纲模板 key 改为 `item.pileId || item.cardId`
- addToOutline 支持牌堆整体加入大纲
- 大纲节点加垂直时间线样式（VSCode Git风格）
- 牌堆说明 inline 编辑支持
- build: 成功
- 状态: 正常

### 已完成功能
- Phase 1: 数据模型扩展（pileId/zone/x/y）
- Phase 2: 画布分区（35%/65% split）
- Phase 3: 牌堆（拖拽堆叠/悬浮展开/点击扇形展开/拖出解散）
- Phase 4: Git风格提交历史（快照/回滚/面板）
- Phase 5: 导出牌堆融合