import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { AiIconName } from '#shared/types/navigation'
import type {
    DailyTokenUsage,
    MonthlyModelUsage,
    ProjectSessionInteractionItem,
    ProjectSessionUsageItem,
    TokenUsageRow,
    TrendTone,
    UsageOverviewCard,
    UsageTopModel,
    UsageTopProject,
} from '#shared/types/usage-dashboard'

export type ProjectDashboardScope = 'all' | ProjectUsagePlatform

export type ProjectDashboardPlatformKey = ProjectUsagePlatform

export type ProjectDashboardTableTab = 'day' | 'month' | 'session' | 'week'

export type ProjectUsageCatalogType = ProjectUsagePlatform | 'mixed'

export interface ProjectDashboardTab {
    aiIcon?: AiIconName
    color?: string
    label: string
    value: ProjectDashboardScope
}

export interface ProjectDashboardPlatformTab extends ProjectDashboardTab {
    aiIcon: AiIconName
    color: string
    value: ProjectDashboardPlatformKey
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
    platform: ProjectDashboardPlatformKey
    reasoningTokens: string
    startedAt: string
    title: string
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
    path: string[]
    type: ProjectUsageCatalogType
}

export interface ProjectMetaModule {
    createTime: string | null
    label: string
    models: string[]
    platforms: ProjectDashboardPlatformKey[]
    sessionCound: number
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

export interface ProjectOverviewCardsModulePayload {
    overviewCards: UsageOverviewCard[]
    todayTopModel: UsageTopModel | null
    todayTopProject: UsageTopProject | null
    todayTotalCost: number
    todayTotalTokens: number
}

export type ProjectSessionInteractionPreview = Omit<ProjectSessionInteractionItem, 'raw'>

export interface ProjectSessionInteractionsModulePayload extends ProjectSessionListItem {
    interactions: ProjectSessionInteractionPreview[]
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

export interface ProjectTrendResult {
    tone: TrendTone
    label: string
}
