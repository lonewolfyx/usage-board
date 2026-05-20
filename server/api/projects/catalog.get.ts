import { resolveConfig } from '#shared/utils/configs'
import { getUsageDataRuntime } from '../../services/usage-data-runtime'

export default defineEventHandler(async () => {
    const runtimeConfig = useRuntimeConfig()
    const config = resolveConfig(runtimeConfig.public)

    return getUsageDataRuntime(config).getProjectCatalog()
})
