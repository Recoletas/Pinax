# 世界书统一化方案：角色卡制 + 条目/设定/资料三板块合并（2026-10-07）

依据：kit（`D:\storyflow-kit`）世界书前后端实测清单 + Pinax 现状实测清单（证据都挂 `path:line`）。UI 现状截图见 [worldbook-ui-survey-20261007.md](./worldbook-ui-survey-20261007.md)。

## 0. 结论先行

1. **kit 值得抄的是"同质条目 + 带权关系边 + 四合一浏览面"，不是它的角色卡**。kit 的世界书后端**根本没有角色实体**——四型角色只写在规格文档里（`knowledge/continuity/worldbook.md:34`），graph 里人物就是 `cat=人物` 的普通条目。真正的 per-character schema 长在另外两层：deduce 剧本卡（`storyharness/packs/deduce/engine/deduce.ts:101-107`：`archetype / speech_pattern / vocabulary{常用,禁用} / relationships{stance,暗线} / current_arc / forbidden`）和 pinax 快照（`storyharness/src/pinax/tools.ts:13-34`：`aliases / relations[{type,targetId}] / trust / sourceRefs`）。所以 Pinax 的正确做法是**把卡片字段集长在条目上**，不要再建一层平行角色 store。
2. **Pinax 的"角色不是卡片"是四道写死的闸，不是架构缺失**。解析层其实已经认识 13 个字段（`src/services/characterCard.js:3-17`），只是持久化时把 7 个折进了 `other` 字符串（`:140-152`），序列化只写 4 个（`:177-186`）。把能力放回去比新建能力便宜。
3. **发现一个真 bug**：条目关系的写入端和读取端字段名不一致。store 写 `relations.locations / relations.characters`（`src/stores/worldStore.js:867-872`、`src/services/worldbook/worldbookDraftAssets.js:188-193`），注入端读 `relations.placeIds / relations.characterIds`（`src/services/worldbook/worldbookContextBuilder.js:353-354`）。全仓没有任何地方往条目上写 `placeIds/characterIds`（只有运行态 scene 用这两个名字），也就是说**「地点绑定/角色绑定」这条激活路径对 store 生成的条目一直是空转的**。做角色关联必须先修它，否则关系数据写进去也不生效。
4. **三板块合并比想象中近**：所谓"三张皮"实际是"一皮两层"——结构化设定和资料记录物理上都嵌在同一个 worldbook 对象里，条目层早就是注入与编辑的事实真源；一级导航也已经收敛成「设定/资料/地图/条目」四 tab（`docs/STATUS.md:126-127` 自证）。合并的工程量在于**退役 structuredSettings 的投影链**（sync + 墓碑 + `userTouched`，`worldStore.js:119-315`）和**给条目开自定义 kind**，不是从零搭统一层。

---

## 1. kit 能给什么（可直接搬的三件）

### 1.1 后端：同质条目 + 三来源带权边

| 能力 | kit 实现 | 证据 |
|---|---|---|
| 条目结构 | `WbEntry{id,cat,title,status,version,tags,links,summary,path,mtime}`，**完全同质，无 type 判别字段**，`cat` = 卡片所在子目录名 | `core/src/kernel-view.ts:40-51`、`tools/worldbook_index.py:80,94-101` |
| 状态机 | `draft → active → retired`，retired 不删档 | `knowledge/continuity/worldbook.md:59` |
| 关系边 | `WbRel{a,b,src,weight}` 无向；三来源加权：frontmatter 声明边 `weight=2`、正文标题共现 `min(n,3)`、tag 交叉 `1`，多来源用 `+` 拼进 `src` | `core/src/kernel-view.ts:52-56`、`tools/worldbook_index.py:112-139` |
| 检索打分 | title=20 / title 含=12 / tag=6 / summary=4 / CJK bigram≤4 | `core/src/kernel-view.ts:247-258` |
| 图扩展 | 一跳邻居按 weight 降序取 top-3、去重；每条命中附 top-5 邻边 | `core/src/kernel-view.ts:266-291` |
| 存储 | `<项目>/世界书/graph.json` 纯文件，检索时全量读内存；无 sqlite | `tools/worldbook_index.py:174-175` |

kit 的**短板也要如实记账**：没有 tier/档位打分（"四档"只是文档措辞，代码里唯一的 tier 是模型档位）、没有写 API（改 md 再跑索引脚本）、没有资料层、没有 SillyTavern 兼容（全仓零命中）。这些都得 Pinax 自己长。

### 1.2 前端：一个"四合一"条目浏览器

`panel/kitapp/components/WorldbookPage.tsx` 把四件事装在同一屏：左分类树带计数（`:423`）、中词条卡墙（`:529`）、图谱模式（`:552`）、顶栏全局检索（`:405`）、详情 wiki（`:466`）。配套件：`WorldbookGraphView.tsx`（**自绘 Canvas 2D 力导向，零依赖**：斥力+弹簧 220 拍预跑 `:127`、hover 邻域淡化 `:38`、度定半径 `WorldbookPage.tsx:101`、图例按类高亮 `:224`）、`EntryWikiView.tsx`（关联 chips 单页就地跳转 `:132`、引用四级兜底解析 `:52`）。取数走 HTTP + 模块级 Promise 缓存（`lib/worldbook-data.ts:29`），本地按 标题/标签/摘要 过滤（`WorldbookPage.tsx:342`）与服务端 RAG 双轨（`:379`）。独立 pedia 模板 `tools/worldbook-template.html` 里另有 `statusBadge()` 状态徽标（`:314`）和统计首页（`:550`）。

两套前端**都纯只读**（写回发生在 agent 动词/CLI），所以合并面的交互可以照抄，编辑交互得 Pinax 自己设计。

---

## 2. Pinax 现状（合并要动的东西）

### 2.1 一皮两层

- **条目**：`{id,name,type,keys[],keysSecondary[],content,injection{mode,probability,cooldown,depth,group},relations{...},metadata{...},avatar}`（`worldStore.js:851-897`），存 `worldbook_<id>` localStorage（`worldStore.js:32`），桌面版迁 SQLite。**条目是唯一注入真相源**。
- **结构化设定**：`worldbook.structuredSettings[section][field]` = 大字符串，契约 4 分区 21 字段（`shared/structuredSettingContract.js:6-57`）。它已经降级成兼容投影：非 character 字段经 `syncStructuredEntries` materialize 成条目（`worldStore.js:224-315`），`userTouched` 守卫防覆盖（`:70-91`）。
- **资料**：世界书内轻量记录 `{id,title,kind,archiveRef,chunkIds,contentHash,…}`（`worldStore.js:409-433`），全文在 IndexedDB `pinax-source-archive`（`services/worldbook/worldbookSourceArchive.js:28-37`）。
- 书 ↔ 世界书 1:1（`book.worldbookId`，`Authoring.vue:1756`），多世界书可并存；三个预设世界书 39/34/35 条目硬编码在 `services/worldbook/seedWorldbookPresets.js:52-221`。
- 官方条目类型 11 类闭集（`pages/WorldBookEditor.vue:826-838`），**无自定义 kind**；"官方没有的"只能落 `general`，或靠自由分组 `injection.group`——但 `group/depth/cooldown/excludeRecursion` 在注入端**不消费**（`worldbookContextBuilder.js:74-91`），属装饰字段。

### 2.2 角色的四道闸

| 闸 | 位置 | 现状 |
|---|---|---|
| 字段集锁死 | `shared/structuredSettingContract.js:225-250` | 4 必填 + `additionalProperties:false` |
| 序列化只写四框 | `src/services/characterCard.js:177-186` | 只输出 背景/性格/外貌/其他 |
| 解析结果被折叠 | `src/services/characterCard.js:140-152` | identity/gender/age/goal/relation/openingState 拼成 `other` 文本 |
| 数量上限 | `src/services/characterCard.js:132` `.slice(0, 4)`；`worldbookContextBuilder.js:6-14` starter character 上限 2 | 一次最多 4 张卡、开场最多 2 个角色 |

另外两处脏数据源：改名时 `keys:[...new Set([draft.name.trim(), ...(entry.keys||[])])]` 只增不减（`AuthoringCharacterPanel.vue:118`），所以旧占位名「新角色」永久留在触发词里；角色↔章节的「提及章节」是运行时按名字子串现算的（`AuthoringCharacterPanel.vue:58-62`），没有持久化。

---

## 3. 目标模型

一条同质条目承载全部，卡片是条目的 profile，关系是条目的 links，资料是 `kind='source'` 的条目：

```
Entry {
  id, name, status: draft|active|retired, version
  kind: 'character'|'location'|'organization'|'item'|'lore'|'event'|'rule'|'style'|
        'forbidden'|'quest'|'general'|'source'   ← 官方 11 类保留，改为**可扩展枚举**
  cat: string[]           ← 自由分类（抄 kit 的目录即分类），承接原 structuredSettings 四分区
  keys[], keysSecondary[] ← 触发词（改名时同步替换，见 §5 P0）
  profile: { ...kind 专属字段集 }   ← 取代四框；character 见 §4
  links: [{ to, type, stance?, covert?, weight, src: 'declared'|'co-occurrence'|'ai' }]
  sourceRefs: ['source:<docId>#<chunkId>']       ← 资料回链，抄 pinax SnapshotItem
  content: string         ← profile 渲染出的纯文本投影，仍是注入真相（向后兼容）
  injection: { mode, probability, group, ... }
}
```

三条硬约束：
- **`content` 继续是注入真相**，`profile → content` 单向渲染，`content → profile` 用现成解析器反解（`characterCard.js` 已经会读 13 标签）。这样 `worldbookContextBuilder` 的打分/预算逻辑不必推倒重来。
- **不新建平行 store**。地图继续以地点条目为真源（`docs/PLAN.md:131,186` 已明文禁止平行地点 store，同一纪律适用角色）。
- **`kind` 可扩展但注入优先级要留兜底**：未知 kind 落到 `general` 的优先级，避免自定义分类把预算吃空。

---

## 4. 角色卡体系

### 4.1 卡型模板（"应该有很多"落在这里）

`kind='character'` 下用 `profile.template` 选模板，模板决定字段集与必填项。字段来源是三处已有能力的并集（Pinax 解析器 13 字段 + deduce 剧本卡 + ST 惯例），不引入新解析成本：

| 模板 | 专属字段（在通用 13 字段之外） | 必填 |
|---|---|---|
| 主角 | `currentArc`、`want vs need`、`secret`、`forbidden`（作者禁写项）、`voiceLock` | 背景/性格/弧线 |
| 主要配角 | `functionPosition`（功能位）、`relationshipToProtagonist`、`exitPlan` | 功能位/性格 |
| 次要配角 | `screenTimeBudget`、`reusableTags` | 功能位 |
| NPC | `roleSlot`（卖药的/守门的/传话的）、`knowledgeScope`（知道什么/不该知道什么）、`appearsIn` | 功能位/知识边界 |
| 路人 | `oneLineTag` | 一句话标签 |
| 反派 | `threatLadder`（位阶）、`ideology`、`onstageRule` | 位阶/动机 |
| 势力人物 | `orgLink`（→ organization 条目）、`rank`、`factionGoal` | 所属势力 |
| 声口（横切，所有模板可开） | `speechStyle`、`vocabulary{常用[],禁用[]}`、`samples[]`、`greeting` | — |

`speechStyle/samples` 现在躺在条目层的「角色声口 0/6」编辑器里（`WorldBookEditor.vue:534-537`），合并后归进卡片，一处编辑。

### 4.2 角色关联

边类型枚举（写进 `links[].type`）：`亲属 / 师承 / 主从 / 同僚 / 敌对 / 情感 / 债务 / 秘密知情 / 地点归属 / 势力成员`，每条带 `stance`（正/负/暧昧）、`covert`（暗线，抄 deduce `relationships{stance,暗线}`）、`weight`、`src`。

- **写入端**：卡片详情「关系」区（选目标条目 + 类型 + stance + 暗线勾选），以及图谱里拖节点建边。
- **归纳端**：抄 kit 的共现加权（正文标题共现 `min(n,3)`、tag 交叉 `1`），产出 `src='co-occurrence'` 的建议边，**只进复核清单不自动生效**（用户口径：自设阈值不当隐形闸）。
- **读取端**：`selectActiveRelations` 已经有"只保留至少一端在场的边"的过滤纪律（`authoringWorldbookSceneAdapter.js:48-56`），保留；再补 kit 的一跳 top-N 扩展进注入。

---

## 5. 分期

**P0 修闸 + 修 bug（小切片，独立可验，不动 UI 骨架）**
1. relations 字段名对齐：以 store 侧 `locations/characters` 为准，改 `worldbookContextBuilder.js:353-354` 兼容读两种命名，补回归用例锁住"绑定了地点的角色条目能因场景地点被激活"。
2. 改名同步替换触发词（`AuthoringCharacterPanel.vue:118`），并给既有的「新角色」类残留一次性清理。
3. `characterProfile` 落全字段：serializer 输出 13+ 字段、契约放开 `additionalProperties`、`characterProfileFromCard` 不再折 `other`。
4. 去掉 `.slice(0,4)` 与 starter 上限 2 的硬编码（改成可配置，默认放宽）。

**P1 卡片化编辑面**：`AuthoringCharacterPanel` 改模板驱动字段集 + 层级/模板选择 + 关系区；四框不再是真相，只是模板的退化形态。

**P2 统一条目浏览器（只读合并）**：一个世界书页装下 分类树带计数 / 卡片墙 / wiki 详情带关联 chips / 双轨检索 / status 徽标；「设定」四节与「资料」以过滤视图呈现，数据仍走既有投影，先不动写侧。

**P3 写侧合并**：资料升成 `kind='source'` 条目（`archiveRef` 保留指 IndexedDB）；自定义 `kind` 开放；structuredSettings 投影链退役（一次性迁移 + 墓碑语义保留）。

**P4 关系边与图谱**：`links` 带类型/权重/来源，自绘力导向图（抄 kit，零依赖），一跳扩展进注入，按 `profile.tier` 分级裁剪预算。

**P5 可选**：SillyTavern character card V2/V3 导入导出（kit 查无，Pinax 现有 lorebook 导入导出在 `worldStore.js:1282-1486`，不含角色卡）。

---

## 6. 工程约束（会撞的墙，先写下来）

- 测试硬预算 `MAX_TEST_FILES=20 / MAX_TEST_CASES=200`（`scripts/vitest-budget-reporter.mjs:1-2`），当前 200 用例里 2 个是在途 WIP 的存量失败。**新增用例必须在既有文件里挤位置**，P0 每条修复都要挂回归，得先规划额度。
- `Authoring.vue ≤10900 行 / ≤125 imports`、Authoring chunk `dist/assets/Authoring-*.js ≤1,450,000 B`、`services/` 根层 JS `≤20`、生产循环依赖 `=0`（`scripts/architecture/structure-budget-check.mjs:7-13`、`authoring-build-size-check.mjs:6`）。**统一面板必须以新组件 + 新 service 落地，往 Authoring.vue 堆逻辑会直接顶爆**。
- 墓碑语义（角色删除历史 `structuredCharacterTombstones`，`worldStore.js:1016-1021`）在投影链退役时不能破。
- 注入端行为变更后，章节体检 / 推演 / 生成三条真机链路要回归。

## 7. 待裁定（要用户点头，我不替裁）

1. NPC / 路人默认进不进上下文？（决定 P4 的分级预算策略；不进的话它们只是设定备忘）
2. 卡片量级上去后 localStorage 5MB 顶得住吗——要不要把世界书主体搬到项目磁盘（`.pinax/` 或 SQLite）？
3. ST character card V2/V3 是不是目标能力？（决定 P5 排不排）
4. 合并后「设定」页彻底消失，还是保留成一组预设过滤视图？
5. 「资料」并入条目后，IndexedDB 全文归档层保留原样（推荐，只改指针不动二进制）还是也一起文件化？
