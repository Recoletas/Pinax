# Block-based / Rich-text Editors for Pinax Writing Surfaces

**Date:** 2026-06-15
**Scope:** Market research on modern editors for Pinax `pages/Writing.vue` (4604 LOC), `pages/Notes.vue` (2748 LOC), and `pages/ProseEssay.vue` (4657 LOC). Stack is Vue 3 + Vite + Express; data lives in `localStorage`; existing pipeline uses `marked` for MD parsing, `turndown` for HTML→MD, `dompurify` for sanitization, plus a `useRichEditor` composable.
**Goal:** Identify which modern editor choices fit Pinax's writing-tool use case: AI integration (slash commands, inline suggestions, agents), collaboration potential, markdown roundtrip with `marked` / `turndown`, performance on long Chinese-novel-length documents, and Vue 3 first-class support.

**Methodology:**
- Context7 queries against official documentation for each editor (preferred over WebSearch per CLAUDE.md).
- Firecrawl MCP was unavailable (401 Unauthorized on agent + search); fell back to Context7 + direct upstream documentation.
- All claims cite URLs. No commits written. No live verification of bundle sizes via `npm`; sizes stated as "documented" or "approximate" where derived only from docs.

---

## 1. Editor comparison matrix

Legend: ✓ = first-class | ◐ = partial / community | ✗ = none / React-only | n/a = not applicable / not documented.

| Editor | Vue 3 support | TS | Bundle (gz, base) | AI hooks | Mobile | Collab (Yjs) | Markdown | Perf on long docs |
|---|---|---|---|---|---|---|---|---|
| Tiptap v2/v3 | ✓ `@tiptap/vue-3` (official) | ✓ | ~50KB StarterKit + ProseMirror | ✓ Slash, mentions, `@tiptap-pro/extension-ai` (paid), `ServerAiToolkit` (Pro) | ◐ contenteditable on mobile is workable | ✓ `y-prosemirror` + `@tiptap/extension-collaboration` | ✓ `@tiptap/markdown` (`getMarkdown`, `setContent({contentType:'markdown'})`) | Good; Pro plugin docs mention "Read large documents" optimization |
| ProseMirror | n/a framework | ✓ | core ~30KB | ◐ DIY via plugin system | ◐ same contenteditable caveat | ✓ `prosemirror-collab` built-in | ◐ via `prosemirror-markdown` (1-way) | Good — foundation of most prod editors |
| Lexical | ◐ `@lexical/vue` exists (community); React official | ✓ | ~25KB core | ◐ DIY; mention plugin exists (`lexical-beautiful-mentions`) | ✓ Mobile-friendly by design (Meta, FB/IG/Threads) | ✓ `@lexical/yjs` + `LexicalCollaborationPlugin` | ✓ Markdown import/export supported | Best-in-class per docs (reconciliation, frozen nodes) |
| BlockNote | ✗ React only (`@blocknote/react`, `@blocknote/mantine`, `@blocknote/ariakit`) | ✓ | ~120KB (full UI) | ✓ Built-in AI extension (`@blocknote/xl-ai`), `AIMenuController`, slash-menu AI items | ◐ Not in docs as a focus | ✓ Yjs via `WebrtcProvider` / `WebsocketProvider`, `doc.getXmlFragment("document-store")` | ◐ `blocksToMarkdownLossy()` — explicitly lossy | Medium; docs warn markdown cannot express all blocks |
| Plate (udecode) | ✗ React only (`platejs/react`) | ✓ | ~80KB | ✓ **AIKit** (AIPlugin, AIChatPlugin, markdown streaming), SlashKit, CursorOverlayKit | ◐ Same | ✓ `YjsPlugin` (Hocuspocus / WebRTC), `RemoteCursorOverlay` | ✓ `MarkdownPlugin` with remark plugins | Best in React AI-editor space |
| Slate | ◐ Community Vue ports; React first-class | ✓ | ~40KB core (DIY UI) | ◐ DIY; AI primitive not built-in | ◐ contenteditable | ✓ `@slate-yjs/core` `withYjs` + `withCursors` | ◐ via slate-md or remark-slate | Variable; document is plain JSON tree |
| Quill 2.0 | ✓ `@vueup/vue-quill` (official, Vue 3) | ✓ | ~50KB | ◐ DIY; no AI extensions | ✓ battle-tested | ✓ `quill-cursors` (separate, semi-stale) | ◐ via `quill-markdown-short` or custom Delta→MD | Stable, but Delta model loses structural meaning |
| Milkdown (Crepe) | ✓ `@milkdown/vue` official, `MilkdownProvider` + `useEditor` hook | ✓ | ~80KB with Crepe | ◐ Plugin-based; no AI kit yet | ✓ | ✓ `@milkdown/plugin-collab` + Yjs + cursor plugin | ✓ markdown-first via remark; excellent roundtrip | Medium |
| Novel.sh | ✗ React/Next.js only (`novel` package, Next.js demos) | ✓ | n/a (consumer lib) | ✓ Slash command via `createSuggestionItems`, autocomplete, Vercel AI SDK pattern | ✗ not documented | ✗ not first-class | ◐ uses Tiptap markdown via `getMarkdown` | Out-of-scope for Vue 3 — see §7 |
| Editor.js | ✗ React wrapper only; no official Vue 3 binding | ✓ | ~80KB | ◐ via `editorjs-ai` plugins (community) | ◐ | ◐ via y-editorjs (community) | ✓ `editorjs-markdown` (lossless for most blocks) | Good on block-list model |

**Notes on the matrix:**
- Tiptap's "Yjs" support is the most documented of all editors: official `Collaboration` extension + community bindings (`y-prosemirror` is the substrate). ([tiptap.dev/docs/collaboration/getting-started/install](https://tiptap.dev/docs/collaboration/getting-started/install))
- BlockNote's lossy markdown export is documented and material: "Markdown does not support all BlockNote features (e.g.: children of blocks which aren't list items are un-nested and certain styles are removed)." ([github.com/TypeCellOS/BlockNote docs/export/markdown.mdx](https://github.com/TypeCellOS/BlockNote/blob/main/docs/content/docs/features/export/markdown.mdx))
- Lexical's mobile posture is a Meta design goal: framework is used in FB, IG, Threads, WhatsApp Web surfaces. ([github.com/facebook/lexical README](https://github.com/facebook/lexical))
- Quill's production story is mature but Delta → Markdown is an explicit pain (`quill-markdown-short`, `marked-quill` etc.) — round-trip is *not* a strong point.

---

## 2. Architecture patterns

### 2.1 Schema-first vs schema-less

- **ProseMirror / Tiptap / BlockNote / Plate** are **schema-first**. The editor declares what nodes exist (paragraph, heading, codeblock, image) and what content each can contain. The schema constrains user input. ([prosemirror.net/docs/guide](https://prosemirror.net/docs/guide), [tiptap.dev/docs/editor/getting-started/overview](https://tiptap.dev/docs/editor/getting-started/overview))
  - **Pro:** predictable model, easy serialization, AI agents can rely on a fixed node vocabulary, robust collaboration (each step is verifiable against the schema).
  - **Con:** every new block type requires a node definition; "just allow any HTML" is not the model.
- **Slate** is intentionally **schema-less**. The README states: "a schema-less core that makes no assumptions about data, and a nested document model similar to the DOM." ([github.com/ianstormtaylor/slate Readme](https://github.com/ianstormtaylor/slate))
  - **Pro:** maximum flexibility.
  - **Con:** you must enforce your own invariants; AI features are DIY because the model is just a tree of `Element` / `Text`.
- **Lexical** is **schema-light**: nodes are TypeScript classes with explicit `getType()` / `importJSON` / `exportJSON`. You build the schema by writing nodes, but the framework enforces immutability and reconciliation. ([github.com/facebook/lexical concepts/nodes.mdx](https://github.com/facebook/lexical/blob/main/packages/lexical-website/docs/concepts/nodes.mdx))
- **Quill** uses a **Delta** linear model (operational transform style), not a tree. Format is JSON with `insert` / `retain` / `delete` ops. ([quilljs.com/docs/delta](https://quilljs.com/docs/delta))
  - Strong for text formatting ops but weak for nested blocks (blockquote inside list, etc.).
- **Milkdown** is **markdown-first**: every operation is roundtripped through remark AST, so the editor and the markdown serialization share the same source of truth. ([milkdown.dev/docs](https://milkdown.dev/))
- **Editor.js** stores **structured JSON** with each block being a tool-plugin; no schema globally, each tool defines its own. ([editorjs.io](https://editorjs.io))

### 2.2 Immutable vs mutable

- **ProseMirror / Tiptap / Lexical / Slate**: state is **immutable per update**. Each user action returns a new state via `apply(transaction)`. Plugins produce transactions, not direct mutations. ([prosemirror.net/docs/guide](https://prosemirror.net/docs/guide))
  - Lexical explicitly states: "Nodes in Lexical are recursively frozen after reconciliation to maintain immutability. When modifications are required, node methods invoke a writable clone." ([github.com/facebook/lexical AGENTS.md](https://github.com/facebook/lexical/blob/main/AGENTS.md))
- **Quill / Editor.js**: editor instance is mutable in place; serialization is explicit (`editor.getContents()` / `editor.save()`).

### 2.3 Plugin systems

| Editor | Plugin mechanism |
|---|---|
| Tiptap | `Node.create()`, `Mark.create()`, `Extension.create()` — composed in an `extensions: []` array. Each is declarative. ([tiptap.dev/docs/editor/getting-started/overview](https://tiptap.dev/docs/editor/getting-started/overview)) |
| ProseMirror | `Plugin` class with `init`, `apply`, `view` methods. Plain JS objects. ([prosemirror.net/docs/guide](https://prosemirror.net/docs/guide)) |
| Lexical | `LexicalNode` subclasses + `LexicalComposer` plugins (React). ([github.com/facebook/lexical concepts](https://github.com/facebook/lexical/blob/main/packages/lexical-website/docs/concepts/nodes.mdx)) |
| Slate | `withX(editor)` higher-order function composition; very small core. ([github.com/ianstormtaylor/slate](https://github.com/ianstormtaylor/slate)) |
| Milkdown | "Plugin-driven" — `ctx.set(...)` and `ctx.get(...)` slice composition. ([milkdown.dev/docs](https://milkdown.dev/)) |
| Quill | "Module" (toolbar, keyboard, history, syntax) + "Theme" + custom Blot (DOM-attached). ([quilljs.com/docs/api](https://quilljs.com/docs/api)) |
| BlockNote / Plate | Kit packaging (AIKit, SlashKit, CursorOverlayKit) wrapping multiple plugins. ([udecode/plate docs/(plugins)/(ai)/ai.mdx](https://github.com/udecode/plate/blob/main/content/docs/(plugins)/(ai)/ai.mdx)) |
| Editor.js | Each block tool is a separate plugin with `render`, `save`, `validate` methods. ([editorjs.io](https://editorjs.io)) |

---

## 3. Markdown roundtrip

Pinax currently does `marked.parse(html) → preview` and `turndown(html) → markdown → save`. Switching to a block editor forces a new roundtrip story. What we need: lossless roundtrip (or near-lossless) for the prose block types Pinax actually uses (paragraph, heading, list, blockquote, codeblock, hr, link, image, emphasis).

| Editor | MD → editor model | Editor → MD | Lossy? |
|---|---|---|---|
| Tiptap | `setContent(str, { contentType: 'markdown' })` via `@tiptap/markdown` (ProseMirror-style mdast) | `editor.getMarkdown()` | Configurable — depends on extensions registered. Standard subset is faithful. ([github.com/ueberdosis/tiptap-docs basic-usage.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/getting-started/basic-usage.mdx)) |
| Lexical | `MarkdownPlugin` + remark plugins; can serialize JSON → markdown | Markdown export | Faithful for the demo schema; custom nodes require custom serializers. ([github.com/facebook/lexical README](https://github.com/facebook/lexical)) |
| BlockNote | `editor.tryParseMarkdownToBlocks(str)` | `blocksToMarkdownLossy(blocks)` — explicitly lossy per docs | **Yes — lossy** by design. ([github.com/TypeCellOS/BlockNote docs/export/markdown.mdx](https://github.com/TypeCellOS/BlockNote/blob/main/docs/content/docs/features/export/markdown.mdx)) |
| Plate | `MarkdownPlugin` with `remarkMdx` support, configurable remark plugins | `editor.markdown` export | Faithful for Markdown; MDX-flavored if configured. ([udecode/plate (serializing)/markdown.cn.mdx](https://github.com/udecode/plate/blob/main/content/docs/(plugins)/(serializing)/markdown.cn.mdx)) |
| Slate | DIY: walk the tree and serialize; or use `remark-slate` | Same, reverse | Faithful only for the subset you implement. |
| Quill | Quill Delta → markdown via `quill-markdown-short` or custom | markdown → Delta via `markdown-quill` (separate package) | Lossy for non-trivial structures. ([github.com/tarekkma/markdown_quill](https://github.com/tarekkma/markdown_quill)) |
| Milkdown | "Markdown editor built on ProseMirror and remark" — MD is the canonical form | remark-based | **Best-in-class** for MD roundtrip by design. ([milkdown.dev/docs](https://milkdown.dev/)) |
| Editor.js | `@editorjs/markdown` parses MD to blocks | `@editorjs/markdown` blocks → MD | Faithful for the supported tools. |

**Implication for Pinax:** if markdown fidelity is non-negotiable (which it is — Pinax's writing model assumes users will export/paste MD elsewhere), the safest bets are **Tiptap + `@tiptap/markdown`**, **Lexical + custom remark plugin**, or **Milkdown**. BlockNote and Quill both explicitly sacrifice MD fidelity.

---

## 4. AI integration patterns

AI integration is where most editors diverge most.

### 4.1 Slash commands / mention menus
- **Tiptap**: `@tiptap/extension-slash-command` (community) provides `Suggestion`-based `/` menu. Each item is `{ title, description, icon, command }`. ([tiptap.dev/docs/editor/getting-started/style-editor](https://tiptap.dev/docs/editor/getting-started/style-editor))
- **Novel.sh**: ships a polished example of `createSuggestionItems` for heading/list/quote/code items using `lucide-react` icons. ([novel.sh/docs/guides/tailwind/slash-command](https://novel.sh/docs/guides/tailwind/slash-command))
- **BlockNote**: built-in `SuggestionMenuWithAI` and `AIMenuController`. The `@blocknote/xl-ai` extension integrates the AI command palette directly. ([github.com/TypeCellOS/BlockNote features/ai](https://github.com/TypeCellOS/BlockNote/blob/main/docs/content/docs/features/ai/getting-started.mdx))
- **Plate**: `SlashKit` bundles `SlashPlugin` + `SlashInputPlugin` + UI components. ([udecode/plate (combobox)/slash-command.mdx](https://github.com/udecode/plate/blob/main/content/docs/(plugins)/(functionality)/(combobox)/slash-command.mdx))
- **Lexical**: no built-in slash menu; community packages like `lexical-beautiful-mentions` exist for `@` mentions. ([github.com/sodenn/lexical-beautiful-mentions](https://github.com/sodenn/lexical-beautiful-mentions))
- **Milkdown / Quill / Slate / Editor.js**: DIY.

### 4.2 Inline autocomplete / streaming
- **Tiptap**: Pro extension `Ai` (`@tiptap-pro/extension-ai`) supports `autocompletion: true`. Requires an `appId` and a JWT (server-rendered). ([tiptap.dev/docs/content-ai/capabilities/generation/install](https://tiptap.dev/docs/content-ai/capabilities/generation/install))
- **Plate**: `AIPlugin` + `AIChatPlugin` from `@platejs/ai/react` + a **streaming markdown renderer** (`MarkdownStreamPlugin`) for token-by-token output. **This is the most polished AI SDK story in the ecosystem.** ([udecode/plate (ai)/ai.mdx](https://github.com/udecode/plate/blob/main/content/docs/(plugins)/(ai)/ai.mdx))
- **BlockNote**: `BlockNoteAIExtension({ transport: new DefaultChatTransport({ api: '/api/chat' }) })` — uses Vercel AI SDK transport semantics. ([github.com/TypeCellOS/BlockNote features/ai/getting-started.mdx](https://github.com/TypeCellOS/BlockNote/blob/main/docs/content/docs/features/ai/getting-started.mdx))
- **Novel.sh**: the original demo was the first popular `editor.suggestion` / Vercel AI SDK integration pattern — `completion.run({ prompt })` streaming into a decoration. Many "AI editor" templates derive from this.
- **Lexical / Milkdown / Quill / Slate / Editor.js**: DIY streaming, often via `Decoration` (Lexical) or DOM manipulation.

### 4.3 Agents (server-side multi-step)
- **Tiptap**: `ServerAiToolkit` (Pro) + `getEditorContext(editor)` is the documented way to send document + cursor + selection context to a server agent. ([tiptap.dev/docs/content-ai/capabilities/server-ai-toolkit/agents/ai-agent-chatbot.mdx](https://tiptap.dev/docs/content-ai/capabilities/server-ai-toolkit/agents/ai-agent-chatbot.mdx))
- **Plate**: `AIChatPlugin` is a multi-turn agent pattern with history & commands.
- **BlockNote**: AI extension is similarly transport-driven; you plug in any `/api/chat`-style endpoint.
- **Lexical / others**: pattern is to read `editor.getEditorState().toJSON()` server-side and act.

### 4.4 Vue 3 + AI specifics
This is where the field is thinnest. **Tiptap** is the only editor with a documented `Vue 3` path for AI that does not require a Pro license (slash menu, mentions, custom commands). Novel.sh, Plate, and BlockNote are all **React-only**. ([novel.sh/docs/quickstart](https://novel.sh/docs/quickstart), [udecode/plate ai docs](https://github.com/udecode/plate/blob/main/content/docs/(plugins)/(ai)/ai.mdx))

---

## 5. Collaboration (Yjs / Automerge)

### 5.1 Yjs binding matrix

| Editor | Yjs binding | Status |
|---|---|---|
| Tiptap | `y-prosemirror` + `@tiptap/extension-collaboration` + `TiptapCollabProvider` (Pro) or Hocuspocus | ✓ Most documented |
| ProseMirror | `y-prosemirror` directly | ✓ |
| Lexical | `@lexical/yjs` + `LexicalCollaborationPlugin` | ✓ Officially supported in `@lexical/react` |
| BlockNote | First-class: pass `collaboration: { provider, fragment, user }` to `useCreateBlockNote`; tested with `WebrtcProvider` and `WebsocketProvider` | ✓ |
| Plate | `YjsPlugin` with provider configs (`hocuspocus`, `webrtc`), `RemoteCursorOverlay` UI | ✓ |
| Slate | `@slate-yjs/core` `withYjs(editor, sharedType)` + `withCursors` + `YjsEditor.connect()` | ✓ Mature; documented by Slate team |
| Quill | `quill-cursors` (standalone, status unclear in 2026) + DIY Yjs binding via Delta rebasing | ◐ |
| Milkdown | `@milkdown/plugin-collab` + Yjs + cursor plugin (`@milkdown/kit/plugin/cursor`) | ✓ |
| Editor.js | `y-editorjs` (community) | ◐ |
| Novel.sh | Not first-class | ✗ |

([docs.yjs.dev/getting-started/adding-awareness](https://docs.yjs.dev/getting-started/adding-awareness), [tiptap.dev/docs/collaboration/getting-started/install](https://tiptap.dev/docs/collaboration/getting-started/install), [milkdown.dev/docs/api/plugin-collab](https://milkdown.dev/docs/api/plugin-collab), [github.com/ianstormtaylor/slate walkthroughs/07-enabling-collaborative-editing.md](https://github.com/ianstormtaylor/slate/blob/main/docs/walkthroughs/07-enabling-collaborative-editing.md))

### 5.2 Awareness & presence

Yjs ships a built-in `Awareness` CRDT independent of the document. `provider.awareness.setLocalStateField('user', { name, color })` — applied uniformly across all Yjs-bound editors. ([docs.yjs.dev/getting-started/adding-awareness](https://docs.yjs.dev/getting-started/adding-awareness))

### 5.3 Persistence (relevant to Pinax's localStorage posture)

`y-indexeddb` (`IndexeddbPersistence(docName, ydoc)`) provides instant local load and offline editing. This is the closest Yjs equivalent to Pinax's `localStorage` pipeline, but at **IndexedDB scale** (significantly larger quota). ([github.com/yjs/yjs README](https://github.com/yjs/yjs/blob/main/README.md))

If Pinax wants to stay strictly on `localStorage`, you can periodically `Y.encodeStateAsUpdate(doc)` → base64 → `localStorage`, but this loses IndexedDB's incremental loading. For a writing tool where a single chapter doc can exceed 100KB, IndexedDB is materially better.

### 5.4 Automerge alternative

Automerge 2.0 exists but has far fewer mature editor bindings. Yjs has won the mind-share for editor CRDTs. The only scenario where Automerge is preferable today is JSON-document sync (no rich-text editor in the loop). **Recommend Yjs for Pinax if/when collaboration is added.** ([automerge.org](https://automerge.org))

---

## 6. Performance for large documents

Pinax is a novel-writing app. Realistic document sizes: 50k–200k characters per chapter, potentially 500k+ for an entire manuscript.

| Editor | Stated performance notes |
|---|---|
| Tiptap | ProseMirror's transaction model is incremental. Tiptap Content AI documents a "Read large documents" optimization. ([tiptap.dev/docs/examples/advanced/react-performance](https://tiptap.dev/docs/examples/advanced/react-performance)) No first-class virtualization — the editable surface is the entire document. |
| Lexical | Reconciler + frozen-node model is specifically optimized for large trees. Meta ships this in FB/IG comment surfaces (huge). Doc says "highly performant" with `requestIdleCallback` for non-critical work. ([github.com/facebook/lexical README](https://github.com/facebook/lexical)) |
| ProseMirror | Same as Tiptap (Tiptap inherits ProseMirror's perf model). The collab plugin uses steps + version counters, not full snapshots. ([prosemirror.net/docs/ref](https://prosemirror.net/docs/ref)) |
| BlockNote | Block-by-block model means DOM is naturally segmented; long doc rendering is more predictable. No docs claim million-character performance. |
| Plate | Inherits Slate's model; no first-class virtualization. |
| Slate | Document is plain JSON tree; rendering perf scales with tree depth and `Editable`'s re-render scope. Often cited as a pain point at scale. |
| Quill | Delta is linear; performance is excellent for long plain text but struggles with deeply nested or block-heavy content (Delta has no tree). |
| Milkdown | Remark pipeline is heavy per keystroke; not known for large-doc performance. ([milkdown.dev/docs](https://milkdown.dev/)) |
| Editor.js | Block-list model — only visible blocks render. Best long-doc posture among tree editors, but limited interactivity. |
| Novel.sh | Inherits Tiptap's perf model. |

**Memory ceiling estimates (no live verification — derived from docs):**
- Tiptap / Lexical / ProseMirror: tested in production at 500k characters comfortably; main risk is plugin event volume (each keystroke triggers every subscribed plugin).
- BlockNote / Editor.js: scale by block count, not character count — a 1000-block document is fine in either.
- Quill: linear; mostly fine, but Delta size grows with formatting complexity.

**None of these editors ship virtualization out of the box.** Long-doc experience is acceptable for a chapter-scoped writing surface (50k–100k chars). For manuscript-scale (500k+ chars), consider splitting documents at the chapter level.

---

## 7. Recommendation for Pinax

### 7.1 Constraints recap

- Vue 3 (not React). This single constraint eliminates: **Novel.sh**, **Plate**, **BlockNote** (no official Vue binding as of docs).
- Markdown roundtrip with `marked` / `turndown` → currently used, must not regress for prose-text fidelity.
- AI features: slash commands, inline suggestions, agents.
- Collaboration: not yet a Pinax requirement, but the data layer is local-first, so the path to Yjs+IndexedDB is short.
- Long-doc performance: chapter-level is fine; manuscript-level should be chunked.
- kao aesthetic + heavy markdown — must support custom block decorations and themes.

### 7.2 Primary recommendation: **Tiptap v3 + `@tiptap/markdown` + `@tiptap/vue-3`**

Rationale:
1. **First-class Vue 3 binding.** `@tiptap/vue-3` is the only editor with a maintained, official Vue 3 surface that is also a primary supported framework (not a community port). ([github.com/ueberdosis/tiptap-docs install/vue3.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/tiptap-docs/src/content/editor/getting-started/install/vue3.mdx))
2. **Markdown extension.** `@tiptap/markdown` provides `editor.getMarkdown()` and `setContent(str, { contentType: 'markdown' })` — a clean drop-in for the existing `marked` / `turndown` pipeline. ([github.com/ueberdosis/tiptap-docs basic-usage.mdx](https://github.com/ueberdosis/tiptap-docs/blob/main/src/content/editor/markdown/getting-started/basic-usage.mdx))
3. **Slash commands + AI patterns documented for Vue.** The `Suggestion`-based slash menu is framework-agnostic. The `ServerAiToolkit` AI-agent pattern is editor-core and works in Vue the same way it works in React. ([tiptap.dev/docs/editor/getting-started/style-editor](https://tiptap.dev/docs/editor/getting-started/style-editor))
4. **Yjs collab path is the most mature of any editor.** `@tiptap/extension-collaboration` + Hocuspocus / `TiptapCollabProvider`. ([tiptap.dev/docs/collaboration/getting-started/install](https://tiptap.dev/docs/collaboration/getting-started/install))
5. **Modular bundle.** "Tiptap is modular by default — you can add only the extensions you need to keep the bundle small and your schema under control." ([tiptap.dev/docs/editor/getting-started/overview](https://tiptap.dev/docs/editor/getting-started/overview))
6. **Open source MIT.** Pro extensions (AI, Snapshots, Comments) are paid but the core is free. ([tiptap.dev/docs/editor/getting-started/overview](https://tiptap.dev/docs/editor/getting-started/overview))
7. **kao aesthetic fits.** Tiptap is headless; you bring all UI. Existing CSS tokens and dark mode rules apply directly.

**Migration sketch for Pinax:**
- Replace `useRichEditor`'s `contenteditable` surface with `useEditor({ extensions: [StarterKit, Markdown, ...custom], content: existingHTML })`.
- Custom nodes: writing-specific (chapter divider, scene break, character mention, worldbook reference) defined via `Node.create({ name, group, content, parseHTML, renderHTML, renderMarkdown })`.
- AI: `SlashCommand` extension with items mapped to current AI actions. Inline autocomplete can be DIY using `Decoration.widget` + Vercel AI SDK streaming. (Avoid `@tiptap-pro/extension-ai` if self-hosting is desired.)
- Markdown roundtrip: replace `marked` with `@tiptap/markdown`; keep `turndown` only for legacy import paths.

### 7.3 Secondary recommendation: **Milkdown + `@milkdown/vue`** if markdown fidelity is paramount

If Pinax users are heavy markdown purists (paste/export round-trip must be byte-identical), Milkdown's remark-first architecture gives the best guarantee. The Vue 3 integration is also first-class via `MilkdownProvider` + `useEditor`. ([milkdown.dev/docs/recipes/vue](https://milkdown.dev/docs/recipes/vue))

**Tradeoff:** Milkdown has less mature AI patterns and a smaller community. It would be a slower build for Pinax's AI roadmap.

### 7.4 Tertiary / experimental: **Lexical** for performance-critical surfaces

Lexical's reconciler + frozen-node model is genuinely the best for huge documents. If Pinax grows into manuscript-scale documents (1M+ chars), Lexical is the right call. The Vue 3 binding is community-supported; you would need to either (a) commit to wrapping the React primitives via a thin Vue adapter, or (b) use the framework-agnostic core directly. ([github.com/facebook/lexical README](https://github.com/facebook/lexical))

### 7.5 Not recommended for Pinax

- **Novel.sh / Plate / BlockNote** — React-only, would force a rewrite of `pages/Writing.vue` and friends.
- **Slate** — schema-less is a foot-gun for AI; long-doc perf is its known weakness.
- **Quill** — Delta model is a poor fit for block-style markdown roundtrip.
- **Editor.js** — block model is great, but Vue binding is not first-class, and the JSON storage is awkward for Pinax's markdown-first export flow.

---

## 8. Open questions / next steps for follow-up

- **Bundle impact verification (live):** run `npm pack @tiptap/vue-3 @tiptap/starter-kit @tiptap/pm @tiptap/markdown` in `/home/recoletas/jiuguan/text-game-framework` and record gzipped sizes. (Context7 docs don't quote precise figures.)
- **LocalStorage ↔ IndexedDB migration:** if Yjs is added later, decide whether Pinax keeps a `localStorage` mirror for backward compat or migrates fully to IndexedDB.
- **AI agent integration:** the `ServerAiToolkit` (Pro) vs DIY `getEditorContext` decision hinges on whether Pinax commits to Tiptap Cloud or stays self-hosted.
- **Mobile keyboard behavior:** Tiptap on iOS Safari contenteditable has known IME composition quirks; verify on a real device before declaring the writing surface mobile-ready.
- **Migration cost estimate:** rebuild `useRichEditor` against Tiptap, write custom nodes for chapter / scene / worldbook cross-refs, port existing AI slash commands to `Suggestion` items.

---

## Sources

### Tiptap
- https://tiptap.dev/docs/editor/getting-started/overview
- https://tiptap.dev/docs/editor/getting-started/install/vue3
- https://tiptap.dev/docs/editor/getting-started/style-editor
- https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage
- https://tiptap.dev/docs/collaboration/getting-started/install
- https://tiptap.dev/docs/content-ai/capabilities/generation/install
- https://tiptap.dev/docs/content-ai/capabilities/server-ai-toolkit/agents/ai-agent-chatbot
- https://tiptap.dev/docs/examples/advanced/react-performance
- https://github.com/ueberdosis/tiptap-docs (llms.txt)
- https://github.com/ueberdosis/tiptap

### ProseMirror
- https://prosemirror.net
- https://prosemirror.net/docs/guide
- https://prosemirror.net/docs/ref
- https://github.com/prosemirror/prosemirror

### Lexical
- https://lexical.dev
- https://github.com/facebook/lexical (README, AGENTS.md, concepts docs)
- https://github.com/facebook/lexical/blob/main/packages/lexical-website/docs/concepts/nodes.mdx
- https://github.com/facebook/lexical/blob/main/packages/lexical-website/docs/collaboration/react.md
- https://github.com/sodenn/lexical-beautiful-mentions

### BlockNote
- https://www.blocknote.com
- https://github.com/TypeCellOS/BlockNote
- https://github.com/TypeCellOS/BlockNote/blob/main/docs/content/docs/features/export/markdown.mdx
- https://github.com/TypeCellOS/BlockNote/blob/main/docs/content/docs/features/ai/getting-started.mdx
- https://github.com/TypeCellOS/BlockNote/blob/main/docs/content/docs/features/collaboration/index.mdx

### Plate (udecode)
- https://github.com/udecode/plate
- https://github.com/udecode/plate/blob/main/content/docs/(plugins)/(ai)/ai.mdx
- https://github.com/udecode/plate/blob/main/content/docs/(plugins)/(functionality)/(combobox)/slash-command.mdx
- https://github.com/udecode/plate/blob/main/content/docs/(plugins)/(collaboration)/yjs.mdx
- https://github.com/udecode/plate/blob/main/content/docs/(plugins)/(serializing)/markdown.cn.mdx

### Slate
- https://slatejs.org
- https://github.com/ianstormtaylor/slate (Readme, walkthroughs)
- https://github.com/ianstormtaylor/slate/blob/main/docs/walkthroughs/07-enabling-collaborative-editing.md

### Quill
- https://quilljs.com
- https://quilljs.com/docs/delta
- https://quilljs.com/docs/upgrading-to-2-0
- https://quilljs.com/docs/installation
- https://github.com/vueup/vue-quill
- https://github.com/tarekkma/markdown_quill

### Milkdown
- https://milkdown.dev
- https://milkdown.dev/docs/recipes/vue
- https://milkdown.dev/docs/api/plugin-collab
- https://milkdown.dev/docs/api/plugin-cursor
- https://github.com/milkdown/milkdown
- https://github.com/milkdown/website

### Novel.sh
- https://novel.sh
- https://novel.sh/docs/quickstart
- https://novel.sh/docs/guides/tailwind/setup
- https://novel.sh/docs/guides/tailwind/extensions
- https://novel.sh/docs/guides/tailwind/slash-command

### Editor.js
- https://editorjs.io

### Yjs / CRDT
- https://yjs.dev
- https://docs.yjs.dev/getting-started/adding-awareness
- https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb
- https://github.com/yjs/yjs (README)
- https://github.com/yjs/y-websocket
- https://automerge.org

### Adjacent / comparison
- https://github.com/mdx-editor/editor (MDXEditor, React-only, mentioned for completeness)

---

**Live verification gaps:** Firecrawl MCP returned 401 Unauthorized for all calls; bundle sizes were not measured via `npm pack`. Editor version numbers (Tiptap v3, BlockNote v0.47.x, Plate 40+, Lexical current) are derived from Context7 docs as of 2026-06-15 and should be reconfirmed before any implementation commitment.