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
    calculateUsageCostFromCandidates,
    isZeroInteractionUsage,
    toInteractionUsage,
} from './shared'

const KILO_DB_FILE_NAME = 'kilo.db'
const KILO_MESSAGE_QUERY = 'SELECT id, session_id, data FROM message'

export const kiloUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver()
    },
    async discoverFiles(config) {
        return config.kiloPaths
            .map(path => join(path, KILO_DB_FILE_NAME))
            .flatMap(filePath => toDiscoveredUsageFile(filePath, 'kilo'))
    },
    parseFile(filePath, resolvePricing) {
        const database = openSqliteDatabase(filePath, { readOnly: true })

        try {
            const rows = database.prepare<{
                data: string
                id: string
                session_id: string
            }>(KILO_MESSAGE_QUERY).all()
            const fragments = new Map<string, ReturnType<typeof createSessionFragment>>()

            for (const row of rows) {
                const record = parse(row.data) as Record<string, any> | null
                const parsed = record ? parseKiloMessage(record, row, filePath, resolvePricing) : null

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
    value: Record<string, any>,
    row: { data: string, id: string, session_id: string },
    filePath: string,
    resolvePricing: Parameters<UsagePlatformAdapter['parseFile']>[1],
) {
    if (value.role.trim() !== 'assistant') {
        return null
    }

    const tokens = value.tokens
    const model = value.modelID.trim()
    const timestamp = toIsoString(value.time?.created)

    if (!tokens || !model || !timestamp) {
        return null
    }

    const extraTotalTokens = typeof tokens.reasoning === 'number' && Number.isFinite(tokens.reasoning)
        ? tokens.reasoning
        : 0
    const usage = toInteractionUsage({
        ...applyTotalUsageFallback({
            cacheCreationTokens: tokens.cache?.write as number | undefined,
            cacheReadTokens: tokens.cache?.read as number | undefined,
            inputTokens: tokens.input as number | undefined,
            outputTokens: tokens.output as number | undefined,
            totalTokens: Math.max((typeof tokens.total === 'number' && Number.isFinite(tokens.total) ? tokens.total : 0) - extraTotalTokens, 0),
        }),
        extraTotalTokens,
    })

    if (isZeroInteractionUsage(usage)) {
        return null
    }

    const sessionId = value.session_id.trim() || row.session_id
    const interactionId = value.id.trim() || `${filePath}:${row.id}`
    const rawCost = value.cost
    const directCost = typeof rawCost === 'number' && Number.isFinite(rawCost) ? rawCost : null
    const provider = value.providerID.trim() ?? null
    const costUSD = directCost ?? calculateUsageCostFromCandidates(usage, provider ? [model, `${provider}/${model}`] : [model], resolvePricing)

    return {
        interactionId,
        model,
        modelLookupCandidates: provider ? [model, `${provider}/${model}`] : [model],
        provider,
        rawCostUSD: directCost,
        sessionId,
        timestamp,
        usage: toInteractionUsage({
            ...usage,
            costUSD,
        }),
    }
}
