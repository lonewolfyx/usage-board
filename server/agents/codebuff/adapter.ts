import type { AgentAdapter, InteractionUsage, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { CodebuffMessageRaw, CodebuffMetadataRaw, CodebuffUsageRaw } from './types'
import { basename, dirname, join } from 'node:path'
import { discoverSourceFiles, readJsonFile } from '#server/agents/shared/io'
import { createModelLookupCandidates } from '#server/agents/shared/model'
import { applyTotalUsageAsExtra, createInteractionUsage, usageHasTokens } from '#server/agents/shared/usage'
import { useDateFormat } from '#shared/utils/date'
import { toIsoString } from '#shared/utils/platform'

const CODEBUFF_DEFAULT_MODEL = 'codebuff-unknown'

export class CodebuffAdapter implements AgentAdapter {
    readonly platform = 'codebuff' as const
    private readonly patterns: string[]

    constructor(config: IConfig) {
        this.patterns = config.codebuffPaths.map(path => join(path, '**', 'chat-messages.json'))
    }

    discoverSources() {
        return discoverSourceFiles(this.platform, this.patterns)
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadCodebuffFacts(source), source }
    }

    watchSourcePatterns() {
        return this.patterns
    }
}

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

function loadCodebuffFacts(source: UsageSourceFile): UsageInteractionFact[] {
    const data = readJsonFile<CodebuffMessageRaw[]>(source.path)

    if (!Array.isArray(data)) {
        return []
    }

    const context = getCodebuffContext(source.path)
    const project = context.project || 'codebuff'
    const sessionId = context.sessionId
    const fallbackTimestamp = getCodebuffFallbackTimestamp(context.chatId, source.mtimeMs)
    const facts: UsageInteractionFact[] = []

    for (let index = 0; index < data.length; index += 1) {
        const message = data[index]

        if (!message) {
            continue
        }

        const messageRole = message.variant?.trim() || message.role?.trim()

        if (messageRole !== 'ai' && messageRole !== 'agent' && messageRole !== 'assistant') {
            continue
        }

        const extracted = extractCodebuffUsage(message)

        if (!extracted || !hasCodebuffSignal(extracted)) {
            continue
        }

        const model = extracted.model || CODEBUFF_DEFAULT_MODEL
        const usage = createInteractionUsage({
            ...applyTotalUsageAsExtra({
                cacheCreationTokens: extracted.cacheCreationTokens,
                cacheReadTokens: extracted.cacheReadTokens,
                extraTotalTokens: extracted.extraTotalTokens,
                inputTokens: extracted.inputTokens,
                outputTokens: extracted.outputTokens,
                totalTokens: extracted.totalTokens,
            }),
        })

        if (!usageHasTokens(usage)) {
            continue
        }

        const provider = inferCodebuffProvider(model)
        const timestamp = getCodebuffMessageTimestamp(message) ?? fallbackTimestamp

        facts.push({
            dedupeKey: getCodebuffDedupeKey(message, sessionId, timestamp, model, usage, index),
            fallbackDedupeKey: null,
            interactionIndex: index,
            isSidechain: false,
            model,
            modelLookupCandidates: createModelLookupCandidates({
                model,
                provider: provider !== 'unknown' && !model.startsWith(`${provider}/`) ? provider : null,
            }),
            platform: 'codebuff',
            project,
            provider: provider !== 'unknown' ? provider : null,
            rawCostUSD: null,
            repository: `local/${project}`,
            role: 'assistant',
            sessionId,
            sourceFile: source.path,
            sourceFileMtime: source.mtimeMs,
            speed: 'standard',
            threadName: `Codebuff ${sessionId}`,
            timestamp,
            type: messageRole,
            usage,
        })
    }

    return facts
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

function getCodebuffFallbackTimestamp(chatId: string, mtimeMs: number): string {
    const parsed = toIsoString(chatId.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2}).*/u, '$1T$2:$3:$4Z'))

    if (parsed) {
        return parsed
    }

    return useDateFormat(mtimeMs, 'iso') ?? new Date(mtimeMs).toISOString()
}

function getCodebuffMessageTimestamp(message: CodebuffMessageRaw): string | null {
    return toIsoString(message.timestamp)
        || toIsoString(message.createdAt)
        || toIsoString(message.metadata?.timestamp)
}

function extractCodebuffUsage(message: CodebuffMessageRaw): CodebuffUsageSnapshot | null {
    const usage = emptyCodebuffUsage()
    const metadata = message.metadata

    if (metadata) {
        const metadataModel = typeof metadata.model === 'string' ? metadata.model.trim() : ''
        usage.model = metadataModel || usage.model
        mergeCodebuffUsage(usage, parseCodebuffUsageRecord(metadata.usage))
        mergeCodebuffUsage(usage, parseCodebuffUsageRecord(metadata.codebuff?.usage))
        mergeCodebuffUsage(usage, extractCodebuffRunStateUsage(metadata))
    }

    if (usage.credits <= 0) {
        usage.credits = typeof message.credits === 'number' && Number.isFinite(message.credits) ? Math.max(0, Math.trunc(message.credits)) : 0
    }

    return usage
}

function extractCodebuffRunStateUsage(metadata: CodebuffMetadataRaw): CodebuffUsageSnapshot | null {
    const messages = metadata.runState?.sessionState?.mainAgentState?.messageHistory

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
        const codebuffModel = codebuff?.model
        entryUsage.model = (typeof codebuffModel === 'string' ? codebuffModel.trim() : '') || entryUsage.model
        mergeCodebuffUsage(usage, entryUsage)
    }

    return usage
}

function parseCodebuffUsageRecord(value: CodebuffUsageRaw | null | undefined): CodebuffUsageSnapshot | null {
    if (!value) {
        return null
    }

    const record = value as unknown as Record<string, unknown>
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
    const modelValue = record.model
    const credits = typeof record.credits === 'number' && Number.isFinite(record.credits) ? Math.max(0, Math.trunc(record.credits)) : 0

    return {
        cacheCreationTokens: raw.cacheCreationTokens,
        cacheReadTokens: raw.cacheReadTokens,
        credits,
        extraTotalTokens: raw.extraTotalTokens,
        inputTokens: raw.inputTokens,
        model: typeof modelValue === 'string' ? modelValue.trim() || null : null,
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
    message: CodebuffMessageRaw,
    sessionId: string,
    timestamp: string,
    model: string,
    usage: InteractionUsage,
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
        String(usage.cacheReadTokens),
        String(usage.cacheCreationTokens),
        String(usage.extraTotalTokens),
    ].join(':')
}

function pickUsageNumber(record: Record<string, unknown>, keys: string[]): number {
    return keys.reduce((maximum, key) => {
        const v = record[key]
        return Math.max(maximum, typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0)
    }, 0)
}

function pickNestedUsageNumber(record: Record<string, unknown>, parentKey: string, keys: string[]): number {
    return pickUsageNumber((record[parentKey] ?? {}) as Record<string, unknown>, keys)
}
