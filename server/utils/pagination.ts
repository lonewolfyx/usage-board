import type { H3Event } from 'h3'
import { normalizePagination } from '#shared/utils/pagination'
import { getQuery } from 'h3'

export function getPaginationQuery(event: H3Event) {
    const query = getQuery(event)

    return normalizePagination({
        page: normalizeQueryNumber(query.page),
        pageSize: normalizeQueryNumber(query.pageSize),
    })
}

function normalizeQueryNumber(value: unknown) {
    const rawValue = Array.isArray(value) ? value[0] : value

    if (rawValue === undefined || rawValue === null || rawValue === '') {
        return undefined
    }

    const numberValue = Number(rawValue)

    return Number.isFinite(numberValue) ? numberValue : undefined
}
