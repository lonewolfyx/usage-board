import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { useDateFormat } from '#shared/utils/date'
import { normalizeStringValue, normalizeUnknownRecord } from '#shared/utils/normalize'
import { parseJsonFile, toIsoString } from '#shared/utils/platform'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    toDiscoveredUsageFile,
} from '../session-fragment'
import {
    applyTotalUsageAsExtra,
    calculateUsageCostFromCandidates,
    isZeroInteractionUsage,
    toInteractionUsage,
} from './shared'

const CODEBUFF_DEFAULT_MODEL = 'codebuff-unknown'

export const codebuffUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver()
    },
    async discoverFiles(config) {
        const groups = await Promise.all(config.codebuffPaths.map(path => glob(join(path, '**', 'chat-messages.json'), {
            absolute: true,
        }).catch(() => [])))

        return groups
            .flat()
            .flatMap(filePath => toDiscoveredUsageFile(filePath, 'codebuff'))
    },
    parseFile(filePath, resolvePricing) {
        const data = parseJsonFile(filePath)

        if (!Array.isArray(data)) {
            return []
        }

        const context = getCodebuffContext(filePath)
        const project = context.project || 'codebuff'
        const sessionId = context.sessionId
        const fragment = createSessionFragment({
            project,
            repository: `local/${project}`,
            sessionId,
            startedAt: null,
            threadName: `Codebuff ${sessionId}`,
        })
        const fallbackTimestamp = getCodebuffFallbackTimestamp(filePath, context.chatId)

        for (let index = 0; index < data.length; index += 1) {
            const message = normalizeUnknownRecord(data[index])

            if (!message || !isCodebuffAssistantMessage(message)) {
                continue
            }

            const extracted = extractCodebuffUsage(message)

            if (!extracted || !hasCodebuffSignal(extracted)) {
                continue
            }

            const model = extracted.model || CODEBUFF_DEFAULT_MODEL
            const usage = toInteractionUsage({
                ...applyTotalUsageAsExtra({
                    cacheCreationTokens: extracted.cacheCreationTokens,
                    cacheReadTokens: extracted.cacheReadTokens,
                    extraTotalTokens: extracted.extraTotalTokens,
                    inputTokens: extracted.inputTokens,
                    outputTokens: extracted.outputTokens,
                    totalTokens: extracted.totalTokens,
                }),
            })

            if (isZeroInteractionUsage(usage)) {
                continue
            }

            const costUSD = calculateUsageCostFromCandidates(
                usage,
                getCodebuffCandidates(model, inferCodebuffProvider(model)),
                resolvePricing,
                { includeExtraTotalAsOutput: true, includeReasoningAsOutput: false },
            )

            const timestamp = getCodebuffMessageTimestamp(message) ?? fallbackTimestamp

            addFragmentInteraction(fragment, {
                costUSD,
                dedupeKey: getCodebuffDedupeKey(message, sessionId, timestamp ?? '', model, usage, index),
                index,
                model,
                role: 'assistant',
                timestamp,
                type: normalizeStringValue(message.variant) || normalizeStringValue(message.role) || 'assistant',
                usage: toInteractionUsage({
                    ...usage,
                    costUSD,
                }),
            })
        }

        return fragment.interactions.length > 0 ? [fragment] : []
    },
    watchPatterns(config) {
        return config.codebuffPaths.map(path => join(path, '**', 'chat-messages.json'))
    },
} satisfies UsagePlatformAdapter

interface CodebuffUsageSnapshot {
    cacheCreationTokens: number
    cacheReadTokens: number
    credits: number
    extraTotalTokens: number
    inputTokens: number
    model: string | null
    outputTokens: number
    totalTokens: number
}

function getCodebuffContext(filePath: string) {
    const chatId = basename(dirname(filePath))
    const project = basename(dirname(dirname(filePath)))
    const channel = basename(dirname(dirname(dirname(dirname(filePath)))))

    return {
        chatId,
        project,
        sessionId: `${channel}/${project}/${chatId}`,
    }
}

function isCodebuffAssistantMessage(message: Record<string, unknown>) {
    const role = normalizeStringValue(message.variant) || normalizeStringValue(message.role)
    return role === 'ai' || role === 'agent' || role === 'assistant'
}

function extractCodebuffUsage(message: Record<string, unknown>): CodebuffUsageSnapshot | null {
    const usage = emptyCodebuffUsage()
    const metadata = normalizeUnknownRecord(message.metadata)

    if (metadata) {
        usage.model = normalizeStringValue(metadata.model) || usage.model
        mergeCodebuffUsage(usage, parseCodebuffUsageRecord(metadata.usage))
        mergeCodebuffUsage(usage, parseCodebuffUsageRecord(normalizeUnknownRecord(metadata.codebuff)?.usage))
        mergeCodebuffUsage(usage, extractCodebuffRunStateUsage(metadata))
    }

    if (usage.credits <= 0) {
        usage.credits = getFiniteNumber(message.credits)
    }

    return usage
}

function extractCodebuffRunStateUsage(metadata: Record<string, unknown>) {
    const history = normalizeUnknownRecord(metadata.runState)
    const items = normalizeUnknownRecord(history?.sessionState)
    const messages = normalizeUnknownRecord(items?.mainAgentState)?.messageHistory

    if (!Array.isArray(messages)) {
        return null
    }

    const usage = emptyCodebuffUsage()

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const entry = normalizeUnknownRecord(messages[index])

        if (!entry || normalizeStringValue(entry.role) !== 'assistant') {
            continue
        }

        const providerOptions = normalizeUnknownRecord(entry.providerOptions)

        if (!providerOptions) {
            continue
        }

        const entryUsage = emptyCodebuffUsage()
        mergeCodebuffUsage(entryUsage, parseCodebuffUsageRecord(providerOptions.usage))
        const codebuff = normalizeUnknownRecord(providerOptions.codebuff)
        mergeCodebuffUsage(entryUsage, parseCodebuffUsageRecord(codebuff?.usage))
        entryUsage.model = normalizeStringValue(codebuff?.model) || entryUsage.model
        mergeCodebuffUsage(usage, entryUsage)
    }

    return usage
}

function parseCodebuffUsageRecord(value: unknown): CodebuffUsageSnapshot | null {
    const record = normalizeUnknownRecord(value)

    if (!record) {
        return null
    }

    const raw = applyTotalUsageAsExtra({
        cacheCreationTokens: pickUsageNumber(record, ['cacheCreationInputTokens', 'cache_creation_input_tokens', 'cacheCreationTokens', 'cache_creation_tokens', 'cachedTokensCreated', 'cached_tokens_created']),
        cacheReadTokens: Math.max(
            pickUsageNumber(record, ['cacheReadInputTokens', 'cache_read_input_tokens']),
            pickNestedUsageNumber(record, 'promptTokensDetails', ['cachedTokens']),
            pickNestedUsageNumber(record, 'prompt_tokens_details', ['cached_tokens']),
        ),
        inputTokens: pickUsageNumber(record, ['inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens']),
        outputTokens: pickUsageNumber(record, ['outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens']),
        totalTokens: pickUsageNumber(record, ['totalTokens', 'total_tokens', 'total']),
    })

    return {
        cacheCreationTokens: raw.cacheCreationTokens,
        cacheReadTokens: raw.cacheReadTokens,
        credits: getFiniteNumber(record.credits),
        extraTotalTokens: raw.extraTotalTokens,
        inputTokens: raw.inputTokens,
        model: normalizeStringValue(record.model) ?? null,
        outputTokens: raw.outputTokens,
        totalTokens: raw.inputTokens + raw.outputTokens + raw.cacheCreationTokens + raw.cacheReadTokens + raw.extraTotalTokens,
    }
}

function emptyCodebuffUsage(): CodebuffUsageSnapshot {
    return {
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        credits: 0,
        extraTotalTokens: 0,
        inputTokens: 0,
        model: null,
        outputTokens: 0,
        totalTokens: 0,
    }
}

function mergeCodebuffUsage(target: CodebuffUsageSnapshot, fallback: CodebuffUsageSnapshot | null) {
    if (!fallback) {
        return
    }

    if (target.inputTokens === 0) {
        target.inputTokens = fallback.inputTokens
    }

    if (target.outputTokens === 0) {
        target.outputTokens = fallback.outputTokens
    }

    if (target.cacheCreationTokens === 0) {
        target.cacheCreationTokens = fallback.cacheCreationTokens
    }

    if (target.cacheReadTokens === 0) {
        target.cacheReadTokens = fallback.cacheReadTokens
    }

    if (target.extraTotalTokens === 0) {
        target.extraTotalTokens = fallback.extraTotalTokens
    }

    if (target.totalTokens === 0) {
        target.totalTokens = fallback.totalTokens
    }

    if (target.credits <= 0) {
        target.credits = fallback.credits
    }

    if (!target.model) {
        target.model = fallback.model
    }
}

function hasCodebuffSignal(usage: CodebuffUsageSnapshot) {
    return usage.inputTokens > 0
        || usage.outputTokens > 0
        || usage.cacheCreationTokens > 0
        || usage.cacheReadTokens > 0
        || usage.extraTotalTokens > 0
        || usage.totalTokens > 0
        || usage.credits > 0
}

function getCodebuffMessageTimestamp(message: Record<string, unknown>) {
    return toIsoString(message.timestamp)
        || toIsoString(message.createdAt)
        || toIsoString(normalizeUnknownRecord(message.metadata)?.timestamp)
}

function getCodebuffFallbackTimestamp(filePath: string, chatId: string) {
    const parsed = toIsoString(chatId.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2}).*/u, '$1T$2:$3:$4Z'))

    if (parsed) {
        return parsed
    }

    try {
        return useDateFormat(statSync(filePath).mtimeMs, 'iso') ?? new Date(statSync(filePath).mtimeMs).toISOString()
    }
    catch {
        return null
    }
}

function inferCodebuffProvider(model: string) {
    const normalized = model.toLowerCase()

    if (normalized.startsWith('claude-') || normalized.startsWith('anthropic/')) {
        return 'anthropic'
    }

    if (normalized.startsWith('gpt-') || normalized.startsWith('o1') || normalized.startsWith('o3') || normalized.startsWith('o4') || normalized.startsWith('openai/')) {
        return 'openai'
    }

    if (normalized.startsWith('gemini') || normalized.startsWith('google/')) {
        return 'google'
    }

    if (normalized.startsWith('grok') || normalized.startsWith('xai/')) {
        return 'xai'
    }

    if (normalized.startsWith('openrouter/')) {
        return 'openrouter'
    }

    return 'unknown'
}

function getCodebuffCandidates(model: string, provider: string) {
    return provider !== 'unknown' && !model.startsWith(`${provider}/`)
        ? [model, `${provider}/${model}`]
        : [model]
}

function getCodebuffDedupeKey(
    message: Record<string, unknown>,
    sessionId: string,
    timestamp: string,
    model: string,
    usage: ReturnType<typeof toInteractionUsage>,
    index: number,
) {
    const messageId = normalizeStringValue(message.id)

    if (messageId) {
        return `codebuff:${sessionId}:${messageId}`
    }

    return [
        'codebuff',
        sessionId,
        timestamp,
        model,
        String(index),
        String(usage.inputTokens),
        String(usage.outputTokens),
        String(usage.cacheReadTokens ?? 0),
        String(usage.cacheCreationTokens ?? 0),
        String(usage.extraTotalTokens ?? 0),
    ].join(':')
}

function pickUsageNumber(record: Record<string, unknown>, keys: string[]) {
    return keys.reduce((maximum, key) => Math.max(maximum, getFiniteNumber(record[key])), 0)
}

function pickNestedUsageNumber(record: Record<string, unknown>, parentKey: string, keys: string[]) {
    return pickUsageNumber(normalizeUnknownRecord(record[parentKey]) ?? {}, keys)
}

function getFiniteNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}
