import type { CodexTokenUsageRow } from './codex-dashboard'

export type TokenTabValue = 'day' | 'month' | 'session' | 'week'

export interface TokenTab {
    heading: string
    label: string
    value: TokenTabValue
}

export interface TokenTabState {
    items: CodexTokenUsageRow[]
    page: number
    pageCount: number
    paginatedItems: CodexTokenUsageRow[]
}
