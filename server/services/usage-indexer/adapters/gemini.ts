import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import type { GeminiSessionFile, GeminiTokenSnapshot, ModelPricingResolver } from '#shared/types/platform'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
    GEMINI_FALLBACK_MODEL,
    GEMINI_FALLBACK_PRICING_TABLE,
    GEMINI_MODEL_ALIASES,
} from '#shared/platform/constant'
import { calculateUsageCostUSD, createLiteLLMPricingResolver } from '#shared/platform/pricing'
import {
    convertGeminiTokenUsage,
    extractGeminiMessageText,
    getGeminiLookupCandidates,
    getGeminiProjectKeyFromPath,
    getGeminiProjectRoot,
    getProjectName,
    getRepositoryNameFromProjectRoot,
    isZeroUsage,
    parseJsonFile,
    toIsoString,
} from '#shared/utils/platform'
import { normalizeNumber } from '#shared/utils/usage-dashboard'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    normalizeRole,
    toDiscoveredUsageFile,
} from '../session-fragment'

export const geminiUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver({
            aliases: GEMINI_MODEL_ALIASES,
            fallbackPricingTable: GEMINI_FALLBACK_PRICING_TABLE,
            getLookupCandidates: getGeminiLookupCandidates,
        })
    },
    async discoverFiles(config) {
        const tmpDir = `${config.geminiPath}/tmp`

        if (!existsSync(tmpDir)) {
            return []
        }

        const fileGroups = await Promise.all([
            glob(`${tmpDir}/*/chats/session-*.json`, { absolute: true }),
            glob(`${tmpDir}/*/chats/sessions-*.json`, { absolute: true }),
        ])
        const files = Array.from(new Set(fileGroups.flat())).sort((a, b) => a.localeCompare(b))

        return files.flatMap(filePath => toDiscoveredUsageFile(filePath, 'gemini'))
    },
    parseFile(filePath, resolvePricing) {
        const data = parseJsonFile(filePath)

        if (!isGeminiSessionFile(data)) {
            return []
        }

        const startedAt = toIsoString(data.startTime)
            ?? data.messages.map(message => toIsoString(message.timestamp)).find(Boolean)
            ?? null
        const lastTimestamp = toIsoString(data.lastUpdated)
            ?? [...data.messages].reverse().map(message => toIsoString(message.timestamp)).find(Boolean)
            ?? null
        const projectRoot = getGeminiProjectRoot(filePath)
        const project = getProjectName(projectRoot, '') || getGeminiProjectKeyFromPath(filePath)
        const repository = getRepositoryNameFromProjectRoot(projectRoot) || `local/${project}`
        const sessionId = data.sessionId?.trim() || basename(filePath, '.json')
        const fragment = createSessionFragment({
            project,
            repository,
            sessionId,
            startedAt,
            threadName: getGeminiThreadName(data, project),
        })
        fragment.durationEndAt = lastTimestamp ?? ''

        for (let index = 0; index < data.messages.length; index += 1) {
            const message = data.messages[index]!
            const timestamp = toIsoString(message.timestamp)
            const model = message.model?.trim() || (message.tokens ? GEMINI_FALLBACK_MODEL : null)
            const usage = message.tokens && model
                ? getGeminiInteractionUsage(message.tokens, model, resolvePricing)
                : null

            addFragmentInteraction(fragment, {
                content: extractGeminiMessageText(message.content),
                costUSD: usage?.costUSD ?? 0,
                index,
                model,
                role: getGeminiRole(message),
                timestamp,
                type: message.type ?? 'message',
                usage,
            })
        }

        return [fragment]
    },
    watchPatterns(config) {
        return [
            join(config.geminiPath, 'tmp', '*', 'chats', 'session-*.json'),
            join(config.geminiPath, 'tmp', '*', 'chats', 'sessions-*.json'),
        ]
    },
} satisfies UsagePlatformAdapter

function getGeminiInteractionUsage(
    tokens: GeminiTokenSnapshot,
    model: string,
    resolvePricing: ModelPricingResolver,
) {
    const baseUsage = convertGeminiTokenUsage(tokens)
    const extraTotalTokens = normalizeNumber(tokens.thoughts)
    const usage = {
        ...baseUsage,
        inputTokens: baseUsage.inputTokens + normalizeNumber(tokens.tool),
        reasoningOutputTokens: 0,
    }

    if (isZeroUsage(usage)) {
        return null
    }

    const costUSD = calculateUsageCostUSD({
        cachedInputTokens: usage.cachedInputTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
    }, resolvePricing(model))

    return {
        ...usage,
        costUSD,
        extraTotalTokens,
    }
}

function getGeminiRole(message: GeminiSessionFile['messages'][number]) {
    if (message.type === 'gemini') {
        return 'assistant'
    }

    return normalizeRole(message.type ?? '')
}

function isGeminiSessionFile(value: unknown): value is GeminiSessionFile {
    if (!value || typeof value !== 'object') {
        return false
    }

    return Array.isArray((value as Record<string, unknown>).messages)
}

function getGeminiThreadName(data: GeminiSessionFile, project: string) {
    const firstUserMessage = data.messages
        .filter(message => message.type === 'user')
        .map(message => extractGeminiMessageText(message.content))
        .find(Boolean)
    const summary = data.summary?.trim()
    const name = firstUserMessage || summary

    if (!name) {
        return `Session for ${project}`
    }

    return name.length > 96 ? `${name.slice(0, 93)}...` : name
}
