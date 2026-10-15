# 世界书统一化 ABC 工单 · 多 agent 调度版（2026-10-08）

> **执行状态（2026-10-08 收官）**：W1-W6 全部落地并逐波验收合入本分支（39 文件 +11274/−367）。集成门禁：9 个 worldbook 冒烟全绿（file-contract 31/server-rw 60/relations 22/dualwrite 47/browser 117/editing 76/write-merge 34/settlement 109/localization 67）、vitest 198/200（2 挂=agent-unification 线基线存量，干净基线实证；settingsAgentWorkflows 为负载 flake 单跑 7/7）、预算 20/20+200/200、lint 0 新增、Authoring chunk 1,409,781≤1,450,000。kit 兼容经 worldbook_index.py 解析器 JS 忠实移植交叉断言（本机 python 为 WindowsApps 空壳，python 直跑留给有 python 的环境）。**未竟外部验收：C4 双浏览器真机**（需集成栈起服务，与主工作区在途 3001 冲突，待排期）；推送/PR 待作者令。

上位方案：[worldbook-unification-20261007.md](./worldbook-unification-20261007.md)（目标模型/卡型模板/P0-P5/工程约束，证据挂 path:line）。本文是**调度文档**：把作者需求拆成 A/B/C 三组工单，定义多子 agent 并行所需的基线、冻结契约、不相交写集、波次与集成顺序。**本文读者 = 派工者与执行 agent**；执行 agent 只需读：§2 派工表自己所在行 + §3 冻结契约 + §4 热文件矩阵 + §5 禁改清单 + 上位方案对应节。

## 1. 状态同步（2026-10-08 实测，执行前必读）

1. **PR #5 已被上游合并**（merge commit `92294d2` = upstream main 尖端，标题 "integrate PR #5 with the writing workspace"，含 782b03e 工作台 UI 修整）。fork 分支 `4fea067` 全部进入主干；**此前「workflow scope / Update branch」待办作废**。作者整合后把 StoryAgentBetaPanel 以新契约「校验/测试专用，不写入书稿/世界书」保留在 main（我方退役方向被上游改写——以 main 现状为准，勿再删）。
2. **本地三条活跃线**（`git branch -v` 实测）：
   - `feat/agent-unification-p0` @ `c6fc9e3`——**ABC 的基线**。localmirror/项目文件夹体系（`server/services/localMirrorService.js`、`nativeFolderPicker.js`、`pinax-project-fs@2` 注册表/浏览/反向导入）、项目资料面板、统一模型两步、capability 任务调度**只在这条线上，上游 main 没有**（已验证 `git ls-tree 92294d2` 无 localMirrorService）。
   - `main` @ `92294d2` = upstream main（含 PR#5，无 localmirror）。
   - `feat/pinax-storyharness-adapter` @ `92294d2 [ahead 4]`——PR#5 历史 line，仅存档。
3. **主工作区有活跃 WIP（不可碰）**：`feat/agent-unification-p0` 检出中，12 个未提交修改（`server/routes/chat.js`、`generationAgent.js`、`server/services/kitModelGateway.js`、`nativeFolderPicker.js`、`structuredGenerationRunner.js`、`textModelAgentProvider.js`、`src/components/text/TextModelPicker.vue`、`workbench/ProjectInfoPanel.vue`、`worldbook/ApiSettingsPanel.vue`、`composables/useProjectInfoPanel.js`、`services/textProviderConfigStore.js`、`docs/STATUS.md`）+ 未跟踪 `server/services/modelRouting.js`、`_staging/`。这是 STATUS.md 当前安排表 Qoder/ZCode 两行的在途产出。**所有 ABC 子 agent 一律在独立 worktree 干活，不进主工作区。**
4. **测试预算**：vitest 20 文件/200 用例双满额（`scripts/vitest-budget-reporter.mjs` 超限 exit 1）。新增验证一律走 `scripts/` 冒烟 + `package.json` smoke 脚本行（先例：`smoke:local-import-check`、`ci:workspace-backup-smoke`）。
5. `ci.yml` 不可改（历史 PAT scope 限制已因 PR#5 合并解除，但本轮 CI 编排仍不动，新冒烟挂本地/verify 链）。
6. **本地 kit 领先 GitHub 36 提交（基线 `e1a942c1`，实测 2026-10-08）**，世界书域增量与全量能力已通读，ABC 契约按本地 kit 对齐（§3.1/§3.5）：
   - **体系标准 `knowledge/continuity/worldbook.md` v1.0.0**：文件即真相；目录模板 `index.json（唯一 RAG 入口，sections[].entries[] 指针账本）+ 纪律.md + 设定/人物/势力/地理/编年/伏笔/底牌`（剧本变体多 场景/道具/分集账）；状态机 draft→active→retired（不删档）；`[[id]]` 交叉链接；人物卡三段式（核心档案「要/怕/卡」→关系网→当前状态+变动史）；**落位硬约束=卡片只写项目根 `世界书/<分类>/<词条>.md`**（索引只扫这里，写错域目录 graph 永远空）。
   - **章回结算五件**（`tools/worldbook.py` init/check/tree + 纪律.md）：章卡→章账、人物状态推进（当前状态改写+变动史追加）、交接（下一章只读末节=handoff）、伏笔变动→`伏笔/台账.md`（机器可读：fid/内容/埋点/预定回收/状态 open|paid|retired）、世界揭示→设定。**底牌/暗线底牌.md status:draft 永不入正文**。
   - **图索引器 `tools/worldbook_index.py`（worldbook-graph@1，GraphHyperRAG）**：只认卡片文件（「人工维护的 index.json 不读不写」）；frontmatter 消费 `title/id/status/version/tags[]/links[]`，其中 **links=纯目标 id 字符串数组**（声明边 weight=2）；mention 边（正文标题共现 min(n,3)）+ tag 交叉边（weight 1）；`cat=子目录名`；summary=首段≤120 字；产物 `世界书/graph.json`。检索动词 `worldbook_search(q,cat,k)`（kernel-view.ts:235，title 20/含 12/tag 6/summary 4/CJK bigram≤4，一跳 top-N 扩展），CLI/HTTP/MCP 三面供 agent。
   - **前端**：全屏专有页图谱已对齐 pedia（拖拽/平移/缩放/图例高亮/读卡引用四级兜底解析：全路径→.md 尾段→标题→id，`worldbook-data.ts:42`）；分类配色 `CAT_PALETTE`；pi-web fork 官方面板六视图 IA。`tools/worldbook_history.py`（创作历程归纳器，worldbook-history@1）=可选历程视图借鉴，不入本轮。

## 2. 派工表

**基线裁定**：所有 worldbook 组分支一律从 **`c6fc9e3`** 切（`git worktree add <path> -b <分支名> c6fc9e3`）。理由：localmirror 地基在这条线的已提交尖端；它将先于 ABC 落 main，届时 rebase 平滑。每个 worktree 需独立 `npm ci`。

| Wave | 工单 | 分支名 / worktree | 写集（不相交） | 依赖 | 出口验收 |
|---|---|---|---|---|---|
| W1（并行×3） | **A1 格式契约** | `feat/wb-a1-file-contract` | NEW `shared/worldbookFileContract.js`、NEW `scripts/worldbook-file-contract-smoke.mjs`、`package.json`（+1 行 smoke 脚本） | §3.1 冻结签名（v2 双层 links） | 冒烟全过：往返无损/中日韩与冒号括号值/**kit 索引器可解析（frontmatter 标量与 links 字符串数组按 kit YAML 子集规则生成）**/index.json 与 graph.json 与 kit 产物同构 |
| W1 | **A2 server 读写** | `feat/wb-a2-server-rw` | `server/services/localMirrorService.js`、`server/routes/localMirror.js`、NEW `scripts/worldbook-server-rw-smoke.mjs`、`package.json`（+1 行） | §3.1/§3.2（A1 未落地前按冻结签名自行内联最小实现，集成时替换 import） | 临时目录全链：sync 写出 `<cat>/<name>.md`（cat 目录映射+纪律.md/伏笔台账/底牌/章账骨架幂等补齐）+index.json+graph.json+manifest → read API 读回逐字段相等；公网门 403 |
| W1 | **A4 关系地基修复** | `feat/wb-a4-relations-fix` | `src/services/worldbook/worldbookContextBuilder.js`、NEW `src/services/worldbook/entryRelations.js`（纯函数抽取，避开 composable 依赖）、NEW `scripts/worldbook-relations-smoke.mjs`、`package.json`（+1 行） | 上位方案 §5 P0.1 | 冒烟：写 `relations.locations/characters` 的角色条目因场景地点被激活（修复前必失败） |
| W2（并行×2） | **A3 store 双写** | `feat/wb-a3-store-dualwrite` | `src/stores/worldStore.js`（仅持久化接缝：persistOrThrow 后推 mirror、加载文件优先）、NEW `src/services/worldbook/worldbookFileRepository.js`、NEW `scripts/worldbook-dualwrite-smoke.mjs`、`package.json` | A1+A2 已合入集成分支 | 双写冒烟：存 localStorage 同时文件可读回；文件优先加载；离线回落 localStorage 不阻塞编辑 |
| W2 | **B1 只读统一浏览器** | `feat/wb-b1-browser` | NEW `src/components/worldbook/UnifiedEntryBrowser.vue`（+子组件 `CategoryTree/EntryCards/EntryWiki/GraphCanvas`）、NEW `src/services/worldbook/entryBrowserModel.js` | §3.1 契约（纯前端可先行，读 mock） | 组件冒烟：分类树计数/卡片墙/wiki 关联 chips/双轨检索/status 徽标；`Authoring.vue` 行预算零增量 |
| W3（同一 agent） | **B2+B3 编辑面** | `feat/wb-b2b3-editing` | `src/pages/WorldBookEditor.vue`、NEW `src/components/worldbook/EntryMdEditor.vue`、`EntryProfileEditor.vue`、`EntryLinksEditor.vue`、`src/components/authoring/AuthoringCharacterPanel.vue`、`src/services/worldbook/entryProfileTemplates.js`(NEW) | B1、A4 | md 编辑往返=注入真相投影；人物卡三段式（核心档案要/怕/卡→关系网→当前状态+变动史，kit §二）落 profile 模板；关系编辑（10 类型×stance×covert×weight，双层 links 落库）落库；共现建议边只进复核清单；**注入端升级：一跳 top-N 扩展（权重降序）+ [[id]] 链接 chips 四级兜底解析（全路径→.md 尾段→标题→id）+ 章账末节 handoff 进上下文（预算内）+ 底牌显式排除** |
| W4 | **B4 写侧合并** | `feat/wb-b4-write-merge` | `src/stores/worldStore.js`（structuredSettings 投影退役+资料升 source 条目）、`src/services/worldbook/worldbookDraftAssets.js` | A3、B3 | 墓碑语义不破（20261007 §6）；迁移一次性+幂等；三入口读写同一 entry |
| W5（B3 后并行可拆） | **B5 章回结算** | `feat/wb-b5-settlement` | NEW `src/services/worldbook/settlementService.js`、NEW `scripts/worldbook-settlement-smoke.mjs`、`package.json`（+1 行）、`src/pages/WorldBookEditor.vue`（台账/底牌/章账视图区） | B3、A2（文件骨架） | **结算五件**落文件：章卡→`编年/章账.md`（追加节+末节=handoff）、人物状态推进（条目「当前状态」改写+「变动史」追加）、交接 3-5 条→章账末节、伏笔变动→`伏笔/台账.md`（open/paid/retired 机器可读）、世界揭示→设定条目；底牌永不入正文有回归用例；真实生成/体验回合后结算钩子为显式动作（作者确认触发，不静默改写条目——对外围禁直写正文红线的遵守方式：状态与变动史属于世界书侧，不算改正文） |
| W6 | **C1-C4 全量本地化** | `feat/wb-c-localize` | `server/services/localMirrorService.js`（读回扩展）、`src/pages/SettingsSources.vue`、NEW `src/components/settings/LocalizationCenter.vue`、books/sessions repository 读回、source archive 文件化 | A 组全落、`feat/agent-unification-p0` WIP 落地后 rebase | 双浏览器一致性（C1 键清单按组内盘点表逐键裁定）；IndexedDB 归档→`资料/` 文件含 chunk；清 localStorage 后全恢复 |

**集成 owner（主 session）职责**：每 Wave 收官时把分支依序合入集成分支 `feat/wb-unification-integration`（自 `c6fc9e3` 切），跑全量门禁（`npm run verify:full` + 本工单新增 smoke 全套 + lint:delta），冲突按 §4 矩阵裁决；`package.json` 的 smoke 脚本行由 owner 在合并时统一收编（各 Wave 分支各自 +1 行会冲突——**各分支只追加自己的行，owner 合并时保留全部**）。`feat/agent-unification-p0` 的 WIP 落地 → main 后，owner 负责集成分支对齐 main。

## 3. 冻结契约（Wave 1 之前即生效；改动需派工者批准并广播全体）

### 3.1 `shared/worldbookFileContract.js`（A1 产出，A2/B/C 消费）——**v2：按本地 kit 体系标准对齐，kit 工具可直接消费**

```js
export const WORLDBOOK_FILE_SCHEMA_VERSION = 1
// 目录布局（=kit 体系标准 §一）：世界书/<cat>/<name>.md + index.json + graph.json + manifest.json
// cat 目录映射（type→cat，兼容 kit「目录即分类」）：
//   character→人物  location→地理  organization→势力  event→编年
//   rule/style/lore/item/quest/general/forbidden→设定  source→资料（Pinax 扩展）
// 文件名 = sanitizeFilename(entry.name)；正文支持 [[id]] 交叉链接（kit §二）
export function serializeWorldbookEntryFile(entry, { worldbookName = '' } = {}) -> string /* md 全文 */
export function parseWorldbookEntryFile(text) -> { ok: true, entry } | { ok: false, error: { code, message } }
export function buildWorldbookIndexFile(worldbook) -> object /* kit index.json 指针账本：
  { sections: [{ id: cat, title, format:'list', file:'世界书/<cat>/', entries: [
      { id, title, tags[], links[], status, version, updated, file } ] }] } —— A2 写侧确定性重建 */
export function buildWorldbookGraphFile(worldbook) -> object /* worldbook-graph@1 形状（与 kit worldbook_index.py 产物同构）：
  entries: {id, cat, title, status, version, tags[], links[], summary, path, mtime}
  relations: {a, b, src:'link|mention|tag'（+号拼接）, weight}；stats: {entries, edges, isolated, byCat} */
export function parseWorldbookGraphFile(text) -> { ok, graph } | { ok: false, error }
export function buildWorldbookAuxFiles({ variant = 'novel' } = {}) -> { relPath: content }
/* 相对 世界书/ 的体系标准骨架件（幂等补齐用）：'纪律.md'、'伏笔/台账.md'、'底牌/暗线底牌.md'、'编年/章账.md'
   ——内容对齐 kit tools/worldbook.py 的 DISCIPLINE/台账表头/章账 handoff 头（小说变体） */

**frontmatter 双层关系设计（兼容关键）**——kit 索引器的 YAML 子集解析器只认标量与字符串列表（`worldbook_index.py:33-59`），对象列表会被无视：
- `links: [targetId, ...]`（**纯 id 字符串数组** = kit 声明边，weight=2，kit 直接吃）；
- `relations:` 下的缩进对象列表 `[{to, type, stance, covert, weight, src}]`（Pinax 富关系：10 类型×stance×暗线×权重×来源；kit 解析器对缩进行不可见，互不干扰）。A2 写 graph.json 时把两层合并：links 贡献 `src:link` 边，relations 贡献 `src:declared` 边。
- frontmatter 必含 kit 字段全集：`id/title/status/version/tags[]/links[]`（`title= name` 双写）+ Pinax 扩展：`schemaVersion/name/kind/cat[]/keys[]/keysSecondary[]/summary/sourceRefs[]/updatedAt` + `injection:{...}` + `profile:{...}`（对象块，kit 不可见）。
- 特殊文件（体系标准对齐）：`纪律.md`（init 生成）；`伏笔/台账.md`（机器可读表：fid/内容/埋点/预定回收/状态 open|paid|retired）；`底牌/暗线底牌.md`（status: draft，**注入端显式排除，永不入正文**）；`编年/章账.md`（末节=handoff，B5 消费）。这些由 A2 写侧在项目世界书目录补齐骨架（幂等，不覆盖已有）。
- 受限 YAML 子集（标量/带引号字符串/`[a, b]` 行内数组/块列表/一层嵌套 map；含 `:[]{}#&*!|>'"%@\`` 或首尾空白或空串的值必须单引号包裹，`''` 转义）。未知 frontmatter 键无损保留在 `entry.extra` 并回写。`content` = md 正文原样，**仍是注入真相**。

### 3.2 server API（A2 产出，挂在 localmirror 路由，全部过 `localOnly` 公网 403 门）

```
GET  /api/localmirror/worldbook?path=<项目根或「世界书」目录绝对路径>
  -> { ok: true, worldbook: { id?, name, entries: Entry[] }, warnings: string[] }
POST /api/localmirror/worldbook-validate  { files: { relPath: text } }  // 纯校验（供 C 组预检复用）
```

读侧规则：md 按 §3.1 parser 解析；解析失败的文件**跳过并记入 warnings（含相对路径+原因），不整批失败**；manifest.json 仅作 name/type/group 快照补充，不覆盖 md 解析结果。写侧（既有 `/sync`）升级为全量 frontmatter + `graph.json` + 保留 manifest.json。路径安全沿用 localMirrorService 既有校验（绝对路径、注册表/根内、拒绝 `..`）。

### 3.3 `src/services/worldbook/worldbookFileRepository.js`（A3 产出，B/C 消费）

```js
export function isFileSourceAvailable() -> boolean           // 项目绑定存在 && server 可达
export async function loadWorldbookFromFiles(projectRoot, worldbookId) -> { ok, worldbook?, warnings?, error? }
export async function saveWorldbookToFiles(projectRoot, worldbook) -> { ok, dir?, error? }  // 幂等全量重建（先删后写，meta 最后）
```

### 3.4 Entry 运行时形状（B 组消费，= 上位方案 §3 目标模型的向后兼容子集）

现有条目字段（`id/name/type/keys/keysSecondary/content/injection/relations/metadata`）全部保留；新增字段一律可选：`kind?(=type 别名过渡)/status?('active' 默认)/version?/cat?[]/links?[]/profile?/sourceRefs?/extra?`。**不新建平行 store**；地图继续以地点条目为真源。

## 4. 热文件矩阵（✏️=本组唯一写入者；同列多处=顺序锁）

| 文件 | A1 | A2 | A3 | A4 | B1 | B2/B3 | B4 | C |
|---|---|---|---|---|---|---|---|---|
| `src/stores/worldStore.js` | | | ✏️W2 | （读端不动 store） | | | ✏️W4 | ✏️W5 → **顺序锁 A3→B4→C** |
| `server/services/localMirrorService.js` / `routes/localMirror.js` | | ✏️W1 | | | | | | ✏️W5 → **顺序锁 A2→C** |
| `src/pages/WorldBookEditor.vue` | | | | | | ✏️W3 | | |
| `src/components/authoring/AuthoringCharacterPanel.vue` / `Authoring.vue`（右栏接线） | | | | | | ✏️W3（行预算 ≤11150） | | |
| `package.json`（smoke 行） | ✏️ | ✏️ | ✏️ | ✏️ | | | | ✏️ → **各写自己行，集成时 owner 收编** |
| `docs/STATUS.md` | | | | | | | | **集成 owner 独占**（收官时按 docs-status-handoff 改本表行） |
| `src/services/textProviderConfigStore.js` 等 agent-unification WIP 文件 | **全组禁改**（§5） | | | | | | | |

## 5. 禁改清单

1. 主工作区在途 WIP 12 文件 + `server/services/modelRouting.js` + `_staging/`（归属 `feat/agent-unification-p0` 两行在途产出）。
2. `.github/workflows/ci.yml`（本轮 CI 编排冻结）。
3. `D:\storyflow-kit` 仓（canonical，另线同步；ABC 只读其规格与 `tools/worldbook_index.py` 兼容性，不改）。
4. vitest 既有 20 文件/200 用例（不改不删；A4 回归走 scripts 冒烟，同 CI 先例）。
5. 世界书三条导入路径（预设/小说文本/AI 基调）行为不变（worldbook-workflow skill §7）；同名冲突显式三选一策略不变。

## 6. 作者需求 → 工单映射（备查）

| 需求原文 | 归属 |
|---|---|
| 资料/世界书/条目关系不对 | B4（写侧合并）+ B1（过滤视图呈现） |
| 多条目/多点/小文本框/无 md | A1（格式）+ B2（md 编辑面/profile 子项） |
| 缺条目关联（kit 强项） | A4（读写端字段名 bug 修复，前置）+ B3（编辑/归纳/注入一跳）+ W? 图谱（20261007 P4，B3 内含 Canvas 自绘，抄 kit 零依赖） |
| 基于本地文件管理 + agent-friendly 格式 | A1+A2+A3（本工单核心） |
| 前端风格变化不大 | B1 过滤视图复用现有视觉 token；ui-style-check 门（1440/390/暗色） |
| 跨浏览器配置差异 → 湮灭浏览器缓存 | C 组全量 |
| 设置页本地化配置可加 | C3（LocalizationCenter，扩 localmirror 面板） |

**裁定记录**（覆盖 20261007 §7）：§7.2 世界书主体搬磁盘=是（A 组）；§7.5 IndexedDB 归档文件化=是（C2，含 chunk 二进制）；§7.4「设定」页保留为过滤视图（B1）。仍开放：§7.1 NPC/路人默认注入策略、§7.3 ST character card V2/V3（不阻塞任一 Wave）。

## 7. 每组完成定义（DoD，通用）

1. 本组 smoke 全过 + `npm run verify:full` exit 0（在**自己的 worktree** 跑，先 `npm ci`）。
2. **kit 工具直操作验收（A1/A2 必做，其余组按触面）**：对产出目录跑 `python tools/worldbook.py check`（kit 仓）通过；`python tools/worldbook-index.py --root` 重建 graph.json 与 Pinax 写出的关系一致；`worldbook_search` 检索可命中 Pinax 条目——这是「agent 友好」的可执行定义。
3. 不碰 §4 矩阵外文件；`git diff --stat` 自查写集一致。
4. 交回物：分支 + 一段 ≤200 字摘要（改了什么/门禁数字/未尽项）——按 AGENTS.md 多 agent 工作流，worker 输出摘要交集成 owner 复验，**不自报完成**。
5. worldbook-workflow skill 全程适用：项目身份优先于 active 回退；异步竞争守卫落在副作用 owner；删除/失效联动不破。
