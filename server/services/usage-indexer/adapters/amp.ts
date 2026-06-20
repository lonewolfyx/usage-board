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
        const record = parseJsonFile<Record<string, any>>(filePath)
        const sessionId = record?.id.trim() || basename(filePath, '.json')
        const events = record?.usageLedger && record.usageLedger
            ? (record.usageLedger as Record<string, unknown>).events
            : null
        const eventList = Array.isArray(events) ? events : []
        const cacheTokensByMessageId = getAmpCacheTokens(record?.messages)
        const startedAt = eventList
            .map(event => event)
            .map(event => toIsoString((event as Record<string, any> | undefined)?.timestamp))
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

            const model = (event as Record<string, any>).model.trim()
            const timestamp = toIsoString((event as Record<string, any>).timestamp)
            const tokens = (event as Record<string, any>).tokens

            if (!model || !timestamp || !tokens) {
                continue
            }

            const messageId = Number.isFinite((event as Record<string, any>).toMessageId) ? Number((event as Record<string, any>).toMessageId) : null
            const [cacheCreationTokens = 0, cacheReadTokens = 0] = messageId != null
                ? (cacheTokensByMessageId.get(messageId) ?? [0, 0])
                : [0, 0]
            const usage = toInteractionUsage({
                ...applyTotalUsageAsExtra({
                    cacheCreationTokens,
                    cacheReadTokens,
                    inputTokens: (tokens as Record<string, any>).input as number | undefined,
                    outputTokens: (tokens as Record<string, any>).output as number | undefined,
                    totalTokens: (tokens as Record<string, any>).total as number | undefined,
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

function getAmpCacheTokens(messages: unknown) {
    const cacheTokens = new Map<number, [number, number]>()

    if (!Array.isArray(messages)) {
        return cacheTokens
    }

    for (const message of messages) {
        const record = message

        if (!record || (record as Record<string, any>).role !== 'assistant' || !Number.isFinite((record as Record<string, any>).messageId)) {
            continue
        }

        const usage = (record as Record<string, any>).usage

        cacheTokens.set(Number((record as Record<string, any>).messageId), [
            (usage as Record<string, any> | undefined)?.cacheCreationInputTokens as number | undefined ?? 0,
            (usage as Record<string, any> | undefined)?.cacheReadInputTokens as number | undefined ?? 0,
        ])
    }

    return cacheTokens
}
