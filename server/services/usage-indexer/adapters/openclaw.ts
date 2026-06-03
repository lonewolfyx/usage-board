import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { normalizeFiniteNumberOrNull, normalizeStringValue, normalizeUnknownRecord } from '#shared/utils/normalize'
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
    createZeroPricingResolver,
    getFileModifiedAtIso,
    isZeroInteractionUsage,
    normalizeUsageNumber,
    toInteractionUsage,
} from './shared'

export const openClawUsageAdapter = {
    createPricingResolver: createZeroPricingResolver,
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
            const record = normalizeUnknownRecord(parse(line))

            if (!record) {
                continue
            }

            if (isOpenClawModelChange(record)) {
                const source = normalizeUnknownRecord(record.data) ?? record
                currentModel = normalizeStringValue(source.modelId) || normalizeStringValue(source.model) || currentModel
                currentProvider = normalizeStringValue(source.provider) || currentProvider
                continue
            }

            if (normalizeStringValue(record.type) !== 'message') {
                continue
            }

            const message = normalizeUnknownRecord(record.message)
            const usageRecord = normalizeUnknownRecord(message?.usage)

            if (!message || normalizeStringValue(message.role) !== 'assistant' || !usageRecord) {
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

            const rawModel = normalizeStringValue(message.modelId)
                || normalizeStringValue(message.model)
                || currentModel
                || 'unknown'
            const provider = normalizeStringValue(message.provider) || currentProvider
            const timestamp = toIsoString(message.timestamp) ?? toIsoString(record.timestamp) ?? fallbackTimestamp

            addFragmentInteraction(fragment, {
                content: '',
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
                    String(usage.costUSD),
                ].join(':'),
                index,
                model: `[openclaw] ${rawModel}`,
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

function isOpenClawModelChange(record: Record<string, unknown>) {
    const type = normalizeStringValue(record.type)

    return type === 'model_change'
        || (type === 'custom' && normalizeStringValue(record.customType) === 'model-snapshot')
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
