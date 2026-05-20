import { resolveConfig } from '#shared/utils/configs'
import { getUsageDataRuntime } from '../services/usage-data-runtime'

export default defineNitroPlugin((nitroApp) => {
    const runtimeConfig = useRuntimeConfig()
    const config = resolveConfig(runtimeConfig.public)
    const runtime = getUsageDataRuntime(config)

    void runtime.initialize()

    nitroApp.hooks.hookOnce('close', () => {
        runtime.dispose()
    })
})
