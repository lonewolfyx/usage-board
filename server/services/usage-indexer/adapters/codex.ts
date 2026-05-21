import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import type { ModelPricingResolver, RawUsage, SessionLogLine } from '#shared/types/platform'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
    CODEX_FALLBACK_MODEL,
    CODEX_MODEL_ALIASES,
} from '#shared/platform/constant'
import { calculateUsageCostUSD, createLiteLLMPricingResolver } from '#shared/platform/pricing'
import {
    convertCodexRawUsage,
    extractModelName,
    getProjectName,
    isOpenRouterFreeModel,
    isZeroUsage,
    normalizeRawUsage,
    normalizeRepositoryUrl,
    parseJsonlFile,
    subtractRawUsage,
    toIsoString,
} from '#shared/utils/platform'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    getString,
    normalizeRole,
    toDiscoveredUsageFile,
} from '../session-fragment'

export const codexUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver({
            aliases: CODEX_MODEL_ALIASES,
            fallbackModel: CODEX_FALLBACK_MODEL,
            isZeroCostModel: isOpenRouterFreeModel,
        })
    },
    async discoverFiles(config) {
        const sessionsDir = join(config.codexPath, 'sessions')

        if (!existsSync(sessionsDir)) {
            return []
        }

        const files = await glob('**/*.jsonl', {
            absolute: true,
            cwd: sessionsDir,
        })

        return files.flatMap(filePath => toDiscoveredUsageFile(filePath, 'codex'))
    },
    parseFile(filePath, resolvePricing) {
        const lines = parseJsonlFile<SessionLogLine>(filePath)
        const sessionMeta = lines.find(line => line.type === 'session_meta')?.payload
        const sessionId = getSessionId(filePath, getString(sessionMeta?.id))
        const startedAt = toIsoString(sessionMeta?.timestamp) ?? toIsoString(lines[0]?.timestamp)
        const project = getProjectName(getString(sessionMeta?.cwd))
        const repository = normalizeRepositoryUrl(sessionMeta?.git?.repository_url) || `local/${project}`
        const fragment = createSessionFragment({
            project,
            repository,
            sessionId,
            startedAt,
            threadName: `Session for ${project}`,
        })
        let previousTotals: RawUsage | null = null
        let currentModel: string | undefined
        let currentModelIsFallback = false

        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index]!

            if (line.type === 'turn_context') {
                const contextModel = extractModelName(line.payload)

                if (contextModel) {
                    currentModel = contextModel
                    currentModelIsFallback = false
                }
            }

            const timestamp = toIsoString(line.timestamp) ?? toIsoString(line.payload?.timestamp)
            const extractedModel = extractModelName(line.payload)

            if (extractedModel) {
                currentModel = extractedModel
                currentModelIsFallback = false
            }

            const rawUsage = getCodexRawUsage(line, previousTotals)
            const totalUsage = normalizeRawUsage(line.payload?.info?.total_token_usage)

            if (totalUsage) {
                previousTotals = totalUsage
            }

            let model = extractedModel ?? currentModel
            let isFallbackModel = false

            if (!model && rawUsage) {
                model = CODEX_FALLBACK_MODEL
                isFallbackModel = true
                currentModel = model
                currentModelIsFallback = true
            }
            else if (!extractedModel && currentModelIsFallback) {
                isFallbackModel = true
            }

            const usage = rawUsage
                ? getCodexInteractionUsage(rawUsage, model ?? CODEX_FALLBACK_MODEL, resolvePricing)
                : null

            addFragmentInteraction(fragment, {
                content: extractCodexContent(line),
                costUSD: usage?.costUSD ?? 0,
                index,
                model: model ?? null,
                role: getCodexRole(line),
                timestamp,
                type: line.payload?.type ?? line.type ?? 'event',
                usage: usage ? { ...usage, isFallbackModel } : null,
            })
        }

        return [fragment]
    },
    watchPatterns(config) {
        return [join(config.codexPath, 'sessions', '**', '*.jsonl')]
    },
} satisfies UsagePlatformAdapter

function getCodexRawUsage(line: SessionLogLine, previousTotals: RawUsage | null) {
    if (line.type !== 'event_msg' || line.payload?.type !== 'token_count') {
        return null
    }

    const info = line.payload.info
    const lastUsage = normalizeRawUsage(info?.last_token_usage)
    const totalUsage = normalizeRawUsage(info?.total_token_usage)

    return lastUsage ?? (totalUsage ? subtractRawUsage(totalUsage, previousTotals) : null)
}

function getCodexInteractionUsage(
    rawUsage: RawUsage,
    model: string,
    resolvePricing: ModelPricingResolver,
) {
    const usage = convertCodexRawUsage(rawUsage)

    if (isZeroUsage(usage)) {
        return null
    }

    return {
        ...usage,
        costUSD: calculateUsageCostUSD(usage, resolvePricing(model)),
    }
}

function extractCodexContent(line: SessionLogLine) {
    const payload = line.payload

    if (!payload) {
        return ''
    }

    const message = payload.message

    if (typeof message === 'string') {
        return message
    }

    return getString(payload.text) || getString(payload.output) || getString(payload.content)
}

function getCodexRole(line: SessionLogLine) {
    const type = line.payload?.type ?? line.type ?? ''

    if (type === 'token_count') {
        return 'usage'
    }

    return normalizeRole(type)
}

function getSessionId(filePath: string, sessionMetaId: string | undefined) {
    return sessionMetaId?.trim() || basename(filePath, '.jsonl')
}
