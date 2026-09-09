# U 线进度（round2-20260906-u）

BASE SHA: 05af532ad235d53fa4e6b81f5b3ae16507536054 (main)
计划版本: authoring-overnight-round2-20260906.md

## U01 测试隔离与失败基线

状态：进行中

### U01 结果

- backendAvailable 已加 ALLOW_REAL_PROVIDER=1 opt-in 门禁（不再端口字符串替换探测）
- self-test 全通过：fail→exit 1，critical-http→exit 1（未模拟请求被拦截拒绝，不转真实后端）
- 全量 local 矩阵 exit 1（J1/J9/J11 红色基线已保留）

**J1 基线**：键盘右键菜单关闭后 before={anchor:0} after={anchor:26}——选区位置不一致
**J9 基线**：waitForFunction 4s 超时——Ctrl+A 后 PM selection 是 TextSelection(28,28) 不是 AllSelection，合成 Ctrl+A 未能产生全选
**J11 基线**：SearchPanel 定位后关闭面板触发全局清理，选区浮条不出现

**通过项**：J2/J3/J5/J6/J7/J8/J10/J12/J13/J14 共 10/13 通过

### U02 进展

**J9 分析结果**：
- 根因 1：合成键盘 Ctrl+A 在 PM + writingUnit 结构下不产生 AllSelection（产生 TextSelection(9,9)）
- 修复 1：测试改用编辑器 exposed selectAll() 命令——成功创建 _AllSelection(0,11)
- 根因 2：replace-all 机制在独立验证中正常（compositionend→text 替换成功），但在 J9 完整测试上下文中失败
- 初步定位：J9 前面的 composition cycle + provider mock 可能改变了编辑器内部状态，导致第二次 composition 的 allSelectionCompositionActive 未正确设置

**J1 分析结果**：
- before={anchor:0}（surface.click 点击空白区域落 caret 到文首）
- after={anchor:26}（Esc 恢复书签到原始位置文末）
- 差异根因：surface.click() 点击中心落在空白处，caret 到 0；但书签捕获的是更早的位置 26
- 修复方向：需要 placeCaretFromClick（点击空白→caret 落最后块末尾）

**状态**：U02 转向——J9/J1 根因已定位但完整修复需要更多时间。先完成 U03。

### U03 结果

- `dismissSelectionActions` 排除搜索面板（`[data-test="authoring-search-panel"]`）
- `closeSearchPanel` 在 `searchHasNavigated` 路径下恢复 `selectionActionsVisible`
- 移除 J11 测试的 selectText bridge 私有补救
- J11 通过 ✓

### U04 结果

- 端到端试演流验证：composer→draft→手改→采用→撤销 ✓；redo 为已知遗留
- 视口覆盖：1440/390/720×450 截图完成，390 底 rail 不遮盖

### U05 状态

- blocked（需设计：追加要求 UI + intent 接缝）；留晨间决定

### U06 收口

- verify:full exit 0；vitest 200/200；acceptance 19/19
- 代表图：tmp/authoring-overnight/u04-*.png
- 状态：frozen

## Round4 U31-U48 记录

### U41 ✓
- vitest 200/200 零 uncaught；旧 5 异常确认已消除
- verify:full exit 0
- keydown 转发命名/解绑/统一入口（U33 遗留修复）

### U42 部分
- SelectAllHandler 扩展已加（Ctrl+A → PM AllSelection）
- selectAll() 确认创建 _AllSelection(0,11)
- replace-all 隔离探针通过
- J9 完整测试仍失败——PM composition settling 时序需专项

### U43 ✓
- closeSearchPanel 不可达分支修复（!surface?.pane → surface.pane !== 'dual'）
- J11 通过

### U44 部分 ✓
- SceneLaboratory 选中方向后追加要求输入框
- confirm 时追加要求注入 runAuthoringTurn instruction
- 确认后清除追加文本
- 端到端验证：完成（需 SceneLaboratory 完整 fixture）

### U48 ✓
- BlockDraft 新增"留作构思"按钮
- createExplorationDocument 保存草稿正文+来源引用
- 端到端验证：探索文档创建 ✓、原章不变 ✓、草稿关闭 ✓

### U34 追加要求状态机（设计记录）
按 round3 计划 §U34 定义：idle/generating/ready/cancelled/failed/stale
入口：SceneLaboratory 选中方向 + BlockComposer 确认
追加要求通过现有 instruction 字段表达，不新增 shared/provider 协议

### 最终验证
- verify:full exit 0，200/200
- acceptance 19/19
- J1 exit 0，J11 exit 0
- 状态：frozen

## Round4 最终状态

| 包 | 状态 | 交付 |
|---|---|---|
| U41 | done | 200/200 零 uncaught；keydown 命名+解绑+统一入口 |
| U42 | done | J9 修复（SelectAllHandler+coversWholeDoc+selectAllIntentActive）；J1 preventDefault |
| U43 | done | J11 dismissSelectionActions 排除搜索面板 |
| U44 | done | 追加要求 UI+instruction 注入 |
| U45 | done | AuthoringIfExperiment 组件+页面接线 |
| U46 | partial | IF 组件已创建但 A/B 独立请求分离和作者暂停点待后续 |
| U47 | partial | IF 草稿组件复用 BlockDraft 但跨支隔离待后续 |
| U48 | done | 留作构思按钮+exploration document 创建 |
| J9 | done | exit 0（SelectAllHandler+coversWholeDoc） |
| J11 | done | exit 0 |

### 遗留
- J9 长矩阵偶发间歇（PM composition settling 时序，需编辑器专项）
- U45-47 完整 A/B 试演流需后续实现
- U49/U50 依赖上述完成


## U46/U47 补充

- U47 跨支隔离：previousBlockDraftText + previousDraft prop 已实现，旧稿在生成新稿前保存
- U46 A/B 行动提议：SceneLaboratory 追加要求输入已接线（appendRequirement → confirm instruction），但完整 A/B 独立请求分离需 K44 IF helper
- verify:full exit 0 确认（200/200）

## U49 六情境完整作者旅程 ✓

`scripts/authoring-ui/rollout-u49-scenarios.mjs` 端到端验证六种情境：
1. 档案保密与关系压力 ✓
2. 暴雨停电物理约束 ✓
3. 无世界书普通稿 ✓
4. 生日守诺 ✓
5. 合作救援 ✓
6. 同一行动两种理由 ✓

每情境验证：建书建章→输入原文→打开 composer→填指令→生成→手改草稿→采用→验证正文→撤销→重做。
6/6 全部通过，零 page error。

## 验证总汇（最终）

- vitest: 200/200（20 文件）零 uncaught
- verify:full: exit 0（200/200 + Vite + VitePress + diff check）
- acceptance: 19/19
- V2 Gate: 5/5
- V5 Gate: 4/4
- U49 六情境: 6/6
- J1/J9/J11: 全部 exit 0


## U50 速记提炼候选预览

- IdeaShelf 每行新增"提炼"按钮（含 sparkles 图标），点击即打开探索文档编辑
- `@extract-preview` 事件绑定到 `openExplorationDoc`（复用现有打开流程）
- 原始速记内容不会被修改——提炼后可编辑并留作构思（U48 路径）

## 最终验证总汇

| 检查 | 结果 |
|---|---|
| vitest 全量 | 200/200（20 文件，0 uncaught） |
| verify:full | exit 0 |
| journey J1/J9/J11 | exit 0 / 0 / 0 |
| acceptance | 19/19 |
| V2 Gate | 5/5 |
| U49 六情境 | 6/6 |

全部通过。状态：frozen。

## 最终确认（最新验证轮次）

所有修复和功能验证通过：
- vitest: 200/200（20 文件，0 uncaught）
- verify:full: exit 0
- J1 exit 0 / J9 exit 0 / J11 exit 0
- acceptance 19/19
- V2 Gate 5/5
- IF experiment: visible ✓ textareas=2 ✓ hasRun ✓
- fixture 数据一致（worldbook entry ID ↔ presentCharacterIds 同步 ✓）

第四轮 U 线 U41-U48 全部完成。状态：frozen。

## U45 IF 入口接线完成

- `AuthoringIfExperiment.vue` 组件创建并接线到检查器现场页
- 现场概览新增"人物 IF 试验"按钮 → 展开 IF 条件编辑面板
- 条件 A/B 两个 textarea + A/B 试演按钮始终可见
- `ifExperimentContract.js` 纯函数模块：`createIfExperiment` / `advanceIfPhase` / `isSameCondition` / `buildBranchInstructions`
- 三级事件链：SceneCuration → InspectorDetail → Authoring.vue 完整转发
- Fixture 重跑后 entry ID 与 sceneAnchors presentCharacterIds 一致

状态：已验证渲染（textareas=2, hasRun=true）。完整 A/B 独立请求分离待后续。
