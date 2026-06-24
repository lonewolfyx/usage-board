import type { AgentAdapter, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { HermesSessionRow } from './types'
import { DatabaseSync } from 'node:sqlite'
import { discoverSourceFiles } from '#server/agents/shared/io'
import { createModelLookupCandidates } from '#server/agents/shared/model'
import { createInteractionUsage, usageHasTokens } from '#server/agents/shared/usage'
import { fromDateTimestamp } from '#shared/utils/date'

const HERMES_SESSION_QUERY = `
SELECT
    id,
    model,
    billing_provider,
    started_at,
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

export class HermesAdapter implements AgentAdapter {
    readonly platform = 'hermes' as const
    private readonly patterns: string[]

    constructor(config: IConfig) {
        this.patterns = [...config.hermesPaths]
    }

    discoverSources() {
        return discoverSourceFiles(this.platform, this.patterns)
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadHermesFacts(source), source }
    }

    watchSourcePatterns() {
        return this.patterns
    }
}

function loadHermesFacts(source: UsageSourceFile): UsageInteractionFact[] {
    try {
        const database = new DatabaseSync(source.path, { readOnly: true })
        const rows = database.prepare(HERMES_SESSION_QUERY).all() as unknown as HermesSessionRow[]
        const facts: UsageInteractionFact[] = []

        for (const row of rows) {
            const fact = rowToFact(row, source, facts.length)
            if (fact) {
                facts.push(fact)
            }
        }

        database.close()
        return facts
    }
    catch {
        return []
    }
}

function rowToFact(row: HermesSessionRow, source: UsageSourceFile, index: number): UsageInteractionFact | null {
    const sessionId = typeof row.id === 'string' ? row.id.trim() : ''
    const model = typeof row.model === 'string' ? row.model.trim() : ''
    const timestamp = typeof row.started_at === 'number' && Number.isFinite(row.started_at) && row.started_at > 0
        ? fromDateTimestamp(row.started_at)?.toISOString() ?? null
        : null

    if (!sessionId || !model || !timestamp) {
        return null
    }

    const usage = createInteractionUsage({
        cacheCreationTokens: row.cache_write_tokens,
        cacheReadTokens: row.cache_read_tokens,
        extraTotalTokens: row.reasoning_tokens,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
    })

    const actualCost = typeof row.actual_cost_usd === 'number' && Number.isFinite(row.actual_cost_usd) && row.actual_cost_usd >= 0
        ? row.actual_cost_usd
        : null
    const estimatedCost = typeof row.estimated_cost_usd === 'number' && Number.isFinite(row.estimated_cost_usd) && row.estimated_cost_usd >= 0
        ? row.estimated_cost_usd
        : null

    if (!usageHasTokens(usage) && !actualCost && !estimatedCost) {
        return null
    }

    const provider = normalizeHermesProvider(typeof row.billing_provider === 'string' ? row.billing_provider : null, model)
    const rawCostUSD = actualCost ?? estimatedCost

    return {
        dedupeKey: `hermes:${sessionId}`,
        fallbackDedupeKey: null,
        interactionIndex: index,
        isSidechain: false,
        model,
        modelLookupCandidates: createModelLookupCandidates({ model, provider }),
        platform: 'hermes',
        project: 'hermes',
        provider,
        rawCostUSD,
        repository: 'local/hermes',
        role: 'usage',
        sessionId,
        sourceFile: source.path,
        sourceFileMtime: source.mtimeMs,
        speed: 'standard',
        threadName: `Hermes ${sessionId}`,
        timestamp,
        type: 'session',
        usage,
    }
}

function normalizeHermesProvider(provider: string | null, model: string): string {
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
