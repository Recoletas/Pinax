# 角色化产品主轴

> **状态：已采纳方向。**
>
> 本文件定义 Pinax 接下来的产品方向：从“工具集合 + 可玩的世界书”继续收敛为一个**角色化 AI GM 驱动的轻量文字冒险工作台**。
>
> 它**不替代** [playable-worldbook-roadmap.md](./playable-worldbook-roadmap.md) 的 runtime / content 主链；后者现在作为迁移期执行骨架继续有效。

## 0. TL;DR

- **方向已定**：产品外壳开始转向“角色化 GM”。
- **底层不废**：`playable-worldbook` 漏斗、`gameStore`、世界书上下文、generation task layer 继续保留。
- **旧壳冻结**：旧 `WelcomeView` 任务板、旧 `.advisor-fab`、旧工具化外壳不再继续深投。
- **双轨推进**：一边走 runtime skeleton，一边开始 UI / 显示全面重构。
- **第一阶段先做壳层，不先碰深层记忆轴**：先验证角色入口、页面氛围、视觉语言是否成立，再决定是否改 Mem0 / persona memory。

## 1. 这次决定真正改变了什么

### 1.1 会被替掉的

- 旧 `WelcomeView` 任务板式首页
- Fluent / Segoe 工具化视觉气质
- 四个页面各自为战的 `.advisor-fab`
- 把功能页当成平铺工具入口的整体观感

### 1.2 不会被推翻的

- `选择世界 -> 冒险 -> 写回作品` 的漏斗
- `gameStore` 作为 runtime state 主入口
- `worldbookContextBuilder` 和现有 generation task layer
- 旗舰世界、demo case、真实手测记录
- Stage 3a / 3b / 4 这类底层可复用能力

### 1.3 定位一句话

> Pinax 接下来不是继续把“工具”做得更完整，而是把现有能力包进一个**可感知、有人格、可连续陪玩的 GM 外壳**里。

## 2. 产品形态

### 2.1 GM 形态

“虚构集”是一个**角色化 GM 外壳**，不是完整 agent runtime。

第一阶段她承担的是：

- **人格层**：固定语气、固定位置、固定对用户的说话方式
- **入口层**：统一四个页面的顾问 / 助手入口
- **包装层**：把体验、写作、素材、散文这些功能包装成“她的房间 / 她的工作面”
- **呈现层**：在等待、建议、触发出口时提供明确的角色存在感

第一阶段她**不**承担：

- 工具规划
- 多步推理 loop
- 新的状态源
- 新的生成主链

### 2.2 四个页面的统一关系

| 当前页 | 新角色语义 | 第一阶段目标 |
|---|---|---|
| `Experience` | 她作为 GM 在场 | 统一入口 + 更强的在场感 |
| `Writing` | 她的写作台 / 批注台 | 统一入口 + 局部批注壳层 |
| `Notes` | 她的素材整理墙 | 统一入口 + 角色化文案与层级 |
| `ProseEssay` | 她的编辑 / 编导工作面 | 统一入口 + 与其他页的外壳统一 |

### 2.3 入口命名与组件边界

仓库已经有 [src/components/Character.vue](../../src/components/Character.vue)；它不是这次“角色化 GM 壳层”的组件命名基准。

为避免语义碰撞，后续角色壳层组件建议放在：

- `src/components/gm-persona/GmPersonaLauncher.vue`
- Phase 1A 暂不预拆 `bubble / panel` 成多文件；当前 `bubble` 先内聚在 launcher 里，顾问面板继续复用现有 [src/components/AdvisorPanel.vue](../../src/components/AdvisorPanel.vue)

不要再新建 `src/components/character/` 这一套泛名目录。

## 3. 视觉方向

### 3.1 视觉锚

保留 4 个锚，但只把它们当成**方向层**，不再当成逐项照抄的素材清单：

- **P5R**：黑红高对比、果断的 display 字号、强图形切面
- **构成主义**：对角线、楔形、几何冲突感
- **复古未来**：机械、金属、仪表式细节
- **1999 油画感**：材质层次、偏暖的底色、非纯数字平滑感

### 3.2 明确约束

- 不做单一世界专属背景图作为长期依赖。
- 不把首屏建立在“雾潮暮湾专属画面”上。
- 优先做**通用、可复用的构成式背景**，不是一张漂亮但不可迁移的海报。
- 不继续堆满按钮、工具栏和说明块。
- 不做 SaaS 卡片堆叠式布局。

### 3.3 版式判断

这一方向更偏：

- 强层级
- 少字体但有明确分工
- 大标题 / 小正文的张力
- 图形与文字共同构图
- 明显比当前更“平面设计 / 编辑设计”导向

而不是继续靠：

- 更多按钮
- 更多说明文案
- 更多功能卡片
- 更多局部 hover 小特效

### 3.4 角色造型与多 pose 策略

**主色约束**（已固定，Phase 2 资产生产直接据此对齐）：

| 部位 | 主色 | 说明 |
|---|---|---|
| 头发 / 皮肤 / 衣物基色 | 黑 | oklch(0.18–0.28 0.02 240) 深蓝灰，不是纯黑 |
| 眼 | 绿（小点缀） | oklch(0.65 0.18 145) 翡翠绿，仅瞳孔 + 高光 |
| 配件 | 铬 / 黄铜 | 复古未来质感，作为光源 / 反光点 |

与背景暗红 = 高对比但同基色；绿眼是唯一冷色锚点，避免视觉过热。

**多 pose 策略**（U-C 表，5 pose 是设计上界，不追加）：

| 场景 | Pose | 用途 |
|---|---|---|
| 首屏 hero | pose-A 倒挂 | 角色倒挂 + 海面倒影融入暗红海 |
| LLM 思考中 | pose-B 躺倒 | 等待时活化界面 |
| Experience GM 输出中 | pose-C 正立面对 | 对话状态 |
| Writing / Notes 侧栏 | pose-D 半身侧视 | 静默批注状态 |
| ProseEssay 编辑 | pose-E 戴眼镜侧视 | 编辑模式 |

**资产规模**（Phase 2 范围）：

- 不做 6–8 pose × 多表情的完整立绘集；
- 做 2–3 主 pose + 1–2 头像（约 4–5 个资产）；
- 生图为主力，关键 pose 手工精修；
- 资产路径：`src/assets/characters/{characterId}/{poseId}.png`；
- 缓存：localStorage / IndexedDB。

**禁止形态**（避免回归到“立绘点缀”）：

- 不做表情多态系统（笑 / 怒 / 哀 / 乐等完整 emotion set）；
- 不做 6 种以上 pose；
- 不让立绘退化为功能页右上角小头像。

### 3.5 首屏构图与切换动画

**首屏构图约束**（Phase 1B / 1C 落实）：

```text
画面分层（视口 100vh）：

  上半（≈40vh）：暗红海背景
    - 朱红 × 黑深 主色 P5R 风
    - 构成主义对角线 / 三角楔形作为背景纹理
    - 1999 油画质感的 noise overlay（opacity 0.04–0.08）

  中部（≈30vh）：角色倒挂 + 海面倒影
    - 角色立绘倒挂（pose-A）
    - 下方海面倒影（mix-blend-mode: multiply / SVG mask）
    - 倒影与角色融为一体，不分边界

  下半（≈30vh）：雨滴选项
    - 选项形态 = 雨滴 + 雨滴内嵌几何（构成主义元素）+ 字
    - Canvas 2D 渲染雨滴下落 + SVG 渲染选项内容
    - 选中：雨滴变形为楔形（构成主义）+ 字体跳到 display 大号
```

约束：

- 暗红海是**通用构成式背景**，可复用，不绑定具体世界题材；
- 海面倒影是通用 motif，不绑定“雾潮暮湾”或其他单世界画面；
- 雨滴选项是“通用开场选项形态”，不绑定具体开场行动文案；
- 不立单世界专属背景图作为长期依赖（§3.2 已约束）。

**切换动画风格（C5 cinematic）**：

风格：电影感推 / 拉 / 摇 / 移，**不是**淡入淡出，也不是简单 CSS transition。

| 动画事件 | 效果 |
|---|---|
| 雨滴选中 | 雨滴变楔形 → 推镜头进入选定路径 |
| 进入 Experience | 拉镜头从海面拉到 GM 对话室 |
| LLM 思考切换 | 摇镜头从对话室摇到角色躺倒 pose |
| 切换页面 | 移镜头（左右滑） |

降级：

- `prefers-reduced-motion: reduce` → 全部切换改为无动画硬切；
- 移动端 / 低性能设备 → 关闭雨滴 Canvas，只保留静态背景。

**实现选型**（分阶段引入依赖，避免一次性 bundle 压力）：

| 阶段 | 库 | 增量 gz | 覆盖范围 |
|---|---|---|---|
| Phase 1A / 1B / 1C | 0 额外依赖 | 0 | CSS transform / transition + idle 浮动 + 雨滴 Canvas |
| Phase 2 | Motion One + @vueuse/motion | ~7KB | 推 / 拉 / 摇 / 移 + 角色状态切换 |
| Phase 3（可选） | Three.js + GSAP | ~87KB | 3D 倾斜立绘 + 真正电影感 |

**默认不进入 Phase 3**，除非 Phase 2 跑稳 4 周以上且实测“没有电影感时体验明显缺失”。

## 4. 迁移原则

### 4.1 底和壳分开

- `playable-worldbook` 负责底层主链。
- `character-driven` 负责最终外壳。
- 两者并行推进，但不要混成一条无边界任务流。

### 4.2 先局部 wedge，再全局换血

第一轮不做一次性全局 CSS / token 替换。先验证：

- 角色入口是否提升吸引力
- 页面 chrome 是否明显脱离工具感
- 首屏是否更像“进入一场冒险”而不是“进入一个工作台”

### 4.3 旧壳层冻结

从现在起：

- 旧 `WelcomeView` 任务板只做 bugfix / 连续性修复
- 旧 `.advisor-fab` 不再继续 polish
- 旧工具化页面不再继续深投视觉微调

### 4.4 不提前引爆高耦合点

第一阶段不把以下问题绑死在一起：

- 角色入口壳层
- Mem0 character 维度
- 新 persona prompt 体系
- 新动画系统
- 全局 token 系统

它们要拆开验证。

## 5. 分阶段迁移

## Phase 1A — 角色壳层试点

状态：首轮已落地。

**目标**：先让用户明显感到“这个产品开始有人格”，但不改底层主链。

**包含**：

- 四页统一角色 launcher
- `bubble` 先展开、再进入现有顾问面板的基础壳层
- 局部 typography / color / spacing wedge
- 实际覆盖 `Experience`、`Writing`、`Notes`、`ProseEssay` 四页

**不包含**：

- Mem0 character 分桶
- 全局 CSS token 重构
- WelcomeView 全量重做
- 生图资产

## Phase 1B — 入口与 chrome 重做

**目标**：把“进入这个产品”的第一屏和整体外壳，从工具感切到角色化冒险感。

**包含**：

- `WelcomeView` 重做
- 更收敛的导航 / 顶栏 / 页面 chrome
- 旧工具栏的显隐策略
- 通用构成式背景，而不是单世界背景图

**边界**：

- 不改 `gameStore`
- 不改 `worldbookContextBuilder`
- 不碰高风险 runtime 结构

## Phase 1C — Experience 呈现统一

**目标**：让真正的冒险页看起来像角色在带你玩，而不是一页工具组件拼装。

**包含**：

- `Experience` 页面视觉重排
- 角色化 GM 呈现包装
- 开场卡、摘要带、输入区和侧栏的层级重构

**边界**：

- 不新增第二套状态
- 不把 UI 改动包进 runtime 重构里

## Phase 2 — 资产与动画系统

**目标**：在方向被证明成立后，再引入 pose、资产层和更完整的 motion。

**包含**：

- 2–5 个核心资产（按 §3.4 资产规模：2–3 主 pose + 1–2 头像）
- 统一 design token 消费层
- 轻量 motion library（Motion One + @vueuse/motion，~7KB gz，按 §3.5 选型）
- 页面切换、角色状态切换的系统化动效（C5 cinematic 推 / 拉 / 摇 / 移）
- 生图管线 + 关键 pose 手工精修流程

**预算控制**（防止 Phase 2 滑向 Phase 3 体积）：

- 整 Phase 2 完成后 bundle size 增量目标 < 10KB gz（Motion One ~7KB + token / 雨滴实现预留 ~3KB）；
- 立绘资产走懒加载，不影响首屏 LCP；
- 雨滴 Canvas 走 `requestIdleCallback` 启动，不阻塞主线程。

## Phase 3 — 可选增强

**门槛条件**（必须全部满足才推进）：

- Phase 2 跑稳 4 周以上；
- 实测“没有电影感时体验明显缺失”；
- bundle size 增量预算确认（+87KB gz 可接受）。

**包含**：

- Mem0 / persona memory 轴（按 character / provider 分桶）
- 更重的电影感 motion（3D 立绘倾斜 + GSAP 路径动画）
- 更深的角色叙述包装（角色状态机）

默认不进入；只有在 Phase 2 跑稳后再考虑。

## 6. 已固定决策与待定点

### 已固定

- 方向已采纳，不再视为“未决提案”
- 不引入第二套状态源
- 不把旧任务板首屏继续当成最终方向
- 不把单世界背景图当成长期视觉核心
- 不先做完整 agent runtime

### 仍待定

- demo persona 是谁
- 初版字体组合
- 角色资产生产流程
- 动画库是否需要在 Phase 2 引入

## 7. 与执行骨架的关系

这个方向文档不否定以下工作，反而依赖它们：

- Stage 3a：轻状态
- Stage 3b：剧情日志
- Stage 4：写回出口
- Stage 5：旗舰世界 demo case

换句话说：

> **被替掉的是产品外壳，不是可复用底层。**

## 8. 已验证事实与仍未验证处

### 已验证事实

- 四页共享 `GmPersonaLauncher` 已接入，旧模板级 `.advisor-fab` 按钮已撤下
- `main.css` 仍是旧视觉栈的主承载
- `useProactiveAdvisor.js` 存在但未接线
- `ADVISOR_PROMPTS` 当前是 4 mode
- `gameStore.worldMapState` 已有地点三字段

### 仍未验证

- 外部风格资料的最新版本核对
- `Motion One` / `GSAP` 2026 体积数据
- 角色资产管线的真实成本

进入 Phase 2 前再做一次外部资料二次核对。
