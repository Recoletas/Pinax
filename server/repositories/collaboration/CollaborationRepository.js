/**
 * Persistence boundary for collaboration protocol v2.
 * Implementations must make appendAcceptedEvent atomic across event, idempotency, and snapshot.
 */
export class CollaborationRepository {
  createRoom () { throw new Error('not-implemented') }
  getRoom () { throw new Error('not-implemented') }
  getRetentionPolicy () { throw new Error('not-implemented') }
  createInvite () { throw new Error('not-implemented') }
  revokeInvite () { throw new Error('not-implemented') }
  joinWithInvite () { throw new Error('not-implemented') }
  resumeMember () { throw new Error('not-implemented') }
  renewMemberLease () { throw new Error('not-implemented') }
  disconnectMember () { throw new Error('not-implemented') }
  reconcileLeases () { throw new Error('not-implemented') }
  appendAcceptedEvent () { throw new Error('not-implemented') }
  getRecovery () { throw new Error('not-implemented') }
  pruneEvents () { throw new Error('not-implemented') }
  purgeExpiredContent () { throw new Error('not-implemented') }
  deleteRoom () { throw new Error('not-implemented') }
  expireRooms () { throw new Error('not-implemented') }
  close () {}
}
