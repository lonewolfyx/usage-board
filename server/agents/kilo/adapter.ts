import type { AgentAdapter, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { KiloMessageValueRaw } from './types'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { discoverSourceFiles } from '#server/agents/shared/io'
import { createModelLookupCandidates } from '#server/agents/shared/model'
import { applyTotalUsageFallback, createInteractionUsage, usageHasTokens } from '#server/agents/shared/usage'
import { toIsoString } from '#shared/utils/platform'

const KILO_MESSAGE_QUERY = 'SELECT id, session_id, data FROM message'

interface KiloMessageRow {
    data?: string
    id: string
    session_id: string
}

export class KiloAdapter implements AgentAdapter {
    readonly platform = 'kilo' as const
    private readonly patterns: string[]

    constructor(config: IConfig) {
        this.patterns = config.kiloPaths.map(path => join(path, 'kilo.db'))
    }

    discoverSources() {
        return discoverSourceFiles(this.platform, this.patterns)
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadKiloFacts(source), source }
    }

    watchSourcePatterns() {
        return this.patterns
    }
}

function loadKiloFacts(source: UsageSourceFile): UsageInteractionFact[] {
    try {
        const database = new DatabaseSync(source.path, { readOnly: true })
        const rows = database.prepare(KILO_MESSAGE_QUERY).all() as unknown as KiloMessageRow[]
        const facts: UsageInteractionFact[] = []

        for (const row of rows) {
            if (!row.data) {
                continue
            }

            try {
                const fact = rowToFact(JSON.parse(row.data) as KiloMessageValueRaw, row, source, facts.length)
                if (fact) {
                    facts.push(fact)
                }
            }
            catch {
            }
        }

        database.close()
        return facts
    }
    catch {
        return []
    }
}

function rowToFact(value: KiloMessageValueRaw, row: KiloMessageRow, source: UsageSourceFile, index: number): UsageInteractionFact | null {
    if (value.role?.trim() !== 'assistant') {
        return null
    }

    const tokens = value.tokens
    const model = value.modelID?.trim() ?? ''
    const timestamp = toIsoString(value.time?.created)

    if (!tokens || !model || !timestamp) {
        return null
    }

    const extraTotalTokens = typeof tokens.reasoning === 'number' && Number.isFinite(tokens.reasoning)
        ? tokens.reasoning
        : 0
    const usage = createInteractionUsage({
        ...applyTotalUsageFallback({
            cacheCreationTokens: tokens.cache?.write,
            cacheReadTokens: tokens.cache?.read,
            inputTokens: tokens.input,
            outputTokens: tokens.output,
            totalTokens: Math.max((typeof tokens.total === 'number' && Number.isFinite(tokens.total) ? tokens.total : 0) - extraTotalTokens, 0),
        }),
        extraTotalTokens,
    })

    if (!usageHasTokens(usage)) {
        return null
    }

    const sessionId = value.session_id?.trim() || row.session_id
    const interactionId = value.id?.trim() || `${source.path}:${row.id}`
    const provider = value.providerID?.trim() ?? null
    const rawCost = value.cost
    const rawCostUSD = typeof rawCost === 'number' && Number.isFinite(rawCost) ? rawCost : null

    return {
        dedupeKey: interactionId,
        fallbackDedupeKey: null,
        interactionIndex: index,
        isSidechain: false,
        model,
        modelLookupCandidates: createModelLookupCandidates({ model, provider }),
        platform: 'kilo',
        project: 'kilo',
        provider,
        rawCostUSD,
        repository: 'local/kilo',
        role: 'assistant',
        sessionId,
        sourceFile: source.path,
        sourceFileMtime: source.mtimeMs,
        speed: 'standard',
        threadName: `Kilo ${sessionId}`,
        timestamp,
        type: 'message',
        usage,
    }
}
