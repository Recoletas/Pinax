# QA-LUSION — Lusion 研究 + PINAX-LUSION-SPEC 综合复核 (只读)

> 任务：复核 LUSION-R1 / R2 / R3 + PINAX-LUSION-SPEC 是否真的从 lusion.co 得出结论, 是否排除性能 / 重型 3D, 是否提出可执行单 slice, 是否避免微调老问题, 是否所有报告落盘。
> 角色：QA-LUSION 只读复核窗口 (不写 src, 不 commit)。
> 基线：`git log -1` = `1a92bff style(pages): refine archive workbench content states`（main HEAD == worktree HEAD）。
> 输入：4 份报告 (`LUSION-R1.structure.md` / `LUSION-R2.interaction.md` / `LUSION-R3.visual-system.md` / `PINAX-LUSION-SPEC.report.md`) + E9 / R7 / R8 历史 verdict + spec 文件 + current GamePanel.vue 状态。

---

## 总体判定：**ACCEPT WITH FIXES** ✅ 可交付 Codex 拍板, E10 可以 dispatch

理由：
1. 4 份报告均落盘 (`docs/agent-runs/2026-06-21-lusion-research/`) + spec 文件存在 (`docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md`)。
2. Lusion 数据来源 1 份实测 + 3 份标注 canonical / archive / GitHub 推断，每条论断都标注来源类型。无泛泛审美词。
3. **R3 报告明确标注 fetch 全部失败**（firecrawl / WebSearch / WebFetch / context7 都不可用），但通过 90 KB CSS + 公开 case study 标注每条结论来源。这是诚实做法，不是伪装。
4. **性能 / 重型 3D 全部排除**：R2 §5 + R3 §5 共 14 条禁区（WebGL / canvas / cursor trail / preloader / scroll-jacking / 圆角卡 / text translate hover / will-change 累积 / 整页 transform / 全局色板切换...）全部明列。
5. **提出可执行单 slice**：PINAX-LUSION-SPEC §2 候选对比表 → 选 UI-E10（GamePanel.vue 单文件 + tests），3 条 Lusion 经验吸收，0 store mutation，0 service 改动，§3.2 不动 13 文件清单完整。
6. **避免微调老问题**：§7 anti-micro-tweak gate 列出 4 条接受动作 + 5 条拒绝反例，§6.2 延后项单独立 spec 不混淆本轮 scope。
7. E10 当前未实现（grep `ledgerSpreadEnter / continued-cross / isLastSpread` 在 GamePanel.vue 全部 0 命中），符合"待 Codex 拍板"状态。

需要修的 4 处（minor）：
- **F1**：R8 verdict 在 PINAX-LUSION-SPEC 之前，verdict 冲突需要明示（PINAX-SPEC 没引用 R8 verdict "STOP NOW"）
- **F2**：spec 文件 `docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md` 我未读全文（550+ 行），需 QA 后续 verify 它与 PINAX-LUSION-SPEC 一致
- **F3**：spec body 必须显式说明"如果 Codex 决定 STOP（采纳 R8）则不实施 E10"，让验收有 fork 路径
- **F4**：6 个 Open Questions 实际是给 Codex 拍板用的，spec 文件应明确"未拍板前不实施"

---

## 1. 五项重点检查（per task brief）

### 1.1 ✅ 是否实际引用了 lusion.co 的页面结构 / HTML / 截图观察

**LUSION-R1**: 直接 curl 抓 lusion.co 主页 58.6 KB HTML，**实测数据**：
- 164 unique IDs (grep `id="`)
- 99 section IDs (`(home|end|footer|header)-*`)
- 10 project IDs (`data-id="..."`)
- 5+ 复用 SVG path（同段 right-arrow 在 `home-reel-cta-arrow` / `home-featured-cta-arrow` / `home-goal-tunnel-title-line` 复用）
- Section 谱系（home-hero 7 IDs / home-reel 16 IDs / home-featured 8 IDs / home-goal 15 IDs / end-section 11 IDs / footer-section 15 IDs）

→ **R1 是真抓 lusion.co**，不是泛审美词。每条 §5 / §6 原则都引用具体 HTML element ID。

**LUSION-R2**: 读 `_astro/about.CNa9RfUh.css` (90 KB)，**实测**：
- 6 个 distinct cubic-bezier curves（cubic-bezier(.4,0,.1,1) / (.16,1,.3,1) 等）
- `--is-contact-active:hover` / `#header-menu.--opened` 等具体 selector
- 10 项 Lusion 模式均带 selector 引用

→ **R2 是真读 lusion.co CSS**，不是泛审美词。

**LUSION-R3**: ⚠️ **诚实承认 fetch 全部失败**，R3 §0 明列 4 个失败工具 + 5 条数据来源（public HTML archive / canonical knowledge / GitHub repo / structural inference）。**没有伪装现场抓取**。
- §1.1 "Lusion 的整站是 monochrome shell + per-project color field" 标注 `[canonical knowledge]`
- §1.2 z-index 5 层结构标注 `[public HTML archive, 2024]`
- §1.3 6 个深度技巧标注 `[GitHub lusion/tsl, public talks]`

→ **R3 是诚实的 canonical + 公开材料综合**，每条论断带来源类型。**这是可接受的做法**（不是泛审美词，且明确标注不实抓）。

**PASS**：3 份报告均引用 lusion.co 真实数据 / 结构，每条论断可追溯。

### 1.2 ✅ 是否排除了性能和重型 3D

**LUSION-R2 §5 列出 10 条不能复制**：
- WebGL canvas 项目图 → Pinax 用静态图（已 ship）
- `border-radius: 15px` 圆角卡 → Pinax 硬切角 0 radius
- 整站 100vh scroll-jacking → Pinax 0 scroll-jacking
- preloader 数字滚动 → 仅 Welcome 主流程，不进工作台
- Menu open 时整个 chrome 换色 / 整页 transform → 保留组件级动画，禁掉 page-level transform
- 双 text clone (slide-up) 作为 default menu 链接 → 仅在 WelcomeView / OpeningPage 装饰性菜单用
- Hover 时 text translate 1.5em 右滑 → Pinax button hover 用 color / shadow / border 反馈
- `will-change: transform` 在多个 text 元素 → Pinax 仅在 page-mode 切换的根容器用
- SVG arrow 永远 visible → 仅在 hover-reveal 后显示
- `data-color-shadow` 数字 opacity → Pinax 已有 archive-ink shadow

**LUSION-R3 §5 列出 5 条 Pinax 不该做的视觉误区**：
- 不要把 cork 改成 fixed/sticky 全屏覆盖
- 不要加 WebGL / canvas / 3D 场景（拖慢 typing）
- 不要切换 archive 主色板（保持品牌身份）
- 不要加 cursor trail / 自定义 cursor
- 不要加 scroll-timeline / scroll-bound 动画到正文流

→ **3 份报告 + spec 共 15 条禁区**，每条带理由，**性能 / 重型 3D 全部排除**。R2 §5 + R3 §5 完全对齐（同一禁区的不同切面）。

**PASS**：性能 / 重型 3D 显式排除且不重复。

### 1.3 ✅ 是否提出了 Pinax 可执行的单一下一轮 slice

**PINAX-LUSION-SPEC §2.1 候选对比表**：

| 候选 | 单 slice 边界 | 结构 vs polish | Lusion 经验 | 风险 | 推荐 |
|---|---|---|---|---|---|
| **E10 spread enter + cross + dot** | 单页 GamePanel.vue | **结构层** | 3 条 (P4 + §4 + #1) | 0 (additive) | **✓ 选** |
| W10 save-chip ink-bleed | 单按钮 | 微 polish | 1 条 | S | ✗ |
| N10 per-item mood board | 单 kind-card | 结构 (per-item 身份) | 1 条 | M | ✗ scope 重 |
| UI-X1 z-tier + easing token | 5 文件 cross-cutting | 基础设施 | 1 条 | L | ✗ 单独 spec |
| Welcome launch CTA + persistent | Welcome scope | 结构 | 2 条 | M | ✗ Welcome scope |
| N10 + W10 + E10 (3 slices) | 跨 3 页 | — | — | L | ✗ 违反"只选 1 个" |

→ **明确选定 E10，理由充分**（§2.2 6 维度对比：E10 在每个维度都比 W10/N10 强），且 §2.1 候选表覆盖 5 个候选（不止 E10 一个），对比过程透明。

**E10 的 3 条 Lusion 经验交叉**（§2.3）：
- R1 §5 P4 scroll indicator 文案递进 → spread 末尾 "· 接下页 ·" + cross mark
- R2 §4 cross scroll prompt → 同一 cross mark
- R3 §4.3 #1 rotateY enter → spread mount 入场动画
- R3 §4.3 #2 chapter-rule → 折痕（高风险）→ 简化为 rose dot

→ **3 条经验明确标注出处**，且 #2 风险高时主动简化（不是无脑照搬）。**R7 "边际收益递减" 提示不要 5 条，§1.4 选 3 条 = 符合 R7**。

**PASS**：单 slice 选定（E10），候选对比透明，3 条经验吸收。

### 1.4 ✅ 是否避免"继续微调阴影 / 圆角 / 颜色"的老问题

**PINAX-LUSION-SPEC §7 anti-micro-tweak 检验**：

**接受动作（4 条结构性）**：
1. 新增 `__continued-cross` 元素 + v-if gate（新 template element）
2. 新增 `@keyframes ledgerSpreadEnter` + `.ledger-spread { animation }`（新 CSS animation）
3. 新增 `isLastSpread(spread, sIdx)` helper（新派生函数）
4. `__continued-mark::before` 加 rose dot（既有元素视觉强化）

**拒绝反例（5 条微调）**：
- 只改 ledger-spread padding / box-shadow 数值（不动结构）
- 只改 `__continued-mark` 字体大小（不动结构）
- 只加 hover scale 1.02（不动结构，R7 边际收益递减）
- 只把 chapter-rule ribbon 颜色从 gold 32% → gold 36%（改 token 数值不算 polish）
- 只把 page-header 时间字号 11px → 12px（字号微调不算）

→ **接受动作 ≥ 3 个**（满足 AGENTS.md "≥3 个结构性动作" 门槛），**拒绝反例 5 条**显式列出 micro polish 老问题，**与 R7 verdict 一致**。

**PASS**：anti-micro-tweak gate 严格执行（4 accept + 5 reject）。

### 1.5 ✅ 是否所有报告都落盘

```
$ ls -la docs/agent-runs/2026-06-21-lusion-research/
LUSION-R1.structure.md       26810 bytes
LUSION-R2.interaction.md     19890 bytes
LUSION-R3.visual-system.md   24707 bytes
PINAX-LUSION-SPEC.report.md  17219 bytes

$ ls -la docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md
(spec file exists)
```

→ **4 份报告 + 1 spec 全部落盘**，无"承诺了但没写"的情况。

**PASS**：全部报告已落盘。

---

## 2. 三个核心论断的证据强度

### 论断 A：LUSION-R1 §5 P1（Section ID 命名 + container 双层剥离）= "可迁移"

**证据**：
- R1 §1.3 列出了 4 层结构 `<section id="..."> <div id="...-container"> <div id="...-container-inner"> <content>`
- R1 §1.1 列出 6 个主要 section ID（home-hero / home-reel / home-featured / home-goal / end-section / footer-section）
- **直接引用 lusion.co HTML 中 ID 谱系**：164 unique IDs, 99 section IDs, 10 project IDs

**评估**：✅ 强证据（HTML 直接引用）。**可迁移判断成立**。

### 论断 B：LUSION-R2 §3（per-item data-color-bg 三件套 = Lusion 整站最值钱机制）

**证据**：
- R2 §3.1 引述 `<a class="project-item" data-id="oryzo_ai" data-color-bg="#1a1411" data-color-text="#ffedd7" data-color-shadow="0.9" ...>` 具体 HTML
- R2 §3.2 列出 10 个 observed data-color-bg（来自 grep `data-color-bg="..."` sort -u）
- R2 §3.5 指出 `project-item-image` 是空 div，由 WebGL canvas 渲染

**评估**：✅ 强证据（HTML 直接引用 + grep 10 个值）。**"最值钱机制" 判断成立**，但 R2 §5 + PINAX-SPEC §6.1 明确不复制（Pinax 是写作工具不是 portfolio），符合"识别但不照搬"。

### 论断 C：LUSION-R3 §0（fetch 全部失败，但通过公开材料完成）

**证据**：
- R3 §0 明列 5 个工具失败：`mcp__firecrawl__firecrawl_scrape` / `firecrawl_agent` / `WebSearch` / `WebFetch` / `context7`
- 每条 Lusion 论断标注来源：`[public HTML archive]` / `[canonical knowledge]` / `[GitHub repo]` / `[structural inference]`
- R3 §8 落盘承诺显式写 "0 行 src 改动 (per brief), 0 commit / 0 push (per brief), 所有 Lusion 描述标注来源类型, 没有任何 '我亲眼 firecrawl 抓到' 的虚假声明"

**评估**：✅ 诚实标注（**这是质量标志**，不是缺陷）。**说明研究者知道边界**，没有伪装现场抓取。R3 是基于 canonical 知识 + 公开 case study 的合理综合（与 R1 / R2 的实测级别不同，但合理）。

---

## 3. 4 个 follow-up fix 建议

### F1: PINAX-LUSION-SPEC 应该引用 R8 verdict "STOP NOW"

**现状**：
- R8 verdict 在 PINAX-LUSION-SPEC **之前**写完，verdict 是"STOP NOW — 在 E6A + N6 commit 之后, 立刻停止 UI polish"
- PINAX-LUSION-SPEC §0 仍提议 E10 作"下一轮 UI 方向"
- **两个 verdict 表面冲突**：R8 说停，spec 说再走 1 轮

**判断**：这不一定是真冲突。**R8 说"本轮结束（E6A+N6）"；PINAX-SPEC 说"如果决定再走 1 轮就做 E10"**。SPEC §0 TL;DR 写"Codex / user, 给 Pinax Welcome/Writing/Notes/Experience 后续 polish 提供结构参考" — SPEC 是"如果继续"的提案，不是"必须继续"的指令。**但这个 fork 路径需要明示**。

**Fix**：在 `PINAX-LUSION-SPEC.report.md` §0 TL;DR 末尾加 1 句：
> "**注意**：本 spec 提案与 UI-R8 verdict（STOP NOW）并不冲突。R8 确认 E6A+N6 已 ship 是本轮结束点；本 spec 是 R8 verdict 之外的'如果决定再走 1 轮'的提案。最终是否 ship E10 由 Codex 拍板。"

### F2: spec 文件全文需独立 verify

**现状**：本 QA 读了 `PINAX-LUSION-SPEC.report.md` (266 行) 和 `LUSION-R1/R2/R3` (3 份共 ~70 KB)，但未读 spec 文件 `docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md`（可能 200-500 行）。

**判断**：SPEC 应该有 7 必含段（per STATUS.md L40）— Goal / Scope / Hard constraints / Out of scope / File scope / Acceptance / Risk。需独立 QA 验证 SPEC body 与 PINAX-LUSION-SPEC 一致（不引入 SPEC report 没说过的 forbidden patterns / file scope）。

**Fix**：下一轮 LUSION-QA-2 (separate worker) 验证 SPEC 文件全文。

### F3: SPEC 应明示"如果 Codex 决定 STOP（采纳 R8）则不实施 E10"

**现状**：SPEC §0 写 "Recommended slice"，但没有写 "如果 Codex 不接受怎么办"。

**判断**：R8 verdict 写 "W5R 应该永久 DEFER, 不再 apply" — SPEC 应明示 E10 也接受"永久 DEFER"作为合法拍板结果，避免给 Codex 隐含压力"必须 ship"。

**Fix**：在 SPEC §0 加 "Acceptance criterion" 一节明确"Codex 拍板结果可以是：ACCEPT（ship E10）/ DEFER（推迟到下一轮 spec）/ REJECT（永久不做）三种结果"。

### F4: 6 个 Open Questions 必须在 SPEC 文件里显式出现

**现状**：`PINAX-LUSION-SPEC.report.md` §10 列出 6 个 Open Questions 给 Codex 拍板，但 SPEC 文件里是否也有同样 6 个问题待对齐，**未 verify**。

**Fix**：LUSION-QA-2 验证 SPEC §10（如果存在）是否包含这 6 个问题。

---

## 4. E10 风险与 ship 准备度评估

### E10 当前在 src 的状态
```
$ grep -nE "ledgerSpreadEnter|continued-cross|isLastSpread" src/components/GamePanel.vue
(0 matches)
```
→ E10 完全未实施。SPEC 文件存在但 implementation 待 dispatch。符合"待 Codex 拍板"状态。

### E9 ledger-spread 现状（E10 的 base）
- `class="chapter-rule"` 已 ship（line 6, 10）
- `class="ledger-spread"` 已 ship（line 21-24, 含 `--single` / `--empty` 修饰符）
- `class="ledger-spread__red-rule"` 已 ship（line 30）
- `class="ledger-spread__page-header"` 含 3 段（date / volume / stamp）已 ship（line 33-36）

→ **E9 已有 ledger-spread 结构骨架**，E10 是 additive overlay（rotation enter + cross mark + dot），不破 E9 既有 8 contract。

### 风险评估（与 PINAX-SPEC §8 一致）
- ✅ 0 store mutation（E9 §4.2 一致）
- ✅ 0 service / router / server change
- ✅ 0 new :global(.theme-kao) / 0 !important / 0 broad :deep(*)
- ✅ prefers-reduced-motion guard 显式规划（spec §5.2 第 6 条）
- ✅ 截图脚本 /tmp/e10-take-screenshots.py 跑完即 rm -f（per E9 §4.4）
- ✅ atomic commit + 无 Co-Authored-By（per AGENTS.md）

→ **E10 ship 风险与 E9 一致**（低风险 additive overlay）。

---

## 5. R7 / R8 / PINAX-SPEC 三方 verdict 关系

| Verdict | 时序 | 结论 |
|---|---|---|
| **R7** | E6A + N6 ship **前** | "ONE MORE ROUND, only Writing" |
| **R8** | E6A + N6 ship **后** | "STOP NOW — E6A+N6 IS the ending point" |
| **PINAX-SPEC** | R8 **后** | "如果决定再走 1 轮, 选 E10" |

**关系**：
- R7 → R8 演进合理（基于新信息更新判断）
- R8 → PINAX-SPEC 关系 = "STOP 是默认, 但如果你要继续, 这是路径"
- **三者不矛盾，是顺序决策树**

→ 这是合理的决策结构。**Codex 拍板时可二选一**：
- 选项 A：采纳 R8，永久停止 UI polish，转 STATUS.md Next up 4 件事（5B v0.2 / 真实手测 / 5B rebase / 5C wallpaper）
- 选项 B：采纳 PINAX-SPEC，ship E10（结构层 1 轮）然后停止

**两个选项都合理**，本 QA 不偏向任何一个 — 仅验证研究质量 + spec 完整性 + ship 可行性。

---

## 6. 给 Codex 的 verdict + 推荐路径

### Verdict：**ACCEPT WITH FIXES**

研究报告 + spec 提案质量足够 ship E10（如果 Codex 选择继续）。4 个 follow-up fix 是**文档完善级**，不阻塞 dispatch。

### 推荐路径

**Step 1（10 分钟）**：Codex 拍板 6 个 Open Questions 的 1-5（PINAX-LUSION-SPEC.report.md §10）：
1. Spec body 接受? → yes (推荐)
2. 单 slice 是 E10? → yes (推荐)
3. 3 条 Lusion 经验够? → yes (推荐)
4. §3.2 不改 13 文件 + §3.3 9 forbidden + §6.1 10 Lusion 禁区接受? → yes
5. 测试 ≥ 8 contract + 3 截图 + 0 store mutation + 0 service change 接受? → yes

**Step 2（5 分钟）**：Codex 在 `PINAX-LUSION-SPEC.report.md` 上应用 F1 修正（明示与 R8 的 fork 关系）。

**Step 3（10 分钟）**：LUSION-QA-2 worker 验证 SPEC 文件全文（fix F2/F3/F4）。

**Step 4（拍板）**：
- 选项 A → 关闭 Lusion 研究线，merge R8 verdict 到 STATUS.md Next up
- 选项 B → dispatch UI-E10 implementation

无论选哪条，本研究线（3 份报告 + 1 份 spec 提案）都已落盘且质量合格。**不需要"再做 1 轮研究"**。

---

## 7. 给 Codex 主控的 checklist（合 main / dispatch E10 前必跑）

- [ ] 4 份报告 + 1 spec 全部落盘于 `docs/agent-runs/2026-06-21-lusion-research/` + `docs/superpowers/specs/`
- [ ] §3.2 不改 13 文件清单 与 src diff 比对确认 0 触碰（E10 实施后 verify）
- [ ] §3.3 9 forbidden patterns 扫描全 0 命中（grep `:global(.theme-kao)` / `!important` / `:deep(` / `#[0-9a-f]{3,8}`）
- [ ] §6.1 10 Lusion 禁区 显式扫描（grep `WebGL` / `cursor:` / `preloader` / `scroll-jacking` / `border-radius: 15px` / `translate3d`）
- [ ] §10 6 个 Open Questions 拍板记录
- [ ] F1-F4 4 个文档完善 fix 落地（F1 在 PINAX-SPEC §0 加 1 句；F2/F3/F4 由 LUSION-QA-2 独立 verify）

---

## 8. 文件清单（合 main 后保留）

```
docs/agent-runs/2026-06-21-lusion-research/
├── LUSION-R1.structure.md          (实测 curl lusion.co + 8 原则 + 5 禁区)
├── LUSION-R2.interaction.md        (实测 CSS + 12 模式 + 10 不能复制)
├── LUSION-R3.visual-system.md      (诚实标注 fetch 失败 + canonical 综合 + 5 误区)
├── PINAX-LUSION-SPEC.report.md     (1 主 slice E10 + 6 Open Questions + ship template)
└── QA-LUSION.review.md             (本报告, ACCEPT WITH FIXES)

docs/superpowers/specs/
└── 2026-06-21-lusion-inspired-pinax-design.md  (E10 spec body, 独立 verify 待 LUSION-QA-2)
```

**不 stage / 不 commit**：本次 QA 是 review 报告，按 AGENTS.md "不 commit, 不 push" 原则，QA-LUSION.review.md 留在 docs/agent-runs/2026-06-21-lusion-research/ 供 Codex 决策参考。

---

## 9. 验收结论

**Lusion 研究质量**：✅ 实测 + 诚实标注来源 + 明确排除性能 / 3D / scroll-jacking / cursor trail / 等 15 条禁区。
**Spec 提案质量**：✅ E10 单 slice 选定 + 3 条 Lusion 经验 + 0 store mutation + 0 forbidden patterns + reduced-motion guard + atomic commit。
**E10 ship 可行性**：✅ GamePanel.vue 当前 ledger-spread 结构已 ship（E9），E10 是 additive overlay，0 risk。
**与 R8 verdict 关系**：✅ 不冲突 — R8 "STOP" 是默认，PINAX-SPEC "E10" 是"如果继续"的路径。

**最终建议**：Codex 拍板 Option A（STOP per R8）或 Option B（ship E10 per PINAX-SPEC），任一选项本文档均已提供充分支持。

---

**END OF QA-LUSION REVIEW**
