import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { join } from 'node:path'
import { openSqliteDatabase } from '#server/utils/sqlite'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { normalizeFiniteNumberOrNull, normalizeStringValue, normalizeUnknownRecord } from '#shared/utils/normalize'
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
    normalizeUsageNumber,
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
                const record = parse(row.data) as Record<string, unknown> | null
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
    value: Record<string, unknown>,
    row: { data: string, id: string, session_id: string },
    filePath: string,
    resolvePricing: Parameters<UsagePlatformAdapter['parseFile']>[1],
) {
    if (normalizeStringValue(value.role) !== 'assistant') {
        return null
    }

    const tokens = normalizeUnknownRecord(value.tokens)
    const model = normalizeStringValue(value.modelID)
    const timestamp = toIsoString(normalizeUnknownRecord(value.time)?.created)

    if (!tokens || !model || !timestamp) {
        return null
    }

    const extraTotalTokens = normalizeUsageNumber(tokens.reasoning as number | undefined)
    const usage = toInteractionUsage({
        ...applyTotalUsageFallback({
            cacheCreationTokens: normalizeUsageNumber(normalizeUnknownRecord(tokens.cache)?.write as number | undefined),
            cacheReadTokens: normalizeUsageNumber(normalizeUnknownRecord(tokens.cache)?.read as number | undefined),
            inputTokens: normalizeUsageNumber(tokens.input as number | undefined),
            outputTokens: normalizeUsageNumber(tokens.output as number | undefined),
            totalTokens: Math.max(normalizeUsageNumber(tokens.total as number | undefined) - extraTotalTokens, 0),
        }),
        extraTotalTokens,
    })

    if (isZeroInteractionUsage(usage)) {
        return null
    }

    const sessionId = normalizeStringValue(value.session_id) || row.session_id
    const interactionId = normalizeStringValue(value.id) || `${filePath}:${row.id}`
    const directCost = normalizeFiniteNumberOrNull(value.cost)
    const provider = normalizeStringValue(value.providerID) ?? null
    const costUSD = directCost ?? calculateUsageCostFromCandidates(usage, getKiloCandidates(model, provider), resolvePricing)

    return {
        interactionId,
        model,
        modelLookupCandidates: getKiloCandidates(model, provider),
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

function getKiloCandidates(model: string, provider: string | null) {
    return provider ? [model, `${provider}/${model}`] : [model]
}
