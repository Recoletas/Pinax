export function createExperienceSessionAdapter(onlineRoom) {
  const subscriptions = []

  function onNarrativeRequested(callback) {
    const handler = (evt) => {
      if (evt.type === 'narrative.requested') callback(evt.payload)
    }
    const unsub = () => {
      const idx = subscriptions.indexOf(handler)
      if (idx >= 0) subscriptions.splice(idx, 1)
    }
    subscriptions.push(handler)
    if (onlineRoom.events) {
      onlineRoom.events.forEach((evt) => {
        if (evt.type === 'narrative.requested') callback(evt.payload)
      })
    }
    return unsub
  }

  function onNarrativeCompleted(callback) {
    const handler = (evt) => {
      if (evt.type === 'narrative.completed') callback(evt.payload)
    }
    subscriptions.push(handler)
    if (onlineRoom.events) {
      onlineRoom.events.forEach((evt) => {
        if (evt.type === 'narrative.completed') callback(evt.payload)
      })
    }
    return () => {
      const idx = subscriptions.indexOf(handler)
      if (idx >= 0) subscriptions.splice(idx, 1)
    }
  }

  function submitHostCompletion(result) {
    if (!onlineRoom.isHost || !onlineRoom.isHost.value) return false
    if (typeof onlineRoom.sendCommand === 'function') {
      onlineRoom.sendCommand('narrative.completed', result)
    }
    return true
  }

  function submitAcceptedRuntimePatch(patch) {
    if (!onlineRoom.isHost || !onlineRoom.isHost.value) return false
    if (typeof onlineRoom.sendCommand === 'function') {
      onlineRoom.sendCommand('runtime.patch.accepted', patch)
    }
    return true
  }

  function handleEvent(evt) {
    subscriptions.forEach((fn) => {
      try { fn(evt) } catch { /* subscriber error, don't crash adapter */ }
    })
  }

  return {
    onNarrativeRequested,
    onNarrativeCompleted,
    submitHostCompletion,
    submitAcceptedRuntimePatch,
    handleEvent
  }
}
