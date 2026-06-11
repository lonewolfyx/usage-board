import type { ProjectDashboardScope } from '#shared/types/project-dashboard'
import type { ProjectUsageDataModule } from '#shared/types/ws'
import { getUsageDataRuntime } from '#server/services/usage-data-runtime'
import { resolveConfig } from '#shared/utils/configs'
import { normalizeStringList } from '#shared/utils/normalize'

export default defineEventHandler(async (event) => {
    const runtimeConfig = useRuntimeConfig()
    const config = resolveConfig(runtimeConfig.public)
    const project = decodeURIComponent(getRouterParam(event, 'project') || '').trim()
    const query = getQuery(event)
    const module = typeof query.module === 'string' && query.module.trim()
        ? query.module.trim() as ProjectUsageDataModule
        : undefined
    const modules = normalizeStringList<ProjectUsageDataModule>(query.modules)
    const platform = typeof query.platform === 'string' && query.platform.trim()
        ? query.platform.trim() as ProjectDashboardScope
        : undefined

    return getUsageDataRuntime(config).getProjectDataModules({
        module,
        modules,
        platform,
        project,
    })
})
