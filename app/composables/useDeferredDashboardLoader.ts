import type { AsyncDataRequestStatus } from '#app'
import type { Ref } from 'vue'

export function useDeferredDashboardLoader(options: {
    clearDeferred: () => void
    coreStatus: Readonly<Ref<AsyncDataRequestStatus>>
    executeDeferred: () => Promise<unknown>
    refreshCore: () => Promise<unknown>
    refreshDeferred: () => Promise<unknown>
}) {
    const hasRequestedDeferredModules = shallowRef(false)

    watch(options.coreStatus, async (value) => {
        if (!import.meta.client) {
            return
        }

        if (value !== 'success') {
            hasRequestedDeferredModules.value = false
            options.clearDeferred()
            return
        }

        if (hasRequestedDeferredModules.value) {
            return
        }

        hasRequestedDeferredModules.value = true
        await options.executeDeferred()
    }, {
        immediate: true,
    })

    async function refresh() {
        hasRequestedDeferredModules.value = false
        await options.refreshCore()

        if (options.coreStatus.value === 'success' && import.meta.client) {
            hasRequestedDeferredModules.value = true
            await options.refreshDeferred()
        }
    }

    return {
        refresh,
    }
}
