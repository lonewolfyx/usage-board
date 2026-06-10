import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { normalizeStringValue, normalizeUnknownRecord } from '#shared/utils/normalize'
import { parse } from '#shared/utils/parse'
import { toIsoString } from '#shared/utils/platform'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    toDiscoveredUsageFile,
} from '../session-fragment'
import {
    applyTotalUsageFallback,
    calculateUsageCostFromCandidates,
    getFileModifiedAtIso,
    isZeroInteractionUsage,
    normalizeUsageNumber,
    toInteractionUsage,
} from './shared'

export const qwenUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver({
            getLookupCandidates: model => [model, `qwen/${model}`, `alibaba/${model}`],
        })
    },
    async discoverFiles(config) {
        const groups = await Promise.all(config.qwenPaths.map(path => glob(join(path, 'projects', '*', 'chats', '*.jsonl'), {
            absolute: true,
        }).catch(() => [])))

        return groups
            .flat()
            .flatMap(filePath => toDiscoveredUsageFile(filePath, 'qwen'))
    },
    parseFile(filePath, resolvePricing) {
        const project = getQwenProject(filePath)
        const sessionId = getQwenSessionId(filePath, project)
        const fragment = createSessionFragment({
            project,
            repository: `local/${project}`,
            sessionId,
            startedAt: getFileModifiedAtIso(filePath),
            threadName: `Qwen ${sessionId}`,
        })
        const fallbackTimestamp = getFileModifiedAtIso(filePath)
        const lines = readFileSync(filePath, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)

        for (let index = 0; index < lines.length; index += 1) {
            const record = normalizeUnknownRecord(parse(lines[index]!))
            const usageRecord = normalizeUnknownRecord(record?.usageMetadata)

            if (!record || normalizeStringValue(record.type) !== 'assistant' || !usageRecord) {
                continue
            }

            const extraTotalTokens = normalizeUsageNumber(usageRecord.thoughtsTokenCount as number | undefined)
            const usage = toInteractionUsage({
                ...applyTotalUsageFallback({
                    cacheReadTokens: normalizeUsageNumber(usageRecord.cachedContentTokenCount as number | undefined),
                    inputTokens: normalizeUsageNumber(usageRecord.promptTokenCount as number | undefined),
                    outputTokens: normalizeUsageNumber(usageRecord.candidatesTokenCount as number | undefined),
                    totalTokens: Math.max(normalizeUsageNumber(usageRecord.totalTokenCount as number | undefined) - extraTotalTokens, 0),
                }),
                extraTotalTokens,
            })

            if (isZeroInteractionUsage(usage)) {
                continue
            }

            const model = normalizeStringValue(record.model) || 'unknown'
            const costUSD = calculateUsageCostFromCandidates(usage, [model, `qwen/${model}`, `alibaba/${model}`], resolvePricing)
            const timestamp = toIsoString(record.timestamp) ?? fallbackTimestamp

            addFragmentInteraction(fragment, {
                costUSD,
                dedupeKey: [
                    sessionId,
                    timestamp || '',
                    model,
                    String(usage.totalTokens),
                ].join(':'),
                index,
                model,
                role: 'assistant',
                timestamp,
                type: 'assistant',
                usage: toInteractionUsage({
                    ...usage,
                    costUSD,
                }),
            })
        }

        return fragment.interactions.length > 0 ? [fragment] : []
    },
    watchPatterns(config) {
        return config.qwenPaths.map(path => join(path, 'projects', '*', 'chats', '*.jsonl'))
    },
} satisfies UsagePlatformAdapter

function getQwenProject(filePath: string) {
    const parts = filePath.split('/').filter(Boolean)

    for (let index = parts.length - 4; index >= 0; index -= 1) {
        if (parts[index] === 'projects' && parts[index + 2] === 'chats' && parts[index + 1]) {
            return parts[index + 1]!
        }
    }

    return 'unknown'
}

function getQwenSessionId(filePath: string, project: string) {
    return basename(filePath, '.jsonl') ? `${project}-${basename(filePath, '.jsonl')}` : project
}
