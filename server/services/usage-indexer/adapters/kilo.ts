import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { join } from 'node:path'
import { openSqliteDatabase } from '#server/utils/sqlite'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { parse } from '#shared/utils/parse'
import { toIsoString } from '#shared/utils/platform'
import {
    addFragmentInteraction,
    createSessionFragment,
    toDiscoveredUsageFile,
} from '../session-fragment'
import {
    applyTotalUsageFallback,
    isZeroInteractionUsage,
    toInteractionUsage,
} from './shared'

const KILO_DB_FILE_NAME = 'kilo.db'
const KILO_MESSAGE_QUERY = 'SELECT id, session_id, data FROM message'

interface KiloMessageRow {
    data: string
    id: string
    session_id: string
}

interface KiloMessagePayload {
    cost?: number
    id?: string
    modelID?: string
    providerID?: string
    role?: string
    session_id?: string
    time?: {
        created?: string | number
    }
    tokens?: {
        cache?: {
            read?: number
            write?: number
        }
        input?: number
        output?: number
        reasoning?: number
        total?: number
    }
}

export const kiloUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver()
    },
    async discoverFiles(config) {
        return config.kiloPaths
            .map(path => join(path, KILO_DB_FILE_NAME))
            .flatMap(filePath => toDiscoveredUsageFile(filePath, 'kilo'))
    },
    parseFile(filePath) {
        const database = openSqliteDatabase(filePath, { readOnly: true })

        try {
            const rows = database.prepare<KiloMessageRow>(KILO_MESSAGE_QUERY).all()
            const fragments = new Map<string, ReturnType<typeof createSessionFragment>>()

            for (const row of rows) {
                const record = parse(row.data) as KiloMessagePayload | null
                const parsed = record ? parseKiloMessage(record, row, filePath) : null

                if (!parsed) {
                    continue
                }

                const fragment = fragments.get(parsed.sessionId) ?? createSessionFragment({
                    project: 'kilo',
                    repository: 'local/kilo',
                    sessionId: parsed.sessionId,
                    startedAt: parsed.timestamp,
                    threadName: `Kilo ${parsed.sessionId}`,
                })

                addFragmentInteraction(fragment, {
                    costUSD: parsed.usage.costUSD,
                    dedupeKey: parsed.interactionId,
                    index: fragment.interactions.length,
                    model: parsed.model,
                    modelLookupCandidates: parsed.modelLookupCandidates,
                    provider: parsed.provider,
                    rawCostUSD: parsed.rawCostUSD,
                    role: 'assistant',
                    timestamp: parsed.timestamp,
                    type: 'message',
                    usage: parsed.usage,
                })
                fragments.set(parsed.sessionId, fragment)
            }

            return Array.from(fragments.values())
        }
        finally {
            database.close()
        }
    },
    watchPatterns(config) {
        return config.kiloPaths.map(path => join(path, KILO_DB_FILE_NAME))
    },
} satisfies UsagePlatformAdapter

function parseKiloMessage(
    value: KiloMessagePayload,
    row: KiloMessageRow,
    filePath: string,
) {
    if (value.role?.trim() !== 'assistant') {
        return null
    }

    const tokens = value.tokens
    const model = value.modelID?.trim()
    const timestamp = toIsoString(value.time?.created)

    if (!tokens || !model || !timestamp) {
        return null
    }

    const extraTotalTokens = typeof tokens.reasoning === 'number' && Number.isFinite(tokens.reasoning)
        ? tokens.reasoning
        : 0
    const usage = toInteractionUsage({
        ...applyTotalUsageFallback({
            cacheCreationTokens: typeof tokens.cache?.write === 'number' && Number.isFinite(tokens.cache.write) ? tokens.cache.write : undefined,
            cacheReadTokens: typeof tokens.cache?.read === 'number' && Number.isFinite(tokens.cache.read) ? tokens.cache.read : undefined,
            inputTokens: typeof tokens.input === 'number' && Number.isFinite(tokens.input) ? tokens.input : undefined,
            outputTokens: typeof tokens.output === 'number' && Number.isFinite(tokens.output) ? tokens.output : undefined,
            totalTokens: Math.max((typeof tokens.total === 'number' && Number.isFinite(tokens.total) ? tokens.total : 0) - extraTotalTokens, 0),
        }),
        extraTotalTokens,
    })

    if (isZeroInteractionUsage(usage)) {
        return null
    }

    const sessionId = value.session_id?.trim() || row.session_id
    const interactionId = value.id?.trim() || `${filePath}:${row.id}`
    const rawCost = value.cost
    const directCost = typeof rawCost === 'number' && Number.isFinite(rawCost) ? rawCost : null
    const provider = value.providerID?.trim() || null
    const modelLookupCandidates = provider ? [model, `${provider}/${model}`] : [model]

    return {
        interactionId,
        model,
        modelLookupCandidates,
        provider,
        rawCostUSD: directCost,
        sessionId,
        timestamp,
        usage: toInteractionUsage({
            ...usage,
            costUSD: directCost ?? 0,
        }),
    }
}
