import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { openSqliteDatabase } from '#server/utils/sqlite'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { fromDateTimestamp } from '#shared/utils/date'
import {
    addFragmentInteraction,
    createSessionFragment,
    toDiscoveredUsageFile,
} from '../session-fragment'
import {
    isZeroInteractionUsage,
    toInteractionUsage,
} from './shared'

const HERMES_SESSION_QUERY = `
SELECT
    id,
    model,
    billing_provider,
    started_at,
    message_count,
    input_tokens,
    output_tokens,
    cache_read_tokens,
    cache_write_tokens,
    reasoning_tokens,
    estimated_cost_usd,
    actual_cost_usd
FROM sessions
WHERE model IS NOT NULL
    AND TRIM(model) != ''
`

interface HermesSessionRow {
    actual_cost_usd: number | null
    billing_provider: string | null
    cache_read_tokens: number | null
    cache_write_tokens: number | null
    estimated_cost_usd: number | null
    id: string | null
    input_tokens: number | null
    model: string | null
    output_tokens: number | null
    reasoning_tokens: number | null
    started_at: number | null
}

export const hermesUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver()
    },
    async discoverFiles(config) {
        return config.hermesPaths.flatMap(filePath => toDiscoveredUsageFile(filePath, 'hermes'))
    },
    parseFile(filePath) {
        const database = openSqliteDatabase(filePath, { readOnly: true })

        try {
            const rows = database.prepare<HermesSessionRow>(HERMES_SESSION_QUERY).all()
            return rows
                .map(row => parseHermesRow(row))
                .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
                .map((entry) => {
                    const fragment = createSessionFragment({
                        project: 'hermes',
                        repository: 'local/hermes',
                        sessionId: entry.sessionId,
                        startedAt: entry.timestamp,
                        threadName: `Hermes ${entry.sessionId}`,
                    })

                    addFragmentInteraction(fragment, {
                        costUSD: entry.usage.costUSD,
                        dedupeKey: `hermes:${entry.sessionId}`,
                        index: 0,
                        model: entry.model,
                        modelLookupCandidates: entry.modelLookupCandidates,
                        provider: entry.provider,
                        rawCostUSD: entry.rawCostUSD,
                        role: 'usage',
                        timestamp: entry.timestamp,
                        type: 'session',
                        usage: entry.usage,
                    })

                    return fragment
                })
        }
        finally {
            database.close()
        }
    },
    watchPatterns(config) {
        return [...config.hermesPaths]
    },
} satisfies UsagePlatformAdapter

function parseHermesRow(row: HermesSessionRow) {
    const sessionId = row.id?.trim() ?? ''
    const model = row.model?.trim() ?? ''
    const rawTs = row.started_at
    const timestamp = typeof rawTs === 'number' && Number.isFinite(rawTs) && rawTs > 0
        ? fromDateTimestamp(rawTs)?.toISOString() ?? null
        : null

    if (!sessionId || !model || !timestamp) {
        return null
    }

    const usage = toInteractionUsage({
        cacheCreationTokens: typeof row.cache_write_tokens === 'number' && Number.isFinite(row.cache_write_tokens) ? Math.max(0, Math.trunc(row.cache_write_tokens)) : 0,
        cacheReadTokens: typeof row.cache_read_tokens === 'number' && Number.isFinite(row.cache_read_tokens) ? Math.max(0, Math.trunc(row.cache_read_tokens)) : 0,
        extraTotalTokens: typeof row.reasoning_tokens === 'number' && Number.isFinite(row.reasoning_tokens) ? Math.max(0, Math.trunc(row.reasoning_tokens)) : 0,
        inputTokens: typeof row.input_tokens === 'number' && Number.isFinite(row.input_tokens) ? Math.max(0, Math.trunc(row.input_tokens)) : 0,
        outputTokens: typeof row.output_tokens === 'number' && Number.isFinite(row.output_tokens) ? Math.max(0, Math.trunc(row.output_tokens)) : 0,
    })

    const actualCostUsd = typeof row.actual_cost_usd === 'number' && Number.isFinite(row.actual_cost_usd) && row.actual_cost_usd >= 0 ? row.actual_cost_usd : null
    const estimatedCostUsd = typeof row.estimated_cost_usd === 'number' && Number.isFinite(row.estimated_cost_usd) && row.estimated_cost_usd >= 0 ? row.estimated_cost_usd : null

    if (isZeroInteractionUsage(usage) && actualCostUsd == null && estimatedCostUsd == null) {
        return null
    }

    const provider = normalizeHermesProvider(row.billing_provider, model)
    const directCost = actualCostUsd ?? estimatedCostUsd
    const modelLookupCandidates = [model, `${provider}/${model}`]

    return {
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

function normalizeHermesProvider(provider: string | null, model: string) {
    const normalized = provider?.trim().toLowerCase().replaceAll('-', '_')

    switch (normalized) {
        case 'anthropic':
        case 'claude':
            return 'anthropic'
        case 'openai':
        case 'openai_codex':
            return 'openai'
        case 'gemini':
        case 'google':
        case 'google_ai':
        case 'vertex':
        case 'vertex_ai':
            return 'google'
        case 'openrouter':
        case 'xai':
        case 'groq':
            return normalized
        default:
            if (model.startsWith('claude-') || model.startsWith('claude/')) {
                return 'anthropic'
            }

            if (model.startsWith('gpt') || model.startsWith('chatgpt') || /^o\d/u.test(model)) {
                return 'openai'
            }

            if (model.startsWith('gemini-') || model.startsWith('gemini/')) {
                return 'google'
            }

            return 'hermes'
    }
}
