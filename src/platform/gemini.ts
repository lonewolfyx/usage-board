import type {
    LoadUsageResult,
} from '#shared/types/usage-dashboard'
import type {
    GeminiSessionFile,
    GeminiSessionFileData,
    GeminiSessionMessage,
    GeminiTokenSnapshot,
    GeminiTokenUsageEvent,
    IConfig,
    ModelPricing,
    SessionUsageSummary,
    TokenUsageDelta,
    UsageSessionMeta,
} from '~~/src/types'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, sep } from 'node:path'
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
    parseJsonFile,
    roundCurrency,
    toIsoString,
    toUsageSessionUsageItem,
    uniqueItems,
} from '~~/src/platform/utils'

/** Default model used when a Gemini session message does not include a model field. */
const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash'

/** Maps Gemini-specific model names to pricing table names. */
const GEMINI_MODEL_ALIASES: Record<string, string> = {
    'gemini-3-flash-preview': 'gemini-3-flash',
}

/** Gemini fallback prices for primary models when LiteLLM data is missing or unavailable. */
const GEMINI_FALLBACK_PRICING_TABLE: Record<string, ModelPricing> = {
    'gemini-2.5-flash': {
        cachedInputCostPerMTokens: 0.075,
        cacheCreationInputCostPerMTokens: 0.3,
        inputCostPerMTokens: 0.3,
        outputCostPerMTokens: 2.5,
    },
    'gemini-2.5-flash-lite': {
        cachedInputCostPerMTokens: 0.025,
        cacheCreationInputCostPerMTokens: 0.1,
        inputCostPerMTokens: 0.1,
        outputCostPerMTokens: 0.4,
    },
    'gemini-2.5-pro': {
        cachedInputCostPerMTokens: 0.31,
        cachedInputCostPerMTokensAbove200K: 0.625,
        cacheCreationInputCostPerMTokens: 1.25,
        cacheCreationInputCostPerMTokensAbove200K: 2.5,
        inputCostPerMTokens: 1.25,
        inputCostPerMTokensAbove200K: 2.5,
        outputCostPerMTokens: 10,
        outputCostPerMTokensAbove200K: 15,
    },
    'gemini-3-flash': {
        cachedInputCostPerMTokens: 0.05,
        cacheCreationInputCostPerMTokens: 0.5,
        inputCostPerMTokens: 0.5,
        outputCostPerMTokens: 3,
    },
    'gemini-3-flash-preview': {
        cachedInputCostPerMTokens: 0.05,
        cacheCreationInputCostPerMTokens: 0.5,
        inputCostPerMTokens: 0.5,
        outputCostPerMTokens: 3,
    },
}

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
    const sessionUsage = sessionSummaries.map(session => toUsageSessionUsageItem(session))

    const dailyGroups = buildDailyUsageGroups(events)
    const todayDateKey = getDateKey(new Date())
    const todayDailyGroup = dailyGroups.get(todayDateKey)
    const todayDailyGroups = todayDailyGroup
        ? new Map([[todayDateKey, todayDailyGroup]])
        : new Map()
    const dailyTokenUsage = buildDailyTokenUsage(dailyGroups)
    const dailyRows = buildDailyRows(todayDailyGroups)
    const weeklyRows = buildPeriodRows(events, 'week')
    const monthlyRows = buildPeriodRows(events, 'month')
    const sessionRows = buildSessionRows(sessionSummaries)

    const monthlyModelUsage = buildMonthlyModelUsage(events)
    const projectUsage = buildProjectUsage(sessionUsage)
    const todayEvents = events.filter(event => getDateKey(new Date(event.timestamp)) === todayDateKey)
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
    const projectRoot = getProjectRoot(filePath)
    const project = getProjectName(projectRoot, '') || getProjectKeyFromPath(filePath)
    const repository = getRepositoryName(projectRoot) || `local/${project}`
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
        const usage = convertToDisplayUsage(message.tokens)

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
 * Converts a Gemini token snapshot into the dashboard's normalized token fields.
 *
 * @example
 * ```ts
 * const usage = convertToDisplayUsage({ input: 100, cached: 20, output: 10 })
 * ```
 */
function convertToDisplayUsage(tokens: GeminiTokenSnapshot): TokenUsageDelta {
    const rawInputTokens = normalizeNumber(tokens.input)
    const cachedInputTokens = Math.min(normalizeNumber(tokens.cached), rawInputTokens)
    const outputTokens = normalizeNumber(tokens.output)
    const reasoningOutputTokens = normalizeNumber(tokens.thoughts)
    const toolTokens = normalizeNumber(tokens.tool)
    const totalTokens = normalizeNumber(tokens.total)

    return {
        cachedInputTokens,
        inputTokens: Math.max(rawInputTokens - cachedInputTokens, 0),
        outputTokens,
        reasoningOutputTokens,
        totalTokens: totalTokens > 0
            ? totalTokens
            : rawInputTokens + outputTokens + reasoningOutputTokens + toolTokens,
    }
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
 * Generates possible LiteLLM pricing lookup names for a Gemini model.
 *
 * @example
 * ```ts
 * getGeminiLookupCandidates('google/gemini-2.5-pro')
 * ```
 */
function getGeminiLookupCandidates(model: string) {
    const normalizedModel = model.trim()

    return [
        normalizedModel,
        normalizedModel.replace(/^gemini\//u, ''),
        normalizedModel.replace(/^google\//u, ''),
        `gemini/${normalizedModel}`,
        `google/${normalizedModel}`,
    ]
}

/**
 * Reads the real project root from the .project_root file beside the Gemini cache directory.
 *
 * @example
 * ```ts
 * const projectRoot = getProjectRoot('/home/me/.gemini/tmp/hash/chats/session-1.json')
 * ```
 */
function getProjectRoot(filePath: string) {
    const projectDir = dirname(dirname(filePath))
    const projectRootFile = `${projectDir}/.project_root`

    if (!existsSync(projectRootFile)) {
        return ''
    }

    try {
        return readFileSync(projectRootFile, 'utf8').trim()
    }
    catch {
        return ''
    }
}

/**
 * Extracts the cached project key from a Gemini tmp path as a project-name fallback.
 *
 * @example
 * ```ts
 * getProjectKeyFromPath('/home/me/.gemini/tmp/project-key/chats/session-1.json')
 * // 'project-key'
 * ```
 */
function getProjectKeyFromPath(filePath: string) {
    const normalizedPath = filePath.replace(/[/\\]/g, sep)
    const segments = normalizedPath.split(sep)
    const tmpIndex = segments.findIndex(segment => segment === 'tmp')

    if (tmpIndex === -1 || tmpIndex + 1 >= segments.length) {
        return 'unknown'
    }

    return segments[tmpIndex + 1]?.trim() || 'unknown'
}

/**
 * Reads and normalizes the origin repository name from the project root's Git config.
 *
 * @example
 * ```ts
 * const repository = getRepositoryName('/Users/me/work/usage-board')
 * ```
 */
function getRepositoryName(projectRoot: string) {
    if (!projectRoot) {
        return ''
    }

    const gitConfigPath = `${projectRoot}/.git/config`

    if (!existsSync(gitConfigPath)) {
        return ''
    }

    try {
        const config = readFileSync(gitConfigPath, 'utf8')

        return normalizeRepositoryUrl(getOriginUrlFromGitConfig(config))
    }
    catch {
        return ''
    }
}

/**
 * Extracts the remote origin URL from .git/config text.
 *
 * @example
 * ```ts
 * getOriginUrlFromGitConfig('[remote "origin"]\n    url = git@github.com:lonewolfyx/usage-board.git')
 * ```
 */
function getOriginUrlFromGitConfig(config: string) {
    let isOriginBlock = false

    for (const rawLine of config.split('\n')) {
        const line = rawLine.trim()

        if (line.startsWith('[')) {
            isOriginBlock = line === '[remote "origin"]'
            continue
        }

        if (!isOriginBlock || !line.startsWith('url =')) {
            continue
        }

        return line.slice('url ='.length).trim()
    }

    return ''
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
        .map(message => extractMessageText(message.content))
        .find(Boolean) ?? ''
}

/**
 * Converts Gemini message content into plain text.
 *
 * @example
 * ```ts
 * extractMessageText([{ text: 'hello' }, { text: 'world' }])
 * // 'hello\nworld'
 * ```
 */
function extractMessageText(content: GeminiSessionMessage['content']) {
    if (typeof content === 'string') {
        return content
    }

    if (!Array.isArray(content)) {
        return ''
    }

    return content
        .map(item => item.text?.trim())
        .filter(Boolean)
        .join('\n')
}
