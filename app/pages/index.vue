<template>
    <DashboardPage>
        <DashboardOverviewCards :cards="overviewCards" />

        <DashboardPanelGrid>
            <StatisticalAnalysisModelUsagePanel :monthly-items="monthlyModelUsage" class="md:col-span-8" />
            <StatisticalAnalysisProjectUsagePanel :items="projectUsage" class="md:col-span-4" />
            <UsageHeatmapPanel
                :items="dailyTokenUsage"
                class="md:col-span-12"
                heat-metric="cost"
                title="Usage Trend"
            />
            <StatisticalAnalysisSessionAnalysisPanel
                :items="sessionUsage" :total-sessions="totalSessions"
                class="md:col-span-6"
            />
            <StatisticalAnalysisEfficiencyCachePanel
                :daily-items="dailyTokenUsage" :items="efficiencyMetrics"
                class="md:col-span-6"
            />
            <StatisticalAnalysisTokensUsagePanel class="md:col-span-12" />
        </DashboardPanelGrid>
    </DashboardPage>
</template>

<script lang="ts" setup>
import { formatNumber } from '@lonewolfyx/utils'

const {
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
} = useUsageDashboard()

const overviewCards = computed(() => [
    {
        detail: `${formatCurrency(totalCost.value)} total spend across all tools`,
        icon: 'lucide:wallet',
        name: 'Total Spend',
        trend: costGrowthTrend.value.trend,
        trendTone: costGrowthTrend.value.trendTone,
        value: formatCurrency(totalCost.value),
    },
    {
        detail: `${formatNumber(totalTokens.value)} total tokens across all tools`,
        icon: 'solar:cpu-line-duotone',
        name: 'Token Usage',
        trend: tokenGrowthTrend.value.trend,
        trendTone: tokenGrowthTrend.value.trendTone,
        value: formatCompactNumber(totalTokens.value),
    },
    {
        detail: `${formatNumber(cachedInputTokens.value)} of ${formatNumber(inputTokens.value)} input tokens were served from cache`,
        icon: 'lucide:database-zap',
        name: 'Cache Hit Rate',
        trend: `${formatCompactNumber(cachedInputTokens.value)} cached`,
        trendTone: 'neutral' as const,
        value: formatPercent(inputTokens.value > 0 ? cachedInputTokens.value / inputTokens.value : 0),
    },
    {
        detail: `${formatCurrency(totalCost.value)} across ${formatNumber(totalSessions.value)} sessions`,
        icon: 'lucide:receipt-text',
        name: 'Avg Session Cost',
        trend: 'across all tools',
        trendTone: 'neutral' as const,
        value: formatCurrency(totalSessions.value > 0 ? totalCost.value / totalSessions.value : 0),
    },
])
</script>
