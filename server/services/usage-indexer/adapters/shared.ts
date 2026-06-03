import type { ModelPricing, ModelPricingResolver } from '#shared/types/platform'
import type { ProjectInteractionUsage } from '#shared/types/usage-dashboard'
import { statSync } from 'node:fs'
import { calculateUsageCostUSD } from '#shared/platform/pricing'
import { uniqueItems } from '#shared/utils/usage-dashboard'

const ZERO_PRICING: ModelPricing = {
    cachedInputCostPerMTokens: 0,
    cacheCreationInputCostPerMTokens: 0,
    inputCostPerMTokens: 0,
    outputCostPerMTokens: 0,
}

export async function createZeroPricingResolver(): Promise<ModelPricingResolver> {
    return () => ZERO_PRICING
}

export function applyTotalUsageFallback(usage: {
    cacheCreationTokens?: number
    cacheReadTokens?: number
    inputTokens?: number
    outputTokens?: number
    reasoningOutputTokens?: number
    totalTokens?: number
}) {
    const { baseTokens, cacheCreationTokens, cacheReadTokens, inputTokens, outputTokens, totalTokens } = readUsageParts(usage)

    if (baseTokens === 0 && totalTokens > 0) {
        return {
            cacheCreationTokens,
            cacheReadTokens,
            inputTokens,
            outputTokens: totalTokens,
            reasoningOutputTokens: 0,
        }
    }

    const reasoningOutputTokens = Math.max(
        normalizeUsageNumber(usage.reasoningOutputTokens),
        totalTokens > baseTokens ? totalTokens - baseTokens : 0,
    )

    return {
        cacheCreationTokens,
        cacheReadTokens,
        inputTokens,
        outputTokens,
        reasoningOutputTokens,
    }
}

export function applyTotalUsageAsExtra(usage: {
    cacheCreationTokens?: number
    cacheReadTokens?: number
    extraTotalTokens?: number
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
}) {
    const { baseTokens, cacheCreationTokens, cacheReadTokens, inputTokens, outputTokens, totalTokens } = readUsageParts(usage)

    if (baseTokens === 0 && totalTokens > 0) {
        return {
            cacheCreationTokens,
            cacheReadTokens,
            inputTokens,
            outputTokens: totalTokens,
            extraTotalTokens: 0,
        }
    }

    const extraTotalTokens = Math.max(
        normalizeUsageNumber(usage.extraTotalTokens),
        totalTokens > baseTokens ? totalTokens - baseTokens : 0,
    )

    return {
        cacheCreationTokens,
        cacheReadTokens,
        inputTokens,
        outputTokens,
        extraTotalTokens,
    }
}

export function toInteractionUsage(usage: {
    cacheCreationTokens?: number
    cacheReadTokens?: number
    costUSD?: number
    extraTotalTokens?: number
    inputTokens?: number
    isFallbackModel?: boolean
    outputTokens?: number
    reasoningOutputTokens?: number
    toolTokens?: number
}) {
    const cacheCreationTokens = normalizeUsageNumber(usage.cacheCreationTokens)
    const cacheReadTokens = normalizeUsageNumber(usage.cacheReadTokens)
    const inputTokens = normalizeUsageNumber(usage.inputTokens)
    const outputTokens = normalizeUsageNumber(usage.outputTokens)
    const reasoningOutputTokens = normalizeUsageNumber(usage.reasoningOutputTokens)
    const extraTotalTokens = normalizeUsageNumber(usage.extraTotalTokens)
    const toolTokens = normalizeUsageNumber(usage.toolTokens)
    const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens + reasoningOutputTokens + extraTotalTokens + toolTokens

    return {
        cacheCreationTokens,
        cacheReadTokens,
        cachedInputTokens: cacheCreationTokens + cacheReadTokens,
        costUSD: usage.costUSD ?? 0,
        extraTotalTokens: extraTotalTokens > 0 ? extraTotalTokens : undefined,
        inputTokens,
        isFallbackModel: usage.isFallbackModel,
        outputTokens,
        reasoningOutputTokens,
        toolTokens: toolTokens > 0 ? toolTokens : undefined,
        totalTokens,
    } satisfies ProjectInteractionUsage
}

export function isZeroInteractionUsage(usage: Pick<ProjectInteractionUsage, 'cachedInputTokens' | 'extraTotalTokens' | 'inputTokens' | 'outputTokens' | 'reasoningOutputTokens' | 'toolTokens' | 'totalTokens'>) {
    return usage.totalTokens <= 0
        && usage.inputTokens <= 0
        && usage.cachedInputTokens <= 0
        && usage.outputTokens <= 0
        && usage.reasoningOutputTokens <= 0
        && (usage.extraTotalTokens ?? 0) <= 0
        && (usage.toolTokens ?? 0) <= 0
}

export function calculateUsageCostFromCandidates(
    usage: Pick<ProjectInteractionUsage, 'cacheCreationTokens' | 'cachedInputTokens' | 'extraTotalTokens' | 'inputTokens' | 'outputTokens' | 'reasoningOutputTokens' | 'toolTokens'>,
    candidates: string[],
    resolvePricing: ModelPricingResolver,
    options: { includeExtraTotalAsOutput?: boolean, includeReasoningAsOutput?: boolean } = {},
) {
    const outputTokens = usage.outputTokens
        + (options.includeExtraTotalAsOutput === false ? 0 : (usage.extraTotalTokens ?? 0))
        + (usage.toolTokens ?? 0)
        + (options.includeReasoningAsOutput === false ? 0 : usage.reasoningOutputTokens)

    for (const candidate of uniqueItems(candidates.map(candidate => candidate.trim()).filter(Boolean))) {
        const costUSD = calculateUsageCostUSD({
            cacheCreationTokens: usage.cacheCreationTokens ?? 0,
            cachedInputTokens: usage.cachedInputTokens,
            inputTokens: usage.inputTokens,
            outputTokens,
        }, resolvePricing(candidate))

        if (costUSD > 0) {
            return costUSD
        }
    }

    return 0
}

export function getFileModifiedAtIso(filePath: string) {
    try {
        return new Date(statSync(filePath).mtimeMs).toISOString()
    }
    catch {
        return null
    }
}

function normalizeUsageNumber(value: number | undefined) {
    return Number.isFinite(value) && value! > 0 ? Math.trunc(value!) : 0
}

function readUsageParts(usage: {
    cacheCreationTokens?: number
    cacheReadTokens?: number
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
}) {
    const cacheCreationTokens = normalizeUsageNumber(usage.cacheCreationTokens)
    const cacheReadTokens = normalizeUsageNumber(usage.cacheReadTokens)
    const inputTokens = normalizeUsageNumber(usage.inputTokens)
    const outputTokens = normalizeUsageNumber(usage.outputTokens)
    const totalTokens = normalizeUsageNumber(usage.totalTokens)

    return {
        baseTokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
        cacheCreationTokens,
        cacheReadTokens,
        inputTokens,
        outputTokens,
        totalTokens,
    }
}
