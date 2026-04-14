<template>
    <div class="grow container mx-auto space-y-8">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatisticalAnalysisTotalCard
                v-for="card in overviewCards"
                :key="card.name"
                :icon="card.icon"
                :name="card.name"
                :trend="card.trend"
                :trend-tone="card.trendTone"
                :value="card.value"
            />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatisticalAnalysisModelUsagePanel :monthly-items="monthlyModelUsage" />
            <StatisticalAnalysisProjectUsagePanel :items="projectUsage" />
            <StatisticalAnalysisTimeTrendPanel class="md:col-span-2" :items="dailyTokenUsage" />
            <StatisticalAnalysisSessionAnalysisPanel :items="sessionUsage" :total-sessions="totalSessions" />
            <StatisticalAnalysisEfficiencyCachePanel :daily-items="dailyTokenUsage" :items="efficiencyMetrics" />
            <StatisticalAnalysisTokensUsage />
        </div>
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { formatCompactNumber, formatCurrency, formatPercent, useUsageDashboard } from '~/composables/useUsageDashboard'

const {
    cachedInputTokens,
    dailyTokenUsage,
    efficiencyMetrics,
    inputTokens,
    monthlyModelUsage,
    projectUsage,
    sessionUsage,
    totalCost,
    totalSessions,
    totalTokens,
} = useUsageDashboard()

const overviewCards = computed(() => [
    {
        icon: 'lucide:wallet',
        name: 'Total Spend',
        trend: 'vs last week -12.4%',
        trendTone: 'down' as const,
        value: formatCurrency(totalCost.value),
    },
    {
        icon: 'solar:cpu-line-duotone',
        name: 'Token Usage',
        trend: 'this week -8.1%',
        trendTone: 'down' as const,
        value: formatCompactNumber(totalTokens.value),
    },
    {
        icon: 'lucide:database-zap',
        name: 'Cache Hit Rate',
        trend: 'cache efficiency +6.2%',
        trendTone: 'up' as const,
        value: formatPercent(cachedInputTokens.value / inputTokens.value),
    },
    {
        icon: 'lucide:receipt-text',
        name: 'Avg Session Cost',
        trend: `${totalSessions.value} sessions steady`,
        trendTone: 'neutral' as const,
        value: formatCurrency(totalCost.value / totalSessions.value),
    },
])
</script>

<style scoped>

</style>
