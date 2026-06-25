import type { ProjectUsagePlatform } from './ai'
import type { UsageOverviewCard } from './usage-dashboard'

/** Calendar cell event bar for a single platform on a single day (render shape). */
export interface CalendarCellEvent {
    platform: ProjectUsagePlatform
    label: string
    icon: string
    color: string
    costUSD: number
    inputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    cachedInputTokens: number
    totalTokens: number
    models: Record<string, { tokens: number, costUSD: number }>
}

/** A single flattened calendar cell (6x7 grid render shape). */
export interface CalendarCell {
    day: number
    dateKey: string
    isCurrentMonth: boolean
    isToday: boolean
    totalTokens: number
    totalCostUSD: number
    events: CalendarCellEvent[]
}

/** Per-platform breakdown for a single calendar day (API shape). */
export interface CalendarPlatformDayData {
    platform: ProjectUsagePlatform
    totalTokens: number
    costUSD: number
    inputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    cachedInputTokens: number
    models: Record<string, { tokens: number, costUSD: number }>
}

/** Raw single-day calendar data (API shape, pre-render). */
export interface CalendarDayData {
    dateKey: string
    totalTokens: number
    costUSD: number
    inputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    cachedInputTokens: number
    models: Record<string, { tokens: number, costUSD: number }>
    platforms: Partial<Record<ProjectUsagePlatform, CalendarPlatformDayData>>
}

/** Calendar month summary (API shape). */
export interface CalendarMonthSummary {
    month: string
    totalTokens: number
    totalCostUSD: number
    activeDays: number
    avgDailyCostUSD: number
    topPlatform: ProjectUsagePlatform | null
    topModel: string | null
    days: CalendarDayData[]
}

/** API response — KPI cards reuse the existing UsageOverviewCard. */
export interface CalendarApiResponse {
    kpiCards: UsageOverviewCard[]
    month: CalendarMonthSummary
    availableMonths: string[]
    scopedPlatform: ProjectUsagePlatform | null
}
