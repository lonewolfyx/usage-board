import { getUsageDataRuntime } from '#server/services/usage-data-runtime'
import { resolveConfig } from '#shared/utils/configs'

export default defineEventHandler(async () => {
    const runtimeConfig = useRuntimeConfig()
    const config = resolveConfig(runtimeConfig.public)
    const runtime = getUsageDataRuntime(config)

    return runtime.getBootstrap()
})
