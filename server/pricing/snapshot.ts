import type { ModelPricingResolver } from '#shared/types/platform'
import { createLiteLLMPricingResolver, resetRemotePricingCache } from '#shared/platform/pricing'
import { log } from '@clack/prompts'

let startupPricingPromise: Promise<ModelPricingResolver> | null = null

export function preparePricingSnapshot() {
    if (!startupPricingPromise) {
        startupPricingPromise = (async () => {
            const startedAt = Date.now()

            log.step('Refreshing pricing-data snapshot...')

            resetRemotePricingCache()

            try {
                const resolver = await createLiteLLMPricingResolver({ forceRefresh: true })

                log.info(`pricing-data snapshot ready (${Date.now() - startedAt}ms)`)

                return resolver
            }
            catch (error) {
                log.warn(`pricing-data remote refresh failed, using local snapshot: ${error instanceof Error ? error.message : String(error)}`)

                return createLiteLLMPricingResolver()
            }
        })()
    }

    return startupPricingPromise
}
