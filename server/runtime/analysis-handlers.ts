import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { AnalysisAgentTokenType, HomeDashboardModules } from '#shared/types/analysis'
import type { LoadUsageResult } from '#shared/types/usage-dashboard'
import { getUsageDataRuntime } from '#server/runtime/usage-runtime'
import { resolveProjectUsagePlatform } from '#shared/platform/metadata'
import { ANALYSIS_AGENT_TOKEN_TYPES } from '#shared/types/analysis'
import { resolveConfig } from '#shared/utils/configs'

export function getAnalysisRuntime(_event: Parameters<typeof getQuery>[0]) {
    const runtimeConfig = useRuntimeConfig()
    return getUsageDataRuntime(resolveConfig(runtimeConfig.public))
}

export function defineHomeAnalysisHandler<T>(handler: (modules: HomeDashboardModules, event: Parameters<typeof getQuery>[0]) => T | Promise<T>) {
    return defineEventHandler(async (event) => {
        return handler(await getAnalysisRuntime(event).getHomeDashboardModules(), event)
    })
}

export function defineRequiredAgentAnalysisHandler<T>(handler: (dashboard: LoadUsageResult, event: Parameters<typeof getQuery>[0], platform: ProjectUsagePlatform) => T | Promise<T>) {
    return defineEventHandler(async (event) => {
        const platform = getRequiredAnalysisAgent(event)

        return handler(await getAnalysisRuntime(event).getAgentDashboard(platform), event, platform)
    })
}

export function defineScopedAnalysisHandler<T>(handlers: {
    agent: (dashboard: LoadUsageResult, event: Parameters<typeof getQuery>[0], platform: ProjectUsagePlatform) => T | Promise<T>
    home: (modules: HomeDashboardModules, event: Parameters<typeof getQuery>[0]) => T | Promise<T>
}) {
    return defineEventHandler(async (event) => {
        const platform = getAnalysisAgent(event)

        if (platform) {
            return handlers.agent(await getAnalysisRuntime(event).getAgentDashboard(platform), event, platform)
        }

        return handlers.home(await getAnalysisRuntime(event).getHomeDashboardModules(), event)
    })
}

export function getRequiredAnalysisAgentTokenType(event: Parameters<typeof getQuery>[0]): AnalysisAgentTokenType {
    const query = getQuery(event)
    const value = typeof query.type === 'string' ? query.type.trim() : ''

    if (ANALYSIS_AGENT_TOKEN_TYPES.includes(value as AnalysisAgentTokenType)) {
        return value as AnalysisAgentTokenType
    }

    throw createError({
        statusCode: 400,
        statusMessage: `Unsupported token analysis type: ${value || 'unknown'}.`,
    })
}

function getRequiredAnalysisAgent(event: Parameters<typeof getQuery>[0]) {
    const platform = getAnalysisAgent(event)

    if (!platform) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Missing or unsupported analysis agent.',
        })
    }

    return platform
}

function getAnalysisAgent(event: Parameters<typeof getQuery>[0]) {
    const query = getQuery(event)
    const value = typeof query.agent === 'string' ? query.agent : null

    return resolveProjectUsagePlatform(value)
}
