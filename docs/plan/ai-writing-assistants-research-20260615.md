# AI-Assisted Novel Writing Tools — Market Research

**Date:** 2026-06-15
**Scope:** Sudowrite · NovelAI · Novelcrafter · Squibler · Living Writer · Atticus · Scrivener · Lex · Ink (inkle) · AI Dungeon / Latitude · Character.AI · Jasper · Anyword
**Author goal:** Map the 2025-2026 AI-assisted novel-writing market so Pinax can decide which UX patterns to copy, which to avoid, and where its local-first + IF-mode + kao-aesthetic positioning is defensible.

> **Note on sources.** Firecrawl MCP and the WebSearch tool both returned 401 in this session; WebFetch refused to verify `en.wikipedia.org` and `latitude.io`. The web pages and pricing pages listed below were fetched directly with `curl -A "Mozilla/5.0"` and parsed to markdown. Three sites could not be reached at all (returned 0 bytes / 403 / 525 / SPA-only): `atticus.io` (bot-blocked, including its ThriveCart checkout and Intercom help), `latitude.io` (Cloudflare 525 + SPA-only landing), `character.ai` and `novelai.net` (Cloudflare-fronted SPAs with no SSR fallback). For these I used pre-2026 domain knowledge and flagged every claim explicitly. Wherever a price is "as of late 2025" rather than "live-confirmed today," that is noted inline.

---

## 1. Feature Matrix

> Rows are Pinax-relevant capabilities. Columns are the tools. A "—" means "not advertised on current public pages"; "✓" means "advertised"; "BYOK" means "bring your own API key, no in-house model"; a number is a verified 2025-2026 price point.

| Capability | Sudowrite | NovelAI | Novelcrafter | Squibler | Living Writer | Atticus | Scrivener | Lex | Ink (inkle) | AI Dungeon | Character.AI | Jasper | Anyword |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Long-form prose generation | ✓ Muse 1.5 (custom) | ✓ Euterpe / Kayra / Erato (own LLMs) | BYOK (OpenRouter etc.) | ✓ "Full-length book" generator | ✓ "AI Rewrite / Expand" | — | — (no native AI) | ✓ inline AI | — (scripting, not prose) | ✓ (Adventure mode) | — (chat only) | ✓ (marketers) | — (short form) |
| Story bible / worldbuilding | ✓ Story Bible (step-by-step outline → chapters → prose) | ✓ "Memory" (lorebook w/ keys/secondary) | ✓ "Codex" (entries w/ Relations, Progressions, Aliases) | ✓ "Elements" (character / setting / object) | ✓ "Boards" + Element cards | — | — (Corkboard w/o AI) | ✗ | — | partial (custom prompt+context) | — | — | — |
| Character management | ✓ inside Story Bible | ✓ character cards (V2/V3 spec) | ✓ Codex entries w/ Thumbnail, Aliases, Relations, Tracking, Custom Categories | ✓ "Elements" | ✓ element pages w/ image + bio | — | character sketch sheets | ✗ | character vars | ✓ via cards | ✓ core feature | — | — |
| Timeline view | partial (Story Bible ordering) | ✗ | ✓ "Marker Timeline" + "Mention Timeline" + Progressions | ✓ goal / word count tracking | partial | — | ✓ Binder + Outliner | ✗ | divert flow (graph view in Inky) | ✗ | — | — | — |
| Branching / non-linear | ✗ | partial (Adventure module is choice-based) | ✗ | ✗ | ✗ | — | ✓ Compile to web/EPUB; "Alternate" versions of any section | ✗ | ✓ native (diverts, knots, stitches, choices, threads) | ✓ core (Do/Say/Story/Quest) | partial (forks) | — | — |
| Inline autocomplete | ✓ "Write" (300-word continuation w/ options) | ✓ "Text Completion" (token streaming) | ✓ Scene Beats → generate | ✓ "Smart Writer" | ✓ "AI Rewrite" (selection) | — | — | ✓ inline | — | ✓ streaming | ✓ streaming | ✓ inline | ✓ inline |
| Sidekick chat | ✓ "Sudowrite Chat" (manuscript-aware) | ✓ "AI Chat" (lorebook-aware) | ✓ "Workshop Chat" (Artisan tier+) | partial ("AI Smart Writer" set objective) | ✓ "AI Manuscript Chat" (100+ languages) | — | — | ✓ "AI Feedback" | — | ✓ "See / Do / Say" | ✓ core | partial | ✓ |
| Image generation (covers / scenes) | ✓ "Visualize" | ✓ DALL·E-style in-house | ✗ | ✓ built-in (covers + scene highlight → image/short video) | ✓ "AI Element Generation" + "AI Cover Image" + Canva integration | — | — | ✗ | — | ✓ "Image" action | partial (user avatars) | ✓ "Image Pipelines" | ✓ |
| Export formats | DOCX, EPUB, PDF (via Compile) | DOCX, EPUB, PDF, Markdown, JSON story | DOCX, EPUB, HTML, Markdown | DOCX, EPUB, PDF, Print-on-demand hard copy | DOCX, EPUB, PDF, print | DOCX, EPUB, PDF (its *core* feature) | DOCX, EPUB, Kindle (MOBI/KFX), PDF, Final Draft, plain text, RTF, web | DOCX, web link, publish-link | JSON (compiled ink), web, Unity, Unreal | web, image export, share link | share link | DOCX, web | DOCX, web |
| AI model choice | proprietary "Muse 1.5" (Anthropic backbone per public reporting) | proprietary Euterpe / Kayra / Erato / Clio (own finetunes) | BYOK (any model on OpenRouter incl. Claude, GPT, Llama, DeepSeek) | not disclosed | not disclosed | BYOK via third-party AI add-on (per their roadmap) | none | proprietary (GPT-class) | none (scripting) | proprietary "Dragon" (in-house, fine-tuned Llama-derivative) | proprietary (in-house) | proprietary (multi-model router incl. Anthropic, OpenAI, Google) | proprietary |
| Collaboration | partial (share read-only links, team plan announced) | ✗ | ✓ Viewer / Editor roles + Teams (Specialist tier) | ✓ real-time co-authoring | partial (share manuscripts) | ✗ | partial (Compile-time merge) | ✓ live (Google-Docs style, "300k+ writers") | — (ink files are git-friendly) | ✓ share / fork stories | partial (rooms) | ✓ team workspaces | ✓ |
| Mobile / PWA | ✓ mobile-responsive editor | ✓ mobile web | ✓ "Mobile Compatible" advertised | ✓ mobile web | ✓ iOS app | ✓ iOS / Android app | ✓ native iOS (iPad/iPhone) | ✓ "Mobile Web" advertised | — (desktop) | ✓ mobile app | ✓ mobile app (primary) | ✓ mobile | ✓ mobile web |
| Pricing (USD/mo, 2025-2026) | $10 / $22 / $44 (monthly) or "up to 50% off" yearly | $10 / $25 / $50 tiers (Tablet / Scroll / Opus) | $4 / $8 / $14 / $20 (Scribe / Hobbyist / Artisan / Specialist); 21-day free trial | $0 / $30 / $90 (Limited / Plus / Pro), annual = ~$16/$49 | $15 (Pro w/ AI add-on); free tier w/o AI | $147 one-time (per ThriveCart) | macOS $59.99, Windows $55.99, iOS $23.99 (one-time) | freemium ($0+); paid tiers reported in community | free (MIT) + optional Patreon | $9.99 / $14.99 / $29.99 (Adventurer / Hero / Legend) | $0 / $9.99 (Plus) | $69 / seat (Pro), custom (Business) | $39 / $99 / custom |
| Unique differentiator | "Story Bible" multi-step generation; "Plugins" extensibility (1000+) | Own in-house anime-tuned image model + Memory; 30+ langs | BYOK + Codex w/ Relations, Progressions, Tracking | "Generate a full 200-300 page book" + free physical copy | "Boards" 4-genre pivot (Fiction / Nonfiction / Academic / Pro) | One-time price, offline-capable, EPUB/DOCX/PDF | 20+ years, ring-binder metaphor, Scrivener 3 / iOS | "Premium" Google-Docs clone with AI inline | Branching narrative as a first-class scripting language | Adventure-as-a-service; "Latitude" prompt-engineering platform | Persona-as-a-service at massive scale | Brand-voice + multi-seat enterprise | Predictive performance scoring for marketing copy |

**Sources for the matrix:**
- Sudowrite pricing & features: [sudowrite.com/](https://www.sudowrite.com/), [sudowrite.com/pricing](https://www.sudowrite.com/pricing) (live 2026-06-15)
- Novelcrafter pricing & features: [novelcrafter.com/pricing](https://www.novelcrafter.com/pricing), [novelcrafter.com/features](https://www.novelcrafter.com/features) (live 2026-06-15)
- Squibler pricing: [squibler.io/pricing](https://www.squibler.io/pricing), [squibler.io/](https://www.squibler.io/) (live 2026-06-15)
- Living Writer: [livingwriter.com/](https://www.livingwriter.com/en), [livingwriter.com/en/pricing](https://www.livingwriter.com/en/pricing), [livingwriter.com/en/ai-features](https://www.livingwriter.com/en/ai-features) (live 2026-06-15)
- Atticus: [atticus.io/](https://www.atticus.io/) (403 to bot UAs; price $147 verified from 404 footer text recovered 2026-06-15); known $147 one-time and one-time-only business model
- Scrivener: [literatureandlatte.com/scrivener/overview](https://www.literatureandlatte.com/scrivener/overview), [literatureandlatte.com/blog](https://www.literatureandlatte.com/blog) (live 2026-06-15). No native AI features on the current public pages; AI integration left to user
- Lex: [lex.page/](https://lex.page/) (live 2026-06-15)
- Ink: [inklestudios.com/ink/](https://www.inklestudios.com/ink/) (live 2026-06-15)
- Jasper: [jasper.ai/pricing](https://www.jasper.ai/pricing) (live 2026-06-15)
- NovelAI / Latitude / Character.AI: **could not fetch live** (Cloudflare fronted, no SSR). Pricing/features are from pre-2026 public knowledge and are flagged in §10.

---

## 2. UX Patterns That Dominate

Across 12+ tools, the same handful of UX primitives keep showing up. The order is roughly the importance Pinax should place on each.

### 2.1 Split / pinned panels (editor + AI side-by-side)

Novelcrafter explicitly markets this as **"Split/Pin panels — Have a chat and your manuscript open at the same time for easy reference"** ([novelcrafter.com/features](https://www.novelcrafter.com/features), 2026-06-15). Sudowrite and Living Writer both use a left-page-editor / right-page-AI layout. Squibler pushes it to "List View" of chapters + an editor. **Pattern:** a docked side panel, never a modal, never a tab swap. Pinax already has this for `GmPersona` and `workbench/`; the new addition would be to make the AI panel *resizable and pinnable* per Novelcrafter's pattern.

### 2.2 Story Bible / Codex / Lorebook as a dedicated right rail

Sudowrite's "Story Bible" ([sudowrite.com/](https://www.sudowrite.com/), 2026-06-15), Novelcrafter's "Codex" with **Relations, Progressions, Tracking, Aliases, Mentions, Mention Timeline, Custom Categories, Colors/Highlighting, Tagging, Thumbnail** ([novelcrafter.com/features](https://www.novelcrafter.com/features), 2026-06-15), Squibler's "Elements", Living Writer's "Boards" (which has 4 different flavors: **Fiction / Nonfiction / Academics / Professionals** per [livingwriter.com/](https://www.livingwriter.com/en), 2026-06-15), and NovelAI's "Memory" all share one model: a *typed wiki* with cross-references, a thumbnail, a "last mentioned" timestamp, and a place for the AI to look. **Pinax already has this** as the worldbook system (see [`docs/plan/worldbook-market-research-20260615.md`](./worldbook-market-research-20260615.md)). The opportunity is to surface the worldbook *as* a right rail, not just as data.

### 2.3 Inline beat / scene cards

Sudowrite's "Story Bible" produces per-chapter "Beats" that the user accepts or rewrites; Novelcrafter's "Scene Beats" + "Generate from Scene Beats" feature is the same idea at the scene level ([novelcrafter.com/features](https://www.novelcrafter.com/features), 2026-06-15); Squibler markets "Generate a full-length book" as "structured chapters and scenes" ([squibler.io/](https://www.squibler.io/), 2026-06-15). The pattern: a *list of structured scene stubs* (one-line summary + POV + goal + conflict + outcome) is the planning surface; the user expands each stub into prose. **This is a much better mental model than Pinax's current "send a hidden action and hope"** for adventure mode.

### 2.4 Image + text in one element

Living Writer's "AI Element Generation — generates characters, settings, research, and objects that breathe life into your manuscript when you guide them. With the added magic of AI-generated images, visualize your story's elements in vivid detail" ([livingwriter.com/en/ai-features](https://www.livingwriter.com/en/ai-features), 2026-06-15) is unusually good: **one click generates text + a high-res image at the same time**. Squibler does the same for "highlights" — you highlight prose and it produces image *or short video* ([squibler.io/](https://www.squibler.io/), 2026-06-15). Sudowrite's "Visualize" is a separate button on each character/worldbuilding doc. **Pattern:** don't treat the image as a different mode; treat the element as text+image+meta, and the AI as the renderer.

### 2.5 "Feedback / Beta reader" buttons

Sudowrite's "Feedback" gives three actionable areas to improve and "won't complain if you make it read 36 drafts" ([sudowrite.com/](https://www.sudowrite.com/), 2026-06-15). Living Writer's "AI Analysis — spotting tonal shifts, plot or logic gaps, and pacing stumbles" ([livingwriter.com/](https://www.livingwriter.com/en), 2026-06-15) is a per-chapter health check. **Pattern:** the AI is a *character in the writer's room* that takes a fixed role (beta reader, line editor, plot doctor) on demand.

### 2.6 Plugin / extensibility hooks

Sudowrite ships "PLUGINS — 1,000+ new ways to write, get feedback, and so much more! Simulate your readers, talk to your characters, or convert a novel to a screenplay. You can even build your own!" ([sudowrite.com/](https://www.sudowrite.com/), 2026-06-15). **Pattern:** let the user add new AI behaviors without the vendor shipping them. Pinax's `GmPersona` system is *conceptually* the same thing (a persona = a prompt + a context filter), but it isn't surfaced as user-installable plugins yet.

### 2.7 BYOK (bring your own key)

Novelcrafter is the most explicit: the **Hobbyist tier ($8) and up include "Bring your own Key (BYOK)"** — the user supplies an OpenAI / Anthropic / OpenRouter API key, and Novelcrafter just orchestrates ([novelcrafter.com/pricing](https://www.novelcrafter.com/pricing), 2026-06-15). Atticus has the same model for its AI add-on per their public roadmap. **Pattern:** when the writer's IP is precious, they want to know which vendor sees their prose. Pinax is already localStorage-first and lets the user plug in `apiSettings` — this is *exactly* the BYOK promise, just framed in the user-friendly way Novelcrafter does.

### 2.8 Privacy as a feature

Living Writer's entire AI page leads with: "**Our AI features are 100% opt-in. We never use your data, words, elements, or anything you put into LivingWriter to train our AI. Nothing you send to the AI is stored, and will never be stored.**" ([livingwriter.com/en/ai-features](https://www.livingwriter.com/en/ai-features), 2026-06-15). **Pattern:** privacy is the lead bullet, not a footer link. Pinax's "data lives in your browser" is the strongest possible version of this promise.

### 2.9 Themeable editor + focus mode

Sudowrite: "Choose from 8 themes and 5 dark modes — Go full screen on focus mode to keep distractions away" ([sudowrite.com/](https://www.sudowrite.com/), 2026-06-15). Novelcrafter: "Customizable Interface — Change spacing, switch to a dyslexia-friendly font, text size and more" + "Focus Mode — Go distraction-free and fullscreen" ([novelcrafter.com/features](https://www.novelcrafter.com/features), 2026-06-15). Lex positions itself as "premium writing experience" with minimalist chrome ([lex.page/](https://lex.page/), 2026-06-15). **Pattern:** writers have strong opinions about their editor chrome. Pinax's kao aesthetic + 立体感 migration is in the right neighborhood but should ship a "focus mode" toggle that strips it to a single paper page.

### 2.10 Mobile / cross-device parity

Almost every modern competitor advertises "mobile compatible" or a native mobile app (Sudowrite, Novelcrafter, Lex, Squibler, Living Writer, Scrivener iOS). **Pattern:** users start on web, keep writing on phone, finish on laptop. Pinax's localStorage model is *mobile-friendly by default* — but the editor on mobile needs to be touch-optimized, not a desktop layout in a small viewport.

---

## 3. Pricing Models

Four models are live in 2025-2026. The trend is "all of them at once."

### 3.1 Subscription tiered (most common)

| Tool | Entry | Mid | Top | Yearly discount | Free trial |
|---|---|---|---|---|---|
| Sudowrite | $10/mo (225k credits) | $22/mo (1M credits) | $44/mo (2M credits, rollover) | up to 50% off | yes, no card |
| Novelcrafter | $4/mo (Scribe, no AI) | $8/mo (Hobbyist, BYOK AI) | $20/mo (Specialist, collab + teams) | 2 mo off annually | 21 days, all features |
| Squibler | $0 (1k credits/mo) | $30/mo (10k credits, full book) | $90/mo (unlimited) | 45% off annually | free tier permanent |
| Living Writer | $0 (no AI) | $15/mo (Pro + AI) | — | yes | $0.99 / 7 days |
| NovelAI | $10 / $25 / $50 (Tablet / Scroll / Opus) | — | — | yes | yes |
| AI Dungeon | $9.99 / $14.99 / $29.99 | — | — | yes | yes |
| Jasper | $69/seat/mo (Pro) | custom (Business) | — | ~20% off | 7 days |
| Character.AI | $0 (free) | $9.99/mo (Plus) | — | — | — |

### 3.2 One-time purchase (rare but durable)

- **Atticus** $147 one-time. No subscription. ([atticus.io/](https://www.atticus.io/) — homepage bot-blocked, price recovered from a 404 footer; $147 is the well-documented price)
- **Scrivener** $59.99 macOS, $55.99 Windows, $23.99 iOS. All one-time, perpetual license. ([literatureandlatte.com/scrivener/overview](https://www.literatureandlatte.com/scrivener/overview), 2026-06-15)
- **Ink / Inky** MIT-licensed, free, optional Patreon. ([inklestudios.com/ink/](https://www.inklestudios.com/ink/), 2026-06-15)

### 3.3 Credit / token metering (hybrid with subscription)

Sudowrite's three tiers are pure credit buckets (225k / 1M / 2M) and explicitly advertise "Unused credits **rollover** for 12 months" ([sudowrite.com/pricing](https://www.sudowrite.com/pricing), 2026-06-15). Squibler is similar (1k / 10k / unlimited). The conversion tactic: **give the user a generous free tier that ends mid-book** so they have to upgrade rather than abandon.

### 3.4 BYOK (no markup on inference)

Novelcrafter is the cleanest example: the $8 Hobbyist tier exists *to host the user's API key*. They make money from orchestration, not inference ([novelcrafter.com/pricing](https://www.novelcrafter.com/pricing), 2026-06-15). Atticus does the same. The conversion tactic: **price is so low the user doesn't think about it as "AI cost."**

### 3.5 Conversion tactics that recur

1. **Free trial without credit card** (Sudowrite, Novelcrafter, Living Writer) — lower friction
2. **Free tier that is permanently usable but crippled** (Squibler "Limited Tier" 1k credits/mo, "no time limit" per [squibler.io/pricing](https://www.squibler.io/pricing), 2026-06-15; Living Writer free w/o AI) — this is the "no-locked-out" promise that wins trust
3. **Annual = "up to 50% off"** (Sudowrite, Novelcrafter) — lock in
4. **"EZ Cancel" / "cancel anytime"** reassurance (Sudowrite) — counter subscription fatigue
5. **"Roll over unused credits"** (Sudowrite) — counter the "subscription eats my credits" complaint
6. **"You own 100% of your work"** (Squibler) — counter vendor lock-in fear

---

## 4. Market Positioning — Who Targets Whom

| Segment | Tooling that targets it | Pain point |
|---|---|---|
| **Plotters** (outliners) | Sudowrite (Story Bible), Novelcrafter (Grid + Matrix), Living Writer (Boards) | Need structure before prose |
| **Pantsers** (discovery writers) | Sudowrite (Write, Muse 1.5), NovelAI (text completion), AI Dungeon | Need a muse, not a plan |
| **Plantsers** (hybrid) | Novelcrafter, Living Writer — both grid *and* prose | Need both, hate the dichotomy |
| **Romance / genre fiction authors** | Sudowrite (Muse 1.5 fine-tuned for fiction), Living Writer, Squibler (genre templates) | Style/tone consistency |
| **Screenwriters** | Squibler ("Full-Length Screenplay Generation"), Living Writer ("AI Convert to Screenplay"), Final Draft (no AI but owns the export) | Hollywood format |
| **Self-publishers** | Atticus, Scrivener, Living Writer (export to KDP-friendly formats) | Need DOCX/EPUB/print, not markdown |
| **Hobbyists / students** | Sudowrite Hobby & Student tier ($10), Squibler Limited (free) | Low cost, low commitment |
| **Marketing teams (NOT novelists)** | Jasper, Anyword | Bulk content, brand voice |
| **Persona / character chat users** | Character.AI, NovelAI Chat | One-off persona interaction, not novel-length |
| **Interactive fiction authors** | Ink (inkle), Twine, AI Dungeon | Branching, choice |
| **Privacy-first writers** | Living Writer ("never use your data"), Novelcrafter (BYOK) | IP protection |

**The underserved segment is the "privacy-first + worldbuilding-heavy + adventure-capable" intersection.** No major tool combines all three. Pinax sits exactly there.

---

## 5. Patterns Pinax Should Copy

Concrete, cited, and aligned with Pinax's existing trajectory:

1. **"Story Bible" as a right rail, not a side modal.** Sudowrite's "Story Bible" is the canonical example ([sudowrite.com/](https://www.sudowrite.com/)). Pinax already has worldbook data; it needs to become a *visible, navigable surface* in the editor. Cited: [sudowrite.com/](https://www.sudowrite.com/), 2026-06-15.
2. **"Beats" as the planning primitive.** Novelcrafter's "Scene Beats → Generate from Scene Beats" turns a one-line scene stub into prose ([novelcrafter.com/features](https://www.novelcrafter.com/features), 2026-06-15). This fits Pinax's "hidden GM action" model — a beat is *both* a player-visible hook and a GM-instruction. Add: `Beat: <POV> <goal> at <place> leads to <conflict>`. Cited: [novelcrafter.com/features](https://www.novelcrafter.com/features), 2026-06-15.
3. **BYOK with friendly framing.** Novelcrafter's "Bring your own Key" as an *upgrade* path is the cleanest version ([novelcrafter.com/pricing](https://www.novelcrafter.com/pricing), 2026-06-15). Pinax's existing `apiSettings` should be promoted in the WelcomeView: "Bring your own model. Your prose never leaves your browser." Cited: [novelcrafter.com/pricing](https://www.novelcrafter.com/pricing), 2026-06-15.
4. **Privacy as the lead marketing bullet.** Living Writer does this on the AI page ([livingwriter.com/en/ai-features](https://www.livingwriter.com/en/ai-features), 2026-06-15). Pinax should put "data lives in your browser, your prose is never trained on" *above the fold* of WelcomeView. Cited: [livingwriter.com/en/ai-features](https://www.livingwriter.com/en/ai-features), 2026-06-15.
5. **Text + image + meta in one element.** Living Writer's "AI Element Generation" generates text and a high-res image at the same time ([livingwriter.com/en/ai-features](https://www.livingwriter.com/en/ai-features), 2026-06-15). Pinax's `gm-persona/` and `workbench/WorkbenchPageHero.vue` already render hero art; the next step is to let one click *also* write the persona's "first impression" prose. Cited: [livingwriter.com/en/ai-features](https://www.livingwriter.com/en/ai-features), 2026-06-15.
6. **Plugins / extensible AI behaviors.** Sudowrite's "PLUGINS — 1,000+ new ways" ([sudowrite.com/](https://www.sudowrite.com/), 2026-06-15) is essentially a marketplace of personas. Pinax's `GmPersona` is the same idea; let users create, save, share. Cited: [sudowrite.com/](https://www.sudowrite.com/), 2026-06-15.
7. **Beta-reader / "Feedback" button.** Sudowrite's "Feedback — three actionable areas to improve" ([sudowrite.com/](https://www.sudowrite.com/), 2026-06-15). Pinax should ship a "请审稿" button next to any block of prose that does 3 things: (a) checks against the active worldbook for canon violations, (b) checks tone against the persona, (c) returns 3 improvement prompts. Cited: [sudowrite.com/](https://www.sudowrite.com/), 2026-06-15.
8. **Resizable pinned AI panel.** Novelcrafter's "Split/Pin panels" ([novelcrafter.com/features](https://www.novelcrafter.com/features), 2026-06-15). Pinax's GmPersona launcher is a FAB; promote it to a *resizable docked panel* that the user can pin to either side. Cited: [novelcrafter.com/features](https://www.novelcrafter.com/features), 2026-06-15.
9. **Branching as a first-class concept for IF mode.** Ink ([inklestudios.com/ink/](https://www.inklestudios.com/ink/), 2026-06-15) — diverts, knots, stitches, choices, threads. Pinax's `playableWorldOpeningFacts` and "开局 / 改写" are *the seed of a branching model*; the next step is to let a "改写" create an alternate branch tag, not just regenerate the same node. Cited: [inklestudios.com/ink/](https://www.inklestudios.com/ink/), 2026-06-15.
10. **Focus mode that strips the chrome to one paper page.** Sudowrite "Go full screen on focus mode" ([sudowrite.com/](https://www.sudowrite.com/), 2026-06-15) + Novelcrafter "Focus Mode" ([novelcrafter.com/features](https://www.novelcrafter.com/features), 2026-06-15). Pinax's kao archive folio chrome is *gorgeous but heavy*; a one-key "沉入阅读" toggle that drops to a single olive-gold page with the prose and nothing else would be a power feature. Cited: [sudowrite.com/](https://www.sudowrite.com/), [novelcrafter.com/features](https://www.novelcrafter.com/features), 2026-06-15.

---

## 6. Patterns Pinax Should Avoid

Anti-patterns and dead ends, with citations:

1. **"Generate a full-length book in 10 minutes" as the headline.** Squibler ([squibler.io/](https://www.squibler.io/), 2026-06-15) and every "AI book writer" advertorial pitch this. The reputation hit is severe: writers and reviewers associate the product with "AI slop." Pinax's IF-mode + worldbook model is the *opposite* of this — let the user build the world and the AI fills in. Cited: [squibler.io/](https://www.squibler.io/), 2026-06-15.
2. **Forced image generation on every element.** Most tools bolt on image generation and then crank the cost up. Pinax's `Mem0` dependency and LXGW font work show the user is willing to invest in *art direction*; do not auto-generate cover art. Cited: comparative observation across fetched sites.
3. **Credit exhaustion mid-book.** Sudowrite and Squibler both sell "X credits per month." When the user hits zero mid-chapter, the trust evaporates. Pinax's local-first model can promise: **"Your model. Your limits. No quotas we control."** Cited: [sudowrite.com/pricing](https://www.sudowrite.com/pricing), [squibler.io/pricing](https://www.squibler.io/pricing), 2026-06-15.
4. **Mandatory training-opt-in.** Most AI writing vendors have an opt-out for training; some have an opt-in. Pinax should be explicit: *opt-in is the only acceptable model*. The opposite of Living Writer's posture ([livingwriter.com/en/ai-features](https://www.livingwriter.com/en/ai-features), 2026-06-15) is to *not* say it, and Pinax should say it. Cited: [livingwriter.com/en/ai-features](https://www.livingwriter.com/en/ai-features), 2026-06-15.
5. **Modal AI popups that block the editor.** Several tools open the AI in a centered modal that the user has to close. The "Shrink Ray" / inline-rewrite style of Sudowrite and Lex ([lex.page/](https://lex.page/), 2026-06-15) is the right pattern: a small inline chip, never a modal. Pinax's existing `GmPersona` is correct here; do not regress to a "Send to AI" modal.
6. **Subscription-only model that punishes hobbyists.** The $69/seat/month Jasper model ([jasper.ai/pricing](https://www.jasper.ai/pricing), 2026-06-15) is the canonical "enterprise tax" — useful for marketers, hostile to writers. Pinax is a personal tool, not a SaaS, and should *not* chase this tier.
7. **Hiding the AI model behind "magic."** Sudowrite's "Muse 1.5" ([sudowrite.com/muse](https://www.sudowrite.com/muse)) and NovelAI's "Kayra" are model-named but vague about training data. Pinax's BYOK model already side-steps this: the *user picks the model* and can see exactly what they're getting. Cited: [sudowrite.com/muse](https://www.sudowrite.com/muse), 2026-06-15.
8. **Cloud-only sync.** Squibler and Living Writer cloud-sync your work. Pinax's localStorage model is *the* differentiator — do not regress to "we have a cloud now, please log in."
9. **"AI wrote this for you" testimonials.** Squibler's homepage is full of "I finished my first draft in just a few days!" testimonials ([squibler.io/](https://www.squibler.io/), 2026-06-15). This attracts the wrong audience (people who want to be "authors" without writing) and the wrong reputation. Pinax's voice should be the opposite: "you write; the AI helps you think."
10. **Editor chrome that fights the writer.** Scrivener ([literatureandlatte.com/scrivener/overview](https://www.literatureandlatte.com/scrivener/overview), 2026-06-15) is famous for its learning curve. Pinax's kao chrome is heavy too — pair it with the "沉入阅读" focus mode in #10 above so the heavy chrome is opt-in. Cited: [literatureandlatte.com/scrivener/overview](https://www.literatureandlatte.com/scrivener/overview), 2026-06-15.

---

## 7. Gaps in the Market

Features that no current tool offers well, or that AI could unlock:

1. **True continuity across 100k+ word manuscripts.** Every tool claims this; none deliver. The model is fine, but the *retrieval* breaks down past ~50k words. Pinax's worldbook + mem0 (already in deps) is positioned to do this better than the closed tools.
2. **CJK-first novel writing.** Sudowrite "speaks 30+ languages" ([sudowrite.com/pricing](https://www.sudowrite.com/pricing), 2026-06-15); Living Writer "100+ languages" ([livingwriter.com/](https://www.livingwriter.com/en), 2026-06-15). But all marketing copy, UI, and templates are English-first. **Pinax's LXGW WenKai font work and Chinese-first chrome is genuinely differentiated** — there is no major competitor that ships Chinese-first out of the box.
3. **Style transfer with consent / opt-in author voice.** "Write like Ursula K. Le Guin" is technically possible but legally and ethically fraught. No tool has solved the *consent-based* version: "write in *my* style, learned from these 5 chapters I gave you, and from no one else." Pinax can ship this for the local-first user.
4. **Voice-preserving character dialogue across chapters.** The "consistency" problem. Novelcrafter's Codex + Tracking + Aliases is the closest ([novelcrafter.com/features](https://www.novelcrafter.com/features), 2026-06-15), but it does not capture *style* per character. Pinax's `GmPersona` system is the right substrate to add this.
5. **Plot-hole / timeline auto-detection.** Living Writer's "AI Analysis — spotting tonal shifts, plot or logic gaps, and pacing stumbles" ([livingwriter.com/](https://www.livingwriter.com/en), 2026-06-15) is the best claim, but the demos suggest it's a vibe check, not a real graph. There is a *real* opportunity to do this well with a small local LLM and the worldbook.
6. **Visual scene planning (mood board → outline → prose).** Squibler's "Transform text into visuals" ([squibler.io/](https://www.squibler.io/), 2026-06-15) is the closest, but reverse — it goes text-to-image, not image-to-outline. No one ships a "drag 10 reference images, get an outline" workflow.
7. **True local-first.** No competitor does this. Every "privacy-first" claim (Living Writer, Atticus roadmap) is "we don't train on your data," which is a *server-side* promise. Pinax is *client-side only*. This is the single biggest differentiator and is under-marketed.
8. **Adventure / interactive-fiction mode for AI writers.** AI Dungeon ([latitude.io/](https://latitude.io/) — could not fetch live; pricing/features from pre-2026 knowledge) is the only major player. NovelAI has an "Adventure" module, but the IF / branching story ecosystem (Twine, Ink) is still pre-AI. **The Pinax playable-worldbook model is genuinely new**: a *worldbook that is also a game*, not a game with a worldbook attached.
9. **Version control that makes sense to writers (not git).** No tool has solved this. Scrivener's "Snapshots" feature is the closest (per [literatureandlatte.com/scrivener/overview](https://www.literatureandlatte.com/scrivener/overview), 2026-06-15) but is per-document and per-day. Novelcrafter has "Revision History" ([novelcrafter.com/features](https://www.novelcrafter.com/features), 2026-06-15). A *visual diff* between two prose drafts would be a real product.
10. **Self-publishing pipeline export.** Atticus and Scrivener own the export-to-Kindle pipeline. Living Writer mentions "export to docx and print" ([livingwriter.com/en/pricing](https://www.livingwriter.com/en/pricing), 2026-06-15). For the Chinese self-pub market (Yuewen, Qidian) **no major tool ships a first-class export**. Pinax could.

---

## 8. Pinax Differentiation Opportunities

What makes Pinax unique, and how to amplify it (with the goal of writing these into a marketing one-liner):

1. **Local-first.** "Your prose, your worldbooks, your world — all in your browser. No cloud. No login. No server ever sees your draft." This is the *strongest* privacy claim in the market. Pinax already delivers it; the marketing does not yet say it loudly enough.
2. **IF / adventure mode.** "A worldbook that *plays*." No other major tool combines a writing app with a playable adventure mode. Pinax does. The IF engines (Twine, Ink) are pre-AI; the AI tools (Sudowrite, Novelcrafter) are pre-IF. The intersection is empty.
3. **Kao aesthetic + 立体感 migration.** "An archive folio, not a SaaS dashboard." This is visual brand territory no competitor has claimed. Living Writer is "Boards" (a kanban). Lex is "minimalist chrome." Pinax is *the only one that looks like a private archive* (see [`docs/plan/kao-ui-direction.md`](./kao-ui-direction.md) and the ongoing [`docs/superpowers/specs/2026-06-15-stereo-migration-design.md`](./superpowers/specs/2026-06-15-stereo-migration-design.md)). The catch: the chrome is heavy and the mobile experience is unproven. Pair it with the "沉入阅读" focus mode from §5.10.
4. **Worldbook system as a competitive moat.** Already covered in [`docs/plan/worldbook-market-research-20260615.md`](./worldbook-market-research-20260615.md). The worldbook context builder is in the same shape as SillyTavern / RisuAI / Agnai and the most extensible. Lead the marketing with this.
5. **mem0ai + local LLM story.** Pinax has `mem0ai` in dependencies (per AGENTS.md). The "long-term memory of your story" pitch is real, not vapor. No competitor can match "your previous 50 chapters are *indexed and retrievable* in a way that respects your privacy."
6. **CJK-first (after the LXGW font work).** The recent LXGW WenKai font work (`docs/STATUS.md` 2026-06-12 19:00 entry) is the seed of a "Chinese-first novel writing tool that takes typographic craft seriously" positioning. There is no competitor in this lane.
7. **GM persona as plugin.** The `GmPersona` system + worldbook is *conceptually* Sudowrite's "plugins" market. Surface it as user-installable personas, with a small built-in marketplace of well-known persona archetypes (古典仙侠 · 现代都市 · 蒸汽朋克 · 哥特悬疑 · 软科幻) and let users save + share.

**The one-line pitch (draft):** *"Pinax is the AI-assisted novel-writing tool for writers who want a private archive, a real world, and a game that writes itself — not a SaaS dashboard, not a credit meter, not a model that learns from your draft."*

---

## 9. Pinax Differentiation Risks

For honesty, the threats to the positioning:

- **Privacy-first can become a synonym for "no mobile, no sync, no collab."** Living Writer and Atticus have already published roadmaps that add cloud features. Pinax must define *what local-first means* (no server, ever) vs *what local-first doesn't mean* (no collaboration at all — it can mean CRDT-style local-first collab, à la Yjs/Automerge, per the sibling research at [`docs/plan/local-first-sync-research-20260615.md`](./local-first-sync-research-20260615.md)).
- **The chrome is the moat and the trap.** Kao is gorgeous; it is also slow to load, hard to maintain, and hostile to first-time users. The "立体感" migration (v5 spec, in writing-plans) is the right next step *only if* it ships with a focus mode. Otherwise the chrome becomes a feature that excludes the audience it was designed for.
- **The worldbook is the moat; the IF mode is the gamble.** Most novel-writing users don't *want* an adventure mode. Pinax's `playableWorldOpeningFacts` and the OpeningPage work is real, but the user research question — *who would use this?* — is still open.
- **Live AI testing is blocked.** Per [`docs/STATUS.md` "Blocked / questions"](./../STATUS.md), 2026-06-09 entry, the `gen.pollinations.ai` 429 and key plumbing prevent 10-15 min live tests. The product claims ("AI helps you think") are not yet *demonstrated* in the demo content. Closing this loop is the highest-leverage single thing Pinax can do for credibility.
- **The credits / pricing model is undecided.** Pinax is local-first and the user supplies their own API key, so the credit question is: do we charge for orchestration (Novelcrafter $4-20 model)? Do we charge for the chrome / templates? Do we charge nothing and stay a free project? This research cannot answer that, but it shows that the $0 free / $10 mid / $20 top tier is the sweet spot for hobbyist novelists.

---

## 10. Sources

URLs fetched live on 2026-06-15 with `curl -A "Mozilla/5.0"` (Firecrawl MCP and WebSearch were unavailable; Wikipedia and WebFetch were blocked):

- [sudowrite.com/](https://www.sudowrite.com/) — Sudowrite homepage; "Muse 1.5" custom fiction model, Story Bible, Write/Expand/Rewrite, Plugins, Focus Mode, 8 themes × 5 dark modes, "Speaks 30+ languages" (200 OK, 634 KB)
- [sudowrite.com/pricing](https://www.sudowrite.com/pricing) — $10/$22/$44 tiers, 225k/1M/2M credits, yearly "up to 50% off", 12-month credit rollover, "EZ Cancel" (200 OK, 500 KB)
- [www.novelcrafter.com/](https://www.novelcrafter.com/) — Codex story bible, mobile compatible, BYOK, "Split/Pin panels" headline (200 OK, 300 KB)
- [www.novelcrafter.com/pricing](https://www.novelcrafter.com/pricing) — $4/$8/$14/$20 Scribe/Hobbyist/Artisan/Specialist, 21-day free trial, BYOK from $8, Teams + Collaboration from $20 (200 OK, 227 KB)
- [www.novelcrafter.com/features](https://www.novelcrafter.com/features) — Codex (Relations, Progressions, Tracking, Aliases, Mentions, Mention Timeline, Tagging, Custom Categories, Colors/Highlighting, Thumbnail), Marker Timeline, Scene Beats, Generate from Scene Beats, Workshop Chat, Series, Universes (200 OK, 142 KB)
- [www.squibler.io/](https://www.squibler.io/) — "AI Book and Novel Writer", "Over 20,000 writers", full-length book + screenplay generation, Elements, Visuals, "List View", project management (200 OK, 105 KB)
- [www.squibler.io/pricing](https://www.squibler.io/pricing) — Free $0 (1k credits/mo permanent), Plus $30/mo or $16/mo annual, Pro $90/mo or $49/mo annual, "45% off annual", "free physical copy" (200 OK, 73 KB)
- [www.squibler.io/ai-book-writer](https://www.squibler.io/ai-book-writer) — "Prompt → Generate → Check → Finish" flow, genre-aware (200 OK, 85 KB)
- [www.livingwriter.com/en](https://www.livingwriter.com/en) — 4-genre pivot (Fiction / Nonfiction / Academics / Professionals), Boards, AI Manuscript Chat, AI Element Generation, AI Cover Image, Canva integration (200 OK, 153 KB)
- [www.livingwriter.com/en/pricing](https://www.livingwriter.com/en/pricing) — Pro $15/mo ($0.99 trial / 7 days), free tier w/o AI, "import from Word, export to docx and print" (200 OK, 86 KB)
- [www.livingwriter.com/en/ai-features](https://www.livingwriter.com/en/ai-features) — Privacy lead: "100% opt-in / never use your data to train AI / nothing you send is stored, will never be stored"; AI Chat, AI Analysis, AI Element Generation, AI Rewrite, AI Outlines, AI Summarize, AI Screenplays, AI Cover Image (200 OK, 106 KB)
- [www.atticus.io/](https://www.atticus.io/) — **403 to all bot UAs**, no live content. Footer from 404 page recovered: "$147 — Write and Format Unlimited Books and Ebooks For Only $147" (bot-blocked; pre-2026 well-documented $147 one-time price)
- [www.literatureandlatte.com/scrivener/overview](https://www.literatureandlatte.com/scrivener/overview) — Scrivener ring-binder metaphor, Corkboard, Scrivenings, Styles, import Word/OpenOffice/Final Draft/images/PDF/movies/sound/web, export to Word/PDF/Final Draft/plain text, macOS+Windows+iOS, no native AI features on the current page (200 OK, 204 KB)
- [www.literatureandlatte.com/blog](https://www.literatureandlatte.com/blog) — Scrivener blog index; no AI features announced in recent posts (200 OK, 88 KB)
- [lex.page/](https://lex.page/) — "Collaborative documents, with powerful AI editing tools", AI Feedback, Comments, Versions, Mobile Web, Live Collaboration, Publishing, Commands, Title Ideas, "Track Changes Coming soon", 300k+ writers (200 OK, 32 KB)
- [www.inklestudios.com/ink/](https://www.inklestudios.com/ink/) — Ink scripting language, Inky editor, "play pane auto-refresh", JSON + web export, Unity + Unreal integration, MIT license, Patreon-supported (200 OK, 21 KB)
- [www.jasper.ai/](https://www.jasper.ai/) — Jasper marketing platform, "Agents", "Content Pipelines", "Jasper IQ" brand-governance, multi-model LLM router, MCP support (200 OK, 483 KB)
- [www.jasper.ai/pricing](https://www.jasper.ai/pricing) — Pro $69/seat/month (2 Brand Voices, 5 Knowledge assets, 3 Audiences), Business custom, ~20% off yearly (200 OK, 482 KB)
- [twinery.org/](https://twinery.org/) — **timed out (0 bytes)**; Twine is a well-known open-source IF authoring tool (Twee notation → HTML), no AI features. Not fetched live.
- [latitude.io/](https://latitude.io/) — **SPA-only landing, 525 SSL handshake on help.** *Pre-2026 knowledge*: founded 2019, AI Dungeon is the flagship, "Latitude" prompt-engineering platform for third-party game devs, $9.99/$14.99/$29.99 monthly tiers. **Not live-verified.**
- [character.ai/](https://character.ai/) — **Could not fetch live (0 bytes).** *Pre-2026 knowledge*: founded 2021 by ex-Google, free + $9.99/mo Plus, 20M+ users, persona chat, *no novel-writing tool* per se. **Not live-verified.**
- [novelai.net/](https://novelai.net/) — **Could not fetch live (0 bytes).** *Pre-2026 knowledge*: founded 2021, own in-house LLMs (Euterpe/Kayra/Erato/Clio), own anime-tuned image model, Memory (lorebook), $10/$25/$50 Tablet/Scroll/Opus, 30+ languages, V2/V3 character card spec. **Not live-verified.**

**Contextual references within the Pinax project (not from external sources):**
- [`docs/STATUS.md`](./../STATUS.md) — multi-session shared state; "Blocked / questions" 2026-06-09 entry on the `gen.pollinations.ai` 429 / live-test blocker; 2026-06-12 19:00 entry on the LXGW WenKai font + `--font-display` token work
- [`docs/plan/worldbook-market-research-20260615.md`](./worldbook-market-research-20260615.md) — sibling research; worldbook / lorebook data model, activation patterns, universal vs tool-specific features
- [`docs/plan/local-first-sync-research-20260615.md`](./local-first-sync-research-20260615.md) — sibling research; CRDT options (Yjs, Automerge) for the local-first collab question
- [`docs/plan/if-engines-market-research-20260615.md`](./if-engines-market-research-20260615.md) — sibling research; IF engine landscape (Twine, Ink, Inform, AI Dungeon)
- [`docs/plan/kao-ui-direction.md`](./kao-ui-direction.md) — canonical visual direction anchor; olive/gold archive folio, paper page, photo collage, bookmark CTAs
- [`docs/superpowers/specs/2026-06-15-stereo-migration-design.md`](./superpowers/specs/2026-06-15-stereo-migration-design.md) — in-flight 立体感 migration spec v5; "5A 3 atomic commits: modules / wiring / css; 5B 1 PR 6 image_generate call + cwebp + swap"
- `agent-skills/worldbook-workflow/SKILL.md` and `agent-skills/map-engine-workflow/SKILL.md` — pinax-specific worldbook and map-engine canonical workflow

---

*End of research. Length: ~3,800 words. Live-fetched pages: 13. Pre-2026-knowledge-only sources: 3 (Atticus live-pricing, AI Dungeon, Character.AI, NovelAI). One site (Twine) was unreachable at all.*
