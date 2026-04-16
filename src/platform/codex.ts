import type {
    LoadUsageResult,
} from '#shared/types/usage-dashboard'
import type {
    CodexSessionFileData,
    CodexSessionIndexLine,
    CodexTokenUsageEvent,
    IConfig,
    ModelPricingResolver,
    RawUsage,
    SessionLogLine,
    SessionUsageSummary,
    TokenUsageDelta,
    TokenUsageSnapshot,
    UsageSessionMeta,
} from '~~/src/types'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { glob } from 'glob'
import { calculateUsageCostUSD, createLiteLLMPricingResolver } from '~~/src/platform/pricing'
import {
    addUsage,
    buildDailyRows,
    buildDailyTokenUsage,
    buildDailyUsageGroups,
    buildMonthlyModelUsage,
    buildOverviewCards,
    buildPeriodRows,
    buildProjectUsage,
    buildSessionRows,
    createEmptyUsage,
    getDateKey,
    getDurationMinutes,
    getProjectName,
    getThreadName,
    getTopModelForDate,
    getTopProjectForDate,
    isZeroUsage,
    normalizeNumber,
    normalizeRepositoryUrl,
    parseJsonlFile,
    roundCurrency,
    toIsoString,
    toUsageSessionUsageItem,
} from '~~/src/platform/utils'

/** Display and pricing fallback model used when Codex logs do not include a model field. */
const LEGACY_FALLBACK_MODEL = 'gpt-5'

/** Maps Codex-specific model names to LiteLLM or local pricing table names. */
const CODEX_MODEL_ALIASES: Record<string, string> = {
    'gpt-5-codex': 'gpt-5',
    'gpt-5.3-codex': 'gpt-5.2-codex',
}

/**
 * Loads local Codex session logs and converts them into dashboard usage data.
 *
 * @example
 * ```ts
 * const usage = await loadCodexUsage(config)
 * console.log(usage.todayTotalTokens)
 * ```
 */
export async function loadCodexUsage(config: IConfig): Promise<LoadUsageResult> {
    const resolvePricing = await createLiteLLMPricingResolver({
        aliases: CODEX_MODEL_ALIASES,
        fallbackModel: LEGACY_FALLBACK_MODEL,
        isZeroCostModel: isOpenRouterFreeModel,
    })
    const sessionFiles = await loadSessionFiles(config)
    const tokenEvents = sessionFiles
        .flatMap(item => item.events)
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))

    const sessionSummaries = buildSessionSummaries(sessionFiles, resolvePricing)
        .sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity))
    const sessionUsage = sessionSummaries.map(session => toUsageSessionUsageItem(session))
    const getEventCostUSD = (event: CodexTokenUsageEvent) => calculateUsageCost(event.model, event, resolvePricing)
    const aggregateOptions = { getCostUSD: getEventCostUSD }
    const dailyGroups = buildDailyUsageGroups(tokenEvents, aggregateOptions)
    const dailyTokenUsage = buildDailyTokenUsage(dailyGroups)
    const dailyRows = buildDailyRows(dailyGroups)
    const weeklyRows = buildPeriodRows(tokenEvents, 'week', aggregateOptions)
    const monthlyRows = buildPeriodRows(tokenEvents, 'month', aggregateOptions)
    const sessionRows = buildSessionRows(sessionSummaries)

    const monthlyModelUsage = buildMonthlyModelUsage(tokenEvents)
    const projectUsage = buildProjectUsage(sessionUsage)
    const todayDateKey = getDateKey(new Date())
    const todayEvents = tokenEvents.filter(event => getDateKey(new Date(event.timestamp)) === todayDateKey)
    const todayDailyGroup = dailyGroups.get(todayDateKey)
    const todayTotalTokens = todayDailyGroup?.totalTokens ?? 0
    const todayTotalCost = roundCurrency(todayDailyGroup?.costUSD ?? 0)
    const todayTopProject = getTopProjectForDate(todayEvents)
    const todayTopModel = getTopModelForDate(todayEvents)
    const overviewCards = buildOverviewCards({
        cachedInputTokens: todayDailyGroup?.cachedInputTokens ?? 0,
        sessionCount: new Set(todayEvents.map(event => event.sessionId)).size,
        todayTopModel,
        todayTopProject,
        todayTotalCost,
        todayTotalTokens,
    })

    return {
        dailyRows,
        dailyTokenUsage,
        monthlyModelUsage,
        monthlyRows,
        overviewCards,
        projectUsage,
        sessionRows,
        sessionUsage,
        todayTopModel,
        todayTopProject,
        todayTotalCost,
        todayTotalTokens,
        weeklyRows,
    }
}

/**
 * Finds and parses all JSONL session files under the Codex sessions directory.
 *
 * @example
 * ```ts
 * const files = await loadSessionFiles(config)
 * ```
 */
async function loadSessionFiles(config: IConfig) {
    const sessionsDir = join(config.codexPath, 'sessions')

    if (!existsSync(sessionsDir)) {
        return []
    }

    const sessionIndex = loadSessionIndex(config.codexPath)
    const files = await glob(`**/*.jsonl`, {
        cwd: sessionsDir,
        absolute: true,
    })

    return files
        .map(filePath => loadSessionFile(filePath, sessionIndex))
        .filter((item): item is CodexSessionFileData => item !== null)
}

/**
 * Reads Codex session_index.jsonl and maps session IDs to thread names.
 *
 * @example
 * ```ts
 * const names = loadSessionIndex('/Users/me/.codex')
 * ```
 */
function loadSessionIndex(codexPath: string) {
    const indexPath = join(codexPath, 'session_index.jsonl')
    const threadNames = new Map<string, string>()

    if (!existsSync(indexPath)) {
        return threadNames
    }

    const lines = parseJsonlFile<CodexSessionIndexLine>(indexPath)

    for (const line of lines) {
        const id = typeof line.id === 'string' ? line.id.trim() : ''
        const threadName = typeof line.thread_name === 'string' ? line.thread_name.trim() : ''

        if (id && threadName) {
            threadNames.set(id, threadName)
        }
    }

    return threadNames
}

/**
 * Parses a single Codex session file and extracts session metadata plus token usage events.
 *
 * @example
 * ```ts
 * const session = loadSessionFile('/tmp/session.jsonl', new Map())
 * ```
 */
function loadSessionFile(filePath: string, sessionIndex: Map<string, string>): CodexSessionFileData | null {
    const lines = parseJsonlFile<SessionLogLine>(filePath)

    if (lines.length === 0) {
        return null
    }

    const sessionMeta = lines.find(line => line.type === 'session_meta')?.payload
    const startedAt = toIsoString(sessionMeta?.timestamp) ?? toIsoString(lines[0]?.timestamp)

    if (!startedAt) {
        return null
    }

    const lastTimestamp = [...lines]
        .reverse()
        .map(line => toIsoString(line.timestamp))
        .find(Boolean)
    const userMessage = lines.find(line => line.type === 'event_msg' && line.payload?.type === 'user_message')
        ?.payload
        ?.message
    const sessionId = getSessionId(filePath, typeof sessionMeta?.id === 'string' ? sessionMeta.id : undefined)
    const project = getProjectName(typeof sessionMeta?.cwd === 'string' ? sessionMeta.cwd : undefined)
    const repository = normalizeRepositoryUrl(sessionMeta?.git?.repository_url) || `local/${project}`

    const meta: UsageSessionMeta = {
        sessionId,
        threadName: sessionIndex.get(sessionId)
            ?? getThreadName(typeof userMessage === 'string' ? userMessage : '', project),
        project,
        repository,
        startedAt,
        durationMinutes: getDurationMinutes(startedAt, lastTimestamp),
    }
    const events = extractTokenUsageEvents(lines, meta)

    if (events.length === 0) {
        return null
    }

    return {
        events,
        meta,
    }
}

/**
 * Prefers the session ID stored in the log and falls back to the file name when missing.
 *
 * @example
 * ```ts
 * getSessionId('/tmp/abc.jsonl', undefined)
 * // 'abc'
 * ```
 */
function getSessionId(filePath: string, sessionMetaId: string | undefined) {
    const normalizedSessionMetaId = sessionMetaId?.trim()

    return normalizedSessionMetaId || basename(filePath, '.jsonl')
}

/**
 * Extracts valid token_count events from Codex log lines and fills in model, project, and repository fields.
 *
 * @example
 * ```ts
 * const events = extractTokenUsageEvents(lines, meta)
 * ```
 */
function extractTokenUsageEvents(lines: SessionLogLine[], meta: UsageSessionMeta) {
    const events: CodexTokenUsageEvent[] = []
    // Codex sometimes only reports total_token_usage, so keep the previous total to calculate deltas.
    let previousTotals: RawUsage | null = null
    // token_count events can omit model fields; the latest turn_context model is used as context.
    let currentModel: string | undefined
    let currentModelIsFallback = false

    for (const line of lines) {
        if (line.type === 'turn_context') {
            const contextModel = extractModel(line.payload)

            if (contextModel) {
                currentModel = contextModel
                currentModelIsFallback = false
            }

            continue
        }

        if (line.type !== 'event_msg' || line.payload?.type !== 'token_count') {
            continue
        }

        const timestamp = toIsoString(line.timestamp)

        if (!timestamp) {
            continue
        }

        const info = line.payload?.info
        const lastUsage = normalizeRawUsage(info?.last_token_usage)
        const totalUsage = normalizeRawUsage(info?.total_token_usage)
        const rawUsage = lastUsage ?? (totalUsage ? subtractRawUsage(totalUsage, previousTotals) : null)

        if (totalUsage) {
            previousTotals = totalUsage
        }

        if (!rawUsage) {
            continue
        }

        const delta = convertToDisplayDelta(rawUsage)

        if (isZeroUsage(delta)) {
            continue
        }

        const extractedModel = extractModel({
            ...(line.payload ?? {}),
            info: info ?? undefined,
        })

        if (extractedModel) {
            currentModel = extractedModel
            currentModelIsFallback = false
        }

        let model = extractedModel ?? currentModel
        let isFallbackModel = false

        if (!model) {
            model = LEGACY_FALLBACK_MODEL
            isFallbackModel = true
            currentModel = model
            currentModelIsFallback = true
        }
        else if (!extractedModel && currentModelIsFallback) {
            isFallbackModel = true
        }

        events.push({
            ...delta,
            isFallbackModel,
            model,
            project: meta.project,
            repository: meta.repository,
            sessionId: meta.sessionId,
            timestamp,
        })
    }

    return events
}

/**
 * Normalizes a raw Codex token snapshot into a complete RawUsage shape.
 *
 * @example
 * ```ts
 * const rawUsage = normalizeRawUsage({ input_tokens: 100, output_tokens: 20 })
 * ```
 */
function normalizeRawUsage(usage: TokenUsageSnapshot | null | undefined): RawUsage | null {
    if (!usage) {
        return null
    }

    const input = normalizeNumber(usage.input_tokens)
    const cachedInput = normalizeNumber(usage.cached_input_tokens ?? usage.cache_read_input_tokens)
    const output = normalizeNumber(usage.output_tokens)
    const reasoning = normalizeNumber(usage.reasoning_output_tokens)
    const total = normalizeNumber(usage.total_tokens)

    return {
        input_tokens: input,
        cached_input_tokens: cachedInput,
        output_tokens: output,
        reasoning_output_tokens: reasoning,
        total_tokens: total > 0 ? total : input + output,
    }
}

/**
 * Subtracts the previous cumulative usage from the current cumulative usage to produce a delta.
 *
 * @example
 * ```ts
 * subtractRawUsage(currentUsage, previousUsage)
 * ```
 */
function subtractRawUsage(current: RawUsage, previous: RawUsage | null): RawUsage {
    return {
        input_tokens: Math.max(current.input_tokens - (previous?.input_tokens ?? 0), 0),
        cached_input_tokens: Math.max(current.cached_input_tokens - (previous?.cached_input_tokens ?? 0), 0),
        output_tokens: Math.max(current.output_tokens - (previous?.output_tokens ?? 0), 0),
        reasoning_output_tokens: Math.max(current.reasoning_output_tokens - (previous?.reasoning_output_tokens ?? 0), 0),
        total_tokens: Math.max(current.total_tokens - (previous?.total_tokens ?? 0), 0),
    }
}

/**
 * Converts a raw Codex delta into the dashboard's normalized token fields.
 *
 * @example
 * ```ts
 * const delta = convertToDisplayDelta(rawUsage)
 * ```
 */
function convertToDisplayDelta(rawUsage: RawUsage): TokenUsageDelta {
    const cachedInputTokens = Math.min(rawUsage.cached_input_tokens, rawUsage.input_tokens)
    const inputTokens = Math.max(rawUsage.input_tokens - cachedInputTokens, 0)
    const outputTokens = Math.max(rawUsage.output_tokens, 0)

    return {
        cachedInputTokens,
        inputTokens,
        outputTokens,
        reasoningOutputTokens: Math.max(rawUsage.reasoning_output_tokens, 0),
        totalTokens: rawUsage.total_tokens > 0 ? rawUsage.total_tokens : inputTokens + outputTokens,
    }
}

/**
 * Extracts a model name from several possible payload locations.
 *
 * @example
 * ```ts
 * extractModel({ info: { model: 'gpt-5-codex' } })
 * // 'gpt-5-codex'
 * ```
 */
function extractModel(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') {
        return undefined
    }

    const record = value as Record<string, unknown>
    const directCandidates = [
        record.model,
        record.model_name,
        (record.info as Record<string, unknown> | null | undefined)?.model,
        (record.info as Record<string, unknown> | null | undefined)?.model_name,
        ((record.info as Record<string, unknown> | null | undefined)?.metadata as Record<string, unknown> | null | undefined)?.model,
        (record.metadata as Record<string, unknown> | null | undefined)?.model,
    ]

    for (const candidate of directCandidates) {
        if (typeof candidate === 'string' && candidate.trim() !== '') {
            return candidate.trim()
        }
    }

    return undefined
}

/**
 * Aggregates Codex session files into session-level summaries and totals cost by model.
 *
 * @example
 * ```ts
 * const summaries = buildSessionSummaries(sessionFiles, resolvePricing)
 * ```
 */
function buildSessionSummaries(sessionFiles: CodexSessionFileData[], resolvePricing: ModelPricingResolver) {
    const summaries: SessionUsageSummary[] = []

    for (const sessionFile of sessionFiles) {
        const usageByModel = new Map<string, TokenUsageDelta>()
        let inputTokens = 0
        let cachedInputTokens = 0
        let outputTokens = 0
        let reasoningOutputTokens = 0
        let totalTokens = 0
        let lastActivity = sessionFile.meta.startedAt

        for (const event of sessionFile.events) {
            inputTokens += event.inputTokens
            cachedInputTokens += event.cachedInputTokens
            outputTokens += event.outputTokens
            reasoningOutputTokens += event.reasoningOutputTokens
            totalTokens += event.totalTokens

            if (event.timestamp > lastActivity) {
                lastActivity = event.timestamp
            }

            const modelUsage = usageByModel.get(event.model) ?? createEmptyUsage()
            addUsage(modelUsage, event)
            usageByModel.set(event.model, modelUsage)
        }

        let costUSD = 0

        for (const [model, usage] of usageByModel) {
            costUSD += calculateUsageCost(model, usage, resolvePricing)
        }

        const models = Array.from(usageByModel.keys()).sort((a, b) => a.localeCompare(b))
        const topModel = Array.from(usageByModel.entries())
            .sort((a, b) => b[1].totalTokens - a[1].totalTokens || a[0].localeCompare(b[0]))[0]?.[0] ?? LEGACY_FALLBACK_MODEL

        summaries.push({
            sessionId: sessionFile.meta.sessionId,
            threadName: sessionFile.meta.threadName,
            project: sessionFile.meta.project,
            repository: sessionFile.meta.repository,
            startedAt: sessionFile.meta.startedAt,
            durationMinutes: sessionFile.meta.durationMinutes,
            inputTokens,
            cachedInputTokens,
            outputTokens,
            reasoningOutputTokens,
            tokenTotal: totalTokens,
            costUSD: roundCurrency(costUSD),
            lastActivity,
            models,
            topModel,
        })
    }

    return summaries
}

/**
 * Resolves model pricing and calculates the USD cost for a Codex usage slice.
 *
 * @example
 * ```ts
 * const costUSD = calculateUsageCost('gpt-5', usage, resolvePricing)
 * ```
 */
function calculateUsageCost(model: string, usage: TokenUsageDelta, resolvePricing: ModelPricingResolver) {
    return calculateUsageCostUSD(usage, resolvePricing(model))
}

/**
 * Checks whether an OpenRouter model name represents a free model.
 *
 * @example
 * ```ts
 * isOpenRouterFreeModel('openrouter/qwen/qwen3-coder:free')
 * // true
 * ```
 */
function isOpenRouterFreeModel(model: string) {
    const normalizedModel = model.trim().toLowerCase()

    if (normalizedModel === 'openrouter/free') {
        return true
    }

    return normalizedModel.startsWith('openrouter/') && normalizedModel.endsWith(':free')
}
