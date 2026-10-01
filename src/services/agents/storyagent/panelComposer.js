// StoryAgent-beta composer 纯逻辑：@ 提及、/ 命令、内置预设与技法。
// 交互语义对标 storymasterv4 storyharness Chat.tsx（波9-12 对齐 pi-web 的验证形态）：
// @ 必须在行首或空白后、token 不含空白；↑↓ 选择、Tab/Enter 确认、Esc 关闭。
// 此模块不依赖 Vue/浏览器 API，供面板与 scripts/storyagent-beta-smoke.mjs 共用。

/** 光标处是否处于 @ 提及中；是则返回 { token, start }。
 *  边界：@ 须在行首、空白或 CJK 标点之后（v4 规则的中文扩展）。 */
export function mentionAtCursor(value, caret) {
  const v = String(value ?? '')
  const before = v.slice(0, Math.max(0, Math.min(caret ?? 0, v.length)))
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  const head = at === 0 ? '' : before[at - 1]
  if (head && !/[\s。！？；，、：]/.test(head)) return null
  const token = before.slice(at + 1)
  if (/\s/.test(token)) return null
  return { token, start: at }
}

/** 按 token 过滤提及候选（title/id/别名，不区分大小写，最多 limit 条）。 */
export function filterMentions(entries, token, limit = 8) {
  const t = String(token || '').trim().toLowerCase()
  const list = (Array.isArray(entries) ? entries : []).filter((e) => {
    if (!e?.title) return false
    if (!t) return true
    const hay = `${e.title} ${e.id || ''} ${(e.aliases || []).join(' ')} ${e.type || ''}`.toLowerCase()
    return hay.includes(t)
  })
  return list.slice(0, limit)
}

/** 把 `@token` 替换为 `@title `（紧随的原有空格不重复），返回新文本与新光标位。 */
export function applyMention(value, start, tokenLen, title) {
  const v = String(value ?? '')
  let rest = v.slice(start + 1 + tokenLen)
  if (rest.startsWith(' ')) rest = rest.slice(1)
  const text = v.slice(0, start) + `@${title} ` + rest
  return { text, caret: start + title.length + 2 }
}

/** 内置意图预设（对齐 Pinax 体验叙事的任务形态）。 */
export const INTENT_PRESETS = Object.freeze([
  { id: 'advance', label: '推进场景', intent: '推进当前场景：给出有因果的下一步，不重播已发生事件。' },
  { id: 'dialogue', label: '对话交锋', intent: '以人物对白为主推进一轮交锋，各人只依据自己已知信息行动。' },
  { id: 'conflict', label: '冲突升级', intent: '让当前场景的张力升级一次，代价明确可见，不靠巧合。' },
  { id: 'atmosphere', label: '氛围渲染', intent: '强化当前场景的环境与感官细节，事件推进保持最克制。' },
  { id: 'open', label: '冷开场', intent: '为本场景写一个冷开场：直接进入动作或压力点，不做背景铺陈。' },
])

/** 内置写作技法（取自 storymasterv4 skills 库的精简指令面，同名技法 full 版在 v4 仓库）。 */
export const SKILL_PRESETS = Object.freeze([
  { id: 'dialogue-polish', label: '对白打磨', instruction: '对白打磨：删减解释性台词，让每句话带潜台词；说话人节奏差异化，不用书面腔。' },
  { id: 'foreshadow-plant', label: '伏笔埋设', instruction: '伏笔埋设：只埋一个可回收的伏笔，藏在动作或物件里，不解释、不点题。' },
  { id: 'cold-open', label: '冷开场', instruction: '冷开场：第一句进入事件中段，禁止天气/环境起手式，两段内给出压力源。' },
  { id: 'ghostwrite', label: '代笔续写', instruction: '代笔续写：延续既有文风与人称，不复述上文，不加总结句。' },
  { id: 'close-thread', label: '收束线索', instruction: '收束线索：给当前线索一个明确的收束动作，不引入新人物与新设定。' },
])

/** 斜杠命令注册表（面板按此渲染菜单与执行）。 */
export const SLASH_COMMANDS = Object.freeze([
  { name: 'mode', args: '<init|continue|auto|respond>', desc: '设置任务模式', hasArgs: true },
  { name: 'tokens', args: '<200-8000>', desc: '设置 maxTokens', hasArgs: true },
  { name: 'preset', args: '[名称]', desc: '应用意图预设', hasArgs: true },
  { name: 'skill', args: '[名称]', desc: '应用写作技法', hasArgs: true },
  { name: 'refs', args: '', desc: '列出已钉住的 @ 参考', hasArgs: false },
  { name: 'unref', args: '<序号|all>', desc: '移除钉住的参考', hasArgs: true },
  { name: 'sessions', args: '', desc: '刷新最近会话列表', hasArgs: false },
  { name: 'cancel', args: '', desc: '取消运行中任务', hasArgs: false },
  { name: 'new', args: '', desc: '清空当前输出，开新任务', hasArgs: false },
  { name: 'help', args: '', desc: '显示命令帮助', hasArgs: false },
])

/** 解析输入是否为 / 命令；返回 { name, args } 或 null。 */
export function parseSlashCommand(value) {
  const v = String(value ?? '').trim()
  if (!v.startsWith('/')) return null
  const m = /^\/([a-z]+)(?:\s+([\s\S]*))?$/.exec(v)
  if (!m) return null
  return { name: m[1], args: (m[2] || '').trim() }
}

/** 按前缀过滤命令候选（最多 limit 条）。 */
export function slashMatches(token, limit = 8) {
  const t = String(token || '').toLowerCase()
  return SLASH_COMMANDS.filter((c) => !t || c.name.startsWith(t)).slice(0, limit)
}

/** 把 @ 钉住的参考条目与项目上下文编成 kernel 的 serialization.blocks
 *  （桥件对预序列化 blocks 原样透传）。project = { bookTitle, chapterTitle, manuscriptTail }。 */
export function buildKernelBlocks({ sceneText = '', firstEntry = null, pinnedRefs = [], project = null } = {}) {
  const blocks = []
  const scene = String(sceneText || '').trim()
  blocks.push({
    kind: 'scene',
    title: '当前场景',
    text: scene ? scene.slice(0, 800) : '（未提供场景文本。依据世界书资料推进一个短叙事片段。）',
  })
  if (firstEntry?.title) {
    blocks.push({ kind: 'character', title: firstEntry.title, text: String(firstEntry.summary || '').slice(0, 600) })
  }
  const p = project || {}
  if (p.bookTitle || p.manuscriptTail) {
    const head = [p.bookTitle ? `书名：《${p.bookTitle}》` : '', p.chapterTitle ? `当前章节：${p.chapterTitle}` : '']
      .filter(Boolean).join(' · ')
    blocks.push({
      kind: 'project',
      title: '项目上下文（当前作品，正文以此为准）',
      text: `${head}${head ? '\n\n' : ''}${String(p.manuscriptTail || '').slice(-2400)}`.trim(),
    })
  }
  const refs = (Array.isArray(pinnedRefs) ? pinnedRefs : []).filter((e) => e?.title)
  if (refs.length) {
    blocks.push({
      kind: 'reference',
      title: '作者显式参考（@ 提及，优先采用）',
      text: refs.map((e) => `@${e.title}（${e.type || '条目'}）：${String(e.summary || '').slice(0, 300)}`).join('\n').slice(0, 2400),
    })
  }
  return blocks
}
