import { computed, onBeforeUnmount, onMounted } from 'vue'

import type { SharedPrepaidRealtimeModule } from '@/api/sharedPrepaid'
import {
  useSharedPrepaidStore,
  type SharedPrepaidRealtimeRegistration
} from '@/stores/sharedPrepaid'

/**
 * Registers a prepaid page for guarded invalidation refreshes without coupling the global
 * connection lifecycle to that page. Tasks 10 and 12 can provide their own dirty-state checks.
 */
export function useSharedPrepaidRealtimeRegistration(
  module: SharedPrepaidRealtimeModule,
  registration: SharedPrepaidRealtimeRegistration
) {
  const store = useSharedPrepaidStore()
  let unregister: (() => void) | undefined

  onMounted(() => {
    unregister = store.registerModule(module, registration)
  })
  onBeforeUnmount(() => {
    unregister?.()
    unregister = undefined
  })

  return {
    hasPendingRefresh: computed(() => store.refreshPromptModules.includes(module)),
    retryRefresh: () => store.acknowledgeAndRefresh(module)
  }
}
