import type { ModelPricing, ModelPricingResolver } from '#shared/types/platform'
import type { ProjectInteractionUsage } from '#shared/types/usage-dashboard'
import { statSync } from 'node:fs'
import { useDateFormat } from '#shared/utils/date'

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
    const reasoningOutputTokens = Math.max(
        usage.reasoningOutputTokens ?? 0,
        totalTokens > baseTokens ? totalTokens - baseTokens : 0,
    )

    if (baseTokens === 0 && totalTokens > 0) {
        return {
            cacheCreationTokens,
            cacheReadTokens,
            inputTokens,
            outputTokens: totalTokens,
            reasoningOutputTokens: 0,
        }
    }

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
    const extraTotalTokens = Math.max(
        usage.extraTotalTokens ?? 0,
        totalTokens > baseTokens ? totalTokens - baseTokens : 0,
    )

    if (baseTokens === 0 && totalTokens > 0) {
        return {
            cacheCreationTokens,
            cacheReadTokens,
            inputTokens,
            outputTokens: totalTokens,
            extraTotalTokens: 0,
        }
    }

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
    const cacheCreationTokens = usage.cacheCreationTokens ?? 0
    const cacheReadTokens = usage.cacheReadTokens ?? 0
    const inputTokens = usage.inputTokens ?? 0
    const outputTokens = usage.outputTokens ?? 0
    const reasoningOutputTokens = usage.reasoningOutputTokens ?? 0
    const extraTotalTokens = usage.extraTotalTokens ?? 0
    const toolTokens = usage.toolTokens ?? 0
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
    void usage
    void candidates
    void resolvePricing
    void options
    return 0
}

export function getFileModifiedAtIso(filePath: string) {
    try {
        return useDateFormat(statSync(filePath).mtimeMs, 'iso') ?? new Date(statSync(filePath).mtimeMs).toISOString()
    }
    catch {
        return null
    }
}

function readUsageParts(usage: {
    cacheCreationTokens?: number
    cacheReadTokens?: number
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
}) {
    const cacheCreationTokens = usage.cacheCreationTokens ?? 0
    const cacheReadTokens = usage.cacheReadTokens ?? 0
    const inputTokens = usage.inputTokens ?? 0
    const outputTokens = usage.outputTokens ?? 0
    const totalTokens = usage.totalTokens ?? 0

    return {
        baseTokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
        cacheCreationTokens,
        cacheReadTokens,
        inputTokens,
        outputTokens,
        totalTokens,
    }
}
