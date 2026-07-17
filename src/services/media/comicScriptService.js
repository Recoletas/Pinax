import { getResolvedApiSettings } from '../api'
import { runGenerationTask } from '../generationService'
import { createComicPage } from './comicPageStore'

export function buildComicScriptMessages({ sourceText = '', sourceTitle = '', panelCount = 4 } = {}) {
  const count = clampPanelCount(panelCount)
  const source = String(sourceText || '').trim().slice(0, 16000)
  return [
    {
      role: 'system',
      content: [
        '你是漫画分镜编剧，把小说素材改写成可逐格生图的漫画页脚本。',
        '只输出 JSON 对象，不要 Markdown，不要解释。',
        // R2-D.4: page-level fields are part of the strict contract — the
        // model must fill pagePurpose / pageTurnHook / continuityNotes /
        // visualBibleRefs, the parser validates them, and the page is
        // created (or saved) round-trippable with these keys.
        '格式：{"title":"页标题","layout":"strip-4 或 page-6","styleBible":"统一画风、角色与色彩连续性",' +
        '"pagePurpose":"本页要传达的核心情绪或情节转折（一句话）","pageTurnHook":"让读者翻页的视觉或悬念钩子（一句）",' +
        '"continuityNotes":["前后页需要保持的连续点"],"visualBibleRefs":[{"kind":"character|location|prop|palette|lineStyle","refId":"实体 ID","note":"本页要点"}],' +
        '"panels":[{"visual":"只描述可见画面、构图、角色动作与光线，不写对白文字","dialogue":[{"speaker":"角色","text":"对白"}],"caption":"旁白"}]}。',
        '每格 visual 必须具体且能独立生图；对白、旁白和拟声词不得烘焙进 visual。',
        '相邻格保持人物服装、地点、时段和关键道具连续。',
        'pagePurpose 是本页一句话目标；pageTurnHook 是面向下一页的视觉钩子或悬念；visualBibleRefs 仅列本页需要强调的实体；缺信息时填简短占位文字但绝不留空字段。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        sourceTitle ? `素材标题：${sourceTitle}` : '',
        `请生成 ${count} 格漫画脚本，layout 使用 ${count === 6 ? 'page-6' : 'strip-4'}。`,
        `来源素材：\n${source || '（无可用正文）'}`
      ].filter(Boolean).join('\n\n')
    }
  ]
}

export function parseComicScript(content = '') {
  const source = String(content || '').trim()
  const candidates = [
    source,
    source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
    source.match(/\{[\s\S]*\}/)?.[0]
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const panels = normalizeScriptPanels(parsed?.panels)
      if (panels.length < 4 || panels.length > 6) continue
      // R2-D.4: page-level fields must round-trip. Strings get trimmed,
      // arrays are clamped to declared limits inside the normalizers.
      return {
        title: String(parsed.title || '漫画页').trim() || '漫画页',
        layout: panels.length >= 6 ? 'page-6' : 'strip-4',
        styleBible: String(parsed.styleBible || '').trim(),
        pagePurpose: String(parsed.pagePurpose || '').trim(),
        pageTurnHook: String(parsed.pageTurnHook || '').trim(),
        continuityNotes: normalizeScriptContinuityNotes(parsed?.continuityNotes),
        visualBibleRefs: normalizeScriptVisualBibleRefs(parsed?.visualBibleRefs),
        panels
      }
    } catch {
      // Try the next extract.
    }
  }
  return null
}

export async function generateComicPageScript({
  sourceText = '',
  sourceTitle = '',
  sourceRefs = [],
  projectId = null,
  panelCount = 4,
  settings = null
} = {}) {
  if (!String(sourceText || '').trim()) throw new Error('请先选择包含正文的素材')
  const apiSettings = settings || await getResolvedApiSettings()
  if (!apiSettings?.baseUrl || !apiSettings?.apiKey || !apiSettings?.model) {
    throw new Error('AI 配置不完整，请先在设置中配置文本模型')
  }

  const baseMessages = buildComicScriptMessages({ sourceText, sourceTitle, panelCount })
  const expectedPanelCount = clampPanelCount(panelCount)
  const result = await runGenerationTask({
    taskType: 'media.comic-script',
    baseMessages,
    settings: apiSettings,
    generationOptions: { max_tokens: 2400, temperature: 0.65 },
    parseContent: parseComicScript,
    isValidParsed: (parsed) => Array.isArray(parsed?.panels) && parsed.panels.length === expectedPanelCount,
    attempts: [
      { name: 'comic-script' },
      {
        name: 'comic-script-format-retry',
        appendMessages: [{
          role: 'user',
          content: `上一条格式不合规。请严格输出单个 JSON 对象，并且 panels 必须恰好有 ${expectedPanelCount} 项。`
        }]
      }
    ]
  })
  if (!result.success || !result.parsed) throw new Error('漫画脚本格式校验失败，请重试')

  return {
    page: createComicPage({
      ...result.parsed,
      projectId,
      sourceRefs,
      status: 'draft'
    }),
    attempts: result.attempts || []
  }
}

function normalizeScriptPanels(panels) {
  if (!Array.isArray(panels)) return []
  return panels.slice(0, 6).map((panel, index) => ({
    order: index + 1,
    visual: String(panel?.visual || '').replace(/\s+/g, ' ').trim(),
    dialogue: (Array.isArray(panel?.dialogue) ? panel.dialogue : []).slice(0, 6).map((line) => ({
      speaker: String(line?.speaker || '').trim(),
      text: String(line?.text || '').trim()
    })).filter((line) => line.text),
    caption: String(panel?.caption || '').trim()
  })).filter((panel) => panel.visual)
}

// R2-D.4: page-level field normalizers for parsed output.
// Strings stay simple (no clamp — full prose is fine).
// Arrays clamp to declared limits to match comicPageStore normalizers.
function normalizeScriptContinuityNotes(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((note) => String(note || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 20)
}

const VALID_VISUAL_BIBLE_REF_KINDS = new Set([
  'character', 'location', 'prop', 'palette', 'lineStyle'
])

function normalizeScriptVisualBibleRefs(input) {
  if (!Array.isArray(input)) return []
  return input.slice(0, 40).map((entry) => {
    if (!entry || typeof entry !== 'object') return null
    const kind = VALID_VISUAL_BIBLE_REF_KINDS.has(entry.kind) ? entry.kind : 'character'
    const refId = String(entry.refId || '').trim()
    if (!refId) return null
    return {
      kind,
      refId,
      note: String(entry.note || '').trim(),
      revision: Number.isFinite(Number(entry.revision)) && Number(entry.revision) > 0
        ? Math.floor(Number(entry.revision))
        : 1
    }
  }).filter(Boolean)
}

function clampPanelCount(value) {
  return Number(value) >= 6 ? 6 : 4
}
