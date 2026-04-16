import type {
    DailyTokenUsage,
    MonthlyModelUsage,
    ProjectUsageItem,
    TokenUsageRow,
    UsageOverviewCard,
    UsageSessionUsageItem,
    UsageTopModel,
    UsageTopProject,
} from '#shared/types/usage-dashboard'
import type {
    AggregateOptions,
    DailyUsageSummaryGroup,
    ModelUsageSummary,
    PeriodRowGroup,
    SessionAggregateGroup,
    SessionUsageOptions,
    SessionUsageSummaryLike,
    TokenUsageDelta,
    UsageAggregateEvent,
} from '~~/src/types'
import { readFileSync } from 'node:fs'

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
            continue
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
 * Summarizes session list items by project to build project ranking data.
 *
 * @example
 * ```ts
 * const projectUsage = buildProjectUsage(sessionUsage)
 * ```
 */
export function buildProjectUsage(sessionUsage: UsageSessionUsageItem[]): ProjectUsageItem[] {
    const projects = new Map<string, {
        costUSD: number
        repository: string
        sessions: number
        tokenTotal: number
    }>()

    for (const session of sessionUsage) {
        const project = projects.get(session.project) ?? {
            costUSD: 0,
            repository: session.repository,
            sessions: 0,
            tokenTotal: 0,
        }
        project.costUSD += session.costUSD
        project.sessions += 1
        project.tokenTotal += session.tokenTotal
        projects.set(session.project, project)
    }

    const maxCost = Math.max(...Array.from(projects.values()).map(project => project.costUSD), 0)

    return Array.from(projects.entries())
        .map(([label, project]) => ({
            costUSD: project.costUSD,
            detail: `${project.sessions} sessions / ${formatCompactNumber(project.tokenTotal)} tokens`,
            label,
            percent: maxCost > 0 ? (project.costUSD / maxCost) * 100 : 0,
            repository: project.repository,
            sessions: project.sessions,
            tokenTotal: project.tokenTotal,
            tone: 'amber' as const,
            value: formatCurrency(project.costUSD),
        }))
        .sort((a, b) => b.costUSD - a.costUSD)
}

/**
 * Builds overview card data for the dashboard home view.
 *
 * @example
 * ```ts
 * const cards = buildOverviewCards({
 *     cachedInputTokens: 100,
 *     sessionCount: 2,
 *     todayTopModel: null,
 *     todayTopProject: null,
 *     todayTotalCost: 0.01,
 *     todayTotalTokens: 1_000,
 * })
 * ```
 */
export function buildOverviewCards(options: {
    cachedInputTokens: number
    sessionCount: number
    todayTopModel: UsageTopModel | null
    todayTopProject: UsageTopProject | null
    todayTotalCost: number
    todayTotalTokens: number
}): UsageOverviewCard[] {
    return [
        {
            icon: 'solar:cpu-line-duotone',
            name: 'Today Tokens',
            trend: `${options.sessionCount} sessions`,
            trendTone: 'neutral',
            value: formatCompactNumber(options.todayTotalTokens),
        },
        {
            icon: 'lucide:wallet',
            name: 'Today Spend',
            trend: `${formatCompactNumber(options.cachedInputTokens)} cached`,
            trendTone: 'neutral',
            value: formatCurrency(options.todayTotalCost),
        },
        {
            icon: 'lucide:folder-git-2',
            name: 'Top Session Project',
            trend: options.todayTopProject ? `${options.todayTopProject.sessionCount} sessions` : 'No sessions',
            trendTone: 'up',
            value: options.todayTopProject?.project ?? 'No data',
        },
        {
            icon: 'lucide:bot',
            name: 'Top Invoked Model',
            trend: options.todayTopModel ? `${formatCompactNumber(options.todayTopModel.totalTokens)} tokens` : 'No usage',
            trendTone: 'up',
            value: options.todayTopModel?.model ?? 'No data',
        },
    ]
}

/**
 * Gets the active "today" date key, falling back to the latest date with data when real today is empty.
 *
 * @example
 * ```ts
 * const activeDateKey = getActiveDateKey(dailyGroups)
 * ```
 */
export function getActiveDateKey(dailyGroups: Map<string, DailyUsageSummaryGroup>) {
    const todayDateKey = getDateKey(new Date())

    if (dailyGroups.has(todayDateKey)) {
        return todayDateKey
    }

    return Array.from(dailyGroups.keys()).sort((a, b) => b.localeCompare(a))[0] ?? todayDateKey
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
 * Safely converts an unknown value to a number, returning 0 for non-finite values.
 *
 * @example
 * ```ts
 * normalizeNumber(Number.NaN)
 * // 0
 * ```
 */
export function normalizeNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
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
 * Gets a local date key in yyyy-MM-dd format.
 *
 * @example
 * ```ts
 * getDateKey(new Date('2026-04-16T08:00:00.000Z'))
 * // '2026-04-16'
 * ```
 */
export function getDateKey(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).formatToParts(date)
    const year = parts.find(part => part.type === 'year')?.value ?? '0000'
    const month = parts.find(part => part.type === 'month')?.value ?? '01'
    const day = parts.find(part => part.type === 'day')?.value ?? '01'

    return `${year}-${month}-${day}`
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
 * Formats a yyyy-MM-dd date key into an English display label.
 *
 * @example
 * ```ts
 * formatDateLabelFromDateKey('2026-04-16')
 * // 'Apr 16, 2026'
 * ```
 */
export function formatDateLabelFromDateKey(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(value => Number.parseInt(value, 10))
    const date = new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1))

    return new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
    }).format(date)
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
 * Formats a number with compact English notation.
 *
 * @example
 * ```ts
 * formatCompactNumber(1500)
 * // '1.5K'
 * ```
 */
export function formatCompactNumber(value: number) {
    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 1,
        notation: 'compact',
    }).format(value)
}

/**
 * Formats a number as a USD amount.
 *
 * @example
 * ```ts
 * formatCurrency(1.5)
 * // '$1.50'
 * ```
 */
export function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
        currency: 'USD',
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        style: 'currency',
    }).format(value)
}

/**
 * Removes empty strings while preserving unique item order.
 *
 * @example
 * ```ts
 * uniqueItems(['a', '', 'a', 'b'])
 * // ['a', 'b']
 * ```
 */
export function uniqueItems(items: string[]) {
    return Array.from(new Set(items.filter(Boolean)))
}

/**
 * Rounds a USD amount to 6 decimals to preserve precision for small token costs.
 *
 * @example
 * ```ts
 * roundCurrency(0.1234567)
 * // 0.123457
 * ```
 */
export function roundCurrency(value: number) {
    return Math.round(value * 1_000_000) / 1_000_000
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
