export function createCollaborationMaintenanceScheduler ({ repository, timers = globalThis, intervalMs = 5_000, onRoomEvents = null, onMembersInvalidated = null, onRoomsInvalidated = null, onSweepConnections = null } = {}) {
  if (!repository || !Number.isSafeInteger(intervalMs) || intervalMs < 100) throw new TypeError('collaboration-maintenance-config-invalid')
  let timer = null
  const run = () => {
    const roomIds = repository.listActiveRoomIds()
    const roomEvents = []
    for (const roomId of roomIds) {
      const reconciled = repository.reconcileLeases(roomId)
      const purged = repository.purgeExpiredContent(roomId)
      const events = [...(reconciled?.events || []), ...(purged?.event ? [purged.event] : [])]
      if (reconciled?.expiredMemberIds?.length) onMembersInvalidated?.({ roomId, memberIds: reconciled.expiredMemberIds })
      if (events.length) { roomEvents.push({ roomId, events }); onRoomEvents?.(roomId, events) }
    }
    const expired = repository.expireRooms(); const idempotencyRemoved = repository.purgeExpiredIdempotency()
    const expiredRoomIds = expired.filter(Boolean).map(receipt => receipt.roomId)
    if (expiredRoomIds.length) onRoomsInvalidated?.(expiredRoomIds)
    onSweepConnections?.()
    return { roomIds, roomEvents, expired, idempotencyRemoved }
  }
  const start = () => { if (timer == null) timer = timers.setInterval(run, intervalMs); return timer }
  const stop = () => { if (timer != null) timers.clearInterval(timer); timer = null }
  return Object.freeze({ run, start, stop, get running () { return timer != null } })
}
