import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
    applyTotalUsageFallback,
    calculateUsageCostFromCandidates,
    getFileModifiedAtIso,
    isZeroInteractionUsage,
    toInteractionUsage,
} from './shared'

const KIMI_DEFAULT_MODEL = 'kimi-for-coding'

export const kimiUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver({
            getLookupCandidates: model => [model, `kimi/${model}`, `moonshot/${model}`],
        })
    },
    async discoverFiles(config) {
        const groups = await Promise.all(config.kimiPaths.map(path => glob(join(path, 'sessions', '**', 'wire.jsonl'), {
            absolute: true,
        }).catch(() => [])))

        return groups
            .flat()
            .filter(filePath => isKimiWireFile(join(dirname(dirname(dirname(filePath))), 'sessions'), filePath))
            .flatMap(filePath => toDiscoveredUsageFile(filePath, 'kimi'))
    },
    parseFile(filePath, resolvePricing) {
        const sessionId = getKimiSessionId(filePath)
        const model = getKimiModel(filePath)
        const fallbackTimestamp = getFileModifiedAtIso(filePath)
        const fragment = createSessionFragment({
            project: 'kimi',
            repository: 'local/kimi',
            sessionId,
            startedAt: fallbackTimestamp,
            threadName: `Kimi ${sessionId}`,
        })
        const lines = readFileSync(filePath, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)

        for (let index = 0; index < lines.length; index += 1) {
            const record = normalizeUnknownRecord(parseJson(lines[index]!))
            const message = normalizeUnknownRecord(record?.message)
            const payload = normalizeUnknownRecord(message?.payload)
            const tokenUsage = normalizeUnknownRecord(payload?.token_usage)

            if (!record || !message || normalizeStringValue(message.type) !== 'StatusUpdate' || !payload || !tokenUsage) {
                continue
            }

            const usage = toInteractionUsage({
                ...applyTotalUsageFallback({
                    cacheCreationTokens: getNumber(tokenUsage.input_cache_creation),
                    cacheReadTokens: getNumber(tokenUsage.input_cache_read),
                    inputTokens: getNumber(tokenUsage.input_other),
                    outputTokens: getNumber(tokenUsage.output),
                    totalTokens: getNumber(tokenUsage.total),
                }),
            })

            if (isZeroInteractionUsage(usage)) {
                continue
            }

            const costUSD = calculateUsageCostFromCandidates(usage, [model, `moonshot/${model}`, `kimi/${model}`], resolvePricing)
            const timestamp = toIsoString(record.timestamp) ?? fallbackTimestamp

            addFragmentInteraction(fragment, {
                content: '',
                costUSD,
                dedupeKey: [
                    sessionId,
                    normalizeStringValue(payload.message_id) || '',
                    timestamp || '',
                    model,
                    String(usage.totalTokens),
                ].join(':'),
                index,
                model,
                role: 'usage',
                timestamp,
                type: 'StatusUpdate',
                usage: toInteractionUsage({
                    ...usage,
                    costUSD,
                }),
            })
        }

        return fragment.interactions.length > 0 ? [fragment] : []
    },
    watchPatterns(config) {
        return config.kimiPaths.map(path => join(path, 'sessions', '**', 'wire.jsonl'))
    },
} satisfies UsagePlatformAdapter

function parseJson(value: string) {
    try {
        return JSON.parse(value) as unknown
    }
    catch {
        return null
    }
}

function getKimiModel(filePath: string) {
    const config = parseJsonFile(join(dirname(dirname(dirname(filePath))), 'config.json'))
    return normalizeStringValue(normalizeUnknownRecord(config)?.model) || KIMI_DEFAULT_MODEL
}

function getKimiSessionId(filePath: string) {
    return dirname(filePath).split('/').filter(Boolean).pop() || 'unknown'
}

function isKimiWireFile(sessionsPath: string, filePath: string) {
    const normalizedSessions = sessionsPath.split('/').filter(Boolean)
    const normalizedFile = filePath.split('/').filter(Boolean)
    const startIndex = normalizedFile.findIndex((segment, index) => segment === normalizedSessions[normalizedSessions.length - 1] && normalizedFile[index - 1] === normalizedSessions[normalizedSessions.length - 2])

    if (startIndex < 0) {
        return false
    }

    return normalizedFile.slice(startIndex + 1).length === 3 && normalizedFile[normalizedFile.length - 1] === 'wire.jsonl'
}

function getNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}
