import type { ProjectUsageDataModule, ProjectUsageDataPlatformScope } from '#shared/types/ws'
import { resolveConfig } from '#shared/utils/configs'
import { getUsageDataRuntime } from '../../../services/usage-data-runtime'

export default defineEventHandler(async (event) => {
    const runtimeConfig = useRuntimeConfig()
    const config = resolveConfig(runtimeConfig.public)
    const project = decodeURIComponent(getRouterParam(event, 'project') || '').trim()
    const query = getQuery(event)
    const module = normalizeModule(query.module)
    const modules = normalizeModules(query.modules)
    const platform = normalizePlatform(query.platform)
    const sessionId = typeof query.sessionId === 'string' ? query.sessionId.trim() : undefined

    return getUsageDataRuntime(config).getProjectDataModules({
        module,
        modules,
        platform,
        project,
        sessionId,
    })
})

function normalizeModules(value: unknown) {
    if (Array.isArray(value)) {
        return value
            .flatMap(item => typeof item === 'string' ? splitCommaValues(item) : [])
            .filter(Boolean) as ProjectUsageDataModule[]
    }

    if (typeof value === 'string') {
        return splitCommaValues(value) as ProjectUsageDataModule[]
    }

    return undefined
}

function normalizeModule(value: unknown) {
    if (typeof value !== 'string') {
        return undefined
    }

    return value.trim() as ProjectUsageDataModule
}

function normalizePlatform(value: unknown) {
    if (typeof value !== 'string') {
        return undefined
    }

    return value.trim() as ProjectUsageDataPlatformScope
}

function splitCommaValues(value: string) {
    return value.split(',')
        .map(item => item.trim())
        .filter(Boolean)
}
