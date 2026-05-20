import { getUsageDataRuntime } from '#server/services/usage-data-runtime'
import { resolveConfig } from '#shared/utils/configs'

export default defineEventHandler(async () => {
    const runtimeConfig = useRuntimeConfig()
    const config = resolveConfig(runtimeConfig.public)

    return getUsageDataRuntime(config).getProjectCatalog()
})
