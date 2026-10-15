// The application assembles UI loaders. The resource registry stays independent
// of pages, repositories and components so it can also be used by contracts.
export const builtinWorkspaceRenderers = Object.freeze({
  home: () => import('../../views/AuthoringWelcomeView.vue'),
  extensions: () => import('./WorkspaceExtensionsView.vue'),
  sources: () => import('./WorkspaceSourcesView.vue'),
  settings: () => import('./WorkspaceSettingsView.vue'),
  module: () => import('./WorkspaceModuleView.vue'),
  reference: () => import('./WorkspaceReferenceView.vue'),
  media: () => import('./WorkspaceMediaView.vue')
})
