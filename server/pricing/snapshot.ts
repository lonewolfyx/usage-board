import type { ModelPricingResolver } from '#shared/types/platform'
import { createLiteLLMPricingResolver, resetRemotePricingCache } from '#shared/platform/pricing'
import { log } from '@clack/prompts'

let startupPricingPromise: Promise<ModelPricingResolver> | null = null

export function preparePricingSnapshot() {
    if (!startupPricingPromise) {
        startupPricingPromise = (async () => {
            const startedAt = Date.now()

            if (process.env.USAGE_BOARD_STARTUP_VERBOSE === '1') {
                log.step('正在刷新 pricing-data 快照...')
            }

            resetRemotePricingCache()

            try {
                const resolver = await createLiteLLMPricingResolver({ forceRefresh: true })

                if (process.env.USAGE_BOARD_STARTUP_VERBOSE === '1') {
                    log.info(`pricing-data 快照已准备完成 (${Date.now() - startedAt}ms)`)
                }

                return resolver
            }
            catch (error) {
                if (process.env.USAGE_BOARD_STARTUP_VERBOSE === '1') {
                    log.warn(`pricing-data 远程刷新失败，使用本地快照: ${error instanceof Error ? error.message : String(error)}`)
                }

                return createLiteLLMPricingResolver()
            }
        })()
    }

    return startupPricingPromise
}
