import { getUsageDataRuntime } from '#server/runtime/usage-runtime'
import { resolveConfig } from '#shared/utils/configs'

export default defineEventHandler(async () => {
    const runtimeConfig = useRuntimeConfig()
    const config = await resolveConfig(runtimeConfig.public)

    return getUsageDataRuntime(config).getProjectCatalog()
})
