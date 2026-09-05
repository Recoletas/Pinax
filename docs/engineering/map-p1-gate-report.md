# P1 Gate 报告：OpenLayers 视口技术原型

日期：2026-08-29
环境：Chromium（playwright，1280–1440 视口），spike dev server（独立入口，不影响主应用）
Harness：`prototype/map-spike/`（`node_modules/.bin/vite --config vite.map-spike.config.mjs --port 5199`）
驱动脚本：`scripts/map-p1-spike.mjs`；原始产物在 `/tmp`（按 §9.6 已清理）
fixture：dense-12k（12,000 cells + 69 burgs + 51 rivers + 64 roads + 2,000 注入作者地点）

## 1. 三份同数据原型（同 seed、同 MapDocument v2）

| 原型 | 内容 | 结论 |
|---|---|---|
| ① 当前 Canvas 基线 | renderer 全量烘焙离屏画布 + 整体拉伸 | 信息最全（含国名/边界），但标签随图缩放，无 LOD/重新避让；无真实 view 可测 |
| ② OL + 地形 ImageCanvas + 地点矢量 | 地形栅格底图 + settlements/narrativePlaces 矢量 + declutter + Select | 挂载 ~24ms；点击选择命中 `settlement:34`；标签屏幕字号稳定 |
| ③ OL + 全矢量 | 聚合陆块多边形 + 河流 + 路线 + 城镇 + 作者地点 + 线标注 + 三档 LOD | 2,153 features 转换 14ms；三档 LOD 生效；河名沿线标注可读 |

对照图：`map-p1-assets/compare-1440-{canvas-baseline,ol-raster-places,ol-vector-world}.png`

## 2. Gate 通过标准逐项

| 计划 §P1 标准 | 结果 | 证据 |
|---|---|---|
| 同 seed 信息完整性不低于旧图 | ✅（含保留项） | ②保留全部栅格信息；③矢量层缺国名/连续边界（legacy 数据无 state 几何，P4 由 azgaar borderPaths/stateLabelPaths 补齐——已在计划内） |
| 平移缩放无撕裂/双重滚动/标签整体缩放 | ✅ | 连续缩放序列 world→region→local：标签保持屏幕字号（`compare-1440-ol-vector-{world,region,local}.png`），无 Canvas 拉伸模糊 |
| 首次可交互与连续缩放不劣于基线 | ✅ | OL 原型挂载 21–28ms；连续缩放 6s 测帧：**60fps，>32ms 长帧 1 帧，>50ms 0 帧**（12,000 cells + 2,153 矢量 feature） |
| 完整首版按路由懒加载，主包不增加地图依赖 | ✅ | `ol` 仅被 `prototype/map-spike/**` 引用；`src/**` 无任何 `ol` import；正式接入走地图独立懒加载 chunk（P3） |
| 1440/1024/390/200% 可完成选择与取消 | ✅（搜索项 P3） | `ol-vector-{1024,390,zoom200}.png`；200% 下按钮全部可达且可点击（`zoom200SelectionReachable=true`）；390px 布局可折叠，正式 rail/bottom-sheet 在 P3 |
| y 轴转换 / pixel projection / view state | ✅ | `yaxis.js` 统一 down→up 翻转；②③与①方向一致无镜像；view 随 dispose 释放 |

## 3. 资源与稳定性

- **20 次挂载/卸载（原型③）**：heap 29.8→29.8MB（**Δ0MB**），dispose 中位 0ms；每次 dispose 解绑 interaction、销毁 source、清空容器。
- **转换成本**：12,000-cell legacy → MapDocument v2 → 2,153 个 OL feature 共 14ms（转换不是瓶颈；§10 风险"转换过重"不成立，无需降级）。
- **页面错误**：pageerror/console.error 在整轮 Gate 中为 0 条记录。
- **字体**：spike 使用系统 CJK 字族，各档缩放中文标签渲染正常无豆腐块；应用 webfont 加载后的重排校验推迟到 P3（`font ready 触发有界刷新`）。

## 4. 保留证据清单（§9.6）

```text
docs/engineering/map-p1-assets/
  compare-1440-canvas-baseline.png    ①基线
  compare-1440-ol-raster-places.png   ②
  compare-1440-ol-vector-world.png    ③ 世界/区域档
  compare-1440-ol-vector-region.png   ③ 区域档聚焦
  compare-1440-ol-vector-local.png    ③ 地方档（线标注/屏幕字号）
  ol-vector-1024.png / ol-vector-390.png / ol-vector-zoom200.png
```

## 6. 用户反馈修订（2026-08-29，Gate 确认中）

用户看过首轮截图后给了两条方向性意见，已在本轮修订中落实：

1. **"标点标多了就乱了"** → 原型②的 2,000 个作者地点改为 **Cluster 聚合**：
   世界/区域档显示计数聚合圈 + 仅首都与已确认宏观地点的标签；放大进入地方档
   （res ≤ 0.9）自动解除聚合并显示全部名称（declutter 避让）。
   证据：`map-p1-assets/theme-light-world-1440.png`（干净的世界档）对比
   `theme-light-local-1440.png`（地方档全标签）。
2. **"①和③做成深色浅色模式"** → 采纳：①的全量烘焙图与③的全矢量不是两个
   产品方向，而是同一张地图的 **浅色/深色主题变体**。原型②提供
   `setTheme('light'|'dark')`：浅色 = 引擎 `atlas` 预设底图 + 浅色矢量 token，
   深色 = 引擎 `dark` 预设底图 + 深色 token。③保留为全矢量压力对照。
   证据：`theme-{light,dark}-world-1440.png` 同一数据同一布局仅换 token。

主题化带来的两个底图修正：河流不再烘焙进栅格（放大发虚），改走 51 条矢量线；
coastGlow 在深色下关闭。

遗留（登记进 P4 style pack 工作项）：dark 预设的浅水/海滩 cell 呈灰白色带
（`theme-dark-world-1440.png` 海岸边缘与北地斑块），属于引擎 style token
级重着色，P4 编制 `atlas-clean` 深色变体时统一解决。

修订后复测：连续缩放 6s 60fps（长帧 0）；20 次挂载/卸载 heap Δ0MB；
点击选择与 200% 缩放可达性不变。

## 7. 结论与下一步（2026-08-29 二次视觉验收修订）

**技术 Gate 通过**：OpenLayers 在真实 12,000-cell 数据上满足性能、矢量命中、
屏幕字号标签、连续缩放、生命周期与四视口的可行性要求，正式依赖
`ol@10.10.0`（已锁定）。

**地点视觉 Gate 未通过**：用户对四张主题图复验后确认，世界档数字 cluster 仍然
形成点位墙，地方档在硬阈值后一次性展开全部名称，地点层级、当前写作上下文、
同名消歧和地方底图细节均不足。第 6 节修订只能证明 cluster 技术可用，不能证明
当前默认显隐策略成立；其中“干净的世界档”结论作废。

后续不直接进入原 P2/P3 视觉实现，先执行修订计划 P1.5：用真实地点语义 fixture、
writing/explore/review 三模式、上下文 rank、标签预算和缩放 hysteresis 重新完成浅色
world/region/local 视觉 Gate。P2 的资产持久化合同可以独立推进，正式 P3 视口须等待
P1.5 与 P2 同时通过。

全量门禁补充：2026-08-29 复跑 `verify:full` 时，21 个测试文件和 123 个用例本身
全部通过，但违反仓库 `files <= 20` 硬预算，命令 exit 1，后续 build/docs 未执行。
超限来自 P0 新增独立 `mapModelV2.test.js`；P1.5 实现前须把 12 个合同用例完整
并入既有宿主文件，不能以删除断言或修改测试发现规则绕过。故 P0/P1 可称技术交付
完成，不称全量项目门禁闭环。

遗留（进入后续阶段，不阻塞 Gate）：

- 国名/连续边界/state label 路径 → P4 Azgaar adapted source；
- 搜索/测量/绘制/吸附 → P3/P5；
- 应用字体与主题联动的有界刷新 → P3；
- `w390Status` 中 `vectorFeature=undefined` 是跨页面重载后内存记录不延续的显示问题，仅影响 spike 状态栏文案。
