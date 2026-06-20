import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { parse } from '#shared/utils/parse'
import { parseJsonFile, toIsoString } from '#shared/utils/platform'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    toDiscoveredUsageFile,
} from '../session-fragment'
import {
    applyTotalUsageAsExtra,
    getFileModifiedAtIso,
    isZeroInteractionUsage,
    toInteractionUsage,
} from './shared'

const KIMI_DEFAULT_MODEL = 'kimi-for-coding'

interface KimiConfig {
    model?: string
}

interface KimiStatusPayload {
    message_id?: string
    token_usage?: {
        input_cache_creation?: number
        input_cache_read?: number
        input_other?: number
        output?: number
        total?: number
    }
}

interface KimiWireLine {
    message?: {
        payload?: KimiStatusPayload
        type?: string
    }
    timestamp?: string | number
}

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
    parseFile(filePath) {
        const sessionId = dirname(filePath).split('/').filter(Boolean).pop() || 'unknown'
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
            const record = parse(lines[index]!) as KimiWireLine | null
            const message = record?.message
            const payload = message?.payload
            const tokenUsage = payload?.token_usage

            if (!record || !message || message.type?.trim() !== 'StatusUpdate' || !payload || !tokenUsage) {
                continue
            }

            const usage = toInteractionUsage({
                ...applyTotalUsageAsExtra({
                    cacheCreationTokens: typeof tokenUsage.input_cache_creation === 'number' && Number.isFinite(tokenUsage.input_cache_creation) ? tokenUsage.input_cache_creation : undefined,
                    cacheReadTokens: typeof tokenUsage.input_cache_read === 'number' && Number.isFinite(tokenUsage.input_cache_read) ? tokenUsage.input_cache_read : undefined,
                    inputTokens: typeof tokenUsage.input_other === 'number' && Number.isFinite(tokenUsage.input_other) ? tokenUsage.input_other : undefined,
                    outputTokens: typeof tokenUsage.output === 'number' && Number.isFinite(tokenUsage.output) ? tokenUsage.output : undefined,
                    totalTokens: typeof tokenUsage.total === 'number' && Number.isFinite(tokenUsage.total) ? tokenUsage.total : undefined,
                }),
            })

            if (isZeroInteractionUsage(usage)) {
                continue
            }

            const modelLookupCandidates = [model, `moonshot/${model}`, `kimi/${model}`]
            const timestamp = toIsoString(record.timestamp) ?? fallbackTimestamp

            addFragmentInteraction(fragment, {
                costUSD: 0,
                dedupeKey: [
                    sessionId,
                    payload.message_id?.trim() || '',
                    timestamp || '',
                    model,
                    String(usage.inputTokens),
                    String(usage.outputTokens),
                    String(usage.cacheCreationTokens ?? 0),
                    String(usage.cacheReadTokens ?? 0),
                    String(usage.extraTotalTokens ?? 0),
                ].join(':'),
                index,
                model,
                modelLookupCandidates,
                rawCostUSD: null,
                role: 'usage',
                timestamp,
                type: 'StatusUpdate',
                usage: toInteractionUsage({
                    ...usage,
                    costUSD: 0,
                }),
            })
        }

        return fragment.interactions.length > 0 ? [fragment] : []
    },
    watchPatterns(config) {
        return config.kimiPaths.map(path => join(path, 'sessions', '**', 'wire.jsonl'))
    },
} satisfies UsagePlatformAdapter

function getKimiModel(filePath: string) {
    const config = parseJsonFile<KimiConfig>(join(dirname(dirname(dirname(filePath))), 'config.json'))
    return config?.model?.trim() || KIMI_DEFAULT_MODEL
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
