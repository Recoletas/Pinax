# uiControlContract.test.js 补丁说明（C → O，待审）

状态：**未获批**。该文件属 O 共享写集；以下补丁已在 C 分支 `arch/notes-20260914`
提交 `21f0319` 中（随第一批），如 O 认定不当可整块回退，Notes.vue 侧无需任何变更。

## 补丁内容（2 处，共 5 行）

1. 新增一行模块读取：
   ```js
   const notesCatalog = readFileSync(resolve(__dirname, '../composables/useNotesAssetCatalog.js'), 'utf8')
   ```
2. 四条断言从“Notes.vue 源码文本”改为“真实实现模块文本”：

| 断言（原 → 现） | 理由 |
| --- | --- |
| `expect(notes).toContain('ensureAssetCanvasCards')` → `expect(notesCatalog).toContain(...)` | 实现迁入 catalog |
| `expect(notes).toContain('function sendCheckedAssetsToCanvas()')` → 同上 | 实现迁入 catalog |
| `expect(notes).toContain("router.push({ name: 'prose-essay', query: { assetId: primary.id } })")` → `expect(notesCatalog).toContain("navigate({ name: 'prose-essay', ... })")` | 路由改为注入适配器（`navigate`），语义不变 |
| `expect(notes).toContain('已送入画布 ${result.cards.length} 项，…')` → `expect(notesCatalog).toContain(...)` | 反馈文案随实现迁移 |

## 为什么这是“验证生产接线”而不是“迁就文件名”

- 四条断言保护的行为合同（批量送画布存在、幂等反馈文案、导航目标）全部未变；
  变的只是实现所在文件——断言跟随实现，而不是删除或放宽。
- 断言目标文件正是该行为的唯一生产 owner（useNotesAssetCatalog 由页面生产调用，
  冒烟 J4/J5 从 UI 入口走全链验证同一行为）。
- 未触碰同测试内仍指向 Notes.vue 的断言（如 `explicitPinnedSlipAssets`、
  `sidekickReason: 'same-source'`、模板文案），它们对应的能力仍在页面。

## O 复核建议

- 确认“源码文本断言 → 实现模块断言”是否符合该测试的合同定位；若 O 倾向行为断言
  （plans §8 的方向），可作为下一轮改造入口，本补丁保持最小迁移。
