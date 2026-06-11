import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
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
        const sessionId = basename(filePath, '.jsonl') ? `${project}-${basename(filePath, '.jsonl')}` : project
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
            const record = JSON.parse(lines[index]!)
            const usageRecord = record?.usageMetadata

            if (!record || record.type.trim() !== 'assistant' || !usageRecord) {
                continue
            }

            const extraTotalTokens = usageRecord.thoughtsTokenCount ?? 0
            const usage = toInteractionUsage({
                ...applyTotalUsageFallback({
                    cacheReadTokens: usageRecord.cachedContentTokenCount as number | undefined,
                    inputTokens: usageRecord.promptTokenCount as number | undefined,
                    outputTokens: usageRecord.candidatesTokenCount as number | undefined,
                    totalTokens: Math.max((typeof usageRecord.totalTokenCount === 'number' && Number.isFinite(usageRecord.totalTokenCount) ? usageRecord.totalTokenCount : 0) - extraTotalTokens, 0),
                }),
                extraTotalTokens,
            })

            if (isZeroInteractionUsage(usage)) {
                continue
            }

            const model = record.model.trim() || 'unknown'
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
                modelLookupCandidates: [model, `qwen/${model}`, `alibaba/${model}`],
                rawCostUSD: null,
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
