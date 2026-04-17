import type {
    DailyTokenUsage,
    LoadUsageResult,
    ModelTokenUsage,
    MonthlyModelUsage,
    ProjectUsageItem,
    RankedUsageItem,
    UsageOverviewCard,
    UsageSessionUsageItem,
} from '#shared/types/usage-dashboard'
import type { ComputedRef } from 'vue'
import { computed } from 'vue'
import { usePayloadContext } from '~/composables/usePayloadContext'

const payloadDashboardKeys = ['claudeCode', 'codex', 'gemini'] as const

export function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(normalizeNumber(value))
}

export function formatCompactNumber(value: number) {
    return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(normalizeNumber(value))
}

export function formatPercent(value: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(normalizeNumber(value))
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

export function useUsageDashboard() {
    const { payload } = usePayloadContext()

    const dashboards = computed<LoadUsageResult[]>(() => {
        if (!payload.value) {
            return []
        }

        return payloadDashboardKeys.map(key => payload.value![key] as LoadUsageResult)
    })

    const sessionUsage = computed<UsageSessionUsageItem[]>(() => dashboards.value
        .flatMap((dashboard, dashboardIndex) => dashboard.sessionUsage.map(session => ({
            ...session,
            id: `${payloadDashboardKeys[dashboardIndex]}:${session.id}`,
            sessionId: `${payloadDashboardKeys[dashboardIndex]}:${session.sessionId}`,
        })))
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)))

    const dailyTokenUsage = computed<DailyTokenUsage[]>(() => mergeDailyTokenUsage(
        dashboards.value.flatMap(dashboard => dashboard.dailyTokenUsage),
    ))

    const monthlyModelUsage = computed<MonthlyModelUsage[]>(() => mergeMonthlyModelUsage(
        dashboards.value.flatMap(dashboard => dashboard.monthlyModelUsage),
    ))

    const projectUsage = computed<ProjectUsageItem[]>(() => buildProjectUsage(sessionUsage.value))

    const totalCost = computed(() => dailyTokenUsage.value.reduce((sum, item) => sum + item.costUSD, 0))
    const totalTokens = computed(() => dailyTokenUsage.value.reduce((sum, item) => sum + item.totalTokens, 0))
    const inputTokens = computed(() => dailyTokenUsage.value.reduce((sum, item) => sum + item.inputTokens, 0))
    const cachedInputTokens = computed(() => dailyTokenUsage.value.reduce((sum, item) => sum + item.cachedInputTokens, 0))
    const outputTokens = computed(() => dailyTokenUsage.value.reduce((sum, item) => sum + item.outputTokens, 0))
    const reasoningOutputTokens = computed(() => dailyTokenUsage.value.reduce((sum, item) => sum + item.reasoningOutputTokens, 0))
    const totalSessions = computed(() => sessionUsage.value.length)
    const todayDateKey = getDateKey(new Date())
    const previousDayDateKey = getPreviousDateKey(todayDateKey)
    const todayDailyUsage = computed(() => dailyTokenUsage.value.find(item => getDateKeyFromLabel(item.date) === todayDateKey))
    const previousDayDailyUsage = computed(() => dailyTokenUsage.value.find(item => getDateKeyFromLabel(item.date) === previousDayDateKey))
    const costGrowthTrend = computed(() => buildGrowthTrend(
        todayDailyUsage.value?.costUSD ?? 0,
        previousDayDailyUsage.value?.costUSD ?? 0,
        formatCurrency,
    ))
    const tokenGrowthTrend = computed(() => buildGrowthTrend(
        todayDailyUsage.value?.totalTokens ?? 0,
        previousDayDailyUsage.value?.totalTokens ?? 0,
        formatCompactNumber,
    ))

    const modelUsage: ComputedRef<RankedUsageItem[]> = computed(() => {
        const models = new Map<string, {
            activeDays: Set<string>
            costUSD: number
            inputTokens: number
            outputTokens: number
            totalTokens: number
        }>()

        for (const day of dailyTokenUsage.value) {
            for (const [name, usage] of Object.entries(day.models)) {
                const model = models.get(name) ?? {
                    activeDays: new Set<string>(),
                    costUSD: 0,
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0,
                }
                const tokenShare = day.totalTokens > 0 ? usage.totalTokens / day.totalTokens : 0
                model.activeDays.add(day.date)
                model.costUSD += day.costUSD * tokenShare
                model.inputTokens += usage.inputTokens
                model.outputTokens += usage.outputTokens
                model.totalTokens += usage.totalTokens
                models.set(name, model)
            }
        }

        return Array.from(models.entries())
            .map(([name, usage], index) => ({
                label: name,
                value: formatCurrency(usage.costUSD),
                detail: `${formatCompactNumber(usage.totalTokens)} tokens / ${usage.activeDays.size} active days`,
                percent: safeRatio(usage.costUSD, totalCost.value) * 100,
                tone: (index === 0 ? 'sky' : 'green') as RankedUsageItem['tone'],
            }))
            .sort((a, b) => b.percent - a.percent)
    })

    const efficiencyMetrics = computed<RankedUsageItem[]>(() => {
        const cacheHitRate = safeRatio(cachedInputTokens.value, inputTokens.value)
        const reasoningShare = safeRatio(reasoningOutputTokens.value, totalTokens.value)
        const outputShare = safeRatio(outputTokens.value, totalTokens.value)

        return [
            {
                label: 'Cache Hit Rate',
                value: formatPercent(cacheHitRate),
                detail: `${formatCompactNumber(cachedInputTokens.value)} cached input tokens`,
                percent: cacheHitRate * 100,
                tone: 'green',
            },
            {
                label: 'Reasoning Token Share',
                value: formatPercent(reasoningShare),
                detail: `${formatCompactNumber(reasoningOutputTokens.value)} reasoning output tokens`,
                percent: reasoningShare * 100,
                tone: 'amber',
            },
            {
                label: 'Output Token Share',
                value: formatPercent(outputShare),
                detail: `${formatCompactNumber(outputTokens.value)} output tokens`,
                percent: outputShare * 100,
                tone: 'sky',
            },
        ]
    })

    return {
        cachedInputTokens,
        costGrowthTrend,
        dailyTokenUsage,
        efficiencyMetrics,
        inputTokens,
        modelUsage,
        monthlyModelUsage,
        outputTokens,
        projectUsage,
        reasoningOutputTokens,
        sessionUsage,
        totalCost,
        totalSessions,
        totalTokens,
        tokenGrowthTrend,
    }
}

function mergeDailyTokenUsage(items: DailyTokenUsage[]) {
    const groups = new Map<string, {
        cachedInputTokens: number
        costUSD: number
        date: string
        inputTokens: number
        models: Map<string, ModelTokenUsage>
        outputTokens: number
        reasoningOutputTokens: number
        totalTokens: number
    }>()

    for (const item of items) {
        const dateKey = getDateKeyFromLabel(item.date)
        const group = groups.get(dateKey) ?? {
            cachedInputTokens: 0,
            costUSD: 0,
            date: formatDateLabelFromDateKey(dateKey, item.date),
            inputTokens: 0,
            models: new Map<string, ModelTokenUsage>(),
            outputTokens: 0,
            reasoningOutputTokens: 0,
            totalTokens: 0,
        }

        group.cachedInputTokens += item.cachedInputTokens
        group.costUSD += item.costUSD
        group.inputTokens += item.inputTokens
        group.outputTokens += item.outputTokens
        group.reasoningOutputTokens += item.reasoningOutputTokens
        group.totalTokens += item.totalTokens

        for (const [modelName, usage] of Object.entries(item.models)) {
            const model = group.models.get(modelName) ?? createEmptyModelUsage()
            model.cachedInputTokens += usage.cachedInputTokens
            model.inputTokens += usage.inputTokens
            model.isFallback = model.isFallback || usage.isFallback
            model.outputTokens += usage.outputTokens
            model.reasoningOutputTokens += usage.reasoningOutputTokens
            model.totalTokens += usage.totalTokens
            group.models.set(modelName, model)
        }

        groups.set(dateKey, group)
    }

    return Array.from(groups.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, group]) => ({
            cachedInputTokens: group.cachedInputTokens,
            costUSD: roundCurrency(group.costUSD),
            date: group.date,
            inputTokens: group.inputTokens,
            models: Object.fromEntries(group.models.entries()),
            outputTokens: group.outputTokens,
            reasoningOutputTokens: group.reasoningOutputTokens,
            totalTokens: group.totalTokens,
        }))
}

function mergeMonthlyModelUsage(items: MonthlyModelUsage[]) {
    const groups = new Map<string, MonthlyModelUsage>()

    for (const item of items) {
        const key = `${item.month}__${item.model}`
        const group = groups.get(key) ?? {
            model: item.model,
            month: item.month,
            tokenTotal: 0,
        }

        group.tokenTotal += item.tokenTotal
        groups.set(key, group)
    }

    return Array.from(groups.values())
        .sort((a, b) => a.month.localeCompare(b.month) || a.model.localeCompare(b.model))
}

function buildProjectUsage(sessionUsage: UsageSessionUsageItem[]) {
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

function createEmptyModelUsage(): ModelTokenUsage {
    return {
        cachedInputTokens: 0,
        inputTokens: 0,
        isFallback: false,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
    }
}

function getDateKeyFromLabel(label: string) {
    const date = new Date(label)

    if (Number.isNaN(date.getTime())) {
        return label
    }

    return getDateKey(date)
}

function getDateKey(date: Date) {
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')

    return `${year}-${month}-${day}`
}

function getPreviousDateKey(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(value => Number.parseInt(value, 10))
    const date = new Date(year || 0, (month || 1) - 1, day || 1)
    date.setDate(date.getDate() - 1)

    return getDateKey(date)
}

function formatDateLabelFromDateKey(dateKey: string, fallback: string) {
    const [year, month, day] = dateKey.split('-').map(value => Number.parseInt(value, 10))

    if (!year || !month || !day) {
        return fallback
    }

    const date = new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1))

    return new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
    }).format(date)
}

function safeRatio(numerator: number, denominator: number) {
    return denominator > 0 ? numerator / denominator : 0
}

function formatSignedPercent(value: number) {
    const prefix = value > 0 ? '+' : ''

    return `${prefix}${formatPercent(value)}`
}

function getTrendTone(value: number) {
    if (value > 0) {
        return 'up'
    }

    if (value < 0) {
        return 'down'
    }

    return 'neutral'
}

function normalizeNumber(value: number) {
    return Number.isFinite(value) ? value : 0
}

function roundCurrency(value: number) {
    return Math.round(value * 1_000_000) / 1_000_000
}
