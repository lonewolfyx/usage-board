import type {
    AggregateOptions,
    DailyUsageSummaryGroup,
    GeminiSessionMessage,
    GeminiTokenSnapshot,
    ModelUsageSummary,
    PeriodRowGroup,
    RawUsage,
    SessionAggregateGroup,
    SessionUsageOptions,
    SessionUsageSummaryLike,
    TokenUsageDelta,
    TokenUsageSnapshot,
    UsageAggregateEvent,
} from '#shared/types/platform'
import type {
    DailyTokenUsage,
    LoadUsageResult,
    MonthlyModelUsage,
    TokenUsageRow,
    UsageOverviewCard,
    UsageSessionUsageItem,
    UsageTopModel,
    UsageTopProject,
} from '#shared/types/usage-dashboard'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, sep } from 'node:path'
import {
    buildGrowthTrend,
    buildProjectUsage,
    formatCompactNumber,
    formatCurrency,
    formatDateLabelFromDateKey,
    getDateKey,
    getPreviousDateKey,
    normalizeNumber,
    roundCurrency,
    uniqueItems,
} from '#shared/utils/usage-dashboard'
import { formatNumber } from '@lonewolfyx/utils'

/**
 * Reads a JSONL file while ignoring empty lines and malformed JSON lines.
 *
 * @example
 * ```ts
 * const lines = parseJsonlFile<SessionLogLine>('/path/to/session.jsonl')
 * ```
 */
export function parseJsonlFile<T = unknown>(filePath: string) {
    const content = readFileSync(filePath, 'utf8')

    if (!content.trim()) {
        return [] as T[]
    }

    const lines: T[] = []

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim()

        if (!line) {
            continue
        }

        try {
            lines.push(JSON.parse(line) as T)
        }
        catch {

        }
    }

    return lines
}

/**
 * Reads a JSON file and returns null when parsing fails.
 *
 * @example
 * ```ts
 * const data = parseJsonFile('/path/to/session.json')
 * ```
 */
export function parseJsonFile(filePath: string) {
    try {
        return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
    }
    catch {
        return null
    }
}

/**
 * Groups usage events by calendar day and totals tokens, cost, projects, models, and sessions.
 *
 * @example
 * ```ts
 * const dailyGroups = buildDailyUsageGroups(events)
 * const today = dailyGroups.get(getDateKey(new Date()))
 * ```
 */
export function buildDailyUsageGroups<TEvent extends UsageAggregateEvent>(
    events: TEvent[],
    options: AggregateOptions<TEvent> = {},
) {
    const groups = new Map<string, DailyUsageSummaryGroup>()

    for (const event of events) {
        const dateKey = getDateKey(new Date(event.timestamp))
        const displayLabel = formatDateLabelFromDateKey(dateKey)
        const group = groups.get(dateKey) ?? {
            ...createAggregateGroup(displayLabel),
            dateKey,
            displayLabel,
            modelUsage: new Map<string, ModelUsageSummary>(),
            sessionIds: new Set<string>(),
        }

        addEventToAggregateGroup(group, event, options)
        group.sessionIds.add(event.sessionId)
        group.sessionCount = group.sessionIds.size

        if (shouldIncludeModel(event, options)) {
            const modelUsage = group.modelUsage.get(event.model) ?? {
                ...createEmptyUsage(),
                isFallback: false,
            }
            addUsage(modelUsage, event)
            if (event.isFallbackModel) {
                modelUsage.isFallback = true
            }
            group.modelUsage.set(event.model, modelUsage)
        }
        groups.set(dateKey, group)
    }

    return groups
}

/**
 * Converts daily aggregate groups into daily token data for line or stacked charts.
 *
 * @example
 * ```ts
 * const chartRows = buildDailyTokenUsage(dailyGroups)
 * ```
 */
export function buildDailyTokenUsage(dailyGroups: Map<string, DailyUsageSummaryGroup>): DailyTokenUsage[] {
    return Array.from(dailyGroups.values())
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
        .map(group => ({
            cachedInputTokens: group.cachedInputTokens,
            costUSD: roundCurrency(group.costUSD),
            date: group.displayLabel,
            inputTokens: group.inputTokens,
            models: Object.fromEntries(Array.from(group.modelUsage.entries()).map(([model, usage]) => [model, {
                cachedInputTokens: usage.cachedInputTokens,
                inputTokens: usage.inputTokens,
                isFallback: usage.isFallback,
                outputTokens: usage.outputTokens,
                reasoningOutputTokens: usage.reasoningOutputTokens,
                totalTokens: usage.totalTokens,
            }])),
            outputTokens: group.outputTokens,
            reasoningOutputTokens: group.reasoningOutputTokens,
            totalTokens: group.totalTokens,
        }))
}

/**
 * Converts daily aggregate groups into table rows sorted by date descending.
 *
 * @example
 * ```ts
 * const rows = buildDailyRows(dailyGroups)
 * ```
 */
export function buildDailyRows(dailyGroups: Map<string, DailyUsageSummaryGroup>): TokenUsageRow[] {
    return Array.from(dailyGroups.values())
        .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
        .map(group => ({
            cachedInputTokens: group.cachedInputTokens,
            costUSD: roundCurrency(group.costUSD),
            id: group.dateKey,
            inputTokens: group.inputTokens,
            label: group.displayLabel,
            models: group.models,
            outputTokens: group.outputTokens,
            period: group.displayLabel,
            projects: group.projects,
            reasoningOutputTokens: group.reasoningOutputTokens,
            sessionCount: group.sessionCount,
            totalTokens: group.totalTokens,
        }))
}

/**
 * Aggregates events by week or month into shared token table rows.
 *
 * @example
 * ```ts
 * const weeklyRows = buildPeriodRows(events, 'week')
 * const monthlyRows = buildPeriodRows(events, 'month')
 * ```
 */
export function buildPeriodRows<TEvent extends UsageAggregateEvent>(
    events: TEvent[],
    periodType: 'month' | 'week',
    options: AggregateOptions<TEvent> = {},
): TokenUsageRow[] {
    const groups = new Map<string, PeriodRowGroup>()

    for (const event of events) {
        const eventDate = new Date(event.timestamp)
        const key = periodType === 'month'
            ? getMonthKey(eventDate)
            : getWeekLabel(eventDate)
        const label = periodType === 'month'
            ? formatMonthLabel(key)
            : key
        const group = groups.get(key) ?? {
            ...createAggregateGroup(label),
            sessionIds: new Set<string>(),
        }

        addEventToAggregateGroup(group, event, options)
        group.sessionIds.add(event.sessionId)
        groups.set(key, group)
    }

    return Array.from(groups.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, group]) => ({
            cachedInputTokens: group.cachedInputTokens,
            costUSD: roundCurrency(group.costUSD),
            id: key,
            inputTokens: group.inputTokens,
            label: group.label,
            models: group.models,
            outputTokens: group.outputTokens,
            period: group.label,
            projects: group.projects,
            reasoningOutputTokens: group.reasoningOutputTokens,
            sessionCount: group.sessionIds.size,
            totalTokens: group.totalTokens,
        }))
}

/**
 * Totals tokens by model for each month for model trend charts.
 *
 * @example
 * ```ts
 * const monthlyModelUsage = buildMonthlyModelUsage(events)
 * ```
 */
export function buildMonthlyModelUsage<TEvent extends UsageAggregateEvent>(
    events: TEvent[],
    options: Pick<AggregateOptions<TEvent>, 'includeModel'> = {},
): MonthlyModelUsage[] {
    const groups = new Map<string, {
        model: string
        month: string
        totalTokens: number
    }>()

    for (const event of events) {
        if (!shouldIncludeModel(event, options)) {
            continue
        }

        const month = getMonthKey(new Date(event.timestamp))
        const key = `${month}__${event.model}`
        const group = groups.get(key) ?? {
            model: event.model,
            month,
            totalTokens: 0,
        }
        group.totalTokens += event.totalTokens
        groups.set(key, group)
    }

    return Array.from(groups.values())
        .map(group => ({
            model: group.model,
            month: group.month,
            tokenTotal: group.totalTokens,
        }))
        .sort((a, b) => a.month.localeCompare(b.month) || a.model.localeCompare(b.model))
}

/**
 * Converts session summaries into session-level token table rows.
 *
 * @example
 * ```ts
 * const sessionRows = buildSessionRows(sessionSummaries)
 * ```
 */
export function buildSessionRows<TSession extends SessionUsageSummaryLike>(
    sessions: TSession[],
    options: SessionUsageOptions<TSession> = {},
): TokenUsageRow[] {
    return sessions.map(session => ({
        cachedInputTokens: getCachedInputTokens(session, options),
        costUSD: session.costUSD,
        id: session.sessionId,
        inputTokens: session.inputTokens,
        label: session.sessionId,
        models: session.models,
        outputTokens: session.outputTokens,
        period: formatDateLabelFromDateKey(getDateKey(new Date(session.lastActivity))),
        projects: [session.project],
        reasoningOutputTokens: getReasoningOutputTokens(session, options),
        sessionCount: 1,
        totalTokens: session.tokenTotal,
    }))
}

/**
 * Converts a session summary into a dashboard session list item.
 *
 * @example
 * ```ts
 * const item = toUsageSessionUsageItem(sessionSummary)
 * ```
 */
export function toUsageSessionUsageItem<TSession extends SessionUsageSummaryLike>(
    session: TSession,
    options: SessionUsageOptions<TSession> = {},
): UsageSessionUsageItem {
    const startedAtDate = new Date(session.startedAt)

    return {
        cachedInputTokens: getCachedInputTokens(session, options),
        costUSD: session.costUSD,
        date: formatDateLabelFromDateKey(getDateKey(startedAtDate)),
        duration: formatDuration(session.durationMinutes),
        durationMinutes: session.durationMinutes,
        id: session.sessionId,
        inputTokens: session.inputTokens,
        model: session.topModel,
        month: getMonthKey(startedAtDate),
        outputTokens: session.outputTokens,
        project: session.project,
        reasoningOutputTokens: getReasoningOutputTokens(session, options),
        repository: session.repository,
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        threadName: session.threadName,
        tokenTotal: session.tokenTotal,
        week: getWeekLabel(startedAtDate),
    }
}

/**
 * Builds overview card data for the dashboard home view.
 *
 * @example
 * ```ts
 * const cards = buildOverviewCards({
 *     previousDayCost: 0.01,
 *     previousDayTokens: 800,
 *     todayTopModel: null,
 *     todayTopProject: null,
 *     todayTotalCost: 0.01,
 *     todayTotalTokens: 1_000,
 * })
 * ```
 */
export function buildOverviewCards(options: {
    previousDayCost: number
    previousDayTokens: number
    todayTopModel: UsageTopModel | null
    todayTopProject: UsageTopProject | null
    todayTotalCost: number
    todayTotalTokens: number
}): UsageOverviewCard[] {
    const tokenTrend = buildGrowthTrend(options.todayTotalTokens, options.previousDayTokens, formatCompactNumber)
    const costTrend = buildGrowthTrend(options.todayTotalCost, options.previousDayCost, formatCurrency)

    return [
        {
            detail: `${formatNumber(options.todayTotalTokens)} tokens used today`,
            icon: 'solar:cpu-line-duotone',
            name: 'Today Tokens',
            trend: tokenTrend.trend,
            trendTone: tokenTrend.trendTone,
            value: formatCompactNumber(options.todayTotalTokens),
        },
        {
            detail: `${formatCurrency(options.todayTotalCost)} spent today`,
            icon: 'lucide:wallet',
            name: 'Today Spend',
            trend: costTrend.trend,
            trendTone: costTrend.trendTone,
            value: formatCurrency(options.todayTotalCost),
        },
        {
            detail: options.todayTopProject
                ? `${options.todayTopProject.project} with ${formatNumber(options.todayTopProject.sessionCount)} sessions today`
                : 'No project sessions recorded today',
            icon: 'lucide:folder-git-2',
            name: 'Top Session Project',
            trend: options.todayTopProject ? `${options.todayTopProject.sessionCount} sessions` : 'No sessions',
            trendTone: 'up',
            value: options.todayTopProject?.project ?? '-',
        },
        {
            detail: options.todayTopModel
                ? `${options.todayTopModel.model} with ${formatNumber(options.todayTopModel.totalTokens)} tokens today`
                : 'No model usage recorded today',
            icon: 'lucide:bot',
            name: 'Top Invoked Model',
            trend: options.todayTopModel ? `${formatCompactNumber(options.todayTopModel.totalTokens)} tokens` : 'No usage',
            trendTone: 'up',
            value: options.todayTopModel?.model ?? '-',
        },
    ]
}

/**
 * Builds a complete dashboard usage result from normalized events and session summaries.
 *
 * @example
 * ```ts
 * const usage = buildLoadUsageResult(events, sessionSummaries)
 * ```
 */
export function buildLoadUsageResult<
    TEvent extends UsageAggregateEvent,
    TSession extends SessionUsageSummaryLike,
>(
    events: TEvent[],
    sessions: TSession[],
    options: {
        aggregateOptions?: AggregateOptions<TEvent>
        sessionOptions?: SessionUsageOptions<TSession>
    } = {},
): LoadUsageResult {
    const aggregateOptions = options.aggregateOptions ?? {}
    const sessionOptions = options.sessionOptions ?? {}
    const sessionUsage = sessions.map(session => toUsageSessionUsageItem(session, sessionOptions))
    const dailyGroups = buildDailyUsageGroups(events, aggregateOptions)
    const todayDateKey = getDateKey(new Date())
    const previousDayDateKey = getPreviousDateKey(todayDateKey)
    const todayDailyGroup = dailyGroups.get(todayDateKey)
    const previousDayDailyGroup = dailyGroups.get(previousDayDateKey)
    const todayDailyGroups = todayDailyGroup
        ? new Map([[todayDateKey, todayDailyGroup]])
        : new Map()
    const todayEvents = events.filter(event => getDateKey(new Date(event.timestamp)) === todayDateKey)
    const todayTotalTokens = todayDailyGroup?.totalTokens ?? 0
    const todayTotalCost = roundCurrency(todayDailyGroup?.costUSD ?? 0)
    const todayTopProject = getTopProjectForDate(todayEvents)
    const todayTopModel = getTopModelForDate(todayEvents, aggregateOptions)

    return {
        dailyRows: buildDailyRows(todayDailyGroups),
        dailyTokenUsage: buildDailyTokenUsage(dailyGroups),
        monthlyModelUsage: buildMonthlyModelUsage(events, aggregateOptions),
        monthlyRows: buildPeriodRows(events, 'month', aggregateOptions),
        overviewCards: buildOverviewCards({
            previousDayCost: roundCurrency(previousDayDailyGroup?.costUSD ?? 0),
            previousDayTokens: previousDayDailyGroup?.totalTokens ?? 0,
            todayTopModel,
            todayTopProject,
            todayTotalCost,
            todayTotalTokens,
        }),
        projectUsage: buildProjectUsage(sessionUsage),
        sessionRows: buildSessionRows(sessions, sessionOptions),
        sessionUsage,
        todayTopModel,
        todayTopProject,
        todayTotalCost,
        todayTotalTokens,
        weeklyRows: buildPeriodRows(events, 'week', aggregateOptions),
    }
}

/**
 * Finds the project with the highest session count in a set of events.
 *
 * @example
 * ```ts
 * const topProject = getTopProjectForDate(todayEvents)
 * ```
 */
export function getTopProjectForDate<TEvent extends UsageAggregateEvent>(events: TEvent[]): UsageTopProject | null {
    const projects = new Map<string, Set<string>>()

    for (const event of events) {
        const sessions = projects.get(event.project) ?? new Set<string>()
        sessions.add(event.sessionId)
        projects.set(event.project, sessions)
    }

    const topProject = Array.from(projects.entries())
        .map(([project, sessions]) => ({ project, sessionCount: sessions.size }))
        .sort((a, b) => b.sessionCount - a.sessionCount || a.project.localeCompare(b.project))[0]

    return topProject ?? null
}

/**
 * Finds the model with the highest token total in a set of events.
 *
 * @example
 * ```ts
 * const topModel = getTopModelForDate(todayEvents)
 * ```
 */
export function getTopModelForDate<TEvent extends UsageAggregateEvent>(
    events: TEvent[],
    options: Pick<AggregateOptions<TEvent>, 'includeModel'> = {},
): UsageTopModel | null {
    const models = new Map<string, number>()

    for (const event of events) {
        if (!shouldIncludeModel(event, options)) {
            continue
        }

        models.set(event.model, (models.get(event.model) ?? 0) + event.totalTokens)
    }

    const topModel = Array.from(models.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]

    return topModel
        ? {
                model: topModel[0],
                totalTokens: topModel[1],
            }
        : null
}

/**
 * Creates an empty aggregate group for accumulating tokens, projects, models, and sessions.
 *
 * @example
 * ```ts
 * const group = createAggregateGroup('Apr 16, 2026')
 * ```
 */
export function createAggregateGroup(label: string): SessionAggregateGroup {
    return {
        cachedInputTokens: 0,
        costUSD: 0,
        inputTokens: 0,
        label,
        models: [],
        outputTokens: 0,
        projects: [],
        reasoningOutputTokens: 0,
        sessionCount: 0,
        totalTokens: 0,
    }
}

/**
 * Creates a usage object where every token field starts at zero.
 *
 * @example
 * ```ts
 * const usage = createEmptyUsage()
 * ```
 */
export function createEmptyUsage(): TokenUsageDelta {
    return {
        cachedInputTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
    }
}

/**
 * Adds one usage object into a target usage object.
 *
 * @example
 * ```ts
 * const total = createEmptyUsage()
 * addUsage(total, event)
 * ```
 */
export function addUsage(target: TokenUsageDelta, usage: TokenUsageDelta) {
    target.inputTokens += usage.inputTokens
    target.cachedInputTokens += usage.cachedInputTokens
    target.outputTokens += usage.outputTokens
    target.reasoningOutputTokens += usage.reasoningOutputTokens
    target.totalTokens += usage.totalTokens
}

/**
 * Checks whether every usage field is zero.
 *
 * @example
 * ```ts
 * isZeroUsage(createEmptyUsage())
 * // true
 * ```
 */
export function isZeroUsage(usage: TokenUsageDelta) {
    return usage.inputTokens === 0
        && usage.cachedInputTokens === 0
        && usage.outputTokens === 0
        && usage.reasoningOutputTokens === 0
        && usage.totalTokens === 0
}

/**
 * Derives a session name from the first user message or summary, truncating long text.
 *
 * @example
 * ```ts
 * getThreadName('Refactor the dashboard', 'usage-board')
 * // 'Refactor the dashboard'
 * ```
 */
export function getThreadName(message: string, project: string, summary?: string) {
    const firstLine = message
        .split('\n')
        .map(line => line.trim())
        .find(line => line && !line.startsWith('<'))
        ?? summary?.trim()

    if (!firstLine) {
        return `Session for ${project}`
    }

    return firstLine.length > 96 ? `${firstLine.slice(0, 93)}...` : firstLine
}

/**
 * Extracts a project name from a filesystem path.
 *
 * @example
 * ```ts
 * getProjectName('/Users/me/work/usage-board')
 * // 'usage-board'
 * ```
 */
export function getProjectName(path: string | undefined, fallback = 'unknown') {
    if (!path) {
        return fallback
    }

    const parts = path.split('/').filter(Boolean)

    return parts.at(-1) ?? fallback
}

/**
 * Normalizes a Git remote URL into owner/repo form.
 *
 * @example
 * ```ts
 * normalizeRepositoryUrl('git@github.com:lonewolfyx/usage-board.git')
 * // 'lonewolfyx/usage-board'
 * ```
 */
export function normalizeRepositoryUrl(repositoryUrl: string | undefined) {
    if (!repositoryUrl) {
        return ''
    }

    return repositoryUrl
        .replace(/^git@[^:]+:/u, '')
        .replace(/^https?:\/\/[^/]+\//u, '')
        .replace(/\.git$/u, '')
}

/**
 * Calculates minutes between two ISO timestamps, returning 0 for invalid or reversed ranges.
 *
 * @example
 * ```ts
 * getDurationMinutes('2026-04-16T10:00:00.000Z', '2026-04-16T10:45:00.000Z')
 * // 45
 * ```
 */
export function getDurationMinutes(startedAt: string, endedAt?: string | null) {
    if (!endedAt) {
        return 0
    }

    const durationMs = Date.parse(endedAt) - Date.parse(startedAt)

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return 0
    }

    return Math.round(durationMs / 60_000)
}

/**
 * Safely converts a string timestamp into an ISO string.
 *
 * @example
 * ```ts
 * toIsoString('2026-04-16 18:00:00')
 * ```
 */
export function toIsoString(value: unknown) {
    if (typeof value !== 'string') {
        return null
    }

    const timestamp = Date.parse(value)

    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

/**
 * Gets a month key in yyyy-MM format.
 *
 * @example
 * ```ts
 * getMonthKey(new Date('2026-04-16'))
 * // '2026-04'
 * ```
 */
export function getMonthKey(date: Date) {
    return getDateKey(date).slice(0, 7)
}

/**
 * Gets a week label where Monday is the start and Sunday is the end.
 *
 * @example
 * ```ts
 * getWeekLabel(new Date('2026-04-16'))
 * // '2026-04-13 - 2026-04-19'
 * ```
 */
export function getWeekLabel(date: Date) {
    const weekStart = cloneDate(date)
    const day = weekStart.getDay()
    const diff = day === 0 ? -6 : 1 - day
    weekStart.setDate(weekStart.getDate() + diff)

    const weekEnd = cloneDate(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    return `${getDateKey(weekStart)} - ${getDateKey(weekEnd)}`
}

/**
 * Formats a yyyy-MM month key into an English display label.
 *
 * @example
 * ```ts
 * formatMonthLabel('2026-04')
 * // 'Apr 2026'
 * ```
 */
export function formatMonthLabel(monthKey: string) {
    const [year, month] = monthKey.split('-').map(value => Number.parseInt(value, 10))
    const date = new Date(Date.UTC(year || 0, (month || 1) - 1, 1))

    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
    }).format(date)
}

/**
 * Formats a minute count into compact duration text.
 *
 * @example
 * ```ts
 * formatDuration(125)
 * // '2h 5m'
 * ```
 */
export function formatDuration(minutes: number) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60

    if (hours === 0) {
        return `${remainingMinutes}m`
    }

    if (remainingMinutes === 0) {
        return `${hours}h`
    }

    return `${hours}h ${remainingMinutes}m`
}

/**
 * Normalizes a raw Codex token snapshot into a complete RawUsage shape.
 *
 * @example
 * ```ts
 * const rawUsage = normalizeRawUsage({ input_tokens: 100, output_tokens: 20 })
 * ```
 */
export function normalizeRawUsage(usage: TokenUsageSnapshot | null | undefined): RawUsage | null {
    if (!usage) {
        return null
    }

    const input = normalizeNumber(usage.input_tokens)
    const cachedInput = normalizeNumber(usage.cached_input_tokens ?? usage.cache_read_input_tokens)
    const output = normalizeNumber(usage.output_tokens)
    const reasoning = normalizeNumber(usage.reasoning_output_tokens)
    const total = normalizeNumber(usage.total_tokens)

    return {
        cached_input_tokens: cachedInput,
        input_tokens: input,
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
export function subtractRawUsage(current: RawUsage, previous: RawUsage | null): RawUsage {
    return {
        cached_input_tokens: Math.max(current.cached_input_tokens - (previous?.cached_input_tokens ?? 0), 0),
        input_tokens: Math.max(current.input_tokens - (previous?.input_tokens ?? 0), 0),
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
 * const delta = convertCodexRawUsage({ input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 0, total_tokens: 110 })
 * ```
 */
export function convertCodexRawUsage(rawUsage: RawUsage): TokenUsageDelta {
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
 * Converts a Gemini token snapshot into the dashboard's normalized token fields.
 *
 * @example
 * ```ts
 * const usage = convertGeminiTokenUsage({ input: 100, cached: 20, output: 10 })
 * ```
 */
export function convertGeminiTokenUsage(tokens: GeminiTokenSnapshot): TokenUsageDelta {
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
 * Extracts a model name from several possible payload locations.
 *
 * @example
 * ```ts
 * extractModelName({ info: { model: 'gpt-5-codex' } })
 * // 'gpt-5-codex'
 * ```
 */
export function extractModelName(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') {
        return undefined
    }

    const record = value as Record<string, unknown>
    const info = getObjectRecord(record.info)
    const metadata = getObjectRecord(record.metadata)
    const infoMetadata = getObjectRecord(info?.metadata)
    const candidates = [
        record.model,
        record.model_name,
        info?.model,
        info?.model_name,
        infoMetadata?.model,
        metadata?.model,
    ]

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim() !== '') {
            return candidate.trim()
        }
    }

    return undefined
}

/**
 * Extracts the project path segment from a Claude Code project log path.
 *
 * @example
 * ```ts
 * extractClaudeProjectFromPath('/Users/me/.claude/projects/-Users-me-work-app/session.jsonl')
 * // '-Users-me-work-app'
 * ```
 */
export function extractClaudeProjectFromPath(jsonlPath: string) {
    const normalizedPath = jsonlPath.replace(/[/\\]/g, sep)
    const segments = normalizedPath.split(sep)
    const projectsIndex = segments.findIndex(segment => segment === 'projects')

    if (projectsIndex === -1 || projectsIndex + 1 >= segments.length) {
        return 'unknown'
    }

    return segments[projectsIndex + 1]?.trim() || 'unknown'
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
export function decodeClaudeProjectPath(projectPath: string) {
    const normalized = projectPath.replace(/^-/, '').replace(/-/g, '/')
    const parts = normalized.split('/').filter(Boolean)

    return parts.at(-1) ?? projectPath
}

/**
 * Generates possible LiteLLM pricing lookup names for a Claude model.
 *
 * @example
 * ```ts
 * getClaudeLookupCandidates('anthropic/claude-sonnet-4-5')
 * ```
 */
export function getClaudeLookupCandidates(model: string) {
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
 * Generates possible LiteLLM pricing lookup names for a Gemini model.
 *
 * @example
 * ```ts
 * getGeminiLookupCandidates('google/gemini-2.5-pro')
 * ```
 */
export function getGeminiLookupCandidates(model: string) {
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
 * Checks whether an OpenRouter model name represents a free model.
 *
 * @example
 * ```ts
 * isOpenRouterFreeModel('openrouter/qwen/qwen3-coder:free')
 * // true
 * ```
 */
export function isOpenRouterFreeModel(model: string) {
    const normalizedModel = model.trim().toLowerCase()

    return normalizedModel === 'openrouter/free'
        || (normalizedModel.startsWith('openrouter/') && normalizedModel.endsWith(':free'))
}

/**
 * Reads the real project root from the .project_root file beside the Gemini cache directory.
 *
 * @example
 * ```ts
 * getGeminiProjectRoot('/home/me/.gemini/tmp/hash/chats/session-1.json')
 * ```
 */
export function getGeminiProjectRoot(filePath: string) {
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
 * getGeminiProjectKeyFromPath('/home/me/.gemini/tmp/project-key/chats/session-1.json')
 * // 'project-key'
 * ```
 */
export function getGeminiProjectKeyFromPath(filePath: string) {
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
 * getRepositoryNameFromProjectRoot('/Users/me/work/usage-board')
 * ```
 */
export function getRepositoryNameFromProjectRoot(projectRoot: string) {
    if (!projectRoot) {
        return ''
    }

    const gitConfigPath = `${projectRoot}/.git/config`

    if (!existsSync(gitConfigPath)) {
        return ''
    }

    try {
        return normalizeRepositoryUrl(getOriginUrlFromGitConfig(readFileSync(gitConfigPath, 'utf8')))
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
export function getOriginUrlFromGitConfig(config: string) {
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
 * Converts Gemini message content into plain text.
 *
 * @example
 * ```ts
 * extractGeminiMessageText([{ text: 'hello' }, { text: 'world' }])
 * // 'hello\nworld'
 * ```
 */
export function extractGeminiMessageText(content: GeminiSessionMessage['content']) {
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

/**
 * Adds a single event into an aggregate group and updates model and project lists.
 *
 * @example
 * ```ts
 * addEventToAggregateGroup(group, event, {})
 * ```
 */
function addEventToAggregateGroup<TEvent extends UsageAggregateEvent>(
    group: SessionAggregateGroup,
    event: TEvent,
    options: AggregateOptions<TEvent>,
) {
    group.inputTokens += event.inputTokens
    group.cachedInputTokens += event.cachedInputTokens
    group.outputTokens += event.outputTokens
    group.reasoningOutputTokens += event.reasoningOutputTokens
    group.totalTokens += event.totalTokens
    group.costUSD += getEventCostUSD(event, options)
    group.models = shouldIncludeModel(event, options) ? uniqueItems([...group.models, event.model]) : group.models
    group.projects = uniqueItems([...group.projects, event.project])
}

/**
 * Gets event cost, preferring a platform-provided dynamic cost function.
 *
 * @example
 * ```ts
 * const costUSD = getEventCostUSD(event, { getCostUSD: item => item.costUSD ?? 0 })
 * ```
 */
function getEventCostUSD<TEvent extends UsageAggregateEvent>(event: TEvent, options: AggregateOptions<TEvent>) {
    return options.getCostUSD?.(event) ?? event.costUSD ?? 0
}

/**
 * Checks whether an event's model should be included in model-level stats.
 *
 * @example
 * ```ts
 * shouldIncludeModel(event, { includeModel: item => item.model !== '<synthetic>' })
 * ```
 */
function shouldIncludeModel<TEvent extends UsageAggregateEvent>(
    event: TEvent,
    options: Pick<AggregateOptions<TEvent>, 'includeModel'>,
) {
    return options.includeModel?.(event) ?? true
}

/**
 * Gets a session's cached input token count, allowing platform-specific accessors.
 *
 * @example
 * ```ts
 * const cached = getCachedInputTokens(session, {})
 * ```
 */
function getCachedInputTokens<TSession extends SessionUsageSummaryLike>(
    session: TSession,
    options: SessionUsageOptions<TSession>,
) {
    return options.getCachedInputTokens?.(session)
        ?? getNumericProperty(session, 'cachedInputTokens')
}

/**
 * Gets a session's reasoning output token count, allowing platform-specific accessors.
 *
 * @example
 * ```ts
 * const reasoning = getReasoningOutputTokens(session, {})
 * ```
 */
function getReasoningOutputTokens<TSession extends SessionUsageSummaryLike>(
    session: TSession,
    options: SessionUsageOptions<TSession>,
) {
    return options.getReasoningOutputTokens?.(session)
        ?? getNumericProperty(session, 'reasoningOutputTokens')
}

/**
 * Safely reads a numeric property from an object.
 *
 * @example
 * ```ts
 * getNumericProperty({ cachedInputTokens: 10 }, 'cachedInputTokens')
 * // 10
 * ```
 */
function getNumericProperty(value: object, key: string) {
    const record = value as Record<string, unknown>
    const property = record[key]

    return typeof property === 'number' && Number.isFinite(property) ? property : 0
}

function getObjectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/**
 * Clones only the year, month, and day parts of a Date to avoid mutating the input instance.
 *
 * @example
 * ```ts
 * const cloned = cloneDate(new Date())
 * ```
 */
function cloneDate(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
