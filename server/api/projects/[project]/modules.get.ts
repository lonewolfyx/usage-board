import type { ProjectDashboardScope } from '#shared/types/project-dashboard'
import type { ProjectUsageDataModule } from '#shared/types/ws'
import { getUsageDataRuntime } from '#server/services/usage-data-runtime'
import { resolveConfig } from '#shared/utils/configs'
import {
    normalizeStringList,
    normalizeStringValue,
} from '#shared/utils/normalize'

export default defineEventHandler(async (event) => {
    const runtimeConfig = useRuntimeConfig()
    const config = resolveConfig(runtimeConfig.public)
    const project = decodeURIComponent(getRouterParam(event, 'project') || '').trim()
    const query = getQuery(event)
    const module = normalizeStringValue<ProjectUsageDataModule>(query.module)
    const modules = normalizeStringList<ProjectUsageDataModule>(query.modules)
    const platform = normalizeStringValue<ProjectDashboardScope>(query.platform)

    return getUsageDataRuntime(config).getProjectDataModules({
        module,
        modules,
        platform,
        project,
    })
})
