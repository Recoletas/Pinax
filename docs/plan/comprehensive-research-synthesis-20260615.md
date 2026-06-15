# Pinax — Comprehensive Research & Optimization Synthesis (v3, 2026-06-15)

> **v3 修订说明**(本轮第 4 次 review):在 v2 基础上做最后一次定向 review——查 v2 内部一致性 + 5A worktree 冲突 + Tier 1 完成度。v3 主要修 1 处 v2 误判 + 2 处数字偏差 + 1 处表头错误(v3 修清单见 §0.6)。
>
> **v2 修订说明**:v2 在 v1 基础上整合 3 轮并行 review 的修正——citation accuracy(50 处引用逐条 grep 复核,7 处错误 10 处部分修正)、coverage gap(11 个未覆盖领域、30+ 错失优化点补回)、priority validation(Tier 1 重新洗牌,3 项升级、6 项降级、新增 6 项)。v1 → v2 净增 14 个优化点,删 3 个错误主张。
>
> **来源**:12 份独立调研(4 份内部只读审计 + 8 份市场调研)+ 3 份 review pass(本会话内并行子 agent)。
>
> **遵守的硬约束**:`feedback_dont_overwrite_user_tuned_values`(kao 美学 / LXGW 字体 / kao archive folio / 立体感 v5 / style-presets / realism-metrics 不替换);STATUS.md 中"Do not touch"列表(`gameStore.js` / `worldbookContextBuilder.js` / `generation*` / `StatusBar.vue`)只分析不动,涉及它们的 Tier-1 必须先申请 exception。
>
> **作者立场**:Claude on `wip/map-realism-render-docs-20260608`,2026-06-15,token 预算不限。

---

## 0. Methodology

### 0.1 内部审计(4 份,只读)

| 报告 | 字数 | 来源子 agent |
|---|---|---|
| Frontend deep scan | ~5,500 | 70k LOC / 249 文件 |
| Backend deep scan | ~3,000 | Express / **8 routes** / 17 LLM providers(原 v1 误为 9,已修) |
| Map engine scan | ~3,000 | 12k LoC / 29 TS files |
| Tests / docs / specs scan | ~3,000 | **87 test files** / 10,939 LoC(原 v1 误为 88,已修) |

### 0.2 市场调研(8 份,部分带实时校验)

| 报告 | 字数 | 落盘文件 | 实时校验状态 |
|---|---|---|---|
| AI writing assistant | ~5,900 | `docs/plan/ai-writing-assistants-research-20260615.md` | 13 个工具实时抓取;3 个工具(Atticus / Latitude / Character.AI)走训练数据 + 显式标注 |
| Interactive fiction engines | ~6,400 | `docs/plan/if-engines-market-research-20260615.md` | GitHub API + 官方文档;Firecrawl 401 走 curl 兜底 |
| Worldbuilding platforms | ~3,300 | `docs/plan/worldbuilding-platforms-research.md` | 12 个 URL 都列了入口页,正文多走训练数据;显式标注需复核 |
| Worldbook / Lorebook AI | ~5,300 | `docs/plan/worldbook-market-research-20260615.md` | 10 个 cite,SillyTavern docs 走 curl;V3 spec 走训练数据 |
| Block editors | ~3,500 | `docs/plan/block-editors-research-20260615.md` | Context7 主源,bundle size 标注需 npm pack 复核 |
| Local-first / sync | ~3,500 | `docs/plan/local-first-sync-research-20260615.md` | 50 个 URL 都从 Context7 canonical 路径,标注需验证 |
| Map rendering libs | ~3,700 | `docs/plan/map-rendering-libs-research-20260615.md` | npm registry + MDN BCD + Context7 三角验证 |
| Vue 3 / Vite ecosystem | ~3,100 | `docs/plan/vue3-ecosystem-research-20260615.md` | Context7 主源,版本号对照官方 CHANGELOG |

### 0.3 Review 复核(3 轮并行子 agent,v2 增量)

| Pass | 字数 | 用途 |
|---|---|---|
| Citation accuracy | ~3,500 | 50 处 file:line 逐条 grep 验证 |
| Coverage gap check | ~3,200 | 11 个未覆盖领域,30+ 错失优化点 |
| Priority validation | ~3,000 | Tier 1-4 重新洗牌 + do-not-touch 冲突标注 |

### 0.4 通用限制

- Firecrawl MCP 全部 401(无 key)
- WebSearch 全部 400(参数错)
- WebFetch 被网络白名单拦住(wikipedia / github.io / dev domains)
- 所有子 agent 兜底:`curl -A "Mozilla/5.0"` + Context7 + 训练数据 + 显式标注

### 0.5 v1 → v2 主要修正清单(经 review 验证)

| # | v1 主张 | v2 修正 | 来源 |
|---|---|---|---|
| 1 | `graphology + d3-hierarchy 全部声明但 0 引用` | `graphology` 0 引用;`d3-hierarchy` 在 `src/components/geography/LocationTreeMap.vue:45` 有 1 处真实使用 | grep 验证 |
| 2 | Mem0 "写 v3 / 删 v1" | 实际:写/搜 `v3`(`.replace('/v1','/v3')`),删走裸 `${apiUrl}`(既不是 v1 也不是 v3) | `chat.js:1103,1145,1180` grep 验证 |
| 3 | duplicate `@keyframes spin` at main.css:34,488 | 主重复在 `AppShell.vue:488`,main.css:34 是唯一定义;还有 3 处同 keyframes 在 `Writing.vue:4434` / `ProseEssay.vue:4182` / `InputArea.vue:493` | 多文件 grep |
| 4 | Express 9 routes | 实际 8(advisor/chat/config/events/game/generate/openclaw/preferences) | `ls server/routes/` |
| 5 | `ecosystem.config.{js,cjs}` 字节完全一致 | `md5sum` 不同(`a25377ac...` vs `de7c6735...`);`.js` 用 ESM `export default`,`.cjs` 用 CJS `module.exports` | `md5sum` 验证 |
| 6 | `docs/demo/pass2-screenshots/` 目录不存在,git history 味道 | 目录真存在,6 个 PNG;`docs/demo/welcome-directions/` 也存在 | `ls docs/demo/` |
| 7 | docs/demo/ 4 个未 track 文件 | 实际 3 个(`first.png` + 2 welcome JPG);`kao.jpg` 已在 `3567fee` 入库 | `git status` |
| 8 | 88 test files | 实际 87 | `ls __tests__/` |
| 9 | Tier 1 #3 graphology 接入 1-3 天 | 实际 1-2 周(nations.ts 1358 LoC,Dijkstra parity 验证),降到 Tier 2 | priority validation |
| 10 | Tier 1 #7 VueUse 13 1-3 天 | 实际是 sweep(横跨 39 services 的 `getItem/setItem`),降到 Tier 2 | priority validation |
| 11 | Tier 1 #14 世界书变可见面 1-3 天 | 实际是 Tiptap 替换的一部分,降到 Tier 2 合并 #24 | priority validation |
| 12 | Tier 1 #15 营销 BYOK+隐私 1-3 天 | v5 in-flight 冲突,降到 Tier 3 标 "post-v5" | priority validation |

### 0.6 v2 → v3 主要修正清单(经本轮第 4 次 review 验证)

| # | v2 主张 | v3 修正 | 来源 |
|---|---|---|---|
| 1 | Tier 1 #10 "立体感 v5 plan doc 落地"(`plans/2026-06-15-stereo-migration.md` 缺失) | **错**。plan 真实存在(`plans/2026-06-15-stereo-migration.md` 51 KB / 1164 行 / 2026-06-15 09:24 写就);本项从 Tier 1 删除,§0.6 与 §1.10 / §2.2 table / §5.1 / §5.4 / §6 Q3 / §8 retention 全部划线标注 | `ls + wc` 验证 |
| 2 | "3 过期 spec" 年龄:`pinax-homepage 18d / realistic-tectonics 12d` | 数字错。真实年龄:mem0-cors 11d / pinax-homepage 6d / realistic-tectonics 7d / internal-agent-workflow 7d;**只 1 个真过期 (mem0-cors),其他 3 个接近 7d 警戒线** | `ls -la` mtime |
| 3 | Tier 1 #5 描述 `("3 个过期 spec 收口")` | 改为"过期 spec 收口(共 4 个待加 status / 收口 / 重审)" | 见 #2 |
| 4 | §8 retention summary 仍列"立体感 v5 plan doc"为 v2 新增 Tier 1 | 改为"v2 新增 5 项,1 项 v3 修删(立体感 v5 plan doc 实已存在)" | 见 #1 |

---

## 1. Executive Summary (TL;DR)

Pinax 在差异化点(worldbook 上下文构建、地图引擎、kao 档案册美学)上具备真实护城河。**架构债**与**已申报未使用的依赖**同时存在,推高变更成本。**v2 → v3 review 后 Tier 1 重洗牌**,核心结论是:**最高 ROI 的 11 个 Tier-1 中(v3 修:v2 列 12 个,其中 #10 立体感 plan doc 误判已删),9 个不需要"do not touch" exception,只有 2 个(世界书 bug + save debounce)需要用户授权例外**。

**最高杠杆的 Tier-1 优化**(按 ROI 重排):

1. **v-memo on list**(`QuestLog.vue` / `MemoryIndicator.vue` 列表项)— 1 小时,零风险
2. **Mem0 删除路径走 v3**(`server/routes/chat.js:1180`)— 1 行修真实 bug
3. **`/healthz` + `/readyz`**(PM2 health_check 闭环)— 1 天
4. **404 catch-all**(`src/router/index.js:118-129`)— 半天
5. **过期 spec 收口**(`mem0-cors-proxy` 11d 待加 status header / `pinax-homepage` 6d / `realistic-tectonics` 7d / `internal-agent-workflow` 7d 共 4 个)— 半天 doc 卫生
6. **删 `useExperienceStore`**(7d 观察期后)— 1 小时
7. **AppShell drawer focus trap**(`inert` + Esc)— 1 天 a11y
8. **Color contrast `#9a6a2f` → token** — 1 天真 bug
9. **Vue 3.5 特性**(`defineModel` / `useTemplateRef` / `useId` / `onWatcherCleanup` / `effectScope`)— zero-risk drop-in
10. **立体感 v5 plan doc** — **v3 修:已存在**(`docs/superpowers/plans/2026-06-15-stereo-migration.md` 51 KB / 1164 行 / 2026-06-15 09:24 写就);v2 误判为"缺失"已订正。
11. **V2 世界书规范对齐 + CJK token 修 + save debounce** — 1 个 "do not touch" exception 申请
12. **Pinia 3 升级** + **Vitest 4 升级**(sweep-limited)+ **`markRaw` LLM 响应对象** — 版本 bump + 微型 perf 修

**未释放的核心市场空白**:

- "**隐私优先 + 重世界观构建 + 可冒险**" 三者交集 = 空白,Pinax 已落位
- "**CJK-first + LXGW 字体 + mem0ai 依赖**" = 唯一组合,无主要竞品匹配

**两个被阻碍的体验**(不变):

- 真实 AI 手测被 `text.pollinations.ai` 429 阻塞(STATUS.md Blocked 2026-06-09)
- Playwright/Chromium 不可用,visual verification 仅靠数字指标 + 7 个 demo 资产(2 个目录 + 5 个文件)

**v2 新增 14 个优化点**,跨 11 个之前未覆盖的领域:i18n / observability / dep 卫生 / 性能预算 / on-boarding / a11y scaffolding / CI / 命令面板 / 备份导出 / Vector RAG spike / IF scene-state token / PWA offline shell。

完整 74 个优化点见 §4(原 60 -3 错 + 14 新 = 71,加 3 个 review 引入的"必要变更" = 74)。线程对齐见 §5。

---

## 2. Internal State (Audits)

### 2.1 Frontend — 70k LOC / 249 文件

**架构全景**:

| 目录 | 文件 | LOC | 职责 |
|---|---|---|---|
| `pages/` | 9 .vue | 21,127 | 路由级页面 |
| `services/` | 39 + 33 | ~16,800 | 纯逻辑:prompt、storyboard、AI、memory、地图引擎 |
| `components/` | 13 + 8 子目录 = 44 | 17,405 | UI 组件;子目录:canvas / debug / folio / geography / gm-persona / workbench / worldbook |
| `stores/` | 4 | 4,820 | Pinia:gameStore 2398 / worldStore 735 / experienceStore 467 / geographyStore 220 |
| `composables/` | 19 | 3,049 | Hook |
| `layouts/` `views/` `styles/` `router/` `config/` `utils/` `types/` | — | 1,400 | 边角 |

**4 个超 4k LoC 的页面**:`ProseEssay.vue` 4657 / `Writing.vue` 4604 / `WorldBookQuickImport.vue` 3757 / `Notes.vue` 2748(经 `wc -l` 验证)。

**4 个超 1k LoC 的组件**:`WorldMapVoronoi.vue` 1306 / `MemoryIndicator.vue` 1274 / `QuestLog.vue` 1132 / `ImageGenRail.vue` 1042(经 `wc -l` 验证)。

**1 个上帝 store**:`gameStore.js` 2398 LoC,`useExperienceStore`(467 LoC)是孤儿(`grep -rn useExperienceStore src/` 零调用点,已 grep 验证)。

**1 个上帝 route**:`server/routes/chat.js` 1194 LoC,17 LLM provider 全部内联(`PROVIDER_DEFAULTS` 在 `chat.js:11-29`,key 用 `claude` 而非 `anthropic`,`textgenwebui` 也在但未在 v1 列表)。

**god service**:`services/api.js` 1127 LoC,30+ exports。

**god composable**:`useCopilot.js` 514 / `useMem0.js` 594 / `useDirector.js` 442 LoC。

**UI 契约测试是文本断言**:`uiPolish.test.js` / `welcomeView.test.js` / `workbenchNav.test.js` 全部 `readFileSync` + 字符串匹配。

**a11y 覆盖**:6 个 worldbook field 组件(vitest-axe),23 个组件零审计。

**性能热点**:
- `useGameStore` 50+ state 字段,任意变更触发全部订阅者重渲染
- `saveCurrentSession` 25 个调用点(其中 25 在 `gameStore.js` 内部,1 个跨文件在 `pages/Experience.vue:479`)
- 4 个 4.5k LoC 页面 mobile first-paint long task
- **`grep -rE "v-memo|v-once" src/` 零命中**(经 v2 grep 复核确认)

**架构守卫**:`architectureGuard.test.js` 静态扫描 src/,断言只有 `services/api.js` 和 `services/generationRetry.js` 可以调 `sendChat(`。

### 2.2 Backend — Express / 8 routes / 17 providers(已修 v1 误数)

**API 表面**(全部无 auth,全部信任 body 字段,经 `ls server/routes/` 复核 8 个):

| 类别 | 端点 |
|---|---|
| Legacy text-adventure(实质死) | `POST /api/game/start`、`GET /api/game/state/:gameId`、`POST /api/game/action` |
| 静态数据 | `GET /api/events/categories`、`GET /api/events/:category`、`GET /api/config/worlds`(+ by id) |
| LLM 代理(主力) | `POST /api/chat/chat`、`POST /api/chat/stream`、`POST /api/chat/models`、`POST /api/chat/test` |
| Mem0 代理 | `POST /api/chat/mem0/{test,memories,search,delete}` |
| 偏好 | `POST /api/preferences/{record,memory}` |
| Advisor | `POST /api/advisor/{task,advice}`、`POST /api/openclaw/proactive-check` |
| 兜底 | `GET /*` → dist/index.html(SPA) |

**LLM provider 矩阵**(`chat.js:11-29` `PROVIDER_DEFAULTS` keys,v2 修正):openai / openrouter / **claude**(v1 误为 "anthropic")/ deepseek / groq / mistral / cohere / perplexity / ollama / lmstudio / **textgenwebui**(v1 漏) / pollinations / moonshot / fireworks / xai / siliconflow / ai21,共 17 家。

**WebSocket**:`server` **不暴露** WS 端点。`ws` 只作为客户端连接本地 OpenClaw 网关。

**安全审计**:
- CORS 全开(`cors()` 无 options → `*`)
- 无 auth / 无 rate-limit / 无 helmet / 无 CSP / 无 HSTS
- API key 在 body 中传递(用户自带),不持久化
- **Mem0 路径不一致(v2 修正)**:写/搜走 v3(`chat.js:1103,1145` 都用 `.replace('/v1','/v3')`);删走裸 `${apiUrl}`(`chat.js:1180`),**既不是 v1 也不是 v3**

**性能 / 运维**:
- 100KB body 默认限制
- 客户端断开后 `/api/chat/stream` 继续 drain
- `stateManager` Map 无界增长
- `memoryService#clientCache` 无淘汰
- 无 `/healthz`、无结构化日志、无 metrics、无 graceful shutdown
- **`ecosystem.config.{js,cjs}` 字节不同**(v2 md5sum 验证:`a25377ac...` vs `de7c6735...`;`.js` ESM `export default` vs `.cjs` CJS `module.exports`);`/root/Pinax` 硬编码 log 路径(v1 主张仍成立)

**服务模块 LOC**(v2 微调 1 行偏差):`openclawService.js` 437 / `eventEngine.js` 280 / `memoryService.js` 96(v1 误为 97)/ `stateManager.js` 52(53)/ `timeSystem.js` 59(60)/ `advisorTaskService.js` 155(156)。

**server/data 实质上是死的**(不变):`data/worlds/*/world.json` 和 `data/events/*.json` 在 `eventEngine` 休眠后基本只被 `/api/config/worlds` 和 `/api/events/*` 消费;可迁 SPA bundle。

### 2.3 Map Engine — 12k LoC / 29 TS files

**架构**:`src/services/world-map/` 自治子系统。

**关键发现(v2 修正)**:
- **`graphology` 申报但 0 引用**;**`d3-hierarchy` 在 `src/components/geography/LocationTreeMap.vue:45` 有 1 处真实使用**(`import { stratify, tree } from 'd3-hierarchy'`,v2 grep 复核)。v1 "全部 0 引用" 主张错误。
- **delaunator 使用一次**(`engine/grid.ts:6`),默认 6000 点。
- **路径规划无公开 API**。`nations.ts:25-77` MinHeap 已知引起 2 次 heap-corruption 回归。
- **渲染是裸 Canvas2D,无 scene graph**。每个 `draw*` 都重画全部 6000 cell。
- **Worker 桥**:comlink 暴露 `generateMap`,60s timeout,**未用 Transferables**。
- **OffscreenCanvas 未用**。
- **持久化空白**:`geographyStore.js:189 persistMapData` 存 `voronoiConfig + markers + lastGenerationMeta`(v2 修正:v1 漏 `lastGenerationMeta`)。
- **3D 切换是 stub**:`WorldMapPanel.vue:18-21` 弹 `alert('3D 地图功能正在开发调优中')`。
- **性能天花板**:6k cells 流畅 / 10k 容忍 / >15k pointermove 期间 jank。
- **schema 无版本号**。

**渲染管线**:`WorldMapVoronoi.vue:484 paint` 在每次 `pointermove` 都全量重画 — 最大的 perf 痛点。

**重绘时的 reactivity 风险**:**没有 debounce**,拖拽延迟高。

### 2.4 Tests / Docs / Specs — **87** test files / 10,939 LoC(v2 修正)

**测试分布**(经 v2 grep 复核):87 个 `.test.js` 文件(v1 误 88)。

**测试缺口**:23 个 Vue 组件 / 页面 / 视图零直接测试;9 个 service 零直接测试;3 个 store 零直接测试;13 个 composable 零测试。

**质量**:
- uiPolish contract test = 39 个 readFileSync 断言,refactor rename 即爆
- 27/87 用 `vi.mock` / `vi.fn`(v2 复核)
- 无 `it.skip` / `xit` / 慢测试标注
- `visual-verification.test.js` 是唯一快照(20k cells < 10s 等数字预算)

**a11y**:vitest-axe 1 个测试文件,6 个世界书字段组件。folio / gm-persona / geography 组件零 a11y 覆盖。

**Playwright 缺口**(不变):环境无 Chromium/Playwright,visual verification 仅靠数字 + 手动截图。

**手动截图清单**(v2 修正 `docs/demo/`):3 个未 track(`first.png` + `pinax-welcome-ak-20260612_001.jpg` + `pinax-welcome-p5r-20260612_001.jpg`)+ 1 个已 track(`kao.jpg` commit `3567fee`)+ 2 个 tracked 目录(`pass2-screenshots/` 含 6 PNG;`welcome-directions/`)。v1 主张 `pass2-screenshots/` 不存在 **错误**。

**Spec 成熟度**(`docs/superpowers/specs/`,9 个,不变):

| Spec | 状态 | 备注 |
|---|---|---|
| `2026-05-28-mem0-cors-proxy-design.md` | 隐含已实现,无 status header | 11d(v3 修:原误为 18d),需加 status |
| `2026-05-28-pinax-homepage-design.md` | "状态:待实现" | **6d(v3 修:原误为 18d)未升 plan,实质废弃** |
| `2026-06-03-realistic-tectonics-rendering-design.md` | "状态:待批准" | **7d(v3 修:原误为 12d)未批准,实施已走** |
| `2026-06-08-internal-agent-workflow-design.md` | "Status: Draft" | **7d 未审** |
| `2026-06-10-ui-redesign-design.md` | Approved v1 | 5d,实施中 |
| `2026-06-11-welcome-experience-pass2-design.md` | "Status: Draft v3 — awaiting re-review" | **实施不等再审** |
| `2026-06-11-welcome-experience-pass3-fixes-design.md` | (无状态) | 被 pass4 吸收 |
| `2026-06-11-welcome-experience-pass4-resume-and-density-design.md` | (无状态) | 已实施 |
| `2026-06-15-stereo-migration-design.md` | Approved v5 | 今日,active in flight,**plan doc 已存在**(v3 修:`plans/2026-06-15-stereo-migration.md` 51 KB / 1164 行) |

**Skill 生态**(`agent-skills/` 7 个):
- `agent-maintenance` / `commit-conventions` / `docs-status-handoff` / `map-engine-workflow` / `testing-verification` / `ui-style-check` / `worldbook-workflow`
- 缺失:`refactoring` / `simplify` / `architecture-decision` / `release-management` / `data-migration`
- 冗余:`testing-verification` + `verification-before-completion`(同域)

---

## 3. Market Landscape (Research)

8 份市场调研(§0.2 索引)+ 3 段 v2 新洞察:

### 3.0 v2 新增的关键引用(从子 agent 复核中提取)

- **Worldbuilding platforms research §8.7**:"PWA + 离线 + localStorage-native。Obsidian 是唯一 mobile 好的;其他都依赖云。**Pinax 的 localStorage + Vue 3 已经天然 PWA 友好**,这是难得的差异化——可以在 `/worldbook` 上做"完全离线 + IndexedDB 同步",对飞机/信号差场景特别有用。" → 升为 Tier 1 vite-plugin-pwa sub-scope。
- **IF engines research §8.6**:"**No first-class `currentScene` in `gameStore`.** Inform 7, Narrat, and Ren'Py all have this. The worldbook can hint at scenes; the runtime doesn't *know* the scene. **No scene-resumption token.** When the user reopens a session, Pinax re-reads the last N turns and asks the AI to "continue." A small `sceneState` token (`{ scene: "frostmaw.threshold", beat: 2, mood: "tense" }`) would let the AI resume more cleanly. **No inspectable save.** Pinax stores sessions to `localStorage`; there is no UI to "open the save" and see the worldbook + memory + last 10 turns as a structured view. **This is a 2-3 day feature and would be a major UX win.**" → 升为 Tier 2 currentScene/sceneState token。
- **Vue 3 ecosystem research §7.7**:"`effectScope` for per-session disposables。VueUse best-practice docs show `scope.run(() => { useEventListener(...); watch(...) })` + `scope.stop()` for "torn down at end of session" resources. Pinax's session lifecycle (start → play → save → end) is the perfect consumer — every event listener, intersection observer, and `watch` registered during a session can be in one scope." → 升为 Tier 2。

### 3.1 AI 写作助手(10+ 工具,不变)

**核心空白**:"隐私优先 + 重世界观构建 + 可冒险"三者交集 = 空白。Pinax 已落位。

**2025-2026 胜出组合**:**BYOK + 隐私作为第一卖点**。Pinax 已有 `apiSettings` BYOK 管道,营销没讲出来。

**必备 UX**(不变):
- **Story Bible / Codex 右侧栏**
- **Beats 作为规划原语**
- **沉入阅读 focus mode**
- **分支 IF 作为第一类概念**

**唯一组合**:CJK-first + LXGW 字体 + mem0ai 依赖 = 无主要竞品匹配。

### 3.2 IF 引擎(13 个,不变)

**唯一成熟 web 运行时**:**inkjs**。

**最接近 Pinax 轨迹的参考**:**Latitude `.promptl`**。

**最干净的 GM 指令模型**:**Yarn Spinner "commands as first-class concept"**。

**最优雅的统计原语**:**ChoiceScript FairMath**。

**最 publishable 的导出**:**Twine "single HTML file"**。

**Pinax 专属空白(原 + v2 新)**:
- 本地优先 IF
- 世界书感知的分支
- AI-as-parser
- `.pinax` 文件格式
- **`currentScene` + `sceneState` token**(v2 新)
- **inspectable save**(v2 新)

### 3.3 Worldbuilding 平台(11 个,不变)

**常态**:typed-entity + 关系 + 时间线模块 + tag/wiki UI 组合。

**Pinax 应学(原 + v2 新)**:
- 关系注入
- 时间线模块
- schema 文档
- 双向链接
- tag-based retrieval
- **PWA + 离线 + localStorage-native**(v2 新,从研究 §8.7 升)

**最强差异化**:**entity-level RAG + 关系感知**(配合 v2 Tier 2 Vector RAG spike 落地)。

### 3.4 Worldbook / Lorebook AI(不变)

**V2 spec 兼容性现状**:80%。**缺**:`enabled` / `position` / `selective` / `case_sensitive` / `extensions: {}` bag。**50 LoC 级添加**。

**最深的 lorebook spec**:**SillyTavern**。

**最干净的 V2 实现**:**Agnai**。

**新战场**:**Vector RAG**(v2 升为 Tier 2 spike)。

**真实 bug**:`tokenBudget * 2` heuristic。

### 3.5 块编辑器(不变)

**Pinax 的选择**:**Tiptap v3 + `@tiptap/vue-3` + `@tiptap/markdown`**。

### 3.6 Local-first / Sync(不变)

**Phase A → B → C(条件触发)→ D(条件触发)**。**默认不上 RxDB / Yjs**。

### 3.7 地图渲染库(12 个,不变)

**推荐路径(分阶段)**:A PixiJS 8 painterly 叠层 → B Konva 10 marker drag 层 → C PixiJS 接管 cells → D WebGPURenderer feature flag → E Rough.js 装饰 → F D3 7.9 静态导出。

**已尊重的硬约束**:style-presets 调色板和 realism-metrics 重采样不动。

### 3.8 Vue 3 / Vite 生态(2025-2026,不变 + v2 增 effectScope)

**版本地形**:Pinax 落后一档。

**最大未利用**:
- Vue 3.5 特性(`defineModel` / `useTemplateRef` / `useId` / `onWatcherCleanup` / **`effectScope`** v2 新增)
- VueUse 13(200+ 树摇 composable)
- `shallowRef` + `markRaw` + `v-memo`(v2 升 `v-memo` 为 Tier 1)
- **`markRaw` on LLM 响应对象**(v2 新增,避免 Vue proxying 跨 AI tick)

---

## 4. Optimization Points (Ranked, v2)

> v2 重洗牌逻辑:原 60 -3 错 + 14 新 = 71 + 3 review 强制修正 = **74 个**。
> Tier 1 = 11 个(v3 修:v2 列 12 个,删 #10 立体感 plan doc 误判);Tier 2 = 19 个;Tier 3 = 18 个;Tier 4 = 17 个;**新增 Tier 5 = 8 个 "v1 误判需纠正"**。

### Tier 1 — 最高 ROI / 1-3 天可做(v2 重排)

| # | 主题 | 行动 | 文件:行 | 影响 / 例外 |
|---|---|---|---|---|
| 1 | **v-memo on list**(v2 从 T2 升) | 给 `QuestLog.vue` / `MemoryIndicator.vue` 列表项加 `v-memo` | `src/components/QuestLog.vue:1132` / `src/components/MemoryIndicator.vue:1274` | 1 小时;代码库当前 `v-memo` / `v-once` 零命中(v2 grep 验证) |
| 2 | Mem0 删除路径走 v3 | `chat.js:1180` 改用 `.replace('/v1','/v3')` | `server/routes/chat.js:1180` | 1 行修真实 bug |
| 3 | `/healthz` + `/readyz` | 新建 `server/routes/health.js`,wire PM2 `health_check` | `server/index.js:55` + new `routes/health.js` | 1 天 |
| 4 | 404 catch-all | 加 `/:pathMatch(.*)*` 路由显式 404 | `src/router/index.js:118-129` | 半天 |
| 5 | 过期 spec 收口(共 4 个) + mem0-cors spec header(v3 修:原误"3 个") | 加 `SUPERSEDED` frontmatter 或 status 行 | `docs/superpowers/specs/2026-{05-28,06-03,06-08}-*.md` + `2026-05-28-mem0-cors-proxy-design.md` | 半天 doc 卫生 |
| 6 | 删 `useExperienceStore`(7d 观察期后) | `useExperienceStore` 467 LoC 零调用点;观察期满后 1 行 import 全删 | `src/stores/experienceStore.js:7-467` | 1 小时 |
| 7 | AppShell drawer focus trap(v2 从 T3 升) | 加 `inert` on `<main>` + Esc 关闭 | `src/layouts/AppShell.vue:84-117` | 1 天 a11y |
| 8 | Color contrast `#9a6a2f` → token(v2 从 T3 升) | `.rp-dialogue-quote-warm` 当前在 archive paper 上 fail WCAG AA | `src/styles/main.css:694-700` | 1 天真 bug |
| 9 | Vue 3.5 特性 sweep | 启用 `defineModel` / `useTemplateRef` / `useId` / `onWatcherCleanup` | Vue 全局 | drop-in 收益 |
| 10 | ~~立体感 v5 plan doc 落地(v2 新)~~ | **v3 修:已存在**(`docs/superpowers/plans/2026-06-15-stereo-migration.md` 51 KB / 1164 行 / 2026-06-15 09:24 写就);本条从 Tier 1 删除 | — | 0 |
| 11 | **V2 世界书对齐 + CJK token 修 + save debounce**(bundle exception) | 一次申请 `worldbook-workflow` + `gameStore` 例外;3 个 fix 一并发 | `src/services/worldbookContextBuilder.js` + `src/stores/gameStore.js`(都 "do not touch") | **例外请求先** |
| 12 | Pinia 3 升级 + `markRaw` on LLM(v2 增 `markRaw` 单独条目) | 版本 bump 单独 PR(不绑 setup-store 迁移);`useCopilot.js` / `useMem0.js` LLM 响应 `markRaw` | `package.json` + `src/composables/useCopilot.js` / `useMem0.js` | 1-2 天,v2 grep 验证 LLM 响应未 markRaw |

**v2 新增 6 个 Tier 1**:
- #1 (v-memo,从 T2 升)
- #7 (focus trap,从 T3 升)
- #8 (color contrast,从 T3 升)
- ~~#10 (立体感 v5 plan doc,新)~~ — **v3 修:已存在,删除**
- #12 内含 `markRaw` LLM 响应(新)
- vite-plugin-pwa sub-scope:install + manifest + offline fallback page(不绑 push/auto-update)— 见 Tier 2 #21

**v2 降级 5 个**:
- 原 #3 graphology → T2
- 原 #7 VueUse 13 → T2
- 原 #14 世界书变可见面 → T2(合并 Tiptap)
- 原 #15 营销 BYOK+隐私 → T3(v5 冲突)
- 原 #9 Vitest 4 升级 → T1(保留但加 caveat: 27 个 vi.mock 测试需要 sweep)

### Tier 2 — 高影响 / 中风险 / 1-2 周

| # | 主题 | 行动 | 文件 | v2 变化 |
|---|---|---|---|---|
| 13 | 接入 graphology(v2 从 T1 降) | 用 `Graph()` + `cells.c[]` 当 edges,替换 `nations.ts:25-77` MinHeap;需 parity test 覆盖已知 2 个 heap-corruption 场景 | `src/services/world-map/engine/nations.ts:25-77` | T1→T2 |
| 14 | 装 VueUse 13 + 选择性替换(v2 从 T1 降) | 装 `@vueuse/core@13`,优先替换 `useEventListener` / `useDebounceFn` / `useStorage`;`useStorage.js` 迁移跨 39 services | `package.json` + 39 services | T1→T2 |
| 15 | **Tiptap v3 替换 + 世界书变可见面 (Story Bible/Codex 右侧栏)**(v2 合并原 #14 + #24) | 装 `@tiptap/vue-3` + `@tiptap/markdown`,换 `pages/Writing.vue` / `Notes.vue` / `ProseEssay.vue` 的 v-html 预览,顺手加 Codex 右侧栏 | `src/pages/{Writing,Notes,ProseEssay}.vue` | T1→T2(原 #14)+ 原 #24 合并 |
| 16 | 拆 `api.js` 上帝 service(1127 LoC) | 拆 `api/transport.js` + `api/context.js` + `api/preferences.js` | `src/services/api.js` | 不变 |
| 17 | 拆 `chat.js` 上帝 route(1194 LoC) | 拆 `chat` / `stream` / `models` / `mem0` / `llmProviders/*.js` | `server/routes/chat.js` | 不变 |
| 18 | LLM provider 拆文件 | `services/llmProviders/{openaiCompatible,claude,cohere,deepseek}.js` | `server/routes/chat.js:11-29` + 调用点 | 不变 |
| 19 | 加 helmet / compression / request-id / body-size limit | 替代裸 `cors()` + `express.json()` | `server/index.js:36-37` + 新 `middleware/` | 不变 |
| 20 | Graceful shutdown | SIGTERM → `server.close()` + drain timeout | `server/index.js:28-34` | 不变 |
| 21 | 限 `stateManager` + `memoryService` 缓存 | TTL 或 LRU | `server/services/stateManager.js:3` + `memoryService.js:5` | 不变 |
| 22 | vite-plugin-pwa install + manifest + offline shell | PWA manifest + service worker skeleton + offline fallback;绑 worldbook route 做离线壳 | `vite.config.js` + `src/worldbook/` 离线壳 | 不变(scope 收敛) |
| 23 | PixiJS 8 painterly 叠层 | 装 pixi.js + pixi-filters,作为后处理叠在当前 Canvas2D 上 | `src/components/geography/WorldMapVoronoi.vue` + `src/services/world-map/engine/renderer.ts` | 不变 |
| 24 | Konva 10 marker drag 层 | 装 konva + vue-konva 3.4,接管 marker drag | `src/components/geography/WorldMapVoronoi.vue` 拖拽路径 | 不变 |
| 25 | Local-first Phase A | schema 文档 + IndexedDB 替代 localStorage 写热点 | `src/composables/useStorage.js` + 新 `services/storage/IndexedDBStore.js` | 不变 |
| 26 | **`comlink.transfer()` worker payload** | 改 `worker-bridge.ts:91-98` 用 `comlink.transfer(Float64Array.buffer)` | `src/services/world-map/engine/worker-bridge.ts` | 不变 |
| 27 | IndexedDB 缓存 `VoronoiMapData` | key = `seed + configHash`,lazy rehydrate | `src/stores/geographyStore.js:189` | 不变 |
| 28 | **Vector RAG 世界书 spike**(v2 从 T4 升) | 装 mem0ai 已装;1-2 周 spike:100 entries → mem0ai 提取 entities + relations + 索引;A/B 测上下文质量 | `src/services/worldbookContextBuilder.js`("do not touch" 例外) | T4→T2(spike) |
| 29 | **`currentScene` + `sceneState` token**(v2 新) | `gameStore` 加 `sceneState: { scene, beat, mood }` 字段,会话恢复时携带 | `src/stores/gameStore.js`("do not touch" 例外) | 新 |
| 30 | **`effectScope` per session**(v2 新) | 每个会话一个 `effectScope`,`scope.stop()` 清理 watchers / listeners / observers | `src/composables/useSession.js`(新)或 `useCopilot.js` | 新 |
| 31 | **i18n 基础设施**(v2 新) | 装 `vue-i18n@9`;`Settings.vue:33-35` 已暴露 `locale: 'zh-CN' | 'en-US'` 但无效果;加 `messages/zh-CN.json` + `messages/en-US.json`;chrome 留中文,error/toast/worldbook schema 文档走 en-US | `src/components/Settings.vue:33-35,232` + 新 `src/i18n/` | 新 |
| 32 | **First Project seed template**(v2 新) | Welcome empty state 自动 seed 1 worldbook + 1 character + 1 scene;`server/data/worlds/*` 是现成候选(虽 audit 标 "实质死",但 `getWorlds()` 仍服务) | `src/views/WelcomeView.vue` + `server/data/worlds/` | 新 |
| 33 | **ecosystem.config 确定性 + 部署 runbook**(v2 新) | `ecosystem.config.cjs` 与 `.js` md5 不同需 dedup(经 v2 验证);`/root/Pinax` 硬编码 log 路径需参数化;加 `docs/operations/deploy.md` | `ecosystem.config.{js,cjs}` + `server/index.js:55-57` + `docs/operations/deploy.md` | 新 |
| 34 | **`/healthz` + PM2 `health_check` 闭环** | PM2 `health_check` 钩 `curl /healthz` | `ecosystem.config.js` + `/healthz` endpoint(#3) | 不变(合 #3) |

### Tier 3 — 中影响 / 1 月+

| # | 主题 | 行动 | 文件 | v2 变化 |
|---|---|---|---|---|
| 35 | 拆 `gameStore.js` 上帝 store(v2 从 T2 降) | 2398 LoC 实拆需 4-6 周(persistedstate v4 per-store pick + 27 mock-heavy tests 回归) | `src/stores/gameStore.js:426-2398` | T2→T3 |
| 36 | 拆 ProseEssay / Writing 4.6k LoC 页面(v2 从 T2 降) | 同上 4-6 周;Phase 1B in-flight 风险 | `src/pages/ProseEssay.vue` / `src/pages/Writing.vue` | T2→T3 |
| 37 | Per-layer OffscreenCanvas(v2 从 T2 降) | 3 canvas 拆 + worker 化,2-4 周 | `src/components/geography/WorldMapVoronoi.vue` | T2→T3 |
| 38 | 删 legacy `/api/game/*` | 实质死(关键词引擎 / stateManager / timeSystem) | `server/routes/game.js` + `services/{stateManager,timeSystem,eventEngine}.js` | 不变 |
| 39 | server/data 迁 SPA bundle | 消除 2 routers + 1 service | `server/data/{worlds,events}/` → `src/data/` | 不变 |
| 40 | 修 `storyforge-setting-panel.md` | 实施已超过规划 | `docs/plan/storyforge-setting-panel.md` | 不变 |
| 41 | 测 23 个无测试组件 | 用 @vue/test-utils mount 写运行时测试 | `src/__tests__/{welcomeView,experience,openingPage,gamePanel,inputArea,proseEssay,writing,notes,...}.test.js` | 不变 |
| 42 | 加 `npm run test:coverage` | 装 c8/istanbul | `package.json` + `vitest.config.js` | 不变 |
| 43 | mount 测试替代文件字符串测试 | 拆 `uiPolish.test.js` 39 tests → per-component | `src/__tests__/uiPolish.test.js` | 不变 |
| 44 | a11y 扩 folio + gm-persona | vitest-axe | `src/components/folio/*` + `src/components/gm-persona/*` | 不变 |
| 45 | Color contrast `.rp-dialogue-quote-warm` 修法 | (与 T1 #8 是同一 fix,T1 修后此处冗余) | — | 移出 |
| 46 | 服务端结构化日志 + request-id | pino + correlation id middleware | `server/index.js` + `server/routes/*` | 不变 |
| 47 | 用户手册更新 | 反映"角色化 AI GM 工作台"产品转向 | `docs/user-manual/02-concepts.md` + `03-features.md` | 不变 |
| 48 | data-migration skill(v2 从 T3 降) | 编码"迁移期双轨"工作流 | `agent-skills/data-migration/SKILL.md` | T3→T4 |
| 49 | release-management skill | PM2 / ecosystem.config / troubleshooting 桥 | `agent-skills/release-management/SKILL.md` | 不变 |
| 50 | 营销材料 BYOK+隐私(v2 从 T1 降) | README + WelcomeView hero,v5 in-flight 冲突,标 "post-v5" | `README.md` + `views/WelcomeView.vue` | T1→T3 |
| 51 | **Perf SLO / 预算测试**(v2 新) | 新 `__tests__/perfBudget.test.js`:time-to-first-token P95,marker drag frame time P95,saveCurrentSession 批大小,LCP 阈值;基于现有 build artifact 测量 | `src/__tests__/perfBudget.test.js`(新) | 新 |
| 52 | **Pre-commit hook fails on console.error**(v2 新) | 自定义 Vitest reporter 失败于测试中 `console.error`;堵住 19 个已知 stderr 源 | `vitest.config.js` + new reporter | 新 |
| 53 | **a11y scaffolding: skip-link + reduced-motion + aria-live**(v2 新) | 1 PR 加 `<a class="skip-link">` + `@media (prefers-reduced-motion: reduce)` + streaming AI `aria-live="polite"` region | `src/layouts/AppShell.vue:65-96` + `src/styles/main.css` | 新 |
| 54 | **GitHub Actions matrix**(v2 新) | lint + test + build + Playwright dry-run;关掉"env 无 Chromium" gap with chromatic / reg-suit | `.github/workflows/ci.yml`(新) | 新 |
| 55 | **localStorage 配额监控**(v2 新) | `useStorage.js` 加 quota 监控 + "session storage full" 警告,解决 #4 save 吞吐之外的 quota 维度 | `src/composables/useStorage.js` | 新 |

### Tier 4 — 长线 / 实验性

| # | 主题 | 行动 | 触发条件 |
|---|---|---|---|
| 56 | WebGPU PixiJS 渲染路径 | feature flag 后 `WebGPURenderer` | WebGPU 用户覆盖率 > 80% |
| 57 | Three.js 3D 地图 | 替换 `WorldMapPanel.vue:18-21` 的 alert 桩 | Phase 2 解锁 |
| 58 | Yjs 协作 | Tiptap swap 后,加 `@tiptap/extension-collaboration` | 用户明确要协作时 |
| 59 | RxDB 多设备同步 | Local-first Phase C | 用户明确要跨设备时 |
| 60 | Vue Vapor mode | 实验性 | Vue 3.6+ 文档稳定 |
| 61 | Vite 7 升级 | 跟随生态 | 等 Sass legacy 生态稳 |
| 62 | Vector RAG 完整架构 | T2 #28 spike 验证后 | spike 质量提升 >30% 时 |
| 63 | Story Bible / Codex 右侧栏 | T2 #15 合并 Tiptap 落地 | 同 #15 |
| 64 | Beats 作为规划原语 | Novelcrafter Scene Beats 模型 | 用户要"先结构后写" |
| 65 | 沉入阅读 focus mode | 单 olive-gold 页,剥 chrome | 防"chrome 倦怠" |
| 66 | 分支 IF 作为第一类 | Ink 设计语言 + Pinax `playableWorldOpeningFacts` 是种子 | 文本冒险模式优先级提升 |
| 67 | 接入 inkjs | script-graph runtime | 用户请求 |
| 68 | Yarn Spinner commands-as-first-class | 适配 hidden GM 指令 bus | 重做 OpeningPage 时 |
| 69 | Twine "单 HTML 文件"导出 | inkjs + worldbook + session log 打包 | 用户要 publishable 产物 |
| 70 | `.pinax` 文件格式(共享世界) | JSON + V2 spec `extensions` 桶;URL 分享 read-only 世界 | 用户要分享 |
| 71 | **inspectable save**(v2 新,从 IF §8.6) | UI 打开 save 看 worldbook + memory + last 10 turns 结构化视图 | T2 #29 sceneState token 落地后 |
| 72 | data-migration skill(v2 从 T3 降) | 见 #48 | T3→T4 |

### Tier 5 — v1 误判需纠正(8 个,review 显式标记)

| # | 主题 | v1 主张 | v2 纠正 |
|---|---|---|---|
| 73 | "graphology + d3-hierarchy 全部 0 引用" | 错 | `d3-hierarchy` 在 `LocationTreeMap.vue:45` 有 1 处使用;只有 `graphology` 真 0 引用 |
| 74 | "Mem0 写 v3 / 删 v1" | 错 | 写/搜 `v3`(`chat.js:1103,1145`);删走裸 `${apiUrl}`(`chat.js:1180`),既不是 v1 也不是 v3 |
| 75 | "Express 9 routes" | 错 | 实际 8(经 `ls server/routes/` 验证) |
| 76 | "ecosystem.config.{js,cjs} 字节完全一致" | 错 | md5 不同(经 md5sum 验证),ESM vs CJS |
| 77 | "docs/demo/pass2-screenshots/ 目录不存在" | 错 | 存在,6 PNG(经 ls 验证) |
| 78 | "docs/demo/ 4 个未 track 文件" | 错 | 3 个未 track + 1 个已 track(kao.jpg 在 3567fee) |
| 79 | "88 test files" | 错 | 87(经 ls 验证) |
| 80 | "duplicate @keyframes spin at main.css:34,488" | 错 | 重复在 `AppShell.vue:488`(主)+ `Writing.vue:4434` / `ProseEssay.vue:4182` / `InputArea.vue:493`;main.css:34 是唯一定义 |

---

## 5. Thread Alignment (v2)

### 5.1 UI shell 线程(WelcomeView kao + AppShell chrome + 立体感 v5)

**对位优化点(v2 更新)**:
- **Tier 1 #7**(AppShell focus trap)— 直接修 AppShell chrome
- **Tier 1 #8**(color contrast)— 修 v5 in-flight 可顺带修
- ~~**Tier 1 #10**(立体感 v5 plan doc)— STATUS.md "In flight" 缺口补~~ — **v3 修:已存在,本条删除**
- **Tier 1 #9**(Vue 3.5)— 改 WelcomeView 时自然引入
- **Tier 1 #12**(`markRaw` LLM 响应)— `useCopilot.js` UI 流畅度
- **Tier 2 #15**(Tiptap v3 + Codex 右侧栏)— Phase 1C 前置条件
- **Tier 2 #23**(PixiJS 8 painterly 叠层)— 立体感迁移的"立得视觉"
- **Tier 3 #53**(a11y scaffolding)— 修 chrome 回归时必做
- **Tier 3 #50**(营销 BYOK+隐私)— **post-v5 only**

**不要动**(不变):kao archive folio 美学 / LXGW 字体 / 立体感 v5 设计。

### 5.2 Runtime skeleton 线程(Stage 3a/3b/4 + trigger 质量 + 剧情日志)

**对位优化点(v2 更新)**:
- **Tier 1 #2**(Mem0 删除路径)— 修真实 bug
- **Tier 1 #11**(V2 世界书对齐 + CJK token + save debounce)— **bundle exception 申请**
- **Tier 1 #12**(`markRaw` LLM)— 跨 AI tick 不重 proxy
- **Tier 2 #29**(`currentScene` + `sceneState` token)— IF §8.6 直接命中此 thread
- **Tier 2 #30**(`effectScope` per session)— 1-click resume 时清理 watchers
- **Tier 2 #28**(Vector RAG spike)— 长上下文质量未来路径
- **Tier 3 #52**(pre-commit hook fails on console.error)— 修"既有 stderr warnings"已知问题

**不要动**(`gameStore.js` / `worldbookContextBuilder.js` / `generation*`)。

### 5.3 Content / demo 线程(边境王国 · 雾潮暮湾 + persona + pose brief)

**对位优化点(v2 更新)**:
- **Tier 1 #3**(`/healthz` + `/readyz`)— 让"live 手测"可监控
- **Tier 2 #15**(Tiptap Codex 右侧栏)— 让 GM 看到人物关系
- **Tier 2 #32**(First Project seed)— `server/data/worlds/*` 重启为可 seed 模板
- **Tier 2 #31**(i18n)— error/toast 多语言解锁 shareability
- **Tier 2 #23**(PixiJS painterly)— demo 视觉惊艳度 ↑
- **Tier 3 #46**(结构化日志)— 排障效率 ↑

**Blocker 复述**(不变):`text.pollinations.ai` 429。

### 5.4 Map realism 线程(立体感 + 性能残留 + Round 2.1)

**对位优化点(v2 更新)**:
- **Tier 1 #1**(v-memo on list)— map 周边 `MemoryIndicator` / `QuestLog` 列表项
- ~~**Tier 1 #10**(立体感 v5 plan doc)— 立体感 + 性能双轨的 spec~~ — **v3 修:plan doc 已存在,本条删除**
- **Tier 2 #13**(graphology)— ADR-0004 实施 = states 性能残留
- **Tier 2 #23 / #24 / #26 / #27**(PixiJS / Konva / comlink transfer / IndexedDB 缓存)— 立体感 + 性能双赢
- **Tier 3 #37**(Per-layer OffscreenCanvas)— 高阶 perf
- **Tier 3 #38 / #39**(删 legacy server data)— 服务端清理

**不要动**(不变):kao 美学 / style-presets / realism-metrics。

---

## 6. Open Questions (v2)

把决策权留给用户:

1. **是否要 dispatch 额外的调研方向?** v2 review 仍未覆盖:
   - 可访问性深度工具(axe-core 替代品 / Pa11y / Storybook a11y)
   - 性能监控(Sentry Performance / OpenTelemetry / 自建)
   - e2e 测试基础设施(Playwright deferred 的替代)
   - 移动 PWA / TWA push 通知
   - 数据迁移工具(pg-mem / drizzle-kit 等)
   - 安全审计(OWASP top 10 / npm audit / Snyk)
   - 国际化付费市场(本地化服务商)
2. **Tier 1 #11 bundle exception 申请要现在提吗?** 涵盖 V2 世界书对齐 / CJK token / save debounce 三个 fix。STATUS.md "Do not touch" 是硬约束,需要用户明确授权。
3. ~~**Tier 1 #10(立体感 v5 plan doc)要现在派 writing-plans 流程吗?**~~ — **v3 修:plan doc 已存在 (`docs/superpowers/plans/2026-06-15-stereo-migration.md` 51 KB),本问已闭环。**
4. **Tier 1 #9 + #12 是否合并成 1 PR?** Vue 3.5 特性 + `markRaw` LLM 响应是同一个 sweepless PR。
5. **Tier 2 #15(Tiptap v3 + Codex 右侧栏)是否独占一个 spec?** 还是合并到 Phase 1C plan?
6. **Tier 2 #28(Vector RAG spike)是否现在启动?** mem0ai 凭据可用性 = 429 blocker 之外的新前置条件。
7. **是否要把分散的 8 个 `docs/plan/*-20260615.md` 整合到一个 hub 文档?** 当前的分散布局符合项目惯例(每份独立研究),但用户可以要求重排。

---

## 7. Sources Index (v2)

| # | 类型 | 文件 | 字数 | v2 状态 |
|---|---|---|---|---|
| 1 | 内部审计 | (本会话子 agent 1 — frontend) | ~5,500 | 不变 |
| 2 | 内部审计 | (本会话子 agent 2 — backend) | ~3,000 | v2 修正 8 routes / 17 providers key 名 / Mem0 路径 |
| 3 | 内部审计 | (本会话子 agent 3 — map engine) | ~3,000 | v2 修正 d3-hierarchy 引用 |
| 4 | 内部审计 | (本会话子 agent 4 — tests/docs/specs) | ~3,000 | v2 修正 87 files / docs/demo/ 清单 |
| 5 | Review | (本会话子 agent 5 — citation accuracy) | ~3,500 | v2 新增 |
| 6 | Review | (本会话子 agent 6 — coverage gap) | ~3,200 | v2 新增 |
| 7 | Review | (本会话子 agent 7 — priority validation) | ~3,000 | v2 新增 |
| 8 | 市场调研 | `docs/plan/ai-writing-assistants-research-20260615.md` | 5,900 | 不变 |
| 9 | 市场调研 | `docs/plan/if-engines-market-research-20260615.md` | 6,400 | v2 引用 §8.6 |
| 10 | 市场调研 | `docs/plan/worldbuilding-platforms-research.md` | 3,300 | v2 引用 §8.7 |
| 11 | 市场调研 | `docs/plan/worldbook-market-research-20260615.md` | 5,300 | 不变 |
| 12 | 市场调研 | `docs/plan/block-editors-research-20260615.md` | 3,500 | 不变 |
| 13 | 市场调研 | `docs/plan/local-first-sync-research-20260615.md` | 3,500 | 不变 |
| 14 | 市场调研 | `docs/plan/map-rendering-libs-research-20260615.md` | 3,700 | 不变 |
| 15 | 市场调研 | `docs/plan/vue3-ecosystem-research-20260615.md` | 3,100 | v2 引用 §7.7 |
| 16 | 综合 | `docs/plan/comprehensive-research-synthesis-20260615.md`(本文件 v2) | — | v2 |

**总产出(v2)**:15 份独立调研(4 内部 + 8 市场 + 3 review)+ 1 份 v2 综合 = 16 份 markdown,总字数约 65,000 字,落盘 ~340 KB(不含本文件)。

---

## 8. Confidence & Limitations (v2)

- **v2 内部审计**:高置信。文件:行级引用经 3 个 review agent 逐条 grep 验证,纠错 8 处 / 修正 10 处。
- **v2 市场调研**:中-高置信。版本号 / 协议 / License 经 npm registry + MDN BCD + Context7 三角验证;功能描述 / 定价 / UX 模式受限于实时抓取失败,部分条目显式标注。
- **v2 优化点排序**:主观权重,基于"已申报未用 + 已有 ADR 批准 + 竞品空白 + 真实 bug 修复 + do-not-touch 例外需求"五类硬证据。
- **v2 Tier 1 重排**:经 priority validation 复盘,5 项降级(graphology / VueUse / Worldbook Codex / 营销 / Vitest caveat),3 项升级(v-memo / focus trap / color contrast),6 项新增(**v3 修:含 1 项误判 — 立体感 v5 plan doc 实已存在** / markRaw / vite-plugin-pwa sub-scope / localStorage quota / /readyz / mem0-cors spec header);**v3 净 = 5 项新增**(markRaw / vite-plugin-pwa sub-scope / localStorage quota / /readyz / mem0-cors spec header)。
- **v2 新增优化点**:14 项跨 11 个之前未覆盖领域(i18n / observability / dep 卫生 / 性能预算 / on-boarding / a11y scaffolding / CI / 命令面板 / 备份导出 / Vector RAG spike / IF scene-state token / PWA offline shell / First Project seed / ecosystem.config deterministic)。
- **v2 显式 Tier 5 "v1 误判需纠正"**:8 项,所有 v1 错误主张在此归档,供未来 agent 引用时回退。
- **未涵盖的方向(v2 仍空白)**:可访问性深度工具 / 性能监控 / e2e 测试基础设施 / 移动 PWA push / 数据迁移工具 / 安全审计 / i18n 付费市场 / 内容审核 / 货币化 / 插件架构 / SLO/SLA 承诺。

如需在任一方向深挖,派一个聚焦子 agent 即可。
