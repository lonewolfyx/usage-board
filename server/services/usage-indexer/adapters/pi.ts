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
        const lines = parseJsonlFile<Record<string, any>>(filePath)
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

            if (!line || !message || (message as Record<string, unknown>).role !== 'assistant' || !(message as Record<string, unknown>).usage) {
                continue
            }

            const usageRecord = (message as Record<string, unknown>).usage
            const timestamp = toIsoString(line.timestamp)

            if (!usageRecord || !timestamp) {
                continue
            }

            const rawCost = (usageRecord as Record<string, any>).cost?.total
            const directCost = typeof rawCost === 'number' && Number.isFinite(rawCost) ? rawCost : null
            const usage = toInteractionUsage({
                ...applyTotalUsageAsExtra({
                    cacheCreationTokens: (usageRecord as Record<string, any>).cacheWrite as number | undefined,
                    cacheReadTokens: (usageRecord as Record<string, any>).cacheRead as number | undefined,
                    inputTokens: (usageRecord as Record<string, any>).input as number | undefined,
                    outputTokens: (usageRecord as Record<string, any>).output as number | undefined,
                    totalTokens: (usageRecord as Record<string, any>).totalTokens as number | undefined,
                }),
                costUSD: directCost ?? 0,
            })

            if (isZeroInteractionUsage(usage)) {
                continue
            }

            const rawModel = (message as Record<string, any>).model.trim()

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
                type: line.type.trim() || 'message',
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
