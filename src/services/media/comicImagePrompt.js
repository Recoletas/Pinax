const PROMPT_LIMIT = 1240

export const COMIC_IMAGE_NEGATIVE_PROMPT = [
  '拼贴', '分屏', '多联画', '边框', '气泡', '字幕', '文字', '水印',
  'collage', 'split screen', 'speech bubble', 'text', 'watermark'
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
  const sourceContext = stripVerbatimDialogue(sourceText)
  const continuity = buildPageContinuity(page)
  const previousAnchor = buildPreviousAnchor(previousPanel)
  const currentBeat = buildCurrentBeat(panel)
  const direction = buildDirection(panel.direction)

  const prompt = [
    '生成一张全幅叙事插画，只表现当前镜头的一个明确瞬间。',
    '连续性优先：与相邻镜头保持同一角色身份、面貌、发型、体型、服装、地点、时段、光线、色调和关键道具；动作从上一镜自然延续，但构图必须推进剧情。',
    continuity ? `全页视觉约定：${clip(continuity, 260)}` : '',
    previousAnchor ? `上一镜锚点：${clip(previousAnchor, 220)}` : '',
    sourceTitle ? `故事主题：${clip(sourceTitle, 80)}` : '',
    sourceContext ? `原素材情境：${clip(sourceContext, 300)}` : '',
    `当前镜头：${clip(panel.visual, 340) || '从原素材中选择与上一镜衔接的下一瞬间。'}`,
    currentBeat ? `剧情推进：${clip(currentBeat, 160)}` : '',
    direction ? `摄影设计：${direction}` : '',
    '交付为一张自然完整、纯视觉的单幅画面，不带版面元素。'
  ].filter(Boolean).join('\n').slice(0, PROMPT_LIMIT)

  const canUsePreviousImage = providerType !== 'minimax_image'
    && /^(data:image\/|https?:\/\/)/i.test(String(previousImageData || ''))

  return {
    prompt,
    negativePrompt: providerType === 'minimax_image' ? '' : COMIC_IMAGE_NEGATIVE_PROMPT,
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
    .replace(/【[^】]{1,80}】/g, ' ')
    .replace(/(?:^|\s)(?:\d{1,3}[.、)]|[-=*#]{2,})\s*/g, ' ')
    .replace(/[“”][^“”]{1,180}[“”]/g, '')
    .replace(/[‘’][^‘’]{1,180}[‘’]/g, '')
    .replace(/"[^"\n]{1,180}"/g, '')
    .replace(/'[^'\n]{1,180}'/g, '')
    .replace(/[^，。！？\s]{0,12}(?:说|问|喊|答|道)[:：]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clip(value, limit) {
  return clean(value).slice(0, limit)
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}
