import type { UsageAnalyticsTokenUsageRow } from './usage-analytics'

export type TokenTabValue = 'day' | 'month' | 'session' | 'week'

export interface TokenTab {
    heading: string
    label: string
    value: TokenTabValue
}

export interface TokenTabState {
    items: UsageAnalyticsTokenUsageRow[]
    page: number
    pageCount: number
    paginatedItems: UsageAnalyticsTokenUsageRow[]
}
