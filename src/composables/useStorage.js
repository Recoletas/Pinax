/**
 * localStorage 键名与 schema 定义（统一入口）
 * 版本号标注以便后续迁移
 */

export const STORAGE_KEYS = {
  // 通用
  QUICK_NOTE_DRAFT: 'quick_note_draft',
  PROSE_QUICK_NOTE_DRAFT: 'prose_quick_note_draft',

  // 小说写作
  WRITING_BOOKS: 'writing_books',
  WRITING_CHARACTER: 'writing_character',
  WRITING_TIME: 'writing_time',
  WRITING_WORLDMAP: 'writing_worldmap',
  WRITING_SCENES: 'writing_scenes',
  WRITING_ACTIVITIES: 'writing_activities',
  WRITING_CHARACTERS: 'writing_characters',
  WRITING_TIMELINES: 'writing_timelines',
  WRITING_WORLD_SETTINGS: 'writing_world_settings',
  WRITING_NOTES: 'writing_notes',
  WRITING_SESSIONS: 'writing_sessions',
  NARRATIVE_ASSETS: 'narrative_assets_v1',
  MEMORY_CANDIDATES: 'memory_candidates_v1',
  STORYBOARD_SNAPSHOTS: 'storyboard_snapshots_v1',

  // 散文随笔
  PROSE_CARDS_V1: 'prose_cards_v1',
  PROSE_EDGES_V1: 'prose_edges_v1',
  PROSE_OUTLINE_V1: 'prose_outline_v1',
  PROSE_TIMELINE_V1: 'prose_timeline_v1',
  PROSE_PILES_V1: 'prose_piles_v1',
  PROSE_COMMITS_V1: 'prose_commits_v1',
  PROSE_BRANCHES_V1: 'prose_branches_v1',
  PROSE_IMAGE_LIBRARY: 'prose_image_library',

  // 诗歌工坊
  POETRY_IDEA_TREE_V2: 'poetry_idea_tree_v2',
  POETRY_IDEA_POSITIONS_V2: 'poetry_idea_positions_v2',
  POETRY_ADAPT_PROFILE_V2: 'poetry_adapt_profile_v2',
  POETRY_GRAPH_EDGES_V1: 'poetry_graph_edges_v1',
  POETRY_IMAGERY_GROUPS_V1: 'poetry_imagery_groups_v1',
  POETRY_SNAPSHOTS_V1: 'poetry_snapshots_v1',
  POETRY_IMAGE_LIBRARY_V1: 'poetry_image_library_v1',

  // AI 生图
  IMAGE_MODEL_CONFIGS: 'image_model_configs',

  // 游戏
  GAME_SETTINGS: 'gameSettings',
  API_SETTINGS: 'apiSettings',

  // 角色卡
  CHARACTERS: 'characters',

  // 偏好记忆
  PREFERENCE_USER_ID: 'preference_user_id'
}

export const SCHEMA = {
  [STORAGE_KEYS.PROSE_CARDS_V1]: {
    version: 1,
    itemShape: {
      id: 'string',
      content: 'string',
      createdAt: 'number',
      updatedAt: 'number',
      label: 'string',
      extraFields: 'object|null'
    }
  },
  [STORAGE_KEYS.POETRY_IDEA_TREE_V2]: {
    version: 2,
    itemShape: {
      id: 'string',
      title: 'string',
      parentId: 'string|null',
      children: 'array',
      createdAt: 'number',
      extraFields: 'object|null'
    }
  }
}

/**
 * 获取存储数据，统一 parse 逻辑
 */
export function getItem(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    console.warn(`[storage] getItem failed for key: ${key}`, e)
    return null
  }
}

/**
 * 设置存储数据，统一 serialize 逻辑
 */
export function setItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (e) {
    console.warn(`[storage] setItem failed for key: ${key}`, e)
    return false
  }
}

/**
 * 获取原始字符串存储
 */
export function getTextItem(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch (e) {
    console.warn(`[storage] getTextItem failed for key: ${key}`, e)
    return ''
  }
}

/**
 * 设置原始字符串存储
 */
export function setTextItem(key, value) {
  try {
    localStorage.setItem(key, String(value ?? ''))
    return true
  } catch (e) {
    console.warn(`[storage] setTextItem failed for key: ${key}`, e)
    return false
  }
}

/**
 * 移除存储数据
 */
export function removeItem(key) {
  localStorage.removeItem(key)
}
