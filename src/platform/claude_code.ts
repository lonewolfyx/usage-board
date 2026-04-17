import type {
    LoadUsageResult,
} from '#shared/types/usage-dashboard'
import type {
    ClaudeAggregateEvent,
    ClaudeModelUsageSummary,
    ClaudeSessionSummary,
    ClaudeTokenTotals,
    ClaudeUsageEntry,
    ClaudeUsageRecord,
    IConfig,
    ModelPricingResolver,
} from '~~/src/types'
import { existsSync } from 'node:fs'
import { basename, sep } from 'node:path'
import { glob } from 'glob'
import { calculateUsageCostUSD, createLiteLLMPricingResolver } from '~~/src/platform/pricing'
import {
    buildDailyRows,
    buildDailyTokenUsage,
    buildDailyUsageGroups,
    buildMonthlyModelUsage,
    buildOverviewCards,
    buildPeriodRows,
    buildProjectUsage,
    buildSessionRows,
    getDateKey,
    getDurationMinutes,
    getProjectName,
    getTopModelForDate,
    getTopProjectForDate,
    normalizeNumber,
    parseJsonlFile,
    roundCurrency,
    toUsageSessionUsageItem,
} from '~~/src/platform/utils'

/** Default pricing model used when a Claude Code record has no billable model. */
const CLAUDE_FALLBACK_MODEL = 'claude-sonnet-4-5'

/** Maps common Claude aliases to LiteLLM or local pricing table names. */
const CLAUDE_MODEL_ALIASES: Record<string, string> = {
    'claude-3-5-haiku-latest': 'claude-haiku-4-5',
    'claude-3-5-sonnet-latest': 'claude-sonnet-4-5',
    'claude-3-7-sonnet-latest': 'claude-sonnet-4-5',
    'claude-haiku-4.5': 'claude-haiku-4-5',
    'claude-opus-4.1': 'claude-opus-4-1',
    'claude-sonnet-4.5': 'claude-sonnet-4-5',
    'claude-4-1-opus': 'claude-opus-4-1',
    'claude-4-5-haiku': 'claude-haiku-4-5',
    'claude-4-5-sonnet': 'claude-sonnet-4-5',
}

/**
 * Loads local Claude Code project logs and converts them into dashboard usage data.
 *
 * @example
 * ```ts
 * const usage = await loadClaudeCodeUsage(config)
 * console.log(usage.todayTotalCost)
 * ```
 */
export async function loadClaudeCodeUsage(config: IConfig): Promise<LoadUsageResult> {
    const resolvePricing = await createLiteLLMPricingResolver({
        aliases: CLAUDE_MODEL_ALIASES,
        fallbackModel: CLAUDE_FALLBACK_MODEL,
        getLookupCandidates: getClaudeLookupCandidates,
    })
    const entries = await loadClaudeUsageEntries(config, resolvePricing)
    const sessionSummaries = buildClaudeSessionSummaries(entries)
        .sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity))
    const sessionOptions = {
        getCachedInputTokens: (session: ClaudeSessionSummary) => session.cacheCreationTokens + session.cacheReadTokens,
        getReasoningOutputTokens: () => 0,
    }
    const sessionUsage = sessionSummaries.map(session => toUsageSessionUsageItem(session, sessionOptions))
    const events = entries.map(toClaudeAggregateEvent)
    const aggregateOptions = {
        includeModel: (event: ClaudeAggregateEvent) => event.model !== '<synthetic>',
    }

    const dailyGroups = buildDailyUsageGroups(events, aggregateOptions)
    const todayDateKey = getDateKey(new Date())
    const todayDailyGroup = dailyGroups.get(todayDateKey)
    const todayDailyGroups = todayDailyGroup
        ? new Map([[todayDateKey, todayDailyGroup]])
        : new Map()
    const dailyTokenUsage = buildDailyTokenUsage(dailyGroups)
    const dailyRows = buildDailyRows(todayDailyGroups)
    const weeklyRows = buildPeriodRows(events, 'week', aggregateOptions)
    const monthlyRows = buildPeriodRows(events, 'month', aggregateOptions)
    const sessionRows = buildSessionRows(sessionSummaries, sessionOptions)

    const monthlyModelUsage = buildMonthlyModelUsage(events, aggregateOptions)
    const projectUsage = buildProjectUsage(sessionUsage)
    const todayEvents = events.filter(event => getDateKey(new Date(event.timestamp)) === todayDateKey)
    const todayTotalTokens = todayDailyGroup?.totalTokens ?? 0
    const todayTotalCost = roundCurrency(todayDailyGroup?.costUSD ?? 0)
    const todayTopProject = getTopProjectForDate(todayEvents)
    const todayTopModel = getTopModelForDate(todayEvents, aggregateOptions)
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
 * Loads, deduplicates, and normalizes all usage records from configured Claude Code paths.
 *
 * @example
 * ```ts
 * const entries = await loadClaudeUsageEntries(config, resolvePricing)
 * ```
 */
async function loadClaudeUsageEntries(config: IConfig, resolvePricing: ModelPricingResolver) {
    const claudePaths = getConfiguredClaudePaths(config)
    const files = await globClaudeUsageFiles(claudePaths)

    if (files.length === 0) {
        return []
    }

    const sortedFiles = sortFilesByTimestamp(files)
    const processedHashes = new Set<string>()
    const entries: ClaudeUsageEntry[] = []

    for (const filePath of sortedFiles) {
        const projectPath = extractProjectFromPath(filePath)
        const fallbackSessionId = basename(filePath, '.jsonl')
        const lines = parseJsonlFile(filePath)

        for (const line of lines) {
            if (!isClaudeUsageRecord(line)) {
                continue
            }

            const uniqueHash = createUniqueHash(line)

            if (uniqueHash != null && processedHashes.has(uniqueHash)) {
                continue
            }

            if (uniqueHash != null) {
                processedHashes.add(uniqueHash)
            }

            const usage = line.message.usage
            const rawModel = line.message.model?.trim()
            const model = getDisplayModelName(line) ?? 'unknown'
            const cacheCreationTokens = normalizeNumber(usage.cache_creation_input_tokens)
            const cacheReadTokens = normalizeNumber(usage.cache_read_input_tokens)
            const inputTokens = normalizeNumber(usage.input_tokens)
            const outputTokens = normalizeNumber(usage.output_tokens)
            const costUSD = line.costUSD ?? (rawModel
                ? calculateUsageCostUSD({
                        cacheCreationTokens,
                        cachedInputTokens: cacheReadTokens,
                        inputTokens,
                        outputTokens,
                    }, resolvePricing(rawModel), {
                        speed: usage.speed,
                    })
                : 0)

            entries.push({
                cacheCreationTokens,
                cacheReadTokens,
                costUSD,
                cwd: line.cwd,
                inputTokens,
                model,
                outputTokens,
                projectPath,
                rawModel,
                sessionId: line.sessionId?.trim() || fallbackSessionId,
                timestamp: new Date(line.timestamp).toISOString(),
            })
        }
    }

    return entries
}

/**
 * Gets the Claude Code root directories that should be scanned.
 *
 * @example
 * ```ts
 * const paths = getConfiguredClaudePaths(config)
 * ```
 */
function getConfiguredClaudePaths(config: IConfig) {
    return config.claudeCodePaths?.length ? config.claudeCodePaths : [config.claudeCodePath]
}

/**
 * Finds project JSONL log files under multiple Claude Code root directories.
 *
 * @example
 * ```ts
 * const files = await globClaudeUsageFiles(['/Users/me/.claude'])
 * ```
 */
async function globClaudeUsageFiles(claudePaths: string[]) {
    const fileGroups = await Promise.all(claudePaths.map(async (claudePath) => {
        const projectsDir = `${claudePath}/projects`

        if (!existsSync(projectsDir)) {
            return [] as string[]
        }

        return glob(`${claudePath}/projects/**/*.jsonl`, {
            absolute: true,
        }).catch(() => [])
    }))

    return fileGroups.flat()
}

/**
 * Sorts log files by their earliest timestamp to keep cross-file processing stable.
 *
 * @example
 * ```ts
 * const sortedFiles = sortFilesByTimestamp(files)
 * ```
 */
function sortFilesByTimestamp(files: string[]) {
    return files
        .map(file => ({
            file,
            timestamp: getEarliestTimestamp(file),
        }))
        .sort((a, b) => {
            if (a.timestamp == null && b.timestamp == null) {
                return 0
            }
            if (a.timestamp == null) {
                return 1
            }
            if (b.timestamp == null) {
                return -1
            }

            return a.timestamp.getTime() - b.timestamp.getTime()
        })
        .map(item => item.file)
}

/**
 * Reads the first parseable timestamp from a JSONL file.
 *
 * @example
 * ```ts
 * const earliest = getEarliestTimestamp('/tmp/session.jsonl')
 * ```
 */
function getEarliestTimestamp(filePath: string) {
    for (const line of parseJsonlFile(filePath)) {
        if (!line || typeof line !== 'object') {
            continue
        }

        const timestamp = (line as Record<string, unknown>).timestamp

        if (typeof timestamp !== 'string') {
            continue
        }

        const date = new Date(timestamp)

        if (!Number.isNaN(date.getTime())) {
            return date
        }
    }

    return null
}

/**
 * Checks whether an unknown value matches the minimal Claude Code usage record shape.
 *
 * @example
 * ```ts
 * if (isClaudeUsageRecord(line)) {
 *     console.log(line.message.usage.input_tokens)
 * }
 * ```
 */
function isClaudeUsageRecord(value: unknown): value is ClaudeUsageRecord {
    if (!value || typeof value !== 'object') {
        return false
    }

    const record = value as Record<string, unknown>
    const message = record.message

    if (typeof record.timestamp !== 'string' || !message || typeof message !== 'object') {
        return false
    }

    const usage = (message as Record<string, unknown>).usage

    if (!usage || typeof usage !== 'object') {
        return false
    }

    const usageRecord = usage as Record<string, unknown>

    return typeof usageRecord.input_tokens === 'number'
        && typeof usageRecord.output_tokens === 'number'
        && Number.isFinite(Date.parse(record.timestamp))
}

/**
 * Builds a deduplication key from the message ID and request ID.
 *
 * @example
 * ```ts
 * const hash = createUniqueHash(record)
 * ```
 */
function createUniqueHash(data: ClaudeUsageRecord) {
    const messageId = data.message.id
    const requestId = data.requestId

    if (messageId == null || requestId == null) {
        return null
    }

    return `${messageId}:${requestId}`
}

/**
 * Gets the model name used for display and aggregation, appending -fast for fast requests.
 *
 * @example
 * ```ts
 * const model = getDisplayModelName(record)
 * ```
 */
function getDisplayModelName(data: ClaudeUsageRecord) {
    const model = data.message.model?.trim()

    if (!model) {
        return undefined
    }

    return data.message.usage.speed === 'fast' ? `${model}-fast` : model
}

/**
 * Extracts the project path segment from a Claude Code project log path.
 *
 * @example
 * ```ts
 * extractProjectFromPath('/Users/me/.claude/projects/-Users-me-work-app/session.jsonl')
 * // '-Users-me-work-app'
 * ```
 */
function extractProjectFromPath(jsonlPath: string) {
    const normalizedPath = jsonlPath.replace(/[/\\]/g, sep)
    const segments = normalizedPath.split(sep)
    const projectsIndex = segments.findIndex(segment => segment === 'projects')

    if (projectsIndex === -1 || projectsIndex + 1 >= segments.length) {
        return 'unknown'
    }

    return segments[projectsIndex + 1]?.trim() || 'unknown'
}

/**
 * Aggregates normalized Claude usage records into session-level summaries.
 *
 * @example
 * ```ts
 * const sessions = buildClaudeSessionSummaries(entries)
 * ```
 */
function buildClaudeSessionSummaries(entries: ClaudeUsageEntry[]) {
    const groups = new Map<string, ClaudeUsageEntry[]>()

    for (const entry of entries) {
        const key = `${entry.projectPath}/${entry.sessionId}`
        const group = groups.get(key) ?? []
        group.push(entry)
        groups.set(key, group)
    }

    return Array.from(groups.values()).map((sessionEntries) => {
        const sortedEntries = [...sessionEntries].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
        const firstEntry = sortedEntries[0]!
        const lastEntry = sortedEntries.at(-1)!
        const usageByModel = new Map<string, ClaudeModelUsageSummary>()
        let inputTokens = 0
        let cacheCreationTokens = 0
        let cacheReadTokens = 0
        let outputTokens = 0
        let costUSD = 0

        for (const entry of sortedEntries) {
            inputTokens += entry.inputTokens
            cacheCreationTokens += entry.cacheCreationTokens
            cacheReadTokens += entry.cacheReadTokens
            outputTokens += entry.outputTokens
            costUSD += entry.costUSD

            const modelUsage = usageByModel.get(entry.model) ?? {
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
                cachedInputTokens: 0,
                costUSD: 0,
                inputTokens: 0,
                outputTokens: 0,
                reasoningOutputTokens: 0,
                totalTokens: 0,
            }
            modelUsage.cacheCreationTokens += entry.cacheCreationTokens
            modelUsage.cacheReadTokens += entry.cacheReadTokens
            modelUsage.cachedInputTokens += entry.cacheCreationTokens + entry.cacheReadTokens
            modelUsage.costUSD += entry.costUSD
            modelUsage.inputTokens += entry.inputTokens
            modelUsage.outputTokens += entry.outputTokens
            modelUsage.totalTokens += getTotalTokens(entry)
            usageByModel.set(entry.model, modelUsage)
        }

        const models = Array.from(usageByModel.keys())
            .filter(model => model !== '<synthetic>')
            .sort((a, b) => a.localeCompare(b))
        const topModel = Array.from(usageByModel.entries())
            .filter(([model]) => model !== '<synthetic>')
            .sort((a, b) => b[1].totalTokens - a[1].totalTokens || a[0].localeCompare(b[0]))[0]?.[0] ?? 'unknown'
        const project = getProjectName(firstEntry.cwd, '') || decodeClaudeProjectPath(firstEntry.projectPath)

        return {
            cacheCreationTokens,
            cacheReadTokens,
            costUSD: roundCurrency(costUSD),
            durationMinutes: getDurationMinutes(firstEntry.timestamp, lastEntry.timestamp),
            inputTokens,
            lastActivity: lastEntry.timestamp,
            models,
            outputTokens,
            project,
            repository: `local/${project}`,
            sessionId: firstEntry.sessionId,
            startedAt: firstEntry.timestamp,
            threadName: `Session for ${project}`,
            tokenTotal: getTotalTokens({
                cacheCreationTokens,
                cacheReadTokens,
                inputTokens,
                outputTokens,
            }),
            topModel,
        }
    })
}

/**
 * Converts a Claude usage record into a shared aggregate event.
 *
 * @example
 * ```ts
 * const event = toClaudeAggregateEvent(entry)
 * ```
 */
function toClaudeAggregateEvent(entry: ClaudeUsageEntry): ClaudeAggregateEvent {
    const project = getProjectName(entry.cwd, '') || decodeClaudeProjectPath(entry.projectPath)

    return {
        cacheCreationTokens: entry.cacheCreationTokens,
        cacheReadTokens: entry.cacheReadTokens,
        cachedInputTokens: entry.cacheCreationTokens + entry.cacheReadTokens,
        costUSD: entry.costUSD,
        inputTokens: entry.inputTokens,
        isFallbackModel: entry.model === 'unknown',
        model: entry.model,
        outputTokens: entry.outputTokens,
        project,
        reasoningOutputTokens: 0,
        repository: `local/${project}`,
        sessionId: entry.sessionId,
        timestamp: entry.timestamp,
        totalTokens: getTotalTokens(entry),
    }
}

/**
 * Generates possible LiteLLM pricing lookup names for a Claude model.
 *
 * @example
 * ```ts
 * getClaudeLookupCandidates('anthropic/claude-sonnet-4-5')
 * ```
 */
function getClaudeLookupCandidates(model: string) {
    const normalizedModel = model.trim()

    return [
        normalizedModel,
        normalizedModel.replace(/-fast$/u, ''),
        normalizedModel.replace(/^anthropic\//u, ''),
        `anthropic/${normalizedModel}`,
        normalizedModel.replace(/^claude-3-5-/u, 'claude-'),
        normalizedModel.replace(/^claude-3-7-/u, 'claude-'),
    ]
}

/**
 * Calculates the total token count for a Claude Code record.
 *
 * @example
 * ```ts
 * getTotalTokens({ inputTokens: 10, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 2 })
 * // 17
 * ```
 */
function getTotalTokens(tokens: ClaudeTokenTotals) {
    return tokens.inputTokens + tokens.outputTokens + tokens.cacheCreationTokens + tokens.cacheReadTokens
}

/**
 * Decodes Claude Code's hyphen-encoded project path into a more readable project name.
 *
 * @example
 * ```ts
 * decodeClaudeProjectPath('-Users-me-work-usage-board')
 * // 'usage-board'
 * ```
 */
function decodeClaudeProjectPath(projectPath: string) {
    const normalized = projectPath.replace(/^-/, '').replace(/-/g, '/')
    const parts = normalized.split('/').filter(Boolean)

    return parts.at(-1) ?? projectPath
}
