export function createExperienceSessionAdapter(onlineRoom) {
  const subscriptions = []

  function onNarrativeRequested(callback) {
    const handler = (evt) => {
      if (evt.type === 'narrative.requested') callback(evt.payload, evt)
    }
    const unsub = () => {
      const idx = subscriptions.indexOf(handler)
      if (idx >= 0) subscriptions.splice(idx, 1)
    }
    subscriptions.push(handler)
    if (onlineRoom.events) {
      onlineRoom.events.forEach((evt) => {
        if (evt.type === 'narrative.requested') callback(evt.payload, evt)
      })
    }
    return unsub
  }

  function onNarrativeCompleted(callback) {
    const handler = (evt) => {
      if (evt.type === 'narrative.completed') callback(evt.payload, evt)
    }
    subscriptions.push(handler)
    if (onlineRoom.events) {
      onlineRoom.events.forEach((evt) => {
        if (evt.type === 'narrative.completed') callback(evt.payload, evt)
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
      onlineRoom.sendCommand('narrative.completed', { payload: result })
    }
    return true
  }

  function submitAcceptedRuntimePatch(patch) {
    if (!onlineRoom.isHost || !onlineRoom.isHost.value) return false
    if (typeof onlineRoom.sendCommand === 'function') {
      onlineRoom.sendCommand('runtime.patch.accept', { payload: patch })
    }
    return true
  }

  function requestNarrative(payload) {
    if (!onlineRoom.isHost?.value) return false
    onlineRoom.sendCommand?.('narrative.request', { payload })
    return true
  }

  function onActionSelected(callback) {
    return subscribeTo('action.selected', callback)
  }

  function onRuntimePatchAccepted(callback) {
    return subscribeTo('runtime.patch.accepted', callback)
  }

  function subscribeTo(type, callback) {
    const handler = (evt) => {
      if (evt.type === type) callback(evt.payload, evt)
    }
    subscriptions.push(handler)
    onlineRoom.events?.forEach(handler)
    return () => {
      const idx = subscriptions.indexOf(handler)
      if (idx >= 0) subscriptions.splice(idx, 1)
    }
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
    requestNarrative,
    onActionSelected,
    onRuntimePatchAccepted,
    handleEvent
  }
}
