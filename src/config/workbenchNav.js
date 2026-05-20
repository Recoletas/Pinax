export const DEFAULT_ACTIVITY_KEY = 'experience'

export const ACTIVITY_ITEMS = [
  {
    key: 'experience',
    label: '体验',
    icon: 'compass',
    defaultRouteName: 'game'
  },
  {
    key: 'writing',
    label: '写作',
    icon: 'book',
    defaultRouteName: 'writing'
  },
  {
    key: 'poetry',
    label: '诗歌',
    icon: 'music',
    defaultRouteName: 'poetry-lab'
  },
  {
    key: 'prose',
    label: '散文',
    icon: 'document',
    defaultRouteName: 'prose-essay'
  }
]

export const SIDE_PANELS = {
  experience: {
    title: '体验',
    items: [
      {
        routeName: 'game',
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
        description: '章节与书籍管理'
      },
      {
        routeName: 'notes',
        label: '笔记',
        description: '灵感与速记整理'
      }
    ]
  },
  poetry: {
    title: '诗歌工坊',
    items: [
      {
        routeName: 'poetry-lab',
        label: '灵感树',
        description: '诗歌创作与分镜'
      }
    ]
  },
  prose: {
    title: '散文工坊',
    items: [
      {
        routeName: 'prose-essay',
        label: '卡片台',
        description: '卡片扩展与大纲'
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
