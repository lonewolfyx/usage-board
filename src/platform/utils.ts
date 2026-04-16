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
    DailyUsageSummaryGroup,
    ModelUsageSummary,
    PeriodRowGroup,
    SessionAggregateGroup,
    TokenUsageDelta,
} from '~~/src/types'
import { readFileSync } from 'node:fs'

interface UsageAggregateEvent extends TokenUsageDelta {
    costUSD?: number
    isFallbackModel: boolean
    model: string
    project: string
    repository: string
    sessionId: string
    timestamp: string
}

interface AggregateOptions<TEvent extends UsageAggregateEvent> {
    getCostUSD?: (event: TEvent) => number
    includeModel?: (event: TEvent) => boolean
}

interface SessionUsageSummaryLike {
    costUSD: number
    durationMinutes: number
    inputTokens: number
    lastActivity: string
    models: string[]
    outputTokens: number
    project: string
    repository: string
    sessionId: string
    startedAt: string
    threadName: string
    tokenTotal: number
    topModel: string
}

interface SessionUsageOptions<TSession extends SessionUsageSummaryLike> {
    getCachedInputTokens?: (session: TSession) => number
    getReasoningOutputTokens?: (session: TSession) => number
}

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

export function parseJsonFile(filePath: string) {
    try {
        return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
    }
    catch {
        return null
    }
}

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

export function getActiveDateKey(dailyGroups: Map<string, DailyUsageSummaryGroup>) {
    const todayDateKey = getDateKey(new Date())

    if (dailyGroups.has(todayDateKey)) {
        return todayDateKey
    }

    return Array.from(dailyGroups.keys()).sort((a, b) => b.localeCompare(a))[0] ?? todayDateKey
}

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

export function createEmptyUsage(): TokenUsageDelta {
    return {
        cachedInputTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
    }
}

export function addUsage(target: TokenUsageDelta, usage: TokenUsageDelta) {
    target.inputTokens += usage.inputTokens
    target.cachedInputTokens += usage.cachedInputTokens
    target.outputTokens += usage.outputTokens
    target.reasoningOutputTokens += usage.reasoningOutputTokens
    target.totalTokens += usage.totalTokens
}

export function isZeroUsage(usage: TokenUsageDelta) {
    return usage.inputTokens === 0
        && usage.cachedInputTokens === 0
        && usage.outputTokens === 0
        && usage.reasoningOutputTokens === 0
        && usage.totalTokens === 0
}

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

export function getProjectName(path: string | undefined, fallback = 'unknown') {
    if (!path) {
        return fallback
    }

    const parts = path.split('/').filter(Boolean)

    return parts.at(-1) ?? fallback
}

export function normalizeRepositoryUrl(repositoryUrl: string | undefined) {
    if (!repositoryUrl) {
        return ''
    }

    return repositoryUrl
        .replace(/^git@[^:]+:/u, '')
        .replace(/^https?:\/\/[^/]+\//u, '')
        .replace(/\.git$/u, '')
}

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

export function normalizeNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function toIsoString(value: unknown) {
    if (typeof value !== 'string') {
        return null
    }

    const timestamp = Date.parse(value)

    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

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

export function getMonthKey(date: Date) {
    return getDateKey(date).slice(0, 7)
}

export function getWeekLabel(date: Date) {
    const weekStart = cloneDate(date)
    const day = weekStart.getDay()
    const diff = day === 0 ? -6 : 1 - day
    weekStart.setDate(weekStart.getDate() + diff)

    const weekEnd = cloneDate(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    return `${getDateKey(weekStart)} - ${getDateKey(weekEnd)}`
}

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

export function formatMonthLabel(monthKey: string) {
    const [year, month] = monthKey.split('-').map(value => Number.parseInt(value, 10))
    const date = new Date(Date.UTC(year || 0, (month || 1) - 1, 1))

    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
    }).format(date)
}

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

export function formatCompactNumber(value: number) {
    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 1,
        notation: 'compact',
    }).format(value)
}

export function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
        currency: 'USD',
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        style: 'currency',
    }).format(value)
}

export function uniqueItems(items: string[]) {
    return Array.from(new Set(items.filter(Boolean)))
}

export function roundCurrency(value: number) {
    return Math.round(value * 1_000_000) / 1_000_000
}

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

function getEventCostUSD<TEvent extends UsageAggregateEvent>(event: TEvent, options: AggregateOptions<TEvent>) {
    return options.getCostUSD?.(event) ?? event.costUSD ?? 0
}

function shouldIncludeModel<TEvent extends UsageAggregateEvent>(
    event: TEvent,
    options: Pick<AggregateOptions<TEvent>, 'includeModel'>,
) {
    return options.includeModel?.(event) ?? true
}

function getCachedInputTokens<TSession extends SessionUsageSummaryLike>(
    session: TSession,
    options: SessionUsageOptions<TSession>,
) {
    return options.getCachedInputTokens?.(session)
        ?? getNumericProperty(session, 'cachedInputTokens')
}

function getReasoningOutputTokens<TSession extends SessionUsageSummaryLike>(
    session: TSession,
    options: SessionUsageOptions<TSession>,
) {
    return options.getReasoningOutputTokens?.(session)
        ?? getNumericProperty(session, 'reasoningOutputTokens')
}

function getNumericProperty(value: object, key: string) {
    const record = value as Record<string, unknown>
    const property = record[key]

    return typeof property === 'number' && Number.isFinite(property) ? property : 0
}

function cloneDate(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
