export const DEFAULT_ACTIVITY_KEY = 'experience'

export const ACTIVITY_ITEMS = [
  {
    key: 'experience',
    label: '体验',
    icon: 'compass',
    defaultRouteName: 'experience'
  },
  {
    key: 'worldbook',
    label: '世界书',
    icon: 'settings',
    defaultRouteName: 'experience-worldbook'
  },
  {
    key: 'writing',
    label: '写作',
    icon: 'book',
    defaultRouteName: 'writing'
  },
  {
    key: 'materials',
    label: '素材',
    icon: 'archive',
    defaultRouteName: 'materials'
  },
  {
    key: 'storyboard',
    label: '分镜',
    icon: 'film',
    defaultRouteName: 'poetry-lab'
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
    title: '世界书',
    items: [
      {
        routeName: 'experience-worldbook',
        label: '导入',
        description: '预设、AI 提炼、随机生成'
      },
      {
        routeName: 'experience-worldbook-advanced',
        label: '编辑',
        description: '条目与注入参数细调'
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
    title: '分镜',
    items: [
      {
        routeName: 'poetry-lab',
        label: '诗歌入口',
        description: '灵感树与分镜导出'
      },
      {
        routeName: 'prose-essay',
        label: '散文入口',
        description: '卡片、大纲与分镜'
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
