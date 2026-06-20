import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { parse } from '#shared/utils/parse'
import { toIsoString } from '#shared/utils/platform'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    toDiscoveredUsageFile,
} from '../session-fragment'
import {
    applyTotalUsageAsExtra,
    getFileModifiedAtIso,
    isZeroInteractionUsage,
    toInteractionUsage,
} from './shared'

export const openClawUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver()
    },
    async discoverFiles(config) {
        const groups = await Promise.all(config.openClawPaths.map(path => glob(join(path, '**', '*.jsonl*'), {
            absolute: true,
        }).catch(() => [])))

        return groups
            .flat()
            .filter(filePath => isOpenClawSessionFile(basename(filePath)))
            .flatMap(filePath => toDiscoveredUsageFile(filePath, 'openclaw'))
    },
    parseFile(filePath) {
        const lines = readFileSync(filePath, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
        const sessionId = getOpenClawSessionId(filePath)
        const fragment = createSessionFragment({
            project: 'openclaw',
            repository: 'local/openclaw',
            sessionId,
            startedAt: null,
            threadName: `OpenClaw ${sessionId}`,
        })
        let currentModel: string | null = null
        let currentProvider: string | null = null
        const fallbackTimestamp = getFileModifiedAtIso(filePath)

        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index]!
            const record = parse(line) as Record<string, any> | null

            if (!record) {
                continue
            }

            if (isOpenClawModelChange(record)) {
                const source = record.data ?? record
                currentModel = source.modelId.trim() || source.model.trim() || currentModel
                currentProvider = source.provider.trim() || currentProvider
                continue
            }

            if (record.type.trim() !== 'message') {
                continue
            }

            const message = record.message
            const usageRecord = message?.usage

            if (!message || message.role.trim() !== 'assistant' || !usageRecord) {
                continue
            }

            const rawCost = usageRecord.cost?.total
            const directCost = typeof rawCost === 'number' && Number.isFinite(rawCost) ? rawCost : null
            const usage = toInteractionUsage({
                ...applyTotalUsageAsExtra({
                    cacheCreationTokens: usageRecord.cacheWrite as number | undefined,
                    cacheReadTokens: usageRecord.cacheRead as number | undefined,
                    inputTokens: usageRecord.input as number | undefined,
                    outputTokens: usageRecord.output as number | undefined,
                    totalTokens: usageRecord.totalTokens as number | undefined,
                }),
                costUSD: directCost ?? 0,
            })

            if (isZeroInteractionUsage(usage)) {
                continue
            }

            const rawModel = message.modelId.trim()
                || message.model.trim()
                || currentModel
                || 'unknown'
            const provider = message.provider.trim() || currentProvider
            const modelLookupCandidates = provider ? [rawModel, `${provider}/${rawModel}`] : [rawModel]
            const timestamp = toIsoString(message.timestamp) ?? toIsoString(record.timestamp) ?? fallbackTimestamp

            addFragmentInteraction(fragment, {
                costUSD: usage.costUSD,
                dedupeKey: [
                    'openclaw',
                    sessionId,
                    timestamp ?? '',
                    rawModel,
                    String(usage.inputTokens),
                    String(usage.outputTokens),
                    String(usage.cacheCreationTokens ?? 0),
                    String(usage.cacheReadTokens ?? 0),
                    String(usage.extraTotalTokens ?? 0),
                    String(directCost ?? 0),
                ].join(':'),
                index,
                model: `[openclaw] ${rawModel}`,
                modelLookupCandidates,
                provider,
                rawCostUSD: directCost,
                role: 'assistant',
                timestamp,
                type: provider ? `message:${provider}` : 'message',
                usage,
            })
        }

        return fragment.interactions.length > 0 ? [fragment] : []
    },
    watchPatterns(config) {
        return config.openClawPaths.map(path => join(path, '**', '*.jsonl*'))
    },
} satisfies UsagePlatformAdapter

function isOpenClawModelChange(record: Record<string, any>) {
    const type = record.type.trim()

    return type === 'model_change'
        || (type === 'custom' && record.customType.trim() === 'model-snapshot')
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
    return index > 0 ? filename.slice(0, index) : basename(filePath)
}
