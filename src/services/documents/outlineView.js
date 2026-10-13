// outline.json 结构视图模型（W1-B 文档阅读器 v1，只读）：
// 数据形状对齐写侧（src/services/localMirrorService.js buildBookMirrorPayload 的
// outline:{nodes,edges} 与 src/services/writing/projectOutlineRepository.js 的
// 节点/边规范）：节点 {id,title,intent,status,chapterRefs,explorationRefs,...}，
// 边 {id,kind,fromNodeId,toNodeId}。读侧容错：缺失/非法字段逐项回落，
// 绝不因约定外内容抛错（对齐 localMirrorService.js 读回「只有 md 时警告无结构化节点」语义）。
// 纯函数、零依赖、不发任何请求（node 冒烟可直接 import）。

export const OUTLINE_STATUS_KEYS = Object.freeze([
  'exploring', 'planned', 'drafted', 'fulfilled', 'parked'
])

export const OUTLINE_EDGE_KINDS = Object.freeze([
  'causes', 'foreshadows', 'alternative', 'parallel'
])

const EDGE_KIND_SET = new Set(OUTLINE_EDGE_KINDS)
const STATUS_SET = new Set(OUTLINE_STATUS_KEYS)

function text(value) {
  return String(value ?? '').trim()
}

function stringArray(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => text(typeof item === 'object' && item !== null ? item?.chapterId : item))
    .filter(Boolean))]
}

/** 容错规整单个节点；无 id 的节点按索引生成稳定占位 id。 */
export function normalizeOutlineNodeRaw(raw, index = 0) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const status = STATUS_SET.has(source.status) ? source.status : 'exploring'
  return {
    id: text(source.id) || `node-${index + 1}`,
    title: text(source.title) || '未命名节点',
    intent: text(source.intent),
    status,
    chapterRefs: stringArray(source.chapterRefs),
    explorationRefs: (Array.isArray(source.explorationRefs) ? source.explorationRefs : [])
      .map((ref) => text(typeof ref === 'object' && ref !== null ? ref?.documentId : ref))
      .filter(Boolean)
  }
}

/** 容错规整单条边；端点缺失/自环的边丢弃（与写侧 normalizeOutlineEdge 语义一致）。 */
export function normalizeOutlineEdgeRaw(raw, index = 0) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const fromNodeId = text(source.fromNodeId || source.from)
  const toNodeId = text(source.toNodeId || source.to)
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) return null
  return {
    id: text(source.id) || `edge-${index + 1}`,
    kind: EDGE_KIND_SET.has(source.kind) ? source.kind : 'causes',
    fromNodeId,
    toNodeId
  }
}

/**
 * 组装只读结构视图：节点按 status 着色键、因果边按 kind 列举。
 * 任何输入（null/数组含脏项）都不抛错。
 */
export function buildOutlineView(nodesRaw, edgesRaw) {
  const nodes = (Array.isArray(nodesRaw) ? nodesRaw : [])
    .filter((node) => node && typeof node === 'object')
    .map((node, index) => normalizeOutlineNodeRaw(node, index))
  const edges = (Array.isArray(edgesRaw) ? edgesRaw : [])
    .map((edge, index) => normalizeOutlineEdgeRaw(edge, index))
    .filter(Boolean)
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]))
  const resolvedEdges = edges.map((edge) => ({
    ...edge,
    fromTitle: nodeById.get(String(edge.fromNodeId))?.title || '已移除节点',
    toTitle: nodeById.get(String(edge.toNodeId))?.title || '已移除节点'
  }))
  const edgesByKind = {}
  for (const kind of OUTLINE_EDGE_KINDS) edgesByKind[kind] = []
  for (const edge of resolvedEdges) {
    if (!edgesByKind[edge.kind]) edgesByKind[edge.kind] = []
    edgesByKind[edge.kind].push(edge)
  }
  const statusCounts = {}
  for (const status of OUTLINE_STATUS_KEYS) statusCounts[status] = 0
  for (const node of nodes) statusCounts[node.status] += 1
  return {
    hasStructure: nodes.length > 0 || edges.length > 0,
    nodes,
    edges: resolvedEdges,
    edgesByKind,
    statusCounts
  }
}

/**
 * 从 outline.json 文本解析结构视图（容错：损坏 JSON / 缺数组 → 空视图 + warning，
 * 对齐服务端 readBookFromFolder「outline.json 缺失/损坏返回空节点」的读侧行为）。
 */
export function parseOutlineJsonText(input) {
  const empty = buildOutlineView([], [])
  if (typeof input !== 'string' || !input.trim()) {
    return { ok: false, view: empty, warning: 'outline.json 为空或不可读。' }
  }
  let parsed = null
  try {
    parsed = JSON.parse(input)
  } catch {
    return { ok: false, view: empty, warning: 'outline.json 解析失败——JSON 格式损坏，已回退文档视图。' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, view: empty, warning: 'outline.json 结构不符合预期（缺 nodes/edges）。' }
  }
  return {
    ok: true,
    view: buildOutlineView(parsed.nodes, parsed.edges),
    warning: ''
  }
}
