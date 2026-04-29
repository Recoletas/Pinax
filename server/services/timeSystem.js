export const PERIODS = ['凌晨', '清晨', '早晨', '上午', '中午', '下午', '傍晚', '夜晚', '深夜']

export class TimeSystem {
  constructor() {
    this.autoAdvanceThreshold = 3
  }

  advance(state, periods = 1) {
    let newIndex = state.time.periodIndex + periods
    let newDay = state.time.day

    while (newIndex >= PERIODS.length) {
      newIndex -= PERIODS.length
      newDay++
    }

    const oldPeriod = state.time.period
    state.time = {
      day: newDay,
      period: PERIODS[newIndex],
      periodIndex: newIndex
    }

    const events = []

    if (oldPeriod !== '夜晚' && state.time.period === '夜晚') {
      events.push({
        type: 'time_night',
        description: '夜幕降临，世界陷入了黑暗...'
      })
    }

    if (oldPeriod !== '早晨' && state.time.period === '早晨') {
      state.player.vitality = Math.min(state.player.vitality + 30, state.player.maxVitality)
      events.push({
        type: 'time_morning',
        description: '朝阳升起，新的一天开始了。你的精力恢复了。'
      })
    }

    if (oldPeriod !== '中午' && state.time.period === '中午') {
      events.push({
        type: 'time_noon',
        description: '正午的阳光照耀着大地。'
      })
    }

    return events
  }

  shouldAutoAdvance(state) {
    return (state.actionCount + 1) % this.autoAdvanceThreshold === 0
  }

  getTimeDescription(state) {
    return `第${state.time.day}天 ${state.time.period}`
  }
}

export const timeSystem = new TimeSystem()