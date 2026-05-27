import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { PaginatedResponse } from '#shared/types/pagination'
import type {
    DailyTokenUsage,
    MonthlyModelUsage,
    ProjectSessionUsageItem,
    TokenUsageRow,
    UsageOverviewCard,
} from '#shared/types/usage-dashboard'

export type ProjectDashboardScope = 'all' | ProjectUsagePlatform

export interface ProjectDashboardPlatformMeta {
    aiIcon: string
    color: string
    label: string
}

export interface ProjectDashboardTab {
    aiIcon?: string
    color?: string
    label: string
    value: ProjectDashboardScope
}

export interface ProjectDashboardPlatformTab extends Omit<ProjectDashboardTab, 'aiIcon' | 'color' | 'value'>, ProjectDashboardPlatformMeta {
    value: ProjectUsagePlatform
}

export interface ProjectLineSeries {
    color: string
    label: string
    points: number[]
}

export interface ProjectSessionTableRow {
    cacheTokens: string
    cost: string
    duration: string
    id: string
    inputTokens: string
    model: string
    outputTokens: string
    platform: ProjectUsagePlatform
    reasoningTokens: string
    sessionId: string
    startedAt: string
    threadName: string
    tokens: string
}

export interface ProjectTokenUsageRow {
    cacheTokens: string
    cost: string
    inputTokens: string
    label: string
    models: string
    outputTokens: string
    reasoningTokens: string
    sessions: string
    tokens: string
}

export interface ProjectTabSummary {
    cost: string
    label: string
    sessions: string
    tokens: string
}

export type ProjectSessionListItem = Omit<ProjectSessionUsageItem, 'interactions'>

export interface ProjectSelectItem {
    id: string
    name: string
    platforms: ProjectUsagePlatform[]
    totalTokens: number
}

export interface ProjectDailyTrendModulePayload {
    dailyRows: TokenUsageRow[]
    dailyTokenUsage: DailyTokenUsage[]
}

export interface ProjectModelUsageModulePayload {
    dailyTokenUsage: DailyTokenUsage[]
    monthlyModelUsage: MonthlyModelUsage[]
}

export interface ProjectTokenUsageModulePayload {
    dailyRows: PaginatedResponse<TokenUsageRow>
    monthlyRows: PaginatedResponse<TokenUsageRow>
    sessionRows: PaginatedResponse<TokenUsageRow>
    weeklyRows: PaginatedResponse<TokenUsageRow>
}

export interface ProjectSessionListModulePayload {
    sessionRows: PaginatedResponse<TokenUsageRow>
    sessionUsage: PaginatedResponse<ProjectSessionListItem>
    sessions: ProjectSessionListItem[]
}

export type ProjectPlatformModulePayload<T> = Record<ProjectDashboardScope, T>

export interface ProjectPlatformView {
    dayRows: PaginatedResponse<TokenUsageRow>
    modelLabels: string[]
    modelSeries: ProjectLineSeries[]
    modelTickIndexes: number[]
    monthRows: PaginatedResponse<TokenUsageRow>
    overviewCards: UsageOverviewCard[]
    sessionRows: PaginatedResponse<TokenUsageRow>
    sessionTableRows: PaginatedResponse<ProjectSessionTableRow>
    trendLabels: string[]
    trendSeries: ProjectLineSeries[]
    trendTickIndexes: number[]
    trendTooltipLabels: string[]
    weekRows: PaginatedResponse<TokenUsageRow>
}

export interface ProjectPendingWebSocketRequest<T = unknown> {
    reject: (error: Error) => void
    requestId: string
    resolve: (value: T) => void
}

export interface ProjectUsageSummary {
    cachedInputTokens: number
    costUSD: number
    inputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    sessions: number
    totalTokens: number
}

export interface ProjectSessionSummary {
    costUSD: number
    sessions: number
    totalTokens: number
}
