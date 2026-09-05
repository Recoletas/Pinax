import Database from 'better-sqlite3'
import { Buffer } from 'node:buffer'
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { CAPABILITIES_BY_ROLE, COLLABORATION_LIMITS, MEMBER_ROLES, ROOM_KINDS } from '../../../shared/collaboration/constants.js'
import { acceptedAck, validateStableLocator } from '../../../shared/collaboration/contracts.js'
import { emptyCollaborationSnapshot, materializeCollaborationEvent } from '../../realtime/v2/materializer.js'
import { CollaborationRepository } from './CollaborationRepository.js'
import { migrateCollaborationDatabase } from './sqliteMigrations.js'

const json = value => JSON.stringify(value)
const parse = value => JSON.parse(value)
const iso = value => new Date(value).toISOString()

export class SqliteCollaborationRepository extends CollaborationRepository {
  constructor ({ filename = null, db = null, ephemeral = false, clock = () => Date.now(), randomToken = bytes => randomBytes(bytes).toString('base64url'), randomId = prefix => `${prefix}_${randomUUID()}`, secretPepper = null } = {}) {
    super()
    if (!secretPepper) throw new Error('collaboration-secret-pepper-required')
    if (!db && !filename && !ephemeral) throw new Error('collaboration-database-required')
    if (ephemeral && (db || filename)) throw new Error('collaboration-ephemeral-conflict')
    this.db = db || new Database(ephemeral ? ':memory:' : filename)
    this.ownsDatabase = !db
    this.clock = clock
    this.randomToken = randomToken
    this.randomId = randomId
    this.secretPepper = secretPepper
    try { migrateCollaborationDatabase(this.db, this.clock()) } catch (error) {
      if (this.ownsDatabase) this.db.close()
      throw error
    }
    this.appendTransaction = this.db.transaction(input => this.#appendAcceptedEvent(input))
    this.createRoomTransaction = this.db.transaction(input => this.#createRoom(input))
    this.joinTransaction = this.db.transaction(input => this.#joinWithInvite(input))
    this.resumeTransaction = this.db.transaction(input => this.#resumeMember(input))
    this.disconnectTransaction = this.db.transaction(input => this.#disconnectMember(input))
    this.reconcileTransaction = this.db.transaction(roomId => this.#reconcileLeases(roomId))
    this.deleteTransaction = this.db.transaction((roomId, reason) => this.#deleteRoom(roomId, reason))
    this.purgeContentTransaction = this.db.transaction(roomId => this.#purgeExpiredContent(roomId))
    this.revokeInviteTransaction = this.db.transaction((roomId, inviteId) => this.#revokeInvite(roomId, inviteId))
  }

  #hash (purpose, roomId, secret) {
    return createHash('sha256').update(`${this.secretPepper}\0${purpose}\0${roomId}\0${secret}`).digest('hex')
  }

  #sameHash (expected, actual) {
    const a = Buffer.from(String(expected || ''), 'hex')
    const b = Buffer.from(String(actual || ''), 'hex')
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
  }

  #derivedResumeToken (roomId, memberId, tokenVersion) { return createHmac('sha256', this.secretPepper).update(`resume-token\0${roomId}\0${memberId}\0${tokenVersion}`).digest('base64url') }

  #rowRoom (row) {
    if (!row) return null
    return {
      roomId: row.room_id, roomSlug: row.room_slug, roomKind: row.room_kind, status: row.status,
      hostId: row.host_id, hostEpoch: row.host_epoch, manifestFingerprint: row.manifest_fingerprint,
      shareSessionId: row.share_session_id, encryptionPolicy: row.encryption_policy, targetAllowlist: parse(row.target_allowlist_json),
      createdAt: iso(row.created_at), expiresAt: iso(row.expires_at), quota: parse(row.quota_json)
    }
  }

  #event (row) {
    return {
      id: row.event_id, roomId: row.room_id, seq: row.seq, type: row.type, actorId: row.actor_id,
      actorDisplayName: row.actor_display_name, commandId: row.command_id, payload: parse(row.payload_json), createdAt: iso(row.created_at)
    }
  }

  #retainedPayloadBytes (roomId) {
    return this.db.prepare('SELECT payload_json FROM collaboration_events WHERE room_id = ?').all(roomId)
      .reduce((total, row) => total + Buffer.byteLength(row.payload_json), 0)
  }

  #insertEvent (roomId, { type, actorId = 'system', actorDisplayName = 'system', commandId = null, payload = {} }, snapshot, now) {
    const seq = snapshot.lastSeq + 1
    const event = { id: this.randomId('evt'), roomId, seq, type, actorId, actorDisplayName, commandId, payload, createdAt: iso(now) }
    const next = materializeCollaborationEvent(snapshot, event)
    this.db.prepare(`INSERT INTO collaboration_events(room_id, seq, event_id, type, actor_id, actor_display_name, command_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(roomId, seq, event.id, type, actorId, actorDisplayName, commandId, json(payload), now)
    this.db.prepare(`INSERT INTO collaboration_snapshots(room_id, last_seq, snapshot_json, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(room_id) DO UPDATE SET last_seq=excluded.last_seq, snapshot_json=excluded.snapshot_json, updated_at=excluded.updated_at`).run(roomId, seq, json(next), now)
    this.db.prepare('UPDATE collaboration_retention SET retained_bytes = retained_bytes + ?, updated_at = ? WHERE room_id = ?').run(Buffer.byteLength(json(payload)), now, roomId)
    return { event, snapshot: next }
  }

  createRoom (input) { return this.createRoomTransaction(input) }

  #createRoom ({ roomId = this.randomId('room'), roomSlug, roomKind = 'experience', hostDisplayName, manifestFingerprint = null, shareSessionId = null, encryptionPolicy = roomKind === 'experience' ? 'none' : 'aes-256-gcm', targetAllowlist = null, ttlMs = COLLABORATION_LIMITS.defaultRoomTtlMs, quota = {} }) {
    const now = this.clock()
    if (typeof roomId !== 'string' || !/^[A-Za-z0-9:_-]{3,160}$/.test(roomId)) throw new Error('invalid-room-id')
    if (!ROOM_KINDS.includes(roomKind)) throw new Error('invalid-room-kind')
    if (typeof roomSlug !== 'string' || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(roomSlug)) throw new Error('invalid-room-slug')
    if (typeof hostDisplayName !== 'string' || !hostDisplayName.trim() || hostDisplayName.length > 80) throw new Error('invalid-display-name')
    if (roomKind !== 'experience' && (!manifestFingerprint || !shareSessionId)) throw new Error('share-identity-required')
    if ((manifestFingerprint != null && (typeof manifestFingerprint !== 'string' || manifestFingerprint.length > 160)) || (shareSessionId != null && (typeof shareSessionId !== 'string' || shareSessionId.length > 160))) throw new Error('invalid-share-identity')
    if ((roomKind === 'experience' && encryptionPolicy !== 'none') || (roomKind !== 'experience' && encryptionPolicy !== 'aes-256-gcm')) throw new Error('invalid-encryption-policy')
    if (roomKind === 'experience') {
      manifestFingerprint ||= `experience:${roomId}`
      shareSessionId ||= `experience:${roomId}`
      targetAllowlist ||= [{ artifactId: 'experience-runtime', artifactRevision: 1 }]
    }
    if (!Array.isArray(targetAllowlist) || !targetAllowlist.length || targetAllowlist.length > 64 || targetAllowlist.some(target => !validateStableLocator(target).valid)) throw new Error('invalid-target-allowlist')
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 30 * 24 * 60 * 60 * 1000) throw new Error('invalid-room-ttl')
    const hostId = this.randomId('member')
    const resumeToken = this.randomToken(32)
    const expiresAt = now + Math.max(1_000, ttlMs)
    const artifactExpiresAt = Math.min(expiresAt, now + COLLABORATION_LIMITS.defaultArtifactTtlMs)
    const commentExpiresAt = Math.min(expiresAt, now + COLLABORATION_LIMITS.defaultCommentTtlMs)
    if (!quota || typeof quota !== 'object' || Array.isArray(quota)) throw new Error('invalid-room-quota')
    const resolvedQuota = {
      members: quota.members ?? COLLABORATION_LIMITS.maxMembersPerRoom,
      events: quota.events ?? COLLABORATION_LIMITS.maxEventsPerRoom,
      bytes: quota.bytes ?? 8 * 1024 * 1024
    }
    if (![resolvedQuota.members, resolvedQuota.events, resolvedQuota.bytes].every(Number.isSafeInteger)
      || resolvedQuota.members < 1 || resolvedQuota.members > 100 || resolvedQuota.events < 4 || resolvedQuota.events > 100_000
      || resolvedQuota.bytes < 1024 || resolvedQuota.bytes > 256 * 1024 * 1024) throw new Error('invalid-room-quota')
    this.db.prepare(`INSERT INTO collaboration_rooms(room_id, room_slug, room_kind, status, host_id, host_epoch, manifest_fingerprint, share_session_id, created_at, expires_at, quota_json, encryption_policy, target_allowlist_json)
      VALUES (?, ?, ?, 'active', ?, 1, ?, ?, ?, ?, ?, ?, ?)`).run(roomId, roomSlug, roomKind, hostId, manifestFingerprint, shareSessionId, now, expiresAt, json(resolvedQuota), encryptionPolicy, json(targetAllowlist))
    this.db.prepare(`INSERT INTO collaboration_retention(room_id, min_retained_seq, artifact_expires_at, comment_expires_at, event_quota, byte_quota, retained_bytes, updated_at)
      VALUES (?, 1, ?, ?, ?, ?, 0, ?)`).run(roomId, artifactExpiresAt, commentExpiresAt, resolvedQuota.events, resolvedQuota.bytes, now)
    this.db.prepare(`INSERT INTO collaboration_members(member_id, room_id, display_name, role, resume_hash, token_version, joined_at, connected_at, lease_expires_at)
      VALUES (?, ?, ?, 'host', ?, 1, ?, ?, ?)`).run(hostId, roomId, hostDisplayName, this.#hash('resume', roomId, resumeToken), now, now, now + COLLABORATION_LIMITS.resumeTokenTtlMs)
    let snapshot = emptyCollaborationSnapshot({
      roomId, roomSlug, roomKind, hostId, hostEpoch: 1, manifestFingerprint, shareSessionId,
      encryptionPolicy, targetAllowlist, expiresAt: iso(expiresAt),
      retention: { artifactExpiresAt: iso(artifactExpiresAt), commentExpiresAt: iso(commentExpiresAt) }
    })
    snapshot = this.#insertEvent(roomId, { type: 'room.created', payload: { ...snapshot.room, retention: snapshot.retention } }, snapshot, now).snapshot
    snapshot = this.#insertEvent(roomId, { type: 'member.joined', actorId: hostId, actorDisplayName: hostDisplayName, payload: { memberId: hostId, displayName: hostDisplayName, role: 'host', capabilities: CAPABILITIES_BY_ROLE.host, joinedAt: iso(now), leaseExpiresAt: iso(now + COLLABORATION_LIMITS.resumeTokenTtlMs) } }, snapshot, now).snapshot
    return { room: this.getRoom(roomId), host: { memberId: hostId, displayName: hostDisplayName, role: 'host', resumeToken }, snapshot }
  }

  getRoom (roomId) { return this.#rowRoom(this.db.prepare('SELECT * FROM collaboration_rooms WHERE room_id = ?').get(roomId)) }
  getRoomBySlug (roomSlug) { return this.#rowRoom(this.db.prepare('SELECT * FROM collaboration_rooms WHERE room_slug = ?').get(roomSlug)) }
  getRetentionPolicy (roomId) {
    const row = this.db.prepare('SELECT artifact_expires_at, comment_expires_at, artifact_purged_at, comment_purged_at FROM collaboration_retention WHERE room_id = ?').get(roomId)
    return row && {
      artifactExpiresAt: iso(row.artifact_expires_at),
      commentExpiresAt: iso(row.comment_expires_at),
      artifactsPurgedAt: row.artifact_purged_at ? iso(row.artifact_purged_at) : null,
      commentsPurgedAt: row.comment_purged_at ? iso(row.comment_purged_at) : null
    }
  }
  countActiveRooms () { return this.db.prepare("SELECT COUNT(*) AS count FROM collaboration_rooms WHERE status = 'active' AND expires_at > ?").get(this.clock()).count }

  isMemberActive (roomId, memberId) {
    const now = this.clock()
    const room = this.db.prepare("SELECT status, expires_at FROM collaboration_rooms WHERE room_id = ?").get(roomId)
    if (!room || room.status !== 'active' || room.expires_at <= now) return false
    const member = this.db.prepare(`SELECT member_id, role, invite_id, left_at, lease_expires_at
      FROM collaboration_members WHERE room_id = ? AND member_id = ?`).get(roomId, memberId)
    if (!member || member.left_at || member.lease_expires_at <= now) return false
    if (!member.invite_id) return member.role === 'host'
    const invite = this.db.prepare('SELECT revoked_at, expires_at FROM collaboration_invites WHERE room_id = ? AND invite_id = ?').get(roomId, member.invite_id)
    return Boolean(invite && !invite.revoked_at && invite.expires_at > now)
  }

  #activeRoom (roomId) {
    const room = this.getRoom(roomId)
    if (!room) return { room: null, code: 'not-found' }
    return room.status === 'active' && Date.parse(room.expiresAt) > this.clock() ? { room, code: null } : { room, code: 'expired' }
  }

  createInvite (roomId, { role = 'reviewer', ttlMs = COLLABORATION_LIMITS.defaultInviteTtlMs, maxUses = 20 } = {}) {
    const room = this.getRoom(roomId)
    if (!room) throw new Error('room-not-found')
    if (room.status !== 'active' || Date.parse(room.expiresAt) <= this.clock()) throw new Error('room-expired')
    if (!MEMBER_ROLES.includes(role) || role === 'host' || role === 'editor') throw new Error('invalid-invite-role')
    if (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 100) throw new Error('invalid-invite-max-uses')
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 7 * 24 * 60 * 60 * 1000) throw new Error('invalid-invite-ttl')
    const now = this.clock()
    const inviteId = this.randomId('invite')
    const inviteSecret = this.randomToken(32)
    this.db.prepare(`INSERT INTO collaboration_invites(invite_id, room_id, secret_hash, role, created_at, expires_at, max_uses)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(inviteId, roomId, this.#hash('invite', roomId, inviteSecret), role, now, now + ttlMs, maxUses)
    return { inviteId, inviteSecret, expiresAt: iso(now + ttlMs), role }
  }

  revokeInvite (roomId, inviteId) { return this.revokeInviteTransaction(roomId, inviteId) }

  #revokeInvite (roomId, inviteId) {
    const now = this.clock()
    const access = this.#activeRoom(roomId)
    if (access.code) return { revoked: false, code: access.code, invalidatedMemberIds: [] }
    const changed = this.db.prepare('UPDATE collaboration_invites SET revoked_at = ? WHERE room_id = ? AND invite_id = ? AND revoked_at IS NULL').run(now, roomId, inviteId).changes
    if (!changed) return { revoked: false, invalidatedMemberIds: [] }
    let snapshot = this.#rawSnapshot(roomId)
    const initialSeq = snapshot.lastSeq
    const members = this.db.prepare('SELECT * FROM collaboration_members WHERE room_id = ? AND invite_id = ? AND left_at IS NULL').all(roomId, inviteId)
    for (const member of members) {
      this.db.prepare('UPDATE collaboration_members SET left_at = ?, lease_expires_at = ? WHERE member_id = ?').run(now, now, member.member_id)
      snapshot = this.#insertEvent(roomId, { type: 'member.left', actorId: member.member_id, actorDisplayName: member.display_name, payload: { memberId: member.member_id, reason: 'invite-revoked' } }, snapshot, now).snapshot
    }
    if (members.some(member => member.member_id === access.room.hostId)) {
      snapshot = this.#staleHostOwnedWork(roomId, snapshot, now)
      const successor = this.db.prepare(`SELECT * FROM collaboration_members WHERE room_id = ? AND left_at IS NULL AND disconnected_at IS NULL
        ORDER BY joined_at ASC, member_id ASC`).all(roomId).find(candidate => this.isMemberActive(roomId, candidate.member_id))
      const hostEpoch = access.room.hostEpoch + 1
      this.db.prepare("UPDATE collaboration_members SET role = CASE WHEN member_id = ? THEN 'host' WHEN role = 'host' THEN 'reviewer' ELSE role END WHERE room_id = ?").run(successor?.member_id || '', roomId)
      this.db.prepare('UPDATE collaboration_rooms SET host_id = ?, host_epoch = ? WHERE room_id = ?').run(successor?.member_id || null, hostEpoch, roomId)
      snapshot = this.#insertEvent(roomId, { type: 'room.host.changed', payload: { hostId: successor?.member_id || null, hostEpoch } }, snapshot, now).snapshot
    }
    const invalidatedMemberIds = members.map(member => member.member_id)
    const events = snapshot.lastSeq > initialSeq ? this.getEvents(roomId, initialSeq + 1) : []
    return { revoked: true, invalidatedMemberIds, events, snapshot }
  }

  joinWithInvite (input) { return this.joinTransaction(input) }

  joinExperienceCompatibility ({ roomSlug, displayName }) {
    let room = this.getRoomBySlug(roomSlug)
    if (!room) {
      const created = this.createRoom({ roomSlug, roomKind: 'experience', hostDisplayName: displayName })
      return { ok: true, room: created.room, member: created.host, resumeToken: created.host.resumeToken, event: null, snapshot: created.snapshot }
    }
    if (room.roomKind !== 'experience') return { ok: false, code: 'invite-invalid' }
    const invite = this.createInvite(room.roomId, { role: 'reviewer', maxUses: 1 })
    return this.joinWithInvite({ roomSlug, inviteId: invite.inviteId, inviteSecret: invite.inviteSecret, displayName })
  }

  #joinWithInvite ({ roomSlug, inviteId, inviteSecret, displayName }) {
    const now = this.clock()
    const room = this.getRoomBySlug(roomSlug)
    if (typeof displayName !== 'string' || !displayName.trim() || displayName.length > 80) return { ok: false, code: 'invalid-payload' }
    if (!room || room.status !== 'active' || Date.parse(room.expiresAt) <= now) return { ok: false, code: 'expired' }
    const invite = this.db.prepare('SELECT * FROM collaboration_invites WHERE room_id = ? AND invite_id = ?').get(room.roomId, inviteId)
    if (!invite) return { ok: false, code: 'invite-invalid' }
    if (invite.revoked_at) return { ok: false, code: 'invite-revoked' }
    if (invite.expires_at <= now || invite.uses >= invite.max_uses) return { ok: false, code: 'invite-expired' }
    if (!this.#sameHash(invite.secret_hash, this.#hash('invite', room.roomId, inviteSecret))) return { ok: false, code: 'invite-invalid' }
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM collaboration_members WHERE room_id = ? AND left_at IS NULL').get(room.roomId).count
    if (count >= room.quota.members) return { ok: false, code: 'quota-exceeded' }
    const memberId = this.randomId('member')
    const resumeToken = this.randomToken(32)
    const leaseExpiresAt = now + COLLABORATION_LIMITS.resumeTokenTtlMs
    this.db.prepare(`INSERT INTO collaboration_members(member_id, room_id, display_name, role, resume_hash, token_version, joined_at, connected_at, lease_expires_at, invite_id)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`).run(memberId, room.roomId, String(displayName).slice(0, 80), invite.role, this.#hash('resume', room.roomId, resumeToken), now, now, leaseExpiresAt, inviteId)
    this.db.prepare('UPDATE collaboration_invites SET uses = uses + 1 WHERE invite_id = ?').run(inviteId)
    const snapshot = this.getSnapshot(room.roomId)
    let appended = this.#insertEvent(room.roomId, { type: 'member.joined', actorId: memberId, actorDisplayName: displayName, payload: { memberId, displayName: String(displayName).slice(0, 80), role: invite.role, capabilities: CAPABILITIES_BY_ROLE[invite.role], joinedAt: iso(now), leaseExpiresAt: iso(leaseExpiresAt) } }, snapshot, now)
    let role = invite.role
    if (!room.hostId) {
      appended = { ...appended, snapshot: this.#staleHostOwnedWork(room.roomId, appended.snapshot, now) }
      role = 'host'
      const hostEpoch = room.hostEpoch + 1
      this.db.prepare("UPDATE collaboration_members SET role = 'host' WHERE member_id = ?").run(memberId)
      this.db.prepare('UPDATE collaboration_rooms SET host_id = ?, host_epoch = ? WHERE room_id = ?').run(memberId, hostEpoch, room.roomId)
      appended = this.#insertEvent(room.roomId, { type: 'room.host.changed', payload: { hostId: memberId, hostEpoch } }, appended.snapshot, now)
    }
    return { ok: true, room: this.getRoom(room.roomId), member: { memberId, displayName, role }, resumeToken, event: appended.event, snapshot: appended.snapshot }
  }

  resumeMember (input) { return this.resumeTransaction(input) }

  authenticateMember ({ roomId, memberId, resumeToken, requiredRole = null }) {
    const member = this.db.prepare('SELECT * FROM collaboration_members WHERE room_id = ? AND member_id = ?').get(roomId, memberId)
    if (!member || !this.isMemberActive(roomId, memberId)) return false
    if (requiredRole && member.role !== requiredRole) return false
    return this.#sameHash(member.resume_hash, this.#hash('resume', roomId, resumeToken))
  }

  #resumeMember ({ roomId, memberId, resumeToken }) {
    const now = this.clock()
    const room = this.getRoom(roomId)
    if (!room || room.status !== 'active' || Date.parse(room.expiresAt) <= now) return { ok: false, code: 'expired' }
    const member = this.db.prepare('SELECT * FROM collaboration_members WHERE room_id = ? AND member_id = ?').get(roomId, memberId)
    if (!member || member.left_at || member.lease_expires_at <= now) return { ok: false, code: 'resume-invalid' }
    if (!this.isMemberActive(roomId, memberId)) return { ok: false, code: 'resume-invalid' }
    const candidateHash = this.#hash('resume', roomId, resumeToken)
    if (member.previous_resume_hash && this.#sameHash(member.previous_resume_hash, candidateHash)) {
      if (!member.previous_resume_expires_at || member.previous_resume_expires_at <= now || member.previous_resume_replayed_at) return { ok: false, code: 'resume-invalid' }
      const leaseExpiresAt = member.lease_expires_at
      this.db.prepare('UPDATE collaboration_members SET connected_at = ?, disconnected_at = NULL, previous_resume_replayed_at = ? WHERE room_id = ? AND member_id = ?').run(now, now, roomId, memberId)
      let snapshot = this.#rawSnapshot(roomId); let event = null
      if (member.disconnected_at) {
        const appended = this.#insertEvent(roomId, { type: 'member.resumed', actorId: memberId, actorDisplayName: member.display_name, payload: { memberId, displayName: member.display_name, role: member.role, capabilities: CAPABILITIES_BY_ROLE[member.role], leaseExpiresAt: iso(leaseExpiresAt) } }, snapshot, now)
        snapshot = appended.snapshot; event = appended.event
      }
      return { ok: true, member: { memberId, displayName: member.display_name, role: member.role }, resumeToken: this.#derivedResumeToken(roomId, memberId, member.token_version), event, snapshot, replayed: true }
    }
    if (!this.#sameHash(member.resume_hash, candidateHash)) return { ok: false, code: 'resume-invalid' }
    const nextVersion = member.token_version + 1
    const nextToken = this.#derivedResumeToken(roomId, memberId, nextVersion)
    const leaseExpiresAt = now + COLLABORATION_LIMITS.resumeTokenTtlMs
    this.db.prepare(`UPDATE collaboration_members SET previous_resume_hash = resume_hash, previous_resume_expires_at = ?, previous_resume_replayed_at = NULL,
      resume_hash = ?, token_version = ?, connected_at = ?, disconnected_at = NULL, lease_expires_at = ? WHERE room_id = ? AND member_id = ?`)
      .run(now + COLLABORATION_LIMITS.previousResumeReplayTtlMs, this.#hash('resume', roomId, nextToken), nextVersion, now, leaseExpiresAt, roomId, memberId)
    const snapshot = this.#rawSnapshot(roomId)
    const appended = this.#insertEvent(roomId, { type: 'member.resumed', actorId: memberId, actorDisplayName: member.display_name, payload: { memberId, displayName: member.display_name, role: member.role, capabilities: CAPABILITIES_BY_ROLE[member.role], leaseExpiresAt: iso(leaseExpiresAt) } }, snapshot, now)
    return { ok: true, member: { memberId, displayName: member.display_name, role: member.role }, resumeToken: nextToken, event: appended.event, snapshot: appended.snapshot }
  }

  disconnectMember (input) { return this.disconnectTransaction(input) }

  renewMemberLease (roomId, memberId) {
    const now = this.clock()
    if (!this.isMemberActive(roomId, memberId)) return false
    return this.db.prepare(`UPDATE collaboration_members SET connected_at = ?, disconnected_at = NULL, lease_expires_at = ?
      WHERE room_id = ? AND member_id = ? AND left_at IS NULL`).run(now, now + COLLABORATION_LIMITS.resumeTokenTtlMs, roomId, memberId).changes === 1
  }

  #disconnectMember ({ roomId, memberId }) {
    const now = this.clock()
    if (this.#activeRoom(roomId).code) return null
    const member = this.db.prepare('SELECT * FROM collaboration_members WHERE room_id = ? AND member_id = ?').get(roomId, memberId)
    if (!member || member.left_at) return null
    const graceUntil = now + COLLABORATION_LIMITS.disconnectGraceMs
    this.db.prepare('UPDATE collaboration_members SET disconnected_at = ?, lease_expires_at = MIN(lease_expires_at, ?) WHERE room_id = ? AND member_id = ?').run(now, graceUntil, roomId, memberId)
    return this.#insertEvent(roomId, { type: 'member.disconnected', actorId: memberId, actorDisplayName: member.display_name, payload: { memberId, leaseExpiresAt: iso(graceUntil) } }, this.#rawSnapshot(roomId), now)
  }

  reconcileLeases (roomId) { return this.reconcileTransaction(roomId) }

  #staleHostOwnedWork (roomId, initialSnapshot, now) {
    let snapshot = initialSnapshot
    for (const request of Object.values(snapshot.generation.requests).filter(request => request.status === 'requested')) {
      snapshot = this.#insertEvent(roomId, { type: 'generation.stale', payload: { requestId: request.requestId, code: 'host-lost' } }, snapshot, now).snapshot
    }
    for (const promotion of Object.values(snapshot.promotions).filter(item => item.status === 'requested')) {
      snapshot = this.#insertEvent(roomId, {
        type: 'promotion.status.changed',
        payload: {
          proposalId: promotion.proposalId,
          artifactFingerprint: promotion.artifactFingerprint,
          status: 'stale',
          receipt: { code: 'stale-revision' },
          hostEpoch: promotion.hostEpoch
        }
      }, snapshot, now).snapshot
    }
    return snapshot
  }

  #reconcileLeases (roomId) {
    const now = this.clock()
    const room = this.getRoom(roomId)
    if (!room) return null
    if (room.status !== 'active' || Date.parse(room.expiresAt) <= now) return { status: 'expired' }
    let snapshot = this.#rawSnapshot(roomId)
    const initialSeq = snapshot.lastSeq
    const expired = this.db.prepare(`SELECT m.* FROM collaboration_members m
      LEFT JOIN collaboration_invites i ON i.room_id = m.room_id AND i.invite_id = m.invite_id
      WHERE m.room_id = ? AND m.left_at IS NULL AND (
        m.lease_expires_at <= ? OR
        (m.invite_id IS NOT NULL AND (i.invite_id IS NULL OR i.revoked_at IS NOT NULL OR i.expires_at <= ?))
      ) ORDER BY m.joined_at, m.member_id`).all(roomId, now, now)
    for (const member of expired) {
      this.db.prepare('UPDATE collaboration_members SET left_at = ? WHERE member_id = ?').run(now, member.member_id)
      snapshot = this.#insertEvent(roomId, { type: 'member.left', actorId: member.member_id, actorDisplayName: member.display_name, payload: { memberId: member.member_id } }, snapshot, now).snapshot
    }
    const hostExpired = expired.some(member => member.member_id === room.hostId)
    if (hostExpired) {
      snapshot = this.#staleHostOwnedWork(roomId, snapshot, now)
      const successor = this.db.prepare(`SELECT * FROM collaboration_members WHERE room_id = ? AND left_at IS NULL AND disconnected_at IS NULL
        ORDER BY joined_at ASC, member_id ASC`).all(roomId).find(candidate => this.isMemberActive(roomId, candidate.member_id))
      const hostEpoch = room.hostEpoch + 1
      this.db.prepare('UPDATE collaboration_rooms SET host_id = ?, host_epoch = ? WHERE room_id = ?').run(successor?.member_id || null, hostEpoch, roomId)
      if (successor) this.db.prepare("UPDATE collaboration_members SET role = CASE WHEN member_id = ? THEN 'host' WHEN role = 'host' THEN 'reviewer' ELSE role END WHERE room_id = ?").run(successor.member_id, roomId)
      snapshot = this.#insertEvent(roomId, { type: 'room.host.changed', payload: { hostId: successor?.member_id || null, hostEpoch } }, snapshot, now).snapshot
    } else if (!room.hostId) {
      const successor = this.db.prepare(`SELECT * FROM collaboration_members WHERE room_id = ? AND left_at IS NULL AND disconnected_at IS NULL
        ORDER BY joined_at ASC, member_id ASC`).all(roomId).find(candidate => this.isMemberActive(roomId, candidate.member_id))
      if (successor) {
        snapshot = this.#staleHostOwnedWork(roomId, snapshot, now)
        const hostEpoch = room.hostEpoch + 1
        this.db.prepare("UPDATE collaboration_members SET role = 'host' WHERE member_id = ?").run(successor.member_id)
        this.db.prepare('UPDATE collaboration_rooms SET host_id = ?, host_epoch = ? WHERE room_id = ?').run(successor.member_id, hostEpoch, roomId)
        snapshot = this.#insertEvent(roomId, { type: 'room.host.changed', payload: { hostId: successor.member_id, hostEpoch } }, snapshot, now).snapshot
      }
    }
    const expiredMemberIds = expired.map(member => member.member_id)
    return { expiredMemberIds, hostId: snapshot.room.hostId, hostEpoch: snapshot.room.hostEpoch, snapshot, events: this.getEvents(roomId, initialSeq + 1) }
  }

  getMember (roomId, memberId) {
    const row = this.db.prepare('SELECT * FROM collaboration_members WHERE room_id = ? AND member_id = ?').get(roomId, memberId)
    return row && { memberId: row.member_id, displayName: row.display_name, role: row.role, joinedAt: iso(row.joined_at), disconnectedAt: row.disconnected_at ? iso(row.disconnected_at) : null, leaseExpiresAt: iso(row.lease_expires_at), leftAt: row.left_at ? iso(row.left_at) : null }
  }

  #rawSnapshot (roomId) {
    const row = this.db.prepare('SELECT snapshot_json FROM collaboration_snapshots WHERE room_id = ?').get(roomId)
    return row ? parse(row.snapshot_json) : null
  }

  getSnapshot (roomId) {
    const room = this.getRoom(roomId)
    if (!room) return null
    if (room.status !== 'active' || Date.parse(room.expiresAt) <= this.clock()) return { status: 'expired' }
    return this.#rawSnapshot(roomId)
  }

  appendAcceptedEvent (input) { return this.appendTransaction(input) }

  #appendAcceptedEvent ({ roomId, commandId, requestFingerprint, nonceDigests = [], actorId, actorDisplayName, type, payload, guard = null }) {
    const now = this.clock()
    const room = this.getRoom(roomId)
    if (!room || room.status !== 'active' || Date.parse(room.expiresAt) <= now) return { rejected: 'expired' }
    const duplicate = this.db.prepare('SELECT ack_json, request_fingerprint FROM collaboration_idempotency WHERE room_id = ? AND command_id = ?').get(roomId, commandId)
    if (duplicate) return duplicate.request_fingerprint === requestFingerprint
      ? { ack: { ...parse(duplicate.ack_json), duplicate: true }, event: null, snapshot: this.#rawSnapshot(roomId) }
      : { rejected: 'conflict' }
    const retention = this.db.prepare('SELECT * FROM collaboration_retention WHERE room_id = ?').get(roomId)
    const snapshot = this.#rawSnapshot(roomId)
    if (snapshot.lastSeq >= retention.event_quota) return { rejected: 'quota-exceeded' }
    if (retention.retained_bytes + Buffer.byteLength(json(payload)) > retention.byte_quota) return { rejected: 'quota-exceeded' }
    const rejection = guard?.(snapshot, room)
    if (rejection) return { rejected: rejection }
    for (const nonceDigest of nonceDigests) {
      const used = this.db.prepare('SELECT 1 FROM collaboration_nonces WHERE room_id = ? AND share_session_id = ? AND nonce_digest = ?').get(roomId, room.shareSessionId, nonceDigest)
      if (used) return { rejected: 'nonce-reused' }
    }
    const reserveNonce = this.db.prepare('INSERT INTO collaboration_nonces(room_id, share_session_id, nonce_digest, command_id, created_at) VALUES (?, ?, ?, ?, ?)')
    for (const nonceDigest of nonceDigests) reserveNonce.run(roomId, room.shareSessionId, nonceDigest, commandId, now)
    const appended = this.#insertEvent(roomId, { type, actorId, actorDisplayName, commandId, payload }, snapshot, now)
    const ack = acceptedAck({ commandId, roomId, seq: appended.event.seq })
    this.db.prepare('INSERT INTO collaboration_idempotency(room_id, command_id, ack_json, created_at, expires_at, request_fingerprint) VALUES (?, ?, ?, ?, ?, ?)').run(roomId, commandId, json(ack), now, now + COLLABORATION_LIMITS.idempotencyTtlMs, requestFingerprint)
    return { ack, ...appended }
  }

  getEvents (roomId, fromSeq = 1) {
    const room = this.getRoom(roomId)
    if (!room) return []
    if (room.status !== 'active' || Date.parse(room.expiresAt) <= this.clock()) return { status: 'expired', events: [] }
    return this.db.prepare('SELECT * FROM collaboration_events WHERE room_id = ? AND seq >= ? ORDER BY seq').all(roomId, fromSeq).map(row => this.#event(row))
  }

  getRecovery (roomId, lastSeq = 0) {
    const room = this.getRoom(roomId)
    if (!room) return { status: 'not-found' }
    if (room.status !== 'active' || Date.parse(room.expiresAt) <= this.clock()) return { status: 'expired' }
    const snapshot = this.#rawSnapshot(roomId)
    if (!snapshot) return { status: 'not-found' }
    const retention = this.db.prepare('SELECT min_retained_seq FROM collaboration_retention WHERE room_id = ?').get(roomId)
    if (lastSeq + 1 < retention.min_retained_seq || lastSeq > snapshot.lastSeq) return { status: 'snapshot-required', minRetainedSeq: retention.min_retained_seq, snapshot }
    return { status: 'events', minRetainedSeq: retention.min_retained_seq, lastSeq: snapshot.lastSeq, events: this.getEvents(roomId, lastSeq + 1) }
  }

  pruneEvents (roomId, minRetainedSeq) {
    return this.db.transaction(() => {
      const snapshot = this.#rawSnapshot(roomId)
      if (!snapshot) return null
      const keep = Math.max(1, Math.min(Number(minRetainedSeq) || 1, snapshot.lastSeq + 1))
      const now = this.clock()
      const appended = this.#insertEvent(roomId, { type: 'retention.updated', payload: { minRetainedSeq: keep } }, snapshot, now)
      const removed = this.db.prepare('DELETE FROM collaboration_events WHERE room_id = ? AND seq < ?').run(roomId, keep).changes
      this.db.prepare('UPDATE collaboration_retention SET min_retained_seq = MAX(min_retained_seq, ?), retained_bytes = ?, updated_at = ? WHERE room_id = ?').run(keep, this.#retainedPayloadBytes(roomId), now, roomId)
      return { roomId, minRetainedSeq: keep, removed, event: appended.event, snapshot: appended.snapshot }
    })()
  }

  purgeExpiredContent (roomId) { return this.purgeContentTransaction(roomId) }

  #purgeExpiredContent (roomId) {
    const now = this.clock()
    const retention = this.db.prepare('SELECT * FROM collaboration_retention WHERE room_id = ?').get(roomId)
    if (!retention) return null
    const comments = !retention.comment_purged_at && retention.comment_expires_at <= now
    const artifacts = !retention.artifact_purged_at && retention.artifact_expires_at <= now
    if (!comments && !artifacts) return { roomId, comments: false, artifacts: false, event: null }
    const appended = this.#insertEvent(roomId, { type: 'content.expired', payload: { comments, artifacts } }, this.#rawSnapshot(roomId), now)
    if (comments) {
      const rows = this.db.prepare("SELECT seq, payload_json FROM collaboration_events WHERE room_id = ? AND type = 'chat.message'").all(roomId)
      const update = this.db.prepare('UPDATE collaboration_events SET payload_json = ? WHERE room_id = ? AND seq = ?')
      for (const row of rows) {
        const payload = parse(row.payload_json)
        update.run(json({ commentId: payload.commentId, body: null, content: null, target: payload.target || null, expired: true }), roomId, row.seq)
      }
    }
    if (artifacts) {
      const proposals = this.db.prepare("SELECT seq, payload_json FROM collaboration_events WHERE room_id = ? AND type = 'proposal.created'").all(roomId)
      const generations = this.db.prepare("SELECT seq, payload_json FROM collaboration_events WHERE room_id = ? AND type = 'generation.completed'").all(roomId)
      const statuses = this.db.prepare("SELECT seq, payload_json FROM collaboration_events WHERE room_id = ? AND type = 'generation.status'").all(roomId)
      const promotionStatuses = this.db.prepare("SELECT seq, payload_json FROM collaboration_events WHERE room_id = ? AND type = 'promotion.status.changed'").all(roomId)
      const publishedArtifacts = this.db.prepare("SELECT seq, payload_json FROM collaboration_events WHERE room_id = ? AND type = 'artifact.published'").all(roomId)
      const update = this.db.prepare('UPDATE collaboration_events SET payload_json = ? WHERE room_id = ? AND seq = ?')
      for (const row of proposals) {
        const payload = parse(row.payload_json)
        update.run(json({ proposal: { ...payload.proposal, body: null, replacementText: null, content: null, contentExpiredAt: iso(now) } }), roomId, row.seq)
      }
      for (const row of generations) {
        const payload = parse(row.payload_json)
        update.run(json({ ...payload, artifact: null, content: null, assistantMessage: null, contentExpiredAt: iso(now) }), roomId, row.seq)
      }
      for (const row of statuses) {
        const payload = parse(row.payload_json)
        update.run(json({ ...payload, message: null, contentExpiredAt: iso(now) }), roomId, row.seq)
      }
      for (const row of promotionStatuses) {
        const payload = parse(row.payload_json)
        update.run(json({
          proposalId: payload.proposalId,
          artifactFingerprint: payload.artifactFingerprint,
          status: payload.status,
          receipt: {
            code: payload.receipt?.code,
            ...(Number.isSafeInteger(payload.receipt?.targetCount) ? { targetCount: payload.receipt.targetCount } : {})
          },
          hostEpoch: payload.hostEpoch,
          contentExpiredAt: iso(now)
        }), roomId, row.seq)
      }
      for (const row of publishedArtifacts) {
        const payload = parse(row.payload_json)
        const artifact = payload.artifact || {}
        update.run(json({
          artifact: {
            schemaVersion: artifact.schemaVersion,
            artifactId: artifact.artifactId,
            kind: artifact.kind,
            authority: artifact.authority,
            fingerprint: artifact.fingerprint,
            baseRevision: artifact.baseRevision,
            expiresAt: artifact.expiresAt || null
          },
          expired: true,
          contentExpiredAt: iso(now)
        }), roomId, row.seq)
      }
      const requests = this.db.prepare("SELECT seq, payload_json FROM collaboration_events WHERE room_id = ? AND type = 'generation.requested'").all(roomId)
      for (const row of requests) {
        const payload = parse(row.payload_json)
        update.run(json({ ...payload, actionText: null, content: null, contentExpiredAt: iso(now) }), roomId, row.seq)
      }
      const runtimePatches = this.db.prepare("SELECT seq, payload_json FROM collaboration_events WHERE room_id = ? AND type = 'experience.runtime.patch.accepted'").all(roomId)
      for (const row of runtimePatches) {
        const payload = parse(row.payload_json)
        update.run(json({ version: payload.version, paths: [], state: null, requestId: payload.requestId, hostEpoch: payload.hostEpoch, contentExpiredAt: iso(now) }), roomId, row.seq)
      }
    }
    this.db.prepare(`UPDATE collaboration_retention SET artifact_purged_at = CASE WHEN ? THEN ? ELSE artifact_purged_at END,
      comment_purged_at = CASE WHEN ? THEN ? ELSE comment_purged_at END, retained_bytes = ?, updated_at = ? WHERE room_id = ?`).run(artifacts ? 1 : 0, now, comments ? 1 : 0, now, this.#retainedPayloadBytes(roomId), now, roomId)
    return { roomId, comments, artifacts, event: appended.event, snapshot: appended.snapshot }
  }

  deleteRoom (roomId, reason = 'explicit') { return this.deleteTransaction(roomId, reason) }

  #deleteRoom (roomId, reason = 'explicit') {
    const now = this.clock()
    const snapshot = this.#rawSnapshot(roomId)
    if (!snapshot) return null
    const eventCount = this.db.prepare('SELECT COUNT(*) AS count FROM collaboration_events WHERE room_id = ?').get(roomId).count
    const safeReason = ['explicit', 'expired', 'quota-exceeded'].includes(reason) ? reason : 'explicit'
    const receipt = { receiptId: this.randomId('deletion'), roomId, reason: safeReason, deletedAt: iso(now), lastSeq: snapshot.lastSeq, eventCount }
    this.db.prepare('INSERT INTO collaboration_deletion_receipts(receipt_id, room_id, reason, deleted_at, last_seq, event_count) VALUES (?, ?, ?, ?, ?, ?)').run(receipt.receiptId, roomId, safeReason, now, snapshot.lastSeq, eventCount)
    this.db.prepare('DELETE FROM collaboration_rooms WHERE room_id = ?').run(roomId)
    return receipt
  }

  expireRooms () {
    const now = this.clock()
    return this.db.prepare("SELECT room_id FROM collaboration_rooms WHERE expires_at <= ? OR status != 'active'").all(now).map(({ room_id: roomId }) => this.deleteRoom(roomId, 'expired'))
  }

  listActiveRoomIds () { return this.db.prepare("SELECT room_id FROM collaboration_rooms WHERE status = 'active' AND expires_at > ? ORDER BY room_id").all(this.clock()).map(row => row.room_id) }

  purgeExpiredIdempotency () { return this.db.prepare('DELETE FROM collaboration_idempotency WHERE expires_at <= ?').run(this.clock()).changes }
  getDeletionReceipt (receiptId) {
    const row = this.db.prepare('SELECT * FROM collaboration_deletion_receipts WHERE receipt_id = ?').get(receiptId)
    return row && { receiptId: row.receipt_id, roomId: row.room_id, reason: row.reason, deletedAt: iso(row.deleted_at), lastSeq: row.last_seq, eventCount: row.event_count }
  }
  close () { if (this.ownsDatabase) this.db.close() }
}
