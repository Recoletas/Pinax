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

### Step 13 (2026-05-17)
- 添加 hoveredPileId, expandedPileId 状态
- 鼠标悬停牌堆：轻微扇形展开（35度间隔，半径80px）
- 点击牌堆卡片：完整扇形展开（半径160px）
- 牌堆收起时保持轻微堆叠可见（不完全遮挡）
- build: 成功
- 状态: 正常
- 状态: 待测试