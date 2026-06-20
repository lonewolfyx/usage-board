import type { PaginatedResponse, PaginationMeta } from './pagination'
import type { DailyTokenUsage, HourlyUsagePoint, LoadUsageResult, MonthlyModelUsage, ProjectUsageItem, RankedUsageItem, SessionUsageItem, UsageOverviewCard } from './usage-dashboard'

export const ANALYSIS_AGENT_TOKEN_TYPES = ['day', 'week', 'month', 'session'] as const

export type AnalysisAgentTokenType = typeof ANALYSIS_AGENT_TOKEN_TYPES[number]

export const ANALYSIS_AGENT_TOKEN_ROW_KEYS = {
    day: 'dailyRows',
    month: 'monthlyRows',
    session: 'sessionRows',
    week: 'weeklyRows',
} as const satisfies Record<AnalysisAgentTokenType, keyof LoadUsageResult>

export interface AnalysisCacheResponse {
    dailyItems: DailyTokenUsage[]
    items: RankedUsageItem[]
}

export interface AnalysisLiveStateResponse {
    updatedAt: string
}

export interface AnalysisSessionResponse {
    items: SessionUsageItem[]
    totalSessions: number
}

export interface AnalysisDailyTokenRow {
    cachedInputTokens: number
    costUSD: number
    date: string
    inputTokens: number
    models: string[]
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
}

export type AnalysisDailyTokenPageResponse = PaginatedResponse<AnalysisDailyTokenRow>
export type AnalysisAgentTokenPageResponse = PaginatedResponse<LoadUsageResult['dailyRows'][number]>

export interface AnalysisAgentSessionRow {
    costUSD: number
    duration: string
    id: string
    inputTokens: number
    model: string
    outputTokens: number
    project: string
    sessionId: string
    startedAt: string
    threadName: string
    tokenTotal: number
}

export type AnalysisAgentSessionPageResponse = PaginatedResponse<AnalysisAgentSessionRow>

export interface HomeDashboardCoreModules {
    hotProjects: ProjectUsageItem[]
    modelUsage: MonthlyModelUsage[]
    overviewCards: UsageOverviewCard[]
}

export interface HomeDashboardUsageModules {
    dailyTokenUsage: DailyTokenUsage[]
    efficiencyMetrics: RankedUsageItem[]
    todayHourlyUsage: HourlyUsagePoint[]
}

export interface HomeDashboardSessionModules {
    sessionAnalysis: AnalysisSessionResponse
}

export interface HomeDashboardTodayInsights {
    previousPromptCount: number
    previousSessionCount: number
    promptCount: number
    sessionCount: number
    todayHourlyUsage: HourlyUsagePoint[]
}

export type HomeDashboardModules = HomeDashboardCoreModules & HomeDashboardUsageModules & HomeDashboardSessionModules

export type HomeDashboardModulesResponse = HomeDashboardModules & {
    updatedAt: string
}

export type AgentDashboardCoreModules = Pick<
    LoadUsageResult,
    'dailyRows'
    | 'dailyTokenUsage'
    | 'monthlyModelUsage'
    | 'overviewCards'
> & {
    dailyRowsPagination: PaginationMeta
}

export type AgentDashboardInsightsModules = Pick<
    LoadUsageResult,
    'monthlyRows'
    | 'projectUsage'
    | 'sessionRows'
    | 'weeklyRows'
> & {
    monthlyRowsPagination: PaginationMeta
    sessionRowsPagination: PaginationMeta
    weeklyRowsPagination: PaginationMeta
}

export interface AgentDashboardSessionModules {
    sessionUsage: AnalysisAgentSessionRow[]
    sessionUsagePagination: PaginationMeta
}

export type AgentDashboardModules = AgentDashboardCoreModules & AgentDashboardInsightsModules & AgentDashboardSessionModules

export type AgentDashboardModulesResponse = AgentDashboardModules & {
    updatedAt: string
}
