const PROMPT_LIMIT = 1240

export const COMIC_IMAGE_NEGATIVE_PROMPT = [
  '多格漫画', '拼贴', '分屏', '故事板', '接触表', '画中画', '重复人物',
  '边框', '分格线', '对白框', '气泡', '字幕', '标题', '文字', '字母', '数字',
  '水印', '签名', 'logo', 'comic page', 'collage', 'split screen', 'storyboard',
  'speech bubble', 'caption', 'text', 'letters', 'watermark'
].join('，')

export function buildComicPanelImageRequest({
  page = {},
  panel = {},
  previousPanel = null,
  sourceTitle = '',
  sourceText = '',
  providerType = '',
  previousImageData = ''
} = {}) {
  const panels = Array.isArray(page.panels) ? page.panels : []
  const panelIndex = Math.max(0, panels.findIndex((item) => item.id === panel.id))
  const panelNumber = Number(panel.order) || panelIndex + 1
  const panelTotal = panels.length || Math.max(1, panelNumber)
  const sourceContext = stripVerbatimDialogue(sourceText)
  const continuity = buildPageContinuity(page)
  const previousAnchor = buildPreviousAnchor(previousPanel)
  const currentBeat = buildCurrentBeat(panel)
  const direction = buildDirection(panel.direction)

  const prompt = [
    '任务：生成一张独立、单幅、全幅出血、无边框的叙事插画。',
    `这是第 ${panelNumber}/${panelTotal} 格，只表现当前这一瞬间；不要把前后镜头、动作过程或多个时间点同时画进同一张图。`,
    '画面只包含人物、环境、道具、动作、光线与构图。画面中不得出现任何可读文字、字母、数字、字幕、标题、拟声词、标牌内容、对话框或气泡；文字将在成图后另行排版覆盖。',
    sourceTitle ? `来源标题：${clip(sourceTitle, 80)}` : '',
    sourceContext ? `来源故事核心：${clip(sourceContext, 320)}` : '',
    continuity ? `全页连续性：${clip(continuity, 300)}` : '',
    previousAnchor ? `上一格视觉锚点：${clip(previousAnchor, 220)}。仅继承人物外观、服装、地点、时段、光线方向和关键道具，不要重画上一格。` : '',
    `当前格画面：${clip(panel.visual, 360) || '按本页故事目标表现一个明确瞬间。'}`,
    currentBeat ? `当前剧情节拍：${clip(currentBeat, 180)}` : '',
    direction ? `镜头约束：${direction}` : '',
    '输出要求：单一镜头、单一构图、自然占满画布，不使用漫画纸张、版面、格线、拼贴或多联画形式。'
  ].filter(Boolean).join('\n').slice(0, PROMPT_LIMIT)

  const canUsePreviousImage = providerType !== 'minimax_image'
    && /^(data:image\/|https?:\/\/)/i.test(String(previousImageData || ''))

  return {
    prompt,
    negativePrompt: COMIC_IMAGE_NEGATIVE_PROMPT,
    referenceImages: canUsePreviousImage
      ? [{ id: previousPanel?.selectedTakeId || previousPanel?.id || 'previous-panel', data: previousImageData }]
      : [],
    referenceStrength: 0.78
  }
}

function buildPageContinuity(page) {
  const visualBible = page.visualBible || {}
  const refs = (Array.isArray(page.visualBibleRefs) ? page.visualBibleRefs : [])
    .map((entry) => [entry.refId, entry.note].filter(Boolean).join('：'))
    .filter(Boolean)
  return [
    page.styleBible,
    visualBible.lineStyle,
    visualBible.renderingNotes,
    ...(Array.isArray(visualBible.invariantNotes) ? visualBible.invariantNotes : []),
    ...(Array.isArray(page.continuityNotes) ? page.continuityNotes : []),
    ...refs
  ].map(clean).filter(Boolean).join('；')
}

function buildPreviousAnchor(panel) {
  if (!panel) return ''
  return [panel.visual, panel.beat?.action, panel.beat?.emotion, panel.direction?.notes]
    .map(clean)
    .filter(Boolean)
    .join('；')
}

function buildCurrentBeat(panel) {
  return [panel.beat?.action, panel.beat?.emotion, panel.beat?.reveal, panel.beat?.transition]
    .map(clean)
    .filter(Boolean)
    .join('；')
}

function buildDirection(direction = {}) {
  const shotSizes = {
    'extreme-wide': '大远景', wide: '远景', medium: '中景', close: '近景',
    'extreme-close': '特写', insert: '插入特写'
  }
  const angles = {
    eye: '平视', high: '高机位', low: '低机位', bird: '俯视', worm: '仰视',
    dutch: '倾斜机位', pov: '主观视角'
  }
  const perspectives = {
    flat: '平面构图', 'one-point': '一点透视', 'two-point': '两点透视',
    'three-point': '三点透视', fisheye: '鱼眼透视'
  }
  return [
    shotSizes[direction.shotSize],
    angles[direction.cameraAngle],
    perspectives[direction.perspective],
    clean(direction.notes)
  ].filter(Boolean).join('，')
}

function stripVerbatimDialogue(value) {
  return clean(value)
    .replace(/[“”][^“”]{1,180}[“”]/g, '')
    .replace(/[‘’][^‘’]{1,180}[‘’]/g, '')
    .replace(/"[^"\n]{1,180}"/g, '')
    .replace(/'[^'\n]{1,180}'/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clip(value, limit) {
  return clean(value).slice(0, limit)
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}
