
import { createRoleplayHistoryAdapter } from '@pinax/core/experience/roleplay/roleplayHistoryAdapter'
const shared = createRoleplayHistoryAdapter({  })
export const { ROLEPLAY_ARCHIVE_REASON, createRoleplayHistoryPort, getRoleplayHistoryPort, installRoleplayHistoryPort, queueRoleplayArchive, drainRoleplayArchiveOutbox, readRoleplayHistorySafely } = shared
