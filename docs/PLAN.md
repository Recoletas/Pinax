# 当前产品计划

> 本文件只保留当前产品主线和近期判断。更细的专题路线图见 [plan/README.md](./plan/README.md)。

## 产品主线

Pinax 当前收口为“可玩的世界书”：

```text
选择世界
  -> 进入冒险
  -> 形成剧情日志和素材
  -> 写成作品
  -> 整理为分镜或改编出口
```

这个定位替代旧的“文字游戏 + 写作工具 + 世界书 + 地图 + 画布”并列叙述。短期目标不是继续铺功能入口，而是让用户能从一个世界开始玩，并自然沉淀为可编辑作品。

## 当前稳定链路

- `体验页`：进入世界、进行 AI GM 冒险、产出剧情上下文。
- `世界书 / 设定`：导入、生成、编辑世界信息；快速导入预设是冷启动入口。
- `素材页`：内容真源和中转层；接收体验、设定、图片和正文候选。
- `卡片画布`：素材关系、镜头顺序和分镜参数的空间视图。
- `写作页`：把冒险或素材改写成正文。

## 近期重点

0. **下一轮并行执行**
   - 不继续堆种子世界数量；首屏只主推 `边境王国 · 雾潮暮湾`。
   - 工程主线做入口 UI、体验页开场卡、GM 轻状态、剧情日志和 2 个 trigger。
   - 内容线程做旗舰世界 review、10-15 分钟手测记录和 demo case。
   - 详细分工见 [plan/playable-worldbook-parallel-plan.md](./plan/playable-worldbook-parallel-plan.md)。

1. **入口话术收尾**
   - 首页和体验页统一表达为“进入一个世界”。
   - 没有世界书时，引导使用种子世界或快速导入。
   - 只改用户可见文案和 CTA，不改路由、store key、localStorage key 或文件路径。

2. **Stage 1.5：RPG 预设适配**
   - 先把 `server/data/worlds/*/world.json` 适配到现代世界书 payload。
   - 现有 5 个 RPG 世界不是 `worldStore.entries` 真源，不能直接当作已接入世界书。
   - 不新增不可迁移的临时 schema，不绕开现有世界书导入链路。

3. **种子世界冷启动**
   - 新增 1 个真正差异化世界，另外 2 个优先复用/改造现有 `科幻星际`、`都市生活`。
   - 每个主推世界补齐事件、势力、开场困境和改写方向。
   - 先验证 1 个完整世界，再量产其余世界。

4. **玩到写的触发点**
   - 冒险一段后先做 2 个 MVP trigger：“写成我的版本”“整理成分镜”。
   - AI 调用走现有 `src/services/generation*` 任务层，不直接 fetch。
   - 先接通日志到素材和写作出口，再考虑视频或社区能力。

## 非目标

- 不优先做社区、公开 fork、排行榜或内容市场。
- 不把短剧 / 生视频作为当前主 CTA；它只是分镜后的实验出口。
- 不新增独立工作区；优先复用体验页、世界书、素材、卡片画布和写作页。
- 不重写世界书 schema、地图引擎或统一生成任务层。

## 工程规则

- 不新增第二套状态源。
- 不绕开统一生成任务层。
- 不重命名现有路由、store key、localStorage key。
- 素材内容以素材层为真源，画布优先保存引用。
- UI 改动必须说明用户可感知变化，并跑对应回归。

## 当前事实入口

- [README.md](./README.md)：文档导航。
- [src/index.md](./src/index.md)：当前事实层说明。
- [src/code-map.md](./src/code-map.md)：代码 owning surface。
- [src/known-issues.md](./src/known-issues.md)：当前风险和限制。
- [src/test-status.md](./src/test-status.md)：最近验证状态。
- [plan/playable-worldbook-roadmap.md](./plan/playable-worldbook-roadmap.md)：可玩的世界书路线图。
