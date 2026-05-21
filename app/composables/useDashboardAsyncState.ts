import type { Ref } from 'vue'

export function useDashboardAsyncState(
    status: Readonly<Ref<'error' | 'idle' | 'pending' | 'success'>>,
    error: Readonly<Ref<unknown>>,
) {
    const hasResolvedSuccessfully = shallowRef(false)

    watch(status, (value) => {
        if (value === 'success') {
            hasResolvedSuccessfully.value = true
        }
    }, {
        immediate: true,
    })

    const showSkeleton = computed(() => !hasResolvedSuccessfully.value && status.value !== 'error')
    const errorText = computed(() => {
        if (status.value !== 'error') {
            return ''
        }

        if (error.value instanceof Error) {
            return error.value.message
        }

        return typeof error.value === 'string' ? error.value : 'Failed to load dashboard data.'
    })

    return {
        errorText,
        showSkeleton,
    }
}
