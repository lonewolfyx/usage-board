import type { InteractionUsage } from './fact'

export function normalizeRole(value: string): string {
    const normalized = value.toLowerCase()

    if (normalized.includes('user'))
        return 'user'
    if (normalized.includes('assistant') || normalized.includes('agent') || normalized.includes('gemini'))
        return 'assistant'
    if (normalized.includes('system'))
        return 'system'
    if (normalized.includes('tool'))
        return 'tool'
    if (normalized.includes('token') || normalized.includes('usage'))
        return 'usage'
    return 'unknown'
}

export function createInteractionUsage(input: {
    cacheCreation1hTokens?: number
    cacheCreation5mTokens?: number
    cacheCreationTokens?: number
    cacheReadTokens?: number
    extraTotalTokens?: number
    inputTokens?: number
    outputTokens?: number
    reasoningOutputTokens?: number
    toolTokens?: number
    totalTokens?: number
}): InteractionUsage {
    const inputTokens = readUsageNumber(input.inputTokens)
    const outputTokens = readUsageNumber(input.outputTokens)
    const cacheCreation1hTokens = readUsageNumber(input.cacheCreation1hTokens)
    const cacheCreation5mTokens = readUsageNumber(input.cacheCreation5mTokens)
    const cacheCreationTokens = cacheCreation1hTokens > 0 || cacheCreation5mTokens > 0
        ? cacheCreation1hTokens + cacheCreation5mTokens
        : readUsageNumber(input.cacheCreationTokens)
    const cacheReadTokens = readUsageNumber(input.cacheReadTokens)
    const reasoningOutputTokens = readUsageNumber(input.reasoningOutputTokens)
    const extraTotalTokens = readUsageNumber(input.extraTotalTokens)
    const toolTokens = readUsageNumber(input.toolTokens)
    const passedTotalTokens = readUsageNumber(input.totalTokens)
    const totalTokens = passedTotalTokens > 0
        ? passedTotalTokens
        : inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens + reasoningOutputTokens + extraTotalTokens + toolTokens

    return {
        cacheCreation1hTokens,
        cacheCreation5mTokens,
        cacheCreationTokens,
        cacheReadTokens,
        extraTotalTokens,
        inputTokens,
        outputTokens,
        reasoningOutputTokens,
        toolTokens,
        totalTokens,
    }
}

export function applyTotalUsageAsExtra(input: {
    cacheCreationTokens?: number
    cacheReadTokens?: number
    extraTotalTokens?: number
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
}) {
    const parts = readUsageParts(input)
    const extraTotalTokens = Math.max(
        readUsageNumber(input.extraTotalTokens),
        parts.totalTokens > parts.baseTokens ? parts.totalTokens - parts.baseTokens : 0,
    )

    if (parts.baseTokens === 0 && parts.totalTokens > 0) {
        return {
            cacheCreationTokens: parts.cacheCreationTokens,
            cacheReadTokens: parts.cacheReadTokens,
            extraTotalTokens: 0,
            inputTokens: parts.inputTokens,
            outputTokens: parts.totalTokens,
        }
    }

    return {
        cacheCreationTokens: parts.cacheCreationTokens,
        cacheReadTokens: parts.cacheReadTokens,
        extraTotalTokens,
        inputTokens: parts.inputTokens,
        outputTokens: parts.outputTokens,
    }
}

export function applyTotalUsageFallback(input: {
    cacheCreationTokens?: number
    cacheReadTokens?: number
    inputTokens?: number
    outputTokens?: number
    reasoningOutputTokens?: number
    totalTokens?: number
}) {
    const parts = readUsageParts(input)
    const reasoningOutputTokens = Math.max(
        readUsageNumber(input.reasoningOutputTokens),
        parts.totalTokens > parts.baseTokens ? parts.totalTokens - parts.baseTokens : 0,
    )

    if (parts.baseTokens === 0 && parts.totalTokens > 0) {
        return {
            cacheCreationTokens: parts.cacheCreationTokens,
            cacheReadTokens: parts.cacheReadTokens,
            inputTokens: parts.inputTokens,
            outputTokens: parts.totalTokens,
            reasoningOutputTokens: 0,
        }
    }

    return {
        cacheCreationTokens: parts.cacheCreationTokens,
        cacheReadTokens: parts.cacheReadTokens,
        inputTokens: parts.inputTokens,
        outputTokens: parts.outputTokens,
        reasoningOutputTokens,
    }
}

export function usageHasTokens(usage: InteractionUsage) {
    return usage.totalTokens > 0
        || usage.inputTokens > 0
        || usage.outputTokens > 0
        || usage.cacheCreationTokens > 0
        || usage.cacheReadTokens > 0
        || usage.reasoningOutputTokens > 0
        || usage.extraTotalTokens > 0
        || usage.toolTokens > 0
}

function readUsageParts(input: {
    cacheCreationTokens?: number
    cacheReadTokens?: number
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
}) {
    const cacheCreationTokens = readUsageNumber(input.cacheCreationTokens)
    const cacheReadTokens = readUsageNumber(input.cacheReadTokens)
    const inputTokens = readUsageNumber(input.inputTokens)
    const outputTokens = readUsageNumber(input.outputTokens)
    const totalTokens = readUsageNumber(input.totalTokens)

    return {
        baseTokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
        cacheCreationTokens,
        cacheReadTokens,
        inputTokens,
        outputTokens,
        totalTokens,
    }
}

function readUsageNumber(value: number | undefined) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}
