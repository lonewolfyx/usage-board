import type { ProjectUsagePlatform } from '#shared/types/ai'
import type {
    AgentDashboardCoreModules,
    AgentDashboardInsightsModules,
    AgentDashboardSessionModules,
    AnalysisAgentTokenType,
    AnalysisCacheResponse,
    AnalysisSessionResponse,
    HomeDashboardCoreModules,
    HomeDashboardUsageModules,
} from '#shared/types/analysis'
import type { UsageAnalyticsTokenUsageRow } from '#shared/types/usage-analytics'
import type { DailyTokenUsage, MonthlyModelUsage, ProjectUsageItem, UsageOverviewCard } from '#shared/types/usage-dashboard'
import { getProjectUsagePlatformSlug } from '#shared/platform/metadata'
import { ANALYSIS_AGENT_TOKEN_TYPES } from '#shared/types/analysis'

const analysisRouteMap = {
    agentSession: '/api/analysis/agent/session.json',
    agentToken: '/api/analysis/agent/token.json',
    cache: '/api/analysis/cache.json',
    dailyTokenUsage: '/api/analysis/token/daily.json',
    hotProject: '/api/analysis/hot-project.json',
    model: '/api/analysis/model.json',
    overviewCards: '/api/analysis/overview-cards.json',
    session: '/api/analysis/session.json',
    token: '/api/analysis/token.json',
} as const

export async function fetchHomeDashboardCoreModules(): Promise<HomeDashboardCoreModules> {
    const [
        overviewCards,
        monthlyModelUsage,
        projectUsage,
    ] = await Promise.all([
        requestAnalysis<UsageOverviewCard[]>('overviewCards'),
        requestAnalysis<MonthlyModelUsage[]>('model'),
        requestAnalysis<ProjectUsageItem[]>('hotProject'),
    ])

    return {
        hotProjects: projectUsage,
        modelUsage: monthlyModelUsage,
        overviewCards,
    }
}

export async function fetchHomeDashboardUsageModules(): Promise<HomeDashboardUsageModules> {
    const [
        cache,
        dailyTokenUsage,
    ] = await Promise.all([
        requestAnalysis<AnalysisCacheResponse>('cache'),
        requestAnalysis<DailyTokenUsage[]>('dailyTokenUsage'),
    ])

    return {
        dailyTokenUsage,
        efficiencyMetrics: cache.items,
    }
}

export function fetchHomeDashboardSessionAnalysis() {
    return requestAnalysis<AnalysisSessionResponse>('session')
}

export async function fetchAgentDashboardCoreModules(agent: ProjectUsagePlatform): Promise<AgentDashboardCoreModules> {
    const [
        overviewCards,
        monthlyModelUsage,
        dailyTokenUsage,
        dailyRows,
    ] = await Promise.all([
        requestAnalysis<UsageOverviewCard[]>('overviewCards', { agent }),
        requestAnalysis<MonthlyModelUsage[]>('model', { agent }),
        requestAnalysis<DailyTokenUsage[]>('token', { agent }),
        requestAnalysis<UsageAnalyticsTokenUsageRow[]>('agentToken', {
            agent,
            type: 'day',
        }),
    ])

    return {
        dailyRows,
        dailyTokenUsage,
        monthlyModelUsage,
        overviewCards,
    }
}

export async function fetchAgentDashboardInsightsModules(agent: ProjectUsagePlatform): Promise<AgentDashboardInsightsModules> {
    const [
        projectUsage,
        tokenRows,
    ] = await Promise.all([
        requestAnalysis<ProjectUsageItem[]>('hotProject', { agent }),
        Promise.all(ANALYSIS_AGENT_TOKEN_TYPES
            .filter(type => type !== 'day')
            .map(async (type) => {
                return [type, await requestAnalysis<UsageAnalyticsTokenUsageRow[]>('agentToken', {
                    agent,
                    type,
                })] as const
            })),
    ])
    const rowsByType = Object.fromEntries(tokenRows) as Record<
        Exclude<AnalysisAgentTokenType, 'day'>,
        AgentDashboardInsightsModules['monthlyRows']
    >

    return {
        monthlyRows: rowsByType.month,
        projectUsage,
        sessionRows: rowsByType.session,
        weeklyRows: rowsByType.week,
    }
}

export function fetchAgentDashboardSessionModules(agent: ProjectUsagePlatform): Promise<AgentDashboardSessionModules> {
    return requestAnalysis<AgentDashboardSessionModules['sessionUsage']>('agentSession', { agent }).then(sessionUsage => ({
        sessionUsage,
    }))
}

type AnalysisRouteKey = keyof typeof analysisRouteMap

function requestAnalysis<T>(
    route: AnalysisRouteKey,
    options: {
        agent?: ProjectUsagePlatform
        type?: AnalysisAgentTokenType
    } = {},
) {
    return $fetch<T>(analysisRouteMap[route], {
        query: buildAnalysisQuery(options),
    })
}

function buildAnalysisQuery(options: {
    agent?: ProjectUsagePlatform
    type?: AnalysisAgentTokenType
}) {
    const query: Record<string, string> = {}

    if (options.agent) {
        query.agent = getProjectUsagePlatformSlug(options.agent)
    }

    if (options.type) {
        query.type = options.type
    }

    return Object.keys(query).length > 0 ? query : undefined
}
