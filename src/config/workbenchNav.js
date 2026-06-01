export const DEFAULT_ACTIVITY_KEY = 'experience'

export const ACTIVITY_ITEMS = [
  {
    key: 'experience',
    label: '体验',
    description: '沉浸式文字冒险',
    icon: 'compass',
    defaultRouteName: 'experience'
  },
  {
    key: 'worldbook',
    label: '设定',
    description: '结构化设定与世界书管理',
    icon: 'settings',
    defaultRouteName: 'experience-settings-structured'
  },
  {
    key: 'writing',
    label: '写作',
    description: '章节管理与正文创作',
    icon: 'book',
    defaultRouteName: 'writing'
  },
  {
    key: 'materials',
    label: '素材',
    description: '灵感收集与素材整理',
    icon: 'archive',
    defaultRouteName: 'materials'
  },
  {
    key: 'storyboard',
    label: '画布',
    description: '关系编排与分镜规划',
    icon: 'film',
    defaultRouteName: 'prose-essay'
  }
]

export const SIDE_PANELS = {
  experience: {
    title: '体验',
    items: [
      {
        routeName: 'experience',
        label: '进入体验',
        description: '直接进入当前冒险'
      }
    ]
  },
  writing: {
    title: '写作',
    items: [
      {
        routeName: 'writing',
        label: '小说',
        description: '章节与正文管理'
      }
    ]
  },
  worldbook: {
    title: '设定',
    items: [
      {
        routeName: 'experience-settings-structured',
        label: '结构化设定',
        description: '世界观、故事、角色与创作规则'
      },
      {
        routeName: 'experience-world-map',
        label: '世界地图',
        description: 'Voronoi 地图生成与编辑'
      },
      {
        routeName: 'experience-worldbook',
        label: '快速导入',
        description: '预设、AI 提炼、随机生成入口'
      },
      {
        routeName: 'experience-worldbook-advanced',
        label: '高级设置',
        description: '条目、分组与注入参数细调'
      }
    ]
  },
  materials: {
    title: '素材',
    items: [
      {
        routeName: 'materials',
        label: '素材库',
        description: '灵感、速记与素材整理'
      }
    ]
  },
  storyboard: {
    title: '卡片画布',
    items: [
      {
        routeName: 'prose-essay',
        label: '关系画布',
        description: '素材关系与分镜编排'
      }
    ]
  }
}

export function resolveActivityKey(route) {
  const metaKey = route?.meta?.activityKey
  if (metaKey && SIDE_PANELS[metaKey]) return metaKey

  const routeName = String(route?.name || '')
  const matched = ACTIVITY_ITEMS.find((item) => item.defaultRouteName === routeName)
  if (matched) return matched.key

  return DEFAULT_ACTIVITY_KEY
}
