import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { basename, join } from 'node:path'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { parseJsonFile, toIsoString } from '#shared/utils/platform'
import { glob } from 'glob'
import { addFragmentInteraction, createSessionFragment, toDiscoveredUsageFile } from '../session-fragment'
import {
    applyTotalUsageAsExtra,
    isZeroInteractionUsage,
    toInteractionUsage,
} from './shared'

interface AmpLedgerTokens {
    input?: number
    output?: number
    total?: number
}

interface AmpLedgerEvent {
    model?: string
    timestamp?: string | number
    tokens?: AmpLedgerTokens
    toMessageId?: number
}

interface AmpThreadRecord {
    id?: string
    messages?: AmpMessageRecord[]
    usageLedger?: {
        events?: AmpLedgerEvent[]
    }
}

interface AmpMessageRecord {
    messageId?: number
    role?: string
    usage?: {
        cacheCreationInputTokens?: number
        cacheReadInputTokens?: number
    }
}

export const ampUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver()
    },
    async discoverFiles(config) {
        const groups = await Promise.all(config.ampPaths.map(path => glob(join(path, 'threads', '**', '*.json'), {
            absolute: true,
        }).catch(() => [])))

        return groups
            .flat()
            .flatMap(filePath => toDiscoveredUsageFile(filePath, 'amp'))
    },
    parseFile(filePath) {
        const record = parseJsonFile<AmpThreadRecord>(filePath)
        const sessionId = record?.id?.trim() || basename(filePath, '.json')
        const events = record?.usageLedger?.events
        const eventList = Array.isArray(events) ? events : []
        const cacheTokensByMessageId = getAmpCacheTokens(record?.messages)
        const startedAt = eventList
            .map(event => toIsoString(event.timestamp))
            .find(Boolean) ?? null
        const fragment = createSessionFragment({
            project: 'amp',
            repository: 'local/amp',
            sessionId,
            startedAt,
            threadName: `Amp ${sessionId}`,
        })

        for (let index = 0; index < eventList.length; index += 1) {
            const event = eventList[index]

            if (!event) {
                continue
            }

            const model = event.model?.trim()
            const timestamp = toIsoString(event.timestamp)
            const tokens = event.tokens

            if (!model || !timestamp || !tokens) {
                continue
            }

            const messageId = typeof event.toMessageId === 'number' && Number.isFinite(event.toMessageId) ? event.toMessageId : null
            const [cacheCreationTokens = 0, cacheReadTokens = 0] = messageId != null
                ? (cacheTokensByMessageId.get(messageId) ?? [0, 0])
                : [0, 0]
            const usage = toInteractionUsage({
                ...applyTotalUsageAsExtra({
                    cacheCreationTokens,
                    cacheReadTokens,
                    inputTokens: typeof tokens.input === 'number' && Number.isFinite(tokens.input) ? tokens.input : undefined,
                    outputTokens: typeof tokens.output === 'number' && Number.isFinite(tokens.output) ? tokens.output : undefined,
                    totalTokens: typeof tokens.total === 'number' && Number.isFinite(tokens.total) ? tokens.total : undefined,
                }),
            })

            if (isZeroInteractionUsage(usage)) {
                continue
            }

            addFragmentInteraction(fragment, {
                costUSD: 0,
                index,
                model,
                modelLookupCandidates: [model],
                rawCostUSD: null,
                role: 'usage',
                timestamp,
                type: 'usage_ledger',
                usage: toInteractionUsage({
                    ...usage,
                    costUSD: 0,
                }),
            })
        }

        return fragment.interactions.length > 0 ? [fragment] : []
    },
    watchPatterns(config) {
        return config.ampPaths.map(path => join(path, 'threads', '**', '*.json'))
    },
} satisfies UsagePlatformAdapter

function getAmpCacheTokens(messages: AmpMessageRecord[] | undefined) {
    const cacheTokens = new Map<number, [number, number]>()

    if (!messages) {
        return cacheTokens
    }

    for (const record of messages) {
        if (record.role !== 'assistant' || typeof record.messageId !== 'number' || !Number.isFinite(record.messageId)) {
            continue
        }

        const usage = record.usage

        cacheTokens.set(record.messageId, [
            typeof usage?.cacheCreationInputTokens === 'number' && Number.isFinite(usage.cacheCreationInputTokens) ? usage.cacheCreationInputTokens : 0,
            typeof usage?.cacheReadInputTokens === 'number' && Number.isFinite(usage.cacheReadInputTokens) ? usage.cacheReadInputTokens : 0,
        ])
    }

    return cacheTokens
}
