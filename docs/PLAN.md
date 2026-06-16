# 当前产品计划

> 先看这里，再决定读哪份专题计划。当前文档口径已经调整为：**角色化产品方向已采纳，`playable-worldbook` 保留为迁移期执行骨架。**

## 产品方向

Pinax 正在朝一个**角色化 AI GM 驱动的轻量文字冒险工作台**迁移。

对外产品承诺不再是“文字游戏 + 写作工具 + 世界书 + 地图 + 画布”的并列集合，而是：

```text
进入一个世界
  -> 与角色化 GM 推进冒险
  -> 沉淀剧情、素材与状态
  -> 写成作品
  -> 整理成分镜或后续改编出口
```

方向文档见 [plan/character-driven-arc.md](./plan/character-driven-arc.md)。

在平面设计层，当前新增一个更具体的视觉锚：[plan/kao-ui-direction.md](./plan/kao-ui-direction.md)。它负责回答“首页 / chrome / 工作面具体应该长什么样”，特别是 `kao.jpg` 参考图里的档案册、拼贴相片、纸页材质和书签按钮如何翻译进 Pinax。

## 执行骨架

虽然产品外壳开始切向角色化 GM，但当前可复用的工程骨架仍然是 `playable-worldbook`：

- 世界选择 / 进入冒险 / 写回作品 这条漏斗保留。
- `gameStore`、`worldbookContextBuilder`、`generation*` 任务层继续作为唯一主链。
- 种子世界、demo case、手测记录继续有效，不因为外壳改向而作废。

执行骨架文档见 [plan/playable-worldbook-roadmap.md](./plan/playable-worldbook-roadmap.md)。

## 当前工作模型

当前按**双轨推进，单方向收敛**执行：

1. **Runtime skeleton**
   - Stage 3a / 3b / 4 已落地首轮：轻状态、剧情日志和两个 MVP trigger 已接到同一条 runtime 主链。
   - 下一步围绕 trigger 质量、剧情日志质量和 live demo 验证继续收口，不新增第二套状态源。

2. **UI shell migration**
   - Phase 1B 现在明确按 `character-driven-arc` §3.4 / §3.5 + [superpowers/specs/2026-06-10-ui-redesign-design.md](./superpowers/specs/2026-06-10-ui-redesign-design.md) 推进：`WelcomeView` 先做 olive/gold kao 档案册首页(纸页底、相片拼贴、暖金/氧化绿、极少文字、书签式 CTA)，3 阶段路径：Phase A 纯 CSS tokens + 3 个 `.is-*` 自包含 utility → Phase B 抽 4 个 kao 组件(`FolioSurface` / `PosterStage` / `BookmarkButton` / `ArchiveStrip`)+ 模板局部重排 → Phase C 3 文件(`WelcomeView` / `AppShell` / `Experience`)复用证明 + 1 次人工截图审查。
   - 该方向现在进一步细化为 `kao-ui-direction`：`WelcomeView`、`AppShell`、`Experience` 等表层 UI 从旧 framey PPT 工具壳切到”角色海报 + 档案册 + 相片拼贴 + 纸页材质”的复合语法。
   - Phase 1C 再把角色在场感分配到重工作面：`Experience` 优先对应正立对话态，`Writing / Notes` 优先对应侧视静默批注态，`ProseEssay` 对应编辑态。
   - Phase 2 资产与电影感 motion 仍未开闸；这一轮不要提前引入最终立绘资产、Motion One / GSAP 或单世界专属背景。
   - 不再继续深投旧的工具化外壳。

3. **Content / demo**
   - 继续用 `边境王国 · 雾潮暮湾` 做旗舰世界。
   - 继续跑真实冒险、小说样例、分镜节点和 demo case。

并行执行细分见 [plan/playable-worldbook-parallel-plan.md](./plan/playable-worldbook-parallel-plan.md)。

## 近期重点

1. **Phase 1B — 入口与 chrome 重做**
   - Phase 1A 已完成首轮：四个重工作面已统一到共享 `GmPersonaLauncher`，并继续复用现有 `AdvisorPanel` 逻辑。
   - 当前切片先重做 `WelcomeView` 的海报构图，并以 `kao-ui-direction` 为视觉锚：档案册纸面、相片拼贴、金属角件、书签按钮、极少文字，不再把大段文案或功能概览放在首屏。
   - 在真实位图资产接入前，不再使用 CSS 假人物 / 假剪影去冒充角色海报。
   - 然后再统一 `AppShell` chrome、工具栏显隐与页面层级，把“隐藏优先”的导航和角色化入口语言稳定下来，并从普通 tab/header 过渡到更像页签 / 档案目录的壳层。
   - `Experience` / `Writing` / `Notes` / `ProseEssay` 的壳层统一仍在这一阶段，但排在首页构图稳定之后。
   - **2026-06-10 锁定**:基色从 `character-driven-arc` 的暗红海报舞台切到现有 `--archive-*` 绿/金/玫/相片调色板(olive/gold 优先),用户拍板覆盖 P5R 暗朱红 + 构成主义红。书签脊 = `var(--archive-gold)`,PINAX wedge = `var(--archive-olive-strong)`,utility class 用 `.is-folio` / `.is-bookmark` / `.is-archive-strip` 命名。完整设计决策见 [superpowers/specs/2026-06-10-ui-redesign-design.md](./superpowers/specs/2026-06-10-ui-redesign-design.md)。
   - **三阶段路径**:Phase A 纯 CSS(`main.css` 加 8 token + 3 个 opt-in `.is-*` utility,各自包含 `box-shadow:none` / `border-radius:0`,**不使用** `[class*='welcome-']` 全局选择器,模板零改)→ Phase B 抽 4 个 kao 组件(`FolioSurface` / `PosterStage` / `BookmarkButton` / `ArchiveStrip`)+ 模板局部重排(8 个 `display:none` 契约壳全保留)→ Phase C 三文件(WelcomeView + AppShell + Experience)复用证明 kao §11 验收门槛。
   - 继续只动壳层，不在这一轮触碰 `gameStore` / `worldbookContextBuilder` / generation task layer。

2. **Phase 2 gate 仍关闭**
   - `character-driven-arc` 已补齐多 pose、首屏构图、C5 cinematic 和 Phase 2 预算；这些现在作为约束存在，但还不是本轮实施范围。
   - Phase 1B / 1C 没跑稳前，不进入真实立绘生产、动画库接入或 3D / GSAP 方案。
   - 当前仍待定：demo persona、初版字体组合、角色资产生产流程、动画库是否真的需要。

3. **Stage 3a / 3b / 4 — runtime skeleton 首轮已通**
   - `gameStore`、`worldbookContextBuilder`、`QuestLog` 和 generation task layer 已接上轻状态、剧情日志、章节草稿与分镜草稿。
   - 下一步以质量打磨和真实 demo 验证为主，而不是继续扩第二套 runtime 结构。

4. **旗舰世界 live 手测**
   - 保持 `边境王国 · 雾潮暮湾` 作为当前唯一主推内容样本。
   - 继续沉淀 10-15 分钟真实冒险记录与写回样例。

## 冻结区

以下区域除 bugfix、兼容性修复或迁移必需工作外，**不再继续做重度 polish**：

- 旧 `WelcomeView` 任务板式外壳的继续精修
- 旧 `.advisor-fab` 视觉微调
- 旧 Fluent / Segoe 工具化风格的小修小补
- 把旧壳层继续包装成“最终方向”的文案投资

## 非目标

- 不新增第二套状态源。
- 不绕开现有 `generation*` 任务层。
- 不先做完整 agent runtime、多步规划层或 LangChain 式框架。
- 不先做角色 voice、BGM 或 3D 电影感系统。
- 不先改 world-map / geography / renderer 主链。
- 不为了 UI 方向切换而推翻已经有效的世界书 / 内容 / demo 积累。

## 工程边界

- runtime 状态仍以 `gameStore` 为唯一主入口。
- 世界书上下文仍以 `worldbookContextBuilder` 为主。
- 角色化 GM 的第一阶段是**包装层**，不是第二套逻辑层。
- 旧壳层和新壳层不要在同一轮里同时深挖同一块高冲突 UI。

## 当前事实入口

- [../README.md](../README.md)：仓库入口与启动方式。
- [README.md](./README.md)：文档导航。
- [plan/character-driven-arc.md](./plan/character-driven-arc.md)：产品方向文档。
- [plan/kao-ui-direction.md](./plan/kao-ui-direction.md)：当前首页 / chrome / 工作面的视觉执行锚。
- [plan/playable-worldbook-roadmap.md](./plan/playable-worldbook-roadmap.md)：迁移期执行骨架。
- [plan/playable-worldbook-parallel-plan.md](./plan/playable-worldbook-parallel-plan.md)：接下来并行分工。
- [src/code-map.md](./src/code-map.md)：代码 owning surface。
- [src/known-issues.md](./src/known-issues.md)：当前限制与风险。
- [./superpowers/specs/2026-06-10-ui-redesign-design.md](./superpowers/specs/2026-06-10-ui-redesign-design.md):WelcomeView UI 重构设计 spec(2026-06-10 锁定,基色 = 现有 `--archive-*`,3 阶段路径,4 个 kao 组件待建)。
