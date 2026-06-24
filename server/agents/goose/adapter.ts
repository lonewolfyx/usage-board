import type { AgentAdapter, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { GooseModelConfig, GooseSessionRow } from './types'
import { DatabaseSync } from 'node:sqlite'
import { discoverSourceFiles } from '#server/agents/shared/io'
import { createModelLookupCandidates } from '#server/agents/shared/model'
import { createInteractionUsage, usageHasTokens } from '#server/agents/shared/usage'
import { toIsoString } from '#shared/utils/platform'

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

export class GooseAdapter implements AgentAdapter {
    readonly platform = 'goose' as const
    private readonly patterns: string[]

    constructor(config: IConfig) {
        this.patterns = [...config.goosePaths]
    }

    discoverSources() {
        return discoverSourceFiles(this.platform, this.patterns)
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadGooseFacts(source), source }
    }

    watchSourcePatterns() {
        return this.patterns
    }
}

function loadGooseFacts(source: UsageSourceFile): UsageInteractionFact[] {
    try {
        const database = new DatabaseSync(source.path, { readOnly: true })
        const rows = database.prepare(GOOSE_SESSION_QUERY).all() as unknown as GooseSessionRow[]
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

function rowToFact(row: GooseSessionRow, source: UsageSourceFile, index: number): UsageInteractionFact | null {
    let modelConfig: GooseModelConfig

    try {
        modelConfig = JSON.parse(row.model_config_json.trim()) as GooseModelConfig
    }
    catch {
        return null
    }

    const sessionId = row.id.trim()
    const model = modelConfig?.model_name?.trim() ?? ''
    const timestamp = toIsoString(row.created_at)

    if (!sessionId || !model || !timestamp) {
        return null
    }

    const inputTokens = row.accumulated_input_tokens || row.input_tokens || 0
    const outputTokens = row.accumulated_output_tokens || row.output_tokens || 0
    const totalTokens = row.accumulated_total_tokens || row.total_tokens || (inputTokens + outputTokens)
    const extraTotalTokens = Math.max(0, totalTokens - inputTokens - outputTokens)
    const usage = createInteractionUsage({
        extraTotalTokens,
        inputTokens,
        outputTokens,
    })

    if (!usageHasTokens(usage)) {
        return null
    }

    const provider = normalizeGooseProvider(row.provider_name?.trim() ?? null, model)

    return {
        dedupeKey: `goose:${source.path}:${sessionId}`,
        fallbackDedupeKey: null,
        interactionIndex: index,
        isSidechain: false,
        model,
        modelLookupCandidates: createModelLookupCandidates({ model, provider }),
        platform: 'goose',
        project: 'goose',
        provider,
        rawCostUSD: null,
        repository: 'local/goose',
        role: 'usage',
        sessionId,
        sourceFile: source.path,
        sourceFileMtime: source.mtimeMs,
        speed: 'standard',
        threadName: `Goose ${sessionId}`,
        timestamp,
        type: 'session',
        usage,
    }
}

function normalizeGooseProvider(provider: string | null, model: string): string {
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
