import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import type { GeminiSessionFile, GeminiTokenSnapshot } from '#shared/types/platform'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
    GEMINI_FALLBACK_MODEL,
    GEMINI_FALLBACK_PRICING_TABLE,
    GEMINI_MODEL_ALIASES,
} from '#shared/platform/constant'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
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
    parseFile(filePath) {
        const data = parseJsonFile<GeminiSessionFile>(filePath)

        if (!data || !Array.isArray(data.messages)) {
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
                ? getGeminiInteractionUsage(message.tokens)
                : null

            addFragmentInteraction(fragment, {
                costUSD: usage?.costUSD ?? 0,
                index,
                model,
                role: message.type === 'gemini' ? 'assistant' : normalizeRole(message.type ?? ''),
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
) {
    const baseUsage = convertGeminiTokenUsage(tokens)
    const extraTotalTokens = tokens.thoughts ?? 0
    const usage = {
        ...baseUsage,
        inputTokens: baseUsage.inputTokens + (tokens.tool ?? 0),
        reasoningOutputTokens: 0,
    }

    if (isZeroUsage(usage)) {
        return null
    }

    return {
        ...usage,
        costUSD: 0,
        extraTotalTokens,
    }
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
