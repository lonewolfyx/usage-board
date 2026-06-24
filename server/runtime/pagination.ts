import type { PaginationInput } from '#shared/utils/pagination'

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 100

export function getPaginationQuery(event: Parameters<typeof getQuery>[0]): PaginationInput {
    const query = getQuery(event)
    const page = Number(query.page)
    const pageSize = Number(query.pageSize)

    return {
        page: Number.isFinite(page) && page > 0 ? Math.trunc(page) : DEFAULT_PAGE,
        pageSize: Number.isFinite(pageSize) && pageSize > 0
            ? Math.min(Math.trunc(pageSize), MAX_PAGE_SIZE)
            : DEFAULT_PAGE_SIZE,
    }
}
