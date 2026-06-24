import type { PaginatedResponse, PaginationMeta } from '#shared/types/pagination'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '#shared/types/pagination'

export interface PaginationInput {
    page?: number
    pageSize?: number
}

function normalizePagination(input: PaginationInput = {}): Pick<PaginationMeta, 'page' | 'pageSize'> {
    return {
        page: normalizePositiveInteger(input.page, 1),
        pageSize: Math.min(normalizePositiveInteger(input.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE),
    }
}

export function paginateItems<T>(
    items: T[],
    input: PaginationInput = {},
): PaginatedResponse<T> {
    const { page, pageSize } = normalizePagination(input)
    const total = items.length
    const pageCount = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(page, pageCount)
    const start = (safePage - 1) * pageSize

    return {
        items: items.slice(start, start + pageSize),
        pagination: {
            page: safePage,
            pageCount,
            pageSize,
            total,
        },
    }
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
    if (!Number.isFinite(value)) {
        return fallback
    }

    const normalized = Math.trunc(value!)

    return normalized > 0 ? normalized : fallback
}
