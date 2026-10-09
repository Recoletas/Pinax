// kit 短剧流剧本格式「行级轻识别」（W1-B 文档阅读器 v1，§5-3 裁定：轻样式先行）：
// 格式 canonical 在 kit（script-forge.md 正常剧本格式 / scene-breakdown.md 逐分镜格式），
// 本模块只做正则行级识别 + 尽力分类，绝不抛错——未识别行一律原样 plain，
// 不做完整结构化解析器（避免在 Pinax 冻结 kit 格式的第二套解析）。
//
// 识别目标（逐字对应 kit 格式块）：
// - `## 第N集《集名》`        → episodeHeading 大节标题
// - `第X集 · 分镜 N`          → breakdownHeading 分镜小节标题
// - `场景：地点 · 时间 · 内`  → sceneHead 场景头
// - `△ 动作`                  → action 动作行
// - `角色（情绪提示）：台词`   → dialogue 对白（缩进）
// - `卡点：代价——…｜钩——…`  → hook 卡点高亮
// - `[旁白：…]`               → narration 弱化
// - `行动：/台词：/备注：`     → breakdownField 分镜字段
// 纯函数、零依赖、不发任何请求（node 冒烟可直接 import）。

export const SCRIPT_LINE_KINDS = Object.freeze([
  'blank', 'mdHeading', 'quote', 'episodeHeading', 'breakdownHeading',
  'sceneHead', 'action', 'dialogue', 'hook', 'narration', 'breakdownField', 'plain'
])

const EPISODE_HEADING_RE = /^##\s*第[0-9一二三四五六七八九十百千零两]+集/
const MD_HEADING_RE = /^(#{1,6})\s+(.*)$/
const BREAKDOWN_HEADING_RE = /^第[0-9一二三四五六七八九十百千零两Xx]+集\s*[·•・]\s*分镜\s*\S+/
const SCENE_HEAD_RE = /^场景[:：]/
const ACTION_RE = /^△/
const NARRATION_RE = /^\[旁白[:：].*\]\s*$/
const HOOK_RE = /^卡点[:：]/
const BREAKDOWN_FIELD_RE = /^(行动|台词|备注|承接)[:：]/
// 台词形态一：角色（情绪提示）：台词
const DIALOGUE_PAREN_RE = /^([^:：\s][^:：()（）]{0,24})[（(]([^()）]{0,40})[)）][:：](.*)$/
// 台词形态二（分镜缩进）：两个以上空白 + 角色名：台词
const DIALOGUE_INDENT_RE = /^(\s{2,})([^:：\s][^:：]{0,24})[:：](\s*)(.*)$/
const QUOTE_RE = /^>\s?/

function classifyLine(rawLine) {
  const line = String(rawLine ?? '').replace(/\r$/, '')
  if (!line.trim()) return { kind: 'blank', text: line }
  if (EPISODE_HEADING_RE.test(line)) {
    return { kind: 'episodeHeading', text: line.replace(/^##\s*/, ''), raw: line }
  }
  if (BREAKDOWN_HEADING_RE.test(line)) return { kind: 'breakdownHeading', text: line }
  if (SCENE_HEAD_RE.test(line)) return { kind: 'sceneHead', text: line.replace(/^场景[:：]\s*/, '') }
  if (ACTION_RE.test(line)) return { kind: 'action', text: line.replace(/^△\s*/, '') }
  if (NARRATION_RE.test(line)) {
    return { kind: 'narration', text: line.replace(/^\[旁白[:：]\s*/, '').replace(/\]\s*$/, '') }
  }
  if (HOOK_RE.test(line)) return { kind: 'hook', text: line.replace(/^卡点[:：]\s*/, '') }
  if (MD_HEADING_RE.test(line)) {
    const match = line.match(MD_HEADING_RE)
    return { kind: 'mdHeading', level: match[1].length, text: match[2] }
  }
  if (QUOTE_RE.test(line)) return { kind: 'quote', text: line.replace(/^>\s?/, '') }
  if (BREAKDOWN_FIELD_RE.test(line)) {
    const label = line.match(/^([^:：]{1,4})[:：]/)[1]
    return { kind: 'breakdownField', label, text: line.replace(/^[^:：]{1,4}[:：]\s*/, '') }
  }
  const paren = line.match(DIALOGUE_PAREN_RE)
  if (paren) {
    return { kind: 'dialogue', speaker: paren[1].trim(), emotion: paren[2].trim(), text: paren[3].trim() }
  }
  const indented = line.match(DIALOGUE_INDENT_RE)
  if (indented) {
    return { kind: 'dialogue', speaker: indented[2].trim(), emotion: '', text: indented[4].trim() }
  }
  return { kind: 'plain', text: line }
}

/** 整篇剧本文本 → 行级 token 数组（保序、容错；非字符串输入按空文档处理）。 */
export function analyzeScriptDocument(input) {
  const source = typeof input === 'string' ? input : ''
  return source.replace(/\r\n?/g, '\n').split('\n').map((line) => classifyLine(line))
}

/** 统计格式特征命中（供渲染器选择与冒烟断言）。 */
export function measureScriptFeatures(input) {
  const lines = analyzeScriptDocument(input)
  const counts = {
    episodeHeading: 0, breakdownHeading: 0, sceneHead: 0,
    action: 0, dialogue: 0, hook: 0, narration: 0, breakdownField: 0
  }
  for (const line of lines) {
    if (counts[line.kind] !== undefined) counts[line.kind] += 1
  }
  return counts
}

/**
 * 判定一篇 md 是否按 kit 剧本格式渲染（保守阈值：小说章节几乎不会同时命中
 * 场景头 + 动作/对白/旁白/卡点，或出现分镜/集标题）。
 */
export function detectScriptFormat(input) {
  const counts = measureScriptFeatures(input)
  const episodic = counts.episodeHeading > 0 || counts.breakdownHeading > 0
  const staged = counts.sceneHead > 0
    && (counts.action > 0 || counts.dialogue > 0 || counts.narration > 0 || counts.hook > 0)
  const narrated = counts.narration > 0 && counts.dialogue > 0
  const matched = Object.keys(counts).filter((key) => counts[key] > 0)
  const isScript = episodic || staged || narrated
  return { isScript, matched, counts }
}
