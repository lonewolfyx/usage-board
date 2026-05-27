export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 10

export interface PaginationMeta {
    page: number
    pageCount: number
    pageSize: number
    total: number
}

export interface PaginatedResponse<T> {
    items: T[]
    pagination: PaginationMeta
}

export type FetchPage<T> = (page: number) => Promise<PaginatedResponse<T>>
