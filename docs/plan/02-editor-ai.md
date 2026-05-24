# 02 - 编辑器 AI 辅助详细规划

> 定位：类 Copilot 的写作辅助工具，核心功能是**导入笔记/小说后由 AI 自动补全或扩展**。

## 2.1 核心能力

| 功能 | 说明 | 状态 | 优先级 |
|------|------|------|--------|
| 书籍-章节管理 | 新建/删除/切换章节、自动保存 | 已实现 | - |
| 富文本编辑 | 排版、分隔线、字体设置 | 已实现 | - |
| **AI Copilot 补全** | 灰色建议，按 Tab 采纳 | **规划** | **P0** |
| **AI 世界书注入** | 续写时注入角色/地点等设定 | **规划** | **P0** |
| AI 扩展/改写 | 选中内容后扩展或改写 | 规划 | P1 |
| 多风格选择 | 文学性/网文风/简洁白描 | 规划 | P1 |
| 长文本压缩 | 智能摘要，保留重要信息 | 规划 | P2 |

## 2.2 AI Copilot 补全

### 交互设计

```
用户输入中...           灰色建议出现         按 Tab 采纳
    │                       │                    │
    ▼                       ▼                    ▼
输入框输入 ──────► AI 生成补全建议 ──────► 灰色渲染 ──────► 文本插入
                        │                       │
                        │                   继续输入
                        │                       │
                        ▼                       ▼
                   建议消失              灰色建议被拒绝
```

### 交互细节

| 场景 | 行为 |
|------|------|
| 触发 | 用户停止输入 300ms 后开始生成 |
| 展示 | 灰色文字显示在光标位置 |
| 采纳 | 按 `Tab` 键插入建议文本 |
| 拒绝 | 继续输入或按 `Esc` 键，建议消失 |
| 刷新 | 输入新内容后自动刷新建议 |
| 中断 | 生成中用户继续输入，取消之前请求 |

### 技术实现

```typescript
// CopilotState
interface CopilotState {
  isGenerating: boolean      // 是否正在生成
  suggestion: string        // 当前建议文本
  isVisible: boolean        // 是否显示
  confidence: number         // 置信度（用于决定是否显示）
}

// 生成请求
interface CopilotRequest {
  currentText: string       // 当前文本（当前章节）
  cursorPosition: number    // 光标位置
  context: {
    worldbookEntries?: WorldEntry[]  // 关联的世界书条目
    characterName?: string
    narrativeStyle?: string
  }
}

// 生成响应
interface CopilotResponse {
  suggestion: string         // 续写建议
  finishReason: 'stop' | 'length'
}
```

### 上下文窗口截取算法

Writing.vue 使用原生 `<textarea>` 而非 Tiptap/ProseMirror，Ghost Text 通过**透明文本叠加层**实现。

**截取策略：以光标为中心，上取 1500 字，下取 500 字**

```typescript
// src/composables/useCopilot.js

interface ContextWindow {
  upstream: number      // 光标前截取字数，默认 1500
  downstream: number    // 光标后截取字数，默认 500
}

function buildContextWindow(text: string, cursorPos: number, opts: ContextWindow): string {
  const { upstream = 1500, downstream = 500 } = opts

  // 向上：取 cursorPos 前 upstream 字
  const upstreamText = text.slice(Math.max(0, cursorPos - upstream), cursorPos)
  // 向下：取 cursorPos 后 downstream 字
  const downstreamText = text.slice(cursorPos, cursorPos + downstream)

  // 段落对齐：尝试以最后一个完整段落（双换行）为界截断上游
  const paragraphBoundary = upstreamText.lastIndexOf('\n\n')
  const trimmedUpstream = paragraphBoundary !== -1
    ? upstreamText.slice(paragraphBoundary + 2)
    : upstreamText

  return trimmedUpstream + downstreamText
}

function extractForCopilot(chapterContent: string, cursorPos: number): string {
  // 总字数检查：若 < 2000 字，直接返回全文
  if (chapterContent.length < 2000) {
    return chapterContent
  }
  // 以光标为中心截取
  return buildContextWindow(chapterContent, cursorPos, { upstream: 1500, downstream: 500 })
}
```

**Token 预算管理：**

| 分项 | Token 预算（约） |
|------|-----------------|
| System Prompt | ~300 |
| 世界书注入 | ~200 |
| 上游文本（1500字） | ~1000 |
| 下游文本（500字） | ~330 |
| 预留续写建议 | ~500 |
| **总计** | **~2330** |

若模型上下文为 4k，预算充足；若为 2k，则动态缩减为上游 800 + 下游 200。

### Ghost Text 渲染方案

由于 `<textarea>` 无法直接渲染叠加样式，采用**镜像层叠加层**方案：

```
┌─────────────────────────────────────┐
│ [textarea]     ← 用户输入真实文本    │
│  [ghost-overlay] ← 绝对定位灰色建议   │
│     ↓ 光标位置对齐                   │
└─────────────────────────────────────┘
```

```typescript
// GhostOverlay 实现原理
function renderGhostOverlay(suggestion: string, textareaEl: HTMLTextAreaElement) {
  // 1. 创建与 textarea 等宽等高的 div，绝对定位在其上层
  // 2. 将 textarea 的文字按原样渲染，suggestion 追加在光标位置后
  // 3. suggestion 文字设为 color: transparent + border-bottom 样式显示为灰色下划线
  // 4. 通过 getComputedStyle 获取 textarea 的字体/行高/缩进，保持完美对齐
  // 5. textarea 设置 background: transparent，背景透传给主容器
}

// 样式隔离
.ghost-suggestion {
  color: transparent;
  border-bottom: 1px dashed var(--text-muted);
  pointer-events: none;  /* 禁止鼠标拦截 */
  white-space: pre-wrap;
}
```

**光标位置同步：**

```typescript
function syncGhostPosition(textareaEl: HTMLTextAreaElement, ghostEl: HTMLElement) {
  // 创建临时 Range 获取光标的像素坐标
  const range = document.createRange()
  const sel = window.getSelection()
  range.setStart(textareaEl, textareaEl.selectionStart)
  range.setEnd(textareaEl, textareaEl.selectionStart)
  const rect = range.getBoundingClientRect()

  // 将 ghost 层对齐到该像素位置
  ghostEl.style.top = `${rect.top - textareaEl.getBoundingClientRect().top + textareaEl.scrollTop}px`
  ghostEl.style.left = `${rect.left - textareaEl.getBoundingClientRect().left}px`
}
```

### Tab 键采纳逻辑

```typescript
// 在 textarea 的 keydown 监听中处理
function onTextAreaKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab' && copilotState.isVisible) {
    e.preventDefault()
    applyGhostSuggestion()
    return
  }
  if (e.key === 'Escape') {
    dismissGhostSuggestion()
  }
}

function applyGhostSuggestion() {
  const ta = editorRef.value  // textarea ref
  const { cursorPosition } = getCursorState(ta)
  const suggestion = copilotState.suggestion

  // 将建议文本插入光标位置
  markdownContent.value =
    markdownContent.value.slice(0, cursorPosition) +
    suggestion +
    markdownContent.value.slice(cursorPosition)

  // 移动光标到插入文本之后
  nextTick(() => {
    const newPos = cursorPosition + suggestion.length
    ta.setSelectionRange(newPos, newPos)
    ta.focus()
  })

  dismissGhostSuggestion()
  onContentChange()
}
```

### 提示词架构

```python
COPILOT_SYSTEM_PROMPT = """
你是一位小说写作助手，擅长根据已有的文本内容提供自然流畅的续写。

【续写要求】
- 保持与前文一致的文风、语气、叙事视角
- 不重复已有内容，自然衔接
- 长度适中（50-200字），只提供一段续写
- 用 *动作* 格式描述动作
- 用 "对话" 格式描述对话
- 不添加额外的解释或说明

【上下文】
当前文风：{narrative_style}
当前章节：{current_chapter_name}
"""

COPILOT_USER_PROMPT = """
已有文本：
{current_text}

请续写：
"""
```

### 上下文管理

| 策略 | 说明 |
|------|------|
| 发送范围 | 当前章节内容（截取后）+ 最近 2000 字 |
| 截断方式 | 以光标为中心，上 1500 字 / 下 500 字 |
| 世界书注入 | 关联的世界书条目作为 context 注入 |
| Token 预算 | 预留 500 token 给续写建议 |

### 状态机

```
                    ┌─────────────┐
                    │   IDLE      │
                    └──────┬──────┘
                           │ 用户停止输入 300ms
                           ▼
                    ┌─────────────┐
              ┌────►│ GENERATING  │
              │     └──────┬──────┘
              │            │ 收到响应
              │            ▼
              │     ┌─────────────┐
              │     │  SUGGESTED  │◄──────┐
              │     └──────┬──────┘       │
              │            │              │ 用户继续输入
              │   按 Tab   │              │
              │            ▼              │
              │     ┌─────────────┐       │
              │     │   APPLIED   │───────┘
              │     └──────┬──────┘
              │            │ 延迟 2s 后
              │            ▼
              │     ┌─────────────┐
              └─────│    IDLE    │
                    └─────────────┘
```

## 2.3 世界书联动

### 联动方式

```
编辑器 ──关联──> 世界书
   │
   ├─► AI 续写时注入设定
   │
   ├─► 新建角色/地名时一键存入世界书
   │
   └─► 侧边栏显示世界书快速引用
```

### 关联设置

```typescript
interface EditorWorldbookLink {
  worldbookId: string
  enabled: boolean
  injectionScope: 'all' | 'character' | 'location' | 'item' | 'lore'
  autoSave: boolean   // 新建角色/地名时自动存入世界书
}
```

### 快速引用面板

```
┌─────────────────────────┐
│ 世界书引用               │
├─────────────────────────┤
│ [角色]                   │
│  · 艾伦 ( protagonist ) │
│  · 玛丽亚 ( mentor )    │
│                          │
│ [地点]                   │
│  · 埃利城                │
│  · 幽暗森林              │
└─────────────────────────┘
```

### 一键存入世界书

当用户在编辑器中新建角色或地点时：
1. 弹出确认框：「是否存入世界书？」
2. 选择存入的世界书和分组
3. 自动提取关键词（首次出现的位置）
4. 存入后其他模块可引用

## 2.4 AI 扩展/改写

### 扩展（选中内容后）

```
选中：「夜色降临」
              │
              ▼
         *暮色如同无形的绸缎，缓缓铺陈在小镇上空。*
         路灯一盏接一盏亮起，投下昏黄的光晕。
```

### 改写（选中内容后）

```
选中：「他说："我一定会回来。"」
              │
              ▼
选择风格：文学性强
              │
              ▼
他立志归来的誓言，在暮色中显得格外沉重。
*身影消失在远方的地平线上，只留下风中摇曳的野草。*
```

### 提示词

```python
EXPAND_SYSTEM_PROMPT = """
你是一位文学写作助手，擅长扩展和丰富文本。
【扩展要求】
- 保持原有核心意思
- 增加环境描写、动作描写、心理描写
- 长度扩展 2-3 倍
- 保持文风一致
"""

REWRITE_SYSTEM_PROMPT = """
你是一位文学写作助手，擅长改写文本。
【改写要求】
- {style_requirement}
- 保持原有核心意思不变
- 长度相近
- 输出改写后的文本，不添加额外说明
"""
```

## 2.5 上下文管理策略

### 分段策略

```typescript
interface ContextWindow {
  maxTokens: number         // 最大 token 数，默认 2000
  reservedTokens: number   // 预留 token，默认 500
  chunkOverlap: number     // 重叠 token，默认 200
}

// 分段逻辑
function buildContextWindow(currentText: string, cursorPosition: number) {
  // 1. 如果总长度 < maxTokens，直接发送
  // 2. 如果总长度 > maxTokens
  //    - 保留开头 500 字
  //    - 保留最近 500 字（光标前 500 字）
  //    - 中间部分根据 token 预算截断
}
```

### 世界书上下文注入

```typescript
// 构建世界书上下文
function buildWorldbookContext(worldbook: WorldBook, keywords: string[]) {
  const relevantEntries = worldbook.entries.filter(entry =>
    entry.keys.some(key => keywords.includes(key)) ||
    entry.keysSecondary.some(key => keywords.includes(key))
  )

  return relevantEntries.map(entry => ({
    name: entry.name,
    type: entry.type,
    content: entry.content.slice(0, 200)  // 限制长度
  }))
}
```

## 2.9 速记导入与 AI 续写整合

### 现有架构基础

Writing.vue 已实现 quick-notes-rail 侧边栏，核心数据流：

```
┌──────────────────────┐
│  quick-notes-rail    │  ← 固定于右侧边缘的悬浮抽屉
│  ├── quick-note-input│  ← 随手记文本区（auto-resize textarea）
│  ├── 导入按钮         │  ← 展开 dialogue-import-panel
│  ├── 保存按钮         │  ← 保存至 STORAGE_KEYS.WRITING_NOTES
│  └── 去笔记/去小说    │  ← 路由跳转
└──────────────────────┘
```

**关键已有能力（Writing.vue）：**

| 已有能力 | 实现位置 | 说明 |
|---------|---------|------|
| `extractDialogueSegments()` | Writing.vue L721 | 按 `"「「」""` 对话标记/段落分割，提取对话段 |
| `importSelectedDialogueSegments()` | Writing.vue L768 | 将选中段拼接为字符串，写入 `quickNoteDraft` |
| `dialogueImportCandidates` | Writing.vue L608 | 计算属性，实时返回当前章节的候选段 |
| `quickNoteDraft` + `persistQuickNoteDraft()` | Writing.vue L593/L703 | 草稿持久化 |
| `saveQuickNote()` | Writing.vue L823 | 将草稿保存至 `WRITING_NOTES` 存储 |

### 续写引导流程设计

**目标：** 用户从体验模块或笔记中积累素材片段，通过速记栏导入编辑器后，由 AI 将碎片素材组织为连贯的章节正文。

```
┌─────────────────────────────────────────────────────────────────┐
│                        续写引导数据流                              │
└─────────────────────────────────────────────────────────────────┘

  体验/笔记素材
       │
       ▼
  quick-notes-rail 草稿
  (多段不连续的素材文本)
       │
       ▼
  ① 用户点击「导入章节对话段」
     → extractDialogueSegments() 扫描当前章节
     → dialogueImportCandidates 展示候选段
     → 用户勾选 → importSelectedDialogueSegments() 拼接入草稿
       │
       ▼
  ② 草稿区已有素材（也可能手动录入）
       │
       ▼
  ③ 用户点击「续写引导」（新按钮）
     → 调用 useCopilot.continueFromNotes()
     → 将草稿文本作为"大纲线索"注入 system prompt
       │
       ▼
  ④ AI 生成：基于素材片段，生成连贯段落
       │
       ▼
  ⑤ 生成的正文插入当前光标位置
       │
       ▼
  ⑥ 草稿区保留（用户可继续追加素材）
```

### 提示词架构

```python
CONTINUATION_SYSTEM_PROMPT = """
你是一位小说写作助手，擅长将零散的素材片段续写成流畅连贯的正文。

【任务】
用户提供了若干素材片段（来自速记或章节中提取的对话/描写），请你基于这些素材，
生成一段连贯的正文，填补段落之间的叙事空白。

【约束】
- 保持素材中各角色的对话原意不变
- 适当补充动作、心理、环境描写，使叙事流畅
- 长度适中（200-400字），输出一段完整的段落
- 用 *动作* 格式描述动作，用 "对话" 格式描述对话
- 不添加额外解释，直接输出正文

【素材片段】
{outline_clues}

请基于以上素材，续写正文：
"""
```

### API 封装

```typescript
// src/composables/useCopilot.js

/**
 * 基于速记素材续写
 * @param {string} outlineText - 速记草稿区的全部文本（多段素材）
 * @param {object} context - 额外上下文
 * @param {string} context.chapterTitle - 当前章节标题
 * @param {string} context.narrativeStyle - 叙事风格
 * @param {number} context.cursorPosition - 光标位置（插入点）
 */
async function continueFromNotes(outlineText: string, context: {
  chapterTitle?: string
  narrativeStyle?: string
  cursorPosition: number
}): Promise<{ text: string; insertedAt: number }> {
  const systemPrompt = buildContinuationSystemPrompt({
    outlineClues: outlineText,
    narrativeStyle: context.narrativeStyle
  })

  const response = await sendChat({
    messages: [{ role: 'user', content: systemPrompt }],
    stream: false
  })

  const generatedText = parseCopilotResponse(response)

  return {
    text: generatedText,
    insertedAt: context.cursorPosition
  }
}

function buildContinuationSystemPrompt({ outlineClues, narrativeStyle }: {
  outlineClues: string
  narrativeStyle?: string
}): string {
  return `你是一位小说写作助手，擅长将零散的素材片段续写成流畅连贯的正文。

【任务】
用户提供了若干素材片段（来自速记或章节中提取的对话/描写），请你基于这些素材，
生成一段连贯的正文，填补段落之间的叙事空白。

【约束】
- 保持素材中各角色的对话原意不变
- 适当补充动作、心理、环境描写，使叙事流畅
- 长度适中（200-400字），输出一段完整的段落
- 用 *动作* 格式描述动作，用 "对话" 格式描述对话
- 不添加额外解释，直接输出正文

【素材片段】
${outlineClues}

${narrativeStyle ? `【当前文风】${narrativeStyle}` : ''}

请基于以上素材，续写正文：`
}
```

### 组件交互

| 步骤 | 操作 | 结果 |
|------|------|------|
| 1 | 用户在速记草稿区手动录入或导入对话段 | `quickNoteDraft` 积累多段素材 |
| 2 | 用户点击草稿区旁的「续写」按钮（新增） | 调用 `continueFromNotes(quickNoteDraft.value, ...)` |
| 3 | AI 返回生成的正文 | 插入 `markdownContent` 当前光标位置 |
| 4 | 草稿区内容保留 | 用户可继续追加素材或清空 |

**新增 UI 按钮位置：** quick-notes-rail 的工具栏行（与保存/导入按钮并排）

```html
<!-- Writing.vue quick-note-actions 区域新增 -->
<button class="quick-note-icon-btn" type="button"
  @click="triggerContinuationFromNotes"
  title="续写引导（AI基于素材生成正文）"
  :disabled="!quickNoteDraft.trim()">
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
      stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
</button>
```

### 与现有功能的边界

| 已有功能 | 本模块扩展点 | 说明 |
|---------|------------|------|
| `saveQuickNote()` | 不改变 | 保存动作独立存在 |
| `importSelectedDialogueSegments()` | 不改变 | 导入动作独立存在 |
| Copilot Ghost Text（2.2节） | 续写引导是 Ghost Text 的补充入口 | Ghost Text 面向实时续写；续写引导面向素材聚合扩写 |
| `continueFromNotes()` | 新增 | 接受多段素材文本，输出完整段落 |

## 2.10 存储设计

| localStorage Key | 内容 | 说明 |
|-----------------|------|------|
| `writing_books` | 书籍列表 | `[{id, name, chapters[]}]` |
| `writing_content_{bookId}` | 书籍内容 | `{name, content, updatedAt}` |
| `writing_editor_state` | 编辑器状态 | `{bookId, chapterId, cursorPosition}` |
| `writing_worldbook_link` | 世界书关联 | `{worldbookId, enabled, injectionScope}` |

## 2.11 实施任务清单

### P0 - 基础能力

| 任务 | 子任务 | 文件 |
|------|--------|------|
| Copilot 补全 UI | 灰色建议渲染（GhostOverlay）、按 Tab 采纳、Esc 拒绝 | `Writing.vue` + `useCopilot.js` |
| Copilot 生成服务 | 调用 sendChat、状态机、错误处理 | `src/composables/useCopilot.js` |
| 上下文窗口 | 以光标为中心的截取算法（上游1500/下游500） | `useCopilot.js` |
| 世界书注入 | 关联设置、关键词匹配、内容注入 | `useCopilot.js` + `useWorldBook.js` |
| 续写引导 | 基于速记素材的 continueFromNotes 流程 | `useCopilot.js` |

### P1 - 增强能力

| 任务 | 子任务 | 文件 |
|------|--------|------|
| 多风格选择 | 文学性/网文风/简洁白描 切换 | `useCopilot.js` |
| AI 扩展 | 选中内容扩展 | `src/services/textExpander.js` |
| AI 改写 | 选中内容改写 | `src/services/textRewriter.js` |
| 一键存入世界书 | 新建角色/地点时存入 | `Writing.vue` |
| 快速引用面板 | 世界书条目侧边栏 | 组件 |

### P2 - 优化能力

| 任务 | 子任务 | 文件 |
|------|--------|------|
| 长文本压缩 | 智能摘要 | `useCopilot.js` |
| 实时补全 | 流式输出，边生成边显示 | `useCopilot.js` |
| 补全历史 | 上/下箭头切换历史建议 | `useCopilot.js` |

## 2.12 验收标准

```bash
# P0 验收
- 输入一段文字后，300ms 停止输入显示灰色建议
- 按 Tab 键后，建议文本插入到光标位置
- 按 Esc 或继续输入后，建议消失
- 关联世界书后，续写内容正确注入角色/地点设定

# P1 验收
- 切换风格后，续写语气有明显差异
- 扩展功能正确扩展选中内容 2-3 倍
- 改写功能正确按风格改写
- 一键存入世界书后，可在世界书编辑器中查看

# P2 验收
- 长文本（>5000 字）情况下仍能正常续写
- 流式输出体验流畅，无明显延迟
```

---

## 相关文档

- [00-overview.md](./00-overview.md) - 项目总览
- [01-novel-experience.md](./01-novel-experience.md) - 小说体验规划
- [04-memory-system.md](./04-memory-system.md) - 记忆力系统（Copilot 为三大记忆检索流之一）
- [05-prompt-engineering.md](./05-prompt-engineering.md) - 提示词工程（Layer 2 世界书注入、Token 偏置控制）