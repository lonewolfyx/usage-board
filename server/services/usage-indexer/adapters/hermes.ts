import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { openSqliteDatabase } from '#server/utils/sqlite'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import {
    addFragmentInteraction,
    createSessionFragment,
    toDiscoveredUsageFile,
} from '../session-fragment'
import {
    calculateUsageCostFromCandidates,
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

export const hermesUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver()
    },
    async discoverFiles(config) {
        return config.hermesPaths.flatMap(filePath => toDiscoveredUsageFile(filePath, 'hermes'))
    },
    parseFile(filePath, resolvePricing) {
        const database = openSqliteDatabase(filePath, { readOnly: true })

        try {
            const rows: Array<Record<string, unknown>> = database.prepare<[], Record<string, unknown>>(HERMES_SESSION_QUERY).all()
            return rows
                .map(row => parseHermesRow(row, resolvePricing))
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
                        content: '',
                        costUSD: entry.usage.costUSD,
                        dedupeKey: `hermes:${entry.sessionId}`,
                        index: 0,
                        model: entry.model,
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

function parseHermesRow(row: Record<string, unknown>, resolvePricing: Parameters<UsagePlatformAdapter['parseFile']>[1]) {
    const sessionId = typeof row.id === 'string' ? row.id.trim() : ''
    const model = typeof row.model === 'string' ? row.model.trim() : ''
    const timestamp = timestampFromHermesValue(row.started_at)

    if (!sessionId || !model || !timestamp) {
        return null
    }

    const usage = toInteractionUsage({
        cacheCreationTokens: toNumber(row.cache_write_tokens),
        cacheReadTokens: toNumber(row.cache_read_tokens),
        inputTokens: toNumber(row.input_tokens),
        outputTokens: toNumber(row.output_tokens),
        reasoningOutputTokens: toNumber(row.reasoning_tokens),
    })

    if (isZeroInteractionUsage(usage) && !toOptionalNumber(row.actual_cost_usd) && !toOptionalNumber(row.estimated_cost_usd)) {
        return null
    }

    const provider = normalizeHermesProvider(typeof row.billing_provider === 'string' ? row.billing_provider : null, model)
    const directCost = toOptionalNumber(row.actual_cost_usd) ?? toOptionalNumber(row.estimated_cost_usd)
    const costUSD = directCost ?? calculateUsageCostFromCandidates(usage, [model, `${provider}/${model}`], resolvePricing)

    return {
        model,
        sessionId,
        timestamp,
        usage: toInteractionUsage({
            ...usage,
            costUSD,
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

function timestampFromHermesValue(value: unknown) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null
    }

    const milliseconds = value > 1e12 ? value : value * 1000
    return new Date(milliseconds).toISOString()
}

function toNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

function toOptionalNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
