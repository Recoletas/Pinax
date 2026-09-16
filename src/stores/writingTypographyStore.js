import { defineStore } from 'pinia'

// 写作面排版设置（P0a）：对齐作家助手 fontStyle 思路 —— 排版参数持久化到
// localStorage，改动即时生效且跨会话保留；字体选项全部保证 Windows/macOS/
// Linux 三端有合格 fallback，禁止落到系统默认宋体（见
// docs/superpowers/research/writing-ui-typography-keyboard-research-20260822.md §7-A0）。

export const LS_WRITING_TYPOGRAPHY = 'writing_typography'

// 字体选项：key → CSS font-family 栈。每条栈的 CJK 兜底都是苹方/雅黑级黑体。
export const WRITING_FONT_OPTIONS = Object.freeze([
  {
    key: 'cmd',
    label: 'Cmd 等宽',
    stack: 'Menlo, Consolas, Monaco, "Courier New", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", monospace'
  },
  {
    key: 'wenkai',
    label: '霞鹜文楷',
    stack: '"LXGW WenKai", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
  },
  {
    key: 'yahei',
    label: '微软雅黑',
    stack: '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif'
  },
  {
    key: 'system',
    label: '系统默认',
    stack: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  }
])

const FONT_KEYS = new Set(WRITING_FONT_OPTIONS.map((option) => option.key))
// 可见切片 V1：中文正文默认中文优先栈（雅黑），等宽栈只作为显式选项。
export const DEFAULT_FONT_KEY = 'yahei'
export const MIN_FONT_SIZE = 12
export const MAX_FONT_SIZE = 28
export const DEFAULT_FONT_SIZE = 17
export const VALID_LINE_HEIGHTS = [1.5, 1.7, 1.8, 1.9, 2.0, 2.2]
export const DEFAULT_LINE_HEIGHT = 1.8

function clampFontSize(value) {
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed)) return DEFAULT_FONT_SIZE
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, parsed))
}

function normalizeLineHeight(value) {
  const parsed = Number(value)
  return VALID_LINE_HEIGHTS.includes(parsed) ? parsed : DEFAULT_LINE_HEIGHT
}

function normalizeParagraphGap(value) {
  const parsed = Number(value)
  return [0.65, 1.05, 1.45].includes(parsed) ? parsed : 1.05
}

function readPersisted() {
  try {
    const raw = localStorage.getItem(LS_WRITING_TYPOGRAPHY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function normalizeWritingTypography(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const fontKey = FONT_KEYS.has(source.fontKey) ? source.fontKey : DEFAULT_FONT_KEY
  return {
    fontKey,
    fontSize: clampFontSize(source.fontSize),
    lineHeight: normalizeLineHeight(source.lineHeight),
    // 文本工作台 v3 Phase 2：“小说标准”预设的唯一排版变量。
    firstLineIndent: source.firstLineIndent === false ? false : true,
    paragraphGap: normalizeParagraphGap(source.paragraphGap),
    typewriter: Boolean(source.typewriter),
    focusParagraph: Boolean(source.focusParagraph),
    zen: Boolean(source.zen)
  }
}

export function getFontStackByKey(key) {
  const option = WRITING_FONT_OPTIONS.find((item) => item.key === key)
  return option ? option.stack : WRITING_FONT_OPTIONS[0].stack
}

export const useWritingTypographyStore = defineStore('writingTypography', {
  state: () => ({
    fontKey: DEFAULT_FONT_KEY,
    fontSize: DEFAULT_FONT_SIZE,
    lineHeight: DEFAULT_LINE_HEIGHT,
    firstLineIndent: true,
    paragraphGap: 1.05,
    // 沉浸三件套（P0c）：打字机滚动 / 段落聚焦 / 专注全屏
    typewriter: false,
    focusParagraph: false,
    zen: false,
    initialized: false
  }),
  getters: {
    fontFamily: (state) => getFontStackByKey(state.fontKey),
    fontOption: (state) => WRITING_FONT_OPTIONS.find((option) => option.key === state.fontKey) || WRITING_FONT_OPTIONS[0]
  },
  actions: {
    init() {
      if (this.initialized) return
      const persisted = normalizeWritingTypography(readPersisted())
      this.fontKey = persisted.fontKey
      this.fontSize = persisted.fontSize
      this.lineHeight = persisted.lineHeight
      this.firstLineIndent = persisted.firstLineIndent
      this.paragraphGap = persisted.paragraphGap
      this.typewriter = persisted.typewriter
      this.focusParagraph = persisted.focusParagraph
      this.zen = persisted.zen
      this.initialized = true
    },
    setFontKey(key) {
      this.init()
      if (!FONT_KEYS.has(key)) return
      this.fontKey = key
      this.persist()
    },
    // 步进式字号调节（面板 A-/A+），步长 2px，越界即夹紧。
    adjustFontSize(delta) {
      this.init()
      const direction = Number(delta) >= 0 ? 1 : -1
      this.fontSize = clampFontSize(this.fontSize + direction * 2)
      this.persist()
    },
    setFontSize(value) {
      this.init()
      this.fontSize = clampFontSize(value)
      this.persist()
    },
    setLineHeight(value) {
      this.init()
      this.lineHeight = normalizeLineHeight(value)
      this.persist()
    },
    toggleFirstLineIndent() {
      this.init()
      this.firstLineIndent = !this.firstLineIndent
      this.persist()
    },
    setParagraphGap(value) {
      this.init()
      this.paragraphGap = normalizeParagraphGap(value)
      this.persist()
    },
    toggleTypewriter() {
      this.init()
      this.typewriter = !this.typewriter
      this.persist()
    },
    toggleFocusParagraph() {
      this.init()
      this.focusParagraph = !this.focusParagraph
      this.persist()
    },
    toggleZen() {
      this.init()
      this.zen = !this.zen
      this.persist()
    },
    persist() {
      try {
        localStorage.setItem(LS_WRITING_TYPOGRAPHY, JSON.stringify({
          fontKey: this.fontKey,
          fontSize: this.fontSize,
          lineHeight: this.lineHeight,
          firstLineIndent: this.firstLineIndent,
          paragraphGap: this.paragraphGap,
          typewriter: this.typewriter,
          focusParagraph: this.focusParagraph,
          zen: this.zen
        }))
      } catch {
        // storage disabled — 内存状态仍然生效
      }
    }
  }
})
