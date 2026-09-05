export const DEFAULT_ACTIVITY_KEY = 'authoring'

export const ACTIVITY_ITEMS = [
  {
    key: 'authoring',
    label: '创作',
    description: '正文创作与叙事推演',
    icon: 'book',
    defaultRouteName: 'authoring'
  },
  {
    key: 'worldbook',
    label: '设定',
    description: '结构化设定与世界书管理',
    icon: 'settings',
    defaultRouteName: 'settings-structured'
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
  authoring: {
    title: '创作',
    items: [
      {
        routeName: 'authoring',
        label: '小说',
        description: '章节与正文管理'
      },
      {
        routeName: 'opening',
        label: '开场页',
        description: '独立选择开局行动'
      },
      {
        routeName: 'experience',
        label: '当前冒险',
        description: '继续已进入的现场'
      },
      {
        routeName: 'online-experience',
        label: '联机',
        description: '创建或加入联机房间（兼容入口）'
      }
    ]
  },
  worldbook: {
    title: '设定',
    items: [
      {
        routeName: 'settings-structured',
        label: '结构化设定',
        description: '世界观、故事、角色与创作规则'
      },
      {
        routeName: 'settings-worldbook',
        label: '世界书',
        description: '预设、文本导入与基调初始化'
      },
      {
        routeName: 'settings-world-map',
        label: '世界地图',
        description: 'Voronoi 地图生成与编辑'
      },
      {
        routeName: 'settings-worldbook-advanced',
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
      },
      {
        routeName: 'comics',
        label: '漫画制作',
        description: '按格选择素材并制作漫画页'
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
