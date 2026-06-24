import type { AgentAdapter, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { PiLineRaw } from './types'
import { Buffer } from 'node:buffer'
import { basename } from 'node:path'
import { discoverSourceFiles, readJsonlObjects } from '#server/agents/shared/io'
import { applyTotalUsageAsExtra, createInteractionUsage, usageHasTokens } from '#server/agents/shared/usage'
import { toIsoString } from '#shared/utils/platform'

const PI_USAGE_MARKER = Buffer.from('"usage"')

export class PiAdapter implements AgentAdapter {
    readonly platform = 'pi' as const
    private readonly patterns: string[]

    constructor(config: IConfig) {
        this.patterns = config.piPaths.map(path => `${path.replace(/\/$/u, '')}/**/*.jsonl`)
    }

    discoverSources() {
        return discoverSourceFiles(this.platform, this.patterns)
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadPiFacts(source), source }
    }

    watchSourcePatterns() {
        return this.patterns
    }
}

function loadPiFacts(source: UsageSourceFile): UsageInteractionFact[] {
    const lines = readJsonlObjects<PiLineRaw>(source.path, PI_USAGE_MARKER)
    const sessionId = readPiSessionId(source.path)
    const project = readPiProject(source.path)
    const repository = `local/${project}`
    const facts: UsageInteractionFact[] = []

    for (const line of lines) {
        const message = line?.message

        if (!message || message.role !== 'assistant' || !message.usage) {
            continue
        }

        const usageRecord = message.usage
        const timestamp = toIsoString(line.timestamp)

        if (!timestamp) {
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

        const rawModel = message.model?.trim() ?? ''
        const model = rawModel ? `[pi] ${rawModel}` : null
        const rawCostUSD = usageRecord.cost?.total ?? 0

        facts.push({
            dedupeKey: [
                'pi',
                project,
                sessionId,
                timestamp,
                rawModel || '',
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
            model,
            modelLookupCandidates: model ? [model] : [],
            platform: 'pi',
            project,
            provider: null,
            rawCostUSD,
            repository,
            role: 'assistant',
            sessionId,
            sourceFile: source.path,
            sourceFileMtime: source.mtimeMs,
            speed: 'standard',
            threadName: `Pi ${sessionId}`,
            timestamp,
            type: line.type?.trim() || 'message',
            usage,
        })
    }

    return facts
}

function readPiSessionId(filePath: string) {
    const filename = basename(filePath, '.jsonl')
    const separatorIndex = filename.indexOf('_')

    return separatorIndex >= 0 ? filename.slice(separatorIndex + 1) : filename
}

function readPiProject(filePath: string) {
    const segments = filePath.split('/').filter(Boolean)

    for (let index = 0; index < segments.length; index += 1) {
        if (segments[index] === 'sessions' && segments[index + 1]) {
            return segments[index + 1]!
        }
    }

    return 'unknown'
}
