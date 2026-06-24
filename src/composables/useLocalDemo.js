import { ref, computed, watch } from 'vue'

// UI-E13-BIG1: local demo scene + manual progression.
// The /experience page used to read as an "empty shell + AI 配置不完整
// 错误消息" when no AI is configured. This composable provides a
// pure-local "本地演示场景" mode: a 3-scene script (码头 / 帐篷 /
// 灯塔) with hand-written events, characters, location, weather, time.
// The user can 继续 (advance to next event in current scene) or 切场景
// (jump to next scene) without ever calling an AI API.
//
// Persistence: demo progress (current scene index + current event index)
// is saved to localStorage under `e13_demo_state_v1` so the demo
// survives page refresh. No mutation of gameStore / worldStore —
// this composable is read/write isolated. The right rail components
// (StatusBar / GeographyPanel / QuestLog) and the central chat
// (GamePanel) read from this composable's reactive refs.
//
// Scope rationale: per the E13-BIG1 brief, store / service / router
// / server are off-limits. This composable only reads gameStore
// (useGameStore) to know if there are real AI messages, and writes
// to localStorage + emits events that Experience.vue converts into
// gameStore messages. No direct gameStore mutation here.

const STORAGE_KEY = 'e13_demo_state_v1'

const SCENES = [
  {
    id: 'pier',
    title: '雾港码头',
    location: '雾港码头 · 黄昏',
    weather: '薄雾',
    timeOfDay: '黄昏',
    characters: [
      { id: 'narrator', name: '旁白', role: 'narrator' },
      { id: 'old-sailor', name: '老水手', role: 'present' }
    ],
    events: [
      {
        id: 'pier-1',
        type: 'scene',
        content: '你踏上雾港码头, 木板在脚下吱呀作响。黄昏的薄雾把桅杆的轮廓染成灰蓝, 街灯在浪里像断了的牙齿。'
      },
      {
        id: 'pier-2',
        type: 'narrator',
        content: '码头尽头有一顶旧帆布帐篷, 缝补的帆布在海风里微动。帐篷口蹲着一个老水手, 手里正用一把小刀修理一只罗盘。'
      },
      {
        id: 'pier-3',
        type: 'narrator',
        content: '你靠近时, 老水手抬头看你, 目光在盐渍的眉毛下很警觉。他把罗盘翻了个面, 又开始修。'
      }
    ]
  },
  {
    id: 'tent',
    title: '旧帆布帐篷',
    location: '旧帆布帐篷内 · 夜',
    weather: '细雨',
    timeOfDay: '入夜',
    characters: [
      { id: 'narrator', name: '旁白', role: 'narrator' },
      { id: 'old-sailor', name: '老水手', role: 'present' }
    ],
    events: [
      {
        id: 'tent-1',
        type: 'scene',
        content: '帐篷里弥漫着海盐和焦油的味道, 烛火在铁皮罐里晃。你的影子在帆布墙上拉得很长。'
      },
      {
        id: 'tent-2',
        type: 'narrator',
        content: '老水手把罗盘收进怀里, 用抹布擦了擦手。"北境海图?" 他重复了一次, 声音像在嚼一块硬的咸肉。"那份图不在雾港。它在北面三天海路的银灯塔, 被一个不卖酒只收故事的船长守着。"'
      },
      {
        id: 'tent-3',
        type: 'narrator',
        content: '"你若真的想去," 他补了一句, "得先从我这里带一句话给他——关于你为何要北上。你现在想好怎么说了吗?"'
      }
    ]
  },
  {
    id: 'lighthouse',
    title: '银灯塔下',
    location: '银灯塔 · 黎明前',
    weather: '微风',
    timeOfDay: '黎明前',
    characters: [
      { id: 'narrator', name: '旁白', role: 'narrator' },
      { id: 'keeper', name: '灯塔守人', role: 'present' }
    ],
    events: [
      {
        id: 'lighthouse-1',
        type: 'scene',
        content: '三天后, 你站在银灯塔的台阶下。灯塔的光在云层里慢慢转着, 像一只半睡半醒的眼睛。'
      },
      {
        id: 'lighthouse-2',
        type: 'narrator',
        content: '门半开。门后站着一个穿油布外套的人, 手里提着一只旧铁皮灯。"老水手让你来的?" 他没等你回答, "进来吧, 我听过你的话。"'
      },
      {
        id: 'lighthouse-3',
        type: 'narrator',
        content: '桌上摊着那张海图, 边角被海风吹卷, 墨线在灯下像活的。你把老水手托你带的那句话放到了桌上。'
      }
    ]
  }
]

function loadState() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { sceneIndex: 0, eventIndex: 0 }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { sceneIndex: 0, eventIndex: 0 }
    const parsed = JSON.parse(raw)
    if (
      typeof parsed.sceneIndex === 'number'
      && typeof parsed.eventIndex === 'number'
      && parsed.sceneIndex >= 0
      && parsed.sceneIndex < SCENES.length
    ) {
      return parsed
    }
  } catch (e) { /* ignore parse errors */ }
  return { sceneIndex: 0, eventIndex: 0 }
}

const state = loadState()
const sceneIndex = ref(state.sceneIndex)
const eventIndex = ref(state.eventIndex)

watch([sceneIndex, eventIndex], () => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sceneIndex: sceneIndex.value,
      eventIndex: eventIndex.value
    }))
  } catch (e) { /* ignore quota errors */ }
})

export function useLocalDemo() {
  const currentScene = computed(() => SCENES[sceneIndex.value] || SCENES[0])
  const currentEvent = computed(() => {
    const s = currentScene.value
    if (!s || !s.events || s.events.length === 0) return null
    return s.events[Math.min(eventIndex.value, s.events.length - 1)] || s.events[0]
  })
  const nextEvent = computed(() => {
    const s = currentScene.value
    if (!s || !s.events) return null
    if (eventIndex.value + 1 < s.events.length) {
      return s.events[eventIndex.value + 1]
    }
    if (sceneIndex.value + 1 < SCENES.length) {
      return SCENES[sceneIndex.value + 1].events[0]
    }
    return null
  })
  const hasMoreInScene = computed(() => {
    const s = currentScene.value
    return s && eventIndex.value + 1 < s.events.length
  })
  const hasNextScene = computed(() => sceneIndex.value + 1 < SCENES.length)
  const isAtEnd = computed(() => !nextEvent.value)

  // Apply a local action. 'continue' advances to the next event in the
  // current scene (or wraps to scene 0 if at end). 'scene' jumps to
  // the next scene's first event. Returns the new event payload
  // (caller can append to gameStore.messages via Experience.vue's
  // handleLocalDemoEvent).
  function applyLocalAction(action) {
    if (action === 'continue') {
      if (hasMoreInScene.value) {
        eventIndex.value = eventIndex.value + 1
      } else if (hasNextScene.value) {
        sceneIndex.value = sceneIndex.value + 1
        eventIndex.value = 0
      } else {
        return null
      }
      return currentEvent.value
    }
    if (action === 'scene') {
      if (hasNextScene.value) {
        sceneIndex.value = sceneIndex.value + 1
        eventIndex.value = 0
      } else {
        sceneIndex.value = 0
        eventIndex.value = 0
      }
      return currentEvent.value
    }
    return null
  }

  function reset() {
    sceneIndex.value = 0
    eventIndex.value = 0
  }

  // Build a synthetic message payload compatible with gameStore shape.
  // Caller is responsible for pushing into gameStore.messages. We
  // return the payload, no side effect on gameStore.
  function buildEventMessage(event) {
    if (!event) return null
    return {
      id: `demo-${event.id}-${Date.now()}`,
      role: event.type === 'scene' ? 'system' : 'assistant',
      type: event.type === 'scene' ? 'scene' : 'narrator',
      content: event.content,
      timestamp: Date.now(),
      source: 'local-demo'
    }
  }

  return {
    scenes: SCENES,
    sceneIndex,
    eventIndex,
    currentScene,
    currentEvent,
    nextEvent,
    hasMoreInScene,
    hasNextScene,
    isAtEnd,
    applyLocalAction,
    buildEventMessage,
    reset
  }
}

export const _scenes = SCENES
