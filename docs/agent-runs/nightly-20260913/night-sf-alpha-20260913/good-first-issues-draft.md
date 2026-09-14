# Good First Issue 草稿（B06，本地存稿——不自动发到 GitHub）

用途：公开仓库后由维护者逐条审阅、手动创建 issue。每条含文件、收益、验收。
当前全部为**草稿状态**，禁止自动创建。

---

## GFI-1 · 修复导入组件中多余的正则转义（已在集成窗口解决，不要创建）

- **文件**：`src/components/authoring/AuthoringManuscriptImport.vue:206`
- **问题**：字符类内 `\[` 是多余转义（ESLint `no-useless-escape`），行为不变但属于真实存量。
- **收益**：消除 lint 存量；`scripts/lint-baseline.json` 中对应条目可删除。
- **验收**：
  1. `npm run lint:delta` 通过且基线中该条目已人工移除；
  2. 现有导入相关 Vitest 用例全绿；
  3. 手动导入一个含 `[书名]` 标记的 TXT，章节识别结果与改动前一致。

## GFI-2 · 演示手测稿公开化措辞清理

- **文件**：`docs/demo/border-kingdom-adventure.md`
- **问题**：文档以内部执行稿口吻书写（"并行内容线程的手测执行稿"等），不适合公开读者。
- **收益**：Public Alpha 的 docs 入口可直接阅读，不泄露内部流程术语。
- **验收**：
  1. 保留故事 demo 与验收口径内容；
  2. 移除/改写内部流程指代（线名、包名、agent 术语）；
  3. 不改动任何代码文件。

## GFI-3 · context-closure fixture 脚本支持 OUT_DIR

- **文件**：`scripts/authoring-ui/context-closure-fixture.mjs`
- **问题**：产物固定输出到 `tmp/authoring-context-closure`，多工作树并行时互相覆盖；
  其他三个 Gate 脚本已支持 `FIXTURE_DIR/OUT_DIR`。
- **收益**：并行开发/CI 可隔离 fixture；与现有 Gate 参数约定对齐。
- **验收**：
  1. 新增 `OUT_DIR` 环境变量（缺省保持现路径，向后兼容）；
  2. 用两个不同 OUT_DIR 连跑两次，产物互不覆盖且 `fixture-verification.json` 各自通过；
  3. `rehearsal-panel-check.mjs` 用自定义 FIXTURE_DIR 跑通。

## GFI-4 · 画布三个入口的 createSnapshot 未定义（已在集成窗口解决，不要创建）

- **文件**：`src/pages/ProseEssay.vue`（约 1076/1830/1973 行，ESLint no-undef ×3）
- **问题**：牌堆改名、加入大纲、移出大纲三个操作调用 `createSnapshot` 但该标识符
  在文件中未定义/未导入——真实运行时错误，属可复现缺陷。
- **收益**：修复用户可感知的崩溃路径；撤销/保护点行为恢复完整。
- **验收**：
  1. 改动前在合成项目复现至少一条（浏览器控制台报 ReferenceError + 操作失败）；
  2. 找到现有 snapshot 的 owner 合同并正确复用（不接受空 stub 让错误消失）;
  3. 三个操作后刷新数据正确，既有撤销行为保留；
  4. `scripts/lint-baseline.json` 中 ProseEssay 条目更新。

## GFI-5 · 公共阅读路径链接审计

- **文件**：`README.md`、`docs/src/index.md`、`docs/src/code-map.md`、`CONTRIBUTING.md`、`SECURITY.md`
- **问题**：VitePress 配置 `ignoreDeadLinks: true`，构建通过不代表链接有效；
  历史上 PLAN/LOG/看板存在 17 处断链（2026-09-13 编制时实测）。
- **收益**：新访客入口不再点进 404；为未来关掉 ignoreDeadLinks 做准备。
- **验收**：
  1. 写一个只覆盖上述公共入口文件的小型链接检查脚本（允许脚本进入 `scripts/`）；
  2. 报告所有死链并修复或移除（历史材料优先换成现存归档/提交链接）；
  3. 不把整站链接全绿当作目标——只覆盖公共阅读路径。
