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
  previousImageData = '',
  targetAspect = ''
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
    targetAspect ? `目标画幅：${clip(targetAspect, 24)}；主体、动作和关键道具完整落在画面内，并在边缘保留少量安全空间。` : '',
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
  const semanticRefs = (Array.isArray(visualBible.references) ? visualBible.references : [])
    .map((entry) => [
      entry.label || entry.sourceRef?.refId,
      ...(Array.isArray(entry.invariantNotes) ? entry.invariantNotes : [])
    ].filter(Boolean).join('：'))
    .filter(Boolean)
  return [
    page.styleBible,
    visualBible.lineStyle,
    visualBible.renderingNotes,
    ...(Array.isArray(visualBible.invariantNotes) ? visualBible.invariantNotes : []),
    ...(Array.isArray(page.continuityNotes) ? page.continuityNotes : []),
    ...semanticRefs,
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
  const blocking = (Array.isArray(direction.blocking) ? direction.blocking : [])
    .map((item) => `${clean(item.label) || '人物'}位于${boxPosition(item.box)}`)
    .filter(Boolean)
    .join('、')
  const motion = (Array.isArray(direction.motionVectors) ? direction.motionVectors : [])
    .map((item) => `${clean(item.label) || '运动'}从${pointPosition(item.from)}指向${pointPosition(item.to)}`)
    .filter(Boolean)
    .join('、')
  const balloonZones = (Array.isArray(direction.balloonSafeZones) ? direction.balloonSafeZones : [])
    .map((item) => `${boxPosition(item.box)}保留干净负空间`)
    .filter(Boolean)
    .join('、')
  return [
    shotSizes[direction.shotSize],
    angles[direction.cameraAngle],
    perspectives[direction.perspective],
    direction.focalPoint ? `视觉焦点在${pointPosition([direction.focalPoint.x, direction.focalPoint.y])}` : '',
    direction.horizonY !== null && direction.horizonY !== undefined
      ? `地平线约在画面高度 ${Math.round(Number(direction.horizonY) * 100)}%`
      : '',
    blocking ? `人物调度：${blocking}` : '',
    motion ? `运动动线：${motion}` : '',
    balloonZones ? `后期文字留白：${balloonZones}，不要绘制文字或气泡` : '',
    clean(direction.notes)
  ].filter(Boolean).join('，')
}

function boxPosition(box) {
  const values = Array.isArray(box) ? box.map(Number) : []
  return pointPosition([
    (Number.isFinite(values[0]) ? values[0] : 0.5) + (Number.isFinite(values[2]) ? values[2] : 0) / 2,
    (Number.isFinite(values[1]) ? values[1] : 0.5) + (Number.isFinite(values[3]) ? values[3] : 0) / 2
  ])
}

function pointPosition(point) {
  const values = Array.isArray(point) ? point.map(Number) : []
  const x = Number.isFinite(values[0]) ? values[0] : 0.5
  const y = Number.isFinite(values[1]) ? values[1] : 0.5
  const horizontal = x < 0.34 ? '左侧' : x > 0.66 ? '右侧' : '中央'
  const vertical = y < 0.34 ? '上方' : y > 0.66 ? '下方' : '中部'
  return `${horizontal}${vertical}`
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
