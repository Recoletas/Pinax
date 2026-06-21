# UI-N6 Pre-Implementation Check — Notes pinned slips + useCanvasBoard

> **Status**: 拍板检查清单, 等 Codex + user 拍板后再开工实施
> **Plan**: `docs/agent-runs/2026-06-21-ui-fix/UI-N6-pinned-slips-plan.md`
> **Date**: 2026-06-21
> **Author**: Claude (UI-E6B worker, 顺手整理)
> **目的**: 把 plan §11 的 6 个问题转成可勾选清单, 给 Codex / user 一票否决 / 调整 / 通过

---

## 0. 摘要

UI-N6 plan 已就绪 (UI-N6-pinned-slips-plan.md, ~1300 行)。它对应 Notes 阻塞 user 反馈 #2 (右侧空白 + 强行一次只能看一张), 与 UI-E6B (Experience record-folio) 完全无文件冲突。改动 1 新文件 (`useCanvasBoard.js`) + 3 改文件 (`Notes.vue` / `kao.css` / `uiPolish.test.js`)。

但 plan 末尾 §11 列出 6 个待拍板问题,**未拍板前不实施**。本文档 = 拍板依据。

---

## 1. 6 个拍板问题 + 推荐回答

### Q1: 方案 B 确认? (替代 A / C 见 UI-N5 brief)

**选项**:
- A: 仅在右栏加 `archive-index` 静态面板 (不改 active-card 限制)
- **B (推荐)**: active-card 单选保留, 周围 1-3 张 pinned slips 可自由拖拽 (UI-N6 当前)
- C: 重做 Notes 顶部 drawer, 主区域 multi-select 多卡阅读

**推荐**: **YES (方案 B)**。理由:
1. A 静态填白没解决"一次只能看一张"根本问题
2. C 改动面超过本轮预算 (drawer 重做 = 跨 3+ 文件)
3. B 复用 ProseEssay 现有 drag/drop 状态 (`onCardDragStart/Over/Drop` L1790-1881), 改造成本最低

**用户 + Codex 决策**: [ ] yes / [ ] 改 A / [ ] 改 C

### Q2: useCanvasBoard 是新文件, 不动 ProseEssay?

**推荐**: **YES**。理由:
1. ProseEssay 有 `piles` 牌堆概念 + edges 边连线, UI-N6 composable 简化版不支持
2. 抽完整版要重写 ProseEssay 5+ uiPolish 合同, ROI 差
3. 留作 P3+ 单独重构

**用户 + Codex 决策**: [ ] yes / [ ] 一起迁 ProseEssay

### Q3: MAX_PINNED_SLIPS = 3?

**推荐**: **YES (3 张)**。理由:
1. UI-N5 brief 限定 (≤ 3 防视觉拥挤)
2. reading-deck 中央 active-card 760px 宽, 3 张 220px slip 围绕能容纳不重叠
3. 1280 宽下 3 张 slip + active-card 居中 = 视觉饱满 (UI-N5 §3.2)

**用户 + Codex 决策**: [ ] 3 张 / [ ] 改成 2 张 / [ ] 改成 4 张

### Q4: 持久化用 localStorage `pinax_notes_pinned_slips_v1`?

**推荐**: **YES**。理由:
1. Notes 已有 ui state pattern (`activeCardId` 等都 localStorage 持久化, 不引 STORAGE_KEY)
2. 不动 `useStorage.js` = 不动 services (满足硬约束 #4)
3. 老数据无此键 → 静默空数组 = 跟改前一样 (无 regression)

**用户 + Codex 决策**: [ ] yes / [ ] 改用 store Pinia state / [ ] 不持久化

### Q5: 1 个 commit 落地?

**推荐**: **YES**。理由:
1. finish and squash 规则 (commit-conventions §5)
2. 1 新文件 + 3 改文件 = 1 concern (Notes pinned slips) 不该拆

**用户 + Codex 决策**: [ ] yes / [ ] 拆 2 commit (composable + Notes)

### Q6: 移动端拖拽暂不做?

**推荐**: **YES (P3+ 补 touch events)**。理由:
1. touch events API 不一致 (iOS vs Android), P3 单独做
2. 移动端 CSS override 已包含 (`@media (max-width: 980px)` slip 改 stacking)
3. slip 在移动端仍可点击 = `selectChapter(slip.id)`

**用户 + Codex 决策**: [ ] yes / [ ] 本轮一起做 touch

---

## 2. 实施时间线 (拍板后)

| Phase | 内容 | 估时 |
|---|---|---|
| Phase 1 | 创建 `useCanvasBoard.js` (~150 行, 6 handler + layoutItems + styleFor) | 1 h |
| Phase 2 | Notes.vue 接入 (state + computed + method + template + localStorage) | 1 h |
| Phase 3 | kao.css 视觉 (基础 + .theme-kao 化 + 暗态硬化 + 移动降级) | 0.5 h |
| Phase 4 | uiPolish 12 contract + 跑通 | 0.5 h |
| Phase 5 | Playwright 截图 (5 张必跑 + 3 张可选) | 0.5 h |
| Phase 6 | commit + report | 0.2 h |
| **合计** | | **~4 h** |

---

## 3. UI-E6B vs UI-N6 文件冲突检查

| 文件 | UI-E6B 改动 | UI-N6 改动 | 冲突? |
|---|---|---|---|
| `src/pages/Experience.vue` | ✅ 改 (record-folio 3-tier + sidebar deweight) | ❌ 不改 | 无 |
| `src/pages/Notes.vue` | ❌ 不改 | ✅ 改 (pinned slips) | 无 |
| `src/pages/Writing.vue` | ❌ 不改 | ❌ 不改 | 无 |
| `src/components/GamePanel.vue` | ❌ 不改 (UI-E6A 改) | ❌ 不改 | 无 |
| `src/components/InputArea.vue` | ❌ 不改 | ❌ 不改 | 无 |
| `src/styles/themes/kao.css` | ❌ 不改 (本轮) | ✅ 改 (.pinned-slip rules) | 无 |
| `src/composables/useCanvasBoard.js` | ❌ 新增 (本轮无) | ✅ 新增 | 无 |
| `src/__tests__/uiPolish.test.js` | ✅ 改 (UI-E6B describe block + 3 UI-E2 更新) | ✅ 改 (UI-N6 describe block) | 无 (2 独立 describe block) |
| `src/stores/**` / `src/services/**` / `src/router/**` | ❌ 不改 | ❌ 不改 | 无 |

**结论**: UI-E6B 和 UI-N6 完全可以并行实施, 不会相互冲突。

---

## 4. 已知 follow-up (UI-N6 不能解决, 留给后续)

| # | Follow-up | 来源 |
|---|---|---|
| 1 | Notes dark empty state's far right can still read as a dark void (UI-N6 部分解决: 钉 ≥1 张 slip 后 void 消失, 但 0 slip 时仍 void) | STATUS.md L55-56 |
| 2 | 5 候补格 (UI-N4) 在 dark 下隐形 (`opacity: 0.55 + transparent`) | UI-N5 §5.3 |
| 3 | Notes 顶部 `material-top` 文案密度 (UI-W5R report 待整合) | UI-W5R.report.md |
| 4 | ProseEssay 仍 inline 拖拽逻辑, P3+ 迁到 useCanvasBoard | UI-N6 §10 |

---

## 5. 跨页面 / 跨 spec 引用

- 上游 brief: `docs/agent-runs/2026-06-20-ui-e5/ui-e5-read-only-brief.md` (UI-E5 §2 mention "Notes 候选格无效 → UI-N5+ 改")
- 同级 spec: `docs/agent-runs/2026-06-21-ui-fix/UI-E6-implementation-plan.md` (UI-E6 plan, no overlap)
- UI-R5 diagnosis 原始反馈: `docs/agent-runs/2026-06-20-ui-polish-p2/UI-R5.diagnosis.md` (Blasker #2 = 本 spec 来源)
- Status: `docs/STATUS.md` L52-56 (W2/N2/E2 → W4/N4/E4 ship gate + known follow-up)
- P1 follow-up 已知: Notes dark void (STATUS.md L55, 56)

---

## 6. 等待清单

- [ ] Codex + user 回答 Q1-Q6 (一票否决 / 调整 / 通过)
- [ ] Phase 1-6 按时间线实施
- [ ] 5 张必跑截图 (`notes-ui-n6-{0slip,1slip,3slip}-1280.png` + `-dark` 等)
- [ ] 12 个 uiPolish contract 跑通 (114 → 126 expected)
- [ ] 1 commit + report 落盘

---

## 7. 推荐下一步

如果 user / Codex 同意推荐答案 (Q1-Q6 全部 YES), Claude 可以**立即**进入实施 (Phase 1-6 4 小时)。如果有任何调整, 留 1 轮 ping 修正 plan。

无任何"必须先做 UI-N5"或"必须先做 UI-E6A" 的依赖。UI-N6 跟 UI-E6A / UI-E6B 都没文件交叉。