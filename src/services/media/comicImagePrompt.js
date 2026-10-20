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
  const localShot = ['empty', 'insert', 'extreme-close'].includes(panel.direction?.shotSize)
  const continuity = buildPageContinuity(page, localShot)
  const previousAnchor = buildPreviousAnchor(previousPanel)
  const currentBeat = buildCurrentBeat(panel)
  const direction = buildDirection(panel.direction)

  // Allocate from the current shot outward. Appending everything and slicing
  // once used to privilege the previous portrait over the requested insert,
  // and could drop the current shot/direction when context grew.
  const ending = '交付为一张自然完整、纯视觉的单幅画面，不带版面元素。'
  const lines = [
    '生成一张全幅叙事插画。当前镜头决定画面主体、动作和景别。',
    '连续性优先保持身份与画风，不照搬上一格的构图；本格未要求的人物和道具不因前文出现而入画。'
  ]
  function addSection(label, value, limit) {
    const text = clip(value, limit)
    if (!text) return
    const remaining = PROMPT_LIMIT - [...lines, ending].join('\n').length - label.length - 1
    if (remaining < 24) return
    lines.push(`${label}${text.slice(0, remaining)}`)
  }
  addSection('当前镜头：', panel.visual || '从原素材中选择一个明确的叙事瞬间。', 520)
  addSection('摄影设计：', direction, 260)
  addSection('目标画幅：', targetAspect, 24)
  addSection('本格剧情：', currentBeat, 120)
  addSection('全页视觉约定（只约束身份、环境和画风）：', continuity, 220)
  addSection('故事主题：', sourceTitle, 60)
  if (!localShot) {
    addSection('原素材背景（不改变本格取景）：', sourceContext, 150)
    addSection('上一格情节（不复现画面）：', previousAnchor, 100)
  }
  const prompt = [...lines, ending].join('\n')

  const canUsePreviousImage = !localShot && providerType !== 'minimax_image'
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

function buildPageContinuity(page, localShot = false) {
  const visualBible = page.visualBible || {}
  // Inserts and empty shots inherit explicit rendering rules, not a page-wide
  // cast list, props, blocking or narrative prose. The author still controls
  // visible identity details in this shot's own description.
  if (localShot) {
    return [
      visualBible.lineStyle,
      visualBible.renderingNotes,
      ...(Array.isArray(visualBible.palette) ? visualBible.palette : []),
      ...(Array.isArray(page.visualBibleRefs) ? page.visualBibleRefs : [])
        .filter((entry) => ['palette', 'lineStyle'].includes(entry.kind))
        .map((entry) => entry.note),
      page.colorMode === 'monochrome' ? '黑白画面' : ''
    ].map(clean).filter(Boolean).join('；')
  }
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
  // Shot descriptions, lens notes and poses are not continuity invariants.
  // Keep only explicit story beats; an unannotated previous image needs no
  // textual reconstruction inside the next image request.
  return [panel.beat?.action, panel.beat?.reveal, panel.beat?.transition]
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
    'extreme-close': '特写：指定局部占满画面', insert: '插入特写：只呈现本格指定的局部',
    empty: '空镜：只画环境，画面内无人'
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
