import type { IConfig } from '#shared/types/config'
import type {
    GeminiSessionFile,
    GeminiSessionFileData,
    GeminiSessionMessage,
    GeminiTokenUsageEvent,
    ModelPricing,
    SessionUsageSummary,
    TokenUsageDelta,
    UsageSessionMeta,
} from '#shared/types/platform'
import type { LoadUsageResult } from '#shared/types/usage-dashboard'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { GEMINI_FALLBACK_MODEL, GEMINI_FALLBACK_PRICING_TABLE, GEMINI_MODEL_ALIASES } from '#shared/platform/constant'
import { calculateUsageCostUSD, createLiteLLMPricingResolver } from '#shared/platform/pricing'
import {
    addUsage,
    buildLoadUsageResult,
    convertGeminiTokenUsage,
    createEmptyUsage,
    extractGeminiMessageText,
    getDurationMinutes,
    getGeminiLookupCandidates,
    getGeminiProjectKeyFromPath,
    getGeminiProjectRoot,
    getProjectName,
    getRepositoryNameFromProjectRoot,
    getThreadName,
    isZeroUsage,
    parseJsonFile,
    toIsoString,
} from '#shared/utils/platform'
import { normalizeNumber, roundCurrency, uniqueItems } from '#shared/utils/usage-dashboard'
import { glob } from 'glob'

/**
 * Loads local Gemini CLI session cache data and converts it into dashboard usage data.
 *
 * @example
 * ```ts
 * const usage = await loadGeminiUsage(config)
 * console.log(usage.sessionUsage.length)
 * ```
 */
export async function loadGeminiUsage(config: IConfig): Promise<LoadUsageResult> {
    const resolvePricing = await createLiteLLMPricingResolver({
        aliases: GEMINI_MODEL_ALIASES,
        fallbackModel: GEMINI_FALLBACK_MODEL,
        fallbackPricingTable: GEMINI_FALLBACK_PRICING_TABLE,
        getLookupCandidates: getGeminiLookupCandidates,
    })
    const sessionFiles = await loadGeminiSessionFiles(config, resolvePricing)
    const events = sessionFiles
        .flatMap(item => item.events)
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))

    const sessionSummaries = buildSessionSummaries(sessionFiles)
        .sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity))

    return buildLoadUsageResult(events, sessionSummaries)
}

/**
 * Finds Gemini session JSON files under the tmp directory and parses them into session data.
 *
 * @example
 * ```ts
 * const sessions = await loadGeminiSessionFiles(config, resolvePricing)
 * ```
 */
async function loadGeminiSessionFiles(config: IConfig, resolvePricing: (model: string) => ModelPricing) {
    const tmpDir = `${config.geminiPath}/tmp`

    if (!existsSync(tmpDir)) {
        return []
    }

    const fileGroups = await Promise.all([
        glob(`${tmpDir}/*/chats/session-*.json`, { absolute: true }),
        glob(`${tmpDir}/*/chats/sessions-*.json`, { absolute: true }),
    ])
    const files = uniqueItems(fileGroups.flat()).sort((a, b) => a.localeCompare(b))

    return files
        .map(filePath => loadGeminiSessionFile(filePath, resolvePricing))
        .filter((item): item is GeminiSessionFileData => item !== null)
}

/**
 * Parses a single Gemini session file and extracts metadata plus token usage events.
 *
 * @example
 * ```ts
 * const session = loadGeminiSessionFile('/tmp/session-1.json', resolvePricing)
 * ```
 */
function loadGeminiSessionFile(filePath: string, resolvePricing: (model: string) => ModelPricing): GeminiSessionFileData | null {
    const data = parseJsonFile(filePath)

    if (!isGeminiSessionFile(data)) {
        return null
    }

    const startedAt = toIsoString(data.startTime)
        ?? data.messages.map(message => toIsoString(message.timestamp)).find(Boolean)

    if (!startedAt) {
        return null
    }

    const lastTimestamp = toIsoString(data.lastUpdated)
        ?? [...data.messages].reverse().map(message => toIsoString(message.timestamp)).find(Boolean)
    const projectRoot = getGeminiProjectRoot(filePath)
    const project = getProjectName(projectRoot, '') || getGeminiProjectKeyFromPath(filePath)
    const repository = getRepositoryNameFromProjectRoot(projectRoot) || `local/${project}`
    const sessionId = data.sessionId?.trim() || basename(filePath, '.json')

    const meta: UsageSessionMeta = {
        durationMinutes: getDurationMinutes(startedAt, lastTimestamp),
        project,
        repository,
        sessionId,
        startedAt,
        threadName: getThreadName(getFirstUserMessage(data), project, data.summary),
    }
    const events = extractTokenUsageEvents(data.messages, meta, resolvePricing)

    if (events.length === 0) {
        return null
    }

    return {
        events,
        meta,
    }
}

/**
 * Checks whether an unknown value matches the minimal Gemini session file shape.
 *
 * @example
 * ```ts
 * if (isGeminiSessionFile(data)) {
 *     console.log(data.messages.length)
 * }
 * ```
 */
function isGeminiSessionFile(value: unknown): value is GeminiSessionFile {
    if (!value || typeof value !== 'object') {
        return false
    }

    const record = value as Record<string, unknown>

    return Array.isArray(record.messages)
}

/**
 * Extracts model invocation events from Gemini messages and calculates cost for each event.
 *
 * @example
 * ```ts
 * const events = extractTokenUsageEvents(messages, meta, resolvePricing)
 * ```
 */
function extractTokenUsageEvents(
    messages: GeminiSessionMessage[],
    meta: UsageSessionMeta,
    resolvePricing: (model: string) => ModelPricing,
) {
    const events: GeminiTokenUsageEvent[] = []

    for (const message of messages) {
        if (message.type !== 'gemini' || !message.tokens) {
            continue
        }

        const timestamp = toIsoString(message.timestamp)

        if (!timestamp) {
            continue
        }

        const model = message.model?.trim() || GEMINI_FALLBACK_MODEL
        const isFallbackModel = !message.model?.trim()
        const usage = convertGeminiTokenUsage(message.tokens)

        if (isZeroUsage(usage)) {
            continue
        }

        const toolTokens = normalizeNumber(message.tokens.tool)
        const costUSD = calculateUsageCostUSD({
            cachedInputTokens: usage.cachedInputTokens,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens + usage.reasoningOutputTokens + toolTokens,
        }, resolvePricing(model))

        events.push({
            ...usage,
            costUSD,
            isFallbackModel,
            model,
            project: meta.project,
            repository: meta.repository,
            sessionId: meta.sessionId,
            timestamp,
            toolTokens,
        })
    }

    return events
}

/**
 * Aggregates Gemini session files into session-level summaries.
 *
 * @example
 * ```ts
 * const summaries = buildSessionSummaries(sessionFiles)
 * ```
 */
function buildSessionSummaries(sessionFiles: GeminiSessionFileData[]) {
    const summaries: SessionUsageSummary[] = []

    for (const sessionFile of sessionFiles) {
        const usageByModel = new Map<string, TokenUsageDelta>()
        let inputTokens = 0
        let cachedInputTokens = 0
        let outputTokens = 0
        let reasoningOutputTokens = 0
        let totalTokens = 0
        let costUSD = 0
        let lastActivity = sessionFile.meta.startedAt

        for (const event of sessionFile.events) {
            inputTokens += event.inputTokens
            cachedInputTokens += event.cachedInputTokens
            outputTokens += event.outputTokens
            reasoningOutputTokens += event.reasoningOutputTokens
            totalTokens += event.totalTokens
            costUSD += event.costUSD

            if (event.timestamp > lastActivity) {
                lastActivity = event.timestamp
            }

            const modelUsage = usageByModel.get(event.model) ?? createEmptyUsage()
            addUsage(modelUsage, event)
            usageByModel.set(event.model, modelUsage)
        }

        const models = Array.from(usageByModel.keys()).sort((a, b) => a.localeCompare(b))
        const topModel = Array.from(usageByModel.entries())
            .sort((a, b) => b[1].totalTokens - a[1].totalTokens || a[0].localeCompare(b[0]))[0]?.[0] ?? GEMINI_FALLBACK_MODEL

        summaries.push({
            cachedInputTokens,
            costUSD: roundCurrency(costUSD),
            durationMinutes: sessionFile.meta.durationMinutes,
            inputTokens,
            lastActivity,
            models,
            outputTokens,
            project: sessionFile.meta.project,
            reasoningOutputTokens,
            repository: sessionFile.meta.repository,
            sessionId: sessionFile.meta.sessionId,
            startedAt: sessionFile.meta.startedAt,
            threadName: sessionFile.meta.threadName,
            tokenTotal: totalTokens,
            topModel,
        })
    }

    return summaries
}

/**
 * Gets the first user message in a Gemini session for thread-name generation.
 *
 * @example
 * ```ts
 * const firstMessage = getFirstUserMessage(sessionFile)
 * ```
 */
function getFirstUserMessage(data: GeminiSessionFile) {
    return data.messages
        ?.filter(message => message.type === 'user')
        .map(message => extractGeminiMessageText(message.content))
        .find(Boolean) ?? ''
}
