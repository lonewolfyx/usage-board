import type { ModelPricing, ModelPricingResolver } from '#shared/types/platform'
import type { ProjectInteractionUsage } from '#shared/types/usage-dashboard'
import { statSync } from 'node:fs'
import { basename } from 'node:path'
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
    const cacheCreationTokens = normalizeUsageNumber(usage.cacheCreationTokens)
    const cacheReadTokens = normalizeUsageNumber(usage.cacheReadTokens)
    const inputTokens = normalizeUsageNumber(usage.inputTokens)
    const outputTokens = normalizeUsageNumber(usage.outputTokens)
    const totalTokens = normalizeUsageNumber(usage.totalTokens)
    const baseTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens

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

export function toInteractionUsage(usage: {
    cacheCreationTokens?: number
    cacheReadTokens?: number
    costUSD?: number
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
    const toolTokens = normalizeUsageNumber(usage.toolTokens)
    const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens + reasoningOutputTokens + toolTokens

    return {
        cacheCreationTokens,
        cacheReadTokens,
        cachedInputTokens: cacheCreationTokens + cacheReadTokens,
        costUSD: usage.costUSD ?? 0,
        inputTokens,
        isFallbackModel: usage.isFallbackModel,
        outputTokens,
        reasoningOutputTokens,
        toolTokens: toolTokens > 0 ? toolTokens : undefined,
        totalTokens,
    } satisfies ProjectInteractionUsage
}

export function isZeroInteractionUsage(usage: Pick<ProjectInteractionUsage, 'cachedInputTokens' | 'inputTokens' | 'outputTokens' | 'reasoningOutputTokens' | 'toolTokens' | 'totalTokens'>) {
    return usage.totalTokens <= 0
        && usage.inputTokens <= 0
        && usage.cachedInputTokens <= 0
        && usage.outputTokens <= 0
        && usage.reasoningOutputTokens <= 0
        && (usage.toolTokens ?? 0) <= 0
}

export function calculateUsageCostFromCandidates(
    usage: Pick<ProjectInteractionUsage, 'cacheCreationTokens' | 'cachedInputTokens' | 'inputTokens' | 'outputTokens' | 'reasoningOutputTokens' | 'toolTokens'>,
    candidates: string[],
    resolvePricing: ModelPricingResolver,
    options: { includeReasoningAsOutput?: boolean } = {},
) {
    const outputTokens = usage.outputTokens
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

export function getSessionIdFromFileName(filePath: string, extension: `.${string}`) {
    return basename(filePath, extension)
}

function normalizeUsageNumber(value: number | undefined) {
    return Number.isFinite(value) && value! > 0 ? Math.trunc(value!) : 0
}
