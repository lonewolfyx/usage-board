import type {
    ProjectUsageItem,
    TokenUsageRow,
    TrendTone,
    UsageOverviewCard,
    UsageSessionUsageItem,
} from '#shared/types/usage-dashboard'

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
})

const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
})

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
})

const dateLabelFormatter = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
})

export function normalizeNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function roundCurrency(value: number) {
    return Math.round(value * 1_000_000) / 1_000_000
}

export function uniqueItems(items: string[]) {
    return Array.from(new Set(items.filter(Boolean)))
}

export function formatCompactNumber(value: number) {
    return compactNumberFormatter.format(normalizeNumber(value))
}

export function formatCurrency(value: number) {
    return currencyFormatter.format(normalizeNumber(value))
}

export function formatPercent(value: number) {
    return percentFormatter.format(normalizeNumber(value))
}

export function buildGrowthTrend(
    currentValue: number,
    previousValue: number,
    formatValue: (value: number) => string,
): Pick<UsageOverviewCard, 'trend' | 'trendTone'> {
    const current = Math.max(normalizeNumber(currentValue), 0)
    const previous = Math.max(normalizeNumber(previousValue), 0)

    if (previous === 0) {
        if (current === 0) {
            return {
                trend: '0.0%',
                trendTone: 'neutral',
            }
        }

        return {
            trend: `+${formatValue(current)}`,
            trendTone: 'up',
        }
    }

    const ratio = (current - previous) / previous

    return {
        trend: formatSignedPercent(ratio),
        trendTone: getTrendTone(ratio),
    }
}

export function getDateKey(date: Date) {
    const parts = dateKeyFormatter.formatToParts(date)
    const year = parts.find(part => part.type === 'year')?.value ?? '0000'
    const month = parts.find(part => part.type === 'month')?.value ?? '01'
    const day = parts.find(part => part.type === 'day')?.value ?? '01'

    return `${year}-${month}-${day}`
}

export function getDateKeyFromLabel(label: string) {
    const date = new Date(label)

    if (Number.isNaN(date.getTime())) {
        return label
    }

    return getDateKey(date)
}

export function getPreviousDateKey(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(value => Number.parseInt(value, 10))
    const date = new Date(year || 0, (month || 1) - 1, day || 1)
    date.setDate(date.getDate() - 1)

    return getDateKey(date)
}

export function formatDateLabelFromDateKey(dateKey: string, fallback = dateKey) {
    const [year, month, day] = dateKey.split('-').map(value => Number.parseInt(value, 10))

    if (!year || !month || !day) {
        return fallback
    }

    return dateLabelFormatter.format(new Date(Date.UTC(year, month - 1, day)))
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

export function buildSessionDailyRows(sessionUsage: UsageSessionUsageItem[]): TokenUsageRow[] {
    const groups = new Map<string, TokenUsageRow>()

    for (const session of sessionUsage) {
        const id = getDateKeyFromLabel(session.date)
        const group = groups.get(id) ?? {
            cachedInputTokens: 0,
            costUSD: 0,
            id,
            inputTokens: 0,
            label: session.date,
            models: [],
            outputTokens: 0,
            period: session.date,
            projects: [],
            reasoningOutputTokens: 0,
            sessionCount: 0,
            totalTokens: 0,
        }

        group.cachedInputTokens += session.cachedInputTokens
        group.costUSD += session.costUSD
        group.inputTokens += session.inputTokens
        group.models = uniqueItems([...group.models, session.model])
        group.outputTokens += session.outputTokens
        group.projects = uniqueItems([...group.projects, session.project])
        group.reasoningOutputTokens += session.reasoningOutputTokens
        group.sessionCount += 1
        group.totalTokens += session.tokenTotal
        groups.set(id, group)
    }

    return Array.from(groups.values()).sort((a, b) => b.id.localeCompare(a.id))
}

function formatSignedPercent(value: number) {
    const prefix = value > 0 ? '+' : ''

    return `${prefix}${formatPercent(value)}`
}

function getTrendTone(value: number): TrendTone {
    if (value > 0) {
        return 'up'
    }

    if (value < 0) {
        return 'down'
    }

    return 'neutral'
}
