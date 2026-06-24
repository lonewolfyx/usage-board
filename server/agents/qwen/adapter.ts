import type { AgentAdapter, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { QwenLineRaw } from './types'
import { Buffer } from 'node:buffer'
import { basename } from 'node:path'
import { discoverSourceFiles, readJsonlObjects } from '#server/agents/shared/io'
import { createModelLookupCandidates } from '#server/agents/shared/model'
import { applyTotalUsageFallback, createInteractionUsage, usageHasTokens } from '#server/agents/shared/usage'
import { toIsoString } from '#shared/utils/platform'

const QWEN_USAGE_MARKER = Buffer.from('"usageMetadata"')

export class QwenAdapter implements AgentAdapter {
    readonly platform = 'qwen' as const
    private readonly patterns: string[]

    constructor(config: IConfig) {
        this.patterns = config.qwenPaths.map(path => `${path.replace(/\/$/u, '')}/projects/*/chats/*.jsonl`)
    }

    discoverSources() {
        return discoverSourceFiles(this.platform, this.patterns)
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadQwenFacts(source), source }
    }

    watchSourcePatterns() {
        return this.patterns
    }
}

function loadQwenFacts(source: UsageSourceFile): UsageInteractionFact[] {
    const lines = readJsonlObjects<QwenLineRaw>(source.path, QWEN_USAGE_MARKER)
    const project = readQwenProject(source.path)
    const sessionId = basename(source.path, '.jsonl') ? `${project}-${basename(source.path, '.jsonl')}` : project
    const repository = `local/${project}`
    const fallbackTimestamp = new Date(source.mtimeMs).toISOString()
    const facts: UsageInteractionFact[] = []

    for (const line of lines) {
        const usageMetadata = line?.usageMetadata

        if (!line || line.type?.trim() !== 'assistant' || !usageMetadata) {
            continue
        }

        const thoughtsTokens = usageMetadata.thoughtsTokenCount ?? 0
        const totalTokens = Math.max((typeof usageMetadata.totalTokenCount === 'number' && Number.isFinite(usageMetadata.totalTokenCount) ? usageMetadata.totalTokenCount : 0) - thoughtsTokens, 0)
        const usage = createInteractionUsage({
            ...applyTotalUsageFallback({
                cacheReadTokens: usageMetadata.cachedContentTokenCount,
                inputTokens: usageMetadata.promptTokenCount,
                outputTokens: usageMetadata.candidatesTokenCount,
                totalTokens,
            }),
            extraTotalTokens: thoughtsTokens,
        })

        if (!usageHasTokens(usage)) {
            continue
        }

        const model = line.model?.trim() || 'unknown'
        const timestamp = toIsoString(line.timestamp) ?? fallbackTimestamp

        facts.push({
            dedupeKey: [
                sessionId,
                timestamp || '',
                model,
                usage.totalTokens,
            ].join(':'),
            fallbackDedupeKey: null,
            interactionIndex: facts.length,
            isSidechain: false,
            model,
            modelLookupCandidates: createModelLookupCandidates({ model, addProviderPrefixes: ['qwen', 'alibaba'] }),
            platform: 'qwen',
            project,
            provider: null,
            rawCostUSD: null,
            repository,
            role: 'assistant',
            sessionId,
            sourceFile: source.path,
            sourceFileMtime: source.mtimeMs,
            speed: 'standard',
            threadName: `Qwen ${sessionId}`,
            timestamp,
            type: 'assistant',
            usage,
        })
    }

    return facts
}

function readQwenProject(filePath: string) {
    const parts = filePath.split('/').filter(Boolean)

    for (let index = parts.length - 4; index >= 0; index -= 1) {
        if (parts[index] === 'projects' && parts[index + 2] === 'chats' && parts[index + 1]) {
            return parts[index + 1]!
        }
    }

    return 'unknown'
}
