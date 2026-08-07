export function createExperienceSessionAdapter(onlineRoom) {
  const subscriptions = []
  let requestSequence = 0

  function createRequestId() {
    requestSequence += 1
    return `narrative_${Date.now().toString(36)}_${requestSequence.toString(36)}`
  }

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

  function submitHostStatus(status) {
    if (!onlineRoom.isHost || !onlineRoom.isHost.value) return false
    if (typeof onlineRoom.sendCommand === 'function') {
      onlineRoom.sendCommand('narrative.status', { payload: status })
    }
    return true
  }

  function submitAcceptedRuntimePatch(patch, { requestId = '' } = {}) {
    if (!onlineRoom.isHost || !onlineRoom.isHost.value) return false
    if (typeof onlineRoom.sendCommand === 'function') {
      onlineRoom.sendCommand('runtime.patch.accept', {
        payload: { ...patch, requestId: String(requestId || '').trim() }
      })
    }
    return true
  }

  function requestNarrative(payload, requestId = createRequestId()) {
    if (!onlineRoom.isHost?.value) return false
    const normalizedRequestId = String(requestId || '').trim() || createRequestId()
    onlineRoom.sendCommand?.('narrative.request', {
      payload: { ...payload, requestId: normalizedRequestId }
    })
    return normalizedRequestId
  }

  function onActionSelected(callback) {
    return subscribeTo('action.selected', callback)
  }

  function onRuntimePatchAccepted(callback) {
    return subscribeTo('runtime.patch.accepted', callback)
  }

  function onNarrativeStatus(callback) {
    return subscribeTo('narrative.status', callback)
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
    submitHostStatus,
    submitAcceptedRuntimePatch,
    requestNarrative,
    onActionSelected,
    onNarrativeStatus,
    onRuntimePatchAccepted,
    handleEvent
  }
}
