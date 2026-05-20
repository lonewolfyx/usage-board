import { getUsageDataRuntime } from '#server/services/usage-data-runtime'
import { resolveConfig } from '#shared/utils/configs'

export default defineNitroPlugin((nitroApp) => {
    const runtimeConfig = useRuntimeConfig()
    const config = resolveConfig(runtimeConfig.public)
    const runtime = getUsageDataRuntime(config)

    void runtime.initialize()

    nitroApp.hooks.hookOnce('close', () => {
        runtime.dispose()
    })
})
