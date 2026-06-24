import type { AgentAdapter, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { OpenClawLineRaw } from './types'
import { basename } from 'node:path'
import { discoverSourceFiles, readJsonlObjects } from '#server/agents/shared/io'
import { applyTotalUsageAsExtra, createInteractionUsage, usageHasTokens } from '#server/agents/shared/usage'
import { toIsoString } from '#shared/utils/platform'

export class OpenClawAdapter implements AgentAdapter {
    readonly platform = 'openclaw' as const
    private readonly patterns: string[]

    constructor(config: IConfig) {
        this.patterns = config.openClawPaths.map(path => `${path.replace(/\/$/u, '')}/**/*.jsonl*`)
    }

    discoverSources() {
        return discoverSourceFiles(this.platform, this.patterns)
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadOpenClawFacts(source), source }
    }

    watchSourcePatterns() {
        return this.patterns
    }
}

function loadOpenClawFacts(source: UsageSourceFile): UsageInteractionFact[] {
    if (!isOpenClawSessionFile(basename(source.path))) {
        return []
    }

    const lines = readJsonlObjects<OpenClawLineRaw>(source.path)
    const sessionId = getOpenClawSessionId(source.path)
    const fallbackTimestamp = new Date(source.mtimeMs).toISOString()
    const facts: UsageInteractionFact[] = []
    let currentModel: string | null = null
    let currentProvider: string | null = null

    for (const record of lines) {
        if (!record) {
            continue
        }

        if (isOpenClawModelChange(record)) {
            const sourceData = record.data ?? record
            currentModel = sourceData.modelId?.trim() || sourceData.model?.trim() || currentModel
            currentProvider = sourceData.provider?.trim() || currentProvider
            continue
        }

        if (record.type?.trim() !== 'message') {
            continue
        }

        const message = record.message
        const usageRecord = message?.usage

        if (!message || message.role?.trim() !== 'assistant' || !usageRecord) {
            continue
        }

        const usage = createInteractionUsage({
            ...applyTotalUsageAsExtra({
                cacheCreationTokens: usageRecord.cacheWrite,
                cacheReadTokens: usageRecord.cacheRead,
                inputTokens: usageRecord.input,
                outputTokens: usageRecord.output,
                totalTokens: usageRecord.totalTokens,
            }),
        })

        if (!usageHasTokens(usage)) {
            continue
        }

        const rawModel = message.modelId?.trim()
            || message.model?.trim()
            || currentModel
            || 'unknown'
        const provider = message.provider?.trim() || currentProvider
        const timestamp = toIsoString(message.timestamp) ?? toIsoString(record.timestamp) ?? fallbackTimestamp
        const rawCostUSD = usageRecord.cost?.total ?? 0

        facts.push({
            dedupeKey: [
                'openclaw',
                sessionId,
                timestamp ?? '',
                rawModel,
                usage.inputTokens,
                usage.outputTokens,
                usage.cacheCreationTokens,
                usage.cacheReadTokens,
                usage.extraTotalTokens,
                rawCostUSD,
            ].join(':'),
            fallbackDedupeKey: null,
            interactionIndex: facts.length,
            isSidechain: false,
            model: `[openclaw] ${rawModel}`,
            modelLookupCandidates: [`[openclaw] ${rawModel}`],
            platform: 'openclaw',
            project: 'openclaw',
            provider,
            rawCostUSD,
            repository: 'local/openclaw',
            role: 'assistant',
            sessionId,
            sourceFile: source.path,
            sourceFileMtime: source.mtimeMs,
            speed: 'standard',
            threadName: `OpenClaw ${sessionId}`,
            timestamp,
            type: provider ? `message:${provider}` : 'message',
            usage,
        })
    }

    return facts
}

function isOpenClawModelChange(record: OpenClawLineRaw) {
    const type = record.type?.trim()

    return type === 'model_change'
        || (type === 'custom' && record.customType?.trim() === 'model-snapshot')
}

function isOpenClawSessionFile(name: string) {
    const index = name.indexOf('.jsonl')

    if (index < 0) {
        return false
    }

    const suffix = name.slice(index)
    return suffix === '.jsonl'
        || suffix.startsWith('.jsonl.deleted.')
        || suffix.startsWith('.jsonl.reset.')
}

function getOpenClawSessionId(filePath: string) {
    const filename = basename(filePath)
    const index = filename.indexOf('.jsonl')
    return index > 0 ? filename.slice(0, index) : filename
}
