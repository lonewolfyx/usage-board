import type {
    DailySessionGroup,
    LineSeries,
    MockSession,
    PeriodSessionGroup,
    SessionTableRow,
    TokenUsageRow,
    UsageSummary,
    UsageSummarySource,
} from '#shared/typed/project-dashboard'
import {
    formatCompactNumber,
    formatCurrency,
    formatDate,
    formatDateTime,
    uniqueItems,
} from '#shared/utils/usage-dashboard'

export function summarizeSessions<TSession extends UsageSummarySource>(items: TSession[]): UsageSummary {
    const tokens = items.reduce((sum, session) => sum + session.tokens, 0)
    const cacheTokens = items.reduce((sum, session) => sum + session.cacheTokens, 0)

    return {
        cacheRate: tokens > 0 ? cacheTokens / tokens : 0,
        cacheTokens,
        cost: items.reduce((sum, session) => sum + session.cost, 0),
        inputTokens: items.reduce((sum, session) => sum + session.inputTokens, 0),
        outputTokens: items.reduce((sum, session) => sum + session.outputTokens, 0),
        reasoningTokens: items.reduce((sum, session) => sum + session.reasoningTokens, 0),
        sessions: items.length,
        tokens,
    }
}

export function toTokenUsageRow(label: string, items: MockSession[]): TokenUsageRow {
    const summary = summarizeSessions(items)

    return {
        cacheTokens: formatCompactNumber(summary.cacheTokens),
        cost: formatCurrency(summary.cost),
        inputTokens: formatCompactNumber(summary.inputTokens),
        label,
        models: uniqueItems(items.map(session => session.model)).join(', ') || '-',
        outputTokens: formatCompactNumber(summary.outputTokens),
        reasoningTokens: formatCompactNumber(summary.reasoningTokens),
        sessions: String(summary.sessions),
        tokens: formatCompactNumber(summary.tokens),
    }
}

export function toSessionRows(items: MockSession[]): SessionTableRow[] {
    return items
        .slice()
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
        .map(session => ({
            cacheTokens: formatCompactNumber(session.cacheTokens),
            cost: formatCurrency(session.cost),
            duration: session.duration,
            id: session.id,
            inputTokens: formatCompactNumber(session.inputTokens),
            model: session.model,
            outputTokens: formatCompactNumber(session.outputTokens),
            platform: session.platform,
            reasoningTokens: formatCompactNumber(session.reasoningTokens),
            startedAt: formatDateTime(session.startedAt),
            title: session.title,
            tokens: formatCompactNumber(session.tokens),
        }))
}

export function buildProjectDailyRows(items: MockSession[]): DailySessionGroup[] {
    return Array.from({ length: 30 }, (_, index) => {
        const date = new Date(Date.UTC(2026, 3, 22 - (29 - index)))
        const key = date.toISOString().slice(0, 10)

        return {
            items: items.filter(session => session.startedAt.startsWith(key)),
            key,
            label: formatDate(date),
            shortLabel: new Intl.DateTimeFormat('en-US', { day: '2-digit', timeZone: 'UTC' }).format(date),
        }
    })
}

export function buildProjectDailyModelSeries(items: MockSession[], rows: DailySessionGroup[]): LineSeries[] {
    const models = uniqueItems(items.map(session => session.model))
    const colors = ['#2563eb', '#f97316', '#0891b2', '#8b5cf6', '#059669', '#f43f5e']

    return models.map((model, index) => ({
        color: colors[index % colors.length] ?? '#2563eb',
        label: model,
        points: rows.map(row => summarizeSessions(row.items.filter(session => session.model === model)).tokens),
    }))
}

export function buildProjectWeekRows(items: MockSession[]): PeriodSessionGroup[] {
    return [
        {
            items: items.filter(session => Date.parse(session.startedAt) >= Date.parse('2026-04-16T00:00:00.000Z')),
            label: 'Current Period',
        },
        {
            items: items.filter(session => Date.parse(session.startedAt) < Date.parse('2026-04-16T00:00:00.000Z')),
            label: 'Previous Period',
        },
    ]
}

export function buildProjectMonthRows(items: MockSession[]): PeriodSessionGroup[] {
    const groups = new Map<string, MockSession[]>()

    for (const session of items) {
        const label = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            timeZone: 'UTC',
            year: 'numeric',
        }).format(new Date(session.startedAt))
        groups.set(label, [...(groups.get(label) ?? []), session])
    }

    return Array.from(groups.entries()).map(([label, grouped]) => ({
        items: grouped,
        label,
    }))
}
