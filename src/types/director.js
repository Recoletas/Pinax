/**
 * director.js - 编导模式类型定义
 *
 * 景别、运镜、转场类型的常量定义与映射
 */

// 景别定义
export const SHOT_TYPES = {
  extreme_wide: {
    id: 'extreme_wide',
    label: '远景',
    english: 'Extreme Wide Shot (EWS)',
    description: '展现广阔场景',
    usage: '建立场景、氛围'
  },
  wide: {
    id: 'wide',
    label: '全景',
    english: 'Wide Shot (WS)',
    description: '完整展示人物与环境',
    usage: '交代关系'
  },
  medium: {
    id: 'medium',
    label: '中景',
    english: 'Medium Shot (MS)',
    description: '膝盖以上',
    usage: '日常对话、动作'
  },
  close_up: {
    id: 'close_up',
    label: '近景',
    english: 'Close-Up (CU)',
    description: '胸部以上',
    usage: '表情、情感'
  },
  extreme_close_up: {
    id: 'extreme_close_up',
    label: '特写',
    english: 'Extreme Close-Up (ECU)',
    description: '局部细节',
    usage: '强调、紧张感'
  }
}

// 运镜定义
export const CAMERA_MOVEMENTS = {
  push: {
    id: 'push',
    label: '推',
    english: 'Push In',
    description: '镜头向前推进'
  },
  pull: {
    id: 'pull',
    label: '拉',
    english: 'Pull Out',
    description: '镜头向后拉远'
  },
  pan: {
    id: 'pan',
    label: '摇',
    english: 'Pan',
    description: '镜头左右摇动'
  },
  track: {
    id: 'track',
    label: '移',
    english: 'Track',
    description: '镜头左右移动'
  },
  follow: {
    id: 'follow',
    label: '跟',
    english: 'Follow',
    description: '镜头跟随主体'
  },
  fixed: {
    id: 'fixed',
    label: '固定',
    english: 'Fixed',
    description: '镜头固定'
  }
}

// 转场类型定义
export const TRANSITION_TYPES = {
  jump_cut: {
    id: 'jump_cut',
    label: '跳切',
    color: '#ff6b6b',
    dashArray: '0',
    description: '同一场景快速切换'
  },
  dissolve: {
    id: 'dissolve',
    label: '叠化',
    color: '#4ecdc4',
    dashArray: '4,4',
    description: '画面渐变过渡'
  },
  fade_in_out: {
    id: 'fade_in_out',
    label: '淡入淡出',
    color: '#45b7d1',
    dashArray: '8,4',
    description: '黑转/转黑'
  },
  contrast_montage: {
    id: 'contrast_montage',
    label: '对比蒙太奇',
    color: '#f9ca24',
    dashArray: '2,2',
    description: '对比画面切换'
  },
  cross_cut: {
    id: 'cross_cut',
    label: '交叉剪辑',
    color: '#9b59b6',
    dashArray: '6,3',
    description: '双线交替'
  },
  match_cut: {
    id: 'match_cut',
    label: '匹配剪辑',
    color: '#6ab04c',
    dashArray: '0',
    description: '相似形状/动作切换'
  }
}

// 边类型（写作模式）
export const WRITING_EDGE_TYPES = {
  metaphor: {
    id: 'metaphor',
    label: '隐喻',
    color: '#a855f7',
    description: '意象之间的隐喻关系'
  },
  juxtaposition: {
    id: 'juxtaposition',
    label: '并置',
    color: '#3b82f6',
    description: '平行呈现的意象'
  },
  fracture: {
    id: 'fracture',
    label: '断裂',
    color: '#ef4444',
    description: '突兀的转折'
  },
  echo: {
    id: 'echo',
    label: '回声',
    color: '#22c55e',
    description: '前后呼应'
  }
}

// 情绪 → 景别映射
export const EMOTION_SHOT_MAP = {
  joy: 'wide',
  sadness: 'medium',
  anger: 'close_up',
  fear: 'extreme_close_up',
  surprise: 'medium',
  nostalgia: 'medium',
  longing: 'close_up',
  calm: 'wide',
  anxiety: 'close_up',
  excitement: 'medium'
}

// 情绪色调映射
export const EMOTION_TONE_MAP = {
  joy: '明亮暖色调，高饱和',
  sadness: '冷色调，低饱和度',
  anger: '高对比度，红色调',
  fear: '暗色调，阴影重',
  surprise: '对比强烈，光影分明',
  nostalgia: '暖黄怀旧色调',
  longing: '柔和紫色调',
  calm: '淡蓝冷色调',
  anxiety: '灰暗色调，颗粒感',
  excitement: '鲜艳色调，高对比'
}

// 转场类型映射（边类型 → 导出转场）
export const TRANSITION_EXPORT_MAP = {
  jump_cut: 'cut',
  dissolve: 'dissolve',
  fade_in_out: 'fade',
  cross_cut: 'cut',
  contrast_montage: 'cut',
  match_cut: 'cut'
}

// 帧率常量
export const FPS = 25

/**
 * 获取景别列表
 * @returns {Array} 景别列表
 */
export function getShotTypes() {
  return Object.entries(SHOT_TYPES).map(([key, config]) => ({
    value: key,
    label: config.label,
    english: config.english,
    description: config.description,
    usage: config.usage
  }))
}

/**
 * 获取运镜列表
 * @returns {Array} 运镜列表
 */
export function getCameraMovements() {
  return Object.entries(CAMERA_MOVEMENTS).map(([key, config]) => ({
    value: key,
    label: config.label,
    english: config.english,
    description: config.description
  }))
}

/**
 * 获取转场类型列表
 * @returns {Array} 转场类型列表
 */
export function getTransitionTypes() {
  return Object.entries(TRANSITION_TYPES).map(([key, config]) => ({
    value: key,
    label: config.label,
    color: config.color,
    dashArray: config.dashArray,
    description: config.description
  }))
}

/**
 * 根据情绪推断景别
 * @param {string} emotion - 情绪标签
 * @returns {string} 景别 ID
 */
export function inferShotTypeFromEmotion(emotion) {
  return EMOTION_SHOT_MAP[emotion] || 'medium'
}

/**
 * 根据情绪推断色调
 * @param {string} emotion - 情绪标签
 * @returns {string} 色调描述
 */
export function inferToneFromEmotion(emotion) {
  return EMOTION_TONE_MAP[emotion] || ''
}

export default {
  SHOT_TYPES,
  CAMERA_MOVEMENTS,
  TRANSITION_TYPES,
  WRITING_EDGE_TYPES,
  EMOTION_SHOT_MAP,
  EMOTION_TONE_MAP,
  TRANSITION_EXPORT_MAP,
  FPS,
  getShotTypes,
  getCameraMovements,
  getTransitionTypes,
  inferShotTypeFromEmotion,
  inferToneFromEmotion
}
