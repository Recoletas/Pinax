# pose-brief.md — 5B v0.2 立绘 pose 候选清单 (给手画任务用)

**Date**: 2026-06-25
**Session**: C3 worker (内容线程)
**Branch**: `main` (无 commit / 无 push)
**用途**: 给 5B v0.2 你手画立绘任务清单 (5B v0.1 micu 占位 ship 后, 真人手画 v0.2 准备)
**注意**: 本 brief **不画图**, 只给 pose 候选清单 + 场景 / 表情 / 服饰 / 构图 / 色调 关键词

## TL;DR

5B v0.1 ship 了 6 张立绘 (`src/config/characterArt.js` 7 entries, 6 real + 1 stub), 全部是 **少女锚** + **场景** 变体, **无具体人物立绘**。**边境王国 6 个核心人物 (伊薇队长 / 苔娜 / 索德 / 卢岑公使 / 赫玛教授 / 1 个未提) 全部缺立绘**。本 brief 给:
1. 6 张 v0.1 立绘的现有 pose 清单 + 用途
2. v0.2 要补的 pose 候选 (5 类: narrator 变体 / opening-cover 场景变体 / 索德 / 苔娜 / 卢岑 + 赫玛)
3. 每 pose 的 场景 + 表情 + 服饰 + 构图 + 色调 关键词
4. 落地建议 (手画顺序 + 风格约束 + 跟 v0.1 set 一致性)

## 1. 现状 (2026-06-25)

### 1.1 6 张 v0.1 立绘 (`src/config/characterArt.js:9-17`)

```js
export const characterArt = [
  { id: 'opening-cover',     src: kaoArchiveOpeningCover,     status: 'real', label: '开场档案' },
  { id: 'narrator',          src: kaoArchiveNarrator,         status: 'real', label: '在场叙述者' },
  { id: 'speaker-thumb',     src: kaoArchiveSpeakerThumb,     status: 'real', label: '对话人' },
  { id: 'opening-scene-01',  src: kaoArchiveOpeningScene01,   status: 'real', label: '01 边界小镇' },
  { id: 'opening-scene-02',  src: kaoArchiveOpeningScene02,   status: 'real', label: '02 废墟灯塔' },
  { id: 'opening-scene-03',  src: kaoArchiveOpeningScene03,   status: 'real', label: '03 塔内档案室' },
  { id: 'writing-sidekick',  src: stubSilhouette,             status: 'stub', label: '批注者' },
]
```

7 entries: 6 real + 1 stub (writing-sidekick 仍用 stub-silhouette.svg)

### 1.2 文件实际清单 (`src/assets/characters/`)

| poseId | 文件 | 体积 | 状态 |
| --- | --- | --- | --- |
| `opening-cover` | `kao-archive-opening-cover.webp` | 164 KB | real (v0.1 ship) |
| `narrator` | `kao-archive-narrator.webp` | 144 KB | real (v0.1 ship) |
| `speaker-thumb` | `kao-archive-speaker-thumb.webp` | 156 KB | real (v0.1 ship) |
| `opening-scene-01` | `kao-archive-opening-scene-01.webp` | 164 KB | real (v0.1 ship) |
| `opening-scene-02` | `kao-archive-opening-scene-02.webp` | 120 KB | real (v0.1 ship) |
| `opening-scene-03` | `kao-archive-opening-scene-03.webp` | 152 KB | real (v0.1 ship) |
| `writing-sidekick` | `stub-silhouette.svg` | ~1 KB | stub (待 v0.2) |
| 共用 fallback | `stub-silhouette.svg` | ~1 KB | stub |

总 v0.1 立绘资源: 900 KB webp + 1 KB svg

### 1.3 每张立绘的现有用途

| poseId | 用途 | 引用位置 | 期望 1024×1360 (3:4) |
| --- | --- | --- | --- |
| `opening-cover` | OpeningPage hero 海报 (主入口) | `OpeningPage.vue:194` `<CharacterPortrait pose-id="opening-cover" size="hero">` | kao 锚少女, 坐姿 3/4 侧身, 半抬头, 书在膝上翻开 |
| `narrator` | Experience 0-state hero + Welcome dossier 副位 | `Experience.vue` inline-detail + `Notes.vue` narrator 档 | kao 锚少女, 半身 3/4 侧身, 半隐在档案纸后, 视线在书与 viewer 之间 |
| `speaker-thumb` | Experience inline-detail-card header 左 (96px 缩略) | `Experience.vue:208` `<CharacterPortrait pose-id="speaker-thumb" size="thumb">` | 旁白老者, ~50-60 岁, 宽檐帽 / 高领 / 金丝眼镜, 平视 viewer, 羽毛笔 / 老照片 |
| `opening-scene-01` | OpeningPage 3 瓦片档案条第 1 张 | `<CharacterArchiveStrip>` tile[0] | 边界小镇场景 |
| `opening-scene-02` | 同上 tile[1] | `<CharacterArchiveStrip>` tile[1] | 废墟灯塔场景 |
| `opening-scene-03` | 同上 tile[2] | `<CharacterArchiveStrip>` tile[2] | 塔内档案室场景 |
| `writing-sidekick` | Writing page 批注中 sidebar portrait | `Writing.vue` `.wall__dossier-portrait` | (stub, 待 v0.2 手画) |

**5B spec 锁定方向** (`docs/superpowers/specs/2026-06-15-stereo-migration-design.md:228-230`):
- `opening-cover`: kao 锚少女, 坐姿 3/4 侧身, 邀请感 + 档案感并存
- `narrator`: kao 锚少女, 半身 3/4 侧身, 被动档案员不是教师
- `speaker-thumb`: **新人物** (旁白老者), 跟少女锚不是同一个人, 标志对话被引用

**5B spec 强约束** (L238): "严禁不同张图出现不同人物 (即使 3 个 pose 同少女) — 这是 set 一致性的最关键约束"。

**v0.1 已违背这条?** opening-cover + narrator + 3 scene 都是少女锚, speaker-thumb 是新人物老者 — 这是 spec 故意设计的 (少女 + 老者 = 同世界不同角色), 不算违背。

## 2. v0.2 候选 pose 清单 (5 类)

### 2.1 narrator 表情变体 ×2 (HIGH 优先)

**当前**: 1 个静默 pose (`narrator` 半身 3/4 侧身, 半隐档案纸后, 视线在书与 viewer 之间)
**缺**: 中段对峙 / 收尾悬念 2 个表情变体 (C3 user 要求)

#### pose `narrator-confrontation` (中段对峙)

- **场景**: Experience.vue Round 3-5 中段, 中段对峙时显示
- **表情**: 微微抬眉, 嘴角紧闭, 眼视 viewer 偏左下 (在思考下一句), 整体偏严肃
- **服饰**: 跟 narrator 同一件 (衣领 / 颜色 一致), 但加 1 个细节: 手中多了 1 份文件
- **构图**: 半身 3/4 侧身 (跟 narrator 同角度, 保持 set 一致), 1024×1360 3:4
- **色调**: archive-olive 50% + archive-gold 22% (跟 narrator 同 palette, 但 gold 多 1 点表达对峙张力)
- **跟 v0.1 narrator 区别**: 表情 + 手中文件 (2 个可识别差异)

#### pose `narrator-suspense` (收尾悬念)

- **场景**: Experience.vue Round 6-8 收尾, 玩家准备"整理成三方证据卡"时显示
- **表情**: 半抬眼, 视线上扬 15°, 微微张嘴 (在等下一句), 整体偏悬念 / 未闭合
- **服饰**: 跟 narrator 同一件, 手中文件多了 1 张 (累计 2 张, 表达证据收集中)
- **构图**: 半身 3/4 侧身, **整体后退 10%** (画面留白多, 表达"等下一句")
- **色调**: archive-olive 50% + archive-photo 18% (更冷, 偏夜雾色调)
- **跟 v0.1 narrator 区别**: 表情 + 视线上扬 + 留白

### 2.2 opening-cover 场景变体 ×3 (MEDIUM 优先)

**当前**: 1 个 (`opening-cover` 少女坐读半抬, 书在膝上翻开)
**缺**: 夜港 / 钟楼 / 难民营 3 个场景变体 (C3 user 要求)

#### pose `opening-cover-nightport` (夜港)

- **场景**: OpeningPage 玩家选 "夜访灯痕码头核夜账" 按钮时显示 (Round 3 入口)
- **背景**: 灯痕码头夜雾 + 远处雾灯 + 港雾压城
- **人物**: kao 锚少女, 站立 3/4 侧身, 披薄斗篷, 手里 1 盏小雾灯
- **构图**: 全身 3:4 (比 hero pose 更窄, 给场景更多空间), 1024×1360
- **色调**: archive-paper-soft 70% + archive-olive-strong 22% + 1 抹 accent-rose (雾灯 1 抹红)
- **跟 v0.1 opening-cover 区别**: 站立 vs 坐姿 + 雾灯 + 场景背景

#### pose `opening-cover-clocktower` (钟楼)

- **场景**: OpeningPage 玩家选 "先去钟楼查痕迹" 按钮时显示 (Round 1 入口)
- **背景**: 暮湾钟楼内景 + 微弱烛光 + 潮湿石台
- **人物**: kao 锚少女, 半身 3/4 侧身 (跟 narrator 同), 手按在 1 份值守册上
- **构图**: 半身特写, 1024×1360
- **色调**: archive-olive 60% + archive-gold 14% (比 narrator 更暗, 烛光感)
- **跟 v0.1 opening-cover 区别**: 半身 vs 坐姿全身 + 钟楼背景 + 值守册

#### pose `opening-cover-refugee` (难民营)

- **场景**: OpeningPage 玩家选 "找证人问雾军" 按钮时显示 (Round 5 入口)
- **背景**: 灰墙难民营外景 + 湿篷布 + 远处灰墙
- **人物**: kao 锚少女, 半身 3/4 侧身, 视线低 (在听证人说话), 手中没东西 (倾听姿态)
- **构图**: 半身 + 背景远景, 1024×1360
- **色调**: archive-paper-soft 80% (冷灰, 表达难民场景)
- **跟 v0.1 opening-cover 区别**: 站姿 + 难民营背景 + 倾听姿态

### 2.3 索德码头夜班头目 ×1 (HIGH 优先, Round 4 对峙用)

**当前**: 完全无立绘
**缺**: 索德立绘, 第四轮对峙用 (C3 user 要求)

#### pose `sod-ya` (索德对立角色)

- **场景**: Experience.vue Round 4, 玩家发"谁阻止我查账"时显示
- **人物**: **新人物, 非少女锚**, ~40-50 岁男性, 潮盐行会夜班头目, 宽肩膀
- **服饰**: 厚帆布工作服 + 皮围裙 + 腰挂账房钥匙 + 帽檐压低
- **表情**: 眼视 viewer 偏右下, 下巴微抬, 嘴角紧闭 (在压制对方)
- **构图**: 半身胸像, 1024×1360 3:4 (跟 speaker-thumb 同 3:4 派生, 标志"对话被引用")
- **色调**: archive-olive-strong 60% + 1 抹 accent-rose (衣领红章, 标志行会身份)
- **跟 speaker-thumb 区别**: 年轻 20 岁 + 工作服 vs 学者服 + 帽檐压低 vs 宽檐帽
- **跟少女锚区别**: 完全不同人物, 这就是 5B spec L238 允许的"同世界不同角色"扩展

### 2.4 苔娜难民领队 ×1 (HIGH 优先, Round 5 证人用)

**当前**: 完全无立绘
**缺**: 苔娜立绘, 第五轮证人用 (C3 user 要求)

#### pose `tiana-witness` (苔娜证人)

- **场景**: Experience.vue Round 5, 玩家发"我去难民营找苔娜"时显示
- **人物**: **新人物, 非少女锚**, ~30-40 岁女性, 难民领队, 消瘦但眼神锐利
- **服饰**: 厚毛毯披肩 (难民服) + 头发束起 + 1 抹 archive-rose 围巾 (标志难民互助会)
- **表情**: 眼视 viewer 偏左上, 嘴唇微张 (在回忆目击瞬间), 整体偏坚定
- **构图**: 半身 3/4 侧身, 1024×1360 3:4
- **色调**: archive-paper 60% (冷灰, 跟 opening-cover-refugee 同 palette) + archive-rose 12% (围巾)
- **跟少女锚区别**: 完全不同人物, 跟 narrator / opening-cover 少女不是同一人
- **跟 索德 sod-ya 区别**: 女性 + 难民服 vs 工作服 + 锐利 vs 压制

### 2.5 卢岑公使 + 赫玛教授 ×2 (MEDIUM 优先, Round 7-8 用)

**当前**: 完全无立绘
**缺**: 2 个次要人物立绘, Round 7 (卢岑递密令) + Round 8 (赫玛解学院线索) 用

#### pose `lucin-envoy` (卢岑公使)

- **场景**: Experience.vue Round 7, 王室密令抵达时显示
- **人物**: ~25-30 岁男性, 王室公使, 年轻急躁
- **服饰**: 王室紫红长袍 + 金边 + 王室纹章胸针
- **表情**: 眼视 viewer, 嘴唇紧抿 (在压制自己别激动), 整体偏年轻气盛
- **构图**: 半身正坐 (跟 speaker-thumb 同正坐构图, 标志"权威对话")
- **色调**: accent-rose 30% (王室红) + archive-gold 22% (金边)
- **跟 speaker-thumb 区别**: 年轻 30 岁 + 王室长袍 vs 学者服 + 急躁 vs 沉稳

#### pose `herma-professor` (赫玛教授)

- **场景**: Experience.vue Round 8, 学院观测线推进时显示
- **人物**: ~55-65 岁女性, 银藤学院雾潮史教授, 学者气质
- **服饰**: 学院深蓝长袍 + 银丝眼镜 + 厚笔记本夹在腋下
- **表情**: 眼视 viewer 偏右上, 嘴角微抬 (在思考解释), 整体偏学术
- **构图**: 半身 3/4 侧身 (跟 narrator 同 3/4, 表达"档案员" 同源身份)
- **色调**: archive-photo 40% (学院深蓝) + archive-gold 18%
- **跟 narrator 区别**: 老 30 岁 + 学院袍 vs 少女档案服 + 厚笔记本 vs 文件

## 3. 风格约束 (跟 v0.1 set 一致)

### 3.1 跟 v0.1 锁定的方向一致 (per 5B spec L224-240)

- **人物 set 一致性**: 严禁同一人物在 2 张图里画成不同长相 / 不同服饰 (5B spec L238 强约束)
- **少女锚** (narrator / opening-cover 系列) 必须是 1 个少女的 3-4 个 pose, 不是 3-4 个少女
- **非少女锚** (speaker-thumb / sod-ya / tiana-witness / lucin-envoy / herma-professor) 各 1 个, 互不相同
- **场景 pose** (opening-scene-01/02/03 + opening-cover-3 变体) 不出现人物, 只出环境

### 3.2 色调约束 (per kao.css existing tokens)

- 主调: `--archive-olive` (橄榄绿, 标志边境雾潮)
- 副调: `--archive-gold` (暗金, 标志钟楼 + 学院)
- 强调: `--accent-rose` (印泥红, 标志人物/动作张力)
- 背景: `--archive-paper-soft` (米白, 标志档案册)
- 冷调: `--archive-photo` (深蓝绿, 标志夜雾 + 学院)

避免用 `--accent` (普通红, 太 SaaS), 避免 raw hex (违反 uiPolish 规则)

### 3.3 构图约束

- 比例: 1024×1360 (3:4) 全部统一
- 人物位置: 中下 1/3, 头顶留 1/3 给场景背景 / 文字 overlay
- 边框: 撕角 8-14px (跟 stub-silhouette.svg 同)
- 装饰: 1-2 处 archive 金边 / 印泥章 (跟 v0.1 narrator 同), 不超过 2 处否则会乱

### 3.4 文件命名 (跟 v0.1 一致)

- `kao-archive-{poseId}.webp` 全小写连字符
- 跟 v0.1 同 1 套命名, 避免特殊字符
- PNG 副本 (人工审查用) 走 `docs/demo/kao-archive-{poseId}-001.png` (5B plan L48-50 锁定的 pattern)

## 4. 落地建议 (手画顺序)

### 4.1 推荐手画顺序 (HIGH → MEDIUM → LOW)

**第一批 (HIGH 优先, 2 周内)**:
1. `narrator-confrontation` + `narrator-suspense` (2 张, Round 3-5 + Round 6-8 表情变体)
2. `sod-ya` (1 张, Round 4 对峙)
3. `tiana-witness` (1 张, Round 5 证人)

→ 4 张, 优先解决"GM 引用 6 个人物但 5 个无立绘"的最大缺口

**第二批 (MEDIUM 优先, 4 周内)**:
4. `opening-cover-clocktower` + `opening-cover-nightport` + `opening-cover-refugee` (3 张, 3 入口按钮变体)
5. `lucin-envoy` + `herma-professor` (2 张, Round 7-8)

→ 5 张, 解决"3 action 按钮都是同 1 张图" 的体验问题

**第三批 (LOW 优先, Phase 3)**:
- 写实场景图 / 物品图 / 章节插图 (5B spec L20 明确延后)
- 多余的表情变体 (Round 9+ 业务还没起来不需要)

### 4.2 跟 v0.1 工作流对齐

per 5B plan L82:
- `cwebp -q 80 input.png -o output.webp` 手动转 (PNG → WebP)
- `cp input.png docs/demo/kao-archive-{poseId}-001.png` 给人工审查
- `src/config/characterArt.js` 改 1 行 import + 1 行 status='real'
- 1 commit ship gate (类似 5B v0.1 节奏)

### 4.3 风格协调 (跟 micu 5B v0.1 不完全一样)

v0.1 是 micu gpt-image-2 出的 (微漏 tiara red gem + mole 细节, v0.1 ship report 提到)。v0.2 你手画可以:
- 修正 v0.1 微漏 (tiara red gem 加 / 不加可定, mole 细节可定)
- 整体跟 micu 风格保持兼容 (写实 1.57MP 福利档, 不要走 2K 高清方向, 避免 visual jump)
- 边缘柔化 (跟 v0.1 1.57MP 福利档同 抗锯齿, 避免 4K 锐利)

## 5. 落地步骤 (Phase 2, 不在本轮)

1. C3 brief (本文件) 落地, 用户 review
2. 用户手画 4 张 HIGH 优先 (2 周)
3. ship commit 1: feat(art): 4 v0.2 立绘 (narrator-confrontation / narrator-suspense / sod-ya / tiana-witness) + characterArt.js 4 行
4. 用户手画 5 张 MEDIUM (4 周)
5. ship commit 2: feat(art): 5 v0.2 立绘 (3 opening-cover 变体 + lucin-envoy + herma-professor) + characterArt.js 5 行
6. GmPersonaLauncher 调参 (跟 demo-persona-brief §5 联动)
7. C2 真实手测重跑 (验证新立绘在 Round 1-8 显示是否符合 spec)

## 6. Out of scope (NOT shipped)

- 实际手画 (本 brief 不画, 只列清单)
- micu image_generate 占位 (per memory `feedback_no_uninvited_image_gen`, 不主动调, 等用户 run)
- `src/config/characterArt.js` 改 status (本轮 0 改代码)
- `src/composables/useCharacterArt.js` 扩 pose (无需扩, 已支持任意 poseId 字符串)
- GmPersonaLauncher.vue 改 (跟 demo-persona-brief 联动, 单独轮次)
- 新的人物世界观 (例如加 1 个未提的第六人物) — 跟 C1 4 补点不冲突, 但本 brief 不引入
