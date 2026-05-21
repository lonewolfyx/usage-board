import type {
    DailyTokenUsage,
    LoadUsageResult,
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
    formatPercent,
    getDateKey,
    getDateKeyFromLabel,
    getPreviousDateKey,
    mergeDailyTokenUsage,
    mergeMonthlyModelUsage,
} from '#shared/utils/usage-dashboard'
import { computed } from 'vue'
import { usePayloadContext } from '~/composables/usePayloadContext'
import { EMPTY_LOAD_USAGE_RESULT } from '~/composables/usePayloadDashboard'

export function useUsageDashboard() {
    const { payload } = usePayloadContext()

    const dashboards = computed<LoadUsageResult[]>(() => {
        if (!payload.value) {
            return []
        }

        return PROJECT_USAGE_PLATFORMS.map(key => (payload.value![key] as LoadUsageResult | undefined) ?? EMPTY_LOAD_USAGE_RESULT)
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

function safeRatio(numerator: number, denominator: number) {
    return denominator > 0 ? numerator / denominator : 0
}
