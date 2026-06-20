import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { basename, join } from 'node:path'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { parseJsonlFile, toIsoString } from '#shared/utils/platform'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    toDiscoveredUsageFile,
} from '../session-fragment'
import {
    applyTotalUsageAsExtra,
    isZeroInteractionUsage,
    toInteractionUsage,
} from './shared'

interface PiUsageCost {
    total?: number
}

interface PiUsageRecord {
    cacheRead?: number
    cacheWrite?: number
    cost?: PiUsageCost
    input?: number
    output?: number
    totalTokens?: number
}

interface PiMessage {
    model?: string
    role?: string
    usage?: PiUsageRecord
}

interface PiSessionLine {
    message?: PiMessage
    timestamp?: string | number
    type?: string
}

export const piUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver()
    },
    async discoverFiles(config) {
        const groups = await Promise.all(config.piPaths.map(path => glob(join(path, '**', '*.jsonl'), {
            absolute: true,
        }).catch(() => [])))

        return groups
            .flat()
            .flatMap(filePath => toDiscoveredUsageFile(filePath, 'pi'))
    },
    parseFile(filePath) {
        const lines = parseJsonlFile<PiSessionLine>(filePath)
        const sessionId = getPiSessionId(filePath)
        const project = getPiProject(filePath)
        const fragment = createSessionFragment({
            project,
            repository: `local/${project}`,
            sessionId,
            startedAt: lines.map(line => toIsoString(line.timestamp)).find(Boolean) ?? null,
            threadName: `Pi ${sessionId}`,
        })

        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index]
            const message = line?.message

            if (!line || !message || message.role !== 'assistant' || !message.usage) {
                continue
            }

            const usageRecord = message.usage
            const timestamp = toIsoString(line.timestamp)

            if (!usageRecord || !timestamp) {
                continue
            }

            const rawCost = usageRecord.cost?.total
            const directCost = typeof rawCost === 'number' && Number.isFinite(rawCost) ? rawCost : null
            const usage = toInteractionUsage({
                ...applyTotalUsageAsExtra({
                    cacheCreationTokens: typeof usageRecord.cacheWrite === 'number' && Number.isFinite(usageRecord.cacheWrite) ? usageRecord.cacheWrite : undefined,
                    cacheReadTokens: typeof usageRecord.cacheRead === 'number' && Number.isFinite(usageRecord.cacheRead) ? usageRecord.cacheRead : undefined,
                    inputTokens: typeof usageRecord.input === 'number' && Number.isFinite(usageRecord.input) ? usageRecord.input : undefined,
                    outputTokens: typeof usageRecord.output === 'number' && Number.isFinite(usageRecord.output) ? usageRecord.output : undefined,
                    totalTokens: typeof usageRecord.totalTokens === 'number' && Number.isFinite(usageRecord.totalTokens) ? usageRecord.totalTokens : undefined,
                }),
                costUSD: directCost ?? 0,
            })

            if (isZeroInteractionUsage(usage)) {
                continue
            }

            const rawModel = message.model?.trim() ?? ''

            addFragmentInteraction(fragment, {
                costUSD: usage.costUSD,
                dedupeKey: [
                    'pi',
                    project,
                    sessionId,
                    timestamp,
                    rawModel || '',
                    String(usage.inputTokens),
                    String(usage.outputTokens),
                    String(usage.cacheCreationTokens ?? 0),
                    String(usage.cacheReadTokens ?? 0),
                    String(usage.extraTotalTokens ?? 0),
                    String(directCost ?? 0),
                ].join(':'),
                index,
                model: rawModel ? `[pi] ${rawModel}` : null,
                modelLookupCandidates: rawModel ? [rawModel] : undefined,
                rawCostUSD: directCost,
                role: 'assistant',
                timestamp,
                type: line.type?.trim() || 'message',
                usage,
            })
        }

        return fragment.interactions.length > 0 ? [fragment] : []
    },
    watchPatterns(config) {
        return config.piPaths.map(path => join(path, '**', '*.jsonl'))
    },
} satisfies UsagePlatformAdapter

function getPiSessionId(filePath: string) {
    const filename = basename(filePath, '.jsonl')
    const separatorIndex = filename.indexOf('_')

    return separatorIndex >= 0 ? filename.slice(separatorIndex + 1) : filename
}

function getPiProject(filePath: string) {
    const segments = filePath.split('/').filter(Boolean)

    for (let index = 0; index < segments.length; index += 1) {
        if (segments[index] === 'sessions' && segments[index + 1]) {
            return segments[index + 1]!
        }
    }

    return 'unknown'
}
