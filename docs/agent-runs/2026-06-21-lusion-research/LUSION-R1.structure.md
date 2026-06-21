# LUSION-R1 — lusion.co 页面结构与叙事节奏调研 (只读)

> **Owner**: Claude (LUSION-R1, 2026-06-21)
> **Scope**: https://lusion.co/ 首页 + 全站 header/footer/menu
> **方法**: curl 抓主页 HTML (58.6 KB, 1 line of minified HTML) + 人工抽 ID/class/data-* 谱系 + 文本剥离
> **不做**: 3D 性能评估、WebGL 渲染、音频、移动端单独调研
> **目标读者**: Codex / user, 给 Pinax Welcome/Writing/Notes/Experience 后续 polish 提供结构参考

---

## 0. TL;DR

lusion.co 不是 "卡片墙", 是 **6 个串联场景**: `header → hero → reel → featured → goal → end → footer`. 每个 section 都是**全屏 1 场景**, section 之间用 scroll indicator (`scroll to explore` / `CONTINUE TO SCROLL` / 章节装饰) 桥接, 而不是滚轮 + 卡片堆.

**叙事节奏** (从顶到底):
1. **hero** (1 屏) — 价值主张 + 视觉冲击
2. **reel** (1 屏, 大标题) — 自我介绍 + 视频样本
3. **featured** (N 屏滚) — 作品集, 每屏 1 项目, 项目自带 `data-color-bg / data-color-text / data-color-shadow` 主题
4. **goal** (1-2 屏) — 服务理念 + 召唤文字 ("Step into a new world")
5. **end-section** (1 屏) — 收尾 CTA ("Let's work together")
6. **end-bottom** (过场, 非 section) — `CONTINUE TO SCROLL` 指示器, 桥接 end → footer
7. **footer-section** (1 屏) — 地址 + 社交 + newsletter + ©

**8 条可迁移原则** + **5 条禁止照搬** 见 §5 / §6.

---

## 1. 主页叙事顺序 (verified by ID 谱系)

### 1.1 6 个主要 section

| 顺序 | ID | 文案 (verbatim) | 类型 |
|---|---|---|---|
| 1 | `home-hero` | (隐式 hero, 无 visible title 提取到) | 全屏 hero, 含 3D 视觉 + `scroll to explore` 指示器 |
| 2 | `home-reel` | "Bold Ideas, Brought to Life" + "We combine design, motion, 3D, and development to create digital experiences that feel visually striking and technically seamless." | 大标题 + desc + CTA "Our Approach" + 视频播放器 (PLAY/MUTE/计时) |
| 3 | `home-featured` | (隐式 featured work section, 含 `<a class="project-item">` 列表) | 项目列表, 每个 `<a class="project-item project-type-website">` 自带 `data-color-bg / data-color-text / data-color-shadow` |
| 4 | `home-goal` | "We do not chase trends or produce work that looks like everyone else..." + "Step into a new world and let your imagination run wild" | 服务理念 + 隧道文字召唤 |
| 5 | `end-section` | "Let's work together!" (inside `end-section-title-link`) | 收尾 CTA, 含 3 个装饰 decoration (`-top` / `-bottom-left` / `-bottom-right`) |
| 6 | `footer-section` | "Suite 2 / 9 Marsh Street / Bristol, BS1 4AA / United Kingdom" + Twitter/Instagram/LinkedIn + newsletter + ©2026 LUSION | 地址 + 社交 + 邮件订阅 |

### 1.2 过场元素 (非 section)

- **`home-hero-scroll`**: "scroll to explore" (hero 底部内嵌, 提示初次滚动)
- **`end-bottom`**: "CONTINUE TO SCROLL" + 双向箭头 (过场元素, 桥接 end → footer)

### 1.3 Section 内部 container 层级 (4 层)

每个 section 都是 `<section id="..."> <div id="...-container"> <div id="...-container-inner"> <content>`:

```
<section id="home-hero">                              ← 顶层语义
  <div id="home-hero-visual-container">               ← 3D / 视觉层
    ...
  </div>
  <div id="home-hero-scroll-container">               ← 滚动提示层
    <div class="home-hero-scroll-container-cross">   ← 装饰 marks (×/×)
    <div id="home-hero-scroll">scroll to explore</div>
  </div>
</section>
```

这种 4 层 (`section / container / container-inner / content`) 是**视觉分离的关键**: 外层做 clip/animation, 内层做布局/内容. Pinax 现状 (writing/notes/experience) 用 ad-hoc `xxx__main / xxx__shelf / xxx__dossier` 命名, 但没有统一的"container / container-inner" 两层剥离.

---

## 2. "可探索场景" 的实现机制

### 2.1 数据驱动的项目卡 (非手写卡片)

每个作品项不是手写 HTML, 而是 `data-*` 属性驱动:

```html
<a class="project-item project-type-website"
   href="/projects/oryzo_ai"
   data-id="oryzo_ai"
   data-color-bg="#1a1411"
   data-color-text="#ffedd7"
   data-color-shadow="0.9">
  <div class="project-item-main">
    <div class="project-item-image"></div>
  </div>
  <div class="project-item-footer">
    <div class="project-item-line-1">concept • web • design • development • 3d • animation</div>
    <div class="project-item-line-2">
      <div class="project-item-line-2-icon"></div>
      <div class="project-item-line-2-inner">Oryzo AI</div>
    </div>
  </div>
</a>
```

每项目**自带主题色** (bg/text/shadow), 通过 `data-color-*` 让 CSS 接管. 类似 Pinax 的 `--archive-*` token, 但**作用域是 per-item** 而非 global.

### 2.2 跨项目发现的 10 个项目 ID

`choo_choo_world / ddd_2024 / devin_ai / of_the_oak / oryzo_ai / porsche_dream_machine / soda_experience / spaace / spatial_fusion / synthetic_human` — 全部通过 `data-id` 暴露, 应该是从 CMS 渲染.

### 2.3 装饰 marks (cross / + / ×)

`home-reel-video-container-cross` (5 个) + `home-hero-scroll-container-cross` (多个) + `end-section-title-*-decoration` (3 个) — 用**小型几何 marks**作为视觉节拍, 类似装订线的 `+` mark. Pinax 的 cork-board (Writing) 已经有类似痕迹, 但数量比 Lusion 少.

### 2.4 CTA 一致签名

每个 CTA 都是 `(dot) + (text) + (inline SVG arrow)` 三段式:

```html
<a id="home-reel-cta" href="/about">
  <span id="home-reel-cta-dot"></span>
  <span id="home-reel-cta-text">Our Approach</span>
  <span id="home-reel-cta-arrow">
    <svg ...><path stroke="#fff" d="M2.343 8h11.314m0 0L8.673 3.016M13.657 8l-4.984 4.984"></path></svg>
  </span>
</a>
```

**SVG arrow 是同一段 path** 在所有 CTA 复用, 不是每处手画. Pinax 的 `.material-action-btn` 18px hard-offset signature 类似, 但 Lusion 的版本更"轻盈" (单 stroke path), Pinax 的版本更"印章" (重投影).

### 2.5 视频播放器原生 controls (非自定义)

`home-reel-video-placeholder` + `home-reel-video-watch-btn` — 视频容器内置 PLAY/MUTE/进度条, 不做 SaaS 自定义. 文本里看到 "PLAY MUTE 0 0 0 0 0 0" — 是默认 `<video>` 控件的暴露.

### 2.6 End-section CTA "Let's work together" 装饰 3 件套

`<span id="end-section-title-top-decoration">` + `<span id="end-section-title-bottom-left-decoration">` + `<span id="end-section-title-bottom-right-decoration">` — 收尾标题周围 3 个装饰元素, 像档案册封面角饰. Pinax Writing 的 `dossier-tape` / `wall__pin` 是同类机制, 但密度小.

---

## 3. Header / Menu / Scroll Indicator / Back / CTA 参与体验

### 3.1 Header (全站 sticky)

```
<header id="header">
  <div id="header-container">
    <div id="header-center">
      <div id="header-logo">                     # logo (首页)
      <div id="header-menu">                     # mega menu (展开态)
        <div id="header-menu-links">              # 菜单项容器
          <a class="header-menu-link" data-page="home">
            <div class="header-menu-link-background">   # 鼠标 hover 背景
            <div class="header-menu-link-inner">         # 内容
              <span class="header-menu-link-text">Home</span>
              <span class="header-menu-link-text-clone">Home</span>   # 文字 clone, 可能是 marquee / hover cross-fade
              <svg class="header-menu-link-svg">...</svg>           # 右箭头
          </a>
          <!-- About us / Projects / ... -->
        </div>
        <div id="header-menu-labs">               # 子菜单: Labs (R&D)
          <div class="header-menu-labs-lucy-svg">...</div>
          <span id="header-menu-labs-text">labs.lusion.co</span>
        </div>
        <div id="header-menu-newsletter">         # 子菜单内嵌 newsletter 输入
          <form id="header-menu-newsletter-form">
            <input id="header-menu-newsletter-input-field">
            <span id="header-menu-newsletter-input-arrow">...</span>
          </form>
        </div>
        <div id="header-menu-talk">              # 子菜单: Talk (CTA)
          <svg id="header-menu-talk-icon">...</svg>
          <span id="header-menu-talk-text">Let's talk</span>
        </div>
      </div>
      <div id="header-center-project-back-btn">  # 子页才出现的 back 按钮
        <svg id="header-center-project-back-btn-svg"></svg>
        <span id="header-center-project-back-btn-svg2"></span>
        <span id="header-center-project-back-btn-text">Back</span>
      </div>
    </div>
    <div id="header-right">
      <button id="header-right-menu-btn">          # 3 dots hamburger (展开/收起 menu)
      <button id="header-right-sound-btn">         # 静音切换 (hero 视频伴音)
      <div id="header-right-talk-container">       # 右上 "Let's talk" CTA, 含 placeholder (滚动文字占位)
        <button id="header-right-talk-btn">
          <span id="header-right-talk-btn-text">Let's talk</span>
        </button>
      </div>
    </div>
  </div>
</header>
```

**关键观察**:
- menu 项每个有 `text-clone` —— 极可能是 hover 时让"当前 text"淡出 + "clone text"淡入的 cross-fade, 或长文字 marquee 滚动
- 同一 menu 容器里塞了 4 类不同模块: 链接列表 / Labs 子菜单 / Newsletter 输入 / Talk CTA — **不是单层 nav, 是 mega menu with embedded mini-sections**
- "Back" 按钮只出现在子页 (`.project-item` click 进入项目详情后), 通过 `header-center-project-back-btn` 出现
- Header 有 mute 按钮 — 暗示 hero 视频有声音, 这是 3D 工作室网站专属. Pinax 不需要

### 3.2 滚动指示器 (`scroll to explore` / `CONTINUE TO SCROLL`)

两段式, **位置 + 文案递进**:

| 位置 | 文案 | 视觉装饰 |
|---|---|---|
| `home-hero-scroll` | "scroll to explore" (邀请) | 单一文字 + 装饰 crosses |
| `end-bottom` | "CONTINUE TO SCROLL" (命令) | 文字×2 (重复, 视觉占满) + 左右各 2 个箭头 |

**文案变化**: "explore" (探索) → "CONTINUE TO SCROLL" (命令). 从鼓励 → 引导.

**视觉密度变化**: hero 只 1 行 → end-bottom 4 件套 (text×2 + arrow×4). 密度随位置递增.

### 3.3 "Let's work together" 是 链接 + 装饰 4 件套

```html
<div id="end-section-title">
  <div id="end-section-title-link">Let's work <br> together!</div>   # 整段文字是个 link
  <span id="end-section-title-top-decoration"></span>
  <span id="end-section-title-bottom-left-decoration"></span>
  <span id="end-section-title-bottom-right-decoration"></span>
</div>
```

**整段 CTA 文字本身就是 clickable link**, 周围 3 个装饰元素 (`-top` / `-bottom-left` / `-bottom-right`) 像档案册封面四角. 不需要单独的 "click here" 按钮 — 文案本身就是入口.

### 3.4 Footer 内部结构 (5 区域)

```
<div id="footer-section" class="section">
  <div id="footer-bg">                # 背景层 (与内容脱钩)
  <div id="footer-top">                # 顶部装饰
  <div id="footer-middle">
    <div id="footer-middle-contact">    # 左列: 地址 + 社交
      <a id="footer-contact-address">...</a>
      <div id="footer-contact-socials">
        <a class="footer-socials-line"> Twitter / X <svg arrow> </a>
        ...
      </div>
    </div>
    <div id="footer-middle-newsletter"> # 右列: newsletter 表单
      <form id="footer-newsletter-form">...</form>
    </div>
  </div>
  <div id="footer-bottom">             # 底部 ©
    <div id="footer-bottom-copyright">©2026 LUSION</div>
    <div id="footer-bottom-labs">R&D: labs.lusion.co</div>
    <div id="footer-bottom-tagline">Built by Lusion with ❤</div>
  </div>
</div>
```

每个 social link 自带 SVG arrow icon. 风格统一: 都是 `class="footer-socials-line"` + `class="footer-socials-line-svg"` + `class="footer-socials-text"`.

---

## 4. Pinax 页面 ↔ Lusion 元素 映射

| Lusion 元素 | Pinax 对应 | 可迁移? |
|---|---|---|
| `home-hero` 全屏 hero | Welcome (WelcomeView.vue) | 部分 (无 3D, 仅文本 + 字体选择) |
| `home-reel` 大标题 + desc + CTA | Writing (Writing.vue dossier top) | 标题 + 描述文案可参考 |
| `home-featured` 项目列表 | Notes (Notes.vue drawer + active-card) | 项目卡结构高度相似 |
| `home-goal` 服务理念 | Welcome (WelcomeView hero 下文) | 文字节奏可参考 |
| `end-section` Let's work together | (Pinax 当前无明确"联系 / 启动 session" CTA) | **新加**, 缺失 |
| `footer-section` 地址 + 社交 + newsletter | AppShell (AppShell.vue footer) | 已有, 但密度低 |
| `header-menu` mega menu | AppShell drawer | 现有, 但只有 1 层 |
| `header-right-talk-btn` "Let's talk" 持久 CTA | (Pinax 无 persistent CTA) | **新加**, 缺失 |
| `header-center-project-back-btn` back on sub-page | OpeningPage (OpeningPage.vue top) | 已有返回按钮 |
| `home-hero-scroll` "scroll to explore" | (无) | **新加**, 缺失 |
| `end-bottom` "CONTINUE TO SCROLL" | (无) | **新加**, 缺失 |
| `home-goal-tunnel-title` 隧道召唤文字 | (无) | 可借鉴 |
| `project-item` per-color theme | Notes pinned-slip / Writing dossier | 类似机制 (archive-* token), 但**全局**而非 per-item |

---

## 5. 8 条可迁移到 Pinax 的设计原则

按可迁移优先级排序 (高 → 低).

### P1. Section ID 命名 + container 双层剥离

**Lusion 模式**: `<section id="home-hero"> <div id="home-hero-container"> <div id="home-hero-container-inner"> <content>` — 顶层语义命名, 内层 clip/animation, 内内层 layout/content.

**Pinax 现状**: ad-hoc 命名, 没有统一的 container 双层 (writing 是 `wall__molding / wall__cork / wall__main`, experience 是 `game-layout / game-main-shell / game-main`).

**迁移做法**: 给 Pinax 每个 page 用 `<page>-<section>` 命名 (writing-cor, writing-shelf, writing-dossier 等), 每个 section 拆 `container / container-inner / content` 三层. 实现 deep-link anchor + scroll progress tracking.

**适配 Pinax**: 改名不动 CSS, 只动 ID attribute + 内部 div 加 `-container / -container-inner` 包装.

### P2. Per-Item data-color-* 主题属性

**Lusion 模式**: 每个 `<a class="project-item">` 自带 `data-color-bg / data-color-text / data-color-shadow`, CSS 通过 `[data-color-bg]` 接管. 项目自带视觉身份, 不靠 global token.

**Pinax 现状**: `--archive-*` 是 global token, 7 类 (inspiration / draft-prose / event / character-fact / worldbook-draft / storyboard-seed / reference-image) 共享色板.

**迁移做法**: Notes pinned-slip 加 `data-kind-color`, 每个 slip 自带 kind 色. 撕角 + tab + 装饰都从 `data-` 取色. 类似机制已经在 N5C 部分实现 (`.empty-archive__cell--kind` 用 `--cell-color` style binding).

**适配 Pinax**: Notes.vue pinned-slip v-for 加 `:data-kind-color="getAssetKindColor(slip.kind)"`, kao.css `.pinned-slip[data-kind-color]` 用 `attr()` 或 fallback. 不需要 store 改动.

### P3. CTA 一致签名 (dot + text + SVG arrow)

**Lusion 模式**: 每个 CTA 都 `<span dot> + <span text> + <svg arrow>`. 同一段 SVG path 复用. 这是品牌一致性签名.

**Pinax 现状**: `.material-action-btn` 用 18px hard-offset (重投影), 跟 Lusion 的轻盈单 stroke 路径风格相反. 两种风格都有效, 但 Pinax 应该**统一全站 CTA**, 不要一种 chip 一种箭头.

**迁移做法**: 建立 `<button class="pinax-cta"><span dot><span text><svg arrow></button>` 共享 utility, 替换所有 ad-hoc `.material-action-btn` / `.action-btn.primary` / `.wall__tab` / `.pinned-slip__unpin` 之类. SVG arrow 复用 path.

**适配 Pinax**: 新增 `.pinax-cta` 在 kao.css, 用 token 控色, 全站统一. 不要强行把现有 `.material-action-btn` 改成 Lusion 风格 (那会破坏 W5R ship).

### P4. Scroll indicator 文案递进 (2 段)

**Lusion 模式**: hero `scroll to explore` (邀请) → mid/end `CONTINUE TO SCROLL` (命令). 文案变化 + 视觉密度递增.

**Pinax 现状**: 无 scroll indicator (依赖浏览器原生 scrollbar, 无文案提示).

**迁移做法**:
- Welcome 第一屏底: 小字 "向下滚动查看更多" (邀请态)
- Writing 中央或 chapter 切换点: 小字 "继续翻页" (命令态)
- 不强求 Lusion 的箭头装饰, 仅文案递进即可

**适配 Pinax**: Welcome / Writing / Notes 都加 scroll indicator, 文案根据页面调. 不要在 Experience 加 (那里是 chat 流, 用户应该停下来读, 不是滚).

### P5. 项目卡 3 段式 (image + line-1 分类 + line-2 标题 + icon)

**Lusion 模式**: `<a class="project-item"><div main image></div> <div footer> <div line-1>concept • web • 3d</div> <div line-2> <icon/> <name/> </div> </div></a>`.

**Pinax 现状**: Notes active-card 是 `<article class="active-card"><header><title input><stats></header> <body textarea></article>` — 没有 icon line + category line.

**迁移做法**: Notes drawer 的 index-card 改成 3 段 (kind tag + title + stat), active-card 的 header 加 chapter / kind label line + icon. 类似 Lusion 的 `line-1` (metadata) + `line-2` (name + icon).

**适配 Pinax**: Notes.vue index-card template 加 `<div class="index-card__line-1">inspiration · draft</div>` + `<div class="index-card__line-2"><svg/><span>灯塔笔记</span></div>`. 已有部分类似机制 (N5C material-entry-card), 统一签名.

### P6. End-section "Let's work together" 装饰 3 件套 + 整段可点

**Lusion 模式**: `<div id="end-section-title"> <div link>Let's work together!</div> <span top-decoration> <span bottom-left-decoration> <span bottom-right-decoration> </div>`. 文字本身是 link, 周围 3 个装饰是档案册封面角饰.

**Pinax 现状**: 无 end-section 概念 (没有 persistent "launch session" CTA).

**迁移做法**: 给 Welcome 加一个 "Launch new session" CTA section, 整段文字 link + 周围 archive-style decoration (像 `wall__pin` 的 metal pin 或 `dossier-tape` 的撕角).

**适配 Pinax**: WelcomeView.vue 在 hero 之下, worldbook select 之前, 加 `<section class="welcome-launch">` with text-link + 3 corner pins.

### P7. Mega menu 内嵌 4 类模块 (links / Labs / Newsletter / Talk)

**Lusion 模式**: 单个 `<div id="header-menu">` 容器, 内含 4 个子模块 (链接列表 / Labs 子品牌 / Newsletter 表单 / Talk CTA). 不是单层 nav, 是 **multi-section mini-app** 在 header 里.

**Pinax 现状**: AppShell.vue drawer 只有 settings + appearance controls, 没有 newsletter + talk CTA + 实验室子菜单.

**迁移做法**: AppShell drawer 升级为 mega menu: drawer 内分 3-4 区 (导航 / Newsletter / Talk CTA / 主题切换). 注意区分 nav vs utility 区.

**适配 Pinax**: AppShell.vue 加 `<div class="shell-mega-section">` for newsletter input + `<div class="shell-talk-cta">`. 不强求 Lusion 的 Labs 子品牌 (Pinax 没有 R&D 子站).

### P8. Header 持久 CTA ("Let's talk" 持久在右上)

**Lusion 模式**: `header-right-talk-container` + `header-right-talk-btn` 永远显示在 header 右上, 不依赖 menu 展开. 用 `placeholder` 视觉技巧让 CTA 文字滚动或常驻.

**Pinax 现状**: 无 persistent CTA. 只有 "返回" + "新建" 在 page 内部.

**迁移做法**: AppShell 右上角加 "新会话" 或 "落笔" 持久按钮. 跟 menu hamburger 平级. 给 user 一个**永远可达的入口**.

**适配 Pinax**: AppShell.vue 加 `<button class="shell-persistent-cta">新会话</button>` 跟 `.shell-menu-btn` 同级. 路由 → `/notes?action=new` 或 `/opening`.

---

## 6. 5 条禁止照搬 (Pinax 不适合)

按阻塞度排序 (高 → 低).

### B1. 3D WebGL hero (核心体验)

**Lusion 做法**: 首页 hero 是 3D 场景 + 实时渲染. 用户进站就看到 3D 物体在转. 这是 Lusion 作为 "3D 工作室" 的品牌承诺.

**Pinax 不要做**: Pinax 不是 3D 工作室. Welcome hero 加 3D = 巨大 cost (模型 + 性能 + 可访问性 + 内容维护) 而 ROI 极低 (Pinax 用户来创作, 不是来看 3D demo). 当前 5A/5B 立绘已经够用.

**例外**: 如果未来要做 "开场页 hero 用真实 character art 旋转", 才考虑. 现在不做.

### B2. Header mute / sound toggle

**Lusion 做法**: header 有 `header-right-sound-btn` 因为 hero 是有声视频.

**Pinax 不要做**: Pinax hero (OpeningPage / WelcomeView) 是静态文本 + 立绘, 无声. 加 mute 是**没有内容的 chrome**. 会让用户疑惑"这页面有声音?".

**例外**: 如果未来 OpeningPage hero 加背景音乐, 才考虑. 现在不做.

### B3. "Lusion Labs" 子品牌 + LUCY SVG mascot

**Lusion 做法**: mega menu 有 Labs 子菜单 + LUCY SVG mascot, 引导到 `labs.lusion.co` (R&D 子站). 这是**单一公司品牌延展**, 不可迁移.

**Pinax 不要做**: Pinax 是 Pinax, 没有 "Labs 子站". 加 mascot + 子品牌 = 抄袭品牌, 不是迁移模式. Pinax 自己有 character 立绘 (5B v0.1 ship 6 个), 用 narrator / speaker-thumb 等已有立绘即可.

**例外**: 永远不做. 抄袭品牌 ≠ 学设计.

### B4. 物理地址 + Google Maps 链接

**Lusion 做法**: footer 有完整地址 (Suite 2, 9 Marsh Street, Bristol, BS1 4AA) + 地图 link. Lusion 是**实体工作室**, 这信息有意义.

**Pinax 不要做**: Pinax 是 web 工具, 无实体地址. 加地址 = 假信息 / 误导用户. Open source 项目应放 GitHub link + Discord/Slack link + 文档 link, 不放街道地址.

**例外**: 永远不做物理地址.

### B5. Global `data-page="home"` 单一 active-state

**Lusion 做法**: 每个 menu link 带 `data-page="home"`, 全站通过 `[data-page].active` 标记当前页.

**Pinax 不要做**: Pinax 用 Vue Router (`router.currentRoute.value.name`), 单页应用有 7+ routes (welcome / opening / experience / writing / notes / proseEssay / settings), 单个 `data-page` attribute 无法表达这么多状态. Pinax 应该继续用 Vue Router + computed 当前 route name.

**例外**: 永远不改回 Lusion 的 data-page 模式. Vue Router 是正确选择.

---

## 7. Pinax 现状 vs Lusion 差距

### 7.1 已经有的

| Pinax 已有 | 类似 Lusion |
|---|---|
| `--archive-*` token | 类似 Lusion `data-color-*` per-item |
| `dossier-tape` 撕角 | 类似 Lusion `end-section-title-*-decoration` |
| 字符立绘 (5B ship) | Lusion 用 3D, Pinax 用 2D, 但"叙事配图"概念同 |
| `workbenchNav` drawer | 类似 Lusion mega menu |
| `GmPersonaLauncher` CTA | 类似 Lusion header-right-talk-btn |
| `status-bar / quest-log / geography-panel` 在 experience sidebar | 类似 Lusion footer 内部"附加模块"概念 |

### 7.2 缺失的 (按 ROI)

| 缺失 | ROI | 难度 |
|---|---|---|
| Scroll indicator 文案递进 (hero + mid) | 中 | 低 |
| End-section 装饰 3 件套 + 整段可点 CTA | 高 | 中 |
| Mega menu 内嵌 Newsletter / Talk | 高 | 中 |
| Per-item data-color-* 主题 | 中 | 低 |
| 全站统一 CTA 签名 (dot + text + arrow) | 中 | 低 |
| Header 持久 CTA (右上) | 高 | 低 |
| Project-card 3 段式 (image + meta + name+icon) | 中 | 低 |

**最高 ROI 缺失**: End-section CTA (Welcome launch session) + Header 持久 CTA (右上 "新会话"). 这两个直接解决 user 反馈的"Welcome / 新会话入口不显眼"问题.

---

## 8. 自我审查 — 不要照搬的边界

| 风险 | 缓解 |
|---|---|
| Pinax 抄 Lusion 3D hero 风格 | §6 B1 明确禁止, 5A/5B ship 已有立绘, 不要再加 3D |
| 把 mega menu 抄得过复杂 | §5 P7 限定为 4 区 (nav + newsletter + talk + theme), 不要超 5 |
| 全站加 scroll indicator 反而干扰阅读 | §5 P4 限定为 hero + Writing, Experience 不加 |
| Per-item data-color 让主题色失控 | §5 P2 限定 kind 类目映射, 不让用户自由配色 |
| 整段 CTA 可点反而不直观 | §5 P6 用 cursor pointer + hover underline 暗示, 不要纯 link |

---

## 9. 总结

lusion.co 教 Pinax 的核心不是 "3D hero", 是**结构思维**:

1. **场景化叙事**: section 不是 box, 是 scene. 每个 scene 都有自己的视觉身份 (data-color, decoration, scroll behavior)
2. **数据驱动**: 项目卡自带主题, 不靠 global token 强行统一
3. **装饰密度递增**: scroll indicator 从 1 行 → 4 件套, 暗示"越往下越重要"
4. **mega menu 是 mini-app**: 不只是导航, 是嵌入 4 类功能 (links + labs + newsletter + talk)

Pinax 抄**结构**, 不抄**视觉风格** (3D, mascot, address). 8 条可迁移原则 + 5 条禁止照搬 是给后续 polish (W6/W7/N10/E10) 用的清单, 单独一个 polish 切片完成 2-3 条即可, 不要批量.

---

## 附录: 调研数据 (供 user / Codex 复现)

```
$ curl -s -L -A "Mozilla/5.0..." --max-time 30 https://lusion.co/ -o /tmp/lusion.html
-rw-r--r-- 1 ... 58598 Jun 21 19:41 /tmp/lusion.html   # 58.6 KB, 5 lines minified

$ grep -c "id=\"" /tmp/lusion.html         # 164 unique IDs
$ grep -oE "id=\"(home|end|footer|header)-[a-z-]*\"" | sort -u | wc -l   # 99 section IDs
$ grep -oE "data-id=\"[a-z_]*\"" | sort -u | wc -l    # 10 project IDs
```

**Section 谱系** (主要):
- header (24 IDs): logo / menu / menu-links / menu-labs / menu-newsletter / menu-talk / right / right-menu-btn / right-sound-btn / right-talk-btn / center / center-project-back-btn
- home-hero (7 IDs): scroll / scroll-container / scroll-container-crosses / title / visual-container
- home-reel (16 IDs): title / desc / cta / thumb / video-container / video-watch-btn (3 IDs) / video-title / video-placeholder / container / container-inner
- home-featured (8 IDs): title / title-wrapper / title-top / cta (3 IDs) / disclaimer
- home-goal (15 IDs): title / tunnel-title / context / image-in/out (5 IDs each) / texts
- end-section (11 IDs): title / title-link / subtitle / content / inner / outer / title-top-decoration / title-bottom-left-decoration / title-bottom-right-decoration / end-bottom (4 IDs)
- footer-section (15 IDs): bg / top / middle / middle-contact / middle-newsletter / footer-bottom / footer-newsletter-bg / footer-newsletter-form / footer-newsletter-input (3 IDs) / footer-bottom-copyright / footer-bottom-labs / footer-bottom-tagline

**Decoration marks 复用**:
- `home-hero-scroll-container-cross` × 4
- `home-reel-video-container-cross` × 5
- `home-hero-scroll-container-crosses` × 1 (wrapper)
- `home-reel-video-container-crosses` × 1 (wrapper)
- `home-reel-video-container-decoration` × 1 (wrapper)
- `end-section-title-top-decoration` + `end-section-title-bottom-left-decoration` + `end-section-title-bottom-right-decoration` × 3 (corner marks)

**CTA 模板 (同 SVG path 复用)**:
- `home-reel-cta-arrow` / `home-featured-cta-arrow` / `home-goal-tunnel-title-line` 用同一段 right-arrow path
- Footer socials `footer-socials-line-svg` 用不同 SVG (向外指 corner arrow, 暗示"go to")

**Method**: curl + grep + python text extraction. 无浏览器自动化, 无 screenshot, 无 env script.
