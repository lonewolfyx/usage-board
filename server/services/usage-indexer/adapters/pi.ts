import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { basename, join } from 'node:path'
import { normalizeFiniteNumberOrNull, normalizeStringValue, normalizeUnknownRecord } from '#shared/utils/normalize'
import { parseJsonlFile, toIsoString } from '#shared/utils/platform'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    toDiscoveredUsageFile,
} from '../session-fragment'
import {
    applyTotalUsageAsExtra,
    createZeroPricingResolver,
    isZeroInteractionUsage,
    normalizeUsageNumber,
    toInteractionUsage,
} from './shared'

export const piUsageAdapter = {
    createPricingResolver: createZeroPricingResolver,
    async discoverFiles(config) {
        const groups = await Promise.all(config.piPaths.map(path => glob(join(path, '**', '*.jsonl'), {
            absolute: true,
        }).catch(() => [])))

        return groups
            .flat()
            .flatMap(filePath => toDiscoveredUsageFile(filePath, 'pi'))
    },
    parseFile(filePath) {
        const lines = parseJsonlFile<Record<string, unknown>>(filePath)
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
            const line = normalizeUnknownRecord(lines[index])
            const message = normalizeUnknownRecord(line?.message)

            if (!line || !message || normalizeStringValue(message.role) !== 'assistant' || !message.usage) {
                continue
            }

            const usageRecord = normalizeUnknownRecord(message.usage)
            const timestamp = toIsoString(line.timestamp)

            if (!usageRecord || !timestamp) {
                continue
            }

            const usage = toInteractionUsage({
                ...applyTotalUsageAsExtra({
                    cacheCreationTokens: normalizeUsageNumber(usageRecord.cacheWrite as number | undefined),
                    cacheReadTokens: normalizeUsageNumber(usageRecord.cacheRead as number | undefined),
                    inputTokens: normalizeUsageNumber(usageRecord.input as number | undefined),
                    outputTokens: normalizeUsageNumber(usageRecord.output as number | undefined),
                    totalTokens: normalizeUsageNumber(usageRecord.totalTokens as number | undefined),
                }),
                costUSD: normalizeFiniteNumberOrNull(normalizeUnknownRecord(usageRecord.cost)?.total) ?? 0,
            })

            if (isZeroInteractionUsage(usage)) {
                continue
            }

            const rawModel = normalizeStringValue(message.model)

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
                    String(usage.costUSD),
                ].join(':'),
                index,
                model: rawModel ? `[pi] ${rawModel}` : null,
                rawCostUSD: usage.costUSD,
                role: 'assistant',
                timestamp,
                type: normalizeStringValue(line.type) || 'message',
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
