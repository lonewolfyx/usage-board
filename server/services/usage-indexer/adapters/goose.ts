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

interface GooseSessionRow {
    accumulated_input_tokens: number | null
    accumulated_output_tokens: number | null
    accumulated_total_tokens: number | null
    created_at: string | number | null
    id: string
    input_tokens: number | null
    model_config_json: string
    output_tokens: number | null
    provider_name: string | null
    total_tokens: number | null
}

interface GooseModelConfig {
    model_name?: string
}

export const gooseUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver()
    },
    async discoverFiles(config) {
        return config.goosePaths.flatMap(filePath => toDiscoveredUsageFile(filePath, 'goose'))
    },
    parseFile(filePath) {
        const database = openSqliteDatabase(filePath, { readOnly: true })

        try {
            const rows = database.prepare<GooseSessionRow>(GOOSE_SESSION_QUERY).all()
            const fragments = rows
                .map(row => parseGooseRow(row))
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

function parseGooseRow(row: GooseSessionRow) {
    const sessionId = row.id.trim()
    const modelConfig = JSON.parse(row.model_config_json.trim()) as GooseModelConfig
    const model = modelConfig.model_name?.trim()
    const timestamp = toIsoString(row.created_at)

    if (!sessionId || !model || !timestamp) {
        return null
    }

    const inputTokens = (row.accumulated_input_tokens && Number.isFinite(row.accumulated_input_tokens) ? row.accumulated_input_tokens : null)
        ?? (row.input_tokens && Number.isFinite(row.input_tokens) ? row.input_tokens : 0)
    const outputTokens = (row.accumulated_output_tokens && Number.isFinite(row.accumulated_output_tokens) ? row.accumulated_output_tokens : null)
        ?? (row.output_tokens && Number.isFinite(row.output_tokens) ? row.output_tokens : 0)
    const totalTokens = (row.accumulated_total_tokens && Number.isFinite(row.accumulated_total_tokens) ? row.accumulated_total_tokens : null)
        ?? (row.total_tokens && Number.isFinite(row.total_tokens) ? row.total_tokens : null)
        ?? (inputTokens + outputTokens)
    const extraTotalTokens = Math.max(0, totalTokens - inputTokens - outputTokens)
    const usage = toInteractionUsage({
        extraTotalTokens,
        inputTokens,
        outputTokens,
    })

    if (isZeroInteractionUsage(usage)) {
        return null
    }

    const provider = normalizeGooseProvider(row.provider_name?.trim() ?? null, model)
    const modelLookupCandidates = [model, `${provider}/${model}`]

    return {
        model,
        modelLookupCandidates,
        provider,
        sessionId,
        timestamp,
        usage: toInteractionUsage({
            ...usage,
            costUSD: 0,
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
