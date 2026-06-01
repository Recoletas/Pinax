/**
 * 地理 AI 适配器
 * 构建 AI 概念地图 prompt 和图像生成 prompt
 */

/**
 * 构建 AI 概念地图 prompt
 * AI 返回一段合法的 SVG 代码，描绘各地点的位置关系
 * @param {string} overview - 地理总述
 * @param {Array} locations - 地点列表
 * @returns {Array} ChatMessage[]
 */
export function buildConceptMapPrompt(overview, locations) {
  const locationList = locations
    .map(l => {
      const parent = l.parentId ? locations.find(p => p.id === l.parentId) : null
      return `- ${l.name}（${l.type}）：${l.description || '无描述'}${parent ? `，隶属于 ${parent.name}` : ''}`
    })
    .join('\n')

  const systemPrompt = `你是一位地图可视化专家。根据用户提供的地点列表，生成一个 SVG 概念地图，展示各地点的相对位置和层级关系。

**要求**：
1. 返回纯 SVG 代码，不要用 markdown 包裹
2. SVG 必须有明确的 width 和 height 属性
3. 使用 viewBox 适配不同屏幕
4. 地点用圆形节点表示，不同类型用不同颜色
5. 层级关系用连线表示
6. 文字标签清晰可读
7. 整体风格简洁美观

**地点类型颜色参考**：
- 大陆：#f59e0b（金色）
- 国家：#6366f1（紫色）
- 城市：#22c55e（绿色）
- 门派：#ec4899（粉色）
- 秘境：#a78bfa（浅紫）
- 遗迹：#94a3b8（灰色）
- 战场：#ef4444（红色）
- 自然：#14b8a6（青色）
- 建筑：#60a5fa（蓝色）
- 其他：#94a3b8（灰色）`

  const userPrompt = `请根据以下地点信息生成 SVG 概念地图：

地理总述：${overview || '（无）'}

地点列表：
${locationList || '（暂无地点）'}

请输出纯 SVG 代码。`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

/**
 * 构建世界地图图像生成 prompt
 * @param {string} projectName - 项目名称
 * @param {string} overview - 地理总述
 * @param {Array} locations - 地点列表
 * @returns {string} 图像生成 prompt
 */
export function buildImageMapPrompt(projectName, overview, locations) {
  const locationNames = locations.slice(0, 12).map(l => l.name).join(', ') || 'various kingdoms and cities'
  const locationTypes = [...new Set(locations.map(l => l.type))].join(', ')

  const hasFantasy = overview.includes('修') || overview.includes('仙') || overview.includes('魔') || overview.includes('武')
  const imageStyle = hasFantasy
    ? 'fantasy RPG world map, hand-drawn parchment style'
    : 'epic fantasy world map, aged parchment'

  return `Create a ${imageStyle} for a story called "${projectName}".

The world features: ${locationNames}.
Location types include: ${locationTypes}.

Geography overview: ${overview || 'A vast fantasy world with diverse landscapes and ancient civilizations.'}

Requirements:
- Bird's eye view perspective
- Detailed terrain with mountains, forests, rivers, and seas
- Labeled locations with calligraphic text
- Compass rose and decorative border
- Warm, aged parchment color palette
- High detail, suitable for printing`
}
