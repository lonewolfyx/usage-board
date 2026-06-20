import { getUsageDataRuntime } from '#server/services/usage-data-runtime'
import { settleUsageStartupReady } from '#server/services/usage-startup-state'
import { refreshPricingDataSnapshots } from '#shared/platform/pricing'
import { resolveConfig } from '#shared/utils/configs'
import { log } from '@clack/prompts'

export default defineNitroPlugin(async (nitroApp) => {
    const runtimeConfig = useRuntimeConfig()
    const config = resolveConfig(runtimeConfig.public)
    const runtime = getUsageDataRuntime(config)
    const verboseWhenChanged = process.env.USAGE_BOARD_STARTUP_VERBOSE === '1'

    nitroApp.hooks.hookOnce('close', () => {
        runtime.dispose()
    })

    const startup = (async () => {
        log.step('正在刷新模型价格快照...')
        const pricingRefresh = await refreshPricingDataSnapshots()

        logPricingSnapshot('LiteLLM', pricingRefresh.liteLLM)
        logPricingSnapshot('models.dev', pricingRefresh.modelsDev)
        log.info(`模型价格快照准备完成：来源 ${pricingRefresh.source === 'remote' ? 'remote/local merged' : 'local fallback'}，fast multiplier 覆盖 ${pricingRefresh.fastMultiplierOverrideCount} 条`)

        await runtime.ensureFreshBootstrapForStartup({
            verboseWhenChanged,
        })
    })()

    await settleUsageStartupReady(startup)
})

function logPricingSnapshot(
    label: string,
    snapshot: {
        changed: boolean
        modelCount: number
        path: string
        remoteError: string | null
        remoteOk: boolean
    },
) {
    if (snapshot.remoteOk) {
        log.success(`${label} 价格远程获取成功，${snapshot.changed ? '已写入更新' : '本地快照无变化'}：${snapshot.path}（${snapshot.modelCount} 个模型）`)
        return
    }

    log.warn(`${label} 价格远程获取失败，使用本地快照：${snapshot.remoteError ?? 'unknown error'}（${snapshot.modelCount} 个模型，${snapshot.path}）`)
}
