import type { ProjectUsagePlatform } from '#shared/types/ai'
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
    dailyRows: TokenUsageRow[]
    monthlyRows: TokenUsageRow[]
    sessionRows: TokenUsageRow[]
    weeklyRows: TokenUsageRow[]
}

export interface ProjectSessionListModulePayload {
    sessionRows: TokenUsageRow[]
    sessionUsage: ProjectSessionListItem[]
    sessions: ProjectSessionListItem[]
}

export type ProjectPlatformModulePayload<T> = Record<ProjectDashboardScope, T>

export interface ProjectPlatformView {
    dayRows: TokenUsageRow[]
    modelLabels: string[]
    modelSeries: ProjectLineSeries[]
    modelTickIndexes: number[]
    monthRows: TokenUsageRow[]
    overviewCards: UsageOverviewCard[]
    sessionRows: TokenUsageRow[]
    sessionTableRows: ProjectSessionTableRow[]
    trendLabels: string[]
    trendSeries: ProjectLineSeries[]
    trendTickIndexes: number[]
    trendTooltipLabels: string[]
    weekRows: TokenUsageRow[]
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
