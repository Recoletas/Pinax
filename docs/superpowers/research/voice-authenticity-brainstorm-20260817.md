# Pinax 角色声口 brainstorm — 最终交付

## 一、3 种候选方案与明确取舍

**核心问题**:在 cast block 1200 字 + worldbook writingStyle 560 字 + characterCard.description 既有解析路径的约束下,Pinax 用哪一种最小中文角色声口表示,能让 5 人场景里「老魏」(苏白市井)、「沈砚」(评书腔)、「苏慕」(网络口语) 三类声口在 3-5 轮内稳定区分?

| 维度 | **A · 仅扩 writingStyle** | **B · 新增独立 speechStyle 字段** | **C · 扩 characterCard.description + 新增 sceneRegister** ★ |
|---|---|---|---|
| 改动范围 | 只动 worldbook.style block | worldbook 1 字段 + characterCard 1 新字段 | characterCard.description 注入 4 sub-blocks + sceneRegister 新字段 |
| 角色声口覆盖 | 弱(560 字 style block 堆世界 + 角色) | 中(独立字段干净) | 强(description 4 sub-blocks + scene 切换) |
| 场景级切换 | 不支持 | 不支持 | 支持(sceneRegister 6 个 trigger) |
| 与 characterCard.js:11 兼容 | 完全兼容 | 需新增解析路径 | 复用,只追加 description |
| 取舍风险 | 措辞过载,污染其他角色 | 字段分裂,角色卡读起来割裂 | 注入路径需 docstring 标注(`<<SPEECH>>` / `<<END>>`) |

**取舍结论**:选 **方案 C**。理由:C 是唯一同时支持「角色级声口」+「场景级语域切换」的方案,且 description 注入路径复用现有 `characterCard.js:11` 解析器,改动面最小。**D(声口预设 = `voicePresetId` 枚举)** 作为 **v2 增强候选**,留待 schema 稳定后单独迭代 — v1 不引入枚举,避免 LLM 训练数据稀薄的声口名(如「苏白官话」)出现错配。

**明确拒收 register_vector(House TQA 衍生)作默认**:**RoleLLM Table 7 直接比较的是 fsd / fsp / zsp 三档,从未比较过 register_vector**。本方案拒绝 register_vector 作默认的依据是**机制推断**(Chinese modal particles / 文言白话 / 称谓 不能由几个短标签合成),不是 RoleLLM 直接证据。Pinax 若要做更强的拒收论证,需要补一组 register_vector vs fsp 的中文对照实验。

---

## 二、首版最小 schema 推荐

**总字段数 = 6 个**(落在 ≤5-7 区间):worldbook 1 个 + characterCard 4 sub-blocks + scene 1 个。

### 1. `writingStyle`(worldbook 已存在,560 字)
- **位置**:`worldbook.style` 块,**不动**
- **承载**:叙事语体、叙述节奏、比喻来源、禁忌词(世界级 / 跨角色共享)

### 2. `speechStyle` 扩展(characterCard.description 注入,复用 `characterCard.js:11` 解析路径)
- **位置**:`characterCard.description`,通过 docstring marker `<<SPEECH>>` / `<<END>>` 包裹 4 sub-blocks:

| sub-block | 字数 | 内容 |
|---|---|---|
| `<<SPEECH>>POS` 定位 | ~40 | 角色声口坐标(例:「老魏:苏州市井 + 评书中段 + 网络俚语低」) |
| `<<SPEECH>>REG` 语体 / 雅俗 / 时代 / 方言 | ~120 | 4 维度逐一标注。文言 / 口语比例;雅俗定位;时代语层(先秦/魏晋/唐宋/明清/民国/当代);方言色彩(官话/苏白/京白/粤白/陕北/沪语) |
| `<<SPEECH>>SAMPLE` 对话样本(可选) | 0/160 | 1-2 句最典型台词。无样本则 0 字 |
| `<<SPEECH>>ANTI` 反刻板清单 | ~60 | 硬数值锚点 + 触发器(对仗 ≤2 连句、评书套语 ≤1/段、苏白必现、三字顿 ≥1/段) |
| **小计** | **220-380 字** | |

### 3. `sceneRegister`(新增,可选)
- **位置**:`scene.metadata.register`,scene 级,挂在 scene 对象上
- **内容**:当前场景语域 + 文白切换 trigger
- **≤200 字,可空**
- **6 个 trigger → register 对应**(代码切换,非随机混合):
  - 怒斥 → 全文言 + 短句
  - 致敬 → 文言 + 三字顿
  - 公堂 → 文言 + 称谓矩阵 classical_respectful 档
  - 私下 → 口语 + intimate_egalitarian 档
  - 吟诗 → 七字句 + 押韵
  - 称呼长辈 → 文言 + distancing 档

### 字符预算与 cast block 边界

| 元素 | 路径 | 字节上限 |
|---|---|---|
| `cast` block | id / name / status / role 等非角色化元数据 | 1200 |
| `writingStyle` | style 块 | 560 |
| `speechStyle` 4 sub-blocks | characterCard.description(复用解析器) | 220-380 |
| `sceneRegister` | scene.metadata.register(新字段) | 200 |

**cast block 不放声口**;声口通过 description 与 scene metadata 注入,避开 1200 字 cap。

### 称谓矩阵(speechStyle.ADDR 必填,三档封闭枚举)
- `classical_respectful = ["足下", "阁下", "仁兄", "兄台", "先生"]`
- `intimate_egalitarian = ["老弟", "老哥", "兄弟", "侬", "阿拉"]`
- `distancing = ["你", "您", "你这厮"]`
- 选择规则由 sceneRegister 6 个 trigger 决定(怒斥 → distancing;致敬 → classical_respectful;私下 → intimate_egalitarian)。

### 语气词分层(REG 必填,绝不坍缩为单字段)
- **文言层**:罢 / 哉 / 嗟 / 乎 / 矣 / 焉
- **口语层**:嗳 / 啊 / 嘛 / 呀 / 哎 / 嗨
- **功能层**:mitigation=["罢","啊"];obvious=["嘛"];exclam=["哉"]
- 老魏类 1948 苏州角色以文言层 + 口语层为主,严禁现代嘛/呀/啦 占语气词 ≥20%。

### 节奏单位(REG 必填)
必须落到具体顿字计数:「三字顿为主,偶有七字句收束,罕用长复句」。短句描述无效。

### 反刻板清单(ANTI 必填)
强制锚点,所有强风格角色必须填:
- 对仗不超过连续 2 句
- 评书套语每段 ≤1 次
- 苏白不可缺
- 三字顿每段 ≥1 个
- 老魏类必须硬数值:苏白 ≥40%,评书套语 ≤20%

---

## 三、同一角色在三种方案下的中文 prompt 示例

**重要前提**:本节只展示 **输入差异**(LLM 收到的 prompt 块)。三种方案的 **输出差异**(老魏实际说什么)**在 mini-eval 跑完前不做断言**——v1 测试前的所有「输出示例」都疑似自证。**真正决定 A/B/C 取舍的 mini-eval 必须先跑**:对老魏 15 代(~30 分钟,1 base model,0.7 temperature),盲评人独立打分,看哪种 prompt 块让苏白比例稳定落在 30-50% 区间。

**角色**:老魏,40 岁,苏州河边旧书摊主,讲义气。说话带「阿拉」「覅讲」等苏白,偶尔夹评书套语(如「列位看官」),不文不白。

### 方案 A · 仅扩 writingStyle

```text
[worldbook.style]   ← 老魏专属追加
1. 节奏偏好:三字顿与七字句交替
2. 苏白比例:30-50%,严禁超 60% 或低于 20%
3. 评书套语:允许「列位看官」「且听分晓」,每段不超过 1 次
4. 称谓:平辈「侬」「伊」;晚辈「小囡」;官面「先生」
5. 禁忌:不出现「孤」「寡人」「在下」等文言自称
```

### 方案 B · 独立 speechStyle 字段

```text
[worldbook.style]   ← 同 A 的 1-5 条

[characterCard.speechStyle]   ← 新字段
定位:苏州市井 + 评书中段 + 网络俚语低
语体:文言≤10% / 口语≥70% / 功能词(嘛/咧/咯)≈20%
雅俗:偏俗,「讲义气」类词上一档
时代:民国-当代过渡语层
方言:苏白≥40%,「覅」「阿拉」「邪气」三词必现
样本台词:"覅讲,阿拉苏州人做事,讲究一个'稳'字。"
称谓矩阵:同辈→「侬/兄弟」;晚辈→「小囡」;长辈/官面→「老先生/先生」
反刻板:对仗≤2连句 | 评书套语≤1/段 | 苏白必现 | 三字顿≥1/段
```

### 方案 C · description 注入 + sceneRegister ★

```text
[worldbook.style]   ← 只放通用规则,角色专属声口全部下沉到 description

[characterCard.description]
<<SPEECH>>
POS|苏州市井 + 评书中段 + 网络俚语低
REG|文言≤10% / 口语≥70% / 功能词≈20% | 偏俗 | 民国-当代过渡 | 苏白≥40%
SAMPLE|"覅讲,阿拉苏州人做事,讲究一个'稳'字。"
ADDR|同辈→「侬/兄弟」;晚辈→「小囡」;长辈/官面→「老先生/先生」(不卑)
ANTI|对仗≤2连句 | 评书套语≤1/段 | 苏白必现 | 三字顿≥1/段
<<END>>

[scene.metadata.register]   ← 新字段,本场景=私下
私下:口语 + intimate_egalitarian + 短句 + 苏白可加重至 50%
触发器:怒斥→全文言短句;致敬→文言三字顿;公堂→文言 distancing;吟诗→七字押韵
```

**输入层面观察**(输出留待 mini-eval):
- 方案 A 把声口压进 560 字 style block,与世界书其他规则竞争预算,易污染其他角色
- 方案 B 独立字段干净,但缺场景级切换
- 方案 C 同时拿到角色级 + 场景级粒度,且不挤占 style block

**mini-eval 必跑前置**:对老魏跑 15 代(3 prompt × 5 sample × 1 base model = 15 次生成),0.7 temperature,3 raters 独立打分,看哪种 prompt 让苏白比例稳定 30-50%。**未跑 mini-eval 之前,A/B/C 不可定优劣**。

---

## 四、能推翻推荐方案的失败条件

9 条,每条必须 ≤5% 显著水平 + 可观察 + 可设计测试。任一条失败 → 推翻方案 C,回退到 B 或 A。

| # | 失败条件 | 观察指标 | 显著性阈值 | 测试设计 |
|---|---|---|---|---|
| **F1** | 苏白比例未稳定在 30-50% | per-turn 苏白 token / 总 token | 双向对比 vs zsp baseline,**p<0.05** | 老魏 30 轮自动词频统计 |
| **F2** | 评书套语过载(每段 >1 次) | 套语计数 | zsp baseline 上限 + 0.5 次/段,**p<0.05** | 30 段自动扫描 |
| **F3** | 文体属性集合漂移:4 维度 `{sentence_length, lexical_pool, formality, taboo}` 任一不稳定 | 4 维向量 per generation | L2 距离 vs 目标向量,**p<0.05** | 15 代每代 4 维向量比对 |
| **F4** | 三角色声口重叠率过高 | 老魏/沈砚/苏慕 pairwise 余弦 | 显著低于 20% 随机 baseline,**p<0.05** | 30 轮 × 3 角色嵌入相似度 |
| **F5** | 角色间苏白比例混淆 | 跨角色苏白率差 | 老魏 vs 沈砚 苏白率差 ≥30pp,**p<0.05** | per-role 苏白率对比 |
| **F6** | 声口在不同 scene 间无切换(voice bleed) | sceneRegister 触发后属性未变 | 切换后 4 维向量变化 ≥1σ,**p<0.05** | scene 切换前/后嵌入差 |
| **F7** | 3-5 轮短回合后声口衰减 | 第 N 轮 vs 第 1 轮漂移 | 漂移 <5%,**p<0.05** | 5 轮 mini-conversation |
| **F8** | 注入 token 成本超预算 | 单轮额外 token | <60 tokens(对应 220-380 字字段) | cost log |
| **F9** | 反刻板清单(ANTI block)未生效 | 对仗过密 / 评书过载出现率 | <5% null,**p<0.05** | 30 段自动规则扫描 |

**rater-facing 操作化**(每条 F 都适用):
- 「两两一致性 ≥ 67%」=「3 位评分者独立判断,任意 2 位答案一致」
- 「p<0.05」=「在 30 样本中至少 18 样本偏向同一答案」
- 「Cohen's d ≥ 0.4」=「hybrid 比 baseline 在主指标上多赢 ≥ 12 样本/30」

**任一条失败 → 推翻方案 C**。F1-F4 在 mini-eval 中验证;F5-F9 在 §五盲测中验证。

---

## 五、20-30 样本低成本盲测设计

### 1. 刺激网格(stimulus grid)

| 角色 | 场景压力 | turn 位置 | 变体 |
|---|---|---|---|
| 老魏(苏白) | 低(私下) | 早(turn 1-3) | A |
| 老魏 | 高(失踪案) | 晚(turn 4-6) | B |
| 沈砚(评书腔) | 低 | 早 | C |
| 沈砚 | 高 | 晚 | A |
| 苏慕(网络口语) | 低 | 早 | C |
| 苏慕 | 高 | 晚 | B |

**3 角色 × 2 场景 × 2 turn × 2 变体 = 24 + 6 control = 30 样本**。Latin-square:每 rater 见每变体次数相同;turn 位置早/晚平衡(防顺序效应)。

### 2. Cross-voice swap 控制(关键)
取 5 个样本,**故意把角色 A 的 voice fields 错配到角色 B 的对白**(情节不变)。若评分者把该条仍判给情节应有角色而非 voice 源角色 → voice 质量与 voice 归属可分离,方案 C 走通。反之 → voice fields 把情节和 voice 写成同一件事 → 回退。

### 3. Rater 协议
- **3 raters / 样本**(Krippendorff α ≥ 0.667;3 人允许 majority vote)
- **背景**:18-40 岁中文母语,大专以上,读过 ≥1 年原创小说 / 网文 / 评书材料
- **筛选题**:列 3-4 部近期读过的中文小说 / 网文,写出 ≥1 部;空泛者筛掉
- **平台**:Credamo 见数(2.8M+ 面板,支持 IP 限制 + 注意力测试)
- **时间**:每样本 ~3.5 分钟(阅读 30s + 4 维评分 90s + NEM 8 题 90s)= 单 rater 90 分钟 / 3 raters 4.5h
- **报酬**:~¥25-40 / rater × 3 = **¥100-120 / session**

### 4. Score 设计

| 维度 | 操作化 | 来源 |
|---|---|---|
| **主指标:角色归属辨认率** | forced-choice 5 选 1(含「通用 LLM」诱惑项) | CharacterEval Persona-Utterance + inCharacter |
| 次指标:声音一致性 | Likert 1-5(pairwise 跨 turn) | CharacterEval PU/KE/KA |
| 次指标:场景适配 | Likert 1-5(角色 vs 场景压力匹配) | INFERENCE |
| 次指标:自然度 | Likert 1-5 + 黄金人写 / 明显 LLM 痕迹对照 | 社区 SOP |
| 探针:沉浸感 | Appel 2015 8 题简表(4 维 NEM) | Busselle & Bilandzic 2009 |

**NEM 跨文化警示**:NEM 出自英语研究文献,迁移中文母语评分需 Brislin 1970 回译法 + 文化等价性校验。**本轮作为待解开放问题,不在 v1 盲测中默认采用**。

### 5. 8 个效度威胁 + 缓解

| # | 威胁 | 缓解 |
|---|---|---|
| F1 | 角色混淆非声音问题 | 筛选题 + 角色理解前测 |
| F2 | 声音 vs 情节混淆 | cross-voice swap + 同情节不同 voice 反例 |
| F3 | cue leakage(raters 看到角色名) | 人为去掉说话前缀 |
| F4 | 长会话衰减测不出 | turn 位置前 1/3 + 后 1/3 反序 |
| F5 | 多角色场景未真测 | 5 人场景样本 + cross-voice swap |
| F6 | rater cohort 异质性 | 子样本分析 + IRR 监控 |
| F7 | LLM-as-judge 漂移 | 严格 human-only |
| F8 | 生成时点效应 | 每变体固定种子 + 同日生成 |

### 6. Null 假设与样本量
- **H₀**:hybrid(C)与 A 在主指标上无显著差异
- **拒绝 H₀**:p<0.05(双尾)+ Cohen's d ≥ 0.4
- **样本量**:30 × 3 raters = 90 评分;每格 ~3 评分 → 主指标统计功效 ~0.55(中等效应),**仅作 v1 决策证据;v2 升级到 60 样本达 0.80 功效**

---

## 六、证据分级

| # | 主张 | 等级 | 来源 |
|---|---|---|---|
| 1 | Few-shot dialogue (fsd) 在中文角色扮演中显著优于 few-shot prompt (fsp) 与 zero-shot (zsp) | [PAPER] | RoleLLM Wang et al. 2023, arXiv:2310.00746, Table 7(RoleBench-specific-zh 子集) |
| 2 | 中文人设对话具身性需多轮上下文(≥10 turns 才有稳定信号) | [PAPER] | CharacterEval Tu et al. 2024, arXiv:2401.01275(1,785 dialogues / 77 chars / 12 annotators) |
| 3 | 仅靠自然语言 persona 描述不足以稳定 persona 行为 | [PAPER] | Anthropic Persona Vectors 2025, arXiv:2507.21509 |
| 4 | SillyTavern V2 spec 采用「结构化 header + 对话样例」混合模式 | [PRACTICE] | SillyTavern Character Card V2 spec, https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md |
| 5 | 三层优先级堆叠(worldbook 全局 + scene 场景级 + character 个人),窄属性层胜 | [INFERENCE] | 综合自 Burning Wheel BIT / Disco Elysium skill-as-modulator / BG3 narrator+companion layering(均为 PRACTICE 锚点) |
| 6 | Chinese modal particles / 文言白话 / 称谓 是强文化形态,必须由样例承载 | [INFERENCE] | 机制推断自 R1 中文声口学 + R2 中文子集实验。⚠️ R2 数据基于公版文学角色(鲁迅/金庸/三国),**1948 苏州方言场景有效性未直接验证** |
| 7 | House TQA `register_vector` 不优于 few-shot 样例 | [INFERENCE] | **R2 未直接对比 register_vector vs fsp**;拒收依据是机制推断,不是直接实验证据 |
| 8 | NEM(叙事沉浸感)可由 Appel 2015 8 题简表测量 | [PAPER] | Appel et al. 2015 short form;迁移中文需 Brislin 1970 回译法 + 文化等价性验证 |
| 9 | Krippendorff α ≥ 0.667 是 Likert 序数数据可接受 IRR 阈值 | [PRACTICE] | Krippendorff 2004 Content Analysis 标准 |
| 10 | Credamo 见数 30 样本 × 3 rater × 4.5h ≈ ¥100-120 | [PRACTICE] | Credamo 国内学术问卷定价惯例(中央财经大学 2021 通知 + 知乎 2024 帖子) |
| 11 | Pinax cast block 1200 字,writingStyle 实际 600 字(扣 40 字 fingerprint 头) | [PRACTICE] | narrativeKernel.js BLOCK_LIMITS(ground truth) |
| 12 | `speechStyle` 已由 characterCard.js:11 解析进 `description` 字段尾部 | [PRACTICE] | characterCard.js 现有解析路径 |
| 13 | `voiceSeed` 末尾标记在 `makeBlock` 整块截断下落不到 LLM 眼前 | [PRACTICE] | narrativeKernel.js `makeBlock` 截断语义 |
| 14 | `presenceSeed` 在 narrativeKernel 没有注入点 | [PRACTICE] | narrativeKernel.js:213-223 非 speaker 角色仅 `{id,name,status,role}` |
| 15 | cross-voice swap 是 voice attribution 心理学文献规范对照 | [PAPER] | voice identification 心理学文献传统(Kircher et al.) |
| 16 | 中文语气词分文言层 / 口语层 / 功能层,不可坍缩为 filler_words | [INFERENCE] | 齐沪扬《语气词研究》+ 巴赫金 狂欢化理论 + 中国语法学传统 |
| 17 | 文白切换由显式 trigger 驱动而非随机混合 | [PRACTICE] | 中文 code-switching 文学传统(话本 / 拟话本 / 评弹) |
| 18 | 老魏会被 LLM 滑回单田芳衍生刻板 | [INFERENCE] | 评书套语高格式化 + LLM 训练数据中「评书」泛化收敛 |
| 19 | 比喻来源作为 v1 不可建模特征 | [INFERENCE] | R1 中文声口学 + 比喻来源域枚举需预设大量元数据,>300 字字段不可行 |

---

## 开放问题(诚实声明,不进 v1)

1. **mini-eval 时序**:从评测预算 ~30 分钟起,选定 A/B/C 后再进入正式盲测;**不得跳步**。
2. **比喻来源**:人物典型比喻(如老魏惯用什么作喻)未进 v1 schema;研究阶段。
3. **NEM 中文迁移**:Brislin 1970 回译法 + 文化等价性校验需独立小实验。
4. **anti-刻板化**:老魏会被 LLM 滑回单田芳衍生;F9 阈值已覆盖,但需在 prompt 中以反例方式写入(参见方案 C 的 ANTI 字段)。
5. **跨场景复用**:本轮范围只覆盖 1948 苏州场景;romance / 都市轻喜剧迁移性留待 v2。
6. **House TQA 拒收的诚实声明**:本方案拒绝 `register_vector` 作默认的依据是**机制推断**,不是直接实验证据。Pinax 若要做更强的拒收论证,需补一组 register_vector vs fsp 中文对照实验。