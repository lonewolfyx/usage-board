import type { FetchPage, PaginatedResponse } from '#shared/types/pagination'

export function usePaginatedTable<T>(initialPage: MaybeRefOrGetter<PaginatedResponse<T>>, fetchPage?: FetchPage<T>) {
    const pageData = shallowRef<PaginatedResponse<T>>(toValue(initialPage))
    const loading = shallowRef(false)
    const error = shallowRef<Error | null>(null)

    watch(() => toValue(initialPage), (value) => {
        pageData.value = value
    })

    async function setPage(page: number) {
        if (!fetchPage || page === pageData.value.pagination.page) {
            return
        }

        loading.value = true
        error.value = null

        try {
            pageData.value = await fetchPage(page)
        }
        catch (caught) {
            error.value = caught instanceof Error ? caught : new Error('Failed to load table page.')
        }
        finally {
            loading.value = false
        }
    }

    return {
        error,
        loading,
        pageData,
        setPage,
    }
}
