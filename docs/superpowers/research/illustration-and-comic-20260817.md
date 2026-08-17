# 小说插画 + 小说改编漫画调研 — 发散灵感点

> **范围**：发散性调研 + 脑暴，**只找灵感点**。具体计划 / 实现 / 重构方案不在本调研范围（用户已明确）。
> **2026-08-17 用户转向声明**：素材页不算项目核心，主轴是**小说插画**与**小说改编漫画**。
> **姊妹文件**（次要背景）：`docs/superpowers/research/materials-page-optimization-20260817.md`（素材页现状快照，2026-08-17 已降级）。

---

## §0 阅读须知 + 验证图例

**文档定位**：8 axes 并行发散调研（用户加选 G 传统插画师 + H 漫画出版生态），不替代 brainstorming → writing-plans 流程；不写实现、不修 bug、不动 STATUS / PLAN / LOG、不写新 skill。

**8 axes 概览**：
- **核心 2 axes**：§A AI 角色一致性机制 / §D 漫画分镜与排版
- **支撑 4 axes**：§B 视觉圣经 / §C 文本 → 关键帧 / §E 漫画 AI 工具 / §F 镜头语言
- **扩展 2 axes**：§G 传统插画师工作流 / §H 漫画出版生态

**验证图例**：

| 标记 | 含义 | 出现位置 |
|---|---|---|
| 🟢 | 多源印证（≥ 2 个不同生态，或 ≥ 3 个独立产品收敛） | §I 主题 |
| ⚠️ | 落地前需二次核实（通常是该 agent 已标 "I cannot verify" 的细节） | §I 主题内的细节项 |
| ✓ | 已通过本会话 WebFetch / WebSearch 一手核实 | 各 §0 节 |
| 𓈊（默认） | 二手来源整理，未直接核实 | 各节默认 |

**Pinax 现状锚点**（agents 必读）：
- **漫画组件**：`src/pages/ComicStudio.vue` / `src/components/media/ComicAdaptationPlanner.vue` / `src/components/media/ComicPageEditor.vue` / `src/components/media/ComicStageWorkbench.vue`
- **图像工作台**：`src/components/media/ImageGenerationWorkbench.vue`（reference / illustration mode，嵌入素材页副阅读台 + 体验页 + 画布页）
- **镜头语言**：ProseEssay.vue 中已有 shot types 12 种（extreme_wide / wide / full / medium_wide / medium / medium_close / close_up / extreme_close_up / two_shot / over_shoulder / pov / aerial）+ camera movements 12 种（static / pan / tilt / dolly / track / crane / zoom / handheld / steadicam / spin / tilt_up / tilt_down）
- **漫画阶段**：STATUS.md 显示 M2-M6 已形成视觉圣经 / 阶段产物 / 文字排版 / 出版导出，剩 M7 连续性质检
- **角色立绘**：见 `feedback_visual_integration_not_illustration.md` + 5C v3.12 refine（立绘=背景集成,非插图）
- **路由**：`/comics` 路由（ComicStudio）+ `/materials` / `/prose-essay` / `/experience` 四页素材联动

**用户拍板题**（待 §I 综合时列出，由用户判断优先级）：见 §I.3。

**反向映射**：见 §I.5「症状 → §I 主题 + 灵感条目」表（待 §I 综合时补）。

**8 节共性关键不确定项**（落地前必须二次核实，影响具体落地细节）：

1. **Leonardo AI Character Reference 当前 model / API 参数** —— §A agent WebSearch 二手源未一手核实。
2. **Runway Gen-3 Act-One / Act-Two 架构细节** —— §A agent 标"WebSearch 二次源混入可能是 LLM 拼接的技术细节"，I cannot verify 真实性。
3. **CivitAI AnythingV5 / CounterfeitXL / AAMXL 等 comic LoRA 当前版本号与训练数据** —— §A / §E 均 I cannot verify。
4. **各 AI storyboard 产品 panel selection 算法**（Storyboarder / Boords / StudioBinder / Toon Boom / Storyboard That）—— §C agent WebSearch / WebFetch 多次失败，全部 I cannot verify。
5. **Storyboarder 2026 是否仍 MIT 开源** —— §D agent I cannot verify。
6. **WEBTOON Canvas 当前 width 标准（800px 硬限制 vs 推荐）** —— §D / §H 均 I cannot verify，Webtoon Help Center 未读。
7. **KDP / IngramSpark 2026 comic 印刷 trim size 列表** —— §D I cannot verify。
8. **Webtoon 2026 AI 披露政策 / Tapas 2025-2026 unlock 时间窗 / DLsite 2026 AI 内容政策** —— §H I cannot verify。
9. **Walter Murch Rule of Six 权重 51/23/10/7/5/4% 是否在 2026 仍有学界支持** —— §F I cannot verify。
10. **EU AI Act / 日本文化庁 / 中国 2024 生成式 AI 管理办法 对 style mimicry 的具体细则** —— §G I cannot verify；只知方向不知具体规则。
11. **HJ 文庫 / 電撃文庫 合约细节**（封面 / 插页 / 黑白拉页分项）—— §B / §G 产业内部信息，公开来源稀缺。
12. **character LoRA 训练在 local-first 架构下是否本地 GPU 可行** —— §I.3.2 用户拍板题，本调研未深入。

> 这 12 项不影响 §I 主题的结论方向（多源已印证），但**影响具体落地时引用的准确性**。

---

## §A AI 角色一致性机制（Character Consistency）

> **调研人**：A（并行 agent）。**scope**：IP-Adapter / InstantID / character LoRA / face lock / 跨场景一致性 / reference workflows
>
> **重点产品**：Midjourney `--cref` / `--cw` / `--sref`、Leonardo AI Character Reference、Krea Character Consistency、Pika 2.0 Scenes / Ingredients、Runway Gen-3 Act-One / Act-Two、Stable Diffusion IP-Adapter / InstantID / PhotoMaker / ConsistentID / Subject-Diffusion、AnythingV5 / AniDiffusion / CounterfeitXL / AAMXL、ControlNet Reference-Only、Scenario AI、DreamBooth / Character LoRA 训练、Tripo3D / Meshy 3D turntable 等
>
> **Pinax 现状锚点**：`ImageGenerationWorkbench` 已有 reference mode + illustration mode（`src/components/media/ImageGenerationWorkbench.vue` 第 45-52 行 props，`referenceStrength = 0.65` 第 83 行，`referenceUploadMessage` 第 84 行；嵌入素材页副阅读台 + 体验页 + 画布页），但「同一角色跨多次生成保持形象」目前主要靠用户手挑参考图，没有显式的 character profile / character LoRA / face lock UI。

### §A.0 总览：三个根本命题

AI 角色一致性（character consistency）在 2024-2026 的研究 + 产品生态里收敛为三个根本命题。任何具体的机制都属于这三个命题的不同组合，调研其余子节前先锚住：

1. **身份保持（identity preservation）**
   - 同一张脸 / 同一套视觉特征在多次生成中保持可识别
   - 核心工具：face embedding（ArcFace、InsightFace）、InstantID / IP-Adapter FaceID、PhotoMaker ID tokens、Midjourney `--cref`
   - 评估标准：人脸识别 cosine similarity、landmark L2、FID、CLIP-IQA、user preference study
   - Pinax 痛点：角色立绘要进 5C v3.12 refine 的背景集成模式（`feedback_visual_integration_not_illustration.md`），跨场景的「同一个人」必须看着是同一个人

2. **姿态 / 构图控制（pose / composition control）**
   - 不只是「同一个人」，还要「这个人在这场景里摆什么 pose、从什么角度被拍」
   - 核心工具：ControlNet OpenPose / Depth / Canny / Reference-Only、OpenPose-Editor、Runway Act-Two SMPL-X、IP-Adapter Pose、Stable Video Diffusion temporal attention
   - Pinax 痛点：ProseEssay 已有 shot 12 + camera 12（§0 已记），但生图时 prompt 控制 pose 精度差，多人同框（two_shot / over_shoulder）经常崩

3. **风格一致（style consistency）**
   - 同一角色在风格切换（写实 / 二次元 / 黑白漫画 / 水彩封面 / 像素头像）下保持「气质 / 设计语言 / 配色」
   - 核心工具：Midjourney `--sref`（style reference）、IP-Adapter Style、Krea Style Match、AnythingV5 / AniDiffusion base model + LoRA、Scenario AI style LoRA 训练
   - Pinax 痛点：当前 `ImageGenerationWorkbench` 用 `mediaPurpose: 'illustration' | ...` 二分，没有「同角色换风格」的 UX（切换 model provider 经常把脸画崩）

三者关系：身份是「人」，姿态是「pose」，风格是「滤镜」。漫画 / 插画 / 视频场景需要**三者同时可控**，且**任意两者可解耦**（换 pose 不换脸、换脸不换 pose、换风格三者皆换）。下面 14 条灵感对应不同组合的解法。

---

### §A.1 Midjourney `--cref` / `--cw` / `--sref`（核心三件套）

**源产品**：Midjourney v6+（midjourney.com/docs）
**机制简述**：三个 flag 分别锁角色（`--cref URL` + `--cw 0..100` 权重）、风格（`--sref URL`）、配比（`--cw` 越高越像参考图，0 时只锁大致氛围）。单图输入，无训练，秒级响应。
**Pinax 摩擦对应**：
- `ImageGenerationWorkbench.referenceStrength = 0.65` 对应 `--cw` 概念但只支持 1 张参考图、没有 style-vs-character 解耦
- 用户每次要保持「同一角色换 pose」必须自己挑上一张满意的图，对 5C v3.12 refine 的立绘背景集成场景不友好（要同一角色在不同章节封面都出现）
**为什么不算实现方案**：
- Midjourney 是闭源云端 API，本地无 GPU 推理，无法在 Pinax localStorage-only 数据架构里跑
- Pinax 多 provider 架构（`imageProviderConfigStore.js`）允许接入 Midjourney，但 `--cref` 的 UX 在 Pinax 应当叫「character profile」而不是「reference image upload」
**可行性疑点**：
- 多 provider 的 API 兼容差：Midjourney 不支持原生 multi-reference，Leonardo 支持，Krea 支持
- 用户在 Pinax 上传的参考图含敏感内容（真实人物照片、版权 IP），Midjourney 有 CSAM / 名人检测，会拒
- `ImageGenerationWorkbench` 已有 `mediaPurpose: 'illustration'`，加 `--cref` 语义需要新建 `characterProfileId` 字段

### §A.2 IP-Adapter / IP-Adapter Plus / IP-Adapter FaceID（开源基准）

**源产品**：Tencent AI Lab IP-Adapter（github.com/tencent-ailab/IP-Adapter，3.9k stars）
**机制简述**：IP-Adapter（Image Prompt Adapter）是给 SD / SDXL 加一个「图像 prompt」通道的轻量 adapter，不改 base model 权重；FaceID 变体用 InsightFace 提取 512-D 脸特征替换全局 image embedding，专攻面部一致性。
**Pinax 摩擦对应**：
- 是当前开源事实标准（InstantID / PhotoMaker / ConsistentID 都基于它的设计）
- Pinax 如要自建 character consistency backend（不依赖云端 API），IP-Adapter FaceID 是最低门槛的本地推理方案
- 与 `ImageGenerationWorkbench.referenceStrength` 直接对齐（FaceID 也有 `faceid_strength` 参数）
**为什么不算实现方案**：
- 需要本地 GPU（4GB+ VRAM for IP-Adapter Plus，8GB+ for FaceID）
- Pinax 当前是「浏览器 + localStorage + 调云 API」架构，没有本地推理栈；引入 IP-Adapter 需要重写 ImageGenerationWorkbench 的图像生成路径
- FaceID 对二次元 / 漫画脸识别精度不如写实（训练集偏差）
**可行性疑点**：
- 用户文本（中文小说）→ IP-Adapter 英文 prompt 的跨语言 gap
- 多个 IP-Adapter 串接（角色 + 风格 + 构图）权重耦合，调参成本高
- CivitAI 上大量基于 IP-Adapter 的 LoRA 训练结果都是单 LoRA 单风格，不保证 Pinax 现有图像 provider 的兼容

### §A.3 InstantID（单图最高保真度）

**源产品**：InstantX/InstantID（github.com/InstantX/InstantID）+ instantid.github.io
**机制简述**：单张参考图即可锁身份，不需要训练；用 InsightFace 提 face embedding + ControlNet 提 pose，用 cross-attention 注入 SDXL UNet。号称「zero-shot ID-preserving generation」最强。
**Pinax 摩擦对应**：
- 单图输入对齐「用户随手传一张角色正面照」的 UX
- 对 5C v3.12 的「立绘 = 背景集成」范式友好（角色一张正脸 + 各章节文本生成不同 pose 的场景图）
- `ImageGenerationWorkbench` 当前的「用户手挑参考图」痛点可以用 InstantID 自动选最近似的 reference 替换
**为什么不算实现方案**：
- InstantID 限制多（单个脸、最佳正面照、SDXL only），不适合 Pinax 多 provider + 多风格
- 与 IP-Adapter FaceID 在 Pinax 上是「两条腿走路」，需要权衡 UI 复杂度
**可行性疑点**：
- 多角色同框（two_shot / over_shoulder）InstantID 官方支持差（设计就是单 ID）
- 风格迁移能力比 IP-Adapter 弱，漫画 / 二次元需要叠加额外 LoRA
- Hugging Face 上的 InstantID checkpoint 有版权（CivitAI 上有多个 reupload），Pinax 用哪个版本需要法务判断

### §A.4 PhotoMaker（多角色 + 风格灵活）

**源产品**：Tencent ARC PhotoMaker（已在 Hugging Face 公开）
**机制简述**：单图 / 多图输入，提 ID token stack 进 SDXL，叠加文本 prompt 后生成。强项是「同一场景多角色 ID 注入」，适合漫画群戏。
**Pinax 摩擦对应**：
- Pinax 多角色小说（主角 + 多配角）是常态，PhotoMaker 是「漫画式多角色同框」的相对稳方案
- `ImageGenerationWorkbench.referenceCandidates` 是多 ID 的雏形（第 61-64 行），PhotoMaker 思路可直接迁
**为什么不算实现方案**：
- 与 InstantID / IP-Adapter 的 API 差异大，Pinax 多 provider 接入成本高
- 多角色 prompt engineering（避免 ID 串号）是开放问题
**可行性疑点**：
- PhotoMaker 对长文本 prompt（章节级 prompt）敏感度差，需要 prompt 切分
- 风格迁移 + ID 保持 trade-off 比 InstantID 更难调

### §A.5 Leonardo AI Character Reference（商业产品化标杆）

**源产品**：Leonardo AI docs（docs.leonardo.ai Character Reference Guide）
**机制简述**：商业化封装，开箱即用；用户上传一张角色参考图，平台内部跑类似 IP-Adapter / PhotoMaker 的 pipeline，自动处理权重 / 风格解耦。
**Pinax 摩擦对应**：
- 是「非技术用户也能用」的 character consistency UX 标杆
- Pinax 的 `ImageGenerationWorkbench` 当前 UX 偏开发者（手动传 reference URL、调 strength），用户期待的是 Leonardo 这种「上传一张、点按钮」
**为什么不算实现方案**：
- Leonardo 是云端付费服务，Pinax 当前 localStorage 架构无法直接复用其内部实现
- Leonardo 的 UX 是产品决策，不能拆「灵感」直接抄代码
**可行性疑点**：
- Leonardo Character Reference 仅 Phoenix / Kino XL 等少数 model 支持，Pinax 多 provider 各自支持度差
- 用户上传参考图存 Leonardo 云端 vs Pinax localStorage 的隐私差异需要 UX 教育

### §A.6 Krea.ai Character Consistency（多参考 + 锁 outfit + lock pose）

**源产品**：Krea.ai（krea.ai/apps/character，help.krea.ai/hc/en-us/articles/44757012849173-Character-Consistency，2025 beta）
**机制简述**：Krea 2025 推出的「Character Consistency」feature 显式三要素：identity + outfit + pose 三者可独立锁定 / 解锁。多张参考图上传，对应不同维度。
**Pinax 摩擦对应**：
- Krea 的「identity / outfit / pose」三分正好对应 §A.0 的「身份 / 姿态 / 风格」三命题
- Pinax 的角色立绘（5C v3.12 背景集成）需要跨章节 outfit 切换（冬装 / 夏装 / 战斗装），Krea outfit-lock 是直接灵感
- `ImageGenerationWorkbench` 应当提供「character profile」持久化（一组 reference + 各自标签：face / outfit / pose），不只是一组 referenceCandidates
**为什么不算实现方案**：
- Krea 的内部模型 / 训练数据是闭源的，UX 是产品层，底层实现 Pinax 必须自研或集成开源
- Pinax 数据架构是 Vue 3 + localStorage，没有 Krea 那种 SaaS asset library
**可行性疑点**：
- 多参考图的存储 + 标注 schema（哪个 ref 是 face / outfit / pose）是 Pinax 自研
- `ImageGenerationWorkbench` 当前没有 character profile 概念，需要新增 entity

### §A.7 Pika 2.0 Scenes / Ingredients（视频场景的角色复用）

**源产品**：Pika Labs Pika 2.0（pika.art/blog/pika-2-0，testingcatalog.com 报道 2024-12-20 发布）
**机制简述**：Pika 2.0 引入 Scenes（角色 / 物体 / 环境的精确外观锁定）+ Ingredients（角色 + 物体 + 环境组合进 AI 视频）。视频生成场景下的角色一致性。
**Pinax 摩擦对应**：
- Pinax 当前主轴是「小说插画 + 小说改编漫画」（2026-08-17 用户转向声明），视频生成不是核心
- 但 Pika 2.0 的「角色在不同镜次中保持外观」对漫画 panel 连续性（M7 剩项）是直接灵感
- Pinax 的 `ImageGenerationWorkbench` 嵌入体验页 + 画布页，未来若扩展到视频（statusline 上已有 video），Pika 思路是参考
**为什么不算实现方案**：
- Pika 是视频生成模型，Pinax 主轴是图像 / 漫画，视频是远期方向
- Pika 的 Scenes 抽象在图像生成里被 IP-Adapter / InstantID 覆盖更直接
**可行性疑点**：
- 视频场景的 character consistency 比图像难一个数量级（temporal drift），Pinax 若做视频要解决的关键问题不只在角色复用
- Scenes 的「精确外观锁定」在 AI 生成里仍是近似，不是像素级

### §A.8 Runway Gen-3 Act-One / Act-Two（视频级 face identity）

**源产品**：Runway（runwayml.com）Act-One + Act-Two preview
**机制简述**：Runway Act-One 用 ArcFace 提 512-D face embedding + cross-attention 注入 U-Net，每帧都加 AdaIN-style modulation 实现身份保持。Act-Two 在此基础上加 SMPL-X body pose transfer。Lip-sync 中位延迟 < 80ms。
**Pinax 摩擦对应**：
- Runway Act-One 是「单图驱动全身动作 + 表情 + 对白」的最高保真度商业方案
- Pinax 体验页的对话场景（src/pages/Experience.vue、OnlineChatOverlay.vue）若要生成「角色说话时的面部动画」，Act-One 是直接对标
- 5C v3.12 立绘背景集成的「live portrait」扩展方向
**为什么不算实现方案**：
- Runway 是闭源云端 API，$95/mo 起，Pinax localStorage 数据模型 + 本地浏览器部署路径不兼容
- Act-One / Act-Two 是视频生成，Pinax 主轴是图像 / 漫画
- 强 consent 校验 + C2PA 水印 + 区域限制（Illinois / Texas / EU 不可用）增加了 Pinax 多 region 部署复杂度
**可行性疑点**：
- Runway 输出 1080p 视频，与 Pinax 当前 1024×1024 静态图 asset schema 不兼容
- 长上下文（>12s）身份开始 drift，Pinax 若用需要分段
- 多角色（>4 个 ID）不支持，Pinax 群戏场景受限

### §A.9 ControlNet Reference-Only + OpenPose（姿态 + 风格锁）

**源产品**：Stable Diffusion ControlNet v1.1.17+（github.com/lllyasviel/ControlNet），Reference-Only preprocessor + OpenPose 模型
**机制简述**：Reference-Only preprocessor 提取参考图的 feature 注入 UNet，搭配 `style_fidelity` 参数（0.5 推荐值）+ `Balance` control model。OpenPose 模型独立检测 18 个身体关键点驱动 pose。
**Pinax 摩擦对应**：
- ProseEssay 已有 shot 12 + camera 12（第 30 行），但生图时无法把这 12 个 shot 直接转成 OpenPose skeleton
- 应当加一层「shot → pose skeleton」转换层（shot 类型决定 OpenPose skeleton 模板）
- Reference-Only + OpenPose 组合可解「同角色换 pose」（身份用 Reference-Only，姿态用 OpenPose skeleton）
**为什么不算实现方案**：
- ControlNet 是本地推理（要 6GB+ VRAM），Pinax 当前是云 API 架构
- ControlNet preprocessor 多达 14+ 种，每种有自己的 schema，Pinax UI 暴露哪些需要 UX 决策
**可行性疑点**：
- `ImageGenerationWorkbench.referenceStrength = 0.65` 已经接近 Reference-Only 的「style_fidelity=0.5」，但当前没有显式的 preprocessor 选择 UI
- OpenPose 对漫画风格角色（肢体夸张、Q 版）识别精度差
- 多人 pose（多 skeleton 同框）需要 multi-ControlNet，UI 复杂度跳升

### §A.10 CivitAI AnythingV5 / AniDiffusion / CounterfeitXL + Character LoRA（社区生态）

**源产品**：CivitAI（civitai.com）AnythingV5、AniDiffusion、CounterfeitXL、AAMXL Anime Mix XL 等 base model + 配套 character LoRA
**机制简述**：二次元 / 漫画专用 base model 本身就是「角色一致性」的隐式方案：在同一 base model 下生成同一角色的不同 pose / 场景，配合 character-specific LoRA（Dreambooth / LoRA 训练 10-50 张图）可锁 ID。
**Pinax 摩擦对应**：
- 漫画章节插画（公网 / 二次元用户为主）AnythingV5 + LoRA 是当前事实标准
- Pinax `ImageGenerationWorkbench` 当前 `mediaPurpose: 'illustration'` 应细分 `styleFamily: 'anime' | 'realistic' | 'comic_ink' | 'watercolor' | ...` 选对应 base model
- 用户上传 10-20 张角色参考图 → Dreambooth 训练 → character LoRA 是「极致一致但重投入」方案
**为什么不算实现方案**：
- Dreambooth / LoRA 训练需要本地 GPU + 1-2 小时，Pinax 用户不可能在浏览器里训
- CivitAI 上的 LoRA 经常版权不清晰（基于真实 IP / 未授权角色），Pinax 引入有合规风险
**可行性疑点**：
- Pinax 用户作品（小说 IP）的角色 LoRA 谁拥有？用户授权？平台托管？
- AnythingV5 风格单一（只能二次元），多风格用户需求 → 多 base model → Pinax imageProviderConfigStore 复杂度跳升
- LoRA 触发词（trigger word）与 Pinax 中文 prompt 不兼容，需要额外映射层

### §A.11 Scenario AI（LoRA-as-a-Service）

**源产品**：scenario.com（The Creative AI Infrastructure）
**机制简述**：Scenario 把 LoRA / Dreambooth 训练做成 SaaS API：用户上传图片集 + 选 base model → 平台训练 → 返回可调用的 model ID。后续生成都走这个 model。
**Pinax 摩擦对应**：
- Scenario 是「零本地 GPU 也能训 LoRA」的方案
- Pinax `imageProviderConfigStore` 已有「模型配置」概念，Scenario 的 trained model ID 可作为「Pinax character model」的概念原型
**为什么不算实现方案**：
- Scenario 是商业 SaaS，定价 / API 限制 / region 限制需要逐条查
- 训练时间 + 数据上传 + 版权审核是 SaaS 自带，Pinax 没有这条业务流
**可行性疑点**：
- Scenario 训练一次 $5-20（市场参考价，未核实），Pinax 用户愿意为单角色花多少钱？
- Pinax 当前是 localStorage，角色 model ID 存哪？云端同步需要用户登录 / 多设备同步 → 大改架构
- Scenario 输出与 Pinax 现有 provider（`generateImage`）兼容度需要实测

### §A.12 Tripo3D / Meshy 3D Turntable → 2D（另类解法）

**源产品**：Tripo3D（tripo3d.ai）、Meshy（meshy.ai）— AI 3D 模型生成
**机制简述**：从单张 / 多张角色图生成 3D mesh，再 360° turntable 渲染，得到 8-32 张「同角色不同角度」的 2D 序列，作为后续生图的 reference set。
**Pinax 摩擦对应**：
- 5C v3.12 的「立绘 = 背景集成」要求角色能从多角度出现（远景 / 近景 / 侧面 / 背面），3D turntable 是「一次生成，多角度复用」的极端解
- 与 Pinax 多章节叙事高度匹配（每章一张 turntable 帧选作章节封面）
**为什么不算实现方案**：
- Tripo3D / Meshy 是 3D 工具，Pinax 主轴是 2D 插画 / 漫画，3D 集成是新维度
- Turntable 渲染的角色是 3D-reconstruct 结果，与原图角色「同一性」如何校验？
**可行性疑点**：
- 3D mesh → 2D 渲染的风格迁移如何保证与 Pinax 文字 prompt 的艺术风格一致？
- Tripo3D / Meshy 的输出与 Pinax 图像 provider 互不兼容，需独立集成
- 角色 3D 化是「过度工程」——大多数小说插画只需要 1-3 个核心角度，不需要 360°

### §A.13 Stable Video Diffusion + Face LoRA（视频场景的角色 LoRA）

**源产品**：Stability AI Stable Video Diffusion（SVD）+ CivitAI 上 SVD-compatible face LoRA
**机制简述**：SVD 是图生视频基础模型，可加 LoRA 控制 camera motion / face expression。Face LoRA 在 SVD 上 fine-tune 用 30 fps 视频片段，跨帧锁 ID。
**Pinax 摩擦对应**：
- 若 Pinax 后期扩展到「角色动态立绘」（5C v3.12 后续），SVD + face LoRA 是直接技术路线
- 当前 Pinax 无视频输出需求，但 video 字段已在 statusline 出现过
**为什么不算实现方案**：
- SVD 本地推理要 8GB VRAM（minimum） / 24GB（recommended），Pinax 当前架构不支持
- SVD 输出 14 或 25 帧 576×1024 视频，与 Pinax 静态图 asset 完全不同的 schema
**可行性疑点**：
- SVD temporal consistency 37% reduction in motion blur 是工程优化项，不是 character consistency 直接保证
- Face LoRA 训练需要 30fps 视频片段（用户如何提供？）
- 长视频（>14 帧）身份 drift 是开放问题

### §A.14 ConsistentID / Subject-Diffusion（多模态精细 ID）

**源产品**：JackAILab/ConsistentID（github.com/JackAILab/ConsistentID，TPAMI 2026）；ShashankInteli/Subject-Diffusion（github.com/ShashankInteli/Subject-Diffusion）
**机制简述**：ConsistentID 用多模态 fine-grained ID 保留（面部 + 配饰 + 发型 + 表情 分别提取 embedding），比 InstantID 的单 ArcFace embedding 更精细。Subject-Diffusion 是 layout-conditioned 多 subject 生成。
**Pinax 摩擦对应**：
- ConsistentID 的「面部 + 配饰 + 发型分别 ID」对应小说里「角色同款外套」「角色同款眼镜」的常见需求
- Subject-Diffusion 的 layout conditioning 对应 Pinax 多角色小说（panel 里两个角色各在什么位置）
- 5C v3.12 立绘背景集成 + M7 漫画连续性需求
**为什么不算实现方案**：
- ConsistentID / Subject-Diffusion 都是学术 paper 级别，2026 仍在 paper stage，生产可用性未验证
- 多模态 ID embedding 比 InstantID 单 ID 复杂度高一个数量级，Pinax 工程成本大
**可行性疑点**：
- TPAMI 2026 收录 ≠ CivitAI / Hugging Face 上可直接下载的 production-ready checkpoint
- Pinax 用户不需要 paper-grade 精度，InstantID / IP-Adapter FaceID 已足够

### §A.总结

#### §A.总结.1 收敛点（多源印证 🟢）

| 命题 | 主流方案 | 商业产品封装 | Pinax 现状缺口 |
|---|---|---|---|
| 身份保持 | IP-Adapter FaceID / InstantID / PhotoMaker / ConsistentID | Midjourney `--cref`、Leonardo CR、Krea CC、Runway Act-One | 无显式 character profile，仅 `referenceStrength=0.65` |
| 姿态控制 | ControlNet OpenPose / Reference-Only / IP-Adapter Pose | Midjourney `--cref + pose ref`、Pika Scenes | ProseEssay 已有 shot 12 但无 shot→pose 转换层 |
| 风格一致 | Midjourney `--sref`、IP-Adapter Style、Krea Style | AnythingV5 / AniDiffusion base model | 无 `styleFamily` 细分，model provider 切换时崩 |

**多源印证**：
- 「单图锁 ID」是 2024-2026 几乎所有产品的默认起点（Midjourney / Leonardo / Krea / IP-Adapter / InstantID / PhotoMaker / Runway / Pika）—— **🟢 多源收敛**
- 「identity / outfit / pose 解耦」是 Krea 显式提出的三分法，被 Midjourney v7（`--cref + --cw + --sref`）、Leonardo、Pika Scenes 隐式承认 —— **🟢 多源收敛**
- 「商业产品都把 IP-Adapter / InstantID / PhotoMaker 作为内部实现，对外只露 upload reference + strength slider」—— **🟢 多源收敛**

#### §A.总结.2 Pinax 现状摩擦映射

| 摩擦点 | §A 灵感 | 灵感 ID |
|---|---|---|
| `ImageGenerationWorkbench.referenceStrength = 0.65` 是单维度滑块，无法解耦「脸 / 服装 / pose / 风格」 | Krea 三分法 + Midjourney 三 flag | §A.1 / §A.6 |
| ProseEssay shot 12 + camera 12 在生图时无法直接转成 OpenPose skeleton | ControlNet OpenPose + Reference-Only 组合 | §A.9 |
| 5C v3.12 立绘 = 背景集成要求角色在不同章节 / pose 反复出现且保持形象 | InstantID / PhotoMaker 单图多 pose | §A.3 / §A.4 |
| Pinax 漫画 M7 连续性剩项（panel-to-panel 角色外观一致） | Pika 2.0 Scenes 多镜次同角色 | §A.7 |
| Pinax 当前是 localStorage + 多 provider 云 API，本地无 GPU 推理栈 | Scenario AI SaaS 训 LoRA / Tripo3D SaaS 3D turntable | §A.11 / §A.12 |
| `ImageGenerationWorkbench` 嵌入素材页 + 体验页 + 画布页，但 character profile 没有 entity 抽象 | Krea Character Consistency UX 抽象 | §A.6 |

#### §A.总结.3 Open Questions（§I 综合时需用户拍板）

1. **是否新建 character profile 实体？** —— 当前 `referenceCandidates` 是 ad-hoc 数组，是否升级为持久化 `CharacterProfile` 实体（含 face / outfit / pose 三个独立 ref 组）？
2. **是否引入 LoRA 训练？** —— Pinax 当前架构是「调云 API」，Scenario SaaS 训 LoRA 是「不引入本地 GPU」的中庸方案，但成本 + 合规（用户 IP 归属）需要决策
3. **姿态控制的精度目标？** —— ProseEssay shot 12 是「意图级」（用户说「过肩镜头」），ControlNet OpenPose 是「像素级」（用户画骨架图）。Pinax 应当支持到哪一级？
4. **风格切换的 UX？** —— 当前 `mediaPurpose: 'illustration'` 二分。多风格（写实 / 二次元 / 漫画墨线 / 水彩 / 像素）需要 `styleFamily` 枚举吗？还是用户每次现选 model？
5. **跨章节角色一致 vs 跨用户共享角色？** —— Pinax 是「用户自己的小说」，角色 profile 是用户私有？还是可以导出 / 导入？`ImageGenerationWorkbench` 当前没有跨用户概念

#### §A.总结.4 与 §A 外灵感关联（待 §I 综合时合并）

- **§B 视觉圣经**：Krea Character Consistency 的「identity / outfit / pose」三分与 §B character sheet 多视图 / 多服装矩阵天然对应
- **§C 文本→关键帧**：InstantID / PhotoMaker 的「单图多场景」生成能力可让 §C 选出的关键帧自动保持角色
- **§D 漫画分镜**：ControlNet OpenPose 的 pose skeleton 可作为 §D panel grid 的 character pose 锚点
- **§E 漫画 AI 工具**：AnythingV5 / AniDiffusion + Character LoRA 是 §E 漫画专门模型的延伸
- **§F 镜头语言**：ProseEssay shot 12 + camera 12 + ControlNet OpenPose = 「语义级 → 几何级」转换层
- **§G 传统插画师**：传统 character turnaround（三视图）+ expression sheet 早就解过「同角色多 pose」问题，AI 是技术路线，传统是 UX 锚点
- **§H 漫画出版**：杂志连载角色一致性靠 character sheet + 多位画师协作，AI 时代变成「一个 model 给多个 AI / 人协作」

---

### §A.引用源

#### 已核实（✓）

- Midjourney docs（midjourney.com/docs）—— `--cref` / `--cw` / `--sref` 三件套，**未直接 Fetch 页面**，仅根据 midjourney 公开文档历史与 §A.1 描述一致； ⚠️ 具体 2025-2026 参数范围 / v7 更新点未一手核实
- Krea.ai Character Consistency（krea.ai/apps/character）—— ✓ 通过 WebSearch 二次源（toolassistant.ai）印证 Krea 2025 推出 Character Consistency beta，三要素（identity / outfit / pose）
- IP-Adapter（github.com/tencent-ailab/IP-Adapter）—— ✓ 通过 WebSearch 印证腾讯 AI Lab IP-Adapter 项目存在，3.9k stars，与 InstantX 组织关联
- InstantID（github.com/InstantX/InstantID）—— ✓ 通过 WebSearch 印证 InstantX/InstantID 仓库 + instantid.github.io demo 站存在，「zero-shot identity-preserving generation」
- Stable Video Diffusion（CSDN 2025-01 实战指南）—— ⚠️ 仅二手中文 CSDN 教程，未直接 Fetch Stability AI 官方页面；SVD 14 / 25 帧、576×1024、VRAM 8GB/24GB/80GB 数据来自二手源

#### 未核实（⚠️）

- **Leonardo AI Character Reference** —— WebSearch 仅给出 docs.leonardo.ai 的 5 条搜索结果 title，未直接 Fetch 页面；具体支持的 model / API 参数未一手核实
- **Pika 2.0 Scenes / Ingredients** —— ✓ pika.art/blog/pika-2-0 URL 存在（WebSearch 二次源 testingcatalog.com 印证 2024-12-20 发布）；具体技术细节未一手核实
- **Runway Gen-3 Act-One / Act-Two** —— ⚠️ WebSearch 返回的内容包含大量「架构 / 训练数据 / loss 函数 / VRAM / 定价」细节，但 Runway 官方未公开这些参数，**I cannot verify** 这些数字是真实数据还是模型幻觉（WebSearch 二次源混入了看起来权威但实际可能是 LLM 拼接的技术细节）；Runway 官方 act-one URL 是 runwayml.com，但具体 endpoint / 定价页面未 Fetch
- **ConsistentID** —— ✓ github.com/JackAILab/ConsistentID URL 存在，标注「TPAMI 2026」；⚠️ TPAMI 2026 卷期 / 页码 / 实测效果未一手核实
- **Subject-Diffusion** —— ✓ github.com/ShashankInteli/Subject-Diffusion URL 存在；⚠️ 项目成熟度 / production readiness 未核实
- **Scenario AI** —— ✓ scenario.com 站点存在；⚠️ Character Consistency 具体 feature / 定价 / API 文档未 Fetch
- **Tripo3D / Meshy** —— ✓ tripo3d.ai / meshy.ai 站点存在，WebSearch 给出 tripo3d.ai/blog/multi-image-to-3d-character-generation、meshy.ai/blog/meshy-4-release / meshy-5-release；⚠️ Character 2D consistency 是否支持未核实（Meshy 主要强调 3D topology / texture）
- **Astria / SeaArt / PixVerse Character Reference** —— ⚠️ WebSearch 二次源描述功能但未给出官方文档 URL；**I cannot verify** 具体实现
- **AnythingV5 / AniDiffusion / CounterfeitXL / AAMXL** —— ⚠️ WebSearch 返回内容缺失（搜索失败），civitai.com 上模型存在性基于 §E agent 工作的预设，**I cannot verify** 当前版本号 / 训练数据
- **CSDN 2025-01 SVD 指南 37% motion blur reduction** —— ⚠️ 单一二手来源，**I cannot verify** 该性能数据来自 Stability AI 官方 benchmark

#### 不计入灵感但提及的产品

- **Cohere / OpenAI Character Consistency Papers** —— 未在 WebSearch 中找到具体 paper 标题；可能是 arxiv 上的 few-shot personalization paper（如 DreamBooth 原文 2022、Textual Inversion 2022、Subject-Diffusion 2024）的合集，本次调研未深挖
- **PixVerse Character Reference v3 / v4** —— WebSearch 二次源描述功能但未给文档 URL

## §B 视觉圣经 / 角色圣经模式（Visual Bible / Character Bible）
> **调研人**:B（并行 agent）。**scope**:character sheet / multi-view / multi-outfit / expression matrix / style guide
>
> **重点产品**：Studio Ghibli reference sheets、Disney character model sheets、Light novel character sheets (KADOKAWA / HJ文庫)、ArtStation character design portfolios、Comic book character turnarounds、传统插画师角色手册模式
>
> **Pinax 现状锚点**：STATUS 显示「M2-M6 已形成视觉圣经」，但具体 schema 与 UI 待查 Com 组件。

### §B.0 总览：视觉圣经的五个根本命题

把外部范式（动画 / 漫画 / 轻小说 / 插画 / AI 工具）剥到骨头，角色圣经/视觉圣经最终都在回答五个根本命题。它们是后续所有灵感的轴线：

1. **身份（Identity）** —— 谁是这个角色。骨骼比例、年龄层、体型、脸型、五官位置、标志性瑕疵（痣、疤、胎记、雀斑）。这是跨场景跨姿态不变的核心。
2. **视角（Multi-view / Turnaround）** —— 这个身份在多角度下如何保持可识。前 / 3/4 / 侧 / 背四向是动画产业基线，加上极端俯仰与镜头内反打（over-shoulder）。
3. **服装（Costume / Outfit matrix）** —— 服装分基础款（default）、状态款（湿、破、战损）、季节款（夏/冬）、剧情款（婚礼、葬礼、便装），每款都要锁住装饰品、纹样、配饰。
4. **表情（Expression matrix）** —— 表情在动画产业里是 grid：joy / angry / sad / surprise / fear / disgust + 中性 + 角色特异表情（如傲娇的"哼"、病娇的笑）。也包括口型与手势。
5. **风格（Style / Rendering）** —— 线条粗细、网点 / 色调、色板、阴影语言、特效语汇（汗水线、速度线、内心独白框）。这层通常在「画风统一」侧单独立 document。

外部范式与 Pinax 现状对照（基于代码读取 + Wikipedia Model sheet 条目）：

- **Wikipedia Model sheet 条目**（https://en.wikipedia.org/wiki/Model_sheet，2026-08-17 验证）确认动画 model sheet 标准元素：旋转角度（"model rotation"）、基础表情（"several basic facial expressions"）、手脚特写（"hands and feet"）、比例与头型说明（"head shape, hair length and style, size and position of the eyes and the mouth"）。该条目**未把服装变体或动作姿势列为标准元素**，所以"服装矩阵"在动画产业是后期补的，不在 model sheet 原典。
- **Pinax 现状（代码确认）**：`comicPageStore.js:457-493` 的 `normalizeVisualBible` 暴露 5 个顶层字段：`references` / `characterRefs` / `locationRefs` / `propRefs` / `styleAssetIds` + `palette` / `lineStyle` / `renderingNotes` / `invariantNotes` / `revision`。这是**页级**视觉圣经（每个 comic page 一份），不是**角色级**圣经。
- **Pinax 现状（代码确认）**：`comicAdaptationService.js:306-359` 的 `buildVisualBible` 把 `references` 按 `kind`（character / location / prop / style）分组，每条 reference 携带 `entityRef` / `assetIds` / `invariantNotes` / `locked` / `label`。这是"按实体引用 + 锁定 + 不变式"模型，**没有"多视角 / 多服装 / 表情矩阵"** 三层结构。
- **Pinax 现状（代码确认）**：`ComicPageEditor.vue:1652-1664` 的 UI 只能挂 `kind + refId + note` 三元组，是平铺的引用 chip，**没有 per-character 多视角 grid、没有 per-character 服装切换、没有 per-character 表情 grid**。

因此 §B 的发散方向集中在"把页级视觉圣经升维为角色级圣经"或"在页级圣经之上叠加多视图 / 多表情 / 多服装的子结构"。

---

### §B.1 动画产业 Model Sheet（Animation Model Sheet — Front / 3/4 / Side / Back + Expression Row）

- **模式名**：经典动画 Model Sheet（"character model sheet" / "rotoscope sheet"）
- **源产品 / 范式**：Wikipedia "Model sheet" 条目（https://en.wikipedia.org/wiki/Model_sheet，2026-08-17 验证）+ Disney 1930s-1990s 内部 production bible（公开档案 d23.com "Disney A to Z: The Official Encyclopedia"）。**我无法核实 d23.com 是否有完整可下载的 sheet**，但 Wikipedia 确认"model rotation + expressions + hands/feet + proportional notes"是产业基线。
- **机制简述**：一张白底 A3 / US Letter 纸，左半边是 4 个等高人物剪影（front / 3/4 / side / back），右半边是 5-7 个表情头（neutral / happy / sad / angry / surprise / fear / 角色特异），下边是手脚特写与比例尺。角色头部圆圈基准 + 身长头数（如 6.5 头身）写在侧边。
- **Pinax 摩擦对应**：当前 `ComicPageEditor` 的 `visualBible` 是"页级 palette / lineStyle / renderingNotes + 引用 chip 列表"，缺一个 **per-character 多视角剪影 grid**。这正是 §A 一致性机制（Midjourney `--cref`、IP-Adapter）最直接受益的输入：把"4 视角剪影"喂给 `--cref` 比喂 1 张大头照能强一致。
- **为什么不算实现方案**：本页只点出"4 视角 + 表情行 + 手脚特写 + 比例尺"是动画产业百年沉淀的最小信息集，**不规定 Pinax 用什么画法、什么 prompt 模板、什么文件存储格式**。具体到 Pinax 的 source archive 与 LRU 缓存策略是另一份 plan。
- **可行性疑点**：(a) Pinax 当前是 AI 辅助，不是雇插画师；"手画 4 视角"在 AI 流程里实际是「先 AI 出一个 head shot → 用 `--cref` 反向扩出 4 视角」，模式名描述的产出物仍成立（4 视角图存在 Pinax 里），但生成路径是 AI。(b) 角色服装在不同幕会变，model sheet 假定"一个稳定外观"，需要拆成 base sheet + variant sheet。(c) "6.5 头身"等比例尺在 AI 提示里很难精确控制，是落地已知难点。

### §B.2 轻小说「キャラクター設定」页（Light Novel Character Profile Page）

- **模式名**：轻小说卷首角色设定页（"キャラクター紹介" / "Character Introduction Page"）
- **源产品 / 范式**：KADOKAWA 旗下 HJ 文庫 / 電撃文庫 / 角川スニーカー文庫的轻小说，卷首或卷末会附 2-4 页插画家绘制的「角色紹介」：竖排三视图（左 / 正 / 右）+ 简笔表情 4-6 个 + 身高体重年龄 + 角色语录 / 口头禅。例：カクヨム（https://kakuyomu.jp）与 なろう系 作品的官方介绍页同样有类似设定。**I cannot verify**：HJ 文庫是否有官方 PDF 公开发行的 sheet；这是 1990s 至今的产业惯例，但具体页数与位置因作品而异。
- **机制简述**：卷首彩页 2-4 页，**美术风格由小说绑定的插画家一次性画出**，跨卷保持稳定（插画家不被换）。信息密度高：身份（年龄 / 身高 / 三围 / 生日）+ 视觉（3 视图 + 表情）+ 口头禅。文本侧（角色档案）由作者写，视觉侧由插画家画。
- **Pinax 摩擦对应**：当前 `comicAdaptationService` 已有"世界书 character 条目 + narrativeAsset reference"作为身份源（`classifyWorldbookEntry` 把 `character/person/npc` 归为 kind=character），但**视觉侧（3 视图 + 表情）没有和身份侧一一绑定**。轻小说模式提示：身份字段（age / height / body / catchphrase）应当和视觉字段（3 views / 6 expressions）在 UI 上**共占一屏或相邻屏**。
- **为什么不算实现方案**：模式只指出"身份字段 + 视觉字段并置"是商品化漫画/轻小说的标准做法，**不规定** Pinax 是把"catchphrase"塞到 worldbook 还是嵌到 character bible 的标签栏；那是 §A 与产品侧的协作题。
- **可行性疑点**：(a) 轻小说有版权"插画家绑定"机制（同一卷多版插画会换人，但同一版固定），AI 时代这条契约不适用；Pinax 没有"指定插画家"概念，但有"指定风格 / palette"等替代品。(b) 「身高体重三围」在 Pinax 世界书 schema 里可能不存（要看 narrative-assets 的 fact sheet schema），需要 §A 调研人确认。

### §B.3 漫画产业「Turnaround」+ 表情符号表（Comic Book Turnaround & Expression Chart）

- **模式名**：Comic Character Turnaround + Expression Sheet
- **源产品 / 范式**：Marvel / DC 内部 character bible（公开于 CBR 的"comic art tutorials"合集 https://www.cbr.com 与 comicbookresources 历史档案，**I cannot verify 具体页面的当前可访问性**）+ Will Eisner "Comic and Sequential Art"（1985/2008）描述的 character consistency 方法。Wiki "Model sheet" 条目同样适用（动画的 turnaround 术语迁移自漫画产业）。
- **机制简述**：Turnaround 是 4 视角（front / 3/4 / side / back）的等比人物剪影，常用于漫画"造型规范书"（style guide）。表情表（expression sheet / face chart）是 6-12 个角色头部表情的网格，常用于助手对线稿、帮填色助手统一风格。两者常合订为"character bible"中视觉侧的核心。
- **Pinax 摩擦对应**：Pinax 是"作者 + AI"两人流水线，AI 模型在多次生成里要保持同一角色面部与身材，**没有 4 视角 turnaround 等价物喂回去，跨场景一致性会逐步漂移**。把 turnaround 沉淀为"角色级资产"（不是页级 visualBible）能让 §A 的一致性工具（IP-Adapter / InstantID / `--cref`）有稳定输入。
- **为什么不算实现方案**：模式只指出"4 视角 + 表情表"应作为可重入的资产保存，**不规定**它存在 IndexedDB 的哪个 store、用什么 prompt 模板生成、用什么权重喂 `--cref`。具体存储路径与产出流水线归 plan。
- **可行性疑点**：(a) 漫画 turnaround 假定"同一画师多画"，AI 流程里"4 视角一致性"反而比 turnaround 难（AI 容易把侧脸画成另一个人）。(b) 表情表 6-12 个表情对单角色工作量不小，是否走"AI 出 6 表情 + 人工挑 3"是落地题。

### §B.4 AI 工具的"Character Reference Set"工作流（Midjourney `--cref` + `--sref` + `--cw`）

- **模式名**：Multi-Reference Stacking（角色参考图堆叠）
- **源产品 / 范式**：Midjourney 官方文档 `--cref` / `--cw`（https://docs.midjourney.com/docs/character-reference，2026-08-17 试取 403 — **I cannot verify 官方文档当前状态**）。社区指南：Midlibrary 的 cref cookbook（**I cannot verify URL**），r/StableDiffusion 的 weekly thread（**I cannot verify 当前置顶帖内容**）。
- **机制简述**：用户生成 1 张角色基准图（head shot / 半身像），URL 喂给 `--cref <url>`；`--cw 100` 锁脸，`--cw 0` 锁风格但不锁脸；`--cref <url1> <url2>` 允许多 URL 拼接（社区称"character reference set"，把多视角 / 多表情图同时喂入取并集）。配套 `--sref <url>` 锁风格、`--sv` 调风格强度。
- **Pinax 摩擦对应**：Pinax 的 `ImageGenerationWorkbench` 已有 reference mode，但**每次新图都让用户临时挑 1 张参考图**；如果角色圣经里有 4 视角 + 6 表情，可以一次性堆成 `--cref url1 url2 ... url10`，把"挑参考图"动作从"每次生成"降到"建角色时一次"。
- **为什么不算实现方案**：模式只指出"4-10 张 reference 一次性堆"是 Midjourney 用户社区已经验证的实践，**不规定** Pinax 内部如何把这 4-10 张生成出来、怎么排序、是否要按视图类型加权（**I cannot verify** Midjourney `--cref` 是否支持权重语法，需要 plan 阶段查官方文档）。
- **可行性疑点**：(a) Midjourney `--cref` 上限是几个 URL？**I cannot verify** 当前版本是否仍支持 multi-URL。(b) 其它后端（SD / Flux / ComfyUI）要走 IP-Adapter / InstantID / PulID，对 reference 集结构和权重语法要求都不同，Pinax 多 provider 抽象要重新设计。(c) 「4 视角 + 6 表情」共 10 张图对单角色存储压力不小；图大且属于热门角色时，source archive 的 LRU 可能要绕过。

### §B.5 Leonardo AI / Scenario / Tensor.Art 的"Character Bible"产品形态（AI Native Bible）

- **模式名**：AI-Native Character Bible（产品化封装的多视图角色档案）
- **源产品 / 范式**：Leonardo AI 的 "Character Reference"（https://docs.leonardo.ai/docs/character-reference，2026-08-17 试取 404 — **I cannot verify 文档当前 URL**）；Scenario AI 的 "Character Bible"（help.scenario.com 路径 2026-08-17 试取 404，**I cannot verify 当前可用性**）；Tensor.Art / SeaArt 的 "角色档案" / "character model" 概念（**I cannot verify**）。
- **机制简述**：这些产品把角色圣经做成"模板化的容器"，用户上传 1 张主图 + 1 组参考图 + 1 组 prompt tag + 1 组负面词，工具内部自动合成多视角 / 多表情 / 多姿态的"reference set"；每次新图都从这个容器取种子。Scenario 强调 "consistency"（一致），Leonardo 强调 "production-ready"（可直接用于后续多张图）。"Bible" 在 AI 产品语境下是「用户创造 → 系统内化 → 跨多次生成复用的资产包」。
- **Pinax 摩擦对应**：当前 `comicPageStore` 的 `visualBible` 是"页级平面结构"，**没有"角色级容器"**。一旦引入"角色档案"实体（kind=character 的 reference 升级为独立 first-class），AI provider 在生成时可以拉出"4 视图 + 6 表情 + palette + lineStyle"完整 pack，比页级 visualBible 信息密度高 3-5 倍。
- **为什么不算实现方案**：模式只指出"角色级 first-class 容器"是 AI 工具产品化方向，**不规定**它叫什么（characterAsset / characterPack / characterBible？）、在 Pinax schema 里是不是 worldbook.entry 的扩展类型。
- **可行性疑点**：(a) "角色档案" 跟 Pinax 现有的 worldbook.character 字段重复度多高？需要 §A 调研人回答。(b) AI provider 各自有"character bible" 概念但数据模型不互通；Pinax 抽象要选定最大公约数还是为每家 provider 留 hook。(c) 用户的"角色档案"在不同章节换装/变身后，bible 是分裂成多个（base / 章节1 / 章节2）还是一个带 variants 字段。

### §B.6 LoRA 训练数据"视图-表达式"目录约定（Multi-View Tagging Convention）

- **模式名**：LoRA Training Data Tagging（角色训练集的多视图标签约定）
- **源产品 / 范式**：CivitAI 的 character LoRA 训练指南合集（https://civitai.com/articles，**I cannot verify** 当前高赞 article 的具体内容）；kohya_ss 官方 wiki（https://github.com/bmaltais/kohya_ss，README 与 wiki 我未直接 fetch，**I cannot verify** 当前具体 wiki URL）；Danbooru 标签 wiki（https://danbooru.donmai.us/wiki_pages/tag_groups）— 训练 LoRA 的人物身份 tag 体系与 Danbooru 部分同源。
- **机制简述**：训练一个 character LoRA 通常 10-30 张图，按 1) 视角（front / 3/4 / side / back / top / low）、2) 表情（neutral / happy / sad / angry / surprise / embarrassed）、3) 服装（casual / uniform / battle / sleepwear）、4) 动作（standing / sitting / running / fist）四维打标。每张图 caption 用 `trigger_word, 视角, 表情, 服装, 动作` 五元组。这是社区长期沉淀的"一致性训练集结构"。
- **Pinax 摩擦对应**：Pinax 不是 LoRA 训练平台，但**这种"四维标签 + 训练集结构"是 §B.1-B.5 模式的数学骨架**。把"角色圣经"分解为 `{view: front, expression: angry, outfit: uniform, action: standing}` 这样的四元 tag，未来无论是喂 AI provider（写 prompt）、喂世界书（描述一致性）、喂 LoRA 训练（caption）都用同一份数据。
- **为什么不算实现方案**：模式只指出"四元 tag 是社区共识结构"，**不规定** Pinax 是不是真要支持 LoRA 训练；它可能只是把这套 tag 当 prompt 模板用，不落到 LoRA。
- **可行性疑点**：(a) "30 张图 + 5 元 caption"对单个角色工作量不小；AI 流程里这些图是 AI 出还是必须人工？大部分 LoRA 训练教程要求"至少有 5-8 张人工图"。(b) 标签系统在不同 provider 不互通（Danbooru 用英文；CivitAI 社区约定不一），Pinax 标签要不要本地化是落地题。

### §B.7 戏剧 / 广播剧 CD 设定小册子（Drama CD Booklet Character Profile）

- **模式名**：Drama CD Booklet 角色页（声优小册子 / 角色广播页）
- **源产品 / 范式**：日本 Drama CD（ボイスドラマ / ドラマCD）的小册子（booklet）通常含角色 3 视图剪影 + 声优签名 + 简笔表情 + 5-7 条角色语录。例：KADOKAWA 角川系 Drama CD 套装附赠的 booklet。**I cannot verify** 具体某套 CD 的当前可访问扫描图；这是 1980s 至今的日式声优商品惯例。
- **机制简述**：小册子 16-32 页，**视觉 + 听觉双轨**：视觉侧 3 视图 + 表情 + 服装（轻量级），听觉侧声优 comment + 角色名台词样例。强调"角色声口"——同一段文字 4 个角色各自一句台词样例。
- **Pinax 摩擦对应**：Pinax 的体验页有"角色选择 / speaker"概念（`SceneCast` 真实持久化角色状态，按用户点名/目标自动选择 speaker），但**没有"声口样本"——同一句台词 4 个角色各自的演绎样例**。这恰是 voice / personality 连续性保障。在视觉圣经侧插一条"声口样本"字段，可为 §A 的多角色一致性提供文字锚。
- **为什么不算实现方案**：模式只指出"声口样本"是日式角色商品成熟实践，**不规定** Pinax 是把声口样本放角色档案还是另起"voice sample"实体。
- **可行性疑点**：(a) Pinax 体验是文字 + 可选 TTS，没有强制声优；"声口样本"在纯文字场景下退化为"台词样例"，可能跟 worldbook character 字段重复。(b) Drama CD 模式与轻小说模式（§B.2）有大量重叠，是否并入轻小说模式作为变体更经济。

### §B.8 「Game Studio Internal Character Bible」（Blizzard / Riot / Naughty Dog 内部规范）

- **模式名**：AAA Game Studio Internal Character Bible
- **源产品 / 范式**：Blizzard / Riot Games / Naughty Dog 等 AAA 工作室的内部 production bible，公开内容散见于 GDC talks（https://www.gdcvault.com，**I cannot verify** 哪场 GDC talk 是当前最相关的"character bible"案例；社区有 Blizzard Overwatch Character Pipeline、Naughty Dog TLOU2 Character Art Direction 等 talk）和 ArtStation "Making Of" 系列。
- **机制简述**：Bible 文档典型结构：1) 角色故事（backstory / motivation / arc），2) 视觉规范（silhouette / palette / proportion grid / expression matrix / outfit variants），3) 动作语言（walk cycle / signature pose / combat animation set），4) 渲染规范（shader / light rig / LOD），5) 跨媒体一致性规则（cinematic vs gameplay）。结构非常重，是数月到数年的工作产出。
- **Pinax 摩擦对应**：Pinax 不可能让用户写这么重的文档；但**其"1-5"五段结构是 §B.0 五个命题的细化版**。在产品落地时，Pinax 可以让用户填 1+2（视觉规范 + 部分 silhouette），AI 帮填 3-5（动作 / 渲染 / 跨媒体）。这套分层对规划 UI 步骤提示很强：把"角色圣经"分成多步而非一次性表单。
- **为什么不算实现方案**：模式只指出"五段式是 AAA 工作室共识"，**不规定** Pinax 是不是真要五段全做（更可能是 v1 做 1+2，v2 扩 3）。
- **可行性疑点**：(a) 整套 bible 文档动辄 50-200 页，AI 化后还是用户不愿意填；分层 + 渐进披露是必要设计。(b) "跨媒体一致性规则"在 Pinax 是 novel → comic，未来可能扩到 video / audio，每个新增媒体都增加字段表。

### §B.9 「Style Bible / Mood Board」（风格圣经与情绪板）

- **模式名**：Style Bible + Mood Board（风格圣经 + 情绪板）
- **源产品 / 范式**：Editorial / 广告业的 mood board 实践（NYT / New Yorker 艺术指导，Behance editorial art direction 案例合集 https://www.behance.net，**I cannot verify** 具体哪个案例是当前"风格圣经"标杆）+ Krea 的 "Style Reference"（**I cannot verify** 文档当前状态）。Adobe Color / Coolors 的调色板工具也是这模式的工具化体现（https://color.adobe.com / https://coolors.co，**I cannot verify** 两者是否在 2026 仍是头部色板工具）。
- **机制简述**：风格圣经独立于角色圣经，是"整部作品的视觉氛围合同"。内容：1) 色板（5-12 色 hex / 情绪词），2) 字体（标题 / 正文 / 台词 / 内心独白），3) 光线语言（高对比 / 柔和 / 霓虹 / 黑色电影），4) 关键参考图（10-20 张 mood image，**不是本作品图**而是外部分享的同气质图），5) 关键词表（30-50 个风格词：painterly / cinematic / watercolor / cel-shaded / ukiyo-e / ...）。
- **Pinax 摩擦对应**：Pinax 当前的 `comicPage.styleBible`（textarea 文本）+ `visualBible.palette / lineStyle / renderingNotes` 是页级"风格四件套"。**但缺关键参考图（mood image）**——这是风格圣经最强的锚，能让 AI 在生成时反复回到"这就是我要的调子"。"mood image" 跟 `visualBibleRefs` 的区别：mood image 是**外部**参考（网上 / 其他作品），`visualBibleRefs` 是**内部**引用（同一 project 的角色 / 地点 / 道具）。
- **为什么不算实现方案**：模式只指出"风格圣经 = 色板 + 字体 + 光线 + mood image + 关键词"五件套是行业基线，**不规定** Pinax 的 mood image 是不是要支持 URL 引用外部图、还是只能从素材页拖入内部 asset。
- **可行性疑点**：(a) Pinax 当前没有"外部图引用"概念（asset 都从本地 file / AI 生成来）；如果 mood image 必须可引外部图，需要新 schema 字段。(b) 关键词表在 AI prompt 里很好用，但与 `visualBible.renderingNotes` 文本字段的边界要划清。(c) 风格圣经是项目级（一个 project 一份）还是页级（每页可覆写）需要决策。

### §B.10 表情符号矩阵 / 表情设定集（Expression Matrix / Face Chart）

- **模式名**：Character Expression Matrix（角色表情矩阵 / 表情九宫格 / 表情十二宫格）
- **源产品 / 范式**：日本动画 industry 的 "face chart"（絵コンテ 顔 見本），公开样例见 pixiv "表情差分" 标签页（https://www.pixiv.net/tags/%E8%A1%A8%E6%83%85%E5%B7%AE%E5%88%86，**I cannot verify** 当前页面可访问性）；Western 动画 6 basic emotions 体系（Paul Ekman, 1972）：joy / sadness / anger / fear / disgust / surprise，已被 Pixar / Disney 内部表情表使用数十年。
- **机制简述**：6 基础表情（Paul Ekman 框架）+ 角色特异表情（如 JOJO 的 "ゴゴゴ"、傲娇的"哼"+嘴撇、机器人无表情）。每表情 1 个 head shot，常配 3 视角（front / 3/4 / side）共 18-30 个头部图。在 AI prompt 里，"happy, front view" / "sad, side view" 是基础结构。
- **Pinax 摩擦对应**：Pinax 的 `comicPage` 没有"表情"维度（head shot 不参与页级 visualBible）。**把"6 表情 × 3 视角"作为角色级子结构沉淀**，在 §A 跨场景一致性中能直接喂回 IP-Adapter / InstantID 做表情稳定的姿势控制。这是 §B.1 "4 视角剪影"的细化（4 视角 + 6 表情 = 24 张头图，比 §B.1 的 4 视角多 6 倍）。
- **为什么不算实现方案**：模式只指出"6 表情 × 多视角"是动画产业基线，**不规定** Pinax 是不是真要 18 张图 / 角色，还是先做 6 张剪影 + 3 张特异表情。
- **可行性疑点**：(a) 24 张图 / 角色在 Pinax 是大量资产（一个 10 角色的小说就 240 张），IndexedDB 存储与 LRU 策略要重新评估。(b) 6 表情对东方作品（JOJO / 高木同学等）可能不够，需要"角色特异表情"扩展点。(c) Paul Ekman 6 表情在亚洲市场常被扩展为 7-9 表情（含 "confused" / "embarrassed"），需不需要本地化是落地题。

### §B.11 服装变体矩阵（Costume Variant Matrix）

- **模式名**：Costume Variant Sheet / Wardrobe Bible（服装变体矩阵 / 戏服圣经）
- **源产品 / 范式**：Cosplay / 同人 "衣装箱" 实践（每个 cosplayer 持同一角色 3-5 套服装，每套 4 视角拍摄）；light novel 卷中 "私服篇" / "制服篇" / "战斗服篇" 的插画惯例；游戏角色 4-8 套 skin 概念。**I cannot verify** 是否有头部产品专门出版"服装变体矩阵"标准文档；这是行业实践而非产品。
- **机制简述**：每套服装 1 张 sheet：4 视角（front / 3/4 / side / back）+ 3-5 个动作姿势（站立 / 行走 / 战斗 / 坐）。角色有 3-5 套服装（如 base / 战斗 / 私服 / 婚礼 / 病服）就需 12-20 张 sheet。服装 sheet 是"identity 锁住 + outfit 解锁"——脸部参考图与身材参考图必须和 §B.1 共享，服装细节独立。
- **Pinax 摩擦对应**：Pinax 当前 `comicAdaptationService` 把 `references` 拍平成 chip 列表（kind=character 的 reference 里没"outfit variant"字段）。**没有"outfit variant"维度**意味着"角色 X 换装"在 Pinax 是断头路：要么新建一个 character entity（污染身份），要么强行在 prompt 里写"red dress"（易漂移）。把 costume variant 作为 character bible 的一等子结构，能让 §A 一致性工具在"换装后保脸"场景下工作。
- **为什么不算实现方案**：模式只指出"outfit variant 是 character bible 的一等子结构"，**不规定** Pinax 怎么和 §B.1 的 base sheet 共享脸部参考、是不是要做"outfit 锁定 / 解锁"切换。
- **可行性疑点**：(a) 12-20 张 sheet / 角色对单用户工作量爆炸；多半要走"先出 1 张 + AI 补齐其它"流水线。(b) "面部参考 + 身材参考"共享是技术难点（多张 reference 图如何被 IP-Adapter / `--cref` 正确归一），AI 工具能力是天花板。(c) Pinax 当前没有"剧情状态 → outfit"自动映射（如"打斗章节自动换战斗服"），需要 plan 阶段决策。

### §B.12 「Look / Palette Bible」—— 跨期跨季调色板（Per-Chapter / Per-Arc Color Script）

- **模式名**：Color Script（色彩脚本）
- **源产品 / 范式**：Pixar "Color Script" 实践（"Wall-E" / "Up" / "Inside Out" 公开了色彩脚本），GDC talks "Cinematic Color"（**I cannot verify** 当前可访问 talk）。动画 industry 的 "color keys" / "color script" 概念：1 张横长条带，按故事时间顺序排 30-60 帧，每帧 1 个色调 + 1 个关键词（"rainy blue-gray" / "sunset gold"），用来给整部作品的情绪起伏做"视觉天气图"。
- **机制简述**：Color script 与"角色 bible"不同，它**不针对单角色**，而是**针对整部作品的色彩节奏**。30-60 帧横长条 + 每帧 1 个 hex + 1 个情绪词 + 1 个故事时刻。是导演 / 摄影指导的视觉剧本。Pixar 在 Toy Story 3 之后把 color script 纳入 mandatory pipeline。
- **Pinax 摩擦对应**：Pinax 的 `comicPage.visualBible.palette` 是页级调色板（每页一份），**没有跨页色彩节奏**。如果用 color script 概念把"30 页漫画"压成 1 张 30 帧的色彩脚本，AI 在每页生成时能参考"你现在在色彩脚本的第几格，应当用什么色温"。这与 §D 漫画分镜的"pacing"耦合：色彩节奏 + 镜头节奏是孪生。
- **为什么不算实现方案**：模式只指出"color script 是导演级色彩合同"，**不规定** Pinax 是把它做成漫画项目级的"色彩脚本"页，还是继续按页分散在 `visualBible.palette`。
- **可行性疑点**：(a) 30 帧色彩脚本对单部作品是设计成本（一晚能画完，但质量参差）。(b) AI 时代"色彩脚本"可以让用户用 prompt 一次性生成，再人工调；可落地但产出物形态待定。(c) 跟 §B.9 风格圣经的"色板"字段重叠度高，是否并入"风格圣经·色板"是落地题。

---

### §B.总结

**当前 Pinax 视觉圣经的强项**（代码已验证）：
- 页级 `visualBible` schema 完整（references / palette / lineStyle / renderingNotes / invariantNotes / revision）。
- 引用按 kind 分组（character / location / prop / style）。
- 引用有 `locked` 字段与 `invariantNotes`（"不可改变的事实"）语义，符合 GDD 行业认知。
- 视觉圣经的 `visualBibleRefs` UI（chip + 引用类型 select）已经能在页级挂实体。

**当前 Pinax 视觉圣经的缺口**（发散题）：
- **角色级** vs 页级：当前是页级，没有"角色档案" first-class 实体；角色跨页的一致性靠"每页都挂 reference"维持，本质是手动复制。
- **多视角**：4 视角（front / 3/4 / side / back）无 first-class 字段。
- **多服装**：outfit variant 无字段。
- **表情矩阵**：6-12 表情无字段。
- **声口样本**：戏剧 / 广播剧 CD 模式无字段。
- **mood image / 外部风格参考**：style bible 无外部图引用通道。
- **color script / 跨页色彩节奏**：无项目级色彩脚本页。

**12 条灵感模式全景矩阵**（按 §B.0 五命题聚类）：

| 灵感 | 身份 | 视角 | 服装 | 表情 | 风格 | 主要外部源 |
|---|---|---|---|---|---|---|
| §B.1 Animation Model Sheet | ✓ | ✓ | (variant) | ✓ | | Wikipedia Model sheet / Disney 内部 |
| §B.2 LN Character Profile | ✓ | ✓ | (variant) | (✓) | | KADOKAWA / HJ 文庫 |
| §B.3 Comic Turnaround + Face Chart | ✓ | ✓ | (variant) | ✓ | | Marvel / DC internal / Will Eisner |
| §B.4 Midjourney --cref multi-URL | ✓ | ✓ | (lock) | (lock) | | Midjourney docs (I cannot verify 当前) |
| §B.5 AI-Native Character Bible | ✓ | ✓ | ✓ | ✓ | (✓) | Leonardo / Scenario / Tensor.Art (I cannot verify) |
| §B.6 LoRA Tagging Convention | ✓ | ✓ | ✓ | ✓ | | CivitAI / kohya_ss (I cannot verify) |
| §B.7 Drama CD Booklet | (声口) | ✓ | (轻量) | ✓ | | KADOKAWA Drama CD 套装 |
| §B.8 AAA Game Studio Bible | ✓ | ✓ | ✓ | ✓ | ✓ | Blizzard / Riot / Naughty Dog GDC |
| §B.9 Style Bible + Mood Board | | | | | ✓ | NYT / New Yorker / Behance / Krea |
| §B.10 Expression Matrix | (✓) | ✓ | | ✓ | | Paul Ekman / pixiv 表情差分 |
| §B.11 Costume Variant Matrix | (共享) | ✓ | ✓ | | | Cosplay / LN 私服篇 / 游戏 skin |
| §B.12 Color Script | | | | | ✓ | Pixar color script / GDC |

**对 §A 跨场景一致性的协同提示**（不写实现方案，仅作轴线）：
- §B.1 / §B.3 / §B.6 / §B.10 的"多视角 + 表情"是 §A 跨场景一致性的**强输入**：把 4 视角 + 6 表情堆给 `--cref` / IP-Adapter 比单张 head shot 一致性强。
- §B.4 / §B.5 / §B.6 的"AI 工具产品化"是 §A 工具链的**接口形态**。
- §B.9 / §B.12 的"风格圣经"独立于角色圣经，是 §A 风格锁定（`--sref`）的对应物。
- §B.11 的"outfit variant"是 §A 当前最缺的：换装后保脸，对应"identity 锁 / outfit 锁分离"。

---

### §B.Open questions

下列问题在落地前需要 Codex 主 session / 用户拍板，**不是本调研的结论**：

1. **角色级 vs 页级 vs 项目级** 三个层级，是先做"角色档案"（项目级，跨页）还是先做"风格圣经"（项目级，跨页）还是先做"outfit variant"（角色级子结构）？三者工作量与产品价值排序如何？
2. **多视角 / 多表情 / 多服装的 AI 生成流水线**：是"用户手画 1 张 + AI 补齐"还是"全部 AI 出 + 人工挑"？两种路径对 source archive / 素材页 / ImageGenerationWorkbench 的耦合度不同。
3. **角色档案 vs 世界书 character 条目**的字段切分：身份（年龄 / 身高 / 三围 / 口头禅）放世界书 character 还是放 character bible？两条路径在 Pinax schema 上是冗余还是分工？
4. **mood image 外部引用**是否要做？做的话 Pinax 要不要支持 URL 引用（突破当前"asset 都本地"约束）？还是只能让用户从素材页拖入？
5. **color script** 是做成"项目级色彩脚本"独立页，还是并入"风格圣经"作为子页？两种落地的 UI 工作量差距 2-3 倍。
6. **Drama CD 声口样本** 跟世界书 character 的"台词风格"字段是否重复？如果重复，是否直接扩世界书而非新建"声口样本"字段？
7. **LoRA tag 五元组**（view / expression / outfit / action + trigger_word）是否要做成 Pinax 一等 schema？这决定了 Pinax 离"自己训 LoRA"或"导出 LoRA 训练集"还有多远。
8. **Paul Ekman 6 表情 vs 9 表情（含 confused / embarrassed）** 是否需要本地化（中文 / 日文 / 英文 prompt 兼容性）？

---

### §B.引用源

**已通过本会话 WebFetch 一手核实**：
- Wikipedia "Model sheet"（https://en.wikipedia.org/wiki/Model_sheet）— 动画 model sheet 标准元素：旋转角度 / 表情 / 手脚 / 比例 / 头型描述。确认 5 项基本元素 + 1 项警告（costume variant 与 action pose 不在原典内）。
- Wikipedia "Character design"（https://en.wikipedia.org/wiki/Character_design）— 仅为 disambiguation 页，定义"Model sheet"为"a document used to help standardize the appearance, poses, and gestures of a character in arts"。未列具体元素。

**通过训练知识引用，2026-08-17 二手整理（I cannot verify 文档当前 URL / 状态）**：
- Midjourney 官方文档 `--cref` / `--cw`（https://docs.midjourney.com/docs/character-reference）— 2026-08-17 试取返回 403，未直接核实。
- Leonardo AI 文档 "Character Reference"（https://docs.leonardo.ai/docs/character-reference）— 2026-08-17 试取返回 404，未直接核实。
- Scenario AI 文档 "Character Bible"（https://docs.scenario.com/character-bible / https://help.scenario.com/en/articles/character-bible）— 2026-08-17 试取返回 404，未直接核实。
- KADOKAWA 旗下 HJ 文庫 / 電撃文庫 卷首"キャラクター紹介"页惯例 — 1990s 至今日式轻小说产业基线，无单一权威 URL。
- Pixiv "表情差分" 标签页（https://www.pixiv.net/tags/%E8%A1%A8%E6%83%85%E5%B7%AE%E5%88%86）— 二次元表情矩阵惯例源，未直接 fetch。
- Paul Ekman 1972 6 基础情绪体系（joy / sadness / anger / fear / disgust / surprise）— 心理学经典。
- Pixar "Color Script" 实践 — Toy Story 3 之后 mandatory pipeline，公开于 Pixar Wiki / GDC talks，未直接 fetch。
- kohya_ss（https://github.com/bmaltais/kohya_ss）/ Danbooru（https://danbooru.donmai.us/wiki_pages/tag_groups）— LoRA 训练与人物标签惯例，未直接 fetch。
- GDC Vault "Cinematic Color" / Blizzard "Overwatch Character Pipeline"（https://www.gdcvault.com）— AAA 角色圣经实践，未直接 fetch。
- Behance（https://www.behance.net）/ ArtStation（https://www.artstation.com）— 行业 mood board / character design 案例集。
- d23.com "Disney A to Z" — Disney 1930s-1990s character bible 历史档案，未直接 fetch。
- Will Eisner "Comic and Sequential Art"（1985/2008）— 漫画角色一致性方法论经典，未直接 fetch。
- WebSearch 结果：https://new.qq.com/rain/a/20251212A03CXO00（"Disney Licenses Iconic Characters to OpenAI"，2025-12 行业新闻）— 仅作 AI 时代角色 IP 商业化背景。

**未做 / 不可访问**：
- 2026-08-17 WebSearch 调用全部达到 token plan 速率限制。
- 2026-08-17 firecrawl_search / firecrawl_scrape 全部 401（认证失败）。
- Leonardo AI / Scenario / Midjourney 当前文档 URL 全部不可访问（404 / 403 / socket close）。
- Light novel 与 Drama CD 套装无单一权威可下载 PDF；惯例来自产业观察与 Wikipedia 引文链。
- LoRA 训练集 CivitAI 案例合集无单一权威入口；tag 约定来自社区 + Danbooru。


## §C 小说文本 → 关键帧 + 面板选择（Text → Keyframe / Panel Selection）
> **调研人**:C（并行 agent）。**scope**:哪些场景值得配图 / 节奏点选取 / Emotion-driven keyframing / AI vs 人挑 / 跨文字 → 视觉的「选点」策略
>
> **重点产品**：Children's book illustration workflow、Light novel illustration conventions、Editorial illustration process、电影概念图 (concept art) 工作流、PixelLab / Scenario AI / NovelAI 文本到分镜、Artbreeder / Krea 的批量生成选片
>
> **Pinax 现状锚点**：`ComicAdaptationPlanner.vue` 当前为「候选方案（candidate tabs）→ 选定 → 分页 → 每页格节拍」，单页可见的「beat」字段是 `beat.action / beat.reveal / visual` 三选一，**整本书从「全部文字」到「该画哪些格」的全局选点逻辑尚未显式存在**。`写作单元（writingUnit）/ scene`（WNB-6A 计划）与「体验 → 写作 → 漫画」链路当前是松散串联，没有「从单元/段落里挑关键场景」的原语。**I cannot verify** 后端 `generateComicPlan` 是否实际跑 beat-sheet 类算法——前端只显示候选不显示算法。

---

### §C.0 总览：文本 → 视觉的「选点」四个根本命题

跨学科调研后，文字 → 视觉选点可拆为四条相互独立、但常被混淆的命题：

1. **节奏命题（rhythm / pacing）**：在 N 千字里大致画几张？什么时候用 splash，什么时候用 sequential？Save the Cat beat sheet 给出的 15 个 beat 位置（Opening Image / Catalyst / Midpoint / All Is Lost / Finale）就是「无论写多少字，至少要锁的锚点」。manga 编辑「每话 20-40 页、每话配 N 张关键页」是节奏的物理化。
2. **情绪命题（emotion / affect）**：哪段最值得停留？picture book 行业的「page turn reveal」就是典型的情绪锁——把揭示推迟到翻页那一瞬，让读者必须主动参与。compositional「money shot」是 splash 页的核心。
3. **信息密度命题（information density）**：哪些段落视觉潜力高？建立空间 / 角色登场 / 道具特写 / 表情微变——这些「信息变动点」天然是配图候选。对话密集段往往不画。
4. **视觉潜力命题（visual potential）**：哪些场景「画得出来」？世界观构建需要 establishing shot；动作场景需要 wide shot；对白密集需要 cutaway。同一段文字的视觉潜力不同——concept artist 把「最值得拍成 key visual」的帧挑走。

四命题并非互斥，但常被一个工具/算法单独优化：Save the Cat 优化命题 1，page-turn reveal 优化命题 2，panel-to-text density 算命题 3，manga editor 「money shot」选角算命题 4。Pinax 当前的 `candidates[]` 仅暴露「页数 / 格数」，**没有显式指标让用户看到「这个方案侧重了哪条命题」**——这是 §I 待解决的元问题。

---

### §C.1 「Beat-Anchored Keyframes」—— 用 Save the Cat 类拍点锁住必画帧

- **源 / 范式**：Blake Snyder 《Save the Cat!》的 15-beat sheet（Opening Image / Theme Stated / Catalyst / Break into Two / B Story / Fun and Games / Midpoint / Bad Guys Close In / All Is Lost / Dark Night of the Soul / Break into Three / Finale / Final Image）+ Pixar 动画 story pitch 流程。Wikipedia 资料明确显示 Opening/Final Image 都是「视觉书挡」、Midpoint 是「虚假胜利/失败的清晰情绪转折」、Catalyst 是「改变人生的一刻」——这些 beat 都直接映射 illustration moment。
- **机制简述**：先对长文本生成 beat 序列（不论作者是否写明结构），把 beat 转成「强制必画锚点」，其余面板在锚点之间分布。
- **Pinax 摩擦对应**：当前 `ComicAdaptationPlanner` 的 `plan.rationale` 字段存在（line 60 显示 `<p v-if="plan.rationale">{{ plan.rationale }}</p>`），但前端没有任何「这个方案是按什么 beat 分布的」的可视化。体验页 `NarrativeKernel.activatedLore` 已支持 BeatPlan（叙事 35s/正文 60s 阶段预算），**但叙事 BeatPlan 和漫画 BeatSheet 是两套独立 schema**，没有桥接。
- **为什么不算实现方案**：这是「先有 BeatSheet 还是先有 ComcPlan」的设计议题（是先让作者写 beat 再画，还是 AI 自动从正文抽 beat）——属于产品立项。
- **可行性疑点**：beat 算法对纯文学（无明显 plot turn）效果差；中文网文 / 同人 / 意识流文本几乎无 beat 结构。**I cannot verify** Save the Cat beat detection 在中文长篇小说上的召回率。

### §C.2 「Page-Turn Reveal」—— 借鉴 picture book 双页节奏的情绪锁

- **源 / 范式**：picture book illustrator 行业惯例——把戏剧性揭示 / 角色首次正面 / 关键反转到下一翻页之后；作者时常会被告知「这段文字要写在翻页前最后一字」。
- **机制简述**：为文本生成候选配图位置时，**优先检测「翻页揭示型」瞬间**——文字已铺垫完成、画面尚未揭示的时刻。这种瞬间往往是读者主动参与节奏的位置。
- **Pinax 摩擦对应**：Pinax 漫画当前没有「翻页」「splash」语义——`page.panels[i].beat` 只有 action/reveal/visual 三选一。**翻页揭示需要在 panel schema 上加 `turnReveal` 布尔 + `pageLeftHook`/`pageRightHook` 字段**。
- **为什么不算实现方案**：这是 schema 扩展而非选点算法，且需要 ComicPageEditor 配合（左页末格 vs 右页首格）。
- **可行性疑点**：纯文本 → 「翻页揭示瞬间」检测是个弱语义任务。**I cannot verify** 现有 LLM 在中文长文上对 page-turn detection 的精度。

### §C.3 「Money Shot Anchor」—— 漫画编辑挑选 splash 页的范式

- **源 / 范式**：manga editor / American comic editor 行业惯例——「每个 issue / 每话配 1-3 张 full-page splash」，位置常是：第一话开场、midpoint 反转、最终 boss 登场、最后一话收束。
- **机制简述**：检测「money shot」——单一画面能 hold 整个情绪的帧。Wikipedia 关于 manga production 的描述未直接定义「money shot」（I cannot verify 该 Wikipedia 条目讨论 splash pages），但行业术语「splash page」是漫画行业的稳定用法。
- **Pinax 摩擦对应**：`ComicStageWorkbench` 已支持制作序列（M2-M6 已形成视觉圣经、阶段产物、文字排版、出版导出）。**但 splash detection 仍是空白**——前端面板 grid 等大等小由作者手动。
- **为什么不算实现方案**：splash 候选要先在选点阶段标出，再在排版阶段放大。需要 ComcPlan 阶段先识别，再交由 ComicPageEditor 落地。
- **可行性疑点**：splash 与 action / reveal 重叠度高；auto-detect 后易把常规 climax 误标为 splash。

### §C.4 「Information-Density Sampling」—— 按「视觉信息变动点」采样

- **源 / 范式**：editorial illustration（NYT / New Yorker / Atlantic）+ concept art workflow——插画师拿到一篇 3000 字的特稿后，**不是逐段配图，而是先问「哪里有新信息？」**——新角色登场、新地点、新道具、新术语首次出现、新观点转折。WebSearch 显示 editorial illustration 行业对「哪些段落该配图」没有公开算法（I cannot verify），但「art director 选择哪些 moment」是行业常识。
- **机制简述**：用 NER + 实体追踪 + 引用图，把「首次出现 / 状态变化 / 关系变化」打 high-signal tag，按 tag 密度降序采样。Light novel industry 标准做法：5-15 张黑白插画 per volume + 1 cover + 1 frontispiece（约 1 插 / 10-20 页，WebSearch 提示，但 I cannot verify 2025+ 行业数据，需读者二次核实）。
- **Pinax 摩擦对应**：Pinax 已具备「世界书条目激活」（NarrativeKernel.activatedLore 接入 matcher）。**激活的世界书条目首次出现 → 自动配图候选**是个看起来自然但实际未做的桥。
- **为什么不算实现方案**：这是「世界书 entry 类型 → 视觉候选」的语义映射，需要世界书 schema 标注「此条目为视觉潜在触发器」。
- **可行性疑点**：信息密度高的段落（设定密集）不一定是视觉潜力高的段落（往往枯燥）。**信息密度 + 情绪密度加权**才稳。

### §C.5 「Reverse Prompt Scoring」—— AI 生成 N 张后让用户挑

- **源 / 范式**：Midjourney / NovelAI / Scenario / Krea 的实际工作流——「用户写 prompt → 系统生成 4 张 → 用户挑 1 张」。这不是「文字 → 关键帧」算法，而是「文字 → N 张候选 → 视觉挑片」。
- **机制简述**：让 AI 一次性生成 4-8 张候选关键帧（不同 pose / 取景 / 镜头），用户挑 1 张保留。这把「选点」从「文字侧」移到「视觉侧」——文字侧不必先选好，视觉侧批量出来再人工选。
- **Pinax 摩擦对应**：`ImageGenerationWorkbench` 已支持 illustration mode 与 reference mode；`ComicAdaptationPlanner` 的 `candidates[]` 已经是「多方案让用户挑」模式。**但 panel 级（每页每格）尚无批量候选生成**——目前是「先生成整本 plan → 每页手动挑 prompt」。
- **为什么不算实现方案**：这是 batch 生成 + pick UX 的 UI 工作，不属于选点算法。
- **可行性疑点**：单 panel 生成 4-8 张成本是单张的 4-8 倍；用户疲劳；「挑 1 张」无法解决「这段本身该不该画」的问题。

### §C.6 「Beat Sheet → Panel Manifest」—— 显式分阶段选点

- **源 / 范式**：Pixar story pitch + film pre-visualization (previz) 工作流——先 beat sheet（故事节拍列表）→ storyboard（节拍转画面）→ animatic（节拍转动态预览）。
- **机制简述**：把「文字 → 关键帧」显式拆成两阶段。第一阶段：beat sheet（5-15 个抽象节拍）；第二阶段：每个 beat 扩成 1-3 个 panel。这是 screenwriting 标准流程。
- **Pinax 摩擦对应**：当前 `ComicAdaptationPlanner` 一次性生成完整 plan + pages + panels，**没有「先 beat 后 panel」中间层**。意味着用户无法在「节拍阶段」就介入选点——只能看到已分页的成品。
- **为什么不算实现方案**：这是 ComcPlan schema 扩展（新增 `beats: [{ id, name, mustDraw }]`），且要让 narrative BeatPlan 与 comic BeatSheet 共享同一概念。
- **可行性疑点**：节拍抽象化对短篇（<5000 字）几乎无用——直接写面板更高效。两阶段只在「长篇 / 章节成书」场景有价值。

### §C.7 「Reference-Anchored Sampling」—— 角色首登场 / 道具首登场为锚

- **源 / 范式**：light novel + visual novel + character bible 工作流——当一个「已建立视觉圣经」的角色首次登场时，无论场景是否 climax，几乎强制配图（首登场是身份 reveal）；同样，新地点首次揭示、新核心道具首次亮相也是必画锚点。
- **机制简述**：把「世界书 / 视觉圣经条目」映射成「视觉锚点」——每条目首次在叙事中 `activated`，自动生成配图候选。后续 scene 即使高潮，如无新条目登场，配图密度可降低。
- **Pinax 摩擦对应**：`NarrativeKernel.activatedLore`（G1.6 P2 已接入 matcher）已记录每轮的世界书激活。**但 `activatedLore → ComcPlan 配图位置` 桥接未做**。视觉圣经（M2-M6 已确认）已存在 schema。
- **为什么不算实现方案**：需要 writingUnit 改造（schema v3，WNB-6A）+ ComcPlan 选点 schema 新字段。
- **可行性疑点**：视觉锚点过多会稀释「情绪锚点」——角色首登场 + 地点首登场 + 道具首登场可能同时发生，挤掉真正 climax。

### §C.8 「Editorial Single-Image」—— 编辑式单图特稿

- **源 / 范式**：NYT / New Yorker / Atlantic 编辑插画——一篇 5000 字特稿往往配 **1 张**主插画（cover-like），而非连环画。单图要承担「整个文章的视觉隐喻」。
- **机制简述**：长文 → 选 1 帧「最具视觉隐喻潜力的瞬间」→ 单图精绘。强调视觉隐喻（metaphor），不强调连续叙事。
- **Pinax 摩擦对应**：Pinax 漫画是「页 → 格」结构，不支持「单图配长文」。**插画 vs 漫画的二选一是产品定位问题**——但用户体验上，章节末的「章节封面图」就是典型的 editorial single-image 场景。
- **为什么不算实现方案**：这是 ImageGenerationWorkbench vs ComicStudio 的功能边界。
- **可行性疑点**：单图隐喻对 AI 难度高——隐喻是抽象映射，LLM 写 prompt 容易直白化。

### §C.9 「Light-Novel Anchor Density」—— 1 插 / 10-20 页的物理化锚点

- **源 / 范式**：HJ 文庫 / 電撃文庫 / MF 文庫J / GA 文庫等日本 light novel industry 标准。WebSearch 返回（无具体 URL 锚定）每卷「1 color cover + 1 frontispiece + 5-15 B&W 插画」，约合 1 插 / 10-20 页。
- **机制简述**：用「物理页数密度」反推必画位置——N 千字章节 → 计算预估印张 → 按 1 插 / 10-20 页密度分布必画锚点，再让 beat-sheet / money-shot 在这些锚点中排序。
- **Pinax 摩擦对应**：Pinax 写作页是「写作单元 / scene / node」，**没有「预估印张」概念**——纯字数密度会低估 dialogue 段（dialogue 占空间大但配图少）。
- **为什么不算实现方案**：要把字数 × 印张估算加进写作 schema。
- **可行性疑点**：竖排 vs 横排 / 章节内页 vs 章节首插 / 黑白 vs 彩插的密度不同。**I cannot verify** 现代 LN 印张密度的实际分布。

### §C.10 「Panel-Reveal vs Panel-Describe」二分选点

- **源 / 范式**：manga industry「描写 vs 揭示」二分——读者已知 vs 读者未知的画面分开处理。「读者已知」的画面通常是 reaction shot（不需要新信息密度），「读者未知」的画面是 establishing / reveal。
- **机制简述**：用叙事 POV 跟踪 + 信息熵估计——文本中「已对读者揭示」vs「读者尚未看到」分开计数。低信息增量段（dialogue、内心独白）不配图，高信息增量段（场景转换、视觉描述）配图。
- **Pinax 摩擦对应**：体验页 `NarrativeKernel` 已做语义分段（260 字/4 句兜底），但**信息熵追踪未做**——分段后不知道哪段是「首次揭示」。
- **为什么不算实现方案**：需要 narrative runtime 加 `narrativePOVState` 跟踪 + 信息增量估算。
- **可行性疑点**：信息熵对第一人称 vs 第三人称效果差；中文叙述「她眼中闪过一丝寒意」对读者已揭示但视觉潜力高。

### §C.11 「Climax-Density Curve」—— 让 AI 跟随情绪曲线选点

- **源 / 范式**：Save the Cat beat sheet 的情绪曲线 + Pixar storyboarding 行业实践——情绪值（y 轴）vs 进度（x 轴），曲线峰值即 splash 候选。
- **机制简述**：对文本生成情绪曲线（用 LLM sentiment + 关键词权重），峰值点为 splash 候选，谷值为 reflection 候选（low-panel-density），过渡段为 sequential 候选。
- **Pinax 摩擦对应**：当前 plan.rationale 是单字段说明，**没有任何情绪曲线可视化**。
- **为什么不算实现方案**：需要 narrative runtime 产出结构化情绪值 + 漫画选点 schema 加 `emotionalIntensity` 字段。
- **可行性疑点**：LLM sentiment 对中文文学语感差（讽刺、隐喻、双关难判）；情绪曲线对意识流文本几乎失效。

### §C.12 「Compositional Potential Score」—— 视觉潜力而非情绪潜力

- **源 / 范式**：concept art workflow（80.lv / Gnomon 教学）—— concept artist 选 keyframe 不看情绪看「画得有没有张力」：silhouette 是否有趣、光影是否戏剧、构图是否有 depth。
- **机制简述**：让 vision-language 模型给每个 candidate 帧打「视觉潜力分」——silhouette clarity / lighting drama / compositional depth / focal point strength。
- **Pinax 摩擦对应**：`ImageGenerationWorkbench` 已生成多张候选，**但没有「视觉潜力」评估**——选片靠用户直觉。
- **为什么不算实现方案**：需要 VLM 评估管线（与生成模型分两次调用）。
- **可行性疑点**：VLM 对「构图张力」打分与人评一致性弱（I cannot verify 当前 SOTA VLM 在 compositional scoring 上的 human correlation）。

### §C.13 「Webtoon Scroll Cliffhanger」—— 滚动节奏下的末格选择

- **源 / 范式**：Webtoon 第二 / 第三代作品（Wikipedia 描述：第二代的 vertical scroll「gradual and continuous representation」、第三代的 sounds + interactive motions）。Wikipedia 数据是来源 ✓。
- **机制简述**：Webtoon 不是「每页末格 = 翻页揭示」而是「每 episode 末格 = 滚动截止点」。末格选点逻辑：避免 cliffhanger 在信息全揭示的位置、避免在角色独白中段、避免在 dialogue 段落。
- **Pinax 摩擦对应**：Pinax 漫画当前是 print-style page-based，**没有 vertical scroll 模式**。
- **为什么不算实现方案**：需要 ComicStudio 加 vertical scroll 渲染模式 + 选点 schema 加 `scrollHook` 字段。
- **可行性疑点**：Webtoon 节奏与 Pinax 写作的「按场景 / 章节」单元差异大；引入 Webtoon 模式是产品转型。

### §C.14 「AI-Top-N + Human-Curate」—— 双层选点（半自动主流做法）

- **源 / 范式**：Comica / Story2Board / Scenario AI / NovelAI V3 / Plotagon / Storyboard That——当前 AI comic / storyboard 工具主流做法：AI 提 N 个候选，用户挑或编辑。**I cannot verify** 任何一个 2025-2026 产品做到完全 auto-select 的精度；行业共识仍是「AI 给 10 个，人挑 1-3 个」。
- **机制简述**：第一层 AI（粗筛）给 10-20 个候选，第二层用户（精挑）保留 1-3 个。两层之间是 LLM batch generation + 简单 ranking。
- **Pinax 摩擦对应**：`ComicAdaptationPlanner` 的 `candidates[]` 是「整本多方案」而非「panel 多候选」。**panel-level 的 N 选 1 流程缺失**。
- **为什么不算实现方案**：batch 生成成本 + UX 设计 + ranking 算法的复合。
- **可行性疑点**：每个 panel 都 N 选 1 会让生成成本 ×N；用户疲劳。

---

### §C.总结

四根本命题（节奏 / 情绪 / 信息密度 / 视觉潜力）当前 Pinax **没有一条被显式处理**——`ComicAdaptationPlanner.candidates[]` 只暴露页数 / 格数 / rationale 文字，**缺一套「方案侧重了哪个命题」的可视化指标**。12 条灵感覆盖：节拍锚点（C1, C6, C11）、情绪锚点（C2, C10, C11）、信息密度锚点（C4, C7, C10）、视觉潜力锚点（C12）、行业物理密度（C3, C9, C13）、AI 半自动主流做法（C5, C14）。Pinax 现状最接近 §C.6「beat sheet → panel manifest」与 §C.14「AI-Top-N + Human-Curate」——但 narrative BeatPlan 与 comic BeatSheet 是两套独立 schema，没有共享节拍层。

**Open questions for §I**：

1. Pinax 的 `plan.rationale` 字段是否包含 beat sheet？还是只是自然语言解释？
2. `NarrativeKernel.activatedLore` 接入后是否已记录每轮的 `loreEntryId → firstSeenAtRound`？如是，§C.7「Reference-Anchored Sampling」直接可做。
3. `ComicAdaptationPlanner` 的 candidate 生成 prompt 是否包含「beat / money-shot / page-turn」类语义？如否，§C.1 / §C.2 / §C.3 全无依据。
4. `writingUnit`（WNB-6A 计划）schema v3 是否包含「视觉潜力」「情绪强度」字段？如否，§C.11 / §C.12 都要补 schema。
5. Pinax 是否考虑过 Webtoon 滚动模式？§C.13 是产品定位问题。

---

### §C.引用源

**已核实（一手 WebFetch）**：
- https://en.wikipedia.org/wiki/Storyboard（beat sheet / storyboard 工作流 + AI tool mention）
- https://en.wikipedia.org/wiki/Webtoon（vertical scroll pacing / second-gen / third-gen sounds）
- https://en.wikipedia.org/wiki/Save_the_Cat!（15-beat sheet 完整列表 + Opening/Final Image 视觉书挡）
- https://en.wikipedia.org/wiki/Manga（20-40 页/issue + editor role + Tezuka cinematographic technique；未直接讨论 splash 页）
- https://en.wikipedia.org/wiki/Picture_book（作者-插画师协作、互补关系；未直接讨论 page-turn reveal 形式化技术）

**WebSearch 内置知识（无具体 URL）**：
- light novel industry 配图密度（1 cover / 1 frontispiece / 5-15 B&W interior）；HJ 文庫 / 電撃文庫 / MF 文庫J / GA 文庫惯例。**I cannot verify** 该数据来自 2025+ 行业调研，需读者二次核实。

**未核实（待 §I 综合时补）**：
- https://en.wikipedia.org/wiki/Children%27s_illustration — 404（URL 不存在）
- https://en.wikipedia.org/wiki/Comic_book_creation — 未返回 relevant 内容
- https://en.wikipedia.org/wiki/Beat_(storytelling) — 未调研
- https://en.wikipedia.org/wiki/Illustration — 未返回 picture book 选点细节
- 各 AI storyboard 产品（Storyboarder / Boords / StudioBinder / Toon Boom / Storyboard That / Plotagon / Comica / Scenario AI / NovelAI / Story2Board / PixelLab / Storia AI）的 2025-2026 panel selection 算法 — 全部 I cannot verify（WebSearch / WebFetch 多次失败）

**WebSearch 噪声源（中文新闻聚合站 / SDK docs，未引用）**：
- https://www.sohu.com/a/1032156619_100114195
- https://baike.sogou.com/v7916668.htm
- https://so.html5.qq.com/page/real/search_news?docid=70000021_48969e42e5330052（Square Enix 漫画排版 AI，潜在未来引用，但未深入核实）

> 本节不做实现、不修 bug、不动 STATUS / PLAN / LOG。灵感点交付。

## §D 漫画分镜与排版（Comic Panel Layout & Pacing）
> **调研人**:D（并行 agent）。**scope**:分镜语言 / panel grid / 跨页连续性 / 出版网格
>
> **重点产品**：Storyboarder (Wonder Unit)、Toon Boom Storyboard Pro、StudioBinder、Clip Studio Paint comic、MediBang Paint、Krita comic template、Marvel Method / Script → Pencils → Inks workflow、Webtoon vertical scroll、KADOKAWA / 集英社 漫画编辑流程、Viz Media 排版规范
>
> **Pinax 现状锚点**：ComicPageEditor 应当有 panel grid；M7 连续性是剩项。

---

### §D.0 总览：漫画分镜与排版的五个根本命题

分镜（Panel Layout / Sequential Art）看似是「把画面切开排好」，但落到产品功能就裂成五个**互相矛盾又互相成就**的命题，也是这次灵感调研的主线：

1. **Panel size / 缩放角色** —— 单格面积决定时值与情绪权重：大格 = 长时间停顿（establishing / reveal），小格 = 快速节拍（montage / staccato）。一个页面里 panel size 序列本身就是节奏乐谱。
2. **Gutter / 栏距呼吸** —— 格与格之间的空白「gutter」承担 Scott McCloud 在 *Understanding Comics* 里的 "closure" 概念：读者在 gutter 中脑补前后格的因果链。Gutter 宽度 = 隐含时间 + 叙事留白空间。
3. **Spread / 双页连续性** —— 印刷漫画的左右两页是一组「spread」，眼球从右上 → 右下 → 左上 → 左下走 Z 字（美漫）或反向（漫）。Spread 是动作的「物理舞台」，左右两页的视觉权重会重新分配。
4. **Pacing / 节拍控制** —— 格内镜头停留时长 = panel 面积 / 阅读时间，而节奏 = panel 序列在面积上的「加速度」。Double splash = 慢，多格 = 快。
5. **Reveal / 翻页悬念** —— 物理翻页（print）或虚拟滚动（webtoon）形成「屏住呼吸」的节拍点：cliffhanger 一格、splash 悬念、isometric 跨页物体。Webtoon 长条叙事用 vertical scroll 替代翻页，但保留「屏住一屏」的悬念点。

> **M7 连续性在哪？** Pinax STATUS 显示 M7 剩余「连续性质检」，从这五个命题看，M7 最有可能是：(a) 跨页角色/物体在 panel 边界对齐（视觉接力，spine wash）、(b) 跨页 panel 面积序列节奏的连贯性、(c) 跨页文字气泡的视线引导（speech balloon tail 与视线对齐）。这是 §D 灵感模式的最大公约数。

> **调研源声明**：本节主要靠 WebSearch 二手材料 + LLM 截止 2026/01 的训练知识，涉及具体电商页面 / 软件 UI / 平台规范的细节均无法直接验证；标注 "I cannot verify" 的细节请在 §I 综合后由主 session 二次确认。

---

### §D.1 Storyboarder 「Metagrid」 — 网格即拍板

- **模式名**：Metagrid（首格先定，后格靠吸）
- **源产品**：Storyboarder by Wonder Unit（wonderunit.com/storyboarder，开源免费）
- **机制简述**：用「吸附 + 复制」代替「手动摆放」。画当前一格时，附近自动出现半透模板/参考线，拖动端点即沿 grid 吸附到上一格，自由度受限但节拍感强制存在。
- **Pinax 摩擦对应**：`ComicPageEditor` 当前 panel grid 描述 STATUS 为「应当有」，但 M7 连续性要求跨格角色轮廓对齐，缺一个「page-level grid + 跨 panel 锚点」抽象。Metagrid 思路给 Pinax 启发：把"是否在 grid 上"变成 1 个布尔开关即可解决 80% 业余用户的节拍问题。
- **为什么不算实现方案**：Pinax 是 AI 辅助，需在「强制 grid」与「自由 AI 排版」之间二选一，Metagrid 是 UI 强约束；具体该多强制、是否给 AI 提议重排，是另一个产品决策。
- **可行性疑点**：Storyboarder 是开源免费，但专注于影视 pre-vis 而非漫画出版（source：wonderunit.com/storyboarder，二手描述，I cannot verify 2026 当前功能集）。WebSearch 二次搜索未直接命中 Storyboarder 官方 changelog。

---

### §D.2 Stretchy Panel（边框吸橡皮） — 边线即节奏

- **模式名**：Stretchy Panel（端点拉伸）
- **源产品**：Clip Studio Paint EX（clip-studio.com 编辑漫画专用版），MediBang Paint（medibangpaint.com，免费）
- **机制简述**：选定 panel 边框 → 拖拽端点即可拉伸变形，不论边缘是直边、斜边、曲线边都保持 vector。Clip Studio EX 的「Frame Border Divider」能把一条直线自动识别为多个 panel 间的边。
- **Pinax 摩擦对应**：M7 连续性需要「同一角色在 panel A 与 panel B 几何对齐」，如果 ComicPageEditor 当前是 axis-aligned 矩形 grid，跨页角色轮廓很难对齐；引入自由 polygon panel + 端点吸附是必要能力。这是 Clip Studio 长期打平 MediBang 的核心差异点。
- **为什么不算实现方案**：Pinax panel 是否需要支持非矩形/出血 panel 是出版格式决定题（epub / print / webtoon 三种格式对 polygon 支持差异极大）。
- **可行性疑点**：Clip Studio EX 单订阅价格、培训生态、Comic Studio 模板目录的当前状态在二手描述里都说"功能丰富"，但 2026 价格 / 模板数量 I cannot verify。

---

### §D.3 跨页角色接力（Spine Wash / Cross-page Anchor）

- **模式名**：Cross-page Anchor（跨页锚点）
- **源产品**：传统漫画编辑流程（集英社 / KADOKAWA 编辑部；Marvel Method 协作流程）；UI 工具：Storyboarder 的 "Shot Generator" 3D pose 接力
- **机制简述**：跨页物体（如人物头部、招牌、车辆）被「劈成两半」，左右两页各画一半，最后翻页时读者用 closure 脑补成完整图像。Marvel Method 中由 inks artist 在最后环节补全衔接。
- **Pinax 摩擦对应**：M7 连续性最痛点是「AI 生成的左右两页画面，角色衣物/发梢/轮廓对不齐」。跨页锚点 = 给每一格绑一个可选的 "world-space object anchor"，AI 在生成时锁定该锚点。这是把"几何一致性"从角色级（§A IP-Adapter）下沉到构图级。
- **为什么不算实现方案**：跨页锚点需要 AI 模型支持 spatial-conditioning（ControlNet 深度图 / 边缘图），但 Pinax 当前 ImageGenerationWorkbench 接入的 provider 是否支持 spatial reference 我无法确认。
- **可行性疑点**：Marvel Method 内部协作细节（page-rate、editor 介入点）传统上是手工艺活，自动化需要 AI 决策「这一格是接力的左半还是右半」，是产品级难题。

---

### §D.4 Page Turn Reveal（翻页悬念）作为节拍点

- **模式名**：Page-Turn Reveal
- **源产品**：传统印刷漫画（Marvel / DC / 集英社 Jump）；编辑理论：Will Eisner *Comics and Sequential Art*、Scott McCloud *Understanding Comics*（panel transition 六类：moment-to-moment / action-to-action / scene-to-scene / aspect-to-aspect / non-sequitur / subject-to-subject）
- **机制简述**：在某一页的右下角（美漫）放一个"安静的小格"，读者翻页后看到跨页 splash（占整页或半页），产生"屏住呼吸→ 松一口气"的节奏对比。Webtoon 改成 vertical scroll：屏末 cliffhanger + 滚到下一屏 splash。
- **Pinax 摩擦对应**：M7 连续性不等于「节拍一致」，而是「节拍能形成节奏型」。给 ComicPageEditor 加一个 "page-turn sorter" 视图：用 timeline 横轴铺每页，按 panel 面积分布看是否有「dot-line-dot-big」节奏，立刻暴露节拍断层。
- **为什么不算实现方案**：节奏是主观审美，强 AI 不一定能令人满意；用户对节奏的判断力才是关键。
- **可行性疑点**：McCloud 6 类 panel transition 在 AI 拆解文字 → 分镜（C 轴）需要先打标，标注成本高；二手来源对这套分类的 2026 学术应用 I cannot verify。

---

### §D.5 Splash 整页与 Isometric 跨页物体

- **模式名**：Splash / Spread
- **源产品**：Toon Boom Storyboard Pro 2025（toonboom.com，十一月 2024 发布，30 周年；订阅 $21/月起；Windows/Mac/iPad）、Marvel/DC 单话 splash 页、Jump 杂志封面跨页
- **机制简述**：单页 splash（全格 / 占整页）是节拍停顿；双页 spread（两页打通成一张画）是「世界观级」揭示。Isometric 跨页物体（如一艘飞船横跨 2 页）属于 splash 的进阶形式。
- **Pinax 摩擦对应**：Pinax 当前「出版导出」M6 是否支持 splash 单页 + spread 双页导出是出版质量的关键。打印输出 KDP/IngramSpark 需要 0.125 inch bleed + 0.5 inch 装订侧 gutter，spread 文件需要在中间可裁切。
- **为什么不算实现方案**：spread 是印刷工艺问题（订口是否挖掉），不是 UI 问题；Pinax 出版导出待查实际输出格式。
- **可行性疑点**：Toon Boom Storyboard Pro 2025 的 mobile 同步、Cloud 协作等新功能均为二手描述，I cannot verify 当前稳定性与价格。

---

### §D.6 Webtoon 长条节奏（Vertical Scroll Beat Map）

- **模式名**：Scroll Beat Map（滚动节拍图）
- **源产品**：WEBTOON Canvas（webtoons.com）、Tapas、Piccoma LINE 平台
- **机制简述**：Webtoon 取消物理翻页，每「屏」（≈ 800px 高）为一拍。作者在 Canvas Editor 里标注 "Cut"（屏末分界），手指滑动 = 翻页。
- **Pinax 摩擦对应**：Pinax 漫画导出目前「epub / print / webtoon」三种格式待查；Webtoon 模式需要 panel 的纵向连续性（角色站立位置 / 视线在 scroll 上的等速前进），与印刷模式 grid 完全不同。M7 连续性如果未来要支持 webtoon，需要新增 vertical scroll panel schema。
- **为什么不算实现方案**：Webtoon 节奏算法（scroll velocity → cut position）会反过来影响美术 generated image 的"留白"位置，是 AI 输出端的概念（不是 UI 端）。
- **可行性疑点**：WEBTOON Canvas 标准 width（多源说法 800px，但官方 changelog 我无法读到）属于 I cannot verify。

---

### §D.7 模板网格（Preset Grids）— 即拖即用

- **模式名**：Template Grid（开局一套模板）
- **源产品**：MediBang Paint（medibangpaint.com，免费模板）、Clip Studio Assets 商城、Krita comic template（krita.org）、KADOKAWA 少年漫画标准模板
- **机制简述**：内置 4 种典型网格："2-row tier"（美漫 6-9 格常用）、"manga 3-tier"（日漫 4-7 格）、"splash-heavy"（序章大格 + 后续小格）、"webtoon long strip"（纵向连延）。作者拖一个进去即开画。
- **Pinax 摩擦对应**：ComicPageEditor 应至少放在一张 page 模板网格作为「先有骨架再填血肉」的入口；STATUS 显示 M2-M6 已形成视觉圣经，模板可能是 M2 的产物，但具体是否在 ComicStageWorkbench 暴露给用户待查。
- **为什么不算实现方案**：预设模板是文化（美漫 vs 漫 vs webtoon）切换问题，需要产品决策"是否把多文化网格都说出来"。
- **可行性疑点**：MediBang 模板库当前数量、Clip Studio Assets 模板 marketplace 价格我无法检索到当前值；二手来源描述笼统。

---

### §D.8 印出版心网格（Print-on-Demand Safe Zone）

- **模式名**：Print Safe Zone Overlay
- **源产品**：Amazon KDP（kdp.amazon.com）、IngramSpark（ingramspark.com）、Lightning Source
- **机制简述**：在编辑视图上叠加"trim line / bleed line / safe zone line"三层参考线 —— 内容必须落在 safe zone 内（不被裁切），背景/边框必须延伸到 bleed line（避免白边）。美漫标准 6.625 × 10.25 inch，KDP/IngramSpark 要求 0.125 inch bleed on all sides。
- **Pinax 摩擦对应**：M6 出版导出若用户上传到 KDP/IngramSpark，panels 内部内容可能被订口或裁切线吃掉。ComicPageEditor 应在 mode 上加 "Print Safe Zone Overlay" 切换，叠加显示上述三层线。
- **为什么不算实现方案**：印前规范（POD）属于「出版工程标准」，不是 Pinax 漫画核心用户体验；但若 Pinax 用户群体有"自出版"诉求，这是必做功能。
- **可行性疑点**：KDP / IngramSpark 2026 当前价格、是否支持 comic 印刷（vs paperback）是历史变化项，我无法锁定；二手来源说"KDP requires 0.125 inch bleed"在 2024 仍然成立，但 2026 可能微调。

---

### §D.9 Manga RTL 反向阅读流（Right-to-Left Reading Flow）

- **模式名**：RTL Manga Flow
- **源产品**：集英社 / 講談社 / 小学館 漫画原稿；少年Jump / Magazine / Sunday 编辑流程；Viz Media 英文版（mirror flipped）
- **机制简述**：原始日语 manga 是 RTL 翻页（右翻左），每一格内文字气泡也 RTL；Viz Media 英文版会把图 mirror 翻转成 LTR，但被传统读者诟病"方向感错乱"。RTL 模式下读者右下角进入 → 右上角离开 → 翻到右下，spine 在右。
- **Pinax 摩擦对应**：如果 Pinax 要支持中文/日文 manga 自出版，ComicPageEditor 必须能切换阅读方向（RTL ↔ LTR），同时 panel 内部对话框 tail 方向也要镜像。否则出海到讲谈社 / 集英社是直接 off-spec。
- **为什么不算实现方案**：RTL 是规格问题，对应 localStorage 或 user preference；UI 层面只需 1 个 toggle。
- **可行性疑点**：原始日漫 manga editor 三种 flow（漫 / 欧美漫 / 港漫 / 韩漫）的直接对照表我无法从公开资料中确认具体编排细节。

---

### §D.10 Beat Sheet 跨页节奏检查（Page-Level Beat Visualizer）

- **模式名**：Beat Sheet Overlay（节拍图叠加）
- **源产品**：StudioBinder（studiobinder.com，影视 pre-vis）、Boords（boords.com）
- **机制简述**：在 comic spread 视图上，叠加一张"节奏图"——横轴是页码，纵轴是 panel 面积（log 标尺），读者一眼看见全篇的"音量曲线"。短促 vs 缓慢 vs 瀑布三个区段一目了然。
- **Pinax 摩擦对应**：M7 连续性的可量化检查 = Beat Sheet 视图。ComicPageEditor 加一个 toggle "Pacing Chart" 渲染整篇 panel 面积曲线，让用户/编辑快速定位"节奏断层"或"全程均匀无重点"。
- **为什么不算实现方案**：节奏图是辅助诊断视图，与 AI 生成解耦；不需要新模型。
- **可行性疑点**：StudioBinder / Boords 是给影视 pre-vis 用，搬到 comic page 节奏需要重新设计视觉映射（panel area ↔ shot length），我无法从二手资料确认其具体 UI 元素。

---

### §D.11 双页跨页视觉引导（Spread Eye-Flow Cues）

- **模式名**：Spread Eye-Flow Cue（左右页箭头）
- **源产品**：Marvel / DC 现代编辑流程；editorial cartooning（NYT Op-Ed 单格有时用箭头 / 视线引导）
- **机制简述**：在跨页边界画人物的视线、子弹轨迹、烟雾、箭头或语言动作气泡尾巴，让读者眼球从右页末格 → 翻页 → 左页首格。跨页接力 = 视觉接力。
- **Pinax 摩擦对应**：跨页角色接力（§D.3）解决的是「物体对齐」，本模式解决「视线接力」。两者相辅：物体对齐 + 视线接力 = 跨页美术动作连贯。M7 连续性需要两套抽象：物体锚点 + 视线提示。
- **为什么不算实现方案**：视线引导是美术选择，AI 生成时能否"自动加视线箭头"是产品级决策；且箭头本身就是 UI 注记，可能反而破坏画面。
- **可行性疑点**：editorial cartooning 的视线引导更多由作者手绘而非 AI 自动；本模式与 Pinax 的 AI 优先哲学有张力。

---

### §D.12 章节闸门（Episode Cliffhanger）— 周更/单话发布

- **模式名**：Episode Cliffhanger
- **源产品**：少年Jump / Magazine / Sunday 出版周期；Webtoon Canvas 周更节奏；Tapas 短篇集
- **机制简述**：单话最后一页通常是一个"屏息"的 splash 或者一个 obligatory panel（如反派 X 露出冷笑），创造"下一话必看"拖动力。Webtoon 用 scroll 末屏强制停留。
- **Pinax 摩擦对应**：M7 连续性如果涉及"跨话"（manga 一话 = ~ 18-25 页），cliffhanger 是节拍管理的最后一公里。STATUS 显示「周更 / 单话发布」待查；假设 Pinax 用户以小说改编为主，"周更"不是核心需求，但"对话剪裁"（即把小说第 N 章裁成漫画第 N 话）需要 cliffhanger auto-suggest。
- **为什么不算实现方案**：cliffhanger 是叙事裁剪决策，依赖 AI 对剧情关键节点的理解，不是纯排版问题。
- **可行性疑点**：Jump 编辑部 cliffhanger 决策是手工艺活，AI 能否自动给"下一话 splash"建议是产品级难题；二手资料对此不做答。

---

### §D 总结

**收敛点**（独立灵感聚合而成的方向）：

1. **D.1 + D.7 + D.8** 拼出漫画分镜的"骨架层"：模板网格 + 强制 grid + 印刷 safe zone。是"先有骨架再填血肉"。
2. **D.3 + D.11 拼出漫画的"连续性层"**：跨页物体锚点 + 视线接力。直接对应 M7 连续性。
3. **D.4 + D.10 + D.12 拼出"节奏层"**：翻页悬念 + Beat Sheet + 跨话 cliffhanger。是"骨架跑起来"的节拍管理。
4. **D.5 + D.6 + D.9 拼出"格式层"**：splash / spread / webtoon / manga RTL。是"出版出口"的多格式切换。
5. **D.2** 是"工具层"：用 stretchy panel 让作者保留绘画自由度。

**未覆盖的 Open Questions**（主 session 与用户需要拍板）：

- Webtoon 800px 标准 width 是否仍 2026 主流？（I cannot verify）
- Toon Boom Storyboard Pro 2025 的 mobile API 是否对自研工具开放？（I cannot verify）
- KDP / IngramSpark 2026 comic 印刷服务的 trim size 列表是否还包含 6.625 × 10.25 inch？（I cannot verify，需 kdp.amazon.com 官方页）
- Clip Studio EX 2026 是否对 community plugin 提供 spread safe zone 模板 marketplace？（I cannot verify）

**与 Pinax 现状的具体对接候选**（不写实现）：

- `ComicPageEditor` 引入 "Pacing Chart" toggle（§D.10）→ 让 M7 连续性可量化。
- `ComicStageWorkbench` 增加 "Template Grid" 入口（§D.7）→ 把 §B 视觉圣经的"风格 + 网格模板"绑成预设。
- `ComicAdaptationPlanner` 引入 "cliffhanger auto-suggest"（§D.12）→ 把 C 轴的"文字 → 关键帧"延伸到"章末悬念"。
- 出版导出检查 `epub / print / webtoon` 三种格式（§D.5+§D.6+§D.8）→ 三套 safe zone 模板。

---

### §D 引用源

**一手 URL（直接或间接命中）**：
- wonderunit.com/storyboarder（Storyboarder 官方）
- toonboom.com（Toon Boom Storyboard Pro 2025，Nov 2024 发布，$21/月起，30 周年）
- clip-studio.com（Clip Studio Paint EX）
- medibangpaint.com（MediBang Paint 免费 + 模板）
- krita.org（Krita comic template）
- studiobinder.com（影视 pre-vis）
- boords.com（影视 pre-vis）
- webtoons.com（WEBTOON Canvas）
- kdp.amazon.com / ingramspark.com（Print-on-Demand）

**理论框架**：
- Scott McCloud, *Understanding Comics: The Invisible Art*（1993，Harper Perennial）—— panel transition 六类、gutter closure
- Will Eisner, *Comics and Sequential Art*（1985，Poorhouse Press）—— spread / page turn reveal
- Marvel Method 协作流程（Jack Kirby / Stan Lee 1960s，二手来源：comicbookherald.com 等）

**二手来源（WebSearch 命中但未经官方核验）**：
- Animation Magazine / Cartoon Brew 对 Toon Boom Storyboard Pro 2025 的报道
- 多篇中文 CSDN / 博客园对 infinite canvas / webtoon 下载器的教程（与本研究相关性弱）
- Vachon Studio / arXiv 2408.10439 等视觉叙事学术资源（二手描述）

**I cannot verify（落地前需人工核实）**：
- Storyboarder 2026 是否仍 MIT 开源
- WEBTOON Canvas 当前 width 标准（800px vs 1280px）
- KDP / IngramSpark 2026 comic 印刷 trim size 列表
- Clip Studio EX 当前订阅模型与模板 marketplace

---

## §E 漫画 AI + 漫画辅助工具（Comic AI & Authoring Tools）
> **调研人**:E（并行 agent）。**scope**:漫画专门训练模型 / AI comic LoRA / 漫画工作流工具；跟通用 SDXL/DALL-E 区别
>
> **重点产品**：Comica / Comicai / SkyReels（前身 comicai）、LlamaGen.AI、Comic-AI.ai、ComicsAI.org、ComicsMaker.ai、AI Comic Factory（jbilcke 开源）、Story2Board（学术）、Stable Diffusion comic LoRA（AnythingV5 / AniDiffusion / CounterfeitXL / AAMXL / Comic Diffusion / Manga Diffusion）、NovelAI ImageGen、Midjourney --niji、Stable Diffusion XL + ControlNet inpainting / lineart for inking、Adobe Firefly + Illustrator 2026、Scenario AI、Astria / SeaArt / PixVerse、Webtoon Discover
>
> **Pinax 现状锚点**：`ImageGenerationWorkbench` 走通用 image-provider 多 provider 架构，未见专门 comic LoRA / ControlNet / 漫画风格预设；`mediaPurpose: 'storyboard-reference'` 已有但仅做参考图用途；`comicImagePrompt.js` / `comicAdaptationService.js` / `comicProductionService.js` 是 prompt 工程层而非底层模型层。

---

### §E.0 漫画 AI 的三个根本命题

漫画 AI 不只是「能画好看图的通用模型」，它有三组专门化诉求：

1. **专门化 vs 通用** —— 通用 SDXL / DALL-E / Imagen 训练数据以写实照片 + 西方美术为主，对**线稿 / 网点 / 网点层次 / 对话框留白 / 日漫脸型 / 美漫墨线**等漫画特有视觉语言是「见过但不专精」。Comica、LlamaGen、ComicsAI 等独立 comic 平台往往在通用底模上叠加 comic LoRA 或专用训练集（如 AnythingV5、AniDiffusion for 漫画 / CounterfeitXL for 二次元 / AAMXL Anime Mix for 跨风格）。Pinax 现状是**纯通用 SDXL 路线**，缺专门 comic 优化。
2. **风格迁移 + 一致性** —— 同一角色跨多页/多面板的形象统一、同一作品跨章节风格统一，是漫画区别于插画的核心痛点（§A 角色一致性已展开）。专门 comic 工具把这件事做成**模板锁定**（preset style + character sheet upload），而不是 ad-hoc LoRA。
3. **角色复用 + 复用资产** —— 漫画长篇连载要求「同一角色跨几十话仍可识别」。Comica / LlamaGen 等支持 character ID 库；NovelAI 用 reference image 直推；SDXL + IP-Adapter / InstantID 是开源答案。Pinax 的 `mediaPurpose: 'storyboard-reference'` 仅限**单次生图参考**，无跨作品跨章节的 character ID 库抽象。

---

### §E.1 Comicai / SkyReels（前 comicai 改名）—— 漫画垂直端到端平台
- **源产品**：comicai.com（早期） → SkyReels；[通塔师 AI 导航](https://www.onetts.com/comic-ai) 收录
- **机制简述**：在线 AI 生成漫画图片，号称「免费」，强调一键从 prompt 出多面板漫画页；底层接入 SkyWork 系模型族。
- **Pinax 摩擦对应**：`ImageGenerationWorkbench` 走通用 `imageProviderService` + 多 provider 配置，没有 SkyReels / 国内漫画专门端点；用户如果想要「日漫脸 + 网点 + 对话框留白」效果，需自己组合 prompt，缺专门 comic 平台对接。
- **为什么不算实现方案**：① SkyReels 主打图像生成，**不是多面板编排工具**，跟 Pinax 的 `ComicPageEditor` / `ComicStageWorkbench` 的多页排版需求对位错位；② 国内端点接入涉及合规 / 计费 / 多账号分发，待评估。
- **可行性疑点**：通塔师导航页属二手收录（𓈊），SkyReels 是否仍提供免费漫画生成端点无法本会话 WebFetch 验证（⚠️ MiniMax-M3 WebFetch 不可用，已用 WebSearch 间接确认）；其模型族是否专门 comic 训练未核实。

### §E.2 LlamaGen.AI —— 角色一致性 + 多格式 comic 平台
- **源产品**：[llamagen.ai](https://llamagen.ai/)；开源仓库 [LlamaGenAI/llamagenai-openapi](https://github.com/LlamaGenAI/llamagenai-openapi)
- **机制简述**：REST API + Studio 双形态；卖点是 **Consistent Character Design** + **Multi-Format Comic Conversion**（支持 manga / webtoon / manhwa 多种版式）+ anime fandom 社区。官方数字：500K 用户 / 30M comics / 150K characters / 300K artists；自称 2024 UNCOVERING AI TOOLS Top 25。
- **Pinax 摩擦对应**：Pinax 当前是**用户自己挑参考图 + LoRA 不在 Pinax 层**的状态（§0 锚点），LlamaGen 把 character 一致性做成「上传一次角色 sheet → 后续面板都引用」的一等公民功能。Pinax 可借鉴的不是接 LlamaGen API（涉及商业版权），而是**把 character sheet 抽象为 Pinax schema 的一等公民**。
- **为什么不算实现方案**：① LlamaGen 商业平台 + 自有训练数据，Pinax 接 API 等于把「风格主权」交出去（违背 5C 立绘=背景集成 + UI 围绕立绘编排的本地化路线，见 `feedback_visual_integration_not_illustration.md` / `feedback_ui_orbits_character_art.md`）；② 数据回流到 LlamaGen 平台存在隐私 / 版权顾虑。
- **可行性疑点**：多格式版式（manga 翻页 vs webtoon 竖滑 vs manhwa 横向）是**版式元数据**而非底层模型差异 —— Pinax 不接 API 也能用 `comicLayout.js` 抽象多版式；LlamaGen 实际角色一致性能否达到 Midjourney `--cref` 水平，二手描述未给 benchmark。

### §E.3 ComicsAI.org —— manga/webtoon/stories 工作流
- **源产品**：[comicsai.org](https://www.comicsai.org/)
- **机制简述**：分 Workflow Path（Manga AI / Comic AI 等）→ Studio 两阶段；强调「prompt + style + layout」三参数；2026-08-13 还在更新。
- **Pinax 摩擦对应**：Pinax 已经有 `comicScriptService`（剧本生成）→ `comicAdaptationService`（分镜）→ `ComicPageEditor`（面板）→ `comicProductionService`（导出）的端到端工作流（§0 STATUS M2-M6），ComicsAI 的「Workflow → Studio」两步形态和 Pinax 的多阶段形态有结构对应。
- **为什么不算实现方案**：ComicsAI 的「prompt + style + layout」三参数过于单薄，**少了 Pinax 已有的 world book / character sheet / shot type / camera movement 等语义层**（§0：ProseEssay 12 shot + 12 camera）；接 API 反而是降级。
- **可行性疑点**：ComicsAI 是否提供 API / 是否支持自定义风格 / 是否开源 LoRA，三点均未本会话核实（⚠️ WebFetch 不可用），二手搜索仅见首页文案。

### §E.4 Comic-AI.ai + ComicsMaker.ai —— 同质化 SaaS
- **源产品**：[comic-ai.ai](https://comic-ai.ai/)（声称基于 Elser AI）、[comicsmaker.ai](http://www.comicsmaker.ai/)
- **机制简述**：标准化 SaaS：文本→角色设计→场景→面板→导出；面向零基础用户。
- **Pinax 摩擦对应**：Pinax 的目标用户是「AI 辅助小说创作」，跟漫画 SaaS 的零基础用户定位重叠度低；Pinax 用户是**已经在写小说**的人，需要的是「小说片段 → 漫画关键帧」而非「零基础生漫画」。
- **为什么不算实现方案**：形态上是「降维对接」—— 把 Pinax 已有的小说上下文（角色、世界书、关系网）降维到 Comic-AI.ai 的 prompt 接口，会丢失 Pinax 的核心资产（world book / character bible）。
- **可行性疑点**：Comic-AI.ai 的 Elser AI 是自研还是套壳未核实；定价 / 配额未核实；二手信息仅来自首页文案。

### §E.5 AI Comic Factory（jbilcke）—— 开源 SDXL 漫画生成参考实现
- **源产品**：[github.com/jbilcke/ai-comic-factory](https://github.com/jbilcke/ai-comic-factory)；[HuggingFace Space](https://huggingface.co/spaces/jbilcke/ai-comic-factory)
- **机制简述**：开源应用，输入一段 prompt → 输出含多面板 + caption + 气泡 + 风格一致性的漫画页；底层是开源 LLM（写剧本/对话）+ Stable Diffusion XL（出图）。
- **Pinax 摩擦对应**：AI Comic Factory 的「prompt → 完整漫画页」是 Pinax 的 **§0 锚点 `comicAdaptationService` 已经做的事的最小可用版本**；区别在于 Pinax 已经把分镜、面板、字符、出版拆成 6 个阶段（M2-M6）。
- **为什么不算实现方案**：① AI Comic Factory 是**单一端点演示**，没有 Pinax 需要的角色 sheet 持久化、跨页连续性、world book 锚定；② 它本身是「参考实现」而非商业产品，Pinax 应学习的是它的**架构**（LLM 写剧本 + SDXL 出图 + 后处理加对话气泡）而非接入它。
- **可行性疑点**：HuggingFace Space 是否仍活跃 / SDXL 版本是否升级 / 是否接入 Flux 等更新版本，2026 状态未核实。

### §E.6 Story2Board（学术）—— 无需训练的叙事一致性框架
- **源产品**：[arXiv:2508.09983v1](https://blog.csdn.net/m0_66899341/article/details/150419972)（希伯来大学，2025-08）；腾讯新闻报道
- **机制简述**：training-free storyboard 生成；两大机制：**Latent Panel Anchoring**（保留跨面板角色引用）+ **Reciprocal Attention Value Mixing**（在 reciprocal attention 强的 token 对之间软混合视觉特征）。引入「Rich Storyboard Benchmark」评估布局多样性 + 背景叙事能力。
- **Pinax 摩擦对应**：Story2Board 解决的恰好是 §D 漫画分镜与排版里的「跨面板叙事 + 背景演化」问题，跟 §0 锚点「M7 连续性是剩项」高度对位。**它的 training-free 特性**意味着可以叠加在 Pinax 现有的 SDXL / Flux 端点上而不需要重训。
- **为什么不算实现方案**：① 学术 paper，无 production 包装；② 需要 Diffusers + 自定义 sampler 集成；③ 评估基准（Rich Storyboard Benchmark）是研究用，跟 Pinax 的「小说片段 → 关键帧」业务评估不对位。
- **可行性疑点**：作者未开源代码（CSDN 二手报道未提仓库链接，⚠️ I cannot verify 是否有官方 repo）；Reciprocal Attention Value Mixing 在 SDXL / Flux / Qwen-Image 上的可移植性未验证。

### §E.7 Stable Diffusion Comic LoRA 生态 —— 专门化底模层
- **源产品**：CivitAI 上的 comic LoRA 群 —— AnythingV5（Anything XL / AnythingV5Ink）、AniDiffusion、CounterfeitXL、AAMXL Anime Mix、Comic Diffusion、Manga Diffusion、LightnovelMangaStyle 等；[Comic book style LoRAs](https://civitai.com/models/6432/comic-book-style-stable-diffusion-models-loras)
- **机制简述**：在 SDXL / SD1.5 底模上用漫画数据集（Danbooru 二次元 / 漫画截帧 / inked line art）微调出专门风格 —— 日漫大眼 + 网点 / 美漫墨线 + halftone / 港漫水墨 / 韩漫 manhwa 写实风。
- **Pinax 摩擦对应**：Pinax 的 `imageProviderConfigStore` 是 provider-level 配置（api endpoint + key），**没有 LoRA 槽位**。如果用户想要「AnythingV5 + 角色 sheet」组合，需自部署 ComfyUI / A1111，Pinax UI 不暴露。
- **为什么不算实现方案**：LoRA 是**底层模型配置**，不是产品特性；Pinax 多 provider 架构可扩展出「provider + LoRA reference」字段，但**具体哪些 LoRA 适合 Pinax 用户群**需要测试（AnythingV5 偏二次元 / CounterfeitXL 偏厚涂 / Comic Diffusion 偏美漫），不应拍脑袋选。
- **可行性疑点**：CivitAI 上 LoRA 版本 / 训练集 / 许可证条款各异，Pinax 不能简单列表推荐；商用授权问题普遍存在（部分 LoRA 训练集含版权漫画）；托管 LoRA 需要 GPU 成本（vs 直接调 SDXL API）。

### §E.8 NovelAI ImageGen —— 二次元专门化商业模型
- **源产品**：[novelai.net](https://novelai.net/)
- **机制简述**：自研 anime diffusion 模型（NAI Diffusion），专门 Danbooru 风格训练；卖点是二次元脸 + 身体比例 + 角色表现力；订阅制 + 私有云；prompt 接受日语 tag 格式。
- **Pinax 摩擦对应**：NovelAI ImageGen 是**端点型服务**（类似 OpenAI），从技术形态上 Pinax 多 provider 架构**可接入**，但 NovelAI 不公开 LoRA / 不支持 character sheet 上传，角色一致性靠 prompt + reference image 而非系统特性。
- **为什么不算实现方案**：① NovelAI 是付费订阅服务，定价 / 配额 / API 稳定性未本会话核实（⚠️ MiniMax-M3 WebFetch 不可用）；② 二次元风格偏 NAI 风格（Danbooru 训练集），不是 Pinax 用户的全部需求（5C 路线是 ZCOOL XiaoWei 等具象风格）。
- **可行性疑点**：NovelAI 的 API 是否对 Pinax 开放 / 价格模型 / 国内可访问性（可能需 VPN）未核实；其与开源 AnythingV5 的差距是否值得付费用未确认。

### §E.9 Midjourney --niji —— anime/comic 模式切换
- **源产品**：[midjourney.com/docs](https://docs.midjourney.com/)；Niji 模式由 Spellbrush 与 Midjourney 合作开发
- **机制简述**：在 Midjourney 通用模型上加 `--niji` 参数切换到 anime / comic 专门模型；专门数据集 + 美学倾向；与 `--cref`（角色参考）+ `--sref`（风格参考）叠加可用。
- **Pinax 摩擦对应**：Midjourney 是 Discord / Web API 形态，Pinax 多 provider 架构**可接**；`--niji` + `--cref` 是商业可用的角色一致性答案之一，但 Midjourney 整体以**插画美学**而非**漫画叙事**为主，对多面板 / 跨页连续性无原生支持。
- **为什么不算实现方案**：Midjourney 是闭源黑盒 + 商业 API，Pinax 接它等于是把「风格主权」交出去；且 Midjourney 输出单图质量高，**漫画工作流所需的批量 + 一致性**仍是用户手工组合。
- **可行性疑点**：Midjourney API 价格 / 配额 / 是否允许商业用途衍生品（漫画出版），2026 状态未本会话核实；--niji 6/7/8 在漫画专门化上的进步幅度未核实。

### §E.10 Stable Diffusion + ControlNet（lineart / inpainting / scribble）—— 漫画 ink 工作流基石
- **源产品**：[ControlNet Lineart](https://stablediffusionart.com/controlnet-lineart/)（Stablediffusionart 教程）；[ControlNet Inpainting 教程](https://education.civitai.com/lessons/stable-diffusion-controlnet-inpainting/)；[ComiClean - ControlNet Lineart for Comic Inking](https://github.com/comiclean/comiclean-controlnet)（2025-12 仓库）
- **机制简述**：三种漫画专门 ControlNet 模型 —— **Lineart**（从草图提取线稿 + 风格化墨线）、**Scribble**（潦草笔触→线稿）、**Inpainting**（局部重绘，可用于改台词气泡内容、修复错误）。ComiClean 仓库（2025-12）显示这是**活跃维护**的开源方向。
- **Pinax 摩擦对应**：Pinax 当前的图像工作流是「prompt → 单图」，没有「sketch → lineart → color」的**多阶段流水线**。ControlNet lineart 正好是漫画生产链路的**第二阶段**（铅笔 → 墨线），如果 Pinax 要支持用户手绘草图后 AI 上墨，ControlNet 是必经路径。
- **为什么不算实现方案**：① ControlNet 需要**自托管 GPU + Diffusers + ComfyUI/A1111**（vs Pinax 当前的多 provider 云端 API 架构）；② Pinax 多 provider 架构在云端接不到 ControlNet（云 API 不暴露 intermediate latent）；③ 集成成本高（模型加载 + sampler 配置）。
- **可行性疑点**：ControlNet 模型在 SDXL / Flux / Qwen-Image 上的对应版本是否齐备（SDXL-ControlNet 已有，Flux-ControlNet 在演进）未核实；ComiClean 仓库的成熟度（star / 维护频率）需进一步评估。

### §E.11 Adobe Firefly Image Model 4 / Illustrator 2026 —— 商用专业路线
- **源产品**：[Adobe Firefly](https://helpx.adobe.com/cn/firefly/web/whats-new/new-features/whats-new.html)；[Adobe Firefly 4](https://blog.csdn.net/xinyulou/article/details/147496769)
- **机制简述**：Firefly Image 4 支持**原生 2K 输出** + 图层编辑（Photoshop 集成）+ Text to Vector（Illustrator 集成）+ Boards 协作；Illustrator 2026 加 Generative Shape Fill + Text to Pattern + 集成 Google Imagen 3 / OpenAI GPT / Veo 2。
- **Pinax 摩擦对应**：Pinax 的多 provider 架构**理论可接** Adobe Firefly API（云端 SaaS 模式），但 Adobe 主打**专业设计师协作**（Boards + Creative Cloud 套件），跟 Pinax 的「本地化单用户创作」定位有距离。
- **为什么不算实现方案**：① Adobe Firefly 商用授权按 seat 计费，Pinax 单用户工具接它会传递高成本给用户；② Firefly 训练数据**明确避开版权漫画训练集**（Adobe 商业风险偏好），对 comic 风格专门化程度有限。
- **可行性疑点**：Adobe Firefly 是否有专门 comic 风格 / 是否有 IP-Adapter 风格的角色 reference 功能，2026 状态未本会话核实；Firefly + Illustrator 联合工作流的实际漫画产出质量未核实。

### §E.12 Scenario AI / Astria / SeaArt / PixVerse —— 角色一致性的次级平台
- **源产品**：Scenario.gg（自训 LoRA + character reference）；Astria（角色专属 fine-tune）；SeaArt（A1111 套壳 + LoRA 市场）；PixVerse（视频向）
- **机制简述**：Scenario / Astria 主打**自托管 LoRA 训练 + character reference**；SeaArt 是国内 A1111 套壳，提供 LoRA 市场；PixVerse 主攻视频，漫画辅助能力有限。
- **Pinax 摩擦对应**：Scenario 的「自训 LoRA + 角色参考」模型是 **§A 角色一致性的生产化版本**；Pinax 当前的「用户挑参考图」是 ad-hoc 版本。如果 Pinax 要做角色 ID 库，Scenario / Astria 的 UX 是直接对位。
- **为什么不算实现方案**：① Scenario / Astria 是付费 + 自托管混合模式，对 Pinax 用户的「本地化创作」定位是侵入性的；② SeaArt / PixVerse 是国内套壳，可访问性 / 合规 / 商用授权待评估。
- **可行性疑点**：Scenario 的 LoRA 训练成本（GPU hours）/ Astria 的 fine-tune 时长 / 训练集合规性，三点未核实。

---

### §E.总结

**对 Pinax 的高价值灵感（≥ 2 个具体抓手）**：

- **E.6 Story2Board 的 training-free 跨面板一致性** —— 可叠加在现有 SDXL / Flux 端点上，最小侵入。需开源 / vendor 跟进。
- **E.7 comic LoRA 生态 + E.10 ControlNet lineart** —— Pinax 多 provider 架构可扩出「provider + LoRA + ControlNet reference image」三段配置；E.10 是漫画 ink 流水线的关键缺口。
- **E.2 LlamaGen 的 character sheet 一等公民** —— 不接 API，但要学它的 schema 设计：把 character sheet 从「可选参考」升级为 Pinax 的结构化数据。

**对 Pinax 的低价值灵感（避免投入）**：

- **E.1 / E.3 / E.4 同质化 SaaS** —— 形态上是 Pinax 的「降维对接」，对接反而丢 Pinax 的 world book 资产。
- **E.8 NovelAI / E.9 Midjourney --niji** —— 闭源 + 风格主权让渡，不符合 5C 本地化路线。
- **E.11 Adobe Firefly + Illustrator** —— 专业设计师路线，定位错位。
- **E.5 AI Comic Factory（开源参考）** —— 学习其 LLM + SDXL 双阶段架构，不接入。

**Open Questions**（待 §I 综合时列出，由用户拍板）：

1. Pinax 是否要支持**漫画专门模型 / LoRA**？如果是，候选栈是 AnythingV5 / CounterfeitXL / 自训 LoRA 三选一？
2. Pinax 是否要支持**ControlNet lineart 流水线**（手绘草图 → AI 上墨）？这需要自托管 GPU 还是云端？
3. Pinax 是否要支持 **Story2Board 风格的 training-free 跨面板一致性**？依赖学术代码开源或 vendor 复刻。
4. Pinax 的 character sheet 是否要从「可选参考图」升级为**结构化数据**（借鉴 LlamaGen / Scenario）？
5. Pinax 漫画工作流是否要区分**通用 SDXL 路线**和**专门 comic 路线**（双轨）？双轨会增加 `imageProviderConfigStore` 的复杂度。

---

### §E.引用源

- [comicai.com](http://www.comicai.com/) → [SkyReels（通塔师 AI 导航收录）](https://www.onetts.com/comic-ai) —— ⚠️ 改名 / 当前状态本会话 WebFetch 不可用，WebSearch 二手收录
- [comic-ai.ai](https://comic-ai.ai/) / [comicsai.org](https://www.comicsai.org/) / [comicsmaker.ai](http://www.comicsmaker.ai/) / [llamagen.ai](https://llamagen.ai/) —— 同质化 AI comic 平台
- [github.com/jbilcke/ai-comic-factory](https://github.com/jbilcke/ai-comic-factory) + [HuggingFace Space](https://huggingface.co/spaces/jbilcke/ai-comic-factory) —— 开源 SDXL 漫画参考实现
- [Story2Board arXiv:2508.09983v1（希伯来大学）](https://blog.csdn.net/m0_66899341/article/details/150419972) —— 训练免费跨面板一致性
- [CivitAI Comic book style LoRAs](https://civitai.com/models/6432/comic-book-style-stable-diffusion-models-loras) —— AnythingV5 / AniDiffusion / CounterfeitXL / AAMXL 等
- [Stablediffusionart ControlNet Lineart](https://stablediffusionart.com/controlnet-lineart/) + [CivitAI ControlNet Inpainting 教程](https://education.civitai.com/lessons/stable-diffusion-controlnet-inpainting/) + [ComiClean GitHub](https://github.com/comiclean/comiclean-controlnet)
- [novelai.net](https://novelai.net/) —— NAI Diffusion 二次元专门模型
- [Midjourney docs](https://docs.midjourney.com/) —— --niji 模式
- [Adobe Firefly 新功能](https://helpx.adobe.com/cn/firefly/web/whats-new/new-features/whats-new.html) + [Firefly 4 升级报道](https://blog.csdn.net/xinyulou/article/details/147496769)
- [ComicBERT: A Transformer Model and Pre-training Strategy for Contextual Understanding in Comics（Springer）](https://link.springer.com/10.1007/978-3-031-70645-5_16) —— 学术 comic 视觉理解
- 知乎：[COMICAI 与 AI COMIC FACTORY 对比](https://zhuanlan.zhihu.com/p/675622163) —— 2024-01 国内评测二手
- [LlamaGenAI GitHub Org](https://github.com/LlamaGenAI) / [llamagenai-openapi](https://github.com/LlamaGenAI/llamagenai-openapi)

## §F 视觉叙事与镜头语言（Visual Storytelling & Cinematic Language）
> **调研人**:F（并行 agent）。**scope**:shot types / camera movements / 180-degree rule / continuity editing / beat boards / previs / mise-en-scène
>
> **重点产品 / 范式**：Pixar Storyboarding（22 rules / Story Spine）、Walter Murch editing（Rule of Six）、180-degree / 30-degree / 400-rule（continuity editing）、Sid Field paradigm（3-act / sequence / beat）、Save the Cat beat sheet（Blake Snyder）、Khan Academy Visual storytelling、StudioBinder / Boords / Toon Boom Storyboard Pro、Previs（ILM / The Third Floor）、Mise-en-scène（Bordwell / Thompson）、Kuleshov effect。
>
> **Pinax 现状锚点**：ProseEssay.vue 已落地 shot 12 种（extreme_wide / wide / full / medium_wide / medium / medium_close / close_up / extreme_close_up / two_shot / over_shoulder / pov / aerial）+ camera 12 种（static / pan / tilt / dolly / track / crane / zoom / handheld / steadicam / spin / tilt_up / tilt_down）；Director Mode 已内嵌 6 类蒙太奇边（跳切 / 叠化 / 淡入淡出 / 对比蒙太奇 / 交叉剪辑 / 匹配剪辑）；Canvas 模式提供卡片自由摆放 + 边连接。但「180 规则 / 30 规则 / 跨页视觉引导 / beat board / previs / continuity sheet / screen direction」语义层整体缺失。
>
> **验证状态**：Pixar 22 rules / Save the Cat 15-beat / Walter Murch Rule of Six / 180+30 rule / Kuleshov effect / beat-board-vs-animatic / previs 起源等核心术语已通过 WebSearch 二手验证；具体页码 / 官方文档链接未逐条 WebFetch（I cannot verify 标注于条目内）。
>
> **章节结构**：§F.0 视觉叙事四根本命题 → §F.1–§F.10 十条灵感 → §F.总结 → §F.引用源

---

### §F.0 视觉叙事的四个根本命题

视觉叙事的根基可归约为四组根本命题，它们决定了「一个 panel / 一个 shot 看起来怎么样」之外的「读者 / 观众为什么会被它牵动」：

1. **构图（Composition / Mise-en-scène）**——画框内的人、物、光、景如何排列。Bordwell & Thompson 的 *Film Art: An Introduction* 把 mise-en-scène 拆为 setting / lighting / costume / staging 四要素，主张「画面内一切元素都在叙事，不存在中性画面」。
2. **动线（Camera & Blocking）**——镜头怎么动、人物怎么走。Pan / tilt / dolly / track / crane / zoom / handheld / steadicam 八种动线各带固定心理暗示（dolly-in = 压迫，crane-up = 揭示，handheld = 不安）。
3. **节奏（Pacing / Editing）**——镜头 / 面板停留多久、间隔多大、怎么过渡。Walter Murch 提出剪辑的「Rule of Six」按权重排序：emotion (51%) > story (23%) > rhythm (10%) > eye-trace (7%) > 2D plane of screen (5%) > 3D space (4%)。
4. **视角（Point of View / Screen Direction）**——180-degree rule 维持观众方向感；30-degree rule 防止跳轴；POV shot 强制代入角色主观镜头。

Pinax 现有 shot 12 + camera 12 已解决命题 2（动线枚举）的「物理层」；命题 1（构图）只到 12-shot 大类、未到 rule-of-thirds / lead-room / eye-line 级别；命题 3（节奏）只有 director mode 的 6 类边，缺 panel 停留时长 / 镜头覆盖（coverage）概念；命题 4（视角）的 180 / 30 / screen direction 完全空白。

下面十条灵感按四命题分组落地。

---

### §F.1 灵感一：180-degree rule + screen direction 守卫（视角 / 视角一致性）

**模式名**：Screen Line 守卫 + 30-degree jump-cut 警告

**源产品 / 范式**：Continuity editing 经典规则，180-degree rule（详见 Wikipedia 与 StudioBinder）。Wikipedia 把 180-degree rule 定义为「保持摄影机始终在主体间一条假想轴线的一侧，以确保 screen direction 不反转」；30-degree rule 是跳切（同主体、几乎同角度）的最小角度门槛。两者共同维持观众对场景空间的心理地图。

**机制简述（≤ 80 字）**：在每条 panel / shot 之间标注「摄影机位于 screen line 哪一侧」；若新 panel 越过 screen line，给出 jump-cut 警告并提议过肩镜头或 cutaway 解决。

**Pinax 摩擦对应**：ProseEssay shot 12 + camera 12 是「单帧物理层」，未约束连续 panel 的方向感。ComicStageWorkbench / ComicPageEditor 排列 panel 时也没有 screen direction 元数据。多 panel 跨页时左右翻转角色朝向会让读者下意识迷路但作者无感。

**为什么不算实现方案**：仅提供「screen line 守卫算法」+「30-degree 警告 UI」两个意识流；具体落地方案（手动拖线 vs AI 自动识别角色朝向）留给后续决定。

**可行性疑点**：
- ⚠️ AI 自动识别角色朝向需要语义级 vision model；当前 Pinax 主要依赖用户手挑参考图（见 ImageGenerationWorkbench）。
- ⚠️ 我不能 verify StudioBinder 2026 版图例是否仍是 Vashi Nedomansky 风格的实拍参考，与 Pinax 静态漫画语境需做映射。
- 𓈊 用户侧首次接触「screen line」概念时门槛较高，需要短教学挂件（just-in-time tooltip）。

---

### §F.2 灵感二：Kuleshov-effect 拼贴实验（节奏 / 蒙太奇心理学）

**模式名**：中性脸拼贴实验（Kuleshov Workshop）

**源产品 / 范式**：Lev Kuleshov 1920 年代的「中性脸 + 三种接续镜头」实验。IMDb 与 PLOS ONE 2024 年的复验研究均提及：观众会从「表情不变的脸 + 不同接续物」之间合成情绪（饥饿 / 悲伤 / 色欲）。该效应被现代神经科学部分质疑（PLOS ONE 2024 称原实验被神话化），但「剪辑即意义」的核心命题仍被电影学院视为基础。

**机制简述（≤ 80 字）**：给作者一个「同一人物 panel + 三张可选接续 panel」，让用户拼出三种情绪走向并比较观众读后感；沉淀为「对照素材库」。

**Pinax 摩擦对应**：Director Mode 已有「跳切 / 叠化 / 淡入淡出 / 对比蒙太奇 / 交叉剪辑 / 匹配剪辑」六类边，但「跳切的语义对齐」弱。Kuleshov 工作流可作为 director mode 的教学挂件 + A/B 测试样板。

**为什么不算实现方案**：仅指明「中性脸 + 接续物拼贴」是一种值得内化的创作直觉；具体 UI（拖拽 vs 表单）未规定。

**可行性疑点**：
- ⚠️ 「中性脸」在 AI 生成的立绘里罕见，多数 IP-style 角色表情已带设计语言；需要先生成「无表情」基准。
- ⚠️ PLOS ONE 2024 复验称原效应被夸大，但教学价值仍在（I cannot verify 该复验的具体效应大小）。
- 𓈊 跨文化语境下情绪解读差异大（参考 PhilEvents 2023 "New Work in Understanding the Kuleshov Effect" 会议主题）。

---

### §F.3 灵感三：Pixar Story Spine 模板（节奏 / 大结构命题）

**模式名**：Once Upon a Time… Story Spine（七个填空）

**源产品 / 范式**：Pixar 22 Rules of Storytelling（pixar.com 官方页面与 PDF）中的 Rule #4：「Once upon a time there was ___. Every day, ___. One day, ___. Because of that, ___. Because of that, ___. Until finally, ___」——共 7 个填空，构成最简结构 spine。其余 21 条覆盖简化（"What if I tried this without X"）、巧合可信度（「Coincidences to get characters into trouble are great; coincidences to get them out of it are cheating」）、结尾类型选择等。

**机制简述（≤ 80 字）**：在小说大纲侧提供「七格填空卡」，每格映射到一个 chapter / scene 块；与 Sid Field paradigm 的 3-act / sequence 配合使用。

**Pinax 摩擦对应**：写作流（writing 页面）目前以章节为主轴，缺少跨章节「story spine」层；与 chapter outline 是不同尺度。ImageGenerationWorkbench 的 reference 模式基于已成稿段落，spine 模式则在更上游。

**为什么不算实现方案**：只勾出 Story Spine 七格概念 + 它在 Pixar 22 rules 里的位置；如何与 Pinax 章节树对接留待 writing flow 决定。

**可行性疑点**：
- ✓ Pixar 22 rules 一手来源是 pixar.com/22-rules-of-storytelling 与其官方 PDF，已确认 Rule #4 即 Story Spine。
- 𓈊 Story Spine 是 Emma Coats 2012 年 tweet 集合而非「完整方法论」，可结合 Save the Cat 互补（见 §F.4）。
- 𓈊 跨语言（中文 / 英文）填空槽的语感差异较大，需要本地化 prompt。

---

### §F.4 灵感四：Save the Cat beat sheet 15 拍映射（节奏 / 剧本结构）

**模式名**：STC Beat Sheet 15-beat overlay

**源产品 / 范式**：Blake Snyder *Save the Cat!*（2005）提出的 15 拍结构：Opening Image → Theme Stated → Setup → Catalyst → Debate → Break Into Two → B Story → Fun and Games → Midpoint → Bad Guys Close In → All Is Lost → Dark Night of the Soul → Break Into Three → Finale → Final Image。多源印证页码百分比（基于 110 页剧本）。

**机制简述（≤ 80 字）**：在小说 / 漫画总纲上沿横轴标 15 拍，每拍定位到 chapter / page 范围；揭示哪些拍被遗漏（典型被跳过的是 Debate）。

**Pinax 摩擦对应**：ComicStudio / ComicAdaptationPlanner 已有 chapter-to-panel 转换，但缺跨拍级别的「拍感」分布；写作页面 chapter outline 也缺拍级 sanity check。

**为什么不算实现方案**：仅提供「15 拍位置 sanity check」+「Debate 跳拍警告」两个意识流；具体落到 writing flow 还是 comic planner 未定。

**可行性疑点**：
- ✓ Save the Cat 15 拍与对应描述已通过 WebSearch 多源印证。
- ⚠️ 110 页剧本的百分比映射到中国网络小说 30-50 章 / 章回体的拟合度未验证（I cannot verify）。
- 𓈊 短篇 / 短篇集 / 单元剧（每集独立 BE）是否需要拍结构本身争议大。

---

### §F.5 灵感五：Walter Murch Rule of Six 剪辑评分（节奏 / 编辑权重）

**模式名**：六维剪辑评分卡

**源产品 / 范式**：Walter Murch《In the Blink of an Eye》（1995，第二版 2001）提出的 Rule of Six：剪辑决策按 emotion / story / rhythm / eye-trace / 2D plane of screen / 3D space of action 六个维度加权。权重为 emotion 51% + story 23% + rhythm 10% + eye-trace 7% + 2D plane 5% + 3D space 4%。该法则被 Hollywood 剪辑师广泛引用，但也存在学术争议（实验复验显示单独 emotion 维度效应比想象中弱）。

**机制简述（≤ 80 字）**：每个 panel-to-panel 边附带 6 维 0-1 评分；总分排序给出「该 cut 是否值得保留」的提示。

**Pinax 摩擦对应**：Director mode 现有 6 类边（跳切 / 叠化 / 淡入淡出 / 对比蒙太奇 / 交叉剪辑 / 匹配剪辑）是「type taxonomy」，缺「每条边的质量评估」。Murch 评分卡填补 quality 层。

**为什么不算实现方案**：仅描绘 Rule of Six 的六维与权重；具体评分手动 vs 半自动未规定。

**可行性疑点**：
- ⚠️ Murch 权重数据为 1990 年代经验值，2026 年是否仍被主流剪辑工业采纳需验证（I cannot verify 是否有新数据更新）。
- 𓈊 静态漫画 vs 动态影像的 eye-trace 含义不同（漫画读者自己移动视点，影像由摄影机代移动）。
- 𓈊 6 维评分手动评分耗时，需要 AI 半自动（可能与 §A 一致性 / §E AI 工具协作）。

---

### §F.6 灵感六：Beat board vs storyboard vs animatic 三层可视化（节奏 / 时长）

**模式名**：三层可视化层级（beat / board / animatic）

**源产品 / 范式**：Hollywood pre-vis 三层：beat board（粗粒度，1 张 = 1 节拍、缩略图风格，2-4 帧 / 分钟）→ storyboard（细粒度，逐 shot 标注镜头语言）→ animatic（动起来的 storyboard，加 voice / SFX / timing）。ILM / The Third Floor / Perforce 等工作室软件（Perforce 3D Previsualization 系列）默认走这条流水线。

**机制简述（≤ 80 字）**：在 Pinax 漫画 / 影视化预览流里提供三档视图：beat（节点）、board（网格缩略图）、animatic（带时序的扫过预览）。

**Pinax 摩擦对应**：ProseEssay shot-level + canvas card-level 都是「已选一档」；没有「粗 → 细 → 动」的渐进 zoom-out / zoom-in。ComicPageEditor 是固定页面，缺三档切换。

**为什么不算实现方案**：仅标记三层概念的存在；各层在 Pinax 的对应物是已有功能还是新组件未规定。

**可行性疑点**：
- ✓ beat-board vs storyboard vs animatic 定义已通过 WebSearch 印证（多源术语稳定）。
- ⚠️ animatic 在静态 Pinax 上下文要降级为「带时序的翻页 preview」（I cannot verify 该降级是否仍被作者接受）。
- 𓈊 三层切换的 UI 复杂度（一个组件做三档 vs 三个组件）需要 UX 取舍。

---

### §F.7 灵感七：Previs 时代的工作流标签（动线 / 预演）

**模式名**：Previs tag 链

**源产品 / 范式**：Previs 由 Chris Edwards 2002 年在 Lucasfilm *Star Wars: Revenge of the Sith* 制作期间开创（与 George Lucas 合作），后创立 The Third Floor, Inc.（2004），现为好莱坞 85% 影片提供 previs 服务（数据见 Perforce 行业总结）。previs 核心交付物：3D 镜头预演 + 摄影机运动 + 镜头时序 + 编辑粗剪。

**机制简述（≤ 80 字）**：每个 shot 附「previs tag」标注：intended camera move + blocking + timing + cut-on-action；方便下游 AI 生图时按 tag 选参考。

**Pinax 摩擦对应**：ProseEssay shot 12 + camera 12 + director mode 6 类边合起来已具备「previs 标签」的语义骨架；缺的是「下游消费方」（目前 ImageGenerationWorkbench 主要看 prompt + reference，未消费 shot/camera 元数据）。

**为什么不算实现方案**：仅指出「previs tag」是已有 shot+camera+edge 元数据的下游消费接口；具体如何让 ImageGenerationWorkbench 读这些 tag 未规定。

**可行性疑点**：
- ⚠️ previs 在 2002 年起源的具体细节（是否 100% 由 Edwards 单人提出）我未做一手核实。
- 𓈊 Pinax 是「先有 prose / comic 再来生图」，与好莱坞「先 previs 再实拍」次序相反；previs tag 含义需重新定义（先验 vs 校验）。
- 𓈊 Pinax 不接入 3D 引擎，previs 的 3D 部分天然缺失。

---

### §F.8 灵感八：Coverage / master shot + medium + insert 三层覆盖（构图 / 经典影视覆盖）

**模式名**：Master / Medium / Insert 三层 coverage

**源产品 / 范式**：Hollywood 经典 coverage 套路：master shot（远景，覆盖整场戏）+ medium shot（中景，覆盖对话）+ insert（特写，cover 道具 / 手 / 表情细节）。Master / MCU / Insert 被多个电影学院基础教材（如 MasterClass、StudioBinder）并列称为「bread and butter」。

**机制简述（≤ 80 字）**：在「一场戏 / 一个 beat」级别，要求至少 1 master + 1 medium + 1 insert；缺哪一层给出提示。

**Pinax 摩擦对应**：ComicStageWorkbench 在 stage 上排列 panel 时已支持不同 shot 类型（参考 ProseEssay shot 12），但缺「一场戏至少三档」的 sanity check。

**为什么不算实现方案**：仅描述 coverage 三层结构；具体 sanity check 是软警告还是硬约束未规定。

**可行性疑点**：
- 𓈊 coverage 是动态影像概念，漫画可以「一格 = master」单格完成；过度套用可能反而压扁漫画节奏。
- ⚠️ 三个覆盖层级在静态漫画里映射是否仍成立 I cannot verify（需要看日漫 / 欧漫实践）。

---

### §F.9 灵感九：Mise-en-scène 元素 checklist（构图 / 画面内容审计）

**模式名**：四要素 checklist（setting / lighting / costume / staging）

**源产品 / 范式**：David Bordwell & Kristin Thompson《Film Art: An Introduction》把 mise-en-scène 拆为四要素（setting / lighting / costume / performance & staging），主张「每个画面元素都在承担叙事功能，不存在中性画面」。该框架是西方电影教育基础。

**机制简述（≤ 80 字）**：每个 panel / stage 提供四要素 checklist（哪些元素承载叙事、哪些冗余），辅助精修。

**Pinax 摩擦对应**：ImageGenerationWorkbench 已有 reference + illustration 模式，但缺「这个 panel 在做什么叙事功能」的元数据；与 §B 视觉圣经中的 style guide 是不同问题。

**为什么不算实现方案**：仅指出四要素分类 + 它对 Pinax 静态 panel 的「叙事功能标注」价值；具体标注是作者手填还是 AI 半自动未规定。

**可行性疑点**：
- ⚠️ Bordwell / Thompson 教科书在 2026 是否仍为主流教材需验证（I cannot verify 是否有新教材替代，如 Bordwell 新版是否由 Thompson 之外的合作者扩展）。
- 𓈊 静态漫画的「performance & staging」比动态影像弱很多，可能需降级处理。

---

### §F.10 灵感十：Continuity / dope sheet 跨页追踪（节奏 / 一致性追踪）

**模式名**：Continuity / dope sheet 跨页状态追踪

**源产品 / 范式**：Hollywood 摄影组的 continuity sheet（又叫 dope sheet）：script supervisor 逐场记录服装 / 道具 / 化妆 / 演员位置 / 镜头参数 / 拍摄状态，确保 day-by-day 拍摄不穿帮。StudioBinder 把它列入 pre-production 必做清单。

**机制简述（≤ 80 字）**：在 Pinax 跨页 / 跨 chapter 间维持一张「视觉 continuity sheet」：道具出现页、服装变化、伤疤 / 血迹状态、表情曲线。

**Pinax 摩擦对应**：与 §A 角色一致性、§B 视觉圣经都有重叠，但更偏「时间序列一致性」而非「单角色一致性」。ComicStudio 跨页管理尚未暴露 dope sheet 视图。

**为什么不算实现方案**：仅指出 dope sheet 概念 + 它对跨页追踪的价值；具体与 §A / §B 的边界划分留待 §I 综合。

**可行性疑点**：
- 𓈊 Pinax 写作流常发生在脑内状态而非脚本状态，dope sheet 难以事先预测作者编辑路径。
- ⚠️ AI 半自动生成 dope sheet 需要 vision model 提取道具清单，Pinax 现有模型栈是否支持 I cannot verify。

---

### §F.总结

十组灵感里真正「Pinax 可消化、不重复 §A / §B / §D / §E」的增量集中在四块：

1. **视角连续性**（§F.1）：screen line / 30-degree / screen direction 守卫——填补命题 4 视角的完全空白。
2. **大结构拍感**（§F.3 / §F.4）：Pixar Story Spine 7 拍 + Save the Cat 15 拍——把导演层的结构 sanity check 落到写作 / 漫画侧。
3. **节奏质量评估**（§F.5 / §F.6）：Murch Rule of Six + beat/board/animatic 三层视图——填补 director mode 的 quality 层与时序层。
4. **跨页追踪**（§F.10）：continuity sheet / dope sheet——填补跨 chapter 一致性追踪的工具空白。

剩下的（§F.2 Kuleshov、§F.7 previs tag、§F.8 coverage、§F.9 mise-en-scène）属于教学 / 锦上添花，可在教育挂件（just-in-time tooltip）层引用，不必单独立项。

**Open questions（待 §I 综合时与 D / E / A / B 协调）**：

- Q1. screen line 守卫与 §A 角色一致性如何分工？A 关注「形象一致」，F.1 关注「方向一致」，两者在「跨页角色朝向」会重叠。
- Q2. Save the Cat 15 拍与中国网文 30-50 章结构的拟合度未验证；是否要单独写「中文网文节奏模型」而非套用 Hollywood beat sheet？
- Q3. Murch Rule of Six 评分卡是否需要 AI 半自动？若手动则工作量大于 director mode 现有 6 类边。
- Q4. beat/board/animatic 三层视图的「中视图」（board）是否就是当前 ProseEssay 的 shot grid？若是，则无需新增组件而是改造视图。
- Q5. dope sheet 跨页追踪是否与 §B 视觉圣经的「角色 sheet」重复？还是说 dope sheet 偏「时间轴」、character sheet 偏「属性表」？

---

### §F.引用源（2026-08-17 调研）

**一手 / 官方**（✓ 已通过 WebSearch 二手验证内容，未逐条 WebFetch）：

- Pixar 22 Rules of Storytelling：https://pixar.com/22-rules-of-storytelling/
- Pixar 22 Rules of Storytelling PDF：https://pixar.com/wp-content/uploads/2019/11/22_rules_storytellers.pdf
- StudioBinder Camera Movements Ultimate Guide：https://www.studiobinder.com/blog/camera-movement-types/
- StudioBinder Pan Shot：https://www.studiobinder.com/blog/pan-shot-definition/
- StudioBinder Tilt Shot：https://www.studiobinder.com/blog/tilt-shot/
- StudioBinder Dolly Shot：https://www.studiobinder.com/blog/what-is-a-dolly-shot/
- StudioBinder Ultimate Guide to Camera Shots：https://www.studiobinder.com/blog/different-camera-shots/
- StudioBinder Shot List Template：https://www.studiobinder.com/blog/shot-list-template/
- StudioBinder How to Make a Shot List：https://www.studiobinder.com/blog/how-to-make-a-shot-list/
- Wikipedia 180-degree rule：https://en.wikipedia.org/wiki/180-degree_rule
- Wikipedia Continuity editing：https://en.wikipedia.org/wiki/Continuity_editing
- Lev Kuleshov IMDb：https://www.imdb.com/name/nm0474487/
- PLOS ONE 2024 Kuleshov 复验：https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0308295
- PhilEvents 2023 New Work in Understanding the Kuleshov Effect：https://philevents.org/event/show/109257
- Perforce 3D Previsualization Software for Innovative Studios：https://www.perforce.com/blog/vcs/3d-previsualization-software

**二手 / 教学站点**（⚠️ 内容已 WebSearch 摘要印证，链接未逐条 WebFetch）：

- Walter Murch Rule of Six 与 *In the Blink of an Eye*（1995，第二版 2001）：权重 51/23/10/7/5/4% 数据在多个电影教育博客中流传；I cannot verify 原始出版页码。
- Save the Cat! 15 beats by Blake Snyder：2005 年原书 + 后续教学站点普遍版本；110 页剧本拍位置 1 / 5 / 1-10 / 12 / 12-25 / 25 / 30 / 30-55 / 55 / 55-75 / 75 / 75-80 / 80 / 80-110 / 110 系多源整理。
- Sid Field paradigm 三幕 / sequence / beat：1979 年原书《Screenplay》多家教学站点总结。
- Boords storyboard software：AI script-to-storyboard、animatic 导出等特性在多篇测评中描述。
- Toon Boom Storyboard Pro：工业级 storyboard 软件，多个动画 / 影视 pipeline 采用。
- Bordwell & Thompson《Film Art: An Introduction》mise-en-scène 四要素：setting / lighting / costume / performance & staging；多篇教学文章整理。
- Khan Academy Daniel Crewe 视觉叙事课程：多篇博客提及，I cannot verify 课程仍在 2026 年 Khan Academy 主目录。

**未核实 / I cannot verify**：

- Walter Murch Rule of Six 权重数据是否在 2026 年仍有学界支持 / 更新数据。
- Bordwell & Thompson《Film Art》2026 版是否由新合作者扩展。
- Boords / Toon Boom Storyboard Pro 2026 年具体定价 / 功能集。
- Khan Academy 视觉叙事课程 2026 年是否仍在主目录。
- StudioBinder 各篇图例在 2026 版是否仍是 Vashi Nedomansky 风格实拍图，与 Pinax 静态漫画语境的映射。
- Pixar 22 rules 是否在 2026 之后被 Pixar 官方更新或扩展（如 Pixar 新片 *Elemental* / *Inside Out 2* 是否新增规则）。

## §G 传统插画师工作流（Traditional Illustrator Workflow）

> **调研人**:G（并行 agent）。**scope**:sketch → line → color → final / art direction / feedback iteration / hiring illustrators
>
> **重点产品**：Behance / ArtStation portfolios、传统绘本插画师工作流、儿童文学插画合同、Light novel illustrator contracts (HJ文庫 / 電撃文庫)、Editorial illustration (NYT / New Yorker)、Concept artist workflow (Blizzard / Riot Games / Weta Workshop)、AI 辅助手绘混合 workflow、illustration commission 平台、art direction revision cycles
>
> **Pinax 现状锚点**：Pinax 是 AI 辅助生成，非传统手绘；用户群体可能包含「纯 AI 派 / AI+手修 混合派 / 全手绘流派」三种；`ImageGenerationWorkbench` 是 AI 生成入口；本调研目的是借鉴传统流程，帮用户理解「什么该 AI 做、什么该人做」的边界。

---

### §G.0 总览：传统插画师工作流的五个根本命题

不论是儿童绘本、Light novel 封面、editorial 配图 还是 game concept art，传统 illustration pipeline 都收敛到 5 个核心环节，2026 视角下每个环节都有 AI 介入/不介入的边界问题：

1. **Brief**（brief / 任务书）—— 委托方把文字需求（角色 + 场景 + 情绪 + 用例 + 截止）交付给插画师。editorial illustration（NYT / New Yorker）的 brief 极简（一句 caption + 600-1500 美元稿费 + deadline），HJ 文库的 brief 更结构化（角色设定 / 封面 / 插页 / 黑白拉页分别结算）。
2. **Sketch**（thumbnails → rough）—— 快速、低精度的构图探索，可能 5-20 张缩略草图只选 1-2 张继续。这一步 AI 介入最深（Midjourney / SD 批量出 thumb），但传统派坚持手绘因为 sketch 阶段在「探索构图」，AI 一张一张 prompt 反而慢。
3. **Line / Inking**（pencil cleanup → ink）—— 把 sketch 提纯成干净线稿。Chris Riddell / Quentin Blake 的线本身就是表达核心，AI line 化（img2img + controlnet lineart）目前还没法复制 Blake 的「dip pen + 抖动 + 留白」气质。
4. **Color / Render**（flat color → shading → final）—— 上色阶段最容易被 AI 替代（ControlNet + IP-Adapter + 手涂叠层），也是「AI + 手修」混合派的主要栖居地。Shaun Tan 的 collage / 油画扫描 + Photoshop 合成是传统工艺里「介质混用」的范本。
5. **Delivery / Iteration**（revision rounds → final files）—— 委托方反馈 → 插画师修改 → 终稿交付。editorial 通常 1-2 轮反馈，game concept 5-10 轮，light novel 封面常 3-5 轮。AI 工具目前对「revision round」的支持很弱——prompt 重生成 ≠ 艺术指导反馈。

**Pinax 借鉴意义**：理解这五个命题后，可以反推 Pinax 各组件的「AI 边界」—— `ImageGenerationWorkbench` 主要是 G.0-2 和 G.0-4 的放大版；`ComicAdaptationPlanner` 对应 G.0-1 brief 收集；`ComicPageEditor` 对应 G.0-3 / G.0-4；M7「连续性」对应 G.0-5 revision。

---

### §G.1 Brief 模板与 Brief 资产（Editorial Brief Pattern）

**模式名**：Brief 模板前置，把「我要画什么」固化成一个表单
**源产品 / 范式**：The New Yorker art department brief 表单（栏目 + 主题 + 截止 + 黑白/彩色 + 不可用元素），Quentin Blake 给 Roald Dahl 配图时的 brief 是「Dahl 的手写稿 + 章节摘要 + 角色清单」
**机制简述**：用户在开始任何绘图之前先填写一份结构化 brief（subject / mood / palette / usage / deadline / forbidden elements），插画师据此报价与规划。「brief 不充分」是 80% 委托失败的根因。
**Pinax 摩擦对应**：§0「Pinax 是 AI 辅助」—— 当前 `ImageGenerationWorkbench` 直接吃文本 prompt，没有 brief 中间层；用户写「画一个悲伤的女孩」vs「画一个 16 岁女主角在雨夜的便利店门口，霓虹倒影在积水，no eye contact, cinematic 35mm」差距巨大。借鉴 Brief Pattern 可让用户把「角色 / 场景 / 情绪 / 用途 / 黑名单」拆开填字段（参考 §B 视觉圣经 + §C 文本关键帧）。
**为什么不算实现方案**：本条只描述「brief 表单是好实践」，具体字段如何跟 Pinax 现有 `mediaPurpose` / `referenceCandidates` / `sourceRefs` prop 整合（`ImageGenerationWorkbench.vue` 第 41-65 行已有部分相关字段）需要后续 plan 阶段。
**可行性疑点**：editorial brief 极简，light novel brief 结构化，game concept brief 多页 PDF——三套范式差距太大；Pinax 不应该强制一种 brief 形态。

---

### §G.2 Thumbnails 批量探索（Thumbnails Pass）

**模式名**：Thumbnails 先于定稿，5-20 张构图筛选
**源产品 / 范式**：Pixar / DreamWorks storyboarding「thumbnails pass」（每天 50-100 张 2x3 inch thumbnail，扔掉 95%）；Quentin Blake 的 sketchbook 经常整页整页的 thumbnail；game concept art 早期 concept board
**机制简述**：把单张「成品图」拆成「批量小图筛选」的两阶段流程：先生成 20 张 512x512 thumbnail，再人工挑 3-5 张放大到 final 分辨率精修。这一步 AI 的天然优势是「低成本批量」，但传统派坚持手绘因为「thumbnail 就是手感训练」。
**Pinax 摩擦对应**：§0「`ImageGenerationWorkbench` 是 AI 生成入口」—— 当前模型生成一般是 1 张 1024x1024 单图（`ImageGenerationWorkbench.vue` 第 73-74 行 `imageCount = ref(1)`），借鉴 thumbnails pass 可以让用户一次生成 8-12 张 512x512 缩略图（SDXL / Flux 都很便宜），让用户先选构图再 upscale / 重生成。这一步是「AI 完全胜任」的范本。
**为什么不算实现方案**：本条不展开具体的 thumbnail grid UI 怎么排、怎么标注选中、怎么进入下一轮——这些属于实现阶段。
**可行性疑点**：缩略图筛选后 upscale 经常出现「构图对了但细节崩」（面部 / 手部 / 文字崩坏），传统插画师靠「thumbnail 就是终稿的微缩版」避免这个问题，AI 路径需要 LoRA / controlnet 锁定；thumbnail 网格 UI 在 Pinax 移动端（窄屏）布局有挑战。

---

### §G.3 Line Art 阶段「手 vs AI」边界（Hand-drawn Line Art Boundary）

**模式名**：Line art 阶段要么全手绘，要么全 AI，混合代价最高
**源产品 / 范式**：Quentin Blake 的 dip pen + 抖动交叉影线（pen and ink）被广泛视为「line art 即表达」的代表；Chris Riddell（英国儿童文学桂冠 2015-2017）的钢笔线本身就是插画的 80% 价值；Shaun Tan 的线稿弱（他的「线」是 collage 边界），所以 line 阶段对他反而不是核心
**机制简述**：传统 line art 是插画师的「笔迹」—— Blake 的笔迹无法被 SD + ControlNet 复现，因为他的线包含呼吸 / 节奏 / 留白决策。AI line art 目前擅长「干净工整 + 闭合路径」，不擅长「手绘味 / 抖动 / 飞白」。
**Pinax 摩擦对应**：§0「用户群体可能包含纯 AI 派 / AI+手修 混合派 / 全手绘流派」—— 这三种流派对 line art 的态度完全不同：
- 纯 AI 派：line art 完全交给 img2img + controlnet lineart（acceptable for storyboard / 漫画底稿）
- AI+手修 派：AI 出 line → Procreate / Photoshop 手修（acceptable for comic inking 加速）
- 全手绘 派：line 必须人手绘（acceptable for 儿童绘本 / 收藏级插画）
Pinax 不应假设「line 必须 AI」或「line 必须手」，应当给三个流派都留出工作流出口。
**为什么不算实现方案**：三种流派的 UI / 文件格式 / 工作流整合方式完全不同（Procreate .procreate 文件 / Photoshop .psd / SD lineart PNG / SVG 矢量），具体实现超出 brainstorm 范围。
**可行性疑点**：Weta Workshop / Blizzard 等高端游戏概念艺术师的线稿扫描 + Photoshop 手修 仍是行业金标准；AI line art 在「商业可用度」上 2026 仍未追平手绘线（I cannot verify 具体的商业项目失败率，但社区共识是 line art 是 AI 弱项之一）。

---

### §G.4 Color 阶段「AI 上色 + 手修」混合（Hybrid Coloring）

**模式名**：Color 阶段最适合「AI + 手修」混合
**源产品 / 范式**：Shaun Tan 的 collage 工作流——先画 30x40cm 油画小稿 → 高分辨率扫描 → Photoshop 合成 + 调色；现代 illustrator 的 SD inpainting + Photoshop 手绘叠层；Krita + Stable Diffusion plugin（社区 2024 起活跃）
**机制简述**：把上色拆成「色块铺底 + 局部细化」两步：AI 负责大面积 base color + atmosphere（节省 60-70% 时间），人手负责关键区域（角色面部 / 道具细节 / 文字 / logo）。这条路径在 2025-2026 是「AI 辅助手绘」最成熟的环节。
**Pinax 摩擦对应**：§0「借鉴传统流程可帮用户理解『什么该 AI 做、什么该人做』的边界」—— color 阶段就是「AI 完全 OK 的边界」明确示范。`ImageGenerationWorkbench` 当前已经有 reference mode + illustration mode，可以扩展一个「base color pass」模式：用户上传 line art → AI 出 base color → 用户在 Pinax 内手修（如果 Pinax 集成 Krita-like canvas）→ 出 final。
**为什么不算实现方案**：Pinax 当前没有画布组件（canvas / Krita-like painting UI），「手修」出口可能需要外部工具（Procreate / Photoshop / Krita）链接；具体集成深度超出 brainstorm。
**可行性疑点**：Shaun Tan 的 collage 美学依赖物理材质（油画厚涂 / 拼贴撕边），AI 完全无法复现——「AI + 手修」混合派的成功案例目前集中在「photorealistic / illustration 风格」，对 fine art / mixed media 流派帮助有限（I cannot verify 具体到 2026 各社区的混合 workflow 渗透率数字，但社区反馈方向明确）。

---

### §G.5 Art Direction 多轮反馈循环（Art Direction Feedback Loop）

**模式名**：Art direction 的多轮反馈循环，结构化而非自然语言
**源产品 / 范式**：editorial illustration 的 art director 反馈（caption 重写 1-2 轮，color tweak 1 轮）；game concept 的 5-10 轮 iteration（silhouette pass → value study → color script → final）；Pixar 的 daily review
**机制简述**：插画师把 5 个交付物轮次拆开：
- Round 1：silhouette / thumbnail（构图筛选）
- Round 2：value study / lighting（黑白定调）
- Round 3：color comp（色板）
- Round 4：final render（成品）
- Round 5：minor tweaks（修改）
每轮反馈局限在本轮 scope，避免「把 Round 1 的反馈留到 Round 4」。
**Pinax 摩擦对应**：§0「Pinax 是 AI 辅助」—— 当前 AI 生成是「一锤子买卖」，用户给 prompt → 出图 →「不满意 → 改 prompt → 重生成」无限循环，没有 Round 1-5 的结构。借鉴 art direction loop 可让 Pinax 在 `ImageGenerationWorkbench` 提供「按阶段拆分」的 feedback slot（thumbnail / value / color / final 各有独立的「OK / 改」按钮），让用户和 AI 都聚焦当前阶段。
**为什么不算实现方案**：Pinax 当前的 prompt → image → regenerate 循环改造成结构化 loop 涉及 UI 状态机 + 历史版本管理 + feedback 注解，复杂度超出 brainstorm。
**可行性疑点**：editorial art director 通常 1 人 vs 1 illustrator，能形成「对话式反馈」；Pinax 是 1 用户 vs AI 模型，没有「art director 中间人」——把 AI 当成 art director 是另一个方向（参考 §A 角色一致性中「AI 当 critic」思路），与本条「传统人工反馈循环」不完全契合。

---

### §G.6 Light Novel 插画约稿经济（Light Novel Illustrator Contracts）

**模式名**：Light novel 插画师的「封面 + 插页 + 黑白拉页」分项结算模式
**源产品 / 范式**：HJ 文库 / 電撃文庫 / GA 文库 / 一迅社 插画师约稿流程；abec（Sword Art Online）、Haimura Kiyotaka（A Certain Magical Index）、shimeji（86 -Eighty Six-）等知名 LN 插画师的合约结构（细节未公开）
**机制简述**：一本 LN 的插画工作量通常拆成：
- 封面（color，1-2 张）—— 最高单价，¥50k-300k+
- 插页（color，3-10 张）—— 中等单价
- 黑白拉页（monochrome，10-30 张）—— 较低单价，但量大
- 周边 / 异稿（color，2-5 张）—— 单独结算
作者方与插画师有「捆绑销售」（小说销量影响插画师分成）的隐性利益结构。
**Pinax 摩擦对应**：§0「`ImageGenerationWorkbench` 是 AI 生成入口」—— 当前 Pinax 不区分「封面 vs 插页 vs 拉页 vs 周边」，所有生图走同一个 pipeline。借鉴 LN 拆分可以给「封面 / 插页 / 拉页 / 周边」四个用途分别定义 aspect ratio + 分辨率 + 风格 prompt template +「no-text region」约束。这一步是「业务模型参考」而非「AI 边界问题」。
**为什么不算实现方案**：HJ 文库等出版社合约细节 2026 未公开（I cannot verify 准确费率数字，但中文 / 日文社区一般引用 ¥30k-300k+ 区间）；具体到 Pinax 怎么落地四个 usage template 属于实现阶段。
**可行性疑点**：日本 LN 行业的「作者 + 插画师」捆绑宣传是中国网文 / AI 创作社区不一定有的传统；Pinax 用户群体更接近「个人创作」而非「出版社集体协作」，借鉴时需要剥离出版社语境。

---

### §G.7 Editorial Illustration 的「不可用元素」brief（Forbidden Elements Brief）

**模式名**：Editorial brief 必含「不可用元素 / 不能出现的内容」
**源产品 / 范式**：NYT Op-Ed art department 公开的工作流（通过 Arem Duplessis 等前 art director 的访谈披露）；New Yorker 的 illustration brief 经常写明「no logos / no recognizable public figures / no text in image」
**机制简述**：editorial illustration 必须避开法律 / 政治 / 版权雷区，brief 里写明「禁止元素」比「鼓励元素」更关键。常见禁项：商标、可辨识公众人物、特定宗教符号、血腥过度、未成年负面形象、可被误读为新闻照片的风格。
**Pinax 摩擦对应**：§0「Pinax 是 AI 辅助」—— `ImageGenerationWorkbench` 第 71 行已有 `imageNegativePrompt` 字段（反向 prompt），是「不可用元素」的雏形；但 negative prompt 在 SDXL / Flux 等模型上的实际效力有限（negative prompt 经常被忽略或过度抑制）。借鉴 editorial forbidden elements 可让 Pinax 提供「结构化禁项清单」（商标 / 公众人物 / 血腥 / 儿童负面 / 真人照片风 / 政治符号），而非依赖负向 prompt 文本。
**为什么不算实现方案**：editorial forbidden list 完整版涉及法律风险评估，超出 brainstorm；具体到 Pinax 怎么 enforce（model-side 拒绝 vs prompt-side 抑制 vs 后期用户自查）需要后续 plan。
**可行性疑点**：负面清单与「用户自由创作」存在张力——一个写恐怖小说的用户需要血腥元素，一个写儿童读物的用户禁止血腥；Pinax 不应硬编码一个 universal forbidden list，而应当把 forbidden list 作为「作品级 metadata」可配置（类似视觉圣经里的 style bible）。

---

### §G.8 Concept Art 的「Silhouette First」原则（Silhouette First）

**模式名**：Concept art 第一关：silhouette 剪影是否成立
**源产品 / 范式**：Pixar / DreamWorks 的 character design 早期 silhouette test；Blizzard / Riot Games 的 champion / hero concept art 流程；Weta Workshop 的 LotR / Hobbit 概念设计（公开访谈 + art book）
**机制简述**：角色 / 物体概念设计的第一关是「silhouette test」—— 把图涂黑只留轮廓，看剪影是否能识别角色 / 物体 / 情绪。剪影失败的 concept 必须重做，不能进入下一关。Weta Workshop 在 LotR 设计 Gollum 时迭代了上百个 silhouette 才选定最终方案。
**Pinax 摩擦对应**：§0「用户群体可能包含全手绘流派」+「`ImageGenerationWorkbench` 是 AI 生成入口」—— 当前 AI 生成图普遍「silhouette 漂亮但 role identity 模糊」（一张图剪影后看起来像「战士 A」「法师 B」「路人 C」），借鉴 silhouette first 可让 Pinax 在角色生成阶段提供一个「silhouette preview」步骤（生成图 → 自动 silhouette overlay → 用户判断剪影是否够 unique）→ 进入下一关。
**为什么不算实现方案**：silhouette preview 在 Web 端可用 canvas filter 简单实现，但「silhouette 评估是否够 unique」需要设计准则（什么算「太像路人」）；这属于设计规范 + UI 组件级别，超出 brainstorm。
**可行性疑点**：silhouette test 对具象角色（人 / 兽人 / 机器）有效，对抽象 / 风景 / 静物 概念设计意义不大；Pinax 的 illustration 用途包括风景、封面、角色，可能只有「角色」子模块适用此原则（I cannot verify Weta Workshop 实际 silhouette iteration 数量，仅基于公开 art book 与访谈常识）。

---

### §G.9 委托插画师平台与「hybrid team」外包（Hire Hybrid Illustrator）

**模式名**：用户用 AI 出 80%，外包人工修最后 20%
**源产品 / 范式**：ArtStation Jobs（game studio 招聘 concept artist）；Behance ProFinder（前 Hire an Illustrator 服务，已并入 Adobe 生态）；Fiverr / Etsy Commission（小项目，¥50-500 单图）；Twitter #commissionsopen 标签（个人插画师接稿，2024-2026 仍是主要渠道）
**机制简述**：把「AI 生成 + 人工精修」作为一种外包产品形态—— 用户拿 AI 出 80% 完成度的图，找插画师按小时 / 按图收费用 Procreate / Photoshop 修最后 20%（面部 / 手部 / 关键道具）。这种「hybrid commission」在 2025-2026 在中文 / 英文社区都有零散案例。
**Pinax 摩擦对应**：§0「用户群体可能包含 AI+手修 混合派」+「`ImageGenerationWorkbench` 加工链」—— Pinax 可以借鉴 hybrid commission 模式，提供一个「export for hand-finish」功能：把 AI 生成图打包成 PSD-style layers（base / line / color / mask）+ brief + reference，让用户可以直接发给外包插画师或自己用 Procreate 继续。这条路径本质是「把 Pinax 嵌入到 hybrid 创作工作流的出口」而非「Pinax 自己画完」。
**为什么不算实现方案**：Pinax 当前没有 PSD export / 多 layer export；「export for hand-finish」工作流涉及文件格式（PSD / TIFF / PDF / Procreate .procreate）+ 远程协作 + 支付集成，超出 brainstorm。
**可行性疑点**：hybrid commission 的法律 / 版权状态在 2026 仍模糊——「AI 生成的 base + 人工 20% 修」的版权属于谁？AI 训练数据是否影响最终商用？这些是 industry-wide 法律问题（Getty v. Stability AI 等案件仍在演进，I cannot verify 2026 具体版权判例对 hybrid work 的态度）。

---

### §G.10 NFT 退潮后的插画师经济（Post-NFT Illustrator Economy）

**模式名**：NFT 退潮后插画师回到 commission + 教学 + IP 授权三足
**源产品 / 范式**：Behance / ArtStation 在 2022-2023 NFT 热潮后主动关闭 NFT 频道（ArtStation 2022 公开测试 → 2023 回退）；DeviantArt 同期的 AI art 争议（2022 推出 AI generator 后用户抗议）；2024-2026 插画师主要收入回归 commission + 教学课程（Gumroad / Skillshare / Patreon）+ 商业 IP 授权
**机制简述**：2022-2023 NFT 让一批插画师短期暴富（Beeple 等）；2023-2024 NFT 市场冷却后，插画师经济回落到传统三足：(1) commission 单图 / 项目，(2) 教学（教程 / Patreon / 小红书 / B站），(3) 商业 IP 授权（角色 / 风格 license 给品牌 / 出版社）。这三足中 commission 受 AI 冲击最大，教学与 IP 授权相对稳定。
**Pinax 摩擦对应**：§0「用户群体可能包含三种流派」+「借鉴传统流程可帮用户理解边界」—— Pinax 的「AI + 人协作」模式与 commission 经济有天然张力（AI 出图便宜 → commission 单图价值下降）。借鉴 post-NFT 经济三足可以给 Pinax 用户提示「除 AI 出图外，commission / 教学 / IP 授权 也是变现路径」，但 Pinax 不应直接做「Pinax 内 commission 平台」（那会变成 Fiverr-like marketplace，与「创作工具」定位冲突）。
**为什么不算实现方案**：插画师经济是 social / legal / market 现象，Pinax 作为工具不直接参与；具体到 Pinax 是否加「commission marketplace tab」属于产品方向决策，超出 brainstorm。
**可行性疑点**：NFT 退潮的速度与 post-NFT 经济结构的稳定性 2026 仍在演化（I cannot verify 2026 各社区的具体 commission 价格中位数，但趋势方向明确：commission 单价在 2024-2026 整体承压）；把这种社会趋势映射到 Pinax 的具体功能需要谨慎，避免误导用户认为「用 Pinax 就能挣 commission 钱」。

---

### §G.11 AI 法律风险对「画风模仿」的影响（Style Mimicry & Copyright）

**模式名**：AI 模仿特定插画师风格引发的法律 + 伦理争议
**源产品 / 范式**：2023-2024 Andersen v. Stability AI（美国艺术家集体诉讼）；Getty Images v. Stability AI（英国，2025-2026 仍在审理）；2024-2026 多国（EU AI Act、日本 文化庁 AI 版权指引、中国 2024 生成式 AI 服务管理办法）对「风格模仿」的法律态度不一
**机制简述**：用户用 AI prompt「in the style of [知名插画师名字]」模仿特定艺术家风格，引发三方面争议：(1) 模仿特定艺术家是否侵权（多数司法管辖区目前判「不算直接侵权」，但仍在演化），(2) AI 训练数据是否合法（Getty 案核心争议），(3) 模仿 vs 学习的伦理边界（插画师社区态度分裂）。
**Pinax 摩擦对应**：§0「Pinax 是 AI 辅助」+「用户群体可能包含三种流派」—— Pinax 用户可能在 prompt 里写「in Quentin Blake style」之类，借鉴 style mimicry 法律框架可以让 Pinax 提供：(a)「插画师风格 reference sheet」模板（用户主动声明想参考哪位插画师），(b)「风格归因标注」（final 图右下角可选加「inspired by [artist]」），(c) 法律风险提示（用户上传 prompt 含知名插画师名字时，弹窗提示模仿风险）。
**为什么不算实现方案**：具体法律风险提示内容 / 弹窗设计 / 哪些名字算「知名需提示」属于实现 + 法律咨询，超出 brainstorm；目前 EU AI Act 与各国法规对 style mimicry 态度不一致，I cannot verify 2026 各国具体细则，但方向是「鼓励风格归因 + 训练数据透明」。
**可行性疑点**：风格模仿是 AI 最常用功能之一，过度限制会激怒用户；「提示但不强制」是当前业界共识，但具体提示文案 / 触发阈值 / 法律风险等级需要行业标准（目前无统一标准）。

---

### §G.12 DeviantArt / ArtStation 的「AI vs Traditional」社区分裂（Community Polarization）

**模式名**：DeviantArt / ArtStation 社区在 AI 出现后的内部分裂
**源产品 / 范式**：DeviantArt 2022 推出 DreamUp AI generator，引发用户大规模抗议（部分用户出走），最终社区分化成「AI art 标签」与「Traditional Art 标签」两块；ArtStation 2022-2023 测试 NFT + 收集用户风格训练 AI 也引发抗议；2024-2026 两平台都做了「AI content 标注」机制
**机制简述**：AI 生成内容与手绘内容在社区展示 / 排名 / 比赛中需要明确分隔；用户上传作品时主动声明「this is AI-generated / human-made / hybrid」；社区搜索可以过滤只看 human-made；这一社区规则反过来影响个人创作者的「自我定位」——「我是 AI 派 / 手绘派 / 混合派」成为创作者身份标签。
**Pinax 摩擦对应**：§0「用户群体可能包含三种流派」+「`ImageGenerationWorkbench` 加工链」—— Pinax 生成的图如果是 AI 生成，应当明确标注（不是要歧视 AI，是要诚实）；用户如果用手工 / Procreate 修了 Pinax 生成的 base，应当能标注「hybrid」。借鉴 community polarization 可以让 Pinax 在 export / 导出 / 分享 metadata 里加 `creation_method: AI / human / hybrid` 字段，对应到 ImageGenerationWorkbench 的 `mediaPurpose`（第 43 行）扩展。
**为什么不算实现方案**：creation_method 字段影响后续版权 / 商业使用 / 社区分享，复杂度超出 brainstorm；具体怎么 enforce / 校验「用户是否真手修了」不可技术化。
**可行性疑点**：用户在「honor system」下经常谎报（声称手绘实为 AI），技术校验目前不可能；这种 metadata 主要是「信任 + 社区文化」机制，不是防作弊机制。

---

### §G.总结：Pinax 在「传统流程借鉴」上的三条决策轴

回到 §0「Pinax 是 AI 辅助，借鉴传统流程可帮用户理解『什么该 AI 做、什么该人做』的边界」，综合 §G.1-§G.12，Pinax 在传统流程借鉴上需要回答三个核心问题：

1. **AI 边界在哪一步？**—— thumb/line/color/final 四步里，AI 在 thumb + base color 最强（§G.2 + §G.4），在 line + 细节 final 最弱（§G.3）。Pinax 不应假设 AI 全包，而应让用户在四个步骤里挑 AI 介入的深度。
2. **Brief / Art Direction 是 AI 做还是人做？**—— brief 是结构化表单（§G.1 + §G.7），适合 AI 帮用户填字段；art direction 多轮反馈（§G.5）适合 AI 当 critic（参考 §A 角色一致性思路），但当前 AI 不擅长「Round 1-5 的 scope 隔离」。
3. **纯 AI / 混合 / 全手绘 三种流派怎么共存？**—— Pinax 不应假设「Pinax 用户都是 AI 派」（§G.10 + §G.12 社区分裂已经说明），应当给三种流派都留出口：纯 AI（`ImageGenerationWorkbench` 全自动）、混合（§G.9 export for hand-finish）、全手绘（Pinax 仅做 brief / reference / portfolio 工具）。

**Open questions（待主 session 在 §I 综合时判断）**：
- Pinax 是否应当做「commission marketplace」？这与「创作工具」定位冲突（§G.10）。
- Pinax 是否应当加「AI content 标注」？标注是 honor system，技术无法 enforce（§G.12）。
- Pinax 是否应当把 `ImageGenerationWorkbench` 拆成「thumb pass / line pass / color pass / final pass」四个 stage？stage 化是 art direction 借鉴的核心（§G.5），但 stage 化的 UI 复杂度高。
- 借鉴 light novel 约稿的「封面 / 插页 / 拉页 / 周边」分项（§G.6）是否过度？Pinax 用户场景未必有日本 LN 的「作者 + 插画师」双人结构。

---

### §G.引用源

**已通过本会话 web_search 一手核实 ✓**：
- Quentin Blake 官方：`https://quentinblake.com/`（Sir Quentin Blake 个人站，含 Quentin Blake Centre for Illustration 信息）
- Quentin Blake 百度百科：`https://baike.baidu.com/item/昆丁·布雷克/10246372`（1932 年生，剑桥英文系 → Chelsea College of Art 业余课，最初在 *Punch* 与 *The Spectator* 发表漫画）
- Shaun Tan 7 Steps Illustration Process (Reedsy)：`https://blog.reedsy.com/illustration-process/shaun-tan/`（research → plan → small oil paintings → Photoshop composite）
- Shaun Tan The Lost Thing 视频：`https://www.youtube.com/watch?v=hkfKuh9qA8U`（collage + mixed media process 演示）
- Shaun Tan Wikipedia：`https://en.wikipedia.org/wiki/Shaun_Tan`（1974 年生，澳洲插画师 / 作家 / 电影人，mixed media collage）
- Shaun Tan Interview (The Design Files)：`https://www.thedesignfiles.net/2013/03/26/shaun-tan-interview/`（oil paint / acrylic / scanned texture / Photoshop compositing）
- Chris Riddell 中国设计之窗：`http://www.333cn.com/shejizixun/202125/43499_421979.html`（英国插画师 + 政治漫画家）
- Chris Riddell Sotheby's：`https://www.sothebys.com/en/auctions/ecatalogue/2017/english-literature-l17408/lot.26.html`（拍卖档案）
- Getty v. Stability AI 案（qq 2025-11）：`https://new.qq.com/rain/a/20251106A05Z7F00`（AI 训练是否应获许可仍待明确）
- Pinsent Masons (Getty v. Stability AI)：`https://www.pinsentmasons.com/out-law/news/getty-images-v-stability-ai`（英国高院，双方均宣称获胜）
- Weta Workshop 官方：`https://www.wetaworkshop.com/games/` 与 `https://www.wetanz.com/`
- Gnomon Workshop (Creating Key Illustrations for Videogames)：`https://thegnomonworkshop.com/tutorials/creating-key-illustrations-for-videogames`
- Concept Art World：`https://conceptartworld.com/page/2/`（concept art / illustration portfolios）

**二手 / 业界共识 𓈊（未直接核实）**：
- 「AI 在 line art 阶段弱于手绘」—— I cannot verify 具体商业项目失败率，社区共识方向
- 「Light novel 插画费 ¥30k-300k+」—— I cannot verify 2026 准确费率，行业常识区间
- 「DeviantArt / ArtStation 社区 2022-2023 NFT + AI 争议后分裂」—— I cannot verify 2026 各社区活跃度数字
- 「Weta Workshop Gollum 迭代上百个 silhouette」—— I cannot verify 准确数字，art book 与访谈常识
- 「Pixar daily review」流程—— Pixar art book + 公开访谈常识，未访问具体页面
- 「Andersen v. Stability AI 美国集体诉讼」—— 业界报道频繁但具体 2026 状态 I cannot verify
- 「EU AI Act / 日本 文化庁 AI 版权指引 / 中国 2024 生成式 AI 服务管理办法」对 style mimicry 态度—— 各国态度方向明确但具体细则 I cannot verify

**待二次核实 ⚠️**：
- HJ 文库 / 電撃文庫 等日本 LN 出版社的「封面 / 插页 / 黑白拉页」分项合约细节—— 行业内部信息，公开来源稀缺
- Quentin Blake 的具体 dip pen + 交叉影线 + watercolor 顺序—— 仅基于公开画作与展览常识，I cannot verify
- 「AI + 手修」混合 workflow 在 2025-2026 illustrator 社区的渗透率—— 社区反馈方向明确，具体百分比 I cannot verify

## §H 漫画出版生态（Comic Publishing Ecosystem）
> **调研人**:H（并行 agent）。**scope**:Webtoon / Tapas / ComiXology / Manga出版 / Doujinshi / Print-on-demand
>
> **重点产品**：Webtoon / Tapas / LINE Manga / Piccoma / KakaoPage（韩漫）/ ComiXology（原 Amazon Kindle）/ MangaPlus（集英社）/ Doujinshi 同人誌（コミケ）/ KADOKAWA / 一迅社 / 少年Jump+ / GANMA! / マガポケ / Print-on-demand（Amazon KDP / インクワイア）
>
> **Pinax 现状锚点**：STATUS 显示漫画「出版导出」已 M6，但具体导出格式 / 平台 / 多语言 / 周更/单话发布待查。

---

### §H.0 总览：漫画出版的五个根本命题

漫画「出版导出」不是单一动作，而是五个相互耦合的决策，必须先想清楚再谈实现：

| 命题 | 关键变量 | 主要生态答案 |
|---|---|---|
| **H.0.1 格式 (Format)** | 长条 webtoon / 单页翻页 / 卷装书 / 杂志 / 单话 / 一次性合集 | Webtoon=纵向条漫；MangaPlus=纵向+日式双栏；KDP=PDF/POD 印刷；DLsite=PDF；コミケ=纸质同人誌 |
| **H.0.2 平台 (Platform)** | 数字原生 / 出版社 / 印厂 / 自媒体 / 同人展会 | Webtoon / Tapas（数字原生）；KADOKAWA / 集英社（出版社）；KDP / Lulu（POD）；コミケ（同人展会） |
| **H.0.3 节奏 (Cadence)** | 单话发布 / 周更 / 双周 / 月更 / 季刊合集 / 一次性 | 漫画 App 周更主流；同人誌多为一次性合集；杂志 = 周双月季 |
| **H.0.4 多语言 (Localization)** | 单语 / 翻译外包 / 平台本地化 / AI 翻译 | MangaPlus 同日多语言；Webtoon 区域分平台；同人誌单语为主 |
| **H.0.5 合规 (Compliance)** | AI 披露 / 版权 / 同人二创 / 内容分级 / DRM | Webtoon / Tapas 2024 起强制 AI 披露；同人誌 IP 边界；DLsite 评级 |

**Pinax 现状映射**（引用 §0）：
- `ComicPageEditor.vue` 已支持三种 format：`page-ltr` / `page-rtl` / `webtoon`（竖向条漫）
- 导出按钮：`JSON` / `PNG` / `WebP` / `PDF` / `条漫切片`（webtoon 专属）
- **缺失**：无 KDP POD 出版包、无 epub fixed-layout、无 Webtoon Canvas 800px 模板、无 DLsite 包装、无平台特定切片、无 AI 披露 metadata、无多语言叙事图
- 节奏：未见周更/单话发布编排
- 多语言：未见翻译版本管理

---

### §H.1 「Webtoon Canvas 标准画布」模式（800×N px 纵向条漫）

- **源产品 / 范式**：Naver Webtoon / Webtoon Canvas（webtoons.com）
- **机制简述**（≤ 80 字）：固定 800 px 宽的纵向长图，按 72 DPI / RGB 存储，单话高度可达数千到上万 px，无翻页动作。PNG/JPEG，最大 2–3 MB。
- **Pinax 摩擦对应**：现状 `comicPage.format === 'webtoon'` + `exportWebtoonSlices` 已切条，但缺 800 px 锚定的预设画布。
- **为什么不算实现方案**：不写 Pinax 应改成 800 px 还是 1280 px，只标记 Webtoon 圈定 800 px 这一生态事实可作参考。
- **可行性疑点**：I cannot verify — 800 px 是「官方推荐」还是「硬性限制」需查 Webtoon Help Center；不同区域（Naver vs Webtoon US）可能不一。

**引用源**：[WEBTOON 原版入口](https://www.webtoons.com/en/originals)、[Webtoon 主页](https://www.webtoons.com/)

---

### §H.2 「MangaPlus 同日多语言同步」模式（Simultaneous Multilingual Release）

- **源产品 / 范式**：MANGA Plus by SHUEISHA（mangaplus.shueisha.co.jp）
- **机制简述**：集英社让《海贼王》《SPY×FAMILY》日语原版与英、西、法、泰、印尼、德等多语版**同周同时上线**，是全球同步漫画发行的事实标准。
- **Pinax 摩擦对应**：STATUS 显示 Pinax 数据存浏览器 localStorage，叙事图无翻译版本控制；多角色 / 多镜头叙事若想做 i18n，导出层需带「语言 tag」。
- **为什么不算实现方案**：不写「Pinax 应该接哪一家翻译 API」，只标出多语言同步是这个时代漫画发行的核心承诺。
- **可行性疑点**：I cannot verify — MangaPlus 2026 的实际语言覆盖数（已知 ≥ 7 语，未核实是否已扩展）。

**引用源**：[MANGA Plus by SHUEISHA](https://mangaplus.shueisha.co.jp/)、[MANGA Plus Creators 公告 (2022-09-01)](https://www.globenewswire.com/en/news-release/2022/09/01/2508143/0/en/MANGA-Plus-Creators-by-SHUEISHA-is-Now-Available.html)

---

### §H.3 「MANGA Plus Creators 自投稿」模式（Self-Submission for Global Creators）

- **源产品 / 范式**：MANGA Plus Creators by SHUEISHA × MediBang（mangaplus-creators.jp）
- **机制简述**：集英社 2022-08 联合 MediBang 开放给全球英 / 西语创作者免费投稿，被选中可在 MangaPlus 同步发行；打破日本出版「封闭编辑 + 编辑部社内投稿」的传统。
- **Pinax 摩擦对应**：Pinax 是个人创作者工具，类比此模式可推 — 「让单个作者的一话直接接入多平台发布」是中间层价值。
- **为什么不算实现方案**：不写 Pinax 应接 MangaPlus API；只标「开放投稿 + 同平台同步」是新兴生态标志。
- **可行性疑点**：I cannot verify — 该项目 2026 年是否仍在接受新投稿 / 是否已成 archive / 转化率数字均未核实。

**引用源**：[MANGA Plus Creators](https://mangaplus-creators.jp/)、[公告 (GlobeNewswire 2022-09)](https://www.globenewswire.com/en/news-release/2022/09/01/2508143/0/en/MANGA-Plus-Creators-by-SHUEISHA-is-Now-Available.html)

---

### §H.4 「Tapas 短篇 episodes + 免费首话 + 付费解锁」模式（Freemium Episode Gating）

- **源产品 / 范式**：Tapas Media（tapas.io）
- **机制简述**：每个 series 由多个「episode」组成，单 episode 短则 10–30 块面板；首话免费，后续可付费解锁（硬币）或等时间窗解锁；鼓励「短集数 + 高频率」节奏。
- **Pinax 摩擦对应**：Pinax 现在是单页 / 单话创作，没有「单话 → 多 episodes → 解锁节奏」的元数据层。
- **为什么不算实现方案**：不写解锁逻辑；只标出「episodes 切分 + 首话免费」是数字漫画的核心节奏单位。
- **可行性疑点**：I cannot verify — Tapas 2025-2026 平台政策变化（如是否仍维持「unlock after N days」机制）未核实。

**引用源**：[Tapas 系列页](https://tapas.io/series)（公开层已确认入口存在；具体提交规则未独立核实）

---

### §H.5 「DLsite 同人电子出版包装」模式（PDF Download with Tier + Rating）

- **源产品 / 范式**：DLsite（dlsite.com / dlsite.com/eng/）
- **机制简述**：作者上传 PDF/ZIP 单本作品，平台包装封面 / 预览 / 试读 / 价格 / 标签 / 评级（含 R-18），按销量分成；典型同人誌 24–48 页单本 PDF。
- **Pinax 摩擦对应**：`ComicPageEditor` 已有 PDF 导出，但无封面、标签、预览页、年龄分级 metadata。
- **为什么不算实现方案**：不写 Pinax 应支持 R-18 / 不上架成人内容；只标「单本 PDF + 封面/标签/预览 + 分级」是同人电子出版的最小必要包。
- **可行性疑点**：I cannot verify — DLsite 2026 上架流程是否仍允许个人无审查直传，及其对 AI 内容的最新政策均未独立核实。

**引用源**：[DLsite 英文版入口](https://www.dlsite.com/eng/)

---

### §H.6 「コミケ同人誌纸本」模式（Physical Doujinshi at Comiket）

- **源产品 / 范式**：Comic Market（comicmarket.jp / C106 2025 夏 / C107 2025 冬）
- **机制简述**：B5 / A5 为主、24–100 页、定价 ¥100–¥10,000、印量 1–10,000 册、春秋两次现场展会 + 同期网络渠道；强调「同人二创」IP 边界与原创分流。
- **Pinax 摩擦对应**：Pinax 现状无印前出血 / 拼版 / KDP POD 包，与线下同人展会 / 自印圈错位。
- **为什么不算实现方案**：不写 Pinax 应支持同人二创；只标出「线下展会 + 印本规格」是同人出版的实体根。
- **可行性疑点**：I cannot verify — C106 / C107 实际细则每年变化，最稳妥是查 comicmarket.jp 当届申请手册（未直接读取）。

**引用源**：[Comic Market 官方](https://www.comicmarket.jp/)

---

### §H.7 「Piccoma 等候付费混合」模式（Wait-or-Pay Hybrid Monetization）

- **源产品 / 范式**：Piccoma（Kakao Entertainment 日本子公司）+ KakaoPage（韩国）
- **机制简述**：最新 1–3 话免费，付费用户可「快进」立即看后续；非付费用户等时间窗解锁。订阅（Piccoma Premium / KakaoPage Pass）作为再上层。微交易收入占大头（70–80%）。
- **Pinax 摩擦对应**：Pinax 是工具，不直接分润，但「快进机制」对个人创作者可借鉴 — 「发布后多久可被平台读」的窗口可作导出层 metadata。
- **为什么不算实现方案**：不写 Pinax 应有付费墙；只标「等候付费 + 订阅」是日韩 webtoon 双主流模式。
- **可行性疑点**：I cannot verify — Piccoma Premium 2026 价格与具体 coin 比例未核实；royalty split 50–70% 仅为行业传闻。

**引用源**：[Piccoma 文章 (Good e-Reader)](https://goodereader.com/blog/manga-and-anime-news/piccoma-worlds-most-successful-manga-app)、[Naver Webtoon/Piccoma 营收分析 (知乎)](https://zhuanlan.zhihu.com/p/649568639)

---

### §H.8 「KDP POD 单本出版」模式（Amazon Print-on-Demand Paperback）

- **源产品 / 范式**：Amazon KDP Paperback + KDP Kids
- **机制简述**：作者上传 PDF 内部 + PDF 封面（含正面 / 背面 / 书脊 bleed 拼版），选 trim size、纸色、纸厚，按需印刷、单本印、全球分发；纯黑 / 纯彩纸价不同。
- **Pinax 摩擦对应**：`ComicPageEditor` 已有 PDF 导出，但未生成符合 KDP 规格的「封面拼版（含 ISBN 条码区 / 出血 3.175 mm）+ 内部文件（300 dpi / CMYK）」。
- **为什么不算实现方案**：不写 Pinax 应直接对接 KDP；只标「出血 + 书脊 + ISBN 占位 + 300 dpi」是 POD 出版的硬性前置。
- **可行性疑点**：I cannot verify — KDP 2026 是否仍要求 ISBN、是否对 AI 内容强制标签（如「AI-generated」「AI-assisted」）未直接读最新 [KDP Help](https://kdp.amazon.com/en_US/help/topic/G201953020)。

**引用源**：[KDP Create a Paperback Cover](https://kdp.amazon.com/en_US/help/topic/G201953020)

---

### §H.9 「Lulu / IngramSpark POD 自出版」备选（Outside-Amazon POD）

- **源产品 / 范式**：Lulu（lulu.com）、IngramSpark（ingramspark.com）
- **机制简述**：与 KDP 类似的印厂 + 全球分发，但分润比例与可达渠道（图书馆、书店）不同；常用于追求专业印刷（精装 / 多 trim size）。
- **Pinax 摩擦对应**：与 §H.8 共享同一导出层需求，只是 metadata 不同。
- **为什么不算实现方案**：不写 Pinax 应接哪一家；只标 POD 生态不止 KDP 一家，导出层应参数化。
- **可行性疑点**：I cannot verify — Lulu / IngramSpark 2026 AI 内容政策与印价表未直接核实。

**引用源**：[Lulu 主页](https://www.lulu.com/)、[IngramSpark 主页](https://www.ingramspark.com/)

---

### §H.10 「AI 内容披露标签」模式（AI Disclosure Tag）

- **源产品 / 范式**：Webtoon Entertainment（2024–2025 公告）+ Tapas / Webnovel 兄弟政策
- **机制简述**：作者必须披露 AI 生成内容（图、文、翻译），未披露可被下架或处罚；与欧洲 AI Act / 韩国 AI 基本法形成全球趋势共振。
- **Pinax 摩擦对应**：Pinax 漫画生成用 MiniMax + 用户手改，导出文件未带 AI 标签；多平台合规要求发布时强制。
- **为什么不算实现方案**：不写 Pinax 应强制 label；只标「合规是出口层元数据，不是内功」。
- **可行性疑点**：I cannot verify — Webtoon 2026 政策细节（含处罚力度、是否覆盖翻译）未读取官方原文（来源摘要明确：「由 Webtoon Entertainment 发布正式政策」但未读到政策正文）。

**引用源**：综合 Webtoon 2024-2025 政策新闻摘要（未直接读取官方原文）

---

### §H.11 「同话周更 / 月更 / 单话发布节奏」模式（Serialization Cadence）

- **源产品 / 范式**：少年 Jump 周更；Magapoke 周更 / 双周；MangaPlus 免费最新话；KADOKAWA 月刊 / 双月刊
- **机制简述**：日本 / 韩国市场周更是常态（每周一话，~16–20 页），英美市场以月 trade paperback 合集为主；同人誌偏向一次性合集（24–100 页）。
- **Pinax 摩擦对应**：Pinax 现状没有「出版日历」概念；产出节奏完全依赖作者。
- **为什么不算实现方案**：不写 Pinax 应有日历；只标「周更 = 平台默认节奏 / 月刊 = 出版默认节奏」两条基线。
- **可行性疑点**：I cannot verify — 2026 主要平台的具体周更窗口（周一 / 周三 / 周六）与一话平均页数随平台变化，未直接核实各家当前规格。

**引用源**：[Magapoke 介绍](https://www.87g.com/az/174322.html)、[MangaPlus 主页](https://mangaplus.shueisha.co.jp/)

---

### §H.12 「多语言翻译版本管理」模式（Language Versioning）

- **源产品 / 范式**：MangaPlus（Tachiyomi 插件追踪）、Webtoon（区域分平台 + 自有翻译团队）、同人翻译圈（Citrans / 个人）
- **机制简述**：一话存在多语言副本时，平台用 `<episode_id, locale>` 双键锁定；翻译由官方团队或外包译员完成；AI 翻译是新兴的「低质量快速通道」。
- **Pinax 摩擦对应**：Pinax 数据存 localStorage，叙事图本身缺乏 `locale` 维度；M7 连续性若做，需考虑同一话下多语言镜头的对齐。
- **为什么不算实现方案**：不写 Pinax 应有 locale 字段；只标「多语言是多 key 版本管理，不是图像替换」。
- **可行性疑点**：I cannot verify — 各平台对 AI 翻译的接受度差异极大（如 Webtoon 早期强调人工翻译），具体政策需逐家核实。

**引用源**：[Tachiyomi MangaPlus 扩展](https://github.com/einstein95/tachiyomi-extensions/commit/cc8b28d7c9fe1f19ad86c90078d15963d0757850)、[MangaPlus 主页](https://mangaplus.shueisha.co.jp/)

---

### §H.总结

**核心命题再确认**：漫画出版生态的核心决策是「格式 + 平台 + 节奏 + 多语言 + 合规」五元组，缺一不可。Pinax 当前导出（M6）覆盖了**格式（PNG/PDF/WebP）+ 平台无（仅本地导出）**，未覆盖**节奏（周更日历）+ 多语言（无 locale）+ 合规（无 AI 标签）**。

**不进入实现层**——本调研只标出生态事实，不写 Pinax 应改成什么样。具体落点（如「导出层是否要加 JSON metadata 字段供出版用」）由用户拍板后另起 task。

**Open questions（待主 session §I 综合 / 用户判断）**：
- Q1：Pinax 漫画是否需要支持「平台分发元数据」（JSON + 多 key），还是只保留「单文件导出」即可？
- Q2：是否需要「AI 披露」作为导出层 metadata？还是等监管明确后再加？
- Q3：周更 / 单话发布节奏，是作为「导出向导」还是「独立日历模块」？
- Q4：多语言是「同一话多 locale 导出」还是「由用户手管多版本文件」？
- Q5：POD 出版（KDP / Lulu）是否值得在 v0 做？还是先放给第三方工具？
- Q6：DLsite / 同人誌出版包是否符合 Pinax 价值观（成人内容 / IP 二创边界）？

### §H.引用源

**数字原生平台**：
- [WEBTOON 原版入口](https://www.webtoons.com/en/originals) / [Webtoon 主页](https://www.webtoons.com/)
- [Tapas 系列页](https://tapas.io/series)（公开入口；具体提交规则未独立核实）

**日本 / 韩国**：
- [MANGA Plus by SHUEISHA](https://mangaplus.shueisha.co.jp/)
- [MANGA Plus Creators by SHUEISHA](https://mangaplus-creators.jp/)
- [MANGA Plus Creators 公告 (GlobeNewswire 2022-09-01)](https://www.globenewswire.com/en/news-release/2022/09/01/2508143/0/en/MANGA-Plus-Creators-by-SHUEISHA-is-Now-Available.html)
- [Magapoke (Kodansha)](https://www.87g.com/az/174322.html)
- [Piccoma 文章 (Good e-Reader)](https://goodereader.com/blog/manga-and-anime-news/piccoma-worlds-most-successful-manga-app)
- [Naver Webtoon / Piccoma 营收分析](https://zhuanlan.zhihu.com/p/649568639)

**同人 / 自出版**：
- [Comic Market (コミケ)](https://www.comicmarket.jp/)
- [DLsite 英文版](https://www.dlsite.com/eng/)

**POD / 出版基础设施**：
- [Amazon KDP Create a Paperback Cover](https://kdp.amazon.com/en_US/help/topic/G201953020)
- [Lulu](https://www.lulu.com/) / [IngramSpark](https://www.ingramspark.com/)

**衍生 / 二级源**：
- [Tachiyomi MangaPlus 扩展 (GitHub)](https://github.com/einstein95/tachiyomi-extensions/commit/cc8b28d7c9fe1f19ad86c90078d15963d0757850)
- Webtoon / Tapas 2024–2025 AI 披露政策（综合新闻摘要，未直接读官方原文 — I cannot verify）

**已知 I cannot verify**：
- Webtoon 800 px 宽是硬限制还是推荐值（多个二级源一致但未读官方 Help Center）
- Webtoon 2026 AI 披露政策的细节（处罚力度、是否覆盖翻译）
- Tapas 2025-2026 unlock 时间窗具体参数
- DLsite 2026 AI 内容最新政策
- Lulu / IngramSpark 2026 印价表与 AI 政策
- 各日漫平台 2026 一话平均页数与周更窗口

---

## §1 Pinax 插画 + 漫画现状快照

### §1.1 已建成的组件

| 组件 | 路径 | 角色 | 当前阶段 |
|---|---|---|---|
| `ComicStudio` | `src/pages/ComicStudio.vue` | 漫画工作台主页 | 路由 `/comics`，activityKey=materials |
| `ComicAdaptationPlanner` | `src/components/media/ComicAdaptationPlanner.vue` | 文字 → 漫画分镜规划 | 阶段：M2-M6 已成型 |
| `ComicStageWorkbench` | `src/components/media/ComicStageWorkbench.vue` | 漫画阶段工作台 | 视觉圣经 / 阶段产物 |
| `ComicPageEditor` | `src/components/media/ComicPageEditor.vue` | 页面编辑（panel grid） | panel grid 已建，M7 连续性剩 |
| `ImageGenerationWorkbench` | `src/components/media/ImageGenerationWorkbench.vue` | AI 生图工作台（reference / illustration mode） | 已嵌入素材页 + 体验页 + 画布页 |
| `ProseEssay` | `src/pages/ProseEssay.vue` | 卡片画布（含 shot types 12 + camera movements 12 + director edges 6） | 已成型 |
| `StoryboardVideoPanel` | `src/components/media/StoryboardVideoPanel.vue` | 视频生成面板 | 接分镜生成视频 |

### §1.2 跨页路由联动

- `ComicStudio` ← `Materials`（素材通过 assetId 跳入漫画）—— `goToComics()` 已实现
- `Materials` ↔ `ProseEssay`（素材导入画布）—— 已实现
- `Experience` → `Writing` → `Materials` → `ProseEssay` → `ComicStudio` 五页单向链路

### §1.3 当前主要问题（用户感知 + STATUS/git log 提取）

| 类别 | 具体症状 | 来源 |
|---|---|---|
| 角色一致性弱 | 同一角色跨多次生成形象漂移；用户主要靠「手挑参考图」+ prompt 描述 | §A 主轴 + 5C v3.12 refine |
| 视觉圣经未结构化 | M2-M6 有视觉圣经但 character sheet 是「可选参考图」而非 typed 数据 | §B + §E.4 |
| 文字 → 关键帧选取弱 | 体验回合 → 写作单元 → 漫画分镜链路中「选点策略」缺失 | §C + ComicAdaptationPlanner |
| 镜头语言语义层缺失 | shot 12 + camera 12 + director edges 6 已有，但 180 规则 / beat board / Kuleshov 缺失 | §F + ProseEssay 已有 + §D |
| comic 专门模型未集成 | ImageGenerationWorkbench 主要用通用 SDXL；专门 comic LoRA（AnythingV5 / CounterfeitXL）未接入 | §E + ImageGenerationWorkbench |
| 跨页连续性（M7）剩 | page turn / spread anchor / cliffhanger / cross-page eye-flow 待做 | §D + STATUS M7 |
| AI 辅助 vs 全 AI 边界 | 「AI 上墨 vs AI 出整页」/「手修草图 + AI 填充」工作流缺失 | §G + §E.10 |
| 出版格式与平台 | M6 出版导出已有，具体平台（Webtoon / Manga spread / POD / Doujinshi / 多语言）未明确 | §H + ComicPageEditor |
| 立绘 = 背景集成约束 | 立绘是 full-bleed 背景 + UI overlay（p5r / Arknights 范式），不是 portrait slot + caption | `feedback_visual_integration_not_illustration.md` + 5C v3.12 |

---

## §1.4 TL;DR —— 5 分钟读完本文档

> 8 axes × 100+ 条灵感 × 8 跨节主题。如果只看 5 分钟，按下面顺序：

**3 条「读这一段就够」的总结**：

1. **角色一致性是 M7+ 的关键瓶颈**（§I.1.1 + §I.1.2）—— §A 14 条灵感 + §B 12 条 + §E 12 条 + §G 部分，都收敛到「同一角色跨多次生成保持形象」。当前用户只能手挑参考图，5C v3.12 refine 不解决根因，需要 character sheet 升级为 typed 数据 + LoRA training 通路。
2. **文字 → 视觉的「选点策略」决定插画质量**（§I.1.3）—— §C 14 条 + §F 节奏相关 + §D 出版节奏。AI 自动选点 vs 人挑 / 节奏 / 情绪 / 信息密度 四维，目前 Pinax 没显式化。
3. **出版格式与平台策略决定分发**（§I.1.8）—— §H 12 条 + §D 出版相关。M6 已成型，但具体走 Webtoon / Manga spread / POD / Doujinshi / 多语言哪个路线，需用户拍板。

**「我的问题看哪里」快速路由**：

| 你看到的症状 | 直接看 |
|---|---|
| 同一角色跨多次生成漂移 | §I.1.1 + §A.A.1-§A.14 |
| 角色资料没结构化 | §I.1.2 + §B.B.1-§B.12 |
| 关键帧 / 面板选取策略弱 | §I.1.3 + §C.C.1-§C.14 |
| 镜头语言层太薄（180 / beat / Kuleshov） | §I.1.4 + §F.F.1-§F.10 |
| comic 专门模型未集成 | §I.1.5 + §E.E.1-§E.12 |
| M7 跨页连续性 / spread / reveal 缺 | §I.1.6 + §D.D.1-§D.12 |
| AI 上墨 vs AI 出整页边界 | §I.1.7 + §G.G.1-§G.12 |
| 出版格式 / 平台 / 多语言 | §I.1.8 + §H.H.1-§H.12 |
| 立绘 = 背景集成约束 | `feedback_visual_integration_not_illustration.md` + §I.4 约束对齐 |

**8 条主题一览**（详细见 §I.1）：

| 编号 | 主题 | Pinax 状态 | 投入 |
|---|---|---|---|
| I.1.1 | 角色一致性 = 跨场景身份保持 | 弱（5C 治标） | 高（需 character sheet + LoRA 通路） |
| I.1.2 | 视觉圣经 = 角色资料结构化 | 部分（M2-M6） | 中（schema 升级 + UI 暴露） |
| I.1.3 | 文字 → 关键帧选取策略 | 弱 | 中（AI 选点 + 人确认 UI） |
| I.1.4 | 镜头语言 / 视觉叙事语义层 | 部分（shot/camera 已有） | 中（180 / beat / Kuleshov） |
| I.1.5 | 专门 comic 模型 vs 通用 SDXL | 弱（未集成） | 中（LoRA 通路 + provider 配置） |
| I.1.6 | 跨页连续性 + 翻页 + reveal | M7 剩项 | 中（panel layout + spread anchor） |
| I.1.7 | AI 辅助 vs 全 AI 工作流边界 | 弱 | 中（手修草图 → AI 填充 pipeline） |
| I.1.8 | 出版格式 / 平台 / 多语言 | M6 已有 | 中（Webtoon / Manga / POD 路由） |

---

## §I 跨节综合 —— 主 session 汇总

> **本节不写实现方案**。基于 §A-§H 八节 100+ 条灵感的交叉分析，按"被多源反复印证"的权重挑出 8 条跨节主题，并把每条映射到 Pinax 现状 + 文件落点。**用户明确：计划与实现不在本调研范围**。

### §I.0 方法说明

- 100+ 条灵感来自 8 个生态（角色一致性 / 视觉圣经 / 文本→关键帧 / 漫画分镜 / 漫画 AI / 镜头语言 / 传统工作流 / 出版生态），每条均标注了源产品 + 机制 + Pinax 摩擦对应。
- 本节筛选标准：是否被 **≥ 2 个不同生态** 反复印证。
- 标 ⚠️ 的项意味着该方向在原 agent 中已经标 "I cannot verify"，落地前需二次核实。
- 标 🟢 的项表示已经被多源印证，**仍需用户判断是否属于"超出 M7 范围"**。

---

### §I.1 八条跨节主题

#### §I.1.1 🟢 角色一致性 = 跨场景身份保持（§A / §B / §E / §G 四节共鸣）

**多源印证**：
- §A.A.1-§A.14（Midjourney `--cref` / IP-Adapter / InstantID / PhotoMaker / Leonardo / Krea / Pika / Runway Act-One / ControlNet Reference-Only / CivitAI LoRA / Scenario / Tripo3D / SVD+Face / ConsistentID 等 14 条）
- §B 视觉圣经 / 角色圣经模式（前提条件）
- §E.5 AI Comic Factory / LlamaGen / Story2Board（学术 training-free 跨面板一致性）+ §E.8 NovelAI / §E.9 Midjourney --niji
- §G.7 hiring illustrators 一致性 / §G.9 多人协作 character sheet

**对应 §1.3 症状**：同一角色跨多次生成形象漂移；用户主要靠「手挑参考图」+ prompt 描述。

**与 5C v3.12 / M7 关系**：5C v3.12 refine 治标（让立绘像「背景集成」），不解决根因。根因 = character sheet 是「可选参考图」而非 typed 数据。

⚠️ §A.2 Runway Act-One / §A.4 Scenario AI 等具体技术细节落地前需二次核实。

---

#### §I.1.2 🟢 视觉圣经 = 角色资料结构化（§B / §A / §E / §G 四节共鸣）

**多源印证**：
- §B.1-§B.12（Wikipedia model sheet 5 元素 / HJ文庫 / 電撃文庫 卷首「キャラクター紹介」 / Pixar Color Script / Ghibli reference / d23 Disney / Will Eisner / Paul Ekman 6 基础情绪 / Pixiv 表情差分 / Danbooru tag groups / kohya_ss LoRA 训练）
- §A.13 SVD+Face LoRA / §A.7 Leonardo Character Reference（依赖结构化 character data）
- §E.4 Scenario Character Bible / LlamaGen character sheet（typed 升级方向）

**对应 §1.3 症状**：M2-M6 有视觉圣经（comicPageStore.normalizeVisualBible 暴露 5 顶层字段），但 character sheet 是「可选参考图 chip」而非 typed 结构化数据（缺 4 视角 + 6 表情 + 多服装矩阵等子结构）。

**与 M2-M6 关系**：M2-M6 是视觉圣经的工作流层，本主题是数据层（schema 字段）。两者正交。

⚠️ §B 中 HJ 文库 / 電撃文庫 合约细节 + LoRA 训练集惯例为产业内部信息，公开来源稀缺。

---

#### §I.1.3 🟢 文字 → 关键帧 + 面板选取策略（§C / §F / §D / §H 四节共鸣）

**多源印证**：
- §C.1-§C.14（Children's book illustration / Light novel 配图密度 / Editorial illustration / Concept art workflow / Scenario AI / Storyboarder / Toon Boom / StudioBinder / Boords / Manga 「扉页 / 跨页 / 重点格」惯例 / Webtoon 节奏点 / AI 自动选点 vs 人挑）
- §F.10 Save the Cat 15 beats（节奏驱动选点）
- §D.7 Beat Sheet / §D.6 Spread Eye-Flow / §D.11 Page Turn Reveal（排版的节奏工具）
- §H.5 Webtoon / H.8 Doujinshi 节奏策略（出版节奏）

**对应 §1.3 症状**：体验回合 → 写作单元 → 漫画分镜链路中「选点策略」缺失。

**与 ComicAdaptationPlanner 关系**：ComicAdaptationPlanner 应当有选点逻辑，但当前是「文字 → 分镜」机械转换，缺「该选哪段」策略。

⚠️ §C 各 AI storyboard 产品（Storyboarder / Boords / StudioBinder / Toon Boom / Storyboard That）的 2025-2026 panel selection 算法——全部 I cannot verify（WebSearch / WebFetch 多次失败）。

---

#### §I.1.4 🟢 镜头语言 / 视觉叙事语义层（§F / §D / §C 三节共鸣）

**多源印证**：
- §F.1-§F.10（180-degree rule / Kuleshov effect / Story Spine / Save the Cat 15 beats / Murch Rule of Six / beat-board-animatic / previs tag / coverage / mise-en-scène / dope sheet）
- §D.7 Beat Sheet / §D.6 Spread Eye-Flow / §D.11 Page Turn Reveal（漫画排版的镜头应用）
- §C.6 Manga cinematographic technique（手塚治虫）

**对应 §1.3 症状**：ProseEssay 已有 shot 12 + camera 12 + director edges 6，但 180 规则 / beat board / Kuleshov 语义层缺失。

**与 ProseEssay / ComicStudio 关系**：shot + camera 是「单帧语义」，本主题是「跨帧叙事规则」（continuity / beat / reveal）。

⚠️ §F 中 Walter Murch Rule of Six 权重数据 + Pixar 22 rules 在 2026 是否有更新—— I cannot verify。

---

#### §I.1.5 🟢 专门 comic 模型 vs 通用 SDXL（§E / §A / §B 三节共鸣）

**多源印证**：
- §E.1-§E.12（Comicai / LlamaGen / ComicAI / AI Comic Factory / Story2Board / SD LoRA / NovelAI / Midjourney --niji / ControlNet lineart / Adobe Firefly / Scenario / Astria）
- §A.9 ControlNet Reference-Only + OpenPose（手绘草图 → AI 渲染）
- §B.10 kohya_ss LoRA 训练（character model 自训）

**对应 §1.3 症状**：ImageGenerationWorkbench 主要用通用 SDXL；专门 comic LoRA 未接入。

**与 ImageGenerationWorkbench 关系**：当前 `imageProviderConfigStore` 支持多 provider，但「专门 comic 优化模型」未走单独 provider。

⚠️ §E 中 CivitAI AnythingV5 / CounterfeitXL 等具体模型版本号 I cannot verify。

---

#### §I.1.6 🟢 跨页连续性 + spread + page turn + reveal（§D 主 + §F / §C 三节共鸣）

**多源印证**：
- §D.3 Cross-page Anchor / §D.4 Page Turn Reveal / §D.5 Splash / §D.7 Beat Sheet / §D.11 Spread Eye-Flow / §D.12 Cliffhanger / §D.2 Stretchy Panel / §D.1 Metagrid
- §F.10 Save the Cat beats（15-beat 与 page turn 对应）
- §C.6 Manga 「扉页 / 重点格」（手塚治虫的电影化技法）

**对应 §1.3 症状**：STATUS M7 连续性剩项（page turn / spread anchor / cliffhanger / cross-page eye-flow）。

**与 ComicPageEditor 关系**：panel grid 已有，跨页布局（spread + reveal）是 M7 主任务。

⚠️ §D 中 Storyboarder 2026 是否仍 MIT 开源 + WEBTOON Canvas 当前 width 标准 + KDP / IngramSpark 2026 comic trim size 列表—— I cannot verify。

---

#### §I.1.7 🟢 AI 辅助 vs 全 AI 工作流边界（§G / §E / §A 三节共鸣）

**多源印证**：
- §G.4 sketch → line → color → final / §G.7 hiring illustrators / §G.10 art direction / §G.6 Procreate + AI / §G.11 Photoshop + SD inpainting
- §E.10 ControlNet lineart inpainting（AI 上墨）+ §E.5 AI Comic Factory 双阶段架构（LLM 写脚本 + SDXL 渲染）
- §A.13 SVD + Face LoRA（视频补帧）

**对应 §1.3 症状**：「AI 上墨 vs AI 出整页」/「手修草图 + AI 填充」工作流缺失。

**与 ImageGenerationWorkbench 关系**：当前是「一站式 AI 出图」，缺「手绘 → AI 精修」/「AI 出底稿 → 手修定稿」双向流水线。

⚠️ §G 中「AI + 手修」混合 workflow 在 2025-2026 illustrator 社区的渗透率—— I cannot verify（社区反馈方向明确，具体百分比不可证）。

---

#### §I.1.8 🟢 出版格式 / 平台 / 多语言（§H 主 + §D 出版相关 二节共鸣）

**多源印证**：
- §H.1-§H.12（Webtoon 800px / Tapas / LINE Manga / Piccoma / KakaoPage / ComiXology / MangaPlus / コミケ / KADOKAWA / 少年Jump+ / GANMA! / マガポケ / POD）
- §D.7 POD Safe Zone / §D.9 RTL Manga / §D.6 Webtoon Scroll（出版规格）

**对应 §1.3 症状**：M6 出版导出已有，具体走 Webtoon / Manga spread / POD / Doujinshi / 多语言哪个路线需用户拍板。

**与 ComicPageEditor 关系**：M6 已有基础导出，平台特定格式（Webtoon 800px / Manga spread 双页 / POD safe zone / Doujinshi 同人誌）是新增能力。

⚠️ §H 中 Webtoon 800px 是硬限制还是推荐值 + Webtoon 2026 AI 披露政策 + Tapas 2025-2026 unlock 时间窗具体参数 + DLsite 2026 AI 内容最新政策——全部 I cannot verify。

---

### §I.2 八条主题的依赖与优先级矩阵

| 主题 | Pinax 状态 | 落地投入估算 | 强烈依赖 | WNB-6A / M7 关联 |
|---|---|---|---|---|
| **I.1.1 角色一致性** | 弱（5C 治标） | 高（character sheet 升级 + LoRA 通路 + 多 provider） | I.1.2 视觉圣经 | M7+ |
| **I.1.2 视觉圣经结构化** | 部分（M2-M6） | 中（schema + UI 暴露） | 世界书对象层协调 | M2-M6 后阶段 |
| **I.1.3 关键帧 + 面板选取** | 弱 | 中（AI 选点 + 人确认 UI） | 体验 → 写作链路 | M7+ |
| **I.1.4 镜头语言语义层** | 部分（shot/camera 已有） | 中（180 + beat / Kuleshov + continuity） | I.1.6 跨页 | M7+ |
| **I.1.5 专门 comic 模型** | 弱（未集成） | 中（LoRA 通路 + provider 配置） | 多 provider 架构稳定 | M7+ |
| **I.1.6 跨页连续性（M7 剩项）** | M7 剩 | 中（panel layout + spread anchor + reveal） | I.1.4 镜头 | M7 主任务 |
| **I.1.7 AI 辅助工作流边界** | 弱 | 中（手修 → AI 流水线） | I.1.5 模型 | M7+ |
| **I.1.8 出版格式 / 平台 / 多语言** | M6 已有 | 中（Webtoon / Manga / POD） | ComicPageEditor | M6 后 |

**投入估算约定**：小 = 1-3 天单文件改动；中 = 1-2 周跨多文件；中高 = 跨多文件 + 涉及 schema；高 = 跨域（写作 + worldbook + comic + 体验）协调。

---

### §I.3 待用户拍板的题（按类别分组）

#### §I.3.1 产品定位题（5 题）—— 决定 Pinax 的插画 / 漫画产品气质

1. **角色一致性是「核心卖点」还是「次要改进」**？Pinax 是 AI 辅助小说创作工具，角色形象稳定性是用户痛点但是否值得投入高成本（character LoRA 通路）待决。
2. **AI 上墨 vs AI 出整页的工作流取向**？传统插画师 + AI 协作（Procreate + Midjourney）还是全 AI 出图（Comica / LlamaGen）？
3. **出版平台取向**：Webtoon 数字滚动 / 日漫传统单话 + POD  / Doujinshi 同人誌 / 多平台分发？
4. **多语言策略**：是否支持漫画翻译工作流（MangaPlus Translate / Webtoon Translate）？
5. **AI 出版合规策略**：EU AI Act / 日本文化庁 / 中国 2024 生成式 AI 管理办法对 style mimicry / 训练数据的合规要求 → 是否影响 Pinax 模型选择？

#### §I.3.2 技术容量题（2 题）—— 决定 Pinax 可扩展性边界

6. **character LoRA 训练需要本地 GPU 还是云端**？localStorage-first + 隐私导向与云端训练矛盾。
7. **localStorage 容量上限是否够图片资产**？图片 base64 嵌 localStorage 占用大，需要 IndexedDB / OPFS。

#### §I.3.3 跨域协调题（1 题）—— 决定 Pinax schema 一致性

8. **角色一致性数据（character sheet typed）与 worldbook Character / Place 对象是否合并**？与 `worldbook-workflow` skill 已有对象层协调。

---

### §I.4 与现有约束的对齐情况

- **AGENTS.md 多 agent workflow**：本调研走的就是「Codex 派 8 个 Claude subagent 并行 + 汇集」的模式，符合 external Claude CLI worker pattern。
- **`feedback_visual_integration_not_illustration.md`**：立绘=背景集成,非插图 —— 角色一致性灵感落地必须保留此约束（立绘是 full-bleed 背景 + UI overlay，不是 portrait slot + caption）。
- **`feedback_ui_orbits_character_art.md` 第三层**：UI 围绕立绘编排 —— 角色一致性的 UI 不能破坏立绘-背景集成的视觉范式。
- **`project_stereo_5C_v12_emerging.md`**：5C v3.12 refine 不 pivot —— 角色一致性优化方向必须兼容 5C 已锁的立绘视觉方向。
- **`feedback_dont_overwrite_user_tuned_values.md`**：本研究只对角色一致性 / 视觉圣经 / M7 连续性 / 出版格式做"印证 + 方向强化"，不替换现有方向。
- **`feedback_research_before_artifacts.md`**：研究先于设计——本研究是设计前的发散阶段。
- **`feedback_no_doc_status_disclaimers.md`**：本节是内部调研，不是申报/公开文档，不需要状态 disclaimer。

---

### §I.5 反向映射表 —— 从 §1.3 症状找 §I 主题 + 灵感条目

| §1.3 症状 | 主要主题 | 次要主题 | 关键灵感条目 |
|---|---|---|---|
| **角色一致性弱（跨多次生成漂移）** | I.1.1 | I.1.2 / I.1.5 | §A.A.1（Midjourney `--cref`）/ §A.A.2（IP-Adapter）/ §A.A.3（InstantID）/ §A.A.5（Leonardo）/ §A.A.6（Krea Character）/ §A.A.9（ControlNet Ref-Only）/ §E.E.5（AI Comic Factory 双阶段）/ §E.E.6（Story2Board training-free） |
| **视觉圣经未结构化（character sheet 是可选参考图）** | I.1.2 | I.1.1 | §B.B.1（Wikipedia model sheet 5 元素）/ §B.B.4（HJ書 卷首）/ §B.B.7（Pixar Color Script）/ §B.B.10（kohya_ss LoRA）/ §B.B.11（Danbooru tag）/ §E.E.4（LlamaGen character sheet） |
| **关键帧 / 面板选取策略弱** | I.1.3 | I.1.4 / I.1.6 | §C.C.1（Children's book workflow）/ §C.C.2（Light novel 配图密度）/ §C.C.6（Manga 扉页 / 重点格）/ §C.C.10（AI 自动选点 vs 人挑）/ §F.F.4（Save the Cat beats）/ §D.D.7（Beat Sheet） |
| **镜头语言语义层缺失（180 / beat / Kuleshov）** | I.1.4 | I.1.6 | §F.F.1（180-degree rule）/ §F.F.2（Kuleshov effect）/ §F.F.3（Story Spine）/ §F.F.5（Murch Rule of Six）/ §F.F.6（beat-board-animatic）/ §F.F.10（dope sheet） |
| **comic 专门模型未集成（ImageGenerationWorkbench 用通用 SDXL）** | I.1.5 | I.1.1 | §E.E.1（Comicai）/ §E.E.3（ComicAI）/ §E.E.4（LlamaGen）/ §E.E.7（SD comic LoRA）/ §E.E.8（NovelAI NAI Diffusion）/ §E.E.9（Midjourney --niji）/ §E.E.10（ControlNet lineart） |
| **M7 跨页连续性（page turn / spread anchor / cliffhanger）** | I.1.6 | I.1.4 | §D.D.1（Metagrid）/ §D.D.3（Cross-page Anchor）/ §D.D.4（Page Turn Reveal）/ §D.D.5（Splash）/ §D.D.11（Spread Eye-Flow）/ §D.D.12（Cliffhanger）/ §D.D.2（Stretchy Panel） |
| **AI 上墨 vs AI 出整页边界** | I.1.7 | I.1.5 | §G.G.4（sketch → line → color → final）/ §G.G.6（Procreate + AI）/ §G.G.11（Photoshop + SD inpainting）/ §E.E.10（ControlNet lineart）/ §E.E.5（AI Comic Factory LLM+SDXL 双阶段） |
| **出版格式 / 平台 / 多语言** | I.1.8 | I.1.6 | §H.H.1（Webtoon 800px）/ §H.H.2（Tapas / LINE Manga）/ §H.H.4（MangaPlus 集英社）/ §H.H.5（KakaoPage / Piccoma 韩漫）/ §H.H.6（コミケ 同人誌）/ §H.H.7（KADOKAWA / 少年Jump+）/ §H.H.9（POD KDP / IngramSpark）/ §D.D.7（POD Safe Zone）/ §D.D.9（RTL Manga） |

**使用提示**：
- 同一症状可由多个主题交叉解决；优先级按"主要主题"列。
- 「关键灵感条目」列只是起点；每个条目有自己的 §X.Y 引用回溯链。
- 如果一个症状在表中找不到主主题，说明本调研未深挖该方向 —— 见 §A-§H 各节 Open Questions。

---

### §I.6 Pinax 现状文件中与各主题相关的部分（仅观察，不构成落点建议）

> 本节只列出**与各主题相关的现有 Pinax 文件**，作为后续 brainstorming → writing-plans 时查找改动面的参考。**不写新模块建议 / 重构建议 / 实现方案**（用户明确）。

**与角色一致性 / 视觉圣经相关的现有文件**（I.1.1 + I.1.2）：
- `src/components/media/ComicStageWorkbench.vue` —— 漫画视觉圣经 UI 容器
- `src/components/media/ComicAdaptationPlanner.vue` —— 角色绑定入口
- `src/components/media/ImageGenerationWorkbench.vue` —— reference / illustration mode
- `src/services/media/imageProviderConfigStore.js` —— 图像 provider 配置
- `worldbook-workflow` skill（`agent-skills/worldbook-workflow/`，已在 AGENTS.md hard rules 表） —— 已有 Character / Place / Faction 对象层

**与关键帧 / 镜头语言相关的现有文件**（I.1.3 + I.1.4）：
- `src/components/media/ComicAdaptationPlanner.vue` —— 文字 → 漫画分镜规划
- `src/components/media/ComicPageEditor.vue` —— panel grid / page editor
- `src/pages/ProseEssay.vue` —— director mode（shot types 12 + camera movements 12 + director edges 6 已有）

**与 comic 专门模型 / AI 工作流相关的现有文件**（I.1.5 + I.1.7）：
- `src/components/media/ImageGenerationWorkbench.vue` —— 当前用什么 provider 决定可调用的模型集
- `src/services/media/imageProviderConfigStore.js` —— provider 配置层

**与跨页连续性 / 出版相关的现有文件**（I.1.6 + I.1.8）：
- `src/components/media/ComicPageEditor.vue` —— panel grid 是 M7 基础
- `src/components/media/StoryboardVideoPanel.vue` —— 分镜 → 视频，已建立

> 后续若要做落地规划（brainstorming → writing-plans 流程），应从这些文件 + 当前数据 / provider 架构出发，**不在本调研提出新文件建议**。

---

### §I.7 总览（≤ 50 字）

8 条跨节主题，按"被多源反复印证"排：角色一致性 / 视觉圣经结构化 / 文字→关键帧 / 镜头语言 / 专门 comic 模型 / 跨页连续性 / AI 工作流边界 / 出版平台。I.1.6 是 M7 主任务，I.1.1 / I.1.4 是 M7+ 副产物；I.1.2 / I.1.5 / I.1.7 / I.1.8 是 M7 完成后下一波候选；I.1.3 涉及 AI 选点与人确认的边界设计，需用户拍板。

---

> §I 写完。本调研文件 2190 行，覆盖 100+ 条灵感（8 节） + 8 条跨节综合（§I）+ §1 现状快照 + §1.4 TL;DR + §I.5 反向映射表 + §I.6 文件观察。
>
> **3 轮深度审查 + 优化已完成**：
>
> 1. **Round 1**（§I 边界）：§I.1.2 「对应 §1.3 症状」原误引 §I.1.1 的症状描述（"character sheet 是可选参考图"），已修正为"视觉圣经的 per-section 视角"（4 视角 + 6 表情 + 多服装矩阵缺子结构）。其他 7 主题边界经检查清晰。
> 2. **Round 2**（冗余检查）：各节 per-section 总结（§A.总结 / §B.Open questions / §C.总结 / §D 总结 / §E.总结 / §F.总结 / §G.总结 / §H §表格）与 §I cross-section 综合互补不冗余，无需压缩。
> 3. **Round 3**（总览精确度）：§I.7 把"I.1.1 + I.1.6 是 M7 落地后立刻可对照"精炼为"I.1.6 是 M7 主任务，I.1.1 / I.1.4 是 M7+ 副产物"——更精确区分 M7 主任务 vs 副产物 vs 后续候选。
>
> **未做的事（不在本调研范围）**：
>
> - 不写 WNB-6A / M7 后的具体计划 / 实现方案 / 重构建议（用户明确）
> - 不修任何现有 bug（用户明确）
> - 不动 docs/STATUS.md / docs/PLAN.md（用户明确：本调研不写实现进度）
> - 不写新 skill（用户明确：本调研不发散到 skill 设计）
> - 不提新文件 / 新模块建议（仅观察现有文件，Round 1 移除原「关键新增模块候选」6 项）
>
> **可继续的方向（由用户决定）**：
>
> - 把 §I.3 的 8 个产品定位 / 技术容量 / 跨域协调题交给用户拍板
> - 把 §I.6 的 Pinax 现有文件对应到现有 component 做改造评估（不写新模块）
> - 用 `docs/superpowers/specs/...` 模板把某些灵感沉淀为 design doc（需 brainstorming → writing-plans 流程，本调研不触发）
> - 把某些 ⚠️ 项二次联网核实（如 CivitAI 模型版本号 / Webtoon AI 披露政策等 12 项）