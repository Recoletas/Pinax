// 观察器调度门（spec §9 / 验收修复 4）：只有正文成功提交的回合
// 才允许调度派生观察器；失败、stale、停止、取消一律零调度。
export function shouldDispatchAuthoringObservers(outcome) {
  return Boolean(outcome?.ok && String(outcome?.text || '').trim())
}
