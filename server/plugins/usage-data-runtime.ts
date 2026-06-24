import { settleUsageStartupReady } from '#server/runtime/startup-state'
import { getUsageDataRuntime } from '#server/runtime/usage-runtime'
import { resolveConfig } from '#shared/utils/configs'

export default defineNitroPlugin(async (nitroApp) => {
    const runtimeConfig = useRuntimeConfig()
    const config = resolveConfig(runtimeConfig.public)
    const runtime = getUsageDataRuntime(config)
    const verboseWhenChanged = process.env.USAGE_BOARD_STARTUP_VERBOSE === '1'

    nitroApp.hooks.hookOnce('close', () => {
        runtime.dispose()
    })

    await settleUsageStartupReady(runtime.ensureFreshBootstrapForStartup({
        verboseWhenChanged,
    }))
})
