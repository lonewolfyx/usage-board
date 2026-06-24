import { settleUsageStartupReady } from '#server/runtime/startup-state'
import { getUsageDataRuntime } from '#server/runtime/usage-runtime'
import { resolveConfig } from '#shared/utils/configs'

export default defineNitroPlugin(async (nitroApp) => {
    const runtimeConfig = useRuntimeConfig()
    const config = await resolveConfig(runtimeConfig.public)
    const runtime = getUsageDataRuntime(config)

    nitroApp.hooks.hookOnce('close', () => {
        runtime.dispose()
    })

    await settleUsageStartupReady(runtime.ensureFreshBootstrapForStartup())
})
