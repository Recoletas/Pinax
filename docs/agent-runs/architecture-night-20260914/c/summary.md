# C 线交付摘要 · Notes 素材工作台领域化（architecture-night-20260914）

- 基线：`37e0679`（O 的已验证 WIP 快照，基线 verify:full exit 0）
- 交付分支/最终代码 HEAD：`arch/notes-20260914` @ `832c476`（C-R1..R3 二次修复轮；后续仅 docs 提交）
- 提交序列（首轮时间可观察区间 **2026-09-15 00:21–01:02**）：`21f0319`（C0–C4，00:21）→ `fac4d8c`（C6，00:32）→ `a22dfd3`（S4+文档，00:37）→ `b90da3d`（C7，00:42）→ `7573347`（C9，00:54）→ `3e354fe`（C11，00:59）→ `2b053da`（summary，01:02）；二次修复轮：`9580453`（P0）→ `8bb8256`（补丁说明+summary 修正）→ `832c476`（同 id 重载 C-R1..R3 + J6a–J6d）
- 二次修复依据：[O 复验与修改指导](./O-REACCEPTANCE-AND-FIX-GUIDE-20260915.md)（同 id 重载覆盖草稿、material-domain 修订 storage-only、mutation 假成功）

## 1. 主包逐项状态

| 包 | 状态 | 说明 |
| --- | --- | --- |
| C0 数据/编辑模式图 | done | `c0-notes-map.md`（含模板/脚本/样式统计与全部异步身份链评估） |
| C1 素材目录与批量工作流 | done | `useNotesAssetCatalog.js`；删除后选择、批量状态/合并/分类、画布交接反馈 |
| C2 编辑与保存生命周期 | done（P0 修正轮后） | `useNotesAssetEditor.js`；保存返回 `{ ok, assetId, reason }` 并做写后读回校验（useStorage 吞配额异常返回 false，try/catch 不够）；pagehide/visibilitychange(hidden) 成对冲刷 |
| C3 异步来源链收口 | done | 修复 `generateAndImportToCanvas` 旧选中缺陷（await 后写错素材+劫持导航）；冒烟 J5 验证 |
| C4 页面收尾与验证 | done | 见 §4 命令与退出码；1440/390 亮暗截图齐全；J6 配额失败旅程 |
| C6 第二条异步链（顾问 apply/undo） | done | `useNotesMaterialAdvisor.js`；text-patch 与 material-* 两链的 revision/receipt 合同显式化 |
| S4 skill 修订 | done | docs-status-handoff 对齐真实 STATUS 分区 + 证据分级 + 维护触发 |
| D3/D4/D6 供稿 + S7 两案例 | done | `d3-d4-d6-s7-contributions.md`（供 O 串行合入公共文件） |
| C7 图片纯逻辑/DOM 分离 | done | `illustrationPresentation.js` 视图模型；页面只做 DOM 构建 |
| C9 无消费者清扫 | done | −494 行，每项附零消费者证据；lint 警告 32→4 |
| C11 偏好归属 | done | 钉住引用随目录裁剪并回写（J3b 验证含陈旧种子） |
| C12 术语表 | done | `c12-glossary.md`；owner 内部已用 asset 语言，legacy 名保留清单+迁移条件 |
| C10 画布兼容 | absorbed | `c10-absorbed.md`（逐项指向 C1/C9 代码与验证证据） |
| C8 组件抽取 | not-started（有预检理由） | 编辑面插画 DOM 仍在页面（C7 有意保留）；现在抽组件只会镜像状态或新增回调面。下一轮入口：先把 uiControlContract 的源码字符串断言改为行为断言，再从目录批量栏或编辑头选一个高内聚 surface；若仍会镜像状态则维持不拆 |
| C13 模板组件化 | not-started | 同上；属于下一轮入口 |

## 2. before / after

| 指标 | before（37e0679） | after（最终 HEAD 832c476） |
| --- | --- | --- |
| Notes.vue 总行 | 5,583 | 4,405（−1,178） |
| Notes.vue script 行 | 2,475 | 约 1,685 |
| 页面自有状态域 | 目录/编辑/保存/画布反馈/顾问事务 全在页面 | 页面保留插画域+弹窗+工作区 UI；目录/编辑/顾问/纯转换各有 owner |
| module-level 计时器/世代 | save/title timer + 3 revision let（散落） | editor 内聚（timer+revision），页面仅 illustrationDrag/预览世代 |
| 新模块 | — | 3 composables（catalog 444 / editor 310 / advisor 355）+ 2 services（86/77） |
| lint 警告（Notes.vue） | 32 | 5 |
| 全局监听器 | 0（事件全模板绑定） | 3（beforeunload/pagehide/visibilitychange，均成对注册与卸载） |

## 3. 旧职责 → 新 owner → 生产调用入口

| 旧职责（页面） | 新 owner | 生产入口 |
| --- | --- | --- |
| 目录加载/排序/分组/勾选/批量/删除后选择 | useNotesAssetCatalog（C-R1 后三分语义：refreshCatalog / selectChapter=activate / replaceEditorFromPersisted） | 模板同名绑定 + advisor 回调 |
| 画布交接（单/批/专业信息生成/反馈） | 同上（C3 语义修正） | 模板按钮 + J4/J5 |
| 编辑真源/去抖保存/切换前保存/模式同步/卸载冲刷 | useNotesAssetEditor | catalog.selectChapter → `editor.loadAsset`；模板 input 事件 |
| 顾问采用/撤销（两链 revision/receipt） | useNotesMaterialAdvisor | AdvisorPanel @apply-result/@undo-result |
| markdown 转换/图片描述符/版式视图模型 | services/notes/* | editor + 页面插画域 |

保留在页面的重逻辑（下一刀入口）：插画 DOM 构建/拖拽/锚点（C7 遗留 DOM 侧）、新建素材弹窗与探索文档跳转、sidekick 工作区切换、桌面级字体/字号 UI。

## 4. 验证命令与退出码（均在 `3e354fe` 前后树执行，最终树复核）

以下为**最终 HEAD（832c476 树）实际执行**结果；早期轮次结果已被本轮复跑覆盖，不再罗列：

| 命令 | 结果 |
| --- | --- |
| `npm run verify:full` | exit 0（20/20 文件、200/200 用例、lint:delta、Vite、diff check、VitePress） |
| `npm run test:run` | 20 文件/200 用例 |
| `npx vitest run src/__tests__/narrativeAssets.test.js` | 4/4 |
| `node scripts/notes-journeys-smoke.mjs` | exit 0，PASS：J1 去抖窗口切换不丢字、J2 刷新持久、J3/J3b 归档回落+偏好裁剪回写、J4 画布幂等（两次送入 1 卡）、J5 迟到结果归属原素材且不劫持导航、J6 配额失败阻止切换+输入保留+存储不污染+恢复重试、**J6a 删除他人保护草稿、J6b 同 id 激活 no-op、J6c domain 采用 editor 真源 stale 零写入、J6d durable 失败无假成功+恢复重试成功** |
| `UI_AUDIT_* node scripts/ui-audit.mjs`（materials，1440/390） | 2 captures，0 console errors，0 a11y failures（早轮；本轮 UI 无视觉改动） |
| 亮/暗 1440 编辑态截图 | `tmp/notes-smoke/notes-dark-1440.png` 等 |

## 5. 自审要点（对应计划问题）

- 两份可变状态？无：`markdownContent` 是唯一编辑真源；catalog 的 chapters 是 narrativeAssets 的投影；advisor 只经服务写。
- callback 把逻辑送回页面？否： seams 共 5 个窄接口（extractEditorMarkdown/flushVisualPresentation/render×2/navigate），均有单一职责注释。
- 持久化失败保持输入？**是，且失败会阻止切换与破坏性动作**（P0 修正轮 + 二次修正轮）。首轮 P0 修正后 O 复验发现两条残留：同 id 重载绕过门禁覆盖草稿（已由 C-R1 三分语义修复，J6a/J6b 验证）；material-domain 修订只读 storage（已由 C-R2 editor 真源修订修复，J6c 验证）。持久化判据两层：编辑器保存用写后读回；服务层新增 `*Durable` 结果型 API 直接把 setItem 的 false 转成失败（J6d 验证假成功被拦截）。失败反馈一律可见（“保存失败，已取消…/未保存（存储写入失败）”）。
- 旧请求写入新对象？已核：四条异步链全部有 id/revision/世代守卫；C3 修复前画布导入链没有。P0 的保存失败覆盖问题为第二处（修复见上）。
- 顾问 apply/undo 真源（O 复核项）：两条链都以 `result.target.id` 在 listNarrativeAssets 中定位素材，revision 用 createContentRevision 复核；“当前选中 id”只用于决定读编辑真源还是已存内容，不作为写入目标。
- catalog/editor 互注入 TDZ（O 复核项）：editor 先创建，经惰性箭头函数 `() => catalogApi.selectedAsset.value` 引用后声明的 `const catalogApi`——求值发生在调用时（首个用户动作），无初始化顺序风险。
- C9 删除 494 行（O 复核项，grep 之外）：逐项核对模板绑定（awk 提取 template 段零命中）、共享测试断言（uiControlContract 对 notes 的 toContain 名单未覆盖任何被删名）、动态调用（仓库无字符串分发/eval 式调用点）；兼容入口 `scrollCanvasToBottom` 本身即无调用者的死兼容，删除理由记录于提交 7573347。
- 新接口被生产调用？是：模板同名绑定 + catalog↔editor 相互消费；反向核查（“新模块是否真被调用”）见 J1–J5 旅程即生产入口路径。

## 6. 供 O 重点审查的位置

1. `src/__tests__/uiControlContract.test.js`（O 持有）：4 条源码文本断言改为跟随 catalog 接线 + 新增 notesCatalog 读取——补丁说明见提交 21f0319；如 O 不同意可整块回退，届时 Notes.vue 无需变更。
2. `useNotesAssetEditor.js` 的 flushPendingSave 在 `visibilitychange` 未挂（只挂 beforeunload+unmount）——与 Authoring persistence 行为对齐最小化，是否补 pagehide 由 O 定。
3. C3 行为变更（非纯重构）：生成期间切换素材不再自动跳画布，改为反馈提示——设计取舍在 `useNotesAssetCatalog.generateAndImportToCanvas` 注释。
4. ~~`visibilitychange` 未挂~~（二轮已过期）：pagehide/visibilitychange(hidden) 已与 beforeunload 成对注册/卸载。
5. 服务层 `narrativeAssets.js` 新增 `*Durable` API 并将 update/delete/setStatus/merge 内部拆为 build+persist；旧函数行为不变，供其他消费者继续使用。**迁移清单**：C 线全部写入口（catalog/advisor）已迁 durable；其余消费者（Experience/gameStore 域等，若有）迁移交由对应 owner 排期。

## 7. 未验证/未做

- 真实模型下的顾问质量不在本轮范围（合同行为已验）。
- C8/C13 组件化未开（下一轮入口：先把 uiControlContract 源码文本断言改为行为断言，再选目录批量栏或编辑头 surface）。
- 视觉判断依据截图人工查看（1440/390、亮/暗），未宣称像素级回归工具覆盖。
- O 二次验收门槛对照：列表刷新不隐式替换编辑器 ✓（J6a/J6b）；四条覆盖路径 ✓（J6a/J6b/J6c + 图片保存刷新语义代码审查）；mutation 假成功 ✓（J6d）；J1–J6+J6a–d 全绿 ✓；focused+verify:full 于 832c476 通过、worktree clean ✓；summary 与真实树一致 ✓（本节）。
