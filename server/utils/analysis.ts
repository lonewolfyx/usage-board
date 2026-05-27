import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { AnalysisAgentTokenType, HomeDashboardModules } from '#shared/types/analysis'
import type { LoadUsageResult } from '#shared/types/usage-dashboard'
import type { H3Event } from 'h3'
import { getUsageDataRuntime } from '#server/services/usage-data-runtime'
import { resolveProjectUsagePlatform } from '#shared/platform/metadata'
import { ANALYSIS_AGENT_TOKEN_TYPES } from '#shared/types/analysis'
import { resolveConfig } from '#shared/utils/configs'

export function getAnalysisRuntime(event: H3Event) {
    const runtimeConfig = useRuntimeConfig(event)
    const config = resolveConfig(runtimeConfig.public)

    return getUsageDataRuntime(config)
}

export function getOptionalAnalysisAgent(event: H3Event) {
    const agent = normalizeQueryString(getQuery(event).agent)

    if (!agent) {
        return null
    }

    const platform = resolveProjectUsagePlatform(agent)

    if (!platform) {
        throw createError({
            statusCode: 400,
            statusMessage: `Unsupported agent: ${agent}.`,
        })
    }

    return platform
}

export function getRequiredAnalysisAgent(event: H3Event): ProjectUsagePlatform {
    const platform = getOptionalAnalysisAgent(event)

    if (!platform) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Missing required query parameter: agent.',
        })
    }

    return platform
}

export function getRequiredAnalysisAgentTokenType(event: H3Event): AnalysisAgentTokenType {
    const type = normalizeQueryString(getQuery(event).type)

    if (!type) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Missing required query parameter: type.',
        })
    }

    if (!ANALYSIS_AGENT_TOKEN_TYPES.includes(type as AnalysisAgentTokenType)) {
        throw createError({
            statusCode: 400,
            statusMessage: `Unsupported token analysis type: ${type}.`,
        })
    }

    return type as AnalysisAgentTokenType
}

export function defineHomeAnalysisHandler<TResult>(
    select: (modules: HomeDashboardModules, event: H3Event) => TResult | Promise<TResult>,
) {
    return defineEventHandler(async (event) => {
        return select(await getHomeAnalysisModules(event), event)
    })
}

export function defineScopedAnalysisHandler<TResult>(options: {
    agent: (dashboard: LoadUsageResult) => TResult | Promise<TResult>
    home: (modules: HomeDashboardModules) => TResult | Promise<TResult>
}) {
    return defineEventHandler(async (event) => {
        const agent = getOptionalAnalysisAgent(event)

        if (agent) {
            return options.agent(await getAnalysisRuntime(event).getAgentDashboard(agent))
        }

        return options.home(await getHomeAnalysisModules(event))
    })
}

export function defineRequiredAgentAnalysisHandler<TResult>(
    select: (dashboard: LoadUsageResult, event: H3Event) => TResult | Promise<TResult>,
) {
    return defineEventHandler(async (event) => {
        const agent = getRequiredAnalysisAgent(event)

        return select(await getAnalysisRuntime(event).getAgentDashboard(agent), event)
    })
}

async function getHomeAnalysisModules(event: H3Event) {
    return getAnalysisRuntime(event).getHomeDashboardModules()
}

function normalizeQueryString(value: unknown) {
    if (Array.isArray(value)) {
        const firstValue = value[0]

        return typeof firstValue === 'string'
            ? firstValue.trim()
            : firstValue === undefined || firstValue === null
                ? undefined
                : String(firstValue).trim()
    }

    if (typeof value === 'string') {
        return value.trim()
    }

    return value === undefined || value === null ? undefined : String(value).trim()
}
