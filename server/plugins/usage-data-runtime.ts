import { getUsageDataRuntime } from '#server/services/usage-data-runtime'
import { settleUsageStartupReady } from '#server/services/usage-startup-state'
import { resolveConfig } from '#shared/utils/configs'

export default defineNitroPlugin(async (nitroApp) => {
    const runtimeConfig = useRuntimeConfig()
    const config = resolveConfig(runtimeConfig.public)
    const runtime = getUsageDataRuntime(config)
    const verboseWhenChanged = process.env.USAGE_BOARD_STARTUP_VERBOSE === '1'

    nitroApp.hooks.hookOnce('close', () => {
        runtime.dispose()
    })

    const startup = runtime.ensureFreshBootstrapForStartup({
        verboseWhenChanged,
    })

    await settleUsageStartupReady(startup)
})
