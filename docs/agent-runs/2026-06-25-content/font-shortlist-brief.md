# font-shortlist-brief.md — 字体 shortlist (Phase 2 finalize 用)

**Date**: 2026-06-25
**Session**: C3 worker (内容线程)
**Branch**: `main` (无 commit / 无 push)
**用途**: 给 Phase 2 字体 finalize + 5B v0.2 立绘 + GM persona 联动时的字体选型 shortlist, **本 brief 不敲定,给候选 + 理由 + 落地步骤**。

## TL;DR

现栈 4 套 token (`--font-display` ZCOOL XiaoWei / `--font-serif` 同 / `--font-sans` Segoe UI 栈 / `--font-mono` ui-monospace) + 1 个本地 `@font-face` (LXGW WenKai 596KB, OFL 1.1)。**LXGW 是作为 last-resort fallback 装的, 在小字号 (10-13px) 糊 / 体积 596KB 在 Welcome 一打开就下载**。本 brief 给 3 套 (DISPLAY 装饰 / BODY 正文 / LXGW 替代) 每类 2-3 候选 + 推荐 + 落地步骤。

## 1. 现状清单 (2026-06-25)

### 1.1 字体 token (`src/styles/main.css:40-55`)

```css
/* Self-hosted display font (LXGW WenKai v1.522, OFL 1.1) */
@font-face {
  font-family: "LXGW WenKai";
  font-display: swap;
  src: url("../assets/fonts/LXGWWenKai-Regular.woff2") format("woff2");
}

:root {
  --font-display: "ZCOOL XiaoWei", "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  --font-serif: "ZCOOL XiaoWei", "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  --font-sans: "Segoe UI Variable", "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}
```

`--font-body` token **当前不存在** (用户提了,代码里没这个变量)。Body 沿用 `--font-serif` (ZCOOL XiaoWei)。这是小字号糊的根因之一 — ZCOOL XiaoWei 是装饰字, 不该 body 用。

### 1.2 `<head>` 字体预连接 (`index.html:9-11`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=ZCOOL+XiaoWei&display=swap" rel="stylesheet">
```

只预连 + 加载 ZCOOL XiaoWei 1 个。LXGW 是 self-host woff2 (`@font-face`)。其它 Google Fonts (如思源宋体) 未加载。

### 1.3 现有字体文件 (`src/assets/fonts/`)

```
LXGWWenKai-Regular.woff2   596 KB   (实测 607096 bytes, 2026-06-16 ship)
OFL.txt                   4.4 KB   (SIL OFL 1.1, 已确认)
```

### 1.4 5B v0.1 立绘 webp 大小 (背景参考)

```
kao-archive-narrator.webp            144 KB
kao-archive-opening-cover.webp       164 KB
kao-archive-opening-scene-01.webp    164 KB
kao-archive-opening-scene-02.webp    120 KB
kao-archive-opening-scene-03.webp    152 KB
kao-archive-speaker-thumb.webp       156 KB
```

(参考,本 brief 不改这些)

## 2. 短板分析

| 字体 | 当前用法 | 短板 | 严重度 |
| --- | --- | --- | --- |
| **ZCOOL XiaoWei** | `--font-display` + `--font-serif` (装饰 + body 通用) | 装饰字误用 body,小字号 (10-13px) 笔画糊; 标题大字 (24px+) 仍清晰 | HIGH |
| **LXGW WenKai** | `@font-face` (fallback, 实际未在 token 引用) | 596KB self-host, Welcome 一打开就下载; WOFF2 单字重 (Regular 400), 缺 Bold/Italic | MEDIUM |
| **Songti SC** | `--font-display` + `--font-serif` 第 3-4 fallback | macOS 自带, Windows / Linux fallback 链弱 (`STSong` 在 Win10+ 已移除); Linux 无 fallback 跌 Georgia (serif) | MEDIUM |
| **Segoe UI** | `--font-sans` (英文 / 数字 / UI 元素) | macOS 缺 Segoe UI 跌 -apple-system → PingFang SC 没问题; Windows 正常 | LOW |
| **缺 `--font-body` token** | body 沿用 `--font-serif` (ZCOOL) | body 不该用装饰字, 应独立 token 指向宋体栈或思源宋体 | HIGH |

## 3. 候选 shortlist (3 套, 每类 2-3 候选)

### 3.1 DISPLAY 装饰字 (用于 title / 标题 / hero)

| 候选 | 来源 | License | 体积估算 | 适配位置 | 推荐 |
| --- | --- | --- | --- | --- | --- |
| **ZCOOL XiaoWei** (现) | Google Fonts | OFL 1.1 (Google Fonts 公开) | ~50KB subset WOFF2 | 大标题 (24px+), `--font-display` 保留 | ⭐ **保留** |
| **ZCOOL QingKe HuangYou** | Google Fonts | OFL 1.1 (Google Fonts 公开) | ~80KB | 大标题 (v3.13 试过, 你回退"字体有点奇怪") | ❌ **不推荐** (v3.13 reject 记录) |
| **Ma Shan Zheng** | Google Fonts | OFL 1.1 | ~120KB | 大标题 (毛笔行楷, 比 ZCOOL XiaoWei 更狂) | ⚠️ 需人工核 (未试过, 不在 v3 调参) |
| **Long Cang** | Google Fonts | OFL 1.1 | ~110KB | 大标题 (狂草, 比 Ma Shan Zheng 更狂) | ⚠️ 需人工核 (v3.11 chain 试过 drop, 跟 QingKe 同批 reject) |
| **Liu Jian Mao Cao** | Google Fonts | OFL 1.1 | ~100KB | 大标题 (草书, 最狂) | ⚠️ 需人工核 (v3.11 chain drop) |
| **Alimama ShuHei** | 阿里妈妈 | OFL 1.1 (淘宝/天猫公开) | ~150KB subset | 大标题 (现代黑体 + 装饰, 偏 SaaS) | ⚠️ 需人工核 (license 需复核, 走阿里妈妈站点验证) |
| **幼圆** (YouYuan) | 系统自带 (Windows / macOS) | 系统 | 0 KB (系统调用) | 大标题 (圆体, Windows 自带) | ⚠️ 需人工核 (依赖系统, 不可控) |
| **501 Greatest** (艺术数字) | 设计师资源 | 需人工核 | n/a | 数字装饰 (段号 / 罗马序号) | ⚠️ 不在中文范围, 仅 5B 罗马序号 hover 用可考虑 |

**DISPLAY 推荐**: ⭐ **保留 ZCOOL XiaoWei**, 备选 Ma Shan Zheng (如果你要更狂的草书感), **不推荐 QingKe HuangYou / Long Cang / Liu Jian Mao Cao** (v3.11-13 reject 记录), **Alimama ShuHei 需人工核 license + 试渲**。

### 3.2 BODY 正文 (用于 paragraph / 描述 / 长文本)

| 候选 | 来源 | License | 体积估算 | 适配位置 | 推荐 |
| --- | --- | --- | --- | --- | --- |
| **Songti SC / STSong** (现) | macOS / Windows | 系统 | 0 KB | 正文 (--font-body 新 token 第一位) | ⭐ **保留** (无依赖) |
| **思源宋体 SC** (Source Han Serif SC) | Adobe + Google | OFL 1.1 (Source Han 全套) | 简体 ~10MB / 简+繁 ~20MB (超大) | 正文 (--font-body 第 2 位 fallback) | ⚠️ 体积太大, **仅 subset** (GB2312 2700 字 ~600KB) |
| **思源宋体 SC Variable** | Adobe | OFL 1.1 | 简体 ~6MB (variable) | 正文 (variable 字体可调 weight) | ⭐ **subset 后推荐** (Phase 2 优选) |
| **Noto Serif CJK SC** | Google | OFL 1.1 | 简体 ~10MB | 正文 (--font-body 第 2 位 fallback) | ⭐ **推荐** (跟思源宋体同源, Google Fonts CDN 加载快) |
| **Noto Serif CJK SC Variable** | Google | OFL 1.1 | 简体 ~6MB | 正文 (variable) | ⭐ **subset 后推荐** |
| **方正书宋** (FangZheng) | 方正字库 | 商业授权 (非 OFL) | n/a | 正文 | ❌ **不推荐** (商业授权, 需付费) |
| **LXGW Songti** (霞鹜宋体) | GitHub LXGW | OFL 1.1 | ~6MB | 正文 (霞鹜文楷同作者的宋体版本) | ⭐ **推荐** (OFL + 宋体 + LXGW 系列质量保证) |

**BODY 推荐**: ⭐ **新增 `--font-body` token, 顺序 `"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "LXGW Songti SC", Georgia, serif`**。**Phase 2 推荐 subset Noto Serif CJK SC Variable 简 ~600KB woff2 作 preload** (跟 LXGW 体积相当, 但覆盖 6000+ 简体字, fallback 链完整)。

### 3.3 LXGW 替代 (装饰用, 替代 596KB self-host woff2)

| 候选 | 来源 | License | 体积估算 | 适配位置 | 推荐 |
| --- | --- | --- | --- | --- | --- |
| **LXGW WenKai** (现) | GitHub LXGW | OFL 1.1 (已确认) | 596KB self-host | 装饰 fallback (不引用, 实际未用) | ⚠️ 体积大, 改为 **GB2312 subset** (~250KB) |
| **LXGW WenKai TC** (繁体版) | GitHub LXGW | OFL 1.1 | 596KB (繁) | 繁体场景 | ❌ 不需要 (项目是简体) |
| **LXGW WenKai Screen** (屏幕优化版) | GitHub LXGW | OFL 1.1 | ~300KB | 装饰 | ⭐ **推荐** (体积小一半, 屏幕渲染优化) |
| **霞鹜文楷 GB2312 subset** | 自建 | OFL 1.1 (源 OFL) | ~250KB (2700 字) | 装饰 / hero title | ⭐ **推荐** (subset 后体积可控) |
| **方正书宋** | 方正字库 | 商业授权 | n/a | 装饰 | ❌ 不推荐 (商业) |
| **Adobe 拼音体 / 仿宋** | 仿宋 | 系统 | 0 KB | 装饰 | ⚠️ 偏公文感, 跟 kao 调性不搭 |

**LXGW 替代推荐**: ⭐ **LXGW WenKai GB2312 subset (~250KB woff2)** — 项目已有 OFL.txt + 596KB 文件, 跑 pyftsubset 切 2700 字即可降到 250KB。**Phase 2 备选 LXGW WenKai Screen (~300KB)**, 屏幕优化版字距和抗锯齿更适合 web。

## 4. 推荐 + 理由 + 落地步骤

### 4.1 短期 (本 brief 不 ship, 留给 Phase 2 finalize 用)

**推荐 1**: 保留 ZCOOL XiaoWei (display), 新增 `--font-body` token 指向 Noto Serif CJK SC (subset), 把 ZCOOL 从 body 撤出

**理由**:
- 解决 10-13px body 糊的根因 (ZCOOL 是装饰字)
- Noto Serif CJK SC 跟 Google Fonts 同源, 跟现有 `index.html` Google Fonts preconnect 共用网络栈
- LXGW WenKai 596KB 实际未被 token 引用 (`main.css:52-53` 都没列 "LXGW WenKai"), 留着是 last-resort fallback, subset 250KB 即可

**落地步骤** (Phase 2, 不在本轮):
1. `pyftsubset LXGWWenKai-Regular.woff2 --text-file=gb2312.txt --flavor=woff2` → 250KB `LXGWWenKai-GB2312.woff2`
2. `index.html` 加 `<link rel="preload" href="...Noto+Serif+SC" as="style">` (Google Fonts 已有 ZCOOL, 加 Noto 同源)
3. `main.css:52-55` 加 `--font-body: "Songti SC", "STSong", "Noto Serif CJK SC", Georgia, serif;`
4. `AppShell.vue` + `Experience.vue` 等使用 `--font-serif` body 处改 `var(--font-body)`
5. `OpeningPage.vue` `.opening-title-block` 等 hero title 保留 `var(--font-display)` (ZCOOL XiaoWei)

### 4.2 中期 (Phase 2 finalize 阶段)

**推荐 2**: LXGW WenKai 改为 lazy load (不预加载, 首次访问 OpeningPage hero 才加载)

**理由**:
- LXGW 现在 self-host 596KB 预加载, Welcome 一打开就吃带宽
- 实际用 LXGW 的地方只有 OpeningPage `.opening-title-block strong` + 部分 kao.css hero (LXGW 作为 var(--font-display) 第三位 fallback, ZCOOL 第一位)
- 改成 lazy load 后 Welcome 打开只下载 ZCOOL (~50KB) + Noto Serif CJK SC (~600KB subset), LXGW 留作 fallback 不下载

**落地步骤**:
1. `index.html` 删 `<link rel="preload" ...LXGW...>` (当前没有, 实际是 @font-face 触发, 等同 preload)
2. 改用 `font-display: optional` 替代 `swap`, 浏览器只在有空闲时才下载 LXGW
3. LXGW subset 后 250KB, 接受 lazy load 延迟 (~500ms 内的 hero 闪一下 ZCOOL → LXGW)

### 4.3 长期 (Phase 3+, 不在本轮)

**推荐 3**: 用 Noto Serif CJK SC Variable 替代静态 woff2

**理由**:
- Variable 字体单文件覆盖 100-900 weight, 1 文件 vs 9 文件
- subset 后 6MB → 1.5MB (variable subset)
- 性能 vs 灵活性 trade-off, 视项目最终规模决定

## 5. 不推荐 + 理由

| 字体 | 不推荐理由 |
| --- | --- |
| **ZCOOL QingKe HuangYou** | v3.13 试过, 你回退"字体有点奇怪", reject 记录 |
| **Long Cang / Liu Jian Mao Cao** | v3.11 chain 试过 drop, 草书过度装饰, 不适合正文 |
| **方正书宋 / 方正字体** | 商业授权, 需付费, 不符合 OFL 优先 |
| **幼圆 (系统圆体)** | Windows / macOS 自带, Linux / Android 无 fallback, 不可控 |
| **Alimama ShuHei** (未试) | License 需人工核 (阿里妈妈站点), 偏 SaaS 调性, 跟 kao archive 调性不搭 |

## 6. 体积 vs 性能 trade-off (重要)

LXGW WenKai 596KB 现状 (self-host woff2, 在 Welcome 立即下载):

| 页面 | 引用 LXGW? | 当前开销 | 优化后开销 |
| --- | --- | --- | --- |
| `/welcome` | 间接 (var fallback) | 596KB 立即下载 (即使不用) | 0KB (lazy load) |
| `/opening` | 直接 (hero title) | 596KB 立即 (Welcome 阶段已下载) | 250KB (subset) 或 0KB (zcool 替代) |
| `/experience` | 不引用 | 596KB 已下载 (浪费) | 0KB (lazy load) |
| `/writing` | 不引用 | 596KB 已下载 (浪费) | 0KB (lazy load) |

**结论**: 当前 LXGW 预加载策略是浪费 — 596KB 在 Welcome 一次性下载, 但 4 个主页面只有 `/opening` 真用。**Phase 2 强烈建议 lazy load (改 `font-display: optional` + 不写 preload)**。

## 7. Out of scope (NOT shipped)

- 实际 subset woff2 文件 (本 brief 不下载 / 不生成)
- 实际切换 token (0 改代码)
- Noto Serif CJK SC subset 体积实测 (Google Fonts CSS 1 文件, 实际子集需 pyftsubset 跑)
- Alimama ShuHei license 复核 (需人工核, 当前 fetch 不可用)
- LXGW WenKai 跟 v3.14 "ZCOOL XiaoWei" 同台对比渲染 (需 Playwright 截图, 本 session 无)

## 8. 已知未确认 (per spec "需人工核" 标记)

以下候选本 session **未能 fetch 验证**, 必须人工核:

| 字体 | 待核 |
| --- | --- |
| Alimama ShuHei | 阿里妈妈站点 license + 商用授权 + 体积 |
| 501 Greatest | 设计师站点 license + 商用授权 + 体积 |
| 幼圆 (YouYuan) | macOS 12+ / Win11 / Android / Linux 实际 fallback 行为 |
| Noto Serif CJK SC Variable | Google Fonts 是否提供 Variable 子集 + 实际体积 |
| LXGW WenKai Screen | GitHub releases 是否仍维护 + 跟 LXGW WenKai 区别 |

**未确认字体本 brief 不进入推荐 (标 ⚠️), 需先核完再短list**。
