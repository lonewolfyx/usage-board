import type { AgentAdapter, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { KimiConfigRaw, KimiWireLineRaw } from './types'
import { Buffer } from 'node:buffer'
import { dirname, join } from 'node:path'
import { discoverSourceFiles, readJsonFile, readJsonlObjects } from '#server/agents/shared/io'
import { createModelLookupCandidates } from '#server/agents/shared/model'
import { applyTotalUsageAsExtra, createInteractionUsage, usageHasTokens } from '#server/agents/shared/usage'
import { toIsoString } from '#shared/utils/platform'

const KIMI_STATUS_MARKER = Buffer.from('StatusUpdate')
const KIMI_DEFAULT_MODEL = 'kimi-for-coding'

export class KimiAdapter implements AgentAdapter {
    readonly platform = 'kimi' as const
    private readonly patterns: string[]

    constructor(config: IConfig) {
        this.patterns = config.kimiPaths.map(path => `${path.replace(/\/$/u, '')}/sessions/**/wire.jsonl`)
    }

    discoverSources() {
        return discoverSourceFiles(this.platform, this.patterns)
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadKimiFacts(source), source }
    }

    watchSourcePatterns() {
        return this.patterns
    }
}

function loadKimiFacts(source: UsageSourceFile): UsageInteractionFact[] {
    const lines = readJsonlObjects<KimiWireLineRaw>(source.path, KIMI_STATUS_MARKER)
    const sessionId = dirname(source.path).split('/').filter(Boolean).pop() || 'unknown'
    const model = getKimiModel(source.path)
    const fallbackTimestamp = new Date(source.mtimeMs).toISOString()
    const facts: UsageInteractionFact[] = []

    for (const record of lines) {
        const message = record?.message
        const payload = message?.payload
        const tokenUsage = payload?.token_usage

        if (!record || !message || message.type?.trim() !== 'StatusUpdate' || !payload || !tokenUsage) {
            continue
        }

        const usage = createInteractionUsage({
            ...applyTotalUsageAsExtra({
                cacheCreationTokens: tokenUsage.input_cache_creation,
                cacheReadTokens: tokenUsage.input_cache_read,
                inputTokens: tokenUsage.input_other,
                outputTokens: tokenUsage.output,
                totalTokens: tokenUsage.total,
            }),
        })

        if (!usageHasTokens(usage)) {
            continue
        }

        const timestamp = toIsoString(record.timestamp) ?? fallbackTimestamp

        facts.push({
            dedupeKey: [
                sessionId,
                payload.message_id?.trim() || '',
                timestamp || '',
                model,
                usage.inputTokens,
                usage.outputTokens,
                usage.cacheCreationTokens,
                usage.cacheReadTokens,
                usage.extraTotalTokens,
            ].join(':'),
            fallbackDedupeKey: null,
            interactionIndex: facts.length,
            isSidechain: false,
            model,
            modelLookupCandidates: createModelLookupCandidates({ model, addProviderPrefixes: ['moonshot', 'kimi'] }),
            platform: 'kimi',
            project: 'kimi',
            provider: null,
            rawCostUSD: null,
            repository: 'local/kimi',
            role: 'usage',
            sessionId,
            sourceFile: source.path,
            sourceFileMtime: source.mtimeMs,
            speed: 'standard',
            threadName: `Kimi ${sessionId}`,
            timestamp,
            type: 'StatusUpdate',
            usage,
        })
    }

    return facts
}

function getKimiModel(filePath: string) {
    const config = readJsonFile<KimiConfigRaw>(join(dirname(dirname(dirname(filePath))), 'config.json'))
    return config?.model?.trim() || KIMI_DEFAULT_MODEL
}
