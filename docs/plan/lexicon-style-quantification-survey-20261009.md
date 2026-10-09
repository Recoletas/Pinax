# 词表三类管理 + 文风量化：kit 资料侦察与设计提案（2026-10-09）

> **由来**：用户在 W1（RAG 接线 + 文档阅读器）施工期间追加：「禁用词，偏好词，专有设定名词，这几个怎么设计管理列表，文风数据怎么被量化，让 agent 能够时刻读取调用，kit 里有过一些资料，我不确定我挖掘的是否深入，你看下。」
>
> 本文是双仓只读侦察（kit=D:\storyflow-kit、Pinax=本仓，2026-10-09 实测）+ 设计提案。状态：**调研账，未排期、未提交**；§6 待裁定后并入排期。

---

## 0. 结论速览（四件事各一句）

| 事项 | kit 现成度 | Pinax 现成度 | 判定 |
|---|---|---|---|
| **禁用词** | ★★★★ 三级词表卡+双执行体+校准卷，但**词表三源漂移** | ★★ 三个非结构化入口，无事后校验 | 内容与扫描器都有真身，缺「单源化+项目级扩展+生成后校验」 |
| **偏好词** | ★ 半成品（`own[]` 派发注入一句） | ☆ 完全没有 | 两仓都没有实体，**纯新增面** |
| **专名口径** | ★★★ 词汇表+世界书双轨已通，缺仲裁与工具 | ★★ 抽取有真身、校验零 | 双轨模式照抄 kit，缺「口径仲裁+回流闭环」 |
| **文风量化** | ★★★★ 八维画像+AI味指数+收据制，**但只有一次性收据** | ★ critic shadow 一个评分，无量化 | 量化器现成，缺「项目级累计读模型」——「agent 时刻读取」恰是全链最大缺口 |

**一句话架构判定**：kit 已经回答了「词表怎么分」——`词汇表.json` 管专名安全（own=偏好/banned=禁用），世界书管设定真相（`kit/tools/worldbook.py:37`「词汇表管专名安全，世界书管设定真相」）；文风量化器就是 `prose-scan.py`。**缺的不是模型设计，是：单源台账化（kit 自己的 purity-markers.json 模式没推广到禁词表）、项目级管理工具（kit 30 个项目无一有词汇表.json）、累计读模型与 agent 读取通道。**

---

## 1. kit 现成件（有真身）

### 1.1 禁用词（最厚的一块）

- `knowledge/aesthetic/slop-list.md:1-91` **AI 味禁则清单 v2.1**：三级分级词表（一级铁证 20 词/二级密集可疑 14 词/意义拔高/万能鸡汤/机器人开场/伪深度词）+ 叙事套话 5 族 + 句式级黑名单 S1-S5 + 配额（假对比 ≤2/章、一丝+情绪 ≤1）。
- `knowledge/aesthetic/naturalness-zh.md`（24 类去模板化，词句层）、`ai-trace.md`（结构级五指纹+检测器八维画像）、`ai-detection-sources.md`（L1 本地 prose-scan + L2 朱雀 API 两级门）、`craft/user-style-rules.md`（R1-R7 用户手改风格规则，每条带机械判定）。
- `tools/prose-scan.py:18-36` **词表机械执行真身**：SLOP 16 词、RHYTHM 节奏词（≤2）、CLICHE 5 族、NOT_BUT 正则、明喻/文言壳计数。
- `core/src/aesthetic.ts:702-705` 引擎侧 AE-PROSE-SLOP：13 词硬编码——**与 prose-scan.py 已漂移**（少「沉浸式/颗粒度」多「其实/显然」）；`:177-178` AE-VIS-EMPTY 不可拍摄词；`:602-604` AE-COMPLIANCE 读项目 `词汇表.json` 的 banned[]。
- `knowledge/aesthetic/purity-markers.json` **单源台账先例**：30 条 regex 唯一台账，引擎与扫描器共读——这个模式已示范但**没推广到禁词表**（禁词表目前是 md 卡 + py 数组 + ts 数组三源）。
- 消费点：`flows/prose/flow.json:5` 成文六维盖章（机味维查 S1-S5 清零、一级词零容忍二级词单段 ≤3）；`skills/novel-deai.md` 四遍法绑定四张词表卡。

### 1.2 偏好词（半成品）

- `core/src/asserts.ts:377-455` **词汇表守卫 M2**：`projects/<id>/词汇表.json = {project, own[], banned[]}`；`own[]` 在派发头注入「项目专属词：…（产物应使用）」（`core/src/assembler.ts:50-60,417-422`）——这是唯一的偏好词机制。
- **缺**：没有正向偏好词库实体/目录约定/生成器；`own[]` 无偏好强度、场景限定维度；人物级「声口表/语言卡」在 skills 里被反复列为必读输入（novel-deai/novel-judge/layer-voices）但**仓内无模板无生成器**；「语言DNA.md 作者画像」被 `tools/laya-ft/style_data.py:12-15` 硬编码引用，**文件在库外**（D:/写作/04_风格蒸馏/）。

### 1.3 专名口径（双轨已通，缺仲裁）

- 双轨分工即答案：`词汇表.json`（own/banned，跨项目串戏守卫 `checkGlossary`/`foreignOwnTerms`——他项目 own 词即本项目违禁词）+ 世界书（`worldbook_search` 检索+一跳扩展，「写手据此拉齐设定口径」）。
- 启发式：`aesthetic.ts:277-329` AE-CONT-KNOW（正文引号词条 × own∪世界书并集，未登记高频专名 warn）、AE-CONT-ITEM（同专名不同数值）。
- **缺**：`词汇表.json` 无生成/维护工具（**30 个现存 p-sh-* 项目无一有此文件**）；词汇表与世界书无同步器；无正名/别名/译名字段与冲突仲裁面。

### 1.4 文风量化（单次强，持续弱）

- `tools/prose-scan.py` **八维统计画像 + 配额层 + AI味指数 0-100**（透明加权）：2-gram 多样性（人工 ≥0.6/平台 0.55）、句长波动、短语复现、标点节奏、对白比例、明喻密度、套话命中；第 8 维语义平滑度标注「需向量模型」挂空。
- `tools/quality-scan.py` 证据聚合器（只出证据不出判决，收据落 `内部/收据/`）；`core/src/budget.ts` 可调阈值面；`assertion-presets/prose-light` warn-only 初稿档。
- 评审层：`skills/novel-judge.md` 五维锚点评分（「机器管配额，你管读感」，分数恒不是闸）、`knowledge/aesthetic/redline-scoring.md` 红方六维、`semif-calibration/` 条款校准包、`tools/laya-scan.py`+`laya-ft/`（6 题自动打标，阈值引库外语言DNA）、`knowledge/deconstruct/style-learning.md`（拆书向文风学习协议，产物应落为 style-rule 条目）、`style-routes.md` hot/calm 风格路线参数。
- **缺**：**没有项目级累计读模型**——量化结果只在一次性收据里，无 `style-summary` 类画像文件供任意节点随时读；五维评分与八维画像无归一对照层。

### 1.5 检索/读取通道（W1-A 已接的面直接复用）

- `kb_search`/`kb_read`（`core/src/verbs.ts:482-505`）：递归扫 knowledge/ 全部 md（标题 8/tag 4/正文 1）——slop-list、user-style-rules 等词表卡**都能命中**，但只有「整卡正文」粒度，**无词级结构化查询**（不能问「某词在第几级」）。
- `worldbook_search`：专名/设定检索通道（W1-A 已实测打通）。
- `quality_scan` 动词（`verbs.ts:665-680`）桥接证据类。
- **没有**词表 CRUD 动词、风格指标读取动词、glossary 独立动词（内嵌在 flow_submit 检查链）。

---

## 2. Pinax 现状（有真身的部分）

### 2.1 注入路径（词表/文风类内容现在能走的路）

| 存储 | 提示词落点（预算） | 生效范围 |
|---|---|---|
| `<root>/约束/*.md|txt`（文件名关键字判 kind：禁用\|禁词\|黑名单\|避雷→forbidden、文风\|文笔\|风格\|语气→style，`localMirrorService.js:90-95,989-1046`） | kernel `local-rules` 块（2000 字，`narrativeKernel.js:375-460`，纯文本无结构化解析） | **仅 Authoring 链**（体验页不传，`experienceTurnCoordinator.js:178-208`） |
| worldbook.forbidden 书级字段 | kernel `rules`.forbidden（360 字） | 全链 |
| worldbook.writingStyle 书级字段 | kernel `style` 块（600 字）+ planner turn note「既定文风」 | 全链 |
| 世界书词条 rule/forbidden/style（默认 constant） | `rules`.worldRules 前 6 条×180 字 + manifest constraint → compiled-context（16000） | 全链 |
| 角色声口 speechStyle+samples | kernel `cast`.voice（~720 字） | 说话人 |
| 角色 vocabularyForbidden / vocabularyCommon（结构化数组） | **不进 voice 通道**——仅当用户确认「覆盖原文」渲染进词条正文才间接生效（`entryProfileTemplates.js:25-31`、`narrativeVoiceProfile.js` 只取 speechStyle+samples） | 近乎死字段 |
| 代码硬编码 | `narrativeVoicePolicy.js:3-11` GENERIC_PROSE_PATTERNS 7 条禁句 → prose system 前缀；`checkDegeneration.js:23-41` 退化指纹事后扫描（不可配置） | 全链/章级审稿 |

### 2.2 四事现状

- **禁用词**：三个入口全非结构化；无「生成后按用户词表校验」（checkDegeneration 查 AI 腔不查用户词表）；360 字+6×180 预算必截大词表。
- **偏好词**：完全没有（vocabularyCommon 近乎死字段）。
- **专名**：`settlementService.js:344-421` settlementFromTurn 新名目抽取是**好底子**（《》「」引号名+大写拉丁，剔除已知词表，纯草案人工确认）但止步确认、不回流约束；narrativeTaskQuality 5 checks 与 critic 4 评分均无术语一致性项。
- **文风**：唯一量化物 = narrativeCritic shadow `voiceConsistency` 1-5 分（采样 0.25、只记 metrics 不反馈）；NARRATIVE_STYLES 四档预设是死代码路径；`shared/writingTextMetrics.js` 只有字数。

---

## 3. 设计提案（供裁定，未实施）

**总原则**：跟 W1 同一口径——模型与内容以 kit 为 canonical，Pinax 做管理面、注入、校验与读取通道；文件即真相、不搬存储。

### 3.1 词表三类一张表：项目根 `词汇表.json`（kit 同构格式）

```json
{ "format": "pinax-lexicon@1", "project": "<projectId>",
  "banned": [ { "word": "赋能", "level": 1, "scope": "global", "note": "" } ],
  "own":    [ { "word": "灵能", "note": "本书专有，替代'魔力'" } ],
  "canon":  [ { "term": "林冲", "aliases": ["豹子头"], "ref": "世界书/人物/林冲.md" } ] }
```

- banned/own 沿 kit `词汇表.json` 字段名（own/banned），**canon 是 Pinax 扩展**（kit 无正名/别名字段——这是「需 kit 侧对单」的唯一点；若 kit 后续认领则格式跟随）。
- 与世界书的关系照 kit 分工：canon.ref 指向世界书词条，词汇表只管「用词安全与口径」，设定真相仍在世界书——不造第二真相源。
- **通用层不拷贝**：slop-list v2.1 三级词表留在 kit，经 W1-A 已接的 `kb_read` 面按需取卡，Pinax 不落第二份词表文本（单源纪律，kit 自己的三源漂移是前车之鉴）。项目级 banned 是「在通用层之上追加本书禁词」的合并语义（kit 缺的正是这个合并加载）。
- 管理面：小面板（三段式：禁用/偏好/专名口径），落点建议并入 W2 知识控制台或「约束」就近入口；settlementFromTurn 的「新名目草案」确认后一键写进 canon/own（把既有抽取器接上回流，这是 Pinax 已有的最好底子）。

### 3.2 双闭环：事前注入 + 事后校验

- **事前**：词汇表编译成紧凑指令段进 kernel（禁用一级词零容忍/二级配额、偏好词「应使用」、canon 正名对照）——照 kit assembler 派发头形制（「项目专属词：…」「合规红线：禁止…」）；比现在整段约束文件注入省预算（结构化 vs 2000 字纯文本）。角色级 vocabularyForbidden/vocabularyCommon 顺手接进 narrativeVoiceProfile（现成字段，一条接线）。
- **事后**：确定性正则扫描（不花模型）：生成正文 × banned[] × GENERIC_PROSE_PATTERNS → 命中报告进交付链（对齐 checkDegeneration 的消费位），命中可一级拦截/二级提示（沿 kit prose-light 的 warn-only 档位思想）。kit prose-scan.py 是重型八维扫描，Pinax 不重写——见 3.3。

### 3.3 文风量化：跑 kit 的 prose-scan，建 Pinax 的累计读模型

- **量化器 = kit prose-scan.py**（八维+AI味指数，单源不二次开发）。每章/每交付跑一次，收据落项目内（对齐 kit 收据制）。
- **累计读模型 = 新文件 `<root>/文风/style-profile.json`**：近 N 章八维滑动均值、AI味指数趋势、高频套话命中 top、（未来）critic voiceConsistency 并入——这是 kit 也缺的「项目级文风读模型」。
- **agent 时刻读取的三条通道**（按成本递增）：
  1. **prompt 通道**：kernel `style` 块从「作者文本目标（writingStyle 600 字）」扩为「目标 + 实测偏差」两段式——agent 每轮生成天然带着画像（「时刻读取」的主路，零检索成本）；
  2. **文件通道**：style-profile.json 在项目文件夹内，agent 工具（读文件/检索）天然可达；
  3. **检索通道**：kb_read 取 kit 方法论卡（怎么改）、worldbook_search 取设定口径——W1-A 已接好，零新增。
- **写手侧联动**：偏差超阈值（如 AI味指数 > 阈值）→ 重写指令带具体命中词与八维弱项（不是笼统「更有文采」）。

### 3.4 排期落点建议（并入既有 W 账，不另开山头）

| 波次 | 内容 | 规模 |
|---|---|---|
| W1.5（W1 落地后插队） | 词汇表.json 契约+管理小面板+事前注入+角色声口字段接线（纯 Pinax 侧，零 kit 依赖） | M |
| W2.5（控制台落地后） | settlement 回流 canon + 事后校验扫描进交付链 | M |
| W3+（需前置） | prose-scan 跑通 + style-profile 读模型 + style 块两段式 | M-L，**前置：本机 python 可用**（当前 python 别名损坏，kit 工具链全 python——需先修环境） |

---

## 4. 风险与边界

1. **canon 扩展字段是格式分叉点**：kit 词汇表.json 无此字段，Pinax 先行定义需在 kit 侧对单认领（否则两仓格式漂移——graph.json 同构是靠契约注释维持的先例）。
2. **词表预算恒紧张**：kernel rules 块 900 + forbidden clip 360，结构化编译必须「紧凑指令段」而非全文注入；大词表分级注入（一级全量、二级只给计数与示例）。
3. **prose-scan 依赖 python**：本机 python 别名已坏（环境坑有案），W3+ 前置修复；或裁定由 kit 守护侧跑扫描、Pinax 只读收据（更贴监督归属 M2 口径）。
4. **通用黑名单更新流**：slop-list 在 kit 演进（已到 v2.1），Pinax 侧不做版本钉死——kb_read 实时取 + 契约探针式断言（W1-A 冒烟先例）。
5. **测试预算零和**：全部验证走 scripts/ 冒烟（词表契约 smoke、扫描器 fixture smoke、style-profile 聚合 smoke），不进 vitest。

---

## 5. 待裁定（编号供批复）

1. **词汇表.json 三段式格式**（banned/own/canon + pinax-lexicon@1）：认可？canon 字段是否先在 Pinax 定义、kit 侧后认领？
2. **通用黑名单取用方式**：kb_read 实时取卡（推荐，单源）vs 随仓 pin 一份快照（离线可用但双源）？
3. **事后校验的档位**：一级词拦截（打回重写）还是全量 warn-only（初稿期 prose-light 思想）？
4. **prose-scan 执行归属**：Pinax 本机修 python 直接跑，还是 kit 守护侧跑、Pinax 读收据（监督归属 M2 一并裁）？
5. **管理面落点**：W2 知识控制台内（词表=知识的一种）vs 独立小面板（约束/ 就近）？
6. **W1.5 插队与否**：W1 双波落地后先做词表三件套（M，零 kit 依赖），还是按原排期先 W2 控制台？
