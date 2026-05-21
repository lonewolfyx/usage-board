import type { UsageAnalyticsSessionUsageItem } from './usage-analytics'
import type { DailyTokenUsage, LoadUsageResult, MonthlyModelUsage, ProjectUsageItem, RankedUsageItem, UsageOverviewCard } from './usage-dashboard'

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

export interface AnalysisSessionResponse {
    items: UsageAnalyticsSessionUsageItem[]
    totalSessions: number
}

export interface HomeDashboardCoreModules {
    hotProjects: ProjectUsageItem[]
    modelUsage: MonthlyModelUsage[]
    overviewCards: UsageOverviewCard[]
}

export interface HomeDashboardUsageModules {
    dailyTokenUsage: DailyTokenUsage[]
    efficiencyMetrics: RankedUsageItem[]
}

export interface HomeDashboardSessionModules {
    sessionAnalysis: AnalysisSessionResponse
}

export type HomeDashboardModules = HomeDashboardCoreModules & HomeDashboardUsageModules & HomeDashboardSessionModules

export type AgentDashboardCoreModules = Pick<
    LoadUsageResult,
    'dailyRows'
    | 'dailyTokenUsage'
    | 'monthlyModelUsage'
    | 'overviewCards'
>

export type AgentDashboardInsightsModules = Pick<
    LoadUsageResult,
    'monthlyRows'
    | 'projectUsage'
    | 'sessionRows'
    | 'weeklyRows'
>

export type AgentDashboardSessionModules = Pick<LoadUsageResult, 'sessionUsage'>

export type AgentDashboardModules = AgentDashboardCoreModules & AgentDashboardInsightsModules & AgentDashboardSessionModules
