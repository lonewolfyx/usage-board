import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { useDateFormat } from '#shared/utils/date'
import { parseJsonFile, toIsoString } from '#shared/utils/platform'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    toDiscoveredUsageFile,
} from '../session-fragment'
import {
    applyTotalUsageAsExtra,
    isZeroInteractionUsage,
    toInteractionUsage,
} from './shared'

const CODEBUFF_DEFAULT_MODEL = 'codebuff-unknown'

interface CodebuffMessage {
    createdAt?: string | number
    credits?: number
    id?: string
    metadata?: CodebuffMetadata
    role?: string
    timestamp?: string | number
    variant?: string
}

interface CodebuffMetadata {
    codebuff?: {
        model?: string
        usage?: CodebuffUsageRecord
    }
    model?: string
    runState?: CodebuffRunState
    timestamp?: string | number
    usage?: CodebuffUsageRecord
}

interface CodebuffRunState {
    sessionState?: {
        mainAgentState?: {
            messageHistory?: CodebuffRunStateMessage[]
        }
    }
}

interface CodebuffRunStateMessage {
    providerOptions?: {
        codebuff?: {
            model?: string
            usage?: CodebuffUsageRecord
        }
        usage?: CodebuffUsageRecord
    }
    role?: string
}

interface CodebuffUsageRecord {
    cache_creation_input_tokens?: number
    cache_creation_tokens?: number
    cache_read_input_tokens?: number
    cached_tokens_created?: number
    cachedTokensCreated?: number
    cacheCreationInputTokens?: number
    cacheCreationTokens?: number
    cacheReadInputTokens?: number
    completion_tokens?: number
    completionTokens?: number
    credits?: number
    input_tokens?: number
    inputTokens?: number
    model?: string
    output_tokens?: number
    outputTokens?: number
    prompt_tokens?: number
    prompt_tokens_details?: {
        cached_tokens?: number
    }
    promptTokens?: number
    promptTokensDetails?: {
        cachedTokens?: number
    }
    total?: number
    total_tokens?: number
    totalTokens?: number
}

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
    parseFile(filePath) {
        const data = parseJsonFile<CodebuffMessage[]>(filePath)

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
            const message = data[index]

            const messageRole = message ? (message.variant?.trim() || message.role?.trim()) : undefined
            if (!message || !(messageRole === 'ai' || messageRole === 'agent' || messageRole === 'assistant')) {
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

            const provider = inferCodebuffProvider(model)
            const candidates = provider !== 'unknown' && !model.startsWith(`${provider}/`) ? [model, `${provider}/${model}`] : [model]

            const timestamp = getCodebuffMessageTimestamp(message) ?? fallbackTimestamp

            addFragmentInteraction(fragment, {
                costUSD: 0,
                dedupeKey: getCodebuffDedupeKey(message, sessionId, timestamp ?? '', model, usage, index),
                index,
                model,
                modelLookupCandidates: candidates,
                rawCostUSD: null,
                role: 'assistant',
                timestamp,
                type: message.variant?.trim() || message.role?.trim() || 'assistant',
                usage: toInteractionUsage({
                    ...usage,
                    costUSD: 0,
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

function extractCodebuffUsage(message: CodebuffMessage): CodebuffUsageSnapshot | null {
    const usage = emptyCodebuffUsage()
    const metadata = message.metadata

    if (metadata) {
        usage.model = metadata.model?.trim() || usage.model
        mergeCodebuffUsage(usage, parseCodebuffUsageRecord(metadata.usage))
        mergeCodebuffUsage(usage, parseCodebuffUsageRecord(metadata.codebuff?.usage))
        mergeCodebuffUsage(usage, extractCodebuffRunStateUsage(metadata))
    }

    if (usage.credits <= 0) {
        usage.credits = typeof message.credits === 'number' && Number.isFinite(message.credits) ? Math.max(0, Math.trunc(message.credits)) : 0
    }

    return usage
}

function extractCodebuffRunStateUsage(metadata: CodebuffMetadata) {
    const history = metadata.runState
    const items = history?.sessionState
    const messages = items?.mainAgentState?.messageHistory

    if (!Array.isArray(messages)) {
        return null
    }

    const usage = emptyCodebuffUsage()

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const entry = messages[index]

        if (!entry || entry.role?.trim() !== 'assistant') {
            continue
        }

        const providerOptions = entry.providerOptions

        if (!providerOptions) {
            continue
        }

        const entryUsage = emptyCodebuffUsage()
        mergeCodebuffUsage(entryUsage, parseCodebuffUsageRecord(providerOptions.usage))
        const codebuff = providerOptions.codebuff
        mergeCodebuffUsage(entryUsage, parseCodebuffUsageRecord(codebuff?.usage))
        entryUsage.model = codebuff?.model?.trim() || entryUsage.model
        mergeCodebuffUsage(usage, entryUsage)
    }

    return usage
}

function parseCodebuffUsageRecord(record: CodebuffUsageRecord | null | undefined): CodebuffUsageSnapshot | null {
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
        credits: typeof record.credits === 'number' && Number.isFinite(record.credits) ? Math.max(0, Math.trunc(record.credits)) : 0,
        extraTotalTokens: raw.extraTotalTokens,
        inputTokens: raw.inputTokens,
        model: record.model?.trim() ?? null,
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

function getCodebuffMessageTimestamp(message: CodebuffMessage) {
    return toIsoString(message.timestamp)
        || toIsoString(message.createdAt)
        || toIsoString(message.metadata?.timestamp)
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

function getCodebuffDedupeKey(
    message: CodebuffMessage,
    sessionId: string,
    timestamp: string,
    model: string,
    usage: ReturnType<typeof toInteractionUsage>,
    index: number,
) {
    const messageId = message.id?.trim()

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

function pickUsageNumber(record: CodebuffUsageRecord, keys: Array<keyof CodebuffUsageRecord>) {
    return keys.reduce((maximum, key) => {
        const v = record[key]
        return Math.max(maximum, typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0)
    }, 0)
}

function pickNestedUsageNumber(
    record: CodebuffUsageRecord,
    parentKey: 'promptTokensDetails' | 'prompt_tokens_details',
    keys: Array<'cachedTokens' | 'cached_tokens'>,
) {
    const nested = record[parentKey]

    if (!nested) {
        return 0
    }

    return keys.reduce((maximum, key) => {
        const value = nested[key as keyof typeof nested]
        return Math.max(maximum, typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0)
    }, 0)
}
