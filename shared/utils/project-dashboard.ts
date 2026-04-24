import type {
    ProjectDashboardPlatformKey,
    ProjectDashboardPlatformMeta,
    ProjectDashboardPlatformTab,
    ProjectDashboardTab,
    ProjectLineSeries,
    ProjectSessionListItem,
    ProjectSessionSummary,
    ProjectSessionTableRow,
    ProjectTokenUsageRow,
    ProjectUsageSummary,
} from '#shared/types/project-dashboard'
import type { DailyTokenUsage, UsageOverviewCard } from '#shared/types/usage-dashboard'
import {
    buildGrowthTrend,
    buildPercentTrend,
    formatCompactNumber,
    formatCurrency,
    formatDate,
    formatDateLabelFromDateKey,
    formatPercent,
    getDateKey,
    uniqueItems,
} from '#shared/utils/usage-dashboard'
import { formatNumber } from '@lonewolfyx/utils'

const modelSeriesColors = ['#2563eb', '#f97316', '#0891b2', '#7c3aed', '#16a34a', '#dc2626', '#64748b']
const projectPlatformOrder = ['claudeCode', 'codex', 'gemini'] satisfies ProjectDashboardPlatformKey[]

const projectPlatformMetaMap = {
    claudeCode: {
        aiIcon: 'claude_code',
        color: '#d97757',
        label: 'Claude Code',
    },
    codex: {
        aiIcon: 'codex',
        color: '#111827',
        label: 'Codex',
    },
    gemini: {
        aiIcon: 'gemini',
        color: '#0ea5e9',
        label: 'Gemini',
    },
} satisfies Record<ProjectDashboardPlatformKey, ProjectDashboardPlatformMeta>

export const projectPlatformTabs = projectPlatformOrder.map(value => ({
    ...projectPlatformMetaMap[value],
    value,
})) satisfies ProjectDashboardPlatformTab[]

const projectPlatformTabMap = Object.fromEntries(
    projectPlatformTabs.map(tab => [tab.value, tab]),
) as Record<ProjectDashboardPlatformKey, ProjectDashboardPlatformTab>

export const projectDashboardTabs = [
    { label: 'All', value: 'all' },
    ...projectPlatformTabs,
] satisfies ProjectDashboardTab[]

export function getProjectPlatform(platform: ProjectDashboardPlatformKey): ProjectDashboardPlatformTab {
    return projectPlatformTabMap[platform]
}

export function buildRecentDateLabels(days: number) {
    const today = new Date()

    return Array.from({ length: days }, (_, index) => {
        const date = new Date(today)
        date.setHours(0, 0, 0, 0)
        date.setDate(today.getDate() - (days - 1 - index))

        return formatDateLabelFromDateKey(getDateKey(date))
    })
}

export function buildMonthlyTickIndexes(labels: string[]) {
    return labels
        .map((label, index) => ({ date: new Date(label), index }))
        .filter(({ date, index }) => {
            if (index === 0 || index === labels.length - 1) {
                return true
            }

            return Number.isFinite(date.getTime()) && date.getUTCDate() === 1
        })
        .map(({ index }) => index)
}

export function buildProjectOverviewCards(sessions: ProjectSessionListItem[]): UsageOverviewCard[] {
    const summary = summarizeProjectUsage(sessions)

    return [
        {
            detail: `${formatNumber(summary.totalTokens)} total tokens in this project`,
            icon: 'solar:cpu-line-duotone',
            name: 'Total Tokens',
            trend: 'project total',
            trendTone: 'neutral',
            value: formatCompactNumber(summary.totalTokens),
        },
        {
            detail: `${formatCurrency(summary.costUSD)} total project spend`,
            icon: 'lucide:wallet',
            name: 'Total Spend',
            trend: 'all time',
            trendTone: 'neutral',
            value: formatCurrency(summary.costUSD),
        },
        {
            detail: `${formatNumber(summary.sessions)} sessions across all tools`,
            icon: 'lucide:messages-square',
            name: 'Sessions',
            trend: 'all tools',
            trendTone: 'neutral',
            value: String(summary.sessions),
        },
        {
            detail: `${formatNumber(summary.cachedInputTokens)} of ${formatNumber(summary.inputTokens)} input tokens were served from cache`,
            icon: 'lucide:database-zap',
            name: 'Cache Hit Rate',
            trend: `${formatCompactNumber(summary.cachedInputTokens)} cached`,
            trendTone: 'neutral',
            value: formatPercent(summary.inputTokens > 0 ? summary.cachedInputTokens / summary.inputTokens : 0),
        },
        {
            detail: `${formatCurrency(summary.costUSD)} across ${formatNumber(summary.sessions)} sessions`,
            icon: 'lucide:circle-dollar-sign',
            name: 'Avg Session Cost',
            trend: 'per session',
            trendTone: 'neutral',
            value: formatCurrency(summary.sessions > 0 ? summary.costUSD / summary.sessions : 0),
        },
    ]
}

export function buildProjectPlatformOverviewCards(
    sessions: ProjectSessionListItem[],
    dailyItems: DailyTokenUsage[],
): UsageOverviewCard[] {
    const summary = summarizeProjectUsage(sessions)
    const [todayLabel = '', yesterdayLabel = ''] = buildRecentDateLabels(2).slice().reverse()
    const todayUsage = dailyItems.find(item => item.date === todayLabel)
    const yesterdayUsage = dailyItems.find(item => item.date === yesterdayLabel)
    const todaySessions = countSessionsByDate(sessions, todayLabel)
    const yesterdaySessions = countSessionsByDate(sessions, yesterdayLabel)
    const tokenTrend = buildGrowthTrend(todayUsage?.totalTokens ?? 0, yesterdayUsage?.totalTokens ?? 0, formatCompactNumber)
    const costTrend = buildGrowthTrend(todayUsage?.costUSD ?? 0, yesterdayUsage?.costUSD ?? 0, formatCurrency)
    const sessionTrend = buildPercentTrend(todaySessions, yesterdaySessions)

    return [
        {
            detail: `${formatNumber(todayUsage?.totalTokens ?? 0)} tokens used today`,
            icon: 'solar:cpu-line-duotone',
            name: 'Today Tokens',
            trend: tokenTrend.trend,
            trendTone: tokenTrend.trendTone,
            value: formatCompactNumber(todayUsage?.totalTokens ?? 0),
        },
        {
            detail: `${formatCurrency(todayUsage?.costUSD ?? 0)} spent today`,
            icon: 'lucide:wallet',
            name: 'Today Spend',
            trend: costTrend.trend,
            trendTone: costTrend.trendTone,
            value: formatCurrency(todayUsage?.costUSD ?? 0),
        },
        {
            detail: `${formatNumber(todaySessions)} sessions recorded today`,
            icon: 'lucide:messages-square',
            name: 'Today Sessions',
            trend: sessionTrend.label,
            trendTone: sessionTrend.tone,
            value: String(todaySessions),
        },
        {
            detail: `${formatCurrency(summary.costUSD)} total project spend`,
            icon: 'lucide:receipt-text',
            name: 'Total Spend',
            trend: 'all time',
            trendTone: 'neutral',
            value: formatCurrency(summary.costUSD),
        },
        {
            detail: `${formatNumber(summary.sessions)} total sessions for this platform`,
            icon: 'lucide:list-checks',
            name: 'Sessions',
            trend: 'project total',
            trendTone: 'neutral',
            value: String(summary.sessions),
        },
        {
            detail: `${formatNumber(summary.cachedInputTokens)} of ${formatNumber(summary.inputTokens)} input tokens were served from cache`,
            icon: 'lucide:database-zap',
            name: 'Cache Hit Rate',
            trend: `${formatCompactNumber(summary.cachedInputTokens)} cached`,
            trendTone: 'neutral',
            value: formatPercent(summary.inputTokens > 0 ? summary.cachedInputTokens / summary.inputTokens : 0),
        },
        {
            detail: `${formatCurrency(summary.costUSD)} across ${formatNumber(summary.sessions)} sessions`,
            icon: 'lucide:circle-dollar-sign',
            name: 'Avg Session Cost',
            trend: 'per session',
            trendTone: 'neutral',
            value: formatCurrency(summary.sessions > 0 ? summary.costUSD / summary.sessions : 0),
        },
    ]
}

export function buildProjectDailyModelUsageChart(items: DailyTokenUsage[], labels: string[]) {
    const labelSet = new Set(labels)
    const visibleItems = items.filter(item => labelSet.has(item.date))
    const models = uniqueItems(visibleItems.flatMap(item => Object.keys(item.models)))
        .map(model => ({
            model,
            totalTokens: visibleItems.reduce((sum, item) => sum + (item.models[model]?.totalTokens ?? 0), 0),
        }))
        .sort((a, b) => b.totalTokens - a.totalTokens || a.model.localeCompare(b.model))
        .map(item => item.model)
    const series = models.map((model, index): ProjectLineSeries => ({
        color: modelSeriesColors[index % modelSeriesColors.length]!,
        label: model,
        points: labels.map(label => items.find(item => item.date === label)?.models[model]?.totalTokens ?? 0),
    }))

    return { labels, series }
}

export function toProjectDisplayDailyUsageRows(
    items: DailyTokenUsage[],
    sessions: ProjectSessionListItem[],
): ProjectTokenUsageRow[] {
    const sessionCountByDate = buildSessionCountByDate(sessions)

    return items.map(item => ({
        cacheTokens: formatNumber(item.cachedInputTokens),
        cost: formatCurrency(item.costUSD),
        inputTokens: formatNumber(item.inputTokens),
        label: item.date,
        models: Object.keys(item.models).sort((a, b) => a.localeCompare(b)).join(', ') || '-',
        outputTokens: formatNumber(item.outputTokens),
        reasoningTokens: formatNumber(item.reasoningOutputTokens),
        sessions: String(sessionCountByDate.get(item.date) ?? 0),
        tokens: formatNumber(item.totalTokens),
    }))
}

export function toProjectSessionTableRows(
    sessions: ProjectSessionListItem[],
    platform: ProjectDashboardPlatformKey,
): ProjectSessionTableRow[] {
    return sessions.map(session => ({
        cacheTokens: formatNumber(session.cachedInputTokens),
        cost: formatCurrency(session.costUSD),
        duration: session.duration || '-',
        id: `${platform}:${session.sessionId}`,
        inputTokens: formatNumber(session.inputTokens),
        model: session.models?.join(', ') || session.model || 'unknown',
        outputTokens: formatNumber(session.outputTokens),
        platform,
        reasoningTokens: formatNumber(session.reasoningOutputTokens),
        sessionId: session.sessionId,
        startedAt: formatSafeProjectDate(session.startedAt),
        threadName: session.threadName,
        tokens: formatNumber(session.tokenTotal),
    }))
}

export function summarizeProjectUsage(sessions: ProjectSessionListItem[]): ProjectUsageSummary {
    return sessions.reduce((summary, session) => ({
        cachedInputTokens: summary.cachedInputTokens + session.cachedInputTokens,
        costUSD: summary.costUSD + session.costUSD,
        inputTokens: summary.inputTokens + session.inputTokens,
        outputTokens: summary.outputTokens + session.outputTokens,
        reasoningOutputTokens: summary.reasoningOutputTokens + session.reasoningOutputTokens,
        sessions: summary.sessions + 1,
        totalTokens: summary.totalTokens + session.tokenTotal,
    }), {
        cachedInputTokens: 0,
        costUSD: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        sessions: 0,
        totalTokens: 0,
    })
}

export function summarizeProjectSessions(sessions: ProjectSessionListItem[]): ProjectSessionSummary {
    return sessions.reduce((summary, session) => ({
        costUSD: summary.costUSD + session.costUSD,
        sessions: summary.sessions + 1,
        totalTokens: summary.totalTokens + session.tokenTotal,
    }), {
        costUSD: 0,
        sessions: 0,
        totalTokens: 0,
    })
}

export function buildSessionCountByDate(sessions: ProjectSessionListItem[]) {
    return sessions.reduce((counts, session) => {
        const dateLabel = getProjectSessionDateLabel(session.startedAt)

        if (!dateLabel) {
            return counts
        }

        counts.set(dateLabel, (counts.get(dateLabel) ?? 0) + 1)

        return counts
    }, new Map<string, number>())
}

export function getProjectSessionDateLabel(value: string) {
    if (!value) {
        return ''
    }

    const date = new Date(value)

    if (!Number.isFinite(date.getTime())) {
        return ''
    }

    return formatDateLabelFromDateKey(getDateKey(date))
}

export function formatSafeProjectDate(value: string) {
    if (!value) {
        return '-'
    }

    const date = new Date(value)

    if (!Number.isFinite(date.getTime())) {
        return '-'
    }

    return formatDate(date)
}

function countSessionsByDate(sessions: ProjectSessionListItem[], dateLabel: string) {
    return sessions.filter(session => getProjectSessionDateLabel(session.startedAt) === dateLabel).length
}
