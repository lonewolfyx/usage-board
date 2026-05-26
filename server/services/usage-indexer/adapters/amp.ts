import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { basename, join } from 'node:path'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
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
    parseFile(filePath, resolvePricing) {
        const data = parseJsonFile(filePath)
        const record = normalizeUnknownRecord(data)
        const sessionId = normalizeStringValue(record?.id) || basename(filePath, '.json')
        const events = record?.usageLedger && normalizeUnknownRecord(record.usageLedger)
            ? (record.usageLedger as Record<string, unknown>).events
            : null
        const eventList = Array.isArray(events) ? events : []
        const cacheTokensByMessageId = getAmpCacheTokens(record?.messages)
        const startedAt = eventList
            .map(event => normalizeUnknownRecord(event))
            .map(event => toIsoString(event?.timestamp))
            .find(Boolean) ?? null
        const fragment = createSessionFragment({
            project: 'amp',
            repository: 'local/amp',
            sessionId,
            startedAt,
            threadName: `Amp ${sessionId}`,
        })

        for (let index = 0; index < eventList.length; index += 1) {
            const event = normalizeUnknownRecord(eventList[index])

            if (!event) {
                continue
            }

            const model = normalizeStringValue(event.model)
            const timestamp = toIsoString(event.timestamp)
            const tokens = normalizeUnknownRecord(event.tokens)

            if (!model || !timestamp || !tokens) {
                continue
            }

            const messageId = Number.isFinite(event.toMessageId) ? Number(event.toMessageId) : null
            const [cacheCreationTokens = 0, cacheReadTokens = 0] = messageId != null
                ? (cacheTokensByMessageId.get(messageId) ?? [0, 0])
                : [0, 0]
            const usage = toInteractionUsage({
                ...applyTotalUsageAsExtra({
                    cacheCreationTokens,
                    cacheReadTokens,
                    inputTokens: getNumber(tokens.input),
                    outputTokens: getNumber(tokens.output),
                    totalTokens: getNumber(tokens.total),
                }),
            })

            if (isZeroInteractionUsage(usage)) {
                continue
            }

            const costUSD = calculateUsageCostFromCandidates(usage, [model], resolvePricing, {
                includeExtraTotalAsOutput: true,
            })

            addFragmentInteraction(fragment, {
                content: '',
                costUSD,
                index,
                model,
                role: 'usage',
                timestamp,
                type: 'usage_ledger',
                usage: toInteractionUsage({
                    ...usage,
                    costUSD,
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
        const record = normalizeUnknownRecord(message)

        if (!record || normalizeStringValue(record.role) !== 'assistant' || !Number.isFinite(record.messageId)) {
            continue
        }

        const usage = normalizeUnknownRecord(record.usage)

        cacheTokens.set(Number(record.messageId), [
            getNumber(usage?.cacheCreationInputTokens),
            getNumber(usage?.cacheReadInputTokens),
        ])
    }

    return cacheTokens
}

function getNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}
