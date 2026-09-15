# C 线修复后独立复验与二次修改指导（2026-09-15）

状态：**fix-required（首轮 P0 已修对，但编辑态重载边界仍未闭环，暂不可合并）**

验收对象：`arch/notes-20260914@8bb8256`  
共同基线：`37e0679`（`git merge-base main HEAD` 与 main 当前共同基线一致）

## 1. 独立复验结论

首轮修改指导中的核心修复方向成立：

- `saveCurrentChapter()` 已返回显式 `{ ok, assetId, reason }`，并通过写后读回识别
  `useStorage.setItem()` 吞掉的配额失败。
- 从目录切到另一素材时，保存失败会保留当前选择和编辑器输入；恢复 storage 后可以重试。
- `beforeunload`、`pagehide`、`visibilitychange(hidden)` 已成对注册和卸载。
- C3 的异步专业信息生成仍绑定发起时 asset id，不会在完成时劫持作者后来选择的素材。
- catalog/editor 的惰性注入未形成 setup 时 TDZ；顾问 text-patch 以目标 asset id + 当前编辑真源做 stale 判断。

但是，当前实现只守住了“切到不同 id”这一条路径。新的 `loadNotes()` 同时承担：

1. 从 storage 刷新目录投影；
2. 决定选中项；
3. 把选中素材重新装入编辑器。

这三个语义绑定后，同 id 重载会绕过 `selectChapter()` 中的切换保存门禁，并用 storage
旧快照覆盖编辑真源。因此 C2 所声明的“唯一编辑真源 + 所有覆盖动作受控”尚不成立。

## 2. P0 残留：同 id 重载会覆盖未保存输入

### 2.1 已确认的直接路径

`useNotesAssetCatalog.loadNotes()` 在刷新目录后总会调用 `selectChapter(nextChapterId)`；
`selectChapter()` 只在新旧 id 不同时调用 `saveOrBlock()`，但即使 id 相同仍执行
`editor.loadAsset(chapter)`。

最短复现：

1. 选中素材 A，输入文字，在 1 秒 debounce 落盘前不等待；
2. 删除目录中的另一素材 B；
3. `deleteChapter(B)` 只在 B 是当前项时保存；删除 B 后调用 `loadNotes(A)`；
4. 因 A → A 不触发门禁，`editor.loadAsset(A)` 用旧 storage 内容覆盖刚输入的文字。

关键位置：

- `src/composables/useNotesAssetCatalog.js:122-161`
- `src/composables/useNotesAssetCatalog.js:251-269`

这不是只在配额不足时出现；正常存储、正常操作、只要发生在 debounce 窗口内即可丢字。

### 2.2 同类异步窗口

以下入口同样调用 `loadNotes(currentId)` 或可能在作者继续编辑后晚到：

- 页面 mount 后的 `migrateNarrativeImageAssets().then(...)`：
  `src/pages/Notes.vue:814-817`；
- 图片保存完成后的目录重载：`src/pages/Notes.vue:1438-1464`；
- 顾问 material-domain apply/undo 后的重载：
  `src/composables/useNotesMaterialAdvisor.js:224-290`。

其中 material-domain 的 revision 当前只读 storage；作者在结果生成后、点击“采用”前刚输入但
尚未 debounce 落盘时，storage revision 仍可能等于旧结果，事务通过后又由 `loadNotes()`
覆盖编辑草稿。text-patch 分支已正确读取 editor 真源，不要把它回退成 storage-only。

## 3. 必修设计：拆开“刷新目录”与“替换编辑器内容”

不要在每个调用点继续零散补 `saveOrBlock()`。应在 catalog/editor 边界完成一次语义拆分：

### C-R1：拆分 catalog API

至少形成以下三个明确动作（命名可调整，语义不可混）：

- `refreshCatalog()`：只从持久层刷新列表、排序、图片投影和偏好；**不得调用
  `editor.loadAsset/clearAsset`**。
- `activateAsset(id, { reason })`：真正更换编辑对象；若当前存在编辑对象，先走保存门禁；
  失败返回 `{ ok:false }`，不改变选择、编辑内容或路由。
- `replaceEditorFromPersisted(id)`：只供首次初始化或用户明确要求放弃/恢复时使用；调用点必须
  显式说明为什么允许覆盖编辑真源，不能作为普通刷新工具。

同 id 的普通 `activateAsset(id)` 应是 no-op，不得重装编辑器。刷新后若当前 id 仍存在，更新
catalog 投影但保留 editor 真源；若当前 id 被外部删除，再进入显式冲突/回落流程。

### C-R2：逐入口改用正确语义

- 删除其他素材：先保护当前草稿，删除后只 `refreshCatalog()`，不得重装当前编辑器。
- 删除当前素材、归档当前素材、合并并更换目标：保存成功后才执行 mutation，再显式
  `activateAsset(nextId)`；不得在 mutation 后才发现保存失败。
- mount 首次加载可以使用 `replaceEditorFromPersisted()`；媒体迁移晚到只能刷新目录/图片投影，
  不能再次初始化编辑器。
- 图片保存：comic 模式保留当前编辑器时只刷新目录；确需打开新建图片素材时走
  `activateAsset(newId)`，保存失败则不切换。
- 顾问 apply/undo：采用前用包含 editor 真源的 revision 检查目标集合；当前草稿变化则 stale。
  持久化成功后，只在结果确实修改当前素材时显式装载已采用结果；修改其他素材只刷新目录。

### C-R3：持久化结果不能只在正文保存里可靠

`updateNarrativeAsset`、`deleteNarrativeAsset`、`setNarrativeAssetsStatus`、
`mergeNarrativeAssets` 当前都忽略 `setItem()` 的 false，可能在真正落盘失败时返回“成功对象”。
这会让顾问事务标成 applied、删除画布引用或写 receipt，而 narrative asset 实际未变。

优先方案是在 `narrativeAssets` service 的 mutation 边界统一返回可判定的 durable result，或在
一个内部 `persistOrFail()` 中把 `setItem() === false` 转成失败；不要让每个 UI 调用者各自复制
trim/readback 规则。若担心一次改变全部消费者，可先增加结果型 API 并迁移 C 线写入口，保留
旧函数作兼容层并列出迁移清单。

失败时必须满足：

- 不把顾问结果标记为 applied/completed；
- 不先删除画布/图片引用；
- 不生成与真实存储不一致的 receipt；
- 不刷新或重装编辑器来伪装成功。

## 4. 必须补入现有 smoke 的旅程

不要增加大量单元测试；在 `scripts/notes-journeys-smoke.mjs` 现有 J6 后扩充真实生产路径：

1. **J6a 删除其他素材**：A 输入未落盘文字 → 删除 B → A 的选择和文字保持，storage 中 A
   最终正确落盘或动作被阻断；旧实现必须能被该断言打红。
2. **J6b 同 id 异步刷新**：A 输入未落盘文字 → 触发/模拟媒体迁移完成后的 catalog refresh →
   A 编辑器文字不回退。
3. **J6c material-domain stale**：冻结顾问结果 → A 再输入一段但不等 debounce → 点击采用 →
   结果进入 stale，A 新文字保留，零事务写入。
4. **J6d mutation 持久化失败**：让 narrative asset storage 写失败后尝试归档或删除；断言素材、
   画布引用、选择、receipt 均未改变。恢复 storage 后重试一次成功即可。

无需为所有按钮复制同一种断言；覆盖上述四类边界后，再用代码审查确认其它入口复用同一个
owner/API。

## 5. 文档与证据必须纠正

`summary.md` 当前仍含互相矛盾或过期的事实，修复后一起更正：

- HEAD 写成精确 SHA（当前复验对象为 `8bb8256`），提交序列补上该提交；时间范围不要只写到
  01:02 后又列更晚提交。
- before/after 表的 after 仍写 `3e354fe`；应改为最终验收 HEAD。
- 新 composable 行数应以最终 `wc -l` 为准（当前是 catalog 421/editor 310/advisor 300）。
- “全局监听器 after 仍为 0”错误；现有 beforeunload/pagehide/visibilitychange 是三个全局监听，
  但均成对卸载。
- §6 仍声称 visibilitychange 未挂，与实际实现和 §1 相矛盾，必须删除/改为已完成。
- “catalog 10 个破坏性动作全部门禁”“四条异步链全部守住”在本次复验中不成立；只能在
  C-R1～R4 后重新声明。
- 验证表应记录本次最终 HEAD 上实际执行结果，不能继续只列 `3e354fe` 的旧轮次。

## 6. 本次独立验证证据

在 `arch/notes-20260914@8bb8256` 重新执行，不是转述 C 回执：

| 命令 | 结果 |
| --- | --- |
| `node scripts/notes-journeys-smoke.mjs` | exit 0；J1–J6 PASS，但 J6 只覆盖不同 id 切换，因此不足以否定上述缺陷 |
| `npx vitest run src/__tests__/narrativeAssets.test.js src/__tests__/uiControlContract.test.js` | 2 文件、10/10 通过 |
| `npm run verify:full` | exit 0；20/20 文件、200/200 用例、Vite/VitePress build、diff check 通过 |

自动化全绿证明现有合同没有回归，不证明未被覆盖的 editor reload 语义安全。

## 7. 二次验收门槛

满足以下全部条件后，C 线才可从 fix-required 改为 merge-candidate：

- 列表刷新不再隐式替换编辑器；同 id 普通刷新是保留草稿的 no-op/投影刷新。
- 删除其他素材、媒体迁移晚到、图片保存晚到、顾问 domain apply 四条路径均不覆盖未保存输入。
- narrative asset mutation 的真实落盘失败不会产生假成功、错误 receipt 或提前清理跨域引用。
- J6a–J6d 在旧实现上可红、修复后全绿；现有 J1–J6 不回归。
- focused 与 `verify:full` 在新 HEAD 通过，worktree clean。
- summary 的 SHA、时间、行数、监听器、未完成项与真实树一致。

## 8. 本轮不要求

- 不要求为了减行强拆 C8/C13 UI 组件。
- 不要求扩大测试总预算或做像素级视觉回归。
- 不改 Notes 的产品信息架构，不重写插画 DOM 域。
- 不 merge、不 push、不改 `server-version`；修复继续在 `arch/notes-20260914` fix-forward。

