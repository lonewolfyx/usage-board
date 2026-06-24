import type { AgentAdapter, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { AmpMessageRaw, AmpThreadRaw } from './types'
import { basename } from 'node:path'
import { discoverSourceFiles, readJsonFile } from '#server/agents/shared/io'
import { applyTotalUsageAsExtra, createInteractionUsage, usageHasTokens } from '#server/agents/shared/usage'
import { toIsoString } from '#shared/utils/platform'

export class AmpAdapter implements AgentAdapter {
    readonly platform = 'amp' as const
    private readonly patterns: string[]

    constructor(config: IConfig) {
        this.patterns = config.ampPaths.map(path => `${path.replace(/\/$/u, '')}/threads/**/*.json`)
    }

    discoverSources() {
        return discoverSourceFiles(this.platform, this.patterns)
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadAmpFacts(source), source }
    }

    watchSourcePatterns() {
        return this.patterns
    }
}

function loadAmpFacts(source: UsageSourceFile): UsageInteractionFact[] {
    const thread = readJsonFile<AmpThreadRaw>(source.path)
    const sessionId = typeof thread?.id === 'string' ? thread.id.trim() : basename(source.path, '.json')
    const events = thread?.usageLedger?.events
    const eventList = Array.isArray(events) ? events : []
    const cacheTokensByMessageId = getAmpCacheTokens(thread?.messages)
    const facts: UsageInteractionFact[] = []

    for (let index = 0; index < eventList.length; index += 1) {
        const event = eventList[index]

        if (!event) {
            continue
        }

        const model = typeof event.model === 'string' ? event.model.trim() : ''
        const timestamp = toIsoString(event.timestamp)

        if (!model || !timestamp || !event.tokens) {
            continue
        }

        const messageId = typeof event.toMessageId === 'number' && Number.isFinite(event.toMessageId) ? event.toMessageId : null
        const [cacheCreationTokens = 0, cacheReadTokens = 0] = messageId != null
            ? (cacheTokensByMessageId.get(messageId) ?? [0, 0])
            : [0, 0]
        const usage = createInteractionUsage({
            ...applyTotalUsageAsExtra({
                cacheCreationTokens,
                cacheReadTokens,
                inputTokens: event.tokens.input,
                outputTokens: event.tokens.output,
                totalTokens: event.tokens.total,
            }),
        })

        if (!usageHasTokens(usage)) {
            continue
        }

        facts.push({
            dedupeKey: null,
            fallbackDedupeKey: null,
            interactionIndex: index,
            isSidechain: false,
            model,
            modelLookupCandidates: [model],
            platform: 'amp',
            project: 'amp',
            provider: null,
            rawCostUSD: null,
            repository: 'local/amp',
            role: 'usage',
            sessionId,
            sourceFile: source.path,
            sourceFileMtime: source.mtimeMs,
            speed: 'standard',
            threadName: `Amp ${sessionId}`,
            timestamp,
            type: 'usage_ledger',
            usage,
        })
    }

    return facts
}

function getAmpCacheTokens(messages: AmpMessageRaw[] | undefined) {
    const cacheTokens = new Map<number, [number, number]>()

    if (!Array.isArray(messages)) {
        return cacheTokens
    }

    for (const message of messages) {
        if (message.role !== 'assistant' || typeof message.messageId !== 'number' || !Number.isFinite(message.messageId)) {
            continue
        }

        cacheTokens.set(message.messageId, [
            message.usage?.cacheCreationInputTokens ?? 0,
            message.usage?.cacheReadInputTokens ?? 0,
        ])
    }

    return cacheTokens
}
