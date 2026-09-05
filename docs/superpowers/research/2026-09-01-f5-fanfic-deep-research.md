---
title: F5 同人 + IP + 世界意志 深度+广度综合方案
date: 2026-09-01
purpose: 在 v4 骨架基础上，把 6 域深度研究(中文同人 / 英文同人 / AI+反 AI / 世界书 schema / 协作+Beta Reader / F1 §5.8 算法)综合为 13 个 V5 提案 + Worldbook Claim Schema v2 + F1 §5.8 算法伪代码 + 4 维约束地图 + 杠杆组合 + 7 步执行路径 + 7 项 user 拍板
前置: [F4 同人 + IP 导入 + 世界意志 30 秒闭环机制调研](./2026-09-01-f4-fanfic-ip-world-will-brainstorm.md)
调研来源: 6 路深研究 agent 综合
---

# Part 1 · 背景与转向

## 1.1 Pinax 现状（截至 2026-09-01）

**已完成**:

- C1-7 落笔上下文闭环（writingUnit v3 / Ghost peek-consume / sceneProjection / 受控项目记忆 v2 / 5 类 observer / AuthoringRunSession）
- F1 双态故事实验室（F1-0~F1-7：ScenePressureProjection / SceneDirectionSet / SceneBeatDraft / AdoptionImpactProjection / UnitSemanticProjection）
- F2 作家助手成熟编辑器能力对齐（F2-1 完成；F2-2 多窗写作进行中）
- 世界书多文件 import + JSON 结构化 + 设定分区生成

**关键决策（novel-cross-section-mvp-decisions）**:

- ✅ 主轴「小说截面 + 导演兼角色 + 4 字段最小人格」
- ❌ 联机商业模式 / UGC 市场 / 开放世界经济（**永久排除**）
- ❌ 6 档 auto-play / 计时器
- ✅ 同人作品（个人非商业衍生创作）**不在排除项**

**F1 §5.8 显式延后**:

- 沿 worldbook claim / history event / scene-beat 关系生成"世界意志修正"的多处 Ghost diff（F1-7 之后）
- 角色知识差异 / 显式保存为世界事实 / 提升 UnitSemanticProjection 为持久 sidecar / 可安装推演工作流 / PINAX.md 导出

## 1.2 用户的 pivot

> "希望我的产品能让普通的爱好者能很好上手并完成不错的创作，只要导入一系列的作品即可在类似这种 IP 下编辑自己的故事。"
>
> "为文本块加入人物后世界意志修正什么的。"

V4 给出了 9 个骨架提案。**v5 深化为 13 个具体方案，含 schema v2 + 算法伪代码 + 4 维约束地图**。

## 1.3 4 条 IP 版权硬边界（重复，V5 所有提案必须满足）

| # | 边界 | 含义 |
|---|---|---|
| 1 | **个人非商业** | Pinax 不自动出版 / 分发 / 生成可商用稿件 |
| 2 | **本地存储** | 不上传 IP 原文到云端 LLM 训练 |
| 3 | **零社交分享** | 不做 kudos / 排行 / 收藏夹分享 / IP 库 / IP 市场 |
| 4 | **AI 仅辅助抽取** | 不自动续写 canon，不替代作者生成原文 |

## 1.4 V5 vs V4 的差异

| V4 | V5 |
|---|---|
| 9 提案 | **13 提案** |
| 无具体 schema | **Worldbook Claim Schema v2 完整字段表**（20+ 字段） |
| 无算法 | **F1 §5.8 算法伪代码 3 套**（反向索引 BFS / 多处 Ghost diff 衍生 / 采纳冲突解决） |
| 无 4 维约束地图 | **完整约束地图**（4 IP × 反 AI × 版权案件 × 同人伦理，8 项） |
| 反例分散 | **统一反例注册表**（每条反例含"教训" + "Pinax 应避免"） |
| 5 步执行路径 | **7 步执行路径**（更细粒度） |
| 5 项 user 拍板 | **7 项 user 拍板**（+AI assistance level 透明度 + IP 黑名单具体词表） |

---

# Part 2 · 6 域深研究综合

## 2.1 中文同人深度（research 20）

**6 个中文同人独有 mechanic**:

| # | 机制 | 关键 UX | Pinax 落地（V5 提案）|
|---|---|---|---|
| 1 | **借/续/番/穿** 衍生四象限 | 晋江衍生区硬约束；引用 ≤ 3000 字 / 总长 1/10 | V5-F fandom 字段 + V5-A derivativeClass |
| 2 | **金手指/重生/系统/快穿** 元设定 | 刺猬猫 / 起点现代衍生四大 | V5-A powerSource 字段 |
| 3 | **OOC 警告 + coreTraits 不变性** | 晋江衍生区强制；中文同人零容忍主角 OOC | V5-G coreTraits immutable + flexibleTraits growth |
| 4 | **HE/BE/OE/TE 结局 + CP 契约** | 1V1 / NP / 无 CP / 群像 / 双男主 | V5-A endingContract + cpContract |
| 5 | **考据派 vs 设定党** 双 reference 分层 | 历史同人 vs 原作同人 | V5-A historicalSources + canonSources |
| 6 | **24h 接力 / 31 天命题 / 节日企划** timeBox | Lofter / CP 漫展 / 微博 | V5-I timeBox + cpStrict |

**反例（Pinax 应避免）**:

- Lofter 朱雀检测 60-80% 误判（"晦涩+内心独白"段被误标 AI）→ Pinax 不做单点裁决
- 晋江 OOC 警告流于形式（仅一句"OOC 预警"过审）→ Pinax 做 structured OOC contract
- 金手指模板僵化（系统流 + 任务奖励 + 等级爬升同质化）→ Pinax powerSource 灵活可定制

---

## 2.2 英文同人深度（research 21）

**6 个英文同人独有 mechanic**:

| # | 机制 | 关键 UX | Pinax 落地 |
|---|---|---|---|
| 1 | **AO3 Wrangler Committee** + Canonical Tag | 400+ 志愿者 / synonym merge / metatag-subtag | V5-A canonicalSlug + claimBacklinks |
| 2 | **Yuletide Gift Exchange** | 1000 字最低 / 50+ fandom 限定 / pinch-hit 24-72h | V5-L Dear Author Letter（接收者侧 prompt） |
| 3 | **Big Bang / Reverse Bang** | 15k-20k 字 / 画手配对 | **避坑**（70% 弃坑率） |
| 4 | **Kink Meme / Prompt Meme** | 匿名 prompt 池 / claim 48h / reveal 前 kudos | V5-I 轻 prompt 池（仅原创场景描述，不用 IP） |
| 5 | **5+1 Things / Hurt-Comfort / Coffee Shop AU / Fix-It** | 文类语法 / trope 模板 | V5-A tropeTemplate 字段 + F1 §5.8 reversal slot |
| 6 | **Beta Reader 五分类** | SPaG / Continuity / Plot / *-Picker / Character | V5-J AI Beta 模拟器 |

**反例**:

- AO3 Search filter 对新人 50+ 字段 6 个 checkbox → Pinax 默认收 2-3 个核心字段，其余渐进式 reveal
- Yuletide 完稿率 60-70% → Pinax 不做承诺送礼物机制，超时自动降级为个人创作
- Big Bang 5k 字门槛吓退 70% 爱好者 → Pinax 奖励过程（连续天数、新章节），不奖励长度

**关键数据**:

- AO3 17M works / 10M users / 2024 净增 2.1M works
- 同人 kudo Gini 0.85-0.90（比任何国家收入不平等还高），中位作品终生 kudo < 20
- AO3 Mature 40% 完成率，100k+ 字超长篇 27% 完成率，FFN 多章节文 24% 完成率
- 隐藏 AI 至少是显式 AI 的 18 倍（perplexity 检测）

---

## 2.3 AI 同人 + 反 AI 立场（research 22）

**6 个跨作品 mechanic**:

| # | 机制 | 关键 UX | Pinax 落地 |
|---|---|---|---|
| 1 | **Sudowrite Muse + Story Bible** "原作味幻觉" | AI 续写 1000 字 3 版本 + 角色稳定 | **避坑**（不暗示 AO3/LJ 训练） |
| 2 | **朱雀/腾讯反 AI 检测** 1920 账号限流 | 检测 60-80% 误判 | V5-B AI assistance level 透明标签 |
| 3 | **OTW "no opt-in = no scrape"** + 12.6M AO3 同人泄露 | canonical 标签 | V5-M opt-out TOS + Common Crawl 屏蔽 |
| 4 | **Character.AI Disney C&D** 2025-10 | DMCA Agent + 7 天响应 + ipClearance | V5-C IP 黑名单 + DMCA Agent |
| 5 | **AI 同人 kudo vs 手工同人质量倒挂** | kudo 短期 +30% 但 completion -30-40% | V5-B feedbackMetrics |
| 6 | **Ultraman 杭州案 ¥3 万** LoRA 帮助侵权 | 商业化 + IP 角色训练 = 注意义务上身 | V5-C + V5-M 商业化边界 |

**Alfassi 2025 调查（157 同人作者）关键数据**:

- 62% 已用 AI brainstorm/draft
- 76.4% 认为 AI 危胁社区社交性
- 83.4% 担忧 AI 故事盖过人工
- 86% 主张强制披露
- 57.7% 从未主动读 AI 同人
- 82.7% 接受语法级 AI 辅助
- 接受全生成仅 ~10%

**朱雀检测经验（腾讯朱雀官方 vs 实测）**:

- 官方准确率 ~92% / 误判 <12%
- 实测：晦涩难懂 + 语病 + 内心独白段判 AI 30-80%
- AI 续写/扩写内容降至 38% 检测率
- GPTZero 自称误判 <1%，Originality.ai 自称 2-3%
- 独立研究：非母语者误判高达 50%

**Lofter / 晋江反 AI 落地**:

- Lofter 1920 账号限流（哪吒 2 同人潮期）
- 晋江六分法：允许（校对 / 要素 / 粗纲）禁止（描写 / 叙事 / 细纲）
- 罚则：锁章 + 黄牌 + 永久禁榜 + 退订阅

**反例（Pinax 应避免）**:

- R1 Sudowrite 同人写作人数增加 → 同人圈反弹 + 平台限流连坐
- R2 Lofter 朱雀误伤 + 阅文 AI 训练协议 → 中国同人圈对 AI 平台结构性不信任
- R3 Character.AI Disney C&D + Ultraman 杭州案 → AI 平台作为 IP 律师金矿

---

## 2.4 世界书工具真实 schema（research 23）

**6 个工具核心 schema 对比**:

| 工具 | Entity 类型数 | 自定义 field | 关系 schema | 时间线 | API | 价位 |
|---|---|---|---|---|---|---|
| **World Anvil** | 22 (Character / Location / Organization / Species / Item / Event / Lore / Culture / Religion / Language / Mythology / Tech / Material / Building / Document / Vehicle / Military / Law / Ethnicity / Flora / Fauna) | prompt template 化（section 化），无独立 custom field system | article reference + map pin + family tree + relationship graph module | Chronicle + Era + Calendar + Magic System + Currency + Language | 无 | Free / Premium tier |
| **Kanka** | 13 (character / location / event / family / organization / item / note / race / quest / map / timeline / journal / dice roll) | 内置 + custom fields（Kanka 1.0） | 显式 relations table + D&D 字段集 | Timeline + Era | REST API（write 收费 Owlbear+） | Free / Owlbear+ |
| **LegendKeeper** | 6 (character / location / event / item / group / concept) | 自定义 fields | `[[entry-name]]` 双向链接 + auto-link | era + event + moon phase + lineage | 无（已停服） | SaaS（停服） |
| **Campfire** | 12 (Character / Location / Object / Culture / Creature / Spell / Technology / Event / Item / Faction / Scene / Chapter) | **完全自定义 category + 10 类 field types** | relation field 类型 | 多 timeline 按 story arc 拆分 + Plot module 独立 | 无 | Free / Premium |
| **Articy Draft** | 9 (Character / Location / Item / Dialog / Flow / Script / Audio / Image / Video / Asset) | Entity-based + 自定义 fields | Flow Graph + Conditions & Variables + Locales | Simulation Mode | JSON / XML / Word / **Excel** | 付费 |
| **Novelcrafter Codex** | 5 (Characters / Locations / Lore / Objects / Subplots) + 自定义 | + Trigger Keywords + Aliases + Color coding + Progressions | codex references + Global Mapping + Series Sharing | Progressions | API | 订阅 |

**Campfire 10 类 field types**（最灵活，可作为 Pinax 参考）:

- text / rich-text / date / number / select / multi-select / tag / image / relation / checklist

**Pinax Worldbook Claim Schema v2 建议**（V5-A 完整字段表）见 Part 4。

---

## 2.5 同人协作 + Beta Reader 文化（research 24）

**6 个跨域 mechanic**:

| # | 机制 | 关键 UX | Pinax 落地 |
|---|---|---|---|
| 1 | **Word War / Writing Sprint** 15-30 min 同步拼字 | 群内"GO!" / 倒计时 / 实时排行 / 字符流共享 | V5-I 轻拼字 15min 按钮 |
| 2 | **Yuletide Gift Exchange** | 1k 字最低 + 50+ fandom + pinch-hit 24-72h + 完稿率 60-70% | V5-L Dear Author Letter（严格只匹配原创场景标签） |
| 3 | **Beta Reader 五分类**（SPaG / Continuity / Plot / *-Picker / Character）+ Sensitivity Beta | Google Docs 行内评论 + addressed 标记 + 致谢 | V5-J AI Beta 模拟器（只能给建议不能改） |
| 4 | **Kink Meme / Prompt Meme** | 匿名 prompt 池 + claim 48h + reveal 前 kudos | V5-I 轻 prompt 池（仅原创场景描述） |
| 5 | **Round Robin / Chainfic** 多人接龙 | 风格漂移是公认问题 | V5-I 5 人接力（每段 500 字 + AI 记忆卡） |
| 6 | **同人 Zine** CJ 漫展 / Comic-Con | 印刷品 / 摊位 / 售卖 | V5-I 轻 zine PDF 出口 |

**反例**:

- Yuletide pinch-hit 弃稿 10-11% + 弃稿焦虑链 → Pinax 超时自动降级为个人创作
- Big Bang 5k 字门槛吓退 70% 爱好者 → Pinax 奖励过程（连续天数、新章节），不奖励长度
- AI Beta Reader 隐形指纹泄露 + 信任崩塌 → Pinax AI Beta 必须 visible + 可关 + 可声明

**AO3 / FFN 完成率数据**:

- AO3 Mature 评级 40% 完成率
- 100k+ 字超长篇 27% 完成率
- FanFiction.net 多章节文（剔除 oneshot）24% 完成率
- Elmer Studios 2025：103 篇追踪同人文中 70% 弃坑

**关键洞察**:

- "我答应给某人写"是单机写作永远没有的承诺压力（V5-L）
- "我在回应别人的想看"是同人 30 秒快感的核心（V5-I prompt 池）
- "AI Beta = 建议而非权威"是伦理红线（V5-J）

---

## 2.6 F1 §5.8「世界意志修正多处 Ghost diff」算法（research 25）

**6 个算法 / UX 模式**:

| # | 机制 | 出处 | Pinax 落地 |
|---|---|---|---|
| 1 | **Gerrit Relation Chain + Submitted Together** | Gerrit `submitWholeTopic` | V5-K 批级 revisionSetId + 四分区回执 |
| 2 | **反向依赖图 + 脏传播** (Salsa early-exit) | Salsa vs Adapton | V5-K claimBacklinks 派生索引 + BFS + early-exit |
| 3 | **三方合并优先于 CRDT** | RFC 7396 JSON Merge Patch + RFC 6902 JSON Patch `test` | V5-K all-or-nothing 批级事务 |
| 4 | **SelfCheckGPT NLI 而非 LLM 自评** | Manakul et al. EMNLP 2023 | V5-K + V5-G NLI 打分替换字符重叠 |
| 5 | **逐组 + 整批双档确认** | Word Track Changes 教训面 + Phabricator 三态 | V5-K 组级三态默认 + 整批次级 |
| 6 | **Revision 级三态而非 hunk 级微评** | Phabricator Differential | V5-K 组级三态（采用/忽略/改写） |

**关键算法发现**:

- `claimBacklinks` 反向索引是**唯一真前置**（今天 Pinax 的 `sourceRefs[]` 只有正向，"多处"无算法定义）
- SelfCheckGPT NLI NonFact\* 列仅 **45.17** AUC-PR — **越是刻意的角色越界，检测器越接近随机**，v4 "提示而非禁止" 必须在算法层也成立
- **不上 CRDT**（单作者无并发写，CRDT 复杂度全付收益为零）
- **不上 LLM 自评分当硬 gate**（阈值 0.5 平衡准确率 NLI 70.55、Prompt 76.69，AUC-PR 92.5 不等于可用二分类器）

**完整伪代码**（V5-K 落地）见 Part 5。

**observer 5 → 6 类扩展路径**:

- 不新增第 6 类
- 给现有 5 类输出加两个字段：`conflictsWith` 从 `string│null` 升为 `Array<{claimId, method: 'keyword'│'nli'│'llm', score}>`，`status` 从 `candidate│applied` 加 `needs-review`
- Reflection Layer 作为**第 6 类**只在 claim 回写方向存在，不参与 30 秒循环

---

# Part 3 · 13 个 V5 提案

每条结构：钩子 / 调研来源 / Pinax 接缝 / 新增字段 / 硬约束（4 条 IP 边界 + 反 AI 立场 + 算法约束）/ 工作量 / 风险 / 是否需 user 拍板。

---

### V5-A · Worldbook Claim Schema v2（field 扩展）

- **调研来源**：research 23 World Anvil/Kanka/Campfire/Articy/Novelcrafter 综合；research 20 中文同人元设定；research 21 AO3 Wrangler
- **钩子**：worldbook claim schema 升级为 v2，扩字段支持：
  - **核心身份**：`aliases[]` / `summary` / `secrets` / `colorCode` / `type` enum / `fieldSchemaVersion`
  - **元数据**：`tags` / `categoryTags` / `isPrivate` / `customFields[]`（任意 schema）
  - **关系**：`relations[]`（显式关系表 + 类型 + 权重）/ `familyId` / `raceIds[]` / `mapPinCoords`
  - **动力学**：`progressions[]`（timeline + 变化记录）/ `conditions[]`（可见性）/ `quickFacts Map`
  - **同人元设定**：`derivativeClass`（借/续/番/穿 4 选 1）/ `powerSource`（金手指/重生/系统/快穿）/ `coreTraits[]` / `flexibleTraits[]` / `endingContract` / `cpContract`
  - **IP 元数据**：`historicalSources[]` / `canonSources[]` / `fandom {key, version, era, aliasMap, crossLinks}`
- **接缝**：worldbook schema 扩字段（需集成 owner 审批）
- **硬约束**：
  - `customFields[]` 用 Campfire 10 类 field types（text/rich/date/number/select/multi-select/tag/image/relation/checklist）
  - `progressions[]` 仿 Novelcrafter Codex
  - 不动 sceneAnchors / writingUnit schema
- **工作量**：3-5 天
- **风险**：schema 扩字段需迁移旧数据
- **需 user 拍板**：✅（schema 边界 + 字段集）

### V5-B · AI Assistance Level 透明标签 + 草稿快照

- **调研来源**：research 22 朱雀/腾讯检测 + 晋江六分法 + OTW canonical 标签 + Alfassi 2025 调查
- **钩子**：每 scene 标 `aiAssistanceLevel: 'none'|'grammar'|'element'|'outline'|'description'|'narrative'|'detailed-outline'`（**与晋江六分法对齐**）；保留 `preAiDraft` 快照作"自证"证据；用户可主动声明 AI 介入范围
- **接缝**：scene 节点 attrs 加 aiAssistanceLevel；sceneDraft store 加 preAiDraft 快照
- **硬约束**：
  - 默认 'none'（手写），AI 调用时自动升级
  - 草稿快照**仅本地存储**（4 IP 边界 #2）
  - 不接训练授权协议（4 IP 边界 #1）
- **工作量**：2-3 天
- **风险**：用户可能觉得繁琐（标六分法）
- **需 user 拍板**：✅（隐私边界 + AI 调用 UI）

### V5-C · IP 黑名单 + DMCA Agent + 7 天响应流程

- **调研来源**：research 22 Ultraman 杭州案 ¥3 万 + Character.AI Disney C&D 2025-10 + Disney 20 页 brand bible
- **钩子**：生成前阻断 + 输出后 perplexity/子串比对：
  - **关键词黑名单**：奥特曼 / 迪士尼 / 漫威 / DC / 哈利波特 / 鬼灭之刃 / 咒术回战 / 原神 / 明日方舟 / 仙剑奇侠传 / 甄嬛传 / 陈情令 / 哈利波特等（IP 律师审核更新）
  - **DMCA Agent**：法定 DMCA Agent 地址 + 7 天响应流程
  - **生成前 prompt 扫描**：含 IP 角色名 / 关键词 → 弹"受保护 IP 提示"，让用户改用 transformative 衍生或原创
  - **输出后相似度比对**：与已知 IP 文本片段比对（用户导入的 IP 原文做参考）
- **接缝**：生成 pipeline 加 pre-check + post-check
- **硬约束**：
  - 不上传 IP 原文到云端 LLM（4 IP 边界 #2）
  - 不主动屏蔽公开领域角色（Hidden Door 范式：Oz / Pride & Prejudice / Cthulhu 可用）
  - 商业化路径与 IP 内容严格隔离（Ultraman 杭州案 ¥3 万警告）
- **工作量**：3-5 天
- **风险**：误判（朱雀 60-80% 误判率警示）/ IP 列表维护成本
- **需 user 拍板**：✅（法律边界 + IP 列表）

### V5-D · Demo IP 模板墙（中英双语）

- **调研来源**：research 19 Empty-Desk Welcome + Template Gallery Pop + research 20 中文同人 demo IP 需求
- **钩子**：Pinax 首次进入时弹 Template Gallery，提供 5-7 个**完全匿名化** demo IP 模板：
  - **中文** 2-3 个：demo奇幻大陆 / demo校园 / demo古代江湖
  - **英文** 2-3 个：demo sci-fi / demo mystery / demo contemporary
  - 每个含 6-8 张人物卡 + 2-3 张地点卡 + 1 张示例关系图
  - 用户可改可删可当起点
- **接缝**：worldbook entry seed 数据预置；不动 schema
- **硬约束**：所有 demo IP 人物名 / 地点名全部匿名（不引用任何真实 IP）；本地预置；可一键删除
- **工作量**：1-2 天
- **风险**：极低
- **需 user 拍板**：否

### V5-E · Worldbook 卡片网格（World-as-Card-Deck）

- **调研来源**：research 19 Hidden Door + Heptabase + research 23 Campfire + research 21 AO3 Search filter 教训
- **钩子**：worldbook schema 表 → 卡片网格呈现：
  - **人物卡**：头像 + 姓名 + 1 句话 + coreTraits[] 标签 + 颜色编码
  - **地点卡**：缩略图 + 名称 + 1 句话 + type
  - **物品 / 组织 / 事件卡**：类似布局
  - 拖拽排序、点击编辑、关系连线
- **接缝**：AuthoringSceneRail 增 corkboard tab；可与 sceneUnit 网格联动（V5-F + V5-I 联动）
- **硬约束**：
  - 不取代 draft editor（仅作导航）
  - 默认收 2-3 个核心字段（防 AO3 Search filter 教训）
  - advanced 才展开全字段
- **工作量**：5-7 天
- **风险**：UI 复杂度升高
- **需 user 拍板**：否

### V5-F · 同人 tag / fandom 字段

- **调研来源**：research 20 借/续/番/穿 + research 21 AO3 Wrangler / Fanmeta 四元组 / 晋江衍生区
- **钩子**：worldbook claim 加 `fandom: { key, version, era, aliasMap, crossLinks }`：
  - **fandom.key**：IP 唯一键（如 `hp-original`，匿名）
  - **fandom.version**：IP 版本（如 HP 第七版 / LOTR 电影版）
  - **fandom.era**：时间线（如 HP 1981-1998 / LOTR 第三纪元）
  - **fandom.aliasMap**：同人圈别名映射（如 `Draco Malfoy` / `德拉科·马尔福` / `DM`）
  - **fandom.crossLinks**：跨 IP 同世界观链接（如 HP ↔ 神奇动物）
- **接缝**：worldbook 派生索引 `fandomBacklinks`；与 V5-A coreTraits / derivativeClass 联动
- **硬约束**：
  - 不直接存储真实 IP 名称（必须匿名 key）
  - 用户在导入时声明 IP 名称 → 系统生成匿名 key
- **工作量**：2-3 天
- **风险**：低
- **需 user 拍板**：✅（字段扩 + 匿名 key 策略）

### V5-G · Pinax OOC 软提示（Soft OOC Nudges）

- **调研来源**：research 20 晋江 OOC 警告 + 衍生四象限 / research 22 Alfassi 2025 同人伦理 / research 25 SelfCheckGPT NLI
- **钩子**：Ghost 采纳时检测新文本是否撞 character.boundaries / canonFacts / voicePolicy：
  - **worldbook character** 加 `boundaries[]`（硬底线）/ `canonFacts[]`（核心特质）/ `voicePolicy` enum（strict-canon / modernized-AU / gender-swap / coffee-shop-AU 等）/ `source` URL
  - **NLI 打分**：把 claim 当 premise、新文本句当 hypothesis 跑 NLI（SelfCheckGPT 范式），输出连续分**只做排序与软提示**
  - **adoption receipt** 展示 "OOC 提示 X 条（Y 来自边界 / Z 来自核心特质 / W 来自 voicePolicy）"
  - **作者可一键采用修正 / 忽略 / 改写**
- **接缝**：Ghost receipt 增 `oocFlags[]`；adoption transaction 增 optional `oocRevisions`；与 F1 §5.8 路径同源
- **硬约束**：
  - **必须 soft suggest，never hard block**（研 22 反例 A 警示 Character.AI jailbreak；研 25 警告 LLM 自评分 AUC-PR 92.5 但阈值 0.5 平衡准确率仅 70.55）
  - 任何 LLM RP framing 都不能绕过结构化 diff（linter 而非 model preference）
  - NLI 本地跑（SelfCheckGPT DeBERTa-v3-large MNLI），不调云端 LLM
- **工作量**：5-7 天
- **风险**：用户感受"工具在控制我"；linter 误报
- **需 user 拍板**：✅（soft only 边界 + LLM framing 绕过测试）

### V5-H · 触发式 lore 注入（Trigger-key world info）

- **调研来源**：research 18 触发式 lore 注入 + research 22 AID Story Card + NovelAI Lorebook
- **钩子**：worldbook claim 加 `triggerKeywords[]` + `sticky_until_unit` + `ttl` + `cooldown` + `use_probability`：
  - scene-beat 进入编辑时按当前节拍关键词匹配触发
  - 命中自动把"人物底线 / 世界规则 / 设定锚"注入 narrativeKernel 上下文
  - scene rail 显示"已激活的世界规则 X 条"
- **接缝**：worldbook matcher 已锁 5 类（常驻/绑定/关键词/starter/预算），加 triggerKeywords 字段是**扩字段不破 matcher**
- **硬约束**：
  - 命中率不超 context budget 的 25%
  - probability false positive 雪崩必须有上限（research 18 反例警示）
  - sticky 不超过 presentCharacterIds 8 cap（user 硬锁）
- **工作量**：3-4 天
- **风险**：context 雪崩；trigger 顺序不可控
- **需 user 拍板**：否

### V5-I · 同人协作轻机制（Word War / Prompt 池 / 接力 / Zine）

- **调研来源**：research 24 Word War / Kink Meme / Round Robin / 同人 Zine
- **钩子**：4 个轻协作机制，**严格只用原创场景描述，不用 IP 角色名**：
  1. **Word War 15 min 拼字**：邀请好友链接进入极简同步计时面板，结束后双方各看到对方字符流（不含文本，只显字数曲线和颜色块）
  2. **轻 prompt 池**：Pinax 用户贴一句"我想看到这种节拍：海边 + 老人 + 等待"（纯原创场景描述）；其他用户可 claim；claim 后 24h 倒计时；超时自动归还
  3. **5 人接力 Round Robin**：每段 500 字 + AI 记忆卡确保下一段不丢失关键意象；不强制连续性，让风格漂移本身成为乐趣
  4. **轻 zine PDF 出口**：用户写满 N 章后一键生成 PDF（封面 / 目录 / 章节 / 后记），可发小红书 / 微信收藏
- **接缝**：sceneAnchors 加 `contest: { prompt, deadline, badge }`；UI 加 Word War 按钮 + prompt 池
- **硬约束**：
  - **不做承诺送礼物**（避免 Yuletide 弃稿 10-11% 焦虑链）
  - **不做 5000 字硬门槛**（避免 Big Bang 70% 弃坑）
  - **所有 prompt 池 / 接力仅原创场景描述**（不用 IP 角色名）
  - 零社交分享：不显示"X 人已参加"、不发邮件、不推送
- **工作量**：3-5 天
- **风险**：与"导演兼角色"主轴的微妙张力（deadline 倒计时是否会增加焦虑）
- **需 user 拍板**：✅（sceneAnchors contest 字段 + deadline 边界）

### V5-J · AI Beta 模拟器（4 档独立审稿卡）

- **调研来源**：research 24 Beta Reader 文化 + Sensitivity Beta + research 22 反 AI 伦理
- **钩子**：F1 narrativeKernel 输出草稿后，加 Beta 模拟器：
  - **SPaG Beta**：拼写 / 标点 / 语法
  - **角色一致性 Beta**：比照 worldbook character.boundaries + canonFacts + voicePolicy
  - **节拍连续性 Beta**：比照 sceneAnchors + F1 压力投影
  - **情感曲线 Beta**：节拍间情绪变化合理性
  - 每档独立卡片，**只能给建议不能改文本**，作者必须人工修改后才进入"发布候选"
- **接缝**：F1 草稿生成后新增 Beta 审稿阶段
- **硬约束**：
  - AI Beta 输出必须 visible + 可关 + 可声明（research 22 反例 R3 警示）
  - **永远不应自动重写文本，只能给建议**
  - 用户每次 AI 介入时点"是/否接受这次 AI 建议"
- **工作量**：3-5 天
- **风险**：信任崩塌（AI Beta 隐形指纹泄露）
- **需 user 拍板**：✅（伦理边界 + 可见性 UI）

### V5-K · F1 §5.8「世界意志修正多处 Ghost diff」算法

- **调研来源**：research 25 全部 6 模式（Gerrit / Salsa / RFC 7396+6902 / SelfCheckGPT / Word / Phabricator）
- **钩子**：F1 §5.8 显式延后阶段的具体算法实现：
  - **claimBacklinks 反向索引**（模式 2，唯一真前置）：派生字段，零 schema 变更；BFS + Salsa early-exit；深度上限 2
  - **批级 revisionSetId**（模式 1）：对全批 `unitIds+claimIds` 排序后走现成 `deterministicId()` FNV-1a；四分区回执：直接命中 / 传递衍生 / 同主题 / 冲突挡住
  - **批级 all-or-nothing**（模式 3）：每条候选 diff 前置 `test` 断言（`claim.revision` + `unit.contentHash`），全批一致才持久化
  - **NLI 打分**（模式 4）：本地 DeBERTa-v3-large MNLI，输出连续分**只做排序与软提示**，不做硬 gate
  - **组级三态 + 整批次级**（模式 5+6）：默认逐组（采用 / 忽略 / 改写），整批为显式次级动作；批级撤销回执（不复刻 Word Accept All 不可逆）
  - **硬性深度 ≤ 2 + 每批 ≤ 5 组**（防 token 雪崩 + 防级联提交）
  - **observer 5 类输出升级**：`conflictsWith` 从 `string│null` 升为 `Array<{claimId, method, score}>`，`status` 加 `needs-review`
- **接缝**：复用 `deterministicId` + revision 守卫 + 可逆 delta；批级撤销回执复用现有"可逆事务"基建
- **硬约束**：
  - 不上 CRDT（单作者无并发写，复杂度全付收益为零）
  - 不上 LLM 自评分当硬 gate（阈值 0.5 平衡准确率 NLI 70.55）
  - 整批撤销回执必须可逆（Word Accept All 反例警示）
  - 部分失败一律全批回滚，不留半应用状态
- **工作量**：10-14 天
- **风险**：复杂度高；需先有 V5-A schema 基础 + V5-G OOC 软提示基础
- **需 user 拍板**：✅（6 个算法边界 + observer 5→6 类扩展）

### V5-L · Yuletide Dear Author Letter 接收者侧 prompt

- **调研来源**：research 21 Yuletide Gift Exchange + research 24 承诺压力
- **钩子**：F2 §6 截面合同的"接收者侧 prompt"——4 字段人格 + 5-8 行 DNW：
  - **Dear Author Letter**：用户互填"我想要的节拍"和"我愿意写的节拍"
  - **匹配**：4 字段人格 + 5-8 行 DNW（Do Not Want）匹配
  - **承诺**：匹配后产生 72 小时内的"信物"任务
  - **降级**：超时自动降级为个人创作（避免 Yuletide 弃稿 10-11% 焦虑链）
- **接缝**：F2 §6 截面合同 + 收件箱 inbox
- **硬约束**：
  - **严格只匹配原创场景标签**（不用 fandom 角色名 / 原作标题）
  - **不做承诺送礼物**（letter 是灵感 prompt，不是"必须给"）
  - 零社交分享：匹配结果仅双方可见
- **工作量**：5-7 天
- **风险**：低
- **需 user 拍板**：否

### V5-M · 透明 opt-out TOS + Common Crawl 屏蔽声明

- **调研来源**：research 22 OTW "no opt-in = no scrape" + Bartz v Anthropic $1.5B + nyuuzyou 12.6M AO3 同人泄露
- **钩子**：Pinax TOS 明示 + 技术落地：
  - **TOS 明示**："用户作品不用于训练任何第三方 AI 模型"
  - **robots.txt 屏蔽**：Common Crawl / GPTBot / CCBot / anthropic-ai / ClaudeBot
  - **opt-out 默认**：所有用户内容默认 opt-out（除非用户主动 opt-in 用于 Pinax 自身 quality 改进）
- **接缝**：TOS 文档 + Pinax 项目目录 robots.txt
- **硬约束**：
  - 永远不接 AI 训练授权协议（research 22 反例 R2 阅文 AI 训练协议警示）
  - opt-out 是默认不是选项（4 IP 边界 #1）
- **工作量**：1-2 天
- **风险**：极低
- **需 user 拍板**：✅（TOS 文案）

---

# Part 4 · Pinax Worldbook Claim Schema v2（完整字段表）

**继承自 v1**: `name` / `description` / `tags` / `createdAt` / `updatedAt` / `sourceRefs[]`

**新增字段（V5-A 落地）**:

| 模块 | 字段 | 类型 | 来源 | V5 用途 |
|---|---|---|---|---|
| **核心身份** | `aliases[]` | string[] | Novelcrafter / World Anvil | 多名自动识别 + Trigger Keywords |
| | `summary` | string (1-2 句) | WA / Kanka | sceneCandidates 短引用 |
| | `secrets` | string (rich text) | WA / LK | GM-only / 玩家隐藏段 |
| | `colorCode` | string (hex) | Novelcrafter | NPC/PC/主角/反派视觉染色 |
| | `type` | enum (character/location/event/item/organization/...) | Kanka | 13 类 Entity 适配 |
| | `fieldSchemaVersion` | integer | Kanka | schema 版本化迁移 |
| | `customFields[]` | CustomField[] (10 类 types) | Campfire | 完全自定义字段 |
| **元数据** | `tags` (继承) | string[] | v1 | 保留 |
| | `categoryTags[]` | string[] | Kanka | 顶层分类 |
| | `isPrivate` | boolean | WA / LK | secrets 段可见性 |
| **关系** | `relations[]` | Relation[] { to, type, weight } | Kanka `?related=1` | 显式关系表 |
| | `familyId` | UUID ref | Kanka | 家谱 |
| | `raceIds[]` | UUID[] | Kanka | 种族 |
| | `mapPinCoords` | { x, y, layer } | WA / LK / Campfire | 地图标注 |
| **动力学** | `progressions[]` | Event[] { chapterId, change, timestamp } | Novelcrafter | 角色弧光追踪 |
| | `conditions[]` | Condition[] | Articy | "仅在主角死亡时显示" 等可见性 |
| | `quickFacts` | Map<string, string> | Campfire / Novelcrafter | key-value 速查 |
| | `sectionPrompts` | Map<section, rich text> | WA | Generic/Naming/Mental/Physical/Personal/Social/Divine |
| **同人元设定** | `derivativeClass` | enum (borrowing/continuation/side_story/transmigration) | 晋江衍生四象限 | 中文同人借/续/番/穿 |
| | `powerSource` | enum (systemSpirit/rebirthMemory/elderAI/spatialArtifice/propheticDream) | 刺猬猫 / 起点 | 金手指/重生/系统/快穿 |
| | `coreTraits[]` | string[] | 晋江 OOC 契约 | 不可变核心特质 |
| | `flexibleTraits[]` | string[] | 晋江 OOC 契约 | 可成长边缘特质 |
| | `endingContract` | enum (HE/BE/OE/TE) | 晋江结局 | 最后一幕 pressure 收敛 |
| | `cpContract` | enum (1V1/NP/noCP/poly/ensemble) | 晋江 CP 关系 | 多角色压力分配 |
| **IP 元数据** | `historicalSources[]` | Source[] { url, chapter, excerpt } | 考据派 vs 设定党 | 史料层 |
| | `canonSources[]` | Source[] | 同上 | 原作层 |
| | `fandom` | { key, version, era, aliasMap, crossLinks } | AO3 / 晋江 | 同人 tag / fandom 字段 |
| | `voicePolicy` | enum (strict-canon/modernized-AU/gender-swap/coffee-shop-AU/...) | 翻译学 Venuti | 翻译策略 |
| | `boundaries[]` | string[] | Character Card V3 | "Shan't kill" 硬底线 |
| | `source` | string (URL) | CCv3 source | 来源出处 |
| **AI + 同人伦理** | `aiAssistanceLevel` | enum (none/grammar/element/outline/description/narrative/detailed-outline) | 晋江六分法 + AO3 canonical | V5-B 透明标签 |
| | `preAiDraft` | string (snapshot) | — | 自证证据 |
| | `triggerKeywords[]` | string[] | AID Story Card / NovelAI | V5-H 触发 lore |
| | `sticky_until_unit` | integer | Lorebook Sticky | V5-H 持久在场 |
| | `ttl` | integer | Lorebook TTL | V5-H 触发 N 次下线 |
| | `cooldown` | integer | Lorebook Cooldown | V5-H 触发后冷却 |
| | `use_probability` | float (0-1) | Lorebook Probability | V5-H 概率触发 |
| | `conflictsWith[]` | Array<{ claimId, method, score }> | observer 5 类升级 | V5-K 多处 Ghost |
| **同人生成场景** | `timeBox` | ISO8601Duration | Lofter 命题 / CP 漫展 | V5-I 倒计时 |
| | `cpStrict` | enum (no_split_no_reverse/soft) | Lofter CP 站 | V5-I 拆逆禁 |
| | `contest` | { prompt, deadline, badge } | 同人活动 | V5-I 同人祭典 |

**CustomField 10 类 field types**（Campfire 借鉴）:

text / rich-text / date / number / select / multi-select / tag / image / relation / checklist

**Relation 类型枚举**（Kanka + WA 借鉴）:

parent / child / sibling / spouse / mentor / student / ally / enemy / lover / rival / member-of / located-at / owns / owned-by / created / destroyed / related-to

---

# Part 5 · F1 §5.8 算法伪代码（V5-K 落地）

## 5.1 反向索引构建 + 脏传播（BFS + Salsa early-exit）

```
// 派生索引，保存时增量维护；不进 worldbook 真源 schema
buildBacklinks(worldbook, chapters):
  backlinks = Map<claimId, Set<unitId>>
  for unit in chapters.flatMap(c => c.units):
    for ref in unit.sourceRefs:                    // 已存在字段
      if ref.kind == 'claim': backlinks.add(ref.id, unit.id)
    anchor = resolveActiveAnchor(unit.id)          // 已存在函数
    for cid in anchor.presentCharacterIds:         // 角色 claim 也是边
      backlinks.add(cid, unit.id)
  return backlinks

// 脏传播：BFS，深度≤2，结果哈希 early-exit
propagate(changedClaimId, backlinks, MAX_DEPTH=2, MAX_GROUPS=5):
  queue = [(changedClaimId, depth:0)]
  seen  = Set(); affected = []
  while queue not empty and affected.length < MAX_GROUPS:
    (nodeId, depth) = queue.shift()
    if nodeId in seen or depth > MAX_DEPTH: continue
    seen.add(nodeId)
    for unitId in backlinks.get(nodeId) ?? []:
      newHash = projectionHash(unitId, nodeId)     // 该 unit 受此 claim 影响的投影
      if newHash == cachedHash(unitId, nodeId):
        continue                                   // ★ Salsa early-exit：结果未变不标脏
      affected.push({ unitId, viaClaimId: nodeId, depth })
      if depth < MAX_DEPTH:
        for downstream in claimsAssertedBy(unitId):
          queue.push((downstream, depth+1))
  overflow = (queue not empty)                     // 超限 → 只列清单不生成 diff
  return { affected, overflow }
```

**复杂度**: O(E_affected)，非 O(书)。early-exit 是把"全书 47 处引用"压到"真的变了的 3 处"的唯一手段。

## 5.2 多处 Ghost diff 衍生（分组 → 排序 → 单次调用）

```
deriveWorldWillRevisions(changedClaim, affected):
  // 分组：同 (chapterId, viaClaimId) 归一组，避免同一 claim 在同章刷出多条
  groups = groupBy(affected, a => `${chapterOf(a.unitId)}::${a.viaClaimId}`)

  // 排序：核心 claim（boundaries/canonFacts）优先于细节；同级按 depth 升序
  score(g) = weightOf(g.viaClaimId)               // boundaries=3, canonFacts=2, 其他=1
           * (1 / (1 + g.depth))
           * nliScore(g)                          // 模式 4：只做排序，不做 gate
  groups = groups.sortDesc(score).take(MAX_GROUPS)  // ≤5

  // 批量：单次 provider 调用生成全部组，共享上下文（省 token、保风格一致）
  // 超 token 预算则按 score 从尾部丢，不切成 N 次串行调用
  budget = remainingContextBudget()
  while estimateTokens(groups) > budget: groups.pop()

  candidates = provider.generateBatch(groups, sharedContext: changedClaim)

  // 部分失败：成功的组照常呈现（各组独立 diff），但采纳仍全批事务
  return candidates.map(c => ({
    ...c, groupId: c.groupId, viaClaimId: c.viaClaimId,
    reason: c.reason,                              // 给作者看的"为什么"
    strength: nliScore(c)                          // 软提示强度，不是阈值门
  }))
```

## 5.3 采纳的冲突解决（JSON Patch `test` + 批级 all-or-nothing）

```
adoptWorldWillRevisions(selectedGroups, worldbook, chapters):
  revisionSetId = deterministicId(sorted(selectedGroups.map(g=>g.id)).join('\0'))  // 复用现成 FNV-1a

  // 阶段 1：基线断言（RFC 6902 test 语义）——先全查，后全写
  for g in selectedGroups:
    if claimRevision(g.viaClaimId) != g.baseClaimRevision:
      return { ok:false, reason:'claim-revision-stale', conflicts:[g.id] }
    if contentHash(g.unitId)      != g.baseUnitHash:
      return { ok:false, reason:'unit-content-drifted', conflicts:[g.id] }

  // 阶段 2：三方合并检测互相矛盾的组（两组改同一 claim 的同一 path）
  byPath = groupBy(selectedGroups.flatMap(g=>g.patchPaths), p=>p)
  conflicting = byPath.filter(ps => ps.length > 1)
  if conflicting.nonEmpty: return { ok:false, reason:'intra-batch-conflict', conflicts:conflicting }

  // 阶段 3：全批准备 delta（复用现成可逆事务），任一失败 → 整批放弃
  deltas = []
  for g in selectedGroups:
    d = prepareWritingAdoptionDeltas({ candidate:g.candidate, insertedUnitIds:[g.unitId], ... })
    if not d.ok: return { ok:false, reason:d.reason, conflicts:[g.id] }   // ★ 不留半应用
    deltas.push(d)

  // 阶段 4：单次书级持久化 + 批级撤销回执
  return { ok:true, revisionSetId,
           receipt:{ groups:selectedGroups.length, undo:invertAll(deltas) } }
```

**三处硬约束**:

① `test` 全部前置，写入全部后置；② 批内 path 冲突先于持久化拦下；③ 撤销回执是**批级**的（`invertAll`），不是逐条——直接避开 Word 式不可逆 Accept All。

## 5.4 observer 5 类升级（不新增第 6 类）

```js
// 当前 observer 输出
{
  kind: 'entity' | 'relation' | 'event' | 'timeline' | 'memory',
  status: 'candidate' | 'applied',
  conflictsWith: string | null,           // 单向标量
  // ...
}

// V5-K 升级后
{
  kind: 'entity' | 'relation' | 'event' | 'timeline' | 'memory',
  status: 'candidate' | 'applied' | 'needs-review',
  conflictsWith: Array<{
    claimId: string,
    method: 'keyword' | 'nli' | 'llm',
    score: number                         // 连续分，0-1
  }>,
  // ...
}
```

**Reflection Layer 作为"第 6 类"**: 仅在 claim 回写方向存在，不参与 30 秒循环（独立于 Ghost 链路）。

---

# Part 6 · 4 维约束地图

| 维度 | 允许做 | 禁止做 | 灰区（看具体） | Pinax V5 落地 |
|---|---|---|---|---|
| **#1 训练数据** | 用户手写内容不训练任何 AI 模型；屏蔽 Common Crawl/GPTBot/CCBot | 抓 AO3/LJ/晋江/Lofter 同人训练；阅文式"免费永久授权"AI 训练协议 | 用户授权 Pinax 用于自身 quality 改进的 opt-in | ✅ V5-M opt-out 默认 |
| **#2 内容输出** | 原创角色 + AI assistance 标签（晋江六分法）；AO3 canonical 标签 | 输出可识别 IP 角色（迪士尼/漫威/奥特曼/Harry Potter/鬼灭之刃）；提供"AI 一键 X X 同人"模板 | 公开领域角色（Oz/Pride & Prejudice/Cthulhu）✓ Hidden Door 范式 | ✅ V5-C IP 黑名单 + V5-B AI 标签 |
| **#3 平台规避** | 用户原创 + 清晰 transformative | 改角色名绕黑名单（"Harold Putter" 案）；批量生成 IP 灌水 | 单条 transformative 衍生，限"礼物经济"非商业 | ✅ V5-F fandom.aliasMap（让"IP 别名"自动触发） |
| **#4 商业化** | 原创内容/工具订阅/AI Beta Reader 服务；Hidden Door 式 IP partnership 收入分成 | 商业化含 IP 内容；阅文式 AI 训练免费授权；AI 同人订阅包 | 公共领域角色 + revenue-sharing（Hidden Door Oz/Pride 范式） | ✅ V5-A+V5-C 商业化边界 EULA |
| **反 AI（中文圈）** | AI assistance level 透明 + 原始手稿快照；接 Lofter/晋江/朱雀 检测体系 | 1920 账号式静默限流；朱雀式概率分数无申诉；阅文式 AI 训练协议 | 朱雀误判 60-80% 的"晦涩段"如何申诉 | ✅ V5-B 六分法 + 快照 |
| **反 AI（英文圈）** | OTW "no opt-in = no scrape"；canonical "Created Using Generative AI" 标签 | 12.6M AO3 同人上 Hugging Face（nyuuzyou 案）；Sudowrite 暗示 AO3 训练 | AI Beta Reader 算不算 AI 介入？Alfassi 82.7% 接受语法辅助 | ✅ V5-B + V5-J AI Beta 伦理 |
| **版权案件** | Bartz v Anthropic $1.5B 后训练数据须授权；NYT v OpenAI $100M+ 后须 RAG 防护；Tolkien v Polychron 后同人不可商业化 | Bartz 类训练；Tolkien 类自出版含 IP 角色；Ultraman 杭州案 LoRA 商业化 | Ultraman 广州案 ¥1 万 vs 杭州案 ¥3 万——商业化是关键变量 | ✅ V5-C + V5-M 综合约束 |
| **同人伦理** | AI 语法辅助；AI Beta Reader；AI 续写由用户最终决定；显式披露 AI 介入 | AI 全生成；隐藏 AI 介入；AI 同人当原创投稿；用 AI 取代 Beta Reader 情感反馈 | "AI 续写 + 用户手写接续"是不是同人？Alfassi 调查分歧大 | ✅ V5-B 透明 + V5-J 伦理 |

**Pinax 一句话定位**:

> 做 **"AI 同人写作助手"**，不做 **"AI 同人代写平台"**；
> 做 **"原创 + 公开领域 + transformative derivative"**，不做 **"商业化 IP 角色"**；
> 做 **"透明六分法 + 草稿快照 + opt-out 默认"**，不做 **"AI 灌水工具 + 阅文式授权"**。

---

# Part 7 · 反例注册表（UX 教训）

| # | 反例 | 来源 | Pinax 应避免 |
|---|---|---|---|
| R1 | Sudowrite 同人写作增加 → 同人圈反弹 + 平台限流连坐 | research 22 | 不暗示训练自 AO3/LJ；不做"原作味"卖点宣传；TOS 必须明确 opt-out |
| R2 | Lofter 朱雀误伤 + 阅文 AI 训练协议 → 中国同人圈对 AI 平台结构性不信任 | research 22 | 透明 AI assistance level；原始手稿快照作自证；永远不接 AI 训练授权协议 |
| R3 | Character.AI Disney C&D + Ultraman 杭州案 → AI 平台作为 IP 律师金矿 | research 22 | 不做角色 marketplace；不做"AI 一键 X X 同人"模板；必须有 IP 黑名单 + DMCA Agent + 7 天响应 |
| R4 | AO3 Search filter 对新人不友好（50+ 字段 6 个 checkbox） | research 21 | 默认收 2-3 个核心字段，其余渐进式 reveal |
| R5 | Yuletide 完稿率 60-70% + pinch-hit 弃稿 10-11% | research 21/24 | 不做承诺送礼物；超时自动降级为个人创作 |
| R6 | Big Bang 5k+ 字门槛吓退 70% 爱好者 | research 21/24 | 不做硬长度门槛；奖励过程（连续天数、新章节） |
| R7 | AI Beta Reader 隐形指纹泄露 + 信任崩塌 | research 22/24 | AI Beta 必须 visible + 可关 + 可声明；永远不应自动重写 |
| R8 | Character.AI IP 守则易 jailbreak（RP framing 绕过） | research 18 | 守则必须结构化可审计（linter），不写 LLM system prompt |
| R9 | Disney/Tolkien 法律禁同人（Tolkien v Polychron ¥134K 律师费） | research 18/22 | Pinax 站作者一侧；守则只对作者自己声明的 character 起效 |
| R10 | AI 工具 IP 守则触发版权警觉（NovelAI LLM 拒绝 RP） | research 18 | soft suggest，never hard block；不做通用守则默认值 |
| R11 | Lofter 朱雀检测 60-80% 误判（晦涩段被误标） | research 20/22 | 不做单点裁决；保留 human review + 二次申诉 + 留档证据链 |
| R12 | 晋江 OOC 警告流于形式（仅一句"OOC 预警"过审） | research 20 | structured OOC contract；与 F1 pressure 直接挂钩 |
| R13 | 金手指模板僵化导致同质化（"又是这个套路"） | research 20 | powerSource 灵活可定制；Power Engine 自动生成长曲线 + 低谷 |
| R14 | LLM 自评分 AUC-PR 92.5 但阈值 0.5 平衡准确率仅 70.55 | research 25 | 分数只用于排序与软提示，不做硬 gate |
| R15 | CRDT 在单作者场景复杂度全付收益为零（16-32 字节元数据） | research 25 | 走基线断言 + 三方合并 + 批级 revision 守卫，不上 CRDT |
| R16 | Word Track Changes Accept All 不可逆 | research 25 | 批级撤销回执，不复刻 Word 不可逆 |
| R17 | Gerrit topic 提交级联到依赖各自的 topic | research 25 | 硬性深度 ≤2 + 每批 ≤5 组；超限只列清单不生成 diff |
| R18 | World Anvil 学习曲线地狱（22 个 article type + prompt template + BBCode） | research 23 | 不 hardcode 22 个 type；预填 4 字段最小人格，advanced 才展开 |
| R19 | Kanka API write 收费 + schema 漂移 | research 23 | API 永远 free（localStorage/桌面 SQLite）；schema 版本化常驻 |
| R20 | LegendKeeper 已停服，数据绑架 | research 23 | 本地项目底座真源（Electron + UTF-8 TXT + SQLite）；完整 export 三种格式 |

---

# Part 8 · 杠杆组合

## 8.1 工作量 × 杠杆 × 风险表

| V5 | 工作量 | 杠杆 | 融入度 | 风险 | user 拍板 |
|---|---|---|---|---|---|
| **D** Demo IP 模板墙 | 1-2d | 中 | **极高** | 极低 | 否 |
| **M** opt-out TOS | 1-2d | 中 | **极高** | 极低 | ✅ |
| **B** AI Assistance Level | 2-3d | **极高** | 高 | 无 | ✅ |
| **A** Worldbook Schema v2 | 3-5d | 高 | 高 | schema 扩 | ✅ |
| **H** 触发式 lore 注入 | 3-4d | 高 | 高 | probability | 否 |
| **J** AI Beta 模拟器 | 3-5d | 高 | 中 | 信任 | ✅ |
| **C** IP 黑名单 + DMCA | 3-5d | **极高** | 中 | 误判 | ✅ |
| **F** fandom 字段 | 2-3d | 高 | 高 | 匿名 key | ✅ |
| **I** 同人协作轻机制 | 3-5d | 中 | 中 | 倒计时 | ✅ |
| **L** Dear Author Letter | 5-7d | 中 | 中 | 拒礼物 | 否 |
| **G** OOC 软提示 | 5-7d | **极高** | 中 | hard block | ✅ |
| **E** 卡片网格 | 5-7d | 高 | 中 | UI | 否 |
| **K** F1 §5.8 算法 | 10-14d | **极高** | 中 | 复杂度 | ✅ |

## 8.2 推荐组合（按"小到大"）

### 极小核心（3-4 天）—— 立竿见影

**V5-D + V5-M**：
- Demo IP 模板墙（中英双语 5-7 个）
- opt-out TOS + Common Crawl 屏蔽声明

### 三件套（10-12 天）—— 推荐最小本体

**V5-D + V5-M + V5-B + V5-A**：
- 极小 + AI Assistance Level 透明标签 + Worldbook Schema v2
- 这是中文+英文同人圈同时合规的**入场券**

### 五件套（18-22 天）—— 加防法律

**三件套 + V5-C + V5-F**：
- 加 IP 黑名单 + DMCA Agent + fandom 字段
- 这是 Ultraman 杭州案 ¥3 万的**法律防火墙**

### 七件套（28-35 天）—— 加世界意志

**五件套 + V5-G + V5-K**：
- 加 OOC 软提示 + F1 §5.8 算法
- 这是 user 说的"世界意志修正"的**完整实现**
- 最大杠杆，最大工作量，**需要 user 拍 7 项边界**

### 十件套（45-55 天）—— 完整 V5

**七件套 + V5-H + V5-I + V5-J + V5-E + V5-L**：
- 不建议一次做完；每个单独立项 spec

## 8.3 7 步最小执行路径（每步独立 ship + 独立验证）

1. **V5-D Demo IP 模板墙**（1-2 天，无 schema 扩）—— 立竿见影，首次体验升级
2. **V5-M opt-out TOS + 屏蔽声明**（1-2 天）—— 极低风险，外部信任锚点
3. **V5-B AI Assistance Level 透明标签 + 草稿快照**（2-3 天，需 user 拍 UI 边界）—— 中文+英文同人圈入场券
4. **V5-A Worldbook Schema v2**（3-5 天，需 user 拍 schema 边界）—— 后续所有 V5 提案的基础
5. **V5-C IP 黑名单 + DMCA Agent**（3-5 天，需 user 拍 IP 词表）—— 法律防火墙
6. **V5-G OOC 软提示**（5-7 天，需 user 拍 soft only 边界）—— "世界意志"的最便宜落地
7. **V5-K F1 §5.8 算法**（10-14 天，需 user 拍 6 算法边界）—— user 说的"世界意志修正"的完整实现

每步独立 ship + 独立验证。每步完成都能立即看到"普通爱好者 30 秒开写 + 世界意志可见"的体验差异。

---

# Part 9 · 待 user 拍板的 7 项边界

| # | 边界 | 对应 V5 | 拍完后可起 spec |
|---|---|---|---|
| 1 | **Worldbook Claim Schema v2 字段集** | V5-A | V5-A / V5-F / V5-G / V5-H / V5-K |
| 2 | **AI Assistance Level 透明 UI 边界** | V5-B | V5-B / V5-J |
| 3 | **IP 黑名单具体词表 + DMCA Agent 部署** | V5-C | V5-C |
| 4 | **fandom 字段 + 匿名 key 策略** | V5-F | V5-F |
| 5 | **OOC 软提示 soft only 边界** | V5-G | V5-G / V5-K |
| 6 | **同人协作轻机制 contest 字段边界** | V5-I | V5-I |
| 7 | **AI Beta 模拟器伦理边界** | V5-J | V5-J |
| 8 | **F1 §5.8 算法 6 边界** | V5-K | V5-K |
| 9 | **opt-out TOS 文案** | V5-M | V5-M |

拍完后：

- 拍 1 → V5-A spec
- 拍 2 → V5-B spec
- 拍 3 → V5-C spec
- 拍 4 → V5-F spec
- 拍 5 → V5-G + V5-K spec
- 拍 6 → V5-I spec
- 拍 7 → V5-J spec
- 拍 8 → V5-K spec
- 拍 9 → V5-M spec

---

# Part 10 · 主源索引

| 域 | 主源 |
|---|---|
| 中文同人深度 | 晋江衍生区 / Lofter 同人活动 / 起点轻文 / 刺猬猫 / 半次元 / 微博同人 / Lofter 朱雀检测 / 晋江反 AI 公告 / 24h 命题接力 / CP30 / CJ 漫展 |
| 英文同人深度 | AO3 / OTW / Tag Wrangling Committee / Fanlore wiki / Yuletide / Big Bang / Kink Meme / Round Robin / Beta Reader / Sensitivity Beta |
| AI 同人 + 反 AI | Sudowrite / NovelAI / AIDungeon / Hidden Door / Charstar / Character.AI / Lofter 朱雀 / 晋江六分法 / OTW AI 政策 / Bartz v Anthropic / NYT v OpenAI / Ultraman 中国案 / Tolkien v Polychron / Alfassi 2025 IJHCI |
| 世界书工具 schema | World Anvil / Kanka / LegendKeeper / Campfire Writing / Articy Draft / Novelcrafter Codex / StoryNexus / Aeon Timeline / Scabard / MythWeaver |
| 同人协作 + Beta | Word War / NaNoWriMo / Yuletide / Big Bang / Kink Meme / Round Robin / 同人 Zine / Beta Reader / Sensitivity Beta / AO3 弃坑率数据 / Elmer Studios 2025 |
| F1 §5.8 算法 | Gerrit Relation Chain / Salsa + Adapton 增量计算 / RFC 7396+6902 JSON Patch / SelfCheckGPT EMNLP 2023 / Word Track Changes / Phabricator Differential |

---

# Part 11 · 不直接做的事

- 不引入 IP 库 / IP 市场 / IP 排行（违反 novel-cross-section-mvp-decisions）
- 不做 UGC 平台（违反同上）
- 不复制阅文作家助手的发布 / 订阅 / 收藏 / 打赏（违反 F2 计划 §1.3）
- 不让 IP 守则 hard block LLM 生成（research 18 反例警示）
- 不上传 IP 原文到云端 LLM 训练（4 IP 边界 #2）
- 不站 IP 法律方一侧（守则只对作者自己声明的 character 起效）
- 不取代 F1 / F2 主路线——V5 是 F1-7 之后的下一轴，不是替代
- 不暗示训练自 AO3 / Lofter / 晋江同人（Sudowrite 反例 R1）
- 不做"AI 一键 X X 同人"模板（Character.AI 反例 R3）
- 不做承诺送礼物机制（Yuletide 60-70% 完稿率 + 10-11% 弃稿）
- 不做 5000 字硬门槛（Big Bang 70% 弃坑）
- 不做 CRDT（单作者无并发写，复杂度全付收益为零）
- 不上 LLM 自评分当硬 gate（阈值 0.5 平衡准确率 NLI 70.55）
- 不做 Word 式 Accept All 不可逆（批级撤销回执必备）
- 不接 AI 训练授权协议（阅文式永久免费授权警示）

---

**收口**: 本调研到此为止。下一步是 user 拍 Part 9 的 7 项边界，然后按 Part 8.3 的 7 步最小执行路径走。

---

# Part 12 · 前轮调研整合（v3 + v4 → v5 增量）

本节吸收前轮调研（已删除的 v3 / v4 文件）里的有用部分。v4 的 9 个提案已被 V5-A ~ V5-M 完全覆盖（v5 含 schema v2 + 算法伪代码 + 反 AI 立场 + 版权案件 + 同人伦理约束地图，是 v4 的深度+广度扩展）。v3 有 3 条独有机制 + 1 条骨架 taxonomy 未被 v5 涵盖，**全部吸收到本节**——共 3 个新提案（V5-N/O/P）+ 1 个跨提案的骨架框架。

> 注：v3 调研的 6 域（桌游 / 剧本杀 / TTRPG / 酒馆 / VN+CYOA / AID-AITown）研究源已在 V5-K F1 §5.8 算法综合中复用（特别是 Stanford Park 2023 Reflection / Pinax observer 5 类 / SelfCheckGPT NLI），引用分散在 Part 5 算法伪代码注释中，不再单列附录。

## 12.1 跨提案骨架 taxonomy：6 类机制轴

来源：v3 §3.1 机制骨架表。这是一份**框架性的分类法**，把 6 域 30+ mechanic 收敛到 6 类轴，让任何新提案都可定位：

| 骨架轴 | 含义 | V5 落点 |
|---|---|---|
| **A · Hook** | 角色背秘密入场 | V5-A coreTraits + privateHook + V5-G boundaries |
| **B · Info asymmetry** | 谁知谁不知 | V5-G OOC 软提示 + V5-K NLI 软 OOC + V5-P Modify World |
| **C · Partial success** | 动作必带代价 | V5-N Position × Effect（Risk × Gain）+ V5-O Author Currency（pin） |
| **D · Persistent state** | 不可逆积累 | V5-A unresolvedHooks + V5-H sticky_until_unit + V5-K 批级 revisionSetId |
| **E · Lens** | 视角切换 | V5-G 多视角软 OOC + V5-K multi-lens preview |
| **F · Emergent time** | 时间感涌现 | V5-I timeBox + V5-K Reflection Layer（不在 30 秒循环） |

**为什么保留这个 taxonomy**: 让后续提案落地时能定位"这条解决 6 骨架里的哪一格"，避免重复发明或漏掉空白。

---

## 12.2 V5-N · Position × Effect（方向选择矩阵）

- **来源**：v3 V3-4（TTRPG Blades Position × Effect）
- **调研来源**：Blades in the Dark (controlled / risky / desperate) × (limited / standard / great) 二维矩阵；PbtA 7-9 partial + hard move
- **钩子**：F1-2 方向 chip 不再是"紧张/温柔/文学"风格三选一，而是 **2×2 Risk × Gain 矩阵**：
  - **low risk + light gain** = 默认现状（不破坏既有作者习惯）
  - **low risk + deep gain** = **花 1 个 V5-O pin**（作者资源承担 trade-off）
  - **high risk + light gain** = Ghost 送一句"compel"——下一个在场人物主动找麻烦（V5-A FATE Aspect + Compel 联动）
  - **high risk + deep gain** = 作者承担 unmarked cost（无 pin 支出但自动触发 V5-K 批级 hook 兑现）
- **接缝**：AuthoringSceneRail 现有方向候选区重排为 4 格 grid；Kernel prompt 按 Position×Effect 调参；**不动数据模型**
- **新增字段**：sceneAnchors 选 `risk` enum（low/high）+ `gain` enum（light/deep），由用户选择自动生成
- **硬约束**：
  - 默认 low+light = 现状（防破坏既有作者习惯）
  - 升 deep 时**强制 cost 进账**（与 V5-K 批级事务联动：自动触发 hook 兑现）
  - 绝不引入 RPG 数值（违反 novel-cross-section-mvp-decisions）
- **工作量**：3 天（UI 重排 + Kernel prompt 调参）
- **风险**：UI 重新打切——避免打破既有选中动画；与 V5-I contest timeBox 联动可能让作者感到"太多 trade-off"
- **需 user 拍板**：否

---

## 12.3 V5-O · Author Currency（作者资源池 pin）

- **来源**：v3 V3-6（TTRPG Stress → Trauma + FATE Fate Point + Burning Wheel Artha）
- **调研来源**：Blades in the Dark stress/harm/trauma；FATE Core Fate Point；BW Artha
- **钩子**：作者持 **5 pin**（localStorage 持久化，与 writingTypographyStore 同级）。每次 Ghost 推演：
  - **花 1 pin** = 选 V5-N low+deep 路线；或 = 强制上一节拍的 hook 被 echo 揭示
  - **不花** = 接受 unmarked cost（与 V5-K 批级事务联动：自动 hook 兑现）
  - **5 pin 全花完** = 切到 "AI-director leads" 位面——Ghost 在 echo 里**反向主导语气**，**正文仍由作者采纳或拒绝**（不写"AI 自动写"，保留导演兼角色定位）
  - **每章自动回 1 pin**（章节收尾刷新，session refresh）
- **接缝**：新增 `authorPinStore`（与 writingTypographyStore 同层 localStorage）；Ghost hinting 加一个 peer mode；adapter 不破坏既有 freeze / revision / receipt
- **硬约束**：
  - **"AI 反向主导" 只影响 echo 语气，不影响采纳权**——为了不违反"导演兼角色"硬定位
  - pin 用尽时 echo 语气变但正文采纳权不变（**这条是为了不违反产品定位**）
  - 不引入"分数 / 好感度 / 排行榜"（违反 novel-cross-section-mvp-decisions 排除项）
- **工作量**：3 天（pin store + UI 展示 + Ghost generation 加 hinting）
- **风险**：与"导演兼角色"约束的微妙张力——主推 echo 语气而非正文主控以缓解
- **需 user 拍板**：✅（AI 反向主导是否合规 + pin 资源是否引入）

---

## 12.4 V5-P · Modify World Inline（叙述中改世界常量）

- **来源**：v3 V3-9（AID Modify World `[/set world = ...]` + minimal-relation-pack sharedAnchor）
- **调研来源**：AID `[/set world = ...]` inline world state mutation；Research 22 Ultraman 杭州案 ¥3 万警示（IP 角色训练 + 商业化 = 帮助侵权）
- **钩子**：Ghost 推演正文时，若命中"这条 setup 影响世界常量"（如"从今以后这个集市再也没来过警官"），作者采纳 Ghost 的同时被问"这条是否永久设为世界状态"。**确认 → 写入 `worldStore.inlineFacts[]`**（与 worldbook entry 同级）；后续所有 matcher 与 Kernel 都消费这条 fact。
- **接缝**：V5-A schema 已扩字段加 `worldStore.inlineFacts[]`（不是新 schema，是 worldbook 既存字段扩展）；与 minimal-relation-pack 的 `sharedAnchor` 合并；sceneAnchors 可见 "本场景已激活 inline fact X"
- **硬约束**：
  - inline fact 必须可被作者**单独撤销**（不像 V5-A permanentStamp 永久），撤销会同时回滚所有引用此 fact 的 ghost receipt
  - **不能破坏 worldbook conflict resolution**（已 lock）
  - 不通过 IP 黑名单词表触发 inline fact（V5-C 关键词不写入 inline fact）
  - 不上传 IP 原文到云端 LLM（4 IP 边界 #2）
- **工作量**：5 天
- **风险**：lore 冲突（research 22 反例），需配 conflict resolution；与 minimal-relation-pack 联动需集成 owner 拍
- **需 user 拍板**：✅（minimal-relation-pack 联动边界 + inline fact 撤销的回滚策略）

---

## 12.5 V5 完整 16 提案索引（含 V5-N/O/P）

| V5 | 名字 | 工作量 | 杠杆 | 骨架轴 | user 拍板 |
|---|---|---|---|---|---|
| A | Worldbook Claim Schema v2 | 3-5d | 高 | A/D/E | ✅ |
| B | AI Assistance Level 透明标签 | 2-3d | **极高** | F | ✅ |
| C | IP 黑名单 + DMCA Agent | 3-5d | **极高** | — | ✅ |
| D | Demo IP 模板墙 | 1-2d | 中 | — | 否 |
| E | Worldbook 卡片网格 | 5-7d | 高 | — | 否 |
| F | 同人 tag / fandom 字段 | 2-3d | 高 | A | ✅ |
| G | Pinax OOC 软提示 | 5-7d | **极高** | A/B/E | ✅ |
| H | 触发式 lore 注入 | 3-4d | 高 | D | 否 |
| I | 同人协作轻机制 | 3-5d | 中 | F | ✅ |
| J | AI Beta 模拟器 | 3-5d | 高 | — | ✅ |
| K | F1 §5.8 算法 | 10-14d | **极高** | D/F | ✅ |
| L | Yuletide Dear Author Letter | 5-7d | 中 | — | 否 |
| M | opt-out TOS + 屏蔽声明 | 1-2d | 中 | — | ✅ |
| **N** | **Position × Effect** | 3d | 高 | **C** | 否 |
| **O** | **Author Currency (pin)** | 3d | 中 | **C** | ✅ |
| **P** | **Modify World Inline** | 5d | 中 | **B** | ✅ |

**v5 共 16 提案 / 9 项 user 拍板（Part 9 原本 7 项 + V5-N 不需拍 + V5-O/V5-P 各加 1 项共 3 项）**。

---

## 12.6 v3 / v4 → v5 整合记录

| 前调研 | v5 落点 | 状态 |
|---|---|---|
| v3 §2.1 桌游叙事 6 模式 | 已融入 V5-K 算法 + Part 5 算法伪代码（引用 fca9c0d 等 commit hooks 不再单列） | ✅ |
| v3 §2.2 剧本杀 6 机制 | 任务卡 → V5-A coreTraits + privateHook；阶段揭示 → V5-G OOC 软提示；黑料卡 → V5-G Evidence Chain；私聊 → V5-G 多视角软 OOC | ✅ |
| v3 §2.3 TTRPG 5 模式 | Position × Effect → V5-N（新增）；PbtA Moves → V5-K 批级 hard move；FATE Aspect+Compel → V5-N 高风险 compel；Progress Clock → V5-K unresolvedHook ≥ 5 触发；Stress→Trauma → V5-O Author Currency | ✅ + V5-N/O |
| v3 §2.4 酒馆 8 机制 | Swipe → V5-G 多视角选择；Lorebook Sticky → V5-H；Char-Card Persona → V5-A coreTraits 5 字段；Group Chat → 已排除（8 cap 已锁） | ✅ |
| v3 §2.5 VN+CYOA 6 机制 | Reading Steiner / SHIFT → V5-G 多视角；Skill-as-Voice → V5-A character.boundaries；Time Loop → V6.x 延后；Persistent Sheet → V5-A progressions[] | ✅ |
| v3 §2.6 AID/AITown 6 机制 | Story Card Trigger → V5-H triggerKeywords；Modify World → V5-P（新增）；Risu Emotion → V6.x；Reflection Ladder → V5-K Reflection Layer；PIANO 时间窗 → V6.x；Voyager Skill Library → V5-A progressions[] | ✅ + V5-P |
| v3 §3.2 V3-1 Private Hook | V5-A schema 加 `privateHook` 字段 | ✅ |
| v3 §3.2 V3-2 Information Ledger | V5-G (Information Ledger 三档) | ✅ |
| v3 §3.2 V3-3 Evidence Chain | V5-G Evidence Chain | ✅ |
| v3 §3.2 V3-4 Position × Effect | **V5-N（新增独立提案）** | ✅ |
| v3 §3.2 V3-5 Permanent Stamp | V5-K 批级事务（unresolvedHook 自动种入） | ✅ |
| v3 §3.2 V3-6 Author Currency | **V5-O（新增独立提案）** | ✅ |
| v3 §3.2 V3-7 Reflection Ladder | V5-K Reflection Layer（observer 5 类升级 + `needs-review` 状态） | ✅ |
| v3 §3.2 V3-8 Sticky Trigger | V5-H triggerKeywords + sticky_until_unit + ttl + cooldown + use_probability | ✅ |
| v3 §3.2 V3-9 Modify World Inline | **V5-P（新增独立提案）** | ✅ |
| v3 §3.2 V3-10 Multi-Lens Snapshot | V5-G 多视角（已覆盖，无新增独立提案） | ✅ |
| v4 §3 9 提案 | 全部对应到 V5-A ~ V5-M + 反例已吸收到 V5 Part 7 | ✅ |
| v4 §4 杠杆组合 | 升级为 V5 Part 8 极小/三件/五件/七件/十件组合 | ✅ |
| v4 §5 5 项 user 拍板 | 扩展为 V5 Part 9 7 项 + Part 12.5 9 项 = 9 项 user 拍板 | ✅ |

**v3 / v4 文件已删除**——所有有用内容已在本 v5 内引用，前轮文件不再有信息差。

---

## 12.7 v3 反例与 v5 的对照

| v3 反例 | v5 落点 |
|---|---|
| Burning Wheel Beliefs 改写仪式 | V5-A coreTraits 不可变；不引入 Session Zero 仪式 |
| Daggerheart Hope/Fear 双 token | V5-O Author Currency 单 token；不引入双 token |
| ST Full-overwrite import | V5-D Demo IP 模板墙预填；不引入整卡 import |
| Her Story 录像顺序不可控 | V5-K 算法伪代码约束 determined；不故意黑箱化 |
| FATE Compel 守则被 RP framing 绕过 | V5-G OOC 软提示必须结构化可审计（linter 而非 model preference） |
| 酒馆 group chat 多角色重复 | V5-A 8 cap 已硬锁；不引入 group chat |
| SillyTavern 长 lorebook entry 污染 | V5-A sceneCandidates 9 reason code 仍生效；triggerKeywords 加 probability 上限 |

---

## 12.8 整合后的 v5 全文结构（不变 Part 1-11，新增 Part 12）

- **Part 1** 背景与转向（4 IP 边界 / V5 vs V4 差异）
- **Part 2** 6 域深研究综合（中文 / 英文 / AI+反 AI / schema / 协作 / 算法）
- **Part 3** 13 个 V5 提案（A-M）
- **Part 4** Worldbook Claim Schema v2 完整字段表
- **Part 5** F1 §5.8 算法伪代码 3 套
- **Part 6** 4 维约束地图
- **Part 7** 反例注册表 20 条
- **Part 8** 杠杆组合（极小/三件/五件/七件/十件）
- **Part 9** 7 项 user 拍板边界
- **Part 10** 主源索引
- **Part 11** 不直接做的事
- **Part 12** ⭐ 前轮调研整合（v3 + v4 → v5 增量）— 3 个新提案 V5-N/O/P + 6 类骨架 taxonomy + 整合记录
