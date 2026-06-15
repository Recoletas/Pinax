# Kao UI Direction

> 状态：active direction note
> 适用范围：`WelcomeView`、`AppShell`、`Experience`、`Writing`、`Notes`、`ProseEssay`
> 关系：补充 [character-driven-arc.md](./character-driven-arc.md) 的视觉执行层；不替代 runtime / content 主线

## 1. Why this exists

`character-driven-arc.md` 已经定义了 Pinax 要往“角色化 AI GM 驱动的文字冒险工作台”收敛，但它还不够具体，无法直接指导页面的平面设计。

`docs/demo/kao.jpg` 提供了一个更明确的视觉锚：

- 不是传统游戏官网 UI
- 不是 SaaS / IDE / dashboard
- 不是单张平铺海报
- 而是“角色海报 + 档案册 + 相片拼贴 + 纸页材质”的复合构图

这个方向文档的目标，是把那张图拆成 Pinax 可复用的 UI 语法。

## 2. Source read: what matters in `kao.jpg`

不要把参考图理解成“换成绿色”。真正可迁移的是下面这五层：

1. `Color contrast`
   - 奶油纸白 / 浅赭纸面
   - 氧化绿 / 深墨绿
   - 金属金 / 暖琥珀高光
   - 局部黑色压重

2. `Material stack`
   - 纸张、册页、覆膜相片、金属角件、书签
   - 不是玻璃，不是毛玻璃 dashboard

3. `Composition`
   - 斜线、拼贴、跨页、撕边、照片堆叠
   - 主视觉不是均匀居中卡片，而是被“场景碎片”围出来

4. `Hierarchy`
   - 第一读：角色 / 海报
   - 第二读：标题 / 品牌
   - 第三读：动作按钮
   - 最后才是解释性文案

5. `Temperature`
   - 温暖、收藏感、叙事感、轻奢但不浮夸
   - 更像“档案册 / 角色专辑”，不是“功能控制台”

## 3. Translation to Pinax

Pinax 不应直接复制参考图的姿态、人物摆位或完整构图。要翻译成一套稳定的产品语法：

### 3.1 Global visual language

- `folio`: 册页 / 纸页底板
- `contact sheet`: 相片拼贴 / 缩略页
- `bookmark`: 书签 / 票签 / 斜切动作按钮
- `hardware accent`: 金属角件 / 金边 / 压印
- `editorial contrast`: 高对比 serif 标题 + 紧凑 sans UI

### 3.2 Surfaces

只保留 4 类基础 surface：

1. `Paper surface`
   - 浅色底
   - 轻纸纹 / 行纹 / 页边压暗
   - 用于主页、入口页、摘要页

2. `Photo surface`
   - 冷绿到深绿
   - 轻覆膜高光 / 裁切
   - 用于海报、开场现场、世界样本

3. `Bookmark surface`
   - 强方向性斜切
   - 小面积高纯度金 / 玫瑰 / 墨绿
   - 用于 CTA，不用于大面积铺底

4. `Workbench surface`
   - 纸面上叠更克制的操作层
   - 仍然要好用，避免把所有工作面都做成海报

## 4. Palette proposal

以下是首轮近似色板，不是最终锁定值：

- `paper-1`: `#f5ebdd`
- `paper-2`: `#e9dcc8`
- `ink-1`: `#271d18`
- `ink-2`: `#5d5147`
- `verdigris-1`: `#2f6e64`
- `verdigris-2`: `#173c37`
- `gold-1`: `#b78a34`
- `gold-2`: `#e0ae68`
- `rose-1`: `#934b57`

落地原则：

- 主底色偏纸面，不偏纯白
- 冷绿只做深色压重和相片底
- 金色只做点睛，不当主背景
- 玫瑰色作为第二强调，不再用作全站默认 accent

## 5. Typography

全站只保留两种角色：

1. `Display serif`
   - 用于品牌、世界名、海报标题、章节编号
   - 要有书卷感，但不能过于古典

2. `UI sans`
   - 用于按钮、导航、工具条、说明
   - 要紧凑、干净、现代

规则：

- 一屏里让 serif 负责“标题性信息”
- sans 负责“交互性信息”
- 不再把所有内容都用同一套 sans 硬撑

## 6. Component grammar

建议先抽 4 个可复用视觉原件：

1. `FolioSurface`
   - 册页底板 / 中缝 / 页边阴影 / 页签位

2. `PosterStage`
   - 海报舞台 / 主视觉载体
   - 支持角色图、世界图、开场相片

3. `BookmarkButton`
   - 主 CTA / 次 CTA / 目录索引按钮
   - 统一斜切、投影和透视

4. `ArchiveStrip`
   - 相片条、缩略目录、世界碎片索引

不要再新增“大卡片组件”来替代这些基础语法。

## 7. Page-by-page application

### 7.1 `WelcomeView`

目标：主页变成“角色海报驱动的档案册封面”。

必须具备：

- 海报主视觉第一读
- 最少文字
- 相片拼贴围绕主视觉，而不是独立功能块
- CTA 作为书签切片压在海报上

不能继续：

- 暗红 sci-fi 面板语法
- 工具型功能概览
- 任务板 / dashboard 结构

### 7.2 `AppShell`

目标：导航变成“页签 / 书签 / 档案目录”，不是 app header + tabs。

必须具备：

- 顶部更薄
- 左右 chrome 更像册页边注
- 页面切换有抽页 / 滑片感

不能继续：

- 标准 tabbar
- 普通按钮排一排的功能头

### 7.3 `Experience`

目标：在册页结构上叠“现场海报”和“切口目录”。

必须具备：

- 左页是进入前摘要
- 右页是开场海报 / 现场相片
- 切口像目录页或接触印样

不能继续：

- 多块平权卡片
- 说明文字比主视觉更显眼

### 7.4 `Writing / Notes / ProseEssay`

必须共用同一视觉世界，但分工不同：

- `Writing`: 手稿页 / 正文页
- `Notes`: 资料册 / 相片夹 / 索引页
- `ProseEssay`: 成稿页 / 编辑成册页

## 8. Motion

动效方向：

- 抽页
- 轻微滑片
- 相片层差
- 书签位移

不要：

- 软 fade 作为主要动效
- 弹跳卡片
- 常驻霓虹发光

## 9. Non-goals

- 不直接照搬参考图人物姿态
- 不把整站做成古籍 UI
- 不让每页都堆满拼贴照片
- 不为了风格把工作面可用性打烂
- 不在本阶段引入真实角色资产生产流程或动画库

## 10. Execution order

1. 增加共享 palette / material tokens
2. 重做 `WelcomeView`
3. 重做 `AppShell`
4. 回到 `Experience`
5. 再铺到 `Writing / Notes / ProseEssay`

## 11. Acceptance bar for Phase 1

只有同时满足下面条件，才能说 `kao` 方向真正开始落地：

1. 首页首屏一眼看上去不是 dashboard
2. 主页和壳层已经从暗红 sci-fi 语法切到册页 / 拼贴 / 书签语法
3. serif / sans 分工已经建立
4. CTA 有明确的独特形体，不是普通按钮
5. 相同语法至少在 `WelcomeView` 和 `AppShell` 两处同时成立
