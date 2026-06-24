import type { UsageInteractionFact } from '#server/agents/shared/fact'
import type { ModelPricing, ModelPricingResolver, ResolvedCostSource } from '#shared/types/platform'
import { roundCurrency, uniqueItems } from '#shared/utils/usage-dashboard'

const MILLION = 1_000_000
const CACHE_CREATE_1H_INPUT_MULTIPLIER = 2

export interface ResolvedUsageCost {
    costSource: ResolvedCostSource
    costUSD: number
    missingPricingModel: string | null
}

export function resolveUsageFactCost(
    fact: UsageInteractionFact,
    resolvePricing: ModelPricingResolver,
    options: { defaultFastMultiplier?: number } = {},
): ResolvedUsageCost {
    if (fact.rawCostUSD != null && Number.isFinite(fact.rawCostUSD)) {
        return {
            costSource: 'raw',
            costUSD: roundCurrency(fact.rawCostUSD),
            missingPricingModel: null,
        }
    }

    const candidates = uniqueItems([
        ...fact.modelLookupCandidates,
        fact.model ?? '',
    ].map(candidate => candidate.trim()).filter(Boolean))

    for (const candidate of candidates) {
        const costUSD = calculateUsageCostUSD(fact, resolvePricing(candidate), options)

        if (costUSD > 0) {
            return {
                costSource: 'calculated',
                costUSD,
                missingPricingModel: null,
            }
        }
    }

    return {
        costSource: 'none',
        costUSD: 0,
        missingPricingModel: candidates[0] ?? fact.model,
    }
}

export function calculateUsageCostUSD(
    fact: UsageInteractionFact,
    pricing: ModelPricing,
    options: { defaultFastMultiplier?: number } = {},
) {
    const usage = fact.usage
    const multiplier = fact.speed === 'fast'
        ? (pricing.fastMultiplier ?? options.defaultFastMultiplier ?? 1)
        : 1
    const cacheCreation5mTokens = usage.cacheCreation5mTokens > 0 || usage.cacheCreation1hTokens > 0
        ? usage.cacheCreation5mTokens
        : usage.cacheCreationTokens

    const inputCost = calculateTieredCost(usage.inputTokens, pricing.inputCostPerMTokens, pricing.inputCostPerMTokensAbove200K)
    const outputCost = calculateTieredCost(
        usage.outputTokens + usage.reasoningOutputTokens + usage.toolTokens + usage.extraTotalTokens,
        pricing.outputCostPerMTokens,
        pricing.outputCostPerMTokensAbove200K,
    )
    const cacheCreation5mCost = calculateTieredCost(
        cacheCreation5mTokens,
        pricing.cacheCreationInputCostPerMTokens,
        pricing.cacheCreationInputCostPerMTokensAbove200K,
    )
    const cacheCreation1hCost = calculateTieredCost(
        usage.cacheCreation1hTokens,
        pricing.inputCostPerMTokens * CACHE_CREATE_1H_INPUT_MULTIPLIER,
        pricing.inputCostPerMTokensAbove200K == null
            ? undefined
            : pricing.inputCostPerMTokensAbove200K * CACHE_CREATE_1H_INPUT_MULTIPLIER,
    )
    const cacheReadCost = calculateTieredCost(
        usage.cacheReadTokens,
        pricing.cachedInputCostPerMTokens,
        pricing.cachedInputCostPerMTokensAbove200K,
    )

    return roundCurrency((inputCost + outputCost + cacheCreation5mCost + cacheCreation1hCost + cacheReadCost) * multiplier)
}

function calculateTieredCost(tokens: number, baseCostPerMTokens: number, above200KCostPerMTokens?: number) {
    if (tokens <= 0 || baseCostPerMTokens <= 0) {
        return 0
    }

    if (above200KCostPerMTokens == null || tokens <= 200_000) {
        return (tokens / MILLION) * baseCostPerMTokens
    }

    return (200_000 / MILLION) * baseCostPerMTokens
        + ((tokens - 200_000) / MILLION) * above200KCostPerMTokens
}
