import type { ProjectUsagePlatform } from '#shared/types/ai'
import type {
    AgentDashboardModulesResponse,
    AnalysisAgentSessionPageResponse,
    AnalysisAgentTokenPageResponse,
    AnalysisAgentTokenType,
    AnalysisDailyTokenPageResponse,
    AnalysisLiveStateResponse,
    HomeDashboardModulesResponse,
} from '#shared/types/analysis'
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { DEFAULT_PAGE_SIZE } from '#shared/types/pagination'

const analysisRouteMap = {
    agentSession: '/api/analysis/agent/session.json',
    agentModules: '/api/analysis/agent/modules.json',
    agentToken: '/api/analysis/agent/token.json',
    dailyTokenUsage: '/api/analysis/token/daily.json',
    homeModules: '/api/analysis/modules.json',
    liveState: '/api/analysis/live-state.json',
} as const

export function fetchHomeDashboardModules() {
    return requestAnalysis<HomeDashboardModulesResponse>('homeModules')
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

export function fetchAgentDashboardModules(agent: ProjectUsagePlatform) {
    return requestAnalysis<AgentDashboardModulesResponse>('agentModules', {
        agent,
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
    })
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
    page?: number
    pageSize?: number
    type?: AnalysisAgentTokenType
}) {
    const query: Record<string, string> = {}

    if (options.agent) {
        query.agent = PROJECT_USAGE_PLATFORM_META[options.agent].slug
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
