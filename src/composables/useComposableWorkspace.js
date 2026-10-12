import { inject } from 'vue'

// Views access the host without importing its layout/persistence implementation.
export const COMPOSABLE_WORKSPACE_CONTEXT = Symbol('pinax-composable-workspace')
export function useComposableWorkspace() { return inject(COMPOSABLE_WORKSPACE_CONTEXT, null) }
