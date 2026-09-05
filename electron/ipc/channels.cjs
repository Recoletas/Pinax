const DESKTOP_CHANNELS = Object.freeze({
  PROJECT_CHOOSE_DIRECTORY: 'pinax:project:choose-directory',
  PROJECT_CREATE: 'pinax:project:create',
  PROJECT_OPEN: 'pinax:project:open',
  PROJECT_GET_ACTIVE: 'pinax:project:get-active',
  PROJECT_LIST_TEXT: 'pinax:project:list-text',
  PROJECT_READ_TEXT: 'pinax:project:read-text',
  PROJECT_WRITE_TEXT: 'pinax:project:write-text',
  PROJECT_CHECK_INTEGRITY: 'pinax:project:check-integrity',
  PROJECT_CREATE_BACKUP: 'pinax:project:create-backup',
  PROJECT_CLOSE: 'pinax:project:close',
  MIGRATION_CHOOSE_BUNDLE: 'pinax:migration:choose-bundle',
  MIGRATION_CHOOSE_DESTINATION: 'pinax:migration:choose-destination',
  MIGRATION_DRY_RUN: 'pinax:migration:dry-run',
  MIGRATION_IMPORT: 'pinax:migration:import',
  MIGRATION_CANCEL: 'pinax:migration:cancel',
  CACHE_GET_USAGE: 'pinax:cache:get-usage',
  CACHE_SET_LIMIT: 'pinax:cache:set-limit',
  CACHE_PRUNE: 'pinax:cache:prune',
  COLLABORATION_GET_PUBLIC_CONFIG: 'pinax:collaboration:get-public-config'
})

module.exports = { DESKTOP_CHANNELS }
