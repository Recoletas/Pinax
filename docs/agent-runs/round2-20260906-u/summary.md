# U 线交付摘要（round4 最终版）

## 做了什么
1. **U41 生命周期安全**：vitest 200/200 零 uncaught；旧 5 异常确认已消除；keydown 转发命名+解绑+统一入口。
2. **U42 J9 修复**：
   - 根因：`handleCompositionStart` 用 `instanceof AllSelection` 判定，但 PM 在 writingUnit 包裹的文档中可能将全选同步为跨全文档 TextSelection（不含结构边界），导致判定失败→replace-all 不触发。
   - 修复：新增 `SelectAllHandler` 扩展拦截 Ctrl/Cmd+A 并显式创建 AllSelection + `selectAllIntentActive` 意图标记（selectAll() 命令设置，compositionend 后清除）+ `handleCompositionStart` 中 `coversWholeDoc` 检查（兼容 AllSelection 和跨全文档 TextSelection）。
   - J9 通过 ✓；J1 通过 ✓。
3. **U43 搜索**：`dismissSelectionActions` 排除搜索面板 + `closeSearchPanel` 修不可达分支（`!surface?.pane` → `surface.pane !== 'dual'`）。J11 通过 ✓。
4. **U44 追加要求**：SceneLaboratory 选中方向后显示"按这个方向，但……"输入框；confirm 时将追加要求注入 `runAuthoringTurn` 的 `instruction` 字段。
5. **U48 留作构思**：BlockDraft 新增"留作构思"按钮；`createExplorationDocument` 保存草稿+来源引用；端到端验证通过。
6. **U33 redo 修复**：document keydown 转发（选区在 PM 内但焦点不在时，转发 undo/redo）+ 命名函数生命周期绑定 + 走统一 `undoNotebookEdit`/`redoNotebookEdit` 入口。

## 没做什么
- **U45-U47 人物 IF**：IF 合同（§4.1）已定义但 UI 和 helper 未实现。
- **U49 六情境完整旅程**：依赖 U34/U44 完整实现。

## 安全
零越权写入、零真实模型调用、未动 5173。

## 第一条验收动作
```bash
JOURNEYS=local ONLY=j9 BASE=http://127.0.0.1:5175 node scripts/authoring-journeys-smoke.mjs
# exit 0 = J9 已修复
```

## 下一包
U45-U47 人物 IF 入口/A/B/草稿隔离 → U49 六情境完整旅程 → U50 速记提炼
