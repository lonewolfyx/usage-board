import type { ProjectUsagePlatform } from '#shared/types/ai'
import type {
    AgentDashboardCoreModules,
    AgentDashboardInsightsModules,
    AgentDashboardSessionModules,
    AnalysisAgentSessionPageResponse,
    AnalysisAgentTokenPageResponse,
    AnalysisAgentTokenType,
    AnalysisCacheResponse,
    AnalysisDailyTokenPageResponse,
    AnalysisLiveStateResponse,
    AnalysisSessionResponse,
    HomeDashboardCoreModules,
    HomeDashboardUsageModules,
} from '#shared/types/analysis'
import type { CalendarApiResponse } from '#shared/types/calendar'
import type { DailyTokenUsage, HourlyUsagePoint, MonthlyModelUsage, ProjectUsageItem, UsageOverviewCard } from '#shared/types/usage-dashboard'
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { ANALYSIS_AGENT_TOKEN_TYPES } from '#shared/types/analysis'
import { DEFAULT_PAGE_SIZE } from '#shared/types/pagination'

const analysisRouteMap = {
    agentSession: '/api/analysis/agent/session.json',
    agentToken: '/api/analysis/agent/token.json',
    calendar: '/api/analysis/calendar.json',
    cache: '/api/analysis/cache.json',
    dailyTokenUsage: '/api/analysis/token/daily.json',
    hotProject: '/api/analysis/hot-project.json',
    liveState: '/api/analysis/live-state.json',
    model: '/api/analysis/model.json',
    overviewCards: '/api/analysis/overview-cards.json',
    session: '/api/analysis/session.json',
    token: '/api/analysis/token.json',
    todayHourlyUsage: '/api/analysis/token/today-hourly.json',
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
        todayHourlyUsage,
    ] = await Promise.all([
        requestAnalysis<AnalysisCacheResponse>('cache'),
        requestAnalysis<DailyTokenUsage[]>('token'),
        requestAnalysis<HourlyUsagePoint[]>('todayHourlyUsage'),
    ])

    return {
        dailyTokenUsage,
        efficiencyMetrics: cache.items,
        todayHourlyUsage,
    }
}

export function fetchHomeDashboardSessionAnalysis() {
    return requestAnalysis<AnalysisSessionResponse>('session')
}

export function fetchAnalysisLiveState() {
    return requestAnalysis<AnalysisLiveStateResponse>('liveState')
}

export function fetchHomeDashboardDailyTokenPage(page = 1) {
    return requestAnalysis<AnalysisDailyTokenPageResponse>('dailyTokenUsage', {
        page,
        pageSize: DEFAULT_PAGE_SIZE,
    })
}

export function fetchCalendarData(month: string, agent?: ProjectUsagePlatform) {
    return requestAnalysis<CalendarApiResponse>('calendar', { month, agent })
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
        requestAnalysis<AnalysisAgentTokenPageResponse>('agentToken', {
            agent,
            page: 1,
            pageSize: DEFAULT_PAGE_SIZE,
            type: 'day',
        }),
    ])

    return {
        dailyRows: dailyRows.items,
        dailyRowsPagination: dailyRows.pagination,
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
                return [type, await requestAnalysis<AnalysisAgentTokenPageResponse>('agentToken', {
                    agent,
                    page: 1,
                    pageSize: DEFAULT_PAGE_SIZE,
                    type,
                })] as const
            })),
    ])
    const rowsByType = Object.fromEntries(tokenRows) as Record<
        Exclude<AnalysisAgentTokenType, 'day'>,
        AnalysisAgentTokenPageResponse
    >

    return {
        monthlyRows: rowsByType.month.items,
        monthlyRowsPagination: rowsByType.month.pagination,
        projectUsage,
        sessionRows: rowsByType.session.items,
        sessionRowsPagination: rowsByType.session.pagination,
        weeklyRows: rowsByType.week.items,
        weeklyRowsPagination: rowsByType.week.pagination,
    }
}

export function fetchAgentDashboardSessionModules(agent: ProjectUsagePlatform): Promise<AgentDashboardSessionModules> {
    return requestAnalysis<AnalysisAgentSessionPageResponse>('agentSession', {
        agent,
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
    }).then(sessionUsage => ({
        sessionUsage: sessionUsage.items,
        sessionUsagePagination: sessionUsage.pagination,
    }))
}

export function fetchAgentTokenPage(agent: ProjectUsagePlatform, type: AnalysisAgentTokenType, page: number) {
    return requestAnalysis<AnalysisAgentTokenPageResponse>('agentToken', {
        agent,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        type,
    })
}

export function fetchAgentSessionPage(agent: ProjectUsagePlatform, page: number) {
    return requestAnalysis<AnalysisAgentSessionPageResponse>('agentSession', {
        agent,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
    })
}

type AnalysisRouteKey = keyof typeof analysisRouteMap

function requestAnalysis<T>(
    route: AnalysisRouteKey,
    options: {
        agent?: ProjectUsagePlatform
        month?: string
        page?: number
        pageSize?: number
        type?: AnalysisAgentTokenType
    } = {},
) {
    return $fetch<T>(analysisRouteMap[route], {
        query: buildAnalysisQuery(options),
    })
}

function buildAnalysisQuery(options: {
    agent?: ProjectUsagePlatform
    month?: string
    page?: number
    pageSize?: number
    type?: AnalysisAgentTokenType
}) {
    const query: Record<string, string> = {}

    if (options.agent) {
        query.agent = PROJECT_USAGE_PLATFORM_META[options.agent].slug
    }

    if (options.month) {
        query.month = options.month
    }

    if (options.type) {
        query.type = options.type
    }

    if (options.page) {
        query.page = String(options.page)
    }

    if (options.pageSize) {
        query.pageSize = String(options.pageSize)
    }

    return Object.keys(query).length > 0 ? query : undefined
}
