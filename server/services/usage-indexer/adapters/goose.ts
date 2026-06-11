import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { openSqliteDatabase } from '#server/utils/sqlite'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { toIsoString } from '#shared/utils/platform'
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

const GOOSE_SESSION_QUERY = `
SELECT
    id,
    model_config_json,
    provider_name,
    created_at,
    total_tokens,
    input_tokens,
    output_tokens,
    accumulated_total_tokens,
    accumulated_input_tokens,
    accumulated_output_tokens
FROM sessions
WHERE model_config_json IS NOT NULL
    AND TRIM(model_config_json) != ''
`

export const gooseUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver()
    },
    async discoverFiles(config) {
        return config.goosePaths.flatMap(filePath => toDiscoveredUsageFile(filePath, 'goose'))
    },
    parseFile(filePath, resolvePricing) {
        const database = openSqliteDatabase(filePath, { readOnly: true })

        try {
            const rows = database.prepare<Record<string, unknown>>(GOOSE_SESSION_QUERY).all()
            const fragments = rows
                .map(row => parseGooseRow(row, resolvePricing))
                .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
                .map((entry) => {
                    const fragment = createSessionFragment({
                        project: 'goose',
                        repository: 'local/goose',
                        sessionId: entry.sessionId,
                        startedAt: entry.timestamp,
                        threadName: `Goose ${entry.sessionId}`,
                    })

                    addFragmentInteraction(fragment, {
                        costUSD: entry.usage.costUSD,
                        dedupeKey: `goose:${filePath}:${entry.sessionId}`,
                        index: 0,
                        model: entry.model,
                        modelLookupCandidates: entry.modelLookupCandidates,
                        provider: entry.provider,
                        rawCostUSD: null,
                        role: 'usage',
                        timestamp: entry.timestamp,
                        type: 'session',
                        usage: entry.usage,
                    })

                    return fragment
                })

            return fragments
        }
        finally {
            database.close()
        }
    },
    watchPatterns(config) {
        return [...config.goosePaths]
    },
} satisfies UsagePlatformAdapter

function parseGooseRow(row: any, resolvePricing: Parameters<UsagePlatformAdapter['parseFile']>[1]) {
    const sessionId = row.id.trim()
    const modelConfig = JSON.parse(row.model_config_json.trim())
    const model = modelConfig?.model_name.trim()
    const timestamp = toIsoString(row.created_at)

    if (!sessionId || !model || !timestamp) {
        return null
    }

    const inputTokens = row.accumulated_input_tokens || row.input_tokens
    const outputTokens = row.accumulated_output_tokens || row.output_tokens
    const totalTokens = row.accumulated_total_tokens || row.total_tokens || (inputTokens + outputTokens)
    const extraTotalTokens = Math.max(0, totalTokens - inputTokens - outputTokens)
    const usage = toInteractionUsage({
        extraTotalTokens,
        inputTokens,
        outputTokens,
    })

    if (isZeroInteractionUsage(usage)) {
        return null
    }

    const provider = normalizeGooseProvider(row.provider_name.trim() ?? null, model)
    const costUSD = calculateUsageCostFromCandidates(usage, [model, `${provider}/${model}`], resolvePricing)

    return {
        model,
        modelLookupCandidates: [model, `${provider}/${model}`],
        provider,
        sessionId,
        timestamp,
        usage: toInteractionUsage({
            ...usage,
            costUSD,
        }),
    }
}

function normalizeGooseProvider(provider: string | null, model: string) {
    if (provider) {
        return provider.replaceAll('-', '_')
    }

    if (model.startsWith('claude-')) {
        return 'anthropic'
    }

    if (model.startsWith('gpt-') || model.startsWith('chatgpt-') || model.startsWith('o')) {
        return 'openai'
    }

    if (model.startsWith('gemini-')) {
        return 'google'
    }

    if (model.toLowerCase().startsWith('qwen')) {
        return 'openrouter'
    }

    return 'goose'
}
