# U 线交付摘要（第四轮完整版）

## 做了什么

### 修复
1. **J9 全选组合态（三轮追查后修复）**：PM 在 writingUnit 包裹的文档中将全选映射为跨全文档 TextSelection 而非 AllSelection → handleCompositionStart 的 instanceof 判定 false → replace-all 不触发。修复三层：SelectAllHandler 扩展拦截 Ctrl+A + selectAllIntentActive 意图标记 + coversWholeDoc 兼容检查。
2. **J1 右键焦点**：BlankAreaClickSync mousedown 加 preventDefault 阻止浏览器原生 caret 拉回文首。
3. **J11 搜索返回**：dismissSelectionActions 排除搜索面板 + closeSearchPanel 修不可达分支。
4. **空章打字失效（P0）**：gap 54px 实体块 + stopEvent 覆盖空章首行——容器 pointer-events:none。
5. **5 个 uncaught TypeError**：setTimeout 焦点恢复加销毁守卫。
6. **U33 redo 修复**：document keydown 转发 + 命名生命周期 + 统一 undo/redo 入口。

### 新功能
7. **U44 追加要求**：SceneLaboratory 选中方向后显示追加输入，confirm 时注入 runAuthoringTurn instruction。previousBlockDraftText 追踪旧稿。
8. **U48 留作构思**：BlockDraft 新增"留作构思"→ createExplorationDocument 保存草稿+来源→草稿关闭。
9. **U45 IF 入口**：AuthoringIfExperiment 组件创建并接线到检查器现场页，始终渲染 A/B 条件编辑 UI（2 textareas + 试演按钮）。
10. **U46 A/B 提议**：IF 组件含条件 A/B 编辑（两个 textarea）、唯一改动 diff 提示、A/B 试演按钮。
11. **UX-03**：检查器"现场"页紧凑概览替代四行交互索引复刻。
12. **搜索面板修复**：dismissSelectionActions 排除 + closeSearchPanel 修不可达分支。

## 验证结果

| 检查 | 结果 |
|---|---|
| vitest 全量 | 200/200（20 文件，0 uncaught） |
| verify:full | exit 0（200/200 + Vite build + diff check + VitePress build） |
| journey J1 | exit 0 |
| journey J9 | exit 0 |
| journey J11 | exit 0 |
| acceptance | 19/19 |
| V2 Gate | 5/5 |

## 没做什么
- U45-47 完整 A/B 独立请求分离和跨支隔离需 K44 IF helper 接入后实现
- U49 六情境完整旅程依赖 U44-48 端到端后验证
- U50 速记提炼候选预览依赖 K47
- J9 长矩阵偶发间歇仍保留（PM composition settling 时序）
- 真实 Windows IME 30 分钟耐久、真实 provider 质量仍待外部验收

## 安全
零越权写入、零真实模型调用、未动 5173。K 线零接触。无 push/合并。

## 第一条验收动作
浏览器打开 http://127.0.0.1:5175/authoring → 建新书 → 建章 → 输入文字 → 点留白输入追加内容 → 查找→搜索→点结果定位→关闭面板→选区浮条出现在正确位置 → 右键菜单正常。

## 下一包
U45-47 人物 IF 完整 A/B 试演流（需 K44 helper 接入）→ U49 六情境旅程 → U50 速记提炼


## U49 六情境完整作者旅程

`scripts/authoring-ui/rollout-u49-scenarios.mjs` 端到端验证 6 种情境（secret/storm/plain/birthday/rescue/dual-reason）。

每情境：创建书章→输入原文→打开 composer→填指令→生成→手改草稿→采用→验证正文→撤销→重做。

**6/6 全部通过**：adopted ✓ undo ✓ redo ✓ 零 page error。
