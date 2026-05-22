import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { openSqliteDatabase } from '#server/utils/sqlite'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { normalizeStringValue, normalizeUnknownRecord } from '#shared/utils/normalize'
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
            const rows: Array<Record<string, unknown>> = database.prepare<[], Record<string, unknown>>(GOOSE_SESSION_QUERY).all()
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
                        content: '',
                        costUSD: entry.usage.costUSD,
                        dedupeKey: `goose:${entry.sessionId}`,
                        index: 0,
                        model: entry.model,
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

function parseGooseRow(row: Record<string, unknown>, resolvePricing: Parameters<UsagePlatformAdapter['parseFile']>[1]) {
    const sessionId = normalizeStringValue(row.id)
    const modelConfig = parseUnknownJson(normalizeStringValue(row.model_config_json) ?? null)
    const model = normalizeStringValue(normalizeUnknownRecord(modelConfig)?.model_name)
    const timestamp = toIsoString(row.created_at)

    if (!sessionId || !model || !timestamp) {
        return null
    }

    const inputTokens = getNumber(row.accumulated_input_tokens) || getNumber(row.input_tokens)
    const outputTokens = getNumber(row.accumulated_output_tokens) || getNumber(row.output_tokens)
    const totalTokens = getNumber(row.accumulated_total_tokens) || getNumber(row.total_tokens) || (inputTokens + outputTokens)
    const reasoningOutputTokens = Math.max(0, totalTokens - inputTokens - outputTokens)
    const usage = toInteractionUsage({
        inputTokens,
        outputTokens,
        reasoningOutputTokens,
    })

    if (isZeroInteractionUsage(usage)) {
        return null
    }

    const provider = normalizeGooseProvider(normalizeStringValue(row.provider_name) ?? null, model)
    const costUSD = calculateUsageCostFromCandidates(usage, [model, `${provider}/${model}`], resolvePricing)

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

function parseUnknownJson(value: string | null) {
    if (!value) {
        return null
    }

    try {
        return JSON.parse(value) as unknown
    }
    catch {
        return null
    }
}

function getNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}
