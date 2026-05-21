import type {
    DailyTokenUsage,
    LoadUsageResult,
    ModelTokenUsage,
    MonthlyModelUsage,
    RankedUsageItem,
    UsageSessionUsageItem,
} from '#shared/types/usage-dashboard'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import {
    buildGrowthTrend,
    buildProjectUsage,
    formatCompactNumber,
    formatCurrency,
    formatDateLabelFromDateKey,
    formatPercent,
    getDateKey,
    getDateKeyFromLabel,
    getPreviousDateKey,
    roundCurrency,
} from '#shared/utils/usage-dashboard'
import { computed } from 'vue'
import { usePayloadContext } from '~/composables/usePayloadContext'

export function useUsageDashboard() {
    const { payload } = usePayloadContext()

    const dashboards = computed<LoadUsageResult[]>(() => {
        if (!payload.value) {
            return []
        }

        return PROJECT_USAGE_PLATFORMS.map(key => payload.value![key] as LoadUsageResult)
    })

    const sessionUsage = computed<UsageSessionUsageItem[]>(() => dashboards.value
        .flatMap((dashboard, dashboardIndex) => dashboard.sessionUsage.map(session => ({
            ...session,
            id: `${PROJECT_USAGE_PLATFORMS[dashboardIndex]}:${session.id}`,
            sessionId: `${PROJECT_USAGE_PLATFORMS[dashboardIndex]}:${session.sessionId}`,
        })))
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)))

    const dailyTokenUsage = computed<DailyTokenUsage[]>(() => mergeDailyTokenUsage(
        dashboards.value.flatMap(dashboard => dashboard.dailyTokenUsage),
    ))

    const monthlyModelUsage = computed<MonthlyModelUsage[]>(() => mergeMonthlyModelUsage(
        dashboards.value.flatMap(dashboard => dashboard.monthlyModelUsage),
    ))

    const projectUsage = computed(() => buildProjectUsage(sessionUsage.value))

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
        monthlyModelUsage,
        projectUsage,
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
        .sort((a, b) => b[0].localeCompare(a[0]))
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

function safeRatio(numerator: number, denominator: number) {
    return denominator > 0 ? numerator / denominator : 0
}
